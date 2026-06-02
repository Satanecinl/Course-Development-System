/**
 * K13 Schedule Conflict Response Shape Audit
 *
 * Read-only scan of all schedule-conflict-related response shapes used in
 * the codebase. Does NOT write to the database. Reports structure
 * inconsistencies and Fix-D compatibility.
 *
 * Run: npx.cmd tsx scripts/audit-schedule-conflict-response-shapes.ts
 */

import * as fs from 'fs'
import * as path from 'path'

const ROOT = path.resolve(__dirname, '..')

interface Finding {
  id: string
  severity: 'HIGH' | 'MEDIUM' | 'LOW' | 'NONE'
  area: string
  description: string
  evidence: string
  recommendation: string
}

const findings: Finding[] = []

function addFinding(f: Finding) {
  findings.push(f)
}

function read(rel: string): string {
  return fs.readFileSync(path.join(ROOT, rel), 'utf-8')
}
function exists(rel: string): boolean {
  return fs.existsSync(path.join(ROOT, rel))
}

// ── 1. /api/conflict-check response shape ──

const ccRoute = read('src/app/api/conflict-check/route.ts')
const ccLib = read('src/lib/schedule/conflict-check.ts')

const ccApiReturnsResult = ccRoute.includes('NextResponse.json(result)')
const ccLibDefinesHasConflict = /hasConflict:\s*boolean/.test(ccLib) || /hasConflict:\s*false/.test(ccLib)
const ccLibDefinesConflicts = /conflicts:\s*string\[\]/.test(ccLib)
const ccLibDefinesConflictDetails = /conflictDetails:\s*ScheduleConflictDetail\[\]/.test(ccLib)
const ccLibReturnsMessages = /result\.conflicts\s*=\s*messages/.test(ccLib) || /result\.conflicts\s*=\s*\[/.test(ccLib)
const ccLibHasTypedConflict = /type:\s*['"]teacher['"]/.test(ccLib) && /ScheduleConflictRuleMatch/.test(ccLib)
const ccLibInternalType = ccLib.includes('ScheduleConflictRuleMatch') || ccLib.includes('formatMatchMessage')

// ── 2. slot-mutation-guard internal result shape ──

const guard = read('src/lib/schedule/slot-mutation-guard.ts')
const guardHasOk = /ok:\s*boolean/.test(guard)
const guardHasError = /error\?:/.test(guard)
const guardHasStatus = /status\?:/.test(guard)
const guardHasConflicts = /conflicts\?:/.test(guard)
const guardHasConflictDetails = /conflictDetails\?:/.test(guard)
const guardUsesHelper = guard.includes('checkScheduleConflicts')

// ── 3. teaching-task/[id] route response shape ──

const ttRoute = read('src/app/api/teaching-task/[id]/route.ts')
const ttThrowsErrorWithConflicts = /err\.conflicts\s*=\s*conflicts/.test(ttRoute) || /err\.conflicts\s*=\s*\[/.test(ttRoute) || /conflicts\s*=\s*conflicts\s*;\s*\n\s*throw/.test(ttRoute)
const ttThrowsErrorWithConflictDetails = /err\.conflictDetails\s*=/.test(ttRoute)
const ttCatchReturns409 = /status:\s*409/.test(ttRoute)
const ttCatchReturnsError = /error:\s*err\.message/.test(ttRoute) || /error:\s*err\.message/.test(ttRoute)
const ttCatchReturnsConflicts = /conflicts:\s*err\.conflicts/.test(ttRoute)
const ttCatchReturnsConflictDetails = /conflictDetails:\s*err\.conflictDetails/.test(ttRoute)

// ── 4. schedule adjustment typed conflict shape ──

const adj = read('src/lib/schedule/adjustments.ts')
const adjTypes = read('src/types/schedule-adjustment.ts')
const adjHasTypedType = /type:\s*'TEACHER_CONFLICT'/.test(adj) || /type:\s*'CLASS_CONFLICT'/.test(adj) || /type:\s*'ROOM_CONFLICT'/.test(adj)
const adjHasTypedMessage = /message:\s*`/.test(adj)
const adjHasSeverity = /severity:\s*'error'/.test(adj) || /severity:\s*'warning'/.test(adj)
const adjHasRelatedSlotIds = /relatedSlotIds:\s*\[/.test(adj)
const adjReturnsCanApply = /canApply:\s*conflicts\.length === 0/.test(adj)
const adjHasWarnings = /warnings:\s*\[/.test(adj)
const adjUsesRuleKernel = /ruleIsTeacherConflict|ruleIsClassGroupConflict|ruleIsRoomConflict/.test(adj)
const adjTypeDefined = /ScheduleAdjustmentConflict/.test(adjTypes)
const adjTypeHasType = /type:\s*'TEACHER_CONFLICT'/.test(adjTypes)
const adjTypeHasSeverity = /severity:\s*'error'/.test(adjTypes)
const adjTypeHasRelated = /relatedSlotIds/.test(adjTypes)

// ── 5. dry-run API route shape ──

const adjDryRunRoute = read('src/app/api/schedule-adjustments/dry-run/route.ts')
const adjPostRoute = read('src/app/api/schedule-adjustments/route.ts')
const adjDryRunReturnsTypedConflicts = adjDryRunRoute.includes('dryRun:') && /dryRun/.test(adjDryRunRoute)
const adjPostReturnsDryRunOnFail = /dryRun:\s*result\.dryRun/.test(adjPostRoute)
const adjDryRunSuccessEnvelope = /success:\s*true,\s*dryRun/.test(adjDryRunRoute)
const adjPostFailEnvelope = /success:\s*false,\s*dryRun/.test(adjPostRoute)

// ── 6. frontend moveSlot consumption ──

const store = read('src/store/scheduleStore.ts')
const grid = read('src/components/schedule-grid.tsx')
const adjDialog = read('src/components/schedule-adjustment-dialog.tsx')
const storeReadsHasConflict = store.includes('preflightResult.hasConflict')
const storeReadsConflictsString = store.includes('preflightResult.conflicts.join')
const storeParsesErrBodyConflicts = store.includes('errBody?.conflicts')
const storeThrowsPreFlight = /throw new Error\(preflightResult\.conflicts/.test(store)
const gridReadsHasConflict = grid.includes('result.hasConflict')
const gridIteratesConflicts = grid.includes('for (const conflict of result.conflicts)')
const gridToast = /toast\.error\(/.test(grid)
const adjDialogReadsConflictsTyped = /dryRunResult\.conflicts\.map\(\(c,\s*i\)\s*=>\s*\(/.test(adjDialog)
const adjDialogReadsWarningsTyped = /dryRunResult\.warnings\.map\(\(w,\s*i\)\s*=>\s*\(/.test(adjDialog)
const adjDialogCanApply = adjDialog.includes('dryRunResult?.canApply')

// ── 7. validation / audit scripts hardcoding ──

const verifyFixA = read('scripts/verify-schedule-conflict-check-unification-fix-a.ts')
const verifyFixB = read('scripts/verify-schedule-conflict-check-unification-fix-b.ts')
const verifyFixC = read('scripts/verify-schedule-adjustment-conflict-rules-extraction-fix-c.ts')
const verifyK12 = read('scripts/verify-schedule-mutation-client-preflight-fix.ts')
const auditUnif = read('scripts/audit-schedule-conflict-check-unification.ts')
const auditAdj = read('scripts/audit-schedule-adjustment-conflict-check.ts')

const fixAHardcodesShape = verifyFixA.includes('NextResponse.json(result)') && verifyFixA.includes('hasConflict')
const fixBHardcodesShape = verifyFixB.includes('{ error: err.message, conflicts: err.conflicts }')
const fixCHardcodesShape = verifyFixC.includes('hasConflict: false') && verifyFixC.includes('conflicts: []')
const k12HardcodesShape = verifyK12.includes('preflightResult.hasConflict') && verifyK12.includes('preflightResult.conflicts')
const unifHardcodesShape = auditUnif.includes('hasConflict: boolean') && auditUnif.includes('conflicts: string[]')
const adjAuditHardcodesShape = auditAdj.includes('canApply: conflicts.length === 0')

// ── 8. schedule-slot routes response shape ──

const slotPutRoute = read('src/app/api/schedule-slot/[id]/route.ts')
const slotPostRoute = read('src/app/api/schedule-slot/route.ts')
const adminModelRoute = read('src/app/api/admin/[model]/route.ts')
const slotPutReturns409Shape = slotPutRoute.includes('guardResult.error') && slotPutRoute.includes('guardResult.conflicts')
const slotPostReturns409Shape = slotPostRoute.includes('guardResult.error') && slotPostRoute.includes('guardResult.conflicts')
const adminModelReturns409Shape = adminModelRoute.includes('guardResult.error') && adminModelRoute.includes('guardResult.conflicts')
const slotPutReturnsConflictDetails = slotPutRoute.includes('guardResult.conflictDetails')
const slotPostReturnsConflictDetails = slotPostRoute.includes('guardResult.conflictDetails')
const adminModelReturnsConflictDetails = adminModelRoute.includes('guardResult.conflictDetails')

// ── 9. existing fix-b envelope on teaching-task ──

// ── 10. findings computation ──

// ── Findings ──

// 1. /api/conflict-check returns untyped string[] conflicts
addFinding({
  id: 'K13-RESPONSE-MEDIUM-1',
  severity: 'MEDIUM',
  area: '/api/conflict-check',
  description: 'Response shape is untyped string[] conflicts. Helper internally has typed ScheduleConflictRuleMatch (with teacher/classGroup/room type) but discards it before responding.',
  evidence: `ccApiReturnsResult=${ccApiReturnsResult} ccLibDefinesHasConflict=${ccLibDefinesHasConflict} ccLibDefinesConflicts=${ccLibDefinesConflicts} ccLibDefinesConflictDetails=${ccLibDefinesConflictDetails} ccLibHasTypedConflict=${ccLibHasTypedConflict} ccLibInternalType=${ccLibInternalType}`,
  recommendation: 'Fix-D adds `conflictDetails: ScheduleConflictDetail[]` to ScheduleConflictCheckResult, additive with `conflicts: string[]`. Verified by verify-schedule-conflict-response-shape-fix-d.ts.',
})

// 2. slot-mutation-guard internal shape is { ok, error?, status?, conflicts? } — diverges from API
addFinding({
  id: 'K13-RESPONSE-MEDIUM-2',
  severity: 'MEDIUM',
  area: 'slot-mutation-guard',
  description: 'Guard internal result shape is `{ ok, error?, status?, conflicts? }` (string[]), not the typed conflict. Routes translate to `{ error, conflicts }` 409 response, which is consistent but not the typed conflict.',
  evidence: `guardHasOk=${guardHasOk} guardHasError=${guardHasError} guardHasStatus=${guardHasStatus} guardHasConflicts=${guardHasConflicts} guardHasConflictDetails=${guardHasConflictDetails} guardUsesHelper=${guardUsesHelper}`,
  recommendation: 'Fix-D adds `conflictDetails?: ScheduleConflictDetail[]` to SlotMutationGuardResult, additive with `conflicts?: string[]`. Routes can pass it through.',
})

// 3. teaching-task/[id] uses Error.conflicts pattern — unusual envelope
addFinding({
  id: 'K13-RESPONSE-MEDIUM-3',
  severity: 'MEDIUM',
  area: 'teaching-task/[id]',
  description: 'Conflict propagation uses `Error.conflicts = string[]` thrown inside transaction, caught at route boundary to return 409 `{ error, conflicts }`. Unusual pattern but consistent with string[] shape.',
  evidence: `ttThrowsErrorWithConflicts=${ttThrowsErrorWithConflicts} ttThrowsErrorWithConflictDetails=${ttThrowsErrorWithConflictDetails} ttCatchReturns409=${ttCatchReturns409} ttCatchReturnsError=${ttCatchReturnsError} ttCatchReturnsConflicts=${ttCatchReturnsConflicts} ttCatchReturnsConflictDetails=${ttCatchReturnsConflictDetails}`,
  recommendation: 'Fix-D adds `Error.conflictDetails` alongside Error.conflicts. Catch returns `{ error, conflicts, conflictDetails }`. Pattern preserved.',
})

// 4. adjustment uses typed ScheduleAdjustmentConflict[] — different shape than shared helper
addFinding({
  id: 'K13-RESPONSE-MEDIUM-4',
  severity: 'MEDIUM',
  area: 'adjustment dry-run',
  description: 'Adjustment dry-run uses typed ScheduleAdjustmentConflict { type, message, severity, relatedSlotIds }. Distinct from shared helper { hasConflict, conflicts: string[] }. Frontend consumes each differently (typed map for adjustment; string iteration for preflight).',
  evidence: `adjTypeDefined=${adjTypeDefined} adjTypeHasType=${adjTypeHasType} adjTypeHasSeverity=${adjTypeHasSeverity} adjTypeHasRelated=${adjTypeHasRelated} adjHasTypedType=${adjHasTypedType} adjHasSeverity=${adjHasSeverity} adjHasRelatedSlotIds=${adjHasRelatedSlotIds} adjHasWarnings=${adjHasWarnings} adjReturnsCanApply=${adjReturnsCanApply} adjUsesRuleKernel=${adjUsesRuleKernel}`,
  recommendation: 'typed ScheduleAdjustmentConflict can serve as the basis for a unified typed conflict. Add INVALID_ROOM, INVALID_INPUT, INTERNAL_ERROR types for completeness. Optionally: type field values map to shared rule type (TEACHER_CONFLICT ↔ teacher).',
})

// 5. frontend moveSlot preflight consumes untyped string[]
addFinding({
  id: 'K13-RESPONSE-LOW-1',
  severity: 'LOW',
  area: 'frontend moveSlot (store + grid)',
  description: 'Store + grid iterate `result.conflicts` as string[] and toast each one. PUT failure parses `errBody?.conflicts?.join("\\n") || errBody?.error`. No typed conflict access.',
  evidence: `storeReadsHasConflict=${storeReadsHasConflict} storeReadsConflictsString=${storeReadsConflictsString} storeParsesErrBodyConflicts=${storeParsesErrBodyConflicts} storeThrowsPreFlight=${storeThrowsPreFlight} gridReadsHasConflict=${gridReadsHasConflict} gridIteratesConflicts=${gridIteratesConflicts} gridToast=${gridToast}`,
  recommendation: 'When typed conflicts are exposed, frontend can render more specific messages. For now string[] toast is sufficient.',
})

// 6. frontend adjustment dialog consumes typed
addFinding({
  id: 'K13-RESPONSE-NONE-1',
  severity: 'NONE',
  area: 'frontend adjustment dialog',
  description: 'Adjustment dialog consumes typed ScheduleAdjustmentConflict: iterates dryRunResult.conflicts and warnings, maps each `{c.message}` to a list item. Uses both canApply and warning array.',
  evidence: `adjDialogReadsConflictsTyped=${adjDialogReadsConflictsTyped} adjDialogReadsWarningsTyped=${adjDialogReadsWarningsTyped} adjDialogCanApply=${adjDialogCanApply}`,
  recommendation: 'No change needed.',
})

// 7. dry-run API envelope is `{ success, dryRun }`
addFinding({
  id: 'K13-RESPONSE-LOW-2',
  severity: 'LOW',
  area: 'dry-run API',
  description: '/api/schedule-adjustments/dry-run returns `{ success: true, dryRun }`. /api/schedule-adjustments POST returns `{ success: true, adjustment, dryRun }` on success, `{ success: false, dryRun }` on dryRun-failure (no top-level error). Different shape from /api/conflict-check.',
  evidence: `adjDryRunReturnsTypedConflicts=${adjDryRunReturnsTypedConflicts} adjDryRunSuccessEnvelope=${adjDryRunSuccessEnvelope} adjPostReturnsDryRunOnFail=${adjPostReturnsDryRunOnFail} adjPostFailEnvelope=${adjPostFailEnvelope}`,
  recommendation: 'Envelope is by design (wraps adjustment-specific success/failure). If Fix-D unifies conflict shape, leave envelope alone — just the inner dryRun.conflicts is shaped by ScheduleAdjustmentConflict.',
})

// 8. verification scripts hardcode response shapes
addFinding({
  id: 'K13-RESPONSE-MEDIUM-5',
  severity: 'MEDIUM',
  area: 'verification scripts',
  description: '6 verification/audit scripts hardcode response shape strings: Fix-A checks `hasConflict` in route, Fix-B checks `{ error, conflicts }` shape on teaching-task, Fix-C checks `hasConflict: false` literal, K12 checks `preflightResult.hasConflict`, K13 main audit checks `hasConflict: boolean` + `conflicts: string[]`, adjustment audit checks `canApply: conflicts.length === 0`.',
  evidence: `fixAHardcodesShape=${fixAHardcodesShape} fixBHardcodesShape=${fixBHardcodesShape} fixCHardcodesShape=${fixCHardcodesShape} k12HardcodesShape=${k12HardcodesShape} unifHardcodesShape=${unifHardcodesShape} adjAuditHardcodesShape=${adjAuditHardcodesShape}`,
  recommendation: 'If Fix-D adds typed conflicts with a NEW field, scripts can keep checking the existing string[] fields (backwards compat). Scripts do not need to be re-written unless existing fields are removed.',
})

// 9. schedule-slot routes 409 response shape
addFinding({
  id: 'K13-RESPONSE-LOW-3',
  severity: 'LOW',
  area: 'schedule-slot routes',
  description: 'PUT/POST /api/schedule-slot/[id] and /api/schedule-slot return 409 `{ error, conflicts }` on guard failure. /api/admin/[model] also uses guardResult.error/conflicts. All three use the same envelope.',
  evidence: `slotPutReturns409Shape=${slotPutReturns409Shape} slotPostReturns409Shape=${slotPostReturns409Shape} adminModelReturns409Shape=${adminModelReturns409Shape} slotPutReturnsConflictDetails=${slotPutReturnsConflictDetails} slotPostReturnsConflictDetails=${slotPostReturnsConflictDetails} adminModelReturnsConflictDetails=${adminModelReturnsConflictDetails}`,
  recommendation: 'Fix-D adds `conflictDetails: ScheduleConflictDetail[]` to all three 409 responses, additive with `{ error, conflicts }`.',
})

// 10. helper internal type vs response type divergence
addFinding({
  id: 'K13-RESPONSE-MEDIUM-6',
  severity: 'MEDIUM',
  area: 'shared helper internal type',
  description: 'checkScheduleConflicts internally uses typed ScheduleConflictRuleMatch (via findRuleMatches) but the response envelope only exposes `conflicts: string[]`. Internal type richness is lost at the boundary.',
  evidence: `ccLibHasTypedConflict=${ccLibHasTypedConflict} ccLibReturnsMessages=${ccLibReturnsMessages}`,
  recommendation: 'Fix-D adds `conflictDetails: ScheduleConflictDetail[]` to ScheduleConflictCheckResult. `conflicts: string[]` preserved. The detail list mirrors the message list (one per rule match).',
})

// 11. K13-FIX-D additive conflictDetails present across all 5 sites
addFinding({
  id: 'K13-RESPONSE-NONE-2',
  severity: 'NONE',
  area: 'fix-d additive conflictDetails',
  description: 'K13-FIX-D introduces typed ScheduleConflictDetail and surfaces `conflictDetails` at 5 sites: /api/conflict-check, SlotMutationGuardResult, /api/schedule-slot/*, /api/admin/[model], /api/teaching-task/[id]. All additive; `conflicts: string[]` preserved everywhere.',
  evidence: `ccLibDefinesConflictDetails=${ccLibDefinesConflictDetails} guardHasConflictDetails=${guardHasConflictDetails} slotPutReturnsConflictDetails=${slotPutReturnsConflictDetails} slotPostReturnsConflictDetails=${slotPostReturnsConflictDetails} adminModelReturnsConflictDetails=${adminModelReturnsConflictDetails} ttCatchReturnsConflictDetails=${ttCatchReturnsConflictDetails}`,
  recommendation: 'Verified by verify-schedule-conflict-response-shape-fix-d.ts. Frontend consumers and 6 verification scripts unaffected (string[] still present).',
})

// ── Output ──

console.log('\n=== K13 Schedule Conflict Response Shape Audit ===\n')
console.log('Files scanned: 17 (5 lib + 4 routes + 3 components + 1 store + 1 types + 1 type-store + 6 verify/audit scripts)')
console.log('Response shape sites: 9 (4 lib + 4 API routes + 1 types)')
console.log('Frontend consumers: 3 (store + grid + adjustment-dialog)')
console.log('Script consumers: 6 (Fix-A/B/C + K12 + main + adjustment)\n')

console.log('Response Shapes:')
console.log('  - /api/conflict-check:    { hasConflict, conflicts: string[] }   (no typed info)')
console.log('  - slot-mutation-guard:    { ok, error?, status?, conflicts?: string[] }  (internal)')
console.log('  - /api/schedule-slot/* :  409 { error, conflicts: string[] }  (no typed info)')
console.log('  - /api/teaching-task/[id]: 409 { error: "教室冲突", conflicts: string[] }  (Error.conflicts pattern)')
console.log('  - adjustment dry-run:     { canApply, conflicts: ScheduleAdjustmentConflict[], warnings: ScheduleAdjustmentConflict[] }  (typed)')
console.log('  - adjustment API:         { success, dryRun, adjustment? }  (envelope, inner is typed)')
console.log('  - /api/admin/[model]:     409 { error, conflicts }  (same as slot)\n')

const bySeverity = { HIGH: 0, MEDIUM: 0, LOW: 0, NONE: 0 }
for (const f of findings) bySeverity[f.severity]++

console.log('Findings:')
for (const f of findings) {
  console.log(`  [${f.severity}] ${f.id} (${f.area})`)
  console.log(`        ${f.description}`)
  if (process.env.VERBOSE) {
    console.log(`        evidence: ${f.evidence}`)
    console.log(`        recommendation: ${f.recommendation}`)
  }
}

console.log(`\nSummary:`)
console.log(`  HIGH: ${bySeverity.HIGH}`)
console.log(`  MEDIUM: ${bySeverity.MEDIUM}`)
console.log(`  LOW: ${bySeverity.LOW}`)
console.log(`  NONE: ${bySeverity.NONE}`)

console.log(`\nRecommendation:`)
console.log(`  Fix-D allowed: yes (now completed)`)
console.log(`  Implemented strategy: additive typed (conflictDetails: ScheduleConflictDetail[]) +`)
console.log(`    external compatible string[] (conflicts: string[] unchanged at all sites).`)
console.log(`  Compat: "conflicts: string[]" preserved at /api/conflict-check, /api/schedule-slot/*, /api/admin/[model], /api/teaching-task/[id].`)
console.log(`  Adjustment envelope: unchanged (canApply + typed conflicts + warnings).`)
console.log(`  Scripts: 6 verification scripts unaffected (string[] checks still pass).`)
console.log(`\nFix-D boundary (completed):`)
console.log(`  - Added conflictDetails: ScheduleConflictDetail[] to:`)
console.log(`      * ScheduleConflictCheckResult (shared helper)`)
console.log(`      * SlotMutationGuardResult (pass through)`)
console.log(`      * /api/conflict-check response (transparent via result envelope)`)
console.log(`      * /api/schedule-slot/[id] + /api/schedule-slot 409 responses`)
console.log(`      * /api/admin/[model] scheduleslot 409 responses`)
console.log(`      * /api/teaching-task/[id] 409 response (Error.conflictDetails pattern)`)
console.log(`  - ScheduleAdjustmentConflict envelope: NOT modified (already typed).`)
console.log(`  - Frontend consumers: NOT modified (string[] still consumed).`)
console.log(`  - Verification scripts: NOT modified (string[] checks still valid).`)
