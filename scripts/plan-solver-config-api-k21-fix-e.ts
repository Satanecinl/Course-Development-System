/**
 * K21-FIX-E Solver Config API Plan
 *
 * Read-only planning script. Designs:
 *   - Rule A: SchedulingConfig schema migration plan
 *   - Rule B: Config CRUD API design
 *   - Rule C: Preview API config flow (configId + overrides)
 *   - Rule D: Apply / rollback config flow
 *   - Rule E: resultSnapshot config snapshot structure
 *   - Rule F: lockedTaskIds / lockedSlotIds compatibility
 *   - Rule G: Hard / soft weights decision (deferred)
 *
 * Strong constraints:
 *   - NO Prisma writes.
 *   - NO schema / migration / business code modification.
 *   - NO db push / migrate / reset / seed.
 *   - NO API / solver / frontend modification.
 *
 * Output:
 *   - Terminal summary
 *   - docs/k21-solver-config-api-plan.json
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

interface Decision {
  id: string
  category: string
  decision: string
  options: string[]
  recommendation: string
  rationale: string
  implementationStage: string
}

interface Risk {
  id: string
  severity: 'HIGH' | 'MEDIUM' | 'LOW' | 'INFO'
  title: string
  reason: string
  mitigation: string
}

interface FieldPlan {
  fieldName: string
  type: string
  nullable: boolean
  defaultValue: string | null
  inThisStage: boolean
  reason: string
  riskIfAdded: string
  riskIfDeferred: string
}

interface K21EPlan {
  generatedAt: string
  phase: string
  mode: 'read-only'
  database: {
    semesterCount: number
    schedulingConfigCount: number
    schedulingRunCount: number
    schedulingRunWithConfigIdCount: number
    schedulerRunChangeCount: number
  }
  currentState: {
    schedulingConfigFields: string[]
    schedulingRunModeValues: string[]
    resultSnapshotActualFields: string[]
    previewApiAcceptsConfigId: boolean
    applyApiReusesConfigId: boolean
    frontendExposesConfigPicker: boolean
    configCrudApiExists: boolean
    lockedTaskIdsDbCount: number
  }
  summary: {
    totalDecisions: number
    totalRisks: number
    bySeverity: Record<string, number>
  }
  schemaMigrationPlan: {
    fields: FieldPlan[]
    migrationRisk: string
    backfillRequired: boolean
  }
  apiDesign: {
    endpoints: Array<{
      method: string
      path: string
      permission: string
      description: string
      inThisStage: boolean
    }>
    requestValidationRules: string[]
    responseShapes: Record<string, unknown>
  }
  previewConfigFlow: {
    requestShape: Record<string, unknown>
    priorityRule: string
    semesterMismatchHandling: string
    configNotFoundHandling: string
    resultSnapshotConfigStructure: Record<string, unknown>
  }
  applyRollbackConfigFlow: {
    applyReceivesConfigId: boolean
    applyReusesPreviewConfigId: boolean
    rollbackReusesApplyConfigId: boolean
    resultSnapshotConfigPreserved: boolean
    reproducibilityStrategy: string
  }
  resultSnapshotDesign: {
    snapshotFields: string[]
    snapshotStructure: Record<string, unknown>
    fingerprintStrategy: string
  }
  lockedIdsCompatibility: {
    selectedOption: string
    optionRationale: string
    migrationImpact: string
    uiImpact: string
    taskLevelLockDeferred: boolean
  }
  weightConfigDecision: {
    hardWeights: string
    softWeights: string
    inThisStage: boolean
    deferredReason: string
    alternativeStorage: string
  }
  implementationPlan: Array<{
    step: number
    title: string
    description: string
    inScope: boolean
  }>
  risks: Risk[]
  decisions: Decision[]
  verificationPlan: string[]
  suggestedNextStage: string
}

// ── Plan Logic ────────────────────────────────────────────────────────

async function collectCurrentState() {
  const schema = readFile('prisma/schema.prisma')
  const schedulingConfigBlock = schema.match(/model SchedulingConfig \{[\s\S]*?\n\}/)?.[0] || ''
  const schedulingRunBlock = schema.match(/model SchedulingRun \{[\s\S]*?\n\}/)?.[0] || ''

  const fieldLines = schedulingConfigBlock
    .split('\n')
    .map((l) => l.trim())
    .filter((l) => l && !l.startsWith('//') && !l.startsWith('@@') && !l.startsWith('}'))
  const schedulingConfigFields: string[] = []
  for (const l of fieldLines) {
    const m = l.match(/^(\w+)/)
    if (m) schedulingConfigFields.push(m[1])
  }

  // mode values
  const modeMatch = schedulingRunBlock.match(/\/\/\s*(PREVIEW\s*\|\s*APPLY\s*\|\s*ROLLBACK)/)
  const schedulingRunModeValues = modeMatch ? modeMatch[1].split(/\s*\|\s*/).map((s) => s.trim()) : []

  // actual resultSnapshot fields
  const previewFile = readFile('src/lib/scheduler/preview.ts')
  const snapshotMatch = previewFile.match(/resultSnapshot\s*=\s*JSON\.stringify\(\{([\s\S]*?)\}\)/)
  const resultSnapshotActualFields: string[] = []
  if (snapshotMatch) {
    for (const line of snapshotMatch[1].split('\n')) {
      const m = line.match(/^\s*(\w+),?/)
      if (m && m[1] !== '') resultSnapshotActualFields.push(m[1])
    }
  }

  const previewApiAcceptsConfigId = fileContains('src/app/api/admin/scheduler/preview/route.ts', 'configId')
  const applyApiReusesConfigId = fileContains('src/lib/scheduler/apply.ts', 'previewRun.configId')
  const frontendExposesConfigPicker = fileContains('src/app/admin/scheduler/scheduler-content.tsx', 'configId')
  const configCrudApiExists =
    fileExists('src/app/api/admin/scheduler/configs/route.ts') ||
    fileExists('src/app/api/admin/scheduler/config/[id]/route.ts')

  // Count schedulingRuns with non-null configId
  const runsWithConfigId = await prisma.schedulingRun.findMany({
    where: { configId: { gt: 0 } },
    select: { id: true },
  })
  const schedulingRunWithConfigIdCount = runsWithConfigId.length

  // Count lockedTaskIds in DB
  const configs = await prisma.schedulingConfig.findMany({ select: { lockedTaskIds: true } })
  const lockedTaskIdsDbCount = configs.filter((c) => c.lockedTaskIds && c.lockedTaskIds !== '[]').length

  return {
    schedulingConfigFields,
    schedulingRunModeValues,
    resultSnapshotActualFields,
    previewApiAcceptsConfigId,
    applyApiReusesConfigId,
    frontendExposesConfigPicker,
    configCrudApiExists,
    lockedTaskIdsDbCount,
    schedulingRunWithConfigIdCount,
  }
}

function planSchemaMigration(): { fields: FieldPlan[]; migrationRisk: string; backfillRequired: boolean } {
  const fields: FieldPlan[] = [
    {
      fieldName: 'randomSeed',
      type: 'Int?',
      nullable: true,
      defaultValue: null,
      inThisStage: true,
      reason: '保存 config 默认 seed, 同一 config 可复现结果. 当前 SchedulingConfig 缺此字段, seed 每次随机.',
      riskIfAdded: 'low (nullable, 无 default, 旧 config 行为不变)',
      riskIfDeferred: 'MEDIUM (config 不可复现, 用户每次跑都不同)',
    },
    {
      fieldName: 'updatedAt',
      type: 'DateTime @updatedAt',
      nullable: false,
      defaultValue: 'now()',
      inThisStage: true,
      reason: 'Prisma 标准 updatedAt 字段, 自动维护. 当前 SchedulingConfig 缺此字段, 修改无法追溯.',
      riskIfAdded: 'low (Prisma 自动管理)',
      riskIfDeferred: 'LOW (运维不便, 不影响功能)',
    },
    {
      fieldName: 'solverVersion',
      type: 'String?',
      nullable: true,
      defaultValue: null,
      inThisStage: true,
      reason: '标记 config 创建时的 solver 版本. 升级 solver 后, 旧 config 仍用旧版算法.',
      riskIfAdded: 'low (nullable)',
      riskIfDeferred: 'MEDIUM (升级时无法区分旧/新 config)',
    },
    {
      fieldName: 'lockedSlotIds',
      type: 'String?',
      nullable: true,
      defaultValue: null,
      inThisStage: true,
      reason: '新增 slot-level lock 字段, runtime 实际用 lockedSlotIds. 旧 lockedTaskIds 保留 deprecated.',
      riskIfAdded: 'low (nullable, 旧代码不改, 旧数据保留)',
      riskIfDeferred: 'MEDIUM (runtime/UI 仍用 slot, schema 缺字段, 命名误导持续)',
    },
    {
      fieldName: 'hardWeights',
      type: 'String? (JSON)',
      nullable: true,
      defaultValue: null,
      inThisStage: false,
      reason: 'HC1-HC5 权重配置. score.ts refactor 风险大, 7 项常见软约束尚未覆盖.',
      riskIfAdded: 'HIGH (score.ts 需 refactor 接收 dynamic weights, regression test 全套需重跑)',
      riskIfDeferred: 'LOW (当前 hardcoded -1000 工作正常, 暂不影响主线)',
    },
    {
      fieldName: 'softWeights',
      type: 'String? (JSON)',
      nullable: true,
      defaultValue: null,
      inThisStage: false,
      reason: 'SC1-SC4 + MIN_PERT 权重配置. 同 hardWeights 风险.',
      riskIfAdded: 'HIGH (同 hardWeights)',
      riskIfDeferred: 'LOW (同 hardWeights)',
    },
    {
      fieldName: 'configSnapshot',
      type: 'String? (JSON)',
      nullable: true,
      defaultValue: null,
      inThisStage: false,
      reason: '如果 resultSnapshot 已承担完整 config snapshot 任务, 单独 configSnapshot 字段冗余. 决定: 在 SchedulingRun.resultSnapshot 写入, 不在 SchedulingConfig 加此字段.',
      riskIfAdded: 'low (nullable)',
      riskIfDeferred: 'INFO (snapshot 写入 SchedulingRun.resultSnapshot 即可)',
    },
  ]

  return {
    fields,
    migrationRisk: 'low. 全部新增 nullable 字段, 无 default 强制值, 旧数据保留. 推荐 prisma db push (additive) 而非 migrate dev.',
    backfillRequired: false,
  }
}

function planApiDesign(): {
  endpoints: Array<{ method: string; path: string; permission: string; description: string; inThisStage: boolean }>
  requestValidationRules: string[]
  responseShapes: Record<string, unknown>
} {
  return {
    endpoints: [
      {
        method: 'GET',
        path: '/api/admin/scheduler/configs',
        permission: 'schedule:adjust',
        description: '列出所有 SchedulingConfig, 支持 ?semesterId= 过滤',
        inThisStage: true,
      },
      {
        method: 'POST',
        path: '/api/admin/scheduler/configs',
        permission: 'schedule:adjust',
        description: '创建新 SchedulingConfig, name 必填, 其他字段可选',
        inThisStage: true,
      },
      {
        method: 'GET',
        path: '/api/admin/scheduler/configs/[id]',
        permission: 'schedule:adjust',
        description: '获取单个 SchedulingConfig 详情',
        inThisStage: true,
      },
      {
        method: 'PUT',
        path: '/api/admin/scheduler/configs/[id]',
        permission: 'schedule:adjust',
        description: '更新 SchedulingConfig, 全字段可选 (partial update)',
        inThisStage: true,
      },
      {
        method: 'DELETE',
        path: '/api/admin/scheduler/configs/[id]',
        permission: 'schedule:adjust',
        description: '删除 SchedulingConfig, 若有 SchedulingRun.configId 引用则禁止删除 (409)',
        inThisStage: true,
      },
    ],
    requestValidationRules: [
      'name: 必填, 1-100 字符',
      'semesterId: 可选, 必须是 DB 中已存在的 Semester.id',
      'maxIterations: 可选, 范围 100-15000',
      'lahcWindowSize: 可选, 范围 50-2000',
      'randomSeed: 可选, 范围 0-2147483647',
      'lockedTaskIds / lockedSlotIds: 可选, JSON 数组字符串',
      'solverVersion: 可选, 1-50 字符',
    ],
    responseShapes: {
      config: {
        id: 'number',
        name: 'string',
        semesterId: 'number | null',
        maxIterations: 'number',
        lahcWindowSize: 'number',
        randomSeed: 'number | null',
        lockedTaskIds: 'string',
        lockedSlotIds: 'string | null',
        solverVersion: 'string | null',
        createdAt: 'string (ISO)',
        updatedAt: 'string (ISO)',
      },
      list: {
        configs: 'Config[]',
        total: 'number',
      },
    },
  }
}

function planPreviewConfigFlow(): {
  requestShape: Record<string, unknown>
  priorityRule: string
  semesterMismatchHandling: string
  configNotFoundHandling: string
  resultSnapshotConfigStructure: Record<string, unknown>
} {
  return {
    requestShape: {
      semesterId: 'number (optional, fallback to active semester)',
      configId: 'number (optional, load from DB)',
      overrides: {
        maxIterations: 'number (optional, override config.maxIterations)',
        lahcWindowSize: 'number (optional, override config.lahcWindowSize)',
        randomSeed: 'number (optional, override config.randomSeed)',
        lockedSlotIds: 'number[] (optional, override config.lockedSlotIds)',
      },
    },
    priorityRule:
      'overrides 字段 > configId 加载的 config 字段 > server-side default (10000/500/null/[]). ' +
      '若某字段在 overrides 中提供, 使用 overrides 值; 否则从 config 加载; 否则用 server default.',
    semesterMismatchHandling:
      '若 config.semesterId !== request.semesterId, 视为 validation error 400 SEMESTER_MISMATCH. ' +
      'config 是 semester-scoped, 不允许跨学期使用. ' +
      '若 config.semesterId === null, 表示 "default config", 任何学期都可用.',
    configNotFoundHandling:
      '若 configId 不存在, 返回 404 SCHEDULING_CONFIG_NOT_FOUND. ' +
      '若 configId 存在但 semester mismatch, 返回 400 SEMESTER_MISMATCH.',
    resultSnapshotConfigStructure: {
      config: {
        configId: 'number | null (source configId)',
        name: 'string | null',
        maxIterations: 'number (resolved value used)',
        lahcWindowSize: 'number (resolved value used)',
        randomSeed: 'number | null (resolved value used)',
        lockedSlotIds: 'number[] (resolved value used)',
        solverVersion: 'string (e.g. "lahc-hard-first-v3")',
        source: '"CONFIG" | "INLINE" | "DEFAULT" | "MIXED" (where did resolved value come from)',
        snapshotTakenAt: 'string (ISO timestamp)',
      },
    },
  }
}

function planApplyRollbackConfigFlow(): {
  applyReceivesConfigId: boolean
  applyReusesPreviewConfigId: boolean
  rollbackReusesApplyConfigId: boolean
  resultSnapshotConfigPreserved: boolean
  reproducibilityStrategy: string
} {
  return {
    applyReceivesConfigId: false,
    applyReusesPreviewConfigId: true,
    rollbackReusesApplyConfigId: true,
    resultSnapshotConfigPreserved: true,
    reproducibilityStrategy:
      'preview 阶段: resultSnapshot.config 记录 resolved config (含 source: "CONFIG"/"INLINE"/"DEFAULT"/"MIXED"). ' +
      'apply 阶段: 从 previewRun.resultSnapshot 读取 resolved config, 写 applyRun.configId = previewRun.configId, ' +
      'applyRun.resultSnapshot 包含完整 config snapshot. ' +
      'rollback 阶段: 从 applyRun.resultSnapshot 读取 config, 写 rollbackRun.configId = applyRun.configId, ' +
      'rollbackRun.resultSnapshot 包含 config snapshot (用于审计, 实际不需配置). ' +
      '历史 run 复现性: 通过 resultSnapshot.config 即可知道当时用的 maxIterations/lahcWindowSize/randomSeed/lockedSlotIds.',
  }
}

function planResultSnapshotDesign(): {
  snapshotFields: string[]
  snapshotStructure: Record<string, unknown>
  fingerprintStrategy: string
} {
  return {
    snapshotFields: [
      'scoreBefore/After',
      'hcBefore/After (hc1-hc4)',
      'proposedChanges',
      'blockReasons',
      'solverMetrics',
      'lockedSlotIds',
      'lockedSlotCount',
      'semesterId/Code/Name',
      'config (NEW: resolved config snapshot)',
    ],
    snapshotStructure: {
      scoreBefore: '{ hardScore, softScore }',
      scoreAfter: '{ hardScore, softScore }',
      hcBefore: '{ hc1, hc2, hc3, hc4 }',
      hcAfter: '{ hc1, hc2, hc3, hc4 }',
      proposedChanges: 'PreviewProposedChange[]',
      blockReasons: 'string[]',
      solverMetrics: '{ attemptedMoves, acceptedMoves, ... } | null',
      lockedSlotIds: 'number[]',
      lockedSlotCount: 'number',
      semesterId: 'number',
      semesterCode: 'string',
      semesterName: 'string',
      config: {
        configId: 'number | null',
        name: 'string | null',
        maxIterations: 'number',
        lahcWindowSize: 'number',
        randomSeed: 'number | null',
        lockedSlotIds: 'number[]',
        solverVersion: 'string',
        source: '"CONFIG" | "INLINE" | "DEFAULT" | "MIXED"',
        snapshotTakenAt: 'string (ISO)',
      },
    },
    fingerprintStrategy:
      '保留 databaseFingerprint 字段 (sha256(semesterId:slotCount:slot:teachingTaskId:dayOfWeek:slotIndex:roomId)[:16]). ' +
      '作用: apply 阶段校验 DB 未被并发修改. ' +
      'config snapshot 写入 resultSnapshot 即可, 不需要单独 fingerprint (config 是 immutable within a run).',
  }
}

function planLockedIdsCompatibility(): {
  selectedOption: string
  optionRationale: string
  migrationImpact: string
  uiImpact: string
  taskLevelLockDeferred: boolean
} {
  return {
    selectedOption: 'Option 2: 新增 lockedSlotIds 字段, 旧 lockedTaskIds 保留 deprecated',
    optionRationale:
      '当前 DB 中 lockedTaskIds 数据为 0 (按 K21-FIX-D 审计), migration 风险低. ' +
      '新增 lockedSlotIds 字段, 旧 lockedTaskIds 保留 (标 @deprecated 注释), UI/runtime 全部改用 lockedSlotIds. ' +
      '比 Option 1 (alias) 更清晰, 比 Option 3 (rename + 迁移) 风险低. ' +
      'task-level lock 解析后置到 K22 (Option C 方案).',
    migrationImpact: 'low. 新增 nullable String 字段, 旧数据全部 null, 不影响.',
    uiImpact: 'low. UI 改用 lockedSlotIds, lockedTaskIds UI 已不存在, 无破坏性变更.',
    taskLevelLockDeferred: true,
  }
}

function planWeightConfigDecision(): {
  hardWeights: string
  softWeights: string
  inThisStage: boolean
  deferredReason: string
  alternativeStorage: string
} {
  return {
    hardWeights: 'deferred to K22 (K21-FIX-I-SCORE-WEIGHTS-ROADMAP)',
    softWeights: 'deferred to K22 (K21-FIX-I-SCORE-WEIGHTS-ROADMAP)',
    inThisStage: false,
    deferredReason:
      'score.ts 接收 dynamic weights 需要 refactor, 风险大. ' +
      '7 项常见软约束尚未覆盖 (教师均衡/班级空洞/教室稳定/实训匹配等), 应先实施 SC5+ 再做 weight 配置. ' +
      '本轮仅做 LAHC params (maxIterations/lahcWindowSize/randomSeed/lockedSlotIds), 不做 weight. ' +
      'regression test (23/31 PASS 套件) 需重跑, 风险累积.',
    alternativeStorage:
      '若未来需要记录 "当时用的 weight", 写入 SchedulingRun.resultSnapshot.config.hardWeights/softWeights 即可. ' +
      '不需要在 SchedulingConfig schema 提前加字段.',
  }
}

function buildDecisions(): Decision[] {
  return [
    {
      id: 'D-1',
      category: 'Schema Migration',
      decision: '本轮新增 4 个字段: randomSeed, updatedAt, solverVersion, lockedSlotIds',
      options: ['仅 randomSeed + updatedAt', '全部 7 个字段 (含 hard/soft weights)', '仅最关键的 4 个'],
      recommendation: '仅最关键的 4 个 (本轮)',
      rationale:
        'randomSeed / updatedAt / solverVersion 是低风险高价值字段. ' +
        'lockedSlotIds 解决命名误导. ' +
        'hard/soft weights 高风险, 推迟. configSnapshot 写入 resultSnapshot 即可, 不需 SchedulingConfig.',
      implementationStage: 'K21-FIX-F-SOLVER-CONFIG-API-IMPLEMENTATION',
    },
    {
      id: 'D-2',
      category: 'API Design',
      decision: '5 个 config CRUD endpoint, 全部使用 schedule:adjust 权限',
      options: ['仅 GET + POST (read + create)', 'GET + POST + PUT + DELETE (full CRUD)', '5 endpoint (含 [id] detail)'],
      recommendation: '5 endpoint full CRUD',
      rationale: '完整 CRUD 符合 RESTful, 用户可管理 config 列表. 删除时检查 SchedulingRun.configId 引用.',
      implementationStage: 'K21-FIX-F-SOLVER-CONFIG-API-IMPLEMENTATION',
    },
    {
      id: 'D-3',
      category: 'Preview API',
      decision: 'preview 接受 configId + overrides 两个层次, 优先级: overrides > configId > server default',
      options: [
        '仅 configId (无 inline override)',
        '仅 inline override (无 configId)',
        'configId + overrides (本轮推荐)',
      ],
      recommendation: 'configId + overrides',
      rationale:
        'configId 提供 "保存的配置" 概念, overrides 提供 "本次试验" 灵活性. ' +
        '用户可加载 config 后微调, 也可完全用 inline 不用 config. ' +
        '若 configId 不存在, 返回 404; 若 semester mismatch, 返回 400.',
      implementationStage: 'K21-FIX-F-SOLVER-CONFIG-API-IMPLEMENTATION',
    },
    {
      id: 'D-4',
      category: 'Apply / Rollback',
      decision: 'apply 仅接受 previewRunId, 复用 previewRun.configId 和 resultSnapshot.config',
      options: [
        'apply 重新读 configId (从 DB)',
        'apply 复用 previewRun.configId (本轮推荐)',
        'apply 接收新 configId 覆盖',
      ],
      recommendation: 'apply 复用 previewRun.configId',
      rationale:
        'apply 不应改变 config, 否则会破坏 "preview 看到什么, apply 就做什么" 的契约. ' +
        '复用 configId 保证 apply 和 preview 严格使用同一组参数. ' +
        'rollback 同理.',
      implementationStage: 'K21-FIX-F-SOLVER-CONFIG-API-IMPLEMENTATION',
    },
    {
      id: 'D-5',
      category: 'ResultSnapshot',
      decision: 'SchedulingRun.resultSnapshot 增 config 字段, 包含 resolved config (maxIterations/lahcWindowSize/randomSeed/lockedSlotIds/solverVersion/source)',
      options: [
        '在 SchedulingRun 加新字段 configSnapshot String',
        '在 resultSnapshot JSON 内增 config 子对象 (本轮推荐)',
        '不记录 config, 仅记录 configId (当前实现)',
      ],
      recommendation: '在 resultSnapshot JSON 内增 config 子对象',
      rationale:
        '结果快照已经存了 lockedSlotIds 和 randomSeed, 加 config 子对象统一管理. ' +
        'config 字段含 source 标记 (CONFIG/INLINE/DEFAULT/MIXED), 便于追溯. ' +
        '不需新 schema 字段, 仅修改 preview.ts 序列化逻辑.',
      implementationStage: 'K21-FIX-F-SOLVER-CONFIG-API-IMPLEMENTATION',
    },
    {
      id: 'D-6',
      category: 'Locked IDs Compatibility',
      decision: '新增 lockedSlotIds 字段, 旧 lockedTaskIds 保留 deprecated, runtime/UI 全部改用 lockedSlotIds',
      options: [
        'Option 1: 保留双名 alias',
        'Option 2: 新增 lockedSlotIds, 旧 lockedTaskIds 保留 deprecated (本轮推荐)',
        'Option 3: rename lockedTaskIds → lockedSlotIds + migrate',
      ],
      recommendation: 'Option 2',
      rationale:
        '当前 DB 中 lockedTaskIds 数据为 0 (K21-FIX-D 审计), migration 风险低. ' +
        'Option 1 alias 不清晰; Option 3 rename 需改 schema field name, 风险更高. ' +
        'Option 2 增字段 + 旧字段 deprecated, 平滑过渡.',
      implementationStage: 'K21-FIX-F-SOLVER-CONFIG-API-IMPLEMENTATION (新增字段) + K21-FIX-G-SOLVER-CONFIG-UI (UI 切换) + K21-FIX-E-LOCKED-SLOT-NAMING-AUDIT (parallel, 决策 task-level lock)',
    },
    {
      id: 'D-7',
      category: 'Hard / Soft Weights',
      decision: '本轮不实施 weight 配置, 推迟到 K22 (K21-FIX-I-SCORE-WEIGHTS-ROADMAP)',
      options: [
        '本轮实施 hard/soft weights JSON 字段 + score.ts refactor',
        '本轮仅加 hard/soft weights 字段, 不做 score.ts refactor (字段暂存不用)',
        '本轮不实施 (本轮推荐)',
      ],
      recommendation: '本轮不实施',
      rationale:
        'score.ts refactor 风险大, 7 项常见软约束未覆盖. ' +
        '应先 SC5+ 实施再做 weight 配置. ' +
        'regression test 风险累积. ' +
        '若未来需记录 "当时用的 weight", 可写入 resultSnapshot.config.hardWeights/softWeights.',
      implementationStage: 'K22+ (K21-FIX-I-SCORE-WEIGHTS-ROADMAP)',
    },
  ]
}

function buildRisks(): Risk[] {
  return [
    {
      id: 'R-1',
      severity: 'MEDIUM',
      title: 'resultSnapshot.config 修改会破坏旧 resultSnapshot 解析',
      reason: '若 K21-FIX-F 在 resultSnapshot 中增 config 子对象, 旧 client 解析新 JSON 会忽略新字段 (兼容). 但 K21-FIX-G 之前, 旧 resultSnapshot 仍可读. 风险: 旧 client 不识别新字段, 但不会 crash.',
      mitigation: 'config 子对象用可选字段, 旧 client 忽略. 写文档说明 v2 schema 变化.',
    },
    {
      id: 'R-2',
      severity: 'MEDIUM',
      title: 'preview 接受 configId 后, 旧 client 调用 preview 不带 configId, 行为变化',
      reason: '若 configId 缺失, fallback 到 server default (当前行为). 但若 configId 提供, 行为改变. 旧 client 不带 configId, 行为完全不变 (向后兼容).',
      mitigation: 'configId 完全可选, 缺省时维持现状. 文档说明新字段.',
    },
    {
      id: 'R-3',
      severity: 'LOW',
      title: 'migration 新增字段可能与 Prisma 4 个其他未跟踪字段冲突',
      reason: '当前 schema 没有 lockedSlotIds/randomSeed/updatedAt/solverVersion 字段. 新增不会冲突.',
      mitigation: '无. migration 简单.',
    },
    {
      id: 'R-4',
      severity: 'LOW',
      title: 'apply 复用 configId 可能与 "apply 时改 config" 期望冲突',
      reason: '若 admin 在 preview 后改 config, 然后 apply, 当前会复用 previewRun.configId 但 config 内容已变. 行为合理 (preview 看到的是 v1, apply 用 v1).',
      mitigation: '文档说明: apply 严格使用 preview 时刻的 config. 若需用最新 config, 重新 preview.',
    },
    {
      id: 'R-5',
      severity: 'INFO',
      title: 'task-level lock 解析后置',
      reason: '本轮仅做 slot-level lock (lockedSlotIds). task-level lock (锁整门课) 需要在 solver 层增加解析: "if task has any locked slot, all its slots locked". 当前 solver 不支持.',
      mitigation: '后置到 K22 (K21-FIX-E-LOCKED-SLOT-NAMING-AUDIT), 文档化差异.',
    },
    {
      id: 'R-6',
      severity: 'INFO',
      title: 'configSnapshot 字段决定: 写入 SchedulingRun.resultSnapshot, 不写入 SchedulingConfig',
      reason: '若 config 改动, SchedulingConfig.configSnapshot 会过时. 但 SchedulingRun.configSnapshot 是 immutable within a run. 写入 Run 更合理.',
      mitigation: '本轮不实施 SchedulingConfig.configSnapshot 字段. 未来若需要 DB-side snapshot, 单独加.',
    },
  ]
}

function buildImplementationPlan(): Array<{ step: number; title: string; description: string; inScope: boolean }> {
  return [
    {
      step: 1,
      title: 'DB backup',
      description: '执行 prisma/dev.db.backup-before-k21-fix-f-<timestamp> 备份当前 DB.',
      inScope: true,
    },
    {
      step: 2,
      title: 'schema migration (additive, no destructive)',
      description:
        '在 prisma/schema.prisma 的 SchedulingConfig model 增 4 个字段: ' +
        'randomSeed Int?, updatedAt DateTime? @updatedAt, solverVersion String?, lockedSlotIds String? ' +
        '执行 prisma db push (非破坏).',
      inScope: true,
    },
    {
      step: 3,
      title: 'config CRUD API',
      description:
        '新增 5 个 endpoint: GET/POST /api/admin/scheduler/configs, GET/PUT/DELETE /api/admin/scheduler/configs/[id]. ' +
        '使用 schedule:adjust 权限. validation: name 必填, maxIterations 100-15000, lahcWindowSize 50-2000, randomSeed 0-2^31-1, ' +
        'semesterId 必须存在或为 null. ' +
        'DELETE 检查是否有 SchedulingRun.configId 引用, 有则 409 CONFIG_IN_USE.',
      inScope: true,
    },
    {
      step: 4,
      title: 'preview API 接受 configId + overrides',
      description:
        'preview/route.ts 接受 body.configId (optional) 和 body.overrides.{maxIterations,lahcWindowSize,randomSeed,lockedSlotIds} (optional). ' +
        '优先级: overrides > configId 加载的 config 字段 > server default. ' +
        'configId 不存在 → 404. config.semesterId !== request.semesterId → 400 SEMESTER_MISMATCH.',
      inScope: true,
    },
    {
      step: 5,
      title: 'resultSnapshot 增 config 子对象',
      description:
        'preview.ts 的 resultSnapshot JSON 增 config: { configId, name, maxIterations, lahcWindowSize, randomSeed, lockedSlotIds, solverVersion, source, snapshotTakenAt }. ' +
        'source 标记: "CONFIG" (从 configId 加载) / "INLINE" (从 overrides) / "DEFAULT" (server default) / "MIXED" (部分从 config, 部分从 overrides).',
      inScope: true,
    },
    {
      step: 6,
      title: 'apply / rollback 复用 config (无需大改)',
      description: 'apply/rollback 继续复用 previewRun.configId / applyRun.configId. applyRun.resultSnapshot 包含 config 子对象. rollbackRun.resultSnapshot 包含 config 子对象 (审计).',
      inScope: true,
    },
    {
      step: 7,
      title: 'verification',
      description: '运行 K20/K19/K11 chain 验证. 写 K21-FIX-F verify 脚本 (config CRUD + preview configId + apply/rollback config snapshot).',
      inScope: true,
    },
    {
      step: 8,
      title: '前端 config picker UI',
      description: 'K21-FIX-G 阶段: UI 增 maxIterations/lahcWindowSize input + config picker (下拉选 config) + save/reset 按钮.',
      inScope: false,
    },
    {
      step: 9,
      title: 'weight 配置',
      description: 'K22+ 阶段: hardWeights/softWeights JSON 字段 + score.ts refactor + regression verify.',
      inScope: false,
    },
    {
      step: 10,
      title: 'task-level lock 解析',
      description: 'K22+ 阶段: solver 层支持 "if task has any locked slot, all its slots locked".',
      inScope: false,
    },
  ]
}

function buildVerificationPlan(): string[] {
  return [
    '1. audit-solver-config-api-k21-fix-e: PASS (无 finding/blocking)',
    '2. audit-solver-config-ui-k21-fix-d: PASS (HIGH=0, MEDIUM=6)',
    '3. audit-room-capacity-and-solver-config-k21-fix-a: PASS (HIGH=0, MEDIUM=4)',
    '4. audit-remaining-risk-rebase-k20: PASS (HIGH=0, BLOCKING=NO)',
    '5. K20 source evidence verify chain (37+41+16+2 = 96 PASS, 0 FAIL)',
    '6. K19 chain (9+16+17+31 = 73 PASS, 0 FAIL)',
    '7. schedule mutation audit (HIGH=0, MEDIUM=0)',
    '8. prisma validate: PASS (新字段语法合法)',
    '9. build: PASS',
    '10. lint: 不得新增 error (新文件 0 lint issue)',
    '11. test:auth-foundation: 53 passed / 1 failed (pre-existing ScheduleAdjustment ACTIVE count mismatch)',
    '12. K21-FIX-F verify (新增): config CRUD PASS, preview configId PASS, apply/rollback config snapshot PASS',
  ]
}

// ── Main ──────────────────────────────────────────────────────────────

async function main() {
  console.log('K21 Solver Config API Plan')
  console.log('==========================\n')

  const db = {
    semesterCount: await prisma.semester.count(),
    schedulingConfigCount: await prisma.schedulingConfig.count(),
    schedulingRunCount: await prisma.schedulingRun.count(),
    schedulingRunWithConfigIdCount: 0,
    schedulerRunChangeCount: await prisma.schedulerRunChange.count(),
  }
  // Count runs with non-null configId (Prisma 5.22 doesn't support `not: null` for Int)
  const runsWithConfigId = await prisma.schedulingRun.findMany({
    where: { configId: { gt: 0 } },
    select: { id: true },
  })
  db.schedulingRunWithConfigIdCount = runsWithConfigId.length

  const current = await collectCurrentState()
  current.schedulingRunWithConfigIdCount = db.schedulingRunWithConfigIdCount

  const migration = planSchemaMigration()
  const api = planApiDesign()
  const preview = planPreviewConfigFlow()
  const applyRollback = planApplyRollbackConfigFlow()
  const snapshot = planResultSnapshotDesign()
  const lockedIds = planLockedIdsCompatibility()
  const weights = planWeightConfigDecision()
  const decisions = buildDecisions()
  const risks = buildRisks()
  const plan = buildImplementationPlan()
  const verification = buildVerificationPlan()

  const bySeverity: Record<string, number> = { HIGH: 0, MEDIUM: 0, LOW: 0, INFO: 0 }
  for (const r of risks) bySeverity[r.severity]++

  const report: K21EPlan = {
    generatedAt: new Date().toISOString(),
    phase: 'K21-FIX-E-SOLVER-CONFIG-API-PLAN',
    mode: 'read-only',
    database: db,
    currentState: current,
    summary: {
      totalDecisions: decisions.length,
      totalRisks: risks.length,
      bySeverity,
    },
    schemaMigrationPlan: migration,
    apiDesign: api,
    previewConfigFlow: preview,
    applyRollbackConfigFlow: applyRollback,
    resultSnapshotDesign: snapshot,
    lockedIdsCompatibility: lockedIds,
    weightConfigDecision: weights,
    implementationPlan: plan,
    risks,
    decisions,
    verificationPlan: verification,
    suggestedNextStage: 'K21-FIX-F-SOLVER-CONFIG-API-IMPLEMENTATION',
  }

  // Write JSON
  const outDir = path.join(projectRoot, 'docs')
  if (!fs.existsSync(outDir)) fs.mkdirSync(outDir, { recursive: true })
  const outPath = path.join(outDir, 'k21-solver-config-api-plan.json')
  fs.writeFileSync(outPath, JSON.stringify(report, null, 2), 'utf8')

  // Terminal output
  console.log('Summary:')
  console.log(`  decisions: ${decisions.length}`)
  console.log(`  risks:     ${risks.length} (HIGH=${bySeverity.HIGH}, MEDIUM=${bySeverity.MEDIUM}, LOW=${bySeverity.LOW}, INFO=${bySeverity.INFO})`)
  console.log(`  fields planned: ${migration.fields.length} (in this stage: ${migration.fields.filter((f) => f.inThisStage).length})`)
  console.log(`  API endpoints:  ${api.endpoints.length} (in this stage: ${api.endpoints.filter((e) => e.inThisStage).length})`)
  console.log('')

  console.log('DECISIONS:')
  for (const d of decisions) {
    console.log(`  [${d.id}] ${d.category}: ${d.decision}`)
    console.log(`         recommendation: ${d.recommendation}`)
    console.log(`         stage: ${d.implementationStage}`)
  }
  console.log('')

  console.log('RISKS:')
  for (const r of risks) {
    console.log(`  [${r.severity}] ${r.id} ${r.title}`)
  }
  console.log('')

  console.log('SCHEMA MIGRATION PLAN:')
  for (const f of migration.fields) {
    const tag = f.inThisStage ? '✓ THIS STAGE' : '✗ DEFER'
    console.log(`  [${tag}] ${f.fieldName} (${f.type}) — ${f.reason}`)
  }
  console.log('')

  console.log('API DESIGN:')
  for (const e of api.endpoints) {
    console.log(`  ${e.method.padEnd(6)} ${e.path} [${e.permission}] — ${e.description}`)
  }
  console.log('')

  console.log('LOCKED IDS COMPATIBILITY:')
  console.log(`  selected: ${lockedIds.selectedOption}`)
  console.log(`  rationale: ${lockedIds.optionRationale}`)
  console.log('')

  console.log('WEIGHTS DECISION:')
  console.log(`  hardWeights: ${weights.hardWeights}`)
  console.log(`  softWeights: ${weights.softWeights}`)
  console.log(`  in this stage: ${weights.inThisStage}`)
  console.log(`  reason: ${weights.deferredReason}`)
  console.log('')

  console.log('RECOMMENDED IMPLEMENTATION:')
  for (const s of plan.filter((p) => p.inScope)) {
    console.log(`  ${s.step}. ${s.title} — ${s.description}`)
  }
  console.log('')

  console.log('Recommended next stage:')
  console.log(`  ${report.suggestedNextStage}`)
  console.log('')
  console.log(`Report written: docs/k21-solver-config-api-plan.json`)

  await prisma.$disconnect()
}

main().catch((e) => {
  console.error(e)
  prisma.$disconnect().then(() => process.exit(1))
})
