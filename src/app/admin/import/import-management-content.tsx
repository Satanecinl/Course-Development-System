// src/app/admin/import/import-management-content.tsx
// K34-A: Basic import management page.
// Lists ImportBatch records, supports status filter / refresh / detail view /
// upload entry / confirm / rollback / abandon. Reuses existing API routes and
// client helpers. Read-only against the DB; no parser/importer/score changes.

'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import Link from 'next/link'
import { toast } from 'sonner'
import {
  Upload,
  RefreshCw,
  Loader2,
  AlertCircle,
  FileSpreadsheet,
  CheckCircle2,
  Clock,
  XCircle,
  History,
  Database,
  Eye,
  Undo2,
  Trash2,
  ChevronDown,
  ChevronRight,
  Info,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog'
import { useHasPermission } from '@/components/layout/current-user-context'
import {
  formatImportDisplayValue,
  formatImportWarning,
  normalizeImportWarnings,
} from './import-display-utils'
import {
  fetchImportBatches,
  fetchImportBatchDetail,
  rollbackImportBatchDryRun,
  rollbackImportBatch,
  abandonImportBatch,
  confirmImportDryRun,
  confirmImportReal,
  parseImportFile,
} from '@/lib/import/client'
import type {
  ImportBatchListItem,
  ImportBatchDetail,
  ImportRollbackPlan,
} from '@/types/import'
import CourseSettingXlsxPreview from '@/components/import/course-setting-xlsx-preview'

// ── Status presentation ─────────────────────────────────────────────────────

const STATUS_LABELS: Record<string, string> = {
  pending: '待确认',
  confirming: '确认中',
  confirmed: '已确认',
  failed: '失败',
  rolling_back: '回滚中',
  rolled_back: '已回滚',
  rollback_failed: '回滚失败',
  abandoned: '已废弃',
  // L7-F5C: XLSX course setting import status
  applied: '已应用',
  completed: '已完成',
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
  // L7-F5C: XLSX course setting import status
  applied: 'default',
  completed: 'default',
}

const STATUS_GROUPS: ReadonlyArray<{
  key: StatusGroupKey
  label: string
  match: (status: string) => boolean
}> = [
  { key: 'all', label: '全部', match: () => true },
  { key: 'pending', label: '待确认', match: (s) => s === 'pending' || s === 'confirming' },
  // L7-F5C: include 'applied' and 'completed' in confirmed group
  { key: 'confirmed', label: '已确认/已应用', match: (s) => s === 'confirmed' || s === 'rolled_back' || s === 'rolling_back' || s === 'rollback_failed' || s === 'applied' || s === 'completed' },
  { key: 'failed', label: '失败/废弃', match: (s) => s === 'failed' || s === 'abandoned' },
]

type StatusGroupKey = 'all' | 'pending' | 'confirmed' | 'failed'

// ── Helpers ─────────────────────────────────────────────────────────────────

function formatDateTime(dateStr: string | null | undefined): string {
  if (!dateStr) return '-'
  try {
    return new Date(dateStr).toLocaleString('zh-CN', {
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
    })
  } catch {
    return dateStr
  }
}

// ── Component ───────────────────────────────────────────────────────────────

export default function ImportManagementContent() {
  const canManage = useHasPermission('import:manage')

  // List state
  const [batches, setBatches] = useState<ImportBatchListItem[]>([])
  const [loading, setLoading] = useState(false)
  const [listError, setListError] = useState<string | null>(null)
  const [statusGroup, setStatusGroup] = useState<StatusGroupKey>('all')

  // Detail state
  const [detailOpen, setDetailOpen] = useState(false)
  const [selectedBatch, setSelectedBatch] = useState<ImportBatchDetail | null>(null)
  const [detailLoading, setDetailLoading] = useState(false)
  const [detailError, setDetailError] = useState<string | null>(null)
  const [rawWarningsOpen, setRawWarningsOpen] = useState(false)

  // Rollback state
  const [rollbackPlan, setRollbackPlan] = useState<ImportRollbackPlan | null>(null)
  const [rollbackChecking, setRollbackChecking] = useState(false)
  const [rollbackConfirmOpen, setRollbackConfirmOpen] = useState(false)
  const [rollbackConfirmText, setRollbackConfirmText] = useState('')
  const [rollbackExecuting, setRollbackExecuting] = useState(false)

  // Abandon state
  const [abandonConfirmOpen, setAbandonConfirmOpen] = useState(false)
  const [abandonConfirmText, setAbandonConfirmText] = useState('')
  const [abandonExecuting, setAbandonExecuting] = useState(false)

  // Confirm state
  const [confirmOpen, setConfirmOpen] = useState(false)
  const [confirmText, setConfirmText] = useState('')
  const [confirmPlan, setConfirmPlan] = useState<unknown | null>(null)
  const [confirmPlanLoading, setConfirmPlanLoading] = useState(false)
  const [confirmExecuting, setConfirmExecuting] = useState(false)

  // Upload state
  const [uploadOpen, setUploadOpen] = useState(false)
  const [uploadFile, setUploadFile] = useState<File | null>(null)
  const [uploadUploading, setUploadUploading] = useState(false)
  const [uploadResult, setUploadResult] = useState<{ batchId: number; filename: string; recordCount: number } | null>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)

  // K39-B1: semester confirmation state
  const [requireSemesterConfirm, setRequireSemesterConfirm] = useState(false)
  const [semesterConfirmChecked, setSemesterConfirmChecked] = useState(false)
  const [activeSemesterName, setActiveSemesterName] = useState<string | null>(null)

  // ── List loaders ────────────────────────────────────────────────────────

  const loadBatches = useCallback(async () => {
    setLoading(true)
    setListError(null)
    try {
      const data = await fetchImportBatches()
      setBatches(data.batches ?? [])
    } catch (e) {
      const message = e instanceof Error ? e.message : String(e)
      setListError(message)
      toast.error('获取导入批次失败', { description: message })
    } finally {
      setLoading(false)
    }
  }, [])

  // Initial load once permission is known. Triggers a state update
  // intentionally — this is the standard fetch-on-mount pattern. React 19's
  // strict setState-in-effect rule is suppressed here because the call is
  // not synchronous cascading state; it kicks off an async fetch.
  useEffect(() => {
    if (canManage) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      void loadBatches()
    }
  }, [canManage, loadBatches])

  const filteredBatches = useMemo(() => {
    if (statusGroup === 'all') return batches
    const group = STATUS_GROUPS.find((g) => g.key === statusGroup)
    if (!group) return batches
    return batches.filter((b) => group.match(b.status))
  }, [batches, statusGroup])

  // ── Stats ───────────────────────────────────────────────────────────────

  const stats = useMemo(() => {
    const total = batches.length
    let pending = 0
    let confirmed = 0
    let failed = 0
    let latestCreatedAt: string | null = null
    for (const b of batches) {
      if (b.status === 'pending' || b.status === 'confirming') pending += 1
      if (b.status === 'confirmed' || b.status === 'rolled_back' || b.status === 'rolling_back' || b.status === 'rollback_failed' || b.status === 'applied' || b.status === 'completed') confirmed += 1
      if (b.status === 'failed' || b.status === 'abandoned') failed += 1
      if (!latestCreatedAt || (b.createdAt && b.createdAt > latestCreatedAt)) {
        latestCreatedAt = b.createdAt
      }
    }
    return { total, pending, confirmed, failed, latestCreatedAt }
  }, [batches])

  // ── Detail loader ───────────────────────────────────────────────────────

  async function handleViewDetail(batchId: number) {
    setDetailOpen(true)
    setSelectedBatch(null)
    setDetailError(null)
    setRollbackPlan(null)
    setConfirmPlan(null)
    setRawWarningsOpen(false)
    setDetailLoading(true)
    try {
      const data = await fetchImportBatchDetail(batchId)
      setSelectedBatch(data.batch)
    } catch (e) {
      const message = e instanceof Error ? e.message : String(e)
      setDetailError(message)
      toast.error('获取批次详情失败', { description: message })
    } finally {
      setDetailLoading(false)
    }
  }

  function handleCloseDetail() {
    setDetailOpen(false)
    setSelectedBatch(null)
    setDetailError(null)
    setRollbackPlan(null)
    setConfirmPlan(null)
    setRawWarningsOpen(false)
  }

  // ── Rollback ────────────────────────────────────────────────────────────

  async function handleRollbackDryRun(batchId: number) {
    setRollbackChecking(true)
    setRollbackPlan(null)
    try {
      const data = await rollbackImportBatchDryRun(batchId)
      setRollbackPlan(data.plan)
      if (!data.plan.canRollback) {
        toast.warning('无法回滚', {
          description: data.plan.blockingReasons.join('; ') || '存在阻止回滚的条件',
        })
      }
    } catch (e) {
      const message = e instanceof Error ? e.message : String(e)
      toast.error('回滚检查失败', { description: message })
    } finally {
      setRollbackChecking(false)
    }
  }

  function openRollbackConfirm() {
    setRollbackConfirmText('')
    setRollbackConfirmOpen(true)
  }

  async function executeRollback(batchId: number) {
    setRollbackExecuting(true)
    try {
      const data = await rollbackImportBatch(batchId)
      toast.success('回滚成功', {
        description: `已删除 ${data.result.deletedScheduleSlots} 个排课时段、${data.result.deletedTeachingTasks} 个教学任务`,
      })
      setRollbackConfirmOpen(false)
      setRollbackPlan(null)
      await loadBatches()
      await handleViewDetail(batchId)
    } catch (e) {
      const message = e instanceof Error ? e.message : String(e)
      toast.error('回滚失败', { description: message })
    } finally {
      setRollbackExecuting(false)
    }
  }

  // ── Abandon ─────────────────────────────────────────────────────────────

  function openAbandonConfirm() {
    setAbandonConfirmText('')
    setAbandonConfirmOpen(true)
  }

  async function executeAbandon(batchId: number) {
    setAbandonExecuting(true)
    try {
      await abandonImportBatch(batchId)
      toast.success('批次已废弃')
      setAbandonConfirmOpen(false)
      await loadBatches()
      await handleViewDetail(batchId)
    } catch (e) {
      const message = e instanceof Error ? e.message : String(e)
      toast.error('废弃失败', { description: message })
    } finally {
      setAbandonExecuting(false)
    }
  }

  // ── Confirm ─────────────────────────────────────────────────────────────

  async function handleConfirmDryRun(batchId: number) {
    setConfirmPlanLoading(true)
    setConfirmPlan(null)
    try {
      const data = await confirmImportDryRun(batchId)
      setConfirmPlan(data.plan)
    } catch (e) {
      const message = e instanceof Error ? e.message : String(e)
      toast.error('确认预检失败', { description: message })
    } finally {
      setConfirmPlanLoading(false)
    }
  }

  function openConfirmDialog() {
    setConfirmText('')
    setConfirmOpen(true)
  }

  async function executeConfirm(batchId: number) {
    setConfirmExecuting(true)
    try {
      const data = await confirmImportReal(batchId)
      const result = data.result as {
        teachingTasks?: { created: number }
        scheduleSlots?: { created: number }
      } | undefined
      toast.success('导入已确认', {
        description: `已创建 ${result?.teachingTasks?.created ?? 0} 个教学任务、${result?.scheduleSlots?.created ?? 0} 个排课时段`,
      })
      setConfirmOpen(false)
      setConfirmPlan(null)
      await loadBatches()
      await handleViewDetail(batchId)
    } catch (e) {
      const message = e instanceof Error ? e.message : String(e)
      toast.error('确认失败', { description: message })
    } finally {
      setConfirmExecuting(false)
    }
  }

  // ── Upload ──────────────────────────────────────────────────────────────

  function openUploadDialog() {
    setUploadFile(null)
    setUploadResult(null)
    setSemesterConfirmChecked(false)
    if (fileInputRef.current) fileInputRef.current.value = ''
    setUploadOpen(true)
    // K39-B1: fetch config to determine if semester confirmation required
    fetch('/api/admin/settings/import-rules')
      .then((r) => r.json())
      .then((data) => {
        if (data.success) {
          setRequireSemesterConfirm(data.config?.requireExplicitSemesterForImport?.current ?? false)
          setActiveSemesterName(data.enhancedSummary?.activeSemester?.name ?? null)
        }
      })
      .catch(() => {
        setRequireSemesterConfirm(false)
      })
  }

  async function executeUpload() {
    if (!uploadFile) {
      toast.error('请选择课程表文件')
      return
    }
    setUploadUploading(true)
    try {
      const data = await parseImportFile(uploadFile)
      const result = data as { batchId?: number; filename?: string; stats?: { total_records?: number } }
      setUploadResult({
        batchId: result.batchId ?? 0,
        filename: result.filename ?? uploadFile.name,
        recordCount: result.stats?.total_records ?? 0,
      })
      toast.success('解析成功', {
        description: `批次 #${result.batchId ?? '?'} 已创建，状态为待确认`,
      })
      await loadBatches()
    } catch (e) {
      const message = e instanceof Error ? e.message : String(e)
      toast.error('上传失败', { description: message })
    } finally {
      setUploadUploading(false)
    }
  }

  // ── Permission gate ─────────────────────────────────────────────────────

  if (!canManage) {
    return (
      <div className="p-6">
        <div className="flex items-center gap-3 mb-6">
          <Upload className="w-6 h-6 text-gray-400" />
          <h2 className="text-xl font-bold text-gray-900">导入管理</h2>
        </div>
        <div className="bg-white rounded-lg shadow p-6">
          <p className="text-gray-600">您没有导入管理权限</p>
          <p className="mt-2 text-sm text-gray-400">
            请联系管理员授予 <code className="font-mono">import:manage</code> 权限后再访问。
          </p>
        </div>
      </div>
    )
  }

  // ── Render ──────────────────────────────────────────────────────────────

  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <div className="flex items-center gap-3 mb-1">
            <Upload className="w-6 h-6 text-gray-700" />
            <h2 className="text-xl font-bold text-gray-900">导入管理</h2>
          </div>
          <p className="text-sm text-gray-500">
            上传课程表文件，查看导入批次、解析结果、警告与确认状态。
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={openUploadDialog}>
            <Upload className="w-4 h-4 mr-1" />
            上传课程表
          </Button>
          <Button variant="outline" size="sm" onClick={() => void loadBatches()} disabled={loading}>
            <RefreshCw className={`w-4 h-4 mr-1 ${loading ? 'animate-spin' : ''}`} />
            刷新
          </Button>
        </div>
      </div>

      {/* Stats cards */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
        <StatCard
          icon={<Database className="w-4 h-4" />}
          label="总导入批次"
          value={stats.total}
          tone="default"
        />
        <StatCard
          icon={<Clock className="w-4 h-4" />}
          label="待确认批次"
          value={stats.pending}
          tone={stats.pending > 0 ? 'amber' : 'default'}
        />
        <StatCard
          icon={<CheckCircle2 className="w-4 h-4" />}
          label="已确认批次"
          value={stats.confirmed}
          tone="green"
        />
        <StatCard
          icon={<XCircle className="w-4 h-4" />}
          label="失败/废弃"
          value={stats.failed}
          tone={stats.failed > 0 ? 'destructive' : 'default'}
        />
        <StatCard
          icon={<History className="w-4 h-4" />}
          label="最近导入时间"
          value={formatDateTime(stats.latestCreatedAt)}
          tone="default"
          textValue
        />
      </div>

      {/* Status filter */}
      <div className="bg-white rounded-lg shadow">
        <div className="border-b px-4 py-3 flex items-center gap-2 flex-wrap">
          <span className="text-sm text-gray-600">状态筛选：</span>
          {STATUS_GROUPS.map((g) => {
            const active = statusGroup === g.key
            return (
              <button
                key={g.key}
                onClick={() => setStatusGroup(g.key)}
                className={`px-3 py-1 text-xs rounded-full border transition-colors ${
                  active
                    ? 'bg-blue-600 text-white border-blue-600'
                    : 'bg-white text-gray-600 border-gray-300 hover:border-gray-400'
                }`}
              >
                {g.label}
              </button>
            )
          })}
          <div className="ml-auto text-xs text-gray-400">
            {filteredBatches.length} / {batches.length} 条
          </div>
        </div>

        {/* List table */}
        {loading && batches.length === 0 ? (
          <div className="px-4 py-12 text-center text-sm text-gray-500">
            <Loader2 className="w-5 h-5 animate-spin inline-block mr-2" />
            加载中...
          </div>
        ) : listError ? (
          <div className="px-4 py-12 text-center text-sm text-red-600">
            <AlertCircle className="w-5 h-5 inline-block mr-1" />
            {listError}
          </div>
        ) : filteredBatches.length === 0 ? (
          <div className="px-4 py-12 text-center text-sm text-gray-500">
            {batches.length === 0
              ? '暂无导入记录。点击右上角"上传课程表"创建第一批导入。'
              : '当前筛选下没有匹配的批次。'}
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 text-gray-600 text-xs uppercase">
                <tr>
                  <th className="px-4 py-2 text-left">批次 ID</th>
                  <th className="px-4 py-2 text-left">文件</th>
                  <th className="px-4 py-2 text-left">状态</th>
                  <th className="px-4 py-2 text-left">类型</th>
                  <th className="px-4 py-2 text-right">记录数</th>
                  <th className="px-4 py-2 text-right">已建任务</th>
                  <th className="px-4 py-2 text-right">已建时段</th>
                  <th className="px-4 py-2 text-left">创建时间</th>
                  <th className="px-4 py-2 text-left">确认时间</th>
                  <th className="px-4 py-2 text-right">操作</th>
                </tr>
              </thead>
              <tbody>
                {filteredBatches.map((b) => (
                  <tr key={b.id} className="border-t hover:bg-gray-50">
                    <td className="px-4 py-2 font-mono text-xs text-gray-700">#{b.id}</td>
                    <td className="px-4 py-2 max-w-xs truncate" title={b.filename}>
                      {b.filename}
                    </td>
                    <td className="px-4 py-2">
                      <Badge variant={STATUS_VARIANTS[b.status] ?? 'secondary'}>
                        {STATUS_LABELS[b.status] ?? b.status}
                      </Badge>
                    </td>
                    {/* L7-F5C: show batch strategy/type */}
                    <td className="px-4 py-2 text-xs text-gray-600">
                      {b.strategy === 'XLSX_COURSE_SETTING_NEW_TEMPLATE'
                        ? '新版Excel课程设置'
                        : b.strategy
                          ? b.strategy
                          : '-'}
                    </td>
                    <td className="px-4 py-2 text-right tabular-nums">{b.recordCount}</td>
                    <td className="px-4 py-2 text-right tabular-nums">{b.createdTaskCount ?? '-'}</td>
                    <td className="px-4 py-2 text-right tabular-nums">{b.createdSlotCount ?? '-'}</td>
                    <td className="px-4 py-2 text-xs text-gray-600 whitespace-nowrap">
                      {formatDateTime(b.createdAt)}
                    </td>
                    <td className="px-4 py-2 text-xs text-gray-600 whitespace-nowrap">
                      {formatDateTime(b.confirmedAt)}
                    </td>
                    <td className="px-4 py-2 text-right whitespace-nowrap">
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => void handleViewDetail(b.id)}
                        title="查看详情"
                      >
                        <Eye className="w-3.5 h-3.5 mr-1" />
                        详情
                      </Button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Excel 课程设置 preview */}
      <CourseSettingXlsxPreview />

      {/* Quick links */}
      <div className="bg-white rounded-lg shadow px-4 py-3 flex items-center gap-2 text-sm text-gray-600 flex-wrap">
        <span className="text-gray-500">数据管理：</span>
        <Link href="/admin/db" className="text-blue-600 hover:underline">
          /admin/db
        </Link>
        <span className="text-gray-300">|</span>
        <Link href="/dashboard" className="text-blue-600 hover:underline">
          /dashboard
        </Link>
      </div>

      {/* ── Detail dialog ──────────────────────────────────────────────── */}
      <Dialog open={detailOpen} onOpenChange={(o) => (o ? null : handleCloseDetail())}>
        <DialogContent className="sm:max-w-3xl max-h-[85vh] flex flex-col">
          <DialogHeader>
            <DialogTitle>
              {selectedBatch ? `导入批次 #${selectedBatch.id}` : '导入批次详情'}
            </DialogTitle>
          </DialogHeader>

          <div className="flex-1 overflow-y-auto min-h-0">
            {detailLoading ? (
              <div className="py-8 text-center text-sm text-gray-500">
                <Loader2 className="w-5 h-5 animate-spin inline-block mr-2" />
                加载详情中...
              </div>
            ) : detailError ? (
              <div className="py-8 text-center text-sm text-red-600">
                <AlertCircle className="w-5 h-5 inline-block mr-1" />
                {detailError}
              </div>
            ) : !selectedBatch ? (
              <div className="py-8 text-center text-sm text-gray-500">无数据</div>
            ) : (
              <DetailBody
                batch={selectedBatch}
                rawWarningsOpen={rawWarningsOpen}
                setRawWarningsOpen={setRawWarningsOpen}
                rollbackPlan={rollbackPlan}
                rollbackChecking={rollbackChecking}
                confirmPlan={confirmPlan}
                confirmPlanLoading={confirmPlanLoading}
                onRollbackCheck={() => void handleRollbackDryRun(selectedBatch.id)}
                onOpenRollbackConfirm={openRollbackConfirm}
                onOpenAbandonConfirm={openAbandonConfirm}
                onConfirmCheck={() => void handleConfirmDryRun(selectedBatch.id)}
                onOpenConfirmDialog={openConfirmDialog}
                canExecuteRollback={rollbackPlan?.canRollback === true}
              />
            )}
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={handleCloseDetail}>
              关闭
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── Rollback confirmation ─────────────────────────────────────── */}
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
            <div className="bg-red-50 border border-red-200 rounded-lg p-3">
              <p className="text-red-700">当前阶段不支持前端恢复。请确认您已了解此操作的后果。</p>
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
            <Button variant="outline" onClick={() => setRollbackConfirmOpen(false)} disabled={rollbackExecuting}>
              取消
            </Button>
            <Button
              variant="destructive"
              onClick={() => selectedBatch && executeRollback(selectedBatch.id)}
              disabled={rollbackConfirmText !== 'ROLLBACK_IMPORT' || rollbackExecuting}
            >
              {rollbackExecuting ? '回滚中...' : '确认回滚'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── Abandon confirmation ──────────────────────────────────────── */}
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
            <Button variant="outline" onClick={() => setAbandonConfirmOpen(false)} disabled={abandonExecuting}>
              取消
            </Button>
            <Button
              variant="destructive"
              onClick={() => selectedBatch && executeAbandon(selectedBatch.id)}
              disabled={abandonConfirmText !== 'ABANDON_IMPORT' || abandonExecuting}
            >
              {abandonExecuting ? '废弃中...' : '确认废弃'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── Confirm dialog ────────────────────────────────────────────── */}
      <Dialog open={confirmOpen} onOpenChange={setConfirmOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>确认导入</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 text-sm">
            <div className="bg-amber-50 border border-amber-200 rounded-lg p-3">
              <p className="font-medium text-amber-800 mb-1">此操作将：</p>
              <ul className="list-disc list-inside text-amber-700 space-y-1">
                <li>把此批次写入数据库（教学任务、排课时段等）</li>
                <li>标记批次状态为「已确认」</li>
                <li>写入后的数据可通过数据管理页面查看/调整</li>
              </ul>
            </div>
            <div className="bg-red-50 border border-red-200 rounded-lg p-3">
              <p className="text-red-700">
                跨年级合班警告需要在确认时通过 crossCohortApprovals 显式审批；当前 UI 仅做基础确认。
              </p>
            </div>
            <div className="space-y-2">
              <Label>
                请输入 <span className="font-mono font-bold">CONFIRM_IMPORT</span> 以确认：
              </Label>
              <Input
                value={confirmText}
                onChange={(e) => setConfirmText(e.target.value)}
                placeholder="CONFIRM_IMPORT"
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setConfirmOpen(false)} disabled={confirmExecuting}>
              取消
            </Button>
            <Button
              onClick={() => selectedBatch && executeConfirm(selectedBatch.id)}
              disabled={confirmText !== 'CONFIRM_IMPORT' || confirmExecuting}
            >
              {confirmExecuting ? '确认中...' : '确认导入'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── Upload dialog ─────────────────────────────────────────────── */}
      <Dialog open={uploadOpen} onOpenChange={setUploadOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>上传课程表</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 text-sm">
            <div className="bg-blue-50 border border-blue-200 rounded-lg p-3 text-blue-800">
              <p>
                支持 <code className="font-mono">.docx</code> 格式。上传后将自动解析，
                生成一个 <strong>待确认</strong> 状态的 ImportBatch，解析结果会出现在下方列表。
              </p>
            </div>

            {uploadResult ? (
              <div className="bg-green-50 border border-green-200 rounded-lg p-3 text-green-800 space-y-1">
                <p className="font-medium">解析成功</p>
                <p>批次 ID：#{uploadResult.batchId}</p>
                <p>文件名：{uploadResult.filename}</p>
                <p>解析记录数：{uploadResult.recordCount}</p>
                <p className="text-xs text-green-700 mt-2">
                  请在下方列表中找到该批次，点击&ldquo;详情&rdquo;进入确认流程。
                </p>
              </div>
            ) : (
              <div className="space-y-3">
                {/* K39-B1: Semester confirmation banner */}
                {requireSemesterConfirm && activeSemesterName && (
                  <div className="bg-amber-50 border border-amber-200 rounded-lg p-3 text-amber-800">
                    <p className="font-medium text-sm">当前目标导入学期：{activeSemesterName}</p>
                    <label className="flex items-center gap-2 mt-2 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={semesterConfirmChecked}
                        onChange={(e) => setSemesterConfirmChecked(e.target.checked)}
                        className="rounded border-gray-300"
                      />
                      <span className="text-sm">我已确认本次导入目标学期正确</span>
                    </label>
                  </div>
                )}
                <div className="space-y-2">
                  <Label>选择文件</Label>
                  <Input
                    ref={fileInputRef}
                    type="file"
                    accept=".docx"
                    onChange={(e) => setUploadFile(e.target.files?.[0] ?? null)}
                  />
                  {uploadFile && (
                    <p className="text-xs text-gray-500 flex items-center gap-1">
                      <FileSpreadsheet className="w-3.5 h-3.5" />
                      {uploadFile.name} ({(uploadFile.size / 1024).toFixed(1)} KB)
                    </p>
                  )}
                </div>
              </div>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setUploadOpen(false)} disabled={uploadUploading}>
              关闭
            </Button>
            {!uploadResult && (
              <Button onClick={() => void executeUpload()} disabled={!uploadFile || uploadUploading || (requireSemesterConfirm && !semesterConfirmChecked)}>
                {uploadUploading ? (
                  <>
                    <Loader2 className="w-4 h-4 mr-1 animate-spin" />
                    上传中...
                  </>
                ) : (
                  <>
                    <Upload className="w-4 h-4 mr-1" />
                    上传并解析
                  </>
                )}
              </Button>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}

// ── Stat card ────────────────────────────────────────────────────────────────

interface StatCardProps {
  icon: React.ReactNode
  label: string
  value: number | string
  tone: 'default' | 'amber' | 'green' | 'destructive'
  textValue?: boolean
}

function StatCard({ icon, label, value, tone, textValue }: StatCardProps) {
  const toneClass =
    tone === 'amber'
      ? 'border-amber-200 bg-amber-50 text-amber-700'
      : tone === 'green'
      ? 'border-green-200 bg-green-50 text-green-700'
      : tone === 'destructive'
      ? 'border-red-200 bg-red-50 text-red-700'
      : 'border-gray-200 bg-white text-gray-700'

  return (
    <div className={`rounded-lg border p-3 ${toneClass}`}>
      <div className="flex items-center gap-1.5 text-xs opacity-80">
        {icon}
        <span>{label}</span>
      </div>
      <div
        className={`mt-1 font-semibold ${
          textValue ? 'text-sm' : 'text-2xl tabular-nums'
        }`}
      >
        {value}
      </div>
    </div>
  )
}

// ── Detail body ──────────────────────────────────────────────────────────────

interface DetailBodyProps {
  batch: ImportBatchDetail
  rawWarningsOpen: boolean
  setRawWarningsOpen: (b: boolean) => void
  rollbackPlan: ImportRollbackPlan | null
  rollbackChecking: boolean
  confirmPlan: unknown
  confirmPlanLoading: boolean
  onRollbackCheck: () => void
  onOpenRollbackConfirm: () => void
  onOpenAbandonConfirm: () => void
  onConfirmCheck: () => void
  onOpenConfirmDialog: () => void
  canExecuteRollback: boolean
}

function DetailBody({
  batch,
  rawWarningsOpen,
  setRawWarningsOpen,
  rollbackPlan,
  rollbackChecking,
  confirmPlan,
  confirmPlanLoading,
  onRollbackCheck,
  onOpenRollbackConfirm,
  onOpenAbandonConfirm,
  onConfirmCheck,
  onOpenConfirmDialog,
  canExecuteRollback,
}: DetailBodyProps) {
  // K34-A1: Defensive normalization. Server returns `batch.warnings` after
  // `safeJsonParse(batch.warningsJson, [])`. The actual stored shape is
  // either:
  //   - string[]   (confirmed batches: warningsJson = JSON.stringify({...,
  //     warnings: [str, str, ...]}))
  //   - object[]   (pending batches:  warningsJson = JSON.stringify(quality.warnings)
  //     where quality.warnings is ImportParseWarning[])
  //   - object     (full payload wrapper for confirmed batches)
  // `normalizeImportWarnings` handles all three and returns string[] of
  // human-readable text — never an object that would crash JSX rendering.
  const warnings = normalizeImportWarnings(batch.warnings)
  const safeWarnings = warnings.length
  const quality = batch.quality
  const stats = batch.stats
  const totalQualityWarnings = quality?.warnings?.length ?? 0
  const totalErrorCount = batch.errorMessage ? 1 : 0

  return (
    <div className="space-y-4 text-sm">
      {/* Basic info */}
      <div className="grid grid-cols-2 gap-3">
        <InfoRow label="批次 ID" value={`#${batch.id}`} mono />
        <div>
          <span className="text-gray-500">状态：</span>
          <Badge variant={STATUS_VARIANTS[batch.status] ?? 'secondary'}>
            {STATUS_LABELS[batch.status] ?? batch.status}
          </Badge>
        </div>
        <InfoRow label="文件" value={formatImportDisplayValue(batch.filename)} wide />
        <InfoRow label="记录数" value={String(batch.recordCount)} />
        <InfoRow label="创建时间" value={formatDateTime(batch.createdAt)} />
        {batch.confirmedAt && <InfoRow label="确认时间" value={formatDateTime(batch.confirmedAt)} />}
        {batch.rolledBackAt && <InfoRow label="回滚时间" value={formatDateTime(batch.rolledBackAt)} />}
        {batch.strategy && <InfoRow label="策略" value={formatImportDisplayValue(batch.strategy)} mono />}
        {batch.errorMessage && (
          <div className="col-span-2">
            <span className="text-gray-500">说明：</span>
            <span className="text-amber-700">{formatImportDisplayValue(batch.errorMessage)}</span>
          </div>
        )}
      </div>

      {/* Stats summary */}
      <div className="border-t pt-3">
        <h4 className="font-medium mb-2">解析摘要</h4>
        <div className="grid grid-cols-2 gap-2">
          <InfoRow label="班级数" value={String(stats?.class_count ?? '-')} />
          <InfoRow label="教师数" value={String(stats?.teacher_count ?? '-')} />
          <InfoRow label="教室数" value={String(stats?.room_count ?? '-')} />
          <InfoRow label="记录数" value={String(stats?.total_records ?? '-')} />
          <InfoRow label="历史任务数" value={String(batch.createdTaskCount ?? '-')} />
          <InfoRow label="历史时段数" value={String(batch.createdSlotCount ?? '-')} />
          <InfoRow label="实际任务数" value={String(batch.actualCreatedTaskCount)} />
          <InfoRow label="实际时段数" value={String(batch.actualCreatedSlotCount)} />
          <InfoRow label="任务班级关联" value={String(batch.actualTeachingTaskClassCount)} />
          <InfoRow label="无教师任务" value={String(batch.nullTeacherTaskCount)} />
          <InfoRow label="无教室时段" value={String(batch.nullRoomSlotCount)} />
        </div>
      </div>

      {/* Flags */}
      <div className="border-t pt-3">
        <h4 className="font-medium mb-2">状态标志</h4>
        <div className="grid grid-cols-2 gap-2">
          <FlagRow label="metadataMatch" value={batch.metadataMatch} />
          <FlagRow label="rollbackComplete" value={batch.rollbackComplete} />
          <FlagRow label="hasPlaceholderTeachers" value={batch.hasPlaceholderTeachers} />
          <FlagRow label="hasPlaceholderRooms" value={batch.hasPlaceholderRooms} />
          <FlagRow label="hasOrphanSlots" value={batch.hasOrphanSlots} />
        </div>
      </div>

      {/* Warnings */}
      <div className="border-t pt-3">
        <div className="flex items-center justify-between mb-2">
          <h4 className="font-medium">
            警告与错误{' '}
            <span className="text-xs text-gray-500">
              (warnings: {safeWarnings}, quality: {totalQualityWarnings}, error: {totalErrorCount})
            </span>
          </h4>
          <button
            className="text-xs text-blue-600 hover:underline flex items-center gap-1"
            onClick={() => setRawWarningsOpen(!rawWarningsOpen)}
            type="button"
          >
            {rawWarningsOpen ? <ChevronDown className="w-3.5 h-3.5" /> : <ChevronRight className="w-3.5 h-3.5" />}
            {rawWarningsOpen ? '收起' : '展开'}原始 JSON
          </button>
        </div>

        {safeWarnings > 0 ? (
          <ul className="space-y-1 max-h-32 overflow-y-auto">
            {warnings.map((w, i) => (
              <li
                key={i}
                className="text-xs text-amber-700 bg-amber-50 px-2 py-1 rounded flex items-start gap-1"
              >
                <Info className="w-3.5 h-3.5 flex-shrink-0 mt-0.5" />
                <span className="whitespace-pre-line break-words">
                  {formatImportWarning(w)}
                </span>
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-xs text-gray-500">无 warnings 字段警告</p>
        )}

        {quality && quality.warnings && quality.warnings.length > 0 && (
          <div className="mt-3">
            <h5 className="text-xs font-medium text-gray-700 mb-1">解析质量警告</h5>
            <ul className="space-y-1 max-h-32 overflow-y-auto">
              {quality.warnings.map((w, i) => (
                <li
                  key={i}
                  className="text-xs text-orange-700 bg-orange-50 px-2 py-1 rounded whitespace-pre-line break-words"
                >
                  {formatImportWarning(w)}
                </li>
              ))}
            </ul>
          </div>
        )}

        {rawWarningsOpen && (
          <pre className="mt-2 text-xs bg-gray-900 text-gray-100 p-3 rounded overflow-x-auto max-h-48">
            {JSON.stringify(batch.warnings, null, 2)}
          </pre>
        )}
      </div>

      {/* Rollback plan */}
      {batch.status === 'confirmed' && (
        <div className="border-t pt-3">
          <h4 className="font-medium mb-2">回滚检查</h4>
          <div className="flex items-center gap-2 mb-2">
            <Button size="sm" variant="outline" onClick={onRollbackCheck} disabled={rollbackChecking}>
              {rollbackChecking ? '检查中...' : '回滚前检查'}
            </Button>
            <Button
              size="sm"
              variant="destructive"
              onClick={onOpenRollbackConfirm}
              disabled={!canExecuteRollback}
            >
              <Undo2 className="w-3.5 h-3.5 mr-1" />
              回滚
            </Button>
          </div>
          {rollbackPlan && (
            <div className="bg-gray-50 border rounded p-2 text-xs space-y-1">
              <p>
                <span className="text-gray-500">canRollback:</span>{' '}
                <Badge variant={rollbackPlan.canRollback ? 'default' : 'destructive'}>
                  {rollbackPlan.canRollback ? '是' : '否'}
                </Badge>
              </p>
              <p>将删除：{rollbackPlan.teachingTasksToDelete} 任务 / {rollbackPlan.scheduleSlotsToDelete} 时段</p>
              {rollbackPlan.blockingReasons.length > 0 && (
                <p className="text-red-700">阻止原因：{rollbackPlan.blockingReasons.join('; ')}</p>
              )}
            </div>
          )}
        </div>
      )}

      {/* Confirm plan */}
      {batch.status === 'pending' && (
        <div className="border-t pt-3">
          <h4 className="font-medium mb-2">确认导入</h4>
          <div className="flex items-center gap-2 mb-2">
            <Button size="sm" variant="outline" onClick={onConfirmCheck} disabled={confirmPlanLoading}>
              {confirmPlanLoading ? '预检中...' : '确认预检'}
            </Button>
            <Button size="sm" onClick={onOpenConfirmDialog} disabled={!confirmPlan}>
              确认导入
            </Button>
          </div>
          {confirmPlan != null && (
            <pre className="mt-2 text-xs bg-gray-50 border rounded p-2 overflow-x-auto max-h-40">
              {JSON.stringify(confirmPlan, null, 2)}
            </pre>
          )}
        </div>
      )}

      {/* Abandon */}
      {batch.status === 'pending' && (
        <div className="border-t pt-3">
          <h4 className="font-medium mb-2">废弃</h4>
          <Button size="sm" variant="destructive" onClick={onOpenAbandonConfirm}>
            <Trash2 className="w-3.5 h-3.5 mr-1" />
            废弃此批次
          </Button>
        </div>
      )}
    </div>
  )
}

function InfoRow({ label, value, mono, wide }: { label: string; value: string; mono?: boolean; wide?: boolean }) {
  return (
    <div className={wide ? 'col-span-2' : ''}>
      <span className="text-gray-500">{label}：</span>
      <span className={mono ? 'font-mono text-xs' : ''}>{value}</span>
    </div>
  )
}

function FlagRow({ label, value }: { label: string; value: boolean }) {
  return (
    <div>
      <span className="text-gray-500">{label}：</span>
      {value ? <Badge variant="destructive">是</Badge> : <Badge variant="outline">否</Badge>}
    </div>
  )
}
