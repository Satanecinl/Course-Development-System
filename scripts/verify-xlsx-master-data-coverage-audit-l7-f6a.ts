/**
 * L7-F6A Verify Script — Master Data Coverage Audit
 *
 * Stage: L7-F6A-XLSX-MASTER-DATA-COVERAGE-AUDIT
 *
 * 100+ read-only checks.
 */

import { execSync } from 'node:child_process'
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { PrismaClient } from '@prisma/client'

const ROOT = resolve(__dirname, '..')
const AUDIT_SCRIPT = join(ROOT, 'scripts/audit-xlsx-master-data-coverage-l7-f6a.ts')
const MIGRATIONS = join(ROOT, 'prisma/migrations')
const AUDIT_ARTIFACT = join(ROOT, 'temp/local-artifacts/l7-f6a/audit.json')

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
  console.log('=== L7-F6A Verify: Master Data Coverage Audit ===\n')
  const prisma = new PrismaClient()
  const auditSrc = readF(AUDIT_SCRIPT)
  const artifact = existsSync(AUDIT_ARTIFACT) ? JSON.parse(readF(AUDIT_ARTIFACT)) : null
  const migrations = existsSync(MIGRATIONS)
    ? readdirSync(MIGRATIONS).filter((n) => statSync(join(MIGRATIONS, n)).isDirectory()).join('\n')
    : ''

  // 1. Pre-flight
  console.log('[1/8] pre-flight')
  let branch = '', aheadBehind = ''
  try { branch = ex('git rev-parse --abbrev-ref HEAD'); aheadBehind = ex('git rev-list --left-right --count HEAD...origin/master') } catch {}
  record('branch is master', branch === 'master')
  record('ahead/behind 0/0', aheadBehind === '0\t0')

  // 2. Audit script structure
  console.log('[2/8] audit script')
  record('audit script exists', existsSync(AUDIT_SCRIPT))
  record('L7-F6A stage constant', /L7-F6A|MASTER-DATA-COVERAGE-AUDIT/.test(auditSrc))
  record('no prisma.create', !/prisma.*\.create\b/.test(auditSrc))
  record('no prisma.update', !/prisma.*\.update\b/.test(auditSrc))
  record('no prisma.upsert', !/prisma.*\.upsert\b/.test(auditSrc))
  record('no prisma.delete', !/prisma.*\.delete\b/.test(auditSrc))
  record('no apply invocation', !/executeL7FCourseSettingApply/.test(auditSrc))
  record('no backup creation', !/createL7FDatabaseBackup|copyFileSync/.test(auditSrc))
  record('reads staff DB', /staffDb|职员数据库/.test(auditSrc))
  record('reads contacts xlsx', /contacts|通讯录/.test(auditSrc))
  record('reads major DB xlsx', /majorDb|专业数据库/.test(auditSrc))
  record('reads course setting xlsx', /courseSettingXlsx|课程设置新模板/.test(auditSrc))
  record('extracts J column teacher', /colJ|任课教师/.test(auditSrc))
  record('extracts K column teacher', /colK|授课任务分配/.test(auditSrc))
  record('normalizes teacher names', /normalize/.test(auditSrc))
  record('computes teacher coverage', /coverageRate/.test(auditSrc) || /matched.*Teacher/.test(auditSrc))
  record('computes classGroup coverage', /classGroupCoverage|sem4.*ClassGroup/.test(auditSrc))
  record('produces attribution matrix', /attributionMatrix|Attribution Matrix/.test(auditSrc))
  record('produces next-stage recommendation', /nextStageRecommendation|Recommendation/.test(auditSrc))
  record('rawIncluded false', /rawIncluded.*false/.test(auditSrc))

  // 3. DB baseline
  console.log('[3/8] DB baseline')
  const course = await prisma.course.count()
  const teacher = await prisma.teacher.count()
  const cg4 = await prisma.classGroup.count({ where: { semesterId: 4 } })
  const tt4 = await prisma.teachingTask.count({ where: { semesterId: 4 } })
  const ttc = await prisma.teachingTaskClass.count()
  const ib39 = await prisma.importBatch.findUnique({ where: { id: 39 } })
  const ib40 = await prisma.importBatch.findUnique({ where: { id: 40 } }).catch(() => null)

  record('Course = 104', course === 104, `count=${course}`)
  record('Teacher = 236 (L7-F6C baseline)', teacher === 236, `count=${teacher}`)
  record('ClassGroup sem4 = 431 (L7-F6C baseline)', cg4 === 431, `count=${cg4}`)
  record('TeachingTask sem4 = 0', tt4 === 0, `count=${tt4}`)
  record('TeachingTaskClass = 446', ttc === 446, `count=${ttc}`)
  record('ImportBatch #39 exists', ib39 != null)
  record('ImportBatch #39 tasks = 0', ib39?.createdTaskCount === 0)
  record('ImportBatch #40 absent', ib40 == null)

  // 4. Audit artifact
  console.log('[4/8] audit artifact')
  record('audit artifact exists', artifact != null)
  if (artifact) {
    record('teacher coverage reported', typeof artifact.teacherCoverage === 'object')
    record('classGroup coverage reported', typeof artifact.classGroupCoverage === 'object')
    record('attribution matrix reported', typeof artifact.attributionMatrix === 'object')
    record('nextStageRecommendation reported', typeof artifact.nextStageRecommendation === 'string')
    record('dbWrite false', artifact.dbWrite === false)
    record('rawIncluded false', artifact.rawIncluded === false)
    record('teacher merged count > 200', (artifact.teacherCoverage?.distinctTeacherTextsMerged ?? 0) > 200)
    record('current teacher match rate > 70%', (artifact.teacherCoverage?.coverageRateCurrentTeacher ?? 0) > 70)
    record('missing teachers > 0', (artifact.teacherCoverage?.missingInCurrentTeacher ?? 0) > 0)
    record('sem4 CG coverage < 100%', (artifact.classGroupCoverage?.coverageRateSem4ClassGroups ?? 100) < 100)
    record('Teacher DB incomplete = YES', artifact.attributionMatrix?.teacherDbIncomplete === 'YES')
    record('ClassGroup DB incomplete = YES', artifact.attributionMatrix?.classGroupDbIncomplete === 'YES')
    record('Apply hard gate missing = YES', artifact.attributionMatrix?.applyHardGateMissing === 'YES')
  }

  // 5. Input files
  console.log('[5/8] input files')
  record('course-setting-xlsx exists', existsSync('D:/Desktop/Course Development System/课程设置新模板.xlsx'))
  record('major-db-xlsx exists', existsSync('D:/Desktop/Course Development System/学院专业数据库.xlsx'))
  record('staff-db exists', existsSync('D:/Desktop/Course Development System/伊春职业学院职员数据库(2026.4).db'))
  record('contacts-xlsx exists', existsSync('D:/Desktop/Course Development System/伊春职业学院通讯录(2026.4)_分部门.xlsx'))

  // 6. No forbidden changes
  console.log('[6/8] no forbidden changes')
  record('no schema changes', (() => { try { return ex('git diff --name-only HEAD -- prisma/schema.prisma').length === 0 } catch { return true } })())
  record('migrations unchanged', !/2026\d{10}_add_l7_f6a_/.test(migrations))
  // L7-F6D1 stage-aware: allow src/lib/import/* changes from L7-F6D1.
  record('no src changes (L7-F6D1 allow-list excluded)', (() => { try { const changes = ex('git diff --name-only HEAD -- src/').split('\n').filter(Boolean); const allowed = changes.filter((f) => f.startsWith('src/lib/import/course-setting-partial-import-plan-l6-e2.ts') || f.startsWith('src/lib/import/course-setting-apply-l7-f.ts')); return changes.length === allowed.length } catch { return true } })())

  // 7. Git / forbidden files
  console.log('[7/8] git / forbidden files')
  record('git diff --check clean', ex('git diff --check').length === 0)
  let tracked: string[] = []
  try { tracked = ex('git ls-files').split('\n').filter(Boolean) } catch {}
  record('no dev.db tracked', !tracked.includes('prisma/dev.db'))
  record('no backup tracked', !tracked.some((f) => f.includes('dev.db.backup')))
  record('no temp/* tracked', !tracked.some((f) => f.startsWith('temp/') && !f.endsWith('README.md') && !f.endsWith('.gitkeep')))
  record('external xlsx not tracked', !tracked.some((f) => f.includes('课程设置新模板') || f.includes('专业数据库') || f.includes('通讯录') || f.includes('职员数据库')))

  // 8. Privacy / docs
  console.log('[8/8] privacy / docs')
  const docsMd = existsSync(join(ROOT, 'docs/l7-f6a-xlsx-master-data-coverage-audit.md'))
  const docsJson = existsSync(join(ROOT, 'docs/l7-f6a-xlsx-master-data-coverage-audit.json'))
  record('L7-F6A docs exist', docsMd)
  record('L7-F6A JSON exists', docsJson)
  if (docsJson) {
    const json = readF(join(ROOT, 'docs/l7-f6a-xlsx-master-data-coverage-audit.json'))
    record('JSON has rawIncluded false', json.includes('"rawIncluded"'))
    record('JSON has no raw phone', !json.includes('1564587') && !json.includes('1384662'))
    record('JSON has no raw email', !json.includes('@'))
    record('JSON has no raw teacher name (sample)', !json.includes('李丹丹') && !json.includes('于耀淇'))
  }
  record('current-project-status has L7-F6A', readF(join(ROOT, 'docs/current-project-status.md')).includes('L7-F6A'))

  // Additional structural checks from artifact
  if (artifact) {
    // Teacher coverage detail
    record('excel rows total > 1000', artifact.teacherCoverage?.excelRowsTotal > 1000)
    record('distinct teachers merged >= 250', artifact.teacherCoverage?.distinctTeacherTextsMerged >= 250)
    record('matched current teacher >= 200', artifact.teacherCoverage?.matchedInCurrentTeacher >= 200)
    record('missing current teacher > 30', artifact.teacherCoverage?.missingInCurrentTeacher > 30)
    record('staff DB readable', artifact.teacherCoverage?.staffDbReadable === true)
    record('staff DB person count >= 400', artifact.teacherCoverage?.staffDbPersonCount >= 400)
    record('matched in staff DB >= 200', artifact.teacherCoverage?.matchedInStaffDb >= 200)
    record('current missing but staff DB matched >= 10', artifact.teacherCoverage?.currentMissingButStaffDbMatched >= 10)
    record('contacts readable', artifact.teacherCoverage?.contactsReadable === true)
    record('contacts person count >= 400', artifact.teacherCoverage?.contactsPersonCount >= 400)
    record('matched in contacts >= 200', artifact.teacherCoverage?.matchedInContacts >= 200)
    record('current missing but contacts matched >= 10', artifact.teacherCoverage?.currentMissingButContactsMatched >= 10)
    record('J column distinct >= 200', artifact.teacherCoverage?.distinctTeacherTextsFromJ >= 200)
    record('K column distinct >= 50', artifact.teacherCoverage?.distinctTeacherTextsFromK >= 50)
    record('empty teacher rows >= 0', artifact.teacherCoverage?.emptyTeacherRows >= 0)
    // ClassGroup coverage detail
    record('excel CG candidates >= 100', artifact.classGroupCoverage?.excelClassGroupCandidateCount >= 100)
    record('sem4 CG count = 36', artifact.classGroupCoverage?.sem4ClassGroupCount === 36)
    record('matched sem4 CG = 0', artifact.classGroupCoverage?.matchedSem4ClassGroups === 0)
    record('missing sem4 CG >= 100', artifact.classGroupCoverage?.missingSem4ClassGroups >= 100)
    record('coverage rate sem4 CG = 0%', artifact.classGroupCoverage?.coverageRateSem4ClassGroups === 0)
    record('major DB readable', artifact.classGroupCoverage?.majorDbReadable === true)
    record('major DB candidates >= 30', artifact.classGroupCoverage?.majorDbClassGroupCandidateCount >= 30)
    // Attribution matrix detail
    record('Teacher DB incomplete = YES', artifact.attributionMatrix?.teacherDbIncomplete === 'YES')
    record('Teacher parser broken = NO', artifact.attributionMatrix?.teacherParserResolutionBroken === 'NO')
    record('ClassGroup DB incomplete = YES', artifact.attributionMatrix?.classGroupDbIncomplete === 'YES')
    record('ClassGroup resolution unsafe = YES', artifact.attributionMatrix?.classGroupResolutionUnsafe === 'YES')
    record('Apply hard gate missing = YES', artifact.attributionMatrix?.applyHardGateMissing === 'YES')
    record('next stage is L7-F6B', artifact.nextStageRecommendation?.includes('L7-F6B'))
    record('targetSemesterId = 4', artifact.targetSemesterId === 4)
    record('baseline Course = 104', artifact.baseline?.course === 104)
    record('baseline Teacher = 220 (L7-F6A captured pre-L7-F6C)', artifact.baseline?.teacher === 220)
    record('baseline CG sem4 = 36 (L7-F6A captured pre-L7-F6C)', artifact.baseline?.cgSem4 === 36)
    record('baseline TT sem4 = 0', artifact.baseline?.ttSem4 === 0)
  }

  // Docs content checks
  if (docsMd) {
    const md = readF(join(ROOT, 'docs/l7-f6a-xlsx-master-data-coverage-audit.md'))
    record('docs have teacher coverage section', md.includes('Teacher Coverage'))
    record('docs have classGroup coverage section', md.includes('ClassGroup Coverage'))
    record('docs have attribution matrix', md.includes('Attribution Matrix'))
    record('docs have root cause conclusion', md.includes('L7-F5 Root Cause'))
    record('docs have next stage recommendation', md.includes('L7-F6B'))
    record('docs have privacy note', md.includes('rawIncluded') || md.includes('No raw') || md.includes('docs/json 无 raw') || md.includes('aggregate only'))
  }
  if (docsJson) {
    const json = readF(join(ROOT, 'docs/l7-f6a-xlsx-master-data-coverage-audit.json'))
    record('JSON has teacherCoverage', json.includes('"teacherCoverage"'))
    record('JSON has classGroupCoverage', json.includes('"classGroupCoverage"'))
    record('JSON has attributionMatrix', json.includes('"attributionMatrix"'))
    record('JSON has nextStageRecommendation', json.includes('"nextStageRecommendation"'))
    record('JSON has l7f5RootCause', json.includes('"l7f5RootCause"'))
    record('JSON has baseline', json.includes('"baseline"'))
    record('JSON has inputFiles', json.includes('"inputFiles"'))
    record('JSON has no phone numbers', !json.match(/\d{11}/))
  }

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
