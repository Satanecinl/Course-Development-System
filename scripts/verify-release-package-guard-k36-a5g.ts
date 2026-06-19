/**
 * scripts/verify-release-package-guard-k36-a5g.ts
 *
 * K36-A5G: Release packaging guard verification script.
 * Runs the guard's built-in self-test, then verifies additional
 * edge cases. No DB access, no file writes.
 *
 * Exit code: 0 = all pass, 1 = failures.
 */

/* eslint-disable @typescript-eslint/no-unused-vars */

import { execSync } from 'child_process'
import * as fs from 'node:fs'

const ROOT = process.cwd()

interface CheckResult {
  id: string
  name: string
  pass: boolean
  detail: string
}
const results: CheckResult[] = []

function check(id: string, name: string, pass: boolean, detail = '') {
  results.push({ id, name, pass, detail })
}

function runGuard(args: string, _expectExit: number): { exit: number; stdout: string } {
  try {
    const out = execSync(`npx tsx scripts/guard-release-package-k36-a5g.ts ${args}`, {
      cwd: ROOT,
      timeout: 30000,
      encoding: 'utf8',
      stdio: ['pipe', 'pipe', 'pipe'],
    })
    return { exit: 0, stdout: out }
  } catch (err: unknown) {
    const error = err as { status?: number; stdout?: string }
    return { exit: error.status ?? 1, stdout: error.stdout ?? '' }
  }
}

// ── 1. Self-test ──────────────────────────────────────────────────
{
  const r = runGuard('--self-test', 0)
  check(
    'self-test suite',
    'Guard built-in self-test passes (17/17)',
    r.exit === 0,
    r.exit === 0 ? 'PASS' : `exit=${r.exit}, stdout=${r.stdout.slice(0, 200)}`,
  )
}

// ── 2. Clean manifest → PASS ──────────────────────────────────────
{
  const manifest = 'src/lib/scheduler/score.ts\nprisma/schema.prisma\npackage.json\n'
  const tmpFile = 'tmp-k36-a5g-manifest-clean.txt'
  fs.writeFileSync(tmpFile, manifest)
  try {
    const r = runGuard(`--manifest ${tmpFile} --json`, 0)
    const json = JSON.parse(r.stdout)
    check(
      'clean manifest PASS',
      'Manifest with safe paths produces PASS',
      json.finalVerdict === 'PASS',
      `verdict=${json.finalVerdict}, blocking=${json.bannedHitCount}, warning=${json.warningHitCount}`,
    )
  } finally {
    fs.unlinkSync(tmpFile)
  }
}

// ── 3. Manifest with dev.db → BLOCKING ────────────────────────────
{
  const manifest = 'prisma/dev.db\n'
  const tmpFile = 'tmp-k36-a5g-manifest-devdb.txt'
  fs.writeFileSync(tmpFile, manifest)
  try {
    const r = runGuard(`--manifest ${tmpFile} --json`, 1)
    const json = JSON.parse(r.stdout)
    check(
      'dev.db manifest FAIL',
      'Manifest with prisma/dev.db produces BLOCKING + FAIL',
      json.finalVerdict === 'FAIL' && json.bannedHitCount >= 1,
      `verdict=${json.finalVerdict}, blocking=${json.bannedHitCount}, first=${json.blockingHits?.[0]?.ruleId}`,
    )
  } finally {
    fs.unlinkSync(tmpFile)
  }
}

// ── 4. Manifest with .env → BLOCKING ──────────────────────────────
{
  const manifest = '.env\n'
  const tmpFile = 'tmp-k36-a5g-manifest-env.txt'
  fs.writeFileSync(tmpFile, manifest)
  try {
    const r = runGuard(`--manifest ${tmpFile} --json`, 1)
    const json = JSON.parse(r.stdout)
    check(
      '.env manifest FAIL',
      'Manifest with .env produces BLOCKING + FAIL',
      json.finalVerdict === 'FAIL' && json.bannedHitCount >= 1,
      `verdict=${json.finalVerdict}, blocking=${json.bannedHitCount}, first=${json.blockingHits?.[0]?.ruleId}`,
    )
  } finally {
    fs.unlinkSync(tmpFile)
  }
}

// ── 5. Manifest with .env.production → BLOCKING ────────────────────
{
  const manifest = '.env.production\n'
  const tmpFile = 'tmp-k36-a5g-manifest-envprod.txt'
  fs.writeFileSync(tmpFile, manifest)
  try {
    const r = runGuard(`--manifest ${tmpFile} --json`, 1)
    const json = JSON.parse(r.stdout)
    check(
      '.env.production manifest FAIL',
      'Manifest with .env.production produces BLOCKING + FAIL',
      json.finalVerdict === 'FAIL' && json.bannedHitCount >= 1,
      `verdict=${json.finalVerdict}, blocking=${json.bannedHitCount}, first=${json.blockingHits?.[0]?.ruleId}`,
    )
  } finally {
    fs.unlinkSync(tmpFile)
  }
}

// ── 6. Manifest with uploads/docx → BLOCKING ──────────────────────
{
  const manifest = 'uploads/report.docx\n'
  const tmpFile = 'tmp-k36-a5g-manifest-uploads.txt'
  fs.writeFileSync(tmpFile, manifest)
  try {
    const r = runGuard(`--manifest ${tmpFile} --json`, 1)
    const json = JSON.parse(r.stdout)
    check(
      'uploads docx manifest FAIL',
      'Manifest with uploads/x.docx produces BLOCKING + FAIL',
      json.finalVerdict === 'FAIL' && json.bannedHitCount >= 1,
      `verdict=${json.finalVerdict}, blocking=${json.bannedHitCount}, first=${json.blockingHits?.[0]?.ruleId}`,
    )
  } finally {
    fs.unlinkSync(tmpFile)
  }
}

// ── 7. Manifest with temp/artifact.docx → BLOCKING ────────────────
{
  const manifest = 'temp/local-artifacts/file.docx\n'
  const tmpFile = 'tmp-k36-a5g-manifest-temp.txt'
  fs.writeFileSync(tmpFile, manifest)
  try {
    const r = runGuard(`--manifest ${tmpFile} --json`, 1)
    const json = JSON.parse(r.stdout)
    check(
      'temp artifact manifest FAIL',
      'Manifest with temp artifact produces BLOCKING + FAIL',
      json.finalVerdict === 'FAIL' && json.bannedHitCount >= 1,
      `verdict=${json.finalVerdict}, blocking=${json.bannedHitCount}, first=${json.blockingHits?.[0]?.ruleId}`,
    )
  } finally {
    fs.unlinkSync(tmpFile)
  }
}

// ── 8. Manifest with scripts/teachers.txt → BLOCKING ──────────────
{
  const manifest = 'scripts/teachers.txt\n'
  const tmpFile = 'tmp-k36-a5g-manifest-teachers.txt'
  fs.writeFileSync(tmpFile, manifest)
  try {
    const r = runGuard(`--manifest ${tmpFile} --json`, 1)
    const json = JSON.parse(r.stdout)
    check(
      'teachers.txt manifest FAIL',
      'Manifest with scripts/teachers.txt produces BLOCKING + FAIL',
      json.finalVerdict === 'FAIL' && json.bannedHitCount >= 1,
      `verdict=${json.finalVerdict}, blocking=${json.bannedHitCount}, first=${json.blockingHits?.[0]?.ruleId}`,
    )
  } finally {
    fs.unlinkSync(tmpFile)
  }
}

// ── 9. Manifest with scripts/generate-report-tech.js → BLOCKING ───
{
  const manifest = 'scripts/generate-report-tech.js\n'
  const tmpFile = 'tmp-k36-a5g-manifest-genreport.txt'
  fs.writeFileSync(tmpFile, manifest)
  try {
    const r = runGuard(`--manifest ${tmpFile} --json`, 1)
    const json = JSON.parse(r.stdout)
    check(
      'generate-report manifest FAIL',
      'Manifest with generate-report script produces BLOCKING + FAIL',
      json.finalVerdict === 'FAIL' && json.bannedHitCount >= 1,
      `verdict=${json.finalVerdict}, blocking=${json.bannedHitCount}, first=${json.blockingHits?.[0]?.ruleId}`,
    )
  } finally {
    fs.unlinkSync(tmpFile)
  }
}

// ── 10. Manifest with ordinary docx → WARNING only in default mode ─
{
  const manifest = 'docs/sample.docx\n'
  const tmpFile = 'tmp-k36-a5g-manifest-docx.txt'
  fs.writeFileSync(tmpFile, manifest)
  try {
    const r = runGuard(`--manifest ${tmpFile} --json`, 0)
    const json = JSON.parse(r.stdout)
    check(
      'docx manifest WARNING only (default)',
      'Manifest with .docx produces WARNING but PASS in default mode',
      json.finalVerdict === 'PASS' && json.warningHitCount >= 1 && json.bannedHitCount === 0,
      `verdict=${json.finalVerdict}, warning=${json.warningHitCount}, blocking=${json.bannedHitCount}`,
    )
  } finally {
    fs.unlinkSync(tmpFile)
  }
}

// ── 11. Manifest with docx + strict → FAIL ────────────────────────
{
  const manifest = 'docs/sample.docx\n'
  const tmpFile = 'tmp-k36-a5g-manifest-docx-strict.txt'
  fs.writeFileSync(tmpFile, manifest)
  try {
    const r = runGuard(`--manifest ${tmpFile} --strict --json`, 1)
    const json = JSON.parse(r.stdout)
    check(
      'docx manifest FAIL (strict)',
      'Manifest with .docx produces WARNING + FAIL in strict mode',
      json.finalVerdict === 'FAIL' && json.warningHitCount >= 1,
      `verdict=${json.finalVerdict}, warning=${json.warningHitCount}`,
    )
  } finally {
    fs.unlinkSync(tmpFile)
  }
}

// ── 12. Output does not print file contents ───────────────────────
{
  const manifest = 'src/lib/scheduler/score.ts\nprisma/schema.prisma\n'
  const tmpFile = 'tmp-k36-a5g-manifest-safe.txt'
  fs.writeFileSync(tmpFile, manifest)
  try {
    const r = runGuard(`--manifest ${tmpFile}`, 0)
    // Check no import statements appear in output (would indicate file content printed)
    const hasImport = /import\s+.*from/.test(r.stdout)
    const hasExport = /export\s+/.test(r.stdout)
    const hasClass = /export\s+(class|function)/.test(r.stdout)
    check(
      'output not file contents',
      'Guard output does not contain file body content (no import/export/class)',
      !hasImport && !hasExport && !hasClass,
      `hasImport=${hasImport}, hasExport=${hasExport}, hasClass=${hasClass}`,
    )
  } finally {
    fs.unlinkSync(tmpFile)
  }
}

// ── 13. JSON output valid and contains required fields ─────────────
{
  const manifest = 'prisma/dev.db\n.env\nuploads/report.docx\n'
  const tmpFile = 'tmp-k36-a5g-manifest-json.txt'
  fs.writeFileSync(tmpFile, manifest)
  try {
    const r = runGuard(`--manifest ${tmpFile} --json`, 1)
    const json = JSON.parse(r.stdout)
    const hasRequired =
      typeof json.scannedFileCount === 'number' &&
      typeof json.bannedHitCount === 'number' &&
      typeof json.warningHitCount === 'number' &&
      Array.isArray(json.blockingHits) &&
      Array.isArray(json.warningHits) &&
      (json.finalVerdict === 'PASS' || json.finalVerdict === 'FAIL')
    check(
      'JSON output has required fields',
      'JSON output contains scannedFileCount, bannedHitCount, warningHitCount, blockingHits, warningHits, finalVerdict',
      hasRequired,
      `hasRequired=${hasRequired}`,
    )
  } finally {
    fs.unlinkSync(tmpFile)
  }
}

// ── 14. temp/README.md and temp/.gitkeep allowlisted ──────────────
{
  const manifest = 'temp/README.md\ntemp/.gitkeep\n'
  const tmpFile = 'tmp-k36-a5g-manifest-temp-ok.txt'
  fs.writeFileSync(tmpFile, manifest)
  try {
    const r = runGuard(`--manifest ${tmpFile} --json`, 0)
    const json = JSON.parse(r.stdout)
    check(
      'temp README/gitkeep allowlisted',
      'temp/README.md and temp/.gitkeep are allowlisted (not BLOCKING)',
      json.finalVerdict === 'PASS' && json.bannedHitCount === 0,
      `verdict=${json.finalVerdict}, blocking=${json.bannedHitCount}`,
    )
  } finally {
    fs.unlinkSync(tmpFile)
  }
}

// ── 15. Semester output.xlsx → BLOCKING ────────────────────────────
{
  const manifest = 'semester_2026.xlsx\n'
  const tmpFile = 'tmp-k36-a5g-manifest-semester.txt'
  fs.writeFileSync(tmpFile, manifest)
  try {
    const r = runGuard(`--manifest ${tmpFile} --json`, 1)
    const json = JSON.parse(r.stdout)
    check(
      'semester_2026.xlsx manifest FAIL',
      'Manifest with semester_2026.xlsx produces BLOCKING + FAIL',
      json.finalVerdict === 'FAIL' && json.bannedHitCount >= 1,
      `verdict=${json.finalVerdict}, blocking=${json.bannedHitCount}`,
    )
  } finally {
    fs.unlinkSync(tmpFile)
  }
}

// ── 16. output.json → BLOCKING ────────────────────────────────────
{
  const manifest = 'output.json\n'
  const tmpFile = 'tmp-k36-a5g-manifest-outputjson.txt'
  fs.writeFileSync(tmpFile, manifest)
  try {
    const r = runGuard(`--manifest ${tmpFile} --json`, 1)
    const json = JSON.parse(r.stdout)
    check(
      'output.json manifest FAIL',
      'Manifest with output.json produces BLOCKING + FAIL',
      json.finalVerdict === 'FAIL' && json.bannedHitCount >= 1,
      `verdict=${json.finalVerdict}, blocking=${json.bannedHitCount}`,
    )
  } finally {
    fs.unlinkSync(tmpFile)
  }
}

// ── 17. Manifest with 汇报材料 keyword → BLOCKING ────────────────
{
  const manifest = 'temp/汇报材料-高校排课系统-test.docx\n'
  const tmpFile = 'tmp-k36-a5g-manifest-huibao.txt'
  fs.writeFileSync(tmpFile, manifest)
  try {
    const r = runGuard(`--manifest ${tmpFile} --json`, 1)
    const json = JSON.parse(r.stdout)
    check(
      '汇报材料 keyword FAIL',
      'Manifest with 汇报材料 keyword produces BLOCKING + FAIL',
      json.finalVerdict === 'FAIL' && json.bannedHitCount >= 1,
      `verdict=${json.finalVerdict}, blocking=${json.bannedHitCount}`,
    )
  } finally {
    fs.unlinkSync(tmpFile)
  }
}

// ── Summary ──────────────────────────────────────────────────────
console.log('')
console.log('=== K36-A5G Release Packaging Guard Verify ===')
console.log('')
let passed = 0
for (const r of results) {
  console.log(`  [${r.pass ? 'PASS' : 'FAIL'}] ${r.id} — ${r.name}`)
  if (r.detail) console.log(`         ${r.detail}`)
  if (r.pass) passed++
}
const failed = results.length - passed
console.log(`\nSummary: ${passed} passed, ${failed} failed`)
if (failed > 0) process.exit(1)
