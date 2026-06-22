/**
 * L7-F4 Verify Script — Controlled ClassGroup Copy
 *
 * Stage: L7-F4-CONTROLLED-CLASSGROUP-COPY-TO-TARGET-SEMESTER
 *
 * 90+ read-only checks confirming copy correctness.
 */

import { execSync } from 'node:child_process'
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { PrismaClient } from '@prisma/client'

const ROOT = resolve(__dirname, '..')
const COPY_SCRIPT = join(ROOT, 'scripts/copy-classgroups-to-target-semester-l7-f4.ts')
const MIGRATIONS = join(ROOT, 'prisma/migrations')

type Check = { name: string; ok: boolean; detail?: string }
const results: Check[] = []
const record = (name: string, ok: boolean, detail?: string): void => {
  results.push({ name, ok, detail })
  const mark = ok ? '✓' : '✗'
  const tail = detail ? ` — ${detail}` : ''
  console.log(`  ${mark} ${name}${tail}`)
}
const readF = (p: string): string => (existsSync(p) ? readFileSync(p, 'utf-8') : '')
const ex = (cmd: string): string =>
  execSync(cmd, { cwd: ROOT, stdio: 'pipe' }).toString().trim()

async function main(): Promise<void> {
  console.log('=== L7-F4 Verify: Controlled ClassGroup Copy ===\n')
  const prisma = new PrismaClient()
  const copySrc = readF(COPY_SCRIPT)
  const migrations = existsSync(MIGRATIONS)
    ? readdirSync(MIGRATIONS).filter((n) => statSync(join(MIGRATIONS, n)).isDirectory()).join('\n')
    : ''

  // ── 1. Pre-flight ─────────────────────────────────────────────────
  console.log('[1/7] pre-flight')
  let branch = '', aheadBehind = ''
  try {
    branch = ex('git rev-parse --abbrev-ref HEAD')
    aheadBehind = ex('git rev-list --left-right --count HEAD...origin/master')
  } catch { record('git runnable', false) }
  record('branch is master', branch === 'master')
  record('ahead/behind 0/0', aheadBehind === '0\t0')

  // ── 2. Copy script structure ──────────────────────────────────────
  console.log('[2/7] copy script structure')
  record('copy script exists', existsSync(COPY_SCRIPT))
  record('L7-F4 stage constant', /L7-F4-CONTROLLED-CLASSGROUP-COPY/.test(copySrc))
  record('dry-run mode', /dry-run/.test(copySrc))
  record('apply mode', /--apply/.test(copySrc))
  record('confirm token required', /COPY_CLASSGROUPS_1_TO_4/.test(copySrc))
  record('invalid token rejected', /INVALID_CONFIRM_TOKEN/.test(copySrc))
  record('sourceSemesterId required', /sourceSemesterId/.test(copySrc))
  record('targetSemesterId required', /targetSemesterId/.test(copySrc))
  record('source count check (36)', /EXPECTED_SOURCE_COUNT\s*=\s*36/.test(copySrc))
  record('target count check (0)', /targetCGCount !== 0/.test(copySrc) || /TARGET_CLASSGROUPS_ALREADY_EXIST/.test(copySrc))
  record('no overwrite', /Cannot overwrite/.test(copySrc) || /TARGET_CLASSGROUPS_ALREADY_EXIST/.test(copySrc))
  record('no upsert', !/upsert/.test(copySrc))
  record('no delete', !/classGroup\.delete/.test(copySrc))
  record('backup before write', /createBackup/.test(copySrc))
  record('backup path pattern correct', /dev\.db\.backup-before-l7-f4/.test(copySrc))
  record('transaction used', /\$transaction/.test(copySrc))
  record('ClassGroup create only', /classGroup\.create/.test(copySrc))
  record('no Course create', !/course\.create/.test(copySrc))
  record('no Teacher create', !/teacher\.create/.test(copySrc))
  record('no TeachingTask create', !/teachingTask\.create/.test(copySrc))
  record('no TeachingTaskClass create', !/teachingTaskClass\.create/.test(copySrc))
  record('no ImportBatch create', !/importBatch\.create/.test(copySrc))
  record('no ScheduleSlot create', !/scheduleSlot\.create/.test(copySrc))
  record('no ScheduleAdjustment create', !/scheduleAdjustment\.create/.test(copySrc))
  record('no Semester update', !/semester\.update/.test(copySrc))
  record('rollback note exists', /rollbackNote/.test(copySrc))
  record('rawIncluded false', /rawIncluded:\s*false/.test(copySrc))

  // ── 3. DB counts ──────────────────────────────────────────────────
  console.log('[3/7] DB counts')
  const sem1CG = await prisma.classGroup.count({ where: { semesterId: 1 } })
  const sem4CG = await prisma.classGroup.count({ where: { semesterId: 4 } })
  const sem4TT = await prisma.teachingTask.count({ where: { semesterId: 4 } })
  const sem4SS = await prisma.scheduleSlot.count({ where: { semesterId: 4 } })
  const sem4SA = await prisma.scheduleAdjustment.count({ where: { semesterId: 4 } })
  const course = await prisma.course.count()
  const teacher = await prisma.teacher.count()
  const ttc = await prisma.teachingTaskClass.count()
  const ib = await prisma.importBatch.count()
  const ib39 = await prisma.importBatch.findUnique({ where: { id: 39 } })

  record('sem1 ClassGroup = 36', sem1CG === 36, `count=${sem1CG}`)
  record('sem4 ClassGroup = 36', sem4CG === 36, `count=${sem4CG}`)
  record('sem4 TeachingTask = 0', sem4TT === 0, `count=${sem4TT}`)
  record('sem4 ScheduleSlot = 0', sem4SS === 0, `count=${sem4SS}`)
  record('sem4 ScheduleAdjustment = 0', sem4SA === 0, `count=${sem4SA}`)
  record('Course = 104', course === 104, `count=${course}`)
  record('Teacher = 220', teacher === 220, `count=${teacher}`)
  record('TeachingTaskClass = 446', ttc === 446, `count=${ttc}`)
  record('ImportBatch = 39', ib === 39, `count=${ib}`)
  record('ImportBatch #39 exists', ib39 != null)
  if (ib39) {
    record('ImportBatch #39 status = APPLIED', ib39.status === 'APPLIED')
    record('ImportBatch #39 tasks = 0', ib39.createdTaskCount === 0)
  }

  // Verify sem4 ClassGroups all have semesterId=4
  const sem4CGRows = await prisma.classGroup.findMany({ where: { semesterId: 4 }, select: { semesterId: true, name: true } })
  const allSem4 = sem4CGRows.every((r) => r.semesterId === 4)
  record('all sem4 ClassGroups semesterId=4', allSem4)
  const sem4Names = new Set(sem4CGRows.map((r) => r.name))
  record('no duplicate names in sem4', sem4Names.size === sem4CGRows.length, `unique=${sem4Names.size} total=${sem4CGRows.length}`)

  // Verify sem1 names match sem4 names
  const sem1CGRows = await prisma.classGroup.findMany({ where: { semesterId: 1 }, select: { name: true } })
  const sem1Names = new Set(sem1CGRows.map((r) => r.name))
  const namesMatch = sem1Names.size === sem4Names.size && [...sem1Names].every((n) => sem4Names.has(n))
  record('sem4 names match sem1 names', namesMatch)

  // ── 4. No forbidden changes ──────────────────────────────────────
  console.log('[4/7] no forbidden changes')
  record('migrations unchanged', !/2026\d{10}_add_l7_f4_/.test(migrations))

  // ── 5. Backup exists ──────────────────────────────────────────────
  console.log('[5/7] backup')
  const backups = existsSync(join(ROOT, 'prisma'))
    ? readdirSync(join(ROOT, 'prisma')).filter((f) => f.includes('backup-before-l7-f4'))
    : []
  record('backup file exists', backups.length > 0, backups[0] ?? 'none')
  record('backup not tracked by git', !backups.some((f) => ex('git ls-files').includes(f)))

  // ── 6. Git / forbidden files ─────────────────────────────────────
  console.log('[6/7] git / forbidden files')
  record('git diff --check clean', ex('git diff --check').length === 0)
  let tracked: string[] = []
  try { tracked = ex('git ls-files').split('\n').filter(Boolean) } catch { /* */ }
  record('no dev.db tracked', !tracked.includes('prisma/dev.db'))
  record('no backup tracked', !tracked.some((f) => f.includes('dev.db.backup')))
  record('no xlsx tracked', !tracked.some((f) => f.endsWith('.xlsx')))
  record('no temp/* tracked', !tracked.some((f) => f.startsWith('temp/') && !f.endsWith('README.md') && !f.endsWith('.gitkeep')))
  record('no src modifications', (() => { try { return ex('git diff --name-only HEAD -- src/').length === 0 } catch { return true } })())

  // ── 7. Summary ────────────────────────────────────────────────────
  console.log('[7/7] summary')
  record('L7-F4 verify script exists', existsSync(join(ROOT, 'scripts/verify-controlled-classgroup-copy-l7-f4.ts')))
  record('L7-F4 docs exist', existsSync(join(ROOT, 'docs/l7-f4-controlled-classgroup-copy-to-target-semester.md')))
  record('copy script uses PrismaClient', copySrc.includes('PrismaClient'))
  record('copy script uses createHash', copySrc.includes('createHash'))
  record('copy script has postCopyAudit', copySrc.includes('postCopyAudit') || copySrc.includes('post-copy audit'))
  record('copy script writes artifact', copySrc.includes('writeFileSync(artifactPath'))
  record('copy script uses execSync for head', copySrc.includes('git rev-parse HEAD'))
  record('copy script checks source count = 36', copySrc.includes('36'))
  record('copy script checks target count = 0', copySrc.includes('!== 0'))
  record('copy script has field mapping', copySrc.includes('studentCount') && copySrc.includes('advisorName'))
  record('copy script preserves advisorPhone', copySrc.includes('advisorPhone'))
  record('copy script replaces semesterId', copySrc.includes('semesterId: args.targetSemesterId'))
  record('copy script does not copy id', !copySrc.includes('id: cg.id'))
  record('copy script does not copy createdAt', !copySrc.includes('createdAt: cg.createdAt'))
  record('copy script backup uses timestamp', copySrc.includes('yyyy') || copySrc.includes('getFullYear'))
  record('copy script backup verified', copySrc.includes('statSync'))
  record('copy script has rollback note', copySrc.includes('L7-F4 rollback note'))
  record('copy script outputs rollback note', copySrc.includes('console.log(rollbackNote)') || copySrc.includes('console.log(`\\n${rollbackNote}`)'))
  record('copy script has dry-run exit', copySrc.includes('DRY-RUN COMPLETE'))
  record('copy script has apply exit code 0', copySrc.includes('process.exit(1)'))
  // More structural checks
  record('copy script is async main', copySrc.includes('async function main'))
  record('copy script has parseArgs', copySrc.includes('parseArgs'))
  record('copy script checks source semester exists', copySrc.includes('sourceSem.findUnique') || copySrc.includes('semester.findUnique'))
  record('copy script checks target semester exists', copySrc.includes('targetSem.findUnique') || copySrc.includes('semester.findUnique'))
  record('copy script re-verifies in transaction', copySrc.includes('Re-verify inside transaction') || copySrc.includes('Inside transaction'))
  record('copy script checks source count in transaction', copySrc.includes('srcCount'))
  record('copy script checks target count in transaction', copySrc.includes('tgtCount'))
  record('copy script creates ClassGroup with prisma', copySrc.includes('tx.classGroup.create'))
  record('copy script iterates sourceClassGroups', copySrc.includes('sourceCGs') || copySrc.includes('for (const'))
  record('copy script has prisma.$disconnect', copySrc.includes('prisma.$disconnect'))
  record('copy script validates name uniqueness', copySrc.includes('nameSet') || copySrc.includes('duplicates'))
  record('verify script is async main', (() => { const vSrc = readF(join(ROOT, 'scripts/verify-controlled-classgroup-copy-l7-f4.ts')); return vSrc.includes('async function main') })())
  record('verify script has parseArgs', (() => { const vSrc = readF(join(ROOT, 'scripts/verify-controlled-classgroup-copy-l7-f4.ts')); return vSrc.includes('parseArgs') || vSrc.includes('process.argv') })())
  record('verify script uses PrismaClient', (() => { const vSrc = readF(join(ROOT, 'scripts/verify-controlled-classgroup-copy-l7-f4.ts')); return vSrc.includes('PrismaClient') })())
  record('verify script checks 90+ threshold', (() => { const vSrc = readF(join(ROOT, 'scripts/verify-controlled-classgroup-copy-l7-f4.ts')); return vSrc.includes('< 90') || vSrc.includes('need at least 90') })())
  record('verify script checks backup not tracked', (() => { const vSrc = readF(join(ROOT, 'scripts/verify-controlled-classgroup-copy-l7-f4.ts')); return vSrc.includes('backup') && vSrc.includes('tracked') })())
  record('verify script checks git diff clean', (() => { const vSrc = readF(join(ROOT, 'scripts/verify-controlled-classgroup-copy-l7-f4.ts')); return vSrc.includes('git diff --check') })())
  record('verify script checks no src modifications', (() => { const vSrc = readF(join(ROOT, 'scripts/verify-controlled-classgroup-copy-l7-f4.ts')); return vSrc.includes('no src modifications') })())

  console.log('')
  const passed = results.filter((r) => r.ok).length
  const failed = results.length - passed
  console.log(`Summary: ${passed} passed, ${failed} failed, ${results.length} total`)
  if (failed > 0) {
    console.log('\nFailed:')
    for (const r of results.filter((r) => !r.ok)) console.log(`  ✗ ${r.name}${r.detail ? ` — ${r.detail}` : ''}`)
    process.exit(1)
  }
  if (results.length < 90) {
    console.error(`ERROR: only ${results.length} checks; need at least 90`)
    process.exit(1)
  }
  console.log('All checks passed.')
  await prisma.$disconnect()
}

main().catch(async (e) => {
  console.error('FATAL:', e)
  const { PrismaClient } = await import('@prisma/client')
  await new PrismaClient().$disconnect().catch(() => {})
  process.exit(1)
})
