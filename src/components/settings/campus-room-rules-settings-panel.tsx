'use client'

import { useState, useEffect, useCallback } from 'react'
import { fetchCampusRoomRules, type CampusRoomRulesData } from '@/lib/settings/campus-room-rules-client'
import { Badge } from '@/components/ui/badge'
import {
  ShieldCheck,
  ShieldAlert,
  RefreshCw,
  Building2,
  AlertTriangle,
  CheckCircle2,
  Info,
  Lock,
  Eye,
} from 'lucide-react'

export function CampusRoomRulesSettingsPanel() {
  const [data, setData] = useState<CampusRoomRulesData | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    fetchCampusRoomRules()
      .then((result) => { if (!cancelled) setData(result) })
      .catch((e) => { if (!cancelled) setError(e instanceof Error ? e.message : '加载失败') })
      .finally(() => { if (!cancelled) setLoading(false) })
    return () => { cancelled = true }
  }, [])

  const load = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const result = await fetchCampusRoomRules()
      setData(result)
    } catch (e) {
      setError(e instanceof Error ? e.message : '加载失败')
    } finally {
      setLoading(false)
    }
  }, [])

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
        <p className="text-sm text-red-500">{error}</p>
        <button onClick={load} className="mt-2 text-sm text-blue-600 hover:underline">重试</button>
      </div>
    )
  }

  if (!data) return null

  const { summary, rules, rooms, violations } = data
  const linxiaoRooms = rooms.filter((r) => r.isLinxiao)

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Building2 className="w-5 h-5 text-blue-600" />
          <h2 className="text-lg font-bold text-gray-900">校区 / 教室规则设置</h2>
          <Badge className="text-xs bg-blue-100 text-blue-700 border-blue-200">只读基础版</Badge>
        </div>
        <button onClick={load} className="flex items-center gap-1 text-sm text-gray-500 hover:text-gray-700">
          <RefreshCw className="w-4 h-4" />
          刷新
        </button>
      </div>

      {/* Summary cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <SummaryCard label="总教室数" value={summary.totalRooms} icon={<Building2 className="w-4 h-4" />} />
        <SummaryCard label="林校教室" value={summary.linxiaoRooms} icon={<Building2 className="w-4 h-4 text-green-600" />} />
        <SummaryCard label="HC5 违规" value={summary.hc5ViolationCount}
          icon={summary.hc5ViolationCount > 0 ? <AlertTriangle className="w-4 h-4 text-red-600" /> : <CheckCircle2 className="w-4 h-4 text-green-600" />}
          danger={summary.hc5ViolationCount > 0} />
        <SummaryCard label="HC6 违规" value={summary.hc6ViolationCount}
          icon={summary.hc6ViolationCount > 0 ? <ShieldAlert className="w-4 h-4 text-red-600" /> : <ShieldCheck className="w-4 h-4 text-green-600" />}
          danger={summary.hc6ViolationCount > 0} />
      </div>

      {/* Rules */}
      <div className="bg-white rounded-lg border border-gray-200 p-5">
        <h3 className="text-sm font-semibold text-gray-900 mb-3 flex items-center gap-2">
          <ShieldCheck className="w-4 h-4" /> 规则说明
        </h3>
        <div className="space-y-3">
          <RuleRow
            name="非汽车专业禁止林校"
            severity="hard"
            enabled={rules.nonAutomotiveForbidLinxiao.enabled}
            editable={rules.nonAutomotiveForbidLinxiao.editable}
            description={rules.nonAutomotiveForbidLinxiao.description}
          />
          <RuleRow
            name="汽车专业优先林校"
            severity="soft"
            enabled={rules.automotivePreferLinxiao.enabled}
            editable={rules.automotivePreferLinxiao.editable}
            description={rules.automotivePreferLinxiao.description}
          />
        </div>
        <div className="mt-3 flex items-center gap-2 text-xs text-gray-500">
          <Lock className="w-3 h-3" />
          <span>Hard rule 不可通过 UI 关闭。林校识别规则由系统内部判定，不可编辑。</span>
        </div>
      </div>

      {/* Violations */}
      <div className="bg-white rounded-lg border border-gray-200 p-5">
        <h3 className="text-sm font-semibold text-gray-900 mb-3 flex items-center gap-2">
          <Eye className="w-4 h-4" /> 违规检查结果
        </h3>
        {violations.length === 0 ? (
          <div className="flex items-center gap-2 text-sm text-green-700 bg-green-50 rounded-lg p-3">
            <CheckCircle2 className="w-4 h-4" />
            当前无 HC5 / HC6 违规
          </div>
        ) : (
          <div className="space-y-2">
            {violations.map((v, i) => (
              <div key={i} className={`flex items-start gap-2 text-sm p-2 rounded ${
                v.type === 'HC6_NON_AUTOMOTIVE_FORBID_LINXIAO' ? 'bg-red-50 text-red-700' : 'bg-amber-50 text-amber-700'
              }`}>
                <AlertTriangle className="w-4 h-4 mt-0.5 shrink-0" />
                <div>
                  <span className="font-mono text-xs">{v.type}</span>
                  <span className="mx-1">·</span>
                  <span>{v.reason}</span>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Linxiao rooms table */}
      <div className="bg-white rounded-lg border border-gray-200 p-5">
        <h3 className="text-sm font-semibold text-gray-900 mb-3 flex items-center gap-2">
          <Building2 className="w-4 h-4" /> 林校教室 ({linxiaoRooms.length})
        </h3>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-200">
                <th className="text-left py-2 pr-4 font-medium text-gray-500">ID</th>
                <th className="text-left py-2 pr-4 font-medium text-gray-500">名称</th>
                <th className="text-left py-2 pr-4 font-medium text-gray-500">容量</th>
                <th className="text-left py-2 pr-4 font-medium text-gray-500">类型</th>
              </tr>
            </thead>
            <tbody>
              {linxiaoRooms.map((r) => (
                <tr key={r.id} className="border-b border-gray-100">
                  <td className="py-1.5 pr-4 font-mono text-xs text-gray-500">{r.id}</td>
                  <td className="py-1.5 pr-4">{r.name}</td>
                  <td className="py-1.5 pr-4">{r.capacity ?? '-'}</td>
                  <td className="py-1.5 pr-4 text-gray-600">{r.type ?? '-'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Read-only notice */}
      <div className="bg-gray-50 rounded-lg border border-gray-200 p-4 flex items-start gap-2">
        <Info className="w-4 h-4 text-gray-400 mt-0.5 shrink-0" />
        <div className="text-xs text-gray-500 space-y-1">
          <p>当前为只读基础版，不提供编辑功能。</p>
          <p>如需修改教室数据，请使用 admin DB 面板。</p>
          <p>HC6 hard rule 不可通过 UI 关闭。</p>
        </div>
      </div>
    </div>
  )
}

// ── Sub-components ──

function SummaryCard({ label, value, icon, danger }: { label: string; value: number; icon: React.ReactNode; danger?: boolean }) {
  return (
    <div className={`bg-white rounded-lg border p-4 ${danger ? 'border-red-300 bg-red-50' : 'border-gray-200'}`}>
      <div className="flex items-center gap-2 text-gray-500 text-xs mb-1">
        {icon}
        <span>{label}</span>
      </div>
      <div className={`text-2xl font-bold ${danger ? 'text-red-600' : 'text-gray-900'}`}>{value}</div>
    </div>
  )
}

function RuleRow({ name, severity, enabled, editable, description }: { name: string; severity: string; enabled: boolean; editable: boolean; description: string }) {
  return (
    <div className="flex items-start gap-3 p-2 rounded bg-gray-50">
      <div className="flex items-center gap-2 min-w-[200px]">
        <Badge className={`text-xs ${severity === 'hard' ? 'bg-red-100 text-red-700' : 'bg-blue-100 text-blue-700'}`}>
          {severity === 'hard' ? 'Hard' : 'Soft'}
        </Badge>
        <span className="text-sm font-medium">{name}</span>
      </div>
      <div className="text-sm text-gray-600 flex-1">{description}</div>
      <div className="flex items-center gap-1 text-xs text-gray-400">
        {enabled ? <CheckCircle2 className="w-3 h-3 text-green-500" /> : <AlertTriangle className="w-3 h-3 text-red-500" />}
        {enabled ? '启用' : '禁用'}
        {!editable && <Lock className="w-3 h-3 ml-1" />}
      </div>
    </div>
  )
}
