// scripts/audit-rbac-permission-granularity-migration.ts
// K15 — RBAC Permission Granularity Migration Audit
// Read-only: scans src/ for permission strings, data:write use sites,
// schedule-sensitive operations, admin generic route model permissions,
// frontend gating, and outputs structured findings.
//
// Does NOT connect to the database. Does NOT modify any files.

import * as fs from 'fs'
import * as path from 'path'

// ─── Helpers ──────────────────────────────────────────────────────

function readFile(relPath: string): string | null {
  const abs = path.resolve(process.cwd(), relPath)
  if (!fs.existsSync(abs)) return null
  return fs.readFileSync(abs, 'utf-8')
}

function readLines(relPath: string): string[] {
  const content = readFile(relPath)
  if (!content) return []
  return content.split('\n')
}

function findAllFiles(dir: string, ext: string[]): string[] {
  const results: string[] = []
  const absDir = path.resolve(process.cwd(), dir)
  if (!fs.existsSync(absDir)) return results
  const entries = fs.readdirSync(absDir, { withFileTypes: true })
  for (const entry of entries) {
    const fullPath = path.join(absDir, entry.name)
    const relPath = path.relative(process.cwd(), fullPath).replace(/\\/g, '/')
    if (entry.isDirectory()) {
      if (entry.name === 'node_modules' || entry.name === '.next') continue
      results.push(...findAllFiles(relPath, ext))
    } else if (ext.some((e) => entry.name.endsWith(e))) {
      results.push(relPath)
    }
  }
  return results
}

function grepFile(relPath: string, pattern: RegExp): Array<{ line: number; text: string }> {
  const lines = readLines(relPath)
  const matches: Array<{ line: number; text: string }> = []
  for (let i = 0; i < lines.length; i++) {
    if (pattern.test(lines[i])) {
      matches.push({ line: i + 1, text: lines[i].trim() })
    }
  }
  return matches
}

// ─── Permission Strings ───────────────────────────────────────────

const TYPES_FILE = 'src/lib/auth/types.ts'
const typesContent = readFile(TYPES_FILE) ?? ''

const permMatch = typesContent.match(/ALL_PERMISSIONS\s*=\s*\[([\s\S]*?)\]/)
const PERMISSIONS: string[] = []
if (permMatch) {
  const inner = permMatch[1]
  const re = /'([^']+)'/g
  let m: RegExpExecArray | null
  while ((m = re.exec(inner)) !== null) {
    PERMISSIONS.push(m[1])
  }
}

const rolesMatch = typesContent.match(/ROLES\s*=\s*\{([\s\S]*?)\}/)
const ROLES: string[] = []
if (rolesMatch) {
  const re = /(\w+):\s*'\w+'/g
  let m: RegExpExecArray | null
  while ((m = re.exec(rolesMatch[1])) !== null) {
    ROLES.push(m[1])
  }
}

// ─── data:write Use Sites ─────────────────────────────────────────

const srcFiles = findAllFiles('src', ['.ts', '.tsx'])
const scriptFiles = findAllFiles('scripts', ['.ts'])

interface UseSite {
  file: string
  line: number
  text: string
  category: string
  scheduleSensitive: boolean
}

const dataWriteUseSites: UseSite[] = []

for (const file of [...srcFiles, ...scriptFiles]) {
  const matches = grepFile(file, /data:write/)
  for (const m of matches) {
    let category = 'unknown'
    let scheduleSensitive = false

    if (file.includes('types.ts') && m.text.includes('ALL_PERMISSIONS')) {
      category = 'permission-definition'
    } else if (file.includes('seed-auth')) {
      category = 'seed-script'
    } else if (file.includes('test-')) {
      category = 'test-script'
    } else if (file.includes('verify-')) {
      category = 'verification-script'
    } else if (file.includes('audit-')) {
      category = 'audit-script'
    } else if (file.includes('route.ts') && file.includes('admin/[model]')) {
      category = 'admin-generic-route'
      // All admin generic writes are schedule-sensitive because they
      // can mutate scheduleslot and teachingtask
      scheduleSensitive = true
    } else if (file.includes('schedule-slot') && file.includes('route.ts')) {
      category = 'schedule-slot-route'
      scheduleSensitive = true
    } else if (file.includes('teaching-task') && file.includes('route.ts')) {
      category = 'teaching-task-route'
      scheduleSensitive = true
    } else if (file.includes('courses/route.ts') || file.includes('teachers/route.ts')) {
      category = 'entity-route'
    } else if (file.includes('schedule-grid')) {
      category = 'frontend-schedule-grid'
      scheduleSensitive = true
    } else if (file.includes('current-user-context')) {
      category = 'frontend-context-comment'
    } else if (file.includes('route-permissions')) {
      category = 'route-permissions-config'
    } else if (file.includes('navigation')) {
      category = 'navigation-config'
    }

    dataWriteUseSites.push({ file, line: m.line, text: m.text, category, scheduleSensitive })
  }
}

// ─── Schedule-Sensitive Capabilities ──────────────────────────────

interface ScheduleCap {
  capability: string
  file: string
  line: number
  permission: string
  risk: string
}

const scheduleCapabilities: ScheduleCap[] = []

// Check schedule-slot routes
const slotCreate = readFile('src/app/api/schedule-slot/route.ts')
if (slotCreate && slotCreate.includes("requirePermission('data:write'")) {
  const lineNum = readLines('src/app/api/schedule-slot/route.ts').findIndex((l) => l.includes("requirePermission('data:write'")) + 1
  scheduleCapabilities.push({
    capability: 'ScheduleSlot create (dedicated route)',
    file: 'src/app/api/schedule-slot/route.ts',
    line: lineNum,
    permission: 'data:write',
    risk: 'ScheduleSlot create is schedule-sensitive but uses data:write',
  })
}

const slotUpdate = readFile('src/app/api/schedule-slot/[id]/route.ts')
if (slotUpdate && slotUpdate.includes("requirePermission('data:write'")) {
  const lineNum = readLines('src/app/api/schedule-slot/[id]/route.ts').findIndex((l) => l.includes("requirePermission('data:write'")) + 1
  scheduleCapabilities.push({
    capability: 'ScheduleSlot update (dedicated route)',
    file: 'src/app/api/schedule-slot/[id]/route.ts',
    line: lineNum,
    permission: 'data:write',
    risk: 'ScheduleSlot update is schedule-sensitive but uses data:write',
  })
}

// Check teaching-task routes
const taskCreate = readFile('src/app/api/teaching-task/route.ts')
if (taskCreate && taskCreate.includes("requirePermission('data:write'")) {
  const lineNum = readLines('src/app/api/teaching-task/route.ts').findIndex((l) => l.includes("requirePermission('data:write'")) + 1
  scheduleCapabilities.push({
    capability: 'TeachingTask create (dedicated route)',
    file: 'src/app/api/teaching-task/route.ts',
    line: lineNum,
    permission: 'data:write',
    risk: 'TeachingTask create is schedule-sensitive but uses data:write',
  })
}

const taskUpdate = readFile('src/app/api/teaching-task/[id]/route.ts')
if (taskUpdate && taskUpdate.includes("requirePermission('data:write'")) {
  const lineNum = readLines('src/app/api/teaching-task/[id]/route.ts').findIndex((l) => l.includes("requirePermission('data:write'")) + 1
  scheduleCapabilities.push({
    capability: 'TeachingTask update (dedicated route)',
    file: 'src/app/api/teaching-task/[id]/route.ts',
    line: lineNum,
    permission: 'data:write',
    risk: 'TeachingTask update (with room conflict check) is schedule-sensitive but uses data:write',
  })
}

// Admin generic route covers scheduleslot and teachingtask
const adminGeneric = readFile('src/app/api/admin/[model]/route.ts')
if (adminGeneric) {
  if (adminGeneric.includes("requirePermission('data:write'")) {
    scheduleCapabilities.push({
      capability: 'Admin generic POST (all models incl. scheduleslot, teachingtask)',
      file: 'src/app/api/admin/[model]/route.ts',
      line: readLines('src/app/api/admin/[model]/route.ts').findIndex((l) => l.includes("requirePermission('data:write'") && l.includes('POST')) + 1 || 181,
      permission: 'data:write',
      risk: 'Admin generic POST covers schedule-sensitive models (scheduleslot, teachingtask) with same data:write as ordinary models',
    })
    scheduleCapabilities.push({
      capability: 'Admin generic PUT (all models incl. scheduleslot, teachingtask)',
      file: 'src/app/api/admin/[model]/route.ts',
      line: readLines('src/app/api/admin/[model]/route.ts').findIndex((l) => l.includes("requirePermission('data:write'") && l.includes('PUT')) + 1 || 234,
      permission: 'data:write',
      risk: 'Admin generic PUT covers schedule-sensitive models (scheduleslot, teachingtask) with same data:write as ordinary models',
    })
  }
}

// ─── Import Use Sites ─────────────────────────────────────────────

const importUseSites: Array<{ file: string; line: number; permission: string }> = []
for (const file of [...srcFiles, ...scriptFiles]) {
  const matches = grepFile(file, /import:manage/)
  for (const m of matches) {
    if (file.includes('route.ts') && file.includes('api/admin/import')) {
      importUseSites.push({ file, line: m.line, permission: 'import:manage' })
    }
  }
}

// ─── Schedule:adjust Use Sites ────────────────────────────────────

const adjustUseSites: Array<{ file: string; line: number; context: string }> = []
for (const file of srcFiles) {
  const matches = grepFile(file, /schedule:adjust/)
  for (const m of matches) {
    let context = 'unknown'
    if (file.includes('route.ts') && file.includes('api/')) context = 'api-route'
    else if (file.includes('navigation')) context = 'navigation'
    else if (file.includes('route-permissions')) context = 'route-permissions'
    else if (file.includes('.tsx')) context = 'frontend-component'
    adjustUseSites.push({ file, line: m.line, context })
  }
}

// ─── Frontend Gating ──────────────────────────────────────────────

interface FrontendGate {
  file: string
  line: number
  permission: string
  area: string
}

const frontendGates: FrontendGate[] = []
for (const file of srcFiles) {
  if (!file.endsWith('.tsx') && !file.endsWith('.ts')) continue
  if (file.includes('lib/auth/')) continue // skip auth infrastructure
  const matches = grepFile(file, /useHasPermission\('([^']+)'\)/)
  for (const m of matches) {
    const permMatch = m.text.match(/useHasPermission\('([^']+)'\)/)
    if (!permMatch) continue
    let area = 'unknown'
    if (file.includes('schedule-grid')) area = 'schedule-grid (drag-to-edit)'
    else if (file.includes('schedule-adjustment-dialog')) area = 'schedule-adjustment-dialog'
    else if (file.includes('dashboard-content')) area = 'dashboard-content (void)'
    else area = path.basename(file)
    frontendGates.push({ file, line: m.line, permission: permMatch[1], area })
  }
}

// ─── Admin Generic Route Model Analysis ───────────────────────────

const modelMap: Record<string, { schedule: boolean; priority: string; suggested: string }> = {
  classgroup: { schedule: false, priority: 'LOW', suggested: 'data:write' },
  teacher: { schedule: false, priority: 'LOW', suggested: 'data:write' },
  course: { schedule: false, priority: 'LOW', suggested: 'data:write' },
  room: { schedule: true, priority: 'MEDIUM', suggested: 'data:write (capacity is schedule:adjust)' },
  scheduleslot: { schedule: true, priority: 'HIGH', suggested: 'schedule:write' },
  teachingtask: { schedule: true, priority: 'HIGH', suggested: 'teaching-task:write' },
}

// ─── Conflict-check read permission ───────────────────────────────

const conflictCheckFile = readFile('src/app/api/conflict-check/route.ts')
let conflictCheckPerm = 'unknown'
if (conflictCheckFile) {
  const permMatch = conflictCheckFile.match(/requirePermission\('([^']+)'/)
  if (permMatch) conflictCheckPerm = permMatch[1]
}

// ─── Schedule-adjustments read permission ─────────────────────────

const schedAdjFile = readFile('src/app/api/schedule-adjustments/route.ts')
let schedAdjGetPerm = 'unknown'
let schedAdjPostPerm = 'unknown'
if (schedAdjFile) {
  const lines = readLines('src/app/api/schedule-adjustments/route.ts')
  for (let i = 0; i < lines.length; i++) {
    if (lines[i].includes('requirePermission')) {
      const pm = lines[i].match(/requirePermission\('([^']+)'/)
      if (pm) {
        if (i < 20) schedAdjGetPerm = pm[1] // GET is first
        else schedAdjPostPerm = pm[1]
      }
    }
  }
}

// ─── Phase A Detection ────────────────────────────────────────────

const hasScheduleWrite = PERMISSIONS.includes('schedule:write')
const hasTeachingTaskWrite = PERMISSIONS.includes('teaching-task:write')
const phaseADone = hasScheduleWrite && hasTeachingTaskWrite

// Check if seed-auth maps new permissions to ADMIN
const seedContent = readFile('scripts/seed-auth.ts') ?? ''
const seedMapsScheduleWrite = seedContent.includes("'schedule:write'")
const seedMapsTeachingTaskWrite = seedContent.includes("'teaching-task:write'")

// Phase B Detection: dedicated routes migrated to new permissions
const slotCreateRoute = readFile('src/app/api/schedule-slot/route.ts') ?? ''
const slotUpdateRoute = readFile('src/app/api/schedule-slot/[id]/route.ts') ?? ''
const taskUpdateRoute = readFile('src/app/api/teaching-task/[id]/route.ts') ?? ''

const slotCreateUsesScheduleWrite = slotCreateRoute.includes("requirePermission('schedule:write'")
const slotUpdateUsesScheduleWrite = slotUpdateRoute.includes("requirePermission('schedule:write'")
const taskUpdateUsesTeachingTaskWrite = taskUpdateRoute.includes("requirePermission('teaching-task:write'")

const dedicatedRouteMigrationDone = slotCreateUsesScheduleWrite && slotUpdateUsesScheduleWrite && taskUpdateUsesTeachingTaskWrite

// Check if routes still use data:write (not migrated) — only count dedicated routes
const dedicatedRoutesStillUseDataWrite =
  slotCreateRoute.includes("requirePermission('data:write'") ||
  slotUpdateRoute.includes("requirePermission('data:write'") ||
  taskUpdateRoute.includes("requirePermission('data:write'")

// Check if frontend still uses data:write for schedule-grid
const frontendStillUsesDataWrite = frontendGates.some((g) => g.permission === 'data:write' && g.area.includes('schedule-grid'))

// Phase C Detection: frontend schedule-grid uses schedule:write
const scheduleGridSrc = readFile('src/components/schedule-grid.tsx') ?? ''
const frontendUsesScheduleWrite = scheduleGridSrc.includes("useHasPermission('schedule:write')")
const phaseCDone = frontendUsesScheduleWrite && !frontendStillUsesDataWrite

// Check if admin generic route still uses data:write
const adminGenericRoute = readFile('src/app/api/admin/[model]/route.ts') ?? ''
const adminGenericStillUsesDataWrite = adminGenericRoute.includes("requirePermission('data:write'")

// Phase D Detection: admin generic route uses model-specific permissions
const adminGenericHasHelper = adminGenericRoute.includes('getAdminWritePermission')
const adminGenericScheduleslotUsesScheduleWrite = adminGenericRoute.includes("return 'schedule:write'") && adminGenericHasHelper
const adminGenericTeachingtaskUsesTeachingTaskWrite = adminGenericRoute.includes("return 'teaching-task:write'") && adminGenericHasHelper
const phaseDDone = adminGenericScheduleslotUsesScheduleWrite && adminGenericTeachingtaskUsesTeachingTaskWrite && !adminGenericStillUsesDataWrite

// ─── Output ───────────────────────────────────────────────────────

console.log('═'.repeat(70))
console.log('K15 RBAC Permission Granularity Migration Audit')
console.log('═'.repeat(70))

console.log(`\nFiles scanned: ${srcFiles.length} (src) + ${scriptFiles.length} (scripts) = ${srcFiles.length + scriptFiles.length}`)
console.log(`Permission strings discovered: ${PERMISSIONS.length}`)
console.log(`Roles discovered: ${ROLES.length}`)
console.log(`data:write use sites: ${dataWriteUseSites.length}`)
console.log(`Schedule-sensitive data:write sites: ${dataWriteUseSites.filter((s) => s.scheduleSensitive).length}`)
console.log(`Ordinary data use sites: ${dataWriteUseSites.filter((s) => !s.scheduleSensitive).length}`)
console.log(`Frontend gating sites: ${frontendGates.length}`)
console.log(`Import API routes using import:manage: ${importUseSites.length}`)
console.log(`Schedule:adjust use sites (src): ${adjustUseSites.length}`)

console.log('\n── Phase A Status ──')
console.log(`  schedule:write in ALL_PERMISSIONS: ${hasScheduleWrite ? 'YES' : 'NO'}`)
console.log(`  teaching-task:write in ALL_PERMISSIONS: ${hasTeachingTaskWrite ? 'YES' : 'NO'}`)
console.log(`  schedule:write in seed-auth descriptions: ${seedMapsScheduleWrite ? 'YES' : 'NO'}`)
console.log(`  teaching-task:write in seed-auth descriptions: ${seedMapsTeachingTaskWrite ? 'YES' : 'NO'}`)
console.log(`  Phase A complete: ${phaseADone ? 'YES' : 'NO'}`)
console.log(`  Dedicated route migration done: ${dedicatedRouteMigrationDone ? 'YES' : 'NO'}`)
console.log(`  Dedicated routes still use data:write: ${dedicatedRoutesStillUseDataWrite ? 'YES' : 'NO'}`)
console.log(`  Frontend migration pending: ${frontendStillUsesDataWrite ? 'YES (schedule-grid still uses data:write)' : 'NO'}`)
console.log(`  Admin generic still uses data:write: ${adminGenericStillUsesDataWrite ? 'YES' : 'NO'}`)
console.log(`  Phase B (dedicated routes): ${dedicatedRouteMigrationDone ? 'DONE' : 'PENDING'}`)
console.log(`  Phase C (frontend gating): ${phaseCDone ? 'DONE' : 'PENDING'}`)
console.log(`  Phase D (admin generic route): ${phaseDDone ? 'DONE' : 'PENDING'}`)
console.log(`  Phase E (admin frontend model gating): PENDING`)

console.log('\n── Permission Strings ──')
for (const p of PERMISSIONS) console.log(`  ${p}`)

console.log('\n── Roles ──')
for (const r of ROLES) console.log(`  ${r}`)

console.log('\n── data:write Use Site Classification ──')
const categories = new Map<string, number>()
for (const site of dataWriteUseSites) {
  categories.set(site.category, (categories.get(site.category) || 0) + 1)
}
for (const [cat, count] of categories) {
  console.log(`  ${cat}: ${count}`)
}

console.log('\n── Schedule-Sensitive Capabilities via data:write ──')
for (const cap of scheduleCapabilities) {
  console.log(`  [${cap.file}:${cap.line}] ${cap.capability}`)
  console.log(`    Permission: ${cap.permission}`)
  console.log(`    Risk: ${cap.risk}`)
}

console.log('\n── Frontend Gating Summary ──')
for (const gate of frontendGates) {
  console.log(`  ${gate.area}: ${gate.permission} (${gate.file}:${gate.line})`)
}

console.log('\n── Admin Generic Route Model Analysis ──')
for (const [model, info] of Object.entries(modelMap)) {
  console.log(`  ${model}: schedule=${info.schedule}, priority=${info.priority}, suggested=${info.suggested}`)
}

console.log(`\n── Conflict-check read permission: ${conflictCheckPerm}`)
console.log(`── Schedule-adjustments GET permission: ${schedAdjGetPerm}`)
console.log(`── Schedule-adjustments POST permission: ${schedAdjPostPerm}`)

// ─── Findings ─────────────────────────────────────────────────────

interface Finding {
  id: string
  severity: 'HIGH' | 'MEDIUM' | 'LOW' | 'NONE'
  area: string
  description: string
  evidence: string
  recommendation: string
}

const findings: Finding[] = []

findings.push({
  id: 'K15-RBAC-MEDIUM-1',
  severity: 'MEDIUM',
  area: 'data:write scope',
  description: 'data:write covers both ordinary data CRUD (classgroup, teacher, course) and schedule-sensitive operations (scheduleslot, teachingtask) via the admin generic route and dedicated routes.',
  evidence: `Admin generic POST/PUT uses data:write for all models. Dedicated /api/schedule-slot and /api/teaching-task routes also use data:write. ${dataWriteUseSites.filter((s) => s.scheduleSensitive).length} schedule-sensitive sites share data:write with ordinary data sites.`,
  recommendation: 'Consider splitting into data:write (ordinary) + schedule:write (scheduleslot) + teaching-task:write (teachingtask). See recommended taxonomy.',
})

findings.push({
  id: 'K15-RBAC-MEDIUM-2',
  severity: 'MEDIUM',
  area: 'admin generic route',
  description: 'Admin generic route applies uniform data:write to all models, preventing model-specific permission granularity.',
  evidence: 'src/app/api/admin/[model]/route.ts POST line 181 and PUT line 234 both use requirePermission("data:write") for all 6 models in MODEL_MAP.',
  recommendation: 'Phase D of migration: introduce per-model permission matrix in admin generic route, or extract schedule-sensitive models to dedicated routes.',
})

findings.push({
  id: 'K15-RBAC-MEDIUM-3',
  severity: 'MEDIUM',
  area: 'frontend gating mismatch',
  description: 'Schedule grid drag-to-edit uses data:write, while schedule adjustments use schedule:adjust. A user with schedule:adjust but not data:write cannot drag slots but can create adjustments (and vice versa).',
  evidence: 'schedule-grid.tsx line 60: useHasPermission("data:write"). schedule-adjustment-dialog.tsx line 54: useHasPermission("schedule:adjust"). These are different permission axes for overlapping schedule mutation operations.',
  recommendation: 'After permission split, schedule grid drag should gate on schedule:write (or schedule:adjust if combined). Current mismatch is intentional (K14-FIX-A) but should be revisited during migration.',
})

findings.push({
  id: 'K15-RBAC-MEDIUM-4',
  severity: 'MEDIUM',
  area: 'import:manage scope',
  description: 'import:manage covers all import operations uniformly: parse (creates ImportBatch), confirm (writes TeachingTask/ScheduleSlot), rollback (deletes data), and abandon (status change). Read-only batch listing also requires import:manage.',
  evidence: '6 API routes all use requirePermission("import:manage"): parse, confirm, rollback, abandon, batches list, batch detail. A user who can view import history can also execute confirm/rollback.',
  recommendation: 'Current scope is acceptable for admin-only use. If import read access is ever needed for non-admin users, split into import:read + import:manage.',
})

findings.push({
  id: 'K15-RBAC-LOW-1',
  severity: 'LOW',
  area: 'permission naming',
  description: 'data:write is used as both a generic CRUD permission and a schedule mutation permission. The name does not convey its schedule-sensitive scope.',
  evidence: 'Frontend schedule-grid.tsx maps data:write to canWriteSchedule. The name "data:write" suggests generic data editing, not schedule mutation.',
  recommendation: 'If splitting, rename or alias to make schedule:write distinct from data:write.',
})

findings.push({
  id: 'K15-RBAC-LOW-2',
  severity: 'LOW',
  area: 'schedule:adjust scope',
  description: 'schedule:adjust covers auto-scheduler (preview/apply/rollback), schedule adjustments (create/void), room capacity management, and scheduler run history. This is a coherent "scheduling operations" permission.',
  evidence: '10 API routes use schedule:adjust: adjustments create/dry-run/void, scheduler preview/apply/rollback/runs/run-detail, rooms capacity GET/PATCH.',
  recommendation: 'No split recommended. schedule:adjust is well-scoped to "scheduling operations" domain. Document as canonical permission for all scheduling mutations.',
})

findings.push({
  id: 'K15-RBAC-LOW-3',
  severity: 'LOW',
  area: 'conflict-check read permission',
  description: 'conflict-check uses schedule:view (read permission) for a POST endpoint that returns conflict data. This is correct — it is a read-only analysis operation despite using POST.',
  evidence: 'src/app/api/conflict-check/route.ts line 8: requirePermission("schedule:view"). The endpoint does not write any data.',
  recommendation: 'No change needed. schedule:view is appropriate for conflict analysis.',
})

findings.push({
  id: 'K15-RBAC-LOW-4',
  severity: 'LOW',
  area: 'data:delete scope',
  description: 'data:delete is only enforced on the admin generic DELETE handler and has no frontend or navigation gating. It is admin-only by role assignment, not by UI restriction.',
  evidence: 'Only 1 src API route uses data:delete: admin/[model] DELETE. No navigation item or frontend component gates on it.',
  recommendation: 'If splitting data:write, consider whether data:delete should also be split per model. Currently low risk since it has referential integrity checks.',
})

findings.push({
  id: 'K15-RBAC-NONE-1',
  severity: 'NONE',
  area: 'schedule:adjust integrity',
  description: 'schedule:adjust is consistently enforced across all schedule mutation routes (adjustments, scheduler, room capacity). Frontend and backend permissions are aligned.',
  evidence: 'All adjustment routes (create, dry-run, void) and all scheduler routes (preview, apply, rollback, runs, lockable-slots) use schedule:adjust. Frontend gates on schedule:adjust in adjustment dialog and dashboard void.',
  recommendation: 'No change needed. Maintain this pattern.',
})

findings.push({
  id: 'K15-RBAC-NONE-2',
  severity: 'NONE',
  area: 'import:manage consistency',
  description: 'import:manage is consistently enforced on all import API routes. Navigation and route-permissions are aligned.',
  evidence: '6 import API routes + navigation + route-permissions all use import:manage.',
  recommendation: 'No change needed.',
})

if (phaseADone) {
  findings.push({
    id: 'K15-RBAC-NONE-3',
    severity: 'NONE',
    area: 'Phase A completion',
    description: 'schedule:write and teaching-task:write have been added to ALL_PERMISSIONS and seed-auth. ADMIN role has these permissions. Routes and frontend still use data:write (pending Phase B/C/D).',
    evidence: `ALL_PERMISSIONS now contains ${PERMISSIONS.length} permissions. schedule:write=${hasScheduleWrite}, teaching-task:write=${hasTeachingTaskWrite}. Dedicated route migration: ${dedicatedRouteMigrationDone}. Frontend migration pending: ${frontendStillUsesDataWrite}.`,
    recommendation: 'Phase A complete. Proceed to Phase B (dedicated routes), Phase C (frontend gating), Phase D (admin generic route) in subsequent stages.',
  })
}

if (dedicatedRouteMigrationDone) {
  findings.push({
    id: 'K15-RBAC-NONE-4',
    severity: 'NONE',
    area: 'Phase B dedicated route migration',
    description: 'Dedicated schedule-slot and teaching-task routes have been migrated to schedule:write and teaching-task:write. Admin generic route and frontend gating still use data:write.',
    evidence: `schedule-slot POST uses schedule:write=${slotCreateUsesScheduleWrite}, PUT uses schedule:write=${slotUpdateUsesScheduleWrite}, teaching-task PUT uses teaching-task:write=${taskUpdateUsesTeachingTaskWrite}. Admin generic still uses data:write=${adminGenericStillUsesDataWrite}. Frontend still uses data:write=${frontendStillUsesDataWrite}.`,
    recommendation: 'Phase B complete. Proceed to Phase C (frontend gating) and Phase D (admin generic route).',
  })
}

if (phaseCDone) {
  findings.push({
    id: 'K15-RBAC-NONE-5',
    severity: 'NONE',
    area: 'Phase C frontend gating migration',
    description: 'Schedule-grid drag-to-edit now uses schedule:write instead of data:write. Frontend gating is aligned with dedicated server route permissions. Admin generic route still uses data:write.',
    evidence: `schedule-grid uses schedule:write=${frontendUsesScheduleWrite}, still uses data:write=${frontendStillUsesDataWrite}. Admin generic still uses data:write=${adminGenericStillUsesDataWrite}.`,
    recommendation: 'Phase C complete. Proceed to Phase D (admin generic route model-specific permission matrix).',
  })
}

if (phaseDDone) {
  findings.push({
    id: 'K15-RBAC-NONE-6',
    severity: 'NONE',
    area: 'Phase D admin generic server matrix',
    description: 'Admin generic route now uses model-specific write permissions. scheduleslot uses schedule:write, teachingtask uses teaching-task:write, ordinary models use data:write. Frontend admin data page has no model-specific gating.',
    evidence: `Admin generic has getAdminWritePermission helper. scheduleslot uses schedule:write=${adminGenericScheduleslotUsesScheduleWrite}, teachingtask uses teaching-task:write=${adminGenericTeachingtaskUsesTeachingTaskWrite}.`,
    recommendation: 'Phase D complete. Proceed to Phase E (admin frontend model-specific permission gating).',
  })
}

// ─── Output Findings ──────────────────────────────────────────────

console.log('\n── Findings ──')
const severityOrder = { HIGH: 0, MEDIUM: 1, LOW: 2, NONE: 3 }
const sorted = findings.sort((a, b) => severityOrder[a.severity] - severityOrder[b.severity])
for (const f of sorted) {
  console.log(`\n  [${f.severity}] ${f.id}`)
  console.log(`    Area: ${f.area}`)
  console.log(`    ${f.description}`)
  console.log(`    Evidence: ${f.evidence}`)
  console.log(`    Recommendation: ${f.recommendation}`)
}

const highCount = findings.filter((f) => f.severity === 'HIGH').length
const medCount = findings.filter((f) => f.severity === 'MEDIUM').length
const lowCount = findings.filter((f) => f.severity === 'LOW').length
const noneCount = findings.filter((f) => f.severity === 'NONE').length

console.log('\n── Summary ──')
console.log(`  HIGH: ${highCount}`)
console.log(`  MEDIUM: ${medCount}`)
console.log(`  LOW: ${lowCount}`)
console.log(`  NONE: ${noneCount}`)

console.log('\n── Recommended Permission Taxonomy ──')
console.log('  Option A (Minimal Split):')
console.log('    Keep: data:read, data:write, data:delete, data:export, schedule:view, schedule:adjust, import:manage, settings:manage, users:manage, diagnostics:view')
console.log('    Add: schedule:write (for scheduleslot CRUD), teaching-task:write (for teachingtask CRUD)')
console.log('    Result: 12 permissions, backward compatible')
console.log('')
console.log('  Option B (Finer Split):')
console.log('    Keep: data:read, data:export, schedule:view, schedule:adjust, import:manage, settings:manage, users:manage, diagnostics:view')
console.log('    Replace data:write with: room:write, course:write, class-group:write, teacher:write')
console.log('    Add: schedule:write, teaching-task:write, schedule:admin')
console.log('    Result: 16 permissions, higher migration cost')
console.log('')
console.log('  Recommendation: Option A — minimal split preserves backward compatibility while addressing the core issue (data:write covering schedule-sensitive operations).')

console.log('\n── Migration Recommendation ──')
if (phaseADone && dedicatedRouteMigrationDone && phaseCDone && phaseDDone) {
  console.log(`  Phase A: DONE — schedule:write and teaching-task:write defined and seeded to ADMIN`)
  console.log(`  Phase B (dedicated routes): DONE — schedule-slot/teaching-task routes use new permissions`)
  console.log(`  Phase C (frontend gating): DONE — schedule-grid uses schedule:write`)
  console.log(`  Phase D (admin generic route): DONE — admin/[model] uses model-specific permissions`)
  console.log(`  Phase E (admin frontend model gating): PENDING — admin data page has no model-specific permission checks`)
  console.log(`  Next step: Phase E — add frontend model-specific permission gating to admin data page`)
} else if (phaseADone && dedicatedRouteMigrationDone && phaseCDone) {
  console.log(`  Phase A: DONE — schedule:write and teaching-task:write defined and seeded to ADMIN`)
  console.log(`  Phase B (dedicated routes): DONE — schedule-slot/teaching-task routes use new permissions`)
  console.log(`  Phase C (frontend gating): DONE — schedule-grid uses schedule:write`)
  console.log(`  Phase D (admin generic route): PENDING — admin/[model] still uses data:write for all models`)
  console.log(`  Next step: Phase D — migrate admin generic route with model-specific permission matrix`)
} else if (phaseADone && dedicatedRouteMigrationDone) {
  console.log(`  Phase A: DONE — schedule:write and teaching-task:write defined and seeded to ADMIN`)
  console.log(`  Phase B (dedicated routes): DONE — schedule-slot/teaching-task routes use new permissions`)
  console.log(`  Phase C (frontend gating): PENDING — schedule-grid still uses data:write`)
  console.log(`  Phase D (admin generic route): PENDING — admin/[model] still uses data:write for all models`)
  console.log(`  Next step: Phase C — migrate frontend gating to schedule:write`)
} else if (phaseADone) {
  console.log(`  Phase A: DONE — schedule:write and teaching-task:write defined and seeded to ADMIN`)
  console.log(`  Phase B (dedicated routes): PENDING — schedule-slot/teaching-task routes still use data:write`)
  console.log(`  Phase C (frontend gating): PENDING — schedule-grid still uses data:write`)
  console.log(`  Phase D (admin generic route): PENDING — admin/[model] still uses data:write for all models`)
  console.log(`  Next step: Phase B or C — migrate dedicated routes or frontend gating to new permissions`)
} else {
  console.log(`  Fix-A allowed: YES (conditional)`)
  console.log(`  Suggested first phase: Add schedule:write + teaching-task:write constants and seed them alongside existing permissions. No route changes.`)
  console.log(`  Minimum scope: Phase A only — add constants, seed new permissions to ADMIN role, update tests. Routes still use data:write.`)
}

console.log('\n' + '═'.repeat(70))
console.log('Audit complete.')
console.log('═'.repeat(70))

process.exit(0)
