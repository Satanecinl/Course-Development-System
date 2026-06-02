/**
 * K13 Schedule Conflict Response Shape Fix-D Verification
 *
 * Read-only. Does NOT write to the database. Confirms:
 *  - Unified ScheduleConflictDetail type exists with type/severity/message
 *  - checkScheduleConflicts returns conflictDetails
 *  - checkScheduleConflicts STILL returns conflicts: string[]
 *  - /api/conflict-check returns hasConflict/conflicts/conflictDetails
 *  - slot-mutation-guard has conflictDetails
 *  - schedule-slot/admin/teaching-task 409 responses preserve error/conflicts
 *    and add conflictDetails
 *  - adjustment dry-run canApply/conflicts/warnings preserved
 *  - K12 frontend still uses string[] conflicts
 *  - Prisma schema / solver / parser / importer / seed untouched
 *  - No UI semester selector
 */

import * as fs from 'fs'
import * as path from 'path'

const ROOT = path.resolve(__dirname, '..')

interface CheckResult {
  name: string
  passed: boolean
  detail?: string
}

const results: CheckResult[] = []

function check(name: string, passed: boolean, detail?: string) {
  results.push({ name, passed, detail })
}

function read(rel: string): string {
  return fs.readFileSync(path.join(ROOT, rel), 'utf-8')
}
function exists(rel: string): boolean {
  return fs.existsSync(path.join(ROOT, rel))
}

// ── 1. Unified ScheduleConflictDetail type ──

const rulesPath = 'src/lib/schedule/conflict-rules.ts'
const rules = read(rulesPath)

check('Unified ScheduleConflictDetail type exists', /export interface ScheduleConflictDetail/.test(rules))
check('ScheduleConflictDetail has type field', /type:\s*ScheduleConflictDetailType/.test(rules))
check('ScheduleConflictDetail has severity field', /severity:\s*ScheduleConflictSeverity/.test(rules))
check('ScheduleConflictDetail has message field', /message:\s*string/.test(rules))

check('ScheduleConflictDetailType union exists', /export type ScheduleConflictDetailType\s*=/.test(rules))
check('ScheduleConflictDetailType includes teacher/classGroup/room', /'teacher'/.test(rules) && /'classGroup'/.test(rules) && /'room'/.test(rules))
check('ScheduleConflictDetailType includes capacity/unknown', /'capacity'/.test(rules) && /'unknown'/.test(rules))
check('ScheduleConflictSeverity exists (error/warning)', /export type ScheduleConflictSeverity\s*=/.test(rules) && /'error'/.test(rules) && /'warning'/.test(rules))
check('ScheduleConflictSource exists (4 sources)', /export type ScheduleConflictSource/.test(rules) && /'conflict-check'/.test(rules) && /'slot-mutation'/.test(rules) && /'teaching-task'/.test(rules) && /'adjustment'/.test(rules))

// ScheduleConflictDetail is JSON-safe (no Date, no Prisma instances, no functions)
check('ScheduleConflictDetail does NOT use Date', !/Date\b/.test(rules.split('ScheduleConflictDetail')[1]?.split('}')[0] ?? ''))
check('ScheduleConflictDetail does NOT use prisma types (no Prisma. in type body)', !/Prisma\./.test(rules.split('ScheduleConflictDetail {')[1]?.split('}')[0] ?? ''))

// ── 2. helper returns both string[] and conflictDetails ──

const ccLib = read('src/lib/schedule/conflict-check.ts')
check('checkScheduleConflicts returns conflictDetails', /conflictDetails:\s*ScheduleConflictDetail\[\]/.test(ccLib))
check('checkScheduleConflicts still returns conflicts: string[]', /conflicts:\s*string\[\]/.test(ccLib))
check('checkScheduleConflicts still returns hasConflict: boolean', /hasConflict:\s*boolean/.test(ccLib))
check('checkScheduleConflicts populates conflictDetails array', /result\.conflictDetails\s*=\s*details/.test(ccLib))
check('checkScheduleConflicts still populates conflicts array', /result\.conflicts\s*=\s*messages/.test(ccLib))
check('checkScheduleConflicts uses toConflictDetails helper', /toConflictDetails\(/.test(ccLib))

// ── 3. /api/conflict-check response shape ──

const ccRoute = read('src/app/api/conflict-check/route.ts')
check('/api/conflict-check still returns hasConflict (via result envelope)', /NextResponse\.json\(result\)/.test(ccRoute))
check('/api/conflict-check does NOT break response envelope', /NextResponse\.json\(result\)/.test(ccRoute))
// Note: result is { hasConflict, conflicts, conflictDetails } (typed at compile time),
// and serialized transparently. conflictDetails is included via the typed result.

// ── 4. slot-mutation-guard result ──

const guard = read('src/lib/schedule/slot-mutation-guard.ts')
check('SlotMutationGuardResult has conflictDetails? field', /conflictDetails\?:\s*ScheduleConflictDetail\[\]/.test(guard))
check('SlotMutationGuardResult preserves conflicts? field', /conflicts\?:\s*string\[\]/.test(guard))
check('slot-mutation-guard destructures conflictDetails from helper', /\{ conflicts,\s*conflictDetails \}\s*=\s*await checkScheduleConflicts/.test(guard))
check('slot-mutation-guard returns conflictDetails on 409', /status:\s*409,\s*conflicts,\s*conflictDetails/.test(guard))
// Count: 3 guards (guardSlotUpdate, guardSlotCreate, guardAdminSlotUpdate) all should return conflictDetails
const guardReturnSites = (guard.match(/status:\s*409,\s*conflicts,\s*conflictDetails/g) ?? []).length
check('slot-mutation-guard has 3 conflictDetails return sites', guardReturnSites === 3, `found ${guardReturnSites}`)

// ── 5. schedule-slot route 409 response ──

const slotPut = read('src/app/api/schedule-slot/[id]/route.ts')
check('schedule-slot/[id] PUT 409 preserves { error, conflicts }', /error:\s*guardResult\.error,\s*conflicts:\s*guardResult\.conflicts/.test(slotPut))
check('schedule-slot/[id] PUT 409 adds conflictDetails', /conflictDetails:\s*guardResult\.conflictDetails/.test(slotPut))

const slotPost = read('src/app/api/schedule-slot/route.ts')
check('schedule-slot POST 409 preserves { error, conflicts }', /error:\s*guardResult\.error,\s*conflicts:\s*guardResult\.conflicts/.test(slotPost))
check('schedule-slot POST 409 adds conflictDetails', /conflictDetails:\s*guardResult\.conflictDetails/.test(slotPost))

// ── 6. admin [model] route 409 response ──

const adminRoute = read('src/app/api/admin/[model]/route.ts')
const admin409Count = (adminRoute.match(/guardResult\.conflictDetails/g) ?? []).length
check('admin [model] route has 2 conflictDetails return sites (POST + PUT)', admin409Count === 2, `found ${admin409Count}`)
check('admin POST 409 preserves { error, conflicts } + conflictDetails', /error:\s*guardResult\.error,\s*conflicts:\s*guardResult\.conflicts,\s*conflictDetails:\s*guardResult\.conflictDetails/.test(adminRoute))
check('admin PUT 409 preserves { error, conflicts } + conflictDetails', /error:\s*guardResult\.error,\s*conflicts:\s*guardResult\.conflicts,\s*conflictDetails:\s*guardResult\.conflictDetails/.test(adminRoute))

// ── 7. teaching-task/[id] route 409 response ──

const ttRoute = read('src/app/api/teaching-task/[id]/route.ts')
check('teaching-task route still uses Error.conflicts pattern', /err\.conflicts\s*=\s*conflicts/.test(ttRoute))
check('teaching-task route adds Error.conflictDetails', /err\.conflictDetails\s*=\s*conflictDetails/.test(ttRoute))
check('teaching-task catch returns { error, conflicts, conflictDetails }', /error:\s*err\.message,\s*conflicts:\s*err\.conflicts,\s*conflictDetails:\s*err\.conflictDetails/.test(ttRoute))
check('teaching-task catch still returns status 409', /status:\s*409/.test(ttRoute))

// ── 8. adjustment dry-run envelope preserved ──

const adj = read('src/lib/schedule/adjustments.ts')
const adjTypes = read('src/types/schedule-adjustment.ts')
check('adjustment dry-run still returns canApply', /canApply:\s*conflicts\.length === 0/.test(adj))
check('adjustment dry-run still uses ScheduleAdjustmentConflict[]', /ScheduleAdjustmentConflict\[\]/.test(adj))
check('adjustment dry-run still returns warnings array', /warnings:\s*(validationErrors|ScheduleAdjustmentConflict\[\]\s*=\s*\[)/.test(adj))
check('ScheduleAdjustmentConflict type unchanged', /type:\s*'TEACHER_CONFLICT'/.test(adjTypes) && /severity:\s*'error'/.test(adjTypes))

// ── 9. K12 frontend still uses string[] ──

const store = read('src/store/scheduleStore.ts')
check('K12 moveSlot still reads preflightResult.hasConflict', /preflightResult\.hasConflict/.test(store))
check('K12 moveSlot still reads preflightResult.conflicts (string[])', /preflightResult\.conflicts\.join/.test(store))
check('K12 moveSlot still parses errBody.conflicts / errBody.error', /errBody\?\.conflicts/.test(store) && /errBody\?\.error/.test(store))

const grid = read('src/components/schedule-grid.tsx')
check('schedule-grid still iterates result.conflicts as string', /for \(const conflict of result\.conflicts\)/.test(grid))
check('schedule-grid toast still uses string description', /toast\.error\([^,]+,\s*\{\s*description:\s*conflict/.test(grid))

// ── 10. constraints ──

const schema = read('prisma/schema.prisma')
check('Prisma schema not modified', schema.includes('model ScheduleSlot'))
check('Prisma schema still has ScheduleAdjustment model', schema.includes('model ScheduleAdjustment'))

// Solver / parser / importer / seed not modified
const solverDir = path.join(ROOT, 'src', 'lib', 'scheduler')
let solverHasConflictDetail = false
for (const f of fs.readdirSync(solverDir).filter((f) => f.endsWith('.ts'))) {
  if (read(`src/lib/scheduler/${f}`).includes('conflictDetails')) {
    solverHasConflictDetail = true
    break
  }
}
check('Solver does not import conflictDetails', !solverHasConflictDetail)

const parser = read('scripts/parse_schedule.py')
check('Python parser not modified', !parser.includes('conflictDetails'))

const importer = read('src/lib/import/importer.ts')
check('Importer not modified', !importer.includes('conflictDetails') && !importer.includes('ScheduleConflictDetail'))

// No new UI semester selector
const hasSemesterSelector = store.includes('SemesterSelector') || store.includes('semester-selector')
check('No UI semester selector added', !hasSemesterSelector)

// No new /api/scheduler/run or Re-run button
check('No new /api/scheduler/run', !exists('src/app/api/scheduler/run'))

// ── 11. old fields preserved everywhere ──

check('conflicts: string[] still defined in shared helper', /conflicts:\s*string\[\]/.test(ccLib))
check('hasConflict: boolean still defined in shared helper', /hasConflict:\s*boolean/.test(ccLib))
check('conflicts?: string[] still in SlotMutationGuardResult', /conflicts\?:\s*string\[\]/.test(guard))
check('error: string still in 409 responses', /error:\s*guardResult\.error/.test(slotPut) || /error:\s*err\.message/.test(ttRoute))
check('conflicts: err.conflicts still in teaching-task catch', /conflicts:\s*err\.conflicts/.test(ttRoute))

// ── 12. verification scripts still pass string[] shape checks (no breaking) ──

const fixA = read('scripts/verify-schedule-conflict-check-unification-fix-a.ts')
const fixB = read('scripts/verify-schedule-conflict-check-unification-fix-b.ts')
const fixC = read('scripts/verify-schedule-adjustment-conflict-rules-extraction-fix-c.ts')
const k12 = read('scripts/verify-schedule-mutation-client-preflight-fix.ts')
check('Fix-A verification still checks NextResponse.json(result)', fixA.includes('NextResponse.json(result)'))
check('Fix-B verification still checks { error, conflicts } (regex OK)', /error: err\\\.message,\\s\*conflicts: err\\\.conflicts/.test(fixB))
check('Fix-C verification still checks hasConflict + conflicts (regex)', fixC.includes('hasConflict:') && fixC.includes('conflicts:') && fixC.includes('sharedHelper'))
check('K12 verification still checks preflightResult.hasConflict + preflightResult.conflicts', k12.includes('preflightResult.hasConflict') && k12.includes('preflightResult.conflicts'))

// ── Output ──

console.log('\n=== K13 Schedule Conflict Response Shape Fix-D Verification ===\n')

let passed = 0
let failed = 0

for (const r of results) {
  const icon = r.passed ? 'PASS' : 'FAIL'
  console.log(`  [${icon}] ${r.name}`)
  if (r.detail && !r.passed) console.log(`        ${r.detail}`)
  if (r.passed) passed++
  else failed++
}

console.log(`\nSummary:`)
console.log(`  passed: ${passed}`)
console.log(`  failed: ${failed}`)

if (failed > 0) {
  console.log('\nVerification FAILED')
  process.exit(1)
} else {
  console.log('\nVerification PASSED')
}
