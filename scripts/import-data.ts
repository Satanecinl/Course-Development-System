import { PrismaClient } from '@prisma/client'
import * as fs from 'fs'
import * as path from 'path'

const prisma = new PrismaClient()

/** 名称标准化：trim、去多余空格、全角转半角 */
function normalizeName(name: string): string {
  return name
    .trim()
    .replace(/\s+/g, ' ')
    .replace(/（/g, '(').replace(/）/g, ')')
    .replace(/—/g, '-').replace(/－/g, '-')
    .replace(/：/g, ':')
}

/** 解析 CSV（简单实现，不处理引号内逗号） */
function parseCsv(filePath: string): Record<string, string>[] {
  const content = fs.readFileSync(filePath, 'utf-8')
  const lines = content.split('\n').filter((l) => l.trim())
  if (lines.length < 2) return []
  const headers = lines[0].split(',').map((h) => h.trim().replace(/^"|"$/g, ''))
  return lines.slice(1).map((line) => {
    // 简单处理引号
    const values: string[] = []
    let current = ''
    let inQuote = false
    for (const ch of line) {
      if (ch === '"') { inQuote = !inQuote; continue }
      if (ch === ',' && !inQuote) { values.push(current.trim()); current = ''; continue }
      current += ch
    }
    values.push(current.trim())
    const row: Record<string, string> = {}
    headers.forEach((h, i) => { row[h] = values[i] ?? '' })
    return row
  })
}

async function importRoomCapacity() {
  const csvPath = path.join(__dirname, '..', 'data', 'room-capacity.csv')
  if (!fs.existsSync(csvPath)) {
    console.log('[Room] 未找到 data/room-capacity.csv，已跳过。')
    return
  }

  const rows = parseCsv(csvPath)
  console.log(`[Room] 读取 ${rows.length} 行 CSV`)

  let updated = 0
  let skipped = 0
  let unmatched = 0
  const unmatchedNames: string[] = []
  const warnings: string[] = []

  for (let i = 0; i < rows.length; i++) {
    const row = rows[i]
    const name = normalizeName(row.name || '')
    const capacityStr = (row.capacity || '').trim()

    // 跳过空行
    if (!name) {
      skipped++
      continue
    }

    // 跳过无效容量
    if (!capacityStr || isNaN(Number(capacityStr)) || Number(capacityStr) <= 0) {
      skipped++
      warnings.push(`[Room] 行 ${i + 2}: "${name}" capacity 无效 ("${capacityStr}")，已跳过`)
      continue
    }

    const capacity = Math.floor(Number(capacityStr))

    const room = await prisma.room.findFirst({
      where: { name: { equals: name } },
    })

    if (!room) {
      unmatched++
      unmatchedNames.push(name)
      continue
    }

    const updateData: Record<string, unknown> = { capacity }
    if (row.building && row.building.trim()) updateData.building = row.building.trim()
    if (row.type && row.type.trim()) updateData.type = row.type.trim()

    await prisma.room.update({
      where: { id: room.id },
      data: updateData,
    })
    updated++
  }

  // 输出 warnings
  for (const w of warnings) console.log(w)

  console.log(`[Room] 成功更新: ${updated}`)
  console.log(`[Room] 跳过（无效/空值）: ${skipped}`)
  console.log(`[Room] 未匹配: ${unmatched}`)
  if (unmatchedNames.length > 0) {
    console.log(`[Room] 未匹配名称: ${unmatchedNames.join(', ')}`)
  }

  // 统计仍然 capacity=50 的教室
  const cap50Count = await prisma.room.count({ where: { capacity: 50 } })
  const totalRooms = await prisma.room.count()
  console.log(`[Room] 数据库中 capacity=50 的教室: ${cap50Count}/${totalRooms}`)
}

async function importClassStudentCount() {
  const csvPath = path.join(__dirname, '..', 'data', 'class-student-count.csv')
  if (!fs.existsSync(csvPath)) {
    console.log('[Class] 未找到 data/class-student-count.csv，已跳过。')
    return
  }

  const rows = parseCsv(csvPath)
  console.log(`[Class] 读取 ${rows.length} 行 CSV`)

  let updated = 0
  let skipped = 0
  let unmatched = 0
  const unmatchedNames: string[] = []
  const warnings: string[] = []

  for (let i = 0; i < rows.length; i++) {
    const row = rows[i]
    const name = normalizeName(row.name || '')
    const studentCountStr = (row.studentCount || '').trim()

    // 跳过空行
    if (!name) {
      skipped++
      continue
    }

    // 跳过无效人数
    if (!studentCountStr || isNaN(Number(studentCountStr)) || Number(studentCountStr) <= 0) {
      skipped++
      warnings.push(`[Class] 行 ${i + 2}: "${name}" studentCount 无效 ("${studentCountStr}")，已跳过`)
      continue
    }

    const studentCount = Math.floor(Number(studentCountStr))

    const classGroup = await prisma.classGroup.findFirst({
      where: { name: { equals: name } },
    })

    if (!classGroup) {
      unmatched++
      unmatchedNames.push(name)
      continue
    }

    await prisma.classGroup.update({
      where: { id: classGroup.id },
      data: { studentCount },
    })
    updated++
  }

  // 输出 warnings
  for (const w of warnings) console.log(w)

  console.log(`[Class] 成功更新: ${updated}`)
  console.log(`[Class] 跳过（无效/空值）: ${skipped}`)
  console.log(`[Class] 未匹配: ${unmatched}`)
  if (unmatchedNames.length > 0) {
    console.log(`[Class] 未匹配名称: ${unmatchedNames.join(', ')}`)
  }

  // 统计 studentCount 仍为空的班级
  const nullCount = await prisma.classGroup.count({ where: { studentCount: null } })
  const totalClasses = await prisma.classGroup.count()
  console.log(`[Class] 数据库中 studentCount 为空的班级: ${nullCount}/${totalClasses}`)
}

async function main() {
  console.log('=== 数据导入 ===\n')
  await importRoomCapacity()
  console.log()
  await importClassStudentCount()
  console.log('\n=== 导入完成 ===')
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect())
