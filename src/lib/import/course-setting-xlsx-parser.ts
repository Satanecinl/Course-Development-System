/**
 * L2 Pure Parser Prototype — Course Setting XLSX
 *
 * Deterministic, in-memory xlsx -> structured rows parser for the
 * 课程设置 (course setting) artifact. Foundation for L3 (preview UI) and
 * L4 (DB apply). Hard constraints:
 *  - No Prisma, no DB writes, no API, no UI, no schema changes.
 *  - Pure over the input Buffer; no filesystem reads in the canonical
 *    parseCourseSettingXlsx. parseCourseSettingXlsxFile is a thin
 *    readFileSync wrapper.
 *  - No `any` in public exports.
 *  - Idempotent: same Buffer -> identical result.
 *  - Sensitive string values are exposed only when includeRawValues=true.
 */

import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';

import ExcelJS from 'exceljs';

// ---------------------------------------------------------------------------
// Public types
// ---------------------------------------------------------------------------

export type CourseSettingXlsxParseOptions = {
  artifactFilename?: string;
  parserVersion?: string;
  includeRawValues?: boolean;
};
export type CourseSettingDiagnostic = {
  code: string;
  severity: 'info' | 'warn' | 'error';
  message: string;
  sheetIndex?: number;
  rowIndex?: number;
  columnKey?: string;
};
export type CourseSettingXlsxParseResult = {
  parserVersion: string;
  artifact: { filename?: string; sha256: string };
  workbook: {
    sheetCount: number;
    parsedSheetCount: number;
    totalRows: number;
    totalCourseRows: number;
    totalWarnings: number;
  };
  sheets: ParsedCourseSettingSheet[];
  diagnostics: CourseSettingDiagnostic[];
};
export type ParsedCourseSettingSheet = {
  sheetIndex: number;
  sheetNameHash: string;
  rowCount: number;
  columnCount: number;
  mergedCellCount: number;
  headerRowIndex?: number;
  columnMap: CourseSettingColumnMap;
  rows: ParsedCourseSettingRow[];
  diagnostics: CourseSettingDiagnostic[];
};
export type CourseSettingColumnMap = {
  gradeMajor?: number;
  classCount?: number;
  courseName?: number;
  examType?: number;
  weeklyHours?: number;
  teacherAssignment?: number;
  remark?: number;
  mergeRemark?: number;
};
export type ParsedCourseSettingRow = {
  sheetIndex: number;
  sheetNameHash: string;
  sourceRowIndex: number;
  sourceRange?: string;
  rowKind: 'course' | 'header' | 'title' | 'subtotal' | 'blank' | 'malformed';
  gradeMajor?: ParsedTextValue;
  classCount?: ParsedClassCountValue;
  courseName?: ParsedTextValue;
  examType?: ParsedExamTypeValue;
  weeklyHours?: ParsedWeeklyHoursValue;
  teacherAssignment?: ParsedTeacherAssignmentValue;
  remark?: ParsedTextValue;
  mergeRemark?: ParsedTextValue;
  sourceEvidence: CourseSettingSourceEvidenceDraft;
  warnings: CourseSettingDiagnostic[];
  confidence: number;
};
export type ParsedTextValue = {
  normalized?: string;
  rawHash: string;
  valueShape: string;
  confidence: number;
};
export type ParsedClassCountValue = {
  primaryClassification: 'multiBan' | 'multiSpaces' | 'single' | 'countOnly' | 'blank' | 'other';
  parsedClassGroups: ParsedClassGroupCandidate[];
  rawHash: string;
  valueShape: string;
  warnings: CourseSettingDiagnostic[];
  confidence: number;
};
export type ParsedClassGroupCandidate = {
  classLabel?: string;
  classLabelHash: string;
  studentCount?: number;
  method: 'banCount' | 'spaceSplit' | 'newlineSplit' | 'countOnly' | 'inherited' | 'unknown';
  confidence: number;
};
export type ParsedTeacherAssignmentValue = {
  primaryClassification: 'single' | 'numbered' | 'bankSplit' | 'blank' | 'other';
  assignments: ParsedTeacherAssignmentCandidate[];
  rawHash: string;
  valueShape: string;
  warnings: CourseSettingDiagnostic[];
  confidence: number;
};
export type ParsedTeacherAssignmentCandidate = {
  teacherName?: string;
  teacherNameHash: string;
  scopeLabel?: string;
  scopeLabelHash: string;
  scopeType: 'class' | 'group' | 'section' | 'unknown';
  method: 'single' | 'delimiterSplit' | 'numberedScope' | 'bankSplit' | 'blank' | 'unknown';
  confidence: number;
};
export type ParsedExamTypeValue = {
  normalized?: '试' | '查';
  rawHash: string;
  classification: 'expected' | 'blank' | 'other';
  confidence: number;
};
export type ParsedWeeklyHoursValue = {
  value?: number;
  rawHash: string;
  classification: 'numeric' | 'halfStep' | 'blank' | 'nonNumeric';
  warnings: CourseSettingDiagnostic[];
  confidence: number;
};
export type CourseSettingSourceEvidenceDraft = {
  sourceArtifactFilename?: string;
  sourceSheetNameHash: string;
  sourceRowIndex: number;
  sourceMajorNameHash?: string;
  sourceClassCountRawHash?: string;
  sourceCourseNameHash?: string;
  sourceTeacherRawHash?: string;
  sourceRemarkHash?: string;
  sourceMergeRemarkHash?: string;
};

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

const HEADER_KEYWORDS = [
  '年级专业',
  '班级人数',
  '人才培养方案课程名称',
  '考试考查',
  '周学时',
  '任课教师',
  '备注',
  '合班说明',
] as const;
const CN_NUM: Record<string, number> = {
  一: 1,
  二: 2,
  三: 3,
  四: 4,
  五: 5,
  六: 6,
  七: 7,
  八: 8,
  九: 9,
  十: 10,
};
const DEFAULT_PARSER_VERSION = 'l2-parser-v1';

const hash = (s: string, len = 12): string =>
  createHash('sha256').update(s, 'utf8').digest('hex').slice(0, len);
const sha256Hex = (buf: Buffer): string =>
  createHash('sha256').update(buf).digest('hex');
const parseChineseOrAsciiNumber = (raw: string): number => {
  if (/^\d+$/.test(raw)) return parseInt(raw, 10);
  if (CN_NUM[raw] !== undefined) return CN_NUM[raw]!;
  const n = parseInt(raw, 10);
  return Number.isFinite(n) ? n : 0;
};
const extractBasename = (p: string): string => {
  const segs = p.split(/[\\/]/);
  return segs[segs.length - 1] ?? p;
};
const shapeOf = (s: string): string => {
  if (s.length === 0) return 'blank';
  if (s.includes('\n') && s.includes('班'))
    return `multiBan:${s.split('\n').length}`;
  if (s.includes('班')) return 'single';
  if (/[ \t]{4,}/.test(s) && /\d/.test(s)) return 'multiSpaces';
  if (/^[\d\s一二三四五六七八九十、，,;；]+$/.test(s)) return 'countOnly';
  return `raw:bytes=${s.length}`;
};
const rangeForRow = (r: number, lastCol: number): string => {
  let s = '';
  let n = lastCol;
  while (n > 0) {
    const rem = (n - 1) % 26;
    s = String.fromCharCode(65 + rem) + s;
    n = Math.floor((n - 1) / 26);
  }
  return `A${r}:${s}${r}`;
};
const countHeaderKeywords = (values: ReadonlyArray<string>): number => {
  let count = 0;
  for (const kw of HEADER_KEYWORDS) {
    if (values.some((v) => v.length > 0 && v.includes(kw))) count += 1;
  }
  return count;
};

const trimCellValue = (value: unknown): string => {
  if (value === null || value === undefined) return '';
  if (typeof value === 'string') return value;
  if (typeof value === 'number' || typeof value === 'boolean')
    return String(value);
  if (typeof value === 'object') {
    const obj = value as Record<string, unknown>;
    if (typeof obj.text === 'string') return obj.text;
    if (typeof obj.result !== 'undefined') return trimCellValue(obj.result);
    if (Array.isArray(obj.richText)) {
      return obj.richText
        .map((seg) =>
          seg &&
          typeof seg === 'object' &&
          typeof (seg as Record<string, unknown>).text === 'string'
            ? ((seg as Record<string, unknown>).text as string)
            : '',
        )
        .join('');
    }
  }
  return '';
};
const cellText = (cell: ExcelJS.Cell): string => trimCellValue(cell.value);

const findMasterValue = (
  sheet: ExcelJS.Worksheet,
  cell: ExcelJS.Cell,
): string => {
  if (!cell.isMerged) return cellText(cell);
  const master = cell.master;
  if (!master || master === cell) return cellText(cell);
  return cellText(master);
};

const masterSpansMultipleRows = (
  sheet: ExcelJS.Worksheet,
  cell: ExcelJS.Cell,
): boolean => {
  if (!cell.isMerged) return false;
  const master = cell.master;
  if (!master) return false;
  // Use the master address whether cell IS the master or is a slave
  const masterAddr = master.address;
  const merges = (sheet as unknown as { model?: { merges?: string[] } }).model
    ?.merges;
  if (!Array.isArray(merges)) return false;
  for (const range of merges) {
    if (typeof range !== 'string') continue;
    if (range.split(':')[0] === masterAddr) {
      const m = range.match(/:([A-Z]+)(\d+)$/);
      if (m && m[2]) {
        const lastRow = parseInt(m[2], 10);
        const masterRow = parseInt(master.row, 10);
        return lastRow > masterRow;
      }
    }
  }
  return false;
};

const getMergedCellCount = (sheet: ExcelJS.Worksheet): number => {
  let n = 0;
  sheet.eachRow({ includeEmpty: false }, (row) => {
    row.eachCell({ includeEmpty: false }, (cell) => {
      if (cell.isMerged) n += 1;
    });
  });
  return n;
};
const getActualCellCount = (sheet: ExcelJS.Worksheet): number => {
  let n = 0;
  sheet.eachRow({ includeEmpty: false }, (row) => {
    row.eachCell({ includeEmpty: false }, () => {
      n += 1;
    });
  });
  return n;
};
const readCellTextAt = (
  sheet: ExcelJS.Worksheet,
  r: number,
  c: number | undefined,
): string => {
  if (typeof c !== 'number') return '';
  const cell = sheet.getCell(r, c);
  if (!cell) return '';
  if (cell.isMerged) return findMasterValue(sheet, cell);
  return cellText(cell);
};

// ---------------------------------------------------------------------------
// Field parsers
// ---------------------------------------------------------------------------

const blankText = (includeRaw: boolean): ParsedTextValue => ({
  rawHash: hash(''),
  valueShape: 'blank',
  confidence: 1.0,
  normalized: includeRaw ? '' : undefined,
});

const parseClassCount = (
  raw: string,
  includeRaw: boolean,
): ParsedClassCountValue => {
  const trimmed = raw.trim();
  if (trimmed.length === 0)
    return {
      primaryClassification: 'blank',
      parsedClassGroups: [],
      rawHash: hash(''),
      valueShape: 'blank',
      warnings: [],
      confidence: 1.0,
    };
  const hasBan = /(?:[1-9一二三四五六七八九十]班)/.test(trimmed);
  const hasNewline = /\n/.test(trimmed);
  const hasMultiSpaces = /[ \t]{4,}/.test(trimmed);
  let primary: ParsedClassCountValue['primaryClassification'] = 'other';
  if (hasNewline && hasBan) primary = 'multiBan';
  else if (hasMultiSpaces && hasBan) primary = 'multiSpaces';
  else if (hasBan) primary = 'single';
  else if (/^[\d\s一二三四五六七八九十、，,;；]+$/.test(trimmed)) primary = 'countOnly';

  const candidates: ParsedClassGroupCandidate[] = [];
  const warnings: CourseSettingDiagnostic[] = [];
  const lines = hasNewline
    ? trimmed.split(/\n+/)
    : hasMultiSpaces
      ? trimmed.split(/[ \t]{4,}/)
      : [trimmed];
  for (const line of lines) {
    const lt = line.trim();
    if (lt.length === 0) continue;
    const m = lt.match(/^([0-9一二三四五六七八九十]+)班\s*(\d+)\s*人?\s*$/);
    if (m && m[1] && m[2]) {
      const label = `${parseChineseOrAsciiNumber(m[1])}班`;
      candidates.push({
        classLabel: includeRaw ? label : undefined,
        classLabelHash: hash(label),
        studentCount: parseInt(m[2], 10),
        method:
          primary === 'multiBan'
            ? 'newlineSplit'
            : primary === 'multiSpaces'
              ? 'spaceSplit'
              : 'banCount',
        confidence: 0.95,
      });
      continue;
    }
    const m2 = lt.match(/^(\d+)\s*人?\s*$/);
    if (m2 && m2[1]) {
      candidates.push({
        classLabel: includeRaw ? '(orphan-count)' : undefined,
        classLabelHash: hash('orphan-count'),
        studentCount: parseInt(m2[1], 10),
        method: 'countOnly',
        confidence: 0.6,
      });
      warnings.push({
        code: 'CLASS_COUNT_ORPHAN',
        severity: 'warn',
        message: '班级人数 only has count, no class number',
      });
      continue;
    }
    candidates.push({
      classLabel: includeRaw ? lt : undefined,
      classLabelHash: hash(lt),
      studentCount: undefined,
      method: 'unknown',
      confidence: 0.2,
    });
    warnings.push({
      code: 'CLASS_COUNT_LINE_UNPARSED',
      severity: 'warn',
      message: 'class count line could not be parsed',
    });
  }
  let confidence = 1.0;
  if (primary === 'other') {
    warnings.push({
      code: 'CLASS_COUNT_OTHER',
      severity: 'warn',
      message: 'class count did not match any known pattern',
    });
    confidence = 0.3;
  } else if (candidates.some((c) => c.method === 'unknown')) {
    confidence = Math.min(confidence, 0.5);
  }
  return {
    primaryClassification: primary,
    parsedClassGroups: candidates,
    rawHash: hash(trimmed),
    valueShape: shapeOf(trimmed),
    warnings,
    confidence,
  };
};

const parseTeacherAssignment = (
  raw: string,
  includeRaw: boolean,
): ParsedTeacherAssignmentValue => {
  const trimmed = raw.trim();
  const pushAssignment = (a: {
    teacherName?: string;
    scopeLabel?: string;
    scopeType: ParsedTeacherAssignmentCandidate['scopeType'];
    method: ParsedTeacherAssignmentCandidate['method'];
    confidence: number;
  }): ParsedTeacherAssignmentCandidate => ({
    teacherName: includeRaw ? a.teacherName : undefined,
    teacherNameHash: hash(a.teacherName ?? ''),
    scopeLabel: includeRaw ? a.scopeLabel : undefined,
    scopeLabelHash: hash(a.scopeLabel ?? ''),
    scopeType: a.scopeType,
    method: a.method,
    confidence: a.confidence,
  });
  if (trimmed.length === 0) {
    return {
      primaryClassification: 'blank',
      assignments: [
        pushAssignment({
          scopeType: 'unknown',
          method: 'blank',
          confidence: 1.0,
        }),
      ],
      rawHash: hash(''),
      valueShape: 'blank',
      warnings: [],
      confidence: 1.0,
    };
  }
  const hasBan = /(?:[1-9一二三四五六七八九十]班)/.test(trimmed);
  const hasDelimiter = /[、；;，]/.test(trimmed);
  const hasNumbered = /\d+\s*[.．、，,]\s*\d+/.test(trimmed);
  const isSingleName = /^[一-龥]{2,4}$/.test(trimmed);
  let primary: ParsedTeacherAssignmentValue['primaryClassification'] = 'other';
  if (isSingleName) primary = 'single';
  else if (hasNumbered) primary = 'numbered';
  else if (hasBan && hasDelimiter) primary = 'bankSplit';

  const assignments: ParsedTeacherAssignmentCandidate[] = [];
  const warnings: CourseSettingDiagnostic[] = [];
  let confidence = 1.0;

  if (primary === 'single') {
    assignments.push(
      pushAssignment({
        teacherName: trimmed,
        scopeLabel: 'all',
        scopeType: 'unknown',
        method: 'single',
        confidence: 0.95,
      }),
    );
  } else if (primary === 'numbered') {
    for (const p of trimmed.split(/(?<=[一-龥\d])[，,]\s*/)) {
      const pp = p.trim();
      if (pp.length === 0) continue;
      const m = pp.match(/^(\d+\s*[.．、，,]\s*\d+)\s*([一-龥]{2,4})$/);
      if (m && m[1] && m[2]) {
        const scope = m[1].replace(/\s/g, '');
        assignments.push(
          pushAssignment({
            teacherName: m[2],
            scopeLabel: scope,
            scopeType: 'section',
            method: 'numberedScope',
            confidence: 0.8,
          }),
        );
        warnings.push({
          code: 'TEACHER_SCOPE_NUMBERED',
          severity: 'info',
          message: 'numbered scope parsed; may refer to class or section',
        });
        confidence = Math.min(confidence, 0.85);
      } else {
        assignments.push(
          pushAssignment({
            teacherName: pp,
            scopeLabel: pp,
            scopeType: 'unknown',
            method: 'unknown',
            confidence: 0.3,
          }),
        );
        warnings.push({
          code: 'TEACHER_NUMBERED_UNPARSED',
          severity: 'warn',
          message: 'numbered teacher fragment could not be parsed',
        });
        confidence = Math.min(confidence, 0.5);
      }
    }
  } else if (primary === 'bankSplit') {
    const parts = trimmed.split(/[、；;，]/);
    parts.forEach((p) => {
      const pt = p.trim();
      if (pt.length === 0) return;
      const m = pt.match(
        /^(\d+[、，,]\s*\d+\s*班|[1-9一二三四五六七八九十]班|\d+\s*班)?(.*)$/,
      );
      const scopeRaw =
        m && m[1] && m[1].length > 0
          ? m[1].replace(/\s/g, '')
          : '(continued)';
      const teacher = (m && m[2] ? m[2] : pt).trim();
      if (teacher.length === 0) {
        warnings.push({
          code: 'TEACHER_BANK_FRAGMENT_TRUNCATED',
          severity: 'warn',
          message: 'teacher bank fragment has no teacher name (likely truncated)',
        });
        return;
      }
      const scopeType: 'class' | 'group' = scopeRaw.includes('班')
        ? 'class'
        : 'group';
      assignments.push(
        pushAssignment({
          teacherName: teacher,
          scopeLabel: scopeRaw,
          scopeType,
          method: 'bankSplit',
          confidence: scopeType === 'class' ? 0.85 : 0.6,
        }),
      );
    });
  } else {
    assignments.push(
      pushAssignment({
        teacherName: trimmed,
        scopeLabel: '(unknown)',
        scopeType: 'unknown',
        method: 'unknown',
        confidence: 0.3,
      }),
    );
    warnings.push({
      code: 'TEACHER_OTHER',
      severity: 'warn',
      message: 'teacher assignment did not match any known pattern',
    });
    confidence = 0.3;
  }
  return {
    primaryClassification: primary,
    assignments,
    rawHash: hash(trimmed),
    valueShape: shapeOf(trimmed),
    warnings,
    confidence,
  };
};

const parseExamType = (raw: string): ParsedExamTypeValue => {
  const t = raw.trim();
  if (t.length === 0)
    return { rawHash: hash(''), classification: 'blank', confidence: 1.0 };
  if (t === '试' || t === '查')
    return {
      normalized: t,
      rawHash: hash(t),
      classification: 'expected',
      confidence: 1.0,
    };
  return { rawHash: hash(t), classification: 'other', confidence: 0.3 };
};

const parseWeeklyHours = (raw: string): ParsedWeeklyHoursValue => {
  const t = raw.trim();
  if (t.length === 0)
    return {
      rawHash: hash(''),
      classification: 'blank',
      confidence: 1.0,
      warnings: [],
    };
  if (/^\d+$/.test(t))
    return {
      value: parseInt(t, 10),
      rawHash: hash(t),
      classification: 'numeric',
      confidence: 1.0,
      warnings: [],
    };
  if (/^\d+\.5$/.test(t))
    return {
      value: parseFloat(t),
      rawHash: hash(t),
      classification: 'halfStep',
      confidence: 1.0,
      warnings: [],
    };
  return {
    rawHash: hash(t),
    classification: 'nonNumeric',
    confidence: 0.2,
    warnings: [
      {
        code: 'WEEKLY_HOURS_NON_NUMERIC',
        severity: 'warn',
        message: `周学时 not numeric: shape=${t.length}`,
      },
    ],
  };
};

type RemarkFields = ParsedTextValue & {
  classification: string;
  warnings: CourseSettingDiagnostic[];
};

const parseRemarkOrMerge = (
  raw: string,
  kind: 'remark' | 'mergeRemark',
): RemarkFields => {
  const t = raw.trim();
  if (t.length === 0)
    return {
      rawHash: hash(''),
      valueShape: 'blank',
      confidence: 1.0,
      classification: 'blank',
      warnings: [],
    };
  if (t === '合班授课')
    return {
      rawHash: hash(t),
      valueShape: '合班授课',
      confidence: 1.0,
      classification: '合班授课',
      warnings: [],
    };
  if (/(?:[1-9一二三四五六七八九十]班)/.test(t))
    return {
      rawHash: hash(t),
      valueShape: 'classSpecific',
      confidence: 0.85,
      classification: 'classSpecific',
      warnings: [],
    };
  if (kind === 'mergeRemark')
    return {
      rawHash: hash(t),
      valueShape: 'ambiguous',
      confidence: 0.4,
      classification: 'ambiguous',
      warnings: [
        {
          code: 'MERGE_REMARK_AMBIGUOUS',
          severity: 'info',
          message: 'merge remark is non-empty but has no class marker',
        },
      ],
    };
  return {
    rawHash: hash(t),
    valueShape: 'other',
    confidence: 0.5,
    classification: 'other',
    warnings: [],
  };
};

const parseText = (
  raw: string,
  includeRaw: boolean,
  kind: 'gradeMajor' | 'courseName',
): ParsedTextValue => {
  const t = raw.trim();
  if (t.length === 0) return blankText(includeRaw);
  return {
    normalized: includeRaw ? t : undefined,
    rawHash: hash(t),
    valueShape: kind === 'gradeMajor' ? 'major' : 'course',
    confidence: 1.0,
  };
};

// ---------------------------------------------------------------------------
// Sheet-level parsing
// ---------------------------------------------------------------------------

const detectHeaderRow = (
  sheet: ExcelJS.Worksheet,
): { headerRowIndex?: number; columnMap: CourseSettingColumnMap } => {
  const maxScan = Math.min(5, sheet.rowCount);
  for (let r = 1; r <= maxScan; r += 1) {
    const values: string[] = [];
    sheet
      .getRow(r)
      .eachCell({ includeEmpty: true }, (cell) => {
        const ci = parseInt(cell.col, 10);
        if (Number.isFinite(ci) && ci > 0) values[ci] = cellText(cell);
      });
    if (countHeaderKeywords(values) >= 6) {
      const columnMap: CourseSettingColumnMap = {};
      for (let c = 1; c < values.length; c += 1) {
        const v = values[c];
        if (typeof v !== 'string' || v.length === 0) continue;
        if (v.includes('年级专业')) columnMap.gradeMajor = c;
        else if (v.includes('班级人数')) columnMap.classCount = c;
        else if (
          v.includes('人才培养方案课程名称') ||
          v.includes('课程名称')
        )
          columnMap.courseName = c;
        else if (v.includes('考试考查')) columnMap.examType = c;
        else if (v.includes('周学时')) columnMap.weeklyHours = c;
        else if (v.includes('任课教师')) columnMap.teacherAssignment = c;
        else if (v.includes('备注')) columnMap.remark = c;
        else if (v.includes('合班说明')) columnMap.mergeRemark = c;
      }
      return { headerRowIndex: r, columnMap };
    }
  }
  return { headerRowIndex: undefined, columnMap: {} };
};

const buildSourceEvidenceDraft = (
  row: ParsedCourseSettingRow,
  options: CourseSettingXlsxParseOptions,
  sheetNameHash: string,
): CourseSettingSourceEvidenceDraft => ({
  sourceArtifactFilename: options.artifactFilename
    ? extractBasename(options.artifactFilename)
    : undefined,
  sourceSheetNameHash: sheetNameHash,
  sourceRowIndex: row.sourceRowIndex,
  sourceMajorNameHash: row.gradeMajor?.rawHash,
  sourceClassCountRawHash: row.classCount?.rawHash,
  sourceCourseNameHash: row.courseName?.rawHash,
  sourceTeacherRawHash: row.teacherAssignment?.rawHash,
  sourceRemarkHash: row.remark?.rawHash,
  sourceMergeRemarkHash: row.mergeRemark?.rawHash,
});

const computeRowConfidence = (vals: ReadonlyArray<number>): number => {
  if (vals.length === 0) return 1.0;
  let s = 0;
  for (const v of vals) s += v;
  return Math.round((s / vals.length) * 1000) / 1000;
};

const parseSheet = (
  sheet: ExcelJS.Worksheet,
  sheetIndex: number,
  options: CourseSettingXlsxParseOptions,
  sheetNameHash: string,
): { sheet: ParsedCourseSettingSheet; hasCourseRows: boolean } => {
  const includeRaw = options.includeRawValues === true;
  const lastCol = Math.max(sheet.columnCount, 8);
  const diagnostics: CourseSettingDiagnostic[] = [];
  const rows: ParsedCourseSettingRow[] = [];
  const mergedCellCount = getMergedCellCount(sheet);
  const columnCount = sheet.columnCount;
  if (mergedCellCount > 0)
    diagnostics.push({
      code: 'MERGED_CELL_EXPANDED',
      severity: 'info',
      message: `${mergedCellCount} merged cells were detected and expanded via master lookup`,
      sheetIndex,
    });

  const { headerRowIndex, columnMap } = detectHeaderRow(sheet);
  if (typeof headerRowIndex !== 'number')
    diagnostics.push({
      code: 'SHEET_HEADER_MISSING',
      severity: 'error',
      message: 'No header row detected (expected ≥6 keyword matches in rows 1-5)',
      sheetIndex,
    });

  const totalRows = sheet.rowCount;
  let hasCourseRows = false;
  let upstreamA = '';
  let upstreamB = '';
  const mappedCols = [
    columnMap.gradeMajor,
    columnMap.classCount,
    columnMap.courseName,
    columnMap.examType,
    columnMap.weeklyHours,
    columnMap.teacherAssignment,
    columnMap.remark,
    columnMap.mergeRemark,
  ];
  const mkDiag = (
    code: CourseSettingDiagnostic['code'],
    severity: CourseSettingDiagnostic['severity'],
    message: string,
    rowIndex?: number,
    columnKey?: string,
  ): CourseSettingDiagnostic => ({
    code,
    severity,
    message,
    sheetIndex,
    rowIndex,
    columnKey,
  });

  for (let r = 1; r <= totalRows; r += 1) {
    const row = sheet.getRow(r);
    const aCell = row.getCell(columnMap.gradeMajor ?? 1);
    const bCell = row.getCell(columnMap.classCount ?? 2);
    const aText = findMasterValue(sheet, aCell);
    const bText = findMasterValue(sheet, bCell);
    const aBlank = aText.trim().length === 0;
    const bBlank = bText.trim().length === 0;
    if (!aBlank) upstreamA = aText;
    if (!bBlank) upstreamB = bText;

    const reads = {
      c: readCellTextAt(sheet, r, columnMap.courseName),
      d: readCellTextAt(sheet, r, columnMap.examType),
      e: readCellTextAt(sheet, r, columnMap.weeklyHours),
      f: readCellTextAt(sheet, r, columnMap.teacherAssignment),
      g: readCellTextAt(sheet, r, columnMap.remark),
      h: readCellTextAt(sheet, r, columnMap.mergeRemark),
    };

    const aMasterRow = parseInt(aCell.master.row, 10);
    const bMasterRow = parseInt(bCell.master.row, 10);
    if (aCell.isMerged && masterSpansMultipleRows(sheet, aCell) && r === aMasterRow)
      diagnostics.push(
        mkDiag('INHERITED_GRADE_MAJOR', 'info', `Column A master spans rows ${aMasterRow}-...`, r, 'gradeMajor'),
      );
    if (bCell.isMerged && masterSpansMultipleRows(sheet, bCell) && r === bMasterRow)
      diagnostics.push(
        mkDiag('INHERITED_CLASS_COUNT', 'info', `Column B master spans rows ${bMasterRow}-...`, r, 'classCount'),
      );

    let rowKind: ParsedCourseSettingRow['rowKind'];
    if (typeof headerRowIndex === 'number' && r === headerRowIndex) rowKind = 'header';
    else if (typeof headerRowIndex === 'number' && r < headerRowIndex) rowKind = 'title';
    else if (typeof headerRowIndex !== 'number' && r <= 5) rowKind = 'title';
    else {
      const allBlank = mappedCols.every((c) => readCellTextAt(sheet, r, c).trim().length === 0);
      if (allBlank) rowKind = 'blank';
      else {
        const nonBlank = [reads.c, reads.d, reads.e, reads.f, reads.g, reads.h].filter(
          (v) => v.trim().length > 0,
        ).length;
        // Align with L1 audit heuristic:
        //   - course:  has courseName (C) and at least A or B non-blank
        //   - subtotal: no courseName but A or B has content (subtotal/小计/合计 rows)
        //   - malformed: no courseName and both A/B blank (structural anomaly)
        if (reads.c.trim().length === 0) {
          if (!aBlank || !bBlank) rowKind = 'subtotal';
          else rowKind = 'malformed';
        } else {
          rowKind = 'course';
          hasCourseRows = true;
        }
        // suppress unused-var warning when nonBlank not referenced
        void nonBlank;
      }
    }

    const skipKinds = new Set(['title', 'header', 'blank', 'subtotal', 'malformed']);
    if (skipKinds.has(rowKind)) {
      rows.push({
        sheetIndex,
        sheetNameHash,
        sourceRowIndex: r,
        sourceRange: rangeForRow(r, lastCol),
        rowKind,
        sourceEvidence: { sourceSheetNameHash: sheetNameHash, sourceRowIndex: r },
        warnings: [],
        confidence: 1.0,
      });
      continue;
    }

    const rowWarnings: CourseSettingDiagnostic[] = [];
    if (aBlank && upstreamA.length > 0)
      rowWarnings.push(
        mkDiag('INHERITED_GRADE_MAJOR', 'info', 'Grade/major inherited from upstream row', r, 'gradeMajor'),
      );
    if (bBlank && upstreamB.length > 0)
      rowWarnings.push(
        mkDiag('INHERITED_CLASS_COUNT', 'info', 'Class count inherited from upstream row', r, 'classCount'),
      );

    const gradeMajor = parseText(aText, includeRaw, 'gradeMajor');
    const classCount = parseClassCount(bText, includeRaw);
    const courseName = parseText(reads.c, includeRaw, 'courseName');
    const examType = parseExamType(reads.d);
    const weeklyHours = parseWeeklyHours(reads.e);
    const teacherAssignment = parseTeacherAssignment(reads.f, includeRaw);
    const remark = parseRemarkOrMerge(reads.g, 'remark');
    const mergeRemark = parseRemarkOrMerge(reads.h, 'mergeRemark');

    if (examType.classification === 'other')
      rowWarnings.push(
        mkDiag('EXAM_TYPE_OTHER', 'warn', '考试考查 not 试 or 查', r, 'examType'),
      );

    const draft: ParsedCourseSettingRow = {
      sheetIndex,
      sheetNameHash,
      sourceRowIndex: r,
      sourceRange: rangeForRow(r, lastCol),
      rowKind,
      gradeMajor,
      classCount,
      courseName,
      examType,
      weeklyHours,
      teacherAssignment,
      remark,
      mergeRemark,
      sourceEvidence: { sourceSheetNameHash: sheetNameHash, sourceRowIndex: r },
      warnings: rowWarnings,
      confidence: computeRowConfidence([
        gradeMajor.confidence,
        classCount.confidence,
        courseName.confidence,
        examType.confidence,
        weeklyHours.confidence,
        teacherAssignment.confidence,
        remark.confidence,
        mergeRemark.confidence,
      ]),
    };
    draft.sourceEvidence = buildSourceEvidenceDraft(draft, options, sheetNameHash);
    const inheritedMerged = diagnostics.filter(
      (d) =>
        (d.code === 'INHERITED_GRADE_MAJOR' || d.code === 'INHERITED_CLASS_COUNT') &&
        d.rowIndex === r,
    );
    draft.warnings = [...rowWarnings, ...inheritedMerged];
    rows.push(draft);
  }

  return {
    sheet: {
      sheetIndex,
      sheetNameHash,
      rowCount: totalRows,
      columnCount,
      mergedCellCount,
      headerRowIndex,
      columnMap,
      rows,
      diagnostics,
    },
    hasCourseRows,
  };
};

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Parse a course-setting xlsx file (in-memory Buffer) into a fully
 * structured, deterministic result. Pure function: same Buffer -> identical
 * result. No filesystem reads, no DB writes, no API/UI coupling. Sensitive
 * string values are emitted only when `includeRawValues: true`.
 */
export const parseCourseSettingXlsx = async (
  input: Buffer | Uint8Array,
  options: CourseSettingXlsxParseOptions = {},
): Promise<CourseSettingXlsxParseResult> => {
  const buf: Buffer = Buffer.isBuffer(input) ? input : Buffer.from(input);
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load(buf as unknown as ArrayBuffer);

  const sheets: ParsedCourseSettingSheet[] = [];
  const allDiagnostics: CourseSettingDiagnostic[] = [];
  let sheetCount = 0;
  let parsedSheetCount = 0;
  let totalRows = 0;
  let totalCourseRows = 0;
  let totalWarnings = 0;

  wb.eachSheet((ws) => {
    sheetCount += 1;
    if (ws.rowCount === 0 || getActualCellCount(ws) === 0) return;
    const sheetNameHash = hash(ws.name || `sheet-${sheetCount}`, 12);
    const { sheet, hasCourseRows } = parseSheet(ws, sheetCount, options, sheetNameHash);
    sheets.push(sheet);
    if (typeof sheet.headerRowIndex === 'number') parsedSheetCount += 1;
    totalRows += sheet.rowCount;
    if (hasCourseRows)
      for (const r of sheet.rows) if (r.rowKind === 'course') totalCourseRows += 1;
    for (const d of sheet.diagnostics) {
      if (d.severity === 'warn') totalWarnings += 1;
      allDiagnostics.push(d);
    }
    for (const r of sheet.rows)
      for (const w of r.warnings) if (w.severity === 'warn') totalWarnings += 1;
  });

  return {
    parserVersion: options.parserVersion ?? DEFAULT_PARSER_VERSION,
    artifact: {
      filename: options.artifactFilename
        ? extractBasename(options.artifactFilename)
        : undefined,
      sha256: sha256Hex(buf),
    },
    workbook: {
      sheetCount,
      parsedSheetCount,
      totalRows,
      totalCourseRows,
      totalWarnings,
    },
    sheets,
    diagnostics: allDiagnostics,
  };
};

/**
 * Thin fs.readFileSync wrapper around parseCourseSettingXlsx. The canonical
 * entry point for tests/embedding is the Buffer-based function.
 */
export const parseCourseSettingXlsxFile = async (
  filePath: string,
  options: CourseSettingXlsxParseOptions = {},
): Promise<CourseSettingXlsxParseResult> => {
  const buf = readFileSync(filePath);
  return parseCourseSettingXlsx(buf, {
    ...options,
    artifactFilename: options.artifactFilename ?? filePath,
  });
};
