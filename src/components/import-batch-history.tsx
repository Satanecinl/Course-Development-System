'use client'

import { useEffect, useState, useCallback } from 'react'
import { toast } from 'sonner'
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
import { Badge } from '@/components/ui/badge'
import {
  fetchImportBatches,
  fetchImportBatchDetail,
  rollbackImportBatchDryRun,
  rollbackImportBatch,
  abandonImportBatch,
} from '@/lib/import/client'
import type {
  ImportBatchListItem,
  ImportBatchDetail,
  ImportRollbackPlan,
  ImportRollbackResult,
} from '@/types/import'

interface ImportBatchHistoryProps {
  open: boolean
  onOpenChange: (open: boolean) => void
}

const STATUS_LABELS: Record<string, string> = {
  pending: '待确认',
  confirming: '确认中',
  confirmed: '已确认',
  failed: '失败',
  rolling_back: '回滚中',
  rolled_back: '已回滚',
  rollback_failed: '回滚失败',
  abandoned: '已废弃',
}

const STATUS_VARIANTS: Record<string, 'default' | 'secondary' | 'destructive' | 'outline'> = {
  pending: 'secondary',
  confirming: 'secondary',
  confirmed: 'default',
  failed: 'destructive',
  rolling_back: 'secondary',
  rolled_back: 'outline',
  rollback_failed: 'destructive',
  abandoned: 'outline',
}

export function ImportBatchHistory({ open, onOpenChange }: ImportBatchHistoryProps) {
  const [batches, setBatches] = useState<ImportBatchListItem[]>([])
  const [loading, setLoading] = useState(false)
  const [selectedBatch, setSelectedBatch] = useState<ImportBatchDetail | null>(null)
  const [detailLoading, setDetailLoading] = useState(false)

  // Rollback state
  const [rollbackPlan, setRollbackPlan] = useState<ImportRollbackPlan | null>(null)
  const [rollbackChecking, setRollbackChecking] = useState(false)
  const [rollbackConfirmOpen, setRollbackConfirmOpen] = useState(false)
  const [rollbackConfirmText, setRollbackConfirmText] = useState('')
  const [rollbackExecuting, setRollbackExecuting] = useState(false)
  const [rollbackResult, setRollbackResult] = useState<ImportRollbackResult | null>(null)

  // Abandon state
  const [abandonConfirmOpen, setAbandonConfirmOpen] = useState(false)
  const [abandonConfirmText, setAbandonConfirmText] = useState('')
  const [abandonExecuting, setAbandonExecuting] = useState(false)

  const loadBatches = useCallback(async () => {
    setLoading(true)
    try {
      const data = await fetchImportBatches()
      setBatches(data.batches)
    } catch (e) {
      toast.error('获取导入历史失败', { description: String(e) })
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    if (open) {
      loadBatches()
      setSelectedBatch(null)
      setRollbackPlan(null)
      setRollbackResult(null)
    }
  }, [open, loadBatches])

  async function handleViewDetail(batchId: number) {
    setDetailLoading(true)
    setRollbackPlan(null)
    setRollbackResult(null)
    try {
      const data = await fetchImportBatchDetail(batchId)
      setSelectedBatch(data.batch)
    } catch (e) {
      toast.error('获取批次详情失败', { description: String(e) })
    } finally {
      setDetailLoading(false)
    }
  }

  async function handleRollbackDryRun(batchId: number) {
    setRollbackChecking(true)
    setRollbackPlan(null)
    setRollbackResult(null)
    try {
      const data = await rollbackImportBatchDryRun(batchId)
      setRollbackPlan(data.plan)
      if (!data.plan.canRollback) {
        toast.warning('无法回滚', {
          description: data.plan.blockingReasons.join('; '),
        })
      }
    } catch (e) {
      toast.error('回滚检查失败', { description: String(e) })
    } finally {
      setRollbackChecking(false)
    }
  }

  function handleOpenRollbackConfirm() {
    setRollbackConfirmText('')
    setRollbackConfirmOpen(true)
  }

  async function handleExecuteRollback(batchId: number) {
    setRollbackExecuting(true)
    try {
      const data = await rollbackImportBatch(batchId)
      setRollbackResult(data.result)
      setRollbackConfirmOpen(false)
      toast.success('回滚成功', {
        description: `已删除 ${data.result.deletedScheduleSlots} 个排课时段、${data.result.deletedTeachingTasks} 个教学任务`,
      })
      await loadBatches()
      await handleViewDetail(batchId)
    } catch (e) {
      toast.error('回滚失败', { description: String(e) })
    } finally {
      setRollbackExecuting(false)
    }
  }

  function handleOpenAbandonConfirm() {
    setAbandonConfirmText('')
    setAbandonConfirmOpen(true)
  }

  async function handleExecuteAbandon(batchId: number) {
    setAbandonExecuting(true)
    try {
      await abandonImportBatch(batchId)
      setAbandonConfirmOpen(false)
      toast.success('批次已废弃')
      await loadBatches()
      await handleViewDetail(batchId)
    } catch (e) {
      toast.error('废弃失败', { description: String(e) })
    } finally {
      setAbandonExecuting(false)
    }
  }

  function formatDate(dateStr: string | null): string {
    if (!dateStr) return '-'
    return new Date(dateStr).toLocaleString('zh-CN')
  }

  const canShowRollback = selectedBatch?.status === 'confirmed'
  const canShowAbandon = selectedBatch?.status === 'pending'
  const canExecuteRollback = rollbackPlan?.canRollback === true

  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="sm:max-w-3xl max-h-[85vh] flex flex-col">
          <DialogHeader>
            <DialogTitle>导入历史</DialogTitle>
          </DialogHeader>

          <div className="flex-1 overflow-hidden flex gap-4 min-h-0">
            {/* Left: Batch List */}
            <div className="w-1/3 overflow-y-auto border-r pr-4">
              {loading ? (
                <div className="text-sm text-muted-foreground py-4">加载中...</div>
              ) : batches.length === 0 ? (
                <div className="text-sm text-muted-foreground py-4">暂无导入记录</div>
              ) : (
                <div className="space-y-2">
                  {batches.map((batch) => (
                    <button
                      key={batch.id}
                      onClick={() => handleViewDetail(batch.id)}
                      className={`w-full text-left p-3 rounded-lg border transition-colors ${
                        selectedBatch?.id === batch.id
                          ? 'border-blue-500 bg-blue-50'
                          : 'border-gray-200 hover:border-gray-300 hover:bg-gray-50'
                      }`}
                    >
                      <div className="flex items-center justify-between mb-1">
                        <span className="font-medium text-sm">#{batch.id}</span>
                        <Badge variant={STATUS_VARIANTS[batch.status] ?? 'secondary'}>
                          {STATUS_LABELS[batch.status] ?? batch.status}
                        </Badge>
                      </div>
                      <div className="text-xs text-muted-foreground truncate">
                        {batch.filename}
                      </div>
                      <div className="text-xs text-muted-foreground mt-1">
                        {batch.recordCount} 条记录
                      </div>
                    </button>
                  ))}
                </div>
              )}
            </div>

            {/* Right: Batch Detail */}
            <div className="flex-1 overflow-y-auto">
              {!selectedBatch ? (
                <div className="text-sm text-muted-foreground py-4 text-center">
                  选择左侧批次查看详情
                </div>
              ) : detailLoading ? (
                <div className="text-sm text-muted-foreground py-4">加载详情中...</div>
              ) : (
                <div className="space-y-4">
                  {/* Basic Info */}
                  <div className="grid grid-cols-2 gap-3 text-sm">
                    <div>
                      <span className="text-muted-foreground">ID:</span>{' '}
                      <span className="font-medium">#{selectedBatch.id}</span>
                    </div>
                    <div>
                      <span className="text-muted-foreground">状态:</span>{' '}
                      <Badge variant={STATUS_VARIANTS[selectedBatch.status] ?? 'secondary'}>
                        {STATUS_LABELS[selectedBatch.status] ?? selectedBatch.status}
                      </Badge>
                    </div>
                    <div className="col-span-2">
                      <span className="text-muted-foreground">文件:</span>{' '}
                      <span>{selectedBatch.filename}</span>
                    </div>
                    <div>
                      <span className="text-muted-foreground">记录数:</span>{' '}
                      <span>{selectedBatch.recordCount}</span>
                    </div>
                    <div>
                      <span className="text-muted-foreground">创建时间:</span>{' '}
                      <span>{formatDate(selectedBatch.createdAt)}</span>
                    </div>
                    {selectedBatch.confirmedAt && (
                      <div>
                        <span className="text-muted-foreground">确认时间:</span>{' '}
                        <span>{formatDate(selectedBatch.confirmedAt)}</span>
                      </div>
                    )}
                    {selectedBatch.rolledBackAt && (
                      <div>
                        <span className="text-muted-foreground">回滚时间:</span>{' '}
                        <span>{formatDate(selectedBatch.rolledBackAt)}</span>
                      </div>
                    )}
                    {selectedBatch.errorMessage && (
                      <div className="col-span-2">
                        <span className="text-muted-foreground">说明:</span>{' '}
                        <span className="text-amber-700">{selectedBatch.errorMessage}</span>
                      </div>
                    )}
                  </div>

                  {/* Counts */}
                  <div className="border-t pt-3">
                    <h4 className="text-sm font-medium mb-2">数量统计</h4>
                    <div className="grid grid-cols-2 gap-2 text-sm">
                      <div>
                        <span className="text-muted-foreground">历史创建任务:</span>{' '}
                        <span>{selectedBatch.createdTaskCount ?? '-'}</span>
                      </div>
                      <div>
                        <span className="text-muted-foreground">历史创建时段:</span>{' '}
                        <span>{selectedBatch.createdSlotCount ?? '-'}</span>
                      </div>
                      <div>
                        <span className="text-muted-foreground">实际任务:</span>{' '}
                        <span>{selectedBatch.actualCreatedTaskCount}</span>
                      </div>
                      <div>
                        <span className="text-muted-foreground">实际时段:</span>{' '}
                        <span>{selectedBatch.actualCreatedSlotCount}</span>
                      </div>
                      <div>
                        <span className="text-muted-foreground">任务班级关联:</span>{' '}
                        <span>{selectedBatch.actualTeachingTaskClassCount}</span>
                      </div>
                      <div>
                        <span className="text-muted-foreground">null 教师任务:</span>{' '}
                        <span>{selectedBatch.nullTeacherTaskCount}</span>
                      </div>
                      <div>
                        <span className="text-muted-foreground">null 教室时段:</span>{' '}
                        <span>{selectedBatch.nullRoomSlotCount}</span>
                      </div>
                    </div>
                  </div>

                  {/* Flags */}
                  <div className="border-t pt-3">
                    <h4 className="text-sm font-medium mb-2">状态标志</h4>
                    <div className="grid grid-cols-2 gap-2 text-sm">
                      <div>
                        <span className="text-muted-foreground">metadataMatch:</span>{' '}
                        <Badge variant={selectedBatch.metadataMatch ? 'default' : 'destructive'}>
                          {selectedBatch.metadataMatch ? '是' : '否'}
                        </Badge>
                      </div>
                      <div>
                        <span className="text-muted-foreground">rollbackComplete:</span>{' '}
                        <Badge variant={selectedBatch.rollbackComplete ? 'default' : 'secondary'}>
                          {selectedBatch.rollbackComplete ? '是' : '否'}
                        </Badge>
                      </div>
                      <div>
                        <span className="text-muted-foreground">hasPlaceholderTeachers:</span>{' '}
                        <span>{selectedBatch.hasPlaceholderTeachers ? '是' : '否'}</span>
                      </div>
                      <div>
                        <span className="text-muted-foreground">hasPlaceholderRooms:</span>{' '}
                        <span>{selectedBatch.hasPlaceholderRooms ? '是' : '否'}</span>
                      </div>
                      <div>
                        <span className="text-muted-foreground">hasOrphanSlots:</span>{' '}
                        <span>{selectedBatch.hasOrphanSlots ? '是' : '否'}</span>
                      </div>
                    </div>
                  </div>

                  {/* Warnings */}
                  {selectedBatch.warnings.length > 0 && (
                    <div className="border-t pt-3">
                      <h4 className="text-sm font-medium mb-2">
                        警告 ({selectedBatch.warnings.length})
                      </h4>
                      <div className="space-y-1 max-h-32 overflow-y-auto">
                        {selectedBatch.warnings.map((w, i) => (
                          <div key={i} className="text-xs text-amber-700 bg-amber-50 px-2 py-1 rounded">
                            {typeof w === 'string' ? w : JSON.stringify(w)}
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Rollback Dry-Run Result */}
                  {rollbackPlan && (
                    <div className="border-t pt-3">
                      <h4 className="text-sm font-medium mb-2">回滚检查结果</h4>
                      <div className="grid grid-cols-2 gap-2 text-sm">
                        <div>
                          <span className="text-muted-foreground">canRollback:</span>{' '}
                          <Badge variant={rollbackPlan.canRollback ? 'default' : 'destructive'}>
                            {rollbackPlan.canRollback ? '是' : '否'}
                          </Badge>
                        </div>
                        <div>
                          <span className="text-muted-foreground">将删除时段:</span>{' '}
                          <span>{rollbackPlan.scheduleSlotsToDelete}</span>
                        </div>
                        <div>
                          <span className="text-muted-foreground">将删除任务班级:</span>{' '}
                          <span>{rollbackPlan.teachingTaskClassesToDelete}</span>
                        </div>
                        <div>
                          <span className="text-muted-foreground">将删除任务:</span>{' '}
                          <span>{rollbackPlan.teachingTasksToDelete}</span>
                        </div>
                        <div>
                          <span className="text-muted-foreground">保留班级:</span>{' '}
                          <span>{rollbackPlan.retainedClassGroups}</span>
                        </div>
                        <div>
                          <span className="text-muted-foreground">保留教师:</span>{' '}
                          <span>{rollbackPlan.retainedTeachers}</span>
                        </div>
                        <div>
                          <span className="text-muted-foreground">保留课程:</span>{' '}
                          <span>{rollbackPlan.retainedCourses}</span>
                        </div>
                        <div>
                          <span className="text-muted-foreground">保留教室:</span>{' '}
                          <span>{rollbackPlan.retainedRooms}</span>
                        </div>
                      </div>
                      {rollbackPlan.blockingReasons.length > 0 && (
                        <div className="mt-2">
                          <span className="text-sm text-destructive font-medium">阻止原因:</span>
                          <ul className="list-disc list-inside text-sm text-destructive">
                            {rollbackPlan.blockingReasons.map((r, i) => (
                              <li key={i}>{r}</li>
                            ))}
                          </ul>
                        </div>
                      )}
                      {rollbackPlan.warnings.length > 0 && (
                        <div className="mt-2">
                          <span className="text-sm text-amber-700 font-medium">警告:</span>
                          <ul className="list-disc list-inside text-sm text-amber-700">
                            {rollbackPlan.warnings.map((w, i) => (
                              <li key={i}>{typeof w === 'string' ? w : JSON.stringify(w)}</li>
                            ))}
                          </ul>
                        </div>
                      )}
                    </div>
                  )}

                  {/* Rollback Result */}
                  {rollbackResult && (
                    <div className="border-t pt-3">
                      <h4 className="text-sm font-medium mb-2 text-green-700">回滚完成</h4>
                      <div className="grid grid-cols-2 gap-2 text-sm">
                        <div>
                          <span className="text-muted-foreground">已删除时段:</span>{' '}
                          <span>{rollbackResult.deletedScheduleSlots}</span>
                        </div>
                        <div>
                          <span className="text-muted-foreground">已删除任务班级:</span>{' '}
                          <span>{rollbackResult.deletedTeachingTaskClasses}</span>
                        </div>
                        <div>
                          <span className="text-muted-foreground">已删除任务:</span>{' '}
                          <span>{rollbackResult.deletedTeachingTasks}</span>
                        </div>
                      </div>
                    </div>
                  )}

                  {/* Actions */}
                  {canShowRollback && (
                    <div className="border-t pt-3 flex gap-2">
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => handleRollbackDryRun(selectedBatch.id)}
                        disabled={rollbackChecking}
                      >
                        {rollbackChecking ? '检查中...' : '回滚前检查'}
                      </Button>
                      <Button
                        variant="destructive"
                        size="sm"
                        onClick={handleOpenRollbackConfirm}
                        disabled={!canExecuteRollback}
                      >
                        回滚
                      </Button>
                    </div>
                  )}
                  {canShowAbandon && (
                    <div className="border-t pt-3 flex gap-2">
                      <Button
                        variant="destructive"
                        size="sm"
                        onClick={handleOpenAbandonConfirm}
                      >
                        废弃
                      </Button>
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => onOpenChange(false)}>
              关闭
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Rollback Confirmation Dialog */}
      <Dialog open={rollbackConfirmOpen} onOpenChange={setRollbackConfirmOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>确认回滚</DialogTitle>
          </DialogHeader>

          <div className="space-y-4 text-sm">
            <div className="bg-amber-50 border border-amber-200 rounded-lg p-3">
              <p className="font-medium text-amber-800 mb-2">此操作将：</p>
              <ul className="list-disc list-inside text-amber-700 space-y-1">
                <li>删除本批次创建的教学任务（{rollbackPlan?.teachingTasksToDelete ?? 0} 个）</li>
                <li>删除本批次创建的任务班级关联（{rollbackPlan?.teachingTaskClassesToDelete ?? 0} 个）</li>
                <li>删除本批次创建的排课时段（{rollbackPlan?.scheduleSlotsToDelete ?? 0} 个）</li>
              </ul>
            </div>

            <div className="bg-green-50 border border-green-200 rounded-lg p-3">
              <p className="font-medium text-green-800 mb-2">不会删除：</p>
              <ul className="list-disc list-inside text-green-700 space-y-1">
                <li>班级、教师、课程、教室等基础数据</li>
                <li>其他批次创建的教学任务和排课时段</li>
              </ul>
            </div>

            <div className="bg-red-50 border border-red-200 rounded-lg p-3">
              <p className="text-red-700">
                当前阶段不支持前端恢复。请确认您已了解此操作的后果。
              </p>
            </div>

            <div className="space-y-2">
              <Label>
                请输入 <span className="font-mono font-bold">ROLLBACK_IMPORT</span> 以确认：
              </Label>
              <Input
                value={rollbackConfirmText}
                onChange={(e) => setRollbackConfirmText(e.target.value)}
                placeholder="ROLLBACK_IMPORT"
              />
            </div>
          </div>

          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setRollbackConfirmOpen(false)}
              disabled={rollbackExecuting}
            >
              取消
            </Button>
            <Button
              variant="destructive"
              onClick={() => selectedBatch && handleExecuteRollback(selectedBatch.id)}
              disabled={rollbackConfirmText !== 'ROLLBACK_IMPORT' || rollbackExecuting}
            >
              {rollbackExecuting ? '回滚中...' : '确认回滚'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Abandon Confirmation Dialog */}
      <Dialog open={abandonConfirmOpen} onOpenChange={setAbandonConfirmOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>确认废弃</DialogTitle>
          </DialogHeader>

          <div className="space-y-4 text-sm">
            <div className="bg-amber-50 border border-amber-200 rounded-lg p-3">
              <p className="text-amber-700">
                此操作将把批次标记为「已废弃」。废弃后不会删除任何已解析的数据文件，但该批次将不再可用于确认导入。
              </p>
            </div>

            <div className="space-y-2">
              <Label>
                请输入 <span className="font-mono font-bold">ABANDON_IMPORT</span> 以确认：
              </Label>
              <Input
                value={abandonConfirmText}
                onChange={(e) => setAbandonConfirmText(e.target.value)}
                placeholder="ABANDON_IMPORT"
              />
            </div>
          </div>

          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setAbandonConfirmOpen(false)}
              disabled={abandonExecuting}
            >
              取消
            </Button>
            <Button
              variant="destructive"
              onClick={() => selectedBatch && handleExecuteAbandon(selectedBatch.id)}
              disabled={abandonConfirmText !== 'ABANDON_IMPORT' || abandonExecuting}
            >
              {abandonExecuting ? '废弃中...' : '确认废弃'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  )
}
