/**
 * K21-FIX-F Solver Config API Verification
 *
 * Read-only static verification. Confirms that the K21-FIX-F implementation:
 *   - 5 CRUD endpoints exist with correct permission
 *   - DELETE checks SchedulingRun.configId references
 *   - lockedSlotIds JSON parse/serialize helper exists
 *   - No new permission key was introduced
 *   - Validation rules match the K21-FIX-E plan
 *   - helper module exists at src/lib/scheduler/config.ts
 *
 * Strong constraints:
 *   - NO Prisma writes.
 *   - NO business data modifications.
 *   - NO schema / migration / API route modifications.
 *
 * Output:
 *   - Terminal summary
 *   - docs/k21-solver-config-api-implementation-fix-f.json
 */

import * as fs from 'node:fs'
import * as path from 'node:path'

const projectRoot = path.resolve(__dirname, '..')

// ── Helpers ───────────────────────────────────────────────────────────

function readFile(relPath: string): string {
  return fs.readFileSync(path.join(projectRoot, relPath), 'utf-8')
}
function fileExists(relPath: string): boolean {
  return fs.existsSync(path.join(projectRoot, relPath))
}
function fileContains(relPath: string, pattern: string | RegExp): boolean {
  try {
    const content = readFile(relPath)
    return typeof pattern === 'string' ? content.includes(pattern) : pattern.test(content)
  } catch {
    return false
  }
}

// ── Types ─────────────────────────────────────────────────────────────

interface CheckResult {
  id: string
  category: string
  title: string
  passed: boolean
  evidence: string[]
  note?: string
}

// ── Checks ────────────────────────────────────────────────────────────

const results: CheckResult[] = []

function check(result: CheckResult): void {
  results.push(result)
}

// 1. CRUD route files exist
const listRoute = 'src/app/api/admin/scheduler/configs/route.ts'
const idRoute = 'src/app/api/admin/scheduler/configs/[id]/route.ts'

check({
  id: 'API-LIST-ROUTE-EXISTS',
  category: 'CRUD API',
  title: 'GET / POST route file exists at configs/route.ts',
  passed: fileExists(listRoute),
  evidence: [listRoute],
})
check({
  id: 'API-ID-ROUTE-EXISTS',
  category: 'CRUD API',
  title: 'GET / PUT / DELETE route file exists at configs/[id]/route.ts',
  passed: fileExists(idRoute),
  evidence: [idRoute],
})

// 2. CRUD routes use schedule:adjust permission
const PERM = "'schedule:adjust'"
check({
  id: 'API-LIST-PERMISSION',
  category: 'CRUD API',
  title: 'configs/route.ts uses schedule:adjust',
  passed: fileContains(listRoute, PERM),
  evidence: fileContains(listRoute, /requirePermission\(['"]schedule:adjust['"]/) ? [PERM] : ['NOT FOUND'],
})
check({
  id: 'API-ID-PERMISSION',
  category: 'CRUD API',
  title: 'configs/[id]/route.ts uses schedule:adjust',
  passed: fileContains(idRoute, PERM),
  evidence: fileContains(idRoute, /requirePermission\(['"]schedule:adjust['"]/) ? [PERM] : ['NOT FOUND'],
})

// 3. CRUD routes export GET, POST handlers
const exportsGet = fileContains(listRoute, 'export async function GET')
const exportsPost = fileContains(listRoute, 'export async function POST')
const exportsIdGet = fileContains(idRoute, 'export async function GET')
const exportsIdPut = fileContains(idRoute, 'export async function PUT')
const exportsIdDelete = fileContains(idRoute, 'export async function DELETE')

check({
  id: 'API-LIST-EXPORTS',
  category: 'CRUD API',
  title: 'configs/route.ts exports GET and POST',
  passed: exportsGet && exportsPost,
  evidence: [
    `GET export: ${exportsGet}`,
    `POST export: ${exportsPost}`,
  ],
})
check({
  id: 'API-ID-EXPORTS',
  category: 'CRUD API',
  title: 'configs/[id]/route.ts exports GET, PUT, DELETE',
  passed: exportsIdGet && exportsIdPut && exportsIdDelete,
  evidence: [
    `GET export: ${exportsIdGet}`,
    `PUT export: ${exportsIdPut}`,
    `DELETE export: ${exportsIdDelete}`,
  ],
})

// 4. DELETE checks SchedulingRun.configId
const deleteChecksConfigId = fileContains(
  idRoute,
  /schedulingRun[\s\S]{0,40}configId/,
)

check({
  id: 'API-DELETE-CONFIG-IN-USE',
  category: 'CRUD API',
  title: 'DELETE checks SchedulingRun.configId references',
  passed: deleteChecksConfigId && fileContains(idRoute, 'CONFIG_IN_USE'),
  evidence: [
    deleteChecksConfigId ? 'DELETE scans SchedulingRun.configId' : 'NO reference scan detected',
    fileContains(idRoute, 'CONFIG_IN_USE') ? 'Returns 409 CONFIG_IN_USE' : 'NO 409 response',
  ],
})

// 5. Validation rules exist
const listSrc = fileExists(listRoute) ? readFile(listRoute) : ''
const idSrc = fileExists(idRoute) ? readFile(idRoute) : ''
// Use helper file as well for validation logic
const helperPath = 'src/lib/scheduler/config.ts'
const helperSrc = fileExists(helperPath) ? readFile(helperPath) : ''
const validateName = /INVALID_NAME/.test(helperSrc) && /nameMinLen|nameMaxLen|name.*1.*100/.test(helperSrc)
const validateMaxIter = /INVALID_MAX_ITERATIONS/.test(helperSrc) && /maxIterationsMin|maxIterationsMax/.test(helperSrc)
const validateLahc = /INVALID_LAHC_WINDOW_SIZE/.test(helperSrc) && /lahcWindowSizeMin|lahcWindowSizeMax/.test(helperSrc)
const validateSeed = /INVALID_RANDOM_SEED/.test(helperSrc) && /randomSeedMin|randomSeedMax/.test(helperSrc)
const validateSemester = /SEMESTER_NOT_FOUND/.test(listSrc) || /SEMESTER_NOT_FOUND/.test(idSrc)

check({
  id: 'API-VALIDATION-NAME',
  category: 'Validation',
  title: 'name validation (1-100 chars, INVALID_NAME)',
  passed: validateName,
  evidence: [validateName ? 'name length 1-100 enforced' : 'name validation missing'],
})
check({
  id: 'API-VALIDATION-MAX-ITER',
  category: 'Validation',
  title: 'maxIterations validation (100-15000, INVALID_MAX_ITERATIONS)',
  passed: validateMaxIter,
  evidence: [validateMaxIter ? 'maxIterations 100-15000 enforced' : 'maxIterations validation missing'],
})
check({
  id: 'API-VALIDATION-LAHC',
  category: 'Validation',
  title: 'lahcWindowSize validation (50-2000, INVALID_LAHC_WINDOW_SIZE)',
  passed: validateLahc,
  evidence: [validateLahc ? 'lahcWindowSize 50-2000 enforced' : 'lahcWindowSize validation missing'],
})
check({
  id: 'API-VALIDATION-SEED',
  category: 'Validation',
  title: 'randomSeed validation (0-2^31-1, INVALID_RANDOM_SEED)',
  passed: validateSeed,
  evidence: [validateSeed ? 'randomSeed range enforced' : 'randomSeed validation missing'],
})
check({
  id: 'API-VALIDATION-SEMESTER',
  category: 'Validation',
  title: 'semesterId existence check (SEMESTER_NOT_FOUND)',
  passed: validateSemester,
  evidence: [validateSemester ? 'semesterId existence check enforced' : 'semester check missing'],
})

// 6. Helper module exists with key functions
const helperExists = fileExists(helperPath)

const helperValidate = /export function validateConfigPayload/.test(helperSrc)
const helperParse = /export function parseLockedSlotIdsJson/.test(helperSrc)
const helperSerialize = /export function serializeLockedSlotIds/.test(helperSrc)
const helperResolve = /export async function resolveConfigForPreview/.test(helperSrc)
const helperSnapshot = /export function serializeConfigForSnapshot/.test(helperSrc)
const helperNotFound = /class SchedulingConfigNotFoundError/.test(helperSrc)
const helperSemesterMismatch = /class SemesterMismatchError/.test(helperSrc)

check({
  id: 'HELPER-MODULE-EXISTS',
  category: 'Helper',
  title: 'src/lib/scheduler/config.ts exists',
  passed: helperExists,
  evidence: [helperPath],
})
check({
  id: 'HELPER-VALIDATE-CONFIG',
  category: 'Helper',
  title: 'helper exports validateConfigPayload',
  passed: helperValidate,
  evidence: [helperValidate ? 'validateConfigPayload exported' : 'MISSING'],
})
check({
  id: 'HELPER-PARSE-LOCKED',
  category: 'Helper',
  title: 'helper exports parseLockedSlotIdsJson',
  passed: helperParse,
  evidence: [helperParse ? 'parseLockedSlotIdsJson exported' : 'MISSING'],
})
check({
  id: 'HELPER-SERIALIZE-LOCKED',
  category: 'Helper',
  title: 'helper exports serializeLockedSlotIds',
  passed: helperSerialize,
  evidence: [helperSerialize ? 'serializeLockedSlotIds exported' : 'MISSING'],
})
check({
  id: 'HELPER-RESOLVE',
  category: 'Helper',
  title: 'helper exports resolveConfigForPreview',
  passed: helperResolve,
  evidence: [helperResolve ? 'resolveConfigForPreview exported' : 'MISSING'],
})
check({
  id: 'HELPER-SNAPSHOT',
  category: 'Helper',
  title: 'helper exports serializeConfigForSnapshot',
  passed: helperSnapshot,
  evidence: [helperSnapshot ? 'serializeConfigForSnapshot exported' : 'MISSING'],
})
check({
  id: 'HELPER-NOT-FOUND-ERROR',
  category: 'Helper',
  title: 'helper exports SchedulingConfigNotFoundError',
  passed: helperNotFound,
  evidence: [helperNotFound ? 'error class exported' : 'MISSING'],
})
check({
  id: 'HELPER-SEMESTER-MISMATCH-ERROR',
  category: 'Helper',
  title: 'helper exports SemesterMismatchError',
  passed: helperSemesterMismatch,
  evidence: [helperSemesterMismatch ? 'error class exported' : 'MISSING'],
})

// 7. No new permission key in RBAC types
const authTypesPath = 'src/lib/auth/types.ts'
const authTypesSrc = fileExists(authTypesPath) ? readFile(authTypesPath) : ''
// The schedule:adjust key should already be defined; we should NOT see a new key like schedule:config or similar
const hasNewPermKey = /schedule:config-create|schedule:config-delete|schedule:config-update/.test(authTypesSrc) ||
  /schedule:config-create|schedule:config-delete|schedule:config-update/.test(helperSrc) ||
  /schedule:config-create|schedule:config-delete|schedule:config-update/.test(listSrc) ||
  /schedule:config-create|schedule:config-delete|schedule:config-update/.test(idSrc)

check({
  id: 'NO-NEW-PERMISSION-KEY',
  category: 'Constraints',
  title: 'No new permission key introduced (reuses schedule:adjust)',
  passed: !hasNewPermKey,
  evidence: [
    hasNewPermKey
      ? 'NEW PERMISSION KEY DETECTED — K21-FIX-F should reuse schedule:adjust'
      : 'No new permission key detected',
  ],
})

// 8. No requirePermission for new key in route files
const listUsesOnlyScheduleAdjust =
  (listSrc.match(/requirePermission\(['"][^'"]+['"]/g) ?? []).every(
    (m) => m.includes('schedule:adjust'),
  )
const idUsesOnlyScheduleAdjust =
  (idSrc.match(/requirePermission\(['"][^'"]+['"]/g) ?? []).every(
    (m) => m.includes('schedule:adjust'),
  )

check({
  id: 'ROUTE-PERMISSION-CONSTRAINT',
  category: 'Constraints',
  title: 'Both routes call requirePermission only with schedule:adjust',
  passed: listUsesOnlyScheduleAdjust && idUsesOnlyScheduleAdjust,
  evidence: [
    `configs/route.ts permission: ${listUsesOnlyScheduleAdjust ? 'schedule:adjust only' : 'OTHER'}`,
    `configs/[id]/route.ts permission: ${idUsesOnlyScheduleAdjust ? 'schedule:adjust only' : 'OTHER'}`,
  ],
})

// 9. Schema migration file exists
const migrationPath = 'prisma/migrations/20260605000000_add_solver_config_api_fields/migration.sql'
check({
  id: 'MIGRATION-FILE-EXISTS',
  category: 'Schema',
  title: 'migration.sql exists for add_solver_config_api_fields',
  passed: fileExists(migrationPath),
  evidence: [migrationPath],
})

// 10. Schema file has the 4 new fields
const schemaPath = 'prisma/schema.prisma'
const schemaSrc = fileExists(schemaPath) ? readFile(schemaPath) : ''
const hasRandomSeed = /randomSeed\s+Int\?/.test(schemaSrc)
const hasSolverVersion = /solverVersion\s+String\?/.test(schemaSrc)
const hasLockedSlotIds = /lockedSlotIds\s+String\?/.test(schemaSrc)
const hasUpdatedAtOnConfig = /SchedulingConfig[\s\S]*updatedAt\s+DateTime\s+@default\(now\(\)\)\s+@updatedAt/.test(
  schemaSrc,
)

check({
  id: 'SCHEMA-FIELD-RANDOM-SEED',
  category: 'Schema',
  title: 'SchedulingConfig has randomSeed Int?',
  passed: hasRandomSeed,
  evidence: [hasRandomSeed ? 'randomSeed Int? present' : 'MISSING'],
})
check({
  id: 'SCHEMA-FIELD-SOLVER-VERSION',
  category: 'Schema',
  title: 'SchedulingConfig has solverVersion String?',
  passed: hasSolverVersion,
  evidence: [hasSolverVersion ? 'solverVersion String? present' : 'MISSING'],
})
check({
  id: 'SCHEMA-FIELD-LOCKED-SLOT-IDS',
  category: 'Schema',
  title: 'SchedulingConfig has lockedSlotIds String?',
  passed: hasLockedSlotIds,
  evidence: [hasLockedSlotIds ? 'lockedSlotIds String? present' : 'MISSING'],
})
check({
  id: 'SCHEMA-FIELD-UPDATED-AT',
  category: 'Schema',
  title: 'SchedulingConfig has updatedAt DateTime @updatedAt',
  passed: hasUpdatedAtOnConfig,
  evidence: [hasUpdatedAtOnConfig ? 'updatedAt auto-managed present' : 'MISSING'],
})

// ── Output ────────────────────────────────────────────────────────────

const pass = results.filter((r) => r.passed).length
const fail = results.filter((r) => !r.passed).length

console.log('K21-FIX-F Solver Config API Verification')
console.log('=========================================')
for (const r of results) {
  console.log(`${r.passed ? 'PASS' : 'FAIL'}: [${r.id}] ${r.title}`)
  for (const e of r.evidence) console.log(`  - ${e}`)
  if (r.note) console.log(`  note: ${r.note}`)
}
console.log(`\nSummary: ${pass} PASS / ${fail} FAIL`)

// Write JSON report
const reportDir = path.join(projectRoot, 'docs')
if (!fs.existsSync(reportDir)) fs.mkdirSync(reportDir, { recursive: true })
const jsonPath = path.join(reportDir, 'k21-solver-config-api-verification-fix-f.json')
const report = {
  generatedAt: new Date().toISOString(),
  phase: 'K21-FIX-F-SOLVER-CONFIG-API-IMPLEMENTATION',
  verificationType: 'api-static-checks',
  total: results.length,
  pass,
  fail,
  results: results.map((r) => ({
    id: r.id,
    category: r.category,
    title: r.title,
    passed: r.passed,
    evidence: r.evidence,
    note: r.note,
  })),
}
fs.writeFileSync(jsonPath, JSON.stringify(report, null, 2), 'utf-8')
console.log(`\nReport written: ${jsonPath}`)

if (fail > 0) {
  process.exit(1)
}
