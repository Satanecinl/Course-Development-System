/**
 * L7-F6G2B Script — Partial User Decision File Generation
 *
 * Stage: L7-F6G2B-PARTIAL-USER-DECISION-FILE-GENERATION
 *
 * Read-only. Generates a PARTIAL formal user decision file from the
 * L7-F6G2A draft. Only 33 low-risk items are confirmed:
 *   - 22 low-risk staff/contacts Teacher approve
 *   - 1 examType auto-normalize approve
 *   - 7 new major ClassGroup approve
 *   - 1 major alias approve
 *   - 1 generic external teacher skip
 *   - 1 skipRow aggregate skip
 *
 * All other items remain pending. Does NOT write DB.
 *
 * Usage:
 *   npx tsx scripts/generate-partial-user-decisions-l7-f6g2b.ts --target-semester-id 4
 */

import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { createHash } from 'node:crypto'

const STAGE = 'L7-F6G2B-PARTIAL-USER-DECISION-FILE-GENERATION' as const
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

type DraftDecision = {
  decisionId: string
  category: string
  currentStatus: string
  recommendedStatus: string
  allowedActions: string[]
  recommendedAction: string
  requiresUserConfirmation: boolean
  requiresManualValue: boolean
  reasonCode: string
  riskLevel: string
}

type DraftFile = {
  stage: string
  sourcePackageHash: string
  targetSemesterId: number
  decisions: DraftDecision[]
}

const loadDraft = (): DraftFile | null => {
  const path = join(resolve(__dirname, '..'), 'temp', 'local-artifacts', 'l7-f6g2a', 'user-decisions.intake.local.draft.json')
  if (!existsSync(path)) return null
  return JSON.parse(readFileSync(path, 'utf-8')) as DraftFile
}

// ── Main ──────────────────────────────────────────────────────────────────

async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2))
  if (args.help) {
    console.log(`L7-F6G2B — Partial User Decision File Generation (read-only)

Usage:
  --target-semester-id <id>   Target semester (required, e.g. 4)

Generates 33-item partial formal decision file from L7-F6G2A draft.
All other items remain pending. Does NOT write DB.
`)
    return
  }
  if (!args.targetSemesterId || args.targetSemesterId <= 0) {
    console.error('ERROR: --target-semester-id is required')
    process.exit(1)
  }

  console.log(`L7-F6G2B Partial User Decision File Generation`)
  console.log(`  target semester: ${args.targetSemesterId}`)
  console.log('')

  const draft = loadDraft()
  if (!draft) {
    console.error('ERROR: L7-F6G2A draft not found')
    console.error('  expected: temp/local-artifacts/l7-f6g2a/user-decisions.intake.local.draft.json')
    process.exit(1)
  }
  const sourcePackageHash = draft.sourcePackageHash
  const totalDraftDecisionItems = draft.decisions.length
  console.log(`G2A draft loaded: ${totalDraftDecisionItems} decisions`)

  // ── Composite key integrity check ──────────────────────────────────────
  const decisionIdCounts = new Map<string, number>()
  const compositeKeyCounts = new Map<string, number>()
  for (const d of draft.decisions) {
    decisionIdCounts.set(d.decisionId, (decisionIdCounts.get(d.decisionId) ?? 0) + 1)
    const ck = `${d.category}:${d.decisionId}`
    compositeKeyCounts.set(ck, (compositeKeyCounts.get(ck) ?? 0) + 1)
  }
  const duplicateDecisionIdAcrossCategoriesCount = Array.from(decisionIdCounts.values()).filter((c) => c > 1).length
  const duplicateDecisionCompositeKeyCount = Array.from(compositeKeyCounts.values()).filter((c) => c > 1).length
  console.log(`  duplicate decisionId across categories: ${duplicateDecisionIdAcrossCategoriesCount}`)
  console.log(`  duplicate composite key:                ${duplicateDecisionCompositeKeyCount}`)
  if (duplicateDecisionCompositeKeyCount > 0) {
    console.error('ERROR: duplicate (category, decisionId) composite key found — must fix draft before proceeding')
    process.exit(1)
  }
  console.log('')

  // ── Build 33 partial decisions ─────────────────────────────────────────
  // A. 22 low-risk staff/contacts Teacher
  const lowRiskStaff = draft.decisions.filter((d) =>
    d.category === 'staffContactsTeacher' &&
    d.reasonCode === 'BULK_APPROVAL_LOW_RISK' &&
    d.recommendedStatus === 'approve' &&
    d.recommendedAction === 'CREATE_TEACHER_FROM_STAFF_CONTACTS'
  )

  // B. 1 examType auto-normalize
  const examType = draft.decisions.filter((d) =>
    d.category === 'examType' &&
    (d.recommendedStatus === 'approve' || d.recommendedAction === 'AUTO_NORMALIZE_EXAM_TYPE') &&
    d.riskLevel === 'low'
  )

  // C. 7 new major ClassGroup (match by recommendedAction since the draft
  //    marks newClassGroup as needsReview rather than approve)
  const newMajorCG = draft.decisions.filter((d) =>
    d.category === 'newMajorClassGroup' &&
    d.recommendedAction === 'CREATE_CLASSGROUP_AFTER_CONFIRMATION' &&
    d.riskLevel === 'high'
  )

  // D. 1 major alias (match by recommendedAction)
  const majorAlias = draft.decisions.filter((d) =>
    d.category === 'majorAlias' &&
    d.recommendedAction === 'ADD_MAJOR_ALIAS_MAPPING' &&
    d.riskLevel === 'medium'
  )

  // E. 1 generic external teacher (skip)
  const externalGeneric = draft.decisions.filter((d) =>
    d.category === 'externalTeacher' &&
    d.reasonCode === 'EXTERNAL_GENERIC_REJECT' &&
    d.recommendedStatus === 'skip' &&
    d.recommendedAction === 'SKIP_ROW'
  )

  // F. 1 skipRow aggregate (skip)
  const skipRow = draft.decisions.filter((d) =>
    d.category === 'skipRow' &&
    d.recommendedStatus === 'skip'
  )

  console.log(`Partial decision counts:`)
  console.log(`  A. low-risk staff/contacts Teacher:    ${lowRiskStaff.length} (expected 22)`)
  console.log(`  B. examType auto-normalize:           ${examType.length} (expected 1)`)
  console.log(`  C. new major ClassGroup:              ${newMajorCG.length} (expected 7)`)
  console.log(`  D. major alias:                        ${majorAlias.length} (expected 1)`)
  console.log(`  E. generic external teacher skip:     ${externalGeneric.length} (expected 1)`)
  console.log(`  F. skipRow aggregate:                  ${skipRow.length} (expected 1)`)
  console.log('')

  // ── Validate counts match spec ─────────────────────────────────────────
  const expectedCounts = {
    A: { actual: lowRiskStaff.length, expected: 22, label: 'low-risk staff/contacts' },
    B: { actual: examType.length, expected: 1, label: 'examType' },
    C: { actual: newMajorCG.length, expected: 7, label: 'new major ClassGroup' },
    D: { actual: majorAlias.length, expected: 1, label: 'major alias' },
    E: { actual: externalGeneric.length, expected: 1, label: 'generic external teacher' },
    F: { actual: skipRow.length, expected: 1, label: 'skipRow aggregate' },
  }
  for (const [k, v] of Object.entries(expectedCounts)) {
    if (v.actual !== v.expected) {
      console.error(`ERROR: ${k}. ${v.label} count = ${v.actual}, expected ${v.expected}. STOP.`)
      process.exit(1)
    }
  }
  console.log(`All 6 partial decision count expectations met ✓`)
  console.log('')

  // ── Build formal decisions ────────────────────────────────────────────
  const now = new Date().toISOString()
  const formalDecisions = [
    ...lowRiskStaff.map((d) => ({
      decisionId: d.decisionId,
      category: 'staffContactsTeacher' as const,
      decisionStatus: 'approve' as const,
      approvedAction: 'CREATE_TEACHER_FROM_STAFF_CONTACTS' as const,
      decidedBy: 'architecture-review',
      decidedAt: now,
      note: 'L7-F6G2B conservative partial approval: low-risk staff/contacts teacher (single source, no duplicate risk, single department)',
    })),
    ...examType.map((d) => ({
      decisionId: d.decisionId,
      category: 'examType' as const,
      decisionStatus: 'approve' as const,
      approvedAction: 'AUTO_NORMALIZE_EXAM_TYPE' as const,
      decidedBy: 'architecture-review',
      decidedAt: now,
      note: 'L7-F6G2B conservative partial approval: examType auto-normalize (查/试 → 考查/考试)',
    })),
    ...newMajorCG.map((d) => ({
      decisionId: d.decisionId,
      category: 'newMajorClassGroup' as const,
      decisionStatus: 'approve' as const,
      approvedAction: 'CREATE_CLASSGROUP_AFTER_CONFIRMATION' as const,
      decidedBy: 'architecture-review',
      decidedAt: now,
      note: 'L7-F6G2B conservative partial approval: new major ClassGroup (major not in major DB but cohort+major+classNo has unique canonical key)',
    })),
    ...majorAlias.map((d) => ({
      decisionId: d.decisionId,
      category: 'majorAlias' as const,
      decisionStatus: 'approve' as const,
      approvedAction: 'ADD_MAJOR_ALIAS_MAPPING_AFTER_CONFIRMATION' as const,
      decidedBy: 'architecture-review',
      decidedAt: now,
      note: 'L7-F6G2B conservative partial approval: major alias (机电一体化五年制 → 机电一体化技术)',
    })),
    ...externalGeneric.map((d) => ({
      decisionId: d.decisionId,
      category: 'externalTeacher' as const,
      decisionStatus: 'skip' as const,
      approvedAction: 'SKIP_ROW' as const,
      decidedBy: 'architecture-review',
      decidedAt: now,
      note: 'L7-F6G2B conservative partial approval: skip generic external teacher (name is placeholder like 外聘/兼职/校外/未知, cannot create)',
    })),
    ...skipRow.map((d) => ({
      decisionId: d.decisionId,
      category: 'skipRow' as const,
      decisionStatus: 'skip' as const,
      approvedAction: 'SKIP_ROW' as const,
      decidedBy: 'architecture-review',
      decidedAt: now,
      note: 'L7-F6G2B conservative partial approval: skip 59 rows with no teacher and non-PE course',
    })),
  ]

  // ── Verify formal decisions do NOT contain forbidden items ────────────
  // Check that the 33 formal decisions do not include any of these:
  //   - duplicate-risk teachers (DUPLICATE_RISK_REQUIRES_USER)
  //   - ambiguous teachers
  //   - non-generic external teachers (EXTERNAL_TEACHER_REQUIRES_USER)
  //   - weeklyHours
  //   - ambiguousMapping
  const formalByCategory = new Map<string, number>()
  for (const d of formalDecisions) {
    formalByCategory.set(d.category, (formalByCategory.get(d.category) ?? 0) + 1)
  }
  const checkZero = (category: string, label: string) => {
    const count = formalByCategory.get(category) ?? 0
    if (count > 0) {
      console.error(`ERROR: ${label} count in formal = ${count}, expected 0`)
      process.exit(1)
    }
  }
  checkZero('ambiguousTeacher', 'ambiguous teacher')
  checkZero('weeklyHours', 'weeklyHours')
  checkZero('ambiguousMapping', 'ambiguousMapping')
  // For externalTeacher, only generic (1) should be present, not the 21 non-generic.
  // We already filtered by reasonCode=EXTERNAL_GENERIC_REJECT, so all external in formal
  // are the 1 generic skip. Verify by checking that the 21 non-generic are NOT in formal.
  const formalExternalIds = new Set(formalDecisions.filter((d) => d.category === 'externalTeacher').map((d) => d.decisionId))
  for (const d of draft.decisions) {
    if (d.category === 'externalTeacher' && d.reasonCode === 'EXTERNAL_TEACHER_REQUIRES_USER' && formalExternalIds.has(d.decisionId)) {
      console.error(`ERROR: non-generic external teacher ${d.decisionId} in formal decisions`)
      process.exit(1)
    }
  }
  // For staffContactsTeacher, the 22 in formal are the BULK_APPROVAL_LOW_RISK.
  // Verify that the 204 DUPLICATE_RISK are NOT in formal.
  const formalStaffIds = new Set(formalDecisions.filter((d) => d.category === 'staffContactsTeacher').map((d) => d.decisionId))
  for (const d of draft.decisions) {
    if (d.category === 'staffContactsTeacher' && d.reasonCode === 'DUPLICATE_RISK_REQUIRES_USER' && formalStaffIds.has(d.decisionId)) {
      console.error(`ERROR: duplicateRisk teacher ${d.decisionId} in formal decisions`)
      process.exit(1)
    }
  }
  console.log(`Verified: formal decisions contain NO forbidden items ✓`)
  console.log('')

  // ── Write formal partial decision file ────────────────────────────────
  const formalFile = {
    stage: STAGE,
    targetSemesterId: args.targetSemesterId,
    sourcePackageHash,
    decisionMode: 'partial',
    decidedItemCount: formalDecisions.length,
    pendingItemsRemain: true,
    generatedAt: now,
    decisions: formalDecisions,
  }
  const formalPath = join(resolve(__dirname, '..'), 'temp', 'local-artifacts', 'l7-f6g2', 'user-decisions.intake.local.json')
  writeFileSync(formalPath, JSON.stringify(formalFile, null, 2) + '\n', 'utf-8')
  console.log(`Formal partial decision file: ${formalPath}`)

  // ── Write aggregate ────────────────────────────────────────────────────
  const pendingItemsExpectedAfterPartialDecision = totalDraftDecisionItems - formalDecisions.length
  const aggregate = {
    stage: STAGE,
    status: 'PARTIAL_DECISIONS_PENDING',
    dbWrite: false,
    targetSemesterId: args.targetSemesterId,
    sourceDraftFound: true,
    sourcePackageHash,
    totalDraftDecisionItems,
    duplicateDecisionIdAcrossCategoriesCount,
    duplicateDecisionCompositeKeyCount,
    g2IntakeUsesCompositeKey: true,
    g2IntakeModified: true,
    lowRiskStaffContactsApproved: lowRiskStaff.length,
    examTypeApproved: examType.length,
    newMajorClassGroupApproved: newMajorCG.length,
    majorAliasApproved: majorAlias.length,
    genericExternalTeacherSkipped: externalGeneric.length,
    skipRowApproved: skipRow.length,
    totalFormalDecisionsWritten: formalDecisions.length,
    pendingItemsExpectedAfterPartialDecision,
    formalDecisionFilePath: formalPath,
    formalDecisionFileTracked: false, // gitignored
    readyForG2ReRun: true,
  }
  const aggPath = join(resolve(__dirname, '..'), 'temp', 'local-artifacts', 'l7-f6g2b', 'partial-decision-generation.aggregate.json')
  const laDir = join(resolve(__dirname, '..'), 'temp', 'local-artifacts', 'l7-f6g2b')
  if (!existsSync(laDir)) mkdirSync(laDir, { recursive: true })
  writeFileSync(aggPath, JSON.stringify(aggregate, null, 2) + '\n', 'utf-8')
  console.log(`Aggregate: ${aggPath}`)

  console.log('')
  console.log(`--- L7-F6G2B summary ---`)
  console.log(`  totalDraftDecisionItems:                ${totalDraftDecisionItems}`)
  console.log(`  duplicateDecisionIdAcrossCategories:     ${duplicateDecisionIdAcrossCategoriesCount}`)
  console.log(`  duplicateDecisionCompositeKey:            ${duplicateDecisionCompositeKeyCount}`)
  console.log(`  totalFormalDecisionsWritten:             ${formalDecisions.length}`)
  console.log(`  pendingItemsExpectedAfterPartialDecision: ${pendingItemsExpectedAfterPartialDecision}`)
  console.log(`  readyForG2ReRun:                          true`)
  console.log(`  readyForControlledWrite (after G2 rerun): false (pending > 0)`)
  console.log('')
  console.log(`  NEXT: re-run G2 intake to validate:`)
  console.log(`  npx tsx scripts/intake-user-decisions-and-plan-write-l7-f6g2.ts --target-semester-id 4`)
}

main().catch((e) => { console.error('FATAL:', e); process.exit(1) })
