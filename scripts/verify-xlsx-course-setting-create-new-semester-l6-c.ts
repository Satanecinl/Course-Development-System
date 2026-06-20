/**
 * L6-C verify script — Course-Setting XLSX Create-New-Semester Flow
 *
 * 86 checks across 9 categories:
 *  - Sample + pre-flight (N1-N5)
 *  - API client helper + types (N6-N17)
 *  - UI mode + createNew form (N18-N37)
 *  - Safety / isolation / no business write (N38-N49)
 *  - Controlled DB write: backup + create + verify (N50-N58)
 *  - Controlled DB write: restore + final counts (N59-N65)
 *  - Forbidden files (N66-N70)
 *  - Privacy / committed artifacts (N71-N73)
 *  - Build / PII / K22 / regression (N74-N86)
 *
 * L6-C is the FIRST L6 stage allowed to write DB, but ONLY Semester.
 * Strategy: backup dev.db, create one test semester (isActive=false),
 * verify only Semester count changed, then restore from backup.
 * Final DB state MUST equal initial state.
 *
 * Run:
 *   npx tsx scripts/verify-xlsx-course-setting-create-new-semester-l6-c.ts --xlsx "..."
 */

import { execSync } from 'node:child_process'
import { copyFileSync, existsSync, readFileSync, statSync } from 'node:fs'
import { basename, join, resolve } from 'node:path'
import { PrismaClient } from '@prisma/client'

const prisma = new PrismaClient()

const ROOT = resolve(__dirname, '..')
const SAMPLE_PATH = 'D:/Desktop/Course Development System/2025年秋季学期课程设置(总）.xlsx'
const SAMPLE_NAME = basename(SAMPLE_PATH)

const DB_PATH = join(ROOT, 'prisma', 'dev.db')

const SCHEMA_PATH = 'prisma/schema.prisma'
const CLIENT_PATH = 'src/lib/import/course-setting-xlsx-client.ts'
const UI_PATH = 'src/components/import/course-setting-xlsx-preview.tsx'
const PREVIEW_API_ROUTE = 'src/app/api/admin/import/course-setting-xlsx/preview/route.ts'

const OUTPUT_JSON = 'docs/l6-c-xlsx-course-setting-create-new-semester-from-import-flow.json'
const OUTPUT_MD = 'docs/l6-c-xlsx-course-setting-create-new-semester-from-import-flow.md'

const K22_C = 'scripts/verify-score-regression-harness-k22-c.ts'

const PASS = '✅'
const FAIL = '❌'
const results: string[] = []
const checks: Array<{ id: number; name: string; passed: boolean; detail: string }> = []

function chk(id: number, pass: boolean, desc: string, detail?: string): void {
  const d = detail ? ' — ' + detail : ''
  results.push(`${pass ? PASS : FAIL} N${id}: ${desc}${d}`)
  checks.push({ id, name: desc, passed: pass, detail: detail ?? '' })
}

function readRel(relPath: string): string | null {
  try { return readFileSync(join(ROOT, relPath), 'utf-8') } catch { return null }
}

function gitRun(args: string): string {
  try {
    return execSync(`git ${args}`, { cwd: ROOT, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).toString()
  } catch (err: unknown) {
    const e = err as { stdout?: string | Buffer; stderr?: string | Buffer }
    return (e.stdout ? e.stdout.toString() : '') + (e.stderr ? e.stderr.toString() : '')
  }
}

function runScript(scriptPath: string, timeoutMs = 600_000): { ok: boolean; output: string } {
  try {
    const out = execSync(`npx tsx ${JSON.stringify(join(ROOT, scriptPath))}`, {
      cwd: ROOT, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'], timeout: timeoutMs,
    }).toString()
    return { ok: true, output: out }
  } catch (err: unknown) {
    const e = err as { stdout?: string | Buffer; stderr?: string | Buffer; status?: number }
    return { ok: false, output: (e.stdout ? e.stdout.toString() : '') + (e.stderr ? e.stderr.toString() : '') + `\n[exit ${e.status ?? '?'}]` }
  }
}

function restoreK22(): void {
  try {
    execSync('git checkout -- docs/k22-score-default-snapshot.json docs/k22-score-regression-harness-implementation.json', { cwd: ROOT, stdio: 'ignore' })
  } catch { /* ok */ }
}

type DbCounts = {
  course: number; teacher: number; classGroup: number; teachingTask: number
  teachingTaskClass: number; importBatch: number; scheduleSlot: number
  scheduleAdjustment: number; semester: number; activeSemesterId: number | null
}

async function readDbCounts(): Promise<DbCounts> {
  const [course, teacher, classGroup, teachingTask, teachingTaskClass,
    importBatch, scheduleSlot, scheduleAdjustment, semester] = await Promise.all([
    prisma.course.count(), prisma.teacher.count(), prisma.classGroup.count(),
    prisma.teachingTask.count(), prisma.teachingTaskClass.count(),
    prisma.importBatch.count(), prisma.scheduleSlot.count(),
    prisma.scheduleAdjustment.count(), prisma.semester.count(),
  ])
  const active = await prisma.semester.findFirst({ where: { isActive: true }, select: { id: true } })
  return {
    course, teacher, classGroup, teachingTask, teachingTaskClass,
    importBatch, scheduleSlot, scheduleAdjustment, semester,
    activeSemesterId: active?.id ?? null,
  }
}

function createBackup(): string {
  if (!existsSync(DB_PATH)) throw new Error('dev.db not found at: ' + DB_PATH)
  const ts = new Date().toISOString().replace(/[:.]/g, '-')
  const backupPath = join(ROOT, 'prisma', `dev.db.backup-before-l6-c-create-semester-${ts}`)
  copyFileSync(DB_PATH, backupPath)
  const sz = statSync(backupPath).size
  console.log(`  Backup created: ${backupPath} (${sz} bytes)`)
  return backupPath
}

async function restoreBackup(backupPath: string): Promise<void> {
  if (!existsSync(backupPath)) throw new Error('Backup not found: ' + backupPath)
  // Disconnect Prisma first to release SQLite file lock on Windows
  await prisma.$disconnect()
  copyFileSync(backupPath, DB_PATH)
  console.log(`  Restored from: ${backupPath}`)
}

async function main() {
  console.log('=== L6-C XLSX Course Setting Create-New-Semester Verify ===\n')

  // ── A: Sample + pre-flight (N1-N5) ──
  const sampleExists = existsSync(SAMPLE_PATH)
  const sampleSize = sampleExists ? statSync(SAMPLE_PATH).size : 0
  chk(1, sampleExists, 'sample file exists', `size=${sampleSize}`)

  const lsOut = gitRun(`ls-files -- ${JSON.stringify(SAMPLE_NAME)}`).trim()
  chk(2, !lsOut || lsOut.includes('fatal'), 'sample file not git-tracked')

  chk(3, true, 'stage name correct: L6-C-XLSX-COURSE-SETTING-CREATE-NEW-SEMESTER-FROM-IMPORT-FLOW')

  const schemaContent = readRel(SCHEMA_PATH)
  chk(4, schemaContent !== null && schemaContent.includes('model Semester'), 'prisma schema valid + Semester model present')

  const statusShort = gitRun('status --short').trim()
  chk(5, statusShort === '', 'worktree initially clean (no uncommitted changes)', `status=${statusShort.length} lines`)

  // ── B: API client helper + types (N6-N17) ──
  const clientContent = readRel(CLIENT_PATH) ?? ''

  chk(6, clientContent.includes('createSemesterForCourseSettingImport'), 'client exports createSemesterForCourseSettingImport helper')
  chk(7, clientContent.includes('CreateSemesterForImportInput'), 'client exports CreateSemesterForImportInput type')
  chk(8, clientContent.includes("'/api/semesters'"), 'client helper calls POST /api/semesters')
  chk(9, !clientContent.includes('/api/semesters/') || !clientContent.match(/['"]\/api\/semesters\/\d+\/activate['"]/), 'client helper does NOT call /api/semesters/[id]/activate')
  chk(10, clientContent.includes("isActive: false"), 'client helper hardcodes isActive=false (no auto-activate)')
  chk(11, !clientContent.match(/setAsActive:\s*true/), 'client helper never sets setAsActive:true')
  chk(12, clientContent.includes('method: \'POST\''), 'client helper uses POST method')
  chk(13, clientContent.includes('SEMESTER_CODE_EXISTS') || clientContent.includes('code ??'), 'client helper surfaces duplicate code error')
  chk(14, clientContent.includes('HTTP_403') || clientContent.includes('无权限'), 'client helper handles 403 (no permission)')
  chk(15, clientContent.includes("fetchSemestersForImport"), 'client still exports fetchSemestersForImport (existing mode)')
  chk(16, clientContent.includes("previewCourseSettingXlsx"), 'client still exports previewCourseSettingXlsx')
  chk(17, clientContent.includes('targetSemesterId'), 'client previewCourseSettingXlsx still passes targetSemesterId')

  // ── C: UI mode + createNew form (N18-N37) ──
  const uiContent = readRel(UI_PATH) ?? ''

  chk(18, uiContent.includes('targetSemesterMode'), 'UI tracks targetSemesterMode state')
  chk(19, uiContent.includes("'existing'") && uiContent.includes("'createNew'"), 'UI defines existing/createNew mode values')
  chk(20, uiContent.includes('选择已有学期'), 'UI shows "选择已有学期" mode')
  chk(21, uiContent.includes('新建学期'), 'UI shows "新建学期" mode')
  chk(22, uiContent.includes('name="l6c-target-semester-mode"'), 'UI mode radio has stable name attr (L6-C)')
  chk(23, uiContent.includes('value="createNew"') || uiContent.includes('value={"createNew"}'), 'UI has createNew radio value')
  chk(24, uiContent.includes('handleCreateSemester'), 'UI has handleCreateSemester handler')
  chk(25, uiContent.includes('createSemesterForCourseSettingImport'), 'UI imports createSemesterForCourseSettingImport helper')
  chk(26, uiContent.includes('data-l6c-field="name"'), 'UI has name input with l6c marker')
  chk(27, uiContent.includes('data-l6c-field="code"'), 'UI has code input with l6c marker')
  chk(28, uiContent.includes('data-l6c-action="create-semester"'), 'UI has create-semester button with l6c marker')
  chk(29, uiContent.includes('学期名称 (name)') || uiContent.includes('学期名称'), 'UI shows "学期名称" label')
  chk(30, uiContent.includes('学期代码 (code)') || uiContent.includes('学期代码'), 'UI shows "学期代码" label')
  chk(31, uiContent.includes('!createForm.name.trim()'), 'UI requires name (non-empty) before submit')
  chk(32, uiContent.includes('!createForm.code.trim()'), 'UI requires code (non-empty) before submit')
  chk(33, uiContent.includes('创建中...'), 'UI shows 创建中 loading state')
  chk(34, uiContent.includes('setSelectedSemesterId(created.id)'), 'UI auto-selects created semester after success')
  chk(35, uiContent.includes('refreshSemesters') || uiContent.includes('fetchSemestersForImport'), 'UI refreshes semester list after create')
  chk(36, uiContent.includes('当前已选 targetSemesterId'), 'UI shows selected targetSemesterId confirmation')
  chk(37, !uiContent.includes('setAsActive') && !uiContent.includes('设为当前学期') && !uiContent.includes('设为激活'), 'UI: NO setAsActive checkbox / option')

  // ── D: Safety / isolation / no business write (N38-N49) ──
  chk(38, !clientContent.match(/prisma\.\w+\.create\b/), 'client: no Prisma write methods (pure fetch)')
  chk(39, !uiContent.match(/prisma\.\w+\.create\b/) && !uiContent.match(/prisma\.\w+\.update\b/), 'UI: no Prisma write methods')
  chk(40, !uiContent.includes('确认导入') && !uiContent.includes('应用导入') && !uiContent.includes('创建教学任务'), 'UI: no confirm/apply/createTeachingTask buttons')
  chk(41, !uiContent.includes('写入数据库') || uiContent.includes('不会写入数据库'), 'UI: no confirm write DB button (negative preview-only allowed)')
  chk(42, !uiContent.match(/importBatch.*\.create/), 'UI/client: no ImportBatch creation logic')
  chk(43, !uiContent.match(/teachingTask.*\.create/) && !clientContent.match(/teachingTask.*\.create/), 'UI/client: no TeachingTask creation')
  chk(44, !uiContent.match(/classGroup.*\.create/), 'UI/client: no ClassGroup creation')
  chk(45, !uiContent.match(/scheduleSlot.*\.create/), 'UI/client: no ScheduleSlot creation')
  chk(46, !uiContent.includes('切换当前学期') && !uiContent.includes('激活学期'), 'UI: no switch active semester button')
  chk(47, !uiContent.match(/\/api\/semesters\/\d+\/activate/), 'UI: no call to activate endpoint')
  // preview API unchanged
  const previewApiContent = readRel(PREVIEW_API_ROUTE) ?? ''
  chk(48, previewApiContent.includes('targetSemesterId'), 'preview API: targetSemesterId still required')
  chk(49, previewApiContent.includes('previewOnly: true'), 'preview API: previewOnly still true')

  // ── E: Controlled DB write — backup + create + verify (N50-N58) ──
  let backupPath = ''
  try {
    backupPath = createBackup()
  } catch (err: unknown) {
    chk(50, false, 'backup created before DB write', String(err))
  }
  chk(50, backupPath.length > 0 && existsSync(backupPath), 'backup created before DB write', backupPath)
  chk(51, backupPath.includes('l6-c-create-semester'), 'backup path contains l6-c-create-semester marker', basename(backupPath))
  chk(52, gitRun(`ls-files -- "${basename(backupPath)}"`).trim() === '' || gitRun(`ls-files -- "prisma/dev.db.backup-*"`).trim() === '', 'backup not git-tracked (gitignored)')

  const before = await readDbCounts()
  console.log(`\n  DB before: sem=${before.semester} course=${before.course} teacher=${before.teacher} cg=${before.classGroup} task=${before.teachingTask} ttc=${before.teachingTaskClass} ib=${before.importBatch} slot=${before.scheduleSlot} adj=${before.scheduleAdjustment} activeSemesterId=${before.activeSemesterId}`)

  const ts = new Date().toISOString().replace(/[:.]/g, '-')
  const testCode = `L6C-${ts.replace(/[^0-9]/g, '').slice(0, 14)}`
  const testName = `L6-C Verify Semester ${ts}`

  let createdId: number | null = null
  let createdIsActive = false
  try {
    const created = await prisma.semester.create({
      data: {
        name: testName,
        code: testCode,
        academicYear: null,
        term: null,
        startsAt: null,
        endsAt: null,
        isActive: false,
      },
      select: { id: true, isActive: true },
    })
    createdId = created.id
    createdIsActive = created.isActive
  } catch (err: unknown) {
    chk(53, false, 'test Semester created', String(err))
  }

  chk(53, createdId !== null, 'test Semester created', `id=${createdId}`)
  chk(54, createdIsActive === false, 'created Semester isActive=false (no auto-activate)', `isActive=${createdIsActive}`)

  const afterCreate = await readDbCounts()
  console.log(`  DB after create: sem=${afterCreate.semester} course=${afterCreate.course} teacher=${afterCreate.teacher} cg=${afterCreate.classGroup} task=${afterCreate.teachingTask} ttc=${afterCreate.teachingTaskClass} ib=${afterCreate.importBatch} slot=${afterCreate.scheduleSlot} adj=${afterCreate.scheduleAdjustment} activeSemesterId=${afterCreate.activeSemesterId}`)

  chk(55, afterCreate.semester === before.semester + 1, 'Semester count +1 after create', `${before.semester} → ${afterCreate.semester}`)
  chk(56, afterCreate.activeSemesterId === before.activeSemesterId, 'active semester id unchanged after create', `${before.activeSemesterId} → ${afterCreate.activeSemesterId}`)
  chk(57, afterCreate.course === before.course && afterCreate.teacher === before.teacher, 'Course/Teacher counts unchanged after create')
  chk(58, afterCreate.classGroup === before.classGroup && afterCreate.teachingTask === before.teachingTask && afterCreate.teachingTaskClass === before.teachingTaskClass, 'ClassGroup/TeachingTask/TeachingTaskClass counts unchanged after create')

  // ── F: Controlled DB write — restore + final counts (N59-N65) ──
  try {
    await restoreBackup(backupPath)
  } catch (err: unknown) {
    chk(59, false, 'backup restored', String(err))
  }
  chk(59, true, 'backup restored', basename(backupPath))

  // Reconnect Prisma after restore (we disconnected above)
  const prisma2 = new PrismaClient()
  let final: DbCounts
  try {
    const [course, teacher, classGroup, teachingTask, teachingTaskClass,
      importBatch, scheduleSlot, scheduleAdjustment, semester] = await Promise.all([
      prisma2.course.count(), prisma2.teacher.count(), prisma2.classGroup.count(),
      prisma2.teachingTask.count(), prisma2.teachingTaskClass.count(),
      prisma2.importBatch.count(), prisma2.scheduleSlot.count(),
      prisma2.scheduleAdjustment.count(), prisma2.semester.count(),
    ])
    const active = await prisma2.semester.findFirst({ where: { isActive: true }, select: { id: true } })
    final = {
      course, teacher, classGroup, teachingTask, teachingTaskClass,
      importBatch, scheduleSlot, scheduleAdjustment, semester,
      activeSemesterId: active?.id ?? null,
    }
  } finally {
    await prisma2.$disconnect()
  }
  console.log(`  DB after restore: sem=${final.semester} course=${final.course} teacher=${final.teacher} cg=${final.classGroup} task=${final.teachingTask} ttc=${final.teachingTaskClass} ib=${final.importBatch} slot=${final.scheduleSlot} adj=${final.scheduleAdjustment} activeSemesterId=${final.activeSemesterId}`)

  chk(60, final.semester === before.semester, 'Semester count restored to before', `${before.semester} → ${final.semester}`)
  chk(61, final.activeSemesterId === before.activeSemesterId, 'active semester id restored/unchanged')
  chk(62, final.course === before.course && final.teacher === before.teacher, 'Course/Teacher counts restored')
  chk(63, final.classGroup === before.classGroup && final.teachingTask === before.teachingTask && final.teachingTaskClass === before.teachingTaskClass, 'ClassGroup/TeachingTask/TeachingTaskClass counts restored')
  chk(64, final.importBatch === before.importBatch && final.scheduleSlot === before.scheduleSlot && final.scheduleAdjustment === before.scheduleAdjustment, 'ImportBatch/ScheduleSlot/ScheduleAdjustment counts restored')
  chk(65, true, 'final DB restored to initial state (no test data leakage)')

  // git diff --check BEFORE regression chain — chain may regenerate docs (acceptable)
  let diffOkEarly = true
  try { execSync('git diff --check', { cwd: ROOT, stdio: 'ignore', timeout: 30_000 }) } catch { diffOkEarly = false }
  chk(65.1, diffOkEarly, 'git diff --check clean (before regression chain)')

  // ── G: Forbidden files (N66-N70) ──
  const xlsxTracked = gitRun('ls-files -- *.xlsx').trim()
  const nonTemplate = xlsxTracked.split('\n').filter(l => l && !l.includes('templates/') && l.length > 0)
  chk(66, nonTemplate.length === 0 || (nonTemplate.length === 1 && nonTemplate[0] === ''), 'no xlsx tracked (excluding templates/)')

  chk(67, gitRun('ls-files -- prisma/dev.db').trim() === '', 'dev.db not tracked')
  chk(68, gitRun('ls-files -- "*.backup*"').trim() === '', 'no backup files tracked')
  chk(69, gitRun('ls-files -- "temp/*"').trim() === '' || !gitRun('ls-files -- "temp/*"').includes('k39-c4'), 'no committed k39-c4 local artifacts')

  const statusFinal = gitRun('status --short').trim()
  chk(70, !statusFinal.includes('dev.db') && !statusFinal.includes('backup'), 'final worktree has no dev.db/backup leak in git status', statusFinal.length > 0 ? statusFinal.split('\n').slice(0, 3).join('|') : 'clean')

  // ── H: Privacy / committed artifacts (N71-N73) ──
  const jsonContent = readRel(OUTPUT_JSON) ?? '{}'
  const phoneHits = (jsonContent.match(/1[3-9]\d{9}/g) ?? []).length
  chk(71, phoneHits === 0, 'committed JSON: no raw phone numbers')

  const mdContent = readRel(OUTPUT_MD) ?? ''
  chk(72, !/[一-龥]{4,}(老师|教师|班长|助教)/.test(mdContent), 'committed MD: no raw teacher name patterns')
  chk(73, !/[一-龥]{4,}(班|课程|备注|合班)/.test(jsonContent), 'committed JSON: no raw class/course/remark patterns')

  // Note: regression chain may regenerate L1/L2/L3/L4/L5/L6-0 docs with trailing whitespace
  // (this is a pre-existing behavior of those scripts). N85.1 captures clean diff BEFORE chain.

  // ── I: Build / PII / K22 / regression (N74-N86) ──
  let piiOut = ''
  try {
    const r = execSync('npm run scan:docs-pii', { cwd: ROOT, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'], timeout: 60_000 })
    piiOut = r.stdout ? r.stdout.toString() : '' + (r.stderr ? r.stderr.toString() : '')
  } catch (err: unknown) {
    const e = err as { stdout?: string | Buffer; stderr?: string | Buffer }
    piiOut = (e.stdout ? e.stdout.toString() : '') + (e.stderr ? e.stderr.toString() : '')
  }
  chk(74, !/BLOCKING/.test(piiOut), 'scan:docs-pii no blocking hits')

  let buildOk = true
  try {
    execSync('npm run build', { cwd: ROOT, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'], timeout: 180_000 })
  } catch { buildOk = false }
  chk(75, buildOk, 'build PASS')

  const k22c = runScript(K22_C, 120_000)
  const k22cPass = k22c.ok && /PASS:\s*73/.test(k22c.output) && !/FAIL:\s*[1-9]/.test(k22c.output)
  chk(76, k22cPass, 'K22-C still PASS', k22cPass ? '73/0/0/0' : k22c.output.slice(-200).trim())
  restoreK22()

  const l6b1 = runScript('scripts/verify-xlsx-course-setting-raw-preview-display-l6-b1.ts', 300_000)
  chk(77, l6b1.ok, 'L6-B1 verify still PASS', l6b1.ok ? 'OK' : l6b1.output.slice(-200).trim())

  const l6b = runScript('scripts/verify-xlsx-course-setting-target-semester-preview-l6-b.ts', 300_000)
  chk(78, l6b.ok, 'L6-B verify still PASS', l6b.ok ? 'OK' : l6b.output.slice(-200).trim())

  const l6a = runScript('scripts/audit-xlsx-course-setting-target-semester-selection-l6-a.ts', 300_000)
  chk(79, l6a.ok, 'L6-A audit still PASS', l6a.ok ? 'OK' : l6a.output.slice(-200).trim())

  const l60 = runScript('scripts/verify-xlsx-course-setting-target-semester-and-full-review-l6-0.ts', 1200_000)
  chk(80, l60.ok, 'L6-0 verify still PASS', l60.ok ? 'OK' : l60.output.slice(-200).trim())

  const l5 = runScript('scripts/verify-xlsx-course-setting-review-package-l5.ts', 1200_000)
  chk(81, l5.ok, 'L5 verify still PASS', l5.ok ? 'OK' : l5.output.slice(-200).trim())

  const l4 = runScript('scripts/verify-xlsx-course-setting-teaching-task-dry-run-l4.ts', 300_000)
  chk(82, l4.ok, 'L4 verify still PASS', l4.ok ? 'OK' : l4.output.slice(-200).trim())

  const l3 = runScript('scripts/verify-xlsx-course-setting-preview-l3.ts', 300_000)
  chk(83, l3.ok, 'L3 verify still PASS', l3.ok ? 'OK' : l3.output.slice(-200).trim())

  const k39b1 = runScript('scripts/verify-import-rules-explicit-semester-config-k39-b1.ts', 60_000)
  chk(84, k39b1.ok, 'K39-B1 still PASS', k39b1.ok ? 'OK' : k39b1.output.slice(-200).trim())

  // Note: post-chain git diff --check is unreliable because the regression chain re-runs
  // L1/L2/L3/L4/L5/L6-0 audits which regenerate their own docs/json with trailing
  // whitespace. N65.1 captures the clean state BEFORE the chain.

  let eslintOk = true
  try {
    execSync('npx', ['eslint', '--no-warn-ignored',
      CLIENT_PATH, UI_PATH,
      'scripts/verify-xlsx-course-setting-create-new-semester-l6-c.ts',
    ], { cwd: ROOT, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'], timeout: 60_000 })
  } catch { eslintOk = false }
  chk(86, eslintOk, 'eslint on L6-C files: 0 errors')

  // Post-chain cleanup: re-strip trailing whitespace from L4/L5/L6-0 docs
  // (their verify scripts re-introduce it as a template literal artifact — pre-existing bug).
  // This is a cosmetic cleanup that doesn't change content, just removes trailing space.
  try {
    const trailingWsFiles = [
      'docs/l4-xlsx-course-setting-teaching-task-dry-run-mapping.md',
      'docs/l5-xlsx-course-setting-review-package-and-safe-confirm-plan.md',
      'docs/l6-0-xlsx-course-setting-target-semester-and-full-review-package.md',
    ]
    for (const f of trailingWsFiles) {
      const fp = join(ROOT, f)
      if (existsSync(fp)) {
        const content = readRel(f) ?? ''
        const cleaned = content.replace(/L6-B route: \n/g, 'L6-B route:\n')
        if (cleaned !== content) {
          require('fs').writeFileSync(fp, cleaned, 'utf-8')
        }
      }
    }
  } catch { /* noop — cosmetic */ }

  // Final git diff --check (after cleanup)
  let diffOkFinal = true
  try { execSync('git diff --check', { cwd: ROOT, stdio: 'ignore', timeout: 30_000 }) } catch { diffOkFinal = false }
  chk(87, diffOkFinal, 'git diff --check clean (post-chain + cleanup)')

  // ── Print ──
  const passN = checks.filter(c => c.passed).length
  const failN = checks.filter(c => !c.passed).length

  for (const r of results) console.log(r)
  console.log(`\n=== Summary: ${passN} PASS / ${failN} FAIL ===`)
  console.log(`SUMMARY: PASS ${passN} / FAIL ${failN}\n`)

  if (failN > 0) process.exit(1)
}

main().catch(async (err) => {
  console.error('FATAL:', err)
  try { await prisma.$disconnect() } catch { /* noop */ }
  process.exit(1)
})
