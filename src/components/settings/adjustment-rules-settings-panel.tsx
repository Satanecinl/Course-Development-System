'use client'

import { useState, useEffect, useCallback } from 'react'
import { fetchAdjustmentRules, patchAdjustmentRulesSettings, type AdjustmentRulesData, type AdjustmentRule } from '@/lib/settings/adjustment-rules-client'
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
  ListChecks,
  Wrench,
  Zap,
  CheckCircle2,
  Loader2,
  RotateCcw,
} from 'lucide-react'

const STATUS_MAP: Record<string, { label: string; color: string }> = {
  active: { label: '生效中', color: 'bg-green-100 text-green-700 border-green-200' },
  fixed: { label: '固定行为', color: 'bg-blue-100 text-blue-700 border-blue-200' },
  planned: { label: '待配置化', color: 'bg-amber-100 text-amber-700 border-amber-200' },
  unknown: { label: '未知', color: 'bg-gray-100 text-gray-500 border-gray-200' },
}

const SEVERITY_MAP: Record<string, { icon: React.ReactNode; color: string }> = {
  hard: { icon: <ShieldAlert className="w-4 h-4" />, color: 'bg-red-50 text-red-700 border-red-200' },
  warning: { icon: <AlertTriangle className="w-4 h-4" />, color: 'bg-amber-50 text-amber-700 border-amber-200' },
  info: { icon: <Info className="w-4 h-4" />, color: 'bg-blue-50 text-blue-700 border-blue-200' },
}

const GROUP_ICONS: Record<string, React.ReactNode> = {
  worktime: <Clock className="w-4 h-4" />,
  recommendation: <ListChecks className="w-4 h-4" />,
  'dry-run': <Wrench className="w-4 h-4" />,
  apply: <Zap className="w-4 h-4" />,
  'hard-guard': <ShieldCheck className="w-4 h-4" />,
  other: <Settings className="w-4 h-4" />,
}

export function AdjustmentRulesSettingsPanel() {
  const [data, setData] = useState<AdjustmentRulesData | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [toast, setToast] = useState<{ type: 'success' | 'error'; message: string } | null>(null)

  // Limit editing state
  const [editingLimit, setEditingLimit] = useState<string>('')
  const [limitSaving, setLimitSaving] = useState(false)
  const [limitError, setLimitError] = useState<string | null>(null)

  const reload = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const result = await fetchAdjustmentRules()
      setData(result)
      // Reset editing state to current value
      setEditingLimit(String(result.defaultRecommendationLimit?.current ?? 5))
    } catch (e) {
      setError(e instanceof Error ? e.message : '加载失败')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    let cancelled = false
    fetchAdjustmentRules()
      .then((r) => {
        if (!cancelled) {
          setData(r)
          setEditingLimit(String(r.defaultRecommendationLimit?.current ?? 5))
        }
      })
      .catch((e) => { if (!cancelled) setError(e instanceof Error ? e.message : '加载失败') })
      .finally(() => { if (!cancelled) setLoading(false) })
    return () => { cancelled = true }
  }, [])

  const handleSaveLimit = useCallback(async () => {
    const num = parseInt(editingLimit, 10)
    if (isNaN(num)) {
      setLimitError('请输入有效整数')
      return
    }
    if (num < 1 || num > 20) {
      setLimitError('范围 1-20')
      return
    }
    setLimitSaving(true)
    setLimitError(null)
    try {
      await patchAdjustmentRulesSettings({ defaultRecommendationLimit: num })
      setToast({ type: 'success', message: `默认推荐数量已更新为 ${num}` })
      // Reload full data
      const refreshed = await fetchAdjustmentRules()
      setData(refreshed)
      setEditingLimit(String(refreshed.defaultRecommendationLimit?.current ?? num))
    } catch (e) {
      setToast({ type: 'error', message: e instanceof Error ? e.message : '保存失败' })
      setLimitError(e instanceof Error ? e.message : '保存失败')
    } finally {
      setLimitSaving(false)
      setTimeout(() => setToast(null), 4000)
    }
  }, [editingLimit])

  if (loading) return <Card><Spinner text="加载中..." /></Card>
  if (error) return <Card><ErrorBox message={error} onRetry={reload} /></Card>
  if (!data) return null

  const { summary, rules, safeguards, groups, editability, defaultRecommendationLimit, workTimeContext } = data
  const confirmedLimit = defaultRecommendationLimit?.current ?? 5
  const isDirty = editingLimit !== String(confirmedLimit)

  // K38-A: rules is now Record<string, Rule[]>; fallback to flat array for back-compat
  const groupedRules: Record<string, AdjustmentRule[]> = Array.isArray(rules)
    ? rules.reduce<Record<string, AdjustmentRule[]>>((acc, r) => {
        const g = r.group || 'other'
        if (!acc[g]) acc[g] = []
        acc[g].push(r)
        return acc
      }, {})
    : rules

  const groupOrder = ['worktime', 'recommendation', 'dry-run', 'apply', 'hard-guard', 'other']

  return (
    <div className="space-y-6">
      {/* Toast */}
      {toast && (
        <div className={`fixed top-4 right-4 z-50 p-3 rounded-lg shadow-lg text-sm max-w-md ${
          toast.type === 'success' ? 'bg-green-600 text-white' : 'bg-red-600 text-white'
        }`}>
          {toast.message}
        </div>
      )}

      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Settings className="w-5 h-5 text-indigo-600" />
          <h2 className="text-lg font-bold text-gray-900">调课规则设置</h2>
          <Badge className="text-xs bg-green-100 text-green-700 border-green-200">基础可配置版</Badge>
        </div>
        <button onClick={reload} className="flex items-center gap-1 text-sm text-gray-500 hover:text-gray-700">
          <RefreshCw className="w-4 h-4" /> 刷新
        </button>
      </div>

      {/* Summary cards (K38-A: expanded) */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <SummaryCard label="WorkTime 集成" value={summary.workTimeIntegrated ? '是' : '否'} ok={summary.workTimeIntegrated} />
        <SummaryCard label="推荐集成" value={summary.recommendationIntegrated ? '是' : '否'} ok={summary.recommendationIntegrated} />
        <SummaryCard label="Active 调课数" value={String(summary.activeAdjustments)} ok />
        <SummaryCard label="allowWeekend" value={summary.allowWeekend ? '是' : '否'} ok={!summary.allowWeekend} />
        <SummaryCard label="dry-run guard" value="启用" ok />
        <SummaryCard label="apply guard" value="启用" ok />
        <SummaryCard
          label="默认推荐数量"
          value={`${confirmedLimit}（max ${defaultRecommendationLimit?.max ?? 20}）`}
          ok
        />
        <SummaryCard label="Active slots" value={String(summary.activeSlotIndexes.length)} ok />
      </div>

      {/* WorkTime context */}
      {workTimeContext && (
        <div className="bg-white rounded-lg border border-gray-200 p-5">
          <h3 className="text-sm font-semibold text-gray-900 mb-3 flex items-center gap-2">
            <Clock className="w-4 h-4" /> WorkTime 上下文
          </h3>
          <div className="grid grid-cols-2 gap-3 text-sm mb-3">
            <div><span className="text-gray-500">source:</span> <code className="text-xs bg-gray-100 px-1">{workTimeContext.source}</code></div>
            <div><span className="text-gray-500">config:</span> <code className="text-xs bg-gray-100 px-1">{workTimeContext.configName ?? '-'}</code></div>
            <div><span className="text-gray-500">allowWeekend:</span> <code className="text-xs bg-gray-100 px-1">{String(workTimeContext.allowWeekend)}</code></div>
            <div><span className="text-gray-500">activeSlots:</span> <code className="text-xs bg-gray-100 px-1">[{workTimeContext.activeSlotIndexes.join(', ')}]</code></div>
            <div><span className="text-gray-500">legacySlots:</span> <code className="text-xs bg-gray-100 px-1">[{workTimeContext.legacySlotIndexes.join(', ')}]</code></div>
            <div><span className="text-gray-500">Active slots:</span> <code className="text-xs bg-gray-100 px-1">{workTimeContext.activeSlotIndexes.length}</code></div>
          </div>
          <div className="bg-blue-50 border border-blue-200 rounded p-2 text-xs text-blue-700">
            <Info className="w-3 h-3 inline mr-1" />
            {workTimeContext.weekendBehavior}
          </div>
        </div>
      )}

      {/* Default recommendation limit — EDITABLE (K38-B1) */}
      {defaultRecommendationLimit && (
        <div className="bg-white rounded-lg border border-gray-200 p-5">
          <h3 className="text-sm font-semibold text-gray-900 mb-3 flex items-center gap-2">
            <ListChecks className="w-4 h-4" /> 默认推荐方案数量
          </h3>

          {/* Main row: input + range + source */}
          <div className="flex items-center gap-4 text-sm flex-wrap">
            <div className="flex items-center gap-2">
              <label className="text-gray-500 whitespace-nowrap">当前值：</label>
              <input
                type="number"
                min={defaultRecommendationLimit.min}
                max={defaultRecommendationLimit.max}
                value={editingLimit}
                onChange={(e) => {
                  setEditingLimit(e.target.value)
                  setLimitError(null)
                }}
                className="w-20 border border-gray-300 rounded px-2 py-1 text-sm text-center font-mono focus:outline-none focus:ring-1 focus:ring-indigo-300 disabled:opacity-50"
                disabled={limitSaving}
              />
            </div>
            <div className="flex items-center gap-1 text-xs text-gray-400">
              <span>范围：</span>
              <span className="font-mono">{defaultRecommendationLimit.min}-{defaultRecommendationLimit.max}</span>
            </div>
            <div className="flex items-center gap-1 text-xs text-gray-400">
              <span>来源：</span>
              <code className="bg-gray-100 px-1 rounded">{defaultRecommendationLimit.source}</code>
            </div>

            {/* Action buttons */}
            <div className="flex items-center gap-2 ml-auto">
              <button
                onClick={() => {
                  setEditingLimit(String(confirmedLimit))
                  setLimitError(null)
                }}
                disabled={!isDirty || limitSaving}
                className="flex items-center gap-1 text-xs px-2 py-1 rounded border border-gray-200 text-gray-600 hover:bg-gray-50 disabled:opacity-40 disabled:cursor-not-allowed"
              >
                <RotateCcw className="w-3 h-3" />
                取消
              </button>
              <button
                onClick={handleSaveLimit}
                disabled={!isDirty || limitSaving}
                className="flex items-center gap-1 text-xs px-3 py-1 rounded bg-indigo-600 text-white hover:bg-indigo-700 disabled:opacity-40 disabled:cursor-not-allowed"
              >
                {limitSaving ? <Loader2 className="w-3 h-3 animate-spin" /> : null}
                {limitSaving ? '保存中...' : '保存'}
              </button>
            </div>
          </div>

          {/* Validation error */}
          {limitError && (
            <div className="mt-2 text-xs text-red-600 flex items-center gap-1">
              <AlertTriangle className="w-3 h-3" />
              {limitError}
            </div>
          )}

          {/* Dirty indicator */}
          {isDirty && !limitError && (
            <div className="mt-2 text-xs text-amber-600">
              已修改（当前已确认值：{confirmedLimit}）
            </div>
          )}

          {/* Source note */}
          <p className="text-xs text-gray-500 mt-2">
            {defaultRecommendationLimit.note}
          </p>
        </div>
      )}

      {/* Rules grouped */}
      {groups && Object.keys(groups).length > 0 ? (
        groupOrder.filter((g) => groupedRules[g]?.length).map((gKey) => {
          const grp = groups[gKey]
          const rs = groupedRules[gKey] || []
          if (rs.length === 0) return null
          return (
            <div key={gKey} className="bg-white rounded-lg border border-gray-200 p-5">
              <h3 className="text-sm font-semibold text-gray-900 mb-3 flex items-center gap-2">
                {GROUP_ICONS[gKey] ?? <Settings className="w-4 h-4" />}
                {grp.label}
                <span className="text-xs text-gray-500 font-normal">({rs.length})</span>
              </h3>
              <p className="text-xs text-gray-500 mb-3">{grp.description}</p>
              <div className="space-y-3">
                {rs.map((r) => <RuleCard key={r.key} rule={r} />)}
              </div>
            </div>
          )
        })
      ) : (
        <div className="bg-white rounded-lg border border-gray-200 p-5">
          <h3 className="text-sm font-semibold text-gray-900 mb-3 flex items-center gap-2">
            <Calendar className="w-4 h-4" /> 规则列表
          </h3>
          <div className="space-y-3">
            {(Array.isArray(rules) ? rules : []).map((r) => <RuleCard key={r.key} rule={r} />)}
          </div>
        </div>
      )}

      {/* Safeguards (hard guards) */}
      <div className="bg-white rounded-lg border border-gray-200 p-5">
        <h3 className="text-sm font-semibold text-gray-900 mb-3 flex items-center gap-2">
          <ShieldCheck className="w-4 h-4" /> 安全 Guard（不可关闭）
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
                    <Lock className="w-3 h-3 text-gray-400" />
                  </div>
                  <p className="text-xs text-gray-600 mt-0.5">{g.description}</p>
                </div>
              </div>
            )
          })}
        </div>
      </div>

      {/* Editability notice */}
      {editability && (
        <div className="bg-green-50 rounded-lg border border-green-200 p-4 flex items-start gap-2">
          <CheckCircle2 className="w-4 h-4 text-green-500 mt-0.5 shrink-0" />
          <div className="text-xs text-green-700 space-y-1">
            <p className="font-medium">基础可配置版。defaultRecommendationLimit 可在本页编辑保存。</p>
            <p>{editability.note}</p>
            <ul className="list-disc pl-4 mt-1 space-y-0.5">
              <li>defaultRecommendationLimit：✅ 可编辑（范围 1-20）</li>
              <li>allowWeekend：由 WorkTime 配置控制，请到「节次与作息设置」修改</li>
              <li>dry-run guard：🔒 hard-locked</li>
              <li>apply guard：🔒 hard-locked</li>
            </ul>
          </div>
        </div>
      )}
    </div>
  )
}

function RuleCard({ rule }: { rule: AdjustmentRule }) {
  const st = STATUS_MAP[rule.status] ?? STATUS_MAP.unknown
  return (
    <div className="p-3 rounded bg-gray-50 border border-gray-100">
      <div className="flex items-center gap-2 mb-1">
        <Badge className={`text-xs ${st.color}`}>{st.label}</Badge>
        <span className="text-sm font-medium text-gray-900">{rule.label}</span>
        <span className="text-xs text-gray-400 ml-auto flex items-center gap-1">
          {typeof rule.value === 'boolean' ? (rule.value ? '✓' : '✗') : String(rule.value)}
          {!rule.editable && <Lock className="w-3 h-3" />}
        </span>
      </div>
      <p className="text-xs text-gray-600">{rule.description}</p>
      <p className="text-xs text-gray-400 mt-1">来源: {rule.source}</p>
    </div>
  )
}

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
