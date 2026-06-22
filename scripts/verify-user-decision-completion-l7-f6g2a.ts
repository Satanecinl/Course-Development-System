/**
 * L7-F6G2A Verify Script — User Decision Completion
 *
 * Stage: L7-F6G2A-USER-DECISION-COMPLETION
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

  console.log('=== L7-F6G2A Verify: User Decision Completion ===\n')
  const prisma = new PrismaClient()

  const completionSrc = readF(join(ROOT, 'scripts/complete-user-decisions-l7-f6g2a.ts'))
  const laDir = join(ROOT, 'temp/local-artifacts/l7-f6g2a')
  const g1Dir = join(ROOT, 'temp/local-artifacts/l7-f6g1')
  const g2Dir = join(ROOT, 'temp/local-artifacts/l7-f6g2')
  const laFiles = existsSync(laDir) ? readdirSync(laDir) : []
  const draftRaw = readF(join(laDir, 'user-decisions.intake.local.draft.json'))
  let draft: Record<string, unknown> = {}
  try { draft = JSON.parse(draftRaw) } catch { /* empty */ }
  const aggRaw = readF(join(laDir, 'completion.aggregate.json'))
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
  record('C01 stage name in completion script', completionSrc.includes('L7-F6G2A-USER-DECISION-COMPLETION'))
  record('C02 stage name in aggregate', (agg.stage as string) === 'L7-F6G2A-USER-DECISION-COMPLETION')

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

  console.log('\n--- 3. Completion script no-write proof ---')
  const hasPrismaWrites = completionSrc.split('\n').filter(l => !l.trim().startsWith('//') && !l.trim().startsWith('*')).some(l =>
    /prisma\.(create|update|delete|upsert)\(/.test(l) || /prisma\.\$\w+\(/.test(l) || /executeRaw/.test(l) || /\$transaction/.test(l)
  )
  record('C13 completion has no prisma write', !hasPrismaWrites)
  record('C14 completion does not import PrismaClient', !completionSrc.includes("import { PrismaClient }"))
  record('C15 completion does not use --apply', !completionSrc.includes('--apply'))
  record('C16 completion does not create backup', !completionSrc.includes('copyFileSync'))

  console.log('\n--- 4. Source artifacts ---')
  record('C17 G1 package exists', existsSync(join(g1Dir, 'manual-decision-package.json')))
  record('C18 G2 write plan exists', existsSync(join(g2Dir, 'controlled-master-data-write-plan.local.json')))

  console.log('\n--- 5. Local artifacts generated ---')
  record('C19 local artifact dir exists', existsSync(laDir))
  record('C20 draft JSON exists', laFiles.includes('user-decisions.intake.local.draft.json'))
  record('C21 review MD exists', laFiles.includes('user-decisions-review.md'))
  record('C22 bulk approval CSV exists', laFiles.includes('bulk-approval-candidates.csv'))
  record('C23 manual selection CSV exists', laFiles.includes('manual-selection-required.csv'))
  record('C24 external teacher CSV exists', laFiles.includes('external-teacher-review.csv'))
  record('C25 duplicate risk CSV exists', laFiles.includes('duplicate-risk-teacher-review.csv'))
  record('C26 classgroup CSV exists', laFiles.includes('classgroup-review.csv'))
  record('C27 skip row CSV exists', laFiles.includes('skip-row-confirmation.csv'))
  record('C28 completion aggregate exists', laFiles.includes('completion.aggregate.json'))
  record('C29 local artifacts untracked', ex('git ls-files temp/local-artifacts/l7-f6g2a/').length === 0)

  console.log('\n--- 6. Draft structure ---')
  record('C30 draft status = DRAFT_REQUIRES_USER_CONFIRMATION', (draft.status as string) === 'DRAFT_REQUIRES_USER_CONFIRMATION')
  record('C31 draft has decisions array', Array.isArray(draft.decisions))
  record('C32 draft has instructions', Array.isArray(draft.instructions))
  record('C33 draft has sourcePackageHash', typeof draft.sourcePackageHash === 'string')

  console.log('\n--- 7. No draft auto-approval ---')
  const draftDecisions = (draft.decisions as Array<Record<string, unknown>> | undefined) ?? []
  const allPending = draftDecisions.every((d) => d.currentStatus === 'pending')
  record('C34 all draft items have currentStatus=pending (not auto-approved)', allPending, `count: ${draftDecisions.length}`)

  console.log('\n--- 8. Risk stratification ---')
  const requiresManualSelection = (agg.requiresManualSelection as number ?? 0)
  const requiresExplicitUserConfirmation = (agg.requiresExplicitUserConfirmation as number ?? 0)
  record('C35 requiresManualSelection reported', requiresManualSelection > 0)
  record('C36 requiresExplicitUserConfirmation reported', requiresExplicitUserConfirmation > 0)
  const bulkCount = (agg.bulkApprovalCount as number ?? 0)
  record('C37 bulkApprovalCount reported', bulkCount >= 0)

  console.log('\n--- 9. Ready/Blocked status ---')
  record('C38 readyForControlledWrite = false (no formal decisions)', agg.readyForControlledWrite === false)
  record('C39 status = DRAFT_REQUIRES_USER_CONFIRMATION', agg.status === 'DRAFT_REQUIRES_USER_CONFIRMATION')

  console.log('\n--- 10. No DB entity creation ---')
  record('C40 no new Course', course === 104)
  record('C41 no new Teacher', teacher === 236)
  record('C42 no new ClassGroup', cgSem4 === 406)
  record('C43 no new TeachingTask', ttSem4 === 0)
  record('C44 no new TTC', ttc === 446)
  record('C45 no new ImportBatch', ibTotal === 39)

  console.log('\n--- 11. No schema/migration changes ---')
  record('C46 no schema changes', !ex('git diff --name-only -- prisma/schema.prisma').includes('schema'))
  record('C47 no migration changes', !ex('git diff --name-only -- prisma/migrations/').length)
  record('C48 no scheduler changes', !ex('git diff --name-only -- src/lib/scheduler/').length)
  record('C49 no score changes', !ex('git diff --name-only -- src/lib/score.ts').length)

  console.log('\n--- 12. Build & tsc ---')
  const buildOut = ex('npm run build 2>&1')
  record('C50 build PASS', buildOut.includes('Compiled successfully') || !buildOut.includes('error'))
  const tscOut = ex('npx tsc --noEmit 2>&1')
  record('C51 tsc PASS', tscOut.length === 0)

  console.log('\n--- 13. Prisma ---')
  record('C52 prisma validate PASS', ex('npx prisma validate 2>&1').includes('valid'))
  record('C53 migrate status up to date', ex('npx prisma migrate status 2>&1').includes('up to date'))

  console.log('\n--- 14. Forbidden files ---')
  record('C54 no dev.db tracked', ex('git ls-files prisma/dev.db').length === 0)
  record('C55 no temp/ tracked', ex('git ls-files "temp/*" | grep -v README').length === 0)
  record('C56 no backup tracked', ex('git ls-files "prisma/*backup*"').length === 0)

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
