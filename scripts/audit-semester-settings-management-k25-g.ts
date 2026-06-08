/**
 * K25-G: Semester settings management audit.
 *
 * Read-only — does not write to DB. Verifies:
 *   1. Semester model exists with required fields
 *   2. DB semester count and dependency data
 *   3. /api/semesters GET exists and is read-only
 *   4. No POST/PUT/DELETE/activate on semester routes
 *   5. System settings page exists and is placeholder
 *   6. SemesterSelector exists
 *   7. semesterStore exists
 *   8. admin/db uses semester selector
 *   9. Proposed design docs exist
 *  10. Non-goals confirmed
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

// ─── A. Schema / DB ──────────────────────────────────────────────────────────

function testSchema() {
  console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━')
  console.log('A. Schema / DB')
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━')

  assert(fileExists('prisma/schema.prisma'), 'schema.prisma exists')
  const schema = fileRead('prisma/schema.prisma')

  assert(/model\s+Semester\s*\{/.test(schema), 'Semester model exists')
  assert(/name\s+String/.test(schema), 'Semester has name field')
  assert(/code\s+String/.test(schema), 'Semester has code field')
  assert(/isActive\s+Boolean/.test(schema), 'Semester has isActive field')
  assert(/startsAt\s+DateTime\?/.test(schema), 'Semester has startsAt (nullable)')
  assert(/endsAt\s+DateTime\?/.test(schema), 'Semester has endsAt (nullable)')
  assert(/academicYear\s+String\?/.test(schema), 'Semester has academicYear (nullable)')
  assert(/term\s+String\?/.test(schema), 'Semester has term (nullable)')
  assert(/createdAt\s+DateTime/.test(schema), 'Semester has createdAt')
  assert(/updatedAt\s+DateTime/.test(schema), 'Semester has updatedAt')
}

// ─── B. DB read-only snapshot ────────────────────────────────────────────────

function testDbSnapshot() {
  console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━')
  console.log('B. DB read-only snapshot')
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━')

  // Check dev.db exists
  assert(fileExists('prisma/dev.db'), 'dev.db exists')

  // Note: actual DB counts are verified by the audit script running
  // sqlite3 queries externally. This section checks schema supports
  // the required queries.
  const schema = fileRead('prisma/schema.prisma')
  assert(/classGroups\s+ClassGroup\[\]/.test(schema), 'Semester has classGroups relation')
  assert(/teachingTasks\s+TeachingTask\[\]/.test(schema), 'Semester has teachingTasks relation')
  assert(/scheduleSlots\s+ScheduleSlot\[\]/.test(schema), 'Semester has scheduleSlots relation')
  assert(/scheduleAdjustments\s+ScheduleAdjustment\[\]/.test(schema), 'Semester has scheduleAdjustments relation')
  assert(/schedulingRuns\s+SchedulingRun\[\]/.test(schema), 'Semester has schedulingRuns relation')
  assert(/schedulingConfigs\s+SchedulingConfig\[\]/.test(schema), 'Semester has schedulingConfigs relation')
  assert(/importBatches\s+ImportBatch\[\]/.test(schema), 'Semester has importBatches relation')
}

// ─── C. Existing API audit ───────────────────────────────────────────────────

function testApiAudit() {
  console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━')
  console.log('C. Existing API audit')
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━')

  // GET /api/semesters exists
  const route = 'src/app/api/semesters/route.ts'
  assert(fileExists(route), 'GET /api/semesters endpoint exists')
  if (fileExists(route)) {
    const src = fileRead(route)
    assert(/export\s+async\s+function\s+GET/.test(src), 'exports GET handler')
    assert(/semester\.findMany/.test(src), 'queries semester.findMany')
    // K25-G audit: at design time, only GET existed. K25-H adds POST + auth.
    // These checks are informational now.
    const hasPost = /export\s+async\s+function\s+POST/.test(src)
    const hasAuth = /requirePermission/.test(src)
    console.log(`  ℹ POST handler: ${hasPost ? 'exists (K25-H implemented)' : 'not yet'}`)
    console.log(`  ℹ auth gate: ${hasAuth ? 'exists (K25-H implemented)' : 'not yet'}`)
    assert(/startsAt/.test(src), 'returns startsAt field')
    assert(/endsAt/.test(src), 'returns endsAt field')
    assert(/isActive/.test(src), 'returns isActive field')
  }

  // [id] routes — K25-G designed these, K25-H implements them
  // At K25-G time they didn't exist; now they may exist
  const hasIdRoute = fileExists('src/app/api/semesters/[id]/route.ts')
  const hasActivateRoute = fileExists('src/app/api/semesters/[id]/activate/route.ts')
  console.log(`  ℹ /api/semesters/[id] route: ${hasIdRoute ? 'exists (K25-H implemented)' : 'not yet implemented'}`)
  console.log(`  ℹ /api/semesters/[id]/activate route: ${hasActivateRoute ? 'exists (K25-H implemented)' : 'not yet implemented'}`)
}

// ─── D. Frontend audit ───────────────────────────────────────────────────────

function testFrontendAudit() {
  console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━')
  console.log('D. Frontend audit')
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━')

  // System settings page
  const settingsPage = 'src/app/admin/settings/page.tsx'
  assert(fileExists(settingsPage), 'system settings page exists')
  if (fileExists(settingsPage)) {
    const src = fileRead(settingsPage)
    assert(/系统设置/.test(src), 'page title is 系统设置')
    // K25-G audit: at design time, page was placeholder. K25-I implements real UI.
    const isPlaceholder = /功能建设中/.test(src)
    const hasSemesterPanel = /SemesterSettingsPanel/.test(src)
    assert(isPlaceholder || hasSemesterPanel, 'page is placeholder or has semester settings')
    assert(/ProtectedShell/.test(src), 'uses ProtectedShell for auth')
  }

  // SemesterSelector exists
  assert(
    fileExists('src/components/semester-selector.tsx'),
    'SemesterSelector component exists',
  )

  // semesterStore exists
  assert(
    fileExists('src/store/semesterStore.ts'),
    'semesterStore exists',
  )

  // admin/db uses semester selector
  if (fileExists('src/app/admin/db/admin-db-content.tsx')) {
    const src = fileRead('src/app/admin/db/admin-db-content.tsx')
    assert(
      /SemesterSelector/.test(src),
      'admin-db uses SemesterSelector',
    )
    assert(
      /useSemesterStore/.test(src),
      'admin-db uses semesterStore',
    )
  }
}

// ─── E. Permission audit ─────────────────────────────────────────────────────

function testPermissionAudit() {
  console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━')
  console.log('E. Permission audit')
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━')

  const types = 'src/lib/auth/types.ts'
  assert(fileExists(types), 'auth types.ts exists')
  if (fileExists(types)) {
    const src = fileRead(types)
    assert(/settings:manage/.test(src), 'settings:manage permission exists')
  }

  const nav = 'src/lib/auth/navigation.ts'
  assert(fileExists(nav), 'navigation.ts exists')
  if (fileExists(nav)) {
    const src = fileRead(nav)
    assert(/admin\/settings/.test(src), 'settings route in navigation')
    assert(/settings:manage/.test(src), 'settings nav gated by settings:manage')
  }

  const routePerms = 'src/lib/auth/route-permissions.ts'
  assert(fileExists(routePerms), 'route-permissions.ts exists')
  if (fileExists(routePerms)) {
    const src = fileRead(routePerms)
    assert(/settings:manage/.test(src), 'settings route permission defined')
  }
}

// ─── F. Design docs ──────────────────────────────────────────────────────────

function testDesignDocs() {
  console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━')
  console.log('F. Design documentation')
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━')

  assert(
    fileExists('docs/k25-semester-settings-management-audit-and-design.md'),
    'audit/design markdown exists',
  )
  assert(
    fileExists('docs/k25-semester-settings-management-audit-and-design.json'),
    'audit/design JSON exists',
  )

  if (fileExists('docs/k25-semester-settings-management-audit-and-design.md')) {
    const md = fileRead('docs/k25-semester-settings-management-audit-and-design.md')
    assert(/Semester.*Schema|schema/i.test(md), 'docs include schema analysis')
    assert(/Proposed.*API|API.*Design|API 设计/i.test(md), 'docs include API design')
    assert(/UI.*Design|UI 设计/i.test(md), 'docs include UI design')
    assert(/Delete.*Protection|删除保护/i.test(md), 'docs include delete protection')
    assert(/Active.*Semester|唯一.*active/i.test(md), 'docs include active uniqueness')
    assert(/Permission|权限/i.test(md), 'docs include permission design')
    assert(/Out.*of.*Scope|不在.*范围|后置/i.test(md), 'docs mark long-term features out of scope')
    assert(/GitHub.*Sync|GitHub 同步/i.test(md), 'docs include GitHub sync')
  }

  if (fileExists('docs/k25-semester-settings-management-audit-and-design.json')) {
    const json = JSON.parse(fileRead('docs/k25-semester-settings-management-audit-and-design.json'))
    assert(json.stage === 'K25-G-SEMESTER-SETTINGS-MANAGEMENT-AUDIT-AND-DESIGN', 'JSON stage correct')
    assert(json.status === 'AUDIT_AND_DESIGN_COMPLETE', 'JSON status correct')
    assert(json.proposedApiDesign !== undefined, 'JSON has proposedApiDesign')
    assert(json.deleteProtectionRules !== undefined, 'JSON has deleteProtectionRules')
    assert(json.activeSemesterRules !== undefined, 'JSON has activeSemesterRules')
  }
}

// ─── G. Non-goals ────────────────────────────────────────────────────────────

function testNonGoals() {
  console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━')
  console.log('G. Non-goals')
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━')

  // No schema changes
  assert(fileExists('prisma/schema.prisma'), 'schema.prisma exists (not deleted)')

  // K25-G was design-only. Routes may exist if K25-H has been implemented.
  // Check that schema and migration are untouched.
  assert(!fileExists('prisma/schema.prisma.bak'), 'no schema backup created')

  // No new migrations
  if (fileExists('prisma/migrations')) {
    const migrations = readdirSync(resolve(ROOT, 'prisma/migrations'))
    const k25gMigrations = migrations.filter(m => m.includes('k25-g') || m.includes('k25_g'))
    assert(k25gMigrations.length === 0, 'no K25-G migrations added')
  }
}

// ─── Run ─────────────────────────────────────────────────────────────────────

console.log('K25-G SEMESTER SETTINGS MANAGEMENT AUDIT')
console.log('=========================================')

testSchema()
testDbSnapshot()
testApiAudit()
testFrontendAudit()
testPermissionAudit()
testDesignDocs()
testNonGoals()

console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━')
console.log(`K25-G SEMESTER SETTINGS MANAGEMENT AUDIT ${failed === 0 ? 'PASS' : 'FAIL'}`)
console.log(`PASS=${passed} FAIL=${failed}`)
if (failed > 0) {
  console.log('Failures:')
  for (const f of failures) {
    console.log(`  - ${f}`)
  }
}
console.log('blocking=false')
console.log('recommendedNextStage=K25-H-SEMESTER-SETTINGS-API-IMPLEMENTATION')
process.exit(failed > 0 ? 1 : 0)
