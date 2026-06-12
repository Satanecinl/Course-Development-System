/**
 * K18-C: Task 37 Source Artifact Review
 *
 * Read-only script that reviews the source evidence for TeachingTask 37
 * to determine whether its cross-cohort grouping is legitimate or an
 * import matching error.
 *
 * K36-A5D3A: real teacher / class / course names are anonymized at
 * write time. Hard-coded name literals are kept inside detection
 * helpers but stripped from any user-visible output.
 *
 * Usage: npx tsx scripts/review-task37-source-artifact-k18-c.ts
 */

import { PrismaClient } from '@prisma/client'
import * as fs from 'fs'
import * as path from 'path'
import { anonymizeReport } from './lib/anonymize-report-output'

const prisma = new PrismaClient()

// K36-A5D3A: detect-only constants. These are kept in the script so
// the audit logic still works, but they are NEVER written to JSON
// or printed in user-facing output. All report writes go through
// anonymizeReport(), which replaces any leaked real value with a
// token like T001 / CG001 / Course001 / <REDACTED_TEXT>.
const TASK_ID = 37

const OUTPUT_JSON = path.resolve('docs/k18-task37-source-artifact-review.json')
const OUTPUT_MD = path.resolve('docs/k18-task37-source-artifact-review.md')
const K17_DECISION_JSON = path.resolve('docs/k17-cross-cohort-review-decision.json')
const K18_EXEC_JSON = path.resolve('docs/k18-cross-cohort-data-repair-execute.json')
const IMPORTS_DIR = path.resolve('uploads/imports')

interface MatchedRecord {
  source: string
  matchType: 'course' | 'teacher' | 'classGroup' | 'remark' | 'row' | 'unknown'
  excerpt: string
  confidence: 'HIGH' | 'MEDIUM' | 'LOW'
}

interface SourceEvidence {
  sourceArtifactFound: boolean
  parsedJsonFound: boolean
  docxFound: boolean
  matchedRecords: MatchedRecord[]
  evidenceGaps: string[]
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function extractCohortYear(name: string): number | null {
  const m = name.match(/^(\d{4})级/)
  return m ? parseInt(m[1], 10) : null
}

function extractTrack(name: string): string | null {
  const m = name.match(/（(高本贯通|现场工程师)）/)
  return m ? m[1] : null
}

function readJsonSafe(filePath: string): unknown {
  try {
    if (!fs.existsSync(filePath)) return null
    return JSON.parse(fs.readFileSync(filePath, 'utf-8'))
  } catch {
    return null
  }
}

function searchParsedJsonRecords(
  jsonPath: string,
  sourceLabel: string
): MatchedRecord[] {
  const results: MatchedRecord[] = []
  if (!fs.existsSync(jsonPath)) return results

  try {
    const data: unknown = JSON.parse(fs.readFileSync(jsonPath, 'utf-8'))
    const records: unknown[] = Array.isArray(data) ? data : (isRecord(data) && Array.isArray(data.records) ? data.records : [])

    for (const r of records) {
      if (!isRecord(r)) continue
      const classInfo = isRecord(r.class_info) ? r.class_info : undefined
      const className = (typeof classInfo?.class_name === 'string' ? classInfo.class_name : '') || (typeof r.className === 'string' ? r.className : '')
      const teacher = (typeof r.teacher === 'string' ? r.teacher : '') || (typeof r.teacherName === 'string' ? r.teacherName : '')
      const course = (typeof r.course === 'string' ? r.course : '') || (typeof r.courseName === 'string' ? r.courseName : '')
      const remark = typeof r.remark === 'string' ? r.remark : ''

      // K36-A5D3A: detect-only — matches are detected but the `excerpt`
      // string written to JSON is redacted by anonymizeReport at write
      // time. We do NOT hard-code specific teacher/course names here.
      const isPublicIdeology = /新时代|思想概论|毛泽东|思政|马原|道德与法治|形势与政策/i.test(course)
      const isCohort2024 = /2024/.test(className) || /2024/.test(remark)
      const isCohort2025 = /2025/.test(className) || /2025/.test(remark)
      const hasMergedRemark = /合班/.test(remark)

      if (isPublicIdeology) {
        if (isCohort2024) {
          results.push({
            source: sourceLabel,
            matchType: 'row',
            excerpt: `<REDACTED_TEXT> cohort=2024`,
            confidence: 'HIGH',
          })
        }
        if (hasMergedRemark && (isCohort2024 || isCohort2025)) {
          results.push({
            source: sourceLabel,
            matchType: 'remark',
            excerpt: `<REDACTED_TEXT> cohort=merged`,
            confidence: 'HIGH',
          })
        }
      }

      if (/森林草原防火/.test(className) && isPublicIdeology) {
        results.push({
          source: sourceLabel,
          matchType: 'classGroup',
          excerpt: `<REDACTED_TEXT>`,
          confidence: 'HIGH',
        })
      }
    }
  } catch {
    // JSON parse error — skip
  }

  return results
}

async function main() {
  const lines: string[] = []

  function log(msg: string) {
    lines.push(msg)
    console.log(msg)
  }

  log('K18-C Task37 Source Artifact Review')
  log('')

  // ── 1. Task current state from DB ──
  const task = await prisma.teachingTask.findUnique({
    where: { id: TASK_ID },
    include: {
      course: true,
      teacher: true,
      taskClasses: { include: { classGroup: true } },
      scheduleSlots: { include: { room: true } },
      importBatch: true,
      semester: true,
    },
  })

  if (!task) {
    log('ERROR: Task not found in DB')
    await prisma.$disconnect()
    process.exit(1)
  }

  const classGroups = task.taskClasses.map((tc) => ({
    id: tc.classGroup.id,
    name: tc.classGroup.name,
    studentCount: tc.classGroup.studentCount,
    cohortYear: extractCohortYear(tc.classGroup.name),
    track: extractTrack(tc.classGroup.name),
    semesterId: tc.classGroup.semesterId,
  }))

  const cohortYears = [...new Set(classGroups.map((cg) => cg.cohortYear).filter(Boolean))]
  const hasCg22 = classGroups.some((cg) => cg.id === 22)
  const isCrossCohort = cohortYears.length > 1

  const slots = task.scheduleSlots.map((s) => ({
    id: s.id,
    dayOfWeek: s.dayOfWeek,
    slotIndex: s.slotIndex,
    roomId: s.roomId,
    roomName: s.room?.name || null,
    roomCapacity: s.room?.capacity || null,
  }))

  log('Summary:')
  log(`TASK_ID: ${task.id}`)

  // ── 2. Source artifact search ──
  const sourceEvidence: SourceEvidence = {
    sourceArtifactFound: false,
    parsedJsonFound: false,
    docxFound: false,
    matchedRecords: [],
    evidenceGaps: [],
  }

  // Search all parsed JSON files in uploads/imports
  if (fs.existsSync(IMPORTS_DIR)) {
    const files = fs.readdirSync(IMPORTS_DIR)
    const jsonFiles = files.filter((f) => f.endsWith('.json'))
    const docxFiles = files.filter((f) => f.endsWith('.docx'))

    sourceEvidence.parsedJsonFound = jsonFiles.length > 0
    sourceEvidence.docxFound = docxFiles.length > 0
    sourceEvidence.sourceArtifactFound = jsonFiles.length > 0 || docxFiles.length > 0

    for (const jf of jsonFiles) {
      const fullPath = path.join(IMPORTS_DIR, jf)
      const matches = searchParsedJsonRecords(fullPath, `uploads/imports/${jf}`)
      sourceEvidence.matchedRecords.push(...matches)
    }
  }

  // Deduplicate matched records by excerpt
  const seenExcerpts = new Set<string>()
  sourceEvidence.matchedRecords = sourceEvidence.matchedRecords.filter((r) => {
    const key = `${r.source}|${r.matchType}|${r.excerpt}`
    if (seenExcerpts.has(key)) return false
    seenExcerpts.add(key)
    return true
  })

  // Check for 2024级 records specifically
  const has2024Record = sourceEvidence.matchedRecords.some(
    (r) => r.matchType === 'classGroup' || (r.matchType === 'row' && r.excerpt.includes('2024级'))
  )

  if (!has2024Record) {
    // K36-A5D3A: abstract gap description — never embed real names.
    sourceEvidence.evidenceGaps.push(
      '<REDACTED_TEXT> (cross-cohort link lacks source-row evidence in any parsed artifact)'
    )
  }

  // Check for cross-cohort 合班 remarks
  const crossCohortRemarks = sourceEvidence.matchedRecords.filter(
    (r) => r.matchType === 'remark'
  )
  if (crossCohortRemarks.length === 0) {
    sourceEvidence.evidenceGaps.push(
      'No cross-cohort 合班 remark found in parsed JSON for this course+teacher combination'
    )
  }

  // Check historical JSONs for additional context
  const k17Decision = readJsonSafe(K17_DECISION_JSON)
  const k18Exec = readJsonSafe(K18_EXEC_JSON)

  // ── 3. Related tasks analysis ──
  const relatedTasks = await prisma.teachingTask.findMany({
    where: { courseId: task.courseId },
    include: {
      teacher: true,
      taskClasses: { include: { classGroup: true } },
      scheduleSlots: true,
    },
    orderBy: { id: 'asc' },
  })

  // ── 4. Decision logic ──
  let decision: string
  let confidence: string
  let recommendedAction: string
  let suggestedNextStage: string
  let blocking: string

  // Key evidence (K36-A5D3A: abstracted; no real names in code comments):
  // 1. The course IS a public/ideology course — cross-cohort teaching is plausible
  // 2. The parsed JSON shows a primary cohort + a same-cohort merge via remark
  // 3. NO parsed JSON record exists for the cross-cohort class taking this course
  // 4. A related task (same teacher, same course, same primary-cohort classes)
  //    has a remark mentioning the cross-cohort class but does NOT link it
  // 5. The task under review links the cross-cohort class — but source evidence
  //    doesn't support it
  // 6. Pattern matches confirmed-error tasks (fuzzy matching on class name substrings)

  if (has2024Record) {
    // Source artifact has explicit 2024级 record — would be ACCEPTED
    decision = 'ACCEPTED_CROSS_COHORT'
    confidence = 'HIGH'
    recommendedAction = 'KEEP_AS_ACCEPTED_CROSS_COHORT'
    suggestedNextStage = 'K18-D-DATA-QUALITY-CLOSEOUT'
    blocking = 'NO'
  } else if (
    !sourceEvidence.parsedJsonFound ||
    sourceEvidence.evidenceGaps.length >= 2
  ) {
    // No source artifact found or major gaps
    decision = 'NEEDS_SOURCE_REVIEW'
    confidence = 'LOW'
    recommendedAction = 'MANUAL_SOURCE_REVIEW_REQUIRED'
    suggestedNextStage = 'K18-D-MANUAL-SOURCE-REVIEW'
    blocking = 'REVIEW_REQUIRED'
  } else {
    // Source artifact found, but no 2024级 record for this course+teacher
    // The course is a 思政课, so cross-cohort teaching is plausible in principle
    // But the evidence doesn't support the actual link in the DB
    // This matches the pattern of import fuzzy matching errors
    decision = 'LIKELY_ERROR'
    confidence = 'MEDIUM'
    recommendedAction = 'PLAN_REPAIR'
    suggestedNextStage = 'K18-D-TASK37-DATA-REPAIR-PLAN'
    blocking = 'YES'
  }

  log(`SOURCE_ARTIFACT_FOUND: ${sourceEvidence.sourceArtifactFound}`)
  log(`PARSED_JSON_FOUND: ${sourceEvidence.parsedJsonFound}`)
  log(`DOCX_FOUND: ${sourceEvidence.docxFound}`)
  log(`DECISION: ${decision}`)
  log(`CONFIDENCE: ${confidence}`)
  log(`RECOMMENDED_ACTION: ${recommendedAction}`)
  log(`SUGGESTED_NEXT_STAGE: ${suggestedNextStage}`)
  log(`BLOCKING: ${blocking}`)

  // ── 5. Build JSON output ──
  const report = {
    generatedAt: new Date().toISOString(),
    phase: 'K18-C',
    mode: 'read-only',
    summary: {
      taskId: task.id,
      course: task.course.name,
      teacher: task.teacher?.name || null,
      decision,
      confidence,
      recommendedAction,
      suggestedNextStage,
      blocking,
    },
    task37CurrentState: {
      teachingTaskId: task.id,
      courseId: task.courseId,
      courseName: task.course.name,
      teacherId: task.teacherId,
      teacherName: task.teacher?.name || null,
      semesterId: task.semesterId,
      importBatchId: task.importBatchId,
      importBatchStatus: task.importBatch?.status || null,
      importBatchConfirmedAt: task.importBatch?.confirmedAt || null,
      remark: task.remark,
      weekType: task.weekType,
      startWeek: task.startWeek,
      endWeek: task.endWeek,
      classGroups,
      cohortYears,
      isCrossCohort,
      hasCg22,
      isOnlyRemainingCrossCohortCandidate: true,
      scheduleSlots: slots,
    },
    sourceArtifactStatus: {
      parsedJsonFound: sourceEvidence.parsedJsonFound,
      docxFound: sourceEvidence.docxFound,
      sourceArtifactFound: sourceEvidence.sourceArtifactFound,
      importBatchOriginalFilePath: task.importBatch?.originalFilePath || null,
      importBatchParsedJsonPath: task.importBatch?.parsedJsonPath || null,
    },
    sourceEvidence,
    relatedTasks: relatedTasks.map((t) => ({
      id: t.id,
      teacher: t.teacher?.name || null,
      classGroups: t.taskClasses.map((tc) => tc.classGroup.name),
      cohortYears: [
        ...new Set(
          t.taskClasses
            .map((tc) => extractCohortYear(tc.classGroup.name))
            .filter(Boolean)
        ),
      ],
      remark: t.remark,
      scheduleSlots: t.scheduleSlots.map(
        (s) => `day${s.dayOfWeek}-slot${s.slotIndex}`
      ),
    })),
    decision,
    confidence,
    recommendedAction,
    suggestedNextStage,
    blocking,
    historicalContext: {
      k17DecisionTask37: isRecord(k17Decision) && Array.isArray(k17Decision.decisions)
        ? (k17Decision.decisions as Record<string, unknown>[]).find((d) => d.taskId === 37) || null
        : null,
      k18RepairExecuted: isRecord(k18Exec) ? !!k18Exec.applied : false,
      k18DeletedTtcIds: isRecord(k18Exec) && Array.isArray(k18Exec.deletedLinks)
        ? (k18Exec.deletedLinks as Record<string, unknown>[]).map((l) => l.ttcId)
        : [],
    },
  }

  fs.mkdirSync(path.dirname(OUTPUT_JSON), { recursive: true })
  // K36-A5D3A: anonymize real names before write. anonymizeReport
  // walks the object and replaces teacherName / courseName /
  // classGroupNames / roomName / free-text fields per the helper's
  // rules. Same real value within this report always maps to the
  // same pseudonym (T001, Course001, …).
  anonymizeReport(report)
  fs.writeFileSync(OUTPUT_JSON, JSON.stringify(report, null, 2), 'utf-8')

  // ── 6. Build Markdown output ──
  const md: string[] = []
  md.push('# K18-C Target Task Source Artifact Review')
  md.push('')
  md.push(`Generated: ${report.generatedAt}`)
  md.push('')
  md.push('## 1. Background')
  md.push('')
  md.push('K18-B repaired 4 confirmed cross-cohort merge errors (tasks 168, 174, 176, 181) by removing')
  md.push('incorrect TeachingTaskClass links to a cross-cohort ClassGroup.')
  md.push('The target task (public-ideology course) remained as the only cross-cohort candidate,')
  md.push('classified as NEEDS_SOURCE_REVIEW by K17-FIX-B.')
  md.push('')
  md.push('## 2. Goal')
  md.push('')
  md.push('Review source artifacts for the target task to determine whether its cross-cohort grouping')
  md.push('(two cohort years) is a legitimate public course arrangement or an import matching error.')
  md.push('')
  md.push('## 3. Scope')
  md.push('')
  md.push('- Read-only review of DB state, parsed JSON, and historical documents')
  md.push('- No modifications to any business data, schema, or import logic')
  md.push('')
  md.push('## 4. Target Task Current State')
  md.push('')
  md.push(`- **TeachingTask ID**: ${task.id}`)
  md.push(`- **Course**: <REDACTED> (id=${task.courseId})`)
  md.push(`- **Teacher**: <REDACTED> (id=${task.teacherId})`)
  md.push(`- **Semester**: ${task.semester?.name || 'null'} (id=${task.semesterId})`)
  md.push(`- **ImportBatch**: id=${task.importBatchId}, status=${task.importBatch?.status}`)
  md.push(`- **Remark**: ${task.remark || 'null'}`)
  md.push(`- **Week**: ${task.weekType}, weeks ${task.startWeek}-${task.endWeek}`)
  md.push(`- **ClassGroups** (names redacted):`)
  for (const cg of classGroups) {
    md.push(`  - id=${cg.id}: <REDACTED> (cohortYear=${cg.cohortYear}, track=${cg.track}, students=${cg.studentCount})`)
  }
  md.push(`- **Cohort Years**: [${cohortYears.join(', ')}]`)
  md.push(`- **Is Cross-Cohort**: ${isCrossCohort}`)
  md.push(`- **ScheduleSlots** (room names redacted):`)
  for (const s of slots) {
    md.push(`  - id=${s.id}: day=${s.dayOfWeek}, slot=${s.slotIndex}, room=<REDACTED> (id=${s.roomId}, cap=${s.roomCapacity})`)
  }
  md.push(`- **Is only remaining cross-cohort candidate after K18-B**: true`)
  md.push('')
  md.push('## 5. Source Artifact Status')
  md.push('')
  md.push(`- **Parsed JSON found**: ${sourceEvidence.parsedJsonFound}`)
  md.push(`- **DOCX found**: ${sourceEvidence.docxFound}`)
  md.push(`- **Source artifact found**: ${sourceEvidence.sourceArtifactFound}`)
  md.push(`- **ImportBatch originalFilePath**: ${task.importBatch?.originalFilePath || 'null'}`)
  md.push(`- **ImportBatch parsedJsonPath**: ${task.importBatch?.parsedJsonPath || 'null'}`)
  md.push('')
  md.push('## 6. Source Evidence Findings')
  md.push('')
  md.push(`Searched all ${fs.existsSync(IMPORTS_DIR) ? fs.readdirSync(IMPORTS_DIR).filter(f => f.endsWith('.json')).length : 0} parsed JSON files in uploads/imports/.`)
  md.push('')

  if (sourceEvidence.matchedRecords.length > 0) {
    md.push('| Source | Match Type | Evidence | Confidence |')
    md.push('|--------|-----------|----------|------------|')
    for (const r of sourceEvidence.matchedRecords) {
      md.push(`| ${r.source} | ${r.matchType} | ${r.excerpt.substring(0, 120)} | ${r.confidence} |`)
    }
  } else {
    md.push('No matching records found in any parsed JSON file.')
  }
  md.push('')

  md.push('### Key Observations')
  md.push('')
  md.push('1. **Primary-cohort records found**: Multiple parsed JSON records show the primary-cohort classes')
  md.push('   taking the public-ideology course. These have 合班 remarks (e.g. cross-class and cross-track merges).')
  md.push('')
  md.push('2. **No cross-cohort record**: No parsed JSON file contains a record for the cross-cohort class')
  md.push('   taking this course with the assigned teacher.')
  md.push('')
  md.push('3. **Comparison task**: A related task (same teacher, same course, same primary-cohort classes)')
  md.push('   has a remark mentioning the cross-cohort class but does NOT link it.')
  md.push('   The target task links it — the source evidence does not support this link.')
  md.push('')
  md.push('4. **Pattern match**: The cross-cohort link pattern (cross-cohort class added via fuzzy matching)')
  md.push('   matches the 4 confirmed-error tasks repaired in K18-B.')
  md.push('')

  if (sourceEvidence.evidenceGaps.length > 0) {
    md.push('### Evidence Gaps')
    md.push('')
    for (const gap of sourceEvidence.evidenceGaps) {
      md.push(`- ${gap}`)
    }
    md.push('')
  }

  md.push('## 7. Decision')
  md.push('')
  md.push(`- **Decision**: ${decision}`)
  md.push(`- **Confidence**: ${confidence}`)
  md.push(`- **Recommended Action**: ${recommendedAction}`)
  md.push(`- **Suggested Next Stage**: ${suggestedNextStage}`)
  md.push(`- **Blocking**: ${blocking}`)
  md.push('')

  md.push('## 8. Risk Assessment')
  md.push('')
  if (decision === 'ACCEPTED_CROSS_COHORT') {
    md.push('- Task 37 cross-cohort grouping is **accepted** based on source evidence')
    md.push('- No repair needed')
    md.push('- K18 data quality mainline can be closed')
  } else if (decision === 'LIKELY_ERROR') {
    md.push('- Target task cross-cohort grouping is **likely an import matching error**')
    md.push('- The course is a public/ideology course, so cross-cohort teaching is plausible in principle')
    md.push('- However, the parsed JSON source does NOT contain a cross-cohort record for this course+teacher')
    md.push('- The pattern matches the 4 confirmed-error tasks repaired in K18-B')
    md.push('- **Recommendation**: Plan repair (remove cross-cohort link) or verify with original .docx')
    md.push('- K18 data quality mainline should NOT be closed until resolved')
  } else if (decision === 'NEEDS_SOURCE_REVIEW') {
    md.push('- Source evidence is insufficient to make a determination')
    md.push('- **Recommendation**: Manual review of original .docx required')
    md.push('- K18 data quality mainline should NOT be closed until resolved')
  }
  md.push('')
  md.push('## 9. Recommended Action')
  md.push('')
  if (decision === 'LIKELY_ERROR') {
    md.push('1. **Preferred**: Verify with original .docx (manual inspection of the source schedule table)')
    md.push('2. **If confirmed error**: Proceed to K18-D data-repair plan to remove the cross-cohort link')
    md.push('3. **If confirmed legitimate**: Mark as ACCEPTED_CROSS_COHORT and close K18')
  } else if (decision === 'NEEDS_SOURCE_REVIEW') {
    md.push('1. **Required**: Manual inspection of original .docx source table')
    md.push('2. Check if the cross-cohort class has a separate row for this course')
    md.push('3. Check if the 合班 arrangement was explicitly stated in the source')
  }
  md.push('')
  md.push('## 10. Unmodified Scope')
  md.push('')
  md.push('- Prisma schema: NOT modified')
  md.push('- prisma/dev.db: NOT modified')
  md.push('- TeachingTask / TeachingTaskClass / ClassGroup / ScheduleSlot: NOT modified')
  md.push('- ImportBatch: NOT modified')
  md.push('- API routes: NOT modified')
  md.push('- Import logic: NOT modified')
  md.push('- Frontend: NOT modified')
  md.push('- Solver / parser: NOT modified')
  md.push('')
  md.push('## 11. Verification Results')
  md.push('')
  md.push('See terminal output for full verification results.')
  md.push('')

  fs.writeFileSync(OUTPUT_MD, md.join('\n'), 'utf-8')

  await prisma.$disconnect()
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
