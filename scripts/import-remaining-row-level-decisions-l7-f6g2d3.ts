/**
 * L7-F6G2D3 Script — Import Remaining Row-Level Decisions
 *
 * Stage: L7-F6G2D3-REMAINING-DECISION-ROW-LEVEL-EXPANSION
 *
 * Read-only. Imports user-edited remaining-row-level-decisions workbook
 * and merges row-level decisions into the formal decision file.
 * Does NOT write DB.
 *
 * Usage:
 *   npx tsx scripts/import-remaining-row-level-decisions-l7-f6g2d3.ts --target-semester-id 4 [--dry-run]
 */

import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs'
import { join, resolve } from 'node:path'
import ExcelJS from 'exceljs'
import { PrismaClient } from '@prisma/client'

const STAGE = 'L7-F6G2D3-REMAINING-DECISION-ROW-LEVEL-EXPANSION' as const

const parseArgs = (argv: string[]): { targetSemesterId: number; dryRun: boolean; help: boolean } => {
  const args = { targetSemesterId: 0, dryRun: false, help: false }
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i]
    if (a === '--target-semester-id') args.targetSemesterId = Number(argv[++i] ?? '0')
    else if (a === '--dry-run') args.dryRun = true
    else if (a === '--help' || a === '-h') args.help = true
  }
  return args
}

const VALID_ACTIONS = ['approve', 'skip', 'manualSelect', 'manualEdit', 'needsReview']

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
  rowDecisionId?: string
  sourceRowHash?: string
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

async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2))
  if (args.help) {
    console.log(`L7-F6G2D3 — Import Remaining Row-Level Decisions (read-only)

Usage:
  --target-semester-id <id>   Target semester (required)
  --dry-run                    Validate without updating formal file
`)
    return
  }
  if (!args.targetSemesterId || args.targetSemesterId <= 0) {
    console.error('ERROR: --target-semester-id is required')
    process.exit(1)
  }

  console.log(`L7-F6G2D3 Import Remaining Row-Level Decisions`)
  console.log(`  target semester: ${args.targetSemesterId}`)
  console.log(`  mode: ${args.dryRun ? 'dry-run' : 'apply'}`)
  console.log('')

  const prisma = new PrismaClient()

  // Load workbook
  const workbookPath = join(resolve(__dirname, '..'), 'temp', 'local-artifacts', 'l7-f6g2d3', 'remaining-row-level-decisions.local.xlsx')
  if (!existsSync(workbookPath)) {
    console.error(`ERROR: workbook not found: ${workbookPath}`)
    console.error('  Run expand-remaining-decisions-l7-f6g2d3.ts first.')
    process.exit(1)
  }
  const wb = new ExcelJS.Workbook()
  await wb.xlsx.readFile(workbookPath)

  // Load existing formal decision file
  const formalPath = join(resolve(__dirname, '..'), 'temp', 'local-artifacts', 'l7-f6g2', 'user-decisions.intake.local.json')
  if (!existsSync(formalPath)) {
    console.error(`ERROR: formal decision file not found: ${formalPath}`)
    process.exit(1)
  }
  const formalFile = JSON.parse(readFileSync(formalPath, 'utf-8')) as FormalFile
  console.log(`Existing formal decisions: ${formalFile.decisions.length}`)

  // Build existing composite key set (composite or row decisionId)
  const existingKeys = new Set<string>()
  for (const d of formalFile.decisions) {
    if (d.rowDecisionId) {
      existingKeys.add(`row:${d.rowDecisionId}`)
    } else {
      existingKeys.add(`${d.category}:${d.decisionId}`)
    }
  }

  // Load Teacher and ClassGroup IDs for validation
  const teachers = await prisma.teacher.findMany({ select: { id: true } })
  const teacherIdSet = new Set(teachers.map(t => t.id))
  const classGroups = await prisma.classGroup.findMany({ where: { semesterId: 4 }, select: { id: true } })
  const classGroupIdSet = new Set(classGroups.map(cg => cg.id))

  const acceptedDecisions: FormalDecision[] = []
  const invalidRows: Array<{ rowDecisionId: string; reason: string }> = []
  let rowsWithAction = 0
  let needsReviewCount = 0

  const processSheet = (sheetName: string, category: string, expectedIdType: 'teacher' | 'classGroup'): void => {
    const sheet = wb.getWorksheet(sheetName)
    if (!sheet) return
    const hdr = sheet.getRow(1)
    const headers: string[] = []
    hdr.eachCell((cell, col) => { headers[col] = String(cell.value ?? '') })
    const colIdx = (name: string): number => headers.indexOf(name)
    const getCell = (row: ExcelJS.Row, name: string): string => {
      const idx = colIdx(name)
      if (idx < 0) return ''
      const v = row.getCell(idx).value
      return v == null ? '' : String(v).trim()
    }

    for (let r = 2; r <= sheet.rowCount; r++) {
      const row = sheet.getRow(r)
      const rowDecisionId = getCell(row, 'rowDecisionId')
      if (!rowDecisionId) continue
      const action = getCell(row, 'action')
      if (!action) continue
      rowsWithAction++
      if (action === 'needsReview') {
        needsReviewCount++
        continue
      }
      if (!VALID_ACTIONS.includes(action)) {
        invalidRows.push({ rowDecisionId, reason: `invalid action: ${action}` })
        continue
      }

      const selIdStr = getCell(row, 'selectedExistingId')
      const editedValue = getCell(row, 'editedValue')
      const note = getCell(row, 'note')

      if (action === 'manualSelect') {
        if (!selIdStr) {
          invalidRows.push({ rowDecisionId, reason: 'manualSelect requires selectedExistingId' })
          continue
        }
        const id = Number(selIdStr)
        if (!Number.isInteger(id) || id <= 0) {
          invalidRows.push({ rowDecisionId, reason: `invalid selectedExistingId: ${selIdStr}` })
          continue
        }
        if (expectedIdType === 'teacher' && !teacherIdSet.has(id)) {
          invalidRows.push({ rowDecisionId, reason: `Teacher ID ${id} not in DB` })
          continue
        }
        if (expectedIdType === 'classGroup' && !classGroupIdSet.has(id)) {
          invalidRows.push({ rowDecisionId, reason: `ClassGroup ID ${id} not in DB` })
          continue
        }
      }

      if (action === 'manualEdit' && !editedValue) {
        invalidRows.push({ rowDecisionId, reason: 'manualEdit requires editedValue' })
        continue
      }

      // Check duplicate
      const key = `row:${rowDecisionId}`
      if (existingKeys.has(key)) {
        invalidRows.push({ rowDecisionId, reason: 'already exists in formal file' })
        continue
      }

      const decision: FormalDecision = {
        decisionId: rowDecisionId,
        category,
        decisionStatus: action,
        rowDecisionId,
        decidedBy: 'user-row-level-workbook',
        decidedAt: new Date().toISOString(),
        note: note || undefined,
      }
      if (action === 'manualSelect') decision.selectedExistingId = Number(selIdStr)
      if (action === 'manualEdit') decision.editedValue = editedValue
      if (action === 'approve') decision.approvedAction = 'APPROVE'
      if (action === 'skip') decision.approvedAction = 'SKIP_ROW'

      acceptedDecisions.push(decision)
      existingKeys.add(key)
    }
  }

  processSheet('AmbiguousTeacher_5', 'ambiguousTeacher', 'teacher')
  processSheet('AmbiguousMapping_63', 'ambiguousMapping', 'classGroup')

  // ── Summary ────────────────────────────────────────────────────────────
  const formalDecisionCountBefore = formalFile.decisions.length
  const formalDecisionCountAfter = formalDecisionCountBefore + acceptedDecisions.length

  console.log('\n--- Import summary ---')
  console.log(`  rowsWithAction:                ${rowsWithAction}`)
  console.log(`  acceptedNewRowDecisions:       ${acceptedDecisions.length}`)
  console.log(`  invalidRows:                   ${invalidRows.length}`)
  console.log(`  needsReviewItems:              ${needsReviewCount}`)
  console.log(`  formalDecisionCountBefore:     ${formalDecisionCountBefore}`)
  console.log(`  formalDecisionCountAfter:      ${formalDecisionCountAfter}`)

  const status = acceptedDecisions.length === 0 && needsReviewCount === 0 && invalidRows.length === 0
    ? 'READY_TO_RERUN_G2'
    : acceptedDecisions.length === 0
      ? 'WAITING_FOR_USER_WORKBOOK_EDIT'
      : 'PARTIAL'

  // ── Update formal file (only if apply mode) ─────────────────────────
  if (!args.dryRun && acceptedDecisions.length > 0) {
    const updatedFormalFile: FormalFile = {
      ...formalFile,
      stage: STAGE,
      decisionMode: 'row-level-extended',
      decidedItemCount: formalDecisionCountAfter,
      pendingItemsRemain: needsReviewCount > 0,
      decisions: [...formalFile.decisions, ...acceptedDecisions],
    }
    writeFileSync(formalPath, JSON.stringify(updatedFormalFile, null, 2) + '\n', 'utf-8')
    console.log(`\nFormal file updated: ${formalPath}`)
    console.log(`  before: ${formalDecisionCountBefore}, after: ${formalDecisionCountAfter}`)
  } else if (args.dryRun) {
    console.log('\n  [dry-run] No formal file update.')
  } else {
    console.log('\n  No new decisions to add.')
  }

  // Write local artifacts
  const laDir = join(resolve(__dirname, '..'), 'temp', 'local-artifacts', 'l7-f6g2d3')
  if (!existsSync(laDir)) mkdirSync(laDir, { recursive: true })
  const aggregate = {
    stage: STAGE,
    status,
    dbWrite: false,
    mode: args.dryRun ? 'dry-run' : 'apply',
    rowsWithAction,
    acceptedNewRowDecisions: acceptedDecisions.length,
    needsReviewItems: needsReviewCount,
    invalidRows: invalidRows.length,
    formalDecisionCountBefore,
    formalDecisionCountAfter,
    pendingItemsRemaining: needsReviewCount,
  }
  writeFileSync(join(laDir, 'import-aggregate.json'), JSON.stringify(aggregate, null, 2) + '\n', 'utf-8')

  await prisma.$disconnect()
}

main().catch(async (e) => { console.error('FATAL:', e); try { await new PrismaClient().$disconnect() } catch {}; process.exit(1) })
