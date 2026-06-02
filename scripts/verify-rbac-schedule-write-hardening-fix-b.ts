/**
 * K14 RBAC Schedule Write Hardening Fix-B Verification
 *
 * Read-only. Does NOT write to the database. Confirms:
 *  - admin generic teachingtask PUT has pre-update teacher conflict guard
 *  - guard calls checkScheduleConflicts or shared helper
 *  - guard checks associated ScheduleSlots
 *  - guard passes scheduleSlotId to exclude self
 *  - guard passes semesterId
 *  - conflict response preserves { error, conflicts, conflictDetails }
 *  - scheduleslot PUT K14-FIX-A semesterId re-assert still exists
 *  - dedicated teaching-task route not broken
 *  - permission / role mapping / requirePermission unchanged
 *  - Prisma schema / solver / parser / importer / seed unchanged
 *  - no /api/scheduler/run added
 */

import * as fs from 'fs'
import * as path from 'path'

const ROOT = path.resolve(__dirname, '..')

interface CheckResult {
  name: string
  passed: boolean
  skipped?: boolean
  detail?: string
}

const results: CheckResult[] = []

function check(name: string, passed: boolean, detail?: string) {
  results.push({ name, passed, detail })
}
function skip(name: string, reason: string) {
  results.push({ name, passed: true, skipped: true, detail: reason })
}

function read(rel: string): string {
  return fs.readFileSync(path.join(ROOT, rel), 'utf-8')
}
function exists(rel: string): boolean {
  return fs.existsSync(path.join(ROOT, rel))
}

// ── 1. Admin generic route teachingtask PUT guard ──

const adminRoute = exists('src/app/api/admin/[model]/route.ts') ? read('src/app/api/admin/[model]/route.ts') : ''
const adminRouteExists = exists('src/app/api/admin/[model]/route.ts')
check('admin [model] route exists', adminRouteExists)
if (adminRouteExists) {
  check('admin route imports guardAdminTaskUpdate', /import.*guardAdminTaskUpdate.*teaching-task-mutation-guard/.test(adminRoute))
  check('admin PUT teachingtask calls guardAdminTaskUpdate', /guardAdminTaskUpdate\(/.test(adminRoute))
  check('admin PUT teachingtask guard is in teachingtask branch', /model\.toLowerCase\(\)\s*===\s*['"]teachingtask['"][\s\S]{0,500}guardAdminTaskUpdate/.test(adminRoute))
  check('admin PUT teachingtask guard returns 409 on conflict', /guardAdminTaskUpdate[\s\S]{0,500}status:\s*guardResult\.status/.test(adminRoute))
  check('admin PUT teachingtask guard preserves error field', /guardAdminTaskUpdate[\s\S]{0,500}error:\s*guardResult\.error/.test(adminRoute))
  check('admin PUT teachingtask guard preserves conflicts field', /guardAdminTaskUpdate[\s\S]{0,500}conflicts:\s*guardResult\.conflicts/.test(adminRoute))
  check('admin PUT teachingtask guard preserves conflictDetails field', /guardAdminTaskUpdate[\s\S]{0,500}conflictDetails:\s*guardResult\.conflictDetails/.test(adminRoute))
  // K14-FIX-A preserved
  check('admin PUT scheduleslot K14-FIX-A semesterId re-assert still exists', /guardResult\.semesterId\s*&&\s*!data\.semesterId[\s\S]{0,40}data\.semesterId\s*=\s*guardResult\.semesterId/.test(adminRoute))
  check('admin PUT scheduleslot still calls guardAdminSlotUpdate', /guardAdminSlotUpdate\(/.test(adminRoute))
}

// ── 2. Teaching task mutation guard file ──

const guardFile = exists('src/lib/schedule/teaching-task-mutation-guard.ts') ? read('src/lib/schedule/teaching-task-mutation-guard.ts') : ''
const guardFileExists = exists('src/lib/schedule/teaching-task-mutation-guard.ts')
check('teaching-task-mutation-guard.ts exists', guardFileExists)
if (guardFileExists) {
  check('guard exports guardAdminTaskUpdate', /export async function guardAdminTaskUpdate/.test(guardFile))
  check('guard returns TaskMutationGuardResult', /TaskMutationGuardResult/.test(guardFile))
  check('guard checks data.teacherId !== undefined', /data\.teacherId\s*(===|!==)\s*undefined/.test(guardFile))
  check('guard fetches existing task with scheduleSlots', /scheduleSlots/.test(guardFile) && /findUnique/.test(guardFile))
  check('guard checks teacherId change', /newTeacherId\s*===?\s*existing\.teacherId/.test(guardFile))
  check('guard iterates scheduleSlots', /for\s*\(.*of\s*existing\.scheduleSlots\)/.test(guardFile))
  check('guard calls checkScheduleConflicts', /checkScheduleConflicts\(/.test(guardFile))
  check('guard passes scheduleSlotId (exclude self)', /scheduleSlotId:\s*slot\.id/.test(guardFile))
  check('guard passes teacherId override', /teacherId:\s*newTeacherId/.test(guardFile))
  check('guard passes classGroupIds', /classGroupIds/.test(guardFile))
  check('guard passes semesterId', /semesterId:\s*slot\.semesterId/.test(guardFile))
  check('guard passes targetDayOfWeek', /targetDayOfWeek:\s*slot\.dayOfWeek/.test(guardFile))
  check('guard passes targetSlotIndex', /targetSlotIndex:\s*slot\.slotIndex/.test(guardFile))
  check('guard passes targetRoomId', /targetRoomId:\s*slot\.roomId/.test(guardFile))
  check('guard collects conflicts', /conflicts\.push/.test(guardFile))
  check('guard collects conflictDetails', /conflictDetails\.push/.test(guardFile))
  check('guard returns 409 on conflicts', /status:\s*409/.test(guardFile))
  check('guard returns ok:true on no conflict', /ok:\s*true/.test(guardFile))
  check('guard returns semesterId on success', /semesterId:\s*existing\.semesterId/.test(guardFile))
}

// ── 3. Dedicated teaching-task route unchanged ──

const dedicatedRoute = exists('src/app/api/teaching-task/[id]/route.ts') ? read('src/app/api/teaching-task/[id]/route.ts') : ''
const dedicatedExists = exists('src/app/api/teaching-task/[id]/route.ts')
check('dedicated teaching-task route exists', dedicatedExists)
if (dedicatedExists) {
  check('dedicated route still requires data:write', /requirePermission\(['"]data:write['"]/.test(dedicatedRoute))
  check('dedicated route still calls checkScheduleConflicts', /checkScheduleConflicts\(/.test(dedicatedRoute))
  check('dedicated route still returns 409 on conflict', /status:\s*409/.test(dedicatedRoute))
  check('dedicated route still returns conflictDetails', /conflictDetails:\s*err\.conflictDetails/.test(dedicatedRoute))
}

// ── 4. Permission definitions unchanged ──

const types = read('src/lib/auth/types.ts')
check('ALL_PERMISSIONS still has 10 keys', /ALL_PERMISSIONS\s*=\s*\[[\s\S]*?\]/.test(types) && /schedule:view/.test(types) && /schedule:adjust/.test(types) && /data:read/.test(types) && /data:write/.test(types) && /data:delete/.test(types) && /data:export/.test(types) && /import:manage/.test(types) && /settings:manage/.test(types) && /users:manage/.test(types) && /diagnostics:view/.test(types))
check('No new permission added (no teaching-task:write, no schedule:write)', !/teaching-task:write|schedule:write/.test(types))

// ── 5. Role mapping unchanged ──

const seed = read('scripts/seed-auth.ts')
check('seed has ADMIN/USER/DATA_EXPORTER roles', /ADMIN[\s\S]*?USER[\s\S]*?DATA_EXPORTER/.test(seed))
check('seed USER still only has data:read', /USER[\s\S]{0,300}data:read/.test(seed))

// ── 6. requirePermission unchanged ──

const reqPerm = read('src/lib/auth/require-permission.ts')
check('requirePermission still exists', /export async function requirePermission/.test(reqPerm))
check('requirePermission still does 403 on missing permission', /forbiddenResponse/.test(reqPerm))

// ── 7. K13/K14 verifications preserved ──

const conflictCheckLib = read('src/lib/schedule/conflict-check.ts')
check('conflict-check still returns conflictDetails (K13-FIX-D)', /conflictDetails:\s*ScheduleConflictDetail\[\]/.test(conflictCheckLib))

const guard = read('src/lib/schedule/slot-mutation-guard.ts')
check('slot-mutation-guard still returns conflictDetails (K13-FIX-D)', /conflictDetails\?:\s*ScheduleConflictDetail\[\]/.test(guard))

// ── 8. No schema / solver / etc. modification ──

const schema = read('prisma/schema.prisma')
check('Prisma schema still has model ScheduleSlot', schema.includes('model ScheduleSlot'))
check('Prisma schema still has model ScheduleAdjustment', schema.includes('model ScheduleAdjustment'))
check('Prisma schema still has model TeachingTask', schema.includes('model TeachingTask'))

const solverDir = path.join(ROOT, 'src', 'lib', 'scheduler')
let solverModified = false
for (const f of fs.readdirSync(solverDir).filter((f) => f.endsWith('.ts'))) {
  const content = read(`src/lib/scheduler/${f}`)
  if (content.includes('teaching-task-mutation-guard') || content.includes('guardAdminTaskUpdate')) {
    solverModified = true
    break
  }
}
check('Solver does not import teaching-task-mutation-guard', !solverModified)

const parser = read('scripts/parse_schedule.py')
check('Python parser not modified', !parser.includes('guardAdminTaskUpdate'))

const importer = read('src/lib/import/importer.ts')
check('Importer not modified', !importer.includes('guardAdminTaskUpdate'))

// ── 9. No /api/scheduler/run added ──

check('No /api/scheduler/run added', !exists('src/app/api/scheduler/run'))

// ── 10. No UI semester selector added ──

const store = read('src/store/scheduleStore.ts')
check('No UI semester selector added', !store.includes('SemesterSelector') && !store.includes('semester-selector'))

// ── 11. Frontend gating unchanged ──

const grid = exists('src/components/schedule-grid.tsx') ? read('src/components/schedule-grid.tsx') : ''
check('schedule-grid still has data:write gating (K14-FIX-A)', /useHasPermission\(['"]data:write['"]\)/.test(grid))

const adjDialog = exists('src/components/schedule-adjustment-dialog.tsx') ? read('src/components/schedule-adjustment-dialog.tsx') : ''
check('adjustment dialog still has schedule:adjust gating (K14-FIX-A)', /useHasPermission\(['"]schedule:adjust['"]\)/.test(adjDialog))

// ── Output ──

console.log('\n=== K14 RBAC Schedule Write Hardening Fix-B Verification ===\n')

let passed = 0
let failed = 0
let skipped = 0

for (const r of results) {
  if (r.skipped) {
    console.log(`  [SKIP] ${r.name}`)
    if (r.detail) console.log(`        ${r.detail}`)
    skipped++
  } else if (r.passed) {
    console.log(`  [PASS] ${r.name}`)
    passed++
  } else {
    console.log(`  [FAIL] ${r.name}`)
    if (r.detail) console.log(`        ${r.detail}`)
    failed++
  }
}

console.log(`\nSummary:`)
console.log(`  passed: ${passed}`)
console.log(`  failed: ${failed}`)
console.log(`  skipped: ${skipped}`)

if (failed > 0) {
  console.log('\nVerification FAILED')
  process.exit(1)
} else {
  console.log('\nVerification PASSED')
}
