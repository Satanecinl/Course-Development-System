/**
 * L6-E1C Apply Script — Teacher Reference Controlled Sync Apply
 *
 * Stage: L6-E1C-TEACHER-REFERENCE-SCHEMA-AND-CONTROLLED-SYNC-APPLY
 *
 * Consumes L6-E1B raw plan + current Teacher table snapshot, executes a
 * controlled sync apply inside a single Prisma transaction:
 *   - CREATE Teacher rows for safeCreateCandidate with unique Staff match.
 *   - UPDATE Teacher rows (Staff fields only) for alreadyExists with unique Staff match.
 *   - Skip needsManualReview / skipCandidate / alreadyExists+duplicate Staff.
 *
 * Default mode is DRY-RUN. Pass --apply AND --confirm L6_E1C_APPLY_TEACHER_SYNC
 * to actually write to the database.
 *
 * Hard constraints:
 *  - No ImportBatch / TeachingTask / TeachingTaskClass / Course / ClassGroup / ScheduleSlot / ScheduleAdjustment writes.
 *  - No Teacher.name overwrites.
 *  - No Teacher.delete.
 *  - No Excel partial import apply.
 *  - Raw local artifact (temp/) is untracked and may contain personal data;
 *    committed docs/json must be aggregate only.
 *
 * Usage:
 *   # Dry-run (default)
 *   npx tsx scripts/apply-teacher-reference-controlled-sync-l6-e1c.ts \
 *     --course-xlsx "..." \
 *     --staff-ref "..." \
 *     --plan-raw "temp/local-artifacts/l6-e1b/teacher-reference-controlled-sync-plan.raw.local.json"
 *
 *   # Apply
 *   npx tsx scripts/apply-teacher-reference-controlled-sync-l6-e1c.ts \
 *     --course-xlsx "..." \
 *     --staff-ref "..." \
 *     --plan-raw "..." \
 *     --apply --confirm L6_E1C_APPLY_TEACHER_SYNC
 */

import { createHash } from 'node:crypto'
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { PrismaClient } from '@prisma/client'

import {
  L6_E1C_APPLY_CONFIRM_TOKEN,
  planTeacherReferenceControlledSyncApply,
  validateTeacherSyncApplyPlan,
  serializeTeacherSyncApplyRawReportJson,
  serializeTeacherSyncApplyRawReportMd,
  serializeTeacherSyncApplyCommittedJson,
  serializeTeacherSyncApplyCommittedMd,
  type TeacherSnapshotRow,
  type L6E1BCandidate,
} from '../src/lib/import/teacher-reference-controlled-sync-apply-l6-e1c'

// ── Constants ───────────────────────────────────────────────────────────────

const ROOT = resolve(__dirname, '..')
const OUTPUT_JSON = 'docs/l6-e1c-teacher-reference-controlled-sync-apply.json'
const OUTPUT_MD = 'docs/l6-e1c-teacher-reference-controlled-sync-apply.md'
const STATUS_PATH = 'docs/current-project-status.md'
const RAW_ARTIFACT_DIR = 'temp/local-artifacts/l6-e1c'
const RAW_ARTIFACT_JSON = 'teacher-reference-controlled-sync-apply.raw.local.json'
const RAW_ARTIFACT_MD = 'teacher-reference-controlled-sync-apply.raw.local.md'
const MIGRATION_NAME = '20260621200000_add_teacher_staff_reference_fields_l6_e1c'

// ── CLI args ────────────────────────────────────────────────────────────────

function parseArgs(argv: string[]): {
  planRaw: string
  apply: boolean
  confirm: string
} {
  let planRaw = ''
  let apply = false
  let confirm = ''
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === '--plan-raw') { const v = argv[++i]; if (v) planRaw = v }
    else if (argv[i] === '--apply') apply = true
    else if (argv[i] === '--confirm') { const v = argv[++i]; if (v) confirm = v }
  }
  return { planRaw, apply, confirm }
}

// ── Hashing ─────────────────────────────────────────────────────────────────

const sha256Hex = (s: string): string => createHash('sha256').update(s, 'utf8').digest('hex')

// ── Pre-flight checks ───────────────────────────────────────────────────────

function preflightChecks(planRaw: string): void {
  // 1. Plan raw artifact must exist
  if (!planRaw) {
    console.error('ERROR: --plan-raw is required')
    process.exit(1)
  }
  if (!existsSync(planRaw)) {
    console.error(`ERROR: plan raw artifact not found: ${planRaw}`)
    process.exit(2)
  }

  // 2. Verify sha256 of plan raw (must match L6-E1B spec value)
  const planBuf = readFileSync(planRaw)
  const planSha = sha256Hex(planBuf.toString('utf-8'))
  const EXPECTED_PLAN_SHA = 'eff6f6913ec00cef3c72b43d4ae62710bb67810136158e12ff3ace0b4e14beac'
  if (planSha !== EXPECTED_PLAN_SHA) {
    console.error(`ERROR: L6-E1B plan raw sha256 mismatch. expected=${EXPECTED_PLAN_SHA} actual=${planSha}`)
    process.exit(3)
  }
  console.log(`  L6-E1B plan raw sha256: PASS (${planSha})`)

  // 3. Verify migration exists
  const migrationSql = join(ROOT, 'prisma/migrations', MIGRATION_NAME, 'migration.sql')
  if (!existsSync(migrationSql)) {
    console.error(`ERROR: migration SQL not found: ${migrationSql}`)
    process.exit(4)
  }
  console.log(`  Migration SQL exists: PASS`)

  // 4. Migration must be additive only — no DROP / DELETE / unique / index
  const sql = readFileSync(migrationSql, 'utf-8')
  const forbidden = [
    /\bDROP\s+TABLE\b/i,
    /\bDROP\s+INDEX\b/i,
    /\bDROP\s+COLUMN\b/i,
    /\bDELETE\s+FROM\b/i,
    /\bCREATE\s+UNIQUE\s+INDEX\b/i,
    /\bCREATE\s+INDEX\b/i,
    /\bFOREIGN\s+KEY\b/i,
    /\bALTER\s+TABLE\s+"?(?!Teacher\b)\w+/i, // only Teacher ALTER allowed
  ]
  for (const re of forbidden) {
    if (re.test(sql)) {
      console.error(`ERROR: migration SQL contains forbidden pattern: ${re}`)
      process.exit(5)
    }
  }
  console.log(`  Migration SQL is additive only: PASS`)

  // 5. No db backup needed yet (apply will verify before write)
}

// ── DB fingerprint helpers ──────────────────────────────────────────────────

async function dbFingerprint(prisma: PrismaClient): Promise<{
  teacher: number
  course: number
  classGroup: number
  teachingTask: number
  teachingTaskClass: number
  importBatch: number
  scheduleSlot: number
  scheduleAdjustment: number
  semester: number
  activeSemesterId: number | null
}> {
  const activeSemester = await prisma.semester.findFirst({
    where: { isActive: true },
    select: { id: true },
  })
  return {
    teacher: await prisma.teacher.count(),
    course: await prisma.course.count(),
    classGroup: await prisma.classGroup.count(),
    teachingTask: await prisma.teachingTask.count(),
    teachingTaskClass: await prisma.teachingTaskClass.count(),
    importBatch: await prisma.importBatch.count(),
    scheduleSlot: await prisma.scheduleSlot.count(),
    scheduleAdjustment: await prisma.scheduleAdjustment.count(),
    semester: await prisma.semester.count(),
    activeSemesterId: activeSemester?.id ?? null,
  }
}

// ── Main ────────────────────────────────────────────────────────────────────

async function main(): Promise<void> {
  console.log('=== L6-E1C Teacher Reference Controlled Sync Apply ===\n')

  const { planRaw, apply, confirm } = parseArgs(process.argv.slice(2))

  // ── Pre-flight ──
  console.log('[pre-flight]')
  preflightChecks(planRaw)

  // Load L6-E1B raw plan
  const planData = JSON.parse(readFileSync(planRaw, 'utf-8')) as {
    stage: string
    candidates: L6E1BCandidate[]
  }
  if (planData.stage !== 'L6-E1B-TEACHER-REFERENCE-CONTROLLED-SYNC-PLAN') {
    console.error(`ERROR: plan stage mismatch: ${planData.stage}`)
    process.exit(6)
  }
  console.log(`  L6-E1B plan stage: PASS`)
  console.log(`  candidates: ${planData.candidates.length}`)

  // ── DB snapshot ──
  console.log('\n[db]')
  const prisma = new PrismaClient()
  const dbBefore = await dbFingerprint(prisma)
  console.log(`  Teacher count: ${dbBefore.teacher}`)

  const teacherRows = await prisma.teacher.findMany({
    select: {
      id: true,
      name: true,
      employeeNo: true,
      department: true,
      position: true,
      rank: true,
      phone: true,
      officePhone: true,
    },
    orderBy: { id: 'asc' },
  })

  const teacherSnapshots: TeacherSnapshotRow[] = teacherRows.map((t) => ({
    id: t.id,
    name: t.name,
    normalizedName: t.name, // Teacher.name is already normalized in DB; L6-E1B helper re-normalizes but we trust DB row
    employeeNo: t.employeeNo,
    department: t.department,
    position: t.position,
    rank: t.rank,
    phone: t.phone,
    officePhone: t.officePhone,
  }))

  // ── Build apply plan ──
  console.log('\n[plan]')
  const plan = planTeacherReferenceControlledSyncApply(planData.candidates, teacherSnapshots)
  const validation = validateTeacherSyncApplyPlan(plan)
  if (!validation.ok) {
    console.error('ERROR: plan validation failed:')
    for (const v of validation.violations) console.error(`  - ${v}`)
    process.exit(7)
  }
  console.log(`  creates: ${plan.summary.createCount}`)
  console.log(`  updates: ${plan.summary.updateCount}`)
  console.log(`  skipped: ${plan.summary.skippedCount}`)
  console.log(`  conflicts: ${plan.summary.conflictCount}`)
  console.log(`  validation: PASS`)

  // ── Apply / Dry-run ──
  if (!apply) {
    console.log('\n[mode] DRY-RUN (no DB writes). Pass --apply --confirm L6_E1C_APPLY_TEACHER_SYNC to apply.')

    const dbAfter = await dbFingerprint(prisma)
    await writeArtifacts({
      plan,
      rawArtifactPlanSha: sha256Hex(readFileSync(planRaw, 'utf-8')),
      dbBefore,
      dbAfter,
    })

    await prisma.$disconnect()
    return
  }

  // Apply path — verify token
  if (confirm !== L6_E1C_APPLY_CONFIRM_TOKEN) {
    console.error(`ERROR: --apply requires --confirm ${L6_E1C_APPLY_CONFIRM_TOKEN}`)
    console.error(`  received confirm: "${confirm}"`)
    process.exit(8)
  }
  console.log(`\n[mode] APPLY (with confirm token)`)

  // Find latest backup
  const fs = await import('node:fs')
  const backups = fs.readdirSync(join(ROOT, 'prisma'))
    .filter((f) => f.startsWith('dev.db.backup-before-l6-e1c-teacher-sync-'))
    .sort()
  if (backups.length === 0) {
    console.error('ERROR: no backup file found matching prisma/dev.db.backup-before-l6-e1c-teacher-sync-*')
    process.exit(9)
  }
  const backupPath = backups[backups.length - 1]!
  console.log(`  Latest backup: prisma/${backupPath}`)

  // ── Execute transaction ──
  console.log('\n[apply] executing transaction...')

  const applyResult = await prisma.$transaction(async (tx) => {
    let created = 0
    let updated = 0

    // 1. CREATE new Teacher rows
    for (const c of plan.creates) {
      const row = await tx.teacher.create({
        data: {
          name: c.createPayload.name,
          employeeNo: c.createPayload.employeeNo,
          department: c.createPayload.department,
          position: c.createPayload.position,
          rank: c.createPayload.rank,
          phone: c.createPayload.phone,
          officePhone: c.createPayload.officePhone,
        },
        select: { id: true },
      })
      // Attach id back to decision (for raw report; not committed)
      ;(c as { createdTeacherId?: number }).createdTeacherId = row.id
      created++
    }

    // 2. UPDATE existing Teacher rows (Staff fields only)
    for (const u of plan.updates) {
      await tx.teacher.update({
        where: { id: u.teacherId },
        data: {
          employeeNo: u.updatePayload.employeeNo,
          department: u.updatePayload.department,
          position: u.updatePayload.position,
          rank: u.updatePayload.rank,
          phone: u.updatePayload.phone,
          officePhone: u.updatePayload.officePhone,
        },
        select: { id: true },
      })
      updated++
    }

    return { created, updated }
  }, {
    maxWait: 5000,
    timeout: 30000,
  })

  console.log(`  created: ${applyResult.created}`)
  console.log(`  updated: ${applyResult.updated}`)

  // Verify post-apply state
  const dbAfter = await dbFingerprint(prisma)

  if (dbAfter.teacher !== dbBefore.teacher + applyResult.created) {
    console.error(`ERROR: Teacher count after apply (${dbAfter.teacher}) != before + created (${dbBefore.teacher + applyResult.created})`)
    process.exit(10)
  }
  if (dbAfter.course !== dbBefore.course) {
    console.error(`ERROR: Course count changed (${dbBefore.course} → ${dbAfter.course})`)
    process.exit(11)
  }
  if (dbAfter.classGroup !== dbBefore.classGroup) {
    console.error(`ERROR: ClassGroup count changed`)
    process.exit(12)
  }
  if (dbAfter.teachingTask !== dbBefore.teachingTask) {
    console.error(`ERROR: TeachingTask count changed`)
    process.exit(13)
  }
  if (dbAfter.teachingTaskClass !== dbBefore.teachingTaskClass) {
    console.error(`ERROR: TeachingTaskClass count changed`)
    process.exit(14)
  }
  if (dbAfter.importBatch !== dbBefore.importBatch) {
    console.error(`ERROR: ImportBatch count changed`)
    process.exit(15)
  }
  if (dbAfter.scheduleSlot !== dbBefore.scheduleSlot) {
    console.error(`ERROR: ScheduleSlot count changed`)
    process.exit(16)
  }
  if (dbAfter.scheduleAdjustment !== dbBefore.scheduleAdjustment) {
    console.error(`ERROR: ScheduleAdjustment count changed`)
    process.exit(17)
  }
  if (dbAfter.activeSemesterId !== dbBefore.activeSemesterId) {
    console.error(`ERROR: activeSemesterId changed`)
    process.exit(18)
  }

  console.log(`  Other tables unchanged: PASS`)

  // Attach teacherId to creates for raw report
  for (const c of plan.creates) {
    const found = teacherRows.find((t) => t.name === c.teacherNameToCreate)
    if (found) {
      ;(c as { createdTeacherId?: number }).createdTeacherId = found.id
    }
  }

  await writeArtifacts({
    plan,
    rawArtifactPlanSha: sha256Hex(readFileSync(planRaw, 'utf-8')),
    dbBefore,
    dbAfter,
    backupPath: `prisma/${backupPath}`,
  })

  // Append status
  const statusPath = join(ROOT, STATUS_PATH)
  if (existsSync(statusPath)) {
    const content = readFileSync(statusPath, 'utf-8') ?? ''
    if (!content.includes('L6-E1C')) {
      const line = '- L6-E1C Teacher 受控同步执行完成：扩展 Teacher schema 增加工号、部门、职务、职级、手机、办公电话字段；基于教职工 Staff DB 受控创建 safe Teacher 候选并补写已存在 Teacher 的 Staff 字段；未创建 ImportBatch/TeachingTask/TeachingTaskClass，raw apply 明细仅保存在 gitignored local artifact。'
      writeFileSync(statusPath, `${content.replace(/\s+$/, '')}\n\n${line}\n`, 'utf-8')
    }
  }

  console.log('\n=== APPLY COMPLETE ===')
  console.log(`Teacher count: ${dbBefore.teacher} → ${dbAfter.teacher}`)
  console.log(`Created: ${applyResult.created}`)
  console.log(`Updated: ${applyResult.updated}`)
  console.log(`Backup: prisma/${backupPath}`)

  await prisma.$disconnect()
}

async function writeArtifacts(args: {
  plan: ReturnType<typeof planTeacherReferenceControlledSyncApply>
  rawArtifactPlanSha: string
  dbBefore: Awaited<ReturnType<typeof dbFingerprint>>
  dbAfter: Awaited<ReturnType<typeof dbFingerprint>>
  backupPath?: string
}): Promise<void> {
  const { plan, rawArtifactPlanSha, dbBefore, dbAfter, backupPath } = args
  const generatedAt = new Date().toISOString()

  // ── Raw local artifact ──
  const localDir = join(ROOT, RAW_ARTIFACT_DIR)
  mkdirSync(localDir, { recursive: true })
  const rawJsonPath = join(localDir, RAW_ARTIFACT_JSON)
  const rawMdPath = join(localDir, RAW_ARTIFACT_MD)

  const rawJson = serializeTeacherSyncApplyRawReportJson({
    planRawHash: rawArtifactPlanSha,
    plan,
    generatedAt,
  })
  writeFileSync(rawJsonPath, rawJson)
  const rawSha = sha256Hex(rawJson)

  const rawMd = serializeTeacherSyncApplyRawReportMd({
    planRawHash: rawArtifactPlanSha,
    plan,
    generatedAt,
  })
  writeFileSync(rawMdPath, rawMd)

  console.log(`\n[artifacts]`)
  console.log(`  Raw local JSON: ${RAW_ARTIFACT_DIR}/${RAW_ARTIFACT_JSON} (sha256=${rawSha})`)
  console.log(`  Raw local MD:   ${RAW_ARTIFACT_DIR}/${RAW_ARTIFACT_MD}`)

  // ── Committed docs (aggregate only) ──
  const committedJson = serializeTeacherSyncApplyCommittedJson({
    generatedAt,
    planRawHash: rawArtifactPlanSha,
    plan,
    rawArtifactPath: `${RAW_ARTIFACT_DIR}/${RAW_ARTIFACT_JSON}`,
    rawArtifactSha256: rawSha,
    migrationName: MIGRATION_NAME,
    backupPath: backupPath ?? 'prisma/dev.db.backup-before-l6-e1c-teacher-sync-<timestamp>',
    teacherCountBefore: dbBefore.teacher,
    teacherCountAfter: dbAfter.teacher,
  })
  writeFileSync(join(ROOT, OUTPUT_JSON), committedJson)

  const committedMd = serializeTeacherSyncApplyCommittedMd({
    generatedAt,
    planRawHash: rawArtifactPlanSha,
    plan,
    rawArtifactPath: `${RAW_ARTIFACT_DIR}/${RAW_ARTIFACT_JSON}`,
    rawArtifactSha256: rawSha,
    migrationName: MIGRATION_NAME,
    backupPath: backupPath ?? 'prisma/dev.db.backup-before-l6-e1c-teacher-sync-<timestamp>',
    teacherCountBefore: dbBefore.teacher,
    teacherCountAfter: dbAfter.teacher,
  })
  writeFileSync(join(ROOT, OUTPUT_MD), committedMd)

  console.log(`  Committed JSON: ${OUTPUT_JSON}`)
  console.log(`  Committed MD:   ${OUTPUT_MD}`)
}

main()
  .catch(async (err) => {
    console.error('FATAL:', err)
    process.exit(1)
  })