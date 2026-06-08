/**
 * K25-J: Semester settings E2E manual trial readiness check.
 *
 * Read-only — does not write to DB. Verifies:
 *   1. UI components exist
 *   2. API routes exist
 *   3. Permission guards in place
 *   4. Existing regression scripts exist
 *   5. DB read-only safety
 *   6. Manual checklist docs exist
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

// ─── A. UI / files ───────────────────────────────────────────────────────────

function testUIFiles() {
  console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━')
  console.log('A. UI / files')
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━')

  assert(fileExists('src/app/admin/settings/page.tsx'), 'settings page exists')
  assert(fileExists('src/components/settings/semester-settings-panel.tsx'), 'SemesterSettingsPanel exists')
  assert(fileExists('src/components/settings/semester-form-dialog.tsx'), 'SemesterFormDialog exists')
  assert(fileExists('src/components/settings/semester-delete-dialog.tsx'), 'SemesterDeleteDialog exists')
  assert(fileExists('src/components/settings/semester-activate-dialog.tsx'), 'SemesterActivateDialog exists')
  assert(fileExists('src/lib/semesters/semester-settings-client.ts'), 'semester-settings-client exists')

  // Page no longer placeholder
  {
    const src = fileRead('src/app/admin/settings/page.tsx')
    assert(!/功能建设中/.test(src), 'page is no longer placeholder')
    assert(/SemesterSettingsPanel/.test(src), 'page uses SemesterSettingsPanel')
  }

  // Panel markers
  {
    const src = fileRead('src/components/settings/semester-settings-panel.tsx')
    assert(/当前学期|activeSemester/.test(src), 'current semester card marker')
    assert(/<table|semester.*list|学期列表/.test(src), 'semester list marker')
    assert(/新增学期|handleCreateClick/.test(src), 'create button marker')
    assert(/handleEditClick|Pencil/.test(src), 'edit button marker')
    assert(/handleActivateClick|设为当前/.test(src), 'activate button marker')
    assert(/handleDeleteClick|delete|删除/.test(src), 'delete button marker')
    assert(/canDelete|deleteBlockers/.test(src), 'deleteBlockers / dependency counts marker')
    assert(/loading|Loader2/.test(src), 'loading state marker')
    assert(/error|AlertCircle/.test(src), 'error state marker')
  }
}

// ─── B. API / backend readiness ──────────────────────────────────────────────

function testAPIReadiness() {
  console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━')
  console.log('B. API / backend readiness')
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━')

  // GET /api/semesters with includeCounts
  {
    const src = fileRead('src/app/api/semesters/route.ts')
    assert(/includeCounts/.test(src), 'GET /api/semesters?includeCounts=true exists')
    assert(/export\s+async\s+function\s+POST/.test(src), 'POST /api/semesters exists')
  }

  // PUT/DELETE /api/semesters/[id]
  {
    assert(fileExists('src/app/api/semesters/[id]/route.ts'), 'PUT/DELETE /api/semesters/[id] exists')
    const src = fileRead('src/app/api/semesters/[id]/route.ts')
    assert(/export\s+async\s+function\s+PUT/.test(src), 'PUT handler exists')
    assert(/export\s+async\s+function\s+DELETE/.test(src), 'DELETE handler exists')
  }

  // POST /api/semesters/[id]/activate
  {
    assert(fileExists('src/app/api/semesters/[id]/activate/route.ts'), 'POST /api/semesters/[id]/activate exists')
  }

  // GET /api/semesters/[id]/dependencies
  {
    assert(fileExists('src/app/api/semesters/[id]/dependencies/route.ts'), 'GET /api/semesters/[id]/dependencies exists')
  }

  // settings:manage guard
  {
    const src = fileRead('src/app/api/semesters/route.ts')
    assert(/settings:manage/.test(src), 'settings:manage guard exists for write routes')
  }

  // Delete protection — 7 dependency models
  {
    const src = fileRead('src/lib/semesters/semester-service.ts')
    assert(/classGroup\.count/.test(src), 'ClassGroup dependency check')
    assert(/teachingTask\.count/.test(src), 'TeachingTask dependency check')
    assert(/scheduleSlot\.count/.test(src), 'ScheduleSlot dependency check')
    assert(/scheduleAdjustment\.count/.test(src), 'ScheduleAdjustment dependency check')
    assert(/schedulingRun\.count/.test(src), 'SchedulingRun dependency check')
    assert(/schedulingConfig\.count/.test(src), 'SchedulingConfig dependency check')
    assert(/importBatch\.count/.test(src), 'ImportBatch dependency check')
  }

  // Activate transaction
  {
    const src = fileRead('src/lib/semesters/semester-service.ts')
    assert(/\$transaction/.test(src), 'activate uses transaction')
  }
}

// ─── C. Existing regression scripts ──────────────────────────────────────────

function testRegressionScripts() {
  console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━')
  console.log('C. Existing regression scripts')
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━')

  assert(fileExists('scripts/verify-semester-settings-ui-k25-i.ts'), 'K25-I verify script exists')
  assert(fileExists('scripts/verify-semester-settings-api-k25-h.ts'), 'K25-H verify script exists')
  assert(fileExists('scripts/verify-semester-selector-ux-k25-e.ts'), 'K25-E verify script exists')
  assert(fileExists('scripts/validate-multi-semester-schema-k25-c.ts'), 'K25-C validation script exists')
}

// ─── D. DB read-only safety ──────────────────────────────────────────────────

function testDBSafety() {
  console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━')
  console.log('D. DB read-only safety')
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━')

  assert(fileExists('prisma/dev.db'), 'dev.db exists')

  // Check schema for semester model
  const schema = fileRead('prisma/schema.prisma')
  assert(/model\s+Semester\s*\{/.test(schema), 'Semester model exists in schema')

  // Check service has dependency counting
  const serviceSrc = fileRead('src/lib/semesters/semester-service.ts')
  assert(/getSemesterDependencies/.test(serviceSrc), 'dependency counting function exists')
  assert(/getSemesterDeleteStatus/.test(serviceSrc), 'delete status function exists')
}

// ─── E. Manual checklist docs ────────────────────────────────────────────────

function testManualDocs() {
  console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━')
  console.log('E. Manual checklist docs')
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━')

  assert(fileExists('docs/k25-semester-settings-e2e-manual-trial.md'), 'K25-J manual trial doc exists')
  assert(fileExists('docs/k25-semester-settings-e2e-manual-trial.json'), 'K25-J JSON exists')

  if (fileExists('docs/k25-semester-settings-e2e-manual-trial.md')) {
    const md = fileRead('docs/k25-semester-settings-e2e-manual-trial.md')
    assert(/Case.*A|open.*settings|打开.*设置/i.test(md), 'checklist includes open settings case')
    assert(/create|新增/i.test(md), 'checklist includes create case')
    assert(/edit|编辑/i.test(md), 'checklist includes edit case')
    assert(/activate|设为当前/i.test(md), 'checklist includes activate case')
    assert(/delete.*empty|删除.*空/i.test(md), 'checklist includes delete empty case')
    assert(/block.*delete.*populated|阻止.*删除.*数据/i.test(md), 'checklist includes block delete populated case')
    assert(/block.*delete.*active|阻止.*删除.*active/i.test(md), 'checklist includes block delete active case')
    assert(/GitHub.*sync|GitHub 同步/i.test(md), 'checklist includes GitHub sync')
    assert(/screenshot|截图|observation|观察/i.test(md), 'checklist includes screenshot/observation fields')
    assert(/PASS.*FAIL|decision.*rule|决策规则/i.test(md), 'checklist includes pass/fail decision rule')
  }

  if (fileExists('docs/k25-semester-settings-e2e-manual-trial.json')) {
    const json = JSON.parse(fileRead('docs/k25-semester-settings-e2e-manual-trial.json'))
    assert(json.stage === 'K25-J-SEMESTER-SETTINGS-E2E-MANUAL-TRIAL', 'JSON stage correct')
    assert(json.status === 'MANUAL_TRIAL_READY' || json.status === 'MANUAL_TRIAL_PASSED', 'JSON status is READY or PASSED')
    assert(json.manualTrial?.cases?.length > 0, 'JSON has manual trial cases')
  }
}

// ─── Run ─────────────────────────────────────────────────────────────────────

console.log('K25-J SEMESTER SETTINGS MANUAL TRIAL READINESS')
console.log('===============================================')

testUIFiles()
testAPIReadiness()
testRegressionScripts()
testDBSafety()
testManualDocs()

console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━')
console.log(`K25-J SEMESTER SETTINGS MANUAL TRIAL READINESS ${failed === 0 ? 'PASS' : 'FAIL'}`)
console.log(`PASS=${passed} FAIL=${failed}`)
if (failed > 0) {
  console.log('Failures:')
  for (const f of failures) {
    console.log(`  - ${f}`)
  }
}
console.log('blocking=false')
process.exit(failed > 0 ? 1 : 0)
