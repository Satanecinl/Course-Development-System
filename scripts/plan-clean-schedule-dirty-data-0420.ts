/**
 * G0-FIX-A: Dry-run 清理计划脚本
 *
 * 本脚本只输出清理计划，不执行任何删除操作。
 * 所有删除操作必须由用户明确批准后在 G0-FIX-B 阶段执行。
 */

import { PrismaClient } from '@prisma/client'

const prisma = new PrismaClient()

const ILLEGAL_COURSES = ['周六', '周日', '3、4', '5、6', '7、8']

interface CleanupPlan {
  section: string
  items: string[]
  action: string
  risk: string
}

const plans: CleanupPlan[] = []

// ── 1. 非法课程清理计划 ──

async function planIllegalCourses() {
  const items: string[] = []

  for (const name of ILLEGAL_COURSES) {
    const course = await prisma.course.findUnique({ where: { name } })
    if (!course) {
      items.push(`  [OK] Course "${name}" 不存在于数据库`)
      continue
    }

    const tasks = await prisma.teachingTask.findMany({
      where: { courseId: course.id },
      include: {
        scheduleSlots: true,
        taskClasses: true,
      },
    })

    items.push(`  [DIRTY] Course "${name}" (id=${course.id})：`)
    items.push(`    → ${tasks.length} 个 TeachingTask`)

    let slotCount = 0
    let ttcCount = 0
    const taskIds: number[] = []
    const slotIds: number[] = []

    for (const t of tasks) {
      slotCount += t.scheduleSlots.length
      ttcCount += t.taskClasses.length
      taskIds.push(t.id)
      for (const s of t.scheduleSlots) slotIds.push(s.id)
    }

    items.push(`    → ${slotCount} 个 ScheduleSlot: [${slotIds.join(', ')}]`)
    items.push(`    → ${ttcCount} 个 TeachingTaskClass`)
    items.push(`    → 建议删除 TeachingTask IDs: [${taskIds.join(', ')}]`)
    items.push(`    → 建议删除 Course ID: ${course.id}`)
  }

  plans.push({
    section: '1. 非法课程清理计划',
    items,
    action: 'DELETE TeachingTask + ScheduleSlot + TeachingTaskClass + Course',
    risk: '这些 Course 不是真实课程，删除无业务影响。但需级联删除关联数据。',
  })
}

// ── 2. 重复 ScheduleSlot 清理计划 ──

async function planDuplicateSlots() {
  const items: string[] = []

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
    importBatchIds: string
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
      GROUP_CONCAT(tt.id, ',') as taskIds,
      GROUP_CONCAT(COALESCE(tt.importBatchId, 'NULL'), ',') as importBatchIds
    FROM ScheduleSlot ss
    JOIN TeachingTask tt ON ss.teachingTaskId = tt.id
    JOIN TeachingTaskClass ttc ON ttc.teachingTaskId = tt.id
    GROUP BY tt.courseId, ttc.classGroupId, tt.teacherId, ss.roomId, ss.dayOfWeek, ss.slotIndex, tt.weekType, tt.startWeek, tt.endWeek
    HAVING COUNT(*) > 1
    ORDER BY cnt DESC
    LIMIT 30
  `

  if (duplicates.length === 0) {
    items.push('  [OK] 未发现重复 ScheduleSlot')
  } else {
    items.push(`  [DIRTY] 发现 ${duplicates.length} 组重复 ScheduleSlot：`)

    for (const d of duplicates) {
      const course = await prisma.course.findUnique({ where: { id: d.courseId } })
      const cls = await prisma.classGroup.findUnique({ where: { id: d.classGroupId } })
      const teacher = d.teacherId ? await prisma.teacher.findUnique({ where: { id: d.teacherId } }) : null
      const room = d.roomId ? await prisma.room.findUnique({ where: { id: d.roomId } }) : null

      const slotIdList = d.slotIds.split(',').map(Number)
      const taskIdList = d.taskIds.split(',').map(Number)
      const batchList = d.importBatchIds.split(',')

      // 判断：优先保留 importBatchId 不为 NULL 的（ImportBatch 数据），或保留 ID 最小的
      const hasSeed = batchList.includes('NULL')
      const hasBatch = batchList.some((b) => b !== 'NULL')

      let keepId = slotIdList[0]
      let deleteIds = slotIdList.slice(1)

      if (hasBatch && hasSeed) {
        // 混合情况：建议保留 ImportBatch 的 slot，删除 seed 的重复 slot
        const batchIdx = batchList.findIndex((b) => b !== 'NULL')
        if (batchIdx >= 0) {
          keepId = slotIdList[batchIdx]
          deleteIds = slotIdList.filter((_, i) => i !== batchIdx)
        }
      }

      items.push(`    重复 ${d.cnt} 次: course="${course?.name}" class="${cls?.name}"`)
      items.push(`      teacher=${teacher?.name ?? '-'} room=${room?.name ?? '-'} day=${d.dayOfWeek} slot=${d.slotIndex}`)
      items.push(`      slotIds=[${d.slotIds}] taskIds=[${d.taskIds}] batches=[${d.importBatchIds}]`)
      items.push(`      → 建议保留 slotId=${keepId}`)
      items.push(`      → 建议删除 slotIds=[${deleteIds.join(', ')}]`)

      // 如果删除 seed slot 后 TeachingTask 变为 orphan，标记
      for (const taskId of taskIdList) {
        const taskSlots = await prisma.scheduleSlot.count({ where: { teachingTaskId: taskId } })
        const taskBatch = await prisma.teachingTask.findUnique({ where: { id: taskId }, select: { importBatchId: true } })
        if (taskSlots === 1 && taskBatch?.importBatchId == null) {
          items.push(`      ⚠️ 删除 slot 后 taskId=${taskId} (seed) 将变为 orphan，需级联清理`)
        }
      }
    }
  }

  plans.push({
    section: '2. 重复 ScheduleSlot 清理计划',
    items,
    action: 'DELETE 重复 ScheduleSlot + 可能级联删除 orphan TeachingTask',
    risk: '需仔细判断保留哪条，误删会导致课程消失。建议人工复核每组重复。',
  })
}

// ── 3. ImportBatch 处理建议 ──

async function planImportBatch() {
  const items: string[] = []

  const batch12 = await prisma.importBatch.findUnique({ where: { id: 12 } })
  if (!batch12) {
    items.push('  [INFO] ImportBatch #12 不存在')
    plans.push({ section: '3. ImportBatch 处理建议', items, action: 'N/A', risk: 'N/A' })
    return
  }

  const batch12Tasks = await prisma.teachingTask.count({ where: { importBatchId: 12 } })
  const batch12Slots = await prisma.scheduleSlot.count({ where: { importBatchId: 12 } })

  items.push(`  ImportBatch #12 状态: ${batch12.status}`)
  items.push(`  → ${batch12Tasks} 个 TeachingTasks`)
  items.push(`  → ${batch12Slots} 个 ScheduleSlots`)

  // 检查 rollback 后是否还有 seed 脏数据
  const seedIllegalTasks = await prisma.teachingTask.count({
    where: { importBatchId: null, course: { name: { in: ILLEGAL_COURSES } } },
  })
  const seedIllegalSlots = await prisma.scheduleSlot.count({
    where: { importBatchId: null, teachingTask: { course: { name: { in: ILLEGAL_COURSES } } } },
  })

  items.push(`  → rollback Batch#12 后，seed 中仍有 ${seedIllegalTasks} 个非法 TeachingTask + ${seedIllegalSlots} 个非法 ScheduleSlot`)
  items.push(`  → 结论：rollback Batch#12 不能单独解决全部问题，仍需清理 seed 脏数据`)

  items.push('')
  items.push('  [方案 A] 仅 rollback Batch#12：')
  items.push('    - 删除 56 TeachingTasks + 189 ScheduleSlots')
  items.push('    - 非法课程和重复 slot 中的 seed 部分仍然存在')
  items.push('    - ❌ 不推荐单独使用')

  items.push('')
  items.push('  [方案 B] rollback Batch#12 + 清理 seed 脏数据：')
  items.push('    - rollback Batch#12')
  items.push('    - 删除 seed 中的非法 Course + TeachingTask + ScheduleSlot')
  items.push('    - 删除 seed 中的重复 ScheduleSlot')
  items.push('    - 重新用 0420 parser 输出 seed')
  items.push('    - ⚠️ 操作复杂，容易遗漏')

  items.push('')
  items.push('  [方案 C] 重建 dev.db + 只从 0420 导入：')
  items.push('    - 备份 dev.db')
  items.push('    - npx prisma db push --force-reset')
  items.push('    - 用 0420 parser 生成 output.json')
  items.push('    - 运行 seed_db.ts 导入')
  items.push('    - ✅ 最彻底、最干净的方案')

  plans.push({
    section: '3. ImportBatch 处理建议',
    items,
    action: '用户决策后执行',
    risk: '方案 C 最简单彻底，但会丢失当前数据库中已有的调课记录（ScheduleAdjustment）',
  })
}

// ── 4. 最终推荐的 G0-FIX-B 方案 ──

function printRecommendations() {
  const items: string[] = []

  items.push('')
  items.push('═══════════════════════════════════════════════════════════════')
  items.push('              G0-FIX-B 推荐方案')
  items.push('═══════════════════════════════════════════════════════════════')
  items.push('')
  items.push('【方案 1】备份 → 专用 cleanup 脚本 → 重新导入 0420')
  items.push('  步骤：')
  items.push('    1. cp prisma/dev.db prisma/dev.db.backup-g0')
  items.push('    2. 执行 cleanup 脚本：')
  items.push('       - 删除 ImportBatch #12 数据（56 tasks + 189 slots）')
  items.push('       - 删除 seed 中的非法 Course / TeachingTask / ScheduleSlot')
  items.push('       - 删除 seed 中的重复 ScheduleSlot（保留一条）')
  items.push('    3. python scripts/parse_schedule.py "../2026年春季学期课程表(0420).docx" -o output.json')
  items.push('    4. npx tsx scripts/seed_db.ts')
  items.push('  风险：中等（cleanup 逻辑复杂，可能遗漏）')
  items.push('  推荐度：⭐⭐⭐')
  items.push('')
  items.push('【方案 2】备份 → rollback Batch#12 → 清理 seed 脏数据 → 重新导入')
  items.push('  步骤：')
  items.push('    1. cp prisma/dev.db prisma/dev.db.backup-g0')
  items.push('    2. 调用 rollback API 回滚 Batch#12')
  items.push('    3. 手动清理 seed 中的非法和重复数据')
  items.push('    4. 重新生成 output.json 并 seed')
  items.push('  风险：中等（rollback 后仍需大量手动清理）')
  items.push('  推荐度：⭐⭐')
  items.push('')
  items.push('【方案 3】备份 → 重建 dev.db → 只从当前 0420 源文件导入')
  items.push('  步骤：')
  items.push('    1. cp prisma/dev.db prisma/dev.db.backup-g0')
  items.push('    2. npx prisma db push --force-reset')
  items.push('    3. python scripts/parse_schedule.py "../2026年春季学期课程表(0420).docx" -o output.json')
  items.push('    4. npx tsx scripts/seed_db.ts')
  items.push('  风险：低（操作简单，结果可预期）')
  items.push('  影响：会丢失所有 ScheduleAdjustment 调课记录和 ImportBatch 历史')
  items.push('  推荐度：⭐⭐⭐⭐⭐（如果可接受丢失调课记录）')
  items.push('')
  items.push('【方案 4】前端兜底 + 仅修复代码（不做数据清理）')
  items.push('  步骤：')
  items.push('    1. 在 dashboard 渲染时过滤非法课程和重复 slot')
  items.push('    2. 不清理数据库')
  items.push('  风险：低（不碰数据）')
  items.push('  影响：数据仍脏，调课/导出等功能可能受影响')
  items.push('  推荐度：⭐（仅作为临时应急方案）')
  items.push('')
  items.push('═══════════════════════════════════════════════════════════════')

  return items
}

// ── 主流程 ──

async function main() {
  console.log('═══════════════════════════════════════════════════════════════')
  console.log('              G0-FIX-A Dry-Run 清理计划')
  console.log('              0420 源课表数据基线修复准备')
  console.log('═══════════════════════════════════════════════════════════════')
  console.log('')
  console.log('⚠️  本脚本只输出计划，不执行任何删除操作！')
  console.log('')

  await planIllegalCourses()
  await planDuplicateSlots()
  await planImportBatch()

  for (const p of plans) {
    console.log(`\n📋 ${p.section}`)
    console.log(`   操作: ${p.action}`)
    console.log(`   风险: ${p.risk}`)
    console.log('-'.repeat(60))
    for (const item of p.items) {
      console.log(item)
    }
  }

  const recs = printRecommendations()
  for (const r of recs) {
    console.log(r)
  }

  await prisma.$disconnect()
}

main().catch(async (e) => {
  console.error(e)
  await prisma.$disconnect()
  process.exit(1)
})
