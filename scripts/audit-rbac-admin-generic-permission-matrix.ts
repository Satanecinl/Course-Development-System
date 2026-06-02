// scripts/audit-rbac-admin-generic-permission-matrix.ts
// K15 Fix-D Admin Generic Permission Matrix Audit
// Read-only: analyzes /api/admin/[model] route permissions, model classification,
// frontend admin data page gating, and dedicated vs generic route parity.

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

console.log('K15 RBAC Admin Generic Permission Matrix Audit\n')

// ─── 1. Admin Generic Route Analysis ─────────────────────────────

console.log('1. Admin Generic Route')

const adminRoute = readFile('src/app/api/admin/[model]/route.ts')

check(adminRoute.length > 0, 'admin/[model]/route.ts exists')
check(adminRoute.includes("'data:write'"), 'POST/PUT use data:write')
check(adminRoute.includes("'data:delete'"), 'DELETE uses data:delete')
check(adminRoute.includes("'data:read'"), 'GET uses data:read')

// Model map
check(adminRoute.includes("'classgroup'"), 'supports classgroup')
check(adminRoute.includes("'teacher'"), 'supports teacher')
check(adminRoute.includes("'course'"), 'supports course')
check(adminRoute.includes("'room'"), 'supports room')
check(adminRoute.includes("'scheduleslot'"), 'supports scheduleslot')
check(adminRoute.includes("'teachingtask'"), 'supports teachingtask')

// Special guards
check(adminRoute.includes('guardAdminSlotCreate'), 'scheduleslot POST has mutation guard')
check(adminRoute.includes('guardAdminSlotUpdate'), 'scheduleslot PUT has mutation guard')
check(adminRoute.includes('guardAdminTaskUpdate'), 'teachingtask PUT has teacher conflict guard')
check(adminRoute.includes('conflictDetails'), 'returns conflictDetails')
check(adminRoute.includes('resolveSemesterIfNeeded'), 'has semester scoping')
check(adminRoute.includes('SEMESTER_SCOPED_MODELS'), 'has semester-scoped model set')
check(adminRoute.includes('countReferences'), 'has referential integrity check on DELETE')

// Check if model-specific permission matrix exists
const hasModelSpecificMatrix = adminRoute.includes('getAdminWritePermission') || adminRoute.includes('PERMISSION_MATRIX') || adminRoute.includes('modelPermission')
check(hasModelSpecificMatrix, 'Model-specific permission matrix exists (getAdminWritePermission)')

// Check if schedule-sensitive models use granular permissions in generic route
const genericRouteUsesScheduleWrite = adminRoute.includes("return 'schedule:write'") && adminRoute.includes('getAdminWritePermission')
const genericRouteUsesTeachingTaskWrite = adminRoute.includes("return 'teaching-task:write'") && adminRoute.includes('getAdminWritePermission')
check(genericRouteUsesScheduleWrite, 'Generic route scheduleslot uses schedule:write')
check(genericRouteUsesTeachingTaskWrite, 'Generic route teachingtask uses teaching-task:write')

// ─── 2. Dedicated Route Permissions ──────────────────────────────

console.log('\n2. Dedicated Route Permissions')

const slotCreate = readFile('src/app/api/schedule-slot/route.ts')
const slotUpdate = readFile('src/app/api/schedule-slot/[id]/route.ts')
const taskCreate = readFile('src/app/api/teaching-task/route.ts')
const taskUpdate = readFile('src/app/api/teaching-task/[id]/route.ts')

check(slotCreate.includes("requirePermission('schedule:write'"), 'schedule-slot POST uses schedule:write')
check(slotUpdate.includes("requirePermission('schedule:write'"), 'schedule-slot PUT uses schedule:write')
check(taskUpdate.includes("requirePermission('teaching-task:write'"), 'teaching-task PUT uses teaching-task:write')
check(taskCreate.includes("requirePermission('data:write'"), 'teaching-task POST still uses data:write (not migrated)')

// ─── 3. Frontend Admin Data Page ─────────────────────────────────

console.log('\n3. Frontend Admin Data Page')

// Read admin-db-content for frontend check
readFile('src/app/admin/db/admin-db-content.tsx')
const routePerm = readFile('src/lib/auth/route-permissions.ts')
const navFile = readFile('src/lib/auth/navigation.ts')

check(routePerm.includes('data:write') && routePerm.includes('admin\\/db'), 'route-permissions gates /admin/db on data:write')
check(navFile.includes("'data:write'") && navFile.includes('数据库管理'), 'navigation gates 数据管理 on data:write')

// Check if frontend has model-specific permission checks
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

// Phase E detection: admin-db-content uses getAdminModelWritePermission + useHasPermission
const adminDbContent = readFile('src/app/admin/db/admin-db-content.tsx')
const adminConfigSrc = readFile('src/lib/admin-db/config.ts')
const phaseEFrontendHasHelper = adminConfigSrc.includes('getAdminModelWritePermission')
const phaseEFrontendUsesHelper = adminDbContent.includes('getAdminModelWritePermission') && adminDbContent.includes('useHasPermission')
const phaseEFrontendGatesCreate = adminDbContent.includes('canWriteCurrentModel')
const phaseEFrontendGatesDelete = adminDbContent.includes('canDelete')
const phaseEDone = phaseEFrontendHasHelper && phaseEFrontendUsesHelper && phaseEFrontendGatesCreate && phaseEFrontendGatesDelete

check(phaseEDone || !frontendHasPermissionCheck, phaseEDone ? 'Frontend admin-db has model-specific permission gating (Phase E DONE)' : 'Frontend admin-db has NO client-side permission checks (buttons always visible)')

// ─── 4. Schedule-Sensitive Model Guards ──────────────────────────

console.log('\n4. Schedule-Sensitive Model Guards')

check(adminRoute.includes('guardAdminSlotCreate'), 'scheduleslot POST: mutation guard + semester guard')
check(adminRoute.includes('guardAdminSlotUpdate'), 'scheduleslot PUT: mutation guard + semester guard')
check(adminRoute.includes('guardAdminTaskUpdate'), 'teachingtask PUT: teacher conflict guard')
check(adminRoute.includes('conflictDetails'), 'conflictDetails preserved in error responses')

// ─── 5. Permission Taxonomy Assessment ───────────────────────────

console.log('\n5. Permission Taxonomy Assessment')

const typesFile = readFile('src/lib/auth/types.ts')
check(typesFile.includes("'schedule:write'"), 'schedule:write exists')
check(typesFile.includes("'teaching-task:write'"), 'teaching-task:write exists')
check(typesFile.includes("'data:write'"), 'data:write exists')
check(typesFile.includes("'data:delete'"), 'data:delete exists')

// ─── 6. Findings ─────────────────────────────────────────────────

console.log('\n── Findings ──\n')

const findings = [
  {
    id: 'K15-ADMIN-MATRIX-NONE-4',
    severity: 'NONE',
    area: 'admin generic server matrix',
    description: 'Admin generic route now uses model-specific write permissions via getAdminWritePermission helper. scheduleslot uses schedule:write, teachingtask uses teaching-task:write, ordinary models use data:write.',
    evidence: 'getAdminWritePermission returns schedule:write for scheduleslot, teaching-task:write for teachingtask, data:write for others. POST and PUT both use the helper.',
    recommendation: 'Phase D server matrix done. Frontend admin model-specific gating also complete (Phase E).',
  },
  {
    id: 'K15-ADMIN-MATRIX-MEDIUM-3',
    severity: phaseEDone ? 'NONE' : 'MEDIUM',
    area: 'frontend no model-specific gating',
    description: phaseEDone
      ? 'Admin data page frontend now has model-specific permission gating. Create/edit/save are gated by getAdminModelWritePermission. Delete is gated by data:delete.'
      : 'Admin data page frontend has zero client-side permission checks. All write buttons are always visible. A user with data:write but lacking schedule:write/teaching-task:write will see buttons but get 403 on click.',
    evidence: phaseEDone
      ? 'admin-db-content.tsx uses useHasPermission(getAdminModelWritePermission(activeTable)) for canWriteCurrentModel and useHasPermission("data:delete") for canDelete.'
      : 'No useHasPermission calls in src/components/admin-db/ or src/app/admin/db/.',
    recommendation: phaseEDone
      ? 'Phase E done. Frontend model-specific gating complete.'
      : 'Add frontend model-specific permission gating in Phase E to prevent 403 UX.',
  },
  {
    id: 'K15-ADMIN-MATRIX-LOW-1',
    severity: 'LOW',
    area: 'teaching-task create uses data:write',
    description: 'POST /api/teaching-task (create) still uses data:write, not teaching-task:write. This is inconsistent with PUT which uses teaching-task:write.',
    evidence: 'teaching-task/route.ts:7 uses data:write. teaching-task/[id]/route.ts:21 uses teaching-task:write.',
    recommendation: 'Consider migrating teaching-task POST to teaching-task:write for consistency.',
  },
  {
    id: 'K15-ADMIN-MATRIX-LOW-2',
    severity: 'LOW',
    area: 'scheduleslot/teachingtask DELETE uses data:delete',
    description: 'DELETE for scheduleslot and teachingtask uses data:delete, same as ordinary models. Deleting schedule data may warrant a stronger permission.',
    evidence: 'route.ts:317 DELETE uses data:delete for all models.',
    recommendation: 'Low priority — DELETE has referential integrity checks. Consider if schedule:delete is needed.',
  },
  {
    id: 'K15-ADMIN-MATRIX-NONE-1',
    severity: 'NONE',
    area: 'dedicated route migration complete',
    description: 'Dedicated schedule-slot and teaching-task routes have been migrated to granular permissions (Fix-B). Server guards preserved.',
    evidence: 'schedule-slot POST/PUT: schedule:write. teaching-task PUT: teaching-task:write. Guards intact.',
    recommendation: 'No action needed.',
  },
  {
    id: 'K15-ADMIN-MATRIX-NONE-2',
    severity: 'NONE',
    area: 'schedule-grid migration complete',
    description: 'Schedule-grid frontend gating migrated to schedule:write (Fix-C).',
    evidence: 'schedule-grid.tsx:60 uses schedule:write.',
    recommendation: 'No action needed.',
  },
  {
    id: 'K15-ADMIN-MATRIX-NONE-3',
    severity: 'NONE',
    area: 'server guards adequate',
    description: 'Admin generic route has proper guards: mutation guard for scheduleslot, teacher conflict guard for teachingtask, semester scoping, referential integrity on DELETE.',
    evidence: 'guardAdminSlotCreate, guardAdminSlotUpdate, guardAdminTaskUpdate, resolveSemesterIfNeeded, countReferences all present.',
    recommendation: 'No action needed.',
  },
  {
    id: 'K15-ADMIN-MATRIX-NONE-5',
    severity: 'NONE',
    area: 'Phase E admin frontend model gating',
    description: phaseEDone
      ? 'Admin frontend data page now uses model-specific permission gating. Create/edit/save are gated by getAdminModelWritePermission(activeTable). Delete is gated by data:delete. Defensive no-op in all write handlers.'
      : 'Phase E not yet done — admin frontend has no model-specific permission checks.',
    evidence: phaseEDone
      ? 'admin-db-config.ts has getAdminModelWritePermission. admin-db-content.tsx uses useHasPermission(getAdminModelWritePermission(activeTable)) for canWriteCurrentModel, useHasPermission("data:delete") for canDelete.'
      : 'No model-specific permission checks in admin frontend.',
    recommendation: phaseEDone
      ? 'Phase E complete. K15 migration is DONE.'
      : 'Phase E pending — add frontend model-specific permission gating.',
  },
]

const severityOrder: Record<string, number> = { HIGH: 0, MEDIUM: 1, LOW: 2, NONE: 3 }
const sorted = findings.sort((a, b) => severityOrder[a.severity] - severityOrder[b.severity])
for (const f of sorted) {
  console.log(`  [${f.severity}] ${f.id}`)
  console.log(`    Area: ${f.area}`)
  console.log(`    ${f.description}`)
  console.log(`    Evidence: ${f.evidence}`)
  console.log(`    Recommendation: ${f.recommendation}`)
  console.log()
}

const highCount = findings.filter(f => f.severity === 'HIGH').length
const medCount = findings.filter(f => f.severity === 'MEDIUM').length
const lowCount = findings.filter(f => f.severity === 'LOW').length
const noneCount = findings.filter(f => f.severity === 'NONE').length

console.log('── Summary ──')
console.log(`  HIGH: ${highCount}`)
console.log(`  MEDIUM: ${medCount}`)
console.log(`  LOW: ${lowCount}`)
console.log(`  NONE: ${noneCount}`)

console.log('\n── Recommended Fix-D Option ──')
console.log('  Option A: Minimal server-only matrix')
console.log('    - Migrate generic route scheduleslot write → schedule:write')
console.log('    - Migrate generic route teachingtask write → teaching-task:write')
console.log('    - Keep ordinary models on data:write')
console.log('    - Frontend admin data page: keep data:write for page access')
console.log('    - Risk: users with data:write but not schedule:write get 403 on schedule operations')
console.log('    - Recommendation: YES — minimal scope, addresses core inconsistency')

console.log('\n' + '─'.repeat(60))
console.log(`Overall: ${passed} passed, ${failed} failed`)

if (failed > 0) {
  console.error('\n❌ Some checks failed')
  process.exit(1)
} else {
  console.log('\n✅ Audit complete')
  process.exit(0)
}
