'use client'

/**
 * WorkTimeConfigDeleteDialog
 *
 * K26-H: Delete confirmation for WorkTimeConfig with protection error display.
 */

import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Loader2 } from 'lucide-react'
import type { WorkTimeConfigDTO } from '@/types/worktime'

interface Props {
  open: boolean
  config: WorkTimeConfigDTO | null
  deleting: boolean
  protectionError: string | null
  onOpenChange: (open: boolean) => void
  onConfirm: () => void
}

export function WorkTimeConfigDeleteDialog({
  open,
  config,
  deleting,
  protectionError,
  onOpenChange,
  onConfirm,
}: Props) {
  if (!config) return null

  const canDelete = !protectionError

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent data-testid="k26h-worktime-delete-dialog">
        <DialogHeader>
          <DialogTitle>删除作息配置</DialogTitle>
        </DialogHeader>

        {canDelete ? (
          <div className="space-y-3">
            <p className="text-sm text-gray-600">
              确定要删除以下作息配置吗？此操作不可撤销。
            </p>
            <div className="bg-gray-50 rounded p-3 text-sm">
              <p><strong>名称：</strong>{config.name}</p>
              <p><strong>学期：</strong>{config.semesterName ?? `#${config.semesterId}`}</p>
              <p><strong>版本：</strong>v{config.version}</p>
            </div>
          </div>
        ) : (
          <div className="space-y-3">
            <p className="text-sm text-red-600">无法删除此配置：</p>
            <div className="bg-red-50 border border-red-200 rounded p-3 text-sm text-red-700" data-testid="k26h-delete-protection-error">
              {protectionError}
            </div>
          </div>
        )}

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={deleting}>
            {canDelete ? '取消' : '关闭'}
          </Button>
          {canDelete && (
            <Button variant="destructive" onClick={onConfirm} disabled={deleting} data-testid="k26h-delete-confirm">
              {deleting && <Loader2 className="w-4 h-4 animate-spin mr-1" />}
              删除
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
