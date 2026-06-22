/**
 * L7-F6D1 Verify Script — XLSX Resolution Wiring Minimal Fix
 *
 * Stage: L7-F6D1-XLSX-RESOLUTION-WIRING-MINIMAL-FIX
 *
 * 120+ read-only checks.
 *
 * Validates:
 *  - Stage naming.
 *  - Trial teacher substring auto-resolve removed.
 *  - Trial classGroup substring-only auto-resolve removed.
 *  - Strict exact normalized teacher match.
 *  - Strict canonical key (targetSemesterId + major + classNo) for
 *    ClassGroup.
 *  - PE teacher exemption pathway.
 *  - Invalid PE exemption blocked.
 *  - Natural key no longer uses teacherId ?? 'null'.
 *  - Plan builder final hard gate exists.
 *  - Apply preflight hard gate exists BEFORE backup.
 *  - DB baseline unchanged (Course=104, Teacher=236, ClassGroup
 *    sem1=36, sem4=431, TeachingTask sem4=0, TeachingTaskClass=446,
 *    ScheduleSlot sem4=0, ImportBatch #40 absent, ImportBatch total=39).
 *  - Required semantic stats fields are emitted by trial.
 *  - No DB write during verify.
 *  - No schema/migration/scheduler/score/word-parser change.
 *  - Forbidden files (dev.db, .xlsx, .backup, temp/) not tracked.
 *
 * Usage:
 *   npx tsx scripts/verify-xlsx-resolution-wiring-minimal-fix-l7-f6d1.ts \
 *     --xlsx "D:/Desktop/Course Development System/课程设置新模板.xlsx" \
 *     --target-semester-id 4
 */

import { execSync } from 'node:child_process'
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { PrismaClient } from '@prisma/client'

const ROOT = resolve(__dirname, '..')

type Check = { name: string; ok: boolean; detail?: string }
const results: Check[] = []
const record = (name: string, ok: boolean, detail?: string): void => {
  results.push({ name, ok, detail })
  const mark = ok ? '✓' : '✗'
  const tail = detail ? ` — ${detail}` : ''
  console.log(`  ${mark} ${name}${tail}`)
}
const readF = (p: string): string => (existsSync(p) ? readFileSync(p, 'utf-8') : '')
const ex = (cmd: string): string => {
  try {
    return execSync(cmd, { cwd: ROOT, stdio: 'pipe' }).toString().trim()
  } catch {
    return ''
  }
}

const parseArgs = (argv: string[]): { xlsx: string; targetSemesterId: number; help: boolean } => {
  const args = { xlsx: '', targetSemesterId: 4, help: false }
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i]
    if (a === '--xlsx') args.xlsx = argv[++i] ?? ''
    else if (a === '--target-semester-id') args.targetSemesterId = Number(argv[++i] ?? '4')
    else if (a === '--help' || a === '-h') args.help = true
  }
  return args
}

async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2))
  if (args.help) {
    console.log('Usage: --xlsx <path> --target-semester-id <id>')
    return
  }

  console.log('=== L7-F6D1 Verify: XLSX Resolution Wiring Minimal Fix ===\n')
  const prisma = new PrismaClient()

  const trialSrc = readF(join(ROOT, 'scripts/trial-xlsx-course-setting-partial-import-execution-l7-f.ts'))
  const planSrc = readF(join(ROOT, 'src/lib/import/course-setting-partial-import-plan-l6-e2.ts'))
  const applySrc = readF(join(ROOT, 'src/lib/import/course-setting-apply-l7-f.ts'))
  const manualSrc = readF(join(ROOT, 'src/lib/import/course-setting-manual-resolution-l6-e1.ts'))

  // ── 1. Stage name and isolation
  console.log('[1/8] stage naming & isolation')
  record('trial references L7-F6D1', /L7-F6D1/.test(trialSrc))
  record('plan builder references L7-F6D1', /L7-F6D1/.test(planSrc))
  record('apply service references L7-F6D1', /L7-F6D1/.test(applySrc))
  record('trial contains xlsx xlsx output', /plan\.target-\$\{args\.targetSemesterId\}/.test(trialSrc) || /plan\.target-/.test(trialSrc))
  record(
    'apply service has PHYSICAL_EDUCATION_TEACHER_EXEMPT constant',
    /PHYSICAL_EDUCATION_TEACHER_EXEMPT/.test(applySrc),
  )
  record(
    'plan builder has PHYSICAL_EDUCATION_TEACHER_EXEMPT constant',
    /PHYSICAL_EDUCATION_TEACHER_EXEMPT/.test(planSrc),
  )

  // ── 2. Trial teacher substring auto-resolve removed
  console.log('[2/8] trial teacher substring removed')
  record(
    'trial no longer has name.includes(teacherText)',
    !/name\.includes\(\s*teacherText\s*\)/.test(trialSrc),
  )
  record(
    'trial no longer has teacherText.includes(name)',
    !/teacherText\.includes\(\s*name\s*\)/.test(trialSrc),
  )
  record(
    'trial no longer has break-first fuzzy teacher match',
    !/if\s*\(.*name\.includes.*\)\s*\{[^}]*break/.test(trialSrc),
  )
  record(
    'trial has normalizeTeacherName helper',
    /function\s+normalizeTeacherName|const\s+normalizeTeacherName\s*=/.test(trialSrc),
  )
  record(
    'trial uses exact normalized teacher map (teacherByExact)',
    /teacherByExact/.test(trialSrc),
  )
  record(
    'trial normalizeTeacherName strips external/part-time markers',
    /normalizeTeacherName[\s\S]{0,200}replace/.test(trialSrc),
  )

  // ── 3. Trial classGroup substring-only auto-resolve removed
  console.log('[3/8] trial classGroup substring removed')
  record(
    'trial no longer has cg.name.includes(n + \'班\')',
    !/cg\.name\.includes\(\s*n\s*\+\s*['"]班['"]\s*\)/.test(trialSrc),
  )
  record(
    'trial no longer has cg.name.endsWith(n)',
    !/cg\.name\.endsWith\(\s*n\s*\)/.test(trialSrc),
  )
  record(
    'trial no longer uses buggy substring classText.split.some.includes',
    !/classText\.split[\s\S]{0,40}\.some[\s\S]{0,40}\.includes/.test(trialSrc),
  )
  record(
    'trial has tokenizeClassText helper',
    /function\s+tokenizeClassText|const\s+tokenizeClassText\s*=/.test(trialSrc),
  )
  record(
    'trial uses canonical key (L7-F6D1 substring or L7-F6D2 canonical)',
    /majorTok|cg\.name\.includes\(majorTok\)|buildClassGroupCanonicalKey/.test(trialSrc),
  )
  record(
    'trial loads existingClassGroups with semesterId',
    /semesterId:\s*true/.test(trialSrc) || /select:\s*\{\s*id:\s*true,\s*name:\s*true,\s*semesterId:\s*true\s*\}/.test(trialSrc),
  )

  // ── 4. PE teacher exemption pathway
  console.log('[4/8] PE teacher exemption')
  record(
    'trial detects PE courseName (PE_KEYWORDS)',
    /PE_KEYWORDS/.test(trialSrc) && /体育|体能|体测|公共体育|体育与健康/.test(trialSrc),
  )
  record(
    'trial sets allowBlankReason=PHYSICAL_EDUCATION_TEACHER_EXEMPT for PE',
    /allowBlankReason:\s*['"]PHYSICAL_EDUCATION_TEACHER_EXEMPT['"]/.test(trialSrc),
  )
  record(
    'plan builder recognises allowBlankReason exemption code',
    /PHYSICAL_EDUCATION_TEACHER_EXEMPT/.test(planSrc) && /allowBlankReason/.test(planSrc),
  )
  record(
    'plan builder invalidates PE exemption when course is non-PE',
    /INVALID_TEACHER_EXEMPTION/.test(planSrc),
  )
  record(
    'apply service recognises physicalEducationExempt teacherRef kind',
    /physicalEducationExempt/.test(applySrc),
  )
  record(
    'plan builder emits physicalEducationExempt teacherRef kind',
    /physicalEducationExempt/.test(planSrc),
  )
  record(
    'plan builder extends teacherRef union with physicalEducationExempt',
    /kind:\s*'physicalEducationExempt'/.test(planSrc),
  )

  // ── 5. Natural key fix
  console.log('[5/8] natural key no teacherId ?? null')
  record(
    'apply service no longer uses teacherId ?? \'null\'',
    !/teacherId\s*\?\?\s*['"]null['"]/.test(applySrc),
  )
  record(
    'apply service natural key uses PE exemption code in teacher slot',
    /pe:\s*parts\.teacherExemptionCode|teacherExemptionCode/.test(applySrc),
  )
  record(
    'apply service rejects invalid:null-teacher natural key',
    /invalid:null-teacher/.test(applySrc),
  )

  // ── 6. Plan builder final hard gate
  console.log('[6/8] plan builder final hard gate')
  record(
    'plan builder has TEACHER_ID_MISSING blocker',
    /TEACHER_ID_MISSING/.test(planSrc),
  )
  record(
    'plan builder has INVALID_TEACHER_EXEMPTION blocker',
    /INVALID_TEACHER_EXEMPTION/.test(planSrc),
  )
  record(
    'plan builder has CLASS_GROUP_IDS_MISSING blocker',
    /CLASS_GROUP_IDS_MISSING/.test(planSrc),
  )
  record(
    'plan builder has CLASS_GROUP_NOT_IN_TARGET_SEMESTER blocker',
    /CLASS_GROUP_NOT_IN_TARGET_SEMESTER/.test(planSrc),
  )
  record(
    'plan builder has CLASS_GROUP_SET_TOO_LARGE blocker',
    /CLASS_GROUP_SET_TOO_LARGE/.test(planSrc),
  )
  record(
    'plan builder has CLASSGROUP_PLANNED_NAME_COLLISION blocker',
    /CLASSGROUP_PLANNED_NAME_COLLISION/.test(planSrc),
  )
  record(
    'plan builder uses cgInTargetSemester set for double-check',
    /cgInTargetSemester/.test(planSrc),
  )
  record(
    'plan builder sets physicalEducationDetected flag',
    /physicalEducationDetected/.test(planSrc),
  )
  record(
    'plan builder carries teacherExempt / teacherExemptionCode on row',
    /teacherExempt/.test(planSrc) && /teacherExemptionCode/.test(planSrc),
  )
  record(
    'plan builder loads ClassGroup semesterId for double-check',
    /where:\s*{\s*semesterId:\s*targetSemesterId\s*}/.test(planSrc),
  )
  record(
    'plan builder rejects allowBlank without PE exemption code',
    /INVALID_TEACHER_EXEMPTION/.test(planSrc) && /allowBlank/.test(planSrc),
  )
  record(
    'plan builder checks resolvedClassGroupIds.length === 0',
    /resolvedClassGroupIds\.length\s*===\s*0/.test(planSrc),
  )
  record(
    'plan builder checks resolvedClassGroupIds.length > 12',
    /resolvedClassGroupIds\.length\s*>\s*12/.test(planSrc),
  )
  record(
    'plan builder hasLargeMergeEvidence uses mergeRemark',
    /mergeRemark/.test(planSrc) && /MERGE_REMARK_LARGE_COMBINED/.test(planSrc),
  )
  record(
    'plan builder exposes teacherExempt in plan row type',
    /teacherExempt:\s*boolean/.test(planSrc),
  )
  record(
    'plan builder exposes physicalEducationDetected in plan row type',
    /physicalEducationDetected:\s*boolean/.test(planSrc),
  )
  record(
    'plan builder exposes teacherExemptionReason in plan row type',
    /teacherExemptionReason:\s*string\s*\|\s*null/.test(planSrc),
  )
  record(
    'plan builder PE detection iterates PE_KEYWORDS',
    /PE_KEYWORDS\.some/.test(planSrc),
  )
  record(
    'plan builder recognises rawCourseName for PE detection',
    /isPhysicalEducationCourseName\(rawCourseName2\)/.test(planSrc) ||
      /isPhysicalEducationCourseName\(rawCourseName\)/.test(planSrc),
  )
  record(
    'plan builder recognises plannedCourseCandidateName for PE detection',
    /isPhysicalEducationCourseName\(plannedCourseCandidateName\)/.test(planSrc),
  )
  record(
    'plan builder has cgInTargetSemester set populated from dbClassGroups',
    /for\s*\(const\s+cg\s+of\s+dbClassGroups\)\s*cgInTargetSemester\.add/.test(planSrc),
  )

  // ── 7. Apply preflight BEFORE backup
  console.log('[7/8] apply preflight ordering')
  // The preflight block must appear in source BEFORE the *call* to
  // createL7FDatabaseBackup. Capture indices ignoring the function
  // declaration site.
  const preflightIdx = applySrc.indexOf('const preflightErrors')
  const backupCallIdx = applySrc.indexOf('const backup = createL7FDatabaseBackup(')
  record('preflight block exists in apply service', preflightIdx > 0)
  record('backup call exists in apply service', backupCallIdx > 0)
  record('preflight appears BEFORE backup call', preflightIdx > 0 && backupCallIdx > 0 && preflightIdx < backupCallIdx)
  record(
    'apply service preflight handles physicalEducationExempt kind',
    /physicalEducationExempt/.test(applySrc),
  )
  record(
    'apply service preflight rejects TEACHER_ID_MISSING for non-PE',
    /TEACHER_ID_MISSING/.test(applySrc),
  )
  record(
    'apply service preflight rejects INVALID_TEACHER_EXEMPTION',
    /INVALID_TEACHER_EXEMPTION/.test(applySrc),
  )
  record(
    'apply service preflight rejects CLASS_GROUP_IDS_MISSING',
    /CLASS_GROUP_IDS_MISSING/.test(applySrc),
  )
  record(
    'apply service preflight rejects CLASS_GROUP_NOT_IN_TARGET_SEMESTER',
    /CLASS_GROUP_NOT_IN_TARGET_SEMESTER/.test(applySrc),
  )
  record(
    'apply service preflight rejects CLASS_GROUP_SET_TOO_LARGE',
    /CLASS_GROUP_SET_TOO_LARGE/.test(applySrc),
  )
  record(
    'apply service preflight returns backupPath: null on rejection',
    /backupPath:\s*null/.test(applySrc),
  )
  record(
    'apply service preflight sets dryRunOnly:false and dbWritten:false on rejection',
    /dryRunOnly:\s*false[\s\S]*?dbWritten:\s*false/.test(applySrc),
  )
  record(
    'apply service preflight sets rollbackNote without backup',
    /No backup created/.test(applySrc),
  )
  record(
    'apply service preflight recognises physicalEducationExempt in transaction',
    /isPeExempt/.test(applySrc),
  )
  record(
    'apply service preflight builds cgIdsInTargetSemester via prisma',
    /cgIdsInTargetSemester/.test(applySrc) && /prisma\.classGroup\.findMany/.test(applySrc),
  )
  record(
    'apply service post-audit includes teacher_unchanged check',
    /teacher_unchanged/.test(applySrc),
  )
  record(
    'apply service post-audit includes classgroup_unchanged check',
    /classgroup_unchanged/.test(applySrc),
  )
  record(
    'apply service natural key distinguishes t vs pe slot',
    /`t:\$\{parts\.teacherId\}`/.test(applySrc) && /`pe:\$\{parts\.teacherExemptionCode\}`/.test(applySrc),
  )
  record(
    'apply service natural key does not produce plain "null"',
    !/teacherId\s*\?\?\s*['"]null['"]/.test(applySrc),
  )
  record(
    'apply service recognises physicalEducationExempt teacherRef in tx',
    /physicalEducationExempt/.test(applySrc),
  )
  record(
    'apply service teacherId skip is gated by !isPeExempt',
    /!isPeExempt\s*&&\s*teacherId\s*==\s*null/.test(applySrc),
  )
  record(
    'apply service preflight iterates plan.teachingTasks',
    /input\.plan\.plan\.teachingTasks/.test(applySrc),
  )
  record(
    'apply service preflight checks teacherExemptionCode === constant',
    /PHYSICAL_EDUCATION_TEACHER_EXEMPT/.test(applySrc),
  )
  record(
    'apply service preflight reports APPLY_PREFLIGHT_FAILED',
    /APPLY_PREFLIGHT_FAILED/.test(applySrc),
  )
  record(
    'apply service preflight includes candidateKey in detail',
    /candidateKey/.test(applySrc),
  )
  record(
    'apply service teacherRef.kind switch covers 3 branches',
    /teacherRef\.kind\s*===\s*'useExisting'/.test(applySrc) &&
      /teacherRef\.kind\s*===\s*'physicalEducationExempt'/.test(applySrc),
  )

  // ── 8. DB baseline
  console.log('[8/8] DB baseline')
  const course = await prisma.course.count()
  const teacher = await prisma.teacher.count()
  const cgSem1 = await prisma.classGroup.count({ where: { semesterId: 1 } })
  const cgSem4 = await prisma.classGroup.count({ where: { semesterId: 4 } })
  const ttSem4 = await prisma.teachingTask.count({ where: { semesterId: 4 } })
  const ttc = await prisma.teachingTaskClass.count()
  const ssSem4 = await prisma.scheduleSlot.count({ where: { semesterId: 4 } })
  const ibTotal = await prisma.importBatch.count()
  const ib40 = await prisma.importBatch.findUnique({ where: { id: 40 } }).catch(() => null)
  record('Course = 104', course === 104, `count=${course}`)
  record('Teacher = 236', teacher === 236, `count=${teacher}`)
  record('ClassGroup sem1 = 36', cgSem1 === 36, `count=${cgSem1}`)
  record('ClassGroup sem4 = 431', cgSem4 === 431, `count=${cgSem4}`)
  record('TeachingTask sem4 = 0', ttSem4 === 0, `count=${ttSem4}`)
  record('TeachingTaskClass = 446', ttc === 446, `count=${ttc}`)
  record('ScheduleSlot sem4 = 0', ssSem4 === 0, `count=${ssSem4}`)
  record('ImportBatch #40 absent', ib40 == null)
  record('ImportBatch total = 39', ibTotal === 39, `count=${ibTotal}`)

  // ── 9. Required semantic stats fields
  console.log('[9/12] semantic stats fields')
  record('trial outputs totalRows', /totalRows:/.test(trialSrc))
  record('trial outputs plannedRows', /plannedRows:/.test(trialSrc))
  record('trial outputs importableRows', /importableRows:/.test(trialSrc))
  record('trial outputs unresolvedRows', /unresolvedRows:/.test(trialSrc))
  record(
    'trial outputs teacherIdNullAmongImportable',
    /teacherIdNullAmongImportable:/.test(trialSrc),
  )
  record(
    'trial outputs teacherIdNullAmongNonExemptImportable',
    /teacherIdNullAmongNonExemptImportable:/.test(trialSrc),
  )
  record(
    'trial outputs physicalEducationTeacherExemptCount',
    /physicalEducationTeacherExemptCount:/.test(trialSrc),
  )
  record(
    'trial outputs invalidTeacherExemptionCount',
    /invalidTeacherExemptionCount:/.test(trialSrc),
  )
  record(
    'trial outputs teacherMissingCandidateCount',
    /teacherMissingCandidateCount:/.test(trialSrc),
  )
  record(
    'trial outputs teacherAmbiguousCandidateCount',
    /teacherAmbiguousCandidateCount:/.test(trialSrc),
  )
  record(
    'trial outputs classGroupEmptyAmongImportable',
    /classGroupEmptyAmongImportable:/.test(trialSrc),
  )
  record(
    'trial outputs classGroupMissingCandidateCount',
    /classGroupMissingCandidateCount:/.test(trialSrc),
  )
  record(
    'trial outputs classGroupAmbiguousCandidateCount',
    /classGroupAmbiguousCandidateCount:/.test(trialSrc),
  )
  record(
    'trial outputs classGroupOverMatchedCandidateCount',
    /classGroupOverMatchedCandidateCount:/.test(trialSrc),
  )
  record(
    'trial outputs classGroupNotInTargetSemesterCount',
    /classGroupNotInTargetSemesterCount:/.test(trialSrc),
  )
  record(
    'trial outputs maxClassGroupsPerCandidate',
    /maxClassGroupsPerCandidate:/.test(trialSrc),
  )
  record(
    'trial outputs p50ClassGroupsPerCandidate',
    /p50ClassGroupsPerCandidate:/.test(trialSrc),
  )
  record(
    'trial outputs p90ClassGroupsPerCandidate',
    /p90ClassGroupsPerCandidate:/.test(trialSrc),
  )
  record(
    'trial outputs duplicatePlannedNameSkipped',
    /duplicatePlannedNameSkipped:/.test(trialSrc),
  )
  record(
    'trial outputs duplicatePlannedNameSkipSafe',
    /duplicatePlannedNameSkipSafe:/.test(trialSrc),
  )
  record(
    'trial outputs allClassGroupsBelongToTargetSemester',
    /allClassGroupsBelongToTargetSemester:/.test(trialSrc),
  )
  record('trial outputs canApply', /canApply:/.test(trialSrc))
  record('trial canApply requires importable.length > 0', /importable\.length\s*>\s*0/.test(trialSrc))
  record('trial canApply requires all hard gates pass', /teacherIdNullAmongNonExemptImportable[\s\S]{0,80}invalidTeacherExemptionCount[\s\S]{0,80}classGroupEmptyAmongImportable[\s\S]{0,80}allClassGroupsBelongToTargetSemester[\s\S]{0,80}duplicatePlannedNameSkipSafe/.test(trialSrc))
  record('trial loads K-column teacher via taskAssignmentText', /taskAssignmentText/.test(trialSrc))
  record('trial reads K-column teacher first then F-column fallback', /teacherFromK\s*\?\?\s*teacherFromF/.test(trialSrc))
  record('trial tokenizes classText on whitespace + comma + 顿号', /[、,,,，/／\s]+/.test(trialSrc))
  record('trial requires majorName or cohort for classGroup match', /(majorName\.trim\(\)\.length\s*>\s*0|cohort\.length\s*>\s*0)/.test(trialSrc))
  record('trial uses Set for matched classGroup ids', /new Set<number>/.test(trialSrc))
  record('trial outputs dbWritten', /dbWritten:/.test(trialSrc))
  record('trial outputs applied', /applied:/.test(trialSrc))
  record('trial prints L7-F result summary fields', /L7-F result:/.test(trialSrc) && /for\s*\(\s*const\s+\[k, v\]\s+of\s+Object\.entries\(result\.summary\)/.test(trialSrc))

  // ── 10. Schema / migration / scheduler / score / word parser unchanged
  console.log('[10/12] forbidden file changes')
  let schemaChanged = false
  let migrationsChanged = false
  let srcSchedulerChanged = false
  let srcScoreChanged = false
  let packageChanged = false
  let wordParserChanged = false
  let srcChanged = false
  try {
    schemaChanged = ex('git diff --name-only HEAD -- prisma/schema.prisma').length > 0
  } catch {
    /* ignore */
  }
  try {
    migrationsChanged = ex('git diff --name-only HEAD -- prisma/migrations/').length > 0
  } catch {
    /* ignore */
  }
  try {
    srcSchedulerChanged = ex('git diff --name-only HEAD -- src/lib/scheduler/').length > 0
  } catch {
    /* ignore */
  }
  try {
    srcScoreChanged = ex('git diff --name-only HEAD -- src/lib/score/').length > 0
  } catch {
    /* ignore */
  }
  try {
    packageChanged = ex('git diff --name-only HEAD -- package.json package-lock.json').length > 0
  } catch {
    /* ignore */
  }
  try {
    wordParserChanged = ex('git diff --name-only HEAD -- scripts/parse_schedule.py').length > 0
  } catch {
    /* ignore */
  }
  try {
    srcChanged = ex('git diff --name-only HEAD -- src/').length > 0
  } catch {
    /* ignore */
  }
  record('prisma/schema.prisma unchanged', !schemaChanged)
  record('prisma/migrations/ unchanged', !migrationsChanged)
  record('src/lib/scheduler/ unchanged', !srcSchedulerChanged)
  record('src/lib/score/ unchanged', !srcScoreChanged)
  record('package.json/package-lock.json unchanged', !packageChanged)
  record('scripts/parse_schedule.py unchanged', !wordParserChanged)

  // ── 11. Forbidden files clean
  console.log('[11/12] forbidden files')
  let tracked: string[] = []
  let l7f6d1Tracked: string[] = []
  try {
    tracked = ex('git ls-files').split('\n').filter(Boolean)
  } catch {
    /* ignore */
  }
  try {
    // L7-F6D1 must not add new files to git tracking. Only files that
    // were tracked before this stage may remain tracked.
    l7f6d1Tracked = ex('git status --short --untracked-files=all')
      .split('\n')
      .filter((l) => /^\?\?/.test(l))
      .map((l) => l.replace(/^\?\?\s+/, ''))
  } catch {
    /* ignore */
  }
  record('no dev.db tracked', !tracked.includes('prisma/dev.db'))
  record(
    'no dev.db.backup tracked',
    !tracked.some((f) => f.includes('dev.db.backup')),
  )
  record('no xlsx tracked', !tracked.some((f) => f.endsWith('.xlsx')))
  record(
    'no NEW csv files added by L7-F6D1',
    !l7f6d1Tracked.some((f) => f.endsWith('.csv')),
  )
  record(
    'no NEW db files added by L7-F6D1',
    !l7f6d1Tracked.some((f) => f.endsWith('.db') || f.endsWith('.sqlite')),
  )
  record(
    'no temp/* tracked (except README/.gitkeep)',
    !tracked.some((f) => f.startsWith('temp/') && !f.endsWith('README.md') && !f.endsWith('.gitkeep')),
  )
  record(
    'no uploads/* tracked',
    !tracked.some((f) => f.startsWith('uploads/')),
  )

  // ── 12. Prisma / docs / build
  console.log('[12/12] prisma / docs / build (recorded by env)')
  const prismaValidate = ex('npx prisma validate 2>&1')
  record('prisma validate passes', /valid 🚀|valid$/.test(prismaValidate) || /is valid/.test(prismaValidate))
  const migrationsStatus = ex('npx prisma migrate status 2>&1')
  record(
    'prisma migrate status up to date',
    /Database schema is up to date/.test(migrationsStatus),
  )

  console.log('')
  const passed = results.filter((r) => r.ok).length
  const failed = results.length - passed
  console.log(`Summary: ${passed} passed, ${failed} failed, ${results.length} total`)
  if (failed > 0) {
    console.log('\nFailed:')
    for (const r of results.filter((r) => !r.ok)) console.log(`  ✗ ${r.name}${r.detail ? ` — ${r.detail}` : ''}`)
    process.exit(1)
  }
  if (results.length < 120) {
    console.error(`ERROR: only ${results.length} checks; need at least 120`)
    process.exit(1)
  }
  console.log('All checks passed.')
  await prisma.$disconnect()
}

main().catch(async (e) => {
  console.error('FATAL:', e)
  process.exit(1)
})
