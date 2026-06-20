/**
 * L4 Dry-Run Mapper — Course Setting XLSX → TeachingTask candidates
 *
 * Stage: L4-XLSX-COURSE-SETTING-TEACHING-TASK-DRY-RUN-MAPPING
 *
 * Pure, in-memory mapper that turns the L2 `CourseSettingXlsxParseResult`
 * into candidate objects for the educational-administration model
 * (Course / Teacher / ClassGroup / TeachingTask / TeachingTaskClass) plus
 * diagnostics and a source-evidence forward-fill draft.
 *
 * Hard constraints (enforced + verified by verify-xlsx-course-setting-...-l4):
 *  - No Prisma, no DB writes, no filesystem writes, no API/UI coupling.
 *    The mapper holds NO Prisma client. Existing data is passed in as plain
 *    `CourseSettingExistingImportData` (hash-only refs) so the core mapper is
 *    testable with zero DB side effects.
 *  - Deterministic: same (parseResult, existingData, options) → identical result.
 *  - Sanitized OUTPUT: the returned result contains only hashes, ids, counts,
 *    classifications, diagnostic codes, confidences and source-row indices.
 *    It NEVER contains raw teacher / class / course / remark text. Raw parsed
 *    values MAY be read in memory (when the caller parsed with
 *    `includeRawValues: true`) for name construction + normalized matching,
 *    but they are never placed in the result. Committed docs/json are built
 *    from this result and therefore carry no raw sensitive content.
 *  - Dry-run only: `dryRunOnly: true`, `dbWritten: false` always.
 *
 * Diagnostic emission policy (each diagnostic emitted EXACTLY once):
 *  - Row-level diagnostics (one per affected row, sourceRowIndex set) cover:
 *    COURSE_MISSING, COURSE_AMBIGUOUS, TEACHER_BLANK,
 *    TEACHER_ASSIGNMENT_OTHER_REQUIRES_REVIEW, TEACHER_BANK_SPLIT_REQUIRES_REVIEW,
 *    TEACHER_MISSING, TEACHER_AMBIGUOUS, CLASS_COUNT_ONLY_REQUIRES_REVIEW,
 *    CLASS_COUNT_OTHER_REQUIRES_REVIEW, WEEKLY_HOURS_NON_NUMERIC, EXAM_TYPE_OTHER,
 *    MERGE_REMARK_AMBIGUOUS, LOW_CONFIDENCE_ROW, TASK_SPLIT_REQUIRED,
 *    TASK_CANDIDATE_SKIPPED, SOURCE_EVIDENCE_INCOMPLETE.
 *  - Link-level diagnostics (one per affected TeachingTaskClass link) cover:
 *    CLASS_GROUP_MISSING, CLASS_GROUP_AMBIGUOUS.
 *  - Candidate objects carry an empty `diagnostics` array; their `matchStatus`
 *    encodes the outcome. This keeps `diagnosticsSummary.byCode` free of
 *    double-counts (candidate-level vs row-level).
 *
 * Relationship to prior stages:
 *  - L1: read-only xlsx structural audit (no parser).
 *  - L2: pure xlsx parser → `CourseSettingXlsxParseResult`.
 *  - L3: preview-only API/UI over the L2 parser (no DB).
 *  - L4 (this): candidate mapping + diagnostics. Still no DB, no ImportBatch,
 *    no confirm/apply. L5+ will design the safe confirm flow.
 */

import { createHash } from 'node:crypto'
import type {
  CourseSettingSourceEvidenceDraft,
  CourseSettingXlsxParseResult,
  ParsedCourseSettingRow,
} from './course-setting-xlsx-parser'

// ---------------------------------------------------------------------------
// Stage constants
// ---------------------------------------------------------------------------

export const L4_STAGE =
  'L4-XLSX-COURSE-SETTING-TEACHING-TASK-DRY-RUN-MAPPING' as const
export const L4_MAPPER_VERSION = 'l4-mapper-v1' as const

// ---------------------------------------------------------------------------
// Existing-data refs (hash-only; loaded read-only by the verify script)
// ---------------------------------------------------------------------------

export type ExistingCourseRef = {
  id: number
  nameHash: string // sha256(trim(name)) — aligns with parser rawHash = sha256(trim(text))
  normalizedNameHash: string // sha256(normalizeForMatch(name))
}

export type ExistingTeacherRef = {
  id: number
  nameHash: string
  normalizedNameHash: string
}

export type ExistingClassGroupRef = {
  id: number
  nameHash: string
  normalizedNameHash: string
  studentCount?: number | null
}

export type ExistingTeachingTaskRef = {
  id: number
  courseId?: number | null
  teacherId?: number | null
}

export type ExistingTeachingTaskClassRef = {
  id: number
  teachingTaskId: number
  classGroupId: number
}

export type CourseSettingExistingImportData = {
  courses: ExistingCourseRef[]
  teachers: ExistingTeacherRef[]
  classGroups: ExistingClassGroupRef[]
  teachingTasks: ExistingTeachingTaskRef[]
  teachingTaskClasses: ExistingTeachingTaskClassRef[]
}

// ---------------------------------------------------------------------------
// Options + input
// ---------------------------------------------------------------------------

export type CourseSettingTeachingTaskDryRunOptions = {
  parserVersion?: string
  includeRawValues?: boolean // default false; docs/json/verify MUST be false; in-memory true allowed
  maxPreviewRows?: number // default 50
  confidenceThreshold?: number // default 0.8
}

export type CourseSettingTeachingTaskDryRunInput = {
  xlsxBuffer: Buffer | Uint8Array
  artifactFilename?: string
  existingData: CourseSettingExistingImportData
  options?: CourseSettingTeachingTaskDryRunOptions
}

// ---------------------------------------------------------------------------
// Diagnostic codes
// ---------------------------------------------------------------------------

export type DryRunDiagnosticSeverity = 'info' | 'warn' | 'error'

export type DryRunDiagnosticCode =
  | 'COURSE_MISSING'
  | 'COURSE_AMBIGUOUS'
  | 'TEACHER_MISSING'
  | 'TEACHER_AMBIGUOUS'
  | 'TEACHER_BLANK'
  | 'TEACHER_ASSIGNMENT_OTHER_REQUIRES_REVIEW'
  | 'TEACHER_BANK_SPLIT_REQUIRES_REVIEW'
  | 'CLASS_GROUP_MISSING'
  | 'CLASS_GROUP_AMBIGUOUS'
  | 'CLASS_COUNT_ONLY_REQUIRES_REVIEW'
  | 'CLASS_COUNT_OTHER_REQUIRES_REVIEW'
  | 'WEEKLY_HOURS_NON_NUMERIC'
  | 'EXAM_TYPE_OTHER'
  | 'MERGE_REMARK_AMBIGUOUS'
  | 'LOW_CONFIDENCE_ROW'
  | 'TASK_SPLIT_REQUIRED'
  | 'TASK_CANDIDATE_SKIPPED'
  | 'SOURCE_EVIDENCE_INCOMPLETE'

export type DryRunDiagnostic = {
  code: DryRunDiagnosticCode
  severity: DryRunDiagnosticSeverity
  sheetIndex?: number
  sourceRowIndex?: number
  candidateKey?: string
  // message never contains raw teacher/class/course/remark text.
  message: string
}

// ---------------------------------------------------------------------------
// Source evidence forward-fill draft (hash-only)
// ---------------------------------------------------------------------------

export type CourseSettingSourceEvidenceForwardFillDraft = {
  sourceArtifactFilenameHash?: string
  sourceSheetNameHash: string
  sourceRowIndex: number
  sourceMajorNameHash?: string
  sourceClassCountRawHash?: string
  sourceCourseNameHash?: string
  sourceTeacherRawHash?: string
  sourceRemarkHash?: string
  sourceMergeRemarkHash?: string
}

// ---------------------------------------------------------------------------
// Candidate objects (hash-only OUTPUT)
// ---------------------------------------------------------------------------

export type SourceRowRef = {
  sheetIndex: number
  sourceRowIndex: number
  sheetNameHash: string
}

export type CourseCandidate = {
  candidateKey: string
  courseNameHash: string
  normalizedCourseNameHash?: string
  matchStatus: 'exact' | 'missing' | 'ambiguous' | 'skipped'
  matchedCourseId?: number
  confidence: number
  diagnostics: DryRunDiagnostic[]
}

export type TeacherCandidate = {
  candidateKey: string
  teacherNameHash?: string
  scopeType?: 'class' | 'group' | 'section' | 'unknown'
  matchStatus: 'exact' | 'missing' | 'ambiguous' | 'blank' | 'skipped'
  matchedTeacherId?: number
  confidence: number
  diagnostics: DryRunDiagnostic[]
}

export type ClassGroupCandidate = {
  candidateKey: string
  classGroupHash?: string
  studentCount?: number
  matchStatus:
    | 'exact'
    | 'missing'
    | 'ambiguous'
    | 'countOnly'
    | 'unresolved'
    | 'skipped'
  matchedClassGroupId?: number
  confidence: number
  diagnostics: DryRunDiagnostic[]
}

export type TeachingTaskSplitPlan =
  | 'singleTask'
  | 'splitByTeacherScope'
  | 'splitByClassScope'
  | 'needsManualReview'
  | 'skipped'

export type TeachingTaskMatchStatus =
  | 'newCandidate'
  | 'possibleExisting'
  | 'ambiguousExisting'
  | 'needsManualReview'
  | 'skipped'

export type TeachingTaskCandidate = {
  candidateKey: string
  sourceRowRefs: SourceRowRef[]
  courseCandidateKey?: string
  teacherCandidateKeys: string[]
  classGroupCandidateKeys: string[]
  splitPlan: TeachingTaskSplitPlan
  matchStatus: TeachingTaskMatchStatus
  weeklyHours?: number
  weeklyHoursClassification?: string
  examType?: '试' | '查'
  examTypeClassification?: string
  confidence: number
  diagnostics: DryRunDiagnostic[]
}

export type TeachingTaskClassCandidate = {
  candidateKey: string
  teachingTaskCandidateKey: string
  classGroupCandidateKey: string
  sourceEvidenceDraft: CourseSettingSourceEvidenceForwardFillDraft
  matchStatus: 'newCandidate' | 'possibleExisting' | 'needsManualReview' | 'skipped'
  confidence: number
  diagnostics: DryRunDiagnostic[]
}

// ---------------------------------------------------------------------------
// Aggregate summaries
// ---------------------------------------------------------------------------

export type CourseSettingMatchSummary = {
  course: { exact: number; missing: number; ambiguous: number; skipped: number }
  teacher: {
    exact: number
    missing: number
    ambiguous: number
    blank: number
    skipped: number
  }
  classGroup: {
    exact: number
    missing: number
    ambiguous: number
    countOnly: number
    unresolved: number
    skipped: number
  }
  teachingTask: {
    newCandidate: number
    possibleExisting: number
    ambiguousExisting: number
    needsManualReview: number
    skipped: number
  }
  teachingTaskClass: {
    newCandidate: number
    possibleExisting: number
    needsManualReview: number
    skipped: number
  }
}

export type CourseSettingDiagnosticSummary = {
  total: number
  bySeverity: Record<DryRunDiagnosticSeverity, number>
  byCode: Record<string, number>
}

export type CourseSettingSourceEvidenceDryRunSummary = {
  totalCourseRows: number
  rowsWithSourceEvidenceDraft: number
  teachingTaskClassCandidatesWithSourceEvidence: number
  coveragePercent: number
  missingEvidenceCount: number
  hashStrategy: 'sha256-prefix-12'
}

export type CourseSettingTeachingTaskDryRunPreviewCandidate = {
  candidateKey: string
  sheetIndex: number
  sourceRowIndex: number
  courseMatchStatus: string
  teacherMatchStatuses: string[]
  classGroupMatchStatuses: string[]
  splitPlan: TeachingTaskSplitPlan
  taskMatchStatus: TeachingTaskMatchStatus
  weeklyHoursClassification?: string
  examTypeClassification?: string
  confidence: number
  diagnosticCodes: DryRunDiagnosticCode[]
}

// ---------------------------------------------------------------------------
// Top-level result
// ---------------------------------------------------------------------------

export type CourseSettingTeachingTaskDryRunResult = {
  stage: typeof L4_STAGE
  dryRunOnly: true
  dbWritten: false
  mapperVersion: string
  parser: {
    parserVersion: string
    totalCourseRows: number
  }
  existingDataSummary: {
    courseCount: number
    teacherCount: number
    classGroupCount: number
    teachingTaskCount: number
    teachingTaskClassCount: number
  }
  candidateSummary: {
    courseCandidates: number
    teacherCandidates: number
    classGroupCandidates: number
    teachingTaskCandidates: number
    teachingTaskClassCandidates: number
    rowsNeedingManualReview: number
    rowsSkipped: number
  }
  matchSummary: CourseSettingMatchSummary
  diagnosticsSummary: CourseSettingDiagnosticSummary
  previewCandidates: CourseSettingTeachingTaskDryRunPreviewCandidate[]
  sourceEvidenceSummary: CourseSettingSourceEvidenceDryRunSummary
}

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

const hash = (s: string, len = 12): string =>
  createHash('sha256').update(s, 'utf8').digest('hex').slice(0, len)

/**
 * Normalization used for the `normalizedNameHash` index on both sides
 * (existing DB refs AND parsed values). Removes all whitespace (incl.
 * fullwidth 　, newlines, tabs) and normalizes fullwidth parentheses
 * so structurally-equal names match regardless of formatting drift.
 * Exported so the read-only loader computes the SAME hash as the mapper.
 */
export const normalizeForMatch = (s: string): string =>
  s
    .replace(/\s+/g, '')
    .replace(/　/g, '')
    .replace(/（/g, '(')
    .replace(/）/g, ')')
    .trim()

type EntityMatch = {
  status: 'exact' | 'missing' | 'ambiguous'
  matchedId?: number
  matchedCount: number
}

/**
 * Match a parsed value against existing refs using two hash indexes:
 *  - nameHash (trim-exact): parsed rawHash (= hash(trim(rawText))) vs
 *    existing nameHash (= hash(trim(dbName))).
 *  - normalizedNameHash: hash(normalizeForMatch(rawText)) vs
 *    hash(normalizeForMatch(dbName)). Requires the raw text in memory.
 */
const matchEntity = (
  rawHash: string,
  normalizedText: string | undefined,
  byNameHash: Map<string, number[]>,
  byNormHash: Map<string, number[]>,
): EntityMatch => {
  const ids = new Set<number>()
  for (const id of byNameHash.get(rawHash) ?? []) ids.add(id)
  if (normalizedText !== undefined) {
    const nHash = hash(normalizeForMatch(normalizedText))
    for (const id of byNormHash.get(nHash) ?? []) ids.add(id)
  }
  if (ids.size === 0) return { status: 'missing', matchedCount: 0 }
  if (ids.size === 1) {
    const id = ids.values().next().value as number
    return { status: 'exact', matchedId: id, matchedCount: 1 }
  }
  return { status: 'ambiguous', matchedCount: ids.size }
}

const buildIndex = (
  refs: ReadonlyArray<{ id: number; nameHash: string; normalizedNameHash: string }>,
): { byName: Map<string, number[]>; byNorm: Map<string, number[]> } => {
  const byName = new Map<string, number[]>()
  const byNorm = new Map<string, number[]>()
  for (const r of refs) {
    pushTo(byName, r.nameHash, r.id)
    pushTo(byNorm, r.normalizedNameHash, r.id)
  }
  return { byName, byNorm }
}

const pushTo = (m: Map<string, number[]>, k: string, v: number): void => {
  const arr = m.get(k)
  if (arr) arr.push(v)
  else m.set(k, [v])
}

/** Read the raw `normalized` text of a ParsedTextValue (only present when
 *  the caller parsed with includeRawValues=true). Type-safe accessor. */
const rawTextOf = (v: { normalized?: string } | undefined): string | undefined =>
  v && typeof v.normalized === 'string' && v.normalized.length > 0
    ? v.normalized
    : undefined

/** remark/mergeRemark runtime classification is mirrored by `valueShape`
 *  (the parser sets both). valueShape is on the declared ParsedTextValue
 *  type, so no cast is needed. */
const mergeRemarkIsAmbiguous = (row: ParsedCourseSettingRow): boolean =>
  row.mergeRemark?.valueShape === 'ambiguous'

const evidenceToDraft = (
  e: CourseSettingSourceEvidenceDraft,
): CourseSettingSourceEvidenceForwardFillDraft => ({
  sourceArtifactFilenameHash: e.sourceArtifactFilename
    ? hash(e.sourceArtifactFilename)
    : undefined,
  sourceSheetNameHash: e.sourceSheetNameHash,
  sourceRowIndex: e.sourceRowIndex,
  sourceMajorNameHash: e.sourceMajorNameHash,
  sourceClassCountRawHash: e.sourceClassCountRawHash,
  sourceCourseNameHash: e.sourceCourseNameHash,
  sourceTeacherRawHash: e.sourceTeacherRawHash,
  sourceRemarkHash: e.sourceRemarkHash,
  sourceMergeRemarkHash: e.sourceMergeRemarkHash,
})

const isEvidenceComplete = (e: CourseSettingSourceEvidenceDraft): boolean =>
  Boolean(
    e.sourceSheetNameHash &&
      typeof e.sourceRowIndex === 'number' &&
      e.sourceCourseNameHash &&
      e.sourceMajorNameHash,
  )

const emptyMatchSummary = (): CourseSettingMatchSummary => ({
  course: { exact: 0, missing: 0, ambiguous: 0, skipped: 0 },
  teacher: { exact: 0, missing: 0, ambiguous: 0, blank: 0, skipped: 0 },
  classGroup: {
    exact: 0,
    missing: 0,
    ambiguous: 0,
    countOnly: 0,
    unresolved: 0,
    skipped: 0,
  },
  teachingTask: {
    newCandidate: 0,
    possibleExisting: 0,
    ambiguousExisting: 0,
    needsManualReview: 0,
    skipped: 0,
  },
  teachingTaskClass: {
    newCandidate: 0,
    possibleExisting: 0,
    needsManualReview: 0,
    skipped: 0,
  },
})

// ---------------------------------------------------------------------------
// Pure mapper
// ---------------------------------------------------------------------------

/**
 * Map parsed course-setting rows → TeachingTask candidates + diagnostics.
 * Pure: no Prisma, no fs, no side effects. Deterministic.
 *
 * Output is sanitized (hashes/ids/counts only). Raw parsed text is read in
 * memory only for name construction + normalized matching when present.
 */
export const mapParsedCourseSettingRowsToTeachingTaskCandidates = (
  parseResult: CourseSettingXlsxParseResult,
  existingData: CourseSettingExistingImportData,
  options: CourseSettingTeachingTaskDryRunOptions = {},
): CourseSettingTeachingTaskDryRunResult => {
  const confidenceThreshold = options.confidenceThreshold ?? 0.8
  const maxPreviewRows = options.maxPreviewRows ?? 50
  const parserVersion = options.parserVersion ?? parseResult.parserVersion

  // -- Existing-data indexes ---------------------------------------------
  const courseIdx = buildIndex(existingData.courses)
  const teacherIdx = buildIndex(existingData.teachers)
  const classGroupIdx = buildIndex(existingData.classGroups)
  const existingTaskCourseIds = new Set<number>()
  for (const t of existingData.teachingTasks) {
    if (typeof t.courseId === 'number') existingTaskCourseIds.add(t.courseId)
  }

  // -- Candidate accumulators (deduped by identity hash) -----------------
  const courseCandidates = new Map<string, CourseCandidate>()
  const teacherCandidates = new Map<string, TeacherCandidate>()
  const classGroupCandidates = new Map<string, ClassGroupCandidate>()
  const taskCandidates: TeachingTaskCandidate[] = []
  const taskClassCandidates: TeachingTaskClassCandidate[] = []
  const diagnostics: DryRunDiagnostic[] = []
  const matchSummary = emptyMatchSummary()

  let rowsNeedingManualReview = 0
  let rowsSkipped = 0

  // -- Iterate every row --------------------------------------------------
  for (const sheet of parseResult.sheets) {
    for (const row of sheet.rows) {
      if (row.rowKind !== 'course') {
        rowsSkipped += 1
        continue
      }

      const { sheetIndex, sourceRowIndex, sheetNameHash } = row
      const rowDiags: DryRunDiagnostic[] = []
      let rowNeedsManualReview = false

      const mk = (
        code: DryRunDiagnosticCode,
        severity: DryRunDiagnosticSeverity,
        message: string,
        candidateKey?: string,
      ): DryRunDiagnostic => ({
        code,
        severity,
        sheetIndex,
        sourceRowIndex,
        candidateKey,
        message,
      })

      // -- Course candidate (deduped by normalized course hash) ----------
      const courseRaw = row.courseName
      const courseRawHash = courseRaw?.rawHash ?? hash('')
      const courseNormText = rawTextOf(courseRaw)
      const courseNormHash = courseNormText
        ? hash(normalizeForMatch(courseNormText))
        : undefined
      const courseKey = `course:${courseNormHash ?? courseRawHash}`

      if (!courseCandidates.has(courseKey)) {
        const match = matchEntity(
          courseRawHash,
          courseNormText,
          courseIdx.byName,
          courseIdx.byNorm,
        )
        let status: CourseCandidate['matchStatus'] = 'missing'
        if (match.status === 'exact') {
          status = 'exact'
          matchSummary.course.exact += 1
        } else if (match.status === 'ambiguous') {
          status = 'ambiguous'
          matchSummary.course.ambiguous += 1
        } else {
          matchSummary.course.missing += 1
        }
        courseCandidates.set(courseKey, {
          candidateKey: courseKey,
          courseNameHash: courseRawHash,
          normalizedCourseNameHash: courseNormHash,
          matchStatus: status,
          matchedCourseId: match.matchedId,
          confidence: courseRaw?.confidence ?? 0,
          diagnostics: [],
        })
      }
      const courseCand = courseCandidates.get(courseKey)!
      if (courseCand.matchStatus === 'missing') {
        rowDiags.push(mk('COURSE_MISSING', 'warn', 'course not found in existing courses', courseKey))
        rowNeedsManualReview = true
      } else if (courseCand.matchStatus === 'ambiguous') {
        rowDiags.push(mk('COURSE_AMBIGUOUS', 'warn', 'course name matches multiple existing courses', courseKey))
        rowNeedsManualReview = true
      }

      // -- Teacher candidates (per assignment; deduped by teacherNameHash) -
      const ta = row.teacherAssignment
      const teacherCandidateKeys: string[] = []
      const teacherMatchStatuses: string[] = []
      if (ta) {
        if (ta.primaryClassification === 'blank') {
          rowDiags.push(mk('TEACHER_BLANK', 'info', 'teacher assignment is blank (business-empty candidate)', undefined))
          matchSummary.teacher.blank += 1
          teacherMatchStatuses.push('blank')
        } else if (ta.primaryClassification === 'other') {
          rowDiags.push(
            mk('TEACHER_ASSIGNMENT_OTHER_REQUIRES_REVIEW', 'warn', 'teacher assignment did not match a known pattern; manual review required', undefined),
          )
          teacherMatchStatuses.push('missing')
          rowNeedsManualReview = true
        } else {
          // single / numbered / bankSplit — resolve per-assignment teacher names.
          for (const a of ta.assignments) {
            const tNameHash = a.teacherNameHash
            const tRaw = a.teacherName // only present with includeRawValues=true
            if (!a.teacherName || tNameHash === hash('')) continue
            const tKey = `teacher:${tNameHash}`
            if (!teacherCandidates.has(tKey)) {
              const tMatch = matchEntity(tNameHash, tRaw, teacherIdx.byName, teacherIdx.byNorm)
              let tStatus: TeacherCandidate['matchStatus'] = 'missing'
              if (tMatch.status === 'exact') {
                tStatus = 'exact'
                matchSummary.teacher.exact += 1
              } else if (tMatch.status === 'ambiguous') {
                tStatus = 'ambiguous'
                matchSummary.teacher.ambiguous += 1
              } else {
                matchSummary.teacher.missing += 1
              }
              teacherCandidates.set(tKey, {
                candidateKey: tKey,
                teacherNameHash: tNameHash,
                scopeType: a.scopeType,
                matchStatus: tStatus,
                matchedTeacherId: tMatch.matchedId,
                confidence: a.confidence,
                diagnostics: [],
              })
            }
            const tc = teacherCandidates.get(tKey)!
            teacherCandidateKeys.push(tKey)
            teacherMatchStatuses.push(tc.matchStatus)
            // Per-row, per-assignment diagnostics (each row's task is affected).
            if (tc.matchStatus === 'missing') {
              rowDiags.push(mk('TEACHER_MISSING', 'warn', 'teacher not found in existing teachers', tKey))
              rowNeedsManualReview = true
            } else if (tc.matchStatus === 'ambiguous') {
              rowDiags.push(mk('TEACHER_AMBIGUOUS', 'warn', 'teacher name matches multiple existing teachers', tKey))
              rowNeedsManualReview = true
            }
          }
          if (ta.primaryClassification === 'bankSplit') {
            rowDiags.push(mk('TEACHER_BANK_SPLIT_REQUIRES_REVIEW', 'warn', 'bankSplit teacher assignment requires scope review', undefined))
            rowDiags.push(mk('TASK_SPLIT_REQUIRED', 'warn', 'multi-scope teacher assignment requires task split review', undefined))
            rowNeedsManualReview = true
          } else if (ta.primaryClassification === 'numbered') {
            rowDiags.push(mk('TASK_SPLIT_REQUIRED', 'warn', 'numbered-scope teacher assignment requires task split review', undefined))
            rowNeedsManualReview = true
          }
        }
      }

      // -- ClassGroup candidates (constructed name = gradeMajor + classLabel) --
      const cc = row.classCount
      const classGroupCandidateKeys: string[] = []
      const classGroupMatchStatuses: string[] = []
      const gradeMajorRaw = rawTextOf(row.gradeMajor)
      let classCountUnresolved = false
      let anyClassGroupMissingOrAmbiguous = false

      if (!cc) {
        classCountUnresolved = true
      } else if (cc.primaryClassification === 'blank') {
        classCountUnresolved = true
        rowDiags.push(mk('CLASS_COUNT_ONLY_REQUIRES_REVIEW', 'warn', 'class count is blank; no class group resolvable', undefined))
        rowNeedsManualReview = true
      } else if (cc.primaryClassification === 'countOnly') {
        classCountUnresolved = true
        rowDiags.push(mk('CLASS_COUNT_ONLY_REQUIRES_REVIEW', 'warn', 'class count has only a student count; class group not resolvable', undefined))
        matchSummary.classGroup.countOnly += 1
        classGroupMatchStatuses.push('countOnly')
        rowNeedsManualReview = true
      } else if (cc.primaryClassification === 'other') {
        classCountUnresolved = true
        rowDiags.push(mk('CLASS_COUNT_OTHER_REQUIRES_REVIEW', 'warn', 'class count did not match a known pattern; manual review required', undefined))
        matchSummary.classGroup.unresolved += 1
        classGroupMatchStatuses.push('unresolved')
        rowNeedsManualReview = true
      } else {
        // multiBan / multiSpaces / single — each parsedClassGroup has a classLabel.
        for (const pg of cc.parsedClassGroups) {
          const label = pg.classLabel
          if (!label || label === '(orphan-count)' || !gradeMajorRaw) continue
          const constructed = gradeMajorRaw.trim() + label
          const cgNormHash = hash(normalizeForMatch(constructed))
          const cgTrimHash = hash(constructed.trim())
          const cgKey = `classgroup:${cgNormHash}`
          if (!classGroupCandidates.has(cgKey)) {
            const cgMatch = matchEntity(cgTrimHash, constructed, classGroupIdx.byName, classGroupIdx.byNorm)
            let cgStatus: ClassGroupCandidate['matchStatus'] = 'missing'
            if (cgMatch.status === 'exact') {
              cgStatus = 'exact'
              matchSummary.classGroup.exact += 1
            } else if (cgMatch.status === 'ambiguous') {
              cgStatus = 'ambiguous'
              matchSummary.classGroup.ambiguous += 1
            } else {
              matchSummary.classGroup.missing += 1
            }
            classGroupCandidates.set(cgKey, {
              candidateKey: cgKey,
              classGroupHash: cgNormHash,
              studentCount: pg.studentCount,
              matchStatus: cgStatus,
              matchedClassGroupId: cgMatch.matchedId,
              confidence: pg.confidence,
              diagnostics: [],
            })
          }
          const cgc = classGroupCandidates.get(cgKey)!
          classGroupCandidateKeys.push(cgKey)
          classGroupMatchStatuses.push(cgc.matchStatus)
          if (cgc.matchStatus === 'missing' || cgc.matchStatus === 'ambiguous') {
            anyClassGroupMissingOrAmbiguous = true
          }
        }
      }
      if (anyClassGroupMissingOrAmbiguous) {
        rowNeedsManualReview = true
      }

      // -- Weekly hours / exam type / merge remark diagnostics ------------
      const wh = row.weeklyHours
      let weeklyHoursValue: number | undefined
      let weeklyHoursClassification: string | undefined
      if (wh) {
        weeklyHoursClassification = wh.classification
        if (wh.classification === 'nonNumeric') {
          rowDiags.push(mk('WEEKLY_HOURS_NON_NUMERIC', 'warn', 'weekly hours not numeric; candidate not apply-ready', undefined))
          rowNeedsManualReview = true
        } else if (wh.classification === 'numeric' || wh.classification === 'halfStep') {
          weeklyHoursValue = wh.value
        }
      }

      const ex = row.examType
      let examType: '试' | '查' | undefined
      let examTypeClassification: string | undefined
      if (ex) {
        examTypeClassification = ex.classification
        if (ex.classification === 'expected') {
          // 试/查 are public enum values (not PII) — safe to carry.
          examType = ex.normalized
        } else if (ex.classification === 'other') {
          rowDiags.push(mk('EXAM_TYPE_OTHER', 'warn', 'exam type not 试 or 查', undefined))
          rowNeedsManualReview = true
        }
      }

      if (mergeRemarkIsAmbiguous(row)) {
        rowDiags.push(mk('MERGE_REMARK_AMBIGUOUS', 'info', 'merge remark is non-empty with no class marker; manual review', undefined))
      }

      // -- Source evidence draft ------------------------------------------
      const evidence = row.sourceEvidence
      if (!isEvidenceComplete(evidence)) {
        rowDiags.push(mk('SOURCE_EVIDENCE_INCOMPLETE', 'info', 'source evidence draft missing required fields', undefined))
      }

      // -- Low confidence --------------------------------------------------
      if (row.confidence < confidenceThreshold) {
        rowDiags.push(mk('LOW_CONFIDENCE_ROW', 'warn', `row confidence below threshold (${row.confidence} < ${confidenceThreshold})`, undefined))
        rowNeedsManualReview = true
      }

      // -- Split plan ------------------------------------------------------
      let splitPlan: TeachingTaskSplitPlan
      if (wh?.classification === 'nonNumeric') {
        splitPlan = 'needsManualReview'
      } else if (classCountUnresolved) {
        splitPlan = 'needsManualReview'
      } else if (ta?.primaryClassification === 'other') {
        splitPlan = 'needsManualReview'
      } else if (
        ta?.primaryClassification === 'bankSplit' ||
        ta?.primaryClassification === 'numbered'
      ) {
        splitPlan = 'splitByTeacherScope'
      } else {
        splitPlan = 'singleTask'
      }

      // -- TeachingTask match status --------------------------------------
      // A row can be auto-applied only if every entity resolved to exactly one
      // existing ref (course/teacher/class all exact or legitimately blank) and
      // the row's structure is apply-ready. Otherwise it needs manual review.
      let taskStatus: TeachingTaskMatchStatus
      if (rowNeedsManualReview) {
        taskStatus = 'needsManualReview'
      } else if (
        courseCand.matchedCourseId !== undefined &&
        existingTaskCourseIds.has(courseCand.matchedCourseId)
      ) {
        taskStatus = 'possibleExisting'
      } else {
        taskStatus = 'newCandidate'
      }

      const taskKey = `task:${sheetIndex}:${sourceRowIndex}`
      const taskCand: TeachingTaskCandidate = {
        candidateKey: taskKey,
        sourceRowRefs: [{ sheetIndex, sourceRowIndex, sheetNameHash }],
        courseCandidateKey: courseKey,
        teacherCandidateKeys,
        classGroupCandidateKeys,
        splitPlan,
        matchStatus: taskStatus,
        weeklyHours: weeklyHoursValue,
        weeklyHoursClassification,
        examType,
        examTypeClassification,
        confidence: row.confidence,
        diagnostics: rowDiags,
      }
      taskCandidates.push(taskCand)
      matchSummary.teachingTask[taskStatus] += 1

      // -- TeachingTaskClass link candidates (resolved class groups only) --
      for (const cgKey of classGroupCandidateKeys) {
        const cgc = classGroupCandidates.get(cgKey)!
        const linkKey = `ttc:${taskKey}:${cgKey}`
        const linkDiags: DryRunDiagnostic[] = []
        let linkStatus: TeachingTaskClassCandidate['matchStatus'] = 'newCandidate'
        if (cgc.matchStatus === 'missing') {
          linkDiags.push({
            code: 'CLASS_GROUP_MISSING',
            severity: 'warn',
            sheetIndex,
            sourceRowIndex,
            candidateKey: linkKey,
            message: 'class group not found in existing class groups; new class group would be required',
          })
        } else if (cgc.matchStatus === 'ambiguous') {
          linkDiags.push({
            code: 'CLASS_GROUP_AMBIGUOUS',
            severity: 'warn',
            sheetIndex,
            sourceRowIndex,
            candidateKey: linkKey,
            message: 'class group name ambiguous in existing class groups',
          })
          linkStatus = 'needsManualReview'
        }
        const link: TeachingTaskClassCandidate = {
          candidateKey: linkKey,
          teachingTaskCandidateKey: taskKey,
          classGroupCandidateKey: cgKey,
          sourceEvidenceDraft: evidenceToDraft(evidence),
          matchStatus: linkStatus,
          confidence: Math.min(taskCand.confidence, cgc.confidence),
          diagnostics: linkDiags,
        }
        taskClassCandidates.push(link)
        matchSummary.teachingTaskClass[linkStatus] += 1
        for (const d of linkDiags) diagnostics.push(d)
      }

      // Flush row-level diagnostics into the global list (exactly once).
      for (const d of rowDiags) diagnostics.push(d)

      if (rowNeedsManualReview) rowsNeedingManualReview += 1
    }
  }

  // -- Diagnostics summary ------------------------------------------------
  const bySeverity: Record<DryRunDiagnosticSeverity, number> = {
    info: 0,
    warn: 0,
    error: 0,
  }
  const byCode: Record<string, number> = {}
  for (const d of diagnostics) {
    bySeverity[d.severity] += 1
    byCode[d.code] = (byCode[d.code] ?? 0) + 1
  }

  // -- Source evidence summary -------------------------------------------
  const totalCourseRows = parseResult.workbook.totalCourseRows
  let rowsWithEvidence = 0
  for (const sheet of parseResult.sheets) {
    for (const row of sheet.rows) {
      if (row.rowKind === 'course' && isEvidenceComplete(row.sourceEvidence)) {
        rowsWithEvidence += 1
      }
    }
  }
  const linksWithEvidence = taskClassCandidates.length // every link carries its row's draft

  // -- Preview candidates (capped, deterministic order) -------------------
  const previewCandidates: CourseSettingTeachingTaskDryRunPreviewCandidate[] = []
  for (const t of taskCandidates) {
    if (previewCandidates.length >= maxPreviewRows) break
    const courseCand = t.courseCandidateKey
      ? courseCandidates.get(t.courseCandidateKey)
      : undefined
    const teacherStatuses = t.teacherCandidateKeys.map(
      (k) => teacherCandidates.get(k)?.matchStatus ?? 'skipped',
    )
    const classStatuses = t.classGroupCandidateKeys.map(
      (k) => classGroupCandidates.get(k)?.matchStatus ?? 'skipped',
    )
    previewCandidates.push({
      candidateKey: t.candidateKey,
      sheetIndex: t.sourceRowRefs[0]?.sheetIndex ?? 0,
      sourceRowIndex: t.sourceRowRefs[0]?.sourceRowIndex ?? 0,
      courseMatchStatus: courseCand?.matchStatus ?? 'skipped',
      teacherMatchStatuses: teacherStatuses,
      classGroupMatchStatuses: classStatuses,
      splitPlan: t.splitPlan,
      taskMatchStatus: t.matchStatus,
      weeklyHoursClassification: t.weeklyHoursClassification,
      examTypeClassification: t.examTypeClassification,
      confidence: t.confidence,
      diagnosticCodes: t.diagnostics.map((d) => d.code),
    })
  }

  return {
    stage: L4_STAGE,
    dryRunOnly: true,
    dbWritten: false,
    mapperVersion: L4_MAPPER_VERSION,
    parser: {
      parserVersion,
      totalCourseRows,
    },
    existingDataSummary: {
      courseCount: existingData.courses.length,
      teacherCount: existingData.teachers.length,
      classGroupCount: existingData.classGroups.length,
      teachingTaskCount: existingData.teachingTasks.length,
      teachingTaskClassCount: existingData.teachingTaskClasses.length,
    },
    candidateSummary: {
      courseCandidates: courseCandidates.size,
      teacherCandidates: teacherCandidates.size,
      classGroupCandidates: classGroupCandidates.size,
      teachingTaskCandidates: taskCandidates.length,
      teachingTaskClassCandidates: taskClassCandidates.length,
      rowsNeedingManualReview,
      rowsSkipped,
    },
    matchSummary,
    diagnosticsSummary: {
      total: diagnostics.length,
      bySeverity,
      byCode,
    },
    previewCandidates,
    sourceEvidenceSummary: {
      totalCourseRows,
      rowsWithSourceEvidenceDraft: rowsWithEvidence,
      teachingTaskClassCandidatesWithSourceEvidence: linksWithEvidence,
      coveragePercent:
        totalCourseRows > 0
          ? Math.round((rowsWithEvidence / totalCourseRows) * 10000) / 100
          : 0,
      missingEvidenceCount: Math.max(0, totalCourseRows - rowsWithEvidence),
      hashStrategy: 'sha256-prefix-12',
    },
  }
}

// ---------------------------------------------------------------------------
// Async convenience wrapper (parses the xlsx buffer, then maps)
// ---------------------------------------------------------------------------

/**
 * Parse a course-setting xlsx buffer (in memory) and map it to TeachingTask
 * candidates. Uses `includeRawValues: true` IN MEMORY so the mapper can
 * construct class-group names and do normalized matching; the returned
 * result is sanitized (no raw text). No Prisma, no DB writes, no fs writes.
 *
 * `existingData` must be supplied by the caller (read-only loaded from DB).
 */
export const buildCourseSettingTeachingTaskDryRun = async (
  input: CourseSettingTeachingTaskDryRunInput,
): Promise<CourseSettingTeachingTaskDryRunResult> => {
  const { parseCourseSettingXlsx } = await import('./course-setting-xlsx-parser')
  const buf: Buffer = Buffer.isBuffer(input.xlsxBuffer)
    ? input.xlsxBuffer
    : Buffer.from(input.xlsxBuffer)
  // includeRawValues=true is IN-MEMORY ONLY. The mapper output never carries
  // raw text; committed docs/json are built from the sanitized result.
  const parseResult = await parseCourseSettingXlsx(buf, {
    artifactFilename: input.artifactFilename,
    parserVersion: input.options?.parserVersion,
    includeRawValues: true,
  })
  return mapParsedCourseSettingRowsToTeachingTaskCandidates(
    parseResult,
    input.existingData,
    input.options,
  )
}
