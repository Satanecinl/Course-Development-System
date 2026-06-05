'use client'

// src/components/resolved-config-display.tsx
// K21-FIX-G-SOLVER-CONFIG-UI
//
// Read-only display component for SchedulingRun.resultSnapshot.config.
// Used by:
//   - Scheduler preview result panel
//   - Run history detail
// Renders the resolved config sub-object in a compact, scannable form.
// Falls back to a "no snapshot" placeholder for legacy runs.

import { Cpu, Database, Lock, Hash, Calendar, Settings2 } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import type { ResolvedConfigSnapshot, SolverConfigSource } from '@/types/scheduling-config'

const SOURCE_LABEL: Record<SolverConfigSource, string> = {
  CONFIG: 'CONFIG · 来自已保存配置',
  INLINE: 'INLINE · 来自本次覆写',
  DEFAULT: 'DEFAULT · 使用默认参数',
  MIXED: 'MIXED · 配置 + 覆写混合',
}

const SOURCE_VARIANT: Record<SolverConfigSource, 'default' | 'secondary' | 'outline' | 'destructive'> = {
  CONFIG: 'default',
  INLINE: 'secondary',
  DEFAULT: 'outline',
  MIXED: 'destructive',
}

export interface ResolvedConfigDisplayProps {
  config: ResolvedConfigSnapshot | null | undefined
  compact?: boolean
}

/**
 * Display the resolved config snapshot, or a fallback for old runs.
 * Old runs created before K21-FIX-F won't have a `config` sub-object —
 * show a "no snapshot" placeholder without crashing.
 */
export function ResolvedConfigDisplay({ config, compact = false }: ResolvedConfigDisplayProps) {
  if (!config) {
    return (
      <div className="bg-gray-50 border border-gray-200 rounded-lg p-3 text-sm text-gray-500 flex items-center gap-2">
        <Settings2 className="w-4 h-4 text-gray-400" />
        <span>旧运行无配置快照（K21-FIX-F 之前的运行）</span>
      </div>
    )
  }

  const items: Array<{ label: string; value: string; icon?: React.ReactNode }> = [
    { label: '源', value: SOURCE_LABEL[config.source] ?? config.source, icon: <Settings2 className="w-3.5 h-3.5" /> },
    { label: '配置名', value: config.name ?? '(无)', icon: <Database className="w-3.5 h-3.5" /> },
    { label: 'maxIterations', value: String(config.maxIterations), icon: <Cpu className="w-3.5 h-3.5" /> },
    { label: 'lahcWindowSize', value: String(config.lahcWindowSize), icon: <Cpu className="w-3.5 h-3.5" /> },
    { label: 'randomSeed', value: config.randomSeed == null ? '(自动)' : String(config.randomSeed), icon: <Hash className="w-3.5 h-3.5" /> },
    { label: 'lockedSlotIds', value: `${config.lockedSlotIds.length} 个`, icon: <Lock className="w-3.5 h-3.5" /> },
    { label: 'solverVersion', value: config.solverVersion || '(默认)', icon: <Cpu className="w-3.5 h-3.5" /> },
    {
      label: 'snapshotTakenAt',
      value: config.snapshotTakenAt ? new Date(config.snapshotTakenAt).toLocaleString('zh-CN') : '-',
      icon: <Calendar className="w-3.5 h-3.5" />,
    },
  ]

  if (compact) {
    return (
      <div className="flex items-center gap-2 flex-wrap text-xs text-gray-600">
        <Badge variant={SOURCE_VARIANT[config.source]}>{config.source}</Badge>
        <span>·</span>
        <span>maxIter={config.maxIterations}</span>
        <span>lahc={config.lahcWindowSize}</span>
        <span>locked={config.lockedSlotIds.length}</span>
        {config.name && (
          <>
            <span>·</span>
            <span>name={config.name}</span>
          </>
        )}
      </div>
    )
  }

  return (
    <div className="bg-white border border-gray-200 rounded-lg p-3">
      <div className="flex items-center gap-2 mb-3">
        <Settings2 className="w-4 h-4 text-blue-500" />
        <h4 className="text-sm font-medium text-gray-800">Resolved Config (K21-FIX-F 快照)</h4>
        <Badge variant={SOURCE_VARIANT[config.source]} className="text-[10px]">
          {config.source}
        </Badge>
      </div>
      <div className="grid grid-cols-2 md:grid-cols-3 gap-2 text-sm">
        {items.map((it) => (
          <div key={it.label} className="bg-gray-50 rounded p-2 border border-gray-100">
            <div className="flex items-center gap-1.5 text-gray-500 mb-0.5">
              {it.icon}
              <span className="text-xs">{it.label}</span>
            </div>
            <p className="text-sm font-medium text-gray-800 break-all">{it.value}</p>
          </div>
        ))}
      </div>
    </div>
  )
}
