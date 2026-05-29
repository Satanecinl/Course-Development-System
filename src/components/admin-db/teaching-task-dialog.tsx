'use client'

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
import { WEEK_TYPES } from '@/lib/admin-db/config'

export interface TeachingTaskFormState {
  courseId: number | null
  teacherId: number | null
  weekType: string
  startWeek: number
  endWeek: number
  remark: string
  classGroupIds: number[]
}

interface TeachingTaskDialogProps {
  open: boolean
  mode: 'create' | 'edit'
  taskForm: TeachingTaskFormState
  courseOptions: EntityOption[]
  teacherOptions: EntityOption[]
  classGroupOptions: EntityOption[]
  saving: boolean
  onOpenChange: (open: boolean) => void
  onFieldChange: <K extends keyof TeachingTaskFormState>(field: K, value: TeachingTaskFormState[K]) => void
  onSubmit: () => void
  onCreateCourse: (name: string) => Promise<number | void>
  onCreateTeacher: (name: string) => Promise<number | void>
}

export function TeachingTaskDialog({
  open,
  mode,
  taskForm,
  courseOptions,
  teacherOptions,
  classGroupOptions,
  saving,
  onOpenChange,
  onFieldChange,
  onSubmit,
  onCreateCourse,
  onCreateTeacher,
}: TeachingTaskDialogProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>
            {mode === 'create' ? '新增教学任务' : '编辑教学任务'}
          </DialogTitle>
        </DialogHeader>

        <div className="grid gap-4 py-2">
          {/* 课程 */}
          <div className="grid gap-1.5">
            <Label>课程 <span className="text-red-500">*</span></Label>
            <CreatableCombobox
              options={courseOptions}
              value={taskForm.courseId}
              onChange={(id) => onFieldChange('courseId', id)}
              onCreate={onCreateCourse}
              placeholder="选择课程"
              creatableLabel={(name) => `创建课程 "${name}"`}
            />
          </div>

          {/* 教师 */}
          <div className="grid gap-1.5">
            <Label>教师</Label>
            <CreatableCombobox
              options={teacherOptions}
              value={taskForm.teacherId}
              onChange={(id) => onFieldChange('teacherId', id)}
              onCreate={onCreateTeacher}
              placeholder="选择教师（可选）"
              creatableLabel={(name) => `创建教师 "${name}"`}
            />
          </div>

          {/* 周次类型 */}
          <div className="grid gap-1.5">
            <Label>周次类型 <span className="text-red-500">*</span></Label>
            <Select
              value={taskForm.weekType}
              onValueChange={(v) => onFieldChange('weekType', v ?? 'ALL')}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {WEEK_TYPES.map((wt) => (
                  <SelectItem key={wt.value} value={wt.value}>
                    {wt.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* 开始周 / 结束周 */}
          <div className="grid grid-cols-2 gap-4">
            <div className="grid gap-1.5">
              <Label>开始周</Label>
              <Input
                type="number"
                min={1}
                max={16}
                value={taskForm.startWeek}
                onChange={(e) =>
                  onFieldChange('startWeek', parseInt(e.target.value, 10) || 1)
                }
              />
            </div>
            <div className="grid gap-1.5">
              <Label>结束周</Label>
              <Input
                type="number"
                min={1}
                max={16}
                value={taskForm.endWeek}
                onChange={(e) =>
                  onFieldChange('endWeek', parseInt(e.target.value, 10) || 16)
                }
              />
            </div>
          </div>

          {/* 合班班级 */}
          <div className="grid gap-1.5">
            <Label>合班班级</Label>
            <MultiSelectCombobox
              options={classGroupOptions}
              selected={taskForm.classGroupIds}
              onChange={(ids) => onFieldChange('classGroupIds', ids)}
              placeholder="选择合班班级（可多选）"
              searchPlaceholder="搜索班级..."
            />
          </div>

          {/* 备注 */}
          <div className="grid gap-1.5">
            <Label>备注</Label>
            <Input
              value={taskForm.remark}
              onChange={(e) => onFieldChange('remark', e.target.value)}
              placeholder="合班信息或其他备注"
            />
          </div>
        </div>

        <DialogFooter className="mt-2">
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={saving}>
            取消
          </Button>
          <Button onClick={onSubmit} disabled={saving}>
            {saving ? '保存中...' : '保存'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
