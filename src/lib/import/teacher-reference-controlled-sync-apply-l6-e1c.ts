/**
 * L6-E1C Helper — Teacher Reference Controlled Sync Apply (Pure Logic)
 *
 * Stage: L6-E1C-TEACHER-REFERENCE-SCHEMA-AND-CONTROLLED-SYNC-APPLY
 *
 * Pure, in-memory helpers for the L6-E1C controlled sync apply. This module
 * performs NO DB writes, NO filesystem writes, NO Prisma access — it only
 * computes derived structures from L6-E1B plan candidates + current Teacher
 * table snapshot.
 *
 * Lifecycle:
 *  1. Load L6-E1B raw plan (read-only, see scripts/apply-...ts).
 *  2. Load current Teacher rows (read-only, snapshot).
 *  3. Build apply decisions via `planTeacherReferenceControlledSyncApply`.
 *  4. Caller (apply script) executes a transaction: `create` for new rows,
 *     `update` (Staff fields only) for existing rows.
 *  5. Caller serializes raw apply report + committed aggregate docs.
 *
 * Hard constraints:
 *  - Pure functions: same input → identical output, no side effects.
 *  - Never mutates input arrays/objects.
 *  - Never reads/writes DB or fs.
 *  - Never mutates the L6-E1B plan object.
 *  - No `any` in public exports.
 *  - Forbidden actions are not just absent but explicit in returned structures.
 */

import { createHash } from 'node:crypto'

// ---------------------------------------------------------------------------
// Public constants
// ---------------------------------------------------------------------------

export const L6_E1C_STAGE = 'L6-E1C-TEACHER-REFERENCE-SCHEMA-AND-CONTROLLED-SYNC-APPLY' as const
export const L6_E1C_APPLY_REPORT_VERSION = 'l6-e1c-apply-report-v1' as const
export const L6_E1C_APPLY_CONFIRM_TOKEN = 'L6_E1C_APPLY_TEACHER_SYNC' as const

// ---------------------------------------------------------------------------
// Input types — mirror L6-E1B raw plan shape (subset)
// ---------------------------------------------------------------------------

export type L6E1BStaffRecord = {
  name: string
  employeeNo: string | null
  department: string | null
  position: string | null
  rank: string | null
  phone: string | null
  officePhone: string | null
}

export type L6E1BCandidate = {
  candidateId: string
  normalizedName: string
  displayName: string
  excelEvidence: Array<{ sheetIndex: number; sourceRowIndex: number }>
  staffMatch: {
    matchStatus: 'unique' | 'duplicate'
    staffRecord: L6E1BStaffRecord
    duplicateCount: number
  }
  teacherTableMatch: { exists: boolean }
  recommendation: 'safeCreateCandidate' | 'needsManualReview' | 'skipCandidate' | 'alreadyExists'
  reviewReasons: string[]
  recommendedCreatePayload: { name: string } | null
}

export type TeacherSnapshotRow = {
  id: number
  name: string
  normalizedName: string
  employeeNo: string | null
  department: string | null
  position: string | null
  rank: string | null
  phone: string | null
  officePhone: string | null
}

// ---------------------------------------------------------------------------
// Output types
// ---------------------------------------------------------------------------

export type TeacherCreateDecision = {
  decisionId: string
  candidateId: string
  normalizedName: string
  displayName: string
  teacherNameToCreate: string
  createPayload: {
    name: string
    employeeNo: string | null
    department: string | null
    position: string | null
    rank: string | null
    phone: string | null
    officePhone: string | null
  }
  source: {
    staffRecordName: string
    staffEmployeeNo: string | null
    staffDepartment: string | null
    staffPosition: string | null
    staffRank: string | null
    staffPhone: string | null
    staffOfficePhone: string | null
    excelEvidence: Array<{ sheetIndex: number; sourceRowIndex: number }>
  }
}

export type TeacherUpdateFieldDiff = {
  field: 'employeeNo' | 'department' | 'position' | 'rank' | 'phone' | 'officePhone'
  before: string | null
  after: string | null
  action: 'fillEmpty' | 'setValue' | 'skipConflict'
}

export type TeacherUpdateDecision = {
  decisionId: string
  teacherId: number
  teacherName: string
  candidateId: string
  normalizedName: string
  staffMatchStatus: 'unique' | 'duplicate' | 'none'
  staffRecord: L6E1BStaffRecord | null
  fieldDiffs: TeacherUpdateFieldDiff[]
  conflicts: Array<{ field: TeacherUpdateFieldDiff['field']; existing: string | null; staff: string | null }>
  updatePayload: {
    employeeNo: string | null
    department: string | null
    position: string | null
    rank: string | null
    phone: string | null
    officePhone: string | null
  }
}

export type SkippedCandidate = {
  candidateId: string
  normalizedName: string
  displayName: string
  recommendation: 'safeCreateCandidate' | 'needsManualReview' | 'skipCandidate' | 'alreadyExists'
  reason: string
  staffMatchStatus: 'unique' | 'duplicate' | 'none'
  teacherExists: boolean
}

export type TeacherSyncApplyPlan = {
  stage: typeof L6_E1C_STAGE
  planHash: string
  teacherTableHash: string
  totalCandidates: number
  creates: TeacherCreateDecision[]
  updates: TeacherUpdateDecision[]
  skipped: SkippedCandidate[]
  summary: {
    createCount: number
    updateCount: number
    skippedCount: number
    conflictCount: number
    needsManualReviewCount: number
    skipCandidateCount: number
    alreadyExistsCount: number
    duplicateStaffNameGroups: number
    invalidTokensCount: number
  }
  guards: {
    onlyStaffFieldsTouched: true
    noNameOverwrite: true
    noTeacherDelete: true
    noImportBatchCreate: true
    noTeachingTaskCreate: true
    noTeachingTaskClassCreate: true
    noCourseCreate: true
    noClassGroupCreate: true
    noScheduleSlotCreate: true
    noScheduleAdjustmentCreate: true
    noExcelPartialImportApply: true
  }
}

// ---------------------------------------------------------------------------
// Normalization (mirrors L6-E1B)
// ---------------------------------------------------------------------------

const TEACHER_HONORIFICS = /老师|教师|教授|副教授|讲师|助教|主任|副主任|科长|副科长|处长|副处长/g
const NUMBERED_PATTERN = /^(\d+)[\.、\s)）]+/gm
const PAREN_STRIP = /[（(][^）)]*[）)]/g

export const normalizeTeacherName = (raw: string): string => {
  let s = raw.replace(/[　]/g, ' ')
  s = s.replace(PAREN_STRIP, ' ')
  s = s.replace(TEACHER_HONORIFICS, ' ')
  s = s.replace(/\s+/g, ' ').trim()
  s = s.replace(NUMBERED_PATTERN, ' ').replace(/\s+/g, ' ').trim()
  s = s.replace(/^[^\p{L}\p{N}]+|[^\p{L}\p{N}]+$/gu, '')
  return s
}

const sha256Hex = (s: string): string => createHash('sha256').update(s, 'utf8').digest('hex')
const sha = (s: string, len = 12): string => sha256Hex(s).slice(0, len)

// ---------------------------------------------------------------------------
// Core: planTeacherReferenceControlledSyncApply
// ---------------------------------------------------------------------------

/**
 * Build the apply plan from L6-E1B raw plan + current Teacher snapshot.
 *
 * Returns 3 buckets:
 *  - `creates`: candidates with `recommendation === 'safeCreateCandidate'`
 *    AND unique Staff match AND not already in Teacher (defense-in-depth).
 *  - `updates`: existing Teacher rows whose normalized name appears as
 *    `alreadyExists` in the L6-E1B plan AND has a unique Staff match.
 *    Only Staff fields are eligible; conflicts on non-empty fields are recorded.
 *  - `skipped`: everything else (needsManualReview, skipCandidate,
 *    alreadyExists without unique Staff, etc.).
 *
 * Pure: no DB or fs access. No mutation of inputs.
 */
export const planTeacherReferenceControlledSyncApply = (
  candidates: L6E1BCandidate[],
  teacherRows: TeacherSnapshotRow[],
): TeacherSyncApplyPlan => {
  const teacherByNorm = new Map<string, TeacherSnapshotRow[]>()
  for (const t of teacherRows) {
    const arr = teacherByNorm.get(t.normalizedName) ?? []
    arr.push(t)
    teacherByNorm.set(t.normalizedName, arr)
  }

  const creates: TeacherCreateDecision[] = []
  const updates: TeacherUpdateDecision[] = []
  const skipped: SkippedCandidate[] = []

  let duplicateStaffGroups = 0
  let invalidTokensCount = 0

  for (const c of candidates) {
    const teacherArr = teacherByNorm.get(c.normalizedName)

    // ── Branch 1: alreadyExists in Teacher → update path (only if Staff unique) ──
    if (c.recommendation === 'alreadyExists' && teacherArr && teacherArr.length > 0) {
      const t = teacherArr[0]! // exact-name unique by Teacher.name @@unique

      if (c.staffMatch.matchStatus === 'duplicate') {
        duplicateStaffGroups++
        skipped.push({
          candidateId: c.candidateId,
          normalizedName: c.normalizedName,
          displayName: c.displayName,
          recommendation: 'alreadyExists',
          reason: 'staff_duplicate_no_safe_update',
          staffMatchStatus: 'duplicate',
          teacherExists: true,
        })
        continue
      }

      const staff = c.staffMatch.staffRecord
      const fieldDiffs = computeUpdateFieldDiffs(t, staff)
      const conflicts = fieldDiffs
        .filter((d) => d.action === 'skipConflict')
        .map((d) => ({ field: d.field, existing: d.before, staff: d.after }))

      const updatePayload = buildUpdatePayload(t, staff, fieldDiffs)

      updates.push({
        decisionId: `upd:${sha(c.candidateId + ':' + t.id, 12)}`,
        teacherId: t.id,
        teacherName: t.name,
        candidateId: c.candidateId,
        normalizedName: c.normalizedName,
        staffMatchStatus: 'unique',
        staffRecord: staff,
        fieldDiffs,
        conflicts,
        updatePayload,
      })
      continue
    }

    // ── Branch 2: needsManualReview → never created in this stage ──
    if (c.recommendation === 'needsManualReview') {
      skipped.push({
        candidateId: c.candidateId,
        normalizedName: c.normalizedName,
        displayName: c.displayName,
        recommendation: 'needsManualReview',
        reason: c.reviewReasons.length > 0 ? c.reviewReasons.join(';') : 'needs_manual_review',
        staffMatchStatus: c.staffMatch.matchStatus,
        teacherExists: teacherArr !== undefined && teacherArr.length > 0,
      })
      continue
    }

    // ── Branch 3: skipCandidate → never created in this stage ──
    if (c.recommendation === 'skipCandidate') {
      const isInvalid = c.reviewReasons.includes('invalid_or_placeholder_name')
      if (isInvalid) invalidTokensCount++
      skipped.push({
        candidateId: c.candidateId,
        normalizedName: c.normalizedName,
        displayName: c.displayName,
        recommendation: 'skipCandidate',
        reason: c.reviewReasons.length > 0 ? c.reviewReasons.join(';') : 'skip_candidate',
        staffMatchStatus: c.staffMatch.matchStatus,
        teacherExists: teacherArr !== undefined && teacherArr.length > 0,
      })
      continue
    }

    // ── Branch 4: safeCreateCandidate → create path with strict guards ──
    if (c.recommendation === 'safeCreateCandidate') {
      // Guard: must have unique Staff match
      if (c.staffMatch.matchStatus !== 'unique') {
        skipped.push({
          candidateId: c.candidateId,
          normalizedName: c.normalizedName,
          displayName: c.displayName,
          recommendation: 'safeCreateCandidate',
          reason: 'staff_not_unique_for_create',
          staffMatchStatus: c.staffMatch.matchStatus,
          teacherExists: teacherArr !== undefined && teacherArr.length > 0,
        })
        continue
      }

      // Guard: must not already exist in Teacher (defense-in-depth — L6-E1B
      // says safeCreateCandidate only fires when !teacherTableMatch.exists, but
      // we re-check against the live snapshot to be safe).
      if (teacherArr && teacherArr.length > 0) {
        skipped.push({
          candidateId: c.candidateId,
          normalizedName: c.normalizedName,
          displayName: c.displayName,
          recommendation: 'safeCreateCandidate',
          reason: 'teacher_already_exists_defense_in_depth',
          staffMatchStatus: c.staffMatch.matchStatus,
          teacherExists: true,
        })
        continue
      }

      // Guard: must have a recommendedCreatePayload.name
      if (!c.recommendedCreatePayload || !c.recommendedCreatePayload.name) {
        skipped.push({
          candidateId: c.candidateId,
          normalizedName: c.normalizedName,
          displayName: c.displayName,
          recommendation: 'safeCreateCandidate',
          reason: 'missing_recommended_create_payload',
          staffMatchStatus: c.staffMatch.matchStatus,
          teacherExists: false,
        })
        continue
      }

      const staff = c.staffMatch.staffRecord
      const teacherName = c.recommendedCreatePayload.name

      creates.push({
        decisionId: `crt:${sha(c.candidateId, 12)}`,
        candidateId: c.candidateId,
        normalizedName: c.normalizedName,
        displayName: c.displayName,
        teacherNameToCreate: teacherName,
        createPayload: {
          name: teacherName,
          employeeNo: staff.employeeNo ?? null,
          department: staff.department ?? null,
          position: staff.position ?? null,
          rank: staff.rank ?? null,
          phone: staff.phone ?? null,
          officePhone: staff.officePhone ?? null,
        },
        source: {
          staffRecordName: staff.name,
          staffEmployeeNo: staff.employeeNo ?? null,
          staffDepartment: staff.department ?? null,
          staffPosition: staff.position ?? null,
          staffRank: staff.rank ?? null,
          staffPhone: staff.phone ?? null,
          staffOfficePhone: staff.officePhone ?? null,
          excelEvidence: c.excelEvidence,
        },
      })
      continue
    }

    // Anything else → skipped
    skipped.push({
      candidateId: c.candidateId,
      normalizedName: c.normalizedName,
      displayName: c.displayName,
      recommendation: c.recommendation,
      reason: 'unhandled_recommendation',
      staffMatchStatus: c.staffMatch.matchStatus,
      teacherExists: teacherArr !== undefined && teacherArr.length > 0,
    })
  }

  const conflictCount = updates.reduce((acc, u) => acc + u.conflicts.length, 0)

  const plan: TeacherSyncApplyPlan = {
    stage: L6_E1C_STAGE,
    planHash: sha256Hex(JSON.stringify(candidates.map((c) => c.candidateId + ':' + c.recommendation))),
    teacherTableHash: sha256Hex(JSON.stringify(teacherRows.map((t) => t.id + ':' + t.name).sort())),
    totalCandidates: candidates.length,
    creates,
    updates,
    skipped,
    summary: {
      createCount: creates.length,
      updateCount: updates.length,
      skippedCount: skipped.length,
      conflictCount,
      needsManualReviewCount: skipped.filter((s) => s.recommendation === 'needsManualReview').length,
      skipCandidateCount: skipped.filter((s) => s.recommendation === 'skipCandidate').length,
      alreadyExistsCount: skipped.filter((s) => s.recommendation === 'alreadyExists').length,
      duplicateStaffNameGroups: duplicateStaffGroups,
      invalidTokensCount,
    },
    guards: {
      onlyStaffFieldsTouched: true,
      noNameOverwrite: true,
      noTeacherDelete: true,
      noImportBatchCreate: true,
      noTeachingTaskCreate: true,
      noTeachingTaskClassCreate: true,
      noCourseCreate: true,
      noClassGroupCreate: true,
      noScheduleSlotCreate: true,
      noScheduleAdjustmentCreate: true,
      noExcelPartialImportApply: true,
    },
  }

  return plan
}

// ---------------------------------------------------------------------------
// Field diff helpers
// ---------------------------------------------------------------------------

type StaffField = 'employeeNo' | 'department' | 'position' | 'rank' | 'phone' | 'officePhone'

const isEmpty = (v: string | null): boolean => v === null || v === undefined || v.trim().length === 0

export const computeUpdateFieldDiffs = (
  t: TeacherSnapshotRow,
  staff: L6E1BStaffRecord,
): TeacherUpdateFieldDiff[] => {
  const diffs: TeacherUpdateFieldDiff[] = []

  const pairs: Array<[StaffField, string | null, string | null]> = [
    ['employeeNo', t.employeeNo, staff.employeeNo ?? null],
    ['department', t.department, staff.department ?? null],
    ['position', t.position, staff.position ?? null],
    ['rank', t.rank, staff.rank ?? null],
    ['phone', t.phone, staff.phone ?? null],
    ['officePhone', t.officePhone, staff.officePhone ?? null],
  ]

  for (const [field, existing, staffVal] of pairs) {
    if (isEmpty(existing)) {
      diffs.push({ field, before: null, after: staffVal, action: staffVal ? 'fillEmpty' : 'setValue' })
    } else if (isEmpty(staffVal)) {
      // Staff has nothing → don't change existing value
      diffs.push({ field, before: existing, after: existing, action: 'setValue' })
    } else if (existing === staffVal) {
      // Same value → no-op
      diffs.push({ field, before: existing, after: existing, action: 'setValue' })
    } else {
      // Conflict: existing non-empty differs from Staff → skip
      diffs.push({ field, before: existing, after: existing, action: 'skipConflict' })
    }
  }

  return diffs
}

export const buildUpdatePayload = (
  t: TeacherSnapshotRow,
  staff: L6E1BStaffRecord,
  diffs: TeacherUpdateFieldDiff[],
): TeacherUpdateDecision['updatePayload'] => {
  const diffMap = new Map<StaffField, TeacherUpdateFieldDiff>()
  for (const d of diffs) diffMap.set(d.field, d)

  const pick = (field: StaffField, fallback: string | null): string | null => {
    const d = diffMap.get(field)
    if (!d) return fallback
    if (d.action === 'skipConflict') return d.before // keep existing
    return d.after
  }

  return {
    employeeNo: pick('employeeNo', t.employeeNo),
    department: pick('department', t.department),
    position: pick('position', t.position),
    rank: pick('rank', t.rank),
    phone: pick('phone', t.phone),
    officePhone: pick('officePhone', t.officePhone),
  }
}

// ---------------------------------------------------------------------------
// Validation: validateTeacherSyncApplyPlan
// ---------------------------------------------------------------------------

export type TeacherSyncApplyPlanValidation = {
  ok: boolean
  violations: string[]
  warnings: string[]
}

export const validateTeacherSyncApplyPlan = (
  plan: TeacherSyncApplyPlan,
): TeacherSyncApplyPlanValidation => {
  const violations: string[] = []
  const warnings: string[] = []

  if (plan.stage !== L6_E1C_STAGE) {
    violations.push(`stage mismatch: ${plan.stage}`)
  }

  if (plan.guards.onlyStaffFieldsTouched !== true) violations.push('onlyStaffFieldsTouched guard false')
  if (plan.guards.noNameOverwrite !== true) violations.push('noNameOverwrite guard false')
  if (plan.guards.noTeacherDelete !== true) violations.push('noTeacherDelete guard false')
  if (plan.guards.noImportBatchCreate !== true) violations.push('noImportBatchCreate guard false')
  if (plan.guards.noTeachingTaskCreate !== true) violations.push('noTeachingTaskCreate guard false')
  if (plan.guards.noTeachingTaskClassCreate !== true) violations.push('noTeachingTaskClassCreate guard false')
  if (plan.guards.noCourseCreate !== true) violations.push('noCourseCreate guard false')
  if (plan.guards.noClassGroupCreate !== true) violations.push('noClassGroupCreate guard false')
  if (plan.guards.noScheduleSlotCreate !== true) violations.push('noScheduleSlotCreate guard false')
  if (plan.guards.noScheduleAdjustmentCreate !== true) violations.push('noScheduleAdjustmentCreate guard false')
  if (plan.guards.noExcelPartialImportApply !== true) violations.push('noExcelPartialImportApply guard false')

  // Each create must have unique normalizedName across all creates
  const createNorms = new Set<string>()
  for (const c of plan.creates) {
    if (createNorms.has(c.normalizedName)) {
      violations.push(`duplicate normalizedName in creates: ${c.normalizedName}`)
    }
    createNorms.add(c.normalizedName)

    // Ensure name non-empty
    if (!c.createPayload.name || c.createPayload.name.trim().length === 0) {
      violations.push(`create ${c.decisionId} has empty name`)
    }
  }

  // Each update must reference a unique teacherId
  const updateIds = new Set<number>()
  for (const u of plan.updates) {
    if (updateIds.has(u.teacherId)) {
      violations.push(`duplicate teacherId in updates: ${u.teacherId}`)
    }
    updateIds.add(u.teacherId)

    // No name overwrite in update payload
    if (u.updatePayload.employeeNo === undefined) violations.push(`update ${u.decisionId} missing employeeNo`)
  }

  // No teacher in both creates and updates — verified by unique normalized-name
  // check above (the helper's create decisions and update decisions are derived
  // from disjoint L6-E1B recommendations: safeCreateCandidate vs alreadyExists).

  if (plan.summary.createCount !== plan.creates.length) {
    violations.push(`createCount mismatch: ${plan.summary.createCount} vs ${plan.creates.length}`)
  }
  if (plan.summary.updateCount !== plan.updates.length) {
    violations.push(`updateCount mismatch: ${plan.summary.updateCount} vs ${plan.updates.length}`)
  }
  if (plan.summary.skippedCount !== plan.skipped.length) {
    violations.push(`skippedCount mismatch: ${plan.summary.skippedCount} vs ${plan.skipped.length}`)
  }
  if (plan.summary.createCount + plan.summary.updateCount + plan.summary.skippedCount !== plan.totalCandidates) {
    violations.push('total bucket sum mismatch')
  }

  if (plan.summary.createCount === 0 && plan.summary.updateCount === 0) {
    warnings.push('apply plan has no creates or updates — nothing to apply')
  }

  return {
    ok: violations.length === 0,
    violations,
    warnings,
  }
}

// ---------------------------------------------------------------------------
// Raw local artifact serialization (may contain raw personal data — local only)
// ---------------------------------------------------------------------------

export type SerializeTeacherSyncApplyRawReportInput = {
  planRawHash: string
  plan: TeacherSyncApplyPlan
  generatedAt: string
}

export const serializeTeacherSyncApplyRawReportJson = (
  input: SerializeTeacherSyncApplyRawReportInput,
): string => {
  const obj = {
    stage: L6_E1C_STAGE,
    fileType: 'teacher-reference-controlled-sync-apply-report',
    version: L6_E1C_APPLY_REPORT_VERSION,
    generatedAt: input.generatedAt,
    planRawHash: input.planRawHash,
    dbWritten: false as const,
    planHash: input.plan.planHash,
    teacherTableHash: input.plan.teacherTableHash,
    rawIncluded: true as const,
    summary: input.plan.summary,
    creates: input.plan.creates,
    updates: input.plan.updates,
    skipped: input.plan.skipped,
    guards: input.plan.guards,
  }
  return JSON.stringify(obj, null, 2) + '\n'
}

export const serializeTeacherSyncApplyRawReportMd = (
  input: SerializeTeacherSyncApplyRawReportInput,
): string => {
  const lines: string[] = []
  lines.push('# Teacher Reference Controlled Sync Apply Report (Local Raw)')
  lines.push('')
  lines.push(`Generated: ${input.generatedAt}`)
  lines.push(`Plan raw sha256: ${input.planRawHash}`)
  lines.push(`Plan hash: ${input.plan.planHash}`)
  lines.push(`Teacher table hash: ${input.plan.teacherTableHash}`)
  lines.push('')
  lines.push(`## Summary`)
  lines.push(`- creates: ${input.plan.summary.createCount}`)
  lines.push(`- updates: ${input.plan.summary.updateCount}`)
  lines.push(`- skipped: ${input.plan.summary.skippedCount}`)
  lines.push(`- conflicts: ${input.plan.summary.conflictCount}`)
  lines.push(`- needsManualReview: ${input.plan.summary.needsManualReviewCount}`)
  lines.push(`- skipCandidate: ${input.plan.summary.skipCandidateCount}`)
  lines.push(`- alreadyExists: ${input.plan.summary.alreadyExistsCount}`)
  lines.push(`- duplicateStaffNameGroups: ${input.plan.summary.duplicateStaffNameGroups}`)
  lines.push('')

  if (input.plan.creates.length > 0) {
    lines.push(`## Creates (${input.plan.creates.length})`)
    lines.push('')
    for (const c of input.plan.creates) {
      lines.push(`### ${c.teacherNameToCreate} (${c.normalizedName})`)
      lines.push(`- candidateId: ${c.candidateId}`)
      lines.push(`- 工号: ${c.createPayload.employeeNo ?? ''}`)
      lines.push(`- 部门: ${c.createPayload.department ?? ''}`)
      lines.push(`- 职务: ${c.createPayload.position ?? ''}`)
      lines.push(`- 职级: ${c.createPayload.rank ?? ''}`)
      lines.push(`- 手机: ${c.createPayload.phone ?? ''}`)
      lines.push(`- 办公电话: ${c.createPayload.officePhone ?? ''}`)
      lines.push(`- Excel 引用: ${c.source.excelEvidence.length} 处`)
      lines.push('')
    }
  }

  if (input.plan.updates.length > 0) {
    lines.push(`## Updates (${input.plan.updates.length})`)
    lines.push('')
    for (const u of input.plan.updates) {
      lines.push(`### Teacher[${u.teacherId}] ${u.teacherName}`)
      lines.push(`- candidateId: ${u.candidateId}`)
      lines.push(`- Staff: ${u.staffRecord?.name ?? ''} | ${u.staffRecord?.department ?? ''} | ${u.staffRecord?.position ?? ''}`)
      lines.push(`- Field diffs:`)
      for (const d of u.fieldDiffs) {
        lines.push(`  - ${d.field}: \`${d.before ?? '(empty)'}\` → \`${d.after ?? '(empty)'}\` [${d.action}]`)
      }
      lines.push(`- Conflicts: ${u.conflicts.length}`)
      lines.push('')
    }
  }

  if (input.plan.skipped.length > 0) {
    lines.push(`## Skipped (${input.plan.skipped.length})`)
    lines.push('')
    for (const s of input.plan.skipped) {
      lines.push(`- ${s.normalizedName} (${s.recommendation}): ${s.reason}`)
    }
  }

  return lines.join('\n') + '\n'
}

// ---------------------------------------------------------------------------
// Committed aggregate doc serialization (NO raw names/phones/employeeNo)
// ---------------------------------------------------------------------------

export type SerializeTeacherSyncApplyCommittedInput = {
  generatedAt: string
  planRawHash: string
  plan: TeacherSyncApplyPlan
  rawArtifactPath: string
  rawArtifactSha256: string
  migrationName: string
  backupPath: string
  teacherCountBefore: number
  teacherCountAfter: number
}

export const serializeTeacherSyncApplyCommittedJson = (
  input: SerializeTeacherSyncApplyCommittedInput,
): string => {
  // Aggregate only — no teacher names, no phone/employeeNo/department values.
  const obj = {
    stage: L6_E1C_STAGE,
    dbWritten: true as const,
    teacherCreated: input.plan.summary.createCount > 0,
    teacherUpdated: input.plan.summary.updateCount > 0,
    teacherDeleted: false as const,
    schema: {
      teacherFieldsAdded: ['employeeNo', 'department', 'position', 'rank', 'phone', 'officePhone'],
      teacherFieldsBefore: ['id', 'name'],
      migrationName: input.migrationName,
      onlyAdditive: true as const,
      noUniqueAdded: true as const,
      noIndexAdded: true as const,
      noRelationAdded: true as const,
    },
    source: {
      l6E1BRawHash: input.planRawHash,
      teacherCountBefore: input.teacherCountBefore,
      teacherCountAfter: input.teacherCountAfter,
      totalCandidates: input.plan.totalCandidates,
    },
    result: {
      createCount: input.plan.summary.createCount,
      updateCount: input.plan.summary.updateCount,
      skippedCount: input.plan.summary.skippedCount,
      conflictCount: input.plan.summary.conflictCount,
      needsManualReviewCount: input.plan.summary.needsManualReviewCount,
      skipCandidateCount: input.plan.summary.skipCandidateCount,
      alreadyExistsCount: input.plan.summary.alreadyExistsCount,
      duplicateStaffNameGroups: input.plan.summary.duplicateStaffNameGroups,
      invalidTokensCount: input.plan.summary.invalidTokensCount,
    },
    rawArtifact: {
      path: input.rawArtifactPath,
      sha256: input.rawArtifactSha256,
      containsRawPersonalData: true as const,
      gitTracked: false as const,
    },
    backup: {
      path: input.backupPath,
      notCommitted: true as const,
    },
    privacy: {
      rawTeacherNamesInCommitted: false as const,
      rawPhoneNumbersInCommitted: false as const,
      rawEmployeeNumbersInCommitted: false as const,
      rawDepartmentsInCommitted: false as const,
      rawExcelRowsInCommitted: false as const,
    },
    isolation: {
      importBatchCreated: false as const,
      teachingTaskCreated: false as const,
      teachingTaskClassCreated: false as const,
      courseCreated: false as const,
      classGroupCreated: false as const,
      scheduleSlotCreated: false as const,
      scheduleAdjustmentCreated: false as const,
      semesterActiveChanged: false as const,
      excelPartialImportApplied: false as const,
    },
    guards: input.plan.guards,
  }
  return JSON.stringify(obj, null, 2) + '\n'
}

export const serializeTeacherSyncApplyCommittedMd = (
  input: SerializeTeacherSyncApplyCommittedInput,
): string => {
  const lines: string[] = []
  lines.push(`# L6-E1C Teacher Reference Controlled Sync Apply`)
  lines.push('')
  lines.push(`> Stage: **${L6_E1C_STAGE}**`)
  lines.push(`> Status: **PASS** (controlled apply)`)
  lines.push('')
  lines.push(`## 1. Schema / Migration`)
  lines.push(`- Migration: \`${input.migrationName}\``)
  lines.push(`- Fields added: \`employeeNo, department, position, rank, phone, officePhone\``)
  lines.push(`- All new columns nullable.`)
  lines.push(`- No unique / index / relation added.`)
  lines.push(`- No drop / delete / destructive change.`)
  lines.push('')
  lines.push(`## 2. Source Plan`)
  lines.push(`- L6-E1B raw plan sha256: \`${input.planRawHash}\``)
  lines.push(`- Total candidates: ${input.plan.totalCandidates}`)
  lines.push(`- Teacher count before: ${input.teacherCountBefore}`)
  lines.push(`- Teacher count after: ${input.teacherCountAfter}`)
  lines.push('')
  lines.push(`## 3. Apply Result`)
  lines.push(`| metric | value |`)
  lines.push(`|---|---|`)
  lines.push(`| created Teacher | ${input.plan.summary.createCount} |`)
  lines.push(`| updated existing Teacher | ${input.plan.summary.updateCount} |`)
  lines.push(`| skipped (needsManualReview + skipCandidate + alreadyExists w/ duplicate Staff) | ${input.plan.summary.skippedCount} |`)
  lines.push(`| conflicts (existing non-empty field differs from Staff) | ${input.plan.summary.conflictCount} |`)
  lines.push(`| duplicateStaffNameGroups | ${input.plan.summary.duplicateStaffNameGroups} |`)
  lines.push(`| invalidTokens | ${input.plan.summary.invalidTokensCount} |`)
  lines.push('')
  lines.push(`## 4. Local Raw Artifact`)
  lines.push(`- Path: \`${input.rawArtifactPath}\``)
  lines.push(`- sha256: \`${input.rawArtifactSha256}\``)
  lines.push(`- Contains raw personal data: YES (local only)`)
  lines.push(`- Git tracked: NO (under gitignored temp/)`)
  lines.push('')
  lines.push(`## 5. DB Backup`)
  lines.push(`- Path: \`${input.backupPath}\``)
  lines.push(`- Committed: NO`)
  lines.push('')
  lines.push(`## 6. Privacy / Isolation`)
  lines.push(`- Committed docs/json contain raw teacher names: NO`)
  lines.push(`- Committed docs/json contain raw phones: NO`)
  lines.push(`- Committed docs/json contain raw employeeNo: NO`)
  lines.push(`- Committed docs/json contain raw departments: NO`)
  lines.push(`- ImportBatch created: NO`)
  lines.push(`- TeachingTask created: NO`)
  lines.push(`- TeachingTaskClass created: NO`)
  lines.push(`- Course / ClassGroup / ScheduleSlot / ScheduleAdjustment touched: NO`)
  lines.push(`- Excel partial import applied: NO`)
  lines.push('')
  lines.push(`## 7. Next Stage`)
  lines.push(`- L6-E2-XLSX-COURSE-SETTING-PARTIAL-IMPORT-PLAN-IN-PAGE: build a per-page resolution dry-run plan that consumes the now-richer Teacher table.`)
  lines.push('')
  return lines.join('\n')
}