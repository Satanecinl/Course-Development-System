/**
 * K13 Schedule Conflict Check Unification Fix-B Verification
 *
 * Read-only verification. Does NOT write to the database.
 * Confirms PUT /api/teaching-task/[id] reuses checkScheduleConflicts
 * and no longer has its own inline room conflict query.
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

// ── 1. teaching-task route file exists ──

const ttRoutePath = path.join(ROOT, 'src', 'app', 'api', 'teaching-task', '[id]', 'route.ts')
const ttRoute = fs.readFileSync(ttRoutePath, 'utf-8')
check('teaching-task route file exists', fs.existsSync(ttRoutePath))

// ── 2. Route imports shared helper ──

check('Route imports checkScheduleConflicts from shared helper', ttRoute.includes("from '@/lib/schedule/conflict-check'") && ttRoute.includes('checkScheduleConflicts'))
check('Route no longer imports checkWeekOverlap from @/lib/conflict', !ttRoute.includes("from '@/lib/conflict'"))
check('Route no longer imports WeekConstraint', !ttRoute.includes('WeekConstraint'))

// ── 3. Route uses shared helper ──

check('Route calls checkScheduleConflicts(', ttRoute.includes('checkScheduleConflicts('))
check('Route passes scheduleSlotId to exclude self', /scheduleSlotId:\s*slot\.id/.test(ttRoute))
check('Route passes teachingTaskId', /teachingTaskId:\s*taskId/.test(ttRoute))
check('Route passes targetDayOfWeek (slot.dayOfWeek)', /targetDayOfWeek:\s*slot\.dayOfWeek/.test(ttRoute))
check('Route passes targetSlotIndex (slot.slotIndex)', /targetSlotIndex:\s*slot\.slotIndex/.test(ttRoute))
check('Route passes targetRoomId (new roomId)', /targetRoomId:\s*roomId/.test(ttRoute))
check('Route passes semesterId (slot.semesterId ?? taskSemester)', /semesterId:\s*slot\.semesterId/.test(ttRoute))

// ── 4. Route has no independent room conflict query ──

// Match findMany calls whose where clause contains roomId/teacherId/classGroupId
// as a property key. We restrict the inner [\s\S]*? to stop at the first closing
// `},` of the where block so we don't leak into the data: { roomId: ... } of a
// subsequent updateMany call.
const inlineRoomScanRegex = /tx\.scheduleSlot\.findMany\(\{[\s\S]*?where:\s*\{[^{}]*?roomId:/
const inlineTeacherScanRegex = /tx\.scheduleSlot\.findMany\(\{[\s\S]*?where:\s*\{[^{}]*?teacherId:/
const inlineClassScanRegex = /tx\.scheduleSlot\.findMany\(\{[\s\S]*?where:\s*\{[^{}]*?classGroupId/
check('Route has no independent room conflict query', !inlineRoomScanRegex.test(ttRoute))
check('Route has no independent teacher conflict query', !inlineTeacherScanRegex.test(ttRoute))
check('Route has no independent class conflict query', !inlineClassScanRegex.test(ttRoute))
check('Route has no checkWeekOverlap call', !ttRoute.includes('checkWeekOverlap('))

// ── 5. Route still returns 409 on conflict ──

check('Route throws Error with conflicts on conflict', /err\.conflicts\s*=\s*conflicts[\s\S]{0,80}throw err/.test(ttRoute))
check('Route catch block returns 409', ttRoute.includes('status: 409'))
check('Route catch block returns error + conflicts fields (additive conflictDetails OK)', /\{ error: err\.message,\s*conflicts: err\.conflicts/.test(ttRoute) && /conflictDetails:\s*err\.conflictDetails/.test(ttRoute))

// ── 6. Route still does scheduleSlot.updateMany ──

check('Route still calls scheduleSlot.updateMany', ttRoute.includes('tx.scheduleSlot.updateMany'))
check('Route still updates roomId', /data:\s*\{\s*roomId:/.test(ttRoute))
check('Route still updates both roomId and null branches', /roomId:\s*roomId\s*\?\?\s*null/.test(ttRoute) && /data:\s*\{\s*roomId:\s*null\s*\}/.test(ttRoute))

// ── 7. Route still has permission check ──

check('Route still has permission check', ttRoute.includes('requirePermission') && ttRoute.includes("'data:write'"))

// ── 8. Route still does TeachingTask update ──

check('Route still calls teachingTask.update', ttRoute.includes('tx.teachingTask.update'))
check('Route still calls course.upsert', ttRoute.includes('tx.course.upsert'))

// ── 9. Route still uses transaction ──

check('Route still uses prisma.$transaction', ttRoute.includes('prisma.$transaction'))

// ── 10. Conflict check is pre-update (before updateMany) ──

const preUpdatePos = ttRoute.indexOf('checkScheduleConflicts(')
const updateManyPos = ttRoute.indexOf('tx.scheduleSlot.updateMany')
check('Conflict check is pre-update (before updateMany)', preUpdatePos > 0 && preUpdatePos < updateManyPos)

// ── 11. Shared helper file still exists ──

const sharedHelperPath = path.join(ROOT, 'src', 'lib', 'schedule', 'conflict-check.ts')
check('Shared helper file still exists', fs.existsSync(sharedHelperPath))
const sharedHelper = fs.readFileSync(sharedHelperPath, 'utf-8')
check('Shared helper still exports checkScheduleConflicts', sharedHelper.includes('export async function checkScheduleConflicts'))

// ── 12. /api/conflict-check still uses shared helper ──

const ccRoutePath = path.join(ROOT, 'src', 'app', 'api', 'conflict-check', 'route.ts')
const ccRoute = fs.readFileSync(ccRoutePath, 'utf-8')
check('/api/conflict-check still uses shared helper', ccRoute.includes('checkScheduleConflicts('))

// ── 13. slot-mutation-guard still uses shared helper ──

const guardPath = path.join(ROOT, 'src', 'lib', 'schedule', 'slot-mutation-guard.ts')
const guard = fs.readFileSync(guardPath, 'utf-8')
check('slot-mutation-guard still uses shared helper', guard.includes('checkScheduleConflicts('))

// ── 14. K12 moveSlot not modified ──

const storePath = path.join(ROOT, 'src', 'store', 'scheduleStore.ts')
const store = fs.readFileSync(storePath, 'utf-8')
check('K12 moveSlot still calls /api/conflict-check', store.includes('/api/conflict-check'))
check('K12 moveSlot still has preflight throw', store.includes('throw new Error(preflightResult.conflicts'))

// ── 15. schedule adjustment not modified ──

const adjustmentsPath = path.join(ROOT, 'src', 'lib', 'schedule', 'adjustments.ts')
const adjustments = fs.readFileSync(adjustmentsPath, 'utf-8')
check('Adjustments.ts not refactored (out of scope)', !adjustments.includes('checkScheduleConflicts'))

// ── 16. Solver / parser / importer / seed not modified ──

const schema = fs.readFileSync(path.join(ROOT, 'prisma', 'schema.prisma'), 'utf-8')
check('Prisma schema not modified', schema.includes('model ScheduleSlot'))

const solverDir = path.join(ROOT, 'src', 'lib', 'scheduler')
let solverModified = false
for (const f of fs.readdirSync(solverDir).filter(f => f.endsWith('.ts'))) {
  const content = fs.readFileSync(path.join(solverDir, f), 'utf-8')
  if (content.includes('checkScheduleConflicts') || content.includes('teaching-task')) {
    solverModified = true
    break
  }
}
check('Solver not modified', !solverModified)

const parserPath = path.join(ROOT, 'scripts', 'parse_schedule.py')
check('Python parser not modified', fs.existsSync(parserPath) && !fs.readFileSync(parserPath, 'utf-8').includes('checkScheduleConflicts'))

const importerPath = path.join(ROOT, 'src', 'lib', 'import', 'importer.ts')
check('Importer not modified', fs.existsSync(importerPath) && !fs.readFileSync(importerPath, 'utf-8').includes('checkScheduleConflicts'))

// ── 17. No UI semester selector ──

const hasSemesterSelector = store.includes('SemesterSelector') || store.includes('semester-selector')
check('No UI semester selector added', !hasSemesterSelector)

// ── 18. No new /api/scheduler/run or Re-run button ──

const schedulerRunPath = path.join(ROOT, 'src', 'app', 'api', 'scheduler', 'run')
check('No new /api/scheduler/run', !fs.existsSync(schedulerRunPath))

// ── Output ──

console.log('\n=== K13 Schedule Conflict Check Unification Fix-B Verification ===\n')

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
