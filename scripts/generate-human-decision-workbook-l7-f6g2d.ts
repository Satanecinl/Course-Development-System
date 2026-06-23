/**
 * L7-F6G2D Script — Human Decision Workbook Generation
 *
 * Stage: L7-F6G2D-HUMAN-DECISION-WORKBOOK-GENERATION
 *
 * Read-only. Generates a local Excel workbook from the 325 remaining
 * pending composite decisions (after the 33 formal decisions from L7-F6G2B).
 * User edits the workbook to fill `action`, `selectedExistingId`, `editedValue`, `note`.
 *
 * Usage:
 *   npx tsx scripts/generate-human-decision-workbook-l7-f6g2d.ts --target-semester-id 4
 */

import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { createHash } from 'node:crypto'
import ExcelJS from 'exceljs'
import { PrismaClient } from '@prisma/client'

const STAGE = 'L7-F6G2D-HUMAN-DECISION-WORKBOOK-GENERATION' as const
const shortHash = (s: string, len = 16): string =>
  createHash('sha256').update(s, 'utf8').digest('hex').slice(0, len)

const parseArgs = (argv: string[]): { targetSemesterId: number; help: boolean } => {
  const args = { targetSemesterId: 0, help: false }
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i]
    if (a === '--target-semester-id') args.targetSemesterId = Number(argv[++i] ?? '0')
    else if (a === '--help' || a === '-h') args.help = true
  }
  return args
}

// ── Types ──────────────────────────────────────────────────────────────────

type DraftDecision = {
  decisionId: string
  category: string
  recommendedStatus: string
  recommendedAction: string
  reasonCode: string
  riskLevel: string
  requiresUserConfirmation: boolean
  requiresManualValue: boolean
  allowedActions: string[]
  requiredFields?: string[]
  affectedRowCount: number
}

type FormalFile = {
  stage: string
  decidedItemCount: number
  decisions: Array<{ decisionId: string; category: string; decisionStatus: string }>
}

type G1Package = {
  staffContacts: Array<{ decisionId: string; name: string; source: string; department: string | null; matchedRows: number; duplicateRisk: boolean }>
  external: Array<{ decisionId: string; name: string; likelyPartTime: boolean; matchedRows: number }>
  ambiguous: Array<{ decisionId: string; normalizedText: string; candidateCount: number; candidates: Array<{ nameHash: string; name: string; source: string; department: string | null }> }>
  classGroups: Array<{ major: string; count: number; action: string }>
  skipRows: number
  weeklyHours: number
}

// ── Loaders ────────────────────────────────────────────────────────────────

const loadDraft = (): DraftDecision[] => {
  const path = join(resolve(__dirname, '..'), 'temp', 'local-artifacts', 'l7-f6g2a', 'user-decisions.intake.local.draft.json')
  if (!existsSync(path)) throw new Error(`G2A draft not found: ${path}`)
  return (JSON.parse(readFileSync(path, 'utf-8')) as { decisions: DraftDecision[] }).decisions
}

const loadFormal = (): FormalFile => {
  const path = join(resolve(__dirname, '..'), 'temp', 'local-artifacts', 'l7-f6g2', 'user-decisions.intake.local.json')
  if (!existsSync(path)) throw new Error(`formal decision file not found: ${path}`)
  return JSON.parse(readFileSync(path, 'utf-8')) as FormalFile
}

const loadG1Package = (): G1Package => {
  const path = join(resolve(__dirname, '..'), 'temp', 'local-artifacts', 'l7-f6g1', 'manual-decision-package.json')
  if (!existsSync(path)) throw new Error(`G1 package not found: ${path}`)
  return JSON.parse(readFileSync(path, 'utf-8')) as G1Package
}

// ── Teacher text normalization ─────────────────────────────────────────────

const normalizeTeacherText = (s: string | null | undefined): string => {
  if (s == null) return ''
  return s.replace(/\s+/g, '').replace(/[（(](外聘|兼职|校外|实训|实习|外)[）)]/g, '').replace(/[（(][^）)]*[）)]/g, '').replace(/[、，,;；/／\\|]/g, '|').trim()
}

// ── Main ──────────────────────────────────────────────────────────────────

async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2))
  if (args.help) {
    console.log(`L7-F6G2D — Human Decision Workbook Generation (read-only)

Usage:
  --target-semester-id <id>   Target semester (required, e.g. 4)

Generates local Excel workbook for user review of 325 pending decisions.
`)
    return
  }
  if (!args.targetSemesterId || args.targetSemesterId <= 0) {
    console.error('ERROR: --target-semester-id is required')
    process.exit(1)
  }

  console.log(`L7-F6G2D Human Decision Workbook Generation`)
  console.log(`  target semester: ${args.targetSemesterId}`)
  console.log('')

  const draft = loadDraft()
  const formal = loadFormal()
  const g1 = loadG1Package()
  const prisma = new PrismaClient()

  // Build formal decided composite key set
  const formalKeys = new Set<string>()
  for (const d of formal.decisions) formalKeys.add(`${d.category}:${d.decisionId}`)

  // ── Identify pending (not in formal) ──────────────────────────────────
  const pending = draft.filter((d) => !formalKeys.has(`${d.category}:${d.decisionId}`))
  console.log(`G2A draft total:        ${draft.length}`)
  console.log(`Formal decided:         ${formal.decisions.length}`)
  console.log(`Pending (in workbook):  ${pending.length}`)

  // ── Load all teachers ──────────────────────────────────────────────────
  const teachers = await prisma.teacher.findMany({
    select: { id: true, name: true, department: true, employeeNo: true },
    orderBy: { id: 'asc' },
  })
  const teacherByNorm = new Map<string, { id: number; name: string; department: string | null }[]>()
  for (const t of teachers) {
    const norm = normalizeTeacherText(t.name)
    if (norm.length === 0) continue
    if (!teacherByNorm.has(norm)) teacherByNorm.set(norm, [])
    teacherByNorm.get(norm)!.push({ id: t.id, name: t.name, department: t.department })
  }
  console.log(`Teachers loaded:        ${teachers.length}`)

  // ── Build G1 lookup by category+decisionId ─────────────────────────────
  // G1 has: staffContacts (with name + duplicateRisk), external (with name), ambiguous (with normalizedText + candidates)
  const g1StaffById = new Map(g1.staffContacts.map((s) => [s.decisionId, s]))
  const g1ExternalById = new Map(g1.external.map((e) => [e.decisionId, e]))
  const g1AmbiguousById = new Map(g1.ambiguous.map((a) => [a.decisionId, a]))

  // ── Build pending rows by category ─────────────────────────────────────
  type Row = Record<string, string | number | null>

  const externalRows: Row[] = []
  const duplicateRiskRows: Row[] = []
  const ambiguousRows: Row[] = []
  const otherRows: Row[] = []
  const candidateDictRows: Row[] = []

  for (const d of pending) {
    const base = {
      category: d.category,
      decisionId: d.decisionId,
      riskLevel: d.riskLevel,
      reasonCode: d.reasonCode,
      affectedRowCount: d.affectedRowCount,
      recommendedAction: d.recommendedAction,
      recommendedStatus: d.recommendedStatus,
      action: '', // user fills
      selectedExistingId: null as number | null,
      editedValue: '' as string,
      note: '' as string,
    }

    if (d.category === 'externalTeacher') {
      const ext = g1ExternalById.get(d.decisionId)
      const teacherText = ext?.name ?? ''
      const norm = normalizeTeacherText(teacherText)
      const candidates = teacherByNorm.get(norm) ?? []
      const exactMatch = candidates.length > 0 ? candidates[0] : null
      // suggestedAction: exact match → manualSelect; generic → skip; else approve
      const isGeneric = /^(外聘|兼职|校外|未知|待定|空|无|\?+)$/.test(norm) || norm.length === 0
      const suggestedAction = exactMatch ? 'manualSelect' : isGeneric ? 'skip' : 'approve'
      externalRows.push({
        ...base,
        teacherText,
        normalizedTeacherText: norm,
        existingTeacherExactMatchId: exactMatch?.id ?? null,
        existingTeacherExactMatchName: exactMatch?.name ?? '',
        suggestedAction,
      })
      // Add to candidate dict
      if (candidates.length > 0) {
        candidates.forEach((c, idx) => {
          candidateDictRows.push({
            category: d.category,
            decisionId: d.decisionId,
            candidateRank: idx + 1,
            teacherId: c.id,
            teacherName: c.name,
            department: c.department ?? '',
            normalizedName: norm,
            score: idx === 0 ? 1.0 : 0.9,
            matchReason: 'exact-normalized-match',
          })
        })
      }
    } else if (d.category === 'staffContactsTeacher' && d.reasonCode === 'DUPLICATE_RISK_REQUIRES_USER') {
      const sc = g1StaffById.get(d.decisionId)
      const teacherText = sc?.name ?? ''
      const norm = normalizeTeacherText(teacherText)
      const candidates = teacherByNorm.get(norm) ?? []
      const topCandidate = candidates[0]
      const secondCandidate = candidates[1]
      const confidenceBand = candidates.length === 0 ? 'NO_SAFE_MATCH'
        : candidates.length === 1 ? 'EXACT_SINGLE'
        : topCandidate && secondCandidate ? 'EXACT_MULTI' : 'LOW_GAP'
      const suggestedAction = confidenceBand === 'EXACT_SINGLE' ? 'manualSelect' : 'needsReview'
      duplicateRiskRows.push({
        ...base,
        teacherText,
        normalizedTeacherText: norm,
        candidateCount: candidates.length,
        topCandidateTeacherId: topCandidate?.id ?? null,
        topCandidateName: topCandidate?.name ?? '',
        topCandidateDepartment: topCandidate?.department ?? '',
        topCandidateScore: topCandidate ? 1.0 : null,
        secondCandidateTeacherId: secondCandidate?.id ?? null,
        secondCandidateName: secondCandidate?.name ?? '',
        secondCandidateDepartment: secondCandidate?.department ?? '',
        secondCandidateScore: secondCandidate ? 0.9 : null,
        confidenceBand,
        suggestedAction,
      })
      candidates.forEach((c, idx) => {
        candidateDictRows.push({
          category: d.category,
          decisionId: d.decisionId,
          candidateRank: idx + 1,
          teacherId: c.id,
          teacherName: c.name,
          department: c.department ?? '',
          normalizedName: norm,
          score: idx === 0 ? 1.0 : 0.9,
          matchReason: 'exact-normalized-match',
        })
      })
    } else if (d.category === 'ambiguousTeacher') {
      const amb = g1AmbiguousById.get(d.decisionId)
      const teacherText = amb?.normalizedText ?? ''
      // For ambiguous, candidates come from G1 package
      const g1Candidates = amb?.candidates ?? []
      const confidenceBand = g1Candidates.length === 0 ? 'NO_SAFE_MATCH'
        : g1Candidates.length === 1 ? 'EXACT_SINGLE'
        : 'EXACT_MULTI'
      const suggestedAction = confidenceBand === 'EXACT_SINGLE' ? 'manualSelect' : 'needsReview'
      ambiguousRows.push({
        ...base,
        teacherText,
        normalizedTeacherText: teacherText,
        candidateCount: g1Candidates.length,
        topCandidateTeacherId: g1Candidates[0]?.nameHash ?? '',
        topCandidateName: g1Candidates[0]?.name ?? '',
        topCandidateDepartment: g1Candidates[0]?.department ?? '',
        topCandidateScore: g1Candidates[0] ? 1.0 : null,
        secondCandidateTeacherId: g1Candidates[1]?.nameHash ?? '',
        secondCandidateName: g1Candidates[1]?.name ?? '',
        secondCandidateDepartment: g1Candidates[1]?.department ?? '',
        secondCandidateScore: g1Candidates[1] ? 0.9 : null,
        confidenceBand,
        suggestedAction,
      })
      g1Candidates.forEach((c, idx) => {
        candidateDictRows.push({
          category: d.category,
          decisionId: d.decisionId,
          candidateRank: idx + 1,
          teacherId: c.nameHash, // hash for ambiguous (G1 package doesn't carry real Teacher.id)
          teacherName: c.name,
          department: c.department ?? '',
          normalizedName: teacherText,
          score: idx === 0 ? 1.0 : 0.9,
          matchReason: c.source,
        })
      })
    } else if (d.category === 'weeklyHours' || d.category === 'ambiguousMapping') {
      otherRows.push({
        ...base,
        sourceHint: d.category === 'weeklyHours' ? '19 rows with non-numeric weekly hours (need numeric editedValue)' : '63 rows with ambiguous merge remark (need selectedExistingId classGroupId)',
        suggestedAction: d.category === 'weeklyHours' ? 'manualEdit' : 'manualSelect',
      })
    }
  }

  console.log('')
  console.log(`Workbook rows:`)
  console.log(`  External_21:        ${externalRows.length}`)
  console.log(`  DuplicateRisk_204:   ${duplicateRiskRows.length}`)
  console.log(`  Ambiguous_98:        ${ambiguousRows.length}`)
  console.log(`  Other_2:             ${otherRows.length}`)
  console.log(`  Candidate_Dictionary: ${candidateDictRows.length}`)

  // ── Build workbook ──────────────────────────────────────────────────────
  const wb = new ExcelJS.Workbook()
  wb.creator = 'L7-F6G2D'
  wb.created = new Date()

  // 1. README
  const readme = wb.addWorksheet('README')
  readme.columns = [{ width: 120 }]
  readme.getCell('A1').value = 'L7-F6G2D 用户决策工作簿 - 使用说明'
  readme.getCell('A1').font = { bold: true, size: 14 }
  const readmeLines = [
    '',
    '本工作簿包含 325 个待用户确认的 composite decisions（来自 G2A draft，G2B 已确认 33 项）。',
    '',
    '【用户只允许编辑以下 4 列】',
    '  action              approve | skip | manualSelect | manualEdit | needsReview',
    '  selectedExistingId  当 action=manualSelect 时必填，必须是真实 Teacher ID',
    '  editedValue         当 action=manualEdit 时必填 (weeklyHours 必须是数字)',
    '  note                当 approve 高风险项时必须填写原因',
    '',
    '【action 含义】',
    '  approve     确认创建新教师或确认规则项',
    '  skip        跳过该决策/不导入该行',
    '  manualSelect 使用已有 Teacher ID (必须填 selectedExistingId)',
    '  manualEdit  使用 editedValue 修正文本',
    '  needsReview 暂不处理 (保持 pending)',
    '',
    '【sheet 说明】',
    '  Summary            概览统计',
    '  External_21        21 个非泛称外聘教师',
    '  DuplicateRisk_204  204 个 duplicate-risk 教师 (staff/contacts 同名不同部门)',
    '  Ambiguous_98       98 个多 token 教师文本',
    '  Other_2            1 个 weeklyHours + 1 个 ambiguousMapping',
    '  Candidate_Dictionary  候选 Teacher 列表',
    '  Export_Check        填写后由 import 脚本校验',
    '',
    '【完成后】',
    '  保存本文件，然后运行:',
    '  npx tsx scripts/import-human-decision-workbook-l7-f6g2d.ts --target-semester-id 4',
  ]
  readmeLines.forEach((line, i) => {
    readme.getCell(`A${i + 2}`).value = line
  })

  // 2. Summary
  const summary = wb.addWorksheet('Summary')
  const summaryData: Array<[string, string | number]> = [
    ['sourceOfTruthDecisionCount', draft.length],
    ['formalDecidedBefore', formal.decisions.length],
    ['pendingBefore', pending.length],
    ['externalPending', externalRows.length],
    ['duplicateRiskPending', duplicateRiskRows.length],
    ['ambiguousPending', ambiguousRows.length],
    ['weeklyHoursPending', otherRows.filter((r) => r.category === 'weeklyHours').length],
    ['ambiguousMappingPending', otherRows.filter((r) => r.category === 'ambiguousMapping').length],
    ['candidateDictionaryRows', candidateDictRows.length],
    ['readyForControlledWrite', false],
    ['workbookStage', 'L7-F6G2D'],
    ['generatedAt', new Date().toISOString()],
  ]
  summary.columns = [{ header: 'metric', key: 'metric', width: 40 }, { header: 'value', key: 'value', width: 30 }]
  summaryData.forEach((row) => summary.addRow({ metric: row[0], value: row[1] }))

  // 3. External_21
  const extSheet = wb.addWorksheet('External_21')
  const extCols = ['category', 'decisionId', 'riskLevel', 'reasonCode', 'affectedRowCount', 'recommendedAction', 'recommendedStatus', 'teacherText', 'normalizedTeacherText', 'existingTeacherExactMatchId', 'existingTeacherExactMatchName', 'suggestedAction', 'action', 'selectedExistingId', 'editedValue', 'note']
  extSheet.columns = extCols.map((c) => ({ header: c, key: c, width: 20 }))
  externalRows.forEach((r) => extSheet.addRow(r))

  // 4. DuplicateRisk_204
  const dupSheet = wb.addWorksheet('DuplicateRisk_204')
  const dupCols = ['category', 'decisionId', 'riskLevel', 'reasonCode', 'affectedRowCount', 'recommendedAction', 'recommendedStatus', 'teacherText', 'normalizedTeacherText', 'candidateCount', 'topCandidateTeacherId', 'topCandidateName', 'topCandidateDepartment', 'topCandidateScore', 'secondCandidateTeacherId', 'secondCandidateName', 'secondCandidateDepartment', 'secondCandidateScore', 'confidenceBand', 'suggestedAction', 'action', 'selectedExistingId', 'editedValue', 'note']
  dupSheet.columns = dupCols.map((c) => ({ header: c, key: c, width: 20 }))
  duplicateRiskRows.forEach((r) => dupSheet.addRow(r))

  // 5. Ambiguous_98
  const ambSheet = wb.addWorksheet('Ambiguous_98')
  ambSheet.columns = dupCols.map((c) => ({ header: c, key: c, width: 20 }))
  ambiguousRows.forEach((r) => ambSheet.addRow(r))

  // 6. Other_2
  const otherSheet = wb.addWorksheet('Other_2')
  const otherCols = ['category', 'decisionId', 'riskLevel', 'reasonCode', 'affectedRowCount', 'recommendedAction', 'recommendedStatus', 'sourceHint', 'suggestedAction', 'action', 'selectedExistingId', 'editedValue', 'note']
  otherSheet.columns = otherCols.map((c) => ({ header: c, key: c, width: 20 }))
  otherRows.forEach((r) => otherSheet.addRow(r))

  // 7. Candidate_Dictionary
  const candSheet = wb.addWorksheet('Candidate_Dictionary')
  candSheet.columns = ['category', 'decisionId', 'candidateRank', 'teacherId', 'teacherName', 'department', 'normalizedName', 'score', 'matchReason'].map((c) => ({ header: c, key: c, width: 20 }))
  candidateDictRows.forEach((r) => candSheet.addRow(r))

  // 8. Export_Check
  const exportSheet = wb.addWorksheet('Export_Check')
  const exportData: Array<[string, string | number]> = [
    ['rowsWithAction', '(filled by import script)'],
    ['rowsMissingRequiredSelectedExistingId', '(filled by import script)'],
    ['rowsMissingRequiredEditedValue', '(filled by import script)'],
    ['invalidActions', '(filled by import script)'],
    ['duplicateCompositeKeys', '(filled by import script)'],
    ['readyToImportWorkbook', '(filled by import script)'],
  ]
  exportSheet.columns = [{ header: 'metric', key: 'metric', width: 40 }, { header: 'value', key: 'value', width: 40 }]
  exportData.forEach((row) => exportSheet.addRow({ metric: row[0], value: row[1] }))

  // ── Write workbook ─────────────────────────────────────────────────────
  const laDir = join(resolve(__dirname, '..'), 'temp', 'local-artifacts', 'l7-f6g2d')
  if (!existsSync(laDir)) mkdirSync(laDir, { recursive: true })
  const workbookPath = join(laDir, 'user-decision-workbook.local.xlsx')
  await wb.xlsx.writeFile(workbookPath)
  console.log(`\nWorkbook written: ${workbookPath}`)

  // ── Write aggregate ────────────────────────────────────────────────────
  const aggregate = {
    stage: STAGE,
    status: 'WORKBOOK_GENERATED_WAITING_FOR_USER_EDIT',
    dbWrite: false,
    targetSemesterId: args.targetSemesterId,
    sourceOfTruthDecisionCount: draft.length,
    formalDecidedBefore: formal.decisions.length,
    pendingBefore: pending.length,
    externalPending: externalRows.length,
    duplicateRiskPending: duplicateRiskRows.length,
    ambiguousPending: ambiguousRows.length,
    weeklyHoursPending: otherRows.filter((r) => r.category === 'weeklyHours').length,
    ambiguousMappingPending: otherRows.filter((r) => r.category === 'ambiguousMapping').length,
    candidateDictionaryRows: candidateDictRows.length,
    sheets: ['README', 'Summary', 'External_21', 'DuplicateRisk_204', 'Ambiguous_98', 'Other_2', 'Candidate_Dictionary', 'Export_Check'],
    workbookPath: 'temp/local-artifacts/l7-f6g2d/user-decision-workbook.local.xlsx',
    workbookTracked: false,
    readyForControlledWrite: false,
    userActionRequired: 'edit workbook, then run import-human-decision-workbook-l7-f6g2d.ts',
  }
  writeFileSync(join(laDir, 'workbook-generation.aggregate.json'), JSON.stringify(aggregate, null, 2) + '\n', 'utf-8')
  writeFileSync(join(laDir, 'workbook-generation.raw.local.json'), JSON.stringify({
    ...aggregate,
    externalRows: externalRows.map((r) => ({ decisionId: r.decisionId, teacherTextHash: shortHash(String(r.teacherText ?? '')), suggestedAction: r.suggestedAction })),
    duplicateRiskRows: duplicateRiskRows.map((r) => ({ decisionId: r.decisionId, teacherTextHash: shortHash(String(r.teacherText ?? '')), confidenceBand: r.confidenceBand })),
    ambiguousRows: ambiguousRows.map((r) => ({ decisionId: r.decisionId, teacherTextHash: shortHash(String(r.teacherText ?? '')), confidenceBand: r.confidenceBand })),
  }, null, 2) + '\n', 'utf-8')
  console.log(`Aggregate: ${join(laDir, 'workbook-generation.aggregate.json')}`)

  await prisma.$disconnect()
}

main().catch(async (e) => {
  console.error('FATAL:', e)
  try { await new PrismaClient().$disconnect() } catch {}
  process.exit(1)
})
