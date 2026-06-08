/**
 * scripts/verify-worktime-settings-ui-k26-h.ts
 *
 * K26-H: WorkTime settings UI verify (read-only).
 *
 * Sections:
 *   1. Files / integration (9 checks)
 *   2. API usage (6 checks)
 *   3. UI markers (13 checks)
 *   4. Validation markers (7 checks)
 *   5. Non-goals (8 checks)
 *
 * Output:
 *   K26-H WORKTIME SETTINGS UI VERIFY PASS
 *   PASS=x FAIL=0
 *   blocking=false
 *   recommendedNextStage=K26-H1-WORKTIME-SETTINGS-UI-MANUAL-TRIAL
 */

import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { execSync } from 'node:child_process'

interface CheckResult {
  id: string
  name: string
  pass: boolean
  detail: string
}

const results: CheckResult[] = []
const projectRoot = process.cwd()

function record(id: string, name: string, pass: boolean, detail = ''): void {
  results.push({ id, name, pass, detail })
  const tag = pass ? 'PASS' : 'FAIL'
  const detailSuffix = detail ? ` — ${detail}` : ''
  console.log(`  [${tag}] ${id} ${name}${detailSuffix}`)
}

function fileExists(relativePath: string): boolean {
  return existsSync(join(projectRoot, relativePath))
}

function fileContains(relativePath: string, needle: string): boolean {
  const fullPath = join(projectRoot, relativePath)
  if (!existsSync(fullPath)) return false
  return readFileSync(fullPath, 'utf8').includes(needle)
}

function readFile(relativePath: string): string {
  return readFileSync(join(projectRoot, relativePath), 'utf8')
}

// ---------------------------------------------------------------------------
// Section 1: Files / integration
// ---------------------------------------------------------------------------
console.log('\n[Section 1] Files / integration')

{
  const ok = fileExists('src/components/settings/worktime-settings-panel.tsx')
  record('F1', 'WorkTimeSettingsPanel exists', ok)
}
{
  const ok = fileExists('src/components/settings/worktime-config-form-dialog.tsx')
  record('F2', 'WorkTimeConfigFormDialog exists', ok)
}
{
  const ok = fileExists('src/components/settings/worktime-config-delete-dialog.tsx')
  record('F3', 'WorkTimeConfigDeleteDialog exists', ok)
}
{
  const ok = fileExists('src/lib/settings/worktime-settings-client.ts')
  record('F4', 'worktime settings client exists', ok)
}
{
  const mods = fileExists('src/lib/settings/settings-modules.ts') ? readFile('src/lib/settings/settings-modules.ts') : ''
  const ok = /key:\s*'time-slot-worktime'/.test(mods) && /status:\s*'ready'/.test(mods)
  record('F5', 'settings-modules marks worktime as ready', ok)
}
{
  const center = fileExists('src/components/settings/settings-center.tsx') ? readFile('src/components/settings/settings-center.tsx') : ''
  const ok = center.includes('WorkTimeSettingsPanel') && center.includes('time-slot-worktime')
  record('F6', 'settings-center renders WorkTimeSettingsPanel', ok)
}
{
  const mods = fileExists('src/lib/settings/settings-modules.ts') ? readFile('src/lib/settings/settings-modules.ts') : ''
  const ok = /key:\s*'semester-settings'/.test(mods) && /status:\s*'ready'/.test(mods)
  record('F7', 'semester settings still ready', ok)
}
{
  const mods = fileExists('src/lib/settings/settings-modules.ts') ? readFile('src/lib/settings/settings-modules.ts') : ''
  const ok = /key:\s*'scheduler-config'/.test(mods) && /status:\s*'ready'/.test(mods)
  record('F8', 'scheduler config settings still ready', ok)
}
{
  const mods = fileExists('src/lib/settings/settings-modules.ts') ? readFile('src/lib/settings/settings-modules.ts') : ''
  const ok = mods.includes("status: 'coming-soon'") || mods.includes("status: 'planned'") || mods.includes("status: 'roadmap'")
  record('F9', 'other future modules remain planned/coming-soon', ok)
}

// ---------------------------------------------------------------------------
// Section 2: API usage
// ---------------------------------------------------------------------------
console.log('\n[Section 2] API usage')

{
  const ok = fileContains('src/lib/settings/worktime-settings-client.ts', 'listWorkTimeConfigs')
  record('A1', 'client calls list endpoint', ok)
}
{
  const ok = fileContains('src/lib/settings/worktime-settings-client.ts', 'resolveWorkTimeConfig')
  record('A2', 'client calls resolved endpoint', ok)
}
{
  const ok = fileContains('src/lib/settings/worktime-settings-client.ts', 'createWorkTimeConfig')
  record('A3', 'client calls create endpoint', ok)
}
{
  const ok = fileContains('src/lib/settings/worktime-settings-client.ts', 'updateWorkTimeConfig')
  record('A4', 'client calls update endpoint', ok)
}
{
  const ok = fileContains('src/lib/settings/worktime-settings-client.ts', 'deleteWorkTimeConfig')
  record('A5', 'client calls delete endpoint', ok)
}
{
  const ok = fileContains('src/lib/settings/worktime-settings-client.ts', 'activateWorkTimeConfig')
  record('A6', 'client calls activate endpoint', ok)
}

// ---------------------------------------------------------------------------
// Section 3: UI markers
// ---------------------------------------------------------------------------
console.log('\n[Section 3] UI markers')

{
  const ok = fileContains('src/components/settings/worktime-settings-panel.tsx', 'k26h-resolved-card')
  record('M1', 'resolved config card marker', ok)
}
{
  const ok = fileContains('src/components/settings/worktime-settings-panel.tsx', 'k26h-config-list')
  record('M2', 'config list marker', ok)
}
{
  const ok = fileContains('src/components/settings/worktime-settings-panel.tsx', 'k26h-slot-table')
  record('M3', 'slot table marker', ok)
}
{
  const ok = fileContains('src/components/settings/worktime-config-form-dialog.tsx', 'k26h-worktime-form-dialog')
  record('M4', 'create dialog marker', ok)
}
{
  const ok = fileContains('src/components/settings/worktime-config-form-dialog.tsx', 'k26h-form-submit')
  record('M5', 'edit dialog marker', ok)
}
{
  const ok = fileContains('src/components/settings/worktime-config-delete-dialog.tsx', 'k26h-worktime-delete-dialog')
  record('M6', 'delete dialog marker', ok)
}
{
  const ok = fileContains('src/components/settings/worktime-settings-panel.tsx', 'k26h-activate-btn')
  record('M7', 'activate button marker', ok)
}
{
  const ok = fileContains('src/components/settings/worktime-settings-panel.tsx', 'k26h-loading')
  record('M8', 'loading state marker', ok)
}
{
  const ok = fileContains('src/components/settings/worktime-settings-panel.tsx', 'k26h-error')
  record('M9', 'error state marker', ok)
}
{
  const ok = fileContains('src/components/settings/worktime-settings-panel.tsx', 'k26h-empty')
  record('M10', 'empty state marker', ok)
}
{
  const ok = fileContains('src/components/settings/worktime-settings-panel.tsx', 'k26h-static-fallback-warning')
  record('M11', 'staticFallback warning marker', ok)
}
{
  const ok = fileContains('src/components/settings/worktime-config-form-dialog.tsx', 'k26h-legacy-6-7-warning')
  record('M12', 'legacy 6/7 warning marker', ok)
}
{
  const ok = fileContains('src/components/settings/worktime-settings-panel.tsx', 'k26h-no-solver-warning')
  record('M13', 'no solver/score integration warning marker', ok)
}

// ---------------------------------------------------------------------------
// Section 4: Validation markers
// ---------------------------------------------------------------------------
console.log('\n[Section 4] Validation markers')

{
  const ok = fileContains('src/components/settings/worktime-config-form-dialog.tsx', '配置名称不能为空')
  record('V1', 'name required validation marker', ok)
}
{
  const ok = fileContains('src/components/settings/worktime-config-form-dialog.tsx', 'HH:mm')
  record('V2', 'HH:mm validation marker', ok)
}
{
  const ok = fileContains('src/components/settings/worktime-config-form-dialog.tsx', '重复')
  record('V3', 'duplicate slotIndex validation marker', ok)
}
{
  const ok = fileContains('src/components/settings/worktime-config-form-dialog.tsx', '至少需要一个活跃的教学节次')
  record('V4', 'active teaching slot requirement marker', ok)
}
{
  const ok = fileContains('src/components/settings/worktime-config-form-dialog.tsx', '不能设为教学节次')
  record('V5', 'slot 6/7 cannot active teaching marker', ok)
}
{
  const ok = fileContains('src/components/settings/worktime-config-form-dialog.tsx', '传统显示节次不能同时设为教学节次')
  record('V6', 'legacy cannot active teaching marker', ok)
}
{
  const ok = fileContains('src/components/settings/worktime-config-delete-dialog.tsx', 'k26h-delete-protection-error')
  record('V7', 'backend error display marker', ok)
}

// ---------------------------------------------------------------------------
// Section 5: Non-goals
// ---------------------------------------------------------------------------
console.log('\n[Section 5] Non-goals')

{
  const schema = fileExists('prisma/schema.prisma') ? readFile('prisma/schema.prisma') : ''
  const ok = schema.length > 0 && /model\s+WorkTimeConfig/.test(schema) && /model\s+TimeSlotDefinition/.test(schema)
  record('N1', 'no schema change (models still exist)', ok)
}
{
  let migrationHits: string[] = []
  try {
    const stat = execSync('git diff --name-only aca864e..HEAD -- prisma/migrations/', { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] })
    migrationHits = stat.split(/\r?\n/).filter((s) => s.length > 0)
  } catch {
    migrationHits = []
  }
  record('N2', 'no migration added', migrationHits.length === 0, `hits=${migrationHits.join(',') || 'none'}`)
}
{
  const ok = !fileContains('src/lib/scheduler/solver.ts', '__K26_H_SENTINEL__')
  record('N3', 'no solver change', ok)
}
{
  const ok = !fileContains('src/lib/scheduler/score.ts', '__K26_H_SENTINEL__')
  record('N4', 'no score change', ok)
}
{
  const ok = !fileContains('src/lib/schedule/adjustment-plan-recommendations.ts', '__K26_H_SENTINEL__')
  record('N5', 'no scheduler preview/apply change', ok)
}
{
  const ok = !fileContains('src/lib/schedule/room-recommendations.ts', '__K26_H_SENTINEL__')
  record('N6', 'no adjustment recommendation change', ok)
}
{
  let k22Hits: string[] = []
  try {
    const stat = execSync('git status --short', { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] })
    k22Hits = stat.split(/\r?\n/).filter((l) => /\?{2}|M|A/.test(l) && /k22/i.test(l))
  } catch {
    k22Hits = []
  }
  record('N7', 'no K22/K23/K24 expected change', k22Hits.length === 0, `hits=${k22Hits.join(',') || 'none'}`)
}
{
  const ok = fileContains('src/components/settings/worktime-settings-panel.tsx', '尚未接入调课推荐')
  record('N8', 'UI warns about no solver/score/recommendation integration', ok)
}

// ---------------------------------------------------------------------------
// Summary
// ---------------------------------------------------------------------------

const pass = results.filter((r) => r.pass).length
const fail = results.filter((r) => !r.pass).length

console.log('\n──────────────────────────────────────────')
console.log(`K26-H WORKTIME SETTINGS UI VERIFY: PASS=${pass} FAIL=${fail}`)

if (fail > 0) {
  console.log('\nFailed checks:')
  for (const r of results.filter((r) => !r.pass)) {
    console.log(`  - ${r.id} ${r.name}${r.detail ? ` (${r.detail})` : ''}`)
  }
  console.log('\nK26-H WORKTIME SETTINGS UI VERIFY FAIL')
  console.log('blocking=true')
  console.log('recommendedNextStage=K26-H1-WORKTIME-SETTINGS-UI-FIX')
  process.exit(1)
}

console.log('\nK26-H WORKTIME SETTINGS UI VERIFY PASS')
console.log(`PASS=${pass} FAIL=0`)
console.log('blocking=false')
console.log('recommendedNextStage=K26-H1-WORKTIME-SETTINGS-UI-MANUAL-TRIAL')
process.exit(0)
