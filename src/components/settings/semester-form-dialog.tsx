'use client'

import { useState } from 'react'
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
import type { SemesterWithCounts, SemesterCreateInput, SemesterUpdateInput } from '@/lib/semesters/semester-settings-client'

interface SemesterFormDialogProps {
  open: boolean
  mode: 'create' | 'edit'
  semester?: SemesterWithCounts | null
  saving: boolean
  onOpenChange: (open: boolean) => void
  onSubmit: (input: SemesterCreateInput | SemesterUpdateInput) => void
}

function formatDateForInput(iso: string | null): string {
  if (!iso) return ''
  return iso.substring(0, 10)
}

function getInitialValues(mode: 'create' | 'edit', semester?: SemesterWithCounts | null) {
  if (mode === 'edit' && semester) {
    return {
      name: semester.name,
      code: semester.code,
      academicYear: semester.academicYear ?? '',
      term: semester.term ?? '',
      startsAt: formatDateForInput(semester.startsAt),
      endsAt: formatDateForInput(semester.endsAt),
      isActive: semester.isActive,
    }
  }
  return {
    name: '',
    code: '',
    academicYear: '',
    term: '',
    startsAt: '',
    endsAt: '',
    isActive: false,
  }
}

export function SemesterFormDialog({
  open,
  mode,
  semester,
  saving,
  onOpenChange,
  onSubmit,
}: SemesterFormDialogProps) {
  // Key-based remount in parent ensures fresh state on each open — no useEffect needed
  const init = getInitialValues(mode, semester)
  const [name, setName] = useState(init.name)
  const [code, setCode] = useState(init.code)
  const [academicYear, setAcademicYear] = useState(init.academicYear)
  const [term, setTerm] = useState(init.term)
  const [startsAt, setStartsAt] = useState(init.startsAt)
  const [endsAt, setEndsAt] = useState(init.endsAt)
  const [isActive, setIsActive] = useState(init.isActive)
  const [error, setError] = useState('')

  function validate(): string | null {
    if (!name.trim()) return '学期名称不能为空'
    if (!code.trim()) return '学期代码不能为空'
    if (startsAt && endsAt && startsAt >= endsAt) return '开始日期必须早于结束日期'
    return null
  }

  function handleSubmit() {
    const err = validate()
    if (err) {
      setError(err)
      return
    }
    setError('')
    const input: SemesterCreateInput | SemesterUpdateInput = {
      name: name.trim(),
      code: code.trim(),
      academicYear: academicYear.trim() || null,
      term: term.trim() || null,
      startsAt: startsAt || null,
      endsAt: endsAt || null,
      isActive,
    }
    onSubmit(input)
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>
            {mode === 'create' ? '新增学期' : '编辑学期'}
          </DialogTitle>
        </DialogHeader>

        <div className="grid gap-4 py-2">
          {error && (
            <div className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-md px-3 py-2">
              {error}
            </div>
          )}

          <div className="grid gap-1.5">
            <Label>学期名称 <span className="text-red-500">*</span></Label>
            <Input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="例：2026年春季学期"
            />
          </div>

          <div className="grid gap-1.5">
            <Label>学期代码 <span className="text-red-500">*</span></Label>
            <Input
              value={code}
              onChange={(e) => setCode(e.target.value)}
              placeholder="例：2026SPRING"
              disabled={mode === 'edit'}
            />
            {mode === 'edit' && (
              <p className="text-xs text-gray-400">代码创建后不可修改</p>
            )}
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="grid gap-1.5">
              <Label>学年</Label>
              <Input
                value={academicYear}
                onChange={(e) => setAcademicYear(e.target.value)}
                placeholder="例：2025-2026"
              />
            </div>
            <div className="grid gap-1.5">
              <Label>学期</Label>
              <Input
                value={term}
                onChange={(e) => setTerm(e.target.value)}
                placeholder="例：1 或 2"
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="grid gap-1.5">
              <Label>开始日期</Label>
              <Input
                type="date"
                value={startsAt}
                onChange={(e) => setStartsAt(e.target.value)}
              />
            </div>
            <div className="grid gap-1.5">
              <Label>结束日期</Label>
              <Input
                type="date"
                value={endsAt}
                onChange={(e) => setEndsAt(e.target.value)}
              />
            </div>
          </div>

          <div className="flex items-center gap-2">
            <input
              type="checkbox"
              id="isActive"
              checked={isActive}
              onChange={(e) => setIsActive(e.target.checked)}
              className="h-4 w-4 rounded border-gray-300"
            />
            <Label htmlFor="isActive" className="cursor-pointer">
              设为当前学期
            </Label>
            {isActive && (
              <span className="text-xs text-amber-600">
                将取消其他学期的当前状态
              </span>
            )}
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={saving}>
            取消
          </Button>
          <Button onClick={handleSubmit} disabled={saving}>
            {saving ? '保存中...' : mode === 'create' ? '创建' : '保存'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
