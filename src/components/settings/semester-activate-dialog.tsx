'use client'

import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import type { SemesterWithCounts } from '@/lib/semesters/semester-settings-client'

interface SemesterActivateDialogProps {
  open: boolean
  semester: SemesterWithCounts | null
  activating: boolean
  onOpenChange: (open: boolean) => void
  onConfirm: () => void
}

export function SemesterActivateDialog({
  open,
  semester,
  activating,
  onOpenChange,
  onConfirm,
}: SemesterActivateDialogProps) {
  if (!semester) return null

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-sm">
        <DialogHeader>
          <DialogTitle>设置当前学期</DialogTitle>
        </DialogHeader>

        <div className="text-sm text-gray-600">
          <p>
            确定将 <strong>{semester.name}</strong> 设为当前学期吗？
          </p>
          <p className="mt-2 text-xs text-gray-400">
            系统中其他学期将被取消当前状态。
          </p>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={activating}>
            取消
          </Button>
          <Button onClick={onConfirm} disabled={activating}>
            {activating ? '设置中...' : '确认设置'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
