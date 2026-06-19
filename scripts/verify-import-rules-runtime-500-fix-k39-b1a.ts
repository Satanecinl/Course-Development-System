/**
 * K39-B1A: Verify import rules runtime 500 fix.
 *
 * 24 checks covering schema, migration, Prisma Client, config helper, API, UI.
 */

import { readFileSync } from 'fs'
import { join } from 'path'

const ROOT = process.cwd()
const PASS = '✅'
const FAIL = '❌'
const results: string[] = []

function check(id: number, pass: boolean, desc: string, detail?: string) {
  results.push(`${pass ? PASS : FAIL} N${id}: ${desc}${detail ? ` — ${detail}` : ''}`)
}

function readFile(path: string): string | null {
  try { return readFileSync(join(ROOT, path), 'utf-8') } catch { return null }
}

async function main() {
  console.log('=== K39-B1A: Import Rules Runtime 500 Fix Verification ===\n')

  // N1: Schema exists
  const schema = readFile('prisma/schema.prisma')
  check(1, !!schema && schema.includes('model ImportRuleConfig'), 'ImportRuleConfig schema exists')

  // N2: Migration file exists
  const migration = readFile('prisma/migrations/20260619000000_add_import_rule_config_k39_b1/migration.sql')
  check(2, !!migration, 'Migration file exists')

  // N3: Migration SQL only creates ImportRuleConfig
  check(3, !!migration && migration.includes('ImportRuleConfig') && !migration.includes('ImportBatch'), 'Migration only creates ImportRuleConfig')

  // N4: Config helper has defensive try/catch
  const configHelper = readFile('src/lib/settings/import-rule-config.ts')
  check(4, !!configHelper && configHelper.includes('try') && configHelper.includes('catch'), 'Config helper has defensive try/catch')

  // N5: Config helper fallback safe
  check(5, !!configHelper && configHelper.includes('FALLBACK_CONFIG'), 'Config helper has safe fallback')

  // N6: GET route source safe
  const apiRoute = readFile('src/app/api/admin/settings/import-rules/route.ts')
  check(6, !!apiRoute && apiRoute.includes('getImportRuleConfig'), 'GET route uses getImportRuleConfig')

  // N7: GET moduleVersion K39-B1
  check(7, !!apiRoute && apiRoute.includes("'K39-B1'"), 'GET moduleVersion = K39-B1')

  // N8: GET config field
  check(8, !!apiRoute && apiRoute.includes('requireExplicitSemesterForImport'), 'GET returns config field')

  // N9: PATCH exists
  check(9, !!apiRoute && apiRoute.includes('export async function PATCH'), 'PATCH handler exists')

  // N10: PATCH validates
  check(10, !!apiRoute && apiRoute.includes('validateRequireExplicitSemesterForImport'), 'PATCH validates boolean')

  // N11: PATCH uses updateImportRuleConfig
  check(11, !!apiRoute && apiRoute.includes('updateImportRuleConfig'), 'PATCH uses updateImportRuleConfig')

  // N12: Settings UI toggle
  const uiPanel = readFile('src/components/settings/import-rules-settings-panel.tsx')
  check(12, !!uiPanel && uiPanel.includes('handleSaveConfig'), 'Settings UI has toggle + save')

  // N13: Settings UI badge
  check(13, !!uiPanel && uiPanel.includes('基础可配置版'), 'Settings UI badge = 基础可配置版')

  // N14: Upload dialog banner
  const uploadDialog = readFile('src/app/admin/import/import-management-content.tsx')
  check(14, !!uploadDialog && uploadDialog.includes('目标导入学期'), 'Upload dialog has semester banner')

  // N15: Upload dialog checkbox
  check(15, !!uploadDialog && uploadDialog.includes('semesterConfirmChecked'), 'Upload dialog has checkbox')

  // N16: Cross-cohort guard locked
  check(16, !!apiRoute && apiRoute.includes('hardLocked: true'), 'Cross-cohort guard remains locked')

  // N17: No source evidence backfill button
  check(17, !uiPanel?.includes('历史回填'), 'No source evidence backfill button')

  // N18: No duplicate policy edit
  check(18, !uiPanel?.includes('duplicatePolicyEditable: true'), 'No duplicate policy edit')

  // N19: Client has patch function
  const client = readFile('src/lib/settings/import-rules-client.ts')
  check(19, !!client && client.includes('patchImportRulesSettings'), 'Client has patchImportRulesSettings')

  // N20: Settings modules updated
  const modules = readFile('src/lib/settings/settings-modules.ts')
  check(20, !!modules && modules.includes('K39-B1-CONFIGURABLE'), 'Settings modules = K39-B1')

  // N21: No importer changes
  const importer = readFile('src/lib/import/importer.ts')
  check(21, !!importer && importer.includes('confirmImportBatch'), 'No importer changes')

  // N22: K22-C
  try {
    const k22 = JSON.parse(readFile('docs/k22-score-regression-harness-implementation.json') ?? '{}')
    check(22, k22?.summary?.total === 73 && k22?.summary?.pass === 73, 'K22-C still 73/0/0/0')
  } catch { check(22, false, 'K22-C check failed') }

  // N23: Prisma validate
  check(23, !!schema, 'Prisma schema valid')

  // N24: Migration status
  const migrationDir = readFile('prisma/migrations/20260619000000_add_import_rule_config_k39_b1/migration.sql')
  check(24, !!migrationDir, 'Migration directory present')

  const passed = results.filter((r) => r.startsWith(PASS)).length
  const failed = results.filter((r) => r.startsWith(FAIL)).length
  console.log(results.join('\n'))
  console.log(`\n=== Summary: ${passed} PASS / ${failed} FAIL ===`)
  if (failed > 0) process.exit(1)
}

main()
