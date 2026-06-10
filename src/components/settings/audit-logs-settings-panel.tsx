'use client'

import { useState, useEffect } from 'react'
import {
  fetchAuditLogs,
  getAuditLogErrorMessage,
  type AuditLogData,
  type AuditLogSource,
  type OperationCoverage,
  type RecentActivityItem,
  type AuditLogLimitation,
  type AuditSourceStatus,
  type OperationCoverageStatus,
} from '@/lib/settings/audit-logs-client'
import { Badge } from '@/components/ui/badge'
import {
  RefreshCw,
  Eye,
  AlertTriangle,
  Info,
  Lock,
  Database,
  ListChecks,
  Activity,
  ShieldAlert,
  CheckCircle2,
  XCircle,
  History,
  ScrollText,
} from 'lucide-react'

const SOURCE_STATUS_MAP: Record<AuditSourceStatus, { label: string; color: string }> = {
  available: { label: '已具备', color: 'bg-green-100 text-green-700 border-green-200' },
  partial: { label: '部分覆盖', color: 'bg-amber-100 text-amber-700 border-amber-200' },
  planned: { label: '待规划', color: 'bg-blue-100 text-blue-700 border-blue-200' },
  none: { label: '未具备', color: 'bg-gray-100 text-gray-500 border-gray-200' },
}

const OPERATION_STATUS_MAP: Record<OperationCoverageStatus, { label: string; color: string; icon: React.ReactNode }> = {
  covered: { label: '已覆盖', color: 'bg-green-100 text-green-700 border-green-200', icon: <CheckCircle2 className="w-3 h-3" /> },
  partial: { label: '部分覆盖', color: 'bg-amber-100 text-amber-700 border-amber-200', icon: <AlertTriangle className="w-3 h-3" /> },
  planned: { label: '待规划', color: 'bg-blue-100 text-blue-700 border-blue-200', icon: <Info className="w-3 h-3" /> },
  'not-covered': { label: '未覆盖', color: 'bg-red-100 text-red-700 border-red-200', icon: <XCircle className="w-3 h-3" /> },
}

const TYPE_ICON: Record<string, React.ReactNode> = {
  SchedulingRun: <Activity className="w-4 h-4" />,
  SchedulerRunChange: <ListChecks className="w-4 h-4" />,
  ScheduleAdjustment: <ScrollText className="w-4 h-4" />,
  ImportBatch: <Database className="w-4 h-4" />,
  Semester: <History className="w-4 h-4" />,
}

export function AuditLogsSettingsPanel() {
  const [data, setData] = useState<AuditLogData | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    fetchAuditLogs()
      .then((r) => { if (!cancelled) setData(r) })
      .catch((e) => {
        if (!cancelled) {
          setError(e instanceof Error ? e.message : '加载失败')
        }
      })
      .finally(() => { if (!cancelled) setLoading(false) })
    return () => { cancelled = true }
  }, [])

  const reload = () => {
    setLoading(true)
    setError(null)
    fetchAuditLogs()
      .then(setData)
      .catch((e) => setError(e instanceof Error ? e.message : '加载失败'))
      .finally(() => setLoading(false))
  }

  if (loading) {
    return (
      <div className="bg-white rounded-lg border border-gray-200 p-6">
        <div className="flex items-center gap-2 text-gray-500">
          <RefreshCw className="w-4 h-4 animate-spin" />
          <span className="text-sm">加载中...</span>
        </div>
      </div>
    )
  }

  if (error) {
    return (
      <div className="bg-white rounded-lg border border-red-200 p-6">
        <div className="flex items-center gap-2 text-red-600 mb-2">
          <AlertTriangle className="w-4 h-4" />
          <span className="text-sm font-medium">加载失败</span>
        </div>
        <p className="text-sm text-red-500">{getAuditLogErrorMessage(error)}</p>
        <button onClick={reload} className="mt-2 text-sm text-blue-600 hover:underline">
          重试
        </button>
      </div>
    )
  }

  if (!data) return null

  const { summary, sources, operationCoverage, recentActivity, limitations } = data

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Eye className="w-5 h-5 text-slate-600" />
          <h2 className="text-lg font-bold text-gray-900">审计日志</h2>
          <Badge className="text-xs bg-slate-100 text-slate-700 border-slate-200">
            基础只读版
          </Badge>
        </div>
        <button
          onClick={reload}
          className="flex items-center gap-1 text-sm text-gray-500 hover:text-gray-700"
        >
          <RefreshCw className="w-4 h-4" /> 刷新
        </button>
      </div>

      {/* Top read-only notice */}
      <div className="bg-slate-50 rounded-lg border border-slate-200 p-4 flex items-start gap-2">
        <Lock className="w-4 h-4 text-slate-500 mt-0.5 shrink-0" />
        <div className="text-xs text-slate-600 space-y-1">
          <p className="font-medium text-slate-700">本模块为只读基础版 (read-only)。</p>
          <p>
            不提供删除 / 清理 / 导出 / 保存 / 新建统一 AuditLog 等写入入口。
            API 仅暴露 GET handler (权限 settings:manage)。
          </p>
        </div>
      </div>

      {/* Summary cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <SummaryCard
          label="审计来源数"
          value={String(summary.auditSourcesCount)}
          ok={summary.auditSourcesCount > 0}
          icon={<Database className="w-4 h-4" />}
        />
        <SummaryCard
          label="已覆盖操作"
          value={String(summary.coveredOperationCount)}
          ok={summary.coveredOperationCount > 0}
          icon={<CheckCircle2 className="w-4 h-4" />}
        />
        <SummaryCard
          label="部分覆盖"
          value={String(summary.partialOperationCount)}
          warn={summary.partialOperationCount > 0}
          icon={<AlertTriangle className="w-4 h-4" />}
        />
        <SummaryCard
          label="未覆盖 / 待规划"
          value={String(summary.plannedOperationCount + summary.notCoveredOperationCount)}
          warn={(summary.plannedOperationCount + summary.notCoveredOperationCount) > 0}
          icon={<ShieldAlert className="w-4 h-4" />}
        />
      </div>

      {/* Unified audit log existence marker */}
      <div className="bg-amber-50 rounded-lg border border-amber-200 p-4 flex items-start gap-2">
        <Info className="w-4 h-4 text-amber-600 mt-0.5 shrink-0" />
        <div className="text-xs text-amber-700 space-y-1">
          <p className="font-medium">
            统一 AuditLog schema:
            {summary.unifiedAuditLogSchemaExists ? (
              <span className="ml-1 text-green-700">已存在 (unifiedAuditLogSchemaExists=true)</span>
            ) : (
              <span className="ml-1 text-amber-700">未实现 (unifiedAuditLogSchemaExists=false, planned)</span>
            )}
          </p>
          <p>
            本阶段仅做局部审计来源聚合, 不引入统一审计日志表。
            详见下方&ldquo;统一审计待办 / limitations&rdquo;。
          </p>
        </div>
      </div>

      {/* Audit sources */}
      <div className="space-y-4">
        <h3 className="text-sm font-semibold text-gray-900 flex items-center gap-2">
          <Database className="w-4 h-4" />
          已有审计来源 (audit sources)
        </h3>
        {sources.map((s) => (
          <SourceCard key={s.key} source={s} />
        ))}
      </div>

      {/* Operation coverage */}
      <div className="bg-white rounded-lg border border-gray-200 p-5">
        <h3 className="text-sm font-semibold text-gray-900 mb-3 flex items-center gap-2">
          <ListChecks className="w-4 h-4" />
          关键操作覆盖状态 (operation coverage)
        </h3>
        {operationCoverage.length === 0 ? (
          <div className="text-sm text-gray-500">暂无操作项</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-200">
                  <th className="text-left py-2 pr-4 font-medium text-gray-500">操作</th>
                  <th className="text-left py-2 pr-4 font-medium text-gray-500">状态</th>
                  <th className="text-left py-2 pr-4 font-medium text-gray-500">数据来源</th>
                  <th className="text-left py-2 pr-4 font-medium text-gray-500">说明</th>
                </tr>
              </thead>
              <tbody>
                {operationCoverage.map((op) => (
                  <OperationRow key={op.key} op={op} />
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Recent activity */}
      <div className="bg-white rounded-lg border border-gray-200 p-5">
        <h3 className="text-sm font-semibold text-gray-900 mb-3 flex items-center gap-2">
          <Activity className="w-4 h-4" />
          最近活动摘要 (recent activity)
          <span className="text-xs text-gray-400 font-normal">最近 {summary.recentActivityCount} 条</span>
        </h3>
        {recentActivity.length === 0 ? (
          <div className="text-sm text-gray-500">暂无最近活动记录</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-200">
                  <th className="text-left py-2 pr-4 font-medium text-gray-500">类型</th>
                  <th className="text-left py-2 pr-4 font-medium text-gray-500">事件</th>
                  <th className="text-left py-2 pr-4 font-medium text-gray-500">时间</th>
                  <th className="text-left py-2 pr-4 font-medium text-gray-500">操作者</th>
                  <th className="text-left py-2 pr-4 font-medium text-gray-500">来源</th>
                  <th className="text-left py-2 pr-4 font-medium text-gray-500">详情</th>
                </tr>
              </thead>
              <tbody>
                {recentActivity.map((item) => (
                  <ActivityRow key={item.id} item={item} />
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Limitations */}
      <div className="bg-white rounded-lg border border-gray-200 p-5">
        <h3 className="text-sm font-semibold text-gray-900 mb-3 flex items-center gap-2">
          <ShieldAlert className="w-4 h-4" />
          统一审计待办 (limitations)
        </h3>
        <div className="space-y-2">
          {limitations.map((l) => (
            <LimitationRow key={l.key} l={l} />
          ))}
        </div>
      </div>

      {/* Safety rules */}
      <div className="bg-white rounded-lg border border-gray-200 p-5">
        <h3 className="text-sm font-semibold text-gray-900 mb-3 flex items-center gap-2">
          <Lock className="w-4 h-4" />
          只读约束 (safety rules)
        </h3>
        <ul className="space-y-1.5">
          {data.safetyRules.map((rule, i) => (
            <li key={i} className="flex items-start gap-2 text-xs text-gray-700">
              <span className="text-red-500 font-bold shrink-0">✗</span>
              <span>{rule}</span>
            </li>
          ))}
        </ul>
      </div>

      {/* Bottom read-only notice */}
      <div className="bg-gray-50 rounded-lg border border-gray-200 p-4 flex items-start gap-2">
        <Info className="w-4 h-4 text-gray-400 mt-0.5 shrink-0" />
        <div className="text-xs text-gray-500 space-y-1">
          <p className="font-medium text-gray-700">本模块为只读基础版。</p>
          <p>
            统一审计日志 (含 actor / ip / userAgent / before-after diff / 保留策略 / 清理机制)
            将在后续 K26-Q2+ 阶段规划。本页面不提供任何写入入口。
          </p>
        </div>
      </div>
    </div>
  )
}

// ── Sub-components ─────────────────────────────────────────────

function SummaryCard({
  label,
  value,
  ok,
  warn,
  icon,
}: {
  label: string
  value: string
  ok?: boolean
  warn?: boolean
  icon?: React.ReactNode
}) {
  const borderClass = warn
    ? 'border-amber-200'
    : ok
      ? 'border-green-200'
      : 'border-gray-200'
  return (
    <div className={`bg-white rounded-lg border p-4 ${borderClass}`}>
      <div className="text-xs text-gray-500 mb-1 flex items-center gap-1">
        {icon}
        {label}
      </div>
      <div className="text-2xl font-bold text-gray-900">{value}</div>
    </div>
  )
}

function SourceCard({ source }: { source: AuditLogSource }) {
  const status = SOURCE_STATUS_MAP[source.status] ?? SOURCE_STATUS_MAP.none
  return (
    <div className="bg-white rounded-lg border border-gray-200 p-4">
      <div className="flex items-center gap-2 flex-wrap mb-2">
        <Database className="w-4 h-4 text-gray-500" />
        <h4 className="text-sm font-semibold text-gray-900">{source.label}</h4>
        <Badge className={`text-xs ${status.color}`}>{status.label}</Badge>
        {source.modelOrTable && (
          <code className="text-[10px] font-mono bg-gray-100 px-1.5 py-0.5 rounded text-gray-600">
            {source.modelOrTable}
          </code>
        )}
        {source.recordCount != null && (
          <span className="text-xs text-gray-500 ml-auto">
            记录数: <code className="bg-gray-100 px-1 rounded">{source.recordCount}</code>
          </span>
        )}
        <span className="text-xs text-gray-400 flex items-center gap-1">
          <Lock className="w-3 h-3" /> 只读
        </span>
      </div>
      <p className="text-xs text-gray-600">{source.description}</p>
    </div>
  )
}

function OperationRow({ op }: { op: OperationCoverage }) {
  const status = OPERATION_STATUS_MAP[op.status] ?? OPERATION_STATUS_MAP['not-covered']
  return (
    <tr className="border-b border-gray-100">
      <td className="py-2 pr-4 text-sm font-medium text-gray-900">{op.label}</td>
      <td className="py-2 pr-4">
        <Badge className={`text-xs inline-flex items-center gap-1 ${status.color}`}>
          {status.icon}
          {status.label}
        </Badge>
      </td>
      <td className="py-2 pr-4">
        <code className="text-[11px] font-mono bg-gray-50 px-1 py-0.5 rounded text-gray-700">
          {op.source}
        </code>
      </td>
      <td className="py-2 pr-4 text-xs text-gray-600">{op.description}</td>
    </tr>
  )
}

function ActivityRow({ item }: { item: RecentActivityItem }) {
  const icon = TYPE_ICON[item.type] ?? <Info className="w-4 h-4" />
  return (
    <tr className="border-b border-gray-100">
      <td className="py-2 pr-4">
        <div className="flex items-center gap-1 text-xs text-gray-700">
          {icon}
          <span>{item.type}</span>
        </div>
      </td>
      <td className="py-2 pr-4 text-sm text-gray-900">{item.label}</td>
      <td className="py-2 pr-4 text-xs text-gray-500 font-mono">{item.createdAt ?? '—'}</td>
      <td className="py-2 pr-4 text-xs text-gray-500">{item.actor ?? '—'}</td>
      <td className="py-2 pr-4 text-xs text-gray-500">
        <code className="text-[10px] font-mono bg-gray-50 px-1 rounded">{item.source}</code>
      </td>
      <td className="py-2 pr-4 text-xs text-gray-600 font-mono">{item.detail}</td>
    </tr>
  )
}

function LimitationRow({ l }: { l: AuditLogLimitation }) {
  return (
    <div className="flex items-start gap-2 p-2 rounded border border-amber-100 bg-amber-50/50">
      <AlertTriangle className="w-4 h-4 text-amber-600 mt-0.5 shrink-0" />
      <div className="flex-1">
        <div className="text-sm font-medium text-gray-900">{l.label}</div>
        <p className="text-xs text-gray-600 mt-0.5">{l.description}</p>
      </div>
    </div>
  )
}
