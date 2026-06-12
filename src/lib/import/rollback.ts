import { Prisma, PrismaClient } from '@prisma/client'

const prisma = new PrismaClient()

export const ROLLBACK_BLOCKED_BY_ADJUSTMENT_REFERENCES =
  'ROLLBACK_BLOCKED_BY_ADJUSTMENT_REFERENCES'

const MAX_AFFECTED_SLOT_IDS = 20

export interface RollbackReferenceSummary {
  blockingSlotCount: number
  blockingReferenceCount: number
  referenceTypes: Record<string, number>
  affectedSlotIds: number[]
}

export interface RollbackPlan {
  batchId: number
  batchStatus: string
  canRollback: boolean
  blockingReasons: string[]
  blockingCode: string | null
  blockingSlotCount: number
  blockingReferenceCount: number
  referenceTypes: Record<string, number>
  affectedSlotIds: number[]
  warnings: string[]

  scheduleSlotsToDelete: number
  teachingTaskClassesToDelete: number
  teachingTasksToDelete: number

  retainedClassGroups: number
  retainedTeachers: number
  retainedCourses: number
  retainedRooms: number

  importedTaskCount: number
  importedSlotCount: number
  externalSlotsForImportedTasks: number
  hasPlaceholderTeachers: boolean
  hasPlaceholderRooms: boolean
  hasOrphanSlots: boolean
}

export interface RollbackSimulationResult {
  batchId: number
  simulated: boolean
  canRollback: boolean
  blockingReasons: string[]
  warnings: string[]

  deletedScheduleSlots: number
  deletedTeachingTaskClasses: number
  deletedTeachingTasks: number

  retainedClassGroups: number
  retainedTeachers: number
  retainedCourses: number
  retainedRooms: number
}

class RollbackSignal {
  constructor(public readonly result: RollbackSimulationResult) {}
}

export class RollbackBlockedBySlotReferencesError extends Error {
  readonly code = ROLLBACK_BLOCKED_BY_ADJUSTMENT_REFERENCES

  constructor(public readonly summary: RollbackReferenceSummary) {
    super(
      `Rollback blocked: ${summary.blockingReferenceCount} adjustment or audit references ` +
      `exist for ${summary.blockingSlotCount} ScheduleSlots`
    )
    this.name = 'RollbackBlockedBySlotReferencesError'
  }
}

export interface RollbackResult {
  batchId: number
  rolledBack: boolean
  deletedScheduleSlots: number
  deletedTeachingTaskClasses: number
  deletedTeachingTasks: number
  retainedClassGroups: number
  retainedTeachers: number
  retainedCourses: number
  retainedRooms: number
  warnings: string[]
}

type RollbackGuardClient = Pick<
  PrismaClient | Prisma.TransactionClient,
  'scheduleSlot' | 'scheduleAdjustment' | 'scheduleAdjustmentRequest' | 'schedulerRunChange'
>

async function inspectRollbackSlotReferences(
  client: RollbackGuardClient,
  batchId: number,
): Promise<RollbackReferenceSummary> {
  const slots = await client.scheduleSlot.findMany({
    where: { importBatchId: batchId },
    select: { id: true },
  })
  const slotIds = slots.map((slot) => slot.id)

  if (slotIds.length === 0) {
    return {
      blockingSlotCount: 0,
      blockingReferenceCount: 0,
      referenceTypes: {},
      affectedSlotIds: [],
    }
  }

  const [adjustments, adjustmentRequests, schedulerRunChanges] = await Promise.all([
    client.scheduleAdjustment.findMany({
      where: { originalSlotId: { in: slotIds } },
      select: { originalSlotId: true },
    }),
    client.scheduleAdjustmentRequest.findMany({
      where: { sourceScheduleSlotId: { in: slotIds } },
      select: { sourceScheduleSlotId: true },
    }),
    client.schedulerRunChange.findMany({
      where: { scheduleSlotId: { in: slotIds } },
      select: { scheduleSlotId: true },
    }),
  ])

  const referenceTypes: Record<string, number> = {}
  const affectedSlotIdSet = new Set<number>()

  if (adjustments.length > 0) {
    referenceTypes.ScheduleAdjustment = adjustments.length
    for (const item of adjustments) affectedSlotIdSet.add(item.originalSlotId)
  }
  if (adjustmentRequests.length > 0) {
    referenceTypes.ScheduleAdjustmentRequest = adjustmentRequests.length
    for (const item of adjustmentRequests) affectedSlotIdSet.add(item.sourceScheduleSlotId)
  }
  if (schedulerRunChanges.length > 0) {
    referenceTypes.SchedulerRunChange = schedulerRunChanges.length
    for (const item of schedulerRunChanges) affectedSlotIdSet.add(item.scheduleSlotId)
  }

  const affectedSlotIds = Array.from(affectedSlotIdSet)
    .sort((a, b) => a - b)
    .slice(0, MAX_AFFECTED_SLOT_IDS)

  return {
    blockingSlotCount: affectedSlotIdSet.size,
    blockingReferenceCount:
      adjustments.length + adjustmentRequests.length + schedulerRunChanges.length,
    referenceTypes,
    affectedSlotIds,
  }
}

function throwIfRollbackReferencesExist(summary: RollbackReferenceSummary): void {
  if (summary.blockingReferenceCount > 0) {
    throw new RollbackBlockedBySlotReferencesError(summary)
  }
}

export async function buildRollbackPlan(batchId: number): Promise<RollbackPlan> {
  const batch = await prisma.importBatch.findUnique({
    where: { id: batchId },
    select: {
      id: true,
      status: true,
    },
  })

  if (!batch) {
    return {
      batchId,
      batchStatus: 'NOT_FOUND',
      canRollback: false,
      blockingReasons: [`Batch #${batchId} not found`],
      blockingCode: null,
      blockingSlotCount: 0,
      blockingReferenceCount: 0,
      referenceTypes: {},
      affectedSlotIds: [],
      warnings: [],
      scheduleSlotsToDelete: 0,
      teachingTaskClassesToDelete: 0,
      teachingTasksToDelete: 0,
      retainedClassGroups: 0,
      retainedTeachers: 0,
      retainedCourses: 0,
      retainedRooms: 0,
      importedTaskCount: 0,
      importedSlotCount: 0,
      externalSlotsForImportedTasks: 0,
      hasPlaceholderTeachers: false,
      hasPlaceholderRooms: false,
      hasOrphanSlots: false,
    }
  }

  const blockingReasons: string[] = []
  const warnings: string[] = []

  // Only confirmed batch can be rolled back
  const hasRollbackableStatus = batch.status === 'confirmed'
  if (!hasRollbackableStatus) {
    blockingReasons.push(
      `Batch status is "${batch.status}", only "confirmed" batches can be rolled back`
    )
  }

  const referenceSummary = await inspectRollbackSlotReferences(prisma, batchId)
  if (referenceSummary.blockingReferenceCount > 0) {
    blockingReasons.push(
      `Rollback is blocked because ${referenceSummary.blockingReferenceCount} adjustment or audit references ` +
      `exist for ${referenceSummary.blockingSlotCount} ScheduleSlots`
    )
  }
  const canRollback =
    hasRollbackableStatus && referenceSummary.blockingReferenceCount === 0

  // Count imported TeachingTasks and ScheduleSlots
  const [importedTaskCount, importedSlotCount] = await Promise.all([
    prisma.teachingTask.count({ where: { importBatchId: batchId } }),
    prisma.scheduleSlot.count({ where: { importBatchId: batchId } }),
  ])

  // Count TeachingTaskClasses for imported tasks
  const teachingTaskClassesToDelete = await prisma.teachingTaskClass.count({
    where: {
      teachingTask: { importBatchId: batchId },
    },
  })

  // Check external slots for imported tasks
  const importedTaskIds = await prisma.teachingTask
    .findMany({ where: { importBatchId: batchId }, select: { id: true } })
    .then((tasks) => tasks.map((t) => t.id))

  const externalSlotsForImportedTasks = await prisma.scheduleSlot.count({
    where: {
      teachingTaskId: { in: importedTaskIds },
      NOT: { importBatchId: batchId },
    },
  })

  if (externalSlotsForImportedTasks > 0) {
    warnings.push(
      `${externalSlotsForImportedTasks} external ScheduleSlots exist for imported TeachingTasks. Deleting these tasks will also remove those slots.`
    )
  }

  // Check placeholder teachers/rooms
  const [placeholderTeacherCount, placeholderRoomCount] = await Promise.all([
    prisma.teacher.count({ where: { name: { contains: '待定' } } }),
    prisma.room.count({ where: { name: { contains: '待定' } } }),
  ])
  const hasPlaceholderTeachers = placeholderTeacherCount > 0
  const hasPlaceholderRooms = placeholderRoomCount > 0

  // Check orphan slots
  const allTaskIds = await prisma.teachingTask
    .findMany({ select: { id: true } })
    .then((tasks) => tasks.map((t) => t.id))
  const orphanSlotCount = await prisma.scheduleSlot.count({
    where: {
      importBatchId: batchId,
      teachingTaskId: { notIn: allTaskIds },
    },
  })
  const hasOrphanSlots = orphanSlotCount > 0
  if (hasOrphanSlots) {
    warnings.push(`Batch has ${orphanSlotCount} orphan ScheduleSlots with invalid teachingTaskId references.`)
  }

  // Retained counts (shared data that won't be deleted)
  const [retainedClassGroups, retainedTeachers, retainedCourses, retainedRooms] = await Promise.all([
    prisma.classGroup.count(),
    prisma.teacher.count(),
    prisma.course.count(),
    prisma.room.count(),
  ])

  return {
    batchId: batch.id,
    batchStatus: batch.status,
    canRollback,
    blockingReasons,
    blockingCode:
      referenceSummary.blockingReferenceCount > 0
        ? ROLLBACK_BLOCKED_BY_ADJUSTMENT_REFERENCES
        : null,
    ...referenceSummary,
    warnings,

    scheduleSlotsToDelete: importedSlotCount,
    teachingTaskClassesToDelete,
    teachingTasksToDelete: importedTaskCount,

    retainedClassGroups,
    retainedTeachers,
    retainedCourses,
    retainedRooms,

    importedTaskCount,
    importedSlotCount,
    externalSlotsForImportedTasks,
    hasPlaceholderTeachers,
    hasPlaceholderRooms,
    hasOrphanSlots,
  }
}

export async function simulateRollbackImportBatch(batchId: number): Promise<RollbackSimulationResult> {
  const plan = await buildRollbackPlan(batchId)

  if (!plan.canRollback) {
    return {
      batchId,
      simulated: true,
      canRollback: false,
      blockingReasons: plan.blockingReasons,
      warnings: plan.warnings,
      deletedScheduleSlots: 0,
      deletedTeachingTaskClasses: 0,
      deletedTeachingTasks: 0,
      retainedClassGroups: plan.retainedClassGroups,
      retainedTeachers: plan.retainedTeachers,
      retainedCourses: plan.retainedCourses,
      retainedRooms: plan.retainedRooms,
    }
  }

  try {
    await prisma.$transaction(async (tx) => {
      // 1. Delete ScheduleSlot where importBatchId = batchId
      const deletedScheduleSlots = await tx.scheduleSlot.deleteMany({
        where: { importBatchId: batchId },
      })

      // 2. Delete TeachingTaskClass where teachingTask.importBatchId = batchId
      const deletedTeachingTaskClasses = await tx.teachingTaskClass.deleteMany({
        where: { teachingTask: { importBatchId: batchId } },
      })

      // 3. Delete TeachingTask where importBatchId = batchId
      const deletedTeachingTasks = await tx.teachingTask.deleteMany({
        where: { importBatchId: batchId },
      })

      // Do NOT delete ClassGroup, Teacher, Course, Room
      // Do NOT update ImportBatch.status

      const result: RollbackSimulationResult = {
        batchId,
        simulated: true,
        canRollback: true,
        blockingReasons: [],
        warnings: plan.warnings,
        deletedScheduleSlots: deletedScheduleSlots.count,
        deletedTeachingTaskClasses: deletedTeachingTaskClasses.count,
        deletedTeachingTasks: deletedTeachingTasks.count,
        retainedClassGroups: plan.retainedClassGroups,
        retainedTeachers: plan.retainedTeachers,
        retainedCourses: plan.retainedCourses,
        retainedRooms: plan.retainedRooms,
      }

      throw new RollbackSignal(result)
    })

    // Should never reach here
    throw new Error('unexpected: transaction did not rollback')
  } catch (e) {
    if (e instanceof RollbackSignal) {
      return e.result
    }
    throw e
  }
}

export async function rollbackImportBatch(batchId: number): Promise<RollbackResult> {
  const plan = await buildRollbackPlan(batchId)

  if (!plan.canRollback) {
    if (plan.blockingCode === ROLLBACK_BLOCKED_BY_ADJUSTMENT_REFERENCES) {
      throw new RollbackBlockedBySlotReferencesError({
        blockingSlotCount: plan.blockingSlotCount,
        blockingReferenceCount: plan.blockingReferenceCount,
        referenceTypes: plan.referenceTypes,
        affectedSlotIds: plan.affectedSlotIds,
      })
    }
    throw new Error(`Cannot rollback batch #${batchId}: ${plan.blockingReasons.join('; ')}`)
  }

  if (plan.externalSlotsForImportedTasks > 0) {
    throw new Error(
      `Cannot rollback batch #${batchId}: ${plan.externalSlotsForImportedTasks} external ScheduleSlots exist for imported TeachingTasks`
    )
  }

  if (plan.hasOrphanSlots) {
    throw new Error(
      `Cannot rollback batch #${batchId}: batch has orphan ScheduleSlots`
    )
  }

  // Atomic confirmed → rolling_back
  const updateResult = await prisma.importBatch.updateMany({
    where: { id: batchId, status: 'confirmed' },
    data: { status: 'rolling_back' },
  })

  if (updateResult.count !== 1) {
    throw new Error(`ImportBatch ${batchId} status changed concurrently, rollback aborted`)
  }

  try {
    const result = await prisma.$transaction(async (tx) => {
      // Re-check inside the delete transaction to close the race between
      // dry-run/plan inspection and the destructive operation.
      const referenceSummary = await inspectRollbackSlotReferences(tx, batchId)
      throwIfRollbackReferencesExist(referenceSummary)

      // 1. Delete ScheduleSlot where importBatchId = batchId
      const deletedScheduleSlots = await tx.scheduleSlot.deleteMany({
        where: { importBatchId: batchId },
      })

      // 2. Delete TeachingTaskClass where teachingTask.importBatchId = batchId
      const deletedTeachingTaskClasses = await tx.teachingTaskClass.deleteMany({
        where: { teachingTask: { importBatchId: batchId } },
      })

      // 3. Delete TeachingTask where importBatchId = batchId
      const deletedTeachingTasks = await tx.teachingTask.deleteMany({
        where: { importBatchId: batchId },
      })

      // 4. Update ImportBatch status to rolled_back
      await tx.importBatch.update({
        where: { id: batchId },
        data: {
          status: 'rolled_back',
          rolledBackAt: new Date(),
        },
      })

      return {
        deletedScheduleSlots: deletedScheduleSlots.count,
        deletedTeachingTaskClasses: deletedTeachingTaskClasses.count,
        deletedTeachingTasks: deletedTeachingTasks.count,
      }
    })

    return {
      batchId,
      rolledBack: true,
      deletedScheduleSlots: result.deletedScheduleSlots,
      deletedTeachingTaskClasses: result.deletedTeachingTaskClasses,
      deletedTeachingTasks: result.deletedTeachingTasks,
      retainedClassGroups: plan.retainedClassGroups,
      retainedTeachers: plan.retainedTeachers,
      retainedCourses: plan.retainedCourses,
      retainedRooms: plan.retainedRooms,
      warnings: plan.warnings,
    }
  } catch (e) {
    if (e instanceof RollbackBlockedBySlotReferencesError) {
      // The optimistic status transition happened before the transaction.
      // Restore the confirmed state because no rollback data was deleted.
      try {
        await prisma.importBatch.updateMany({
          where: { id: batchId, status: 'rolling_back' },
          data: { status: 'confirmed', errorMessage: null },
        })
      } catch {
        // Preserve the original blocking error.
      }
      throw e
    }

    // On failure, update status to rollback_failed
    const errorMessage = e instanceof Error ? e.message : String(e)
    try {
      await prisma.importBatch.update({
        where: { id: batchId },
        data: { status: 'rollback_failed', errorMessage },
      })
    } catch {
      // If status update also fails, throw original error
    }
    throw e
  }
}
