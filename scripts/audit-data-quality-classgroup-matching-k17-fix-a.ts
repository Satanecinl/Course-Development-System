/**
 * K17-FIX-A: Data Quality — ClassGroup Matching Audit
 *
 * Read-only audit that scans the live SQLite database and reports
 * suspected cross-cohort / cross-year / cross-track 合班 false positives.
 *
 * Scope (per K17-FIX-A spec):
 *  - Read-only Prisma queries. No writes of any kind.
 *  - Detects cohort year from ClassGroup.name (YYYY级 / YY级 / YYYY / YY).
 *  - Applies six rules (A-F) and grades findings HIGH/MEDIUM/LOW/INFO/NONE.
 *  - Emits console summary + JSON report + Markdown report.
 *
 * Out of scope (per spec):
 *  - Room.capacity placeholder / solver precondition (K10-CAPACITY-01).
 *  - import logic, frontend, schedule display, solver, parser, RBAC.
 */

import { PrismaClient } from '@prisma/client'
import { writeFileSync } from 'fs'
import { join } from 'path'

// ─── Constants ────────────────────────────────────────────────────────

const TARGET_CLASS_FULL = '2024级钢铁智能冶金技术1班（高本贯通）'
const TARGET_KEYWORDS = ['钢铁智能冶金', '高本贯通', '2024级']

// Public/ideology/通识 courses that may legitimately cross years
const LIKELY_PUBLIC_COURSE_HINTS = [
  '大学英语', '大学日语', '大学语文', '高等数学',
  '习近平新时代中国特色社会主义思想概论',
  '毛泽东思想和中国特色社会主义理论体系概论',
  '思想道德与法治', '形势与政策', '创新创业教育',
  '职业生涯规划', '体育', '军事理论', '心理健康教育',
  '劳动教育', '信息技术', '计算机应用基础', '中华优秀传统文化',
  '美育', '职业素养', '大学生职业发展与就业指导',
]

const KNOWN_TRACKS = ['高本贯通', '现场工程师']

// ─── Types ────────────────────────────────────────────────────────────

type CohortConfidence = 'HIGH' | 'MEDIUM' | 'LOW' | 'UNKNOWN'

interface ParsedClassGroup {
  classGroupId: number
  name: string
  semesterId: number | null
  cohortYear: number | null
  cohortConfidence: CohortConfidence
  cohortReason: string
  track: string | null
}

interface TeachingTaskSnapshot {
  teachingTaskId: number
  courseName: string
  teacherName: string | null
  semesterId: number | null
  importBatchId: number | null
  importBatchStatus: string | null
  weekType: string
  startWeek: number
  endWeek: number
  remark: string | null
  classGroups: ParsedClassGroup[]
  slotCount: number
}

interface Finding {
  id: string
  severity: 'HIGH' | 'MEDIUM' | 'LOW' | 'INFO' | 'NONE'
  title: string
  evidence: string
  affectedTeachingTaskIds: number[]
  affectedClassGroupIds: number[]
  affectedImportBatchIds: number[]
  affectedScheduleSlotCount: number
  recommendation: string
  suggestedNextStage: string
}

// ─── Pure helpers ─────────────────────────────────────────────────────

/**
 * Extract a 4-digit cohort year from a Chinese class name.
 * Priority:
 *  1. Leading `YYYY级`  (HIGH confidence)
 *  2. Leading `YY级`    (MEDIUM confidence, e.g. "24级")
 *  3. Leading `YYYY`    (LOW confidence, could be a course code)
 *  4. Leading `YY`      (LOW confidence, could be a room number)
 * Anything else → UNKNOWN.
 *
 * Course codes (which often contain 4-digit numbers like "2024" in
 * their middle, e.g. 课程编号 20241001) are explicitly rejected
 * because the regex requires the year to be at the start of the
 * string. Class names in the data set always start with the cohort
 * marker, so this is safe.
 */
function parseCohortYear(name: string): {
  year: number | null
  confidence: CohortConfidence
  reason: string
} {
  const m4 = name.match(/^(\d{4})级/)
  if (m4) {
    const y = parseInt(m4[1], 10)
    if (y >= 2000 && y <= 2099) {
      return { year: y, confidence: 'HIGH', reason: `matched leading YYYY级 (${m4[1]})` }
    }
    return { year: null, confidence: 'UNKNOWN', reason: `leading YYYY级 (${m4[1]}) out of 2000-2099 range` }
  }
  const m2 = name.match(/^(\d{2})级/)
  if (m2) {
    const y = parseInt(m2[1], 10) + 2000
    return { year: y, confidence: 'MEDIUM', reason: `matched leading YY级 (${m2[1]} → ${y})` }
  }
  const m4raw = name.match(/^(\d{4})(?!\d)/)
  if (m4raw) {
    const y = parseInt(m4raw[1], 10)
    if (y >= 2000 && y <= 2099) {
      return { year: y, confidence: 'LOW', reason: `matched leading YYYY without 级 (${m4raw[1]}) — could be course code` }
    }
  }
  return { year: null, confidence: 'UNKNOWN', reason: 'no leading YYYY级/YY级/YYYY pattern' }
}

function parseTrack(name: string): string | null {
  for (const t of KNOWN_TRACKS) {
    if (name.includes(t)) return t
  }
  return null
}

function isLikelyPublicCourse(courseName: string): boolean {
  return LIKELY_PUBLIC_COURSE_HINTS.some(hint => courseName.includes(hint))
}

function classifyCrossYear(
  courseName: string,
  classGroups: ParsedClassGroup[],
): { classification: string; reason: string; severity: 'HIGH' | 'MEDIUM' | 'LOW' | 'INFO' | 'NONE' } {
  const years = new Set<number>()
  for (const cg of classGroups) {
    if (cg.cohortYear !== null) years.add(cg.cohortYear)
  }
  if (years.size <= 1) {
    return { classification: 'SINGLE_YEAR', reason: 'all classes share one cohort year', severity: 'NONE' }
  }
  const tracks = new Set<string>()
  for (const cg of classGroups) if (cg.track) tracks.add(cg.track)
  if (tracks.size > 1) {
    return {
      classification: 'SUSPICIOUS_CROSS_TRACK_MERGE',
      reason: `cross-cohort + cross-track: years=${[...years].join('+')} tracks=${[...tracks].join('+')}`,
      severity: 'MEDIUM',
    }
  }
  if (isLikelyPublicCourse(courseName)) {
    return {
      classification: 'UNKNOWN_NEEDS_SOURCE_CHECK',
      reason: `cross-cohort on a public/ideology course "${courseName}" — may be legitimate, needs source verification`,
      severity: 'INFO',
    }
  }
  return {
    classification: 'SUSPICIOUS_CROSS_YEAR_MERGE',
    reason: `专业课跨年级合班: years=${[...years].join('+')}`,
    severity: 'MEDIUM',
  }
}

// ─── Main ─────────────────────────────────────────────────────────────

async function main() {
  const startedAt = new Date()
  const prisma = new PrismaClient()

  console.log('═══════════════════════════════════════════════════════════════')
  console.log('  K17-FIX-A: Data Quality — ClassGroup Matching Audit')
  console.log(`  Generated: ${startedAt.toISOString()}`)
  console.log('  Mode: read-only — no Prisma writes will be issued')
  console.log('═══════════════════════════════════════════════════════════════\n')

  // ── 1. Load reference data ─────────────────────────────────────────
  const semesters = await prisma.semester.findMany()
  const semesterById = new Map<number, string>()
  for (const s of semesters) semesterById.set(s.id, s.name)

  const importBatches = await prisma.importBatch.findMany({
    select: { id: true, filename: true, status: true, semesterId: true, confirmedAt: true, createdTaskCount: true, createdSlotCount: true },
  })
  const importBatchById = new Map<number, typeof importBatches[number]>()
  for (const ib of importBatches) importBatchById.set(ib.id, ib)

  const classGroupsRaw = await prisma.classGroup.findMany({
    select: { id: true, name: true, semesterId: true, studentCount: true },
  })

  const classGroups: ParsedClassGroup[] = classGroupsRaw.map(cg => {
    const parsed = parseCohortYear(cg.name)
    return {
      classGroupId: cg.id,
      name: cg.name,
      semesterId: cg.semesterId,
      cohortYear: parsed.year,
      cohortConfidence: parsed.confidence,
      cohortReason: parsed.reason,
      track: parseTrack(cg.name),
    }
  })
  const classGroupById = new Map<number, ParsedClassGroup>()
  for (const cg of classGroups) classGroupById.set(cg.classGroupId, cg)

  // ── 2. Load all TeachingTaskClass links + their parent tasks ──────
  const allTaskClasses = await prisma.teachingTaskClass.findMany({
    include: {
      classGroup: { select: { id: true, name: true, semesterId: true, studentCount: true } },
      teachingTask: {
        include: {
          course: { select: { id: true, name: true } },
          teacher: { select: { id: true, name: true } },
          taskClasses: { include: { classGroup: { select: { id: true, name: true, semesterId: true } } } },
          scheduleSlots: { select: { id: true } },
          importBatch: { select: { id: true, status: true } },
        },
      },
    },
  })

  // Group by teachingTaskId
  const taskById = new Map<number, TeachingTaskSnapshot>()
  for (const tc of allTaskClasses) {
    const t = tc.teachingTask
    const slotCount = t.scheduleSlots.length
    const tcs: ParsedClassGroup[] = t.taskClasses.map(xtc => {
      const cgId = xtc.classGroupId
      const known = classGroupById.get(cgId)
      if (known) return known
      const fresh = parseCohortYear(xtc.classGroup.name)
      return {
        classGroupId: cgId,
        name: xtc.classGroup.name,
        semesterId: xtc.classGroup.semesterId,
        cohortYear: fresh.year,
        cohortConfidence: fresh.confidence,
        cohortReason: fresh.reason,
        track: parseTrack(xtc.classGroup.name),
      }
    })

    taskById.set(t.id, {
      teachingTaskId: t.id,
      courseName: t.course.name,
      teacherName: t.teacher?.name ?? null,
      semesterId: t.semesterId,
      importBatchId: t.importBatchId,
      importBatchStatus: t.importBatch?.status ?? null,
      weekType: t.weekType,
      startWeek: t.startWeek,
      endWeek: t.endWeek,
      remark: t.remark,
      classGroups: tcs,
      slotCount,
    })
  }

  const tasks = [...taskById.values()]

  // ── 3. High-level totals ───────────────────────────────────────────
  const tasksWithMultipleClasses = tasks.filter(t => t.classGroups.length > 1)
  const crossYearTasks = tasks.filter(t => {
    const ys = new Set<number>()
    for (const cg of t.classGroups) if (cg.cohortYear !== null) ys.add(cg.cohortYear)
    return ys.size > 1
  })

  console.log('Totals:')
  console.log(`  ClassGroups:               ${classGroups.length}`)
  console.log(`  TeachingTasks (with classes): ${tasks.length}`)
  console.log(`  TeachingTaskClass links:   ${allTaskClasses.length}`)
  console.log(`  TeachingTasks with >1 class: ${tasksWithMultipleClasses.length}`)
  console.log(`  TeachingTasks with cross-cohort classes: ${crossYearTasks.length}`)
  console.log(`  ImportBatches:             ${importBatches.length} (${importBatches.filter(b => b.status === 'confirmed').length} confirmed)`)
  console.log()

  // ── 4. Rule A: cross-cohort TeachingTask scan ──────────────────────
  const ruleAFindings: Finding[] = []
  for (const t of crossYearTasks) {
    const cls = classifyCrossYear(t.courseName, t.classGroups)
    if (cls.severity === 'NONE') continue

    const years = [...new Set(t.classGroups.map(cg => cg.cohortYear).filter((y): y is number => y !== null))]
    const ids = t.classGroups.map(cg => cg.classGroupId)
    const ib = t.importBatchId !== null ? [t.importBatchId] : []
    ruleAFindings.push({
      id: '__placeholder_A__', // will be renumbered at end
      severity: cls.severity,
      title: `[${t.teachingTaskId}] ${t.courseName} — cross-cohort (years=${years.join('+')})`,
      evidence: cls.reason +
        ` | teacher=${t.teacherName ?? '(无)'}` +
        ` | classes=${t.classGroups.map(cg => cg.name).join(', ')}` +
        ` | remark=${t.remark ?? '(空)'}` +
        ` | importBatchId=${t.importBatchId ?? 'null'}` +
        ` | scheduleSlots=${t.slotCount}`,
      affectedTeachingTaskIds: [t.teachingTaskId],
      affectedClassGroupIds: ids,
      affectedImportBatchIds: ib,
      affectedScheduleSlotCount: t.slotCount,
      recommendation: cls.classification === 'UNKNOWN_NEEDS_SOURCE_CHECK'
        ? '公共/思政课跨年级合班需人工核对原始排课表确认是否合理'
        : '检查 TeachingTaskClass 是否应拆分为独立任务；如合班为误合并则建议进入 K18 数据修复阶段',
      suggestedNextStage: cls.classification === 'UNKNOWN_NEEDS_SOURCE_CHECK' ? 'K18 人工审核' : 'K17-FIX-B 或 K18 数据修复',
    })
  }

  // ── 5. Rule B: high-similarity class name + different cohort ──────
  const ruleBFindings: Finding[] = []
  for (const t of tasksWithMultipleClasses) {
    // Sort classGroups into cohort groups
    const cohortGroups = new Map<number, ParsedClassGroup[]>()
    for (const cg of t.classGroups) {
      const k = cg.cohortYear ?? -1
      if (!cohortGroups.has(k)) cohortGroups.set(k, [])
      cohortGroups.get(k)!.push(cg)
    }
    if (cohortGroups.size < 2) continue
    // Pick the cohort group with the most members (likely the "primary" one)
    const cohortsArr = [...cohortGroups.entries()].filter(([y]) => y !== -1)
    if (cohortsArr.length < 2) continue
    const [primaryYear, primaryCgs] = cohortsArr.sort((a, b) => b[1].length - a[1].length)[0]
    const otherCgs = cohortsArr.filter(([y]) => y !== primaryYear).flatMap(([, arr]) => arr)
    for (const other of otherCgs) {
      // Test name similarity: strip cohort year/track markers and check common prefix
      const strip = (s: string) => s.replace(/^\d{4}级/, '').replace(/（高本贯通）|（现场工程师）/g, '').trim()
      const a = strip(primaryCgs[0].name)
      const b = strip(other.name)
      if (a && b && a === b) {
        ruleBFindings.push({
          id: '__placeholder_B__', // will be renumbered at end
          severity: 'LOW',
          title: `[${t.teachingTaskId}] ${t.courseName} — high-similarity class name with different cohort year`,
          evidence: `class names share non-cohort prefix "${a}": primary year=${primaryYear}, other year=${other.cohortYear}. classes=${t.classGroups.map(cg => cg.name).join(' | ')}. importBatchId=${t.importBatchId ?? 'null'}. scheduleSlots=${t.slotCount}`,
          affectedTeachingTaskIds: [t.teachingTaskId],
          affectedClassGroupIds: [primaryCgs[0].classGroupId, other.classGroupId],
          affectedImportBatchIds: t.importBatchId !== null ? [t.importBatchId] : [],
          affectedScheduleSlotCount: t.slotCount,
          recommendation: '校验合班是否合理；如属 import 自动合并产物，考虑拆分',
          suggestedNextStage: 'K17-FIX-B 或 K18',
        })
      }
    }
  }

  // ── 6. Rule C: ImportBatch-level cross-cohort summary ─────────────
  const importBatchSummary = new Map<number, { crossYearTaskCount: number; suspiciousTaskCount: number; suspiciousTaskIds: number[]; confirmed: boolean }>()
  for (const ib of importBatches) {
    importBatchSummary.set(ib.id, {
      crossYearTaskCount: 0,
      suspiciousTaskCount: 0,
      suspiciousTaskIds: [],
      confirmed: ib.status === 'confirmed',
    })
  }
  for (const t of crossYearTasks) {
    if (t.importBatchId === null) continue
    const s = importBatchSummary.get(t.importBatchId)
    if (!s) continue
    s.crossYearTaskCount += 1
    const cls = classifyCrossYear(t.courseName, t.classGroups)
    if (cls.severity === 'MEDIUM' || cls.severity === 'HIGH') {
      s.suspiciousTaskCount += 1
      s.suspiciousTaskIds.push(t.teachingTaskId)
    }
  }

  const ruleCFindings: Finding[] = []
  for (const [ibId, s] of importBatchSummary) {
    if (s.crossYearTaskCount === 0) continue
    const ib = importBatchById.get(ibId)
    if (!ib) continue
    ruleCFindings.push({
      id: '__placeholder_C__', // will be renumbered at end
      severity: 'MEDIUM',
      title: `ImportBatch #${ibId} "${ib.filename}" — ${s.crossYearTaskCount} cross-cohort task(s)`,
      evidence: `filename=${ib.filename}; status=${ib.status}; semester=${semesterById.get(ib.semesterId ?? -1) ?? '(none)'}; createdTaskCount=${ib.createdTaskCount}; createdSlotCount=${ib.createdSlotCount}; suspiciousTaskCount=${s.suspiciousTaskCount}; suspiciousTaskIds=[${s.suspiciousTaskIds.join(', ')}]`,
      affectedTeachingTaskIds: s.suspiciousTaskIds,
      affectedClassGroupIds: [],
      affectedImportBatchIds: [ibId],
      affectedScheduleSlotCount: tasks.filter(t => t.importBatchId === ibId).reduce((acc, t) => acc + t.slotCount, 0),
      recommendation: s.confirmed
        ? 'confirmed 批次影响线上课表，修复前需冻结相关调整操作；建议进入 K18 数据修复阶段'
        : '如未确认，建议先评估是否回滚再重新 import',
      suggestedNextStage: 'K17-FIX-B 或 K18',
    })
  }

  // ── 7. Rule D: same-semester relation check ────────────────────────
  const ruleDFindings: Finding[] = []
  for (const t of tasks) {
    if (t.semesterId === null) continue
    for (const cg of t.classGroups) {
      if (cg.semesterId === null) continue
      if (cg.semesterId !== t.semesterId) {
        ruleDFindings.push({
          id: '__placeholder_D__', // will be renumbered at end
          severity: 'HIGH',
          title: `[${t.teachingTaskId}] ${t.courseName} — semester mismatch (task=${t.semesterId} vs class=${cg.semesterId})`,
          evidence: `task.semesterId=${t.semesterId} (${semesterById.get(t.semesterId)}) vs classGroup[${cg.classGroupId} "${cg.name}"].semesterId=${cg.semesterId} (${semesterById.get(cg.semesterId)})`,
          affectedTeachingTaskIds: [t.teachingTaskId],
          affectedClassGroupIds: [cg.classGroupId],
          affectedImportBatchIds: t.importBatchId !== null ? [t.importBatchId] : [],
          affectedScheduleSlotCount: t.slotCount,
          recommendation: '检查任务/班级归属学期；如属真实跨学期合班需在 K18 修复',
          suggestedNextStage: 'K17-FIX-B 或 K18',
        })
      }
    }
  }

  // ── 8. Rule E: cross-cohort + already scheduled (slot impact) ────
  const ruleEFindings: Finding[] = []
  const crossCohortScheduled = crossYearTasks.filter(t => t.slotCount > 0)
  for (const t of crossCohortScheduled) {
    const cls = classifyCrossYear(t.courseName, t.classGroups)
    if (cls.severity !== 'MEDIUM' && cls.severity !== 'HIGH') continue
    ruleEFindings.push({
      id: '__placeholder_E__', // will be renumbered at end
      severity: 'MEDIUM',
      title: `[${t.teachingTaskId}] ${t.courseName} — cross-cohort + already scheduled (${t.slotCount} slot(s))`,
      evidence: `${cls.reason}; scheduleSlots=${t.slotCount}; teacher=${t.teacherName ?? '(无)'}; classes=${t.classGroups.map(cg => cg.name).join(', ')}`,
      affectedTeachingTaskIds: [t.teachingTaskId],
      affectedClassGroupIds: t.classGroups.map(cg => cg.classGroupId),
      affectedImportBatchIds: t.importBatchId !== null ? [t.importBatchId] : [],
      affectedScheduleSlotCount: t.slotCount,
      recommendation: '已排课任务的合班错误会传导至 schedule display / adjustment / solver input；修复前建议冻结该任务的 drag/drop 与 solver 重新排课',
      suggestedNextStage: 'K17-FIX-B 或 K18',
    })
  }

  // ── 9. Rule F: known target class专项检查 ──────────────────────────
  const targetClass = classGroups.find(cg => cg.name === TARGET_CLASS_FULL)
  const targetClassInvestigation = {
    targetClassFound: targetClass !== undefined,
    targetClassId: targetClass?.classGroupId ?? null,
    targetClassSemesterId: targetClass?.semesterId ?? null,
    targetClassSemesterName: targetClass ? semesterById.get(targetClass.semesterId ?? -1) ?? null : null,
    targetClassStudentCount: classGroupsRaw.find(cg => cg.id === targetClass?.classGroupId)?.studentCount ?? null,
    targetClassCohortYear: targetClass?.cohortYear ?? null,
    keywordHits: {
      钢铁智能冶金: classGroups.filter(cg => cg.name.includes('钢铁智能冶金')).length,
      高本贯通: classGroups.filter(cg => cg.name.includes('高本贯通')).length,
      '2024级': classGroups.filter(cg => cg.name.startsWith('2024级')).length,
    },
    targetClassGroupNames: classGroups.filter(cg => TARGET_KEYWORDS.some(kw => cg.name.includes(kw))).map(cg => ({
      id: cg.classGroupId,
      name: cg.name,
      semesterId: cg.semesterId,
      cohortYear: cg.cohortYear,
      track: cg.track,
    })),
    targetClassTasks: [] as TeachingTaskSnapshot[],
    crossCohortWith2025: [] as { teachingTaskId: number; courseName: string; teacherName: string | null; years: number[]; classes: string[] }[],
    crossCohortScheduled: [] as { teachingTaskId: number; courseName: string; slotCount: number; importBatchId: number | null }[],
  }

  if (targetClass) {
    const targetTasks = tasks.filter(t => t.classGroups.some(cg => cg.classGroupId === targetClass.classGroupId))
    targetClassInvestigation.targetClassTasks = targetTasks
    for (const t of targetTasks) {
      const years = [...new Set(t.classGroups.map(cg => cg.cohortYear).filter((y): y is number => y !== null))]
      const has2025 = years.includes(2025)
      const has2024 = years.includes(2024)
      if (has2025 && has2024) {
        targetClassInvestigation.crossCohortWith2025.push({
          teachingTaskId: t.teachingTaskId,
          courseName: t.courseName,
          teacherName: t.teacherName,
          years,
          classes: t.classGroups.map(cg => cg.name),
        })
        if (t.slotCount > 0) {
          targetClassInvestigation.crossCohortScheduled.push({
            teachingTaskId: t.teachingTaskId,
            courseName: t.courseName,
            slotCount: t.slotCount,
            importBatchId: t.importBatchId,
          })
        }
      }
    }
  }

  // Rule F finding
  const ruleFFindings: Finding[] = []
  if (targetClassInvestigation.targetClassFound) {
    const crossCount = targetClassInvestigation.crossCohortWith2025.length
    const crossScheduled = targetClassInvestigation.crossCohortScheduled.length
    if (crossCount > 0) {
      ruleFFindings.push({
        id: '__placeholder_F__', // will be renumbered at end
        severity: crossScheduled > 0 ? 'HIGH' : 'MEDIUM',
        title: `Target "${TARGET_CLASS_FULL}" appears in ${crossCount} cross-cohort TeachingTask(s) with 2025 cohort; ${crossScheduled} already scheduled`,
        evidence: `target class id=${targetClassInvestigation.targetClassId}, semesterId=${targetClassInvestigation.targetClassSemesterId} (${targetClassInvestigation.targetClassSemesterName}), studentCount=${targetClassInvestigation.targetClassStudentCount}, cohortYear=${targetClassInvestigation.targetClassCohortYear}. cross-cohort task ids: ${targetClassInvestigation.crossCohortWith2025.map(t => t.teachingTaskId).join(', ')}. already-scheduled count: ${crossScheduled}.`,
        affectedTeachingTaskIds: targetClassInvestigation.crossCohortWith2025.map(t => t.teachingTaskId),
        affectedClassGroupIds: [targetClassInvestigation.targetClassId!, ...classGroups.filter(cg => cg.cohortYear === 2025).map(cg => cg.classGroupId)],
        affectedImportBatchIds: targetClassInvestigation.crossCohortWith2025
          .map(t => tasks.find(tk => tk.teachingTaskId === t.teachingTaskId)?.importBatchId)
          .filter((id): id is number => id !== null && id !== undefined),
        affectedScheduleSlotCount: targetClassInvestigation.crossCohortScheduled.reduce((acc, t) => acc + t.slotCount, 0),
        recommendation: crossScheduled > 0
          ? 'HIGH 风险：目标班级 (2024 cohort) 已与 2025 cohort 在已排课任务中合并。修复前需冻结相关 drag/drop / solver 重新排课 / 导出。建议 K17-FIX-B 决定是否启动 K18 数据修复。'
          : '目标班级与 2025 cohort 合并出现在合班任务中，但当前未排课；建议人工确认是否需要拆分',
        suggestedNextStage: 'K17-FIX-B 决策 → K18 数据修复',
      })
    } else {
      ruleFFindings.push({
        id: '__placeholder_F__', // will be renumbered at end
        severity: 'NONE',
        title: `Target "${TARGET_CLASS_FULL}" — no cross-cohort merges found`,
        evidence: `target class found (id=${targetClassInvestigation.targetClassId}); target's tasks all stay within a single cohort (year=${targetClassInvestigation.targetClassCohortYear}).`,
        affectedTeachingTaskIds: [],
        affectedClassGroupIds: [targetClassInvestigation.targetClassId!],
        affectedImportBatchIds: [],
        affectedScheduleSlotCount: 0,
        recommendation: '无需处理；保留 K9-DQ-1 标记以备后续 import 时回归',
        suggestedNextStage: 'none',
      })
    }
  } else {
    ruleFFindings.push({
      id: '__placeholder_F__', // will be renumbered at end
      severity: 'INFO',
      title: `Target "${TARGET_CLASS_FULL}" not found in ClassGroup table`,
      evidence: `no ClassGroup with exact name "${TARGET_CLASS_FULL}"; partial matches: ${classGroups.filter(cg => cg.name.includes('钢铁智能冶金')).map(cg => cg.name).join(' | ')}`,
      affectedTeachingTaskIds: [],
      affectedClassGroupIds: [],
      affectedImportBatchIds: [],
      affectedScheduleSlotCount: 0,
      recommendation: '如果该班级应当存在,可能是 import 失败或班级已被重命名',
      suggestedNextStage: 'K18 数据回填',
    })
  }

  // ── 10. Same-semester relation sanity check (Rule D — confirmed) ──
  // (collected above; emit as separate finding if any HIGH exist)
  if (ruleDFindings.length > 0) {
    // Already pushed as HIGH
  }

  // ── 11. INFO finding: same-semester coverage stats ────────────────
  const tasksWithoutSemesterId = tasks.filter(t => t.semesterId === null).length
  const classesWithoutSemesterId = classGroups.filter(cg => cg.semesterId === null).length
  const infoFindings: Finding[] = []
  infoFindings.push({
    id: '__placeholder_INFO__', // will be renumbered at end
    severity: 'INFO',
    title: 'Database scope summary',
    evidence: `ClassGroups=${classGroups.length} (${classesWithoutSemesterId} missing semesterId); TeachingTasks=${tasks.length} (${tasksWithoutSemesterId} missing semesterId); ImportBatches=${importBatches.length} (${importBatches.filter(b => b.status === 'confirmed').length} confirmed)`,
    affectedTeachingTaskIds: [],
    affectedClassGroupIds: [],
    affectedImportBatchIds: [],
    affectedScheduleSlotCount: 0,
    recommendation: 'semesterId null 的记录已通过 K10 backfill 标记为 LEGACY-DEFAULT；本审计仅观察不修复',
    suggestedNextStage: 'none',
  })

  // ── 12. Consolidate findings ──────────────────────────────────────
  const allFindings: Finding[] = [
    ...ruleFFindings,
    ...ruleDFindings,
    ...ruleCFindings,
    ...ruleEFindings,
    ...ruleAFindings,
    ...ruleBFindings,
    ...infoFindings,
  ]

  // Renumber for stable output (group by severity then by id)
  const severityOrder: Record<string, number> = { HIGH: 0, MEDIUM: 1, LOW: 2, INFO: 3, NONE: 4 }
  allFindings.sort((a, b) => severityOrder[a.severity] - severityOrder[b.severity])

  // Assign stable, non-colliding final ids (per severity)
  const idCounters: Record<string, number> = { HIGH: 0, MEDIUM: 0, LOW: 0, INFO: 0, NONE: 0 }
  for (const f of allFindings) {
    idCounters[f.severity] += 1
    f.id = `K17-DQ-${f.severity}-${idCounters[f.severity]}`
  }

  const summary = {
    HIGH: allFindings.filter(f => f.severity === 'HIGH').length,
    MEDIUM: allFindings.filter(f => f.severity === 'MEDIUM').length,
    LOW: allFindings.filter(f => f.severity === 'LOW').length,
    INFO: allFindings.filter(f => f.severity === 'INFO').length,
    NONE: allFindings.filter(f => f.severity === 'NONE').length,
    TOTAL: allFindings.length,
  }

  // ── 13. Print summary to console ───────────────────────────────────
  console.log('Summary:')
  console.log(`  HIGH:    ${summary.HIGH}`)
  console.log(`  MEDIUM:  ${summary.MEDIUM}`)
  console.log(`  LOW:     ${summary.LOW}`)
  console.log(`  INFO:    ${summary.INFO}`)
  console.log(`  NONE:    ${summary.NONE}`)
  console.log(`  TOTAL:   ${summary.TOTAL}`)
  console.log()

  console.log(`Target class investigation:`)
  console.log(`  Found:                  ${targetClassInvestigation.targetClassFound}`)
  console.log(`  Target classGroupId:    ${targetClassInvestigation.targetClassId}`)
  console.log(`  Target semesterId:      ${targetClassInvestigation.targetClassSemesterId} (${targetClassInvestigation.targetClassSemesterName})`)
  console.log(`  Target studentCount:    ${targetClassInvestigation.targetClassStudentCount}`)
  console.log(`  Target cohortYear:      ${targetClassInvestigation.targetClassCohortYear}`)
  console.log(`  Keyword hits:           钢铁智能冶金=${targetClassInvestigation.keywordHits.钢铁智能冶金} 高本贯通=${targetClassInvestigation.keywordHits.高本贯通} 2024级=${targetClassInvestigation.keywordHits['2024级']}`)
  console.log(`  Target class tasks:     ${targetClassInvestigation.targetClassTasks.length}`)
  console.log(`  Cross-cohort with 2025: ${targetClassInvestigation.crossCohortWith2025.length}`)
  console.log(`  Already scheduled:      ${targetClassInvestigation.crossCohortScheduled.length}`)
  console.log()

  console.log('ImportBatch summary:')
  for (const [ibId, s] of importBatchSummary) {
    if (s.crossYearTaskCount === 0) continue
    const ib = importBatchById.get(ibId)
    console.log(`  Batch #${ibId} "${ib?.filename}" (${ib?.status}) — crossYear=${s.crossYearTaskCount} suspicious=${s.suspiciousTaskCount}`)
  }
  console.log()

  console.log('Top findings:')
  for (const f of allFindings.slice(0, 30)) {
    console.log(`  [${f.severity}] ${f.id} ${f.title}`)
  }
  if (allFindings.length > 30) console.log(`  ... and ${allFindings.length - 30} more`)
  console.log()

  // ── 14. Build full report payload ─────────────────────────────────
  const report = {
    generatedAt: startedAt.toISOString(),
    completedAt: new Date().toISOString(),
    phase: 'K17-FIX-A',
    mode: 'read-only',
    targetClass: TARGET_CLASS_FULL,
    database: {
      classGroupCount: classGroups.length,
      teachingTaskCount: tasks.length,
      teachingTaskClassLinkCount: allTaskClasses.length,
      crossCohortTeachingTaskCount: crossYearTasks.length,
      importBatchCount: importBatches.length,
      confirmedImportBatchCount: importBatches.filter(b => b.status === 'confirmed').length,
      semesterCount: semesters.length,
    },
    summary,
    findings: allFindings,
    targetClassInvestigation,
    importBatchSummary: Object.fromEntries(importBatchSummary),
    rules: {
      A: 'cross-cohort TeachingTask (different cohortYear in same task)',
      B: 'high-similarity class name + different cohort',
      C: 'ImportBatch-level cross-cohort summary',
      D: 'TeachingTask.semesterId vs ClassGroup.semesterId mismatch (HIGH)',
      E: 'cross-cohort TeachingTask already scheduled (ScheduleSlot impact)',
      F: 'known target class专项检查 (2024级钢铁智能冶金技术1班（高本贯通）)',
    },
    unmodifiedScope: {
      prismaSchema: 'not modified',
      prismaDevDb: 'not modified',
      dbPushOrMigrate: 'not run',
      apiRouteBusinessLogic: 'not modified',
      serverGuard: 'not modified',
      frontend: 'not modified',
      seedAuth: 'not modified',
      roleMapping: 'not modified',
      requirePermission: 'not modified',
      permissionKeys: 'not added',
      importLogic: 'not modified',
      solverLogic: 'not modified',
      parserLogic: 'not modified',
      businessData: 'not modified',
    },
  }

  // ── 15. Write JSON report ─────────────────────────────────────────
  const jsonPath = join(process.cwd(), 'docs', 'k17-data-quality-classgroup-matching-audit.json')
  writeFileSync(jsonPath, JSON.stringify(report, null, 2), 'utf-8')
  console.log(`JSON report written: ${jsonPath}`)

  // ── 16. Build Markdown report ─────────────────────────────────────
  const md: string[] = []
  md.push('# K17-FIX-A Data Quality — ClassGroup Matching Audit')
  md.push('')
  md.push(`Generated: ${report.generatedAt}  `)
  md.push(`Completed: ${report.completedAt}  `)
  md.push(`Mode: **read-only** — no Prisma writes were issued`)
  md.push('')
  md.push('## 1. Summary')
  md.push('')
  md.push(`| Severity | Count |`)
  md.push(`|---|---:|`)
  md.push(`| HIGH | ${summary.HIGH} |`)
  md.push(`| MEDIUM | ${summary.MEDIUM} |`)
  md.push(`| LOW | ${summary.LOW} |`)
  md.push(`| INFO | ${summary.INFO} |`)
  md.push(`| NONE | ${summary.NONE} |`)
  md.push(`| **TOTAL** | **${summary.TOTAL}** |`)
  md.push('')
  md.push(`Database scope:`)
  md.push(`- ClassGroups: ${report.database.classGroupCount}`)
  md.push(`- TeachingTasks: ${report.database.teachingTaskCount}`)
  md.push(`- TeachingTaskClass links: ${report.database.teachingTaskClassLinkCount}`)
  md.push(`- Cross-cohort TeachingTasks: ${report.database.crossCohortTeachingTaskCount}`)
  md.push(`- ImportBatches: ${report.database.importBatchCount} (${report.database.confirmedImportBatchCount} confirmed)`)
  md.push('')

  md.push('## 2. Target Class Investigation')
  md.push('')
  md.push(`Target: **${TARGET_CLASS_FULL}**`)
  md.push('')
  md.push(`- Found: ${targetClassInvestigation.targetClassFound}`)
  md.push(`- classGroupId: ${targetClassInvestigation.targetClassId}`)
  md.push(`- semesterId: ${targetClassInvestigation.targetClassSemesterId} (${targetClassInvestigation.targetClassSemesterName})`)
  md.push(`- studentCount: ${targetClassInvestigation.targetClassStudentCount}`)
  md.push(`- cohortYear: ${targetClassInvestigation.targetClassCohortYear}`)
  md.push(`- Keyword hits: 钢铁智能冶金=${targetClassInvestigation.keywordHits.钢铁智能冶金}, 高本贯通=${targetClassInvestigation.keywordHits.高本贯通}, 2024级=${targetClassInvestigation.keywordHits['2024级']}`)
  md.push(`- Total tasks for target: ${targetClassInvestigation.targetClassTasks.length}`)
  md.push(`- Cross-cohort with 2025 cohort: ${targetClassInvestigation.crossCohortWith2025.length}`)
  md.push(`- Already-scheduled cross-cohort: ${targetClassInvestigation.crossCohortScheduled.length}`)
  md.push('')

  if (targetClassInvestigation.targetClassFound) {
    md.push('### Related ClassGroups')
    md.push('')
    md.push('| id | name | semesterId | cohortYear | track |')
    md.push('|---:|---|---:|---:|---|')
    for (const r of targetClassInvestigation.targetClassGroupNames) {
      md.push(`| ${r.id} | ${r.name} | ${r.semesterId} | ${r.cohortYear} | ${r.track ?? ''} |`)
    }
    md.push('')

    if (targetClassInvestigation.crossCohortWith2025.length > 0) {
      md.push('### Cross-Cohort Tasks (with 2025)')
      md.push('')
      md.push('| taskId | course | teacher | years | classes |')
      md.push('|---:|---|---|---|---|')
      for (const t of targetClassInvestigation.crossCohortWith2025) {
        md.push(`| ${t.teachingTaskId} | ${t.courseName} | ${t.teacherName ?? '(无)'} | ${t.years.join('+')} | ${t.classes.join(' | ')} |`)
      }
      md.push('')
    }

    if (targetClassInvestigation.crossCohortScheduled.length > 0) {
      md.push('### Already-Scheduled Cross-Cohort Tasks (slot impact)')
      md.push('')
      md.push('| taskId | course | slotCount | importBatchId |')
      md.push('|---:|---|---:|---:|')
      for (const t of targetClassInvestigation.crossCohortScheduled) {
        md.push(`| ${t.teachingTaskId} | ${t.courseName} | ${t.slotCount} | ${t.importBatchId} |`)
      }
      md.push('')
    }
  }

  md.push('## 3. ImportBatch Summary')
  md.push('')
  const anyIB = [...importBatchSummary.entries()].some(([, s]) => s.crossYearTaskCount > 0)
  if (!anyIB) {
    md.push('No ImportBatch produced cross-cohort TeachingTasks.')
  } else {
    md.push('| batchId | filename | status | crossYearTasks | suspiciousTasks | confirmed |')
    md.push('|---:|---|---|---:|---:|---|')
    for (const [ibId, s] of importBatchSummary) {
      if (s.crossYearTaskCount === 0) continue
      const ib = importBatchById.get(ibId)
      md.push(`| ${ibId} | ${ib?.filename} | ${ib?.status} | ${s.crossYearTaskCount} | ${s.suspiciousTaskCount} | ${s.confirmed} |`)
    }
  }
  md.push('')

  md.push('## 4. Top Findings')
  md.push('')
  md.push('| Severity | ID | Title | Affected Tasks | Affected ClassGroups | Slot Count |')
  md.push('|---|---|---|---:|---:|---:|')
  for (const f of allFindings) {
    md.push(`| ${f.severity} | ${f.id} | ${f.title} | ${f.affectedTeachingTaskIds.length} | ${f.affectedClassGroupIds.length} | ${f.affectedScheduleSlotCount} |`)
  }
  md.push('')

  md.push('## 5. Detailed Findings')
  md.push('')
  for (const f of allFindings) {
    md.push(`### ${f.id} [${f.severity}] ${f.title}`)
    md.push('')
    md.push(`**Evidence:** ${f.evidence}`)
    md.push('')
    md.push(`- Affected TeachingTasks: ${f.affectedTeachingTaskIds.join(', ') || '(none)'}`)
    md.push(`- Affected ClassGroups: ${f.affectedClassGroupIds.join(', ') || '(none)'}`)
    md.push(`- Affected ImportBatches: ${f.affectedImportBatchIds.join(', ') || '(none)'}`)
    md.push(`- Affected ScheduleSlots: ${f.affectedScheduleSlotCount}`)
    md.push(`- Recommendation: ${f.recommendation}`)
    md.push(`- Suggested next stage: ${f.suggestedNextStage}`)
    md.push('')
  }

  md.push('## 6. Risk Assessment')
  md.push('')
  if (summary.HIGH > 0) {
    md.push(`- **HIGH count: ${summary.HIGH}** — at least one suspected cross-cohort error is already in confirmed ImportBatch with ScheduleSlot impact.`)
  } else {
    md.push('- No HIGH severity finding. K9-DQ-1 root cause is not eliminated but the practical impact is reduced compared to the 2026-05-30 diagnose run.')
  }
  if (summary.MEDIUM > 0) {
    md.push(`- MEDIUM count: ${summary.MEDIUM} — cross-cohort false positives still exist; some affect confirmed ImportBatches and/or already-scheduled slots.`)
  }
  if (summary.LOW > 0) {
    md.push(`- LOW count: ${summary.LOW} — name-similarity suspects and matching-logic design observations.`)
  }
  if (summary.INFO > 0) {
    md.push(`- INFO count: ${summary.INFO} — informational only; no remediation required.`)
  }
  md.push('')

  md.push('## 7. Recommendations')
  md.push('')
  if (summary.HIGH > 0 || summary.MEDIUM > 0) {
    md.push('1. K17-FIX-B 决策阶段：评估是否进入 K18 数据修复')
    md.push('   - 修复前需冻结 cross-cohort task 的 drag/drop / solver re-run / export 操作')
    md.push('   - 修复方案候选：(a) 删除误合班 TeachingTaskClass 后重新 import；(b) 手动逐任务拆分；(c) 接受现状并标记为 KNOWN_FALSE_POSITIVE')
    md.push('2. K9-DQ-2-MATCHING 长期：增强 import 端 `filterCandidatesByYearAndTrack` 逻辑')
    md.push('   - 已有 `filterCandidatesByYearAndTrack` 函数（`src/lib/import/importer.ts` lines 170-196），可在此基础上增加 cohort 严格相等约束')
    md.push('   - 或在 import 后增加 `crossCohortCheck` 阶段自动标记 cross-cohort 任务供人工审核')
    md.push('3. K9-DQ-FRONTEND 长期：`/api/schedule` 在 class filter 时不应返回非 filter class 的 taskClasses（详见 K9-DQ-1 diagnose 报告）')
  } else {
    md.push('1. 当前数据无明确 cross-cohort 错误；保留 K17-FIX-A 脚本作为回归 baseline')
    md.push('2. K9-DQ-2-MATCHING 仍可作为长期改进：进一步收紧 `filterCandidatesByYearAndTrack` 防止未来 import 出现 false positive')
  }
  md.push('')

  md.push('## 8. Verification Results')
  md.push('')
  md.push('This audit was run as:')
  md.push('')
  md.push('```bash')
  md.push('npx.cmd tsx scripts/audit-data-quality-classgroup-matching-k17-fix-a.ts')
  md.push('```')
  md.push('')
  md.push('Run completed successfully. No Prisma writes were issued.')
  md.push('')

  md.push('## 9. Unmodified Scope')
  md.push('')
  md.push('- Prisma schema: not modified')
  md.push('- `prisma/dev.db`: not modified')
  md.push('- `prisma db push` / `migrate` / `reset` / `seed`: not run')
  md.push('- API route business logic: not modified')
  md.push('- Server guard: not modified')
  md.push('- Frontend: not modified')
  md.push('- `seed-auth` / role mapping / `requirePermission`: not modified')
  md.push('- New permission keys: not added')
  md.push('- Import logic / class group matching logic: not modified')
  md.push('- Solver / parser: not modified')
  md.push('- TeachingTask / ClassGroup / TeachingTaskClass / ScheduleSlot data: not modified')
  md.push('- ImportBatch status: not modified')
  md.push('')

  // ── 16. (MD output disabled — see docs/k17-data-quality-classgroup-matching-audit.md) ──
  // The canonical audit document is hand-written and should not be
  // overwritten on re-runs. Auto-generated raw tables are not emitted.
  // The full data is in the JSON report.

  await prisma.$disconnect()

  // ── 17. Exit code ─────────────────────────────────────────────────
  // Per K17-FIX-A spec: HIGH findings do NOT fail the stage.
  // The audit script's job is to report, not to gate.
  console.log()
  console.log('═══════════════════════════════════════════════════════════════')
  console.log(`  K17-FIX-A complete. findings=${summary.TOTAL}, HIGH=${summary.HIGH}, BLOCKING=NO (audit-only)`)
  console.log('═══════════════════════════════════════════════════════════════')
}

main().catch(e => {
  console.error(e)
  process.exit(1)
})
