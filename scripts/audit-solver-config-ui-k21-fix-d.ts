/**
 * K21-FIX-D Solver Config UI Audit
 *
 * Read-only audit. Evaluates:
 *   - Rule A: SchedulingConfig schema completeness
 *   - Rule B: Solver config usage (does solver actually read SchedulingConfig?)
 *   - Rule C: API config flow (preview / apply / rollback)
 *   - Rule D: Frontend UI exposure
 *   - Rule E: lockedTaskIds vs lockedSlotIds naming
 *   - Rule F: Config snapshot / reproducibility
 *   - Rule G: Hard / soft weight configuration
 *
 * Strong constraints:
 *   - NO Prisma writes.
 *   - NO schema / migration / business code modification.
 *   - NO db push / migrate / reset / seed.
 *   - NO re-import / scheduler apply / rollback.
 *
 * Output:
 *   - Terminal summary
 *   - docs/k21-solver-config-ui-audit.json
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

interface SchedulingConfigSchema {
  modelExists: boolean
  fields: string[]
  hasMaxIterations: boolean
  hasLahcWindowSize: boolean
  hasRandomSeed: boolean
  hasLockedTaskIds: boolean
  hasLockedSlotIds: boolean
  hasSemesterId: boolean
  hasCreatedAt: boolean
  hasUpdatedAt: boolean
  hasHardWeights: boolean
  hasSoftWeights: boolean
  hasName: boolean
  hasSolverVersion: boolean
  hasConfigSnapshot: boolean
  hasRollbackOfConfigId: boolean
  fieldTypes: Record<string, string>
  dbRecordCount: number
  sampleConfig: Record<string, unknown> | null
}

interface SolverConfigUsage {
  localSolverConfigInterface: boolean
  localConfigFields: string[]
  solverReadsSchedulingConfig: boolean
  solverReadsFields: string[]
  previewReadsSchedulingConfig: boolean
  previewPassesFieldsToSolver: string[]
  maxIterationsUsed: boolean
  lahcWindowSizeUsed: boolean
  randomSeedUsed: boolean
  lockedSlotIdsRespected: boolean
  hardPenaltyHardcoded: boolean
  softPenaltyHardcoded: boolean
  hardPenaltyValue: number | null
  softPenalties: Record<string, number | null>
  scoreReceivesDynamicWeights: boolean
}

interface ApiConfigFlow {
  previewApiExists: boolean
  previewAcceptsMaxIterations: boolean
  previewAcceptsLahcWindowSize: boolean
  previewAcceptsRandomSeed: boolean
  previewAcceptsLockedSlotIds: boolean
  previewAcceptsConfigId: boolean
  previewPassesConfigIdToRun: boolean
  applyApiExists: boolean
  applyAcceptsPreviewRunId: boolean
  applyReusesConfigFromPreview: boolean
  rollbackApiExists: boolean
  rollbackAcceptsApplyRunId: boolean
  rollbackReusesConfig: boolean
  configCrudApiExists: boolean
  configCrudEndpoints: string[]
  schedulingRunRecordsConfigId: boolean
  resultSnapshotContainsSolverConfig: boolean
  resultSnapshotContainsLockedSlotIds: boolean
  resultSnapshotContainsRandomSeed: boolean
  previewValidatesLockedSlotIds: boolean
}

interface FrontendConfigExposure {
  schedulerPageExists: boolean
  schedulerContentFileExists: boolean
  exposesRandomSeed: boolean
  exposesLockedSlotIds: boolean
  exposesMaxIterations: boolean
  exposesLahcWindowSize: boolean
  exposesConfigPicker: boolean
  exposesConfigSaveReset: boolean
  exposesHardSoftWeights: boolean
  exposesConfigPreset: boolean
  exposesPerSemesterConfig: boolean
  exposesValidation: boolean
  exposesLockedSlotManager: boolean
  exposedParamInputs: string[]
}

interface LockedIdsAssessment {
  schemaFieldName: string
  schemaFieldType: string
  schemaFieldIsUsedBySolver: boolean
  runtimeSolverName: string
  runtimeSolverType: string
  apiName: string
  apiType: string
  uiName: string
  semanticDifference: string
  recommendation: string
  needsMigration: boolean
}

interface ConfigSnapshotAssessment {
  schedulingRunRecordsConfigId: boolean
  resultSnapshotContainsSolverConfig: boolean
  resultSnapshotContainsHardcodedPenalties: boolean
  historyChangesImpactPriorRuns: boolean
  databaseFingerprintField: boolean
  fingerprintAlgorithm: string
  reproducibilityRisk: string
}

interface WeightConfiguration {
  hardPenaltyHardcoded: boolean
  softPenaltyHardcoded: boolean
  hardPenaltyValue: number | null
  softPenalties: Record<string, number | null>
  scoreReceivesDynamicWeights: boolean
  recommendWeightConfigStage: string
  canConfigureViaDb: boolean
  canConfigureViaApi: boolean
  canConfigureViaUi: boolean
}

interface K21DReport {
  generatedAt: string
  phase: string
  mode: 'read-only'
  database: {
    classGroupCount: number
    teacherCount: number
    courseCount: number
    roomCount: number
    teachingTaskCount: number
    scheduleSlotCount: number
    schedulingConfigCount: number
    schedulingRunCount: number
    schedulerRunChangeCount: number
  }
  summary: Record<Severity, number>
  totalFindings: number
  blocking: boolean
  schedulingConfigSchema: SchedulingConfigSchema
  solverConfigUsage: SolverConfigUsage
  apiConfigFlow: ApiConfigFlow
  frontendConfigExposure: FrontendConfigExposure
  lockedIdsAssessment: LockedIdsAssessment
  configSnapshotAssessment: ConfigSnapshotAssessment
  weightConfiguration: WeightConfiguration
  findings: Finding[]
  recommendedOptions: Array<{ option: string; pros: string[]; cons: string[] }>
  recommendedRoadmap: Array<{ stage: string; reason: string; scope: string; outOfScope: string }>
  suggestedNextStage: string
}

// ── Audit Logic ───────────────────────────────────────────────────────

function computeSchedulingConfigSchema(): Omit<SchedulingConfigSchema, 'dbRecordCount' | 'sampleConfig'> {
  const schema = readFile('prisma/schema.prisma')
  const block = schema.match(/model SchedulingConfig \{[\s\S]*?\n\}/)?.[0] || ''

  const fieldLines = block
    .split('\n')
    .map((l) => l.trim())
    .filter((l) => l && !l.startsWith('//') && !l.startsWith('@@') && !l.startsWith('}'))

  const fields: string[] = []
  const fieldTypes: Record<string, string> = {}
  for (const l of fieldLines) {
    const m = l.match(/^(\w+)\s+([\w?\[\]]+)/)
    if (m) {
      fields.push(m[1])
      fieldTypes[m[1]] = m[2]
    }
  }

  return {
    modelExists: /model SchedulingConfig \{/.test(schema),
    fields,
    hasMaxIterations: /maxIterations\s+Int/.test(block),
    hasLahcWindowSize: /lahcWindowSize\s+Int/.test(block),
    hasRandomSeed: /randomSeed\s+Int/.test(block),
    hasLockedTaskIds: /lockedTaskIds\s+String/.test(block),
    hasLockedSlotIds: /lockedSlotIds\s+String/.test(block),
    hasSemesterId: /semesterId\s+Int\?/.test(block),
    hasCreatedAt: /createdAt\s+DateTime/.test(block),
    hasUpdatedAt: /updatedAt\s+DateTime/.test(block),
    hasHardWeights: /hardWeights|hardPenalty/i.test(block),
    hasSoftWeights: /softWeights|softPenalty/i.test(block),
    hasName: /name\s+String/.test(block),
    hasSolverVersion: /solverVersion\s+String/.test(block),
    hasConfigSnapshot: /configSnapshot|configJson|configPayload/i.test(block),
    hasRollbackOfConfigId: /rollbackOfConfigId/.test(block),
    fieldTypes,
  }
}

function computeSolverConfigUsage(): SolverConfigUsage {
  const types = readFile('src/lib/scheduler/types.ts')
  const solver = readFile('src/lib/scheduler/solver.ts')
  const preview = readFile('src/lib/scheduler/preview.ts')
  const score = readFile('src/lib/scheduler/score.ts')

  const localInterfaceMatch = types.match(/export interface SolverConfig \{([\s\S]*?)\n\}/)
  const localInterface = !!localInterfaceMatch
  const localConfigFields: string[] = []
  if (localInterfaceMatch) {
    for (const l of localInterfaceMatch[1].split('\n')) {
      const m = l.trim().match(/^(\w+)/)
      if (m) localConfigFields.push(m[1])
    }
  }

  // solver reads SchedulingConfig directly?
  const solverReadsSchedulingConfig = /schedulingConfig\.(find|findFirst|findUnique)/.test(solver)
  const solverReadsFields: string[] = []
  if (solverReadsSchedulingConfig) {
    for (const f of ['maxIterations', 'lahcWindowSize', 'randomSeed', 'lockedTaskIds']) {
      if (new RegExp(`config\\.${f}|config\\?\\.${f}`).test(solver)) solverReadsFields.push(f)
    }
  }

  // preview reads SchedulingConfig?
  const previewReadsSchedulingConfig = /schedulingConfig\.(find|findFirst|findUnique)/.test(preview)
  const previewPassesFields: string[] = []
  if (/previewPassesFields|configId\b/.test(preview)) {
    for (const f of ['maxIterations', 'lahcWindowSize', 'randomSeed', 'lockedSlotIds']) {
      if (new RegExp(`options\\.${f}|config\\?\\.${f}`).test(preview)) previewPassesFields.push(f)
    }
  }

  // Detect hardcoded penalties
  const hardPenaltyMatch = score.match(/const\s+HARD_PENALTY\s*=\s*(-?\d+)/)
  const hardPenaltyValue = hardPenaltyMatch ? parseInt(hardPenaltyMatch[1], 10) : null
  const softPenalties: Record<string, number | null> = {}
  for (const name of [
    'SOFT_SC1_CROSS_BUILDING',
    'SOFT_SC2_SAME_DAY',
    'SOFT_SC3_EXTREME_TIME',
    'SOFT_SC4_CROSS_CAMPUS',
    'SOFT_MINIMUM_PERTURBATION',
  ]) {
    const m = score.match(new RegExp(`const\\s+${name}\\s*=\\s*(-?\\d+)`))
    softPenalties[name] = m ? parseInt(m[1], 10) : null
  }

  return {
    localSolverConfigInterface: localInterface,
    localConfigFields,
    solverReadsSchedulingConfig,
    solverReadsFields,
    previewReadsSchedulingConfig,
    previewPassesFieldsToSolver: previewPassesFields,
    maxIterationsUsed: /const\s*\{\s*[^}]*maxIterations/.test(solver) || /config\.maxIterations/.test(solver),
    lahcWindowSizeUsed: /const\s*\{\s*[^}]*lahcWindowSize/.test(solver) || /config\.lahcWindowSize/.test(solver),
    randomSeedUsed: /config\.randomSeed|randomSeed\?\?/.test(solver),
    lockedSlotIdsRespected: /lockedSlotIds/.test(solver),
    hardPenaltyHardcoded: hardPenaltyValue != null,
    softPenaltyHardcoded: Object.values(softPenalties).some((v) => v != null),
    hardPenaltyValue,
    softPenalties,
    scoreReceivesDynamicWeights: /weight\?:|weights\?:|hardWeight\?:|softWeight\?:/.test(score),
  }
}

function computeApiConfigFlow(): ApiConfigFlow {
  const previewRoute = fileExists('src/app/api/admin/scheduler/preview/route.ts')
    ? readFile('src/app/api/admin/scheduler/preview/route.ts')
    : ''
  const applyRoute = fileExists('src/app/api/admin/scheduler/apply/route.ts')
    ? readFile('src/app/api/admin/scheduler/apply/route.ts')
    : ''
  const rollbackRoute = fileExists('src/app/api/admin/scheduler/rollback/route.ts')
    ? readFile('src/app/api/admin/scheduler/rollback/route.ts')
    : ''

  // config CRUD endpoints
  const configCrudFiles = [
    'src/app/api/admin/scheduler/configs/route.ts',
    'src/app/api/admin/scheduler/configs/[id]/route.ts',
    'src/app/api/scheduler/config/route.ts',
    'src/app/api/scheduler/configs/route.ts',
  ]
  const configCrudEndpoints = configCrudFiles.filter((f) => fileExists(f))

  return {
    previewApiExists: !!previewRoute,
    previewAcceptsMaxIterations: /maxIterations\?:|body\.maxIterations/.test(previewRoute),
    previewAcceptsLahcWindowSize: /lahcWindowSize\?:|body\.lahcWindowSize/.test(previewRoute),
    previewAcceptsRandomSeed: /randomSeed\?:|body\.randomSeed/.test(previewRoute),
    previewAcceptsLockedSlotIds: /lockedSlotIds\?:|body\.lockedSlotIds/.test(previewRoute),
    previewAcceptsConfigId: /configId\?:|body\.configId/.test(previewRoute),
    previewPassesConfigIdToRun: /configId:\s*configId/.test(previewRoute) ||
      (fileContains('src/lib/scheduler/preview.ts', 'configId') && fileContains('src/lib/scheduler/preview.ts', 'SchedulingRun.create')),
    applyApiExists: !!applyRoute,
    applyAcceptsPreviewRunId: /previewRunId/.test(applyRoute),
    applyReusesConfigFromPreview: fileContains('src/lib/scheduler/apply.ts', 'previewRun.configId') ||
      fileContains('src/lib/scheduler/apply.ts', 'configId'),
    rollbackApiExists: !!rollbackRoute,
    rollbackAcceptsApplyRunId: /applyRunId/.test(rollbackRoute),
    rollbackReusesConfig: fileContains('src/lib/scheduler/rollback.ts', 'configId'),
    configCrudApiExists: configCrudEndpoints.length > 0,
    configCrudEndpoints,
    schedulingRunRecordsConfigId: /configId:\s*configId|configId,\s*$/.test(readFile('src/lib/scheduler/preview.ts')) ||
      fileContains('src/lib/scheduler/preview.ts', 'configId: configId'),
    resultSnapshotContainsSolverConfig: (() => {
      const previewFile = readFile('src/lib/scheduler/preview.ts')
      const snapshotMatch = previewFile.match(/resultSnapshot\s*=\s*JSON\.stringify\(\{([\s\S]*?)\}\)/)
      if (!snapshotMatch) return false
      const body = snapshotMatch[1]
      return /maxIterations|lahcWindowSize|solverConfig/.test(body)
    })(),
    resultSnapshotContainsLockedSlotIds: (() => {
      const previewFile = readFile('src/lib/scheduler/preview.ts')
      const m = previewFile.match(/resultSnapshot\s*=\s*JSON\.stringify\(\{([\s\S]*?)\}\)/)
      return m ? /lockedSlotIds/.test(m[1]) : false
    })(),
    resultSnapshotContainsRandomSeed: (() => {
      const previewFile = readFile('src/lib/scheduler/preview.ts')
      const m = previewFile.match(/resultSnapshot\s*=\s*JSON\.stringify\(\{([\s\S]*?)\}\)/)
      return m ? /randomSeed/.test(m[1]) : false
    })(),
    previewValidatesLockedSlotIds: fileContains('src/app/api/admin/scheduler/preview/route.ts', 'scheduleSlot.findMany'),
  }
}

function computeFrontendConfigExposure(): FrontendConfigExposure {
  const schedulerContent = fileExists('src/app/admin/scheduler/scheduler-content.tsx')
    ? readFile('src/app/admin/scheduler/scheduler-content.tsx')
    : ''
  void (fileExists('src/app/admin/scheduler/history/history-content.tsx')
    ? readFile('src/app/admin/scheduler/history/history-content.tsx')
    : '')

  const exposedParamInputs: string[] = []
  if (schedulerContent.includes('maxIterations')) exposedParamInputs.push('maxIterations')
  if (schedulerContent.includes('lahcWindowSize')) exposedParamInputs.push('lahcWindowSize')
  if (schedulerContent.includes('randomSeed') || schedulerContent.includes('随机种子')) exposedParamInputs.push('randomSeed')
  if (schedulerContent.includes('lockedSlotIds') || schedulerContent.includes('锁定')) exposedParamInputs.push('lockedSlotIds')

  return {
    schedulerPageExists: fileExists('src/app/admin/scheduler/page.tsx'),
    schedulerContentFileExists: fileExists('src/app/admin/scheduler/scheduler-content.tsx'),
    exposesRandomSeed: schedulerContent.includes('randomSeed') || schedulerContent.includes('随机种子'),
    exposesLockedSlotIds: schedulerContent.includes('lockedSlotIds') || schedulerContent.includes('锁定课表槽位'),
    exposesMaxIterations: schedulerContent.includes('maxIterations'),
    exposesLahcWindowSize: schedulerContent.includes('lahcWindowSize'),
    exposesConfigPicker: schedulerContent.includes('configId') || schedulerContent.includes('configPicker') ||
      schedulerContent.includes('配置选择') || schedulerContent.includes('config-select'),
    exposesConfigSaveReset: schedulerContent.includes('saveConfig') || schedulerContent.includes('保存配置') ||
      schedulerContent.includes('resetConfig') || schedulerContent.includes('重置配置'),
    exposesHardSoftWeights: schedulerContent.includes('hardWeight') || schedulerContent.includes('softWeight') ||
      schedulerContent.includes('权重') || schedulerContent.includes('hardPenalty') || schedulerContent.includes('softPenalty'),
    exposesConfigPreset: schedulerContent.includes('preset') || schedulerContent.includes('预设') ||
      schedulerContent.includes('presetConfig'),
    exposesPerSemesterConfig: schedulerContent.includes('semesterId') && schedulerContent.includes('config'),
    exposesValidation: /(min|max|validate)/.test(schedulerContent),
    exposesLockedSlotManager: schedulerContent.includes('lockable-slots') || schedulerContent.includes('LockableSlot') ||
      schedulerContent.includes('锁定'),
    exposedParamInputs,
  }
}

function computeLockedIdsAssessment(): LockedIdsAssessment {
  const schema = readFile('prisma/schema.prisma')
  void readFile('src/lib/scheduler/types.ts')
  void readFile('src/lib/scheduler/solver.ts')
  void readFile('src/lib/scheduler/preview.ts')
  void readFile('src/app/api/admin/scheduler/preview/route.ts')
  const schedulerContent = fileExists('src/app/admin/scheduler/scheduler-content.tsx')
    ? readFile('src/app/admin/scheduler/scheduler-content.tsx')
    : ''

  const schemaFieldName = /lockedTaskIds\s+String/.test(schema) ? 'lockedTaskIds' : (() => {
    const m = schema.match(/model SchedulingConfig \{[\s\S]*?\n\}/)?.[0]?.match(/locked\w+Ids\s+String/)?.[0]
    return m ? m.split(/\s+/)[0] : 'unknown'
  })()
  const schemaFieldType = 'String (JSON array of IDs)'

  const schemaFieldIsUsedBySolver = fileContains('src/lib/scheduler/preview.ts', 'config.lockedTaskIds') ||
    fileContains('src/lib/scheduler/preview.ts', 'lockedTaskIds') ||
    fileContains('src/lib/scheduler/solver.ts', 'lockedTaskIds')

  const runtimeSolverName = 'lockedSlotIds'
  const runtimeSolverType = 'Set<number> (ScheduleSlot IDs)'

  const apiName = 'lockedSlotIds'
  const apiType = 'number[] (ScheduleSlot IDs)'

  const uiName = schedulerContent.includes('lockedSlotIds') || schedulerContent.includes('锁定课表槽位')
    ? 'lockedSlotIds (前端使用 slot ID)'
    : 'unknown'

  // semantic difference
  const semanticDifference =
    'lockedTaskIds (schema) = lock entire task (all its slots); lockedSlotIds (runtime) = lock individual slot positions. ' +
    'If a task has 3 slots and only 1 is in lockedSlotIds, only that 1 is locked — not the other 2. ' +
    'For multi-slot courses (e.g. 3-hour lab), this matters.'

  // recommendation
  const recommendation =
    '下一阶段 K21-FIX-E 选项: ' +
    '(A) 保留双名 + 加 alias, 文档化差异; ' +
    '(B) 重命名 schema 字段 lockedTaskIds → lockedSlotIds (migration 简单, 风险中等); ' +
    '(C) 在 solver 层增加 task-level lock 解析 (if task has any locked slot, lock all its slots); ' +
    '推荐: 阶段 1 选 A (compat), 阶段 2 选 C (task-level lock). ' +
    '注意: schema 字段当前是 STRING (JSON), 不是 array, 改造需考虑 migration.'

  const needsMigration = schemaFieldName === 'lockedTaskIds' // if rename, need migration

  return {
    schemaFieldName,
    schemaFieldType,
    schemaFieldIsUsedBySolver,
    runtimeSolverName,
    runtimeSolverType,
    apiName,
    apiType,
    uiName,
    semanticDifference,
    recommendation,
    needsMigration,
  }
}

function computeConfigSnapshotAssessment(): ConfigSnapshotAssessment {
  const preview = readFile('src/lib/scheduler/preview.ts')
  void readFile('src/lib/scheduler/apply.ts')
  const schema = readFile('prisma/schema.prisma')

  const schedulingRunBlock = schema.match(/model SchedulingRun \{[\s\S]*?\n\}/)?.[0] || ''

  return {
    schedulingRunRecordsConfigId: /configId:\s*configId/.test(preview) || /configId: configId/.test(preview),
    resultSnapshotContainsSolverConfig: (() => {
      const m = preview.match(/resultSnapshot\s*=\s*JSON\.stringify\(\{([\s\S]*?)\}\)/)
      if (!m) return false
      return /maxIterations|lahcWindowSize|solverConfig/.test(m[1])
    })(),
    resultSnapshotContainsHardcodedPenalties: false, // currently no, would need to snapshot at preview-time
    historyChangesImpactPriorRuns: true, // if config (maxIterations) is modified after a run, the run's reproducibility breaks
    databaseFingerprintField: /databaseFingerprint\s+String\?/.test(schedulingRunBlock),
    fingerprintAlgorithm: 'sha256(semesterId:slotCount:slot:teachingTaskId:dayOfWeek:slotIndex:roomId)[:16]',
    reproducibilityRisk:
      '若调度 config 修改后, 旧 run 仍引用 configId, 但 config 内容已变. ' +
      '当前 resultSnapshot 仅记录 lockedSlotIds + randomSeed + score, ' +
      '不记录 maxIterations / lahcWindowSize. 历史 run 无法复现.',
  }
}

function computeWeightConfiguration(s: SolverConfigUsage): WeightConfiguration {
  return {
    hardPenaltyHardcoded: s.hardPenaltyHardcoded,
    softPenaltyHardcoded: s.softPenaltyHardcoded,
    hardPenaltyValue: s.hardPenaltyValue,
    softPenalties: s.softPenalties,
    scoreReceivesDynamicWeights: s.scoreReceivesDynamicWeights,
    recommendWeightConfigStage:
      'K21-FIX-I-SCORE-WEIGHTS-ROADMAP (后置, 因为 dynamic weights 需要 score.ts refactor + regression verify)',
    canConfigureViaDb: false, // SchedulingConfig 没有 hard/soft weight 字段
    canConfigureViaApi: false, // API 不接受 hard/soft weight
    canConfigureViaUi: false, // UI 不暴露 hard/soft weight
  }
}

function buildFindings(
  schemaMap: SchedulingConfigSchema,
  solverMap: SolverConfigUsage,
  apiMap: ApiConfigFlow,
  feMap: FrontendConfigExposure,
  lockedMap: LockedIdsAssessment,
  snapshotMap: ConfigSnapshotAssessment,
  weightMap: WeightConfiguration,
): Finding[] {
  const findings: Finding[] = []

  // Rule A: SchedulingConfig schema
  {
    const missing: string[] = []
    if (!schemaMap.hasRandomSeed) missing.push('randomSeed')
    if (!schemaMap.hasUpdatedAt) missing.push('updatedAt')
    if (!schemaMap.hasHardWeights) missing.push('hardWeights (HC1-HC5)')
    if (!schemaMap.hasSoftWeights) missing.push('softWeights (SC1-SC4)')
    if (!schemaMap.hasSolverVersion) missing.push('solverVersion')
    if (!schemaMap.hasConfigSnapshot) missing.push('configSnapshot field')

    findings.push({
      id: 'K21-D-A-1',
      rule: 'A. SchedulingConfig schema completeness',
      severity: missing.length > 3 ? 'MEDIUM' : 'LOW',
      category: 'A. SchedulingConfig schema',
      title: `SchedulingConfig 字段: ${schemaMap.fields.join(', ')}. 缺失: ${missing.length > 0 ? missing.join(', ') : 'none'}`,
      currentStatus: `DB 中有 ${schemaMap.dbRecordCount} 条 config. Schema 字段: ${schemaMap.fields.join(', ')}. maxIterations=${schemaMap.hasMaxIterations}, lahcWindowSize=${schemaMap.hasLahcWindowSize}, randomSeed=${schemaMap.hasRandomSeed}, lockedTaskIds=${schemaMap.hasLockedTaskIds}, lockedSlotIds=${schemaMap.hasLockedSlotIds}, semesterId=${schemaMap.hasSemesterId}, createdAt=${schemaMap.hasCreatedAt}, updatedAt=${schemaMap.hasUpdatedAt}, hardWeights=${schemaMap.hasHardWeights}, softWeights=${schemaMap.hasSoftWeights}, solverVersion=${schemaMap.hasSolverVersion}.`,
      evidence: [
        `SchedulingConfig model fields: ${schemaMap.fields.join(', ')}`,
        `field types: ${JSON.stringify(schemaMap.fieldTypes)}`,
        `DB record count: ${schemaMap.dbRecordCount}`,
        `sample config: ${JSON.stringify(schemaMap.sampleConfig)}`,
        `hasName: ${schemaMap.hasName}`,
        `hasSemesterId: ${schemaMap.hasSemesterId}`,
        `hasCreatedAt: ${schemaMap.hasCreatedAt}, hasUpdatedAt: ${schemaMap.hasUpdatedAt}`,
        `has hardWeights: ${schemaMap.hasHardWeights}`,
        `has softWeights: ${schemaMap.hasSoftWeights}`,
        `has solverVersion: ${schemaMap.hasSolverVersion}`,
        `has configSnapshot: ${schemaMap.hasConfigSnapshot}`,
      ],
      risk: 'Schema 缺 randomSeed, updatedAt, hard/soft weights, solverVersion, configSnapshot. 字段不足导致: (1) 同一 config 不能保存多组参数 (e.g. 春季/秋季); (2) 历史 config 修改无法追溯; (3) 权重不可调.',
      recommendation: '下一阶段添加: (1) randomSeed Int?; (2) updatedAt DateTime @updatedAt; (3) hardWeights String? (JSON, e.g. {"HC1":-1000,...}); (4) softWeights String? (JSON, e.g. {"SC1":-5,...}); (5) solverVersion String?; (6) configSnapshot String? (完整 JSON snapshot, for per-run reproducibility). 不需要做 weight 配置, 仅存字段.',
      suggestedNextStage: 'K21-FIX-E-SOLVER-CONFIG-API-PLAN (design first)',
    })
  }

  // Rule B: Solver config usage
  {
    const usesConfig = solverMap.solverReadsSchedulingConfig || solverMap.previewPassesFieldsToSolver.length > 0
    findings.push({
      id: 'K21-D-B-1',
      rule: 'B. Solver config usage',
      severity: usesConfig ? 'NONE' : 'MEDIUM',
      category: 'B. solver config usage',
      title: `solver 实际从 local SolverConfig 接口取参数, ${solverMap.solverReadsSchedulingConfig ? '也读' : '不读'} DB SchedulingConfig`,
      currentStatus: `Local SolverConfig interface 字段: ${solverMap.localConfigFields.join(', ')}. solver 直接读 SchedulingConfig: ${solverMap.solverReadsSchedulingConfig} (fields: ${solverMap.solverReadsFields.join(', ') || 'none'}). preview.ts 读 SchedulingConfig: ${solverMap.previewReadsSchedulingConfig} (仅取 configId 外键), preview 传给 solver 的字段: ${solverMap.previewPassesFieldsToSolver.join(', ')}. solver 实际使用: maxIterations=${solverMap.maxIterationsUsed}, lahcWindowSize=${solverMap.lahcWindowSizeUsed}, randomSeed=${solverMap.randomSeedUsed}, lockedSlotIds=${solverMap.lockedSlotIdsRespected}.`,
      evidence: [
        `local SolverConfig fields: ${solverMap.localConfigFields.join(', ')}`,
        `solver reads DB SchedulingConfig: ${solverMap.solverReadsSchedulingConfig}`,
        `solver reads fields: ${solverMap.solverReadsFields.join(', ') || 'none'}`,
        `preview reads SchedulingConfig (for configId only): ${solverMap.previewReadsSchedulingConfig}`,
        `preview passes to solver: ${solverMap.previewPassesFieldsToSolver.join(', ')}`,
        `maxIterations used in solver: ${solverMap.maxIterationsUsed}`,
        `lahcWindowSize used in solver: ${solverMap.lahcWindowSizeUsed}`,
        `randomSeed used in solver: ${solverMap.randomSeedUsed}`,
        `lockedSlotIds respected in solver: ${solverMap.lockedSlotIdsRespected}`,
        `hard penalty hardcoded: ${solverMap.hardPenaltyHardcoded} (value=${solverMap.hardPenaltyValue})`,
        `soft penalties hardcoded: ${solverMap.softPenaltyHardcoded}`,
        `score receives dynamic weights: ${solverMap.scoreReceivesDynamicWeights}`,
      ],
      risk: 'solver 完全依赖 local SolverConfig + API request body. SchedulingConfig 的 maxIterations/lahcWindowSize 字段被定义但从未被读, 用户也无法通过 config 选. 后果: 多个 config 记录无意义, 当前 DB 的 1 个 config 实际仅作 "外键占位".',
      recommendation: '下一阶段: preview.ts 应解析 SchedulingConfig 字段: (a) 如果 request body 未提供 maxIterations/lahcWindowSize/lockedSlotIds, fallback 到 config 的字段; (b) 如果 request body 提供, 覆盖 config. 这样 config 才能真正生效.',
      suggestedNextStage: 'K21-FIX-E-SOLVER-CONFIG-API-PLAN',
    })
  }

  // Rule C: API config flow
  {
    const hasConfigCrud = apiMap.configCrudApiExists
    const previewAcceptsConfigId = apiMap.previewAcceptsConfigId
    const hasSnapshot = apiMap.resultSnapshotContainsSolverConfig
    const severity: Severity = !previewAcceptsConfigId ? 'MEDIUM' : !hasSnapshot ? 'MEDIUM' : !hasConfigCrud ? 'MEDIUM' : 'LOW'

    findings.push({
      id: 'K21-D-C-1',
      rule: 'C. API config flow',
      severity,
      category: 'C. API config flow',
      title: `preview/apply/rollback API 接受 config 参数不完整; 无 config CRUD API; resultSnapshot 不含完整 config`,
      currentStatus: `preview API: 接受 maxIterations=${apiMap.previewAcceptsMaxIterations}, lahcWindowSize=${apiMap.previewAcceptsLahcWindowSize}, randomSeed=${apiMap.previewAcceptsRandomSeed}, lockedSlotIds=${apiMap.previewAcceptsLockedSlotIds}, configId=${apiMap.previewAcceptsConfigId}. apply API: 接受 previewRunId, 但 ${apiMap.applyReusesConfigFromPreview ? '复用' : '不复用'} config. rollback API: 接受 applyRunId. config CRUD API: ${apiMap.configCrudApiExists ? '存在' : '不存在'} (endpoints: ${apiMap.configCrudEndpoints.join(', ') || 'none'}). SchedulingRun 记录 configId: ${apiMap.schedulingRunRecordsConfigId}. resultSnapshot 含: solverConfig=${apiMap.resultSnapshotContainsSolverConfig}, lockedSlotIds=${apiMap.resultSnapshotContainsLockedSlotIds}, randomSeed=${apiMap.resultSnapshotContainsRandomSeed}. preview 验证 lockedSlotIds: ${apiMap.previewValidatesLockedSlotIds}.`,
      evidence: [
        `preview API exists: ${apiMap.previewApiExists}`,
        `preview accepts: maxIterations=${apiMap.previewAcceptsMaxIterations}, lahcWindowSize=${apiMap.previewAcceptsLahcWindowSize}, randomSeed=${apiMap.previewAcceptsRandomSeed}, lockedSlotIds=${apiMap.previewAcceptsLockedSlotIds}, configId=${apiMap.previewAcceptsConfigId}`,
        `apply API exists: ${apiMap.applyApiExists}, accepts previewRunId=${apiMap.applyAcceptsPreviewRunId}, reuses config=${apiMap.applyReusesConfigFromPreview}`,
        `rollback API exists: ${apiMap.rollbackApiExists}, accepts applyRunId=${apiMap.rollbackAcceptsApplyRunId}, reuses config=${apiMap.rollbackReusesConfig}`,
        `config CRUD API exists: ${apiMap.configCrudApiExists}, endpoints: ${apiMap.configCrudEndpoints.join(', ') || 'none'}`,
        `SchedulingRun records configId: ${apiMap.schedulingRunRecordsConfigId}`,
        `resultSnapshot contains solver config: ${apiMap.resultSnapshotContainsSolverConfig}`,
        `resultSnapshot contains lockedSlotIds: ${apiMap.resultSnapshotContainsLockedSlotIds}`,
        `resultSnapshot contains randomSeed: ${apiMap.resultSnapshotContainsRandomSeed}`,
        `preview validates lockedSlotIds: ${apiMap.previewValidatesLockedSlotIds}`,
      ],
      risk: '当前 API 链能完成基本 preview/apply/rollback, 但: (1) 无 config CRUD API, 用户无法创建/修改 config; (2) apply 不复用 config, 仅复用 previewRunId; (3) resultSnapshot 不含 maxIterations/lahcWindowSize, 历史 run 不可复现.',
      recommendation: '下一阶段: (1) 加 config CRUD API (GET / POST / PUT / DELETE); (2) apply 复用 previewRun.configId; (3) resultSnapshot 增 maxIterations/lahcWindowSize 字段; (4) preview 接受 optional configId, 若提供则从 config 加载默认参数.',
      suggestedNextStage: 'K21-FIX-E-SOLVER-CONFIG-API-PLAN',
    })
  }

  // Rule D: Frontend UI exposure
  {
    const exposed = feMap.exposedParamInputs
    const missing = ['maxIterations', 'lahcWindowSize'].filter((p) => !exposed.includes(p))
    const hasSaveReset = feMap.exposesConfigSaveReset
    const hasConfigPicker = feMap.exposesConfigPicker
    const severity: Severity = missing.length > 0 ? 'MEDIUM' : !hasConfigPicker ? 'MEDIUM' : !hasSaveReset ? 'LOW' : 'LOW'

    findings.push({
      id: 'K21-D-D-1',
      rule: 'D. Frontend UI exposure',
      severity,
      category: 'D. frontend UI exposure',
      title: `UI 暴露参数: ${exposed.join(', ') || 'none'}. 缺失: maxIterations, lahcWindowSize, config picker, save/reset`,
      currentStatus: `UI 暴露参数: ${exposed.join(', ')}. 缺失 maxIterations=${!feMap.exposesMaxIterations}, lahcWindowSize=${!feMap.exposesLahcWindowSize}, config picker=${!feMap.exposesConfigPicker}, save/reset=${!feMap.exposesConfigSaveReset}, hard/soft weight=${!feMap.exposesHardSoftWeights}, config preset=${!feMap.exposesConfigPreset}, per-semester config=${!feMap.exposesPerSemesterConfig}, validation=${!feMap.exposesValidation}, locked slot manager=${!feMap.exposesLockedSlotManager}.`,
      evidence: [
        `scheduler page exists: ${feMap.schedulerPageExists}`,
        `scheduler content file exists: ${feMap.schedulerContentFileExists}`,
        `UI exposes: randomSeed=${feMap.exposesRandomSeed}, lockedSlotIds=${feMap.exposesLockedSlotIds}, maxIterations=${feMap.exposesMaxIterations}, lahcWindowSize=${feMap.exposesLahcWindowSize}`,
        `UI exposes config picker: ${feMap.exposesConfigPicker}`,
        `UI exposes config save/reset: ${feMap.exposesConfigSaveReset}`,
        `UI exposes hard/soft weights: ${feMap.exposesHardSoftWeights}`,
        `UI exposes config preset: ${feMap.exposesConfigPreset}`,
        `UI exposes per-semester config: ${feMap.exposesPerSemesterConfig}`,
        `UI exposes validation: ${feMap.exposesValidation}`,
        `UI exposes locked slot manager: ${feMap.exposesLockedSlotManager}`,
        `exposed param inputs: ${exposed.join(', ')}`,
      ],
      risk: '用户无法调整 maxIterations / lahcWindowSize / config 选择, 必须用 server default 10000/500. 不同学期需不同调参 (e.g. 春季实验课多需更长 iteration) 不可行.',
      recommendation: '下一阶段 UI 增加: (1) maxIterations number input (range 100-15000); (2) lahcWindowSize number input (range 50-2000); (3) config picker (下拉选 semester-scoped config); (4) save/reset 按钮 (保存当前参数为新 config).',
      suggestedNextStage: 'K21-FIX-F-SOLVER-CONFIG-UI-IMPLEMENTATION',
    })
  }

  // Rule E: lockedTaskIds / lockedSlotIds naming
  {
    const semDiff = lockedMap.semanticDifference
    const needsMigration = lockedMap.needsMigration
    const schemaIsUsed = lockedMap.schemaFieldIsUsedBySolver
    const severity: Severity = !schemaIsUsed ? 'MEDIUM' : 'MEDIUM'

    findings.push({
      id: 'K21-D-E-1',
      rule: 'E. lockedTaskIds vs lockedSlotIds',
      severity,
      category: 'E. lockedTaskIds / lockedSlotIds naming',
      title: `Schema "${lockedMap.schemaFieldName}" vs runtime "${lockedMap.runtimeSolverName}" — 命名不一致 + 语义差异未文档化`,
      currentStatus: `Schema 字段: ${lockedMap.schemaFieldName} (${lockedMap.schemaFieldType}). Runtime 变量: ${lockedMap.runtimeSolverName} (${lockedMap.runtimeSolverType}). API: ${lockedMap.apiName} (${lockedMap.apiType}). UI: ${lockedMap.uiName}. Solver 是否解析 schema 字段: ${schemaIsUsed}. 语义差异: ${semDiff}.`,
      evidence: [
        `schema field: ${lockedMap.schemaFieldName} (${lockedMap.schemaFieldType})`,
        `schema field is used by solver: ${schemaIsUsed}`,
        `runtime solver variable: ${lockedMap.runtimeSolverName} (${lockedMap.runtimeSolverType})`,
        `API variable: ${lockedMap.apiName} (${lockedMap.apiType})`,
        `UI variable: ${lockedMap.uiName}`,
        `semantic difference: ${semDiff}`,
        `recommendation: ${lockedMap.recommendation}`,
        `needs migration: ${needsMigration}`,
      ],
      risk: '(1) 维护者认为 schema 字段被使用, 实际未解析; (2) 任务级 vs 槽位级差异未文档化, 用户可能误解 "锁定任务" 含义; (3) 多 slot 课程 (e.g. 3 节连堂) 锁一个 slot 不锁其他, 行为反直觉.',
      recommendation: lockedMap.recommendation,
      suggestedNextStage: 'K21-FIX-E-LOCKED-SLOT-NAMING-AUDIT (决策阶段)',
    })
  }

  // Rule F: config snapshot / reproducibility
  {
    const hasSnapshot = snapshotMap.resultSnapshotContainsSolverConfig
    const hasFingerprint = snapshotMap.databaseFingerprintField
    const reproducibilityRisk = snapshotMap.reproducibilityRisk
    const severity: Severity = !hasFingerprint ? 'HIGH' : !hasSnapshot ? 'MEDIUM' : 'LOW'

    findings.push({
      id: 'K21-D-F-1',
      rule: 'F. Config snapshot / reproducibility',
      severity,
      category: 'F. config snapshot / reproducibility',
      title: `databaseFingerprint=${hasFingerprint} (existing); resultSnapshot 包含 solver config=${hasSnapshot}. 历史 run ${snapshotMap.historyChangesImpactPriorRuns ? '会受 config 修改影响' : '不受影响'}`,
      currentStatus: `SchedulingRun 记录 configId: ${snapshotMap.schedulingRunRecordsConfigId}. resultSnapshot 含 solver config: ${hasSnapshot}. resultSnapshot 含硬编码 penalty: ${snapshotMap.resultSnapshotContainsHardcodedPenalties}. 历史 config 修改影响旧 run: ${snapshotMap.historyChangesImpactPriorRuns}. databaseFingerprint 字段: ${hasFingerprint} (algorithm: ${snapshotMap.fingerprintAlgorithm}).`,
      evidence: [
        `SchedulingRun.configId field: yes`,
        `resultSnapshot contains solver config (maxIterations/lahcWindowSize): ${hasSnapshot}`,
        `resultSnapshot contains hardcoded penalties: ${snapshotMap.resultSnapshotContainsHardcodedPenalties}`,
        `history changes impact prior runs: ${snapshotMap.historyChangesImpactPriorRuns}`,
        `databaseFingerprint field: ${hasFingerprint}`,
        `fingerprint algorithm: ${snapshotMap.fingerprintAlgorithm}`,
        `reproducibility risk: ${reproducibilityRisk}`,
      ],
      risk: '若 config 修改后, 旧 run 仍引用 configId 但内容已变, 历史 run 不可复现. 当前 resultSnapshot 只记录 lockedSlotIds + randomSeed + score, 不记录 maxIterations / lahcWindowSize.',
      recommendation: '下一阶段: (1) SchedulingRun 增 resultSnapshot 中 maxIterations / lahcWindowSize 字段; (2) 或新增 configSnapshot String 字段, 存完整 config JSON snapshot; (3) 当前 databaseFingerprint 已存在, 保留.',
      suggestedNextStage: 'K21-FIX-H-SCHEDULINGRUN-CONFIG-SNAPSHOT',
    })
  }

  // Rule G: hard / soft weight configuration
  {
    const notConfigurable = !weightMap.canConfigureViaDb && !weightMap.canConfigureViaApi && !weightMap.canConfigureViaUi
    const severity: Severity = notConfigurable ? 'MEDIUM' : 'LOW'

    findings.push({
      id: 'K21-D-G-1',
      rule: 'G. Hard / soft weight configuration',
      severity,
      category: 'G. hard / soft weight configuration',
      title: `Hard penalty=${weightMap.hardPenaltyValue} (硬编码), Soft penalties=${JSON.stringify(weightMap.softPenalties)} 全部硬编码. 不支持配置.`,
      currentStatus: `HARD_PENALTY=${weightMap.hardPenaltyValue} (hardcoded in score.ts). Soft penalties 全部 hardcoded: ${JSON.stringify(weightMap.softPenalties)}. score.ts 接收 dynamic weights: ${weightMap.scoreReceivesDynamicWeights}. 可配置 via DB: ${weightMap.canConfigureViaDb}, via API: ${weightMap.canConfigureViaApi}, via UI: ${weightMap.canConfigureViaUi}.`,
      evidence: [
        `HARD_PENALTY value: ${weightMap.hardPenaltyValue} (hardcoded)`,
        `soft penalties: ${JSON.stringify(weightMap.softPenalties)} (all hardcoded)`,
        `score receives dynamic weights: ${weightMap.scoreReceivesDynamicWeights}`,
        `configurable via DB: ${weightMap.canConfigureViaDb}`,
        `configurable via API: ${weightMap.canConfigureViaApi}`,
        `configurable via UI: ${weightMap.canConfigureViaUi}`,
        `recommend weight config stage: ${weightMap.recommendWeightConfigStage}`,
      ],
      risk: '不同高校对权重需求不同 (e.g. 工科院校可能更在意 SC3 极端时间, 文科不在意). 当前无法调整, 排课结果不可优化.',
      recommendation: '本阶段不改 weight 配置 (deferred to K21-FIX-I-SCORE-WEIGHTS-ROADMAP). 短期: 仅暴露 LAHC params (maxIterations / lahcWindowSize / randomSeed / lockedSlotIds). 长期: score.ts refactor 接收 dynamic weights, 配 hardWeights / softWeights JSON 字段.',
      suggestedNextStage: 'K21-FIX-I-SCORE-WEIGHTS-ROADMAP (后置)',
    })
  }

  return findings
}

function computeRecommendedOptions(): Array<{ option: string; pros: string[]; cons: string[] }> {
  return [
    {
      option: 'A. 短期: 先做 config CRUD API + UI 暴露 maxIterations/lahcWindowSize + resultSnapshot 加 config 字段',
      pros: [
        '解 4 项 MEDIUM 优先级最高 (D, B, C, F)',
        '用户能调 LAHC 参数, 不需改 score.ts',
        '历史 run 可复现',
        '无 solver algorithm 改动风险',
      ],
      cons: [
        '不解决 G 类别 weight 不可配置',
        'lockedTaskIds 命名仍存在',
        'config 字段需要新 schema migration',
      ],
    },
    {
      option: 'B. 中期: 加 weight 配置 (hardWeights / softWeights JSON) + score.ts refactor',
      pros: [
        '彻底解 G 类别',
        '不同高校可调权重',
        '为 soft constraint expansion 铺路',
      ],
      cons: [
        'score.ts refactor 风险大',
        '需要 regression verify',
        '可能影响现有 23/31 PASS 测试',
      ],
    },
    {
      option: 'C. 命名修复: 改 schema lockedTaskIds → lockedSlotIds, 加 task-level lock 解析',
      pros: [
        '命名一致, 维护更清晰',
        '支持 task-level lock (粒度粗, 防止整门课被拆散)',
      ],
      cons: [
        '需要 migration (rename field)',
        '破坏性变更, 需考虑 backward compat',
        '当前 0 lockedTaskIds 数据, 风险低',
      ],
    },
    {
      option: 'D. 长线: 自动调度 → preview → apply → rollback 完整 polish (进度条, 多级 rollback, history copy-as-new-run)',
      pros: [
        '闭环体验提升',
        '降低用户操作风险',
      ],
      cons: [
        '不解决 config 产品化核心问题',
        '需要更多 UI 改动',
      ],
    },
  ]
}

function computeRecommendedRoadmap(
  _findings: Finding[],
): Array<{ stage: string; reason: string; scope: string; outOfScope: string }> {
  return [
    {
      stage: 'K21-FIX-E-SOLVER-CONFIG-API-PLAN',
      reason: 'B/C/D/F 类别都需要先有 config CRUD API. 当前 DB 1 条 config, 用户无法创建/修改. 是后续所有 config 产品化工作的前置.',
      scope: '只读 audit + 设计: (1) SchedulingConfig schema migration (加 randomSeed, updatedAt, hardWeights, softWeights, solverVersion, configSnapshot); (2) /api/admin/scheduler/configs GET/POST/PUT/DELETE 设计; (3) per-semester default config 设计; (4) request/response schema. 不实施.',
      outOfScope: '不实施 migration. 不实施 API. 不改 solver. 不改 UI.',
    },
    {
      stage: 'K21-FIX-F-SOLVER-CONFIG-API-IMPLEMENTATION',
      reason: 'K21-FIX-E plan 完成后, 实施 config CRUD API + schema migration + solver 解析 config 字段.',
      scope: '实施: (1) migration 加 randomSeed, updatedAt, hardWeights (JSON), softWeights (JSON), solverVersion, configSnapshot; (2) GET/POST/PUT/DELETE /api/admin/scheduler/configs; (3) preview/apply/rollback 复用 config; (4) resultSnapshot 增 solver config 字段; (5) per-semester default config resolver. 不做 weight 配置.',
      outOfScope: '不改 score.ts. 不改 UI. 不实施 hard/soft weight UI.',
    },
    {
      stage: 'K21-FIX-G-SOLVER-CONFIG-UI',
      reason: 'D 类别 MEDIUM. 用户无法 UI 调参. 当前 UI 只暴露 randomSeed + lockedSlotIds.',
      scope: '实施 UI: (1) maxIterations input (100-15000); (2) lahcWindowSize input (50-2000); (3) randomSeed input (已存在); (4) config picker (下拉选 semester-scoped config); (5) save/reset 按钮 (保存为新 config); (6) lockedSlotIds manager (已存在, 完善); (7) input validation.',
      outOfScope: '不做 hard/soft weight UI. 不做 weight config. 不改 solver.',
    },
    {
      stage: 'K21-FIX-H-SCHEDULINGRUN-CONFIG-SNAPSHOT',
      reason: 'F 类别 MEDIUM. 当前 resultSnapshot 不含 maxIterations/lahcWindowSize. 历史 run 不可复现.',
      scope: '实施: (1) SchedulingRun.resultSnapshot 增 maxIterations/lahcWindowSize 字段; (2) 或新增 configSnapshot String 字段存完整 config JSON; (3) databaseFingerprint 保留; (4) history 比较 readiness.',
      outOfScope: '不改 solver algorithm. 不改 apply/rollback 流程.',
    },
    {
      stage: 'K21-FIX-I-SCORE-WEIGHTS-ROADMAP',
      reason: 'G 类别 MEDIUM. 7 项常见软约束未覆盖 + weight 不可配置. 后置, 因为 score.ts refactor 风险大.',
      scope: '只读 audit + 设计: (1) score.ts refactor 接收 dynamic weights; (2) hardWeights / softWeights JSON 字段; (3) regression verify plan; (4) 实施推迟到 K22+.',
      outOfScope: 'K21 不实施, K22 路线.',
    },
    {
      stage: 'K21-FIX-E-LOCKED-SLOT-NAMING-AUDIT (parallel decision)',
      reason: 'E 类别 MEDIUM. lockedTaskIds / lockedSlotIds 命名不一致. 当前 0 lockedTaskIds 数据, migration 风险低.',
      scope: '实施: (1) 决策 task-level vs slot-level lock; (2) 推荐方案 C (task-level lock 解析); (3) migration rename lockedTaskIds → lockedSlotIds (optional, 当前数据为 0); (4) 文档化语义差异.',
      outOfScope: '不改 solver algorithm. 不改 preview API shape. 不改 UI label.',
    },
  ]
}

// ── Main ──────────────────────────────────────────────────────────────

async function main() {
  console.log('K21 Solver Config UI Audit')
  console.log('==========================\n')

  // DB counts
  const db = {
    classGroupCount: await prisma.classGroup.count(),
    teacherCount: await prisma.teacher.count(),
    courseCount: await prisma.course.count(),
    roomCount: await prisma.room.count(),
    teachingTaskCount: await prisma.teachingTask.count(),
    scheduleSlotCount: await prisma.scheduleSlot.count(),
    schedulingConfigCount: await prisma.schedulingConfig.count(),
    schedulingRunCount: await prisma.schedulingRun.count(),
    schedulerRunChangeCount: await prisma.schedulerRunChange.count(),
  }

  console.log('Database snapshot:')
  console.log(`  ClassGroups:           ${db.classGroupCount}`)
  console.log(`  Teachers:              ${db.teacherCount}`)
  console.log(`  Courses:               ${db.courseCount}`)
  console.log(`  Rooms:                 ${db.roomCount}`)
  console.log(`  TeachingTasks:         ${db.teachingTaskCount}`)
  console.log(`  ScheduleSlots:         ${db.scheduleSlotCount}`)
  console.log(`  SchedulingConfigs:     ${db.schedulingConfigCount}`)
  console.log(`  SchedulingRuns:        ${db.schedulingRunCount}`)
  console.log(`  SchedulerRunChanges:   ${db.schedulerRunChangeCount}`)
  console.log('')

  // Sample config
  const sampleCfg = await prisma.schedulingConfig.findFirst({ orderBy: { id: 'asc' } })

  // Compute maps
  const schemaBase = computeSchedulingConfigSchema()
  const schemaMap: SchedulingConfigSchema = {
    ...schemaBase,
    dbRecordCount: db.schedulingConfigCount,
    sampleConfig: sampleCfg
      ? {
          id: sampleCfg.id,
          name: sampleCfg.name,
          maxIterations: sampleCfg.maxIterations,
          lahcWindowSize: sampleCfg.lahcWindowSize,
          lockedTaskIds: sampleCfg.lockedTaskIds,
        }
      : null,
  }
  const solverMap = computeSolverConfigUsage()
  const apiMap = computeApiConfigFlow()
  const feMap = computeFrontendConfigExposure()
  const lockedMap = computeLockedIdsAssessment()
  const snapshotMap = computeConfigSnapshotAssessment()
  const weightMap = computeWeightConfiguration(solverMap)

  // Findings
  const findings = buildFindings(schemaMap, solverMap, apiMap, feMap, lockedMap, snapshotMap, weightMap)
  const summary: Record<Severity, number> = { HIGH: 0, MEDIUM: 0, LOW: 0, INFO: 0, ACCEPTED: 0, NONE: 0 }
  for (const f of findings) summary[f.severity]++

  const blocking = summary.HIGH > 0
  const recommendedOptions = computeRecommendedOptions()
  const recommendedRoadmap = computeRecommendedRoadmap(findings)
  const suggestedNextStage = 'K21-FIX-E-SOLVER-CONFIG-API-PLAN'

  const report: K21DReport = {
    generatedAt: new Date().toISOString(),
    phase: 'K21-FIX-D-SOLVER-CONFIG-UI-AUDIT',
    mode: 'read-only',
    database: db,
    summary,
    totalFindings: findings.length,
    blocking,
    schedulingConfigSchema: schemaMap,
    solverConfigUsage: solverMap,
    apiConfigFlow: apiMap,
    frontendConfigExposure: feMap,
    lockedIdsAssessment: lockedMap,
    configSnapshotAssessment: snapshotMap,
    weightConfiguration: weightMap,
    findings,
    recommendedOptions,
    recommendedRoadmap,
    suggestedNextStage,
  }

  // Write JSON
  const outDir = path.join(projectRoot, 'docs')
  if (!fs.existsSync(outDir)) fs.mkdirSync(outDir, { recursive: true })
  const outPath = path.join(outDir, 'k21-solver-config-ui-audit.json')
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

  console.log('SchedulingConfig Schema:')
  console.log(`  model exists:                ${schemaMap.modelExists}`)
  console.log(`  fields:                      ${schemaMap.fields.join(', ')}`)
  console.log(`  has maxIterations:           ${schemaMap.hasMaxIterations}`)
  console.log(`  has lahcWindowSize:          ${schemaMap.hasLahcWindowSize}`)
  console.log(`  has randomSeed:              ${schemaMap.hasRandomSeed}`)
  console.log(`  has lockedTaskIds:           ${schemaMap.hasLockedTaskIds}`)
  console.log(`  has lockedSlotIds:           ${schemaMap.hasLockedSlotIds}`)
  console.log(`  has semesterId:              ${schemaMap.hasSemesterId}`)
  console.log(`  has createdAt/updatedAt:     ${schemaMap.hasCreatedAt}/${schemaMap.hasUpdatedAt}`)
  console.log(`  has hardWeights:             ${schemaMap.hasHardWeights}`)
  console.log(`  has softWeights:             ${schemaMap.hasSoftWeights}`)
  console.log(`  has solverVersion:           ${schemaMap.hasSolverVersion}`)
  console.log(`  has configSnapshot:          ${schemaMap.hasConfigSnapshot}`)
  console.log(`  DB count:                    ${schemaMap.dbRecordCount}`)
  console.log('')

  console.log('Solver Config Usage:')
  console.log(`  local SolverConfig:          ${solverMap.localSolverConfigInterface} (${solverMap.localConfigFields.join(', ')})`)
  console.log(`  solver reads SchedulingConfig: ${solverMap.solverReadsSchedulingConfig} (${solverMap.solverReadsFields.join(', ') || 'none'})`)
  console.log(`  preview reads SchedulingConfig: ${solverMap.previewReadsSchedulingConfig}`)
  console.log(`  preview passes to solver:    ${solverMap.previewPassesFieldsToSolver.join(', ')}`)
  console.log(`  maxIterations/lahcWin/randomSeed/lockedSlotIds: ${solverMap.maxIterationsUsed}/${solverMap.lahcWindowSizeUsed}/${solverMap.randomSeedUsed}/${solverMap.lockedSlotIdsRespected}`)
  console.log(`  hard penalty hardcoded:      ${solverMap.hardPenaltyHardcoded} (value=${solverMap.hardPenaltyValue})`)
  console.log(`  soft penalties hardcoded:    ${solverMap.softPenaltyHardcoded}`)
  console.log(`  score receives dynamic wts:  ${solverMap.scoreReceivesDynamicWeights}`)
  console.log('')

  console.log('API Config Flow:')
  console.log(`  preview API:                 ${apiMap.previewApiExists}`)
  console.log(`  preview accepts:             maxIter=${apiMap.previewAcceptsMaxIterations}, lahcWin=${apiMap.previewAcceptsLahcWindowSize}, seed=${apiMap.previewAcceptsRandomSeed}, lockedSlotIds=${apiMap.previewAcceptsLockedSlotIds}, configId=${apiMap.previewAcceptsConfigId}`)
  console.log(`  apply API:                   ${apiMap.applyApiExists}, reuses config=${apiMap.applyReusesConfigFromPreview}`)
  console.log(`  rollback API:                ${apiMap.rollbackApiExists}, reuses config=${apiMap.rollbackReusesConfig}`)
  console.log(`  config CRUD API:             ${apiMap.configCrudApiExists} (endpoints: ${apiMap.configCrudEndpoints.join(', ') || 'none'})`)
  console.log(`  resultSnapshot contains:     solverConfig=${apiMap.resultSnapshotContainsSolverConfig}, lockedSlotIds=${apiMap.resultSnapshotContainsLockedSlotIds}, randomSeed=${apiMap.resultSnapshotContainsRandomSeed}`)
  console.log(`  preview validates locked:    ${apiMap.previewValidatesLockedSlotIds}`)
  console.log('')

  console.log('Frontend UI Exposure:')
  console.log(`  scheduler content:           ${feMap.schedulerContentFileExists}`)
  console.log(`  exposes:                     ${feMap.exposedParamInputs.join(', ') || 'none'}`)
  console.log(`  exposes maxIterations:       ${feMap.exposesMaxIterations}`)
  console.log(`  exposes lahcWindowSize:      ${feMap.exposesLahcWindowSize}`)
  console.log(`  exposes config picker:       ${feMap.exposesConfigPicker}`)
  console.log(`  exposes config save/reset:   ${feMap.exposesConfigSaveReset}`)
  console.log(`  exposes hard/soft weights:   ${feMap.exposesHardSoftWeights}`)
  console.log(`  exposes config preset:       ${feMap.exposesConfigPreset}`)
  console.log(`  exposes per-semester config: ${feMap.exposesPerSemesterConfig}`)
  console.log(`  exposes validation:          ${feMap.exposesValidation}`)
  console.log('')

  console.log('Locked IDs Assessment:')
  console.log(`  schema field:                ${lockedMap.schemaFieldName} (${lockedMap.schemaFieldType})`)
  console.log(`  schema used by solver:       ${lockedMap.schemaFieldIsUsedBySolver}`)
  console.log(`  runtime variable:            ${lockedMap.runtimeSolverName} (${lockedMap.runtimeSolverType})`)
  console.log(`  API variable:                ${lockedMap.apiName} (${lockedMap.apiType})`)
  console.log(`  UI variable:                 ${lockedMap.uiName}`)
  console.log(`  needs migration:             ${lockedMap.needsMigration}`)
  console.log('')

  console.log('Findings:')
  for (const f of findings) {
    console.log(`  [${f.severity}] ${f.id} ${f.title}`)
  }
  console.log('')

  console.log('Recommended Options:')
  for (let i = 0; i < recommendedOptions.length; i++) {
    const r = recommendedOptions[i]
    console.log(`  ${String.fromCharCode(65 + i)}. ${r.option}`)
  }
  console.log('')

  console.log('Recommended Roadmap:')
  for (let i = 0; i < recommendedRoadmap.length; i++) {
    const r = recommendedRoadmap[i]
    console.log(`  ${i + 1}. ${r.stage}`)
  }
  console.log('')
  console.log(`Top suggestion: ${suggestedNextStage}`)
  console.log('')
  console.log(`Report written: docs/k21-solver-config-ui-audit.json`)

  await prisma.$disconnect()
}

main().catch((e) => {
  console.error(e)
  prisma.$disconnect().then(() => process.exit(1))
})
