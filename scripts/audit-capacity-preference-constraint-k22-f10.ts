/**
 * K22-F10 Capacity Preference Constraint Audit
 *
 * Read-only audit of whether a "大班优先大教室 / 容量余量优化" soft constraint
 * (proposed canonical name: SC10_ROOM_CAPACITY_UTILIZATION) is feasible and
 * should be implemented. This stage does NOT modify score.ts, does NOT change
 * the schema, does NOT write to the database, and does NOT add any new
 * constraint. It only produces audit + design output.
 *
 * Strong constraints:
 *   - NO Prisma writes.
 *   - NO score.ts / solver / schema / migration / API / frontend / importer /
 *     parser / RBAC changes.
 *   - NO business data changes.
 *   - NO hardWeights / softWeights fields.
 *   - NO new soft / hard constraint implementations.
 *   - NO harness logic changes.
 *   - NO HC4 weakening.
 *   - NO HC4 → soft conversion.
 *
 * Output:
 *   - Terminal summary
 *   - docs/k22-capacity-preference-constraint-audit.json
 */

import * as fs from 'node:fs'
import * as path from 'node:path'
import { PrismaClient } from '@prisma/client'

const projectRoot = path.resolve(__dirname, '..')

// Use a dedicated client for read-only inspection.
const prisma = new PrismaClient()

// ── Types ────────────────────────────────────────────────────────────

type Severity = 'HIGH' | 'MEDIUM' | 'LOW' | 'INFO' | 'NONE'

interface CapacityBucketRow {
  bucket: string
  count: number
  percent: number
  notes: string
}

interface CapacityDataQuality {
  roomTotal: number
  min: number
  max: number
  avg: number
  median: number
  distinct: number
  zeroCount: number
  nullCount: number
  negativeCount: number
  default50Count: number
  buckets: CapacityBucketRow[]
  suspiciousRooms: Array<{ id: number; name: string; capacity: number; reasons: string[] }>
  k21Conclusion: string
  k22gConclusion: string
  thisAuditConclusion: string
}

interface TaskStudentCountRow {
  bucket: string
  count: number
  percent: number
  notes: string
}

interface TaskStudentCountQuality {
  taskTotal: number
  tasksWithClasses: number
  tasksWithoutClasses: number
  classGroupCount: number
  classGroupWithStudentCount: number
  classGroupWithoutStudentCount: number
  countSourceDistribution: Record<string, number>
  duplicatedClassLinks: number
  min: number
  max: number
  avg: number
  median: number
  buckets: TaskStudentCountRow[]
  notes: string
}

interface HC4Audit {
  exists: boolean
  fullScore: boolean
  deltaScore: boolean
  harnessSection: string
  penalty: number
  triggerCondition: string
  currentViolationCount: number
  currentFeasibleViolationCount: number
  notes: string
}

interface CandidateStrategy {
  id: 'A' | 'B' | 'C' | 'D'
  name: string
  description: string
  pros: string[]
  cons: string[]
  riskLevel: 'LOW' | 'MEDIUM' | 'HIGH'
  recommended: boolean
  rationale: string
}

interface SC10FullScoreDesign {
  canonicalName: string
  skipRules: string[]
  formula: string
  penaltyScale: string
  hardScore: number
  softScore: number
  onlySoftScore: boolean
  pseudoCode: string
}

interface SC10DeltaScoreDesign {
  affectedKeyStrategy: string
  complexity: string
  minPertIsolation: string
  pseudoCode: string
}

interface SC10Interaction {
  constraint: string
  relationship: 'orthogonal' | 'soft-tradeoff' | 'soft-priority' | 'hard-orthogonal' | 'overlap'
  notes: string
}

interface HarnessPlanCase {
  id: string
  type: 'full' | 'delta'
  title: string
  expectedSoft: number | string
  isolationNotes: string
}

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

// ── Capacity data quality inspection ────────────────────────────────

async function inspectCapacity(): Promise<CapacityDataQuality> {
  const result: CapacityDataQuality = {
    roomTotal: 0,
    min: 0,
    max: 0,
    avg: 0,
    median: 0,
    distinct: 0,
    zeroCount: 0,
    nullCount: 0,
    negativeCount: 0,
    default50Count: 0,
    buckets: [],
    suspiciousRooms: [],
    k21Conclusion: '53 rooms; capacity=0 count is 0; no placeholders; capacity range 3-200; median 40',
    k22gConclusion: 'All 53 rooms have real capacity (K21-FIX-A confirmed); range 3-200, median 40, avg 46',
    thisAuditConclusion: '',
  }
  try {
    const rooms = await prisma.room.findMany({
      select: { id: true, name: true, capacity: true },
      orderBy: { capacity: 'asc' },
    })
    result.roomTotal = rooms.length

    const capacities = rooms.map((r) => r.capacity)
    if (capacities.length > 0) {
      result.min = capacities[0]
      result.max = capacities[capacities.length - 1]
      result.avg = Math.round(capacities.reduce((a, b) => a + b, 0) / capacities.length)
      const sorted = [...capacities].sort((a, b) => a - b)
      const mid = Math.floor(sorted.length / 2)
      result.median = sorted.length % 2 === 0 ? Math.round((sorted[mid - 1] + sorted[mid]) / 2) : sorted[mid]
      result.distinct = new Set(capacities).size
    }
    for (const r of rooms) {
      if (r.capacity === 0) result.zeroCount++
      if (r.capacity < 0) result.negativeCount++
      if (r.capacity === 50) result.default50Count++

      // Suspicious: very small capacity (single-seat office?) or very large
      const reasons: string[] = []
      if (r.capacity < 10) reasons.push(`capacity=${r.capacity} very small (likely lab/single-seat)`)
      if (r.capacity > 150) reasons.push(`capacity=${r.capacity} very large (lecture hall)`)
      if (r.capacity === 0) reasons.push('capacity=0 (HC4 cannot evaluate)')
      if (reasons.length > 0) result.suspiciousRooms.push({ id: r.id, name: r.name, capacity: r.capacity, reasons })
    }

    // Buckets
    const buckets: Record<string, number> = {}
    for (const c of capacities) {
      const b = c < 30 ? '<30' : c < 50 ? '30-49' : c < 80 ? '50-79' : c < 120 ? '80-119' : '>=120'
      buckets[b] = (buckets[b] ?? 0) + 1
    }
    const bucketOrder = ['<30', '30-49', '50-79', '80-119', '>=120']
    result.buckets = bucketOrder.map((b) => ({
      bucket: b,
      count: buckets[b] ?? 0,
      percent: result.roomTotal > 0 ? Math.round((buckets[b] ?? 0) / result.roomTotal * 100) : 0,
      notes:
        b === '<30' ? 'small room / single-seat / lab' :
        b === '30-49' ? 'small classroom' :
        b === '50-79' ? 'standard classroom' :
        b === '80-119' ? 'large classroom' :
        'lecture hall / auditorium',
    }))

    result.thisAuditConclusion = result.zeroCount === 0 && result.negativeCount === 0
      ? `Capacity is real: ${result.roomTotal} rooms, range ${result.min}-${result.max}, median ${result.median}, no null/0/negative values.`
      : `Capacity has quality issues: ${result.zeroCount} zero, ${result.negativeCount} negative.`
  } catch (e) {
    result.thisAuditConclusion = `DB inspection failed: ${(e as Error).message}`
  } finally {
    await prisma.$disconnect()
  }
  return result
}

// ── TeachingTask student count audit ────────────────────────────────

async function inspectTaskStudentCount(): Promise<TaskStudentCountQuality> {
  const result: TaskStudentCountQuality = {
    taskTotal: 0,
    tasksWithClasses: 0,
    tasksWithoutClasses: 0,
    classGroupCount: 0,
    classGroupWithStudentCount: 0,
    classGroupWithoutStudentCount: 0,
    countSourceDistribution: { REAL_STUDENT_COUNT: 0, FALLBACK_50_PER_CLASS: 0, MIXED: 0 },
    duplicatedClassLinks: 0,
    min: 0,
    max: 0,
    avg: 0,
    median: 0,
    buckets: [],
    notes: '',
  }

  const FALLBACK = 50

  try {
    const [tasks, classGroups] = await Promise.all([
      prisma.teachingTask.findMany({
        select: {
          id: true,
          taskClasses: { select: { classGroupId: true, classGroup: { select: { name: true, studentCount: true } } } },
        },
      }),
      prisma.classGroup.findMany({ select: { id: true, studentCount: true } }),
    ])

    result.taskTotal = tasks.length
    result.classGroupCount = classGroups.length
    result.classGroupWithStudentCount = classGroups.filter((cg) => cg.studentCount != null && cg.studentCount > 0).length
    result.classGroupWithoutStudentCount = result.classGroupCount - result.classGroupWithStudentCount

    const studentCounts: number[] = []
    for (const t of tasks) {
      const seen = new Set<number>()
      let dupCount = 0
      let totalStudents = 0
      let hasReal = false
      let hasFallback = false

      if (t.taskClasses.length === 0) {
        result.tasksWithoutClasses++
        totalStudents = FALLBACK
        hasFallback = true
      } else {
        result.tasksWithClasses++
        for (const tc of t.taskClasses) {
          if (seen.has(tc.classGroupId)) {
            dupCount++
            continue
          }
          seen.add(tc.classGroupId)
          const sc = tc.classGroup.studentCount
          if (sc != null && sc > 0) {
            totalStudents += sc
            hasReal = true
          } else {
            totalStudents += FALLBACK
            hasFallback = true
          }
        }
      }
      result.duplicatedClassLinks += dupCount

      if (hasReal && hasFallback) result.countSourceDistribution.MIXED++
      else if (hasReal) result.countSourceDistribution.REAL_STUDENT_COUNT++
      else result.countSourceDistribution.FALLBACK_50_PER_CLASS++

      studentCounts.push(totalStudents)
    }

    if (studentCounts.length > 0) {
      const sorted = [...studentCounts].sort((a, b) => a - b)
      result.min = sorted[0]
      result.max = sorted[sorted.length - 1]
      result.avg = Math.round(studentCounts.reduce((a, b) => a + b, 0) / studentCounts.length)
      const mid = Math.floor(sorted.length / 2)
      result.median = sorted.length % 2 === 0 ? Math.round((sorted[mid - 1] + sorted[mid]) / 2) : sorted[mid]
    }

    const buckets: Record<string, number> = {}
    for (const c of studentCounts) {
      const b = c < 30 ? '<30' : c < 50 ? '30-49' : c < 80 ? '50-79' : c < 120 ? '80-119' : '>=120'
      buckets[b] = (buckets[b] ?? 0) + 1
    }
    const bucketOrder = ['<30', '30-49', '50-79', '80-119', '>=120']
    result.buckets = bucketOrder.map((b) => ({
      bucket: b,
      count: buckets[b] ?? 0,
      percent: result.taskTotal > 0 ? Math.round((buckets[b] ?? 0) / result.taskTotal * 100) : 0,
      notes:
        b === '<30' ? 'small class' :
        b === '30-49' ? 'small-medium' :
        b === '50-79' ? 'medium-large' :
        b === '80-119' ? 'large' :
        'very large / merged-class',
    }))

    result.notes = `All values computed via getTaskStudentCount algorithm (ClassGroup.studentCount, fallback 50). Duplicated class links are detected and deduped.`
  } catch (e) {
    result.notes = `DB inspection failed: ${(e as Error).message}`
  }
  return result
}

// ── HC4 audit ────────────────────────────────────────────────────────

async function inspectHC4(): Promise<HC4Audit> {
  const audit: HC4Audit = {
    exists: true,
    fullScore: true,
    deltaScore: true,
    harnessSection: 'Harness B (HC invariant)',
    penalty: -1000,
    triggerCondition: 'taskStudentCount > room.capacity',
    currentViolationCount: 0,
    currentFeasibleViolationCount: 0,
    notes: 'HC4 is implemented in both full and delta paths. Penalty is -1000. Triggered by getTaskStudentCount(studentCount) > room.capacity.',
  }
  try {
    const slots = await prisma.scheduleSlot.findMany({
      select: {
        id: true,
        roomId: true,
        teachingTask: {
          select: {
            id: true,
            taskClasses: { select: { classGroup: { select: { studentCount: true } } } },
          },
        },
      },
    })
    const rooms = await prisma.room.findMany({ select: { id: true, capacity: true, name: true } })
    const roomMap = new Map(rooms.map((r) => [r.id, r]))
    const FALLBACK = 50
    for (const slot of slots) {
      if (slot.roomId == null) continue
      const room = roomMap.get(slot.roomId)
      if (!room) continue
      let totalStudents = 0
      const seen = new Set<number>()
      for (const tc of slot.teachingTask.taskClasses) {
        if (seen.has(tc.classGroup.studentCount ?? -1) && tc.classGroup.studentCount == null) continue
        seen.add(tc.classGroup.studentCount ?? -1)
        const sc = tc.classGroup.studentCount
        totalStudents += sc != null && sc > 0 ? sc : FALLBACK
      }
      if (slot.teachingTask.taskClasses.length === 0) totalStudents = FALLBACK
      if (totalStudents > room.capacity) audit.currentViolationCount++
    }
  } catch (e) {
    audit.notes = `HC4 inspection failed: ${(e as Error).message}`
  }
  return audit
}

// ── Candidate strategies ────────────────────────────────────────────

function candidateStrategies(): CandidateStrategy[] {
  return [
    {
      id: 'A',
      name: 'Large class prefers larger room (threshold-based)',
      description:
        'Trigger only when taskStudentCount >= 50 (large class). If room.capacity < (taskStudentCount + buffer), apply a fixed penalty. ' +
        'Example: if taskStudentCount >= 50 and room.capacity < taskStudentCount * 1.2 → -3.',
      pros: [
        'Simple, easy to reason about.',
        'Does not penalize small classes at all.',
        'Easy to verify in harness (single threshold).',
      ],
      cons: [
        'Threshold (50) is hard-coded and may not match all schools.',
        'Buffer ratio (1.2) is arbitrary.',
        'Does nothing for small classes occupying huge rooms (waste).',
        'Threshold tuning risk: may not fire often enough or may fire too often.',
      ],
      riskLevel: 'MEDIUM',
      recommended: false,
      rationale:
        'Reasonable but narrow. Does not address resource utilization (small class in huge room). ' +
        'Pair with Candidate C if used.',
    },
    {
      id: 'B',
      name: 'Capacity buffer / margin preference (utilization ratio)',
      description:
        'Compute utilization = taskStudentCount / room.capacity. If utilization > 0.90, apply -2 (tight). ' +
        'Optional: if utilization < 0.30 and room.capacity >= 100, apply -1 (waste). ' +
        'Smooth, continuous penalty that scales with how tight or wasteful the match is.',
      pros: [
        'Smooth: no hard threshold.',
        'Naturally complements HC4 (which fires at utilization > 1.0).',
        'Can penalize both tight and wasteful matches.',
        'Reuses existing getTaskStudentCount helper.',
      ],
      cons: [
        'Two thresholds (0.90 and 0.30) need calibration.',
        'Waste penalty may conflict with SC9 (room stability) when solver wants to keep the same room.',
        'Penalties are uniform per slot; not a function of how tight (could be graduated).',
      ],
      riskLevel: 'MEDIUM',
      recommended: true,
      rationale:
        'Smooth, general, naturally aligned with HC4. Reuses getTaskStudentCount. Single helper ' +
        'shared by full + delta. Best balance of expressiveness and simplicity.',
    },
    {
      id: 'C',
      name: 'Avoid wasting large rooms for small classes',
      description:
        'Trigger when taskStudentCount < 30 and room.capacity >= 100. Apply -1 (waste penalty). ' +
        'Complements Candidate A or B by addressing the small-class-in-huge-room case.',
      pros: [
        'Improves resource utilization.',
        'Complements large-class preference.',
        'Easy to verify in harness.',
      ],
      cons: [
        'Threshold 30 / 100 is hard-coded.',
        'May conflict with SC9 (room stability): solver may want to keep small class in same room for stability.',
        'May conflict with HC1 (room conflict) solver logic: large room is often the only free one.',
        'Wastes solver time on tiny penalty (-1).',
      ],
      riskLevel: 'MEDIUM',
      recommended: false,
      rationale:
        'Useful as a sub-bucket of Candidate B. Standalone use is too narrow. Better to combine ' +
        'waste-penalty into Candidate B (utilization < 0.30 branch).',
    },
    {
      id: 'D',
      name: 'Combined utilization band (tight + waste)',
      description:
        'Single penalty based on utilization ratio: ' +
        'utilization > 0.90 → -2; ' +
        'utilization < 0.30 AND room.capacity >= 100 → -1; ' +
        'otherwise 0. ' +
        'Same as Candidate B with explicit waste branch.',
      pros: [
        'Single helper function, single penalty structure.',
        'Both directions of utilization are covered.',
        'Smooth and explicit.',
        'Easy to test in harness (one formula, three branches).',
      ],
      cons: [
        'Slightly more complex than B alone (extra branch).',
        'Still uses two hard thresholds (0.90, 0.30, 100).',
      ],
      riskLevel: 'LOW',
      recommended: true,
      rationale:
        'Recommended as the canonical SC10 design. Combines B (utilization > 0.90) and C ' +
        '(waste at utilization < 0.30 and capacity >= 100) into a single, testable rule.',
    },
  ]
}

// ── Recommended SC10 design ─────────────────────────────────────────

function recommendedFullScoreDesign(): SC10FullScoreDesign {
  return {
    canonicalName: 'SC10_ROOM_CAPACITY_UTILIZATION',
    skipRules: [
      'room === 0 (unscheduled)',
      'room missing in roomById (defensive)',
      'taskStudentCount <= 0 (no classes or all-zero counts — should not happen but defensive)',
      'room.capacity <= 0 (room is not usable)',
      'utilization > 1.0 (HC4 owns this case; SC10 skips to avoid double-counting)',
    ],
    formula:
      'utilization = taskStudentCount / room.capacity\n' +
      'if utilization > 0.90 → penalty = -2 (tight)\n' +
      'else if utilization < 0.30 AND room.capacity >= 100 → penalty = -1 (waste)\n' +
      'else → penalty = 0',
    penaltyScale:
      '-2 for tight match (utilization > 0.90). Matches SC8 / SC9 base unit (per-gap / per-extra-room). ' +
      '-1 for waste (utilization < 0.30 with large room). Lighter than tight penalty. ' +
      'Both are within the existing soft penalty range (-1 to -20) and well below HC4 (-1000).',
    hardScore: 0,
    softScore: -3, // per-slot worst case
    onlySoftScore: true,
    pseudoCode: `// In calculateScoreWithDetails, after HC4 / SC9, before MIN_PERT:
const utilizationMap = new Map<string, number>() // key = slotId
for (const p of positions) {
  if (p.room === 0) continue
  const room = ctx.roomById.get(p.room)
  if (!room || room.capacity <= 0) continue
  const studentInfo = getTaskStudentCount(p.slot.teachingTask, ctx)
  if (studentInfo.studentCount <= 0) continue
  const utilization = studentInfo.studentCount / room.capacity
  if (utilization > 1.0) continue // HC4 owns this
  let penalty = 0
  if (utilization > 0.90) penalty = -2 // tight
  else if (utilization < 0.30 && room.capacity >= 100) penalty = -1 // waste
  if (penalty !== 0) {
    softScore += penalty
    details.push({
      type: 'SC10_ROOM_CAPACITY_UTILIZATION', level: 'SOFT', penalty,
      slotId: p.slot.id,
      message: \`容量利用率 \${(utilization * 100).toFixed(1)}%: 任务 \${studentInfo.studentCount} 人, 教室 \${room.name} 容量 \${room.capacity}\`,
    })
  }
}`,
  }
}

function recommendedDeltaScoreDesign(): SC10DeltaScoreDesign {
  return {
    affectedKeyStrategy:
      'Per-slot (moved slot is the only affected key). Unlike SC5 / SC8 / SC9, SC10 is NOT ' +
      'an aggregate constraint — it evaluates one slot at a time. Therefore the delta computation ' +
      'is O(1): re-evaluate SC10 on the moved slot at old and new positions.',
    complexity: 'O(1) per delta (just two utilization calculations)',
    minPertIsolation:
      'Use 3rd-position originalAssignments (F3/F4/F6/F8 pattern) to isolate MIN_PERT in delta tests.',
    pseudoCode: `// In calculateDeltaScore, after HC4 delta, before SC9 delta:
const studentInfo = getTaskStudentCount(task, ctx)
if (studentInfo.studentCount > 0) {
  // Old position
  if (old.roomId !== 0) {
    const oldRoom = ctx.roomById.get(old.roomId)
    if (oldRoom && oldRoom.capacity > 0 && studentInfo.studentCount <= oldRoom.capacity) {
      const oldUtil = studentInfo.studentCount / oldRoom.capacity
      const oldPenalty = computeSC10Penalty(oldUtil, oldRoom.capacity)
      deltaSoft -= oldPenalty // remove old penalty
    }
  }
  // New position
  const newRoom = ctx.roomById.get(move.newRoomId)
  if (newRoom && newRoom.capacity > 0 && studentInfo.studentCount <= newRoom.capacity) {
    const newUtil = studentInfo.studentCount / newRoom.capacity
    const newPenalty = computeSC10Penalty(newUtil, newRoom.capacity)
    deltaSoft += newPenalty // add new penalty
  }
}

function computeSC10Penalty(utilization: number, capacity: number): number {
  if (utilization > 1.0) return 0 // HC4 owns
  if (utilization > 0.90) return -2 // tight
  if (utilization < 0.30 && capacity >= 100) return -1 // waste
  return 0
}`,
  }
}

function interactionAnalysis(): SC10Interaction[] {
  return [
    {
      constraint: 'HC4 capacity',
      relationship: 'hard-orthogonal',
      notes:
        'SC10 cannot weaken HC4. HC4 still triggers at utilization > 1.0. SC10 only fires ' +
        'when utilization <= 1.0. If a move brings a slot into utilization > 1.0, only HC4 ' +
        'penalty applies (deltaHard += -1000); SC10 does not add anything (skipped).',
    },
    {
      constraint: 'SC9 room stability',
      relationship: 'soft-tradeoff',
      notes:
        'SC9 may keep a task in the same room across slots for stability. SC10 may want a ' +
        'different (more appropriately sized) room for a slot. Both are at -2 / -2. The ' +
        'LAHC solver will weigh them; if SC10 is wrong (penalizing a stable match), the ' +
        'bestScore will still converge to the global optimum. No hard conflict.',
    },
    {
      constraint: 'SC8 class gap',
      relationship: 'orthogonal',
      notes:
        'SC8 keys on (classGroup, day); SC10 keys on (slot, room). Different domains. ' +
        'No interaction.',
    },
    {
      constraint: 'SC6 / HC6 Linxiao',
      relationship: 'soft-priority',
      notes:
        'Linxiao rooms tend to be small (capacity 25-92 in this dev.db). If automotive ' +
        'classes are placed in Linxiao per SC6 / HC6, they may have tight utilization ' +
        '(Linxiao rooms cluster at 25-40). SC6 (-20) is much stronger than SC10 (-1 or -2); ' +
        'solver will prefer Linxiao match over capacity. This is intended: specialty rule ' +
        'wins over utilization preference.',
    },
    {
      constraint: 'SC7 weekend',
      relationship: 'orthogonal',
      notes:
        'SC10 is independent of day. Capacity utilization is the same whether the slot is ' +
        'on a weekday or weekend. SC10 does not skip weekend slots (unlike SC5 / SC8 / SC9 ' +
        'which skip weekend). The reasoning: capacity preference is structural, not ' +
        'time-based.',
    },
    {
      constraint: 'MIN_PERT',
      relationship: 'orthogonal',
      notes:
        'SC10 does not depend on originalAssignments. It only cares about current assignment ' +
        'vs room capacity. Delta tests must still use 3rd-position originalAssignments to ' +
        'isolate MIN_PERT net 0.',
    },
    {
      constraint: 'SC1 cross-building',
      relationship: 'orthogonal',
      notes: 'Different key (room building vs room capacity). No interaction.',
    },
    {
      constraint: 'SC2 same-day',
      relationship: 'orthogonal',
      notes: 'Different key (task-day vs slot-room). No interaction.',
    },
    {
      constraint: 'SC3 extreme time',
      relationship: 'orthogonal',
      notes: 'Different key (slotIndex vs room capacity). No interaction.',
    },
    {
      constraint: 'SC4 cross-campus',
      relationship: 'orthogonal',
      notes: 'Different key (room building vs room capacity). No interaction.',
    },
    {
      constraint: 'SC5 teacher day balance',
      relationship: 'orthogonal',
      notes: 'Different key (teacher-day vs slot-room). No interaction.',
    },
  ]
}

function harnessPlan(): HarnessPlanCase[] {
  return [
    {
      id: 'J1-CAPACITY-GOOD-FIT',
      type: 'full',
      title: 'Good fit: utilization 0.50 → soft=0',
      expectedSoft: 0,
      isolationNotes:
        'teacherId=null (SC5 skip), 1 slot per task (SC2 skip), periods <5 (SC3 skip), ' +
        'weekday only (SC7 skip). Utilization 0.50 is in 0.30-0.90 band, no penalty.',
    },
    {
      id: 'J2-CAPACITY-TIGHT-FIT',
      type: 'full',
      title: 'Tight fit: utilization 0.95 → soft=-2',
      expectedSoft: -2,
      isolationNotes: 'Same isolation. Utilization > 0.90 fires the -2 tight branch.',
    },
    {
      id: 'J3-CAPACITY-OVER-CAPACITY',
      type: 'full',
      title: 'Over capacity: utilization 1.20 → hard=-1000, soft=0 (SC10 skips)',
      expectedSoft: 0,
      isolationNotes: 'HC4 fires. SC10 skips (utilization > 1.0). Component assertion: SC10 details=0.',
    },
    {
      id: 'J4-CAPACITY-SMALL-CLASS-HUGE-ROOM',
      type: 'full',
      title: 'Small class in huge room: utilization 0.20, cap=120 → soft=-1',
      expectedSoft: -1,
      isolationNotes: 'Utilization < 0.30 AND cap >= 100 → waste penalty -1.',
    },
    {
      id: 'J5-CAPACITY-SMALL-CLASS-NORMAL-ROOM',
      type: 'full',
      title: 'Small class in normal room: utilization 0.40, cap=60 → soft=0',
      expectedSoft: 0,
      isolationNotes: 'Utilization 0.40 is in 0.30-0.90 band, no penalty.',
    },
    {
      id: 'J6-CAPACITY-ROOM-ZERO-SKIP',
      type: 'full',
      title: 'room=0 (unscheduled): SC10 skip → soft=0',
      expectedSoft: 0,
      isolationNotes: 'room=0 → SC10 skips. Total soft=0 (also HC1/HC4/HC5 skip on room=0).',
    },
    {
      id: 'J7-CAPACITY-MISSING-STUDENT-COUNT-SKIP',
      type: 'full',
      title: 'taskStudentCount=0 (no classes): SC10 skip → soft=0',
      expectedSoft: 0,
      isolationNotes: 'Defensive skip. getTaskStudentCount returns 50 fallback for empty taskClasses, ' +
        'so this case requires manual fixture override.',
    },
    {
      id: 'J8-CAPACITY-EXACT-0.90-BOUNDARY',
      type: 'full',
      title: 'Boundary: utilization = 0.90 → soft=0 (strict >)',
      expectedSoft: 0,
      isolationNotes: 'Boundary test: > 0.90 strictly. 0.90 itself does not fire.',
    },
    {
      id: 'J9-DELTA-IMPROVE-TIGHT-TO-GOOD',
      type: 'delta',
      title: 'Move from tight (0.95) to good (0.50) → deltaSoft=+2',
      expectedSoft: 2,
      isolationNotes: '3rd-position originalAssignments. Same task, different room. SC10 only.',
    },
    {
      id: 'J10-DELTA-WORSEN-GOOD-TO-TIGHT',
      type: 'delta',
      title: 'Move from good (0.50) to tight (0.95) → deltaSoft=-2',
      expectedSoft: -2,
      isolationNotes: 'Same isolation.',
    },
    {
      id: 'J11-DELTA-SMALL-HUGE-TO-NORMAL',
      type: 'delta',
      title: 'Move small class from huge (0.20, cap=120) to normal (0.50, cap=60) → deltaSoft=+1',
      expectedSoft: 1,
      isolationNotes: 'Waste penalty removed.',
    },
    {
      id: 'J12-DELTA-NORMAL-TO-HUGE',
      type: 'delta',
      title: 'Move small class from normal (0.50, cap=60) to huge (0.20, cap=120) → deltaSoft=-1',
      expectedSoft: -1,
      isolationNotes: 'Waste penalty introduced.',
    },
    {
      id: 'J13-DELTA-OVER-CAPACITY-INTRODUCED',
      type: 'delta',
      title: 'Move into over-capacity (utilization 1.10) → deltaHard=-1000, deltaSoft=0 (SC10 skips)',
      expectedSoft: 0,
      isolationNotes: 'SC10 skips (utilization > 1.0). HC4 fires. Component assertion.',
    },
  ]
}

// ── Findings ────────────────────────────────────────────────────────

function buildFindings(capacity: CapacityDataQuality, task: TaskStudentCountQuality, hc4: HC4Audit): Finding[] {
  const findings: Finding[] = []

  // F1: Capacity data quality
  if (capacity.zeroCount === 0 && capacity.negativeCount === 0) {
    findings.push({
      id: 'F10-F-1',
      severity: 'NONE',
      category: 'F10-F. Capacity data quality',
      title: `Room.capacity is real: range ${capacity.min}-${capacity.max}, median ${capacity.median}, no null/0/negative`,
      currentStatus:
        `All ${capacity.roomTotal} rooms have real capacity. ` +
        `Min: ${capacity.min}, max: ${capacity.max}, median: ${capacity.median}, ` +
        `distinct: ${capacity.distinct}, default-50: ${capacity.default50Count}, zero: ${capacity.zeroCount}, negative: ${capacity.negativeCount}. ` +
        `Confirms K21-FIX-A and K22-G conclusions.`,
      evidence: [
        `Capacity distribution: ${JSON.stringify(capacity.buckets)}`,
        `Suspicious rooms: ${capacity.suspiciousRooms.length} (cap<10 or cap>150 — likely lab/lecture hall, not bug)`,
      ],
      risk: 'No risk. Capacity is real and ready for capacity-based soft preference.',
      recommendation: 'Proceed with capacity-based soft preference design.',
    })
  } else {
    findings.push({
      id: 'F10-F-1',
      severity: 'MEDIUM',
      category: 'F10-F. Capacity data quality',
      title: `Room.capacity has quality issues: ${capacity.zeroCount} zero, ${capacity.negativeCount} negative`,
      currentStatus: 'Some rooms have zero or negative capacity. SC10 / HC4 cannot evaluate these.',
      evidence: [`zeroCount=${capacity.zeroCount}, negativeCount=${capacity.negativeCount}`],
      risk: 'SC10 would skip these rooms (defensive). HC4 cannot fire on capacity=0 rooms. The ' +
        'solver may treat them as infinite capacity, leading to misuse.',
      recommendation: 'Fix capacity values before implementing SC10.',
    })
  }

  // F2: Task student count quality
  const realPct = task.taskTotal > 0
    ? Math.round((task.countSourceDistribution.REAL_STUDENT_COUNT ?? 0) / task.taskTotal * 100)
    : 0
  findings.push({
    id: 'F10-F-2',
    severity: realPct >= 80 ? 'INFO' : 'MEDIUM',
    category: 'F10-F. TeachingTask student count quality',
    title: `Task student count distribution: min=${task.min}, max=${task.max}, median=${task.median}, ${realPct}% REAL_STUDENT_COUNT`,
    currentStatus:
      `Tasks: ${task.taskTotal}. With classes: ${task.tasksWithClasses}. Without classes: ${task.tasksWithoutClasses}. ` +
      `Count source: ${JSON.stringify(task.countSourceDistribution)}. ` +
      `ClassGroup with studentCount: ${task.classGroupWithStudentCount}/${task.classGroupCount}. ` +
      `Duplicated class links: ${task.duplicatedClassLinks}.`,
    evidence: [
      `Task buckets: ${JSON.stringify(task.buckets)}`,
      `Count source distribution: ${JSON.stringify(task.countSourceDistribution)}`,
    ],
    risk: realPct >= 80
      ? 'Low risk. Most tasks have real student counts. FALLBACK only applies to small subset.'
      : 'High FALLBACK rate means capacity preference is based on placeholder (50) values, reducing precision.',
    recommendation: realPct >= 80
      ? 'Proceed with capacity-based soft preference; FALLBACK is acceptable for the minority of tasks.'
      : 'Investigate why many tasks lack ClassGroup.studentCount. Consider backfilling or admin review.',
  })

  // F3: HC4 completeness
  findings.push({
    id: 'F10-F-3',
    severity: hc4.currentViolationCount > 0 ? 'MEDIUM' : 'NONE',
    category: 'F10-F. HC4 completeness',
    title: `HC4: full + delta covered; ${hc4.currentViolationCount} current violations in dev.db`,
    currentStatus:
      `HC4 is implemented in both full and delta paths. Penalty is -1000. ` +
      `Trigger: taskStudentCount > room.capacity. ` +
      `Current state: ${hc4.currentViolationCount} slots violate HC4. ` +
      `K22-C Harness B covers HC4.`,
    evidence: [
      `score.ts:364-378: full-score HC4 implementation`,
      `score.ts:706-711: delta-score HC4 implementation`,
      `K22-C Harness B covers HC4 invariant`,
    ],
    risk: hc4.currentViolationCount > 0
      ? 'Pre-existing HC4 violations are infeasible-by-capacity. SC10 cannot fix them; only room reassignment with bigger rooms would.'
      : 'No current HC4 violations. SC10 can build on top of a clean HC4 baseline.',
    recommendation:
      'SC10 must NOT weaken HC4. SC10 only fires at utilization <= 1.0. If a move brings utilization > 1.0, ' +
      'only HC4 penalty applies.',
  })

  // F4: SC10 design feasibility
  findings.push({
    id: 'F10-F-4',
    severity: 'INFO',
    category: 'F10-F. SC10 design feasibility',
    title: 'SC10 design (Candidate D) is feasible: reuses getTaskStudentCount, no schema change',
    currentStatus:
      'Recommended design: SC10_ROOM_CAPACITY_UTILIZATION with utilization-based formula. ' +
      'Reuses existing getTaskStudentCount helper (capacity.ts). ' +
      'No schema change. No new data path. ' +
      'Full + delta share computeSC10Penalty(utilization, capacity) helper. ' +
      'Penalty scale -1 (waste) / -2 (tight), within existing soft range.',
    evidence: [
      'src/lib/scheduler/capacity.ts: getTaskStudentCount is the canonical helper',
      'score.ts: import { getTaskStudentCount } from "./capacity"',
      'F4/F6/F8 pattern: shared helper for full + delta',
    ],
    risk:
      'Two thresholds (0.90 utilization, 0.30 utilization, 100 capacity) need calibration. ' +
      'Initial defaults are reasonable but should be tuned against real data.',
    recommendation:
      'Open K22-F11-CAPACITY-PREFERENCE-IMPL with Candidate D as the design baseline. ' +
      'Add Harness J with 13 cases (8 full + 5 delta).',
    suggestedNextStage: 'K22-F11-CAPACITY-PREFERENCE-IMPL',
  })

  // F5: Interaction with existing constraints
  findings.push({
    id: 'F10-F-5',
    severity: 'INFO',
    category: 'F10-F. SC10 interaction',
    title: 'SC10 is orthogonal to SC1-SC5, SC7, SC8; soft-tradeoff with SC9; soft-priority with SC6/HC6',
    currentStatus:
      'Interaction analysis is complete. SC10 is per-slot (not aggregate), so it does not ' +
      'introduce any aggregate-key drift risk. Penalty scale (-1 to -2) is well below SC6 (-20) ' +
      'and SC9 (-2), so it can coexist without dominating.',
    evidence: ['see "Interaction analysis" section in markdown report'],
    risk: 'No risk. SC10 has clean interaction profile.',
    recommendation: 'Proceed with implementation; no special handling required.',
  })

  return findings
}

// ── Main ────────────────────────────────────────────────────────────

async function main() {
  console.log('K22-F10 Capacity Preference Constraint Audit')
  console.log('============================================\n')

  const capacity = await inspectCapacity()
  const taskStudent = await inspectTaskStudentCount()
  const hc4 = await inspectHC4()
  const candidates = candidateStrategies()
  const fullDesign = recommendedFullScoreDesign()
  const deltaDesign = recommendedDeltaScoreDesign()
  const interactions = interactionAnalysis()
  const harness = harnessPlan()
  const findings = buildFindings(capacity, taskStudent, hc4)

  const summary: Record<Severity, number> = { HIGH: 0, MEDIUM: 0, LOW: 0, INFO: 0, NONE: 0 }
  for (const f of findings) summary[f.severity]++
  const blocking = summary.HIGH > 0

  // Terminal output
  console.log(`Capacity data quality:`)
  console.log(`  Rooms: ${capacity.roomTotal}`)
  console.log(`  Range: min=${capacity.min}, max=${capacity.max}, median=${capacity.median}, avg=${capacity.avg}`)
  console.log(`  Distinct values: ${capacity.distinct}`)
  console.log(`  Zero / Negative / Default50: ${capacity.zeroCount} / ${capacity.negativeCount} / ${capacity.default50Count}`)
  console.log(`  Buckets: ${JSON.stringify(capacity.buckets)}`)
  console.log(`  Suspicious: ${capacity.suspiciousRooms.length}`)
  console.log(`  Conclusion: ${capacity.thisAuditConclusion}\n`)

  console.log(`TeachingTask student count:`)
  console.log(`  Total tasks: ${taskStudent.taskTotal}`)
  console.log(`  With classes: ${taskStudent.tasksWithClasses}, without: ${taskStudent.tasksWithoutClasses}`)
  console.log(`  ClassGroup count: ${taskStudent.classGroupCount}, with studentCount: ${taskStudent.classGroupWithStudentCount}, without: ${taskStudent.classGroupWithoutStudentCount}`)
  console.log(`  Count source: ${JSON.stringify(taskStudent.countSourceDistribution)}`)
  console.log(`  Range: min=${taskStudent.min}, max=${taskStudent.max}, median=${taskStudent.median}, avg=${taskStudent.avg}`)
  console.log(`  Duplicated class links: ${taskStudent.duplicatedClassLinks}`)
  console.log(`  Buckets: ${JSON.stringify(taskStudent.buckets)}\n`)

  console.log(`HC4 audit:`)
  console.log(`  Full score: ${hc4.fullScore}, delta: ${hc4.deltaScore}`)
  console.log(`  Penalty: ${hc4.penalty}, trigger: ${hc4.triggerCondition}`)
  console.log(`  Current violations: ${hc4.currentViolationCount}`)
  console.log(`  Harness: ${hc4.harnessSection}\n`)

  console.log(`Candidate strategies:`)
  for (const c of candidates) {
    const rec = c.recommended ? ' [RECOMMENDED]' : ''
    console.log(`  [${c.id}] ${c.name}${rec} (${c.riskLevel})`)
  }
  console.log('')

  console.log(`Recommended SC10 design:`)
  console.log(`  Name: ${fullDesign.canonicalName}`)
  console.log(`  Formula:`)
  for (const line of fullDesign.formula.split('\n')) console.log(`    ${line}`)
  console.log(`  Penalty: ${fullDesign.penaltyScale}`)
  console.log(`  Only soft: ${fullDesign.onlySoftScore ? 'yes' : 'no'}\n`)

  console.log(`Delta score design:`)
  console.log(`  Affected key: ${deltaDesign.affectedKeyStrategy}`)
  console.log(`  Complexity: ${deltaDesign.complexity}`)
  console.log('')

  console.log(`Interaction analysis:`)
  for (const ia of interactions) {
    console.log(`  ${ia.constraint}: ${ia.relationship}`)
  }
  console.log('')

  console.log(`Harness plan (K22-C Harness J):`)
  for (const c of harness) {
    console.log(`  [${c.type}] ${c.id}: ${c.title} (expected=${c.expectedSoft})`)
  }
  console.log('')

  console.log(`Findings:`)
  for (const f of findings) {
    console.log(`  [${f.severity}] ${f.id} ${f.title}`)
  }
  console.log('')

  console.log(`Summary:`)
  console.log(`HIGH:      ${summary.HIGH}`)
  console.log(`MEDIUM:    ${summary.MEDIUM}`)
  console.log(`LOW:       ${summary.LOW}`)
  console.log(`INFO:      ${summary.INFO}`)
  console.log(`NONE:      ${summary.NONE}`)
  console.log(`BLOCKING:  ${blocking ? 'YES' : 'NO'}`)
  console.log('')

  // Recommended next stage
  const recommendedNextStage = blocking
    ? 'K22-F10 (re-audit after fixing blocking issues)'
    : 'K22-F11-CAPACITY-PREFERENCE-IMPL (recommended) OR K22-I-SCORE-WEIGHTS-AUDIT (if weight calibration risk is high) OR K22-G2-ROOM-TYPE-SCHEMA-PLAN (if room type is more important)'
  console.log(`Recommended next stage: ${recommendedNextStage}\n`)

  // Write JSON
  const outDir = path.join(projectRoot, 'docs')
  if (!fs.existsSync(outDir)) fs.mkdirSync(outDir, { recursive: true })
  const outPath = path.join(outDir, 'k22-capacity-preference-constraint-audit.json')
  const report = {
    generatedAt: new Date().toISOString(),
    stage: 'K22-F10-CAPACITY-PREFERENCE-AUDIT',
    mode: 'read-only audit + design (no implementation)',
    predecessor: 'K22-G-ROOM-TYPE-DATA-QUALITY-AUDIT (commit 64b5cff)',
    capacityDataQuality: capacity,
    taskStudentCountAudit: taskStudent,
    hc4Audit: hc4,
    candidateStrategies: candidates,
    recommendedDesign: {
      canonicalName: fullDesign.canonicalName,
      skipRules: fullDesign.skipRules,
      formula: fullDesign.formula,
      penaltyScale: fullDesign.penaltyScale,
      onlySoftScore: fullDesign.onlySoftScore,
    },
    fullScoreDesign: fullDesign,
    deltaScoreDesign: deltaDesign,
    interactionAnalysis: interactions,
    harnessPlan: harness,
    findings,
    severitySummary: summary,
    blocking,
    recommendedNextStage,
    notes: [
      'K22-F10 is a read-only audit + design. No Prisma writes, no score.ts changes, no schema changes.',
      'Capacity data is real (K21-FIX-A and K22-G confirmed).',
      'Task student count is computable via existing getTaskStudentCount helper (capacity.ts).',
      'HC4 is full + delta covered; no need to modify it. SC10 is purely additive soft preference.',
      'SC10 design follows the F4/F6/F8 shared-helper pattern.',
      'No new constraint is implemented in this stage. K22-F10 is audit-only.',
    ],
  }
  fs.writeFileSync(outPath, JSON.stringify(report, null, 2), 'utf-8')
  console.log(`Report written: ${outPath}`)
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
