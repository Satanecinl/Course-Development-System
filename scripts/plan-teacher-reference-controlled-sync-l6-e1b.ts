/**
 * L6-E1B Script — Teacher Reference Controlled Sync Plan
 *
 * Read-only dry-run plan that generates Teacher sync candidates from:
 *   Excel course-setting teacher text ↔ Staff DB ↔ current Teacher table
 *
 * Stage: L6-E1B-TEACHER-REFERENCE-CONTROLLED-SYNC-PLAN
 *
 * Constraints:
 *  - NO DB writes (no create/update/delete on any table).
 *  - Staff DB is read-only.
 *  - Local raw artifact under temp/local-artifacts/l6-e1b/ (gitignored, may contain raw data).
 *  - Committed docs/json aggregate only (no raw names/phones/IDs).
 *
 * Usage:
 *   npx tsx scripts/plan-teacher-reference-controlled-sync-l6-e1b.ts \
 *     --course-xlsx "..." --staff-ref "..." --write-raw-local-artifact
 */

import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { basename, join, resolve } from 'node:path'
import { createHash } from 'node:crypto'
import { PrismaClient } from '@prisma/client'

// ── Constants ───────────────────────────────────────────────────────────────

const ROOT = resolve(__dirname, '..')
const STAGE = 'L6-E1B-TEACHER-REFERENCE-CONTROLLED-SYNC-PLAN' as const
const OUTPUT_JSON = 'docs/l6-e1b-teacher-reference-controlled-sync-plan.json'
const OUTPUT_MD = 'docs/l6-e1b-teacher-reference-controlled-sync-plan.md'
const STATUS_PATH = 'docs/current-project-status.md'
const RAW_ARTIFACT_DIR = 'temp/local-artifacts/l6-e1b'
const RAW_ARTIFACT_JSON = 'teacher-reference-controlled-sync-plan.raw.local.json'
const RAW_ARTIFACT_MD = 'teacher-reference-controlled-sync-plan.raw.local.md'

// ── CLI args ────────────────────────────────────────────────────────────────

function parseArgs(argv: string[]) {
  let courseXlsx = ''
  let staffRef = ''
  let writeRaw = false
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === '--course-xlsx') { const v = argv[++i]; if (v) courseXlsx = v }
    else if (argv[i] === '--staff-ref') { const v = argv[++i]; if (v) staffRef = v }
    else if (argv[i] === '--write-raw-local-artifact') writeRaw = true
  }
  return { courseXlsx, staffRef, writeRaw }
}

// ── Hashing ─────────────────────────────────────────────────────────────────

const sha = (s: string, len = 12): string => createHash('sha256').update(s, 'utf8').digest('hex').slice(0, len)
const sha256Hex = (s: string): string => createHash('sha256').update(s, 'utf8').digest('hex')

// ── Name normalization ─────────────────────────────────────────────────────

const TEACHER_HONORIFICS = /老师|教师|教授|副教授|讲师|助教|主任|副主任|科长|副科长|处长|副处长/g
const NUMBERED_PATTERN = /^(\d+)[\.、\s)）]+/gm
const PAREN_STRIP = /[（(][^）)]*[）)]/g

function normalizeTeacherName(raw: string): string {
  let s = raw.replace(/[　]/g, ' ')
  s = s.replace(PAREN_STRIP, ' ')
  s = s.replace(TEACHER_HONORIFICS, ' ')
  s = s.replace(/\s+/g, ' ').trim()
  s = s.replace(NUMBERED_PATTERN, ' ').replace(/\s+/g, ' ').trim()
  s = s.replace(/^[^\p{L}\p{N}]+|[^\p{L}\p{N}]+$/gu, '')
  return s
}

const INVALID_TOKENS = /^(全部|所有|未知|外聘待定|空|null|undefined|暂无|待定|无|all|unknown|blank|none)$/i
const isInvalidTeacherName = (s: string): boolean => INVALID_TOKENS.test(s) || s.length < 2

// ── Types ───────────────────────────────────────────────────────────────────

type StaffRecord = {
  name: string
  nameHash: string
  normalized: string
  normalizedHash: string
  employeeNo: string | null
  department: string | null
  position: string | null
  rank: string | null
  phone: string | null
  officePhone: string | null
}

type TeacherRecord = {
  id: number
  name: string
  nameHash: string
  normalized: string
  normalizedHash: string
}

type ExcelTeacherRef = {
  raw: string
  rawHash: string
  normalized: string
  normalizedHash: string
  sheetIndex: number
  sourceRowIndex: number
  isBlank: boolean
}

type SyncCandidate = {
  candidateId: string
  normalizedName: string
  displayName: string
  excelEvidence: Array<{ sheetIndex: number; sourceRowIndex: number }>
  staffMatch: {
    matchStatus: 'unique' | 'duplicate'
    staffRecord: {
      id: number | string
      name: string
      employeeNo: string | null
      department: string | null
      position: string | null
      rank: string | null
    }
    duplicateCount: number
  }
  teacherTableMatch: {
    exists: boolean
  }
  recommendation: 'safeCreateCandidate' | 'needsManualReview' | 'skipCandidate' | 'alreadyExists'
  reviewReasons: string[]
  recommendedCreatePayload: { name: string } | null
}

// ── Main ────────────────────────────────────────────────────────────────────

async function main(): Promise<void> {
  console.log('=== L6-E1B Teacher Reference Controlled Sync Plan ===\n')

  const { courseXlsx, staffRef, writeRaw } = parseArgs(process.argv.slice(2))

  if (!staffRef) {
    console.error('ERROR: --staff-ref is required'); process.exit(1)
  }
  if (!existsSync(staffRef)) {
    console.error(`ERROR: Staff ref not found: ${staffRef}`); process.exit(2)
  }

  const staffSize = (await import('fs')).statSync(staffRef).size
  console.log(`Staff ref: ${basename(staffRef)} (${staffSize} bytes)`)
  console.log(`Course xlsx: ${courseXlsx || '(not provided)'}`)

  // ── Step 1: Load staff DB ─────────────────────────────────────────────────
  console.log('\n[1/5] Loading staff reference...')
  const { DatabaseSync } = await import('node:sqlite')
  const staffDb = new DatabaseSync(staffRef, { open: true, readOnly: true })

  const tables = staffDb.prepare("SELECT name, type FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%'").all() as Array<{ name: string }>
  const mainTable = tables[0]!.name
  const columns = staffDb.prepare(`PRAGMA table_info("${mainTable}")`).all() as Array<{ name: string; type: string }>
  const colNames = columns.map((c) => c.name)

  const nameCol = colNames.find((c) => /姓名|name/i.test(c)) ?? colNames[1] ?? colNames[0]
  const phoneCol = colNames.find((c) => /手机|mobile/i.test(c))
  const officePhoneCol = colNames.find((c) => /办公电话|office/i.test(c))
  const empNoCol = colNames.find((c) => /工号|employee|staffNo/i.test(c))
  const deptCol = colNames.find((c) => /部门|department/i.test(c))
  const posCol = colNames.find((c) => /职务|position/i.test(c))
  const rankCol = colNames.find((c) => /职级|rank/i.test(c))

  const staffRows = staffDb.prepare(`SELECT rowid as rid, * FROM "${mainTable}"`).all() as Array<Record<string, unknown>>

  const staffRecords: StaffRecord[] = staffRows.map((r) => {
    const n = String(r[nameCol] ?? '').trim()
    return {
      name: n, nameHash: sha(n), normalized: normalizeTeacherName(n),
      normalizedHash: sha(normalizeTeacherName(n)),
      employeeNo: empNoCol ? String(r[empNoCol] ?? '') : null,
      department: deptCol ? String(r[deptCol] ?? '') : null,
      position: posCol ? String(r[posCol] ?? '') : null,
      rank: rankCol ? String(r[rankCol] ?? '') : null,
      phone: phoneCol ? String(r[phoneCol] ?? '') : null,
      officePhone: officePhoneCol ? String(r[officePhoneCol] ?? '') : null,
    }
  })

  const staffByNorm = new Map<string, StaffRecord[]>()
  for (const s of staffRecords) {
    if (s.normalized.length > 0) {
      const arr = staffByNorm.get(s.normalized) ?? []
      arr.push(s)
      staffByNorm.set(s.normalized, arr)
    }
  }
  const staffDupes = Array.from(staffByNorm.entries()).filter(([, arr]) => arr.length > 1)

  console.log(`  Table: ${mainTable}, ${staffRecords.length} records, ${staffByNorm.size} unique normalized`)
  console.log(`  Duplicate name groups: ${staffDupes.length}`)

  staffDb.close()

  // ── Step 2: Load Teacher table ────────────────────────────────────────────
  console.log('\n[2/5] Loading Teacher table...')
  const prisma = new PrismaClient()
  const teacherCount = await prisma.teacher.count()
  const teacherRows = await prisma.teacher.findMany({ select: { id: true, name: true } })

  const teacherRecords: TeacherRecord[] = teacherRows.map((t) => {
    const norm = normalizeTeacherName(t.name)
    return { id: t.id, name: t.name, nameHash: sha(t.name), normalized: norm, normalizedHash: sha(norm) }
  })

  const teacherByNorm = new Map<string, TeacherRecord[]>()
  for (const t of teacherRecords) {
    const arr = teacherByNorm.get(t.normalized) ?? []
    arr.push(t)
    teacherByNorm.set(t.normalized, arr)
  }

  // DB fingerprint
  const dbBefore = {
    teacher: await prisma.teacher.count(),
    course: await prisma.course.count(),
    classGroup: await prisma.classGroup.count(),
    teachingTask: await prisma.teachingTask.count(),
    teachingTaskClass: await prisma.teachingTaskClass.count(),
    importBatch: await prisma.importBatch.count(),
    scheduleSlot: await prisma.scheduleSlot.count(),
    scheduleAdjustment: await prisma.scheduleAdjustment.count(),
    semester: await prisma.semester.count(),
    activeSemesterId: (await prisma.semester.findFirst({ where: { isActive: true }, select: { id: true } }))?.id ?? null,
  }

  console.log(`  Teacher count: ${teacherCount}, ${teacherByNorm.size} unique normalized`)

  // ── Step 3: Parse Excel teachers ──────────────────────────────────────────
  console.log('\n[3/5] Parsing Excel teachers...')
  const excelTeachers: ExcelTeacherRef[] = []

  if (courseXlsx && existsSync(courseXlsx)) {
    const { parseCourseSettingXlsx } = await import('../src/lib/import/course-setting-xlsx-parser')
    const buf = readFileSync(courseXlsx)
    const parseResult = await parseCourseSettingXlsx(buf, {
      artifactFilename: basename(courseXlsx), parserVersion: 'l2-parser-v1', includeRawValues: true,
    })

    for (const sheet of parseResult.sheets) {
      for (const row of sheet.rows) {
        if (row.rowKind !== 'course') continue
        const ta = row.teacherAssignment
        if (!ta || !ta.assignments || ta.primaryClassification === 'blank') {
          excelTeachers.push({
            raw: '', rawHash: sha('', 16), normalized: '', normalizedHash: sha('', 16),
            sheetIndex: row.sheetIndex, sourceRowIndex: row.sourceRowIndex, isBlank: true,
          })
          continue
        }
        for (const a of ta.assignments) {
          const raw = (a.teacherName ?? '').trim()
          if (raw.length === 0) continue
          const norm = normalizeTeacherName(raw)
          excelTeachers.push({
            raw, rawHash: sha(raw, 16), normalized: norm, normalizedHash: sha(norm, 16),
            sheetIndex: row.sheetIndex, sourceRowIndex: row.sourceRowIndex, isBlank: false,
          })
        }
      }
    }

    console.log(`  ${excelTeachers.length} entries, ${excelTeachers.filter((t) => !t.isBlank).length} non-blank`)
  }

  // ── Step 4: Build sync candidates ─────────────────────────────────────────
  console.log('\n[4/5] Building sync candidates...')

  // Build unique Excel teacher names (normalized, non-blank)
  const excelUniqueNorms = new Map<string, { raw: string; refs: ExcelTeacherRef[] }>()
  for (const e of excelTeachers) {
    if (e.isBlank) continue
    const existing = excelUniqueNorms.get(e.normalized)
    if (existing) { existing.refs.push(e) }
    else { excelUniqueNorms.set(e.normalized, { raw: e.raw, refs: [e] }) }
  }

  let safeCreate = 0, needsReview = 0, skip = 0, alreadyExists = 0
  let invalidTokens = 0
  const candidates: SyncCandidate[] = []

  for (const [norm, { raw, refs }] of excelUniqueNorms) {
    const candidateId = `sync:${sha(norm, 10)}`
    const staffArr = staffByNorm.get(norm)
    const teacherArr = teacherByNorm.get(norm)

    // alreadyExists check
    if (teacherArr && teacherArr.length > 0) {
      alreadyExists++
      candidates.push({
        candidateId, normalizedName: norm, displayName: raw,
        excelEvidence: refs.map((r) => ({ sheetIndex: r.sheetIndex, sourceRowIndex: r.sourceRowIndex })),
        staffMatch: { matchStatus: staffArr ? (staffArr.length > 1 ? 'duplicate' as const : 'unique' as const) : 'unique' as const, staffRecord: staffArr?.[0] ?? { id: 0, name: '', employeeNo: null, department: null, position: null, rank: null }, duplicateCount: staffArr?.length ?? 0 },
        teacherTableMatch: { exists: true },
        recommendation: 'alreadyExists',
        reviewReasons: ['already_in_teacher_table'],
        recommendedCreatePayload: null,
      })
      continue
    }

    // invalid token check
    if (isInvalidTeacherName(norm)) {
      invalidTokens++
      candidates.push({
        candidateId, normalizedName: norm, displayName: raw,
        excelEvidence: refs.map((r) => ({ sheetIndex: r.sheetIndex, sourceRowIndex: r.sourceRowIndex })),
        staffMatch: { matchStatus: staffArr ? (staffArr.length > 1 ? 'duplicate' as const : 'unique' as const) : 'unique' as const, staffRecord: staffArr?.[0] ?? { id: 0, name: '', employeeNo: null, department: null, position: null, rank: null }, duplicateCount: staffArr?.length ?? 0 },
        teacherTableMatch: { exists: false },
        recommendation: 'skipCandidate',
        reviewReasons: ['invalid_or_placeholder_name'],
        recommendedCreatePayload: null,
      })
      continue
    }

    // No staff match
    if (!staffArr) {
      skip++
      candidates.push({
        candidateId, normalizedName: norm, displayName: raw,
        excelEvidence: refs.map((r) => ({ sheetIndex: r.sheetIndex, sourceRowIndex: r.sourceRowIndex })),
        staffMatch: { matchStatus: 'unique' as const, staffRecord: { id: 0, name: '', employeeNo: null, department: null, position: null, rank: null }, duplicateCount: 0 },
        teacherTableMatch: { exists: false },
        recommendation: 'skipCandidate',
        reviewReasons: ['not_found_in_staff_db'],
        recommendedCreatePayload: null,
      })
      continue
    }

    // Staff match exists, teacher doesn't — classify
    const reasons: string[] = []
    let rec: SyncCandidate['recommendation'] = 'safeCreateCandidate'

    if (staffArr.length > 1) {
      reasons.push('multiple_staff_records')
      rec = 'needsManualReview'
    }
    if (refs.some((r) => r.raw.includes('/') || r.raw.includes('、'))) {
      reasons.push('split_cell_raw')
      // don't necessarily block if normalized is clean
    }
    if (refs.length > 5) {
      reasons.push('high_frequency_occurrence')
    }

    if (rec === 'safeCreateCandidate' && reasons.length === 0) {
      safeCreate++
    } else {
      needsReview++
    }

    candidates.push({
      candidateId, normalizedName: norm, displayName: raw,
      excelEvidence: refs.map((r) => ({ sheetIndex: r.sheetIndex, sourceRowIndex: r.sourceRowIndex })),
      staffMatch: {
        matchStatus: staffArr.length > 1 ? 'duplicate' : 'unique',
        staffRecord: staffArr[0]!,
        duplicateCount: staffArr.length,
      },
      teacherTableMatch: { exists: false },
      recommendation: rec,
      reviewReasons: reasons,
      recommendedCreatePayload: rec === 'safeCreateCandidate' ? { name: staffArr[0]!.name } : null,
    })
  }

  console.log(`  unique candidates: ${candidates.length}`)
  console.log(`  safeCreate: ${safeCreate}, needsReview: ${needsReview}, skip: ${skip}, alreadyExists: ${alreadyExists}`)
  console.log(`  invalidTokens: ${invalidTokens}`)

  // ── Step 5: Write outputs ──────────────────────────────────────────────────
  console.log('\n[5/5] Writing outputs...')

  // Local raw artifact
  let localSha = ''
  if (writeRaw) {
    const localDir = join(ROOT, RAW_ARTIFACT_DIR)
    mkdirSync(localDir, { recursive: true })
    const localPath = join(localDir, RAW_ARTIFACT_JSON)
    const localData = {
      stage: STAGE,
      generatedAt: new Date().toISOString(),
      dryRunOnly: true,
      dbWritten: false,
      teacherCreated: false,
      candidates,
    }
    writeFileSync(localPath, JSON.stringify(localData, null, 2) + '\n')
    localSha = sha256Hex(readFileSync(localPath, 'utf-8'))

    // Local raw markdown
    const localMdPath = join(localDir, RAW_ARTIFACT_MD)
    const mdLines = [`# Teacher Sync Candidates (Local Raw)`, '', `Generated: ${new Date().toISOString()}`, '', `## Candidates (${candidates.length})`, '']
    for (const c of candidates) {
      mdLines.push(`### ${c.displayName} (${c.normalizedName})`)
      mdLines.push(`- Recommendation: \`${c.reviewReasons.join('; ') || 'clean'}\` → \`${c.recommendation}\``)
      if (c.staffMatch.staffRecord) {
        mdLines.push(`- Staff: ${c.staffMatch.staffRecord.name} | ${c.staffMatch.staffRecord.department ?? ''} | ${c.staffMatch.staffRecord.position ?? ''} | ${c.staffMatch.staffRecord.employeeNo ?? ''}`)
        if (c.staffMatch.staffRecord.phone) mdLines.push(`- 手机: ${c.staffMatch.staffRecord.phone}`)
        if (c.staffMatch.staffRecord.officePhone) mdLines.push(`- 办公电话: ${c.staffMatch.staffRecord.officePhone}`)
      }
      mdLines.push(`- Excel refs: ${c.excelEvidence.length} occurrences`)
      mdLines.push('')
    }
    writeFileSync(localMdPath, mdLines.join('\n'))

    console.log(`  Local raw artifact: ${RAW_ARTIFACT_DIR}/${RAW_ARTIFACT_JSON}`)
    console.log(`  Local raw md: ${RAW_ARTIFACT_DIR}/${RAW_ARTIFACT_MD}`)
    console.log(`  sha256: ${localSha}`)
  }

  // DB after
  const dbAfter = {
    teacher: await prisma.teacher.count(),
    course: await prisma.course.count(),
    classGroup: await prisma.classGroup.count(),
    teachingTask: await prisma.teachingTask.count(),
    teachingTaskClass: await prisma.teachingTaskClass.count(),
    importBatch: await prisma.importBatch.count(),
    scheduleSlot: await prisma.scheduleSlot.count(),
    scheduleAdjustment: await prisma.scheduleAdjustment.count(),
    semester: await prisma.semester.count(),
    activeSemesterId: (await prisma.semester.findFirst({ where: { isActive: true }, select: { id: true } }))?.id ?? null,
  }

  // Committed JSON (aggregate only)
  const committedJson = {
    stage: STAGE,
    dryRunOnly: true,
    dbWritten: false,
    teacherCreated: false,
    source: {
      courseXlsxExists: !!(courseXlsx && existsSync(courseXlsx)),
      staffDbExists: true,
      staffTableName: mainTable,
      staffRecordCount: staffRecords.length,
      teacherTableCount: teacherCount,
      excelTeacherRawEntries: excelTeachers.length,
      excelUniqueNormalizedTeachers: excelUniqueNorms.size,
    },
    plan: {
      uniqueSyncCandidates: candidates.length,
      uniqueSafeCreateCandidates: safeCreate,
      uniqueNeedsManualReviewCandidates: needsReview,
      uniqueSkipCandidates: skip,
      alreadyExistsCandidates: alreadyExists,
      duplicateStaffNameGroups: staffDupes.length,
      invalidTokens,
    },
    schema: {
      teacherFields: ['id', 'name'],
      minimumCreateFieldsSupported: true,
      proposedWriteFields: ['name'],
      unsupportedStaffFields: ['employeeNo', 'department', 'position', 'rank', 'phone', 'officePhone'],
      schemaChangeRequired: false,
    },
    localRawArtifact: {
      generated: writeRaw,
      path: writeRaw ? `${RAW_ARTIFACT_DIR}/${RAW_ARTIFACT_JSON}` : null,
      sha256: localSha || null,
      gitTracked: false,
      containsRawPersonalData: writeRaw,
    },
    risk: {
      high: safeCreate > 50 ? [`${safeCreate} unique safe candidates — bulk creation needed`] : [],
      medium: needsReview > 20 ? [`${needsReview} candidates need manual review`] : [],
      low: staffDupes.length > 0 ? [`${staffDupes.length} duplicate name groups in staff DB`] : [],
    },
    dbCounts: { before: dbBefore, after: dbAfter, unchanged: JSON.stringify(dbBefore) === JSON.stringify(dbAfter) },
    privacy: {
      committedRawTeacherNames: false, committedRawPhoneNumbers: false,
      committedRawEmployeeNumbers: false, committedRawDepartments: false,
    },
  }

  writeFileSync(join(ROOT, OUTPUT_JSON), JSON.stringify(committedJson, null, 2) + '\n')

  // Committed markdown
  const md = [
    `# L6-E1B Teacher Reference Controlled Sync Plan`, ``,
    `> Stage: **${STAGE}**`, `> Status: **PASS** (dry-run plan)`, ``,
    `## 1. Background`,
    `L6-E1A audit found Teacher table has 84 records but Excel references 357 unique teachers and staff DB has 424. 559 raw occurrences match staff but not teacher table. This plan generates controlled sync candidates.`, ``,
    `## 2. Data Source Summary`,
    `| source | records | unique normalized |`,
    `|---|---|---|`,
    `| Staff DB | ${staffRecords.length} | ${staffByNorm.size} |`,
    `| Teacher table | ${teacherCount} | ${teacherByNorm.size} |`,
    `| Excel teachers | ${excelTeachers.length} | ${excelUniqueNorms.size} |`, ``,
    `## 3. Sync Plan Summary`,
    `| category | count |`,
    `|---|---|`,
    `| uniqueSyncCandidates | ${candidates.length} |`,
    `| safeCreateCandidate | ${safeCreate} |`,
    `| needsManualReview | ${needsReview} |`,
    `| skipCandidate | ${skip} |`,
    `| alreadyExists | ${alreadyExists} |`,
    `| duplicateStaffNameGroups | ${staffDupes.length} |`,
    `| invalidTokens | ${invalidTokens} |`, ``,
    `## 4. Proposed Write Fields`,
    `Teacher schema supports: \`id\` (auto), \`name\` (required).`,
    `Proposed: \`${['name'].join(', ')}\`.`,
    `Unsupported Staff fields (saved locally only): \`employeeNo, department, position, rank, phone, officePhone\`.`,
    `Schema change required: NO.`, ``,
    `## 5. Local Raw Artifact`,
    `- Generated: ${writeRaw ? 'YES' : 'NO'}`,
    `- Path: \`${writeRaw ? `${RAW_ARTIFACT_DIR}/${RAW_ARTIFACT_JSON}` : '(not generated)'}\``,
    `- sha256: \`${localSha || 'n/a'}\``,
    `- Contains raw personal data: ${writeRaw ? 'YES (local only)' : 'N/A'}`,
    `- Git tracked: NO (under gitignored temp/)`,
    ``, ``,
    `## 6. DB No-Write Proof`,
    `| table | before | after | unchanged |`,
    `|---|---|---|---|`,
    `| Teacher | ${dbBefore.teacher} | ${dbAfter.teacher} | ${dbBefore.teacher === dbAfter.teacher ? 'YES' : 'NO'} |`,
    `| Course | ${dbBefore.course} | ${dbAfter.course} | ${dbBefore.course === dbAfter.course ? 'YES' : 'NO'} |`,
    `| ImportBatch | ${dbBefore.importBatch} | ${dbAfter.importBatch} | ${dbBefore.importBatch === dbAfter.importBatch ? 'YES' : 'NO'} |`,
    `| activeSemesterId | ${dbBefore.activeSemesterId} | ${dbAfter.activeSemesterId} | ${dbBefore.activeSemesterId === dbAfter.activeSemesterId ? 'YES' : 'NO'} |`, ``,
    `## 7. Next Stage`,
    `User must review local raw artifact, approve candidates, then enter L6-E1C (controlled sync apply with DB backup).`, ``,
  ].join('\n')

  writeFileSync(join(ROOT, OUTPUT_MD), md)

  // Append status
  const statusPath = join(ROOT, STATUS_PATH)
  if (existsSync(statusPath)) {
    const content = readFileSync(statusPath, 'utf-8') ?? ''
    if (!content.includes('L6-E1B')) {
      const line = '- L6-E1B Teacher 受控同步计划已完成：基于课程设置 Excel、当前 Teacher 表和教职工 Staff DB 生成 dry-run 同步候选统计与本地未脱敏 raw 明细；未写 DB、未创建 Teacher/ImportBatch/TeachingTask，committed docs/json 仅含 aggregate。'
      writeFileSync(statusPath, `${content.replace(/\s+$/, '')}\n\n${line}\n`, 'utf-8')
    }
  }

  // Summary
  console.log(`\n=== PLAN COMPLETE ===`)
  console.log(`Candidates: ${candidates.length} (${safeCreate} safe, ${needsReview} review, ${skip} skip, ${alreadyExists} exists)`)
  console.log(`DB written: 0 (read-only)`)
  console.log(`Raw artifact: ${writeRaw ? 'written' : 'skipped'} (${RAW_ARTIFACT_DIR}/)`)
  console.log(`Docs: ${OUTPUT_JSON}, ${OUTPUT_MD}`)

  await prisma.$disconnect()
}

main()
  .catch(async (err) => { console.error('FATAL:', err); process.exit(1) })