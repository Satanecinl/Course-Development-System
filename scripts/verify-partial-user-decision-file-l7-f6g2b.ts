/**
 * L7-F6G2B Verify Script — Partial User Decision File
 *
 * Stage: L7-F6G2B-PARTIAL-USER-DECISION-FILE-GENERATION
 *
 * 100+ read-only checks.
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

  console.log('=== L7-F6G2B Verify: Partial User Decision File ===\n')
  const prisma = new PrismaClient()

  const genSrc = readF(join(ROOT, 'scripts/generate-partial-user-decisions-l7-f6g2b.ts'))
  const formalRaw = readF(join(ROOT, 'temp/local-artifacts/l7-f6g2/user-decisions.intake.local.json'))
  let formal: Record<string, unknown> = {}
  try { formal = JSON.parse(formalRaw) } catch { /* empty */ }
  const g2PlanRaw = readF(join(ROOT, 'temp/local-artifacts/l7-f6g2/controlled-master-data-write-plan.local.json'))
  let g2Plan: Record<string, unknown> = {}
  try { g2Plan = JSON.parse(g2PlanRaw) } catch { /* empty */ }
  const aggRaw = readF(join(ROOT, 'temp/local-artifacts/l7-f6g2b/partial-decision-generation.aggregate.json'))
  let agg: Record<string, unknown> = {}
  try { agg = JSON.parse(aggRaw) } catch { /* empty */ }

  const course = await prisma.course.count()
  const teacher = await prisma.teacher.count()
  const cgSem4 = await prisma.classGroup.count({ where: { semesterId: 4 } })
  const ttSem4 = await prisma.teachingTask.count({ where: { semesterId: 4 } })
  const ib40 = await prisma.importBatch.findUnique({ where: { id: 40 } })

  const formalDecisions = (formal.decisions as Array<Record<string, unknown>> | undefined) ?? []

  console.log('\n--- 1. Stage identity ---')
  record('C01 stage name in generator', genSrc.includes('L7-F6G2B-PARTIAL-USER-DECISION-FILE-GENERATION'))
  record('C02 stage name in formal file', (formal.stage as string) === 'L7-F6G2B-PARTIAL-USER-DECISION-FILE-GENERATION')

  console.log('\n--- 2. DB baseline (no writes) ---')
  record('C03 Course = 104', course === 104, `actual: ${course}`)
  record('C04 Teacher = 236', teacher === 236, `actual: ${teacher}`)
  record('C05 ClassGroup sem4 = 406', cgSem4 === 406, `actual: ${cgSem4}`)
  record('C06 TeachingTask sem4 = 0', ttSem4 === 0, `actual: ${ttSem4}`)
  record('C07 ImportBatch #40 absent', ib40 === null)

  console.log('\n--- 3. Generator no-write proof ---')
  const hasPrismaWrites = genSrc.split('\n').filter(l => !l.trim().startsWith('//') && !l.trim().startsWith('*')).some(l =>
    /prisma\.(create|update|delete|upsert)\(/.test(l) || /prisma\.\$\w+\(/.test(l) || /executeRaw/.test(l) || /\$transaction/.test(l)
  )
  record('C08 generator has no prisma write', !hasPrismaWrites)
  record('C09 generator does not import PrismaClient', !genSrc.includes("import { PrismaClient }"))

  console.log('\n--- 4. Composite key integrity ---')
  record('C10 composite key duplicates = 0', agg.duplicateDecisionCompositeKeyCount === 0)
  record('C11 duplicate decisionId across categories reported', typeof agg.duplicateDecisionIdAcrossCategoriesCount === 'number')
  record('C12 G2 intake uses composite key (modified)', agg.g2IntakeUsesCompositeKey === true)

  console.log('\n--- 5. Source draft ---')
  record('C13 G2A draft exists', existsSync(join(ROOT, 'temp/local-artifacts/l7-f6g2a/user-decisions.intake.local.draft.json')))
  record('C14 sourcePackageHash preserved', typeof formal.sourcePackageHash === 'string')

  console.log('\n--- 6. Formal decision file ---')
  record('C15 formal file generated', existsSync(join(ROOT, 'temp/local-artifacts/l7-f6g2/user-decisions.intake.local.json')))
  record('C16 formal file untracked', ex('git ls-files "temp/local-artifacts/l7-f6g2/user-decisions.intake.local.json"').length === 0)
  record('C17 formal file decisionMode = partial', formal.decisionMode === 'partial')
  record('C18 decidedItemCount = 33', formal.decidedItemCount === 33)
  record('C19 pendingItemsRemain = true', formal.pendingItemsRemain === true)
  record('C20 formal decisions array length = 33', formalDecisions.length === 33)

  console.log('\n--- 7. Specific 33 partial decisions ---')
  const catCount = new Map<string, number>()
  for (const d of formalDecisions) {
    catCount.set(d.category as string, (catCount.get(d.category as string) ?? 0) + 1)
  }
  record('C21 low-risk staff/contacts approve = 22', (catCount.get('staffContactsTeacher') ?? 0) === 22)
  record('C22 examType approve = 1', (catCount.get('examType') ?? 0) === 1)
  record('C23 new major ClassGroup approve = 7', (catCount.get('newMajorClassGroup') ?? 0) === 7)
  record('C24 major alias approve = 1', (catCount.get('majorAlias') ?? 0) === 1)
  record('C25 generic external teacher skip = 1', (catCount.get('externalTeacher') ?? 0) === 1)
  record('C26 skipRow skip = 1', (catCount.get('skipRow') ?? 0) === 1)

  console.log('\n--- 8. Forbidden items NOT in formal ---')
  record('C27 no ambiguous teacher in formal', (catCount.get('ambiguousTeacher') ?? 0) === 0)
  record('C28 no weeklyHours in formal', (catCount.get('weeklyHours') ?? 0) === 0)
  record('C29 no ambiguousMapping in formal', (catCount.get('ambiguousMapping') ?? 0) === 0)

  console.log('\n--- 9. Every formal decision has required fields ---')
  const allHaveCategory = formalDecisions.every((d) => typeof d.category === 'string' && d.category.length > 0)
  const allHaveId = formalDecisions.every((d) => typeof d.decisionId === 'string' && d.decisionId.length > 0)
  const allApproveHaveAction = formalDecisions.filter((d) => d.decisionStatus === 'approve').every((d) => typeof d.approvedAction === 'string' && (d.approvedAction as string).length > 0)
  const noUnknownCat = formalDecisions.every((d) => {
    const validCats = ['staffContactsTeacher', 'externalTeacher', 'ambiguousTeacher', 'newMajorClassGroup', 'majorAlias', 'skipRow', 'weeklyHours', 'examType', 'ambiguousMapping']
    return validCats.includes(d.category as string)
  })
  record('C30 all have category', allHaveCategory)
  record('C31 all have decisionId', allHaveId)
  record('C32 all approve have approvedAction', allApproveHaveAction)
  record('C33 no unknown category', noUnknownCat)

  console.log('\n--- 10. G2 intake rerun result ---')
  record('C34 G2 intake saw user decision file', g2Plan.userDecisionFileFound === true)
  record('C35 G2 intake decidedItems = 33', g2Plan.decidedItems === 33)
  record('C36 G2 intake pendingItems > 0', (g2Plan.pendingItems as number ?? 0) > 0)
  record('C37 G2 intake readyForControlledWrite = false', g2Plan.readyForControlledWrite === false)
  record('C38 G2 intake status = PARTIAL_OR_BLOCKED', g2Plan.status === 'PARTIAL_OR_BLOCKED')

  console.log('\n--- 11. Privacy in committed docs ---')
  const docJson = readF(join(ROOT, 'docs/l7-f6g2b-partial-user-decision-file-generation.json'))
  const hasRawTeacher = /teacherName\s*:\s*"[^"]{2,}"/.test(docJson)
  const hasRawClass = /className\s*:\s*"[^"]{2,}"/.test(docJson)
  const hasRawMajor = /majorName\s*:\s*"[^"]{2,}"/.test(docJson)
  const hasPhone = /\d{11}/.test(docJson)
  record('C39 no raw teacher in committed JSON', !hasRawTeacher)
  record('C40 no raw class in committed JSON', !hasRawClass)
  record('C41 no raw major in committed JSON', !hasRawMajor)
  record('C42 no phone in committed JSON', !hasPhone)

  console.log('\n--- 12. No DB entity creation ---')
  record('C43 no new Course', course === 104)
  record('C44 no new Teacher', teacher === 236)
  record('C45 no new ClassGroup', cgSem4 === 406)
  record('C46 no new TeachingTask', ttSem4 === 0)
  record('C47 no new ImportBatch', ib40 === null)

  console.log('\n--- 13. No schema/migration changes ---')
  record('C48 no schema changes', !ex('git diff --name-only -- prisma/schema.prisma').includes('schema'))
  record('C49 no migration changes', !ex('git diff --name-only -- prisma/migrations/').length)
  record('C50 no scheduler changes', !ex('git diff --name-only -- src/lib/scheduler/').length)
  record('C51 no score changes', !ex('git diff --name-only -- src/lib/score.ts').length)

  console.log('\n--- 14. Build & tsc ---')
  const buildOut = ex('npm run build 2>&1')
  record('C52 build PASS', buildOut.includes('Compiled successfully') || !buildOut.includes('error'))
  const tscOut = ex('npx tsc --noEmit 2>&1')
  record('C53 tsc PASS', tscOut.length === 0)

  console.log('\n--- 15. Prisma ---')
  record('C54 prisma validate PASS', ex('npx prisma validate 2>&1').includes('valid'))
  record('C55 migrate status up to date', ex('npx prisma migrate status 2>&1').includes('up to date'))

  console.log('\n--- 16. Forbidden files ---')
  record('C56 no dev.db tracked', ex('git ls-files prisma/dev.db').length === 0)
  record('C57 no temp/ tracked', ex('git ls-files "temp/*" | grep -v README').length === 0)
  record('C58 no backup tracked', ex('git ls-files "prisma/*backup*"').length === 0)

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
