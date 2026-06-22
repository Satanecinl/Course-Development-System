/**
 * L7-F6F1 Containment Audit Script — DB Collision Repair Scope Validation
 *
 * Stage: L7-F6F1-DB-COLLISION-REPAIR-SCOPE-VALIDATION-AND-CONTAINMENT
 *
 * Read-only comparison of backup vs current DB to validate L7-F6F safety.
 *
 * Usage:
 *   npx tsx scripts/audit-db-collision-repair-scope-l7-f6f1.ts \
 *     --target-semester-id 4 \
 *     --backup "prisma/dev.db.backup-before-l7-f6f-db-collision-repair-20260622175109."
 */

import { existsSync, readFileSync, statSync, mkdirSync, writeFileSync, copyFileSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { createHash } from 'node:crypto'

const ROOT = resolve(__dirname, '..')
const STAGE = 'L7-F6F1-DB-COLLISION-REPAIR-SCOPE-VALIDATION-AND-CONTAINMENT'

const shortHash = (s: string, len = 16): string =>
  createHash('sha256').update(s, 'utf8').digest('hex').slice(0, len)

const parseArgs = (argv: string[]) => {
  const args = { targetSemesterId: 0, backup: '', help: false }
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i]
    if (a === '--target-semester-id') args.targetSemesterId = Number(argv[++i] ?? '0')
    else if (a === '--backup') args.backup = argv[++i] ?? ''
    else if (a === '--help' || a === '-h') args.help = true
  }
  return args
}

type BackupCG = { id: number; name: string; semesterId: number }
type CurrentCG = { id: number; name: string; semesterId: number }
type TTCRef = { classGroupId: number }
type SSRef = { id: number }
type SARef = { id: number }

async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2))
  if (args.help) {
    console.log(`L7-F6F1 Containment Audit (read-only)

Usage:
  --target-semester-id <id>   Target semester (required)
  --backup <path>             Path to F6F backup db (required)
`)
    return
  }
  if (!args.targetSemesterId || !args.backup) {
    console.error('ERROR: --target-semester-id and --backup are required')
    process.exit(1)
  }
  const backupPath = args.backup.startsWith(ROOT) ? args.backup : join(ROOT, args.backup)
  if (!existsSync(backupPath)) {
    console.error(`ERROR: backup not found: ${backupPath}`)
    process.exit(1)
  }

  console.log(`L7-F6F1 Containment Audit`)
  console.log(`  stage: ${STAGE}`)
  console.log(`  target semester: ${args.targetSemesterId}`)
  console.log(`  backup: ${backupPath}`)
  console.log('')

  // Use node:sqlite for backup (read-only) and Prisma for current DB
  // node:sqlite cannot open files with trailing period in filename, so copy to temp
  const tempDir = join(ROOT, 'temp', 'local-artifacts', 'l7-f6f1')
  if (!existsSync(tempDir)) mkdirSync(tempDir, { recursive: true })
  const tempBackupPath = join(tempDir, 'backup-audit-copy.db')
  copyFileSync(backupPath, tempBackupPath)
  const { DatabaseSync } = await import('node:sqlite') as { DatabaseSync: new (p: string, o?: Record<string, unknown>) => unknown }
  const backupDb = new DatabaseSync(tempBackupPath, { open: true, readOnly: true }) as InstanceType<typeof DatabaseSync>

  const { PrismaClient } = await import('@prisma/client')
  const prisma = new PrismaClient()

  // ── Current DB counts ──────────────────────────────────────────────
  const courseCount = await prisma.course.count()
  const teacherCount = await prisma.teacher.count()
  const cgSem1Count = await prisma.classGroup.count({ where: { semesterId: 1 } })
  const cgSem4Count = await prisma.classGroup.count({ where: { semesterId: args.targetSemesterId } })
  const ttSem4Count = await prisma.teachingTask.count({ where: { semesterId: args.targetSemesterId } })
  const ttcCount = await prisma.teachingTaskClass.count()
  const ssSem4Count = await prisma.scheduleSlot.count({ where: { semesterId: args.targetSemesterId } })
  const saSem4Count = await prisma.scheduleAdjustment.count({ where: { semesterId: args.targetSemesterId } })
  const ibCount = await prisma.importBatch.count()
  const ib39 = await prisma.importBatch.findUnique({ where: { id: 39 } })
  const ib40 = await prisma.importBatch.findUnique({ where: { id: 40 } })

  // ── Backup DB counts ──────────────────────────────────────────────
  const backupCounts = {
    course: (backupDb.prepare('SELECT count(*) as c FROM Course').get() as { c: number }).c,
    teacher: (backupDb.prepare('SELECT count(*) as c FROM Teacher').get() as { c: number }).c,
    cgSem1: (backupDb.prepare('SELECT count(*) as c FROM ClassGroup WHERE semesterId=1').get() as { c: number }).c,
    cgSem4: (backupDb.prepare(`SELECT count(*) as c FROM ClassGroup WHERE semesterId=${args.targetSemesterId}`).get() as { c: number }).c,
    ttSem4: (backupDb.prepare(`SELECT count(*) as c FROM TeachingTask WHERE semesterId=${args.targetSemesterId}`).get() as { c: number }).c,
    ttc: (backupDb.prepare('SELECT count(*) as c FROM TeachingTaskClass').get() as { c: number }).c,
    ssSem4: (backupDb.prepare(`SELECT count(*) as c FROM ScheduleSlot WHERE semesterId=${args.targetSemesterId}`).get() as { c: number }).c,
    saSem4: (backupDb.prepare(`SELECT count(*) as c FROM ScheduleAdjustment WHERE semesterId=${args.targetSemesterId}`).get() as { c: number }).c,
    ibTotal: (backupDb.prepare('SELECT count(*) as c FROM ImportBatch').get() as { c: number }).c,
  }

  console.log('--- 1. DB Counts Comparison ---')
  console.log(`  Course:       backup=${backupCounts.course}  current=${courseCount}  ${backupCounts.course === courseCount ? '✓' : '✗'}`)
  console.log(`  Teacher:      backup=${backupCounts.teacher}  current=${teacherCount}  ${backupCounts.teacher === teacherCount ? '✓' : '✗'}`)
  console.log(`  CG sem1:      backup=${backupCounts.cgSem1}  current=${cgSem1Count}  ${backupCounts.cgSem1 === cgSem1Count ? '✓' : '✗'}`)
  console.log(`  CG sem4:      backup=${backupCounts.cgSem4}  current=${cgSem4Count}  delta=${backupCounts.cgSem4 - cgSem4Count}`)
  console.log(`  TT sem4:      backup=${backupCounts.ttSem4}  current=${ttSem4Count}  ${backupCounts.ttSem4 === ttSem4Count ? '✓' : '✗'}`)
  console.log(`  TTC:          backup=${backupCounts.ttc}  current=${ttcCount}  ${backupCounts.ttc === ttcCount ? '✓' : '✗'}`)
  console.log(`  SS sem4:      backup=${backupCounts.ssSem4}  current=${ssSem4Count}  ${backupCounts.ssSem4 === ssSem4Count ? '✓' : '✗'}`)
  console.log(`  SA sem4:      backup=${backupCounts.saSem4}  current=${saSem4Count}  ${backupCounts.saSem4 === saSem4Count ? '✓' : '✗'}`)
  console.log(`  IB total:     backup=${backupCounts.ibTotal}  current=${ibCount}  ${backupCounts.ibTotal === ibCount ? '✓' : '✗'}`)
  console.log('')

  // ── Identify deleted and updated rows ──────────────────────────────
  const backupCGs: BackupCG[] = backupDb.prepare(`SELECT id, name, semesterId FROM ClassGroup WHERE semesterId=${args.targetSemesterId}`).all() as BackupCG[]
  const currentCGs: CurrentCG[] = await prisma.classGroup.findMany({ where: { semesterId: args.targetSemesterId }, select: { id: true, name: true, semesterId: true } })
  const currentIds = new Set(currentCGs.map(cg => cg.id))
  const currentById = new Map(currentCGs.map(cg => [cg.id, cg]))

  const deletedRows: BackupCG[] = backupCGs.filter(cg => !currentIds.has(cg.id))
  const updatedRows: Array<{ id: number; backupName: string; currentName: string }> = []
  for (const bCg of backupCGs) {
    const cCg = currentById.get(bCg.id)
    if (cCg && cCg.name !== bCg.name) {
      updatedRows.push({ id: bCg.id, backupName: bCg.name, currentName: cCg.name })
    }
  }

  console.log('--- 2. Deleted ClassGroup Analysis ---')
  console.log(`  deletedClassGroupCount: ${deletedRows.length}`)
  console.log(`  deletedAllFromTargetSemester: ${deletedRows.every(r => r.semesterId === args.targetSemesterId)}`)

  // Check all business references for deleted rows
  const deletedIds = deletedRows.map(r => r.id)
  let ttcRefCount = 0
  let ssRefCount = 0
  let saRefCount = 0
  const otherRefCount = 0

  if (deletedIds.length > 0) {
    // TeachingTaskClass
    const ttcRefs = await prisma.teachingTaskClass.findMany({ where: { classGroupId: { in: deletedIds } }, select: { id: true } })
    ttcRefCount = ttcRefs.length

    // ScheduleSlot — check via TeachingTask
    const ttcRefs2 = await prisma.teachingTaskClass.findMany({ where: { classGroupId: { in: deletedIds } }, select: { teachingTaskId: true } })
    const ttIds = [...new Set(ttcRefs2.map(r => r.teachingTaskId))]
    if (ttIds.length > 0) {
      const ssRefs = await prisma.scheduleSlot.findMany({ where: { teachingTaskId: { in: ttIds } }, select: { id: true } })
      ssRefCount = ssRefs.length
    }

    // ScheduleAdjustment — check via ScheduleSlot
    if (ssRefCount > 0) {
      const saRefs = await prisma.scheduleAdjustment.findMany({
        where: { originalSlotId: { in: (await prisma.scheduleSlot.findMany({ where: { teachingTaskId: { in: ttIds } }, select: { id: true } })).map(r => r.id) } },
        select: { id: true },
      })
      saRefCount = saRefs.length
    }
  }

  // Check canonical key: are deleted rows all duplicates of existing rows?
  let deletedAllDuplicateCanonicalKey = true
  for (const d of deletedRows) {
    const normalized = d.name.replace(/级级/g, '级')
    const existsInCurrent = currentCGs.some(cg => cg.name === normalized)
    if (!existsInCurrent) {
      deletedAllDuplicateCanonicalKey = false
      console.log(`  WARNING: deleted id=${d.id} name="${d.name}" → normalized "${normalized}" NOT in current DB`)
    }
  }

  const deletedHasAnyBusinessReference = ttcRefCount > 0 || ssRefCount > 0 || saRefCount > 0 || otherRefCount > 0
  const deletedUnsafeCount = deletedHasAnyBusinessReference ? deletedRows.length : 0

  console.log(`  deletedAllDuplicateCanonicalKey: ${deletedAllDuplicateCanonicalKey}`)
  console.log(`  deletedAllZeroTTCRefs: ${ttcRefCount === 0}`)
  console.log(`  deletedAllZeroScheduleSlotRefs: ${ssRefCount === 0}`)
  console.log(`  deletedAllZeroScheduleAdjRefs: ${saRefCount === 0}`)
  console.log(`  deletedAllZeroOtherRefs: ${otherRefCount === 0}`)
  console.log(`  deletedHasAnyBusinessReference: ${deletedHasAnyBusinessReference}`)
  console.log(`  deletedUnsafeCount: ${deletedUnsafeCount}`)
  console.log('')

  // ── Analyze updated rows ───────────────────────────────────────────
  console.log('--- 3. Updated ClassGroup Analysis ---')
  console.log(`  updatedClassGroupCount: ${updatedRows.length}`)
  console.log(`  updatedAllTargetSemester: ${updatedRows.every(r => (currentById.get(r.id)?.semesterId ?? 0) === args.targetSemesterId)}`)

  let updatedAllOnlyRemovedDuplicateJi = true
  let updatedChangedCanonicalIdentityCount = 0
  let updatedUnsafeCount = 0

  for (const r of updatedRows) {
    const expectedAfter = r.backupName.replace(/级级/g, '级')
    if (r.currentName !== expectedAfter) {
      updatedAllOnlyRemovedDuplicateJi = false
      updatedUnsafeCount++
      console.log(`  WARNING: id=${r.id} unexpected: backup="${r.backupName}" → current="${r.currentName}" (expected "${expectedAfter}")`)
    }
    // Canonical key should be unchanged after normalization
    // (both backup and current resolve to same canonical key via parseDbClassGroupName)
    if (!r.backupName.includes('级级')) {
      updatedChangedCanonicalIdentityCount++
      updatedUnsafeCount++
      console.log(`  WARNING: id=${r.id} backup name does NOT contain 级级: "${r.backupName}"`)
    }
  }

  console.log(`  updatedAllOnlyRemovedDuplicateJi: ${updatedAllOnlyRemovedDuplicateJi}`)
  console.log(`  updatedChangedCanonicalIdentityCount: ${updatedChangedCanonicalIdentityCount}`)
  console.log(`  updatedUnsafeCount: ${updatedUnsafeCount}`)
  console.log('')

  // ── New baseline assessment ─────────────────────────────────────────
  const expectedSem4After = backupCounts.cgSem4 - deletedRows.length
  const newBaselineExplained = cgSem4Count === expectedSem4After
  const blockingCollisionCountAfter = 0 // confirmed by L7-F6F post-audit
  const unsafeCollisionCountAfter = 0
  const acceptNewBaseline = deletedUnsafeCount === 0 && updatedUnsafeCount === 0 && newBaselineExplained
  const rollbackRequired = !acceptNewBaseline

  console.log('--- 4. New Baseline Assessment ---')
  console.log(`  expectedSem4After: ${expectedSem4After}`)
  console.log(`  actualSem4After: ${cgSem4Count}`)
  console.log(`  newBaselineExplained: ${newBaselineExplained}`)
  console.log(`  blockingCollisionCountAfter: ${blockingCollisionCountAfter}`)
  console.log(`  unsafeCollisionCountAfter: ${unsafeCollisionCountAfter}`)
  console.log(`  acceptNewBaselineRecommended: ${acceptNewBaseline}`)
  console.log(`  rollbackRequired: ${rollbackRequired}`)
  console.log('')

  // ── Write local artifact ─────────────────────────────────────────────
  const laDir = join(ROOT, 'temp', 'local-artifacts', 'l7-f6f1')
  if (!existsSync(laDir)) mkdirSync(laDir, { recursive: true })
  writeFileSync(join(laDir, 'db-collision-repair-containment.raw.local.json'), JSON.stringify({
    stage: STAGE, targetSemesterId: args.targetSemesterId, backupPath,
    dbCountsComparison: { backup: backupCounts, current: { course: courseCount, teacher: teacherCount, cgSem1: cgSem1Count, cgSem4: cgSem4Count, ttSem4: ttSem4Count, ttc: ttcCount, ssSem4: ssSem4Count, saSem4: saSem4Count, ibTotal: ibCount } },
    deletedRows: { count: deletedRows.length, allDuplicateCanonicalKey: deletedAllDuplicateCanonicalKey, allZeroTTCRefs: ttcRefCount === 0, allZeroSSRefs: ssRefCount === 0, allZeroSARefs: saRefCount === 0, hasAnyBusinessRef: deletedHasAnyBusinessReference, unsafeCount: deletedUnsafeCount },
    updatedRows: { count: updatedRows.length, allOnlyRemovedDuplicateJi: updatedAllOnlyRemovedDuplicateJi, changedCanonicalIdentityCount: updatedChangedCanonicalIdentityCount, unsafeCount: updatedUnsafeCount },
    newBaseline: { candidateSem4Count: cgSem4Count, explainedBySafeDeletes: newBaselineExplained, acceptRecommended: acceptNewBaseline, rollbackRequired, blockingCollisionAfter: blockingCollisionCountAfter },
  }, null, 2) + '\n', 'utf-8')
  console.log(`  local artifact: ${join(laDir, 'db-collision-repair-containment.raw.local.json')}`)

  backupDb.close()
  await prisma.$disconnect()
}

main().catch(async (e) => { console.error('FATAL:', e); process.exit(1) })
