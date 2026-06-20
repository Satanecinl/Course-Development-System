/**
 * L3/L6-B Server Helper — Course Setting XLSX Preview
 *
 * Thin adapter between the L2 parser, L4 mapper, and the API route.
 * Hard constraints:
 *  - L3 mode: Pure Buffer parse, no DB, no dry-run.
 *  - L6-B mode: Read-only Prisma (findMany/count) for semester-scoped
 *    existingData + L4 dry-run mapping. No DB writes, no ImportBatch.
 */

import { parseCourseSettingXlsx } from './course-setting-xlsx-parser'
import type { CourseSettingXlsxParseResult } from './course-setting-xlsx-parser'
import {
  buildCourseSettingTeachingTaskDryRun,
  normalizeForMatch,
  type CourseSettingExistingImportData,
} from './course-setting-teaching-task-dry-run'

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

export type CourseSettingXlsxSemesterSummary = {
  id: number
  nameHash: string
  code: string | null
  isActive: boolean
  isActiveSemester: boolean
  setAsActive: false
  classGroupCount: number
  teachingTaskCount: number
  teachingTaskClassCount: number
  courseCount: number
  teacherCount: number
}

export type CourseSettingXlsxDryRunSummary = {
  dryRunOnly: true
  dbWritten: false
  existingDataScopedBySemester: true
  courseCandidates: number
  teacherCandidates: number
  classGroupCandidates: number
  teachingTaskCandidates: number
  teachingTaskClassCandidates: number
  rowsNeedingManualReview: number
  rowsSkipped: number
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

// ── L6-B: Semester-scoped existingData loading ─────────────────────────────

/**
 * Load existing data scoped to the target semester.
 * Course/Teacher are global (loaded fully); ClassGroup/TeachingTask/TeachingTaskClass
 * are filtered by targetSemesterId.
 * Prisma read-only (findMany/count). No writes.
 */
export async function loadCourseSettingExistingDataForSemester(
  targetSemesterId: number,
): Promise<CourseSettingExistingImportData> {
  const { createHash } = await import('node:crypto')
  const { prisma } = await import('@/lib/prisma')

  const nameHash = (s: string) =>
    createHash('sha256').update(s.trim(), 'utf8').digest('hex').slice(0, 12)
  const normalizedHash = (s: string) =>
    createHash('sha256').update(normalizeForMatch(s), 'utf8').digest('hex').slice(0, 12)

  // Course + Teacher: global (no semesterId)
  const [courses, teachers] = await Promise.all([
    prisma.course.findMany({ select: { id: true, name: true } }),
    prisma.teacher.findMany({ select: { id: true, name: true } }),
  ])

  // ClassGroup, TeachingTask: semester-scoped
  const [classGroups, teachingTasks] = await Promise.all([
    prisma.classGroup.findMany({
      where: { semesterId: targetSemesterId },
      select: { id: true, name: true, studentCount: true },
    }),
    prisma.teachingTask.findMany({
      where: { semesterId: targetSemesterId },
      select: { id: true, courseId: true, teacherId: true },
    }),
  ])

  // TeachingTaskClass: scoped via teachingTask ids
  const taskIds = teachingTasks.map((t) => t.id)
  const teachingTaskClasses =
    taskIds.length > 0
      ? await prisma.teachingTaskClass.findMany({
          where: { teachingTaskId: { in: taskIds } },
          select: { id: true, teachingTaskId: true, classGroupId: true },
        })
      : []

  return {
    courses: courses.map((c) => ({
      id: c.id,
      nameHash: nameHash(c.name),
      normalizedNameHash: normalizedHash(c.name),
    })),
    teachers: teachers.map((t) => ({
      id: t.id,
      nameHash: nameHash(t.name),
      normalizedNameHash: normalizedHash(t.name),
    })),
    classGroups: classGroups.map((cg) => ({
      id: cg.id,
      nameHash: nameHash(cg.name),
      normalizedNameHash: normalizedHash(cg.name),
      studentCount: cg.studentCount,
    })),
    teachingTasks: teachingTasks.map((tt) => ({
      id: tt.id,
      courseId: tt.courseId,
      teacherId: tt.teacherId,
    })),
    teachingTaskClasses: teachingTaskClasses.map((ttc) => ({
      id: ttc.id,
      teachingTaskId: ttc.teachingTaskId,
      classGroupId: ttc.classGroupId,
    })),
  }
}

/**
 * Load semester summary info for the response.
 * Prisma read-only (findUnique/count). No writes.
 */
export async function loadSemesterSummary(
  targetSemesterId: number,
  activeSemesterId: number | null,
): Promise<CourseSettingXlsxSemesterSummary> {
  const { createHash } = await import('node:crypto')
  const { prisma } = await import('@/lib/prisma')

  const semester = await prisma.semester.findUnique({ where: { id: targetSemesterId } })
  if (!semester) {
    throw new Error('TARGET_SEMESTER_NOT_FOUND')
  }

  const [classGroupCount, teachingTaskCount, courseCount, teacherCount] = await Promise.all([
    prisma.classGroup.count({ where: { semesterId: targetSemesterId } }),
    prisma.teachingTask.count({ where: { semesterId: targetSemesterId } }),
    prisma.course.count(),
    prisma.teacher.count(),
  ])

  const taskIds = (
    await prisma.teachingTask.findMany({
      where: { semesterId: targetSemesterId },
      select: { id: true },
    })
  ).map((t) => t.id)

  const teachingTaskClassCount =
    taskIds.length > 0
      ? await prisma.teachingTaskClass.count({ where: { teachingTaskId: { in: taskIds } } })
      : 0

  const nameHash = createHash('sha256').update(semester.name, 'utf8').digest('hex').slice(0, 12)

  return {
    id: semester.id,
    nameHash,
    code: semester.code,
    isActive: semester.isActive,
    isActiveSemester: targetSemesterId === activeSemesterId,
    setAsActive: false as const,
    classGroupCount,
    teachingTaskCount,
    teachingTaskClassCount,
    courseCount,
    teacherCount,
  }
}

// ── L6-B: Semester-aware preview ───────────────────────────────────────────

export type CourseSettingXlsxPreviewWithSemesterResult = CourseSettingXlsxPreviewResult & {
  targetSemester: CourseSettingXlsxSemesterSummary
  dryRunSummary: CourseSettingXlsxDryRunSummary
  matchSummary: Record<string, Record<string, number>>
  requireExplicitSemesterForImport: boolean
  targetSemesterRequired: true
}

/**
 * L6-B: Build preview with target-semester-scoped dry-run.
 * Calls L2 parser (in-memory) + L4 mapper (in-memory with pre-loaded existingData).
 * Prisma read-only: loads existingData + semester counts.
 * No DB writes. No ImportBatch. previewOnly=true.
 */
export async function buildCourseSettingXlsxPreviewWithSemester(
  buffer: Buffer,
  filename: string,
  targetSemesterId: number,
  activeSemesterId: number | null,
  requireExplicitSemesterForImport: boolean,
): Promise<CourseSettingXlsxPreviewWithSemesterResult> {
  const t0 = Date.now()

  // 1. Load semester-scoped existingData (read-only Prisma)
  const existingData = await loadCourseSettingExistingDataForSemester(targetSemesterId)

  // 2. Run L2 parser + L4 mapper (both in-memory, no DB)
  const dryRunResult = await buildCourseSettingTeachingTaskDryRun({
    xlsxBuffer: buffer,
    artifactFilename: filename,
    existingData,
    options: { parserVersion: 'l2-parser-v1', includeRawValues: true },
  })

  // 3. Build L3 structural summaries from parse result
  // Re-parse with includeRawValues=false for preview row redaction
  const parseResult = await parseCourseSettingXlsx(buffer, {
    artifactFilename: filename,
    parserVersion: 'l2-parser-v1',
    includeRawValues: false,
  })

  const durationMs = Date.now() - t0
  const fieldSummary = buildFieldSummary(parseResult)
  const sourceEvidenceSummary = buildSourceEvidenceSummary(parseResult)
  const diagnosticsSummary = buildDiagnosticsSummary(parseResult)
  const previewRows = buildPreviewRows(parseResult)
  const manualReviewSummary = buildManualReviewSummary(previewRows)

  // 4. Load semester summary
  const targetSemester = await loadSemesterSummary(targetSemesterId, activeSemesterId)

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
    // L6-B: semester-scoped extensions
    targetSemester,
    dryRunSummary: {
      dryRunOnly: true as const,
      dbWritten: false as const,
      existingDataScopedBySemester: true as const,
      courseCandidates: dryRunResult.candidateSummary.courseCandidates,
      teacherCandidates: dryRunResult.candidateSummary.teacherCandidates,
      classGroupCandidates: dryRunResult.candidateSummary.classGroupCandidates,
      teachingTaskCandidates: dryRunResult.candidateSummary.teachingTaskCandidates,
      teachingTaskClassCandidates: dryRunResult.candidateSummary.teachingTaskClassCandidates,
      rowsNeedingManualReview: dryRunResult.candidateSummary.rowsNeedingManualReview,
      rowsSkipped: dryRunResult.candidateSummary.rowsSkipped,
    },
    matchSummary: dryRunResult.matchSummary as Record<string, Record<string, number>>,
    requireExplicitSemesterForImport,
    targetSemesterRequired: true as const,
  }
}
