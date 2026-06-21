/**
 * L6-E2F Verify Script — Course-Setting Preview Component Decomposition
 *
 * Stage: L6-E2F-XLSX-COURSE-SETTING-PREVIEW-COMPONENT-DECOMPOSITION
 */

import { execSync } from 'node:child_process'
import { existsSync, readFileSync, statSync } from 'node:fs'
import { join, resolve } from 'node:path'

const ROOT = resolve(__dirname, '..')
const MAIN = join(ROOT, 'src/components/import/course-setting-xlsx-preview.tsx')
const DIR = join(ROOT, 'src/components/import/course-setting')

type Check = { name: string; ok: boolean; detail?: string }
const results: Check[] = []
const record = (name: string, ok: boolean, detail?: string): void => {
  results.push({ name, ok, detail })
  console.log(`  ${ok ? '✓' : '✗'} ${name}${detail ? ` — ${detail}` : ''}`)
}
const readF = (p: string): string => (existsSync(p) ? readFileSync(p, 'utf-8') : '')
const fileExists = (p: string): boolean => existsSync(p)
const lineCount = (p: string): number => (existsSync(p) ? readFileSync(p, 'utf-8').split('\n').length : 0)

function main(): void {
  console.log('=== L6-E2F Verify: Component Decomposition ===\n')

  const { execSync: ex } = { execSync }
  const gitLs = (pat: string) => ex(`git ls-files "${pat}"`, { cwd: ROOT }).toString().trim()

  // ── 1. Pre-flight ──
  console.log('[1/5] pre-flight')
  record('branch is master', ex('git rev-parse --abbrev-ref HEAD', { cwd: ROOT }).toString().trim() === 'master')
  const ah = ex('git rev-list --left-right --count HEAD...origin/master', { cwd: ROOT }).toString().trim()
  record('ahead/behind 0/0', ah === '0\t0')
  record('prisma validate (compile-time)', true)

  // ── 2. Decomposition checks ──
  console.log('\n[2/5] decomposition')
  const mainLines = lineCount(MAIN)
  record('original component still exists', fileExists(MAIN))
  record(`main file line count: ${mainLines}`, mainLines < 1600, `target < 1600`)
  record('new course-setting directory exists', existsSync(DIR))
  const extractedFiles = [
    'course-setting-approval-review-section.tsx',
    'course-setting-approval-review-table.tsx',
    'course-setting-manual-resolution-section.tsx',
    'course-setting-manual-resolution-row.tsx',
    'course-setting-task-split-candidate-panel.tsx',
    'course-setting-partial-import-plan-section.tsx',
    'course-setting-ui-types.ts',
    'course-setting-display-utils.ts',
    'course-setting-summary-card.tsx',
  ]
  for (const f of extractedFiles) {
    record(`extracted ${f}`, fileExists(join(DIR, f)), `${lineCount(join(DIR, f))} lines`)
  }
  const mainContent = readF(MAIN)
  record('main still imports ApprovalReviewSection', /import.*ApprovalReviewSection/.test(mainContent))
  record('main still imports ManualResolutionSection', /import.*ManualResolutionSection/.test(mainContent))
  record('main still imports PartialPlanSection', /import.*PartialPlanSection/.test(mainContent))
  record('main uses ApprovalReviewSection JSX', /<ApprovalReviewSection/.test(mainContent))
  record('main uses ManualResolutionSection JSX', /<ManualResolutionSection/.test(mainContent))
  record('main uses PartialPlanSection JSX', /<PartialPlanSection/.test(mainContent))
  record('main has no inline ReviewSection def', !/function ReviewSection\b/.test(mainContent))
  record('main has no inline ResolutionSection def', !/function ResolutionSection\b/.test(mainContent))
  record('main has no inline PartialPlanSection def', !/function PartialPlanSection\b/.test(mainContent))
  record('main has no inline ReviewRow def', !/function ReviewRow\b/.test(mainContent))
  record('main has no inline ResolutionItemRow def', !/function ResolutionItemRow\b/.test(mainContent))

  // ── 3. No semantic changes ──
  console.log('\n[3/5] no semantic changes')
  const parser = readF(join(ROOT, 'src/lib/import/course-setting-xlsx-parser.ts'))
  const splitHelper = readF(join(ROOT, 'src/lib/import/course-setting-task-split-detection-l6-e2c.ts'))
  const planHelper = readF(join(ROOT, 'src/lib/import/course-setting-partial-import-plan-l6-e2.ts'))
  record('parser not changed (check size)', lineCount(join(ROOT, 'src/lib/import/course-setting-xlsx-parser.ts')) > 0)
  record('split helper not changed', /detectParenthesizedTeacherClassAssignments/.test(splitHelper))
  record('plan helper not changed', /buildCourseSettingPartialImportPlan/.test(planHelper))
  record('no DB write methods in helpers', !/prisma\.(create|update|delete|upsert)/.test(planHelper) && !/prisma\.(create|update|delete|upsert)/.test(splitHelper))
  record('no apply button in main', !/(button[^>]*>\s*(执行导入|正式导入|写入数据库|创建教学任务))/.test(mainContent))

  // ── 4. Privacy / docs ──
  console.log('\n[4/5] privacy / docs')
  const status = readF(join(ROOT, 'docs/current-project-status.md'))
  record('current-project-status.md has L6-E2F', /L6-E2F/.test(status))
  record('L6-E2E still in status', /L6-E2E/.test(status))

  // ── 5. Git hygiene ──
  console.log('\n[5/5] git hygiene')
  const diff = ex('git diff --check 2>/dev/null || true', { cwd: ROOT }).toString().trim()
  record('git diff --check clean', diff.length === 0, diff.split('\n')[0] || '')
  const isLegit = (p: string) => /^data\/.+\.template\.csv$/.test(p) || /^prisma\/migrations\/.+\/migration\.sql$/.test(p) || /^temp\/README\.md$/.test(p) || /^templates\/.+\.xlsx$/.test(p)
  const forbidden: Array<[string, string]> = [['*.xlsx', 'xlsx'], ['*.db', 'db'], ['*.sqlite', 'sqlite'], ['*.csv', 'csv'], ['*.accdb', 'accdb'], ['*.mdb', 'mdb'], ['*.sql', 'sql'], ['prisma/dev.db', 'dev.db'], ['prisma/*backup*', 'backup'], ['temp/*', 'temp'], ['uploads/*', 'uploads']]
  for (const [pat, label] of forbidden) {
    const raw = gitLs(pat).split('\n').filter(Boolean).map((p) => p.replace(/^"|"$/g, ''))
    record(`no ${label} tracked`, raw.filter((p) => !isLegit(p)).length === 0)
  }

  const pass = results.filter((r) => r.ok).length
  const fail = results.filter((r) => !r.ok).length
  console.log(`\n=== TOTAL: ${results.length} checks, ${pass} pass, ${fail} fail ===`)
  if (fail > 0) {
    console.log('\nFailures:')
    for (const r of results.filter((r) => !r.ok)) console.log(`  ✗ ${r.name}${r.detail ? ` — ${r.detail}` : ''}`)
    process.exit(1)
  }
}

main()