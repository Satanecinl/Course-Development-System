'use client'

import { useState, useEffect, useCallback } from 'react'
import { fetchCampusRoomRules, patchRoomLinxiao, type CampusRoomRulesData } from '@/lib/settings/campus-room-rules-client'
import { useSemesterStore } from '@/store/semesterStore'
import { Badge } from '@/components/ui/badge'
import {
  ShieldCheck,
  ShieldAlert,
  RefreshCw,
  Building2,
  AlertTriangle,
  CheckCircle2,
  Lock,
  Eye,
  Search,
  ToggleLeft,
  ToggleRight,
  Loader2,
  GraduationCap,
} from 'lucide-react'

type RoomFilter = 'all' | 'linxiao' | 'non-linxiao'

export function CampusRoomRulesSettingsPanel() {
  const [data, setData] = useState<CampusRoomRulesData | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [roomFilter, setRoomFilter] = useState<RoomFilter>('all')
  const [searchTerm, setSearchTerm] = useState('')
  const [togglingRoomId, setTogglingRoomId] = useState<number | null>(null)
  const [toast, setToast] = useState<{ type: 'success' | 'error'; message: string } | null>(null)

  // K37-C: subscribe to selected semester (read-only)
  const currentSemesterId = useSemesterStore((s) => s.currentSemesterId)
  const getCurrentSemesterId = useSemesterStore((s) => s.getCurrentSemesterId)

  const load = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const semesterId = getCurrentSemesterId() ?? currentSemesterId
      const result = await fetchCampusRoomRules({ semesterId })
      setData(result)
    } catch (e) {
      setError(e instanceof Error ? e.message : '加载失败')
    } finally {
      setLoading(false)
    }
  }, [getCurrentSemesterId, currentSemesterId])

  useEffect(() => {
    let cancelled = false
    const semesterId = getCurrentSemesterId() ?? currentSemesterId
    fetchCampusRoomRules({ semesterId })
      .then((result) => { if (!cancelled) setData(result) })
      .catch((e) => { if (!cancelled) setError(e instanceof Error ? e.message : '加载失败') })
      .finally(() => { if (!cancelled) setLoading(false) })
    return () => { cancelled = true }
  }, [getCurrentSemesterId, currentSemesterId])

  const handleToggle = useCallback(async (roomId: number, currentIsLinxiao: boolean) => {
    const newValue = !currentIsLinxiao
    const label = newValue ? '标记为林校' : '取消林校'
    const room = data?.rooms.find((r) => r.id === roomId)
    const roomName = room?.name ?? `Room ${roomId}`

    if (!confirm(`确认${label}？\n教室：${roomName}\n操作：isLinxiao → ${newValue}`)) return

    setTogglingRoomId(roomId)
    setToast(null)
    try {
      const result = await patchRoomLinxiao(roomId, newValue)
      if (result.warnings.length > 0) {
        setToast({ type: 'error', message: result.warnings.join('\n') })
      } else {
        setToast({ type: 'success', message: `${roomName} 已${label}` })
      }
      // Refresh full data with current semester scope
      const semesterId = getCurrentSemesterId() ?? currentSemesterId
      const refreshed = await fetchCampusRoomRules({ semesterId })
      setData(refreshed)
    } catch (e) {
      setToast({ type: 'error', message: e instanceof Error ? e.message : '操作失败' })
    } finally {
      setTogglingRoomId(null)
      setTimeout(() => setToast(null), 5000)
    }
  }, [data, getCurrentSemesterId, currentSemesterId])

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

  const { summary, rules, rooms, violations, editability, automotiveKeywords, automotiveClassification } = data

  const filteredRooms = rooms.filter((r) => {
    if (roomFilter === 'linxiao' && !r.isLinxiao) return false
    if (roomFilter === 'non-linxiao' && r.isLinxiao) return false
    if (searchTerm) {
      const term = searchTerm.toLowerCase()
      if (!r.name.toLowerCase().includes(term) && !String(r.id).includes(term)) return false
    }
    return true
  })

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
          <Building2 className="w-5 h-5 text-blue-600" />
          <h2 className="text-lg font-bold text-gray-900">校区 / 教室规则设置</h2>
          <Badge className="text-xs bg-green-100 text-green-700 border-green-200">基础可编辑版</Badge>
        </div>
        <button onClick={load} className="flex items-center gap-1 text-sm text-gray-500 hover:text-gray-700">
          <RefreshCw className="w-4 h-4" />
          刷新
        </button>
      </div>

      {/* Semester scope banner (K37-C) */}
      {data?.resolvedSemester && (
        <div className="bg-blue-50 rounded-lg border border-blue-200 p-3 flex items-center gap-2 text-xs text-blue-700">
          <GraduationCap className="w-4 h-4 shrink-0" />
          <span>
            当前诊断学期：
            <span className="font-semibold ml-1">
              {data.resolvedSemester.name}
              {data.resolvedSemester.isActive ? '（active）' : ''}
            </span>
            <span className="ml-2 text-blue-500">
              ({data.diagnosticsScope === 'selected-semester' ? 'selected' : 'active'}-semester, id={data.resolvedSemester.id})
            </span>
          </span>
        </div>
      )}

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

      {/* Mismatch warning */}
      {summary.linxiaoMismatchCount && summary.linxiaoMismatchCount > 0 && (
        <div className="bg-amber-50 rounded-lg border border-amber-200 p-3 flex items-center gap-2 text-sm text-amber-700">
          <AlertTriangle className="w-4 h-4 shrink-0" />
          有 {summary.linxiaoMismatchCount} 间教室的 isLinxiao 与名称推断不一致。请检查是否需要调整。
        </div>
      )}

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
            description={rules.nonAutomotiveForbidLinxiao.description}
          />
          <RuleRow
            name="汽车专业优先林校"
            severity="soft"
            enabled={rules.automotivePreferLinxiao.enabled}
            description={rules.automotivePreferLinxiao.description}
          />
        </div>
        <div className="mt-3 flex items-center gap-2 text-xs text-gray-500">
          <Lock className="w-3 h-3" />
          <span>HC6 hard rule 不可通过 UI 关闭。如需调整规则语义，需修改 solver/score 代码。</span>
        </div>

        <div className="mt-4 space-y-2 border-t border-gray-100 pt-3">
          <div className="text-xs text-gray-600">
            <span className="font-medium">林校识别方式：</span>
            <code className="ml-1 px-1 py-0.5 bg-green-50 text-green-700 rounded">{editability.detectionMethod}</code>
            {editability.legacyDetection && (
              <span className="ml-2 text-gray-400">旧方式：{editability.legacyDetection}</span>
            )}
          </div>
          <div className="text-xs text-gray-600">
            <span className="font-medium">汽车专业关键词：</span>
            {automotiveKeywords.map((kw) => (
              <Badge key={kw} className="ml-1 text-xs bg-green-50 text-green-700 border-green-200">{kw}</Badge>
            ))}
          </div>
          <div className="text-xs text-gray-600">
            <span className="font-medium">分类依据：</span>
            <span>{automotiveClassification.primarySignal}；辅助：{automotiveClassification.auxiliarySignal}</span>
          </div>
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
            {violations.filter(v => v.type === 'HC5_ROOM_UNAVAILABLE').length > 0 && (
              <div className="mb-2">
                <h4 className="text-xs font-medium text-amber-700 mb-1">HC5 — 教室不可用（{violations.filter(v => v.type === 'HC5_ROOM_UNAVAILABLE').length}）</h4>
                {violations.filter(v => v.type === 'HC5_ROOM_UNAVAILABLE').map((v, i) => (
                  <ViolationRow key={`hc5-${i}`} v={v} />
                ))}
              </div>
            )}
            {violations.filter(v => v.type === 'HC6_NON_AUTOMOTIVE_FORBID_LINXIAO').length > 0 && (
              <div>
                <h4 className="text-xs font-medium text-red-700 mb-1">HC6 — 非汽车专业在林校（{violations.filter(v => v.type === 'HC6_NON_AUTOMOTIVE_FORBID_LINXIAO').length}）</h4>
                {violations.filter(v => v.type === 'HC6_NON_AUTOMOTIVE_FORBID_LINXIAO').map((v, i) => (
                  <ViolationRow key={`hc6-${i}`} v={v} />
                ))}
              </div>
            )}
          </div>
        )}
      </div>

      {/* Room management table */}
      <div className="bg-white rounded-lg border border-gray-200 p-5">
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-sm font-semibold text-gray-900 flex items-center gap-2">
            <Building2 className="w-4 h-4" /> 教室管理（林校标记可编辑）
          </h3>
          <div className="flex items-center gap-2">
            <div className="relative">
              <Search className="w-3.5 h-3.5 absolute left-2 top-1/2 -translate-y-1/2 text-gray-400" />
              <input
                type="text"
                placeholder="搜索教室名称或 ID..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="pl-7 pr-3 py-1 text-xs border border-gray-200 rounded focus:outline-none focus:ring-1 focus:ring-blue-300 w-40"
              />
            </div>
            <select
              value={roomFilter}
              onChange={(e) => setRoomFilter(e.target.value as RoomFilter)}
              className="text-xs border border-gray-200 rounded px-2 py-1 focus:outline-none focus:ring-1 focus:ring-blue-300"
            >
              <option value="all">全部 ({rooms.length})</option>
              <option value="linxiao">林校 ({summary.linxiaoRooms})</option>
              <option value="non-linxiao">非林校 ({summary.nonLinxiaoRooms})</option>
            </select>
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-200">
                <th className="text-left py-2 pr-4 font-medium text-gray-500">ID</th>
                <th className="text-left py-2 pr-4 font-medium text-gray-500">名称</th>
                <th className="text-left py-2 pr-4 font-medium text-gray-500">容量</th>
                <th className="text-left py-2 pr-4 font-medium text-gray-500">类型</th>
                <th className="text-left py-2 pr-4 font-medium text-gray-500">是否林校</th>
                <th className="text-left py-2 pr-4 font-medium text-gray-500">识别来源</th>
                <th className="text-left py-2 pr-4 font-medium text-gray-500">操作</th>
              </tr>
            </thead>
            <tbody>
              {filteredRooms.map((r) => (
                <tr key={r.id} className={`border-b border-gray-100 ${r.linxiaoMismatch ? 'bg-amber-50' : ''}`}>
                  <td className="py-1.5 pr-4 font-mono text-xs text-gray-500">{r.id}</td>
                  <td className="py-1.5 pr-4">{r.name}</td>
                  <td className="py-1.5 pr-4">{r.capacity ?? '-'}</td>
                  <td className="py-1.5 pr-4 text-gray-600">{r.type ?? '-'}</td>
                  <td className="py-1.5 pr-4">
                    {r.isLinxiao ? (
                      <Badge className="text-xs bg-green-100 text-green-700 border-green-200">是</Badge>
                    ) : (
                      <span className="text-xs text-gray-400">否</span>
                    )}
                    {r.linxiaoMismatch && (
                      <span className="ml-1 text-xs text-amber-600" title={`名称${r.nameSuggestsLinxiao ? '建议' : '不建议'}林校`}>⚠</span>
                    )}
                  </td>
                  <td className="py-1.5 pr-4 text-xs text-gray-500">
                    {r.linxiaoSource || '-'}
                    {r.linxiaoMismatch && r.nameSuggestsLinxiao !== undefined && (
                      <span className="ml-1 text-xs text-amber-500">(name: {r.nameSuggestsLinxiao ? '是' : '否'})</span>
                    )}
                  </td>
                  <td className="py-1.5 pr-4">
                    <button
                      onClick={() => handleToggle(r.id, r.isLinxiao)}
                      disabled={togglingRoomId === r.id}
                      className={`flex items-center gap-1 text-xs px-2 py-1 rounded transition-colors ${
                        r.isLinxiao
                          ? 'bg-red-50 text-red-600 hover:bg-red-100 border border-red-200'
                          : 'bg-green-50 text-green-600 hover:bg-green-100 border border-green-200'
                      } disabled:opacity-50 disabled:cursor-not-allowed`}
                    >
                      {togglingRoomId === r.id ? (
                        <Loader2 className="w-3 h-3 animate-spin" />
                      ) : r.isLinxiao ? (
                        <ToggleRight className="w-3 h-3" />
                      ) : (
                        <ToggleLeft className="w-3 h-3" />
                      )}
                      {r.isLinxiao ? '取消林校' : '标记为林校'}
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {filteredRooms.length === 0 && (
          <div className="text-sm text-gray-400 text-center py-4">无匹配教室</div>
        )}
      </div>

      {/* Editability notice */}
      <div className="bg-green-50 rounded-lg border border-green-200 p-4 flex items-start gap-2">
        <CheckCircle2 className="w-4 h-4 text-green-500 mt-0.5 shrink-0" />
        <div className="text-xs text-green-700 space-y-1">
          <p className="font-medium">支持林校教室标记维护。HC6 hard rule 不可关闭。</p>
          <p>林校识别基于 <code className="px-1 py-0.5 bg-green-100 rounded">Room.isLinxiao</code> 持久字段（K37-B），是全局教室属性，不随学期变化。</p>
          <p>HC5 / HC6 违规明细按当前诊断学期统计（K37-C）。切换学期后，违规与 summary 自动刷新。</p>
          <p>修改林校标记不影响现有课表数据。如修改后产生 HC6 违规，系统会提醒但不阻断保存。</p>
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

function RuleRow({ name, severity, enabled, description }: { name: string; severity: string; enabled: boolean; description: string }) {
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
        <Lock className="w-3 h-3 ml-1" />
      </div>
    </div>
  )
}

const DAY_LABELS: Record<number, string> = { 1: '周一', 2: '周二', 3: '周三', 4: '周四', 5: '周五', 6: '周六', 7: '周日' }

function ViolationRow({ v }: { v: { type: string; slotId: number; courseName: string; roomName: string | null; reason: string; dayOfWeek?: number; slotIndex?: number; source?: string } }) {
  return (
    <div className={`flex items-start gap-2 text-sm p-2 rounded mb-1 ${
      v.type === 'HC6_NON_AUTOMOTIVE_FORBID_LINXIAO' ? 'bg-red-50 text-red-700' : 'bg-amber-50 text-amber-700'
    }`}>
      <AlertTriangle className="w-4 h-4 mt-0.5 shrink-0" />
      <div className="flex-1">
        <div className="flex items-center gap-2 flex-wrap">
          <span className="font-mono text-xs px-1 py-0.5 bg-white/50 rounded">{v.type}</span>
          {v.dayOfWeek != null && <span className="text-xs">{DAY_LABELS[v.dayOfWeek] ?? `D${v.dayOfWeek}`}</span>}
          {v.slotIndex != null && <span className="text-xs">第{v.slotIndex}节</span>}
          {v.source && <span className="text-xs opacity-70">({v.source})</span>}
        </div>
        <div className="mt-0.5">{v.reason}</div>
      </div>
    </div>
  )
}
