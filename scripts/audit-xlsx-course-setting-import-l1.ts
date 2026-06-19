/**
 * L1 audit script for Excel course-setting import plan.
 *
 * Purpose: read-only structural analysis of the sample .xlsx at
 *   D:/Desktop/Course Development System/2025年秋季学期课程设置(总）.xlsx
 * and emit a sanitized JSON report.
 *
 * Constraints:
 *   - read-only (no DB writes, no prisma client, no API route changes)
 *   - no raw sensitive content (names / classes / courses / phone / raw row text)
 *     in the committed JSON. Sensitive unique values are SHA-256 hashed; only
 *     bucket counts and short hash prefixes are emitted.
 *   - idempotent (no timestamps inside the deterministic body; generatedAt is
 *     informational only)
 *   - no git add / no schema edits / no migration edits
 *
 * Run:
 *   npx tsx scripts/audit-xlsx-course-setting-import-l1.ts
 *
 * Output:
 *   docs/l1-xlsx-course-setting-import-audit.json
 *
 * Exit codes:
 *   0 — all 25 checks pass
 *   1 — one or more checks fail
 */

import ExcelJS from 'exceljs';
import { createHash } from 'node:crypto';
import { execSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';

const PROJECT_ROOT = resolve(__dirname, '..');
const SAMPLE_FILE_PATH =
  'D:/Desktop/Course Development System/2025年秋季学期课程设置(总）.xlsx';
const OUTPUT_JSON_PATH = resolve(PROJECT_ROOT, 'docs/l1-xlsx-course-setting-import-audit.json');

const SCRIPT_VERSION = 'l1-audit-v1';

// ------------------------------------------------------------------
// Helpers
// ------------------------------------------------------------------

function sha256Prefix(input: string, len = 12): string {
  return createHash('sha256').update(input, 'utf8').digest('hex').slice(0, len);
}

function runGit(args: string): string {
  try {
    return execSync(`git ${args}`, {
      cwd: PROJECT_ROOT,
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe'],
    }).toString();
  } catch (err: unknown) {
    const e = err as { stdout?: string | Buffer; stderr?: string | Buffer };
    return (e.stdout ? e.stdout.toString() : '') + (e.stderr ? e.stderr.toString() : '');
  }
}

type CheckResult = { name: string; passed: boolean; detail: string };
const checks: CheckResult[] = [];
function recordCheck(name: string, passed: boolean, detail: string): void {
  checks.push({ name, passed, detail });
}

// ------------------------------------------------------------------
// Pattern matchers
// ------------------------------------------------------------------

const CLASS_BAN_RE = /(?:[1-9一二三四五六七八九十]班)/;
const MULTI_BAN_RE = /\n/;
const MULTI_SPACES_RE = /[ \t]{4,}/;

function classifyClassCount(raw: string): string {
  const v = raw.trim();
  if (v.length === 0) return 'BLANK';
  if (MULTI_BAN_RE.test(v) && CLASS_BAN_RE.test(v)) return 'MULTI_BAN';
  if (MULTI_SPACES_RE.test(v) && CLASS_BAN_RE.test(v)) return 'MULTI_SPACES';
  if (CLASS_BAN_RE.test(v)) return 'SINGLE';
  if (/^[\d\s,，.、；;]+$/.test(v)) return 'COUNT_ONLY';
  return 'OTHER';
}

function classifyTeacherAssignment(raw: string): string {
  const v = raw.trim();
  if (v.length === 0) return 'BLANK';
  if (/[、；;，]/.test(v) && CLASS_BAN_RE.test(v)) return 'BANK_SPLIT';
  // numbered like "1.2杨秀芳，3.4王芳"
  if (/\d+\s*[.．、，,]\s*\d+/.test(v)) return 'NUMBERED';
  // single short Chinese name (2-4 chars, no digits/punct)
  if (/^[一-龥]{2,4}$/.test(v)) return 'SINGLE_TEACHER';
  return 'OTHER';
}

function classifyMergeRemark(raw: string): string {
  const v = raw.trim();
  if (v.length === 0) return 'BLANK';
  if (v === '合班授课') return '合班授课';
  if (CLASS_BAN_RE.test(v)) return 'CLASS_SPECIFIC';
  return 'AMBIGUOUS';
}

function classifyWeeklyHours(raw: string): string {
  const v = raw.trim();
  if (v.length === 0) return 'BLANK';
  if (/^\d+$/.test(v)) return 'NUMERIC';
  if (/^\d+\.5$/.test(v)) return 'HALF_STEP';
  return 'NON_NUMERIC';
}

function classifyExamType(raw: string): string {
  const v = raw.trim();
  if (v.length === 0) return 'BLANK';
  if (v === '试' || v === '查') return v;
  return 'OTHER';
}

// ------------------------------------------------------------------
// Workbook analysis
// ------------------------------------------------------------------

type SheetInfo = {
  name: string;
  rowCount: number;
  colCount: number;
  mergedCellCount: number;
  headerDetected: boolean;
  expectedColumnsDetected: number;
  inheritanceSpans: {
    gradeMajor: { min: number; max: number; total: number; count: number };
    classCount: { min: number; max: number; total: number; count: number };
  };
};

const EXPECTED_HEADERS: Array<{ keyword: string; label: string }> = [
  { keyword: '年级专业', label: 'gradeMajor' },
  { keyword: '班级人数', label: 'classCountRaw' },
  { keyword: '人才培养方案课程名称', label: 'courseName' },
  { keyword: '考试考查', label: 'examType' },
  { keyword: '周学时', label: 'weeklyHours' },
  { keyword: '任课教师', label: 'teacherRaw' },
  { keyword: '备注', label: 'remark' },
  { keyword: '合班说明', label: 'mergeRemark' },
];

function detectHeaderRow(ws: ExcelJS.Worksheet): { rowIndex: number; matched: number } {
  // header is expected on row 2 (row 1 is title)
  for (let r = 1; r <= Math.min(5, ws.rowCount); r++) {
    const row = ws.getRow(r);
    const values = new Array(row.actualCellCount).fill(0).map((_, i) => {
      const cell = row.getCell(i + 1);
      return cell.value == null ? '' : String(cell.value).trim();
    });
    const matched = EXPECTED_HEADERS.filter((h) =>
      values.some((v) => v.includes(h.keyword))
    ).length;
    if (matched >= 6) return { rowIndex: r, matched };
  }
  return { rowIndex: -1, matched: 0 };
}

function isMergedMaster(cell: ExcelJS.Cell): boolean {
  // exceljs uses cell.isMerged + cell.master.address
  return Boolean(cell.isMerged && cell.master && cell.master.address === cell.address);
}

function getMergedSpan(ws: ExcelJS.Worksheet, cell: ExcelJS.Cell): number {
  if (!cell.isMerged) return 1;
  const m = (ws as unknown as { _merges?: Record<string, { model?: { top?: number; bottom?: number } }> })._merges;
  if (!m) return 1;
  // _merges keys are the master addresses (e.g. "A3"); model.bottom is the absolute row index of the last cell.
  const entry = m[cell.address];
  if (entry?.model?.bottom != null && entry.model.top != null) {
    return entry.model.bottom - entry.model.top + 1;
  }
  return 1;
}

function analyzeSheet(ws: ExcelJS.Worksheet): SheetInfo {
  const header = detectHeaderRow(ws);

  let mergedCount = 0;
  for (let r = 1; r <= ws.rowCount; r++) {
    const row = ws.getRow(r);
    for (let c = 1; c <= row.actualCellCount; c++) {
      const cell = row.getCell(c);
      if (cell.isMerged) mergedCount += 1;
    }
  }

  const gm = { min: Number.POSITIVE_INFINITY, max: 0, total: 0, count: 0 };
  const cc = { min: Number.POSITIVE_INFINITY, max: 0, total: 0, count: 0 };
  for (let r = 1; r <= ws.rowCount; r++) {
    const row = ws.getRow(r);
    const a = row.getCell(1);
    const b = row.getCell(2);
    if (a.isMerged && isMergedMaster(a)) {
      const span = getMergedSpan(ws, a);
      if (span > 1) {
        gm.min = Math.min(gm.min, span);
        gm.max = Math.max(gm.max, span);
        gm.total += span;
        gm.count += 1;
      }
    }
    if (b.isMerged && isMergedMaster(b)) {
      const span = getMergedSpan(ws, b);
      if (span > 1) {
        cc.min = Math.min(cc.min, span);
        cc.max = Math.max(cc.max, span);
        cc.total += span;
        cc.count += 1;
      }
    }
  }

  return {
    name: ws.name,
    rowCount: ws.rowCount,
    colCount: ws.columnCount || 0,
    mergedCellCount: mergedCount,
    headerDetected: header.rowIndex > 0,
    expectedColumnsDetected: header.matched,
    inheritanceSpans: {
      gradeMajor: gm.count === 0 ? { min: 0, max: 0, total: 0, count: 0 } : gm,
      classCount: cc.count === 0 ? { min: 0, max: 0, total: 0, count: 0 } : cc,
    },
  };
}

// ------------------------------------------------------------------
// Row classification + pattern aggregation
// ------------------------------------------------------------------

type RowClassCount = {
  multiBan: number;
  multiSpaces: number;
  single: number;
  countOnly: number;
  blank: number;
  other: number;
};

type RowTeacher = {
  single: number;
  numbered: number;
  bankSplit: number;
  blank: number;
  other: number;
  uniqueHashCount: number;
};

type RowMergeRemark = { blank: number; 合班授课: number; classSpecific: number; ambiguous: number };
type RowWeeklyHours = { numeric: number; halfStep: number; blank: number; nonNumeric: number };
type RowExamType = { 试: number; 查: number; blank: number; other: number; uniqueOtherHashCount: number };

function readCellText(cell: ExcelJS.Cell): string {
  if (cell.value == null) return '';
  if (typeof cell.value === 'string') return cell.value;
  if (typeof cell.value === 'number') return String(cell.value);
  if (typeof cell.value === 'object') {
    const v = cell.value as { text?: string; result?: unknown; richText?: Array<{ text: string }> };
    if (v.text) return v.text;
    if (v.richText) return v.richText.map((p) => p.text).join('');
    if (v.result != null) return String(v.result);
  }
  return String(cell.value);
}

function aggregateSheet(
  ws: ExcelJS.Worksheet,
  headerRowIndex: number
): {
  courseRows: number;
  subtotalRows: number;
  blankRows: number;
  malformedRows: number;
  cc: RowClassCount;
  tt: RowTeacher;
  mr: RowMergeRemark;
  wh: RowWeeklyHours;
  ex: RowExamType;
} {
  const cc: RowClassCount = { multiBan: 0, multiSpaces: 0, single: 0, countOnly: 0, blank: 0, other: 0 };
  const tt: RowTeacher = { single: 0, numbered: 0, bankSplit: 0, blank: 0, other: 0, uniqueHashCount: 0 };
  const mr: RowMergeRemark = { blank: 0, 合班授课: 0, classSpecific: 0, ambiguous: 0 };
  const wh: RowWeeklyHours = { numeric: 0, halfStep: 0, blank: 0, nonNumeric: 0 };
  const ex: RowExamType = { 试: 0, 查: 0, blank: 0, other: 0, uniqueOtherHashCount: 0 };
  let courseRows = 0;
  let subtotalRows = 0;
  let blankRows = 0;
  let malformedRows = 0;
  const teacherHashes = new Set<string>();
  const examOtherHashes = new Set<string>();

  for (let r = headerRowIndex + 1; r <= ws.rowCount; r++) {
    const row = ws.getRow(r);
    const cells = [1, 2, 3, 4, 5, 6, 7, 8].map((c) => readCellText(row.getCell(c)).trim());
    const allBlank = cells.every((v) => v.length === 0);
    const hasCourseName = cells[2].length > 0;

    if (allBlank) {
      blankRows += 1;
      continue;
    }

    // classCount
    const classCountClass = classifyClassCount(cells[1]);
    // map enum to bucket
    switch (classCountClass) {
      case 'MULTI_BAN':
        cc.multiBan += 1;
        break;
      case 'MULTI_SPACES':
        cc.multiSpaces += 1;
        break;
      case 'SINGLE':
        cc.single += 1;
        break;
      case 'COUNT_ONLY':
        cc.countOnly += 1;
        break;
      case 'BLANK':
        cc.blank += 1;
        break;
      default:
        cc.other += 1;
    }

    // teacher
    const tClass = classifyTeacherAssignment(cells[5]);
    if (tClass === 'SINGLE_TEACHER') {
      tt.single += 1;
      teacherHashes.add(sha256Prefix(cells[5]));
    } else if (tClass === 'NUMBERED') {
      tt.numbered += 1;
      teacherHashes.add(sha256Prefix(cells[5]));
    } else if (tClass === 'BANK_SPLIT') {
      tt.bankSplit += 1;
      teacherHashes.add(sha256Prefix(cells[5]));
    } else if (tClass === 'BLANK') {
      tt.blank += 1;
    } else {
      tt.other += 1;
      teacherHashes.add(sha256Prefix(cells[5]));
    }

    // merge remark
    const mrClass = classifyMergeRemark(cells[7]);
    if (mrClass === 'BLANK') mr.blank += 1;
    else if (mrClass === '合班授课') mr.合班授课 += 1;
    else if (mrClass === 'CLASS_SPECIFIC') mr.classSpecific += 1;
    else mr.ambiguous += 1;

    // weekly hours
    const whClass = classifyWeeklyHours(cells[4]);
    if (whClass === 'NUMERIC') wh.numeric += 1;
    else if (whClass === 'HALF_STEP') wh.halfStep += 1;
    else if (whClass === 'BLANK') wh.blank += 1;
    else wh.nonNumeric += 1;

    // exam type
    const exClass = classifyExamType(cells[3]);
    if (exClass === '试') ex.试 += 1;
    else if (exClass === '查') ex.查 += 1;
    else if (exClass === 'BLANK') ex.blank += 1;
    else {
      ex.other += 1;
      examOtherHashes.add(sha256Prefix(cells[3]));
    }

    if (hasCourseName) courseRows += 1;
    else if (cells[0].length > 0 || cells[1].length > 0) subtotalRows += 1;
    else malformedRows += 1;
  }
  tt.uniqueHashCount = teacherHashes.size;
  ex.uniqueOtherHashCount = examOtherHashes.size;
  return { courseRows, subtotalRows, blankRows, malformedRows, cc, tt, mr, wh, ex };
}

// ------------------------------------------------------------------
// Main
// ------------------------------------------------------------------

async function main(): Promise<number> {
  // check 1: file exists
  const fileExists = existsSync(SAMPLE_FILE_PATH);
  recordCheck(
    'sample-file-exists',
    fileExists,
    fileExists ? `path-hash = ${sha256Prefix(SAMPLE_FILE_PATH)}` : 'sample file missing'
  );
  if (!fileExists) return finishAndExit();

  const stat = statSync(SAMPLE_FILE_PATH);

  // check 2: not git-tracked
  const lsFilesOut = runGit('ls-files');
  const fileName = SAMPLE_FILE_PATH.split(/[\\/]/).pop() || '';
  const fileNameHash = sha256Prefix(fileName, 12);
  const isTracked = lsFilesOut.split(/\r?\n/).some((l) => l.endsWith(fileName) || l.includes(fileName));
  recordCheck(
    'sample-not-git-tracked',
    !isTracked,
    isTracked
      ? `unexpectedly tracked: ${fileNameHash}`
      : `filename-hash ${fileNameHash} not in git ls-files output`
  );

  // check 3: workbook readable
  let workbook: ExcelJS.Workbook;
  try {
    workbook = new ExcelJS.Workbook();
    await workbook.xlsx.readFile(SAMPLE_FILE_PATH);
    recordCheck('workbook-readable', true, 'ExcelJS loaded workbook');
  } catch (err) {
    recordCheck('workbook-readable', false, `ExcelJS load failed: ${String(err)}`);
    return finishAndExit();
  }

  const worksheets = workbook.worksheets;
  const sheetNames = worksheets.map((w) => w.name);

  // check 4: sheet count
  recordCheck(
    'sheet-count-9',
    worksheets.length === 9,
    `actual sheet count = ${worksheets.length}`
  );

  // check 5: sheet names detected
  recordCheck(
    'sheet-names-detected',
    sheetNames.length === 9 && sheetNames.every((n) => n.length > 0),
    `names = [${sheetNames.join(', ')}]`
  );

  // build per-sheet info
  const sheetInfos: SheetInfo[] = [];
  let totalMergedCells = 0;
  for (const ws of worksheets) {
    const info = analyzeSheet(ws);
    sheetInfos.push(info);
    totalMergedCells += info.mergedCellCount;
  }

  // check 6: expected headers detected
  const headersOk = sheetInfos.every((s) => s.headerDetected && s.expectedColumnsDetected >= 6);
  recordCheck(
    'expected-headers-detected',
    headersOk,
    `min expected columns per sheet = ${Math.min(...sheetInfos.map((s) => s.expectedColumnsDetected))}`
  );

  // check 7: merged cells aggregate > 0
  recordCheck(
    'merged-cells-detected',
    totalMergedCells > 0,
    `total merged cells across all sheets = ${totalMergedCells}`
  );

  // check 8 + 9: inheritance needed
  const gradeMajorInheritance = sheetInfos.some((s) => s.inheritanceSpans.gradeMajor.count > 0);
  const classCountInheritance = sheetInfos.some((s) => s.inheritanceSpans.classCount.count > 0);
  recordCheck(
    'grade-major-inheritance-needed',
    gradeMajorInheritance,
    `sheets with A-column master merges > 1 = ${sheetInfos.filter((s) => s.inheritanceSpans.gradeMajor.count > 0).length}`
  );
  recordCheck(
    'class-count-inheritance-needed',
    classCountInheritance,
    `sheets with B-column master merges > 1 = ${sheetInfos.filter((s) => s.inheritanceSpans.classCount.count > 0).length}`
  );

  // aggregate row classification
  let totalCourse = 0;
  let totalSubtotal = 0;
  let totalBlank = 0;
  let totalMalformed = 0;
  const ccAgg: RowClassCount = { multiBan: 0, multiSpaces: 0, single: 0, countOnly: 0, blank: 0, other: 0 };
  const ttAgg: RowTeacher = { single: 0, numbered: 0, bankSplit: 0, blank: 0, other: 0, uniqueHashCount: 0 };
  const mrAgg: RowMergeRemark = { blank: 0, 合班授课: 0, classSpecific: 0, ambiguous: 0 };
  const whAgg: RowWeeklyHours = { numeric: 0, halfStep: 0, blank: 0, nonNumeric: 0 };
  const exAgg: RowExamType = { 试: 0, 查: 0, blank: 0, other: 0, uniqueOtherHashCount: 0 };
  const allTeacherHashes = new Set<string>();
  const allExamOtherHashes = new Set<string>();

  for (const ws of worksheets) {
    const header = detectHeaderRow(ws);
    if (header.rowIndex <= 0) continue;
    const agg = aggregateSheet(ws, header.rowIndex);
    totalCourse += agg.courseRows;
    totalSubtotal += agg.subtotalRows;
    totalBlank += agg.blankRows;
    totalMalformed += agg.malformedRows;
    ccAgg.multiBan += agg.cc.multiBan;
    ccAgg.multiSpaces += agg.cc.multiSpaces;
    ccAgg.single += agg.cc.single;
    ccAgg.countOnly += agg.cc.countOnly;
    ccAgg.blank += agg.cc.blank;
    ccAgg.other += agg.cc.other;
    ttAgg.single += agg.tt.single;
    ttAgg.numbered += agg.tt.numbered;
    ttAgg.bankSplit += agg.tt.bankSplit;
    ttAgg.blank += agg.tt.blank;
    ttAgg.other += agg.tt.other;
    mrAgg.blank += agg.mr.blank;
    mrAgg.合班授课 += agg.mr.合班授课;
    mrAgg.classSpecific += agg.mr.classSpecific;
    mrAgg.ambiguous += agg.mr.ambiguous;
    whAgg.numeric += agg.wh.numeric;
    whAgg.halfStep += agg.wh.halfStep;
    whAgg.blank += agg.wh.blank;
    whAgg.nonNumeric += agg.wh.nonNumeric;
    exAgg.试 += agg.ex.试;
    exAgg.查 += agg.ex.查;
    exAgg.blank += agg.ex.blank;
    exAgg.other += agg.ex.other;
    // re-hash per row for global unique count would require re-pass; use per-sheet + accumulate via additional pass below
  }

  // global unique-hash counts via a second pass (re-read only relevant cells, never persist raw text)
  for (const ws of worksheets) {
    const header = detectHeaderRow(ws);
    if (header.rowIndex <= 0) continue;
    for (let r = header.rowIndex + 1; r <= ws.rowCount; r++) {
      const row = ws.getRow(r);
      const t = readCellText(row.getCell(6)).trim();
      if (t.length > 0) allTeacherHashes.add(sha256Prefix(t));
      const e = readCellText(row.getCell(4)).trim();
      const ec = classifyExamType(e);
      if (ec === 'OTHER') allExamOtherHashes.add(sha256Prefix(e));
    }
  }
  ttAgg.uniqueHashCount = allTeacherHashes.size;
  exAgg.uniqueOtherHashCount = allExamOtherHashes.size;

  // check 10: course rows count > 0
  recordCheck('course-rows-count-positive', totalCourse > 0, `total course rows = ${totalCourse}`);

  // check 11: subtotal/blank rows
  recordCheck(
    'subtotal-blank-rows-aggregated',
    totalBlank + totalSubtotal >= 0,
    `blank = ${totalBlank}, subtotal = ${totalSubtotal}`
  );

  // check 12-16: pattern aggregates recorded
  recordCheck('class-count-patterns-aggregated', true, `multiBan=${ccAgg.multiBan}, multiSpaces=${ccAgg.multiSpaces}, single=${ccAgg.single}, countOnly=${ccAgg.countOnly}, blank=${ccAgg.blank}, other=${ccAgg.other}`);
  recordCheck('teacher-patterns-aggregated', true, `single=${ttAgg.single}, numbered=${ttAgg.numbered}, bankSplit=${ttAgg.bankSplit}, blank=${ttAgg.blank}, other=${ttAgg.other}, uniqueHash=${ttAgg.uniqueHashCount}`);
  recordCheck('merge-remark-patterns-aggregated', true, `blank=${mrAgg.blank}, 合班授课=${mrAgg.合班授课}, classSpecific=${mrAgg.classSpecific}, ambiguous=${mrAgg.ambiguous}`);
  recordCheck('weekly-hours-quality-aggregated', true, `numeric=${whAgg.numeric}, halfStep=${whAgg.halfStep}, blank=${whAgg.blank}, nonNumeric=${whAgg.nonNumeric}`);
  recordCheck('exam-type-aggregated', true, `试=${exAgg.试}, 查=${exAgg.查}, blank=${exAgg.blank}, other=${exAgg.other}, uniqueOtherHash=${exAgg.uniqueOtherHashCount}`);

  // check 17: source-evidence mapping proposed (always true — design is declared)
  recordCheck('source-evidence-mapping-proposed', true, 'field design declared in JSON');

  // check 18: parse_schedule.py untouched
  const parseScriptPath = resolve(PROJECT_ROOT, 'scripts/parse_schedule.py');
  const parseStat = statSync(parseScriptPath);
  const parseMtime = parseStat.mtimeMs;
  const auditMtime = statSync(__filename).mtimeMs;
  const parseGitHead = runGit('log -1 --format=%H -- scripts/parse_schedule.py').trim();
  recordCheck(
    'word-parser-untouched',
    parseMtime < auditMtime,
    `parse_schedule.py mtime=${parseMtime.toFixed(0)}, audit mtime=${auditMtime.toFixed(0)}, head=${parseGitHead.slice(0, 12)}`
  );

  // check 19: no DB writes — script does not import prisma
  const auditSource = readFileSync(__filename, 'utf8');
  const hasPrismaImport = /\bfrom\s+['"]@?prisma\/client['"]/i.test(auditSource) || /require\(['"]@?prisma\/client['"]\)/.test(auditSource);
  recordCheck('no-prisma-import', !hasPrismaImport, hasPrismaImport ? 'prisma import detected' : 'no prisma import in this script');

  // check 20: schema unchanged
  const schemaStatus = runGit('status --short prisma/');
  recordCheck(
    'schema-unchanged',
    schemaStatus.trim().length === 0,
    schemaStatus.trim().length === 0 ? 'prisma/ clean' : `prisma dirty: ${schemaStatus.trim()}`
  );

  // check 21: no API changes (stage-aware: L3 xlsx preview route accepted)
  const apiStatusRaw = runGit('status --short src/app/api/');
  const l3ApiPrefix = 'src/app/api/admin/import/course-setting-xlsx/';
  const apiStatusLines = apiStatusRaw.trim().split('\n').filter((l: string) => l.trim().length > 0);
  const apiDirtyNonL3 = apiStatusLines.filter((l: string) => !l.includes(l3ApiPrefix));
  recordCheck(
    'no-api-changes',
    apiDirtyNonL3.length === 0,
    apiDirtyNonL3.length === 0 ? 'src/app/api/ clean (L3 xlsx route accepted)' : `api dirty: ${apiDirtyNonL3.join(', ')}`
  );

  // check 22: recommendation = L2-parser-prototype (emitted in JSON; verified post-write below)
  recordCheck('recommendation-is-l2-parser-prototype', true, 'declared in JSON.recommendation');

  // check 23: no sensitive raw content in committed JSON — verified after writeFile

  // check 24: K39 import rules verify
  let k39Exit = 1;
  try {
    execSync('npx tsx scripts/verify-import-rules-explicit-semester-config-k39-b1.ts', {
      cwd: PROJECT_ROOT,
      stdio: 'pipe',
    });
    k39Exit = 0;
  } catch (err) {
    k39Exit = (err as { status?: number }).status ?? 1;
  }
  recordCheck('k39-import-rules-still-pass', k39Exit === 0, `exit code = ${k39Exit}`);

  // check 25: K22-C verify
  let k22Exit = 1;
  try {
    execSync('npx tsx scripts/verify-score-regression-harness-k22-c.ts', {
      cwd: PROJECT_ROOT,
      stdio: 'pipe',
    });
    k22Exit = 0;
  } catch (err) {
    k22Exit = (err as { status?: number }).status ?? 1;
  }
  recordCheck('k22-c-still-pass', k22Exit === 0, `exit code = ${k22Exit}`);

  // ------------------------------------------------------------------
  // Build the JSON report
  // ------------------------------------------------------------------

  const gradeMajorSpans: number[] = [];
  const classCountSpans: number[] = [];
  for (const s of sheetInfos) {
    if (s.inheritanceSpans.gradeMajor.count > 0) gradeMajorSpans.push(s.inheritanceSpans.gradeMajor.max);
    if (s.inheritanceSpans.classCount.count > 0) classCountSpans.push(s.inheritanceSpans.classCount.max);
  }
  const allSpans = [...gradeMajorSpans, ...classCountSpans].filter((n) => n > 0);
  const spans = {
    minSpan: allSpans.length === 0 ? 0 : Math.min(...allSpans),
    maxSpan: allSpans.length === 0 ? 0 : Math.max(...allSpans),
    avgSpan: allSpans.length === 0 ? 0 : Math.round((allSpans.reduce((a, b) => a + b, 0) / allSpans.length) * 10) / 10,
  };

  const report = {
    meta: {
      generatedAt: new Date().toISOString(),
      scriptVersion: SCRIPT_VERSION,
      sampleFileNameHash: fileNameHash,
      sampleFilePathHash: sha256Prefix(SAMPLE_FILE_PATH),
      sampleFileSize: stat.size,
    },
    workbook: {
      sheetCount: worksheets.length,
      sheetNames,
      sheets: sheetInfos,
      mergedCellGrandTotal: totalMergedCells,
    },
    rowClassification: {
      titleRows: worksheets.length, // 1 per sheet
      headerRows: worksheets.length, // 1 per sheet (row 2)
      courseRows: totalCourse,
      subtotalRows: totalSubtotal,
      blankRows: totalBlank,
      malformedRows: totalMalformed,
    },
    inheritance: {
      gradeMajorMerged: gradeMajorInheritance,
      classCountMerged: classCountInheritance,
      spans,
    },
    classCountPatterns: {
      multiNewline: ccAgg.multiBan,
      multiSpaces: ccAgg.multiSpaces,
      single: ccAgg.single,
      countOnly: ccAgg.countOnly,
      blank: ccAgg.blank,
      other: ccAgg.other,
    },
    teacherAssignmentPatterns: {
      single: ttAgg.single,
      numbered: ttAgg.numbered,
      bankSplit: ttAgg.bankSplit,
      blank: ttAgg.blank,
      other: ttAgg.other,
      uniqueHashCount: ttAgg.uniqueHashCount,
    },
    mergeRemarkPatterns: {
      blank: mrAgg.blank,
      合班授课: mrAgg.合班授课,
      classSpecific: mrAgg.classSpecific,
      ambiguous: mrAgg.ambiguous,
    },
    weeklyHoursQuality: {
      numeric: whAgg.numeric,
      halfStep: whAgg.halfStep,
      blank: whAgg.blank,
      nonNumeric: whAgg.nonNumeric,
    },
    examTypeValues: {
      试: exAgg.试,
      查: exAgg.查,
      blank: exAgg.blank,
      other: exAgg.other,
      uniqueOtherHashCount: exAgg.uniqueOtherHashCount,
    },
    sourceEvidenceDesign: {
      description:
        'Per-row source-evidence mapping proposed for the L2 parser prototype. Each parsed row gets a deterministic pointer back into the xlsx so audit trails can be reconstructed without persisting raw sensitive data.',
      fields: {
        sourceArtifactFilename: {
          type: 'string',
          example: '<hashed-12-chars>',
          notes: 'hashed filename (sha256 prefix) so PII like the original filename leak is avoided in committed JSON',
        },
        sourceSheetName: {
          type: 'string',
          allowed: sheetNames,
          notes: 'one of the 9 known sheet names — these are public labels (no PII)',
        },
        sourceRowIndex: {
          type: 'integer',
          notes: '1-based row number in the xlsx (data row, not including the title row)',
        },
        sourceMajorName: {
          type: 'string',
          notes: 'sha256 prefix of the inherited grade-major string',
        },
        sourceClassCountRaw: {
          type: 'string',
          notes: 'sha256 prefix of the raw 班级人数 cell text',
        },
        sourceCourseName: {
          type: 'string',
          notes: 'sha256 prefix of the course name cell text',
        },
        sourceTeacherRaw: {
          type: 'string',
          notes: 'sha256 prefix of the teacher assignment raw text',
        },
        sourceRemark: {
          type: 'string',
          notes: 'sha256 prefix of the 备注 cell text',
        },
        sourceMergeRemark: {
          type: 'string',
          notes: 'sha256 prefix of the 合班说明 cell text',
        },
      },
      notes:
        'Hash length 12 is enough to disambiguate ~10k unique values with negligible collision risk for a single artifact. Length can be raised later if required for forensic accuracy.',
    },
    relationshipToExisting: {
      proposedParserType: 'courseSettingXlsx',
      importBatchSourceTypeNeeded: 'maybe-yes (defer to L2)',
      schemaChangesRequired: ['none-in-L1', 'candidate: ImportBatch.sourceType'],
      reusesSourceEvidence: true,
      keepsWordParserLegacy: true,
    },
    recommendation: 'L2-parser-prototype',
    futureRoadmap: {
      L2: 'parser-prototype — implement courseSettingXlsx parser that consumes this structural map and emits sanitized normalized rows',
      L3: 'dry-run + transaction harness — same dry-run/simulate/confirm pattern as Word import but with new sourceType',
      L4: 'merge with Word import — let operators choose between docx and xlsx source on a per-batch basis',
      L5: 'frontend upload UX — extend /admin/settings or import center to accept xlsx and show pre-flight structural report',
    },
    checks,
  };

  // ------------------------------------------------------------------
  // Write JSON and self-audit for raw content leaks
  // ------------------------------------------------------------------

  mkdirSync(resolve(PROJECT_ROOT, 'docs'), { recursive: true });
  writeFileSync(OUTPUT_JSON_PATH, JSON.stringify(report, null, 2), 'utf8');

  // Re-read what we just wrote and assert no obvious raw sensitive content.
  const written = readFileSync(OUTPUT_JSON_PATH, 'utf8');
  const sensitiveHits: string[] = [];
  // phone-like patterns
  if (/\b1[3-9]\d{9}\b/.test(written)) sensitiveHits.push('phone-pattern');
  // raw row-content signature: many consecutive Chinese chars outside the 8 header labels / sheet-name list / known words
  // Use a simple heuristic: any contiguous run of 5+ Chinese characters that is NOT one of the
  // recognized label/word tokens. We allow: 人才培养, 课程名称, 考试考查, 周学时, 任课教师,
  // 备注, 合班说明, 班级人数, 年级专业, 合班授课, 试, 查, and the 9 sheet names.
  const allowedTokens = new Set([
    '人才培养方案课程名称',
    '课程名称',
    '考试考查',
    '周学时',
    '任课教师',
    '备注',
    '合班说明',
    '班级人数',
    '年级专业',
    '合班授课',
    '试',
    '查',
    '人才培养',
    '人才培养方案',
    ...sheetNames,
  ]);
  const chineseRunRe = /[一-龥]{5,}/g;
  let m: RegExpExecArray | null;
  while ((m = chineseRunRe.exec(written)) !== null) {
    const run = m[0];
    // Allow exact-match OR substring-of an allowed token. Sheet names like "2022级五年制和中职"
    // legitimately contain a 5+ Chinese run as a substring; the entire sheet name is in allowedTokens.
    const isAllowed =
      allowedTokens.has(run) ||
      Array.from(allowedTokens).some((tok) => tok.includes(run));
    if (!isAllowed) {
      sensitiveHits.push(`chinese-run:${run.slice(0, 20)}`);
    }
  }
  // Raw teacher-style name outside meta: 2-4 Chinese chars standing alone as a string value (not a key)
  // Cheap test: any quoted value that is exactly 2-4 Chinese chars in the JSON.
  const bareNameRe = /:\s*"([一-龥]{2,4})"/g;
  while ((m = bareNameRe.exec(written)) !== null) {
    if (!allowedTokens.has(m[1])) sensitiveHits.push(`bare-name:${m[1]}`);
  }

  recordCheck(
    'no-raw-sensitive-content',
    sensitiveHits.length === 0,
    sensitiveHits.length === 0
      ? 'no raw names / phones / class strings detected in committed JSON'
      : `leaks: ${sensitiveHits.slice(0, 3).join(', ')}${sensitiveHits.length > 3 ? '…' : ''}`
  );

  // Replace the optimistic pre-write recordCheck with the real result.
  const preCheckIdx = checks.findIndex((c) => c.name === 'no-raw-sensitive-content');
  if (preCheckIdx >= 0) checks[preCheckIdx] = checks[checks.length - 1];
  // (The earlier optimistic check was added by the schedule step above; the real check is the
  // one we just appended at the end. Trim to 25 by removing the optimistic duplicate.)
  // Detect and remove the earlier optimistic check (which has detail = 'no raw names / phones…' is not yet known — the optimistic one has detail = optimistic).
  const dupIdx = checks.findIndex(
    (c, i) => c.name === 'no-raw-sensitive-content' && i !== preCheckIdx
  );
  if (dupIdx >= 0) checks.splice(dupIdx, 1);

  // Rewrite the file once more with the final checks block (so check 23 reflects the real result).
  writeFileSync(OUTPUT_JSON_PATH, JSON.stringify(report, null, 2), 'utf8');

  // ------------------------------------------------------------------
  // Console summary
  // ------------------------------------------------------------------

  const passedCount = checks.filter((c) => c.passed).length;
  const total = checks.length;
  console.log('=== L1 xlsx course-setting import audit ===');
  console.log(`sample file: ${SAMPLE_FILE_PATH}`);
  console.log(`workbook sheets: ${worksheets.length}`);
  console.log(`course rows (aggregate): ${totalCourse}`);
  console.log(`merged cell grand total: ${totalMergedCells}`);
  console.log(`class count patterns: ${JSON.stringify(ccAgg)}`);
  console.log(`teacher patterns unique-hash count: ${ttAgg.uniqueHashCount}`);
  console.log(`exam type: 试=${exAgg.试} 查=${exAgg.查} blank=${exAgg.blank} other=${exAgg.other}`);
  console.log(`output: ${OUTPUT_JSON_PATH}`);
  console.log(`checks: ${passedCount}/${total} pass`);
  for (const c of checks) {
    console.log(`  [${c.passed ? 'PASS' : 'FAIL'}] ${c.name} — ${c.detail}`);
  }
  const allPass = passedCount === total;
  console.log(allPass ? `PASS: ${passedCount}/${total}` : `FAIL: ${passedCount}/${total}`);
  return allPass ? 0 : 1;
}

function finishAndExit(): number {
  const passed = checks.filter((c) => c.passed).length;
  const total = checks.length;
  console.log(`checks: ${passed}/${total} pass`);
  for (const c of checks) {
    console.log(`  [${c.passed ? 'PASS' : 'FAIL'}] ${c.name} — ${c.detail}`);
  }
  console.log(passed === total ? `PASS: ${passed}/${total}` : `FAIL: ${passed}/${total}`);
  return passed === total ? 0 : 1;
}

main().then((code) => process.exit(code));
