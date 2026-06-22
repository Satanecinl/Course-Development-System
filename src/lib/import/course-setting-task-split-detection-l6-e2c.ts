/**
 * L6-E2E — Course-Setting Real Task Split Detection (Pure, In-Memory)
 *
 * Stage: L6-E2E-XLSX-COURSE-SETTING-REAL-TASK-SPLIT-PARSING-FIX
 *
 * Detects real parenthesized teacher-class assignments like:
 *   杨秀芳(1,2)、王芳(3,4)、姜剑书(5,6)
 * and maps class number tokens to actual class names from classText.
 *
 * Hard constraints:
 *  - Pure, deterministic, no DB, no fs, no React, no API.
 *  - Never generates placeholder teachers (教师A/teacherA) or placeholder
 *    classes (班级1/class1). If a teacher or class can't be parsed from
 *    real raw text, the helper returns null or marks the row for manual
 *    review with explicit warningCodes.
 *  - No DB writes.
 */

import { createHash } from 'node:crypto'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type TaskSplitDetectionKind =
  | 'numberedTeacherAssignment'
  | 'teacherParenthesizedClassAssignment'
  | 'parenthesizedClassAssignment'
  | 'parallelTeacherClassList'
  | 'mergeRemarkAssignment'
  | 'ambiguousMultiTeacherMultiClass'
  | 'none'

export type TeacherMatchStatus = 'matched' | 'missing' | 'ambiguous' | 'unknown'
export type ClassMatchStatus = 'matched' | 'missing' | 'ambiguous' | 'unknown'

export type TeacherAssignmentSplitCandidate = {
  candidateId: string
  kind: TaskSplitDetectionKind
  confidence: number
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
    teacherMatchStatus: TeacherMatchStatus
    classRaw: string
    classNameHashes: string[]
    classGroupIds: number[]
    classMatchStatus: ClassMatchStatus
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
  /** Existing teachers in DB for match resolution. */
  existingTeachers?: Array<{ id: number; name: string }>
  /** Existing class groups (target semester scope). */
  existingClassGroups?: Array<{ id: number; name: string; semesterId?: number | null }>
}

export type DetectTaskSplitResult = {
  hasSplitDetection: boolean
  candidates: TeacherAssignmentSplitCandidate[]
  aggregateConfidence: number
}

// ---------------------------------------------------------------------------
// Pure helpers
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
 */
const splitByDelimiters = (text: string): string[] => {
  if (isBlank(text)) return []
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
 * Extract teacher name + class tokens from a single block like:
 *   张三(1班、2班) → ("张三", ["1班", "2班"])
 *   杨秀芳(1,2) → ("杨秀芳", ["1", "2"])
 *   王芳（3，4） → ("王芳", ["3", "4"])
 *   李四(1.2) → ("李四", ["1", "2"])   ← dot-separated class numbers
 * Returns null if no parentheses found.
 */
const extractParenthesizedTeacherClasses = (
  block: string,
): { teacher: string; classTokens: string[] } | null => {
  const m = block.match(/^(.+?)[（(]([^）)]+)[）)]\s*$/)
  if (!m) return null
  const teacher = stripLeadingNumber(m[1]!.trim())
  const tokensRaw = m[2]!.trim()
  if (isBlank(teacher) || isPlaceholder(teacher)) return null
  // Tokenize inner content. Split by , ， 、 ; ； and spaces.
  const tokens = tokensRaw
    .replace(/[、，,；;]/g, '|')
    .split('|')
    .map((t) => t.trim())
    .filter((t) => t.length > 0)
  if (tokens.length === 0) return null

  // L6-E2G1: further split dot-separated number pairs (e.g. "1.2" → ["1", "2"])
  // This handles xlsx scope labels like 杨秀芳(1.2) meaning "classes 1 and 2".
  // Only split when the token is purely "N.M" (two digit groups separated by a dot).
  const expanded: string[] = []
  for (const t of tokens) {
    const dotPair = t.match(/^(\d+)\.(\d+)$/)
    if (dotPair) {
      expanded.push(dotPair[1]!, dotPair[2]!)
    } else {
      expanded.push(t)
    }
  }

  return { teacher, classTokens: expanded }
}

/**
 * Match class tokens (e.g. ["1", "2"]) to real class names from classText.
 * Strategy:
 *   1. If the token already contains "班" or other class suffix → use as-is.
 *   2. Otherwise, look up "N班" in classText's split parts (exact match first,
 *      then prefix "N").
 *   3. If no match → keep raw token and mark classTokenUnmatched warning.
 */
const matchClassTokensToClasses = (
  tokens: string[],
  classText: string,
): { matched: string[]; unmatched: string[]; resolvedNames: string[] } => {
  if (isBlank(classText)) {
    return { matched: [], unmatched: [...tokens], resolvedNames: [] }
  }
  const classParts = splitByDelimiters(classText)
  const normalizedClassParts = classParts.map((c) => c.trim())
  const matched: string[] = []
  const unmatched: string[] = []
  const resolvedNames: string[] = []

  for (const token of tokens) {
    const tokenTrim = token.trim()
    if (isBlank(tokenTrim)) continue
    // 1. Token already has class suffix (班/group/级)
    if (/班|组|级|届|期/.test(tokenTrim)) {
      matched.push(tokenTrim)
      resolvedNames.push(tokenTrim)
      continue
    }
    // 2. Exact match in classText
    if (normalizedClassParts.includes(tokenTrim)) {
      matched.push(tokenTrim)
      resolvedNames.push(tokenTrim)
      continue
    }
    // 3. Try suffix 班
    const withBan = `${tokenTrim}班`
    if (normalizedClassParts.includes(withBan)) {
      matched.push(tokenTrim)
      resolvedNames.push(withBan)
      continue
    }
    // 4. Try other common suffixes
    let found = false
    for (const suffix of ['组', '级', '期']) {
      const candidate = `${tokenTrim}${suffix}`
      if (normalizedClassParts.includes(candidate)) {
        matched.push(tokenTrim)
        resolvedNames.push(candidate)
        found = true
        break
      }
    }
    if (found) continue
    // No match — keep raw token and mark warning
    unmatched.push(tokenTrim)
    resolvedNames.push(tokenTrim)
  }

  return { matched, unmatched, resolvedNames }
}

/**
 * L7-A: Parse K column task assignment format.
 * Format: "1,2:杨秀芳;3,4:王芳;5,6:姜剑书"
 * Each assignment: classNums:teacherName
 * Returns assignments in the same shape as detectParenthesizedTeacherClassAssignments
 * so they can be fed directly into buildParenthesizedCandidate.
 */
const parseTaskAssignmentColumnFormat = (
  taskAssignmentText: string,
  classText: string | null,
): Array<{ teacher: string; classTokens: string[]; resolvedClassNames: string[]; unmatched: string[] }> | null => {
  if (isBlank(taskAssignmentText)) return null;
  const parts = taskAssignmentText.split(/[;；]+/).map((s) => s.trim()).filter((s) => s.length > 0);
  if (parts.length < 2) return null;

  const classTextStr = trim(classText);
  const results: Array<{ teacher: string; classTokens: string[]; resolvedClassNames: string[]; unmatched: string[] }> = [];
  for (const part of parts) {
    const colonIdx = part.indexOf(':');
    if (colonIdx < 0) continue;
    const classNums = part.substring(0, colonIdx).trim();
    const teacherName = part.substring(colonIdx + 1).trim();
    if (isBlank(teacherName) || isPlaceholder(teacherName)) continue;

    // Parse class numbers: "1,2" → ["1", "2"], "1,2,5,6" → ["1", "2", "5", "6"]
    const classTokens = classNums.split(/[、，,]+/).map((s) => s.trim()).filter((s) => s.length > 0);
    if (classTokens.length === 0) continue;

    // Map class tokens to real class names from classText
    const mapping = matchClassTokensToClasses(classTokens, classTextStr);
    results.push({
      teacher: teacherName,
      classTokens,
      resolvedClassNames: mapping.resolvedNames,
      unmatched: mapping.unmatched,
    });
  }

  return results.length >= 2 ? results : null;
};

/**
 * Detect parenthesized teacher-class assignments like:
 *   杨秀芳(1,2)、王芳(3,4)、姜剑书(5,6)
 *   张三（1班、2班）；李四（3班、4班）
 * Returns null if input is empty / unparseable.
 */
export const detectParenthesizedTeacherClassAssignments = (
  teacherText: string,
  classText: string,
): Array<{ teacher: string; classTokens: string[] }> | null => {
  if (isBlank(teacherText)) return null
  // Split teacher blocks by common separators between blocks (NOT by comma,
  // because comma inside parentheses is intentional).
  // Use 、；/ and whitespace as block separators; comma only outside parentheses.
  const blocks: string[] = []
  let current = ''
  let depth = 0
  for (let i = 0; i < teacherText.length; i++) {
    const ch = teacherText[i]!
    if (ch === '(' || ch === '（') {
      depth += 1
      current += ch
    } else if (ch === ')' || ch === '）') {
      depth = Math.max(0, depth - 1)
      current += ch
    } else if (depth === 0 && /[、；;／/]/.test(ch)) {
      if (current.trim().length > 0) blocks.push(current.trim())
      current = ''
    } else if (depth === 0 && /\s/.test(ch)) {
      if (current.trim().length > 0) blocks.push(current.trim())
      current = ''
    } else {
      current += ch
    }
  }
  if (current.trim().length > 0) blocks.push(current.trim())

  // Dedupe and filter to blocks that look like parenthesized teacher-class
  const results: Array<{ teacher: string; classTokens: string[] }> = []
  const seenTeachers = new Set<string>()
  for (const block of blocks) {
    const extracted = extractParenthesizedTeacherClasses(block)
    if (!extracted) continue
    // Filter placeholder teachers
    if (isPlaceholder(extracted.teacher)) continue
    // Filter empty token lists
    if (extracted.classTokens.length === 0) continue
    // Filter teachers that are too short (likely noise)
    if (extracted.teacher.length < 2) continue
    // Reject duplicates (same teacher name twice)
    if (seenTeachers.has(extracted.teacher)) continue
    seenTeachers.add(extracted.teacher)
    results.push(extracted)
  }

  // Map class tokens to real class names
  const finalAssignments: Array<{ teacher: string; classTokens: string[]; resolvedClassNames: string[]; unmatched: string[] }> = []
  for (const a of results) {
    const mapping = matchClassTokensToClasses(a.classTokens, classText)
    finalAssignments.push({
      teacher: a.teacher,
      classTokens: a.classTokens,
      resolvedClassNames: mapping.resolvedNames,
      unmatched: mapping.unmatched,
    })
  }

  return finalAssignments.length >= 2 ? finalAssignments : null
}

/**
 * Build a TeacherAssignmentSplitCandidate from parenthesized assignments.
 * Returns null if not enough data to build.
 */
export const buildParenthesizedCandidate = (input: {
  approvalItemId: string
  sheetName: string | null
  sheetIndex: number
  sourceRowIndex: number
  majorName: string | null
  majorNameHash: string | null
  courseName: string | null
  weeklyHours: number | null
  weeklyHoursText: string | null
  examType: string | null
  examTypeText: string | null
  diagnosticCodes: string[]
  assignments: Array<{ teacher: string; classTokens: string[]; resolvedClassNames: string[]; unmatched: string[] }>
  existingTeachers?: Array<{ id: number; name: string }>
  existingClassGroups?: Array<{ id: number; name: string; semesterId?: number | null }>
}): TeacherAssignmentSplitCandidate => {
  const baseTeacherMatch = (name: string): { id: number | null; status: TeacherMatchStatus } => {
    if (!input.existingTeachers) return { id: null, status: 'unknown' }
    const norm = name.trim()
    const exact = input.existingTeachers.filter((t) => t.name.trim() === norm)
    if (exact.length === 1) return { id: exact[0]!.id, status: 'matched' }
    if (exact.length > 1) return { id: null, status: 'ambiguous' }
    return { id: null, status: 'missing' }
  }
  const baseClassMatch = (className: string): { ids: number[]; status: ClassMatchStatus } => {
    if (!input.existingClassGroups) return { ids: [], status: 'unknown' }
    const norm = className.trim()
    const exact = input.existingClassGroups.filter((cg) => cg.name.trim() === norm)
    if (exact.length >= 1) return { ids: exact.map((cg) => cg.id), status: 'matched' }
    return { ids: [], status: 'missing' }
  }

  let allTeachersMatched = true
  let allClassesMatched = true
  const assignments = input.assignments.map((a, idx) => {
    const teacherMatch = baseTeacherMatch(a.teacher)
    if (teacherMatch.status !== 'matched') allTeachersMatched = false
    // Per-class match aggregation
    const classGroupIds: number[] = []
    const classWarnings: string[] = []
    let classMatchedCount = 0
    for (const cls of a.resolvedClassNames) {
      const m = baseClassMatch(cls)
      if (m.status === 'matched' && m.ids.length > 0) {
        classGroupIds.push(...m.ids)
        classMatchedCount += 1
      }
    }
    if (a.unmatched.length > 0) classWarnings.push('classTokenUnmatched')
    if (classMatchedCount < a.resolvedClassNames.length && a.resolvedClassNames.length > 0) {
      allClassesMatched = false
    }
    const classMatchStatus: ClassMatchStatus =
      a.resolvedClassNames.length === 0
        ? 'unknown'
        : classMatchedCount === a.resolvedClassNames.length
          ? 'matched'
          : classMatchedCount > 0
            ? 'ambiguous'
            : 'missing'
    const teacherWarnings: string[] = []
    if (teacherMatch.status === 'ambiguous') teacherWarnings.push('teacherAmbiguous')
    if (teacherMatch.status === 'missing') teacherWarnings.push('teacherNotInDb')

    return {
      assignmentId: `${sha12(input.approvalItemId + ':paren:' + idx)}`,
      teacherRaw: a.teacher,
      teacherNameHash: sha12(a.teacher),
      teacherId: teacherMatch.id,
      teacherMatchStatus: teacherMatch.status,
      classRaw: a.resolvedClassNames.join('、'),
      classNameHashes: a.resolvedClassNames.map((c) => sha12(c)),
      classGroupIds,
      classMatchStatus,
      warningCodes: [...teacherWarnings, ...classWarnings],
    }
  })

  const candidateWarnings: string[] = []
  if (!allTeachersMatched) candidateWarnings.push('teacherMatchIncomplete')
  if (!allClassesMatched) candidateWarnings.push('classMatchIncomplete')
  const hasUnmatchedTokens = assignments.some((a) => a.warningCodes.includes('classTokenUnmatched'))
  if (hasUnmatchedTokens) candidateWarnings.push('classTokenUnmatched')

  // Confidence: high if all matched, lower if matches incomplete
  let confidence = 0.95
  if (!allTeachersMatched) confidence -= 0.1
  if (!allClassesMatched) confidence -= 0.1
  if (hasUnmatchedTokens) confidence -= 0.15

  return {
    candidateId: `split:teacherParenthesized:${sha12(input.approvalItemId + ':par')}`,
    kind: 'teacherParenthesizedClassAssignment',
    confidence: Math.max(0.4, confidence),
    requiresManualConfirmation: true,
    source: {
      approvalItemId: input.approvalItemId,
      sheetName: input.sheetName,
      sheetIndex: input.sheetIndex,
      sourceRowIndex: input.sourceRowIndex,
      majorName: input.majorName,
      majorNameHash: input.majorNameHash,
    },
    course: {
      rawName: input.courseName,
      normalizedName: input.courseName,
      courseId: null,
    },
    meta: {
      weeklyHours: input.weeklyHours,
      weeklyHoursText: input.weeklyHoursText,
      examType: input.examType ?? null,
      examTypeText: input.examTypeText,
    },
    assignments,
    warningCodes: candidateWarnings,
    diagnosticCodes: input.diagnosticCodes,
  }
}

// ---------------------------------------------------------------------------
// Legacy detection functions (kept for backwards compat with other patterns)
// ---------------------------------------------------------------------------

const detectNumberedAssignments = (teacherText: string): string[] | null => {
  if (isBlank(teacherText)) return null
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
  const stripped = parts.map(stripLeadingNumber).filter((s) => s.length > 0 && !isPlaceholder(s))
  return stripped.length >= 2 ? stripped : null
}

const detectParallelAssignments = (
  teacherText: string,
  classText: string,
): Array<{ teacher: string; classes: string[] }> | null => {
  const teachers = splitByDelimiters(teacherText).filter((t) => !isPlaceholder(stripLeadingNumber(t)))
  const classes = splitByDelimiters(classText)
  if (teachers.length < 2 || classes.length < 2) return null
  if (teachers.length !== classes.length) return null
  return teachers.map((t, i) => ({
    teacher: stripLeadingNumber(t),
    classes: [classes[i]!],
  }))
}

const detectMergeRemarkAssignment = (
  remark: string | null,
  mergeRemark: string | null,
): Array<{ teacher: string; classes: string[] }> | null => {
  const combined = trim(remark) + ' ' + trim(mergeRemark)
  if (isBlank(combined.trim())) return null
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
 *
 * L6-E2E: real parenthesized parsing (teacherParenthesizedClassAssignment) is
 * tried FIRST since it's the most common pattern. Falls back to numbered /
 * parallel / mergeRemark patterns.
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
  } = input

  const tText = trim(teacherText)
  if (isBlank(tText) || isPlaceholder(tText)) {
    return { hasSplitDetection: false, candidates: [], aggregateConfidence: 0 }
  }

  const candidates: TeacherAssignmentSplitCandidate[] = []

  const baseMeta = {
    weeklyHours,
    weeklyHoursText,
    examType: examType ?? null,
    examTypeText,
  }

  // ── Pattern 0a: K column task assignment format (L7-A PRIMARY) ──
  // Format: "1,2:杨秀芳;3,4:王芳;5,6:姜剑书"
  // This is the primary source for new A:M template rows.
  const colonPattern = /^[^:]+:[^:]+(?:;[^:]+:[^:]+)*$/;
  if (colonPattern.test(tText)) {
    const kColumnAssignments = parseTaskAssignmentColumnFormat(tText, trim(classText));
    if (kColumnAssignments && kColumnAssignments.length >= 2) {
      const candidate = buildParenthesizedCandidate({
        approvalItemId,
        sheetName,
        sheetIndex,
        sourceRowIndex,
        majorName,
        majorNameHash,
        courseName,
        weeklyHours,
        weeklyHoursText,
        examType,
        examTypeText,
        diagnosticCodes,
        assignments: kColumnAssignments,
        existingTeachers: input.existingTeachers,
        existingClassGroups: input.existingClassGroups,
      });
      candidates.push(candidate);
      const aggregateConfidence = Math.max(...candidates.map((c) => c.confidence));
      return { hasSplitDetection: true, candidates, aggregateConfidence };
    }
  }

  // ── Pattern 0b: Real parenthesized teacher-class (L6-E2E PRIMARY) ──
  const parenthesized = detectParenthesizedTeacherClassAssignments(tText, trim(classText))
  if (parenthesized && parenthesized.length >= 2) {
    const candidate = buildParenthesizedCandidate({
      approvalItemId,
      sheetName,
      sheetIndex,
      sourceRowIndex,
      majorName,
      majorNameHash,
      courseName,
      weeklyHours,
      weeklyHoursText,
      examType,
      examTypeText,
      diagnosticCodes,
      assignments: parenthesized as Array<{ teacher: string; classTokens: string[]; resolvedClassNames: string[]; unmatched: string[] }>,
      existingTeachers: input.existingTeachers,
      existingClassGroups: input.existingClassGroups,
    })
    candidates.push(candidate)
    // When parenthesized pattern matches, skip numbered pattern (it's the same data)
    const aggregateConfidence = Math.max(...candidates.map((c) => c.confidence))
    return { hasSplitDetection: true, candidates, aggregateConfidence }
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
      source: {
        approvalItemId,
        sheetName,
        sheetIndex,
        sourceRowIndex,
        majorName,
        majorNameHash,
      },
      course: {
        rawName: courseName,
        normalizedName: courseName,
        courseId: null,
      },
      meta: baseMeta,
      assignments,
      warningCodes:
        classParts.length < numbered.length
          ? ['class_count_lower_than_teacher_count']
          : [],
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
      source: {
        approvalItemId,
        sheetName,
        sheetIndex,
        sourceRowIndex,
        majorName,
        majorNameHash,
      },
      course: {
        rawName: courseName,
        normalizedName: courseName,
        courseId: null,
      },
      meta: baseMeta,
      assignments,
      warningCodes: [],
      diagnosticCodes,
    })
  }

  // ── Pattern 4: Merge remark assignment ──
  const mergeRemarkDetected = detectMergeRemarkAssignment(remark, mergeRemark)
  if (mergeRemarkDetected && !numbered && !parallel) {
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
      source: {
        approvalItemId,
        sheetName,
        sheetIndex,
        sourceRowIndex,
        majorName,
        majorNameHash,
      },
      course: {
        rawName: courseName,
        normalizedName: courseName,
        courseId: null,
      },
      meta: baseMeta,
      assignments,
      warningCodes: ['low_confidence_merge_remark_pattern'],
      diagnosticCodes,
    })
  }

  // ── No pattern matched but multiple teachers ──
  const teacherParts = splitByDelimiters(tText).filter((p) => !isPlaceholder(stripLeadingNumber(p)))
  if (candidates.length === 0 && teacherParts.length >= 2) {
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
      source: {
        approvalItemId,
        sheetName,
        sheetIndex,
        sourceRowIndex,
        majorName,
        majorNameHash,
      },
      course: {
        rawName: courseName,
        normalizedName: courseName,
        courseId: null,
      },
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