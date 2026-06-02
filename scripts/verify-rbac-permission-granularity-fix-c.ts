// scripts/verify-rbac-permission-granularity-fix-c.ts
// K15 Fix-C verification: frontend gating migration
// Read-only checks that schedule-grid uses schedule:write,
// adjustment still uses schedule:adjust, admin data page still uses data:write.

import * as fs from 'fs'
import * as path from 'path'

let passed = 0
let failed = 0
let skipped = 0

function check(condition: boolean, message: string) {
  if (condition) {
    passed++
    console.log(`  PASS  ${message}`)
  } else {
    failed++
    console.error(`  FAIL  ${message}`)
  }
}

function skip(message: string, reason: string) {
  skipped++
  console.log(`  SKIP  ${message} (${reason})`)
}

function readFile(relPath: string): string {
  const abs = path.resolve(process.cwd(), relPath)
  if (!fs.existsSync(abs)) return ''
  return fs.readFileSync(abs, 'utf-8')
}

console.log('K15 RBAC Permission Granularity Fix-C Verification\n')

// ─── 1. Permission definitions ───────────────────────────────────

console.log('1. Permission Definitions')

const typesSrc = readFile('src/lib/auth/types.ts')

check(typesSrc.includes("'schedule:write'"), 'ALL_PERMISSIONS contains schedule:write')
check(typesSrc.includes("'teaching-task:write'"), 'ALL_PERMISSIONS contains teaching-task:write')
check(typesSrc.includes("'data:write'"), 'ALL_PERMISSIONS still contains data:write')
check(typesSrc.includes("'schedule:adjust'"), 'ALL_PERMISSIONS still contains schedule:adjust')

// ─── 2. Schedule-grid uses schedule:write ────────────────────────

console.log('\n2. Schedule-Grid Gating')

const scheduleGrid = readFile('src/components/schedule-grid.tsx')

check(
  scheduleGrid.includes("useHasPermission('schedule:write')"),
  'schedule-grid uses schedule:write gating'
)
check(
  !scheduleGrid.includes("useHasPermission('data:write')"),
  'schedule-grid no longer uses data:write for drag'
)
check(
  scheduleGrid.includes('canWriteSchedule'),
  'schedule-grid has canWriteSchedule variable'
)
check(
  scheduleGrid.includes('handleDragStart'),
  'schedule-grid has handleDragStart'
)
check(
  scheduleGrid.includes('handleDragEnd'),
  'schedule-grid has handleDragEnd'
)
check(
  scheduleGrid.includes('moveSlot'),
  'schedule-grid calls moveSlot'
)
check(
  scheduleGrid.includes('conflict-check'),
  'schedule-grid performs conflict-check preflight'
)

// ─── 3. Teaching-task frontend gating ────────────────────────────

console.log('\n3. Teaching-Task Frontend Gating')

// Check if any teaching-task editing component uses useHasPermission
const editTaskDialog = readFile('src/components/edit-task-dialog.tsx')
const teachingTaskDialog = readFile('src/components/admin-db/teaching-task-dialog.tsx')

const editTaskHasPermission = editTaskDialog.includes('useHasPermission')
const teachingTaskHasPermission = teachingTaskDialog.includes('useHasPermission')

if (editTaskHasPermission || teachingTaskHasPermission) {
  // If teaching-task UI has permission checks, verify they use teaching-task:write
  check(
    editTaskDialog.includes("useHasPermission('teaching-task:write')") || !editTaskHasPermission,
    'edit-task-dialog uses teaching-task:write (if gated)'
  )
  check(
    teachingTaskDialog.includes("useHasPermission('teaching-task:write')") || !teachingTaskHasPermission,
    'teaching-task-dialog uses teaching-task:write (if gated)'
  )
} else {
  skip('Teaching-task edit UI has no client-side permission gating', 'server-side enforcement only')
  skip('Teaching-task dialog has no client-side permission gating', 'admin data page uses data:write')
}

// ─── 4. Adjustment dialog still uses schedule:adjust ─────────────

console.log('\n4. Adjustment Dialog')

const adjDialog = readFile('src/components/schedule-adjustment-dialog.tsx')

check(
  adjDialog.includes("useHasPermission('schedule:adjust')"),
  'adjustment dialog uses schedule:adjust'
)
check(
  !adjDialog.includes("useHasPermission('schedule:write')"),
  'adjustment dialog does NOT use schedule:write'
)

// ─── 5. Dashboard void still uses schedule:adjust ────────────────

console.log('\n5. Dashboard Void')

const dashboardContent = readFile('src/app/dashboard/dashboard-content.tsx')

check(
  dashboardContent.includes("useHasPermission('schedule:adjust')"),
  'dashboard void uses schedule:adjust'
)

// ─── 6. Dedicated routes still use new permissions ───────────────

console.log('\n6. Dedicated Routes (Fix-B preserved)')

const slotCreateRoute = readFile('src/app/api/schedule-slot/route.ts')
const slotUpdateRoute = readFile('src/app/api/schedule-slot/[id]/route.ts')
const taskUpdateRoute = readFile('src/app/api/teaching-task/[id]/route.ts')

check(
  slotCreateRoute.includes("requirePermission('schedule:write'"),
  'schedule-slot POST uses schedule:write'
)
check(
  slotUpdateRoute.includes("requirePermission('schedule:write'"),
  'schedule-slot PUT uses schedule:write'
)
check(
  taskUpdateRoute.includes("requirePermission('teaching-task:write'"),
  'teaching-task PUT uses teaching-task:write'
)

// ─── 7. Admin generic route NOT migrated ─────────────────────────

console.log('\n7. Admin Generic Route NOT Migrated')

const adminGenericRoute = readFile('src/app/api/admin/[model]/route.ts')

check(
  adminGenericRoute.includes("requirePermission('data:write'"),
  'admin generic POST/PUT still uses data:write (Phase D pending)'
)

// ─── 8. Infrastructure NOT modified ──────────────────────────────

console.log('\n8. Infrastructure NOT Modified')

const requirePermFile = readFile('src/lib/auth/require-permission.ts')
check(
  requirePermFile.includes('export async function requirePermission'),
  'requirePermission implementation not modified'
)

const seedFile = readFile('scripts/seed-auth.ts')
check(
  seedFile.includes('for (const key of ALL_PERMISSIONS)'),
  'seed-auth ADMIN binding logic not modified'
)

// ─── 9. Store still has moveSlot with preflight ──────────────────

console.log('\n9. Schedule Store')

const storeFile = readFile('src/store/scheduleStore.ts')

check(
  storeFile.includes('moveSlot'),
  'scheduleStore has moveSlot'
)
check(
  storeFile.includes('conflict-check'),
  'scheduleStore has conflict-check preflight'
)

// ─── 10. No forbidden additions ──────────────────────────────────

console.log('\n10. No Forbidden Additions')

const schedulerRunRoute = readFile('src/app/api/admin/scheduler/run/route.ts')
check(
  schedulerRunRoute.length === 0,
  'No /api/scheduler/run route added'
)

// ─── Summary ──────────────────────────────────────────────────────

console.log('\n' + '─'.repeat(60))
console.log(`Summary:`)
console.log(`  passed: ${passed}`)
console.log(`  failed: ${failed}`)
console.log(`  skipped: ${skipped}`)

if (failed > 0) {
  console.error('\n❌ Some checks failed')
  process.exit(1)
} else {
  console.log('\n✅ All checks passed — Fix-C verified')
  process.exit(0)
}
