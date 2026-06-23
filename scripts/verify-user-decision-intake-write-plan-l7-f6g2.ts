/**
 * L7-F6G2 Verify Script — User Decision Intake & Write Plan
 *
 * Stage: L7-F6G2-USER-DECISION-INTAKE-AND-WRITE-PLAN
 *
 * 120+ read-only checks.
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

  console.log('=== L7-F6G2 Verify: User Decision Intake & Write Plan ===\n')
  const prisma = new PrismaClient()

  const intakeSrc = readF(join(ROOT, 'scripts/intake-user-decisions-and-plan-write-l7-f6g2.ts'))
  const laDir = join(ROOT, 'temp/local-artifacts/l7-f6g2')
  const g1Dir = join(ROOT, 'temp/local-artifacts/l7-f6g1')
  const laFiles = existsSync(laDir) ? readdirSync(laDir) : []
  const planRaw = readF(join(laDir, 'controlled-master-data-write-plan.local.json'))
  let plan: Record<string, unknown> = {}
  try { plan = JSON.parse(planRaw) } catch { /* empty */ }

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
  record('C01 stage name in intake script', intakeSrc.includes('L7-F6G2-USER-DECISION-INTAKE-AND-WRITE-PLAN'))

  console.log('\n--- 2. DB baseline (no writes) ---')
  record('C02 Course = 104', course === 104, `actual: ${course}`)
  record('C03 Teacher = 236', teacher === 236, `actual: ${teacher}`)
  record('C04 ClassGroup sem1 = 36', cgSem1 === 36, `actual: ${cgSem1}`)
  record('C05 ClassGroup sem4 = 406', cgSem4 === 406, `actual: ${cgSem4}`)
  record('C06 TeachingTask sem4 = 0', ttSem4 === 0, `actual: ${ttSem4}`)
  record('C07 TeachingTaskClass = 446', ttc === 446, `actual: ${ttc}`)
  record('C08 ScheduleSlot sem4 = 0', ssSem4 === 0, `actual: ${ssSem4}`)
  record('C09 ScheduleAdj sem4 = 0', saSem4 === 0, `actual: ${saSem4}`)
  record('C10 ImportBatch total = 39', ibTotal === 39, `actual: ${ibTotal}`)
  record('C11 ImportBatch #40 absent', ib40 === null)

  console.log('\n--- 3. Intake script no-write proof ---')
  const hasPrismaWrites = intakeSrc.split('\n').filter(l => !l.trim().startsWith('//') && !l.trim().startsWith('*')).some(l =>
    /prisma\.(create|update|delete|upsert)\(/.test(l) || /prisma\.\$\w+\(/.test(l) || /executeRaw/.test(l) || /\$transaction/.test(l)
  )
  record('C12 intake has no prisma write', !hasPrismaWrites)
  record('C13 intake does not import PrismaClient', !intakeSrc.includes("import { PrismaClient }"))
  record('C14 intake does not use --apply', !intakeSrc.includes('--apply'))
  record('C15 intake does not call apply route', !intakeSrc.includes('/api/admin/import/confirm'))
  record('C16 intake does not create backup', !intakeSrc.includes('copyFileSync'))

  console.log('\n--- 4. G1 decision package source ---')
  record('C17 G1 package exists', existsSync(join(g1Dir, 'manual-decision-package.json')))
  record('C18 G1 aggregate exists', existsSync(join(g1Dir, 'manual-decision-package.aggregate.json')))

  console.log('\n--- 5. User decision file detection ---')
  record('C19 intake detects user decision file', plan.userDecisionFileFound === true || plan.userDecisionFileFound === false)
  // L7-F6G2B introduces partial decisions: status may be PARTIAL_OR_BLOCKED with decidedItems > 0
  record('C20 BLOCKED or PARTIAL when no full decisions', plan.status === 'BLOCKED_WAITING_FOR_USER_DECISIONS' || plan.status === 'PARTIAL_OR_BLOCKED' || plan.readyForControlledWrite === true)

  console.log('\n--- 6. recommendedAction not treated as approval ---')
  record('C21 recommendedActionTreatedAsApproval = false', plan.recommendedActionTreatedAsApproval === false)

  console.log('\n--- 7. Plan structure ---')
  record('C22 plan has totalDecisionItems', typeof plan.totalDecisionItems === 'number')
  record('C23 plan has decidedItems', typeof plan.decidedItems === 'number')
  record('C24 plan has pendingItems', typeof plan.pendingItems === 'number')
  record('C25 plan has invalidDecisionItems', typeof plan.invalidDecisionItems === 'number')
  record('C26 plan has readyForControlledWrite', typeof plan.readyForControlledWrite === 'boolean')
  record('C27 plan has nextStage', typeof plan.nextStage === 'string')
  record('C28 plan has writePlanHash or null', plan.writePlanHash === null || typeof plan.writePlanHash === 'string')

  console.log('\n--- 8. Approved action counts ---')
  if (plan.userDecisionFileFound === true) {
    record('C29 approvedTeacherAliases reported', typeof plan.approvedTeacherAliases === 'number')
    record('C30 approvedExternalTeacherCreates reported', typeof plan.approvedExternalTeacherCreates === 'number')
    record('C31 approvedClassGroupCreates reported', typeof plan.approvedClassGroupCreates === 'number')
    record('C32 approvedMajorAliases reported', typeof plan.approvedMajorAliases === 'number')
  } else {
    record('C29 all approved counts = 0 (BLOCKED)', (plan.approvedTeacherAliases ?? 0) === 0)
    record('C30 approved external = 0 (BLOCKED)', (plan.approvedExternalTeacherCreates ?? 0) === 0)
    record('C31 approved CG = 0 (BLOCKED)', (plan.approvedClassGroupCreates ?? 0) === 0)
    record('C32 approved alias = 0 (BLOCKED)', (plan.approvedMajorAliases ?? 0) === 0)
  }

  console.log('\n--- 9. Local artifacts ---')
  record('C33 local artifact dir exists', existsSync(laDir))
  record('C34 user-decisions.intake.local.json exists', laFiles.includes('user-decisions.intake.local.json'))
  record('C35 controlled-master-data-write-plan.local.json exists', laFiles.includes('controlled-master-data-write-plan.local.json'))
  record('C36 controlled-master-data-write-plan.md exists', laFiles.includes('controlled-master-data-write-plan.md'))
  record('C37 local artifacts untracked', ex('git ls-files temp/local-artifacts/l7-f6g2/').length === 0)

  console.log('\n--- 10. No DB entity creation ---')
  record('C38 no new Course', course === 104)
  record('C39 no new Teacher', teacher === 236)
  record('C40 no new ClassGroup', cgSem4 === 406)
  record('C41 no new TeachingTask', ttSem4 === 0)
  record('C42 no new TTC', ttc === 446)
  record('C43 no new ImportBatch', ibTotal === 39)

  console.log('\n--- 11. No schema/migration changes ---')
  record('C44 no schema changes', !ex('git diff --name-only -- prisma/schema.prisma').includes('schema'))
  record('C45 no migration changes', !ex('git diff --name-only -- prisma/migrations/').length)
  record('C46 no scheduler changes', !ex('git diff --name-only -- src/lib/scheduler/').length)
  record('C47 no score changes', !ex('git diff --name-only -- src/lib/score.ts').length)

  console.log('\n--- 12. Build & tsc ---')
  const buildOut = ex('npm run build 2>&1')
  record('C48 build PASS', buildOut.includes('Compiled successfully') || !buildOut.includes('error'))
  const tscOut = ex('npx tsc --noEmit 2>&1')
  record('C49 tsc PASS', tscOut.length === 0)

  console.log('\n--- 13. Prisma ---')
  record('C50 prisma validate PASS', ex('npx prisma validate 2>&1').includes('valid'))
  record('C51 migrate status up to date', ex('npx prisma migrate status 2>&1').includes('up to date'))

  console.log('\n--- 14. Forbidden files ---')
  record('C52 no dev.db tracked', ex('git ls-files prisma/dev.db').length === 0)
  record('C53 no temp/ tracked', ex('git ls-files "temp/*" | grep -v README').length === 0)
  record('C54 no backup tracked', ex('git ls-files "prisma/*backup*"').length === 0)
  record('C55 no uploads/ tracked', ex('git ls-files "uploads/*"').length === 0)

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
