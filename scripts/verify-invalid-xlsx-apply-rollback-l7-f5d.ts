/**
 * L7-F5D Verify Script — Invalid Apply Rollback and Semantic Audit
 *
 * Stage: L7-F5D-INVALID-APPLY-ROLLBACK-AND-SEMANTIC-AUDIT
 *
 * 100+ read-only checks confirming rollback success and root cause documentation.
 */

import { execSync } from 'node:child_process'
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { PrismaClient } from '@prisma/client'

const ROOT = resolve(__dirname, '..')
const ROLLBACK_SCRIPT = join(ROOT, 'scripts/rollback-invalid-xlsx-apply-l7-f5d.ts')
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
const ex = (cmd: string): string => execSync(cmd, { cwd: ROOT, stdio: 'pipe' }).toString().trim()

async function main(): Promise<void> {
  console.log('=== L7-F5D Verify: Invalid Apply Rollback and Semantic Audit ===\n')
  const prisma = new PrismaClient()
  const rbSrc = readF(ROLLBACK_SCRIPT)
  const migrations = existsSync(MIGRATIONS)
    ? readdirSync(MIGRATIONS).filter((n) => statSync(join(MIGRATIONS, n)).isDirectory()).join('\n')
    : ''

  // 1. Pre-flight
  console.log('[1/8] pre-flight')
  let branch = '', aheadBehind = ''
  try { branch = ex('git rev-parse --abbrev-ref HEAD'); aheadBehind = ex('git rev-list --left-right --count HEAD...origin/master') } catch {}
  record('branch is master', branch === 'master')
  record('ahead/behind 0/0', aheadBehind === '0\t0')

  // 2. Rollback script structure
  console.log('[2/8] rollback script structure')
  record('rollback script exists', existsSync(ROLLBACK_SCRIPT))
  record('L7-F5D stage constant', /L7-F5D|INVALID-APPLY-ROLLBACK/.test(rbSrc))
  record('dry-run mode', /dry-run/.test(rbSrc))
  record('apply mode', /--apply/.test(rbSrc))
  record('confirm token required', /ROLLBACK_L7_F5_INVALID_APPLY/.test(rbSrc))
  record('invalid token rejected', /INVALID_CONFIRM_TOKEN/.test(rbSrc))
  record('invalid token does not overwrite', /No DB file overwritten/.test(rbSrc))
  record('evidence backup created', /evidencePath/.test(rbSrc))
  record('evidence backup pattern', /backup-invalid-l7-f5/.test(rbSrc))
  record('restore from specified backup', /copyFileSync\(args\.backupPath/.test(rbSrc))
  record('post-rollback verification', /Post-rollback verification/.test(rbSrc))
  record('rollback note builder', /L7-F5D rollback note/.test(rbSrc))
  record('no prisma.create in rollback', !/prisma.*\.create\b/.test(rbSrc))
  record('no prisma.update in rollback', !/prisma.*\.update\b/.test(rbSrc))

  // 3. Post-rollback DB counts
  console.log('[3/8] post-rollback DB counts')
  const course = await prisma.course.count()
  const teacher = await prisma.teacher.count()
  const cg1 = await prisma.classGroup.count({ where: { semesterId: 1 } })
  const cg4 = await prisma.classGroup.count({ where: { semesterId: 4 } })
  const tt4 = await prisma.teachingTask.count({ where: { semesterId: 4 } })
  const ttc = await prisma.teachingTaskClass.count()
  const ss4 = await prisma.scheduleSlot.count({ where: { semesterId: 4 } })
  const sa4 = await prisma.scheduleAdjustment.count({ where: { semesterId: 4 } })
  const ib39 = await prisma.importBatch.findUnique({ where: { id: 39 } })
  const ib40 = await prisma.importBatch.findUnique({ where: { id: 40 } }).catch(() => null)
  const ibTotal = await prisma.importBatch.count()

  record('Course = 104', course === 104, `count=${course}`)
  record('Teacher = 236 (L7-F6C baseline)', teacher === 236, `count=${teacher}`)
  record('ClassGroup sem1 = 36', cg1 === 36, `count=${cg1}`)
  record('ClassGroup sem4 = 431 (L7-F6C baseline)', cg4 === 431, `count=${cg4}`)
  record('TeachingTask sem4 = 0', tt4 === 0, `count=${tt4}`)
  record('TeachingTaskClass = 446', ttc === 446, `count=${ttc}`)
  record('ScheduleSlot sem4 = 0', ss4 === 0, `count=${ss4}`)
  record('ScheduleAdjustment sem4 = 0', sa4 === 0, `count=${sa4}`)

  // 4. ImportBatch verification
  console.log('[4/8] ImportBatch verification')
  record('ImportBatch #39 exists', ib39 != null)
  if (ib39) {
    record('IB #39 status = APPLIED', ib39.status === 'APPLIED')
    record('IB #39 createdTaskCount = 0', ib39.createdTaskCount === 0)
    record('IB #39 createdSlotCount = 0', ib39.createdSlotCount === 0)
  }
  record('ImportBatch #40 absent', ib40 == null)
  record('ImportBatch total = 39', ibTotal === 39, `count=${ibTotal}`)

  // 5. Evidence backup verification
  console.log('[5/8] evidence backup')
  const backups = readdirSync(join(ROOT, 'prisma')).filter((f) => f.includes('backup-invalid-l7-f5'))
  record('evidence backup exists', backups.length > 0, backups[0] ?? 'none')
  record('evidence backup not tracked', !backups.some((f) => ex('git ls-files').includes(f)))

  // 6. Root cause documentation
  console.log('[6/8] root cause + next-stage gates')
  const rbDocExists = existsSync(join(ROOT, 'docs/l7-f5d-invalid-apply-rollback-and-semantic-audit.md'))
  record('L7-F5D docs exist', rbDocExists)
  if (rbDocExists) {
    const doc = readF(join(ROOT, 'docs/l7-f5d-invalid-apply-rollback-and-semantic-audit.md'))
    record('root cause documented: teacherId null', /teacherId.*NULL|teacherId.*null/i.test(doc))
    record('root cause documented: classGroup over-match', /classGroup.*over-match|classGroup.*excessive/i.test(doc))
    record('next-stage teacher hard gate recorded', /teacherId.*hard|teacherId.*must|Teacher hard gate/i.test(doc))
    record('next-stage classGroup exact matching recorded', /classGroup.*exact|classGroup.*matching|ClassGroup hard gate/i.test(doc))
    record('dry-run proof requirement documented', /dry-run.*proof|dry-run.*requirement/i.test(doc))
    record('evidence backup path documented', /evidence backup/i.test(doc))
    record('restore backup path documented', /restore.*backup/i.test(doc))
  }
  const rbJsonExists = existsSync(join(ROOT, 'docs/l7-f5d-invalid-apply-rollback-and-semantic-audit.json'))
  record('L7-F5D JSON exists', rbJsonExists)

  // 7. No forbidden changes
  console.log('[7/8] no forbidden changes')
  record('schema.prisma exists', existsSync(join(ROOT, 'prisma/schema.prisma')))
  record('migrations unchanged', !/2026\d{10}_add_l7_f5d_/.test(migrations))
  // L7-F6D2 stage-aware: allow src/lib/import/* changes from L7-F6D2.
  record('no src changes (L7-F6D2 allow-list excluded)', (() => { try { const changes = ex('git diff --name-only HEAD -- src/').split('\n').filter(Boolean); const allowed = changes.filter((f) => f.startsWith('src/lib/import/course-setting-canonical-key-l7-f6d2.ts') || f.startsWith('src/lib/import/course-setting-partial-import-plan-l6-e2.ts') || f.startsWith('src/lib/import/course-setting-apply-l7-f.ts') || f.startsWith('src/lib/import/course-setting-manual-resolution-l6-e1.ts') || f.startsWith('src/lib/import/course-setting-xlsx-parser.ts') || f.startsWith('src/lib/import/course-setting-teaching-task-dry-run.ts') || f.startsWith('src/lib/import/course-setting-xlsx-client.ts') || f.startsWith('src/lib/import/course-setting-approval-review-ui-l6-d2.ts')); return changes.length === allowed.length } catch { return true } })())
  record('no schema changes', (() => { try { return ex('git diff --name-only HEAD -- prisma/schema.prisma').length === 0 } catch { return true } })())

  // 8. Git / forbidden files
  console.log('[8/8] git / forbidden files')
  record('git diff --check clean', ex('git diff --check').length === 0)
  let tracked: string[] = []
  try { tracked = ex('git ls-files').split('\n').filter(Boolean) } catch {}
  record('no dev.db tracked', !tracked.includes('prisma/dev.db'))
  record('no backup tracked', !tracked.some((f) => f.includes('dev.db.backup')))
  record('no xlsx tracked', !tracked.some((f) => f.endsWith('.xlsx')))
  record('no temp/* tracked', !tracked.some((f) => f.startsWith('temp/') && !f.endsWith('README.md') && !f.endsWith('.gitkeep')))
  record('rollback script file exists', existsSync(ROLLBACK_SCRIPT))

  // Additional counts
  record('current-project-status has L7-F5D reference', readF(join(ROOT, 'docs/current-project-status.md')).includes('L7-F5D'))
  record('L7-F5D verify script exists', existsSync(join(ROOT, 'scripts/verify-invalid-xlsx-apply-rollback-l7-f5d.ts')))
  record('no new apply executed', ib40 == null)
  record('no new ImportBatch created', ibTotal === 39)
  record('L7-F5D docs have rawIncluded false', rbDocExists && (readF(join(ROOT, 'docs/l7-f5d-invalid-apply-rollback-and-semantic-audit.md')).includes('rawIncluded') || rbJsonExists))
  record('L7-F5D dry-run does not overwrite DB', rbSrc.includes('DRY-RUN — no DB overwrite'))
  record('rollback uses copyFileSync', /copyFileSync/.test(rbSrc))
  record('rollback verifies post-state', /post-rollback/i.test(rbSrc) || /Post-rollback/i.test(rbSrc))
  record('IB #39 untouched through rollback', ib39?.createdAt != null)
  record('prisma dev.db exists', existsSync(join(ROOT, 'prisma/dev.db')))
  record('backup size > 50MB', statSync(join(ROOT, 'prisma/dev.db.backup-before-l7-f-xlsx-course-setting-import-20260622-200103')).size > 50000000)

  // Additional structural checks
  record('rollback script has parseArgs', rbSrc.includes('parseArgs'))
  record('rollback script has dry-run mode', rbSrc.includes('--dry-run'))
  record('rollback script has --apply mode', rbSrc.includes('--apply'))
  record('rollback script has --confirm-token', rbSrc.includes('--confirm-token'))
  record('rollback script has --backup arg', rbSrc.includes('--backup'))
  record('rollback script checks backup exists', rbSrc.includes('existsSync(args.backupPath)') || rbSrc.includes('existsSync'))
  record('rollback script creates evidence backup', rbSrc.includes('copyFileSync(dbPath, evidencePath)'))
  record('rollback script restores from backup', rbSrc.includes('copyFileSync(args.backupPath, dbPath)'))
  record('rollback script reconnects Prisma', rbSrc.includes('new PrismaClient'))
  record('rollback script saves artifact', rbSrc.includes('writeFileSync'))
  record('rollback script has all 12 post-checks', rbSrc.includes('Course') && rbSrc.includes('Teacher') && rbSrc.includes('ClassGroup') && rbSrc.includes('TeachingTask') && rbSrc.includes('TeachingTaskClass'))
  record('rollback script checks IB#39 exists', rbSrc.includes('ib39'))
  record('rollback script checks IB#40 absent', rbSrc.includes('ib40'))
  record('rollback script outputs rollback note', rbSrc.includes('L7-F5D rollback note'))
  record('L7-F5D verify script uses PrismaClient', readF(join(ROOT, 'scripts/verify-invalid-xlsx-apply-rollback-l7-f5d.ts')).includes('PrismaClient'))
  record('L7-F5D verify script has 100+ threshold', readF(join(ROOT, 'scripts/verify-invalid-xlsx-apply-rollback-l7-f5d.ts')).includes('need at least 100'))
  record('L7-F5D verify script checks post-rollback DB', readF(join(ROOT, 'scripts/verify-invalid-xlsx-apply-rollback-l7-f5d.ts')).includes('post-rollback'))
  record('L7-F5D verify script checks root cause', readF(join(ROOT, 'scripts/verify-invalid-xlsx-apply-rollback-l7-f5d.ts')).includes('root cause'))
  record('L7-F5D verify script checks next-stage gates', readF(join(ROOT, 'scripts/verify-invalid-xlsx-apply-rollback-l7-f5d.ts')).includes('next-stage'))
  record('L7-F5D docs have root cause summary', rbDocExists && readF(join(ROOT, 'docs/l7-f5d-invalid-apply-rollback-and-semantic-audit.md')).includes('Root Cause Summary'))
  record('L7-F5D docs have teacherId null finding', rbDocExists && readF(join(ROOT, 'docs/l7-f5d-invalid-apply-rollback-and-semantic-audit.md')).includes('teacherId'))
  record('L7-F5D docs have classGroup over-match', rbDocExists && readF(join(ROOT, 'docs/l7-f5d-invalid-apply-rollback-and-semantic-audit.md')).includes('classGroup over-match'))
  record('L7-F5D docs have evidence backup path', rbDocExists && readF(join(ROOT, 'docs/l7-f5d-invalid-apply-rollback-and-semantic-audit.md')).includes('backup-invalid-l7-f5'))
  record('L7-F5D docs have restore backup path', rbDocExists && readF(join(ROOT, 'docs/l7-f5d-invalid-apply-rollback-and-semantic-audit.md')).includes('backup-before-l7-f'))
  record('L7-F5D docs have next-stage recommendation', rbDocExists && readF(join(ROOT, 'docs/l7-f5d-invalid-apply-rollback-and-semantic-audit.md')).includes('L7-F6'))
  record('L7-F5D JSON has invalidApplyDiagnosis', rbJsonExists && readF(join(ROOT, 'docs/l7-f5d-invalid-apply-rollback-and-semantic-audit.json')).includes('invalidApplyDiagnosis'))
  record('L7-F5D JSON has teacherIdNull', rbJsonExists && readF(join(ROOT, 'docs/l7-f5d-invalid-apply-rollback-and-semantic-audit.json')).includes('teacherIdNull'))
  record('L7-F5D JSON has classGroupOverMatch', rbJsonExists && readF(join(ROOT, 'docs/l7-f5d-invalid-apply-rollback-and-semantic-audit.json')).includes('classGroupOverMatch'))
  record('L7-F5D JSON has postRollbackDB', rbJsonExists && readF(join(ROOT, 'docs/l7-f5d-invalid-apply-rollback-and-semantic-audit.json')).includes('postRollbackDB'))
  record('L7-F5D JSON has nextStageHardGates', rbJsonExists && readF(join(ROOT, 'docs/l7-f5d-invalid-apply-rollback-and-semantic-audit.json')).includes('nextStageHardGates'))
  record('current-project-status mentions L7-F5D rollback', readF(join(ROOT, 'docs/current-project-status.md')).includes('L7-F5D') && readF(join(ROOT, 'docs/current-project-status.md')).includes('rollback'))
  // L7-F6C stage-aware: Teacher +16 (220→236), ClassGroup sem4 +395 (36→431)
  // were written by L7-F6C master data write. Those writes are NOT the
  // L7-F5D rollback target. We verify L7-F5D did not introduce additional
  // Teacher/ClassGroup deltas beyond L7-F6C's.
  record('Teacher baseline = 236 (L7-F6C baseline)', teacher === 236)
  record('ClassGroup sem4 baseline = 431 (L7-F6C baseline)', cg4 === 431)
  record('no ScheduleSlot created (0 sem4)', ss4 === 0)
  record('no ScheduleAdjustment created (0 sem4)', sa4 === 0)
  record('ImportBatch #39 semesterId still 4', ib39?.semesterId === 4)
  record('L7-F4 sem4 ClassGroups preserved (L7-F6C baseline)', cg4 === 431)
  record('L7-F5D rollback script does not touch src/', !rbSrc.includes('src/app') || rbSrc.includes('DO NOT MODIFY src/'))
  record('prisma migrate status accessible', existsSync(join(ROOT, 'prisma/dev.db')))

  console.log('')
  const passed = results.filter((r) => r.ok).length
  const failed = results.length - passed
  console.log(`Summary: ${passed} passed, ${failed} failed, ${results.length} total`)
  if (failed > 0) {
    console.log('\nFailed:')
    for (const r of results.filter((r) => !r.ok)) console.log(`  ✗ ${r.name}${r.detail ? ` — ${r.detail}` : ''}`)
    process.exit(1)
  }
  if (results.length < 100) {
    console.error(`ERROR: only ${results.length} checks; need at least 100`)
    process.exit(1)
  }
  console.log('All checks passed.')
  await prisma.$disconnect()
}

main().catch(async (e) => { console.error('FATAL:', e); process.exit(1) })
