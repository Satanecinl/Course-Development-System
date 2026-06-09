/**
 * K26-N1: Import rules — read-only API.
 *
 * GET /api/admin/settings/import-rules
 *
 * Returns import batch stats, cross-cohort status, source evidence stats,
 * current rules, safeguards, and recent import batches. Read-only.
 */

import { NextResponse, type NextRequest } from 'next/server'
import { requirePermission } from '@/lib/auth/require-permission'
import { prisma } from '@/lib/prisma'

export async function GET(_request: NextRequest) {
  const auth = await requirePermission('settings:manage', _request)
  if ('error' in auth) return auth.error

  try {
    // ── Active semester ──
    const activeSemester = await prisma.semester.findFirst({ where: { isActive: true } })

    // ── Import batch stats ──
    const allBatches = await prisma.importBatch.count()
    const recentBatches = await prisma.importBatch.findMany({
      orderBy: { id: 'desc' },
      take: 5,
    })
    const confirmedBatches = await prisma.importBatch.count({ where: { status: 'confirmed' } })
    const failedBatches = await prisma.importBatch.count({ where: { status: 'failed' } })
    const rolledBackBatches = await prisma.importBatch.count({ where: { status: 'rolled_back' } })

    // ── Source evidence stats ──
    const tcsWithBatch = await prisma.teachingTaskClass.count({ where: { importBatchId: { not: null } } })
    const tcsWithoutBatch = await prisma.teachingTaskClass.count({ where: { importBatchId: null } })
    const tcsWithKeyword = await prisma.teachingTaskClass.count({ where: { sourceKeyword: { not: null } } })
    const tcsWithClassName = await prisma.teachingTaskClass.count({ where: { sourceClassName: { not: null } } })
    const tcsWithStrategy = await prisma.teachingTaskClass.count({ where: { matchStrategy: { not: null } } })

    // ── Cross-cohort stats derived from TeachingTaskClass ──
    void 0

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
        status: 'active' as const,
        editable: false,
        source: 'importer.ts — cross-cohort detection 在 dry-run 阶段执行',
        description: '导入管线检测跨年级合班。检测结果在 warningsJson 中以 CROSS_COHORT_SUSPECTED 标记。需用户在 confirm 阶段通过 crossCohortApprovals 审批。',
      },
      {
        key: 'crossCohortApproval',
        label: '跨年级合班审批',
        value: 'required',
        status: 'active' as const,
        editable: false,
        source: 'confirm API — crossCohortApprovals 字段',
        description: '跨年级合班必须在 confirmImportBatch 时通过 crossCohortApprovals 显式审批。否则返回 CROSS_COHORT_APPROVAL_REQUIRED 错误。',
      },
      {
        key: 'sourceEvidenceFields',
        label: 'Source Evidence 字段',
        value: 6,
        status: 'active' as const,
        editable: false,
        source: 'prisma TeachingTaskClass — importBatchId, sourceRowIndex, sourceKeyword, sourceClassName, sourceRemark, sourceArtifactFilename, matchStrategy (7 fields)',
        description: `Source evidence 通过 TeachingTaskClass 的 7 个字段记录：importBatchId, sourceRowIndex, sourceKeyword, sourceClassName, sourceRemark, sourceArtifactFilename, matchStrategy。当前 ${tcsWithBatch} 条 link 有 importBatchId。`,
      },
      {
        key: 'sourceEvidenceForwardFillOnly',
        label: 'Source Evidence 仅前向填充',
        value: 'no historical backfill',
        status: 'partial' as const,
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
        status: 'active' as const,
        editable: false,
        source: 'confirm API — confirmText="CONFIRM_IMPORT"',
        description: '真实导入需要传入 confirmText="CONFIRM_IMPORT"。dry-run 不需要。',
      },
    ]

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

    return NextResponse.json({
      success: true,
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
    })
  } catch (error) {
    console.error('Import rules API error:', error)
    return NextResponse.json(
      { success: false, error: 'INTERNAL_ERROR', message: '获取导入规则失败' },
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
