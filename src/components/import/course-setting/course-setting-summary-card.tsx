'use client'

/**
 * L6-E2F — Shared ReviewSummaryCard (extracted)
 *
 * Stage: L6-E2F-XLSX-COURSE-SETTING-PREVIEW-COMPONENT-DECOMPOSITION
 */

import { toneClass } from './course-setting-display-utils'

export function ReviewSummaryCard({
  label,
  value,
  tone,
  extra,
}: {
  label: string
  value: number
  tone: 'default' | 'muted' | 'success' | 'danger' | 'warn'
  extra?: string
}) {
  return (
    <div className={'rounded-lg border p-2 ' + toneClass(tone)}>
      <div className="text-[10px] opacity-80">{label}</div>
      <div className="text-base font-semibold tabular-nums">{value}</div>
      {extra && <div className="text-[10px] opacity-60">{extra}</div>}
    </div>
  )
}