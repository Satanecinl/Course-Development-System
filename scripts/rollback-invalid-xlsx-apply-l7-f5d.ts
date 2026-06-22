/**
 * L7-F5D Rollback Script — Rollback Invalid XLSX Apply
 *
 * Stage: L7-F5D-INVALID-APPLY-ROLLBACK-AND-SEMANTIC-AUDIT
 *
 * Restores prisma/dev.db from the L7-F5 pre-apply backup. The L7-F5
 * apply created invalid TeachingTasks (all teacherId=NULL) and
 * over-linked TeachingTaskClass (avg 21.77 classGroups per task).
 *
 * Usage:
 *   --dry-run (default, no DB overwrite)
 *   --apply --confirm-token ROLLBACK_L7_F5_INVALID_APPLY
 */

import { copyFileSync, existsSync, readFileSync, statSync, writeFileSync, mkdirSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { execSync } from 'node:child_process'

const ROOT = resolve(__dirname, '..')
const CONFIRM_TOKEN = 'ROLLBACK_L7_F5_INVALID_APPLY'

type CliArgs = {
  apply: boolean
  dryRun: boolean
  confirmToken: string | null
  backupPath: string
  help: boolean
}

const parseArgs = (argv: string[]): CliArgs => {
  const args: CliArgs = { apply: false, dryRun: false, confirmToken: null, backupPath: '', help: false }
  for (let i = 2; i < argv.length; i++) {
    const a = argv[i]
    if (a === '--apply') args.apply = true
    else if (a === '--dry-run') args.dryRun = true
    else if (a === '--confirm-token') args.confirmToken = argv[++i] ?? null
    else if (a === '--backup') args.backupPath = argv[++i] ?? ''
    else if (a === '--help' || a === '-h') args.help = true
  }
  return args
}

async function main(): Promise<void> {
  const args = parseArgs(process.argv)
  if (args.help) {
    console.log('Usage: npx tsx scripts/rollback-invalid-xlsx-apply-l7-f5d.ts [--dry-run | --apply --confirm-token TOKEN] --backup <path>')
    return
  }

  const mode: 'dry-run' | 'apply' = args.apply && !args.dryRun ? 'apply' : 'dry-run'
  console.log('=== L7-F5D: Rollback Invalid XLSX Apply ===\n')
  console.log(`  mode: ${mode}`)
  console.log(`  backup: ${args.backupPath}`)

  // Validate backup path
  if (!args.backupPath || !existsSync(args.backupPath)) {
    console.error('ERROR: backup path not found:', args.backupPath)
    process.exit(1)
  }
  const backupSize = statSync(args.backupPath).size
  console.log(`  backup size: ${backupSize} bytes`)

  // Read current invalid state counts
  const { PrismaClient } = await import('@prisma/client')
  const p = new PrismaClient()
  const before = {
    course: await p.course.count(),
    teacher: await p.teacher.count(),
    cgSem1: await p.classGroup.count({ where: { semesterId: 1 } }),
    cgSem4: await p.classGroup.count({ where: { semesterId: 4 } }),
    ttSem4: await p.teachingTask.count({ where: { semesterId: 4 } }),
    ttc: await p.teachingTaskClass.count(),
    ssSem4: await p.scheduleSlot.count({ where: { semesterId: 4 } }),
    saSem4: await p.scheduleAdjustment.count({ where: { semesterId: 4 } }),
    ib39: await p.importBatch.findUnique({ where: { id: 39 } }),
    ib40: await p.importBatch.findUnique({ where: { id: 40 } }).catch(() => null),
    ibTotal: await p.importBatch.count(),
  }
  await p.$disconnect()

  console.log('\n[1/4] Current invalid state')
  console.log(`  Course: ${before.course}`)
  console.log(`  Teacher: ${before.teacher}`)
  console.log(`  sem4 CG: ${before.cgSem4}`)
  console.log(`  sem4 TT: ${before.ttSem4}`)
  console.log(`  TTC: ${before.ttc}`)
  console.log(`  IB #39: ${before.ib39?.status ?? 'MISSING'}`)
  console.log(`  IB #40: ${before.ib40 ? 'EXISTS' : 'absent'}`)
  console.log(`  IB total: ${before.ibTotal}`)

  const hasL7F5Data = before.course > 104 || before.ttSem4 > 0
  console.log(`  L7-F5 invalid data present: ${hasL7F5Data}`)

  // Expected post-rollback
  const expected = {
    course: 104,
    teacher: 220,
    cgSem1: 36,
    cgSem4: 36,
    ttSem4: 0,
    ttc: 446,
    ssSem4: 0,
    saSem4: 0,
    ibTotal: 39,
  }

  console.log('\n[2/4] Expected post-rollback state')
  console.log(`  Course: ${expected.course}`)
  console.log(`  Teacher: ${expected.teacher}`)
  console.log(`  sem4 CG: ${expected.cgSem4} (preserved from L7-F4)`)
  console.log(`  sem4 TT: ${expected.ttSem4} (L7-F5 data removed)`)
  console.log(`  TTC: ${expected.ttc} (L7-F5 TTC removed)`)
  console.log(`  IB total: ${expected.ibTotal} (IB #40 removed)`)

  if (mode === 'dry-run') {
    console.log('\n[3/4] DRY-RUN — no DB overwrite')
    console.log('  evidence backup: NONE (dry-run)')
    console.log('  restore: NONE (dry-run)')
    console.log('  result: DRY-RUN COMPLETE')
    console.log('  To execute: --apply --confirm-token ROLLBACK_L7_F5_INVALID_APPLY')
    return
  }

  // Apply mode
  if (!args.confirmToken || args.confirmToken !== CONFIRM_TOKEN) {
    console.error(`\nERROR: INVALID_CONFIRM_TOKEN`)
    console.error(`  expected: ${CONFIRM_TOKEN}`)
    console.error(`  got: ${args.confirmToken ?? '(empty)'}`)
    console.error(`  No DB file overwritten.`)
    process.exit(1)
  }
  console.log('  confirm token: VALID')

  console.log('\n[3/4] Rollback')

  // Create evidence backup of current invalid DB
  const now = new Date()
  const stamp = `${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, '0')}${String(now.getDate()).padStart(2, '0')}-${String(now.getHours()).padStart(2, '0')}${String(now.getMinutes()).padStart(2, '0')}${String(now.getSeconds()).padStart(2, '0')}`
  const evidencePath = join(ROOT, 'prisma', `dev.db.backup-invalid-l7-f5-before-rollback-${stamp}`)
  const dbPath = join(ROOT, 'prisma', 'dev.db')

  try {
    copyFileSync(dbPath, evidencePath)
    console.log(`  evidence backup: ${evidencePath}`)
    console.log(`  evidence backup size: ${statSync(evidencePath).size} bytes`)
  } catch (e) {
    console.error('ERROR: evidence backup failed:', e)
    process.exit(1)
  }

  // Restore
  try {
    copyFileSync(args.backupPath, dbPath)
    console.log(`  restored from: ${args.backupPath}`)
    console.log(`  restored db size: ${statSync(dbPath).size} bytes`)
  } catch (e) {
    console.error('ERROR: restore failed:', e)
    process.exit(1)
  }

  // Reconnect Prisma and verify
  console.log('\n[4/4] Post-rollback verification')
  const p2 = new PrismaClient()
  const after = {
    course: await p2.course.count(),
    teacher: await p2.teacher.count(),
    cgSem1: await p2.classGroup.count({ where: { semesterId: 1 } }),
    cgSem4: await p2.classGroup.count({ where: { semesterId: 4 } }),
    ttSem4: await p2.teachingTask.count({ where: { semesterId: 4 } }),
    ttc: await p2.teachingTaskClass.count(),
    ssSem4: await p2.scheduleSlot.count({ where: { semesterId: 4 } }),
    saSem4: await p2.scheduleAdjustment.count({ where: { semesterId: 4 } }),
    ib39: await p2.importBatch.findUnique({ where: { id: 39 } }),
    ib40: await p2.importBatch.findUnique({ where: { id: 40 } }).catch(() => null),
    ibTotal: await p2.importBatch.count(),
  }

  const check = (name: string, ok: boolean, detail?: string) => {
    console.log(`  ${ok ? '✓' : '✗'} ${name}${detail ? ' — ' + detail : ''}`)
    return ok
  }
  let allPass = true
  allPass = check('Course = 104', after.course === 104, `actual=${after.course}`) && allPass
  allPass = check('Teacher = 220', after.teacher === 220, `actual=${after.teacher}`) && allPass
  allPass = check('sem1 CG = 36', after.cgSem1 === 36, `actual=${after.cgSem1}`) && allPass
  allPass = check('sem4 CG = 36', after.cgSem4 === 36, `actual=${after.cgSem4}`) && allPass
  allPass = check('sem4 TT = 0', after.ttSem4 === 0, `actual=${after.ttSem4}`) && allPass
  allPass = check('TTC = 446', after.ttc === 446, `actual=${after.ttc}`) && allPass
  allPass = check('sem4 SS = 0', after.ssSem4 === 0, `actual=${after.ssSem4}`) && allPass
  allPass = check('sem4 SA = 0', after.saSem4 === 0, `actual=${after.saSem4}`) && allPass
  allPass = check('IB #39 exists', after.ib39 != null) && allPass
  allPass = check('IB #39 tasks = 0', after.ib39?.createdTaskCount === 0, `actual=${after.ib39?.createdTaskCount}`) && allPass
  allPass = check('IB #40 absent', after.ib40 == null) && allPass
  allPass = check('IB total = 39', after.ibTotal === 39, `actual=${after.ibTotal}`) && allPass

  console.log(`\n  rollback: ${allPass ? 'SUCCESS' : 'FAILED — CHECK ERRORS ABOVE'}`)

  if (!allPass) process.exit(1)

  // Rollback note
  const note = [
    'L7-F5D rollback note:',
    `  - Evidence backup: ${evidencePath}`,
    `  - Restore from: ${args.backupPath}`,
    `  - Rollback status: SUCCESS`,
    `  - L7-F5 invalid data (248 TT, 5398 TTC, 248 Course) removed`,
    `  - L7-F4 sem4 ClassGroup=36 preserved`,
    `  - ImportBatch #39 preserved, #40 removed`,
    `  - Teacher=220 unchanged`,
  ].join('\n')
  console.log(`\n${note}`)

  // Save artifact
  const artifactDir = join(ROOT, 'temp', 'local-artifacts', 'l7-f5d')
  if (!existsSync(artifactDir)) mkdirSync(artifactDir, { recursive: true })
  let headSha = ''
  try { headSha = execSync('git rev-parse HEAD', { cwd: ROOT }).toString().trim() } catch {}
  writeFileSync(join(artifactDir, 'rollback.json'), JSON.stringify({
    stage: 'L7-F5D-INVALID-APPLY-ROLLBACK-AND-SEMANTIC-AUDIT',
    head: headSha,
    evidencePath,
    restoreFrom: args.backupPath,
    rollbackStatus: 'SUCCESS',
    before, after,
  }, null, 2) + '\n', 'utf-8')
}

main().catch(async (e) => {
  console.error('FATAL:', e)
  process.exit(1)
})
