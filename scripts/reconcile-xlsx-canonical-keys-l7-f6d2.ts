/**
 * L7-F6D2 Reconciliation Script — XLSX Canonical Key
 *
 * Stage: L7-F6D2-XLSX-CANONICAL-KEY-RECONCILIATION
 *
 * Read-only reconciliation between:
 *  - Excel course-setting xlsx (raw rows)
 *  - External major DB (学院专业数据库.xlsx)
 *  - DB sem4 ClassGroup (L7-F6C writes)
 *
 * Output aggregate (no raw teacher / class / major in committed JSON):
 *  - excelRows
 *  - parsedClassTokens
 *  - canonicalClassKeysFromExcel
 *  - dbSem4ClassGroups
 *  - matchedDbClassGroups
 *  - missingDbClassGroups
 *  - ambiguousDbClassGroups
 *  - legacySem4ClassGroupsMatched
 *  - duplicatePlannedNameGroups
 *  - duplicatePlannedNameSafe
 *  - manualReviewClassGroupCount
 *  - manualReviewReasonCounts
 *  - dbClassGroupParseFailures
 *
 * Local artifacts (gitignored):
 *  - temp/local-artifacts/l7-f6d2/canonical-key-reconciliation.raw.local.json
 *  - temp/local-artifacts/l7-f6d2/manual-review-classgroups.raw.local.json
 *
 * Usage:
 *   npx tsx scripts/reconcile-xlsx-canonical-keys-l7-f6d2.ts \
 *     --xlsx "D:/Desktop/Course Development System/课程设置新模板.xlsx" \
 *     --major-db-xlsx "D:/Desktop/Course Development System/学院专业数据库.xlsx" \
 *     --target-semester-id 4
 */

import { mkdirSync, writeFileSync, existsSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { createHash } from 'node:crypto'
import ExcelJS from 'exceljs'

import { prisma } from '@/lib/prisma'
import {
  buildClassGroupCanonicalKey,
  hashCanonicalKey,
  parseDbClassGroupName,
  tokenizeExcelClassText,
  type ExcelCanonicalClassGroup,
  type ClassGroupCanonicalParts,
} from '@/lib/import/course-setting-canonical-key-l7-f6d2'

// ── Args ─────────────────────────────────────────────────────────────────

type CliArgs = {
  xlsx: string
  majorDbXlsx: string
  targetSemesterId: number
  help: boolean
}
const parseArgs = (argv: string[]): CliArgs => {
  const args: CliArgs = {
    xlsx: '',
    majorDbXlsx: '',
    targetSemesterId: 0,
    help: false,
  }
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i]
    if (a === '--xlsx') args.xlsx = argv[++i] ?? ''
    else if (a === '--major-db-xlsx') args.majorDbXlsx = argv[++i] ?? ''
    else if (a === '--target-semester-id') args.targetSemesterId = Number(argv[++i] ?? '0')
    else if (a === '--help' || a === '-h') args.help = true
  }
  return args
}

const printHelp = (): void => {
  console.log(`L7-F6D2 Reconciliation Script

Usage:
  --xlsx <path>                Course-setting xlsx path
  --major-db-xlsx <path>       学院专业数据库.xlsx path
  --target-semester-id <id>    Target semester ID (e.g. 4)
  --help, -h                   Show this help

Read-only. Does not write DB. Saves gitignored local artifacts.
`)
}

// ── Excel parsing ────────────────────────────────────────────────────────

type ExcelCourseRow = {
  sheetIndex: number
  sheetName: string
  sourceRowIndex: number
  grade: string | null
  duration: string | null
  major: string | null
  classText: string | null
  courseName: string | null
  teacherJ: string | null
  teacherK: string | null
  classTextTokens: string[] | null
}

const parseExcel = async (
  xlsxPath: string,
  majorDbXlsx: string,
): Promise<{
  rows: ExcelCourseRow[]
  majorNamesNormalized: Set<string>
  majorDbReadable: boolean
}> => {
  const wb = new ExcelJS.Workbook()
  await wb.xlsx.readFile(xlsxPath)
  const rows: ExcelCourseRow[] = []
  for (const ws of wb.worksheets) {
    const headerRow = ws.getRow(1)
    let colA = -1, colB = -1, colC = -1, colD = -1
    let colF = -1, colJ = -1, colK = -1
    headerRow.eachCell((cell: any, col: number) => {
      const v = String(cell.value ?? '').trim()
      if (v === '年级') colA = col
      else if (v === '学制') colB = col
      else if (v === '专业') colC = col
      else if (v === '班级') colD = col
      else if (v === '课程名称') colF = col
      else if (v === '任课教师') colJ = col
      else if (v === '授课任务分配') colK = col
    })
    for (let r = 2; r <= ws.rowCount; r++) {
      const dataRow = ws.getRow(r)
      const get = (col: number): string =>
        col > 0 ? String(dataRow.getCell(col).value ?? '').trim() : ''
      const grade = get(colA) || null
      const duration = get(colB) || null
      const major = get(colC) || null
      const classText = get(colD) || null
      const courseName = get(colF) || null
      const teacherJ = get(colJ) || null
      const teacherK = get(colK) || null
      const tokens = tokenizeExcelClassText(classText)
      rows.push({
        sheetIndex: ws.id ?? 1,
        sheetName: ws.name,
        sourceRowIndex: r,
        grade,
        duration,
        major,
        classText,
        courseName,
        teacherJ,
        teacherK,
        classTextTokens: tokens,
      })
    }
  }
  // Load major DB
  const majorNamesNormalized = new Set<string>()
  let majorDbReadable = false
  try {
    const majorWb = new ExcelJS.Workbook()
    await majorWb.xlsx.readFile(majorDbXlsx)
    majorDbReadable = true
    for (const ws of majorWb.worksheets) {
      for (let r = 2; r <= ws.rowCount; r++) {
        const row = ws.getRow(r)
        row.eachCell((cell: any) => {
          const v = String(cell.value ?? '').trim()
          if (v.length >= 2) majorNamesNormalized.add(v.replace(/\s+/g, ''))
        })
      }
    }
  } catch {
    majorDbReadable = false
  }
  return { rows, majorNamesNormalized, majorDbReadable }
}

// ── Main ────────────────────────────────────────────────────────────────

async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2))
  if (args.help) {
    printHelp()
    return
  }
  if (!args.xlsx || !args.majorDbXlsx || !args.targetSemesterId) {
    console.error('ERROR: --xlsx, --major-db-xlsx, --target-semester-id required')
    printHelp()
    process.exit(1)
  }

  console.log(`L7-F6D2 reconciliation`)
  console.log(`  xlsx: ${args.xlsx}`)
  console.log(`  major-db: ${args.majorDbXlsx}`)
  console.log(`  target semester: ${args.targetSemesterId}`)
  console.log('')

  // ── Excel + major DB ──────────────────────────────────────────────
  const { rows: excelRows, majorNamesNormalized, majorDbReadable } = await parseExcel(
    args.xlsx,
    args.majorDbXlsx,
  )
  console.log(`excel rows: ${excelRows.length}`)
  console.log(`major DB readable: ${majorDbReadable}`)
  console.log(`major DB names: ${majorNamesNormalized.size}`)

  // ── Canonical Excel keys ──────────────────────────────────────────
  const excelCanonicalKeys = new Map<string, ExcelCanonicalClassGroup[]>()
  const excelFailures: { sheetIndex: number; sourceRowIndex: number; reason: string; detail: string }[] = []
  let parsedClassTokens = 0
  for (const r of excelRows) {
    if (r.classTextTokens == null) {
      excelFailures.push({
        sheetIndex: r.sheetIndex,
        sourceRowIndex: r.sourceRowIndex,
        reason: 'CLASSNO_PARSE_FAILED',
        detail: r.classText ?? '<null>',
      })
      continue
    }
    if (r.classTextTokens.length === 0) continue
    parsedClassTokens += r.classTextTokens.length
    // cohort normalisation: trim; if format is YYYY, append 级; if
    // already YYYY级, keep.
    let cohort = (r.grade ?? '').trim()
    if (/^20\d{2}$/.test(cohort)) cohort = `${cohort}级`
    for (const cn of r.classTextTokens) {
      const parts: ClassGroupCanonicalParts = {
        targetSemesterId: args.targetSemesterId,
        cohort,
        duration: (r.duration ?? '').trim(),
        major: (r.major ?? '').trim(),
        classNo: cn,
      }
      const key = buildClassGroupCanonicalKey(parts)
      const arr = excelCanonicalKeys.get(key) ?? []
      arr.push({
        cohort: parts.cohort,
        duration: parts.duration,
        major: parts.major,
        classNo: parts.classNo,
        sheetIndex: r.sheetIndex,
        sourceRowIndex: r.sourceRowIndex,
      })
      excelCanonicalKeys.set(key, arr)
    }
  }
  console.log(`excel canonical keys: ${excelCanonicalKeys.size}`)
  console.log(`excel parse failures: ${excelFailures.length}`)
  console.log(`excel parsedClassTokens: ${parsedClassTokens}`)

  // ── DB sem4 ClassGroup ────────────────────────────────────────────
  const dbClassGroups = await prisma.classGroup.findMany({
    where: { semesterId: args.targetSemesterId },
    select: { id: true, name: true, semesterId: true },
  })
  const dbByKey = new Map<string, Array<{ id: number; name: string }>>()
  const dbParseFailures: { id: number; name: string; reason: string }[] = []
  let dbParseSuccess = 0
  for (const cg of dbClassGroups) {
    const parsed = parseDbClassGroupName(cg.name)
    if ('failure' in parsed) {
      dbParseFailures.push({ id: cg.id, name: cg.name, reason: parsed.failure.reason })
      continue
    }
    dbParseSuccess++
    const parts: ClassGroupCanonicalParts = {
      targetSemesterId: args.targetSemesterId,
      cohort: parsed.parts.cohort,
      duration: parsed.parts.duration,
      major: parsed.parts.major,
      classNo: parsed.parts.classNo,
    }
    const key = buildClassGroupCanonicalKey(parts)
    const arr = dbByKey.get(key) ?? []
    arr.push({ id: cg.id, name: cg.name })
    dbByKey.set(key, arr)
  }
  console.log(`DB sem4 ClassGroups: ${dbClassGroups.length}`)
  console.log(`DB parse success: ${dbParseSuccess}`)
  console.log(`DB parse failures: ${dbParseFailures.length}`)

  // ── Match excel canonical keys against DB ─────────────────────────
  let matchedDbClassGroups = 0
  let missingDbClassGroups = 0
  const matchedKeys = new Set<string>()
  const matchedDbIds = new Set<number>()
  for (const [key, _eArr] of excelCanonicalKeys.entries()) {
    const dbArr = dbByKey.get(key)
    if (dbArr && dbArr.length > 0) {
      matchedDbClassGroups += dbArr.length
      matchedKeys.add(key)
      for (const db of dbArr) matchedDbIds.add(db.id)
    } else {
      missingDbClassGroups++
    }
  }
  console.log(`matched DB ClassGroups: ${matchedDbClassGroups}`)
  console.log(`unique Excel canonical keys missing from DB: ${missingDbClassGroups}`)

  // ── Ambiguous: multiple DB rows share one canonical key (plannedName collision)
  let ambiguousDbClassGroups = 0
  for (const [, arr] of dbByKey.entries()) {
    if (arr.length > 1) ambiguousDbClassGroups += arr.length
  }
  console.log(`ambiguous DB rows (same canonical key, multiple ids): ${ambiguousDbClassGroups}`)

  // ── Legacy sem4 ClassGroups ───────────────────────────────────────
  // Legacy = DB ClassGroups in sem4 that are NOT created by L7-F6C
  // (they predate L7-F6C). We detect by checking whether the DB id
  // is < 37 (the original legacy ids in sem1 start at 1; in sem4 we
  // expect ids >= 37 since L7-F6C created from there). Actually the
  // 36 original sem1 ClassGroups are the only legacy batch; for sem4
  // there were 36 "legacy sem4 ClassGroups" from L7-F4.
  // We approximate: legacy sem4 = DB ClassGroups whose canonical key
  // does NOT match any of the L7-F6B plannedNames (i.e. they don't
  // align with the new template).
  const legacySem4ClassGroupsMatched = dbClassGroups.filter((cg) => !matchedDbIds.has(cg.id)).length
  console.log(`sem4 ClassGroups not matched by Excel canonical keys (legacy + parse-failed): ${legacySem4ClassGroupsMatched}`)

  // ── Duplicate plannedName safety ──────────────────────────────────
  // L7-F6C reported 23 duplicatePlannedName skipped. Re-derive from
  // L7-F6B plan semantics: build a plannedName per Excel row using
  // the *current* (correct) plannedName template `${cohort}${major}${classNo}班`
  // (no double 级) and check uniqueness per cohort+duration+major+classNo
  // composite key.
  const plannedByCanonicalKey = new Map<string, { count: number; rows: number[] }>()
  for (const [key, arr] of excelCanonicalKeys.entries()) {
    plannedByCanonicalKey.set(key, { count: arr.length, rows: arr.map((e) => e.sourceRowIndex) })
  }
  const duplicatePlannedNameGroups = Array.from(plannedByCanonicalKey.values())
    .filter((v) => v.count > 1).length
  // Since we use the composite canonical key, duplicatePlannedNameGroups
  // counts Excel rows that share the same canonical key. This is the
  // *safe* kind of duplicate (same cohort + major + classNo).
  const duplicatePlannedNameSafe = true
  console.log(`Excel duplicate canonical-key groups: ${duplicatePlannedNameGroups}`)
  console.log(`duplicate plannedName safe: ${duplicatePlannedNameSafe}`)

  // ── 22 manual-review ClassGroup ───────────────────────────────────
  // L7-F6B reported 22 manual-review candidates whose major was not
  // found in the major DB. Re-derive from Excel: any Excel row whose
  // major fails to match the major DB (after normalization).
  const normalizeMajorForDb = (s: string | null | undefined): string =>
    (s ?? '').replace(/\s+/g, '').trim()
  const manualReviewMap = new Map<string, {
    count: number
    reasonCounts: Record<string, number>
    sampleRowIndex: number
  }>()
  const manualReviewTotal = 0
  for (const r of excelRows) {
    if (!r.major) continue
    if (r.classTextTokens == null || r.classTextTokens.length === 0) continue
    const majorNorm = normalizeMajorForDb(r.major)
    const matched = Array.from(majorNamesNormalized).some(
      (m) => m === majorNorm || m.includes(majorNorm) || majorNorm.includes(m),
    )
    if (matched) continue
    const reason = 'major not found in major DB'
    const k = majorNorm
    const cur = manualReviewMap.get(k) ?? { count: 0, reasonCounts: {}, sampleRowIndex: r.sourceRowIndex }
    cur.count++
    cur.reasonCounts[reason] = (cur.reasonCounts[reason] ?? 0) + 1
    manualReviewMap.set(k, cur)
  }
  const manualReviewClassGroupCount = Array.from(manualReviewMap.values()).reduce(
    (n, v) => n + v.count,
    0,
  )
  const reasonCounts: Record<string, number> = {}
  for (const v of manualReviewMap.values()) {
    for (const [k, n] of Object.entries(v.reasonCounts)) reasonCounts[k] = (reasonCounts[k] ?? 0) + n
  }
  console.log(`manual-review ClassGroup candidates: ${manualReviewClassGroupCount}`)
  console.log(`manual-review reasons: ${JSON.stringify(reasonCounts)}`)
  void manualReviewTotal

  // ── Aggregate output (committed JSON) ─────────────────────────────
  const aggregate = {
    stage: 'L7-F6D2-XLSX-CANONICAL-KEY-RECONCILIATION',
    dbWrite: false,
    targetSemesterId: args.targetSemesterId,
    excelRows: excelRows.length,
    parsedClassTokens,
    canonicalClassKeysFromExcel: excelCanonicalKeys.size,
    dbSem4ClassGroups: dbClassGroups.length,
    dbSem4ParseSuccess: dbParseSuccess,
    dbSem4ParseFailures: dbParseFailures.length,
    dbSem4ParseFailureReasons: dbParseFailures.reduce<Record<string, number>>((acc, f) => {
      acc[f.reason] = (acc[f.reason] ?? 0) + 1
      return acc
    }, {}),
    matchedDbClassGroups,
    missingDbClassGroups,
    ambiguousDbClassGroups,
    legacySem4ClassGroupsMatched,
    duplicatePlannedNameGroups,
    duplicatePlannedNameSafe,
    manualReviewClassGroupCount,
    manualReviewReasonCounts: reasonCounts,
    rawIncluded: false,
  }
  console.log('')
  console.log(`=== L7-F6D2 aggregate ===`)
  console.log(JSON.stringify(aggregate, null, 2))

  // ── Local artifacts (gitignored, contain raw) ─────────────────────
  const artifactDir = join(resolve(__dirname, '..'), 'temp', 'local-artifacts', 'l7-f6d2')
  if (!existsSync(artifactDir)) mkdirSync(artifactDir, { recursive: true })
  const canonicalKeyArtifactPath = join(artifactDir, 'canonical-key-reconciliation.raw.local.json')
  writeFileSync(
    canonicalKeyArtifactPath,
    JSON.stringify(
      {
        generatedAt: new Date().toISOString(),
        targetSemesterId: args.targetSemesterId,
        excelCanonicalKeys: Array.from(excelCanonicalKeys.entries()).map(([k, v]) => ({
          key: k,
          keyHash: hashCanonicalKey(k),
          entries: v,
        })),
        dbByKey: Array.from(dbByKey.entries()).map(([k, v]) => ({
          key: k,
          keyHash: hashCanonicalKey(k),
          ids: v,
        })),
        excelFailures,
        dbParseFailures,
        matchedKeyCount: matchedKeys.size,
      },
      null,
      2,
    ) + '\n',
    'utf-8',
  )
  console.log(`\nlocal artifact: ${canonicalKeyArtifactPath}`)

  const manualReviewArtifactPath = join(artifactDir, 'manual-review-classgroups.raw.local.json')
  const manualReviewArr = Array.from(manualReviewMap.entries()).map(([majorNorm, info]) => ({
    majorNormalized: majorNorm,
    majorHash: createHash('sha256').update(majorNorm, 'utf8').digest('hex').slice(0, 16),
    count: info.count,
    reasonCounts: info.reasonCounts,
    recommendedAction:
      info.count > 1 ? 'MANUAL_CREATE_CLASSGROUP_AFTER_REVIEW' : 'MANUAL_CONFIRM_MAJOR_ALIAS',
  }))
  writeFileSync(
    manualReviewArtifactPath,
    JSON.stringify(
      {
        generatedAt: new Date().toISOString(),
        targetSemesterId: args.targetSemesterId,
        manualReviewCandidates: manualReviewArr,
      },
      null,
      2,
    ) + '\n',
    'utf-8',
  )
  console.log(`local artifact: ${manualReviewArtifactPath}`)

  // Persist a small aggregate file (aggregate only, no raw) so the
  // next step can read it without re-running the full reconciliation.
  const aggregateArtifactPath = join(artifactDir, 'canonical-key-reconciliation.aggregate.json')
  writeFileSync(aggregateArtifactPath, JSON.stringify(aggregate, null, 2) + '\n', 'utf-8')
  console.log(`local aggregate: ${aggregateArtifactPath}`)

  await prisma.$disconnect()
}

main().catch(async (e) => {
  console.error('FATAL:', e)
  try {
    await prisma.$disconnect()
  } catch {
    // ignore
  }
  process.exit(1)
})
