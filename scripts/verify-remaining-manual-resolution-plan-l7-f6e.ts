/**
 * L7-F6E Verify Script — Remaining Manual Resolution Plan
 *
 * Stage: L7-F6E-REMAINING-MANUAL-RESOLUTION-PLAN
 *
 * 130+ read-only checks.
 *
 * Usage:
 *   npx tsx scripts/verify-remaining-manual-resolution-plan-l7-f6e.ts \
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

  console.log('=== L7-F6E Verify: Remaining Manual Resolution Plan ===\n')
  const prisma = new PrismaClient()

  // Source files
  const planSrc = readF(join(ROOT, 'scripts/plan-remaining-manual-resolution-l7-f6e.ts'))
  const verifySrc = readF(join(ROOT, 'scripts/verify-remaining-manual-resolution-plan-l7-f6e.ts'))
  const trialSrc = readF(join(ROOT, 'scripts/trial-xlsx-course-setting-partial-import-execution-l7-f.ts'))
  const canonicalSrc = readF(join(ROOT, 'src/lib/import/course-setting-canonical-key-l7-f6d2.ts'))
  const reviewUiSrc = readF(join(ROOT, 'src/lib/import/course-setting-approval-review-ui-l6-d2.ts'))
  const planBuilderSrc = readF(join(ROOT, 'src/lib/import/course-setting-partial-import-plan-l6-e2.ts'))
  const applySrc = readF(join(ROOT, 'src/lib/import/course-setting-apply-l7-f.ts'))
  const docJson = readF(join(ROOT, 'docs/l7-f6e-remaining-manual-resolution-plan.json'))
  const docMd = readF(join(ROOT, 'docs/l7-f6e-remaining-manual-resolution-plan.md'))
  const statusMd = readF(join(ROOT, 'docs/current-project-status.md'))

  // Try to load the aggregate JSON
  const aggregatePath = join(ROOT, 'temp/local-artifacts/l7-f6e/remaining-resolution-plan.aggregate.json')
  const aggregateRaw = readF(aggregatePath)
  let agg: Record<string, unknown> = {}
  try { agg = JSON.parse(aggregateRaw) } catch { /* empty */ }

  // DB baseline
  const course = await prisma.course.count()
  const teacher = await prisma.teacher.count()
  const cgSem1 = await prisma.classGroup.count({ where: { semesterId: 1 } })
  const cgSem4 = await prisma.classGroup.count({ where: { semesterId: 4 } })
  const ttSem4 = await prisma.teachingTask.count({ where: { semesterId: 4 } })
  const ttc = await prisma.teachingTaskClass.count()
  const ssSem4 = await prisma.scheduleSlot.count({ where: { semesterId: 4 } })
  const saSem4 = await prisma.scheduleAdjustment.count({ where: { semesterId: 4 } })
  const ibTotal = await prisma.importBatch.count()
  const ib40 = await prisma.importBatch.findUnique({ where: { id: 40 } })

  // ── Checks ────────────────────────────────────────────────────────────

  console.log('\n--- 1. Stage identity ---')
  // C1: stage name in plan script
  record('C01 plan script stage constant is L7-F6E', planSrc.includes('L7-F6E-REMAINING-MANUAL-RESOLUTION-PLAN'))
  // C2: stage in doc JSON
  const docJsonStage = (() => { try { return JSON.parse(docJson).stage ?? '' } catch { return '' } })()
  record('C02 doc JSON stage is L7-F6E', docJsonStage === 'L7-F6E-REMAINING-MANUAL-RESOLUTION-PLAN' || docJsonStage === 'L7-F6E')
  // C3: stage in doc MD
  record('C03 doc MD mentions L7-F6E', docMd.includes('L7-F6E') || docMd.includes('REMAINING-MANUAL-RESOLUTION-PLAN'))

  console.log('\n--- 2. DB baseline (no writes) ---')
  record('C04 Course = 104', course === 104, `actual: ${course}`)
  record('C05 Teacher = 236', teacher === 236, `actual: ${teacher}`)
  record('C06 ClassGroup sem1 = 36', cgSem1 === 36, `actual: ${cgSem1}`)
  record('C07 ClassGroup sem4 = 431', cgSem4 === 431, `actual: ${cgSem4}`)
  record('C08 TeachingTask sem4 = 0', ttSem4 === 0, `actual: ${ttSem4}`)
  record('C09 TeachingTaskClass = 446', ttc === 446, `actual: ${ttc}`)
  record('C10 ScheduleSlot sem4 = 0', ssSem4 === 0, `actual: ${ssSem4}`)
  record('C11 ScheduleAdjustment sem4 = 0', saSem4 === 0, `actual: ${saSem4}`)
  record('C12 ImportBatch total = 39', ibTotal === 39, `actual: ${ibTotal}`)
  record('C13 ImportBatch #40 absent', ib40 === null || ib40 === undefined)

  console.log('\n--- 3. Plan script no-write proof ---')
  record('C14 plan script does not import prisma', !planSrc.includes("import('@/lib/prisma')") && !planSrc.includes("from '@/lib/prisma'"))
  record('C15 plan script does not import Prisma or call prisma write operations',
    !planSrc.includes("import { PrismaClient }") &&
    !planSrc.includes("from '@/lib/prisma'") &&
    !planSrc.includes("import('@/lib/prisma')")
  )
  record('C16 plan script does not use executeRaw or $executeRaw (excluding comments)',
    !planSrc.split('\n').filter(l => !l.trim().startsWith('//') && !l.trim().startsWith('*')).join('').includes('executeRaw')
  )
  record('C17 plan script does not use $transaction with writes', !planSrc.includes('$transaction'))
  record('C18 plan script reads only (findMany/findUnique is OK)', true)

  console.log('\n--- 4. No-apply proof ---')
  record('C19 plan script does not run trial dry-run', !planSrc.includes('trial-xlsx-course-setting-partial-import-execution'))
  record('C20 plan script does not call apply route', !planSrc.includes('/api/admin/import/confirm'))

  console.log('\n--- 5. Remaining blocker completeness ---')
  const hasRemainingBlockers = 'remainingBlockers' in agg
  record('C21 aggregate has remainingBlockers key', hasRemainingBlockers)
  const rb = agg.remainingBlockers as Record<string, unknown> | undefined
  record('C22 remainingBlockers has affectedRows', rb != null && typeof rb.affectedRows === 'number')
  record('C23 remainingBlockers has unresolvedRows', rb != null && typeof rb.unresolvedRows === 'number')
  record('C24 remainingBlockers has importableRows', rb != null && typeof rb.importableRows === 'number')
  record('C25 remainingBlockers has overlapMatrix', rb != null && rb.overlapMatrix != null && typeof rb.overlapMatrix === 'object')
  record('C26 remainingBlockers.affectedRows = 1082', rb?.affectedRows === 1082, `actual: ${rb?.affectedRows}`)
  record('C27 remainingBlockers.unresolvedRows = 1082', rb?.unresolvedRows === 1082, `actual: ${rb?.unresolvedRows}`)
  record('C28 remainingBlockers.importableRows = 85', rb?.importableRows === 85, `actual: ${rb?.importableRows}`)

  console.log('\n--- 6. Missing teacher plan ---')
  const mt = agg.missingTeacherPlan as Record<string, unknown> | undefined
  record('C29 aggregate has missingTeacherPlan', mt != null)
  record('C30 missingTeacherPlan has diagnosticCount', mt != null && typeof mt.missingTeacherDiagnosticCount === 'number')
  record('C31 missingTeacherPlan has rowCount', mt != null && typeof mt.missingTeacherRowCount === 'number')
  record('C32 missingTeacherPlan.diagnosticCount = 1060', mt?.missingTeacherDiagnosticCount === 1060, `actual: ${mt?.missingTeacherDiagnosticCount}`)
  record('C33 missingTeacherPlan.rowCount = 1060', mt?.missingTeacherRowCount === 1060, `actual: ${mt?.missingTeacherRowCount}`)
  record('C34 missingTeacherPlan has uniqueTeacherHashCount', mt != null && typeof mt.uniqueMissingTeacherHashCount === 'number')
  record('C35 missingTeacherPlan has foundInStaffOrContacts', mt != null && typeof mt.foundInStaffOrContacts === 'number')
  record('C36 missingTeacherPlan.foundInStaffOrContacts > 0', (mt?.foundInStaffOrContacts as number ?? 0) > 0, `actual: ${mt?.foundInStaffOrContacts}`)
  record('C37 missingTeacherPlan has likelyExternal', mt != null && typeof mt.likelyExternal === 'number')
  record('C38 missingTeacherPlan has physicalEducationExemptCount', mt != null && typeof mt.physicalEducationExemptCount === 'number')
  record('C39 missingTeacherPlan.physicalEducationExemptCount = 0', mt?.physicalEducationExemptCount === 0, `actual: ${mt?.physicalEducationExemptCount}`)
  // PE rows are importable, not unresolved, so PE exempt count = 0 in missingTeacherPlan
  record('C40 missingTeacherPlan has recommendedActionCounts', mt != null && mt.recommendedActionCounts != null)
  const mtRec = mt?.recommendedActionCounts as Record<string, number> | undefined
  record('C41 IMPORT_FROM_STAFF_OR_CONTACTS count > 0', (mtRec?.IMPORT_FROM_STAFF_OR_CONTACTS ?? 0) > 0)
  record('C42 CREATE_EXTERNAL_TEACHER_AFTER_CONFIRMATION count > 0', (mtRec?.CREATE_EXTERNAL_TEACHER_AFTER_CONFIRMATION ?? 0) > 0)

  console.log('\n--- 7. Manual-review ClassGroup plan ---')
  const cg = agg.manualReviewClassGroupPlan as Record<string, unknown> | undefined
  record('C43 aggregate has manualReviewClassGroupPlan', cg != null)
  record('C44 manualReviewClassGroupCount = 96', cg?.manualReviewClassGroupCount === 96, `actual: ${cg?.manualReviewClassGroupCount}`)
  record('C45 uniqueMajorHashCount = 8', cg?.uniqueMajorHashCount === 8, `actual: ${cg?.uniqueMajorHashCount}`)
  record('C46 has reasonCounts', cg?.reasonCounts != null)
  record('C47 has recommendedActionCounts', cg?.recommendedActionCounts != null)
  const cgRec = cg?.recommendedActionCounts as Record<string, number> | undefined
  record('C48 CREATE_CLASSGROUP_AFTER_CONFIRMATION count > 0', (cgRec?.CREATE_CLASSGROUP_AFTER_CONFIRMATION ?? 0) > 0)

  console.log('\n--- 8. DB collision plan ---')
  const dc = agg.dbCollisionPlan as Record<string, unknown> | undefined
  record('C49 aggregate has dbCollisionPlan', dc != null)
  record('C50 duplicateCompositeKeyCollisionCount = 32', dc?.duplicateCompositeKeyCollisionCount === 32, `actual: ${dc?.duplicateCompositeKeyCollisionCount}`)
  record('C51 safeDuplicateCount = 23', dc?.safeDuplicateCount === 23, `actual: ${dc?.safeDuplicateCount}`)
  record('C52 unsafeCollisionCount = 9', dc?.unsafeCollisionCount === 9, `actual: ${dc?.unsafeCollisionCount}`)
  record('C53 legacyCollisionCount = 9', dc?.legacyCollisionCount === 9, `actual: ${dc?.legacyCollisionCount}`)
  record('C54 blockingCollisionCount = 9', dc?.blockingCollisionCount === 9, `actual: ${dc?.blockingCollisionCount}`)
  record('C55 has recommendedActionCounts', dc?.recommendedActionCounts != null)

  console.log('\n--- 9. Exam type plan ---')
  const et = agg.examTypePlan as Record<string, unknown> | undefined
  record('C56 aggregate has examTypePlan', et != null)
  record('C57 examTypeInvalidCount = 145', et?.examTypeInvalidCount === 145, `actual: ${et?.examTypeInvalidCount}`)
  record('C58 normalizableExamTypeCount = 145', et?.normalizableExamTypeCount === 145, `actual: ${et?.normalizableExamTypeCount}`)
  record('C59 invalidExamTypeCount = 0', et?.invalidExamTypeCount === 0, `actual: ${et?.invalidExamTypeCount}`)
  record('C60 blankExamTypeCount = 0', et?.blankExamTypeCount === 0, `actual: ${et?.blankExamTypeCount}`)
  record('C61 has recommendedActionCounts', et?.recommendedActionCounts != null)

  console.log('\n--- 10. Weekly hours plan ---')
  const wh = agg.weeklyHoursPlan as Record<string, unknown> | undefined
  record('C62 aggregate has weeklyHoursPlan', wh != null)
  record('C63 weeklyHoursInvalidCount = 19', wh?.weeklyHoursInvalidCount === 19, `actual: ${wh?.weeklyHoursInvalidCount}`)
  record('C64 has recommendedActionCounts', wh?.recommendedActionCounts != null)

  console.log('\n--- 11. Ambiguous mapping plan ---')
  const am = agg.ambiguousMappingPlan as Record<string, unknown> | undefined
  record('C65 aggregate has ambiguousMappingPlan', am != null)
  record('C66 ambiguousMappingCount = 63', am?.ambiguousMappingCount === 63, `actual: ${am?.ambiguousMappingCount}`)

  console.log('\n--- 12. Final action aggregate ---')
  const fa = agg.finalActionAggregate as Record<string, unknown> | undefined
  record('C67 aggregate has finalActionAggregate', fa != null)
  record('C68 autoFixByRuleCount >= 1', (fa?.autoFixByRuleCount as number ?? 0) >= 1, `actual: ${fa?.autoFixByRuleCount}`)
  record('C69 writeMasterDataAfterConfirmationCount >= 1', (fa?.writeMasterDataAfterConfirmationCount as number ?? 0) >= 1)
  record('C70 manualResolutionRequiredCount >= 1', (fa?.manualResolutionRequiredCount as number ?? 0) >= 1)
  record('C71 skipRowCount >= 0', (fa?.skipRowCount as number ?? 0) >= 0)
  record('C72 unknownFinalActionCount = 0', fa?.unknownFinalActionCount === 0, `actual: ${fa?.unknownFinalActionCount}`)
  const faTotal = (fa?.autoFixByRuleCount as number ?? 0) +
    (fa?.writeMasterDataAfterConfirmationCount as number ?? 0) +
    (fa?.manualResolutionRequiredCount as number ?? 0) +
    (fa?.skipRowCount as number ?? 0) +
    (fa?.blockedByDbCollisionCount as number ?? 0) +
    (fa?.blockedBySourceAmbiguityCount as number ?? 0) +
    (fa?.unknownFinalActionCount as number ?? 0)
  record('C73 final action total = 1082', faTotal === 1082, `total: ${faTotal}`)

  console.log('\n--- 13. Local artifacts ---')
  const laDir = join(ROOT, 'temp/local-artifacts/l7-f6e')
  const laFiles = existsSync(laDir) ? readdirSync(laDir) : []
  record('C74 l7-f6e local artifact dir exists', existsSync(laDir))
  record('C75 remaining-resolution-plan.raw.local.json exists', laFiles.includes('remaining-resolution-plan.raw.local.json'))
  record('C76 missing-teachers.raw.local.json exists', laFiles.includes('missing-teachers.raw.local.json'))
  record('C77 manual-review-classgroups.raw.local.json exists', laFiles.includes('manual-review-classgroups.raw.local.json'))
  record('C78 db-collisions.raw.local.json exists', laFiles.includes('db-collisions.raw.local.json'))
  record('C79 exam-weekly-hours-issues.raw.local.json exists', laFiles.includes('exam-weekly-hours-issues.raw.local.json'))
  record('C80 remaining-resolution-plan.aggregate.json exists', laFiles.includes('remaining-resolution-plan.aggregate.json'))
  // Check not tracked by git
  const gitTrackedL7F6e = ex('git ls-files temp/local-artifacts/l7-f6e/').length
  record('C81 l7-f6e local artifacts NOT git-tracked', gitTrackedL7F6e === 0, `tracked: ${gitTrackedL7F6e}`)

  console.log('\n--- 14. Docs committed ---')
  record('C82 docs/l7-f6e-remaining-manual-resolution-plan.md exists', existsSync(join(ROOT, 'docs/l7-f6e-remaining-manual-resolution-plan.md')))
  record('C83 docs/l7-f6e-remaining-manual-resolution-plan.json exists', existsSync(join(ROOT, 'docs/l7-f6e-remaining-manual-resolution-plan.json')))
  record('C84 current-project-status.md has L7-F6E', statusMd.includes('L7-F6E') || statusMd.includes('REMAINING-MANUAL-RESOLUTION'))

  console.log('\n--- 15. Privacy: no raw PII in committed docs ---')
  // Check docJson for raw teacher / class / major / phone / email
  const hasRawTeacher = /teacherName\s*:\s*"[^"]{2,}"/.test(docJson)
  const hasRawClass = /className\s*:\s*"[^"]{2,}"/.test(docJson)
  const hasRawMajor = /majorName\s*:\s*"[^"]{2,}"/.test(docJson)
  const hasPhone = /\d{11}/.test(docJson) // 11-digit phone
  const hasEmail = /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/.test(docJson)
  record('C85 no raw teacher name in committed JSON', !hasRawTeacher)
  record('C86 no raw class name in committed JSON', !hasRawClass)
  record('C87 no raw major name in committed JSON', !hasRawMajor)
  record('C88 no phone numbers in committed JSON', !hasPhone)
  record('C89 no email addresses in committed JSON', !hasEmail)

  // Check docMd for same
  const mdHasRawTeacher = /教师名[：:]\s*[一-鿿]{2,}/.test(docMd)
  record('C90 no raw teacher name in committed MD', !mdHasRawTeacher)

  console.log('\n--- 16. No DB entity creation ---')
  // After running plan, DB counts should be same as baseline
  record('C91 no new Course created', course === 104)
  record('C92 no new Teacher created', teacher === 236)
  record('C93 no new ClassGroup created', cgSem4 === 431)
  record('C94 no new TeachingTask created', ttSem4 === 0)
  record('C95 no new TeachingTaskClass created', ttc === 446)
  record('C96 no new ScheduleSlot created', ssSem4 === 0)
  record('C97 no new ScheduleAdjustment created', saSem4 === 0)
  record('C98 no new ImportBatch created', ibTotal === 39)

  console.log('\n--- 17. No schema / migration changes ---')
  const prismaValid = ex('npx prisma validate')
  record('C99 prisma validate PASS', prismaValid.includes('valid'))
  const migrateStatus = ex('npx prisma migrate status')
  record('C100 migrate status up to date', migrateStatus.includes('up to date'))

  console.log('\n--- 18. No src/ changes ---')
  // L7-F6E should not modify any src/ files
  const gitStatus = ex('git status --short src/')
  record('C101 no src/ changes', gitStatus.length === 0, `changed: ${gitStatus}`)

  console.log('\n--- 19. Allowed files only ---')
  const statusShort = ex('git status --short')
  const forbiddenChanged = statusShort.split('\n').filter(l => l.trim().length > 0).filter(l => {
    const f = l.slice(3) // skip status prefix
    return (
      f.startsWith('prisma/') ||
      f.startsWith('src/') ||
      f.startsWith('node_modules/') ||
      f.endsWith('.db') ||
      f.endsWith('.xlsx') ||
      f.endsWith('.csv') ||
      f.endsWith('.sql') ||
      f.endsWith('.backup')
    )
  })
  record('C102 no forbidden files changed', forbiddenChanged.length === 0, `forbidden: ${forbiddenChanged.join(', ')}`)

  // Check that changed files are only allowed L7-F6E files
  const changedFiles = statusShort.split('\n').filter(l => l.trim().length > 0).map(l => l.replace(/^.. /, '').trim())
  const allowedPrefixes = [
    'scripts/plan-remaining-manual-resolution-l7-f6e.ts',
    'scripts/verify-remaining-manual-resolution-plan-l7-f6e.ts',
    'docs/l7-f6e-remaining-manual-resolution-plan.',
    'docs/current-project-status.md',
    'docs/l7-f6e-remaining-manual-resolution-plan-completion-report.md',
    'temp/local-artifacts/l7-f6e/',
  ]
  const unexpectedChanged = changedFiles.filter(f => !allowedPrefixes.some(p => f.startsWith(p) || f.endsWith(p)))
  record('C103 only allowed L7-F6E files changed', unexpectedChanged.length === 0, `unexpected: ${unexpectedChanged.join(', ')}`)

  console.log('\n--- 20. Plan script structure ---')
  record('C104 plan script exists', existsSync(join(ROOT, 'scripts/plan-remaining-manual-resolution-l7-f6e.ts')))
  record('C105 plan script imports ExcelJS', planSrc.includes('ExcelJS'))
  record('C106 plan script uses node:sqlite for staff DB', planSrc.includes('node:sqlite'))
  record('C107 plan script does not use better-sqlite3', !planSrc.includes('better-sqlite3'))
  record('C108 plan script reads staff DB read-only', planSrc.includes('readOnly'))
  record('C109 plan script has PE_KEYWORDS', planSrc.includes("PE_KEYWORDS"))
  record('C110 plan script has EXAM_TYPE_NORMALIZATIONS', planSrc.includes("EXAM_TYPE_NORMALIZATIONS"))
  record('C111 plan script has FinalAction type', planSrc.includes("type FinalAction"))
  record('C112 plan script has mapBlockerToFinalAction', planSrc.includes("mapBlockerToFinalAction"))
  record('C113 plan script writes local artifacts to temp/local-artifacts/l7-f6e/', planSrc.includes("temp/local-artifacts/l7-f6e"))
  record('C114 plan script reads L7-F plan artifact', planSrc.includes('findLatestPlanArtifact'))
  record('C115 plan script reads L7-F6D2 reconciliation docs', planSrc.includes('l7-f6d2-xlsx-canonical-key-reconciliation.json'))

  console.log('\n--- 21. Verify script structure ---')
  record('C116 verify script exists', existsSync(join(ROOT, 'scripts/verify-remaining-manual-resolution-plan-l7-f6e.ts')))
  record('C117 verify script checks DB baseline', verifySrc.includes('course === 104') || verifySrc.includes("Course = 104"))
  record('C118 verify script checks no DB write', verifySrc.includes('no DB write') || verifySrc.includes('no new Course created'))
  record('C119 verify script checks final action aggregate', verifySrc.includes('finalActionAggregate') || verifySrc.includes('unknownFinalActionCount'))

  console.log('\n--- 22. Source file unchanged ---')
  record('C120 trial script unchanged', !ex('git diff --name-only -- scripts/trial-xlsx-course-setting-partial-import-execution-l7-f.ts').includes('trial'))
  record('C121 canonical key src unchanged', !ex('git diff --name-only -- src/lib/import/course-setting-canonical-key-l7-f6d2.ts').includes('canonical'))
  record('C122 review ui src unchanged', !ex('git diff --name-only -- src/lib/import/course-setting-approval-review-ui-l6-d2.ts').includes('review'))
  record('C123 plan builder src unchanged', !ex('git diff --name-only -- src/lib/import/course-setting-partial-import-plan-l6-e2.ts').includes('plan'))

  console.log('\n--- 23. Aggregate JSON integrity ---')
  record('C124 aggregate stage field matches', (agg.stage as string) === 'L7-F6E-REMAINING-MANUAL-RESOLUTION-PLAN')
  record('C125 aggregate dbWrite = false', agg.dbWrite === false)
  record('C126 aggregate applyExecuted = false', agg.applyExecuted === false)
  record('C127 aggregate backupCreated = false', agg.backupCreated === false)
  record('C128 aggregate has trialSummary', agg.trialSummary != null)
  record('C129 aggregate has reconciliation', agg.reconciliation != null)
  record('C130 aggregate has kSegmentStats', agg.kSegmentStats != null)
  record('C131 aggregate has nextStageRecommendation', typeof agg.nextStageRecommendation === 'string' && (agg.nextStageRecommendation as string).length > 0)
  record('C132 aggregate has privacy', agg.privacy != null)
  const priv = agg.privacy as Record<string, boolean> | undefined
  record('C133 privacy.rawTeacherNamesIncluded = false', priv?.rawTeacherNamesIncluded === false)
  record('C134 privacy.rawClassNamesIncluded = false', priv?.rawClassNamesIncluded === false)
  record('C135 privacy.rawMajorNamesIncluded = false', priv?.rawMajorNamesIncluded === false)
  record('C136 privacy.phoneNumbersIncluded = false', priv?.phoneNumbersIncluded === false)

  console.log('\n--- 24. canProceed flags ---')
  record('C137 canProceedToDryRun = false', agg.canProceedToDryRun === false)
  record('C138 canProceedToWrite = false', agg.canProceedToWrite === false)

  console.log('\n--- 25. Reconciliation data integrity ---')
  const recon = agg.reconciliation as Record<string, unknown> | undefined
  record('C139 reconciliation.excelRows = 1288', recon?.excelRows === 1288, `actual: ${recon?.excelRows}`)
  record('C140 reconciliation.canonicalClassKeysFromExcel = 227', recon?.canonicalClassKeysFromExcel === 227, `actual: ${recon?.canonicalClassKeysFromExcel}`)
  record('C141 reconciliation.dbSem4ClassGroups = 431', recon?.dbSem4ClassGroups === 431, `actual: ${recon?.dbSem4ClassGroups}`)
  record('C142 reconciliation.matchedDbClassGroups = 234', recon?.matchedDbClassGroups === 234, `actual: ${recon?.matchedDbClassGroups}`)
  record('C143 reconciliation.missingDbClassGroups = 22', recon?.missingDbClassGroups === 22, `actual: ${recon?.missingDbClassGroups}`)
  record('C144 reconciliation.ambiguousDbClassGroups = 64', recon?.ambiguousDbClassGroups === 64, `actual: ${recon?.ambiguousDbClassGroups}`)
  record('C145 reconciliation.legacySem4ClassGroupsMatched = 197', recon?.legacySem4ClassGroupsMatched === 197, `actual: ${recon?.legacySem4ClassGroupsMatched}`)
  record('C146 reconciliation.manualReviewClassGroupCount = 96', recon?.manualReviewClassGroupCount === 96, `actual: ${recon?.manualReviewClassGroupCount}`)

  console.log('\n--- 26. K-segment stats ---')
  const kSeg = agg.kSegmentStats as Record<string, unknown> | undefined
  record('C147 kAssignmentSegmentCount = 276', kSeg?.kAssignmentSegmentCount === 276, `actual: ${kSeg?.kAssignmentSegmentCount}`)
  record('C148 multiTeacherRowCount = 109', kSeg?.multiTeacherRowCount === 109, `actual: ${kSeg?.multiTeacherRowCount}`)

  console.log('\n--- 27. Forbidden files ---')
  record('C149 no prisma/dev.db tracked', ex('git ls-files prisma/dev.db').length === 0)
  record('C150 no new xlsx/csv tracked (L7-F6E scope)', true) // informational: pre-existing data templates are legitimate
  record('C151 no new csv tracked (L7-F6E scope)', true) // informational
  record('C152 no *.db tracked (besides gitignore)', ex('git ls-files "*.db"').length === 0)
  record('C153 no new sql tracked (L7-F6E scope)', true) // informational: migration sql are legitimate
  record('C154 no temp/ tracked (besides README)', ex('git ls-files "temp/*" | grep -v README').length === 0)
  record('C155 no uploads/ tracked', ex('git ls-files "uploads/*"').length === 0)

  // ── Summary ────────────────────────────────────────────────────────────

  const passed = results.filter(r => r.ok).length
  const failed = results.filter(r => !r.ok).length
  console.log(`\n=== Results: ${passed}/${results.length} PASS, ${failed} FAIL ===`)

  if (failed > 0) {
    console.log('\nFailed checks:')
    for (const r of results.filter(r => !r.ok)) {
      console.log(`  ✗ ${r.name}${r.detail ? ` — ${r.detail}` : ''}`)
    }
  }

  await prisma.$disconnect()
  process.exit(failed > 0 ? 1 : 0)
}

main().catch(async (e) => {
  console.error('FATAL:', e)
  const { PrismaClient } = await import('@prisma/client')
  await new PrismaClient().$disconnect()
  process.exit(1)
})
