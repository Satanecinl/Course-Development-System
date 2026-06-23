/**
 * L8-C3A Import Script — ClassGroup Canonical Manual Review Validator
 *
 * Reads the user-edited manual review workbook and validates decisions.
 * NO DB writes. NO C4 apply.
 *
 * Usage:
 *   npx tsx scripts/import-classgroup-canonical-manual-review-l8-c3a.ts \
 *     --target-semester-id 4 [--dry-run]
 */

import { existsSync, writeFileSync } from 'node:fs'
import { join, resolve } from 'node:path'
import ExcelJS from 'exceljs'

const ROOT = resolve(__dirname, '..')
const STAGE = 'L8-C3A-CLASSGROUP-CANONICAL-MANUAL-REVIEW-IMPORT'
const ARTIFACT_DIR_C3A = join(ROOT, 'temp', 'local-artifacts', 'l8-c3a')
const ARTIFACT_DIR_C3 = join(ROOT, 'temp', 'local-artifacts', 'l8-c3')
const WORKBOOK_PATH = join(ARTIFACT_DIR_C3A, 'classgroup-canonical-manual-review.local.xlsx')
const DECISIONS_PATH = join(ARTIFACT_DIR_C3A, 'classgroup-canonical-manual-review-decisions.local.json')
const READINESS_PATH = join(ARTIFACT_DIR_C3A, 'classgroup-canonical-apply-readiness.local.json')

// ── CLI ─────────────────────────────────────────────────────────────────────

type CliArgs = { targetSemesterId: number; dryRun: boolean; help: boolean }
const parseArgs = (argv: string[]): CliArgs => {
  const args: CliArgs = { targetSemesterId: 0, dryRun: false, help: false }
  for (let i = 2; i < argv.length; i++) {
    if (argv[i] === '--target-semester-id') args.targetSemesterId = Number(argv[++i] ?? 0)
    else if (argv[i] === '--dry-run') args.dryRun = true
    else if (argv[i] === '--help') args.help = true
  }
  return args
}

function loadJson<T>(path: string): T {
  return JSON.parse(require('node:fs').readFileSync(path, 'utf8')) as T
}

// ── Main ───────────────────────────────────────────────────────────────────

async function main(): Promise<void> {
  const args = parseArgs(process.argv)
  if (args.help || !args.targetSemesterId) {
    console.log('Usage: npx tsx scripts/import-classgroup-canonical-manual-review-l8-c3a.ts --target-semester-id <id> [--dry-run]')
    process.exit(args.help ? 0 : 1)
  }

  console.log(`=== ${STAGE} ===\n`)

  // Check workbook exists
  if (!existsSync(WORKBOOK_PATH)) {
    console.error(`ERROR: Workbook not found: ${WORKBOOK_PATH}`)
    console.error('Run the generator script first.')
    process.exit(1)
  }
  console.log(`[input] Workbook: ${WORKBOOK_PATH}`)

  // Load reference canonical keys for validation
  const refPath = join(ARTIFACT_DIR_C3, 'reference-canonical-classgroups.raw.local.json')
  if (!existsSync(refPath)) { console.error('MISSING_L8_C3_LOCAL_ARTIFACTS'); process.exit(1) }
  const refClasses = loadJson<any[]>(refPath)
  const refKeys = new Set(refClasses.map(r => r.canonicalKey))
  console.log(`[ref] Canonical keys loaded: ${refKeys.size}`)

  // Load L8-C3 plan for source CG info
  const dbPlanPath = join(ARTIFACT_DIR_C3, 'db-classgroup-to-canonical-plan.local.json')
  const dbPlans = loadJson<any[]>(dbPlanPath)
  const cgMap = new Map<number, any>()
  for (const p of dbPlans) cgMap.set(p.dbClassGroupId, p)

  // Load L8-C3 TTC plan
  const ttcPlanPath = join(ARTIFACT_DIR_C3, 'teaching-task-classgroup-migration-plan.local.json')
  const ttcPlan = loadJson<any>(ttcPlanPath)
  const unmatchedTotal = ttcPlan.migrations.filter((m: any) => m.toClassGroupId === null).length

  // Read workbook
  const wb = new ExcelJS.Workbook()
  await wb.xlsx.readFile(WORKBOOK_PATH)
  const wsSource = wb.getWorksheet('Unmatched_Source_ClassGroups_8')
  if (!wsSource) { console.error('ERROR: Sheet Unmatched_Source_ClassGroups_8 not found'); process.exit(1) }

  // Parse decisions
  const decisions: Array<{
    sourceClassGroupId: number
    action: string
    selectedCanonicalKey: string
    selectedCanonicalClassGroupId: string
    editedCanonicalKey: string
    note: string
    validationErrors: string[]
  }> = []

  let acceptedCount = 0
  let waitingForReview = false
  const validationErrors: string[] = []

  // Read header row to find column positions
  const headerRow = wsSource.getRow(1)
  const colMap: Record<string, number> = {}
  headerRow.eachCell((cell, col) => {
    const val = String(cell.value || '').trim()
    if (val) colMap[val] = col
  })

  for (let r = 2; r <= wsSource.rowCount; r++) {
    const row = wsSource.getRow(r)
    const cgId = Number(row.getCell(colMap['sourceClassGroupId'] || 1).value)
    const action = String(row.getCell(colMap['action'] || 16).value || '').trim()
    const selectedKey = String(row.getCell(colMap['selectedCanonicalKey'] || 17).value || '').trim()
    const selectedCgId = String(row.getCell(colMap['selectedCanonicalClassGroupId'] || 18).value || '').trim()
    const editedKey = String(row.getCell(colMap['editedCanonicalKey'] || 19).value || '').trim()
    const note = String(row.getCell(colMap['note'] || 20).value || '').trim()

    if (!cgId) continue

    const errors: string[] = []

    if (!action || action === '') {
      waitingForReview = true
      errors.push('action is empty — WAITING_FOR_USER_REVIEW')
    } else if (action === 'manualSelect') {
      if (!selectedKey) errors.push('manualSelect requires selectedCanonicalKey')
      else if (!refKeys.has(selectedKey)) errors.push(`selectedCanonicalKey not in 227 canonical: ${selectedKey}`)
      acceptedCount++
    } else if (action === 'manualEdit') {
      if (!editedKey) errors.push('manualEdit requires editedCanonicalKey')
      else if (!refKeys.has(editedKey)) errors.push(`editedCanonicalKey not in 227 canonical: ${editedKey}`)
      if (!note) errors.push('manualEdit requires note')
      acceptedCount++
    } else if (action === 'keepUnmapped') {
      if (!note) errors.push('keepUnmapped requires note')
      waitingForReview = true
    } else if (action === 'needsReview') {
      waitingForReview = true
    } else {
      errors.push(`unknown action: ${action}`)
    }

    decisions.push({
      sourceClassGroupId: cgId,
      action,
      selectedCanonicalKey: selectedKey,
      selectedCanonicalClassGroupId: selectedCgId,
      editedCanonicalKey: editedKey,
      note,
      validationErrors: errors,
    })

    if (errors.length > 0) validationErrors.push(...errors.map(e => `CG#${cgId}: ${e}`))
  }

  // Summary
  const readyForC4 = !waitingForReview && validationErrors.length === 0
  const manualReviewRequired = waitingForReview ? decisions.filter(d => !d.action || d.action === 'keepUnmapped' || d.action === 'needsReview').length : 0

  console.log(`\n[results]`)
  console.log(`  decisions: ${decisions.length}`)
  console.log(`  accepted: ${acceptedCount}`)
  console.log(`  waitingForReview: ${waitingForReview}`)
  console.log(`  validationErrors: ${validationErrors.length}`)
  console.log(`  readyForC4Apply: ${readyForC4}`)
  console.log(`  manualReviewRequired: ${manualReviewRequired}`)

  if (validationErrors.length > 0) {
    console.log('\n[validation errors]')
    for (const e of validationErrors) console.log(`  ${e}`)
  }

  // Status
  const status = waitingForReview ? 'WAITING_FOR_USER_REVIEW' : (validationErrors.length > 0 ? 'VALIDATION_ERRORS' : 'READY_FOR_C4')

  // Save decisions
  const decisionsOutput = {
    stage: STAGE,
    workbookPath: WORKBOOK_PATH,
    status,
    totalDecisions: decisions.length,
    acceptedDecisions: acceptedCount,
    validationErrorCount: validationErrors.length,
    validationErrors,
    decisions: decisions.map(d => ({
      sourceClassGroupId: d.sourceClassGroupId,
      action: d.action,
      selectedCanonicalKey: d.selectedCanonicalKey,
      editedCanonicalKey: d.editedCanonicalKey,
      hasNote: !!d.note,
      errors: d.validationErrors,
    })),
  }
  writeFileSync(DECISIONS_PATH, JSON.stringify(decisionsOutput, null, 2), 'utf8')
  console.log(`\n[output] Decisions: ${DECISIONS_PATH}`)

  // Save readiness
  const readiness = {
    stage: STAGE,
    status,
    affectedSourceClassGroups: decisions.length,
    affectedTTCs: unmatchedTotal,
    acceptedDecisions: acceptedCount,
    readyForC4Apply: readyForC4,
    manualReviewRequired,
    note: waitingForReview ? 'Workbook has unfilled action columns. User must edit before C4.' : 'All decisions accepted. Ready for C4 apply.',
  }
  writeFileSync(READINESS_PATH, JSON.stringify(readiness, null, 2), 'utf8')
  console.log(`[output] Readiness: ${READINESS_PATH}`)

  console.log(`\n[status] ${status}`)
  if (status === 'WAITING_FOR_USER_REVIEW') {
    console.log('[action] User must edit the workbook and re-run this script.')
  } else if (status === 'READY_FOR_C4') {
    console.log('[action] Ready for L8-C4-CLASSGROUP-CANONICAL-CONTROLLED-SYNC-APPLY')
  }

  console.log('\n=== DONE ===')
}

main().catch(e => { console.error('FATAL:', e); process.exit(1) })
