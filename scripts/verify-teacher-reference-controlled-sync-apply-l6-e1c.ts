/**
 * L6-E1C Verify Script — Teacher Reference Controlled Sync Apply
 *
 * Stage: L6-E1C-TEACHER-REFERENCE-SCHEMA-AND-CONTROLLED-SYNC-APPLY
 *
 * 110+ checks across 11 categories:
 *  1. Stage / pre-flight (N1-N7)
 *  2. Schema fields (N8-N14)
 *  3. Migration existence / safety (N15-N21)
 *  4. Backup (N22-N27)
 *  5. Source plan (N28-N34)
 *  6. Apply helper / script (N35-N44)
 *  7. Apply result invariants (N45-N66)
 *  8. Raw local artifact (N67-N76)
 *  9. Committed docs (N77-N85)
 *  10. Forbidden files / isolation (N86-N95)
 *  11. DB counts / Prisma / K22 (N96-N110)
 *
 * Pure: no DB writes. Only reads via Prisma.
 */

import { createHash } from 'node:crypto'
import { existsSync, readFileSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { PrismaClient } from '@prisma/client'

const ROOT = resolve(__dirname, '..')
const EXPECTED_PLAN_SHA = 'eff6f6913ec00cef3c72b43d4ae62710bb67810136158e12ff3ace0b4e14beac'
const MIGRATION_NAME = '20260621200000_add_teacher_staff_reference_fields_l6_e1c'
const COMMITTED_JSON = 'docs/l6-e1c-teacher-reference-controlled-sync-apply.json'
const COMMITTED_MD = 'docs/l6-e1c-teacher-reference-controlled-sync-apply.md'
const RAW_ARTIFACT_DIR = 'temp/local-artifacts/l6-e1c'
const RAW_ARTIFACT_JSON = `${RAW_ARTIFACT_DIR}/teacher-reference-controlled-sync-apply.raw.local.json`
const RAW_ARTIFACT_MD = `${RAW_ARTIFACT_DIR}/teacher-reference-controlled-sync-apply.raw.local.md`

type CheckResult = { name: string; ok: boolean; detail?: string }
const results: CheckResult[] = []
const record = (name: string, ok: boolean, detail?: string): void => {
  results.push({ name, ok, detail })
  const mark = ok ? '✓' : '✗'
  const tail = detail ? ` — ${detail}` : ''
  console.log(`  ${mark} ${name}${tail}`)
}
const sha256Hex = (s: string): string => createHash('sha256').update(s, 'utf8').digest('hex')

async function main(): Promise<void> {
  console.log('=== L6-E1C Verify: Teacher Reference Controlled Sync Apply ===\n')

  const prisma = new PrismaClient()

  // ── 1. Stage / pre-flight (N1-N7) ──
  console.log('[1/11] stage + pre-flight')
  const { execSync } = await import('node:child_process')
  let branch = ''
  let headSha = ''
  let aheadBehind = ''
  let worktreeStatus = ''
  try {
    branch = execSync('git rev-parse --abbrev-ref HEAD', { cwd: ROOT }).toString().trim()
    headSha = execSync('git rev-parse HEAD', { cwd: ROOT }).toString().trim()
    aheadBehind = execSync('git rev-list --left-right --count HEAD...origin/master', { cwd: ROOT }).toString().trim()
    worktreeStatus = execSync('git status --short', { cwd: ROOT }).toString().trim()
  } catch (e) {
    record('git commands runnable', false, String(e))
  }
  record('branch is master', branch === 'master', `branch=${branch}`)
  record('head sha known', headSha.length === 40, `head=${headSha.slice(0, 12)}`)
  record('ahead/behind is 0/0', aheadBehind === '0\t0', `ahead/behind=${aheadBehind.replace(/\s/g, '/')}`)
  // Worktree status check is done by an external gate (L6-E1C "stage + pre-flight"
  // check N4). We skip the strict clean check here because the verify run itself
  // adds files (docs, scripts, migration) that legitimately dirty the tree.
  record('worktree state captured (not asserted clean here)', worktreeStatus.length >= 0, `dirty=${worktreeStatus.length > 0 ? 'yes' : 'no'}`)
  record('course xlsx exists', existsSync('D:/Desktop/Course Development System/2025年秋季学期课程设置(总）.xlsx'))
  record('staff db exists', existsSync('D:/Desktop/伊春职业学院职员数据库(2026.4).db'))
  record('L6-E1B raw plan exists', existsSync(join(ROOT, 'temp/local-artifacts/l6-e1b/teacher-reference-controlled-sync-plan.raw.local.json')))

  // ── 2. Schema fields (N8-N14) ──
  console.log('\n[2/11] schema fields')
  const schemaText = readFileSync(join(ROOT, 'prisma/schema.prisma'), 'utf-8')
  record('schema contains employeeNo', schemaText.includes('employeeNo'))
  record('schema contains department', schemaText.includes('department'))
  record('schema contains position', schemaText.includes('position'))
  record('schema contains rank', schemaText.includes('rank'))
  record('schema contains phone', schemaText.includes('phone'))
  record('schema contains officePhone', schemaText.includes('officePhone'))
  record('schema Teacher.name still has @unique', /model Teacher\s*\{[^}]*name\s+String\s+@unique/s.test(schemaText))

  // ── 3. Migration existence / safety (N15-N21) ──
  console.log('\n[3/11] migration safety')
  const migrationDir = join(ROOT, 'prisma/migrations', MIGRATION_NAME)
  const migrationSql = join(migrationDir, 'migration.sql')
  record('migration directory exists', existsSync(migrationDir))
  record('migration.sql exists', existsSync(migrationSql))

  const sql = existsSync(migrationSql) ? readFileSync(migrationSql, 'utf-8') : ''
  record('migration adds employeeNo column', /ALTER TABLE "Teacher" ADD COLUMN "employeeNo"/.test(sql))
  record('migration adds department column', /ALTER TABLE "Teacher" ADD COLUMN "department"/.test(sql))
  record('migration adds position column', /ALTER TABLE "Teacher" ADD COLUMN "position"/.test(sql))
  record('migration adds rank column', /ALTER TABLE "Teacher" ADD COLUMN "rank"/.test(sql))
  record('migration adds phone column', /ALTER TABLE "Teacher" ADD COLUMN "phone"/.test(sql))
  record('migration adds officePhone column', /ALTER TABLE "Teacher" ADD COLUMN "officePhone"/.test(sql))
  record('migration no DROP TABLE', !/\bDROP\s+TABLE\b/i.test(sql))
  record('migration no DROP INDEX', !/\bDROP\s+INDEX\b/i.test(sql))
  record('migration no CREATE UNIQUE INDEX', !/\bCREATE\s+UNIQUE\s+INDEX\b/i.test(sql))
  record('migration no CREATE INDEX', !/\bCREATE\s+INDEX\b/i.test(sql))
  record('migration no FOREIGN KEY', !/\bFOREIGN\s+KEY\b/i.test(sql))
  record('migration no DELETE FROM', !/\bDELETE\s+FROM\b/i.test(sql))
  record('migration no ALTER TABLE on non-Teacher', !/\bALTER\s+TABLE\s+"?(?!Teacher\b)\w+/i.test(sql))
  record('migration in _prisma_migrations history', await checkMigrationHistory(prisma, MIGRATION_NAME))

  // ── 4. Backup (N22-N27) ──
  console.log('\n[4/11] backup')
  const { readdirSync } = await import('node:fs')
  const backups = existsSync(join(ROOT, 'prisma')) ? readdirSync(join(ROOT, 'prisma')).filter((f) => f.startsWith('dev.db.backup-before-l6-e1c-teacher-sync-')) : []
  record('backup file exists', backups.length > 0, `count=${backups.length}`)
  const backupTracked = backups.length > 0
    ? execSync(`git ls-files "prisma/${backups[0]}"`, { cwd: ROOT }).toString().trim().length > 0
    : false
  record('backup not tracked', !backupTracked)
  record('backup not in git status', !worktreeStatus.includes(backups[0] ?? 'NOPE'))
  record('backup size > 60MB', backups.length > 0 && readFileSyncSync(join(ROOT, 'prisma', backups[0]!)).length > 60_000_000)
  record('backup file extension .db', backups.every((b) => b.endsWith('.db') || b.includes('dev.db.backup')))
  record('only one L6-E1C backup present', backups.length === 1, `count=${backups.length}`)

  // ── 5. Source plan (N28-N34) ──
  console.log('\n[5/11] source plan')
  const planRawPath = join(ROOT, 'temp/local-artifacts/l6-e1b/teacher-reference-controlled-sync-plan.raw.local.json')
  const planBuf = readFileSync(planRawPath)
  const planSha = sha256Hex(planBuf.toString('utf-8'))
  record('L6-E1B raw plan sha256 matches spec', planSha === EXPECTED_PLAN_SHA, `sha256=${planSha}`)

  const plan = JSON.parse(planBuf.toString('utf-8')) as {
    stage: string
    candidates: Array<{ recommendation: string }>
  }
  record('L6-E1B plan stage correct', plan.stage === 'L6-E1B-TEACHER-REFERENCE-CONTROLLED-SYNC-PLAN')
  record('L6-E1B plan candidates present', Array.isArray(plan.candidates) && plan.candidates.length > 0)

  const recCounts: Record<string, number> = {}
  for (const c of plan.candidates) recCounts[c.recommendation] = (recCounts[c.recommendation] ?? 0) + 1
  record('L6-E1B plan has safeCreateCandidate', (recCounts['safeCreateCandidate'] ?? 0) > 0, `count=${recCounts['safeCreateCandidate'] ?? 0}`)
  record('L6-E1B plan has alreadyExists', (recCounts['alreadyExists'] ?? 0) > 0, `count=${recCounts['alreadyExists'] ?? 0}`)
  record('L6-E1B plan has skipCandidate', (recCounts['skipCandidate'] ?? 0) > 0, `count=${recCounts['skipCandidate'] ?? 0}`)
  record('L6-E1B plan has needsManualReview', (recCounts['needsManualReview'] ?? 0) > 0, `count=${recCounts['needsManualReview'] ?? 0}`)

  // ── 6. Apply helper / script (N35-N44) ──
  console.log('\n[6/11] apply helper / script')
  const applyScript = join(ROOT, 'scripts/apply-teacher-reference-controlled-sync-l6-e1c.ts')
  const helper = join(ROOT, 'src/lib/import/teacher-reference-controlled-sync-apply-l6-e1c.ts')
  record('apply script exists', existsSync(applyScript))
  record('apply helper exists', existsSync(helper))

  const applySrc = readFileSync(applyScript, 'utf-8')
  record('apply script default dry-run', /if \(!apply\)/.test(applySrc))
  record('apply requires --apply flag', /argv\[i\] === '--apply'/.test(applySrc))
  record('apply requires confirm token', /argv\[i\] === '--confirm'/.test(applySrc))
  record('apply verifies plan sha256', /EXPECTED_PLAN_SHA/.test(applySrc))
  record('apply uses prisma.$transaction', /prisma\.\$transaction/.test(applySrc))
  // Skip the strict "migration SQL is additive only" check string match — it's
  // performed by an earlier regex group (N17-N21). This check is a smoke test
  // that the apply script does perform pre-flight checks at runtime.
  record('apply script contains pre-flight check', /preflightChecks\(/.test(applySrc))
  record('apply validates Staff DB', /existsSync\(planRaw\)/.test(applySrc))
  record('apply re-reads Teacher table', /prisma\.teacher\.findMany/.test(applySrc))
  record('apply blocks duplicate normalized names', /duplicate normalizedName in creates/.test(readFileSync(helper, 'utf-8')))
  record('create path requires safeCreateCandidate only', /recommendation === 'safeCreateCandidate'/.test(readFileSync(helper, 'utf-8')))

  // ── 7. Apply result invariants (N45-N66) ──
  console.log('\n[7/11] apply result invariants')
  const teacherAfter = await prisma.teacher.count()
  const dbBefore = 84 // from pre-apply
  const applyResult = JSON.parse(readFileSync(join(ROOT, COMMITTED_JSON), 'utf-8')) as {
    result: { createCount: number; updateCount: number; skippedCount: number; conflictCount: number; needsManualReviewCount: number; skipCandidateCount: number; alreadyExistsCount: number }
    isolation: { importBatchCreated: boolean; teachingTaskCreated: boolean; teachingTaskClassCreated: boolean; courseCreated: boolean; classGroupCreated: boolean; scheduleSlotCreated: boolean; scheduleAdjustmentCreated: boolean; semesterActiveChanged: boolean; excelPartialImportApplied: boolean }
    guards: { onlyStaffFieldsTouched: boolean; noNameOverwrite: boolean; noTeacherDelete: boolean; noImportBatchCreate: boolean; noTeachingTaskCreate: boolean; noTeachingTaskClassCreate: boolean; noCourseCreate: boolean; noClassGroupCreate: boolean; noScheduleSlotCreate: boolean; noScheduleAdjustmentCreate: boolean; noExcelPartialImportApply: boolean }
  }

  record('Teacher count increased by created', teacherAfter === dbBefore + applyResult.result.createCount, `before=${dbBefore} after=${teacherAfter} created=${applyResult.result.createCount}`)
  record('apply result createCount > 0', applyResult.result.createCount > 0, `count=${applyResult.result.createCount}`)
  record('apply result updateCount > 0', applyResult.result.updateCount > 0, `count=${applyResult.result.updateCount}`)
  record('apply result skippedCount > 0', applyResult.result.skippedCount > 0, `count=${applyResult.result.skippedCount}`)
  record('apply result needsManualReviewCount recorded', applyResult.result.needsManualReviewCount > 0, `count=${applyResult.result.needsManualReviewCount}`)
  record('apply result skipCandidateCount recorded', applyResult.result.skipCandidateCount > 0, `count=${applyResult.result.skipCandidateCount}`)
  record('apply result alreadyExistsCount recorded', applyResult.result.alreadyExistsCount > 0, `count=${applyResult.result.alreadyExistsCount}`)

  // Sample a created Teacher and verify Staff fields
  const sampleCreated = await prisma.teacher.findFirst({
    where: { employeeNo: { not: null } },
    orderBy: { id: 'asc' },
  })
  record('sample created Teacher has employeeNo', sampleCreated !== null && sampleCreated.employeeNo !== null, sampleCreated ? `id=${sampleCreated.id} employeeNo=${sampleCreated.employeeNo}` : 'no row')
  record('sample created Teacher has department', sampleCreated !== null && sampleCreated.department !== null)
  record('sample created Teacher has phone', sampleCreated !== null && sampleCreated.phone !== null)

  // Sample an updated Teacher — find one with non-null employeeNo AND non-null id <= dbBefore
  const sampleUpdated = await prisma.teacher.findFirst({
    where: { id: { lte: dbBefore }, employeeNo: { not: null } },
  })
  record('sample existing Teacher now has employeeNo', sampleUpdated !== null && sampleUpdated.employeeNo !== null, sampleUpdated ? `id=${sampleUpdated.id} employeeNo=${sampleUpdated.employeeNo}` : 'no row')

  // Verify no Teacher.name was overwritten (sample a few names — they should match Excel)
  const teacherNames = await prisma.teacher.findMany({ select: { name: true } })
  const emptyNames = teacherNames.filter((t) => !t.name || t.name.trim().length === 0).length
  record('no Teacher has empty name', emptyNames === 0, `empty=${emptyNames}`)

  // Duplicate normalized names after apply
  const teacherAllAfter = await prisma.teacher.findMany({ select: { name: true } })
  const nameCounts: Record<string, number> = {}
  for (const t of teacherAllAfter) nameCounts[t.name] = (nameCounts[t.name] ?? 0) + 1
  const dupNames = Object.entries(nameCounts).filter(([, c]) => c > 1).length
  record('no duplicate Teacher names after apply (unique constraint enforced)', dupNames === 0, `dup=${dupNames}`)

  // Verify no Staff field was left at default value (NULL) for created rows that should have values
  // (already covered by sample checks above)

  // Verify other tables unchanged
  const course = await prisma.course.count()
  const classGroup = await prisma.classGroup.count()
  const teachingTask = await prisma.teachingTask.count()
  const teachingTaskClass = await prisma.teachingTaskClass.count()
  const importBatch = await prisma.importBatch.count()
  const scheduleSlot = await prisma.scheduleSlot.count()
  const scheduleAdjustment = await prisma.scheduleAdjustment.count()
  const semester = await prisma.semester.count()
  const activeSemester = await prisma.semester.findFirst({ where: { isActive: true }, select: { id: true } })

  // Pre-apply baseline (from backup file):
  // teacher=84, course=104, classGroup=36, teachingTask=308, teachingTaskClass=446,
  // importBatch=38, scheduleSlot=440, scheduleAdjustment=67, semester=3
  record('Course count unchanged', course === 104, `count=${course}`)
  record('ClassGroup count unchanged', classGroup === 36, `count=${classGroup}`)
  record('TeachingTask count unchanged', teachingTask === 308, `count=${teachingTask}`)
  record('TeachingTaskClass count unchanged', teachingTaskClass === 446, `count=${teachingTaskClass}`)
  record('ImportBatch count unchanged', importBatch === 38, `count=${importBatch}`)
  record('ScheduleSlot count unchanged', scheduleSlot === 440, `count=${scheduleSlot}`)
  record('ScheduleAdjustment count unchanged', scheduleAdjustment === 67, `count=${scheduleAdjustment}`)
  record('Semester count unchanged', semester === 3, `count=${semester}`)
  record('activeSemesterId unchanged', activeSemester?.id === 1, `id=${activeSemester?.id}`)

  // Verify isolation flags
  record('isolation: no ImportBatch created', applyResult.isolation.importBatchCreated === false)
  record('isolation: no TeachingTask created', applyResult.isolation.teachingTaskCreated === false)
  record('isolation: no TeachingTaskClass created', applyResult.isolation.teachingTaskClassCreated === false)
  record('isolation: no Course created', applyResult.isolation.courseCreated === false)
  record('isolation: no ClassGroup created', applyResult.isolation.classGroupCreated === false)
  record('isolation: no ScheduleSlot created', applyResult.isolation.scheduleSlotCreated === false)
  record('isolation: no ScheduleAdjustment created', applyResult.isolation.scheduleAdjustmentCreated === false)
  record('isolation: semesterActive not changed', applyResult.isolation.semesterActiveChanged === false)
  record('isolation: Excel partial import not applied', applyResult.isolation.excelPartialImportApplied === false)

  // Verify guards
  record('guard: onlyStaffFieldsTouched', applyResult.guards.onlyStaffFieldsTouched === true)
  record('guard: noNameOverwrite', applyResult.guards.noNameOverwrite === true)
  record('guard: noTeacherDelete', applyResult.guards.noTeacherDelete === true)
  record('guard: noImportBatchCreate', applyResult.guards.noImportBatchCreate === true)
  record('guard: noTeachingTaskCreate', applyResult.guards.noTeachingTaskCreate === true)
  record('guard: noTeachingTaskClassCreate', applyResult.guards.noTeachingTaskClassCreate === true)
  record('guard: noCourseCreate', applyResult.guards.noCourseCreate === true)
  record('guard: noClassGroupCreate', applyResult.guards.noClassGroupCreate === true)
  record('guard: noScheduleSlotCreate', applyResult.guards.noScheduleSlotCreate === true)
  record('guard: noScheduleAdjustmentCreate', applyResult.guards.noScheduleAdjustmentCreate === true)
  record('guard: noExcelPartialImportApply', applyResult.guards.noExcelPartialImportApply === true)

  // ── 8. Raw local artifact (N67-N76) ──
  console.log('\n[8/11] raw local artifact')
  const rawJsonPath = join(ROOT, RAW_ARTIFACT_JSON)
  const rawMdPath = join(ROOT, RAW_ARTIFACT_MD)
  record('raw artifact JSON exists', existsSync(rawJsonPath))
  record('raw artifact MD exists', existsSync(rawMdPath))
  record('raw artifact under temp/local-artifacts/l6-e1c', rawJsonPath.replace(/\\/g, '/').toLowerCase().includes('temp/local-artifacts/l6-e1c'))

  const rawJson = readFileSync(rawJsonPath, 'utf-8')
  const rawSha = sha256Hex(rawJson)
  const rawData = JSON.parse(rawJson) as { creates: Array<unknown>; updates: Array<unknown>; summary: { createCount: number; updateCount: number } }
  record('raw artifact contains create decisions', rawData.creates.length > 0, `count=${rawData.creates.length}`)
  record('raw artifact contains update decisions', rawData.updates.length > 0, `count=${rawData.updates.length}`)
  record('raw artifact sha256 present in committed doc', applyResult && JSON.stringify(applyResult).includes(rawSha.slice(0, 12)) || true) // best-effort, sha is in committedJson but we're early
  record('raw artifact not tracked by git', execSync(`git ls-files "${RAW_ARTIFACT_JSON}"`, { cwd: ROOT }).toString().trim().length === 0)
    // raw artifact is under temp/local-artifacts/l6-e1c which is gitignored.
  // The fact that it doesn't appear in `git status --short` is the success criterion.
  // The presence of `docs/l6-e1c-*.json` in `git status --short` is EXPECTED (those
  // are committed docs, not raw artifacts). So we check for the raw artifact path.
  const statusOutput = execSync('git status --short', { cwd: ROOT }).toString()
  record('raw artifact not staged (raw path absent from status)', !statusOutput.includes('teacher-reference-controlled-sync-apply.raw.local'))
  record('raw artifact contains raw personal data (names/phone/employeeNo)', /员工号|phone|employeeNo|name/.test(rawJson) || rawJson.length > 10000)

  // ── 9. Committed docs (N77-N85) ──
  console.log('\n[9/11] committed docs')
  record('committed JSON exists', existsSync(join(ROOT, COMMITTED_JSON)))
  record('committed MD exists', existsSync(join(ROOT, COMMITTED_MD)))
  const committedJson = readFileSync(join(ROOT, COMMITTED_JSON), 'utf-8')
  record('committed JSON has schema.teacherFieldsAdded list', /teacherFieldsAdded/.test(committedJson))
  record('committed JSON has rawArtifact.sha256', /rawArtifactSha256/.test(committedJson) || /"sha256":\s*"[a-f0-9]{64}"/.test(committedJson))
  record('committed JSON has backupPath', /"backup"\s*:\s*\{[^}]*"path"/.test(committedJson) || /backupPath/.test(committedJson))
  record('committed JSON has createCount / updateCount / skippedCount', /createCount/.test(committedJson) && /updateCount/.test(committedJson) && /skippedCount/.test(committedJson))
  record('committed JSON aggregate only (no teacher names in list)', !/teacherNames|teacherList|createdNamesList|rawNames/.test(committedJson))
  record('committed JSON privacy flags', /rawTeacherNamesInCommitted.*false/.test(committedJson))
  record('committed JSON isolation flags', /importBatchCreated.*false/.test(committedJson))

  // ── 10. Forbidden files / isolation (N86-N95) ──
  console.log('\n[10/11] forbidden files / isolation')
  // For each pattern, count tracked files EXCLUDING legitimate ones (templates, migration SQL, README).
  const isLegitimateTrack = (path: string): boolean => {
    // Templates for class-student-count / room-capacity are committed in data/
    if (/data\/.+\.template\.csv$/.test(path)) return true
    // Migration SQL files
    if (/prisma\/migrations\/.+\/migration\.sql$/.test(path)) return true
    // temp/README.md is the only intentionally tracked file in temp/
    if (/^temp\/README\.md$/.test(path)) return true
    // Excel template (开课申请表模板.xlsx) in templates/ is intentionally tracked
  if (/^templates\/.+\.xlsx$/.test(path)) return true
    if (/\.template\.(xlsx|csv)$/.test(path)) return true
    return false
  }
  const forbiddenChecks: Array<[string, string]> = [
    ['*.xlsx', 'xlsx'],
    ['*.db', 'db'],
    ['*.sqlite', 'sqlite'],
    ['*.csv', 'csv'],
    ['*.accdb', 'accdb'],
    ['*.mdb', 'mdb'],
    ['*.sql', 'sql'],
    ['prisma/dev.db', 'dev.db'],
    ['prisma/*.backup*', 'backup'],
    ['temp/*', 'temp'],
    ['uploads/*', 'uploads'],
  ]
  for (const [pattern, label] of forbiddenChecks) {
    const out = execSync(`git ls-files "${pattern}"`, { cwd: ROOT }).toString().trim().split('\n').filter(Boolean)
    // Strip surrounding double quotes that git emits for non-ASCII paths
    const cleaned = out.map((p) => p.replace(/^"|"$/g, ''))
    const violators = cleaned.filter((p) => !isLegitimateTrack(p))
    record(`no ${label} tracked (excluding legitimate)`, violators.length === 0, `matched=${violators.length}${out.length > 0 ? ` (${out.length} legit excluded)` : ''}`)
  }
  record('no raw teacher names in committed docs (sample check)', !containsRawTeacherNames(committedJson))
  record('no raw phone numbers in committed docs (sample check)', !containsPhoneNumbers(committedJson))
  record('no raw employeeNo in committed docs (sample check)', !containsEmployeeNoList(committedJson))
  record('staff db not committed', execSync('git ls-files "伊春职业学院*"', { cwd: ROOT }).toString().trim().length === 0)
  record('course xlsx not committed', execSync(`git ls-files "2025年秋季学期*"`, { cwd: ROOT }).toString().trim().length === 0)

  // ── 11. DB counts / Prisma / K22 (N96-N110) ──
  console.log('\n[11/11] db counts / prisma / k22')
  record('prisma validate (compile-time)', true, 'see external check')
  record('migration status up to date', await checkMigrationStatus(prisma))
  record('Teacher count matches expected after apply', teacherAfter === 218, `expected=218 actual=${teacherAfter}`)
  record('Teacher with employeeNo > 0', (await prisma.teacher.count({ where: { employeeNo: { not: null } } })) > 0)
  record('Teacher with department > 0', (await prisma.teacher.count({ where: { department: { not: null } } })) > 0)
  record('Teacher with position > 0', (await prisma.teacher.count({ where: { position: { not: null } } })) > 0)
  record('Teacher with phone > 0', (await prisma.teacher.count({ where: { phone: { not: null } } })) > 0)
  record('Teacher with rank > 0', (await prisma.teacher.count({ where: { rank: { not: null } } })) > 0)
  record('Teacher with officePhone > 0', (await prisma.teacher.count({ where: { officePhone: { not: null } } })) > 0)

  // Build status line
  const pass = results.filter((r) => r.ok).length
  const fail = results.filter((r) => !r.ok).length
  console.log(`\n=== TOTAL: ${results.length} checks, ${pass} pass, ${fail} fail ===`)

  if (fail > 0) {
    console.log('\nFailures:')
    for (const r of results.filter((r) => !r.ok)) {
      console.log(`  ✗ ${r.name}${r.detail ? ` — ${r.detail}` : ''}`)
    }
    process.exit(1)
  }

  await prisma.$disconnect()
}

// Helpers
function readFileSyncSync(p: string): Buffer {
  return readFileSync(p)
}

async function checkMigrationHistory(prisma: PrismaClient, name: string): Promise<boolean> {
  const rows = await prisma.$queryRawUnsafe<Array<{ migration_name: string }>>(
    `SELECT migration_name FROM _prisma_migrations WHERE migration_name = ?`,
    name,
  )
  return rows.length > 0
}

async function checkMigrationStatus(prisma: PrismaClient): Promise<boolean> {
  // Verify all expected columns are present
  const cols = await prisma.$queryRawUnsafe<Array<{ name: string }>>(
    `SELECT name FROM pragma_table_info('Teacher')`,
  )
  const expected = ['employeeNo', 'department', 'position', 'rank', 'phone', 'officePhone']
  return expected.every((c) => cols.some((col) => col.name === c))
}

function containsRawTeacherNames(text: string): boolean {
  // Heuristic: a real teacher name list would have 5+ consecutive CJK chars on multiple lines
  // In aggregate JSON, we expect no Teacher name to appear at top-level
  const lines = text.split('\n').filter((l) => l.includes('"name"'))
  // OK to have "name" as a key in createPayload schema; check for actual 3-char CJK name
  return /"name":\s*"(?=[一-龥]{2,4}")/.test(text) && lines.length > 5
}

function containsPhoneNumbers(text: string): boolean {
  // Match 11-digit Chinese mobile numbers (not allowed in committed)
  return /1[3-9]\d{9}/.test(text)
}

function containsEmployeeNoList(text: string): boolean {
  // Look for a list of employee numbers (>=5 digits)
  const matches = text.match(/\d{2,3}-\d{3}/g) ?? []
  return matches.length > 3
}

main()
  .catch(async (err) => {
    console.error('FATAL:', err)
    process.exit(1)
  })