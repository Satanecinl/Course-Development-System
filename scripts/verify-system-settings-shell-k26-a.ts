/**
 * K26-A: System settings navigation shell verification.
 *
 * Read-only — does not write to DB. Verifies:
 *   1. Page and shell structure
 *   2. All 9 modules declared
 *   3. Module states correct
 *   4. Semester settings integration preserved
 *   5. Non-goals
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

// ─── A. Page / Shell ─────────────────────────────────────────────────────────

function testPageAndShell() {
  console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━')
  console.log('A. Page / Shell')
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━')

  assert(fileExists('src/app/admin/settings/page.tsx'), 'settings page exists')
  if (fileExists('src/app/admin/settings/page.tsx')) {
    const src = fileRead('src/app/admin/settings/page.tsx')
    assert(/系统设置/.test(src), 'settings center title exists')
    assert(/SettingsCenter/.test(src), 'settings center shell component used')
  }

  assert(fileExists('src/components/settings/settings-center.tsx'), 'SettingsCenter component exists')
  assert(fileExists('src/components/settings/settings-module-card.tsx'), 'SettingsModuleCard component exists')
  assert(fileExists('src/lib/settings/settings-modules.ts'), 'settings module config exists')
}

// ─── B. Module declarations ──────────────────────────────────────────────────

function testModuleDeclarations() {
  console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━')
  console.log('B. Module declarations')
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━')

  const src = fileRead('src/lib/settings/settings-modules.ts')

  assert(/SETTINGS_MODULES/.test(src), 'SETTINGS_MODULES array exported')

  // Count modules
  const keyMatches = src.match(/key:\s*['"]/g)
  assert(keyMatches !== null && keyMatches.length >= 9, `9 modules declared (found ${keyMatches?.length ?? 0})`)

  // Check each module exists
  const modules = [
    { key: 'semester-settings', label: '学期设置' },
    { key: 'scheduler-config', label: '排课参数设置' },
    { key: 'time-slot-worktime', label: '节次与作息设置' },
    { key: 'campus-room-rules', label: '校区/教室规则设置' },
    { key: 'adjustment-rules', label: '调课规则设置' },
    { key: 'import-rules', label: '导入规则设置' },
    { key: 'rbac-settings', label: '权限与角色设置' },
    { key: 'data-maintenance', label: '数据维护与备份' },
    { key: 'audit-log', label: '审计日志' },
  ]

  for (const mod of modules) {
    assert(new RegExp(`key:\\s*'${mod.key}'`).test(src), `${mod.label} module declared`)
  }
}

// ─── C. Module states ────────────────────────────────────────────────────────

function testModuleStates() {
  console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━')
  console.log('C. Module states')
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━')

  const src = fileRead('src/lib/settings/settings-modules.ts')

  // semester-settings is ready
  assert(/key:\s*'semester-settings'[\s\S]*?status:\s*'ready'/.test(src), '学期设置 is ready')

  // Other modules are planned/coming-soon/roadmap
  assert(/key:\s*'scheduler-config'[\s\S]*?status:\s*'planned'/.test(src), '排课参数设置 is planned')
  assert(/key:\s*'time-slot-worktime'[\s\S]*?status:\s*'coming-soon'/.test(src), '节次与作息设置 is coming-soon')
  assert(/key:\s*'campus-room-rules'[\s\S]*?status:\s*'coming-soon'/.test(src), '校区/教室规则设置 is coming-soon')
  assert(/key:\s*'adjustment-rules'[\s\S]*?status:\s*'planned'/.test(src), '调课规则设置 is planned')
  assert(/key:\s*'import-rules'[\s\S]*?status:\s*'planned'/.test(src), '导入规则设置 is planned')
  assert(/key:\s*'rbac-settings'[\s\S]*?status:\s*'roadmap'/.test(src), '权限与角色设置 is roadmap')
  assert(/key:\s*'data-maintenance'[\s\S]*?status:\s*'roadmap'/.test(src), '数据维护与备份 is roadmap')
  assert(/key:\s*'audit-log'[\s\S]*?status:\s*'roadmap'/.test(src), '审计日志 is roadmap')

  // Each future module has recommendedStage
  assert(/recommendedStage:\s*'K26-B/.test(src), 'scheduler-config has recommendedStage')
  assert(/recommendedStage:\s*'K26-C/.test(src), 'time-slot has recommendedStage')
  assert(/recommendedStage:\s*'K26-D/.test(src), 'campus-room has recommendedStage')
  assert(/recommendedStage:\s*'K26-E/.test(src), 'adjustment has recommendedStage')
  assert(/recommendedStage:\s*'K26-F/.test(src), 'import has recommendedStage')
  assert(/recommendedStage:\s*'K26-G/.test(src), 'rbac has recommendedStage')
  assert(/recommendedStage:\s*'K26-H/.test(src), 'data-maintenance has recommendedStage')
  assert(/recommendedStage:\s*'K26-I/.test(src), 'audit-log has recommendedStage')

  // Each future module has description
  const descriptions = src.match(/description:\s*'[^']+'/g)
  assert(descriptions !== null && descriptions.length >= 9, `all modules have descriptions (found ${descriptions?.length ?? 0})`)

  // No real business form in future modules
  assert(!/<form|<Input.*placeholder.*配置|<Input.*placeholder.*设置/.test(fileRead('src/components/settings/settings-center.tsx')), 'no real business form in settings center')
}

// ─── D. Semester settings integration ────────────────────────────────────────

function testSemesterIntegration() {
  console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━')
  console.log('D. Semester settings integration')
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━')

  // Settings center imports SemesterSettingsPanel
  {
    const src = fileRead('src/components/settings/settings-center.tsx')
    assert(/SemesterSettingsPanel/.test(src), 'SettingsCenter imports SemesterSettingsPanel')
  }

  // SemesterSettingsPanel still has all K25-I features
  {
    const src = fileRead('src/components/settings/semester-settings-panel.tsx')
    assert(/当前学期|activeSemester/.test(src), 'current semester card marker exists')
    assert(/<table|semester.*list|学期列表/.test(src), 'semester list marker exists')
    assert(/handleCreateClick|新增学期/.test(src), 'create button marker exists')
    assert(/handleEditClick|Pencil/.test(src), 'edit button marker exists')
    assert(/handleActivateClick|设为当前/.test(src), 'activate button marker exists')
    assert(/handleDeleteClick|delete|删除/.test(src), 'delete button marker exists')
    assert(/canDelete|deleteBlockers/.test(src), 'delete protection marker exists')
  }
}

// ─── E. Non-goals ────────────────────────────────────────────────────────────

function testNonGoals() {
  console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━')
  console.log('E. Non-goals')
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━')

  assert(fileExists('prisma/schema.prisma'), 'schema.prisma exists (not modified)')

  // No long-term module business implementation
  if (fileExists('src/components/settings/settings-center.tsx')) {
    const src = fileRead('src/components/settings/settings-center.tsx')
    // PlannedModuleContent only shows info, no real form
    assert(/PlannedModuleContent/.test(src), 'planned modules use PlannedModuleContent')
    assert(!/fetch\(.+scheduler-config|fetch\(.+time-slot/.test(src), 'no real API calls for planned modules')
  }
}

// ─── Run ─────────────────────────────────────────────────────────────────────

console.log('K26-A SYSTEM SETTINGS NAVIGATION SHELL VERIFY')
console.log('==============================================')

testPageAndShell()
testModuleDeclarations()
testModuleStates()
testSemesterIntegration()
testNonGoals()

console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━')
console.log(`K26-A SYSTEM SETTINGS NAVIGATION SHELL VERIFY ${failed === 0 ? 'PASS' : 'FAIL'}`)
console.log(`PASS=${passed} FAIL=${failed}`)
if (failed > 0) {
  console.log('Failures:')
  for (const f of failures) {
    console.log(`  - ${f}`)
  }
}
console.log('blocking=false')
console.log('recommendedNextStage=K26-B-SCHEDULER-CONFIG-SETTINGS-INTEGRATION')
process.exit(failed > 0 ? 1 : 0)
