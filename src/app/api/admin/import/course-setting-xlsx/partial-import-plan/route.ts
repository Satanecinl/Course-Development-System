/**
 * L6-E2 API Route — Course-Setting XLSX Partial Import Plan
 *
 * Stage: L6-E2-XLSX-COURSE-SETTING-PARTIAL-IMPORT-PLAN-IN-PAGE
 *
 * POST /api/admin/import/course-setting-xlsx/partial-import-plan
 *
 * Plan-only endpoint. Re-parses the Excel server-side, re-loads the
 * semester-scoped existing data (read-only Prisma), and combines the
 * page-supplied manual resolution state with the L4 dry-run result to
 * produce a structured PARTIAL import plan.
 *
 * NO DB writes. NO ImportBatch. NO TeachingTask / TeachingTaskClass / Course
 * / ClassGroup / Teacher creation. NO apply list. NO active semester switch.
 *
 * Permission: import:manage
 * Accepts: .xlsx only
 * Rejects: .docx
 *
 * Request (multipart/form-data):
 *   - file: .xlsx (required, max 20MB)
 *   - targetSemesterId: number (required, must exist)
 *   - manualResolutions: JSON string (required) — array of L6-E1
 *     `CourseSettingManualResolutionItem` shape. Backend validates every
 *     approvalItemId and every existing entity reference.
 *
 * Response (success):
 *   - planOnly: true, dryRunOnly: true, dbWritten: false
 *   - applyAllowed: false, applyRouteExists: false
 *   - importBatchCreated: false, teachingTaskCreated: false
 *   - full plan: importableRows / skippedRows / unresolvedRows /
 *     createCandidates (Course + ClassGroup only; teachers always []) /
 *     teachingTasks / teachingTaskClasses / duplicateRisks / blockers
 *
 * Hard constraints:
 *  - No Prisma write methods (no create/update/upsert/delete/createMany/
 *    updateMany/deleteMany/executeRaw). Only read methods (findUnique,
 *    findFirst, findMany, count).
 *  - No console.log / console.error of any raw row data.
 *  - No filesystem writes; the file Buffer is discarded when the request ends.
 *  - The returned rawDisplayPolicy.exportedPlanRawIncluded === false.
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
  L6_E2_STAGE,
  buildCourseSettingPartialImportPlan,
  validatePartialImportPlan,
} from '@/lib/import/course-setting-partial-import-plan-l6-e2'

const MAX_FILE_SIZE = 20 * 1024 * 1024 // 20MB
const ERROR_MISSING_TARGET_SEMESTER = 'MISSING_TARGET_SEMESTER'
const ERROR_INVALID_TARGET_SEMESTER = 'INVALID_TARGET_SEMESTER'
const ERROR_TARGET_SEMESTER_NOT_FOUND = 'TARGET_SEMESTER_NOT_FOUND'
const ERROR_MISSING_FILE = 'MISSING_FILE'
const ERROR_INVALID_FILE_TYPE = 'INVALID_FILE_TYPE'
const ERROR_FILE_TOO_LARGE = 'FILE_TOO_LARGE'
const ERROR_MISSING_MANUAL_RESOLUTIONS = 'MISSING_MANUAL_RESOLUTIONS'
const ERROR_INVALID_MANUAL_RESOLUTIONS = 'INVALID_MANUAL_RESOLUTIONS'

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
      stage: L6_E2_STAGE,
      planOnly: true,
      dryRunOnly: true,
      dbWritten: false,
      applyAllowed: false,
      applyRouteExists: false,
      importBatchCreated: false,
      teachingTaskCreated: false,
    },
    { status },
  )

export async function POST(request: NextRequest): Promise<NextResponse> {
  const auth = await requirePermission('import:manage', request)
  if ('error' in auth && auth.error) return auth.error

  try {
    const formData = await request.formData()
    const file = formData.get('file')
    if (!file || !(file instanceof File)) {
      return errorResponse(ERROR_MISSING_FILE, '请上传 .xlsx 文件', 400)
    }

    const fileName = file.name.toLowerCase()
    if (!fileName.endsWith('.xlsx')) {
      const detail = fileName.endsWith('.docx')
        ? '不支持 .docx 格式，请使用 .xlsx 课程设置文件'
        : `收到的文件: ${file.name}，仅支持 .xlsx 格式`
      return errorResponse(ERROR_INVALID_FILE_TYPE, detail, 400)
    }

    if (file.size > MAX_FILE_SIZE) {
      return errorResponse(
        ERROR_FILE_TOO_LARGE,
        `文件大小 ${(file.size / 1024 / 1024).toFixed(1)}MB，限制 20MB`,
        400,
      )
    }

    // ── Validate targetSemesterId ──────────────────────────────────────
    const targetSemesterIdRaw = formData.get('targetSemesterId')
    if (targetSemesterIdRaw == null || targetSemesterIdRaw === '') {
      return errorResponse(
        ERROR_MISSING_TARGET_SEMESTER,
        '请选择导入目标学期',
        400,
      )
    }
    const targetSemesterId = Number(targetSemesterIdRaw)
    if (!Number.isInteger(targetSemesterId) || targetSemesterId <= 0) {
      return errorResponse(
        ERROR_INVALID_TARGET_SEMESTER,
        '目标学期 ID 无效',
        400,
      )
    }

    // ── Validate manualResolutions JSON ────────────────────────────────
    const manualResolutionsRaw = formData.get('manualResolutions')
    if (
      manualResolutionsRaw == null ||
      typeof manualResolutionsRaw !== 'string' ||
      manualResolutionsRaw.trim().length === 0
    ) {
      return errorResponse(
        ERROR_MISSING_MANUAL_RESOLUTIONS,
        '请提交当前页面的 manualResolutions',
        400,
      )
    }
    let parsedResolutions: unknown
    try {
      parsedResolutions = JSON.parse(manualResolutionsRaw)
    } catch (e) {
      return errorResponse(
        ERROR_INVALID_MANUAL_RESOLUTIONS,
        `manualResolutions 不是合法 JSON: ${(e as Error).message}`,
        400,
      )
    }
    if (!Array.isArray(parsedResolutions)) {
      return errorResponse(
        ERROR_INVALID_MANUAL_RESOLUTIONS,
        'manualResolutions 必须是 JSON 数组',
        400,
      )
    }
    const manualResolutions: CourseSettingManualResolutionItem[] =
      parsedResolutions as CourseSettingManualResolutionItem[]

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
      return errorResponse(
        ERROR_TARGET_SEMESTER_NOT_FOUND,
        '目标学期不存在',
        400,
      )
    }

    // ── Step 1: L4 semester-scoped dry-run (read-only) ─────────────────
    const existingData = await loadCourseSettingExistingDataForSemester(
      targetSemesterId,
    )

    const dryRunResult = await buildCourseSettingTeachingTaskDryRun({
      xlsxBuffer: buffer,
      artifactFilename: file.name,
      existingData,
      options: { parserVersion: 'l2-parser-v1', includeRawValues: true },
    })

    // ── Step 2: Build L6-D approval package + L6-D2 review UI rows ─────
    // This is the canonical per-row source for the L6-E2 plan. The
    // approvalItemId is the join key with the page-supplied manualResolutions.
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
    const decisionPackage = buildInitialCourseSettingDecisionPackage({
      approvalPackage,
    })

    const reviewUi = buildCourseSettingApprovalReviewUi({
      approvalPackage,
      // raw map intentionally omitted — runtime raw text is not needed
      // for the L6-E2 plan. The plan is structural.
    })

    // ── Step 3: Build the L6-E2 plan from the review rows + manual resolutions
    const plan = await buildCourseSettingPartialImportPlan({
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

    const validation = validatePartialImportPlan(plan)
    if (!validation.ok) {
      return NextResponse.json(
        {
          success: false,
          stage: L6_E2_STAGE,
          error: 'PLAN_VALIDATION_FAILED',
          message: 'plan validation failed',
          violations: validation.violations,
          warnings: validation.warnings,
        },
        { status: 500 },
      )
    }

    return NextResponse.json({
      success: true,
      stage: plan.stage,
      planVersion: plan.planVersion,
      planOnly: true,
      dryRunOnly: true,
      dbWritten: false,
      applyAllowed: false,
      applyRouteExists: false,
      importBatchCreated: false,
      teachingTaskCreated: false,
      teachingTaskClassCreated: false,
      courseCreated: false,
      classGroupCreated: false,
      teacherCreated: false,
      excelPartialImportApplied: false,
      targetSemester: {
        id: semester.id,
        name: semester.name,
        code: semester.code,
        isActive: semester.isActive,
        setAsActive: false as const,
      },
      sourceArtifact: plan.sourceArtifact,
      reviewPackageFingerprintHash: plan.reviewPackageFingerprintHash,
      reviewPackageDecisionAllPending: decisionPackage.summary.allDecisionsPending,
      summary: plan.summary,
      plan: plan.plan,
      rawDisplayPolicy: plan.rawDisplayPolicy,
      warnings: validation.warnings,
    })
  } catch (e: unknown) {
    const message = e instanceof Error ? e.message : String(e)
    const code = message === 'TARGET_SEMESTER_NOT_FOUND'
      ? ERROR_TARGET_SEMESTER_NOT_FOUND
      : 'INTERNAL'
    return errorResponse(code, message, code === ERROR_TARGET_SEMESTER_NOT_FOUND ? 400 : 500)
  }
}