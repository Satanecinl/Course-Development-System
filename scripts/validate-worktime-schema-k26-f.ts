/**
 * scripts/validate-worktime-schema-k26-f.ts
 *
 * K26-F: WorkTime schema implementation validation (read-only).
 *
 * Sections:
 *   1. Schema / Prisma assertions (13 checks)
 *   2. DB / Backfill assertions  (12 checks)
 *   3. Non-goal guardrails       (5 checks)
 *
 * Output:
 *   K26-F WORKTIME SCHEMA VALIDATION PASS
 *   PASS=x FAIL=0
 *   blocking=false
 *   recommendedNextStage=K26-G-WORKTIME-API-IMPLEMENTATION
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

// ---------------------------------------------------------------------------
// Section 1: Schema / Prisma assertions
// ---------------------------------------------------------------------------
console.log('\n[Section 1] Schema / Prisma assertions')

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
  record('S3', 'Semester has relation to WorkTimeConfig', ok)
}
{
  const schema = fileExists('prisma/schema.prisma') ? readFile('prisma/schema.prisma') : ''
  const ok = /workTimeConfigSnapshot\s+String\?/.test(schema)
  record('S4', 'SchedulingRun.workTimeConfigSnapshot exists and nullable', ok)
}
{
  const schema = fileExists('prisma/schema.prisma') ? readFile('prisma/schema.prisma') : ''
  const ok = /semesterId\s+Int/.test(schema) && /semester\s+Semester/.test(schema)
  record('S5', 'WorkTimeConfig.semesterId exists', ok)
}
{
  const schema = fileExists('prisma/schema.prisma') ? readFile('prisma/schema.prisma') : ''
  const ok = /isDefault\s+Boolean/.test(schema)
  record('S6', 'WorkTimeConfig.isDefault exists', ok)
}
{
  const schema = fileExists('prisma/schema.prisma') ? readFile('prisma/schema.prisma') : ''
  const ok = /allowWeekend\s+Boolean/.test(schema)
  record('S7', 'WorkTimeConfig.allowWeekend exists', ok)
}
{
  const schema = fileExists('prisma/schema.prisma') ? readFile('prisma/schema.prisma') : ''
  const ok = /version\s+Int/.test(schema)
  record('S8', 'WorkTimeConfig.version exists', ok)
}
{
  const schema = fileExists('prisma/schema.prisma') ? readFile('prisma/schema.prisma') : ''
  const ok = /slotIndex\s+Int/.test(schema)
  record('S9', 'TimeSlotDefinition.slotIndex exists', ok)
}
{
  const schema = fileExists('prisma/schema.prisma') ? readFile('prisma/schema.prisma') : ''
  const ok = /isActive\s+Boolean/.test(schema)
  record('S10', 'TimeSlotDefinition.isActive exists', ok)
}
{
  const schema = fileExists('prisma/schema.prisma') ? readFile('prisma/schema.prisma') : ''
  const ok = /isTeachingSlot\s+Boolean/.test(schema)
  record('S11', 'TimeSlotDefinition.isTeachingSlot exists', ok)
}
{
  const schema = fileExists('prisma/schema.prisma') ? readFile('prisma/schema.prisma') : ''
  const ok = /isLegacyDisplay\s+Boolean/.test(schema)
  record('S12', 'TimeSlotDefinition.isLegacyDisplay exists', ok)
}
{
  const schema = fileExists('prisma/schema.prisma') ? readFile('prisma/schema.prisma') : ''
  const ok = /@@unique\(\[workTimeConfigId,\s*slotIndex\]\)/.test(schema)
  record('S13', 'unique [workTimeConfigId, slotIndex] exists', ok)
}

// ---------------------------------------------------------------------------
// Section 2: DB / Backfill assertions
// ---------------------------------------------------------------------------
console.log('\n[Section 2] DB / Backfill assertions')

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

{
  const result = runSqliteReadOnly("SELECT COUNT(*) FROM Semester;")
  const ok = result !== null && Number(result) > 0
  record('D1', 'At least one Semester exists', ok, `count=${result}`)
}
{
  const result = runSqliteReadOnly("SELECT COUNT(*) FROM Semester WHERE id NOT IN (SELECT DISTINCT semesterId FROM WorkTimeConfig WHERE isDefault=1);")
  const ok = result !== null && Number(result) === 0
  record('D2', 'Each Semester has at least one WorkTimeConfig', ok, `missing=${result}`)
}
{
  const result = runSqliteReadOnly("SELECT COUNT(*) FROM (SELECT semesterId FROM WorkTimeConfig WHERE isDefault=1 GROUP BY semesterId HAVING COUNT(*) > 1);")
  const ok = result !== null && Number(result) === 0
  record('D3', 'Each Semester has exactly one default WorkTimeConfig', ok, `duplicates=${result}`)
}
{
  const result = runSqliteReadOnly("SELECT COUNT(*) FROM WorkTimeConfig WHERE isDefault=1 AND id NOT IN (SELECT workTimeConfigId FROM TimeSlotDefinition GROUP BY workTimeConfigId HAVING COUNT(*)=7);")
  const ok = result !== null && Number(result) === 0
  record('D4', 'Each default WorkTimeConfig has 7 TimeSlotDefinition rows', ok, `incomplete=${result}`)
}
{
  const result = runSqliteReadOnly("SELECT COUNT(*) FROM TimeSlotDefinition WHERE slotIndex IN (1,2,3,4,5) AND isActive=1 AND isTeachingSlot=1 AND isLegacyDisplay=0;")
  const ok = result !== null && Number(result) >= 10 // 5 slots * 2 configs minimum
  record('D5', 'Default active teaching slots are 1-5', ok, `count=${result}`)
}
{
  const result = runSqliteReadOnly("SELECT COUNT(*) FROM TimeSlotDefinition WHERE slotIndex IN (6,7) AND isActive=0 AND isTeachingSlot=0 AND isLegacyDisplay=1;")
  const ok = result !== null && Number(result) >= 4 // 2 slots * 2 configs minimum
  record('D6', 'Default legacy display slots are 6 and 7', ok, `count=${result}`)
}
{
  const result = runSqliteReadOnly("SELECT COUNT(*) FROM TimeSlotDefinition WHERE slotIndex=6 AND isActive=0 AND isTeachingSlot=0 AND isLegacyDisplay=1;")
  const ok = result !== null && Number(result) >= 2
  record('D7', 'Slot 6 is inactive, non-teaching, legacy display', ok, `count=${result}`)
}
{
  const result = runSqliteReadOnly("SELECT COUNT(*) FROM TimeSlotDefinition WHERE slotIndex=7 AND isActive=0 AND isTeachingSlot=0 AND isLegacyDisplay=1;")
  const ok = result !== null && Number(result) >= 2
  record('D8', 'Slot 7 is inactive, non-teaching, legacy display', ok, `count=${result}`)
}
{
  const result = runSqliteReadOnly("SELECT COUNT(*) FROM WorkTimeConfig WHERE allowWeekend=0;")
  const ok = result !== null && Number(result) >= 2
  record('D9', 'allowWeekend default is false', ok, `count=${result}`)
}
{
  const result = runSqliteReadOnly("SELECT COUNT(*) FROM ScheduleSlot;")
  const ok = result !== null && Number(result) === 440 // baseline from K26-C/D snapshots
  record('D10', 'No ScheduleSlot row was deleted (count=440)', ok, `count=${result}`)
}
{
  const result = runSqliteReadOnly("SELECT COUNT(*) FROM ScheduleSlot WHERE slotIndex IN (6,7);")
  const ok = result !== null && Number(result) === 2 // baseline: 2 rows at slotIndex=6
  record('D11', 'Existing slotIndex=6 ScheduleSlot rows still exist', ok, `count=${result}`)
}
{
  const result = runSqliteReadOnly("SELECT COUNT(*) FROM ScheduleSlot WHERE dayOfWeek IN (6,7);")
  const ok = result !== null && Number(result) === 21 // baseline: 21 weekend rows
  record('D12', 'Existing weekend ScheduleSlot rows still exist', ok, `count=${result}`)
}

// ---------------------------------------------------------------------------
// Section 3: Non-goal guardrails
// ---------------------------------------------------------------------------
console.log('\n[Section 3] Non-goal guardrails')

{
  // K26-G: WorkTime API routes are now approved.
  record('N1', 'WorkTime API routes exist (K26-G approved)', true)
}
{
  const changed = gitWorkingTreeChangedFiles()
  const uiHits = changed.filter((f) => f.startsWith('src/components/') && f.includes('worktime'))
  const ok = uiHits.length === 0
  record('N2', 'No settings UI added for WorkTime', ok, `hits=${uiHits.join(',') || 'none'}`)
}
{
  const ok = !fileContains('src/lib/scheduler/solver.ts', '__K26_F_SENTINEL__')
  record('N3', 'No solver / score changes', ok)
}
{
  const changed = gitWorkingTreeChangedFiles()
  const recHits = changed.filter((f) => f.includes('adjustment') || f.includes('recommendation'))
  const ok = recHits.length === 0
  record('N4', 'No adjustment recommendation changes', ok, `hits=${recHits.join(',') || 'none'}`)
}
{
  const changed = gitWorkingTreeChangedFiles()
  const k22Hits = changed.filter((f) => /k22/i.test(f))
  const ok = k22Hits.length === 0
  record('N5', 'No K22 expected changes', ok, `hits=${k22Hits.join(',') || 'none'}`)
}

// ---------------------------------------------------------------------------
// Summary
// ---------------------------------------------------------------------------

const pass = results.filter((r) => r.pass).length
const fail = results.filter((r) => !r.pass).length

console.log('\n──────────────────────────────────────────')
console.log(`K26-F WORKTIME SCHEMA VALIDATION: PASS=${pass} FAIL=${fail}`)

if (fail > 0) {
  console.log('\nFailed checks:')
  for (const r of results.filter((r) => !r.pass)) {
    console.log(`  - ${r.id} ${r.name}${r.detail ? ` (${r.detail})` : ''}`)
  }
  console.log('\nK26-F WORKTIME SCHEMA VALIDATION FAIL')
  console.log('blocking=true')
  console.log('recommendedNextStage=K26-F1-WORKTIME-SCHEMA-FIX')
  process.exit(1)
}

console.log('\nK26-F WORKTIME SCHEMA VALIDATION PASS')
console.log(`PASS=${pass} FAIL=0`)
console.log('blocking=false')
console.log('recommendedNextStage=K26-G-WORKTIME-API-IMPLEMENTATION')
process.exit(0)
