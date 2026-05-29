import type {
  SchedulingContext,
  TaskWithRelations,
  RoomWithAvailability,
} from './types'

// ── 类型定义 ──

export type CountSource = 'REAL_STUDENT_COUNT' | 'FALLBACK_50_PER_CLASS' | 'MIXED'

export interface TaskStudentInfo {
  taskId: number
  classIds: number[]
  classNames: string[]
  studentCount: number
  countSource: CountSource
  duplicatedClassIds?: number[]
  missingStudentCountClassIds?: number[]
}

export interface EligibleRoom {
  roomId: number
  roomName: string
  capacity: number
  building: string | null
  type: string
}

// ── 常量 ──

const FALLBACK_STUDENTS_PER_CLASS = 50

// ── 核心函数 ──

/**
 * 获取教学任务关联班级的总人数
 * 优先使用 ClassGroup.studentCount，缺失时 fallback 到 50
 */
export function getTaskStudentCount(
  task: TaskWithRelations,
  _ctx: SchedulingContext,
): TaskStudentInfo {
  const classIds: number[] = []
  const classNames: string[] = []
  const seenIds = new Set<number>()
  const duplicatedClassIds: number[] = []
  const missingStudentCountClassIds: number[] = []

  let hasRealCount = false
  let hasFallback = false
  let totalStudents = 0

  for (const tc of task.taskClasses) {
    const cgId = tc.classGroupId
    if (seenIds.has(cgId)) {
      duplicatedClassIds.push(cgId)
      continue
    }
    seenIds.add(cgId)
    classIds.push(cgId)
    classNames.push(tc.classGroup.name)

    const sc = tc.classGroup.studentCount
    if (sc != null && sc > 0) {
      totalStudents += sc
      hasRealCount = true
    } else {
      totalStudents += FALLBACK_STUDENTS_PER_CLASS
      hasFallback = true
      missingStudentCountClassIds.push(cgId)
    }
  }

  // 如果没有任何班级，按 1 个班估算
  if (classIds.length === 0) {
    totalStudents = FALLBACK_STUDENTS_PER_CLASS
    hasFallback = true
  }

  let countSource: CountSource
  if (hasRealCount && hasFallback) countSource = 'MIXED'
  else if (hasRealCount) countSource = 'REAL_STUDENT_COUNT'
  else countSource = 'FALLBACK_50_PER_CLASS'

  return {
    taskId: task.id,
    classIds,
    classNames,
    studentCount: totalStudents,
    countSource,
    duplicatedClassIds: duplicatedClassIds.length > 0 ? duplicatedClassIds : undefined,
    missingStudentCountClassIds: missingStudentCountClassIds.length > 0 ? missingStudentCountClassIds : undefined,
  }
}

/**
 * 获取容量足够的教室列表（按容量升序）
 */
export function getEligibleRoomsByCapacity(
  studentCount: number,
  ctx: SchedulingContext,
): EligibleRoom[] {
  return ctx.rooms
    .filter((r) => r.capacity >= studentCount)
    .sort((a, b) => a.capacity - b.capacity)
    .map((r) => ({
      roomId: r.id,
      roomName: r.name,
      capacity: r.capacity,
      building: r.building,
      type: r.type,
    }))
}

/**
 * 为 solver 生成候选教室列表
 * 如果存在容量足够的 room，只返回容量足够的；否则返回空数组
 */
export function getCandidateRoomsForTask(
  taskId: number,
  ctx: SchedulingContext,
): EligibleRoom[] {
  const task = ctx.taskById.get(taskId)
  if (!task) return []
  const info = getTaskStudentCount(task, ctx)
  return getEligibleRoomsByCapacity(info.studentCount, ctx)
}
