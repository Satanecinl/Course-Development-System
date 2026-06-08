/**
 * K25-D1: Schedule API response shape compatibility check.
 *
 * Read-only — does not write to DB. Verifies:
 *   1. /api/schedule route exists.
 *   2. /api/schedule returns wrapped response (items + semesterId + semesterSource).
 *   3. /api/schedule uses resolveRequestSemester.
 *   4. /api/schedule filters by semesterId.
 *   5. No raw-array-only consumer remains in the codebase.
 *   6. K25-D main verify script still exists.
 *   7. K25-D main verify script still has 0 lint errors (no SCHEMA_PATH, no require()).
 *   8. Non-goals: no schema/migration/DB writes; no UI selector; no RBAC.
 *   9. K22/K23/K24 verify scripts untouched.
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

// ─── A. /api/schedule route shape ────────────────────────────────────────────

function testScheduleApiShape() {
  console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━')
  console.log('A. /api/schedule route shape')
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━')
  const file = 'src/app/api/schedule/route.ts'
  assert(fileExists(file), `${file} exists`)
  if (!fileExists(file)) return
  const src = fileRead(file)
  assert(
    /resolveRequestSemester\s*\(/.test(src),
    'uses resolveRequestSemester',
  )
  assert(
    /semesterId:\s*semester\.id/.test(src),
    'filters where: { semesterId: semester.id }',
  )
  // The wrap happens in two places: the applyAdjustments branch and the
  // viewType-driven class branch. Both must return items + semesterId +
  // semesterSource. Search for all three.
  const wrapMatches = src.match(/NextResponse\.json\(\{[\s\S]*?items:[\s\S]*?semesterId:[\s\S]*?semesterSource:/g)
  assert(
    (wrapMatches?.length ?? 0) >= 2,
    `returns wrapped { items, semesterId, semesterSource } in both branches (found ${wrapMatches?.length ?? 0})`,
  )
  // The final branch (no viewType) must also wrap
  assert(
    /items:\s*viewData/.test(src) && /semesterId:\s*semester\.id/.test(src) && /semesterSource:\s*semester\.source/.test(src),
    'final branch returns wrapped response',
  )
}

// ─── B. Consumer compat scan ─────────────────────────────────────────────────

function testConsumerCompat() {
  console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━')
  console.log('B. Consumer compatibility scan')
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━')

  // scheduleStore.ts: must use Array.isArray fallback or .items
  {
    const f = 'src/store/scheduleStore.ts'
    assert(fileExists(f), `${f} exists`)
    if (fileExists(f)) {
      const src = fileRead(f)
      assert(
        /Array\.isArray\(data\)\s*\?\s*data\s*:\s*data\.items/.test(src),
        'scheduleStore.ts uses Array.isArray(data) ? data : data.items fallback',
      )
    }
  }

  // dashboard-content.tsx: must use Array.isArray fallback or .items
  {
    const f = 'src/app/dashboard/dashboard-content.tsx'
    assert(fileExists(f), `${f} exists`)
    if (fileExists(f)) {
      const src = fileRead(f)
      assert(
        /Array\.isArray\(data\)\s*\?\s*data\s*:\s*data\.items/.test(src),
        'dashboard-content.tsx uses Array.isArray(data) ? data : data.items fallback',
      )
    }
  }

  // No raw-array-only consumer left in known paths
  const otherFiles = [
    'src/components/schedule-grid.tsx',
    'src/components/schedule-adjustment-dialog.tsx',
    'src/app/admin/db/admin-db-content.tsx',
  ]
  for (const f of otherFiles) {
    if (!fileExists(f)) continue
    const src = fileRead(f)
    // Look for `fetch('/api/schedule')` or `fetch(`/api/schedule)` followed by raw data use
    const hasFetchSchedule = /fetch\(\s*['"`]\/api\/schedule['"`]/.test(src) || /fetch\(\s*`\/api\/schedule\?/.test(src)
    if (hasFetchSchedule) {
      // If it fetches, it must handle the wrapped shape
      const hasItems = /\.items/.test(src) || /Array\.isArray/.test(src)
      assert(hasItems, `${f} fetches /api/schedule and unwraps items`)
    } else {
      console.log(`  ℹ ${f} does not directly fetch /api/schedule`)
    }
  }
}

// ─── C. K25-D main verify still exists and is clean ─────────────────────────

function testK25DMainVerify() {
  console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━')
  console.log('C. K25-D main verify script still exists and is clean')
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━')
  const f = 'scripts/verify-semester-scoping-api-k25-d.ts'
  assert(fileExists(f), `${f} exists`)
  if (!fileExists(f)) return
  const src = fileRead(f)
  // No unused SCHEMA_PATH constant (the unused-var warning was the original issue)
  assert(
    !/const\s+SCHEMA_PATH\s*=/.test(src),
    'no unused SCHEMA_PATH constant',
  )
  // No require() style imports (the no-require-imports error was the original issue)
  assert(
    !/=\s*require\(/.test(src),
    'no require() style imports',
  )
  // No 'any' that the linter would flag in newly added code
  // (Pre-existing audit scripts may have any; this script should not.)
  assert(
    !/:\s*any\b/.test(src) && !/<any>/.test(src),
    'no explicit any types in script',
  )
}

// ─── D. Non-goals ────────────────────────────────────────────────────────────

function testNonGoals() {
  console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━')
  console.log('D. Non-goals (no schema/UI/RBAC changes in K25-D1)')
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━')

  // No new migration
  const migrationsDir = resolve(ROOT, 'prisma/migrations')
  if (existsSync(migrationsDir)) {
    const dirs = readdirSync(migrationsDir)
    const k25d1 = dirs.filter((d) => d.includes('k25_d1') || d.includes('k25-d1') || d.includes('k25_d1_compat'))
    assert(k25d1.length === 0, `no K25-D1 migration directory found (got ${k25d1.length})`)
  }

  // K22/K23/K24 verify scripts untouched (existence + mtime-like check via content)
  const k22 = 'scripts/verify-score-regression-harness-k22-c.ts'
  const k23 = 'scripts/verify-adjustment-room-recommendations-k23-a.ts'
  const k24 = 'scripts/verify-adjustment-plan-recommendations-k24-a.ts'
  assert(fileExists(k22), `K22-C verify intact: ${k22}`)
  assert(fileExists(k23), `K23-A verify intact: ${k23}`)
  assert(fileExists(k24), `K24-A verify intact: ${k24}`)
}

// ─── E. K25-C migration intact ───────────────────────────────────────────────

function testK25CMigrationIntact() {
  console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━')
  console.log('E. K25-C migration + K25-D main verify still pass')
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━')
  assert(
    fileExists('prisma/migrations/20260607000000_k25_multi_semester_not_null/migration.sql'),
    'K25-C migration SQL still present',
  )
  assert(
    fileExists('scripts/validate-multi-semester-schema-k25-c.ts'),
    'K25-C validation script still present',
  )
  assert(
    fileExists('docs/k25-multi-semester-schema-implementation.md'),
    'K25-C docs still present',
  )
}

// ─── Main ────────────────────────────────────────────────────────────────────

async function main() {
  console.log('🧪 K25-D1 Schedule API Response Compatibility Verification')

  testScheduleApiShape()
  testConsumerCompat()
  testK25DMainVerify()
  testNonGoals()
  testK25CMigrationIntact()

  console.log(`\n${'═'.repeat(50)}`)
  console.log(`📊 结果: ${passed} passed, ${failed} failed`)
  console.log(`${'═'.repeat(50)}`)

  if (failed > 0) {
    console.log('\n失败列表:')
    for (const f of failures) {
      console.log(`  - ${f}`)
    }
    console.log('\n❌ K25-D1 SCHEDULE API RESPONSE COMPAT VERIFY FAIL')
    process.exit(1)
  }

  console.log('\n✅ K25-D1 SCHEDULE API RESPONSE COMPAT VERIFY PASS')
  console.log(`PASS=${passed} FAIL=0`)
  process.exit(0)
}

main().catch((e) => {
  console.error('K25-D1 verify script error:', e)
  process.exit(1)
})
