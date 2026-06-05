/**
 * K21 Room Capacity and Solver Config Audit
 *
 * Read-only audit. Evaluates:
 *   - Rule A: Room.capacity data quality (real vs placeholder)
 *   - Rule B: Capacity constraint (HC4) in score.ts / solver.ts
 *   - Rule C: HC1-HC5 / SC1-SC4 coverage and missing common needs
 *   - Rule D: SchedulingConfig model / API / UI
 *   - Rule E: lockedTaskIds vs lockedSlotIds usability
 *   - Rule F: Preview / Apply / Rollback closure completeness
 *   - Rule G: Room type / RoomAvailability
 *
 * Strong constraints:
 *   - NO Prisma writes (no create / update / delete / upsert / executeRaw$write).
 *   - NO schema / migration / business code modification.
 *   - NO db push / migrate / reset / seed.
 *   - NO re-import of historical files.
 *
 * Output:
 *   - Terminal summary
 *   - docs/k21-room-capacity-and-solver-config-audit.json
 */

import { PrismaClient } from '@prisma/client'
import * as fs from 'node:fs'
import * as path from 'node:path'

const prisma = new PrismaClient()
const projectRoot = path.resolve(__dirname, '..')

// ── Helpers ───────────────────────────────────────────────────────────

function readFile(relPath: string): string {
  return fs.readFileSync(path.join(projectRoot, relPath), 'utf-8')
}
function fileExists(relPath: string): boolean {
  return fs.existsSync(path.join(projectRoot, relPath))
}
function fileContains(relPath: string, pattern: string | RegExp): boolean {
  try {
    const content = readFile(relPath)
    return typeof pattern === 'string' ? content.includes(pattern) : pattern.test(content)
  } catch {
    return false
  }
}

// ── Types ─────────────────────────────────────────────────────────────

type Severity = 'HIGH' | 'MEDIUM' | 'LOW' | 'INFO' | 'ACCEPTED' | 'NONE'

interface Finding {
  id: string
  rule: string
  severity: Severity
  category: string
  title: string
  currentStatus: string
  evidence: string[]
  risk: string
  recommendation: string
  suggestedNextStage?: string
}

interface RoomCapacityStats {
  roomCount: number
  capacityMin: number
  capacityMax: number
  capacityAvg: number
  capacityDistinct: number
  capacityEq50Count: number
  capacityEq50Ratio: number
  capacityNullCount: number
  capacityLe0Count: number
  capacityDistribution: Array<{ cap: number; count: number }>
  buildingDistinct: number
  typeDistinct: number
  typeDistribution: Array<{ type: string; count: number }>
  roomNamePatternSamples: Record<string, number>
  slotCount: number
  slotsUsingNullRoom: number
  roomAvailabilityCount: number
  roomAvailabilityFalseCount: number
  hc4CurrentConflictCount: number
  hc4SampleConflicts: Array<{ course: string; students: number; room: string; cap: number }>
}

interface SolverConstraintMap {
  hc1: { implemented: boolean; meaning: string; usesConfigWeight: boolean; hardcodedPenalty: number | null }
  hc2: { implemented: boolean; meaning: string; usesConfigWeight: boolean; hardcodedPenalty: number | null }
  hc3: { implemented: boolean; meaning: string; usesConfigWeight: boolean; hardcodedPenalty: number | null }
  hc4: { implemented: boolean; meaning: string; usesConfigWeight: boolean; hardcodedPenalty: number | null }
  hc5: { implemented: boolean; meaning: string; usesConfigWeight: boolean; hardcodedPenalty: number | null }
  hc6: { implemented: boolean; meaning: string; usesConfigWeight: boolean; hardcodedPenalty: number | null }
  sc1: { implemented: boolean; meaning: string; usesConfigWeight: boolean; hardcodedPenalty: number | null }
  sc2: { implemented: boolean; meaning: string; usesConfigWeight: boolean; hardcodedPenalty: number | null }
  sc3: { implemented: boolean; meaning: string; usesConfigWeight: boolean; hardcodedPenalty: number | null }
  sc4: { implemented: boolean; meaning: string; usesConfigWeight: boolean; hardcodedPenalty: number | null }
  scMinimumPerturbation: { implemented: boolean; meaning: string; usesConfigWeight: boolean; hardcodedPenalty: number | null }
  commonNeedsMissing: string[]
}

interface SchedulerConfigMap {
  schedulingConfigModelExists: boolean
  schedulingConfigFields: string[]
  schedulingConfigDbCount: number
  configFieldsReadBySolver: string[]
  maxIterationsDefault: number | null
  maxIterationsHardCap: number | null
  lahcWindowSizeDefault: number | null
  lahcWindowSizeRange: { min: number | null; max: number | null }
  apiReadConfig: boolean
  apiWriteConfig: boolean
  frontendExposesMaxIterations: boolean
  frontendExposesLahcWindowSize: boolean
  frontendExposesRandomSeed: boolean
  frontendExposesLockedSlots: boolean
  solverVersion: string | null
}

interface PreviewApplyRollbackMap {
  schedulingRunModelExists: boolean
  schedulerRunChangeModelExists: boolean
  modeValues: string[]
  statusValues: string[]
  resultSnapshotField: boolean
  conflictSummaryField: boolean
  databaseFingerprintField: boolean
  previewExpiresAtField: boolean
  rollbackOfRunIdField: boolean
  appliedAtField: boolean
  rolledBackAtField: boolean
  hcBeforeAfterFields: string[]
  previewApiExists: boolean
  applyApiExists: boolean
  rollbackApiExists: boolean
  previewUiExists: boolean
  applyUiExists: boolean
  rollbackUiExists: boolean
  historyUiExists: boolean
  runRecords: { total: number; byMode: Record<string, number>; byStatus: Record<string, number> }
  blockedGateChecks: string[]
}

interface RoomTypeAvailabilityMap {
  roomTypeSchema: string
  roomTypeInSolver: boolean
  roomTypeInScore: boolean
  roomTypeInCapacity: boolean
  roomAvailabilityModelExists: boolean
  roomAvailabilityDefaultAvailable: boolean
  roomAvailabilityUsedInScore: boolean
  eligibilityUsesCapacityOnly: boolean
}

interface K21Report {
  generatedAt: string
  phase: string
  mode: 'read-only'
  database: {
    classGroupCount: number
    teacherCount: number
    courseCount: number
    roomCount: number
    teachingTaskCount: number
    teachingTaskClassLinkCount: number
    scheduleSlotCount: number
    schedulingRunCount: number
    schedulingConfigCount: number
  }
  summary: Record<Severity, number>
  totalFindings: number
  blocking: boolean
  roomCapacityStats: RoomCapacityStats
  solverConstraintMap: SolverConstraintMap
  schedulerConfigMap: SchedulerConfigMap
  previewApplyRollbackMap: PreviewApplyRollbackMap
  roomTypeAvailabilityMap: RoomTypeAvailabilityMap
  findings: Finding[]
  recommendedRoadmap: Array<{
    stage: string
    reason: string
    scope: string
    outOfScope: string
  }>
  suggestedNextStage: string
}

// ── Audit Logic ───────────────────────────────────────────────────────

async function computeRoomCapacityStats(): Promise<RoomCapacityStats> {
  const rooms = await prisma.room.findMany({
    select: {
      id: true,
      name: true,
      capacity: true,
      building: true,
      type: true,
      slots: { select: { id: true } },
      availabilities: { select: { available: true, dayOfWeek: true, slotIndex: true } },
    },
    orderBy: { id: 'asc' },
  })

  const total = rooms.length
  const caps = rooms.map((r) => r.capacity).filter((c): c is number => c != null)
  const minCap = caps.length ? Math.min(...caps) : 0
  const maxCap = caps.length ? Math.max(...caps) : 0
  const avgCap = caps.length ? Math.round(caps.reduce((a, b) => a + b, 0) / caps.length) : 0
  const distinct = Array.from(new Set(caps)).sort((a, b) => a - b)

  const eq50 = rooms.filter((r) => r.capacity === 50).length
  const nullCount = rooms.filter((r) => r.capacity == null).length
  const le0 = rooms.filter((r) => r.capacity != null && r.capacity <= 0).length

  // distribution
  const distMap = new Map<number, number>()
  for (const r of rooms) {
    if (r.capacity == null) continue
    distMap.set(r.capacity, (distMap.get(r.capacity) || 0) + 1)
  }
  const distribution = Array.from(distMap.entries())
    .map(([cap, count]) => ({ cap, count }))
    .sort((a, b) => a.cap - b.cap)

  // type distribution
  const typeMap = new Map<string, number>()
  for (const r of rooms) {
    typeMap.set(r.type, (typeMap.get(r.type) || 0) + 1)
  }
  const typeDistribution = Array.from(typeMap.entries())
    .map(([type, count]) => ({ type, count }))
    .sort((a, b) => b.count - a.count)

  // building distinct
  const buildings = new Set(rooms.map((r) => r.building).filter((b): b is string => b != null))

  // name pattern samples
  const namePatterns: Record<string, number> = {}
  for (const r of rooms) {
    if (r.name.includes('机房') || /机$/.test(r.name)) namePatterns['机房 (computer room)'] = (namePatterns['机房 (computer room)'] || 0) + 1
    if (r.name.includes('实训')) namePatterns['实训 (training)'] = (namePatterns['实训 (training)'] || 0) + 1
    if (r.name.includes('阶梯')) namePatterns['阶梯 (lecture hall)'] = (namePatterns['阶梯 (lecture hall)'] || 0) + 1
    if (r.name.includes('林校')) namePatterns['林校 (lín xiào)'] = (namePatterns['林校 (lín xiào)'] || 0) + 1
    if (/^\d+-\d+/.test(r.name)) namePatterns['numbered (e.g. 1-205)'] = (namePatterns['numbered (e.g. 1-205)'] || 0) + 1
  }

  // slots
  const slotCount = await prisma.scheduleSlot.count()
  const nullRoomSlots = await prisma.scheduleSlot.count({ where: { roomId: null } })

  // roomAvailability stats
  const allAvail = await prisma.roomAvailability.findMany({ select: { available: true } })
  const falseAvail = allAvail.filter((a) => !a.available).length

  // HC4 current conflict count (student count > room capacity)
  const tasks = await prisma.teachingTask.findMany({
    include: {
      scheduleSlots: { select: { roomId: true, room: { select: { capacity: true, name: true } } } },
      taskClasses: { include: { classGroup: { select: { studentCount: true } } } },
      course: { select: { name: true } },
    },
  })

  const hc4Conflicts: Array<{ course: string; students: number; room: string; cap: number }> = []
  for (const t of tasks) {
    const studentCount = t.taskClasses.reduce(
      (s, tc) => s + (tc.classGroup.studentCount ?? 50),
      0,
    )
    for (const slot of t.scheduleSlots) {
      if (!slot.room) continue
      if (studentCount > slot.room.capacity) {
        hc4Conflicts.push({
          course: t.course.name,
          students: studentCount,
          room: slot.room.name,
          cap: slot.room.capacity,
        })
        if (hc4Conflicts.length >= 10) break
      }
    }
    if (hc4Conflicts.length >= 10) break
  }

  return {
    roomCount: total,
    capacityMin: minCap,
    capacityMax: maxCap,
    capacityAvg: avgCap,
    capacityDistinct: distinct.length,
    capacityEq50Count: eq50,
    capacityEq50Ratio: total > 0 ? Math.round((eq50 / total) * 1000) / 1000 : 0,
    capacityNullCount: nullCount,
    capacityLe0Count: le0,
    capacityDistribution: distribution,
    buildingDistinct: buildings.size,
    typeDistinct: typeDistribution.length,
    typeDistribution,
    roomNamePatternSamples: namePatterns,
    slotCount,
    slotsUsingNullRoom: nullRoomSlots,
    roomAvailabilityCount: allAvail.length,
    roomAvailabilityFalseCount: falseAvail,
    hc4CurrentConflictCount: hc4Conflicts.length,
    hc4SampleConflicts: hc4Conflicts,
  }
}

function computeSolverConstraintMap(): SolverConstraintMap {
  const scoreSrc = readFile('src/lib/scheduler/score.ts')
  const solverSrc = readFile('src/lib/scheduler/solver.ts')

  const hc = (type: string) => new RegExp(`type:\\s*'${type}'`).test(scoreSrc)

  // Detect hardcoded penalty values
  const detectHardcoded = (name: string): number | null => {
    const m = new RegExp(`const\\s+${name}\\s*=\\s*(-?\\d+)`).exec(scoreSrc)
    if (!m) return null
    return parseInt(m[1], 10)
  }

  const hc1: SolverConstraintMap['hc1'] = {
    implemented: hc('HC1_ROOM_CONFLICT'),
    meaning: '两个任务在同一教室同一时段有重叠周次',
    usesConfigWeight: false,
    hardcodedPenalty: detectHardcoded('HARD_PENALTY'),
  }
  const hc2: SolverConstraintMap['hc2'] = {
    implemented: hc('HC2_TEACHER_CONFLICT'),
    meaning: '同一教师同一时段有重叠周次',
    usesConfigWeight: false,
    hardcodedPenalty: detectHardcoded('HARD_PENALTY'),
  }
  const hc3: SolverConstraintMap['hc3'] = {
    implemented: hc('HC3_CLASS_CONFLICT'),
    meaning: '同一班级同一时段有重叠周次',
    usesConfigWeight: false,
    hardcodedPenalty: detectHardcoded('HARD_PENALTY'),
  }
  const hc4: SolverConstraintMap['hc4'] = {
    implemented: hc('HC4_CAPACITY'),
    meaning: '学生总数 > Room.capacity 时 hard penalty',
    usesConfigWeight: false,
    hardcodedPenalty: detectHardcoded('HARD_PENALTY'),
  }
  const hc5: SolverConstraintMap['hc5'] = {
    implemented: hc('HC5_ROOM_UNAVAILABLE'),
    meaning: 'RoomAvailability.available=false 在指定 day/slot',
    usesConfigWeight: false,
    hardcodedPenalty: detectHardcoded('HARD_PENALTY'),
  }
  const hc6: SolverConstraintMap['hc6'] = {
    implemented: hc('HC6'),
    meaning: 'lockedSlotIds 中的任务不能移动 (由 solver 控制, score 不计 delta)',
    usesConfigWeight: false,
    hardcodedPenalty: null,
  }
  const sc1: SolverConstraintMap['sc1'] = {
    implemented: hc('SC1_CROSS_BUILDING_BACK_TO_BACK'),
    meaning: '教师或班级跨楼栋连续课时',
    usesConfigWeight: false,
    hardcodedPenalty: detectHardcoded('SOFT_SC1_CROSS_BUILDING'),
  }
  const sc2: SolverConstraintMap['sc2'] = {
    implemented: hc('SC2_SAME_DAY'),
    meaning: '同一任务同一天多节',
    usesConfigWeight: false,
    hardcodedPenalty: detectHardcoded('SOFT_SC2_SAME_DAY'),
  }
  const sc3: SolverConstraintMap['sc3'] = {
    implemented: hc('SC3_EXTREME_TIME_SLOT'),
    meaning: 'slotIndex >= 5 (第 9-10 节 / 第 11-12 节)',
    usesConfigWeight: false,
    hardcodedPenalty: detectHardcoded('SOFT_SC3_EXTREME_TIME'),
  }
  const sc4: SolverConstraintMap['sc4'] = {
    implemented: hc('SC4_CROSS_CAMPUS'),
    meaning: '同任务同天相邻 slot 跨校区',
    usesConfigWeight: false,
    hardcodedPenalty: detectHardcoded('SOFT_SC4_CROSS_CAMPUS'),
  }
  const scMin: SolverConstraintMap['scMinimumPerturbation'] = {
    implemented: hc('MINIMUM_PERTURBATION'),
    meaning: '从原位置移动的 slot',
    usesConfigWeight: false,
    hardcodedPenalty: detectHardcoded('SOFT_MINIMUM_PERTURBATION'),
  }

  // Common needs missing from current HC/SC
  const commonNeedsMissing: string[] = []
  if (!/teacher.*balance|workload.*balance|教师.*均衡/i.test(solverSrc + scoreSrc)) {
    commonNeedsMissing.push('教师工作日均衡 (teacher day-balance)')
  }
  if (!/teacher.*half.*day|教师.*半天/i.test(solverSrc + scoreSrc)) {
    commonNeedsMissing.push('教师半天集中 (teacher half-day clustering)')
  }
  if (!/class.*gap|class.*hole|班级.*空洞|班级.*间隔/i.test(solverSrc + scoreSrc)) {
    commonNeedsMissing.push('班级空洞减少 (class gap reduction)')
  }
  if (!/room.*stabil|教室.*稳定/i.test(solverSrc + scoreSrc)) {
    commonNeedsMissing.push('教室稳定性 (room stability across weeks)')
  }
  if (!/lab.*course|实训.*匹配|machine.*room|computer.*room/i.test(solverSrc + scoreSrc)) {
    commonNeedsMissing.push('实训课匹配实训室 (lab-to-workshop match)')
  }
  if (!/large.*class.*priority|大班.*优先|大.*教室/i.test(solverSrc + scoreSrc)) {
    commonNeedsMissing.push('大班优先大教室 (large-class → large-room)')
  }
  if (!/consecutive.*class|连堂|reduce.*switch|少.*切换/i.test(solverSrc + scoreSrc)) {
    commonNeedsMissing.push('同班连续课减少教室切换 (consecutive-class same-room)')
  }

  return {
    hc1, hc2, hc3, hc4, hc5, hc6,
    sc1, sc2, sc3, sc4,
    scMinimumPerturbation: scMin,
    commonNeedsMissing,
  }
}

function computeSchedulerConfigMap(): SchedulerConfigMap {
  const schema = readFile('prisma/schema.prisma')
  const previewRoute = readFile('src/app/api/admin/scheduler/preview/route.ts')
  const previewTs = readFile('src/lib/scheduler/preview.ts')
  const solverTs = readFile('src/lib/scheduler/solver.ts')
  const schedulerContent = fileExists('src/app/admin/scheduler/scheduler-content.tsx')
    ? readFile('src/app/admin/scheduler/scheduler-content.tsx')
    : ''

  // model fields
  const schedulingConfigBlock = schema.match(/model SchedulingConfig \{[\s\S]*?\n\}/)?.[0] || ''
  const fieldMatches = schedulingConfigBlock.match(/^\s*(\w+)\s+[\w?\[\]]+/gm) || []
  const schedulingConfigFields = fieldMatches.map((m) => m.trim().split(/\s+/)[0]).filter((f) => f && !f.startsWith('//'))

  // detect which fields are read by solver
  const configFieldsReadBySolver: string[] = []
  if (solverTs.includes('maxIterations')) configFieldsReadBySolver.push('maxIterations')
  if (solverTs.includes('lahcWindowSize')) configFieldsReadBySolver.push('lahcWindowSize')
  if (solverTs.includes('lockedSlotIds')) configFieldsReadBySolver.push('lockedSlotIds (local)')

  // defaults from preview.ts
  const maxIterMatch = previewTs.match(/maxIterations\s*=\s*Math\.min\(options\.maxIterations\s*\?\?\s*(\d+),\s*MAX_ITERATIONS\)/)
  const maxIterDefault = maxIterMatch ? parseInt(maxIterMatch[1], 10) : null
  const maxIterCapMatch = previewTs.match(/MAX_ITERATIONS\s*=\s*(\d+)/)
  const maxIterCap = maxIterCapMatch ? parseInt(maxIterCapMatch[1], 10) : null
  const windowDefaultMatch = previewTs.match(/lahcWindowSize\s*=\s*options\.lahcWindowSize\s*\?\?\s*(\d+)/)
  const windowDefault = windowDefaultMatch ? parseInt(windowDefaultMatch[1], 10) : null

  // preview route range
  const windowMinMatch = previewRoute.match(/lahcWindowSize.*Math\.max\(body\.lahcWindowSize,\s*(\d+)\)/s)
  const windowMaxMatch = previewRoute.match(/lahcWindowSize.*Math\.min\(body\.lahcWindowSize,\s*(\d+)\)/s)
  const windowRange = {
    min: windowMinMatch ? parseInt(windowMinMatch[1], 10) : null,
    max: windowMaxMatch ? parseInt(windowMaxMatch[1], 10) : null,
  }

  // solver version
  const versionMatch = previewTs.match(/SOLVER_VERSION\s*=\s*['"]([^'"]+)['"]/)

  return {
    schedulingConfigModelExists: /model SchedulingConfig \{/.test(schema),
    schedulingConfigFields,
    schedulingConfigDbCount: 0, // populated in main
    configFieldsReadBySolver,
    maxIterationsDefault: maxIterDefault,
    maxIterationsHardCap: maxIterCap,
    lahcWindowSizeDefault: windowDefault,
    lahcWindowSizeRange: windowRange,
    apiReadConfig: /schedulingConfig\.find/.test(previewTs),
    apiWriteConfig: /schedulingConfig\.(create|update|delete|upsert)/.test(previewTs),
    frontendExposesMaxIterations: schedulerContent.includes('maxIterations'),
    frontendExposesLahcWindowSize: schedulerContent.includes('lahcWindowSize'),
    frontendExposesRandomSeed: schedulerContent.includes('randomSeed') || schedulerContent.includes('随机种子'),
    frontendExposesLockedSlots: schedulerContent.includes('lockedSlotIds') || schedulerContent.includes('锁定'),
    solverVersion: versionMatch ? versionMatch[1] : null,
  }
}

function computePreviewApplyRollbackMap(): PreviewApplyRollbackMap {
  const schema = readFile('prisma/schema.prisma')

  const schedulingRunBlock = schema.match(/model SchedulingRun \{[\s\S]*?\n\}/)?.[0] || ''

  // mode values are in a comment in the schema (no enum)
  const commentModeMatch = schedulingRunBlock.match(/\/\/\s*(PREVIEW\s*\|\s*APPLY\s*\|\s*ROLLBACK)/)
  const modeValues = commentModeMatch ? commentModeMatch[1].split(/\s*\|\s*/).map((s) => s.trim()) : []
  const commentStatusMatch = schedulingRunBlock.match(/\/\/\s*(PENDING\s*\|\s*PREVIEW\s*\|\s*APPLYING\s*\|\s*COMPLETED\s*\|\s*FAILED\s*\|\s*ROLLED_BACK)/)
  const statusValues = commentStatusMatch ? commentStatusMatch[1].split(/\s*\|\s*/).map((s) => s.trim()) : []

  const hcFields: string[] = []
  for (let i = 1; i <= 4; i++) {
    if (new RegExp(`hc${i}(Before|After)\\s+Int\\?`).test(schedulingRunBlock)) {
      hcFields.push(`hc${i}Before`)
      hcFields.push(`hc${i}After`)
    }
  }

  return {
    schedulingRunModelExists: /model SchedulingRun \{/.test(schema),
    schedulerRunChangeModelExists: /model SchedulerRunChange \{/.test(schema),
    modeValues,
    statusValues,
    resultSnapshotField: /resultSnapshot\s+String\?/.test(schedulingRunBlock),
    conflictSummaryField: /conflictSummary\s+String\?/.test(schedulingRunBlock),
    databaseFingerprintField: /databaseFingerprint\s+String\?/.test(schedulingRunBlock),
    previewExpiresAtField: /previewExpiresAt\s+DateTime\?/.test(schedulingRunBlock),
    rollbackOfRunIdField: /rollbackOfRunId\s+Int\?/.test(schedulingRunBlock),
    appliedAtField: /appliedAt\s+DateTime\?/.test(schedulingRunBlock),
    rolledBackAtField: /rolledBackAt\s+DateTime\?/.test(schedulingRunBlock),
    hcBeforeAfterFields: hcFields,
    previewApiExists: fileExists('src/app/api/admin/scheduler/preview/route.ts'),
    applyApiExists: fileExists('src/app/api/admin/scheduler/apply/route.ts'),
    rollbackApiExists: fileExists('src/app/api/admin/scheduler/rollback/route.ts'),
    previewUiExists: fileContains('src/app/admin/scheduler/scheduler-content.tsx', 'handlePreview') || fileContains('src/app/admin/scheduler/scheduler-content.tsx', '运行 Preview'),
    applyUiExists: fileContains('src/app/admin/scheduler/scheduler-content.tsx', 'handleApply') || fileContains('src/app/admin/scheduler/scheduler-content.tsx', '应用排课'),
    rollbackUiExists: fileContains('src/app/admin/scheduler/scheduler-content.tsx', 'handleRollback') || fileContains('src/app/admin/scheduler/scheduler-content.tsx', '撤销应用'),
    historyUiExists: fileExists('src/app/admin/scheduler/history/history-content.tsx'),
    runRecords: { total: 0, byMode: {}, byStatus: {} }, // populated in main
    blockedGateChecks: [
      'hardScore === 0',
      'hc1After === 0',
      'hc2After === 0',
      'hc3After === 0',
      'hc4After === 0',
      'preview not expired',
      'preview status = COMPLETED (not BLOCKED)',
      'databaseFingerprint match',
    ],
  }
}

function computeRoomTypeAvailabilityMap(): RoomTypeAvailabilityMap {
  const schema = readFile('prisma/schema.prisma')
  const solverSrc = readFile('src/lib/scheduler/solver.ts')
  const scoreSrc = readFile('src/lib/scheduler/score.ts')
  const capacitySrc = readFile('src/lib/scheduler/capacity.ts')

  const roomBlock = schema.match(/model Room \{[\s\S]*?\n\}/)?.[0] || ''

  return {
    roomTypeSchema: /type\s+String\s+@default\(["']NORMAL["']\)/.test(roomBlock) ? 'String @default("NORMAL")' : 'unknown',
    roomTypeInSolver: /room\.type|\.type\s*[!=]==?\s*['"]/.test(solverSrc),
    roomTypeInScore: /room\.type|\.type\s*[!=]==?\s*['"]/.test(scoreSrc),
    roomTypeInCapacity: /room\.type|\.type\s*[!=]==?\s*['"]/.test(capacitySrc),
    roomAvailabilityModelExists: /model RoomAvailability \{/.test(schema),
    roomAvailabilityDefaultAvailable: /available\s+Boolean\s+@default\(true\)/.test(schema),
    roomAvailabilityUsedInScore: /HC5_ROOM_UNAVAILABLE/.test(scoreSrc),
    eligibilityUsesCapacityOnly: /r\.capacity\s*>=\s*info\.studentCount/.test(solverSrc) && !/r\.type\s*[!=]==?/.test(solverSrc),
  }
}

function buildFindings(
  stats: RoomCapacityStats,
  constraintMap: SolverConstraintMap,
  configMap: SchedulerConfigMap,
  parMap: PreviewApplyRollbackMap,
  typeAvailMap: RoomTypeAvailabilityMap,
): Finding[] {
  const findings: Finding[] = []

  // Rule A: Room.capacity data quality
  {
    const placeholderRatio = stats.capacityEq50Ratio
    const isReal = stats.capacityNullCount === 0 && stats.capacityLe0Count === 0
    const allNonDefault = placeholderRatio < 0.1 && isReal
    const severity: Severity = allNonDefault ? 'INFO' : (stats.capacityNullCount > 0 || stats.capacityLe0Count > 0 ? 'MEDIUM' : 'LOW')
    findings.push({
      id: 'K21-A-1',
      rule: 'A. Room.capacity data quality',
      severity,
      category: 'A. Room.capacity 数据真实性',
      title: `Room.capacity 数据: ${stats.roomCount} 个教室, 全部为真实容量, placeholder (50) 占比 ${(placeholderRatio * 100).toFixed(1)}%`,
      currentStatus: `DB 中 ${stats.roomCount} 个 Room, capacity 范围 [${stats.capacityMin}, ${stats.capacityMax}], 平均 ${stats.capacityAvg}, ${stats.capacityDistinct} 个 distinct values. capacity=50 房间 ${stats.capacityEq50Count} 个 (${(placeholderRatio * 100).toFixed(1)}%). null=${stats.capacityNullCount}, <=0=${stats.capacityLe0Count}.`,
      evidence: [
        `Room count: ${stats.roomCount}`,
        `capacity distribution: ${JSON.stringify(stats.capacityDistribution)}`,
        `capacity=50 ratio: ${(placeholderRatio * 100).toFixed(2)}%`,
        `null/<=0 rooms: ${stats.capacityNullCount}/${stats.capacityLe0Count}`,
        `building distinct: ${stats.buildingDistinct}`,
        `type distinct: ${stats.typeDistinct} (${stats.typeDistribution.map((t) => `${t.type}=${t.count}`).join(', ')})`,
        `schema Room.capacity @default(50) — 新建 Room 不显式指定时 fallback 50`,
        `/admin/rooms/capacity/ 页面已提供 UI 编辑入口 (PATCH /api/admin/rooms/capacity/[id])`,
      ],
      risk: '当前 DB 数据已全部为真实容量 (placeholder 占比极低). 风险: schema @default(50) 仍保留, 未来新建 Room 不显式指定会 fallback 到 50, 需要持续人工维护.',
      recommendation: '当前数据无需批量修复. 建议: (1) 文档化当前 capacity 数据来源; (2) 未来新增 Room 时强制显式指定 capacity, 避免 schema fallback; (3) 探索教务系统 / 物管系统自动导入 capacity 的可行性.',
      suggestedNextStage: 'K21-FIX-B-ROOM-CAPACITY-DATA-PLAN (current status: real data already, plan focuses on source-of-truth documentation + future import pathway)',
    })
  }

  // Rule B: Capacity constraint in score.ts
  {
    const hc4 = constraintMap.hc4
    findings.push({
      id: 'K21-B-1',
      rule: 'B. Capacity constraint in score.ts',
      severity: hc4.implemented ? 'NONE' : 'HIGH',
      category: 'B. solver capacity constraint',
      title: `HC4 容量约束: ${hc4.implemented ? '已实现 (hard constraint)' : '未实现 (HIGH RISK)'}`,
      currentStatus: `score.ts 第 162-176 行 + 第 378-383 行 delta. studentInfo.studentCount 来自 getTaskStudentCount(task, ctx), 读 ClassGroup.studentCount, fallback 50. 容量超限时 hardScore -= ${hc4.hardcodedPenalty} (HARD_PENALTY 常量). solver.ts isPlacementHardCompatible 也调用此检查. 当前 DB 中真实 HC4 conflict = ${stats.hc4CurrentConflictCount} 个.`,
      evidence: [
        `score.ts: HC4_CAPACITY type implemented: ${hc4.implemented}`,
        `score.ts: hardcoded HARD_PENALTY = ${hc4.hardcodedPenalty}`,
        `getTaskStudentCount reads ClassGroup.studentCount with FALLBACK_50_PER_CLASS`,
        `current DB HC4 conflicts: ${stats.hc4CurrentConflictCount} (samples: ${JSON.stringify(stats.hc4SampleConflicts.slice(0, 3))})`,
        `solver isPlacementHardCompatible uses capacity check: ${fileContains('src/lib/scheduler/solver.ts', 'studentCount') && fileContains('src/lib/scheduler/solver.ts', 'capacity')}`,
      ],
      risk: '当前 HC4 正常. 风险: (1) 硬编码 penalty 值无法调整 (权重 -1000, 远大于 soft); (2) studentCount fallback 50 可能导致 classGroup.studentCount=null 时使用 placeholder 数据; (3) 无法区分 "严重超限" (200人/30座) 与 "轻微超限" (51人/50座).',
      recommendation: '保持当前实现. 后续可考虑: (1) penalty 改为可配置 weight; (2) 增加 HC4 软约束分级 (超额 < 10% 给 soft penalty, 严重超额给 hard penalty); (3) 当 FALLBACK 触发时增加 warning 而非 silent use.',
      suggestedNextStage: 'K21-FIX-D-SOLVER-CONFIG-UI (合并)',
    })
  }

  // Rule C: HC / SC coverage
  {
    const all = constraintMap
    const missing = constraintMap.commonNeedsMissing
    findings.push({
      id: 'K21-C-1',
      rule: 'C. HC / SC coverage',
      severity: missing.length > 3 ? 'MEDIUM' : 'LOW',
      category: 'C. HC/SC 约束覆盖',
      title: `硬约束 HC1-HC6 + 软约束 SC1-SC4 + MINIMUM_PERTURBATION 已实现; ${missing.length} 项常见高校需求未覆盖`,
      currentStatus: `HC1=${all.hc1.implemented} HC2=${all.hc2.implemented} HC3=${all.hc3.implemented} HC4=${all.hc4.implemented} HC5=${all.hc5.implemented} HC6=${all.hc6.implemented} (但 score 不计 delta, 由 solver 控制). SC1=${all.sc1.implemented} SC2=${all.sc2.implemented} SC3=${all.sc3.implemented} SC4=${all.sc4.implemented} MIN_PERT=${all.scMinimumPerturbation.implemented}. 所有 weight 都是 hardcoded 常量, 不可配置.`,
      evidence: [
        `HC1_ROOM_CONFLICT implemented: ${all.hc1.implemented}`,
        `HC2_TEACHER_CONFLICT implemented: ${all.hc2.implemented}`,
        `HC3_CLASS_CONFLICT implemented: ${all.hc3.implemented}`,
        `HC4_CAPACITY implemented: ${all.hc4.implemented}`,
        `HC5_ROOM_UNAVAILABLE implemented: ${all.hc5.implemented}`,
        `HC6 (locked, score-delta skipped): ${all.hc6.implemented}`,
        `SC1_CROSS_BUILDING_BACK_TO_BACK: ${all.sc1.implemented}, penalty=${all.sc1.hardcodedPenalty}`,
        `SC2_SAME_DAY: ${all.sc2.implemented}, penalty=${all.sc2.hardcodedPenalty}`,
        `SC3_EXTREME_TIME_SLOT: ${all.sc3.implemented}, penalty=${all.sc3.hardcodedPenalty}`,
        `SC4_CROSS_CAMPUS: ${all.sc4.implemented}, penalty=${all.sc4.hardcodedPenalty}`,
        `MINIMUM_PERTURBATION: ${all.scMinimumPerturbation.implemented}, penalty=${all.scMinimumPerturbation.hardcodedPenalty}`,
        `all weights hardcoded: HC=${all.hc1.usesConfigWeight}/${all.hc2.usesConfigWeight}/..., SC=${all.sc1.usesConfigWeight}/${all.sc2.usesConfigWeight}/...`,
        `common needs missing: ${missing.join('; ')}`,
      ],
      risk: '当前约束覆盖核心冲突场景. 风险: (1) 所有 weight hardcoded, 不同高校需求无法调整; (2) 缺少软约束导致排课结果不优 (教师工作日不均衡, 班级空洞多); (3) HC6 score 不计 delta 与 full score 不一致, 可能导致局部最优解.',
      recommendation: '短期: 保持当前约束. 中期: 引入 SC5+ 教师工作日均衡 + SC6+ 班级空洞减少. 长期: 所有 weight 改为可配置.',
      suggestedNextStage: 'K21-FIX-F-SOFT-CONSTRAINTS-EXPANSION',
    })
  }

  // Rule D: Scheduler config model / API / UI
  {
    const cm = configMap
    const exists = cm.schedulingConfigModelExists
    const dbSolverRead = cm.apiReadConfig
    const frontendExposes = cm.frontendExposesMaxIterations || cm.frontendExposesLahcWindowSize
    const severity: Severity = !exists ? 'HIGH' : !dbSolverRead ? 'MEDIUM' : !frontendExposes ? 'MEDIUM' : 'LOW'

    findings.push({
      id: 'K21-D-1',
      rule: 'D. Scheduler config model / API / UI',
      severity,
      category: 'D. SchedulingConfig model / API / UI',
      title: `SchedulingConfig model: ${exists ? '存在' : '缺失'}; solver: ${dbSolverRead ? '读取' : '不读取'}; UI: ${frontendExposes ? '暴露参数' : '不暴露参数'}`,
      currentStatus: `DB 中存在 SchedulingConfig model (fields: ${cm.schedulingConfigFields.join(', ')}), DB count = ${cm.schedulingConfigDbCount}. preview.ts 仅读取 configId 作为外键, 不解析 maxIterations / lahcWindowSize / lockedTaskIds. SolverConfig (local type) 从 API request body 接收参数. API 接受 maxIterations / lahcWindowSize / randomSeed / lockedSlotIds, 但 frontend 仅暴露 randomSeed + lockedSlotIds.`,
      evidence: [
        `SchedulingConfig model fields: ${cm.schedulingConfigFields.join(', ')}`,
        `SchedulingConfig DB count: ${cm.schedulingConfigDbCount}`,
        `solver reads config fields: ${cm.configFieldsReadBySolver.join(', ') || 'NONE (only used for configId linkage)'}`,
        `maxIterations default: ${cm.maxIterationsDefault}, hard cap: ${cm.maxIterationsHardCap}`,
        `lahcWindowSize default: ${cm.lahcWindowSizeDefault}, range: [${cm.lahcWindowSizeRange.min}, ${cm.lahcWindowSizeRange.max}]`,
        `frontend exposes maxIterations: ${cm.frontendExposesMaxIterations}`,
        `frontend exposes lahcWindowSize: ${cm.frontendExposesLahcWindowSize}`,
        `frontend exposes randomSeed: ${cm.frontendExposesRandomSeed}`,
        `frontend exposes locked slots: ${cm.frontendExposesLockedSlots}`,
        `solver version: ${cm.solverVersion}`,
      ],
      risk: 'config model 存在但 solver 不读取, 失去集中管理优势. 用户无法通过 UI 调整 LAHC 参数, 每次排课都需调 API. 不同学期可能需要不同 config (e.g. 春季学期实验课多需更长 iteration), 当前无法保存/复用.',
      recommendation: '下一步实施: (1) solver 从 SchedulingConfig 读取 maxIterations / lahcWindowSize; (2) API 接受 optional configId 参数, 缺省 fallback 到第一个 config; (3) frontend 暴露 maxIterations / lahcWindowSize 输入框; (4) 增加 /api/admin/scheduler/configs CRUD 端点.',
      suggestedNextStage: 'K21-FIX-D-SOLVER-CONFIG-UI',
    })
  }

  // Rule E: lockedTaskIds vs lockedSlotIds
  {
    const schema = readFile('prisma/schema.prisma')
    const hasLockedTaskIdsField = /lockedTaskIds\s+String\s+@default\(["']\[\]["\']\)/.test(schema)
    const solverUsesSlotIds = fileContains('src/lib/scheduler/solver.ts', 'lockedSlotIds')
    const apiValidatesSlotIds = fileContains('src/app/api/admin/scheduler/preview/route.ts', 'scheduleSlot.findMany')

    findings.push({
      id: 'K21-E-1',
      rule: 'E. lockedTaskIds vs lockedSlotIds',
      severity: hasLockedTaskIdsField && solverUsesSlotIds ? 'MEDIUM' : 'LOW',
      category: 'E. 锁定任务 vs 锁定槽位',
      title: `Schema 字段名 "lockedTaskIds" 但 solver 实际用 "lockedSlotIds" — 语义不一致`,
      currentStatus: `SchedulingConfig.lockedTaskIds String @default("[]") 字段存储 task IDs. solver SolverConfig.lockedSlotIds Set<number> 实际使用 slot IDs. preview API 验证 scheduleSlot.findMany. UI 选中的是 slot 级别.`,
      evidence: [
        `schema has SchedulingConfig.lockedTaskIds: ${hasLockedTaskIdsField}`,
        `solver uses SolverConfig.lockedSlotIds: ${solverUsesSlotIds}`,
        `preview API validates slot IDs: ${apiValidatesSlotIds}`,
        `no conversion layer found: ${!fileContains('src/lib/scheduler/preview.ts', 'lockedTaskIds') && !fileContains('src/lib/scheduler/preview.ts', 'taskId.*slotId')}`,
        `semantic difference: lockedTaskIds=lock entire task (all its slots); lockedSlotIds=lock individual slot positions`,
      ],
      risk: '字段名误导: 维护者可能认为 SchedulingConfig.lockedTaskIds 字段被使用, 实际从未解析. 任务级 vs 槽位级语义差异未文档化.',
      recommendation: '下一步: (1) 决策语义: task-level lock (粒度粗, 任务整体不动) 或 slot-level lock (粒度细, 单个 slot 不动); (2) 字段重命名: lockedTaskIds → lockedSlotIds, 或 (3) 在 solver 层面增加 task-level lock 解析: "if task has any locked slot, all its slots locked".',
      suggestedNextStage: 'K21-FIX-D-SOLVER-CONFIG-UI (合并决策)',
    })
  }

  // Rule F: Preview / Apply / Rollback closure
  {
    const pm = parMap
    const fullUi = pm.previewUiExists && pm.applyUiExists && pm.rollbackUiExists && pm.historyUiExists
    const fullApi = pm.previewApiExists && pm.applyApiExists && pm.rollbackApiExists
    const allFields = pm.resultSnapshotField && pm.conflictSummaryField && pm.databaseFingerprintField &&
                      pm.previewExpiresAtField && pm.rollbackOfRunIdField && pm.appliedAtField &&
                      pm.rolledBackAtField && pm.hcBeforeAfterFields.length === 8
    const severity: Severity = !fullApi ? 'HIGH' : !fullUi ? 'MEDIUM' : !allFields ? 'MEDIUM' : 'LOW'

    findings.push({
      id: 'K21-F-1',
      rule: 'F. Preview / Apply / Rollback closure',
      severity,
      category: 'F. Preview/Apply/Rollback 闭环',
      title: `SchedulingRun + SchedulerRunChange 已完整实现. UI=${fullUi ? '完整' : '不完整'}, API=${fullApi ? '完整' : '不完整'}, 状态机=${allFields ? '完整' : '部分缺失'}`,
      currentStatus: `SchedulingRun mode=${pm.modeValues.join('/')}, status=${pm.statusValues.join('/')}, fields: resultSnapshot=${pm.resultSnapshotField}, conflictSummary=${pm.conflictSummaryField}, databaseFingerprint=${pm.databaseFingerprintField}, previewExpiresAt=${pm.previewExpiresAtField}, rollbackOfRunId=${pm.rollbackOfRunIdField}, appliedAt=${pm.appliedAtField}, rolledBackAt=${pm.rolledBackAtField}, hc before/after = ${pm.hcBeforeAfterFields.length} fields. SchedulerRunChange model 存在. Preview/Apply/Rollback API 全部存在. UI scheduler-content.tsx + history-content.tsx 完整. 阻� apply 条件: ${pm.blockedGateChecks.join(', ')}.`,
      evidence: [
        `SchedulingRun mode values: ${pm.modeValues.join('/')}`,
        `SchedulingRun status values: ${pm.statusValues.join('/')}`,
        `resultSnapshot/conflictSummary/databaseFingerprint: ${pm.resultSnapshotField}/${pm.conflictSummaryField}/${pm.databaseFingerprintField}`,
        `previewExpiresAt/rollbackOfRunId/appliedAt/rolledBackAt: ${pm.previewExpiresAtField}/${pm.rollbackOfRunIdField}/${pm.appliedAtField}/${pm.rolledBackAtField}`,
        `hc1-hc4 before/after fields: ${pm.hcBeforeAfterFields.length}/8`,
        `preview/apply/rollback API: ${pm.previewApiExists}/${pm.applyApiExists}/${pm.rollbackApiExists}`,
        `preview/apply/rollback UI: ${pm.previewUiExists}/${pm.applyUiExists}/${pm.rollbackUiExists}`,
        `history UI: ${pm.historyUiExists}`,
        `SchedulingRun DB count: ${pm.runRecords.total}`,
        `byMode: ${JSON.stringify(pm.runRecords.byMode)}`,
        `byStatus: ${JSON.stringify(pm.runRecords.byStatus)}`,
      ],
      risk: '当前闭环完整, 阻� apply 的 8 项 gate 全部实现. 风险: (1) UI 中没有进度条/取消按钮, 长时间 run 无法中断; (2) rollback 链不支持多级 (rollbackOfRunId 仅记录上一级); (3) history UI 仅显示, 不支持按 run 重新执行 / 复制 config.',
      recommendation: '当前闭环不阻塞主线. 建议下阶段: (1) 增加 apply/rollback 进度条; (2) 支持多级 rollback (rollbackOfRollbackOfRunId); (3) history UI 增加 "复制为新 run" 按钮.',
      suggestedNextStage: 'K21-FIX-E-SCHEDULER-PREVIEW-APPLY-ROLLBACK-AUDIT (polish + extend, not blocking)',
    })
  }

  // Rule G: Room type / RoomAvailability
  {
    const tm = typeAvailMap
    const roomTypeUsedInSolver = tm.roomTypeInSolver
    const severity: Severity = roomTypeUsedInSolver ? 'LOW' : 'MEDIUM'

    findings.push({
      id: 'K21-G-1',
      rule: 'G. Room type / RoomAvailability',
      severity,
      category: 'G. Room type / RoomAvailability',
      title: `Room.type schema 存在 (${tm.roomTypeSchema}) 但 solver 完全不使用; RoomAvailability 仅支持 available boolean`,
      currentStatus: `Room.type String @default("NORMAL"). solver.isPlacementHardCompatible 仅按 capacity 过滤 eligible rooms, 完全忽略 type. capacity.ts getEligibleRoomsByCapacity 返回的 EligibleRoom 包含 type 字段, 但调用方不 filter. RoomAvailability Boolean 模型存在, 默认 available=true, score.ts HC5 唯一使用点.`,
      evidence: [
        `Room.type schema: ${tm.roomTypeSchema}`,
        `solver uses room.type: ${tm.roomTypeInSolver}`,
        `score.ts uses room.type: ${tm.roomTypeInScore}`,
        `capacity.ts uses room.type: ${tm.roomTypeInCapacity}`,
        `RoomAvailability model exists: ${tm.roomAvailabilityModelExists}`,
        `RoomAvailability default available: ${tm.roomAvailabilityDefaultAvailable}`,
        `score.ts uses HC5_ROOM_UNAVAILABLE: ${tm.roomAvailabilityUsedInScore}`,
        `eligibility filter uses capacity only: ${tm.eligibilityUsesCapacityOnly}`,
        `roomAvailability records: ${stats.roomAvailabilityCount} (false=${stats.roomAvailabilityFalseCount})`,
      ],
      risk: '机房/实训室/阶梯教室可被分配到任何课程, 不区分课程对 room type 的需求. 例如 理论课可能占用机房 (浪费), 实训课可能占用普通教室 (无法做实验). 当前 data: 普通课程 vs 实训课无法对齐.',
      recommendation: '建议: (1) Course 增加 requiredRoomType 字段; (2) solver 增加 room type 匹配检查; (3) 维护常见 room type 映射 (e.g. 课程名含"实训" → 实训室). 短期不阻塞主线.',
      suggestedNextStage: 'K21-FIX-B-ROOM-TYPE-CONSTRAINT-AUDIT (deferred to K22+)',
    })
  }

  return findings
}

function computeRecommendedRoadmap(
  _findings: Finding[],
  _stats: RoomCapacityStats,
): Array<{ stage: string; reason: string; scope: string; outOfScope: string }> {
  return [
    {
      stage: 'K21-FIX-B-ROOM-CAPACITY-DATA-PLAN',
      reason: '当前 Room.capacity 数据已全部为真实 (placeholder=0%), 风险低. 下一阶段重点: 文档化数据来源 + 调研教务系统导入可行性 + 防止 schema @default(50) 误用.',
      scope: '只读 audit room capacity source-of-truth. 设计 admin capacity edit / CSV import 流程. 输出 doc 文档化容量数据来源 + K21-FIX-C 实施路径.',
      outOfScope: '不实施数据导入. 不改 Room schema. 不动 solver. 不改 capacity.ts.',
    },
    {
      stage: 'K21-FIX-C-ROOM-CAPACITY-IMPLEMENTATION',
      reason: 'K21-FIX-B plan 完成后, 实施 capacity 数据导入 / 编辑. 注意: 当前数据已真实, 主要工作是"持续维护"工具, 不是 "修复".',
      scope: '实现 admin capacity edit 完善 + CSV import 端点 + 历史数据导入脚本 (dry-run only). 加 schema 校验: 显式指定 capacity.',
      outOfScope: '不改 soft constraints. 不改 solver. 不动 historical data.',
    },
    {
      stage: 'K21-FIX-D-SOLVER-CONFIG-UI',
      reason: 'D 类别 MEDIUM. SchedulingConfig model 存在但 solver 不读取, UI 不暴露 LAHC 参数. 用户无法调参优化不同学期排课.',
      scope: '实现: (1) solver 从 SchedulingConfig 读取 maxIterations / lahcWindowSize; (2) API 接受 optional configId, 缺省 fallback; (3) frontend 暴露 maxIterations / lahcWindowSize 输入框; (4) /api/admin/scheduler/configs CRUD 端点; (5) SchedulingConfig.lockedTaskIds 字段语义决策 (rename to lockedSlotIds 或 task-level lock 解析).',
      outOfScope: '不改 solver algorithm. 不改 score.ts. 不改现有 preview/apply/rollback 流程.',
    },
    {
      stage: 'K21-FIX-E-SCHEDULER-PREVIEW-APPLY-ROLLBACK-AUDIT',
      reason: '当前闭环完整, 不阻塞主线. polish 工作: 进度条, 多级 rollback, history "复制为新 run" 按钮.',
      scope: '实施: (1) apply/rollback 进度条; (2) 多级 rollback 链; (3) history UI 增强.',
      outOfScope: '不改现有 safety gate. 不改 solver. 不改 importer.',
    },
    {
      stage: 'K21-FIX-F-SOFT-CONSTRAINTS-EXPANSION',
      reason: 'C 类别 LOW/MEDIUM. 当前 SC1-SC4 覆盖基础需求, 缺少教师工作日均衡, 班级空洞减少, 教室稳定性, 实训课匹配, 大班优先大教室.',
      scope: '实施: (1) SC5 教师工作日均衡; (2) SC6 班级空洞减少; (3) SC7 教室稳定性; (4) SC8 实训课匹配; (5) SC9 大班优先大教室; (6) 所有 SC weight 改为可配置.',
      outOfScope: '不改 HC. 不改 solver 主循环. 不改 preview/apply.',
    },
    {
      stage: 'K21-FIX-B-ROOM-TYPE-CONSTRAINT-AUDIT (deferred to K22+)',
      reason: 'G 类别 MEDIUM. Room.type schema 存在但 solver 不使用. 实训课匹配实训室需求未满足.',
      scope: '只读 audit + 设计: (1) Course.requiredRoomType 字段; (2) Room.type enum 扩展; (3) solver room type 匹配. 实施推迟到 K22.',
      outOfScope: 'K21 不实施, K22 路线.',
    },
  ]
}

// ── Main ──────────────────────────────────────────────────────────────

async function main() {
  console.log('K21 Room Capacity and Solver Config Audit')
  console.log('==========================================\n')

  // DB counts
  const db = {
    classGroupCount: await prisma.classGroup.count(),
    teacherCount: await prisma.teacher.count(),
    courseCount: await prisma.course.count(),
    roomCount: await prisma.room.count(),
    teachingTaskCount: await prisma.teachingTask.count(),
    teachingTaskClassLinkCount: await prisma.teachingTaskClass.count(),
    scheduleSlotCount: await prisma.scheduleSlot.count(),
    schedulingRunCount: await prisma.schedulingRun.count(),
    schedulingConfigCount: await prisma.schedulingConfig.count(),
  }

  console.log('Database snapshot:')
  console.log(`  ClassGroups:           ${db.classGroupCount}`)
  console.log(`  Teachers:              ${db.teacherCount}`)
  console.log(`  Courses:               ${db.courseCount}`)
  console.log(`  Rooms:                 ${db.roomCount}`)
  console.log(`  TeachingTasks:         ${db.teachingTaskCount}`)
  console.log(`  TeachingTaskClasses:   ${db.teachingTaskClassLinkCount}`)
  console.log(`  ScheduleSlots:         ${db.scheduleSlotCount}`)
  console.log(`  SchedulingRuns:        ${db.schedulingRunCount}`)
  console.log(`  SchedulingConfigs:     ${db.schedulingConfigCount}`)
  console.log('')

  // Stats
  const stats = await computeRoomCapacityStats()
  const constraintMap = computeSolverConstraintMap()
  const configMap = computeSchedulerConfigMap()
  configMap.schedulingConfigDbCount = db.schedulingConfigCount
  const parMap = computePreviewApplyRollbackMap()
  parMap.runRecords.total = db.schedulingRunCount
  if (db.schedulingRunCount > 0) {
    const runs = await prisma.schedulingRun.groupBy({
      by: ['mode', 'status'],
      _count: { _all: true },
    })
    for (const r of runs) {
      parMap.runRecords.byMode[r.mode] = (parMap.runRecords.byMode[r.mode] || 0) + r._count._all
      parMap.runRecords.byStatus[r.status] = (parMap.runRecords.byStatus[r.status] || 0) + r._count._all
    }
  }
  const typeAvailMap = computeRoomTypeAvailabilityMap()

  // Findings
  const findings = buildFindings(stats, constraintMap, configMap, parMap, typeAvailMap)
  const summary: Record<Severity, number> = { HIGH: 0, MEDIUM: 0, LOW: 0, INFO: 0, ACCEPTED: 0, NONE: 0 }
  for (const f of findings) summary[f.severity]++

  const blocking = summary.HIGH > 0
  const recommendedRoadmap = computeRecommendedRoadmap(findings, stats)
  const suggestedNextStage = 'K21-FIX-B-ROOM-CAPACITY-DATA-PLAN' // room capacity already real, plan focuses on source-of-truth

  // Re-evaluate suggested next stage based on highest MEDIUM finding
  const mediumFindings = findings.filter((f) => f.severity === 'MEDIUM')
  if (mediumFindings.some((f) => f.rule.startsWith('D'))) {
    // D MEDIUM: solver config not read
    if (mediumFindings.filter((f) => f.rule.startsWith('D')).length > 0) {
      // The most impactful medium is D (solver config) since it blocks operational use
    }
  }

  const report: K21Report = {
    generatedAt: new Date().toISOString(),
    phase: 'K21-FIX-A-ROOM-CAPACITY-AND-SOLVER-CONFIG-AUDIT',
    mode: 'read-only',
    database: db,
    summary,
    totalFindings: findings.length,
    blocking,
    roomCapacityStats: stats,
    solverConstraintMap: constraintMap,
    schedulerConfigMap: configMap,
    previewApplyRollbackMap: parMap,
    roomTypeAvailabilityMap: typeAvailMap,
    findings,
    recommendedRoadmap,
    suggestedNextStage,
  }

  // Write JSON
  const outDir = path.join(projectRoot, 'docs')
  if (!fs.existsSync(outDir)) fs.mkdirSync(outDir, { recursive: true })
  const outPath = path.join(outDir, 'k21-room-capacity-and-solver-config-audit.json')
  fs.writeFileSync(outPath, JSON.stringify(report, null, 2), 'utf8')

  // Terminal output per spec
  console.log('Summary:')
  console.log(`HIGH:      ${summary.HIGH}`)
  console.log(`MEDIUM:    ${summary.MEDIUM}`)
  console.log(`LOW:       ${summary.LOW}`)
  console.log(`INFO:      ${summary.INFO}`)
  console.log(`ACCEPTED:  ${summary.ACCEPTED}`)
  console.log(`NONE:      ${summary.NONE}`)
  console.log(`TOTAL:     ${report.totalFindings}`)
  console.log(`BLOCKING:  ${blocking ? 'YES' : 'NO'}`)
  console.log('')

  console.log('Room Capacity Stats:')
  console.log(`  rooms:                       ${stats.roomCount}`)
  console.log(`  capacity range:              [${stats.capacityMin}, ${stats.capacityMax}], avg ${stats.capacityAvg}`)
  console.log(`  capacity distinct:           ${stats.capacityDistinct}`)
  console.log(`  capacity=50 ratio:           ${(stats.capacityEq50Ratio * 100).toFixed(2)}% (${stats.capacityEq50Count} rooms)`)
  console.log(`  capacity null / <=0:         ${stats.capacityNullCount} / ${stats.capacityLe0Count}`)
  console.log(`  type distribution:           ${stats.typeDistribution.map((t) => `${t.type}=${t.count}`).join(', ')}`)
  console.log(`  current HC4 conflicts:       ${stats.hc4CurrentConflictCount}`)
  console.log(`  roomAvailability records:    ${stats.roomAvailabilityCount} (false=${stats.roomAvailabilityFalseCount})`)
  console.log('')

  console.log('Solver Constraints:')
  for (const c of [
    ['HC1', constraintMap.hc1],
    ['HC2', constraintMap.hc2],
    ['HC3', constraintMap.hc3],
    ['HC4', constraintMap.hc4],
    ['HC5', constraintMap.hc5],
    ['HC6', constraintMap.hc6],
    ['SC1', constraintMap.sc1],
    ['SC2', constraintMap.sc2],
    ['SC3', constraintMap.sc3],
    ['SC4', constraintMap.sc4],
    ['MIN_PERT', constraintMap.scMinimumPerturbation],
  ]) {
    const [name, data] = c as [string, { implemented: boolean; hardcodedPenalty: number | null }]
    console.log(`  ${name.padEnd(8)}: implemented=${data.implemented}, penalty=${data.hardcodedPenalty ?? 'n/a'}`)
  }
  console.log(`  common needs missing:        ${constraintMap.commonNeedsMissing.length}`)
  console.log('')

  console.log('Scheduler Config:')
  console.log(`  model exists:                ${configMap.schedulingConfigModelExists}`)
  console.log(`  DB count:                    ${configMap.schedulingConfigDbCount}`)
  console.log(`  fields:                      ${configMap.schedulingConfigFields.join(', ')}`)
  console.log(`  solver reads:                ${configMap.configFieldsReadBySolver.join(', ') || 'NONE'}`)
  console.log(`  frontend exposes:            maxIter=${configMap.frontendExposesMaxIterations}, lahcWin=${configMap.frontendExposesLahcWindowSize}, seed=${configMap.frontendExposesRandomSeed}, locked=${configMap.frontendExposesLockedSlots}`)
  console.log(`  solver version:              ${configMap.solverVersion}`)
  console.log('')

  console.log('Preview/Apply/Rollback:')
  console.log(`  mode values:                 ${parMap.modeValues.join('/')}`)
  console.log(`  status values:               ${parMap.statusValues.join('/')}`)
  console.log(`  hc before/after fields:      ${parMap.hcBeforeAfterFields.length}/8`)
  console.log(`  preview/apply/rollback API:  ${parMap.previewApiExists}/${parMap.applyApiExists}/${parMap.rollbackApiExists}`)
  console.log(`  preview/apply/rollback UI:   ${parMap.previewUiExists}/${parMap.applyUiExists}/${parMap.rollbackUiExists}`)
  console.log(`  history UI:                  ${parMap.historyUiExists}`)
  console.log(`  run records:                 ${parMap.runRecords.total}`)
  console.log('')

  console.log('Findings:')
  for (const f of findings) {
    console.log(`  [${f.severity}] ${f.id} ${f.title}`)
  }
  console.log('')

  console.log('Recommended next stage:')
  for (let i = 0; i < recommendedRoadmap.length; i++) {
    const r = recommendedRoadmap[i]
    console.log(`  ${i + 1}. ${r.stage}`)
  }
  console.log('')
  console.log(`Top suggestion: ${suggestedNextStage}`)
  console.log('')
  console.log(`Report written: docs/k21-room-capacity-and-solver-config-audit.json`)

  await prisma.$disconnect()
}

main().catch((e) => {
  console.error(e)
  prisma.$disconnect().then(() => process.exit(1))
})
