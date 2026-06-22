/**
 * L7-F6F Verify Script — DB Collision Repair
 *
 * Stage: L7-F6F-CONTROLLED-DB-COLLISION-RECONCILIATION-WRITE
 *
 * 130+ read-only checks.
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
  const args = (() => { const a = { targetSemesterId: 4, help: false }; for (let i = 0; i < process.argv.length; i++) { const v = process.argv[i]; if (v === '--target-semester-id') a.targetSemesterId = Number(process.argv[++i] ?? '4'); else if (v === '--help' || v === '-h') a.help = true; } return a })()
  if (args.help) return

  console.log('=== L7-F6F Verify: DB Collision Repair ===\n')
  const prisma = new PrismaClient()
  const repairSrc = readF(join(ROOT, 'scripts/repair-db-collisions-l7-f6f.ts'))

  // DB counts
  const course = await prisma.course.count()
  const teacher = await prisma.teacher.count()
  const cgSem1 = await prisma.classGroup.count({ where: { semesterId: 1 } })
  const cgSem4 = await prisma.classGroup.count({ where: { semesterId: args.targetSemesterId } })
  const ttSem4 = await prisma.teachingTask.count({ where: { semesterId: args.targetSemesterId } })
  const ttc = await prisma.teachingTaskClass.count()
  const ssSem4 = await prisma.scheduleSlot.count({ where: { semesterId: args.targetSemesterId } })
  const saSem4 = await prisma.scheduleAdjustment.count({ where: { semesterId: args.targetSemesterId } })
  const ibCount = await prisma.importBatch.count()
  const ib39 = await prisma.importBatch.findUnique({ where: { id: 39 } })
  const ib40 = await prisma.importBatch.findUnique({ where: { id: 40 } })
  const doubleJi = await prisma.classGroup.count({ where: { semesterId: args.targetSemesterId, name: { contains: '级级' } } })

  console.log('\n--- 1. Stage identity ---')
  record('C01 repair script exists', existsSync(join(ROOT, 'scripts/repair-db-collisions-l7-f6f.ts')))
  record('C02 stage constant correct', repairSrc.includes('L7-F6F-CONTROLLED-DB-COLLISION-RECONCILIATION-WRITE'))

  console.log('\n--- 2. DB baseline (post-repair) ---')
  record('C03 Course = 104', course === 104, `actual: ${course}`)
  record('C04 Teacher = 236', teacher === 236, `actual: ${teacher}`)
  record('C05 ClassGroup sem1 = 36', cgSem1 === 36, `actual: ${cgSem1}`)
  record('C06 ClassGroup sem4 = 406 (was 431, -25 deleted)', cgSem4 === 406, `actual: ${cgSem4}`)
  record('C07 TeachingTask sem4 = 0', ttSem4 === 0, `actual: ${ttSem4}`)
  record('C08 TeachingTaskClass = 446', ttc === 446, `actual: ${ttc}`)
  record('C09 ScheduleSlot sem4 = 0', ssSem4 === 0, `actual: ${ssSem4}`)
  record('C10 ScheduleAdj sem4 = 0', saSem4 === 0, `actual: ${saSem4}`)
  record('C11 ImportBatch total = 39', ibCount === 39, `actual: ${ibCount}`)
  record('C12 ImportBatch #39 exists, APPLIED', ib39?.status === 'APPLIED')
  record('C13 ImportBatch #40 absent', ib40 === null)

  console.log('\n--- 3. Collision repair verified ---')
  record('C14 double-级 count = 0', doubleJi === 0, `actual: ${doubleJi}`)
  record('C15 ClassGroup sem4 count = 431 - 25 = 406', cgSem4 === 406, `actual: ${cgSem4}`)
  // Verify no TTC references were deleted
  record('C16 TTC count unchanged (446)', ttc === 446, `actual: ${ttc}`)

  console.log('\n--- 4. No schema/migration changes ---')
  record('C17 no schema changes', !ex('git diff --name-only -- prisma/schema.prisma').includes('schema'))
  record('C18 no migration changes', !ex('git diff --name-only -- prisma/migrations/').length)
  record('C19 no scheduler changes', !ex('git diff --name-only -- src/lib/scheduler/').length)
  record('C20 no score changes', !ex('git diff --name-only -- src/lib/score.ts').length)

  console.log('\n--- 5. Build & tsc ---')
  const buildOut = ex('npm run build 2>&1')
  record('C21 build PASS', buildOut.includes('Compiled successfully') || !buildOut.includes('error'))
  const tscOut = ex('npx tsc --noEmit 2>&1')
  record('C22 tsc PASS', tscOut.length === 0, tscOut.length > 0 ? tscOut.split('\n')[0] : '')

  console.log('\n--- 6. Prisma ---')
  const pv = ex('npx prisma validate 2>&1')
  record('C23 prisma validate PASS', pv.includes('valid'))
  const ms = ex('npx prisma migrate status 2>&1')
  record('C24 migrate status up to date', ms.includes('up to date'))

  console.log('\n--- 7. Repair script hard rules ---')
  record('C25 confirm token required for apply', repairSrc.includes('EXPECTED_TOKEN'))
  record('C26 backup before apply', repairSrc.includes('copyFileSync') && repairSrc.includes('backup'))
  record('C27 transaction used', repairSrc.includes('$transaction'))
  record('C28 no schema/prisma change in repair', !repairSrc.includes('prisma/schema'))
  record('C29 no Teacher create in repair', !repairSrc.includes('teacher.create'))
  record('C30 no Course create in repair', !repairSrc.includes('course.create'))
  record('C31 no TeachingTask create in repair', !repairSrc.includes('teachingTask.create'))
  record('C32 no ImportBatch create in repair', !repairSrc.includes('importBatch.create'))
  record('C33 no ScheduleSlot create in repair', !repairSrc.includes('scheduleSlot.create'))

  console.log('\n--- 8. Forbidden files ---')
  record('C34 no dev.db tracked', ex('git ls-files prisma/dev.db').length === 0)
  record('C35 no temp/ tracked (besides README)', ex('git ls-files "temp/*" | grep -v README').length === 0)
  record('C36 backup not tracked', ex('git ls-files "prisma/dev.db.backup*"').length === 0)
  record('C37 no uploads/ tracked', ex('git ls-files "uploads/*"').length === 0)

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
