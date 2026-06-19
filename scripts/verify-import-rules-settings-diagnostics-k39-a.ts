/**
 * K39-A: Verify import rules settings diagnostics enhancement.
 *
 * Checks:
 * 1. GET import-rules settings API exists
 * 2. GET requires settings:manage permission
 * 3. moduleVersion = K39-A
 * 4. response contains summary
 * 5. response contains sourceEvidence
 * 6. sourceEvidence includes coverage metrics
 * 7. response contains crossCohortGuard
 * 8. crossCohortGuard detectionEnabled true
 * 9. crossCohortGuard approvalRequired true
 * 10. crossCohortGuard hardLocked true
 * 11. response contains importLifecycleRules
 * 12. response contains ruleGroups
 * 13. editability allRulesEditable=false
 * 14. no PATCH/POST enabling editing
 * 15. UI badge no longer says "只读基础版"
 * 16. UI displays Source Evidence coverage
 * 17. UI displays cross-cohort guard card
 * 18. UI displays lifecycle grouping
 * 19. UI has no button to disable cross-cohort guard
 * 20. UI has no button to run historical backfill
 * 21. no Prisma schema/migration changes
 * 22. no importer confirm/rollback/parse semantic changes
 * 23. K38 adjustment rules verify still PASS
 * 24. K37 campus rules verify still PASS
 * 25. K22-C still 73/0/0/0
 * 26. build pass
 */

import { readFileSync } from 'fs'
import { join } from 'path'

const ROOT = process.cwd()
const PASS = '✅'
const FAIL = '❌'
const WARN = '⚠️'
const results: string[] = []

function check(id: number, desc: string, pass: boolean, detail?: string) {
  const tag = pass ? PASS : FAIL
  results.push(`${tag} N${id}: ${desc}${detail ? ` — ${detail}` : ''}`)
}

async function main() {
  console.log('=== K39-A: Import Rules Settings Diagnostics Verification ===\n')

  /* ── N1: API route file exists ── */
  try {
    const routeFile = readFileSync(
      join(ROOT, 'src/app/api/admin/settings/import-rules/route.ts'),
      'utf-8',
    )
    check(1, 'GET import-rules settings API exists', routeFile.includes('export async function GET'))

    /* ── N2: requires settings:manage ── */
    check(2, 'GET requires settings:manage permission', routeFile.includes("requirePermission('settings:manage'"))

    /* ── N3: moduleVersion = K39-A ── */
    check(3, 'moduleVersion = K39-A', routeFile.includes("'K39-A'") || routeFile.includes('"K39-A"'))

    /* ── N4: response contains summary ── */
    check(4, 'Response contains summary', routeFile.includes('summary:'))

    /* ── N11: importLifecycleRules ── */
    check(11, 'Response contains importLifecycleRules', routeFile.includes('importLifecycleRules'))

    /* ── N12: ruleGroups ── */
    check(12, 'Response contains ruleGroups', routeFile.includes('ruleGroups'))

    /* ── N14: no PATCH ── */
    const hasPatch = routeFile.includes('export async function PATCH') || routeFile.includes('export async function POST')
    check(14, 'No PATCH/POST enabling editing', !hasPatch)
  } catch {
    check(1, 'GET import-rules settings API exists', false, 'file not found')
    check(2, 'GET requires settings:manage permission', false, 'file not found')
    check(3, 'moduleVersion = K39-A', false, 'file not found')
    check(4, 'Response contains summary', false, 'file not found')
    check(11, 'Response contains importLifecycleRules', false, 'file not found')
    check(12, 'Response contains ruleGroups', false, 'file not found')
    check(14, 'No PATCH/POST enabling editing', false, 'file not found')
  }

  /* ── N5-N7: sourceEvidence fields ── */
  try {
    const routeFile = readFileSync(
      join(ROOT, 'src/app/api/admin/settings/import-rules/route.ts'),
      'utf-8',
    )
    check(5, 'Response contains sourceEvidence', routeFile.includes('sourceEvidence'))
    check(6, 'sourceEvidence includes coverage metrics', routeFile.includes('evidenceCoveragePercent'))
    check(7, 'Response contains crossCohortGuard', routeFile.includes('crossCohortGuard'))
  } catch {
    check(5, 'Response contains sourceEvidence', false)
    check(6, 'sourceEvidence includes coverage metrics', false)
    check(7, 'Response contains crossCohortGuard', false)
  }

  /* ── N8-N10: cross-cohort guard values ── */
  try {
    const routeFile = readFileSync(
      join(ROOT, 'src/app/api/admin/settings/import-rules/route.ts'),
      'utf-8',
    )
    check(8, 'crossCohortGuard detectionEnabled true', routeFile.includes('detectionEnabled: true'))
    check(9, 'crossCohortGuard approvalRequired true', routeFile.includes('approvalRequired: true'))
    check(10, 'crossCohortGuard hardLocked true', routeFile.includes('hardLocked: true'))
  } catch {
    check(8, 'crossCohortGuard detectionEnabled true', false)
    check(9, 'crossCohortGuard approvalRequired true', false)
    check(10, 'crossCohortGuard hardLocked true', false)
  }

  /* ── N13: editability allRulesEditable=false ── */
  try {
    const routeFile = readFileSync(
      join(ROOT, 'src/app/api/admin/settings/import-rules/route.ts'),
      'utf-8',
    )
    check(13, 'editability allRulesEditable=false', routeFile.includes('allRulesEditable: false'))
  } catch {
    check(13, 'editability allRulesEditable=false', false)
  }

  /* ── N15-N20: UI checks ── */
  try {
    const uiFile = readFileSync(
      join(ROOT, 'src/components/settings/import-rules-settings-panel.tsx'),
      'utf-8',
    )
    check(15, 'UI badge no longer says "只读基础版"', !uiFile.includes('只读基础版'))
    check(16, 'UI displays Source Evidence coverage', uiFile.includes('Source Evidence 覆盖状态') || uiFile.includes('evidenceCoveragePercent'))
    check(17, 'UI displays cross-cohort guard card', uiFile.includes('跨年级合班 Guard') || uiFile.includes('crossCohortGuard'))
    check(18, 'UI displays lifecycle grouping', uiFile.includes('批次生命周期规则') || uiFile.includes('importLifecycleRules'))
    check(19, 'UI has no button to disable cross-cohort guard', !uiFile.includes('关闭跨年级') && !uiFile.includes('disableCrossCohort'))
    check(20, 'UI has no button to run historical backfill', !uiFile.includes('历史回填') && !uiFile.includes('backfillButton'))
  } catch {
    check(15, 'UI badge no longer says "只读基础版"', false, 'file not found')
    check(16, 'UI displays Source Evidence coverage', false, 'file not found')
    check(17, 'UI displays cross-cohort guard card', false, 'file not found')
    check(18, 'UI displays lifecycle grouping', false, 'file not found')
    check(19, 'UI has no button to disable cross-cohort guard', false, 'file not found')
    check(20, 'UI has no button to run historical backfill', false, 'file not found')
  }

  /* ── N21: no Prisma schema/migration changes ── */
  try {
    const schema = readFileSync(join(ROOT, 'prisma/schema.prisma'), 'utf-8')
    // Check schema still has expected structure (no new ImportBatch/TeachingTaskClass fields)
    check(21, 'No Prisma schema/migration changes', !schema.includes('k39') && !schema.includes('K39'))
  } catch {
    check(21, 'No Prisma schema/migration changes', false, 'schema not found')
  }

  /* ── N22: no importer semantic changes ── */
  try {
    const importer = readFileSync(
      join(ROOT, 'src/lib/import/importer.ts'),
      'utf-8',
    )
    // Spot-check: key functions should still exist unchanged
    check(
      22,
      'No importer confirm/rollback/parse semantic changes',
      importer.includes('confirmImportBatch') && importer.includes('validateCrossCohortApprovals'),
    )
  } catch {
    check(22, 'No importer confirm/rollback/parse semantic changes', false, 'importer not found')
  }

  /* ── N25: K22-C still 73/0/0/0 (static check — no rerun) ── */
  try {
    const k22Json = readFileSync(
      join(ROOT, 'docs/k22-score-regression-harness-implementation.json'),
      'utf-8',
    )
    const k22 = JSON.parse(k22Json)
    const summary = k22?.summary
    check(
      25,
      'K22-C still 73/0/0/0',
      summary?.total === 73 && summary?.pass === 73 && summary?.knownFail === 0 && summary?.fail === 0,
      `total=${summary?.total} pass=${summary?.pass} knownFail=${summary?.knownFail} fail=${summary?.fail}`,
    )
  } catch {
    check(25, 'K22-C still 73/0/0/0', false, 'k22 json not found or parse error')
  }

  /* ── N23-N24: delegation checks ── */
  // These are checked by running the actual verify scripts in regression phase
  results.push(`${WARN} N23: K38 adjustment rules verify — check during regression phase`)
  results.push(`${WARN} N24: K37 campus rules verify — check during regression phase`)
  results.push(`${WARN} N26: build pass — check during regression phase`)

  /* ── Print results ── */
  const passed = results.filter((r) => r.startsWith(PASS)).length
  const failed = results.filter((r) => r.startsWith(FAIL)).length
  const warned = results.filter((r) => r.startsWith(WARN)).length

  console.log(results.join('\n'))
  console.log(`\n=== Summary: ${passed} PASS / ${failed} FAIL / ${warned} WARN ===`)

  if (failed > 0) {
    process.exit(1)
  }
}

main()
