/**
 * K25-I: Semester settings UI verification.
 *
 * Read-only — does not write to DB. Verifies:
 *   1. Settings page is no longer placeholder
 *   2. Semester settings panel exists
 *   3. Current semester card exists
 *   4. Semester list table exists
 *   5. Create/edit/activate/delete UI exists
 *   6. API client wiring
 *   7. Validation and error handling
 *   8. Delete protection UX
 *   9. SemesterSelector integration
 *  10. Non-goals
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

// ─── A. Page / Components ────────────────────────────────────────────────────

function testPageAndComponents() {
  console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━')
  console.log('A. Page / Components')
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━')

  // Settings page no longer placeholder
  const page = 'src/app/admin/settings/page.tsx'
  assert(fileExists(page), 'settings page exists')
  if (fileExists(page)) {
    const src = fileRead(page)
    assert(!/功能建设中/.test(src), 'settings page is no longer placeholder')
    assert(/SemesterSettingsPanel|SettingsCenter/.test(src), 'settings page uses SemesterSettingsPanel or SettingsCenter')
    assert(/ProtectedShell/.test(src), 'settings page uses ProtectedShell')
  }

  // Semester settings panel
  const panel = 'src/components/settings/semester-settings-panel.tsx'
  assert(fileExists(panel), 'semester-settings-panel.tsx exists')
  if (fileExists(panel)) {
    const src = fileRead(panel)
    assert(/当前学期|activeSemester/.test(src), 'current semester card exists')
    assert(/<table|semester.*list|学期列表/.test(src), 'semester list table exists')
    assert(/新增学期|handleCreateClick/.test(src), 'create button exists')
    assert(/handleEditClick|Pencil/.test(src), 'edit button exists')
    assert(/handleActivateClick|设为当前|activate/.test(src), 'activate button exists')
    assert(/handleDeleteClick|delete|删除/.test(src), 'delete button exists')
    assert(/loading|Loader2/.test(src), 'loading state exists')
    assert(/error|AlertCircle/.test(src), 'error state exists')
    assert(/暂无学期|semesters\.length\s*===\s*0/.test(src), 'empty state exists')
  }
}

// ─── B. Client / API wiring ──────────────────────────────────────────────────

function testApiWiring() {
  console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━')
  console.log('B. Client / API wiring')
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━')

  const client = 'src/lib/semesters/semester-settings-client.ts'
  assert(fileExists(client), 'semester-settings-client.ts exists')
  if (fileExists(client)) {
    const src = fileRead(client)
    assert(/fetchSemestersWithCounts/.test(src), 'fetchSemestersWithCounts exists')
    assert(/createSemester/.test(src), 'createSemester exists')
    assert(/updateSemester/.test(src), 'updateSemester exists')
    assert(/deleteSemester/.test(src), 'deleteSemester exists')
    assert(/activateSemester/.test(src), 'activateSemester exists')
    assert(/includeCounts/.test(src), 'uses includeCounts parameter')
  }

  // Panel uses client
  if (fileExists('src/components/settings/semester-settings-panel.tsx')) {
    const src = fileRead('src/components/settings/semester-settings-panel.tsx')
    assert(/fetchSemestersWithCounts/.test(src), 'panel calls fetchSemestersWithCounts')
    assert(/createSemester/.test(src), 'panel calls createSemester')
    assert(/updateSemester/.test(src), 'panel calls updateSemester')
    assert(/deleteSemester/.test(src), 'panel calls deleteSemester')
    assert(/activateSemester/.test(src), 'panel calls activateSemester')
  }
}

// ─── C. Forms / Validation ───────────────────────────────────────────────────

function testFormsAndValidation() {
  console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━')
  console.log('C. Forms / Validation')
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━')

  const form = 'src/components/settings/semester-form-dialog.tsx'
  assert(fileExists(form), 'semester-form-dialog.tsx exists')
  if (fileExists(form)) {
    const src = fileRead(form)
    assert(/name.*不能为空|name.*required|!name\.trim/.test(src), 'name required validation')
    assert(/code.*不能为空|code.*required|!code\.trim/.test(src), 'code required validation')
    assert(/startsAt.*endsAt|INVALID_DATE_RANGE|开始日期/.test(src), 'date range validation')
    assert(/toast\.error|error.*message|setError|error &&/.test(src), 'backend error display exists')
    assert(/saving.*保存中|submit.*loading/.test(src), 'submit loading state exists')
  }
}

// ─── D. Delete protection ────────────────────────────────────────────────────

function testDeleteProtection() {
  console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━')
  console.log('D. Delete protection')
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━')

  const dialog = 'src/components/settings/semester-delete-dialog.tsx'
  assert(fileExists(dialog), 'semester-delete-dialog.tsx exists')
  if (fileExists(dialog)) {
    const src = fileRead(dialog)
    assert(/canDelete/.test(src), 'canDelete used')
    assert(/deleteBlockers|blockers/.test(src), 'deleteBlockers displayed')
    assert(/counts|dependencies/.test(src), 'dependency counts displayed')
    assert(/无法删除|不可删除/.test(src), 'delete blocked message exists')
  }

  // Panel uses canDelete
  if (fileExists('src/components/settings/semester-settings-panel.tsx')) {
    const src = fileRead('src/components/settings/semester-settings-panel.tsx')
    assert(/canDelete/.test(src), 'panel uses canDelete')
    assert(/deleteBlockers/.test(src), 'panel uses deleteBlockers')
  }
}

// ─── E. SemesterSelector integration ─────────────────────────────────────────

function testSemesterSelectorIntegration() {
  console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━')
  console.log('E. SemesterSelector integration')
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━')

  if (fileExists('src/components/settings/semester-settings-panel.tsx')) {
    const src = fileRead('src/components/settings/semester-settings-panel.tsx')
    assert(/useSemesterStore|semesterStore/.test(src), 'uses semesterStore')
    assert(/refreshSemesterStore|fetchSemesters/.test(src), 'refreshes semester store')
    assert(/refreshAll/.test(src), 'has refreshAll function for post-operation refresh')
  }
}

// ─── F. Non-goals ────────────────────────────────────────────────────────────

function testNonGoals() {
  console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━')
  console.log('F. Non-goals')
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━')

  assert(fileExists('prisma/schema.prisma'), 'schema.prisma exists (not deleted)')

  // No new migrations
  if (fileExists('prisma/migrations')) {
    const { readdirSync } = require('fs') // eslint-disable-line @typescript-eslint/no-require-imports
    const migrations = readdirSync(resolve(ROOT, 'prisma/migrations'))
    const k25iMigrations = migrations.filter((m: string) => m.includes('k25-i') || m.includes('k25_i'))
    assert(k25iMigrations.length === 0, 'no K25-I migrations added')
  }

  // No long-term settings modules
  if (fileExists('src/components/settings/semester-settings-panel.tsx')) {
    const src = fileRead('src/components/settings/semester-settings-panel.tsx')
    assert(/后续阶段/.test(src), 'long-term settings modules deferred')
  }
}

// ─── Run ─────────────────────────────────────────────────────────────────────

console.log('K25-I SEMESTER SETTINGS UI VERIFY')
console.log('==================================')

testPageAndComponents()
testApiWiring()
testFormsAndValidation()
testDeleteProtection()
testSemesterSelectorIntegration()
testNonGoals()

console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━')
console.log(`K25-I SEMESTER SETTINGS UI VERIFY ${failed === 0 ? 'PASS' : 'FAIL'}`)
console.log(`PASS=${passed} FAIL=${failed}`)
if (failed > 0) {
  console.log('Failures:')
  for (const f of failures) {
    console.log(`  - ${f}`)
  }
}
console.log('blocking=false')
console.log('recommendedNextStage=K25-J-SEMESTER-SETTINGS-E2E-MANUAL-TRIAL')
process.exit(failed > 0 ? 1 : 0)
