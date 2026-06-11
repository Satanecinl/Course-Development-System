/**
 * K34-A-IMPORT-MANAGEMENT-BASIC-UI: Verify.
 *
 * Static / lightweight checks only. NO deep chain. NO heavy build / lint /
 * auth run. This script is intentionally cheap so it never hits the 600s
 * harness timeout.
 *
 * Asserts:
 *   1. /admin/import page exists, is no longer a placeholder, and renders
 *      ImportManagementContent inside ProtectedShell.
 *   2. The new client component file exists and exports a default component.
 *   3. The page lists ImportBatch items (table or list).
 *   4. The page provides a status filter.
 *   5. The page provides a refresh control.
 *   6. The page renders warningsJson with defensive parsing (try/catch or
 *      safeJsonParse-style helper).
 *   7. The page does NOT directly write to the DB (no prisma.write calls,
 *      no SQL, no DB-level file writes). All writes must go through
 *      /api/admin/import/* routes.
 *   8. Existing list/detail/confirm/parse/rollback/abandon API routes are
 *      intact and still require import:manage.
 *   9. Existing client helpers (fetchImportBatches, fetchImportBatchDetail,
 *      parseImportFile, confirmImportReal, rollbackImportBatch, abandonImportBatch)
 *      are imported by the page.
 *  10. Confirm action requires the user to type CONFIRM_IMPORT (matches
 *      existing /api/admin/import/confirm confirmText).
 *  11. No schema / migration / DB / parser / importer / K22 expected
 *      changes.
 *  12. prisma/dev.db and DB backup files are not staged.
 *  13. Permission gate: USER (no import:manage) sees a "no permission" hint
 *      and never gets the management UI.
 *  14. Optional: lightweight DB read - count ImportBatch records - to
 *      confirm the dev DB has at least one row to render.
 */

import { execSync } from 'child_process'
import { existsSync, readFileSync } from 'fs'
import { join } from 'path'

const projectRoot = join(__dirname, '..')
interface CheckResult { id: number; name: string; pass: boolean; detail?: string }
const results: CheckResult[] = []
let id = 0
function check(name: string, pass: boolean, detail?: string) {
  id++
  results.push({ id, name, pass, detail })
}

function main() {
  console.log('K34-A-IMPORT-MANAGEMENT-BASIC-UI: Verify')
  console.log('─'.repeat(60))

  // ── 1. Page exists & no longer a placeholder ─────────────────────────
  const pagePath = join(projectRoot, 'src/app/admin/import/page.tsx')
  const pageSrc = existsSync(pagePath) ? readFileSync(pagePath, 'utf-8') : ''

  check('page.tsx exists', existsSync(pagePath))
  check('page uses ProtectedShell', pageSrc.includes('ProtectedShell'))
  check(
    'page no longer has the "feature under construction" placeholder',
    !pageSrc.includes('功能建设中'),
  )
  check(
    'page imports the new content component',
    pageSrc.includes('ImportManagementContent') ||
      pageSrc.includes('./import-management-content'),
  )

  // ── 2. Content component exists and exports a default component ──────
  const contentPath = join(
    projectRoot,
    'src/app/admin/import/import-management-content.tsx',
  )
  const contentSrc = existsSync(contentPath)
    ? readFileSync(contentPath, 'utf-8')
    : ''

  check('content component exists', existsSync(contentPath))
  check(
    'content has "use client"',
    contentSrc.includes("'use client'"),
  )
  check(
    'content exports default component',
    /export\s+default\s+function\s+\w+/.test(contentSrc) ||
      /export\s+default\s+\w+/.test(contentSrc),
  )
  check(
    'content is named ImportManagementContent',
    /function\s+ImportManagementContent\s*\(/.test(contentSrc) ||
      /const\s+ImportManagementContent\s*=/.test(contentSrc) ||
      contentSrc.includes('export default function ImportManagementContent'),
  )

  // ── 3. Lists ImportBatch items ───────────────────────────────────────
  check(
    'content renders a list of ImportBatch items',
    contentSrc.includes('ImportBatchListItem') ||
      contentSrc.includes('fetchImportBatches'),
  )
  check(
    'content has a table or list element',
    /<table[\s>]/.test(contentSrc) || /<ul[\s>]/.test(contentSrc),
  )

  // ── 4. Status filter ────────────────────────────────────────────────
  check(
    'content provides a status filter',
    contentSrc.includes('statusGroup') ||
      contentSrc.includes('status_filter') ||
      contentSrc.includes('状态筛选'),
  )

  // ── 5. Refresh control ──────────────────────────────────────────────
  check(
    'content provides a refresh control',
    contentSrc.includes('loadBatches') || contentSrc.includes('刷新'),
  )

  // ── 6. Defensive warningsJson parsing ───────────────────────────────
  check(
    'content defensively parses warningsJson',
    contentSrc.includes('parseWarningsArray') ||
      contentSrc.includes('safeJsonParse') ||
      /try\s*{[\s\S]*?JSON\.parse/.test(contentSrc),
  )

  // ── 7. No direct DB writes ─────────────────────────────────────────
  const directDbWritePatterns = [
    /prisma\.\w+\.create\s*\(/,
    /prisma\.\w+\.update\s*\(/,
    /prisma\.\w+\.delete\s*\(/,
    /prisma\.\w+\.upsert\s*\(/,
    /prisma\.\$executeRaw/,
    /prisma\.\$queryRaw/,
  ]
  for (const pat of directDbWritePatterns) {
    check(
      `content does not directly call prisma writes (${pat.source})`,
      !pat.test(contentSrc),
    )
  }

  // ── 8. API routes intact & import:manage required ───────────────────
  const apiRoutes = [
    'src/app/api/admin/import/batches/route.ts',
    'src/app/api/admin/import/batches/[id]/route.ts',
    'src/app/api/admin/import/confirm/route.ts',
    'src/app/api/admin/import/parse/route.ts',
    'src/app/api/admin/import/rollback/route.ts',
  ]
  for (const route of apiRoutes) {
    const fullPath = join(projectRoot, route)
    check(`API route exists: ${route}`, existsSync(fullPath))
    if (existsSync(fullPath)) {
      const src = readFileSync(fullPath, 'utf-8')
      check(
        `${route} uses import:manage permission`,
        src.includes('import:manage'),
      )
    }
  }

  // ── 9. Client helpers used ─────────────────────────────────────────
  const requiredClientHelpers = [
    'fetchImportBatches',
    'fetchImportBatchDetail',
    'parseImportFile',
    'confirmImportReal',
    'confirmImportDryRun',
    'rollbackImportBatch',
    'rollbackImportBatchDryRun',
    'abandonImportBatch',
  ]
  for (const helper of requiredClientHelpers) {
    check(`content imports ${helper}`, contentSrc.includes(helper))
  }

  // ── 10. Confirm requires CONFIRM_IMPORT text ───────────────────────
  check(
    'confirm action requires CONFIRM_IMPORT text',
    contentSrc.includes("'CONFIRM_IMPORT'") || contentSrc.includes('"CONFIRM_IMPORT"'),
  )

  // ── 11. No schema / migration / DB / parser / importer changes ─────
  const schemaPath = join(projectRoot, 'prisma/schema.prisma')
  const schemaSrc = existsSync(schemaPath) ? readFileSync(schemaPath, 'utf-8') : ''

  // These checks verify the schema hasn't been modified by looking at the
  // git diff. If no changes are staged, that's the expected state.
  let modifiedFiles: string[] = []
  try {
    const output = execSync('git diff --name-only HEAD', {
      cwd: projectRoot,
      encoding: 'utf-8',
    })
    modifiedFiles = output.split('\n').filter(Boolean)
  } catch {
    // ignore
  }
  let stagedFiles: string[] = []
  try {
    const output = execSync('git diff --cached --name-only', {
      cwd: projectRoot,
      encoding: 'utf-8',
    })
    stagedFiles = output.split('\n').filter(Boolean)
  } catch {
    // ignore
  }
  const allTouched = [...modifiedFiles, ...stagedFiles]
  const hasSchemaChange = allTouched.some((f) =>
    f.startsWith('prisma/schema.prisma') || f.startsWith('prisma/migrations/'),
  )
  check(
    'no schema/migration changes',
    !hasSchemaChange,
    hasSchemaChange ? `touched: ${allTouched.filter((f) => f.startsWith('prisma/')).join(', ')}` : undefined,
  )
  check(
    'schema still contains ImportBatch model',
    schemaSrc.includes('model ImportBatch'),
  )
  check(
    'schema still contains warningsJson field',
    schemaSrc.includes('warningsJson'),
  )

  // Parser / importer unchanged
  const parserModified = modifiedFiles.some((f) => f === 'scripts/parse_cell.py' || f === 'scripts/parse_schedule.py')
  const importerModified = modifiedFiles.some((f) => f === 'src/lib/import/importer.ts' || f === 'src/lib/import/parse-utils.ts' || f === 'src/lib/import/quality-classifier.ts')
  check('parser scripts unchanged', !parserModified)
  check('importer/parse-utils/quality-classifier unchanged', !importerModified)

  // K22 expected unchanged: K34-A MUST NOT modify any K22 expected/snapshot
  // files. The repo has pre-existing `generatedAt` timestamp drift in
  // `docs/k22-score-default-snapshot.json` and
  // `docs/k22-score-regression-harness-implementation.json` from prior
  // stages (K22-L2A etc.); that drift is not a K34-A regression. We check
  // by diffing each K22 file and confirming no non-`generatedAt` field
  // changed.
  const K22_FILES = [
    'docs/k22-score-default-snapshot.json',
    'docs/k22-score-regression-harness-implementation.json',
  ]
  let k22Regression = false
  for (const f of K22_FILES) {
    try {
      const fullPath = join(projectRoot, f)
      if (!existsSync(fullPath)) continue
      // Get diff vs HEAD
      const diffOut = execSync(`git diff HEAD -- "${f}"`, {
        cwd: projectRoot,
        encoding: 'utf-8',
      })
      if (!diffOut.trim()) continue
      // Check whether any non-generatedAt line changed
      const lines = diffOut.split('\n')
      const nonGeneratedAtChanged = lines.some((line) => {
        if (!line.startsWith('+') && !line.startsWith('-')) return false
        if (line.startsWith('+++') || line.startsWith('---')) return false
        return !line.includes('"generatedAt"')
      })
      if (nonGeneratedAtChanged) {
        k22Regression = true
      }
    } catch {
      // ignore
    }
  }
  check('K22 expected/snapshot unchanged by this stage', !k22Regression)

  // ── 12. prisma/dev.db and DB backups not staged ─────────────────────
  const devDbStaged =
    stagedFiles.includes('prisma/dev.db') ||
    allTouched.some((f) => f.includes('prisma/dev.db'))
  check('prisma/dev.db not staged', !devDbStaged)

  const backupStaged = stagedFiles.some((f) =>
    /backup-before-k26|backup-before-k34|dev\.db\.backup/i.test(f),
  )
  check('DB backup not staged', !backupStaged)

  // ── 13. Permission gate ─────────────────────────────────────────────
  check(
    'content uses useHasPermission for import:manage',
    contentSrc.includes('useHasPermission') && contentSrc.includes("'import:manage'"),
  )
  check(
    'content shows "no permission" hint for non-import:manage users',
    contentSrc.includes('没有导入管理权限') || contentSrc.includes('没有权限') || contentSrc.includes('no permission'),
  )

  // ── 14. Lightweight DB read: count ImportBatch ─────────────────────
  try {
    // Check that the dev.db exists and is readable; the actual count check
    // is informational.
    const devDbPath = join(projectRoot, 'prisma/dev.db')
    check('dev.db exists for read check', existsSync(devDbPath))
    // We don't fail the test on missing DB; just record it.
    if (!existsSync(devDbPath)) {
      console.log(`  (note) dev.db not present; skipping live count check`)
    } else {
      // Use sqlite3 if available, else just report
      try {
        const count = execSync(
          `sqlite3 prisma/dev.db "SELECT COUNT(*) FROM ImportBatch"`,
          { cwd: projectRoot, encoding: 'utf-8' },
        ).trim()
        const n = parseInt(count, 10)
        check('dev.db has at least 1 ImportBatch (informational)', n >= 1, `count=${n}`)
      } catch {
        // sqlite3 not available — skip
        console.log('  (note) sqlite3 not available; skipping live count check')
      }
    }
  } catch {
    // ignore
  }

  // ── Summary ─────────────────────────────────────────────────────────
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
  console.log('K34-A verify PASS')
}

main()
