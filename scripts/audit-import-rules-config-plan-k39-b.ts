/**
 * K39-B: Read-only audit for import rules default semester config plan.
 *
 * Checks codebase structure to assess feasibility of configurable default
 * import semester. Does NOT write DB, run imports, or modify behavior.
 *
 * 12+ checks: API, importer, semester helper, schema, source evidence,
 * cross-cohort, permissions, config feasibility.
 */

import { readFileSync } from 'fs'
import { join } from 'path'

const ROOT = process.cwd()
const PASS = '✅'
const FAIL = '❌'
const WARN = '⚠️'
const INFO = 'ℹ️'
const results: string[] = []

function check(id: number, tag: string, pass: boolean, desc: string, detail?: string) {
  const icon = pass ? PASS : tag === 'WARN' ? WARN : tag === 'INFO' ? INFO : FAIL
  results.push(`${icon} N${id}: ${desc}${detail ? ` — ${detail}` : ''}`)
}

function readFile(path: string): string | null {
  try { return readFileSync(join(ROOT, path), 'utf-8') } catch { return null }
}

async function main() {
  console.log('=== K39-B: Import Rules Config Plan Audit ===\n')

  /* N1: import-rules settings API is GET-only */
  const importRulesRoute = readFile('src/app/api/admin/settings/import-rules/route.ts')
  if (importRulesRoute) {
    const hasPatch = importRulesRoute.includes('export async function PATCH') || importRulesRoute.includes('export async function POST')
    check(1, 'PASS', !hasPatch, 'import-rules settings API is GET-only', hasPatch ? 'HAS PATCH/POST!' : 'GET only')
    check(1.1, 'INFO', importRulesRoute.includes("'K39-A'"), 'moduleVersion = K39-A present')
  } else {
    check(1, 'FAIL', false, 'import-rules settings API not found')
  }

  /* N2: parse API semester handling */
  const parseRoute = readFile('src/app/api/admin/import/parse/route.ts')
  if (parseRoute) {
    const usesResolve = parseRoute.includes('resolveSchedulerSemester')
    // parse route calls resolveSchedulerSemester() with NO arguments → always active semester
    const callsWithoutArgs = parseRoute.includes('resolveSchedulerSemester()')
    check(2, 'PASS', usesResolve, 'parse API uses resolveSchedulerSemester')
    check(2.1, 'WARN', callsWithoutArgs, 'parse API always uses active semester (no semesterId param)',
      'semesterId only appears in response body, not as input')
  } else {
    check(2, 'FAIL', false, 'parse API route not found')
  }

  /* N3: confirm API semester handling */
  const confirmRoute = readFile('src/app/api/admin/import/confirm/route.ts')
  if (confirmRoute) {
    const acceptsQuery = confirmRoute.includes('searchParams') && confirmRoute.includes('semesterId')
    const usesResolve = confirmRoute.includes('resolveSchedulerSemester')
    check(3, 'PASS', usesResolve, 'confirm API uses resolveSchedulerSemester')
    check(3.1, 'PASS', acceptsQuery, 'confirm API accepts ?semesterId query param')
  } else {
    check(3, 'FAIL', false, 'confirm API route not found')
  }

  /* N4: ImportBatch.semesterId NOT NULL */
  const schema = readFile('prisma/schema.prisma')
  if (schema) {
    const batchIdx = schema.indexOf('model ImportBatch')
    const batchEndIdx = schema.indexOf('}', batchIdx)
    const batchChunk = batchIdx >= 0 ? schema.substring(batchIdx, batchEndIdx + 1) : ''
    const hasSemesterId = batchChunk.includes('semesterId')
    check(4, 'PASS', hasSemesterId, 'ImportBatch.semesterId exists')

    // Check for existing ImportRuleConfig
    const hasImportRuleConfig = schema.includes('model ImportRuleConfig')
    check(4.1, 'INFO', !hasImportRuleConfig, 'No ImportRuleConfig model exists yet',
      hasImportRuleConfig ? 'already exists' : 'clean — new table needed for config')
  } else {
    check(4, 'FAIL', false, 'prisma schema not found')
  }

  /* N5: semester helper */
  const semesterHelper = readFile('src/lib/semester.ts')
  if (semesterHelper) {
    const hasResolve = semesterHelper.includes('resolveSchedulerSemester')
    const hasFallback = semesterHelper.includes('activeSemesters')
    check(5, 'PASS', hasResolve && hasFallback, 'resolveSchedulerSemester helper available',
      'priority: explicit > active > error')
  } else {
    check(5, 'FAIL', false, 'semester helper not found')
  }

  /* N6: source evidence importBatchId field */
  if (schema) {
    const ttcIdx = schema.indexOf('model TeachingTaskClass')
    const ttcEndIdx = schema.indexOf('}', ttcIdx)
    const ttcChunk = ttcIdx >= 0 ? schema.substring(ttcIdx, ttcEndIdx + 1) : ''
    const hasBatchId = ttcChunk.includes('importBatchId')
    check(6, 'PASS', hasBatchId, 'TeachingTaskClass.importBatchId field exists',
      'links evidence to batch → semester traceable')
  } else {
    check(6, 'FAIL', false, 'schema not found')
  }

  /* N7: cross-cohort approval field/flow */
  const importer = readFile('src/lib/import/importer.ts')
  if (importer) {
    const hasApproval = importer.includes('validateCrossCohortApprovals')
    const hasBatchIdKey = importer.includes('buildApprovalTaskKey')
    check(7, 'PASS', hasApproval && hasBatchIdKey, 'cross-cohort approval flow exists',
      'approval keyed by taskKey (course|teacher|weekType), not semester')
  } else {
    check(7, 'FAIL', false, 'importer.ts not found')
  }

  /* N8: duplicate policy status */
  if (importer) {
    const hasExistingConfirmed = importer.includes('existingConfirmed')
    check(8, 'INFO', hasExistingConfirmed, 'Single-confirmed-per-semester guard exists',
      hasExistingConfirmed ? 'prevents double-confirm in same semester' : 'no guard found')
    check(8.1, 'INFO', !importer.includes('duplicatePolicy'), 'No configurable duplicate policy',
      'duplicate behavior is hardcoded, not configurable')
  }

  /* N9: permission boundary */
  const routePerms = readFile('src/lib/auth/route-permissions.ts')
  if (routePerms) {
    const importPerm = routePerms.includes('import:manage')
    const settingsPerm = routePerms.includes('settings:manage')
    check(9, 'PASS', importPerm && settingsPerm, 'Permission boundary clear',
      'import operations=import:manage, settings view=settings:manage')
  } else {
    check(9, 'FAIL', false, 'route-permissions.ts not found')
  }

  /* N10: recommended config candidate */
  // Assessment: requireExplicitSemesterForImport is safest
  check(10, 'INFO', true, 'Recommended config: requireExplicitSemesterForImport (boolean)',
    'safest first step — no behavior change when false, explicit safety when true')

  /* N11: blocking risks */
  const risks: string[] = []
  if (parseRoute && !parseRoute.includes('semesterId')) {
    risks.push('parse API has no semesterId param — needs route change to pass semester')
  }
  const client = readFile('src/lib/import/client.ts')
  if (client && !client.includes('semesterId')) {
    risks.push('parseImportFile client helper has no semesterId param')
  }
  if (risks.length > 0) {
    check(11, 'WARN', false, `Blocking risks: ${risks.length}`, risks.join('; '))
  } else {
    check(11, 'PASS', true, 'No blocking risks identified')
  }

  /* N12: proposed stage name */
  check(12, 'INFO', true, 'Proposed K39-B implementation: K39-B1-SEMESTER-CONFIG-IMPLEMENTATION',
    'schema + API + UI for requireExplicitSemesterForImport')

  /* ── Summary ── */
  const passed = results.filter((r) => r.startsWith(PASS)).length
  const failed = results.filter((r) => r.startsWith(FAIL)).length
  const warned = results.filter((r) => r.startsWith(WARN)).length
  const info = results.filter((r) => r.startsWith(INFO)).length

  console.log(results.join('\n'))
  console.log(`\n=== Summary: ${passed} PASS / ${failed} FAIL / ${warned} WARN / ${info} INFO ===`)

  if (failed > 0) process.exit(1)
}

main()
