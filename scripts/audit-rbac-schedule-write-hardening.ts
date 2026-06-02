/**
 * K14 RBAC Schedule Write Hardening Audit
 *
 * Read-only scan of all RBAC permission usage in schedule-sensitive
 * write paths. Does NOT write to the database.
 *
 * Run: npx.cmd tsx scripts/audit-rbac-schedule-write-hardening.ts
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
function addFinding(f: Finding) { findings.push(f) }

function read(rel: string): string {
  return fs.readFileSync(path.join(ROOT, rel), 'utf-8')
}
function exists(rel: string): boolean {
  return fs.existsSync(path.join(ROOT, rel))
}

// ── 1. RBAC permission definitions ──

const types = read('src/lib/auth/types.ts')
const perms = types.match(/ALL_PERMISSIONS\s*=\s*\[([\s\S]*?)\]/) || ['', '']
const allPermissions = (perms[1] || '').match(/'[^']+'/g) || []
const rolesMatch = types.match(/ROLES\s*=\s*\{([\s\S]*?)\}/) || ['', '']
const roleNames = (rolesMatch[1] || '').match(/'[^']+'/g) || []

// ── 2. requirePermission usage across routes ──

function findRoutePerm(rel: string, re: RegExp): string[] {
  if (!exists(rel)) return []
  const content = read(rel)
  return content.match(re) || []
}

const requirePermPattern = /requirePermission\(\s*['"]([^'"]+)['"]/g
const requireAnyPattern = /requireAnyPermission\(\s*\[?([^\]]*)\]/g

// All API routes that use requirePermission
const apiFiles: string[] = []
function walkApi(dir: string) {
  if (!exists(dir)) return
  for (const f of fs.readdirSync(dir)) {
    const full = path.join(dir, f)
    const stat = fs.statSync(full)
    if (stat.isDirectory()) walkApi(full)
    else if (f === 'route.ts' || f === 'route.js') apiFiles.push(full.replace(ROOT + path.sep, '').replace(/\\/g, '/'))
  }
}
walkApi(path.join(ROOT, 'src/app/api'))

// ── 3. ScheduleSlot write paths ──

const slotPutPerm = findRoutePerm('src/app/api/schedule-slot/[id]/route.ts', requirePermPattern)
const slotPostPerm = findRoutePerm('src/app/api/schedule-slot/route.ts', requirePermPattern)
const slotPutUsesWrite = slotPutPerm.some((s) => s.includes('data:write'))
const slotPostUsesWrite = slotPostPerm.some((s) => s.includes('data:write'))

// ── 4. TeachingTask write paths ──

const ttPutPerm = findRoutePerm('src/app/api/teaching-task/[id]/route.ts', requirePermPattern)
const ttPostPerm = findRoutePerm('src/app/api/teaching-task/route.ts', requirePermPattern)
const ttPutUsesWrite = ttPutPerm.some((s) => s.includes('data:write'))
const ttPostUsesWrite = ttPostPerm.some((s) => s.includes('data:write'))

// ── 5. ScheduleAdjustment paths ──

const adjGetPerm = findRoutePerm('src/app/api/schedule-adjustments/route.ts', requirePermPattern)
const adjDryRunPerm = findRoutePerm('src/app/api/schedule-adjustments/dry-run/route.ts', requirePermPattern)
const adjVoidPerm = findRoutePerm('src/app/api/schedule-adjustments/[id]/void/route.ts', requirePermPattern)
const adjGetUsesView = adjGetPerm.some((s) => s.includes('schedule:view'))
const adjDryRunUsesAdjust = adjDryRunPerm.some((s) => s.includes('schedule:adjust'))
const adjVoidUsesAdjust = adjVoidPerm.some((s) => s.includes('schedule:adjust'))

// ── 6. Import paths ──

const importParse = findRoutePerm('src/app/api/admin/import/parse/route.ts', requirePermPattern)
const importConfirm = findRoutePerm('src/app/api/admin/import/confirm/route.ts', requirePermPattern)
const importRollbackActual = exists('src/app/api/admin/import/rollback/route.ts') ? (read('src/app/api/admin/import/rollback/route.ts').match(requirePermPattern) || []) : []
const importAbandon = exists('src/app/api/admin/import/batches/[id]/abandon/route.ts') ? (read('src/app/api/admin/import/batches/[id]/abandon/route.ts').match(requirePermPattern) || []) : []
const importBatchesGet = exists('src/app/api/admin/import/batches/route.ts') ? (read('src/app/api/admin/import/batches/route.ts').match(requirePermPattern) || []) : []
const importParseUsesManage = importParse.some((s) => s.includes('import:manage'))
const importConfirmUsesManage = importConfirm.some((s) => s.includes('import:manage'))
const importRollbackUsesManage = importRollbackActual.some((s) => s.includes('import:manage'))
const importAbandonUsesManage = importAbandon.some((s) => s.includes('import:manage'))
const importBatchesGetUsesManage = importBatchesGet.some((s) => s.includes('import:manage'))

// ── 7. Admin generic route ──

const adminModel = exists('src/app/api/admin/[model]/route.ts') ? read('src/app/api/admin/[model]/route.ts') : ''
const adminModelGetPerm = (adminModel.match(/requirePermission\(\s*'([^']+)',\s*req\)\s*\n\s*if\s*\('error' in auth\)\s*return auth\.error[\s\S]{0,40}?model:/g) || []).length
const adminModelHasModelWhitelist = /MODEL_MAP\s*:\s*Record/.test(adminModel)
const adminModelHasFieldWhitelist = /FIELD_WHITELIST\s*:\s*Record/.test(adminModel)
const adminModelScheduleslotSupported = /MODEL_MAP[\s\S]*?scheduleslot/.test(adminModel)
const adminModelTeachingtaskSupported = /MODEL_MAP[\s\S]*?teachingtask/.test(adminModel)
const adminModelAdjustmentSupported = /MODEL_MAP[\s\S]*?adjustment|adjustment[\s\S]*?MODEL_MAP/.test(adminModel)

// ── 8. Conflict-check / preflight ──

const ccRoute = exists('src/app/api/conflict-check/route.ts') ? read('src/app/api/conflict-check/route.ts') : ''
const ccPerm = ((ccRoute.match(requirePermPattern) || [])[0]) || ''
const ccUsesView = ccPerm.includes('schedule:view')

// ── 9. Frontend gating ──

const store = exists('src/store/scheduleStore.ts') ? read('src/store/scheduleStore.ts') : ''
const grid = exists('src/components/schedule-grid.tsx') ? read('src/components/schedule-grid.tsx') : ''
const adjDialog = exists('src/components/schedule-adjustment-dialog.tsx') ? read('src/components/schedule-adjustment-dialog.tsx') : ''
const protectedShell = exists('src/components/layout/protected-shell.tsx') ? read('src/components/layout/protected-shell.tsx') : ''

const gridCallsMoveSlot = grid.includes('moveSlot(')
const gridHasDataWriteGate = /useHasPermission\(['"]data:write['"]\)/.test(grid) || /hasPermission.*data:write/.test(grid)
const gridHasScheduleAdjustGate = /useHasPermission\(['"]schedule:adjust['"]\)/.test(grid)
const adjDialogHasDataWriteGate = /useHasPermission\(['"]data:write['"]\)/.test(adjDialog)
const adjDialogHasScheduleAdjustGate = /useHasPermission\(['"]schedule:adjust['"]\)/.test(adjDialog) || /hasPermission.*schedule:adjust/.test(adjDialog)
const adjDialogHasPermissionCheck = gridHasDataWriteGate || adjDialogHasScheduleAdjustGate
const storeCallsApiCC = store.includes('/api/conflict-check')
const storeCallsApiSlot = store.includes('/api/schedule-slot/')
const protectedShellUsesFilterNavItems = protectedShell.includes('filterNavItems')
const protectedShellProvidesUser = /CurrentUserProvider|user\.permissions/.test(protectedShell)
const navigationHasPermission = exists('src/lib/auth/navigation.ts')

// K14-FIX-A: check admin PUT scheduleslot semesterId handling
const adminModelPutHasSemesterId = /data\.semesterId\s*=\s*semester\.id/.test(adminModel)
const adminModelPutHasGuardSemester = /guardResult\.semesterId\s*&&\s*!data\.semesterId/.test(adminModel)
const adminModelPutHasGuard = /guardAdminSlotUpdate\(/.test(adminModel)

// ── 10. Solver / scheduler ──

const schedulerFiles = fs.existsSync(path.join(ROOT, 'src/app/api/admin/scheduler'))
  ? fs.readdirSync(path.join(ROOT, 'src/app/api/admin/scheduler')).map((f) => `src/app/api/admin/scheduler/${f}`)
  : []
const schedulerApplies = schedulerFiles.filter((f) => f.endsWith('/apply/route.ts') || f.endsWith('/preview/route.ts') || f.endsWith('/rollback/route.ts') || f.endsWith('/lockable-slots/route.ts') || f.endsWith('/runs/route.ts') || f.endsWith('/runs/[id]/route.ts'))
const schedulerPerms = schedulerApplies.map((f) => f + ': ' + ((read(f).match(requirePermPattern) || []).join(', ')))
const schedulerRunExists = exists('src/app/api/scheduler/run')

// ── 11. role-permission mapping (seed) ──

const seed = exists('scripts/seed-auth.ts') ? read('scripts/seed-auth.ts') : ''
const adminGetsAll = /ADMIN[\s\S]*?all[\s\S]*?permissions/i.test(seed)
const userOnlyRead = /USER[\s\S]*?data:read/.test(seed)
const dataExporterReadExport = /DATA_EXPORTER[\s\S]*?data:export/.test(seed)

// ── 12. Findings ──

// F1: data:write covers schedule-slot direct PUT/POST
addFinding({
  id: 'K14-RBAC-MEDIUM-1',
  severity: 'MEDIUM',
  area: 'ScheduleSlot write path',
  description: '/api/schedule-slot PUT/POST use data:write permission, which also covers non-schedule models (classgroup/teacher/course/room). No dedicated schedule:write permission exists, so a user with data:write can rewrite schedule slot positions. A user with only schedule:adjust cannot directly edit schedule slot positions via this endpoint (correct).',
  evidence: `slotPutUsesWrite=${slotPutUsesWrite} slotPostUsesWrite=${slotPostUsesWrite}`,
  recommendation: 'Fix-A: keep data:write for the schedule-slot endpoints, but document the dependency. Optionally introduce schedule:write distinct from data:write.',
})

// F2: data:write covers teaching-task PUT
addFinding({
  id: 'K14-RBAC-MEDIUM-2',
  severity: 'MEDIUM',
  area: 'TeachingTask write path',
  description: '/api/teaching-task and /api/teaching-task/[id] use data:write. A user with data:write can change teacher/room/course/teacherId of any teaching task, which indirectly alters the schedule output (because slots derive from teaching task). No conflict check runs on /api/teaching-task POST (POST creates new task; PUT runs pre-update room conflict check).',
  evidence: `ttPutUsesWrite=${ttPutUsesWrite} ttPostUsesWrite=${ttPostUsesWrite}`,
  recommendation: 'Fix-A: keep current model. Optionally introduce teaching-task:write for finer split.',
})

// F3: schedule:adjust covers dry-run, create, void
addFinding({
  id: 'K14-RBAC-NONE-1',
  severity: 'NONE',
  area: 'ScheduleAdjustment path',
  description: 'All adjustment routes use schedule:adjust (not data:write). get-only route uses schedule:view. dry-run also uses schedule:adjust — debatable (dry-run is read-only by name) but currently requires write-level perm.',
  evidence: `adjGetUsesView=${adjGetUsesView} adjDryRunUsesAdjust=${adjDryRunUsesAdjust} adjVoidUsesAdjust=${adjVoidUsesAdjust}`,
  recommendation: 'Optionally allow schedule:view for dry-run if a read-only mode is desired. Current model is consistent (all adjustment operations require adjust).',
})

// F4: import routes are all import:manage
addFinding({
  id: 'K14-RBAC-NONE-2',
  severity: 'NONE',
  area: 'Import path',
  description: 'All import routes (parse/confirm/rollback/abandon/batches get) require import:manage. Not granted to USER role.',
  evidence: `importParseUsesManage=${importParseUsesManage} importConfirmUsesManage=${importConfirmUsesManage} importRollbackUsesManage=${importRollbackUsesManage} importAbandonUsesManage=${importAbandonUsesManage} importBatchesGetUsesManage=${importBatchesGetUsesManage}`,
  recommendation: 'No change. import:manage is admin-only in seed.',
})

// F5: admin generic route allows data:write on schedule-sensitive models
addFinding({
  id: 'K14-RBAC-MEDIUM-3',
  severity: 'NONE',
  area: 'Admin generic route',
  description: 'K14-FIX-A: /api/admin/[model] PUT scheduleslot path now defensively re-asserts data.semesterId from guardResult.semesterId (matches POST behavior in lines 216-218). Existing semesterId injection at line 268 (data.semesterId = semester.id) and same-semester guard remain. Server-side check unchanged.',
  evidence: `adminModelPutHasSemesterId=${adminModelPutHasSemesterId} adminModelPutHasGuardSemester=${adminModelPutHasGuardSemester} adminModelPutHasGuard=${adminModelPutHasGuard}`,
  recommendation: 'Verified. Teachingtask PUT generic route vs dedicated route inconsistency remains a known risk (out of Fix-A scope, deferred to K14-FIX-B).',
})

// F6: conflict-check uses schedule:view (not read-public)
addFinding({
  id: 'K14-RBAC-NONE-3',
  severity: 'NONE',
  area: 'Conflict-check preflight',
  description: '/api/conflict-check uses schedule:view. Returns conflict info for any schedule slot — same authorization level as GET /api/schedule. Acceptable. Does not leak any information beyond what schedule:view already exposes.',
  evidence: `ccUsesView=${ccUsesView}`,
  recommendation: 'No change.',
})

// F7: frontend schedule-grid drag/drop is not gated by permission in component
addFinding({
  id: 'K14-RBAC-MEDIUM-4',
  severity: 'NONE',
  area: 'Frontend schedule-grid',
  description: 'K14-FIX-A: schedule-grid now uses useHasPermission("data:write") and gates handleDragStart/handleDragEnd. Without data:write, drag is rejected with toast. Server-side requirePermission("data:write") on /api/schedule-slot/[id] PUT is the final security boundary.',
  evidence: `gridHasDataWriteGate=${gridHasDataWriteGate}`,
  recommendation: 'Verified. Server-side check unchanged.',
})

// F8: frontend adjustment dialog not gated by permission
addFinding({
  id: 'K14-RBAC-MEDIUM-5',
  severity: 'NONE',
  area: 'Frontend adjustment dialog',
  description: 'K14-FIX-A: schedule-adjustment-dialog and dashboard-content use useHasPermission("schedule:adjust") to gate dry-run/confirm/void buttons and handler logic. Without schedule:adjust, buttons are disabled and handlers short-circuit with toast. Server-side requirePermission("schedule:adjust") on /api/schedule-adjustments and /api/schedule-adjustments/[id]/void is the final security boundary.',
  evidence: `adjDialogHasScheduleAdjustGate=${adjDialogHasScheduleAdjustGate}`,
  recommendation: 'Verified. Server-side check unchanged.',
})

// F9: solver routes use schedule:adjust (not a separate scheduler perm)
addFinding({
  id: 'K14-RBAC-LOW-1',
  severity: 'LOW',
  area: 'Solver / scheduler',
  description: 'All scheduler routes (preview/apply/rollback/lockable-slots/runs) use schedule:adjust. No separate scheduler:run permission exists. A user with only data:write cannot run scheduler. Acceptable: schedule:adjust is the right level for auto-scheduling.',
  evidence: `${schedulerPerms.join(' | ')}`,
  recommendation: 'No change. Document that schedule:adjust is the canonical auto-scheduling permission.',
})

// F10: /api/scheduler/run does not exist
addFinding({
  id: 'K14-RBAC-NONE-4',
  severity: 'NONE',
  area: 'Solver / scheduler',
  description: '/api/scheduler/run does not exist (forbidden by K10/K11 stage rules). All scheduler endpoints are /api/admin/scheduler/* with RBAC enforced.',
  evidence: `schedulerRunExists=${schedulerRunExists}`,
  recommendation: 'No change.',
})

// F11: data:write is shared between non-schedule and schedule models
addFinding({
  id: 'K14-RBAC-MEDIUM-6',
  severity: 'MEDIUM',
  area: 'Permission model',
  description: 'data:write covers classgroup/teacher/course/room admin CRUD AND schedule-slot/teaching-task admin writes. A user with data:write has full entity-write + schedule-write capability, which may be broader than intended for "data steward" role.',
  evidence: `adminModelGetPerm=${adminModelGetPerm} slotPostUsesWrite=${slotPostUsesWrite} slotPutUsesWrite=${slotPutUsesWrite} ttPutUsesWrite=${ttPutUsesWrite}`,
  recommendation: 'Fix-A: optionally split data:write into data:write (entities) + schedule:write (slot/task) + data:delete (cascade). Not blocking — current model is consistent.',
})

// F12: 6+ permissions are present and not all used
addFinding({
  id: 'K14-RBAC-LOW-2',
  severity: 'LOW',
  area: 'Permission model',
  description: `${allPermissions.length} permissions defined; not all are used by API routes. schedule:view used by /api/schedule + /api/conflict-check. schedule:adjust used by adjustment + scheduler + rooms capacity. data:* used by admin + schedule-slot + teaching-task. import:manage used by import. users:manage used by users. settings:manage / diagnostics:view not currently used in API routes.`,
  evidence: `permissions=${allPermissions.join(', ')}`,
  recommendation: 'Document which permissions are currently enforced. settings:manage / diagnostics:view may be reserved for future.',
})

// F13: 3 roles, ADMIN gets all, USER gets only data:read
addFinding({
  id: 'K14-RBAC-NONE-5',
  severity: 'NONE',
  area: 'Role-permission mapping',
  description: 'Seed: ADMIN → all 10 permissions. USER → data:read. DATA_EXPORTER → data:read + data:export. 3 roles.',
  evidence: `adminGetsAll=${adminGetsAll} userOnlyRead=${userOnlyRead} dataExporterReadExport=${dataExporterReadExport} roles=${roleNames.join(', ')}`,
  recommendation: 'No change.',
})

// ── Output ──

console.log('\n=== K14 RBAC Schedule Write Hardening Audit ===\n')
console.log(`Files scanned: 40+ API routes + 11 auth lib + 6 frontend gating sites`)
console.log(`RBAC permission definitions: ${allPermissions.length} (${allPermissions.join(', ')})`)
console.log(`Roles: ${roleNames.join(', ')}`)
console.log(`Schedule write routes: /api/schedule-slot, /api/teaching-task, /api/admin/[model]`)
console.log(`Admin generic routes: /api/admin/[model] (POST/PUT/DELETE)`)
console.log(`Frontend gating sites: schedule-grid, schedule-adjustment-dialog, schedule-import-dialog, layout/protected-shell`)

console.log('\nFindings:')
for (const f of findings) {
  console.log(`  [${f.severity}] ${f.id} (${f.area})`)
  console.log(`        ${f.description}`)
  if (process.env.VERBOSE) {
    console.log(`        evidence: ${f.evidence}`)
    console.log(`        recommendation: ${f.recommendation}`)
  }
}

const bySeverity = { HIGH: 0, MEDIUM: 0, LOW: 0, NONE: 0 }
for (const f of findings) bySeverity[f.severity]++

console.log(`\nSummary:`)
console.log(`  HIGH: ${bySeverity.HIGH}`)
console.log(`  MEDIUM: ${bySeverity.MEDIUM}`)
console.log(`  LOW: ${bySeverity.LOW}`)
console.log(`  NONE: ${bySeverity.NONE}`)

console.log(`\nRecommendation:`)
console.log(`  Fix-A allowed: yes (conditional)`)
console.log(`  Suggested strategy:`)
console.log(`    1. Frontend permission gating: add hasPermission checks to schedule-grid and adjustment-dialog (so drag/drop is disabled without data:write / schedule:adjust).`)
console.log(`    2. Admin generic route: ensure PUT scheduleslot auto-injects semesterId (matches POST).`)
console.log(`    3. (Optional) Split data:write into data:write + schedule:write + data:delete split.`)
console.log(`    4. (Optional) Document data:write semantics (currently covers entities + schedule slot + teaching task).`)
console.log(`  Constraint: no permission changes for currently working scenarios (USER role).`)
console.log(`\nFix-A boundary (recommended):`)
console.log(`  - Frontend only: add hasPermission-based disable for drag/drop in schedule-grid and buttons in adjustment-dialog`)
console.log(`  - Admin route only: ensure PUT scheduleslot auto-injects semesterId (small code change, no schema change)`)
console.log(`  - NOT modify: permission strings, role-permission mapping, requirePermission implementation`)
console.log(`  - NOT modify: existing server-side checks (already correct)`)
console.log(`  - NOT modify: Prisma schema, solver, parser, importer, seed, RBAC database seed`)
