import { create } from 'zustand'
import {
  ScheduleViewData,
  ViewType,
  TIME_SLOTS,
  DAYS,
  getSlotLabelByIndex,
  parseSlotLabel,
} from '@/types/schedule'

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

  // 选项缓存
  classOptions: EntityOption[]
  teacherOptions: EntityOption[]
  roomOptions: EntityOption[]

  fetchSchedule: (viewType?: FilterType, targetId?: number) => Promise<void>
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

  classOptions: [],
  teacherOptions: [],
  roomOptions: [],

  fetchSchedule: async (viewType, targetId) => {
    const vt = viewType ?? get().viewType
    const tid = targetId ?? get().viewTargetId

    set({ isLoading: true, error: null })
    try {
      const params = new URLSearchParams()
      if (vt && vt !== 'all' && tid) {
        params.set('viewType', vt)
        params.set('targetId', String(tid))
      }
      const query = params.toString()
      const res = await fetch(`/api/schedule${query ? '?' + query : ''}`)
      if (!res.ok) throw new Error('Failed to fetch schedule')
      const data = await res.json()
      set({ scheduleItems: data, isLoading: false })
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

      if (!updateRes.ok) throw new Error('Update failed')
      const updatedItem = await updateRes.json()

      // 确认更新
      set({
        scheduleItems: optimisticItems.map(i =>
          i.slotId === slotId ? { ...i, ...updatedItem } : i
        ),
      })
      return true
    } catch {
      // 回滚
      set({ scheduleItems: oldItems })
      return false
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
