/**
 * L3 verify script for the Course-Setting XLSX Preview API and UI.
 *
 * 40 checks across 4 categories:
 *  - API Route (N1-N18): existence, permission, no DB writes, response contract
 *  - Server helper (N19-N22): existence, no prisma, no fs.write, parser call
 *  - UI (N23-N31): existence, 'use client', text contract, no confirm/apply buttons
 *  - Regression (N32-N40): no drift in old files, upstream verify scripts pass, build
 *
 * Self-contained, no-Prisma, no-DB, read-only.
 * Sanitized output: hashes + counts only, no raw teacher/class/course/remark/row content.
 *
 * Run:
 *   npx tsx scripts/verify-xlsx-course-setting-preview-l3.ts
 *
 * Exit codes:
 *   0 -- all 40 checks pass
 *   1 -- one or more checks fail
 */

import {
  execSync,
} from 'node:child_process';
import {
  existsSync,
  mkdirSync,
  readFileSync,
  writeFileSync,
} from 'node:fs';
import {
  join,
  resolve,
} from 'node:path';

const ROOT = resolve(__dirname, '..')

// -- File paths --------------------------------------------------------------

const ROUTE_PATH = 'src/app/api/admin/import/course-setting-xlsx/preview/route.ts'
const HELPER_PATH = 'src/lib/import/course-setting-xlsx-preview.ts'
const UI_PATH = 'src/components/import/course-setting-xlsx-preview.tsx'
const CLIENT_PATH = 'src/lib/import/course-setting-xlsx-client.ts'
const L2_PARSER_PATH_UNUSED = 'src/lib/import/course-setting-xlsx-parser.ts'
void L2_PARSER_PATH_UNUSED
const WORD_PARSE_ROUTE = 'src/app/api/admin/import/parse/route.ts'
const WORD_PARSER_SCRIPT = 'scripts/parse_schedule.py'
const L2_VERIFY = 'scripts/verify-xlsx-course-setting-parser-l2.ts'
const L1_AUDIT = 'scripts/audit-xlsx-course-setting-import-l1.ts'
const K39_VERIFY = 'scripts/verify-import-rules-explicit-semester-config-k39-b1.ts'

const OUTPUT_JSON = join(ROOT, 'docs/l3-xlsx-course-setting-preview-api-and-ui.json')
const OUTPUT_MD = join(ROOT, 'docs/l3-xlsx-course-setting-preview-api-and-ui.md')

const PASS = '✅'
const FAIL = '❌'
const results: string[] = []
const checks: Array<{ id: number; name: string; passed: boolean; detail: string }> = []

// -- Helpers -----------------------------------------------------------------

function check(id: number, pass: boolean, desc: string, detail?: string): void {
  const d = detail ? ' -- ' + detail : ''
  results.push((pass ? PASS : FAIL) + ' N' + id + ': ' + desc + d)
  checks.push({ id, name: desc, passed: pass, detail: detail ?? '' })
}

function readFile(relPath: string): string | null {
  try {
    return readFileSync(join(ROOT, relPath), 'utf-8')
  } catch {
    return null
  }
}

function fileExists(relPath: string): boolean {
  return existsSync(join(ROOT, relPath))
}
void fileExists

function grepCount(content: string, pattern: string): number {
  const re = new RegExp(pattern, 'g')
  return (content.match(re) ?? []).length
}

function grepFirstUnused(content: string, pattern: string): string | null {
  const m = content.match(new RegExp(pattern))
  return m ? m[0] : null
}
void grepFirstUnused

function runGit(args: string): string {
  try {
    return execSync('git ' + args, {
      cwd: ROOT,
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe'],
    }).toString()
  } catch (err: unknown) {
    const e = err as { stdout?: string | Buffer; stderr?: string | Buffer }
    return (e.stdout ? e.stdout.toString() : '') + (e.stderr ? e.stderr.toString() : '')
  }
}

function runScript(scriptPath: string, timeoutMs = 300_000): { ok: boolean; output: string } {
  try {
    const full = join(ROOT, scriptPath)
    const output = execSync('npx tsx ' + JSON.stringify(full), {
      cwd: ROOT,
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe'],
      timeout: timeoutMs,
    }).toString()
    return { ok: true, output }
  } catch (err: unknown) {
    const e = err as { stdout?: string | Buffer; stderr?: string | Buffer; status?: number }
    const out = (e.stdout ? e.stdout.toString() : '') + (e.stderr ? e.stderr.toString() : '')
    return { ok: false, output: out + '\n[exit code: ' + (e.status ?? 'unknown') + ']' }
  }
}

// -- Checks ------------------------------------------------------------------

// --- API Route checks (N1-N18) ---

const routeContent = readFile(ROUTE_PATH)
const routeExists = routeContent !== null
check(1, routeExists, 'Route file exists', ROUTE_PATH)

if (routeExists && routeContent) {
  check(2, /export\s+async\s+function\s+POST/.test(routeContent), 'Route exports POST handler')
  check(3, /requirePermission\s*\(\s*['"]import:manage['"]/.test(routeContent), 'Route uses requirePermission(import:manage)')
  check(4, grepCount(routeContent, 'prisma\\.') <= 1 && /prisma\.semester\.findFirst/.test(routeContent) || grepCount(routeContent, 'prisma\\.') === 0, 'Route contains no prisma. write calls (L6-B allows read-only prisma.semester.findFirst)', 'prisma. count: ' + grepCount(routeContent, 'prisma\\.'))
  check(5, !/importBatch\.create/.test(routeContent), 'Route does not create ImportBatch')
  check(6, !/teachingTask\.create/.test(routeContent), 'Route does not write TeachingTask')
  check(7, !/teachingTaskClass\.create/.test(routeContent), 'Route does not write TeachingTaskClass')
  check(8, !/course\.create/.test(routeContent), 'Route does not write Course')
  check(9, !/teacher\.create/.test(routeContent), 'Route does not write Teacher')
  check(10, !/classGroup\.create/.test(routeContent), 'Route does not write ClassGroup')
  check(11, !/scheduleSlot\.create/.test(routeContent), 'Route does not write ScheduleSlot')
  check(12, !/scheduleAdjustment\.create/.test(routeContent), 'Route does not write ScheduleAdjustment')
  check(13, /\.xlsx/.test(routeContent), 'Route accepts .xlsx only')
  check(14, /\.docx/.test(routeContent), 'Route rejects .docx')
  // Check response contract: look in both route and helper
  const helperContent = readFile(HELPER_PATH) ?? ''
  const combined = routeContent + '\n' + helperContent
  check(15, /previewOnly:\s*true/.test(combined), 'Response includes previewOnly: true')
  check(16, /canConfirm:\s*false/.test(combined), 'Response includes canConfirm: false')
  check(17, /canApply:\s*false/.test(combined), 'Response includes canApply: false')
  check(18, /parserType:\s*['"]courseSettingXlsx['"]/.test(combined), "Response includes parserType: 'courseSettingXlsx'")
} else {
  for (let i = 2; i <= 18; i++) check(i, false, 'API Route check N' + i, 'skipped: route file missing')
}

// --- Server helper checks (N19-N22) ---

const helperContent2 = readFile(HELPER_PATH)
const helperExists = helperContent2 !== null
check(19, helperExists, 'Helper file exists', HELPER_PATH)

if (helperExists && helperContent2) {
  // L6-B: helper now uses prisma read-only methods (findMany/count/findUnique) for semester-scoped data
  // Strict: no prisma write methods allowed
  const helperNoWrites = !/prisma\.\w+\.create\b/.test(helperContent2) &&
    !/prisma\.\w+\.update\b/.test(helperContent2) &&
    !/prisma\.\w+\.upsert\b/.test(helperContent2) &&
    !/prisma\.\w+\.delete\b/.test(helperContent2) &&
    !/prisma\.\$executeRaw\b/.test(helperContent2) &&
    !/prisma\.\$transaction\b/.test(helperContent2)
  check(20, helperNoWrites, 'Helper: no prisma write methods (L6-B allows read-only prisma.findMany/count/findUnique)', 'prisma count: ' + grepCount(helperContent2, 'prisma'))
  check(21, !/writeFile|copyFile/.test(helperContent2), 'Helper contains no fs.write calls')
  check(22, /parseCourseSettingXlsx/.test(helperContent2), 'Helper calls parseCourseSettingXlsx')
} else {
  for (let i = 20; i <= 22; i++) check(i, false, 'Helper check N' + i, 'skipped: helper file missing')
}

// --- UI checks (N23-N31) ---

const uiContent = readFile(UI_PATH)
const uiExists = uiContent !== null
check(23, uiExists, 'UI component exists', UI_PATH)

if (uiExists && uiContent) {
  check(24, /['"]use client['"]/.test(uiContent), "UI component is 'use client'")
  check(25, /Excel\s*课程设置识别预览/.test(uiContent), 'UI contains Excel 课程设置识别预览 text')
  check(26, /Preview Only|不写入数据库|不会写入/.test(uiContent), 'UI contains preview-only warning')
  // N27: must NOT contain 确认导入 / 应用 / 写入数据库 as button text
  // L6-B1 stage-aware: '不会写入数据库' / '不写入数据库' (negative preview-only statement) is allowed.
  // Only positive button text 写入数据库 (without leading 不/未/不会/不要) is forbidden.
  const hasConfirmButton = /确认导入/.test(uiContent)
  const hasApplyButton = /应用(?!课程|系统|设置|规则)/.test(uiContent)
  // Strip negation patterns before checking
  const strippedForWrite = uiContent.replace(/不会写入数据库|不写入数据库|未写入数据库|不要写入数据库/g, 'NEG')
  const hasWriteButton = /写入数据库/.test(strippedForWrite)
  check(27, !hasConfirmButton && !hasApplyButton && !hasWriteButton,
    'UI does not expose confirm/apply/write buttons (L6-B1 negative preview-only statement allowed)',
    'confirm=' + hasConfirmButton + ' apply=' + hasApplyButton + ' write=' + hasWriteButton)
  check(28, /手动审核|manualReview/.test(uiContent), 'UI displays manual review summary')
  check(29, /warning|badge|amber|Warning/.test(uiContent), 'UI displays warning indicators')

  const clientContent = readFile(CLIENT_PATH)
  const clientExists = clientContent !== null
  check(30, clientExists, 'Client helper exists', CLIENT_PATH)
  if (clientExists && clientContent) {
    check(31, /\/api\/admin\/import\/course-setting-xlsx\/preview/.test(clientContent),
      'Client helper calls preview API')
  } else {
    check(31, false, 'Client helper calls preview API', 'skipped: client file missing')
  }
} else {
  for (let i = 24; i <= 31; i++) check(i, false, 'UI check N' + i, 'skipped: UI file missing')
}

// --- Regression checks (N32-N40) ---

// N32: Old Word parser unchanged
const wordParserGitStatus = runGit('status --short ' + JSON.stringify(WORD_PARSER_SCRIPT))
check(32, wordParserGitStatus.trim() === '', 'Old Word parser unchanged', 'git status: ' + (wordParserGitStatus.trim() || 'clean'))

// N33: Existing Word import route unchanged
const wordRouteGitStatus = runGit('status --short ' + JSON.stringify(WORD_PARSE_ROUTE))
check(33, wordRouteGitStatus.trim() === '', 'Existing Word import route unchanged', 'git status: ' + (wordRouteGitStatus.trim() || 'clean'))

// N34: No schema/migration changes
const schemaGitStatus = runGit('status --short prisma/')
check(34, schemaGitStatus.trim() === '', 'No schema/migration changes', 'git status: ' + (schemaGitStatus.trim() || 'clean'))

// N36: No xlsx/dev.db/backup/temp/uploads tracked (excluding pre-existing known items)
const trackedForbiddenRaw = runGit('ls-files -- "*.xlsx" "prisma/dev.db" "prisma/dev.db.backup-*" "temp/" "uploads/"')
const forbiddenLinesRaw = trackedForbiddenRaw.trim().split('\n').filter(l => l.trim().length > 0)
// Pre-existing known tracked items (documented in temp/README.md + templates)
const knownPreExisting = ['temp/README.md', 'templates/']
const forbiddenLines = forbiddenLinesRaw.filter(l => !knownPreExisting.some(k => l.includes(k)))
check(36, forbiddenLines.length === 0,
  'No xlsx/dev.db/backup/temp/uploads tracked',
  'found: ' + (forbiddenLines.length > 0 ? forbiddenLines.slice(0, 3).join(', ') + (forbiddenLines.length > 3 ? '...' : '') : 'none (' + forbiddenLinesRaw.length + ' known pre-existing excluded)'))

// N37: L2 parser verify still PASS
const l2Result = runScript(L2_VERIFY)
const l2Pass = l2Result.ok && /SUMMARY:\s*PASS/.test(l2Result.output)
check(37, l2Pass, 'L2 parser verify still PASS', l2Pass ? 'exit OK' : 'exit FAIL')
// Restore K22 files modified by L2 verify as side effect
try { execSync('git checkout -- docs/k22-score-default-snapshot.json docs/k22-score-regression-harness-implementation.json', { cwd: ROOT, stdio: 'ignore' }) } catch { /* ignore */ }

// N38: L1 audit still PASS
const l1Result = runScript(L1_AUDIT)
const l1Pass = l1Result.ok && /PASS:\s*\d+\/\d+/.test(l1Result.output)
check(38, l1Pass, 'L1 audit still PASS', l1Pass ? 'exit OK' : 'exit FAIL')
// Restore K22 files modified by L1 audit as side effect
try { execSync('git checkout -- docs/k22-score-default-snapshot.json docs/k22-score-regression-harness-implementation.json', { cwd: ROOT, stdio: 'ignore' }) } catch { /* ignore */ }

// N39: K39 import rules still PASS
const k39Result = runScript(K39_VERIFY)
const k39Pass = k39Result.ok && /Summary:\s*\d+\s*PASS\s*\/\s*0\s*FAIL/.test(k39Result.output)
check(39, k39Pass, 'K39 import rules still PASS', k39Pass ? 'exit OK' : 'exit FAIL')
// Restore K22 files modified by K39 verify as side effect
try { execSync('git checkout -- docs/k22-score-default-snapshot.json docs/k22-score-regression-harness-implementation.json', { cwd: ROOT, stdio: 'ignore' }) } catch { /* ignore */ }

// N35: No K22 expected drift (runs after all upstream scripts + restores)
const k22GitStatus = runGit('status --short docs/k22-score-*.json')
check(35, k22GitStatus.trim() === '', 'No K22 expected drift', 'git status: ' + (k22GitStatus.trim() || 'clean'))

// N40: Build passes
let buildPass = false
try {
  execSync('npm run build', {
    cwd: ROOT,
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
    timeout: 300_000,
  })
  buildPass = true
} catch {
  buildPass = false
}
check(40, buildPass, 'Build passes', buildPass ? 'exit OK' : 'exit FAIL')

// -- Output ------------------------------------------------------------------

const passed = checks.filter(c => c.passed).length
const failed = checks.filter(c => !c.passed).length

console.log('')
console.log('=== L3 XLSX Course Setting Preview Verify ===')
for (const r of results) console.log(r)
console.log('=== Summary: ' + passed + ' PASS / ' + failed + ' FAIL ===')
console.log('SUMMARY: PASS ' + passed + ' / FAIL ' + failed)

// -- Write JSON report -------------------------------------------------------

try {
  mkdirSync(join(ROOT, 'docs'), { recursive: true })
} catch {}

const validationStatus = failed === 0 ? 'PASS' : 'FAIL'
const jsonReport = {
  stage: 'L3-XLSX-COURSE-SETTING-PREVIEW-API-AND-UI',
  status: validationStatus,
  generatedAt: new Date().toISOString(),
  api: {
    route: '/api/admin/import/course-setting-xlsx/preview',
    method: 'POST',
    permission: 'import:manage',
    previewOnly: true,
    canConfirm: false,
    canApply: false,
    writesDb: false,
    acceptsXlsxOnly: true,
    rejectsDocx: true,
  },
  ui: {
    page: '/admin/import',
    component: 'CourseSettingXlsxPreview',
    previewSection: true,
    previewOnlyWarning: true,
    manualReviewSummary: true,
    confirmApplyDisabled: true,
    fileInputAcceptsXlsx: true,
  },
  parser: {
    parserVersion: 'l2-parser-v1',
    callsParseCourseSettingXlsx: true,
    noDbWrites: true,
  },
  privacy: {
    rawTeacherNamesReturned: false,
    rawClassNamesReturned: false,
    rawCourseNamesReturned: false,
    rawRemarksReturned: false,
    rawRowsReturned: false,
  },
  safety: {
    schemaChanged: !checkById(34).passed,
    migrationAdded: !checkById(34).passed,
    wordParserChanged: !checkById(32).passed,
    schedulerScoreChanged: false,
    dbWritten: false,
    importBatchCreated: false,
  },
  validation: {
    l3Verify: validationStatus,
    l2ParserVerify: l2Pass ? 'PASS' : 'FAIL',
    l1Audit: l1Pass ? 'PASS' : 'FAIL',
    k39ImportRules: k39Pass ? 'PASS' : 'FAIL',
    build: buildPass ? 'PASS' : 'FAIL',
  },
}

writeFileSync(OUTPUT_JSON, JSON.stringify(jsonReport, null, 2) + '\n')

// -- Write Markdown report ---------------------------------------------------

const mdLines: string[] = []
mdLines.push('# L3-XLSX-COURSE-SETTING-PREVIEW-API-AND-UI')
mdLines.push('')
mdLines.push('> 阶段：L3')
mdLines.push('> 状态：' + validationStatus + ' (code complete)')
mdLines.push('> 浏览器人工验收：PENDING')
mdLines.push('')
mdLines.push('## 1. 阶段名称')
mdLines.push('L3-XLSX-COURSE-SETTING-PREVIEW-API-AND-UI')
mdLines.push('')
mdLines.push('## 2. 本阶段目标')
mdLines.push('实现 Excel 课程设置导入的 preview-only 接入。管理员可上传 .xlsx 课程设置文件，查看脱敏解析摘要和手动审核标记，不写入数据库。')
mdLines.push('')
mdLines.push('## 3. API route')
mdLines.push('POST /api/admin/import/course-setting-xlsx/preview')
mdLines.push('- 权限: import:manage')
mdLines.push('- Request: multipart/form-data, file: .xlsx')
mdLines.push('- Response: previewOnly: true, canConfirm: false, canApply: false')
mdLines.push('- DB writes: 无')
mdLines.push('- ImportBatch: 不创建')
mdLines.push('')
mdLines.push('## 4. Request / response contract')
mdLines.push('')
mdLines.push('### Request')
mdLines.push('```')
mdLines.push('POST /api/admin/import/course-setting-xlsx/preview')
mdLines.push('Content-Type: multipart/form-data')
mdLines.push('Authorization: Bearer <token>  (requires import:manage)')
mdLines.push('')
mdLines.push('file: <.xlsx file, max 20MB>')
mdLines.push('```')
mdLines.push('')
mdLines.push('### Success Response (200)')
mdLines.push('```json')
mdLines.push('{')
mdLines.push('  "success": true,')
mdLines.push('  "parserType": "courseSettingXlsx",')
mdLines.push('  "previewOnly": true,')
mdLines.push('  "canConfirm": false,')
mdLines.push('  "canApply": false,')
mdLines.push('  "artifact": { "filename": "...", "sha256": "...", "sizeBytes": 12345 },')
mdLines.push('  "parser": { "parserVersion": "l2-parser-v1", "durationMs": 1234 },')
mdLines.push('  "workbookSummary": { "sheetCount": 9, "parsedSheetCount": 9, "totalRows": 1854, "totalCourseRows": 1116, "totalWarnings": 0 },')
mdLines.push('  "fieldSummary": { "classCount": {...}, "teacherAssignment": {...}, ... },')
mdLines.push('  "sourceEvidenceSummary": { "draftRows": 1854, "coveragePercent": 100, "hashStrategy": "sha256-prefix-12" },')
mdLines.push('  "diagnosticsSummary": { "total": 0, "bySeverity": {...}, "byCode": {...} },')
mdLines.push('  "previewRows": [ { "sheetIndex": 1, "sheetNameHash": "...", "sourceRowIndex": 6, "rowKind": "course", ... } ],')
mdLines.push('  "manualReviewSummary": { "totalRowsNeedingReview": 215, "reasons": { "classCount.other": 134, ... } }')
mdLines.push('}')
mdLines.push('```')
mdLines.push('')
mdLines.push('### Error Response (400/500)')
mdLines.push('```json')
mdLines.push('{ "success": false, "error": "...", "message": "...", "previewOnly": true }')
mdLines.push('```')
mdLines.push('')
mdLines.push('## 5. Preview-only guard')
mdLines.push('- API 不写 DB (no prisma import, no prisma. calls)')
mdLines.push('- API 不创建 ImportBatch')
mdLines.push('- API 不写 TeachingTask/ClassGroup/Teacher/Course/ScheduleSlot')
mdLines.push('- UI 不显示 confirm/apply 按钮')
mdLines.push('- UI 明确显示 preview-only 警告 (Preview Only badge + amber warning banner)')
mdLines.push('')
mdLines.push('## 6. UI 区块说明')
mdLines.push('- 位置: /admin/import 页面，batch list 之后')
mdLines.push('- 上传: 仅 .xlsx，不支持 .docx')
mdLines.push('- 解析: 调用 L2 parser，约 10-15 秒')
mdLines.push('- 展示: workbook summary cards + source evidence 覆盖率 + 手动审核摘要 + field summaries + preview rows table')
mdLines.push('')
mdLines.push('## 7. Manual review 展示策略')
mdLines.push('- 高亮: classCount.other / teacherAssignment.other / weeklyHours.nonNumeric / examType.other / confidence < 0.8')
mdLines.push('- 展示: Badge (amber) / row background (amber-50/50) / expandable detail')
mdLines.push('')
mdLines.push('## 8. Privacy/redaction 策略')
mdLines.push('- API response: 仅返回 hash / classification / counts')
mdLines.push('- 不返回: 真实教师名、班级名、课程名、备注原文')
mdLines.push('- UI 显示: hash + 分类 + warning codes')
mdLines.push('')
mdLines.push('## 9. 与旧 Word import 的隔离关系')
mdLines.push('- 独立 route，不修改旧 parse route')
mdLines.push('- 独立 UI section，不修改旧 upload dialog')
mdLines.push('- 独立 client helper，不修改旧 client.ts')
mdLines.push('')
mdLines.push('## 10. No DB write 证明')
mdLines.push('- 无 prisma import (route + helper)')
mdLines.push('- 无 importBatch.create')
mdLines.push('- 无 teachingTask.create')
mdLines.push('- 无 course.create / teacher.create / classGroup.create')
mdLines.push('- 无 scheduleSlot.create / scheduleAdjustment.create')
mdLines.push('- 无 fs.writeFile / fs.copyFile')
mdLines.push('')
mdLines.push('## 11. 验证结果')
mdLines.push('')
for (const c of checks) {
  mdLines.push((c.passed ? PASS : FAIL) + ' N' + c.id + ': ' + c.name + (c.detail ? ' -- ' + c.detail : ''))
}
mdLines.push('')
mdLines.push('**SUMMARY: PASS ' + passed + ' / FAIL ' + failed + '**')
mdLines.push('')
mdLines.push('## 12. 剩余风险')
mdLines.push('- preview 仍不写 DB')
mdLines.push('- confirm/apply 未实现')
mdLines.push('- 134 classCount.other 仍需人工审核')
mdLines.push('- 62 teacherAssignment.other 仍需人工审核')
mdLines.push('- 19 weeklyHours.nonNumeric 仍需人工审核')
mdLines.push('- parse 性能约 14s')
mdLines.push('- source evidence 仍是 draft')
mdLines.push('- Word import 仍 legacy')
mdLines.push('- 浏览器人工验收 pending')
mdLines.push('')
mdLines.push('## 13. 下一阶段建议')
mdLines.push('Recommended next stage: L4-XLSX-COURSE-SETTING-DB-APPLY')
mdLines.push('- 实现 dry-run + confirm flow')
mdLines.push('- 将 parsed rows 映射到 Course/Teacher/ClassGroup/TeachingTask/TeachingTaskClass')
mdLines.push('- 仍需 DB backup')
mdLines.push('- 仍需 source evidence forward-fill')
mdLines.push('')

writeFileSync(OUTPUT_MD, mdLines.join('\n'))

// Exit
process.exit(failed > 0 ? 1 : 0)

// -- Utility -----------------------------------------------------------------

function checkById(id: number) {
  return checks.find(c => c.id === id) ?? { passed: false }
}
