'use client'

/**
 * L6-E2F — Approval Review Row (extracted)
 *
 * Stage: L6-E2F-XLSX-COURSE-SETTING-PREVIEW-COMPONENT-DECOMPOSITION
 *
 * Pure UI presentation for a single review row. State lives in the
 * top-level orchestrator. Pure refactor: behavior identical to L6-E2E.
 */

import { Badge } from '@/components/ui/badge'
import {
  APPROVAL_REVIEW_DECISION_OPTIONS,
  formatConfidence,
  formatDiagnosticCodeLabel,
  formatMatchStatusLabel,
  formatSuggestedActionLabel,
} from '@/lib/import/course-setting-approval-review-localization'
import type {
  CourseSettingApprovalReviewUiDecisionValue,
  CourseSettingApprovalReviewUiRow,
} from '@/lib/import/course-setting-xlsx-client'
import { truncateId } from './course-setting-display-utils'

export type ReviewRowProps = {
  row: CourseSettingApprovalReviewUiRow
  decisionValue: CourseSettingApprovalReviewUiDecisionValue
  onDecisionChange: (v: CourseSettingApprovalReviewUiDecisionValue) => void
}

export function ReviewRow({ row, decisionValue, onDecisionChange }: ReviewRowProps) {
  const truncatedId = truncateId(row.approvalItemId, 14)
  const matchStatus = formatMatchStatusLabel(
    [row.match.taskMatchStatus, row.match.courseMatchStatus]
      .filter((v): v is string => !!v)
      .join(' / ') || '-'
  )
  return (
    <tr className={'border-t hover:bg-gray-50 ' + (row.flags.blocked ? 'bg-red-50/40' : '')}>
      <td className="px-2 py-1.5 font-mono text-[10px]" title={row.approvalItemId}>
        {truncatedId}
      </td>
      <td className="px-2 py-1.5 text-[10px] max-w-[80px] truncate" title={row.source.sheetName ?? row.source.sheetNameHash}>
        {row.source.sheetName ?? row.source.sheetNameHash.slice(0, 8)}
      </td>
      <td className="px-2 py-1.5 tabular-nums">{row.source.sourceRowIndex}</td>
      <td className="px-2 py-1.5 text-[10px] max-w-[100px] truncate" title={(row.raw as Record<string, unknown>)['majorName'] as string ?? ''}>
        {(row.raw as Record<string, unknown>)['majorName'] as string ?? '—'}
      </td>
      <td className="px-2 py-1.5 text-[11px] max-w-[120px] truncate" title={row.raw.courseName ?? ''}>
        {row.raw.courseName ?? '-'}
      </td>
      <td className="px-2 py-1.5 text-[11px] max-w-[140px] truncate" title={row.raw.teacherText ?? ''}>
        {row.raw.teacherText ?? '-'}
      </td>
      <td className="px-2 py-1.5 text-[11px] max-w-[140px] truncate" title={row.raw.classText ?? ''}>
        {row.raw.classText ?? '-'}
      </td>
      <td className="px-2 py-1.5 tabular-nums">{row.raw.weeklyHoursText ?? '-'}</td>
      <td className="px-2 py-1.5 text-[11px] max-w-[80px] truncate" title={row.raw.examTypeText ?? ''}>
        {row.raw.examTypeText ?? '-'}
      </td>
      <td className="px-2 py-1.5 text-[11px] max-w-[120px] truncate" title={row.raw.remark ?? ''}>
        {row.raw.remark ?? '-'}
      </td>
      <td className="px-2 py-1.5 text-[11px] max-w-[120px] truncate" title={row.raw.mergeRemark ?? ''}>
        {row.raw.mergeRemark ?? '-'}
      </td>
      <td className="px-2 py-1.5">
        <div className="flex flex-wrap gap-1 max-w-[160px]">
          {row.match.diagnosticCodes.length === 0 ? (
            <span className="text-gray-400">-</span>
          ) : (
            row.match.diagnosticCodes.map((code) => (
              <Badge
                key={code}
                variant="outline"
                className="text-[10px] bg-red-50 text-red-600 border-red-200"
              >
                {formatDiagnosticCodeLabel(code)}
              </Badge>
            ))
          )}
        </div>
      </td>
      <td className="px-2 py-1.5 text-[10px]" title={row.match.suggestedAction}>
        {formatSuggestedActionLabel(row.match.suggestedAction)}
      </td>
      <td className="px-2 py-1.5">
        <Badge variant="outline" className="text-[10px] bg-gray-50 text-gray-700 border-gray-300">
          {matchStatus}
        </Badge>
      </td>
      <td className="px-2 py-1.5 text-right tabular-nums">
        <span className={row.match.confidence < 0.8 ? 'text-amber-600 font-semibold' : ''}>
          {formatConfidence(row.match.confidence)}
        </span>
      </td>
      <td className="px-2 py-1.5">
        <select
          value={decisionValue}
          onChange={(e) =>
            onDecisionChange(e.target.value as CourseSettingApprovalReviewUiDecisionValue)
          }
          className="border border-gray-300 rounded px-1.5 py-0.5 text-[11px] bg-white"
          data-l6d2-decision={row.approvalItemId}
        >
          {APPROVAL_REVIEW_DECISION_OPTIONS.map((opt) => (
            <option key={opt.value} value={opt.value}>
              {opt.label}
            </option>
          ))}
        </select>
      </td>
    </tr>
  )
}