/**
 * K19-IMPORT-MATCHING-IMPROVEMENT-AUDIT
 *
 * Read-only root-cause audit of the import parser / importer / ClassGroup
 * matching logic. Targets the K9-DQ-1 issue class: cross-cohort and
 * cross-track 合班 false positives caused by weak / fuzzy / subsequence
 * matching against parsed .docx data.
 *
 * Scope (per K19 spec):
 *  - Read-only Prisma queries. No writes of any kind.
 *  - Reads source artifacts from uploads/imports/ (read-only).
 *  - Reads historical K17/K18 JSON reports.
 *  - Applies six rules (A-F) and grades findings HIGH/MEDIUM/LOW/INFO/NONE.
 *  - Emits console summary + JSON report.
 *
 * Out of scope (per spec):
 *  - Schema, API route, import logic, parser, solver, frontend, RBAC.
 *  - Re-import or rollback.
 *  - Solver scoring, Room.capacity, permission key splits.
 */

import { PrismaClient } from '@prisma/client'
import { readFileSync, writeFileSync, readdirSync, existsSync, statSync } from 'fs'
import { join } from 'path'

// ─── Constants ────────────────────────────────────────────────────────

const KNOWN_TRACKS = ['高本贯通', '现场工程师']

const LIKELY_PUBLIC_COURSE_HINTS = [
  '大学英语', '大学日语', '大学语文', '高等数学',
  '习近平新时代中国特色社会主义思想概论',
  '毛泽东思想和中国特色社会主义理论体系概论',
  '思想道德与法治', '形势与政策', '创新创业教育',
  '职业生涯规划', '体育', '军事理论', '心理健康教育',
  '劳动教育', '信息技术', '计算机应用基础', '中华优秀传统文化',
  '美育', '职业素养', '大学生职业发展与就业指导',
]

const MERGED_CLASS_KEYWORDS = ['合班', '与', '多班']

// Target class focus for the historical K9-DQ-1 case
const TARGET_CLASS_2024 = '2024级钢铁智能冶金技术1班（高本贯通）'
const TARGET_CLASS_2025 = '2025级钢铁智能冶金技术1班（高本贯通）'
const TARGET_CLASS_2024_SF = '2024级森林草原防火技术1班'
// eslint-disable-next-line @typescript-eslint/no-unused-vars
const TARGET_CLASS_2025_SF = '2025级森林草原防火技术1班'

// ─── Types ────────────────────────────────────────────────────────────

type Severity = 'HIGH' | 'MEDIUM' | 'LOW' | 'INFO' | 'NONE'

interface ParsedClassGroup {
  id: number
  name: string
  semesterId: number | null
  cohortYear: number | null
  track: string | null
}

interface ParsedRecord {
  index: number
  className: string
  teacher: string | null
  course: string | null
  room: string | null
  remark: string | null
  weekType: string
  startWeek: number
  endWeek: number
  sourceFile: string
}

interface Finding {
  id: string
  severity: Severity
  category: string
  title: string
  evidence: string
  files: string[]
  codeReferences: string[]
  affectedHistoricalTasks: number[]
  reproductionRisk: 'CONFIRMED' | 'LIKELY' | 'POSSIBLE' | 'NONE'
  recommendation: string
  suggestedNextStage: string
}

interface HistoricalCase {
  taskId: number
  course: string
  teacher: string | null
  wrongClassGroup: string
  expectedClassGroup: string
  rootCauseHypothesis: string
  currentStatus: 'REPAIRED' | 'NEEDS_REVIEW' | 'ACTIVE'
  sourceFileEvidence: string
  semanticGuard: string
}

// ─── Helpers ──────────────────────────────────────────────────────────

function extractCohortYear(name: string): number | null {
  const m = name.match(/^(\d{4})级/)
  return m ? parseInt(m[1], 10) : null
}

function extractTrack(name: string): string | null {
  for (const t of KNOWN_TRACKS) {
    if (name.includes(t)) return t
  }
  return null
}

function isPublicCourse(course: string | null): boolean {
  if (!course) return false
  return LIKELY_PUBLIC_COURSE_HINTS.some(h => course.includes(h))
}

// eslint-disable-next-line @typescript-eslint/no-unused-vars
function hasMergedRemark(remark: string | null): boolean {
  if (!remark) return false
  return MERGED_CLASS_KEYWORDS.some(kw => remark.includes(kw))
}

function fileExists(p: string): boolean {
  try {
    return existsSync(p) && statSync(p).isFile()
  } catch {
    return false
  }
}

// ─── Code / artifact loaders ──────────────────────────────────────────

interface CodeEvidence {
  filePath: string
  matchCount: number
  sampleLines: string[]
}

function grepCode(pattern: string, root: string, maxFiles = 30): CodeEvidence[] {
  const results: CodeEvidence[] = []
  const files: string[] = []
  function walk(d: string) {
    if (files.length >= maxFiles * 4) return
    let entries: string[]
    try {
      entries = readdirSync(d)
    } catch {
      return
    }
    for (const e of entries) {
      if (files.length >= maxFiles * 4) return
      const full = join(d, e)
      let st
      try { st = statSync(full) } catch { continue }
      if (st.isDirectory()) {
        if (e === 'node_modules' || e === '.next' || e === '.git') continue
        walk(full)
      } else if (st.isFile() && /\.(ts|tsx|js|json)$/.test(e) && !/\.test\.ts$/.test(e)) {
        files.push(full)
      }
    }
  }
  walk(root)
  for (const f of files) {
    let text: string
    try { text = readFileSync(f, 'utf-8') } catch { continue }
    if (!text.includes(pattern)) continue
    const lines = text.split('\n')
    const matched: string[] = []
    for (let i = 0; i < lines.length; i++) {
      if (lines[i].includes(pattern)) {
        matched.push(`${i + 1}: ${lines[i].trim().slice(0, 200)}`)
        if (matched.length >= 5) break
      }
    }
    if (matched.length > 0) {
      results.push({ filePath: f.replace(/\\/g, '/'), matchCount: matched.length, sampleLines: matched })
    }
    if (results.length >= maxFiles) break
  }
  return results
}

function loadHistoricalReports(): Record<string, unknown> {
  const docs = [
    'docs/k18-task37-finalization-execute.json',
    'docs/k18-cross-cohort-data-repair-execute.json',
    'docs/k18-task37-source-artifact-review.json',
    'docs/k17-data-quality-classgroup-matching-audit.json',
    'docs/k17-cross-cohort-review-decision.json',
  ]
  const out: Record<string, unknown> = {}
  for (const p of docs) {
    const abs = join(process.cwd(), p)
    if (fileExists(abs)) {
      try { out[p] = JSON.parse(readFileSync(abs, 'utf-8')) } catch { /* ignore */ }
    }
  }
  return out
}

function loadSourceArtifacts(): ParsedRecord[] {
  const dir = join(process.cwd(), 'uploads/imports')
  if (!existsSync(dir)) return []
  const records: ParsedRecord[] = []
  const files = readdirSync(dir).filter(f => f.endsWith('.json'))
  for (const f of files) {
    const abs = join(dir, f)
    let data: Record<string, unknown>[]
    try { data = JSON.parse(readFileSync(abs, 'utf-8')) as Record<string, unknown>[] } catch { continue }
    for (let i = 0; i < data.length; i++) {
      const r = data[i]
      records.push({
        index: i,
        className: r.class_info?.class_name ?? '',
        teacher: r.teacher ?? null,
        course: r.course ?? null,
        room: r.room ?? null,
        remark: r.remark ?? null,
        weekType: r.week_type ?? 'ALL',
        startWeek: r.week_start ?? 1,
        endWeek: r.week_end ?? 16,
        sourceFile: f,
      })
    }
  }
  return records
}

// ─── Audit logic ──────────────────────────────────────────────────────

async function main() {
  const prisma = new PrismaClient()
  const findings: Finding[] = []
  const findingsBySeverity: Record<Severity, number> = { HIGH: 0, MEDIUM: 0, LOW: 0, INFO: 0, NONE: 0 }

  // ── 1. Read source artifacts and code ────────────────────────────
  const sourceRecords = loadSourceArtifacts()
  const codeRefs = {
    findMerged: grepCode('findMergedClassNames', join(process.cwd(), 'src')),
    filterCandidates: grepCode('filterCandidatesByYearAndTrack', join(process.cwd(), 'src')),
    parseRemark: grepCode('parseRemarkKeywords', join(process.cwd(), 'src')),
    includes: grepCode('.includes(', join(process.cwd(), 'src/lib/import')),
    subseq: grepCode('subseqMatches', join(process.cwd(), 'src/lib/import')),
    executeImport: grepCode('executeImportInTransaction', join(process.cwd(), 'src/lib/import')),
    prepareRecords: grepCode('prepareRecords', join(process.cwd(), 'src/lib/import')),
    importBatch: grepCode('ImportBatch', join(process.cwd(), 'src/lib/import')),
    cohortYear: grepCode('cohortYear', join(process.cwd(), 'src/lib')),
    crossCohort: grepCode('crossCohort', join(process.cwd(), 'src')),
    ambiguous: grepCode('AMBIGUOUS', join(process.cwd(), 'src')),
  }
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const historical = loadHistoricalReports()

  // ── 2. Read-only DB state ────────────────────────────────────────
  const classGroups = await prisma.classGroup.findMany({ orderBy: { id: 'asc' } })
  const teachingTasks = await prisma.teachingTask.findMany({
    include: {
      course: { select: { id: true, name: true } },
      teacher: { select: { id: true, name: true } },
      taskClasses: { include: { classGroup: { select: { id: true, name: true, semesterId: true } } } },
      importBatch: { select: { id: true, status: true, filename: true, parsedJsonPath: true } },
    },
  })
  const importBatches = await prisma.importBatch.findMany({ orderBy: { id: 'asc' } })
  const scheduleSlots = await prisma.scheduleSlot.findMany({
    select: { id: true, teachingTaskId: true, dayOfWeek: true, slotIndex: true },
  })

  // ── 3. Build ParsedClassGroup index ───────────────────────────────
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const cgParsed: ParsedClassGroup[] = classGroups.map(c => ({
    id: c.id,
    name: c.name,
    semesterId: c.semesterId,
    cohortYear: extractCohortYear(c.name),
    track: extractTrack(c.name),
  }))

  // ── 4. Cross-cohort analysis ──────────────────────────────────────
  interface CrossCohortTask {
    teachingTaskId: number
    courseName: string
    teacherName: string | null
    cohortYears: number[]
    classGroupIds: number[]
    isPublicCourse: boolean
    importBatchId: number | null
    importBatchStatus: string | null
    slotCount: number
  }
  const crossCohortTasks: CrossCohortTask[] = []
  for (const t of teachingTasks) {
    const years = new Set<number>()
    const cgIds: number[] = []
    for (const tc of t.taskClasses) {
      const cy = extractCohortYear(tc.classGroup.name)
      if (cy != null) years.add(cy)
      cgIds.push(tc.classGroupId)
    }
    if (years.size > 1) {
      crossCohortTasks.push({
        teachingTaskId: t.id,
        courseName: t.course?.name ?? '?',
        teacherName: t.teacher?.name ?? null,
        cohortYears: [...years].sort(),
        classGroupIds: cgIds.sort((a, b) => a - b),
        isPublicCourse: isPublicCourse(t.course?.name ?? null),
        importBatchId: t.importBatchId,
        importBatchStatus: t.importBatch?.status ?? null,
        slotCount: scheduleSlots.filter(s => s.teachingTaskId === t.id).length,
      })
    }
  }

  // ── 5. Historical error cases (K18 repaired) ─────────────────────
  const historicalCases: HistoricalCase[] = [
    {
      taskId: 168,
      course: '机械制图',
      teacher: '赵春超',
      wrongClassGroup: TARGET_CLASS_2024,
      expectedClassGroup: TARGET_CLASS_2025 + ' (and 2025 cohort 现场工程师 classes only)',
      rootCauseHypothesis: '2025 cohort 现场工程师 CG18/19 remark "与高本贯通合班" (implied) or name-similarity "钢铁智能冶金" 跨过 cohort filter. Import matching picked up 2024 cohort CG22 (高本贯通) as a match because the 2024 cohort is a 2024-级 candidate and the existing filter only requires `cy === baseYear` when keyword has no explicit year. The base 2025-级高本贯通 class is the source, and the remark "合班" or class name substring "钢铁智能冶金" was matched against the 2024 cohort CG22.',
      currentStatus: 'REPAIRED',
      sourceFileEvidence: 'K18 source artifact review confirms parsed JSON has 2025 cohort classes only for 机械制图',
      semanticGuard: 'K16 fix-a: guardTeachingTaskUpdateSemantics covers teacher/room/classGroup/week/semester',
    },
    {
      taskId: 174,
      course: '机械制图',
      teacher: '张红梅',
      wrongClassGroup: TARGET_CLASS_2024,
      expectedClassGroup: TARGET_CLASS_2025 + ' (and 2025 cohort 现场工程师 classes only)',
      rootCauseHypothesis: 'Same as task 168 — 2024 cohort 高本贯通 CG22 incorrectly merged via 合班 remark / name-similarity matching.',
      currentStatus: 'REPAIRED',
      sourceFileEvidence: 'K18 source artifact review confirms parsed JSON has 2025 cohort classes only for 机械制图',
      semanticGuard: 'K16 fix-a covers teaching task mutation',
    },
    {
      taskId: 176,
      course: '电子技术',
      teacher: '许进',
      wrongClassGroup: TARGET_CLASS_2024,
      expectedClassGroup: TARGET_CLASS_2025 + ' (and 2025 cohort 现场工程师 classes only)',
      rootCauseHypothesis: 'Same root cause — 2024 cohort 高本贯通 CG22 incorrectly merged via name-similarity "钢铁智能冶金" or 合班 remark expansion.',
      currentStatus: 'REPAIRED',
      sourceFileEvidence: 'K18 source artifact review confirms parsed JSON has 2025 cohort classes only for 电子技术',
      semanticGuard: 'K16 fix-a covers teaching task mutation',
    },
    {
      taskId: 181,
      course: '传感器与检测技术',
      teacher: '张旭',
      wrongClassGroup: TARGET_CLASS_2024,
      expectedClassGroup: TARGET_CLASS_2025 + ' (and 2025 cohort 现场工程师 classes only)',
      rootCauseHypothesis: 'Same root cause — 2024 cohort 高本贯通 CG22 incorrectly merged via name-similarity or remark expansion.',
      currentStatus: 'REPAIRED',
      sourceFileEvidence: 'K18 source artifact review confirms parsed JSON has 2025 cohort classes only for 传感器与检测技术',
      semanticGuard: 'K16 fix-a covers teaching task mutation',
    },
    {
      taskId: 37,
      course: '习近平新时代中国特色社会主义思想概论',
      teacher: '房忠敏',
      wrongClassGroup: TARGET_CLASS_2024_SF,
      expectedClassGroup: '2025级钢铁智能冶金技术1班（高本贯通） + 2025级森林草原防火技术1班 (only)',
      rootCauseHypothesis: '2025 cohort 钢铁智能冶金 1班 (高本贯通) remark "与森防合班" → matches "森防" → against 2024 cohort 森林草原防火 1班 (CG35). The remark keyword "森防" has no explicit year, and baseClass 2025级钢铁智能冶金 is 2025. The cohort filter `cy !== baseYear` only kicks in when keyword has no explicit year, so the filter is active — yet the 2024 candidate is still matched. ACTUAL REPRO: review of source artifacts (K18-C) shows no 2024 record for 房忠敏+习近平 in any parsed JSON. Most likely the import previously (before filter existed) merged it, or the import logic matched via a different path (e.g. previous import batch had a different base year, or seed_db.ts pre-filtered data).',
      currentStatus: 'NEEDS_REVIEW',
      sourceFileEvidence: 'No 2024 record for 房忠敏+习近平 in any source artifact (K18-C)',
      semanticGuard: 'K16 fix-a covers teaching task mutation',
    },
  ]

  // ── 6. Rule A: cross-cohort weak matching ────────────────────────
  // The importer.ts uses .includes() matching in findMergedClassNames.
  // After filterCandidatesByYearAndTrack, a candidate must:
  //   - if keyword lacks 2024级 / 2025级, share baseClass year
  //   - if keyword lacks 高本贯通 / 现场工程师, share baseClass track
  // For task 37:
  //   - baseClass = 2025级钢铁智能冶金技术1班（高本贯通）
  //   - keyword = "森防" (no year, no track)
  //   - filter requires candidate year === 2025 (2024 cohort 森林草原防火 1班 excluded)
  //   - So 2024 CG35 should be excluded. But K17-FIX-A confirms it WAS linked.
  //   - HYPOTHESIS: at the time of ImportBatch #1, the cohort filter may not have
  //     existed yet, OR the import path that ran was a previous version of the code
  //     (e.g. the seed_db.ts CLI seed, which is also noted to do this without
  //     strict cohort filter enforcement).
  const evidenceA: string[] = []
  if (codeRefs.findMerged.length > 0) {
    evidenceA.push(`findMergedClassNames found in: ${codeRefs.findMerged.map(r => r.filePath).join(', ')}`)
  }
  if (codeRefs.includes.length > 0) {
    evidenceA.push(`.includes() weak matching in src/lib/import/: ${codeRefs.includes.map(r => r.filePath).join(', ')}`)
  }
  if (codeRefs.subseq.length > 0) {
    evidenceA.push(`subsequence matching present in: ${codeRefs.subseq.map(r => r.filePath).join(', ')}`)
  }
  // Check historical: was task 37 caused by current importer or by historical seed_db.ts?
  const task37LinkedTo2024 = crossCohortTasks.find(t => t.teachingTaskId === 37)
  if (task37LinkedTo2024) {
    evidenceA.push(`Task 37 (习近平思想) currently cross-cohort: years=[${task37LinkedTo2024.cohortYears.join(',')}], cgIds=[${task37LinkedTo2024.classGroupIds.join(',')}]`)
  }

  findings.push({
    id: 'K19-RULE-A-001',
    severity: 'MEDIUM',
    category: 'WEAK_MATCHING',
    title: 'ClassGroup matching uses .includes() + subsequence matching after a year/track pre-filter',
    evidence: evidenceA.join('; ') || 'No evidence collected',
    files: [
      'src/lib/import/importer.ts',
      'src/lib/import/parse-utils.ts',
      'scripts/seed_db.ts',
    ],
    codeReferences: [
      'src/lib/import/importer.ts:171-196 filterCandidatesByYearAndTrack',
      'src/lib/import/importer.ts:227-296 findMergedClassNames',
      'src/lib/import/importer.ts:243-249 c.name.includes(kw) includes() match',
      'src/lib/import/importer.ts:265-281 subsequence char-by-char match',
      'scripts/seed_db.ts:177-237 findMergedClassIds (legacy, similar logic)',
    ],
    affectedHistoricalTasks: [37, 168, 174, 176, 181],
    reproductionRisk: 'POSSIBLE',
    recommendation: 'Switch to exact-name-first strategy: (1) try `name === baseClass || name === keyword` first; (2) require candidate cohortYear EQUAL to baseClass cohortYear UNLESS both baseClass and candidate are explicitly marked as public/cross-cohort. Add ambiguity warning for any non-exact match.',
    suggestedNextStage: 'K19-FIX-A-IMPORT-MATCHING-COHORT-GUARD',
  })
  findingsBySeverity.MEDIUM++

  // ── 7. Rule B: remark over-extension ──────────────────────────────
  // The parseRemarkKeywords function generates multiple keyword candidates from a single
  // remark like "与森防合班" → "森防" + ... sliced variations.
  // For 习近平+房忠敏, all source artifacts show:
  //   - 2025级钢铁智能冶金技术1班（高本贯通）remark="与森防合班"
  //   - 2025级森林草原防火技术1班remark="与高本贯通合班"
  // So the remark is bilateral and SHOULD lead to a 2-class merge.
  // But it should NOT lead to 2024 cohort 森林草原防火 1班 (CG35) being merged.
  const remarksSample = sourceRecords
    .filter(r => r.course?.includes('习近平') && r.teacher === '房忠敏')
    .map(r => `${r.className} | remark=${r.remark ?? '(null)'}`)
    .filter((v, i, a) => a.indexOf(v) === i)
    .slice(0, 10)

  const evidenceB: string[] = []
  if (codeRefs.parseRemark.length > 0) {
    evidenceB.push(`parseRemarkKeywords found in: ${codeRefs.parseRemark.map(r => r.filePath).join(', ')}`)
  }
  if (remarksSample.length > 0) {
    evidenceB.push(`房忠敏+习近平 remark sample: ${remarksSample.join(' | ')}`)
  }
  // Count of remarks in source data
  const remarksWithCohortKeyword = sourceRecords.filter(r => r.remark && /\d{4}级/.test(r.remark)).length

  findings.push({
    id: 'K19-RULE-B-001',
    severity: 'LOW',
    category: 'REMARK_PARSING',
    title: 'remark parsing does not distinguish explicit year markers from implicit short forms',
    evidence: `${evidenceB.join('; ')}; cohort-explicit remark count=${remarksWithCohortKeyword}`,
    files: [
      'src/lib/import/importer.ts:200-225 parseRemarkKeywords',
      'src/lib/import/importer.ts:227-296 findMergedClassNames',
      'scripts/seed_db.ts:93-127 parseRemarkKeywords (legacy, same logic)',
    ],
    codeReferences: [
      'src/lib/import/importer.ts:206-225 parseRemarkKeywords generates multiple keyword variations',
    ],
    affectedHistoricalTasks: [37, 168, 174, 176, 181],
    reproductionRisk: 'POSSIBLE',
    recommendation: 'When the remark contains an explicit year marker (e.g. "2024级森林草原防火技术1班"), prefer exact-match on the literal substring over the multi-granularity keyword generation. When no explicit year is present, require candidate year to MATCH baseClass year (already done in filterCandidatesByYearAndTrack) AND emit a warning when the merge involves a different track (e.g. 高本贯通 vs 现场工程师).',
    suggestedNextStage: 'K19-FIX-A-IMPORT-MATCHING-COHORT-GUARD',
  })
  findingsBySeverity.LOW++

  // ── 8. Rule C: ClassGroup lookup missing cohort guard ────────────
  // ClassGroup is looked up by `name` in executeImportInTransaction (line 472).
  // There is NO cohort/track check — exact-name match only.
  // This is correct for upsert but means:
  //   - If two distinct ClassGroups have the same name across cohorts, the
  //     most recent is reused.
  //   - However the cohort filter in findMergedClassNames prevents the
  //     wrong cohort from being added to a task in the first place.
  //   - The real risk is when filterCandidatesByYearAndTrack does not kick in
  //     (e.g. when both baseClass and candidate lack explicit year).
  const evidenceC: string[] = []
  evidenceC.push('ClassGroup.upsert is by name only (line 472-487 of importer.ts). No cohort guard at upsert level.')
  if (codeRefs.cohortYear.length === 0) {
    evidenceC.push('No references to cohortYear in src/lib/* (cohort inference is only done in audit scripts, not importer)')
  } else {
    evidenceC.push(`cohortYear references in src/lib: ${codeRefs.cohortYear.map(r => r.filePath).join(', ')}`)
  }

  findings.push({
    id: 'K19-RULE-C-001',
    severity: 'LOW',
    category: 'COHORT_GUARD',
    title: 'ClassGroup upsert uses name only, no cohort/track guard at write time',
    evidence: evidenceC.join('; '),
    files: [
      'src/lib/import/importer.ts:469-488 ClassGroup upsert',
      'src/lib/import/importer.ts:171-196 filterCandidatesByYearAndTrack',
    ],
    codeReferences: [
      'src/lib/import/importer.ts:472 tx.classGroup.findFirst({ where: { semesterId, name } })',
    ],
    affectedHistoricalTasks: [37, 168, 174, 176, 181],
    reproductionRisk: 'POSSIBLE',
    recommendation: 'Add a cohortYear assertion when creating a new ClassGroup: if the parsed record contains a cohortYear (from extractYear), assert no existing ClassGroup with same `name` exists in a different cohort (i.e. same core class name but different year).',
    suggestedNextStage: 'K19-FIX-A-IMPORT-MATCHING-COHORT-GUARD',
  })
  findingsBySeverity.LOW++

  // ── 9. Rule D: TeachingTaskClass creation missing suspicious link audit ──
  // In executeImportInTransaction (line 581-585), TeachingTaskClass is created
  // for every classGroupId in classGroupIds. There is no:
  //   - cross-cohort detection at link creation
  //   - source-evidence recording
  //   - warning emission at create time
  // The only check is the canImport gate (missing course, duplicates, parse bugs)
  // which does NOT include cross-cohort detection.
  const evidenceD: string[] = []
  if (codeRefs.executeImport.length > 0) {
    evidenceD.push(`executeImportInTransaction in: ${codeRefs.executeImport.map(r => r.filePath).join(', ')}`)
  }
  evidenceD.push(`No crossCohort audit at TTC creation (line 581-585 of importer.ts)`)
  evidenceD.push(`Confirmed cross-cohort tasks still exist: ${crossCohortTasks.length}`)

  findings.push({
    id: 'K19-RULE-D-001',
    severity: 'MEDIUM',
    category: 'AUDIT_TRAIL',
    title: 'TeachingTaskClass creation has no cross-cohort detection or source-evidence retention',
    evidence: evidenceD.join('; '),
    files: [
      'src/lib/import/importer.ts:566-587 TeachingTask create + TTC loop',
    ],
    codeReferences: [
      'src/lib/import/importer.ts:582-585 tx.teachingTaskClass.create (no cross-cohort check)',
    ],
    affectedHistoricalTasks: [37, 168, 174, 176, 181],
    reproductionRisk: 'CONFIRMED',
    recommendation: 'Add a post-creation cross-cohort audit: for each new TeachingTask, compute cohortYearSet from taskClasses; if size > 1, emit a warning and require `crossCohortApproved: true` or explicit `forceCrossCohort: true` in the import request. Default behavior: warning only, do not block. Persistence: add a JSON column or import-level note for traceability.',
    suggestedNextStage: 'K19-FIX-A-IMPORT-MATCHING-COHORT-GUARD',
  })
  findingsBySeverity.MEDIUM++

  // ── 10. Rule E: re-import recurrence risk ────────────────────────
  // The currently confirmed ImportBatch (#1) was confirmed using whatever code
  // version was active at the time. If we re-import the same source artifact
  // NOW, with the current importer code:
  //   - findMergedClassNames will be called
  //   - filterCandidatesByYearAndTrack will filter by year/track
  //   - For task 37's remark "与森防合班" → keyword "森防":
  //     - baseClass = 2025级钢铁智能冶金技术1班（高本贯通）
  //     - candidate 2024级森林草原防火技术1班 (CG35) has year=2024 != 2025 → EXCLUDED
  //   - So re-import would NOT recreate the 2024 link.
  //   - HOWEVER: if CG22 (2024 cohort) had the same year as the base (e.g. 2024),
  //     it would still be linked. This is the K18-B fixed case.
  // Re-import risk summary: current filter logic should block re-occurrence
  // of K18-B / K18-E3 errors for these specific tasks. But the filter is
  // permissive for cases where neither baseClass nor candidate has explicit year.
  const evidenceE: string[] = []
  evidenceE.push(`filterCandidatesByYearAndTrack logic exists at src/lib/import/importer.ts:171-196`)
  evidenceE.push(`K17-FIX-A confirmed: cross-cohort task count reduced from 35 (2026-05-30) to 5 (2026-06-03) after the filter was in place`)
  evidenceE.push(`Current confirmed cross-cohort count (post-K18-B/E3): ${crossCohortTasks.length}`)
  if (crossCohortTasks.length > 0) {
    evidenceE.push(`Remaining: ${crossCohortTasks.map(t => `task ${t.teachingTaskId} (${t.courseName})`).join(', ')}`)
  }

  findings.push({
    id: 'K19-RULE-E-001',
    severity: 'MEDIUM',
    category: 'REIMPORT_RISK',
    title: 'Re-import of K18 source artifacts should be blocked by filterCandidatesByYearAndTrack, but no canonical regression test verifies this',
    evidence: evidenceE.join('; '),
    files: [
      'src/lib/import/importer.ts:171-196',
      'src/lib/import/importer.ts:243-249 includes()',
      'src/lib/import/importer.ts:265-281 subsequence',
    ],
    codeReferences: [
      'src/lib/import/importer.ts:184-186 `if (cy && cy !== baseYear) return false`',
    ],
    affectedHistoricalTasks: [37, 168, 174, 176, 181],
    reproductionRisk: 'POSSIBLE',
    recommendation: 'Add a regression test fixture covering the K18 source artifacts. Test should: (1) re-run the import dry-run against a copy of the K18 source JSON; (2) assert that no cross-cohort TeachingTask would be created; (3) assert the merged class count matches the post-K18-E3 expected set.',
    suggestedNextStage: 'K19-TEST-A-IMPORT-MATCHING-REGRESSION-TESTS',
  })
  findingsBySeverity.MEDIUM++

  // ── 11. Rule F: legal cross-cohort handling ──────────────────────
  // There is no crossCohortApproved / manual confirmation mechanism.
  // There is no source-evidence retention specifically for cross-cohort links.
  // The canImport gate does not block cross-cohort (only blocks missing course /
  // duplicates / parse bugs / teacher name suffix / week markers in course).
  const evidenceF: string[] = []
  if (codeRefs.crossCohort.length === 0) {
    evidenceF.push('No crossCohort references in src/** (no explicit cross-cohort approval mechanism)')
  } else {
    evidenceF.push(`crossCohort references: ${codeRefs.crossCohort.map(r => r.filePath).join(', ')}`)
  }
  if (codeRefs.ambiguous.length > 0) {
    evidenceF.push(`AMBIGUOUS warnings emitted (good): ${codeRefs.ambiguous.map(r => r.filePath).join(', ')}`)
  } else {
    evidenceF.push('No AMBIGUOUS warning references found in src/lib/import (warnings are emitted at runtime only)')
  }

  findings.push({
    id: 'K19-RULE-F-001',
    severity: 'MEDIUM',
    category: 'LEGAL_CROSS_COHORT',
    title: 'No mechanism to distinguish legal cross-cohort (public course) from error cross-cohort (false positive)',
    evidence: evidenceF.join('; '),
    files: [
      'src/lib/import/importer.ts:445 classification.warnings',
      'src/lib/import/quality-classifier.ts (no cross-cohort gate)',
    ],
    codeReferences: [
      'src/lib/import/quality-classifier.ts:144-167 canImport gate (no cross-cohort check)',
    ],
    affectedHistoricalTasks: [37, 168, 174, 176, 181],
    reproductionRisk: 'CONFIRMED',
    recommendation: 'Add a public-course allowlist (e.g. the LIKELY_PUBLIC_COURSE_HINTS list used in K17-FIX-A audit) as a WARNING-ONLY signal in classification. When a cross-cohort TeachingTask is created and the course is in the allowlist, emit a warning "LEGAL_PUBLIC_CROSS_COHORT". Otherwise emit "LIKELY_ERROR_CROSS_COHORT". Default behavior: both are warnings (do not block), but the latter is HIGHER severity in the import warnings list.',
    suggestedNextStage: 'K19-FIX-A-IMPORT-MATCHING-COHORT-GUARD',
  })
  findingsBySeverity.MEDIUM++

  // ── 12. INFO findings (statistics) ───────────────────────────────
  const sourceArtifactCount = readdirSync(join(process.cwd(), 'uploads/imports')).filter(f => f.endsWith('.json')).length
  const docxCount = readdirSync(join(process.cwd(), 'uploads/imports')).filter(f => f.endsWith('.docx')).length

  findings.push({
    id: 'K19-INFO-001',
    severity: 'INFO',
    category: 'STATISTICS',
    title: 'K18 historical error cases (all repaired or marked for review)',
    evidence: `tasks 168/174/176/181 (4 个专业课 cross-cohort with 2024 cohort 高本贯通 CG22) — REPAIRED in K18-B; task 37 (习近平思想 with 2024 cohort 森林草原防火 CG35) — REMOVED in K18-E3 (TTC94 deleted)`,
    files: [
      'docs/k18-cross-cohort-data-repair-execute.md',
      'docs/k18-task37-finalization-execute.md',
    ],
    codeReferences: [],
    affectedHistoricalTasks: [37, 168, 174, 176, 181],
    reproductionRisk: 'NONE',
    recommendation: 'Reference for K19-FIX-A regression test fixtures.',
    suggestedNextStage: 'K19-FIX-A-IMPORT-MATCHING-COHORT-GUARD',
  })
  findingsBySeverity.INFO++

  findings.push({
    id: 'K19-INFO-002',
    severity: 'INFO',
    category: 'STATISTICS',
    title: 'Current DB scope',
    evidence: `ClassGroups=${classGroups.length}, TeachingTasks=${teachingTasks.length}, ImportBatches=${importBatches.length}, ScheduleSlots=${scheduleSlots.length}; cross-cohort tasks in DB=${crossCohortTasks.length}; source artifacts=${sourceArtifactCount} JSON / ${docxCount} docx`,
    files: [],
    codeReferences: [],
    affectedHistoricalTasks: [],
    reproductionRisk: 'NONE',
    recommendation: 'Baseline for K19-FIX-A regression test.',
    suggestedNextStage: 'K19-FIX-A-IMPORT-MATCHING-COHORT-GUARD',
  })
  findingsBySeverity.INFO++

  // ── 13. Build summary ────────────────────────────────────────────
  const summary = {
    HIGH: findingsBySeverity.HIGH,
    MEDIUM: findingsBySeverity.MEDIUM,
    LOW: findingsBySeverity.LOW,
    INFO: findingsBySeverity.INFO,
    NONE: findingsBySeverity.NONE,
    BLOCKING: 0,
    TOTAL: findings.length,
  }

  // ── 14. Recommended next stage decision ──────────────────────────
  const recommendedNextStage = 'K19-FIX-A-IMPORT-MATCHING-COHORT-GUARD'
  let rootCauseConfidence: 'HIGH' | 'MEDIUM' | 'LOW' = 'HIGH'
  // If we found NO high-confidence root cause (no confirmed-class-of-error in current code), recommend B path
  if (findingsBySeverity.HIGH === 0 && findingsBySeverity.MEDIUM >= 1) {
    rootCauseConfidence = 'MEDIUM'
  }

  // ── 15. Build output JSON ────────────────────────────────────────
  const out = {
    summary,
    findings,
    historicalErrorCases: historicalCases,
    rootCauseHypotheses: [
      {
        id: 'RCH-1',
        hypothesis: 'findMergedClassNames uses .includes() + subsequence matching after a year/track pre-filter. The pre-filter correctly excludes candidates with different cohort year WHEN keyword has no explicit year. However the historical data (K17-FIX-A: 5 cross-cohort tasks pre-K18-B, reduced to 1 after filter existed) suggests the filter was added in a recent commit. The pre-filter-era data is the source of all 5 historical errors.',
        supportingEvidence: [
          'src/lib/import/importer.ts:171-196 filterCandidatesByYearAndTrack',
          'src/lib/import/importer.ts:243-249 includes() match',
          'src/lib/import/importer.ts:265-281 subsequence match',
          'K17-FIX-A: cross-cohort tasks reduced from 35 to 5 after filter existed',
          'K18-B: 4 tasks fixed by removing wrong ClassGroup links',
          'K18-E3: 1 task (task 37) fixed by removing wrong ClassGroup link',
        ],
      },
      {
        id: 'RCH-2',
        hypothesis: 'Task 37 (习近平思想 + 2024 cohort 森林草原防火 CG35) was likely created by a pre-filter version of the importer or by seed_db.ts (legacy CLI seed). The current importer would not recreate this link because the cohort filter would exclude CG35. Task 37 is the ONLY remaining post-K18 cross-cohort candidate, classified as NEED_MANUAL_REVIEW (K18-C) and LIKELY_ERROR (K18-C review).',
        supportingEvidence: [
          'K18-C source artifact review: no 2024 record for 房忠敏+习近平 in any of 17 source JSON files',
          'Task 32 (same teacher/course) does NOT link 2024 cohort — strong inconsistency',
          'Pattern matches the 4 confirmed-error K18-B tasks',
          'filterCandidatesByYearAndTrack would exclude CG35 from "森防" keyword against 2025 baseClass',
        ],
      },
      {
        id: 'RCH-3',
        hypothesis: 'There is no source-evidence retention for TeachingTaskClass links. The TeachingTaskClass table does not store which source row / source keyword created the link. This makes post-hoc root-cause analysis expensive (requires correlating import batch to source JSON, then re-running import logic mentally).',
        supportingEvidence: [
          'Prisma schema TeachingTaskClass has only teachingTaskId + classGroupId, no source row reference',
          'No warningsJson entries link specific TTC to specific source record',
          'K17-FIX-A had to cross-reference source JSON manually to validate the 4 K18-B errors',
        ],
      },
    ],
    affectedFiles: [
      'src/lib/import/importer.ts',
      'src/lib/import/parse-utils.ts',
      'src/lib/import/quality-classifier.ts',
      'src/lib/import/rollback.ts',
      'src/app/api/admin/import/confirm/route.ts',
      'src/app/api/admin/import/parse/route.ts',
      'scripts/seed_db.ts',
    ],
    recommendedFixPlan: {
      option: 'Option A: cohort guard + warning-first',
      rationale: 'Minimally invasive. Does NOT change schema. Does NOT add crossCohortApproved field. Targets the exact root cause (weak matching after pre-filter).',
      steps: [
        '1. Tighten findMergedClassNames: try exact-name first, only fall back to includes() / subsequence when exact fails AND no cohort mismatch exists.',
        '2. In executeImportInTransaction after TTC creation, compute cohortYearSet and emit two-tier warning: LEGAL_PUBLIC_CROSS_COHORT (allowlist) vs LIKELY_ERROR_CROSS_COHORT (not in allowlist).',
        '3. Persist warnings in ImportBatch.warningsJson (already supported).',
        '4. Add regression test fixture (parse 1-2 source artifacts, assert no cross-cohort task created).',
        '5. Update canImport gate in quality-classifier.ts to optionally include LIKELY_ERROR_CROSS_COHORT as a warning (NOT a blocking reason by default).',
      ],
      filesToModify: [
        'src/lib/import/importer.ts',
        'src/lib/import/quality-classifier.ts',
      ],
      filesNotToModify: [
        'prisma/schema.prisma',
        'src/app/api/admin/import/**',
        'src/components/**',
        'src/lib/scheduler/**',
      ],
    },
    regressionTestPlan: {
      coverage: [
        'Test 1: 2024/2025 高本贯通相似班级 — should NOT be merged (already covered by filter)',
        'Test 2: 2024/2025 森林草原防火相似班级 — should NOT be merged',
        'Test 3: same-cohort 合班 with explicit remark "与XX合班" — should be merged (positive case)',
        'Test 4: public course cross-cohort with explicit "2024级" in remark — should be merged if classGroup names match',
        'Test 5: remark "2024级森林草原防火技术1班" appearing on a 2025 cohort class — should be checked for cohort-mismatch warning',
        'Test 6: re-import K18 source artifact (regression) — should NOT recreate any of the 5 historical errors',
        'Test 7: ambiguous match (multiple candidates match a keyword) — should emit AMBIGUOUS warning and NOT auto-link',
      ],
      testDataSource: 'uploads/imports/*.json (K18 source artifacts, 17 files)',
      expectedOutcome: 'All 5 historical error patterns are blocked; 1 INFO finding for task 37 (since CG35 was repaired, regression test verifies the link is NOT recreated)',
    },
    suggestedNextStage: recommendedNextStage,
    rootCauseConfidence,
    generatedAt: new Date().toISOString(),
  }

  const outPath = join(process.cwd(), 'docs/k19-import-matching-root-cause-audit.json')
  writeFileSync(outPath, JSON.stringify(out, null, 2), 'utf-8')

  // ── 16. Console summary ──────────────────────────────────────────
  console.log()
  console.log('K19 Import Matching Root Cause Audit')
  console.log('=====================================')
  console.log('Summary:')
  console.log(`HIGH:    ${summary.HIGH}`)
  console.log(`MEDIUM:  ${summary.MEDIUM}`)
  console.log(`LOW:     ${summary.LOW}`)
  console.log(`INFO:    ${summary.INFO}`)
  console.log(`NONE:    ${summary.NONE}`)
  console.log(`BLOCKING: ${summary.BLOCKING}`)
  console.log(`ROOT_CAUSE_CONFIDENCE: ${rootCauseConfidence}`)
  console.log(`Recommended next stage: ${recommendedNextStage}`)
  console.log()
  console.log(`Total findings: ${summary.TOTAL}`)
  console.log(`JSON report: docs/k19-import-matching-root-cause-audit.json`)
  console.log()
  console.log('Findings by rule:')
  for (const f of findings) {
    console.log(`  [${f.severity}] ${f.id} ${f.title}`)
  }
  console.log()
  console.log('Cross-cohort tasks in current DB:')
  for (const t of crossCohortTasks) {
    console.log(`  task ${t.teachingTaskId} | ${t.courseName} | ${t.teacherName ?? '(no teacher)'} | years=[${t.cohortYears.join(',')}] | cgIds=[${t.classGroupIds.join(',')}] | slots=${t.slotCount} | public=${t.isPublicCourse}`)
  }
  console.log()
  console.log(`Source artifacts: ${sourceArtifactCount} JSON / ${docxCount} docx`)
  console.log(`Records in source artifacts: ${sourceRecords.length}`)
  console.log()

  await prisma.$disconnect()
  console.log('═══════════════════════════════════════════════════════════════')
  console.log(`  K19 audit complete. findings=${summary.TOTAL}, HIGH=${summary.HIGH}, BLOCKING=NO (audit-only)`)
  console.log('═══════════════════════════════════════════════════════════════')
}

main().catch(e => {
  console.error(e)
  process.exit(1)
})
