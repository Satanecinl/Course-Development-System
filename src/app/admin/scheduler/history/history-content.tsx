'use client'

import { useState, useEffect, useCallback } from 'react'
import {
  History,
  Eye,
  ChevronDown,
  ChevronUp,
  Clock,
  Hash,
  AlertTriangle,
  Filter,
  RefreshCw,
  BookOpen,
  User,
  Users,
  MapPin,
  ArrowLeft,
  ChevronLeft,
  ChevronRight,
  Sparkles,
  CheckCircle2,
  RotateCcw,
  ShieldAlert,
  Lock,
} from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import Link from 'next/link'

// ── Types ──

interface RunListItem {
  id: number
  mode: string | null
  status: string
  createdAt: string
  completedAt: string | null
  durationMs: number | null
  hardScoreBefore: number | null
  hardScoreAfter: number | null
  softScoreBefore: number | null
  softScoreAfter: number | null
  hc1Before: number | null
  hc1After: number | null
  hc2Before: number | null
  hc2After: number | null
  hc3Before: number | null
  hc3After: number | null
  hc4Before: number | null
  hc4After: number | null
  changedSlotCount: number
  previewExpiresAt: string | null
  appliedAt: string | null
  rolledBackAt: string | null
  rollbackOfRunId: number | null
  databaseFingerprint: string | null
  operatorNameSnapshot: string | null
}

interface ChangeDetail {
  id: number
  scheduleSlotId: number
  teachingTaskId: number
  courseName: string | null
  teacherName: string | null
  classGroups: string | null
  oldDayOfWeek: number | null
  oldSlotIndex: number | null
  oldRoomName: string | null
  newDayOfWeek: number | null
  newSlotIndex: number | null
  newRoomName: string | null
  createdAt: string
}

interface RunDetailData {
  run: RunListItem & {
    startedAt: string | null
    iterations: number | null
    randomSeed: number | null
    solverVersion: string | null
    errorMessage: string | null
    lockedSlotIds: number[]
    lockedSlotCount: number
  }
  changes: ChangeDetail[]
}

interface Pagination {
  page: number
  pageSize: number
  total: number
  totalPages: number
}

const DAY_NAMES = ['', '周一', '周二', '周三', '周四', '周五', '周六', '周日']

// ── Helpers ──

function formatDuration(ms: number | null): string {
  if (ms == null) return '-'
  if (ms < 1000) return `${ms}ms`
  return `${(ms / 1000).toFixed(2)}s`
}

function formatDateTime(iso: string | null): string {
  if (!iso) return '-'
  return new Date(iso).toLocaleString('zh-CN')
}

function modeLabel(mode: string | null): string {
  switch (mode) {
    case 'PREVIEW': return 'Preview'
    case 'APPLY': return 'Apply'
    case 'ROLLBACK': return 'Rollback'
    default: return mode || '未知'
  }
}

function modeBadgeVariant(mode: string | null): 'default' | 'secondary' | 'destructive' | 'outline' {
  switch (mode) {
    case 'PREVIEW': return 'secondary'
    case 'APPLY': return 'default'
    case 'ROLLBACK': return 'outline'
    default: return 'secondary'
  }
}

function statusBadgeVariant(status: string): 'default' | 'secondary' | 'destructive' | 'outline' {
  switch (status) {
    case 'COMPLETED': return 'default'
    case 'PENDING': return 'secondary'
    case 'BLOCKED': return 'destructive'
    case 'FAILED': return 'destructive'
    case 'ROLLED_BACK': return 'outline'
    case 'APPLYING': return 'secondary'
    case 'ROLLING_BACK': return 'secondary'
    default: return 'secondary'
  }
}

function hcBadgeVariant(value: number | null): 'default' | 'secondary' | 'destructive' {
  if (value == null) return 'secondary'
  return value > 0 ? 'destructive' : 'default'
}

// ── Component ──

export default function HistoryContent() {
  const [items, setItems] = useState<RunListItem[]>([])
  const [pagination, setPagination] = useState<Pagination>({ page: 1, pageSize: 20, total: 0, totalPages: 0 })
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const [modeFilter, setModeFilter] = useState('')
  const [statusFilter, setStatusFilter] = useState('')

  const [expandedRunId, setExpandedRunId] = useState<number | null>(null)
  const [detailData, setDetailData] = useState<Record<number, RunDetailData>>({})
  const [detailLoading, setDetailLoading] = useState<Set<number>>(new Set())

  // ── Fetch list ──

  const fetchRuns = useCallback(async (page = 1) => {
    setLoading(true)
    setError(null)

    try {
      const params = new URLSearchParams()
      params.set('page', String(page))
      params.set('pageSize', '20')
      if (modeFilter) params.set('mode', modeFilter)
      if (statusFilter) params.set('status', statusFilter)

      const res = await fetch(`/api/admin/scheduler/runs?${params.toString()}`)
      const json = await res.json()

      if (!json.success) {
        throw new Error(json.message || json.error || '获取运行记录失败')
      }

      setItems(json.data.items)
      setPagination(json.data)
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e)
      setError(msg)
      toast.error(`获取历史记录失败: ${msg}`)
    } finally {
      setLoading(false)
    }
  }, [modeFilter, statusFilter])

  useEffect(() => {
    fetchRuns(1)
  }, [fetchRuns])

  // ── Fetch detail ──

  const toggleDetail = async (runId: number) => {
    if (expandedRunId === runId) {
      setExpandedRunId(null)
      return
    }

    setExpandedRunId(runId)

    if (detailData[runId]) {
      return // already loaded
    }

    setDetailLoading((prev) => new Set(prev).add(runId))

    try {
      const res = await fetch(`/api/admin/scheduler/runs/${runId}`)
      const json = await res.json()

      if (!json.success) {
        throw new Error(json.message || json.error || '获取详情失败')
      }

      setDetailData((prev) => ({ ...prev, [runId]: json.data }))
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e)
      toast.error(`获取详情失败: ${msg}`)
    } finally {
      setDetailLoading((prev) => {
        const next = new Set(prev)
        next.delete(runId)
        return next
      })
    }
  }

  // ── Render ──

  return (
    <div className="p-6 max-w-7xl mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-3">
          <History className="w-6 h-6 text-blue-500" />
          <h2 className="text-xl font-bold text-gray-900">自动排课运行历史</h2>
          <Badge variant="secondary">只读审计</Badge>
        </div>
        <Link href="/admin/scheduler">
          <Button variant="outline" size="sm">
            <ArrowLeft className="w-4 h-4 mr-1.5" />
            返回排课控制台
          </Button>
        </Link>
      </div>

      {/* Info Banner */}
      <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 mb-6">
        <div className="flex items-start gap-3">
          <ShieldAlert className="w-5 h-5 text-blue-600 shrink-0 mt-0.5" />
          <div className="text-sm text-blue-800">
            <p className="font-medium">此页面仅用于查看 Preview / Apply / Rollback 审计记录，不会修改课表数据。</p>
            <p className="mt-1">如需执行新的排课操作，请前往 <Link href="/admin/scheduler" className="underline">自动排课控制台</Link>。</p>
          </div>
        </div>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap items-center gap-3 mb-4">
        <div className="flex items-center gap-2">
          <Filter className="w-4 h-4 text-gray-400" />
          <select
            value={modeFilter}
            onChange={(e) => setModeFilter(e.target.value)}
            className="text-sm border border-gray-200 rounded-md px-2 py-1.5 bg-white focus:outline-none focus:ring-2 focus:ring-blue-500"
          >
            <option value="">全部类型</option>
            <option value="PREVIEW">Preview</option>
            <option value="APPLY">Apply</option>
            <option value="ROLLBACK">Rollback</option>
          </select>
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            className="text-sm border border-gray-200 rounded-md px-2 py-1.5 bg-white focus:outline-none focus:ring-2 focus:ring-blue-500"
          >
            <option value="">全部状态</option>
            <option value="COMPLETED">COMPLETED</option>
            <option value="PENDING">PENDING</option>
            <option value="BLOCKED">BLOCKED</option>
            <option value="FAILED">FAILED</option>
            <option value="ROLLED_BACK">ROLLED_BACK</option>
          </select>
        </div>
        <Button variant="ghost" size="sm" onClick={() => fetchRuns(pagination.page)} disabled={loading}>
          <RefreshCw className={`w-4 h-4 mr-1.5 ${loading ? 'animate-spin' : ''}`} />
          刷新
        </Button>
        <div className="text-sm text-gray-500 ml-auto">
          共 {pagination.total} 条记录
        </div>
      </div>

      {/* Error */}
      {error && (
        <div className="bg-red-50 border border-red-200 rounded-lg p-4 mb-6">
          <div className="flex items-start gap-3">
            <AlertTriangle className="w-5 h-5 text-red-600 shrink-0 mt-0.5" />
            <div>
              <p className="font-medium text-red-800">加载失败</p>
              <p className="text-sm text-red-700 mt-1">{error}</p>
            </div>
          </div>
        </div>
      )}

      {/* Table */}
      <div className="bg-white rounded-lg shadow border border-gray-200 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-gray-50 text-gray-500 text-xs border-b border-gray-200">
                <th className="text-left p-3 font-medium">Run ID</th>
                <th className="text-left p-3 font-medium">类型</th>
                <th className="text-left p-3 font-medium">状态</th>
                <th className="text-left p-3 font-medium">创建时间</th>
                <th className="text-left p-3 font-medium">耗时</th>
                <th className="text-center p-3 font-medium">Hard Before → After</th>
                <th className="text-center p-3 font-medium">HC1~HC4 After</th>
                <th className="text-center p-3 font-medium">变更数</th>
                <th className="text-left p-3 font-medium">操作者</th>
                <th className="text-center p-3 font-medium">操作</th>
              </tr>
            </thead>
            <tbody>
              {items.length === 0 && !loading && (
                <tr>
                  <td colSpan={10} className="p-8 text-center text-gray-400">
                    暂无运行记录
                  </td>
                </tr>
              )}
              {loading && items.length === 0 && (
                <tr>
                  <td colSpan={10} className="p-8 text-center text-gray-400">
                    <RefreshCw className="w-5 h-5 animate-spin mx-auto mb-2" />
                    加载中...
                  </td>
                </tr>
              )}
              {items.map((run) => (
                <>
                  <tr
                    key={run.id}
                    className="border-t border-gray-100 hover:bg-gray-50 cursor-pointer transition-colors"
                    onClick={() => toggleDetail(run.id)}
                  >
                    <td className="p-3">
                      <div className="flex items-center gap-1.5">
                        <Hash className="w-3.5 h-3.5 text-gray-400" />
                        <span className="font-mono font-medium">{run.id}</span>
                      </div>
                    </td>
                    <td className="p-3">
                      <Badge variant={modeBadgeVariant(run.mode)}>
                        {modeLabel(run.mode)}
                      </Badge>
                    </td>
                    <td className="p-3">
                      <Badge variant={statusBadgeVariant(run.status)}>
                        {run.status}
                      </Badge>
                    </td>
                    <td className="p-3 text-gray-600">
                      {formatDateTime(run.createdAt)}
                    </td>
                    <td className="p-3 text-gray-600">
                      <div className="flex items-center gap-1">
                        <Clock className="w-3.5 h-3.5 text-gray-400" />
                        {formatDuration(run.durationMs)}
                      </div>
                    </td>
                    <td className="p-3 text-center">
                      <div className="flex items-center justify-center gap-1">
                        <span className="text-red-600">{run.hardScoreBefore ?? '-'}</span>
                        <span className="text-gray-400">→</span>
                        <span className={run.hardScoreAfter === 0 ? 'text-green-600 font-medium' : 'text-red-600'}>
                          {run.hardScoreAfter ?? '-'}
                        </span>
                      </div>
                    </td>
                    <td className="p-3 text-center">
                      <div className="flex items-center justify-center gap-1">
                        <Badge variant={hcBadgeVariant(run.hc1After)} className="text-[10px] px-1 py-0">
                          HC1:{run.hc1After ?? '-'}
                        </Badge>
                        <Badge variant={hcBadgeVariant(run.hc2After)} className="text-[10px] px-1 py-0">
                          HC2:{run.hc2After ?? '-'}
                        </Badge>
                        <Badge variant={hcBadgeVariant(run.hc3After)} className="text-[10px] px-1 py-0">
                          HC3:{run.hc3After ?? '-'}
                        </Badge>
                        <Badge variant={hcBadgeVariant(run.hc4After)} className="text-[10px] px-1 py-0">
                          HC4:{run.hc4After ?? '-'}
                        </Badge>
                      </div>
                    </td>
                    <td className="p-3 text-center font-medium">
                      {run.changedSlotCount}
                    </td>
                    <td className="p-3 text-gray-600">
                      {run.operatorNameSnapshot || '-'}
                    </td>
                    <td className="p-3 text-center">
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={(e) => {
                          e.stopPropagation()
                          toggleDetail(run.id)
                        }}
                      >
                        {expandedRunId === run.id ? (
                          <ChevronUp className="w-4 h-4" />
                        ) : (
                          <Eye className="w-4 h-4" />
                        )}
                      </Button>
                    </td>
                  </tr>

                  {/* Expanded Detail */}
                  {expandedRunId === run.id && (
                    <tr>
                      <td colSpan={10} className="p-0">
                        <div className="bg-gray-50 border-t border-gray-200 p-4">
                          {detailLoading.has(run.id) ? (
                            <div className="py-8 text-center text-gray-400">
                              <RefreshCw className="w-5 h-5 animate-spin mx-auto mb-2" />
                              加载详情...
                            </div>
                          ) : detailData[run.id] ? (
                            <RunDetailView data={detailData[run.id]} />
                          ) : (
                            <div className="py-4 text-center text-gray-400">加载失败</div>
                          )}
                        </div>
                      </td>
                    </tr>
                  )}
                </>
              ))}
            </tbody>
          </table>
        </div>

        {/* Pagination */}
        {pagination.totalPages > 1 && (
          <div className="flex items-center justify-between px-4 py-3 border-t border-gray-200 bg-gray-50">
            <div className="text-sm text-gray-500">
              第 {pagination.page} / {pagination.totalPages} 页
            </div>
            <div className="flex items-center gap-2">
              <Button
                variant="outline"
                size="sm"
                disabled={pagination.page <= 1 || loading}
                onClick={() => fetchRuns(pagination.page - 1)}
              >
                <ChevronLeft className="w-4 h-4 mr-1" />
                上一页
              </Button>
              <Button
                variant="outline"
                size="sm"
                disabled={pagination.page >= pagination.totalPages || loading}
                onClick={() => fetchRuns(pagination.page + 1)}
              >
                下一页
                <ChevronRight className="w-4 h-4 ml-1" />
              </Button>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

// ── Run Detail Sub-component ──

function RunDetailView({ data }: { data: RunDetailData }) {
  const { run, changes } = data

  return (
    <div className="space-y-4">
      {/* Detail Header */}
      <div className="flex items-center gap-2 mb-2">
        <Eye className="w-4 h-4 text-blue-500" />
        <h3 className="font-semibold text-gray-900">Run #{run.id} 详情</h3>
        <Badge variant={modeBadgeVariant(run.mode)}>{modeLabel(run.mode)}</Badge>
        <Badge variant={statusBadgeVariant(run.status)}>{run.status}</Badge>
      </div>

      {/* Info Grid */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-sm">
        <InfoItem icon={<Clock className="w-3.5 h-3.5" />} label="创建时间" value={formatDateTime(run.createdAt)} />
        <InfoItem icon={<Clock className="w-3.5 h-3.5" />} label="完成时间" value={formatDateTime(run.completedAt)} />
        <InfoItem icon={<Clock className="w-3.5 h-3.5" />} label="耗时" value={formatDuration(run.durationMs)} />
        <InfoItem icon={<Sparkles className="w-3.5 h-3.5" />} label="迭代次数" value={run.iterations != null ? run.iterations.toLocaleString() : '-'} />
        <InfoItem icon={<Hash className="w-3.5 h-3.5" />} label="Solver 版本" value={run.solverVersion || '-'} />
        <InfoItem icon={<Hash className="w-3.5 h-3.5" />} label="随机种子" value={run.randomSeed != null ? String(run.randomSeed) : '-'} />
        <InfoItem icon={<User className="w-3.5 h-3.5" />} label="操作者" value={run.operatorNameSnapshot || '-'} />
        <InfoItem icon={<Hash className="w-3.5 h-3.5" />} label="变更数量" value={String(run.changedSlotCount)} />
        <InfoItem icon={<Lock className="w-3.5 h-3.5" />} label="锁定槽位" value={String(run.lockedSlotCount ?? 0)} />
      </div>

      {/* Locked Slot IDs */}
      {run.lockedSlotIds && run.lockedSlotIds.length > 0 && (
        <div className="bg-amber-50 border border-amber-200 rounded-lg p-3">
          <div className="flex items-center gap-2 mb-2">
            <Lock className="w-4 h-4 text-amber-600" />
            <p className="text-xs font-medium text-amber-700">锁定槽位 ID 列表</p>
          </div>
          <div className="flex flex-wrap gap-1.5">
            {run.lockedSlotIds.map((id) => (
              <Badge key={id} variant="secondary" className="bg-amber-100 text-amber-700 border-amber-200">
                #{id}
              </Badge>
            ))}
          </div>
        </div>
      )}

      {/* Score Comparison */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <ScoreCard title="优化前" hard={run.hardScoreBefore} soft={run.softScoreBefore} hc1={run.hc1Before} hc2={run.hc2Before} hc3={run.hc3Before} hc4={run.hc4Before} />
        <ScoreCard title="优化后" hard={run.hardScoreAfter} soft={run.softScoreAfter} hc1={run.hc1After} hc2={run.hc2After} hc3={run.hc3After} hc4={run.hc4After} />
      </div>

      {/* Fingerprint & Safety */}
      {run.databaseFingerprint && (
        <div className="bg-white rounded border border-gray-200 p-3">
          <p className="text-xs font-medium text-gray-500 mb-1">Database Fingerprint</p>
          <code className="text-xs font-mono text-gray-700 break-all">{run.databaseFingerprint}</code>
        </div>
      )}

      {/* Error Message */}
      {run.errorMessage && (
        <div className="bg-red-50 border border-red-200 rounded-lg p-3">
          <p className="text-xs font-medium text-red-700 mb-1">错误信息</p>
          <p className="text-sm text-red-600">{run.errorMessage}</p>
        </div>
      )}

      {/* Timeline */}
      {(run.previewExpiresAt || run.appliedAt || run.rolledBackAt || run.rollbackOfRunId) && (
        <div className="bg-white rounded border border-gray-200 p-3">
          <p className="text-xs font-medium text-gray-500 mb-2">时间线</p>
          <div className="space-y-1 text-sm">
            {run.previewExpiresAt && (
              <div className="flex items-center gap-2">
                <Clock className="w-3.5 h-3.5 text-gray-400" />
                <span className="text-gray-500">Preview 过期:</span>
                <span>{formatDateTime(run.previewExpiresAt)}</span>
              </div>
            )}
            {run.appliedAt && (
              <div className="flex items-center gap-2">
                <CheckCircle2 className="w-3.5 h-3.5 text-green-500" />
                <span className="text-gray-500">Apply 时间:</span>
                <span>{formatDateTime(run.appliedAt)}</span>
              </div>
            )}
            {run.rolledBackAt && (
              <div className="flex items-center gap-2">
                <RotateCcw className="w-3.5 h-3.5 text-blue-500" />
                <span className="text-gray-500">Rollback 时间:</span>
                <span>{formatDateTime(run.rolledBackAt)}</span>
              </div>
            )}
            {run.rollbackOfRunId && (
              <div className="flex items-center gap-2">
                <RotateCcw className="w-3.5 h-3.5 text-blue-500" />
                <span className="text-gray-500">Rollback of Run ID:</span>
                <span className="font-mono">{run.rollbackOfRunId}</span>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Changes Table */}
      {changes.length > 0 && (
        <div>
          <div className="flex items-center gap-2 mb-2">
            <MapPin className="w-4 h-4 text-gray-500" />
            <h4 className="font-medium text-gray-900">SchedulerRunChange 明细 ({changes.length} 条)</h4>
          </div>
          <div className="overflow-x-auto bg-white rounded border border-gray-200">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-gray-50 text-gray-500 text-xs border-b border-gray-200">
                  <th className="text-left p-2 font-medium">ID</th>
                  <th className="text-left p-2 font-medium">Slot</th>
                  <th className="text-left p-2 font-medium">课程</th>
                  <th className="text-left p-2 font-medium">教师</th>
                  <th className="text-left p-2 font-medium">班级</th>
                  <th className="text-center p-2 font-medium">原时间</th>
                  <th className="text-center p-2 font-medium">原教室</th>
                  <th className="text-center p-2 font-medium">新时间</th>
                  <th className="text-center p-2 font-medium">新教室</th>
                </tr>
              </thead>
              <tbody>
                {changes.map((c) => (
                  <tr key={c.id} className="border-t border-gray-100 hover:bg-gray-50">
                    <td className="p-2 font-mono text-xs text-gray-500">{c.id}</td>
                    <td className="p-2 font-mono text-xs text-gray-500">{c.scheduleSlotId}</td>
                    <td className="p-2">
                      <div className="flex items-center gap-1">
                        <BookOpen className="w-3 h-3 text-gray-400" />
                        <span className="truncate max-w-[120px]" title={c.courseName || ''}>{c.courseName || '-'}</span>
                      </div>
                    </td>
                    <td className="p-2">
                      <div className="flex items-center gap-1">
                        <User className="w-3 h-3 text-gray-400" />
                        <span>{c.teacherName || '-'}</span>
                      </div>
                    </td>
                    <td className="p-2">
                      <div className="flex items-center gap-1">
                        <Users className="w-3 h-3 text-gray-400" />
                        <span className="truncate max-w-[150px]" title={c.classGroups || ''}>{c.classGroups || '-'}</span>
                      </div>
                    </td>
                    <td className="p-2 text-center">
                      {c.oldDayOfWeek != null && c.oldSlotIndex != null ? (
                        <span className="text-red-600">
                          {DAY_NAMES[c.oldDayOfWeek]} 第{c.oldSlotIndex}节
                        </span>
                      ) : (
                        '-'
                      )}
                    </td>
                    <td className="p-2 text-center text-red-600">{c.oldRoomName || '-'}</td>
                    <td className="p-2 text-center">
                      {c.newDayOfWeek != null && c.newSlotIndex != null ? (
                        <span className="text-green-600">
                          {DAY_NAMES[c.newDayOfWeek]} 第{c.newSlotIndex}节
                        </span>
                      ) : (
                        '-'
                      )}
                    </td>
                    <td className="p-2 text-center text-green-600">{c.newRoomName || '-'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  )
}

// ── Sub-components ──

function InfoItem({ icon, label, value }: { icon: React.ReactNode; label: string; value: string }) {
  return (
    <div className="bg-white rounded border border-gray-200 p-2.5">
      <div className="flex items-center gap-1.5 text-gray-400 mb-1">
        {icon}
        <span className="text-xs">{label}</span>
      </div>
      <p className="text-sm font-medium text-gray-800">{value}</p>
    </div>
  )
}

function ScoreCard({
  title,
  hard,
  soft,
  hc1,
  hc2,
  hc3,
  hc4,
}: {
  title: string
  hard: number | null
  soft: number | null
  hc1: number | null
  hc2: number | null
  hc3: number | null
  hc4: number | null
}) {
  return (
    <div className="bg-white rounded border border-gray-200 p-4">
      <p className="text-xs font-medium text-gray-500 mb-2">{title}</p>
      <div className="flex items-center gap-4 mb-2">
        <div>
          <p className="text-xs text-gray-400">Hard Score</p>
          <p className={`text-lg font-bold ${hard === 0 ? 'text-green-600' : hard != null && hard < 0 ? 'text-red-600' : 'text-gray-700'}`}>
            {hard ?? '-'}
          </p>
        </div>
        <div>
          <p className="text-xs text-gray-400">Soft Score</p>
          <p className="text-lg font-bold text-gray-700">{soft ?? '-'}</p>
        </div>
      </div>
      <div className="flex gap-1.5 flex-wrap">
        <Badge variant={hcBadgeVariant(hc1)} className="text-[10px] px-1 py-0">HC1:{hc1 ?? '-'}</Badge>
        <Badge variant={hcBadgeVariant(hc2)} className="text-[10px] px-1 py-0">HC2:{hc2 ?? '-'}</Badge>
        <Badge variant={hcBadgeVariant(hc3)} className="text-[10px] px-1 py-0">HC3:{hc3 ?? '-'}</Badge>
        <Badge variant={hcBadgeVariant(hc4)} className="text-[10px] px-1 py-0">HC4:{hc4 ?? '-'}</Badge>
      </div>
    </div>
  )
}
