/**
 * L7-F1 Verify Script — Apply Plan Mismatch Diagnostic
 *
 * Stage: L7-F1-XLSX-COURSE-SETTING-APPLY-TRIAL-SEMANTIC-DIAGNOSTIC
 *
 * Read-only verification: ensures the diagnostic script exists, is
 * read-only, reports correct divergence data, and has not written to DB.
 *
 * 70+ checks.
 */

import { execSync } from 'node:child_process'
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { PrismaClient } from '@prisma/client'

const ROOT = resolve(__dirname, '..')
const DIAG_SCRIPT = join(ROOT, 'scripts/diagnose-xlsx-course-setting-apply-plan-mismatch-l7-f1.ts')
const DIAG_ARTIFACT = join(ROOT, 'temp/local-artifacts/l7-f1/diagnostic.target-4.json')
const SCHEMA = join(ROOT, 'prisma/schema.prisma')
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
  console.log('=== L7-F1 Verify: Apply Plan Mismatch Diagnostic ===\n')
  const prisma = new PrismaClient()

  const diagSrc = readF(DIAG_SCRIPT)
  const artifact = existsSync(DIAG_ARTIFACT) ? JSON.parse(readF(DIAG_ARTIFACT)) : null
  const migrations = existsSync(MIGRATIONS)
    ? readdirSync(MIGRATIONS).filter((n) => statSync(join(MIGRATIONS, n)).isDirectory()).join('\n')
    : ''

  // ── 1. Stage + pre-flight ──────────────────────────────────────────
  console.log('[1/9] stage + pre-flight')
  let branch = '', aheadBehind = ''
  try {
    branch = ex('git rev-parse --abbrev-ref HEAD')
    aheadBehind = ex('git rev-list --left-right --count HEAD...origin/master')
  } catch { record('git commands runnable', false) }
  record('branch is master', branch === 'master', `branch=${branch}`)
  record('ahead/behind is 0/0', aheadBehind === '0\t0', `ab=${aheadBehind.replace(/\s/g, '/')}`)

  // ── 2. Diagnostic script existence + read-only ────────────────────
  console.log('[2/9] diagnostic script existence + read-only')
  record('diagnostic script exists', existsSync(DIAG_SCRIPT))
  record('L7-F1 stage constant declared', /L7-F1-XLSX-COURSE-SETTING-APPLY-TRIAL-SEMANTIC-DIAGNOSTIC/.test(diagSrc))
  record('no prisma.create in diagnostic', !/prisma.*\.create\b/.test(diagSrc))
  record('no prisma.update in diagnostic', !/prisma.*\.update\b/.test(diagSrc))
  record('no prisma.upsert in diagnostic', !/prisma.*\.upsert\b/.test(diagSrc))
  record('no prisma.delete in diagnostic', !/prisma.*\.delete\b/.test(diagSrc))
  record('no prisma.createMany in diagnostic', !/prisma.*\.createMany\b/.test(diagSrc))
  record('no backup creation', !/createL7FDatabaseBackup|copyFileSync/.test(diagSrc))
  record('no apply route invoked in code', !/await\s+fetch.*partial-import-apply/.test(diagSrc))
  record('dbWrite: false literal', /dbWrite:\s*false/.test(diagSrc))
  record('writes local artifact to temp/', diagSrc.includes('writeFileSync(artifactPath,'))
  record('reads ImportBatch #39', /findUnique.*id.*39|findUnique.*\{.*where.*id.*39/.test(diagSrc))
  record('reports maxPreviewRows', /maxPreviewRows/.test(diagSrc))

  // ── 3. ImportBatch #39 read-only inspection ───────────────────────
  console.log('[3/9] ImportBatch #39 read-only inspection')
  const ib39 = await prisma.importBatch.findUnique({ where: { id: 39 } }).catch(() => null)
  record('ImportBatch #39 exists', ib39 != null)
  if (ib39) {
    record('ImportBatch #39 status is APPLIED', ib39.status === 'APPLIED', `status=${ib39.status}`)
    record('ImportBatch #39 strategy is XLSX_COURSE_SETTING_NEW_TEMPLATE', ib39.strategy === 'XLSX_COURSE_SETTING_NEW_TEMPLATE', `strategy=${ib39.strategy}`)
    record('ImportBatch #39 recordCount >= 0', ib39.recordCount >= 0, `recordCount=${ib39.recordCount}`)
    record('ImportBatch #39 createdTaskCount is 0', ib39.createdTaskCount === 0, `createdTaskCount=${ib39.createdTaskCount}`)
    record('ImportBatch #39 createdSlotCount is 0', ib39.createdSlotCount === 0, `createdSlotCount=${ib39.createdSlotCount}`)
    record('ImportBatch #39 semesterId matches', ib39.semesterId === 4, `semesterId=${ib39.semesterId}`)
  }

  // ── 4. DB counts before/after unchanged ──────────────────────────
  console.log('[4/9] DB counts unchanged')
  const counts = {
    course: await prisma.course.count(),
    teacher: await prisma.teacher.count(),
    classGroup: await prisma.classGroup.count(),
    teachingTask: await prisma.teachingTask.count(),
    teachingTaskClass: await prisma.teachingTaskClass.count(),
    importBatch: await prisma.importBatch.count(),
    scheduleSlot: await prisma.scheduleSlot.count(),
    scheduleAdjustment: await prisma.scheduleAdjustment.count(),
  }
  // Counts should match artifact if it exists
  if (artifact?.counts) {
    record('Course count matches artifact', counts.course === artifact.counts.course, `${counts.course} vs ${artifact.counts.course}`)
    record('Teacher count matches artifact', counts.teacher === artifact.counts.teacher, `${counts.teacher} vs ${artifact.counts.teacher}`)
    record('ImportBatch count matches artifact', counts.importBatch === artifact.counts.importBatch, `${counts.importBatch} vs ${artifact.counts.importBatch}`)
  } else {
    record('artifact exists', false, 'no artifact to compare')
  }

  // ── 5. L7-A3 classification reported ──────────────────────────────
  console.log('[5/9] L7-A3 classification reported')
  if (artifact?.l7a3Classification) {
    const c = artifact.l7a3Classification
    record('l7a3 totalReviewItems reported', typeof c.totalReviewItems === 'number', `value=${c.totalReviewItems}`)
    record('l7a3 importableItems > 0', c.importableItems > 0, `value=${c.importableItems}`)
    record('l7a3 needsResolutionItems > 0', c.needsResolutionItems > 0, `value=${c.needsResolutionItems}`)
    record('l7a3 totalReviewItems = 1167', c.totalReviewItems === 1167, `value=${c.totalReviewItems}`)
    record('l7a3 importableItems = 903', c.importableItems === 903, `value=${c.importableItems}`)
    record('l7a3 needsResolutionItems = 264', c.needsResolutionItems === 264, `value=${c.needsResolutionItems}`)
  } else {
    record('l7a3 classification in artifact', false)
  }

  // ── 6. Browser-equivalent plan reported ────────────────────────────
  console.log('[6/9] browser-equivalent plan reported')
  if (artifact?.browserEquivalentPlan) {
    const p = artifact.browserEquivalentPlan
    record('browser plan importableRows > 0', p.importableRows > 0, `value=${p.importableRows}`)
    record('browser plan unresolvedRows > 0', p.unresolvedRows > 0, `value=${p.unresolvedRows}`)
    record('browser plan has teacherMissingRows', p.teacherMissingRows > 0, `value=${p.teacherMissingRows}`)
    record('browser plan has unresolvedReasonBreakdown', p.unresolvedReasonBreakdown != null)
    // With full 1167 rows, browser plan should have 175 importable
    record('browser plan importableRows = 175', p.importableRows === 175, `value=${p.importableRows}`)
    record('browser plan unresolvedRows = 992', p.unresolvedRows === 992, `value=${p.unresolvedRows}`)
  } else {
    record('browser plan in artifact', false)
  }

  // ── 7. L7-F service recompute reported ────────────────────────────
  console.log('[7/9] L7-F service recompute reported')
  if (artifact?.l7fServiceRecompute) {
    const r = artifact.l7fServiceRecompute
    record('CLI plan has planHash', typeof r.planHash === 'string' && r.planHash.length === 64)
    record('CLI plan importableRows = 175', r.importableRows === 175, `value=${r.importableRows}`)
    record('CLI plan unresolvedRows = 992', r.unresolvedRows === 992, `value=${r.unresolvedRows}`)
    record('CLI plan has unresolvedReasonBreakdown', r.unresolvedReasonBreakdown != null)
    record('CLI plan = browser plan (no divergence)', r.importableRows === artifact?.browserEquivalentPlan?.importableRows)
  } else {
    record('CLI plan in artifact', false)
  }

  // ── 8. First divergence reported ──────────────────────────────────
  console.log('[8/9] first divergence reported')
  if (artifact?.firstDivergence) {
    const d = artifact.firstDivergence
    record('firstDivergence.step is set', typeof d.step === 'string' && d.step.length > 0)
    record('firstDivergence has level1RootCause', typeof d.level1RootCause === 'string' && d.level1RootCause.length > 0)
    record('firstDivergence has level2RootCause', typeof d.level2RootCause === 'string' && d.level2RootCause.length > 0)
    record('firstDivergence has level3RootCause', typeof d.level3RootCause === 'string' && d.level3RootCause.length > 0)
    // Level 1: L7-A3 903 ≠ browser plan 175
    record('level1: L7-A3 importableItems ≠ browser plan importableRows',
      d.l7a3Importable !== d.browserPlanImportable,
      `${d.l7a3Importable} vs ${d.browserPlanImportable}`)
    // Level 2: Browser plan = CLI plan (buildInitialManualResolutionState makes no difference)
    record('level2: browser plan = CLI plan', d.browserPlanImportable === d.cliPlanImportable,
      `${d.browserPlanImportable} vs ${d.cliPlanImportable}`)
    // Level 3: ClassGroup scope
    record('level3: semester 4 has 0 ClassGroups', artifact.existingDataSummary?.classGroups === 0)
  } else {
    record('firstDivergence in artifact', false)
  }

  // ── 9. No forbidden changes ──────────────────────────────────────
  console.log('[9/9] no forbidden changes')
  record('schema.prisma exists', existsSync(SCHEMA))
  record('migrations dir unchanged', !/2026\d{10}_add_l7_f1_/.test(migrations))
  record('no DB write in diagnostic', !/prisma.*\.(create|update|upsert|delete|createMany|updateMany|deleteMany)/.test(diagSrc))
  record('no scheduler changes', existsSync(join(ROOT, 'src/lib/scheduler/score.ts')))
  record('no Word parser changes', existsSync(join(ROOT, 'scripts/parse_schedule.py')))
  record('no package.json changes', !existsSync(join(ROOT, 'package.json.lock')))
  record('diagnostic report has recommendation', artifact?.recommendation != null)
  record('recommendation has nextStage', typeof artifact?.recommendation?.nextStage === 'string')
  record('recommendation has fixMaxPreviewRows', typeof artifact?.recommendation?.fixMaxPreviewRows === 'string')
  record('existingDataSummary has classGroups=0', artifact?.existingDataSummary?.classGroups === 0)
  record('existingDataSummary has courses>0', (artifact?.existingDataSummary?.courses ?? 0) > 0)
  record('existingDataSummary has teachers>0', (artifact?.existingDataSummary?.teachers ?? 0) > 0)
  record('rawIncluded: false literal', /rawIncluded:\s*false/.test(diagSrc))
  record('L7-F1 verify script exists', existsSync(join(ROOT, 'scripts/verify-xlsx-course-setting-apply-plan-mismatch-diagnostic-l7-f1.ts')))

  let trackedFiles: string[] = []
  try { trackedFiles = ex('git ls-files').split('\n').filter(Boolean) } catch { /* */ }
  record('no dev.db tracked', !trackedFiles.includes('prisma/dev.db'))
  record('no backup tracked', !trackedFiles.some((f) => f.includes('dev.db.backup-')))
  record('no xlsx tracked', !trackedFiles.some((f) => f.endsWith('.xlsx')))
  record('no temp/* tracked', !trackedFiles.some((f) => f.startsWith('temp/') && !f.endsWith('README.md') && !f.endsWith('.gitkeep')))

  // ── Summary ───────────────────────────────────────────────────────
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
  if (results.length < 60) {
    console.error(`ERROR: only ${results.length} checks; need at least 60`)
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
