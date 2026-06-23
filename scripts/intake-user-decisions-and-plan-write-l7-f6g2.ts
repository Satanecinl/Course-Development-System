/**
 * L7-F6G2 Script — User Decision Intake & Write Plan
 *
 * Stage: L7-F6G2-USER-DECISION-INTAKE-AND-WRITE-PLAN
 *
 * Read-only. Reads L7-F6G1 user decision package, ingests user decisions
 * (if provided), and generates L7-F6H controlled-write plan.
 *
 * Hard rules:
 *   - No DB write. No apply. No backup.
 *   - No prisma write / create / update / delete / upsert / executeRaw.
 *   - If no user decisions provided → BLOCKED_WAITING_FOR_USER_DECISIONS.
 *   - recommendedAction NEVER treated as approval.
 *   - Existing Teacher/ClassGroup rows must be respected (no duplicate create).
 *
 * Usage:
 *   npx tsx scripts/intake-user-decisions-and-plan-write-l7-f6g2.ts \
 *     --target-semester-id 4
 */

import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { createHash } from 'node:crypto'

// ── Args ──────────────────────────────────────────────────────────────────

type CliArgs = {
  targetSemesterId: number
  decisionFile: string
  help: boolean
}

const parseArgs = (argv: string[]): CliArgs => {
  const args: CliArgs = { targetSemesterId: 0, decisionFile: '', help: false }
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i]
    if (a === '--target-semester-id') args.targetSemesterId = Number(argv[++i] ?? '0')
    else if (a === '--decision-file') args.decisionFile = argv[++i] ?? ''
    else if (a === '--help' || a === '-h') args.help = true
  }
  return args
}

const shortHash = (s: string, len = 16): string =>
  createHash('sha256').update(s, 'utf8').digest('hex').slice(0, len)

const stableStringify = (v: unknown): string => {
  if (v == null || typeof v !== 'object') return JSON.stringify(v)
  if (Array.isArray(v)) return `[${v.map(stableStringify).join(',')}]`
  const keys = Object.keys(v as Record<string, unknown>).sort()
  return `{${keys.map((k) => JSON.stringify(k) + ':' + stableStringify((v as Record<string, unknown>)[k])).join(',')}}`
}

const STAGE = 'L7-F6G2-USER-DECISION-INTAKE-AND-WRITE-PLAN' as const

// ── External teacher generic-name filter ───────────────────────────────────
const EXTERNAL_GENERIC_PATTERNS = [
  /^外聘$/, /^兼职$/, /^校外$/, /^未知$/, /^待定$/, /^空$/, /^\?+$/, /^无$/,
]

const isExternalGeneric = (s: string): boolean => {
  const t = s.replace(/\s+/g, '').replace(/[（(](外聘|兼职|校外|实训|实习|外)[）)]/g, '')
  return EXTERNAL_GENERIC_PATTERNS.some((p) => p.test(t)) || t.length === 0
}

// ── Decision schema ────────────────────────────────────────────────────────

type UserDecisionStatus = 'approve' | 'reject' | 'skip' | 'needsReview' | 'manualSelect' | 'manualEdit'

type UserDecisionItem = {
  decisionId: string
  category: string
  decisionStatus: UserDecisionStatus
  approvedAction?: string
  selectedExistingId?: number
  editedValue?: string
  note?: string
  decidedBy?: string
  decidedAt?: string
}

type G1Package = {
  staffContacts: Array<{ decisionId: string; name: string; source: string; department: string | null; matchedRows: number; duplicateRisk: boolean }>
  external: Array<{ decisionId: string; name: string; likelyPartTime: boolean; matchedRows: number }>
  ambiguous: Array<{ decisionId: string; normalizedText: string; candidateCount: number; candidates: Array<{ nameHash: string; name: string; source: string; department: string | null }> }>
  classGroups: Array<{ major: string; count: number; action: string }>
  skipRows: number
  weeklyHours: number
}

// ── G1 package loader ──────────────────────────────────────────────────────

const loadG1Package = (): G1Package | null => {
  const path = join(resolve(__dirname, '..'), 'temp', 'local-artifacts', 'l7-f6g1', 'manual-decision-package.json')
  if (!existsSync(path)) return null
  return JSON.parse(readFileSync(path, 'utf-8')) as G1Package
}

// ── User decisions loader ──────────────────────────────────────────────────

const findUserDecisionFile = (args: CliArgs): { found: boolean; path: string; data: { decisions: UserDecisionItem[] } | null } => {
  // Priority order
  const candidates = [
    args.decisionFile,
    'temp/local-artifacts/l7-f6g2/user-decisions.intake.local.json',
    'temp/local-artifacts/l7-f6g1/manual-decision-package.user-decisions.local.json',
  ].filter((p) => p.length > 0)

  for (const rel of candidates) {
    const abs = rel.startsWith(resolve(__dirname, '..')) ? rel : join(resolve(__dirname, '..'), rel)
    if (existsSync(abs)) {
      try {
        const data = JSON.parse(readFileSync(abs, 'utf-8'))
        return { found: true, path: abs, data }
      } catch {
        return { found: false, path: abs, data: null }
      }
    }
  }
  return { found: false, path: candidates[0] ?? '', data: null }
}

// ── Build G1 decision index by decisionId ──────────────────────────────────

const indexG1Decisions = (pkg: G1Package): Map<string, { category: string; payload: Record<string, unknown> }> => {
  const idx = new Map<string, { category: string; payload: Record<string, unknown> }>()
  for (const s of pkg.staffContacts) idx.set(s.decisionId, { category: 'staffContactsTeacher', payload: { ...s } })
  for (const e of pkg.external) idx.set(e.decisionId, { category: 'externalTeacher', payload: { ...e } })
  for (const a of pkg.ambiguous) idx.set(a.decisionId, { category: 'ambiguousTeacher', payload: { ...a } })
  for (const c of pkg.classGroups) idx.set(shortHash(c.major, 16), { category: 'newMajorClassGroup', payload: { ...c } })
  for (const c of pkg.classGroups) {
    if (c.action === 'MANUAL_CONFIRM_MAJOR_ALIAS') {
      idx.set(`alias-${shortHash(c.major, 16)}`, { category: 'majorAlias', payload: { ...c } })
    }
  }
  // skipRows, weeklyHours, ambiguousMapping are aggregate counts — no per-decision-id in G1 package
  // We'll generate pseudo decisionIds for those
  return idx
}

// ── Main ──────────────────────────────────────────────────────────────────

async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2))
  if (args.help) {
    console.log(`L7-F6G2 — User Decision Intake & Write Plan (read-only)

Usage:
  --target-semester-id <id>   Target semester (required, e.g. 4)
  --decision-file <path>      User decisions file (optional)

If no --decision-file provided, looks for:
  temp/local-artifacts/l7-f6g2/user-decisions.intake.local.json
  temp/local-artifacts/l7-f6g1/manual-decision-package.user-decisions.local.json

If no user decisions exist, stage status = BLOCKED_WAITING_FOR_USER_DECISIONS,
readyForControlledWrite = false.
`)
    return
  }
  if (!args.targetSemesterId || args.targetSemesterId <= 0) {
    console.error('ERROR: --target-semester-id is required')
    process.exit(1)
  }

  console.log(`L7-F6G2 User Decision Intake & Write Plan`)
  console.log(`  target semester: ${args.targetSemesterId}`)
  console.log('')

  // ── Load G1 package ────────────────────────────────────────────────────
  const g1 = loadG1Package()
  if (!g1) {
    console.error('ERROR: G1 decision package not found')
    console.error('  expected: temp/local-artifacts/l7-f6g1/manual-decision-package.json')
    process.exit(1)
  }
  console.log(`G1 package found: ${g1.staffContacts.length + g1.external.length + g1.ambiguous.length} teacher candidates, ${g1.classGroups.length} classGroup candidates`)

  // ── Load user decisions ────────────────────────────────────────────────
  const userDecisionResult = findUserDecisionFile(args)
  console.log(`User decision file found: ${userDecisionResult.found}${userDecisionResult.found ? ' (' + userDecisionResult.path + ')' : ''}`)

  // ── Index G1 decisions ─────────────────────────────────────────────────
  const g1Index = indexG1Decisions(g1)
  const totalDecisionItems = g1Index.size + g1.skipRows + g1.weeklyHours

  // ── If no user decisions → BLOCKED ─────────────────────────────────────
  if (!userDecisionResult.found || !userDecisionResult.data) {
    console.log('')
    console.log('  ⚠ NO USER DECISIONS PROVIDED — stage BLOCKED')
    console.log('  recommendedAction is NOT treated as approval')
    console.log('')

    const aggregate = {
      stage: STAGE,
      status: 'BLOCKED_WAITING_FOR_USER_DECISIONS',
      targetSemesterId: args.targetSemesterId,
      dbWrite: false,
      decisionPackageFound: true,
      userDecisionFileFound: false,
      decisionSourcePath: userDecisionResult.path,
      recommendedActionTreatedAsApproval: false,
      missingUserDecisionCount: totalDecisionItems,
      totalDecisionItems,
      decidedItems: 0,
      pendingItems: totalDecisionItems,
      invalidDecisionItems: 0,
      rejectedItems: 0,
      needsReviewItems: 0,
      approvedTeacherCreates: 0,
      approvedTeacherAliases: 0,
      approvedExternalTeacherCreates: 0,
      approvedClassGroupCreates: 0,
      approvedMajorAliases: 0,
      approvedSkipRows: 0,
      approvedWeeklyHoursEdits: 0,
      approvedExamTypeAutoFixes: 0,
      approvedAmbiguousMappings: 0,
      readyForControlledWrite: false,
      writePlanHash: null,
      nextStage: 'L7-F6G2A-USER-DECISION-COMPLETION',
      localArtifacts: {
        userDecisionsIntake: 'temp/local-artifacts/l7-f6g2/user-decisions.intake.local.json',
        writePlanJson: 'temp/local-artifacts/l7-f6g2/controlled-master-data-write-plan.local.json',
        writePlanMd: 'temp/local-artifacts/l7-f6g2/controlled-master-data-write-plan.md',
      },
    }

    // Write empty intake artifact
    const laDir = join(resolve(__dirname, '..'), 'temp', 'local-artifacts', 'l7-f6g2')
    if (!existsSync(laDir)) mkdirSync(laDir, { recursive: true })
    writeFileSync(join(laDir, 'user-decisions.intake.local.json'), JSON.stringify({
      stage: STAGE, status: 'BLOCKED', message: 'No user decisions provided. recommendedAction is NOT auto-approved.', missingUserDecisionCount: totalDecisionItems, requiredDecisionFile: userDecisionResult.path,
    }, null, 2) + '\n', 'utf-8')
    writeFileSync(join(laDir, 'controlled-master-data-write-plan.local.json'), JSON.stringify(aggregate, null, 2) + '\n', 'utf-8')

    // Write blocking MD
    const blockingMd = `# L7-F6G2 User Decision Intake & Write Plan

> Status: **BLOCKED_WAITING_FOR_USER_DECISIONS**

## Why blocked?

No user decisions file found. Stage cannot auto-approve recommendedAction.

## Required

Create a JSON file at one of:
- \`temp/local-artifacts/l7-f6g2/user-decisions.intake.local.json\`
- \`temp/local-artifacts/l7-f6g1/manual-decision-package.user-decisions.local.json\`

Schema:
\`\`\`json
{
  "decisions": [
    { "decisionId": "<hash>", "category": "staffContactsTeacher", "decisionStatus": "approve" | "reject" | "skip" | "manualSelect", "selectedExistingId": <number?>, "note": "..." }
  ]
}
\`\`\`

Total pending items: **${totalDecisionItems}**

Re-run after providing decisions:
\`\`\`
npx tsx scripts/intake-user-decisions-and-plan-write-l7-f6g2.ts --target-semester-id 4
\`\`\`
`
    writeFileSync(join(laDir, 'controlled-master-data-write-plan.md'), blockingMd, 'utf-8')

    console.log(`--- L7-F6G2 BLOCKED summary ---`)
    console.log(`  status:                BLOCKED_WAITING_FOR_USER_DECISIONS`)
    console.log(`  totalDecisionItems:    ${totalDecisionItems}`)
    console.log(`  pendingItems:          ${totalDecisionItems}`)
    console.log(`  missingUserDecision:   ${totalDecisionItems}`)
    console.log(`  readyForControlledWrite: false`)
    console.log(`  next stage:            L7-F6G2A-USER-DECISION-COMPLETION`)
    console.log(`  local artifacts:       ${laDir}`)
    return
  }

  // ── User decisions provided → process them ─────────────────────────────
  const userDecisions = userDecisionResult.data.decisions
  const validStatuses: UserDecisionStatus[] = ['approve', 'reject', 'skip', 'needsReview', 'manualSelect', 'manualEdit']
  const validCategories = ['staffContactsTeacher', 'externalTeacher', 'ambiguousTeacher', 'newMajorClassGroup', 'majorAlias', 'skipRow', 'weeklyHours', 'examType', 'ambiguousMapping']

  let decidedItems = 0
  let invalidDecisionItems = 0
  let rejectedItems = 0
  let needsReviewItems = 0
  const invalidDecisions: { decisionId: string; reason: string }[] = []

  for (const d of userDecisions) {
    if (!validStatuses.includes(d.decisionStatus)) {
      invalidDecisionItems++
      invalidDecisions.push({ decisionId: d.decisionId, reason: `invalid decisionStatus: ${d.decisionStatus}` })
      continue
    }
    if (!validCategories.includes(d.category)) {
      invalidDecisionItems++
      invalidDecisions.push({ decisionId: d.decisionId, reason: `invalid category: ${d.category}` })
      continue
    }
    decidedItems++
    if (d.decisionStatus === 'reject') rejectedItems++
    if (d.decisionStatus === 'needsReview') needsReviewItems++
  }

  // ── Compute approved actions ───────────────────────────────────────────
  const approvedTeacherCreates = 0
  let approvedTeacherAliases = 0
  let approvedExternalTeacherCreates = 0
  let approvedClassGroupCreates = 0
  let approvedMajorAliases = 0
  const approvedSkipRows = 0
  const approvedWeeklyHoursEdits = 0
  const approvedExamTypeAutoFixes = 0
  const approvedAmbiguousMappings = 0

  // Build (category, decisionId) → decision map using composite key.
  // Using composite key avoids collision when the same decisionId hash
  // appears in different categories (e.g. 22 staffContacts/external
  // hash collisions in the L7-F6G2A draft).
  const decisionByCompositeKey = new Map<string, UserDecisionItem>()
  for (const d of userDecisions) {
    const compositeKey = `${d.category}:${d.decisionId}`
    decisionByCompositeKey.set(compositeKey, d)
  }
  const lookup = (category: string, decisionId: string): UserDecisionItem | undefined =>
    decisionByCompositeKey.get(`${category}:${decisionId}`)

  // Teacher creates
  for (const s of g1.staffContacts) {
    const d = lookup('staffContactsTeacher', s.decisionId)
    if (d?.decisionStatus === 'approve') {
      // Existing Teacher check: if name already in Teacher=236, treat as alias not create
      approvedTeacherAliases++ // conservative — L7-F6H will re-verify
    }
  }
  for (const e of g1.external) {
    const d = lookup('externalTeacher', e.decisionId)
    if (d?.decisionStatus === 'approve') {
      if (isExternalGeneric(e.name)) {
        invalidDecisionItems++
        invalidDecisions.push({ decisionId: e.decisionId, reason: 'external generic name cannot be approved' })
      } else {
        approvedExternalTeacherCreates++
      }
    }
  }
  for (const c of g1.classGroups) {
    const majorHash = shortHash(c.major, 16)
    if (c.action === 'MANUAL_CONFIRM_MAJOR_ALIAS') {
      const d = lookup('majorAlias', majorHash)
      if (d?.decisionStatus === 'approve') approvedMajorAliases++
    } else {
      const d = lookup('newMajorClassGroup', majorHash)
      if (d?.decisionStatus === 'approve') approvedClassGroupCreates++
    }
  }

  // Generate writePlanHash (only if no invalid decisions)
  const writePlanHash = invalidDecisionItems === 0 ? shortHash(stableStringify({
    approvedTeacherCreates, approvedTeacherAliases, approvedExternalTeacherCreates, approvedClassGroupCreates, approvedMajorAliases, approvedSkipRows, approvedWeeklyHoursEdits, approvedExamTypeAutoFixes, approvedAmbiguousMappings,
  }), 32) : null

  const readyForControlledWrite = invalidDecisionItems === 0 && decidedItems >= totalDecisionItems && approvedTeacherCreates + approvedExternalTeacherCreates + approvedClassGroupCreates > 0
  const nextStage = readyForControlledWrite ? 'L7-F6H-CONTROLLED-MASTER-DATA-WRITE' : 'L7-F6G2A-USER-DECISION-COMPLETION'

  const aggregate = {
    stage: STAGE,
    status: readyForControlledWrite ? 'READY' : 'PARTIAL_OR_BLOCKED',
    targetSemesterId: args.targetSemesterId,
    dbWrite: false,
    decisionPackageFound: true,
    userDecisionFileFound: true,
    decisionSourcePath: userDecisionResult.path,
    recommendedActionTreatedAsApproval: false,
    totalDecisionItems,
    decidedItems,
    pendingItems: totalDecisionItems - decidedItems,
    invalidDecisionItems,
    rejectedItems,
    needsReviewItems,
    approvedTeacherCreates,
    approvedTeacherAliases,
    approvedExternalTeacherCreates,
    approvedClassGroupCreates,
    approvedMajorAliases,
    approvedSkipRows,
    approvedWeeklyHoursEdits,
    approvedExamTypeAutoFixes,
    approvedAmbiguousMappings,
    readyForControlledWrite,
    writePlanHash,
    nextStage,
    localArtifacts: {
      userDecisionsIntake: 'temp/local-artifacts/l7-f6g2/user-decisions.intake.local.json',
      writePlanJson: 'temp/local-artifacts/l7-f6g2/controlled-master-data-write-plan.local.json',
      writePlanMd: 'temp/local-artifacts/l7-f6g2/controlled-master-data-write-plan.md',
    },
  }

  // Write local artifacts. G2B preserves the formal partial decision file at
  // user-decisions.intake.local.json — write validation log to a separate file.
  const laDir = join(resolve(__dirname, '..'), 'temp', 'local-artifacts', 'l7-f6g2')
  if (!existsSync(laDir)) mkdirSync(laDir, { recursive: true })
  writeFileSync(join(laDir, 'g2-intake-validation.local.json'), JSON.stringify({
    stage: STAGE,
    targetSemesterId: args.targetSemesterId,
    decisionSourcePath: userDecisionResult.path,
    totalUserDecisions: userDecisions.length,
    validDecisions: decidedItems,
    invalidDecisions: invalidDecisions.length,
    invalidDetails: invalidDecisions,
  }, null, 2) + '\n', 'utf-8')
  writeFileSync(join(laDir, 'controlled-master-data-write-plan.local.json'), JSON.stringify(aggregate, null, 2) + '\n', 'utf-8')

  console.log(`--- L7-F6G2 summary ---`)
  console.log(`  status:                ${aggregate.status}`)
  console.log(`  totalDecisionItems:    ${totalDecisionItems}`)
  console.log(`  decidedItems:          ${decidedItems}`)
  console.log(`  pendingItems:          ${totalDecisionItems - decidedItems}`)
  console.log(`  invalidDecisionItems:  ${invalidDecisionItems}`)
  console.log(`  approvedTeacherCreates: ${approvedTeacherAliases}`)
  console.log(`  approvedExternalTeacherCreates: ${approvedExternalTeacherCreates}`)
  console.log(`  approvedClassGroupCreates: ${approvedClassGroupCreates}`)
  console.log(`  approvedMajorAliases:  ${approvedMajorAliases}`)
  console.log(`  readyForControlledWrite: ${readyForControlledWrite}`)
  console.log(`  next stage:            ${nextStage}`)
}

main().catch((e) => { console.error('FATAL:', e); process.exit(1) })
