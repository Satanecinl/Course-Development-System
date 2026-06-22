/**
 * L7-F API Route — Course-Setting XLSX Partial Import Apply
 *
 * Stage: L7-F-XLSX-COURSE-SETTING-NEW-TEMPLATE-PARTIAL-IMPORT-EXECUTION
 *
 * POST /api/admin/import/course-setting-xlsx/partial-import-apply
 *
 * Controlled write endpoint. Re-parses the Excel server-side, re-loads
 * semester-scoped data, recomputes the full L6-E2 partial import plan,
 * and (on real mode) materialises the plan into the database.
 *
 * Permission: import:manage
 * Accepts: .xlsx only
 *
 * Request (multipart/form-data):
 *   - file: .xlsx (required, max 20MB)
 *   - targetSemesterId: number (required, must exist)
 *   - manualResolutions: JSON string (required) — L6-E1 manual resolution items
 *   - confirmToken: string (required for real apply) — must match
 *     `APPLY_XLSX_COURSE_SETTING_{targetSemesterId}`
 *   - expectedPlanHash: string (required) — SHA-256 of the server-expected plan
 *   - dryRunOnly: 'true' | 'false' (default false)
 *
 * Response:
 *   - On real apply: dbWritten: true, backup path, ImportBatch ID, summary
 *   - On dry-run: dbWritten: false, plan summary only
 *
 * Hard constraints:
 *  - Plan hash must match; on mismatch → 409 PLAN_HASH_MISMATCH
 *  - Confirm token must match; on mismatch → 400 INVALID_CONFIRM_TOKEN
 *  - DB backup must succeed; on failure → 500 BACKUP_FAILED
 *  - All writes in a Prisma transaction
 *  - No Teacher / ClassGroup / ScheduleSlot / ScheduleAdjustment creation
 */

import { createHash } from 'node:crypto'
import { NextRequest, NextResponse } from 'next/server'

import { requirePermission } from '@/lib/auth/require-permission'
import { buildCourseSettingApprovalPackageWithTargetSemester } from '@/lib/import/course-setting-approval-package-l6-d'
import { buildCourseSettingApprovalReviewUi } from '@/lib/import/course-setting-approval-review-ui-l6-d2'
import { buildInitialCourseSettingDecisionPackage } from '@/lib/import/course-setting-approval-review-l6-d1'
import {
  type CourseSettingManualResolutionItem,
} from '@/lib/import/course-setting-manual-resolution-l6-e1'
import { buildCourseSettingTeachingTaskDryRun } from '@/lib/import/course-setting-teaching-task-dry-run'
import { loadCourseSettingExistingDataForSemester } from '@/lib/import/course-setting-xlsx-preview'
import {
  buildCourseSettingPartialImportPlan,
  validatePartialImportPlan,
} from '@/lib/import/course-setting-partial-import-plan-l6-e2'
import {
  L7_F_STAGE,
  computeL7FPlanHash,
  executeL7FCourseSettingApply,
} from '@/lib/import/course-setting-apply-l7-f'

const MAX_FILE_SIZE = 20 * 1024 * 1024 // 20MB

// ── Error helpers ────────────────────────────────────────────────────────────

const errorResponse = (
  error: string,
  message: string,
  status: number,
): NextResponse =>
  NextResponse.json(
    {
      success: false,
      error,
      message,
      stage: L7_F_STAGE,
      planOnly: false,
      dryRunOnly: true,
      dbWritten: false,
      applied: false,
      rawIncluded: false,
    },
    { status },
  )

// ── Main POST handler ────────────────────────────────────────────────────────

export async function POST(request: NextRequest): Promise<NextResponse> {
  const auth = await requirePermission('import:manage', request)
  if ('error' in auth && auth.error) return auth.error

  try {
    const formData = await request.formData()
    const file = formData.get('file')
    if (!file || !(file instanceof File)) {
      return errorResponse('MISSING_FILE', '请上传 .xlsx 文件', 400)
    }

    const fileName = file.name.toLowerCase()
    if (!fileName.endsWith('.xlsx')) {
      const detail = fileName.endsWith('.docx')
        ? '不支持 .docx 格式，请使用 .xlsx 课程设置文件'
        : `收到的文件: ${file.name}，仅支持 .xlsx 格式`
      return errorResponse('INVALID_FILE_TYPE', detail, 400)
    }

    if (file.size > MAX_FILE_SIZE) {
      return errorResponse(
        'FILE_TOO_LARGE',
        `文件大小 ${(file.size / 1024 / 1024).toFixed(1)}MB，限制 20MB`,
        400,
      )
    }

    // ── Validate targetSemesterId ──────────────────────────────────────
    const targetSemesterIdRaw = formData.get('targetSemesterId')
    if (targetSemesterIdRaw == null || targetSemesterIdRaw === '') {
      return errorResponse('MISSING_TARGET_SEMESTER', '请选择导入目标学期', 400)
    }
    const targetSemesterId = Number(targetSemesterIdRaw)
    if (!Number.isInteger(targetSemesterId) || targetSemesterId <= 0) {
      return errorResponse('INVALID_TARGET_SEMESTER', '目标学期 ID 无效', 400)
    }

    // ── Validate manualResolutions JSON ────────────────────────────────
    const manualResolutionsRaw = formData.get('manualResolutions')
    if (
      manualResolutionsRaw == null ||
      typeof manualResolutionsRaw !== 'string' ||
      manualResolutionsRaw.trim().length === 0
    ) {
      return errorResponse('MISSING_MANUAL_RESOLUTIONS', '请提交 manualResolutions', 400)
    }
    let parsedResolutions: unknown
    try {
      parsedResolutions = JSON.parse(manualResolutionsRaw)
    } catch (e) {
      return errorResponse(
        'INVALID_MANUAL_RESOLUTIONS',
        `manualResolutions 不是合法 JSON: ${(e as Error).message}`,
        400,
      )
    }
    if (!Array.isArray(parsedResolutions)) {
      return errorResponse('INVALID_MANUAL_RESOLUTIONS', 'manualResolutions 必须是 JSON 数组', 400)
    }
    const manualResolutions: CourseSettingManualResolutionItem[] =
      parsedResolutions as CourseSettingManualResolutionItem[]

    // ── Validate confirmToken (required for real apply) ────────────────
    const dryRunOnly = formData.get('dryRunOnly') === 'true'
    const confirmTokenRaw = formData.get('confirmToken')
    const expectedToken = `APPLY_XLSX_COURSE_SETTING_${targetSemesterId}`
    if (!dryRunOnly) {
      if (
        confirmTokenRaw == null ||
        typeof confirmTokenRaw !== 'string' ||
        confirmTokenRaw.trim().length === 0
      ) {
        return errorResponse('MISSING_CONFIRM_TOKEN', '请提供确认口令', 400)
      }
      if (confirmTokenRaw.trim() !== expectedToken) {
        return errorResponse('INVALID_CONFIRM_TOKEN', '确认口令不匹配', 400)
      }
    }

    // ── Validate expectedPlanHash ──────────────────────────────────────
    const expectedPlanHashRaw = formData.get('expectedPlanHash')
    if (expectedPlanHashRaw == null || typeof expectedPlanHashRaw !== 'string' || expectedPlanHashRaw.trim().length === 0) {
      return errorResponse('MISSING_PLAN_HASH', '请提供 expectedPlanHash', 400)
    }
    const expectedPlanHash = expectedPlanHashRaw.trim()

    // ── Read file into Buffer (never persisted) ────────────────────────
    const arrayBuffer = await file.arrayBuffer()
    const buffer = Buffer.from(arrayBuffer)

    // ── Resolve target semester (read-only) ─────────────────────────────
    const { prisma } = await import('@/lib/prisma')
    const semester = await prisma.semester.findUnique({
      where: { id: targetSemesterId },
      select: { id: true, name: true, code: true, isActive: true },
    })
    if (!semester) {
      return errorResponse('TARGET_SEMESTER_NOT_FOUND', '目标学期不存在', 400)
    }

    // ═══════════════════════════════════════════════════════════════════
    // Server-side recompute of the full plan (mirrors partial-import-plan route)
    // ═══════════════════════════════════════════════════════════════════

    // Step 1: L4 semester-scoped dry-run (read-only)
    const existingData = await loadCourseSettingExistingDataForSemester(targetSemesterId)

    const dryRunResult = await buildCourseSettingTeachingTaskDryRun({
      xlsxBuffer: buffer,
      artifactFilename: file.name,
      existingData,
      options: { parserVersion: 'l2-parser-v1', includeRawValues: true, maxPreviewRows: 100000 },
    })

    // Step 2: Build L6-D approval package + L6-D2 review UI rows
    const fileSha256 = createHash('sha256').update(buffer).digest('hex')
    const filenameHash = createHash('sha256')
      .update(file.name, 'utf8')
      .digest('hex')
      .slice(0, 12)
    const idHash = createHash('sha256')
      .update(String(semester.id), 'utf8')
      .digest('hex')
      .slice(0, 12)
    const nameHash = createHash('sha256')
      .update(semester.name, 'utf8')
      .digest('hex')
      .slice(0, 12)
    const codeHash = semester.code
      ? createHash('sha256').update(semester.code, 'utf8').digest('hex').slice(0, 12)
      : null

    const approvalPackage = buildCourseSettingApprovalPackageWithTargetSemester({
      dryRunResult,
      targetSemester: {
        id: semester.id,
        idHash,
        nameHash,
        codeHash,
        isActive: semester.isActive,
        taskCount: dryRunResult.existingDataSummary.teachingTaskCount,
        classGroupCount: dryRunResult.existingDataSummary.classGroupCount,
      },
      sourceArtifact: {
        artifactSha256: fileSha256,
        artifactFilenameHash: filenameHash,
        sizeBytes: buffer.length,
        parserVersion: dryRunResult.parser.parserVersion,
      },
    })

    // Build the L6-D1 decision package for fingerprint cross-check (we do
    // not return the decision package, only its dryRunFingerprint).
    buildInitialCourseSettingDecisionPackage({
      approvalPackage,
    })

    const reviewUi = buildCourseSettingApprovalReviewUi({
      approvalPackage,
    })

    // Step 3: Build the L6-E2 plan from the review rows + manual resolutions
    const serverPlan = await buildCourseSettingPartialImportPlan({
      reviewRows: reviewUi.rows,
      manualResolutions,
      existingData,
      targetSemesterId,
      sourceArtifact: {
        filename: file.name,
        sha256: fileSha256,
        sizeBytes: buffer.length,
      },
      reviewPackageFingerprintHash: approvalPackage.dryRunFingerprint.hash,
    })

    const planValidation = validatePartialImportPlan(serverPlan)
    if (!planValidation.ok) {
      return NextResponse.json(
        {
          success: false,
          stage: L7_F_STAGE,
          error: 'PLAN_VALIDATION_FAILED',
          message: 'Server-side plan validation failed',
          violations: planValidation.violations,
          warnings: planValidation.warnings,
          dryRunOnly: false,
          dbWritten: false,
          rawIncluded: false,
        },
        { status: 500 },
      )
    }

    // Step 4: Compute plan hash and compare with the expectedPlanHash
    const serverPlanHash = computeL7FPlanHash(serverPlan as unknown as Parameters<typeof computeL7FPlanHash>[0])
    if (serverPlanHash !== expectedPlanHash) {
      return NextResponse.json(
        {
          success: false,
          stage: L7_F_STAGE,
          error: 'PLAN_HASH_MISMATCH',
          message: 'Plan changed; regenerate partial import plan before applying.',
          expectedPlanHash,
          serverPlanHash,
          dryRunOnly: false,
          dbWritten: false,
          rawIncluded: false,
        },
        { status: 409 },
      )
    }

    // ═══════════════════════════════════════════════════════════════════
    // Execute the apply
    // ═══════════════════════════════════════════════════════════════════

    // ClassGroup hard gate — must be checked before backup and transaction.
    // If the target semester has no ClassGroups, block the apply even with
    // a valid confirm token, to prevent empty ImportBatch creation.
    if (!dryRunOnly) {
      const classGroupCount = await prisma.classGroup.count({
        where: { semesterId: targetSemesterId },
      })
      if (classGroupCount === 0) {
        return errorResponse(
          'TARGET_SEMESTER_HAS_NO_CLASS_GROUPS',
          '目标学期没有班级数据，不能执行课程设置导入。请先创建/导入目标学期班级，或选择已有班级数据的目标学期。',
          400,
        )
      }
    }

    const applyResult = await executeL7FCourseSettingApply({
      targetSemesterId,
      plan: serverPlan as unknown as Parameters<typeof executeL7FCourseSettingApply>[0]['plan'],
      confirmToken: typeof confirmTokenRaw === 'string' ? confirmTokenRaw.trim() : undefined,
      dryRunOnly,
    })

    return NextResponse.json({
      success: true,
      stage: L7_F_STAGE,
      planVersion: applyResult.planVersion,
      templateVersion: applyResult.templateVersion,
      dryRunOnly: applyResult.dryRunOnly,
      dbWritten: applyResult.dbWritten,
      applied: applyResult.applied,
      importBatchId: applyResult.importBatchId,
      backupPath: applyResult.backupPath,
      targetSemester: {
        id: semester.id,
        name: semester.name,
        code: semester.code,
        isActive: semester.isActive,
      },
      sourceArtifact: {
        filename: file.name,
        sha256: fileSha256,
        sizeBytes: buffer.length,
      },
      serverPlanHash,
      summary: applyResult.summary,
      counts: applyResult.counts,
      postApplyAudit: applyResult.postApplyAudit,
      rollbackNote: applyResult.rollbackNote,
      rawIncluded: false,
      warnings: applyResult.warnings,
    })
  } catch (e: unknown) {
    const message = e instanceof Error ? e.message : String(e)
    return errorResponse('INTERNAL', message, 500)
  }
}
