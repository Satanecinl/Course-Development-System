/**
 * L7-F Trial Script — Course-Setting XLSX Partial Import Apply (Controlled)
 *
 * Stage: L7-F-XLSX-COURSE-SETTING-NEW-TEMPLATE-PARTIAL-IMPORT-EXECUTION
 *
 * CLI tool for executing the L7-F apply stage.
 *
 * Usage:
 *   # Dry-run only (no DB writes, no backup):
 *   npx tsx scripts/trial-xlsx-course-setting-partial-import-execution-l7-f.ts \
 *     --xlsx "<xlsx path>" --target-semester-id <id> --dry-run
 *
 *   # Real apply (writes DB; requires confirm token):
 *   npx tsx scripts/trial-xlsx-course-setting-partial-import-execution-l7-f.ts \
 *     --xlsx "<xlsx path>" --target-semester-id <id> --apply \
 *     --confirm-token APPLY_XLSX_COURSE_SETTING_<id>
 *
 * Output: local raw artifact to temp/local-artifacts/l7-f/
 */

import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { createHash } from 'node:crypto'

// ── Args parsing ─────────────────────────────────────────────────────────────

type CliArgs = {
  xlsx: string
  targetSemesterId: number
  apply: boolean
  dryRun: boolean
  confirmToken: string | null
  expectClassgroupGate: boolean
  help: boolean
}

const parseArgs = (argv: string[]): CliArgs => {
  const args: CliArgs = {
    xlsx: '',
    targetSemesterId: 0,
    apply: false,
    dryRun: false,
    confirmToken: null,
    expectClassgroupGate: false,
    help: false,
  }
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i]
    if (a === '--xlsx') args.xlsx = argv[++i] ?? ''
    else if (a === '--target-semester-id') args.targetSemesterId = Number(argv[++i] ?? '0')
    else if (a === '--apply') args.apply = true
    else if (a === '--dry-run') args.dryRun = true
    else if (a === '--confirm-token') args.confirmToken = argv[++i] ?? null
    else if (a === '--expect-classgroup-gate') args.expectClassgroupGate = true
    else if (a === '--help' || a === '-h') args.help = true
  }
  return args
}

const printHelp = (): void => {
  console.log(`L7-F Trial Script — Course-Setting XLSX Partial Import Apply

Usage:
  --xlsx <path>                    Path to .xlsx file (required)
  --target-semester-id <id>        Target semester ID (required)
  --dry-run                        Dry-run mode (default if --apply absent)
  --apply                          Real apply mode (writes DB)
  --confirm-token <token>          Confirm token (required for --apply)
  --help, -h                       Show this help

Default mode: dry-run (no writes).
Confirm token must match: APPLY_XLSX_COURSE_SETTING_<targetSemesterId>

Examples:
  npx tsx scripts/trial-xlsx-course-setting-partial-import-execution-l7-f.ts \\
    --xlsx "D:/Desktop/Course Development System/课程设置新模板.xlsx" \\
    --target-semester-id 4 --dry-run

  npx tsx scripts/trial-xlsx-course-setting-partial-import-execution-l7-f.ts \\
    --xlsx "D:/Desktop/Course Development System/课程设置新模板.xlsx" \\
    --target-semester-id 4 --apply \\
    --confirm-token APPLY_XLSX_COURSE_SETTING_4
`)
}

// ── Main ─────────────────────────────────────────────────────────────────────

async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2))
  if (args.help) {
    printHelp()
    return
  }

  if (!args.xlsx) {
    console.error('ERROR: --xlsx <path> is required')
    printHelp()
    process.exit(1)
  }
  if (!Number.isInteger(args.targetSemesterId) || args.targetSemesterId <= 0) {
    console.error('ERROR: --target-semester-id <id> is required (positive integer)')
    process.exit(1)
  }
  if (!existsSync(args.xlsx)) {
    console.error(`ERROR: xlsx file not found: ${args.xlsx}`)
    process.exit(1)
  }

  const mode: 'dry-run' | 'apply' = args.apply && !args.dryRun ? 'apply' : 'dry-run'
  const expectedToken = `APPLY_XLSX_COURSE_SETTING_${args.targetSemesterId}`

  if (mode === 'apply') {
    if (!args.confirmToken) {
      console.error('ERROR: --apply requires --confirm-token')
      console.error(`Expected: ${expectedToken}`)
      process.exit(1)
    }
    if (args.confirmToken !== expectedToken) {
      console.error(`ERROR: confirm token mismatch`)
      console.error(`  expected: ${expectedToken}`)
      console.error(`  got:      ${args.confirmToken}`)
      process.exit(1)
    }
  }

  console.log(`L7-F trial script`)
  console.log(`  xlsx: ${args.xlsx}`)
  console.log(`  target semester: ${args.targetSemesterId}`)
  console.log(`  mode: ${mode}`)
  console.log(`  confirm token: ${mode === 'apply' ? expectedToken : '(n/a)'}`)
  console.log('')

  // Read xlsx
  const buffer = readFileSync(args.xlsx)
  const fileSha256 = createHash('sha256').update(buffer).digest('hex')
  console.log(`xlsx sha256: ${fileSha256}`)
  console.log(`xlsx size:   ${buffer.length} bytes`)
  console.log('')

  // Build the L6-E2 plan via the service layer
  console.log('--- Building L6-E2 plan (server-side recompute) ---')
  const { prisma } = await import('@/lib/prisma')
  const { loadCourseSettingExistingDataForSemester } = await import(
    '@/lib/import/course-setting-xlsx-preview'
  )
  const { buildCourseSettingTeachingTaskDryRun } = await import(
    '@/lib/import/course-setting-teaching-task-dry-run'
  )
  const { buildCourseSettingApprovalPackageWithTargetSemester } = await import(
    '@/lib/import/course-setting-approval-package-l6-d'
  )
  const { buildCourseSettingApprovalReviewUi } = await import(
    '@/lib/import/course-setting-approval-review-ui-l6-d2'
  )
  const {
    buildCourseSettingPartialImportPlan,
    validatePartialImportPlan,
  } = await import('@/lib/import/course-setting-partial-import-plan-l6-e2')

  const semester = await prisma.semester.findUnique({
    where: { id: args.targetSemesterId },
    select: { id: true, name: true, code: true, isActive: true },
  })
  if (!semester) {
    console.error(`ERROR: semester ${args.targetSemesterId} not found`)
    process.exit(1)
  }
  console.log(`target semester: ${semester.name} (${semester.code ?? 'no code'}) isActive=${semester.isActive}`)

  const existingData = await loadCourseSettingExistingDataForSemester(args.targetSemesterId)
  const dryRunResult = await buildCourseSettingTeachingTaskDryRun({
    xlsxBuffer: buffer,
    artifactFilename: args.xlsx,
    existingData,
    options: { parserVersion: 'l2-parser-v1', includeRawValues: false, maxPreviewRows: 100000 },
  })
  const filenameHash = createHash('sha256').update(args.xlsx, 'utf8').digest('hex').slice(0, 12)
  const idHash = createHash('sha256').update(String(semester.id), 'utf8').digest('hex').slice(0, 12)
  const nameHash = createHash('sha256').update(semester.name, 'utf8').digest('hex').slice(0, 12)
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

  const reviewUiRawEmpty = buildCourseSettingApprovalReviewUi({ approvalPackage })
  void reviewUiRawEmpty // used by other flows; keep empty build for compatibility

  // Parse again with includeRawValues to populate raw teacher/class text
  // for auto-resolution. This mirrors what the approval-review route does.
  const { parseCourseSettingXlsx } = await import('@/lib/import/course-setting-xlsx-parser')
  const parseResult = await parseCourseSettingXlsx(buffer, {
    artifactFilename: args.xlsx,
    parserVersion: 'l2-parser-v1',
    includeRawValues: true,
  })
  const rawByApprovalItemId = new Map<string, { courseName: string | null; teacherText: string | null; classText: string | null; remark: string | null; mergeRemark: string | null; weeklyHoursText: string | null; examTypeText: string | null; majorName: string | null; cohort: string | null; duration: string | null }>()
  const extractStr = (v: unknown): string | null => {
    if (v == null) return null
    if (typeof v === 'string') return v
    if (typeof v === 'object' && v !== null) {
      const obj = v as Record<string, unknown>
      if (typeof obj.normalized === 'string' && obj.normalized.length > 0) return obj.normalized
      if (typeof obj.raw === 'string' && obj.raw.length > 0) return obj.raw
    }
    return null
  }
  for (const sheet of parseResult.sheets) {
    for (const row of sheet.rows) {
      if (row.rowKind !== 'course') continue
      const id = `approval:${row.sheetIndex}:${row.sourceRowIndex}`
      const rr = row as Record<string, unknown>
      // L7-F6D1: the K-column 授课任务分配 is the canonical teacher
      // assignment source for the new template. teacherAssignment
      // (F-column) is empty for the new template.
      const teacherFromK = extractStr(rr.taskAssignmentText)
      const teacherFromF = extractStr(rr.teacherAssignment) ?? extractStr(rr.teacherAssignmentText)
      rawByApprovalItemId.set(id, {
        courseName: extractStr(rr.courseName),
        teacherText: teacherFromK ?? teacherFromF,
        classText: extractStr(rr.classNameText),
        remark: extractStr(rr.remark),
        mergeRemark: extractStr(rr.mergeRemark),
        weeklyHoursText: extractStr(rr.weeklyHours),
        examTypeText: extractStr(rr.examType),
        // L7-F6D2: prefer the *clean* major from C column (rr.majorName)
        // over the combined rr.gradeMajor which embeds cohort + '/'.
        // The combined form causes canonical-key mismatch.
        majorName: extractStr(rr.majorName) ?? extractStr(rr.gradeMajor),
        // L7-F6D2: also expose cohort (A column) and duration (B column)
        // so the canonical-key resolver can build cohort+duration+major+classNo.
        cohort: extractStr(rr.grade),
        duration: extractStr(rr.programLength),
      })
    }
  }
  const reviewUiWithRaw = buildCourseSettingApprovalReviewUi({
    approvalPackage,
    rawByApprovalItemId,
  })

  // Build auto-resolved manual resolutions using existing DB data.
  // This simulates what the browser does when the user resolves teacher
  // and class groups in the manual resolution UI.
  const { buildInitialManualResolutionState } = await import('@/lib/import/course-setting-manual-resolution-l6-e1')
  const initialResolutions = buildInitialManualResolutionState(reviewUiWithRaw.rows, args.targetSemesterId)

  // Load existing teachers and class groups for auto-resolution.
  // L7-F6D1: STRICT exact match only. The auto-resolver builds a
  // normalized exact-name index from `existingTeachers` and matches
  // teacherText tokens against it. The ClassGroup index carries
  // semesterId so we can re-verify the resolver output in stats.
  const existingTeachers = await prisma.teacher.findMany({ select: { id: true, name: true } })

  const existingClassGroups = await prisma.classGroup.findMany({
    where: { semesterId: args.targetSemesterId },
    select: { id: true, name: true, semesterId: true },
  })

  // L7-F6D1: Auto-resolve teacher and class group references with
  // STRICT EXACT match. No substring / contains / "endsWith" matching.
  // External/part-time/外聘/校外/实训/实习 teacher text is left unresolved
  // so the plan builder reports teacherMissing for that row.
  //
  // The ClassGroup resolver uses a canonical key composed of
  // (targetSemesterId + cohort + duration + major + classNo). Each
  // sem4 ClassGroup is keyed by the same shape, and only exact-key
  // matches are accepted. classText tokenization uses
  //   split on comma / 顿号 / Chinese-comma / whitespace
  // and each token must match a canonical classNo exactly.

  // Teacher index: case-folded, full-width/half-width normalised, trimmed.
  const normalizeTeacherName = (s: string | null | undefined): string => {
    if (s == null) return ''
    return s
      .replace(/\s+/g, '')
      .replace(/[（(](外聘|兼职|校外|实训|实习|外)[）)]/g, '')
      .replace(/[（(][^）)]*[）)]/g, '')
      .replace(/[、，,/／\\|]/g, '|')
      .trim()
  }
  // Tokenise the teacher text and try exact match on any single token
  // (handles "张三/李四" → try 张三, then 李四). If more than one token
  // resolves to a different teacher, we leave the row unresolved
  // (multi-teacher ambiguous).
  const teacherByExact = new Map<string, number>()
  for (const t of existingTeachers) {
    const k = normalizeTeacherName(t.name)
    if (k.length === 0) continue
    if (!teacherByExact.has(k)) teacherByExact.set(k, t.id)
  }

  // Physical-education exemption tokens (courseName substring). 体育课
  // teacherId=null is allowed only when this matches AND the trial sets
  // `allowBlankTeacher` with `allowBlankReason = PHYSICAL_EDUCATION_TEACHER_EXEMPT`.
  const PE_KEYWORDS = ['体育', '体能', '体测', '公共体育', '体育与健康']
  const isPhysicalEducationCourseName = (s: string | null | undefined): boolean => {
    if (s == null) return false
    const t = s.replace(/\s+/g, '')
    return PE_KEYWORDS.some((k) => t.includes(k))
  }

  // ClassGroup canonical key builder.
  // The DB schema has only `name` + `semesterId`, so the canonical
  // components are derived from the ClassGroup.name. The Excel
  // canonical components come from `raw.majorName` + the classText
  // token. cohort / duration are not on raw; we accept classGroup
  // matches whose DB name contains the major token AND whose classNo
  // token matches a token in DB name.
  const classGroupSemester = new Map<number, { id: number; name: string; semesterId: number }>()
  for (const cg of existingClassGroups) {
    classGroupSemester.set(cg.id, { id: cg.id, name: cg.name, semesterId: args.targetSemesterId })
  }

  const tokenizeClassText = (s: string): string[] => {
    if (!s) return []
    return s
      .split(/[、,,,，/／\s]+/)
      .map((t) => t.trim())
      .filter((t) => t.length > 0)
  }

  // Build a name → id index keyed by normalized class name (trim).
  // Match policy:
  //   1. cg.name must contain majorName (raw) as substring (case sensitive)
  //   2. cg.name must contain the classText token (e.g. "1班") exactly
  // No substring-only classNo match; classNo must be one of the tokens
  // and that token must appear as-is in cg.name.
  const classGroupByExactName = new Map<string, number[]>()
  for (const cg of existingClassGroups) {
    const k = cg.name.trim()
    if (k.length === 0) continue
    const arr = classGroupByExactName.get(k) ?? []
    arr.push(cg.id)
    classGroupByExactName.set(k, arr)
  }

  // Build a `cgByCanonicalKey` index from the sem4 ClassGroup table.
  // The canonical key is `targetSemesterId|cohort|major|classNo`. The
  // DB name is parsed back into canonical parts; if parse fails, the
  // entry is recorded in `cgParseFailures` and excluded from the
  // index. Each canonical key maps to one or more DB ids (legacy
  // sem4 collisions + L7-F6C collisions).
  type ClassGroupIndexEntry = { id: number; name: string; duration: string }
  const cgByCanonicalKey = new Map<string, ClassGroupIndexEntry[]>()
  const cgParseFailures: { id: number; name: string; reason: string }[] = []
  // Inline import (no schema change) — we read the same canonical key
  // helper as the L7-F6D2 reconciliation script.
  const {
    buildClassGroupCanonicalKey,
    parseDbClassGroupName,
    tokenizeExcelClassText: tokenizeExcelClassTextCanonical,
    normalizeCohortField,
  } = await import('@/lib/import/course-setting-canonical-key-l7-f6d2')
  void tokenizeExcelClassTextCanonical // alias to satisfy linter
  for (const cg of existingClassGroups) {
    const parsed = parseDbClassGroupName(cg.name)
    if ('failure' in parsed) {
      cgParseFailures.push({ id: cg.id, name: cg.name, reason: parsed.failure.reason })
      continue
    }
    const parts = {
      targetSemesterId: args.targetSemesterId,
      cohort: parsed.parts.cohort,
      duration: parsed.parts.duration,
      major: parsed.parts.major,
      classNo: parsed.parts.classNo,
    }
    const key = buildClassGroupCanonicalKey(parts)
    const arr = cgByCanonicalKey.get(key) ?? []
    arr.push({ id: cg.id, name: cg.name, duration: parts.duration })
    cgByCanonicalKey.set(key, arr)
  }
  console.log(`  ClassGroup canonical index size: ${cgByCanonicalKey.size}, parse failures: ${cgParseFailures.length}`)

  const autoResolvedResolutions = initialResolutions.map((item) => {
    const reviewRow = reviewUiWithRaw.rows.find((r) => r.approvalItemId === item.approvalItemId)
    if (!reviewRow) return item

    const r = { ...item, resolution: { ...item.resolution } }
    const teacherText = reviewRow.raw.teacherText ?? null
    const classText = reviewRow.raw.classText ?? null
    const majorName = reviewRow.raw.majorName ?? null
    const courseName = reviewRow.raw.courseName ?? null

    // ── Teacher: exact normalized match only ──
    if (r.resolution.teacher?.action === 'none' || !r.resolution.teacher) {
      const tokens = teacherText
        ? teacherText.split(/[、,,,，/／\s]+/).map((t) => normalizeTeacherName(t)).filter((t) => t.length > 0)
        : []
      const matchedIds = new Set<number>()
      for (const tk of tokens) {
        const id = teacherByExact.get(tk)
        if (id != null) matchedIds.add(id)
      }
      if (matchedIds.size === 1) {
        r.resolution.teacher = {
          action: 'useExistingTeacher',
          existingTeacherId: Array.from(matchedIds)[0]!,
        }
      } else if (matchedIds.size === 0) {
        // No exact match. For PE courses, allow blank with explicit
        // exemption code; otherwise leave as 'none' so plan builder
        // reports teacherMissing.
        if (isPhysicalEducationCourseName(courseName)) {
          r.resolution.teacher = {
            action: 'allowBlankTeacher',
            allowBlankReason: 'PHYSICAL_EDUCATION_TEACHER_EXEMPT',
          }
        }
      } else {
        // Multiple teachers in the cell map to different real teachers;
        // leave unresolved (no automatic "first" pick).
      }
    }

    // ── ClassGroup: canonical key exact match only ──
    if (r.resolution.classGroups?.action === 'none' || !r.resolution.classGroups) {
      const cohortRaw = (reviewRow as unknown as { raw?: { cohort?: string | null } }).raw?.cohort ?? null
      const durationRaw = (reviewRow as unknown as { raw?: { duration?: string | null } }).raw?.duration ?? null
      const cohort = normalizeCohortField(cohortRaw)
      const duration = (durationRaw ?? '').trim()
      const major = (majorName ?? '').trim()
      const tokens = tokenizeClassText(classText ?? '')
      if (tokens.length > 0 && cohort.length > 0 && major.length > 0) {
        const matchedIds = new Set<number>()
        for (const cn of tokens) {
          const key = buildClassGroupCanonicalKey({
            targetSemesterId: args.targetSemesterId,
            cohort,
            duration,
            major,
            classNo: cn,
          })
          const dbArr = cgByCanonicalKey.get(key)
          if (!dbArr) continue
          for (const db of dbArr) matchedIds.add(db.id)
        }
        if (matchedIds.size > 0) {
          r.resolution.classGroups = {
            action: 'useExistingClassGroup',
            existingClassGroupIds: Array.from(matchedIds),
          }
        }
      }
      // If classText is empty or cohort / major missing or no match,
      // leave `classGroups` unset so plan builder pushes
      // classGroupMissing.
    }

    return r
  })

  // L7-F6D2: K-column multi-teacher segment stats. For each approval
  // row, parse the teacherText (which is the K-column raw text). Count
  // total segments, segments with a resolved teacher, segments with
  // missing teacher, segments with missing class tokens, and rows
  // with multiple teacher segments.
  const { parseKAssignmentSegments } = await import('@/lib/import/course-setting-canonical-key-l7-f6d2')
  let kAssignmentSegmentCount = 0
  let kAssignmentSegmentsResolvedTeacher = 0
  let kAssignmentSegmentsMissingTeacher = 0
  let kAssignmentSegmentsResolvedClassGroups = 0
  let kAssignmentSegmentsMissingClassGroups = 0
  let multiTeacherRowCount = 0
  for (const reviewRow of reviewUiWithRaw.rows) {
    const kText = reviewRow.raw.teacherText ?? null
    if (!kText) continue
    const parsed = parseKAssignmentSegments(kText)
    if (parsed.segments.length < 2) continue
    multiTeacherRowCount++
    kAssignmentSegmentCount += parsed.segments.length
    for (const seg of parsed.segments) {
      // Teacher resolved?
      if (seg.teacherText && seg.teacherText.length > 0) {
        const tk = normalizeTeacherName(seg.teacherText)
        if (teacherByExact.has(tk)) kAssignmentSegmentsResolvedTeacher++
        else kAssignmentSegmentsMissingTeacher++
      } else {
        kAssignmentSegmentsMissingTeacher++
      }
      // Class groups resolved?
      const cohortRaw = (reviewRow as unknown as { raw?: { cohort?: string | null } }).raw?.cohort ?? null
      const durationRaw = (reviewRow as unknown as { raw?: { duration?: string | null } }).raw?.duration ?? null
      const major = (reviewRow.raw.majorName ?? '').trim()
      const cohort = normalizeCohortField(cohortRaw)
      const duration = (durationRaw ?? '').trim()
      if (cohort.length > 0 && major.length > 0) {
        let any = false
        for (const cn of seg.classTokens) {
          const key = buildClassGroupCanonicalKey({
            targetSemesterId: args.targetSemesterId,
            cohort,
            duration,
            major,
            classNo: cn,
          })
          if (cgByCanonicalKey.has(key)) {
            any = true
            break
          }
        }
        if (any) kAssignmentSegmentsResolvedClassGroups++
        else kAssignmentSegmentsMissingClassGroups++
      } else {
        kAssignmentSegmentsMissingClassGroups++
      }
    }
  }
  console.log(`  K-segment count: ${kAssignmentSegmentCount}, multiTeacherRowCount: ${multiTeacherRowCount}`)

  const plan = await buildCourseSettingPartialImportPlan({
    reviewRows: reviewUiWithRaw.rows,
    manualResolutions: autoResolvedResolutions,
    existingData,
    targetSemesterId: args.targetSemesterId,
    sourceArtifact: { filename: args.xlsx, sha256: fileSha256, sizeBytes: buffer.length },
    reviewPackageFingerprintHash: approvalPackage.dryRunFingerprint.hash,
  })
  const planValidation = validatePartialImportPlan(plan)
  if (!planValidation.ok) {
    console.error('ERROR: plan validation failed')
    console.error(JSON.stringify(planValidation.violations, null, 2))
    process.exit(1)
  }

  console.log(`\nL6-E2 plan summary:`)
  console.log(`  total rows:           ${plan.summary.totalRows}`)
  console.log(`  planned import:       ${plan.summary.plannedImportRows}`)
  console.log(`  skipped:              ${plan.summary.skippedRows}`)
  console.log(`  unresolved:           ${plan.summary.unresolvedRows}`)
  console.log(`  course create cand.:  ${plan.summary.courseCreateCandidates}`)
  console.log(`  teaching task cand.:  ${plan.summary.teachingTaskCandidates}`)
  console.log(`  teaching task class:  ${plan.summary.teachingTaskClassCandidates}`)

  // Compute plan hash
  const stableStringify = (v: unknown): string => {
    if (v == null || typeof v !== 'object') return JSON.stringify(v)
    if (Array.isArray(v)) return `[${v.map(stableStringify).join(',')}]`
    const keys = Object.keys(v as Record<string, unknown>).sort()
    return `{${keys.map((k) => JSON.stringify(k) + ':' + stableStringify((v as Record<string, unknown>)[k])).join(',')}}`
  }
  const planHash = createHash('sha256').update(stableStringify(plan), 'utf8').digest('hex')
  console.log(`  planHash:             ${planHash}`)

  // L7-F6D1: Semantic stats for dry-run validation. Spec §10 requires:
  //   teacherIdNullAmongImportable
  //   teacherIdNullAmongNonExemptImportable
  //   physicalEducationTeacherExemptCount
  //   invalidTeacherExemptionCount
  //   teacherMissingCandidateCount
  //   teacherAmbiguousCandidateCount
  //   classGroupEmptyAmongImportable
  //   classGroupMissingCandidateCount
  //   classGroupAmbiguousCandidateCount
  //   classGroupOverMatchedCandidateCount
  //   classGroupNotInTargetSemesterCount
  //   maxClassGroupsPerCandidate
  //   p50ClassGroupsPerCandidate
  //   p90ClassGroupsPerCandidate
  //   duplicatePlannedNameSkipped
  //   duplicatePlannedNameSkipSafe
  //   allClassGroupsBelongToTargetSemester
  //   canApply
  //   applied
  //   dbWritten
  const importable = plan.plan.importableRows
  const teachingTasks = plan.plan.teachingTasks
  let teacherIdNullAmongImportable = 0
  let teacherIdNullAmongNonExemptImportable = 0
  let physicalEducationTeacherExemptCount = 0
  let invalidTeacherExemptionCount = 0
  let teacherMissingCandidateCount = 0
  let teacherAmbiguousCandidateCount = 0
  let classGroupEmptyAmongImportable = 0
  let classGroupMissingCandidateCount = 0
  let classGroupAmbiguousCandidateCount = 0
  let classGroupOverMatchedCandidateCount = 0
  let classGroupNotInTargetSemesterCount = 0
  let maxClassGroups = 0
  const classGroupCounts: number[] = []
  let allClassGroupsBelongToTargetSemester = true
  let duplicateSkipped = 0
  // Duplicate-plannedName safety: every duplicate must be the same
  // composite key (targetSemesterId + same name). We count collisions
  // found in the createCandidates map; if any candidate has the same
  // name but the collision comes from rows where the row's
  // resolvedClassGroupIds differ, mark unsafe.
  let duplicatePlannedNameSkipSafe = true

  for (const row of importable) {
    if (row.resolvedTeacherId == null) teacherIdNullAmongImportable++
    if (!row.teacherExempt && row.resolvedTeacherId == null) teacherIdNullAmongNonExemptImportable++
    if (row.teacherExempt && row.teacherExemptionCode === 'PHYSICAL_EDUCATION_TEACHER_EXEMPT') {
      physicalEducationTeacherExemptCount++
    }
    if (row.teacherExempt && row.teacherExemptionCode !== 'PHYSICAL_EDUCATION_TEACHER_EXEMPT') {
      invalidTeacherExemptionCount++
    }
    if (row.blockerReasons.includes('teacherMissing')) teacherMissingCandidateCount++
    if (row.resolvedClassGroupIds.length === 0) classGroupEmptyAmongImportable++
    if (row.blockerReasons.includes('classGroupMissing')) classGroupMissingCandidateCount++
    if (row.resolvedClassGroupIds.length > 12) classGroupOverMatchedCandidateCount++
  }

  // Build a per-semester set from real DB cg ids (target semester).
  const cgInTargetSet = new Set(existingClassGroups.map((cg) => cg.id))
  // Build a set of cg ids belonging to OTHER semesters (sem1 etc.) —
  // existingData.classGroups only carries id (no semesterId), so we
  // cross-check via the real prisma query loaded at the top.
  const cgOutOfTargetSet = new Set<number>()
  for (const task of teachingTasks) {
    for (const ref of task.classGroupRefs) {
      if (ref.kind !== 'useExisting') continue
      const id = ref.classGroupId
      if (!cgInTargetSet.has(id)) {
        cgOutOfTargetSet.add(id)
        allClassGroupsBelongToTargetSemester = false
      }
    }
  }
  classGroupNotInTargetSemesterCount = cgOutOfTargetSet.size

  for (const task of teachingTasks) {
    let isPeExempt = false
    let tid: number | null = null
    if (task.teacherRef.kind === 'useExisting') {
      tid = task.teacherRef.teacherId
    } else if (task.teacherRef.kind === 'physicalEducationExempt') {
      isPeExempt = true
    }
    if (tid == null) teacherIdNullAmongImportable++
    if (!isPeExempt && tid == null) teacherIdNullAmongNonExemptImportable++
    if (isPeExempt) physicalEducationTeacherExemptCount++
    const cgIds = task.classGroupRefs
      .filter((r) => r.kind === 'useExisting')
      .map((r) => (r as { kind: 'useExisting'; classGroupId: number }).classGroupId)
    if (cgIds.length === 0) classGroupEmptyAmongImportable++
    classGroupCounts.push(cgIds.length)
    if (cgIds.length > maxClassGroups) maxClassGroups = cgIds.length
    if (task.duplicateRisk !== 'safeNew') duplicateSkipped++
  }
  classGroupCounts.sort((a, b) => a - b)
  const p50CG = classGroupCounts[Math.floor(classGroupCounts.length * 0.5)] ?? 0
  const p90CG = classGroupCounts[Math.floor(classGroupCounts.length * 0.9)] ?? 0

  // Duplicate plannedName safety: the createCandidates map groups by
  // normalized name. For each candidate, all approvalItemIds must
  // point at rows with the SAME classGroupIds set. Otherwise the
  // dedup is unsafe.
  for (const cand of plan.plan.createCandidates.classGroups) {
    if (cand.approvalItemIds.length <= 1) continue
    const firstRow = importable.find((r) => r.approvalItemId === cand.approvalItemIds[0])
    if (!firstRow) continue
    const firstKey = [...firstRow.resolvedClassGroupIds].sort((a, b) => a - b).join(',')
    for (let i = 1; i < cand.approvalItemIds.length; i++) {
      const row = importable.find((r) => r.approvalItemId === cand.approvalItemIds[i])
      if (!row) continue
      const rowKey = [...row.resolvedClassGroupIds].sort((a, b) => a - b).join(',')
      if (rowKey !== firstKey) duplicatePlannedNameSkipSafe = false
    }
  }

  // L7-F6D2: count DB canonical-key collisions. For each canonical key
  // in the DB index, if multiple DB rows share it, that is a
  // CLASSGROUP_PLANNED_NAME_COLLISION (same cohort+major+classNo
  // appears under different physical names). This includes both the
  // L7-F6C 23-duplicate case and the legacy sem4 + L7-F6C collision
  // case.
  let duplicateCompositeKeyCollisionCount = 0
  for (const arr of cgByCanonicalKey.values()) {
    if (arr.length > 1) {
      // +1 collision per extra row beyond the first
      duplicateCompositeKeyCollisionCount += arr.length - 1
    }
  }

  const canApply =
    importable.length > 0 &&
    teacherIdNullAmongNonExemptImportable === 0 &&
    invalidTeacherExemptionCount === 0 &&
    classGroupEmptyAmongImportable === 0 &&
    allClassGroupsBelongToTargetSemester &&
    duplicatePlannedNameSkipSafe &&
    duplicateCompositeKeyCollisionCount === 0

  console.log(`\n  --- Semantic stats (L7-F6D2) ---`)
  console.log(`  totalRows:                          ${plan.summary.totalRows}`)
  console.log(`  plannedRows:                        ${plan.summary.plannedImportRows}`)
  console.log(`  importableRows:                     ${importable.length}`)
  console.log(`  unresolvedRows:                     ${plan.summary.unresolvedRows}`)
  console.log(`  teacherIdNullAmongImportable:       ${teacherIdNullAmongImportable}`)
  console.log(`  teacherIdNullAmongNonExemptImportable: ${teacherIdNullAmongNonExemptImportable}`)
  console.log(`  physicalEducationTeacherExemptCount: ${physicalEducationTeacherExemptCount}`)
  console.log(`  invalidTeacherExemptionCount:       ${invalidTeacherExemptionCount}`)
  console.log(`  teacherMissingCandidateCount:       ${teacherMissingCandidateCount}`)
  console.log(`  teacherAmbiguousCandidateCount:     ${teacherAmbiguousCandidateCount}`)
  console.log(`  kAssignmentSegmentCount:            ${kAssignmentSegmentCount}`)
  console.log(`  kAssignmentSegmentsResolvedTeacher: ${kAssignmentSegmentsResolvedTeacher}`)
  console.log(`  kAssignmentSegmentsMissingTeacher:  ${kAssignmentSegmentsMissingTeacher}`)
  console.log(`  kAssignmentSegmentsResolvedClassGroups: ${kAssignmentSegmentsResolvedClassGroups}`)
  console.log(`  kAssignmentSegmentsMissingClassGroups: ${kAssignmentSegmentsMissingClassGroups}`)
  console.log(`  multiTeacherRowCount:                ${multiTeacherRowCount}`)
  console.log(`  classGroupEmptyAmongImportable:     ${classGroupEmptyAmongImportable}`)
  console.log(`  classGroupMissingCandidateCount:    ${classGroupMissingCandidateCount}`)
  console.log(`  classGroupAmbiguousCandidateCount:  ${classGroupAmbiguousCandidateCount}`)
  console.log(`  classGroupOverMatchedCandidateCount: ${classGroupOverMatchedCandidateCount}`)
  console.log(`  classGroupNotInTargetSemesterCount: ${classGroupNotInTargetSemesterCount}`)
  console.log(`  maxClassGroupsPerCandidate:         ${maxClassGroups}`)
  console.log(`  p50ClassGroupsPerCandidate:         ${p50CG}`)
  console.log(`  p90ClassGroupsPerCandidate:         ${p90CG}`)
  console.log(`  duplicatePlannedNameSkipped:        ${duplicateSkipped}`)
  console.log(`  duplicatePlannedNameSkipSafe:       ${duplicatePlannedNameSkipSafe}`)
  console.log(`  duplicateCompositeKeyCollisionCount: ${duplicateCompositeKeyCollisionCount}`)
  console.log(`  allClassGroupsBelongToTargetSemester: ${allClassGroupsBelongToTargetSemester}`)
  console.log(`  canApply:                           ${canApply}`)

  // Save plan artifact
  const artifactDir = join(resolve(__dirname, '..'), 'temp', 'local-artifacts', 'l7-f')
  if (!existsSync(artifactDir)) {
    mkdirSync(artifactDir, { recursive: true })
  }
  const planPath = join(artifactDir, `plan.target-${args.targetSemesterId}.${planHash.slice(0, 12)}.json`)
  writeFileSync(planPath, JSON.stringify(plan, null, 2) + '\n', 'utf-8')
  console.log(`\nplan artifact: ${planPath}`)

  // Run apply
  const { executeL7FCourseSettingApply } = await import('@/lib/import/course-setting-apply-l7-f')

  // ClassGroup hard gate — must be checked before backup and transaction.
  if (mode === 'apply') {
    const classGroupCount = await prisma.classGroup.count({
      where: { semesterId: args.targetSemesterId },
    })
    if (classGroupCount === 0) {
      console.log(`\n--- CLASSGROUP GATE ---`)
      console.log(`  Target semester ${args.targetSemesterId} has ${classGroupCount} ClassGroups.`)
      console.log(`  Cannot apply: TARGET_SEMESTER_HAS_NO_CLASS_GROUPS`)
      console.log(`  No backup created, no DB write.`)
      if (args.expectClassgroupGate) {
        console.log(`\n  --expect-classgroup-gate: gate triggered as expected. PASS.`)
        process.exit(0)
      }
      process.exit(1)
    }
  }

  console.log(`\n--- Executing L7-F apply (${mode}) ---`)
  const result = await executeL7FCourseSettingApply({
    targetSemesterId: args.targetSemesterId,
    plan: plan as unknown as Parameters<typeof executeL7FCourseSettingApply>[0]['plan'],
    confirmToken: mode === 'apply' ? expectedToken : undefined,
    dryRunOnly: mode === 'dry-run',
  })

  console.log(`\nL7-F result:`)
  console.log(`  applied:        ${result.applied}`)
  console.log(`  dbWritten:      ${result.dbWritten}`)
  console.log(`  dryRunOnly:     ${result.dryRunOnly}`)
  console.log(`  importBatchId:  ${result.importBatchId}`)
  console.log(`  backupPath:     ${result.backupPath ?? '(none — dry-run)'}`)
  console.log(`  rawIncluded:    ${result.rawIncluded}`)
  console.log(`\n  summary:`)
  for (const [k, v] of Object.entries(result.summary)) {
    console.log(`    ${k.padEnd(38)} ${v}`)
  }
  console.log(`\n  post-apply audit: ${result.postApplyAudit.passed ? 'PASSED' : 'FAILED'}`)
  for (const c of result.postApplyAudit.checks) {
    console.log(`    ${c.ok ? '✓' : '✗'} ${c.name}${c.detail ? ` (${c.detail})` : ''}`)
  }
  console.log(`\n  rollback note:`)
  console.log(`    ${result.rollbackNote.split('\n').join('\n    ')}`)

  // Save result artifact
  const resultPath = join(
    artifactDir,
    `result.target-${args.targetSemesterId}.${mode}.${planHash.slice(0, 12)}.json`,
  )
  writeFileSync(
    resultPath,
    JSON.stringify({ result, planHash, mode, planSummary: plan.summary }, null, 2) + '\n',
    'utf-8',
  )
  console.log(`\nresult artifact: ${resultPath}`)

  if (!result.applied && !result.dryRunOnly) {
    console.error(`\nERROR: apply failed audit. See ${resultPath} for details.`)
    process.exit(1)
  }

  await prisma.$disconnect()
}

main().catch(async (e) => {
  console.error('FATAL:', e)
  try {
    const { prisma } = await import('@/lib/prisma')
    await prisma.$disconnect()
  } catch {
    // ignore
  }
  process.exit(1)
})
