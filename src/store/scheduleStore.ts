import { create } from 'zustand'
import {
  ScheduleViewData,
  ViewType,
  TIME_SLOTS,
  DAYS,
  getSlotLabelByIndex,
  parseSlotLabel,
} from '@/types/schedule'
import { withSemesterQuery, useSemesterStore } from '@/store/semesterStore'

export type FilterType = 'all' | ViewType

interface EntityOption {
  id: number
  name: string
}

interface ScheduleState {
  scheduleItems: ScheduleViewData[]
  viewType: FilterType
  viewTargetId: number | null
  viewTargetName: string
  isLoading: boolean
  error: string | null
  /** K25-E: semesterSource from the last /api/schedule response. */
  semesterSource: string | null

  // 选项缓存
  classOptions: EntityOption[]
  teacherOptions: EntityOption[]
  roomOptions: EntityOption[]

  fetchSchedule: (viewType?: FilterType, targetId?: number, semesterId?: number | null) => Promise<void>
  loadEntityOptions: () => Promise<void>
  moveSlot: (slotId: number, newDay: number, newSlotLabel: string, newRoomId: number) => Promise<boolean>
  updateTask: (taskId: number, updatedItems: ScheduleViewData[]) => void
  setView: (type: FilterType, targetId: number | null, targetName: string) => void
}

export { TIME_SLOTS, DAYS, getSlotLabelByIndex, parseSlotLabel }

export const useScheduleStore = create<ScheduleState>((set, get) => ({
  scheduleItems: [],
  viewType: 'all',
  viewTargetId: null,
  viewTargetName: '',
  isLoading: false,
  error: null,
  semesterSource: null,

  classOptions: [],
  teacherOptions: [],
  roomOptions: [],

  fetchSchedule: async (viewType, targetId, semesterId) => {
    const vt = viewType ?? get().viewType
    const tid = targetId ?? get().viewTargetId
    // K25-E: resolve semesterId — explicit param > semester store > null (server fallback)
    const resolvedSemesterId = semesterId !== undefined
      ? semesterId
      : useSemesterStore.getState().currentSemesterId

    set({ isLoading: true, error: null })
    try {
      const params = new URLSearchParams()
      if (vt && vt !== 'all' && tid) {
        params.set('viewType', vt)
        params.set('targetId', String(tid))
      }
      const query = params.toString()
      // K25-E: explicit semesterId via withSemesterQuery helper
      const url = withSemesterQuery(
        `/api/schedule${query ? '?' + query : ''}`,
        resolvedSemesterId,
      )
      const res = await fetch(url)
      if (!res.ok) throw new Error('Failed to fetch schedule')
      // K25-D: /api/schedule now returns { items, semesterId, semesterSource }
      // instead of a raw array. Extract items defensively so older call
      // sites that still send raw arrays (e.g., in tests) keep working.
      const data = await res.json()
      const items = Array.isArray(data) ? data : data.items ?? []
      const source = Array.isArray(data) ? null : (data.semesterSource ?? null)
      set({ scheduleItems: items, isLoading: false, semesterSource: source })
    } catch (err) {
      set({ error: String(err), isLoading: false })
    }
  },

  loadEntityOptions: async () => {
    try {
      const [classRes, teacherRes, roomRes] = await Promise.all([
        fetch('/api/entity-list?type=classgroup'),
        fetch('/api/entity-list?type=teacher'),
        fetch('/api/entity-list?type=room'),
      ])

      const classData = await classRes.json()
      const teacherData = await teacherRes.json()
      const roomData = await roomRes.json()

      set({
        classOptions: Array.isArray(classData) ? classData : [],
        teacherOptions: Array.isArray(teacherData) ? teacherData : [],
        roomOptions: Array.isArray(roomData) ? roomData : [],
      })
    } catch (err) {
      console.error('Failed to load entity options:', err)
    }
  },

  moveSlot: async (slotId, newDay, newSlotLabel, newRoomId) => {
    const items = get().scheduleItems
    const itemIndex = items.findIndex(i => i.slotId === slotId)
    if (itemIndex === -1) return false

    const item = items[itemIndex]
    const targetSlotIndex = parseSlotLabel(newSlotLabel)

    // Preflight: conflict check before optimistic update
    const preflightBody: Record<string, unknown> = {
      scheduleSlotId: slotId,
      targetDayOfWeek: newDay,
      targetSlotIndex: targetSlotIndex,
      targetRoomId: newRoomId,
    }
    // Pass semesterId if available from the item data
    if ('semesterId' in item && (item as Record<string, unknown>).semesterId != null) {
      preflightBody.semesterId = (item as Record<string, unknown>).semesterId
    }

    const preflightRes = await fetch('/api/conflict-check', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(preflightBody),
    })

    if (preflightRes.ok) {
      const preflightResult = await preflightRes.json()
      if (preflightResult.hasConflict && preflightResult.conflicts?.length > 0) {
        throw new Error(preflightResult.conflicts.join('\n'))
      }
    }

    // 保存快照用于回滚
    const oldItems = [...items]

    // 乐观更新
    const optimisticItems = [...items]
    optimisticItems[itemIndex] = {
      ...item,
      dayOfWeek: newDay,
      slotIndex: targetSlotIndex,
      roomId: newRoomId,
    }
    set({ scheduleItems: optimisticItems })

    try {
      const updateRes = await fetch(`/api/schedule-slot/${slotId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          dayOfWeek: newDay,
          slotIndex: targetSlotIndex,
          roomId: newRoomId,
        }),
      })

      if (!updateRes.ok) {
        const errBody = await updateRes.json().catch(() => null)
        const msg = errBody?.conflicts?.join('\n') || errBody?.error || '服务器更新失败'
        throw new Error(msg)
      }
      const updatedItem = await updateRes.json()

      // 确认更新
      set({
        scheduleItems: optimisticItems.map(i =>
          i.slotId === slotId ? { ...i, ...updatedItem } : i
        ),
      })
      return true
    } catch (err) {
      // 回滚
      set({ scheduleItems: oldItems })
      throw err
    }
  },

  updateTask: (taskId, updatedItems) => {
    set((state) => ({
      scheduleItems: state.scheduleItems
        .filter((item) => item.taskId !== taskId)
        .concat(updatedItems),
    }))
  },

  setView: (type, targetId, targetName) => {
    set({ viewType: type, viewTargetId: targetId, viewTargetName: targetName })
  },
}))
