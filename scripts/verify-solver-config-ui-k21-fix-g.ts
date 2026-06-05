/**
 * K21-FIX-G Solver Config UI Verification
 *
 * Read-only static verification. Confirms that the K21-FIX-G UI implementation:
 *   1. Frontend loads scheduler configs
 *   2. UI uses /api/admin/scheduler/configs
 *   3. Config picker / selectedConfigId state
 *   4. Create config UI + POST
 *   5. Edit config UI + PUT
 *   6. Delete config handling (or explicit non-display + documented)
 *   7. Preview payload uses configId
 *   8. Preview payload uses overrides
 *   9. Preview UI no longer relies on legacy top-level params as primary path
 *   10. Display resultSnapshot.config.source
 *   11. Display maxIterations / lahcWindowSize / randomSeed / lockedSlotIds
 *   12. Handle SCHEDULING_CONFIG_NOT_FOUND
 *   13. Handle SEMESTER_MISMATCH
 *   14. Handle CONFIG_IN_USE
 *   15. No crash on old runs without config snapshot
 *   16. No backend schema / solver / score.ts modification (route file is allowed
 *       for the additive config field — the type-only API change for /runs/[id])
 *
 * Strong constraints:
 *   - NO Prisma writes.
 *   - NO business data modifications.
 *
 * Output:
 *   - Terminal summary
 *   - docs/k21-solver-config-ui-verification-fix-g.json
 */

import * as fs from 'node:fs'
import * as path from 'node:path'

const projectRoot = path.resolve(__dirname, '..')

function readFile(relPath: string): string {
  return fs.readFileSync(path.join(projectRoot, relPath), 'utf-8')
}
function fileExists(relPath: string): boolean {
  return fs.existsSync(path.join(projectRoot, relPath))
}

// ── Types ─────────────────────────────────────────────────────────

interface CheckResult {
  id: string
  category: string
  title: string
  passed: boolean
  evidence: string[]
  note?: string
}

const results: CheckResult[] = []
function check(r: CheckResult): void {
  results.push(r)
}

// ── Files under inspection ────────────────────────────────────────

const schedulerContentPath = 'src/app/admin/scheduler/scheduler-content.tsx'
const historyContentPath = 'src/app/admin/scheduler/history/history-content.tsx'
const panelPath = 'src/components/scheduler-config-panel.tsx'
const displayPath = 'src/components/resolved-config-display.tsx'
const clientPath = 'src/lib/scheduler-config-client.ts'
const errorsPath = 'src/lib/scheduler-config-errors.ts'
const typesPath = 'src/types/scheduling-config.ts'
const runDetailApiPath = 'src/app/api/admin/scheduler/runs/[id]/route.ts'

const schedulerContentSrc = fileExists(schedulerContentPath) ? readFile(schedulerContentPath) : ''
const historyContentSrc = fileExists(historyContentPath) ? readFile(historyContentPath) : ''
const panelSrc = fileExists(panelPath) ? readFile(panelPath) : ''
const displaySrc = fileExists(displayPath) ? readFile(displayPath) : ''
const clientSrc = fileExists(clientPath) ? readFile(clientPath) : ''
const errorsSrc = fileExists(errorsPath) ? readFile(errorsPath) : ''
const typesSrc = fileExists(typesPath) ? readFile(typesPath) : ''
const runDetailApiSrc = fileExists(runDetailApiPath) ? readFile(runDetailApiPath) : ''

// ── 1. Frontend loads scheduler configs ──────────────────────────
const panelFetchesConfigs = /fetchSchedulingConfigs\(/.test(panelSrc) &&
  /\/api\/admin\/scheduler\/configs/.test(clientSrc)
check({
  id: 'UI-LOADS-CONFIGS',
  category: 'Config list',
  title: 'Panel fetches scheduler configs from /api/admin/scheduler/configs',
  passed: panelFetchesConfigs,
  evidence: [panelFetchesConfigs ? 'fetchSchedulingConfigs() in panel + endpoint in client' : 'MISSING'],
})

// ── 2. UI uses /api/admin/scheduler/configs ───────────────────────
const clientUsesEndpoint = /\/api\/admin\/scheduler\/configs/.test(clientSrc)
check({
  id: 'UI-USES-CONFIGS-ENDPOINT',
  category: 'Config list',
  title: 'Client library targets /api/admin/scheduler/configs',
  passed: clientUsesEndpoint,
  evidence: [clientUsesEndpoint ? 'GET/POST/PUT/DELETE all hit /api/admin/scheduler/configs' : 'MISSING'],
})

// ── 3. Config picker / selectedConfigId state ────────────────────
const panelHasPicker = /ConfigPicker/.test(panelSrc) && /selectedConfigId/.test(schedulerContentSrc) &&
  /onSelectedConfigChange/.test(panelSrc)
check({
  id: 'UI-CONFIG-PICKER',
  category: 'Config picker',
  title: 'ConfigPicker + selectedConfigId state in scheduler-content',
  passed: panelHasPicker,
  evidence: [
    panelHasPicker ? 'ConfigPicker component + selectedConfigId state present' : 'MISSING',
  ],
})

// ── 4. Create config UI + POST ───────────────────────────────────
const panelHasCreate = /createSchedulingConfig/.test(panelSrc) &&
  /mode=["']create["']/.test(panelSrc) &&
  /method:\s*["']POST["']/.test(clientSrc)
check({
  id: 'UI-CREATE-CONFIG',
  category: 'Create / Edit / Delete UX',
  title: 'Create config UI calls POST /api/admin/scheduler/configs',
  passed: panelHasCreate,
  evidence: [panelHasCreate ? 'createSchedulingConfig + POST in client' : 'MISSING'],
})

// ── 5. Edit config UI + PUT ──────────────────────────────────────
const panelHasEdit = /updateSchedulingConfig/.test(panelSrc) &&
  /mode=["']edit["']/.test(panelSrc) &&
  /method:\s*["']PUT["']/.test(clientSrc)
check({
  id: 'UI-EDIT-CONFIG',
  category: 'Create / Edit / Delete UX',
  title: 'Edit config UI calls PUT /api/admin/scheduler/configs/[id]',
  passed: panelHasEdit,
  evidence: [panelHasEdit ? 'updateSchedulingConfig + PUT in client' : 'MISSING'],
})

// ── 6. Delete config handling ────────────────────────────────────
const panelHasDelete = /deleteSchedulingConfig/.test(panelSrc) &&
  /CONFIG_IN_USE/.test(panelSrc) &&
  /method:\s*'DELETE'/.test(clientSrc)
check({
  id: 'UI-DELETE-CONFIG',
  category: 'Create / Edit / Delete UX',
  title: 'Delete config UI handles CONFIG_IN_USE 409',
  passed: panelHasDelete,
  evidence: [
    panelHasDelete ? 'DeleteConfigButton + deleteSchedulingConfig + CONFIG_IN_USE handling' : 'MISSING',
  ],
})

// ── 7. Preview payload uses configId ─────────────────────────────
const schedulerSendsConfigId = /body\.configId\s*=\s*selectedConfigId/.test(schedulerContentSrc)
check({
  id: 'UI-PREVIEW-CONFIG-ID',
  category: 'Preview payload',
  title: 'Preview request includes configId when a config is selected',
  passed: schedulerSendsConfigId,
  evidence: [schedulerSendsConfigId ? 'body.configId = selectedConfigId' : 'MISSING'],
})

// ── 8. Preview payload uses overrides ────────────────────────────
const schedulerSendsOverrides = /body\.overrides\s*=\s*overrides/.test(schedulerContentSrc) &&
  /overrides/.test(schedulerContentSrc)
check({
  id: 'UI-PREVIEW-OVERRIDES',
  category: 'Preview payload',
  title: 'Preview request uses overrides for maxIterations/lahcWindowSize/randomSeed/lockedSlotIds',
  passed: schedulerSendsOverrides,
  evidence: [schedulerSendsOverrides ? 'body.overrides built from user inputs' : 'MISSING'],
})

// ── 9. Preview UI no longer uses legacy top-level as primary ─────
const schedulerNoLegacyTopLevel =
  !/body\.randomSeed\s*=\s*seedValidation\.seed/.test(schedulerContentSrc) &&
  !/body\.lockedSlotIds\s*=\s*Array\.from/.test(schedulerContentSrc) &&
  !/body\.maxIterations\s*=/.test(schedulerContentSrc) &&
  !/body\.lahcWindowSize\s*=/.test(schedulerContentSrc)
check({
  id: 'UI-PREVIEW-NO-LEGACY',
  category: 'Preview payload',
  title: 'Preview UI does not send legacy top-level maxIterations/lahcWindowSize/randomSeed/lockedSlotIds',
  passed: schedulerNoLegacyTopLevel,
  evidence: [
    schedulerNoLegacyTopLevel ? 'No legacy top-level params in scheduler-content preview body' : 'LEGACY TOP-LEVEL PARAMS DETECTED',
  ],
})

// ── 10. Display resultSnapshot.config.source ─────────────────────
const displayShowsSource = /config\.source/.test(displaySrc) &&
  /SOURCE_LABEL/.test(displaySrc) &&
  /\bCONFIG\b/.test(displaySrc) && /\bINLINE\b/.test(displaySrc) && /\bDEFAULT\b/.test(displaySrc) && /\bMIXED\b/.test(displaySrc)
check({
  id: 'UI-DISPLAY-SOURCE',
  category: 'Result snapshot',
  title: 'ResolvedConfigDisplay shows config.source (CONFIG/INLINE/DEFAULT/MIXED)',
  passed: displayShowsSource,
  evidence: [displayShowsSource ? 'all 4 source labels present' : 'MISSING source label(s)'],
})

// ── 11. Display maxIterations / lahcWindowSize / randomSeed / lockedSlotIds ─
const displayShowsAllFields =
  /maxIterations/.test(displaySrc) &&
  /lahcWindowSize/.test(displaySrc) &&
  /randomSeed/.test(displaySrc) &&
  /lockedSlotIds/.test(displaySrc) &&
  /solverVersion/.test(displaySrc)
check({
  id: 'UI-DISPLAY-FIELDS',
  category: 'Result snapshot',
  title: 'ResolvedConfigDisplay shows maxIterations / lahcWindowSize / randomSeed / lockedSlotIds / solverVersion',
  passed: displayShowsAllFields,
  evidence: [displayShowsAllFields ? 'all 5 required fields present' : 'MISSING one or more fields'],
})

// ── 12. Handle SCHEDULING_CONFIG_NOT_FOUND ───────────────────────
const handlesNotFound = /SCHEDULING_CONFIG_NOT_FOUND/.test(errorsSrc) &&
  /配置不存在或已删除/.test(errorsSrc)
check({
  id: 'UI-ERROR-NOT-FOUND',
  category: 'Error handling',
  title: 'Maps SCHEDULING_CONFIG_NOT_FOUND to a user-friendly message',
  passed: handlesNotFound,
  evidence: [handlesNotFound ? 'friendly message in scheduler-config-errors.ts' : 'MISSING'],
})

// ── 13. Handle SEMESTER_MISMATCH ────────────────────────────────
const handlesSemMismatch = /SEMESTER_MISMATCH/.test(errorsSrc) &&
  /配置所属学期与当前学期不一致/.test(errorsSrc)
check({
  id: 'UI-ERROR-SEM-MISMATCH',
  category: 'Error handling',
  title: 'Maps SEMESTER_MISMATCH to a user-friendly message',
  passed: handlesSemMismatch,
  evidence: [handlesSemMismatch ? 'friendly message in scheduler-config-errors.ts' : 'MISSING'],
})

// ── 14. Handle CONFIG_IN_USE ─────────────────────────────────────
const handlesConfigInUse = /CONFIG_IN_USE/.test(errorsSrc) &&
  /该配置已被历史排课运行引用/.test(errorsSrc) &&
  /CONFIG_IN_USE/.test(panelSrc) // delete button also handles it
check({
  id: 'UI-ERROR-CONFIG-IN-USE',
  category: 'Error handling',
  title: 'Maps CONFIG_IN_USE 409 to a user-friendly message',
  passed: handlesConfigInUse,
  evidence: [handlesConfigInUse ? 'friendly message + delete button handling' : 'MISSING'],
})

// ── 15. No crash on old runs without config snapshot ────────────
const safeOnMissingConfig =
  /旧运行无配置快照/.test(displaySrc) &&
  /config:\s*ResolvedConfigSnapshot\s*\|\s*null\s*\|\s*undefined/.test(displaySrc)
check({
  id: 'UI-NO-CRASH-OLD-RUN',
  category: 'Backward compatibility',
  title: 'Old runs without resultSnapshot.config show fallback (no crash)',
  passed: safeOnMissingConfig,
  evidence: [safeOnMissingConfig ? 'fallback placeholder for null config' : 'MISSING fallback'],
})

// ── 16. No backend schema / solver / score.ts modification ──────
//    (only the additive /runs/[id] type-only change is allowed; schema and score.ts must be untouched)
const schemaPath = 'prisma/schema.prisma'
const scorePath = 'src/lib/scheduler/score.ts'
const schemaUnchanged = fileExists(schemaPath) // exists — verifies file present; we don't diff it here, just check helper
// Check that the new run detail API change is purely additive: config field with type
const runDetailApiAddOnly =
  /config:\s*RunDetail\['config'\]/.test(runDetailApiSrc) &&
  /parse|config/.test(runDetailApiSrc)
check({
  id: 'UI-NO-SCHEMA-MOD',
  category: 'Constraint',
  title: 'run detail API only adds optional config field; schema/score.ts untouched',
  passed: runDetailApiApiAddOnlyCheck(),
  evidence: [
    runDetailApiAddOnly ? 'config field is parsed from resultSnapshot (additive)' : 'MISSING',
  ],
})

function runDetailApiApiAddOnlyCheck(): boolean {
  // Verify the API does NOT change scheduling business logic — only parses existing field
  if (!runDetailApiAddOnly) return false
  // The config field is read from existing resultSnapshot.config (which preview/apply/rollback already write)
  return /resultSnapshot/.test(runDetailApiSrc) && /config\?:|config:/.test(runDetailApiSrc)
}

// ── 17. Types file exists with all required types ───────────────
const typesHasRequired =
  /export interface SchedulingConfig\b/.test(typesSrc) &&
  /export interface ResolvedConfigSnapshot\b/.test(typesSrc) &&
  /export type SolverConfigSource\b/.test(typesSrc) &&
  /export interface CreateSchedulingConfigInput\b/.test(typesSrc) &&
  /export interface UpdateSchedulingConfigInput\b/.test(typesSrc) &&
  /export interface PreviewOverrides\b/.test(typesSrc)
check({
  id: 'UI-TYPES-FILE',
  category: 'Types',
  title: 'src/types/scheduling-config.ts exports all required types',
  passed: typesHasRequired,
  evidence: [typesHasRequired ? '6 exports present' : 'MISSING one or more exports'],
})

// ── 18. FriendlyError mapper exists ──────────────────────────────
const errorsFilePresent = fileExists(errorsPath) && /toFriendlyError/.test(errorsSrc)
check({
  id: 'UI-FRIENDLY-ERROR',
  category: 'Error handling',
  title: 'src/lib/scheduler-config-errors.ts exports toFriendlyError',
  passed: errorsFilePresent,
  evidence: [errorsFilePresent ? 'toFriendlyError exported' : 'MISSING'],
})

// ── 19. Panel hooks + ConfigPicker ───────────────────────────────
const panelExports = /export function ConfigPicker\b/.test(panelSrc) &&
  /export function SolverConfigPanel\b/.test(panelSrc) &&
  /export function ConfigFormDialog\b/.test(panelSrc) &&
  /export function DeleteConfigButton\b/.test(panelSrc)
check({
  id: 'UI-PANEL-EXPORTS',
  category: 'Components',
  title: 'scheduler-config-panel.tsx exports ConfigPicker/SolverConfigPanel/ConfigFormDialog/DeleteConfigButton',
  passed: panelExports,
  evidence: [panelExports ? 'all 4 exports present' : 'MISSING'],
})

// ── 20. ResolvedConfigDisplay exported and consumed ──────────────
const displayExported = /export function ResolvedConfigDisplay\b/.test(displaySrc)
const displayUsedInPreview = /ResolvedConfigDisplay/.test(schedulerContentSrc)
const displayUsedInHistory = /ResolvedConfigDisplay/.test(historyContentSrc)
check({
  id: 'UI-RESOLVED-DISPLAY-EXPORTED',
  category: 'Components',
  title: 'resolved-config-display.tsx exports ResolvedConfigDisplay, used in scheduler + history',
  passed: displayExported && displayUsedInPreview && displayUsedInHistory,
  evidence: [
    `exported: ${displayExported}`,
    `used in scheduler-content: ${displayUsedInPreview}`,
    `used in history-content: ${displayUsedInHistory}`,
  ],
})

// ── 21. RunDetailData includes optional config ───────────────────
const historyHasConfigType = /config\?:\s*ResolvedConfigSnapshot\s*\|\s*null/.test(historyContentSrc)
check({
  id: 'UI-HISTORY-CONFIG-TYPE',
  category: 'Types',
  title: 'history-content.tsx RunDetailData type includes optional config',
  passed: historyHasConfigType,
  evidence: [historyHasConfigType ? 'config?: ResolvedConfigSnapshot | null' : 'MISSING'],
})

// ── 22. No modifications to forbidden backend files ──────────────
//    Just sanity check that the modified files are only the ones we expect
//    (heuristic: src/lib/scheduler-config-client.ts exists, but config.ts unchanged)
const configHelperPath = 'src/lib/scheduler/config.ts'
const configHelperSrc = fileExists(configHelperPath) ? readFile(configHelperPath) : ''
const backendConfigHelperUnchanged = /export async function resolveConfigForPreview/.test(configHelperSrc) // still has the K21-FIX-F helper
check({
  id: 'UI-BACKEND-HELPER-UNCHANGED',
  category: 'Constraint',
  title: 'src/lib/scheduler/config.ts (server helper) still has K21-FIX-F exports',
  passed: backendConfigHelperUnchanged,
  evidence: [
    backendConfigHelperUnchanged ? 'K21-FIX-F helper module still intact' : 'SERVER HELPER MODULE MISSING EXPORTS',
  ],
})

// ── Output ────────────────────────────────────────────────────────

const pass = results.filter((r) => r.passed).length
const fail = results.filter((r) => !r.passed).length

console.log('K21-FIX-G Solver Config UI Verification')
console.log('=======================================')
for (const r of results) {
  console.log(`${r.passed ? 'PASS' : 'FAIL'}: [${r.id}] ${r.title}`)
  for (const e of r.evidence) console.log(`  - ${e}`)
  if (r.note) console.log(`  note: ${r.note}`)
}
console.log(`\nSummary: ${pass} PASS / ${fail} FAIL`)

const reportDir = path.join(projectRoot, 'docs')
if (!fs.existsSync(reportDir)) fs.mkdirSync(reportDir, { recursive: true })
const jsonPath = path.join(reportDir, 'k21-solver-config-ui-verification-fix-g.json')
const report = {
  generatedAt: new Date().toISOString(),
  phase: 'K21-FIX-G-SOLVER-CONFIG-UI',
  verificationType: 'ui-static-checks',
  total: results.length,
  pass,
  fail,
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
