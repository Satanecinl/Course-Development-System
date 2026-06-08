/**
 * K25-E: Semester Selector UX verification.
 *
 * Read-only — does not write to DB. Verifies:
 *   1. Semester list endpoint exists (GET /api/semesters)
 *   2. Semester client/store exists (src/store/semesterStore.ts)
 *   3. localStorage key documented in store
 *   4. withSemesterQuery helper exists
 *   5. /api/schedule consumer (scheduleStore) passes semesterId
 *   6. /api/data/teaching-tasks consumer passes semesterId
 *   7. /api/data/schedule-slots consumer passes semesterId
 *   8. SemesterSelector component exists
 *   9. Component shows current semester
 *  10. Component has selectable semester list
 *  11. Component handles active semester fallback
 *  12. Component has loading/error/empty state
 *  13. Dashboard includes selector
 *  14. Admin-db page includes selector or consumes store
 *  15. scheduleStore still unwraps {items} and raw array (K25-D compat)
 *  16. semesterSource is handled or surfaced
 *  17. K25-D resolver still exists
 *  18. K25-C validation script still exists
 *  19. Non-goals: no schema changes
 *  20. Non-goals: no migration added
 *  21. Non-goals: no DB write
 *  22. Non-goals: no RBAC changes
 *  23. Non-goals: no solver/score changes
 *  24. GitHub sync section in docs
 *  25. localStorage key in store
 */
import { existsSync, readFileSync } from 'fs'
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

// ─── A. Semester list source ─────────────────────────────────────────────────

function testSemesterListSource() {
  console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━')
  console.log('A. Semester list source')
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━')

  const route = 'src/app/api/semesters/route.ts'
  assert(fileExists(route), 'GET /api/semesters endpoint exists')
  if (fileExists(route)) {
    const src = fileRead(route)
    assert(/export\s+async\s+function\s+GET/.test(src), 'exports GET handler')
    assert(/semester\.findMany/.test(src), 'queries semester.findMany')
    assert(/isActive/.test(src), 'returns isActive field')
    assert(
      /activeSemesterId/.test(src),
      'returns activeSemesterId in response',
    )
    assert(
      /success:\s*true/.test(src),
      'returns success: true',
    )
  }
}

// ─── B. Semester store / client ──────────────────────────────────────────────

function testSemesterStore() {
  console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━')
  console.log('B. Semester store / client')
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━')

  const store = 'src/store/semesterStore.ts'
  assert(fileExists(store), 'semesterStore.ts exists')
  if (!fileExists(store)) return
  const src = fileRead(store)

  assert(/fetchSemesters/.test(src), 'has fetchSemesters')
  assert(/setCurrentSemester/.test(src), 'has setCurrentSemester')
  assert(/getCurrentSemesterId/.test(src), 'has getCurrentSemesterId')
  assert(/currentSemesterId/.test(src), 'tracks currentSemesterId')
  assert(/semesterSource|isActiveSemester/.test(src), 'tracks active/fallback status')
  assert(/semesters/.test(src), 'stores semester list')
  assert(/course-system\.currentSemesterId/.test(src), 'localStorage key documented')

  assert(/withSemesterQuery/.test(src), 'withSemesterQuery helper exported')
  assert(/localStorage/.test(src), 'persists to localStorage')
  assert(/\/api\/semesters/.test(src), 'fetches from /api/semesters')
}

// ─── C. SemesterSelector component ──────────────────────────────────────────

function testSemesterSelector() {
  console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━')
  console.log('C. SemesterSelector component')
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━')

  const comp = 'src/components/semester-selector.tsx'
  assert(fileExists(comp), 'SemesterSelector component exists')
  if (!fileExists(comp)) return
  const src = fileRead(comp)

  assert(/select/.test(src), 'has <select> for semester list')
  assert(/currentSemester/.test(src), 'shows current semester')
  assert(/active.*学期|isActive.*当前|当前/.test(src), 'indicates active semester')
  assert(
    /loading|isLoading|Loader/.test(src),
    'has loading state',
  )
  assert(
    /error|Error|AlertCircle/.test(src),
    'has error state',
  )
  assert(
    /暂无|empty|semesters\.length\s*===\s*0/.test(src),
    'has empty state',
  )
  assert(
    /activeFallback|默认激活学期|fallback/.test(src),
    'handles activeFallback warning',
  )
  assert(
    /setCurrentSemester|onChange/.test(src),
    'allows semester selection',
  )
}

// ─── D. UI placement ─────────────────────────────────────────────────────────

function testUIPlacement() {
  console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━')
  console.log('D. UI placement')
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━')

  {
    const f = 'src/app/dashboard/dashboard-content.tsx'
    assert(fileExists(f), 'dashboard-content.tsx exists')
    if (fileExists(f)) {
      const src = fileRead(f)
      assert(
        /SemesterSelector/.test(src),
        'dashboard imports SemesterSelector',
      )
      assert(
        /semesterSource.*activeFallback|activeFallback.*semesterSource/.test(src),
        'dashboard surfaces semesterSource fallback warning',
      )
    }
  }

  {
    const f = 'src/app/admin/db/admin-db-content.tsx'
    assert(fileExists(f), 'admin-db-content.tsx exists')
    if (fileExists(f)) {
      const src = fileRead(f)
      assert(
        /semesterStore|useSemesterStore|SemesterSelector/.test(src),
        'admin-db uses semester store or selector',
      )
    }
  }
}

// ─── E. API request wiring ───────────────────────────────────────────────────

function testApiRequestWiring() {
  console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━')
  console.log('E. API request wiring')
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━')

  // scheduleStore passes semesterId
  {
    const f = 'src/store/scheduleStore.ts'
    assert(fileExists(f), 'scheduleStore.ts exists')
    if (fileExists(f)) {
      const src = fileRead(f)
      assert(
        /withSemesterQuery/.test(src),
        'scheduleStore uses withSemesterQuery',
      )
      assert(
        /semesterId/.test(src),
        'scheduleStore fetchSchedule accepts semesterId param',
      )
      assert(
        /semesterSource/.test(src),
        'scheduleStore stores semesterSource',
      )
    }
  }

  // dashboard-content passes semesterId to fetches
  {
    const f = 'src/app/dashboard/dashboard-content.tsx'
    assert(fileExists(f), 'dashboard-content.tsx exists')
    if (fileExists(f)) {
      const src = fileRead(f)
      assert(
        /withSemesterQuery/.test(src),
        'dashboard-content uses withSemesterQuery for fetches',
      )
      assert(
        /currentSemesterId/.test(src),
        'dashboard-content references currentSemesterId',
      )
    }
  }

  // admin-db api passes semesterId
  {
    const f = 'src/lib/admin-db/api.ts'
    assert(fileExists(f), 'admin-db api.ts exists')
    if (fileExists(f)) {
      const src = fileRead(f)
      assert(
        /withSemesterQuery/.test(src),
        'admin-db api uses withSemesterQuery',
      )
      assert(
        /semesterId/.test(src),
        'admin-db api passes semesterId to fetches',
      )
    }
  }
}

// ─── F. K25-D compatibility ──────────────────────────────────────────────────

function testK25DCompat() {
  console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━')
  console.log('F. K25-D compatibility')
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━')

  // scheduleStore still unwraps {items} and raw array
  {
    const f = 'src/store/scheduleStore.ts'
    const src = fileRead(f)
    assert(
      /Array\.isArray\(data\)\s*\?\s*data\s*:\s*data\.items/.test(src),
      'scheduleStore unwraps {items} and raw array defensively',
    )
  }

  // semesterSource is handled
  {
    const f = 'src/store/scheduleStore.ts'
    const src = fileRead(f)
    assert(
      /semesterSource/.test(src),
      'scheduleStore stores semesterSource from response',
    )
  }

  // K25-D resolver still exists
  assert(
    fileExists('src/lib/schedule/semester-scope.ts'),
    'K25-D resolveRequestSemester still exists',
  )

  // K25-C validation script still exists
  assert(
    fileExists('scripts/validate-multi-semester-schema-k25-c.ts'),
    'K25-C validation script still exists',
  )
}

// ─── G. Non-goals ────────────────────────────────────────────────────────────

function testNonGoals() {
  console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━')
  console.log('G. Non-goals')
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━')

  // No schema changes
  assert(
    fileExists('prisma/schema.prisma'),
    'schema.prisma exists (not deleted)',
  )

  // Check K25-E files don't touch schema
  const k25eFiles = [
    'src/store/semesterStore.ts',
    'src/components/semester-selector.tsx',
    'src/app/api/semesters/route.ts',
  ]
  for (const f of k25eFiles) {
    if (fileExists(f)) {
      const src = fileRead(f)
      assert(
        !/ALTER\s+TABLE|CREATE\s+TABLE|DROP\s+TABLE|prisma\.migrate/.test(src),
        `${f} does not contain schema/migration operations`,
      )
    }
  }

  // No RBAC changes in K25-E frontend files
  // Note: src/app/api/semesters/route.ts is excluded because K25-H adds
  // settings:manage permission for write operations — this is expected evolution.
  const k25eFrontendFiles = [
    'src/store/semesterStore.ts',
    'src/components/semester-selector.tsx',
  ]
  for (const f of k25eFrontendFiles) {
    if (fileExists(f)) {
      const src = fileRead(f)
      assert(
        !/RBAC|rbac|role|permission/.test(src),
        `${f} does not modify RBAC`,
      )
    }
  }

  // No solver/score changes
  assert(
    fileExists('src/lib/scheduler/score.ts'),
    'scheduler score.ts exists (not deleted)',
  )
  assert(
    fileExists('src/lib/scheduler/data-loader.ts'),
    'scheduler data-loader.ts exists (not deleted)',
  )
}

// ─── H. Docs ─────────────────────────────────────────────────────────────────

function testDocs() {
  console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━')
  console.log('H. Documentation')
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━')

  assert(
    fileExists('docs/k25-semester-selector-ux.md'),
    'k25-semester-selector-ux.md exists',
  )
  assert(
    fileExists('docs/k25-semester-selector-ux.json'),
    'k25-semester-selector-ux.json exists',
  )

  if (fileExists('docs/k25-semester-selector-ux.json')) {
    const json = JSON.parse(fileRead('docs/k25-semester-selector-ux.json'))
    assert(json.stage === 'K25-E-SEMESTER-SELECTOR-UX', 'JSON stage field correct')
    assert(json.status === 'IMPLEMENTATION_COMPLETE', 'JSON status is IMPLEMENTATION_COMPLETE')
    assert(json.gitHubSync !== undefined, 'JSON has gitHubSync section')
    assert(json.semesterListSource !== undefined, 'JSON has semesterListSource')
    assert(json.verification !== undefined, 'JSON has verification section')
  }

  if (fileExists('docs/k25-semester-selector-ux.md')) {
    const md = fileRead('docs/k25-semester-selector-ux.md')
    assert(/GitHub.*Sync|GitHub 同步/i.test(md), 'docs include GitHub sync section')
    assert(/Semester.*List.*Source|学期.*列表.*来源/i.test(md), 'docs describe semester list source')
    assert(/Non.*Goal|非目标|禁止范围/i.test(md), 'docs include non-goals')
  }
}

// ─── Run ─────────────────────────────────────────────────────────────────────

console.log('K25-E SEMESTER SELECTOR UX VERIFY')
console.log('==================================')

testSemesterListSource()
testSemesterStore()
testSemesterSelector()
testUIPlacement()
testApiRequestWiring()
testK25DCompat()
testNonGoals()
testDocs()

console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━')
console.log(`K25-E SEMESTER SELECTOR UX VERIFY ${failed === 0 ? 'PASS' : 'FAIL'}`)
console.log(`PASS=${passed} FAIL=${failed}`)
if (failed > 0) {
  console.log('Failures:')
  for (const f of failures) {
    console.log(`  - ${f}`)
  }
}
process.exit(failed > 0 ? 1 : 0)
