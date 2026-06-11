import { prisma } from '@/lib/prisma'
import {
  type SchedulingContext,
  type TaskWithRelations,
  type SlotWithRelations,
  type RoomWithAvailability,
  roomKey,
  teacherKey,
  classKey,
} from './types'

export interface LoadSchedulingContextOptions {
  /** Filter semester-bound models by this semesterId. */
  semesterId?: number
}

/**
 * 一次性加载所有排课数据并构建内存索引。
 * 后续算法逻辑中禁止再调 Prisma 查库，全部从 Context 读取。
 *
 * When semesterId is provided, TeachingTask / ScheduleSlot are filtered to that semester.
 * Room / Teacher / Course remain global.
 */
export async function loadSchedulingContext(
  options?: LoadSchedulingContextOptions,
): Promise<SchedulingContext> {
  const semesterId = options?.semesterId

  // Build where clause for semester-scoped models
  const taskWhere = semesterId != null ? { semesterId } : {}
  const slotWhere = semesterId != null ? { semesterId } : {}

  // ── 并行拉取三张表 ──
  const [tasks, rooms, slots] = await Promise.all([
    prisma.teachingTask.findMany({
      where: taskWhere,
      include: {
        course: true,
        teacher: true,
        taskClasses: { include: { classGroup: true } },
      },
    }) as Promise<TaskWithRelations[]>,
    prisma.room.findMany({
      include: { availabilities: true },
    }) as Promise<RoomWithAvailability[]>,
    prisma.scheduleSlot.findMany({
      where: slotWhere,
      include: {
        room: true,
        // K34-A3: load secondary rooms for composite expressions.
        additionalRooms: {
          include: { room: true },
        },
        teachingTask: {
          include: {
            course: true,
            teacher: true,
            taskClasses: { include: { classGroup: true } },
          },
        },
      },
    }) as Promise<SlotWithRelations[]>,
  ])

  // ── 构建索引 ──
  const taskById = new Map<number, TaskWithRelations>()
  for (const t of tasks) taskById.set(t.id, t)

  const roomById = new Map<number, RoomWithAvailability>()
  for (const r of rooms) roomById.set(r.id, r)

  const slotsByTask = new Map<number, SlotWithRelations[]>()
  const slotsByRoom = new Map<string, SlotWithRelations[]>()
  const slotsByTeacher = new Map<string, SlotWithRelations[]>()
  const slotsByClass = new Map<string, SlotWithRelations[]>()

  for (const slot of slots) {
    const { teachingTaskId, roomId, dayOfWeek, slotIndex } = slot
    const task = slot.teachingTask

    // slotsByTask
    let arr = slotsByTask.get(teachingTaskId)
    if (!arr) { arr = []; slotsByTask.set(teachingTaskId, arr) }
    arr.push(slot)

    // slotsByRoom: index by primary AND secondary rooms so that
    // HC3 (room conflict) detects overlaps on either room.
    const roomIdsForSlot = new Set<number>()
    if (roomId != null) roomIdsForSlot.add(roomId)
    // K34-A3: add secondary room ids.
    const additionalRooms = (slot as Record<string, unknown>).additionalRooms as Array<{ roomId: number }> | undefined
    if (additionalRooms) {
      for (const ar of additionalRooms) roomIdsForSlot.add(ar.roomId)
    }
    for (const rid of roomIdsForSlot) {
      const rk = roomKey(rid, dayOfWeek, slotIndex)
      let rArr = slotsByRoom.get(rk)
      if (!rArr) { rArr = []; slotsByRoom.set(rk, rArr) }
      rArr.push(slot)
    }

    // slotsByTeacher
    if (task.teacherId != null) {
      const tk = teacherKey(task.teacherId, dayOfWeek, slotIndex)
      let tArr = slotsByTeacher.get(tk)
      if (!tArr) { tArr = []; slotsByTeacher.set(tk, tArr) }
      tArr.push(slot)
    }

    // slotsByClass — 展开每个 classGroupId
    for (const tc of task.taskClasses) {
      const ck = classKey(tc.classGroupId, dayOfWeek, slotIndex)
      let cArr = slotsByClass.get(ck)
      if (!cArr) { cArr = []; slotsByClass.set(ck, cArr) }
      cArr.push(slot)
    }
  }

  return {
    tasks,
    rooms,
    slots,
    taskById,
    roomById,
    slotsByTask,
    slotsByRoom,
    slotsByTeacher,
    slotsByClass,
  }
}
