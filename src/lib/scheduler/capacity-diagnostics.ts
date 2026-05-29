import type {
  SchedulingContext,
  ScheduleState,
} from './types'
import {
  getTaskStudentCount,
  getEligibleRoomsByCapacity,
  type TaskStudentInfo,
  type EligibleRoom,
  type CountSource,
} from './capacity'

// ── 类型定义 ──

export interface CapacityConflictDetail {
  taskId: number
  courseName: string
  teacherName: string
  classNames: string[]
  studentCount: number
  countSource: CountSource
  missingStudentCountClassIds?: number[]
  currentRoomName: string
  currentRoomCapacity: number
  shortage: number
  eligibleRoomCount: number
  topEligibleRooms: EligibleRoom[]
  isFeasibleByCapacity: boolean
}

export interface CapacityDiagnosticsResult {
  conflicts: CapacityConflictDetail[]
  totalCapacityConflicts: number
  feasibleConflicts: number
  infeasibleConflicts: number
  maxStudentCount: number
  maxRoomCapacity: number
  maxShortage: number
  roomCapacityDistribution: Record<string, number>
  taskStudentCountDistribution: Record<string, number>
  countSourceDistribution: Record<CountSource, number>
  missingStudentCountClassCount: number
  capacityStillDefaultCount: number
  topInfeasibleTasks: CapacityConflictDetail[]
  topShortageTasks: CapacityConflictDetail[]
}

// ── 核心函数 ──

/**
 * 诊断当前状态的所有容量冲突
 */
export function diagnoseCapacityConflicts(
  state: ScheduleState,
  ctx: SchedulingContext,
): CapacityConflictDetail[] {
  const conflicts: CapacityConflictDetail[] = []

  for (const slot of ctx.slots) {
    const assignment = state.assignments.get(slot.id)
    if (!assignment || assignment.roomId === 0) continue

    const room = ctx.roomById.get(assignment.roomId)
    if (!room) continue

    const task = slot.teachingTask
    const studentInfo = getTaskStudentCount(task, ctx)

    if (studentInfo.studentCount > room.capacity) {
      const eligible = getEligibleRoomsByCapacity(studentInfo.studentCount, ctx)
      conflicts.push({
        taskId: task.id,
        courseName: task.course.name,
        teacherName: task.teacher?.name ?? '未分配',
        classNames: studentInfo.classNames,
        studentCount: studentInfo.studentCount,
        countSource: studentInfo.countSource,
        missingStudentCountClassIds: studentInfo.missingStudentCountClassIds,
        currentRoomName: room.name,
        currentRoomCapacity: room.capacity,
        shortage: studentInfo.studentCount - room.capacity,
        eligibleRoomCount: eligible.length,
        topEligibleRooms: eligible.slice(0, 10),
        isFeasibleByCapacity: eligible.length > 0,
      })
    }
  }

  return conflicts
}

/**
 * 汇总容量诊断结果
 */
export function summarizeCapacityDiagnostics(
  conflicts: CapacityConflictDetail[],
  ctx: SchedulingContext,
): CapacityDiagnosticsResult {
  const totalCapacityConflicts = conflicts.length
  const feasibleConflicts = conflicts.filter((c) => c.isFeasibleByCapacity).length
  const infeasibleConflicts = totalCapacityConflicts - feasibleConflicts

  const maxStudentCount = conflicts.reduce((max, c) => Math.max(max, c.studentCount), 0)
  const maxRoomCapacity = conflicts.reduce((max, c) => Math.max(max, c.currentRoomCapacity), 0)
  const maxShortage = conflicts.reduce((max, c) => Math.max(max, c.shortage), 0)

  // 容量分布
  const roomCapacityDistribution: Record<string, number> = {}
  for (const c of conflicts) {
    const range = c.currentRoomCapacity <= 50 ? '≤50'
      : c.currentRoomCapacity <= 60 ? '51-60'
      : c.currentRoomCapacity <= 80 ? '61-80'
      : c.currentRoomCapacity <= 100 ? '81-100'
      : '>100'
    roomCapacityDistribution[range] = (roomCapacityDistribution[range] || 0) + 1
  }

  // 学生数分布
  const taskStudentCountDistribution: Record<string, number> = {}
  for (const c of conflicts) {
    const range = c.studentCount <= 50 ? '≤50'
      : c.studentCount <= 100 ? '51-100'
      : c.studentCount <= 150 ? '101-150'
      : '>150'
    taskStudentCountDistribution[range] = (taskStudentCountDistribution[range] || 0) + 1
  }

  // 人数来源分布
  const countSourceDistribution: Record<CountSource, number> = {
    REAL_STUDENT_COUNT: 0,
    FALLBACK_50_PER_CLASS: 0,
    MIXED: 0,
  }
  for (const c of conflicts) {
    countSourceDistribution[c.countSource]++
  }

  // 缺失 studentCount 的班级数
  const missingClassIds = new Set<number>()
  for (const c of conflicts) {
    if (c.missingStudentCountClassIds) {
      for (const id of c.missingStudentCountClassIds) missingClassIds.add(id)
    }
  }

  // 仍然 capacity=50 的教室数
  const capacityStillDefaultCount = ctx.rooms.filter((r) => r.capacity === 50).length

  // Top infeasible
  const topInfeasibleTasks = conflicts
    .filter((c) => !c.isFeasibleByCapacity)
    .sort((a, b) => b.shortage - a.shortage)
    .slice(0, 10)

  // Top shortage
  const topShortageTasks = [...conflicts]
    .sort((a, b) => b.shortage - a.shortage)
    .slice(0, 10)

  return {
    conflicts,
    totalCapacityConflicts,
    feasibleConflicts,
    infeasibleConflicts,
    maxStudentCount,
    maxRoomCapacity,
    maxShortage,
    roomCapacityDistribution,
    taskStudentCountDistribution,
    countSourceDistribution,
    missingStudentCountClassCount: missingClassIds.size,
    capacityStillDefaultCount,
    topInfeasibleTasks,
    topShortageTasks,
  }
}

/**
 * 打印容量诊断报告
 */
export function printCapacityDiagnostics(result: CapacityDiagnosticsResult): void {
  console.log('\n=== Capacity Diagnostics ===')
  console.log(`Total capacity conflicts: ${result.totalCapacityConflicts}`)
  console.log(`Feasible by capacity: ${result.feasibleConflicts}`)
  console.log(`Infeasible by capacity: ${result.infeasibleConflicts}`)
  console.log(`Max studentCount: ${result.maxStudentCount}`)
  console.log(`Max room.capacity: ${result.maxRoomCapacity}`)
  console.log(`Max shortage: ${result.maxShortage}`)

  console.log('\nCount source distribution:')
  for (const [source, count] of Object.entries(result.countSourceDistribution)) {
    console.log(`  ${source}: ${count}`)
  }

  console.log(`\nMissing studentCount class IDs: ${result.missingStudentCountClassCount}`)
  console.log(`Rooms still capacity=50: ${result.capacityStillDefaultCount}`)

  console.log('\nRoom capacity distribution (in conflict assignments):')
  for (const [range, count] of Object.entries(result.roomCapacityDistribution)) {
    console.log(`  ${range}: ${count}`)
  }

  console.log('\nTask student count distribution (in conflict tasks):')
  for (const [range, count] of Object.entries(result.taskStudentCountDistribution)) {
    console.log(`  ${range}: ${count}`)
  }

  console.log('\nTop 20 capacity conflicts:')
  for (const c of result.conflicts.slice(0, 20)) {
    console.log(`  ${c.courseName} | ${c.teacherName} | ${c.classNames.join(', ')}`)
    console.log(`    students=${c.studentCount} (${c.countSource}), room=${c.currentRoomName} cap=${c.currentRoomCapacity}, shortage=${c.shortage}`)
    console.log(`    eligibleRooms=${c.eligibleRoomCount}, feasible=${c.isFeasibleByCapacity}`)
  }

  console.log('\nTop 10 infeasible tasks:')
  for (const c of result.topInfeasibleTasks) {
    console.log(`  ${c.courseName} | ${c.teacherName} | students=${c.studentCount} | shortage=${c.shortage}`)
  }

  console.log('\nTop 10 shortage tasks:')
  for (const c of result.topShortageTasks) {
    console.log(`  ${c.courseName} | ${c.teacherName} | students=${c.studentCount} | room=${c.currentRoomName} cap=${c.currentRoomCapacity} | shortage=${c.shortage}`)
  }
}
