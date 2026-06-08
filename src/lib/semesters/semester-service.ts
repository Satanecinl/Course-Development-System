/**
 * K25-H: Semester service — shared business logic for semester CRUD.
 *
 * Used by API routes. No UI logic.
 */
import { prisma } from '@/lib/prisma'

// ─── Types ───────────────────────────────────────────────────────────────────

export interface SemesterSummary {
  id: number
  name: string
  code: string
  academicYear: string | null
  term: string | null
  startsAt: string | null
  endsAt: string | null
  isActive: boolean
  createdAt: string
  updatedAt: string
}

export interface SemesterDependencyCounts {
  classGroups: number
  teachingTasks: number
  scheduleSlots: number
  scheduleAdjustments: number
  schedulingRuns: number
  schedulingConfigs: number
  importBatches: number
  total: number
}

export interface SemesterDeleteStatus {
  canDelete: boolean
  blockers: string[]
  dependencies: SemesterDependencyCounts
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

export function formatSemesterSummary(semester: {
  id: number
  name: string
  code: string
  academicYear: string | null
  term: string | null
  startsAt: Date | null
  endsAt: Date | null
  isActive: boolean
  createdAt: Date
  updatedAt: Date
}): SemesterSummary {
  return {
    id: semester.id,
    name: semester.name,
    code: semester.code,
    academicYear: semester.academicYear,
    term: semester.term,
    startsAt: semester.startsAt?.toISOString() ?? null,
    endsAt: semester.endsAt?.toISOString() ?? null,
    isActive: semester.isActive,
    createdAt: semester.createdAt.toISOString(),
    updatedAt: semester.updatedAt.toISOString(),
  }
}

// ─── Dependency Counts ───────────────────────────────────────────────────────

export async function getSemesterDependencies(semesterId: number): Promise<SemesterDependencyCounts> {
  const [classGroups, teachingTasks, scheduleSlots, scheduleAdjustments, schedulingRuns, schedulingConfigs, importBatches] =
    await Promise.all([
      prisma.classGroup.count({ where: { semesterId } }),
      prisma.teachingTask.count({ where: { semesterId } }),
      prisma.scheduleSlot.count({ where: { semesterId } }),
      prisma.scheduleAdjustment.count({ where: { semesterId } }),
      prisma.schedulingRun.count({ where: { semesterId } }),
      prisma.schedulingConfig.count({ where: { semesterId } }),
      prisma.importBatch.count({ where: { semesterId } }),
    ])

  const total = classGroups + teachingTasks + scheduleSlots + scheduleAdjustments + schedulingRuns + schedulingConfigs + importBatches

  return {
    classGroups,
    teachingTasks,
    scheduleSlots,
    scheduleAdjustments,
    schedulingRuns,
    schedulingConfigs,
    importBatches,
    total,
  }
}

// ─── Delete Status ───────────────────────────────────────────────────────────

export async function getSemesterDeleteStatus(semesterId: number): Promise<SemesterDeleteStatus> {
  const semester = await prisma.semester.findUnique({ where: { id: semesterId } })
  if (!semester) {
    return {
      canDelete: false,
      blockers: ['学期不存在'],
      dependencies: { classGroups: 0, teachingTasks: 0, scheduleSlots: 0, scheduleAdjustments: 0, schedulingRuns: 0, schedulingConfigs: 0, importBatches: 0, total: 0 },
    }
  }

  const dependencies = await getSemesterDependencies(semesterId)
  const blockers: string[] = []

  if (semester.isActive) {
    blockers.push('该学期是当前激活学期，请先切换到其他学期')
  }

  const totalSemesters = await prisma.semester.count()
  if (totalSemesters <= 1) {
    blockers.push('系统至少需要保留一个学期')
  }

  if (dependencies.total > 0) {
    blockers.push(`该学期已有 ${dependencies.total} 条业务数据，不能删除`)
  }

  return {
    canDelete: blockers.length === 0,
    blockers,
    dependencies,
  }
}

// ─── Activate ────────────────────────────────────────────────────────────────

export async function activateSemester(semesterId: number): Promise<SemesterSummary> {
  const semester = await prisma.$transaction(async (tx) => {
    // Deactivate all
    await tx.semester.updateMany({ data: { isActive: false } })
    // Activate target
    return tx.semester.update({
      where: { id: semesterId },
      data: { isActive: true },
    })
  })

  return formatSemesterSummary(semester)
}

// ─── Create with Active Transaction ──────────────────────────────────────────

export async function createSemester(input: {
  name: string
  code: string
  academicYear?: string | null
  term?: string | null
  startsAt?: Date | null
  endsAt?: Date | null
  isActive?: boolean
}): Promise<SemesterSummary> {
  if (input.isActive) {
    const semester = await prisma.$transaction(async (tx) => {
      await tx.semester.updateMany({ data: { isActive: false } })
      return tx.semester.create({
        data: {
          name: input.name,
          code: input.code,
          academicYear: input.academicYear ?? null,
          term: input.term ?? null,
          startsAt: input.startsAt ?? null,
          endsAt: input.endsAt ?? null,
          isActive: true,
        },
      })
    })
    return formatSemesterSummary(semester)
  }

  const semester = await prisma.semester.create({
    data: {
      name: input.name,
      code: input.code,
      academicYear: input.academicYear ?? null,
      term: input.term ?? null,
      startsAt: input.startsAt ?? null,
      endsAt: input.endsAt ?? null,
      isActive: input.isActive ?? false,
    },
  })

  return formatSemesterSummary(semester)
}

// ─── Update with Active Transaction ──────────────────────────────────────────

export async function updateSemester(
  semesterId: number,
  input: {
    name?: string
    code?: string
    academicYear?: string | null
    term?: string | null
    startsAt?: Date | null
    endsAt?: Date | null
    isActive?: boolean
  },
): Promise<SemesterSummary> {
  const data: Record<string, unknown> = {}
  if (input.name !== undefined) data.name = input.name
  if (input.code !== undefined) data.code = input.code
  if (input.academicYear !== undefined) data.academicYear = input.academicYear
  if (input.term !== undefined) data.term = input.term
  if (input.startsAt !== undefined) data.startsAt = input.startsAt
  if (input.endsAt !== undefined) data.endsAt = input.endsAt

  if (input.isActive === true) {
    const semester = await prisma.$transaction(async (tx) => {
      await tx.semester.updateMany({ data: { isActive: false } })
      return tx.semester.update({
        where: { id: semesterId },
        data: { ...data, isActive: true },
      })
    })
    return formatSemesterSummary(semester)
  }

  const semester = await prisma.semester.update({
    where: { id: semesterId },
    data,
  })

  return formatSemesterSummary(semester)
}
