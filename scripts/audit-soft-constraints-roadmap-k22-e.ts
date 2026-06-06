/**
 * K22-E Soft Constraints Roadmap Audit
 *
 * Read-only audit. Evaluates which soft constraints are already covered by
 * the current scoring system, identifies data/scaffolding gaps for missing
 * ones, and produces a prioritized implementation roadmap.
 *
 * Strong constraints:
 *   - NO Prisma writes.
 *   - NO score.ts modifications.
 *   - NO solver modifications.
 *   - NO schema / migration / API / frontend / importer / parser / RBAC changes.
 *
 * Output:
 *   - Terminal summary
 *   - docs/k22-soft-constraints-roadmap-audit.json
 */

import * as fs from 'node:fs'
import * as path from 'node:path'
import { PrismaClient } from '@prisma/client'

const projectRoot = path.resolve(__dirname, '..')

// Use a dedicated client for read-only inspection. We do not perform any writes.
const prisma = new PrismaClient()

// ── Types ────────────────────────────────────────────────────────────

type Priority = 'P0' | 'P1' | 'P2'
type Complexity = 'LOW' | 'MEDIUM' | 'HIGH'
type Risk = 'LOW' | 'MEDIUM' | 'HIGH'
type Severity = 'HIGH' | 'MEDIUM' | 'LOW' | 'INFO' | 'NONE'

interface SoftConstraintSpec {
  id: string
  name: string
  category: string
  coveredNow: boolean
  requiredData: string[]
  dataAvailableNow: boolean
  schemaChangeNeeded: boolean
  implementationComplexity: Complexity
  regressionRisk: Risk
  priority: Priority
  recommendedStage: string
  rationale: string
  notes: string
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

// ── Current soft constraints ────────────────────────────────────────

function currentSoftConstraints(): SoftConstraintSpec[] {
  return [
    {
      id: 'SC1',
      name: '跨楼栋连续课 (cross-building back-to-back)',
      category: 'teacher / class / building',
      coveredNow: true,
      requiredData: ['Room.building (or inferBuilding)', 'TeachingTask.teacherId', 'TeachingTaskClass.classGroupId', 'ScheduleSlot.dayOfWeek/slotIndex/roomId'],
      dataAvailableNow: true,
      schemaChangeNeeded: false,
      implementationComplexity: 'MEDIUM',
      regressionRisk: 'LOW',
      priority: 'P0',
      recommendedStage: 'DONE (K22-D)',
      rationale: 'Already implemented in full + delta. K22-A HIGH risk resolved in K22-D.',
      notes: 'K22-C A.2 case is regression guard.',
    },
    {
      id: 'SC2',
      name: '同天多节 (same-day multi-session)',
      category: 'task distribution',
      coveredNow: true,
      requiredData: ['TeachingTask.id', 'ScheduleSlot.dayOfWeek'],
      dataAvailableNow: true,
      schemaChangeNeeded: false,
      implementationComplexity: 'LOW',
      regressionRisk: 'LOW',
      priority: 'P0',
      recommendedStage: 'DONE',
      rationale: 'Already implemented. penalty = -10 per extra slot on same day.',
      notes: '',
    },
    {
      id: 'SC3',
      name: '极端时间 (extreme time slot)',
      category: 'time preference',
      coveredNow: true,
      requiredData: ['ScheduleSlot.slotIndex'],
      dataAvailableNow: true,
      schemaChangeNeeded: false,
      implementationComplexity: 'LOW',
      regressionRisk: 'LOW',
      priority: 'P0',
      recommendedStage: 'DONE',
      rationale: 'Already implemented. penalty = -1 for slotIndex >= 5 (evening).',
      notes: '',
    },
    {
      id: 'SC4',
      name: '跨校区通勤 (cross-campus commute)',
      category: 'task distribution',
      coveredNow: true,
      requiredData: ['Room.building', 'TeachingTask.id', 'ScheduleSlot'],
      dataAvailableNow: true,
      schemaChangeNeeded: false,
      implementationComplexity: 'LOW',
      regressionRisk: 'LOW',
      priority: 'P0',
      recommendedStage: 'DONE',
      rationale: 'Already implemented. penalty = -5 per cross-campus consecutive slot pair.',
      notes: 'LOW: SC1 vs SC4 building inference inconsistency still present.',
    },
    {
      id: 'MIN_PERT',
      name: '最小扰动惩罚 (minimum perturbation)',
      category: 'solver stability',
      coveredNow: true,
      requiredData: ['ScheduleState.originalAssignments', 'ScheduleSlot'],
      dataAvailableNow: true,
      schemaChangeNeeded: false,
      implementationComplexity: 'LOW',
      regressionRisk: 'LOW',
      priority: 'P0',
      recommendedStage: 'DONE',
      rationale: 'Already implemented. penalty = -2 per moved slot.',
      notes: '',
    },
  ]
}

// ── Missing soft constraints ────────────────────────────────────────

function missingSoftConstraints(): SoftConstraintSpec[] {
  return [
    {
      id: 'NEW-SC-01',
      name: '教师工作日均衡 (teacher weekday balance)',
      category: 'teacher distribution',
      coveredNow: false,
      requiredData: ['Teacher.id', 'ScheduleSlot.dayOfWeek via TeachingTask.teacherId'],
      dataAvailableNow: true,
      schemaChangeNeeded: false,
      implementationComplexity: 'LOW',
      regressionRisk: 'LOW',
      priority: 'P0',
      recommendedStage: 'K22-F',
      rationale:
        'Aggregates per-teacher slot counts by dayOfWeek; penalize over-concentration on a single day ' +
        '(e.g. teacher has 4 slots on Monday and 0 on Wednesday). All data already in ScheduleSlot + TeachingTask. ' +
        'Pure O(n) computation. Can be implemented in score.ts calculateScoreWithDetails + calculateDeltaScore. ' +
        'Reusable by K22-C harness. Does not change hardScore.',
      notes:
        'Concrete formula: per teacher, compute variance of per-day slot count. Penalty = -k * variance (small k, e.g. -1 per std deviation). ' +
        'No new fields needed. Should also be K22-C harness-regression-tested.',
    },
    {
      id: 'NEW-SC-02',
      name: '班级空洞减少 (class gap reduction)',
      category: 'class distribution',
      coveredNow: false,
      requiredData: ['ClassGroup.id', 'ScheduleSlot via TeachingTaskClass.classGroupId', 'dayOfWeek/slotIndex'],
      dataAvailableNow: true,
      schemaChangeNeeded: false,
      implementationComplexity: 'LOW',
      regressionRisk: 'LOW',
      priority: 'P0',
      recommendedStage: 'K22-F',
      rationale:
        'Per class, count "gaps" in their week schedule: a day where the class has slots at idx 1 and 3 but not 2 ' +
        'is a 1-slot gap. Penalize each gap (small penalty, e.g. -2). All data available via existing ' +
        'ScheduleSlot + TeachingTaskClass. No schema change. O(n) per class. Reusable K22-C harness.',
      notes:
        'Variant: "half-day consistency" — penalize classes whose slots spread across >2 distinct (day, morning/afternoon) blocks per day. ' +
        'Spec recommendation: combine with K22-F.',
    },
    {
      id: 'NEW-SC-03',
      name: '教室稳定性 (room stability)',
      category: 'room distribution',
      coveredNow: false,
      requiredData: ['TeachingTask.id', 'ScheduleSlot.roomId'],
      dataAvailableNow: true,
      schemaChangeNeeded: false,
      implementationComplexity: 'LOW',
      regressionRisk: 'LOW',
      priority: 'P0',
      recommendedStage: 'K22-F',
      rationale:
        'Per teachingTask, count distinct roomId across slots. Penalize per extra room (e.g. -3 per extra room). ' +
        'Reuses ScheduleSlot only. No schema change. O(n) per task. Reusable K22-C harness.',
      notes:
        'Spec says "体验优化" but commonly requested by 教务处 (academic affairs). Low risk: only affects softScore, no hardScore change.',
    },
    {
      id: 'NEW-SC-04',
      name: '实训课 / 机房课匹配 room type (lab/computer room matching)',
      category: 'room type matching',
      coveredNow: false,
      requiredData: ['Course.name (regex for 实训/实验/机房/上机)', 'Room.type (currently defaults to NORMAL)'],
      dataAvailableNow: false,
      schemaChangeNeeded: true,
      implementationComplexity: 'HIGH',
      regressionRisk: 'MEDIUM',
      priority: 'P1',
      recommendedStage: 'K22-G',
      rationale:
        'Course has no structured type field. Room.type exists in schema but is unused (admin form does not expose it). ' +
        'Implementation requires: (1) extend Course model with `type` (Theory/Practice/Lab) OR Room model with `type` values, ' +
        '(2) backfill from existing Course.name regex (实训|实验|机房|上机), (3) update admin UI, ' +
        '(4) implement matching score. High complexity, medium regression risk (backfill can introduce noise). ' +
        'Spec recommends audit before implementation.',
      notes:
        'Pre-implementation audit: K22-G-SOFT-CONSTRAINT-LAB-MATCHING-AUDIT (data quality assessment, sample check on 123 courses). ' +
        'Only after audit confirms clean data should implementation proceed.',
    },
    {
      id: 'NEW-SC-05',
      name: '大班优先大教室 (large class priority for big room)',
      category: 'capacity utilization',
      coveredNow: false,
      requiredData: ['ClassGroup.studentCount', 'Room.capacity'],
      dataAvailableNow: true,
      schemaChangeNeeded: false,
      implementationComplexity: 'MEDIUM',
      regressionRisk: 'LOW',
      priority: 'P1',
      recommendedStage: 'K22-G',
      rationale:
        'For each slot, if studentCount > 0.7 * room.capacity (over-allocated), penalize (-2 per slot). ' +
        'If studentCount < 0.4 * room.capacity (under-allocated), lighter penalty (-1). ' +
        'Pure score logic, no schema. Reuses getTaskStudentCount + Room.capacity. ' +
        'MEDIUM complexity: requires careful definition of "over/under" thresholds.',
      notes:
        'Edge: studentCount may be null (fallback 50). Spec recommends wide range test with K22-C harness.',
    },
    {
      id: 'NEW-SC-06',
      name: '同班连续课少切换 (same-class consecutive switch reduction)',
      category: 'class distribution',
      coveredNow: false,
      requiredData: ['ClassGroup.id', 'ScheduleSlot via TeachingTaskClass', 'ScheduleSlot.roomId'],
      dataAvailableNow: true,
      schemaChangeNeeded: false,
      implementationComplexity: 'MEDIUM',
      regressionRisk: 'LOW',
      priority: 'P1',
      recommendedStage: 'K22-G',
      rationale:
        'Per class, for two consecutive slots on the same day (idx diff = 1), penalize room/teacher switch ' +
        '(-3 per switch). Similar to SC1 but class-centric. Reuses existing data. ' +
        'No schema. Some overlap with SC1/SC4; should be careful to avoid double-counting.',
      notes:
        'Should coordinate with SC1 (teacher/class cross-building) and SC4 (task cross-campus). ' +
        'Spec recommends implementation after SC1/SC4 fix to avoid regression.',
    },
    {
      id: 'NEW-SC-07',
      name: '教师半天集中 (teacher half-day concentration)',
      category: 'teacher distribution',
      coveredNow: false,
      requiredData: ['Teacher.id', 'ScheduleSlot.dayOfWeek/slotIndex via TeachingTask.teacherId'],
      dataAvailableNow: true,
      schemaChangeNeeded: false,
      implementationComplexity: 'LOW',
      regressionRisk: 'LOW',
      priority: 'P1',
      recommendedStage: 'K22-G',
      rationale:
        'Per teacher, if their slots are spread across both AM (idx 1-2) and PM (idx 3-4) and evening (idx 5-6), ' +
        'penalize. Bonus: cluster all teacher slots into 1-2 contiguous half-days per day (-5 reward via negative penalty). ' +
        'Reuses ScheduleSlot. No schema.',
      notes:
        'Variant: maximize teacher idle half-days. Could conflict with NEW-SC-01 (weekday balance) if not careful. ' +
        'Spec recommends K22-G to keep both stable.',
    },
    {
      id: 'NEW-SC-08',
      name: '教师午休 / 晚课偏好 (teacher lunch / evening preference)',
      category: 'teacher preference',
      coveredNow: false,
      requiredData: ['Teacher preference table (NOT YET MODELED)'],
      dataAvailableNow: false,
      schemaChangeNeeded: true,
      implementationComplexity: 'HIGH',
      regressionRisk: 'HIGH',
      priority: 'P2',
      recommendedStage: 'K22-H',
      rationale:
        'Requires TeacherPreference model (teacherId, dayOfWeek, slotIndex, preferenceWeight) — schema migration. ' +
        'High regression risk: changing teacher schedules based on unverified preference data can cause unexpected moves. ' +
        'Spec recommends schema-planning audit first, then data quality check, then implementation.',
      notes:
        'K22-H-SOFT-CONSTRAINT-TEACHER-PREFERENCE-PLAN: plan schema, design weight format, plan data import flow. ' +
        'No implementation until K22-I (weights roadmap) supports dynamic preference weights.',
    },
    {
      id: 'NEW-SC-09',
      name: '周一早课 / 周五晚课偏好 (Monday morning / Friday evening preference)',
      category: 'campus-wide preference',
      coveredNow: false,
      requiredData: ['campus-wide preference config (NOT MODELED)'],
      dataAvailableNow: false,
      schemaChangeNeeded: true,
      implementationComplexity: 'MEDIUM',
      regressionRisk: 'MEDIUM',
      priority: 'P2',
      recommendedStage: 'K22-H',
      rationale:
        'Requires global preference config (e.g. SchedulingConfig.preferences JSON). ' +
        'Different colleges have different cultures. High coupling with K22-SCORE-WEIGHTS-ROADMAP. ' +
        'Spec recommends deferring until weights are configurable.',
      notes:
        'P2: defer until K22-SCORE-WEIGHTS-ROADMAP completes.',
    },
    {
      id: 'NEW-SC-10',
      name: '行政班固定教室偏好 (class home room preference)',
      category: 'class distribution',
      coveredNow: false,
      requiredData: ['ClassGroup.homeRoom (NOT MODELED)'],
      dataAvailableNow: false,
      schemaChangeNeeded: true,
      implementationComplexity: 'MEDIUM',
      regressionRisk: 'MEDIUM',
      priority: 'P2',
      recommendedStage: 'K22-H',
      rationale:
        'Requires ClassGroup.homeRoomId field (FK to Room). Schema migration + admin UI. ' +
        'Penalties: distance from home room (-3 per off-home). Medium complexity. ' +
        'Spec recommends schema planning first to avoid wasted work.',
      notes:
        'Some 教务处 request this. Defer to K22-H schema planning.',
    },
  ]
}

// ── Data readiness matrix ───────────────────────────────────────────

interface DataReadinessRow {
  constraintId: string
  constraintName: string
  requiredFields: string[]
  fieldsAvailable: string[]
  fieldsMissing: string[]
  readyForImpl: boolean
  notes: string
}

function buildDataReadinessMatrix(missing: SoftConstraintSpec[]): DataReadinessRow[] {
  return missing.map((c) => {
    const fieldsAvailable: string[] = []
    const fieldsMissing: string[] = []
    for (const f of c.requiredData) {
      // Heuristic: "NOT MODELED" in requiredData => missing
      if (f.includes('NOT MODELED') || f.includes('NOT YET MODELED')) {
        fieldsMissing.push(f)
      } else {
        fieldsAvailable.push(f)
      }
    }
    return {
      constraintId: c.id,
      constraintName: c.name,
      requiredFields: c.requiredData,
      fieldsAvailable,
      fieldsMissing,
      readyForImpl: c.dataAvailableNow,
      notes: c.notes,
    }
  })
}

// ── Schema dependency matrix ────────────────────────────────────────

interface SchemaDependencyRow {
  constraintId: string
  constraintName: string
  requiredSchemaChange: string
  severity: Severity
  estimatedMigrationCost: 'TRIVIAL' | 'LOW' | 'MEDIUM' | 'HIGH'
  notes: string
}

function buildSchemaDependencyMatrix(missing: SoftConstraintSpec[]): SchemaDependencyRow[] {
  const rows: SchemaDependencyRow[] = []
  for (const c of missing) {
    if (!c.schemaChangeNeeded) continue
    let migrationCost: SchemaDependencyRow['estimatedMigrationCost'] = 'LOW'
    let requiredSchemaChange = 'unspecified'
    if (c.id === 'NEW-SC-04') {
      migrationCost = 'MEDIUM'
      requiredSchemaChange = 'Add Course.type enum (Theory/Practice/Lab) OR Room.type non-default values; update admin UI form; backfill from existing Course.name regex'
    } else if (c.id === 'NEW-SC-08') {
      migrationCost = 'HIGH'
      requiredSchemaChange = 'Add TeacherPreference model (teacherId, dayOfWeek, slotIndex, weight); admin UI; import flow'
    } else if (c.id === 'NEW-SC-09') {
      migrationCost = 'LOW'
      requiredSchemaChange = 'Add SchedulingConfig.preferences JSON column (Monday morning, Friday evening, etc.)'
    } else if (c.id === 'NEW-SC-10') {
      migrationCost = 'LOW'
      requiredSchemaChange = 'Add ClassGroup.homeRoomId Int? (FK to Room); update admin UI form'
    }
    rows.push({
      constraintId: c.id,
      constraintName: c.name,
      requiredSchemaChange,
      severity: 'MEDIUM',
      estimatedMigrationCost: migrationCost,
      notes: c.notes,
    })
  }
  return rows
}

// ── Priority roadmap ────────────────────────────────────────────────

interface PriorityRoadmapStage {
  stage: string
  scope: string
  excludes: string[]
  rationale: string
}

function buildPriorityRoadmap(): PriorityRoadmapStage[] {
  return [
    {
      stage: 'K22-F-SOFT-CONSTRAINT-IMPLEMENTATION-1',
      scope: 'Implement 3 P0 soft constraints: NEW-SC-01 (teacher weekday balance), NEW-SC-02 (class gap reduction), NEW-SC-03 (room stability). All use existing data (no schema change). Extend score.ts with SC5/SC6/SC7. Add 3 cases to K22-C regression harness. Update K22-C verify summary.',
      excludes: 'P1/P2 constraints. Schema changes. Solver algorithm changes. UI weight editor.',
      rationale: 'P0 constraints have data available, LOW complexity, LOW risk. Highest impact-to-cost ratio. Each is independently testable. K22-C regression harness already in place for SC delta testing.',
    },
    {
      stage: 'K22-G-SOFT-CONSTRAINT-IMPLEMENTATION-2',
      scope: 'Implement 4 P1 soft constraints: NEW-SC-04 (lab matching, after K22-G audit), NEW-SC-05 (large class priority), NEW-SC-06 (same-class consecutive switch reduction), NEW-SC-07 (teacher half-day concentration). NEW-SC-04 requires pre-implementation data audit (K22-G-SOFT-CONSTRAINT-LAB-MATCHING-AUDIT). The other 3 use existing data.',
      excludes: 'Schema migrations. Teacher preference (K22-H).',
      rationale: 'P1 constraints deliver more value but require more care. NEW-SC-04 needs data audit first because Room.type / Course.type are currently unstructured.',
    },
    {
      stage: 'K22-H-SOFT-CONSTRAINT-SCHEMA-PLAN',
      scope: 'Plan schema migrations for 3 P2 soft constraints: NEW-SC-08 (teacher preference), NEW-SC-09 (campus-wide preference), NEW-SC-10 (class home room). Output: migration plan, data backfill strategy, admin UI changes, weight config plan. NO implementation, just planning.',
      excludes: 'Implementation. HardWeights/SoftWeights (K22-SCORE-WEIGHTS-ROADMAP).',
      rationale: 'P2 constraints need schema + admin UI work. Spec recommends planning first, then implementing in K22-I+.',
    },
    {
      stage: 'K22-I-SOFT-WEIGHTS-PRESETS-ROADMAP',
      scope: 'Design dynamic hardWeights/softWeights per SchedulingConfig. Plan presets (default 排课偏好, 工科偏好, 文科偏好, 临考期偏好). Coordinate with K22-SCORE-WEIGHTS-ROADMAP. NO UI implementation, just API/schema plan.',
      excludes: 'UI weight editor. Soft constraint implementation.',
      rationale: 'Once 5+ soft constraints are implemented, weights configuration becomes the next natural step. Defer until K22-F/G soft constraints are mature.',
    },
  ]
}

// ── Findings ─────────────────────────────────────────────────────────

function buildFindings(missing: SoftConstraintSpec[]): Finding[] {
  const findings: Finding[] = []

  // Rule A: P0 constraints are ready for implementation
  const p0Ready = missing.filter((c) => c.priority === 'P0' && c.dataAvailableNow)
  findings.push({
    id: 'K22-E-A-1',
    severity: 'MEDIUM',
    category: 'A. P0 soft constraints ready for implementation',
    title: `${p0Ready.length} P0 soft constraints (NEW-SC-01/02/03) have data and are LOW complexity`,
    currentStatus:
      `教师工作日均衡 (NEW-SC-01), 班级空洞减少 (NEW-SC-02), 教室稳定性 (NEW-SC-03) — ` +
      `all 3 have data available, no schema change, LOW implementation complexity, LOW regression risk. ` +
      `Should be the next implementation stage (K22-F).`,
    evidence: p0Ready.map((c) => `${c.id} ${c.name}: dataAvailable=${c.dataAvailableNow}, schema=${c.schemaChangeNeeded}, complexity=${c.implementationComplexity}, risk=${c.regressionRisk}`),
    risk:
      '不实现 P0 constraints 会持续影响排课质量。教师过载同一天 (NEW-SC-01 缺失) 直接影响教师体验。' +
      '班级空洞 (NEW-SC-02 缺失) 让学生一天中穿插空闲，影响上课节奏。' +
      '教室不稳定 (NEW-SC-03 缺失) 增加师生找教室成本。',
    recommendation: 'K22-F-SOFT-CONSTRAINT-IMPLEMENTATION-1 实施 3 个 P0 constraints，复用 K22-C regression harness 做回归。',
    suggestedNextStage: 'K22-F-SOFT-CONSTRAINT-IMPLEMENTATION-1',
  })

  // Rule B: P1 lab matching needs audit first
  const labMatching = missing.find((c) => c.id === 'NEW-SC-04')
  if (labMatching) {
    findings.push({
      id: 'K22-E-B-1',
      severity: 'MEDIUM',
      category: 'B. P1 lab matching requires data quality audit',
      title: 'NEW-SC-04 实训课匹配需要先做数据质量审计',
      currentStatus:
        'Course 模型没有结构化 type 字段（只有 name 自由文本）。Room.type 字段在 schema 中但 admin form 不暴露，当前所有 room 都是 NORMAL。' +
        'Python parser 内部有 实训/实验/机房 正则检测（scripts/parse_cell.py），但未持久化到 Course.type 字段。' +
        '实施前需先 audit 123 个 Course 数据，确认正则识别准确率。',
      evidence: [
        'prisma/schema.prisma Course model: 无 type 字段',
        'prisma/schema.prisma Room.type: 默认 "NORMAL"，admin form 不暴露',
        'src/lib/admin-db/config.ts getFormFields("room"): 返回 [name, building, capacity]，无 type',
        'scripts/parse_cell.py: 检测 实训/实验/机房/上机 正则但只用于房间匹配，不写入 Course.type',
      ],
      risk:
        '不先 audit 直接实施会引入大量 noise：基于不准确的 type 分类会让 solver 错误地把 普通课 推到 实训室 (capacity 浪费) ' +
        '或把 实训课 推到 普通教室 (硬件不支持)。',
      recommendation: 'K22-G-SOFT-CONSTRAINT-LAB-MATCHING-AUDIT：先用 Python 正则对 123 个 Course.name 做分类统计，' +
        '输出 (theory/practice/lab) 分布和样本，由 教务处 确认准确率后再实施。',
      suggestedNextStage: 'K22-G-SOFT-CONSTRAINT-LAB-MATCHING-AUDIT',
    })
  }

  // Rule C: P2 constraints need schema
  const p2 = missing.filter((c) => c.priority === 'P2')
  if (p2.length > 0) {
    findings.push({
      id: 'K22-E-C-1',
      severity: 'INFO',
      category: 'C. P2 constraints need schema planning',
      title: `${p2.length} P2 soft constraints (NEW-SC-08/09/10) require schema migration`,
      currentStatus:
        '教师偏好 (NEW-SC-08), 校园级偏好 (NEW-SC-09), 班级固定教室 (NEW-SC-10) — ' +
        '都需要 schema 扩展。spec 推荐 K22-H 先做 schema planning，K22-I+ 再实施。',
      evidence: p2.map((c) => `${c.id} ${c.name}: schemaChange=${c.schemaChangeNeeded}, complexity=${c.implementationComplexity}`),
      risk: '不先做 schema planning 直接实施会导致 migration 反复，影响其他模块。',
      recommendation: 'K22-H-SOFT-CONSTRAINT-SCHEMA-PLAN：规划 3 个 schema 扩展，输出 migration plan, data backfill strategy, admin UI changes。',
      suggestedNextStage: 'K22-H-SOFT-CONSTRAINT-SCHEMA-PLAN',
    })
  }

  // Rule D: SC1/SC4 building inference inconsistency remains LOW
  findings.push({
    id: 'K22-E-D-1',
    severity: 'LOW',
    category: 'D. Building inference inconsistency (carried over)',
    title: 'SC1 uses getBuilding() fallback, SC4 only uses Room.building — inconsistency remains LOW',
    currentStatus:
      'K22-A 记录的 LOW finding (K22-A-E-3) 仍未解决。SC1 通过 getBuilding() 优先用 room.building 否则 inferBuilding(room.name)，' +
      'SC4 仅检查 room.building 字段。两者对 "building" 的判断逻辑不一致。' +
      '本阶段 (K22-E) 不修该 LOW，因为其不影响正确性 (SC4 触发时 SC1 也必触发，反之不然)。',
    evidence: [
      'score.ts SC1 block: getBuilding(pRoom) + getBuilding(qRoom)',
      'score.ts SC4 block: pRoom.building / qRoom.building (no fallback)',
    ],
    risk: '若 Room.building 为 null 但 room.name 包含楼栋信息，SC1 触发 SC4 不触发。语义不同：SC4 是同 task 跨校区，SC1 是教师/班级跨楼栋。',
    recommendation: '未来可统一 getBuilding() helper 提取。当前不构成 bug，defer 到 soft constraint 重构时一起处理。',
  })

  // Rule E: Room.type field exists but is unused
  findings.push({
    id: 'K22-E-E-1',
    severity: 'INFO',
    category: 'E. Room.type field underutilized',
    title: 'Room.type 字段在 schema 但 admin UI 不暴露',
    currentStatus:
      'Room model 有 type 字段 (默认 NORMAL)，但 admin form (src/lib/admin-db/config.ts) 不暴露该字段。' +
      '当前 53 个 Room 全部 NORMAL。Room.type 仅在 src/lib/rooms/capacity.ts:113 被读取但不参与逻辑。',
    evidence: [
      'prisma/schema.prisma Room.type: String @default("NORMAL")',
      'src/lib/admin-db/config.ts getFormFields("room"): [name, building, capacity] — 不含 type',
      'src/lib/rooms/capacity.ts:113: type: room.type (passes through to EligibleRoom but no logic uses it)',
    ],
    risk: 'K22-G 实施 NEW-SC-04 前必须先暴露 Room.type，否则无法分类。',
    recommendation: 'K22-G-SOFT-CONSTRAINT-LAB-MATCHING-AUDIT 阶段同时审计 Room.type 字段，准备 admin form 扩展。',
    suggestedNextStage: 'K22-G-SOFT-CONSTRAINT-LAB-MATCHING-AUDIT',
  })

  // Rule F: Penalty constants still hardcoded
  findings.push({
    id: 'K22-E-F-1',
    severity: 'MEDIUM',
    category: 'F. Penalty constants hardcoded (carried over)',
    title: 'Penalty constants 仍硬编码 — K22-SCORE-WEIGHTS-ROADMAP 范围',
    currentStatus:
      'K22-A-C-1 MEDIUM finding 仍未解决。所有 penalty (HC=-1000, SC1=-5, SC2=-10, SC3=-1, SC4=-5, MIN_PERT=-2) 硬编码在 score.ts 顶部。' +
      '本阶段 (K22-E) 不解决该 MEDIUM，归属 K22-SCORE-WEIGHTS-ROADMAP (K22-weights-roadmap)。',
    evidence: [
      'src/lib/scheduler/score.ts:16-21: HARD_PENALTY, SOFT_SC1-SC4, SOFT_MINIMUM_PERTURBATION',
      'prisma/schema.prisma SchedulingConfig: 无 hardWeights/softWeights 字段',
    ],
    risk: '不实现 dynamic weights 会限制 K22-F/G 实施的 soft constraints 调优。',
    recommendation: 'K22-SCORE-WEIGHTS-ROADMAP (不在 K22-E 范围): score.ts refactor 接收 dynamic weights。',
  })

  return findings
}

// ── DB inspection (read-only) ───────────────────────────────────────

interface DbSummary {
  roomTypeDistribution: Record<string, number>
  courseNameSample: { id: number; name: string }[]
  classGroupCount: number
  teacherCount: number
  roomCount: number
  courseCount: number
  scheduleSlotCount: number
  teachingTaskCount: number
  notes: string
}

async function readDbSummary(): Promise<DbSummary> {
  const summary: DbSummary = {
    roomTypeDistribution: {},
    courseNameSample: [],
    classGroupCount: 0,
    teacherCount: 0,
    roomCount: 0,
    courseCount: 0,
    scheduleSlotCount: 0,
    teachingTaskCount: 0,
    notes: '',
  }
  try {
    const [rooms, courses, classGroups, teachers, slots, tasks] = await Promise.all([
      prisma.room.findMany({ select: { id: true, name: true, type: true } }),
      prisma.course.findMany({ select: { id: true, name: true }, take: 10 }),
      prisma.classGroup.count(),
      prisma.teacher.count(),
      prisma.scheduleSlot.count(),
      prisma.teachingTask.count(),
    ])
    summary.roomCount = rooms.length
    summary.classGroupCount = classGroups
    summary.teacherCount = teachers
    summary.scheduleSlotCount = slots
    summary.teachingTaskCount = tasks
    summary.courseCount = await prisma.course.count()
    summary.courseNameSample = courses

    const typeCounts: Record<string, number> = {}
    for (const r of rooms) {
      typeCounts[r.type] = (typeCounts[r.type] ?? 0) + 1
    }
    summary.roomTypeDistribution = typeCounts
    summary.notes = `Read-only inspection at ${new Date().toISOString()}.`
  } catch (e) {
    summary.notes = `DB inspection skipped: ${(e as Error).message}`
  } finally {
    await prisma.$disconnect()
  }
  return summary
}

// ── Main ────────────────────────────────────────────────────────────

async function main() {
  console.log('K22-E Soft Constraints Roadmap Audit')
  console.log('====================================\n')

  const current = currentSoftConstraints()
  const missing = missingSoftConstraints()
  const findings = buildFindings(missing)
  const dataReadiness = buildDataReadinessMatrix(missing)
  const schemaDeps = buildSchemaDependencyMatrix(missing)
  const priorityRoadmap = buildPriorityRoadmap()

  const dbSummary = await readDbSummary()

  // Summary
  const summary: Record<Severity, number> = { HIGH: 0, MEDIUM: 0, LOW: 0, INFO: 0, NONE: 0 }
  for (const f of findings) summary[f.severity]++
  const blocking = summary.HIGH > 0

  const p0Count = missing.filter((c) => c.priority === 'P0').length
  const p1Count = missing.filter((c) => c.priority === 'P1').length
  const p2Count = missing.filter((c) => c.priority === 'P2').length

  // Terminal output
  console.log('Summary:')
  console.log(`HIGH:      ${summary.HIGH}`)
  console.log(`MEDIUM:    ${summary.MEDIUM}`)
  console.log(`LOW:       ${summary.LOW}`)
  console.log(`INFO:      ${summary.INFO}`)
  console.log(`NONE:      ${summary.NONE}`)
  console.log(`BLOCKING:  ${blocking ? 'YES' : 'NO'}`)
  console.log('')
  console.log(`P0:        ${p0Count}`)
  console.log(`P1:        ${p1Count}`)
  console.log(`P2:        ${p2Count}`)
  console.log('')

  console.log('Current soft constraints (covered):')
  for (const c of current) {
    console.log(`  [✓] ${c.id} ${c.name} (${c.priority}, ${c.implementationComplexity})`)
  }
  console.log('')

  console.log('Missing soft constraints (by priority):')
  for (const c of missing) {
    const dataMarker = c.dataAvailableNow ? '[data ✓]' : '[data ✗]'
    const schemaMarker = c.schemaChangeNeeded ? '[schema ✗]' : '[schema ✓]'
    console.log(`  [${c.priority}] ${c.id} ${c.name} (${c.implementationComplexity}/${c.regressionRisk}) ${dataMarker} ${schemaMarker}`)
  }
  console.log('')

  console.log('Findings:')
  for (const f of findings) {
    console.log(`  [${f.severity}] ${f.id} ${f.title}`)
  }
  console.log('')

  // Determine recommended next stage
  const recommendedNextStage = 'K22-F-SOFT-CONSTRAINT-IMPLEMENTATION-1'
  console.log(`Recommended next stage: ${recommendedNextStage}`)
  console.log('  (3 P0 soft constraints ready, no schema change, LOW complexity)')
  console.log('')

  // DB summary
  console.log('DB summary (read-only):')
  console.log(`  ClassGroup: ${dbSummary.classGroupCount}`)
  console.log(`  Teacher:    ${dbSummary.teacherCount}`)
  console.log(`  Course:     ${dbSummary.courseCount}`)
  console.log(`  Room:       ${dbSummary.roomCount}`)
  console.log(`  ScheduleSlot:    ${dbSummary.scheduleSlotCount}`)
  console.log(`  TeachingTask:    ${dbSummary.teachingTaskCount}`)
  console.log(`  Room.type distribution: ${JSON.stringify(dbSummary.roomTypeDistribution)}`)
  console.log('')

  // Write JSON
  const outDir = path.join(projectRoot, 'docs')
  if (!fs.existsSync(outDir)) fs.mkdirSync(outDir, { recursive: true })
  const outPath = path.join(outDir, 'k22-soft-constraints-roadmap-audit.json')
  const report = {
    generatedAt: new Date().toISOString(),
    phase: 'K22-E-SOFT-CONSTRAINTS-ROADMAP-AUDIT',
    mode: 'read-only audit',
    summary: {
      totalFindings: findings.length,
      severity: summary,
      blocking,
      priorityCounts: { P0: p0Count, P1: p1Count, P2: p2Count },
    },
    currentSoftConstraints: current,
    missingSoftConstraints: missing,
    dataReadinessMatrix: dataReadiness,
    schemaDependencyMatrix: schemaDeps,
    priorityRoadmap,
    findings,
    dbSummary,
    recommendedNextStage,
    reasonsForRecommendation: [
      '3 P0 soft constraints (NEW-SC-01/02/03) have data available now',
      'No schema change required for P0',
      'LOW implementation complexity and LOW regression risk for P0',
      'Reusable K22-C regression harness (Harness A pattern)',
      'Does not change hardScore; does not affect solver feasibility',
    ],
    notes: [
      'K22-E is a read-only audit. No Prisma writes, no score.ts changes, no schema changes.',
      'K22-A HIGH risk (SC1 delta missing) was resolved in K22-D; K22-E focuses on the 7 missing soft constraints identified in K22-A-E-4.',
      'Room.type is a schema field but the admin form does not expose it; current 53 rooms are all NORMAL. This blocks NEW-SC-04 (lab matching) until K22-G audit.',
    ],
  }
  fs.writeFileSync(outPath, JSON.stringify(report, null, 2), 'utf-8')
  console.log(`Report written: ${outPath}`)
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
