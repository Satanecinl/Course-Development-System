import { PrismaClient } from '@prisma/client'
import { confirmImportBatch } from '../src/lib/import/importer'

const prisma = new PrismaClient()

async function main() {
  if (process.env.CONFIRM_IMPORT !== '1') {
    console.log('⚠️  This script mutates the database.')
    console.log('Run with CONFIRM_IMPORT=1 to execute:')
    console.log()
    console.log('  CONFIRM_IMPORT=1 npx tsx scripts/confirm-import-once.ts')
    console.log()
    process.exit(0)
  }

  const batch = await prisma.importBatch.findFirst({
    where: { status: 'pending' },
    orderBy: { createdAt: 'desc' },
  })

  if (!batch) {
    console.log('没有找到 pending 状态的 ImportBatch。')
    console.log('请先通过 /admin/db 上传 .docx 文件生成 pending batch。')
    process.exit(0)
  }

  console.log(`找到 pending ImportBatch: id=${batch.id}\n`)

  // 记录导入前数量
  const before = {
    classGroup: await prisma.classGroup.count(),
    teacher: await prisma.teacher.count(),
    course: await prisma.course.count(),
    room: await prisma.room.count(),
    teachingTask: await prisma.teachingTask.count(),
    teachingTaskClass: await prisma.teachingTaskClass.count(),
    scheduleSlot: await prisma.scheduleSlot.count(),
  }

  console.log('--- Before ---')
  for (const [k, v] of Object.entries(before)) console.log(`  ${k}: ${v}`)
  console.log()

  try {
    // Resolve active semester
    const activeSemester = await prisma.semester.findFirst({ where: { isActive: true } })
    if (!activeSemester) {
      console.error('No active semester found. Please set one active semester.')
      process.exit(1)
    }
    console.log(`Using semester: ${activeSemester.name} (id=${activeSemester.id})\n`)

    const result = await confirmImportBatch(batch.id, 'UPSERT_BY_NATURAL_KEY', activeSemester.id)

    console.log('--- Confirm Result ---')
    console.log(`  success:            ${result.success}`)
    console.log(`  canImport:          ${result.canImport}`)
    console.log(`  createdTaskCount:   ${result.createdTaskCount}`)
    console.log(`  createdSlotCount:   ${result.createdSlotCount}`)
    if (result.blockingReasons.length > 0) {
      console.log('  blockingReasons:')
      for (const r of result.blockingReasons) console.log(`    - ${r}`)
    }
    if (result.warnings.length > 0) {
      console.log('  warnings (first 10):')
      for (const w of result.warnings.slice(0, 10)) console.log(`    - ${w}`)
    }
    console.log()

    // 记录导入后数量
    const after = {
      classGroup: await prisma.classGroup.count(),
      teacher: await prisma.teacher.count(),
      course: await prisma.course.count(),
      room: await prisma.room.count(),
      teachingTask: await prisma.teachingTask.count(),
      teachingTaskClass: await prisma.teachingTaskClass.count(),
      scheduleSlot: await prisma.scheduleSlot.count(),
    }

    console.log('--- After ---')
    for (const [k, v] of Object.entries(after)) console.log(`  ${k}: ${v}`)
    console.log()

    console.log('--- Diff ---')
    for (const k of Object.keys(before) as (keyof typeof before)[]) {
      const diff = after[k] - before[k]
      if (diff !== 0) console.log(`  ${k}: +${diff}`)
    }

    const afterBatch = await prisma.importBatch.findUnique({ where: { id: batch.id } })
    console.log(`\nBatch status: ${afterBatch?.status}`)
    console.log('\nDONE')
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e)
    console.error(`\nImport failed: ${msg}`)
    const afterBatch = await prisma.importBatch.findUnique({ where: { id: batch.id } })
    console.log(`Batch status: ${afterBatch?.status}`)
    process.exit(1)
  } finally {
    await prisma.$disconnect()
  }
}

main()
