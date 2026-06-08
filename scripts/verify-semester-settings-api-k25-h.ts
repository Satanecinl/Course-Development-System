/**
 * K25-H: Semester settings API verification.
 *
 * Read-only — does not write to DB. Verifies:
 *   1. Route existence
 *   2. Method support
 *   3. Permission enforcement
 *   4. Validation logic
 *   5. Delete protection
 *   6. Activate transaction
 *   7. Non-goals
 *   8. DB read-only snapshot
 */
import { existsSync, readFileSync, readdirSync } from 'fs'
import { resolve } from 'path'

const ROOT = resolve(__dirname, '..')

let passed = 0
let failed = 0
const failures: string[] = []

function assert(cond: boolean, msg: string) {
  if (cond) {
    passed++
    console.log(`  ✅ ${msg}`)
  } else {
    failed++
    failures.push(msg)
    console.error(`  ❌ ${msg}`)
  }
}

function fileRead(rel: string): string {
  return readFileSync(resolve(ROOT, rel), 'utf-8')
}

function fileExists(rel: string): boolean {
  return existsSync(resolve(ROOT, rel))
}

// ─── A. Route existence ──────────────────────────────────────────────────────

function testRouteExistence() {
  console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━')
  console.log('A. Route existence')
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━')

  assert(fileExists('src/app/api/semesters/route.ts'), 'GET/POST /api/semesters route exists')
  assert(fileExists('src/app/api/semesters/[id]/route.ts'), 'PUT/DELETE /api/semesters/[id] route exists')
  assert(fileExists('src/app/api/semesters/[id]/activate/route.ts'), 'POST /api/semesters/[id]/activate route exists')
  assert(fileExists('src/app/api/semesters/[id]/dependencies/route.ts'), 'GET /api/semesters/[id]/dependencies route exists')

  // Service files
  assert(fileExists('src/lib/semesters/semester-service.ts'), 'semester-service.ts exists')
  assert(fileExists('src/lib/semesters/semester-validation.ts'), 'semester-validation.ts exists')
}

// ─── B. Method support ───────────────────────────────────────────────────────

function testMethodSupport() {
  console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━')
  console.log('B. Method support')
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━')

  // GET /api/semesters with includeCounts
  {
    const src = fileRead('src/app/api/semesters/route.ts')
    assert(/export\s+async\s+function\s+GET/.test(src), 'GET handler exists')
    assert(/includeCounts/.test(src), 'supports includeCounts parameter')
    assert(/export\s+async\s+function\s+POST/.test(src), 'POST handler exists')
  }

  // PUT/DELETE /api/semesters/[id]
  {
    const src = fileRead('src/app/api/semesters/[id]/route.ts')
    assert(/export\s+async\s+function\s+PUT/.test(src), 'PUT handler exists')
    assert(/export\s+async\s+function\s+DELETE/.test(src), 'DELETE handler exists')
  }

  // POST /api/semesters/[id]/activate
  {
    const src = fileRead('src/app/api/semesters/[id]/activate/route.ts')
    assert(/export\s+async\s+function\s+POST/.test(src), 'activate POST handler exists')
  }

  // GET /api/semesters/[id]/dependencies
  {
    const src = fileRead('src/app/api/semesters/[id]/dependencies/route.ts')
    assert(/export\s+async\s+function\s+GET/.test(src), 'dependencies GET handler exists')
  }
}

// ─── C. Permission ───────────────────────────────────────────────────────────

function testPermissions() {
  console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━')
  console.log('C. Permission enforcement')
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━')

  // Basic GET remains compatible (no auth gate for basic list)
  {
    const src = fileRead('src/app/api/semesters/route.ts')
    // The basic GET should work without auth — only includeCounts requires auth
    assert(/if\s*\(\s*includeCounts\s*\)/.test(src), 'includeCounts auth is conditional')
    assert(/settings:manage/.test(src), 'includeCounts uses settings:manage')
  }

  // Write routes require settings:manage
  {
    const src = fileRead('src/app/api/semesters/route.ts')
    assert(/requirePermission\(.+settings:manage/.test(src), 'POST requires settings:manage')
  }

  {
    const src = fileRead('src/app/api/semesters/[id]/route.ts')
    assert(/requirePermission\(.+settings:manage/.test(src), 'PUT/DELETE requires settings:manage')
  }

  {
    const src = fileRead('src/app/api/semesters/[id]/activate/route.ts')
    assert(/requirePermission\(.+settings:manage/.test(src), 'activate requires settings:manage')
  }

  {
    const src = fileRead('src/app/api/semesters/[id]/dependencies/route.ts')
    assert(/requirePermission\(.+settings:manage/.test(src), 'dependencies requires settings:manage')
  }
}

// ─── D. Validation ───────────────────────────────────────────────────────────

function testValidation() {
  console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━')
  console.log('D. Validation')
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━')

  const validationSrc = fileRead('src/lib/semesters/semester-validation.ts')

  assert(/name.*不能为空|name.*required/i.test(validationSrc), 'name required validation')
  assert(/code.*不能为空|code.*required/i.test(validationSrc), 'code required validation')
  assert(/parseSemesterId/.test(validationSrc), 'parseSemesterId exists')
  assert(/parseDateOrNull/.test(validationSrc), 'parseDateOrNull exists')
  assert(/INVALID_DATE_RANGE/.test(validationSrc), 'date range validation exists')
  assert(/validateSemesterCreate/.test(validationSrc), 'validateSemesterCreate exists')
  assert(/validateSemesterUpdate/.test(validationSrc), 'validateSemesterUpdate exists')

  // Code uniqueness in route
  const routeSrc = fileRead('src/app/api/semesters/route.ts')
  assert(/SEMESTER_CODE_EXISTS/.test(routeSrc), 'code uniqueness check in POST')

  const idSrc = fileRead('src/app/api/semesters/[id]/route.ts')
  assert(/SEMESTER_CODE_EXISTS/.test(idSrc), 'code uniqueness check in PUT')

  // Not found handling
  assert(/SEMESTER_NOT_FOUND/.test(idSrc), 'not found handling in PUT/DELETE')

  // Invalid id handling — parseSemesterId returns INVALID_SEMESTER_ID
  const validationSrc2 = fileRead('src/lib/semesters/semester-validation.ts')
  assert(/INVALID_SEMESTER_ID/.test(validationSrc2), 'invalid id handling in validation module')

  // Direct deactivation guard
  assert(/CANNOT_DEACTIVATE_ACTIVE_SEMESTER_DIRECTLY/.test(idSrc), 'direct deactivation guard')
}

// ─── E. Delete protection ────────────────────────────────────────────────────

function testDeleteProtection() {
  console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━')
  console.log('E. Delete protection')
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━')

  const serviceSrc = fileRead('src/lib/semesters/semester-service.ts')

  // 7 dependency models
  assert(/classGroup\.count/.test(serviceSrc), 'checks ClassGroup dependencies')
  assert(/teachingTask\.count/.test(serviceSrc), 'checks TeachingTask dependencies')
  assert(/scheduleSlot\.count/.test(serviceSrc), 'checks ScheduleSlot dependencies')
  assert(/scheduleAdjustment\.count/.test(serviceSrc), 'checks ScheduleAdjustment dependencies')
  assert(/schedulingRun\.count/.test(serviceSrc), 'checks SchedulingRun dependencies')
  assert(/schedulingConfig\.count/.test(serviceSrc), 'checks SchedulingConfig dependencies')
  assert(/importBatch\.count/.test(serviceSrc), 'checks ImportBatch dependencies')

  // Active semester delete forbidden
  assert(/激活学期/.test(serviceSrc), 'active semester delete blocked')
  assert(/semester\.isActive/.test(serviceSrc), 'checks isActive flag for delete protection')

  // Last semester delete forbidden
  assert(/最后一个学期|totalSemesters.*<=.*1/.test(serviceSrc), 'last semester delete blocked')

  // Dependency total > 0 blocks
  assert(/dependencies\.total.*>.*0|total.*业务数据/.test(serviceSrc), 'dependency total > 0 blocks delete')

  // No cascade delete
  assert(!/cascade|onDelete.*Cascade/i.test(serviceSrc), 'no cascade delete in service')

  // Route uses delete status
  const deleteSrc = fileRead('src/app/api/semesters/[id]/route.ts')
  assert(/getSemesterDeleteStatus/.test(deleteSrc), 'route uses delete status check')
  assert(/SEMESTER_ACTIVE_DELETE_FORBIDDEN/.test(deleteSrc), 'route returns active delete error')
  assert(/SEMESTER_LAST_DELETE_FORBIDDEN/.test(deleteSrc), 'route returns last delete error')
  assert(/SEMESTER_HAS_DEPENDENCIES/.test(deleteSrc), 'route returns dependency error')
}

// ─── F. Activate ─────────────────────────────────────────────────────────────

function testActivate() {
  console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━')
  console.log('F. Activate transaction')
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━')

  const serviceSrc = fileRead('src/lib/semesters/semester-service.ts')

  assert(/\$transaction/.test(serviceSrc), 'uses Prisma transaction')
  assert(/updateMany.*isActive.*false/.test(serviceSrc), 'deactivates all semesters')
  assert(/isActive:\s*true/.test(serviceSrc), 'activates target semester')

  // Idempotent handling
  const activateSrc = fileRead('src/app/api/semesters/[id]/activate/route.ts')
  assert(/semester\.isActive/.test(activateSrc), 'checks if already active')
  assert(/SEMESTER_NOT_FOUND/.test(activateSrc), 'handles not found')
}

// ─── G. Create / Update active ───────────────────────────────────────────────

function testCreateUpdateActive() {
  console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━')
  console.log('G. Create / Update active transaction')
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━')

  const serviceSrc = fileRead('src/lib/semesters/semester-service.ts')

  // createSemester uses transaction when isActive=true
  assert(/createSemester/.test(serviceSrc), 'createSemester function exists')
  assert(/if\s*\(\s*input\.isActive\s*\)/.test(serviceSrc), 'create checks isActive for transaction')

  // updateSemester uses transaction when isActive=true
  assert(/updateSemester/.test(serviceSrc), 'updateSemester function exists')
  assert(/if\s*\(\s*input\.isActive\s*===\s*true\s*\)/.test(serviceSrc), 'update checks isActive for transaction')
}

// ─── H. Non-goals ────────────────────────────────────────────────────────────

function testNonGoals() {
  console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━')
  console.log('H. Non-goals')
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━')

  // No schema changes
  assert(fileExists('prisma/schema.prisma'), 'schema.prisma exists (not deleted)')

  // Settings page — K25-H was API-only, K25-I implements UI
  if (fileExists('src/app/admin/settings/page.tsx')) {
    console.log('  ℹ settings page exists (K25-I may have implemented UI)')
  }

  // No new migrations
  if (fileExists('prisma/migrations')) {
    const migrations = readdirSync(resolve(ROOT, 'prisma/migrations'))
    const k25hMigrations = migrations.filter((m: string) => m.includes('k25-h') || m.includes('k25_h'))
    assert(k25hMigrations.length === 0, 'no K25-H migrations added')
  }
}

// ─── I. K25-E compatibility ──────────────────────────────────────────────────

function testK25ECompat() {
  console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━')
  console.log('I. K25-E compatibility')
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━')

  const src = fileRead('src/app/api/semesters/route.ts')

  // Basic response shape preserved
  assert(/success:\s*true/.test(src), 'returns success: true')
  assert(/semesters/.test(src), 'returns semesters array')
  assert(/activeSemesterId/.test(src), 'returns activeSemesterId')

  // formatSemesterSummary used
  assert(/formatSemesterSummary/.test(src), 'uses formatSemesterSummary for consistent shape')
}

// ─── J. DB read-only snapshot ────────────────────────────────────────────────

function testDbSnapshot() {
  console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━')
  console.log('J. DB read-only snapshot')
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━')

  assert(fileExists('prisma/dev.db'), 'dev.db exists')

  // Check that the service has dependency counting for all 7 models
  const serviceSrc = fileRead('src/lib/semesters/semester-service.ts')
  const models = ['classGroup', 'teachingTask', 'scheduleSlot', 'scheduleAdjustment', 'schedulingRun', 'schedulingConfig', 'importBatch']
  for (const model of models) {
    assert(new RegExp(`${model}\\.count`).test(serviceSrc), `service counts ${model}`)
  }
}

// ─── Run ─────────────────────────────────────────────────────────────────────

console.log('K25-H SEMESTER SETTINGS API VERIFY')
console.log('===================================')

testRouteExistence()
testMethodSupport()
testPermissions()
testValidation()
testDeleteProtection()
testActivate()
testCreateUpdateActive()
testNonGoals()
testK25ECompat()
testDbSnapshot()

console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━')
console.log(`K25-H SEMESTER SETTINGS API VERIFY ${failed === 0 ? 'PASS' : 'FAIL'}`)
console.log(`PASS=${passed} FAIL=${failed}`)
if (failed > 0) {
  console.log('Failures:')
  for (const f of failures) {
    console.log(`  - ${f}`)
  }
}
console.log('blocking=false')
console.log('recommendedNextStage=K25-I-SEMESTER-SETTINGS-UI-IMPLEMENTATION')
process.exit(failed > 0 ? 1 : 0)
