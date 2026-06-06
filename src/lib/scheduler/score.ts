import type {
  SchedulingContext,
  ScheduleState,
  Move,
  Score,
  ScoreDetail,
  ScoreWithDetails,
  SlotWithRelations,
  TaskWithRelations,
  RoomWithAvailability,
} from './types'
import { expandWeeks, type WeekConstraint } from '@/lib/conflict'
import { getTaskStudentCount } from './capacity'

// ── 评分常量 ──
const HARD_PENALTY = -1000
const SOFT_SC1_CROSS_BUILDING = -5
const SOFT_SC2_SAME_DAY = -10
const SOFT_SC3_EXTREME_TIME = -1
const SOFT_SC4_CROSS_CAMPUS = -5
const SOFT_MINIMUM_PERTURBATION = -2
const HC6_NON_AUTOMOTIVE_LINXIAO_PENALTY = -1000
const SC6_AUTOMOTIVE_NON_LINXIAO_PENALTY = -20
const SC7_WEEKEND_PENALTY = -15

// ── 周次缓存 ──
const weekSetCache = new Map<number, Set<number>>()

function getWeekSet(task: TaskWithRelations): Set<number> {
  let cached = weekSetCache.get(task.id)
  if (!cached) {
    const wc: WeekConstraint = {
      start: task.startWeek,
      end: task.endWeek,
      type: task.weekType as WeekConstraint['type'],
    }
    cached = expandWeeks(wc)
    weekSetCache.set(task.id, cached)
  }
  return cached
}

function hasWeekOverlap(taskA: TaskWithRelations, taskB: TaskWithRelations): boolean {
  const setA = getWeekSet(taskA)
  const setB = getWeekSet(taskB)
  const [smaller, larger] = setA.size <= setB.size ? [setA, setB] : [setB, setA]
  for (const w of smaller) {
    if (larger.has(w)) return true
  }
  return false
}

/** 获取 slot 的当前位置 */
function getPos(
  slot: SlotWithRelations,
  state: ScheduleState,
): { day: number; idx: number; room: number } {
  const a = state.assignments.get(slot.id)
  return a
    ? { day: a.dayOfWeek, idx: a.slotIndex, room: a.roomId }
    : { day: slot.dayOfWeek, idx: slot.slotIndex, room: slot.roomId ?? 0 }
}

// ── HC5: 教室可用性 ──

/** 从 room.name 推断楼栋 */
function inferBuilding(roomName: string): string {
  if (roomName.includes('林校')) return '林校'
  if (roomName.includes('实训')) return '实训楼'
  if (/^11-/.test(roomName)) return '11号楼'
  if (/^12-/.test(roomName)) return '12号楼'
  if (/^1-/.test(roomName)) return '1号楼'
  return 'UNKNOWN'
}

/** 获取教室楼栋（优先 building 字段，否则从 name 推断） */
function getBuilding(room: RoomWithAvailability): string {
  if (room.building) return room.building
  return inferBuilding(room.name)
}

/** 检查教室在指定时段是否可用 */
function isRoomAvailable(
  ctx: SchedulingContext,
  roomId: number,
  day: number,
  slotIdx: number,
): boolean {
  const room = ctx.roomById.get(roomId)
  if (!room) return false
  // RoomAvailability 默认全部可用，除非有明确记录 available=false
  for (const avail of room.availabilities) {
    if (avail.dayOfWeek === day && avail.slotIndex === slotIdx && !avail.available) {
      return false
    }
  }
  return true
}

// ── HC6 / SC6 / SC7: 专业教室约束与周末约束 ──

// K22-F2A: 汽车专业关键词（classGroup membership 为主信号，courseName/remark 为辅助）
const AUTOMOTIVE_KEYWORDS = ['汽车', '车辆', '新能源', '智能网联', '汽修']

/** 判断教室是否为林校 (K22-F2: strict keyword "林校" only) */
function isLinxiaoRoomName(room: RoomWithAvailability): boolean {
  if (room.name.includes('林校')) return true
  if (room.building && room.building.includes('林校')) return true
  return false
}

/**
 * K22-F2A 5-class specialty classification.
 * classGroup membership 是 primary hard-rule signal；courseName / remark 只是 auxiliary。
 */
type SpecialtyClassification =
  | 'AUTOMOTIVE_ONLY'
  | 'NON_AUTOMOTIVE_ONLY'
  | 'MIXED_AUTOMOTIVE_AND_NON_AUTOMOTIVE'
  | 'NO_CLASSGROUP_AUX_AUTOMOTIVE_SIGNAL'
  | 'UNKNOWN_NO_SIGNAL'

function classifySpecialty(task: TaskWithRelations): SpecialtyClassification {
  const cgs = task.taskClasses.map(tc => tc.classGroup.name)
  // Case 1: no classGroup membership at all
  if (cgs.length === 0) {
    const auxAuto =
      (task.course?.name != null && AUTOMOTIVE_KEYWORDS.some(kw => task.course!.name.includes(kw))) ||
      (task.remark != null && AUTOMOTIVE_KEYWORDS.some(kw => task.remark!.includes(kw)))
    return auxAuto ? 'NO_CLASSGROUP_AUX_AUTOMOTIVE_SIGNAL' : 'UNKNOWN_NO_SIGNAL'
  }
  // Case 2: at least one classGroup exists — classGroup membership dominates
  const anyAuto = cgs.some(n => AUTOMOTIVE_KEYWORDS.some(kw => n.includes(kw)))
  const anyNonAuto = cgs.some(n => !AUTOMOTIVE_KEYWORDS.some(kw => n.includes(kw)))
  if (anyAuto && anyNonAuto) return 'MIXED_AUTOMOTIVE_AND_NON_AUTOMOTIVE'
  if (anyAuto) return 'AUTOMOTIVE_ONLY'
  return 'NON_AUTOMOTIVE_ONLY'
}

/** 计算 HC6 penalty: 非汽车专业/混合/未知任务在 Linxiao 教室 */
function computeHC6Penalty(cls: SpecialtyClassification, isLx: boolean): number {
  if (!isLx) return 0
  if (cls === 'AUTOMOTIVE_ONLY') return 0
  return HC6_NON_AUTOMOTIVE_LINXIAO_PENALTY
}

/** 计算 SC6 penalty: 汽车专业任务不在 Linxiao 教室 */
function computeSC6Penalty(cls: SpecialtyClassification, isLx: boolean): number {
  if (cls !== 'AUTOMOTIVE_ONLY') return 0
  if (isLx) return 0
  return SC6_AUTOMOTIVE_NON_LINXIAO_PENALTY
}

// ── SC5: 教师每日课时负载均衡 (K22-F4) ──

const TEACHING_DAYS = [1, 2, 3, 4, 5]
const SC5_PENALTY_PER_EXCESS = -3
const SC5_THRESHOLD = 2
const SC5_MIN_TOTAL = 3

/**
 * 为教师构建 dailyCounts（5 个教学日初始化为 0）。
 * 只统计 room != 0 且 dayOfWeek in [1..5] 的 slot。
 * 适用于 full score（遍历所有 slots）和 delta score（遍历 slots 排除 moved）。
 */
function buildTeacherDailyCounts(
  teacherId: number,
  slots: SlotWithRelations[],
  state: ScheduleState,
  excludeSlotId?: number,
): Map<number, number> {
  const counts = new Map<number, number>()
  for (const d of TEACHING_DAYS) counts.set(d, 0)
  for (const slot of slots) {
    if (slot.id === excludeSlotId) continue
    if (slot.teachingTask.teacherId !== teacherId) continue
    const pos = getPos(slot, state)
    if (pos.room === 0) continue
    if (pos.day < 1 || pos.day > 5) continue // 只统计教学日
    counts.set(pos.day, (counts.get(pos.day) ?? 0) + 1)
  }
  return counts
}

/** 根据 dailyCounts 计算 SC5 penalty（纯函数，可直接用于 full 和 delta） */
function computeTeacherDayBalancePenalty(counts: Map<number, number>): number {
  const loads = TEACHING_DAYS.map(d => counts.get(d) ?? 0)
  const total = loads.reduce((a, b) => a + b, 0)
  if (total < SC5_MIN_TOTAL) return 0
  const maxLoad = Math.max(...loads)
  const minLoad = Math.min(...loads) // 包含 0 课日
  const diff = maxLoad - minLoad
  if (diff <= SC5_THRESHOLD) return 0
  return SC5_PENALTY_PER_EXCESS * (diff - SC5_THRESHOLD)
}

/**
 * 全量计算分数，返回带详情的结果
 */
export function calculateScoreWithDetails(
  ctx: SchedulingContext,
  state: ScheduleState,
): ScoreWithDetails {
  let hardScore = 0
  let softScore = 0
  const details: ScoreDetail[] = []
  const slots = ctx.slots

  const positions = slots.map((s) => ({ slot: s, ...getPos(s, state) }))

  // ── HC1/HC2/HC3: 成对检测 ──
  for (let i = 0; i < positions.length; i++) {
    const a = positions[i]
    if (a.room === 0) continue

    for (let j = i + 1; j < positions.length; j++) {
      const b = positions[j]
      if (b.room === 0) continue
      if (a.day !== b.day || a.idx !== b.idx) continue
      if (!hasWeekOverlap(a.slot.teachingTask, b.slot.teachingTask)) continue

      // HC1: 教室冲突
      if (a.room === b.room) {
        hardScore += HARD_PENALTY
        details.push({
          type: 'HC1_ROOM_CONFLICT', level: 'HARD', penalty: HARD_PENALTY,
          slotId: a.slot.id, relatedSlotId: b.slot.id,
          message: `教室冲突: ${a.slot.teachingTask.course?.name ?? '?'} 与 ${b.slot.teachingTask.course?.name ?? '?'} 同时使用教室 ${ctx.roomById.get(a.room)?.name ?? a.room}`,
        })
      }

      // HC2: 教师冲突
      if (a.slot.teachingTask.teacherId != null &&
          a.slot.teachingTask.teacherId === b.slot.teachingTask.teacherId) {
        hardScore += HARD_PENALTY
        details.push({
          type: 'HC2_TEACHER_CONFLICT', level: 'HARD', penalty: HARD_PENALTY,
          slotId: a.slot.id, relatedSlotId: b.slot.id,
          message: `教师冲突: ${a.slot.teachingTask.teacher?.name ?? '?'} 同时有课 ${a.slot.teachingTask.course?.name ?? '?'} 与 ${b.slot.teachingTask.course?.name ?? '?'}`,
        })
      }

      // HC3: 班级冲突
      for (const tcA of a.slot.teachingTask.taskClasses) {
        for (const tcB of b.slot.teachingTask.taskClasses) {
          if (tcA.classGroupId === tcB.classGroupId) {
            hardScore += HARD_PENALTY
            details.push({
              type: 'HC3_CLASS_CONFLICT', level: 'HARD', penalty: HARD_PENALTY,
              slotId: a.slot.id, relatedSlotId: b.slot.id,
              message: `班级冲突: ${tcA.classGroup.name} 同时有课 ${a.slot.teachingTask.course?.name ?? '?'} 与 ${b.slot.teachingTask.course?.name ?? '?'}`,
            })
            break
          }
        }
      }
    }
  }

  // ── HC4: 容量 ──
  for (const p of positions) {
    if (p.room === 0) continue
    const room = ctx.roomById.get(p.room)
    if (!room) continue
    const studentInfo = getTaskStudentCount(p.slot.teachingTask, ctx)
    if (studentInfo.studentCount > room.capacity) {
      hardScore += HARD_PENALTY
      details.push({
        type: 'HC4_CAPACITY', level: 'HARD', penalty: HARD_PENALTY,
        slotId: p.slot.id,
        message: `容量不足: ${p.slot.teachingTask.course?.name ?? '?'} 需要 ${studentInfo.studentCount} 人 (${studentInfo.countSource})，教室 ${room.name} 容量 ${room.capacity}`,
      })
    }
  }

  // ── HC5: 教室不可用 ──
  for (const p of positions) {
    if (p.room === 0) continue
    if (!isRoomAvailable(ctx, p.room, p.day, p.idx)) {
      hardScore += HARD_PENALTY
      const room = ctx.roomById.get(p.room)
      details.push({
        type: 'HC5_ROOM_UNAVAILABLE', level: 'HARD', penalty: HARD_PENALTY,
        slotId: p.slot.id,
        message: `教室不可用: ${room?.name ?? p.room} 在周${p.day}第${p.idx}节不可用`,
      })
    }
  }

  // ── HC6: 锁定课程被移动 ──
  for (const p of positions) {
    const orig = state.originalAssignments.get(p.slot.id)
    if (!orig) continue
    // 检查是否在 lockedSlotIds 中（通过 context 传递）
    // 当前实现：如果 originalAssignments 存在且位置不同，视为被移动
    if (p.day !== orig.dayOfWeek || p.idx !== orig.slotIndex || p.room !== orig.roomId) {
      // 只有在 lockedSlotIds 中的才算违规
      // lockedSlotIds 通过 context 传递，这里用一个标记
      // 实际检查在 solver 层面通过 lockedSlotIds 控制
    }
  }

  // ── SC1: 跨楼栋连续课程（教师 + 班级维度） ──
  for (const p of positions) {
    if (p.room === 0) continue
    const pRoom = ctx.roomById.get(p.room)
    if (!pRoom) continue
    const pBuilding = getBuilding(pRoom)
    if (pBuilding === 'UNKNOWN') continue

    for (const q of positions) {
      if (q.slot.id <= p.slot.id) continue // 避免重复
      if (q.room === 0) continue
      if (q.day !== p.day) continue
      if (Math.abs(q.idx - p.idx) !== 1) continue

      const qRoom = ctx.roomById.get(q.room)
      if (!qRoom) continue
      const qBuilding = getBuilding(qRoom)
      if (qBuilding === 'UNKNOWN' || pBuilding === qBuilding) continue

      // 检查是否同一教师
      const sameTeacher = p.slot.teachingTask.teacherId != null &&
        p.slot.teachingTask.teacherId === q.slot.teachingTask.teacherId

      // 检查是否有共同班级
      let sharedClass = false
      for (const tcP of p.slot.teachingTask.taskClasses) {
        for (const tcQ of q.slot.teachingTask.taskClasses) {
          if (tcP.classGroupId === tcQ.classGroupId) { sharedClass = true; break }
        }
        if (sharedClass) break
      }

      if (sameTeacher || sharedClass) {
        softScore += SOFT_SC1_CROSS_BUILDING
        details.push({
          type: 'SC1_CROSS_BUILDING_BACK_TO_BACK', level: 'SOFT', penalty: SOFT_SC1_CROSS_BUILDING,
          slotId: p.slot.id, relatedSlotId: q.slot.id,
          message: `跨楼栋连续课: ${pBuilding}→${qBuilding} (${p.slot.teachingTask.course?.name ?? '?'} 与 ${q.slot.teachingTask.course?.name ?? '?'})`,
        })
      }
    }
  }

  // ── SC2: 同天多节 ──
  const taskDayCount = new Map<string, number>()
  for (const p of positions) {
    const key = `${p.slot.teachingTaskId}-${p.day}`
    taskDayCount.set(key, (taskDayCount.get(key) || 0) + 1)
  }
  for (const [key, count] of taskDayCount) {
    if (count > 1) {
      const penalty = SOFT_SC2_SAME_DAY * (count - 1)
      softScore += penalty
      const [taskId] = key.split('-')
      details.push({
        type: 'SC2_SAME_DAY', level: 'SOFT', penalty,
        message: `同天多节: 任务 ${taskId} 在同一天有 ${count} 节课`,
      })
    }
  }

  // ── SC3: 极端时间 ──
  for (const p of positions) {
    if (p.idx >= 5) {
      softScore += SOFT_SC3_EXTREME_TIME
      details.push({
        type: 'SC3_EXTREME_TIME_SLOT', level: 'SOFT', penalty: SOFT_SC3_EXTREME_TIME,
        slotId: p.slot.id,
        message: `极端时间: ${p.slot.teachingTask.course?.name ?? '?'} 在第${p.idx}节（偏晚）`,
      })
    }
  }

  // ── SC4: 跨校区通勤（同 task 同天相邻 slot building 不同） ──
  for (const p of positions) {
    if (p.room === 0) continue
    const pRoom = ctx.roomById.get(p.room)
    if (!pRoom?.building) continue
    for (const q of positions) {
      if (q.slot.id === p.slot.id) continue
      if (q.slot.teachingTaskId !== p.slot.teachingTaskId) continue
      if (q.day === p.day && Math.abs(q.idx - p.idx) === 1 && q.room !== 0) {
        const qRoom = ctx.roomById.get(q.room)
        if (qRoom?.building && pRoom.building !== qRoom.building) {
          softScore += SOFT_SC4_CROSS_CAMPUS
          details.push({
            type: 'SC4_CROSS_CAMPUS', level: 'SOFT', penalty: SOFT_SC4_CROSS_CAMPUS,
            slotId: p.slot.id, relatedSlotId: q.slot.id,
            message: `跨校区通勤: ${pRoom.building}→${qRoom.building} (${p.slot.teachingTask.course?.name ?? '?'})`,
          })
        }
      }
    }
  }

  // ── SC MINIMUM_PERTURBATION（原 SC6） ──
  for (const p of positions) {
    const orig = state.originalAssignments.get(p.slot.id)
    if (!orig) continue
    if (p.day !== orig.dayOfWeek || p.idx !== orig.slotIndex || p.room !== orig.roomId) {
      softScore += SOFT_MINIMUM_PERTURBATION
      details.push({
        type: 'MINIMUM_PERTURBATION', level: 'SOFT', penalty: SOFT_MINIMUM_PERTURBATION,
        slotId: p.slot.id,
        message: `扰动: ${p.slot.teachingTask.course?.name ?? '?'} 从原位置移动`,
      })
    }
  }

  // ── HC6 / SC6: 专业教室约束 (K22-F2A classification) ──
  // classGroup membership 是 primary hard-rule signal；courseName/remark 只是 auxiliary
  for (const p of positions) {
    if (p.room === 0) continue
    const room = ctx.roomById.get(p.room)
    if (!room) continue
    const cls = classifySpecialty(p.slot.teachingTask)
    const isLx = isLinxiaoRoomName(room)
    // HC6: 非汽车专业/混合/未知任务在 Linxiao 教室 → hard penalty
    const hc6 = computeHC6Penalty(cls, isLx)
    if (hc6 !== 0) {
      hardScore += hc6
      details.push({
        type: 'HC6_NON_AUTOMOTIVE_FORBID_LINXIAO', level: 'HARD', penalty: hc6,
        slotId: p.slot.id,
        message: `林校教室限制: ${p.slot.teachingTask.course?.name ?? '?'} (分类: ${cls}) 不可在林校教室 ${room.name}`,
      })
    }
    // SC6: 汽车专业任务不在 Linxiao 教室 → soft penalty
    const sc6 = computeSC6Penalty(cls, isLx)
    if (sc6 !== 0) {
      softScore += sc6
      details.push({
        type: 'SC6_AUTOMOTIVE_PREFERS_LINXIAO', level: 'SOFT', penalty: sc6,
        slotId: p.slot.id,
        message: `汽车专业优先林校: ${p.slot.teachingTask.course?.name ?? '?'} 在非林校教室 ${room.name}`,
      })
    }
  }

  // ── SC7: 周末一般不排课 (K22-F3) ──
  for (const p of positions) {
    if (p.day >= 6) {
      softScore += SC7_WEEKEND_PENALTY
      details.push({
        type: 'SC7_WEEKEND_AVOIDANCE', level: 'SOFT', penalty: SC7_WEEKEND_PENALTY,
        slotId: p.slot.id,
        message: `周末排课: ${p.slot.teachingTask.course?.name ?? '?'} 在周${p.day === 6 ? '六' : '日'}第${p.idx}节`,
      })
    }
  }

  // ── SC5: 教师每日课时负载均衡 (K22-F4) ──
  // 统计每个教师在 5 个教学日（1-5）中的课程数，当日负载差异 > 2 时惩罚
  const teacherDayCounts = new Map<number, Map<number, number>>()
  for (const p of positions) {
    if (p.room === 0) continue
    const tid = p.slot.teachingTask.teacherId
    if (tid == null) continue
    if (p.day < 1 || p.day > 5) continue // 只统计教学日
    let dayMap = teacherDayCounts.get(tid)
    if (!dayMap) {
      dayMap = new Map()
      for (const d of TEACHING_DAYS) dayMap.set(d, 0)
      teacherDayCounts.set(tid, dayMap)
    }
    dayMap.set(p.day, (dayMap.get(p.day) ?? 0) + 1)
  }
  for (const [tid, dayMap] of teacherDayCounts) {
    const penalty = computeTeacherDayBalancePenalty(dayMap)
    if (penalty !== 0) {
      softScore += penalty
      const loads = TEACHING_DAYS.map(d => dayMap.get(d) ?? 0)
      const maxLoad = Math.max(...loads)
      const minLoad = Math.min(...loads)
      details.push({
        type: 'SC5_TEACHER_DAY_BALANCE', level: 'SOFT', penalty,
        message: `教师 ${tid} 负载不均: 最忙日 ${maxLoad} 节，最闲日 ${minLoad} 节`,
      })
    }
  }

  return { hardScore, softScore, details }
}

/**
 * 全量计算初始分数（兼容旧接口）
 */
export function calculateInitialScore(ctx: SchedulingContext, state: ScheduleState): Score {
  const result = calculateScoreWithDetails(ctx, state)
  return { hardScore: result.hardScore, softScore: result.softScore }
}

/**
 * 增量评分：计算一次移动的 delta
 */
export function calculateDeltaScore(
  ctx: SchedulingContext,
  state: ScheduleState,
  move: Move,
): { deltaHard: number; deltaSoft: number } {
  const slot = ctx.slots.find((s) => s.id === move.slotId)
  if (!slot) return { deltaHard: 0, deltaSoft: 0 }

  const old = state.assignments.get(move.slotId)
  if (!old) return { deltaHard: 0, deltaSoft: 0 }

  const task = slot.teachingTask
  let deltaHard = 0
  let deltaSoft = 0

  // ── HC1/HC2/HC3 ──
  for (const other of ctx.slots) {
    if (other.id === slot.id) continue
    const oPos = getPos(other, state)
    if (oPos.room === 0) continue

    const overlap = hasWeekOverlap(task, other.teachingTask)

    // 旧位置冲突移除
    if (old.dayOfWeek === oPos.day && old.slotIndex === oPos.idx && overlap) {
      if (old.roomId === oPos.room) deltaHard -= HARD_PENALTY
      if (task.teacherId != null && task.teacherId === other.teachingTask.teacherId) {
        deltaHard -= HARD_PENALTY
      }
      for (const tc of task.taskClasses) {
        for (const otc of other.teachingTask.taskClasses) {
          if (tc.classGroupId === otc.classGroupId) { deltaHard -= HARD_PENALTY; break }
        }
      }
    }

    // 新位置冲突添加
    if (move.newDay === oPos.day && move.newSlotIndex === oPos.idx && overlap) {
      if (move.newRoomId === oPos.room) deltaHard += HARD_PENALTY
      if (task.teacherId != null && task.teacherId === other.teachingTask.teacherId) {
        deltaHard += HARD_PENALTY
      }
      for (const tc of task.taskClasses) {
        for (const otc of other.teachingTask.taskClasses) {
          if (tc.classGroupId === otc.classGroupId) { deltaHard += HARD_PENALTY; break }
        }
      }
    }
  }

  // HC4 容量
  const oldRoom = ctx.roomById.get(old.roomId)
  const newRoom = ctx.roomById.get(move.newRoomId)
  const studentInfo = getTaskStudentCount(task, ctx)
  if (oldRoom && studentInfo.studentCount > oldRoom.capacity) deltaHard -= HARD_PENALTY
  if (newRoom && studentInfo.studentCount > newRoom.capacity) deltaHard += HARD_PENALTY

  // HC5 教室可用性
  const oldAvail = isRoomAvailable(ctx, old.roomId, old.dayOfWeek, old.slotIndex)
  const newAvail = isRoomAvailable(ctx, move.newRoomId, move.newDay, move.newSlotIndex)
  if (!oldAvail) deltaHard -= HARD_PENALTY
  if (!newAvail) deltaHard += HARD_PENALTY

  // HC6 锁定课程移动
  // HC6 is intentionally not counted in delta scoring because full scoring (calculateScoreWithDetails)
  // currently does not count HC6. Locked slots are controlled by solver movability / lockedSlotIds,
  // not by a delta-only hard penalty that would cause scoring mismatch.
  // See K9-B-SCORING-0 audit for details.

  // orig is still needed for SC MINIMUM_PERTURBATION below
  const orig = state.originalAssignments.get(move.slotId)

  // SC2 同天
  const siblings = ctx.slotsByTask.get(task.id)
  if (siblings) {
    let oldSame = 0, newSame = 0
    for (const sib of siblings) {
      if (sib.id === slot.id) continue
      const sp = getPos(sib, state)
      if (sp.day === old.dayOfWeek) oldSame++
      if (sp.day === move.newDay) newSame++
    }
    deltaSoft -= SOFT_SC2_SAME_DAY * oldSame
    deltaSoft += SOFT_SC2_SAME_DAY * newSame
  }

  // SC3 极端时间
  if (old.slotIndex >= 5) deltaSoft -= SOFT_SC3_EXTREME_TIME
  if (move.newSlotIndex >= 5) deltaSoft += SOFT_SC3_EXTREME_TIME

  // SC1 跨楼栋连续课（教师 + 班级维度）
  // Mirror calculateScoreWithDetails SC1 detection: for each "other" slot, check
  // whether (slot, other) pair triggers SC1 at the OLD position and at the NEW position.
  // deltaSoft = sum over others of (newPenalty - oldPenalty) where penalty is -5 if triggered else 0.
  // Clearing a trigger: +5. Introducing a trigger: -5.
  for (const other of ctx.slots) {
    if (other.id === slot.id) continue
    const oPos = getPos(other, state)
    if (oPos.room === 0) continue

    const otherRoom = ctx.roomById.get(oPos.room)
    if (!otherRoom) continue

    // Pair triggers SC1 if: same day + |idx diff| = 1 + both rooms have non-UNKNOWN building
    // + different building + (same teacher OR shared class).
    const sameTeacher = task.teacherId != null && task.teacherId === other.teachingTask.teacherId
    if (!sameTeacher) {
      // Check shared class only if not same teacher
      let sharedClass = false
      for (const tcA of task.taskClasses) {
        for (const tcB of other.teachingTask.taskClasses) {
          if (tcA.classGroupId === tcB.classGroupId) { sharedClass = true; break }
        }
        if (sharedClass) break
      }
      if (!sharedClass) continue
    }

    // OLD position: was (slot at old) paired with (other at oPos) triggering SC1?
    if (old.roomId !== 0) {
      const oldRoomObj = ctx.roomById.get(old.roomId)
      if (oldRoomObj) {
        const oldBuilding = getBuilding(oldRoomObj)
        const otherBuilding = getBuilding(otherRoom)
        if (
          oldBuilding !== 'UNKNOWN' && otherBuilding !== 'UNKNOWN' && oldBuilding !== otherBuilding &&
          old.dayOfWeek === oPos.day && Math.abs(old.slotIndex - oPos.idx) === 1
        ) {
          // Cleared: penalty was -5, now 0 → delta += +5
          deltaSoft -= SOFT_SC1_CROSS_BUILDING
        }
      }
    }

    // NEW position: does (slot at move) paired with (other at oPos) now trigger SC1?
    if (move.newRoomId !== 0) {
      const newRoomObj = ctx.roomById.get(move.newRoomId)
      if (newRoomObj) {
        const newBuilding = getBuilding(newRoomObj)
        const otherBuilding = getBuilding(otherRoom)
        if (
          newBuilding !== 'UNKNOWN' && otherBuilding !== 'UNKNOWN' && newBuilding !== otherBuilding &&
          move.newDay === oPos.day && Math.abs(move.newSlotIndex - oPos.idx) === 1
        ) {
          // Introduced: penalty was 0, now -5 → delta += -5
          deltaSoft += SOFT_SC1_CROSS_BUILDING
        }
      }
    }
  }

  // SC4 跨校区
  if (siblings) {
    const oldRoomB = oldRoom?.building
    const newRoomB = newRoom?.building
    for (const sib of siblings) {
      if (sib.id === slot.id) continue
      const sp = getPos(sib, state)
      if (sp.day === old.dayOfWeek && Math.abs(sp.idx - old.slotIndex) === 1 && sp.room !== 0) {
        const sibB = ctx.roomById.get(sp.room)?.building
        if (oldRoomB && sibB && oldRoomB !== sibB) deltaSoft -= SOFT_SC4_CROSS_CAMPUS
      }
      if (sp.day === move.newDay && Math.abs(sp.idx - move.newSlotIndex) === 1 && sp.room !== 0) {
        const sibB = ctx.roomById.get(sp.room)?.building
        if (newRoomB && sibB && newRoomB !== sibB) deltaSoft += SOFT_SC4_CROSS_CAMPUS
      }
    }
  }

  // SC MINIMUM_PERTURBATION
  if (orig) {
    const wasMoved = old.dayOfWeek !== orig.dayOfWeek || old.slotIndex !== orig.slotIndex || old.roomId !== orig.roomId
    const nowMoved = move.newDay !== orig.dayOfWeek || move.newSlotIndex !== orig.slotIndex || move.newRoomId !== orig.roomId
    if (wasMoved && !nowMoved) deltaSoft -= SOFT_MINIMUM_PERTURBATION
    if (!wasMoved && nowMoved) deltaSoft += SOFT_MINIMUM_PERTURBATION
  }

  // HC6 / SC6: 专业教室约束 delta (K22-F2A classification)
  // classifySpecialty depends only on task (stable), not on room/day. Compute once.
  const cls = classifySpecialty(task)

  // HC6 delta: 非汽车专业/混合/未知任务在 Linxiao 教室
  if (old.roomId !== 0) {
    const oldRoom = ctx.roomById.get(old.roomId)
    if (oldRoom && computeHC6Penalty(cls, isLinxiaoRoomName(oldRoom)) !== 0) {
      deltaHard -= HC6_NON_AUTOMOTIVE_LINXIAO_PENALTY // 移出旧位置的 HC6 违规
    }
  }
  if (move.newRoomId !== 0) {
    const newRoom = ctx.roomById.get(move.newRoomId)
    if (newRoom && computeHC6Penalty(cls, isLinxiaoRoomName(newRoom)) !== 0) {
      deltaHard += HC6_NON_AUTOMOTIVE_LINXIAO_PENALTY // 新位置引入 HC6 违规
    }
  }

  // SC6 delta: 汽车专业任务不在 Linxiao 教室
  if (old.roomId !== 0) {
    const oldRoom = ctx.roomById.get(old.roomId)
    if (oldRoom && computeSC6Penalty(cls, isLinxiaoRoomName(oldRoom)) !== 0) {
      deltaSoft -= SC6_AUTOMOTIVE_NON_LINXIAO_PENALTY // 移出旧位置的 SC6 违规
    }
  }
  if (move.newRoomId !== 0) {
    const newRoom = ctx.roomById.get(move.newRoomId)
    if (newRoom && computeSC6Penalty(cls, isLinxiaoRoomName(newRoom)) !== 0) {
      deltaSoft += SC6_AUTOMOTIVE_NON_LINXIAO_PENALTY // 新位置引入 SC6 违规
    }
  }

  // SC7 delta: 周末一般不排课
  if (old.dayOfWeek >= 6) deltaSoft -= SC7_WEEKEND_PENALTY
  if (move.newDay >= 6) deltaSoft += SC7_WEEKEND_PENALTY

  // SC5 delta: 教师每日课时负载均衡 (K22-F4)
  // 只计算 affected teacher（moved slot 对应的 teacher）的 before/after penalty
  const sc5TeacherId = task.teacherId
  if (sc5TeacherId != null) {
    const beforeCounts = buildTeacherDailyCounts(sc5TeacherId, ctx.slots, state, slot.id)
    beforeCounts.set(old.dayOfWeek, (beforeCounts.get(old.dayOfWeek) ?? 0) + 1) // old 位置加入
    const afterCounts = buildTeacherDailyCounts(sc5TeacherId, ctx.slots, state, slot.id)
    afterCounts.set(move.newDay, (afterCounts.get(move.newDay) ?? 0) + 1) // new 位置加入
    deltaSoft += computeTeacherDayBalancePenalty(afterCounts) - computeTeacherDayBalancePenalty(beforeCounts)
  }

  return { deltaHard, deltaSoft }
}

export function clearWeekCache(): void {
  weekSetCache.clear()
}
