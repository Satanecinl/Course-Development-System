// src/components/score-breakdown-display.tsx
// K22-L2-SCHEDULER-RESULT-BREAKDOWN-UI
//
// Read-only display of score breakdown (HC1-HC6, SC1-SC10, MIN_PERT)
// for both the live preview result and the history run detail.
//
// Backwards compatible: receives scoreBreakdown data with the shape
// produced by src/lib/scheduler/score-breakdown.ts, OR `null` for
// legacy runs. Falls back to "无 breakdown 数据" placeholder when null.

'use client'

import { useState } from 'react'
import {
  AlertTriangle,
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  Info,
  ShieldAlert,
  TrendingDown,
  XCircle,
  Calendar,
  User,
  Users,
  MapPin,
} from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import type {
  ScoreBreakdown,
  ConstraintStat,
  BusinessQualityCards,
  TopIssue,
  ResultSnapshotScoreBreakdown,
} from '@/lib/scheduler/score-breakdown'
import { readPersistedBreakdown } from '@/lib/scheduler/score-breakdown'

// ── Severity mapping ──

type Severity = 'pass' | 'info' | 'warn' | 'block'

function severityVariant(s: Severity): 'default' | 'secondary' | 'destructive' | 'outline' {
  if (s === 'block') return 'destructive'
  if (s === 'warn') return 'secondary'
  if (s === 'info') return 'outline'
  return 'default'
}

function severityLabel(s: Severity): string {
  if (s === 'block') return '阻断'
  if (s === 'warn') return '注意'
  if (s === 'info') return '提示'
  return '通过'
}

function severityTextClass(s: Severity): string {
  if (s === 'block') return 'text-red-600'
  if (s === 'warn') return 'text-amber-600'
  if (s === 'info') return 'text-blue-600'
  return 'text-green-600'
}

function severityBgClass(s: Severity): string {
  if (s === 'block') return 'bg-red-50 border-red-200'
  if (s === 'warn') return 'bg-amber-50 border-amber-200'
  if (s === 'info') return 'bg-blue-50 border-blue-200'
  return 'bg-green-50 border-green-200'
}

// ── Component props ──

interface ScoreBreakdownDisplayProps {
  /** Persisted wire shape from resultSnapshot.scoreBreakdown, or null for legacy runs. */
  breakdown: ResultSnapshotScoreBreakdown | null
  /** Which side to highlight as "primary" (default 'AFTER'). Used to show before/after tabs. */
  defaultSide?: 'BEFORE' | 'AFTER'
  /** Optional label override for the section header. */
  title?: string
}

export function ScoreBreakdownDisplay({
  breakdown,
  defaultSide = 'AFTER',
  title = '质量 Breakdown',
}: ScoreBreakdownDisplayProps) {
  const [side, setSide] = useState<'BEFORE' | 'AFTER'>(defaultSide)

  if (!breakdown) {
    return (
      <div className="bg-gray-50 border border-gray-200 rounded-lg p-4">
        <div className="flex items-center gap-2">
          <Info className="w-4 h-4 text-gray-400" />
          <p className="text-sm text-gray-500">
            旧运行无 breakdown 数据。该 run 在 K22-L2 实施前创建，未持久化每约束详情。
          </p>
        </div>
      </div>
    )
  }

  const beforeBd = readPersistedBreakdown(breakdown.before, 'BEFORE')
  const afterBd = readPersistedBreakdown(breakdown.after, 'AFTER')
  if (!beforeBd || !afterBd) {
    return (
      <div className="bg-red-50 border border-red-200 rounded-lg p-4">
        <div className="flex items-center gap-2">
          <XCircle className="w-4 h-4 text-red-500" />
          <p className="text-sm text-red-600">breakdown 数据格式异常，无法渲染。</p>
        </div>
      </div>
    )
  }

  const active = side === 'BEFORE' ? beforeBd : afterBd

  return (
    <div className="space-y-4">
      {/* Header with before/after toggle */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <ShieldAlert className="w-4 h-4 text-blue-500" />
          <h3 className="font-semibold text-gray-900">{title}</h3>
          <Badge variant="outline" className="text-[10px]">v{breakdown.version}</Badge>
        </div>
        <div className="flex items-center gap-1 bg-gray-100 rounded-md p-0.5">
          <button
            onClick={() => setSide('BEFORE')}
            className={`px-3 py-1 text-xs font-medium rounded transition-colors ${
              side === 'BEFORE' ? 'bg-white shadow-sm text-gray-900' : 'text-gray-500 hover:text-gray-700'
            }`}
          >
            优化前
          </button>
          <button
            onClick={() => setSide('AFTER')}
            className={`px-3 py-1 text-xs font-medium rounded transition-colors ${
              side === 'AFTER' ? 'bg-white shadow-sm text-gray-900' : 'text-gray-500 hover:text-gray-700'
            }`}
          >
            优化后
          </button>
        </div>
      </div>

      {/* Score Summary */}
      <ScoreSummaryView breakdown={active} side={side} />

      {/* Business Quality Cards */}
      <BusinessQualityCardsView cards={active.businessCards} />

      {/* Constraint Breakdown Table */}
      <ConstraintBreakdownTableView breakdown={active} />

      {/* Top Issues */}
      <TopIssuesView issues={active.topIssues} />
    </div>
  )
}

// ── Score Summary ──

function ScoreSummaryView({ breakdown, side }: { breakdown: ScoreBreakdown; side: 'BEFORE' | 'AFTER' }) {
  const allHardOk = breakdown.hardScore === 0
  const allHardBlocked = breakdown.hardScore < 0
  const totalIssues = breakdown.totalDetails

  return (
    <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
      <div className={`rounded-lg border p-3 ${allHardOk ? 'bg-green-50 border-green-200' : allHardBlocked ? 'bg-red-50 border-red-200' : 'bg-gray-50 border-gray-200'}`}>
        <div className="flex items-center gap-1.5 text-xs text-gray-500 mb-1">
          {allHardOk ? <CheckCircle2 className="w-3.5 h-3.5 text-green-500" /> : <XCircle className="w-3.5 h-3.5 text-red-500" />}
          Hard 可行性
        </div>
        <p className={`text-lg font-bold ${allHardOk ? 'text-green-600' : 'text-red-600'}`}>
          {allHardOk ? '可行' : '硬冲突'}
        </p>
        <p className="text-xs text-gray-500 mt-0.5">hardScore = {breakdown.hardScore}</p>
      </div>

      <div className="rounded-lg border border-gray-200 p-3 bg-white">
        <div className="flex items-center gap-1.5 text-xs text-gray-500 mb-1">
          <TrendingDown className="w-3.5 h-3.5 text-gray-400" />
          Soft Score
        </div>
        <p className={`text-lg font-bold ${severityTextClass(breakdown.softScore < -200 ? 'warn' : 'info')}`}>
          {breakdown.softScore}
        </p>
        <p className="text-xs text-gray-500 mt-0.5">softScore（越接近 0 越好）</p>
      </div>

      <div className="rounded-lg border border-gray-200 p-3 bg-white">
        <div className="flex items-center gap-1.5 text-xs text-gray-500 mb-1">
          <AlertTriangle className="w-3.5 h-3.5 text-gray-400" />
          违反总数
        </div>
        <p className="text-lg font-bold text-gray-700">{totalIssues}</p>
        <p className="text-xs text-gray-500 mt-0.5">个 {side === 'BEFORE' ? '初始' : '最终'}约束违反</p>
      </div>

      <div className="rounded-lg border border-gray-200 p-3 bg-white">
        <div className="flex items-center gap-1.5 text-xs text-gray-500 mb-1">
          <Info className="w-3.5 h-3.5 text-gray-400" />
          来源
        </div>
        <p className="text-lg font-bold text-gray-700">{side === 'BEFORE' ? '初始' : '优化后'}</p>
        <p className="text-xs text-gray-500 mt-0.5">{side === 'BEFORE' ? 'Solver 之前' : 'Solver 之后'}</p>
      </div>
    </div>
  )
}

// ── Business Quality Cards ──

function BusinessQualityCardsView({ cards }: { cards: BusinessQualityCards }) {
  const renderCard = (
    label: string,
    icon: React.ReactNode,
    stat: { triggerCount: number; totalPenalty: number; status: Severity; topMessage?: string },
    unit: string = '次',
  ) => {
    const sev = stat.status
    return (
      <div className={`rounded-lg border p-3 ${severityBgClass(sev)}`}>
        <div className="flex items-center justify-between mb-1.5">
          <div className="flex items-center gap-1.5 text-xs text-gray-600">
            {icon}
            <span className="font-medium">{label}</span>
          </div>
          <Badge variant={severityVariant(sev)} className="text-[10px]">
            {severityLabel(sev)}
          </Badge>
        </div>
        <p className={`text-2xl font-bold ${severityTextClass(sev)}`}>
          {stat.triggerCount}
          <span className="text-sm font-normal text-gray-500 ml-1">{unit}</span>
        </p>
        <p className="text-xs text-gray-500 mt-1">扣分 {stat.totalPenalty}</p>
        {stat.topMessage && (
          <p className="text-[11px] text-gray-600 mt-1.5 line-clamp-2" title={stat.topMessage}>
            {stat.topMessage}
          </p>
        )}
      </div>
    )
  }

  return (
    <div>
      <div className="flex items-center gap-2 mb-2">
        <Info className="w-4 h-4 text-gray-500" />
        <h4 className="text-sm font-medium text-gray-700">业务质量卡片</h4>
      </div>
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3">
        {renderCard('周末排课', <Calendar className="w-3.5 h-3.5" />, cards.weekend, '次')}
        {renderCard('林校违规 HC6', <MapPin className="w-3.5 h-3.5" />, cards.linxiaoAutomotive.hc6, '次')}
        {renderCard('汽车未入林校 SC6', <MapPin className="w-3.5 h-3.5" />, cards.linxiaoAutomotive.sc6, '次')}
        {renderCard('教师均衡 SC5', <User className="w-3.5 h-3.5" />, cards.teacherDayBalance, '个教师')}
        {renderCard('班级空洞 SC8', <Users className="w-3.5 h-3.5" />, cards.classGap, '对')}
        {renderCard('教室稳定 SC9', <MapPin className="w-3.5 h-3.5" />, cards.roomStability, '个 task')}
        {renderCard('容量利用 SC10', <TrendingDown className="w-3.5 h-3.5" />, cards.capacityUtilization, '次')}
        {renderCard('最小扰动 MIN_PERT', <TrendingDown className="w-3.5 h-3.5" />, cards.minPerturbation, '个 slot')}
      </div>
    </div>
  )
}

// ── Constraint Breakdown Table ──

function ConstraintBreakdownTableView({ breakdown }: { breakdown: ScoreBreakdown }) {
  const [expanded, setExpanded] = useState(false)

  return (
    <div>
      <div className="flex items-center justify-between mb-2">
        <div className="flex items-center gap-2">
          <AlertTriangle className="w-4 h-4 text-gray-500" />
          <h4 className="text-sm font-medium text-gray-700">约束详情 (HC1-HC6 / SC1-SC10 / MIN_PERT)</h4>
          <Badge variant="outline" className="text-[10px]">{breakdown.constraints.length} 条</Badge>
        </div>
        <button
          onClick={() => setExpanded(!expanded)}
          className="flex items-center gap-1 text-xs text-blue-600 hover:text-blue-800"
        >
          {expanded ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
          {expanded ? '收起' : '展开详情'}
        </button>
      </div>

      <div className="overflow-x-auto bg-white rounded border border-gray-200">
        <table className="w-full text-sm">
          <thead>
            <tr className="bg-gray-50 text-gray-500 text-xs border-b border-gray-200">
              <th className="text-left p-2 font-medium">约束</th>
              <th className="text-left p-2 font-medium">类型</th>
              <th className="text-center p-2 font-medium">触发</th>
              <th className="text-right p-2 font-medium">总扣分</th>
              <th className="text-right p-2 font-medium">单次</th>
              <th className="text-center p-2 font-medium">状态</th>
              <th className="text-left p-2 font-medium">说明</th>
            </tr>
          </thead>
          <tbody>
            {breakdown.constraints.map((c) => (
              <ConstraintRow key={c.id} stat={c} expanded={expanded} />
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}

function ConstraintRow({ stat, expanded }: { stat: ConstraintStat; expanded: boolean }) {
  const sev = stat.severity
  return (
    <>
      <tr className="border-t border-gray-100 hover:bg-gray-50">
        <td className="p-2">
          <div className="flex items-center gap-1.5">
            <span className="font-mono text-xs font-semibold text-gray-700">{stat.id}</span>
            <code className="text-[10px] text-gray-400">{stat.type}</code>
          </div>
        </td>
        <td className="p-2">
          <Badge variant={stat.level === 'HARD' ? 'destructive' : 'secondary'} className="text-[10px]">
            {stat.level}
          </Badge>
        </td>
        <td className="p-2 text-center">
          <span className={`font-mono text-xs font-semibold ${stat.triggerCount > 0 ? severityTextClass(sev) : 'text-gray-400'}`}>
            {stat.triggerCount}
          </span>
        </td>
        <td className="p-2 text-right">
          <span className={`font-mono text-xs ${stat.totalPenalty < 0 ? severityTextClass(sev) : 'text-gray-400'}`}>
            {stat.totalPenalty}
          </span>
        </td>
        <td className="p-2 text-right">
          <span className="font-mono text-xs text-gray-500">{stat.penalty}</span>
        </td>
        <td className="p-2 text-center">
          <Badge variant={severityVariant(sev)} className="text-[10px]">
            {severityLabel(sev)}
          </Badge>
        </td>
        <td className="p-2 text-xs text-gray-600">{stat.description}</td>
      </tr>
      {expanded && stat.topExamples.length > 0 && (
        <tr className="bg-gray-50/50">
          <td colSpan={7} className="p-2 pl-6">
            <div className="space-y-0.5">
              <p className="text-[10px] text-gray-400 uppercase tracking-wider">样例</p>
              {stat.topExamples.map((ex, i) => (
                <p key={i} className="text-xs text-gray-600 font-mono">
                  {ex.slotId != null && <span className="text-gray-400">slot={ex.slotId} </span>}
                  {ex.relatedSlotId != null && <span className="text-gray-400">related={ex.relatedSlotId} </span>}
                  {ex.message ?? '(no message)'}
                </p>
              ))}
            </div>
          </td>
        </tr>
      )}
    </>
  )
}

// ── Top Issues ──

function TopIssuesView({ issues }: { issues: TopIssue[] }) {
  if (issues.length === 0) {
    return (
      <div className="bg-green-50 border border-green-200 rounded-lg p-3">
        <div className="flex items-center gap-2">
          <CheckCircle2 className="w-4 h-4 text-green-500" />
          <p className="text-sm text-green-700">无任何约束违反。排课结果完全符合所有硬约束与软约束目标。</p>
        </div>
      </div>
    )
  }

  return (
    <div>
      <div className="flex items-center gap-2 mb-2">
        <ShieldAlert className="w-4 h-4 text-amber-500" />
        <h4 className="text-sm font-medium text-gray-700">Top 质量 Issues</h4>
        <Badge variant="outline" className="text-[10px]">前 {issues.length}</Badge>
      </div>
      <div className="space-y-1.5">
        {issues.map((issue) => (
          <div
            key={issue.rank}
            className={`rounded-md border p-2.5 ${severityBgClass(issue.severity)}`}
          >
            <div className="flex items-start gap-2">
              <span className={`text-xs font-mono font-bold ${severityTextClass(issue.severity)} mt-0.5`}>
                #{issue.rank}
              </span>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-1.5 flex-wrap">
                  <Badge variant={issue.level === 'HARD' ? 'destructive' : 'secondary'} className="text-[10px]">
                    {issue.level}
                  </Badge>
                  <span className="text-sm font-medium text-gray-800">{issue.title}</span>
                </div>
                <p className="text-xs text-gray-600 mt-1 line-clamp-2" title={issue.detail}>
                  {issue.detail}
                </p>
              </div>
              <span className={`text-sm font-mono font-semibold ${severityTextClass(issue.severity)} shrink-0`}>
                {issue.totalPenalty}
              </span>
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
