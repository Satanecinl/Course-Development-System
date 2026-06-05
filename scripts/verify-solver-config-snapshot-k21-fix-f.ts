/**
 * K21-FIX-F Config Snapshot Reuse Verification
 *
 * Read-only verification. Confirms that:
 *   - preview writes resultSnapshot.config (maxIterations, lahcWindowSize, randomSeed, lockedSlotIds, solverVersion, source)
 *   - apply copies previewRun.resultSnapshot.config to applyRun.resultSnapshot
 *   - rollback copies applyRun.resultSnapshot.config to rollbackRun.resultSnapshot
 *   - existing resultSnapshot fields preserved
 *   - applyRun.configId = previewRun.configId
 *   - rollbackRun.configId = applyRun.configId
 *
 * Strong constraints:
 *   - NO Prisma writes.
 *   - NO business data modifications.
 *
 * Output:
 *   - Terminal summary
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

// ── Checks ────────────────────────────────────────────────────────────

const previewLibPath = 'src/lib/scheduler/preview.ts'
const applyLibPath = 'src/lib/scheduler/apply.ts'
const rollbackLibPath = 'src/lib/scheduler/rollback.ts'

const previewSrc = fileExists(previewLibPath) ? readFile(previewLibPath) : ''
const applySrc = fileExists(applyLibPath) ? readFile(applyLibPath) : ''
const rollbackSrc = fileExists(rollbackLibPath) ? readFile(rollbackLibPath) : ''

// 1. Preview resultSnapshot contains maxIterations/lahcWindowSize/randomSeed/lockedSlotIds/solverVersion/source
const hasMaxIter = /config:\s*options\.resolvedConfigSnapshot\s*\?\?[\s\S]*maxIterations/.test(previewSrc) ||
  /config:\s*\{[\s\S]*maxIterations/.test(previewSrc)
const hasLahc = /config:\s*[\s\S]*lahcWindowSize/.test(previewSrc)
const hasSeed = /config:\s*[\s\S]*randomSeed/.test(previewSrc)
const hasLocks = /config:\s*[\s\S]*lockedSlotIds/.test(previewSrc)
const hasSolverVersion = /config:\s*[\s\S]*solverVersion/.test(previewSrc)
const hasSource = /config:\s*[\s\S]*source/.test(previewSrc)

check({
  id: 'SNAP-PREVIEW-MAX-ITER',
  category: 'Preview resultSnapshot',
  title: 'Preview resultSnapshot.config contains maxIterations',
  passed: hasMaxIter,
  evidence: [hasMaxIter ? 'maxIterations in config' : 'MISSING'],
})
check({
  id: 'SNAP-PREVIEW-LAHC',
  category: 'Preview resultSnapshot',
  title: 'Preview resultSnapshot.config contains lahcWindowSize',
  passed: hasLahc,
  evidence: [hasLahc ? 'lahcWindowSize in config' : 'MISSING'],
})
check({
  id: 'SNAP-PREVIEW-SEED',
  category: 'Preview resultSnapshot',
  title: 'Preview resultSnapshot.config contains randomSeed',
  passed: hasSeed,
  evidence: [hasSeed ? 'randomSeed in config' : 'MISSING'],
})
check({
  id: 'SNAP-PREVIEW-LOCKS',
  category: 'Preview resultSnapshot',
  title: 'Preview resultSnapshot.config contains lockedSlotIds',
  passed: hasLocks,
  evidence: [hasLocks ? 'lockedSlotIds in config' : 'MISSING'],
})
check({
  id: 'SNAP-PREVIEW-VERSION',
  category: 'Preview resultSnapshot',
  title: 'Preview resultSnapshot.config contains solverVersion',
  passed: hasSolverVersion,
  evidence: [hasSolverVersion ? 'solverVersion in config' : 'MISSING'],
})
check({
  id: 'SNAP-PREVIEW-SOURCE',
  category: 'Preview resultSnapshot',
  title: 'Preview resultSnapshot.config contains source label',
  passed: hasSource,
  evidence: [hasSource ? 'source in config' : 'MISSING'],
})

// 2. Existing preview resultSnapshot fields still present
const hasScoreBefore = /scoreBefore/.test(previewSrc)
const hasHcBefore = /hcBefore/.test(previewSrc)
const hasProposedChanges = /proposedChanges/.test(previewSrc)
const hasSemester = /semesterId: semester\.id/.test(previewSrc)
check({
  id: 'SNAP-PREVIEW-PRESERVE-EXISTING',
  category: 'Backward compatibility',
  title: 'Existing resultSnapshot fields preserved (scoreBefore/hcBefore/proposedChanges/semester)',
  passed: hasScoreBefore && hasHcBefore && hasProposedChanges && hasSemester,
  evidence: [
    `scoreBefore: ${hasScoreBefore}`,
    `hcBefore: ${hasHcBefore}`,
    `proposedChanges: ${hasProposedChanges}`,
    `semesterId: ${hasSemester}`,
  ],
})

// 3. Apply copies preview's config snapshot forward
const applyCopiesConfig =
  /resultSnapshot:\s*JSON\.stringify\(\{[\s\S]*?\.\.\.\(snapshot\.config\s*\?\s*\{\s*config:\s*snapshot\.config\s*\}\s*:\s*\{\}\)/.test(
    applySrc,
  ) || /snapshot\.config\s*\?\s*\{\s*config:\s*snapshot\.config/.test(applySrc)
check({
  id: 'SNAP-APPLY-COPY-CONFIG',
  category: 'Apply snapshot reuse',
  title: 'apply.ts copies previewRun.resultSnapshot.config into applyRun.resultSnapshot',
  passed: applyCopiesConfig,
  evidence: [applyCopiesConfig ? 'config spread into apply resultSnapshot' : 'config not carried to apply'],
})

// 4. Apply runs from previewRun.configId
const applyReusesConfigId = /configId:\s*previewRun\.configId/.test(applySrc)
check({
  id: 'SNAP-APPLY-REUSE-CONFIG-ID',
  category: 'Apply config reuse',
  title: 'applyRun.configId = previewRun.configId',
  passed: applyReusesConfigId,
  evidence: [applyReusesConfigId ? 'configId reused' : 'configId not reused'],
})

// 5. Apply snapshot parses config sub-object
const applyParsesConfig = /snapshot\.config[\s\S]*?maxIterations[\s\S]*?lahcWindowSize/.test(applySrc) ||
  /config\?:\s*\{[\s\S]*?maxIterations[\s\S]*?lahcWindowSize/.test(applySrc)
check({
  id: 'SNAP-APPLY-PARSE-CONFIG',
  category: 'Apply snapshot reuse',
  title: 'apply.ts parses config sub-object from previewRun.resultSnapshot',
  passed: applyParsesConfig,
  evidence: [applyParsesConfig ? 'config type declared on snapshot' : 'config not parsed'],
})

// 6. Rollback copies apply's config snapshot forward
const rollbackCopiesConfig = /applyConfigSnapshot\s*\?\s*\{\s*config:\s*applyConfigSnapshot/.test(rollbackSrc)
check({
  id: 'SNAP-ROLLBACK-COPY-CONFIG',
  category: 'Rollback snapshot reuse',
  title: 'rollback.ts copies applyRun.resultSnapshot.config into rollbackRun.resultSnapshot',
  passed: rollbackCopiesConfig,
  evidence: [rollbackCopiesConfig ? 'config spread into rollback resultSnapshot' : 'config not carried to rollback'],
})

// 7. Rollback reads applyRun.resultSnapshot
const rollbackReadsApplySnapshot = /applyRun\.resultSnapshot/.test(rollbackSrc)
check({
  id: 'SNAP-ROLLBACK-READ-APPLY',
  category: 'Rollback snapshot reuse',
  title: 'rollback.ts reads applyRun.resultSnapshot',
  passed: rollbackReadsApplySnapshot,
  evidence: [rollbackReadsApplySnapshot ? 'reads applyRun.resultSnapshot' : 'MISSING'],
})

// 8. Rollback configId = applyRun.configId
const rollbackReusesConfigId = /configId:\s*applyRun\.configId/.test(rollbackSrc)
check({
  id: 'SNAP-ROLLBACK-REUSE-CONFIG-ID',
  category: 'Rollback config reuse',
  title: 'rollbackRun.configId = applyRun.configId',
  passed: rollbackReusesConfigId,
  evidence: [rollbackReusesConfigId ? 'configId reused from apply' : 'configId not reused'],
})

// 9. Helper serializeConfigForSnapshot exists
const helperPath = 'src/lib/scheduler/config.ts'
const helperSrc = fileExists(helperPath) ? readFile(helperPath) : ''
const hasSerialize = /export function serializeConfigForSnapshot/.test(helperSrc)
check({
  id: 'SNAP-HELPER-SERIALIZE',
  category: 'Helper',
  title: 'helper exports serializeConfigForSnapshot',
  passed: hasSerialize,
  evidence: [hasSerialize ? 'exported' : 'MISSING'],
})

// 10. Helper returns all required fields
const helperReturnsAllFields =
  /configId:\s*resolved\.configId/.test(helperSrc) &&
  /name:\s*resolved\.name/.test(helperSrc) &&
  /maxIterations:\s*resolved\.maxIterations/.test(helperSrc) &&
  /lahcWindowSize:\s*resolved\.lahcWindowSize/.test(helperSrc) &&
  /randomSeed:\s*resolved\.randomSeed/.test(helperSrc) &&
  /lockedSlotIds:\s*resolved\.lockedSlotIds/.test(helperSrc) &&
  /solverVersion:\s*resolved\.solverVersion/.test(helperSrc) &&
  /source:\s*resolved\.source/.test(helperSrc) &&
  /snapshotTakenAt:\s*resolved\.snapshotTakenAt/.test(helperSrc)

check({
  id: 'SNAP-HELPER-FIELDS',
  category: 'Helper',
  title: 'serializeConfigForSnapshot returns all 9 required fields',
  passed: helperReturnsAllFields,
  evidence: [helperReturnsAllFields ? 'all 9 fields returned' : 'one or more fields missing'],
})

// 11. Existing apply resultSnapshot fields preserved
const applyHasPostScore = /postScore/.test(applySrc)
const applyHasProposedChangesApplied = /proposedChangesApplied/.test(applySrc)
const applyHasPreviewRunId = /previewRunId:\s*previewRun\.id/.test(applySrc)
check({
  id: 'SNAP-APPLY-PRESERVE-EXISTING',
  category: 'Backward compatibility',
  title: 'Existing apply resultSnapshot fields preserved',
  passed: applyHasPostScore && applyHasProposedChangesApplied && applyHasPreviewRunId,
  evidence: [
    `postScore: ${applyHasPostScore}`,
    `proposedChangesApplied: ${applyHasProposedChangesApplied}`,
    `previewRunId: ${applyHasPreviewRunId}`,
  ],
})

// 12. Existing rollback resultSnapshot fields preserved
const rollbackHasPostScore = /postScore/.test(rollbackSrc)
const rollbackHasChangesRestored = /changesRestored/.test(rollbackSrc)
const rollbackHasApplyRunId = /applyRunId:\s*applyRun\.id/.test(rollbackSrc)
check({
  id: 'SNAP-ROLLBACK-PRESERVE-EXISTING',
  category: 'Backward compatibility',
  title: 'Existing rollback resultSnapshot fields preserved',
  passed: rollbackHasPostScore && rollbackHasChangesRestored && rollbackHasApplyRunId,
  evidence: [
    `postScore: ${rollbackHasPostScore}`,
    `changesRestored: ${rollbackHasChangesRestored}`,
    `applyRunId: ${rollbackHasApplyRunId}`,
  ],
})

// 13. apply does NOT receive new configId param
const applyRequestNoConfigId = !/configId\?:\s*number/.test(
  fileExists('src/app/api/admin/scheduler/apply/route.ts')
    ? readFile('src/app/api/admin/scheduler/apply/route.ts')
    : '',
)
check({
  id: 'SNAP-APPLY-NO-CONFIG-ID-PARAM',
  category: 'Constraint',
  title: 'apply route does not accept configId (only previewRunId)',
  passed: applyRequestNoConfigId,
  evidence: [applyRequestNoConfigId ? 'no configId in apply body' : 'configId leaked into apply body'],
})

// 14. rollback does NOT receive new configId param
const rollbackRequestNoConfigId = !/configId\?:\s*number/.test(
  fileExists('src/app/api/admin/scheduler/rollback/route.ts')
    ? readFile('src/app/api/admin/scheduler/rollback/route.ts')
    : '',
)
check({
  id: 'SNAP-ROLLBACK-NO-CONFIG-ID-PARAM',
  category: 'Constraint',
  title: 'rollback route does not accept configId (only applyRunId)',
  passed: rollbackRequestNoConfigId,
  evidence: [rollbackRequestNoConfigId ? 'no configId in rollback body' : 'configId leaked into rollback body'],
})

// ── Output ────────────────────────────────────────────────────────────

const pass = results.filter((r) => r.passed).length
const fail = results.filter((r) => !r.passed).length

console.log('K21-FIX-F Config Snapshot Reuse Verification')
console.log('=============================================')
for (const r of results) {
  console.log(`${r.passed ? 'PASS' : 'FAIL'}: [${r.id}] ${r.title}`)
  for (const e of r.evidence) console.log(`  - ${e}`)
  if (r.note) console.log(`  note: ${r.note}`)
}
console.log(`\nSummary: ${pass} PASS / ${fail} FAIL`)

if (fail > 0) {
  process.exit(1)
}
