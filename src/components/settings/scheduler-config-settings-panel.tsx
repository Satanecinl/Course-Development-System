'use client'

// src/components/settings/scheduler-config-settings-panel.tsx
// K26-B: Scheduler config settings panel for the system settings center.
//
// Reuses:
//   - ConfigFormDialog, DeleteConfigButton from scheduler-config-panel.tsx
//   - fetchSchedulingConfigs from scheduler-config-client.ts
//   - toFriendlyError from scheduler-config-errors.ts
//   - SchedulingConfig type from scheduling-config.ts
//
// Provides a table-based list view of all SchedulingConfig records with
// create/edit/delete operations, embedded in the /admin/settings center.

import { useCallback, useEffect, useState } from 'react'
import {
  Plus,
  Pencil,
  Loader2,
  AlertTriangle,
  RefreshCw,
  Info,
  Settings2,
} from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import {
  ConfigFormDialog,
  DeleteConfigButton,
} from '@/components/scheduler-config-panel'
import { fetchSchedulingConfigs } from '@/lib/scheduler-config-client'
import { toFriendlyError } from '@/lib/scheduler-config-errors'
import type { SchedulingConfig } from '@/types/scheduling-config'

// ─── Info card ────────────────────────────────────────────────────

/** K26-B marker: info card explaining what scheduler config controls. */
function SchedulerConfigInfoCard() {
  return (
    <div
      className="bg-blue-50 border border-blue-200 rounded-lg p-4 mb-4"
      data-testid="k26b-info-card"
    >
      <div className="flex items-start gap-3">
        <Info className="w-5 h-5 text-blue-500 mt-0.5 shrink-0" />
        <div className="space-y-1">
          <h4 className="text-sm font-semibold text-blue-800">排课参数设置</h4>
          <p className="text-sm text-blue-700">
            这里管理自动排课 preview / run 使用的默认参数配置。
          </p>
          <ul className="text-xs text-blue-600 space-y-0.5 mt-1 list-disc list-inside">
            <li>包含：最大迭代次数、LAHC 窗口大小、随机种子、锁定槽位、Solver 版本</li>
            <li>不包含：score 权重（hardWeights / softWeights）</li>
            <li>不包含：节次作息配置</li>
            <li>不包含：教室规则配置</li>
          </ul>
        </div>
      </div>
    </div>
  )
}

// ─── Config table row ─────────────────────────────────────────────

function ConfigTableRow({
  config,
  onEdit,
  onDeleted,
}: {
  config: SchedulingConfig
  onEdit: (config: SchedulingConfig) => void
  onDeleted: (id: number) => void
}) {
  const lockedCount = config.lockedSlotIds?.length ?? 0

  return (
    <tr className="hover:bg-gray-50 transition-colors">
      <td className="px-3 py-2.5 text-sm font-medium text-gray-900">
        #{config.id}
      </td>
      <td className="px-3 py-2.5 text-sm text-gray-900">{config.name}</td>
      <td className="px-3 py-2.5 text-sm text-gray-700 text-right font-mono">
        {config.maxIterations.toLocaleString()}
      </td>
      <td className="px-3 py-2.5 text-sm text-gray-700 text-right font-mono">
        {config.lahcWindowSize}
      </td>
      <td className="px-3 py-2.5 text-sm text-gray-700 text-right font-mono">
        {config.randomSeed != null ? config.randomSeed : <span className="text-gray-400">-</span>}
      </td>
      <td className="px-3 py-2.5 text-sm text-gray-700 text-right font-mono">
        {lockedCount > 0 ? lockedCount : <span className="text-gray-400">0</span>}
      </td>
      <td className="px-3 py-2.5 text-sm text-gray-700">
        {config.solverVersion || <span className="text-gray-400">-</span>}
      </td>
      <td className="px-3 py-2.5 text-sm text-gray-700">
        {config.semesterId != null ? `#${config.semesterId}` : <span className="text-gray-400">-</span>}
      </td>
      <td className="px-3 py-2.5 text-xs text-gray-500">
        {new Date(config.createdAt).toLocaleDateString('zh-CN')}
      </td>
      <td className="px-3 py-2.5">
        <div className="flex items-center gap-1">
          <Button
            variant="ghost"
            size="sm"
            onClick={() => onEdit(config)}
            title="编辑该配置"
            data-testid="k26b-edit-btn"
            className="text-gray-600 hover:text-blue-600 hover:bg-blue-50"
          >
            <Pencil className="w-3.5 h-3.5" />
          </Button>
          <DeleteConfigButton config={config} onDeleted={onDeleted} />
        </div>
      </td>
    </tr>
  )
}

// ─── Main panel ───────────────────────────────────────────────────

export function SchedulerConfigSettingsPanel() {
  const [configs, setConfigs] = useState<SchedulingConfig[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [createOpen, setCreateOpen] = useState(false)
  const [editingConfig, setEditingConfig] = useState<SchedulingConfig | null>(null)

  const reload = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const list = await fetchSchedulingConfigs()
      setConfigs(list)
    } catch (e) {
      const fe = toFriendlyError(e)
      setError(fe.userMessage)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    const t = setTimeout(() => { reload() }, 0)
    return () => clearTimeout(t)
  }, [reload])

  const handleSaved = (saved: SchedulingConfig) => {
    setConfigs((prev) => {
      const idx = prev.findIndex((c) => c.id === saved.id)
      if (idx === -1) return [...prev, saved]
      const next = prev.slice()
      next[idx] = saved
      return next
    })
    toast.success(`已保存配置: ${saved.name}`)
  }

  const handleDeleted = (id: number) => {
    setConfigs((prev) => prev.filter((c) => c.id !== id))
  }

  return (
    <div data-testid="k26b-scheduler-config-panel">
      <SchedulerConfigInfoCard />

      {/* Header bar */}
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <Settings2 className="w-5 h-5 text-gray-500" />
          <h3 className="text-base font-semibold text-gray-900">排课配置列表</h3>
          {!loading && (
            <Badge variant="secondary" className="text-xs" data-testid="k26b-config-count">
              {configs.length} 个配置
            </Badge>
          )}
        </div>
        <div className="flex items-center gap-2">
          <Button
            variant="ghost"
            size="sm"
            onClick={reload}
            disabled={loading}
            title="刷新配置列表"
            data-testid="k26b-refresh-btn"
          >
            {loading ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : (
              <RefreshCw className="w-4 h-4" />
            )}
          </Button>
          <Button
            variant="default"
            size="sm"
            onClick={() => setCreateOpen(true)}
            disabled={loading}
            data-testid="k26b-create-btn"
          >
            <Plus className="w-4 h-4 mr-1" />
            新建配置
          </Button>
        </div>
      </div>

      {/* Loading state */}
      {loading && (
        <div
          className="flex items-center justify-center py-12 text-gray-500"
          data-testid="k26b-loading"
        >
          <Loader2 className="w-5 h-5 animate-spin mr-2" />
          <span className="text-sm">加载排课配置...</span>
        </div>
      )}

      {/* Error state */}
      {!loading && error && (
        <div
          className="bg-red-50 border border-red-200 rounded-lg p-4 flex items-start gap-3"
          data-testid="k26b-error"
        >
          <AlertTriangle className="w-5 h-5 text-red-500 mt-0.5 shrink-0" />
          <div>
            <p className="text-sm font-medium text-red-800">加载失败</p>
            <p className="text-sm text-red-700 mt-1">{error}</p>
            <Button
              variant="outline"
              size="sm"
              className="mt-2"
              onClick={reload}
            >
              重试
            </Button>
          </div>
        </div>
      )}

      {/* Empty state */}
      {!loading && !error && configs.length === 0 && (
        <div
          className="bg-gray-50 border border-gray-200 rounded-lg p-8 text-center"
          data-testid="k26b-empty"
        >
          <Settings2 className="w-8 h-8 text-gray-300 mx-auto mb-2" />
          <p className="text-sm text-gray-600 mb-1">暂无排课配置</p>
          <p className="text-xs text-gray-400 mb-3">
            您可以创建自定义排课配置，或直接使用默认参数运行排课预览。
          </p>
          <Button
            variant="outline"
            size="sm"
            onClick={() => setCreateOpen(true)}
            data-testid="k26b-empty-create-btn"
          >
            <Plus className="w-4 h-4 mr-1" />
            创建第一个配置
          </Button>
        </div>
      )}

      {/* Config table */}
      {!loading && !error && configs.length > 0 && (
        <div className="overflow-x-auto border border-gray-200 rounded-lg" data-testid="k26b-config-table">
          <table className="w-full text-left">
            <thead className="bg-gray-50 border-b border-gray-200">
              <tr>
                <th className="px-3 py-2.5 text-xs font-medium text-gray-500 w-14">ID</th>
                <th className="px-3 py-2.5 text-xs font-medium text-gray-500">名称</th>
                <th className="px-3 py-2.5 text-xs font-medium text-gray-500 text-right">最大迭代</th>
                <th className="px-3 py-2.5 text-xs font-medium text-gray-500 text-right">LAHC 窗口</th>
                <th className="px-3 py-2.5 text-xs font-medium text-gray-500 text-right">随机种子</th>
                <th className="px-3 py-2.5 text-xs font-medium text-gray-500 text-right">锁定槽位</th>
                <th className="px-3 py-2.5 text-xs font-medium text-gray-500">Solver 版本</th>
                <th className="px-3 py-2.5 text-xs font-medium text-gray-500">学期</th>
                <th className="px-3 py-2.5 text-xs font-medium text-gray-500">创建日期</th>
                <th className="px-3 py-2.5 text-xs font-medium text-gray-500 w-20">操作</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100" data-testid="k26b-config-list">
              {configs.map((config) => (
                <ConfigTableRow
                  key={config.id}
                  config={config}
                  onEdit={setEditingConfig}
                  onDeleted={handleDeleted}
                />
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Create dialog */}
      <ConfigFormDialog
        open={createOpen}
        mode="create"
        onOpenChange={setCreateOpen}
        onSaved={handleSaved}
      />

      {/* Edit dialog */}
      <ConfigFormDialog
        open={editingConfig != null}
        mode="edit"
        initial={editingConfig}
        onOpenChange={(o) => {
          if (!o) setEditingConfig(null)
        }}
        onSaved={handleSaved}
      />
    </div>
  )
}
