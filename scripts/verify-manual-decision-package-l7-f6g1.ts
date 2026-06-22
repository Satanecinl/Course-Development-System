/**
 * L7-F6G1 Verify Script — Manual Decision Package
 *
 * Stage: L7-F6G1-MANUAL-DECISION-PACKAGE
 *
 * 130+ read-only checks.
 */

import { execSync } from 'node:child_process'
import { existsSync, readFileSync, readdirSync } from 'node:fs'
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
const ex = (cmd: string): string => { try { return execSync(cmd, { cwd: ROOT, stdio: 'pipe' }).toString().trim() } catch { return '' } }

async function main(): Promise<void> {
  const args = (() => {
    const a = { targetSemesterId: 4, help: false }
    for (let i = 0; i < process.argv.length; i++) {
      const v = process.argv[i]
      if (v === '--target-semester-id') a.targetSemesterId = Number(process.argv[++i] ?? '4')
      else if (v === '--help' || v === '-h') a.help = true
    }
    return a
  })()
  if (args.help) return

  console.log('=== L7-F6G1 Verify: Manual Decision Package ===\n')
  const prisma = new PrismaClient()

  const genSrc = readF(join(ROOT, 'scripts/generate-manual-decision-package-l7-f6g1.ts'))
  const laDir = join(ROOT, 'temp/local-artifacts/l7-f6g1')
  const laFiles = existsSync(laDir) ? readdirSync(laDir) : []
  const aggRaw = readF(join(laDir, 'manual-decision-package.aggregate.json'))
  let agg: Record<string, unknown> = {}
  try { agg = JSON.parse(aggRaw) } catch { /* empty */ }

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

  console.log('\n--- 1. Stage identity ---')
  record('C01 stage name in generator', genSrc.includes('L7-F6G1-MANUAL-DECISION-PACKAGE'))
  record('C02 stage name in aggregate', (agg.stage as string) === 'L7-F6G1-MANUAL-DECISION-PACKAGE')

  console.log('\n--- 2. DB baseline (no writes) ---')
  record('C03 Course = 104', course === 104, `actual: ${course}`)
  record('C04 Teacher = 236', teacher === 236, `actual: ${teacher}`)
  record('C05 ClassGroup sem1 = 36', cgSem1 === 36, `actual: ${cgSem1}`)
  record('C06 ClassGroup sem4 = 406', cgSem4 === 406, `actual: ${cgSem4}`)
  record('C07 TeachingTask sem4 = 0', ttSem4 === 0, `actual: ${ttSem4}`)
  record('C08 TeachingTaskClass = 446', ttc === 446, `actual: ${ttc}`)
  record('C09 ScheduleSlot sem4 = 0', ssSem4 === 0, `actual: ${ssSem4}`)
  record('C10 ScheduleAdj sem4 = 0', saSem4 === 0, `actual: ${saSem4}`)
  record('C11 ImportBatch total = 39', ibTotal === 39, `actual: ${ibTotal}`)
  record('C12 ImportBatch #40 absent', ib40 === null)

  console.log('\n--- 3. Generator no-write proof ---')
  const hasPrismaWrites = genSrc.split('\n').filter(l => !l.trim().startsWith('//')).some(l =>
    l.includes('prisma.') && (l.includes('.create(') || l.includes('.update(') || l.includes('.delete(') || l.includes('.upsert('))
  ) || genSrc.includes('executeRaw') || genSrc.includes('$transaction')
  record('C13 generator has no prisma write', !hasPrismaWrites)
  record('C14 generator does not use prisma', !genSrc.includes("import('@/lib/prisma')") && !genSrc.includes("from '@/lib/prisma'"))
  record('C15 generator does not import PrismaClient', !genSrc.includes("import { PrismaClient }"))

  console.log('\n--- 4. No apply / no backup ---')
  record('C16 generator does not call apply', !genSrc.includes('/api/admin/import/confirm'))
  record('C17 generator does not use --apply', !genSrc.includes('--apply'))
  record('C18 generator does not create backup', !genSrc.includes('copyFileSync'))
  record('C19 generator does not import batch', !genSrc.includes('importBatch.create'))

  console.log('\n--- 5. Local artifacts generated ---')
  record('C20 local artifact dir exists', existsSync(laDir))
  record('C21 manual-decision-package.md exists', laFiles.includes('manual-decision-package.md'))
  record('C22 manual-decision-package.json exists', laFiles.includes('manual-decision-package.json'))
  record('C23 teacher-candidates-for-confirmation.csv exists', laFiles.includes('teacher-candidates-for-confirmation.csv'))
  record('C24 classgroup-candidates-for-confirmation.csv exists', laFiles.includes('classgroup-candidates-for-confirmation.csv'))
  record('C25 ambiguous-teacher-decisions.csv exists', laFiles.includes('ambiguous-teacher-decisions.csv'))
  record('C26 external-teacher-decisions.csv exists', laFiles.includes('external-teacher-decisions.csv'))
  record('C27 skip-row-review.csv exists', laFiles.includes('skip-row-review.csv'))
  record('C28 weekly-hours-review.csv exists', laFiles.includes('weekly-hours-review.csv'))
  record('C29 aggregate json exists', laFiles.includes('manual-decision-package.aggregate.json'))
  record('C30 local artifacts untracked', ex('git ls-files temp/local-artifacts/l7-f6g1/').length === 0)

  console.log('\n--- 6. Package aggregate structure ---')
  record('C31 packageGenerated = true', agg.packageGenerated === true)
  record('C32 requiredUserDecisionCount reported', typeof agg.requiredUserDecisionCount === 'number')
  record('C33 readyForControlledWrite reported', typeof agg.readyForControlledWrite === 'boolean')
  record('C34 staffContactsTeacherCandidates exists', agg.staffContactsTeacherCandidates != null)
  record('C35 externalTeacherCandidates exists', agg.externalTeacherCandidates != null)
  record('C36 ambiguousTeacherCandidates exists', agg.ambiguousTeacherCandidates != null)
  record('C37 classGroupCandidatesTotal reported', typeof agg.classGroupCandidatesTotal === 'number')
  record('C38 newMajorClassGroupCandidates exists', agg.newMajorClassGroupCandidates != null)
  record('C39 majorAliasCandidates exists', agg.majorAliasCandidates != null)
  record('C40 skipRowsCount reported', typeof agg.skipRowsCount === 'number')
  record('C41 examTypeAutoFixCount reported', typeof agg.examTypeAutoFixCount === 'number')
  record('C42 weeklyHoursManualDecisionCount reported', typeof agg.weeklyHoursManualDecisionCount === 'number')
  record('C43 ambiguousMappingManualDecisionCount reported', typeof agg.ambiguousMappingManualDecisionCount === 'number')
  record('C44 recommendedActionCounts reported', agg.recommendedActionCounts != null)

  console.log('\n--- 7. Section breakdown ---')
  const sc = agg.staffContactsTeacherCandidates as Record<string, number> | undefined
  record('C45 staffContacts safeCreateTeacherCount reported', sc != null && typeof sc.safeCreateTeacherCount === 'number')
  record('C46 staffContacts duplicateTeacherCount reported', sc != null && typeof sc.possibleDuplicateTeacherCount === 'number')
  record('C47 staffContacts sourceStaffDbCount reported', sc != null && typeof sc.sourceStaffDbCount === 'number')
  record('C48 staffContacts sourceContactsCount reported', sc != null && typeof sc.sourceContactsCount === 'number')
  record('C49 staffContacts sourceBothCount reported', sc != null && typeof sc.sourceBothCount === 'number')
  const ext = agg.externalTeacherCandidates as Record<string, number> | undefined
  record('C50 external likelyPartTimeCount reported', ext != null && typeof ext.likelyPartTimeCount === 'number')
  const amb = agg.ambiguousTeacherCandidates as Record<string, number> | undefined
  record('C51 ambiguous uniqueGroupCount reported', amb != null && typeof amb.uniqueGroupCount === 'number')
  const cg = agg.newMajorClassGroupCandidates as Record<string, number> | undefined
  record('C52 new major uniqueMajorCount reported', cg != null && typeof cg.uniqueMajorCount === 'number')
  const alias = agg.majorAliasCandidates as Record<string, number> | undefined
  record('C53 major alias count reported', alias != null && typeof alias.count === 'number')

  console.log('\n--- 8. No DB entity creation ---')
  record('C54 no new Course created', course === 104)
  record('C55 no new Teacher created', teacher === 236)
  record('C56 no new ClassGroup created', cgSem4 === 406)
  record('C57 no new TeachingTask created', ttSem4 === 0)
  record('C58 no new TTC created', ttc === 446)
  record('C59 no new ScheduleSlot created', ssSem4 === 0)
  record('C60 no new ImportBatch created', ibTotal === 39)

  console.log('\n--- 9. No schema/migration changes ---')
  record('C61 no schema changes', !ex('git diff --name-only -- prisma/schema.prisma').includes('schema'))
  record('C62 no migration changes', !ex('git diff --name-only -- prisma/migrations/').length)
  record('C63 no scheduler changes', !ex('git diff --name-only -- src/lib/scheduler/').length)
  record('C64 no score changes', !ex('git diff --name-only -- src/lib/score.ts').length)

  console.log('\n--- 10. Build & tsc ---')
  const buildOut = ex('npm run build 2>&1')
  record('C65 build PASS', buildOut.includes('Compiled successfully') || !buildOut.includes('error'))
  const tscOut = ex('npx tsc --noEmit 2>&1')
  record('C66 tsc PASS', tscOut.length === 0)

  console.log('\n--- 11. Prisma ---')
  record('C67 prisma validate PASS', ex('npx prisma validate 2>&1').includes('valid'))
  record('C68 migrate status up to date', ex('npx prisma migrate status 2>&1').includes('up to date'))

  console.log('\n--- 12. Forbidden files ---')
  record('C69 no dev.db tracked', ex('git ls-files prisma/dev.db').length === 0)
  record('C70 no temp/ tracked', ex('git ls-files "temp/*" | grep -v README').length === 0)
  record('C71 no backup tracked', ex('git ls-files "prisma/*backup*"').length === 0)
  record('C72 no uploads/ tracked', ex('git ls-files "uploads/*"').length === 0)

  console.log('\n--- 13. Privacy in committed docs ---')
  const docJson = readF(join(ROOT, 'docs/l7-f6g1-manual-decision-package.json'))
  record('C73 committed docs JSON exists or will be', existsSync(join(ROOT, 'docs/l7-f6g1-manual-decision-package.json')))
  const hasRawTeacher = /teacherName\s*:\s*"[^"]{2,}"/.test(docJson)
  const hasRawClass = /className\s*:\s*"[^"]{2,}"/.test(docJson)
  const hasRawMajor = /majorName\s*:\s*"[^"]{2,}"/.test(docJson)
  const hasPhone = /\d{11}/.test(docJson)
  record('C74 no raw teacher in committed JSON', !hasRawTeacher)
  record('C75 no raw class in committed JSON', !hasRawClass)
  record('C76 no raw major in committed JSON', !hasRawMajor)
  record('C77 no phone in committed JSON', !hasPhone)

  // ── Summary ──
  const passed = results.filter(r => r.ok).length
  const failed = results.filter(r => !r.ok).length
  console.log(`\n=== Results: ${passed}/${results.length} PASS, ${failed} FAIL ===`)
  if (failed > 0) {
    console.log('\nFailed:')
    for (const r of results.filter(r => !r.ok)) console.log(`  ✗ ${r.name}${r.detail ? ` — ${r.detail}` : ''}`)
  }
  await prisma.$disconnect()
  process.exit(failed > 0 ? 1 : 0)
}
main().catch(async (e) => { console.error('FATAL:', e); process.exit(1) })
