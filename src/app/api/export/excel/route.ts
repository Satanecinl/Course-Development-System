import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { requirePermission } from '@/lib/auth/require-permission'
import { resolveSchedulerSemester } from '@/lib/semester'
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
      // Resolve semester for scoped export
      const semester = await resolveSchedulerSemester().catch(() => null)
      const semesterId = semester?.id

      let effectiveItems = await getEffectiveScheduleForWeek(selectedWeek, semesterId)

      // K31-A: Filter effective items by the current page view (class/teacher/room).
      // Without this, the export would dump ALL teachers' courses for the week
      // even when the user is viewing one teacher. The dashboard's
      // `applyViewFilter` runs client-side on `displayItems`; the export
      // must mirror that contract server-side.
      if (viewType && targetId && !isNaN(targetId)) {
        effectiveItems = effectiveItems.filter((item) => {
          if (viewType === 'class') {
            const ids = item.classGroupIds ?? []
            return ids.includes(targetId)
          }
          if (viewType === 'teacher') {
            return item.teacherId === targetId
          }
          if (viewType === 'room') {
            // K34-A3C: match on primary OR secondary room.
            if (item.roomId === targetId) return true
            if (item.additionalRoomIds?.includes(targetId)) return true
            return false
          }
          return true
        })
      }

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
        // K31-A: build a safe 合班 label. Use a strict test() guard so a class
        // name without a "数字班" suffix falls back to the original (and never
        // leaves a raw digit/number stranded in the cell).
        const classLabel = item.classNames.length > 1
          ? `\n[${item.classNames.map((cn) => {
              const m = /^.*?(\d+)班$/.exec(cn)
              return m ? m[1] : cn
            }).join('/')}]`
          : ''
        const adjustedMark = item.isAdjusted ? ' [调课]' : ''
        const cellContent = `${item.courseName}${adjustedMark}\n${item.teacherName || '待定'}\n${item.roomName || ''}${classLabel}`
        if (grid[row][col]) {
          grid[row][col] += `\n${'─'.repeat(8)}\n${cellContent}`
        } else {
          grid[row][col] = cellContent
        }
      }

      for (let rowIdx = 0; rowIdx < 6; rowIdx++) {
        const excelRow = worksheet.getRow(rowIdx + 3)
        excelRow.getCell(1).value = SLOT_LABELS[rowIdx]
        excelRow.getCell(1).font = { bold: true }
        excelRow.getCell(1).alignment = { horizontal: 'center', vertical: 'middle' }
        excelRow.getCell(1).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF0F0F0' } }
        // Dynamic row height based on max courses in any cell of this row
        let maxCourses = 1
        for (let colIdx = 0; colIdx < 7; colIdx++) {
          const cellVal = grid[rowIdx][colIdx]
          if (cellVal) {
            const count = (cellVal.match(/─{8}/g) || []).length + 1
            if (count > maxCourses) maxCourses = count
          }
        }
        for (let colIdx = 0; colIdx < 7; colIdx++) {
          const cell = excelRow.getCell(colIdx + 2)
          cell.value = grid[rowIdx][colIdx]
          cell.alignment = { horizontal: 'center', vertical: 'middle', wrapText: true }
          cell.border = { top: { style: 'thin' }, left: { style: 'thin' }, bottom: { style: 'thin' }, right: { style: 'thin' } }
        }
        excelRow.height = Math.max(55, 20 + maxCourses * 40)
      }

      const buffer = await workbook.xlsx.writeBuffer()
      const respHeaders = new Headers()
      respHeaders.set('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet')
      const filename = `${sheetTitle}-第${selectedWeek}周.xlsx`
      respHeaders.set('Content-Disposition', `attachment; filename="${encodeURIComponent(filename)}"`)
      return new NextResponse(buffer, { headers: respHeaders })
    }

    // Original path: raw schedule without adjustments
    // Resolve semester for scoped export
    const semesterIdParam = searchParams.get('semesterId')
    const semester = await resolveSchedulerSemester({
      semesterId: semesterIdParam ? parseInt(semesterIdParam, 10) : undefined,
    })

    const where: Record<string, unknown> = { semesterId: semester.id }

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
        // K34-A3C: also match slots whose secondary rooms include the
        // target. The Prisma where clause on ScheduleSlot.roomId is
        // exact-match only; the secondary-room match is done after the
        // query. First, fetch by primary roomId, then union with
        // additional-room matches in JS below.
        where.roomId = targetId
      }
    }

    const slots = await prisma.scheduleSlot.findMany({
      where,
      include: {
        room: true,
        // K34-A3C: include additional rooms for composite expressions.
        additionalRooms: { include: { room: true }, orderBy: { id: 'asc' } },
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

    // K34-A3C: when filtering by room, also include slots where the
    // target room appears as a secondary room. Fetched separately to
    // avoid changing the primary Prisma where clause semantics.
    if (viewType === 'room' && targetId) {
      const secondarySlots = await prisma.scheduleSlot.findMany({
        where: {
          semesterId: semester.id,
          roomId: { not: targetId },
          additionalRooms: { some: { roomId: targetId } },
        },
        include: {
          room: true,
          additionalRooms: { include: { room: true }, orderBy: { id: 'asc' } },
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
      // Merge into slots, dedup by slotId
      const seen = new Set(slots.map((s) => s.id))
      for (const s of secondarySlots) {
        if (!seen.has(s.id)) {
          slots.push(s)
          seen.add(s.id)
        }
      }
      slots.sort((a, b) => a.dayOfWeek - b.dayOfWeek || a.slotIndex - b.slotIndex)
    }

    // 2. 获取视图标题
    let sheetTitle = `${semester.name} 课程表`
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
      // K31-A: safe 合班 label, same defensive pattern as the effective-schedule branch.
      const classLabel = task.taskClasses.length > 1
        ? `\n[${task.taskClasses.map((tc) => {
            const m = /^.*?(\d+)班$/.exec(tc.classGroup.name)
            return m ? m[1] : tc.classGroup.name
          }).join('/')}]`
        : ''

      // K34-A3C: composite room name (primary 或 secondary).
      const roomDisplay = slot.room?.name
        ? slot.additionalRooms.length > 0
          ? slot.room.name + ' 或 ' + slot.additionalRooms.map((ar) => ar.room.name).join(' 或 ')
          : slot.room.name
        : ''
      const cellText = `${task.course.name}${weekLabel}\n${task.teacher?.name || '待定'}\n${roomDisplay}${classLabel}`
      if (grid[row][col]) {
        grid[row][col] += `\n${'─'.repeat(8)}\n${cellText}`
      } else {
        grid[row][col] = cellText
      }
    }

    // 写入网格行
    for (let rowIdx = 0; rowIdx < 6; rowIdx++) {
      const excelRow = worksheet.getRow(rowIdx + 3)
      excelRow.getCell(1).value = SLOT_LABELS[rowIdx]
      excelRow.getCell(1).font = { bold: true }
      excelRow.getCell(1).alignment = { horizontal: 'center', vertical: 'middle' }
      excelRow.getCell(1).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF0F0F0' } }

      // Dynamic row height based on max courses in any cell of this row
      let maxCourses = 1
      for (let colIdx = 0; colIdx < 7; colIdx++) {
        const cellVal = grid[rowIdx][colIdx]
        if (cellVal) {
          const count = (cellVal.match(/─{8}/g) || []).length + 1
          if (count > maxCourses) maxCourses = count
        }
      }

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
      excelRow.height = Math.max(55, 20 + maxCourses * 40)
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
