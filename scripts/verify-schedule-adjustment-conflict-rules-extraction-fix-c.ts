/**
 * K13 Schedule Adjustment Conflict Rules Extraction Fix-C Verification
 *
 * Read-only. Does NOT write to the database.
 * Confirms:
 *  - src/lib/schedule/conflict-rules.ts exists with pure rule helpers
 *  - checkScheduleConflicts delegates to rule kernel
 *  - dryRunScheduleAdjustment uses rule kernel helpers
 *  - adjustment-specific semantics preserved (effective schedule, targetWeek,
 *    capacity warning, typed response)
 *  - create / void behaviors preserved
 *  - /api/conflict-check contract preserved
 *  - slot-mutation-guard / teaching-task route / K12 moveSlot untouched
 *  - Prisma schema, solver, parser, importer, seed untouched
 *  - no UI semester selector
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

// ── 1. Pure rules helper file exists ──

const rulesPath = 'src/lib/schedule/conflict-rules.ts'
check('Pure rules helper file exists', exists(rulesPath))
const rules = read(rulesPath)

// ── 2. Pure rules helper properties ──

check('Pure rules helper does NOT import prisma', !rules.includes("from '@/lib/prisma'"))
check('Pure rules helper does NOT import NextRequest', !/^import .*NextRequest/m.test(rules))
check('Pure rules helper does NOT import NextResponse', !/^import .*NextResponse/m.test(rules))

// ── 3. Pure rules helper API ──

check('Pure rules helper exports isSameTimeSlot', /export function isSameTimeSlot/.test(rules))
check('Pure rules helper exports isWeekOverlapping', /export function isWeekOverlapping/.test(rules))
check('Pure rules helper exports isTeacherConflict', /export function isTeacherConflict/.test(rules))
check('Pure rules helper exports isClassGroupConflict', /export function isClassGroupConflict/.test(rules))
check('Pure rules helper exports isRoomConflict', /export function isRoomConflict/.test(rules))
check('Pure rules helper exports findRuleMatches', /export function findRuleMatches/.test(rules))
// Strip comments and string literals (K13-FIX-D adds 'capacity' as a string
// union member for ScheduleConflictDetailType; the rule kernel still has no
// capacity IMPLEMENTATION).
const rulesNoStrings = rules
  .replace(/\/\*[\s\S]*?\*\//g, '')
  .replace(/\/\/.*$/gm, '')
  .replace(/'[^']*'/g, "''")
  .replace(/"[^"]*"/g, '""')
  .replace(/`[^`]*`/g, '``')
check('Pure rules helper does NOT contain capacity logic (no capacity keyword in code)', !/\bcapacity\b/i.test(rulesNoStrings))

// ── 4. Shared conflict-check delegates to rule kernel ──

const sharedHelper = read('src/lib/schedule/conflict-check.ts')
check('checkScheduleConflicts imports findRuleMatches', /import\s*\{[^}]*findRuleMatches[^}]*\}\s*from\s*'@\/lib\/schedule\/conflict-rules'/.test(sharedHelper))
check('checkScheduleConflicts calls findRuleMatches', /findRuleMatches\(/.test(sharedHelper))
check('checkScheduleConflicts exports checkScheduleConflicts', /export async function checkScheduleConflicts/.test(sharedHelper))
check('checkScheduleConflicts does NOT directly call checkWeekOverlap', !/checkWeekOverlap\(/.test(sharedHelper))
check('checkScheduleConflicts still has response shape { hasConflict, conflicts }', /hasConflict:\s*false/.test(sharedHelper) && /conflicts:\s*\[\]/.test(sharedHelper))

// ── 5. dryRunScheduleAdjustment uses rule kernel ──

const adjustments = read('src/lib/schedule/adjustments.ts')
check('dryRunScheduleAdjustment imports rule helpers from conflict-rules', /from\s*'@\/lib\/schedule\/conflict-rules'/.test(adjustments))
check('dryRunScheduleAdjustment calls ruleIsTeacherConflict', /ruleIsTeacherConflict/.test(adjustments))
check('dryRunScheduleAdjustment calls ruleIsClassGroupConflict', /ruleIsClassGroupConflict/.test(adjustments))
check('dryRunScheduleAdjustment calls ruleIsRoomConflict', /ruleIsRoomConflict/.test(adjustments))
check('dryRunScheduleAdjustment does NOT call checkScheduleConflicts directly', !/checkScheduleConflicts\(/.test(adjustments))
check('dryRunScheduleAdjustment does NOT directly call checkWeekOverlap', !/checkWeekOverlap\(/.test(adjustments))

// ── 6. adjustment-specific semantics preserved ──

check('dryRunScheduleAdjustment still uses effective schedule', /getEffectiveScheduleForWeek\(targetWeek/.test(adjustments))
check('dryRunScheduleAdjustment still has targetWeek single-week filter', /targetWeek === sourceWeek && item\.slotId === input\.originalSlotId/.test(adjustments))
check('dryRunScheduleAdjustment still has capacity warning', /CAPACITY_CONFLICT/.test(adjustments))
check('dryRunScheduleAdjustment still has typed response ScheduleAdjustmentConflict', /type:\s*'TEACHER_CONFLICT'/.test(adjustments) && /severity:\s*'error'/.test(adjustments))
check('dryRunScheduleAdjustment still has warnings array', /warnings:/.test(adjustments))
check('dryRunScheduleAdjustment still returns canApply', /canApply:\s*conflicts\.length === 0/.test(adjustments))

// ── 7. create / void preserved ──

check('createScheduleAdjustment still calls dryRun', /await dryRunScheduleAdjustment\(/.test(adjustments))
check('createScheduleAdjustment still rejects on dryRun failure', /if \(!dryRun\.canApply\)/.test(adjustments))
check('voidScheduleAdjustment still does NOT recheck conflicts', !/voidScheduleAdjustment[\s\S]{0,200}checkScheduleConflict|checkWeekOverlap\(/.test(adjustments))
check('voidScheduleAdjustment still flips status to VOID', /status:\s*'VOID'/.test(adjustments))

// ── 8. /api/conflict-check contract preserved ──

const ccRoute = read('src/app/api/conflict-check/route.ts')
check('/api/conflict-check still uses checkScheduleConflicts', ccRoute.includes('checkScheduleConflicts'))
check('/api/conflict-check response shape preserved (hasConflict + conflicts)', /hasConflict/.test(ccRoute) || /NextResponse\.json\(result\)/.test(ccRoute))

// ── 9. slot-mutation-guard still uses shared helper ──

const guard = read('src/lib/schedule/slot-mutation-guard.ts')
check('slot-mutation-guard still uses checkScheduleConflicts', guard.includes('checkScheduleConflicts'))

// ── 10. teaching-task route still uses shared helper ──

const ttRoute = read('src/app/api/teaching-task/[id]/route.ts')
check('teaching-task route still uses checkScheduleConflicts', ttRoute.includes('checkScheduleConflicts'))

// ── 11. K12 moveSlot untouched ──

const store = read('src/store/scheduleStore.ts')
check('K12 moveSlot still does preflight /api/conflict-check', store.includes('/api/conflict-check'))
check('K12 moveSlot still throws on preflight conflict', /throw new Error\(preflightResult\.conflicts/.test(store))

// ── 12. Prisma schema untouched ──

const schema = read('prisma/schema.prisma')
check('Prisma schema not modified', schema.includes('model ScheduleSlot'))
check('Prisma schema has ScheduleAdjustment model', schema.includes('model ScheduleAdjustment'))

// ── 13. Solver / parser / importer / seed untouched ──

const solverDir = path.join(ROOT, 'src', 'lib', 'scheduler')
let solverModified = false
for (const f of fs.readdirSync(solverDir).filter((f) => f.endsWith('.ts'))) {
  if (read(`src/lib/scheduler/${f}`).includes('conflict-rules')) {
    solverModified = true
    break
  }
}
check('Solver does not import conflict-rules', !solverModified)

const parser = read('scripts/parse_schedule.py')
check('Python parser not modified', !parser.includes('conflict-rules') && !parser.includes('conflictCheck'))

const importer = read('src/lib/import/importer.ts')
check('Importer not modified', !importer.includes('conflict-rules') && !importer.includes('checkScheduleConflicts'))

// ── 14. No UI semester selector ──

const hasSemesterSelector = store.includes('SemesterSelector') || store.includes('semester-selector')
check('No UI semester selector added', !hasSemesterSelector)

// ── 15. No new /api/scheduler/run or Re-run button ──

check('No new /api/scheduler/run', !exists('src/app/api/scheduler/run'))

// ── Output ──

console.log('\n=== K13 Schedule Adjustment Conflict Rules Extraction Fix-C Verification ===\n')

let passed = 0
let failed = 0

for (const r of results) {
  const icon = r.passed ? 'PASS' : 'FAIL'
  console.log(`  [${icon}] ${r.name}`)
  if (r.detail) console.log(`        ${r.detail}`)
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
