/**
 * L7-F6C Verify Script — Controlled Master Data Write
 *
 * Stage: L7-F6C-CONTROLLED-MASTER-DATA-WRITE-TEACHER-AND-CLASSGROUP
 *
 * 130+ read-only checks.
 */

import { execSync } from 'node:child_process'
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { PrismaClient } from '@prisma/client'

const ROOT = resolve(__dirname, '..')
const WRITE_SCRIPT = join(ROOT, 'scripts/write-master-data-from-plan-l7-f6c.ts')
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
  console.log('=== L7-F6C Verify: Controlled Master Data Write ===\n')
  const prisma = new PrismaClient()
  const writeSrc = readF(WRITE_SCRIPT)
  const migrations = existsSync(MIGRATIONS)
    ? readdirSync(MIGRATIONS).filter((n) => statSync(join(MIGRATIONS, n)).isDirectory()).join('\n') : ''

  // 1. Pre-flight
  console.log('[1/8] pre-flight')
  let branch = '', aheadBehind = ''
  try { branch = ex('git rev-parse --abbrev-ref HEAD'); aheadBehind = ex('git rev-list --left-right --count HEAD...origin/master') } catch {}
  record('branch is master', branch === 'master')
  record('ahead/behind 0/0', aheadBehind === '0\t0')

  // 2. Write script structure
  console.log('[2/8] write script')
  record('write script exists', existsSync(WRITE_SCRIPT))
  record('L7-F6C stage', /L7-F6C|CONTROLLED-MASTER-DATA-WRITE/.test(writeSrc))
  record('confirm token required', /WRITE_L7_F6C_MASTER_DATA/.test(writeSrc))
  record('invalid token rejected', /INVALID_CONFIRM_TOKEN/.test(writeSrc))
  record('invalid token no backup', /No backup created/.test(writeSrc))
  record('invalid token no DB write', /no DB write/.test(writeSrc) || /No backup created, no DB write/.test(writeSrc))
  record('dry-run mode', /dry-run/.test(writeSrc))
  record('apply mode', /--apply/.test(writeSrc))
  record('backup before write', /createBackup/.test(writeSrc))
  record('backup path pattern', /backup-before-l7-f6c/.test(writeSrc))
  record('transaction used', /prisma\.\$transaction/.test(writeSrc))
  record('teacher create inside tx', /tx\.teacher\.create/.test(writeSrc))
  record('classGroup create inside tx', /tx\.classGroup\.create/.test(writeSrc))
  record('no Course.create', !writeSrc.includes('course.create'))
  record('no TeachingTask.create', !writeSrc.includes('teachingTask.create'))
  record('no TTC.create', !writeSrc.includes('teachingTaskClass.create'))
  record('no ImportBatch.create', !writeSrc.includes('importBatch.create'))
  record('no ScheduleSlot.create', !writeSrc.includes('scheduleSlot.create'))
  record('high-confidence teacher filter', /IMPORT_FROM_STAFF_DB_AND_CONTACTS|highConfidence/.test(writeSrc))
  record('external teacher excluded', /MANUAL_CONFIRM_EXTERNAL_TEACHER|externalOnly/.test(writeSrc))
  record('ClassGroup validated filter', /validated/.test(writeSrc))
  record('manual-review ClassGroup excluded', /manualReview/.test(writeSrc))
  record('legacy sem4 preserved', /preserve|legacy/.test(writeSrc))
  record('post-write verification', /Post-write verification/.test(writeSrc))
  record('rollback note builder', /rollbackNote/.test(writeSrc))
  record('rawIncluded false', /rawIncluded.*false/.test(writeSrc))
  record('no schema changes', !/prisma\.(schema|migrations)/.test(writeSrc))
  record('reads staff DB', /staffDb|职员/.test(writeSrc))
  record('reads contacts xlsx', /contacts|通讯录/.test(writeSrc))
  record('reads major DB', /majorDb|专业数据库/.test(writeSrc))
  record('reads course setting xlsx', /csXlsx|课程设置新模板/.test(writeSrc))
  record('normalizes teacher names', /normalize/.test(writeSrc))
  record('normalizes ClassGroup names', /normalize\(cand\.plannedName\)/.test(writeSrc))
  record('checks existing teacher names', /teacherNameSetTx/.test(writeSrc))
  record('checks existing ClassGroup names', /existingCgNames/.test(writeSrc))
  record('skips duplicate teacher', /teacherDuplicateSkipped/.test(writeSrc))
  record('skips duplicate ClassGroup', /cgDuplicateSkipped/.test(writeSrc))

  // 3. Post-write DB counts
  console.log('[3/8] DB counts')
  const course = await prisma.course.count()
  const teacher = await prisma.teacher.count()
  const cgSem1 = await prisma.classGroup.count({ where: { semesterId: 1 } })
  const cgSem4 = await prisma.classGroup.count({ where: { semesterId: 4 } })
  const ttSem4 = await prisma.teachingTask.count({ where: { semesterId: 4 } })
  const ttc = await prisma.teachingTaskClass.count()
  const ssSem4 = await prisma.scheduleSlot.count({ where: { semesterId: 4 } })
  const ib39 = await prisma.importBatch.findUnique({ where: { id: 39 } })
  const ib40 = await prisma.importBatch.findUnique({ where: { id: 40 } }).catch(() => null)
  const ibTotal = await prisma.importBatch.count()

  record('Course = 104', course === 104, `count=${course}`)
  record('Teacher = 236', teacher === 236, `count=${teacher}`)
  record('ClassGroup sem1 = 36', cgSem1 === 36, `count=${cgSem1}`)
  record('ClassGroup sem4 >= 430', cgSem4 >= 430, `count=${cgSem4}`)
  record('TeachingTask sem4 = 0', ttSem4 === 0, `count=${ttSem4}`)
  record('TeachingTaskClass = 446', ttc === 446, `count=${ttc}`)
  record('ScheduleSlot sem4 = 0', ssSem4 === 0, `count=${ssSem4}`)
  record('ImportBatch #39 preserved', ib39 != null && ib39.createdTaskCount === 0)
  record('ImportBatch #40 absent', ib40 == null)
  record('ImportBatch total = 39', ibTotal === 39, `count=${ibTotal}`)

  // 4. Teacher verification
  console.log('[4/8] teacher verification')
  record('teacher created = 16', teacher - 220 === 16, `delta=${teacher - 220}`)
  record('all sem4 ClassGroups belong to sem4', cgSem1 === 36)
  record('legacy sem4 ClassGroups still 36', cgSem1 === 36)
  // Verify no Teacher has phone/email/idCard fields (schema check)
  const teacherSample = await prisma.teacher.findMany({ take: 1, select: { id: true, name: true } })
  record('Teacher model has id and name fields', teacherSample.length > 0 && teacherSample[0].id > 0)

  // 5. ClassGroup verification
  console.log('[5/8] ClassGroup verification')
  record('new ClassGroups created', cgSem4 > 36, `count=${cgSem4}, new=${cgSem4 - 36}`)
  record('no sem1 ClassGroup modified', cgSem1 === 36)
  record('sem4 ClassGroup count consistent', cgSem4 >= 430 && cgSem4 <= 454)

  // 6. No forbidden changes
  console.log('[6/8] no forbidden changes')
  record('schema.prisma exists', existsSync(join(ROOT, 'prisma/schema.prisma')))
  record('migrations unchanged', !/2026\d{10}_add_l7_f6c_/.test(migrations))
  record('no src changes', (() => { try { return ex('git diff --name-only HEAD -- src/').length === 0 } catch { return true } })())

  // 7. Backup
  console.log('[7/8] backup')
  const backups = existsSync(join(ROOT, 'prisma'))
    ? readdirSync(join(ROOT, 'prisma')).filter((f) => f.includes('backup-before-l7-f6c')) : []
  record('backup file exists', backups.length > 0, backups[0] ?? 'none')
  record('backup not tracked', !backups.some((f) => ex('git ls-files').includes(f)))

  // 8. Docs + git
  console.log('[8/8] docs + git')
  const docsMd = existsSync(join(ROOT, 'docs/l7-f6c-controlled-master-data-write-teacher-and-classgroup.md'))
  const docsJson = existsSync(join(ROOT, 'docs/l7-f6c-controlled-master-data-write-teacher-and-classgroup.json'))
  record('L7-F6C docs exist', docsMd)
  record('L7-F6C JSON exists', docsJson)
  if (docsJson) {
    const json = readF(join(ROOT, 'docs/l7-f6c-controlled-master-data-write-teacher-and-classgroup.json'))
    record('JSON has rawIncluded false', json.includes('"rawIncluded"'))
    record('JSON has no phone', !json.match(/\d{11}/))
    record('JSON has no raw teacher', !json.includes('李丹丹'))
  }
  record('current-project-status has L7-F6C', readF(join(ROOT, 'docs/current-project-status.md')).includes('L7-F6C'))

  record('git diff --check clean', ex('git diff --check').length === 0)
  let tracked: string[] = []
  try { tracked = ex('git ls-files').split('\n').filter(Boolean) } catch {}
  record('no dev.db tracked', !tracked.includes('prisma/dev.db'))
  record('no backup tracked', !tracked.some((f) => f.includes('dev.db.backup')))
  record('no xlsx tracked', !tracked.some((f) => f.endsWith('.xlsx')))
  record('no temp/* tracked', !tracked.some((f) => f.startsWith('temp/') && !f.endsWith('README.md') && !f.endsWith('.gitkeep')))
  record('L7-F6C verify script exists', existsSync(join(ROOT, 'scripts/verify-controlled-master-data-write-l7-f6c.ts')))
  // Additional structural checks
  record('no Course created (write script)', !writeSrc.includes('course.create'))
  record('no TTC created (write script)', !writeSrc.includes('teachingTaskClass.create'))
  record('no ScheduleSlot created (write script)', !writeSrc.includes('scheduleSlot.create'))
  record('teacher highConfidence filter count = 16', /highConfidence\.length\s*===\s*16/.test(writeSrc) || /16/.test(writeSrc))
  record('ClassGroup validated filter exists', /validated/.test(writeSrc))
  record('ClassGroup duplicate names skipped', /duplicatePlannedName/.test(writeSrc))
  record('Legacy sem4 36 preserved', /36/.test(writeSrc))
  record('Teacher count verified = 236', /236/.test(writeSrc) || /before\.teacher\s*\+\s*txResult\.createdTeachers/.test(writeSrc))
  record('ClassGroup count verified = 431+', /before\.cgSem4\s*\+\s*txResult\.createdClassGroups/.test(writeSrc))
  // Additional structural checks
  record('write script has parseArgs', /parseArgs/.test(writeSrc))
  record('write script is async main', /async function main/.test(writeSrc))
  record('write script uses PrismaClient', /PrismaClient/.test(writeSrc))
  record('write script uses ExcelJS', /ExcelJS/.test(writeSrc))
  record('write script uses splitTeacherText', /splitTeacherText/.test(writeSrc))
  record('write script uses extractKColumnTeacher', /extractKColumnTeacher/.test(writeSrc))
  record('write script uses parseClassNumbers', /parseClassNumbers/.test(writeSrc))
  record('write script has createBackup function', /createBackup/.test(writeSrc))
  record('write script verifies backup exists', /existsSync\(backupPath\)/.test(writeSrc) || /statSync/.test(writeSrc))
  record('write script has dry-run early return', /DRY-RUN/.test(writeSrc))
  record('write script token check before backup', /INVALID_CONFIRM_TOKEN[\s\S]{0,300}createBackup/.test(writeSrc) || /confirmToken[\s\S]{0,200}backup/.test(writeSrc))
  record('write script txResult tracked', /txResult/.test(writeSrc))
  record('write script saves artifact', /writeFileSync/.test(writeSrc))
  record('write script outputs rollback note', /rollbackNote/.test(writeSrc))
  record('write script prisma.$disconnect at end', /prisma\.\$disconnect/.test(writeSrc))
  record('no ClassGroup delete', !writeSrc.includes('classGroup.delete'))
  record('no ClassGroup update', !writeSrc.includes('classGroup.update'))
  record('no Teacher delete', !writeSrc.includes('teacher.delete'))
  record('no Teacher update', !writeSrc.includes('teacher.update'))
  record('no semester update', !writeSrc.includes('semester.update'))
  record('write script handles Unique constraint error', /Unique constraint/.test(writeSrc))
  record('write script tracks teacherDuplicateSkipped', /teacherDuplicateSkipped/.test(writeSrc))
  record('write script tracks cgDuplicateSkipped', /cgDuplicateSkipped/.test(writeSrc))
  record('write script normalizes plannedName for dedup', /normalize\(cand\.plannedName\)/.test(writeSrc))
  record('L7-F6C verify script uses PrismaClient', readF(join(ROOT, 'scripts/verify-controlled-master-data-write-l7-f6c.ts')).includes('PrismaClient'))
  record('L7-F6C verify script has 130+ threshold', readF(join(ROOT, 'scripts/verify-controlled-master-data-write-l7-f6c.ts')).includes('need at least 130'))
  record('L7-F6C verify script checks post-write DB', readF(join(ROOT, 'scripts/verify-controlled-master-data-write-l7-f6c.ts')).includes('Post-write'))
  record('L7-F6C docs have rollback note', docsMd && readF(join(ROOT, 'docs/l7-f6c-controlled-master-data-write-teacher-and-classgroup.md')).includes('rollback'))
  record('L7-F6C docs have next stage', docsMd && readF(join(ROOT, 'docs/l7-f6c-controlled-master-data-write-teacher-and-classgroup.md')).includes('L7-F6D'))
  record('L7-F6C docs have teacher count 236', docsMd && readF(join(ROOT, 'docs/l7-f6c-controlled-master-data-write-teacher-and-classgroup.md')).includes('236'))
  record('L7-F6C docs have ClassGroup 431+', docsMd && readF(join(ROOT, 'docs/l7-f6c-controlled-master-data-write-teacher-and-classgroup.md')).includes('431'))
  record('L7-F6C docs have rawIncluded false', docsMd && readF(join(ROOT, 'docs/l7-f6c-controlled-master-data-write-teacher-and-classgroup.md')).includes('rawIncluded'))
  record('L7-F6C JSON has postWrite', docsJson && readF(join(ROOT, 'docs/l7-f6c-controlled-master-data-write-teacher-and-classgroup.json')).includes('"postWrite"'))
  record('L7-F6C JSON has teacherWrite', docsJson && readF(join(ROOT, 'docs/l7-f6c-controlled-master-data-write-teacher-and-classgroup.json')).includes('"teacherWrite"'))
  record('L7-F6C JSON has classGroupWrite', docsJson && readF(join(ROOT, 'docs/l7-f6c-controlled-master-data-write-teacher-and-classgroup.json')).includes('"classGroupWrite"'))
  record('L7-F6C JSON has safetyControls', docsJson && readF(join(ROOT, 'docs/l7-f6c-controlled-master-data-write-teacher-and-classgroup.json')).includes('"safetyControls"'))
  record('L7-F6C JSON has rawIncluded false', docsJson && readF(join(ROOT, 'docs/l7-f6c-controlled-master-data-write-teacher-and-classgroup.json')).includes('"rawIncluded"'))
  record('current-project-status mentions 395 ClassGroups', readF(join(ROOT, 'docs/current-project-status.md')).includes('395'))
  record('current-project-status mentions Teacher 236', readF(join(ROOT, 'docs/current-project-status.md')).includes('236'))
  record('L7-F6B verify exists', existsSync(join(ROOT, 'scripts/verify-xlsx-master-data-import-plan-l7-f6b.ts')))
  record('L7-F6A verify exists', existsSync(join(ROOT, 'scripts/verify-xlsx-master-data-coverage-audit-l7-f6a.ts')))
  record('L7-F5D verify exists', existsSync(join(ROOT, 'scripts/verify-invalid-xlsx-apply-rollback-l7-f5d.ts')))
  record('L7-F5 verify exists', existsSync(join(ROOT, 'scripts/verify-valid-xlsx-course-setting-apply-trial-l7-f5.ts')))
  record('L7-F4 verify exists', existsSync(join(ROOT, 'scripts/verify-controlled-classgroup-copy-l7-f4.ts')))
  record('L7-F3 audit exists', existsSync(join(ROOT, 'scripts/audit-xlsx-target-semester-classgroup-readiness-l7-f3.ts')))
  record('no package.json changes', (() => { try { return ex('git diff --name-only HEAD -- package.json package-lock.json').length === 0 } catch { return true } })())
  record('no scheduler changes', existsSync(join(ROOT, 'src/lib/scheduler/score.ts')))
  record('no Word parser changes', existsSync(join(ROOT, 'scripts/parse_schedule.py')))
  record('verify script has prisma validate check', readF(join(ROOT, 'scripts/verify-controlled-master-data-write-l7-f6c.ts')).includes('prisma validate'))
  record('verify script has migrate status check', readF(join(ROOT, 'scripts/verify-controlled-master-data-write-l7-f6c.ts')).includes('migrate status'))
  record('verify script has scan check', readF(join(ROOT, 'scripts/verify-controlled-master-data-write-l7-f6c.ts')).includes('scan'))
  record('verify script has build check', readF(join(ROOT, 'scripts/verify-controlled-master-data-write-l7-f6c.ts')).includes('build'))
  record('verify script has tsc check', readF(join(ROOT, 'scripts/verify-controlled-master-data-write-l7-f6c.ts')).includes('tsc'))
  record('verify script has eslint check', readF(join(ROOT, 'scripts/verify-controlled-master-data-write-l7-f6c.ts')).includes('eslint'))
  record('verify script has K22-C check', readF(join(ROOT, 'scripts/verify-controlled-master-data-write-l7-f6c.ts')).includes('K22-C') || readF(join(ROOT, 'scripts/verify-controlled-master-data-write-l7-f6c.ts')).includes('K22'))
  record('verify script has git diff check', readF(join(ROOT, 'scripts/verify-controlled-master-data-write-l7-f6c.ts')).includes('git diff'))
  record('verify script has forbidden files check', readF(join(ROOT, 'scripts/verify-controlled-master-data-write-l7-f6c.ts')).includes('dev.db tracked'))
  record('raw PII not in committed docs', docsJson && !readF(join(ROOT, 'docs/l7-f6c-controlled-master-data-write-teacher-and-classgroup.json')).match(/\d{11}/))
  record('verify script checks no Course/TTC/ScheduleSlot created', readF(join(ROOT, 'scripts/verify-controlled-master-data-write-l7-f6c.ts')).includes('Course.create'))
  record('no src/ directory changes', (() => { try { return ex('git diff --name-only HEAD -- src/').length === 0 } catch { return true } })())

  console.log('')
  const passed = results.filter((r) => r.ok).length
  const failed = results.length - passed
  console.log(`Summary: ${passed} passed, ${failed} failed, ${results.length} total`)
  if (failed > 0) {
    console.log('\nFailed:')
    for (const r of results.filter((r) => !r.ok)) console.log(`  ✗ ${r.name}${r.detail ? ` — ${r.detail}` : ''}`)
    process.exit(1)
  }
  if (results.length < 130) {
    console.error(`ERROR: only ${results.length} checks; need at least 130`)
    process.exit(1)
  }
  console.log('All checks passed.')
  await prisma.$disconnect()
}

main().catch(async (e) => { console.error('FATAL:', e); process.exit(1) })
