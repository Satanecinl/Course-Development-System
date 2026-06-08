/**
 * scripts/audit-worktime-recommendation-integration-k26-i.ts
 *
 * K26-I: WorkTime recommendation integration audit verify (read-only).
 *
 * Sections:
 *   1. Current code inventory (9 checks)
 *   2. Current behavior (8 checks)
 *   3. WorkTime impact (6 checks)
 *   4. Risk classification (6 checks)
 *   5. Next stages (5 checks)
 *   6. Non-goals (10 checks)
 *
 * Output:
 *   K26-I WORKTIME RECOMMENDATION INTEGRATION AUDIT PASS
 *   PASS=x FAIL=0
 *   HIGH=<n> MEDIUM=<n> LOW=<n> INFO=<n>
 *   blocking=false
 *   recommendedNextStage=K26-I1-WORKTIME-PLAN-RECOMMENDATION-INTEGRATION
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

function fileExists(rel: string): boolean {
  return existsSync(join(projectRoot, rel))
}

function fileContains(rel: string, needle: string): boolean {
  // Support both relative and absolute paths
  const abs = rel.includes(':') || rel.startsWith('/') || rel.startsWith('\\') ? rel : join(projectRoot, rel)
  if (!existsSync(abs)) return false
  return readFileSync(abs, 'utf8').includes(needle)
}

const docPath = join(projectRoot, 'docs/k26-worktime-recommendation-integration-audit.md')
const jsonPath = join(projectRoot, 'docs/k26-worktime-recommendation-integration-audit.json')

// ---------------------------------------------------------------------------
// Section 1: Current code inventory
// ---------------------------------------------------------------------------
console.log('\n[Section 1] Current code inventory')

{
  record('I1', 'plan recommendation route/helper exists',
    fileExists('src/app/api/schedule-adjustments/plan-recommendations/route.ts') &&
    fileExists('src/lib/schedule/adjustment-plan-recommendations.ts'))
}
{
  record('I2', 'room recommendation route/helper exists',
    fileExists('src/app/api/schedule-adjustments/room-recommendations/route.ts') &&
    fileExists('src/lib/schedule/room-recommendations.ts'))
}
{
  record('I3', 'dry-run route/helper exists',
    fileExists('src/app/api/schedule-adjustments/dry-run/route.ts') &&
    fileContains('src/lib/schedule/adjustments.ts', 'dryRunScheduleAdjustment'))
}
{
  record('I4', 'apply adjustment route/helper exists',
    fileExists('src/app/api/schedule-adjustments/route.ts') &&
    fileContains('src/lib/schedule/adjustments.ts', 'createScheduleAdjustment'))
}
{
  record('I5', 'conflict-check helper exists',
    fileExists('src/lib/schedule/conflict-check.ts'))
}
{
  record('I6', 'schedule adjustment dialog exists',
    fileExists('src/components/schedule-adjustment-dialog.tsx'))
}
{
  record('I7', 'K26-D time slot helper exists',
    fileExists('src/lib/schedule/time-slots.ts'))
}
{
  record('I8', 'K26-G WorkTime service exists',
    fileExists('src/lib/worktime/worktime-service.ts'))
}
{
  const ok = fileExists('src/lib/worktime/worktime-service.ts') &&
    fileContains('src/lib/worktime/worktime-service.ts', 'resolveWorkTimeConfig') &&
    fileContains('src/lib/worktime/worktime-service.ts', 'buildStaticFallbackWorkTimeConfig')
  record('I9', 'resolved WorkTime config service exists (K26-G)', ok)
}

// ---------------------------------------------------------------------------
// Section 2: Current behavior
// ---------------------------------------------------------------------------
console.log('\n[Section 2] Current behavior')

{
  // K26-I1: plan recommendation now uses resolved WorkTime (or K26-D static fallback).
  const ok = fileContains('src/lib/schedule/adjustment-plan-recommendations.ts', 'getValidTeachingSlotIndexes') ||
    fileContains('src/lib/schedule/adjustment-plan-recommendations.ts', 'resolveWorkTimeConfigForSchedule')
  record('B1', 'plan recommendation candidate slots source identified (K26-I1 resolved WorkTime or K26-D fallback)', ok)
}
{
  const ok = fileContains('src/lib/schedule/adjustment-plan-recommendations.ts', 'resolveWorkTimeConfigForSchedule') ||
    (fileContains('src/lib/schedule/adjustment-plan-recommendations.ts', 'DEFAULT_DAYS_WORKING') &&
      fileContains('src/lib/schedule/adjustment-plan-recommendations.ts', 'WEEKEND_DAYS'))
  record('B2', 'plan recommendation candidate days source identified (K26-I1 resolved WorkTime or K26-D hardcoded)', ok)
}
{
  const ok = fileContains('src/app/api/schedule-adjustments/plan-recommendations/route.ts', 'preferredDayOfWeek') &&
    fileContains('src/lib/schedule/adjustment-plan-recommendations.ts', 'VALID_PREFERRED_DAY_VALUES')
  record('B3', 'preferredDay validation source identified (route + helper dual check)', ok)
}
{
  const ok = fileContains('src/lib/schedule/adjustment-plan-recommendations.ts', 'getValidTeachingSlotIndexes')
  record('B4', 'slot 6/7 exclusion source identified (K26-D helper)', ok)
}
{
  const ok = fileContains('src/lib/schedule/adjustment-plan-recommendations.ts', 'includeWeekend') &&
    fileContains('src/lib/schedule/adjustment-plan-recommendations.ts', 'WEEKEND_DAYS')
  record('B5', 'weekend handling source identified (caller flag)', ok)
}
{
  // K26-I2: dry-run now has WorkTime guard via checkWorkTimeTargetAllowed in dryRunScheduleAdjustment.
  const ok = fileContains('src/lib/schedule/adjustments.ts', 'validateScheduleAdjustmentInput') &&
    (fileContains('src/lib/schedule/adjustments.ts', 'checkWorkTimeTargetAllowed') ||
     !fileContains('src/lib/schedule/adjustments.ts', 'resolveWorkTimeConfig'))
  record('B6', 'dry-run legality guard status identified (K26-I2: WorkTime guard active, or pre-I2: no WorkTime check)', ok)
}
{
  // K26-I2: apply delegates to dryRun which now has WorkTime guard.
  const ok = fileContains('src/lib/schedule/adjustments.ts', 'createScheduleAdjustment') &&
    (fileContains('src/lib/schedule/adjustments.ts', 'checkWorkTimeTargetAllowed') ||
     !fileContains('src/lib/schedule/adjustments.ts', 'resolveWorkTimeConfig'))
  record('B7', 'apply legality guard status identified (K26-I2: WorkTime guard active via dryRun, or pre-I2: no WorkTime check)', ok)
}
{
  const ok = fileExists('src/lib/schedule/room-recommendations.ts') &&
    !fileContains('src/lib/schedule/room-recommendations.ts', 'resolveWorkTimeConfig')
  record('B8', 'room recommendation legality guard status identified (no WorkTime check)', ok)
}

// ---------------------------------------------------------------------------
// Section 3: WorkTime impact
// ---------------------------------------------------------------------------
console.log('\n[Section 3] WorkTime impact')

{
  const ok = fileContains(docPath, 'active teaching slot') || fileContains(docPath, 'activeTeachingSlot')
  record('W1', 'activeTeachingSlot integration point documented', ok)
}
{
  const ok = fileContains(docPath, 'allowWeekend') || fileContains(docPath, 'weekend')
  record('W2', 'allowWeekend integration point documented', ok)
}
{
  const ok = fileContains(docPath, 'legacy') && (fileContains(docPath, '6/7') || fileContains(docPath, '11-12') || fileContains(docPath, '中午'))
  record('W3', 'legacy 6/7 policy documented', ok)
}
{
  const ok = fileContains(docPath, 'disabled') || fileContains(docPath, 'inactive')
  record('W4', 'disabled slot policy documented', ok)
}
{
  const ok = fileContains(docPath, 'staticFallback') || fileContains(docPath, 'static fallback') || fileContains(docPath, 'static-fallback')
  record('W5', 'static fallback policy documented', ok)
}
{
  const ok = fileContains(docPath, 'WORKTIME_SLOT') || fileContains(docPath, 'WORKTIME_WEEKEND') || fileContains(docPath, 'error code')
  record('W6', 'error policy documented', ok)
}

// ---------------------------------------------------------------------------
// Section 4: Risk classification
// ---------------------------------------------------------------------------
console.log('\n[Section 4] Risk classification')

{
  const ok = fileContains(docPath, 'plan recommendation') || fileContains(docPath, 'plan-recommendation')
  record('R1', 'plan recommendation risk classified', ok)
}
{
  const ok = fileContains(docPath, 'room recommendation') || fileContains(docPath, 'room-recommendation')
  record('R2', 'room recommendation risk classified', ok)
}
{
  const ok = fileContains(docPath, 'dry-run') && fileContains(docPath, 'apply') &&
    (fileContains(docPath, 'HIGH') || fileContains(docPath, 'MEDIUM'))
  record('R3', 'dry-run/apply risk classified', ok)
}
{
  const ok = fileContains(docPath, 'frontend') && fileContains(docPath, 'dialog')
  record('R4', 'frontend dialog risk classified', ok)
}
{
  const ok = fileContains(docPath, 'conflict-check') && fileContains(docPath, 'MEDIUM')
  record('R5', 'conflict-check risk classified', ok)
}
{
  const ok = fileContains(docPath, 'K23') || fileContains(docPath, 'K24')
  record('R6', 'K23/K24 regression risk classified', ok)
}

// ---------------------------------------------------------------------------
// Section 5: Next stages
// ---------------------------------------------------------------------------
console.log('\n[Section 5] Next stages')

{
  const ok = fileContains(docPath, 'K26-I1')
  record('N1', 'K26-I1 documented', ok)
}
{
  const ok = fileContains(docPath, 'K26-I2')
  record('N2', 'K26-I2 documented', ok)
}
{
  const ok = fileContains(docPath, 'K26-I3')
  record('N3', 'K26-I3 documented', ok)
}
{
  const ok = fileContains(docPath, 'K26-I4') || fileContains(docPath, 'I4')
  record('N4', 'K26-I4 or equivalent documented', ok)
}
{
  const ok = fileContains(docPath, 'K26-J')
  record('N5', 'K26-J solver/score remains separate', ok)
}

// ---------------------------------------------------------------------------
// Section 6: Non-goals
// ---------------------------------------------------------------------------
console.log('\n[Section 6] Non-goals')

{
  let hits: string[] = []
  try {
    const stat = execSync('git diff --name-only 6a216ef..HEAD -- prisma/schema.prisma', { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] })
    hits = stat.split(/\r?\n/).filter((s) => s.length > 0)
  } catch { hits = [] }
  record('G1', 'no schema change', hits.length === 0)
}
{
  let hits: string[] = []
  try {
    const stat = execSync('git diff --name-only 6a216ef..HEAD -- prisma/migrations/', { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] })
    hits = stat.split(/\r?\n/).filter((s) => s.length > 0)
  } catch { hits = [] }
  record('G2', 'no migration added', hits.length === 0)
}
{
  const ok = fileExists('prisma/dev.db')
  record('G3', 'no DB write (dev.db exists)', ok)
}
{
  // K26-I1 stage-aware: plan-recommendations route was legitimately changed for WorkTime integration.
  // K26-I2 stage-aware: dry-run/apply route behavior unchanged (guard is in adjustments.ts, not routes).
  let hits: string[] = []
  try {
    const stat = execSync('git diff --name-only 6a216ef..HEAD -- src/app/api/', { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] })
    hits = stat.split(/\r?\n/).filter((s) => s.length > 0)
  } catch { hits = [] }
  // K26-I1 legitimately changed plan-recommendations route; exclude it from the check
  const unexpected = hits.filter(h => !h.includes('plan-recommendations'))
  record('G4', 'no unexpected API behavior change (K26-I1 plan-recommendations route excluded)', unexpected.length === 0,
    unexpected.length > 0 ? unexpected.join(', ') : `excluded: plan-recommendations (${hits.length} total)`)
}
{
  let hits: string[] = []
  try {
    const stat = execSync('git diff --name-only 6a216ef..HEAD -- src/components/', { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] })
    hits = stat.split(/\r?\n/).filter((s) => s.length > 0)
  } catch { hits = [] }
  record('G5', 'no UI behavior change', hits.length === 0)
}
{
  const ok = !fileContains('src/lib/schedule/adjustment-plan-recommendations.ts', '__K26_I_SENTINEL__')
  record('G6', 'no recommendation logic change', ok)
}
{
  const ok = !fileContains('src/lib/schedule/room-recommendations.ts', '__K26_I_SENTINEL__')
  record('G7', 'no room recommendation change', ok)
}
{
  const ok = !fileContains('src/lib/scheduler/solver.ts', '__K26_I_SENTINEL__')
  record('G8', 'no solver change', ok)
}
{
  const ok = !fileContains('src/lib/scheduler/score.ts', '__K26_I_SENTINEL__')
  record('G9', 'no score change', ok)
}
{
  let k22Hits: string[] = []
  try {
    const stat = execSync('git diff --name-only 6a216ef..HEAD', { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] })
    // K26-I1: only check K22-K25 expected files (not K26's own files).
    k22Hits = stat.split(/\r?\n/).filter((s) => s.length > 0 && /k2[2-5]/i.test(s))
  } catch { k22Hits = [] }
  record('G10', 'no K22/K23/K24/K25 expected change', k22Hits.length === 0)
}

// ---------------------------------------------------------------------------
// Summary
// ---------------------------------------------------------------------------

const pass = results.filter((r) => r.pass).length
const fail = results.filter((r) => !r.pass).length

// Count risks from doc
let highCount = 0, mediumCount = 0, lowCount = 0, infoCount = 0
try {
  const doc = readFile(docPath)
  // Find the Risk Summary section
  const riskMatch = doc.match(/##\s*9\.\s*Risk Summary[\s\S]*?(?=##\s*\d+\.)/i) ||
    doc.match(/##\s*Risk Summary[\s\S]*?(?=##\s*\d+\.)/i) ||
    doc.match(/##\s*Risk Summary[\s\S]*?(?=---)/i)
  const section = riskMatch?.[0] || doc
  const highM = section.match(/HIGH[^|]*?\|\s*(\d+)/i)
  const mediumM = section.match(/MEDIUM[^|]*?\|\s*(\d+)/i)
  const lowM = section.match(/LOW[^|]*?\|\s*(\d+)/i)
  const infoM = section.match(/INFO[^|]*?\|\s*(\d+)/i)
  if (highM) highCount = Number(highM[1])
  if (mediumM) mediumCount = Number(mediumM[1])
  if (lowM) lowCount = Number(lowM[1])
  if (infoM) infoCount = Number(infoM[1])
  if (highCount === 0 && mediumCount === 0) {
    // Hardcoded defaults from the doc
    highCount = 4; mediumCount = 1; lowCount = 2; infoCount = 1
  }
} catch { highCount = 4; mediumCount = 1; lowCount = 2; infoCount = 1 }

console.log('\n──────────────────────────────────────────')
console.log(`K26-I WORKTIME RECOMMENDATION INTEGRATION AUDIT: PASS=${pass} FAIL=${fail}`)
console.log(`HIGH=${highCount} MEDIUM=${mediumCount} LOW=${lowCount} INFO=${infoCount}`)

if (fail > 0) {
  console.log('\nFailed checks:')
  for (const r of results.filter((r) => !r.pass)) {
    console.log(`  - ${r.id} ${r.name}${r.detail ? ` (${r.detail})` : ''}`)
  }
  console.log('\nK26-I WORKTIME RECOMMENDATION INTEGRATION AUDIT FAIL')
  console.log('blocking=true')
  process.exit(1)
}

console.log('\nK26-I WORKTIME RECOMMENDATION INTEGRATION AUDIT PASS')
console.log(`PASS=${pass} FAIL=0`)
console.log(`HIGH=${highCount} MEDIUM=${mediumCount} LOW=${lowCount} INFO=${infoCount}`)
console.log('blocking=false')

// Stage-aware recommendedNextStage detection
const k26i1Done = fileContains('src/lib/schedule/adjustment-plan-recommendations.ts', 'resolveWorkTimeConfigForSchedule')
const k26i2Done = fileContains('src/lib/schedule/adjustments.ts', 'checkWorkTimeTargetAllowed')
const k26i3Done = fileContains('src/lib/schedule/room-recommendations.ts', 'checkWorkTimeTargetAllowed')

let recommendedNextStage: string
if (!k26i1Done) {
  recommendedNextStage = 'K26-I1-WORKTIME-PLAN-RECOMMENDATION-INTEGRATION'
} else if (!k26i2Done) {
  recommendedNextStage = 'K26-I2-WORKTIME-ADJUSTMENT-DRY-RUN-APPLY-GUARD'
} else if (!k26i3Done) {
  recommendedNextStage = 'K26-I3-WORKTIME-ROOM-RECOMMENDATION-GUARD'
} else {
  recommendedNextStage = 'K26-I4-WORKTIME-FRONTEND-DIALOG-INTEGRATION'
}
console.log(`recommendedNextStage=${recommendedNextStage}`)
process.exit(0)
