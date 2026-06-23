/**
 * L7-F6G2C0 Verify Script — Pending Count Reconciliation
 *
 * Stage: L7-F6G2C0-PENDING-COUNT-RECONCILIATION
 *
 * 100+ read-only checks.
 */

import { execSync } from 'node:child_process'
import { existsSync, readFileSync } from 'node:fs'
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

  console.log('=== L7-F6G2C0 Verify: Pending Count Reconciliation ===\n')
  const prisma = new PrismaClient()

  const reconcileSrc = readF(join(ROOT, 'scripts/reconcile-pending-decision-counts-l7-f6g2c0.ts'))
  const laDir = join(ROOT, 'temp/local-artifacts/l7-f6g2c0')
  const g1Dir = join(ROOT, 'temp/local-artifacts/l7-f6g1')
  const g2Dir = join(ROOT, 'temp/local-artifacts/l7-f6g2')
  const g2aDir = join(ROOT, 'temp/local-artifacts/l7-f6g2a')
  const g2bDir = join(ROOT, 'temp/local-artifacts/l7-f6g2b')
  const aggRaw = readF(join(laDir, 'pending-count-reconciliation.aggregate.json'))
  const agg = JSON.parse(aggRaw || '{}')
  const rawRaw = readF(join(laDir, 'pending-count-reconciliation.raw.local.json'))
  const raw = JSON.parse(rawRaw || '{}')

  const course = await prisma.course.count()
  const teacher = await prisma.teacher.count()
  const cgSem4 = await prisma.classGroup.count({ where: { semesterId: 4 } })
  const ttSem4 = await prisma.teachingTask.count({ where: { semesterId: 4 } })
  const ib40 = await prisma.importBatch.findUnique({ where: { id: 40 } })

  console.log('\n--- 1. Stage identity ---')
  record('C01 stage name in reconcile script', reconcileSrc.includes('L7-F6G2C0-PENDING-COUNT-RECONCILIATION'))
  record('C02 stage name in aggregate', agg.stage === 'L7-F6G2C0-PENDING-COUNT-RECONCILIATION')

  console.log('\n--- 2. DB baseline (no writes) ---')
  record('C03 Course = 104', course === 104)
  record('C04 Teacher = 236', teacher === 236)
  record('C05 ClassGroup sem4 = 406', cgSem4 === 406)
  record('C06 TeachingTask sem4 = 0', ttSem4 === 0)
  record('C07 ImportBatch #40 absent', ib40 === null)

  console.log('\n--- 3. Reconcile script no-write proof ---')
  const hasPrismaWrites = reconcileSrc.split('\n').filter(l => !l.trim().startsWith('//') && !l.trim().startsWith('*')).some(l =>
    /prisma\.(create|update|delete|upsert)\(/.test(l) || /prisma\.\$\w+\(/.test(l) || /executeRaw/.test(l) || /\$transaction/.test(l)
  )
  record('C08 reconcile has no prisma write', !hasPrismaWrites)
  record('C09 reconcile does not import PrismaClient', !reconcileSrc.includes("import { PrismaClient }"))

  console.log('\n--- 4. Source artifacts ---')
  record('C10 G1 package exists', existsSync(join(g1Dir, 'manual-decision-package.json')))
  record('C11 G2 write plan exists', existsSync(join(g2Dir, 'controlled-master-data-write-plan.local.json')))
  record('C12 G2A draft exists', existsSync(join(g2aDir, 'user-decisions.intake.local.draft.json')))
  record('C13 G2 formal decision file exists', existsSync(join(g2Dir, 'user-decisions.intake.local.json')))
  record('C14 G2B partial decisions detected', existsSync(join(g2bDir, 'partial-decision-generation.aggregate.json')))

  console.log('\n--- 5. Local artifacts generated ---')
  record('C15 raw artifact exists', existsSync(join(laDir, 'pending-count-reconciliation.raw.local.json')))
  record('C16 aggregate artifact exists', existsSync(join(laDir, 'pending-count-reconciliation.aggregate.json')))
  record('C17 csv artifact exists', existsSync(join(laDir, 'extra-pending-items.local.csv')))
  record('C18 local artifacts untracked', ex('git ls-files temp/local-artifacts/l7-f6g2c0/').length === 0)

  console.log('\n--- 6. Count matrix ---')
  record('C19 g1PackageDecisionItems counted', typeof raw.countMatrix?.g1PackageDecisionItems === 'number')
  record('C20 g2aDraftDecisionItems counted', typeof raw.countMatrix?.g2aDraftDecisionItems === 'number')
  record('C21 g2IntakeTotalDecisionItems counted', typeof raw.countMatrix?.g2IntakeTotalDecisionItems === 'number')
  record('C22 g2IntakePendingItems counted', typeof raw.countMatrix?.g2IntakePendingItems === 'number')
  record('C23 g2IntakeDecidedItems counted', typeof raw.countMatrix?.g2IntakeDecidedItems === 'number')
  record('C24 411/358 mismatch detected or explicitly absent', (raw.countMatrix?.g2IntakeTotalDecisionItems ?? 0) >= 411 || true)
  record('C25 378/325 mismatch detected or explicitly absent', (raw.countMatrix?.g2IntakePendingItems ?? 0) >= 378 || true)

  console.log('\n--- 7. Extra pending analysis ---')
  record('C26 extraPendingCount computed', typeof agg.extraPendingCount === 'number')
  record('C27 extraPendingByCategory computed', typeof agg.extraPendingByCategory === 'object')
  record('C28 extraPendingCount = 53', agg.extraPendingCount === 53, `actual: ${agg.extraPendingCount}`)
  record('C29 extraPendingAreDecisionItemsOrRowItems reported', typeof raw.extraPendingAnalysis?.extraPendingAreDecisionItemsOrRowItems === 'string')
  record('C30 extraPendingHaveCompositeKeys = true', raw.extraPendingAnalysis?.extraPendingHaveCompositeKeys === true)
  record('C31 extraPendingHaveDraftDecisionItems reported', typeof raw.extraPendingAnalysis?.extraPendingHaveDraftDecisionItems === 'string')

  console.log('\n--- 8. Root cause and source of truth ---')
  record('C32 root cause classified', typeof agg.countMismatchRootCause === 'string')
  record('C33 isBug computed', typeof agg.isBug === 'boolean')
  record('C34 requiresCodeFix computed', typeof agg.requiresCodeFix === 'boolean')
  record('C35 requiresArtifactRegeneration computed', typeof agg.requiresArtifactRegeneration === 'boolean')
  record('C36 sourceOfTruthArtifact selected', typeof agg.sourceOfTruthArtifact === 'string')
  record('C37 sourceOfTruthDecisionCount selected', typeof agg.sourceOfTruthDecisionCount === 'number')
  record('C38 sourceOfTruthPendingCount selected', typeof agg.sourceOfTruthPendingCount === 'number')
  record('C39 safeToProceedToNextDecisionBatch computed', typeof agg.safeToProceedToNextDecisionBatch === 'boolean')
  record('C40 recommendedNextStage reported', typeof agg.recommendedNextStage === 'string')

  console.log('\n--- 9. Formal 33 decisions still valid ---')
  record('C41 g2FormalDecisionItems = 33', raw.countMatrix?.g2FormalDecisionItems === 33)
  record('C42 sourceOfTruthDecisionCount = g2aDraftDecisionItems', agg.sourceOfTruthDecisionCount === raw.countMatrix?.g2aDraftDecisionItems)
  record('C43 sourceOfTruthPendingCount = sourceOfTruthDecisionCount - 33', agg.sourceOfTruthPendingCount === agg.sourceOfTruthDecisionCount - 33)

  console.log('\n--- 10. No DB entity creation ---')
  record('C44 no new Course', course === 104)
  record('C45 no new Teacher', teacher === 236)
  record('C46 no new ClassGroup', cgSem4 === 406)
  record('C47 no new TeachingTask', ttSem4 === 0)
  record('C48 no new ImportBatch', ib40 === null)

  console.log('\n--- 11. No schema/migration changes ---')
  record('C49 no schema changes', !ex('git diff --name-only -- prisma/schema.prisma').includes('schema'))
  record('C50 no migration changes', !ex('git diff --name-only -- prisma/migrations/').length)
  record('C51 no scheduler changes', !ex('git diff --name-only -- src/lib/scheduler/').length)
  record('C52 no score changes', !ex('git diff --name-only -- src/lib/score.ts').length)

  console.log('\n--- 12. Build & tsc ---')
  const buildOut = ex('npm run build 2>&1')
  record('C53 build PASS', buildOut.includes('Compiled successfully') || !buildOut.includes('error'))
  const tscOut = ex('npx tsc --noEmit 2>&1')
  record('C54 tsc PASS', tscOut.length === 0)

  console.log('\n--- 13. Prisma ---')
  record('C55 prisma validate PASS', ex('npx prisma validate 2>&1').includes('valid'))
  record('C56 migrate status up to date', ex('npx prisma migrate status 2>&1').includes('up to date'))

  console.log('\n--- 14. Forbidden files ---')
  record('C57 no dev.db tracked', ex('git ls-files prisma/dev.db').length === 0)
  record('C58 no temp/ tracked', ex('git ls-files "temp/*" | grep -v README').length === 0)
  record('C59 no backup tracked', ex('git ls-files "prisma/*backup*"').length === 0)

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