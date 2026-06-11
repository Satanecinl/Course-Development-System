import { Prisma } from '@prisma/client'

/** 带关联的 TeachingTask 类型 */
export type TaskWithRelations = Prisma.TeachingTaskGetPayload<{
  include: {
    course: true
    teacher: true
    taskClasses: { include: { classGroup: true } }
  }
}>

/** 带关联的 ScheduleSlot 类型 */
export type SlotWithRelations = Prisma.ScheduleSlotGetPayload<{
  include: {
    room: true
    // K34-A3: secondary rooms for composite expressions
    additionalRooms: {
      include: { room: true }
    }
    teachingTask: {
      include: {
        course: true
        teacher: true
        taskClasses: { include: { classGroup: true } }
      }
    }
  }
}>

/** 带可用性的 Room 类型 */
export type RoomWithAvailability = Prisma.RoomGetPayload<{
  include: { availabilities: true }
}>

/** 内存调度上下文 — 所有数据一次加载，O(1) 访问 */
export interface SchedulingContext {
  /** 原始数据 */
  tasks: TaskWithRelations[]
  rooms: RoomWithAvailability[]
  slots: SlotWithRelations[]

  /** 单键索引 */
  taskById: Map<number, TaskWithRelations>
  roomById: Map<number, RoomWithAvailability>

  /** 任务 → 其排课时段 */
  slotsByTask: Map<number, SlotWithRelations[]>

  /** 复合键索引：`${id}-${day}-${slot}` → Slot[] */
  slotsByRoom: Map<string, SlotWithRelations[]>
  slotsByTeacher: Map<string, SlotWithRelations[]>
  slotsByClass: Map<string, SlotWithRelations[]>
}

/** 复合键生成器 */
export function roomKey(roomId: number, day: number, slot: number): string {
  return `${roomId}-${day}-${slot}`
}

export function teacherKey(teacherId: number, day: number, slot: number): string {
  return `${teacherId}-${day}-${slot}`
}

export function classKey(classGroupId: number, day: number, slot: number): string {
  return `${classGroupId}-${day}-${slot}`
}

// ── Phase B: 状态、移动、评分 ──

/** 排课状态：记录每个 Slot 当前分配的位置 */
export interface ScheduleState {
  /** key: slotId → 当前分配的 day/room */
  assignments: Map<number, { dayOfWeek: number; slotIndex: number; roomId: number }>
  /** 原始分配（用于 HC6 锁定检测和 SC6 扰动检测） */
  originalAssignments: Map<number, { dayOfWeek: number; slotIndex: number; roomId: number }>
}

/** 一次移动操作 */
export interface Move {
  slotId: number
  newDay: number
  newSlotIndex: number
  newRoomId: number
}

/** 评分结果 */
export interface Score {
  hardScore: number // <= 0，0 表示无硬冲突
  softScore: number // <= 0，0 表示无软约束违反
}

/** 求解器配置 */
export interface SolverConfig {
  maxIterations: number
  lahcWindowSize: number
  lockedSlotIds?: Set<number>
  /** 随机种子，用于复现 solver 结果 */
  randomSeed?: number | null
}

// ── Phase B+: 诊断 ──

/** 单条评分详情 */
export interface ScoreDetail {
  type: string // 如 HC1_ROOM_CONFLICT, SC2_SAME_DAY 等
  level: 'HARD' | 'SOFT'
  penalty: number // 负数
  slotId?: number
  relatedSlotId?: number
  message?: string
}

/** 带详情的评分结果 */
export interface ScoreWithDetails extends Score {
  details: ScoreDetail[]
}

/** 评分汇总 */
export interface ScoreSummary {
  hardScore: number
  softScore: number
  totalDetails: number
  byType: Record<string, {
    count: number
    totalPenalty: number
    level: 'HARD' | 'SOFT'
    samples: ScoreDetail[]
  }>
}

/** 字典序比较：hardScore 优先，越高越好（负数越小越差） */
export function isScoreBetter(a: Score, b: Score): boolean {
  if (a.hardScore > b.hardScore) return true
  if (a.hardScore < b.hardScore) return false
  return a.softScore > b.softScore
}
