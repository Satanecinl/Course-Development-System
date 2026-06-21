/**
 * L6-E2C — Course-Setting Task Split Detection (Pure, In-Memory)
 *
 * Stage: L6-E2C-XLSX-COURSE-SETTING-REVIEW-TABLE-CONTEXT-AND-TASK-SPLIT-DETECTION
 *
 * Identifies the common Excel pattern where a single row describes
 * the same course but with multiple teachers each covering a subset
 * of classes. Instead of requiring the human reviewer to manually
 * decompose the row, this helper generates split candidates that the
 * reviewer can confirm, reject, or flag for further review.
 *
 * Hard constraints:
 *  - Pure, deterministic, no DB, no fs, no React, no API.
 *  - No console.log of raw teacher/class text.
 *  - Never auto-confirms a split; all results are candidates.
 *  - No DB writes, no ImportBatch/TeachingTask/ClassGroup creation.
 */

import { createHash } from 'node:crypto'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type TaskSplitDetectionKind =
  | 'numberedTeacherAssignment'
  | 'parenthesizedClassAssignment'
  | 'parallelTeacherClassList'
  | 'mergeRemarkAssignment'
  | 'ambiguousMultiTeacherMultiClass'
  | 'none'

export type TeacherAssignmentSplitCandidate = {
  candidateId: string
  kind: TaskSplitDetectionKind
  confidence: number // 0..1
  requiresManualConfirmation: boolean
  source: {
    approvalItemId: string
    sheetName: string | null
    sheetIndex: number
    sourceRowIndex: number
    majorName: string | null
    majorNameHash: string | null
  }
  course: {
    rawName: string | null
    normalizedName: string | null
    courseId: number | null
  }
  meta: {
    weeklyHours: number | null
    weeklyHoursText: string | null
    examType: string | null
    examTypeText: string | null
  }
  assignments: Array<{
    assignmentId: string
    teacherRaw: string
    teacherNameHash: string
    teacherId: number | null
    teacherMatchStatus: 'matched' | 'missing' | 'ambiguous' | 'unknown'
    classRaw: string
    classNameHashes: string[]
    classGroupIds: number[]
    classMatchStatus: 'matched' | 'missing' | 'ambiguous' | 'unknown'
    warningCodes: string[]
  }>
  warningCodes: string[]
  diagnosticCodes: string[]
}

export type DetectTaskSplitInput = {
  approvalItemId: string
  sheetName: string | null
  sheetIndex: number
  sourceRowIndex: number
  majorName: string | null
  majorNameHash: string | null
  courseName: string | null
  teacherText: string | null
  classText: string | null
  remark: string | null
  mergeRemark: string | null
  weeklyHours: number | null
  weeklyHoursText: string | null
  examType: string | null
  examTypeText: string | null
  diagnosticCodes: string[]
  suggestedAction: string
}

export type DetectTaskSplitResult = {
  hasSplitDetection: boolean
  candidates: TeacherAssignmentSplitCandidate[]
  aggregateConfidence: number
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const sha12 = (s: string): string =>
  createHash('sha256').update(s, 'utf8').digest('hex').slice(0, 12)

const trim = (s: string | null): string => (s ?? '').trim()

const isBlank = (s: string | null): boolean => trim(s).length === 0

const isPlaceholder = (s: string): boolean =>
  /^(全部|所有|未知|外聘待定|空|null|undefined|暂无|待定|无|all|unknown|blank|none|未定)$/i.test(s) ||
  s.length < 2

/**
 * Split a teacher or class text by common Chinese delimiters.
 * Returns trimmed, non-empty segments.
 */
const splitByDelimiters = (text: string): string[] => {
  if (isBlank(text)) return []
  // Normalize separators
  const normalized = text
    .replace(/[；;、|/／]/g, ',')
    .replace(/，/g, ',')
    .replace(/\s{2,}/g, ' ')
  return normalized
    .split(',')
    .map((s) => s.trim())
    .filter((s) => s.length > 0)
}

/**
 * Strip leading numbers/dots/parens from teacher text.
 * e.g. "1.张三" → "张三"; "①张三" → "张三"
 */
const stripLeadingNumber = (s: string): string =>
  s
    .replace(/^[\d①②③④⑤⑥⑦⑧⑨⑩]+[\.、\s)）]*\s*/, '')
    .replace(/^[①②③④⑤⑥⑦⑧⑨⑩]+\s*/, '')
    .trim()

/**
 * Extract teacher from "张三(1班、2班)" or "张三（1班、2班）" pattern.
 * Returns [teacherName, classesText[]].
 */
const extractParenthesizedClasses = (
  s: string,
): [string, string[]] | null => {
  const m = s.match(/^(.+?)[（(]([^）)]+)[）)]$/)
  if (!m) return null
  const teacher = m[1]!.trim()
  const classesRaw = m[2]!.trim()
  if (isBlank(teacher)) return null
  return [teacher, splitByDelimiters(classesRaw)]
}

// ---------------------------------------------------------------------------
// Numbered teacher assignment detection
// e.g. "1.张三 2.李四" or "1、张三 2、李四" or "①张三 ②李四"
// ---------------------------------------------------------------------------

const detectNumberedAssignments = (teacherText: string): string[] | null => {
  if (isBlank(teacherText)) return null
  // Check if all segments start with a number
  const parts = teacherText
    .replace(/[；;、|/／，]/g, ' ')
    .replace(/\s{2,}/g, ' ')
    .trim()
    .split(/\s+/)
    .filter((s) => s.length > 0)

  const allNumbered = parts.every((p) =>
    /^[\d①②③④⑤⑥⑦⑧⑨⑩]+[\.、\s)）]*[^\s]/.test(p),
  )
  if (!allNumbered || parts.length < 2) return null
  return parts.map(stripLeadingNumber).filter((s) => s.length > 0)
}

// ---------------------------------------------------------------------------
// Parenthesized class assignment detection
// e.g. "张三(1班、2班) 李四(3班、4班)"
// ---------------------------------------------------------------------------

const detectParenthesizedAssignments = (
  teacherText: string,
): Array<{ teacher: string; classes: string[] }> | null => {
  if (isBlank(teacherText)) return null
  // Split by common separators between teacher blocks
  const blocks = teacherText
    .replace(/[；;/／]/g, ' ')
    .replace(/\s{2,}/g, ' ')
    .trim()
    .split(/\s+/)
    .filter((s) => s.length > 0)

  const results: Array<{ teacher: string; classes: string[] }> = []
  for (const block of blocks) {
    const extracted = extractParenthesizedClasses(block)
    if (!extracted) return null // if any block can't be parsed, abort
    results.push({ teacher: extracted[0], classes: extracted[1] })
  }
  return results.length >= 2 ? results : null
}

// ---------------------------------------------------------------------------
// Parallel teacher/class list detection
// e.g. teacherText: "张三、李四"  classText: "1班、2班"
// ---------------------------------------------------------------------------

const detectParallelAssignments = (
  teacherText: string,
  classText: string,
): Array<{ teacher: string; classes: string[] }> | null => {
  const teachers = splitByDelimiters(teacherText)
  const classes = splitByDelimiters(classText)
  if (teachers.length < 2 || classes.length < 2) return null
  if (teachers.length !== classes.length) return null
  return teachers.map((t, i) => ({
    teacher: stripLeadingNumber(t),
    classes: [classes[i]!],
  }))
}

// ---------------------------------------------------------------------------
// Merge remark assignment detection
// ---------------------------------------------------------------------------

const detectMergeRemarkAssignment = (
  remark: string | null,
  mergeRemark: string | null,
): Array<{ teacher: string; classes: string[] }> | null => {
  const combined = trim(remark) + ' ' + trim(mergeRemark)
  if (isBlank(combined.trim())) return null
  // Look for patterns like "张三带1班2班，李四带3班"
  const teacherClassPattern =
    /([^\s,，、；;]+)(?:带|负责|教)([^\s,，、；;]+)/g
  const matches = [...combined.matchAll(teacherClassPattern)]
  if (matches.length >= 2) {
    return matches.map((m) => ({
      teacher: m[1]!.trim(),
      classes: splitByDelimiters(m[2]!.trim()),
    }))
  }
  return null
}

// ---------------------------------------------------------------------------
// Main detection
// ---------------------------------------------------------------------------

/**
 * Detect task split candidates from a single Excel row's parsed fields.
 * Returns zero or more candidates; never auto-confirms.
 */
export const detectTaskSplitCandidates = (
  input: DetectTaskSplitInput,
): DetectTaskSplitResult => {
  const {
    approvalItemId,
    sheetName,
    sheetIndex,
    sourceRowIndex,
    majorName,
    majorNameHash,
    courseName,
    teacherText,
    classText,
    remark,
    mergeRemark,
    weeklyHours,
    weeklyHoursText,
    examType,
    examTypeText,
    diagnosticCodes,
    suggestedAction,
  } = input

  // Safety: skip placeholder teachers
  const tText = trim(teacherText)
  if (isPlaceholder(tText)) {
    return { hasSplitDetection: false, candidates: [], aggregateConfidence: 0 }
  }

  // Safety: if only one teacher, no split needed
  const teacherParts = splitByDelimiters(tText)
  if (teacherParts.length <= 1) {
    return { hasSplitDetection: false, candidates: [], aggregateConfidence: 0 }
  }

  const candidates: TeacherAssignmentSplitCandidate[] = []

  const baseSource = {
    approvalItemId,
    sheetName,
    sheetIndex,
    sourceRowIndex,
    majorName,
    majorNameHash,
  }
  const baseCourse = {
    rawName: courseName,
    normalizedName: courseName,
    courseId: null,
  }

  const baseMeta = {
    weeklyHours,
    weeklyHoursText,
    examType: examType ?? null,
    examTypeText,
  }

  // ── Pattern 1: Numbered teacher assignments ──
  const numbered = detectNumberedAssignments(tText)
  if (numbered) {
    const classParts = splitByDelimiters(trim(classText))
    const assignments = numbered.map((teacher, idx) => {
      const classes =
        classParts.length >= numbered.length
          ? [classParts[idx]!]
          : classParts.length === 1
            ? classParts
            : classParts.slice(
                Math.floor((idx * classParts.length) / numbered.length),
                Math.floor(((idx + 1) * classParts.length) / numbered.length),
              )
      return {
        assignmentId: `${sha12(approvalItemId + ':num:' + idx)}`,
        teacherRaw: teacher,
        teacherNameHash: sha12(teacher),
        teacherId: null,
        teacherMatchStatus: 'missing' as const,
        classRaw: classes.join('、'),
        classNameHashes: classes.map((c) => sha12(c)),
        classGroupIds: [],
        classMatchStatus: classes.length > 0 ? 'missing' as const : 'unknown' as const,
        warningCodes:
          classes.length === 0
            ? ['no_classes_mapped']
            : classParts.length < numbered.length
              ? ['class_count_mismatch']
              : [],
      }
    })

    candidates.push({
      candidateId: `split:numbered:${sha12(approvalItemId + ':numbered')}`,
      kind: 'numberedTeacherAssignment',
      confidence:
        classParts.length >= numbered.length
          ? 0.85
          : classParts.length === 0
            ? 0.5
            : 0.65,
      requiresManualConfirmation: true,
      source: baseSource,
      course: baseCourse,
      meta: baseMeta,
      assignments,
      warningCodes:
        classParts.length < numbered.length
          ? ['class_count_lower_than_teacher_count']
          : [],
      diagnosticCodes,
    })
  }

  // ── Pattern 2: Parenthesized class assignments ──
  const parenthesized = detectParenthesizedAssignments(tText)
  if (parenthesized) {
    const assignments = parenthesized.map((a, idx) => ({
      assignmentId: `${sha12(approvalItemId + ':par:' + idx)}`,
      teacherRaw: a.teacher,
      teacherNameHash: sha12(a.teacher),
      teacherId: null,
      teacherMatchStatus: 'missing' as const,
      classRaw: a.classes.join('、'),
      classNameHashes: a.classes.map((c) => sha12(c)),
      classGroupIds: [],
      classMatchStatus: a.classes.length > 0 ? 'missing' as const : 'unknown' as const,
      warningCodes:
        a.classes.length === 0 ? ['no_classes_mapped'] : [],
    }))

    candidates.push({
      candidateId: `split:parenthesized:${sha12(approvalItemId + ':paren')}`,
      kind: 'parenthesizedClassAssignment',
      confidence: 0.9,
      requiresManualConfirmation: true,
      source: baseSource,
      course: baseCourse,
      meta: baseMeta,
      assignments,
      warningCodes: [],
      diagnosticCodes,
    })
  }

  // ── Pattern 3: Parallel teacher/class lists ──
  const parallel = detectParallelAssignments(tText, trim(classText))
  if (parallel) {
    const assignments = parallel.map((a, idx) => ({
      assignmentId: `${sha12(approvalItemId + ':parl:' + idx)}`,
      teacherRaw: a.teacher,
      teacherNameHash: sha12(a.teacher),
      teacherId: null,
      teacherMatchStatus: 'missing' as const,
      classRaw: a.classes.join('、'),
      classNameHashes: a.classes.map((c) => sha12(c)),
      classGroupIds: [],
      classMatchStatus: a.classes.length > 0 ? 'missing' as const : 'unknown' as const,
      warningCodes: [],
    }))

    candidates.push({
      candidateId: `split:parallel:${sha12(approvalItemId + ':parallel')}`,
      kind: 'parallelTeacherClassList',
      confidence: 0.8,
      requiresManualConfirmation: true,
      source: baseSource,
      course: baseCourse,
      meta: baseMeta,
      assignments,
      warningCodes: [],
      diagnosticCodes,
    })
  }

  // ── Pattern 4: Merge remark assignment ──
  const mergeRemarkDetected = detectMergeRemarkAssignment(remark, mergeRemark)
  if (mergeRemarkDetected && !numbered && !parenthesized && !parallel) {
    const assignments = mergeRemarkDetected.map((a, idx) => ({
      assignmentId: `${sha12(approvalItemId + ':merge:' + idx)}`,
      teacherRaw: a.teacher,
      teacherNameHash: sha12(a.teacher),
      teacherId: null,
      teacherMatchStatus: 'missing' as const,
      classRaw: a.classes.join('、'),
      classNameHashes: a.classes.map((c) => sha12(c)),
      classGroupIds: [],
      classMatchStatus: a.classes.length > 0 ? 'missing' as const : 'unknown' as const,
      warningCodes:
        a.classes.length === 0 ? ['no_classes_mapped'] : [],
    }))

    candidates.push({
      candidateId: `split:mergeRemark:${sha12(approvalItemId + ':merge')}`,
      kind: 'mergeRemarkAssignment',
      confidence: 0.6,
      requiresManualConfirmation: true,
      source: baseSource,
      course: baseCourse,
      meta: baseMeta,
      assignments,
      warningCodes: ['low_confidence_merge_remark_pattern'],
      diagnosticCodes,
    })
  }

  // ── No pattern matched but multiple teachers ──
  if (
    candidates.length === 0 &&
    teacherParts.length >= 2 &&
    teacherParts.every((p) => !isPlaceholder(stripLeadingNumber(p)))
  ) {
    const classParts = splitByDelimiters(trim(classText))
    const assignments = teacherParts.map((t, idx) => {
      const teacher = stripLeadingNumber(t)
      const classes =
        classParts.length >= teacherParts.length
          ? [classParts[idx]!]
          : []
      return {
        assignmentId: `${sha12(approvalItemId + ':amb:' + idx)}`,
        teacherRaw: teacher,
        teacherNameHash: sha12(teacher),
        teacherId: null,
        teacherMatchStatus: 'missing' as const,
        classRaw: classes.join('、'),
        classNameHashes: classes.map((c) => sha12(c)),
        classGroupIds: [],
        classMatchStatus: classes.length > 0 ? 'missing' as const : 'unknown' as const,
        warningCodes:
          classParts.length === 0
            ? ['no_classes_mapped']
            : classParts.length < teacherParts.length
              ? ['class_count_mismatch']
              : [],
      }
    })

    candidates.push({
      candidateId: `split:ambiguous:${sha12(approvalItemId + ':amb')}`,
      kind: 'ambiguousMultiTeacherMultiClass',
      confidence: 0.4,
      requiresManualConfirmation: true,
      source: baseSource,
      course: baseCourse,
      meta: baseMeta,
      assignments,
      warningCodes: [
        'ambiguous_teacher_class_mapping',
        'requires_manual_confirmation',
      ],
      diagnosticCodes,
    })
  }

  const aggregateConfidence =
    candidates.length > 0
      ? Math.max(...candidates.map((c) => c.confidence))
      : 0

  return {
    hasSplitDetection: candidates.length > 0,
    candidates,
    aggregateConfidence,
  }
}