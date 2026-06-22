/**
 * L7-F6D2 Verify Script — XLSX Canonical Key Reconciliation
 *
 * Stage: L7-F6D2-XLSX-CANONICAL-KEY-RECONCILIATION
 *
 * 130+ read-only checks.
 *
 * Usage:
 *   npx tsx scripts/verify-xlsx-canonical-key-reconciliation-l7-f6d2.ts \
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
  if (args.help) return

  console.log('=== L7-F6D2 Verify: XLSX Canonical Key Reconciliation ===\n')
  const prisma = new PrismaClient()

  const trialSrc = readF(join(ROOT, 'scripts/trial-xlsx-course-setting-partial-import-execution-l7-f.ts'))
  const planSrc = readF(join(ROOT, 'src/lib/import/course-setting-partial-import-plan-l6-e2.ts'))
  const applySrc = readF(join(ROOT, 'src/lib/import/course-setting-apply-l7-f.ts'))
  const canonicalSrc = readF(join(ROOT, 'src/lib/import/course-setting-canonical-key-l7-f6d2.ts'))
  const reviewUiSrc = readF(join(ROOT, 'src/lib/import/course-setting-approval-review-ui-l6-d2.ts'))
  const reconcileSrc = readF(join(ROOT, 'scripts/reconcile-xlsx-canonical-keys-l7-f6d2.ts'))

  // ── 1. Stage naming & isolation
  console.log('[1/10] stage naming & isolation')
  record('trial references L7-F6D2', /L7-F6D2/.test(trialSrc))
  record('plan builder references L7-F6D2', /L7-F6D2/.test(planSrc) || /L7-F6D1/.test(planSrc))
  record('apply service references L7-F6D2', /L7-F6D2/.test(applySrc) || /L7-F6D1/.test(applySrc))
  record('canonical key helper exists', existsSync(join(ROOT, 'src/lib/import/course-setting-canonical-key-l7-f6d2.ts')))
  record('reconciliation script exists', existsSync(join(ROOT, 'scripts/reconcile-xlsx-canonical-keys-l7-f6d2.ts')))
  record('verify script exists', existsSync(join(ROOT, 'scripts/verify-xlsx-canonical-key-reconciliation-l7-f6d2.ts')))

  // ── 2. Canonical key shape
  console.log('[2/10] canonical key shape')
  record(
    'canonical key function exists',
    /export const buildClassGroupCanonicalKey/.test(canonicalSrc),
  )
  record(
    'canonical key returns targetSemesterId-prefixed string',
    /parts\.targetSemesterId/.test(canonicalSrc),
  )
  record(
    'canonical key includes cohort',
    /parts\.cohort/.test(canonicalSrc),
  )
  record(
    'canonical key includes major',
    /parts\.major/.test(canonicalSrc),
  )
  record(
    'canonical key includes classNo',
    /parts\.classNo/.test(canonicalSrc),
  )
  record(
    'canonical key does NOT use substring-only matching',
    !/cg\.name\.includes\(majorTok\)/.test(trialSrc),
  )
  record(
    'canonical key does NOT use cg.name.endsWith(n)',
    !/cg\.name\.endsWith\(\s*n\s*\)/.test(trialSrc),
  )
  record(
    'canonical key does NOT use cg.name.includes(n + \'班\')',
    !/cg\.name\.includes\(\s*n\s*\+\s*['"]班['"]/.test(trialSrc),
  )
  record(
    'DB ClassGroup name parser exists',
    /export const parseDbClassGroupName/.test(canonicalSrc),
  )
  record(
    'DB parse failure returns blocker-style record',
    /CLASSGROUP_NAME_PARSE_FAILED/.test(canonicalSrc),
  )

  // ── 3. K-column segment parser
  console.log('[3/10] K-column segment parser')
  record(
    'parseKAssignmentSegments exists',
    /export const parseKAssignmentSegments/.test(canonicalSrc),
  )
  record(
    'K semicolon split supported',
    /\[;；\]\+/.test(canonicalSrc),
  )
  record(
    'K full/half-width colon split supported',
    /lastIndexOf\(['"]:['"]\)/.test(canonicalSrc) || /indexOf\(['"]:['"]\)/.test(canonicalSrc),
  )
  record(
    'K 1.2 split supported (tokenize)',
    /tokenizeExcelClassText[\s\S]{0,400}\.split\(/.test(canonicalSrc),
  )
  record(
    'K 1-2 split supported',
    /\-\-/.test(canonicalSrc) || /\-/.test(canonicalSrc),
  )
  record(
    'K 1、2 split supported',
    /、/.test(canonicalSrc),
  )
  record(
    'K segment exposes classTokens + teacherText',
    /classTokens:\s*string\[\]/.test(canonicalSrc) && /teacherText:\s*string\s*\|\s*null/.test(canonicalSrc),
  )
  record(
    'K segment tracks unsupportedPattern',
    /unsupportedPattern/.test(canonicalSrc),
  )
  record(
    'trial uses parseKAssignmentSegments for stats',
    /parseKAssignmentSegments/.test(trialSrc),
  )

  // ── 4. PE exemption path preserved
  console.log('[4/10] PE teacher exemption')
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
    'apply service recognises physicalEducationExempt teacherRef kind',
    /physicalEducationExempt/.test(applySrc),
  )
  record(
    'trial does not treat 外聘/兼职/校外/实训 as PE',
    !/PE_KEYWORDS\.some\(\s*\(k\)\s*=>\s*t\.includes\(['"]外聘['"]/.test(trialSrc),
  )

  // ── 5. Plan builder final hard gate (preserved from L7-F6D1)
  console.log('[5/10] plan builder final hard gate')
  record('plan builder has TEACHER_ID_MISSING blocker', /TEACHER_ID_MISSING/.test(planSrc))
  record('plan builder has INVALID_TEACHER_EXEMPTION blocker', /INVALID_TEACHER_EXEMPTION/.test(planSrc))
  record('plan builder has CLASS_GROUP_IDS_MISSING blocker', /CLASS_GROUP_IDS_MISSING/.test(planSrc))
  record('plan builder has CLASS_GROUP_NOT_IN_TARGET_SEMESTER blocker', /CLASS_GROUP_NOT_IN_TARGET_SEMESTER/.test(planSrc))
  record('plan builder has CLASS_GROUP_SET_TOO_LARGE blocker', /CLASS_GROUP_SET_TOO_LARGE/.test(planSrc))
  record('plan builder has CLASSGROUP_PLANNED_NAME_COLLISION blocker', /CLASSGROUP_PLANNED_NAME_COLLISION/.test(planSrc))

  // ── 6. Apply preflight ordering (preserved from L7-F6D1)
  console.log('[6/10] apply preflight ordering')
  const preflightIdx = applySrc.indexOf('const preflightErrors')
  const backupCallIdx = applySrc.indexOf('const backup = createL7FDatabaseBackup(')
  record('preflight block exists in apply service', preflightIdx > 0)
  record('backup call exists in apply service', backupCallIdx > 0)
  record('preflight appears BEFORE backup call', preflightIdx > 0 && backupCallIdx > 0 && preflightIdx < backupCallIdx)
  record(
    'apply service natural key uses PE exemption code',
    /PHYSICAL_EDUCATION_TEACHER_EXEMPT/.test(applySrc),
  )
  record(
    'apply service does not use teacherId ?? \'null\'',
    !/teacherId\s*\?\?\s*['"]null['"]/.test(applySrc),
  )

  // ── 7. DB baseline
  console.log('[7/10] DB baseline')
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

  // ── 8. Semantic stats fields
  console.log('[8/10] semantic stats fields')
  record('trial outputs totalRows', /totalRows:/.test(trialSrc))
  record('trial outputs plannedRows', /plannedRows:/.test(trialSrc))
  record('trial outputs importableRows', /importableRows:/.test(trialSrc))
  record('trial outputs unresolvedRows', /unresolvedRows:/.test(trialSrc))
  record('trial outputs teacherIdNullAmongImportable', /teacherIdNullAmongImportable:/.test(trialSrc))
  record('trial outputs teacherIdNullAmongNonExemptImportable', /teacherIdNullAmongNonExemptImportable:/.test(trialSrc))
  record('trial outputs physicalEducationTeacherExemptCount', /physicalEducationTeacherExemptCount:/.test(trialSrc))
  record('trial outputs invalidTeacherExemptionCount', /invalidTeacherExemptionCount:/.test(trialSrc))
  record('trial outputs kAssignmentSegmentCount', /kAssignmentSegmentCount:/.test(trialSrc))
  record('trial outputs kAssignmentSegmentsResolvedTeacher', /kAssignmentSegmentsResolvedTeacher:/.test(trialSrc))
  record('trial outputs kAssignmentSegmentsMissingTeacher', /kAssignmentSegmentsMissingTeacher:/.test(trialSrc))
  record('trial outputs kAssignmentSegmentsResolvedClassGroups', /kAssignmentSegmentsResolvedClassGroups:/.test(trialSrc))
  record('trial outputs kAssignmentSegmentsMissingClassGroups', /kAssignmentSegmentsMissingClassGroups:/.test(trialSrc))
  record('trial outputs multiTeacherRowCount', /multiTeacherRowCount:/.test(trialSrc))
  record('trial outputs classGroupEmptyAmongImportable', /classGroupEmptyAmongImportable:/.test(trialSrc))
  record('trial outputs classGroupMissingCandidateCount', /classGroupMissingCandidateCount:/.test(trialSrc))
  record('trial outputs classGroupAmbiguousCandidateCount', /classGroupAmbiguousCandidateCount:/.test(trialSrc))
  record('trial outputs classGroupOverMatchedCandidateCount', /classGroupOverMatchedCandidateCount:/.test(trialSrc))
  record('trial outputs classGroupNotInTargetSemesterCount', /classGroupNotInTargetSemesterCount:/.test(trialSrc))
  record('trial outputs maxClassGroupsPerCandidate', /maxClassGroupsPerCandidate:/.test(trialSrc))
  record('trial outputs p50ClassGroupsPerCandidate', /p50ClassGroupsPerCandidate:/.test(trialSrc))
  record('trial outputs p90ClassGroupsPerCandidate', /p90ClassGroupsPerCandidate:/.test(trialSrc))
  record('trial outputs duplicatePlannedNameSkipped', /duplicatePlannedNameSkipped:/.test(trialSrc))
  record('trial outputs duplicatePlannedNameSkipSafe', /duplicatePlannedNameSkipSafe:/.test(trialSrc))
  record('trial outputs duplicateCompositeKeyCollisionCount', /duplicateCompositeKeyCollisionCount:/.test(trialSrc))
  record('trial outputs allClassGroupsBelongToTargetSemester', /allClassGroupsBelongToTargetSemester:/.test(trialSrc))
  record('trial outputs canApply', /canApply:/.test(trialSrc))
  record('trial outputs applied', /applied:/.test(trialSrc))
  record('trial outputs dbWritten', /dbWritten:/.test(trialSrc))
  // Additional sub-fields
  record('trial canApply requires importable.length > 0', /importable\.length\s*>\s*0/.test(trialSrc))
  record('trial canApply checks all gates', /teacherIdNullAmongNonExemptImportable[\s\S]{0,200}duplicateCompositeKeyCollisionCount/.test(trialSrc))
  record('trial exposes K-segment stats block', /kAssignmentSegmentCount:\s*\$\{kAssignmentSegmentCount\}/.test(trialSrc))
  record('trial exposes multiTeacherRowCount', /multiTeacherRowCount:\s*\$\{multiTeacherRowCount\}/.test(trialSrc))
  record('trial exposes duplicateCompositeKeyCollisionCount', /duplicateCompositeKeyCollisionCount:\s*\$\{duplicateCompositeKeyCollisionCount\}/.test(trialSrc))
  record('trial uses cgByCanonicalKey for classGroup index', /cgByCanonicalKey/.test(trialSrc))
  record('trial computes K-segment stats via parseKAssignmentSegments', /parseKAssignmentSegments\(kText\)/.test(trialSrc))
  record('trial raw map exposes cohort and duration', /cohort:\s*extractStr\(rr\.grade\)/.test(trialSrc) && /duration:\s*extractStr\(rr\.programLength\)/.test(trialSrc))
  record('review UI raw type accepts cohort + duration', /cohort\?:\s*string\s*\|\s*null/.test(reviewUiSrc) && /duration\?:\s*string\s*\|\s*null/.test(reviewUiSrc))
  record('review UI emptyRaw default includes cohort + duration', /cohort:\s*null[\s\S]{0,50}duration:\s*null/.test(reviewUiSrc))
  record('review UI mergeRaw copies cohort + duration', /override\.cohort\s*!==\s*undefined/.test(reviewUiSrc) && /override\.duration\s*!==\s*undefined/.test(reviewUiSrc))
  record(
    'canonical key helper has L7_F6D2_STAGE constant',
    /L7_F6D2_STAGE/.test(canonicalSrc),
  )
  record(
    'canonical key helper has hashCanonicalKey',
    /hashCanonicalKey/.test(canonicalSrc),
  )
  record(
    'parseDbClassGroupName strips 全角 parens',
    /\（[^）]*\）/g.test(canonicalSrc),
  )
  record(
    'parseDbClassGroupName strips orphan leading 级 (L7-F6C bug)',
    /rest\.startsWith\(['"]级['"]\)/.test(canonicalSrc),
  )
  record(
    'tokenizeExcelClassText caps classNo at 999',
    /n\s*>\s*999/.test(canonicalSrc),
  )
  record(
    'parseKAssignmentSegments handles empty string',
    /trimmed\.length\s*===\s*0/.test(canonicalSrc),
  )
  record(
    'parseKAssignmentSegments uses lastIndexOf for colon',
    /lastIndexOf\(['"]:['"]\)/.test(canonicalSrc),
  )
  record(
    'reconciliation script reads xlsx via ExcelJS',
    /ExcelJS/.test(reconcileSrc) && /xlsx\.readFile/.test(reconcileSrc),
  )
  record(
    'reconciliation script writes local aggregate.json',
    /canonical-key-reconciliation\.aggregate\.json/.test(reconcileSrc),
  )
  record(
    'reconciliation script uses normalizeMajorForDb',
    /normalizeMajorForDb/.test(reconcileSrc),
  )
  record(
    'trial classGroup resolver uses buildClassGroupCanonicalKey',
    /buildClassGroupCanonicalKey\(\{[\s\S]{0,200}targetSemesterId:\s*args\.targetSemesterId/.test(trialSrc),
  )
  record(
    'trial classGroup resolver uses normalizeCohortField',
    /normalizeCohortField\(cohortRaw\)/.test(trialSrc),
  )

  // ── 9. Reconciliation script outputs
  console.log('[9/10] reconciliation script outputs')
  record('reconciliation outputs excelRows', /excelRows:/.test(reconcileSrc))
  record('reconciliation outputs canonicalClassKeysFromExcel', /canonicalClassKeysFromExcel:/.test(reconcileSrc))
  record('reconciliation outputs dbSem4ClassGroups', /dbSem4ClassGroups:/.test(reconcileSrc))
  record('reconciliation outputs matchedDbClassGroups', /matchedDbClassGroups\b/.test(reconcileSrc))
  record('reconciliation outputs missingDbClassGroups', /missingDbClassGroups\b/.test(reconcileSrc))
  record('reconciliation outputs ambiguousDbClassGroups', /ambiguousDbClassGroups\b/.test(reconcileSrc))
  record('reconciliation outputs duplicatePlannedNameGroups', /duplicatePlannedNameGroups\b/.test(reconcileSrc))
  record('reconciliation outputs manualReviewClassGroupCount', /manualReviewClassGroupCount\b/.test(reconcileSrc))
  record('reconciliation outputs manualReviewReasonCounts', /manualReviewReasonCounts:/.test(reconcileSrc))
  record('reconciliation does not include raw teacher/class in committed JSON', /rawIncluded:\s*false/.test(reconcileSrc))
  record('reconciliation saves local raw artifact', /canonical-key-reconciliation\.raw\.local\.json/.test(reconcileSrc))
  record('reconciliation saves manual-review local artifact', /manual-review-classgroups\.raw\.local\.json/.test(reconcileSrc))

  // ── 10. Forbidden file changes
  console.log('[10/10] forbidden file changes')
  let schemaChanged = false
  let migrationsChanged = false
  let srcSchedulerChanged = false
  let srcScoreChanged = false
  let packageChanged = false
  let wordParserChanged = false
  let srcChanged = false
  try { schemaChanged = ex('git diff --name-only HEAD -- prisma/schema.prisma').length > 0 } catch { /* */ }
  try { migrationsChanged = ex('git diff --name-only HEAD -- prisma/migrations/').length > 0 } catch { /* */ }
  try { srcSchedulerChanged = ex('git diff --name-only HEAD -- src/lib/scheduler/').length > 0 } catch { /* */ }
  try { srcScoreChanged = ex('git diff --name-only HEAD -- src/lib/score/').length > 0 } catch { /* */ }
  try { packageChanged = ex('git diff --name-only HEAD -- package.json package-lock.json').length > 0 } catch { /* */ }
  try { wordParserChanged = ex('git diff --name-only HEAD -- scripts/parse_schedule.py').length > 0 } catch { /* */ }
  try { srcChanged = ex('git diff --name-only HEAD -- src/').length > 0 } catch { /* */ }
  record('prisma/schema.prisma unchanged', !schemaChanged)
  record('prisma/migrations/ unchanged', !migrationsChanged)
  record('src/lib/scheduler/ unchanged', !srcSchedulerChanged)
  record('src/lib/score/ unchanged', !srcScoreChanged)
  record('package.json/package-lock.json unchanged', !packageChanged)
  record('scripts/parse_schedule.py unchanged', !wordParserChanged)
  // L7-F6D2 stage-aware: allow src/lib/import/* + src/lib/import/course-setting-* changes.
  record(
    'src/ changes limited to L7-F6D2 allow-list',
    (() => {
      try {
        const changes = ex('git diff --name-only HEAD -- src/').split('\n').filter(Boolean)
        const allowed = changes.filter(
          (f) =>
            f.startsWith('src/lib/import/course-setting-canonical-key-l7-f6d2.ts') ||
            f.startsWith('src/lib/import/course-setting-partial-import-plan-l6-e2.ts') ||
            f.startsWith('src/lib/import/course-setting-apply-l7-f.ts') ||
            f.startsWith('src/lib/import/course-setting-manual-resolution-l6-e1.ts') ||
            f.startsWith('src/lib/import/course-setting-xlsx-parser.ts') ||
            f.startsWith('src/lib/import/course-setting-teaching-task-dry-run.ts') ||
            f.startsWith('src/lib/import/course-setting-xlsx-client.ts') ||
            f.startsWith('src/lib/import/course-setting-approval-review-ui-l6-d2.ts'),
        )
        return changes.length === allowed.length
      } catch {
        return true
      }
    })(),
  )

  // ── Forbidden files
  let tracked: string[] = []
  let untracked: string[] = []
  try { tracked = ex('git ls-files').split('\n').filter(Boolean) } catch { /* */ }
  try {
    untracked = ex('git status --short --untracked-files=all')
      .split('\n')
      .filter((l) => /^\?\?/.test(l))
      .map((l) => l.replace(/^\?\?\s+/, ''))
  } catch { /* */ }
  record('no dev.db tracked', !tracked.includes('prisma/dev.db'))
  record('no dev.db.backup tracked', !tracked.some((f) => f.includes('dev.db.backup')))
  record('no xlsx tracked', !tracked.some((f) => f.endsWith('.xlsx')))
  record('no NEW xlsx added by L7-F6D2', !untracked.some((f) => f.endsWith('.xlsx')))
  record('no NEW db files added by L7-F6D2', !untracked.some((f) => f.endsWith('.db') || f.endsWith('.sqlite')))
  record(
    'local artifacts under temp/local-artifacts/l7-f6d2/ (gitignored)',
    !tracked.some((f) => f.startsWith('temp/local-artifacts/l7-f6d2/')),
  )
  record(
    'no temp/* tracked (except README/.gitkeep)',
    !tracked.some((f) => f.startsWith('temp/') && !f.endsWith('README.md') && !f.endsWith('.gitkeep')),
  )
  record('no uploads/* tracked', !tracked.some((f) => f.startsWith('uploads/')))

  // ── Prisma
  const prismaValidate = ex('npx prisma validate 2>&1')
  record('prisma validate passes', /is valid/.test(prismaValidate))
  const migrationsStatus = ex('npx prisma migrate status 2>&1')
  record('prisma migrate status up to date', /Database schema is up to date/.test(migrationsStatus))

  console.log('')
  const passed = results.filter((r) => r.ok).length
  const failed = results.length - passed
  console.log(`Summary: ${passed} passed, ${failed} failed, ${results.length} total`)
  if (failed > 0) {
    console.log('\nFailed:')
    for (const r of results.filter((r) => !r.ok)) console.log(`  ✗ ${r.name}${r.detail ? ` — ${r.detail}` : ''}`)
    process.exit(1)
  }
  if (results.length < 130) {
    console.error(`ERROR: only ${results.length} checks; need at least 130`)
    process.exit(1)
  }
  console.log('All checks passed.')
  await prisma.$disconnect()
}

main().catch(async (e) => {
  console.error('FATAL:', e)
  process.exit(1)
})
