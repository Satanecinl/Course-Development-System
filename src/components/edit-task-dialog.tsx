'use client'

import { useState, useEffect, useCallback } from 'react'
import { toast } from 'sonner'
import { ScheduleViewData } from '@/types/schedule'
import { useScheduleStore } from '@/store/scheduleStore'
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { CreatableCombobox, MultiSelectCombobox, type EntityOption } from '@/components/combobox'

/* ─────────────── 编辑弹窗主组件 ─────────────── */

interface EditTaskDialogProps {
  item: ScheduleViewData
  open: boolean
  onOpenChange: (open: boolean) => void
}

const WEEK_TYPE_OPTIONS = [
  { value: 'ALL', label: '全周' },
  { value: 'ODD', label: '单周' },
  { value: 'EVEN', label: '双周' },
  { value: 'FIRST_HALF', label: '前八周' },
  { value: 'SECOND_HALF', label: '后八周' },
  { value: 'CUSTOM', label: '自定义' },
]

export function EditTaskDialog({ item, open, onOpenChange }: EditTaskDialogProps) {
  const { updateTask } = useScheduleStore()

  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)

  const [teachers, setTeachers] = useState<EntityOption[]>([])
  const [rooms, setRooms] = useState<(EntityOption & { capacity: number; building: string | null })[]>([])
  const [classGroups, setClassGroups] = useState<EntityOption[]>([])
  const [courses, setCourses] = useState<EntityOption[]>([])

  const [courseName, setCourseName] = useState(item.courseName)
  const [teacherId, setTeacherId] = useState<number | null>(null)
  const [roomId, setRoomId] = useState<number | null>(item.roomId)
  const [weekType, setWeekType] = useState(item.weekType)
  const [startWeek, setStartWeek] = useState(item.startWeek)
  const [endWeek, setEndWeek] = useState(item.endWeek)
  const [remark, setRemark] = useState(item.remark ?? '')
  const [classGroupIds, setClassGroupIds] = useState<number[]>([])

  useEffect(() => {
    if (!open) return

    async function loadData() {
      try {
        const [teachersRes, roomsRes, classGroupsRes, coursesRes] = await Promise.all([
          fetch('/api/teachers'),
          fetch('/api/rooms'),
          fetch('/api/class-groups'),
          fetch('/api/entity-list?type=course'),
        ])

        const teachersData = await teachersRes.json()
        const roomsData = await roomsRes.json()
        const classGroupsData = await classGroupsRes.json()
        const coursesData = await coursesRes.json()

        const teachersArr = Array.isArray(teachersData) ? teachersData : []
        const roomsArr = Array.isArray(roomsData) ? roomsData : []
        const classGroupsArr = Array.isArray(classGroupsData) ? classGroupsData : []
        const coursesArr = Array.isArray(coursesData) ? coursesData : []

        setTeachers(teachersArr)
        setRooms(roomsArr)
        setClassGroups(classGroupsArr)
        setCourses(coursesArr)

        if (item.teacherName) {
          const t = teachersArr.find((x: EntityOption) => x.name === item.teacherName)
          if (t) setTeacherId(t.id)
        }

        const ids = item.classNames
          .map((name) => classGroupsArr.find((x: EntityOption) => x.name === name)?.id)
          .filter((id: number | undefined): id is number => id !== undefined)
        setClassGroupIds(ids)
      } catch (err) {
        toast.error('加载数据失败', { description: String(err) })
      } finally {
        setLoading(false)
      }
    }

    loadData()
  }, [open, item])

  const handleCreateTeacher = useCallback(
    async (name: string) => {
      const res = await fetch('/api/teachers', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name }),
      })
      if (!res.ok) {
        const err = await res.json()
        toast.error('创建教师失败', { description: err.error || '未知错误' })
        return
      }
      const data = await res.json()
      setTeachers((prev) => {
        if (prev.some((t) => t.id === data.id)) return prev
        return [...prev, data].sort((a, b) => a.name.localeCompare(b.name, 'zh-CN'))
      })
      return data.id as number
    },
    []
  )

  const handleCreateCourse = useCallback(
    async (name: string) => {
      const res = await fetch('/api/courses', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name }),
      })
      if (!res.ok) {
        const err = await res.json()
        toast.error('创建课程失败', { description: err.error || '未知错误' })
        return
      }
      const data = await res.json()
      setCourses((prev) => {
        if (prev.some((c) => c.id === data.id)) return prev
        return [...prev, data].sort((a, b) => a.name.localeCompare(b.name, 'zh-CN'))
      })
      return data.id as number
    },
    []
  )

  async function handleSave() {
    const trimmedCourseName = courseName.trim()
    if (!trimmedCourseName) {
      toast.error('课程名称不能为空')
      return
    }
    if (startWeek < 1 || startWeek > 16 || endWeek < 1 || endWeek > 16 || startWeek > endWeek) {
      toast.error('起止周次必须在 1-16 之间且开始周不大于结束周')
      return
    }

    setSaving(true)
    try {
      const res = await fetch(`/api/teaching-task/${item.taskId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          courseName: trimmedCourseName,
          teacherId,
          roomId,
          weekType,
          startWeek,
          endWeek,
          remark: remark || null,
          classGroupIds,
        }),
      })

      if (!res.ok) {
        const err = await res.json()
        throw new Error(err.error || '更新失败')
      }

      const updatedItems: ScheduleViewData[] = await res.json()
      updateTask(item.taskId, updatedItems)
      toast.success('课程信息已更新')
      onOpenChange(false)
    } catch (err) {
      toast.error('保存失败', { description: String(err) })
    } finally {
      setSaving(false)
    }
  }

  const safeCourses = Array.isArray(courses) ? courses : []
  const safeTeachers = Array.isArray(teachers) ? teachers : []
  const safeRooms = Array.isArray(rooms) ? rooms : []
  const safeClassGroups = Array.isArray(classGroups) ? classGroups : []

  const roomOptions = safeRooms.map((r) => ({
    id: r.id,
    name: `${r.name}${r.capacity ? ` (${r.capacity}人)` : ''}`,
  }))

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>编辑课程信息</DialogTitle>
        </DialogHeader>

        {loading ? (
          <div className="py-8 text-center text-sm text-muted-foreground">加载中...</div>
        ) : (
          <div className="grid gap-4 py-2">
            {/* 课程名称 */}
            <div className="grid gap-1.5">
              <Label>课程名称</Label>
              <CreatableCombobox
                options={safeCourses}
                value={safeCourses.find((c) => c.name === courseName)?.id ?? null}
                onChange={(id) => {
                  const c = safeCourses.find((x) => x.id === id)
                  if (c) setCourseName(c.name)
                }}
                onCreate={async (name) => {
                  setCourseName(name)
                  return await handleCreateCourse(name)
                }}
                placeholder="选择或输入课程名称"
                searchPlaceholder="搜索课程..."
                creatableLabel={(name) => `使用 "${name}"`}
              />
            </div>

            {/* 授课教师 */}
            <div className="grid gap-1.5">
              <Label>授课教师</Label>
              <CreatableCombobox
                options={safeTeachers}
                value={teacherId}
                onChange={setTeacherId}
                onCreate={handleCreateTeacher}
                placeholder="选择或创建教师"
                searchPlaceholder="搜索教师..."
                creatableLabel={(name) => `创建教师 "${name}"`}
              />
            </div>

            {/* 上课教室 */}
            <div className="grid gap-1.5">
              <Label>上课教室</Label>
              <CreatableCombobox
                options={roomOptions}
                value={roomId}
                onChange={setRoomId}
                onCreate={async () => {}}
                placeholder="选择教室"
                searchPlaceholder="搜索教室..."
              />
            </div>

            {/* 周次类型 + 起止周 */}
            <div className="grid grid-cols-3 gap-3">
              <div className="grid gap-1.5">
                <Label>周次类型</Label>
                <Select value={weekType} onValueChange={(v) => v && setWeekType(v)}>
                  <SelectTrigger className="w-full">
                    <SelectValue placeholder="选择周次类型" />
                  </SelectTrigger>
                  <SelectContent>
                    {WEEK_TYPE_OPTIONS.map((opt) => (
                      <SelectItem key={opt.value} value={opt.value}>
                        {opt.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="grid gap-1.5">
                <Label>开始周</Label>
                <Input
                  type="number"
                  min={1}
                  max={16}
                  value={startWeek}
                  onChange={(e) => setStartWeek(parseInt(e.target.value, 10) || 1)}
                />
              </div>
              <div className="grid gap-1.5">
                <Label>结束周</Label>
                <Input
                  type="number"
                  min={1}
                  max={16}
                  value={endWeek}
                  onChange={(e) => setEndWeek(parseInt(e.target.value, 10) || 1)}
                />
              </div>
            </div>

            {/* 合班班级 */}
            <div className="grid gap-1.5">
              <Label>合班班级</Label>
              <MultiSelectCombobox
                options={safeClassGroups}
                selected={classGroupIds}
                onChange={setClassGroupIds}
                placeholder="选择合班班级（可多选）"
                searchPlaceholder="搜索班级..."
              />
            </div>

            {/* 备注 */}
            <div className="grid gap-1.5">
              <Label>备注</Label>
              <Input
                value={remark}
                onChange={(e) => setRemark(e.target.value)}
                placeholder="合班信息或其他备注"
              />
            </div>
          </div>
        )}

        <DialogFooter className="mt-2">
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={saving}>
            取消
          </Button>
          <Button onClick={handleSave} disabled={loading || saving}>
            {saving ? '保存中...' : '保存'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
