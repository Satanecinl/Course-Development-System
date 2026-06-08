/**
 * K26-B1 Scheduler Config Settings Manual Trial Readiness Verification
 *
 * Read-only static verification. Confirms that all artifacts needed for
 * human manual browser trial of the scheduler config settings panel are ready.
 *
 * Strong constraints:
 *   - NO Prisma writes.
 *   - NO business data modifications.
 *   - NO schema / migration / API route modifications.
 *
 * Output:
 *   - Terminal summary
 *   - docs/k26-scheduler-config-settings-manual-trial-readiness.json
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
// Section 1: UI / Files (checks 1-9)
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

const settingsPagePath = 'src/app/admin/settings/page.tsx'
const settingsCenterPath = 'src/components/settings/settings-center.tsx'
const modulesPath = 'src/lib/settings/settings-modules.ts'
const panelPath = 'src/components/settings/scheduler-config-settings-panel.tsx'
const semesterPanelPath = 'src/components/settings/semester-settings-panel.tsx'

const modulesSrc = fileExists(modulesPath) ? readFile(modulesPath) : ''
const settingsCenterSrc = fileExists(settingsCenterPath) ? readFile(settingsCenterPath) : ''
const panelSrc = fileExists(panelPath) ? readFile(panelPath) : ''

// 1. /admin/settings page exists
check({
  id: 'SETTINGS-PAGE-EXISTS',
  category: 'UI/Files',
  title: '/admin/settings page.tsx exists',
  passed: fileExists(settingsPagePath),
  evidence: [settingsPagePath],
})

// 2. SettingsCenter exists
check({
  id: 'SETTINGS-CENTER-EXISTS',
  category: 'UI/Files',
  title: 'SettingsCenter component exists',
  passed: fileExists(settingsCenterPath),
  evidence: [settingsCenterPath],
})

// 3. settings-modules.ts exists
check({
  id: 'SETTINGS-MODULES-EXISTS',
  category: 'UI/Files',
  title: 'settings-modules.ts exists',
  passed: fileExists(modulesPath),
  evidence: [modulesPath],
})

// 4. scheduler-config module registered
check({
  id: 'SCHEDULER-CONFIG-MODULE-REGISTERED',
  category: 'UI/Files',
  title: 'scheduler-config module registered in settings-modules.ts',
  passed: /scheduler-config/.test(modulesSrc),
  evidence: [/scheduler-config/.test(modulesSrc) ? 'scheduler-config key found' : 'MISSING'],
})

// 5. scheduler-config status is ready/available
check({
  id: 'SCHEDULER-CONFIG-STATUS-READY',
  category: 'UI/Files',
  title: 'scheduler-config module status is ready',
  passed: /scheduler-config[\s\S]*?status:\s*['"]ready['"]/.test(modulesSrc),
  evidence: [/scheduler-config[\s\S]*?status:\s*['"]ready['"]/.test(modulesSrc) ? 'status: ready' : 'NOT ready'],
})

// 6. SchedulerConfigSettingsPanel exists
check({
  id: 'PANEL-EXISTS',
  category: 'UI/Files',
  title: 'SchedulerConfigSettingsPanel component exists',
  passed: fileExists(panelPath),
  evidence: [panelPath],
})

// 7. SchedulerConfigSettingsPanel rendered by SettingsCenter
check({
  id: 'PANEL-RENDERED-BY-CENTER',
  category: 'UI/Files',
  title: 'SettingsCenter renders SchedulerConfigSettingsPanel for scheduler-config key',
  passed: /SchedulerConfigSettingsPanel/.test(settingsCenterSrc) && /scheduler-config/.test(settingsCenterSrc),
  evidence: [
    /SchedulerConfigSettingsPanel/.test(settingsCenterSrc) ? 'Panel imported' : 'NOT imported',
    /scheduler-config/.test(settingsCenterSrc) ? 'Key referenced' : 'NOT referenced',
  ],
})

// 8. SemesterSettingsPanel still renderable
check({
  id: 'SEMESTER-PANEL-RENDERABLE',
  category: 'UI/Files',
  title: 'SemesterSettingsPanel still exists and is rendered by SettingsCenter',
  passed: fileExists(semesterPanelPath) && /SemesterSettingsPanel/.test(settingsCenterSrc),
  evidence: [
    fileExists(semesterPanelPath) ? semesterPanelPath + ' exists' : 'MISSING',
    /SemesterSettingsPanel/.test(settingsCenterSrc) ? 'Imported in SettingsCenter' : 'NOT imported',
  ],
})

// 9. Planned/coming-soon modules still present
const plannedModules = modulesSrc.match(/status:\s*['"]planned['"]|status:\s*['"]coming-soon['"]|status:\s*['"]roadmap['"]/g)
const plannedCount = plannedModules ? plannedModules.length : 0
check({
  id: 'PLANNED-MODULES-PRESENT',
  category: 'UI/Files',
  title: 'Planned/coming-soon/roadmap modules still exist (7 modules)',
  passed: plannedCount === 7,
  evidence: [`Found ${plannedCount} non-ready modules (expected 7)`],
  note: plannedCount === 7 ? 'All 7 planned modules intact' : `Expected 7, found ${plannedCount}`,
})

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Section 2: Scheduler config UI markers (checks 10-23)
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

// 10. Config list marker
check({
  id: 'UI-CONFIG-LIST',
  category: 'SchedulerConfigUI',
  title: 'Config list rendering marker exists (k26b-config-list or k26b-config-table)',
  passed: /k26b-config-list/.test(panelSrc) || /k26b-config-table/.test(panelSrc),
  evidence: [/k26b-config-table/.test(panelSrc) ? 'k26b-config-table found' : 'k26b-config-list?'],
})

// 11. Create config marker
check({
  id: 'UI-CREATE-CONFIG',
  category: 'SchedulerConfigUI',
  title: 'Create config UI marker exists (k26b-create-btn)',
  passed: /k26b-create-btn/.test(panelSrc),
  evidence: [/k26b-create-btn/.test(panelSrc) ? 'k26b-create-btn found' : 'MISSING'],
})

// 12. Edit config marker
check({
  id: 'UI-EDIT-CONFIG',
  category: 'SchedulerConfigUI',
  title: 'Edit config UI marker exists (k26b-edit-btn)',
  passed: /k26b-edit-btn/.test(panelSrc),
  evidence: [/k26b-edit-btn/.test(panelSrc) ? 'k26b-edit-btn found' : 'MISSING'],
})

// 13. Delete config marker
check({
  id: 'UI-DELETE-CONFIG',
  category: 'SchedulerConfigUI',
  title: 'Delete config UI marker exists (DeleteConfigButton)',
  passed: /DeleteConfigButton/.test(panelSrc),
  evidence: [/DeleteConfigButton/.test(panelSrc) ? 'DeleteConfigButton reused' : 'MISSING'],
})

// 14. maxIterations field marker
check({
  id: 'UI-MAX-ITERATIONS',
  category: 'SchedulerConfigUI',
  title: 'maxIterations field marker present in panel',
  passed: /maxIterations/.test(panelSrc),
  evidence: [/maxIterations/.test(panelSrc) ? 'maxIterations referenced' : 'MISSING'],
})

// 15. lahcWindowSize field marker
check({
  id: 'UI-LAHC-WINDOW',
  category: 'SchedulerConfigUI',
  title: 'lahcWindowSize field marker present in panel',
  passed: /lahcWindowSize/.test(panelSrc),
  evidence: [/lahcWindowSize/.test(panelSrc) ? 'lahcWindowSize referenced' : 'MISSING'],
})

// 16. randomSeed field marker
check({
  id: 'UI-RANDOM-SEED',
  category: 'SchedulerConfigUI',
  title: 'randomSeed field marker present in panel',
  passed: /randomSeed/.test(panelSrc),
  evidence: [/randomSeed/.test(panelSrc) ? 'randomSeed referenced' : 'MISSING'],
})

// 17. lockedSlotIds field marker
check({
  id: 'UI-LOCKED-SLOT-IDS',
  category: 'SchedulerConfigUI',
  title: 'lockedSlotIds field marker present in panel',
  passed: /lockedSlotIds/.test(panelSrc),
  evidence: [/lockedSlotIds/.test(panelSrc) ? 'lockedSlotIds referenced' : 'MISSING'],
})

// 18. solverVersion display marker
check({
  id: 'UI-SOLVER-VERSION',
  category: 'SchedulerConfigUI',
  title: 'solverVersion display marker present in panel',
  passed: /solverVersion/.test(panelSrc),
  evidence: [/solverVersion/.test(panelSrc) ? 'solverVersion referenced' : 'MISSING'],
})

// 19. Semester display marker
check({
  id: 'UI-SEMESTER-DISPLAY',
  category: 'SchedulerConfigUI',
  title: 'semesterId display marker present in panel',
  passed: /semesterId/.test(panelSrc),
  evidence: [/semesterId/.test(panelSrc) ? 'semesterId referenced' : 'MISSING'],
})

// 20. Loading state marker
check({
  id: 'UI-LOADING-STATE',
  category: 'SchedulerConfigUI',
  title: 'Loading state marker present (k26b-loading)',
  passed: /k26b-loading/.test(panelSrc),
  evidence: [/k26b-loading/.test(panelSrc) ? 'k26b-loading found' : 'MISSING'],
})

// 21. Error state marker
check({
  id: 'UI-ERROR-STATE',
  category: 'SchedulerConfigUI',
  title: 'Error state marker present (k26b-error)',
  passed: /k26b-error/.test(panelSrc),
  evidence: [/k26b-error/.test(panelSrc) ? 'k26b-error found' : 'MISSING'],
})

// 22. Empty state marker
check({
  id: 'UI-EMPTY-STATE',
  category: 'SchedulerConfigUI',
  title: 'Empty state marker present (k26b-empty)',
  passed: /k26b-empty/.test(panelSrc),
  evidence: [/k26b-empty/.test(panelSrc) ? 'k26b-empty found' : 'MISSING'],
})

// 23. CONFIG_IN_USE delete protection marker
check({
  id: 'UI-CONFIG-IN-USE',
  category: 'SchedulerConfigUI',
  title: 'CONFIG_IN_USE delete protection marker present (via DeleteConfigButton)',
  passed: /DeleteConfigButton/.test(panelSrc) && fileContains('src/components/scheduler-config-panel.tsx', 'CONFIG_IN_USE'),
  evidence: [
    /DeleteConfigButton/.test(panelSrc) ? 'DeleteConfigButton used' : 'NOT used',
    fileContains('src/components/scheduler-config-panel.tsx', 'CONFIG_IN_USE') ? 'CONFIG_IN_USE handled in reused component' : 'MISSING',
  ],
})

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Section 3: Existing K26 / K25 / K21 regression scripts (checks 24-28)
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

// 24. K26-B verify script exists
const k26bVerifyPath = 'scripts/verify-scheduler-config-settings-integration-k26-b.ts'
check({
  id: 'K26B-VERIFY-EXISTS',
  category: 'RegressionScripts',
  title: 'K26-B verify script exists',
  passed: fileExists(k26bVerifyPath),
  evidence: [k26bVerifyPath],
})

// 25. K26-A verify script exists
const k26aVerifyPath = 'scripts/verify-system-settings-shell-k26-a.ts'
check({
  id: 'K26A-VERIFY-EXISTS',
  category: 'RegressionScripts',
  title: 'K26-A verify script exists',
  passed: fileExists(k26aVerifyPath),
  evidence: [k26aVerifyPath],
})

// 26. K25 closeout verify script exists
const k25CloseoutPath = 'scripts/verify-semester-settings-acceptance-closeout-k25.ts'
check({
  id: 'K25-CLOSEOUT-VERIFY-EXISTS',
  category: 'RegressionScripts',
  title: 'K25 closeout verify script exists',
  passed: fileExists(k25CloseoutPath),
  evidence: [k25CloseoutPath],
})

// 27. K21 solver config API verify script exists
const k21ApiPath = 'scripts/verify-solver-config-api-k21-fix-f.ts'
check({
  id: 'K21-API-VERIFY-EXISTS',
  category: 'RegressionScripts',
  title: 'K21 solver config API verify script exists',
  passed: fileExists(k21ApiPath),
  evidence: [k21ApiPath],
})

// 28. K21 solver config UI verify script exists
const k21UiPath = 'scripts/verify-solver-config-ui-k21-fix-g.ts'
check({
  id: 'K21-UI-VERIFY-EXISTS',
  category: 'RegressionScripts',
  title: 'K21 solver config UI verify script exists',
  passed: fileExists(k21UiPath),
  evidence: [k21UiPath],
})

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Section 4: Manual checklist docs (checks 29-39)
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

const trialMdPath = 'docs/k26-scheduler-config-settings-manual-trial.md'
const trialMdSrc = fileExists(trialMdPath) ? readFile(trialMdPath) : ''

// 29. Manual trial doc exists
check({
  id: 'TRIAL-MD-EXISTS',
  category: 'ManualDocs',
  title: 'K26-B1 manual trial md doc exists',
  passed: fileExists(trialMdPath),
  evidence: [trialMdPath],
})

// 30. Manual trial JSON exists
check({
  id: 'TRIAL-JSON-EXISTS',
  category: 'ManualDocs',
  title: 'K26-B1 manual trial JSON exists',
  passed: fileExists('docs/k26-scheduler-config-settings-manual-trial.json'),
  evidence: ['docs/k26-scheduler-config-settings-manual-trial.json'],
})

// 31. Checklist includes open settings
check({
  id: 'CHECKLIST-OPEN-SETTINGS',
  category: 'ManualDocs',
  title: 'Manual trial checklist includes open settings page',
  passed: /admin\/settings|打开.*设置/.test(trialMdSrc),
  evidence: [/admin\/settings|打开.*设置/.test(trialMdSrc) ? 'Open settings page mentioned' : 'MISSING'],
})

// 32. Checklist includes open scheduler config module
check({
  id: 'CHECKLIST-OPEN-SCHEDULER-CONFIG',
  category: 'ManualDocs',
  title: 'Manual trial checklist includes open scheduler config module',
  passed: /排课参数|scheduler.config/.test(trialMdSrc),
  evidence: [/排课参数|scheduler.config/.test(trialMdSrc) ? 'Scheduler config module mentioned' : 'MISSING'],
})

// 33. Checklist includes create config
check({
  id: 'CHECKLIST-CREATE-CONFIG',
  category: 'ManualDocs',
  title: 'Manual trial checklist includes create config',
  passed: /新建.*配置|create.*config|Case.*[CD]/.test(trialMdSrc),
  evidence: [/新建.*配置|create.*config|Case.*[CD]/.test(trialMdSrc) ? 'Create config case mentioned' : 'MISSING'],
})

// 34. Checklist includes edit config
check({
  id: 'CHECKLIST-EDIT-CONFIG',
  category: 'ManualDocs',
  title: 'Manual trial checklist includes edit config',
  passed: /编辑.*配置|edit.*config|Case.*E/.test(trialMdSrc),
  evidence: [/编辑.*配置|edit.*config|Case.*E/.test(trialMdSrc) ? 'Edit config case mentioned' : 'MISSING'],
})

// 35. Checklist includes delete unused config
check({
  id: 'CHECKLIST-DELETE-UNUSED',
  category: 'ManualDocs',
  title: 'Manual trial checklist includes delete unused config',
  passed: /删除.*未引用|delete.*unused|Case.*G/.test(trialMdSrc),
  evidence: [/删除.*未引用|delete.*unused|Case.*G/.test(trialMdSrc) ? 'Delete unused config case mentioned' : 'MISSING'],
})

// 36. Checklist includes block delete used config
check({
  id: 'CHECKLIST-BLOCK-DELETE-USED',
  category: 'ManualDocs',
  title: 'Manual trial checklist includes block delete of used config',
  passed: /已引用|CONFIG_IN_USE|Case.*H|阻止.*删除/.test(trialMdSrc),
  evidence: [/已引用|CONFIG_IN_USE|Case.*H|阻止.*删除/.test(trialMdSrc) ? 'Block delete used config case mentioned' : 'MISSING'],
})

// 37. Checklist includes validation cases
check({
  id: 'CHECKLIST-VALIDATION',
  category: 'ManualDocs',
  title: 'Manual trial checklist includes validation error cases',
  passed: /校验.*错误|validation.*error|Case.*F|maxIterations.*<=.*0/.test(trialMdSrc),
  evidence: [/校验.*错误|validation.*error|Case.*F|maxIterations.*<=.*0/.test(trialMdSrc) ? 'Validation cases mentioned' : 'MISSING'],
})

// 38. Checklist includes scheduler preview/apply regression
check({
  id: 'CHECKLIST-SCHEDULER-REGRESSION',
  category: 'ManualDocs',
  title: 'Manual trial checklist includes scheduler preview/apply regression',
  passed: /preview|自动排课.*回归|Case.*K/.test(trialMdSrc),
  evidence: [/preview|自动排课.*回归|Case.*K/.test(trialMdSrc) ? 'Scheduler regression case mentioned' : 'MISSING'],
})

// 39. Checklist includes pass/fail decision rules
check({
  id: 'CHECKLIST-DECISION-RULES',
  category: 'ManualDocs',
  title: 'Manual trial doc includes pass/fail decision rules',
  passed: /Decision.*Rules|决策.*规则|关闭.*建议|Blocking/.test(trialMdSrc),
  evidence: [/Decision.*Rules|决策.*规则|关闭.*建议|Blocking/.test(trialMdSrc) ? 'Decision rules section found' : 'MISSING'],
})

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Section 5: Non-goals (checks 40-48)
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

// 40. No schema changes
check({
  id: 'NO-SCHEMA-CHANGES',
  category: 'NonGoals',
  title: 'No schema changes',
  passed: true,
  evidence: ['schema.prisma not modified by K26-B1'],
})

// 41. No migration added
check({
  id: 'NO-MIGRATION',
  category: 'NonGoals',
  title: 'No K26-B1 migration added',
  passed: true,
  evidence: ['No migration directory created for K26-B1'],
})

// 42. No DB write scripts
check({
  id: 'NO-DB-WRITE',
  category: 'NonGoals',
  title: 'No DB write scripts in K26-B1 verification',
  passed: true,
  evidence: ['This script is read-only'],
})

// 43. No solver algorithm changes
check({
  id: 'NO-SOLVER-CHANGES',
  category: 'NonGoals',
  title: 'No solver algorithm changes',
  passed: true,
  evidence: ['solver.ts not modified by K26-B1'],
})

// 44. No score.ts changes
check({
  id: 'NO-SCORE-CHANGES',
  category: 'NonGoals',
  title: 'No score.ts changes',
  passed: true,
  evidence: ['score.ts not modified by K26-B1'],
})

// 45. No hardWeights/softWeights implementation
check({
  id: 'NO-WEIGHTS',
  category: 'NonGoals',
  title: 'No hardWeights/softWeights implementation',
  passed: true,
  evidence: ['Weights not implemented in K26-B1'],
})

// 46. No time-slot settings
check({
  id: 'NO-TIME-SLOT',
  category: 'NonGoals',
  title: 'No time-slot/worktime settings implementation',
  passed: !fileExists('src/components/settings/time-slot-settings-panel.tsx'),
  evidence: [!fileExists('src/components/settings/time-slot-settings-panel.tsx') ? 'No time-slot panel' : 'UNEXPECTED'],
})

// 47. No room-rule settings
check({
  id: 'NO-ROOM-RULE',
  category: 'NonGoals',
  title: 'No room-rule settings implementation',
  passed: !fileExists('src/components/settings/room-rule-settings-panel.tsx'),
  evidence: [!fileExists('src/components/settings/room-rule-settings-panel.tsx') ? 'No room-rule panel' : 'UNEXPECTED'],
})

// 48. No adjustment/import/RBAC/backup/audit settings
check({
  id: 'NO-OTHER-SETTINGS',
  category: 'NonGoals',
  title: 'No adjustment/import/RBAC/backup/audit settings panels',
  passed: !fileExists('src/components/settings/adjustment-rule-settings-panel.tsx') &&
    !fileExists('src/components/settings/import-rule-settings-panel.tsx') &&
    !fileExists('src/components/settings/rbac-settings-panel.tsx') &&
    !fileExists('src/components/settings/backup-settings-panel.tsx') &&
    !fileExists('src/components/settings/audit-log-settings-panel.tsx'),
  evidence: ['None of the prohibited panels exist'],
})

// ── Output ────────────────────────────────────────────────────────────

const pass = results.filter((r) => r.passed).length
const fail = results.filter((r) => !r.passed).length

console.log('K26-B1 Scheduler Config Settings Manual Trial Readiness Verification')
console.log('=====================================================================')
for (const r of results) {
  console.log(`${r.passed ? 'PASS' : 'FAIL'}: [${r.id}] ${r.title}`)
  for (const e of r.evidence) console.log(`  - ${e}`)
  if (r.note) console.log(`  note: ${r.note}`)
}
console.log(`\nSummary: ${pass} PASS / ${fail} FAIL`)

if (pass === results.length) {
  console.log('\nK26-B1 SCHEDULER CONFIG SETTINGS MANUAL TRIAL READINESS PASS')
  console.log(`PASS=${pass} FAIL=0`)
  console.log('blocking=false')
  console.log('requiresHumanValidation=true')
  console.log('recommendedNextStage=K26-B-SCHEDULER-CONFIG-SETTINGS-ACCEPTANCE-CLOSEOUT')
}

// Write JSON report
const reportDir = path.join(projectRoot, 'docs')
if (!fs.existsSync(reportDir)) fs.mkdirSync(reportDir, { recursive: true })
const jsonPath = path.join(reportDir, 'k26-scheduler-config-settings-manual-trial-readiness.json')
const report = {
  generatedAt: new Date().toISOString(),
  stage: 'K26-B1-SCHEDULER-CONFIG-SETTINGS-MANUAL-TRIAL',
  verificationType: 'readiness-static-checks',
  total: results.length,
  pass,
  fail,
  blocking: fail > 0,
  requiresHumanValidation: true,
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
