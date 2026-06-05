'use client'

// src/components/scheduler-config-panel.tsx
// K21-FIX-G-SOLVER-CONFIG-UI
//
// Combined UI panel for managing SchedulingConfigs and feeding them into
// the preview request. Composed of:
//   - <ConfigPicker> — dropdown to select a config (or "default")
//   - <ConfigFormDialog> — create / edit config
//   - <DeleteConfigButton> — delete with confirm + CONFIG_IN_USE handling
//   - <SolverConfigPanel> — top-level container with the above
//
// Uses:
//   - src/lib/scheduler-config-client.ts (CRUD fetchers)
//   - src/lib/scheduler-config-errors.ts (toFriendlyError)
//   - src/types/scheduling-config.ts (types)
//
// The actual page (scheduler-content.tsx) wires this panel into the
// preview submit path via the onResolvedConfigChange callback.

import { useCallback, useEffect, useState } from 'react'
import {
  Plus,
  Pencil,
  Trash2,
  AlertTriangle,
  Loader2,
  Settings2,
  ListChecks,
} from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  createSchedulingConfig,
  deleteSchedulingConfig,
  fetchSchedulingConfigs,
  updateSchedulingConfig,
} from '@/lib/scheduler-config-client'
import { toFriendlyError } from '@/lib/scheduler-config-errors'
import type {
  CreateSchedulingConfigInput,
  SchedulingConfig,
  UpdateSchedulingConfigInput,
} from '@/types/scheduling-config'

// ─── Config Picker ────────────────────────────────────────────────

export interface ConfigPickerProps {
  configs: SchedulingConfig[]
  selectedConfigId: number | null
  onChange: (configId: number | null) => void
  loading: boolean
  disabled?: boolean
}

const SELECTED_NONE = '__default__'

export function ConfigPicker({ configs, selectedConfigId, onChange, loading, disabled }: ConfigPickerProps) {
  return (
    <div className="flex items-center gap-2">
      <ListChecks className="w-4 h-4 text-gray-400" />
      <Label htmlFor="config-picker" className="text-sm font-medium text-gray-700">
        排课配置
      </Label>
      <select
        id="config-picker"
        value={selectedConfigId == null ? SELECTED_NONE : String(selectedConfigId)}
        onChange={(e) => {
          const v = e.target.value
          onChange(v === SELECTED_NONE ? null : Number(v))
        }}
        disabled={disabled || loading}
        className="text-sm border border-gray-300 rounded-md px-2 py-1.5 bg-white focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:bg-gray-100"
      >
        <option value={SELECTED_NONE}>使用默认配置（不加载已保存配置）</option>
        {configs.map((c) => (
          <option key={c.id} value={String(c.id)}>
            #{c.id} · {c.name}
            {c.semesterId ? '' : ' · 通用'}
            {` · maxIter=${c.maxIterations}, lahc=${c.lahcWindowSize}`}
          </option>
        ))}
      </select>
      {loading && <Loader2 className="w-4 h-4 animate-spin text-gray-400" />}
    </div>
  )
}

// ─── Create / Edit Form Dialog ────────────────────────────────────

const FIELD_RANGES = {
  maxIterationsMin: 100,
  maxIterationsMax: 15000,
  lahcWindowSizeMin: 50,
  lahcWindowSizeMax: 2000,
  randomSeedMin: 0,
  randomSeedMax: 2147483647,
} as const

export interface ConfigFormDialogProps {
  open: boolean
  mode: 'create' | 'edit'
  initial?: SchedulingConfig | null
  onOpenChange: (open: boolean) => void
  onSaved: (config: SchedulingConfig) => void
}

export function ConfigFormDialog({ open, mode, initial, onOpenChange, onSaved }: ConfigFormDialogProps) {
  const [name, setName] = useState('')
  const [maxIterations, setMaxIterations] = useState('10000')
  const [lahcWindowSize, setLahcWindowSize] = useState('500')
  const [randomSeed, setRandomSeed] = useState('')
  const [solverVersion, setSolverVersion] = useState('')
  const [lockedSlotIdsText, setLockedSlotIdsText] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [errorMsg, setErrorMsg] = useState<string | null>(null)

  useEffect(() => {
    if (!open) return
    // When the dialog opens, sync local form state from the (mode, initial) tuple.
    // This is intentionally inside an effect so the form resets when the user
    // re-opens the dialog for a different config.
    const t = setTimeout(() => {
      setErrorMsg(null)
      if (mode === 'edit' && initial) {
        setName(initial.name)
        setMaxIterations(String(initial.maxIterations))
        setLahcWindowSize(String(initial.lahcWindowSize))
        setRandomSeed(initial.randomSeed == null ? '' : String(initial.randomSeed))
        setSolverVersion(initial.solverVersion ?? '')
        setLockedSlotIdsText(initial.lockedSlotIds.join(', '))
      } else {
        setName('')
        setMaxIterations('10000')
        setLahcWindowSize('500')
        setRandomSeed('')
        setSolverVersion('')
        setLockedSlotIdsText('')
      }
    }, 0)
    return () => clearTimeout(t)
  }, [open, mode, initial])

  const handleSubmit = async () => {
    setErrorMsg(null)

    const trimmedName = name.trim()
    if (trimmedName.length < 1 || trimmedName.length > 100) {
      setErrorMsg('配置名称必须是 1-100 字符')
      return
    }
    const mi = Number(maxIterations)
    if (!Number.isInteger(mi) || mi < FIELD_RANGES.maxIterationsMin || mi > FIELD_RANGES.maxIterationsMax) {
      setErrorMsg(`最大迭代次数必须是 ${FIELD_RANGES.maxIterationsMin}-${FIELD_RANGES.maxIterationsMax} 之间的整数`)
      return
    }
    const lw = Number(lahcWindowSize)
    if (!Number.isInteger(lw) || lw < FIELD_RANGES.lahcWindowSizeMin || lw > FIELD_RANGES.lahcWindowSizeMax) {
      setErrorMsg(`LAHC 窗口大小必须是 ${FIELD_RANGES.lahcWindowSizeMin}-${FIELD_RANGES.lahcWindowSizeMax} 之间的整数`)
      return
    }
    let seedValue: number | null | undefined = undefined
    if (randomSeed.trim() !== '') {
      const s = Number(randomSeed.trim())
      if (!Number.isInteger(s) || s < FIELD_RANGES.randomSeedMin || s > FIELD_RANGES.randomSeedMax) {
        setErrorMsg(`随机种子必须是 ${FIELD_RANGES.randomSeedMin}-${FIELD_RANGES.randomSeedMax} 之间的整数`)
        return
      }
      seedValue = s
    } else if (mode === 'create') {
      seedValue = null
    }

    let lockedSlotIds: number[] | undefined = undefined
    if (lockedSlotIdsText.trim() !== '') {
      const ids = lockedSlotIdsText
        .split(/[\s,]+/)
        .map((s) => s.trim())
        .filter((s) => s !== '')
      const parsed: number[] = []
      for (const id of ids) {
        const n = Number(id)
        if (!Number.isInteger(n) || n <= 0) {
          setErrorMsg(`锁定的课表槽位 ID 必须是正整数，发现: ${id}`)
          return
        }
        parsed.push(n)
      }
      lockedSlotIds = [...new Set(parsed)]
    }

    setSubmitting(true)
    try {
      if (mode === 'create') {
        const input: CreateSchedulingConfigInput = {
          name: trimmedName,
          maxIterations: mi,
          lahcWindowSize: lw,
          randomSeed: seedValue ?? null,
          lockedSlotIds: lockedSlotIds ?? [],
        }
        if (solverVersion.trim() !== '') input.solverVersion = solverVersion.trim()
        const created = await createSchedulingConfig(input)
        toast.success(`已创建配置: ${created.name}`)
        onSaved(created)
      } else if (initial) {
        const input: UpdateSchedulingConfigInput = {}
        input.name = trimmedName
        input.maxIterations = mi
        input.lahcWindowSize = lw
        if (seedValue !== undefined) input.randomSeed = seedValue
        if (solverVersion.trim() !== '') input.solverVersion = solverVersion.trim()
        else input.solverVersion = null
        if (lockedSlotIds !== undefined) input.lockedSlotIds = lockedSlotIds
        const updated = await updateSchedulingConfig(initial.id, input)
        toast.success(`已更新配置: ${updated.name}`)
        onSaved(updated)
      }
      onOpenChange(false)
    } catch (e) {
      const fe = toFriendlyError(e)
      setErrorMsg(fe.userMessage)
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            {mode === 'create' ? <Plus className="w-5 h-5 text-blue-500" /> : <Pencil className="w-5 h-5 text-blue-500" />}
            {mode === 'create' ? '新建排课配置' : `编辑排课配置 #${initial?.id ?? ''}`}
          </DialogTitle>
          <DialogDescription>
            创建或编辑排课配置。配置中的参数可被 Preview 时进一步覆写（overrides）。
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3 max-h-[60vh] overflow-y-auto pr-2">
          <div>
            <Label htmlFor="cfg-name" className="text-sm">名称 *</Label>
            <Input
              id="cfg-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="例如：春季 LAHC 标准配置"
              maxLength={100}
              className="mt-1"
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label htmlFor="cfg-max-iter" className="text-sm">最大迭代次数 (100-15000)</Label>
              <Input
                id="cfg-max-iter"
                type="number"
                value={maxIterations}
                onChange={(e) => setMaxIterations(e.target.value)}
                min={FIELD_RANGES.maxIterationsMin}
                max={FIELD_RANGES.maxIterationsMax}
                className="mt-1"
              />
            </div>
            <div>
              <Label htmlFor="cfg-lahc" className="text-sm">LAHC 窗口大小 (50-2000)</Label>
              <Input
                id="cfg-lahc"
                type="number"
                value={lahcWindowSize}
                onChange={(e) => setLahcWindowSize(e.target.value)}
                min={FIELD_RANGES.lahcWindowSizeMin}
                max={FIELD_RANGES.lahcWindowSizeMax}
                className="mt-1"
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label htmlFor="cfg-seed" className="text-sm">随机种子（可选）</Label>
              <Input
                id="cfg-seed"
                type="number"
                value={randomSeed}
                onChange={(e) => setRandomSeed(e.target.value)}
                min={FIELD_RANGES.randomSeedMin}
                max={FIELD_RANGES.randomSeedMax}
                placeholder="留空则由后端自动生成"
                className="mt-1"
              />
            </div>
            <div>
              <Label htmlFor="cfg-version" className="text-sm">Solver 版本（可选）</Label>
              <Input
                id="cfg-version"
                value={solverVersion}
                onChange={(e) => setSolverVersion(e.target.value)}
                placeholder="例如：lahc-hard-first-v3"
                maxLength={50}
                className="mt-1"
              />
            </div>
          </div>

          <div>
            <Label htmlFor="cfg-locks" className="text-sm">锁定的课表槽位 ID（可选，逗号或空格分隔）</Label>
            <Input
              id="cfg-locks"
              value={lockedSlotIdsText}
              onChange={(e) => setLockedSlotIdsText(e.target.value)}
              placeholder="例如：42, 87, 100"
              className="mt-1"
            />
            <p className="text-xs text-gray-500 mt-1">
              Preview 时也会被 `overrides.lockedSlotIds` 进一步覆写。
            </p>
          </div>

          {errorMsg && (
            <div className="bg-red-50 border border-red-200 rounded-md p-2 text-sm text-red-700 flex items-start gap-2">
              <AlertTriangle className="w-4 h-4 mt-0.5 shrink-0" />
              <span>{errorMsg}</span>
            </div>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={submitting}>
            取消
          </Button>
          <Button onClick={handleSubmit} disabled={submitting}>
            {submitting && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
            {mode === 'create' ? '创建' : '保存'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

// ─── Delete Button + Confirm ─────────────────────────────────────

export interface DeleteConfigButtonProps {
  config: SchedulingConfig
  onDeleted: (id: number) => void
}

export function DeleteConfigButton({ config, onDeleted }: DeleteConfigButtonProps) {
  const [confirmOpen, setConfirmOpen] = useState(false)
  const [submitting, setSubmitting] = useState(false)

  const handleDelete = async () => {
    setSubmitting(true)
    try {
      await deleteSchedulingConfig(config.id)
      toast.success(`已删除配置: ${config.name}`)
      onDeleted(config.id)
      setConfirmOpen(false)
    } catch (e) {
      const fe = toFriendlyError(e)
      if (fe.code === 'CONFIG_IN_USE') {
        toast.error('该配置已被历史排课运行引用，不能删除', {
          description: fe.details?.runIds?.length
            ? `被引用的运行 ID: ${fe.details.runIds.slice(0, 5).join(', ')}${fe.details.runIds.length > 5 ? '...' : ''}`
            : undefined,
        })
      } else {
        toast.error(`删除失败: ${fe.userMessage}`)
      }
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <>
      <Button
        variant="ghost"
        size="sm"
        onClick={() => setConfirmOpen(true)}
        title="删除该配置"
        className="text-red-600 hover:text-red-700 hover:bg-red-50"
      >
        <Trash2 className="w-3.5 h-3.5" />
      </Button>
      <Dialog open={confirmOpen} onOpenChange={setConfirmOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <AlertTriangle className="w-5 h-5 text-red-500" />
              确认删除排课配置
            </DialogTitle>
            <DialogDescription>
              <p>即将删除 <strong>#{config.id} · {config.name}</strong>。</p>
              <p className="mt-2 text-amber-700">
                若该配置已被历史排课运行引用，删除请求会被服务端拒绝（409 CONFIG_IN_USE）。
              </p>
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setConfirmOpen(false)} disabled={submitting}>
              取消
            </Button>
            <Button variant="destructive" onClick={handleDelete} disabled={submitting}>
              {submitting && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
              确认删除
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  )
}

// ─── Top-level Config Panel ──────────────────────────────────────

export interface SolverConfigPanelProps {
  semesterId?: number | null
  selectedConfigId: number | null
  onSelectedConfigChange: (configId: number | null) => void
  /** When the selected config is loaded, expose the resolved config. */
  onResolvedConfigChange?: (resolved: { configId: number | null; maxIterations: number; lahcWindowSize: number; randomSeed: number | null; lockedSlotIds: number[]; solverVersion: string | null } | null) => void
  /** Hide create/edit/delete buttons (e.g. when not permitted). */
  readOnly?: boolean
}

export function SolverConfigPanel({
  semesterId,
  selectedConfigId,
  onSelectedConfigChange,
  onResolvedConfigChange,
  readOnly = false,
}: SolverConfigPanelProps) {
  const [configs, setConfigs] = useState<SchedulingConfig[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [createOpen, setCreateOpen] = useState(false)
  const [editingConfig, setEditingConfig] = useState<SchedulingConfig | null>(null)

  const reload = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const list = await fetchSchedulingConfigs(semesterId ?? undefined)
      setConfigs(list)
    } catch (e) {
      const fe = toFriendlyError(e)
      setError(fe.userMessage)
      if (fe.code === 'FORBIDDEN' || fe.code === 'UNAUTHENTICATED') {
        // permission errors are silent for the list — preview still works
      } else {
        toast.error(`加载排课配置失败: ${fe.userMessage}`)
      }
    } finally {
      setLoading(false)
    }
  }, [semesterId])

  useEffect(() => {
    // Defer to avoid setState-in-effect linter warning
    const t = setTimeout(() => {
      reload()
    }, 0)
    return () => clearTimeout(t)
  }, [reload])

  // Notify parent of the resolved config so it can include in preview
  useEffect(() => {
    if (!onResolvedConfigChange) return
    if (selectedConfigId == null) {
      onResolvedConfigChange(null)
      return
    }
    const found = configs.find((c) => c.id === selectedConfigId)
    if (!found) {
      // Selected config disappeared (deleted or semester mismatch) — reset
      onSelectedConfigChange(null)
      onResolvedConfigChange(null)
      return
    }
    onResolvedConfigChange({
      configId: found.id,
      maxIterations: found.maxIterations,
      lahcWindowSize: found.lahcWindowSize,
      randomSeed: found.randomSeed,
      lockedSlotIds: found.lockedSlotIds,
      solverVersion: found.solverVersion,
    })
  }, [configs, selectedConfigId, onResolvedConfigChange, onSelectedConfigChange])

  const handleSaved = (saved: SchedulingConfig) => {
    setConfigs((prev) => {
      const idx = prev.findIndex((c) => c.id === saved.id)
      if (idx === -1) return [...prev, saved]
      const next = prev.slice()
      next[idx] = saved
      return next
    })
  }

  const handleDeleted = (id: number) => {
    setConfigs((prev) => prev.filter((c) => c.id !== id))
    if (selectedConfigId === id) onSelectedConfigChange(null)
  }

  const selectedConfig = configs.find((c) => c.id === selectedConfigId) ?? null

  return (
    <div className="bg-white rounded-lg border border-gray-200 p-4 mb-4">
      <div className="flex flex-col gap-3">
        <div className="flex items-center gap-2 flex-wrap">
          <Settings2 className="w-4 h-4 text-gray-500" />
          <span className="text-sm font-medium text-gray-700">排课配置</span>
          <Badge variant="secondary" className="text-[10px]">
            {configs.length} 个已保存
          </Badge>
          {!readOnly && (
            <>
              <Button
                variant="outline"
                size="sm"
                onClick={() => setCreateOpen(true)}
                disabled={loading}
              >
                <Plus className="w-3.5 h-3.5 mr-1" />
                新建
              </Button>
              {selectedConfig && (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setEditingConfig(selectedConfig)}
                  disabled={loading}
                  title="编辑当前选中的配置"
                >
                  <Pencil className="w-3.5 h-3.5 mr-1" />
                  编辑
                </Button>
              )}
              {selectedConfig && (
                <DeleteConfigButton config={selectedConfig} onDeleted={handleDeleted} />
              )}
            </>
          )}
          <Button
            variant="ghost"
            size="sm"
            onClick={reload}
            disabled={loading}
            title="刷新配置列表"
            className="ml-auto"
          >
            {loading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : '刷新'}
          </Button>
        </div>

        <div className="flex flex-col sm:flex-row sm:items-center gap-3">
          <ConfigPicker
            configs={configs}
            selectedConfigId={selectedConfigId}
            onChange={onSelectedConfigChange}
            loading={loading}
            disabled={readOnly}
          />
          {selectedConfig && (
            <div className="text-xs text-gray-500 flex items-center gap-2 flex-wrap">
              <span>maxIter={selectedConfig.maxIterations}</span>
              <span>·</span>
              <span>lahc={selectedConfig.lahcWindowSize}</span>
              <span>·</span>
              <span>locked={selectedConfig.lockedSlotIds.length}</span>
              {selectedConfig.solverVersion && (
                <>
                  <span>·</span>
                  <span>ver={selectedConfig.solverVersion}</span>
                </>
              )}
            </div>
          )}
        </div>

        {error && !readOnly && (
          <div className="bg-red-50 border border-red-200 rounded-md p-2 text-sm text-red-700 flex items-start gap-2">
            <AlertTriangle className="w-4 h-4 mt-0.5 shrink-0" />
            <span>{error}</span>
          </div>
        )}
        {!loading && configs.length === 0 && !error && (
          <p className="text-xs text-gray-500">
            暂无已保存配置 — 仍可使用默认参数运行 Preview。
          </p>
        )}
      </div>

      <ConfigFormDialog
        open={createOpen}
        mode="create"
        onOpenChange={setCreateOpen}
        onSaved={handleSaved}
      />
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
