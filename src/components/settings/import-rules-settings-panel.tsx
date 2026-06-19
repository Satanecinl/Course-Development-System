'use client'

import { useState, useEffect, useCallback } from 'react'
import { fetchImportRules, patchImportRulesSettings, type ImportRulesData } from '@/lib/settings/import-rules-client'
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
  Calendar,
  FileSearch,
  RotateCcw,
  Settings,
  Layers,
  Clock,
} from 'lucide-react'

const STATUS_MAP: Record<string, { label: string; color: string }> = {
  active: { label: '生效中', color: 'bg-green-100 text-green-700' },
  fixed: { label: '固定行为', color: 'bg-blue-100 text-blue-700' },
  partial: { label: '部分实现', color: 'bg-amber-100 text-amber-700' },
  planned: { label: '待配置化', color: 'bg-amber-100 text-amber-700' },
  'hard-locked': { label: 'Hard Locked', color: 'bg-red-100 text-red-700' },
  'historical-gap': { label: '历史缺口', color: 'bg-orange-100 text-orange-700' },
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
  abandoned: { color: 'bg-orange-100 text-orange-700', icon: <XCircle className="w-3 h-3" /> },
}

const GROUP_ICONS: Record<string, React.ReactNode> = {
  semester: <Calendar className="w-4 h-4" />,
  'cross-cohort': <ShieldAlert className="w-4 h-4" />,
  'source-evidence': <FileSearch className="w-4 h-4" />,
  lifecycle: <RefreshCw className="w-4 h-4" />,
  rollback: <RotateCcw className="w-4 h-4" />,
  'data-safety': <ShieldCheck className="w-4 h-4" />,
}

export function ImportRulesSettingsPanel() {
  const [data, setData] = useState<ImportRulesData | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  // K39-B1: config toggle state
  const [configDirty, setConfigDirty] = useState(false)
  const [configSaving, setConfigSaving] = useState(false)
  const [toast, setToast] = useState<{ type: 'success' | 'error'; message: string } | null>(null)

  useEffect(() => {
    let cancelled = false
    fetchImportRules()
      .then((r) => { if (!cancelled) setData(r) })
      .catch((e) => { if (!cancelled) setError(e instanceof Error ? e.message : '加载失败') })
      .finally(() => { if (!cancelled) setLoading(false) })
    return () => { cancelled = true }
  }, [])

  const reload = useCallback(() => {
    setLoading(true)
    setError(null)
    fetchImportRules()
      .then(setData)
      .catch((e) => setError(e instanceof Error ? e.message : '加载失败'))
      .finally(() => setLoading(false))
  }, [])

  // K39-B1: save config
  const handleSaveConfig = useCallback(async () => {
    if (!data) return
    setConfigSaving(true)
    try {
      const result = await patchImportRulesSettings({
        requireExplicitSemesterForImport: data.config.requireExplicitSemesterForImport.current,
      })
      setData((prev) => prev ? { ...prev, config: result.config } : prev)
      setConfigDirty(false)
      setToast({ type: 'success', message: '配置已保存' })
      setTimeout(() => setToast(null), 4000)
    } catch (e) {
      setToast({ type: 'error', message: e instanceof Error ? e.message : '保存失败' })
      setTimeout(() => setToast(null), 4000)
    } finally {
      setConfigSaving(false)
    }
  }, [data])

  if (loading) return <div className="bg-white rounded-lg border border-gray-200 p-6"><div className="flex items-center gap-2 text-gray-500"><RefreshCw className="w-4 h-4 animate-spin" /><span className="text-sm">加载中...</span></div></div>
  if (error) return <div className="bg-white rounded-lg border border-red-200 p-6"><div className="flex items-center gap-2 text-red-600 mb-2"><AlertTriangle className="w-4 h-4" /><span className="text-sm font-medium">加载失败</span></div><p className="text-sm text-red-500">{error}</p><button onClick={reload} className="mt-2 text-sm text-blue-600 hover:underline">重试</button></div>
  if (!data) return null

  const { summary, recentBatches, sourceEvidence, crossCohortGuard, importLifecycleRules, ruleGroups, enhancedSummary } = data

  return (
    <div className="space-y-6">
      {/* Toast */}
      {toast && (
        <div className={`fixed top-4 right-4 z-50 px-4 py-2 rounded-lg shadow-lg text-sm font-medium ${toast.type === 'success' ? 'bg-green-600 text-white' : 'bg-red-600 text-white'}`}>
          {toast.message}
        </div>
      )}

      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <FileUp className="w-5 h-5 text-teal-600" />
          <h2 className="text-lg font-bold text-gray-900">导入规则设置</h2>
          <Badge className="text-xs bg-teal-100 text-teal-700 border-teal-200">基础可配置版</Badge>
        </div>
        <button onClick={reload} className="flex items-center gap-1 text-sm text-gray-500 hover:text-gray-700">
          <RefreshCw className="w-4 h-4" /> 刷新
        </button>
      </div>

      {/* ── Summary Cards ── */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <SummaryCard label="ImportBatch 总数" value={String(summary.importBatchCount)} />
        <SummaryCard label="已确认" value={String(summary.confirmedImportCount)} ok={summary.confirmedImportCount > 0} />
        <SummaryCard label="待确认" value={String(enhancedSummary.pendingCount)} ok={false} />
        <SummaryCard label="失败" value={String(summary.failedImportCount)} danger={summary.failedImportCount > 0} />
        <SummaryCard label="已回滚" value={String(summary.rolledBackImportCount)} />
        <SummaryCard label="已废弃" value={String(enhancedSummary.abandonedCount)} />
        <SummaryCard label="Evidence 覆盖率" value={`${sourceEvidence.evidenceCoveragePercent}%`} ok={sourceEvidence.evidenceCoveragePercent >= 80} danger={sourceEvidence.evidenceCoveragePercent < 50} />
        <SummaryCard
          label="默认导入学期"
          value={enhancedSummary.activeSemester ? enhancedSummary.activeSemester.name : '无'}
          ok={!!enhancedSummary.activeSemester}
        />
      </div>

      {/* ── K39-B1: Config Toggle ── */}
      <div className="bg-white rounded-lg border border-gray-200 p-5">
        <h3 className="text-sm font-semibold text-gray-900 mb-3 flex items-center gap-2">
          <Settings className="w-4 h-4" /> 导入学期确认要求
        </h3>
        <div className="flex items-center justify-between">
          <div>
            <div className="text-sm text-gray-700">上传前必须确认目标学期</div>
            <div className="text-xs text-gray-500 mt-0.5">
              {data.config.requireExplicitSemesterForImport.current
                ? '开启：上传对话框将显示目标学期并要求确认'
                : '关闭：保持当前 active semester fallback 行为'}
            </div>
          </div>
          <div className="flex items-center gap-3">
            <label className="relative inline-flex items-center cursor-pointer">
              <input
                type="checkbox"
                className="sr-only peer"
                checked={data.config.requireExplicitSemesterForImport.current}
                onChange={(e) => {
                  setData((prev) => prev ? {
                    ...prev,
                    config: {
                      ...prev.config,
                      requireExplicitSemesterForImport: {
                        ...prev.config.requireExplicitSemesterForImport,
                        current: e.target.checked,
                      },
                    },
                  } : prev)
                  setConfigDirty(true)
                }}
              />
              <div className="w-9 h-5 bg-gray-200 peer-focus:ring-2 peer-focus:ring-teal-300 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-teal-600"></div>
            </label>
            {configDirty && (
              <div className="flex items-center gap-2">
                <button
                  onClick={() => {
                    setData((prev) => prev ? {
                      ...prev,
                      config: {
                        ...prev.config,
                        requireExplicitSemesterForImport: {
                          ...prev.config.requireExplicitSemesterForImport,
                          current: !prev.config.requireExplicitSemesterForImport.current,
                        },
                      },
                    } : prev)
                    setConfigDirty(false)
                  }}
                  className="text-xs text-gray-500 hover:text-gray-700"
                >
                  取消
                </button>
                <button
                  onClick={() => void handleSaveConfig()}
                  disabled={configSaving}
                  className="text-xs bg-teal-600 text-white px-3 py-1 rounded hover:bg-teal-700 disabled:opacity-50"
                >
                  {configSaving ? '保存中...' : '保存'}
                </button>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* ── Source Evidence Coverage ── */}
      <div className="bg-white rounded-lg border border-gray-200 p-5">
        <h3 className="text-sm font-semibold text-gray-900 mb-3 flex items-center gap-2">
          <FileSearch className="w-4 h-4" /> Source Evidence 覆盖状态
        </h3>
        {/* Coverage progress bar */}
        <div className="mb-4">
          <div className="flex items-center justify-between text-xs text-gray-500 mb-1">
            <span>importBatchId 覆盖率</span>
            <span className="font-mono">{sourceEvidence.withImportBatchId}/{sourceEvidence.totalTeachingTaskClassLinks} ({sourceEvidence.evidenceCoveragePercent}%)</span>
          </div>
          <div className="w-full h-2 bg-gray-100 rounded-full overflow-hidden">
            <div
              className={`h-full rounded-full transition-all ${sourceEvidence.evidenceCoveragePercent >= 80 ? 'bg-green-500' : sourceEvidence.evidenceCoveragePercent >= 50 ? 'bg-amber-500' : 'bg-red-500'}`}
              style={{ width: `${sourceEvidence.evidenceCoveragePercent}%` }}
            />
          </div>
        </div>
        {/* Detailed field counts */}
        <div className="grid grid-cols-2 gap-3 text-sm">
          <EvidenceRow label="有 importBatchId" value={sourceEvidence.withImportBatchId} total={sourceEvidence.totalTeachingTaskClassLinks} />
          <EvidenceRow label="缺 importBatchId" value={sourceEvidence.missingImportBatchId} total={sourceEvidence.totalTeachingTaskClassLinks} danger={sourceEvidence.missingImportBatchId > 0} />
          <EvidenceRow label="有 sourceRowIndex" value={sourceEvidence.withSourceRowIndex} total={sourceEvidence.totalTeachingTaskClassLinks} />
          <EvidenceRow label="有 sourceKeyword" value={sourceEvidence.withSourceKeyword} total={sourceEvidence.totalTeachingTaskClassLinks} />
          <EvidenceRow label="有 sourceClassName" value={sourceEvidence.withSourceClassName} total={sourceEvidence.totalTeachingTaskClassLinks} />
          <EvidenceRow label="有 sourceRemark" value={sourceEvidence.withSourceRemark} total={sourceEvidence.totalTeachingTaskClassLinks} />
          <EvidenceRow label="有 sourceArtifactFilename" value={sourceEvidence.withSourceArtifactFilename} total={sourceEvidence.totalTeachingTaskClassLinks} />
          <EvidenceRow label="有 matchStrategy" value={sourceEvidence.withMatchStrategy} total={sourceEvidence.totalTeachingTaskClassLinks} />
        </div>
        {/* Explanation */}
        <div className="mt-3 p-3 bg-amber-50 border border-amber-200 rounded text-xs text-amber-800">
          <div className="flex items-start gap-2">
            <AlertTriangle className="w-3.5 h-3.5 mt-0.5 shrink-0" />
            <div>
              <p className="font-medium mb-0.5">前向填充策略说明</p>
              <p>仅新导入的 link 写入 evidence。{sourceEvidence.missingImportBatchId} 条历史 link 缺失 evidence，属于 K20 之前导入数据。不自动回填历史数据。</p>
              <p className="mt-1 text-amber-600">historicalBackfillAvailable: false | forwardOnly: true</p>
            </div>
          </div>
        </div>
      </div>

      {/* ── Cross-cohort Guard ── */}
      <div className="bg-white rounded-lg border border-gray-200 p-5">
        <h3 className="text-sm font-semibold text-gray-900 mb-3 flex items-center gap-2">
          <ShieldAlert className="w-4 h-4" /> 跨年级合班 Guard
        </h3>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="space-y-2">
            <GuardRow label="检测启用" value={crossCohortGuard.detectionEnabled} locked />
            <GuardRow label="审批必需" value={crossCohortGuard.approvalRequired} locked />
            <GuardRow label="Hard Locked" value={crossCohortGuard.hardLocked} locked />
          </div>
          <div className="space-y-2">
            <div className="text-sm">
              <span className="text-gray-500">Dry-run warning code:</span>{' '}
              <code className="text-xs bg-amber-100 text-amber-800 px-1.5 py-0.5 rounded">{crossCohortGuard.dryRunWarningCode}</code>
            </div>
            <div className="text-sm">
              <span className="text-gray-500">Confirm error code:</span>{' '}
              <code className="text-xs bg-red-100 text-red-800 px-1.5 py-0.5 rounded">{crossCohortGuard.confirmErrorCode}</code>
            </div>
            <div className="text-sm">
              <span className="text-gray-500">Approval field:</span>{' '}
              <code className="text-xs bg-gray-100 px-1.5 py-0.5 rounded">{crossCohortGuard.approvalField}</code>
            </div>
          </div>
        </div>
        <div className="mt-3 p-3 bg-red-50 border border-red-200 rounded text-xs text-red-800 flex items-start gap-2">
          <Lock className="w-3.5 h-3.5 mt-0.5 shrink-0" />
          <span>跨年级合班检测和审批为 hard-locked，不可通过配置关闭。绕过审批将导致 confirm 返回 409 错误。</span>
        </div>
      </div>

      {/* ── Import Lifecycle Rules ── */}
      <div className="bg-white rounded-lg border border-gray-200 p-5">
        <h3 className="text-sm font-semibold text-gray-900 mb-3 flex items-center gap-2">
          <RefreshCw className="w-4 h-4" /> 批次生命周期规则
        </h3>
        <div className="space-y-2">
          {importLifecycleRules.map((phase) => (
            <div key={phase.phase} className="p-3 rounded bg-gray-50 border border-gray-100">
              <div className="flex items-center gap-2 mb-1">
                <Badge className={`text-xs ${phase.writesDb ? 'bg-amber-100 text-amber-700' : 'bg-green-100 text-green-700'}`}>
                  {phase.writesDb ? '写 DB' : '不写 DB'}
                </Badge>
                <span className="text-sm font-medium text-gray-900">{phase.label}</span>
                <span className="text-xs text-gray-400 ml-auto">{phase.permission}</span>
              </div>
              <p className="text-xs text-gray-600">{phase.safetyGuard}</p>
            </div>
          ))}
        </div>
      </div>

      {/* ── Grouped Rules ── */}
      <div className="bg-white rounded-lg border border-gray-200 p-5">
        <h3 className="text-sm font-semibold text-gray-900 mb-3 flex items-center gap-2">
          <Layers className="w-4 h-4" /> 规则列表（分组）
        </h3>
        <div className="space-y-4">
          {ruleGroups.map((group) => {
            const groupIcon = GROUP_ICONS[group.groupKey] ?? <Settings className="w-4 h-4" />
            return (
              <div key={group.groupKey}>
                <div className="flex items-center gap-2 mb-2">
                  {groupIcon}
                  <span className="text-sm font-semibold text-gray-800">{group.groupLabel}</span>
                  <Badge className="text-xs bg-gray-100 text-gray-500">{group.rules.length} 条</Badge>
                </div>
                <div className="space-y-2 ml-6">
                  {group.rules.map((rule) => {
                    const st = STATUS_MAP[rule.status] ?? STATUS_MAP.unknown
                    return (
                      <div key={rule.id} className="p-3 rounded bg-gray-50 border border-gray-100">
                        <div className="flex items-center gap-2 mb-1">
                          <Badge className={`text-xs ${st.color}`}>{st.label}</Badge>
                          <span className="text-sm font-medium text-gray-900">{rule.title}</span>
                          {rule.locked && <Lock className="w-3 h-3 text-gray-400" />}
                          <span className="text-xs text-gray-400 ml-auto">{rule.impact}</span>
                        </div>
                        <p className="text-xs text-gray-600">{rule.description}</p>
                        <div className="flex items-center gap-3 mt-1 text-xs text-gray-400">
                          <span>来源: {rule.source}</span>
                          {rule.nextStage && <span className="text-amber-600">→ {rule.nextStage} 可配置化</span>}
                        </div>
                      </div>
                    )
                  })}
                </div>
              </div>
            )
          })}
        </div>
      </div>

      {/* ── Safeguards ── */}
      <div className="bg-white rounded-lg border border-gray-200 p-5">
        <h3 className="text-sm font-semibold text-gray-900 mb-3">数据质量 Guard</h3>
        <div className="space-y-2">
          {data.safeguards.map((g) => {
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

      {/* ── Recent Batches ── */}
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

      {/* ── Editability Notice ── */}
      <div className="bg-gray-50 rounded-lg border border-gray-200 p-4 space-y-2">
        <h4 className="text-xs font-semibold text-gray-700 flex items-center gap-1">
          <Info className="w-3.5 h-3.5" /> 编辑边界说明
        </h4>
        <div className="text-xs text-gray-500 space-y-1">
          <div className="flex items-start gap-2">
            <CheckCircle2 className="w-3 h-3 mt-0.5 shrink-0 text-teal-500" />
            <span>当前为<strong>基础可配置版</strong>。&ldquo;导入学期确认要求&rdquo;已可配置。</span>
          </div>
          <div className="flex items-start gap-2">
            <Lock className="w-3 h-3 mt-0.5 shrink-0 text-gray-400" />
            <span>不开放关闭 cross-cohort guard。</span>
          </div>
          <div className="flex items-start gap-2">
            <Lock className="w-3 h-3 mt-0.5 shrink-0 text-gray-400" />
            <span>不开放 source evidence 历史自动回填。</span>
          </div>
          <div className="flex items-start gap-2">
            <Clock className="w-3 h-3 mt-0.5 shrink-0 text-blue-500" />
            <span><strong>K39-C</strong> 可考虑 source evidence backfill plan（历史数据证据回填方案）。</span>
          </div>
          <div className="flex items-start gap-2">
            <Clock className="w-3 h-3 mt-0.5 shrink-0 text-blue-500" />
            <span><strong>K39-D</strong> 可考虑 duplicate import policy config（重复导入策略配置）。</span>
          </div>
        </div>
      </div>
    </div>
  )
}

/* ── Sub-components ── */

function SummaryCard({ label, value, ok, danger }: { label: string; value: string; ok?: boolean; danger?: boolean }) {
  return (
    <div className={`bg-white rounded-lg border p-4 ${danger ? 'border-red-300 bg-red-50' : ok ? 'border-green-200' : 'border-gray-200'}`}>
      <div className="text-xs text-gray-500 mb-1">{label}</div>
      <div className={`text-lg font-bold ${danger ? 'text-red-600' : 'text-gray-900'}`}>{value}</div>
    </div>
  )
}

function EvidenceRow({ label, value, total, danger }: { label: string; value: number; total: number; danger?: boolean }) {
  return (
    <div className={`flex items-center justify-between ${danger ? 'text-red-700' : 'text-gray-700'}`}>
      <span className="text-gray-500">{label}:</span>
      <span>
        <code className={`text-xs px-1 ${danger ? 'bg-red-100' : 'bg-gray-100'}`}>{value}</code>
        <span className="text-gray-400 text-xs">/{total}</span>
      </span>
    </div>
  )
}

function GuardRow({ label, value, locked }: { label: string; value: boolean; locked?: boolean }) {
  return (
    <div className="flex items-center gap-2 text-sm">
      <span className={`w-4 h-4 rounded-full flex items-center justify-center ${value ? 'bg-green-100' : 'bg-red-100'}`}>
        {value ? <CheckCircle2 className="w-3 h-3 text-green-600" /> : <XCircle className="w-3 h-3 text-red-600" />}
      </span>
      <span className="text-gray-700">{label}</span>
      {locked && <Lock className="w-3 h-3 text-gray-400" />}
    </div>
  )
}
