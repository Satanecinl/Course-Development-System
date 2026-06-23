/**
 * L8-C3A Generator Script — ClassGroup Canonical Manual Review Workbook
 *
 * Reads L8-C3 local artifacts and generates a manual review workbook
 * for the 8 unmatched source ClassGroups / 89 affected TTCs.
 *
 * NO DB writes.
 *
 * Usage:
 *   npx tsx scripts/generate-classgroup-canonical-manual-review-l8-c3a.ts \
 *     --target-semester-id 4
 */

import { existsSync, mkdirSync, writeFileSync } from 'node:fs'
import { join, resolve } from 'node:path'
import ExcelJS from 'exceljs'

const ROOT = resolve(__dirname, '..')
const STAGE = 'L8-C3A-CLASSGROUP-CANONICAL-MANUAL-REVIEW-GENERATOR'
const ARTIFACT_DIR_C3 = join(ROOT, 'temp', 'local-artifacts', 'l8-c3')
const ARTIFACT_DIR_C3A = join(ROOT, 'temp', 'local-artifacts', 'l8-c3a')
const OUTPUT_XLSX = join(ARTIFACT_DIR_C3A, 'classgroup-canonical-manual-review.local.xlsx')

// ── CLI ─────────────────────────────────────────────────────────────────────

type CliArgs = { targetSemesterId: number; help: boolean }
const parseArgs = (argv: string[]): CliArgs => {
  const args: CliArgs = { targetSemesterId: 0, help: false }
  for (let i = 2; i < argv.length; i++) {
    if (argv[i] === '--target-semester-id') args.targetSemesterId = Number(argv[++i] ?? 0)
    else if (argv[i] === '--help') args.help = true
  }
  return args
}

// ── Helpers ─────────────────────────────────────────────────────────────────

function loadJson<T>(path: string): T {
  return JSON.parse(require('node:fs').readFileSync(path, 'utf8')) as T
}

// ── Main ───────────────────────────────────────────────────────────────────

async function main(): Promise<void> {
  const args = parseArgs(process.argv)
  if (args.help || !args.targetSemesterId) {
    console.log('Usage: npx tsx scripts/generate-classgroup-canonical-manual-review-l8-c3a.ts --target-semester-id <id>')
    process.exit(args.help ? 0 : 1)
  }

  console.log(`=== ${STAGE} ===\n`)

  // Check L8-C3 artifacts
  const planPath = join(ARTIFACT_DIR_C3, 'classgroup-canonical-controlled-apply-plan.local.json')
  const ttcPath = join(ARTIFACT_DIR_C3, 'teaching-task-classgroup-migration-plan.local.json')
  const dbPlanPath = join(ARTIFACT_DIR_C3, 'db-classgroup-to-canonical-plan.local.json')
  const refPath = join(ARTIFACT_DIR_C3, 'reference-canonical-classgroups.raw.local.json')

  for (const p of [planPath, ttcPath, dbPlanPath, refPath]) {
    if (!existsSync(p)) { console.error(`MISSING_L8_C3_LOCAL_ARTIFACTS: ${p}`); process.exit(1) }
  }
  console.log('[check] L8-C3 local artifacts found')

  const plan = loadJson<any>(planPath)
  const ttcPlan = loadJson<any>(ttcPath)
  const dbPlans = loadJson<any[]>(dbPlanPath)
  const refClasses = loadJson<any[]>(refPath)

  console.log(`[data] CG plan: create=${plan.createCanonicalClassGroups} update=${plan.updateExistingCanonicalClassGroups} deactivate=${plan.deactivateExtraClassGroups}`)
  console.log(`[data] TTC: total=${ttcPlan.totalTtc} needsMigration=${ttcPlan.ttcNeedsMigration} unmatched=${ttcPlan.ttcUnmatched}`)

  // Find unmatched migrations (toClassGroupId === null)
  const unmatched = ttcPlan.migrations.filter((m: any) => m.toClassGroupId === null)
  console.log(`[data] Unmatched TTC: ${unmatched.length}`)

  // Group by source ClassGroupId
  const byCg = new Map<number, { ttcIds: number[]; reason: string }>()
  for (const m of unmatched) {
    const existing = byCg.get(m.fromClassGroupId) || { ttcIds: [], reason: m.reason }
    existing.ttcIds.push(m.ttcId)
    byCg.set(m.fromClassGroupId, existing)
  }
  console.log(`[data] Unmatched source CGs: ${byCg.size}`)

  // Load DB class groups for source info
  const cgMap = new Map<number, any>()
  for (const p of dbPlans) cgMap.set(p.dbClassGroupId, p)

  // Build canonical key → ref class map
  const refByKey = new Map<string, any>()
  for (const rc of refClasses) refByKey.set(rc.canonicalKey, rc)

  // For each unmatched CG, find candidate canonical keys (same grade+major)
  function findCandidates(cgPlan: any): Array<{ canonicalKey: string; plannedName: string; confidence: string }> {
    if (!cgPlan.grade || !cgPlan.majorName) return []
    const candidates: Array<{ canonicalKey: string; plannedName: string; confidence: string }> = []
    for (const rc of refClasses) {
      if (rc.grade === cgPlan.grade && rc.majorName === cgPlan.majorName) {
        const classNum = cgPlan.classNumber || '1'
        if (rc.classNumber === classNum) {
          candidates.push({ canonicalKey: rc.canonicalKey, plannedName: rc.plannedName, confidence: 'HIGH' })
        } else {
          candidates.push({ canonicalKey: rc.canonicalKey, plannedName: rc.plannedName, confidence: 'LOW' })
        }
      }
    }
    return candidates
  }

  // Generate workbook
  if (!existsSync(ARTIFACT_DIR_C3A)) mkdirSync(ARTIFACT_DIR_C3A, { recursive: true })

  const wb = new ExcelJS.Workbook()
  wb.creator = 'L8-C3A manual review generator'

  // Sheet 1: README
  const wsReadme = wb.addWorksheet('README')
  wsReadme.addRow(['L8-C3A ClassGroup Canonical Manual Review Workbook'])
  wsReadme.addRow([])
  wsReadme.addRow(['Purpose:', 'Resolve 89 unmatched TeachingTaskClass references across 8 source ClassGroups'])
  wsReadme.addRow(['Status:', 'WAITING_FOR_USER_REVIEW (until action columns are filled)'])
  wsReadme.addRow([])
  wsReadme.addRow(['Instructions:'])
  wsReadme.addRow(['1. Open Unmatched_Source_ClassGroups_8 sheet'])
  wsReadme.addRow(['2. For each row, fill action + selectedCanonicalKey (or editedCanonicalKey)'])
  wsReadme.addRow(['3. action values: manualSelect | manualEdit | keepUnmapped | needsReview'])
  wsReadme.addRow(['4. Save the xlsx file'])
  wsReadme.addRow(['5. Run: npx tsx scripts/import-classgroup-canonical-manual-review-l8-c3a.ts --target-semester-id 4 --dry-run'])
  wsReadme.addRow(['6. When readyForC4Apply=true, proceed to L8-C4'])
  wsReadme.addRow([])
  wsReadme.addRow(['Rules:'])
  wsReadme.addRow(['- manualSelect requires selectedCanonicalKey'])
  wsReadme.addRow(['- manualEdit requires editedCanonicalKey + note'])
  wsReadme.addRow(['- keepUnmapped blocks C4 apply'])
  wsReadme.addRow(['- needsReview blocks C4 apply'])

  // Sheet 2: Summary
  const wsSummary = wb.addWorksheet('Summary')
  wsSummary.addRow(['Metric', 'Value'])
  wsSummary.addRow(['Affected source ClassGroups', byCg.size])
  wsSummary.addRow(['Affected TTCs', unmatched.length])
  wsSummary.addRow(['Canonical reference classes', refClasses.length])
  wsSummary.addRow(['Status', 'WAITING_FOR_USER_REVIEW'])

  // Sheet 3: Unmatched_Source_ClassGroups_8
  const wsSource = wb.addWorksheet('Unmatched_Source_ClassGroups_8')
  const sourceHeaders = [
    'sourceClassGroupId', 'sourceClassGroupName', 'sourceSemesterId',
    'affectedTtcCount', 'currentClassification', 'grade', 'majorName', 'classNumber',
    'candidateCanonicalKeys', 'candidateCanonicalDisplayNames',
    'suggestedAction', 'suggestedCanonicalKey', 'confidenceBand', 'riskFlags', 'reasonCodes',
    'action', 'selectedCanonicalKey', 'selectedCanonicalClassGroupId', 'editedCanonicalKey', 'note'
  ]
  wsSource.addRow(sourceHeaders)

  for (const [cgId, info] of byCg) {
    const cgPlan = cgMap.get(cgId)
    const candidates = findCandidates(cgPlan)
    const highCandidates = candidates.filter(c => c.confidence === 'HIGH')
    const suggested = highCandidates.length === 1 ? highCandidates[0] : (candidates[0] || null)
    const suggestedAction = suggested ? 'manualSelect' : 'needsReview'
    const confidenceBand = highCandidates.length === 1 ? 'HIGH' : (candidates.length > 0 ? 'MEDIUM' : 'LOW')
    const riskFlags = candidates.length > 5 ? 'MANY_CANDIDATES' : (candidates.length === 0 ? 'NO_CANDIDATES' : '')
    const reasonCodes = info.reason

    wsSource.addRow([
      cgId,
      cgPlan?.name || 'UNKNOWN',
      cgPlan?.semesterId || '',
      info.ttcIds.length,
      cgPlan?.classification || '',
      cgPlan?.grade || '',
      cgPlan?.majorName || '',
      cgPlan?.classNumber || '',
      candidates.map(c => c.canonicalKey).join('; '),
      candidates.map(c => c.plannedName).join('; '),
      suggestedAction,
      suggested?.canonicalKey || '',
      confidenceBand,
      riskFlags,
      reasonCodes,
      '', // action — user fills
      '', // selectedCanonicalKey — user fills
      '', // selectedCanonicalClassGroupId — user fills
      '', // editedCanonicalKey — user fills
      '', // note — user fills
    ])
  }

  // Sheet 4: Affected_TTC_89
  const wsTtc = wb.addWorksheet('Affected_TTC_89')
  const ttcHeaders = [
    'teachingTaskClassId', 'teachingTaskId', 'sourceClassGroupId',
    'sourceClassGroupName', 'sourceSemesterId',
    'reviewGroupKey'
  ]
  wsTtc.addRow(ttcHeaders)

  for (const m of unmatched) {
    const cgPlan = cgMap.get(m.fromClassGroupId)
    wsTtc.addRow([
      m.ttcId,
      '', // teachingTaskId not in plan — would need DB query
      m.fromClassGroupId,
      cgPlan?.name || 'UNKNOWN',
      cgPlan?.semesterId || '',
      `CG#${m.fromClassGroupId}`,
    ])
  }

  // Sheet 5: Canonical_Candidates_227
  const wsRef = wb.addWorksheet('Canonical_Candidates_227')
  wsRef.addRow(['canonicalKey', 'plannedName', 'grade', 'majorName', 'classNumber', 'educationLevel', 'schoolLength', 'studentCount'])
  for (const rc of refClasses) {
    wsRef.addRow([rc.canonicalKey, rc.plannedName, rc.grade, rc.majorName, rc.classNumber, rc.educationLevel, rc.schoolLength, rc.studentCount])
  }

  // Sheet 6: Export_Check
  const wsCheck = wb.addWorksheet('Export_Check')
  wsCheck.addRow(['Check', 'Expected', 'Status'])
  wsCheck.addRow(['Unmatched source CGs', byCg.size, byCg.size === 8 ? 'OK' : 'MISMATCH'])
  wsCheck.addRow(['Affected TTCs', unmatched.length, unmatched.length === 89 ? 'OK' : 'MISMATCH'])
  wsCheck.addRow(['Canonical candidates', refClasses.length, refClasses.length === 227 ? 'OK' : 'MISMATCH'])
  wsCheck.addRow(['Workbook status', 'WAITING_FOR_USER_REVIEW', 'WAITING'])

  // Save
  await wb.xlsx.writeFile(OUTPUT_XLSX)
  console.log(`\n[output] Workbook saved: ${OUTPUT_XLSX}`)
  console.log(`[output] Sheets: README, Summary, Unmatched_Source_ClassGroups_8, Affected_TTC_89, Canonical_Candidates_227, Export_Check`)

  // Also save JSON summary (committed-safe, no raw data)
  const summary = {
    stage: STAGE,
    affectedSourceClassGroups: byCg.size,
    affectedTTCs: unmatched.length,
    canonicalCandidateCount: refClasses.length,
    workbookPath: 'temp/local-artifacts/l8-c3a/classgroup-canonical-manual-review.local.xlsx',
    status: 'WAITING_FOR_USER_REVIEW',
    readyForC4Apply: false,
    manualReviewRequired: unmatched.length,
  }
  writeFileSync(join(ARTIFACT_DIR_C3A, 'classgroup-canonical-manual-review-summary.local.json'), JSON.stringify(summary, null, 2), 'utf8')
  console.log(`[output] Summary saved`)

  console.log('\n=== DONE ===')
}

main().catch(e => { console.error('FATAL:', e); process.exit(1) })
