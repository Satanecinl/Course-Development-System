/**
 * L6-D2 API Route — Course-Setting XLSX Approval Review UI
 *
 * POST /api/admin/import/course-setting-xlsx/approval-review
 *
 * Review-only endpoint. Combines the L4 semester-scoped dry-run, the L6-D
 * target-semester-bound approval package, and the L6-D2 UI projection into
 * a single response that an authorized admin frontend can render. NO DB
 * writes, NO ImportBatch, NO TeachingTask/TeachingTaskClass creation, NO
 * apply list, NO active-semester switch.
 *
 * Stage: L6-D2-XLSX-COURSE-SETTING-APPROVAL-REVIEW-UI
 *
 * Permission: import:manage
 * Accepts: .xlsx only
 * Rejects: .docx
 *
 * Request:
 *   multipart/form-data
 *     - file: .xlsx (required, max 20MB)
 *     - targetSemesterId: number (required, must exist)
 *     - maxRows?: number (optional, default 200, max 5000)
 *
 * Behavior:
 *   1. requirePermission('import:manage', request) — 401 / 403 if missing.
 *   2. Validate the file: must be a File, must be .xlsx, must be ≤ 20MB.
 *   3. Validate targetSemesterId: required, integer > 0, semester must exist.
 *   4. Read the file into a Buffer; never persist to disk.
 *   5. Build the L4 semester-scoped dry-run (existingData scoped to
 *      targetSemesterId) via buildCourseSettingTeachingTaskDryRun.
 *   6. Build the L6-D target-semester-bound approval package via
 *      buildCourseSettingApprovalPackageWithTargetSemester.
 *   7. Build the L6-D1 initial decision package via
 *      buildInitialCourseSettingDecisionPackage (fingerprint cross-check
 *      only — the initial decisions stay pure client state).
 *   8. Build the L6-D2 UI projection via buildCourseSettingApprovalReviewUi.
 *      The `rawByApprovalItemId` map is populated by joining the L4
 *      preview candidates' parsed rows by sheetIndex+sourceRowIndex and
 *      carrying courseName / teacherText / classText / remark / mergeRemark
 *      / weeklyHoursText / examTypeText for runtime UI display. The
 *      `sheetNameByIndex` map is populated from the parsed workbook's
 *      sheetNames array.
 *   9. If maxRows would truncate the rows array, the truncated count is
 *      surfaced as `truncatedRows` in the response; the summary counts
 *      still reflect the full approval package.
 *
 * Hard constraints:
 *   - No Prisma write methods (no create/update/upsert/delete/createMany/
 *     updateMany/deleteMany/executeRaw). Only read methods (findUnique,
 *     findFirst, findMany, count).
 *   - No console.log / console.error of any raw row data.
 *   - No filesystem writes; the Buffer is discarded when the request ends.
 *   - No new npm packages.
 */

import { NextRequest, NextResponse } from 'next/server'
import { createHash } from 'node:crypto'
import { requirePermission } from '@/lib/auth/require-permission'
import { buildCourseSettingTeachingTaskDryRun } from '@/lib/import/course-setting-teaching-task-dry-run'
import { buildCourseSettingApprovalPackageWithTargetSemester } from '@/lib/import/course-setting-approval-package-l6-d'
import { buildInitialCourseSettingDecisionPackage } from '@/lib/import/course-setting-approval-review-l6-d1'
import { buildCourseSettingApprovalReviewUi } from '@/lib/import/course-setting-approval-review-ui-l6-d2'
import { parseCourseSettingXlsx } from '@/lib/import/course-setting-xlsx-parser'
import { loadCourseSettingExistingDataForSemester } from '@/lib/import/course-setting-xlsx-preview'
import ExcelJS from 'exceljs'
import type {
  CourseSettingApprovalReviewUiRaw,
} from '@/lib/import/course-setting-approval-review-ui-l6-d2'

const MAX_FILE_SIZE = 20 * 1024 * 1024 // 20MB
const DEFAULT_MAX_ROWS = 200
const ABSOLUTE_MAX_ROWS = 5000

const ERROR_MISSING_TARGET_SEMESTER = 'MISSING_TARGET_SEMESTER'
const ERROR_INVALID_TARGET_SEMESTER = 'INVALID_TARGET_SEMESTER'
const ERROR_TARGET_SEMESTER_NOT_FOUND = 'TARGET_SEMESTER_NOT_FOUND'
const ERROR_INVALID_MAX_ROWS = 'INVALID_MAX_ROWS'

export async function POST(request: NextRequest) {
  const auth = await requirePermission('import:manage', request)
  if ('error' in auth) return auth.error

  try {
    const formData = await request.formData()
    const file = formData.get('file')

    if (!file || !(file instanceof File)) {
      return NextResponse.json(
        {
          success: false,
          error: '请上传 .xlsx 文件',
          message: '未收到文件',
          reviewOnly: true,
          dryRunOnly: true,
          dbWritten: false,
          applyAllowed: false,
          applyListGenerated: false,
        },
        { status: 400 },
      )
    }

    const fileName = file.name.toLowerCase()

    if (!fileName.endsWith('.xlsx')) {
      const detail = fileName.endsWith('.docx')
        ? '不支持 .docx 格式，请使用 .xlsx 课程设置文件'
        : `收到的文件: ${file.name}，仅支持 .xlsx 格式`
      return NextResponse.json(
        {
          success: false,
          error: '只支持 .xlsx 格式',
          message: detail,
          reviewOnly: true,
          dryRunOnly: true,
          dbWritten: false,
          applyAllowed: false,
          applyListGenerated: false,
        },
        { status: 400 },
      )
    }

    if (file.size > MAX_FILE_SIZE) {
      return NextResponse.json(
        {
          success: false,
          error: '文件过大',
          message: `文件大小 ${(file.size / 1024 / 1024).toFixed(1)}MB，限制 20MB`,
          reviewOnly: true,
          dryRunOnly: true,
          dbWritten: false,
          applyAllowed: false,
          applyListGenerated: false,
        },
        { status: 400 },
      )
    }

    const arrayBuffer = await file.arrayBuffer()
    const buffer = Buffer.from(arrayBuffer)

    // ── Validate targetSemesterId ──────────────────────────────────────
    const targetSemesterIdRaw = formData.get('targetSemesterId')
    if (targetSemesterIdRaw == null || targetSemesterIdRaw === '') {
      return NextResponse.json(
        {
          success: false,
          error: ERROR_MISSING_TARGET_SEMESTER,
          message: '请选择导入目标学期',
          reviewOnly: true,
          dryRunOnly: true,
          dbWritten: false,
          applyAllowed: false,
          applyListGenerated: false,
        },
        { status: 400 },
      )
    }

    const targetSemesterId = Number(targetSemesterIdRaw)
    if (!Number.isInteger(targetSemesterId) || targetSemesterId <= 0) {
      return NextResponse.json(
        {
          success: false,
          error: ERROR_INVALID_TARGET_SEMESTER,
          message: '目标学期 ID 无效',
          reviewOnly: true,
          dryRunOnly: true,
          dbWritten: false,
          applyAllowed: false,
          applyListGenerated: false,
        },
        { status: 400 },
      )
    }

    // ── Validate maxRows (optional) ────────────────────────────────────
    const maxRowsRaw = formData.get('maxRows')
    let maxRows = DEFAULT_MAX_ROWS
    if (maxRowsRaw != null && maxRowsRaw !== '') {
      const parsed = Number(maxRowsRaw)
      if (
        !Number.isInteger(parsed) ||
        parsed <= 0 ||
        parsed > ABSOLUTE_MAX_ROWS
      ) {
        return NextResponse.json(
          {
            success: false,
            error: ERROR_INVALID_MAX_ROWS,
            message: `maxRows 必须是 1..${ABSOLUTE_MAX_ROWS} 之间的整数`,
            reviewOnly: true,
            dryRunOnly: true,
            dbWritten: false,
            applyAllowed: false,
            applyListGenerated: false,
          },
          { status: 400 },
        )
      }
      maxRows = parsed
    }

    // ── Resolve target semester (read-only) ─────────────────────────────
    const { prisma } = await import('@/lib/prisma')
    const semester = await prisma.semester.findUnique({
      where: { id: targetSemesterId },
      select: { id: true, name: true, code: true, isActive: true },
    })
    if (!semester) {
      return NextResponse.json(
        {
          success: false,
          error: ERROR_TARGET_SEMESTER_NOT_FOUND,
          message: '目标学期不存在',
          reviewOnly: true,
          dryRunOnly: true,
          dbWritten: false,
          applyAllowed: false,
          applyListGenerated: false,
        },
        { status: 400 },
      )
    }

    // ── Step 1: L4 semester-scoped dry-run ─────────────────────────────
    // existingData is read-only Prisma findMany/count; scoped by targetSemesterId.
    const existingData = await loadCourseSettingExistingDataForSemester(
      targetSemesterId,
    )

    const dryRunResult = await buildCourseSettingTeachingTaskDryRun({
      xlsxBuffer: buffer,
      artifactFilename: file.name,
      existingData,
      options: { parserVersion: 'l2-parser-v1', includeRawValues: true },
    })

    // ── Step 2: Build redacted target semester + source artifact refs ──
    // These are the only redacted fields the L6-D helper accepts.
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

    const fileSha256 = createHash('sha256').update(buffer).digest('hex')
    const filenameHash = createHash('sha256')
      .update(file.name, 'utf8')
      .digest('hex')
      .slice(0, 12)

    const l6DTargetSemester = {
      id: semester.id,
      idHash,
      nameHash,
      codeHash,
      isActive: semester.isActive,
      taskCount: dryRunResult.existingDataSummary.teachingTaskCount,
      classGroupCount: dryRunResult.existingDataSummary.classGroupCount,
    }

    const l6DSourceArtifact = {
      artifactSha256: fileSha256,
      artifactFilenameHash: filenameHash,
      sizeBytes: buffer.length,
      parserVersion: dryRunResult.parser.parserVersion,
    }

    // ── Step 3: L6-D approval package (redacted) ───────────────────────
    const approvalPackage = buildCourseSettingApprovalPackageWithTargetSemester({
      dryRunResult,
      targetSemester: l6DTargetSemester,
      sourceArtifact: l6DSourceArtifact,
    })

    // ── Step 4: L6-D1 decision package (redacted, fingerprint cross-check)
    // We build it for the fingerprint invariant; no decisions are flipped
    // (all initial decisions are `pending`).
    const decisionPackage = buildInitialCourseSettingDecisionPackage({
      approvalPackage,
    })

    // ── Step 5: Parse again with includeRawValues=true to harvest raw text
    // and to build the sheetName map. Used IN-MEMORY ONLY to populate
    // `rawByApprovalItemId` and `sheetNameByIndex` for the authorized
    // admin UI projection. Never persisted.
    const parseResult = await parseCourseSettingXlsx(buffer, {
      artifactFilename: file.name,
      parserVersion: 'l2-parser-v1',
      includeRawValues: true,
    })

    // sheetNameByIndex: sheetIndex → display name. ExcelJS retains the
    // raw sheet name on each worksheet; the parser only emits the hash,
    // so we re-load the buffer in-memory to harvest the display names.
    // The buffer is never written to disk.
    const sheetNameByIndex = new Map<number, string>()
    try {
      const wb = new ExcelJS.Workbook()
      await wb.xlsx.load(buffer as unknown as ArrayBuffer)
      wb.worksheets.forEach((ws, idx) => {
        if (typeof ws.name === 'string' && ws.name.length > 0) {
          sheetNameByIndex.set(idx, ws.name)
        }
      })
    } catch {
      // Sheet names are convenience-only; ignore parse errors and fall
      // back to hash-only `source.sheetName = null`.
    }

    // rawByApprovalItemId: approvalItemId → raw row text. Joined by
    // sheetIndex+sourceRowIndex from the L4 preview candidates to the
    // parsed rows. This is runtime UI data only; never persisted.
    const rawByApprovalItemId = new Map<string, CourseSettingApprovalReviewUiRaw>()
    // Build parsed-row index by sheetIndex → sourceRowIndex → row.
    const parsedRowByRef = new Map<string, typeof parseResult.sheets[number]['rows'][number]>()
    for (const sheet of parseResult.sheets) {
      for (const row of sheet.rows) {
        if (row.rowKind !== 'course') continue
        parsedRowByRef.set(`${row.sheetIndex}:${row.sourceRowIndex}`, row)
      }
    }
    for (const pc of dryRunResult.previewCandidates) {
      const approvalItemId = `approval:${pc.sheetIndex}:${pc.sourceRowIndex}`
      const parsedRow = parsedRowByRef.get(`${pc.sheetIndex}:${pc.sourceRowIndex}`)
      if (!parsedRow) continue
      const teacherText =
        parsedRow.teacherAssignment?.assignments
          ?.map((a) =>
            a.scopeLabel ? `${a.teacherName ?? ''}(${a.scopeLabel})` : a.teacherName,
          )
          .filter((s): s is string => typeof s === 'string' && s.length > 0)
          .join('、') ?? null
      const classText =
        parsedRow.classCount?.parsedClassGroups
          ?.map((cg) => cg.classLabel)
          .filter((s): s is string => typeof s === 'string' && s.length > 0)
          .join('、') ?? null
      const weeklyHoursText =
        parsedRow.weeklyHours && parsedRow.weeklyHours.value !== undefined
          ? String(parsedRow.weeklyHours.value)
          : null
      const examTypeText = parsedRow.examType?.normalized ?? null
      rawByApprovalItemId.set(approvalItemId, {
        courseName: parsedRow.courseName?.normalized ?? null,
        teacherText,
        classText,
        remark: parsedRow.remark?.normalized ?? null,
        mergeRemark: parsedRow.mergeRemark?.normalized ?? null,
        weeklyHoursText,
        examTypeText,
      })
    }

    // ── Step 6: L6-D2 UI projection ────────────────────────────────────
    const reviewUi = buildCourseSettingApprovalReviewUi({
      approvalPackage,
      rawByApprovalItemId,
      sheetNameByIndex,
    })

    // ── Step 7: Truncate rows to maxRows (summary stays full) ─────────
    const fullRows = reviewUi.rows
    const truncatedRows = Math.max(0, fullRows.length - maxRows)
    const rows = truncatedRows > 0 ? fullRows.slice(0, maxRows) : fullRows

    // ── Step 8: Build response ─────────────────────────────────────────
    // The response shape mirrors the spec exactly.
    return NextResponse.json({
      success: true,
      stage: 'L6-D2-XLSX-COURSE-SETTING-APPROVAL-REVIEW-UI',
      reviewOnly: true,
      dryRunOnly: true,
      dbWritten: false,
      applyAllowed: false,
      applyListGenerated: false,
      targetSemester: {
        id: semester.id,
        name: semester.name,
        code: semester.code,
        isActive: semester.isActive,
        setAsActive: false,
      },
      sourceArtifact: {
        filename: file.name,
        sha256: fileSha256,
        sizeBytes: buffer.length,
      },
      packageRef: {
        targetSemesterId: approvalPackage.targetSemester.id,
        dryRunFingerprintHash: approvalPackage.dryRunFingerprint.hash,
        itemCount: approvalPackage.approvalSummary.totalItems,
      },
      summary: {
        totalItems: reviewUi.summary.totalItems,
        pendingItems: reviewUi.summary.pendingItems,
        approvedItems: reviewUi.summary.approvedItems,
        rejectedItems: reviewUi.summary.rejectedItems,
        needsReviewItems: reviewUi.summary.needsReviewItems,
        blockedItems: reviewUi.summary.blockedItems,
        autoSafeCandidates: reviewUi.summary.autoSafeCandidates,
        applyReady: reviewUi.summary.applyReady,
      },
      rawDisplayPolicy: {
        runtimeUiRawAllowed: reviewUi.rawDisplayPolicy.runtimeUiRawAllowed,
        exportedDecisionFileRawIncluded:
          reviewUi.rawDisplayPolicy.exportedDecisionFileRawIncluded,
        committedDocsRawAllowed: reviewUi.rawDisplayPolicy.committedDocsRawAllowed,
        scope: reviewUi.rawDisplayPolicy.scope,
      },
      rows,
      truncatedRows,
      // The decision package is built only for the fingerprint cross-check.
      // We do NOT include it in the response — the L6-D2 review-only
      // invariant keeps the initial decision overlay inside this route's
      // `rows[i].decision` field (always pending). The fingerprint itself
      // is included via `packageRef.dryRunFingerprintHash` above.
      _debug: {
        approvalPackageStage: approvalPackage.stage,
        approvalPackageVersion: approvalPackage.packageVersion,
        decisionPackageStage: decisionPackage.stage,
        decisionPackageVersion: decisionPackage.packageVersion,
        decisionPackageAllPending: decisionPackage.summary.allDecisionsPending,
      },
    })
  } catch (e: unknown) {
    const message = e instanceof Error ? e.message : String(e)
    const errorCode = message === 'TARGET_SEMESTER_NOT_FOUND'
      ? ERROR_TARGET_SEMESTER_NOT_FOUND
      : 'INTERNAL'
    return NextResponse.json(
      {
        success: false,
        error: errorCode,
        message,
        reviewOnly: true,
        dryRunOnly: true,
        dbWritten: false,
        applyAllowed: false,
        applyListGenerated: false,
      },
      { status: errorCode === ERROR_TARGET_SEMESTER_NOT_FOUND ? 400 : 500 },
    )
  }
}
