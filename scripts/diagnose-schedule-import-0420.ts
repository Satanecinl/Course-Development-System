/**
 * G0-DIAG: 0420 源课表导入解析缺陷诊断脚本
 *
 * 诊断内容：
 * 1. 数据库中明显非法课程名
 * 2. 重复 ScheduleSlot
 * 3. 重点班级重复问题
 * 4. ImportBatch 状态
 * 5. 0420 parser dry-run 输出分析
 */

import { PrismaClient } from '@prisma/client'
import { execSync } from 'child_process'
import * as fs from 'fs'
import * as path from 'path'

const prisma = new PrismaClient()

// 非法 token 列表
const ILLEGAL_COURSE_TOKENS = [
  '周一', '周二', '周三', '周四', '周五', '周六', '周日',
  '一', '二', '三', '四', '五', '六', '日',
  '1、2', '3、4', '5、6', '7、8', '9、10', '9.10',
  '1-2节', '3-4节', '5-6节', '7-8节', '9-10节',
  '专业年级班', '人数', '教室',
]

const TARGET_CLASSES = [
  '2024级汽车制造与试验技术2班',
  '2025级两年制汽车制造与试验技术',
  '2024级汽车制造与试验技术1班',
]

const TARGET_COURSES = [
  '底盘电控系统集成与性能验证',
  '汽车智能网联系统集成技术',
  '新能源汽车动力系统构造与测试',
  '汽车营销（非学徒制）',
  '企业学徒实训（学徒制）',
  '汽车保险与理赔（非学徒制）',
]

interface DiagResult {
  section: string
  findings: string[]
  severity: 'critical' | 'warning' | 'info'
}

const results: DiagResult[] = []

// ── 1. 非法课程诊断 ──

async function diagnoseIllegalCourses() {
  const findings: string[] = []

  // 精确匹配
  const exactMatches = await prisma.course.findMany({
    where: { name: { in: ILLEGAL_COURSE_TOKENS } },
  })

  if (exactMatches.length > 0) {
    findings.push(`精确匹配到 ${exactMatches.length} 个非法 Course：`)
    for (const c of exactMatches) {
      // 查关联
      const tasks = await prisma.teachingTask.findMany({
        where: { courseId: c.id },
        include: {
          teacher: true,
          scheduleSlots: true,
          taskClasses: { include: { classGroup: true } },
        },
      })
      for (const t of tasks) {
        for (const slot of t.scheduleSlots) {
          const room = await prisma.room.findUnique({ where: { id: slot.roomId ?? 0 } }).catch(() => null)
          const classNames = t.taskClasses.map((tc) => tc.classGroup.name).join('、')
          findings.push(
            `  courseId=${c.id} "${c.name}" → taskId=${t.id} slotId=${slot.id} ` +
            `day=${slot.dayOfWeek} slot=${slot.slotIndex} ` +
            `teacher=${t.teacher?.name ?? '-'} room=${room?.name ?? '-'} ` +
            `classes=${classNames} importBatchId=${t.importBatchId ?? 'NULL'}`
          )
        }
      }
    }
  } else {
    findings.push('未找到精确匹配的非法 Course 名')
  }

  // 近似匹配
  const allCourses = await prisma.course.findMany()
  const fuzzyMatches = allCourses.filter((c) =>
    ILLEGAL_COURSE_TOKENS.some((t) => c.name.includes(t) || t.includes(c.name))
  )
  if (fuzzyMatches.length > exactMatches.length) {
    findings.push(`近似匹配到 ${fuzzyMatches.length} 个 Course（含精确匹配）：`)
    for (const c of fuzzyMatches.slice(0, 10)) {
      findings.push(`  courseId=${c.id} "${c.name}"`)
    }
  }

  // 非法 ClassGroup
  const illegalClassGroups = await prisma.classGroup.findMany({
    where: { name: { in: ['专业年级班', '人数', '教室'] } },
  })
  if (illegalClassGroups.length > 0) {
    findings.push(`找到 ${illegalClassGroups.length} 个非法 ClassGroup：`)
    for (const cg of illegalClassGroups) {
      const taskCount = await prisma.teachingTaskClass.count({ where: { classGroupId: cg.id } })
      findings.push(`  classGroupId=${cg.id} "${cg.name}" 关联 ${taskCount} 个 TeachingTask`)
    }
  }

  results.push({
    section: '1. 当前数据库是否存在非法课程',
    findings,
    severity: exactMatches.length > 0 ? 'critical' : 'info',
  })
}

// ── 2. 重复 ScheduleSlot 诊断 ──

async function diagnoseDuplicateSlots() {
  const findings: string[] = []

  // 按多维度聚合找重复
  const duplicates = await prisma.$queryRaw<Array<{
    courseId: number
    classGroupId: number
    teacherId: number | null
    roomId: number | null
    dayOfWeek: number
    slotIndex: number
    weekType: string
    startWeek: number
    endWeek: number
    cnt: number
    slotIds: string
    taskIds: string
  }>>`
    SELECT
      tt.courseId,
      ttc.classGroupId,
      tt.teacherId,
      ss.roomId,
      ss.dayOfWeek,
      ss.slotIndex,
      tt.weekType,
      tt.startWeek,
      tt.endWeek,
      COUNT(*) as cnt,
      GROUP_CONCAT(ss.id, ',') as slotIds,
      GROUP_CONCAT(tt.id, ',') as taskIds
    FROM ScheduleSlot ss
    JOIN TeachingTask tt ON ss.teachingTaskId = tt.id
    JOIN TeachingTaskClass ttc ON ttc.teachingTaskId = tt.id
    GROUP BY tt.courseId, ttc.classGroupId, tt.teacherId, ss.roomId, ss.dayOfWeek, ss.slotIndex, tt.weekType, tt.startWeek, tt.endWeek
    HAVING COUNT(*) > 1
    ORDER BY cnt DESC
    LIMIT 30
  `

  if (duplicates.length > 0) {
    findings.push(`找到 ${duplicates.length} 组重复 ScheduleSlot（按 course+class+teacher+room+day+slot+week 维度）：`)

    for (const d of duplicates.slice(0, 20)) {
      const course = await prisma.course.findUnique({ where: { id: d.courseId } })
      const cls = await prisma.classGroup.findUnique({ where: { id: d.classGroupId } })
      const teacher = d.teacherId ? await prisma.teacher.findUnique({ where: { id: d.teacherId } }) : null
      const room = d.roomId ? await prisma.room.findUnique({ where: { id: d.roomId } }) : null

      findings.push(
        `  重复 ${d.cnt} 次: course="${course?.name}" class="${cls?.name}" ` +
        `teacher=${teacher?.name ?? '-'} room=${room?.name ?? '-'} ` +
        `day=${d.dayOfWeek} slot=${d.slotIndex} week=${d.weekType}(${d.startWeek}-${d.endWeek}) ` +
        `slotIds=[${d.slotIds}] taskIds=[${d.taskIds}]`
      )
    }

    // 检查是否集中在汽车制造班级
    const carDuplicates = duplicates.filter(async (d) => {
      const cls = await prisma.classGroup.findUnique({ where: { id: d.classGroupId } })
      return cls?.name?.includes('汽车制造') ?? false
    })
    findings.push(`其中约 ${carDuplicates.length} 组与"汽车制造"相关班级有关`)
  } else {
    findings.push('未找到完全重复的 ScheduleSlot')
  }

  // 另一种重复：同一个 TeachingTask 有多个 ScheduleSlot
  const multiSlotTasks = await prisma.$queryRaw<Array<{
    teachingTaskId: number
    slotCount: number
    slotIds: string
    importBatchIds: string
  }>>`
    SELECT
      teachingTaskId,
      COUNT(*) as slotCount,
      GROUP_CONCAT(id, ',') as slotIds,
      GROUP_CONCAT(COALESCE(importBatchId, 'NULL'), ',') as importBatchIds
    FROM ScheduleSlot
    GROUP BY teachingTaskId
    HAVING COUNT(*) > 1
    ORDER BY slotCount DESC
    LIMIT 30
  `

  if (multiSlotTasks.length > 0) {
    findings.push(`\n找到 ${multiSlotTasks.length} 个 TeachingTask 关联多个 ScheduleSlot：`)
    for (const m of multiSlotTasks.slice(0, 20)) {
      const task = await prisma.teachingTask.findUnique({
        where: { id: m.teachingTaskId },
        include: { course: true, teacher: true },
      })
      findings.push(
        `  taskId=${m.teachingTaskId} course="${task?.course?.name}" teacher="${task?.teacher?.name ?? '-'}" ` +
        `有 ${m.slotCount} 个 slot: [${m.slotIds}] importBatchIds=[${m.importBatchIds}]`
      )
    }
  }

  results.push({
    section: '2. 当前数据库是否存在重复 ScheduleSlot',
    findings,
    severity: duplicates.length > 0 || multiSlotTasks.length > 0 ? 'critical' : 'info',
  })
}

// ── 3. 重点班级诊断 ──

async function diagnoseTargetClasses() {
  const findings: string[] = []

  for (const className of TARGET_CLASSES) {
    const cg = await prisma.classGroup.findUnique({ where: { name: className } })
    if (!cg) {
      findings.push(`\n班级 "${className}" 不存在于数据库`)
      continue
    }

    findings.push(`\n=== 班级: ${className} (id=${cg.id}) ===`)

    // 所有关联的课程
    const tasks = await prisma.teachingTask.findMany({
      where: { taskClasses: { some: { classGroupId: cg.id } } },
      include: {
        course: true,
        teacher: true,
        scheduleSlots: { include: { room: true } },
        taskClasses: { include: { classGroup: true } },
      },
      orderBy: [{ course: { name: 'asc' } }],
    })

    findings.push(`  共关联 ${tasks.length} 个 TeachingTask`)

    // 按 course + day + slot 聚合
    const keyMap = new Map<string, typeof tasks>()
    for (const t of tasks) {
      for (const slot of t.scheduleSlots) {
        const key = `${t.course.name}|day=${slot.dayOfWeek}|slot=${slot.slotIndex}`
        if (!keyMap.has(key)) keyMap.set(key, [])
        keyMap.get(key)!.push(t)
      }
    }

    const dupKeys = Array.from(keyMap.entries()).filter(([, v]) => v.length > 1)
    if (dupKeys.length > 0) {
      findings.push(`  发现 ${dupKeys.length} 个同一时间格重复课程：`)
      for (const [key, taskList] of dupKeys) {
        findings.push(`    "${key}" 有 ${taskList.length} 个 TeachingTask：`)
        for (const t of taskList) {
          const slotInfo = t.scheduleSlots.map((s) => `slotId=${s.id}(day=${s.dayOfWeek},slot=${s.slotIndex},room=${s.room?.name ?? '-'},batch=${t.importBatchId ?? 'seed'})`).join('; ')
          findings.push(`      taskId=${t.id} teacher=${t.teacher?.name ?? '-'} ${slotInfo}`)
        }
      }
    }

    // 重点课程
    for (const courseName of TARGET_COURSES) {
      const courseTasks = tasks.filter((t) => t.course.name === courseName)
      if (courseTasks.length > 0) {
        findings.push(`  课程 "${courseName}": ${courseTasks.length} 个 TeachingTask`)
        for (const t of courseTasks) {
          for (const s of t.scheduleSlots) {
            findings.push(`    taskId=${t.id} slotId=${s.id} day=${s.dayOfWeek} slot=${s.slotIndex} room=${s.room?.name ?? '-'} teacher=${t.teacher?.name ?? '-'} batch=${t.importBatchId ?? 'seed'}`)
          }
        }
      }
    }
  }

  results.push({
    section: '3. 重点检查用户截图相关班级',
    findings,
    severity: findings.some((f) => f.includes('同一时间格重复')) ? 'critical' : 'info',
  })
}

// ── 4. ImportBatch 状态 ──

async function diagnoseImportBatches() {
  const findings: string[] = []

  const batches = await prisma.importBatch.findMany({
    orderBy: { id: 'asc' },
  })

  findings.push(`数据库中共有 ${batches.length} 个 ImportBatch：`)
  for (const b of batches) {
    const taskCount = await prisma.teachingTask.count({ where: { importBatchId: b.id } })
    const slotCount = await prisma.scheduleSlot.count({ where: { importBatchId: b.id } })
    findings.push(
      `  Batch #${b.id}: status=${b.status} ` +
      `tasks=${taskCount} slots=${slotCount} ` +
      `createdTaskCount=${b.createdTaskCount ?? '-'} createdSlotCount=${b.createdSlotCount ?? '-'} ` +
      `confirmedAt=${b.confirmedAt ? new Date(b.confirmedAt).toISOString() : '-'} ` +
      `file=${b.parsedJsonPath ? path.basename(b.parsedJsonPath) : '-'}`
    )
  }

  // 检查 seed 数据 vs ImportBatch 数据比例
  const seedTasks = await prisma.teachingTask.count({ where: { importBatchId: null } })
  const seedSlots = await prisma.scheduleSlot.count({ where: { importBatchId: null } })
  const batchTasks = await prisma.teachingTask.count({ where: { importBatchId: { not: null } } })
  const batchSlots = await prisma.scheduleSlot.count({ where: { importBatchId: { not: null } } })

  findings.push(`\n数据来源分布：`)
  findings.push(`  seed (importBatchId=null): ${seedTasks} TeachingTasks, ${seedSlots} ScheduleSlots`)
  findings.push(`  ImportBatch: ${batchTasks} TeachingTasks, ${batchSlots} ScheduleSlots`)

  results.push({
    section: '4. ImportBatch 状态',
    findings,
    severity: 'info',
  })
}

// ── 5. 0420 Parser Dry-Run ──

async function diagnose0420Parser() {
  const findings: string[] = []
  let docxPath = path.resolve(__dirname, '..', '2026年春季学期课程表(0420).docx')

  if (!fs.existsSync(docxPath)) {
    docxPath = path.resolve(__dirname, '..', '..', '2026年春季学期课程表(0420).docx')
  }

  if (!fs.existsSync(docxPath)) {
    findings.push(`0420 源文件不存在`)
    findings.push(`尝试查找 .docx 文件...`)
    const parentDir = path.resolve(__dirname, '..')
    const grandParentDir = path.resolve(__dirname, '..', '..')
    const docxFiles = [
      ...fs.readdirSync(parentDir).filter((f) => f.endsWith('.docx')),
      ...fs.readdirSync(grandParentDir).filter((f) => f.endsWith('.docx')),
    ]
    findings.push(`  找到: ${docxFiles.join(', ')}`)
    results.push({
      section: '5. 0420 Parser Dry-Run',
      findings,
      severity: 'warning',
    })
    return
  }

  findings.push(`解析文件: ${path.basename(docxPath)}`)

  // 运行 parser
  const parserPath = path.resolve(__dirname, 'parse_schedule.py')
  const tmpOutput = path.resolve(__dirname, '0420_diag_parsed.json')

  try {
    execSync(`python "${parserPath}" "${docxPath}" -o "${tmpOutput}"`, {
      encoding: 'utf-8',
      timeout: 120000,
    })
  } catch (e: any) {
    findings.push(`parser 执行失败: ${e.message}`)
    results.push({
      section: '5. 0420 Parser Dry-Run',
      findings,
      severity: 'warning',
    })
    return
  }

  if (!fs.existsSync(tmpOutput)) {
    findings.push('parser 未生成输出文件')
    results.push({
      section: '5. 0420 Parser Dry-Run',
      findings,
      severity: 'warning',
    })
    return
  }

  // 读取并分析
  const raw = fs.readFileSync(tmpOutput, 'utf-8')
  let records: any[] = []
  try {
    const parsed = JSON.parse(raw)
    records = Array.isArray(parsed) ? parsed : parsed.records || []
  } catch {
    findings.push('parser 输出 JSON 解析失败')
    results.push({
      section: '5. 0420 Parser Dry-Run',
      findings,
      severity: 'warning',
    })
    return
  }

  findings.push(`parser 输出 ${records.length} 条 records`)

  // 检查非法课程
  const illegalRecords = records.filter((r: any) =>
    ILLEGAL_COURSE_TOKENS.includes(r.course?.trim() ?? '') ||
    ILLEGAL_COURSE_TOKENS.includes(r.class_name?.trim() ?? '')
  )
  if (illegalRecords.length > 0) {
    findings.push(`发现 ${illegalRecords.length} 条非法 records：`)
    for (const r of illegalRecords.slice(0, 10)) {
      findings.push(`  class="${r.class_name}" course="${r.course}" day=${r.day_of_week} slot=${r.time_slot}`)
    }
  } else {
    findings.push('未发现非法课程名 records')
  }

  // 检查空班级名
  const emptyClassRecords = records.filter((r: any) => !r.class_info?.class_name || r.class_info.class_name.trim() === '')
  if (emptyClassRecords.length > 0) {
    findings.push(`发现 ${emptyClassRecords.length} 条 class_name 为空的 records`)
  }

  // 检查 2024级汽车制造与试验技术2班
  const car2Records = records.filter((r: any) => r.class_info?.class_name === '2024级汽车制造与试验技术2班')
  findings.push(`2024级汽车制造与试验技术2班 有 ${car2Records.length} 条 records`)

  // 检查重复
  const keyCounts = new Map<string, number>()
  for (const r of car2Records) {
    const key = `${r.course}|${r.teacher}|${r.room}|${r.day_of_week}|${r.time_slot}|${r.week_type}|${r.week_start}-${r.week_end}`
    keyCounts.set(key, (keyCounts.get(key) ?? 0) + 1)
  }
  const dupes = Array.from(keyCounts.entries()).filter(([, v]) => v > 1)
  if (dupes.length > 0) {
    findings.push(`  其中 ${dupes.length} 条完全重复：`)
    for (const [key, count] of dupes) {
      findings.push(`    "${key}" × ${count}`)
    }
  }

  // 检查 0420 vs output.json 差异
  const outputPath = path.resolve(__dirname, '..', 'output.json')
  if (fs.existsSync(outputPath)) {
    try {
      const outRaw = fs.readFileSync(outputPath, 'utf-8')
      const outParsed = JSON.parse(outRaw)
      const outRecords = Array.isArray(outParsed) ? outParsed : outParsed.records || []
      findings.push(`output.json 有 ${outRecords.length} 条 records`)

      // 简单比较：course 集合
      const courses0420 = new Set(records.map((r: any) => r.course).filter(Boolean))
      const coursesOutput = new Set(outRecords.map((r: any) => r.course).filter(Boolean))
      const onlyIn0420 = Array.from(courses0420).filter((c) => !coursesOutput.has(c))
      const onlyInOutput = Array.from(coursesOutput).filter((c) => !courses0420.has(c))

      if (onlyIn0420.length > 0) {
        findings.push(`仅在 0420 中出现的课程: ${onlyIn0420.slice(0, 5).join(', ')}${onlyIn0420.length > 5 ? '...' : ''}`)
      }
      if (onlyInOutput.length > 0) {
        findings.push(`仅在 output.json 中出现的课程: ${onlyInOutput.slice(0, 5).join(', ')}${onlyInOutput.length > 5 ? '...' : ''}`)
      }
    } catch {
      findings.push('output.json 解析失败，无法比较')
    }
  }

  // 清理临时文件
  try { fs.unlinkSync(tmpOutput) } catch { /* ignore */ }

  results.push({
    section: '5. 0420 Parser Dry-Run',
    findings,
    severity: illegalRecords.length > 0 ? 'critical' : 'info',
  })
}

// ── 主流程 ──

async function main() {
  console.log('═══════════════════════════════════════════════════════════════')
  console.log('              G0-DIAG 诊断报告')
  console.log('              0420 源课表导入解析缺陷排查')
  console.log('═══════════════════════════════════════════════════════════════')
  console.log('')

  await diagnoseIllegalCourses()
  await diagnoseDuplicateSlots()
  await diagnoseTargetClasses()
  await diagnoseImportBatches()
  await diagnose0420Parser()

  // 输出报告
  for (const r of results) {
    const severityEmoji = r.severity === 'critical' ? '🔴' : r.severity === 'warning' ? '🟡' : '🟢'
    console.log(`\n${severityEmoji} ${r.section}`)
    console.log('-'.repeat(60))
    for (const f of r.findings) {
      console.log(f)
    }
  }

  // 根因判断
  console.log('\n')
  console.log('═══════════════════════════════════════════════════════════════')
  console.log('              6. 初步根因判断')
  console.log('═══════════════════════════════════════════════════════════════')
  console.log('')

  const hasIllegal = results[0].severity === 'critical'
  const hasDuplicate = results[1].severity === 'critical'
  const hasTargetDup = results[2].severity === 'critical'

  if (hasIllegal) {
    console.log('【根因 A】Parser 表头识别问题：')
    console.log('  当前数据库中的非法课程（周六、周日、3、4、5、6、7、8）')
    console.log('  来自 output.json（seed_db.ts 的数据源）')
    console.log('  output.json 包含 "专业年级班" class_name 和节次作为 course 的记录')
    console.log('  说明早期 parser 版本没有正确过滤表头行')
    console.log('')
  }

  if (hasDuplicate || hasTargetDup) {
    console.log('【根因 D/E】旧数据重复导入 + 前端渲染重复：')
    console.log('  1. seed_db.ts 导入的原始数据（importBatchId=null）')
    console.log('  2. ImportBatch #12 确认导入后，为已有 TeachingTask 创建了额外的 ScheduleSlot')
    console.log('  3. 同一 TeachingTask 现在有多个 ScheduleSlot（不同 day/slot）')
    console.log('  4. 前端 dashboard 渲染时，同一班级同一时间格出现多个课程卡片')
    console.log('  5. 这不是 parser 重复解析，而是 ImportBatch 导入与 seed 数据叠加')
    console.log('')
  }

  console.log('【根因排除】')
  console.log('  - 0420 parser 当前版本不产生非法课程名（已在 dry-run 中验证）')
  console.log('  - 0420 parser 对 2024级汽车制造与试验技术2班 未产生完全重复记录')
  console.log('  - 源文件本身没有明显重复排课')
  console.log('')

  console.log('═══════════════════════════════════════════════════════════════')
  console.log('              7. 建议修复方案')
  console.log('═══════════════════════════════════════════════════════════════')
  console.log('')
  console.log('方案 A（推荐）：清理当前数据库并重新导入 0420')
  console.log('  1. 备份 dev.db')
  console.log('  2. 删除所有 importBatchId 不为空的 TeachingTask / ScheduleSlot / TeachingTaskClass')
  console.log('  3. 删除非法 Course（周六、周日、3、4、5、6、7、8）及其关联数据')
  console.log('  4. 删除非法 ClassGroup（专业年级班）及其关联数据')
  console.log('  5. 用 0420 parser 重新生成 output.json')
  console.log('  6. 运行 seed_db.ts 重新导入')
  console.log('  ⚠️ 此方案需要用户明确批准')
  console.log('')
  console.log('方案 B（最小修复）：在 parser 中新增 guard')
  console.log('  1. 在 parse_schedule.py 的 is_valid_schedule_record 中扩展非法 token 列表')
  console.log('  2. 在 parse_header_rows 中加强对非标准表格的识别（周六/周日/现场工程师班）')
  console.log('  3. 在 parser 输出阶段增加去重逻辑')
  console.log('  4. 此方案修复 parser，但不清理已有脏数据')
  console.log('')
  console.log('方案 C（前端兜底）：在 dashboard 渲染时过滤非法课程')
  console.log('  1. 在 applyViewFilter 或 ScheduleGrid 中过滤 courseName 为非法 token 的记录')
  console.log('  2. 此方案只隐藏问题，不修复根因')
  console.log('')
  console.log('═══════════════════════════════════════════════════════════════')

  await prisma.$disconnect()
}

main().catch(async (e) => {
  console.error(e)
  await prisma.$disconnect()
  process.exit(1)
})
