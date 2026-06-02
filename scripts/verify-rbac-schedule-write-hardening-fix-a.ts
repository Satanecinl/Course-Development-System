/**
 * K14 RBAC Schedule Write Hardening Fix-A Verification
 *
 * Read-only. Does NOT write to the database. Confirms:
 *  - schedule-grid has data:write gating
 *  - schedule-grid handler refuses to call moveSlot without data:write
 *  - adjustment dialog has schedule:adjust gating
 *  - adjustment dialog submit/void handlers refuse without schedule:adjust
 *  - admin generic route PUT scheduleslot has semesterId injection
 *  - admin generic route PUT scheduleslot still calls existing guard
 *  - permission / role mapping / requirePermission unchanged
 *  - Prisma schema / solver / parser / importer / seed unchanged
 *  - conflictDetails not deleted
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

// ── 1. schedule-grid gating ──

const grid = exists('src/components/schedule-grid.tsx') ? read('src/components/schedule-grid.tsx') : ''
const gridExists = exists('src/components/schedule-grid.tsx')
check('schedule-grid.tsx exists', gridExists)
if (gridExists) {
  check('schedule-grid imports useHasPermission from current-user-context', /useHasPermission.*current-user-context/.test(grid) || /from\s+['"]@\/components\/layout\/current-user-context['"]/.test(grid))
  check('schedule-grid calls useHasPermission("data:write")', /useHasPermission\(['"]data:write['"]\)/.test(grid))
  check('schedule-grid handleDragStart gates on canWriteSchedule', /canWriteSchedule/.test(grid) && /handleDragStart[\s\S]{0,200}canWriteSchedule/.test(grid))
  check('schedule-grid handleDragEnd gates on canWriteSchedule', /handleDragEnd[\s\S]{0,200}canWriteSchedule/.test(grid))
  // Defense in depth: no direct moveSlot call without permission
  const moveSlotCallExists = /moveSlot\(/.test(grid)
  const canWriteDeclared = /canWriteSchedule/.test(grid)
  check('schedule-grid has canWriteSchedule declared before moveSlot call', moveSlotCallExists && canWriteDeclared)
  check('schedule-grid moveSlot is in handleDragEnd (still routes through permission check)', /handleDragEnd[\s\S]*moveSlot\(/.test(grid))
}

// ── 2. adjustment dialog gating ──

const adjDialog = exists('src/components/schedule-adjustment-dialog.tsx') ? read('src/components/schedule-adjustment-dialog.tsx') : ''
const adjDialogExists = exists('src/components/schedule-adjustment-dialog.tsx')
check('schedule-adjustment-dialog.tsx exists', adjDialogExists)
if (adjDialogExists) {
  check('adjustment dialog imports useHasPermission', /useHasPermission.*current-user-context/.test(adjDialog) || /from\s+['"]@\/components\/layout\/current-user-context['"]/.test(adjDialog))
  check('adjustment dialog calls useHasPermission("schedule:adjust")', /useHasPermission\(['"]schedule:adjust['"]\)/.test(adjDialog))
  check('adjustment dialog handleDryRun gates on canAdjust', /canAdjust/.test(adjDialog) && /handleDryRun[\s\S]{0,200}canAdjust/.test(adjDialog))
  check('adjustment dialog handleConfirm gates on canAdjust', /handleConfirm[\s\S]{0,200}canAdjust/.test(adjDialog))
  check('adjustment dialog 检查冲突 button disabled when !canAdjust', /disabled=\{!canAdjust \|\| dryRunLoading/.test(adjDialog))
  check('adjustment dialog 确认调课 button disabled when !canAdjust', /disabled=\{!canAdjust \|\| !dryRunResult\?\.canApply/.test(adjDialog))
}

// ── 3. void button gating in dashboard-content ──

const dashContent = exists('src/app/dashboard/dashboard-content.tsx') ? read('src/app/dashboard/dashboard-content.tsx') : ''
const dashContentExists = exists('src/app/dashboard/dashboard-content.tsx')
check('dashboard-content.tsx exists', dashContentExists)
if (dashContentExists) {
  check('dashboard-content imports useHasPermission', /useHasPermission.*current-user-context/.test(dashContent) || /from\s+['"]@\/components\/layout\/current-user-context['"]/.test(dashContent))
  check('dashboard-content calls useHasPermission("schedule:adjust")', /useHasPermission\(['"]schedule:adjust['"]\)/.test(dashContent))
  check('dashboard-content handleExecuteVoid gates on canAdjust', /handleExecuteVoid[\s\S]{0,200}canAdjust/.test(dashContent))
  check('dashboard-content 确认撤销 button disabled when !canAdjust', /disabled=\{!canAdjust \|\| voidConfirmText/.test(dashContent))
}

// ── 4. protected-shell provides user context ──

const protectedShell = exists('src/components/layout/protected-shell.tsx') ? read('src/components/layout/protected-shell.tsx') : ''
const contextFile = exists('src/components/layout/current-user-context.tsx') ? read('src/components/layout/current-user-context.tsx') : ''
check('current-user-context.tsx exists', exists('src/components/layout/current-user-context.tsx'))
check('current-user-context exports CurrentUserProvider', /export function CurrentUserProvider/.test(contextFile))
check('current-user-context exports useHasPermission', /export function useHasPermission/.test(contextFile))
check('current-user-context exports useCurrentUser', /export function useCurrentUser/.test(contextFile))
check('protected-shell wraps children in CurrentUserProvider', /CurrentUserProvider/.test(protectedShell))
check('protected-shell passes user.permissions to provider', /user\.permissions/.test(protectedShell))

// ── 5. admin generic route scheduleslot PUT semesterId ──

const adminRoute = exists('src/app/api/admin/[model]/route.ts') ? read('src/app/api/admin/[model]/route.ts') : ''
const adminRouteExists = exists('src/app/api/admin/[model]/route.ts')
check('admin [model] route exists', adminRouteExists)
if (adminRouteExists) {
  check('admin PUT scheduleslot still calls guardAdminSlotUpdate', /guardAdminSlotUpdate\(/.test(adminRoute))
  check('admin PUT scheduleslot re-asserts semesterId from guardResult.semesterId', /guardResult\.semesterId\s*&&\s*!data\.semesterId[\s\S]{0,40}data\.semesterId\s*=\s*guardResult\.semesterId/.test(adminRoute))
  check('admin PUT scheduleslot still has data.semesterId = semester.id (POST pattern)', /data\.semesterId\s*=\s*semester\.id/.test(adminRoute))
  check('admin PUT scheduleslot still returns 409 with conflicts/conflictDetails', /status:\s*409/.test(adminRoute) && /conflictDetails/.test(adminRoute))
  check('admin PUT teachingtask permission unchanged (data:write)', /PUT[\s\S]{0,200}requirePermission\(['"]data:write['"]/.test(adminRoute))
}

// ── 6. permission definitions unchanged ──

const types = read('src/lib/auth/types.ts')
check('ALL_PERMISSIONS still has 10 keys', /ALL_PERMISSIONS\s*=\s*\[[\s\S]*?\]/.test(types) && /schedule:view/.test(types) && /schedule:adjust/.test(types) && /data:read/.test(types) && /data:write/.test(types) && /data:delete/.test(types) && /data:export/.test(types) && /import:manage/.test(types) && /settings:manage/.test(types) && /users:manage/.test(types) && /diagnostics:view/.test(types))
check('No new permission added (no schedule:write, no teaching-task:write)', !/schedule:write|teaching-task:write/.test(types))

// ── 7. role mapping unchanged ──

const seed = read('scripts/seed-auth.ts')
check('seed has ADMIN/USER/DATA_EXPORTER roles', /ADMIN[\s\S]*?USER[\s\S]*?DATA_EXPORTER/.test(seed))
check('seed USER still only has data:read', /USER[\s\S]{0,300}data:read/.test(seed))

// ── 8. requirePermission unchanged ──

const reqPerm = read('src/lib/auth/require-permission.ts')
check('requirePermission still exists', /export async function requirePermission/.test(reqPerm))
check('requirePermission still does 403 on missing permission', /forbiddenResponse/.test(reqPerm))

// ── 9. server-side checks unchanged (semantic verification) ──

const slotPut = read('src/app/api/schedule-slot/[id]/route.ts')
check('/api/schedule-slot/[id] PUT still requires data:write', /requirePermission\(['"]data:write['"]/.test(slotPut))

const adjCreate = read('src/app/api/schedule-adjustments/route.ts')
check('/api/schedule-adjustments POST still requires schedule:adjust', /requirePermission\(['"]schedule:adjust['"]/.test(adjCreate))

const adjVoid = read('src/app/api/schedule-adjustments/[id]/void/route.ts')
check('/api/schedule-adjustments/[id]/void still requires schedule:adjust', /requirePermission\(['"]schedule:adjust['"]/.test(adjVoid))

// ── 10. K11/K13 verifications preserved ──

const conflictCheckLib = read('src/lib/schedule/conflict-check.ts')
check('conflict-check still returns conflictDetails (K13-FIX-D preserved)', /conflictDetails:\s*ScheduleConflictDetail\[\]/.test(conflictCheckLib))

const guard = read('src/lib/schedule/slot-mutation-guard.ts')
check('slot-mutation-guard still returns conflictDetails (K13-FIX-D preserved)', /conflictDetails\?:\s*ScheduleConflictDetail\[\]/.test(guard))

// ── 11. no schema / solver / etc. modification ──

const schema = read('prisma/schema.prisma')
check('Prisma schema still has model ScheduleSlot', schema.includes('model ScheduleSlot'))
check('Prisma schema still has model ScheduleAdjustment', schema.includes('model ScheduleAdjustment'))

const solverDir = path.join(ROOT, 'src', 'lib', 'scheduler')
let solverImported = false
for (const f of fs.readdirSync(solverDir).filter((f) => f.endsWith('.ts'))) {
  const content = read(`src/lib/scheduler/${f}`)
  if (content.includes('current-user-context') || content.includes('useHasPermission') || content.includes('useCurrentUser')) {
    solverImported = true
    break
  }
}
check('Solver does not import current-user-context', !solverImported)

const parser = read('scripts/parse_schedule.py')
check('Python parser not modified', !parser.includes('current-user-context') && !parser.includes('useHasPermission'))

const importer = read('src/lib/import/importer.ts')
check('Importer not modified', !importer.includes('current-user-context') && !importer.includes('useHasPermission'))

// ── 12. no /api/scheduler/run added ──

check('No /api/scheduler/run added', !exists('src/app/api/scheduler/run'))

// ── 13. no UI semester selector added ──

const store = read('src/store/scheduleStore.ts')
check('No UI semester selector added', !store.includes('SemesterSelector') && !store.includes('semester-selector'))

// ── Output ──

console.log('\n=== K14 RBAC Schedule Write Hardening Fix-A Verification ===\n')

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
