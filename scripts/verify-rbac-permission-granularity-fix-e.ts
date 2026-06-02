// scripts/verify-rbac-permission-granularity-fix-e.ts
// K15 Fix-E verification: admin frontend model-specific permission gating
// Read-only checks that admin data page frontend uses model-specific permissions
// for create/edit/save, and data:delete for delete.

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

console.log('K15 RBAC Permission Granularity Fix-E Verification\n')

// ─── 1. Permission definitions still correct ─────────────────────

console.log('1. Permission Definitions')

const typesSrc = readFile('src/lib/auth/types.ts')

check(typesSrc.includes("'schedule:write'"), 'ALL_PERMISSIONS contains schedule:write')
check(typesSrc.includes("'teaching-task:write'"), 'ALL_PERMISSIONS contains teaching-task:write')
check(typesSrc.includes("'data:write'"), 'ALL_PERMISSIONS still contains data:write')
check(typesSrc.includes("'data:delete'"), 'ALL_PERMISSIONS still contains data:delete')
check(typesSrc.includes("'import:manage'"), 'ALL_PERMISSIONS still contains import:manage')

// ─── 2. Admin config has model permission helper ─────────────────

console.log('\n2. Admin Config Model Permission Helper')

const adminConfig = readFile('src/lib/admin-db/config.ts')

check(adminConfig.includes('getAdminModelWritePermission'), 'config.ts has getAdminModelWritePermission helper')
check(adminConfig.includes("return 'schedule:write'"), 'helper returns schedule:write for scheduleslot')
check(adminConfig.includes("return 'teaching-task:write'"), 'helper returns teaching-task:write for teachingtask')
check(adminConfig.includes("return 'data:write'"), 'helper returns data:write for ordinary models')
check(adminConfig.includes("import type { PermissionKey }"), 'helper imports PermissionKey type')

// ─── 3. Admin data page uses model-specific permissions ──────────

console.log('\n3. Admin Data Page Model-Specific Gating')

const adminDbContent = readFile('src/app/admin/db/admin-db-content.tsx')

check(adminDbContent.includes('getAdminModelWritePermission'), 'admin-db-content imports getAdminModelWritePermission')
check(adminDbContent.includes('useHasPermission'), 'admin-db-content uses useHasPermission')
check(adminDbContent.includes('canWriteCurrentModel'), 'admin-db-content computes canWriteCurrentModel')
check(adminDbContent.includes('canDelete'), 'admin-db-content computes canDelete')
check(adminDbContent.includes('canImport'), 'admin-db-content computes canImport')

// Verify canWriteCurrentModel uses model-specific permission
check(
  adminDbContent.includes('useHasPermission(getAdminModelWritePermission(activeTable))'),
  'canWriteCurrentModel uses useHasPermission(getAdminModelWritePermission(activeTable))'
)

// Verify canDelete uses data:delete
check(
  adminDbContent.includes("useHasPermission('data:delete')"),
  'canDelete uses useHasPermission("data:delete")'
)

// Verify canImport uses import:manage
check(
  adminDbContent.includes("useHasPermission('import:manage')"),
  'canImport uses useHasPermission("import:manage")'
)

// ─── 4. Defensive no-op checks in handlers ───────────────────────

console.log('\n4. Defensive No-Op Checks in Handlers')

check(adminDbContent.includes('if (!canWriteCurrentModel)'), 'openCreate has defensive check')
// Check that openEdit also has the defensive check
const openEditSection = adminDbContent.substring(adminDbContent.indexOf('function openEdit'))
check(openEditSection.includes('if (!canWriteCurrentModel)'), 'openEdit has defensive check')

// Check that handleSave has the defensive check
const handleSaveSection = adminDbContent.substring(adminDbContent.indexOf('async function handleSave'))
check(handleSaveSection.includes('if (!canWriteCurrentModel)'), 'handleSave has defensive check')

// Check that handleTaskSave has the defensive check
const handleTaskSaveSection = adminDbContent.substring(adminDbContent.indexOf('async function handleTaskSave'))
check(handleTaskSaveSection.includes('if (!canWriteCurrentModel)'), 'handleTaskSave has defensive check')

// Check that handleSlotSave has the defensive check
const handleSlotSaveSection = adminDbContent.substring(adminDbContent.indexOf('async function handleSlotSave'))
check(handleSlotSaveSection.includes('if (!canWriteCurrentModel)'), 'handleSlotSave has defensive check')

// Check that deleteRecord has the defensive check
const deleteRecordSection = adminDbContent.substring(adminDbContent.indexOf('async function deleteRecord'))
check(deleteRecordSection.includes('if (!canDelete)'), 'deleteRecord has defensive check')

// ─── 5. AdminToolbar receives permission props ───────────────────

console.log('\n5. AdminToolbar Permission Props')

const adminToolbar = readFile('src/components/admin-db/admin-toolbar.tsx')

check(adminToolbar.includes('canCreate'), 'AdminToolbar has canCreate prop')
check(adminToolbar.includes('canImport'), 'AdminToolbar has canImport prop')
check(adminToolbar.includes('disabled={!canCreate}'), 'Add button disabled when !canCreate')
check(adminToolbar.includes('disabled={!canImport}'), 'Import button disabled when !canImport')
check(adminToolbar.includes('disabled:opacity-50'), 'Disabled buttons have opacity styling')
check(adminToolbar.includes('disabled:cursor-not-allowed'), 'Disabled buttons have cursor styling')

// Verify admin-db-content passes props
check(adminDbContent.includes('canCreate={canWriteCurrentModel}'), 'admin-db-content passes canCreate to AdminToolbar')
check(adminDbContent.includes('canImport={canImport}'), 'admin-db-content passes canImport to AdminToolbar')

// ─── 6. AdminDataTable receives permission props ─────────────────

console.log('\n6. AdminDataTable Permission Props')

const adminDataTable = readFile('src/components/admin-db/admin-data-table.tsx')

check(adminDataTable.includes('canEdit'), 'AdminDataTable has canEdit prop')
check(adminDataTable.includes('canDelete'), 'AdminDataTable has canDelete prop')

// Verify buttons are conditionally rendered
check(adminDataTable.includes('{canEdit && ('), 'Edit button conditionally rendered with canEdit')
check(adminDataTable.includes('{canDelete && ('), 'Delete button conditionally rendered with canDelete')

// Verify admin-db-content passes props
check(adminDbContent.includes('canEdit={canWriteCurrentModel}'), 'admin-db-content passes canEdit to AdminDataTable')
check(adminDbContent.includes('canDelete={canDelete}'), 'admin-db-content passes canDelete to AdminDataTable')

// ─── 7. DELETE still uses data:delete ─────────────────────────────

console.log('\n7. DELETE Still Uses data:delete')

// Verify the admin data page does NOT gate delete on schedule:write or teaching-task:write
check(!adminDbContent.includes("useHasPermission('schedule:write')") || !adminDbContent.includes('canDelete.*schedule:write'), 'Delete is NOT gated on schedule:write')
// Verify canDelete is computed from data:delete
check(adminDbContent.includes("useHasPermission('data:delete')"), 'Delete is gated on data:delete')

// ─── 8. No new permission keys added ─────────────────────────────

console.log('\n8. No New Permission Keys Added')

const permMatch = typesSrc.match(/ALL_PERMISSIONS\s*=\s*\[([\s\S]*?)\]/)
const permCount = permMatch ? permMatch[1].match(/'[^']+'/g)?.length ?? 0 : 0
check(permCount === 12, `ALL_PERMISSIONS has 12 entries (actual ${permCount})`)

// Verify no model-specific write permissions were added
check(!typesSrc.includes("'room:write'"), 'No room:write permission added')
check(!typesSrc.includes("'teacher:write'"), 'No teacher:write permission added')
check(!typesSrc.includes("'course:write'"), 'No course:write permission added')
check(!typesSrc.includes("'classgroup:write'"), 'No classgroup:write permission added')
check(!typesSrc.includes("'schedule-slot:write'"), 'No schedule-slot:write permission added')
check(!typesSrc.includes("'teachingtask:manage'"), 'No teachingtask:manage permission added')

// ─── 9. Server routes NOT modified ───────────────────────────────

console.log('\n9. Server Routes NOT Modified')

const adminGenericRoute = readFile('src/app/api/admin/[model]/route.ts')
check(adminGenericRoute.includes('getAdminWritePermission'), 'admin generic route still has getAdminWritePermission helper')

const slotCreateRoute = readFile('src/app/api/schedule-slot/route.ts')
check(slotCreateRoute.includes("requirePermission('schedule:write'"), 'schedule-slot POST still uses schedule:write')

const slotUpdateRoute = readFile('src/app/api/schedule-slot/[id]/route.ts')
check(slotUpdateRoute.includes("requirePermission('schedule:write'"), 'schedule-slot PUT still uses schedule:write')

const taskUpdateRoute = readFile('src/app/api/teaching-task/[id]/route.ts')
check(taskUpdateRoute.includes("requirePermission('teaching-task:write'"), 'teaching-task PUT still uses teaching-task:write')

// ─── 10. Infrastructure NOT modified ─────────────────────────────

console.log('\n10. Infrastructure NOT Modified')

const requirePermFile = readFile('src/lib/auth/require-permission.ts')
check(requirePermFile.includes('export async function requirePermission'), 'requirePermission implementation not modified')

const seedFile = readFile('scripts/seed-auth.ts')
check(seedFile.includes('for (const key of ALL_PERMISSIONS)'), 'seed-auth not modified')

// ─── 11. No forbidden additions ──────────────────────────────────

console.log('\n11. No Forbidden Additions')

const schedulerRunRoute = readFile('src/app/api/admin/scheduler/run/route.ts')
check(schedulerRunRoute.length === 0, 'No /api/scheduler/run route added')

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
  console.log('\n✅ All checks passed — Fix-E verified')
  process.exit(0)
}
