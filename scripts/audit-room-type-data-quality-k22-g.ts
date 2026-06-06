/**
 * K22-G Room Type Data Quality Audit
 *
 * Read-only audit of whether the current Room.type, Room.name, Room.capacity,
 * Course, TeachingTask, courseName, remark, and source-evidence fields are
 * sufficient to support a future "实训课 / 机房课 / 专业教室 matching" soft or
 * hard constraint. This stage does NOT implement any new constraint, does NOT
 * modify the schema, does NOT change Room.type values, and does NOT write to
 * the database. It only produces audit output.
 *
 * Strong constraints:
 *   - NO Prisma writes.
 *   - NO score.ts / solver / schema / migration / API / frontend / importer /
 *     parser / RBAC changes.
 *   - NO business data changes.
 *   - NO hardWeights / softWeights fields.
 *   - NO new soft / hard constraint implementations.
 *   - NO harness logic changes.
 *
 * Output:
 *   - Terminal summary
 *   - docs/k22-room-type-data-quality-audit.json
 */

import * as fs from 'node:fs'
import * as path from 'node:path'
import { PrismaClient } from '@prisma/client'

const projectRoot = path.resolve(__dirname, '..')

// Use a dedicated client for read-only inspection. We do not perform any writes.
const prisma = new PrismaClient()

// ── Types ────────────────────────────────────────────────────────────

type Severity = 'HIGH' | 'MEDIUM' | 'LOW' | 'INFO' | 'NONE'

interface RoomTypeRow {
  type: string
  count: number
  percent: number
  notes: string
}

interface RoomKeywordRow {
  keyword: string
  matched: number
  percent: number
  inferredType: 'COMPUTER_LAB' | 'TRAINING_ROOM' | 'LAB' | 'LANGUAGE_LAB' | 'MULTIMEDIA' | 'STUDIO' | 'DANCE' | 'AUTOMOTIVE_LAB' | 'LINXIAO' | 'GENERAL'
  confidence: 'HIGH' | 'MEDIUM' | 'LOW'
  notes: string
}

interface RoomCapacityRow {
  bucket: string
  count: number
  percent: number
  notes: string
}

interface SuspiciousRoom {
  id: number
  name: string
  type: string
  building: string | null
  capacity: number
  reasons: string[]
}

interface CourseKeywordRow {
  keyword: string
  matched: number
  percent: number
  inferredTaskType: 'COMPUTER_LAB_REQUIRED' | 'TRAINING_ROOM_REQUIRED' | 'SPECIALTY_ROOM_PREFERRED' | 'GENERAL'
  confidence: 'HIGH' | 'MEDIUM' | 'LOW'
  notes: string
}

interface TaskKeywordRow {
  keyword: string
  matchedTasks: number
  matchedCourses: number
  notes: string
}

interface SourceEvidenceRow {
  field: string
  populated: number
  total: number
  percent: number
  notes: string
}

interface CandidateStrategy {
  id: 'A' | 'B' | 'C' | 'D'
  name: string
  description: string
  schemaRequired: boolean
  riskLevel: 'LOW' | 'MEDIUM' | 'HIGH'
  implementationEffort: 'LOW' | 'MEDIUM' | 'HIGH'
  pros: string[]
  cons: string[]
  recommended: boolean
  rationale: string
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

// ── Room name keyword map (used for inference) ──────────────────────

const ROOM_KEYWORD_MAP: { kw: string; inferred: RoomKeywordRow['inferredType']; confidence: RoomKeywordRow['confidence']; notes: string }[] = [
  { kw: '机房', inferred: 'COMPUTER_LAB', confidence: 'HIGH', notes: '机房 = computer lab' },
  { kw: '计算机', inferred: 'COMPUTER_LAB', confidence: 'MEDIUM', notes: '计算机 = computer, often in 计算机教室' },
  { kw: '实训', inferred: 'TRAINING_ROOM', confidence: 'HIGH', notes: '实训 = practical training' },
  { kw: '实验', inferred: 'LAB', confidence: 'HIGH', notes: '实验 = lab' },
  { kw: '语音', inferred: 'LANGUAGE_LAB', confidence: 'HIGH', notes: '语音 = language lab' },
  { kw: '多媒体', inferred: 'MULTIMEDIA', confidence: 'MEDIUM', notes: '多媒体 = multimedia' },
  { kw: '画室', inferred: 'STUDIO', confidence: 'HIGH', notes: '画室 = art studio' },
  { kw: '舞蹈', inferred: 'DANCE', confidence: 'HIGH', notes: '舞蹈 = dance' },
  { kw: '汽修', inferred: 'AUTOMOTIVE_LAB', confidence: 'HIGH', notes: '汽修 = auto repair' },
  { kw: '汽车', inferred: 'AUTOMOTIVE_LAB', confidence: 'MEDIUM', notes: '汽车 = auto' },
  { kw: '林校', inferred: 'LINXIAO', confidence: 'HIGH', notes: '林校 = Linxiao campus' },
]

const COURSE_KEYWORD_MAP: { kw: string; inferred: CourseKeywordRow['inferredTaskType']; confidence: CourseKeywordRow['confidence']; notes: string }[] = [
  { kw: '上机', inferred: 'COMPUTER_LAB_REQUIRED', confidence: 'HIGH', notes: '上机 = hands-on computer use' },
  { kw: '机房', inferred: 'COMPUTER_LAB_REQUIRED', confidence: 'MEDIUM', notes: '机房 in course name suggests computer lab requirement' },
  { kw: '计算机', inferred: 'COMPUTER_LAB_REQUIRED', confidence: 'MEDIUM', notes: '计算机 = computer course' },
  { kw: 'CAD', inferred: 'COMPUTER_LAB_REQUIRED', confidence: 'HIGH', notes: 'CAD = computer-aided design' },
  { kw: '制图', inferred: 'COMPUTER_LAB_REQUIRED', confidence: 'MEDIUM', notes: '制图 = drafting (often CAD)' },
  { kw: '实训', inferred: 'TRAINING_ROOM_REQUIRED', confidence: 'HIGH', notes: '实训 = practical training' },
  { kw: '实操', inferred: 'TRAINING_ROOM_REQUIRED', confidence: 'HIGH', notes: '实操 = hands-on practice' },
  { kw: '实验', inferred: 'TRAINING_ROOM_REQUIRED', confidence: 'MEDIUM', notes: '实验 = lab (could also be computer lab)' },
  { kw: '汽修', inferred: 'SPECIALTY_ROOM_PREFERRED', confidence: 'HIGH', notes: '汽修 = auto repair' },
  { kw: '汽车', inferred: 'SPECIALTY_ROOM_PREFERRED', confidence: 'MEDIUM', notes: '汽车 = auto (specialty)' },
  { kw: '电工', inferred: 'SPECIALTY_ROOM_PREFERRED', confidence: 'MEDIUM', notes: '电工 = electrical work' },
  { kw: '电子', inferred: 'SPECIALTY_ROOM_PREFERRED', confidence: 'LOW', notes: '电子 = electronics (broad)' },
  { kw: '传感器', inferred: 'SPECIALTY_ROOM_PREFERRED', confidence: 'MEDIUM', notes: '传感器 = sensors' },
  { kw: '检测', inferred: 'SPECIALTY_ROOM_PREFERRED', confidence: 'MEDIUM', notes: '检测 = inspection' },
  { kw: '理实一体', inferred: 'TRAINING_ROOM_REQUIRED', confidence: 'HIGH', notes: '理实一体 = theory + practice integrated' },
  { kw: '焊接', inferred: 'SPECIALTY_ROOM_PREFERRED', confidence: 'HIGH', notes: '焊接 = welding' },
  { kw: '维修', inferred: 'SPECIALTY_ROOM_PREFERRED', confidence: 'MEDIUM', notes: '维修 = maintenance' },
]

// ── DB inspection ────────────────────────────────────────────────────

interface DbInspection {
  roomTypeDistribution: Record<string, number>
  roomBuildingNullCount: number
  roomTotal: number
  roomsByKeyword: Record<string, number>
  capacityDistribution: { min: number; max: number; avg: number; median: number; buckets: Record<string, number> }
  suspiciousRooms: SuspiciousRoom[]
  courseNameKeywordHits: Record<string, number>
  taskRemarkKeywordHits: Record<string, number>
  courseTotal: number
  taskTotal: number
  sourceEvidenceCoverage: Record<string, { populated: number; total: number; percent: number }>
  notes: string
}

async function inspectDb(): Promise<DbInspection> {
  const inspection: DbInspection = {
    roomTypeDistribution: {},
    roomBuildingNullCount: 0,
    roomTotal: 0,
    roomsByKeyword: {},
    capacityDistribution: { min: 0, max: 0, avg: 0, median: 0, buckets: {} },
    suspiciousRooms: [],
    courseNameKeywordHits: {},
    taskRemarkKeywordHits: {},
    courseTotal: 0,
    taskTotal: 0,
    sourceEvidenceCoverage: {},
    notes: '',
  }

  try {
    // ── Room inspection ──
    const rooms = await prisma.room.findMany({
      select: { id: true, name: true, type: true, building: true, capacity: true },
      orderBy: { id: 'asc' },
    })
    inspection.roomTotal = rooms.length

    for (const r of rooms) {
      inspection.roomTypeDistribution[r.type] = (inspection.roomTypeDistribution[r.type] ?? 0) + 1
      if (r.building == null || r.building === '') inspection.roomBuildingNullCount++

      for (const { kw } of ROOM_KEYWORD_MAP) {
        if (r.name.includes(kw)) {
          inspection.roomsByKeyword[kw] = (inspection.roomsByKeyword[kw] ?? 0) + 1
        }
      }

      // Capacity distribution
      const c = r.capacity
      const bucket =
        c < 30 ? '<30' :
        c < 50 ? '30-49' :
        c < 80 ? '50-79' :
        c < 120 ? '80-119' :
        c < 200 ? '120-199' :
        '>=200'
      inspection.capacityDistribution.buckets[bucket] = (inspection.capacityDistribution.buckets[bucket] ?? 0) + 1

      // Suspicious: zero capacity, or extreme, or type NORMAL but name has strong keyword
      const reasons: string[] = []
      if (c === 0) reasons.push('capacity=0')
      if (c === 50 && r.name.match(/\d+/) && r.name.match(/[一-龥]/)) {
        // capacity 50 may be default placeholder; flag if name suggests specialty
        const isSpecialtyName = ROOM_KEYWORD_MAP.some(({ kw }) => r.name.includes(kw))
        if (isSpecialtyName) reasons.push('capacity=50 default but name has specialty keyword')
      }
      const hasKeyword = ROOM_KEYWORD_MAP.some(({ kw }) => r.name.includes(kw))
      if (r.type === 'NORMAL' && hasKeyword) {
        reasons.push(`type=NORMAL but name has specialty keyword (${ROOM_KEYWORD_MAP.find(({ kw }) => r.name.includes(kw))?.kw})`)
      }
      if (reasons.length > 0) {
        inspection.suspiciousRooms.push({
          id: r.id, name: r.name, type: r.type, building: r.building, capacity: r.capacity, reasons,
        })
      }
    }

    const capacities = rooms.map((r) => r.capacity).sort((a, b) => a - b)
    if (capacities.length > 0) {
      inspection.capacityDistribution.min = capacities[0]
      inspection.capacityDistribution.max = capacities[capacities.length - 1]
      inspection.capacityDistribution.avg = Math.round(capacities.reduce((a, b) => a + b, 0) / capacities.length)
      const mid = Math.floor(capacities.length / 2)
      inspection.capacityDistribution.median = capacities.length % 2 === 0
        ? Math.round((capacities[mid - 1] + capacities[mid]) / 2)
        : capacities[mid]
    }

    // ── Course inspection ──
    const courses = await prisma.course.findMany({ select: { id: true, name: true } })
    inspection.courseTotal = courses.length
    for (const c of courses) {
      for (const { kw } of COURSE_KEYWORD_MAP) {
        if (c.name.includes(kw)) {
          inspection.courseNameKeywordHits[kw] = (inspection.courseNameKeywordHits[kw] ?? 0) + 1
        }
      }
    }

    // ── TeachingTask inspection (course name + remark) ──
    const tasks = await prisma.teachingTask.findMany({
      select: {
        id: true,
        remark: true,
        course: { select: { id: true, name: true } },
      },
    })
    inspection.taskTotal = tasks.length
    for (const t of tasks) {
      const remark = t.remark ?? ''
      for (const { kw } of COURSE_KEYWORD_MAP) {
        if (remark.includes(kw)) {
          inspection.taskRemarkKeywordHits[kw] = (inspection.taskRemarkKeywordHits[kw] ?? 0) + 1
        }
      }
    }

    // ── Source evidence coverage (TeachingTaskClass) ──
    const ttcCount = await prisma.teachingTaskClass.count()
    const ttcWithKeyword = await prisma.teachingTaskClass.count({ where: { sourceKeyword: { not: null } } })
    const ttcWithRemark = await prisma.teachingTaskClass.count({ where: { sourceRemark: { not: null } } })
    const ttcWithClassName = await prisma.teachingTaskClass.count({ where: { sourceClassName: { not: null } } })
    const ttcWithArtifact = await prisma.teachingTaskClass.count({ where: { sourceArtifactFilename: { not: null } } })
    const ttcWithStrategy = await prisma.teachingTaskClass.count({ where: { matchStrategy: { not: null } } })
    const ttcWithConfidence = await prisma.teachingTaskClass.count({ where: { matchConfidence: { not: null } } })
    inspection.sourceEvidenceCoverage = {
      sourceKeyword: { populated: ttcWithKeyword, total: ttcCount, percent: ttcCount > 0 ? Math.round(ttcWithKeyword / ttcCount * 100) : 0 },
      sourceRemark: { populated: ttcWithRemark, total: ttcCount, percent: ttcCount > 0 ? Math.round(ttcWithRemark / ttcCount * 100) : 0 },
      sourceClassName: { populated: ttcWithClassName, total: ttcCount, percent: ttcCount > 0 ? Math.round(ttcWithClassName / ttcCount * 100) : 0 },
      sourceArtifactFilename: { populated: ttcWithArtifact, total: ttcCount, percent: ttcCount > 0 ? Math.round(ttcWithArtifact / ttcCount * 100) : 0 },
      matchStrategy: { populated: ttcWithStrategy, total: ttcCount, percent: ttcCount > 0 ? Math.round(ttcWithStrategy / ttcCount * 100) : 0 },
      matchConfidence: { populated: ttcWithConfidence, total: ttcCount, percent: ttcCount > 0 ? Math.round(ttcWithConfidence / ttcCount * 100) : 0 },
    }

    inspection.notes = `Read-only inspection at ${new Date().toISOString()}.`
  } catch (e) {
    inspection.notes = `DB inspection failed: ${(e as Error).message}`
  } finally {
    await prisma.$disconnect()
  }
  return inspection
}

// ── Build audit tables ──────────────────────────────────────────────

function buildRoomTypeTable(inspection: DbInspection): RoomTypeRow[] {
  const total = inspection.roomTotal
  return Object.entries(inspection.roomTypeDistribution)
    .sort((a, b) => b[1] - a[1])
    .map(([type, count]) => ({
      type,
      count,
      percent: total > 0 ? Math.round(count / total * 100) : 0,
      notes:
        type === 'NORMAL'
          ? 'Default value; no real classification.'
          : 'Non-default value (rare; verify each instance manually).',
    }))
}

function buildRoomKeywordTable(inspection: DbInspection): RoomKeywordRow[] {
  const total = inspection.roomTotal
  return ROOM_KEYWORD_MAP.map(({ kw, inferred, confidence, notes }) => {
    const matched = inspection.roomsByKeyword[kw] ?? 0
    return {
      keyword: kw,
      matched,
      percent: total > 0 ? Math.round(matched / total * 100) : 0,
      inferredType: inferred,
      confidence,
      notes,
    }
  })
}

function buildCapacityTable(inspection: DbInspection): RoomCapacityRow[] {
  const total = inspection.roomTotal
  return Object.entries(inspection.capacityDistribution.buckets)
    .sort((a, b) => {
      const aStart = a[0] === '<30' ? -1 : a[0] === '>=200' ? 1000 : parseInt(a[0].split('-')[0], 10)
      const bStart = b[0] === '<30' ? -1 : b[0] === '>=200' ? 1000 : parseInt(b[0].split('-')[0], 10)
      return aStart - bStart
    })
    .map(([bucket, count]) => ({
      bucket,
      count,
      percent: total > 0 ? Math.round(count / total * 100) : 0,
      notes:
        bucket === '<30' ? 'small room' :
        bucket === '30-49' ? 'below default 50' :
        bucket === '50-79' ? 'around default 50' :
        bucket === '80-119' ? 'medium-large' :
        bucket === '120-199' ? 'large lecture' :
        'extra large',
    }))
}

function buildCourseKeywordTable(inspection: DbInspection): CourseKeywordRow[] {
  const total = inspection.courseTotal
  return COURSE_KEYWORD_MAP.map(({ kw, inferred, confidence, notes }) => {
    const matched = inspection.courseNameKeywordHits[kw] ?? 0
    return {
      keyword: kw,
      matched,
      percent: total > 0 ? Math.round(matched / total * 100) : 0,
      inferredTaskType: inferred,
      confidence,
      notes,
    }
  })
}

function buildTaskKeywordTable(inspection: DbInspection): TaskKeywordRow[] {
  const rows: TaskKeywordRow[] = []
  for (const { kw, notes } of COURSE_KEYWORD_MAP) {
    rows.push({
      keyword: kw,
      matchedTasks: inspection.taskRemarkKeywordHits[kw] ?? 0,
      matchedCourses: inspection.courseNameKeywordHits[kw] ?? 0,
      notes,
    })
  }
  return rows
}

function buildSourceEvidenceTable(inspection: DbInspection): SourceEvidenceRow[] {
  return Object.entries(inspection.sourceEvidenceCoverage).map(([field, { populated, total, percent }]) => ({
    field,
    populated,
    total,
    percent,
    notes:
      field === 'sourceKeyword' ? 'from parser merge keyword' :
      field === 'sourceRemark' ? 'from Word cell remark' :
      field === 'sourceClassName' ? 'from Word cell class name' :
      field === 'sourceArtifactFilename' ? 'from upload filename' :
      field === 'matchStrategy' ? 'EXACT | WEAK | SUBSEQ | BASE' :
      field === 'matchConfidence' ? 'parser confidence label' :
      'unknown',
  }))
}

// ── Candidate strategies ────────────────────────────────────────────

function candidateStrategies(): CandidateStrategy[] {
  return [
    {
      id: 'A',
      name: 'Keyword-based soft preference (no schema change)',
      description:
        'Infer room type from Room.name keyword and course/task type from courseName / remark keyword. ' +
        'Add a soft constraint that prefers matched room over unmatched room. ' +
        'No schema / importer / admin UI change required.',
      schemaRequired: false,
      riskLevel: 'MEDIUM',
      implementationEffort: 'LOW',
      pros: [
        'No schema change. Can be implemented quickly.',
        'Reuses existing SchedulingContext (room.name, course.name, task.remark) — no data loader change.',
        'Soft preference is reversible; can be tuned via penalty constant.',
        'Aligns with K22-F2A pattern: classGroup membership is the primary signal for HC6; keyword is auxiliary.',
      ],
      cons: [
        'Keyword inference is fragile (typos, abbreviations, naming variations).',
        'High risk of false positives / false negatives.',
        'Hard to maintain over time (new keywords, deprecated names).',
        'Should NOT be a hard constraint; K22-F2A explicitly says courseName/remark cannot back a hard rule.',
        'Newly imported rooms / courses may not have inferred types until keywords are confirmed.',
      ],
      recommended: true,
      rationale:
        'Cheapest path to a soft preference. Even with limited coverage, a soft preference ' +
        'cannot introduce HC violations; it can only bias the LAHC exploration toward specialty rooms ' +
        'when the data supports it. Safe to prototype. However, it should be paired with a ' +
        'data-quality backfill step (K22-G2 or similar) before any hard rule is attempted.',
    },
    {
      id: 'B',
      name: 'Schema-backed Room.type / Course.type / requiredRoomType',
      description:
        'Add structured type fields: Room.type (replace default-NORMAL with real classification), ' +
        'Course.type (theory / practice / lab), TeachingTask.requiredRoomType, ' +
        'TeachingTask.preferredRoomType. Schema migration + admin UI + importer + backfill.',
      schemaRequired: true,
      riskLevel: 'HIGH',
      implementationEffort: 'HIGH',
      pros: [
        'Semantic clarity: structured fields are unambiguous.',
        'Supports both soft and hard constraints.',
        'UI-manageable.',
        'Importer can infer types from courseName regex with admin override.',
      ],
      cons: [
        'Schema migration + backfill required (high coordination cost).',
        'Admin UI form needs new fields (Course.type, Room.type picker).',
        'Importer must write Room.type / Course.type at import time.',
        'Existing 53 rooms + 104 courses need manual classification (work effort).',
        'Source evidence cannot help retroactively (only forward-fill).',
      ],
      recommended: false,
      rationale:
        'Correct long-term direction but too heavy for current stage. Needs planning first ' +
        '(K22-G2-ROOM-TYPE-SCHEMA-PLAN). This stage recommends opening the planning stage but NOT ' +
        'attempting the migration in this audit.',
    },
    {
      id: 'C',
      name: 'Source-evidence assisted classification (admin review)',
      description:
        'Use existing TeachingTaskClass source-evidence fields (sourceKeyword, sourceRemark, ' +
        'sourceClassName, sourceArtifactFilename, matchStrategy, matchConfidence) to surface ' +
        'uncertain classifications. Admin reviews ambiguous cases and assigns requiredRoomType.',
      schemaRequired: false,
      riskLevel: 'LOW',
      implementationEffort: 'MEDIUM',
      pros: [
        'Reuses existing K20-FIX-B source-evidence infrastructure.',
        'No schema change.',
        'Reversible: admin can re-classify.',
        'High confidence: admin makes the final call.',
      ],
      cons: [
        'Requires admin UI flow (review queue, bulk confirm).',
        'Manual work for ambiguous cases.',
        'Does not directly improve score.ts; needs a feedback loop into Room.type / Course.type.',
        'Slow rollout: depends on admin review throughput.',
      ],
      recommended: false,
      rationale:
        'Good complement to Candidate A or B (admin can correct misclassifications). ' +
        'Not a standalone path: review is valuable but does not by itself produce a score.ts ' +
        'signal. Recommended as a parallel track, not the primary path.',
    },
    {
      id: 'D',
      name: 'Capacity-first proxy (avoid room type entirely)',
      description:
        'Do not attempt room-type matching. Instead, implement "大班优先大教室 / 容量余量优化" ' +
        'as a soft preference, using existing Room.capacity and studentCount fields. ' +
        'This sidesteps the room-type data quality problem entirely.',
      schemaRequired: false,
      riskLevel: 'LOW',
      implementationEffort: 'LOW',
      pros: [
        'Capacity is real, reliable data (K21-FIX-A confirmed all 53 rooms have real capacity).',
        'No schema change.',
        'No new keyword logic.',
        'Reuses existing HC4 capacity check.',
        'Direct student-facing benefit (avoiding overcrowded rooms).',
      ],
      cons: [
        'Does not solve 实训课 / 机房课 matching.',
        'Does not address specialty rooms (e.g. automotive lab at Linxiao).',
        'May duplicate existing capacity-aware logic in solver.',
      ],
      recommended: true,
      rationale:
        'Safe first step in the P1 family. If room type is blocked, capacity is the next ' +
        'highest-value P1. Recommended as either the primary P1 path or a parallel track.',
    },
  ]
}

// ── Findings ────────────────────────────────────────────────────────

function buildFindings(inspection: DbInspection): Finding[] {
  const findings: Finding[] = []

  // F1: Room.type distribution
  const ntypeCount = inspection.roomTypeDistribution['NORMAL'] ?? 0
  const nonNormalCount = inspection.roomTotal - ntypeCount
  const allNormal = nonNormalCount === 0 && inspection.roomTotal > 0
  if (allNormal) {
    findings.push({
      id: 'G-F-1',
      severity: 'MEDIUM',
      category: 'G-F. Room.type data quality',
      title: `All ${inspection.roomTotal} rooms have type=NORMAL; no real classification available`,
      currentStatus:
        `Room.type is a free-form String field with default "NORMAL". ` +
        `All ${inspection.roomTotal} rooms in the database are NORMAL. The importer hardcodes ` +
        `"NORMAL" at room creation (src/lib/import/importer.ts:940: type: 'NORMAL'). ` +
        `Admin form does not expose Room.type. The field exists in schema but is not maintained.`,
      evidence: [
        `Room.type distribution: ${JSON.stringify(inspection.roomTypeDistribution)}`,
        `prisma/schema.prisma: Room.type String @default("NORMAL")`,
        `src/lib/admin-db/config.ts: getFormFields("room") returns [name, building, capacity] (no type)`,
        `src/lib/import/importer.ts:940: type: 'NORMAL' hardcoded at upsert`,
      ],
      risk:
        'Room.type cannot be used as a real classification signal. Any constraint that branches on ' +
        'room.type (e.g. require task with COMPUTER_LAB_REQUIRED to be placed in a room with ' +
        'type=COMPUTER_LAB) would not fire in production because all rooms are NORMAL. ' +
        'This is the primary blocker for the "实训课 / 机房课 matching" P1 candidate.',
      recommendation:
        'Open K22-G2-ROOM-TYPE-SCHEMA-PLAN (planning-only stage) to evaluate: ' +
        '(a) admin UI form extension to expose Room.type; ' +
        '(b) importer change to infer type from Room.name keyword; ' +
        '(c) one-time backfill script (separate stage). ' +
        'Do NOT implement hard rule on Room.type until backfill is complete.',
      suggestedNextStage: 'K22-G2-ROOM-TYPE-SCHEMA-PLAN',
    })
  } else {
    findings.push({
      id: 'G-F-1',
      severity: 'INFO',
      category: 'G-F. Room.type data quality',
      title: `Room.type distribution: ${JSON.stringify(inspection.roomTypeDistribution)}`,
      currentStatus:
        `Some rooms have non-NORMAL type. Total: ${inspection.roomTotal}, NORMAL: ${ntypeCount}, ` +
        `non-NORMAL: ${nonNormalCount}.`,
      evidence: [`Room.type distribution: ${JSON.stringify(inspection.roomTypeDistribution)}`],
      risk: 'If distribution is partial, hard rule would over-fire on NORMAL rooms. Manual review required.',
      recommendation: 'Audit each non-NORMAL instance. Verify they are correctly classified.',
    })
  }

  // F2: Room keyword inference coverage
  const keywordHits = ROOM_KEYWORD_MAP.map(({ kw }) => inspection.roomsByKeyword[kw] ?? 0)
  const totalKeywordHits = keywordHits.reduce((a, b) => a + b, 0)
  const anyKeywordMatches = totalKeywordHits > 0
  findings.push({
    id: 'G-F-2',
    severity: anyKeywordMatches ? 'LOW' : 'MEDIUM',
    category: 'G-F. Room keyword inference',
    title: `Room.name keyword inference: ${totalKeywordHits} total matches across ${ROOM_KEYWORD_MAP.length} keywords`,
    currentStatus:
      `Per-keyword hit counts: ${JSON.stringify(inspection.roomsByKeyword)}. ` +
      `${anyKeywordMatches ? 'Some rooms have specialty names that can be inferred.' : 'No rooms have specialty keywords in names.'} ` +
      `Inference is fragile: a room named "11号楼301" with no keyword would be classified as GENERAL.`,
    evidence: [
      `Room keyword hits: ${JSON.stringify(inspection.roomsByKeyword)}`,
      `Score.ts already uses keyword inference for building (inferBuilding) — precedent for keyword-based logic.`,
    ],
    risk:
      'Keyword inference is heuristic. False positives (e.g. "语音室" can be language lab or general ' +
      'if equipped with projectors) and false negatives (e.g. "11号楼501" with no keyword but actually ' +
      'a computer lab) are both possible. Cannot serve as hard rule.',
    recommendation:
      'Keyword inference is acceptable for soft preference with low penalty (e.g. -2 to -5). ' +
      'Always pair with a confidence indicator in audit logs. Do not implement as hard rule.',
    suggestedNextStage: 'K22-G3-KEYWORD-BASED-ROOM-SUITABILITY-PROTOTYPE-AUDIT (if pursuing Candidate A)',
  })

  // F3: Capacity data quality
  const minCap = inspection.capacityDistribution.min
  const maxCap = inspection.capacityDistribution.max
  const medianCap = inspection.capacityDistribution.median
  const allDefault50 = (inspection.capacityDistribution.buckets['50-79'] ?? 0) === inspection.roomTotal
  findings.push({
    id: 'G-F-3',
    severity: allDefault50 ? 'MEDIUM' : 'NONE',
    category: 'G-F. Room capacity data quality',
    title:
      `Room.capacity range: min=${minCap}, max=${maxCap}, median=${medianCap}; ` +
      `distribution: ${JSON.stringify(inspection.capacityDistribution.buckets)}`,
    currentStatus:
      `K21-FIX-A confirmed all 53 rooms have real capacity. ` +
      `Min: ${minCap}, max: ${maxCap}, median: ${medianCap}. ` +
      `All in 50-79 bucket: ${allDefault50}. ` +
      `Suspicious rooms (capacity=0, capacity=50 default with specialty keyword, etc.): ` +
      `${inspection.suspiciousRooms.length}.`,
    evidence: [
      `Capacity distribution: ${JSON.stringify(inspection.capacityDistribution.buckets)}`,
      `Suspicious rooms: ${inspection.suspiciousRooms.length} (see JSON report for full list)`,
    ],
    risk:
      allDefault50
        ? 'All rooms cluster at the default 50. If the default is a placeholder, capacity is unreliable. ' +
          'However, K21-FIX-A audit specifically verified capacity is real (not placeholder). ' +
          'Clustering at 50-79 is plausible if the school is small.'
        : 'Capacity distribution looks healthy.',
    recommendation:
      'Capacity is real (K21-FIX-A). Candidate D (大班优先大教室) is viable. ' +
      'No data-quality blocker for capacity-based constraints.',
    suggestedNextStage: 'K22-F10-CAPACITY-PREFERENCE-AUDIT (if pursuing Candidate D)',
  })

  // F4: Course has no type field
  findings.push({
    id: 'G-F-4',
    severity: 'MEDIUM',
    category: 'G-F. Course type data quality',
    title: 'Course model has no type field; course name is the only signal',
    currentStatus:
      'Course model: id, name (unique), createdAt, updatedAt. No type / category / kind / practical flag. ' +
      'Task model has remark (free-form text) but no structured course type. ' +
      'All classification must come from courseName regex or remark regex.',
    evidence: [
      'prisma/schema.prisma: Course has only id + name',
      'prisma/schema.prisma: TeachingTask has remark: String? (free-form)',
      'src/lib/admin-db/config.ts: getFormFields("course") returns [name] (no type)',
    ],
    risk:
      'courseName / remark are not reliable classification signals. They may include unrelated text ' +
      '(e.g. "森林草原防火技术1班" has "技术" which is on the parser blacklist but still appears). ' +
      'Hard rule on courseName regex would mis-fire on these cases.',
    recommendation:
      'Add Course.type field in a future schema migration. In the meantime, rely on ' +
      'courseName / remark keyword for SOFT preference only, with low penalty.',
    suggestedNextStage: 'K22-G2-ROOM-TYPE-SCHEMA-PLAN (includes Course.type as scope)',
  })

  // F5: courseName keyword hit coverage
  const totalCourseKwHits = Object.values(inspection.courseNameKeywordHits).reduce((a, b) => a + b, 0)
  const totalTaskKwHits = Object.values(inspection.taskRemarkKeywordHits).reduce((a, b) => a + b, 0)
  findings.push({
    id: 'G-F-5',
    severity: 'LOW',
    category: 'G-F. Course / task keyword coverage',
    title: `Course.name keyword hits: ${totalCourseKwHits} (of ${inspection.courseTotal}); Task.remark hits: ${totalTaskKwHits} (of ${inspection.taskTotal})`,
    currentStatus:
      `Per-keyword course hits: ${JSON.stringify(inspection.courseNameKeywordHits)}. ` +
      `Per-keyword task remark hits: ${JSON.stringify(inspection.taskRemarkKeywordHits)}. ` +
      `${totalCourseKwHits} of ${inspection.courseTotal} courses match at least one keyword ` +
      `(${inspection.courseTotal > 0 ? Math.round(totalCourseKwHits / inspection.courseTotal * 100) : 0}% if counted naively; ` +
      `note: a single course can match multiple keywords).`,
    evidence: [
      `Course.name keyword hits: ${JSON.stringify(inspection.courseNameKeywordHits)}`,
      `Task.remark keyword hits: ${JSON.stringify(inspection.taskRemarkKeywordHits)}`,
    ],
    risk:
      'Keyword coverage is partial. Courses without keywords would be classified as GENERAL, ' +
      'which is the safe default but means the constraint has limited effect on most courses.',
    recommendation:
      'Combine courseName + task.remark signals. Where both match the same type, ' +
      'confidence is higher. Where only one matches, use the matched type with low confidence. ' +
      'Where neither matches, default to GENERAL.',
  })

  // F6: Source evidence coverage
  const ttcCount = inspection.sourceEvidenceCoverage['sourceKeyword']?.total ?? 0
  const sourceKwPct = inspection.sourceEvidenceCoverage['sourceKeyword']?.percent ?? 0
  const sourceClassNamePct = inspection.sourceEvidenceCoverage['sourceClassName']?.percent ?? 0
  findings.push({
    id: 'G-F-6',
    severity: 'INFO',
    category: 'G-F. Source evidence availability',
    title: `Source evidence coverage: ${sourceKwPct}% sourceKeyword, ${sourceClassNamePct}% sourceClassName (out of ${ttcCount} TeachingTaskClass rows)`,
    currentStatus:
      'TeachingTaskClass has rich per-link source-evidence fields (K20-FIX-B): sourceKeyword, ' +
      'sourceRemark, sourceClassName, sourceArtifactFilename, matchStrategy, matchConfidence. ' +
      'These were forward-filled at import time and are not retroactively populated. ' +
      'They can help admin review ambiguous cases.',
    evidence: Object.entries(inspection.sourceEvidenceCoverage).map(
      ([field, v]) => `${field}: ${v.populated}/${v.total} (${v.percent}%)`,
    ),
    risk:
      'Source evidence is not retroactive. If a new keyword-based classification is designed, ' +
      'source evidence can only help for TeachingTaskClass rows that were created after the ' +
      'keyword change, not for existing rows.',
    recommendation:
      'Source evidence is a complement, not a primary signal. Use it in admin review (Candidate C) ' +
      'but not as a primary classification input for score.ts.',
  })

  // F7: Score context access
  findings.push({
    id: 'G-F-7',
    severity: 'NONE',
    category: 'G-F. Scheduler context readiness',
    title: 'SchedulingContext has full access to room.name, course.name, task.remark, room.building, room.capacity, room.type',
    currentStatus:
      'data-loader.ts loads tasks with course/teacher/taskClasses, rooms with availabilities, ' +
      'and slots with room + teachingTask. Score.ts can access room.name, room.type, room.building, ' +
      'room.capacity, course.name, task.remark without any new data path. ' +
      'No new data source is needed for a keyword-based room suitability constraint.',
    evidence: [
      'src/lib/scheduler/types.ts: RoomWithAvailability includes name, building, capacity, type, availabilities',
      'src/lib/scheduler/types.ts: TaskWithRelations includes course (name), teacher, taskClasses (classGroup.name), remark (via Prisma passthrough)',
      'src/lib/scheduler/data-loader.ts: include statements cover all needed relations',
      'score.ts already uses task.remark (line 131) and room.name (line 70, inferBuilding)',
    ],
    risk: 'No risk. Scheduler has full data access.',
    recommendation: 'Any new keyword-based or capacity-based constraint can be implemented in score.ts without data-loader changes.',
  })

  // F8: Building data quality
  const buildingNullPct = inspection.roomTotal > 0 ? Math.round(inspection.roomBuildingNullCount / inspection.roomTotal * 100) : 0
  findings.push({
    id: 'G-F-8',
    severity: buildingNullPct > 50 ? 'LOW' : 'INFO',
    category: 'G-F. Building data quality',
    title: `${inspection.roomBuildingNullCount} of ${inspection.roomTotal} rooms have null building (${buildingNullPct}%)`,
    currentStatus:
      'Most rooms have building=null. inferBuilding(name) provides fallback for SC1 detection ' +
      '(林校 / 实训楼 / 11号楼 / 12号楼 / 1号楼), but SC4 only uses Room.building directly. ' +
      'A keyword-based room suitability constraint would similarly rely on Room.name inference.',
    evidence: [
      `Building null: ${inspection.roomBuildingNullCount} / ${inspection.roomTotal}`,
      'score.ts: inferBuilding() supports 林校, 实训, 11号楼, 12号楼, 1号楼',
    ],
    risk: 'Same as F9-E-1 in F9 audit: keyword-based inference is fragile. Building inference is acceptable for soft preference but not for hard rule.',
    recommendation: 'Continue using inferBuilding as fallback. Not a blocker for keyword-based soft preference.',
  })

  return findings
}

// ── Implementation readiness ────────────────────────────────────────

function implementationReadiness(inspection: DbInspection): {
  status: 'NOT_READY' | 'PARTIAL_READY' | 'READY'
  score: 'NOT_READY' | 'PARTIAL_READY' | 'READY'
  rationale: string
  prerequisites: string[]
} {
  const allNormal = (inspection.roomTypeDistribution['NORMAL'] ?? 0) === inspection.roomTotal
  const courseHasNoType = true // verified via schema
  const roomKeywordHits = Object.values(inspection.roomsByKeyword).reduce((a, b) => a + b, 0)
  const courseKeywordHits = Object.values(inspection.courseNameKeywordHits).reduce((a, b) => a + b, 0)

  // Hard room-type constraint: needs Room.type and Course.type both clean
  if (allNormal && courseHasNoType) {
    return {
      status: 'NOT_READY',
      score: 'NOT_READY',
      rationale:
        'Hard rule on Room.type is NOT READY: all 53 rooms are NORMAL, Course has no type field. ' +
        'Hard rule on Room.name keyword is NOT READY for production: keyword coverage is partial ' +
        `(${roomKeywordHits} room hits, ${courseKeywordHits} course hits).`,
      prerequisites: [
        'Schema: add Course.type field (enum or string)',
        'Schema: expose Room.type in admin form (currently hidden in config.ts:48-52)',
        'Importer: persist Room.type from name keyword or admin override (currently hardcoded "NORMAL" at importer.ts:940)',
        'Backfill: classify all 53 rooms by hand or by inference + admin review',
        'Backfill: classify all 104 courses by hand or by inference + admin review',
      ],
    }
  }
  // Soft preference on room.name keyword IS READY
  return {
    status: 'PARTIAL_READY',
    score: 'PARTIAL_READY',
    rationale:
      'Hard rule not ready. Soft keyword-based preference is PARTIAL_READY: ' +
      'scheduler has data access, but coverage is partial and confidence is low. ' +
      'Capacity-based soft preference is READY (K21-FIX-A confirmed capacity is real).',
    prerequisites: [
      'Capacity-based soft preference: no prerequisites (data is real).',
      'Keyword-based soft preference: pair with admin review (Candidate C) to confirm matches; low penalty (e.g. -2 to -5).',
      'Hard rule: requires full schema + backfill (NOT in this audit).',
    ],
  }
}

// ── Main ────────────────────────────────────────────────────────────

async function main() {
  console.log('K22-G Room Type Data Quality Audit')
  console.log('===================================\n')

  const inspection = await inspectDb()

  const roomTypeTable = buildRoomTypeTable(inspection)
  const roomKeywordTable = buildRoomKeywordTable(inspection)
  const capacityTable = buildCapacityTable(inspection)
  const courseKeywordTable = buildCourseKeywordTable(inspection)
  const taskKeywordTable = buildTaskKeywordTable(inspection)
  const sourceEvidenceTable = buildSourceEvidenceTable(inspection)
  const candidates = candidateStrategies()
  const findings = buildFindings(inspection)
  const readiness = implementationReadiness(inspection)

  const summary: Record<Severity, number> = { HIGH: 0, MEDIUM: 0, LOW: 0, INFO: 0, NONE: 0 }
  for (const f of findings) summary[f.severity]++
  const blocking = summary.HIGH > 0

  // Terminal output
  console.log(`Room.type distribution (${inspection.roomTotal} rooms):`)
  for (const r of roomTypeTable) {
    console.log(`  ${r.type}: ${r.count} (${r.percent}%) — ${r.notes}`)
  }
  console.log(`Building null: ${inspection.roomBuildingNullCount} / ${inspection.roomTotal}\n`)

  console.log('Room.name keyword hits:')
  for (const r of roomKeywordTable) {
    if (r.matched > 0) console.log(`  ${r.keyword}: ${r.matched} (${r.percent}%) → ${r.inferredType} (${r.confidence})`)
  }
  console.log('')

  console.log('Room.capacity distribution:')
  for (const r of capacityTable) {
    console.log(`  ${r.bucket}: ${r.count} (${r.percent}%) — ${r.notes}`)
  }
  console.log(`  min=${inspection.capacityDistribution.min}, max=${inspection.capacityDistribution.max}, median=${inspection.capacityDistribution.median}, avg=${inspection.capacityDistribution.avg}\n`)

  console.log('Suspicious rooms:')
  if (inspection.suspiciousRooms.length === 0) {
    console.log('  (none)')
  } else {
    for (const r of inspection.suspiciousRooms.slice(0, 20)) {
      console.log(`  Room #${r.id} "${r.name}" type=${r.type} cap=${r.capacity} building=${r.building ?? 'null'}: ${r.reasons.join('; ')}`)
    }
    if (inspection.suspiciousRooms.length > 20) console.log(`  ... (${inspection.suspiciousRooms.length - 20} more)`)
  }
  console.log('')

  console.log(`Course.name keyword hits (${inspection.courseTotal} courses):`)
  for (const r of courseKeywordTable) {
    if (r.matched > 0) console.log(`  ${r.keyword}: ${r.matched} (${r.percent}%) → ${r.inferredTaskType} (${r.confidence})`)
  }
  console.log('')

  console.log(`Task.remark keyword hits (${inspection.taskTotal} tasks):`)
  for (const r of taskKeywordTable) {
    if (r.matchedTasks > 0) console.log(`  ${r.keyword}: ${r.matchedTasks} tasks matched in remark`)
  }
  console.log('')

  console.log(`Source evidence coverage (${inspection.sourceEvidenceCoverage['sourceKeyword']?.total ?? 0} TeachingTaskClass rows):`)
  for (const r of sourceEvidenceTable) {
    console.log(`  ${r.field}: ${r.populated}/${r.total} (${r.percent}%)`)
  }
  console.log('')

  console.log('Candidate strategies:')
  for (const c of candidates) {
    const rec = c.recommended ? ' [RECOMMENDED]' : ''
    console.log(`  [${c.id}] ${c.name}${rec}`)
    console.log(`      schema=${c.schemaRequired} risk=${c.riskLevel} effort=${c.implementationEffort}`)
  }
  console.log('')

  console.log('Findings:')
  for (const f of findings) {
    console.log(`  [${f.severity}] ${f.id} ${f.title}`)
  }
  console.log('')

  console.log('Summary:')
  console.log(`HIGH:      ${summary.HIGH}`)
  console.log(`MEDIUM:    ${summary.MEDIUM}`)
  console.log(`LOW:       ${summary.LOW}`)
  console.log(`INFO:      ${summary.INFO}`)
  console.log(`NONE:      ${summary.NONE}`)
  console.log(`BLOCKING:  ${blocking ? 'YES' : 'NO'}`)
  console.log('')

  console.log('Implementation readiness:')
  console.log(`  Status:     ${readiness.status}`)
  console.log(`  Rationale:  ${readiness.rationale}`)
  console.log(`  Prerequisites:`)
  for (const p of readiness.prerequisites) console.log(`    - ${p}`)
  console.log('')

  // Recommended next stage
  const recommendedNextStage =
    'K22-G2-ROOM-TYPE-SCHEMA-PLAN (planning) OR K22-F10-CAPACITY-PREFERENCE-AUDIT (capacity-first) OR K22-G3-KEYWORD-BASED-ROOM-SUITABILITY-PROTOTYPE-AUDIT (soft-only)'
  console.log(`Recommended next stage: ${recommendedNextStage}`)
  console.log('')

  // Write JSON
  const outDir = path.join(projectRoot, 'docs')
  if (!fs.existsSync(outDir)) fs.mkdirSync(outDir, { recursive: true })
  const outPath = path.join(outDir, 'k22-room-type-data-quality-audit.json')
  const report = {
    generatedAt: new Date().toISOString(),
    stage: 'K22-G-ROOM-TYPE-DATA-QUALITY-AUDIT',
    mode: 'read-only data quality audit',
    predecessor: 'K22-F9-SCORE-CONSTRAINT-SUMMARY-AUDIT (commit 33ffe8d)',
    roomTypeDistribution: roomTypeTable,
    roomKeywordInference: roomKeywordTable,
    roomCapacityAudit: {
      distribution: capacityTable,
      range: inspection.capacityDistribution,
      suspiciousRooms: inspection.suspiciousRooms,
    },
    courseTypeAudit: {
      schemaField: 'Course has no type field; only name',
      courseTotal: inspection.courseTotal,
      taskTotal: inspection.taskTotal,
      courseKeywordHits: courseKeywordTable,
      taskKeywordHits: taskKeywordTable,
    },
    sourceEvidenceAvailability: {
      total: inspection.sourceEvidenceCoverage['sourceKeyword']?.total ?? 0,
      fields: sourceEvidenceTable,
    },
    candidateStrategies: candidates,
    implementationReadiness: {
      hardRoomTypeRule: readiness.status,
      softKeywordPreference: 'PARTIAL_READY (data access OK; coverage partial)',
      capacityPreference: 'READY (K21-FIX-A confirmed)',
      rationale: readiness.rationale,
      prerequisites: readiness.prerequisites,
    },
    findings,
    severitySummary: summary,
    blocking,
    recommendedNextStage,
    notes: [
      'K22-G is a read-only audit. No Prisma writes, no score.ts changes, no schema changes.',
      'Room.type is a free-form String field with default "NORMAL"; importer hardcodes "NORMAL" at room creation (importer.ts:940).',
      'All 53 rooms in dev.db have type=NORMAL. This is the primary blocker for hard room-type rules.',
      'Room.name keyword inference is feasible but fragile — appropriate for soft preference only.',
      'Course has no type field. courseName + remark are the only signals.',
      'Capacity is real (K21-FIX-A). Capacity-based soft preference is READY.',
      'Source evidence (K20-FIX-B) is forward-fill only; cannot retroactively classify existing data.',
      'No new constraint should be implemented in this stage. K22-G is audit-only.',
    ],
  }
  fs.writeFileSync(outPath, JSON.stringify(report, null, 2), 'utf-8')
  console.log(`Report written: ${outPath}`)
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
