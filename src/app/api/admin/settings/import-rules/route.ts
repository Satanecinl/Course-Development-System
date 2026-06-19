/**
 * K39-B1: Import rules — diagnostic + configurable API.
 *
 * GET /api/admin/settings/import-rules
 * PATCH /api/admin/settings/import-rules
 *
 * Returns import batch stats, source evidence coverage, cross-cohort guard status,
 * lifecycle rules, duplicate import policy, editability boundaries, grouped rules,
 * and config (requireExplicitSemesterForImport).
 *
 * PATCH updates ImportRuleConfig.requireExplicitSemesterForImport.
 * Backward-compatible: legacy summary/rules/safeguards/recentBatches still present.
 */

import { NextResponse, type NextRequest } from 'next/server'
import { requirePermission } from '@/lib/auth/require-permission'
import { prisma } from '@/lib/prisma'
import { getImportRuleConfig, updateImportRuleConfig, validateRequireExplicitSemesterForImport } from '@/lib/settings/import-rule-config'

export async function GET(_request: NextRequest) {
  const auth = await requirePermission('settings:manage', _request)
  if ('error' in auth) return auth.error

  try {
    // ── Active semester ──
    const activeSemester = await prisma.semester.findFirst({ where: { isActive: true } })

    // ── Import batch stats ──
    const allBatches = await prisma.importBatch.count()
    const confirmedBatches = await prisma.importBatch.count({ where: { status: 'confirmed' } })
    const pendingBatches = await prisma.importBatch.count({ where: { status: 'pending' } })
    const failedBatches = await prisma.importBatch.count({ where: { status: 'failed' } })
    const rolledBackBatches = await prisma.importBatch.count({ where: { status: 'rolled_back' } })
    const abandonedBatches = await prisma.importBatch.count({ where: { status: 'abandoned' } })

    const latestBatch = await prisma.importBatch.findFirst({
      orderBy: { id: 'desc' },
      select: { id: true, filename: true, status: true, createdAt: true },
    })
    const latestConfirmedBatch = await prisma.importBatch.findFirst({
      where: { status: 'confirmed' },
      orderBy: { confirmedAt: 'desc' },
      select: { id: true, filename: true, confirmedAt: true },
    })

    const recentBatches = await prisma.importBatch.findMany({
      orderBy: { id: 'desc' },
      take: 5,
    })

    // ── Source evidence stats (expanded) ──
    const totalTcs = await prisma.teachingTaskClass.count()

    // ── K39-B1: Import rule config ──
    const importRuleConfig = await getImportRuleConfig()
    const tcsWithBatch = await prisma.teachingTaskClass.count({ where: { importBatchId: { not: null } } })
    const tcsWithoutBatch = await prisma.teachingTaskClass.count({ where: { importBatchId: null } })
    const tcsWithKeyword = await prisma.teachingTaskClass.count({ where: { sourceKeyword: { not: null } } })
    const tcsWithClassName = await prisma.teachingTaskClass.count({ where: { sourceClassName: { not: null } } })
    const tcsWithStrategy = await prisma.teachingTaskClass.count({ where: { matchStrategy: { not: null } } })
    const tcsWithSourceRowIndex = await prisma.teachingTaskClass.count({ where: { sourceRowIndex: { not: null } } })
    const tcsWithSourceRemark = await prisma.teachingTaskClass.count({ where: { sourceRemark: { not: null } } })
    const tcsWithSourceArtifact = await prisma.teachingTaskClass.count({ where: { sourceArtifactFilename: { not: null } } })

    const evidenceCoveragePercent = totalTcs > 0
      ? Math.round((tcsWithBatch / totalTcs) * 100)
      : 0

    // ── Build response ──
    const recentBatchesList = recentBatches.map((b) => {
      const warnings = b.warningsJson ? safeJsonArrayLength(b.warningsJson) : 0
      return {
        id: b.id,
        filename: b.filename,
        status: b.status,
        semesterId: b.semesterId,
        createdAt: b.createdAt.toISOString(),
        confirmedAt: b.confirmedAt?.toISOString() ?? null,
        rolledBackAt: b.rolledBackAt?.toISOString() ?? null,
        recordCount: b.recordCount,
        createdTaskCount: b.createdTaskCount,
        createdSlotCount: b.createdSlotCount,
        errorMessage: b.errorMessage,
        warningCount: warnings,
      }
    })

    /* ── Legacy rules (backward-compatible) ── */
    const rules = [
      {
        key: 'defaultImportSemester',
        label: '默认导入学期',
        value: activeSemester?.id ?? null,
        status: 'active' as const,
        editable: false,
        source: 'import API — 依赖 active semester',
        description: `当前默认导入学期: ${activeSemester ? `${activeSemester.name} (id=${activeSemester.id})` : '无 active semester'}。导入 API 使用 active semester 解析课程。`,
      },
      {
        key: 'crossCohortDetection',
        label: '跨年级合班检测',
        value: true,
        status: 'hard-locked' as const,
        editable: false,
        source: 'importer.ts — cross-cohort detection 在 dry-run 阶段执行',
        description: '导入管线检测跨年级合班。检测结果在 warningsJson 中以 CROSS_COHORT_SUSPECTED 标记。需用户在 confirm 阶段通过 crossCohortApprovals 审批。',
      },
      {
        key: 'crossCohortApproval',
        label: '跨年级合班审批',
        value: 'required',
        status: 'hard-locked' as const,
        editable: false,
        source: 'confirm API — crossCohortApprovals 字段',
        description: '跨年级合班必须在 confirmImportBatch 时通过 crossCohortApprovals 显式审批。否则返回 CROSS_COHORT_APPROVAL_REQUIRED 错误。',
      },
      {
        key: 'sourceEvidenceFields',
        label: 'Source Evidence 字段',
        value: 7,
        status: 'active' as const,
        editable: false,
        source: 'prisma TeachingTaskClass — 7 个 source evidence 字段',
        description: `Source evidence 通过 TeachingTaskClass 的 7 个字段记录: importBatchId, sourceRowIndex, sourceKeyword, sourceClassName, sourceRemark, sourceArtifactFilename, matchStrategy。当前 ${tcsWithBatch}/${totalTcs} 条 link 有 importBatchId。`,
      },
      {
        key: 'sourceEvidenceForwardFillOnly',
        label: 'Source Evidence 仅前向填充',
        value: 'no historical backfill',
        status: 'historical-gap' as const,
        editable: false,
        source: 'K20-FIX-B — 仅新导入的 link 写 evidence',
        description: '当前实现仅在新导入时前向填充 evidence 字段。历史数据（K20 之前的导入）的 link 不会自动回填。K20-FIX-B 注解。',
      },
      {
        key: 'overrideImport',
        label: '覆盖导入',
        value: 'per-batch',
        status: 'active' as const,
        editable: false,
        source: 'importer.ts — 每次导入创建新 ImportBatch',
        description: '每次导入创建新 ImportBatch 记录。覆盖是 per-batch 的，由确认阶段决定。不修改已确认的数据除非显式 re-import。',
      },
      {
        key: 'duplicateImport',
        label: '重复导入',
        value: 'allowed with audit',
        status: 'active' as const,
        editable: false,
        source: 'importer.ts — ImportBatch 记录所有导入',
        description: '允许重复导入。每次创建新 ImportBatch 记录，可通过 rolledBackAt 字段回滚。无强制幂等保护。',
      },
      {
        key: 'importConfirmation',
        label: '导入确认机制',
        value: 'confirmText required',
        status: 'hard-locked' as const,
        editable: false,
        source: 'confirm API — confirmText="CONFIRM_IMPORT"',
        description: '真实导入需要传入 confirmText="CONFIRM_IMPORT"。dry-run 不需要。',
      },
    ]

    /* ── Legacy safeguards (backward-compatible) ── */
    const safeguards = [
      {
        key: 'crossCohortWarning',
        label: 'Cross-cohort warning',
        enabled: true,
        severity: 'warning' as const,
        description: '跨年级合班在 dry-run 阶段生成 warning。',
      },
      {
        key: 'fuzzyMatchingWarning',
        label: 'Fuzzy matching warning',
        enabled: true,
        severity: 'warning' as const,
        description: '解析阶段使用 fuzzy matching（教师名/房间名/班级名）时生成 warning 提示可能的误匹配。',
      },
      {
        key: 'duplicateImportRisk',
        label: '重复导入风险',
        enabled: true,
        severity: 'info' as const,
        description: '重复导入不自动阻止。回滚通过 ImportBatch.rolledBackAt 记录。',
      },
      {
        key: 'sourceEvidenceCompleteness',
        label: 'Source evidence completeness',
        enabled: true,
        severity: 'info' as const,
        description: '历史 link 缺失 source evidence。新导入全部携带。',
      },
      {
        key: 'importConfirmationGuard',
        label: '导入确认门禁',
        enabled: true,
        severity: 'hard' as const,
        description: 'confirm 必须传入 confirmText。',
      },
    ]

    /* ── K39-A: Enhanced summary ── */
    const enhancedSummary = {
      importBatchTotal: allBatches,
      confirmedCount: confirmedBatches,
      pendingCount: pendingBatches,
      failedCount: failedBatches,
      rolledBackCount: rolledBackBatches,
      abandonedCount: abandonedBatches,
      latestBatch: latestBatch
        ? {
            id: latestBatch.id,
            filename: latestBatch.filename,
            status: latestBatch.status,
            createdAt: latestBatch.createdAt.toISOString(),
          }
        : null,
      latestConfirmedBatch: latestConfirmedBatch
        ? {
            id: latestConfirmedBatch.id,
            filename: latestConfirmedBatch.filename,
            confirmedAt: latestConfirmedBatch.confirmedAt?.toISOString() ?? null,
          }
        : null,
      activeSemester: activeSemester
        ? { id: activeSemester.id, name: activeSemester.name, code: activeSemester.code }
        : null,
    }

    /* ── K39-A: Source evidence coverage ── */
    const sourceEvidence = {
      totalTeachingTaskClassLinks: totalTcs,
      withImportBatchId: tcsWithBatch,
      missingImportBatchId: tcsWithoutBatch,
      withSourceRowIndex: tcsWithSourceRowIndex,
      withSourceKeyword: tcsWithKeyword,
      withSourceClassName: tcsWithClassName,
      withSourceRemark: tcsWithSourceRemark,
      withSourceArtifactFilename: tcsWithSourceArtifact,
      withMatchStrategy: tcsWithStrategy,
      evidenceCoveragePercent,
      historicalBackfillAvailable: false,
      forwardOnly: true,
      explanation: `共 ${totalTcs} 条 TeachingTaskClass link。其中 ${tcsWithBatch} 条有 importBatchId（由 K20-FIX-B 前向填充写入）。${tcsWithoutBatch} 条缺失 importBatchId，属于 K20 之前的历史导入数据，不会自动回填。`,
    }

    /* ── K39-A: Cross-cohort guard ── */
    const crossCohortGuard = {
      detectionEnabled: true,
      approvalRequired: true,
      dryRunWarningCode: 'CROSS_COHORT_SUSPECTED',
      confirmErrorCode: 'CROSS_COHORT_APPROVAL_REQUIRED',
      approvalField: 'crossCohortApprovals',
      hardLocked: true,
    }

    /* ── K39-A: Import lifecycle rules ── */
    const importLifecycleRules = [
      {
        phase: 'parse',
        label: '解析',
        writesDb: false,
        permission: 'import:manage',
        safetyGuard: '无 DB 写入；仅解析 docx + 创建 pending ImportBatch + 保存 JSON',
        configurable: false,
      },
      {
        phase: 'dry-run',
        label: '试运行',
        writesDb: false,
        permission: 'import:manage',
        safetyGuard: '无 DB 写入；生成 ImportPlan + warningsJson + 跨年级合班 warning',
        configurable: false,
      },
      {
        phase: 'confirm',
        label: '确认导入',
        writesDb: true,
        permission: 'import:manage',
        safetyGuard: 'confirmText="CONFIRM_IMPORT" 必传；crossCohortApprovals 审批；同 semester 仅允许一个 confirmed batch',
        configurable: false,
      },
      {
        phase: 'rollback',
        label: '回滚',
        writesDb: true,
        permission: 'import:manage',
        safetyGuard: '仅 confirmed batch 可回滚；confirmText="ROLLBACK_IMPORT" 必传；检查 adjustment/audit 引用阻塞',
        configurable: false,
      },
      {
        phase: 'abandon',
        label: '废弃',
        writesDb: true,
        permission: 'import:manage',
        safetyGuard: '仅 pending batch 可废弃；confirmText="ABANDON_IMPORT" 必传',
        configurable: false,
      },
      {
        phase: 'semester-scoping',
        label: '学期作用域',
        writesDb: false,
        permission: 'import:manage',
        safetyGuard: '所有 batch 绑定 semesterId；解析/回滚/废弃使用 active semester；确认支持 semesterId 覆盖',
        configurable: false,
      },
    ]

    /* ── K39-A: Duplicate import policy ── */
    const duplicateImportPolicy = {
      repeatedImportBehavior: '允许。每次创建新 ImportBatch，可与历史 batch 并存',
      conflictHandling: 'per-batch UPSERT_BY_NATURAL_KEY；不删除已确认数据，由回滚显式清理',
      sourceArtifactHandling: '每次 parse 保存 docx 到 uploads/imports/，创建新 ImportBatch 记录',
      configurable: false,
    }

    /* ── K39-B1: Editability ── */
    const editability = {
      allRulesEditable: false,
      defaultSemesterEditable: true,
      crossCohortApprovalEditable: false,
      sourceEvidenceBackfillEditable: false,
      duplicatePolicyEditable: false,
      requireExplicitSemesterForImportEditable: true,
      nextConfigStage: 'K39-C',
    }

    /* ── K39-A: Rule groups ── */
    const ruleGroups = [
      {
        groupKey: 'semester',
        groupLabel: '学期作用域',
        groupIcon: 'Calendar',
        rules: [
          {
            id: 'default-semester',
            title: '默认导入学期',
            status: 'active',
            severity: 'info',
            locked: false,
            source: 'resolveSchedulerSemester — active semester',
            description: activeSemester
              ? `默认导入学期: ${activeSemester.name} (id=${activeSemester.id})`
              : '无 active semester，导入将报错',
            impact: importRuleConfig.requireExplicitSemesterForImport
              ? '上传前必须确认目标学期'
              : '所有导入操作绑定到 active semester',
            editable: true,
          },
        ],
      },
      {
        groupKey: 'cross-cohort',
        groupLabel: '跨年级合班',
        groupIcon: 'ShieldAlert',
        rules: [
          {
            id: 'cross-cohort-detection',
            title: '跨年级合班检测',
            status: 'hard-locked',
            severity: 'warning',
            locked: true,
            source: 'importer.ts — findMergedClassNames + classifyCrossCohortWarnings',
            description: 'dry-run 阶段检测跨年级合班，在 warningsJson 中标记 LIKELY_ERROR_CROSS_COHORT',
            impact: '不可关闭。检测结果在 UI 中展示给用户',
            editable: false,
          },
          {
            id: 'cross-cohort-approval',
            title: '跨年级合班审批',
            status: 'hard-locked',
            severity: 'hard',
            locked: true,
            source: 'importer.ts — validateCrossCohortApprovals',
            description: 'confirm 时必须通过 crossCohortApprovals 字段显式审批跨年级合班。否则返回 409 CROSS_COHORT_APPROVAL_REQUIRED',
            impact: '不可关闭。绕过审批将导致 confirm 失败',
            editable: false,
          },
        ],
      },
      {
        groupKey: 'source-evidence',
        groupLabel: 'Source Evidence',
        groupIcon: 'FileSearch',
        rules: [
          {
            id: 'source-evidence-fields',
            title: 'Source Evidence 字段',
            status: 'active',
            severity: 'info',
            locked: true,
            source: 'prisma TeachingTaskClass — 7 fields',
            description: `importBatchId, sourceRowIndex, sourceKeyword, sourceClassName, sourceRemark, sourceArtifactFilename, matchStrategy`,
            impact: `${evidenceCoveragePercent}% link 有 evidence。新导入全部携带`,
            editable: false,
          },
          {
            id: 'source-evidence-forward-fill',
            title: '仅前向填充',
            status: 'historical-gap',
            severity: 'warning',
            locked: true,
            source: 'K20-FIX-B',
            description: `仅新导入时写入 evidence。${tcsWithoutBatch} 条历史 link 缺失 evidence`,
            impact: '历史 link 不可追溯到源文档',
            editable: false,
            nextStage: 'K39-C',
          },
        ],
      },
      {
        groupKey: 'lifecycle',
        groupLabel: '批次生命周期',
        groupIcon: 'RefreshCw',
        rules: [
          {
            id: 'batch-state-machine',
            title: '批次状态机',
            status: 'active',
            severity: 'info',
            locked: true,
            source: 'importer.ts + rollback.ts + abandon route',
            description: 'pending → confirming → confirmed / failed; confirmed → rolling_back → rolled_back; pending → abandoned',
            impact: '状态转换由代码控制，不可配置',
            editable: false,
          },
          {
            id: 'confirm-text-guard',
            title: '确认文本门禁',
            status: 'hard-locked',
            severity: 'hard',
            locked: true,
            source: 'confirm/rollback/abandon API',
            description: 'confirm 需 "CONFIRM_IMPORT"，rollback 需 "ROLLBACK_IMPORT"，abandon 需 "ABANDON_IMPORT"',
            impact: '防止误操作。不可绕过',
            editable: false,
          },
          {
            id: 'single-confirmed-per-semester',
            title: '每学期仅一个 confirmed batch',
            status: 'hard-locked',
            severity: 'hard',
            locked: true,
            source: 'importer.ts — confirmImportBatch',
            description: '同 semester 不允许重复确认。新确认前必须先回滚已有 confirmed batch',
            impact: '防止数据覆盖冲突',
            editable: false,
          },
        ],
      },
      {
        groupKey: 'rollback',
        groupLabel: '回滚与废弃',
        groupIcon: 'RotateCcw',
        rules: [
          {
            id: 'rollback-only-confirmed',
            title: '回滚仅限 confirmed batch',
            status: 'active',
            severity: 'warning',
            locked: true,
            source: 'rollback.ts — 状态检查',
            description: '只有 confirmed 状态的 batch 可回滚。pending/failed/abandoned 不可回滚',
            impact: '保护不可变状态',
            editable: false,
          },
          {
            id: 'abandon-only-pending',
            title: '废弃仅限 pending batch',
            status: 'active',
            severity: 'info',
            locked: true,
            source: 'abandon route — 状态检查',
            description: '只有 pending 状态的 batch 可废弃。已确认/已回滚不可废弃',
            impact: '保护不可变状态',
            editable: false,
          },
          {
            id: 'rollback-adjustment-guard',
            title: '回滚 adjustment 引用检查',
            status: 'hard-locked',
            severity: 'hard',
            locked: true,
            source: 'rollback.ts — adjustment/audit 引用检查',
            description: '回滚前检查 ScheduleAdjustment 和 audit log 引用。如有引用则阻塞回滚',
            impact: '防止删除被引用的数据',
            editable: false,
          },
        ],
      },
      {
        groupKey: 'data-safety',
        groupLabel: '数据安全',
        groupIcon: 'ShieldCheck',
        rules: [
          {
            id: 'semester-scoping',
            title: '学期作用域隔离',
            status: 'active',
            severity: 'info',
            locked: true,
            source: 'K25-C — ImportBatch.semesterId NOT NULL',
            description: 'ImportBatch 绑定 semesterId。查询/回滚/废弃均按 active semester 过滤',
            impact: '数据按学期隔离，不会跨学期干扰',
            editable: false,
          },
          {
            id: 'permission-separation',
            title: '权限分离',
            status: 'active',
            severity: 'info',
            locked: true,
            source: 'requirePermission — import:manage / settings:manage',
            description: '导入操作需要 import:manage。导入规则查看需要 settings:manage。两者独立',
            impact: '权限边界清晰',
            editable: false,
          },
          {
            id: 'duplicate-import-policy',
            title: '重复导入策略',
            status: 'active',
            severity: 'warning',
            locked: true,
            source: 'importer.ts — UPSERT_BY_NATURAL_KEY',
            description: '允许重复导入，per-batch UPSERT。不删除已确认数据，由回滚显式清理',
            impact: '重复导入会创建并行 batch，需手动管理',
            editable: false,
            nextStage: 'K39-D',
          },
        ],
      },
    ]

    return NextResponse.json({
      success: true,

      /* Legacy fields (backward-compatible) */
      summary: {
        importBatchCount: allBatches,
        confirmedImportCount: confirmedBatches,
        failedImportCount: failedBatches,
        rolledBackImportCount: rolledBackBatches,
        recentImportBatchCount: recentBatches.length,
        teachingTaskClassWithEvidenceCount: tcsWithBatch,
        teachingTaskClassWithoutEvidenceCount: tcsWithoutBatch,
        tcsWithKeyword,
        tcsWithClassName,
        tcsWithStrategy,
      },
      rules,
      safeguards,
      recentBatches: recentBatchesList,

      /* K39-A enhanced fields */
      moduleVersion: 'K39-B1',
      enhancedSummary,
      sourceEvidence,
      crossCohortGuard,
      importLifecycleRules,
      duplicateImportPolicy,
      editability,
      ruleGroups,

      /* K39-B1 config */
      config: {
        requireExplicitSemesterForImport: {
          current: importRuleConfig.requireExplicitSemesterForImport,
          editable: true,
          source: importRuleConfig.id > 0 ? 'database' as const : 'fallback' as const,
          description: importRuleConfig.requireExplicitSemesterForImport
            ? '上传前必须确认目标学期'
            : '保持当前 active semester fallback 行为',
        },
      },
    })
  } catch (error) {
    console.error('Import rules API error:', error)
    return NextResponse.json(
      { success: false, error: 'INTERNAL_ERROR', message: '获取导入规则失败' },
      { status: 500 },
    )
  }
}

export async function PATCH(request: NextRequest) {
  const auth = await requirePermission('settings:manage', request)
  if ('error' in auth) return auth.error

  try {
    const body = await request.json()

    // Only allow requireExplicitSemesterForImport updates
    if (body.requireExplicitSemesterForImport !== undefined) {
      const validation = validateRequireExplicitSemesterForImport(body.requireExplicitSemesterForImport)
      if (!validation.ok) {
        return NextResponse.json(
          { success: false, error: validation.error },
          { status: 400 },
        )
      }
      await updateImportRuleConfig({ requireExplicitSemesterForImport: validation.parsed })
    }

    // Return refreshed config
    const config = await getImportRuleConfig()
    return NextResponse.json({
      success: true,
      config: {
        requireExplicitSemesterForImport: {
          current: config.requireExplicitSemesterForImport,
          editable: true,
          source: config.id > 0 ? 'database' as const : 'fallback' as const,
          description: config.requireExplicitSemesterForImport
            ? '上传前必须确认目标学期'
            : '保持当前 active semester fallback 行为',
        },
      },
    })
  } catch (error) {
    console.error('Import rules PATCH error:', error)
    return NextResponse.json(
      { success: false, error: 'INTERNAL_ERROR', message: '更新导入规则配置失败' },
      { status: 500 },
    )
  }
}

function safeJsonArrayLength(json: string): number {
  try {
    const arr = JSON.parse(json)
    return Array.isArray(arr) ? arr.length : 0
  } catch {
    return 0
  }
}
