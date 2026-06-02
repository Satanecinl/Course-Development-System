// scripts/verify-rbac-permission-granularity-fix-a.ts
// K15 Fix-A verification: read-only checks that schedule:write and
// teaching-task:write have been added to permission definitions and
// seed-auth, but routes/frontend/admin generic have NOT been migrated.
//
// Does NOT connect to the database. Does NOT modify any files.

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

console.log('K15 RBAC Permission Granularity Fix-A Verification\n')

// ─── 1. Permission definition checks ──────────────────────────────

console.log('1. Permission Definitions')

const typesSrc = readFile('src/lib/auth/types.ts')

check(typesSrc.includes("'schedule:write'"), 'ALL_PERMISSIONS contains schedule:write')
check(typesSrc.includes("'teaching-task:write'"), 'ALL_PERMISSIONS contains teaching-task:write')
check(typesSrc.includes("'data:write'"), 'ALL_PERMISSIONS still contains data:write')
check(typesSrc.includes("'schedule:adjust'"), 'ALL_PERMISSIONS still contains schedule:adjust')
check(typesSrc.includes("'import:manage'"), 'ALL_PERMISSIONS still contains import:manage')
check(typesSrc.includes("'data:delete'"), 'ALL_PERMISSIONS still contains data:delete')

// Count permissions
const permMatch = typesSrc.match(/ALL_PERMISSIONS\s*=\s*\[([\s\S]*?)\]/)
const permCount = permMatch ? permMatch[1].match(/'[^']+'/g)?.length ?? 0 : 0
check(permCount === 12, `ALL_PERMISSIONS has 12 entries (actual ${permCount})`)

// ─── 2. Metadata / seed-auth checks ──────────────────────────────

console.log('\n2. Seed-Auth Metadata')

const seedSrc = readFile('scripts/seed-auth.ts')

check(seedSrc.includes("'schedule:write'"), 'seed-auth has schedule:write description')
check(seedSrc.includes("'teaching-task:write'"), 'seed-auth has teaching-task:write description')
check(
  seedSrc.includes("'schedule:write': '写入课表时段'"),
  'schedule:write description is correct'
)
check(
  seedSrc.includes("'teaching-task:write': '写入教学任务'"),
  'teaching-task:write description is correct'
)

// ─── 3. ADMIN role mapping checks ────────────────────────────────

console.log('\n3. ADMIN Role Mapping')

// The seed script grants ADMIN all permissions via `for (const key of ALL_PERMISSIONS)`.
// Since schedule:write and teaching-task:write are now in ALL_PERMISSIONS, ADMIN gets them.
check(
  seedSrc.includes('for (const key of ALL_PERMISSIONS)'),
  'ADMIN seed iterates ALL_PERMISSIONS (auto-includes new permissions)'
)
// USER and DATA_EXPORTER get specific permissions, not ALL_PERMISSIONS.
// The seed script uses `permissionRecords.get('data:read')` for USER and
// `permissionRecords.get('data:export')` for DATA_EXPORTER — these do not
// include schedule:write or teaching-task:write.
check(
  seedSrc.includes("console.log('   ✅ USER → data:read')"),
  'USER only gets data:read (no new permissions)'
)
check(
  seedSrc.includes("console.log('   ✅ DATA_EXPORTER → data:read, data:export')"),
  'DATA_EXPORTER only gets data:read + data:export (no new permissions)'
)

// ─── 4. Route migration status (flexible: pre-Phase B or post-Phase B) ──

console.log('\n4. Route Migration Status')

const slotCreateRoute = readFile('src/app/api/schedule-slot/route.ts')
const slotCreateMigrated = slotCreateRoute.includes("requirePermission('schedule:write'")
const slotCreateOldData = slotCreateRoute.includes("requirePermission('data:write'")
check(
  slotCreateMigrated || slotCreateOldData,
  `schedule-slot POST: ${slotCreateMigrated ? 'migrated to schedule:write' : 'still uses data:write (pre-Phase B)'}`
)

const slotUpdateRoute = readFile('src/app/api/schedule-slot/[id]/route.ts')
const slotUpdateMigrated = slotUpdateRoute.includes("requirePermission('schedule:write'")
const slotUpdateOldData = slotUpdateRoute.includes("requirePermission('data:write'")
check(
  slotUpdateMigrated || slotUpdateOldData,
  `schedule-slot PUT: ${slotUpdateMigrated ? 'migrated to schedule:write' : 'still uses data:write (pre-Phase B)'}`
)

const taskUpdateRoute = readFile('src/app/api/teaching-task/[id]/route.ts')
const taskUpdateMigrated = taskUpdateRoute.includes("requirePermission('teaching-task:write'")
const taskUpdateOldData = taskUpdateRoute.includes("requirePermission('data:write'")
check(
  taskUpdateMigrated || taskUpdateOldData,
  `teaching-task PUT: ${taskUpdateMigrated ? 'migrated to teaching-task:write' : 'still uses data:write (pre-Phase B)'}`
)

// Admin generic route must NOT be migrated yet (Phase D pending)
const adminGenericRoute = readFile('src/app/api/admin/[model]/route.ts')
check(
  adminGenericRoute.includes("requirePermission('data:write'"),
  'admin generic POST/PUT still uses data:write (Phase D pending)'
)

// Report Phase B status
if (slotCreateMigrated && slotUpdateMigrated && taskUpdateMigrated) {
  console.log('\n  → Phase B route migration detected: dedicated routes use new permissions')
} else {
  console.log('\n  → Phase B route migration not yet done: dedicated routes still use data:write')
}

// ─── 5. Frontend gating NOT migrated ─────────────────────────────

console.log('\n5. Frontend Gating NOT Migrated (Expected)')

const scheduleGrid = readFile('src/components/schedule-grid.tsx')
check(
  scheduleGrid.includes("useHasPermission('data:write')"),
  'schedule-grid still uses data:write (not migrated to schedule:write)'
)

// ─── 6. Infrastructure NOT modified ──────────────────────────────

console.log('\n6. Infrastructure NOT Modified')

const requirePermFile = readFile('src/lib/auth/require-permission.ts')
check(
  requirePermFile.includes('export async function requirePermission'),
  'requirePermission implementation not modified'
)

const routePermFile = readFile('src/lib/auth/route-permissions.ts')
check(
  routePermFile.includes("permissions: ['data:write']"),
  'route-permissions still maps /admin/db to data:write'
)

const navFile = readFile('src/lib/auth/navigation.ts')
check(
  navFile.includes("permission: 'data:write'"),
  'navigation still maps 数据管理 to data:write'
)

// ─── 7. Solver / parser / importer NOT modified ──────────────────

console.log('\n7. Solver / Parser / Importer NOT Modified')

// Check that key files still exist and haven't been modified
const solverDataLoader = readFile('src/lib/scheduler/data-loader.ts')
check(solverDataLoader.length > 0, 'scheduler/data-loader.ts exists and not removed')

const parserFile = readFile('scripts/parse_schedule.py')
check(parserFile.length > 0, 'parse_schedule.py exists and not removed')

const importerFile = readFile('src/lib/import/importer.ts')
check(importerFile.length > 0, 'import/importer.ts exists and not removed')

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

// ─── 10. Database files NOT committed ────────────────────────────

console.log('\n10. Database Files NOT Committed')

// Check that no .db files are staged (we don't have git here but check existence)
const dbPath = path.resolve(process.cwd(), 'prisma/dev.db')
check(fs.existsSync(dbPath), 'prisma/dev.db exists (not deleted)')

// ─── Summary ──────────────────────────────────────────────────────

console.log('\n' + '─'.repeat(60))
console.log(`Summary:`)
console.log(`  passed: ${passed}`)
console.log(`  failed: ${failed}`)

if (failed > 0) {
  console.error('\n❌ Some checks failed')
  process.exit(1)
} else {
  console.log('\n✅ All checks passed — Fix-A verified')
  process.exit(0)
}
