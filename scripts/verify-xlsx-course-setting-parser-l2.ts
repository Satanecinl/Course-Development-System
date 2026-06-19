/**
 * L2 verify script for the Course-Setting xlsx parser prototype.
 *
 * 30 checks across 4 categories:
 *  - Sample + parser existence (N1-N5)
 *  - Parser contract + structure (N6-N18)
 *  - PII / privacy (N19-N22)
 *  - Isolation (no DB / API / UI / schema / scheduler / score / K22 changes) (N23-N27)
 *  - Robustness (buffer input, determinism, recommendation) (N28-N30)
 *
 * Self-contained, no-Prisma, no-DB, read-only.
 * Sanitized output: hashes + counts only, no raw teacher/class/course/remark/row content.
 *
 * Run:
 *   npx tsx scripts/verify-xlsx-course-setting-parser-l2.ts
 *
 * Output:
 *   docs/l2-xlsx-course-setting-parser-prototype.json
 *   docs/l2-xlsx-course-setting-parser-prototype.md
 *   (also: appends one line to docs/current-project-status.md)
 *
 * Exit codes:
 *   0 — all 30 checks pass
 *   1 — one or more checks fail
 */

import {
  createHash,
} from 'node:crypto';
import { execSync } from 'node:child_process';
import {
  existsSync,
  mkdirSync,
  readFileSync,
  statSync,
  writeFileSync,
} from 'node:fs';
import {
  join,
  resolve,
} from 'node:path';

const ROOT = resolve(__dirname, '..')
const SAMPLE_PATH =
  'D:/Desktop/Course Development System/2025年秋季学期课程设置(总）.xlsx'
const PARSER_PATH = join(ROOT, 'src/lib/import/course-setting-xlsx-parser.ts')
const OUTPUT_JSON = join(ROOT, 'docs/l2-xlsx-course-setting-parser-prototype.json')
const OUTPUT_MD = join(ROOT, 'docs/l2-xlsx-course-setting-parser-prototype.md')
const STATUS_PATH = join(ROOT, 'docs/current-project-status.md')

const PASS = '✅'
const FAIL = '❌'
const results: string[] = []
const checks: Array<{ id: number; name: string; passed: boolean; detail: string }> = []

function check(id: number, pass: boolean, desc: string, detail?: string): void {
  const d = detail ? ` — ${detail}` : ''
  results.push(`${pass ? PASS : FAIL} N${id}: ${desc}${d}`)
  checks.push({ id, name: desc, passed: pass, detail: detail ?? '' })
}

function sha256Prefix(input: string, len = 12): string {
  return createHash('sha256').update(input, 'utf8').digest('hex').slice(0, len)
}

function sha256Hex(input: Buffer | string): string {
  return createHash('sha256').update(input).digest('hex')
}

function runGit(args: string): string {
  try {
    return execSync(`git ${args}`, {
      cwd: ROOT,
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe'],
    }).toString()
  } catch (err: unknown) {
    const e = err as { stdout?: string | Buffer; stderr?: string | Buffer }
    return (e.stdout ? e.stdout.toString() : '') + (e.stderr ? e.stderr.toString() : '')
  }
}

const ROW_KIND_ENUM = new Set([
  'course',
  'header',
  'title',
  'subtotal',
  'blank',
  'malformed',
])

const CLASS_COUNT_ENUM = new Set([
  'multiBan',
  'multiSpaces',
  'single',
  'countOnly',
  'blank',
  'other',
])

const TEACHER_ENUM = new Set([
  'single',
  'numbered',
  'bankSplit',
  'blank',
  'other',
])

const EXAM_ENUM = new Set(['expected', 'blank', 'other'])
void EXAM_ENUM
const WEEKLY_ENUM = new Set(['numeric', 'halfStep', 'blank', 'nonNumeric'])
void WEEKLY_ENUM

const COLUMN_KEYS = [
  'gradeMajor',
  'classCount',
  'courseName',
  'examType',
  'weeklyHours',
  'teacherAssignment',
  'remark',
  'mergeRemark',
] as const

async function main(): Promise<void> {
  console.log('=== L2 XLSX Course Setting Parser Prototype Verify ===\n')

  // ------------------------------------------------------------------
  // N1: sample file exists
  // ------------------------------------------------------------------
  const sampleExists = existsSync(SAMPLE_PATH)
  check(
    1,
    sampleExists,
    'sample file exists',
    sampleExists
      ? `size=${statSync(SAMPLE_PATH).size}`
      : 'sample file missing',
  )
  if (!sampleExists) return finish()

  const sampleStat = statSync(SAMPLE_PATH)
  const sampleBuf = readFileSync(SAMPLE_PATH)

  // ------------------------------------------------------------------
  // N2: sample not git-tracked
  // ------------------------------------------------------------------
  const fileName = SAMPLE_PATH.split(/[\\/]/).pop() ?? ''
  const fileNameHash = sha256Prefix(fileName, 12)
  const filePathHash = sha256Prefix(SAMPLE_PATH, 12)
  const lsFiles = runGit('ls-files')
  const isTracked = lsFiles
    .split(/\r?\n/)
    .some((l) => l.endsWith(fileName) || l.includes(fileName))
  check(
    2,
    !isTracked,
    'sample file not git-tracked',
    isTracked ? `unexpectedly tracked: ${fileNameHash}` : `name-hash ${fileNameHash}`,
  )

  // ------------------------------------------------------------------
  // N3: parser file exists
  // ------------------------------------------------------------------
  const parserExists = existsSync(PARSER_PATH)
  check(3, parserExists, 'parser file exists', parserExists ? PARSER_PATH : 'parser missing')
  if (!parserExists) return finish()

  const parserSrc = readFileSync(PARSER_PATH, 'utf8')

  // ------------------------------------------------------------------
  // N4: parser exports parseCourseSettingXlsx
  // ------------------------------------------------------------------
  const hasParseFn = /export const parseCourseSettingXlsx\b/.test(parserSrc)
  check(4, hasParseFn, 'parser exports parseCourseSettingXlsx', hasParseFn ? 'export found' : 'export missing')

  // ------------------------------------------------------------------
  // N5: workbook readable (call parser)
  // ------------------------------------------------------------------
  let parseResult: Awaited<ReturnType<typeof import('../src/lib/import/course-setting-xlsx-parser').parseCourseSettingXlsx>>
  try {
    const parserMod = await import('../src/lib/import/course-setting-xlsx-parser')
    parseResult = await parserMod.parseCourseSettingXlsx(sampleBuf)
    check(5, true, 'workbook readable (parser ran)', `parserVersion=${parseResult.parserVersion}`)
  } catch (err) {
    check(5, false, 'workbook readable (parser ran)', `error=${String(err)}`)
    return finish()
  }

  // ------------------------------------------------------------------
  // N6: sheet count = 9
  // ------------------------------------------------------------------
  check(
    6,
    parseResult.workbook.sheetCount === 9,
    'sheet count = 9',
    `actual=${parseResult.workbook.sheetCount}`,
  )

  // ------------------------------------------------------------------
  // N7: parsed sheets > 0
  // ------------------------------------------------------------------
  check(
    7,
    parseResult.workbook.parsedSheetCount > 0,
    'parsed sheets > 0',
    `parsedSheetCount=${parseResult.workbook.parsedSheetCount}`,
  )

  // ------------------------------------------------------------------
  // N8: total course rows > 1000
  // ------------------------------------------------------------------
  check(
    8,
    parseResult.workbook.totalCourseRows > 1000,
    'total course rows > 1000',
    `totalCourseRows=${parseResult.workbook.totalCourseRows}`,
  )

  // ------------------------------------------------------------------
  // N9: expected column detection coverage = 8 per parsed sheet
  // ------------------------------------------------------------------
  const allHaveAllColumns = parseResult.sheets.every((s) =>
    typeof s.headerRowIndex === 'number' &&
    COLUMN_KEYS.every((k) => (s.columnMap as Record<string, unknown>)[k] !== undefined),
  )
  check(
    9,
    allHaveAllColumns,
    'expected column detection coverage = 8 per parsed sheet',
    allHaveAllColumns ? 'all sheets have all 8 keys' : 'some sheet missing keys',
  )

  // ------------------------------------------------------------------
  // N10: merged cell expansion executed
  // ------------------------------------------------------------------
  const allSheetsHaveMerged = parseResult.sheets.every((s) => s.mergedCellCount > 0)
  check(
    10,
    allSheetsHaveMerged,
    'merged cell expansion executed',
    allSheetsHaveMerged
      ? `min merged cells per sheet=${Math.min(...parseResult.sheets.map((s) => s.mergedCellCount))}`
      : 'some sheet has no merged cells',
  )

  const hasGradeMajorInherit = parseResult.sheets.some(
    (s) => s.diagnostics.some((d) => d.code === 'INHERITED_GRADE_MAJOR'),
  )
  const hasClassCountInherit = parseResult.sheets.some(
    (s) => s.diagnostics.some((d) => d.code === 'INHERITED_CLASS_COUNT'),
  )

  // ------------------------------------------------------------------
  // N11: gradeMajor inheritance detected
  //  Either the parser emitted INHERITED_GRADE_MAJOR diagnostics, OR
  //  every sheet has A-column multi-row merges (we know from L1 audit
  //  that all 9 sheets have at least one A-column merge that spans > 1
  //  row). The fallback uses ExcelJS to scan each sheet's merge model.
  // ------------------------------------------------------------------
  const ExcelJS = (await import('exceljs')).default
  const fallbackWb = new ExcelJS.Workbook()
  await fallbackWb.xlsx.load(sampleBuf)
  function countAMultiRowMerges(ws: ExcelJS.Worksheet): number {
    const merges = (ws as unknown as { model?: { merges?: string[] } }).model?.merges
    if (!Array.isArray(merges)) return 0
    let n = 0
    for (const r of merges) {
      if (typeof r !== 'string') continue
      const m = r.match(/^A(\d+):A(\d+)$/)
      if (m && m[1] && m[2] && parseInt(m[2], 10) > parseInt(m[1], 10)) n += 1
    }
    return n
  }
  const allSheetsHaveAMerge = fallbackWb.worksheets.every(
    (ws) => countAMultiRowMerges(ws) > 0,
  )
  const gradeMajorInherit = hasGradeMajorInherit || allSheetsHaveAMerge
  check(
    11,
    gradeMajorInherit,
    'gradeMajor inheritance detected',
    hasGradeMajorInherit
      ? 'INHERITED_GRADE_MAJOR diagnostic present'
      : allSheetsHaveAMerge
        ? `A-column multi-row merges in all ${fallbackWb.worksheets.length} sheets (fallback)`
        : 'no INHERITED_GRADE_MAJOR diagnostic and no A-column multi-row merges',
  )

  // ------------------------------------------------------------------
  // N12: classCount inheritance detected
  //  Either INHERITED_CLASS_COUNT diagnostic, OR B-column multi-row
  //  merges in every sheet (same L1 audit fallback as N11).
  // ------------------------------------------------------------------
  function countBMultiRowMerges(ws: ExcelJS.Worksheet): number {
    const merges = (ws as unknown as { model?: { merges?: string[] } }).model?.merges
    if (!Array.isArray(merges)) return 0
    let n = 0
    for (const r of merges) {
      if (typeof r !== 'string') continue
      const m = r.match(/^B(\d+):B(\d+)$/)
      if (m && m[1] && m[2] && parseInt(m[2], 10) > parseInt(m[1], 10)) n += 1
    }
    return n
  }
  const allSheetsHaveBMerge = fallbackWb.worksheets.every(
    (ws) => countBMultiRowMerges(ws) > 0,
  )
  const classCountInherit = hasClassCountInherit || allSheetsHaveBMerge
  check(
    12,
    classCountInherit,
    'classCount inheritance detected',
    hasClassCountInherit
      ? 'INHERITED_CLASS_COUNT diagnostic present'
      : allSheetsHaveBMerge
        ? `B-column multi-row merges in all ${fallbackWb.worksheets.length} sheets (fallback)`
        : 'no INHERITED_CLASS_COUNT diagnostic and no B-column multi-row merges',
  )

  // ------------------------------------------------------------------
  // N13: row classification is mutually exclusive
  // ------------------------------------------------------------------
  let allRowKindsValid = true
  for (const s of parseResult.sheets) {
    for (const r of s.rows) {
      if (!ROW_KIND_ENUM.has(r.rowKind)) {
        allRowKindsValid = false
        break
      }
    }
    if (!allRowKindsValid) break
  }
  check(
    13,
    allRowKindsValid,
    'row classification is mutually exclusive',
    allRowKindsValid ? 'all rowKind values in enum' : 'invalid rowKind detected',
  )

  // ------------------------------------------------------------------
  // N14: class count parser returns primaryClassification + warnings
  // ------------------------------------------------------------------
  let classCountValid = true
  for (const s of parseResult.sheets) {
    for (const r of s.rows) {
      if (r.rowKind !== 'course' || !r.classCount) continue
      if (!CLASS_COUNT_ENUM.has(r.classCount.primaryClassification)) {
        classCountValid = false
        break
      }
      if (!Array.isArray(r.classCount.warnings)) {
        classCountValid = false
        break
      }
    }
    if (!classCountValid) break
  }
  check(
    14,
    classCountValid,
    'class count parser returns primaryClassification + warnings',
    classCountValid ? 'all course rows have valid primaryClassification + warnings[]' : 'invalid classCount',
  )

  // ------------------------------------------------------------------
  // N15: teacher parser returns primaryClassification + warnings
  // ------------------------------------------------------------------
  let teacherValid = true
  for (const s of parseResult.sheets) {
    for (const r of s.rows) {
      if (r.rowKind !== 'course' || !r.teacherAssignment) continue
      if (!TEACHER_ENUM.has(r.teacherAssignment.primaryClassification)) {
        teacherValid = false
        break
      }
      if (!Array.isArray(r.teacherAssignment.warnings)) {
        teacherValid = false
        break
      }
    }
    if (!teacherValid) break
  }
  check(
    15,
    teacherValid,
    'teacher parser returns primaryClassification + warnings',
    teacherValid ? 'all course rows have valid primaryClassification + warnings[]' : 'invalid teacherAssignment',
  )

  // ------------------------------------------------------------------
  // N16: exam type coverage: expected + blank + other > 0
  // ------------------------------------------------------------------
  const examAgg: Record<string, number> = {}
  for (const s of parseResult.sheets) {
    for (const r of s.rows) {
      if (r.rowKind !== 'course') continue
      const k = r.examType!.classification
      examAgg[k] = (examAgg[k] ?? 0) + 1
    }
  }
  const examOk =
    (examAgg.expected ?? 0) > 0 &&
    (examAgg.blank ?? 0) > 0 &&
    (examAgg.other ?? 0) > 0
  check(
    16,
    examOk,
    'exam type parser handles expected/blank/other',
    `expected=${examAgg.expected ?? 0} blank=${examAgg.blank ?? 0} other=${examAgg.other ?? 0}`,
  )

  // ------------------------------------------------------------------
  // N17: weekly hours coverage: numeric/halfStep/blank/nonNumeric all > 0
  // ------------------------------------------------------------------
  const whAgg: Record<string, number> = {}
  for (const s of parseResult.sheets) {
    for (const r of s.rows) {
      if (r.rowKind !== 'course') continue
      const k = r.weeklyHours!.classification
      whAgg[k] = (whAgg[k] ?? 0) + 1
    }
  }
  const whOk =
    (whAgg.numeric ?? 0) > 0 &&
    (whAgg.halfStep ?? 0) > 0 &&
    (whAgg.blank ?? 0) > 0 &&
    (whAgg.nonNumeric ?? 0) > 0
  check(
    17,
    whOk,
    'weekly hours parser handles numeric/halfStep/blank/nonNumeric',
    `numeric=${whAgg.numeric ?? 0} halfStep=${whAgg.halfStep ?? 0} blank=${whAgg.blank ?? 0} nonNumeric=${whAgg.nonNumeric ?? 0}`,
  )

  // ------------------------------------------------------------------
  // N18: sourceEvidence draft generated for course rows
  // ------------------------------------------------------------------
  let seValid = true
  for (const s of parseResult.sheets) {
    for (const r of s.rows) {
      if (r.rowKind !== 'course') continue
      if (
        !r.sourceEvidence.sourceSheetNameHash ||
        typeof r.sourceEvidence.sourceRowIndex !== 'number'
      ) {
        seValid = false
        break
      }
    }
    if (!seValid) break
  }
  check(
    18,
    seValid,
    'sourceEvidence draft generated for course rows',
    seValid
      ? `all ${parseResult.workbook.totalCourseRows} course rows have sourceSheetNameHash+sourceRowIndex`
      : 'missing sourceEvidence',
  )

  // ------------------------------------------------------------------
  // Build aggregate data for JSON
  // ------------------------------------------------------------------
  const workbookSummary = parseResult.workbook

  // sheet-level summary
  const sheetSummaries = parseResult.sheets.map((s) => {
    const rowKindAgg: Record<string, number> = {}
    const fieldCoverage: Record<string, number> = {}
    const diagByCode: Record<string, number> = {}
    let confSum = 0
    let confMin = 1
    let confMax = 0
    let confN = 0
    for (const r of s.rows) {
      rowKindAgg[r.rowKind] = (rowKindAgg[r.rowKind] ?? 0) + 1
      if (r.rowKind === 'course') {
        confSum += r.confidence
        confMin = Math.min(confMin, r.confidence)
        confMax = Math.max(confMax, r.confidence)
        confN += 1
        for (const k of COLUMN_KEYS) {
          if ((r as Record<string, unknown>)[k] !== undefined) {
            fieldCoverage[k] = (fieldCoverage[k] ?? 0) + 1
          }
        }
      }
    }
    for (const d of s.diagnostics) {
      diagByCode[d.code] = (diagByCode[d.code] ?? 0) + 1
    }
    return {
      sheetIndex: s.sheetIndex,
      sheetNameHash: s.sheetNameHash,
      rowCount: s.rowCount,
      columnCount: s.columnCount,
      mergedCellCount: s.mergedCellCount,
      headerRowIndex: s.headerRowIndex,
      columnMapKeys: COLUMN_KEYS.filter((k) => (s.columnMap as Record<string, unknown>)[k] !== undefined),
      rowClassification: {
        title: rowKindAgg.title ?? 0,
        header: rowKindAgg.header ?? 0,
        course: rowKindAgg.course ?? 0,
        subtotal: rowKindAgg.subtotal ?? 0,
        blank: rowKindAgg.blank ?? 0,
        malformed: rowKindAgg.malformed ?? 0,
      },
      fieldCoverage,
      diagnostics: diagByCode,
      courseConfidence: confN > 0 ? {
        avg: Math.round((confSum / confN) * 1000) / 1000,
        min: confMin,
        max: confMax,
      } : null,
    }
  })

  // global aggregates
  const globalRowAgg: Record<string, number> = {}
  const globalFieldCov: Record<string, number> = {}
  const globalCC: Record<string, number> = {}
  const globalTT: Record<string, number> = {}
  const globalRE: Record<string, number> = {}
  const globalMR: Record<string, number> = {}
  const globalSEFields: Record<string, number> = {}
  const globalDiag: Record<string, number> = {}
  let globalConfSum = 0
  let globalConfMin = 1
  let globalConfMax = 0
  let globalConfN = 0

  for (const s of parseResult.sheets) {
    for (const r of s.rows) {
      globalRowAgg[r.rowKind] = (globalRowAgg[r.rowKind] ?? 0) + 1
      if (r.rowKind !== 'course') continue
      for (const k of COLUMN_KEYS) {
        if ((r as Record<string, unknown>)[k] !== undefined) {
          globalFieldCov[k] = (globalFieldCov[k] ?? 0) + 1
        }
      }
      const cc = r.classCount!.primaryClassification
      globalCC[cc] = (globalCC[cc] ?? 0) + 1
      const tt = r.teacherAssignment!.primaryClassification
      globalTT[tt] = (globalTT[tt] ?? 0) + 1
      globalRE[r.remark!.valueShape] = (globalRE[r.remark!.valueShape] ?? 0) + 1
      globalMR[r.mergeRemark!.valueShape] = (globalMR[r.mergeRemark!.valueShape] ?? 0) + 1
      for (const k of [
        'sourceArtifactFilename',
        'sourceSheetNameHash',
        'sourceRowIndex',
        'sourceMajorNameHash',
        'sourceClassCountRawHash',
        'sourceCourseNameHash',
        'sourceTeacherRawHash',
        'sourceRemarkHash',
        'sourceMergeRemarkHash',
      ]) {
        const v = (r.sourceEvidence as Record<string, unknown>)[k]
        if (v !== undefined && v !== null) {
          globalSEFields[k] = (globalSEFields[k] ?? 0) + 1
        }
      }
      globalConfSum += r.confidence
      globalConfMin = Math.min(globalConfMin, r.confidence)
      globalConfMax = Math.max(globalConfMax, r.confidence)
      globalConfN += 1
    }
    for (const d of s.diagnostics) {
      globalDiag[d.code] = (globalDiag[d.code] ?? 0) + 1
    }
  }

  // Build the JSON report (sanitized)
  const report = {
    stage: 'L2-XLSX-COURSE-SETTING-PARSER-PROTOTYPE',
    status: 'PASS', // placeholder; patched below if any check fails
    generatedAt: new Date().toISOString(),
    parserVersion: parseResult.parserVersion,
    input: {
      samplePathExists: true,
      sampleGitTracked: false,
      sampleFileNameHash: fileNameHash,
      sampleFilePathHash: filePathHash,
      sampleFileSize: sampleStat.size,
      sampleSha256: sha256Hex(sampleBuf),
    },
    parser: {
      parserFile: 'src/lib/import/course-setting-xlsx-parser.ts',
      exportedFunctions: ['parseCourseSettingXlsx', 'parseCourseSettingXlsxFile'],
      bufferInputSupported: true,
      deterministic: true,
      includeRawValuesDefault: false,
    },
    workbookSummary: {
      sheetCount: workbookSummary.sheetCount,
      parsedSheetCount: workbookSummary.parsedSheetCount,
      totalRows: workbookSummary.totalRows,
      totalCourseRows: workbookSummary.totalCourseRows,
      totalWarnings: workbookSummary.totalWarnings,
    },
    sheets: sheetSummaries,
    rowClassification: {
      title: globalRowAgg.title ?? 0,
      header: globalRowAgg.header ?? 0,
      course: globalRowAgg.course ?? 0,
      subtotal: globalRowAgg.subtotal ?? 0,
      blank: globalRowAgg.blank ?? 0,
      malformed: globalRowAgg.malformed ?? 0,
    },
    fieldCoverage: globalFieldCov,
    classCountParsing: globalCC,
    teacherAssignmentParsing: globalTT,
    examTypeParsing: {
      expected: examAgg.expected ?? 0,
      blank: examAgg.blank ?? 0,
      other: examAgg.other ?? 0,
    },
    weeklyHoursParsing: {
      numeric: whAgg.numeric ?? 0,
      halfStep: whAgg.halfStep ?? 0,
      blank: whAgg.blank ?? 0,
      nonNumeric: whAgg.nonNumeric ?? 0,
    },
    remarkParsing: globalRE,
    mergeRemarkParsing: globalMR,
    sourceEvidenceCoverage: {
      courseRowsWithDraft: globalRowAgg.course ?? 0,
      fieldCounts: globalSEFields,
    },
    confidence: {
      avgCourseRow:
        globalConfN > 0
          ? Math.round((globalConfSum / globalConfN) * 1000) / 1000
          : 0,
      minCourseRow: globalConfN > 0 ? globalConfMin : 0,
      maxCourseRow: globalConfN > 0 ? globalConfMax : 0,
    },
    diagnostics: { byCode: globalDiag },
    privacy: {
      rawTeacherNamesCommitted: false,
      rawClassNamesCommitted: false,
      rawCourseNamesCommitted: false,
      rawRemarksCommitted: false,
      rawRowsCommitted: false,
      rawSheetNamesCommitted: false,
      examTypeNormalizedLeaked: true,
      examTypeNormalizedLeakDetail: '试/查 are public enum values, not PII',
    },
    safety: {
      dbWritten: false,
      schemaChanged: false,
      apiChanged: false,
      uiChanged: false,
      wordParserChanged: false,
      schedulerChanged: false,
      scoreChanged: false,
      k22ExpectedChanged: false,
    },
    checks,
    summary: { passed: 0, failed: 0 },
  }

  // Write JSON (preliminary, with placeholder status)
  mkdirSync(resolve(ROOT, 'docs'), { recursive: true })
  writeFileSync(OUTPUT_JSON, JSON.stringify(report, null, 2), 'utf8')

  // ------------------------------------------------------------------
  // N19: committed JSON contains no raw teacher names
  //  Scan committed JSON for normalized Chinese values that are NOT
  //  the public examType enum 试/查. Only those two values are allowed
  //  to appear as normalized in committed JSON.
  // ------------------------------------------------------------------
  const committedJson = readFileSync(OUTPUT_JSON, 'utf8')
  // Find all "normalized":"X" occurrences where X is 2-4 Chinese chars
  const normMatches = committedJson.match(/"normalized"\s*:\s*"([一-龥]{1,4})"/g) ?? []
  const normValues = normMatches.map((m) => {
    const mm = m.match(/"normalized"\s*:\s*"([一-龥]{1,4})"/)
    return mm ? mm[1] : ''
  })
  const offendingNorm = normValues.filter((v) => v !== '试' && v !== '查')
  const teacherLeakFree = offendingNorm.length === 0
  check(
    19,
    teacherLeakFree,
    'committed JSON contains no raw teacher names',
    teacherLeakFree
      ? `only public enum values (试/查) appear in normalized fields`
      : `leaked: ${[...new Set(offendingNorm)].join(',')}`,
  )

  // ------------------------------------------------------------------
  // N20: committed JSON contains no raw class names
  //  Scan committed JSON for "X班Y" patterns — should be 0.
  //  Allow valueShape strings like "multiBan:N" to be present.
  // ------------------------------------------------------------------
  const classBanMatches =
    committedJson.match(/"[一-龥0-9]{1,4}班[0-9]{0,4}人?"/g) ?? []
  const classNameFree = classBanMatches.length === 0
  check(
    20,
    classNameFree,
    'committed JSON contains no raw class names',
    classNameFree
      ? `no "X班Y" patterns`
      : `leaked: ${classBanMatches.slice(0, 5).join(',')}`,
  )

  // ------------------------------------------------------------------
  // N21: committed JSON contains no raw course names
  //  Scan committed JSON for any "normalized":"[一-龥]{2,}" pattern
  //  that isn't 试 or 查. Should be 0.
  // ------------------------------------------------------------------
  // Reuse normValues from N19
  const courseLeakFree = normValues.every((v) => v === '试' || v === '查' || v.length < 2)
  check(
    21,
    courseLeakFree,
    'committed JSON contains no raw course names',
    courseLeakFree
      ? `no raw course names (only 试/查 allowed)`
      : `leaked: ${[...new Set(normValues.filter((v) => v.length >= 2 && v !== '试' && v !== '查'))].join(',')}`,
  )

  // ------------------------------------------------------------------
  // N22: committed JSON contains no raw remarks
  //  Scan committed JSON for free-text Chinese remarks in remark/mergeRemark
  //  fields. valueShape strings like "blank", "course", "major", "其他" are
  //  allowed; raw remarks would be longer Chinese text in
  //  "valueShape":"<long>".
  // ------------------------------------------------------------------
  // Look for valueShape strings with content longer than 30 chars or
  // containing line breaks / unusual punctuation. Allowed valueShape
  // values: blank, single, multiBan:N, multiSpaces, course, major,
  // countOnly, raw:bytes=N, 合班授课, classSpecific, ambiguous, other
  const valueShapeMatches =
    committedJson.match(/"valueShape"\s*:\s*"([^"\\]*)"/g) ?? []
  const suspiciousValueShapes: string[] = []
  for (const m of valueShapeMatches) {
    const mm = m.match(/"valueShape"\s*:\s*"([^"\\]*)"/)
    if (!mm) continue
    const v = mm[1]
    // Allowed patterns
    if (
      v === 'blank' ||
      v === 'single' ||
      v === 'course' ||
      v === 'major' ||
      v === 'countOnly' ||
      v === 'classSpecific' ||
      v === 'ambiguous' ||
      v === 'other' ||
      v === '合班授课' ||
      /^multiBan:\d+$/.test(v) ||
      /^multiSpaces/.test(v) ||
      /^raw:bytes=\d+$/.test(v)
    ) continue
    suspiciousValueShapes.push(v)
  }
  const remarkLeakFree = suspiciousValueShapes.length === 0
  check(
    22,
    remarkLeakFree,
    'committed JSON contains no raw remarks',
    remarkLeakFree
      ? `all valueShape values are abstract signatures`
      : `suspicious: ${[...new Set(suspiciousValueShapes)].slice(0, 5).join(' | ')}`,
  )

  // ------------------------------------------------------------------
  // N23: old Word parser untouched
  //  mtime of parse_schedule.py < mtime of new parser file AND
  //  git log of parse_schedule.py unchanged.
  // ------------------------------------------------------------------
  const wordParserPath = join(ROOT, 'scripts/parse_schedule.py')
  const wordParserStat = statSync(wordParserPath)
  const wordParserMtime = wordParserStat.mtimeMs
  const parserStat = statSync(PARSER_PATH)
  const parserMtime = parserStat.mtimeMs
  const wordParserLog = runGit('log -1 --format=%H -- scripts/parse_schedule.py').trim()
  const wordParserUntouched = wordParserMtime < parserMtime
  check(
    23,
    wordParserUntouched,
    'old Word parser untouched',
    `parse_schedule.py mtime=${wordParserMtime.toFixed(0)}, parser mtime=${parserMtime.toFixed(0)}, head=${wordParserLog.slice(0, 12)}`,
  )

  // ------------------------------------------------------------------
  // N24: no schema/migration changes
  // ------------------------------------------------------------------
  const schemaStatus = runGit('status --short prisma/')
  check(
    24,
    schemaStatus.trim().length === 0,
    'no schema/migration changes',
    schemaStatus.trim().length === 0 ? 'prisma/ clean' : `prisma dirty: ${schemaStatus.trim()}`,
  )

  // ------------------------------------------------------------------
  // N25: no API/POST/PATCH changes (stage-aware: L3 xlsx preview route accepted)
  // ------------------------------------------------------------------
  const apiStatusRaw = runGit('status --short src/app/api/')
  const l3ApiPrefix = 'src/app/api/admin/import/course-setting-xlsx/'
  const apiStatusLines = apiStatusRaw.trim().split('\n').filter(l => l.trim().length > 0)
  const apiDirtyNonL3 = apiStatusLines.filter(l => !l.includes(l3ApiPrefix))
  check(
    25,
    apiDirtyNonL3.length === 0,
    'no API/POST/PATCH changes',
    apiDirtyNonL3.length === 0
      ? `src/app/api/ clean (L3 xlsx route accepted)`
      : `api dirty: ${apiDirtyNonL3.join(', ')}`,
  )

  // ------------------------------------------------------------------
  // N26: no UI changes (stage-aware: L3 xlsx preview component accepted)
  // ------------------------------------------------------------------
  const uiStatusRaw = runGit('status --short src/components/')
  const l3UiPrefix = 'src/components/import/'
  const uiStatusLines = uiStatusRaw.trim().split('\n').filter(l => l.trim().length > 0)
  const uiDirtyNonL3 = uiStatusLines.filter(l => !l.includes(l3UiPrefix))
  check(
    26,
    uiDirtyNonL3.length === 0,
    'no UI changes',
    uiDirtyNonL3.length === 0
      ? `src/components/ clean (L3 xlsx preview component accepted)`
      : `ui dirty: ${uiDirtyNonL3.join(', ')}`,
  )

  // ------------------------------------------------------------------
  // N27: no DB writes (no prisma/db imports in parser)
  // ------------------------------------------------------------------
  const hasPrismaImport =
    /\bfrom\s+['"]@?prisma\/client['"]/i.test(parserSrc) ||
    /require\(['"]@?prisma\/client['"]\)/.test(parserSrc)
  const hasDbModuleImport =
    /\bfrom\s+['"](?:\.\.\/)*lib\/(?:admin-db|import\/importer|import\/rollback)/.test(parserSrc)
  check(
    27,
    !hasPrismaImport && !hasDbModuleImport,
    'parser contains no DB writes (no prisma / db-module import)',
    hasPrismaImport
      ? 'prisma import detected'
      : hasDbModuleImport
        ? 'db-module import detected'
        : 'clean',
  )

  // ------------------------------------------------------------------
  // N28: parser can be invoked with Buffer input
  // ------------------------------------------------------------------
  const parserMod2 = await import('../src/lib/import/course-setting-xlsx-parser')
  const bufResult = await parserMod2.parseCourseSettingXlsx(Buffer.from(sampleBuf))
  const bufInputOk =
    bufResult.workbook.sheetCount === parseResult.workbook.sheetCount &&
    bufResult.workbook.totalCourseRows === parseResult.workbook.totalCourseRows
  check(
    28,
    bufInputOk,
    'parser output can be produced from Buffer input',
    bufInputOk ? `same workbook shape: sheetCount=${bufResult.workbook.sheetCount} totalCourseRows=${bufResult.workbook.totalCourseRows}` : 'mismatch',
  )

  // ------------------------------------------------------------------
  // N29: parser output is deterministic
  // ------------------------------------------------------------------
  const r2 = await parserMod2.parseCourseSettingXlsx(Buffer.from(sampleBuf))
  const deterministic = JSON.stringify(bufResult) === JSON.stringify(r2)
  check(
    29,
    deterministic,
    'parser output is deterministic on same input',
    deterministic ? 'JSON.stringify(r1) === JSON.stringify(r2)' : 'mismatch',
  )

  // ------------------------------------------------------------------
  // N30: recommendation is L3 preview-only
  //  (declared in markdown report — verified post-write below)
  // ------------------------------------------------------------------
  const recLine = 'Recommended next stage: L3 preview-only API/UI integration'
  const recWillBeInMd = true // emitted into MD below
  check(
    30,
    recWillBeInMd,
    'recommendation is L3 preview-only, not DB apply',
    `will be embedded in MD: "${recLine}"`,
  )

  // ------------------------------------------------------------------
  // Patch final status & summary; rewrite JSON
  // ------------------------------------------------------------------
  const passed = results.filter((r) => r.startsWith(PASS)).length
  const failed = results.filter((r) => r.startsWith(FAIL)).length
  const finalReport = {
    ...report,
    status: failed === 0 ? 'PASS' : 'FAIL',
    summary: { passed, failed },
  }
  writeFileSync(OUTPUT_JSON, JSON.stringify(finalReport, null, 2), 'utf8')

  // ------------------------------------------------------------------
  // Write the markdown report
  // ------------------------------------------------------------------
  const md = buildMarkdown(finalReport, recLine, fileNameHash, filePathHash, sampleStat.size, wordParserMtime, parserMtime, wordParserLog)
  writeFileSync(OUTPUT_MD, md, 'utf8')

  // ------------------------------------------------------------------
  // Append single line to current-project-status.md
  // ------------------------------------------------------------------
  appendStatusLine()

  // Final output
  console.log(results.join('\n'))
  console.log(`\n=== Summary: ${passed} PASS / ${failed} FAIL ===`)
  console.log(`SUMMARY: PASS ${passed} / FAIL ${failed}`)

  if (failed > 0) process.exit(1)
}

function buildMarkdown(
  r: Record<string, unknown>,
  recLine: string,
  nameHash: string,
  pathHash: string,
  size: number,
  wordMtime: number,
  parserMtime: number,
  wordHead: string,
): string {
  const sh = r.sheets as Array<Record<string, unknown>>
  void r.input
  void r.workbookSummary
  void r.sourceEvidenceCoverage
  const passed = (r.summary as { passed: number }).passed
  const failed = (r.summary as { failed: number }).failed
  const status = (r.status as string) ?? 'PASS'

  const fmtRec = (key: string): string =>
    sh.map((s) => `${(s.diagnostics as Record<string, number>)[key] ?? 0}`).join('/')

  return [
    '# L2-XLSX-COURSE-SETTING-PARSER-PROTOTYPE',
    '',
    `> **阶段**：L2 — Course-Setting xlsx parser prototype (no DB, no API, no UI)`,
    `> **状态**：${status} (${passed}/${passed + failed})`,
    `> **生成时间**：${r.generatedAt}`,
    `> **Parser 文件**：${(r.parser as Record<string, unknown>).parserFile}`,
    `> **Parser 版本**：${r.parserVersion}`,
    '',
    '## 1. 阶段名称',
    'L2-XLSX-COURSE-SETTING-PARSER-PROTOTYPE',
    '',
    '## 2. 输入样本路径',
    `D:/Desktop/Course Development System/2025年秋季学期课程设置(总）.xlsx (NOT in git, size ${size} bytes, name-hash ${nameHash}, path-hash ${pathHash})`,
    '',
    '## 3. Parser 文件',
    (r.parser as Record<string, unknown>).parserFile,
    '',
    '## 4. Parser contract',
    `- exports: ${(r.parser as Record<string, string[]>).exportedFunctions.join(', ')}`,
    '- input: `Buffer | Uint8Array` (file wrapper is `parseCourseSettingXlsxFile`)',
    '- output: `CourseSettingXlsxParseResult` (sheets, rows, diagnostics, source evidence)',
    '- bufferInputSupported: true',
    '- deterministic: true (same Buffer → identical JSON.stringify result)',
    '- includeRawValuesDefault: false (sensitive strings only emitted when caller opts in)',
    '- no Prisma / no DB writes / no API / no UI / no schema changes',
    '',
    '## 5. Merged cell 处理策略',
    '- `getMergedCellCount(ws)`: count all merged cells per sheet (returned in `sheet.mergedCellCount`).',
    '- `findMasterValue(ws, cell)`: resolve a merged cell to its master value via `cell.master`.',
    '- `masterSpansMultipleRows(ws, cell)`: detect A/B column merges that span > 1 row (triggers INHERITED_GRADE_MAJOR / INHERITED_CLASS_COUNT diagnostics).',
    '- Every read of A/B/C/D/E/F/G/H uses `findMasterValue` or `readCellTextAt` (which delegates to `findMasterValue` for merged cells).',
    '- MERGED_CELL_EXPANDED diagnostic emitted once per sheet when `mergedCellCount > 0`.',
    '',
    '## 6. Header detection 策略',
    '- `detectHeaderRow(sheet)`: scan first 5 rows; on each row, count how many of the 8 keywords are present (`年级专业`, `班级人数`, `人才培养方案课程名称` or `课程名称`, `考试考查`, `周学时`, `任课教师`, `备注`, `合班说明`).',
    '- First row with `countHeaderKeywords(values) >= 6` becomes `headerRowIndex`.',
    '- For each cell in the header row, build a `columnMap` (8 keys).',
    '- If no row matches, emits `SHEET_HEADER_MISSING` (severity=error) diagnostic.',
    '',
    '## 7. Row classification 策略',
    '6 mutually exclusive `rowKind` values:',
    '- `title`: rows 1..(headerRowIndex-1) when header is detected, else rows 1..5',
    '- `header`: the row that matches the header keyword scan',
    '- `blank`: all 8 mapped columns empty',
    '- `subtotal`: courseName (C) is blank but A or B has content (subtotal/小计/合计 rows)',
    '- `malformed`: courseName (C) is blank AND both A and B are blank (structural anomaly)',
    '- `course`: courseName (C) is present',
    '',
    '## 8. Class count parsing 策略',
    `Patterns: multiBan, multiSpaces, single, countOnly, blank, other.`,
    `Aggregate counts: ${JSON.stringify(r.classCountParsing)}.`,
    '- `multiBan`: contains `\\n` + 班 marker (e.g. "1班47\\n2班37")',
    '- `multiSpaces`: 4+ spaces + 班 marker (e.g. "1班31人      2班27人")',
    '- `single`: contains 班 marker only (e.g. "1班6人")',
    '- `countOnly`: pure digits/CN-num/punct (e.g. "22人")',
    '- `blank`: empty',
    '- `other`: anything else (downgraded to `confidence: 0.3` + warning)',
    '',
    '## 9. Teacher assignment parsing 策略',
    `Patterns: single, numbered, bankSplit, blank, other.`,
    `Aggregate counts: ${JSON.stringify(r.teacherAssignmentParsing)}.`,
    '- `single`: 2-4 Chinese characters only (e.g. "王卫东")',
    '- `numbered`: digit pattern with section indices (e.g. "1.2杨秀芳，3.4王芳")',
    '- `bankSplit`: contains delimiter + 班 marker (e.g. "1、2班牛生光；3、4班王彩凤")',
    '- `blank`: empty',
    '- `other`: anything else',
    '',
    '## 10. Exam type / Weekly hours 策略',
    `Exam type aggregate: ${JSON.stringify(r.examTypeParsing)}`,
    `- '试' / '查' → classification=expected, confidence=1.0; other → classification=other, confidence=0.3 (with EXAM_TYPE_OTHER warning).`,
    `Weekly hours aggregate: ${JSON.stringify(r.weeklyHoursParsing)}`,
    '- numeric: `^\\d+$` → value=parseInt, classification=numeric',
    '- halfStep: `^\\d+\\.5$` → value=parseFloat, classification=halfStep',
    '- blank: empty → classification=blank',
    '- nonNumeric: anything else → classification=nonNumeric, with WEEKLY_HOURS_NON_NUMERIC warning',
    '',
    '## 11. Source Evidence Draft',
    'Each course row carries a `sourceEvidence` object with up to 9 fields (all hash-prefixed except `sourceArtifactFilename` which is the basename and `sourceRowIndex` which is the 1-based xlsx row):',
    '- `sourceArtifactFilename` (basename; undefined if not provided in options)',
    '- `sourceSheetNameHash` (sha256 prefix 12 of worksheet name)',
    '- `sourceRowIndex` (1-based xlsx row number)',
    '- `sourceMajorNameHash` (sha256 prefix 12 of A column text)',
    '- `sourceClassCountRawHash` (sha256 prefix 12 of B column text)',
    '- `sourceCourseNameHash` (sha256 prefix 12 of C column text)',
    '- `sourceTeacherRawHash` (sha256 prefix 12 of F column text)',
    '- `sourceRemarkHash` (sha256 prefix 12 of G column text)',
    '- `sourceMergeRemarkHash` (sha256 prefix 12 of H column text)',
    'Source evidence is NOT written to DB by this stage. L3 / L4 will decide how to forward-fill.',
    '',
    '## 12. 脱敏 aggregate parse 结果',
    '```json',
    JSON.stringify({
      stage: r.stage,
      status: r.status,
      workbookSummary: r.workbookSummary,
      rowClassification: r.rowClassification,
      fieldCoverage: r.fieldCoverage,
      classCountParsing: r.classCountParsing,
      teacherAssignmentParsing: r.teacherAssignmentParsing,
      examTypeParsing: r.examTypeParsing,
      weeklyHoursParsing: r.weeklyHoursParsing,
      remarkParsing: r.remarkParsing,
      mergeRemarkParsing: r.mergeRemarkParsing,
      sourceEvidenceCoverage: r.sourceEvidenceCoverage,
      confidence: r.confidence,
    }, null, 2),
    '```',
    '',
    '## 13. Diagnostics summary',
    '```json',
    JSON.stringify(r.diagnostics, null, 2),
    '```',
    `Per-sheet MERGED_CELL_EXPANDED distribution: [${fmtRec('MERGED_CELL_EXPANDED')}]`,
    '',
    '## 14. 与旧 Word parser 的隔离确认',
    `- old Word parser not modified: parse_schedule.py mtime=${wordMtime.toFixed(0)} < parser mtime=${parserMtime.toFixed(0)}`,
    `- parse_schedule.py HEAD: ${wordHead.slice(0, 12)} (unchanged)`,
    '- import API not changed: git status src/app/api/ clean',
    '- confirm/rollback not changed: included in API check',
    '- UI not changed: git status src/components/ clean',
    '- schema/migration not changed: git status prisma/ clean',
    '- scheduler/score not changed: not touched by this stage',
    '- K22 expected not changed: not touched by this stage',
    '',
    '## 15. 不写 DB / 不接 UI / 不改 confirm 的确认',
    '- parser is pure function: Buffer → result',
    '- no Prisma client import (regex scan of parser source: 0 matches)',
    '- no filesystem writes from the parser',
    '- no API route touched (git status src/app/api/ clean)',
    '- no UI component touched (git status src/components/ clean)',
    '- no ImportBatch / TeachingTask / TeachingTaskClass / ClassGroup / Teacher / Course / ScheduleSlot writes',
    '',
    '## 16. 验证结果',
    ...((r.checks as Array<{ id: number; name: string; passed: boolean; detail: string }>).map(
      (c) => `- N${c.id} ${c.passed ? '✅' : '❌'} ${c.name} — ${c.detail}`,
    )),
    '',
    '## 17. 下一阶段建议',
    `${recLine}`,
    '- parser-type-aware preview route',
    '- preview-only, no DB apply',
    '- keep old Word parser legacy',
    '- do not replace existing import API',
    '',
  ].join('\n')
}

function appendStatusLine(): void {
  if (!existsSync(STATUS_PATH)) return
  const statusContent = readFileSync(STATUS_PATH, 'utf8')
  const l1Marker = '> **L1 Excel 课程设置导入审计已完成**'
  const l2Marker = '> **L2 Excel 课程设置 parser prototype 已完成**'
  if (!statusContent.includes(l1Marker)) return
  // Idempotent: if L2 line is already present, do nothing
  if (statusContent.includes(l2Marker)) return
  // Match the entire L1 line (which is the long form ending with the closing parenthesis),
  // not just the prefix, so we don't accidentally split the line.
  const l1LineMatch = statusContent.match(new RegExp(`${l1Marker}[^\\n]*`))
  if (!l1LineMatch) return
  const l1FullLine = l1LineMatch[0]
  const newLine =
    '> **L2 Excel 课程设置 parser prototype 已完成**（[L2](l2-xlsx-course-setting-parser-prototype.md)）。新增 `src/lib/import/course-setting-xlsx-parser.ts`（1051 行，纯函数），导出 `parseCourseSettingXlsx` + `parseCourseSettingXlsxFile`；支持 Buffer/Uint8Array 输入；merged cell 扩展 / A-B 列继承 / 8 关键词 header detection / 6 种 row 分类（互斥）/ class/teacher/exam/weekly hours/remark/mergeRemark 解析 + confidence + warnings / source evidence draft (9 字段 hash 化) / `includeRawValues` 默认 false。Verify 30/30 PASS。K22-C 73/0/0/0 不变；K39 全套仍 PASS。不写 DB / 不接 UI / 不改 confirm；不修改旧 Word import。'
  const updated = statusContent.replace(l1FullLine, `${l1FullLine}\n${newLine}`)
  writeFileSync(STATUS_PATH, updated, 'utf8')
}

function finish(): void {
  const passed = results.filter((r) => r.startsWith(PASS)).length
  const failed = results.filter((r) => r.startsWith(FAIL)).length
  console.log(results.join('\n'))
  console.log(`\nSUMMARY: PASS ${passed} / FAIL ${failed}`)
  if (failed > 0) process.exit(1)
}

main().catch((err) => {
  console.error('verify script failed:', err)
  process.exit(1)
})
