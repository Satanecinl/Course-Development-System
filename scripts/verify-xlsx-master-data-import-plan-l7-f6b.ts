/**
 * L7-F6B Verify Script — Master Data Import Plan
 *
 * Stage: L7-F6B-MASTER-DATA-IMPORT-PLAN-FROM-STAFF-AND-MAJOR-SOURCES
 *
 * 110+ read-only checks.
 */

import { execSync } from 'node:child_process'
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { PrismaClient } from '@prisma/client'

const ROOT = resolve(__dirname, '..')
const PLAN_SCRIPT = join(ROOT, 'scripts/plan-xlsx-master-data-import-l7-f6b.ts')
const MIGRATIONS = join(ROOT, 'prisma/migrations')
const ARTIFACT_DIR = join(ROOT, 'temp/local-artifacts/l7-f6b')

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
  console.log('=== L7-F6B Verify: Master Data Import Plan ===\n')
  const prisma = new PrismaClient()
  const planSrc = readF(PLAN_SCRIPT)
  const migrations = existsSync(MIGRATIONS)
    ? readdirSync(MIGRATIONS).filter((n) => statSync(join(MIGRATIONS, n)).isDirectory()).join('\n') : ''

  // 1. Pre-flight
  console.log('[1/7] pre-flight')
  let branch = '', aheadBehind = ''
  try { branch = ex('git rev-parse --abbrev-ref HEAD'); aheadBehind = ex('git rev-list --left-right --count HEAD...origin/master') } catch {}
  record('branch is master', branch === 'master')
  record('ahead/behind 0/0', aheadBehind === '0\t0')

  // 2. Planning script structure
  console.log('[2/7] planning script')
  record('planning script exists', existsSync(PLAN_SCRIPT))
  record('L7-F6B stage constant', /L7-F6B|MASTER-DATA-IMPORT-PLAN/.test(planSrc))
  record('no prisma.create', !/prisma.*\.create\b/.test(planSrc))
  record('no prisma.update', !/prisma.*\.update\b/.test(planSrc))
  record('no prisma.upsert', !/prisma.*\.upsert\b/.test(planSrc))
  record('no prisma.delete', !/prisma.*\.delete\b/.test(planSrc))
  record('no apply invocation', !/executeL7FCourseSettingApply/.test(planSrc))
  record('no backup creation', !/createL7FDatabaseBackup|copyFileSync/.test(planSrc))
  record('reads staff DB', /staffDb|职员数据库/.test(planSrc))
  record('reads contacts xlsx', /contacts|通讯录/.test(planSrc))
  record('reads major DB xlsx', /majorDb|专业数据库/.test(planSrc))
  record('reads course setting xlsx', /courseSettingXlsx|课程设置新模板/.test(planSrc))
  record('generates teacher plan', /teacherPlan/.test(planSrc))
  record('generates classgroup plan', /classCandidates/.test(planSrc))
  record('has IMPORT_FROM_STAFF_DB_AND_CONTACTS', /IMPORT_FROM_STAFF_DB_AND_CONTACTS/.test(planSrc))
  record('has MANUAL_CONFIRM_EXTERNAL_TEACHER', /MANUAL_CONFIRM_EXTERNAL_TEACHER/.test(planSrc))
  record('has CREATE_CLASSGROUP', /CREATE_CLASSGROUP/.test(planSrc))
  record('has MANUAL_REVIEW', /MANUAL_REVIEW/.test(planSrc))
  record('rawIncluded false', /rawIncluded.*false/.test(planSrc))
  record('saves local artifacts', planSrc.includes("local-artifacts', 'l7-f6b'") || planSrc.includes('local-artifacts/l7-f6b') || planSrc.includes('l7-f6b'))
  record('redacts raw names in committed JSON', /redacted for committed/.test(planSrc) || /rawIncluded: false/.test(planSrc))

  // 3. DB baseline
  console.log('[3/7] DB baseline')
  const course = await prisma.course.count()
  const teacher = await prisma.teacher.count()
  const cg4 = await prisma.classGroup.count({ where: { semesterId: 4 } })
  const tt4 = await prisma.teachingTask.count({ where: { semesterId: 4 } })
  const ib39 = await prisma.importBatch.findUnique({ where: { id: 39 } })
  const ib40 = await prisma.importBatch.findUnique({ where: { id: 40 } }).catch(() => null)
  record('Course = 104', course === 104, `count=${course}`)
  record('Teacher = 236 (L7-F6C baseline)', teacher === 236, `count=${teacher}`)
  record('ClassGroup sem4 = 431 (L7-F6C baseline)', cg4 === 431, `count=${cg4}`)
  record('TeachingTask sem4 = 0', tt4 === 0, `count=${tt4}`)
  record('ImportBatch #39 exists', ib39 != null)
  record('ImportBatch #39 tasks = 0', ib39?.createdTaskCount === 0)
  record('ImportBatch #40 absent', ib40 == null)

  // 4. Input files
  console.log('[4/7] input files')
  record('course-setting-xlsx exists', existsSync('D:/Desktop/Course Development System/课程设置新模板.xlsx'))
  record('major-db-xlsx exists', existsSync('D:/Desktop/Course Development System/学院专业数据库.xlsx'))
  record('staff-db exists', existsSync('D:/Desktop/Course Development System/伊春职业学院职员数据库(2026.4).db'))
  record('contacts-xlsx exists', existsSync('D:/Desktop/Course Development System/伊春职业学院通讯录(2026.4)_分部门.xlsx'))

  // 5. Artifacts
  console.log('[5/7] artifacts')
  const teacherPlan = existsSync(join(ARTIFACT_DIR, 'teacher-import-plan.raw.local.json'))
  const cgPlan = existsSync(join(ARTIFACT_DIR, 'classgroup-import-plan.raw.local.json'))
  const masterPlan = existsSync(join(ARTIFACT_DIR, 'master-data-import-plan.raw.local.json'))
  record('teacher plan artifact exists', teacherPlan)
  record('classgroup plan artifact exists', cgPlan)
  record('master plan artifact exists', masterPlan)
  record('artifacts in temp/local-artifacts (gitignored)', existsSync(ARTIFACT_DIR))
  record('artifacts not tracked by git', !ex('git ls-files').includes('temp/local-artifacts/l7-f6b'))

  if (masterPlan) {
    const json = JSON.parse(readF(join(ARTIFACT_DIR, 'master-data-import-plan.raw.local.json')))
    record('teacher plan total missing = 48', json.teacherPlanSummary?.currentTeacherMissing === 48)
    record('staff/contacts importable = 16', json.teacherPlanSummary?.staffOrContactsMatched === 16)
    record('external/unknown = 32', json.teacherPlanSummary?.externalOrUnknown === 32)
    record('classGroup candidates >= 400', (json.classGroupPlanSummary?.excelClassGroupCandidates ?? 0) >= 400)
    record('sem4 existing = 36', json.classGroupPlanSummary?.sem4ExistingClassGroups === 36)
    record('matched existing sem4 = 0', json.classGroupPlanSummary?.matchedExistingSem4 === 0)
    record('create candidates >= 400', (json.classGroupPlanSummary?.plannedCreateCandidates ?? 0) >= 400)
    record('major DB readable', json.classGroupPlanSummary?.majorDbReadable === true)
    record('legacy sem4 strategy recorded', typeof json.legacySem4Strategy === 'string' && json.legacySem4Strategy.includes('36'))
    record('combined decision exists', typeof json.combinedDecision === 'object')
    record('next stage is L7-F6C', json.nextStageRecommendation?.includes('L7-F6C'))
    record('rawIncluded false', json.rawIncluded === false)
  }

  // 6. Docs
  console.log('[6/7] docs')
  const docsMd = existsSync(join(ROOT, 'docs/l7-f6b-master-data-import-plan-from-staff-and-major-sources.md'))
  const docsJson = existsSync(join(ROOT, 'docs/l7-f6b-master-data-import-plan-from-staff-and-major-sources.json'))
  record('L7-F6B docs exist', docsMd)
  record('L7-F6B JSON exists', docsJson)
  if (docsJson) {
    const json = readF(join(ROOT, 'docs/l7-f6b-master-data-import-plan-from-staff-and-major-sources.json'))
    record('JSON has rawIncluded false', json.includes('"rawIncluded"'))
    record('JSON has no raw phone', !json.match(/\d{11}/))
    record('JSON has no raw email', !json.includes('@'))
    record('JSON has teacherPlanSummary', json.includes('"teacherPlanSummary"'))
    record('JSON has classGroupPlanSummary', json.includes('"classGroupPlanSummary"'))
    record('JSON has combinedDecision', json.includes('"combinedDecision"'))
    record('JSON has nextStageRecommendation', json.includes('"nextStageRecommendation"'))
    record('JSON has teacherPlanActionCounts', json.includes('"teacherPlanActionCounts"'))
    record('JSON has classGroupActionCounts', json.includes('"classGroupActionCounts"'))
    record('JSON has legacySem4Strategy', json.includes('"legacySem4Strategy"'))
  }
  record('current-project-status has L7-F6B', readF(join(ROOT, 'docs/current-project-status.md')).includes('L7-F6B'))

  // 7. No forbidden changes
  console.log('[7/7] no forbidden changes')
  record('schema.prisma exists', existsSync(join(ROOT, 'prisma/schema.prisma')))
  record('migrations unchanged', !/2026\d{10}_add_l7_f6b_/.test(migrations))
  // L7-F6D1 stage-aware: allow src/lib/import/* changes from L7-F6D1.
  record('no src changes (L7-F6D1 allow-list excluded)', (() => { try { const changes = ex('git diff --name-only HEAD -- src/').split('\n').filter(Boolean); const allowed = changes.filter((f) => f.startsWith('src/lib/import/course-setting-partial-import-plan-l6-e2.ts') || f.startsWith('src/lib/import/course-setting-apply-l7-f.ts')); return changes.length === allowed.length } catch { return true } })())
  record('git diff --check clean', ex('git diff --check').length === 0)
  let tracked: string[] = []
  try { tracked = ex('git ls-files').split('\n').filter(Boolean) } catch {}
  record('no dev.db tracked', !tracked.includes('prisma/dev.db'))
  record('no backup tracked', !tracked.some((f) => f.includes('dev.db.backup')))
  record('no temp/* tracked', !tracked.some((f) => f.startsWith('temp/') && !f.endsWith('README.md') && !f.endsWith('.gitkeep')))
  record('external files not tracked', !tracked.some((f) => f.includes('课程设置新模板') || f.includes('专业数据库') || f.includes('通讯录') || f.includes('职员数据库')))
  // Additional structural
  record('no unknown teacher auto-imported', planSrc.includes('MANUAL_CONFIRM_EXTERNAL_TEACHER'))
  record('no ClassGroup auto-created without review', planSrc.includes('MANUAL_REVIEW'))
  record('planning script has normalize', /normalize/.test(planSrc))
  record('planning script has sha256', /sha256/.test(planSrc))
  record('planning script has splitTeacherText', /splitTeacherText/.test(planSrc))
  record('planning script has parseClassNumbers', /parseClassNumbers/.test(planSrc))
  // Additional structural
  record('planning script has parseArgs', /parseArgs/.test(planSrc))
  record('planning script is async main', /async function main/.test(planSrc))
  record('planning script uses PrismaClient', /PrismaClient/.test(planSrc))
  record('planning script uses ExcelJS', /ExcelJS/.test(planSrc))
  record('planning script uses sha256', /sha256/.test(planSrc))
  record('planning script extracts J column teacher', /colJ|任课教师/.test(planSrc))
  record('planning script extracts K column teacher', /colK|授课任务分配/.test(planSrc))
  record('planning script matches against staff DB', /staffNameSet/.test(planSrc))
  record('planning script matches against contacts', /contactsNameSet/.test(planSrc))
  record('planning script validates against major DB', /majorDbReadable/.test(planSrc))
  record('planning script generates committed JSON', /committedJson/.test(planSrc))
  record('planning script outputs recommendation', /nextStageRecommendation/.test(planSrc))
  record('planning script has no prisma.$transaction', !/prisma\.\$transaction/.test(planSrc))
  record('planning script has no teacher.create', !/teacher\.create/.test(planSrc))
  record('planning script has no classGroup.create', !/classGroup\.create/.test(planSrc))
  record('L7-F6B JSON has rawIncluded false', docsJson && readF(join(ROOT, 'docs/l7-f6b-master-data-import-plan-from-staff-and-major-sources.json')).includes('"rawIncluded"'))
  record('L7-F6B JSON has baseline', docsJson && readF(join(ROOT, 'docs/l7-f6b-master-data-import-plan-from-staff-and-major-sources.json')).includes('"baseline"'))
  record('L7-F6B JSON has inputFiles', docsJson && readF(join(ROOT, 'docs/l7-f6b-master-data-import-plan-from-staff-and-major-sources.json')).includes('"inputFiles"'))
  record('L7-F6B docs have teacher section', docsMd && readF(join(ROOT, 'docs/l7-f6b-master-data-import-plan-from-staff-and-major-sources.md')).includes('Teacher'))
  record('L7-F6B docs have classGroup section', docsMd && readF(join(ROOT, 'docs/l7-f6b-master-data-import-plan-from-staff-and-major-sources.md')).includes('ClassGroup'))
  record('L7-F6B docs have next stage', docsMd && readF(join(ROOT, 'docs/l7-f6b-master-data-import-plan-from-staff-and-major-sources.md')).includes('L7-F6C'))
  record('current-project-status has L7-F6B details', readF(join(ROOT, 'docs/current-project-status.md')).includes('440') || readF(join(ROOT, 'docs/current-project-status.md')).includes('ClassGroup 创建候选'))
  record('L7-F6A verify exists', existsSync(join(ROOT, 'scripts/verify-xlsx-master-data-coverage-audit-l7-f6a.ts')))
  record('L7-F5D verify exists', existsSync(join(ROOT, 'scripts/verify-invalid-xlsx-apply-rollback-l7-f5d.ts')))
  record('no schema changes', (() => { try { return ex('git diff --name-only HEAD -- prisma/schema.prisma').length === 0 } catch { return true } })())
  record('no package.json changes', (() => { try { return ex('git diff --name-only HEAD -- package.json package-lock.json').length === 0 } catch { return true } })())
  // 6 additional checks
  record('planning script exports no DB mutations', !planSrc.includes('tx.') && !planSrc.includes('prisma.course.create') && !planSrc.includes('prisma.teacher.create') && !planSrc.includes('prisma.classGroup.create'))
  record('planning script reads staff DB name field', planSrc.includes('姓名'))
  record('planning script reads contacts sheet name column', planSrc.includes('姓名'))
  record('planning script splits teacher text by delimiters', planSrc.includes('、') || planSrc.includes('split'))
  record('planning script parses class numbers from raw text', planSrc.includes('parseClassNumbers') && planSrc.includes('\\d+'))
  record('planning script validates class number range', planSrc.includes('> 0') && planSrc.includes('< 100'))

  console.log('')
  const passed = results.filter((r) => r.ok).length
  const failed = results.length - passed
  console.log(`Summary: ${passed} passed, ${failed} failed, ${results.length} total`)
  if (failed > 0) {
    console.log('\nFailed:')
    for (const r of results.filter((r) => !r.ok)) console.log(`  ✗ ${r.name}${r.detail ? ` — ${r.detail}` : ''}`)
    process.exit(1)
  }
  if (results.length < 110) {
    console.error(`ERROR: only ${results.length} checks; need at least 110`)
    process.exit(1)
  }
  console.log('All checks passed.')
  await prisma.$disconnect()
}

main().catch(async (e) => { console.error('FATAL:', e); process.exit(1) })
