// scripts/verify-rbac-permission-granularity-fix-d.ts
// K15 Fix-D verification: admin generic permission matrix
// Read-only checks that admin generic route uses model-specific permissions
// for scheduleslot/teachingtask writes.

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

console.log('K15 RBAC Permission Granularity Fix-D Verification\n')

// ─── 1. Permission definitions ───────────────────────────────────

console.log('1. Permission Definitions')

const typesSrc = readFile('src/lib/auth/types.ts')

check(typesSrc.includes("'schedule:write'"), 'ALL_PERMISSIONS contains schedule:write')
check(typesSrc.includes("'teaching-task:write'"), 'ALL_PERMISSIONS contains teaching-task:write')
check(typesSrc.includes("'data:write'"), 'ALL_PERMISSIONS still contains data:write')
check(typesSrc.includes("'data:delete'"), 'ALL_PERMISSIONS still contains data:delete')

// ─── 2. Admin generic route permission matrix ────────────────────

console.log('\n2. Admin Generic Route Permission Matrix')

const adminRoute = readFile('src/app/api/admin/[model]/route.ts')

check(adminRoute.length > 0, 'admin/[model]/route.ts exists')
check(adminRoute.includes('getAdminWritePermission'), 'has permission matrix helper')
check(adminRoute.includes("return 'schedule:write'"), 'helper returns schedule:write for scheduleslot')
check(adminRoute.includes("return 'teaching-task:write'"), 'helper returns teaching-task:write for teachingtask')
check(adminRoute.includes("return 'data:write'"), 'helper returns data:write for ordinary models')

// Verify POST uses the helper
const postSection = adminRoute.substring(adminRoute.indexOf('export async function POST'))
const postPermission = postSection.substring(0, postSection.indexOf('export async function PUT'))
check(postPermission.includes('getAdminWritePermission(model)'), 'POST uses getAdminWritePermission')
check(!postPermission.includes("requirePermission('data:write'"), 'POST no longer uses hardcoded data:write')

// Verify PUT uses the helper
const putSection = adminRoute.substring(adminRoute.indexOf('export async function PUT'))
const putPermission = putSection.substring(0, putSection.indexOf('export async function DELETE'))
check(putPermission.includes('getAdminWritePermission(model)'), 'PUT uses getAdminWritePermission')
check(!putPermission.includes("requirePermission('data:write'"), 'PUT no longer hardcoded data:write')

// Verify DELETE still uses data:delete
const deleteSection = adminRoute.substring(adminRoute.indexOf('export async function DELETE'))
check(deleteSection.includes("requirePermission('data:delete'"), 'DELETE still uses data:delete')

// ─── 3. Guards preserved ─────────────────────────────────────────

console.log('\n3. Guards Preserved')

check(adminRoute.includes('guardAdminSlotCreate'), 'scheduleslot POST mutation guard preserved')
check(adminRoute.includes('guardAdminSlotUpdate'), 'scheduleslot PUT mutation guard preserved')
check(adminRoute.includes('guardAdminTaskUpdate'), 'teachingtask PUT mutation guard preserved')
check(adminRoute.includes('conflictDetails'), 'conflictDetails preserved')
check(adminRoute.includes('resolveSemesterIfNeeded'), 'semester scoping preserved')
check(adminRoute.includes('countReferences'), 'referential integrity check preserved')

// ─── 4. Dedicated routes still use new permissions ───────────────

console.log('\n4. Dedicated Routes (Fix-B preserved)')

const slotCreate = readFile('src/app/api/schedule-slot/route.ts')
const slotUpdate = readFile('src/app/api/schedule-slot/[id]/route.ts')
const taskUpdate = readFile('src/app/api/teaching-task/[id]/route.ts')

check(slotCreate.includes("requirePermission('schedule:write'"), 'schedule-slot POST uses schedule:write')
check(slotUpdate.includes("requirePermission('schedule:write'"), 'schedule-slot PUT uses schedule:write')
check(taskUpdate.includes("requirePermission('teaching-task:write'"), 'teaching-task PUT uses teaching-task:write')

// ─── 5. Schedule-grid still uses schedule:write ──────────────────

console.log('\n5. Frontend (Fix-C preserved)')

const scheduleGrid = readFile('src/components/schedule-grid.tsx')
check(scheduleGrid.includes("useHasPermission('schedule:write')"), 'schedule-grid uses schedule:write')

// ─── 6. Admin frontend NOT migrated ──────────────────────────────

console.log('\n6. Admin Frontend NOT Migrated')

// Admin data page should still have no model-specific permission checks
const adminDbDir = 'src/components/admin-db'
const adminDbFiles = fs.existsSync(path.resolve(process.cwd(), adminDbDir))
  ? fs.readdirSync(path.resolve(process.cwd(), adminDbDir)).filter(f => f.endsWith('.tsx') || f.endsWith('.ts'))
  : []

let frontendHasPermissionCheck = false
for (const file of adminDbFiles) {
  const content = readFile(`${adminDbDir}/${file}`)
  if (content.includes('useHasPermission')) {
    frontendHasPermissionCheck = true
    break
  }
}
check(!frontendHasPermissionCheck, 'Admin frontend has no model-specific permission checks (Phase E pending)')

// ─── 7. Infrastructure NOT modified ──────────────────────────────

console.log('\n7. Infrastructure NOT Modified')

const requirePermFile = readFile('src/lib/auth/require-permission.ts')
check(requirePermFile.includes('export async function requirePermission'), 'requirePermission implementation not modified')

const seedFile = readFile('scripts/seed-auth.ts')
check(seedFile.includes('for (const key of ALL_PERMISSIONS)'), 'seed-auth not modified')

// ─── 8. No forbidden additions ───────────────────────────────────

console.log('\n8. No Forbidden Additions')

const schedulerRunRoute = readFile('src/app/api/admin/scheduler/run/route.ts')
check(schedulerRunRoute.length === 0, 'No /api/scheduler/run route added')

// ─── Summary ──────────────────────────────────────────────────────

console.log('\n' + '─'.repeat(60))
console.log(`Summary:`)
console.log(`  passed: ${passed}`)
console.log(`  failed: ${failed}`)

if (failed > 0) {
  console.error('\n❌ Some checks failed')
  process.exit(1)
} else {
  console.log('\n✅ All checks passed — Fix-D verified')
  process.exit(0)
}
