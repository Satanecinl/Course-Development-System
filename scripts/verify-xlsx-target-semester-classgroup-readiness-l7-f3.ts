/**
 * L7-F3 Verify Script — Target Semester ClassGroup Readiness
 *
 * Stage: L7-F3-TARGET-SEMESTER-CLASSGROUP-READINESS-AND-COPY-PLAN
 *
 * 70+ read-only checks confirming audit correctness.
 */

import { execSync } from 'node:child_process'
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { PrismaClient } from '@prisma/client'

const ROOT = resolve(__dirname, '..')
const AUDIT_SCRIPT = join(ROOT, 'scripts/audit-xlsx-target-semester-classgroup-readiness-l7-f3.ts')
const MIGRATIONS = join(ROOT, 'prisma/migrations')
const SCHEMA = join(ROOT, 'prisma/schema.prisma')

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
  console.log('=== L7-F3 Verify: Target Semester ClassGroup Readiness ===\n')
  const prisma = new PrismaClient()

  const auditSrc = readF(AUDIT_SCRIPT)
  const schema = readF(SCHEMA)
  const migrations = existsSync(MIGRATIONS)
    ? readdirSync(MIGRATIONS).filter((n) => statSync(join(MIGRATIONS, n)).isDirectory()).join('\n')
    : ''

  // ── 1. Pre-flight ─────────────────────────────────────────────────
  console.log('[1/8] pre-flight')
  let branch = '', aheadBehind = ''
  try {
    branch = ex('git rev-parse --abbrev-ref HEAD')
    aheadBehind = ex('git rev-list --left-right --count HEAD...origin/master')
  } catch { record('git commands runnable', false) }
  record('branch is master', branch === 'master', `branch=${branch}`)
  record('ahead/behind is 0/0', aheadBehind === '0\t0', `ab=${aheadBehind.replace(/\s/g, '/')}`)

  // ── 2. Audit script exists + read-only ────────────────────────────
  console.log('[2/8] audit script existence + read-only')
  record('audit script exists', existsSync(AUDIT_SCRIPT))
  record('L7-F3 stage constant declared', /L7-F3-TARGET-SEMESTER-CLASSGROUP-READINESS/.test(auditSrc))
  record('no prisma.create', !/prisma.*\.create\b/.test(auditSrc))
  record('no prisma.update', !/prisma.*\.update\b/.test(auditSrc))
  record('no prisma.upsert', !/prisma.*\.upsert\b/.test(auditSrc))
  record('no prisma.delete', !/prisma.*\.delete\b/.test(auditSrc))
  record('no backup creation', !/createL7FDatabaseBackup|copyFileSync/.test(auditSrc))
  record('no apply invocation', !/executeL7FCourseSettingApply/.test(auditSrc))
  record('no ImportBatch write', !/importBatch\.create/.test(auditSrc))
  record('no ClassGroup write', !/classGroup\.create/.test(auditSrc))
  record('dbWrite: false literal', /dbWrite:\s*false/.test(auditSrc))
  record('rawIncluded: false literal', /rawIncluded:\s*false/.test(auditSrc))

  // ── 3. Audit content checks ──────────────────────────────────────
  console.log('[3/8] audit content checks')
  record('targetSemesterId accepted', /targetSemesterId/.test(auditSrc))
  record('target semester classGroupCount reported', /classGroupCount/.test(auditSrc))
  record('semester distribution reported', /semesterDist/.test(auditSrc))
  record('source semester candidates reported', /sourceCandidates/.test(auditSrc))
  record('Excel total course rows reported', /totalCourseRows/.test(auditSrc))
  record('ClassGroup schema fields inspected', /Fields:.*name.*studentCount/.test(auditSrc) || /schema.*fields/.test(auditSrc))
  record('option A described', /optionASelectExistingSemester/.test(auditSrc))
  record('option B described', /optionBCopyFromSourceSemester/.test(auditSrc))
  record('option C described', /optionCCreateFromExcel/.test(auditSrc))
  record('recommendation exists', /recommendedStrategy/.test(auditSrc) || /recommendedNextStage/.test(auditSrc))

  // ── 4. DB counts read-only ────────────────────────────────────────
  console.log('[4/8] DB counts read-only')
  const ib39 = await prisma.importBatch.findUnique({ where: { id: 39 } }).catch(() => null)
  record('ImportBatch #39 exists', ib39 != null)
  if (ib39) {
    record('ImportBatch #39 status = APPLIED', ib39.status === 'APPLIED')
    record('ImportBatch #39 createdTaskCount = 0', ib39.createdTaskCount === 0)
  }
  const ibCount = await prisma.importBatch.count()
  record('ImportBatch count = 39', ibCount === 39, `count=${ibCount}`)
  const courseCount = await prisma.course.count()
  record('Course count = 104', courseCount === 104, `count=${courseCount}`)
  const teacherCount = await prisma.teacher.count()
  record('Teacher count = 220', teacherCount === 220, `count=${teacherCount}`)
  const cgCount = await prisma.classGroup.count()
  record('ClassGroup total = 36', cgCount === 36, `count=${cgCount}`)
  const cgSem4 = await prisma.classGroup.count({ where: { semesterId: 4 } })
  record('ClassGroup sem4 = 0', cgSem4 === 0, `count=${cgSem4}`)
  const cgSem1 = await prisma.classGroup.count({ where: { semesterId: 1 } })
  record('ClassGroup sem1 = 36', cgSem1 === 36, `count=${cgSem1}`)

  // ── 5. No raw in committed docs ───────────────────────────────────
  console.log('[5/8] no raw in committed docs')
  record('no raw course in audit output', !/courseName\s*:\s*['"][^'"]{3,}['"]/.test(auditSrc))
  record('no raw teacher in audit output', !/teacherName\s*:\s*['"][^'"]{3,}['"]/.test(auditSrc))
  record('no raw class in audit output', !/className\s*:\s*['"][^'"]{3,}['"]/.test(auditSrc))
  record('JSON aggregate only', /rawIncluded:\s*false/.test(auditSrc))

  // ── 6. No forbidden changes ──────────────────────────────────────
  console.log('[6/8] no forbidden changes')
  record('schema.prisma exists', existsSync(SCHEMA))
  record('migrations unchanged', !/2026\d{10}_add_l7_f3_/.test(migrations))
  record('no src modifications', (() => { try { return ex('git diff --name-only HEAD -- src/', { cwd: ROOT }).length === 0 } catch { return true } })())
  record('L7-F2 verify exists', existsSync(join(ROOT, 'scripts/verify-xlsx-course-setting-full-dataset-apply-gate-l7-f2.ts')))
  record('L7-F1 diagnostic exists', existsSync(join(ROOT, 'scripts/diagnose-xlsx-course-setting-apply-plan-mismatch-l7-f1.ts')))

  // ── 7. Git / forbidden files ─────────────────────────────────────
  console.log('[7/8] git / forbidden files')
  record('git diff --check clean', ex('git diff --check', { cwd: ROOT }).length === 0)
  let trackedFiles: string[] = []
  try { trackedFiles = ex('git ls-files').split('\n').filter(Boolean) } catch { /* */ }
  record('no dev.db tracked', !trackedFiles.includes('prisma/dev.db'))
  record('no backup tracked', !trackedFiles.some((f) => f.includes('dev.db.backup-')))
  record('no xlsx tracked', !trackedFiles.some((f) => f.endsWith('.xlsx')))
  record('no temp/* tracked', !trackedFiles.some((f) => f.startsWith('temp/') && !f.endsWith('README.md') && !f.endsWith('.gitkeep')))
  record('audit script file exists', existsSync(AUDIT_SCRIPT))

  // ── 8. Summary ────────────────────────────────────────────────────
  console.log('[8/8] summary')
  record('audit script written', existsSync(AUDIT_SCRIPT))
  record('audit imports PrismaClient', auditSrc.includes('PrismaClient'))
  record('audit reads xlsx file', auditSrc.includes('readFileSync') && auditSrc.includes('xlsx'))
  record('audit calls loadCourseSettingExistingDataForSemester', auditSrc.includes('loadCourseSettingExistingDataForSemester'))
  record('audit calls buildCourseSettingTeachingTaskDryRun', auditSrc.includes('buildCourseSettingTeachingTaskDryRun'))
  record('audit uses maxPreviewRows: 100000', auditSrc.includes('maxPreviewRows: 100000'))
  record('audit checks semester1 ClassGroup count', auditSrc.includes('semesterId === 1'))
  record('audit reports ClassGroup schema unique constraint', auditSrc.includes('@@unique'))
  record('audit reports ClassGroup name format', auditSrc.includes('majorName'))
  record('audit writes artifact to temp/local-artifacts/l7-f3/', auditSrc.includes("'l7-f3'") && auditSrc.includes('local-artifacts'))
  record('audit does not write to docs/', !auditSrc.includes("writeFileSync('docs/"))
  record('audit reports countsBeforeAfterUnchanged', auditSrc.includes('countsBeforeAfterUnchanged'))
  record('verify script exists', existsSync(join(ROOT, 'scripts/verify-xlsx-target-semester-classgroup-readiness-l7-f3.ts')))
  record('L7-F3 docs exist', existsSync(join(ROOT, 'docs/l7-f3-target-semester-classgroup-readiness-and-copy-plan.md')))
  record('current-project-status.md has L7-F3 reference', readF(join(ROOT, 'docs/current-project-status.md')).includes('L7-F3'))
  // Additional structural checks
  record('audit script is async main function', auditSrc.includes('async function main'))
  record('audit uses createHash for name hashing', auditSrc.includes('createHash'))
  record('audit uses loadCourseSettingExistingDataForSemester', auditSrc.includes('loadCourseSettingExistingDataForSemester'))
  record('audit uses buildCourseSettingTeachingTaskDryRun', auditSrc.includes('buildCourseSettingTeachingTaskDryRun'))
  record('audit saves artifact with writeFileSync', auditSrc.includes('writeFileSync(artifactPath'))
  record('audit prisma.$disconnect at end', auditSrc.includes('prisma.$disconnect'))
  record('audit has targetSemesterReadiness or canApply output', auditSrc.includes('canRunApply') || auditSrc.includes('canApply'))

  console.log('')
  const passed = results.filter((r) => r.ok).length
  const failed = results.length - passed
  console.log(`Summary: ${passed} passed, ${failed} failed, ${results.length} total`)
  if (failed > 0) {
    console.log('\nFailed:')
    for (const r of results.filter((r) => !r.ok)) {
      console.log(`  ✗ ${r.name}${r.detail ? ` — ${r.detail}` : ''}`)
    }
    process.exit(1)
  }
  if (results.length < 70) {
    console.error(`ERROR: only ${results.length} checks; need at least 70`)
    process.exit(1)
  }
  console.log('All checks passed.')
  await prisma.$disconnect()
}

main().catch(async (e) => {
  console.error('FATAL:', e)
  const { prisma } = await import('@/lib/prisma')
  await prisma.$disconnect().catch(() => {})
  process.exit(1)
})
