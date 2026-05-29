import { PrismaClient } from '@prisma/client'

const prisma = new PrismaClient()

export interface RollbackPlan {
  batchId: number
  batchStatus: string
  canRollback: boolean
  blockingReasons: string[]
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
  const canRollback = batch.status === 'confirmed'
  if (!canRollback) {
    blockingReasons.push(
      `Batch status is "${batch.status}", only "confirmed" batches can be rolled back`
    )
  }

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
