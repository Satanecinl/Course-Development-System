// scripts/evaluate-real-solver-quality-k22-l1.ts
// K22-L1: 真实 dev.db 数据上的 solver 质量评估脚本。
//
// 设计原则：
// - 只读：仅通过 loadSchedulingContext() 读取 dev.db
// - 不 apply：不写 ScheduleSlot、SchedulingRun、TeachingTask、Room 等
// - 不改 schema / migration / API / frontend / importer
// - 直接调用 solver 内部函数：solve() 是纯内存的
// - 固定 randomSeed，保证可复现
// - 输出 baseline 调参前结果，供后续 K22-L1B 阶段调参对比

import { writeFileSync, mkdirSync } from 'fs'
import { join } from 'path'

import { loadSchedulingContext } from '../src/lib/scheduler/data-loader'
import { solve } from '../src/lib/scheduler/solver'
import { calculateScoreWithDetails } from '../src/lib/scheduler/score'
import { summarizeScore } from '../src/lib/scheduler/diagnostics'
import { prisma } from '../src/lib/prisma'

// ─── 运行配置 ────────────────────────────────────────────────

const FIXED_SEED = 42
const MAX_ITERATIONS = 10000
const LAHC_WINDOW_SIZE = 500
const OUTPUT_DIR = join(process.cwd(), 'docs')

// ─── 约束类型注册表 ──────────────────────────────────────────

const CONSTRAINT_REGISTRY: Record<string, { id: string; type: 'HARD' | 'SOFT'; description: string; penalty: number }> = {
  HC1_ROOM_CONFLICT: {
    id: 'HC1', type: 'HARD', penalty: -1000,
    description: '同一教室同一时段被两个任务占用',
  },
  HC2_TEACHER_CONFLICT: {
    id: 'HC2', type: 'HARD', penalty: -1000,
    description: '同一教师同一时段被两个任务占用',
  },
  HC3_CLASS_CONFLICT: {
    id: 'HC3', type: 'HARD', penalty: -1000,
    description: '同一班级同一时段被两个任务占用',
  },
  HC4_CAPACITY: {
    id: 'HC4', type: 'HARD', penalty: -1000,
    description: '学生人数超过教室容量',
  },
  HC5_ROOM_UNAVAILABLE: {
    id: 'HC5', type: 'HARD', penalty: -1000,
    description: '教室在该时段被标记为不可用',
  },
  HC6_NON_AUTOMOTIVE_FORBID_LINXIAO: {
    id: 'HC6', type: 'HARD', penalty: -1000,
    description: '非汽车/混合/未知专业任务被安排在林校教室',
  },
  SC1_CROSS_BUILDING_BACK_TO_BACK: {
    id: 'SC1', type: 'SOFT', penalty: -5,
    description: '同一教师或同班在相邻时段跨楼栋上课',
  },
  SC2_SAME_DAY: {
    id: 'SC2', type: 'SOFT', penalty: -10,
    description: '同一任务在同一天有多个时段',
  },
  SC3_EXTREME_TIME_SLOT: {
    id: 'SC3', type: 'SOFT', penalty: -1,
    description: '上课时间在第 5 节或更晚（偏晚）',
  },
  SC4_CROSS_CAMPUS: {
    id: 'SC4', type: 'SOFT', penalty: -5,
    description: '同一任务同天相邻时段在不同楼栋',
  },
  MINIMUM_PERTURBATION: {
    id: 'MIN_PERT', type: 'SOFT', penalty: -2,
    description: '任务从原始位置被移动',
  },
  SC6_AUTOMOTIVE_PREFERS_LINXIAO: {
    id: 'SC6', type: 'SOFT', penalty: -20,
    description: '汽车专业任务未安排在林校教室',
  },
  SC7_WEEKEND_AVOIDANCE: {
    id: 'SC7', type: 'SOFT', penalty: -15,
    description: '任务被安排在周末（周六/周日）',
  },
  SC8_CLASS_GAP: {
    id: 'SC8', type: 'SOFT', penalty: -2,
    description: '同一班级同天存在上课空洞（period gap）',
  },
  SC9_TEACHING_TASK_ROOM_STABILITY: {
    id: 'SC9', type: 'SOFT', penalty: -2,
    description: '同一任务在多个教室上课（缺稳定性）',
  },
  SC10_ROOM_CAPACITY_UTILIZATION: {
    id: 'SC10', type: 'SOFT', penalty: -2,
    description: '教室容量利用率过紧(>90%)或过浪费(<30% 且容量>=100)',
  },
}

const EXPECTED_CONSTRAINT_IDS = [
  'HC1', 'HC2', 'HC3', 'HC4', 'HC5', 'HC6',
  'SC1', 'SC2', 'SC3', 'SC4', 'MIN_PERT',
  'SC6', 'SC7', 'SC8', 'SC9', 'SC10',
]

// ─── 数据集摘要 ─────────────────────────────────────────────

async function collectDatasetSummary(semesterId: number | undefined) {
  const taskCount = await prisma.teachingTask.count({ where: semesterId ? { semesterId } : {} })
  const slotCount = await prisma.scheduleSlot.count({ where: semesterId ? { semesterId } : {} })
  const roomCount = await prisma.room.count()
  const teacherCount = await prisma.teacher.count()
  const courseCount = await prisma.course.count()
  const classGroupCount = await prisma.classGroup.count()

  // 空教室 / 空教师数
  const slotsWithRoom = await prisma.scheduleSlot.count({ where: { ...(semesterId ? { semesterId } : {}), roomId: { not: null } } })
  const slotsWithTeacher = await prisma.scheduleSlot.count({
    where: { ...(semesterId ? { semesterId } : {}), teachingTask: { teacherId: { not: null } } },
  })

  // 周末课数量（按 DB 中初始排课统计）
  const weekendSlots = await prisma.scheduleSlot.count({
    where: { ...(semesterId ? { semesterId } : {}), dayOfWeek: { gte: 6 } },
  })

  return {
    taskCount,
    slotCount,
    roomCount,
    teacherCount,
    courseCount,
    classGroupCount,
    slotsWithRoom,
    slotsWithTeacher,
    weekendSlots,
  }
}

// ─── Constraint breakdown 提取 ─────────────────────────────

interface ConstraintStat {
  constraintId: string
  type: 'HARD' | 'SOFT'
  description: string
  penalty: number
  triggerCount: number
  totalPenalty: number
  averagePenalty: number
  topExamples: Array<{ slotId?: number; relatedSlotId?: number; message?: string; penalty: number }>
}

function buildConstraintBreakdown(summary: ReturnType<typeof summarizeScore>): ConstraintStat[] {
  const stats: ConstraintStat[] = []
  const byType = summary.byType

  for (const constraintId of EXPECTED_CONSTRAINT_IDS) {
    const typeString = Object.keys(CONSTRAINT_REGISTRY).find((k) => CONSTRAINT_REGISTRY[k].id === constraintId)!
    const meta = CONSTRAINT_REGISTRY[typeString]
    const entry = byType[typeString]

    if (!entry) {
      stats.push({
        constraintId,
        type: meta.type,
        description: meta.description,
        penalty: meta.penalty,
        triggerCount: 0,
        totalPenalty: 0,
        averagePenalty: 0,
        topExamples: [],
      })
      continue
    }

    stats.push({
      constraintId,
      type: meta.type,
      description: meta.description,
      penalty: meta.penalty,
      triggerCount: entry.count,
      totalPenalty: entry.totalPenalty,
      averagePenalty: entry.count > 0 ? entry.totalPenalty / entry.count : 0,
      topExamples: entry.samples.map((s) => ({
        slotId: s.slotId,
        relatedSlotId: s.relatedSlotId,
        message: s.message,
        penalty: s.penalty,
      })),
    })
  }

  return stats
}

// ─── 质量分析子项 ─────────────────────────────────────────

interface QualityAnalysis {
  hardFeasibility: {
    initialHardScore: number
    finalHardScore: number
    allHardResolved: boolean
    byHard: Record<string, number>
  }
  weekendAnalysis: {
    initialWeekendSlots: number
    finalWeekendSlots: number
    finalWeekendTasks: Set<number>
    finalWeekendTeachers: Set<number>
    finalWeekendClasses: Set<number>
    sc7Penalty: number
    sc7Count: number
    weekendByDay: Record<number, number>
  }
  linxiaoAutomotiveAnalysis: {
    hc6Count: number
    sc6Count: number
    hc6Penalty: number
    sc6Penalty: number
    linxiaoRoomIds: number[]
    linxiaoRoomNames: string[]
  }
  teacherDayBalanceAnalysis: {
    sc5Count: number
    sc5Penalty: number
    worstTeacherDistributions: Array<{ teacherId: number; teacherName: string; distribution: number[]; diff: number; penalty: number }>
    imbalancedTeacherCount: number
  }
  classGapAnalysis: {
    sc8Count: number
    sc8Penalty: number
    worstClassGaps: Array<{ classGroupId: number; classGroupName: string; day: number; periods: number[]; gap: number; penalty: number }>
  }
  roomStabilityAnalysis: {
    sc9Count: number
    sc9Penalty: number
    tasksWithMultipleRooms: number
    mostRooms: Array<{ taskId: number; courseName: string; roomCount: number; penalty: number }>
  }
  capacityUtilizationAnalysis: {
    sc10TightCount: number
    sc10WasteCount: number
    sc10Penalty: number
    utilizationDistribution: Record<string, number>
    sampleTight: Array<{ slotId: number; message?: string }>
    sampleWaste: Array<{ slotId: number; message?: string }>
  }
  oldConstraintsAnalysis: {
    sc1: { count: number; penalty: number }
    sc2: { count: number; penalty: number }
    sc3: { count: number; penalty: number }
    sc4: { count: number; penalty: number }
    minPert: { count: number; penalty: number; movedSlotCount: number; totalSlots: number }
  }
}

function analyzeQuality(
  ctx: Awaited<ReturnType<typeof loadSchedulingContext>>,
  finalState: import('../src/lib/scheduler/types').ScheduleState,
  finalScoreWithDetails: import('../src/lib/scheduler/types').ScoreWithDetails,
  finalSummary: ReturnType<typeof summarizeScore>,
  initialState: import('../src/lib/scheduler/types').ScheduleState,
  initialScoreWithDetails: import('../src/lib/scheduler/types').ScoreWithDetails,
): QualityAnalysis {
  // 提取 slot 按 final position 索引
  const finalPositions = new Map<number, { slot: typeof ctx.slots[number]; day: number; slotIdx: number; room: number }>()
  for (const slot of ctx.slots) {
    const a = finalState.assignments.get(slot.id)
    finalPositions.set(slot.id, {
      slot,
      day: a?.dayOfWeek ?? slot.dayOfWeek,
      slotIdx: a?.slotIndex ?? slot.slotIndex,
      room: a?.roomId ?? slot.roomId ?? 0,
    })
  }

  const initialPositions = new Map<number, { slot: typeof ctx.slots[number]; day: number; slotIdx: number; room: number }>()
  for (const slot of ctx.slots) {
    const a = initialState.assignments.get(slot.id)
    initialPositions.set(slot.id, {
      slot,
      day: a?.dayOfWeek ?? slot.dayOfWeek,
      slotIdx: a?.slotIndex ?? slot.slotIndex,
      room: a?.roomId ?? slot.roomId ?? 0,
    })
  }

  // ── Hard feasibility ──
  const byHard: Record<string, number> = {}
  for (const id of ['HC1', 'HC2', 'HC3', 'HC4', 'HC5', 'HC6']) {
    const typeString = Object.keys(CONSTRAINT_REGISTRY).find((k) => CONSTRAINT_REGISTRY[k].id === id)!
    byHard[id] = finalSummary.byType[typeString]?.count ?? 0
  }

  // ── Weekend ──
  let finalWeekendCount = 0
  const finalWeekendTasks = new Set<number>()
  const finalWeekendTeachers = new Set<number>()
  const finalWeekendClasses = new Set<number>()
  const weekendByDay: Record<number, number> = { 6: 0, 7: 0 }
  for (const pos of finalPositions.values()) {
    if (pos.day >= 6) {
      finalWeekendCount++
      weekendByDay[pos.day] = (weekendByDay[pos.day] ?? 0) + 1
      finalWeekendTasks.add(pos.slot.teachingTaskId)
      if (pos.slot.teachingTask.teacherId != null) finalWeekendTeachers.add(pos.slot.teachingTask.teacherId)
      for (const tc of pos.slot.teachingTask.taskClasses) finalWeekendClasses.add(tc.classGroupId)
    }
  }
  const sc7 = finalSummary.byType['SC7_WEEKEND_AVOIDANCE']
  let initialWeekendCount = 0
  for (const pos of initialPositions.values()) {
    if (pos.day >= 6) initialWeekendCount++
  }

  // ── Linxiao / Automotive ──
  const linxiaoRooms = ctx.rooms.filter((r) => r.name.includes('林校') || (r.building && r.building.includes('林校')))
  const linxiaoRoomIds = linxiaoRooms.map((r) => r.id)
  const hc6 = finalSummary.byType['HC6_NON_AUTOMOTIVE_FORBID_LINXIAO']
  const sc6 = finalSummary.byType['SC6_AUTOMOTIVE_PREFERS_LINXIAO']

  // ── Teacher day balance ──
  const teacherDayLoads = new Map<number, number[]>()
  for (const pos of finalPositions.values()) {
    const tid = pos.slot.teachingTask.teacherId
    if (tid == null) continue
    if (pos.room === 0) continue
    if (pos.day < 1 || pos.day > 5) continue
    let arr = teacherDayLoads.get(tid)
    if (!arr) { arr = [0, 0, 0, 0, 0]; teacherDayLoads.set(tid, arr) }
    arr[pos.day - 1]++
  }
  const teacherNameById = new Map<number, string>()
  for (const t of ctx.tasks) {
    if (t.teacherId != null && t.teacher) teacherNameById.set(t.teacherId, t.teacher.name)
  }

  const worstTeacherDistributions: Array<{ teacherId: number; teacherName: string; distribution: number[]; diff: number; penalty: number }> = []
  let imbalancedTeacherCount = 0
  for (const [tid, loads] of teacherDayLoads) {
    const total = loads.reduce((a, b) => a + b, 0)
    if (total < 3) continue
    const max = Math.max(...loads)
    const min = Math.min(...loads)
    const diff = max - min
    if (diff > 2) imbalancedTeacherCount++
    if (diff > 2) {
      const penalty = -3 * (diff - 2)
      worstTeacherDistributions.push({
        teacherId: tid,
        teacherName: teacherNameById.get(tid) ?? `未知教师(${tid})`,
        distribution: loads,
        diff,
        penalty,
      })
    }
  }
  worstTeacherDistributions.sort((a, b) => b.penalty - a.penalty)
  const sc5 = finalSummary.byType['SC5_TEACHER_DAY_BALANCE']

  // ── Class gap ──
  const classDayPeriods = new Map<string, Set<number>>()
  for (const pos of finalPositions.values()) {
    if (pos.room === 0) continue
    if (pos.day < 1 || pos.day > 5) continue
    const taskClasses = pos.slot.teachingTask.taskClasses ?? []
    if (taskClasses.length === 0) continue
    for (const tc of taskClasses) {
      const key = `${tc.classGroupId}-${pos.day}`
      let set = classDayPeriods.get(key)
      if (!set) { set = new Set<number>(); classDayPeriods.set(key, set) }
      set.add(pos.slotIdx)
    }
  }
  const cgNameById = new Map<number, string>()
  for (const cg of ctx.tasks.flatMap((t) => t.taskClasses.map((tc) => tc.classGroup))) {
    if (!cgNameById.has(cg.id)) cgNameById.set(cg.id, cg.name)
  }
  const worstClassGaps: Array<{ classGroupId: number; classGroupName: string; day: number; periods: number[]; gap: number; penalty: number }> = []
  for (const [key, periods] of classDayPeriods) {
    const sorted = [...periods].sort((a, b) => a - b)
    if (sorted.length < 2) continue
    let totalGap = 0
    for (let i = 1; i < sorted.length; i++) totalGap += sorted[i] - sorted[i - 1] - 1
    if (totalGap > 0) {
      const [cgId, dayStr] = key.split('-')
      const penalty = -2 * totalGap
      worstClassGaps.push({
        classGroupId: Number(cgId),
        classGroupName: cgNameById.get(Number(cgId)) ?? `班级(${cgId})`,
        day: Number(dayStr),
        periods: sorted,
        gap: totalGap,
        penalty,
      })
    }
  }
  worstClassGaps.sort((a, b) => b.penalty - a.penalty)
  const sc8 = finalSummary.byType['SC8_CLASS_GAP']

  // ── Room stability ──
  const taskRooms = new Map<number, Set<number>>()
  for (const pos of finalPositions.values()) {
    if (pos.room === 0) continue
    if (pos.day < 1 || pos.day > 5) continue
    let set = taskRooms.get(pos.slot.teachingTaskId)
    if (!set) { set = new Set<number>(); taskRooms.set(pos.slot.teachingTaskId, set) }
    set.add(pos.room)
  }
  const taskCourseNameById = new Map<number, string>()
  for (const t of ctx.tasks) taskCourseNameById.set(t.id, t.course?.name ?? `课程(${t.id})`)
  const mostRooms: Array<{ taskId: number; courseName: string; roomCount: number; penalty: number }> = []
  let tasksWithMultipleRooms = 0
  for (const [taskId, rooms] of taskRooms) {
    if (rooms.size > 1) tasksWithMultipleRooms++
    if (rooms.size > 1) {
      const penalty = -2 * (rooms.size - 1)
      mostRooms.push({
        taskId,
        courseName: taskCourseNameById.get(taskId) ?? `课程(${taskId})`,
        roomCount: rooms.size,
        penalty,
      })
    }
  }
  mostRooms.sort((a, b) => b.roomCount - a.roomCount)
  const sc9 = finalSummary.byType['SC9_TEACHING_TASK_ROOM_STABILITY']

  // ── Capacity utilization ──
  const utilizationDistribution: Record<string, number> = {
    '<0.30': 0,
    '0.30-0.60': 0,
    '0.60-0.90': 0,
    '0.90-1.00': 0,
    '>1.00': 0,
  }
  const sampleTight: Array<{ slotId: number; message?: string }> = []
  const sampleWaste: Array<{ slotId: number; message?: string }> = []
  let sc10TightCount = 0
  let sc10WasteCount = 0
  for (const pos of finalPositions.values()) {
    if (pos.room === 0) continue
    const room = ctx.roomById.get(pos.room)
    if (!room || room.capacity <= 0) continue
    // 简化：直接用 studentCount 计算
    let sc = 0
    for (const tc of pos.slot.teachingTask.taskClasses) {
      const c = tc.classGroup.studentCount
      if (c != null && c > 0) sc += c
      else sc += 50
    }
    if (sc <= 0) continue
    const u = sc / room.capacity
    if (u > 1.0) utilizationDistribution['>1.00']++
    else if (u > 0.90) utilizationDistribution['0.90-1.00']++
    else if (u >= 0.60) utilizationDistribution['0.60-0.90']++
    else if (u >= 0.30) utilizationDistribution['0.30-0.60']++
    else utilizationDistribution['<0.30']++
  }
  // SC10 detail 拆分：tight vs waste
  if (sc6 || finalSummary.byType['SC10_ROOM_CAPACITY_UTILIZATION']) {
    const sc10 = finalSummary.byType['SC10_ROOM_CAPACITY_UTILIZATION']
    if (sc10) {
      for (const s of sc10.samples) {
        if (s.message?.includes('tight')) {
          sc10TightCount++
          sampleTight.push({ slotId: s.slotId, message: s.message })
        } else if (s.message?.includes('waste')) {
          sc10WasteCount++
          sampleWaste.push({ slotId: s.slotId, message: s.message })
        }
      }
      // samples 只到 5 个，全量计数需要从 details 数
      sc10TightCount = 0
      sc10WasteCount = 0
      for (const d of finalScoreWithDetails.details) {
        if (d.type === 'SC10_ROOM_CAPACITY_UTILIZATION') {
          if (d.message?.includes('tight')) sc10TightCount++
          else if (d.message?.includes('waste')) sc10WasteCount++
        }
      }
    }
  }
  const sc10 = finalSummary.byType['SC10_ROOM_CAPACITY_UTILIZATION']

  // ── Old constraints ──
  const sc1 = finalSummary.byType['SC1_CROSS_BUILDING_BACK_TO_BACK']
  const sc2 = finalSummary.byType['SC2_SAME_DAY']
  const sc3 = finalSummary.byType['SC3_EXTREME_TIME_SLOT']
  const sc4 = finalSummary.byType['SC4_CROSS_CAMPUS']
  const minPert = finalSummary.byType['MINIMUM_PERTURBATION']

  let movedSlotCount = 0
  for (const pos of finalPositions.values()) {
    const orig = initialState.assignments.get(pos.slot.id)
    if (!orig) continue
    if (pos.day !== orig.dayOfWeek || pos.slotIdx !== orig.slotIndex || pos.room !== orig.roomId) {
      movedSlotCount++
    }
  }

  return {
    hardFeasibility: {
      initialHardScore: initialScoreWithDetails.hardScore,
      finalHardScore: finalScoreWithDetails.hardScore,
      allHardResolved: finalScoreWithDetails.hardScore === 0,
      byHard,
    },
    weekendAnalysis: {
      initialWeekendSlots: initialWeekendCount,
      finalWeekendSlots: finalWeekendCount,
      finalWeekendTasks,
      finalWeekendTeachers,
      finalWeekendClasses,
      sc7Penalty: sc7?.totalPenalty ?? 0,
      sc7Count: sc7?.count ?? 0,
      weekendByDay,
    },
    linxiaoAutomotiveAnalysis: {
      hc6Count: hc6?.count ?? 0,
      sc6Count: sc6?.count ?? 0,
      hc6Penalty: hc6?.totalPenalty ?? 0,
      sc6Penalty: sc6?.totalPenalty ?? 0,
      linxiaoRoomIds,
      linxiaoRoomNames: linxiaoRooms.map((r) => r.name),
    },
    teacherDayBalanceAnalysis: {
      sc5Count: sc5?.count ?? 0,
      sc5Penalty: sc5?.totalPenalty ?? 0,
      worstTeacherDistributions: worstTeacherDistributions.slice(0, 10),
      imbalancedTeacherCount,
    },
    classGapAnalysis: {
      sc8Count: sc8?.count ?? 0,
      sc8Penalty: sc8?.totalPenalty ?? 0,
      worstClassGaps: worstClassGaps.slice(0, 15),
    },
    roomStabilityAnalysis: {
      sc9Count: sc9?.count ?? 0,
      sc9Penalty: sc9?.totalPenalty ?? 0,
      tasksWithMultipleRooms,
      mostRooms: mostRooms.slice(0, 10),
    },
    capacityUtilizationAnalysis: {
      sc10TightCount,
      sc10WasteCount,
      sc10Penalty: sc10?.totalPenalty ?? 0,
      utilizationDistribution,
      sampleTight: sampleTight.slice(0, 5),
      sampleWaste: sampleWaste.slice(0, 5),
    },
    oldConstraintsAnalysis: {
      sc1: { count: sc1?.count ?? 0, penalty: sc1?.totalPenalty ?? 0 },
      sc2: { count: sc2?.count ?? 0, penalty: sc2?.totalPenalty ?? 0 },
      sc3: { count: sc3?.count ?? 0, penalty: sc3?.totalPenalty ?? 0 },
      sc4: { count: sc4?.count ?? 0, penalty: sc4?.totalPenalty ?? 0 },
      minPert: {
        count: minPert?.count ?? 0,
        penalty: minPert?.totalPenalty ?? 0,
        movedSlotCount,
        totalSlots: ctx.slots.length,
      },
    },
  }
}

// ─── Top 20 quality issues ─────────────────────────────────

function buildTopQualityIssues(
  breakdown: ConstraintStat[],
  analysis: QualityAnalysis,
): Array<{ rank: number; issue: string; severity: 'HIGH' | 'MEDIUM' | 'LOW'; detail: string }> {
  const issues: Array<{ rank: number; issue: string; severity: 'HIGH' | 'MEDIUM' | 'LOW'; detail: string }> = []
  let rank = 1

  // Hard feasibility
  if (!analysis.hardFeasibility.allHardResolved) {
    for (const id of ['HC1', 'HC2', 'HC3', 'HC4', 'HC5', 'HC6']) {
      const c = analysis.hardFeasibility.byHard[id]
      if (c > 0) {
        const stat = breakdown.find((s) => s.constraintId === id)
        issues.push({
          rank: rank++,
          issue: `${id} 仍触发 (${c} 次)`,
          severity: 'HIGH',
          detail: `硬约束未完全解决；任务可执行性受质疑。Top example: ${stat?.topExamples[0]?.message ?? 'n/a'}`,
        })
      }
    }
  }

  // Weekend
  if (analysis.weekendAnalysis.finalWeekendSlots > 0) {
    issues.push({
      rank: rank++,
      issue: `周末排课 ${analysis.weekendAnalysis.finalWeekendSlots} 个 slot`,
      severity: analysis.weekendAnalysis.finalWeekendSlots > 10 ? 'HIGH' : 'MEDIUM',
      detail: `涉及 ${analysis.weekendAnalysis.finalWeekendTasks.size} 个任务、${analysis.weekendAnalysis.finalWeekendTeachers.size} 个教师、${analysis.weekendAnalysis.finalWeekendClasses.size} 个班级；SC7 扣分 ${analysis.weekendAnalysis.sc7Penalty}`,
    })
  }

  // Linxiao/automotive
  if (analysis.linxiaoAutomotiveAnalysis.hc6Count > 0) {
    issues.push({
      rank: rank++,
      issue: `HC6 林校违规 ${analysis.linxiaoAutomotiveAnalysis.hc6Count} 次`,
      severity: 'HIGH',
      detail: '非汽车/混合/未知专业任务仍在林校教室；需在 F2A 分类或房间选择上做修复。',
    })
  }
  if (analysis.linxiaoAutomotiveAnalysis.sc6Count > 0) {
    issues.push({
      rank: rank++,
      issue: `SC6 汽车专业未优先林校 ${analysis.linxiaoAutomotiveAnalysis.sc6Count} 次`,
      severity: 'MEDIUM',
      detail: `SC6 扣分 ${analysis.linxiaoAutomotiveAnalysis.sc6Penalty}；可能受容量或教室可用性限制。`,
    })
  }

  // Teacher day balance
  if (analysis.teacherDayBalanceAnalysis.imbalancedTeacherCount > 0) {
    const worst = analysis.teacherDayBalanceAnalysis.worstTeacherDistributions[0]
    issues.push({
      rank: rank++,
      issue: `SC5 教师负载不均 ${analysis.teacherDayBalanceAnalysis.imbalancedTeacherCount} 个教师`,
      severity: 'MEDIUM',
      detail: worst ? `最严重: ${worst.teacherName} [${worst.distribution.join(',')}] (diff=${worst.diff}, penalty=${worst.penalty})` : '',
    })
  }

  // Class gap
  if (analysis.classGapAnalysis.sc8Count > 0) {
    const worst = analysis.classGapAnalysis.worstClassGaps[0]
    issues.push({
      rank: rank++,
      issue: `SC8 班级空洞 ${analysis.classGapAnalysis.sc8Count} 个 (classGroup, day) 对`,
      severity: 'MEDIUM',
      detail: worst ? `最严重: ${worst.classGroupName} 星期${worst.day} periods=[${worst.periods.join(',')}] gap=${worst.gap}` : '',
    })
  }

  // Room stability
  if (analysis.roomStabilityAnalysis.tasksWithMultipleRooms > 0) {
    const worst = analysis.roomStabilityAnalysis.mostRooms[0]
    issues.push({
      rank: rank++,
      issue: `SC9 教室不稳定 ${analysis.roomStabilityAnalysis.tasksWithMultipleRooms} 个 task 使用 ≥2 教室`,
      severity: 'MEDIUM',
      detail: worst ? `最严重: ${worst.courseName} 使用 ${worst.roomCount} 个不同教室` : '',
    })
  }

  // Capacity
  if (analysis.capacityUtilizationAnalysis.sc10TightCount > 5 || analysis.capacityUtilizationAnalysis.sc10WasteCount > 10) {
    issues.push({
      rank: rank++,
      issue: `SC10 容量利用率问题 tight=${analysis.capacityUtilizationAnalysis.sc10TightCount}, waste=${analysis.capacityUtilizationAnalysis.sc10WasteCount}`,
      severity: 'LOW',
      detail: `<0.30: ${analysis.capacityUtilizationAnalysis.utilizationDistribution['<0.30']}, 0.30-0.60: ${analysis.capacityUtilizationAnalysis.utilizationDistribution['0.30-0.60']}, 0.60-0.90: ${analysis.capacityUtilizationAnalysis.utilizationDistribution['0.60-0.90']}, 0.90-1.00: ${analysis.capacityUtilizationAnalysis.utilizationDistribution['0.90-1.00']}, >1.00: ${analysis.capacityUtilizationAnalysis.utilizationDistribution['>1.00']}`,
    })
  }

  // MIN_PERT
  const mp = analysis.oldConstraintsAnalysis.minPert
  if (mp.movedSlotCount > 0) {
    const moveRatio = mp.movedSlotCount / Math.max(1, mp.totalSlots)
    issues.push({
      rank: rank++,
      issue: `MIN_PERT 移动 ${mp.movedSlotCount}/${mp.totalSlots} slot (${(moveRatio * 100).toFixed(1)}%)`,
      severity: moveRatio > 0.5 ? 'HIGH' : moveRatio > 0.2 ? 'MEDIUM' : 'LOW',
      detail: `扣分 ${mp.penalty}；solver 在初始排课基础上做了较多调整。`,
    })
  }

  // SC1
  if (analysis.oldConstraintsAnalysis.sc1.count > 0) {
    issues.push({
      rank: rank++,
      issue: `SC1 跨楼栋连续 ${analysis.oldConstraintsAnalysis.sc1.count} 次`,
      severity: 'LOW',
      detail: `扣分 ${analysis.oldConstraintsAnalysis.sc1.penalty}；是结构问题或不可避免。`,
    })
  }

  return issues.slice(0, 20)
}

// ─── Main ──────────────────────────────────────────────────

async function main() {
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━')
  console.log('K22-L1: 真实 dev.db solver 质量评估')
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━')

  // 1. 加载 active semester
  const activeSemester = await prisma.semester.findFirst({ where: { isActive: true } })
  if (!activeSemester) {
    console.error('❌ 没有 active semester')
    process.exit(1)
  }
  console.log(`\nActive semester: ${activeSemester.code} (id=${activeSemester.id})`)

  // 2. 数据集摘要
  const dataset = await collectDatasetSummary(activeSemester.id)
  console.log(`\n数据集: tasks=${dataset.taskCount} slots=${dataset.slotCount} rooms=${dataset.roomCount} teachers=${dataset.teacherCount} courses=${dataset.courseCount} classGroups=${dataset.classGroupCount}`)
  console.log(`        slotsWithRoom=${dataset.slotsWithRoom} slotsWithTeacher=${dataset.slotsWithTeacher} weekendSlots=${dataset.weekendSlots}`)

  // 3. 加载 scheduling context
  console.log('\n加载 scheduling context...')
  const ctx = await loadSchedulingContext({ semesterId: activeSemester.id })
  console.log(`  → ${ctx.tasks.length} tasks, ${ctx.rooms.length} rooms, ${ctx.slots.length} slots`)

  // 4. 构建初始 state & 评分
  const { buildInitialState } = await import('../src/lib/scheduler/solver')
  const initialState = buildInitialState(ctx)
  const initialScoreWithDetails = calculateScoreWithDetails(ctx, initialState)
  console.log(`\n初始分数: hard=${initialScoreWithDetails.hardScore} soft=${initialScoreWithDetails.softScore}`)

  // 5. 运行 solver
  const solverConfig = {
    maxIterations: MAX_ITERATIONS,
    lahcWindowSize: LAHC_WINDOW_SIZE,
    randomSeed: FIXED_SEED,
  }
  console.log(`\n运行 solver: maxIterations=${MAX_ITERATIONS}, lahcWindowSize=${LAHC_WINDOW_SIZE}, randomSeed=${FIXED_SEED} ...`)
  const startTime = Date.now()
  let lastLog = 0
  const solveResult = solve(ctx, solverConfig, (iter, score) => {
    if (iter - lastLog >= 2000) {
      console.log(`  iter=${iter} hard=${score.hardScore} soft=${score.softScore}`)
      lastLog = iter
    }
  })
  const elapsedMs = Date.now() - startTime
  console.log(`\nSolver 完成: ${elapsedMs}ms, iterations=${solveResult.iterations}, usedSeed=${solveResult.usedSeed}`)
  console.log(`Best score: hard=${solveResult.bestScore.hardScore} soft=${solveResult.bestScore.softScore}`)
  if (solveResult.metrics) {
    const m = solveResult.metrics
    console.log(`Metrics: attempted=${m.attemptedMoves} accepted=${m.acceptedMoves} rejectedHardWorse=${m.rejectedHardWorseMoves} rejectedIncompatible=${m.rejectedIncompatibleMoves} noCandidate=${m.noCandidateIterations}`)
    console.log(`         roomOnly=${m.roomOnlyMoves} timeOnly=${m.timeOnlyMoves} timeAndRoom=${m.timeAndRoomMoves} bestHardScoreIter=${m.bestHardScoreIteration}`)
  }

  // 6. 最终分数 + details
  const finalState = solveResult.bestState
  const finalScoreWithDetails = calculateScoreWithDetails(ctx, finalState)
  const finalSummary = summarizeScore(finalScoreWithDetails)

  // 7. Constraint breakdown
  const constraintBreakdown = buildConstraintBreakdown(finalSummary)

  console.log(`\n=== Constraint Breakdown (final) ===`)
  console.log(`Hard: ${finalScoreWithDetails.hardScore}, Soft: ${finalScoreWithDetails.softScore}`)
  for (const c of constraintBreakdown) {
    if (c.triggerCount > 0) {
      console.log(`  ${c.constraintId} [${c.type}]: count=${c.triggerCount} penalty=${c.totalPenalty} (avg ${c.averagePenalty.toFixed(2)})`)
    }
  }

  // 8. 质量分析
  const qualityAnalysis = analyzeQuality(
    ctx, finalState, finalScoreWithDetails, finalSummary, initialState, initialScoreWithDetails,
  )

  // 9. Top issues
  const topIssues = buildTopQualityIssues(constraintBreakdown, qualityAnalysis)
  console.log(`\n=== Top ${topIssues.length} Quality Issues ===`)
  for (const issue of topIssues) {
    console.log(`  #${issue.rank} [${issue.severity}] ${issue.issue}`)
    console.log(`      ${issue.detail}`)
  }

  // 10. 写入 JSON 报告
  const report = {
    stage: 'K22-L1-REAL-SOLVER-QUALITY-EVALUATION-AND-TUNING',
    timestamp: new Date().toISOString(),
    solverConfig: {
      maxIterations: MAX_ITERATIONS,
      lahcWindowSize: LAHC_WINDOW_SIZE,
      randomSeed: FIXED_SEED,
      usedSeed: solveResult.usedSeed,
      semester: { id: activeSemester.id, code: activeSemester.code, name: activeSemester.name },
      readOnly: true,
      writesDb: false,
      writesScheduleSlot: false,
      writesSchedulingRun: false,
    },
    datasetSummary: {
      ...dataset,
      semesterScoped: true,
    },
    baselineRun: {
      elapsedMs,
      iterations: solveResult.iterations,
      initialHardScore: initialScoreWithDetails.hardScore,
      initialSoftScore: initialScoreWithDetails.softScore,
      finalHardScore: finalScoreWithDetails.hardScore,
      finalSoftScore: finalScoreWithDetails.softScore,
      hardScoreImprovement: finalScoreWithDetails.hardScore - initialScoreWithDetails.hardScore,
      softScoreImprovement: finalScoreWithDetails.softScore - initialScoreWithDetails.softScore,
      metrics: solveResult.metrics ?? null,
    },
    tunedRun: null,
    scoreBreakdown: constraintBreakdown,
    hardFeasibility: qualityAnalysis.hardFeasibility,
    weekendAnalysis: {
      ...qualityAnalysis.weekendAnalysis,
      finalWeekendTasks: Array.from(qualityAnalysis.weekendAnalysis.finalWeekendTasks),
      finalWeekendTaskCount: qualityAnalysis.weekendAnalysis.finalWeekendTasks.size,
      finalWeekendTeachers: Array.from(qualityAnalysis.weekendAnalysis.finalWeekendTeachers),
      finalWeekendTeacherCount: qualityAnalysis.weekendAnalysis.finalWeekendTeachers.size,
      finalWeekendClasses: Array.from(qualityAnalysis.weekendAnalysis.finalWeekendClasses),
      finalWeekendClassCount: qualityAnalysis.weekendAnalysis.finalWeekendClasses.size,
    },
    linxiaoAutomotiveAnalysis: qualityAnalysis.linxiaoAutomotiveAnalysis,
    teacherDayBalanceAnalysis: qualityAnalysis.teacherDayBalanceAnalysis,
    classGapAnalysis: qualityAnalysis.classGapAnalysis,
    roomStabilityAnalysis: qualityAnalysis.roomStabilityAnalysis,
    capacityUtilizationAnalysis: qualityAnalysis.capacityUtilizationAnalysis,
    oldConstraintsAnalysis: qualityAnalysis.oldConstraintsAnalysis,
    topQualityIssues: topIssues,
    tuningDecision: {
      applied: false,
      reason: 'baseline 分析先记录；如后续发现明显权重失衡，将在 K22-L1B 阶段调参。',
    },
    verification: {
      k22c: '待运行 verify-score-regression-harness-k22-c.ts',
      f11: '待运行 verify-capacity-preference-constraint-k22-f11.ts',
      f8: '待运行 verify-classroom-stability-constraint-k22-f8.ts',
      f6: '待运行 verify-class-gap-reduction-constraint-k22-f6.ts',
      f4: '待运行 verify-teacher-day-balance-constraint-k22-f4.ts',
      f3: '待运行 verify-specialty-campus-weekend-constraints-k22-f3.ts',
    },
    blocking: !qualityAnalysis.hardFeasibility.allHardResolved,
    recommendedNextStage: qualityAnalysis.hardFeasibility.allHardResolved
      ? 'K22-L1B-SOFT-WEIGHT-TUNING'
      : 'K22-L1A-HARD-FEASIBILITY-DEBUG',
  }

  mkdirSync(OUTPUT_DIR, { recursive: true })
  const jsonPath = join(OUTPUT_DIR, 'k22-real-solver-quality-evaluation.json')
  writeFileSync(jsonPath, JSON.stringify(report, null, 2), 'utf-8')
  console.log(`\n✅ 报告已写入: ${jsonPath}`)

  // 输出 baseline 摘要到 stdout（方便 K22-L1B 阶段 before/after 对比）
  console.log('\n=== Baseline Summary ===')
  console.log(`hard: ${initialScoreWithDetails.hardScore} → ${finalScoreWithDetails.hardScore}`)
  console.log(`soft: ${initialScoreWithDetails.softScore} → ${finalScoreWithDetails.softScore}`)
  console.log(`elapsed: ${elapsedMs}ms, iters: ${solveResult.iterations}`)
  console.log(`accepted: ${solveResult.metrics?.acceptedMoves ?? 0}/${solveResult.metrics?.attemptedMoves ?? 0}`)

  await prisma.$disconnect()
  process.exit(report.blocking ? 1 : 0)
}

main().catch(async (e) => {
  console.error('Evaluation error:', e)
  await prisma.$disconnect()
  process.exit(2)
})
