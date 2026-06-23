/**
 * L7-F6G2D Script — Human Decision Workbook Import
 *
 * Stage: L7-F6G2D-HUMAN-DECISION-WORKBOOK-GENERATION
 *
 * Read-only. Reads the user-edited workbook and converts valid actions
 * into formal decisions. Preserves the existing 33 formal decisions.
 * Does NOT write DB.
 *
 * Usage:
 *   npx tsx scripts/import-human-decision-workbook-l7-f6g2d.ts --target-semester-id 4
 */

import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs'
import { join, resolve } from 'node:path'
import ExcelJS from 'exceljs'
import { PrismaClient } from '@prisma/client'

const STAGE = 'L7-F6G2D-HUMAN-DECISION-WORKBOOK-GENERATION' as const

const parseArgs = (argv: string[]): { targetSemesterId: number; help: boolean } => {
  const args = { targetSemesterId: 0, help: false }
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i]
    if (a === '--target-semester-id') args.targetSemesterId = Number(argv[++i] ?? '0')
    else if (a === '--help' || a === '-h') args.help = true
  }
  return args
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

// ── Main ──────────────────────────────────────────────────────────────────

async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2))
  if (args.help) {
    console.log(`L7-F6G2D — Human Decision Workbook Import (read-only)

Usage:
  --target-semester-id <id>   Target semester (required, e.g. 4)

Reads user-edited workbook, converts valid actions to formal decisions.
`)
    return
  }
  if (!args.targetSemesterId || args.targetSemesterId <= 0) {
    console.error('ERROR: --target-semester-id is required')
    process.exit(1)
  }

  console.log(`L7-F6G2D Workbook Import`)
  console.log(`  target semester: ${args.targetSemesterId}`)
  console.log('')

  const workbookPath = join(resolve(__dirname, '..'), 'temp', 'local-artifacts', 'l7-f6g2d', 'user-decision-workbook.local.xlsx')
  if (!existsSync(workbookPath)) {
    console.error(`ERROR: workbook not found: ${workbookPath}`)
    console.error('  Run generate-human-decision-workbook-l7-f6g2d.ts first.')
    process.exit(1)
  }

  // Load existing formal decisions (the 33 from G2B)
  const formalPath = join(resolve(__dirname, '..'), 'temp', 'local-artifacts', 'l7-f6g2', 'user-decisions.intake.local.json')
  if (!existsSync(formalPath)) {
    console.error(`ERROR: existing formal decision file not found: ${formalPath}`)
    process.exit(1)
  }
  const formalFile = JSON.parse(readFileSync(formalPath, 'utf-8')) as FormalFile
  console.log(`Existing formal decisions: ${formalFile.decisions.length}`)

  // Build existing composite key set (to avoid overwriting)
  const existingKeys = new Set<string>()
  for (const d of formalFile.decisions) existingKeys.add(`${d.category}:${d.decisionId}`)

  // Load workbook
  const wb = new ExcelJS.Workbook()
  await wb.xlsx.readFile(workbookPath)
  const prisma = new PrismaClient()

  // Load Teacher IDs for validation
  const teachers = await prisma.teacher.findMany({ select: { id: true } })
  const teacherIdSet = new Set(teachers.map((t) => t.id))
  console.log(`Teachers loaded for validation: ${teachers.length}`)

  // ── Process each decision sheet ────────────────────────────────────────
  const acceptedDecisions: FormalDecision[] = []
  const invalidRows: Array<{ category: string; decisionId: string; reason: string; row: Record<string, unknown> }> = []
  const acceptedRows: Array<{ category: string; decisionId: string; action: string }> = []
  let rowsWithAction = 0
  let rowsMissingSelectedExistingId = 0
  let rowsMissingEditedValue = 0
  let invalidActions = 0

  const processSheet = (sheetName: string, sheet: ExcelJS.Worksheet): void => {
    // Find the row with headers (row 1)
    const headerRow = sheet.getRow(1)
    const headers: string[] = []
    headerRow.eachCell((cell, colNumber) => {
      headers[colNumber] = String(cell.value ?? '')
    })

    const colIdx = (name: string): number => headers.indexOf(name)
    const getCell = (row: ExcelJS.Row, name: string): string => {
      const idx = colIdx(name)
      if (idx < 0) return ''
      const v = row.getCell(idx).value
      return v == null ? '' : String(v).trim()
    }

    for (let r = 2; r <= sheet.rowCount; r++) {
      const row = sheet.getRow(r)
      const category = getCell(row, 'category')
      const decisionId = getCell(row, 'decisionId')
      if (!decisionId || !category) continue

      const action = getCell(row, 'action')
      if (!action) continue // no action = pending, skip

      rowsWithAction++
      if (!VALID_ACTIONS.includes(action)) {
        invalidActions++
        invalidRows.push({ category, decisionId, reason: `invalid action: ${action}`, row: {} })
        continue
      }
      if (action === 'needsReview') continue // explicitly pending

      const selectedExistingIdStr = getCell(row, 'selectedExistingId')
      const editedValue = getCell(row, 'editedValue')
      const note = getCell(row, 'note')
      const recommendedAction = getCell(row, 'recommendedAction')

      // Validate per-action requirements
      if (action === 'manualSelect') {
        if (!selectedExistingIdStr) {
          rowsMissingSelectedExistingId++
          invalidRows.push({ category, decisionId, reason: 'manualSelect requires selectedExistingId', row: {} })
          continue
        }
        const id = Number(selectedExistingIdStr)
        if (!Number.isInteger(id) || !teacherIdSet.has(id)) {
          invalidRows.push({ category, decisionId, reason: `selectedExistingId ${id} not in Teacher table`, row: {} })
          continue
        }
      }
      if (action === 'manualEdit') {
        if (!editedValue) {
          rowsMissingEditedValue++
          invalidRows.push({ category, decisionId, reason: 'manualEdit requires editedValue', row: {} })
          continue
        }
        if (category === 'weeklyHours') {
          const n = Number(editedValue)
          if (!Number.isFinite(n) || n <= 0) {
            invalidRows.push({ category, decisionId, reason: `weeklyHours editedValue not positive numeric: ${editedValue}`, row: {} })
            continue
          }
        }
        if (category === 'ambiguousMapping') {
          invalidRows.push({ category, decisionId, reason: 'ambiguousMapping manualEdit not allowed — use manualSelect or skip', row: {} })
          continue
        }
      }
      if (action === 'approve') {
        // High-risk categories require note
        if (category === 'staffContactsTeacher' || category === 'ambiguousTeacher' || category === 'externalTeacher') {
          if (!note) {
            invalidRows.push({ category, decisionId, reason: `approve on high-risk category ${category} requires note`, row: {} })
            continue
          }
        }
      }

      // Check not overwriting existing
      const compositeKey = `${category}:${decisionId}`
      if (existingKeys.has(compositeKey)) {
        invalidRows.push({ category, decisionId, reason: 'decision already exists in formal file — cannot overwrite', row: {} })
        continue
      }

      // Accept
      const decision: FormalDecision = {
        decisionId,
        category,
        decisionStatus: action,
        decidedBy: 'user-workbook',
        decidedAt: new Date().toISOString(),
        note: note || undefined,
      }
      if (action === 'approve') decision.approvedAction = recommendedAction || 'APPROVE'
      if (action === 'manualSelect') decision.selectedExistingId = Number(selectedExistingIdStr)
      if (action === 'manualEdit') decision.editedValue = editedValue
      if (action === 'skip') decision.approvedAction = 'SKIP_ROW'

      acceptedDecisions.push(decision)
      acceptedRows.push({ category, decisionId, action })
      existingKeys.add(compositeKey) // prevent dupes within workbook
    }
  }

  for (const sheetName of ['External_21', 'DuplicateRisk_204', 'Ambiguous_98', 'Other_2']) {
    const sheet = wb.getWorksheet(sheetName)
    if (!sheet) continue
    processSheet(sheetName, sheet)
  }

  // ── Summary ─────────────────────────────────────────────────────────────
  console.log('')
  console.log(`--- Workbook import summary ---`)
  console.log(`  rowsWithAction:                ${rowsWithAction}`)
  console.log(`  acceptedNewDecisions:          ${acceptedDecisions.length}`)
  console.log(`  invalidRows:                   ${invalidRows.length}`)
  console.log(`  rowsMissingSelectedExistingId:  ${rowsMissingSelectedExistingId}`)
  console.log(`  rowsMissingEditedValue:         ${rowsMissingEditedValue}`)
  console.log(`  invalidActions:                ${invalidActions}`)

  const acceptedNewDecisions = acceptedDecisions.length
  const status = acceptedNewDecisions === 0 ? 'WAITING_FOR_USER_WORKBOOK_EDIT' : 'WORKBOOK_IMPORTED'
  const formalDecisionCountBefore = formalFile.decisions.length
  const formalDecisionCountAfter = formalDecisionCountBefore + acceptedNewDecisions

  // ── Write output ────────────────────────────────────────────────────────
  const laDir = join(resolve(__dirname, '..'), 'temp', 'local-artifacts', 'l7-f6g2d')
  if (!existsSync(laDir)) mkdirSync(laDir, { recursive: true })

  // Write accepted/invalid CSVs (local)
  const writeCsv = (filename: string, headers: string[], rows: Record<string, unknown>[]): void => {
    const lines = [headers.join(',')]
    for (const r of rows) {
      const cells = headers.map((h) => {
        const v = r[h]
        if (v == null) return ''
        const s = String(v)
        return s.includes(',') || s.includes('"') || s.includes('\n') ? `"${s.replace(/"/g, '""')}"` : s
      })
      lines.push(cells.join(','))
    }
    writeFileSync(join(laDir, filename), lines.join('\n') + '\n', 'utf-8')
  }
  writeCsv('workbook-import.accepted.local.csv', ['category', 'decisionId', 'action'], acceptedRows)
  writeCsv('workbook-import.invalid.local.csv', ['category', 'decisionId', 'reason'], invalidRows.map((r) => ({ category: r.category, decisionId: r.decisionId, reason: r.reason })))

  // Write aggregate
  const aggregate = {
    stage: STAGE,
    status,
    dbWrite: false,
    targetSemesterId: args.targetSemesterId,
    workbookHadUserEdits: rowsWithAction > 0,
    rowsWithAction,
    acceptedNewDecisions,
    invalidRows: invalidRows.length,
    rowsMissingSelectedExistingId,
    rowsMissingEditedValue,
    invalidActions,
    formalDecisionCountBefore,
    formalDecisionCountAfter,
    pendingAfterImport: 325 - acceptedNewDecisions,
    readyForControlledWrite: false, // will remain false until G2 intake rerun confirms
    duplicateCompositeKeys: 0, // enforced by existingKeys check
  }
  writeFileSync(join(laDir, 'workbook-import.aggregate.json'), JSON.stringify(aggregate, null, 2) + '\n', 'utf-8')

  // ── Update formal decision file ONLY if accepted > 0 ────────────────────
  if (acceptedNewDecisions > 0) {
    const updatedFormalFile: FormalFile = {
      ...formalFile,
      stage: STAGE, // transfer ownership to G2D
      decisionMode: formalFile.decisionMode === 'partial' ? 'partial-extended' : 'partial',
      decidedItemCount: formalDecisionCountAfter,
      pendingItemsRemain: true,
      decisions: [...formalFile.decisions, ...acceptedDecisions],
    }
    writeFileSync(formalPath, JSON.stringify(updatedFormalFile, null, 2) + '\n', 'utf-8')
    console.log(`\nFormal decision file updated: ${formalPath}`)
    console.log(`  before: ${formalDecisionCountBefore}, after: ${formalDecisionCountAfter}`)
    console.log(`  NEXT: re-run G2 intake:`)
    console.log(`  npx tsx scripts/intake-user-decisions-and-plan-write-l7-f6g2.ts --target-semester-id 4`)
  } else {
    console.log(`\n  No new decisions accepted (workbook not yet edited or all invalid).`)
    console.log(`  Formal decision file unchanged (${formalDecisionCountBefore}).`)
    console.log(`  status: ${status}`)
  }

  await prisma.$disconnect()
}

main().catch(async (e) => {
  console.error('FATAL:', e)
  try { await new PrismaClient().$disconnect() } catch {}
  process.exit(1)
})
