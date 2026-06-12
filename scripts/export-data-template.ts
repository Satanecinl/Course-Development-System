import { PrismaClient } from '@prisma/client'
import * as fs from 'fs'
import * as path from 'path'

const prisma = new PrismaClient()

function resolveExportDir(): string {
  const configured = process.env.DATA_EXPORT_DIR?.trim()
  if (!configured) {
    throw new Error('DATA_EXPORT_DIR is required and must point to a directory outside the repository.')
  }

  const projectRoot = path.resolve(__dirname, '..')
  const outputDir = path.resolve(configured)
  const relative = path.relative(projectRoot, outputDir)
  const isInsideProject =
    relative === '' ||
    (!relative.startsWith(`..${path.sep}`) && relative !== '..' && !path.isAbsolute(relative))

  if (isInsideProject) {
    throw new Error('DATA_EXPORT_DIR must be outside the repository.')
  }

  return outputDir
}

async function exportRoomCapacity(dataDir: string) {
  const rooms = await prisma.room.findMany({
    orderBy: [{ building: 'asc' }, { name: 'asc' }],
  })

  const header = 'name,capacity,building,type,note'
  const rows = rooms.map((r) => {
    const note = r.capacity === 50 ? 'TODO_CONFIRM_CAPACITY' : ''
    return [
      r.name,
      String(r.capacity),
      r.building ?? '',
      r.type,
      note,
    ].map((v) => v.includes(',') ? `"${v}"` : v).join(',')
  })

  const csvPath = path.join(dataDir, 'room-capacity.csv')
  fs.writeFileSync(csvPath, [header, ...rows].join('\n') + '\n', 'utf-8')

  const todoCount = rooms.filter((r) => r.capacity === 50).length
  console.log(`Room CSV generated: ${csvPath}`)
  console.log(`  Total rooms: ${rooms.length}`)
  console.log(`  TODO_CONFIRM_CAPACITY: ${todoCount}`)

  return { total: rooms.length, todo: todoCount }
}

async function exportClassStudentCount(dataDir: string) {
  const classes = await prisma.classGroup.findMany({
    orderBy: { name: 'asc' },
  })

  const header = 'name,studentCount,advisorName,advisorPhone,note'
  const rows = classes.map((c) => {
    const note = c.studentCount == null ? 'TODO_FILL_STUDENT_COUNT' : ''
    return [
      c.name,
      c.studentCount != null ? String(c.studentCount) : '',
      c.advisorName ?? '',
      c.advisorPhone ?? '',
      note,
    ].map((v) => v.includes(',') ? `"${v}"` : v).join(',')
  })

  const csvPath = path.join(dataDir, 'class-student-count.csv')
  fs.writeFileSync(csvPath, [header, ...rows].join('\n') + '\n', 'utf-8')

  const todoCount = classes.filter((c) => c.studentCount == null).length
  console.log(`\nClass CSV generated: ${csvPath}`)
  console.log(`  Total classes: ${classes.length}`)
  console.log(`  TODO_FILL_STUDENT_COUNT: ${todoCount}`)

  return { total: classes.length, todo: todoCount }
}

async function main() {
  const dataDir = resolveExportDir()
  if (!fs.existsSync(dataDir)) {
    fs.mkdirSync(dataDir, { recursive: true })
  }

  console.log('=== 导出待填 CSV ===\n')
  await exportRoomCapacity(dataDir)
  await exportClassStudentCount(dataDir)
  console.log('\n=== 导出完成 ===')
  console.log(`\n请打开 ${dataDir} 中生成的 CSV。`)
  console.log('填写真实数据后设置 DATA_IMPORT_DIR，再运行 npm run import:data。')
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect())
