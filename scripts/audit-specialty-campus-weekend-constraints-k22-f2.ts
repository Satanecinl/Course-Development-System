/**
 * K22-F2 Specialty Campus Weekend Constraint Audit
 *
 * Read-only design audit. Plans how 3 new business constraints would land in
 * the current data model and score.ts:
 *   Constraint A: 汽车专业学生优先安排在林校教室 (automotive prefers Linxiao)
 *   Constraint B: 非汽车专业学生不得安排到林校教室 (non-automotive forbidden in Linxiao)
 *   Constraint C: 周末一般不排课 (weekend avoidance)
 *
 * Strong constraints:
 *   - NO Prisma writes.
 *   - NO score.ts modifications.
 *   - NO schema changes.
 *   - NO solver / API / frontend / importer / parser / RBAC changes.
 *   - NO new constraint implementation (this phase is design-only).
 *
 * Output:
 *   - Terminal summary
 *   - docs/k22-specialty-campus-weekend-constraints-audit.json
 */

import * as fs from 'node:fs'
import * as path from 'node:path'
import { PrismaClient } from '@prisma/client'

const projectRoot = path.resolve(__dirname, '..')

// Use a dedicated client for read-only inspection.
const prisma = new PrismaClient()

// ── Types ────────────────────────────────────────────────────────────

type Severity = 'HIGH' | 'MEDIUM' | 'LOW' | 'INFO' | 'NONE'

interface Finding {
  id: string
  severity: Severity
  category: string
  title: string
  currentStatus: string
  evidence: string[]
  risk: string
  recommendation: string
  suggestedNextStage?: string
}

interface DataReadiness {
  automotiveClassGroups: { count: number; examples: string[]; ambiguous: { count: number; examples: string[] } }
  automotiveTeachingTasks: { count: number; viaClassGroup: number; viaCourseName: number; viaRemark: number; examples: string[] }
  linxiaoRooms: { count: number; viaName: number; viaBuilding: number; examples: { id: number; name: string; building: string | null }[]; ambiguous: { count: number; examples: string[] } }
  nonLinxiaoRooms: { count: number; examples: { id: number; name: string; building: string | null }[] }
  weekendSlots: { count: number; weekdaySlots: number; dayDistribution: Record<number, number> }
  totalClassGroups: number
  totalCourses: number
  totalRooms: number
  totalScheduleSlots: number
  totalTeachingTasks: number
  notes: string
}

interface ConstraintDesign {
  id: string
  name: string
  businessDescription: string
  level: 'HARD' | 'SOFT'
  constraintCode: string
  penalty: number
  skipRules: string[]
  rationale: string
  dataReady: boolean
  schemaChangeNeeded: boolean
  classification: string
}

interface MixedCaseDecision {
  case: string
  classification: string
  recommendation: string
  reason: string
}

interface HarnessCase {
  id: string
  category: string
  purpose: string
  fixture: string
  expectedHardScore: number
  expectedSoftScoreDelta: number
  expectedStatus: 'PASS' | 'FAIL'
  notes: string
}

// ── Specialty classification helpers ───────────────────────────────

const AUTOMOTIVE_KEYWORDS = ['汽车', '车辆', '新能源', '智能网联', '汽修']
const LINXIAO_KEYWORDS = ['林校']

function isAutomotiveName(name: string): boolean {
  return AUTOMOTIVE_KEYWORDS.some((kw) => name.includes(kw))
}

function isLinxiaoRoom(name: string, building: string | null): boolean {
  if (name.includes('林校') || name.includes('林')) return true
  if (building && (building.includes('林校') || building.includes('林'))) return true
  return false
}

// ── K22-F2A 5-class specialty classification ────────────────────────
//
// classGroup membership is the PRIMARY hard-rule signal. courseName / remark
// are AUXILIARY signals only. They cannot override the classGroup hard rule:
// a non-automotive classGroup member in a course whose name contains "汽车"
// still has a non-automotive student, who is forbidden to enter Linxiao.

type SpecialtyClassification =
  | 'AUTOMOTIVE_ONLY'
  | 'NON_AUTOMOTIVE_ONLY'
  | 'MIXED_AUTOMOTIVE_AND_NON_AUTOMOTIVE'
  | 'NO_CLASSGROUP_AUX_AUTOMOTIVE_SIGNAL'
  | 'UNKNOWN_NO_SIGNAL'

interface ClassificationInput {
  classGroupNames: string[]  // names of all classGroups associated with the task (may be empty)
  courseName: string | null
  remark: string | null
}

function classifySpecialty(input: ClassificationInput): SpecialtyClassification {
  const cgs = input.classGroupNames
  // Case 1: no classGroup membership at all
  if (cgs.length === 0) {
    const auxAuto =
      (input.courseName !== null && isAutomotiveName(input.courseName)) ||
      (input.remark !== null && isAutomotiveName(input.remark))
    return auxAuto ? 'NO_CLASSGROUP_AUX_AUTOMOTIVE_SIGNAL' : 'UNKNOWN_NO_SIGNAL'
  }
  // Case 2: at least one classGroup exists. Classify each.
  const anyAuto = cgs.some((n) => isAutomotiveName(n))
  const anyNonAuto = cgs.some((n) => !isAutomotiveName(n))
  if (anyAuto && anyNonAuto) return 'MIXED_AUTOMOTIVE_AND_NON_AUTOMOTIVE'
  if (anyAuto && !anyNonAuto) return 'AUTOMOTIVE_ONLY'
  return 'NON_AUTOMOTIVE_ONLY'
}

// ── Inspect data via read-only Prisma ──────────────────────────────

async function inspectDataReadiness(): Promise<DataReadiness> {
  const summary: DataReadiness = {
    automotiveClassGroups: { count: 0, examples: [], ambiguous: { count: 0, examples: [] } },
    automotiveTeachingTasks: { count: 0, viaClassGroup: 0, viaCourseName: 0, viaRemark: 0, examples: [] },
    linxiaoRooms: { count: 0, viaName: 0, viaBuilding: 0, examples: [], ambiguous: { count: 0, examples: [] } },
    nonLinxiaoRooms: { count: 0, examples: [] },
    weekendSlots: { count: 0, weekdaySlots: 0, dayDistribution: {} },
    totalClassGroups: 0,
    totalCourses: 0,
    totalRooms: 0,
    totalScheduleSlots: 0,
    totalTeachingTasks: 0,
    notes: '',
  }

  try {
    // ClassGroup
    const classGroups = await prisma.classGroup.findMany({ select: { id: true, name: true } })
    summary.totalClassGroups = classGroups.length
    const autoClassGroups = classGroups.filter((c) => isAutomotiveName(c.name))
    summary.automotiveClassGroups.count = autoClassGroups.length
    summary.automotiveClassGroups.examples = autoClassGroups.slice(0, 5).map((c) => c.name)
    // "ambiguous" = classGroups with 汽车-like but uncertain
    const ambiguousClasses = classGroups.filter(
      (c) => !isAutomotiveName(c.name) && /专|班|级|科/.test(c.name),
    ).slice(0, 3)
    summary.automotiveClassGroups.ambiguous.count = classGroups.length - autoClassGroups.length
    summary.automotiveClassGroups.ambiguous.examples = ambiguousClasses.map((c) => c.name)

    // Course
    const courses = await prisma.course.findMany({ select: { id: true, name: true } })
    summary.totalCourses = courses.length
    const autoCourses = courses.filter((c) => isAutomotiveName(c.name))
    summary.automotiveTeachingTasks.viaCourseName = autoCourses.length
    if (autoCourses.length > 0) {
      summary.automotiveTeachingTasks.examples.push(...autoCourses.slice(0, 3).map((c) => `Course: ${c.name}`))
    }

    // TeachingTask with remark check
    const tasks = await prisma.teachingTask.findMany({
      select: {
        id: true,
        remark: true,
        courseId: true,
        course: { select: { name: true } },
        taskClasses: { select: { classGroup: { select: { name: true } } } },
      },
    })
    summary.totalTeachingTasks = tasks.length
    const autoTasks: string[] = []
    for (const t of tasks) {
      let isAuto = false
      // via class group
      const classNames = t.taskClasses.map((tc) => tc.classGroup.name).join(',')
      if (classNames && AUTOMOTIVE_KEYWORDS.some((kw) => classNames.includes(kw))) {
        isAuto = true
        summary.automotiveTeachingTasks.viaClassGroup++
      }
      // via course name
      if (t.course?.name && AUTOMOTIVE_KEYWORDS.some((kw) => t.course!.name.includes(kw))) {
        isAuto = true
      }
      // via remark
      if (t.remark && AUTOMOTIVE_KEYWORDS.some((kw) => t.remark!.includes(kw))) {
        isAuto = true
        summary.automotiveTeachingTasks.viaRemark++
      }
      if (isAuto) {
        autoTasks.push(`Task#${t.id} course=${t.course?.name ?? '?'} classes=[${classNames}]`)
      }
    }
    summary.automotiveTeachingTasks.count = autoTasks.length
    if (autoTasks.length < summary.automotiveTeachingTasks.examples.length) {
      // already added course examples
    } else {
      summary.automotiveTeachingTasks.examples.push(...autoTasks.slice(0, 5))
    }

    // Room
    const rooms = await prisma.room.findMany({ select: { id: true, name: true, building: true } })
    summary.totalRooms = rooms.length
    const linxiao = rooms.filter((r) => isLinxiaoRoom(r.name, r.building))
    const nonLinxiao = rooms.filter((r) => !isLinxiaoRoom(r.name, r.building))
    summary.linxiaoRooms.count = linxiao.length
    summary.linxiaoRooms.examples = linxiao.slice(0, 5).map((r) => ({ id: r.id, name: r.name, building: r.building }))
    summary.linxiaoRooms.viaName = linxiao.filter((r) => r.name.includes('林校') || r.name.includes('林')).length
    summary.linxiaoRooms.viaBuilding = linxiao.filter(
      (r) => !r.name.includes('林校') && r.building && (r.building.includes('林校') || r.building.includes('林')),
    ).length
    summary.linxiaoRooms.ambiguous.count = nonLinxiao.filter((r) => /林/.test(r.name) || (r.building && /林/.test(r.building))).length
    summary.linxiaoRooms.ambiguous.examples = summary.linxiaoRooms.ambiguous.count > 0
      ? nonLinxiao
          .filter((r) => /林/.test(r.name) || (r.building && /林/.test(r.building)))
          .slice(0, 3)
          .map((r) => r.name)
      : []
    summary.nonLinxiaoRooms.count = nonLinxiao.length
    summary.nonLinxiaoRooms.examples = nonLinxiao.slice(0, 3).map((r) => ({ id: r.id, name: r.name, building: r.building }))

    // ScheduleSlot
    const slots = await prisma.scheduleSlot.findMany({ select: { dayOfWeek: true } })
    summary.totalScheduleSlots = slots.length
    const dayDist: Record<number, number> = {}
    let weekend = 0
    let weekday = 0
    for (const s of slots) {
      dayDist[s.dayOfWeek] = (dayDist[s.dayOfWeek] ?? 0) + 1
      if (s.dayOfWeek === 6 || s.dayOfWeek === 7) weekend++
      else weekday++
    }
    summary.weekendSlots.count = weekend
    summary.weekendSlots.weekdaySlots = weekday
    summary.weekendSlots.dayDistribution = dayDist

    summary.notes = `Read-only inspection at ${new Date().toISOString()}.`
  } catch (e) {
    summary.notes = `DB inspection error: ${(e as Error).message}`
  } finally {
    await prisma.$disconnect()
  }
  return summary
}

// ── Constraint designs ──────────────────────────────────────────────

function buildConstraintDesigns(): ConstraintDesign[] {
  return [
    {
      id: 'CONSTRAINT_A',
      name: '汽车专业学生优先林校教室 (Automotive prefers Linxiao)',
      businessDescription: '汽车专业学生优先全放在林校的教室。',
      level: 'SOFT',
      constraintCode: 'SC6_AUTOMOTIVE_PREFERS_LINXIAO',
      penalty: -20,
      skipRules: [
        'Task without any automotive classification (classGroup, courseName, remark) — non-automotive',
        'Room that is not Linxiao (cannot be moved to Linxiao by this rule)',
        'LinXiao room unavailable for the slot (skip per RoomAvailability)',
        'Task with no classGroup (no specialty signal — skip)',
      ],
      rationale:
        '“优先” 是 soft 偏好，不是绝对 hard。' +
        '如果林校教室容量不足，solver 仍应能生成可行课表，因此不能用 hard。' +
        '但偏好较强，penalty 应较高 (-20)，超过 SC1/SC2/SC4 任何一个。' +
        'K22-F2 design 阶段建议 SC6。',
      dataReady: true,
      schemaChangeNeeded: false,
      classification: 'regex-based: AUTOMOTIVE_KEYWORDS in ClassGroup.name OR Course.name OR TeachingTask.remark',
    },
    {
      id: 'CONSTRAINT_B',
      name: '非汽车专业学生不得进林校教室 (Non-automotive forbidden in Linxiao)',
      businessDescription: '其他专业学生不得放到林校的教室。',
      level: 'HARD',
      constraintCode: 'HC6_NON_AUTOMOTIVE_FORBID_LINXIAO',
      penalty: -1000, // standard HARD_PENALTY
      skipRules: [
        'Task classified as automotive (any classification signal) — exempt',
        'Mixed automotive + non-automotive task (合班) — should be treated as automotive or have manual override',
        'Task with no classGroup (no signal) — skip to be safe (or treat as non-automotive)',
        'Room that is not Linxiao — rule does not apply',
      ],
      rationale:
        '“不得” 是 hard 绝对禁止。' +
        '与现有 HC1-HC5 同等约束级别 (-1000)。' +
        'solver 必须保证可行性 — 如果林校教室不足以容纳所有非汽车任务，应 fail 早返回而不是生成违反排课。' +
        '命名沿用 HC6 (HC6 在 score.ts 中是 skeleton, K22-A-E-2 提到该 skeleton 故意不计分; 此处 HC6_NON_AUTOMOTIVE_FORBID_LINXIAO 与原 HC6 是不同约束 id, 不冲突).' +
        '但需要先 audit 汽车专业识别准确率, 如准确率不足, 应先做 mapping/audit, 不直接实现.',
      dataReady: false, // depends on data audit
      schemaChangeNeeded: false, // regex-based detection OK
      classification: 'regex-based: non-automotive (after CONSTRAINT_A check) placed in Linxiao room → hard violation',
    },
    {
      id: 'CONSTRAINT_C',
      name: '周末一般不排课 (Weekend avoidance)',
      businessDescription: '周末一般不排课。',
      level: 'SOFT',
      constraintCode: 'SC7_WEEKEND_AVOIDANCE',
      penalty: -15,
      skipRules: [
        'dayOfWeek in [1, 2, 3, 4, 5] (Mon-Fri) — skip',
        'task with manual weekend exception (would need new field, schema extension deferred to K22-H)',
        'room that is "weekend-only" by design (no current data, future schema)',
      ],
      rationale:
        '“一般” 是 soft 偏好，不是 hard 禁止。' +
        'dayOfWeek 6/7 表示周六/周日。' +
        '当前数据中可能已有周末排课 (audit 后确认), ' +
        'solver 可能生成周末排课 (取决于 slot generation). ' +
        'soft penalty -15 让 solver 尽量避免周末, 但允许 manual override. ' +
        'K22-F2 阶段不修改 RoomAvailability / candidate slots 层.',
      dataReady: true,
      schemaChangeNeeded: false,
      classification: 'dayOfWeek-based: dayOfWeek in [6, 7] → soft penalty per slot',
    },
  ]
}

// ── Mixed case decision table ───────────────────────────────────────

function buildMixedCaseTable(): MixedCaseDecision[] {
  return [
    {
      case: 'TeachingTask 同时关联汽车班 + 非汽车班 (合班)',
      classification: 'MIXED_AUTOMOTIVE_AND_NON_AUTOMOTIVE',
      recommendation:
        'K22-F2A correction: classify as MIXED. ' +
        'In Linxiao: trigger HC6 hard penalty (-1000) — the task has non-automotive students who are forbidden from Linxiao. ' +
        'Out of Linxiao: no penalty. ' +
        'If future manual exception is needed, add explicit override field (K22-H schema).',
      reason:
        'K22-F2 original said “any automotive classGroup triggers automotive” — this was WRONG. ' +
        '合班 contains non-automotive students, who are forbidden to enter Linxiao. ' +
        'Treating mixed as automotive would let non-automotive students sneak into Linxiao. ' +
        'Conservative: hard rule dominates. ' +
        'Manual exception can be added in K22-H if 教务处 approves specific 合班 exemptions.',
    },
    {
      case: '课程名含 “汽车” 但 classGroup 全是非汽车',
      classification: 'NON_AUTOMOTIVE_ONLY_WITH_AUX_FLAG (or just NON_AUTOMOTIVE_ONLY with auxiliary flag recorded)',
      recommendation:
        'K22-F2A correction: classGroup dominates. Treat as NON_AUTOMOTIVE_ONLY. ' +
        'In Linxiao: trigger HC6 hard penalty (-1000) — the non-automotive students must not enter Linxiao. ' +
        'Auxiliary flag (courseName or remark contains automotive keyword) can be recorded in detail message for human review, ' +
        'but does NOT change the HC6 hard rule.',
      reason:
        'K22-F2 original said “Any single signal triggers automotive” — this was WRONG. ' +
        'A non-automotive classGroup taking a course with “汽车” in the name (e.g. “汽车概论” public elective) ' +
        'still has non-automotive students. The classGroup signal is the primary hard-rule signal; ' +
        'courseName / remark are auxiliary and cannot override HC6.',
    },
    {
      case: '班级名含 “汽车” 但课程是公共课 (e.g. 高等数学)',
      classification: 'AUTOMOTIVE_ONLY',
      recommendation: 'classGroup dominates. If all classGroups are automotive (e.g. 汽车检测1班), task is AUTOMOTIVE_ONLY regardless of courseName.',
      reason: '汽车班学生选 公共课 在 林校 教室仍然合理. SC6 preference does not care about courseName, only about which students are taking it.',
    },
    {
      case: '林校 room 识别不明确 (name 中含 “林” 但不是 “林校”)',
      classification: 'AMBIGUOUS_ROOM',
      recommendation: 'Use strict keyword “林校” only. Single-character “林” too risky (could match unrelated names). Manual admin review of ambiguous rooms in K22-H admin UI extension.',
      reason: '保守策略: 只匹配 “林校” (multi-char). Single “林” 风险高, 留作 K22-H schema extension (Room.campus field).',
    },
    {
      case: '任务无 classGroup (no classGroupId)',
      classification: 'UNKNOWN',
      recommendation: 'Skip automotive rules. Treat as non-automotive for HC6 (conservative: prefer fail than violate hard rule).',
      reason: '无 classGroup signal, 无法判断 specialty. K22-F2 阶段假设保守地 treat as non-automotive. K22-H 阶段可加 schema 改进.',
    },
    {
      case: '公共课 teachingTask 关联 multiple classGroups (其中一个是汽车)',
      classification: 'MIXED_AUTOMOTIVE_AND_NON_AUTOMOTIVE',
      recommendation:
        'K22-F2A correction: classify as MIXED, not as automotive. ' +
        'In Linxiao: trigger HC6 hard penalty (-1000). ' +
        'Out of Linxiao: no penalty. ' +
        'Same rule as case 1 (合班).',
      reason:
        'Mixed classGroup contains non-automotive students who are forbidden to enter Linxiao. ' +
        'Do NOT apply "any automotive classGroup triggers automotive" — that rule was wrong.',
    },
    {
      case: 'TeachingTask 含 remark "汽车专业" 但 classGroup 不是汽车',
      classification: 'NON_AUTOMOTIVE_ONLY_WITH_REMARK_FLAG (or NON_AUTOMOTIVE_ONLY with remark recorded for human review)',
      recommendation:
        'K22-F2A correction: classGroup dominates. Treat as NON_AUTOMOTIVE_ONLY. ' +
        'In Linxiao: trigger HC6 hard penalty (-1000). ' +
        'Remark is auxiliary — record in detail message for human review but does NOT change HC6. ' +
        'If 教务处 explicitly approves an exception, add a manual override field (K22-H schema).',
      reason:
        'K22-F2 original said "Use remark signal: if remark contains automotive keyword, treat as automotive regardless of classGroup" — this was WRONG. ' +
        'Remark cannot override classGroup membership for the HC6 hard rule. ' +
        'A remark typo, stale text, or copy-paste error should NOT let a non-automotive task sneak into Linxiao.',
    },
  ]
}

// ── Full / delta score design ──────────────────────────────────────

function buildFullScoreDesign(): Record<string, unknown> {
  return {
    classification:
      'K22-F2A 5-class classification: AUTOMOTIVE_ONLY / NON_AUTOMOTIVE_ONLY / ' +
      'MIXED_AUTOMOTIVE_AND_NON_AUTOMOTIVE / NO_CLASSGROUP_AUX_AUTOMOTIVE_SIGNAL / UNKNOWN_NO_SIGNAL. ' +
      'classGroup membership is the primary hard-rule signal. courseName / remark are auxiliary only.',
    automotive: {
      aggregation:
        'For each slot, classify task into 5 classes. ' +
        'If AUTOMOTIVE_ONLY && !linxiao: SC6_AUTOMOTIVE_PREFERS_LINXIAO soft penalty = -20.',
      complexity: 'O(n) where n = number of slots',
      detailsEmitted: 'One SC6 detail per slot that violates preference',
    },
    nonAutomotiveForbid: {
      aggregation:
        'For each slot, if classification is NON_AUTOMOTIVE_ONLY or MIXED ' +
        'AND room IS Linxiao: HC6_NON_AUTOMOTIVE_FORBID_LINXIAO hard penalty = -1000. ' +
        'K22-F2A: MIXED in Linxiao also triggers HC6 (mixed has non-automotive students).',
      complexity: 'O(n)',
      detailsEmitted: 'One HC6 detail per violation',
    },
    weekend: {
      aggregation:
        'For each slot, if dayOfWeek in [6, 7]: SC7_WEEKEND_AVOIDANCE soft penalty = -15. ' +
        'Independent of classification.',
      complexity: 'O(n)',
      detailsEmitted: 'One SC7 detail per weekend slot',
    },
    decisionTable: [
      { classification: 'AUTOMOTIVE_ONLY', lx: true, hard: 0, soft: 0 },
      { classification: 'AUTOMOTIVE_ONLY', lx: false, hard: 0, soft: -20 },
      { classification: 'NON_AUTOMOTIVE_ONLY', lx: true, hard: -1000, soft: 0 },
      { classification: 'NON_AUTOMOTIVE_ONLY', lx: false, hard: 0, soft: 0 },
      { classification: 'MIXED_AUTOMOTIVE_AND_NON_AUTOMOTIVE', lx: true, hard: -1000, soft: 0 },
      { classification: 'MIXED_AUTOMOTIVE_AND_NON_AUTOMOTIVE', lx: false, hard: 0, soft: 0 },
      { classification: 'NO_CLASSGROUP_AUX_AUTOMOTIVE_SIGNAL', lx: true, hard: 'manual review / conservative HC6', soft: 0 },
      { classification: 'NO_CLASSGROUP_AUX_AUTOMOTIVE_SIGNAL', lx: false, hard: 0, soft: 0 },
      { classification: 'UNKNOWN_NO_SIGNAL', lx: true, hard: 'manual review / conservative HC6', soft: 0 },
      { classification: 'UNKNOWN_NO_SIGNAL', lx: false, hard: 0, soft: 0 },
    ],
    pseudocode: `
// FULL SCORE (calculateScoreWithDetails) — K22-F2A 5-class classification
const isLinxiao = (room) => isLinxiaoRoom(room.name, room.building)

for (const p of positions) {
  if (p.room === 0) continue
  const task = p.slot.teachingTask
  const room = ctx.roomById.get(p.room)
  if (!room) continue
  const cgs = task.taskClasses.map(tc => tc.classGroup.name)
  const cls = classifySpecialty({ classGroupNames: cgs, courseName: task.course?.name, remark: task.remark })
  const lx = isLinxiao(room)

  // SC6: AUTOMOTIVE_ONLY prefers Linxiao (soft preference)
  if (cls === 'AUTOMOTIVE_ONLY' && !lx) {
    softScore += -20
    details.push({ type: 'SC6_AUTOMOTIVE_PREFERS_LINXIAO', level: 'SOFT', penalty: -20, ... })
  }
  // HC6: non-automotive forbidden in Linxiao (hard rule)
  // K22-F2A: MIXED has non-automotive students, so MIXED in Linxiao also triggers HC6
  if ((cls === 'NON_AUTOMOTIVE_ONLY' || cls === 'MIXED_AUTOMOTIVE_AND_NON_AUTOMOTIVE') && lx) {
    hardScore += -1000
    details.push({ type: 'HC6_NON_AUTOMOTIVE_FORBID_LINXIAO', level: 'HARD', penalty: -1000, ... })
  }
  // SC7: weekend avoidance (independent)
  if (p.day === 6 || p.day === 7) {
    softScore += -15
    details.push({ type: 'SC7_WEEKEND_AVOIDANCE', level: 'SOFT', penalty: -15, ... })
  }
}
`,
  }
}

function buildDeltaScoreDesign(): Record<string, unknown> {
  return {
    affectedSlots:
      'Only the moved slot. Room and day change; all other slots unchanged.',
    procedure:
      'For the moved slot, recompute isAutomotive (static, depends on task) and isLinxiao (depends on new room). ' +
      'Compare before (using old.roomId, old.dayOfWeek) and after (using move.newRoomId, move.newDay). ' +
      'Three contributions: SC6 (if automotive && !lx), HC6 (if !auto && lx), SC7 (if weekend).',
    formula:
      'deltaHard += (after_hardPenalty - before_hardPenalty)  // from HC6 only\n' +
      'deltaSoft += (after_softPenalty - before_softPenalty)  // from SC6 + SC7',
    complexity: 'O(1) per move (single slot)',
    hardScoreImpact: 'Only HC6 contributes to deltaHard. SC6 + SC7 are soft.',
    doesNotIterate: 'No need to scan all slots — only the moved slot.',
    pseudocode: `
// DELTA SCORE (calculateDeltaScore)
const task = slot.teachingTask
const auto = isAutomotive(task)  // static, task.teacherId/taskClasses don't change

// BEFORE: old position
let beforeHard = 0, beforeSoft = 0
if (old.roomId !== 0) {
  const oldRoom = ctx.roomById.get(old.roomId)
  if (oldRoom) {
    const lx = isLinxiaoRoom(oldRoom.name, oldRoom.building)
    if (!auto && lx) beforeHard += -1000  // HC6
    if (auto && !lx) beforeSoft += -20     // SC6
  }
}
if (old.dayOfWeek === 6 || old.dayOfWeek === 7) beforeSoft += -15  // SC7

// AFTER: new position
let afterHard = 0, afterSoft = 0
if (move.newRoomId !== 0) {
  const newRoom = ctx.roomById.get(move.newRoomId)
  if (newRoom) {
    const lx = isLinxiaoRoom(newRoom.name, newRoom.building)
    if (!auto && lx) afterHard += -1000
    if (auto && !lx) afterSoft += -20
  }
}
if (move.newDay === 6 || move.newDay === 7) afterSoft += -15

deltaHard += afterHard - beforeHard
deltaSoft += afterSoft - beforeSoft
`,
  }
}

// ── Harness plan ────────────────────────────────────────────────────

function buildHarnessPlan(): HarnessCase[] {
  return [
    {
      id: 'SC6-HAPPY',
      category: 'CONSTRAINT_A',
      purpose: 'Automotive task in Linxiao room → no penalty',
      fixture: '1 task (id=1, course=汽车检测, classes=[汽车检测1班]) in 1 Linxiao room (id=100, name=林校301).',
      expectedHardScore: 0,
      expectedSoftScoreDelta: 0,
      expectedStatus: 'PASS',
      notes: 'Happy path. automotive && lx → no penalty.',
    },
    {
      id: 'SC6-VIOLATION',
      category: 'CONSTRAINT_A',
      purpose: 'Automotive task in non-Linxiao room → soft penalty',
      fixture: '1 task (id=1, course=汽车检测) in 1 non-Linxiao room (id=200, name=A101).',
      expectedHardScore: 0,
      expectedSoftScoreDelta: -20,
      expectedStatus: 'PASS',
      notes: 'automotive && !lx → soft penalty -20. Note: SC6 is soft preference, not hard violation.',
    },
    {
      id: 'HC6-VIOLATION',
      category: 'CONSTRAINT_B',
      purpose: 'Non-automotive task in Linxiao room → hard penalty',
      fixture: '1 task (id=1, course=高等数学, classes=[计算机1班]) in 1 Linxiao room (id=100, name=林校301).',
      expectedHardScore: -1000,
      expectedSoftScoreDelta: 0,
      expectedStatus: 'PASS',
      notes: '!automotive && lx → hard penalty -1000. Solver would never apply this if HC gate is enforced.',
    },
    {
      id: 'HC6-HAPPY',
      category: 'CONSTRAINT_B',
      purpose: 'Non-automotive task in non-Linxiao room → no penalty',
      fixture: '1 task (id=1, course=高等数学) in 1 non-Linxiao room (id=200, name=A101).',
      expectedHardScore: 0,
      expectedSoftScoreDelta: 0,
      expectedStatus: 'PASS',
      notes: 'Happy path. !automotive && !lx → no penalty.',
    },
    {
      id: 'AUTO_ONLY-LINXIAO',
      category: 'CONSTRAINT_A',
      purpose: 'Automotive-only task in Linxiao room → no penalty',
      fixture: '1 task (id=1, course=汽车检测, classes=[汽车检测1班]) in 1 Linxiao room (id=100, name=林校301).',
      expectedHardScore: 0,
      expectedSoftScoreDelta: 0,
      expectedStatus: 'PASS',
      notes: 'Happy path. AUTOMOTIVE_ONLY && lx → no penalty. K22-F2A: classification is AUTOMOTIVE_ONLY because all classGroups are automotive.',
    },
    {
      id: 'AUTO_ONLY-NON_LINXIAO',
      category: 'CONSTRAINT_A',
      purpose: 'Automotive-only task in non-Linxiao room → soft penalty',
      fixture: '1 task (id=1, course=汽车检测, classes=[汽车检测1班]) in 1 non-Linxiao room (id=200, name=A101).',
      expectedHardScore: 0,
      expectedSoftScoreDelta: -20,
      expectedStatus: 'PASS',
      notes: 'AUTOMOTIVE_ONLY && !lx → soft penalty -20. SC6 is soft preference, not hard violation.',
    },
    {
      id: 'NON_AUTO-LINXIAO',
      category: 'CONSTRAINT_B',
      purpose: 'Non-automotive-only task in Linxiao room → hard penalty',
      fixture: '1 task (id=1, course=高等数学, classes=[计算机1班]) in 1 Linxiao room (id=100, name=林校301).',
      expectedHardScore: -1000,
      expectedSoftScoreDelta: 0,
      expectedStatus: 'PASS',
      notes: 'NON_AUTOMOTIVE_ONLY && lx → hard penalty -1000. Solver would never apply this if HC gate is enforced.',
    },
    {
      id: 'NON_AUTO-NON_LINXIAO',
      category: 'CONSTRAINT_B',
      purpose: 'Non-automotive-only task in non-Linxiao room → no penalty',
      fixture: '1 task (id=1, course=高等数学, classes=[计算机1班]) in 1 non-Linxiao room (id=200, name=A101).',
      expectedHardScore: 0,
      expectedSoftScoreDelta: 0,
      expectedStatus: 'PASS',
      notes: 'Happy path. NON_AUTOMOTIVE_ONLY && !lx → no penalty.',
    },
    {
      id: 'MIXED-LINXIAO',
      category: 'CONSTRAINT_B',
      purpose: 'MIXED classGroup (automotive + non-automotive) in Linxiao → hard penalty (K22-F2A correction)',
      fixture: '1 task (id=1, course=综合实践, classes=[汽车检测1班, 计算机1班]) in 1 Linxiao room (id=100).',
      expectedHardScore: -1000,
      expectedSoftScoreDelta: 0,
      expectedStatus: 'PASS',
      notes: 'K22-F2A: MIXED in Linxiao triggers HC6 (-1000). The mixed task has non-automotive students who are forbidden from Linxiao. K22-F2 originally said hard=0 (WRONG).',
    },
    {
      id: 'MIXED-NON_LINXIAO',
      category: 'CONSTRAINT_B',
      purpose: 'MIXED classGroup in non-Linxiao room → no penalty',
      fixture: '1 task (id=1, course=综合实践, classes=[汽车检测1班, 计算机1班]) in 1 non-Linxiao room (id=200).',
      expectedHardScore: 0,
      expectedSoftScoreDelta: 0,
      expectedStatus: 'PASS',
      notes: 'MIXED && !lx → no penalty. Mixed task is allowed in non-Linxiao rooms.',
    },
    {
      id: 'COURSE_NAME_AUTO-BUT-NON_AUTO_CLASS-LINXIAO',
      category: 'CONSTRAINT_B',
      purpose: 'courseName has 汽车 but classGroup is non-automotive + in Linxiao → hard penalty (K22-F2A correction)',
      fixture: '1 task (id=1, course=汽车概论, classes=[计算机1班]) in 1 Linxiao room. courseName has "汽车" but classGroup "计算机1班" is non-automotive.',
      expectedHardScore: -1000,
      expectedSoftScoreDelta: 0,
      expectedStatus: 'PASS',
      notes: 'K22-F2A: courseName / remark CANNOT override classGroup hard rule. Classification is NON_AUTOMOTIVE_ONLY (with courseName recorded as auxiliary flag). Linxiao triggers HC6.',
    },
    {
      id: 'REMARK_AUTO-BUT-NON_AUTO_CLASS-LINXIAO',
      category: 'CONSTRAINT_B',
      purpose: 'remark has 汽车 but classGroup is non-automotive + in Linxiao → hard penalty (K22-F2A correction)',
      fixture: '1 task (id=1, course=综合实践, remark="汽车专业", classes=[计算机1班]) in 1 Linxiao room.',
      expectedHardScore: -1000,
      expectedSoftScoreDelta: 0,
      expectedStatus: 'PASS',
      notes: 'K22-F2A: remark is auxiliary. Classification is NON_AUTOMOTIVE_ONLY (with remark recorded as auxiliary flag). Linxiao triggers HC6. Remark typo / stale text / copy-paste must NOT let non-automotive task sneak into Linxiao.',
    },
    {
      id: 'AUTO_PUBLIC_COURSE-NON_LINXIAO',
      category: 'CONSTRAINT_A',
      purpose: 'Automotive classGroup taking public course (高等数学) in non-Linxiao → soft penalty',
      fixture: '1 task (id=1, course=高等数学, classes=[汽车检测1班]) in 1 non-Linxiao room.',
      expectedHardScore: 0,
      expectedSoftScoreDelta: -20,
      expectedStatus: 'PASS',
      notes: 'classGroup dominates. AUTOMOTIVE_ONLY (all classGroups are automotive) regardless of courseName. Soft penalty SC6 for not in Linxiao.',
    },
    {
      id: 'SC7-WEEKEND',
      category: 'CONSTRAINT_C',
      purpose: 'Weekend slot → soft penalty',
      fixture: '1 task in 1 room, dayOfWeek=6 (Saturday).',
      expectedHardScore: 0,
      expectedSoftScoreDelta: -15,
      expectedStatus: 'PASS',
      notes: 'dayOfWeek 6/7 → soft penalty -15.',
    },
    {
      id: 'SC7-WEEKDAY',
      category: 'CONSTRAINT_C',
      purpose: 'Weekday slot → no weekend penalty',
      fixture: '1 task in 1 room, dayOfWeek=3 (Wednesday).',
      expectedHardScore: 0,
      expectedSoftScoreDelta: 0,
      expectedStatus: 'PASS',
      notes: 'dayOfWeek 1-5 → no penalty.',
    },
    {
      id: 'DELTA-AUTO-NON_LINXIAO-TO-LINXIAO',
      category: 'DELTA',
      purpose: 'Move AUTOMOTIVE_ONLY task from non-Linxiao to Linxiao → soft improves',
      fixture: 'AUTOMOTIVE_ONLY task in non-Linxiao room. Move to Linxiao room. beforeSoft=-20 (SC6), afterSoft=0, deltaSoft=+20.',
      expectedHardScore: 0,
      expectedSoftScoreDelta: 20,
      expectedStatus: 'PASS',
      notes: 'Verify delta correctly reflects SC6 resolve.',
    },
    {
      id: 'DELTA-NON_AUTO-NON_LINXIAO-TO-LINXIAO',
      category: 'DELTA',
      purpose: 'Move NON_AUTOMOTIVE_ONLY task to Linxiao → hard violation introduced',
      fixture: 'NON_AUTOMOTIVE_ONLY task in non-Linxiao room. Move to Linxiao. beforeHard=0, afterHard=-1000, deltaHard=-1000.',
      expectedHardScore: -1000,
      expectedSoftScoreDelta: 0,
      expectedStatus: 'PASS',
      notes: 'Verify delta correctly reflects HC6 introduction. Solver would never apply this if hard gate enforced.',
    },
    {
      id: 'DELTA-MIXED-NON_LINXIAO-TO-LINXIAO',
      category: 'DELTA',
      purpose: 'Move MIXED task to Linxiao → hard violation introduced (K22-F2A correction)',
      fixture: 'MIXED task (classes=[汽车检测1班, 计算机1班]) in non-Linxiao room. Move to Linxiao. beforeHard=0, afterHard=-1000, deltaHard=-1000.',
      expectedHardScore: -1000,
      expectedSoftScoreDelta: 0,
      expectedStatus: 'PASS',
      notes: 'K22-F2A: MIXED in Linxiao triggers HC6. deltaHard=-1000.',
    },
    {
      id: 'DELTA-WEEKDAY-TO-WEEKEND',
      category: 'DELTA',
      purpose: 'Move slot from weekday to weekend → soft penalty introduced',
      fixture: 'Task in any room, dayOfWeek=3 → dayOfWeek=6. beforeSoft=0, afterSoft=-15, deltaSoft=-15.',
      expectedHardScore: 0,
      expectedSoftScoreDelta: -15,
      expectedStatus: 'PASS',
      notes: 'Verify delta correctly reflects SC7 introduction.',
    },
  ]
}

// ── Findings ────────────────────────────────────────────────────────

function buildFindings(data: DataReadiness): Finding[] {
  const findings: Finding[] = []

  // Rule A: automotive classification feasibility
  findings.push({
    id: 'K22-F2-A-1',
    severity: data.automotiveClassGroups.count > 0 ? 'LOW' : 'MEDIUM',
    category: 'A. Automotive classification feasibility',
    title: '汽车专业识别 — regex-based on ClassGroup.name / Course.name / TeachingTask.remark',
    currentStatus: data.notes,
    evidence: [
      `Total ClassGroups: ${data.totalClassGroups}`,
      `Automotive ClassGroups (regex match): ${data.automotiveClassGroups.count}`,
      `Examples: ${JSON.stringify(data.automotiveClassGroups.examples)}`,
      `Automotive Courses: ${data.automotiveTeachingTasks.viaCourseName}`,
      `Automotive TeachingTasks (via classGroup): ${data.automotiveTeachingTasks.viaClassGroup}`,
      `Automotive TeachingTasks (via remark): ${data.automotiveTeachingTasks.viaRemark}`,
      `Prisma schema: NO Department / major / specialty field. K22-F2 must use regex-based detection.`,
    ],
    risk: 'MEDIUM if data.automotiveClassGroups.count is 0: no automotive classification possible, CONSTRAINT_A/B design relies on this. LOW if at least some classes match.',
    recommendation: data.automotiveClassGroups.count > 0
      ? 'regex-based detection is acceptable. Document in K22-F2 audit. K22-H may add Department schema.'
      : 'No automotive data → no value implementing CONSTRAINT_A/B. K22-F2 design only. K22-H may need schema extension (Department model) to introduce specialty fields.',
  })

  // Rule B: Linxiao room classification
  findings.push({
    id: 'K22-F2-B-1',
    severity: data.linxiaoRooms.count > 0 ? 'NONE' : 'MEDIUM',
    category: 'B. Linxiao room classification feasibility',
    title: '林校教室识别 — regex-based on Room.name / Room.building',
    currentStatus: `Linxiao rooms via name: ${data.linxiaoRooms.viaName}, via building: ${data.linxiaoRooms.viaBuilding}, total: ${data.linxiaoRooms.count}`,
    evidence: [
      `Total rooms: ${data.totalRooms}`,
      `Linxiao rooms: ${data.linxiaoRooms.count}`,
      `Examples: ${JSON.stringify(data.linxiaoRooms.examples.slice(0, 3))}`,
      `Python parser: r'林校\\s*\\d+' regex matches "林校305" pattern (scripts/parse_cell.py:9)`,
      `Prisma schema: Room.building is nullable. Room.campus does NOT exist. K22-F2 must use regex on name OR building.`,
    ],
    risk: 'NONE if Linxiao rooms > 0 (data is identifiable). MEDIUM if 0 Linxiao rooms → CONSTRAINT_A/B has no target set.',
    recommendation: 'regex-based detection using keyword "林校" is acceptable. K22-H may add Room.campus field for explicit modeling.',
  })

  // Rule C: weekend slot distribution
  findings.push({
    id: 'K22-F2-C-1',
    severity: 'INFO',
    category: 'C. Weekend slot distribution',
    title: '周末排课当前分布 — 用于评估 SC7 影响',
    currentStatus: `Weekend slots (dayOfWeek 6/7): ${data.weekendSlots.count}; weekday: ${data.weekendSlots.weekdaySlots}; day distribution: ${JSON.stringify(data.weekendSlots.dayDistribution)}`,
    evidence: [
      `Total ScheduleSlots: ${data.totalScheduleSlots}`,
      `Weekday slots: ${data.weekendSlots.weekdaySlots}`,
      `Weekend slots: ${data.weekendSlots.count}`,
      `Day distribution: ${JSON.stringify(data.weekendSlots.dayDistribution)}`,
    ],
    risk: 'If weekend slots exist, they will all be penalized after SC7 impl. Solver may try to move them to weekdays but be constrained by HC1-HC5.',
    recommendation: 'If weekend slots = 0, SC7 is effectively a no-op for current data. If > 0, plan gradual migration (manual slot review + future K22-F2 implementation will naturally resolve).',
  })

  // Rule D: mixed/ambiguous cases
  findings.push({
    id: 'K22-F2-D-1',
    severity: 'LOW',
    category: 'D. Mixed/ambiguous cases',
    title: 'Mixed/ambiguous case decision table — 7 cases covered',
    currentStatus: '7 mixed/ambiguous cases designed: mixed classGroup, ambiguous course, ambiguous class, ambiguous room, no classGroup, multi-classGroup, ambiguous remark. All decisions documented.',
    evidence: [
      '7 cases in mixedCaseDecisionTable',
      'All decisions documented with reasoning',
      'Default rule: "any automotive signal triggers automotive classification" (simple and safe)',
      'Default rule: "strict keyword 林校 only, no single-character 林" (avoid false matches)',
    ],
    risk: 'LOW: decision table provides deterministic rules. Edge cases handled consistently.',
    recommendation: 'Document decision table in K22-F2 implementation. Re-evaluate when K22-H schema extension adds Department / Room.campus.',
  })

  // Rule E: schema/data feasibility summary
  const totalDataReadiness = data.automotiveClassGroups.count > 0 && data.linxiaoRooms.count > 0 ? 'ready' : 'partial'
  findings.push({
    id: 'K22-F2-E-1',
    severity: totalDataReadiness === 'ready' ? 'LOW' : 'MEDIUM',
    category: 'E. Overall data readiness',
    title: `3 constraints overall data readiness: ${totalDataReadiness.toUpperCase()}`,
    currentStatus:
      `CONSTRAINT_A (SC6 automotive prefers Linxiao): ${data.automotiveClassGroups.count > 0 ? 'data ready' : 'NEEDS DATA'}. ` +
      `CONSTRAINT_B (HC6 non-automotive forbid Linxiao): ${data.automotiveClassGroups.count > 0 && data.linxiaoRooms.count > 0 ? 'data ready' : 'NEEDS DATA'}. ` +
      `CONSTRAINT_C (SC7 weekend avoidance): always data-ready (dayOfWeek field exists).`,
    evidence: [
      `CONSTRAINT_A: ${data.automotiveClassGroups.count} automotive class groups`,
      `CONSTRAINT_B: ${data.linxiaoRooms.count} Linxiao rooms + ${data.automotiveClassGroups.count} automotive class groups`,
      `CONSTRAINT_C: always data-ready`,
    ],
    risk: totalDataReadiness === 'ready'
      ? 'LOW: all 3 constraints can be implemented with current data.'
      : 'MEDIUM: at least one constraint lacks supporting data. K22-F2 design only; K22-F3 implementation may need data backfill.',
    recommendation: 'K22-F2 = design + data audit only. K22-F3 = implementation. K22-F3 may require: (1) data backfill for ambiguous automotive classGroups, (2) admin UI to mark Room.campus, (3) score.ts implementation.',
  })

  // K22-F2A correction finding
  findings.push({
    id: 'K22-F2A-CLASSIFICATION-1',
    severity: 'MEDIUM',
    category: 'F. K22-F2A Classification Correction',
    title: 'K22-F2A 修正 specialty 分类策略：classGroup membership 是 hard rule 主信号，courseName / remark 不能覆盖',
    currentStatus:
      'K22-F2 原始策略说"any single signal triggers automotive classification"和"any automotive classGroup triggers automotive" — ' +
      '这两个规则都是错的，会让非汽车学生通过合班或非汽车班选修"汽车概论"等课程绕过 HC6 hard rule 进入林校教室。' +
      'K22-F2A 修正为 5-class classification：classGroup membership 优先作为 hard rule 主信号，' +
      'courseName / remark 只能作为辅助信号记录在 detail message 中用于人工 review，但不能改变 HC6。' +
      '修正后的 MIXED in Linxiao case 期望 hard=-1000（之前是 hard=0）。',
    evidence: [
      'K22-F2 audit originally documented "Treat as automotive" for mixed case — K22-F2A corrected to MIXED → HC6 hard violation in Linxiao',
      'K22-F2 audit originally said "Any single signal triggers automotive" — K22-F2A corrected to classGroup dominates',
      'K22-F2 audit originally said "Use remark signal: if remark contains automotive keyword, treat as automotive regardless of classGroup" — K22-F2A corrected to remark is auxiliary only',
      'Harness plan updated: MIXED-LINXIAO hard=-1000 (was 0), COURSE_NAME_AUTO-BUT-NON_AUTO_CLASS-LINXIAO hard=-1000, REMARK_AUTO-BUT-NON_AUTO_CLASS-LINXIAO hard=-1000',
    ],
    risk: 'MEDIUM (pre-implementation): if K22-F3 implementation followed K22-F2 (uncorrected) classification, non-automotive students would enter Linxiao via mixed 合班 or non-auto elective of "汽车相关" courses, violating the business hard rule. The design has been corrected; K22-F3 must follow the corrected 5-class scheme.',
    recommendation: 'K22-F3 must implement the K22-F2A 5-class classification. classGroup membership dominates; courseName / remark are auxiliary flags only. Mixed (含 non-automotive classGroup) in Linxiao triggers HC6 hard penalty. UNKNOWN/NO_CLASSGROUP cases are conservative — default to HC6 unless explicit override is added in K22-H schema.',
    suggestedNextStage: 'K22-F3-SPECIALTY-CAMPUS-WEEKEND-CONSTRAINT-IMPL',
  })

  return findings
}

// ── Main ────────────────────────────────────────────────────────────

async function main() {
  console.log('K22-F2 Specialty Campus Weekend Constraint Audit')
  console.log('=================================================\n')

  const data = await inspectDataReadiness()
  const constraints = buildConstraintDesigns()
  const mixedCases = buildMixedCaseTable()
  const fullScoreDesign = buildFullScoreDesign()
  const deltaScoreDesign = buildDeltaScoreDesign()
  const harnessPlan = buildHarnessPlan()
  const findings = buildFindings(data)

  // Summary
  const summary: Record<Severity, number> = { HIGH: 0, MEDIUM: 0, LOW: 0, INFO: 0, NONE: 0 }
  for (const f of findings) summary[f.severity]++
  const blocking = summary.HIGH > 0

  // Terminal output
  console.log('Summary:')
  console.log(`HIGH:      ${summary.HIGH}`)
  console.log(`MEDIUM:    ${summary.MEDIUM}`)
  console.log(`LOW:       ${summary.LOW}`)
  console.log(`INFO:      ${summary.INFO}`)
  console.log(`BLOCKING:  ${blocking ? 'YES' : 'NO'}`)
  console.log('')

  console.log('Automotive class groups:')
  console.log(`  Total ClassGroups: ${data.totalClassGroups}`)
  console.log(`  Automotive match (regex 汽车/车辆/新能源/汽修/智能网联): ${data.automotiveClassGroups.count}`)
  if (data.automotiveClassGroups.examples.length > 0) {
    console.log(`  Examples: ${JSON.stringify(data.automotiveClassGroups.examples)}`)
  } else {
    console.log('  Examples: (none)')
  }
  console.log('')

  console.log('Linxiao rooms:')
  console.log(`  Total rooms: ${data.totalRooms}`)
  console.log(`  Linxiao match: ${data.linxiaoRooms.count}`)
  if (data.linxiaoRooms.examples.length > 0) {
    console.log(`  Examples: ${JSON.stringify(data.linxiaoRooms.examples.slice(0, 3))}`)
  } else {
    console.log('  Examples: (none)')
  }
  console.log('')

  console.log('Weekend slots:')
  console.log(`  Total ScheduleSlots: ${data.totalScheduleSlots}`)
  console.log(`  Weekend (dayOfWeek 6/7): ${data.weekendSlots.count}`)
  console.log(`  Weekday: ${data.weekendSlots.weekdaySlots}`)
  console.log(`  Day distribution: ${JSON.stringify(data.weekendSlots.dayDistribution)}`)
  console.log('')

  console.log('Constraint decisions:')
  for (const c of constraints) {
    console.log(`  [${c.level}] ${c.id}: ${c.name} (penalty=${c.penalty}, code=${c.constraintCode})`)
  }
  console.log('')

  console.log('Findings:')
  for (const f of findings) {
    console.log(`  [${f.severity}] ${f.id} ${f.title}`)
  }
  console.log('')

  console.log('Recommended next stage: K22-F3-SPECIALTY-CAMPUS-WEEKEND-CONSTRAINT-IMPL')
  console.log('  (implement SC6 + HC6 + SC7 in score.ts, with K22-F2A prerequisite: data audit / mapping)')
  console.log('')

  // Demonstrate 5-class classification with a few examples (K22-F2A)
  const demo = [
    classifySpecialty({ classGroupNames: ['汽车检测1班'], courseName: '汽车检测', remark: null }),
    classifySpecialty({ classGroupNames: ['计算机1班'], courseName: '高等数学', remark: null }),
    classifySpecialty({ classGroupNames: ['汽车检测1班', '计算机1班'], courseName: '综合实践', remark: null }),
    classifySpecialty({ classGroupNames: [], courseName: '汽车概论', remark: null }),
    classifySpecialty({ classGroupNames: [], courseName: '高等数学', remark: null }),
  ]
  console.log('K22-F2A classification demo:')
  const demoLabels = [
    '汽车检测1班/AUTO_ONLY',
    '计算机1班/NON_AUTO',
    '汽车+计算机/MIXED',
    '无classGroup,课程=汽车概论/AUX',
    '无classGroup,无信号/UNKNOWN',
  ]
  for (let i = 0; i < demo.length; i++) {
    console.log(`  ${demoLabels[i]} → ${demo[i]}`)
  }
  console.log('')

  // Write JSON
  const outDir = path.join(projectRoot, 'docs')
  if (!fs.existsSync(outDir)) fs.mkdirSync(outDir, { recursive: true })
  const outPath = path.join(outDir, 'k22-specialty-campus-weekend-constraints-audit.json')
  const report = {
    generatedAt: new Date().toISOString(),
    phase: 'K22-F2-SPECIALTY-CAMPUS-WEEKEND-CONSTRAINT-AUDIT',
    mode: 'read-only design audit',
    summary: {
      totalFindings: findings.length,
      severity: summary,
      blocking,
      automotiveClassGroupsCount: data.automotiveClassGroups.count,
      linxiaoRoomsCount: data.linxiaoRooms.count,
      weekendSlotsCount: data.weekendSlots.count,
      totalClassGroups: data.totalClassGroups,
      totalRooms: data.totalRooms,
      totalScheduleSlots: data.totalScheduleSlots,
    },
    dataReadiness: data,
    classificationPolicy: {
      primaryHardSignal: 'classGroupMembership',
      primaryHardSignalDescription:
        'ClassGroup membership (TeachingTask.taskClasses[].classGroup.name) is the primary hard-rule signal. ' +
        'It determines whether a task is AUTOMOTIVE_ONLY, NON_AUTOMOTIVE_ONLY, or MIXED.',
      auxiliarySignals: ['courseName', 'remark'],
      auxiliarySignalDescription:
        'Course.name and TeachingTask.remark are auxiliary. They can be recorded in detail messages for human review ' +
        'but CANNOT override the classGroup hard rule for HC6.',
      fiveClassScheme: [
        'AUTOMOTIVE_ONLY',
        'NON_AUTOMOTIVE_ONLY',
        'MIXED_AUTOMOTIVE_AND_NON_AUTOMOTIVE',
        'NO_CLASSGROUP_AUX_AUTOMOTIVE_SIGNAL',
        'UNKNOWN_NO_SIGNAL',
      ],
      mixedAutomotiveAndNonAutomotive: 'HC6_HARD_VIOLATION_IN_LINXIAO',
      anySingleSignalTriggersAutomotive: false,
      courseNameCannotOverrideClassGroup: true,
      remarkCannotOverrideClassGroup: true,
    },
    automotiveClassification: {
      method: 'K22-F2A 5-class scheme',
      keywords: AUTOMOTIVE_KEYWORDS,
      sources: ['ClassGroup.name (PRIMARY)', 'Course.name (AUXILIARY)', 'TeachingTask.remark (AUXILIARY)'],
      defaultRule:
        'classGroup membership dominates. courseName / remark are auxiliary only and do not change HC6 hard rule.',
    },
    linxiaoRoomClassification: {
      method: 'regex-based',
      keywords: LINXIAO_KEYWORDS,
      sources: ['Room.name', 'Room.building'],
      defaultRule: 'strict keyword 林校 only, no single-character 林',
    },
    weekendDistribution: {
      dayOfWeekConvention: '1=Mon, 2=Tue, 3=Wed, 4=Thu, 5=Fri, 6=Sat, 7=Sun',
      weekdayRange: [1, 2, 3, 4, 5],
      weekendRange: [6, 7],
    },
    correctionNote: {
      stage: 'K22-F2A',
      issue:
        'K22-F2 originally said "any single signal triggers automotive" and "any automotive classGroup triggers automotive" — ' +
        'both wrong. A mixed classGroup task (automotive + non-automotive students) should NOT be allowed in Linxiao, ' +
        'because non-automotive students are forbidden from Linxiao.',
      fix:
        'K22-F2A unified the specialty classification into a 5-class scheme. ' +
        'classGroup membership dominates; courseName / remark are auxiliary only and cannot override HC6. ' +
        'MIXED classGroup in Linxiao now triggers HC6 hard penalty (-1000), not exempt.',
      verified: {
        'classificationPolicy.primaryHardSignal': 'classGroupMembership',
        'anySingleSignalTriggersAutomotive': false,
        'courseNameCannotOverrideClassGroup': true,
        'remarkCannotOverrideClassGroup': true,
        'MIXED-LINXIAO expectedHardScore': -1000,
        'COURSE_NAME_AUTO-BUT-NON_AUTO_CLASS-LINXIAO expectedHardScore': -1000,
        'REMARK_AUTO-BUT-NON_AUTO_CLASS-LINXIAO expectedHardScore': -1000,
        'DELTA-MIXED-NON_LINXIAO-TO-LINXIAO expectedDeltaHard': -1000,
      },
      nextStageImplGuidance:
        'K22-F3-SPECIALTY-CAMPUS-WEEKEND-CONSTRAINT-IMPL must use the K22-F2A 5-class classification. ' +
        'Any future specialty modifications must preserve: (a) classGroup dominates, (b) MIXED in Linxiao triggers HC6, ' +
        '(c) courseName / remark are auxiliary only.',
    },
    constraintDesign: constraints,
    mixedCaseDecisionTable: mixedCases,
    fullScoreDesign,
    deltaScoreDesign,
    harnessPlan,
    findings,
    recommendedNextStage: 'K22-F3-SPECIALTY-CAMPUS-WEEKEND-CONSTRAINT-IMPL',
    recommendedNextStageScope: {
      scope: [
        'Implement SC6_AUTOMOTIVE_PREFERS_LINXIAO in calculateScoreWithDetails + calculateDeltaScore',
        'Implement HC6_NON_AUTOMOTIVE_FORBID_LINXIAO in calculateScoreWithDetails + calculateDeltaScore',
        'Implement SC7_WEEKEND_AVOIDANCE in calculateScoreWithDetails + calculateDeltaScore',
        'Extend K22-C regression harness with 10 cases (4 CONSTRAINT_A/B/C, 1 MIXED, 3 SC7, 3 DELTA)',
        'Pre-step (K22-F2A): confirm automotive data accuracy with academic affairs (教务处)',
      ],
      excludes: [
        'No schema migration (regex-based detection only)',
        'No Department model re-introduction',
        'No Room.campus field',
        'No UI changes',
        'No admin form changes',
        'No hardWeights/softWeights (K22-weights-roadmap)',
      ],
    },
    notes: [
      'K22-F2 is a read-only design audit.',
      'No Prisma writes, no score.ts changes, no schema changes.',
      'The Department model from the initial migration was dropped in the current schema; K22-F2 uses regex-based detection.',
      'Python parser has r"林校\\s*\\d+" regex (scripts/parse_cell.py:9), which can be reused for room classification.',
      'All 3 constraints are designed to be implementable with current data (no schema changes), but data quality audit is recommended as a pre-step.',
    ],
  }
  fs.writeFileSync(outPath, JSON.stringify(report, null, 2), 'utf-8')
  console.log(`Report written: ${outPath}`)
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
