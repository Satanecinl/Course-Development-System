'use client'

import { useEffect, useState } from 'react'
import { toast } from 'sonner'
import { AdminSidebar } from '@/components/admin-db/admin-sidebar'
import { AdminToolbar } from '@/components/admin-db/admin-toolbar'
import { AdminDataTable } from '@/components/admin-db/admin-data-table'
import { SemesterSelector } from '@/components/semester-selector'
import { useSemesterStore } from '@/store/semesterStore'
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
import { ImportBatchHistory } from '@/components/import-batch-history'
import { ScheduleSlotDialog } from '@/components/admin-db/schedule-slot-dialog'
import { TeachingTaskDialog } from '@/components/admin-db/teaching-task-dialog'
import { useHasPermission } from '@/components/layout/current-user-context'
import type { EntityOption } from '@/components/combobox'
import type { DbRecord } from '@/lib/admin-db/types'
import { TABLES, MASTER_TABLES, DEDICATED_TABLES, GLOBAL_MASTER_TABLES, getFormFields, getDefaultFormData, getAdminModelWritePermission } from '@/lib/admin-db/config'
import { getColumns, getCellValue } from '@/lib/admin-db/columns'
import { fetchAdminTableRecords, fetchAdminTableCounts, fetchEntityOptions as apiFetchEntityOptions, fetchTaskOptions as apiFetchTaskOptions, createNamedEntity } from '@/lib/admin-db/api'

const EMPTY_DEPARTMENT_FILTER = '__EMPTY_DEPARTMENT__'

export default function AdminDbContent() {
  const [activeTable, setActiveTable] = useState('scheduleslot')
  const [records, setRecords] = useState<DbRecord[]>([])
  const [loading, setLoading] = useState(false)
  const [counts, setCounts] = useState<Record<string, number>>({})
  const [departmentFilter, setDepartmentFilter] = useState<string>('ALL')

  // K25-E: semester store
  const {
    currentSemesterId,
    loaded: semesterLoaded,
    fetchSemesters,
  } = useSemesterStore()
  // 通用弹窗状态
  const [dialogOpen, setDialogOpen] = useState(false)
  const [dialogMode, setDialogMode] = useState<'create' | 'edit'>('create')
  const [editingRecord, setEditingRecord] = useState<DbRecord | null>(null)
  const [formData, setFormData] = useState<Record<string, unknown>>({})
  const [saving, setSaving] = useState(false)

  // TeachingTask 专用弹窗状态
  const [taskDialogOpen, setTaskDialogOpen] = useState(false)
  const [taskDialogMode, setTaskDialogMode] = useState<'create' | 'edit'>('create')
  const [editingTask, setEditingTask] = useState<DbRecord | null>(null)
  const [taskForm, setTaskForm] = useState({
    courseId: null as number | null,
    teacherId: null as number | null,
    weekType: 'ALL',
    startWeek: 1,
    endWeek: 16,
    remark: '',
    classGroupIds: [] as number[],
  })

  // ScheduleSlot 专用弹窗状态
  const [slotDialogOpen, setSlotDialogOpen] = useState(false)
  const [slotDialogMode, setSlotDialogMode] = useState<'create' | 'edit'>('create')
  const [editingSlot, setEditingSlot] = useState<DbRecord | null>(null)
  const [slotForm, setSlotForm] = useState({
    teachingTaskId: null as number | null,
    roomId: null as number | null,
    dayOfWeek: 1,
    slotIndex: 1,
  })

  // 导入历史弹窗状态
  const [importHistoryOpen, setImportHistoryOpen] = useState(false)

  // K15-FIX-E: Model-specific permission gating
  const canWriteCurrentModel = useHasPermission(getAdminModelWritePermission(activeTable))
  const canDelete = useHasPermission('data:delete')

  // 下拉选项
  const [courses, setCourses] = useState<EntityOption[]>([])
  const [teachers, setTeachers] = useState<EntityOption[]>([])
  const [rooms, setRooms] = useState<(EntityOption & { building: string | null })[]>([])
  const [classGroups, setClassGroups] = useState<EntityOption[]>([])
  const [taskOptions, setTaskOptions] = useState<EntityOption[]>([])

  async function fetchEntityOptions() {
    try {
      // K25-E: read semesterId from store at call time (avoids closure capture
      // that would make this function unstable and trigger exhaustive-deps).
      const sid = useSemesterStore.getState().currentSemesterId
      const data = await apiFetchEntityOptions(sid)
      setCourses(data.courses)
      setTeachers(data.teachers)
      setRooms(data.rooms)
      setClassGroups(data.classGroups)
    } catch {
      // silent fail
    }
  }

  async function fetchTaskOptions() {
    try {
      const sid = useSemesterStore.getState().currentSemesterId
      const options = await apiFetchTaskOptions(sid)
      setTaskOptions(options)
    } catch {
      // silent fail
    }
  }

  async function fetchCounts() {
    const result = await fetchAdminTableCounts()
    setCounts(result)
  }

  async function fetchData(table?: string) {
    const t = table ?? activeTable
    setLoading(true)
    try {
      // K25-E: read semesterId from store at call time (avoids closure capture).
      const sid = useSemesterStore.getState().currentSemesterId
      const data = await fetchAdminTableRecords(t, sid)
      setRecords(data)
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e)
      toast.error('获取数据失败', { description: msg })
      setRecords([])
    } finally {
      setLoading(false)
    }
  }

  function handleTableChange(key: string) {
    setActiveTable(key)
    setDepartmentFilter('ALL')
  }

  // K25-E: load semester list on mount
  useEffect(() => {
    if (!semesterLoaded) {
      fetchSemesters()
    }
  }, [semesterLoaded, fetchSemesters])

  // Refetch table data when table or semester changes (merged K25-E semester
  // change handler with the original activeTable handler to avoid an extra
  // useEffect and the associated set-state-in-effect lint error).
  useEffect(() => {
    if (semesterLoaded) {
      fetchData(activeTable)
    }
  }, [activeTable, semesterLoaded, currentSemesterId])

  useEffect(() => {
    fetchCounts()
    fetchEntityOptions()
  }, [])

  // ── 通用弹窗 (master 表) ──

  function openCreate() {
    if (!canWriteCurrentModel) {
      toast.error('无权限', { description: `当前模型需要 ${getAdminModelWritePermission(activeTable)}` })
      return
    }
    if (activeTable === 'teachingtask') {
      openTaskCreate()
      return
    }
    if (activeTable === 'scheduleslot') {
      openSlotCreate()
      return
    }
    setDialogMode('create')
    setEditingRecord(null)
    setFormData(getDefaultFormData(activeTable))
    setDialogOpen(true)
  }

  function openEdit(record: DbRecord) {
    if (!canWriteCurrentModel) {
      toast.error('无权限', { description: `当前模型需要 ${getAdminModelWritePermission(activeTable)}` })
      return
    }
    if (activeTable === 'teachingtask') {
      openTaskEdit(record)
      return
    }
    if (activeTable === 'scheduleslot') {
      openSlotEdit(record)
      return
    }
    setDialogMode('edit')
    setEditingRecord(record)
    const fields = getFormFields(activeTable)
    const init: Record<string, unknown> = {}
    for (const f of fields) {
      init[f.key] = record[f.key] ?? (f.type === 'number' ? 50 : '')
    }
    setFormData(init)
    setDialogOpen(true)
  }

  async function handleSave() {
    if (!canWriteCurrentModel) {
      toast.error('无权限', { description: `当前模型需要 ${getAdminModelWritePermission(activeTable)}` })
      return
    }
    const fields = getFormFields(activeTable)
    for (const f of fields) {
      if (f.required && !String(formData[f.key] || '').trim()) {
        toast.error(`${f.label}不能为空`)
        return
      }
    }

    if (
      dialogMode === 'edit' &&
      !confirm('修改主数据将全局生效，影响所有关联的排课卡片，是否继续？')
    ) {
      return
    }

    setSaving(true)
    try {
      const method = dialogMode === 'create' ? 'POST' : 'PUT'
      const body =
        dialogMode === 'create'
          ? { ...formData }
          : { ...formData, id: editingRecord?.id }

      const res = await fetch(`/api/admin/${activeTable}`, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })

      const result = await res.json()
      if (res.ok && result.success) {
        toast.success(dialogMode === 'create' ? '创建成功' : '保存成功', {
          description: '主数据已更新，请刷新 Dashboard 以获取最新课表',
        })
        setDialogOpen(false)
        fetchData()
        fetchCounts()
      } else if (res.status === 409) {
        toast.error('操作失败', { description: result.error })
      } else {
        throw new Error(result.error || '操作失败')
      }
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e)
      toast.error('操作失败', { description: msg })
    } finally {
      setSaving(false)
    }
  }

  async function deleteRecord(id: number) {
    if (!canDelete) {
      toast.error('无权限', { description: '删除操作需要 data:delete 权限' })
      return
    }
    if (!confirm('确定要删除这条记录吗？此操作不可撤销。')) return

    try {
      const res = await fetch(`/api/admin/${activeTable}`, {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id }),
      })

      const result = await res.json()
      if (res.ok && result.success) {
        toast.success('删除成功')
        fetchData()
        fetchCounts()
      } else if (res.status === 409) {
        toast.error('删除失败：该实体已被引用', {
          description: result.error || `已被 ${result.refCount} 条${result.refType}记录引用，请先在 Dashboard 中解除排课。`,
        })
      } else {
        toast.error('删除失败', { description: result.error || '未知错误' })
      }
    } catch (e) {
      toast.error('删除失败', { description: String(e) })
    }
  }

  // ── TeachingTask 专用弹窗 ──

  function openTaskCreate() {
    setTaskDialogMode('create')
    setEditingTask(null)
    setTaskForm({
      courseId: null,
      teacherId: null,
      weekType: 'ALL',
      startWeek: 1,
      endWeek: 16,
      remark: '',
      classGroupIds: [],
    })
    fetchEntityOptions()
    setTaskDialogOpen(true)
  }

  function openTaskEdit(record: DbRecord) {
    setTaskDialogMode('edit')
    setEditingTask(record)
    const r = record as Record<string, unknown>
    const course = r.course as { id: number } | undefined
    const teacher = r.teacher as { id: number } | undefined
    const taskClasses = r.taskClasses as { classGroup: { id: number } }[] | undefined
    setTaskForm({
      courseId: course?.id ?? (r.courseId as number) ?? null,
      teacherId: teacher?.id ?? (r.teacherId as number) ?? null,
      weekType: (r.weekType as string) || 'ALL',
      startWeek: (r.startWeek as number) || 1,
      endWeek: (r.endWeek as number) || 16,
      remark: (r.remark as string) || '',
      classGroupIds: taskClasses?.map((tc) => tc.classGroup.id) ?? [],
    })
    fetchEntityOptions()
    setTaskDialogOpen(true)
  }

  async function handleTaskSave() {
    if (!canWriteCurrentModel) {
      toast.error('无权限', { description: '当前模型需要 teaching-task:write' })
      return
    }
    if (!taskForm.courseId) {
      toast.error('请选择课程')
      return
    }

    setSaving(true)
    try {
      if (taskDialogMode === 'create') {
        const res = await fetch('/api/teaching-task', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(taskForm),
        })
        const result = await res.json()
        if (res.ok && result.success) {
          toast.success('教学任务创建成功')
          setTaskDialogOpen(false)
          fetchData()
          fetchCounts()
        } else {
          throw new Error(result.error || '创建失败')
        }
      } else {
        // Edit: use the dedicated PUT route (no conflict check — Admin privilege)
        const res = await fetch(`/api/teaching-task/${editingTask?.id}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            courseName: courses.find((c) => c.id === taskForm.courseId)?.name || '',
            teacherId: taskForm.teacherId,
            weekType: taskForm.weekType,
            startWeek: taskForm.startWeek,
            endWeek: taskForm.endWeek,
            remark: taskForm.remark,
            classGroupIds: taskForm.classGroupIds,
          }),
        })
        const result = await res.json()
        if (res.ok) {
          toast.success('教学任务已更新')
          setTaskDialogOpen(false)
          fetchData()
          fetchCounts()
        } else {
          throw new Error(result.error || '更新失败')
        }
      }
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e)
      toast.error('操作失败', { description: msg })
    } finally {
      setSaving(false)
    }
  }

  // ── ScheduleSlot 专用弹窗 ──

  function openSlotCreate() {
    setSlotDialogMode('create')
    setEditingSlot(null)
    setSlotForm({
      teachingTaskId: null,
      roomId: null,
      dayOfWeek: 1,
      slotIndex: 1,
    })
    fetchEntityOptions()
    fetchTaskOptions()
    setSlotDialogOpen(true)
  }

  function openSlotEdit(record: DbRecord) {
    setSlotDialogMode('edit')
    setEditingSlot(record)
    const r = record as Record<string, unknown>
    const teachingTask = r.teachingTask as { id: number } | undefined
    const room = r.room as { id: number } | undefined
    setSlotForm({
      teachingTaskId: teachingTask?.id ?? (r.teachingTaskId as number) ?? null,
      roomId: room?.id ?? (r.roomId as number) ?? null,
      dayOfWeek: (r.dayOfWeek as number) || 1,
      slotIndex: (r.slotIndex as number) || 1,
    })
    fetchEntityOptions()
    fetchTaskOptions()
    setSlotDialogOpen(true)
  }

  async function handleSlotSave() {
    if (!canWriteCurrentModel) {
      toast.error('无权限', { description: '当前模型需要 schedule:write' })
      return
    }
    if (!slotForm.teachingTaskId) {
      toast.error('请选择教学任务')
      return
    }
    if (slotForm.dayOfWeek < 1 || slotForm.dayOfWeek > 7) {
      toast.error('星期无效')
      return
    }
    if (slotForm.slotIndex < 1 || slotForm.slotIndex > 7) {
      toast.error('节次无效')
      return
    }

    setSaving(true)
    try {
      if (slotDialogMode === 'create') {
        const res = await fetch('/api/schedule-slot', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(slotForm),
        })
        const result = await res.json()
        if (res.ok && result.success) {
          toast.success('排课时段创建成功')
          setSlotDialogOpen(false)
          fetchData()
          fetchCounts()
        } else {
          throw new Error(result.error || '创建失败')
        }
      } else {
        // Edit: use the dedicated PUT route (Admin force — no conflict check)
        const res = await fetch(`/api/schedule-slot/${editingSlot?.id}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            dayOfWeek: slotForm.dayOfWeek,
            slotIndex: slotForm.slotIndex,
            roomId: slotForm.roomId,
          }),
        })
        const result = await res.json()
        if (res.ok) {
          toast.success('排课时段已更新')
          setSlotDialogOpen(false)
          fetchData()
          fetchCounts()
        } else {
          throw new Error(result.error || '更新失败')
        }
      }
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e)
      toast.error('操作失败', { description: msg })
    } finally {
      setSaving(false)
    }
  }

  // ── 列定义与渲染 ──

  const isMasterTable = MASTER_TABLES.has(activeTable)
  const isDedicatedTable = DEDICATED_TABLES.has(activeTable)

  function handleCreateNamedEntity(
    endpoint: string,
    setter: React.Dispatch<React.SetStateAction<EntityOption[]>>,
  ): (name: string) => Promise<number | void> {
    return async (name: string) => {
      const id = await createNamedEntity(endpoint, name)
      if (id) {
        setter((prev) => [...prev, { id, name }])
        return id
      }
    }
  }

  const handleCreateCourse = handleCreateNamedEntity('/api/courses', setCourses)
  const handleCreateTeacher = handleCreateNamedEntity('/api/teachers', setTeachers)

  const columns = getColumns(activeTable, records)

  function getDepartmentFilterValue(record: DbRecord): string {
    const department = record.department
    if (typeof department !== 'string') return EMPTY_DEPARTMENT_FILTER
    const trimmed = department.trim()
    return trimmed.length > 0 && trimmed !== '-' ? trimmed : EMPTY_DEPARTMENT_FILTER
  }

  const teacherDepartmentOptions =
    activeTable === 'teacher'
      ? Array.from(new Set(records.map(getDepartmentFilterValue))).sort((a, b) => {
          if (a === EMPTY_DEPARTMENT_FILTER) return 1
          if (b === EMPTY_DEPARTMENT_FILTER) return -1
          return a.localeCompare(b, 'zh-CN')
        })
      : []

  function compareTeacherEmployeeNo(a: DbRecord, b: DbRecord): number {
    const aNo = typeof a.employeeNo === 'string' ? a.employeeNo.trim() : ''
    const bNo = typeof b.employeeNo === 'string' ? b.employeeNo.trim() : ''

    if (!aNo && !bNo) return a.id - b.id
    if (!aNo) return 1
    if (!bNo) return -1
    return aNo.localeCompare(bNo, 'zh-CN', { numeric: true })
  }

  const visibleRecords =
    activeTable === 'teacher'
      ? records
          .filter((record) => departmentFilter === 'ALL' || getDepartmentFilterValue(record) === departmentFilter)
          .slice()
          .sort(compareTeacherEmployeeNo)
      : records

  return (
    <div className="min-h-screen bg-gray-50 flex">
      {/* 左侧导航 */}
      <AdminSidebar
        tables={TABLES}
        activeTable={activeTable}
        counts={counts}
        onTableChange={handleTableChange}
        onRefresh={() => {
          fetchData()
          fetchCounts()
          toast.success('数据已刷新')
        }}
      />

      {/* 右侧内容 */}
      <main className="flex-1 overflow-auto p-6">
        <div className="mb-4 flex items-center justify-between">
          <AdminToolbar
            tableName={TABLES.find((t) => t.key === activeTable)?.label ?? ''}
            recordCount={visibleRecords.length}
            onAddClick={openCreate}
            onHistoryClick={() => setImportHistoryOpen(true)}
            canCreate={canWriteCurrentModel}
            badge={GLOBAL_MASTER_TABLES.has(activeTable) ? '全局主数据' : undefined}
          />
          {/* K25-E: semester selector */}
          <div className="flex items-center gap-3">
            {activeTable === 'teacher' && (
              <div className="flex items-center gap-2">
                <label className="text-xs text-gray-500 whitespace-nowrap">部门</label>
                <select
                  value={departmentFilter}
                  onChange={(e) => setDepartmentFilter(e.target.value)}
                  className="h-9 min-w-[180px] rounded-lg border border-gray-200 bg-white px-2 text-sm"
                  aria-label="按部门筛选教师"
                >
                  <option value="ALL">全部部门</option>
                  {teacherDepartmentOptions.map((department) => (
                    <option key={department} value={department}>
                      {department === EMPTY_DEPARTMENT_FILTER ? '未设置' : department}
                    </option>
                  ))}
                </select>
              </div>
            )}
            <SemesterSelector className="ml-4" showFallbackWarning={false} />
          </div>
        </div>

        <AdminDataTable
          records={visibleRecords}
          loading={loading}
          columns={columns}
          activeTable={activeTable}
          getCellValue={getCellValue}
          onEdit={openEdit}
          onDelete={deleteRecord}
          canEdit={canWriteCurrentModel}
          canDelete={canDelete}
        />
      </main>

      {/* ── 通用弹窗 (master 表) ── */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>
              {dialogMode === 'create'
                ? `新增${TABLES.find((t) => t.key === activeTable)?.label.replace('表', '')}`
                : `编辑${TABLES.find((t) => t.key === activeTable)?.label.replace('表', '')}`}
            </DialogTitle>
          </DialogHeader>

          <div className="grid gap-4 py-2">
            {getFormFields(activeTable).map((field) => (
              <div key={field.key} className="grid gap-1.5">
                <Label>
                  {field.label}
                  {field.required && <span className="text-red-500 ml-0.5">*</span>}
                </Label>
                <Input
                  type={field.type === 'number' ? 'number' : 'text'}
                  value={String(formData[field.key] ?? '')}
                  onChange={(e) =>
                    setFormData((prev) => ({
                      ...prev,
                      [field.key]:
                        field.type === 'number'
                          ? parseInt(e.target.value, 10) || 0
                          : e.target.value,
                    }))
                  }
                  placeholder={`请输入${field.label}`}
                />
              </div>
            ))}
          </div>

          <DialogFooter className="mt-2">
            <Button variant="outline" onClick={() => setDialogOpen(false)} disabled={saving}>
              取消
            </Button>
            <Button onClick={handleSave} disabled={saving}>
              {saving ? '保存中...' : '保存'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── TeachingTask 专用弹窗 ── */}
      <TeachingTaskDialog
        open={taskDialogOpen}
        mode={taskDialogMode}
        taskForm={taskForm}
        courseOptions={courses}
        teacherOptions={teachers}
        classGroupOptions={classGroups}
        saving={saving}
        onOpenChange={setTaskDialogOpen}
        onFieldChange={(field, value) => setTaskForm((prev) => ({ ...prev, [field]: value }))}
        onSubmit={handleTaskSave}
        onCreateCourse={handleCreateCourse}
        onCreateTeacher={handleCreateTeacher}
      />

      {/* ── ScheduleSlot 专用弹窗 ── */}
      <ScheduleSlotDialog
        open={slotDialogOpen}
        mode={slotDialogMode}
        slotForm={slotForm}
        taskOptions={taskOptions}
        roomOptions={rooms}
        saving={saving}
        onOpenChange={setSlotDialogOpen}
        onFieldChange={(field, value) => setSlotForm((prev) => ({ ...prev, [field]: value }))}
        onSubmit={handleSlotSave}
      />

      {/* 导入历史弹窗 */}
      <ImportBatchHistory open={importHistoryOpen} onOpenChange={setImportHistoryOpen} />
    </div>
  )
}
