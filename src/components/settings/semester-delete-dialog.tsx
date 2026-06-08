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

interface SemesterDeleteDialogProps {
  open: boolean
  semester: SemesterWithCounts | null
  deleting: boolean
  onOpenChange: (open: boolean) => void
  onConfirm: () => void
}

export function SemesterDeleteDialog({
  open,
  semester,
  deleting,
  onOpenChange,
  onConfirm,
}: SemesterDeleteDialogProps) {
  if (!semester) return null

  const canDelete = semester.canDelete ?? false
  const blockers = semester.deleteBlockers ?? []
  const counts = semester.counts

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>删除学期</DialogTitle>
        </DialogHeader>

        <div className="space-y-3 text-sm">
          <p>
            学期：<strong>{semester.name}</strong>
            <span className="text-gray-400 ml-1">({semester.code})</span>
          </p>

          {canDelete ? (
            <p className="text-gray-600">确定删除该空学期吗？此操作不可撤销。</p>
          ) : (
            <div className="space-y-2">
              <p className="text-red-600 font-medium">该学期无法删除：</p>
              <ul className="list-disc list-inside space-y-1 text-red-600">
                {blockers.map((b, i) => (
                  <li key={i}>{b}</li>
                ))}
              </ul>

              {counts && counts.total > 0 && (
                <div className="mt-2 p-3 bg-gray-50 rounded-md text-gray-600">
                  <p className="font-medium mb-1">依赖数据：</p>
                  <div className="grid grid-cols-2 gap-1 text-xs">
                    {counts.teachingTasks > 0 && <span>教学任务：{counts.teachingTasks}</span>}
                    {counts.scheduleSlots > 0 && <span>课表：{counts.scheduleSlots}</span>}
                    {counts.scheduleAdjustments > 0 && <span>调课记录：{counts.scheduleAdjustments}</span>}
                    {counts.importBatches > 0 && <span>导入批次：{counts.importBatches}</span>}
                    {counts.classGroups > 0 && <span>班级：{counts.classGroups}</span>}
                    {counts.schedulingRuns > 0 && <span>排课运行：{counts.schedulingRuns}</span>}
                    {counts.schedulingConfigs > 0 && <span>排课配置：{counts.schedulingConfigs}</span>}
                  </div>
                </div>
              )}
            </div>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={deleting}>
            {canDelete ? '取消' : '关闭'}
          </Button>
          {canDelete && (
            <Button variant="destructive" onClick={onConfirm} disabled={deleting}>
              {deleting ? '删除中...' : '确认删除'}
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
