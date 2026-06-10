'use client'

import { useState, useEffect } from 'react'
import {
  fetchDataMaintenance,
  getDataMaintenanceErrorMessage,
  type DataMaintenanceData,
  type DataMaintenanceSection,
  type DataMaintenanceSafeguard,
  type SectionRisk,
  type SectionStatus,
  type SafeguardSeverity,
} from '@/lib/settings/data-maintenance-client'
import { Badge } from '@/components/ui/badge'
import {
  RefreshCw,
  Database,
  HardDriveDownload,
  FileDown,
  Trash2,
  ShieldCheck,
  GitBranch,
  AlertOctagon,
  Info,
  AlertTriangle,
  Lock,
  CheckCircle2,
  XCircle,
  Server,
} from 'lucide-react'

const STATUS_MAP: Record<SectionStatus, { label: string; color: string }> = {
  available: { label: '已具备', color: 'bg-green-100 text-green-700 border-green-200' },
  manual: { label: '需人工', color: 'bg-amber-100 text-amber-700 border-amber-200' },
  planned: { label: '待规划', color: 'bg-blue-100 text-blue-700 border-blue-200' },
  disabled: { label: '禁用', color: 'bg-red-100 text-red-700 border-red-200' },
  unknown: { label: '未知', color: 'bg-gray-100 text-gray-500 border-gray-200' },
}

const RISK_MAP: Record<SectionRisk, { label: string; color: string }> = {
  low: { label: '低风险', color: 'bg-green-100 text-green-700 border-green-200' },
  medium: { label: '中风险', color: 'bg-amber-100 text-amber-700 border-amber-200' },
  high: { label: '高风险', color: 'bg-red-100 text-red-700 border-red-200' },
}

const SEVERITY_MAP: Record<SafeguardSeverity, { color: string; icon: React.ReactNode }> = {
  hard: { color: 'bg-red-50 text-red-700 border-red-200', icon: <AlertOctagon className="w-4 h-4" /> },
  warning: { color: 'bg-amber-50 text-amber-700 border-amber-200', icon: <AlertTriangle className="w-4 h-4" /> },
  info: { color: 'bg-blue-50 text-blue-700 border-blue-200', icon: <Info className="w-4 h-4" /> },
}

const SECTION_ICONS: Record<string, React.ReactNode> = {
  'database-status': <Database className="w-4 h-4" />,
  'backup-and-restore': <HardDriveDownload className="w-4 h-4" />,
  'data-export': <FileDown className="w-4 h-4" />,
  'cleanup-capability': <Trash2 className="w-4 h-4" />,
  'anomaly-data-checks': <ShieldCheck className="w-4 h-4" />,
  'migration-status': <GitBranch className="w-4 h-4" />,
}

export function DataMaintenanceSettingsPanel() {
  const [data, setData] = useState<DataMaintenanceData | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    fetchDataMaintenance()
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
    fetchDataMaintenance()
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
        <p className="text-sm text-red-500">{getDataMaintenanceErrorMessage(error)}</p>
        <button onClick={reload} className="mt-2 text-sm text-blue-600 hover:underline">
          重试
        </button>
      </div>
    )
  }

  if (!data) return null

  const { summary, sections, safeguards, knownChecks, safetyRules } = data

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Server className="w-5 h-5 text-rose-600" />
          <h2 className="text-lg font-bold text-gray-900">数据维护与备份</h2>
          <Badge className="text-xs bg-rose-100 text-rose-700 border-rose-200">
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

      {/* Top safety notice — destructive actions are disabled */}
      <div className="bg-red-50 rounded-lg border border-red-200 p-4 flex items-start gap-2">
        <AlertOctagon className="w-4 h-4 text-red-600 mt-0.5 shrink-0" />
        <div className="text-xs text-red-700 space-y-1">
          <p className="font-medium">破坏性操作已禁用 (destructiveActionsEnabled = false)。</p>
          <p>
            本模块不提供一键备份 / 一键恢复 / 一键清理 / 一键修复 / migrate reset / db push --force-reset 入口。
            所有破坏性操作必须人工 + 备份 + dry-run + review。
          </p>
        </div>
      </div>

      {/* Summary cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <SummaryCard
          label="数据库类型"
          value={summary.databaseType}
          icon={<Database className="w-4 h-4" />}
        />
        <SummaryCard
          label="migration 目录数"
          value={String(summary.migrationFileCount)}
          ok={summary.migrationFileCount > 0}
          icon={<GitBranch className="w-4 h-4" />}
        />
        <SummaryCard
          label="已知检查项"
          value={String(summary.knownDataCheckCount)}
          ok
          icon={<ShieldCheck className="w-4 h-4" />}
        />
        <SummaryCard
          label="破坏性操作"
          value="已禁用"
          ok
          icon={<Lock className="w-4 h-4" />}
        />
      </div>

      {/* Sections (DB / backup / export / cleanup / anomaly / migration) */}
      <div className="space-y-4">
        {sections.map((s) => (
          <SectionCard key={s.key} section={s} />
        ))}
      </div>

      {/* Safeguards */}
      <div className="bg-white rounded-lg border border-gray-200 p-5">
        <h3 className="text-sm font-semibold text-gray-900 mb-3 flex items-center gap-2">
          <ShieldCheck className="w-4 h-4" />
          安全 Guard
        </h3>
        <div className="space-y-2">
          {safeguards.map((g) => (
            <SafeguardRow key={g.key} g={g} />
          ))}
        </div>
      </div>

      {/* Known checks */}
      <div className="bg-white rounded-lg border border-gray-200 p-5">
        <h3 className="text-sm font-semibold text-gray-900 mb-3 flex items-center gap-2">
          <ShieldCheck className="w-4 h-4" />
          已知数据检查 (last known status)
        </h3>
        {knownChecks.length === 0 ? (
          <div className="text-sm text-gray-500">暂无已知检查</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-200">
                  <th className="text-left py-2 pr-4 font-medium text-gray-500">检查项</th>
                  <th className="text-left py-2 pr-4 font-medium text-gray-500">命令</th>
                  <th className="text-left py-2 pr-4 font-medium text-gray-500">last known status</th>
                </tr>
              </thead>
              <tbody>
                {knownChecks.map((c) => (
                  <tr key={c.key} className="border-b border-gray-100">
                    <td className="py-2 pr-4">
                      <div className="text-sm font-medium text-gray-900">{c.label}</div>
                      <div className="text-xs text-gray-500">{c.description}</div>
                    </td>
                    <td className="py-2 pr-4">
                      <code className="text-xs font-mono bg-gray-100 px-1 py-0.5 rounded">
                        {c.command}
                      </code>
                    </td>
                    <td className="py-2 pr-4 text-xs text-gray-700">{c.lastKnownStatus}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Safety rules */}
      <div className="bg-white rounded-lg border border-gray-200 p-5">
        <h3 className="text-sm font-semibold text-gray-900 mb-3 flex items-center gap-2">
          <Lock className="w-4 h-4" />
          安全操作规则 (safetyRules)
        </h3>
        <ul className="space-y-1.5">
          {safetyRules.map((rule, i) => (
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
            所有数据维护、备份、清理、修复操作不在本页面执行。
            如需修改请在后续阶段设计配置化方案 (例如 K26-P3: 一键备份 UI / K26-P4: 安全清理向导)。
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
  icon,
}: {
  label: string
  value: string
  ok?: boolean
  icon?: React.ReactNode
}) {
  return (
    <div className={`bg-white rounded-lg border p-4 ${ok ? 'border-green-200' : 'border-gray-200'}`}>
      <div className="text-xs text-gray-500 mb-1 flex items-center gap-1">
        {icon}
        {label}
      </div>
      <div className="text-2xl font-bold text-gray-900">{value}</div>
    </div>
  )
}

function SectionCard({ section }: { section: DataMaintenanceSection }) {
  const status = STATUS_MAP[section.status] ?? STATUS_MAP.unknown
  const risk = RISK_MAP[section.risk] ?? RISK_MAP.medium
  const icon = SECTION_ICONS[section.key] ?? <Info className="w-4 h-4" />

  return (
    <div className="bg-white rounded-lg border border-gray-200 p-5">
      <div className="flex items-center gap-2 flex-wrap mb-2">
        {icon}
        <h3 className="text-sm font-semibold text-gray-900">{section.label}</h3>
        <Badge className={`text-xs ${status.color}`}>{status.label}</Badge>
        <Badge className={`text-xs ${risk.color}`}>风险: {risk.label}</Badge>
        <span className="text-xs text-gray-400 ml-auto flex items-center gap-1">
          <Lock className="w-3 h-3" /> 只读
        </span>
      </div>
      <p className="text-xs text-gray-600 mb-2">{section.description}</p>
      {section.facts.length > 0 && (
        <ul className="text-xs text-gray-700 space-y-1 mb-2">
          {section.facts.map((f, i) => (
            <li key={i} className="flex items-start gap-1.5">
              <span className="text-gray-400 shrink-0">•</span>
              <span>{f}</span>
            </li>
          ))}
        </ul>
      )}
      {section.commands.length > 0 && (
        <div className="mt-2">
          <div className="text-[10px] font-medium text-gray-500 mb-1">建议命令 (manual execute only)</div>
          <div className="space-y-1">
            {section.commands.map((c, i) => (
              <code
                key={i}
                className="block text-[11px] font-mono bg-gray-50 px-2 py-1 rounded border border-gray-200"
              >
                {c}
              </code>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}

function SafeguardRow({ g }: { g: DataMaintenanceSafeguard }) {
  const sev = SEVERITY_MAP[g.severity] ?? SEVERITY_MAP.info
  return (
    <div className={`flex items-start gap-2 p-2 rounded border ${sev.color}`}>
      {sev.icon}
      <div className="flex-1">
        <div className="flex items-center gap-2 flex-wrap">
          <span className="text-sm font-medium">{g.label}</span>
          {g.enabled ? (
            <Badge className="text-xs bg-green-100 text-green-700 inline-flex items-center gap-1">
              <CheckCircle2 className="w-3 h-3" /> 启用
            </Badge>
          ) : (
            <Badge className="text-xs bg-red-100 text-red-700 inline-flex items-center gap-1">
              <XCircle className="w-3 h-3" /> 未启用
            </Badge>
          )}
        </div>
        <p className="text-xs text-gray-600 mt-0.5">{g.description}</p>
      </div>
    </div>
  )
}
