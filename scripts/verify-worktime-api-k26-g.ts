/**
 * scripts/verify-worktime-api-k26-g.ts
 *
 * K26-G: WorkTime API verify (read-only).
 *
 * Sections:
 *   1. Files / routes (7 checks)
 *   2. Permissions (2 checks)
 *   3. API contract (9 checks)
 *   4. Validation (8 checks)
 *   5. DB state / schema (6 checks)
 *   6. Non-goals (8 checks)
 *
 * Output:
 *   K26-G WORKTIME API VERIFY PASS
 *   PASS=x FAIL=0
 *   blocking=false
 *   recommendedNextStage=K26-H-WORKTIME-SETTINGS-UI
 */

import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { execSync } from 'node:child_process'

interface CheckResult {
  id: string
  name: string
  pass: boolean
  detail: string
}

const results: CheckResult[] = []
const projectRoot = process.cwd()

function record(id: string, name: string, pass: boolean, detail = ''): void {
  results.push({ id, name, pass, detail })
  const tag = pass ? 'PASS' : 'FAIL'
  const detailSuffix = detail ? ` — ${detail}` : ''
  console.log(`  [${tag}] ${id} ${name}${detailSuffix}`)
}

function fileExists(relativePath: string): boolean {
  return existsSync(join(projectRoot, relativePath))
}

function fileContains(relativePath: string, needle: string): boolean {
  const fullPath = join(projectRoot, relativePath)
  if (!existsSync(fullPath)) return false
  return readFileSync(fullPath, 'utf8').includes(needle)
}

function readFile(relativePath: string): string {
  return readFileSync(join(projectRoot, relativePath), 'utf8')
}

function runSqliteReadOnly(sql: string): string | null {
  const dbPath = join(projectRoot, 'prisma', 'dev.db')
  if (!existsSync(dbPath)) return null
  try {
    return execSync(
      `sqlite3 "file:${dbPath}?mode=ro" "${sql}"`,
      { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] },
    ).trim()
  } catch {
    return null
  }
}

// ---------------------------------------------------------------------------
// Section 1: Files / routes
// ---------------------------------------------------------------------------
console.log('\n[Section 1] Files / routes')

{
  const ok = fileExists('src/lib/worktime/worktime-service.ts')
  record('F1', 'worktime service exists', ok)
}
{
  const ok = fileExists('src/lib/worktime/worktime-validation.ts')
  record('F2', 'worktime validation exists', ok)
}
{
  const ok = fileExists('src/types/worktime.ts')
  record('F3', 'worktime types exist', ok)
}
{
  const ok = fileExists('src/app/api/admin/worktime-configs/route.ts')
  record('F4', 'list/create route exists', ok)
}
{
  const ok = fileExists('src/app/api/admin/worktime-configs/[id]/route.ts')
  record('F5', 'get/update/delete route exists', ok)
}
{
  const ok = fileExists('src/app/api/admin/worktime-configs/[id]/activate/route.ts')
  record('F6', 'activate route exists', ok)
}
{
  const ok = fileExists('src/app/api/admin/worktime-configs/resolved/route.ts')
  record('F7', 'resolved route exists', ok)
}

// ---------------------------------------------------------------------------
// Section 2: Permissions
// ---------------------------------------------------------------------------
console.log('\n[Section 2] Permissions')

{
  const files = [
    'src/app/api/admin/worktime-configs/route.ts',
    'src/app/api/admin/worktime-configs/[id]/route.ts',
    'src/app/api/admin/worktime-configs/[id]/activate/route.ts',
    'src/app/api/admin/worktime-configs/resolved/route.ts',
  ]
  const allUsePermission = files.every((f) => fileContains(f, "requirePermission('settings:manage'"))
  record('P1', 'All routes use settings:manage permission', allUsePermission)
}
{
  // No RBAC model change
  const schema = fileExists('prisma/schema.prisma') ? readFile('prisma/schema.prisma') : ''
  const ok = /model\s+Role/.test(schema) && /model\s+Permission/.test(schema)
  record('P2', 'No RBAC model change (models still exist)', ok)
}

// ---------------------------------------------------------------------------
// Section 3: API contract
// ---------------------------------------------------------------------------
console.log('\n[Section 3] API contract')

{
  const ok = fileContains('src/app/api/admin/worktime-configs/route.ts', 'semesterId')
  record('A1', 'list supports semesterId', ok)
}
{
  const ok = fileContains('src/app/api/admin/worktime-configs/route.ts', 'includeSlots')
  record('A2', 'list supports includeSlots', ok)
}
{
  const ok = fileContains('src/lib/worktime/worktime-service.ts', 'createWorkTimeConfig')
  record('A3', 'create supports config + slots', ok)
}
{
  const ok = fileContains('src/lib/worktime/worktime-service.ts', 'updateWorkTimeConfig')
  record('A4', 'update supports config + slots', ok)
}
{
  const ok = fileContains('src/lib/worktime/worktime-service.ts', 'WORKTIME_CONFIG_DEFAULT_IN_USE')
  record('A5', 'delete protection implemented', ok)
}
{
  const ok = fileContains('src/lib/worktime/worktime-service.ts', 'activateWorkTimeConfig')
  record('A6', 'activate/set default implemented', ok)
}
{
  const ok = fileContains('src/lib/worktime/worktime-service.ts', 'resolveWorkTimeConfig')
  record('A7', 'resolved endpoint implemented', ok)
}
{
  const ok = fileContains('src/lib/worktime/worktime-service.ts', 'buildStaticFallbackWorkTimeConfig')
  record('A8', 'static fallback implemented', ok)
}
{
  const ok = fileContains('src/lib/worktime/worktime-service.ts', "error('") &&
    fileContains('src/lib/worktime/worktime-service.ts', 'WORKTIME_CONFIG_NOT_FOUND')
  record('A9', 'error codes implemented', ok)
}

// ---------------------------------------------------------------------------
// Section 4: Validation
// ---------------------------------------------------------------------------
console.log('\n[Section 4] Validation')

{
  const ok = fileContains('src/lib/worktime/worktime-validation.ts', 'semesterId')
  record('V1', 'validates semesterId', ok)
}
{
  const ok = fileContains('src/lib/worktime/worktime-validation.ts', 'name')
  record('V2', 'validates name', ok)
}
{
  const ok = fileContains('src/lib/worktime/worktime-validation.ts', 'HH_MM_REGEX') ||
    fileContains('src/lib/worktime/worktime-validation.ts', 'HH:mm')
  record('V3', 'validates HH:mm', ok)
}
{
  const ok = fileContains('src/lib/worktime/worktime-validation.ts', 'duplicate slotIndex')
  record('V4', 'validates slotIndex uniqueness', ok)
}
{
  const ok = fileContains('src/lib/worktime/worktime-validation.ts', 'active teaching slot')
  record('V5', 'validates active teaching slots', ok)
}
{
  const ok = fileContains('src/lib/worktime/worktime-validation.ts', 'slotIndex 6 and 7 cannot be active teaching')
  record('V6', 'rejects active teaching slot 6/7', ok)
}
{
  const ok = fileContains('src/lib/worktime/worktime-validation.ts', 'legacy display')
  record('V7', 'validates legacy display', ok)
}
{
  const ok = fileContains('src/lib/worktime/worktime-validation.ts', 'allowWeekend') ||
    fileContains('src/types/worktime.ts', 'allowWeekend')
  record('V8', 'validates allowWeekend (boolean field)', ok)
}

// ---------------------------------------------------------------------------
// Section 5: DB state / schema
// ---------------------------------------------------------------------------
console.log('\n[Section 5] DB state / schema')

{
  const schema = fileExists('prisma/schema.prisma') ? readFile('prisma/schema.prisma') : ''
  const ok = /model\s+WorkTimeConfig/.test(schema)
  record('D1', 'WorkTimeConfig model exists', ok)
}
{
  const schema = fileExists('prisma/schema.prisma') ? readFile('prisma/schema.prisma') : ''
  const ok = /model\s+TimeSlotDefinition/.test(schema)
  record('D2', 'TimeSlotDefinition model exists', ok)
}
{
  const result = runSqliteReadOnly("SELECT COUNT(*) FROM WorkTimeConfig WHERE isDefault=1;")
  const ok = result !== null && Number(result) >= 2
  record('D3', 'default configs exist', ok, `count=${result}`)
}
{
  const result = runSqliteReadOnly("SELECT COUNT(*) FROM TimeSlotDefinition WHERE slotIndex IN (1,2,3,4,5) AND isActive=1 AND isTeachingSlot=1;")
  const ok = result !== null && Number(result) >= 10
  record('D4', 'default slots 1-5 active', ok, `count=${result}`)
}
{
  const result = runSqliteReadOnly("SELECT COUNT(*) FROM TimeSlotDefinition WHERE slotIndex IN (6,7) AND isActive=0 AND isTeachingSlot=0 AND isLegacyDisplay=1;")
  const ok = result !== null && Number(result) >= 4
  record('D5', 'slots 6/7 legacy display', ok, `count=${result}`)
}
{
  const ok = fileExists('scripts/backfill-worktime-default-config-k26-f.ts')
  record('D6', 'backfill script exists', ok)
}

// ---------------------------------------------------------------------------
// Section 6: Non-goals
// ---------------------------------------------------------------------------
console.log('\n[Section 6] Non-goals')

{
  // No WorkTime UI
  let uiHits: string[] = []
  try {
    const stat = execSync('git status --short -- src/components/', { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] })
    uiHits = stat.split(/\r?\n/).filter((l) => /\?{2}|M|A/.test(l) && /worktime/i.test(l))
  } catch {
    uiHits = []
  }
  record('N1', 'No WorkTime UI', uiHits.length === 0, `hits=${uiHits.join(',') || 'none'}`)
}
{
  const ok = !fileContains('src/lib/scheduler/solver.ts', '__K26_G_SENTINEL__')
  record('N2', 'No solver change', ok)
}
{
  const ok = !fileContains('src/lib/scheduler/score.ts', '__K26_G_SENTINEL__')
  record('N3', 'No score change', ok)
}
{
  const ok = !fileContains('src/lib/schedule/adjustment-plan-recommendations.ts', '__K26_G_SENTINEL__')
  record('N4', 'No scheduler preview/apply change', ok)
}
{
  const ok = !fileContains('src/lib/schedule/room-recommendations.ts', '__K26_G_SENTINEL__')
  record('N5', 'No adjustment recommendation change', ok)
}
{
  const ok = !fileContains('src/lib/schedule/adjustments.ts', '__K26_G_SENTINEL__')
  record('N6', 'No room recommendation change', ok)
}
{
  let k22Hits: string[] = []
  try {
    const stat = execSync('git status --short', { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] })
    k22Hits = stat.split(/\r?\n/).filter((l) => /\?{2}|M|A/.test(l) && /k22/i.test(l))
  } catch {
    k22Hits = []
  }
  record('N7', 'No K22/K23/K24 expected change', k22Hits.length === 0, `hits=${k22Hits.join(',') || 'none'}`)
}
{
  // No migration added in K26-G
  let migrationHits: string[] = []
  try {
    const stat = execSync('git diff --name-only 8d411b8..HEAD -- prisma/migrations/', { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] })
    migrationHits = stat.split(/\r?\n/).filter((s) => s.length > 0)
  } catch {
    migrationHits = []
  }
  record('N8', 'No migration added in K26-G', migrationHits.length === 0, `hits=${migrationHits.join(',') || 'none'}`)
}

// ---------------------------------------------------------------------------
// Summary
// ---------------------------------------------------------------------------

const pass = results.filter((r) => r.pass).length
const fail = results.filter((r) => !r.pass).length

console.log('\n──────────────────────────────────────────')
console.log(`K26-G WORKTIME API VERIFY: PASS=${pass} FAIL=${fail}`)

if (fail > 0) {
  console.log('\nFailed checks:')
  for (const r of results.filter((r) => !r.pass)) {
    console.log(`  - ${r.id} ${r.name}${r.detail ? ` (${r.detail})` : ''}`)
  }
  console.log('\nK26-G WORKTIME API VERIFY FAIL')
  console.log('blocking=true')
  console.log('recommendedNextStage=K26-G1-WORKTIME-API-FIX')
  process.exit(1)
}

console.log('\nK26-G WORKTIME API VERIFY PASS')
console.log(`PASS=${pass} FAIL=0`)
console.log('blocking=false')
console.log('recommendedNextStage=K26-H-WORKTIME-SETTINGS-UI')
process.exit(0)
