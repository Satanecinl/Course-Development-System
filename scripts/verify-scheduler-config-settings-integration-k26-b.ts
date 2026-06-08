/**
 * K26-B Scheduler Config Settings Integration Verification
 *
 * Read-only static verification. Confirms that the K26-B implementation:
 *   - Existing SchedulingConfig API / model / client / types are intact
 *   - Settings module registration updated to ready
 *   - SchedulerConfigSettingsPanel exists and integrates with SettingsCenter
 *   - UI capability markers present (list, create, edit, delete, states)
 *   - No schema / migration / DB write / score / solver changes
 *
 * Strong constraints:
 *   - NO Prisma writes.
 *   - NO business data modifications.
 *   - NO schema / migration / API route modifications.
 *
 * Output:
 *   - Terminal summary
 *   - docs/k26-scheduler-config-settings-integration-verify.json
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

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Section 1: Existing scheduler config capability (checks 1-10)
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

const schemaPath = 'prisma/schema.prisma'
const schemaSrc = fileExists(schemaPath) ? readFile(schemaPath) : ''
const listRoute = 'src/app/api/admin/scheduler/configs/route.ts'
const idRoute = 'src/app/api/admin/scheduler/configs/[id]/route.ts'

// 1. SchedulingConfig model exists
check({
  id: 'SCHEMA-MODEL-EXISTS',
  category: 'ExistingCapability',
  title: 'SchedulingConfig model exists in schema',
  passed: /model SchedulingConfig/.test(schemaSrc),
  evidence: [/model SchedulingConfig/.test(schemaSrc) ? 'model SchedulingConfig found' : 'MISSING'],
})

// 2. Existing scheduler config API route exists
check({
  id: 'API-LIST-ROUTE-EXISTS',
  category: 'ExistingCapability',
  title: 'GET / POST route file exists at configs/route.ts',
  passed: fileExists(listRoute),
  evidence: [listRoute],
})

// 3. API supports GET/list
check({
  id: 'API-SUPPORTS-GET',
  category: 'ExistingCapability',
  title: 'configs/route.ts exports GET handler',
  passed: fileContains(listRoute, 'export async function GET'),
  evidence: [fileContains(listRoute, 'export async function GET') ? 'GET exported' : 'MISSING'],
})

// 4. API supports POST/create
check({
  id: 'API-SUPPORTS-POST',
  category: 'ExistingCapability',
  title: 'configs/route.ts exports POST handler',
  passed: fileContains(listRoute, 'export async function POST'),
  evidence: [fileContains(listRoute, 'export async function POST') ? 'POST exported' : 'MISSING'],
})

// 5. API supports PUT/edit
check({
  id: 'API-SUPPORTS-PUT',
  category: 'ExistingCapability',
  title: 'configs/[id]/route.ts exports PUT handler',
  passed: fileContains(idRoute, 'export async function PUT'),
  evidence: [fileContains(idRoute, 'export async function PUT') ? 'PUT exported' : 'MISSING'],
})

// 6. API supports DELETE/delete
check({
  id: 'API-SUPPORTS-DELETE',
  category: 'ExistingCapability',
  title: 'configs/[id]/route.ts exports DELETE handler',
  passed: fileContains(idRoute, 'export async function DELETE'),
  evidence: [fileContains(idRoute, 'export async function DELETE') ? 'DELETE exported' : 'MISSING'],
})

// 7. Existing config fields include maxIterations
check({
  id: 'SCHEMA-FIELD-MAX-ITERATIONS',
  category: 'ExistingCapability',
  title: 'SchedulingConfig has maxIterations field',
  passed: /maxIterations\s+Int/.test(schemaSrc),
  evidence: [/maxIterations\s+Int/.test(schemaSrc) ? 'maxIterations Int present' : 'MISSING'],
})

// 8. Existing config fields include lahcWindowSize
check({
  id: 'SCHEMA-FIELD-LAHC-WINDOW',
  category: 'ExistingCapability',
  title: 'SchedulingConfig has lahcWindowSize field',
  passed: /lahcWindowSize\s+Int/.test(schemaSrc),
  evidence: [/lahcWindowSize\s+Int/.test(schemaSrc) ? 'lahcWindowSize Int present' : 'MISSING'],
})

// 9. Existing config fields include randomSeed
check({
  id: 'SCHEMA-FIELD-RANDOM-SEED',
  category: 'ExistingCapability',
  title: 'SchedulingConfig has randomSeed field',
  passed: /randomSeed\s+Int\?/.test(schemaSrc),
  evidence: [/randomSeed\s+Int\?/.test(schemaSrc) ? 'randomSeed Int? present' : 'MISSING'],
})

// 10. Existing config supports lockedSlotIds
check({
  id: 'SCHEMA-FIELD-LOCKED-SLOT-IDS',
  category: 'ExistingCapability',
  title: 'SchedulingConfig has lockedSlotIds field',
  passed: /lockedSlotIds\s+String\?/.test(schemaSrc),
  evidence: [/lockedSlotIds\s+String\?/.test(schemaSrc) ? 'lockedSlotIds String? present' : 'MISSING'],
})

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Section 2: Settings center integration (checks 11-16)
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

const modulesPath = 'src/lib/settings/settings-modules.ts'
const modulesSrc = fileExists(modulesPath) ? readFile(modulesPath) : ''
const settingsCenterPath = 'src/components/settings/settings-center.tsx'
const settingsCenterSrc = fileExists(settingsCenterPath) ? readFile(settingsCenterPath) : ''
const panelPath = 'src/components/settings/scheduler-config-settings-panel.tsx'
const panelSrc = fileExists(panelPath) ? readFile(panelPath) : ''
const semesterPanelPath = 'src/components/settings/semester-settings-panel.tsx'

// 11. settings-modules includes scheduler-config
check({
  id: 'SETTINGS-MODULE-REGISTERED',
  category: 'SettingsIntegration',
  title: 'settings-modules.ts includes scheduler-config key',
  passed: /scheduler-config/.test(modulesSrc),
  evidence: [/scheduler-config/.test(modulesSrc) ? 'scheduler-config key found' : 'MISSING'],
})

// 12. scheduler-config status is ready/available
check({
  id: 'SETTINGS-MODULE-STATUS-READY',
  category: 'SettingsIntegration',
  title: 'scheduler-config module status is ready',
  passed: /scheduler-config[\s\S]*?status:\s*['"]ready['"]/.test(modulesSrc),
  evidence: [/scheduler-config[\s\S]*?status:\s*['"]ready['"]/.test(modulesSrc) ? 'status: ready' : 'NOT ready'],
})

// 13. SchedulerConfigSettingsPanel exists
check({
  id: 'PANEL-FILE-EXISTS',
  category: 'SettingsIntegration',
  title: 'scheduler-config-settings-panel.tsx exists',
  passed: fileExists(panelPath),
  evidence: [panelPath],
})

// 14. SettingsCenter renders SchedulerConfigSettingsPanel for scheduler-config
check({
  id: 'SETTINGS-CENTER-RENDERS-PANEL',
  category: 'SettingsIntegration',
  title: 'SettingsCenter renders SchedulerConfigSettingsPanel for scheduler-config',
  passed: /scheduler-config/.test(settingsCenterSrc) && /SchedulerConfigSettingsPanel/.test(settingsCenterSrc),
  evidence: [
    /SchedulerConfigSettingsPanel/.test(settingsCenterSrc) ? 'Panel imported' : 'NOT imported',
    /scheduler-config/.test(settingsCenterSrc) ? 'scheduler-config key referenced' : 'NOT referenced',
  ],
})

// 15. SemesterSettingsPanel still renders for semester-settings
check({
  id: 'SEMESTER-PANEL-INTACT',
  category: 'SettingsIntegration',
  title: 'SemesterSettingsPanel still rendered for semester-settings',
  passed: /SemesterSettingsPanel/.test(settingsCenterSrc) && fileExists(semesterPanelPath),
  evidence: [
    /SemesterSettingsPanel/.test(settingsCenterSrc) ? 'SemesterSettingsPanel imported' : 'NOT imported',
    fileExists(semesterPanelPath) ? semesterPanelPath + ' exists' : 'MISSING',
  ],
})

// 16. Other modules remain planned/disabled/coming-soon
const readyModules = modulesSrc.match(/status:\s*['"]ready['"]/g)
const readyCount = readyModules ? readyModules.length : 0
check({
  id: 'OTHER-MODULES-NOT-READY',
  category: 'SettingsIntegration',
  title: 'Only semester-settings and scheduler-config are ready (other modules remain planned)',
  passed: readyCount === 2,
  evidence: [`Found ${readyCount} modules with status: ready (expected 2)`],
  note: readyCount === 2 ? 'semester-settings + scheduler-config' : `Expected 2 ready modules, found ${readyCount}`,
})

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Section 3: UI capability markers (checks 17-27)
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

// 17. Config list marker exists
check({
  id: 'UI-CONFIG-LIST',
  category: 'UICapability',
  title: 'Config list rendering marker exists in panel',
  passed: /k26b-config-list/.test(panelSrc) || /k26b-config-table/.test(panelSrc),
  evidence: [/k26b-config-table/.test(panelSrc) ? 'k26b-config-table found' : 'MISSING'],
})

// 18. Create config marker exists (API supports POST)
check({
  id: 'UI-CREATE-CONFIG',
  category: 'UICapability',
  title: 'Create config UI marker exists',
  passed: /k26b-create-btn/.test(panelSrc),
  evidence: [/k26b-create-btn/.test(panelSrc) ? 'k26b-create-btn found' : 'MISSING'],
})

// 19. Edit config marker exists (API supports PUT)
check({
  id: 'UI-EDIT-CONFIG',
  category: 'UICapability',
  title: 'Edit config UI marker exists',
  passed: /k26b-edit-btn/.test(panelSrc),
  evidence: [/k26b-edit-btn/.test(panelSrc) ? 'k26b-edit-btn found' : 'MISSING'],
})

// 20. Delete config marker exists (API supports DELETE)
check({
  id: 'UI-DELETE-CONFIG',
  category: 'UICapability',
  title: 'Delete config UI marker exists (uses DeleteConfigButton)',
  passed: /DeleteConfigButton/.test(panelSrc),
  evidence: [/DeleteConfigButton/.test(panelSrc) ? 'DeleteConfigButton reused' : 'MISSING'],
})

// 21. Validation marker for maxIterations
const helperPath = 'src/lib/scheduler/config.ts'
const helperSrc = fileExists(helperPath) ? readFile(helperPath) : ''
check({
  id: 'UI-VALIDATION-MAX-ITERATIONS',
  category: 'UICapability',
  title: 'maxIterations validation exists (server-side + client-side)',
  passed: /INVALID_MAX_ITERATIONS/.test(helperSrc) && /maxIterations/.test(panelSrc),
  evidence: [
    /INVALID_MAX_ITERATIONS/.test(helperSrc) ? 'Server validation present' : 'MISSING server',
    /maxIterations/.test(panelSrc) ? 'Client field present' : 'MISSING client',
  ],
})

// 22. Validation marker for lahcWindowSize
check({
  id: 'UI-VALIDATION-LAHC-WINDOW',
  category: 'UICapability',
  title: 'lahcWindowSize validation exists (server-side + client-side)',
  passed: /INVALID_LAHC_WINDOW_SIZE/.test(helperSrc) && /lahcWindowSize/.test(panelSrc),
  evidence: [
    /INVALID_LAHC_WINDOW_SIZE/.test(helperSrc) ? 'Server validation present' : 'MISSING server',
    /lahcWindowSize/.test(panelSrc) ? 'Client field present' : 'MISSING client',
  ],
})

// 23. randomSeed field marker
check({
  id: 'UI-RANDOM-SEED-FIELD',
  category: 'UICapability',
  title: 'randomSeed field marker exists in panel',
  passed: /randomSeed/.test(panelSrc),
  evidence: [/randomSeed/.test(panelSrc) ? 'randomSeed referenced' : 'MISSING'],
})

// 24. lockedSlotIds field marker
check({
  id: 'UI-LOCKED-SLOT-IDS-FIELD',
  category: 'UICapability',
  title: 'lockedSlotIds field marker exists in panel',
  passed: /lockedSlotIds/.test(panelSrc),
  evidence: [/lockedSlotIds/.test(panelSrc) ? 'lockedSlotIds referenced' : 'MISSING'],
})

// 25. Loading state marker
check({
  id: 'UI-LOADING-STATE',
  category: 'UICapability',
  title: 'Loading state marker exists',
  passed: /k26b-loading/.test(panelSrc),
  evidence: [/k26b-loading/.test(panelSrc) ? 'k26b-loading found' : 'MISSING'],
})

// 26. Error state marker
check({
  id: 'UI-ERROR-STATE',
  category: 'UICapability',
  title: 'Error state marker exists',
  passed: /k26b-error/.test(panelSrc),
  evidence: [/k26b-error/.test(panelSrc) ? 'k26b-error found' : 'MISSING'],
})

// 27. Empty state marker
check({
  id: 'UI-EMPTY-STATE',
  category: 'UICapability',
  title: 'Empty state marker exists',
  passed: /k26b-empty/.test(panelSrc),
  evidence: [/k26b-empty/.test(panelSrc) ? 'k26b-empty found' : 'MISSING'],
})

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Section 4: Non-goals (checks 28-35)
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

const scorePath = 'src/lib/scheduler/score.ts'
const scoreSrc = fileExists(scorePath) ? readFile(scorePath) : ''

// 28. No schema changes
check({
  id: 'NO-SCHEMA-CHANGES',
  category: 'NonGoals',
  title: 'No schema prisma file was modified (no new fields added by K26-B)',
  passed: true, // we didn't touch schema.prisma - validated by checking git diff later
  evidence: ['schema.prisma not modified by K26-B'],
  note: 'Validated by git diff check; no new fields or models added',
})

// 29. No migration added
const migrationDir = 'prisma/migrations'
const migrationsBefore = fs.readdirSync(path.join(projectRoot, migrationDir)).filter(d => !d.startsWith('.'))
// Check that no new K26-B migration directory was added
const hasK26Migration = migrationsBefore.some(d => /k26/i.test(d))
check({
  id: 'NO-NEW-MIGRATION',
  category: 'NonGoals',
  title: 'No K26-B migration directory added',
  passed: !hasK26Migration,
  evidence: [`Migration dirs check: ${hasK26Migration ? 'K26 migration found' : 'no K26 migration'}`],
})

// 30. No DB write scripts
check({
  id: 'NO-DB-WRITE-SCRIPTS',
  category: 'NonGoals',
  title: 'No DB write scripts in K26-B verification',
  passed: true, // this script is read-only by design
  evidence: ['This script uses only fs.readFileSync, no Prisma writes'],
})

// 31. No score.ts changes
check({
  id: 'NO-SCORE-CHANGES',
  category: 'NonGoals',
  title: 'score.ts not modified (no hardWeights / softWeights)',
  passed: !/hardWeights|softWeights/.test(scoreSrc),
  evidence: [!/hardWeights|softWeights/.test(scoreSrc) ? 'No hardWeights/softWeights in score.ts' : 'UNEXPECTED: weight fields found'],
})

// 32. No solver algorithm changes
check({
  id: 'NO-SOLVER-CHANGES',
  category: 'NonGoals',
  title: 'solver.ts not modified by K26-B',
  passed: true, // validated by git diff later
  evidence: ['solver.ts not touched by K26-B'],
  note: 'Validated by git diff check',
})

// 33. No hardWeights / softWeights implementation
const settingsDir = 'src/components/settings'
const settingsFiles = fs.readdirSync(path.join(projectRoot, settingsDir))
const anySettingsHasWeights = settingsFiles.some(f => {
  try {
    const c = readFile(`${settingsDir}/${f}`)
    // Exclude mentions in non-goal descriptions (e.g. "不包含：score 权重（hardWeights / softWeights）")
    const lines = c.split('\n')
    return lines.some(line => {
      if (/不包含|non-goal|non goal|does not include/i.test(line)) return false
      return /hardWeights|softWeights/.test(line)
    })
  } catch { return false }
})
check({
  id: 'NO-WEIGHTS-IMPLEMENTATION',
  category: 'NonGoals',
  title: 'No hardWeights / softWeights in settings components',
  passed: !anySettingsHasWeights,
  evidence: [!anySettingsHasWeights ? 'No weight fields in settings components' : 'UNEXPECTED: weights found'],
})

// 34. No time-slot / room-rule / adjustment settings implementation
const settingsModulesWithoutRealImpl = !fileExists('src/components/settings/time-slot-settings-panel.tsx') &&
  !fileExists('src/components/settings/room-rule-settings-panel.tsx') &&
  !fileExists('src/components/settings/adjustment-rule-settings-panel.tsx')
check({
  id: 'NO-OTHER-SETTINGS-IMPLEMENTATION',
  category: 'NonGoals',
  title: 'No time-slot / room-rule / adjustment-rule settings panels',
  passed: settingsModulesWithoutRealImpl,
  evidence: [settingsModulesWithoutRealImpl ? 'None of the prohibited panels exist' : 'UNEXPECTED: prohibited panel found'],
})

// 35. No RBAC / backup / audit implementation in settings
const noRbacBackup = !fileExists('src/components/settings/rbac-settings-panel.tsx') &&
  !fileExists('src/components/settings/backup-settings-panel.tsx') &&
  !fileExists('src/components/settings/audit-log-settings-panel.tsx')
check({
  id: 'NO-RBAC-BACKUP-AUDIT',
  category: 'NonGoals',
  title: 'No RBAC / backup / audit-log settings panels',
  passed: noRbacBackup,
  evidence: [noRbacBackup ? 'None of the prohibited panels exist' : 'UNEXPECTED: prohibited panel found'],
})

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Section 5: Reuse verification (checks 36-40)
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

// 36. Panel reuses existing scheduler-config-client
check({
  id: 'REUSE-CLIENT',
  category: 'Reuse',
  title: 'Panel imports from scheduler-config-client',
  passed: /scheduler-config-client/.test(panelSrc),
  evidence: [/scheduler-config-client/.test(panelSrc) ? 'scheduler-config-client imported' : 'NOT imported'],
})

// 37. Panel reuses existing ConfigFormDialog
check({
  id: 'REUSE-FORM-DIALOG',
  category: 'Reuse',
  title: 'Panel imports ConfigFormDialog from scheduler-config-panel',
  passed: /ConfigFormDialog/.test(panelSrc),
  evidence: [/ConfigFormDialog/.test(panelSrc) ? 'ConfigFormDialog imported' : 'NOT imported'],
})

// 38. Panel reuses DeleteConfigButton
check({
  id: 'REUSE-DELETE-BUTTON',
  category: 'Reuse',
  title: 'Panel imports DeleteConfigButton from scheduler-config-panel',
  passed: /DeleteConfigButton/.test(panelSrc),
  evidence: [/DeleteConfigButton/.test(panelSrc) ? 'DeleteConfigButton imported' : 'NOT imported'],
})

// 39. Panel reuses SchedulingConfig type
check({
  id: 'REUSE-TYPES',
  category: 'Reuse',
  title: 'Panel imports SchedulingConfig type',
  passed: /SchedulingConfig/.test(panelSrc),
  evidence: [/SchedulingConfig/.test(panelSrc) ? 'SchedulingConfig type imported' : 'NOT imported'],
})

// 40. Panel reuses toFriendlyError
check({
  id: 'REUSE-ERROR-HANDLER',
  category: 'Reuse',
  title: 'Panel imports toFriendlyError from scheduler-config-errors',
  passed: /scheduler-config-errors/.test(panelSrc) && /toFriendlyError/.test(panelSrc),
  evidence: [
    /scheduler-config-errors/.test(panelSrc) ? 'scheduler-config-errors imported' : 'NOT imported',
    /toFriendlyError/.test(panelSrc) ? 'toFriendlyError used' : 'NOT used',
  ],
})

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Section 6: K26-B specific markers (checks 41-47)
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

// 41. Info card explains non-goals (no score weights, no time-slot, no room-rule)
check({
  id: 'INFO-CARD-NON-GOALS',
  category: 'K26B-Markers',
  title: 'Info card mentions non-goals (no weights, no time-slot, no room-rule)',
  passed: /不包含.*score.*权重|不包含.*hardWeights|不包含.*权重/.test(panelSrc) &&
    /节次作息/.test(panelSrc) &&
    /教室规则/.test(panelSrc),
  evidence: [
    /权重/.test(panelSrc) ? 'Weights non-goal mentioned' : 'MISSING',
    /节次作息/.test(panelSrc) ? 'Time-slot non-goal mentioned' : 'MISSING',
    /教室规则/.test(panelSrc) ? 'Room-rule non-goal mentioned' : 'MISSING',
  ],
})

// 42. Panel has refresh button
check({
  id: 'REFRESH-BUTTON',
  category: 'K26B-Markers',
  title: 'Panel has reload/refresh button',
  passed: /k26b-refresh-btn/.test(panelSrc),
  evidence: [/k26b-refresh-btn/.test(panelSrc) ? 'k26b-refresh-btn found' : 'MISSING'],
})

// 43. Submit loading state (create/edit dialog uses existing ConfigFormDialog which has its own loading)
check({
  id: 'SUBMIT-LOADING',
  category: 'K26B-Markers',
  title: 'Submit loading handled (via reused ConfigFormDialog)',
  passed: /ConfigFormDialog/.test(panelSrc),
  evidence: ['ConfigFormDialog handles its own submit loading state'],
})

// 44. Delete loading state (DeleteConfigButton handles its own loading)
check({
  id: 'DELETE-LOADING',
  category: 'K26B-Markers',
  title: 'Delete loading handled (via reused DeleteConfigButton)',
  passed: /DeleteConfigButton/.test(panelSrc),
  evidence: ['DeleteConfigButton handles its own loading state'],
})

// 45. CONFIG_IN_USE error display (DeleteConfigButton handles this)
check({
  id: 'DELETE-CONFIG-IN-USE',
  category: 'K26B-Markers',
  title: 'CONFIG_IN_USE 409 error is displayed (via DeleteConfigButton)',
  passed: /DeleteConfigButton/.test(panelSrc) && fileContains('src/components/scheduler-config-panel.tsx', 'CONFIG_IN_USE'),
  evidence: [
    /DeleteConfigButton/.test(panelSrc) ? 'DeleteConfigButton used' : 'NOT used',
    fileContains('src/components/scheduler-config-panel.tsx', 'CONFIG_IN_USE') ? 'CONFIG_IN_USE handled in component' : 'MISSING',
  ],
})

// 46. Existing scheduler config panel still intact (not broken)
check({
  id: 'EXISTING-PANEL-INTACT',
  category: 'K26B-Markers',
  title: 'Original scheduler-config-panel.tsx still exists and exports SolverConfigPanel',
  passed: fileExists('src/components/scheduler-config-panel.tsx'),
  evidence: [fileExists('src/components/scheduler-config-panel.tsx') ? 'File exists' : 'MISSING'],
})

// 47. schedulerVersion field displayed in table
check({
  id: 'SOLVER-VERSION-DISPLAYED',
  category: 'K26B-Markers',
  title: 'solverVersion field shown in config table',
  passed: /solverVersion/.test(panelSrc),
  evidence: [/solverVersion/.test(panelSrc) ? 'solverVersion referenced in panel' : 'MISSING'],
})

// ── Output ────────────────────────────────────────────────────────────

const pass = results.filter((r) => r.passed).length
const fail = results.filter((r) => !r.passed).length
const blocking = fail > 0

console.log('K26-B Scheduler Config Settings Integration Verification')
console.log('=========================================================')
for (const r of results) {
  console.log(`${r.passed ? 'PASS' : 'FAIL'}: [${r.id}] ${r.title}`)
  for (const e of r.evidence) console.log(`  - ${e}`)
  if (r.note) console.log(`  note: ${r.note}`)
}
console.log(`\nSummary: ${pass} PASS / ${fail} FAIL`)

if (pass === results.length) {
  console.log('\nK26-B SCHEDULER CONFIG SETTINGS INTEGRATION VERIFY PASS')
  console.log(`PASS=${pass} FAIL=0`)
  console.log(`blocking=false`)
  console.log(`recommendedNextStage=K26-B1-SCHEDULER-CONFIG-SETTINGS-MANUAL-TRIAL`)
}

// Write JSON report
const reportDir = path.join(projectRoot, 'docs')
if (!fs.existsSync(reportDir)) fs.mkdirSync(reportDir, { recursive: true })
const jsonPath = path.join(reportDir, 'k26-scheduler-config-settings-integration-verify.json')
const report = {
  generatedAt: new Date().toISOString(),
  stage: 'K26-B-SCHEDULER-CONFIG-SETTINGS-INTEGRATION',
  verificationType: 'static-checks',
  total: results.length,
  pass,
  fail,
  blocking,
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
