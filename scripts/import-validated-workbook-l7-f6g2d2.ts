/**
 * L7-F6G2D2 Script — Reviewed Workbook Validation & Decision Expansion
 *
 * Stage: L7-F6G2D2-REVIEWED-WORKBOOK-VALIDATION-AND-REMAINING-DECISION-EXPANSION
 *
 * Read-only. Reads the reviewed workbook data (extracted via Python openpyxl),
 * validates all 325 decisions, and updates the formal decision file.
 * Does NOT write DB.
 */

import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { PrismaClient } from '@prisma/client'

const STAGE = 'L7-F6G2D2-REVIEWED-WORKBOOK-VALIDATION-AND-REMAINING-DECISION-EXPANSION' as const
const ROOT = resolve(__dirname, '..')

const readJson = <T>(path: string): T => JSON.parse(readFileSync(path, 'utf-8')) as T

type WorkbookRow = {
  category: string
  decisionId: string
  riskLevel?: string
  reasonCode?: string
  affectedRowCount?: number
  recommendedAction?: string
  recommendedStatus?: string
  teacherText?: string
  normalizedTeacherText?: string
  candidateCount?: number
  topCandidateTeacherId?: string | number
  topCandidateName?: string
  confidenceBand?: string
  suggestedAction?: string
  action: string
  selectedExistingId?: number | string
  editedValue?: string
  note?: string
}

type FormalDecision = {
  decisionId: string
  category: string
  decisionStatus: string
  approvedAction?: string
  selectedExistingId?: number
  editedValue?: string
  note?: string
  decidedBy?: string
  decidedAt?: string
}

type FormalFile = {
  stage: string
  targetSemesterId: number
  sourcePackageHash?: string
  decisionMode: string
  decidedItemCount: number
  pendingItemsRemain: boolean
  decisions: FormalDecision[]
}

const VALID_ACTIONS = ['approve', 'skip', 'manualSelect', 'manualEdit', 'needsReview']
const CATEGORIES_REQUIRING_NOTE = ['staffContactsTeacher', 'ambiguousTeacher', 'externalTeacher']

async function main(): Promise<void> {
  console.log(`L7-F6G2D2 Reviewed Workbook Validation & Decision Expansion`)
  console.log(`  stage: ${STAGE}\n`)

  const prisma = new PrismaClient()

  // Load DB teacher IDs for validation
  const teachers = await prisma.teacher.findMany({ select: { id: true } })
  const teacherIdSet = new Set(teachers.map(t => t.id))
  console.log(`Teachers in DB: ${teachers.length}`)

  // Load existing formal decisions
  const formalPath = join(ROOT, 'temp', 'local-artifacts', 'l7-f6g2', 'user-decisions.intake.local.json')
  const formalFile = readJson<FormalFile>(formalPath)
  const existingCompositeKeys = new Set<string>()
  for (const d of formalFile.decisions) existingCompositeKeys.add(`${d.category}:${d.decisionId}`)
  console.log(`Existing formal decisions: ${formalFile.decisions.length}`)

  // Load reviewed workbook data (extracted by Python openpyxl)
  const reviewDataPath = join(ROOT, 'temp', 'local-artifacts', 'l7-f6g2d', 'workbook-review-data.json')
  if (!existsSync(reviewDataPath)) {
    console.error('ERROR: workbook-review-data.json not found')
    console.error('  Run: python openpyxl extraction first')
    process.exit(1)
  }
  const workbookData = readJson<Record<string, WorkbookRow[]>>(reviewDataPath)

  // ── Validate all 325 rows ─────────────────────────────────────────────
  const acceptedDecisions: FormalDecision[] = []
  const invalidRows: Array<{ category: string; decisionId: string; reason: string }> = []
  const needsReviewRows: Array<{ category: string; decisionId: string; reason: string }> = []
  const now = new Date().toISOString()

  let rowsWithAction = 0
  let rowsMissingSelectedExistingId = 0
  let rowsMissingEditedValue = 0
  let invalidActions = 0
  let highRiskApproveMissingNote = 0
  let duplicateCompositeDecisionKeys = 0

  for (const [sheetName, rows] of Object.entries(workbookData)) {
    for (const row of rows) {
      const { category, decisionId, action } = row
      if (!decisionId || !category) continue
      rowsWithAction++

      // Check action validity
      if (!action || !VALID_ACTIONS.includes(action)) {
        invalidActions++
        invalidRows.push({ category, decisionId, reason: `invalid action: ${action}` })
        continue
      }

      // needsReview stays pending
      if (action === 'needsReview') {
        needsReviewRows.push({ category, decisionId, reason: 'needsReview — kept pending' })
        continue
      }

      // Check not overwriting existing
      const compositeKey = `${category}:${decisionId}`
      if (existingCompositeKeys.has(compositeKey)) {
        duplicateCompositeDecisionKeys++
        invalidRows.push({ category, decisionId, reason: 'already in formal file' })
        continue
      }

      // Validate per-action
      if (action === 'manualSelect') {
        const selId = typeof row.selectedExistingId === 'number' ? row.selectedExistingId : Number(row.selectedExistingId)
        if (!selId || !Number.isInteger(selId) || selId <= 0) {
          rowsMissingSelectedExistingId++
          invalidRows.push({ category, decisionId, reason: 'manualSelect missing or invalid selectedExistingId' })
          continue
        }
        if (!teacherIdSet.has(selId)) {
          invalidRows.push({ category, decisionId, reason: `selectedExistingId ${selId} not in Teacher table` })
          continue
        }
      }

      if (action === 'manualEdit') {
        const edVal = (row.editedValue ?? '').toString().trim()
        if (!edVal) {
          rowsMissingEditedValue++
          invalidRows.push({ category, decisionId, reason: 'manualEdit missing editedValue' })
          continue
        }
        if (category === 'weeklyHours') {
          const n = Number(edVal)
          if (!Number.isFinite(n) || n <= 0) {
            invalidRows.push({ category, decisionId, reason: `weeklyHours editedValue not positive numeric: ${edVal}` })
            continue
          }
        }
        if (category === 'ambiguousMapping') {
          invalidRows.push({ category, decisionId, reason: 'ambiguousMapping manualEdit not allowed — use manualSelect or skip' })
          continue
        }
      }

      if (action === 'approve') {
        if (CATEGORIES_REQUIRING_NOTE.includes(category) && !row.note) {
          highRiskApproveMissingNote++
          invalidRows.push({ category, decisionId, reason: `approve on high-risk ${category} requires note` })
          continue
        }
      }

      // Accept
      const decision: FormalDecision = {
        decisionId,
        category,
        decisionStatus: action,
        decidedBy: 'user-workbook-review',
        decidedAt: now,
        note: (row.note ?? '') || undefined,
      }
      if (action === 'approve') decision.approvedAction = row.recommendedAction || 'APPROVE'
      if (action === 'manualSelect') decision.selectedExistingId = typeof row.selectedExistingId === 'number' ? row.selectedExistingId : Number(row.selectedExistingId)
      if (action === 'manualEdit') decision.editedValue = (row.editedValue ?? '').toString().trim()
      if (action === 'skip') decision.approvedAction = 'SKIP_ROW'

      acceptedDecisions.push(decision)
      existingCompositeKeys.add(compositeKey)
    }
  }

  // ── Summary ────────────────────────────────────────────────────────────
  console.log('\n--- Workbook validation summary ---')
  console.log(`  rowsWithAction:                ${rowsWithAction}`)
  console.log(`  acceptedNewDecisions:          ${acceptedDecisions.length}`)
  console.log(`  needsReviewItems:              ${needsReviewRows.length}`)
  console.log(`  invalidRows:                   ${invalidRows.length}`)
  console.log(`  invalidActions:                ${invalidActions}`)
  console.log(`  rowsMissingSelectedExistingId:  ${rowsMissingSelectedExistingId}`)
  console.log(`  rowsMissingEditedValue:         ${rowsMissingEditedValue}`)
  console.log(`  highRiskApproveMissingNote:     ${highRiskApproveMissingNote}`)
  console.log(`  duplicateCompositeDecisionKeys: ${duplicateCompositeDecisionKeys}`)

  const formalDecisionCountBefore = formalFile.decisions.length
  const formalDecisionCountAfter = formalDecisionCountBefore + acceptedDecisions.length
  const totalDecisionItems = formalDecisionCountAfter + needsReviewRows.length
  const decidedItems = formalDecisionCountAfter
  const pendingItems = needsReviewRows.length
  const readyForControlledWrite = pendingItems === 0 && invalidRows.length === 0

  console.log(`\n--- G2 intake equivalent ---`)
  console.log(`  totalDecisionItems:            ${totalDecisionItems}`)
  console.log(`  decidedItems:                  ${decidedItems}`)
  console.log(`  pendingItems:                  ${pendingItems}`)
  console.log(`  readyForControlledWrite:       ${readyForControlledWrite}`)

  // ── Update formal decision file ────────────────────────────────────────
  if (acceptedDecisions.length > 0) {
    const updatedFormalFile: FormalFile = {
      ...formalFile,
      stage: STAGE,
      decisionMode: 'full-except-needsReview',
      decidedItemCount: formalDecisionCountAfter,
      pendingItemsRemain: pendingItems > 0,
      decisions: [...formalFile.decisions, ...acceptedDecisions],
    }
    writeFileSync(formalPath, JSON.stringify(updatedFormalFile, null, 2) + '\n', 'utf-8')
    console.log(`\nFormal decision file updated: ${formalPath}`)
    console.log(`  before: ${formalDecisionCountBefore}, after: ${formalDecisionCountAfter}`)
  }

  // ── Write local artifacts ──────────────────────────────────────────────
  const laDir = join(ROOT, 'temp', 'local-artifacts', 'l7-f6g2d')
  if (!existsSync(laDir)) mkdirSync(laDir, { recursive: true })

  // Accepted CSV
  const writeCsv = (filename: string, headers: string[], rows: Record<string, unknown>[]): void => {
    const lines = [headers.join(',')]
    for (const r of rows) {
      const cells = headers.map(h => {
        const v = r[h]
        if (v == null) return ''
        const s = String(v)
        return s.includes(',') || s.includes('"') ? `"${s.replace(/"/g, '""')}"` : s
      })
      lines.push(cells.join(','))
    }
    writeFileSync(join(laDir, filename), lines.join('\n') + '\n', 'utf-8')
  }

  writeCsv('workbook-import.accepted.local.csv',
    ['category', 'decisionId', 'action', 'selectedExistingId', 'editedValue'],
    acceptedDecisions.map(d => ({
      category: d.category,
      decisionId: d.decisionId,
      action: d.decisionStatus,
      selectedExistingId: d.selectedExistingId ?? '',
      editedValue: d.editedValue ?? '',
    }))
  )

  writeCsv('workbook-import.invalid.local.csv',
    ['category', 'decisionId', 'reason'],
    invalidRows
  )

  // Aggregate
  const aggregate = {
    stage: STAGE,
    status: readyForControlledWrite ? 'READY' : (pendingItems > 0 ? 'PARTIAL_REMAINING_NEEDS_REVIEW' : 'HAS_INVALID_ROWS'),
    dbWrite: false,
    totalDecisionItems,
    decidedItems,
    pendingItems,
    readyForControlledWrite,
    invalidActions,
    missingSelectedExistingId: rowsMissingSelectedExistingId,
    missingEditedValue: rowsMissingEditedValue,
    highRiskApproveMissingNote,
    duplicateCompositeDecisionKeys,
    needsReviewItems: needsReviewRows.length,
    blockingReasons: [
      ...(pendingItems > 0 ? ['REMAINING_NEEDS_REVIEW'] : []),
      ...(invalidRows.length > 0 ? ['INVALID_ROWS'] : []),
    ],
    localArtifacts: {
      acceptedCsv: 'temp/local-artifacts/l7-f6g2d/workbook-import.accepted.local.csv',
      invalidCsv: 'temp/local-artifacts/l7-f6g2d/workbook-import.invalid.local.csv',
    },
  }

  writeFileSync(join(laDir, 'workbook-validation-v2.aggregate.json'), JSON.stringify(aggregate, null, 2) + '\n', 'utf-8')

  console.log(`\nArtifacts: ${laDir}`)
  console.log(`  accepted: workbook-import.accepted.local.csv`)
  console.log(`  invalid:  workbook-import.invalid.local.csv`)
  console.log(`  aggregate: workbook-validation-v2.aggregate.json`)

  if (!readyForControlledWrite) {
    console.log(`\n  Blocking reasons: ${aggregate.blockingReasons.join(', ')}`)
    console.log(`  remaining needsReview items: ${needsReviewRows.length}`)
    for (const r of needsReviewRows) console.log(`    ${r.category}:${r.decisionId} — ${r.reason}`)
  }

  await prisma.$disconnect()
}

main().catch(async (e) => { console.error('FATAL:', e); try { await new PrismaClient().$disconnect() } catch {}; process.exit(1) })
