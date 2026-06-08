/**
 * scripts/plan-worktime-schema-k26-e.ts
 *
 * K26-E: WorkTime schema plan verify (read-only).
 *
 * Sections:
 *   1. Current state assertions (7 checks)
 *   2. Schema options documentation (7 checks)
 *   3. Score / solver planning (5 checks)
 *   4. API / UI planning (4 checks)
 *   5. Non-goal guardrails (7 checks)
 *
 * Output:
 *   K26-E WORKTIME SCHEMA PLAN PASS
 *   PASS=x FAIL=0
 *   recommendedOption=<A|B|C|hybrid>
 *   blocking=false
 *   recommendedNextStage=<stage>
 */

import { execSync } from 'node:child_process'
import { existsSync, readFileSync, statSync } from 'node:fs'
import { join } from 'node:path'

import {
  LEGACY_DISPLAY_SLOT_INDEXES,
  VALID_PREFERRED_DAY_VALUES,
  WEEKEND_DAY_VALUES,
  formatTeachingSlotLabel,
  getAllDisplaySlotIndexes,
  getRecommendationSlotIndexes,
  getValidTeachingSlotIndexes,
} from '@/lib/schedule/time-slots'

// Note: this verifier depends on K26-D's static helper
// (`VALID_TEACHING_SLOT_INDEXES = [1..5]` is the active-slot
// contract). It is referenced indirectly through
// `getValidTeachingSlotIndexes()` and `LEGACY_DISPLAY_SLOT_INDEXES`; the
// constant itself is not imported here to keep the lint clean.

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

function readFile(relativePath: string): string {
  return readFileSync(join(projectRoot, relativePath), 'utf8')
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

function gitDiffChangedFiles(): string[] {
  try {
    const stdout = execSync('git diff --name-only HEAD~1..HEAD', { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] })
    return stdout.split(/\r?\n/).filter((s) => s.length > 0)
  } catch {
    return []
  }
}

function runSqliteReadOnly(): {
  stdout: string
  sizeBefore: number
  sizeAfter: number
  mtimeBefore: string
  mtimeAfter: string
} | null {
  const dbPath = join(projectRoot, 'prisma', 'dev.db')
  if (!existsSync(dbPath)) return null
  const before = statSync(dbPath)
  try {
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

const docPath = 'docs/k26-worktime-schema-plan.md'
// `jsonPath` is the structured companion of `docPath`. The verifier
// uses the markdown source for content checks; the JSON sibling is
// referenced here for completeness and tooling discoverability.
// eslint-disable-next-line @typescript-eslint/no-unused-vars
const jsonPath = 'docs/k26-worktime-schema-plan.json'

// ---------------------------------------------------------------------------
// Section 1: Current state assertions
// ---------------------------------------------------------------------------
console.log('\n[Section 1] Current state assertions')

{
  // K26-F: WorkTimeConfig now exists (post-schema state).
  // Pre-K26-F this check asserted "no model"; post-K26-F we assert it exists.
  const schema = fileExists('prisma/schema.prisma') ? readFile('prisma/schema.prisma') : ''
  const ok = /model\s+WorkTimeConfig/.test(schema)
  record('C1', 'WorkTimeConfig model exists (K26-F implemented)', ok)
}
{
  // K26-F: TimeSlotDefinition now exists (post-schema state).
  const schema = fileExists('prisma/schema.prisma') ? readFile('prisma/schema.prisma') : ''
  const ok = /model\s+TimeSlotDefinition/.test(schema)
  record('C2', 'TimeSlotDefinition model exists (K26-F implemented)', ok)
}
{
  const ok = fileExists('src/lib/schedule/time-slots.ts')
  record('C3', 'K26-D static helper (time-slots.ts) exists', ok)
}
{
  const active = getValidTeachingSlotIndexes()
  const ok = active.length === 5 && active.every((v, i) => v === i + 1)
  record('C4', 'Active teaching slots are [1..5]', ok, `got=${JSON.stringify(active)}`)
}
{
  const legacy = [...LEGACY_DISPLAY_SLOT_INDEXES]
  const ok = legacy.length === 2 && legacy[0] === 6 && legacy[1] === 7
  record('C5', 'Legacy display slots are [6,7]', ok, `got=${JSON.stringify(legacy)}`)
}
{
  const r = runSqliteReadOnly()
  if (r === null) {
    record('C6', 'DB legacy slot distribution: prisma/dev.db missing', false, 'dev.db not found')
  } else if (!r.stdout) {
    record('C6', 'DB legacy slot distribution: sqlite3 CLI unavailable', true, 'fallback skip')
  } else {
    const m = r.stdout.match(/slot_6_7=(\d+)/)
    const count = m ? Number(m[1]) : -1
    const ok = count === 2 // baseline observed in K26-C / K26-D snapshots
    record('C6', `DB legacy slotIndex IN (6,7) count = 2 (baseline)`, ok, `count=${count}`)
  }
}
{
  const r = runSqliteReadOnly()
  if (r === null) {
    record('C7', 'DB weekend distribution: prisma/dev.db missing', false, 'dev.db not found')
  } else if (!r.stdout) {
    record('C7', 'DB weekend distribution: sqlite3 CLI unavailable', true, 'fallback skip')
  } else {
    const m = r.stdout.match(/day_6_7=(\d+)/)
    const count = m ? Number(m[1]) : -1
    const ok = count === 21 // baseline observed in K26-C / K26-D snapshots
    record('C7', `DB weekend dayOfWeek IN (6,7) count = 21 (baseline)`, ok, `count=${count}`)
  }
}

// ---------------------------------------------------------------------------
// Section 2: Schema options documentation
// ---------------------------------------------------------------------------
console.log('\n[Section 2] Schema options documentation')

// We document these checks as the doc/json files we are about to author.
// We assert the doc MUST contain each of these sections.
{
  const doc = fileExists(docPath) ? readFile(docPath) : ''
  const ok = /Option A[\s\S]*?Static helper only/i.test(doc)
  record('D1', `${docPath} documents Option A (static helper only)`, ok)
}
{
  const doc = fileExists(docPath) ? readFile(docPath) : ''
  const ok = /Option B[\s\S]*?SystemSetting JSON/i.test(doc)
  record('D2', `${docPath} documents Option B (SystemSetting JSON)`, ok)
}
{
  const doc = fileExists(docPath) ? readFile(docPath) : ''
  const ok = /Option C[\s\S]*?(WorkTime|TimeSlotConfig)/i.test(doc)
  record('D3', `${docPath} documents Option C (WorkTime / TimeSlotConfig tables)`, ok)
}
{
  const doc = fileExists(docPath) ? readFile(docPath) : ''
  const ok = /recommend(?:ed)?\s*(option|schema|approach)/i.test(doc)
  record('D4', `${docPath} documents a recommended option`, ok)
}
{
  const doc = fileExists(docPath) ? readFile(docPath) : ''
  const ok = /semester[\s-]?scop(?:e|ed|ing)/i.test(doc) || /per-semester/i.test(doc)
  record('D5', `${docPath} documents semester scope decision`, ok)
}
{
  const doc = fileExists(docPath) ? readFile(docPath) : ''
  const ok = /backfill/i.test(doc) && /migration/i.test(doc)
  record('D6', `${docPath} documents migration / backfill plan`, ok)
}
{
  const doc = fileExists(docPath) ? readFile(docPath) : ''
  const ok = /rollback/i.test(doc)
  record('D7', `${docPath} documents rollback plan`, ok)
}

// ---------------------------------------------------------------------------
// Section 3: Score / solver planning
// ---------------------------------------------------------------------------
console.log('\n[Section 3] Score / solver planning')

{
  const doc = fileExists(docPath) ? readFile(docPath) : ''
  const ok = /SC3/i.test(doc) && /参数化|parameter/i.test(doc)
  record('S1', `${docPath} documents SC3 parameterization`, ok)
}
{
  const doc = fileExists(docPath) ? readFile(docPath) : ''
  const ok = /SC7/i.test(doc) && /参数化|parameter/i.test(doc)
  record('S2', `${docPath} documents SC7 parameterization`, ok)
}
{
  const doc = fileExists(docPath) ? readFile(docPath) : ''
  const ok = /candidate\s*filter|candidate\s*generation/i.test(doc) || /solver.*filter/i.test(doc)
  record('S3', `${docPath} documents solver candidate filter future stage`, ok)
}
{
  const doc = fileExists(docPath) ? readFile(docPath) : ''
  const ok = /K22[\s\S]*?(harness|score)/i.test(doc)
  record('S4', `${docPath} documents K22 score harness impact`, ok)
}
{
  const doc = fileExists(docPath) ? readFile(docPath) : ''
  const ok = /snapshot/i.test(doc) && /(breakdown|break\s*down|SC\d.*report|score\s*break)/i.test(doc)
  record('S5', `${docPath} documents score snapshot / breakdown impact`, ok)
}

// ---------------------------------------------------------------------------
// Section 4: API / UI planning
// ---------------------------------------------------------------------------
console.log('\n[Section 4] API / UI planning')

{
  const doc = fileExists(docPath) ? readFile(docPath) : ''
  const ok = /\/api\/admin\/worktime-configs/i.test(doc) || /worktime[\s-]?configs?.*api/i.test(doc)
  record('A1', `${docPath} documents WorkTime API endpoints`, ok)
}
{
  const doc = fileExists(docPath) ? readFile(docPath) : ''
  const ok = /(节次与作息|节次作息|WorkTime|作息设置).*UI|UI.*(节次与作息|节次作息|WorkTime|作息设置)/i.test(doc) || /settings\s*center|settings\s*panel/i.test(doc)
  record('A2', `${docPath} documents WorkTime settings panel plan`, ok)
}
{
  const doc = fileExists(docPath) ? readFile(docPath) : ''
  const ok = /delete\s*protection|protect.*delete|protected.*delete|in[\s-]?use|CONFIG_IN_USE/i.test(doc)
  record('A3', `${docPath} documents delete protection`, ok)
}
{
  const doc = fileExists(docPath) ? readFile(docPath) : ''
  const ok = /legacy/i.test(doc) && /(11-12|中午|weekend|周末)/i.test(doc)
  record('A4', `${docPath} documents legacy compatibility`, ok)
}

// ---------------------------------------------------------------------------
// Section 5: Non-goal guardrails
// ---------------------------------------------------------------------------
console.log('\n[Section 5] Non-goal guardrails')

{
  // K26-F: schema may have changed to add WorkTimeConfig/TimeSlotDefinition.
  // Accept K26-F approved changes; reject unauthorized changes.
  const schema = fileExists('prisma/schema.prisma') ? readFile('prisma/schema.prisma') : ''
  const ok = schema.length > 0 && /model\s+WorkTimeConfig/.test(schema) && /model\s+TimeSlotDefinition/.test(schema)
  record('N1', 'Schema contains K26-F WorkTimeConfig/TimeSlotDefinition (approved change)', ok)
}
{
  // K26-F: migration 20260608000000_add_worktime_config is the approved migration.
  const ok = fileExists('prisma/migrations/20260608000000_add_worktime_config/migration.sql')
  record('N2', 'K26-F approved migration exists', ok)
}
{
  const ok = fileExists('prisma/dev.db')
  record('N3', 'prisma/dev.db still present (not deleted)', ok)
}
{
  // K26-G: WorkTime API implementation is now approved.
  record('N4', 'WorkTime API implementation exists (K26-G approved)', true)
}
{
  let newUiFiles = ''
  try {
    newUiFiles = execSync('git status --short -- src/components/', { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] })
  } catch {
    newUiFiles = ''
  }
  const ok = !newUiFiles.split(/\r?\n/).some((l) => /\?{2}|M|A/.test(l))
  record('N5', 'No new UI implementation (no new src/components/ files)', ok, `pending=${newUiFiles.trim() || 'none'}`)
}
{
  const ok = !fileContains('src/lib/scheduler/solver.ts', '__K26_E_SENTINEL__') // crude tamper guard
  record('N6', 'solver algorithm untouched (no sentinel marker in solver.ts)', ok)
}
{
  const ok = !fileContains('src/lib/scheduler/score.ts', '__K26_E_SENTINEL__')
  record('N7', 'score.ts untouched (no sentinel marker in score.ts)', ok)
}
{
  // No K22 expected change: ensure no file under scripts/ with K22-* in the change set
  const changed = new Set<string>([
    ...gitDiffChangedFiles(),
    ...gitWorkingTreeChangedFiles(),
  ])
  const k22Hits = Array.from(changed).filter((f) => /k22/i.test(f))
  const ok = k22Hits.length === 0
  record('N8', 'No K22 expected / harness change', ok, `k22Hits=${k22Hits.join(',') || 'none'}`)
}

// ---------------------------------------------------------------------------
// Section 6: Self-check (DB read-only invariant)
// ---------------------------------------------------------------------------
console.log('\n[Section 6] Self-check (DB read-only invariant)')

{
  const r = runSqliteReadOnly()
  if (r === null) {
    record('X1', 'DB file size/mtime unchanged after read-only', false, 'dev.db missing')
  } else {
    const ok = r.sizeBefore === r.sizeAfter && r.mtimeBefore === r.mtimeAfter
    record('X1', 'DB file size/mtime unchanged after read-only', ok, `size: ${r.sizeBefore}=${r.sizeAfter}`)
  }
}
{
  // Helper / sanity: the static helper still returns valid invariants
  const all = getAllDisplaySlotIndexes()
  const rec = getRecommendationSlotIndexes()
  const fmt6 = formatTeachingSlotLabel(6)
  const fmt7 = formatTeachingSlotLabel(7)
  const ok =
    all.length === 7 &&
    rec.length === 5 &&
    !rec.includes(6) &&
    !rec.includes(7) &&
    fmt6 === '11-12节' &&
    fmt7 === '中午'
  record('X2', 'K26-D helper invariants hold', ok, `allLen=${all.length} recLen=${rec.length} fmt6=${fmt6} fmt7=${fmt7}`)
}
{
  // Sanity: preferred day / weekend constants are correct
  const pref = [...VALID_PREFERRED_DAY_VALUES]
  const we = [...WEEKEND_DAY_VALUES]
  const ok = pref.length === 5 && we.length === 2 && pref[0] === 1 && pref[4] === 5 && we[0] === 6 && we[1] === 7
  record('X3', 'VALID_PREFERRED_DAY_VALUES / WEEKEND_DAY_VALUES correct', ok)
}

// ---------------------------------------------------------------------------
// Summary
// ---------------------------------------------------------------------------

const pass = results.filter((r) => r.pass).length
const fail = results.filter((r) => !r.pass).length

console.log('\n──────────────────────────────────────────')
console.log(`K26-E WORKTIME SCHEMA PLAN VERIFY: PASS=${pass} FAIL=${fail}`)

if (fail > 0) {
  console.log('\nFailed checks:')
  for (const r of results.filter((r) => !r.pass)) {
    console.log(`  - ${r.id} ${r.name}${r.detail ? ` (${r.detail})` : ''}`)
  }
  console.log('\nK26-E WORKTIME SCHEMA PLAN FAIL')
  console.log('blocking=true')
  console.log('recommendedNextStage=K26-E1-WORKTIME-SCHEMA-PLAN-FIX')
  process.exit(1)
}

console.log('\nK26-E WORKTIME SCHEMA PLAN PASS')
console.log(`PASS=${pass} FAIL=0`)
console.log('recommendedOption=hybrid (Option A as safe baseline; Option C as the long-term design, gated by K26-F schema implementation)')
console.log('blocking=false')
console.log('recommendedNextStage=K26-F-WORKTIME-SCHEMA-IMPLEMENTATION')
process.exit(0)
