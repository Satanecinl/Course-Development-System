'use client'

import { useState, useEffect } from 'react'
import { fetchAdjustmentRules, type AdjustmentRulesData } from '@/lib/settings/adjustment-rules-client'
import { Badge } from '@/components/ui/badge'
import {
  RefreshCw,
  Calendar,
  ShieldCheck,
  ShieldAlert,
  AlertTriangle,
  Info,
  Lock,
  Settings,
  Clock,
} from 'lucide-react'

const STATUS_MAP: Record<string, { label: string; color: string }> = {
  active: { label: '生效中', color: 'bg-green-100 text-green-700' },
  fixed: { label: '固定行为', color: 'bg-blue-100 text-blue-700' },
  planned: { label: '待配置化', color: 'bg-amber-100 text-amber-700' },
  unknown: { label: '未知', color: 'bg-gray-100 text-gray-500' },
}

const SEVERITY_MAP: Record<string, { icon: React.ReactNode; color: string }> = {
  hard: { icon: <ShieldAlert className="w-4 h-4" />, color: 'bg-red-50 text-red-700 border-red-200' },
  warning: { icon: <AlertTriangle className="w-4 h-4" />, color: 'bg-amber-50 text-amber-700 border-amber-200' },
  info: { icon: <Info className="w-4 h-4" />, color: 'bg-blue-50 text-blue-700 border-blue-200' },
}

export function AdjustmentRulesSettingsPanel() {
  const [data, setData] = useState<AdjustmentRulesData | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    fetchAdjustmentRules()
      .then((r) => { if (!cancelled) setData(r) })
      .catch((e) => { if (!cancelled) setError(e instanceof Error ? e.message : '加载失败') })
      .finally(() => { if (!cancelled) setLoading(false) })
    return () => { cancelled = true }
  }, [])

  const reload = () => {
    setLoading(true)
    setError(null)
    fetchAdjustmentRules()
      .then(setData)
      .catch((e) => setError(e instanceof Error ? e.message : '加载失败'))
      .finally(() => setLoading(false))
  }

  if (loading) return <Card><Spinner text="加载中..." /></Card>
  if (error) return <Card><ErrorBox message={error} onRetry={reload} /></Card>
  if (!data) return null

  const { summary, rules, safeguards } = data

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Settings className="w-5 h-5 text-indigo-600" />
          <h2 className="text-lg font-bold text-gray-900">调课规则设置</h2>
          <Badge className="text-xs bg-indigo-100 text-indigo-700 border-indigo-200">只读基础版</Badge>
        </div>
        <button onClick={reload} className="flex items-center gap-1 text-sm text-gray-500 hover:text-gray-700">
          <RefreshCw className="w-4 h-4" /> 刷新
        </button>
      </div>

      {/* Summary cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <SummaryCard label="WorkTime 集成" value={summary.workTimeIntegrated ? '是' : '否'} ok={summary.workTimeIntegrated} />
        <SummaryCard label="推荐集成" value={summary.recommendationIntegrated ? '是' : '否'} ok={summary.recommendationIntegrated} />
        <SummaryCard label="Active 调课数" value={String(summary.activeAdjustments)} ok />
        <SummaryCard label="allowWeekend" value={summary.allowWeekend ? '是' : '否'} ok={!summary.allowWeekend} />
      </div>

      {/* WorkTime context */}
      <div className="bg-white rounded-lg border border-gray-200 p-5">
        <h3 className="text-sm font-semibold text-gray-900 mb-3 flex items-center gap-2">
          <Clock className="w-4 h-4" /> WorkTime 上下文
        </h3>
        <div className="grid grid-cols-2 gap-3 text-sm">
          <div><span className="text-gray-500">source:</span> <code className="text-xs bg-gray-100 px-1">{summary.workTimeSource}</code></div>
          <div><span className="text-gray-500">allowWeekend:</span> <code className="text-xs bg-gray-100 px-1">{String(summary.allowWeekend)}</code></div>
          <div><span className="text-gray-500">activeSlots:</span> <code className="text-xs bg-gray-100 px-1">[{summary.activeSlotIndexes.join(', ')}]</code></div>
          <div><span className="text-gray-500">legacySlots:</span> <code className="text-xs bg-gray-100 px-1">[{summary.legacySlotIndexes.join(', ')}]</code></div>
        </div>
      </div>

      {/* Rules */}
      <div className="bg-white rounded-lg border border-gray-200 p-5">
        <h3 className="text-sm font-semibold text-gray-900 mb-3 flex items-center gap-2">
          <Calendar className="w-4 h-4" /> 规则列表
        </h3>
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
        <h3 className="text-sm font-semibold text-gray-900 mb-3 flex items-center gap-2">
          <ShieldCheck className="w-4 h-4" /> 安全 Guard
        </h3>
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

      {/* Read-only notice */}
      <div className="bg-gray-50 rounded-lg border border-gray-200 p-4 flex items-start gap-2">
        <Info className="w-4 h-4 text-gray-400 mt-0.5 shrink-0" />
        <div className="text-xs text-gray-500 space-y-1">
          <p>当前为只读基础版，不提供编辑功能。</p>
          <p>调课规则行为由代码固定，如需修改请在后续阶段设计配置化方案。</p>
          <p>WorkTime 相关设置请在「节次与作息设置」中修改。</p>
        </div>
      </div>
    </div>
  )
}

// ── Helpers ──

function Card({ children }: { children: React.ReactNode }) {
  return <div className="bg-white rounded-lg border border-gray-200 p-6">{children}</div>
}

function Spinner({ text }: { text: string }) {
  return <div className="flex items-center gap-2 text-gray-500"><RefreshCw className="w-4 h-4 animate-spin" /><span className="text-sm">{text}</span></div>
}

function ErrorBox({ message, onRetry }: { message: string; onRetry: () => void }) {
  return (
    <div>
      <div className="flex items-center gap-2 text-red-600 mb-2"><AlertTriangle className="w-4 h-4" /><span className="text-sm font-medium">加载失败</span></div>
      <p className="text-sm text-red-500">{message}</p>
      <button onClick={onRetry} className="mt-2 text-sm text-blue-600 hover:underline">重试</button>
    </div>
  )
}

function SummaryCard({ label, value, ok }: { label: string; value: string; ok: boolean }) {
  return (
    <div className={`bg-white rounded-lg border p-4 ${ok ? 'border-gray-200' : 'border-amber-300 bg-amber-50'}`}>
      <div className="text-xs text-gray-500 mb-1">{label}</div>
      <div className={`text-lg font-bold ${ok ? 'text-gray-900' : 'text-amber-700'}`}>{value}</div>
    </div>
  )
}
