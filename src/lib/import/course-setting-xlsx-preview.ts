/**
 * L3 Server Helper — Course Setting XLSX Preview
 *
 * Thin adapter between the L2 parser and the API route.
 * Hard constraints:
 *  - No Prisma, no DB writes, no filesystem write operations.
 *  - No ImportBatch creation.
 *  - Pure over the input Buffer.
 *  - Returns a preview-only response shape.
 */

import { parseCourseSettingXlsx } from './course-setting-xlsx-parser'
import type { CourseSettingXlsxParseResult } from './course-setting-xlsx-parser'

// ── Types ──────────────────────────────────────────────────────────────────

export type CourseSettingXlsxPreviewResult = {
  success: true
  parserType: 'courseSettingXlsx'
  previewOnly: true
  canConfirm: false
  canApply: false
  artifact: { filename: string; sha256: string; sizeBytes: number }
  parser: { parserVersion: string; durationMs: number }
  workbookSummary: {
    sheetCount: number
    parsedSheetCount: number
    totalRows: number
    totalCourseRows: number
    totalWarnings: number
  }
  fieldSummary: {
    classCount: Record<string, number>
    teacherAssignment: Record<string, number>
    examType: Record<string, number>
    weeklyHours: Record<string, number>
    remark: Record<string, number>
    mergeRemark: Record<string, number>
  }
  sourceEvidenceSummary: {
    draftRows: number
    coveragePercent: number
    hashStrategy: 'sha256-prefix-12'
  }
  diagnosticsSummary: {
    total: number
    bySeverity: Record<string, number>
    byCode: Record<string, number>
  }
  previewRows: Array<{
    sheetIndex: number
    sheetNameHash: string
    sourceRowIndex: number
    rowKind: string
    displayIndex: number
    courseNameHash?: string
    gradeMajorHash?: string
    classCountRawHash?: string
    teacherRawHash?: string
    remarkHash?: string
    mergeRemarkHash?: string
    classCountClassification?: string
    classGroupCandidateCount?: number
    teacherAssignmentClassification?: string
    teacherAssignmentCandidateCount?: number
    examTypeClassification?: string
    weeklyHoursClassification?: string
    weeklyHoursValue?: number
    confidence: number
    warningCodes: string[]
    needsManualReview: boolean
    manualReviewReasons: string[]
  }>
  manualReviewSummary: {
    totalRowsNeedingReview: number
    reasons: Record<string, number>
  }
}

// ── Main function ──────────────────────────────────────────────────────────

export async function buildCourseSettingXlsxPreview(
  buffer: Buffer,
  filename: string,
): Promise<CourseSettingXlsxPreviewResult> {
  const t0 = Date.now()

  const parseResult = await parseCourseSettingXlsx(buffer, {
    artifactFilename: filename,
    parserVersion: 'l2-parser-v1',
    includeRawValues: false,
  })

  const durationMs = Date.now() - t0

  // Build field summaries
  const fieldSummary = buildFieldSummary(parseResult)
  const sourceEvidenceSummary = buildSourceEvidenceSummary(parseResult)
  const diagnosticsSummary = buildDiagnosticsSummary(parseResult)
  const previewRows = buildPreviewRows(parseResult)
  const manualReviewSummary = buildManualReviewSummary(previewRows)

  return {
    success: true,
    parserType: 'courseSettingXlsx',
    previewOnly: true,
    canConfirm: false,
    canApply: false,
    artifact: {
      filename: parseResult.artifact.filename ?? filename,
      sha256: parseResult.artifact.sha256,
      sizeBytes: buffer.length,
    },
    parser: {
      parserVersion: parseResult.parserVersion,
      durationMs,
    },
    workbookSummary: {
      sheetCount: parseResult.workbook.sheetCount,
      parsedSheetCount: parseResult.workbook.parsedSheetCount,
      totalRows: parseResult.workbook.totalRows,
      totalCourseRows: parseResult.workbook.totalCourseRows,
      totalWarnings: parseResult.workbook.totalWarnings,
    },
    fieldSummary,
    sourceEvidenceSummary,
    diagnosticsSummary,
    previewRows,
    manualReviewSummary,
  }
}

// ── Internal builders ──────────────────────────────────────────────────────

function buildFieldSummary(parseResult: CourseSettingXlsxParseResult) {
  const classCount: Record<string, number> = {}
  const teacherAssignment: Record<string, number> = {}
  const examType: Record<string, number> = {}
  const weeklyHours: Record<string, number> = {}
  const remark: Record<string, number> = {}
  const mergeRemark: Record<string, number> = {}

  for (const sheet of parseResult.sheets) {
    for (const row of sheet.rows) {
      if (row.rowKind !== 'course') continue
      if (row.classCount) {
        const k = row.classCount.primaryClassification
        classCount[k] = (classCount[k] ?? 0) + 1
      }
      if (row.teacherAssignment) {
        const k = row.teacherAssignment.primaryClassification
        teacherAssignment[k] = (teacherAssignment[k] ?? 0) + 1
      }
      if (row.examType) {
        const k = row.examType.classification
        examType[k] = (examType[k] ?? 0) + 1
      }
      if (row.weeklyHours) {
        const k = row.weeklyHours.classification
        weeklyHours[k] = (weeklyHours[k] ?? 0) + 1
      }
      if (row.remark) {
        const r = row.remark as Record<string, unknown>
        const k = (typeof r.classification === 'string' ? r.classification : 'other') as string
        remark[k] = (remark[k] ?? 0) + 1
      }
      if (row.mergeRemark) {
        const m = row.mergeRemark as Record<string, unknown>
        const k = (typeof m.classification === 'string' ? m.classification : 'other') as string
        mergeRemark[k] = (mergeRemark[k] ?? 0) + 1
      }
    }
  }

  return { classCount, teacherAssignment, examType, weeklyHours, remark, mergeRemark }
}

function buildSourceEvidenceSummary(parseResult: CourseSettingXlsxParseResult) {
  let draftRows = 0
  for (const sheet of parseResult.sheets) {
    for (const row of sheet.rows) {
      if (row.sourceEvidence?.sourceSheetNameHash) draftRows += 1
    }
  }
  const totalRows = parseResult.workbook.totalRows
  const coveragePercent = totalRows > 0 ? Math.round((draftRows / totalRows) * 10000) / 100 : 0

  return { draftRows, coveragePercent, hashStrategy: 'sha256-prefix-12' as const }
}

function buildDiagnosticsSummary(parseResult: CourseSettingXlsxParseResult) {
  const bySeverity: Record<string, number> = {}
  const byCode: Record<string, number> = {}
  let total = 0

  for (const d of parseResult.diagnostics) {
    total += 1
    bySeverity[d.severity] = (bySeverity[d.severity] ?? 0) + 1
    byCode[d.code] = (byCode[d.code] ?? 0) + 1
  }
  for (const sheet of parseResult.sheets) {
    for (const d of sheet.diagnostics) {
      total += 1
      bySeverity[d.severity] = (bySeverity[d.severity] ?? 0) + 1
      byCode[d.code] = (byCode[d.code] ?? 0) + 1
    }
    for (const row of sheet.rows) {
      for (const w of row.warnings) {
        total += 1
        bySeverity[w.severity] = (bySeverity[w.severity] ?? 0) + 1
        byCode[w.code] = (byCode[w.code] ?? 0) + 1
      }
    }
  }

  return { total, bySeverity, byCode }
}

function buildPreviewRows(parseResult: CourseSettingXlsxParseResult) {
  const rows: CourseSettingXlsxPreviewResult['previewRows'] = []
  let displayIndex = 0

  for (const sheet of parseResult.sheets) {
    for (const row of sheet.rows) {
      if (row.rowKind !== 'course') continue
      displayIndex += 1

      const warningCodes = row.warnings.map((w) => w.code)
      const manualReviewReasons: string[] = []

      if (row.classCount?.primaryClassification === 'other') {
        manualReviewReasons.push('classCount.other')
      }
      if (row.teacherAssignment?.primaryClassification === 'other') {
        manualReviewReasons.push('teacherAssignment.other')
      }
      if (row.weeklyHours?.classification === 'nonNumeric') {
        manualReviewReasons.push('weeklyHours.nonNumeric')
      }
      if (row.examType?.classification === 'other') {
        manualReviewReasons.push('examType.other')
      }
      if (row.confidence < 0.8) {
        manualReviewReasons.push('lowConfidence')
      }

      rows.push({
        sheetIndex: row.sheetIndex,
        sheetNameHash: row.sheetNameHash,
        sourceRowIndex: row.sourceRowIndex,
        rowKind: row.rowKind,
        displayIndex,
        courseNameHash: row.courseName?.rawHash,
        gradeMajorHash: row.gradeMajor?.rawHash,
        classCountRawHash: row.classCount?.rawHash,
        teacherRawHash: row.teacherAssignment?.rawHash,
        remarkHash: row.remark?.rawHash,
        mergeRemarkHash: row.mergeRemark?.rawHash,
        classCountClassification: row.classCount?.primaryClassification,
        classGroupCandidateCount: row.classCount?.parsedClassGroups?.length,
        teacherAssignmentClassification: row.teacherAssignment?.primaryClassification,
        teacherAssignmentCandidateCount: row.teacherAssignment?.assignments?.length,
        examTypeClassification: row.examType?.classification,
        weeklyHoursClassification: row.weeklyHours?.classification,
        weeklyHoursValue: row.weeklyHours?.value,
        confidence: row.confidence,
        warningCodes,
        needsManualReview: manualReviewReasons.length > 0,
        manualReviewReasons,
      })
    }
  }

  return rows
}

function buildManualReviewSummary(
  previewRows: CourseSettingXlsxPreviewResult['previewRows'],
) {
  const reasons: Record<string, number> = {}
  let totalRowsNeedingReview = 0

  for (const row of previewRows) {
    if (row.needsManualReview) {
      totalRowsNeedingReview += 1
      for (const reason of row.manualReviewReasons) {
        reasons[reason] = (reasons[reason] ?? 0) + 1
      }
    }
  }

  return { totalRowsNeedingReview, reasons }
}
