// src/lib/scheduler/score-breakdown.ts
// K22-L2-SCHEDULER-RESULT-BREAKDOWN-UI
//
// Pure helper that converts a ScoreDetail[] array (the per-constraint
// violation list produced by calculateScoreWithDetails) into structured
// breakdowns suitable for UI display.
//
// Backwards compatibility:
//   - Returns null/zero values for any input that is null / undefined
//   - All constraints are enumerated (count=0 if not present) so the UI
//     can render a stable row order
//   - No DB access, no side effects — safe in client components

import type { ScoreDetail, ScoreWithDetails } from './types'

// ── Constraint registry (mirrors CONSTRAINT_REGISTRY in
//    scripts/evaluate-real-solver-quality-k22-l1.ts) ──

export interface ConstraintMeta {
  /** Short constraint id, e.g. "HC1", "SC2", "MIN_PERT" */
  id: string
  /** Type string used in ScoreDetail.type, e.g. "HC1_ROOM_CONFLICT" */
  type: string
  /** HARD or SOFT */
  level: 'HARD' | 'SOFT'
  /** Penalty per occurrence (negative integer) */
  penalty: number
  /** Human-readable description for UI */
  description: string
  /** Optional business category for top-level grouping */
  category: 'HARD' | 'SOFT' | 'PERTURBATION'
}

export const CONSTRAINT_REGISTRY: readonly ConstraintMeta[] = [
  // Hard constraints
  { id: 'HC1', type: 'HC1_ROOM_CONFLICT', level: 'HARD', penalty: -1000, category: 'HARD',
    description: '同一教室同一时段被两个任务占用' },
  { id: 'HC2', type: 'HC2_TEACHER_CONFLICT', level: 'HARD', penalty: -1000, category: 'HARD',
    description: '同一教师同一时段被两个任务占用' },
  { id: 'HC3', type: 'HC3_CLASS_CONFLICT', level: 'HARD', penalty: -1000, category: 'HARD',
    description: '同一班级同一时段被两个任务占用' },
  { id: 'HC4', type: 'HC4_CAPACITY', level: 'HARD', penalty: -1000, category: 'HARD',
    description: '学生人数超过教室容量' },
  { id: 'HC5', type: 'HC5_ROOM_UNAVAILABLE', level: 'HARD', penalty: -1000, category: 'HARD',
    description: '教室在该时段被标记为不可用' },
  { id: 'HC6', type: 'HC6_NON_AUTOMOTIVE_FORBID_LINXIAO', level: 'HARD', penalty: -1000, category: 'HARD',
    description: '非汽车/混合/未知专业任务被安排在林校教室' },

  // Soft constraints
  { id: 'SC1', type: 'SC1_CROSS_BUILDING_BACK_TO_BACK', level: 'SOFT', penalty: -5, category: 'SOFT',
    description: '同一教师或同班在相邻时段跨楼栋上课' },
  { id: 'SC2', type: 'SC2_SAME_DAY', level: 'SOFT', penalty: -10, category: 'SOFT',
    description: '同一任务在同一天有多个时段' },
  { id: 'SC3', type: 'SC3_EXTREME_TIME_SLOT', level: 'SOFT', penalty: -1, category: 'SOFT',
    description: '上课时间在第 5 节或更晚（偏晚）' },
  { id: 'SC4', type: 'SC4_CROSS_CAMPUS', level: 'SOFT', penalty: -5, category: 'SOFT',
    description: '同一任务同天相邻时段在不同楼栋' },
  { id: 'SC6', type: 'SC6_AUTOMOTIVE_PREFERS_LINXIAO', level: 'SOFT', penalty: -20, category: 'SOFT',
    description: '汽车专业任务未安排在林校教室' },
  { id: 'SC7', type: 'SC7_WEEKEND_AVOIDANCE', level: 'SOFT', penalty: -15, category: 'SOFT',
    description: '任务被安排在周末（周六/周日）' },
  { id: 'SC8', type: 'SC8_CLASS_GAP', level: 'SOFT', penalty: -2, category: 'SOFT',
    description: '同一班级同天存在上课空洞（period gap）' },
  { id: 'SC9', type: 'SC9_TEACHING_TASK_ROOM_STABILITY', level: 'SOFT', penalty: -2, category: 'SOFT',
    description: '同一任务在多个教室上课（缺稳定性）' },
  { id: 'SC10', type: 'SC10_ROOM_CAPACITY_UTILIZATION', level: 'SOFT', penalty: -2, category: 'SOFT',
    description: '教室容量利用率过紧(>90%)或过浪费(<30% 且容量>=100)' },

  // Perturbation
  { id: 'MIN_PERT', type: 'MINIMUM_PERTURBATION', level: 'SOFT', penalty: -2, category: 'PERTURBATION',
    description: '任务从原始位置被移动' },
] as const

// ── Aggregated constraint stat ──

export interface ConstraintStat {
  id: string
  type: string
  level: 'HARD' | 'SOFT'
  category: 'HARD' | 'SOFT' | 'PERTURBATION'
  description: string
  /** Negative integer — penalty per occurrence */
  penalty: number
  /** Number of detail entries of this type */
  triggerCount: number
  /** Sum of all penalties (negative) */
  totalPenalty: number
  /** Average penalty (negative) — 0 if triggerCount=0 */
  averagePenalty: number
  /** Severity bucket: "pass" | "info" | "warn" | "block" */
  severity: 'pass' | 'info' | 'warn' | 'block'
  /** Up to 5 sample ScoreDetail messages */
  topExamples: Array<{ slotId?: number; relatedSlotId?: number; message?: string; penalty: number }>
}

// ── Top issue entry ──

export interface TopIssue {
  rank: number
  constraintId: string
  constraintType: string
  level: 'HARD' | 'SOFT'
  category: 'HARD' | 'SOFT' | 'PERTURBATION'
  /** Display label, e.g. "SC8 班级空洞 48 对" */
  title: string
  /** Short detail line */
  detail: string
  /** Numeric penalty */
  totalPenalty: number
  /** Severity bucket */
  severity: 'pass' | 'info' | 'warn' | 'block'
}

// ── Business quality cards ──

export interface BusinessQualityCards {
  weekend: {
    constraintId: string
    triggerCount: number
    totalPenalty: number
    status: 'pass' | 'info' | 'warn' | 'block'
    topMessage?: string
  }
  linxiaoAutomotive: {
    hc6: { constraintId: string; triggerCount: number; totalPenalty: number; status: 'pass' | 'info' | 'warn' | 'block' }
    sc6: { constraintId: string; triggerCount: number; totalPenalty: number; status: 'pass' | 'info' | 'warn' | 'block' }
  }
  teacherDayBalance: {
    constraintId: string
    triggerCount: number
    totalPenalty: number
    status: 'pass' | 'info' | 'warn' | 'block'
  }
  classGap: {
    constraintId: string
    triggerCount: number
    totalPenalty: number
    status: 'pass' | 'info' | 'warn' | 'block'
  }
  roomStability: {
    constraintId: string
    triggerCount: number
    totalPenalty: number
    status: 'pass' | 'info' | 'warn' | 'block'
  }
  capacityUtilization: {
    constraintId: string
    triggerCount: number
    totalPenalty: number
    status: 'pass' | 'info' | 'warn' | 'block'
  }
  minPerturbation: {
    constraintId: string
    triggerCount: number
    totalPenalty: number
    status: 'pass' | 'info' | 'warn' | 'block'
  }
}

// ── Full breakdown structure ──

export interface ScoreBreakdown {
  /** Source label: "BEFORE" | "AFTER" | null (when input was empty) */
  source: 'BEFORE' | 'AFTER' | null
  hardScore: number
  softScore: number
  totalDetails: number
  /** All constraints (HC1-HC6, SC1-SC10, MIN_PERT) in stable order */
  constraints: ConstraintStat[]
  /** Hard-only constraints subset */
  hardConstraints: ConstraintStat[]
  /** Soft-only constraints subset */
  softConstraints: ConstraintStat[]
  /** MIN_PERT row (single entry or empty) */
  perturbation: ConstraintStat[]
  /** Top N issues, sorted by severity then |totalPenalty| desc */
  topIssues: TopIssue[]
  businessCards: BusinessQualityCards
}

// ── Severity rule ──

function severityFor(meta: ConstraintMeta, count: number): 'pass' | 'info' | 'warn' | 'block' {
  if (count === 0) return 'pass'
  if (meta.level === 'HARD') return 'block'
  // SOFT
  if (meta.id === 'HC6' || meta.id === 'SC6' || meta.id === 'SC7') {
    // Specialty / weekend — high visibility
    if (count >= 5) return 'block'
    if (count >= 1) return 'warn'
  }
  if (meta.id === 'SC8' || meta.id === 'SC9' || meta.id === 'SC5') {
    // Quality-bucket — visible
    if (count >= 20) return 'block'
    if (count >= 5) return 'warn'
    return 'info'
  }
  if (meta.id === 'SC10') {
    if (count >= 20) return 'warn'
    return 'info'
  }
  if (count >= 10) return 'warn'
  return 'info'
}

// ── Build breakdown from a ScoreWithDetails ──

const MAX_TOP_EXAMPLES = 5
const MAX_TOP_ISSUES = 20

export function buildScoreBreakdown(
  source: 'BEFORE' | 'AFTER' | null,
  score: ScoreWithDetails | null,
): ScoreBreakdown {
  const empty = emptyBreakdown(source)
  if (!score) return empty
  return buildBreakdownFromDetails(source, score.hardScore, score.softScore, score.details)
}

/**
 * Build from raw (hardScore, softScore, details[]). Used for legacy
 * resultSnapshot.scoreBreakdown.before / .after sub-objects that
 * persisted just the details array.
 */
export function buildBreakdownFromDetails(
  source: 'BEFORE' | 'AFTER' | null,
  hardScore: number,
  softScore: number,
  details: ScoreDetail[] | null | undefined,
): ScoreBreakdown {
  const safeDetails = Array.isArray(details) ? details : []
  const grouped = new Map<string, ScoreDetail[]>()
  for (const d of safeDetails) {
    let arr = grouped.get(d.type)
    if (!arr) { arr = []; grouped.set(d.type, arr) }
    arr.push(d)
  }

  // Build a stable ordered list of all known constraints
  const constraints: ConstraintStat[] = []
  for (const meta of CONSTRAINT_REGISTRY) {
    const entries = grouped.get(meta.type) ?? []
    const triggerCount = entries.length
    const totalPenalty = entries.reduce((acc, e) => acc + e.penalty, 0)
    constraints.push({
      id: meta.id,
      type: meta.type,
      level: meta.level,
      category: meta.category,
      description: meta.description,
      penalty: meta.penalty,
      triggerCount,
      totalPenalty,
      averagePenalty: triggerCount > 0 ? totalPenalty / triggerCount : 0,
      severity: severityFor(meta, triggerCount),
      topExamples: entries.slice(0, MAX_TOP_EXAMPLES).map((e) => ({
        slotId: e.slotId,
        relatedSlotId: e.relatedSlotId,
        message: e.message,
        penalty: e.penalty,
      })),
    })
  }

  const hardConstraints = constraints.filter((c) => c.category === 'HARD')
  const softConstraints = constraints.filter((c) => c.category === 'SOFT')
  const perturbation = constraints.filter((c) => c.category === 'PERTURBATION')

  // Top issues: filter to triggered constraints, sort by severity then |penalty| desc
  const severityWeight: Record<ConstraintStat['severity'], number> = {
    block: 0, warn: 1, info: 2, pass: 3,
  }
  const triggered = constraints.filter((c) => c.triggerCount > 0)
  triggered.sort((a, b) => {
    const sw = severityWeight[a.severity] - severityWeight[b.severity]
    if (sw !== 0) return sw
    return a.totalPenalty - b.totalPenalty // more negative first
  })
  const topIssues: TopIssue[] = triggered.slice(0, MAX_TOP_ISSUES).map((c, idx) => {
    const title = buildIssueTitle(c)
    const detail = c.topExamples[0]?.message ?? '（无样例）'
    return {
      rank: idx + 1,
      constraintId: c.id,
      constraintType: c.type,
      level: c.level,
      category: c.category,
      title,
      detail,
      totalPenalty: c.totalPenalty,
      severity: c.severity,
    }
  })

  return {
    source,
    hardScore,
    softScore,
    totalDetails: safeDetails.length,
    constraints,
    hardConstraints,
    softConstraints,
    perturbation,
    topIssues,
    businessCards: buildBusinessCards(constraints),
  }
}

function buildIssueTitle(c: ConstraintStat): string {
  switch (c.id) {
    case 'HC1': return `HC1 教室冲突 ${c.triggerCount} 次`
    case 'HC2': return `HC2 教师冲突 ${c.triggerCount} 次`
    case 'HC3': return `HC3 班级冲突 ${c.triggerCount} 次`
    case 'HC4': return `HC4 容量超限 ${c.triggerCount} 次`
    case 'HC5': return `HC5 教室不可用 ${c.triggerCount} 次`
    case 'HC6': return `HC6 林校违规 ${c.triggerCount} 次`
    case 'SC1': return `SC1 跨楼栋连续 ${c.triggerCount} 次`
    case 'SC2': return `SC2 同天多节 ${c.triggerCount} 次`
    case 'SC3': return `SC3 极端时间 ${c.triggerCount} 次`
    case 'SC4': return `SC4 跨校区同 task ${c.triggerCount} 次`
    case 'SC5': return `SC5 教师负载不均 ${c.triggerCount} 个教师`
    case 'SC6': return `SC6 汽车未在林校 ${c.triggerCount} 次`
    case 'SC7': return `SC7 周末排课 ${c.triggerCount} 次`
    case 'SC8': return `SC8 班级空洞 ${c.triggerCount} 对`
    case 'SC9': return `SC9 教室不稳定 ${c.triggerCount} 个 task`
    case 'SC10': return `SC10 容量利用率问题 ${c.triggerCount} 次`
    case 'MIN_PERT': return `MIN_PERT 移动 ${c.triggerCount} 个 slot`
    default: return `${c.id} 触发 ${c.triggerCount} 次`
  }
}

function findStat(constraints: ConstraintStat[], id: string): ConstraintStat {
  // Always returns a row; defaults to zeroed entry.
  return (
    constraints.find((c) => c.id === id) ?? {
      id, type: '', level: 'SOFT', category: 'SOFT',
      description: '', penalty: 0, triggerCount: 0,
      totalPenalty: 0, averagePenalty: 0, severity: 'pass',
      topExamples: [],
    }
  )
}

function cardFromStat(c: ConstraintStat): {
  constraintId: string
  triggerCount: number
  totalPenalty: number
  status: 'pass' | 'info' | 'warn' | 'block'
  topMessage?: string
} {
  return {
    constraintId: c.id,
    triggerCount: c.triggerCount,
    totalPenalty: c.totalPenalty,
    status: c.severity,
    topMessage: c.topExamples[0]?.message,
  }
}

function buildBusinessCards(constraints: ConstraintStat[]): BusinessQualityCards {
  const sc7 = findStat(constraints, 'SC7')
  const hc6 = findStat(constraints, 'HC6')
  const sc6 = findStat(constraints, 'SC6')
  const sc5 = findStat(constraints, 'SC5')
  const sc8 = findStat(constraints, 'SC8')
  const sc9 = findStat(constraints, 'SC9')
  const sc10 = findStat(constraints, 'SC10')
  const mp = findStat(constraints, 'MIN_PERT')

  return {
    weekend: cardFromStat(sc7),
    linxiaoAutomotive: {
      hc6: cardFromStat(hc6),
      sc6: cardFromStat(sc6),
    },
    teacherDayBalance: cardFromStat(sc5),
    classGap: cardFromStat(sc8),
    roomStability: cardFromStat(sc9),
    capacityUtilization: cardFromStat(sc10),
    minPerturbation: cardFromStat(mp),
  }
}

function emptyBreakdown(source: 'BEFORE' | 'AFTER' | null): ScoreBreakdown {
  // Build a zeroed breakdown with all constraints present.
  const constraints: ConstraintStat[] = CONSTRAINT_REGISTRY.map((meta) => ({
    id: meta.id,
    type: meta.type,
    level: meta.level,
    category: meta.category,
    description: meta.description,
    penalty: meta.penalty,
    triggerCount: 0,
    totalPenalty: 0,
    averagePenalty: 0,
    severity: 'pass',
    topExamples: [],
  }))
  return {
    source,
    hardScore: 0,
    softScore: 0,
    totalDetails: 0,
    constraints,
    hardConstraints: constraints.filter((c) => c.category === 'HARD'),
    softConstraints: constraints.filter((c) => c.category === 'SOFT'),
    perturbation: constraints.filter((c) => c.category === 'PERTURBATION'),
    topIssues: [],
    businessCards: buildBusinessCards(constraints),
  }
}

// ── Wire shape: persisted in resultSnapshot.scoreBreakdown ──

/**
 * Persistable wire shape (K22-L2). Stored inside
 * SchedulingRun.resultSnapshot.scoreBreakdown.
 *
 *   { before: ScoreBreakdownWire, after: ScoreBreakdownWire, version: 1 }
 *
 * Old runs that don't have this sub-object are handled by
 * the route returning `scoreBreakdown: null`.
 */
export interface ScoreBreakdownWire {
  hardScore: number
  softScore: number
  totalDetails: number
  /** Constraint stats — full array */
  constraints: ConstraintStat[]
  /** Pre-computed top issues (for fast UI render) */
  topIssues: TopIssue[]
  /** Pre-computed business cards (for fast UI render) */
  businessCards: BusinessQualityCards
}

export interface ResultSnapshotScoreBreakdown {
  version: 1
  before: ScoreBreakdownWire
  after: ScoreBreakdownWire
}

export function buildWireBreakdown(before: ScoreBreakdown, after: ScoreBreakdown): ResultSnapshotScoreBreakdown {
  const toWire = (b: ScoreBreakdown): ScoreBreakdownWire => ({
    hardScore: b.hardScore,
    softScore: b.softScore,
    totalDetails: b.totalDetails,
    constraints: b.constraints,
    topIssues: b.topIssues,
    businessCards: b.businessCards,
  })
  return { version: 1, before: toWire(before), after: toWire(after) }
}

/**
 * Read a persisted scoreBreakdown sub-object and reconstruct a ScoreBreakdown
 * for UI rendering. Returns null if input is missing/malformed (back-compat).
 */
export function readPersistedBreakdown(
  wire: unknown,
  side: 'BEFORE' | 'AFTER',
): ScoreBreakdown | null {
  if (!wire || typeof wire !== 'object') return null
  const w = wire as Partial<ScoreBreakdownWire>
  if (
    typeof w.hardScore !== 'number' ||
    typeof w.softScore !== 'number' ||
    typeof w.totalDetails !== 'number' ||
    !Array.isArray(w.constraints)
  ) {
    return null
  }
  return {
    source: side,
    hardScore: w.hardScore,
    softScore: w.softScore,
    totalDetails: w.totalDetails,
    constraints: w.constraints,
    hardConstraints: w.constraints.filter((c) => c.category === 'HARD'),
    softConstraints: w.constraints.filter((c) => c.category === 'SOFT'),
    perturbation: w.constraints.filter((c) => c.category === 'PERTURBATION'),
    topIssues: Array.isArray(w.topIssues) ? w.topIssues : [],
    businessCards: (w.businessCards as BusinessQualityCards) ?? buildBusinessCards(w.constraints),
  }
}

// ── Convenience: read wire from resultSnapshot or fall back to nothing ──

export function readSnapshotBreakdown(
  resultSnapshot: string | null | undefined,
): ResultSnapshotScoreBreakdown | null {
  if (!resultSnapshot) return null
  try {
    const parsed = JSON.parse(resultSnapshot)
    if (!parsed || typeof parsed !== 'object') return null
    const sb = parsed.scoreBreakdown
    if (!sb || sb.version !== 1) return null
    if (!sb.before || !sb.after) return null
    return sb as ResultSnapshotScoreBreakdown
  } catch {
    return null
  }
}
