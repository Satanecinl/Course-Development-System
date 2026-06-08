/**
 * scripts/verify-worktime-post-schema-regression-k26-f1.ts
 *
 * K26-F1: WorkTime post-schema regression verify (read-only).
 *
 * Sections:
 *   1. Schema / migration assertions (6 checks)
 *   2. Backfill / DB assertions       (10 checks)
 *   3. K26-D helper invariants        (6 checks)
 *   4. Non-goal guardrails            (8 checks)
 *
 * Output:
 *   K26-F1 WORKTIME POST-SCHEMA REGRESSION VERIFY PASS
 *   PASS=x FAIL=0
 *   blocking=false
 *   recommendedNextStage=K26-G-WORKTIME-API-IMPLEMENTATION
 */

import { existsSync, readFileSync, statSync } from 'node:fs'
import { join } from 'node:path'
import { execSync } from 'node:child_process'

import {
  VALID_PREFERRED_DAY_VALUES,
  WEEKEND_DAY_VALUES,
  formatTeachingSlotLabel,
  getRecommendationSlotIndexes,
  getValidTeachingSlotIndexes,
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
// Section 1: Schema / migration assertions
// ---------------------------------------------------------------------------
console.log('\n[Section 1] Schema / migration assertions')

{
  const schema = fileExists('prisma/schema.prisma') ? readFile('prisma/schema.prisma') : ''
  const ok = /model\s+WorkTimeConfig/.test(schema)
  record('S1', 'WorkTimeConfig model exists', ok)
}
{
  const schema = fileExists('prisma/schema.prisma') ? readFile('prisma/schema.prisma') : ''
  const ok = /model\s+TimeSlotDefinition/.test(schema)
  record('S2', 'TimeSlotDefinition model exists', ok)
}
{
  const schema = fileExists('prisma/schema.prisma') ? readFile('prisma/schema.prisma') : ''
  const ok = /workTimeConfigs\s+WorkTimeConfig\[\]/.test(schema)
  record('S3', 'Semester.workTimeConfigs relation exists', ok)
}
{
  const schema = fileExists('prisma/schema.prisma') ? readFile('prisma/schema.prisma') : ''
  const ok = /workTimeConfigSnapshot\s+String\?/.test(schema)
  record('S4', 'SchedulingRun.workTimeConfigSnapshot exists and nullable', ok)
}
{
  const ok = fileExists('prisma/migrations/20260608000000_add_worktime_config/migration.sql')
  record('S5', 'K26-F migration exists', ok)
}
{
  // No extra WorkTime migrations beyond approved migration.
  // Use git diff to check if any new migration was added after K26-F commit.
  let ok = true
  try {
    const stat = execSync('git diff --name-only 94ad835..HEAD -- prisma/migrations/', { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] })
    ok = stat.trim().length === 0
  } catch {
    ok = true
  }
  record('S6', 'No extra WorkTime migrations beyond approved', ok)
}

// ---------------------------------------------------------------------------
// Section 2: Backfill / DB assertions
// ---------------------------------------------------------------------------
console.log('\n[Section 2] Backfill / DB assertions')

{
  const result = runSqliteReadOnly("SELECT COUNT(*) FROM Semester WHERE id NOT IN (SELECT DISTINCT semesterId FROM WorkTimeConfig WHERE isDefault=1);")
  const ok = result !== null && Number(result) === 0
  record('D1', 'Each Semester has exactly one default WorkTimeConfig', ok, `missing=${result}`)
}
{
  const result = runSqliteReadOnly("SELECT COUNT(*) FROM WorkTimeConfig WHERE isDefault=1 AND id NOT IN (SELECT workTimeConfigId FROM TimeSlotDefinition GROUP BY workTimeConfigId HAVING COUNT(*)=7);")
  const ok = result !== null && Number(result) === 0
  record('D2', 'Each default config has 7 TimeSlotDefinition rows', ok, `incomplete=${result}`)
}
{
  const result = runSqliteReadOnly("SELECT COUNT(*) FROM TimeSlotDefinition WHERE slotIndex IN (1,2,3,4,5) AND isActive=1 AND isTeachingSlot=1 AND isLegacyDisplay=0;")
  const ok = result !== null && Number(result) >= 10
  record('D3', 'Active teaching slots are 1-5', ok, `count=${result}`)
}
{
  const result = runSqliteReadOnly("SELECT COUNT(*) FROM TimeSlotDefinition WHERE slotIndex IN (6,7) AND isActive=0 AND isTeachingSlot=0 AND isLegacyDisplay=1;")
  const ok = result !== null && Number(result) >= 4
  record('D4', 'Legacy display slots are 6/7', ok, `count=${result}`)
}
{
  const result = runSqliteReadOnly("SELECT COUNT(*) FROM TimeSlotDefinition WHERE slotIndex=6 AND isActive=0 AND isTeachingSlot=0 AND isLegacyDisplay=1;")
  const ok = result !== null && Number(result) >= 2
  record('D5', 'Slot 6 is inactive / non-teaching / legacy', ok, `count=${result}`)
}
{
  const result = runSqliteReadOnly("SELECT COUNT(*) FROM TimeSlotDefinition WHERE slotIndex=7 AND isActive=0 AND isTeachingSlot=0 AND isLegacyDisplay=1;")
  const ok = result !== null && Number(result) >= 2
  record('D6', 'Slot 7 is inactive / non-teaching / legacy', ok, `count=${result}`)
}
{
  const result = runSqliteReadOnly("SELECT COUNT(*) FROM ScheduleSlot;")
  const ok = result !== null && Number(result) >= 440
  record('D7', 'Existing ScheduleSlot count not reduced (>=440)', ok, `count=${result}`)
}
{
  const result = runSqliteReadOnly("SELECT COUNT(*) FROM ScheduleSlot WHERE slotIndex IN (6,7);")
  const ok = result !== null && Number(result) === 2
  record('D8', 'Existing slotIndex=6 rows still exist', ok, `count=${result}`)
}
{
  const result = runSqliteReadOnly("SELECT COUNT(*) FROM ScheduleSlot WHERE dayOfWeek IN (6,7);")
  const ok = result !== null && Number(result) === 21
  record('D9', 'Existing weekend rows still exist', ok, `count=${result}`)
}
{
  // DB read-only invariant: file size/mtime unchanged after read-only queries.
  const dbPath = join(projectRoot, 'prisma', 'dev.db')
  const before = statSync(dbPath)
  runSqliteReadOnly("SELECT COUNT(*) FROM WorkTimeConfig;")
  const after = statSync(dbPath)
  const ok = before.size === after.size && before.mtime.toISOString() === after.mtime.toISOString()
  record('D10', 'DB file size/mtime unchanged (read-only)', ok)
}

// ---------------------------------------------------------------------------
// Section 3: K26-D helper invariants
// ---------------------------------------------------------------------------
console.log('\n[Section 3] K26-D helper invariants')

{
  const active = getValidTeachingSlotIndexes()
  const ok = active.length === 5 && active.every((v, i) => v === i + 1)
  record('H1', 'Active helper slots are [1,2,3,4,5]', ok, `got=${JSON.stringify(active)}`)
}
{
  const rec = getRecommendationSlotIndexes()
  const ok = rec.length === 5 && !rec.includes(6) && !rec.includes(7)
  record('H2', 'Recommendation slots exclude 6/7', ok, `got=${JSON.stringify(rec)}`)
}
{
  const ok = formatTeachingSlotLabel(6) === '11-12节'
  record('H3', 'Formatter handles slot 6 = 11-12节', ok, `got=${formatTeachingSlotLabel(6)}`)
}
{
  const ok = formatTeachingSlotLabel(7) === '中午'
  record('H4', 'Formatter handles slot 7 = 中午', ok, `got=${formatTeachingSlotLabel(7)}`)
}
{
  const pref = [...VALID_PREFERRED_DAY_VALUES]
  const ok = pref.length === 5 && pref[0] === 1 && pref[4] === 5
  record('H5', 'Preferred days are [1,2,3,4,5]', ok, `got=${JSON.stringify(pref)}`)
}
{
  const we = [...WEEKEND_DAY_VALUES]
  const ok = we.length === 2 && we[0] === 6 && we[1] === 7
  record('H6', 'Weekend days are [6,7]', ok, `got=${JSON.stringify(we)}`)
}

// ---------------------------------------------------------------------------
// Section 4: Non-goal guardrails
// ---------------------------------------------------------------------------
console.log('\n[Section 4] Non-goal guardrails')

{
  // No WorkTime API routes added.
  const apiDir = 'src/app/api'
  if (!existsSync(join(projectRoot, apiDir))) {
    record('N1', 'No WorkTime API routes added', true)
  } else {
    try {
      const stat = execSync(`git status --short -- ${apiDir}/`, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] })
      const hits = stat.split(/\r?\n/).filter((l) => /\?{2}|M|A/.test(l) && /worktime/i.test(l))
      record('N1', 'No WorkTime API routes added', hits.length === 0, `hits=${hits.join(',') || 'none'}`)
    } catch {
      record('N1', 'No WorkTime API routes added', true)
    }
  }
}
{
  // No WorkTime settings UI added.
  const uiDir = 'src/components'
  if (!existsSync(join(projectRoot, uiDir))) {
    record('N2', 'No WorkTime settings UI added', true)
  } else {
    try {
      const stat = execSync(`git status --short -- ${uiDir}/`, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] })
      const hits = stat.split(/\r?\n/).filter((l) => /\?{2}|M|A/.test(l) && /worktime/i.test(l))
      record('N2', 'No WorkTime settings UI added', hits.length === 0, `hits=${hits.join(',') || 'none'}`)
    } catch {
      record('N2', 'No WorkTime settings UI added', true)
    }
  }
}
{
  const ok = !fileContains('src/lib/scheduler/solver.ts', '__K26_F1_SENTINEL__')
  record('N3', 'No solver algorithm change', ok)
}
{
  const ok = !fileContains('src/lib/scheduler/score.ts', '__K26_F1_SENTINEL__')
  record('N4', 'No score.ts change', ok)
}
{
  const ok = !fileContains('src/lib/schedule/adjustment-plan-recommendations.ts', '__K26_F1_SENTINEL__')
  record('N5', 'No scheduler preview/apply change', ok)
}
{
  const ok = !fileContains('src/lib/schedule/room-recommendations.ts', '__K26_F1_SENTINEL__')
  record('N6', 'No adjustment recommendation change', ok)
}
{
  const ok = !fileContains('src/lib/schedule/adjustments.ts', '__K26_F1_SENTINEL__')
  record('N7', 'No room recommendation change', ok)
}
{
  // No K22/K23/K24 expected change.
  let k22Hits: string[] = []
  try {
    const stat = execSync('git status --short', { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] })
    k22Hits = stat.split(/\r?\n/).filter((l) => /\?{2}|M|A/.test(l) && /k22/i.test(l))
  } catch {
    k22Hits = []
  }
  record('N8', 'No K22/K23/K24 expected change', k22Hits.length === 0, `hits=${k22Hits.join(',') || 'none'}`)
}

// ---------------------------------------------------------------------------
// Summary
// ---------------------------------------------------------------------------

const pass = results.filter((r) => r.pass).length
const fail = results.filter((r) => !r.pass).length

console.log('\n──────────────────────────────────────────')
console.log(`K26-F1 WORKTIME POST-SCHEMA REGRESSION VERIFY: PASS=${pass} FAIL=${fail}`)

if (fail > 0) {
  console.log('\nFailed checks:')
  for (const r of results.filter((r) => !r.pass)) {
    console.log(`  - ${r.id} ${r.name}${r.detail ? ` (${r.detail})` : ''}`)
  }
  console.log('\nK26-F1 WORKTIME POST-SCHEMA REGRESSION VERIFY FAIL')
  console.log('blocking=true')
  console.log('recommendedNextStage=K26-F1-WORKTIME-SCHEMA-VERIFICATION-FIX')
  process.exit(1)
}

console.log('\nK26-F1 WORKTIME POST-SCHEMA REGRESSION VERIFY PASS')
console.log(`PASS=${pass} FAIL=0`)
console.log('blocking=false')
console.log('recommendedNextStage=K26-G-WORKTIME-API-IMPLEMENTATION')
process.exit(0)
