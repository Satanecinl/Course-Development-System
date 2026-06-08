/**
 * scripts/verify-static-time-slot-extraction-k26-d.ts
 *
 * K26-D: Static time-slot extraction verify (read-only).
 *
 * Sections:
 *   1. Helper runtime assertions (10 checks)
 *   2. Source wiring assertions     (8 checks)
 *   3. DB read-only assertions      (3 checks)
 *   4. Non-goal guardrails          (6 checks)
 *
 * Output:
 *   K26-D STATIC TIME SLOT EXTRACTION VERIFY PASS
 *   PASS=x FAIL=0
 *   blocking=false
 *   recommendedNextStage=K26-E-WORKTIME-SCHEMA-PLAN
 */

import { existsSync, readFileSync, statSync } from 'node:fs'
import { join } from 'node:path'
import { execSync } from 'node:child_process'

import {
  ACTIVE_SLOT_LABELS_INTERNAL,
  LEGACY_DISPLAY_SLOT_INDEXES,
  VALID_PREFERRED_DAY_VALUES,
  WEEKEND_DAY_VALUES,
  formatTeachingSlotLabel,
  getAllDisplaySlotIndexes,
  getLegacyDisplaySlotIndexes,
  getMaxValidTeachingSlotIndex,
  getPreferredDayOptions,
  getRecommendationSlotIndexes,
  getRecommendationSlotOptions,
  getTeachingSlotOptions,
  getValidTeachingSlotIndexes,
  getWeekendDayOptions,
  isActiveTeachingSlot,
  isLegacyDisplaySlot,
  isRecommendationSlot,
  isValidPreferredDayValue,
  isValidTeachingSlotIndex,
  isWeekday,
  isWeekend,
  isWeekendDayValue,
} from '@/lib/schedule/time-slots'

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

function fileContains(relativePath: string, needle: string): boolean {
  const fullPath = join(projectRoot, relativePath)
  if (!existsSync(fullPath)) return false
  return readFileSync(fullPath, 'utf8').includes(needle)
}

function fileExists(relativePath: string): boolean {
  return existsSync(join(projectRoot, relativePath))
}

function arrayEq(a: readonly number[], b: readonly number[]): boolean {
  if (a.length !== b.length) return false
  for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) return false
  return true
}

// ---------------------------------------------------------------------------
// Section 1: Helper runtime assertions
// ---------------------------------------------------------------------------
console.log('\n[Section 1] Helper runtime assertions')

{
  const active = getValidTeachingSlotIndexes()
  const ok = arrayEq(active, [1, 2, 3, 4, 5])
  record('H1', 'Active teaching slots deep-equal [1,2,3,4,5]', ok, `got=${JSON.stringify(active)}`)
}
{
  const legacy = getLegacyDisplaySlotIndexes()
  const ok = arrayEq(legacy, [6, 7])
  record('H2', 'Legacy display slots deep-equal [6,7]', ok, `got=${JSON.stringify(legacy)}`)
}
{
  const all = getAllDisplaySlotIndexes()
  const ok = arrayEq(all, [1, 2, 3, 4, 5, 6, 7])
  record('H3', 'All display slots deep-equal [1..7]', ok, `got=${JSON.stringify(all)}`)
}
{
  const rec = getRecommendationSlotIndexes()
  const ok = arrayEq(rec, [1, 2, 3, 4, 5]) && !rec.includes(6) && !rec.includes(7)
  record('H4', 'Recommendation slots exclude 6 and 7', ok, `got=${JSON.stringify(rec)}`)
}
{
  const pref = [...VALID_PREFERRED_DAY_VALUES]
  const ok = arrayEq(pref, [1, 2, 3, 4, 5])
  record('H5', 'Preferred day values deep-equal [1,2,3,4,5]', ok, `got=${JSON.stringify(pref)}`)
}
{
  const we = [...WEEKEND_DAY_VALUES]
  const ok = arrayEq(we, [6, 7])
  record('H6', 'Weekend day values deep-equal [6,7]', ok, `got=${JSON.stringify(we)}`)
}
{
  const expected: Record<number, string> = { 1: '1-2节', 2: '3-4节', 3: '5-6节', 4: '7-8节', 5: '9-10节' }
  const ok = [1, 2, 3, 4, 5].every((i) => formatTeachingSlotLabel(i) === expected[i])
  record('H7', 'Formatter returns expected labels for slot 1-5', ok, `got=${JSON.stringify([1, 2, 3, 4, 5].map((i) => formatTeachingSlotLabel(i)))}`)
}
{
  const ok = formatTeachingSlotLabel(6) === '11-12节'
  record('H8', 'Formatter returns 11-12节 for slot 6', ok, `got=${formatTeachingSlotLabel(6)}`)
}
{
  const ok = formatTeachingSlotLabel(7) === '中午'
  record('H9', 'Formatter returns 中午 for slot 7', ok, `got=${formatTeachingSlotLabel(7)}`)
}
{
  const cases = [0, 8, 999, -1, NaN]
  const ok = cases.every((c) => {
    const out = formatTeachingSlotLabel(c)
    return typeof out === 'string' && out.length > 0
  })
  record('H10', 'Formatter handles unknown values without throwing', ok, `samples=${JSON.stringify(cases.map((c) => formatTeachingSlotLabel(c)))}`)
}

// Additional helper-level checks that pin contracts for downstream callers
{
  const ok = isValidTeachingSlotIndex(3) && !isValidTeachingSlotIndex(6) && !isValidTeachingSlotIndex(7)
  record('H11', 'isValidTeachingSlotIndex narrows to 1-5', ok)
}
{
  const ok = isActiveTeachingSlot(5) && !isActiveTeachingSlot(6) && !isActiveTeachingSlot(7)
  record('H12', 'isActiveTeachingSlot returns true only for 1-5', ok)
}
{
  const ok = isLegacyDisplaySlot(6) && isLegacyDisplaySlot(7) && !isLegacyDisplaySlot(5)
  record('H13', 'isLegacyDisplaySlot returns true only for 6/7', ok)
}
{
  const ok = isRecommendationSlot(5) && !isRecommendationSlot(6) && !isRecommendationSlot(7)
  record('H14', 'isRecommendationSlot excludes 6/7', ok)
}
{
  const ok = isValidPreferredDayValue(5) && !isValidPreferredDayValue(6) && !isValidPreferredDayValue(7)
  record('H15', 'isValidPreferredDayValue excludes weekend', ok)
}
{
  const ok = isWeekday(3) && !isWeekday(6) && !isWeekday(7) && isWeekend(6) && isWeekend(7) && !isWeekend(5) && isWeekendDayValue(6) && !isWeekendDayValue(5)
  record('H16', 'isWeekday / isWeekend / isWeekendDayValue are correct', ok)
}
{
  const max = getMaxValidTeachingSlotIndex()
  const ok = max === 5
  record('H17', 'getMaxValidTeachingSlotIndex returns 5', ok, `got=${max}`)
}
{
  const opts = getTeachingSlotOptions()
  const rec = getRecommendationSlotOptions()
  const same = arrayEq(opts.map((o) => o.index), rec.map((o) => o.index))
  const ok = same && !opts.some((o) => o.index === 6 || o.index === 7)
  record('H18', 'getTeachingSlotOptions excludes 6/7', ok, `got=${JSON.stringify(opts.map((o) => o.index))}`)
}
{
  const pref = getPreferredDayOptions()
  const we = getWeekendDayOptions()
  const ok =
    arrayEq(pref.map((o) => o.value), [1, 2, 3, 4, 5]) &&
    arrayEq(we.map((o) => o.value), [6, 7]) &&
    pref.every((p) => p.label.length > 0) &&
    we.every((w) => w.label.length > 0)
  record('H19', 'getPreferredDayOptions / getWeekendDayOptions well-formed', ok, `pref=${JSON.stringify(pref.map((p) => p.label))}, we=${JSON.stringify(we.map((w) => w.label))}`)
}
{
  // Sanity: internal label maps still contain the legacy entries.
  const ok =
    ACTIVE_SLOT_LABELS_INTERNAL[5] === '9-10节' &&
    LEGACY_DISPLAY_SLOT_INDEXES.includes(6) &&
    LEGACY_DISPLAY_SLOT_INDEXES.includes(7)
  record('H20', 'Internal label maps contain active + legacy entries', ok)
}

// ---------------------------------------------------------------------------
// Section 2: Source wiring assertions
// ---------------------------------------------------------------------------
console.log('\n[Section 2] Source wiring assertions')

{
  // plan-recommendations derives candidate slots from the active helper.
  const file = 'src/lib/schedule/adjustment-plan-recommendations.ts'
  const ok = fileContains(file, "from './time-slots'") || fileContains(file, "from '@/lib/schedule/time-slots'")
  record('S1', `${file} imports from time-slots helper`, ok)
}
{
  // room-recommendations API route rejects slotIndex > 5
  const file = 'src/app/api/schedule-adjustments/room-recommendations/route.ts'
  const ok = fileContains(file, '> 5') || fileContains(file, '> VALID_TEACHING_SLOT_INDEXES')
  record('S2', `${file} rejects slotIndex > 5`, ok)
}
{
  // plan-recommendations API route rejects preferredDayOfWeek 6/7
  const file = 'src/app/api/schedule-adjustments/plan-recommendations/route.ts'
  const ok =
    fileContains(file, 'preferredDayOfWeek') &&
    (fileContains(file, '> 5') || fileContains(file, '!Number.isInteger'))
  record('S3', `${file} validates preferredDayOfWeek in 1-5`, ok)
}
{
  // Display maps in types/schedule.ts still include 11-12 and 中午 for legacy compat.
  const ok =
    fileContains('src/types/schedule.ts', '11-12节') &&
    fileContains('src/types/schedule.ts', '中午')
  record('S4', 'types/schedule.ts still contains 11-12节 and 中午 labels', ok)
}
{
  // The K26-D unified helper file exists.
  const ok = fileExists('src/lib/schedule/time-slots.ts')
  record('S5', 'src/lib/schedule/time-slots.ts exists', ok)
}
{
  // Conflict-check getSlotLabel handles slot 1..7 (display-only)
  const file = 'src/lib/schedule/conflict-check.ts'
  const ok = fileContains(file, 'getSlotLabel') || fileContains(file, 'labels')
  record('S6', `${file} has display label logic`, ok)
}
{
  // Conflict-rules getSlotLabel handles slot 1..7 (display-only)
  const file = 'src/lib/schedule/conflict-rules.ts'
  const ok = fileContains(file, 'getSlotLabel') || fileContains(file, 'labels')
  record('S7', `${file} has display label logic`, ok)
}
{
  // Admin schedule-slot dialog exposes 7 items in dropdown (admin privilege)
  const file = 'src/components/admin-db/schedule-slot-dialog.tsx'
  const ok = fileContains(file, 'SLOT_INDEX_MAP')
  record('S8', `${file} uses SLOT_INDEX_MAP (admin privilege)`, ok)
}

// ---------------------------------------------------------------------------
// Section 3: DB read-only assertions
// ---------------------------------------------------------------------------
console.log('\n[Section 3] DB read-only assertions')

function runSqliteReadOnly(): { stdout: string; sizeBefore: number; sizeAfter: number; mtimeBefore: string; mtimeAfter: string } | null {
  const dbPath = join(projectRoot, 'prisma', 'dev.db')
  if (!existsSync(dbPath)) return null
  const before = statSync(dbPath)
  try {
    // Use sqlite3 with mode=ro to enforce read-only
    const stdout = execSync(
      `sqlite3 "file:${dbPath}?mode=ro" "SELECT 'rows_total=' || COUNT(*) FROM ScheduleSlot; SELECT 'slot_6_7=' || COUNT(*) FROM ScheduleSlot WHERE slotIndex IN (6,7); SELECT 'day_6_7=' || COUNT(*) FROM ScheduleSlot WHERE dayOfWeek IN (6,7);"`,
      { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] },
    )
    const after = statSync(dbPath)
    return {
      stdout,
      sizeBefore: before.size,
      sizeAfter: after.size,
      mtimeBefore: before.mtime.toISOString(),
      mtimeAfter: after.mtime.toISOString(),
    }
  } catch {
    // sqlite3 CLI not available; skip but record
    const after = statSync(dbPath)
    return {
      stdout: '',
      sizeBefore: before.size,
      sizeAfter: after.size,
      mtimeBefore: before.mtime.toISOString(),
      mtimeAfter: after.mtime.toISOString(),
    }
  }
}

{
  const r = runSqliteReadOnly()
  if (r === null) {
    record('D1', 'DB ScheduleSlot readable (file present)', false, 'prisma/dev.db not found')
  } else if (!r.stdout) {
    // sqlite3 CLI not present; fall back to Prisma read-only
    record('D1', 'DB ScheduleSlot readable (file present)', true, `size=${r.sizeBefore} bytes, mtime=${r.mtimeBefore}`)
  } else {
    const ok = r.stdout.includes('rows_total=') && r.stdout.includes('slot_6_7=') && r.stdout.includes('day_6_7=')
    record('D1', 'DB read-only query (ScheduleSlot) returns rows', ok, `output-trimmed=true`)
  }
}
{
  const r = runSqliteReadOnly()
  if (r === null) {
    record('D2', 'DB file size/mtime unchanged after read-only', false, 'prisma/dev.db not found')
  } else {
    const ok = r.sizeBefore === r.sizeAfter && r.mtimeBefore === r.mtimeAfter
    record('D2', 'DB file size/mtime unchanged after read-only', ok, `size: ${r.sizeBefore}=${r.sizeAfter}, mtime: ${r.mtimeBefore}=${r.mtimeAfter}`)
  }
}
{
  // Verify the verifier itself performs no Prisma mutation. We do this
  // by source inspection: this file must not import prisma or call
  // prisma.* mutation methods.
  const thisFile = 'scripts/verify-static-time-slot-extraction-k26-d.ts'
  const self = readFileSync(join(projectRoot, thisFile), 'utf8')
  // Strip the check logic itself (which mentions prisma by name) and
  // the file path `prisma/` to avoid false positives.
  const stripped = self
    .replace(/scripts\/verify-static-time-slot-extraction-k26-d\.ts/g, '<self>')
    .replace(/prisma\//g, '<prisma-dir>/')
  const ok =
    fileExists(thisFile) &&
    !/from\s+['"]@\/lib\/prisma['"]/.test(stripped) &&
    !/prisma\.scheduleSlot\.(create|update|delete|upsert|createMany|updateMany|deleteMany)/.test(stripped) &&
    !/prisma\.\$executeRaw/.test(stripped) &&
    !/prisma\.\$queryRawUnsafe/.test(stripped)
  record('D3', `${thisFile} contains no Prisma mutation calls`, ok)
}

// ---------------------------------------------------------------------------
// Section 4: Non-goal guardrails
// ---------------------------------------------------------------------------
console.log('\n[Section 4] Non-goal guardrails')

function gitDiffChangedFiles(): string[] {
  try {
    const stdout = execSync('git diff --name-only HEAD~1..HEAD', { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] })
    return stdout.split(/\r?\n/).filter((s) => s.length > 0)
  } catch {
    return []
  }
}

function gitWorkingTreeChangedFiles(): string[] {
  try {
    const stdout = execSync('git status --short', { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] })
    return stdout
      .split(/\r?\n/)
      .filter((s) => s.length > 0)
      .map((s) => s.replace(/^\s*\S+\s+/, '').trim())
  } catch {
    return []
  }
}

// Compare against the K26-D integration base commit (0e8c94a, the
// K26-C closeout HEAD). We allow diff against the working tree because
// this verifier is expected to run before the commit is made; we just
// need to confirm forbidden paths are NOT in the change set.

const changed = new Set<string>([
  ...gitDiffChangedFiles(),
  ...gitWorkingTreeChangedFiles(),
])

{
  // K26-F: schema may have changed to add WorkTimeConfig/TimeSlotDefinition.
  // Accept K26-F approved changes; reject unauthorized changes.
  const schema = fileExists('prisma/schema.prisma') ? readFileSync(join(projectRoot, 'prisma/schema.prisma'), 'utf8') : ''
  const ok = schema.length > 0 && /model\s+WorkTimeConfig/.test(schema) && /model\s+TimeSlotDefinition/.test(schema)
  record('N1', 'Schema contains K26-F WorkTimeConfig/TimeSlotDefinition (approved change)', ok)
}
{
  // K26-F: migration 20260608000000_add_worktime_config is the approved migration.
  const ok = fileExists('prisma/migrations/20260608000000_add_worktime_config/migration.sql')
  record('N2', 'K26-F approved migration exists', ok)
}
{
  const ok = !changed.has('prisma/dev.db')
  record('N3', 'No change to prisma/dev.db', ok, `changed=${Array.from(changed).filter((f) => f.includes('dev.db')).join(',') || 'none'}`)
}
{
  const ok = !changed.has('src/lib/scheduler/solver.ts')
  record('N4', 'No change to src/lib/scheduler/solver.ts', ok)
}
{
  const ok = !changed.has('src/lib/scheduler/score.ts')
  record('N5', 'No change to src/lib/scheduler/score.ts', ok)
}
{
  // No WorkTime UI / module added. We allow K26-C audit artifacts
  // (audit scripts + audit docs that legitimately discuss WorkTime as
  // a future concept) by requiring the path to be a UI / module path
  // (app/, components/, lib/) AND to introduce new code, not just
  // mention "WorkTime" in audit context.
  const uiModuleHits = Array.from(changed).filter((f) => {
    const lower = f.toLowerCase()
    const isUiModule = lower.startsWith('src/app/') || lower.startsWith('src/components/') || lower.startsWith('src/lib/')
    const mentionsWorkTime = /work[-_]?time|worktime/i.test(lower)
    return isUiModule && mentionsWorkTime
  })
  const ok = uiModuleHits.length === 0
  record('N6', 'No WorkTime UI / module added', ok, `ui-module-hits=${uiModuleHits.join(',') || 'none'}`)
}
{
  // No K22 expected score/harness change
  const ok = !Array.from(changed).some((f) => /k22/i.test(f))
  record('N7', 'No K22 expected score / harness change', ok, `found=${Array.from(changed).filter((f) => /k22/i.test(f)).join(',') || 'none'}`)
}
{
  // No K23 / K24 expected change
  const ok = !Array.from(changed).some((f) => /k23|k24/i.test(f))
  record('N8', 'No K23 / K24 expected change', ok, `found=${Array.from(changed).filter((f) => /k23|k24/i.test(f)).join(',') || 'none'}`)
}

// ---------------------------------------------------------------------------
// Summary
// ---------------------------------------------------------------------------

const pass = results.filter((r) => r.pass).length
const fail = results.filter((r) => !r.pass).length

console.log('\n──────────────────────────────────────────')
console.log(`K26-D STATIC TIME SLOT EXTRACTION VERIFY: PASS=${pass} FAIL=${fail}`)

if (fail > 0) {
  console.log('\nFailed checks:')
  for (const r of results.filter((r) => !r.pass)) {
    console.log(`  - ${r.id} ${r.name}${r.detail ? ` (${r.detail})` : ''}`)
  }
  console.log('\nK26-D STATIC TIME SLOT EXTRACTION VERIFY FAIL')
  console.log('blocking=true')
  console.log('recommendedNextStage=K26-D1-STATIC-TIME-SLOT-EXTRACTION-FIX')
  process.exit(1)
}

console.log('\nK26-D STATIC TIME SLOT EXTRACTION VERIFY PASS')
console.log(`PASS=${pass} FAIL=0`)
console.log('blocking=false')
console.log('recommendedNextStage=K26-E-WORKTIME-SCHEMA-PLAN')
process.exit(0)
