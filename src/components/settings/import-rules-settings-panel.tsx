'use client'

import { useState, useEffect } from 'react'
import { fetchImportRules, type ImportRulesData } from '@/lib/settings/import-rules-client'
import { Badge } from '@/components/ui/badge'
import {
  RefreshCw,
  ShieldCheck,
  ShieldAlert,
  AlertTriangle,
  Info,
  Lock,
  FileUp,
  CheckCircle2,
  XCircle,
  History,
} from 'lucide-react'

const STATUS_MAP: Record<string, { label: string; color: string }> = {
  active: { label: '生效中', color: 'bg-green-100 text-green-700' },
  fixed: { label: '固定行为', color: 'bg-blue-100 text-blue-700' },
  partial: { label: '部分实现', color: 'bg-amber-100 text-amber-700' },
  planned: { label: '待配置化', color: 'bg-amber-100 text-amber-700' },
  unknown: { label: '未知', color: 'bg-gray-100 text-gray-500' },
}

const SEVERITY_MAP: Record<string, { icon: React.ReactNode; color: string }> = {
  hard: { icon: <ShieldAlert className="w-4 h-4" />, color: 'bg-red-50 text-red-700 border-red-200' },
  warning: { icon: <AlertTriangle className="w-4 h-4" />, color: 'bg-amber-50 text-amber-700 border-amber-200' },
  info: { icon: <Info className="w-4 h-4" />, color: 'bg-blue-50 text-blue-700 border-blue-200' },
}

const BATCH_STATUS_MAP: Record<string, { color: string; icon: React.ReactNode }> = {
  confirmed: { color: 'bg-green-100 text-green-700', icon: <CheckCircle2 className="w-3 h-3" /> },
  failed: { color: 'bg-red-100 text-red-700', icon: <XCircle className="w-3 h-3" /> },
  rolled_back: { color: 'bg-gray-100 text-gray-700', icon: <History className="w-3 h-3" /> },
  pending: { color: 'bg-blue-100 text-blue-700', icon: <Info className="w-3 h-3" /> },
  confirming: { color: 'bg-blue-100 text-blue-700', icon: <Info className="w-3 h-3" /> },
}

export function ImportRulesSettingsPanel() {
  const [data, setData] = useState<ImportRulesData | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    fetchImportRules()
      .then((r) => { if (!cancelled) setData(r) })
      .catch((e) => { if (!cancelled) setError(e instanceof Error ? e.message : '加载失败') })
      .finally(() => { if (!cancelled) setLoading(false) })
    return () => { cancelled = true }
  }, [])

  const reload = () => {
    setLoading(true)
    setError(null)
    fetchImportRules()
      .then(setData)
      .catch((e) => setError(e instanceof Error ? e.message : '加载失败'))
      .finally(() => setLoading(false))
  }

  if (loading) return <div className="bg-white rounded-lg border border-gray-200 p-6"><div className="flex items-center gap-2 text-gray-500"><RefreshCw className="w-4 h-4 animate-spin" /><span className="text-sm">加载中...</span></div></div>
  if (error) return <div className="bg-white rounded-lg border border-red-200 p-6"><div className="flex items-center gap-2 text-red-600 mb-2"><AlertTriangle className="w-4 h-4" /><span className="text-sm font-medium">加载失败</span></div><p className="text-sm text-red-500">{error}</p><button onClick={reload} className="mt-2 text-sm text-blue-600 hover:underline">重试</button></div>
  if (!data) return null

  const { summary, rules, safeguards, recentBatches } = data

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <FileUp className="w-5 h-5 text-teal-600" />
          <h2 className="text-lg font-bold text-gray-900">导入规则设置</h2>
          <Badge className="text-xs bg-teal-100 text-teal-700 border-teal-200">只读基础版</Badge>
        </div>
        <button onClick={reload} className="flex items-center gap-1 text-sm text-gray-500 hover:text-gray-700">
          <RefreshCw className="w-4 h-4" /> 刷新
        </button>
      </div>

      {/* Summary */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <SummaryCard label="ImportBatch 总数" value={String(summary.importBatchCount)} />
        <SummaryCard label="已确认" value={String(summary.confirmedImportCount)} ok={summary.confirmedImportCount > 0} />
        <SummaryCard label="失败" value={String(summary.failedImportCount)} danger={summary.failedImportCount > 0} />
        <SummaryCard label="已回滚" value={String(summary.rolledBackImportCount)} />
      </div>

      {/* Source evidence summary */}
      <div className="bg-white rounded-lg border border-gray-200 p-5">
        <h3 className="text-sm font-semibold text-gray-900 mb-3 flex items-center gap-2">
          <ShieldCheck className="w-4 h-4" /> Source Evidence 状态
        </h3>
        <div className="grid grid-cols-2 gap-3 text-sm">
          <div><span className="text-gray-500">link 有 importBatchId:</span> <code className="text-xs bg-gray-100 px-1">{summary.teachingTaskClassWithEvidenceCount}</code></div>
          <div><span className="text-gray-500">link 缺 importBatchId:</span> <code className="text-xs bg-gray-100 px-1">{summary.teachingTaskClassWithoutEvidenceCount}</code></div>
          <div><span className="text-gray-500">有 sourceKeyword:</span> <code className="text-xs bg-gray-100 px-1">{summary.tcsWithKeyword}</code></div>
          <div><span className="text-gray-500">有 sourceClassName:</span> <code className="text-xs bg-gray-100 px-1">{summary.tcsWithClassName}</code></div>
          <div><span className="text-gray-500">有 matchStrategy:</span> <code className="text-xs bg-gray-100 px-1">{summary.tcsWithStrategy}</code></div>
        </div>
      </div>

      {/* Rules */}
      <div className="bg-white rounded-lg border border-gray-200 p-5">
        <h3 className="text-sm font-semibold text-gray-900 mb-3">规则列表</h3>
        <div className="space-y-3">
          {rules.map((r) => {
            const st = STATUS_MAP[r.status] ?? STATUS_MAP.unknown
            return (
              <div key={r.key} className="p-3 rounded bg-gray-50 border border-gray-100">
                <div className="flex items-center gap-2 mb-1">
                  <Badge className={`text-xs ${st.color}`}>{st.label}</Badge>
                  <span className="text-sm font-medium text-gray-900">{r.label}</span>
                  <span className="text-xs text-gray-400 ml-auto flex items-center gap-1">
                    {typeof r.value === 'boolean' ? (r.value ? '✓' : '✗') : String(r.value)}
                    <Lock className="w-3 h-3" />
                  </span>
                </div>
                <p className="text-xs text-gray-600">{r.description}</p>
                <p className="text-xs text-gray-400 mt-1">来源: {r.source}</p>
              </div>
            )
          })}
        </div>
      </div>

      {/* Safeguards */}
      <div className="bg-white rounded-lg border border-gray-200 p-5">
        <h3 className="text-sm font-semibold text-gray-900 mb-3">数据质量 Guard</h3>
        <div className="space-y-2">
          {safeguards.map((g) => {
            const sev = SEVERITY_MAP[g.severity] ?? SEVERITY_MAP.info
            return (
              <div key={g.key} className={`flex items-start gap-2 p-2 rounded border ${sev.color}`}>
                {sev.icon}
                <div className="flex-1">
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-medium">{g.label}</span>
                    <Badge className={`text-xs ${g.enabled ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'}`}>
                      {g.enabled ? '启用' : '禁用'}
                    </Badge>
                  </div>
                  <p className="text-xs text-gray-600 mt-0.5">{g.description}</p>
                </div>
              </div>
            )
          })}
        </div>
      </div>

      {/* Recent batches */}
      <div className="bg-white rounded-lg border border-gray-200 p-5">
        <h3 className="text-sm font-semibold text-gray-900 mb-3">最近 ImportBatch</h3>
        {recentBatches.length === 0 ? (
          <div className="text-sm text-gray-500">暂无导入批次</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-200">
                  <th className="text-left py-2 pr-4 font-medium text-gray-500">ID</th>
                  <th className="text-left py-2 pr-4 font-medium text-gray-500">文件名</th>
                  <th className="text-left py-2 pr-4 font-medium text-gray-500">状态</th>
                  <th className="text-left py-2 pr-4 font-medium text-gray-500">semester</th>
                  <th className="text-left py-2 pr-4 font-medium text-gray-500">recordCount</th>
                  <th className="text-left py-2 pr-4 font-medium text-gray-500">warningCount</th>
                </tr>
              </thead>
              <tbody>
                {recentBatches.map((b) => {
                  const st = BATCH_STATUS_MAP[b.status ?? ''] ?? BATCH_STATUS_MAP.pending
                  return (
                    <tr key={b.id} className="border-b border-gray-100">
                      <td className="py-1.5 pr-4 font-mono text-xs text-gray-500">{b.id}</td>
                      <td className="py-1.5 pr-4 max-w-[200px] truncate" title={b.filename ?? ''}>{b.filename ?? '-'}</td>
                      <td className="py-1. pr-4">
                        <Badge className={`text-xs ${st.color} inline-flex items-center gap-1`}>
                          {st.icon}
                          {b.status}
                        </Badge>
                      </td>
                      <td className="py-1.5 pr-4 text-xs">{b.semesterId}</td>
                      <td className="py-1.5 pr-4 text-xs">{b.recordCount}</td>
                      <td className="py-1.5 pr-4 text-xs">{b.warningCount}</td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Read-only notice */}
      <div className="bg-gray-50 rounded-lg border border-gray-200 p-4 flex items-start gap-2">
        <Info className="w-4 h-4 text-gray-400 mt-0.5 shrink-0" />
        <div className="text-xs text-gray-500 space-y-1">
          <p>当前为只读基础版，不提供编辑功能。</p>
          <p>导入规则行为由代码固定，如需修改请在后续阶段设计配置化方案。</p>
        </div>
      </div>
    </div>
  )
}

function SummaryCard({ label, value, ok, danger }: { label: string; value: string; ok?: boolean; danger?: boolean }) {
  return (
    <div className={`bg-white rounded-lg border p-4 ${danger ? 'border-red-300 bg-red-50' : ok ? 'border-green-200' : 'border-gray-200'}`}>
      <div className="text-xs text-gray-500 mb-1">{label}</div>
      <div className={`text-2xl font-bold ${danger ? 'text-red-600' : 'text-gray-900'}`}>{value}</div>
    </div>
  )
}
