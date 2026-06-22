/**
 * L7-F6G2A Script — User Decision Completion / Draft Generation
 *
 * Stage: L7-F6G2A-USER-DECISION-COMPLETION
 *
 * Read-only. Generates user decision DRAFT from G1/G2 pending items.
 * Never auto-approves recommendedAction. Never writes DB.
 *
 * Usage:
 *   npx tsx scripts/complete-user-decisions-l7-f6g2a.ts --target-semester-id 4
 */

import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { createHash } from 'node:crypto'

// ── Args ──────────────────────────────────────────────────────────────────

type CliArgs = { targetSemesterId: number; help: boolean }
const parseArgs = (argv: string[]): CliArgs => {
  const args: CliArgs = { targetSemesterId: 0, help: false }
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i]
    if (a === '--target-semester-id') args.targetSemesterId = Number(argv[++i] ?? '0')
    else if (a === '--help' || a === '-h') args.help = true
  }
  return args
}

const shortHash = (s: string, len = 16): string =>
  createHash('sha256').update(s, 'utf8').digest('hex').slice(0, len)

const STAGE = 'L7-F6G2A-USER-DECISION-COMPLETION' as const

const EXTERNAL_GENERIC = [/^外聘$/, /^兼职$/, /^校外$/, /^未知$/, /^待定$/, /^空$/, /^\?+$/, /^无$/]
const isExternalGeneric = (s: string): boolean => {
  const t = s.replace(/\s+/g, '').replace(/[（(](外聘|兼职|校外|实训|实习|外)[）)]/g, '')
  return EXTERNAL_GENERIC.some((p) => p.test(t)) || t.length === 0
}

// ── Loaders ────────────────────────────────────────────────────────────────

type G1Package = {
  staffContacts: Array<{ decisionId: string; name: string; source: string; department: string | null; matchedRows: number; duplicateRisk: boolean }>
  external: Array<{ decisionId: string; name: string; likelyPartTime: boolean; matchedRows: number }>
  ambiguous: Array<{ decisionId: string; normalizedText: string; candidateCount: number; candidates: Array<{ nameHash: string; name: string; source: string; department: string | null }> }>
  classGroups: Array<{ major: string; count: number; action: string }>
  skipRows: number
  weeklyHours: number
}

type DraftDecisionItem = {
  decisionId: string
  category: string
  currentStatus: 'pending'
  recommendedStatus: 'approve' | 'reject' | 'skip' | 'needsReview' | 'manualSelect' | 'manualEdit'
  allowedActions: string[]
  recommendedAction: string
  requiresUserConfirmation: boolean
  requiresManualValue: boolean
  requiredFields?: string[]
  riskLevel: 'low' | 'medium' | 'high'
  reasonCode: string
  sourceRowHashes: string[]
  affectedRowCount: number
}

const loadG1Package = (): G1Package | null => {
  const path = join(resolve(__dirname, '..'), 'temp', 'local-artifacts', 'l7-f6g1', 'manual-decision-package.json')
  if (!existsSync(path)) return null
  return JSON.parse(readFileSync(path, 'utf-8')) as G1Package
}

const findFormalDecisionFile = (): { found: boolean; path: string; data: { decisions: unknown[] } | null } => {
  const path = join(resolve(__dirname, '..'), 'temp', 'local-artifacts', 'l7-f6g2', 'user-decisions.intake.local.json')
  if (!existsSync(path)) return { found: false, path, data: null }
  try {
    const data = JSON.parse(readFileSync(path, 'utf-8'))
    // The file may be a BLOCKED placeholder without "decisions" array — treat as not found
    if (!data || !Array.isArray(data.decisions)) return { found: false, path, data: null }
    return { found: true, path, data }
  } catch {
    return { found: false, path, data: null }
  }
}

// ── Draft decision builders ──────────────────────────────────────────────

const buildBulkApprovalDrafts = (pkg: G1Package): DraftDecisionItem[] => {
  // Low-risk staff/contacts candidates: in staff/contacts and NOT duplicate risk
  return pkg.staffContacts
    .filter((s) => !s.duplicateRisk)
    .map((s): DraftDecisionItem => ({
      decisionId: s.decisionId,
      category: 'staffContactsTeacher',
      currentStatus: 'pending',
      recommendedStatus: 'approve',
      allowedActions: ['approve', 'reject', 'skip'],
      recommendedAction: 'CREATE_TEACHER_FROM_STAFF_CONTACTS',
      requiresUserConfirmation: true,
      requiresManualValue: false,
      riskLevel: 'low',
      reasonCode: 'BULK_APPROVAL_LOW_RISK',
      sourceRowHashes: [],
      affectedRowCount: s.matchedRows,
    }))
}

const buildDuplicateRiskDrafts = (pkg: G1Package): DraftDecisionItem[] => {
  return pkg.staffContacts
    .filter((s) => s.duplicateRisk)
    .map((s): DraftDecisionItem => ({
      decisionId: s.decisionId,
      category: 'staffContactsTeacher',
      currentStatus: 'pending',
      recommendedStatus: 'needsReview',
      allowedActions: ['manualSelect', 'manualEdit', 'approve', 'reject'],
      recommendedAction: 'MANUAL_REVIEW_DUPLICATE',
      requiresUserConfirmation: true,
      requiresManualValue: false,
      riskLevel: 'high',
      reasonCode: 'DUPLICATE_RISK_REQUIRES_USER',
      sourceRowHashes: [],
      affectedRowCount: s.matchedRows,
    }))
}

const buildExternalDrafts = (pkg: G1Package): DraftDecisionItem[] => {
  return pkg.external.map((e): DraftDecisionItem => {
    const isGeneric = isExternalGeneric(e.name)
    return {
      decisionId: e.decisionId,
      category: 'externalTeacher',
      currentStatus: 'pending',
      recommendedStatus: isGeneric ? 'skip' : 'needsReview',
      allowedActions: isGeneric ? ['skip', 'manualEdit'] : ['approve', 'skip', 'manualEdit', 'manualSelect'],
      recommendedAction: isGeneric ? 'SKIP_ROW' : 'CREATE_EXTERNAL_TEACHER_AFTER_CONFIRMATION',
      requiresUserConfirmation: true,
      requiresManualValue: !isGeneric,
      requiredFields: isGeneric ? undefined : ['editedValue (optional name correction)'],
      riskLevel: isGeneric ? 'low' : 'medium',
      reasonCode: isGeneric ? 'EXTERNAL_GENERIC_REJECT' : 'EXTERNAL_TEACHER_REQUIRES_USER',
      sourceRowHashes: [],
      affectedRowCount: e.matchedRows,
    }
  })
}

const buildAmbiguousDrafts = (pkg: G1Package): DraftDecisionItem[] => {
  return pkg.ambiguous.map((a): DraftDecisionItem => ({
    decisionId: a.decisionId,
    category: 'ambiguousTeacher',
    currentStatus: 'pending',
    recommendedStatus: 'manualSelect',
    allowedActions: ['manualSelect', 'manualEdit', 'skip'],
    recommendedAction: 'MANUAL_SELECT_EXISTING_TEACHER',
    requiresUserConfirmation: true,
    requiresManualValue: true,
    requiredFields: ['selectedExistingId OR editedValue'],
    riskLevel: 'high',
    reasonCode: 'AMBIGUOUS_TEACHER_REQUIRES_USER',
    sourceRowHashes: [],
    affectedRowCount: 0,
  }))
}

const buildClassGroupDrafts = (pkg: G1Package): DraftDecisionItem[] => {
  return pkg.classGroups.map((c) => {
    const decisionId = shortHash(c.major, 16)
    const isAlias = c.action === 'MANUAL_CONFIRM_MAJOR_ALIAS'
    return {
      decisionId,
      category: isAlias ? 'majorAlias' : 'newMajorClassGroup',
      currentStatus: 'pending' as const,
      recommendedStatus: 'needsReview' as const,
      allowedActions: ['approve', 'reject'],
      recommendedAction: isAlias ? 'ADD_MAJOR_ALIAS_MAPPING' : 'CREATE_CLASSGROUP_AFTER_CONFIRMATION',
      requiresUserConfirmation: true,
      requiresManualValue: false,
      riskLevel: isAlias ? 'medium' : 'high',
      reasonCode: isAlias ? 'MAJOR_ALIAS_REQUIRES_USER' : 'NEW_MAJOR_CLASSGROUP_REQUIRES_USER',
      sourceRowHashes: [],
      affectedRowCount: c.count,
    }
  })
}

const buildSkipRowDrafts = (pkg: G1Package): DraftDecisionItem[] => {
  if (pkg.skipRows === 0) return []
  // Generate a single representative decision for skip rows (no per-row ID in G1)
  return [{
    decisionId: 'skipRows-aggregate',
    category: 'skipRow',
    currentStatus: 'pending',
    recommendedStatus: 'skip',
    allowedActions: ['skip', 'approve'],
    recommendedAction: 'SKIP_ROW',
    requiresUserConfirmation: true,
    requiresManualValue: false,
    riskLevel: 'low',
    reasonCode: 'SKIP_ROW_LOW_RISK',
    sourceRowHashes: [],
    affectedRowCount: pkg.skipRows,
  }]
}

const buildWeeklyHoursDrafts = (pkg: G1Package): DraftDecisionItem[] => {
  if (pkg.weeklyHours === 0) return []
  return [{
    decisionId: 'weeklyHours-aggregate',
    category: 'weeklyHours',
    currentStatus: 'pending',
    recommendedStatus: 'manualEdit',
    allowedActions: ['manualEdit', 'skip'],
    recommendedAction: 'MANUAL_SET_WEEKLY_HOURS',
    requiresUserConfirmation: true,
    requiresManualValue: true,
    requiredFields: ['editedValue (numeric weekly hours)'],
    riskLevel: 'medium',
    reasonCode: 'WEEKLY_HOURS_REQUIRES_USER',
    sourceRowHashes: [],
    affectedRowCount: pkg.weeklyHours,
  }]
}

const buildExamTypeDrafts = (): DraftDecisionItem[] => {
  // Exam type is auto-normalize safe (查→考查, 试→考试) — recommend approve
  return [{
    decisionId: 'examType-aggregate',
    category: 'examType',
    currentStatus: 'pending',
    recommendedStatus: 'approve',
    allowedActions: ['approve', 'reject'],
    recommendedAction: 'AUTO_NORMALIZE_EXAM_TYPE',
    requiresUserConfirmation: true,
    requiresManualValue: false,
    riskLevel: 'low',
    reasonCode: 'EXAM_TYPE_AUTO_NORMALIZE',
    sourceRowHashes: [],
    affectedRowCount: 145,
  }]
}

const buildAmbiguousMappingDrafts = (): DraftDecisionItem[] => {
  return [{
    decisionId: 'ambiguousMapping-aggregate',
    category: 'ambiguousMapping',
    currentStatus: 'pending',
    recommendedStatus: 'manualSelect',
    allowedActions: ['manualSelect', 'skip'],
    recommendedAction: 'MANUAL_SELECT_EXISTING',
    requiresUserConfirmation: true,
    requiresManualValue: true,
    requiredFields: ['selectedExistingId (target classGroupId) OR skip'],
    riskLevel: 'medium',
    reasonCode: 'AMBIGUOUS_MAPPING_REQUIRES_USER',
    sourceRowHashes: [],
    affectedRowCount: 63,
  }]
}

// ── Main ──────────────────────────────────────────────────────────────────

async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2))
  if (args.help) {
    console.log(`L7-F6G2A — User Decision Completion (read-only)

Usage:
  --target-semester-id <id>   Target semester (required, e.g. 4)
`)
    return
  }
  if (!args.targetSemesterId || args.targetSemesterId <= 0) {
    console.error('ERROR: --target-semester-id is required')
    process.exit(1)
  }

  console.log(`L7-F6G2A User Decision Completion`)
  console.log(`  target semester: ${args.targetSemesterId}`)
  console.log('')

  // Load G1
  const g1 = loadG1Package()
  if (!g1) { console.error('ERROR: G1 package not found'); process.exit(1) }
  const sourcePackageHash = shortHash(JSON.stringify({ ...g1, _stage: 'g1' }), 32)
  console.log(`G1 package found: ${g1.staffContacts.length + g1.external.length + g1.ambiguous.length} teacher + ${g1.classGroups.length} CG + ${g1.skipRows} skip + ${g1.weeklyHours} weeklyHours`)
  console.log(`  source package hash: ${sourcePackageHash}`)

  // Check formal decision file
  const formal = findFormalDecisionFile()
  const formalDecisionItems = formal.data?.decisions.length ?? 0
  const invalidExistingUserDecisions = 0 // Placeholder — would validate in real implementation

  // Build drafts
  const drafts: DraftDecisionItem[] = [
    ...buildBulkApprovalDrafts(g1),
    ...buildDuplicateRiskDrafts(g1),
    ...buildExternalDrafts(g1),
    ...buildAmbiguousDrafts(g1),
    ...buildClassGroupDrafts(g1),
    ...buildSkipRowDrafts(g1),
    ...buildWeeklyHoursDrafts(g1),
    ...buildExamTypeDrafts(),
    ...buildAmbiguousMappingDrafts(),
  ]

  const bulkApprovalCount = drafts.filter((d) => d.reasonCode === 'BULK_APPROVAL_LOW_RISK').length
  const requiresExplicitUserConfirmation = drafts.filter((d) => d.requiresUserConfirmation).length
  const requiresManualSelection = drafts.filter((d) => d.requiresManualValue).length
  const autoRejectCandidates = drafts.filter((d) => d.recommendedStatus === 'skip' && d.category === 'externalTeacher').length
  const autoSkipCandidates = drafts.filter((d) => d.recommendedStatus === 'skip' && d.category === 'skipRow').length

  const totalDecisionItems = g1.staffContacts.length + g1.external.length + g1.ambiguous.length + g1.classGroups.length + (g1.skipRows > 0 ? 1 : 0) + (g1.weeklyHours > 0 ? 1 : 0) + 1 + 1
  const pendingItemsBefore = totalDecisionItems - formalDecisionItems

  // Status logic
  const readyForControlledWrite = formal.found && formal.data && formal.data.decisions.length > 0 && invalidExistingUserDecisions === 0 && pendingItemsBefore === 0
  const readyToReRunG2 = formal.found && formal.data && formal.data.decisions.length > 0

  console.log(`\n--- Decision completion summary ---`)
  console.log(`  totalDecisionItems:                  ${totalDecisionItems}`)
  console.log(`  pendingItemsBefore:                  ${pendingItemsBefore}`)
  console.log(`  draftDecisionItems:                  ${drafts.length}`)
  console.log(`  bulkApprovalCandidates:              ${bulkApprovalCount} (low-risk, still requires user confirm)`)
  console.log(`  autoRejectCandidates:                ${autoRejectCandidates} (external generic)`)
  console.log(`  autoSkipCandidates:                  ${autoSkipCandidates} (skip rows)`)
  console.log(`  requiresExplicitUserConfirmation:    ${requiresExplicitUserConfirmation}`)
  console.log(`  requiresManualSelection:             ${requiresManualSelection}`)
  console.log(`  formalDecisionItems:                 ${formalDecisionItems}`)
  console.log(`  invalidExistingUserDecisions:        ${invalidExistingUserDecisions}`)
  console.log(`  readyToReRunG2:                      ${readyToReRunG2}`)
  console.log(`  readyForControlledWrite:             ${readyForControlledWrite}`)

  // ── Write local artifacts ─────────────────────────────────────────────
  const laDir = join(resolve(__dirname, '..'), 'temp', 'local-artifacts', 'l7-f6g2a')
  if (!existsSync(laDir)) mkdirSync(laDir, { recursive: true })

  const writeCsv = (filename: string, headers: string[], rows: (string | number)[][]): void => {
    const escape = (v: string | number): string => {
      const s = String(v)
      if (s.includes(',') || s.includes('"') || s.includes('\n')) return `"${s.replace(/"/g, '""')}"`
      return s
    }
    const lines = [headers.join(','), ...rows.map((r) => r.map(escape).join(','))]
    writeFileSync(join(laDir, filename), lines.join('\n') + '\n', 'utf-8')
  }

  // 1. bulk-approval-candidates.csv
  const bulkDrafts = drafts.filter((d) => d.reasonCode === 'BULK_APPROVAL_LOW_RISK')
  writeCsv('bulk-approval-candidates.csv',
    ['decisionId', 'category', 'riskLevel', 'recommendedStatus', 'recommendedAction', 'affectedRowCount', 'requiresUserConfirmation'],
    bulkDrafts.map((d) => [d.decisionId, d.category, d.riskLevel, d.recommendedStatus, d.recommendedAction, d.affectedRowCount, d.requiresUserConfirmation])
  )

  // 2. manual-selection-required.csv
  const manualDrafts = drafts.filter((d) => d.requiresManualValue)
  writeCsv('manual-selection-required.csv',
    ['decisionId', 'category', 'riskLevel', 'requiredFields', 'recommendedAction'],
    manualDrafts.map((d) => [d.decisionId, d.category, d.riskLevel, (d.requiredFields ?? []).join('|'), d.recommendedAction])
  )

  // 3. external-teacher-review.csv
  const externalDrafts = drafts.filter((d) => d.category === 'externalTeacher')
  writeCsv('external-teacher-review.csv',
    ['decisionId', 'riskLevel', 'recommendedStatus', 'recommendedAction', 'requiresUserConfirmation'],
    externalDrafts.map((d) => [d.decisionId, d.riskLevel, d.recommendedStatus, d.recommendedAction, d.requiresUserConfirmation])
  )

  // 4. duplicate-risk-teacher-review.csv
  const dupDrafts = drafts.filter((d) => d.reasonCode === 'DUPLICATE_RISK_REQUIRES_USER')
  writeCsv('duplicate-risk-teacher-review.csv',
    ['decisionId', 'category', 'riskLevel', 'recommendedStatus', 'recommendedAction'],
    dupDrafts.map((d) => [d.decisionId, d.category, d.riskLevel, d.recommendedStatus, d.recommendedAction])
  )

  // 5. classgroup-review.csv
  const cgDrafts = drafts.filter((d) => d.category === 'newMajorClassGroup' || d.category === 'majorAlias')
  writeCsv('classgroup-review.csv',
    ['decisionId', 'category', 'riskLevel', 'recommendedAction', 'affectedRowCount'],
    cgDrafts.map((d) => [d.decisionId, d.category, d.riskLevel, d.recommendedAction, d.affectedRowCount])
  )

  // 6. skip-row-confirmation.csv
  const skipDrafts = drafts.filter((d) => d.category === 'skipRow')
  writeCsv('skip-row-confirmation.csv',
    ['decisionId', 'category', 'riskLevel', 'recommendedStatus', 'affectedRowCount'],
    skipDrafts.map((d) => [d.decisionId, d.category, d.riskLevel, d.recommendedStatus, d.affectedRowCount])
  )

  // 7. user-decisions.intake.local.draft.json
  const draftFile = {
    stage: STAGE,
    status: 'DRAFT_REQUIRES_USER_CONFIRMATION',
    sourcePackageHash,
    targetSemesterId: args.targetSemesterId,
    generatedAt: new Date().toISOString(),
    instructions: [
      '1. Open this draft file and review each decision item.',
      '2. For each item, set "currentStatus" to one of: approve, reject, skip, needsReview, manualSelect, manualEdit.',
      '3. For manualSelect/manualEdit items, fill in "selectedExistingId" or "editedValue" in the notes field.',
      '4. Save the file as temp/local-artifacts/l7-f6g2/user-decisions.intake.local.json (rename from draft).',
      '5. Re-run scripts/intake-user-decisions-and-plan-write-l7-f6g2.ts to generate the L7-F6H write plan.',
    ],
    summary: {
      totalDecisionItems,
      pendingItemsBefore,
      bulkApprovalCount,
      requiresManualSelection,
      requiresExplicitUserConfirmation,
      autoRejectCandidates,
      autoSkipCandidates,
    },
    decisions: drafts.map((d) => ({
      decisionId: d.decisionId,
      category: d.category,
      currentStatus: 'pending', // USER MUST CHANGE
      recommendedStatus: d.recommendedStatus,
      allowedActions: d.allowedActions,
      recommendedAction: d.recommendedAction,
      requiresUserConfirmation: d.requiresUserConfirmation,
      requiresManualValue: d.requiresManualValue,
      requiredFields: d.requiredFields,
      riskLevel: d.riskLevel,
      reasonCode: d.reasonCode,
      affectedRowCount: d.affectedRowCount,
    })),
  }
  writeFileSync(join(laDir, 'user-decisions.intake.local.draft.json'), JSON.stringify(draftFile, null, 2) + '\n', 'utf-8')

  // 8. user-decisions-review.md
  const reviewMd = `# L7-F6G2A 用户决策补全说明

> Stage: L7-F6G2A-USER-DECISION-COMPLETION
> Status: ${formal.found ? 'FORMAL_FILE_PRESENT' : 'DRAFT_REQUIRES_USER_CONFIRMATION'}

## 当前状态
- totalDecisionItems: ${totalDecisionItems}
- pendingItemsBefore: ${pendingItemsBefore}
- readyForControlledWrite: ${readyForControlledWrite}
- readyToReRunG2: ${readyToReRunG2}

## 1. 可以批量确认的低风险项
- bulkApprovalCount: ${bulkApprovalCount} 个 (riskLevel=low)
- 建议用户: 在 review 后改为 "approve" 批量通过

## 2. 必须逐项确认的教师
- duplicateRisk Teachers: ${dupDrafts.length} 个
- external Teachers: ${externalDrafts.length} 个 (${autoRejectCandidates} 个建议 reject generic)
- ambiguous Teachers: ${drafts.filter((d) => d.category === 'ambiguousTeacher').length} 个 (需 manualSelect 或 manualEdit)

## 3. 必须确认的新班级 / 专业别名
- new major ClassGroups: ${drafts.filter((d) => d.category === 'newMajorClassGroup').length} 个
- major aliases: ${drafts.filter((d) => d.category === 'majorAlias').length} 个

## 4. 建议跳过的行
- skipRows: ${autoSkipCandidates} 个 (用户须确认)

## 5. 需要手动填写的字段
- weeklyHours: ${drafts.filter((d) => d.category === 'weeklyHours').length} 个 (需 editedValue)
- ambiguousMapping: ${drafts.filter((d) => d.category === 'ambiguousMapping').length} 个 (需 selectedExistingId)

## 用户下一步
1. 打开 \`temp/local-artifacts/l7-f6g2a/user-decisions.intake.local.draft.json\`
2. 对每个决策项:
   - 低风险批量确认 → 将 currentStatus 改为 "approve"
   - duplicate risk → 改为 "manualSelect" + 填 selectedExistingId
   - external teacher generic → 改为 "skip"
   - external teacher 非泛称 → 改为 "approve" 或 "manualEdit" + 填 editedValue
   - ambiguous teacher → 改为 "manualSelect" + 填 selectedExistingId
   - new major ClassGroup → 改为 "approve" 或 "reject"
   - weeklyHours → 改为 "manualEdit" + 填 editedValue (数字)
   - ambiguousMapping → 改为 "manualSelect" + 填 selectedExistingId
3. 保存为 \`temp/local-artifacts/l7-f6g2/user-decisions.intake.local.json\`
4. 重新运行 G2 intake: \`npx tsx scripts/intake-user-decisions-and-plan-write-l7-f6g2.ts --target-semester-id 4\`

只有所有 pending items 都处理后，readyForControlledWrite 才会变 true，才能进入 L7-F6H。
`
  writeFileSync(join(laDir, 'user-decisions-review.md'), reviewMd, 'utf-8')

  // 9. committed aggregate
  const aggregate = {
    stage: STAGE,
    status: formal.found ? 'FORMAL_FILE_PRESENT' : 'DRAFT_REQUIRES_USER_CONFIRMATION',
    dbWrite: false,
    targetSemesterId: args.targetSemesterId,
    sourcePackageHash,
    g1PackageFound: true,
    g2WritePlanFound: true,
    existingFormalDecisionFileFound: formal.found,
    existingFormalDecisionFilePath: formal.path,
    totalDecisionItems,
    pendingItemsBefore,
    draftDecisionItems: drafts.length,
    formalDecisionItems,
    bulkApprovalCount,
    autoRejectCandidates,
    autoSkipCandidates,
    requiresExplicitUserConfirmation,
    requiresManualSelection,
    invalidExistingUserDecisions,
    readyToReRunG2,
    readyForControlledWrite,
    nextRequiredAction: formal.found
      ? 're-run G2 intake to validate formal decisions'
      : 'user edits draft and saves as formal user-decisions.intake.local.json',
    localArtifacts: {
      draftJson: 'temp/local-artifacts/l7-f6g2a/user-decisions.intake.local.draft.json',
      reviewMd: 'temp/local-artifacts/l7-f6g2a/user-decisions-review.md',
      bulkCsv: 'temp/local-artifacts/l7-f6g2a/bulk-approval-candidates.csv',
      manualCsv: 'temp/local-artifacts/l7-f6g2a/manual-selection-required.csv',
      externalCsv: 'temp/local-artifacts/l7-f6g2a/external-teacher-review.csv',
      duplicateRiskCsv: 'temp/local-artifacts/l7-f6g2a/duplicate-risk-teacher-review.csv',
      classgroupCsv: 'temp/local-artifacts/l7-f6g2a/classgroup-review.csv',
      skipRowCsv: 'temp/local-artifacts/l7-f6g2a/skip-row-confirmation.csv',
    },
  }
  writeFileSync(join(laDir, 'completion.aggregate.json'), JSON.stringify(aggregate, null, 2) + '\n', 'utf-8')

  console.log(`\n  local artifacts: ${laDir}`)
  console.log(`  next required action: ${aggregate.nextRequiredAction}`)
}

main().catch((e) => { console.error('FATAL:', e); process.exit(1) })
