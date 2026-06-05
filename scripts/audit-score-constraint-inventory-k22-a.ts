/**
 * K22-A Score Constraint Inventory Audit
 *
 * Read-only inventory of the current scoring system in score.ts.
 * Documents:
 *   - Hard constraints (HC1-HC6)
 *   - Soft constraints (SC1-SC4 + MINIMUM_PERTURBATION)
 *   - Penalty constants (HARD_PENALTY, SOFT_SC1-SC4, SOFT_MINIMUM_PERTURBATION)
 *   - Full score / delta score coverage per constraint
 *   - HardScore / softScore separation
 *   - Data source readiness per constraint
 *   - Immediate risk assessment
 *
 * Strong constraints:
 *   - NO Prisma writes.
 *   - NO score.ts modifications.
 *   - NO solver modifications.
 *   - NO business data changes.
 *
 * Output:
 *   - Terminal summary
 *   - docs/k22-score-constraint-inventory-audit.json
 */

import * as fs from 'node:fs'
import * as path from 'node:path'

const projectRoot = path.resolve(__dirname, '..')

// ── Types ──

type Severity = 'HIGH' | 'MEDIUM' | 'LOW' | 'INFO' | 'NONE'

interface ConstraintInfo {
  id: string
  type: 'HARD' | 'SOFT'
  name: string
  codeName: string
  currentPenalty: number
  triggerCondition: string
  dataSources: string[]
  fullScoreCoverage: boolean
  deltaScoreCoverage: boolean
  configurableNow: boolean
  inventoryRisk: Severity
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

// ── Constraint Inventory ──

function inventoryHardConstraints(): ConstraintInfo[] {
  return [
    {
      id: 'HC1',
      type: 'HARD',
      name: '教室冲突',
      codeName: 'HC1_ROOM_CONFLICT',
      currentPenalty: -1000,
      triggerCondition: '两个 task 在同一 dayOfWeek + slotIndex + roomId，且有周次重叠',
      dataSources: ['ScheduleSlot.roomId', 'Room.id', 'expandWeeks(task.startWeek/endWeek/weekType)'],
      fullScoreCoverage: true,
      deltaScoreCoverage: true,
      configurableNow: false,
      inventoryRisk: 'NONE',
      notes: 'full score 用 O(n²) 成对比较；delta score 用 O(n) 逐 other slot 比较。week overlap 使用 expandWeeks 同一逻辑。',
    },
    {
      id: 'HC2',
      type: 'HARD',
      name: '教师冲突',
      codeName: 'HC2_TEACHER_CONFLICT',
      currentPenalty: -1000,
      triggerCondition: '同一 teacherId 的两个 task 在同一 dayOfWeek + slotIndex（不考虑 roomId，只要时间段重叠即冲突），且有周次重叠',
      dataSources: ['TeachingTask.teacherId', 'expandWeeks(...)'],
      fullScoreCoverage: true,
      deltaScoreCoverage: true,
      configurableNow: false,
      inventoryRisk: 'NONE',
      notes: '教师冲突不关心教室，只要时间段重叠且 teacherId 相同即为冲突。null teacherId 跳过。',
    },
    {
      id: 'HC3',
      type: 'HARD',
      name: '班级冲突',
      codeName: 'HC3_CLASS_CONFLICT',
      currentPenalty: -1000,
      triggerCondition: '同一 classGroupId 的两个 task 在同一 dayOfWeek + slotIndex，且有周次重叠',
      dataSources: ['TeachingTaskClass.classGroupId', 'expandWeeks(...)'],
      fullScoreCoverage: true,
      deltaScoreCoverage: true,
      configurableNow: false,
      inventoryRisk: 'NONE',
      notes: '合班场景：若 task A 和 task B 共享同一 classGroupId（合班），它们不能同时在同一时间段。',
    },
    {
      id: 'HC4',
      type: 'HARD',
      name: '容量超限',
      codeName: 'HC4_CAPACITY',
      currentPenalty: -1000,
      triggerCondition: 'task 关联班级的总学生数 > Room.capacity',
      dataSources: ['ClassGroup.studentCount (REAL_STUDENT_COUNT)', 'Room.capacity', 'FALLBACK_STUDENTS_PER_CLASS=50'],
      fullScoreCoverage: true,
      deltaScoreCoverage: true,
      configurableNow: false,
      inventoryRisk: 'NONE',
      notes: 'getTaskStudentCount: 优先用 ClassGroup.studentCount，缺失时 fallback 到 50。K21-FIX-A 确认所有 53 个 Room 均为真实容量。',
    },
    {
      id: 'HC5',
      type: 'HARD',
      name: '教室不可用',
      codeName: 'HC5_ROOM_UNAVAILABLE',
      currentPenalty: -1000,
      triggerCondition: 'RoomAvailability 中 available=false 且该 slot 被分配到该教室',
      dataSources: ['RoomAvailability(roomId, dayOfWeek, slotIndex, available)'],
      fullScoreCoverage: true,
      deltaScoreCoverage: true,
      configurableNow: false,
      inventoryRisk: 'NONE',
      notes: 'isRoomAvailable 检查：遍历 room.availabilities，若存在 available=false 记录则不可用。默认全部可用。',
    },
    {
      id: 'HC6',
      type: 'HARD',
      name: '锁定课程被移动',
      codeName: 'HC6_LOCKED_SLOT_MOVED',
      currentPenalty: -1000,
      triggerCondition: 'lockedSlotIds 中的 slot 被 solver 移动',
      dataSources: ['SchedulingConfig.lockedSlotIds', 'ScheduleState.originalAssignments'],
      fullScoreCoverage: false,
      deltaScoreCoverage: false,
      configurableNow: false,
      inventoryRisk: 'INFO',
      notes: 'HC6 在 full score 和 delta score 中均有代码骨架（score.ts:192-203），但实际未计分。锁定机制通过 solver 的 lockedSlotIds Set 控制 movability（solver.ts:256），而非 score penalty。注释说明 "HC6 is intentionally not counted in delta scoring"。',
    },
  ]
}

function inventorySoftConstraints(): ConstraintInfo[] {
  return [
    {
      id: 'SC1',
      type: 'SOFT',
      name: '跨楼栋连续课程',
      codeName: 'SC1_CROSS_BUILDING_BACK_TO_BACK',
      currentPenalty: -5,
      triggerCondition: '同一教师或共享班级的两个 task，在同一 day、相邻 slotIndex（差 1），且所在 building 不同',
      dataSources: ['Room.building (优先) 或 inferBuilding(Room.name)', 'TeachingTask.teacherId', 'TeachingTaskClass.classGroupId'],
      fullScoreCoverage: true,
      deltaScoreCoverage: false,
      configurableNow: false,
      inventoryRisk: 'HIGH',
      notes: 'CRITICAL: SC1 在 full score 中检测 "教师+班级" 两个维度，但 delta score 中完全缺失（calculateDeltaScore 没有 SC1 逻辑）。这意味着 delta score 不会对跨楼栋连续课产生任何惩罚，而 full score 会。solver 使用 delta score 决策，可能接受会增加跨楼栋惩罚的 move，因为 delta 里看不到 SC1 惩罚。',
    },
    {
      id: 'SC2',
      type: 'SOFT',
      name: '同天多节',
      codeName: 'SC2_SAME_DAY',
      currentPenalty: -10,
      triggerCondition: '同一 task 在同一天有 >1 个 slot（每多一个 slot 惩罚 -10）',
      dataSources: ['TeachingTask.id', 'ScheduleSlot.dayOfWeek'],
      fullScoreCoverage: true,
      deltaScoreCoverage: true,
      configurableNow: false,
      inventoryRisk: 'NONE',
      notes: 'full score 和 delta score 均覆盖。delta 计算：移走同天 slot 减少惩罚，移到同天增加惩罚。',
    },
    {
      id: 'SC3',
      type: 'SOFT',
      name: '极端时间',
      codeName: 'SC3_EXTREME_TIME_SLOT',
      currentPenalty: -1,
      triggerCondition: 'slotIndex >= 5（第 5 节及以上，即晚上时段）',
      dataSources: ['ScheduleSlot.slotIndex'],
      fullScoreCoverage: true,
      deltaScoreCoverage: true,
      configurableNow: false,
      inventoryRisk: 'NONE',
      notes: 'full score 和 delta score 均覆盖。惩罚值较轻（-1），不构成主要优化驱动力。',
    },
    {
      id: 'SC4',
      type: 'SOFT',
      name: '跨校区通勤',
      codeName: 'SC4_CROSS_CAMPUS',
      currentPenalty: -5,
      triggerCondition: '同一 task 的相邻 slot（同天，slotIndex 差 1），所在 building 不同（需 room.building 字段）',
      dataSources: ['Room.building (必须，不 fallback 到 inferBuilding)', 'TeachingTask.id'],
      fullScoreCoverage: true,
      deltaScoreCoverage: true,
      configurableNow: false,
      inventoryRisk: 'LOW',
      notes: 'full score 和 delta score 均覆盖。但 SC4 依赖 Room.building 字段（不使用 inferBuilding），而 SC1 使用 inferBuilding fallback。若 Room.building 为 null，SC4 不触发，但 SC1 可能触发。两者对 "building" 的判断逻辑不一致。',
    },
    {
      id: 'MIN_PERT',
      type: 'SOFT',
      name: '最小扰动惩罚',
      codeName: 'MINIMUM_PERTURBATION',
      currentPenalty: -2,
      triggerCondition: 'slot 被移动（与 ScheduleState.originalAssignments 不同）',
      dataSources: ['ScheduleState.originalAssignments', 'ScheduleSlot.dayOfWeek/slotIndex/roomId'],
      fullScoreCoverage: true,
      deltaScoreCoverage: true,
      configurableNow: false,
      inventoryRisk: 'NONE',
      notes: 'full score 和 delta score 均覆盖。delta 计算：移回原位消除惩罚，移离原位增加惩罚。',
    },
  ]
}

// ── Findings ──

function buildFindings(
  hardConstraints: ConstraintInfo[],
  softConstraints: ConstraintInfo[],
): Finding[] {
  const findings: Finding[] = []

  // Rule A: Full score / delta score consistency
  {
    const hcFullOnly = hardConstraints.filter(c => c.fullScoreCoverage && !c.deltaScoreCoverage)
    const hcDeltaOnly = hardConstraints.filter(c => !c.fullScoreCoverage && c.deltaScoreCoverage)
    const scFullOnly = softConstraints.filter(c => c.fullScoreCoverage && !c.deltaScoreCoverage)
    const scDeltaOnly = softConstraints.filter(c => !c.fullScoreCoverage && c.deltaScoreCoverage)

    const hcInconsistent = hcFullOnly.length > 0 || hcDeltaOnly.length > 0
    const scInconsistent = scFullOnly.length > 0 || scDeltaOnly.length > 0

    findings.push({
      id: 'K22-A-A-1',
      severity: scInconsistent ? 'HIGH' : hcInconsistent ? 'INFO' : 'NONE',
      category: 'A. Full / delta consistency',
      title: `Full score / delta score coverage: HC ${hcInconsistent ? '有不一致' : '一致'}, SC ${scInconsistent ? '有不一致' : '一致'}`,
      currentStatus: `HC full-only: ${hcFullOnly.map(c => c.id).join(', ') || 'none'}. HC delta-only: ${hcDeltaOnly.map(c => c.id).join(', ') || 'none'}. SC full-only: ${scFullOnly.map(c => c.id).join(', ') || 'none'}. SC delta-only: ${scDeltaOnly.map(c => c.id).join(', ') || 'none'}.`,
      evidence: [
        `HC1 full=${hardConstraints[0].fullScoreCoverage} delta=${hardConstraints[0].deltaScoreCoverage}`,
        `HC2 full=${hardConstraints[1].fullScoreCoverage} delta=${hardConstraints[1].deltaScoreCoverage}`,
        `HC3 full=${hardConstraints[2].fullScoreCoverage} delta=${hardConstraints[2].deltaScoreCoverage}`,
        `HC4 full=${hardConstraints[3].fullScoreCoverage} delta=${hardConstraints[3].deltaScoreCoverage}`,
        `HC5 full=${hardConstraints[4].fullScoreCoverage} delta=${hardConstraints[4].deltaScoreCoverage}`,
        `HC6 full=${hardConstraints[5].fullScoreCoverage} delta=${hardConstraints[5].deltaScoreCoverage} (intentional — solver movability controls)`,
        `SC1 full=${softConstraints[0].fullScoreCoverage} delta=${softConstraints[0].deltaScoreCoverage}`,
        `SC2 full=${softConstraints[1].fullScoreCoverage} delta=${softConstraints[1].deltaScoreCoverage}`,
        `SC3 full=${softConstraints[2].fullScoreCoverage} delta=${softConstraints[2].deltaScoreCoverage}`,
        `SC4 full=${softConstraints[3].fullScoreCoverage} delta=${softConstraints[3].deltaScoreCoverage}`,
        `MIN_PERT full=${softConstraints[4].fullScoreCoverage} delta=${softConstraints[4].deltaScoreCoverage}`,
      ],
      risk: scInconsistent
        ? `SC1 缺少 delta score 覆盖：solver 使用 delta score 决策，不会对跨楼栋连续课产生惩罚。full score 会检测到跨楼栋惩罚，但 solver 不知道，可能接受会增加跨楼栋惩罚的 move。`
        : 'full score 和 delta score 覆盖一致。',
      recommendation: scInconsistent
        ? 'K22-B: 为 SC1 添加 delta score 逻辑（检查移动前后是否引入/消除跨楼栋连续课场景）'
        : '无需 action',
      suggestedNextStage: scInconsistent ? 'K22-B-SCORE-REGRESSION-HARNESS-PLAN' : undefined,
    })
  }

  // Rule B: HardScore / softScore separation
  {
    findings.push({
      id: 'K22-A-B-1',
      severity: 'NONE',
      category: 'B. Hard/soft separation',
      title: 'HardScore 和 softScore 分离清楚，无混用',
      currentStatus: `score.ts 中 hard constraints 仅影响 hardScore（hardScore += HARD_PENALTY），soft constraints 仅影响 softScore（softScore += SOFT_*）。两者在 calculateScoreWithDetails 和 calculateDeltaScore 中分别累积。HARD_PENALTY 仅在 HC 块内使用，SOFT_* 仅在 SC 块内使用。`,
      evidence: [
        'HC1/HC2/HC3/HC4/HC5: hardScore += HARD_PENALTY',
        'HC6: code skeleton exists but no scoring (comment: intentionally not counted)',
        'SC1: softScore += SOFT_SC1_CROSS_BUILDING',
        'SC2: softScore += SOFT_SC2_SAME_DAY * (count-1)',
        'SC3: softScore += SOFT_SC3_EXTREME_TIME',
        'SC4: softScore += SOFT_SC4_CROSS_CAMPUS',
        'MIN_PERT: softScore += SOFT_MINIMUM_PERTURBATION',
        'calculateDeltaScore returns { deltaHard, deltaSoft } separately',
        'No cross-contamination between hardScore and softScore',
      ],
      risk: '无风险。hardScore 和 softScore 分离清晰，solver 使用 { hardScore + softScore } 的总和做 LAHC 比较，但 hard-first 排斥保证 hard score 不会因 soft 而被忽视。',
      recommendation: '无需 action',
    })
  }

  // Rule C: Penalty constants
  {
    findings.push({
      id: 'K22-A-C-1',
      severity: 'MEDIUM',
      category: 'C. Penalty constants',
      title: '所有 penalty 常量硬编码，未受 SchedulingConfig 控制',
      currentStatus: `HARD_PENALTY=-1000, SC1=-5, SC2=-10, SC3=-1, SC4=-5, MIN_PERT=-2. 全部硬编码在 score.ts 顶部。SchedulingConfig 不包含 hardWeights/softWeights 字段。K21-FIX-E 规划推迟到 K22 K21-FIX-I-SCORE-WEIGHTS-ROADMAP。`,
      evidence: [
        'score.ts:16: const HARD_PENALTY = -1000',
        'score.ts:17: const SOFT_SC1_CROSS_BUILDING = -5',
        'score.ts:18: const SOFT_SC2_SAME_DAY = -10',
        'score.ts:19: const SOFT_SC3_EXTREME_TIME = -1',
        'score.ts:20: const SOFT_SC4_CROSS_CAMPUS = -5',
        'score.ts:21: const SOFT_MINIMUM_PERTURBATION = -2',
        'prisma/schema.prisma: SchedulingConfig has no hardWeights/softWeights fields',
        'K21-FIX-E plan: hardWeights/softWeights deferred to K22',
      ],
      risk: '不同高校对权重需求不同（工科院校可能更在意 SC3 极端时间，文科不在意）。当前无法调整，排课结果不可优化。不过，硬编码本身不构成 bug，仅限制产品化。',
      recommendation: 'K22 K21-FIX-I-SCORE-WEIGHTS-ROADMAP: (1) score.ts refactor 接收 dynamic weights；(2) SchedulingConfig 加 hardWeights/softWeights JSON 字段；(3) regression verify.',
      suggestedNextStage: 'K22-SCORE-WEIGHTS-ROADMAP',
    })
  }

  // Rule D: Data source readiness
  {
    findings.push({
      id: 'K22-A-D-1',
      severity: 'INFO',
      category: 'D. Data source readiness',
      title: '所有 constraint 数据来源稳定，K21-FIX-A 已确认 Room.capacity 真实',
      currentStatus: `roomId: ScheduleSlot.roomId (nullable, 0 = unassigned). teacherId: TeachingTask.teacherId (nullable). classGroupIds: TeachingTaskClass.classGroupId. capacity: Room.capacity (K21-FIX-A 确认 53 个 Room 全部真实). studentCount: ClassGroup.studentCount (nullable, fallback 50). RoomAvailability: RoomAvailability table (default all available). building: Room.building (nullable, inferBuilding fallback).`,
      evidence: [
        'roomId: ScheduleSlot.roomId (FK to Room)',
        'teacherId: TeachingTask.teacherId (FK to Teacher, nullable)',
        'classGroupIds: TeachingTaskClass.classGroupId (FK to ClassGroup)',
        'Room.capacity: all 53 rooms have real capacity (K21-FIX-A audit)',
        'ClassGroup.studentCount: nullable, fallback to 50 per class',
        'RoomAvailability: seeded per room, default all available',
        'Room.building: nullable, inferBuilding() fallback from room name',
        'originalAssignments: built from ScheduleState at solver init',
      ],
      risk: '数据来源均稳定。ClassGroup.studentCount 为 null 时 fallback 到 50 可能导致容量约束不精确，但不构成 bug。',
      recommendation: '无需 action，数据来源可接受',
    })
  }

  // Rule E: Immediate risks
  {
    findings.push({
      id: 'K22-A-E-1',
      severity: 'HIGH',
      category: 'E. Immediate risk: SC1 delta missing',
      title: 'SC1 跨楼栋连续课缺少 delta score，solver 可能做出错误决策',
      currentStatus: `calculateDeltaScore() 中没有 SC1（跨楼栋连续课）的逻辑。solver 使用 delta score 决策 move，不会考虑跨楼栋惩罚。但 calculateScoreWithDetails() 的 full score 会计算 SC1。后果：solver 可能接受 "delta 看起来更好，但 full score 会增加跨楼栋惩罚" 的 move。不过，solver 在最终验证时使用 full score（best score 追踪），所以最终结果是 full score 最优的，但中间迭代可能走弯路。`,
      evidence: [
        'score.ts calculateDeltaScore(): 无 SC1_CROSS_BUILDING_BACK_TO_BACK 逻辑',
        'score.ts calculateScoreWithDetails(): 有 SC1 逻辑 (lines 205-246)',
        'solver.ts: best score 使用 calculateInitialScore (full score) 追踪',
        'solver.ts: LAHC 接受决策使用 delta score',
      ],
      risk: 'HIGH: solver 使用 delta score 做 LAHC 决策，但 delta 不包含 SC1 惩罚。solver 可能接受会增加跨楼栋惩罚的 move，因为 delta 里看不到 SC1。最终 best score 是正确的（full score 追踪），但 solver 的迭代效率降低，可能错过更好的解。这可能导致预览结果中 SC1 惩罚比最优解更高。',
      recommendation: 'K22-B: (1) 为 SC1 添加 delta score 逻辑；(2) 在 regression harness 中测试 SC1 full vs delta 一致性；(3) 评估 solver 迭代效率影响。',
      suggestedNextStage: 'K22-B-SCORE-REGRESSION-HARNESS-PLAN',
    })

    findings.push({
      id: 'K22-A-E-2',
      severity: 'INFO',
      category: 'E. HC6 not scored (intentional)',
      title: 'HC6 锁定课程被移动 — 代码骨架存在但不计分，锁定通过 solver movability 控制',
      currentStatus: `score.ts:192-203 有 HC6 代码骨架（检测 lockedSlotIds 中的 slot 是否被移动），但实际未计分。注释: "HC6 is intentionally not counted in delta scoring because full scoring currently does not count HC6." 锁定机制通过 solver.ts:256 的 lockedSlotIds Set 控制 slot 的 movability。`,
      evidence: [
        'score.ts:192-203: HC6 code skeleton exists',
        'score.ts:392-396: HC6 intentional skip in delta score',
        'solver.ts:256: lockedSlotIds?.has(slot.id) controls movability',
        'preview.ts: lockedSlotIds passed to solver config',
      ],
      risk: '无风险。锁定通过 solver 的 movability 控制（不生成 locked slot 的 move），而非 score penalty。这是正确设计：locked slot 不参与 move generation，不需要 score penalty。',
      recommendation: '无需 action',
    })

    findings.push({
      id: 'K22-A-E-3',
      severity: 'LOW',
      category: 'E. SC1 vs SC4 building inference inconsistency',
      title: 'SC1 使用 inferBuilding(Room.name) fallback，SC4 仅使用 Room.building 字段',
      currentStatus: `SC1 跨楼栋连续课: getBuilding(room) 优先用 room.building，否则从 room.name 推断（"林校"/"实训"/"11-"/"12-"/"1-"）。SC4 跨校区通勤: 仅检查 room.building 字段，若 building 为 null 则不触发 SC4。`,
      evidence: [
        'score.ts inferBuilding(): roomName.includes("林校"/"实训") || /^11-|^12-|^1-/',
        'SC1 uses getBuilding() which falls back to inferBuilding()',
        'SC4 directly checks room.building without fallback',
      ],
      risk: 'LOW: 若 Room.building 为 null 但 Room.name 包含楼栋信息，SC1 会检测到跨楼栋惩罚，SC4 不会。两者判断逻辑不一致，但不影响正确性（SC4 是同一 task 跨校区，SC1 是教师/班级跨楼栋，语义不同）。可能导致 SC1 和 SC4 对同一场景产生不同判断。',
      recommendation: '未来可统一 building 判断逻辑（如 getBuilding() helper），但当前不构成 bug。',
    })

    findings.push({
      id: 'K22-A-E-4',
      severity: 'INFO',
      category: 'E. Missing soft constraints (known)',
      title: '7 项常见软约束未覆盖（教师均衡/班级空洞/教室稳定/实训匹配/大班优先/同班连续课少切换/教师连续课少切换）',
      currentStatus: `当前只有 SC1-SC4 + MIN_PERT 共 5 项软约束。K21-FIX-D audit 和 K21-FIX-E plan 已识别 7 项缺失的常见软约束。这些约束不是 bug，但影响排课质量。`,
      evidence: [
        'K21-FIX-D audit Section 10: hard/soft weight configuration',
        'K21-FIX-E plan: 7 items common soft constraints not covered',
        'Current: SC1 (cross building), SC2 (same day), SC3 (extreme time), SC4 (cross campus), MIN_PERT (perturbation)',
        'Missing: teacher balance, class hole reduction, room stability, lab matching, large class priority, same-class consecutive switch reduction, teacher consecutive switch reduction',
      ],
      risk: 'INFO: 不构成 bug。缺失的软约束影响排课质量，但当前已有约束可正常工作。应作为 K22+ roadmap 实施。',
      recommendation: 'K22-B SOFT-CONSTRAINTS-ROADMAP-AUDIT: 评估 7 项软约束的优先级和实施顺序。',
      suggestedNextStage: 'K22-B-SOFT-CONSTRAINTS-ROADMAP-AUDIT',
    })
  }

  return findings
}

// ── Main ──

async function main() {
  console.log('K22-A Score Constraint Inventory Audit')
  console.log('=======================================\n')

  const hardConstraints = inventoryHardConstraints()
  const softConstraints = inventorySoftConstraints()
  const findings = buildFindings(hardConstraints, softConstraints)

  const summary: Record<Severity, number> = { HIGH: 0, MEDIUM: 0, LOW: 0, INFO: 0, NONE: 0 }
  for (const f of findings) summary[f.severity]++
  const blocking = summary.HIGH > 0

  // Full / delta analysis
  const hcFull = hardConstraints.filter(c => c.fullScoreCoverage).length
  const hcDelta = hardConstraints.filter(c => c.deltaScoreCoverage).length
  const scFull = softConstraints.filter(c => c.fullScoreCoverage).length
  const scDelta = softConstraints.filter(c => c.deltaScoreCoverage).length

  const report = {
    generatedAt: new Date().toISOString(),
    phase: 'K22-A-SCORE-CONSTRAINT-INVENTORY-AUDIT',
    mode: 'read-only',
    summary,
    totalFindings: findings.length,
    blocking,
    hardConstraints: hardConstraints.map(c => ({
      id: c.id,
      type: c.type,
      name: c.name,
      codeName: c.codeName,
      currentPenalty: c.currentPenalty,
      triggerCondition: c.triggerCondition,
      dataSources: c.dataSources,
      fullScoreCoverage: c.fullScoreCoverage,
      deltaScoreCoverage: c.deltaScoreCoverage,
      configurableNow: c.configurableNow,
      inventoryRisk: c.inventoryRisk,
      notes: c.notes,
    })),
    softConstraints: softConstraints.map(c => ({
      id: c.id,
      type: c.type,
      name: c.name,
      codeName: c.codeName,
      currentPenalty: c.currentPenalty,
      triggerCondition: c.triggerCondition,
      dataSources: c.dataSources,
      fullScoreCoverage: c.fullScoreCoverage,
      deltaScoreCoverage: c.deltaScoreCoverage,
      configurableNow: c.configurableNow,
      inventoryRisk: c.inventoryRisk,
      notes: c.notes,
    })),
    penaltyConstants: {
      HARD_PENALTY: -1000,
      SOFT_SC1_CROSS_BUILDING: -5,
      SOFT_SC2_SAME_DAY: -10,
      SOFT_SC3_EXTREME_TIME: -1,
      SOFT_SC4_CROSS_CAMPUS: -5,
      SOFT_MINIMUM_PERTURBATION: -2,
      allHardcoded: true,
      configurableViaSchedulingConfig: false,
      note: 'K21-FIX-E plan: hardWeights/softWeights deferred to K22 K21-FIX-I-SCORE-WEIGHTS-ROADMAP',
    },
    fullDeltaCoverage: {
      hcFullCoverage: hcFull,
      hcDeltaCoverage: hcDelta,
      scFullCoverage: scFull,
      scDeltaCoverage: scDelta,
      hcConsistent: hcFull === hcDelta || hardConstraints.filter(c => c.id === 'HC6').length === 1,
      scConsistent: scFull === scDelta,
      risk: scFull !== scDelta ? 'SC1 full=delta MISMATCH: delta missing SC1' : 'consistent',
    },
    hardSoftSeparation: {
      hardScoreOnly: hardConstraints.map(c => c.id),
      softScoreOnly: softConstraints.map(c => c.id),
      crossContamination: false,
      note: 'Hard constraints only affect hardScore, soft constraints only affect softScore. No mixing.',
    },
    dataSourceReadiness: {
      roomId: 'ScheduleSlot.roomId (nullable, 0 = unassigned)',
      teacherId: 'TeachingTask.teacherId (nullable)',
      classGroupIds: 'TeachingTaskClass.classGroupId',
      roomCapacity: 'Room.capacity (K21-FIX-A: all 53 rooms real capacity)',
      studentCount: 'ClassGroup.studentCount (nullable, fallback 50)',
      roomAvailability: 'RoomAvailability table (default all available)',
      building: 'Room.building (nullable, inferBuilding fallback)',
      originalAssignments: 'ScheduleState.originalAssignments (built at solver init)',
    },
    findings: findings.map(f => ({
      id: f.id,
      severity: f.severity,
      category: f.category,
      title: f.title,
      currentStatus: f.currentStatus,
      evidence: f.evidence,
      risk: f.risk,
      recommendation: f.recommendation,
      suggestedNextStage: f.suggestedNextStage,
    })),
    recommendedNextStage: 'K22-B-SCORE-REGRESSION-HARNESS-PLAN',
  }

  // Write JSON
  const outDir = path.join(projectRoot, 'docs')
  if (!fs.existsSync(outDir)) fs.mkdirSync(outDir, { recursive: true })
  const outPath = path.join(outDir, 'k22-score-constraint-inventory-audit.json')
  fs.writeFileSync(outPath, JSON.stringify(report, null, 2), 'utf8')

  // Terminal output
  console.log('Summary:')
  console.log(`HIGH:      ${summary.HIGH}`)
  console.log(`MEDIUM:    ${summary.MEDIUM}`)
  console.log(`LOW:       ${summary.LOW}`)
  console.log(`INFO:      ${summary.INFO}`)
  console.log(`NONE:      ${summary.NONE}`)
  console.log(`BLOCKING:  ${blocking ? 'YES' : 'NO'}`)
  console.log('')

  console.log('Hard constraints:')
  for (const c of hardConstraints) {
    console.log(`  ${c.id}: ${c.name} (penalty=${c.currentPenalty}, full=${c.fullScoreCoverage}, delta=${c.deltaScoreCoverage})`)
  }
  console.log('')

  console.log('Soft constraints:')
  for (const c of softConstraints) {
    console.log(`  ${c.id}: ${c.name} (penalty=${c.currentPenalty}, full=${c.fullScoreCoverage}, delta=${c.deltaScoreCoverage})`)
  }
  console.log('')

  console.log('Penalty constants:')
  console.log('  HARD_PENALTY=-1000, SC1=-5, SC2=-10, SC3=-1, SC4=-5, MIN_PERT=-2')
  console.log('  all hardcoded, not configurable via SchedulingConfig')
  console.log('')

  console.log('Full / delta coverage:')
  console.log(`  HC full=${hcFull}/${hardConstraints.length}, delta=${hcDelta}/${hardConstraints.length}`)
  console.log(`  SC full=${scFull}/${softConstraints.length}, delta=${scDelta}/${softConstraints.length}`)
  console.log('')

  console.log('Findings:')
  for (const f of findings) {
    console.log(`  [${f.severity}] ${f.id} ${f.title}`)
  }
  console.log('')
  console.log(`Recommended next stage: ${report.recommendedNextStage}`)
  console.log('')
  console.log(`Report written: docs/k22-score-constraint-inventory-audit.json`)
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
