import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { requirePermission } from '@/lib/auth/require-permission'
import { getEffectiveScheduleForWeek } from '@/lib/schedule/adjustments'
import ExcelJS from 'exceljs'

const SLOT_LABELS = ['1-2节', '3-4节', '5-6节', '7-8节', '9-10节', '11-12节']
const DAY_LABELS = ['周一', '周二', '周三', '周四', '周五', '周六', '周日']

function getWeekLabel(weekType: string, startWeek: number, endWeek: number): string {
  switch (weekType) {
    case 'ODD': return '(单周)'
    case 'EVEN': return '(双周)'
    case 'FIRST_HALF': return '(前八周)'
    case 'SECOND_HALF': return '(后八周)'
    case 'CUSTOM': return `(${startWeek}-${endWeek}周)`
    default: return ''
  }
}

function isSlotActiveInWeek(
  weekType: string,
  startWeek: number,
  endWeek: number,
  selectedWeek: number | null,
): boolean {
  if (selectedWeek == null) return true
  if (selectedWeek < startWeek || selectedWeek > endWeek) return false
  const wt = (weekType ?? 'ALL').toUpperCase()
  switch (wt) {
    case 'ALL': return true
    case 'ODD': return selectedWeek % 2 === 1
    case 'EVEN': return selectedWeek % 2 === 0
    case 'FIRST_HALF': return selectedWeek <= 8
    case 'SECOND_HALF': return selectedWeek >= 9
    case 'CUSTOM': return true
    default: return true
  }
}

export async function GET(request: NextRequest) {
  try {
    const auth = await requirePermission('data:export', request)
    if ('error' in auth) return auth.error
    const { searchParams } = new URL(request.url)
    const viewType = searchParams.get('viewType') as 'class' | 'teacher' | 'room' | null
    const targetIdParam = searchParams.get('targetId')
    const targetId = targetIdParam ? parseInt(targetIdParam, 10) : null
    const weekParam = searchParams.get('week')
    const selectedWeek = weekParam ? parseInt(weekParam, 10) : null
    const applyAdjustments = searchParams.get('applyAdjustments') === 'true'

    // 1. 查询数据
    // If week + applyAdjustments, use effective schedule (includes adjustments)
    if (selectedWeek && applyAdjustments) {
      const effectiveItems = await getEffectiveScheduleForWeek(selectedWeek)

      // Build Excel from effective items
      const workbook = new ExcelJS.Workbook()
      const worksheet = workbook.addWorksheet('课表')

      let sheetTitle = '课程表'
      if (viewType === 'class' && targetId) {
        const cg = await prisma.classGroup.findUnique({ where: { id: targetId }, select: { name: true } })
        if (cg) sheetTitle = `${cg.name} 课程表`
      } else if (viewType === 'teacher' && targetId) {
        const t = await prisma.teacher.findUnique({ where: { id: targetId }, select: { name: true } })
        if (t) sheetTitle = `${t.name} 教师课表`
      } else if (viewType === 'room' && targetId) {
        const r = await prisma.room.findUnique({ where: { id: targetId }, select: { name: true } })
        if (r) sheetTitle = `${r.name} 教室课表`
      }

      worksheet.mergeCells('A1', 'H1')
      const titleCell = worksheet.getCell('A1')
      titleCell.value = sheetTitle
      titleCell.font = { bold: true, size: 16 }
      titleCell.alignment = { horizontal: 'center', vertical: 'middle' }
      worksheet.getRow(1).height = 30

      const headerRow = worksheet.getRow(2)
      headerRow.getCell(1).value = '节次 / 星期'
      headerRow.getCell(1).font = { bold: true }
      headerRow.getCell(1).alignment = { horizontal: 'center', vertical: 'middle' }
      headerRow.getCell(1).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFE0E0E0' } }
      DAY_LABELS.forEach((day, idx) => {
        const cell = headerRow.getCell(idx + 2)
        cell.value = day
        cell.font = { bold: true }
        cell.alignment = { horizontal: 'center', vertical: 'middle' }
        cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFE0E0E0' } }
      })
      headerRow.height = 25

      worksheet.getColumn(1).width = 12
      for (let i = 2; i <= 8; i++) worksheet.getColumn(i).width = 22

      const grid: Array<Array<string>> = Array.from({ length: 6 }, () => Array.from({ length: 7 }, () => ''))
      for (const item of effectiveItems) {
        const row = item.slotIndex - 1
        const col = item.dayOfWeek - 1
        if (row < 0 || row >= 6 || col < 0 || col >= 7) continue
        const classLabel = item.classNames.length > 1 ? `\n[${item.classNames.map((cn) => cn.replace(/^.*?(\d+)班$/, '$1')).join('/')}]` : ''
        const adjustedMark = item.isAdjusted ? ' [调课]' : ''
        grid[row][col] = `${item.courseName}${adjustedMark}\n${item.teacherName || '待定'}\n${item.roomName || ''}${classLabel}`
      }

      for (let rowIdx = 0; rowIdx < 6; rowIdx++) {
        const excelRow = worksheet.getRow(rowIdx + 3)
        excelRow.getCell(1).value = SLOT_LABELS[rowIdx]
        excelRow.getCell(1).font = { bold: true }
        excelRow.getCell(1).alignment = { horizontal: 'center', vertical: 'middle' }
        excelRow.getCell(1).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF0F0F0' } }
        for (let colIdx = 0; colIdx < 7; colIdx++) {
          const cell = excelRow.getCell(colIdx + 2)
          cell.value = grid[rowIdx][colIdx]
          cell.alignment = { horizontal: 'center', vertical: 'middle', wrapText: true }
          cell.border = { top: { style: 'thin' }, left: { style: 'thin' }, bottom: { style: 'thin' }, right: { style: 'thin' } }
        }
        excelRow.height = 55
      }

      const buffer = await workbook.xlsx.writeBuffer()
      const respHeaders = new Headers()
      respHeaders.set('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet')
      const filename = `${sheetTitle}-第${selectedWeek}周.xlsx`
      respHeaders.set('Content-Disposition', `attachment; filename="${encodeURIComponent(filename)}"`)
      return new NextResponse(buffer, { headers: respHeaders })
    }

    // Original path: raw schedule without adjustments
    const where: Record<string, unknown> = {}

    if (viewType && targetId && !isNaN(targetId)) {
      if (viewType === 'class') {
        const taskClasses = await prisma.teachingTaskClass.findMany({
          where: { classGroupId: targetId },
          select: { teachingTaskId: true },
        })
        const taskIds = taskClasses.map((tc) => tc.teachingTaskId)
        if (taskIds.length === 0) {
          return new NextResponse(null, { status: 204 })
        }
        where.teachingTaskId = { in: taskIds }
      } else if (viewType === 'teacher') {
        where.teachingTask = { teacherId: targetId }
      } else if (viewType === 'room') {
        where.roomId = targetId }
    }

    const slots = await prisma.scheduleSlot.findMany({
      where,
      include: {
        room: true,
        teachingTask: {
          include: {
            course: true,
            teacher: true,
            taskClasses: { include: { classGroup: true } },
          },
        },
      },
      orderBy: [{ dayOfWeek: 'asc' }, { slotIndex: 'asc' }],
    })

    // 2. 获取视图标题
    let sheetTitle = '课程表'
    if (viewType === 'class' && targetId) {
      const cg = await prisma.classGroup.findUnique({ where: { id: targetId }, select: { name: true } })
      if (cg) sheetTitle = `${cg.name} 课程表`
    } else if (viewType === 'teacher' && targetId) {
      const t = await prisma.teacher.findUnique({ where: { id: targetId }, select: { name: true } })
      if (t) sheetTitle = `${t.name} 教师课表`
    } else if (viewType === 'room' && targetId) {
      const r = await prisma.room.findUnique({ where: { id: targetId }, select: { name: true } })
      if (r) sheetTitle = `${r.name} 教室课表`
    }

    // 3. 构建 Excel
    const workbook = new ExcelJS.Workbook()
    const worksheet = workbook.addWorksheet('课表')

    // 标题行
    worksheet.mergeCells('A1', 'H1')
    const titleCell = worksheet.getCell('A1')
    titleCell.value = sheetTitle
    titleCell.font = { bold: true, size: 16 }
    titleCell.alignment = { horizontal: 'center', vertical: 'middle' }
    worksheet.getRow(1).height = 30

    // 表头：节次 / 星期
    const headerRow = worksheet.getRow(2)
    headerRow.getCell(1).value = '节次 / 星期'
    headerRow.getCell(1).font = { bold: true }
    headerRow.getCell(1).alignment = { horizontal: 'center', vertical: 'middle' }
    headerRow.getCell(1).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFE0E0E0' } }

    DAY_LABELS.forEach((day, idx) => {
      const cell = headerRow.getCell(idx + 2)
      cell.value = day
      cell.font = { bold: true }
      cell.alignment = { horizontal: 'center', vertical: 'middle' }
      cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFE0E0E0' } }
    })
    headerRow.height = 25

    // 设置列宽
    worksheet.getColumn(1).width = 12
    for (let i = 2; i <= 8; i++) {
      worksheet.getColumn(i).width = 22
    }

    // 初始化数据网格：6行 x 7列
    const grid: Array<Array<string>> = Array.from({ length: 6 }, () =>
      Array.from({ length: 7 }, () => '')
    )

    // 填充数据
    for (const slot of slots) {
      const task = slot.teachingTask
      const row = slot.slotIndex - 1 // 0-based
      const col = slot.dayOfWeek - 1 // 0-based
      if (row < 0 || row >= 6 || col < 0 || col >= 7) continue

      // Week filtering
      if (!isSlotActiveInWeek(task.weekType, task.startWeek, task.endWeek, selectedWeek)) continue

      const weekLabel = getWeekLabel(task.weekType, task.startWeek, task.endWeek)
      const classLabel = task.taskClasses.length > 1
        ? `\n[${task.taskClasses.map((tc) => tc.classGroup.name.replace(/^.*?(\d+)班$/, '$1')).join('/')}]`
        : ''

      const cellText = `${task.course.name}${weekLabel}\n${task.teacher?.name || '待定'}\n${slot.room?.name || ''}${classLabel}`
      grid[row][col] = cellText
    }

    // 写入网格行
    for (let rowIdx = 0; rowIdx < 6; rowIdx++) {
      const excelRow = worksheet.getRow(rowIdx + 3)
      excelRow.getCell(1).value = SLOT_LABELS[rowIdx]
      excelRow.getCell(1).font = { bold: true }
      excelRow.getCell(1).alignment = { horizontal: 'center', vertical: 'middle' }
      excelRow.getCell(1).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF0F0F0' } }

      for (let colIdx = 0; colIdx < 7; colIdx++) {
        const cell = excelRow.getCell(colIdx + 2)
        cell.value = grid[rowIdx][colIdx]
        cell.alignment = { horizontal: 'center', vertical: 'middle', wrapText: true }
        cell.border = {
          top: { style: 'thin' },
          left: { style: 'thin' },
          bottom: { style: 'thin' },
          right: { style: 'thin' },
        }
      }
      excelRow.height = 55
    }

    // 4. 流式返回
    const buffer = await workbook.xlsx.writeBuffer()

    const headers = new Headers()
    headers.set('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet')
    const filename = selectedWeek ? `${sheetTitle}-第${selectedWeek}周.xlsx` : `${sheetTitle}.xlsx`
    headers.set('Content-Disposition', `attachment; filename="${encodeURIComponent(filename)}"`)

    return new NextResponse(buffer, { headers })
  } catch (error) {
    console.error('Excel export error:', error)
    return NextResponse.json(
      { error: 'Internal server error', details: String(error) },
      { status: 500 }
    )
  }
}
