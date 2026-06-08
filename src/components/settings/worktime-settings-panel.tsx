'use client'

/**
 * WorkTimeSettingsPanel
 *
 * K26-H: System settings panel for WorkTime / time-slot configuration.
 * Uses K26-G WorkTime API. Does NOT integrate with solver/score/recommendation.
 */

import { useState, useEffect, useCallback, useRef } from 'react'
import { Button } from '@/components/ui/button'
import { Loader2, AlertCircle, Plus, Settings, Info, Star, Pencil, Trash2 } from 'lucide-react'
import { toast } from 'sonner'
import {
  listWorkTimeConfigs,
  createWorkTimeConfig,
  updateWorkTimeConfig,
  deleteWorkTimeConfig,
  activateWorkTimeConfig,
  resolveWorkTimeConfig,
  getWorkTimeErrorMessage,
} from '@/lib/settings/worktime-settings-client'
import { WorkTimeConfigFormDialog } from './worktime-config-form-dialog'
import { WorkTimeConfigDeleteDialog } from './worktime-config-delete-dialog'
import type { WorkTimeConfigDTO, ResolvedWorkTimeConfig } from '@/types/worktime'
import { useSemesterStore } from '@/store/semesterStore'

export function WorkTimeSettingsPanel() {
  const { currentSemesterId } = useSemesterStore()
  const semesterId = currentSemesterId ?? 1

  const [configs, setConfigs] = useState<WorkTimeConfigDTO[]>([])
  const [resolved, setResolved] = useState<ResolvedWorkTimeConfig | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  // Dialog state
  const [formOpen, setFormOpen] = useState(false)
  const [formMode, setFormMode] = useState<'create' | 'edit'>('create')
  const [editingConfig, setEditingConfig] = useState<WorkTimeConfigDTO | undefined>()
  const [saving, setSaving] = useState(false)
  const [deleteOpen, setDeleteOpen] = useState(false)
  const [deletingConfig, setDeletingConfig] = useState<WorkTimeConfigDTO | null>(null)
  const [deleting, setDeleting] = useState(false)
  const [protectionError, setProtectionError] = useState<string | null>(null)
  const [activatingId, setActivatingId] = useState<number | null>(null)

  const loadDataRef = useRef<() => Promise<void>>(undefined)

  const loadData = useCallback(async () => {
    setLoading(true)
    setError('')
    try {
      const [listResult, resolvedResult] = await Promise.all([
        listWorkTimeConfigs({ semesterId, includeSlots: true }),
        resolveWorkTimeConfig(semesterId),
      ])
      setConfigs(listResult.items)
      setResolved(resolvedResult)
    } catch (err) {
      setError(err instanceof Error ? err.message : '加载失败')
    } finally {
      setLoading(false)
    }
  }, [semesterId])

  useEffect(() => {
    loadDataRef.current = loadData
  }, [loadData])

  useEffect(() => {
    loadDataRef.current?.()
  }, [semesterId])

  // ── Create ──
  function handleCreateClick() {
    setFormMode('create')
    setEditingConfig(undefined)
    setFormOpen(true)
  }

  // ── Edit ──
  function handleEditClick(config: WorkTimeConfigDTO) {
    setFormMode('edit')
    setEditingConfig(config)
    setFormOpen(true)
  }

  // ── Form submit ──
  async function handleFormSubmit(input: Record<string, unknown>) {
    setSaving(true)
    try {
      if (formMode === 'create') {
        await createWorkTimeConfig(input as unknown as Parameters<typeof createWorkTimeConfig>[0])
        toast.success('作息配置创建成功')
      } else if (editingConfig) {
        await updateWorkTimeConfig(editingConfig.id, input as unknown as Parameters<typeof updateWorkTimeConfig>[1])
        toast.success('作息配置更新成功')
      }
      setFormOpen(false)
      await loadData()
    } catch (err) {
      const msg = err instanceof Error ? getWorkTimeErrorMessage(err as Error & { code?: string }) : '操作失败'
      toast.error(msg)
    } finally {
      setSaving(false)
    }
  }

  // ── Delete ──
  function handleDeleteClick(config: WorkTimeConfigDTO) {
    setDeletingConfig(config)
    setProtectionError(null)
    setDeleteOpen(true)
  }

  async function handleDeleteConfirm() {
    if (!deletingConfig) return
    setDeleting(true)
    setProtectionError(null)
    try {
      await deleteWorkTimeConfig(deletingConfig.id)
      toast.success('作息配置已删除')
      setDeleteOpen(false)
      await loadData()
    } catch (err) {
      if (err instanceof Error) {
        const code = (err as Error & { code?: string }).code
        if (code === 'WORKTIME_CONFIG_DEFAULT_IN_USE' || code === 'WORKTIME_CONFIG_LAST_ACTIVE' || code === 'WORKTIME_CONFIG_USED_BY_RUN') {
          setProtectionError(getWorkTimeErrorMessage(err as Error & { code?: string }))
        } else {
          toast.error(getWorkTimeErrorMessage(err as Error & { code?: string }))
        }
      }
    } finally {
      setDeleting(false)
    }
  }

  // ── Activate ──
  async function handleActivate(id: number) {
    setActivatingId(id)
    try {
      await activateWorkTimeConfig(id)
      toast.success('已设为默认配置')
      await loadData()
    } catch (err) {
      const msg = err instanceof Error ? getWorkTimeErrorMessage(err as Error & { code?: string }) : '操作失败'
      toast.error(msg)
    } finally {
      setActivatingId(null)
    }
  }

  // ── Render ──
  if (loading) {
    return (
      <div className="flex items-center justify-center py-12 text-gray-400" data-testid="k26h-loading">
        <Loader2 className="w-5 h-5 animate-spin mr-2" />
        <span>加载作息配置...</span>
      </div>
    )
  }

  if (error) {
    return (
      <div className="flex flex-col items-center justify-center py-12 text-red-500 gap-2" data-testid="k26h-error">
        <AlertCircle className="w-6 h-6" />
        <p>{error}</p>
        <Button variant="outline" size="sm" onClick={loadData}>重试</Button>
      </div>
    )
  }

  return (
    <div className="space-y-6" data-testid="k26h-worktime-settings-panel">
      {/* Header / Summary */}
      <div>
        <h2 className="text-xl font-semibold flex items-center gap-2">
          <Settings className="w-5 h-5" />
          节次与作息设置
        </h2>
        <p className="text-sm text-gray-500 mt-1">
          管理学期作息配置、节次启用状态、周末规则。当前仅管理配置本身，尚未接入调课推荐、自动排课 solver、score。
        </p>
      </div>

      {/* Info card */}
      <div className="bg-blue-50 border border-blue-200 rounded-md p-4 text-sm text-blue-800" data-testid="k26h-info-card">
        <div className="flex items-start gap-2">
          <Info className="w-4 h-4 mt-0.5 flex-shrink-0" />
          <div>
            <p className="font-medium">当前阶段说明</p>
            <ul className="mt-1 space-y-1 list-disc list-inside">
              <li>11-12节和中午当前为传统显示节次，不能设为教学节次</li>
              <li>未来 K26-I/K26-J 才会接入推荐和 solver</li>
              <li data-testid="k26h-no-solver-warning">当前配置不影响自动排课 solver 和 score 计算</li>
            </ul>
          </div>
        </div>
      </div>

      {/* Resolved config card */}
      {resolved && (
        <div className="bg-white border rounded-md p-4" data-testid="k26h-resolved-card">
          <h3 className="font-medium mb-2">当前生效配置</h3>
          {resolved.source === 'staticFallback' && (
            <div className="bg-amber-50 border border-amber-200 rounded px-3 py-2 text-sm text-amber-700 mb-3" data-testid="k26h-static-fallback-warning">
              ⚠️ 当前学期尚无数据库作息配置，正在使用静态默认配置。
            </div>
          )}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-sm">
            <div><span className="text-gray-500">来源：</span>{resolved.source === 'database' ? '数据库' : '静态默认'}</div>
            <div><span className="text-gray-500">名称：</span>{resolved.config.name}</div>
            <div><span className="text-gray-500">允许周末：</span>{resolved.config.allowWeekend ? '是' : '否'}</div>
            <div><span className="text-gray-500">版本：</span>v{resolved.config.version}</div>
            <div><span className="text-gray-500">活跃教学节次：</span>{resolved.config.slots?.filter((s) => s.isActive && s.isTeachingSlot).length ?? 0}</div>
            <div><span className="text-gray-500">传统显示节次：</span>{resolved.config.slots?.filter((s) => s.isLegacyDisplay).length ?? 0}</div>
          </div>
        </div>
      )}

      {/* Config list header */}
      <div className="flex items-center justify-between">
        <h3 className="font-medium">作息配置列表</h3>
        <Button size="sm" onClick={handleCreateClick} data-testid="k26h-create-btn">
          <Plus className="w-4 h-4 mr-1" /> 新建配置
        </Button>
      </div>

      {/* Empty state */}
      {configs.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-12 text-gray-400 gap-3" data-testid="k26h-empty">
          <p>暂无作息配置</p>
          <Button size="sm" onClick={handleCreateClick}>
            <Plus className="w-4 h-4 mr-1" /> 新建配置
          </Button>
        </div>
      ) : (
        /* Config list */
        <div className="space-y-3" data-testid="k26h-config-list">
          {configs.map((config) => (
            <div key={config.id} className="border rounded-md p-4 bg-white">
              <div className="flex items-center justify-between mb-2">
                <div className="flex items-center gap-2">
                  <span className="font-medium">{config.name}</span>
                  {config.isDefault && (
                    <span className="text-xs bg-blue-100 text-blue-700 px-2 py-0.5 rounded" data-testid={`k26h-config-default-${config.id}`}>默认</span>
                  )}
                  {!config.isActive && (
                    <span className="text-xs bg-gray-100 text-gray-500 px-2 py-0.5 rounded">已禁用</span>
                  )}
                </div>
                <div className="flex items-center gap-1">
                  {!config.isDefault && (
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => handleActivate(config.id)}
                      disabled={activatingId === config.id}
                      title="设为默认"
                      data-testid={`k26h-activate-btn-${config.id}`}
                    >
                      {activatingId === config.id ? (
                        <Loader2 className="w-4 h-4 animate-spin" />
                      ) : (
                        <Star className="w-4 h-4" />
                      )}
                    </Button>
                  )}
                  {config.isDefault && (
                    <Button variant="ghost" size="sm" disabled title="当前默认" data-testid={`k26h-already-default-${config.id}`}>
                      <Star className="w-4 h-4 text-blue-500 fill-blue-500" />
                    </Button>
                  )}
                  <Button variant="ghost" size="sm" onClick={() => handleEditClick(config)} title="编辑" data-testid={`k26h-edit-btn-${config.id}`}>
                    <Pencil className="w-4 h-4" />
                  </Button>
                  <Button variant="ghost" size="sm" onClick={() => handleDeleteClick(config)} title="删除" data-testid={`k26h-delete-btn-${config.id}`}>
                    <Trash2 className="w-4 h-4 text-red-500" />
                  </Button>
                </div>
              </div>

              <div className="grid grid-cols-2 md:grid-cols-5 gap-2 text-xs text-gray-500">
                <div>允许周末：{config.allowWeekend ? '是' : '否'}</div>
                <div>版本：v{config.version}</div>
                <div>教学节次：{config.slots?.filter((s) => s.isActive && s.isTeachingSlot).length ?? 0}</div>
                <div>传统节次：{config.slots?.filter((s) => s.isLegacyDisplay).length ?? 0}</div>
                <div>更新：{new Date(config.updatedAt).toLocaleDateString()}</div>
              </div>

              {/* Slot table */}
              {config.slots && config.slots.length > 0 && (
                <div className="mt-3 border rounded overflow-hidden" data-testid={`k26h-slot-table-${config.id}`}>
                  <table className="w-full text-xs">
                    <thead className="bg-gray-50">
                      <tr>
                        <th className="px-2 py-1 text-left">节次</th>
                        <th className="px-2 py-1 text-left">名称</th>
                        <th className="px-2 py-1 text-left">开始</th>
                        <th className="px-2 py-1 text-left">结束</th>
                        <th className="px-2 py-1 text-center">启用</th>
                        <th className="px-2 py-1 text-center">教学</th>
                        <th className="px-2 py-1 text-center">传统</th>
                      </tr>
                    </thead>
                    <tbody>
                      {config.slots.map((s) => (
                        <tr key={s.slotIndex} className={`border-t ${s.isLegacyDisplay ? 'bg-amber-50' : ''}`}>
                          <td className="px-2 py-1">{s.slotIndex}</td>
                          <td className="px-2 py-1">{s.label}</td>
                          <td className="px-2 py-1">{s.startsAt ?? '-'}</td>
                          <td className="px-2 py-1">{s.endsAt ?? '-'}</td>
                          <td className="px-2 py-1 text-center">{s.isActive ? '✓' : '-'}</td>
                          <td className="px-2 py-1 text-center">{s.isTeachingSlot ? '✓' : '-'}</td>
                          <td className="px-2 py-1 text-center">
                            {s.isLegacyDisplay ? (
                              <span className="text-amber-600" data-testid={`k26h-legacy-badge-${s.slotIndex}`}>传统</span>
                            ) : '-'}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {/* Dialogs */}
      <WorkTimeConfigFormDialog
        key={formOpen ? `${formMode}-${editingConfig?.id ?? 'new'}` : 'closed'}
        open={formOpen}
        mode={formMode}
        config={editingConfig}
        semesterId={semesterId}
        saving={saving}
        onOpenChange={setFormOpen}
        onSubmit={handleFormSubmit}
      />

      <WorkTimeConfigDeleteDialog
        open={deleteOpen}
        config={deletingConfig}
        deleting={deleting}
        protectionError={protectionError}
        onOpenChange={setDeleteOpen}
        onConfirm={handleDeleteConfirm}
      />
    </div>
  )
}
