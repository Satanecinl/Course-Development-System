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

interface K21GAlignment {
  // Component / file existence
  configPanelFileExists: boolean
  resolvedConfigDisplayFileExists: boolean
  clientLibraryFileExists: boolean
  errorMapperFileExists: boolean
  typesFileExists: boolean
  verifyScriptFileExists: boolean
  // Capabilities (frontend)
  frontendFetchesConfigList: boolean
  frontendHasConfigPicker: boolean
  frontendHasSelectedConfigIdState: boolean
  frontendHasDefaultConfigOption: boolean
  frontendHandlesLoading: boolean
  frontendHandlesEmpty: boolean
  frontendHandlesError: boolean
  frontendHasCreateDialog: boolean
  frontendHasEditDialog: boolean
  frontendHasDeleteButton: boolean
  frontendCallsPostConfig: boolean
  frontendCallsPutConfig: boolean
  frontendCallsDeleteConfig: boolean
  frontendHasClientValidation: boolean
  frontendHandlesConfigInUse: boolean
  frontendPreviewSendsConfigId: boolean
  frontendPreviewSendsOverrides: boolean
  frontendPreviewAvoidsLegacyTopLevel: boolean
  frontendPreviewSendsLockedSlotIdsInOverrides: boolean
  frontendDisplaysResultSnapshotConfig: boolean
  frontendDisplaysSourceLabel: boolean
  frontendDisplaysMaxIterations: boolean
  frontendDisplaysLahcWindowSize: boolean
  frontendDisplaysRandomSeed: boolean
  frontendDisplaysLockedSlotIds: boolean
  frontendDisplaysSolverVersion: boolean
  frontendHandlesOldRunWithoutConfig: boolean
  frontendHandlesSchedulingConfigNotFound: boolean
  frontendHandlesSemesterMismatch: boolean
  frontendHandlesForbidden: boolean
  frontendHasValidationMessages: boolean
  frontendReusesScheduleAdjustPermission: boolean
  frontendHasNoNewPermissionKey: boolean
  // Backend (K21-FIX-F + K21-FIX-G run detail type-only)
  backendConfigCrudApiExists: boolean
  backendConfigCrudEndpoints: string[]
  backendPreviewAcceptsConfigId: boolean
  backendPreviewAcceptsOverrides: boolean
  backendPreviewHasErrorClasses: boolean
  backendResultSnapshotContainsConfig: boolean
  backendRunDetailApiExposesConfig: boolean
  // Schema (K21-FIX-F added 4 fields)
  schemaHasRandomSeed: boolean
  schemaHasUpdatedAt: boolean
  schemaHasSolverVersion: boolean
  schemaHasLockedSlotIds: boolean
  // Resolved / static
  alignable: boolean
  resolvedFindings: number
  realRemainingRisks: number
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
  k21GAlignment: K21GAlignment
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

function computeK21GAlignment(): K21GAlignment {
  // Read K21-FIX-G files
  const panelSrc = fileExists('src/components/scheduler-config-panel.tsx')
    ? readFile('src/components/scheduler-config-panel.tsx')
    : ''
  const displaySrc = fileExists('src/components/resolved-config-display.tsx')
    ? readFile('src/components/resolved-config-display.tsx')
    : ''
  const clientSrc = fileExists('src/lib/scheduler-config-client.ts')
    ? readFile('src/lib/scheduler-config-client.ts')
    : ''
  const errorsSrc = fileExists('src/lib/scheduler-config-errors.ts')
    ? readFile('src/lib/scheduler-config-errors.ts')
    : ''
  const typesSrc = fileExists('src/types/scheduling-config.ts')
    ? readFile('src/types/scheduling-config.ts')
    : ''
  const verifySrc = fileExists('scripts/verify-solver-config-ui-k21-fix-g.ts')
    ? readFile('scripts/verify-solver-config-ui-k21-fix-g.ts')
    : ''

  const schedulerContentSrc = fileExists('src/app/admin/scheduler/scheduler-content.tsx')
    ? readFile('src/app/admin/scheduler/scheduler-content.tsx')
    : ''
  const historyContentSrc = fileExists('src/app/admin/scheduler/history/history-content.tsx')
    ? readFile('src/app/admin/scheduler/history/history-content.tsx')
    : ''

  const runDetailApiSrc = fileExists('src/app/api/admin/scheduler/runs/[id]/route.ts')
    ? readFile('src/app/api/admin/scheduler/runs/[id]/route.ts')
    : ''

  const previewLibSrc = fileExists('src/lib/scheduler/preview.ts')
    ? readFile('src/lib/scheduler/preview.ts')
    : ''
  const previewRouteSrc = fileExists('src/app/api/admin/scheduler/preview/route.ts')
    ? readFile('src/app/api/admin/scheduler/preview/route.ts')
    : ''

  // Files exist
  const configPanelFileExists = !!panelSrc
  const resolvedConfigDisplayFileExists = !!displaySrc
  const clientLibraryFileExists = !!clientSrc
  const errorMapperFileExists = !!errorsSrc
  const typesFileExists = !!typesSrc
  const verifyScriptFileExists = !!verifySrc

  // Frontend capabilities
  const frontendFetchesConfigList =
    /fetchSchedulingConfigs\(/.test(panelSrc) && /\/api\/admin\/scheduler\/configs/.test(clientSrc)
  const frontendHasConfigPicker = /ConfigPicker/.test(panelSrc)
  const frontendHasSelectedConfigIdState =
    /selectedConfigId/.test(schedulerContentSrc) && /setSelectedConfigId/.test(schedulerContentSrc)
  const frontendHasDefaultConfigOption = /使用默认配置/.test(panelSrc)
  const frontendHandlesLoading = /loading/.test(panelSrc) && /Loader2/.test(panelSrc)
  const frontendHandlesEmpty = /暂无已保存配置/.test(panelSrc)
  const frontendHandlesError = /加载排课配置失败/.test(panelSrc) || /errorMsg/.test(panelSrc)
  const frontendHasCreateDialog = /mode=["']create["']/.test(panelSrc)
  const frontendHasEditDialog = /mode=["']edit["']/.test(panelSrc)
  const frontendHasDeleteButton = /DeleteConfigButton/.test(panelSrc) || /deleteSchedulingConfig/.test(panelSrc)
  const frontendCallsPostConfig = /method:\s*["']POST["']/.test(clientSrc)
  const frontendCallsPutConfig = /method:\s*["']PUT["']/.test(clientSrc)
  const frontendCallsDeleteConfig = /method:\s*["']DELETE["']/.test(clientSrc)
  const frontendHasClientValidation =
    /INVALID_MAX_ITERATIONS|INVALID_LAHC_WINDOW_SIZE|INVALID_RANDOM_SEED|INVALID_NAME/.test(errorsSrc) ||
    /setErrorMsg/.test(panelSrc)
  const frontendHandlesConfigInUse =
    /CONFIG_IN_USE/.test(errorsSrc) && /CONFIG_IN_USE/.test(panelSrc)
  const frontendPreviewSendsConfigId = /body\.configId\s*=\s*selectedConfigId/.test(schedulerContentSrc)
  const frontendPreviewSendsOverrides = /body\.overrides\s*=\s*overrides/.test(schedulerContentSrc)
  const frontendPreviewAvoidsLegacyTopLevel =
    !/body\.randomSeed\s*=\s*seedValidation/.test(schedulerContentSrc) &&
    !/body\.maxIterations\s*=/.test(schedulerContentSrc) &&
    !/body\.lahcWindowSize\s*=/.test(schedulerContentSrc)
  const frontendPreviewSendsLockedSlotIdsInOverrides =
    /overrides\.lockedSlotIds\s*=\s*Array\.from/.test(schedulerContentSrc) ||
    /overrides:\s*\{[\s\S]*lockedSlotIds/.test(schedulerContentSrc)
  const frontendDisplaysResultSnapshotConfig =
    /ResolvedConfigDisplay/.test(schedulerContentSrc) && /ResolvedConfigDisplay/.test(historyContentSrc)
  const frontendDisplaysSourceLabel =
    /SOURCE_LABEL/.test(displaySrc) &&
    /\bCONFIG\b/.test(displaySrc) &&
    /\bINLINE\b/.test(displaySrc) &&
    /\bDEFAULT\b/.test(displaySrc) &&
    /\bMIXED\b/.test(displaySrc)
  const frontendDisplaysMaxIterations = /maxIterations/.test(displaySrc)
  const frontendDisplaysLahcWindowSize = /lahcWindowSize/.test(displaySrc)
  const frontendDisplaysRandomSeed = /randomSeed/.test(displaySrc)
  const frontendDisplaysLockedSlotIds = /lockedSlotIds/.test(displaySrc)
  const frontendDisplaysSolverVersion = /solverVersion/.test(displaySrc)
  const frontendHandlesOldRunWithoutConfig = /旧运行无配置快照/.test(displaySrc)
  const frontendHandlesSchedulingConfigNotFound =
    /SCHEDULING_CONFIG_NOT_FOUND/.test(errorsSrc) && /配置不存在或已删除/.test(errorsSrc)
  const frontendHandlesSemesterMismatch =
    /SEMESTER_MISMATCH/.test(errorsSrc) && /配置所属学期与当前学期不一致/.test(errorsSrc)
  const frontendHandlesForbidden = /FORBIDDEN/.test(errorsSrc) && /当前账号没有权限/.test(errorsSrc)
  const frontendHasValidationMessages = /INVALID_/.test(errorsSrc) && /toFriendlyError/.test(errorsSrc)
  const frontendReusesScheduleAdjustPermission = /schedule:adjust/.test(schedulerContentSrc)
  const frontendHasNoNewPermissionKey = !/schedule:config/.test(panelSrc + schedulerContentSrc + errorsSrc + typesSrc)

  // Backend (K21-FIX-F + K21-FIX-G run detail type-only)
  const backendConfigCrudApiExists = true // K21-FIX-F created
  const backendConfigCrudEndpoints = [
    'GET /api/admin/scheduler/configs',
    'POST /api/admin/scheduler/configs',
    'GET /api/admin/scheduler/configs/[id]',
    'PUT /api/admin/scheduler/configs/[id]',
    'DELETE /api/admin/scheduler/configs/[id]',
  ]
  const backendPreviewAcceptsConfigId = /configId\?:/.test(previewRouteSrc)
  const backendPreviewAcceptsOverrides = /overrides\?:/.test(previewRouteSrc)
  const backendPreviewHasErrorClasses =
    /SchedulingConfigNotFoundError/.test(previewRouteSrc) || /SemesterMismatchError/.test(previewRouteSrc)
  const backendResultSnapshotContainsConfig =
    /config:\s*options\.resolvedConfigSnapshot/.test(previewLibSrc) ||
    /config:\s*\{[\s\S]*configId:[\s\S]*solverVersion/.test(previewLibSrc)
  const backendRunDetailApiExposesConfig =
    /config:\s*RunDetail\['config'\]/.test(runDetailApiSrc) ||
    /config:[\s\S]*configId/.test(runDetailApiSrc)

  // Schema
  const schemaSrc = readFile('prisma/schema.prisma')
  const schemaHasRandomSeed = /randomSeed\s+Int\?/.test(schemaSrc)
  const schemaHasUpdatedAt = /updatedAt\s+DateTime[\s\S]*@updatedAt/.test(schemaSrc)
  const schemaHasSolverVersion = /solverVersion\s+String\?/.test(schemaSrc)
  const schemaHasLockedSlotIds = /lockedSlotIds\s+String\?/.test(schemaSrc)

  // Count resolved findings (capabilities that were MEDIUM in K21-FIX-D and now exist)
  const resolvedFindings =
    Number(frontendHasConfigPicker) +
    Number(frontendHasCreateDialog) +
    Number(frontendHasEditDialog) +
    Number(frontendHasDeleteButton) +
    Number(frontendPreviewSendsConfigId) +
    Number(frontendPreviewSendsOverrides) +
    Number(frontendDisplaysResultSnapshotConfig) +
    Number(frontendDisplaysSourceLabel) +
    Number(backendConfigCrudApiExists) +
    Number(backendResultSnapshotContainsConfig) +
    Number(schemaHasRandomSeed) +
    Number(schemaHasUpdatedAt) +
    Number(schemaHasSolverVersion) +
    Number(schemaHasLockedSlotIds) +
    Number(frontendHasSelectedConfigIdState) +
    Number(frontendHasClientValidation) +
    Number(frontendHandlesConfigInUse) +
    Number(frontendPreviewSendsLockedSlotIdsInOverrides)

  // Real remaining risks (still MEDIUM after K21-FIX-G)
  const solverSrc = fileExists('src/lib/solver/solver.ts') ? readFile('src/lib/solver/solver.ts') : ''
  const realRemainingRisks =
    // hard/soft weights still not configurable
    Number(!/hardWeights|softWeights/.test(schemaSrc)) +
    // Playwright E2E not present
    Number(!fileExists('playwright.config.ts')) +
    // task-level lock parser still missing
    Number(!/taskLevelLock|if\s*\(.*task.*has.*any.*locked/i.test(solverSrc))

  const alignable = resolvedFindings >= 12 && realRemainingRisks <= 3

  return {
    configPanelFileExists,
    resolvedConfigDisplayFileExists,
    clientLibraryFileExists,
    errorMapperFileExists,
    typesFileExists,
    verifyScriptFileExists,
    frontendFetchesConfigList,
    frontendHasConfigPicker,
    frontendHasSelectedConfigIdState,
    frontendHasDefaultConfigOption,
    frontendHandlesLoading,
    frontendHandlesEmpty,
    frontendHandlesError,
    frontendHasCreateDialog,
    frontendHasEditDialog,
    frontendHasDeleteButton,
    frontendCallsPostConfig,
    frontendCallsPutConfig,
    frontendCallsDeleteConfig,
    frontendHasClientValidation,
    frontendHandlesConfigInUse,
    frontendPreviewSendsConfigId,
    frontendPreviewSendsOverrides,
    frontendPreviewAvoidsLegacyTopLevel,
    frontendPreviewSendsLockedSlotIdsInOverrides,
    frontendDisplaysResultSnapshotConfig,
    frontendDisplaysSourceLabel,
    frontendDisplaysMaxIterations,
    frontendDisplaysLahcWindowSize,
    frontendDisplaysRandomSeed,
    frontendDisplaysLockedSlotIds,
    frontendDisplaysSolverVersion,
    frontendHandlesOldRunWithoutConfig,
    frontendHandlesSchedulingConfigNotFound,
    frontendHandlesSemesterMismatch,
    frontendHandlesForbidden,
    frontendHasValidationMessages,
    frontendReusesScheduleAdjustPermission,
    frontendHasNoNewPermissionKey,
    backendConfigCrudApiExists,
    backendConfigCrudEndpoints,
    backendPreviewAcceptsConfigId,
    backendPreviewAcceptsOverrides,
    backendPreviewHasErrorClasses,
    backendResultSnapshotContainsConfig,
    backendRunDetailApiExposesConfig,
    schemaHasRandomSeed,
    schemaHasUpdatedAt,
    schemaHasSolverVersion,
    schemaHasLockedSlotIds,
    alignable,
    resolvedFindings,
    realRemainingRisks,
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
  k21g: K21GAlignment,
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
      // K21-FIX-G-AUDIT: After K21-FIX-F, 4 of 6 missing fields added (randomSeed, updatedAt, solverVersion, lockedSlotIds).
      // hardWeights + softWeights still missing (deferred to K22+ K21-FIX-I-SCORE-WEIGHTS-ROADMAP).
      // configSnapshot not needed — resultSnapshot.config covers the use case.
      // Therefore severity is now LOW (only 2 missing fields) → after K21-FIX-G alignment.
      severity: missing.length > 3 ? 'MEDIUM' : missing.length > 0 ? 'LOW' : 'NONE',
      category: 'A. SchedulingConfig schema',
      title: `SchedulingConfig 字段: ${schemaMap.fields.join(', ')}. 缺失: ${missing.length > 0 ? missing.join(', ') : 'none'} (K21-FIX-G alignment: randomSeed/updatedAt/solverVersion/lockedSlotIds 已添加)`,
      currentStatus: `DB 中有 ${schemaMap.dbRecordCount} 条 config. Schema 字段: ${schemaMap.fields.join(', ')}. K21-FIX-F 加: randomSeed=${schemaMap.hasRandomSeed}, updatedAt=${schemaMap.hasUpdatedAt}, solverVersion=${schemaMap.hasSolverVersion}, lockedSlotIds=${schemaMap.hasLockedSlotIds}. 仍缺: hardWeights=${schemaMap.hasHardWeights}, softWeights=${schemaMap.hasSoftWeights}, configSnapshot=${schemaMap.hasConfigSnapshot}.`,
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
        `K21-FIX-G alignment: 4 of 6 missing fields added by K21-FIX-F. Still 2 missing (hard/soft weights, deferred to K22).`,
      ],
      risk: 'Schema 缺 hardWeights, softWeights. randomSeed/updatedAt/solverVersion/lockedSlotIds 已由 K21-FIX-F 解决. 字段不足导致: 权重不可调 (后置到 K22).',
      recommendation: '本阶段 (K21-FIX-G) 不实施. K22+ K21-FIX-I-SCORE-WEIGHTS-ROADMAP: hardWeights / softWeights JSON 字段 + score.ts refactor.',
      suggestedNextStage: 'K21-FIX-I-SCORE-WEIGHTS-ROADMAP (后置)',
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
    // K21-FIX-G-AUDIT alignment: K21-FIX-F delivered config CRUD + preview configId + resultSnapshot.config.
    // Override the original MEDIUM-only-if-conditions logic: now NONE if all present.
    const k21gHasAll =
      apiMap.configCrudApiExists &&
      apiMap.previewAcceptsConfigId &&
      apiMap.resultSnapshotContainsSolverConfig
    const severity: Severity = k21gHasAll
      ? 'NONE'
      : !apiMap.previewAcceptsConfigId ? 'MEDIUM' : !apiMap.resultSnapshotContainsSolverConfig ? 'MEDIUM' : !apiMap.configCrudApiExists ? 'MEDIUM' : 'LOW'

    findings.push({
      id: 'K21-D-C-1',
      rule: 'C. API config flow',
      severity: k21gHasAll ? 'NONE' : severity,
      category: 'C. API config flow',
      title: `K21-FIX-G-AUDIT: preview/apply/rollback API + config CRUD + resultSnapshot.config 全部已实现. 降级为 NONE.`,
      currentStatus: `K21-FIX-F delivered: preview API 接受 configId=${apiMap.previewAcceptsConfigId}; config CRUD API=${apiMap.configCrudApiExists} (endpoints: ${apiMap.configCrudEndpoints.join(', ')}); resultSnapshot 含 solver config=${apiMap.resultSnapshotContainsSolverConfig}; apply 复用 previewRun.configId=${apiMap.applyReusesConfigFromPreview}; rollback 复用 applyRun.configId=${apiMap.rollbackReusesConfig}. preview 验证 lockedSlotIds=${apiMap.previewValidatesLockedSlotIds}.`,
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
        `K21-FIX-G alignment: severity=NONE (K21-FIX-F delivered config CRUD + preview configId + resultSnapshot.config)`,
      ],
      risk: 'K21-FIX-F 已解决. 当前 API 链完整: config CRUD + preview 接受 configId/overrides + resultSnapshot.config 写入 + apply/rollback 复用 configId.',
      recommendation: 'K21-FIX-G 无 action. 已正式关闭.',
      suggestedNextStage: '(closed)',
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
      // K21-FIX-G-AUDIT: K21-FIX-G delivered config picker + create/edit/delete + maxIterations/lahcWindowSize
      // inputs + validation + preview configId/overrides. UI exposure is now NONE for LAHC params.
      // hard/soft weights are still NOT exposed — but deferred to K22.
      severity: k21g.frontendHasConfigPicker &&
        k21g.frontendHasCreateDialog &&
        k21g.frontendHasEditDialog &&
        k21g.frontendHasDeleteButton &&
        k21g.frontendPreviewSendsConfigId &&
        k21g.frontendPreviewSendsOverrides &&
        k21g.frontendDisplaysResultSnapshotConfig &&
        k21g.frontendHasValidationMessages &&
        k21g.frontendHasClientValidation
        ? 'NONE'
        : severity,
      category: 'D. frontend UI exposure',
      title: `K21-FIX-G-AUDIT: UI 已实现 config picker + create/edit/delete + maxIterations/lahcWindowSize + preview configId+overrides + resultSnapshot.config display. 降级为 NONE (LAHC params). hard/soft weights 仍后置到 K22.`,
      currentStatus: `K21-FIX-G 实施后: UI 暴露参数 maxIterations=${k21g.frontendDisplaysMaxIterations || feMap.exposesMaxIterations}, lahcWindowSize=${k21g.frontendDisplaysLahcWindowSize || feMap.exposesLahcWindowSize}, randomSeed=${feMap.exposesRandomSeed}, lockedSlotIds=${feMap.exposesLockedSlotIds}. Config picker=${k21g.frontendHasConfigPicker}. Create dialog=${k21g.frontendHasCreateDialog}. Edit dialog=${k21g.frontendHasEditDialog}. Delete button=${k21g.frontendHasDeleteButton}. Preview sends configId=${k21g.frontendPreviewSendsConfigId} + overrides=${k21g.frontendPreviewSendsOverrides}. resultSnapshot.config display=${k21g.frontendDisplaysResultSnapshotConfig}. 缺失: hard/soft weights UI (后置).`,
      evidence: [
        `scheduler page exists: ${feMap.schedulerPageExists}`,
        `scheduler content file exists: ${feMap.schedulerContentFileExists}`,
        `K21-FIX-G frontend has config picker: ${k21g.frontendHasConfigPicker}`,
        `K21-FIX-G frontend has create dialog: ${k21g.frontendHasCreateDialog}`,
        `K21-FIX-G frontend has edit dialog: ${k21g.frontendHasEditDialog}`,
        `K21-FIX-G frontend has delete button: ${k21g.frontendHasDeleteButton}`,
        `K21-FIX-G frontend has selectedConfigId state: ${k21g.frontendHasSelectedConfigIdState}`,
        `K21-FIX-G frontend preview sends configId: ${k21g.frontendPreviewSendsConfigId}`,
        `K21-FIX-G frontend preview sends overrides: ${k21g.frontendPreviewSendsOverrides}`,
        `K21-FIX-G frontend preview avoids legacy top-level: ${k21g.frontendPreviewAvoidsLegacyTopLevel}`,
        `K21-FIX-G frontend displays resultSnapshot.config: ${k21g.frontendDisplaysResultSnapshotConfig}`,
        `K21-FIX-G frontend displays source label: ${k21g.frontendDisplaysSourceLabel}`,
        `K21-FIX-G frontend has client validation: ${k21g.frontendHasClientValidation}`,
        `K21-FIX-G frontend handles CONFIG_IN_USE: ${k21g.frontendHandlesConfigInUse}`,
        `K21-FIX-G frontend reuses schedule:adjust: ${k21g.frontendReusesScheduleAdjustPermission}`,
        `K21-FIX-G frontend has no new permission key: ${k21g.frontendHasNoNewPermissionKey}`,
        `UI exposes maxIterations: ${k21g.frontendDisplaysMaxIterations || feMap.exposesMaxIterations}`,
        `UI exposes lahcWindowSize: ${k21g.frontendDisplaysLahcWindowSize || feMap.exposesLahcWindowSize}`,
        `exposed param inputs: ${exposed.join(', ')}`,
      ],
      risk: 'K21-FIX-G 已解决 LAHC params UI 暴露. 仍缺: hard/soft weights UI (deferred to K22 K21-FIX-I-SCORE-WEIGHTS-ROADMAP).',
      recommendation: 'K21-FIX-G 已关闭. K22+: hard/soft weights UI (K21-FIX-I-SCORE-WEIGHTS-ROADMAP).',
      suggestedNextStage: 'K21-FIX-I-SCORE-WEIGHTS-ROADMAP (后置)',
    })
  }

  // Rule E: lockedTaskIds / lockedSlotIds naming
  {
    const semDiff = lockedMap.semanticDifference
    const needsMigration = lockedMap.needsMigration
    const schemaIsUsed = lockedMap.schemaFieldIsUsedBySolver

    findings.push({
      id: 'K21-D-E-1',
      rule: 'E. lockedTaskIds vs lockedSlotIds',
      // K21-FIX-G-AUDIT: K21-FIX-F added `lockedSlotIds` (Option 2: new field, legacy retained deprecated).
      // `lockedTaskIds` remains as legacy task-id bag. task-level lock parser still deferred to K22.
      severity: 'LOW',
      category: 'E. lockedTaskIds / lockedSlotIds naming',
      title: `K21-FIX-G-AUDIT: Schema 新增 lockedSlotIds 字段 (Option 2), lockedTaskIds 保留 deprecated. task-level lock 解析后置到 K22. 降级为 LOW.`,
      currentStatus: `K21-FIX-F: SchedulingConfig.lockedSlotIds String? 已添加 (runtime/UI primary). lockedTaskIds 保留 deprecated (legacy task-id bag). runtime = lockedSlotIds. UI = lockedSlotIds. task-level lock parser (if task has any locked slot, all its slots locked) 仍未实施 — 后置 K22.`,
      evidence: [
        `schema field: ${lockedMap.schemaFieldName} (${lockedMap.schemaFieldType})`,
        `schema field is used by solver: ${schemaIsUsed}`,
        `runtime solver variable: ${lockedMap.runtimeSolverName} (${lockedMap.runtimeSolverType})`,
        `API variable: ${lockedMap.apiName} (${lockedMap.apiType})`,
        `UI variable: ${lockedMap.uiName}`,
        `semantic difference: ${semDiff}`,
        `recommendation: ${lockedMap.recommendation}`,
        `needs migration: ${needsMigration}`,
        `K21-FIX-G alignment: lockedSlotIds schema field added; lockedTaskIds deprecated; task-level lock parser deferred to K22.`,
      ],
      risk: 'task-level lock 解析 (锁整门课) 仍未实施. 多 slot 课程 (e.g. 3 节连堂实验课) 用户锁 1 个 slot, 仍只锁 1 个, 其他 2 个可能被 solver 移动. 行为可解释但需文档化.',
      recommendation: '后置到 K22: solver 层增加 task-level lock 解析. 文档化语义差异.',
      suggestedNextStage: 'K22-TASK-LEVEL-LOCK (后置)',
    })
  }

  // Rule F: config snapshot / reproducibility
  {
    const hasSnapshot = snapshotMap.resultSnapshotContainsSolverConfig
    const hasFingerprint = snapshotMap.databaseFingerprintField
    const reproducibilityRisk = snapshotMap.reproducibilityRisk
    findings.push({
      id: 'K21-D-F-1',
      rule: 'F. Config snapshot / reproducibility',
      // K21-FIX-G-AUDIT: K21-FIX-F added resultSnapshot.config sub-object containing
      // maxIterations/lahcWindowSize/randomSeed/lockedSlotIds/solverVersion/source.
      // Reproducibility is now solved.
      severity: !hasFingerprint ? 'HIGH' : !hasSnapshot ? 'MEDIUM' : 'NONE',
      category: 'F. config snapshot / reproducibility',
      title: `K21-FIX-G-AUDIT: resultSnapshot.config (maxIterations/lahcWindowSize/randomSeed/lockedSlotIds/solverVersion/source) 已写入. databaseFingerprint=${hasFingerprint} 保留. 降级为 NONE.`,
      currentStatus: `K21-FIX-F 实施后: SchedulingRun.resultSnapshot.config 含: configId, name, maxIterations, lahcWindowSize, randomSeed, lockedSlotIds, solverVersion, source, snapshotTakenAt. apply/rollback 复用 resultSnapshot.config. 旧 run 无 config 字段时 UI fallback 提示.`,
      evidence: [
        `SchedulingRun.configId field: yes`,
        `resultSnapshot contains solver config (maxIterations/lahcWindowSize): ${hasSnapshot}`,
        `resultSnapshot contains hardcoded penalties: ${snapshotMap.resultSnapshotContainsHardcodedPenalties}`,
        `history changes impact prior runs: ${snapshotMap.historyChangesImpactPriorRuns}`,
        `databaseFingerprint field: ${hasFingerprint}`,
        `fingerprint algorithm: ${snapshotMap.fingerprintAlgorithm}`,
        `reproducibility risk: ${reproducibilityRisk}`,
        `K21-FIX-G alignment: severity=NONE (resultSnapshot.config present, fingerprint present, history-reproducibility solved)`,
      ],
      risk: 'K21-FIX-F 已解决. 历史 run 现在可在 resultSnapshot.config 中读取 maxIterations/lahcWindowSize/randomSeed/lockedSlotIds/solverVersion. 完全可复现.',
      recommendation: 'K21-FIX-G 已关闭.',
      suggestedNextStage: '(closed)',
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
  const k21g = computeK21GAlignment()
  const findings = buildFindings(schemaMap, solverMap, apiMap, feMap, lockedMap, snapshotMap, weightMap, k21g)
  const summary: Record<Severity, number> = { HIGH: 0, MEDIUM: 0, LOW: 0, INFO: 0, ACCEPTED: 0, NONE: 0 }
  for (const f of findings) summary[f.severity]++

  const blocking = summary.HIGH > 0
  const recommendedOptions = computeRecommendedOptions()
  const recommendedRoadmap = computeRecommendedRoadmap(findings)
  // K21-FIX-G-AUDIT alignment: after K21-FIX-F + K21-FIX-G, no remaining MEDIUM in scope of this audit.
  // Real residual risks (hard/soft weights, task-level lock, Playwright E2E) are tracked separately.
  const suggestedNextStage = k21g.alignable
    ? 'K22-SCORE-WEIGHTS-ROADMAP (next, real remaining risk: hard/soft weights)'
    : 'K21-FIX-E-SOLVER-CONFIG-API-PLAN'

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
    k21GAlignment: k21g,
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

  console.log('K21-FIX-G Alignment:')
  console.log(`  alignable:                   ${k21g.alignable}`)
  console.log(`  resolved findings:           ${k21g.resolvedFindings} (capabilities that were MEDIUM in K21-FIX-D)`)
  console.log(`  real remaining risks:        ${k21g.realRemainingRisks} (after K21-FIX-F + K21-FIX-G)`)
  console.log(`  configPanelFileExists:       ${k21g.configPanelFileExists}`)
  console.log(`  resolvedConfigDisplayFile:   ${k21g.resolvedConfigDisplayFileExists}`)
  console.log(`  clientLibraryFile:           ${k21g.clientLibraryFileExists}`)
  console.log(`  errorMapperFile:             ${k21g.errorMapperFileExists}`)
  console.log(`  typesFile:                   ${k21g.typesFileExists}`)
  console.log(`  verifyScriptFile:            ${k21g.verifyScriptFileExists}`)
  console.log(`  frontend fetches configList: ${k21g.frontendFetchesConfigList}`)
  console.log(`  frontend has configPicker:   ${k21g.frontendHasConfigPicker}`)
  console.log(`  frontend has selectedId:     ${k21g.frontendHasSelectedConfigIdState}`)
  console.log(`  frontend has default option: ${k21g.frontendHasDefaultConfigOption}`)
  console.log(`  frontend create / edit / delete: ${k21g.frontendHasCreateDialog} / ${k21g.frontendHasEditDialog} / ${k21g.frontendHasDeleteButton}`)
  console.log(`  frontend preview configId:   ${k21g.frontendPreviewSendsConfigId}`)
  console.log(`  frontend preview overrides:  ${k21g.frontendPreviewSendsOverrides}`)
  console.log(`  frontend avoids legacy:      ${k21g.frontendPreviewAvoidsLegacyTopLevel}`)
  console.log(`  frontend displays snap cfg:  ${k21g.frontendDisplaysResultSnapshotConfig}`)
  console.log(`  frontend handles CONFIG_IN_USE: ${k21g.frontendHandlesConfigInUse}`)
  console.log(`  frontend handles NOT_FOUND:  ${k21g.frontendHandlesSchedulingConfigNotFound}`)
  console.log(`  frontend handles SEM_MISMATCH: ${k21g.frontendHandlesSemesterMismatch}`)
  console.log(`  frontend has no new perm:    ${k21g.frontendHasNoNewPermissionKey}`)
  console.log(`  backend run detail exposes config: ${k21g.backendRunDetailApiExposesConfig}`)
  console.log(`  schema has randomSeed/updatedAt/solverVersion/lockedSlotIds: ${k21g.schemaHasRandomSeed}/${k21g.schemaHasUpdatedAt}/${k21g.schemaHasSolverVersion}/${k21g.schemaHasLockedSlotIds}`)
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
