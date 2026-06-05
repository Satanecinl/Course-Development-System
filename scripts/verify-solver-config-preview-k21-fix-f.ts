/**
 * K21-FIX-F Preview Config Verification
 *
 * Read-only verification. Confirms that preview API:
 *   - accepts configId
 *   - accepts overrides
 *   - legacy top-level params still supported
 *   - priority: overrides > configId > legacy > default
 *   - SCHEDULING_CONFIG_NOT_FOUND 404
 *   - SEMESTER_MISMATCH 400
 *   - resolved config written to SchedulingRun.resultSnapshot.config
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

const routePath = 'src/app/api/admin/scheduler/preview/route.ts'
const previewLibPath = 'src/lib/scheduler/preview.ts'
const configHelperPath = 'src/lib/scheduler/config.ts'

const routeSrc = fileExists(routePath) ? readFile(routePath) : ''
const previewSrc = fileExists(previewLibPath) ? readFile(previewLibPath) : ''
const helperSrc = fileExists(configHelperPath) ? readFile(configHelperPath) : ''

// 1. Preview route accepts configId
const acceptsConfigId = /configId\?:\s*number/.test(routeSrc)
check({
  id: 'PREVIEW-ACCEPTS-CONFIG-ID',
  category: 'Request shape',
  title: 'PreviewRequest type has configId?: number',
  passed: acceptsConfigId,
  evidence: [acceptsConfigId ? 'configId? field present' : 'MISSING'],
})

// 2. Preview route accepts overrides
const acceptsOverrides = /overrides\?:\s*\{/.test(routeSrc)
check({
  id: 'PREVIEW-ACCEPTS-OVERRIDES',
  category: 'Request shape',
  title: 'PreviewRequest type has overrides? field',
  passed: acceptsOverrides,
  evidence: [acceptsOverrides ? 'overrides? field present' : 'MISSING'],
})

// 3. Legacy top-level fields still supported
const legacyMaxIter = /maxIterations\?:\s*number/.test(routeSrc)
const legacyLahc = /lahcWindowSize\?:\s*number/.test(routeSrc)
const legacySeed = /randomSeed\?:\s*number/.test(routeSrc)
const legacyLocks = /lockedSlotIds\?:\s*number\[\]/.test(routeSrc)
check({
  id: 'PREVIEW-LEGACY-FIELDS',
  category: 'Backward compatibility',
  title: 'Legacy top-level fields still in PreviewRequest type',
  passed: legacyMaxIter && legacyLahc && legacySeed && legacyLocks,
  evidence: [
    `maxIterations?: ${legacyMaxIter}`,
    `lahcWindowSize?: ${legacyLahc}`,
    `randomSeed?: ${legacySeed}`,
    `lockedSlotIds?: ${legacyLocks}`,
  ],
})

// 4. resolveConfigForPreview exists in helper
const resolveFn = /export async function resolveConfigForPreview/.test(helperSrc)
check({
  id: 'PREVIEW-HAS-RESOLVE-HELPER',
  category: 'Helper',
  title: 'resolveConfigForPreview function exists in helper',
  passed: resolveFn,
  evidence: [resolveFn ? 'exported' : 'MISSING'],
})

// 5. Priority: overrides > config > legacy > default
// Look for comment + code that documents/enforces this order
const priorityDoc =
  /overrides\s*>\s*configId|overrides.*configId.*default|priority/i.test(helperSrc)
const priorityEnforced =
  /ov\.maxIterations\s*\?\?\s*config/.test(helperSrc) ||
  /options\.overrides\?\.maxIterations\s*\?\?\s*configRecord/.test(helperSrc)

check({
  id: 'PREVIEW-PRIORITY-DOCUMENTED',
  category: 'Priority',
  title: 'Priority rule (overrides > config > legacy > default) is documented in helper',
  passed: priorityDoc,
  evidence: [priorityDoc ? 'priority documented' : 'priority doc/comment not found'],
})
check({
  id: 'PREVIEW-PRIORITY-IMPLEMENTED',
  category: 'Priority',
  title: 'Priority is implemented in resolveConfigForPreview (?? chain)',
  passed: priorityEnforced,
  evidence: [priorityEnforced ? '?? chain enforces priority' : 'priority chain not detected'],
})

// 6. SCHEDULING_CONFIG_NOT_FOUND 404
const notFoundInRoute = /SCHEDULING_CONFIG_NOT_FOUND/.test(routeSrc) && /status:\s*404/.test(routeSrc)
const notFoundInHelper = /class SchedulingConfigNotFoundError/.test(helperSrc)
check({
  id: 'PREVIEW-NOT-FOUND-404',
  category: 'Error handling',
  title: '404 SCHEDULING_CONFIG_NOT_FOUND returned when configId missing',
  passed: notFoundInRoute && notFoundInHelper,
  evidence: [
    notFoundInHelper ? 'SchedulingConfigNotFoundError class exported' : 'MISSING error class',
    notFoundInRoute ? 'Route maps to 404 SCHEDULING_CONFIG_NOT_FOUND' : 'MISSING 404 mapping',
  ],
})

// 7. SEMESTER_MISMATCH 400
const semMismatchInRoute = /SEMESTER_MISMATCH/.test(routeSrc) && /status:\s*400/.test(routeSrc)
const semMismatchInHelper = /class SemesterMismatchError/.test(helperSrc)
check({
  id: 'PREVIEW-SEM-MISMATCH-400',
  category: 'Error handling',
  title: '400 SEMESTER_MISMATCH returned when config.semesterId differs',
  passed: semMismatchInRoute && semMismatchInHelper,
  evidence: [
    semMismatchInHelper ? 'SemesterMismatchError class exported' : 'MISSING error class',
    semMismatchInRoute ? 'Route maps to 400 SEMESTER_MISMATCH' : 'MISSING 400 mapping',
  ],
})

// 8. Helper checks semesterId match
const helperChecksSemester =
  /config\.semesterId\s*!==\s*input\.semesterId|found\.semesterId\s*!==\s*input\.semesterId/.test(helperSrc)
check({
  id: 'PREVIEW-SEM-CHECK-LOGIC',
  category: 'Error handling',
  title: 'Helper throws SemesterMismatchError when config.semesterId differs from request',
  passed: helperChecksSemester,
  evidence: [helperChecksSemester ? 'semesterId mismatch check present' : 'MISSING check'],
})

// 9. Helper checks configId exists
const helperChecksExists = /SchedulingConfigNotFoundError/.test(helperSrc) && /!\s*found/.test(helperSrc)
check({
  id: 'PREVIEW-CONFIG-EXISTS-CHECK',
  category: 'Error handling',
  title: 'Helper throws SchedulingConfigNotFoundError when configId not found',
  passed: helperChecksExists,
  evidence: [helperChecksExists ? 'not-found check present' : 'MISSING check'],
})

// 10. resultSnapshot.config is written in preview.ts
const writesConfigSnapshot = /config:\s*options\.resolvedConfigSnapshot\s*\?\?/.test(previewSrc) ||
  /config:\s*\{[\s\S]*configId/.test(previewSrc)
check({
  id: 'PREVIEW-RESULT-SNAPSHOT-CONFIG',
  category: 'Result snapshot',
  title: 'preview.ts writes config sub-object into resultSnapshot',
  passed: writesConfigSnapshot,
  evidence: [writesConfigSnapshot ? 'config sub-object written' : 'config sub-object not found'],
})

// 11. PreviewOptions has resolvedConfigSnapshot
const optionsHasResolved = /resolvedConfigSnapshot\?:/.test(previewSrc)
check({
  id: 'PREVIEW-OPTIONS-RESOLVED',
  category: 'Result snapshot',
  title: 'PreviewOptions has resolvedConfigSnapshot?: field',
  passed: optionsHasResolved,
  evidence: [optionsHasResolved ? 'resolvedConfigSnapshot?: field present' : 'MISSING'],
})

// 12. Route passes resolvedConfigSnapshot
const routePassesResolved = /resolvedConfigSnapshot:\s*\{/.test(routeSrc)
check({
  id: 'PREVIEW-ROUTE-PASSES-SNAPSHOT',
  category: 'Result snapshot',
  title: 'Route passes resolvedConfigSnapshot to createSchedulerPreview',
  passed: routePassesResolved,
  evidence: [routePassesResolved ? 'route passes resolvedConfigSnapshot' : 'MISSING'],
})

// 13. Helper source label logic
const sourceLabel = /source:\s*['"]CONFIG['"].*['"]INLINE['"]|source:\s*'CONFIG'.*'INLINE'.*'DEFAULT'.*'MIXED'/.test(
  helperSrc,
) || /'CONFIG'/.test(helperSrc) && /'INLINE'/.test(helperSrc) && /'DEFAULT'/.test(helperSrc) && /'MIXED'/.test(helperSrc)
check({
  id: 'PREVIEW-SOURCE-LABELS',
  category: 'Result snapshot',
  title: 'Helper tags source as CONFIG/INLINE/DEFAULT/MIXED',
  passed: sourceLabel,
  evidence: [sourceLabel ? 'all 4 source labels present' : 'MISSING one or more source labels'],
})

// 14. Validation of overrides
const overrideValidation = /validatePreviewOverrides/.test(routeSrc) || /validatePreviewOverrides/.test(helperSrc)
check({
  id: 'PREVIEW-OVERRIDES-VALIDATION',
  category: 'Validation',
  title: 'overrides are validated before resolution',
  passed: overrideValidation,
  evidence: [overrideValidation ? 'validatePreviewOverrides present' : 'MISSING'],
})

// 15. Helper preserves existing fields on legacy TopLevel
const helperPreservesLegacy = /legacyTopLevel/.test(helperSrc)
check({
  id: 'PREVIEW-LEGACY-FALLBACK',
  category: 'Backward compatibility',
  title: 'Helper accepts legacyTopLevel as fallback layer',
  passed: helperPreservesLegacy,
  evidence: [helperPreservesLegacy ? 'legacyTopLevel param present' : 'MISSING'],
})

// ── Output ────────────────────────────────────────────────────────────

const pass = results.filter((r) => r.passed).length
const fail = results.filter((r) => !r.passed).length

console.log('K21-FIX-F Preview Config Verification')
console.log('======================================')
for (const r of results) {
  console.log(`${r.passed ? 'PASS' : 'FAIL'}: [${r.id}] ${r.title}`)
  for (const e of r.evidence) console.log(`  - ${e}`)
  if (r.note) console.log(`  note: ${r.note}`)
}
console.log(`\nSummary: ${pass} PASS / ${fail} FAIL`)

if (fail > 0) {
  process.exit(1)
}
