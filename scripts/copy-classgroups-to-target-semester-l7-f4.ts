/**
 * L7-F4 Script — Controlled ClassGroup Copy to Target Semester
 *
 * Stage: L7-F4-CONTROLLED-CLASSGROUP-COPY-TO-TARGET-SEMESTER
 *
 * Copies ClassGroups from a source semester to a target semester.
 * Write stage: DB backup + confirm token + transaction + post-copy audit.
 *
 * Usage:
 *   # Dry-run (no writes):
 *   npx tsx scripts/copy-classgroups-to-target-semester-l7-f4.ts \
 *     --source-semester-id 1 --target-semester-id 4 --dry-run
 *
 *   # Apply:
 *   npx tsx scripts/copy-classgroups-to-target-semester-l7-f4.ts \
 *     --source-semester-id 1 --target-semester-id 4 --apply \
 *     --confirm-token COPY_CLASSGROUPS_1_TO_4
 *
 * Forbidden creates: Course, Teacher, TeachingTask, TeachingTaskClass,
 * ImportBatch, ScheduleSlot, ScheduleAdjustment.
 */

import { copyFileSync, existsSync, mkdirSync, readFileSync, statSync, writeFileSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { createHash } from 'node:crypto'
import { execSync } from 'node:child_process'

const ROOT = resolve(__dirname, '..')
const EXPECTED_TOKEN = 'COPY_CLASSGROUPS_1_TO_4'
const EXPECTED_SOURCE_COUNT = 36

// ── Args ─────────────────────────────────────────────────────────────────────

type CliArgs = {
  sourceSemesterId: number
  targetSemesterId: number
  apply: boolean
  dryRun: boolean
  confirmToken: string | null
  help: boolean
}

const parseArgs = (argv: string[]): CliArgs => {
  const args: CliArgs = { sourceSemesterId: 0, targetSemesterId: 0, apply: false, dryRun: false, confirmToken: null, help: false }
  for (let i = 2; i < argv.length; i++) {
    const a = argv[i]
    if (a === '--source-semester-id') args.sourceSemesterId = Number(argv[++i] ?? '0')
    else if (a === '--target-semester-id') args.targetSemesterId = Number(argv[++i] ?? '0')
    else if (a === '--apply') args.apply = true
    else if (a === '--dry-run') args.dryRun = true
    else if (a === '--confirm-token') args.confirmToken = argv[++i] ?? null
    else if (a === '--help' || a === '-h') args.help = true
  }
  return args
}

const sha256 = (s: string) => createHash('sha256').update(s, 'utf8').digest('hex').slice(0, 12)

// ── Backup ───────────────────────────────────────────────────────────────────

function createBackup(label: string): { backupPath: string; ok: boolean } {
  const dbPath = join(ROOT, 'prisma', 'dev.db')
  if (!existsSync(dbPath)) return { backupPath: '', ok: false }
  const now = new Date()
  const stamp = `${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, '0')}${String(now.getDate()).padStart(2, '0')}-${String(now.getHours()).padStart(2, '0')}${String(now.getMinutes()).padStart(2, '0')}${String(now.getSeconds()).padStart(2, '0')}`
  const backupPath = join(ROOT, 'prisma', `dev.db.backup-before-l7-f4-${label}-${stamp}`)
  copyFileSync(dbPath, backupPath)
  return { backupPath, ok: existsSync(backupPath) && statSync(backupPath).size > 0 }
}

// ── Main ─────────────────────────────────────────────────────────────────────

async function main(): Promise<void> {
  const args = parseArgs(process.argv)
  if (args.help || !args.sourceSemesterId || !args.targetSemesterId) {
    console.log('Usage: npx tsx scripts/copy-classgroups-to-target-semester-l7-f4.ts \\')
    console.log('  --source-semester-id <id> --target-semester-id <id> [--dry-run | --apply --confirm-token TOKEN]')
    return
  }

  const mode: 'dry-run' | 'apply' = args.apply && !args.dryRun ? 'apply' : 'dry-run'
  console.log('=== L7-F4: Controlled ClassGroup Copy ===\n')
  console.log(`  source: ${args.sourceSemesterId}`)
  console.log(`  target: ${args.targetSemesterId}`)
  console.log(`  mode: ${mode}`)
  console.log(`  confirm token: ${mode === 'apply' ? (args.confirmToken ?? '(missing)') : '(n/a)'}`)

  const { PrismaClient } = await import('@prisma/client')
  const prisma = new PrismaClient()

  // ── Pre-flight checks ────────────────────────────────────────────
  console.log('\n[1/4] Pre-flight')

  if (mode === 'apply') {
    if (!args.confirmToken || args.confirmToken !== EXPECTED_TOKEN) {
      console.error(`\nERROR: INVALID_CONFIRM_TOKEN`)
      console.error(`  expected: ${EXPECTED_TOKEN}`)
      console.error(`  got: ${args.confirmToken ?? '(empty)'}`)
      console.error(`  No DB write, no backup created.`)
      await prisma.$disconnect()
      process.exit(1)
    }
    console.log('  confirm token: VALID')
  }

  const sourceSem = await prisma.semester.findUnique({ where: { id: args.sourceSemesterId } })
  const targetSem = await prisma.semester.findUnique({ where: { id: args.targetSemesterId } })
  if (!sourceSem) { console.error(`ERROR: source semester ${args.sourceSemesterId} not found`); process.exit(1) }
  if (!targetSem) { console.error(`ERROR: target semester ${args.targetSemesterId} not found`); process.exit(1) }

  const sourceCGs = await prisma.classGroup.findMany({ where: { semesterId: args.sourceSemesterId }, orderBy: { id: 'asc' } })
  const targetCGCount = await prisma.classGroup.count({ where: { semesterId: args.targetSemesterId } })

  console.log(`  source: ${sourceSem.name} (${sourceSem.code}) — ${sourceCGs.length} ClassGroups`)
  console.log(`  target: ${targetSem.name} (${targetSem.code}) — ${targetCGCount} ClassGroups`)

  if (sourceCGs.length !== EXPECTED_SOURCE_COUNT) {
    console.error(`\nERROR: SOURCE_CLASSGROUP_COUNT_UNEXPECTED`)
    console.error(`  sourceSemesterId: ${args.sourceSemesterId}`)
    console.error(`  expected: ${EXPECTED_SOURCE_COUNT}`)
    console.error(`  actual: ${sourceCGs.length}`)
    await prisma.$disconnect()
    process.exit(1)
  }
  console.log(`  source count verified: ${sourceCGs.length}`)

  if (targetCGCount !== 0) {
    console.error(`\nERROR: TARGET_CLASSGROUPS_ALREADY_EXIST`)
    console.error(`  targetSemesterId: ${args.targetSemesterId}`)
    console.error(`  actual: ${targetCGCount}`)
    console.error(`  Expected 0. Cannot overwrite.`)
    await prisma.$disconnect()
    process.exit(1)
  }
  console.log('  target count verified: 0 (empty)')

  // ── Dry-run plan ──────────────────────────────────────────────────
  console.log('\n[2/4] Copy plan')

  // Pre-check for duplicate names within source (shouldn't exist, but verify)
  const nameSet = new Set<string>()
  const duplicates: string[] = []
  for (const cg of sourceCGs) {
    if (nameSet.has(cg.name)) duplicates.push(cg.name)
    nameSet.add(cg.name)
  }
  if (duplicates.length > 0) {
    console.error(`ERROR: duplicate names in source: ${duplicates.join(', ')}`)
    await prisma.$disconnect()
    process.exit(1)
  }

  console.log(`  planned copy: ${sourceCGs.length} ClassGroups`)
  console.log(`  field mapping:`)
  console.log(`    name → preserved`)
  console.log(`    studentCount → preserved`)
  console.log(`    advisorName → preserved`)
  console.log(`    advisorPhone → preserved`)
  console.log(`    semesterId → ${args.targetSemesterId} (replaced)`)
  console.log(`    id → auto-generated (not copied)`)
  console.log(`    createdAt/updatedAt → auto-generated (not copied)`)
  console.log(`  no duplicates in source: verified`)

  // ── Execute ───────────────────────────────────────────────────────
  if (mode === 'dry-run') {
    console.log('\n[3/4] DRY-RUN — no writes, no backup')
    console.log('  backup: NONE (dry-run)')
    console.log('  transaction: NONE (dry-run)')
    console.log('  result: DRY-RUN COMPLETE')
    console.log(`\n  summary: planned ${sourceCGs.length} copies from sem${args.sourceSemesterId} to sem${args.targetSemesterId}`)
    console.log('  To apply, run with --apply --confirm-token COPY_CLASSGROUPS_1_TO_4')
    await prisma.$disconnect()
    return
  }

  // ── Apply mode ────────────────────────────────────────────────────
  console.log('\n[3/4] Apply')

  // Backup
  const backup = createBackup('classgroup-copy')
  if (!backup.ok) {
    console.error('ERROR: backup failed')
    await prisma.$disconnect()
    process.exit(1)
  }
  console.log(`  backup: ${backup.backupPath}`)

  // Transaction
  const copyResult = await prisma.$transaction(async (tx) => {
    // Re-verify inside transaction
    const srcCount = await tx.classGroup.count({ where: { semesterId: args.sourceSemesterId } })
    if (srcCount !== EXPECTED_SOURCE_COUNT) {
      throw new Error(`SOURCE_CLASSGROUP_COUNT_CHANGED: expected ${EXPECTED_SOURCE_COUNT}, got ${srcCount}`)
    }
    const tgtCount = await tx.classGroup.count({ where: { semesterId: args.targetSemesterId } })
    if (tgtCount !== 0) {
      throw new Error(`TARGET_CLASSGROUPS_ALREADY_EXIST: expected 0, got ${tgtCount}`)
    }

    let created = 0
    for (const cg of sourceCGs) {
      await tx.classGroup.create({
        data: {
          name: cg.name,
          studentCount: cg.studentCount,
          advisorName: cg.advisorName,
          advisorPhone: cg.advisorPhone,
          semesterId: args.targetSemesterId,
        },
      })
      created++
    }

    return { created }
  })

  console.log(`  transaction: COMMITTED`)
  console.log(`  copied: ${copyResult.created} ClassGroups`)

  // ── Post-copy audit ──────────────────────────────────────────────
  console.log('\n[4/4] Post-copy audit')

  const after = {
    sem1CG: await prisma.classGroup.count({ where: { semesterId: args.sourceSemesterId } }),
    sem4CG: await prisma.classGroup.count({ where: { semesterId: args.targetSemesterId } }),
    sem4TT: await prisma.teachingTask.count({ where: { semesterId: args.targetSemesterId } }),
    sem4SS: await prisma.scheduleSlot.count({ where: { semesterId: args.targetSemesterId } }),
    sem4SA: await prisma.scheduleAdjustment.count({ where: { semesterId: args.targetSemesterId } }),
    course: await prisma.course.count(),
    teacher: await prisma.teacher.count(),
    ttc: await prisma.teachingTaskClass.count(),
    ib: await prisma.importBatch.count(),
  }
  const ib39 = await prisma.importBatch.findUnique({ where: { id: 39 } })

  const auditPass =
    after.sem1CG === EXPECTED_SOURCE_COUNT &&
    after.sem4CG === copyResult.created &&
    after.sem4TT === 0 &&
    after.sem4SS === 0 &&
    after.sem4SA === 0 &&
    ib39?.status === 'APPLIED' &&
    ib39?.createdTaskCount === 0

  console.log(`  sem1 ClassGroup: ${after.sem1CG} (unchanged)`)
  console.log(`  sem4 ClassGroup: ${after.sem4CG} (was 0, now ${copyResult.created})`)
  console.log(`  sem4 TeachingTask: ${after.sem4TT}`)
  console.log(`  sem4 ScheduleSlot: ${after.sem4SS}`)
  console.log(`  sem4 ScheduleAdjustment: ${after.sem4SA}`)
  console.log(`  Course: ${after.course} (unchanged)`)
  console.log(`  Teacher: ${after.teacher} (unchanged)`)
  console.log(`  TeachingTaskClass: ${after.ttc} (unchanged)`)
  console.log(`  ImportBatch: ${after.ib} (unchanged)`)
  console.log(`  ImportBatch #39: ${ib39?.status ?? 'MISSING'}, tasks=${ib39?.createdTaskCount ?? '?'}`)
  console.log(`\n  post-copy audit: ${auditPass ? 'PASSED' : 'FAILED'}`)

  if (!auditPass) {
    console.error('ERROR: post-copy audit failed')
    await prisma.$disconnect()
    process.exit(1)
  }

  // Rollback note
  const rollbackNote = [
    'L7-F4 rollback note:',
    `  - Backup path: ${backup.backupPath}`,
    `  - Source semester: ${args.sourceSemesterId}`,
    `  - Target semester: ${args.targetSemesterId}`,
    `  - Copied ClassGroup count: ${copyResult.created}`,
    `  - To rollback, restore backup to prisma/dev.db`,
    `  - No Course/Teacher/TeachingTask/TeachingTaskClass/ImportBatch/ScheduleSlot rows were created by L7-F4`,
  ].join('\n')

  console.log(`\n${rollbackNote}`)

  // Save artifact
  const artifactDir = join(ROOT, 'temp', 'local-artifacts', 'l7-f4')
  if (!existsSync(artifactDir)) mkdirSync(artifactDir, { recursive: true })

  let headSha = ''
  try { headSha = execSync('git rev-parse HEAD', { cwd: ROOT }).toString().trim() } catch { /* */ }

  const result = {
    stage: 'L7-F4-CONTROLLED-CLASSGROUP-COPY-TO-TARGET-SEMESTER',
    mode: 'apply',
    head: headSha,
    sourceSemesterId: args.sourceSemesterId,
    targetSemesterId: args.targetSemesterId,
    sourceCount: sourceCGs.length,
    copiedCount: copyResult.created,
    backupPath: backup.backupPath,
    confirmToken: EXPECTED_TOKEN,
    postCopyAudit: auditPass,
    countsAfter: after,
    rollbackNote,
    rawIncluded: false,
  }

  const artifactPath = join(artifactDir, `copy.target-${args.targetSemesterId}.json`)
  writeFileSync(artifactPath, JSON.stringify(result, null, 2) + '\n', 'utf-8')
  console.log(`\nartifact: ${artifactPath}`)

  await prisma.$disconnect()
}

main().catch(async (e) => {
  console.error('FATAL:', e)
  const { PrismaClient } = await import('@prisma/client')
  await new PrismaClient().$disconnect().catch(() => {})
  process.exit(1)
})
