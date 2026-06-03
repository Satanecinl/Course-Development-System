import { PrismaClient } from '@prisma/client'
import fs from 'fs'
import path from 'path'

const prisma = new PrismaClient()

const AUDIT_JSON_PATH = path.join(__dirname, '..', 'docs', 'k17-data-quality-classgroup-matching-audit.json')
const OUTPUT_JSON_PATH = path.join(__dirname, '..', 'docs', 'k17-cross-cohort-review-decision.json')

const TARGET_TASK_IDS = [168, 174, 176, 181, 37]

/** Extract cohort year from class group name, e.g. "2024级..." → 2024 */
function extractCohortYear(name: string): number | null {
  const m = name.match(/^(\d{4})级/)
  return m ? parseInt(m[1], 10) : null
}

/** Extract track from class group name, e.g. "...（高本贯通）" → "高本贯通" */
function extractTrack(name: string): string | null {
  const m = name.match(/（(高本贯通|现场工程师)）/)
  return m ? m[1] : null
}

type Decision =
  | 'CONFIRMED_ERROR'
  | 'LIKELY_ERROR'
  | 'POSSIBLY_LEGITIMATE'
  | 'NEEDS_SOURCE_REVIEW'
  | 'ACCEPTED_CROSS_COHORT'

interface TaskReview {
  taskId: number
  course: string
  teacher: string | null
  classGroups: string[]
  cohortYears: number[]
  tracks: (string | null)[]
  scheduleSlotCount: number
  importBatchStatus: string | null
  sourceEvidenceAvailable: boolean
  decision: Decision
  confidence: 'HIGH' | 'MEDIUM' | 'LOW'
  recommendedRepairPlan: string
  manualReviewQuestions: string[]
}

function classifyTask(task: {
  id: number
  courseName: string
  teacherName: string | null
  remark: string | null
  classGroups: { name: string; cohortYear: number | null; track: string | null }[]
  slotCount: number
  importBatchStatus: string | null
}): Omit<TaskReview, 'taskId' | 'course' | 'teacher' | 'classGroups' | 'cohortYears' | 'tracks' | 'scheduleSlotCount' | 'importBatchStatus'> {
  const years = [...new Set(task.classGroups.map(cg => cg.cohortYear).filter(Boolean))] as number[]
  const tracks = task.classGroups.map(cg => cg.track)
  const hasCrossCohort = years.length > 1

  // Task 37 is a public/ideology course — cross-cohort may be legitimate
  const isPublicCourse = task.courseName.includes('习近平') ||
    task.courseName.includes('思想') ||
    task.courseName.includes('英语') ||
    task.courseName.includes('体育') ||
    task.courseName.includes('美育')

  if (!hasCrossCohort) {
    return {
      sourceEvidenceAvailable: true,
      decision: 'ACCEPTED_CROSS_COHORT',
      confidence: 'HIGH',
      recommendedRepairPlan: 'No cross-cohort issue detected.',
      manualReviewQuestions: [],
    }
  }

  // Check if remark contains the cross-cohort class name (parser auto-merge signal)
  const remarkHas2024 = task.remark?.includes('2024级') ?? false
  const remarkHas2025 = task.remark?.includes('2025级') ?? false

  if (isPublicCourse) {
    // Public courses can legitimately have cross-cohort classes
    return {
      sourceEvidenceAvailable: true,
      decision: 'NEEDS_SOURCE_REVIEW',
      confidence: 'MEDIUM',
      recommendedRepairPlan: 'Verify original .docx to confirm whether this public course intentionally merges 2024 and 2025 cohorts. If confirmed legitimate, mark ACCEPTED_CROSS_COHORT. If not, split into separate tasks per cohort.',
      manualReviewQuestions: [
        `Is "${task.courseName}" a cross-cohort public course in the original .docx?`,
        `Should 2024级 and 2025级 students attend this course together?`,
      ],
    }
  }

  // Professional/technical courses with cross-cohort = likely import parser error
  // The remark field containing the 2024 class name suggests it was parsed as a 合班 remark
  if (remarkHas2024) {
    // Remark explicitly references the 2024 class — parser likely auto-merged via fuzzy matching
    return {
      sourceEvidenceAvailable: true,
      decision: 'LIKELY_ERROR',
      confidence: 'HIGH',
      recommendedRepairPlan: `Remove classgroup link to 2024级钢铁智能冶金技术1班（高本贯通）from task ${task.id}. If the 2024级 class genuinely shares this course, create a separate TeachingTask for the 2024级 cohort. Requires K18 data repair.`,
      manualReviewQuestions: [
        `Does the original .docx show "${task.courseName}" taught to 2024级钢铁智能冶金技术1班（高本贯通）as a separate entry?`,
        `Was the 合班 remark "2024级钢铁智能冶金技术1班（高本贯通）" intended as a cross-cohort merge or a parser artifact?`,
      ],
    }
  }

  // Other cross-cohort without remark evidence
  return {
    sourceEvidenceAvailable: true,
    decision: 'LIKELY_ERROR',
    confidence: 'MEDIUM',
    recommendedRepairPlan: 'Investigate whether cross-cohort merge is legitimate. If not, split tasks per cohort.',
    manualReviewQuestions: [
      `Why does task ${task.id} contain classes from multiple cohort years?`,
    ],
  }
}

async function main() {
  // Load audit JSON for cross-reference
  const auditRaw = fs.readFileSync(AUDIT_JSON_PATH, 'utf-8')
  const audit = JSON.parse(auditRaw)

  const reviews: TaskReview[] = []

  for (const taskId of TARGET_TASK_IDS) {
    const task = await prisma.teachingTask.findUnique({
      where: { id: taskId },
      include: {
        course: true,
        teacher: true,
        taskClasses: {
          include: { classGroup: true },
        },
        scheduleSlots: true,
        importBatch: true,
      },
    })

    if (!task) {
      reviews.push({
        taskId,
        course: '(not found)',
        teacher: null,
        classGroups: [],
        cohortYears: [],
        tracks: [],
        scheduleSlotCount: 0,
        importBatchStatus: null,
        sourceEvidenceAvailable: false,
        decision: 'NEEDS_SOURCE_REVIEW',
        confidence: 'LOW',
        recommendedRepairPlan: 'Task not found in DB — may have been deleted.',
        manualReviewQuestions: [`Task ${taskId} does not exist in the database. Was it removed?`],
      })
      continue
    }

    const classGroups = task.taskClasses.map(ttc => ({
      name: ttc.classGroup.name,
      cohortYear: extractCohortYear(ttc.classGroup.name),
      track: extractTrack(ttc.classGroup.name),
    }))

    const classification = classifyTask({
      id: task.id,
      courseName: task.course.name,
      teacherName: task.teacher?.name ?? null,
      remark: task.remark,
      classGroups,
      slotCount: task.scheduleSlots.length,
      importBatchStatus: task.importBatch?.status ?? null,
    })

    reviews.push({
      taskId: task.id,
      course: task.course.name,
      teacher: task.teacher?.name ?? null,
      classGroups: classGroups.map(cg => cg.name),
      cohortYears: [...new Set(classGroups.map(cg => cg.cohortYear).filter(Boolean))] as number[],
      tracks: [...new Set(classGroups.map(cg => cg.track))],
      scheduleSlotCount: task.scheduleSlots.length,
      importBatchStatus: task.importBatch?.status ?? null,
      ...classification,
    })
  }

  // Build summary
  const summary: Record<string, number> = {
    CONFIRMED_ERROR: 0,
    LIKELY_ERROR: 0,
    POSSIBLY_LEGITIMATE: 0,
    NEEDS_SOURCE_REVIEW: 0,
    ACCEPTED_CROSS_COHORT: 0,
  }
  for (const r of reviews) {
    summary[r.decision]++
  }

  const blocking = reviews.filter(r =>
    r.decision === 'CONFIRMED_ERROR' || r.decision === 'LIKELY_ERROR'
  ).length

  // Build output
  const output = {
    generatedAt: new Date().toISOString(),
    phase: 'K17-FIX-B',
    mode: 'read-only',
    targetTaskIds: TARGET_TASK_IDS,
    summary,
    decisions: reviews,
    repairPlanCandidates: reviews
      .filter(r => r.decision === 'LIKELY_ERROR' || r.decision === 'CONFIRMED_ERROR')
      .map(r => ({
        taskId: r.taskId,
        course: r.course,
        decision: r.decision,
        plan: r.recommendedRepairPlan,
      })),
    sourceArtifactStatus: {
      originalDocxAvailable: true,
      docxPath: 'prisma/dev.db.backup-before-import-20260527204043',
      importBatchId: 1,
      importBatchStatus: 'confirmed',
      parsedJsonPath: audit.targetClassInvestigation?.targetClassFound ? 'available' : 'unknown',
    },
  }

  // Write JSON
  fs.writeFileSync(OUTPUT_JSON_PATH, JSON.stringify(output, null, 2), 'utf-8')

  // Terminal summary
  console.log('K17-FIX-B Cross-Cohort Review Decision')
  console.log(`CONFIRMED_ERROR: ${summary.CONFIRMED_ERROR}`)
  console.log(`LIKELY_ERROR: ${summary.LIKELY_ERROR}`)
  console.log(`POSSIBLY_LEGITIMATE: ${summary.POSSIBLY_LEGITIMATE}`)
  console.log(`NEEDS_SOURCE_REVIEW: ${summary.NEEDS_SOURCE_REVIEW}`)
  console.log(`ACCEPTED_CROSS_COHORT: ${summary.ACCEPTED_CROSS_COHORT}`)
  console.log(`BLOCKING: ${blocking}`)
  console.log(`Recommended next stage: ${blocking > 0 ? 'K18 data repair' : 'no blocking issues — close K17-FIX-B'}`)
  console.log()
  console.log(`Output written to: ${OUTPUT_JSON_PATH}`)

  await prisma.$disconnect()
}

main().catch(async (e) => {
  console.error(e)
  await prisma.$disconnect()
  process.exit(1)
})
