'use client'

import { useEffect, useState, useCallback } from 'react'
import { FileDown } from 'lucide-react'
import { toast } from 'sonner'
import { ScheduleSidebar } from '@/components/schedule-sidebar'
import { ScheduleGrid } from '@/components/schedule-grid'
import { ScheduleAdjustmentDialog } from '@/components/schedule-adjustment-dialog'
import { UserAdjustmentRequestDialog } from '@/components/schedule/user-adjustment-request-dialog'
import { SemesterSelector } from '@/components/semester-selector'
import { useScheduleStore } from '@/store/scheduleStore'
import { useSemesterStore, withSemesterQuery } from '@/store/semesterStore'
import { ViewType, DAYS, TIME_SLOTS } from '@/types/schedule'
import type { ScheduleViewData } from '@/types/schedule'
import { type WeekFilter } from '@/lib/schedule/week-filter'
import { voidScheduleAdjustment } from '@/lib/schedule/adjustment-client'
import { useHasPermission } from '@/components/layout/current-user-context'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'

const VIEW_TYPE_LABELS: Record<string, string> = {
  all: '全部',
  class: '按班级',
  teacher: '按教师',
  room: '按教室',
}

const WEEK_OPTIONS: WeekFilter[] = ['ALL', ...Array.from({ length: 20 }, (_, i) => i + 1)]

// ── 稳定字段读取 helper（兼容多种字段形状） ──

function getItemTeacherId(item: unknown): number | null {
  if (item == null) return null
  const it = item as Record<string, unknown>
  if (typeof it.teacherId === 'number') return it.teacherId
  if (it.teacher != null && typeof (it.teacher as Record<string, unknown>).id === 'number') {
    return (it.teacher as Record<string, unknown>).id as number
  }
  return null
}

function getItemTeacherName(item: unknown): string | null {
  if (item == null) return null
  const it = item as Record<string, unknown>
  if (typeof it.teacherName === 'string') return it.teacherName
  if (it.teacher != null && typeof (it.teacher as Record<string, unknown>).name === 'string') {
    return (it.teacher as Record<string, unknown>).name as string
  }
  return null
}

function getItemRoomId(item: unknown): number | null {
  if (item == null) return null
  const it = item as Record<string, unknown>
  if (typeof it.roomId === 'number') return it.roomId
  if (it.room != null && typeof (it.room as Record<string, unknown>).id === 'number') {
    return (it.room as Record<string, unknown>).id as number
  }
  return null
}

function getItemRoomName(item: unknown): string | null {
  if (item == null) return null
  const it = item as Record<string, unknown>
  if (typeof it.roomName === 'string') return it.roomName
  if (it.room != null && typeof (it.room as Record<string, unknown>).name === 'string') {
    return (it.room as Record<string, unknown>).name as string
  }
  return null
}

function getItemClassGroupIds(item: unknown): number[] {
  if (item == null) return []
  const it = item as Record<string, unknown>
  if (Array.isArray(it.classGroupIds)) {
    return it.classGroupIds.filter((id): id is number => typeof id === 'number')
  }
  if (Array.isArray(it.classGroups)) {
    return it.classGroups
      .map((g: unknown) => (g as Record<string, unknown>).id)
      .filter((id): id is number => typeof id === 'number')
  }
  if (Array.isArray(it.taskClasses)) {
    return it.taskClasses
      .map((tc: unknown) => {
        const t = tc as Record<string, unknown>
        if (typeof t.classGroupId === 'number') return t.classGroupId
        const cg = t.classGroup as Record<string, unknown> | undefined
        return cg != null ? cg.id : undefined
      })
      .filter((id): id is number => typeof id === 'number')
  }
  return []
}

function getItemClassGroupNames(item: unknown): string[] {
  if (item == null) return []
  const it = item as Record<string, unknown>
  if (Array.isArray(it.classNames)) return it.classNames.filter((n): n is string => typeof n === 'string')
  if (Array.isArray(it.classGroups)) {
    return it.classGroups
      .map((g: unknown) => (g as Record<string, unknown>).name)
      .filter((name): name is string => typeof name === 'string')
  }
  if (Array.isArray(it.taskClasses)) {
    return it.taskClasses
      .map((tc: unknown) => {
        const t = tc as Record<string, unknown>
        if (typeof t.classGroupName === 'string') return t.classGroupName
        const cg = t.classGroup as Record<string, unknown> | undefined
        return cg != null ? cg.name : undefined
      })
      .filter((name): name is string => typeof name === 'string')
  }
  return []
}

function applyViewFilter(
  items: ScheduleViewData[],
  viewType: 'all' | ViewType,
  viewTargetId: number | null,
): ScheduleViewData[] {
  if (viewType === 'all' || viewTargetId == null) return items
  return items.filter((item) => {
    switch (viewType) {
      case 'class':
        return getItemClassGroupIds(item).includes(viewTargetId)
      case 'teacher':
        return getItemTeacherId(item) === viewTargetId
      case 'room':
        // K34-A3B: match on primary OR secondary room.
        if (getItemRoomId(item) === viewTargetId) return true
        if (item.additionalRoomIds?.includes(viewTargetId)) return true
        return false
      default:
        return true
    }
  })
}

export default function DashboardContent() {
  const {
    viewType,
    viewTargetId,
    viewTargetName,
    classOptions,
    teacherOptions,
    roomOptions,
    isLoading,
    semesterSource,
    fetchSchedule,
    loadEntityOptions,
    setView,
    scheduleItems,
  } = useScheduleStore()

  // K25-E: semester selector integration
  const {
    currentSemesterId,
    loaded: semesterLoaded,
    fetchSemesters,
  } = useSemesterStore()

  const [selectedWeek, setSelectedWeek] = useState<WeekFilter>('ALL')
  const [effectiveItems, setEffectiveItems] = useState<ScheduleViewData[] | null>(null)
  const [effectiveLoading, setEffectiveLoading] = useState(false)

  // Room options for adjustment dialog
  const [allRoomOptions, setAllRoomOptions] = useState<{ id: number; name: string }[]>([])

  // Adjustment dialog state
  const [adjustDialogOpen, setAdjustDialogOpen] = useState(false)
  const [adjustItem, setAdjustItem] = useState<ScheduleViewData | null>(null)

  // Void confirmation state
  const [voidConfirmOpen, setVoidConfirmOpen] = useState(false)
  const [voidItem, setVoidItem] = useState<ScheduleViewData | null>(null)
  const [voidConfirmText, setVoidConfirmText] = useState('')
  const [voidExecuting, setVoidExecuting] = useState(false)
  // K14-FIX-A: schedule:adjust gates the void submission.
  const canAdjust = useHasPermission('schedule:adjust')
  // K28-A: USER-side request dialog state
  const canRequestAdjustment = useHasPermission('adjustment-request:create')
  const [requestDialogOpen, setRequestDialogOpen] = useState(false)

  // 初始化加载实体选项
  useEffect(() => {
    loadEntityOptions()
    // K25-E: load semester list on mount
    if (!semesterLoaded) {
      fetchSemesters()
    }
  }, [loadEntityOptions, semesterLoaded, fetchSemesters])

  // K25-E: refetch schedule when semester changes
  useEffect(() => {
    if (semesterLoaded && currentSemesterId != null) {
      fetchSchedule('all', undefined, currentSemesterId)
    }
  }, [semesterLoaded, currentSemesterId, fetchSchedule])

  // Fetch room options
  useEffect(() => {
    fetch('/api/rooms')
      .then((r) => r.json())
      .then((data) => {
        if (Array.isArray(data)) {
          setAllRoomOptions(data.map((r: { id: number; name: string; capacity?: number }) => ({
            id: r.id,
            name: r.capacity ? `${r.name} (${r.capacity}人)` : r.name,
          })))
        }
      })
      .catch(() => {})
  }, [])

  // Fetch effective schedule when week changes
  const fetchEffectiveSchedule = useCallback(async (week: number) => {
    setEffectiveLoading(true)
    try {
      // K25-E: pass currentSemesterId explicitly
      const url = withSemesterQuery(
        `/api/schedule?week=${week}&applyAdjustments=true`,
        currentSemesterId,
      )
      const res = await fetch(url)
      if (!res.ok) throw new Error('Failed to fetch')
      // K25-D: /api/schedule returns { items, semesterId, semesterSource }.
      // Extract items defensively to support both wrapped and raw-array shapes.
      const data = await res.json()
      const items = Array.isArray(data) ? data : data.items ?? []
      setEffectiveItems(items)
    } catch {
      toast.error('获取周课表失败')
      setEffectiveItems(null)
    } finally {
      setEffectiveLoading(false)
    }
  }, [currentSemesterId])

  useEffect(() => {
    if (selectedWeek === 'ALL') {
      setEffectiveItems(null)
    } else {
      fetchEffectiveSchedule(selectedWeek)
    }
  }, [selectedWeek, fetchEffectiveSchedule])

  const rawItems = selectedWeek === 'ALL' ? scheduleItems : (effectiveItems ?? [])
  const displayItems = applyViewFilter(rawItems, viewType, viewTargetId)

  const rawOptions =
    viewType === 'class'
      ? classOptions
      : viewType === 'teacher'
        ? teacherOptions
        : viewType === 'room'
          ? roomOptions
          : []
  const currentOptions = Array.isArray(rawOptions) ? rawOptions : []

  function handleViewTypeChange(type: string) {
    if (type === 'all') {
      setView('all', null, '')
      fetchSchedule('all', undefined, currentSemesterId)
    } else {
      const vt = type as ViewType
      const raw =
        vt === 'class'
          ? classOptions
          : vt === 'teacher'
            ? teacherOptions
            : roomOptions
      const options = Array.isArray(raw) ? raw : []
      const first = options[0]
      if (first) {
        setView(vt, first.id, first.name)
        fetchSchedule(vt, first.id, currentSemesterId)
      } else {
        setView(vt, null, '')
      }
    }
  }

  function handleTargetChange(name: string) {
    const safeOptions = Array.isArray(currentOptions) ? currentOptions : []
    const option = safeOptions.find((o) => o.name === name)
    if (option && viewType !== 'all') {
      setView(viewType, option.id, option.name)
      fetchSchedule(viewType, option.id, currentSemesterId)
    }
  }

  function handleAdjust(item: ScheduleViewData) {
    if (selectedWeek === 'ALL') {
      toast.error('请在具体周次视图下调课', { description: '先选择某一具体周次，再点击调课按钮' })
      return
    }
    // K28-A: USER (no schedule:adjust) opens the request dialog instead.
    if (!canAdjust && canRequestAdjustment) {
      setAdjustItem(item)
      setRequestDialogOpen(true)
      return
    }
    setAdjustItem(item)
    setAdjustDialogOpen(true)
  }

  function handleVoidAdjustment(item: ScheduleViewData) {
    setVoidItem(item)
    setVoidConfirmText('')
    setVoidConfirmOpen(true)
  }

  async function handleExecuteVoid() {
    if (!voidItem?.adjustmentId) return
    if (!canAdjust) {
      toast.error('没有调课权限', { description: '当前账号没有调课权限，无法撤销调课' })
      return
    }
    setVoidExecuting(true)
    try {
      await voidScheduleAdjustment(voidItem.adjustmentId)
      toast.success('撤销成功', { description: `${voidItem.courseName} 已恢复原位` })
      setVoidConfirmOpen(false)
      // Refresh effective schedule
      if (selectedWeek !== 'ALL') {
        fetchEffectiveSchedule(selectedWeek as number)
      }
    } catch (e) {
      toast.error('撤销失败', { description: String(e) })
    } finally {
      setVoidExecuting(false)
    }
  }

  function handleAdjustmentSaved() {
    if (selectedWeek !== 'ALL') {
      fetchEffectiveSchedule(selectedWeek as number)
    }
  }

  return (
    <div className="flex h-full overflow-hidden">
      <ScheduleSidebar />
      <main className="flex-1 overflow-hidden p-6">
        <div className="h-full flex flex-col">
          {/* 顶部栏：标题 + 视图切换器 */}
          <div className="mb-4 flex items-center justify-between">
            <div>
              <div className="flex items-center gap-3">
                <h1 className="text-xl font-bold text-gray-900">课程表看板</h1>
                {/* K25-E: semester selector */}
                <SemesterSelector className="ml-2" />
              </div>
              <p className="text-sm text-gray-500 mt-0.5">
                拖拽课程卡片到目标时间段进行调课，系统会自动检测冲突
                {selectedWeek !== 'ALL' && (
                  <span className="ml-2 text-blue-600 font-medium">
                    当前查看：第 {selectedWeek} 周
                  </span>
                )}
                {/* K25-E: active fallback warning */}
                {semesterSource === 'activeFallback' && (
                  <span className="ml-2 text-amber-500 text-xs">
                    (使用默认激活学期)
                  </span>
                )}
              </p>
            </div>

            {/* 视图切换器 */}
            <div className="flex items-center gap-2">
              {/* 周次选择 */}
              <select
                value={selectedWeek}
                onChange={(e) => {
                  const val = e.target.value
                  setSelectedWeek(val === 'ALL' ? 'ALL' : parseInt(val, 10))
                }}
                className="px-3 py-1.5 text-sm border border-gray-200 rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-blue-500"
              >
                {WEEK_OPTIONS.map((w) => (
                  <option key={w} value={w}>
                    {w === 'ALL' ? '全部显示' : `第 ${w} 周`}
                  </option>
                ))}
              </select>

              {/* 视图类型 */}
              <select
                value={viewType}
                onChange={(e) => handleViewTypeChange(e.target.value)}
                className="px-3 py-1.5 text-sm border border-gray-200 rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-blue-500"
              >
                <option value="all">全部</option>
                <option value="class">按班级</option>
                <option value="teacher">按教师</option>
                <option value="room">按教室</option>
              </select>

              {/* 目标对象 */}
              {viewType !== 'all' && (
                <select
                  value={viewTargetName}
                  onChange={(e) => handleTargetChange(e.target.value)}
                  disabled={isLoading || currentOptions.length === 0}
                  className="px-3 py-1.5 text-sm border border-gray-200 rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-blue-500 min-w-[140px]"
                >
                  {currentOptions.map((o) => (
                    <option key={o.id} value={o.name}>
                      {o.name}
                    </option>
                  ))}
                </select>
              )}

              {/* 当前视图标签 */}
              {viewType !== 'all' && viewTargetName && (
                <span className="text-sm text-blue-600 font-medium">
                  {VIEW_TYPE_LABELS[viewType]}：{viewTargetName}
                </span>
              )}

              {/* 课程计数 */}
              {selectedWeek !== 'ALL' && (
                <span className="text-xs text-gray-500">
                  {displayItems.length}/{scheduleItems.length} 门
                </span>
              )}

              {/* 导出按钮 */}
              <button
                onClick={() => {
                  const params = new URLSearchParams()
                  if (viewType !== 'all' && viewTargetId) {
                    params.set('viewType', viewType)
                    params.set('targetId', String(viewTargetId))
                  }
                  if (selectedWeek !== 'ALL') {
                    params.set('week', String(selectedWeek))
                    params.set('applyAdjustments', 'true')
                  }
                  // K25-E: pass semesterId to export
                  if (currentSemesterId != null) {
                    params.set('semesterId', String(currentSemesterId))
                  }
                  const query = params.toString()
                  window.location.href = `/api/export/excel${query ? '?' + query : ''}`
                }}
                className="flex items-center gap-1.5 px-3 py-1.5 text-sm bg-emerald-600 text-white rounded-lg hover:bg-emerald-700 transition-colors font-medium"
              >
                <FileDown className="w-4 h-4" />
                导出 Excel
              </button>
            </div>
          </div>

          <div className="flex-1 overflow-auto">
            {effectiveLoading ? (
              <div className="flex items-center justify-center h-full text-gray-400">加载中...</div>
            ) : (
              <ScheduleGrid
                items={displayItems}
                selectedWeek={selectedWeek}
                onAdjust={handleAdjust}
                onVoidAdjustment={handleVoidAdjustment}
              />
            )}
          </div>
        </div>
      </main>

      {/* 调课弹窗 */}
      <ScheduleAdjustmentDialog
        open={adjustDialogOpen}
        onOpenChange={setAdjustDialogOpen}
        week={selectedWeek === 'ALL' ? 1 : selectedWeek}
        item={adjustItem}
        roomOptions={allRoomOptions}
        onSaved={() => {
          if (selectedWeek !== 'ALL') {
            fetchEffectiveSchedule(selectedWeek as number)
          }
        }}
      />

      {/* K28-A: USER 调课申请弹窗 (PENDING-only) */}
      <UserAdjustmentRequestDialog
        open={requestDialogOpen}
        onOpenChange={setRequestDialogOpen}
        week={selectedWeek === 'ALL' ? 1 : selectedWeek}
        item={adjustItem}
        roomOptions={allRoomOptions}
        onSubmitted={() => {
          // No need to refresh the schedule — the request does not mutate it.
          // A small refresh still ensures the local "applied" filter is consistent.
        }}
      />

      {/* 撤销确认弹窗 */}
      <Dialog open={voidConfirmOpen} onOpenChange={setVoidConfirmOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>撤销调课</DialogTitle>
          </DialogHeader>
          <div className="space-y-3 text-sm">
            {voidItem && (
              <>
                <p>
                  撤销 <strong>{voidItem.courseName}</strong> 在第 {selectedWeek} 周的调课记录。
                </p>
                <p className="text-xs text-gray-500">
                  课程将恢复到原始位置：
                  {DAYS.find((d) => d.value === voidItem.dayOfWeek)?.label}{' '}
                  {TIME_SLOTS.find((t) => t.index === voidItem.slotIndex)?.label}
                </p>
              </>
            )}
            <div className="space-y-1.5">
              <Label>
                请输入 <span className="font-mono font-bold">VOID_ADJUSTMENT</span> 以确认：
              </Label>
              <Input
                value={voidConfirmText}
                onChange={(e) => setVoidConfirmText(e.target.value)}
                placeholder="VOID_ADJUSTMENT"
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setVoidConfirmOpen(false)} disabled={voidExecuting}>
              取消
            </Button>
            <Button
              variant="destructive"
              onClick={handleExecuteVoid}
              disabled={!canAdjust || voidConfirmText !== 'VOID_ADJUSTMENT' || voidExecuting}
              title={canAdjust ? undefined : '当前账号没有调课权限'}
            >
              {voidExecuting ? '撤销中...' : '确认撤销'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
