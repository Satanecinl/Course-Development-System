/**
 * K34-A1-IMPORT-DETAIL-OBJECT-RENDER-FIX: Verify.
 *
 * Static + lightweight behavioral checks. Asserts that the K34-A page no
 * longer renders raw objects as React children, and that the new
 * defensive formatter helper correctly handles every plausible input
 * shape (string, number, boolean, null, undefined, array, plain object,
 * nested object, JSON-string, payload-wrapper object).
 *
 * Does NOT require a running server or DB write. Uses tsx to evaluate
 * the helper in-process via a tsx-eval shim file.
 */

import { execSync } from 'child_process'
import { existsSync, readFileSync, writeFileSync, unlinkSync } from 'fs'
import { join } from 'path'

const projectRoot = join(__dirname, '..')
interface CheckResult { id: number; name: string; pass: boolean; detail?: string }
const results: CheckResult[] = []
let id = 0
function check(name: string, pass: boolean, detail?: string) {
  id++
  results.push({ id, name, pass, detail })
}

/**
 * Run a self-contained TypeScript snippet via tsx. The snippet is written
 * to a temp .ts file under scripts/ (gitignored via gitignore patterns
 * for _tmp-*) so node module resolution can find @prisma etc. without
 * absolute path tricks. Output is captured via stdout.
 */
function runTsxEval(snippet: string): string {
  const tmpPath = join(projectRoot, 'scripts/_k34-a1-eval.ts')
  writeFileSync(tmpPath, snippet, 'utf-8')
  try {
    const out = execSync(`npx tsx "${tmpPath}"`, {
      cwd: projectRoot,
      encoding: 'utf-8',
    })
    return out
  } finally {
    try {
      // best-effort cleanup; ignore failure
      unlinkSync(tmpPath)
    } catch {
      // ignore
    }
  }
}

function main() {
  console.log('K34-A1-IMPORT-DETAIL-OBJECT-RENDER-FIX: Verify')
  console.log('─'.repeat(60))

  // ── 1. File presence ───────────────────────────────────────────────
  const contentPath = join(
    projectRoot,
    'src/app/admin/import/import-management-content.tsx',
  )
  const helperPath = join(
    projectRoot,
    'src/app/admin/import/import-display-utils.ts',
  )
  const contentSrc = readFileSync(contentPath, 'utf-8')
  const helperSrc = readFileSync(helperPath, 'utf-8')

  check('content component exists', existsSync(contentPath))
  check('helper file exists', existsSync(helperPath))

  // ── 2. No raw object rendering in detail body ─────────────────────
  check(
    'no <span>{w}</span> in content (would render raw object)',
    !/\{w\}/.test(contentSrc),
  )
  check(
    'no <span>{w.type}</span> raw pattern in content',
    !/<span[^>]*>\s*\{w\.type\}\s*<\/span>/.test(contentSrc),
  )
  check(
    'no raw {w.message} in content (would crash if w is string with .message)',
    !/\{w\.message\}/.test(contentSrc),
  )

  // ── 3. Helper functions exported ──────────────────────────────────
  check(
    'helper exports formatImportDisplayValue',
    /export\s+function\s+formatImportDisplayValue\b/.test(helperSrc),
  )
  check(
    'helper exports formatImportWarning',
    /export\s+function\s+formatImportWarning\b/.test(helperSrc),
  )
  check(
    'helper exports normalizeImportWarnings',
    /export\s+function\s+normalizeImportWarnings\b/.test(helperSrc),
  )

  // ── 4. Content imports the helpers ────────────────────────────────
  check(
    'content imports formatImportDisplayValue',
    contentSrc.includes('formatImportDisplayValue'),
  )
  check(
    'content imports formatImportWarning',
    contentSrc.includes('formatImportWarning'),
  )
  check(
    'content imports normalizeImportWarnings',
    contentSrc.includes('normalizeImportWarnings'),
  )

  // ── 5. Content uses formatter at render sites ────────────────────
  check(
    'content uses formatImportWarning in detail warnings list',
    /warnings\.map[\s\S]{0,500}formatImportWarning/.test(contentSrc),
  )
  check(
    'content uses formatImportWarning in quality.warnings list',
    /quality\.warnings\.map[\s\S]{0,500}formatImportWarning/.test(contentSrc),
  )
  check(
    'content uses normalizeImportWarnings for batch.warnings normalization',
    /normalizeImportWarnings\(batch\.warnings\)/.test(contentSrc),
  )

  // ── 6. Detail dialog still rendered (not removed) ────────────────
  check(
    'detail Dialog still present in content',
    /Dialog open={detailOpen}/.test(contentSrc),
  )
  check(
    'view-detail 详情 button still present in list',
    /详情/.test(contentSrc) && /onClick={\(\) => void handleViewDetail/.test(contentSrc),
  )
  check(
    'warnings section title still rendered',
    /警告与错误/.test(contentSrc),
  )
  check(
    'raw JSON toggle still present',
    /\{rawWarningsOpen \? '收起' : '展开'\}原始 JSON/.test(contentSrc),
  )

  // ── 7. Behavior — formatImportWarning handles all input shapes ──
  // Compile a self-contained tsx eval that imports the helper and
  // exercises it across every plausible input shape.
  const evalSnippet = `
import { formatImportWarning, normalizeImportWarnings, formatImportDisplayValue } from '../src/app/admin/import/import-display-utils'

type Case = { name: string; input: unknown; expectSubstring: string | null; expectExact: string | null }
const cases: Case[] = [
  { name: 'string input', input: 'hello', expectExact: 'hello', expectSubstring: null },
  { name: 'number input', input: 42, expectExact: '42', expectSubstring: null },
  { name: 'boolean input', input: true, expectExact: 'true', expectSubstring: null },
  { name: 'null input', input: null, expectExact: '-', expectSubstring: null },
  { name: 'undefined input', input: undefined, expectExact: '-', expectSubstring: null },
  { name: 'object with type+message+recordIndex', input: { type: 'DUPLICATE_CANDIDATE', message: '疑似重复', recordIndex: 5 }, expectSubstring: '[DUPLICATE_CANDIDATE] 第 5 条：疑似重复', expectExact: null },
  { name: 'object with type+message+className+courseName+room', input: { type: 'MISSING_ROOM', message: '缺少教室', recordIndex: 3, className: '森防1班', courseName: '防火', room: 'A101' }, expectSubstring: '班级：森防1班', expectExact: null },
  { name: 'object missing recordIndex', input: { type: 'NOTE', message: '提示' }, expectSubstring: '[NOTE]：提示', expectExact: null },
  { name: 'object with no type or message', input: { foo: 1 }, expectSubstring: 'foo', expectExact: null },
  { name: 'array of objects', input: [{ type: 'A', message: 'm1' }, { type: 'B', message: 'm2' }], expectExact: null, expectSubstring: null /* tested via normalize */ },
  { name: 'nested object with deep message', input: { type: 'X', message: { inner: 'deep' } }, expectSubstring: '[X]', expectExact: null },
]

const lines: string[] = []
for (const c of cases) {
  const out = formatImportWarning(c.input)
  if (c.expectExact !== null) {
    const ok = out === c.expectExact
    lines.push(\`\${ok ? 'PASS' : 'FAIL'} formatImportWarning[\${c.name}] = \${JSON.stringify(out)}\`)
  } else if (c.expectSubstring !== null) {
    const ok = out.includes(c.expectSubstring)
    lines.push(\`\${ok ? 'PASS' : 'FAIL'} formatImportWarning[\${c.name}] substring \${JSON.stringify(c.expectSubstring)} in \${JSON.stringify(out)}\`)
  }
}

// normalizeImportWarnings
const normCases: Array<{ name: string; input: unknown; expectLen: number; expectSubstring?: string }> = [
  { name: 'string[] input', input: ['a', 'b'], expectLen: 2, expectSubstring: 'a' },
  { name: 'object[] input (ImportParseWarning shape)', input: [{ type: 'A', message: 'm', recordIndex: 1 }], expectLen: 1, expectSubstring: '[A]' },
  { name: 'payload wrapper input', input: { version: 2, generatedAt: 'now', warnings: ['x', 'y'], crossCohortApprovals: [] }, expectLen: 2, expectSubstring: 'x' },
  { name: 'JSON string of array', input: '[{"type":"A","message":"m"}]', expectLen: 1, expectSubstring: '[A]' },
  { name: 'JSON string of wrapper', input: '{"warnings":["x"]}', expectLen: 1, expectSubstring: 'x' },
  { name: 'null input', input: null, expectLen: 0 },
  { name: 'undefined input', input: undefined, expectLen: 0 },
  { name: 'plain string', input: 'plain', expectLen: 1, expectSubstring: 'plain' },
  { name: 'single-object wrapper', input: { type: 'SINGLE', message: 'one' }, expectLen: 1, expectSubstring: '[SINGLE]' },
  { name: 'mixed: object with array of strings inside (nested)', input: { warnings: [{ type: 'T', message: 'm' }] }, expectLen: 1, expectSubstring: '[T]' },
]
for (const c of normCases) {
  const out = normalizeImportWarnings(c.input)
  const lenOk = out.length === c.expectLen
  const subOk = c.expectSubstring ? out.some((s) => s.includes(c.expectSubstring!)) : true
  const ok = lenOk && subOk
  lines.push(\`\${ok ? 'PASS' : 'FAIL'} normalizeImportWarnings[\${c.name}] = \${JSON.stringify(out)}\`)
}

console.log(lines.join('\\n'))
`
  let evalOutput: string
  try {
    evalOutput = runTsxEval(evalSnippet)
  } catch (e) {
    check('tsx eval of helper functions', false, String(e))
    printSummaryAndExit()
    return
  }

  // Parse the eval output. Each line is "PASS|FAIL test-name = result".
  const evalLines = evalOutput.trim().split('\n').filter(Boolean)
  for (const line of evalLines) {
    const pass = line.startsWith('PASS')
    const name = line.replace(/^(PASS|FAIL)\s+/, '').split(' = ')[0]
    check(`helper behavior: ${name}`, pass, pass ? undefined : line)
  }

  // ── 8. No schema / migration / API / parser / RBAC changes ─────
  let modifiedFiles: string[] = []
  try {
    const out = execSync('git diff --name-only HEAD', {
      cwd: projectRoot,
      encoding: 'utf-8',
    })
    modifiedFiles = out.split('\n').filter(Boolean)
  } catch {
    // ignore
  }
  const hasSchemaChange = modifiedFiles.some((f) =>
    f.startsWith('prisma/schema.prisma') || f.startsWith('prisma/migrations/'),
  )
  check('no schema/migration changes', !hasSchemaChange)

  // API routes for import must not be modified
  const importApiRoutes = [
    'src/app/api/admin/import/batches/route.ts',
    'src/app/api/admin/import/batches/[id]/route.ts',
    'src/app/api/admin/import/confirm/route.ts',
    'src/app/api/admin/import/parse/route.ts',
    'src/app/api/admin/import/rollback/route.ts',
    'src/app/api/admin/import/batches/[id]/abandon/route.ts',
  ]
  for (const route of importApiRoutes) {
    check(
      `import API route unchanged: ${route}`,
      !modifiedFiles.includes(route),
    )
  }

  // parser / importer unchanged
  for (const f of [
    'scripts/parse_cell.py',
    'scripts/parse_schedule.py',
    'src/lib/import/importer.ts',
    'src/lib/import/parse-utils.ts',
    'src/lib/import/quality-classifier.ts',
  ]) {
    check(`${f} unchanged`, !modifiedFiles.includes(f))
  }

  // K22 expected unchanged
  const K22_FILES = [
    'docs/k22-score-default-snapshot.json',
    'docs/k22-score-regression-harness-implementation.json',
  ]
  let k22Regression = false
  for (const f of K22_FILES) {
    try {
      const diffOut = execSync(`git diff HEAD -- "${f}"`, {
        cwd: projectRoot,
        encoding: 'utf-8',
      })
      if (!diffOut.trim()) continue
      const lines = diffOut.split('\n')
      const nonGen = lines.some((line) => {
        if (!line.startsWith('+') && !line.startsWith('-')) return false
        if (line.startsWith('+++') || line.startsWith('---')) return false
        return !line.includes('"generatedAt"')
      })
      if (nonGen) k22Regression = true
    } catch {
      // ignore
    }
  }
  check('K22 expected/snapshot unchanged', !k22Regression)

  // prisma/dev.db not staged
  const stagedOut = execSync('git diff --cached --name-only', {
    cwd: projectRoot,
    encoding: 'utf-8',
  }).trim()
  const staged = stagedOut.split('\n').filter(Boolean)
  check('prisma/dev.db not staged', !staged.includes('prisma/dev.db'))
  check(
    'no DB backup staged',
    !staged.some((f) => /backup-before-k/i.test(f) || /dev\.db\.backup/i.test(f)),
  )

  // ── 9. Detail button still functional (not hidden) ───────────────
  check(
    'handleViewDetail function still present',
    /async function handleViewDetail/.test(contentSrc),
  )
  check(
    '详情 button still present in batch list table',
    /查看详情/.test(contentSrc) || /详情/.test(contentSrc),
  )

  // ── Summary ──────────────────────────────────────────────────────
  printSummaryAndExit()
}

function printSummaryAndExit() {
  console.log('')
  const passed = results.filter((r) => r.pass).length
  const failed = results.filter((r) => !r.pass)
  for (const r of results) {
    const mark = r.pass ? '✓' : '✗'
    const detail = r.detail ? ` — ${r.detail}` : ''
    console.log(`  ${mark} ${r.name}${detail}`)
  }
  console.log('')
  console.log(`Result: ${passed}/${results.length} passed`)
  if (failed.length > 0) {
    console.log(`FAILED (${failed.length}):`)
    for (const r of failed) {
      console.log(`  - ${r.name}${r.detail ? ` — ${r.detail}` : ''}`)
    }
    process.exit(1)
  }
  console.log('K34-A1 verify PASS')
}

main()
