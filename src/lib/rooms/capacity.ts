import { prisma } from '@/lib/prisma'

// ── Types ──

export interface RoomCapacityRow {
  id: number
  name: string
  building: string | null
  type: string
  capacity: number
  maxAssignedStudentCount: number
  suggestedCapacity: number | null
  belowCurrentUsage: boolean
  belowSuggestedCapacity: boolean
  slotCount: number
}

// ── Helpers ──

/**
 * 计算教学任务关联班级的学生总数。
 * ClassGroup.studentCount 为 null 时按 0 处理。
 */
function computeTaskStudentCount(taskId: number, classGroupsMap: Map<number, number>): number {
  // 通过 TeachingTaskClass 查询关联的班级
  // 但这里调用方已经预加载了数据，所以由调用方传入
  const count = classGroupsMap.get(taskId)
  return count ?? 0
}

// ── Main Query ──

/**
 * 查询所有教室的容量管理数据。
 * 包括：当前容量、已安排最大人数、建议容量、风险状态。
 */
export async function getRoomCapacityRows(
  options: { q?: string; onlyRisk?: boolean } = {},
): Promise<RoomCapacityRow[]> {
  // 1. 查询所有教室
  const rooms = await prisma.room.findMany({
    orderBy: { id: 'asc' },
  })

  // 2. 查询所有 ScheduleSlot（带 TeachingTask → TeachingTaskClass → ClassGroup）
  const slots = await prisma.scheduleSlot.findMany({
    where: { roomId: { not: null } },
    include: {
      room: true,
      teachingTask: {
        include: {
          taskClasses: {
            include: {
              classGroup: true,
            },
          },
        },
      },
    },
  })

  // 3. 预计算每个 teachingTask 的学生总数
  const taskStudentCountMap = new Map<number, number>()
  for (const slot of slots) {
    const taskId = slot.teachingTaskId
    if (!taskStudentCountMap.has(taskId)) {
      let total = 0
      for (const tc of slot.teachingTask.taskClasses) {
        total += tc.classGroup.studentCount ?? 0
      }
      taskStudentCountMap.set(taskId, total)
    }
  }

  // 4. 按 room 聚合：计算 maxAssignedStudentCount 和 slotCount
  const roomStats = new Map<
    number,
    { maxAssignedStudentCount: number; slotCount: number }
  >()

  for (const slot of slots) {
    if (!slot.roomId) continue
    const studentCount = taskStudentCountMap.get(slot.teachingTaskId) ?? 0

    const existing = roomStats.get(slot.roomId)
    if (existing) {
      existing.slotCount++
      if (studentCount > existing.maxAssignedStudentCount) {
        existing.maxAssignedStudentCount = studentCount
      }
    } else {
      roomStats.set(slot.roomId, {
        maxAssignedStudentCount: studentCount,
        slotCount: 1,
      })
    }
  }

  // 5. 构建结果
  let rows: RoomCapacityRow[] = rooms.map((room) => {
    const stats = roomStats.get(room.id)
    const maxAssignedStudentCount = stats?.maxAssignedStudentCount ?? 0
    const slotCount = stats?.slotCount ?? 0
    const suggestedCapacity =
      maxAssignedStudentCount > 0
        ? Math.ceil(maxAssignedStudentCount * 1.1)
        : null

    return {
      id: room.id,
      name: room.name,
      building: room.building,
      type: room.type,
      capacity: room.capacity,
      maxAssignedStudentCount,
      suggestedCapacity,
      belowCurrentUsage: room.capacity < maxAssignedStudentCount,
      belowSuggestedCapacity:
        maxAssignedStudentCount > 0 &&
        suggestedCapacity != null &&
        room.capacity < suggestedCapacity,
      slotCount,
    }
  })

  // 6. 搜索筛选
  if (options.q) {
    const keyword = options.q.trim().toLowerCase()
    rows = rows.filter(
      (r) =>
        r.name.toLowerCase().includes(keyword) ||
        (r.building?.toLowerCase().includes(keyword) ?? false),
    )
  }

  // 7. 只看风险
  if (options.onlyRisk) {
    rows = rows.filter(
      (r) => r.belowCurrentUsage || r.belowSuggestedCapacity,
    )
  }

  return rows
}

/**
 * 查询单个教室的容量管理数据。
 */
export async function getRoomCapacityRow(
  roomId: number,
): Promise<RoomCapacityRow | null> {
  const rows = await getRoomCapacityRows()
  return rows.find((r) => r.id === roomId) ?? null
}
