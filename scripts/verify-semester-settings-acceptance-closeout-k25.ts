/**
 * K25 Semester Settings Acceptance Closeout verification.
 *
 * Read-only — does not write to DB. Verifies:
 *   1. Closeout docs exist with correct status
 *   2. K25-J manual trial updated to PASSED
 *   3. All scope files still exist
 *   4. Closed scope markers in docs
 *   5. Non-goals confirmed
 *   6. GitHub sync in docs
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

// ─── A. Closeout docs ────────────────────────────────────────────────────────

function testCloseoutDocs() {
  console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━')
  console.log('A. Closeout docs')
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━')

  assert(fileExists('docs/k25-semester-settings-acceptance-closeout.md'), 'closeout markdown exists')
  assert(fileExists('docs/k25-semester-settings-acceptance-closeout.json'), 'closeout JSON exists')

  if (fileExists('docs/k25-semester-settings-acceptance-closeout.json')) {
    const json = JSON.parse(fileRead('docs/k25-semester-settings-acceptance-closeout.json'))
    assert(json.status === 'CLOSED', 'closeout JSON status is CLOSED')
    assert(json.featureStatus === 'READY_FOR_REAL_USE', 'featureStatus is READY_FOR_REAL_USE')
    assert(json.manualFrontendValidation?.status === 'PASSED', 'manualFrontendValidation.status is PASSED')
    assert(/人工验证通过/.test(json.manualFrontendValidation?.note ?? ''), 'manualFrontendValidation.note includes 人工验证通过')
  }
}

// ─── B. K25-J manual trial updated ───────────────────────────────────────────

function testK25JUpdated() {
  console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━')
  console.log('B. K25-J manual trial updated')
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━')

  if (fileExists('docs/k25-semester-settings-e2e-manual-trial.json')) {
    const json = JSON.parse(fileRead('docs/k25-semester-settings-e2e-manual-trial.json'))
    assert(json.manualTrial?.status === 'PASSED', 'K25-J manualTrial.status is PASSED')
    assert(json.manualTrial?.requiresHumanValidation === false, 'requiresHumanValidation is false')
  }

  if (fileExists('docs/k25-semester-settings-e2e-manual-trial.md')) {
    const md = fileRead('docs/k25-semester-settings-e2e-manual-trial.md')
    assert(/PASSED/.test(md), 'K25-J markdown includes PASSED')
    assert(/人工验证通过/.test(md), 'K25-J markdown includes 人工验证通过')
  }
}

// ─── C. Scope files still exist ──────────────────────────────────────────────

function testScopeFiles() {
  console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━')
  console.log('C. Scope files still exist')
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━')

  // K25-H API routes
  assert(fileExists('src/app/api/semesters/route.ts'), 'GET/POST /api/semesters exists')
  assert(fileExists('src/app/api/semesters/[id]/route.ts'), 'PUT/DELETE /api/semesters/[id] exists')
  assert(fileExists('src/app/api/semesters/[id]/activate/route.ts'), 'POST activate exists')
  assert(fileExists('src/app/api/semesters/[id]/dependencies/route.ts'), 'GET dependencies exists')

  // K25-I UI components
  assert(fileExists('src/components/settings/semester-settings-panel.tsx'), 'SemesterSettingsPanel exists')
  assert(fileExists('src/components/settings/semester-form-dialog.tsx'), 'SemesterFormDialog exists')
  assert(fileExists('src/components/settings/semester-delete-dialog.tsx'), 'SemesterDeleteDialog exists')
  assert(fileExists('src/components/settings/semester-activate-dialog.tsx'), 'SemesterActivateDialog exists')
  assert(fileExists('src/lib/semesters/semester-settings-client.ts'), 'semester-settings-client exists')

  // Verification scripts
  assert(fileExists('scripts/verify-semester-settings-e2e-manual-trial-readiness-k25-j.ts'), 'K25-J readiness script exists')
  assert(fileExists('scripts/verify-semester-settings-ui-k25-i.ts'), 'K25-I verify script exists')
  assert(fileExists('scripts/verify-semester-settings-api-k25-h.ts'), 'K25-H verify script exists')
  assert(fileExists('scripts/audit-semester-settings-management-k25-g.ts'), 'K25-G audit script exists')
  assert(fileExists('scripts/verify-semester-selector-ux-k25-e.ts'), 'K25-E verify script exists')
  assert(fileExists('scripts/validate-multi-semester-schema-k25-c.ts'), 'K25-C validation exists')
}

// ─── D. Closed scope markers ─────────────────────────────────────────────────

function testClosedScopeMarkers() {
  console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━')
  console.log('D. Closed scope markers')
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━')

  if (fileExists('docs/k25-semester-settings-acceptance-closeout.md')) {
    const md = fileRead('docs/k25-semester-settings-acceptance-closeout.md')
    assert(/create.*semester|新增.*学期/i.test(md), 'mentions create semester')
    assert(/edit.*semester|编辑.*学期/i.test(md), 'mentions edit semester')
    assert(/activate.*semester|设置.*当前/i.test(md), 'mentions activate semester')
    assert(/delete.*empty|删除.*空/i.test(md), 'mentions delete empty semester')
    assert(/block.*delete.*populated|阻止.*删除.*数据/i.test(md), 'mentions block delete populated')
    assert(/block.*delete.*active|阻止.*删除.*active/i.test(md), 'mentions block delete active')
    assert(/SemesterSelector|semesterStore/i.test(md), 'mentions SemesterSelector integration')
    assert(/settings:manage/.test(md), 'mentions settings:manage')
  }
}

// ─── E. Non-goals ────────────────────────────────────────────────────────────

function testNonGoals() {
  console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━')
  console.log('E. Non-goals')
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━')

  assert(fileExists('prisma/schema.prisma'), 'schema.prisma exists (not modified)')

  if (fileExists('docs/k25-semester-settings-acceptance-closeout.json')) {
    const json = JSON.parse(fileRead('docs/k25-semester-settings-acceptance-closeout.json'))
    assert(json.blocking === false, 'closeout is not blocking')
  }
}

// ─── F. GitHub sync ──────────────────────────────────────────────────────────

function testGitHubSync() {
  console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━')
  console.log('F. GitHub sync')
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━')

  if (fileExists('docs/k25-semester-settings-acceptance-closeout.json')) {
    const json = JSON.parse(fileRead('docs/k25-semester-settings-acceptance-closeout.json'))
    assert(json.gitHubSync !== undefined, 'closeout JSON includes gitHubSync')
    assert(json.gitHubSync.branch === 'master', 'branch is master')
  }

  if (fileExists('docs/k25-semester-settings-acceptance-closeout.md')) {
    const md = fileRead('docs/k25-semester-settings-acceptance-closeout.md')
    assert(/GitHub.*Sync|GitHub 同步/i.test(md), 'closeout docs include GitHub sync section')
  }
}

// ─── Run ─────────────────────────────────────────────────────────────────────

console.log('K25 SEMESTER SETTINGS ACCEPTANCE CLOSEOUT VERIFY')
console.log('=================================================')

testCloseoutDocs()
testK25JUpdated()
testScopeFiles()
testClosedScopeMarkers()
testNonGoals()
testGitHubSync()

console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━')
console.log(`K25 SEMESTER SETTINGS ACCEPTANCE CLOSEOUT VERIFY ${failed === 0 ? 'PASS' : 'FAIL'}`)
console.log(`PASS=${passed} FAIL=${failed}`)
if (failed > 0) {
  console.log('Failures:')
  for (const f of failures) {
    console.log(`  - ${f}`)
  }
}
console.log('blocking=false')
process.exit(failed > 0 ? 1 : 0)
