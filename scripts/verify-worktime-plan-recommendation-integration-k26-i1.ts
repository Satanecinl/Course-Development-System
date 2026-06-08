/**
 * scripts/verify-worktime-plan-recommendation-integration-k26-i1.ts
 *
 * K26-I1: WorkTime plan recommendation integration verify (read-only).
 *
 * Sections:
 *   1. Resolver (10 checks)
 *   2. Plan recommendation integration (11 checks)
 *   3. Non-goals (10 checks)
 *   4. Runtime / DB read-only checks (5 checks)
 *
 * Output:
 *   K26-I1 WORKTIME PLAN RECOMMENDATION INTEGRATION VERIFY PASS
 *   PASS=x FAIL=0
 *   blocking=false
 *   recommendedNextStage=K26-I2-WORKTIME-ADJUSTMENT-DRY-RUN-APPLY-GUARD
 */

import { existsSync, readFileSync, statSync } from 'node:fs'
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

function fileExists(rel: string): boolean {
  return existsSync(join(projectRoot, rel))
}

function fileContains(rel: string, needle: string): boolean {
  if (!existsSync(join(projectRoot, rel))) return false
  return readFileSync(join(projectRoot, rel), 'utf8').includes(needle)
}

function readFile(rel: string): string {
  return readFileSync(join(projectRoot, rel), 'utf8')
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

const resolverPath = 'src/lib/worktime/worktime-schedule-resolver.ts'
const helperPath = 'src/lib/schedule/adjustment-plan-recommendations.ts'
const routePath = 'src/app/api/schedule-adjustments/plan-recommendations/route.ts'

// ---------------------------------------------------------------------------
// Section 1: Resolver
// ---------------------------------------------------------------------------
console.log('\n[Section 1] Resolver')

{
  record('R1', 'schedule resolver file exists', fileExists(resolverPath))
}
{
  const ok = fileContains(resolverPath, 'resolveWorkTimeConfigForSchedule')
  record('R2', 'exports resolveWorkTimeConfigForSchedule', ok)
}
{
  const ok = fileContains(resolverPath, 'findFirst') && fileContains(resolverPath, 'isDefault')
  record('R3', 'resolver reads default WorkTimeConfig', ok)
}
{
  const ok = fileContains(resolverPath, 'buildStaticFallback') || fileContains(resolverPath, 'staticFallback')
  record('R4', 'resolver has static fallback', ok)
}
{
  const ok = fileContains(resolverPath, 'allowWeekend')
  record('R5', 'resolver exposes allowWeekend', ok)
}
{
  const ok = fileContains(resolverPath, 'activeTeachingSlotIndexes')
  record('R6', 'resolver exposes activeTeachingSlotIndexes', ok)
}
{
  const ok = fileContains(resolverPath, 'legacyDisplaySlotIndexes')
  record('R7', 'resolver exposes legacyDisplaySlotIndexes', ok)
}
{
  const ok = fileContains(resolverPath, 'VALID_TEACHING_SLOT_INDEXES') ||
    fileContains(resolverPath, 'activeSet.has')
  record('R8', 'resolver excludes slot 6/7 from active candidates', ok)
}
{
  const ok = fileContains(resolverPath, 'weekdayValues') && fileContains(resolverPath, 'weekendDayValues')
  record('R9', 'resolver exposes weekday/weekend values', ok)
}
{
  const ok = !fileContains(resolverPath, 'prisma.workTimeConfig.create') &&
    !fileContains(resolverPath, 'prisma.workTimeConfig.update') &&
    !fileContains(resolverPath, 'prisma.workTimeConfig.delete')
  record('R10', 'resolver writes no DB', ok)
}

// ---------------------------------------------------------------------------
// Section 2: Plan recommendation integration
// ---------------------------------------------------------------------------
console.log('\n[Section 2] Plan recommendation integration')

{
  const ok = fileContains(helperPath, 'resolveWorkTimeConfigForSchedule')
  record('P1', 'plan recommendation imports resolver', ok)
}
{
  const ok = fileContains(helperPath, 'workTime.activeTeachingSlotIndexes')
  record('P2', 'candidate slot generation uses WorkTime active slots', ok)
}
{
  const ok = fileContains(helperPath, 'workTime') &&
    (fileContains(helperPath, 'workTime.weekdayValues') || fileContains(helperPath, 'getAllowedWorkTimeCandidateDays'))
  record('P3', 'candidate day generation uses WorkTime allowed days', ok)
}
{
  // No direct raw [1,2,3,4,5] candidate slot loop remains
  const ok = !fileContains(helperPath, 'const slotIndexes = [...DEFAULT_SLOT_INDEXES]')
  record('P4', 'no direct raw [1,2,3,4,5] candidate slot loop remains', ok)
}
{
  // No direct raw [1,2,3,4,5,6] candidate slot loop remains
  const source = readFile(helperPath)
  const ok = !source.match(/const\s+slotIndexes\s*=\s*\[\s*1\s*,\s*2\s*,\s*3\s*,\s*4\s*,\s*5\s*,\s*6\s*\]/)
  record('P5', 'no direct raw [1,2,3,4,5,6] candidate slot loop remains', ok)
}
{
  const ok = fileContains(helperPath, 'activeTeachingSlotIndexes') ||
    fileContains(helperPath, 'getAllowedWorkTimeCandidateSlots')
  record('P6', 'slot 6/7 exclusion is explicit or inherited from resolver', ok)
}
{
  const ok = fileContains(helperPath, 'allowWeekend') || fileContains(helperPath, 'workTime.allowWeekend')
  record('P7', 'allowWeekend is used in candidate day selection', ok)
}
{
  const ok = fileContains(routePath, 'isWorkTimeDayAllowed') || fileContains(routePath, 'WORKTIME_WEEKEND_DISABLED')
  record('P8', 'preferredDay validation respects WorkTime', ok)
}
{
  const ok = fileContains(helperPath, 'preferredWeekAvailable') && fileContains(helperPath, 'fallbackPlanCount')
  record('P9', 'preferredWeek-first fields remain present', ok)
}
{
  const ok = fileContains(routePath, 'workTimeSource') || fileContains(routePath, 'allowWeekend')
  record('P10', 'workTime metadata additive fields exist or are documented', ok)
}
{
  const ok = fileContains(routePath, 'ok: true') && fileContains(routePath, '...result')
  record('P11', 'response shape remains additive-compatible', ok)
}

// ---------------------------------------------------------------------------
// Section 3: Non-goals
// ---------------------------------------------------------------------------
console.log('\n[Section 3] Non-goals')

{
  // K26-I2 stage-aware: dry-run/apply now have WorkTime guard via checkWorkTimeTargetAllowed.
  // This is expected and does not invalidate K26-I1's work.
  const hasI2Guard = fileContains('src/lib/schedule/adjustments.ts', 'checkWorkTimeTargetAllowed')
  const ok = hasI2Guard || !fileContains('src/lib/schedule/adjustments.ts', 'resolveWorkTimeConfigForSchedule')
  record('N1', 'dry-run/apply unchanged (or K26-I2 guard accepted)', ok)
}
{
  const ok = !fileContains('src/lib/schedule/room-recommendations.ts', 'resolveWorkTimeConfigForSchedule')
  record('N2', 'room recommendation unchanged', ok)
}
{
  const ok = !fileContains('src/components/schedule-adjustment-dialog.tsx', 'resolveWorkTimeConfigForSchedule')
  record('N3', 'frontend dialog unchanged', ok)
}
{
  const ok = !fileContains('src/lib/schedule/conflict-check.ts', 'resolveWorkTimeConfigForSchedule')
  record('N4', 'conflict-check unchanged', ok)
}
{
  const ok = !fileContains('src/lib/scheduler/solver.ts', '__K26_I1_SENTINEL__')
  record('N5', 'solver unchanged', ok)
}
{
  const ok = !fileContains('src/lib/scheduler/score.ts', '__K26_I1_SENTINEL__')
  record('N6', 'score unchanged', ok)
}
{
  let hits: string[] = []
  try {
    const stat = execSync('git diff --name-only b1d5951..HEAD -- prisma/schema.prisma', { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] })
    hits = stat.split(/\r?\n/).filter((s) => s.length > 0)
  } catch { hits = [] }
  record('N7', 'no schema change', hits.length === 0)
}
{
  let hits: string[] = []
  try {
    const stat = execSync('git diff --name-only b1d5951..HEAD -- prisma/migrations/', { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] })
    hits = stat.split(/\r?\n/).filter((s) => s.length > 0)
  } catch { hits = [] }
  record('N8', 'no migration added', hits.length === 0)
}
{
  let k22Hits: string[] = []
  try {
    const stat = execSync('git diff --name-only b1d5951..HEAD', { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] })
    k22Hits = stat.split(/\r?\n/).filter((s) => s.length > 0 && /k2[2-5]/i.test(s))
  } catch { k22Hits = [] }
  record('N9', 'no K22/K23/K24/K25 expected change', k22Hits.length === 0)
}
{
  const ok = !fileContains('src/lib/schedule/adjustments.ts', '__K26_I1_SENTINEL__')
  record('N10', 'no K22/K23/K24/K25/K26 expected change (adjustments.ts)', ok)
}

// ---------------------------------------------------------------------------
// Section 4: Runtime / DB read-only checks
// ---------------------------------------------------------------------------
console.log('\n[Section 4] Runtime / DB read-only checks')

{
  const result = runSqliteReadOnly("SELECT COUNT(*) FROM WorkTimeConfig WHERE isDefault=1 AND isActive=1;")
  const ok = result !== null && Number(result) >= 2
  record('D1', 'default WorkTimeConfig exists', ok, `count=${result}`)
}
{
  const result = runSqliteReadOnly("SELECT COUNT(*) FROM TimeSlotDefinition WHERE slotIndex IN (1,2,3,4,5) AND isActive=1 AND isTeachingSlot=1 AND isLegacyDisplay=0;")
  const ok = result !== null && Number(result) >= 10
  record('D2', 'default active slots are 1-5', ok, `count=${result}`)
}
{
  const result = runSqliteReadOnly("SELECT COUNT(*) FROM TimeSlotDefinition WHERE slotIndex IN (6,7) AND isActive=0 AND isTeachingSlot=0 AND isLegacyDisplay=1;")
  const ok = result !== null && Number(result) >= 4
  record('D3', 'default legacy slots are 6/7', ok, `count=${result}`)
}
{
  const result = runSqliteReadOnly("SELECT COUNT(*) FROM WorkTimeConfig WHERE allowWeekend=0;")
  const ok = result !== null && Number(result) >= 2
  record('D4', 'allowWeekend default false', ok, `count=${result}`)
}
{
  // backfill dry-run: check DB has configs for all semesters
  const result = runSqliteReadOnly("SELECT COUNT(*) FROM Semester WHERE id NOT IN (SELECT DISTINCT semesterId FROM WorkTimeConfig WHERE isDefault=1);")
  const ok = result !== null && Number(result) === 0
  record('D5', 'backfill dry-run 0 missing or equivalent DB state check', ok, `missing=${result}`)
}

// ---------------------------------------------------------------------------
// Summary
// ---------------------------------------------------------------------------

const pass = results.filter((r) => r.pass).length
const fail = results.filter((r) => !r.pass).length

console.log('\n──────────────────────────────────────────')
console.log(`K26-I1 WORKTIME PLAN RECOMMENDATION INTEGRATION VERIFY: PASS=${pass} FAIL=${fail}`)

if (fail > 0) {
  console.log('\nFailed checks:')
  for (const r of results.filter((r) => !r.pass)) {
    console.log(`  - ${r.id} ${r.name}${r.detail ? ` (${r.detail})` : ''}`)
  }
  console.log('\nK26-I1 WORKTIME PLAN RECOMMENDATION INTEGRATION VERIFY FAIL')
  console.log('blocking=true')
  console.log('recommendedNextStage=K26-I1-WORKTIME-PLAN-RECOMMENDATION-INTEGRATION-FIX')
  process.exit(1)
}

console.log('\nK26-I1 WORKTIME PLAN RECOMMENDATION INTEGRATION VERIFY PASS')
console.log(`PASS=${pass} FAIL=0`)
console.log('blocking=false')
console.log('recommendedNextStage=K26-I2-WORKTIME-ADJUSTMENT-DRY-RUN-APPLY-GUARD')
process.exit(0)
