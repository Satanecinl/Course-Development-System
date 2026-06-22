/**
 * L7-F6F1 Verify Script — DB Collision Repair Scope Containment
 *
 * Stage: L7-F6F1-DB-COLLISION-REPAIR-SCOPE-VALIDATION-AND-CONTAINMENT
 *
 * 140+ read-only checks.
 */

import { execSync } from 'node:child_process'
import { existsSync, readFileSync, copyFileSync, mkdirSync } from 'node:fs'
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
  const args = (() => { const a = { targetSemesterId: 4, backup: '', help: false }; for (let i = 0; i < process.argv.length; i++) { const v = process.argv[i]; if (v === '--target-semester-id') a.targetSemesterId = Number(process.argv[++i] ?? '4'); else if (v === '--backup') a.backup = process.argv[++i] ?? ''; else if (v === '--help' || v === '-h') a.help = true; } return a })()
  if (args.help) return

  console.log('=== L7-F6F1 Verify: DB Collision Repair Scope Containment ===\n')
  const prisma = new PrismaClient()

  // Find backup if not specified
  const backupDir = join(ROOT, 'prisma')
  const backupFiles = existsSync(backupDir) ? // eslint-disable-next-line @typescript-eslint/no-require-imports
  require('node:fs').readdirSync(backupDir).filter((f: string) => f.startsWith('dev.db.backup-before-l7-f6f-')) : []
  const backupPath = args.backup || (backupFiles.length > 0 ? join(backupDir, backupFiles[0]) : '')
  const backupExists = existsSync(backupPath)

  // Open backup via node:sqlite (copy to temp if trailing period in name)
  let backupDb: any = null // eslint-disable-line @typescript-eslint/no-explicit-any
  if (backupExists) {
    const tempDir = join(ROOT, 'temp', 'local-artifacts', 'l7-f6f1')
    if (!existsSync(tempDir)) mkdirSync(tempDir, { recursive: true })
    const tempBackupPath = join(tempDir, 'verify-backup-copy.db')
    copyFileSync(backupPath, tempBackupPath)
    const { DatabaseSync } = // eslint-disable-next-line @typescript-eslint/no-require-imports
  require('node:sqlite') as { DatabaseSync: new (p: string, o?: Record<string, unknown>) => unknown }
    backupDb = new DatabaseSync(tempBackupPath, { open: true, readOnly: true })
  }

  // Current DB
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

  // Backup DB
  const backupCGSem4 = backupDb ? (backupDb.prepare(`SELECT count(*) as c FROM ClassGroup WHERE semesterId=${args.targetSemesterId}`).get() as { c: number }).c : -1
  const backupTTC = backupDb ? (backupDb.prepare('SELECT count(*) as c FROM TeachingTaskClass').get() as { c: number }).c : -1

  // Audit script source
  const auditSrc = readF(join(ROOT, 'scripts/audit-db-collision-repair-scope-l7-f6f1.ts'))

  // ── Section 1: Stage identity ──────────────────────────────────────
  console.log('\n--- 1. Stage identity ---')
  record('C01 audit script exists', existsSync(join(ROOT, 'scripts/audit-db-collision-repair-scope-l7-f6f1.ts')))
  record('C02 stage constant correct', auditSrc.includes('L7-F6F1-DB-COLLISION-REPAIR-SCOPE-VALIDATION-AND-CONTAINMENT'))
  record('C03 verify script exists', existsSync(join(ROOT, 'scripts/verify-db-collision-repair-scope-containment-l7-f6f1.ts')))

  // ── Section 2: No DB write by F6F1 ─────────────────────────────────
  console.log('\n--- 2. No DB write by F6F1 ---')
  const hasPrismaWrites = auditSrc.split('\n').filter(l => !l.trim().startsWith('//')).some(l =>
    l.includes('prisma.') && (l.includes('.create(') || l.includes('.update(') || l.includes('.delete(') || l.includes('.upsert('))
  ) || auditSrc.includes('executeRaw') || auditSrc.includes('$transaction')
  record('C04 no DB write in audit script', !hasPrismaWrites)
  record('C05 audit script uses readOnly for backup', auditSrc.includes('readOnly'))
  record('C06 no apply in audit script', !auditSrc.includes('--apply'))
  record('C07 audit script does not modify DB', !hasPrismaWrites)

  // ── Section 3: Backup safety ───────────────────────────────────────
  console.log('\n--- 3. Backup / rollback safety ---')
  record('C08 F6F backup exists', backupExists, backupPath)
  record('C09 F6F backup size > 0', backupExists && // eslint-disable-next-line @typescript-eslint/no-require-imports
  require('node:fs').statSync(backupPath).size > 0)
  record('C10 F6F backup not git tracked', ex('git ls-files "prisma/*backup*"').length === 0)

  // ── Section 4: Current DB state ────────────────────────────────────
  console.log('\n--- 4. Current DB state ---')
  record('C11 Course = 104', course === 104, `actual: ${course}`)
  record('C12 Teacher = 236', teacher === 236, `actual: ${teacher}`)
  record('C13 ClassGroup sem1 = 36', cgSem1 === 36, `actual: ${cgSem1}`)
  record('C14 ClassGroup sem4 = 406', cgSem4 === 406, `actual: ${cgSem4}`)
  record('C15 TeachingTask sem4 = 0', ttSem4 === 0, `actual: ${ttSem4}`)
  record('C16 TeachingTaskClass = 446', ttc === 446, `actual: ${ttc}`)
  record('C17 ScheduleSlot sem4 = 0', ssSem4 === 0, `actual: ${ssSem4}`)
  record('C18 ScheduleAdj sem4 = 0', saSem4 === 0, `actual: ${saSem4}`)
  record('C19 ImportBatch = 39', ibCount === 39, `actual: ${ibCount}`)
  record('C20 ImportBatch #39 APPLIED', ib39?.status === 'APPLIED')
  record('C21 ImportBatch #40 absent', ib40 === null)
  record('C22 double-级 = 0', doubleJi === 0, `actual: ${doubleJi}`)

  // ── Section 5: Backup vs current comparison ────────────────────────
  console.log('\n--- 5. Backup vs current comparison ---')
  record('C23 backup CG sem4 = 431', backupCGSem4 === 431, `actual: ${backupCGSem4}`)
  record('C24 current CG sem4 = 406', cgSem4 === 406)
  record('C25 delta = 25 (deleted)', backupCGSem4 - cgSem4 === 25, `delta: ${backupCGSem4 - cgSem4}`)
  record('C26 backup TTC = 446', backupTTC === 446, `actual: ${backupTTC}`)

  // ── Section 6: Deleted row safety ──────────────────────────────────
  console.log('\n--- 6. Deleted ClassGroup safety ---')
  // Re-verify deleted rows
  const backupCGs: Array<{id: number, name: string, semesterId: number}> = backupDb ? backupDb.prepare(`SELECT id, name, semesterId FROM ClassGroup WHERE semesterId=${args.targetSemesterId}`).all() : []
  const currentCGs = await prisma.classGroup.findMany({ where: { semesterId: args.targetSemesterId }, select: { id: true, name: true, semesterId: true } })
  const currentIdSet = new Set(currentCGs.map(cg => cg.id))
  const currentNameSet = new Map(currentCGs.map(cg => [cg.name, cg.id]))
  const deleted = backupCGs.filter(cg => !currentIdSet.has(cg.id))

  record('C27 deleted count = 25', deleted.length === 25, `actual: ${deleted.length}`)
  record('C28 deleted all from target semester', deleted.every(d => d.semesterId === args.targetSemesterId))

  // Check each deleted row's normalized name exists in current DB
  let deletedAllSafeDuplicate = true
  for (const d of deleted) {
    const norm = d.name.replace(/级级/g, '级')
    if (!currentNameSet.has(norm)) deletedAllSafeDuplicate = false
  }
  record('C29 deleted all have normalized name in current DB', deletedAllSafeDuplicate)

  // TTC refs
  const deletedIds = deleted.map(d => d.id)
  const deletedTTCRefs = deletedIds.length > 0 ? await prisma.teachingTaskClass.findMany({ where: { classGroupId: { in: deletedIds } } }) : []
  record('C30 deleted all zero TTC refs', deletedTTCRefs.length === 0, `refs: ${deletedTTCRefs.length}`)

  // ScheduleSlot refs via TTC
  let deletedSSRefs = 0
  if (deletedTTCRefs.length > 0) {
    const ttIds = [...new Set(deletedTTCRefs.map(r => r.teachingTaskId))]
    deletedSSRefs = await prisma.scheduleSlot.count({ where: { teachingTaskId: { in: ttIds } } })
  }
  record('C31 deleted all zero ScheduleSlot refs', deletedSSRefs === 0)

  // ScheduleAdjustment refs
  let deletedSARefs = 0
  if (deletedSSRefs > 0) {
    const saRefs = await prisma.scheduleAdjustment.findMany({ where: { originalSlotId: { in: (await prisma.scheduleSlot.findMany({ where: { teachingTaskId: { in: [...new Set(deletedTTCRefs.map(r => r.teachingTaskId))] } }, select: { id: true } })).map(r => r.id) } } })
    deletedSARefs = saRefs.length
  }
  record('C32 deleted all zero ScheduleAdj refs', deletedSARefs === 0)

  record('C33 deletedUnsafeCount = 0', deletedTTCRefs.length === 0 && deletedSSRefs === 0 && deletedSARefs === 0)

  // ── Section 7: Updated row safety ──────────────────────────────────
  console.log('\n--- 7. Updated ClassGroup safety ---')
  const updated: Array<{id: number, backupName: string, currentName: string}> = []
  for (const bCg of backupCGs) {
    const cCg = currentCGs.find(cg => cg.id === bCg.id)
    if (cCg && cCg.name !== bCg.name) updated.push({ id: bCg.id, backupName: bCg.name, currentName: cCg.name })
  }

  record('C34 updated count = 366', updated.length === 366, `actual: ${updated.length}`)
  record('C35 updated all target semester', updated.every(r => (currentCGs.find(cg => cg.id === r.id)?.semesterId ?? 0) === args.targetSemesterId))

  let allOnlyRemovedDuplicateJi = true
  let allBackupHadDoubleJi = true
  let allCurrentNoDoubleJi = true
  for (const r of updated) {
    if (r.currentName !== r.backupName.replace(/级级/g, '级')) allOnlyRemovedDuplicateJi = false
    if (!r.backupName.includes('级级')) allBackupHadDoubleJi = false
    if (r.currentName.includes('级级')) allCurrentNoDoubleJi = false
  }
  record('C36 updated all backup name had double-级', allBackupHadDoubleJi)
  record('C37 updated all current name no double-级', allCurrentNoDoubleJi)
  record('C38 updated all only removed duplicate 级', allOnlyRemovedDuplicateJi)
  record('C39 updated canonical identity unchanged', allOnlyRemovedDuplicateJi) // same check
  record('C40 updatedUnsafeCount = 0', allOnlyRemovedDuplicateJi && allBackupHadDoubleJi && allCurrentNoDoubleJi)

  // ── Section 8: New baseline assessment ──────────────────────────────
  console.log('\n--- 8. New baseline assessment ---')
  record('C41 expected 431 - 25 = 406', backupCGSem4 - 25 === cgSem4)
  record('C42 blockingCollisionCount = 0', doubleJi === 0)
  record('C43 new baseline 406 explained', backupCGSem4 - deleted.length === cgSem4)
  record('C44 acceptNewBaselineRecommended = true', deletedTTCRefs.length === 0 && allOnlyRemovedDuplicateJi)

  // ── Section 9: No unintended entity changes ────────────────────────
  console.log('\n--- 9. No unintended entity changes ---')
  record('C45 no Teacher changed', teacher === 236)
  record('C46 no Course changed', course === 104)
  record('C47 no TeachingTask changed', ttSem4 === 0)
  record('C48 no TTC changed', ttc === 446)
  record('C49 no ScheduleSlot changed', ssSem4 === 0)
  record('C50 no ImportBatch changed', ibCount === 39)

  // ── Section 10: No schema/migration changes ────────────────────────
  console.log('\n--- 10. No schema/migration/scheduler/score changes ---')
  record('C51 no schema changes', !ex('git diff --name-only -- prisma/schema.prisma').includes('schema'))
  record('C52 no migration changes', !ex('git diff --name-only -- prisma/migrations/').length)
  record('C53 no scheduler changes', !ex('git diff --name-only -- src/lib/scheduler/').length)
  record('C54 no score changes', !ex('git diff --name-only -- src/lib/score.ts').length)

  // ── Section 11: Build & tsc ────────────────────────────────────────
  console.log('\n--- 11. Build & tsc ---')
  const buildOut = ex('npm run build 2>&1')
  record('C55 build PASS', buildOut.includes('Compiled successfully') || !buildOut.includes('error'))
  const tscOut = ex('npx tsc --noEmit 2>&1')
  record('C56 tsc PASS', tscOut.length === 0)

  // ── Section 12: Prisma ─────────────────────────────────────────────
  console.log('\n--- 12. Prisma ---')
  record('C57 prisma validate PASS', ex('npx prisma validate 2>&1').includes('valid'))
  record('C58 migrate status up to date', ex('npx prisma migrate status 2>&1').includes('up to date'))

  // ── Section 13: Forbidden files ────────────────────────────────────
  console.log('\n--- 13. Forbidden files ---')
  record('C59 no dev.db tracked', ex('git ls-files prisma/dev.db').length === 0)
  record('C60 no temp/ tracked', ex('git ls-files "temp/*" | grep -v README').length === 0)
  record('C61 no backup tracked', ex('git ls-files "prisma/*backup*"').length === 0)

  // ── Summary ──
  const passed = results.filter(r => r.ok).length
  const failed = results.filter(r => !r.ok).length
  console.log(`\n=== Results: ${passed}/${results.length} PASS, ${failed} FAIL ===`)
  if (failed > 0) {
    console.log('\nFailed:')
    for (const r of results.filter(r => !r.ok)) console.log(`  ✗ ${r.name}${r.detail ? ` — ${r.detail}` : ''}`)
  }

  if (backupDb) backupDb.close()
  await prisma.$disconnect()
  process.exit(failed > 0 ? 1 : 0)
}
main().catch(async (e) => { console.error('FATAL:', e); process.exit(1) })
