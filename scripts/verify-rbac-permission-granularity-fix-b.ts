// scripts/verify-rbac-permission-granularity-fix-b.ts
// K15 Fix-B verification: dedicated route permission migration
// Read-only checks that schedule-slot and teaching-task dedicated routes
// use the new granular permissions (schedule:write, teaching-task:write),
// while admin generic route and frontend gating remain unchanged.

import * as fs from 'fs'
import * as path from 'path'

let passed = 0
let failed = 0

function check(condition: boolean, message: string) {
  if (condition) {
    passed++
    console.log(`  PASS  ${message}`)
  } else {
    failed++
    console.error(`  FAIL  ${message}`)
  }
}

function readFile(relPath: string): string {
  const abs = path.resolve(process.cwd(), relPath)
  if (!fs.existsSync(abs)) return ''
  return fs.readFileSync(abs, 'utf-8')
}

console.log('K15 RBAC Permission Granularity Fix-B Verification\n')

// ─── 1. Permission definitions still correct ─────────────────────

console.log('1. Permission Definitions')

const typesSrc = readFile('src/lib/auth/types.ts')

check(typesSrc.includes("'schedule:write'"), 'ALL_PERMISSIONS contains schedule:write')
check(typesSrc.includes("'teaching-task:write'"), 'ALL_PERMISSIONS contains teaching-task:write')
check(typesSrc.includes("'data:write'"), 'ALL_PERMISSIONS still contains data:write')
check(typesSrc.includes("'schedule:adjust'"), 'ALL_PERMISSIONS still contains schedule:adjust')

// ─── 2. Schedule-slot route POST ─────────────────────────────────

console.log('\n2. Schedule-Slot POST Route')

const slotCreateRoute = readFile('src/app/api/schedule-slot/route.ts')

check(
  slotCreateRoute.includes("requirePermission('schedule:write'"),
  'POST uses schedule:write'
)
check(
  !slotCreateRoute.includes("requirePermission('data:write'"),
  'POST no longer uses data:write'
)
check(
  slotCreateRoute.includes('guardSlotCreate'),
  'POST still calls guardSlotCreate'
)
check(
  slotCreateRoute.includes('conflictDetails'),
  'POST still returns conflictDetails'
)
check(
  slotCreateRoute.includes('scheduleChangeLog'),
  'POST still creates change log'
)

// ─── 3. Schedule-slot route PUT ──────────────────────────────────

console.log('\n3. Schedule-Slot PUT Route')

const slotUpdateRoute = readFile('src/app/api/schedule-slot/[id]/route.ts')

check(
  slotUpdateRoute.includes("requirePermission('schedule:write'"),
  'PUT uses schedule:write'
)
check(
  !slotUpdateRoute.includes("requirePermission('data:write'"),
  'PUT no longer uses data:write'
)
check(
  slotUpdateRoute.includes('guardSlotUpdate'),
  'PUT still calls guardSlotUpdate'
)
check(
  slotUpdateRoute.includes('conflictDetails'),
  'PUT still returns conflictDetails'
)
check(
  slotUpdateRoute.includes('scheduleChangeLog'),
  'PUT still creates change log'
)

// ─── 4. Teaching-task route PUT ──────────────────────────────────

console.log('\n4. Teaching-Task PUT Route')

const taskUpdateRoute = readFile('src/app/api/teaching-task/[id]/route.ts')

check(
  taskUpdateRoute.includes("requirePermission('teaching-task:write'"),
  'PUT uses teaching-task:write'
)
check(
  !taskUpdateRoute.includes("requirePermission('data:write'"),
  'PUT no longer uses data:write'
)
check(
  taskUpdateRoute.includes('checkScheduleConflicts'),
  'PUT still calls checkScheduleConflicts'
)
check(
  taskUpdateRoute.includes('conflictDetails'),
  'PUT still returns conflictDetails'
)
check(
  taskUpdateRoute.includes('teachingTask.update'),
  'PUT still updates TeachingTask in transaction'
)

// ─── 5. Admin generic route NOT migrated ─────────────────────────

console.log('\n5. Admin Generic Route NOT Migrated')

const adminGenericRoute = readFile('src/app/api/admin/[model]/route.ts')

check(
  adminGenericRoute.includes("requirePermission('data:write'"),
  'admin generic POST/PUT still uses data:write (Phase D pending)'
)
check(
  adminGenericRoute.includes("'scheduleslot'"),
  'admin generic route still handles scheduleslot model'
)
check(
  adminGenericRoute.includes("'teachingtask'"),
  'admin generic route still handles teachingtask model'
)

// ─── 6. Frontend gating NOT migrated ─────────────────────────────

console.log('\n6. Frontend Gating NOT Migrated')

const scheduleGrid = readFile('src/components/schedule-grid.tsx')

check(
  scheduleGrid.includes("useHasPermission('data:write')"),
  'schedule-grid still uses data:write (Phase C pending)'
)

const adjDialog = readFile('src/components/schedule-adjustment-dialog.tsx')

check(
  adjDialog.includes("useHasPermission('schedule:adjust')"),
  'adjustment dialog still uses schedule:adjust (no change expected)'
)

// ─── 7. Infrastructure NOT modified ──────────────────────────────

console.log('\n7. Infrastructure NOT Modified')

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

// ─── 8. No forbidden additions ───────────────────────────────────

console.log('\n8. No Forbidden Additions')

const schedulerRunRoute = readFile('src/app/api/admin/scheduler/run/route.ts')
check(
  schedulerRunRoute.length === 0,
  'No /api/scheduler/run route added'
)

// ─── 9. Prisma schema NOT modified ───────────────────────────────

console.log('\n9. Prisma Schema NOT Modified')

const schemaFile = readFile('prisma/schema.prisma')
check(
  schemaFile.includes('model ScheduleSlot'),
  'schema.prisma contains ScheduleSlot model'
)
check(
  schemaFile.includes('model TeachingTask'),
  'schema.prisma contains TeachingTask model'
)

// ─── Summary ──────────────────────────────────────────────────────

console.log('\n' + '─'.repeat(60))
console.log(`Summary:`)
console.log(`  passed: ${passed}`)
console.log(`  failed: ${failed}`)

if (failed > 0) {
  console.error('\n❌ Some checks failed')
  process.exit(1)
} else {
  console.log('\n✅ All checks passed — Fix-B verified')
  process.exit(0)
}
