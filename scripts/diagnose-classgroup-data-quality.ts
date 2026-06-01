/**
 * K9-DQ-1: ClassGroup Data Quality Diagnostic Script
 *
 * Read-only diagnostic queries to audit:
 * 1. Target class "2024级钢铁智能冶金技术1班（高本贯通）" binding
 * 2. Cross-year merges globally
 * 3. Cross-track merges
 * 4. HC3/HC4 impact estimate
 */

import { PrismaClient } from '@prisma/client'
import { writeFileSync } from 'fs'
import { join } from 'path'

const prisma = new PrismaClient()

const TARGET_CLASS = '2024级钢铁智能冶金技术1班（高本贯通）'

// Known suspicious courses from the user's screenshot
const SUSPICIOUS_COURSES = [
  '机械制图',
  '传感器与检测技术',
  '金属材料与热处理',
  '大学英语',
  '大学日语',
  '创新创业教育',
  '习近平新时代中国特色社会主义思想概论',
  '林草环境',
  '无人机应用技术',
]

// Public/ideology courses that might legitimately cross years
const LIKELY_PUBLIC_COURSES = [
  '大学英语', '大学日语', '大学语文', '高等数学',
  '习近平新时代中国特色社会主义思想概论', '毛泽东思想和中国特色社会主义理论体系概论',
  '思想道德与法治', '形势与政策', '创新创业教育', '职业生涯规划',
  '体育', '军事理论', '心理健康教育', '劳动教育',
  '信息技术', '计算机应用基础',
]

interface CrossYearTask {
  teachingTaskId: number
  courseName: string
  teacherName: string | null
  classGroupNames: string[]
  classGroupIds: number[]
  involvedYears: string[]
  classGroupCount: number
  requiredStudents: number
  remark: string | null
  weekType: string
  startWeek: number
  endWeek: number
  importBatchId: number | null
  classification: string
  suspiciousReason: string
}

interface TargetClassTask {
  teachingTaskId: number
  courseName: string
  teacherName: string | null
  classGroupNames: string[]
  classGroupIds: number[]
  classGroupYears: string[]
  requiredStudents: number
  remark: string | null
  isCrossYear: boolean
  containsTargetYear: boolean
  containsOtherYear: boolean
  suspicious: boolean
  suspiciousReason: string
}

function extractYear(name: string): string | null {
  const m = name.match(/^(\d{4})级/)
  return m ? m[1] : null
}

function classifyCrossYear(courseName: string, classGroupNames: string[]): { classification: string; reason: string } {
  const years = [...new Set(classGroupNames.map(extractYear).filter(Boolean))]
  if (years.length <= 1) return { classification: 'SINGLE_YEAR', reason: '' }

  const hasHighGao = classGroupNames.some(n => n.includes('高本贯通'))
  const hasEngineer = classGroupNames.some(n => n.includes('现场工程师'))
  const tracks = new Set<string>()
  if (hasHighGao) tracks.add('高本贯通')
  if (hasEngineer) tracks.add('现场工程师')

  const isPublic = LIKELY_PUBLIC_COURSES.some(pc => courseName.includes(pc))

  if (tracks.size > 1) {
    return { classification: 'SUSPICIOUS_CROSS_TRACK_MERGE', reason: `跨培养方向: ${[...tracks].join('+')}` }
  }
  if (isPublic) {
    return { classification: 'UNKNOWN_NEEDS_SOURCE_CHECK', reason: '公共课/思政课跨年级合班，需回看原始数据确认' }
  }
  return { classification: 'SUSPICIOUS_CROSS_YEAR_MERGE', reason: `专业课跨年级合班: ${years.join('+')}级` }
}

async function main() {
  console.log('=== K9-DQ-1: ClassGroup Data Quality Audit ===\n')

  // ── Step 1: Find target class ──
  const targetClass = await prisma.classGroup.findFirst({
    where: { name: TARGET_CLASS },
    select: { id: true, name: true, studentCount: true },
  })

  if (!targetClass) {
    console.error(`Target class not found: ${TARGET_CLASS}`)
    // Try partial match
    const partial = await prisma.classGroup.findMany({
      where: { name: { contains: '钢铁智能冶金' } },
      select: { id: true, name: true },
    })
    console.log('Partial matches:', partial)
    process.exit(1)
  }

  console.log(`Target class: id=${targetClass.id}, name="${targetClass.name}", studentCount=${targetClass.studentCount}\n`)

  // ── Step 2: All TeachingTasks for target class ──
  const targetTaskClasses = await prisma.teachingTaskClass.findMany({
    where: { classGroupId: targetClass.id },
    include: {
      teachingTask: {
        include: {
          course: true,
          teacher: true,
          taskClasses: {
            include: { classGroup: { select: { id: true, name: true, studentCount: true } } },
          },
          scheduleSlots: { select: { id: true, dayOfWeek: true, slotIndex: true, roomId: true } },
          importBatch: { select: { id: true, filename: true, status: true } },
        },
      },
    },
  })

  const targetTasks: TargetClassTask[] = targetTaskClasses.map(tc => {
    const task = tc.teachingTask
    const classGroupNames = task.taskClasses.map(t => t.classGroup.name)
    const classGroupIds = task.taskClasses.map(t => t.classGroup.id)
    const classGroupYears = classGroupNames.map(extractYear).filter(Boolean) as string[]
    const uniqueYears = [...new Set(classGroupYears)]
    const isCrossYear = uniqueYears.length > 1
    const containsOtherYear = classGroupNames.some(n => n !== TARGET_CLASS && extractYear(n) !== extractYear(TARGET_CLASS))

    const requiredStudents = task.taskClasses.reduce((sum, t) => sum + (t.classGroup.studentCount ?? 50), 0)

    let suspicious = false
    let suspiciousReason = ''
    if (isCrossYear) {
      const cls = classifyCrossYear(task.course.name, classGroupNames)
      suspicious = cls.classification.startsWith('SUSPICIOUS')
      suspiciousReason = cls.reason
    } else if (containsOtherYear) {
      suspicious = true
      suspiciousReason = '包含其他年级班级但未标记跨年级'
    }

    return {
      teachingTaskId: task.id,
      courseName: task.course.name,
      teacherName: task.teacher?.name ?? null,
      classGroupNames,
      classGroupIds,
      classGroupYears,
      requiredStudents,
      remark: task.remark,
      isCrossYear,
      containsTargetYear: classGroupNames.includes(TARGET_CLASS),
      containsOtherYear,
      suspicious,
      suspiciousReason,
    }
  })

  console.log(`TeachingTasks for "${TARGET_CLASS}": ${targetTasks.length}`)
  const crossYearInTarget = targetTasks.filter(t => t.isCrossYear)
  const suspiciousInTarget = targetTasks.filter(t => t.suspicious)
  console.log(`  Cross-year tasks: ${crossYearInTarget.length}`)
  console.log(`  Suspicious tasks: ${suspiciousInTarget.length}\n`)

  if (suspiciousInTarget.length > 0) {
    console.log('Suspicious tasks for target class:')
    for (const t of suspiciousInTarget) {
      console.log(`  [${t.teachingTaskId}] ${t.courseName} | ${t.teacherName ?? '(无教师)'} | ${t.classGroupNames.join(', ')} | ${t.suspiciousReason}`)
    }
    console.log()
  }

  // ── Step 3: Global cross-year scan ──
  const allTaskClasses = await prisma.teachingTaskClass.findMany({
    include: {
      classGroup: { select: { id: true, name: true, studentCount: true } },
      teachingTask: {
        include: {
          course: true,
          teacher: true,
          taskClasses: {
            include: { classGroup: { select: { id: true, name: true } } },
          },
          importBatch: { select: { id: true, filename: true } },
        },
      },
    },
  })

  // Group by teachingTaskId
  const taskMap = new Map<number, typeof allTaskClasses>()
  for (const tc of allTaskClasses) {
    const tid = tc.teachingTaskId
    if (!taskMap.has(tid)) taskMap.set(tid, [])
    taskMap.get(tid)!.push(tc)
  }

  const allCrossYearTasks: CrossYearTask[] = []

  for (const [taskId, tcs] of taskMap) {
    const task = tcs[0].teachingTask
    const classGroupNames = task.taskClasses.map(t => t.classGroup.name)
    const classGroupIds = task.taskClasses.map(t => t.classGroup.id)
    const involvedYears = [...new Set(classGroupNames.map(extractYear).filter(Boolean))] as string[]

    if (involvedYears.length <= 1) continue

    const cls = classifyCrossYear(task.course.name, classGroupNames)
    const requiredStudents = task.taskClasses.reduce((sum, t) => {
      // re-query studentCount from the full data
      const cg = tcs.find(tc => tc.classGroupId === t.classGroupId)
      return sum + ((cg?.classGroup.studentCount) ?? 50)
    }, 0)

    allCrossYearTasks.push({
      teachingTaskId: taskId,
      courseName: task.course.name,
      teacherName: task.teacher?.name ?? null,
      classGroupNames,
      classGroupIds,
      involvedYears,
      classGroupCount: classGroupNames.length,
      requiredStudents,
      remark: task.remark,
      weekType: task.weekType,
      startWeek: task.startWeek,
      endWeek: task.endWeek,
      importBatchId: task.importBatchId,
      classification: cls.classification,
      suspiciousReason: cls.reason,
    })
  }

  // Sort by classification severity
  const severity: Record<string, number> = {
    'SUSPICIOUS_CROSS_TRACK_MERGE': 0,
    'SUSPICIOUS_CROSS_YEAR_MERGE': 1,
    'UNKNOWN_NEEDS_SOURCE_CHECK': 2,
  }
  allCrossYearTasks.sort((a, b) => (severity[a.classification] ?? 9) - (severity[b.classification] ?? 9))

  const suspiciousCount = allCrossYearTasks.filter(t => t.classification.startsWith('SUSPICIOUS')).length
  const unknownCount = allCrossYearTasks.filter(t => t.classification === 'UNKNOWN_NEEDS_SOURCE_CHECK').length

  console.log(`Global cross-year TeachingTasks: ${allCrossYearTasks.length}`)
  console.log(`  SUSPICIOUS: ${suspiciousCount}`)
  console.log(`  UNKNOWN_NEEDS_SOURCE_CHECK: ${unknownCount}\n`)

  // Top 20 suspicious
  const top20 = allCrossYearTasks.filter(t => t.classification.startsWith('SUSPICIOUS')).slice(0, 20)
  if (top20.length > 0) {
    console.log('Top suspicious cross-year tasks:')
    for (const t of top20) {
      console.log(`  [${t.teachingTaskId}] ${t.courseName} | ${t.teacherName ?? '(无)'} | years: ${t.involvedYears.join('+')} | classes: ${t.classGroupNames.join(', ')} | ${t.classification}`)
    }
    console.log()
  }

  // ── Step 4: taskKey discrepancy check ──
  // Check if prepareRecords taskKey (no remark) vs dry-run taskKey (with remark) causes different grouping
  console.log('=== taskKey Discrepancy Check ===')
  // Group tasks by (courseId, teacherId, weekType, startWeek, endWeek) WITHOUT remark
  const tasksByBaseKey = new Map<string, typeof targetTaskClasses[0]['teachingTask'][]>()
  const allTasks = await prisma.teachingTask.findMany({
    include: { course: true, teacher: true, taskClasses: { include: { classGroup: true } } },
  })

  for (const task of allTasks) {
    const baseKey = [task.courseId, task.teacherId ?? 'NULL', task.weekType, task.startWeek, task.endWeek].join('|')
    if (!tasksByBaseKey.has(baseKey)) tasksByBaseKey.set(baseKey, [])
    tasksByBaseKey.get(baseKey)!.push(task as any)
  }

  let remarkCollisionCount = 0
  const remarkCollisionExamples: string[] = []
  for (const [baseKey, tasks] of tasksByBaseKey) {
    if (tasks.length <= 1) continue
    const remarks = [...new Set(tasks.map(t => t.remark ?? ''))]
    if (remarks.length > 1) {
      remarkCollisionCount++
      if (remarkCollisionExamples.length < 10) {
        const t = tasks[0]
        remarkCollisionExamples.push(
          `course="${t.course.name}" teacher="${t.teacher?.name ?? '(无)'}" remarks=[${remarks.map(r => `"${r}"`).join(', ')}] taskIds=[${tasks.map(t => t.id).join(', ')}]`
        )
      }
    }
  }
  console.log(`Tasks sharing base key (course+teacher+week) but differing remark: ${remarkCollisionCount}`)
  if (remarkCollisionExamples.length > 0) {
    console.log('Examples:')
    for (const ex of remarkCollisionExamples) console.log(`  ${ex}`)
  }
  console.log()

  // ── Step 5: HC3/HC4 impact estimate ──
  // Load scheduler data to estimate conflicts
  console.log('=== HC3/HC4 Impact Estimate ===')

  // Get all schedule slots with full task info
  const allSlots = await prisma.scheduleSlot.findMany({
    include: {
      teachingTask: {
        include: {
          course: true,
          teacher: true,
          taskClasses: { include: { classGroup: true } },
        },
      },
      room: true,
    },
  })

  // HC3: Class conflict - same class, same day+slot, different tasks
  const classSlotMap = new Map<string, { taskId: number; courseName: string; classGroupNames: string[] }[]>()
  for (const slot of allSlots) {
    for (const tc of slot.teachingTask.taskClasses) {
      const key = `${tc.classGroupId}|${slot.dayOfWeek}|${slot.slotIndex}`
      if (!classSlotMap.has(key)) classSlotMap.set(key, [])
      classSlotMap.get(key)!.push({
        taskId: slot.teachingTaskId,
        courseName: slot.teachingTask.course.name,
        classGroupNames: slot.teachingTask.taskClasses.map(t => t.classGroup.name),
      })
    }
  }

  let hc3Total = 0
  let hc3Suspicious = 0
  let hc3TargetClass = 0
  const hc3Examples: string[] = []

  for (const [key, entries] of classSlotMap) {
    if (entries.length <= 1) continue
    // Count unique task pairs as conflicts
    const uniqueTasks = [...new Set(entries.map(e => e.taskId))]
    if (uniqueTasks.length <= 1) continue
    hc3Total += uniqueTasks.length - 1

    const classGroupId = parseInt(key.split('|')[0])
    const isTargetClass = entries.some(e => e.classGroupNames.includes(TARGET_CLASS))
    if (isTargetClass) hc3TargetClass++

    const hasSuspicious = entries.some(e => {
      const years = [...new Set(e.classGroupNames.map(extractYear).filter(Boolean))]
      return years.length > 1
    })
    if (hasSuspicious) {
      hc3Suspicious++
      if (hc3Examples.length < 10) {
        const [cgId, dow, si] = key.split('|')
        hc3Examples.push(`classGroupId=${cgId} day=${dow} slot=${si}: ${entries.map(e => `[${e.taskId}]${e.courseName}`).join(' vs ')}`)
      }
    }
  }

  console.log(`HC3 (class conflict) total: ${hc3Total}`)
  console.log(`HC3 involving target class: ${hc3TargetClass}`)
  console.log(`HC3 involving suspicious cross-year: ${hc3Suspicious}`)
  if (hc3Examples.length > 0) {
    console.log('HC3 suspicious examples:')
    for (const ex of hc3Examples) console.log(`  ${ex}`)
  }
  console.log()

  // HC4: Capacity - room capacity < required students
  let hc4Total = 0
  let hc4Suspicious = 0
  let hc4TargetClass = 0
  const hc4Examples: string[] = []

  for (const slot of allSlots) {
    if (!slot.room) continue
    const task = slot.teachingTask
    const requiredStudents = task.taskClasses.reduce((sum, tc) => sum + (tc.classGroup.studentCount ?? 50), 0)
    if (requiredStudents > slot.room.capacity) {
      hc4Total++
      const classGroupNames = task.taskClasses.map(tc => tc.classGroup.name)
      const isTargetClass = classGroupNames.includes(TARGET_CLASS)
      if (isTargetClass) hc4TargetClass++

      const years = [...new Set(classGroupNames.map(extractYear).filter(Boolean))]
      if (years.length > 1) {
        hc4Suspicious++
        if (hc4Examples.length < 10) {
          hc4Examples.push(`[${task.id}] ${task.course.name} room=${slot.room.name}(cap=${slot.room.capacity}) required=${requiredStudents} classes=${classGroupNames.join(',')}`)
        }
      }
    }
  }

  console.log(`HC4 (capacity) total: ${hc4Total}`)
  console.log(`HC4 involving target class: ${hc4TargetClass}`)
  console.log(`HC4 involving suspicious cross-year: ${hc4Suspicious}`)
  if (hc4Examples.length > 0) {
    console.log('HC4 suspicious examples:')
    for (const ex of hc4Examples) console.log(`  ${ex}`)
  }
  console.log()

  // ── Step 6: Build report data ──
  const report = {
    generatedAt: new Date().toISOString(),
    phase: 'K9-DQ-1',
    targetClassGroup: {
      id: targetClass.id,
      name: targetClass.name,
    },
    summary: {
      targetTeachingTaskCount: targetTasks.length,
      suspiciousCrossYearTaskCount: suspiciousInTarget.length,
      allCrossYearTaskCount: allCrossYearTasks.length,
      suspiciousCrossTrackTaskCount: allCrossYearTasks.filter(t => t.classification === 'SUSPICIOUS_CROSS_TRACK_MERGE').length,
      hc3PossiblyPollutedCount: hc3Suspicious,
      hc4PossiblyPollutedCount: hc4Suspicious,
    },
    targetClassTasks: targetTasks,
    allCrossYearTasks: allCrossYearTasks,
    matchingLogicAudit: [{
      finding: 'findMergedClassNames() does NOT filter by grade year',
      file: 'src/lib/import/importer.ts',
      functions: ['parseRemarkKeywords', 'findMergedClassNames'],
      risk: 'MEDIUM-HIGH',
      detail: 'When resolving 合班 remarks, character-subsequence matching considers ALL class groups regardless of year. A keyword like "森防" matches both "2024级森林草原防火技术1班" and "2025级森林草原防火技术1班".',
    }, {
      finding: 'taskKey in prepareRecords omits remark field',
      file: 'src/lib/import/importer.ts',
      functions: ['prepareRecords'],
      risk: 'LOW (separate issue)',
      detail: 'prepareRecords builds taskKey without remark, but dry-run builds it with remark. This could cause different grouping but is a separate issue from cross-year merge.',
    }],
    frontendFilterAudit: [{
      finding: 'API returns ALL taskClasses per TeachingTask, not just filtered class',
      file: 'src/app/api/schedule/route.ts',
      functions: ['GET handler'],
      risk: 'CONFIRMED BUG (display)',
      detail: 'When filtering by class, the API correctly narrows ScheduleSlots but eagerly loads ALL taskClasses. Line 73 maps all taskClasses into classNames. This means even if DB data is correct, the card shows all 合班 classes.',
    }],
    hcImpactEstimate: {
      hc3: { total: hc3Total, involvingTargetClass: hc3TargetClass, involvingSuspiciousCrossYear: hc3Suspicious },
      hc4: { total: hc4Total, involvingTargetClass: hc4TargetClass, involvingSuspiciousCrossYear: hc4Suspicious },
      remarkCollisions: remarkCollisionCount,
    },
    rootCauseHypothesis: [
      'IMPORT_MATCHING: findMergedClassNames() matches across grade years via includes() and character-subsequence matching',
      'FRONTEND_DISPLAY: API returns all taskClasses regardless of filter, showing unrelated 合班 classes on cards',
      'DATA: Some cross-year merges may be legitimate (public courses) but others are false positives from keyword matching',
    ],
    recommendedNextPhase: 'K9-DQ-2-MATCHING',
  }

  // Write JSON report
  const jsonPath = join(process.cwd(), 'docs', 'classgroup-data-quality-report.json')
  writeFileSync(jsonPath, JSON.stringify(report, null, 2), 'utf-8')
  console.log(`JSON report written to: ${jsonPath}`)

  // Write Markdown report
  const mdLines: string[] = []
  mdLines.push('# ClassGroup Data Quality Report - K9-DQ-1')
  mdLines.push('')
  mdLines.push(`Generated: ${report.generatedAt}`)
  mdLines.push('')
  mdLines.push('## 1. Executive Summary')
  mdLines.push('')
  mdLines.push(`Target class: **${TARGET_CLASS}** (id=${targetClass.id})`)
  mdLines.push('')
  mdLines.push(`- TeachingTasks for target class: **${targetTasks.length}**`)
  mdLines.push(`- Suspicious cross-year in target: **${suspiciousInTarget.length}**`)
  mdLines.push(`- Global cross-year TeachingTasks: **${allCrossYearTasks.length}**`)
  mdLines.push(`- Suspicious cross-year (global): **${allCrossYearTasks.filter(t => t.classification === 'SUSPICIOUS_CROSS_YEAR_MERGE').length}**`)
  mdLines.push(`- Suspicious cross-track (global): **${allCrossYearTasks.filter(t => t.classification === 'SUSPICIOUS_CROSS_TRACK_MERGE').length}**`)
  mdLines.push(`- HC3 possibly polluted: **${hc3Suspicious}**`)
  mdLines.push(`- HC4 possibly polluted: **${hc4Suspicious}**`)
  mdLines.push('')

  mdLines.push('## 2. Target ClassGroup Binding Audit')
  mdLines.push('')
  mdLines.push(`All ${targetTasks.length} TeachingTasks bound to "${TARGET_CLASS}":`)
  mdLines.push('')
  mdLines.push('| taskId | course | teacher | classGroups | crossYear | suspicious |')
  mdLines.push('|--------|--------|---------|-------------|-----------|------------|')
  for (const t of targetTasks) {
    mdLines.push(`| ${t.teachingTaskId} | ${t.courseName} | ${t.teacherName ?? '(无)'} | ${t.classGroupNames.join(', ')} | ${t.isCrossYear} | ${t.suspicious ? t.suspiciousReason : 'false'} |`)
  }
  mdLines.push('')

  mdLines.push('## 3. Cross-Year TeachingTask Audit')
  mdLines.push('')
  mdLines.push(`Total cross-year tasks: ${allCrossYearTasks.length}`)
  mdLines.push('')
  if (allCrossYearTasks.length > 0) {
    mdLines.push('| taskId | course | teacher | years | classes | classification |')
    mdLines.push('|--------|--------|---------|-------|---------|----------------|')
    for (const t of allCrossYearTasks.slice(0, 30)) {
      mdLines.push(`| ${t.teachingTaskId} | ${t.courseName} | ${t.teacherName ?? '(无)'} | ${t.involvedYears.join('+')} | ${t.classGroupNames.join(', ')} | ${t.classification} |`)
    }
    if (allCrossYearTasks.length > 30) mdLines.push(`| ... | ${allCrossYearTasks.length - 30} more | | | | |`)
  }
  mdLines.push('')

  mdLines.push('## 4. Cross-Track Merge Audit')
  mdLines.push('')
  const crossTrack = allCrossYearTasks.filter(t => t.classification === 'SUSPICIOUS_CROSS_TRACK_MERGE')
  mdLines.push(`Suspicious cross-track merges: ${crossTrack.length}`)
  mdLines.push('')

  mdLines.push('## 5. ClassGroup Matching Logic Audit')
  mdLines.push('')
  mdLines.push('### Finding 1: findMergedClassNames() ignores grade year')
  mdLines.push('- **File**: `src/lib/import/importer.ts` lines 145-199')
  mdLines.push('- **Functions**: `parseRemarkKeywords()`, `findMergedClassNames()`')
  mdLines.push('- **Risk**: MEDIUM-HIGH')
  mdLines.push('- **Detail**: When resolving 合班 remarks, character-subsequence matching considers ALL class groups regardless of year. A keyword like "森防" matches both "2024级森林草原防火技术1班" and "2025级森林草原防火技术1班".')
  mdLines.push('')
  mdLines.push('### Finding 2: taskKey omits remark in prepareRecords')
  mdLines.push('- **File**: `src/lib/import/importer.ts` line 299')
  mdLines.push('- **Functions**: `prepareRecords()`')
  mdLines.push('- **Risk**: LOW (separate issue)')
  mdLines.push('- **Detail**: prepareRecords builds taskKey without remark, but dry-run builds it with remark. This could cause different grouping but is a separate issue from cross-year merge.')
  mdLines.push('')

  mdLines.push('## 6. Frontend Filter / Display Audit')
  mdLines.push('')
  mdLines.push('### Finding: API returns ALL taskClasses per TeachingTask')
  mdLines.push('- **File**: `src/app/api/schedule/route.ts` lines 50-53, 73')
  mdLines.push('- **Risk**: CONFIRMED BUG (display layer)')
  mdLines.push('- **Detail**: When filtering by class, the API correctly narrows ScheduleSlots but eagerly loads ALL taskClasses via `include: { taskClasses: { include: { classGroup: true } } }`. Line 73 maps all taskClasses into classNames. This means the card shows ALL 合班 classes, not just the filtered one.')
  mdLines.push('- **Impact**: Even if DB data were correct, the UI would still show other classes in the 合班 field.')
  mdLines.push('')

  mdLines.push('## 7. HC3 / HC4 Impact Estimate')
  mdLines.push('')
  mdLines.push(`| Metric | Total | Target Class | Suspicious Cross-Year |`)
  mdLines.push(`|--------|-------|-------------|----------------------|`)
  mdLines.push(`| HC3 (class conflict) | ${hc3Total} | ${hc3TargetClass} | ${hc3Suspicious} |`)
  mdLines.push(`| HC4 (capacity) | ${hc4Total} | ${hc4TargetClass} | ${hc4Suspicious} |`)
  mdLines.push(`| taskKey remark collisions | ${remarkCollisionCount} | - | - |`)
  mdLines.push('')

  mdLines.push('## 8. Root Cause Hypothesis')
  mdLines.push('')
  mdLines.push('1. **IMPORT_MATCHING (HIGH probability)**: `findMergedClassNames()` matches across grade years via `includes()` and character-subsequence matching. A 2024级 class with remark "与X合班" can pull in 2025级 classes with similar names.')
  mdLines.push('2. **FRONTEND_DISPLAY (CONFIRMED)**: API returns all taskClasses regardless of filter target. This amplifies the perception of cross-year merge even when some merges might be legitimate.')
  mdLines.push('3. **DATA (NEEDS VERIFICATION)**: Some cross-year merges may be legitimate (public courses taught across years), but the current matching logic cannot distinguish legitimate from false merges.')
  mdLines.push('')

  mdLines.push('## 9. Recommended Next Phase')
  mdLines.push('')
  mdLines.push('**K9-DQ-2-MATCHING**')
  mdLines.push('')
  mdLines.push('The primary root cause is in the import matching logic (`findMergedClassNames`), not the frontend display. The frontend bug (showing all taskClasses) is secondary and can be fixed in K9-DQ-2-FRONTEND. The matching fix should:')
  mdLines.push('1. Filter candidates by grade year before doing keyword matching')
  mdLines.push('2. Or require an explicit year-agnostic flag for cross-year 合班')
  mdLines.push('')

  mdLines.push('## 10. Verification Commands')
  mdLines.push('')
  mdLines.push('```bash')
  mdLines.push('npm run diagnose:classgroup-data-quality')
  mdLines.push('```')

  const mdPath = join(process.cwd(), 'docs', 'classgroup-data-quality-report.md')
  writeFileSync(mdPath, mdLines.join('\n'), 'utf-8')
  console.log(`Markdown report written to: ${mdPath}`)

  await prisma.$disconnect()
}

main().catch(e => {
  console.error(e)
  prisma.$disconnect()
  process.exit(1)
})
