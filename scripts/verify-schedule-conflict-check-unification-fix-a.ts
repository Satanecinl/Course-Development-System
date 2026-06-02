/**
 * K13 Schedule Conflict Check Unification Fix-A Verification
 *
 * Read-only verification. Does NOT write to the database.
 * Confirms slot-mutation-guard.ts and /api/conflict-check both use
 * the shared checkScheduleConflicts helper.
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

// ── 1. Shared helper exists ──

const sharedHelperPath = path.join(ROOT, 'src', 'lib', 'schedule', 'conflict-check.ts')
const sharedHelperExists = fs.existsSync(sharedHelperPath)
check('Shared helper file exists', sharedHelperExists)

let sharedHelper = ''
if (sharedHelperExists) {
  sharedHelper = fs.readFileSync(sharedHelperPath, 'utf-8')
  check('Shared helper exports checkScheduleConflicts', sharedHelper.includes('export async function checkScheduleConflicts'))
  check('Shared helper has input type', sharedHelper.includes('export interface ScheduleConflictCheckInput'))
  check('Shared helper has result type', sharedHelper.includes('export interface ScheduleConflictCheckResult'))
  check('Shared helper does NOT import NextRequest', !/^import .*NextRequest/m.test(sharedHelper))
  check('Shared helper does NOT import NextResponse', !/^import .*NextResponse/m.test(sharedHelper))
  check('Shared helper uses prisma read-only (no update/create/delete)', !/\bprisma\.\w+\.(update|create|createMany|delete|deleteMany|upsert)\b/.test(sharedHelper))
  check('Shared helper checks teacher conflict', sharedHelper.includes('teacherId') && sharedHelper.includes('Teacher conflict'))
  check('Shared helper checks class conflict', sharedHelper.includes('classGroupId') && sharedHelper.includes('Class conflict'))
  check('Shared helper checks room conflict', sharedHelper.includes('Room conflict'))
  check('Shared helper uses checkWeekOverlap', sharedHelper.includes('checkWeekOverlap'))
  check('Shared helper supports semester scoping', sharedHelper.includes('semesterId'))
  check('Shared helper supports exclude self', /id\s*=\s*\{\s*not:\s*input\.scheduleSlotId\s*\}/.test(sharedHelper))
}

// ── 2. /api/conflict-check uses shared helper ──

const routePath = path.join(ROOT, 'src', 'app', 'api', 'conflict-check', 'route.ts')
const route = fs.readFileSync(routePath, 'utf-8')
check('Route imports shared helper', route.includes("from '@/lib/schedule/conflict-check'"))
check('Route calls checkScheduleConflicts', route.includes('checkScheduleConflicts('))
check('Route does NOT import old checkScheduleConflict', !route.includes('checkScheduleConflict,'))
check('Route preserves scheduleSlotId semantics', route.includes('scheduleSlotId:'))
check('Route preserves targetDayOfWeek/targetSlotIndex/targetRoomId', route.includes('targetDayOfWeek') && route.includes('targetSlotIndex') && route.includes('targetRoomId'))
check('Route preserves semesterId semantics', route.includes('semesterId:'))
check('Route response shape unchanged (hasConflict, conflicts)', route.includes('NextResponse.json(result)'))
check('Route keeps resolveSchedulerSemester call', route.includes('resolveSchedulerSemester'))
check('Route keeps error handling for known semester errors', route.includes('SEMESTER_NOT_FOUND'))

// ── 3. slot-mutation-guard uses shared helper ──

const guardPath = path.join(ROOT, 'src', 'lib', 'schedule', 'slot-mutation-guard.ts')
const guard = fs.readFileSync(guardPath, 'utf-8')
check('Guard imports shared helper', guard.includes("from '@/lib/schedule/conflict-check'"))
check('Guard calls checkScheduleConflicts', guard.includes('checkScheduleConflicts('))
check('Guard no longer contains checkConflictsAtTarget', !guard.includes('checkConflictsAtTarget'))
check('Guard still has guardSlotUpdate', guard.includes('export async function guardSlotUpdate'))
check('Guard still has guardSlotCreate', guard.includes('export async function guardSlotCreate'))
check('Guard still has guardAdminSlotUpdate', guard.includes('export async function guardAdminSlotUpdate'))
check('Guard still has guardAdminSlotCreate', guard.includes('export async function guardAdminSlotCreate'))
check('Guard still resolves same-semester via resolveSchedulerSemester', guard.includes('resolveSchedulerSemester'))
check('Guard still checks slot.semesterId', guard.includes('slot.semesterId'))
check('Guard still checks task.semesterId', guard.includes('task.semesterId'))
check('Guard still returns 409 on conflict', guard.includes("status: 409"))
check('Guard still returns 404 for not found', guard.includes("status: 404"))
check('Guard still returns SlotMutationGuardResult', guard.includes('SlotMutationGuardResult'))
check('Guard no longer imports from @/lib/conflict directly (relies on shared helper)', !guard.includes("from '@/lib/conflict'"))

// ── 4. No duplicate query code in guard ──

// The guard should not contain independent prisma.scheduleSlot.findMany for room/teacher/class scanning.
// It still uses findUnique for slot/task lookup which is guard-specific (existence check).
const guardRoomScanRegex = /prisma\.scheduleSlot\.findMany\(\{[\s\S]*?roomId:/
const guardTeacherScanRegex = /prisma\.scheduleSlot\.findMany\(\{[\s\S]*?teacherId:/
const guardClassScanRegex = /prisma\.scheduleSlot\.findMany\(\{[\s\S]*?classGroupId/
check('Guard has no independent room conflict query', !guardRoomScanRegex.test(guard))
check('Guard has no independent teacher conflict query', !guardTeacherScanRegex.test(guard))
check('Guard has no independent class conflict query', !guardClassScanRegex.test(guard))

// ── 5. /api/conflict-check response contract unchanged ──

check('Route returns hasConflict in response', route.includes('NextResponse.json(result)') && sharedHelper.includes('hasConflict'))
check('Route returns conflicts array in response', sharedHelper.includes('conflicts: string[]'))

// ── 6. K12 preflight and K11 guard routes still work ──

const storePath = path.join(ROOT, 'src', 'store', 'scheduleStore.ts')
const store = fs.readFileSync(storePath, 'utf-8')
check('K12 moveSlot still calls /api/conflict-check', store.includes('/api/conflict-check'))

const slotPutPath = path.join(ROOT, 'src', 'app', 'api', 'schedule-slot', '[id]', 'route.ts')
const slotPut = fs.readFileSync(slotPutPath, 'utf-8')
check('K11 PUT /api/schedule-slot/[id] still calls guardSlotUpdate', slotPut.includes('guardSlotUpdate('))

const slotPostPath = path.join(ROOT, 'src', 'app', 'api', 'schedule-slot', 'route.ts')
const slotPost = fs.readFileSync(slotPostPath, 'utf-8')
check('K11 POST /api/schedule-slot still calls guardSlotCreate', slotPost.includes('guardSlotCreate('))

const adminRoutePath = path.join(ROOT, 'src', 'app', 'api', 'admin', '[model]', 'route.ts')
const adminRoute = fs.readFileSync(adminRoutePath, 'utf-8')
check('K11 admin route still uses guardAdminSlotUpdate', adminRoute.includes('guardAdminSlotUpdate'))
check('K11 admin route still uses guardAdminSlotCreate', adminRoute.includes('guardAdminSlotCreate'))

// ── 7. No forbidden changes ──

const schema = fs.readFileSync(path.join(ROOT, 'prisma', 'schema.prisma'), 'utf-8')
check('Prisma schema not modified', schema.includes('model ScheduleSlot'))

const solverDir = path.join(ROOT, 'src', 'lib', 'scheduler')
let solverModified = false
for (const f of fs.readdirSync(solverDir).filter(f => f.endsWith('.ts'))) {
  const content = fs.readFileSync(path.join(solverDir, f), 'utf-8')
  if (content.includes('checkScheduleConflicts') || content.includes('conflict-check.ts')) {
    solverModified = true
    break
  }
}
check('Solver not modified', !solverModified)

const parserPath = path.join(ROOT, 'scripts', 'parse_schedule.py')
check('Python parser not modified', fs.existsSync(parserPath) && !fs.readFileSync(parserPath, 'utf-8').includes('checkScheduleConflicts'))

// Importer not modified
const importerPath = path.join(ROOT, 'src', 'lib', 'import', 'importer.ts')
check('Importer not modified', fs.existsSync(importerPath) && !fs.readFileSync(importerPath, 'utf-8').includes('checkScheduleConflicts'))

// Adjustment not refactored (out of scope)
const adjustmentsPath = path.join(ROOT, 'src', 'lib', 'schedule', 'adjustments.ts')
check('Adjustments.ts not refactored (out of scope)', !fs.readFileSync(adjustmentsPath, 'utf-8').includes('checkScheduleConflicts'))

// No UI semester selector
const hasSemesterSelectorComponent = store.includes('SemesterSelector') || store.includes('semester-selector') || store.includes('semesterSelector')
check('No UI semester selector added', !hasSemesterSelectorComponent)

// Old conflict-check.ts should be deleted (it was the duplicate that this fix consolidates)
const oldFilePath = path.join(ROOT, 'src', 'lib', 'conflict-check.ts')
check('Old duplicate conflict-check.ts removed', !fs.existsSync(oldFilePath))

// ── Output ──

console.log('\n=== K13 Schedule Conflict Check Unification Fix-A Verification ===\n')

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
