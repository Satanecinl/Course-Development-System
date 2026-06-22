'use client'

/**
 * L6-E2F — Approval Review Section (extracted)
 *
 * Stage: L6-E2F-XLSX-COURSE-SETTING-PREVIEW-COMPONENT-DECOMPOSITION
 *
 * Pure UI presentation. State lives in the top-level orchestrator.
 * Pure refactor: behavior identical to L6-E2E review section.
 */

import {
  ChevronLeft,
  ChevronRight,
  ChevronsLeft,
  ChevronsRight,
  Download,
  Info,
  ListChecks,
  Search,
} from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  APPROVAL_REVIEW_BLOCKED_OPTIONS,
  APPROVAL_REVIEW_DECISION_OPTIONS,
  APPROVAL_REVIEW_DIAGNOSTIC_LABELS,
  APPROVAL_REVIEW_FILTER_LABELS,
  APPROVAL_REVIEW_SUGGESTED_ACTION_LABELS,
  formatDiagnosticCodeLabel,
  formatMatchStatusLabel,
} from '@/lib/import/course-setting-approval-review-localization'
import type {
  CourseSettingApprovalReviewUiDecisionValue,
  CourseSettingApprovalReviewUiResponse,
  CourseSettingApprovalReviewUiRow,
} from '@/lib/import/course-setting-xlsx-client'
import { toneClass, truncateId } from './course-setting-display-utils'
import { ReviewSummaryCard } from './course-setting-summary-card'
import { ReviewRow } from './course-setting-approval-review-table'

export type ReviewCounters = {
  total: number
  pending: number
  approved: number
  rejected: number
  needsReview: number
}

export type ApprovalReviewSectionProps = {
  reviewResult: CourseSettingApprovalReviewUiResponse
  clientDecisions: Record<string, CourseSettingApprovalReviewUiDecisionValue>
  setClientDecisions: React.Dispatch<
    React.SetStateAction<Record<string, CourseSettingApprovalReviewUiDecisionValue>>
  >
  liveCounters: ReviewCounters | null
  suggestedActionOptions: string[]
  diagnosticCodeOptions: string[]
  filterDecision: 'all' | CourseSettingApprovalReviewUiDecisionValue
  setFilterDecision: (v: 'all' | CourseSettingApprovalReviewUiDecisionValue) => void
  filterBlocked: 'all' | 'blocked' | 'notBlocked'
  setFilterBlocked: (v: 'all' | 'blocked' | 'notBlocked') => void
  filterSuggestedAction: string
  setFilterSuggestedAction: (v: string) => void
  filterDiagnosticCode: string
  setFilterDiagnosticCode: (v: string) => void
  searchText: string
  setSearchText: (v: string) => void
  filteredRows: CourseSettingApprovalReviewUiRow[]
  // L7-A2: pagination props
  totalFilteredCount: number
  currentPage: number
  totalPages: number
  pageSize: number
  onPageChange: (page: number) => void
  onExport: () => void
}

export function ApprovalReviewSection(props: ApprovalReviewSectionProps) {
  const {
    reviewResult,
    clientDecisions,
    setClientDecisions,
    liveCounters,
    suggestedActionOptions,
    diagnosticCodeOptions,
    filterDecision,
    setFilterDecision,
    filterBlocked,
    setFilterBlocked,
    filterSuggestedAction,
    setFilterSuggestedAction,
    filterDiagnosticCode,
    setFilterDiagnosticCode,
    searchText,
    setSearchText,
    filteredRows,
    totalFilteredCount,
    currentPage,
    totalPages,
    pageSize,
    onPageChange,
    onExport,
  } = props

  const s = reviewResult.summary
  const ts = reviewResult.targetSemester

  return (
    <div className="px-4 py-3 border-t space-y-3" data-l6d2-section="review">
      {/* Section header */}
      <div className="flex items-center gap-2">
        <ListChecks className="w-4 h-4 text-indigo-700" />
        <h4 className="text-sm font-semibold text-gray-800">审核模式 (Review Mode)</h4>
        <Badge variant="outline" className="text-[10px] font-normal bg-indigo-50 text-indigo-700 border-indigo-200">
          review-only · dryRunOnly · applyAllowed=false
        </Badge>
      </div>

      {/* Warning banner — explicit no-write reassurance */}
      <div className="bg-indigo-50 border border-indigo-200 rounded-lg p-3 text-sm text-indigo-800 flex items-start gap-2">
        <Info className="w-4 h-4 mt-0.5 shrink-0" />
        <span>当前仅用于人工审核，不会写入数据库，不会创建教学任务或导入批次。</span>
      </div>

      {/* Target semester + package ref summary */}
      <div className="bg-gray-50 border border-gray-200 rounded-lg p-3 text-xs text-gray-700">
        <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
          <div>
            <span className="opacity-70">目标学期:</span> {ts.name}{' '}
            {ts.isActive && (
              <Badge variant="secondary" className="text-[10px] ml-1">
                当前学期
              </Badge>
            )}
          </div>
          <div>
            <span className="opacity-70">学期ID:</span> {ts.id}
          </div>
          <div>
            <span className="opacity-70">包指纹:</span>{' '}
            <span className="font-mono">{truncateId(reviewResult.packageRef.dryRunFingerprintHash, 16)}</span>
          </div>
          <div>
            <span className="opacity-70">源文件:</span> {reviewResult.sourceArtifact.filename}
          </div>
        </div>
      </div>

      {/* Summary cards (6) + autoSafe badge */}
      <div className="grid grid-cols-2 md:grid-cols-6 gap-2">
        <ReviewSummaryCard label="总计" value={s.totalItems} tone="default" />
        <ReviewSummaryCard label="待审核" value={s.pendingItems} tone="muted" />
        <ReviewSummaryCard label="通过" value={s.approvedItems} tone="success" />
        <ReviewSummaryCard label="拒绝" value={s.rejectedItems} tone="danger" />
        <ReviewSummaryCard label="需复核" value={s.needsReviewItems} tone="warn" />
        <ReviewSummaryCard label="阻塞" value={s.blockedItems} tone="danger" />
      </div>
      <div className="text-[11px] text-gray-500">
        自动安全候选：{' '}<Badge variant="outline" className="text-[10px]">{s.autoSafeCandidates}</Badge>
        <span className="ml-2 opacity-70">(仅供参考，不会自动通过)</span>
      </div>

      {/* Live counters + export */}
      {liveCounters && (
        <div className="flex items-center justify-between flex-wrap gap-2 bg-white border border-gray-200 rounded-md p-2">
          <div className="text-xs text-gray-700" data-l6d2-counters>
            共 <span className="font-semibold tabular-nums">{liveCounters.total}</span> 条 /
            待审核 <span className="font-semibold tabular-nums">{liveCounters.pending}</span> /
            通过 <span className="font-semibold tabular-nums">{liveCounters.approved}</span> /
            拒绝 <span className="font-semibold tabular-nums">{liveCounters.rejected}</span> /
            需复核 <span className="font-semibold tabular-nums">{liveCounters.needsReview}</span>
            <span className="ml-2 text-gray-400">
              (筛选结果 {totalFilteredCount} 条，当前显示 {(currentPage - 1) * pageSize + 1}-{Math.min(currentPage * pageSize, totalFilteredCount)} / {totalFilteredCount}，第 {currentPage}/{totalPages} 页)
            </span>
          </div>
          <Button size="sm" variant="outline" onClick={onExport} data-l6d2-action="export">
            <Download className="w-3.5 h-3.5 mr-1" />
            导出审核决策 JSON
          </Button>
        </div>
      )}

      {/* Sticky filter row */}
      <div className="sticky top-0 z-10 bg-white border border-gray-200 rounded-md p-2 flex flex-wrap items-center gap-2">
        <div className="flex items-center gap-1">
          <Label className="text-[11px] text-gray-600">{APPROVAL_REVIEW_FILTER_LABELS.decision}</Label>
          <select
            value={filterDecision}
            onChange={(e) =>
              setFilterDecision(e.target.value as 'all' | CourseSettingApprovalReviewUiDecisionValue)
            }
            className="border border-gray-300 rounded px-2 py-0.5 text-xs bg-white"
            data-l6d2-filter="decision"
          >
            <option value="all">{APPROVAL_REVIEW_FILTER_LABELS.all}</option>
            {APPROVAL_REVIEW_DECISION_OPTIONS.map((opt) => (
              <option key={opt.value} value={opt.value}>
                {opt.label}
              </option>
            ))}
          </select>
        </div>
        <div className="flex items-center gap-1">
          <Label className="text-[11px] text-gray-600">{APPROVAL_REVIEW_FILTER_LABELS.blocked}</Label>
          <select
            value={filterBlocked}
            onChange={(e) => setFilterBlocked(e.target.value as 'all' | 'blocked' | 'notBlocked')}
            className="border border-gray-300 rounded px-2 py-0.5 text-xs bg-white"
            data-l6d2-filter="blocked"
          >
            <option value="all">{APPROVAL_REVIEW_FILTER_LABELS.all}</option>
            {APPROVAL_REVIEW_BLOCKED_OPTIONS.filter((o) => o.value !== 'all').map((opt) => (
              <option key={opt.value} value={opt.value}>
                {opt.label}
              </option>
            ))}
          </select>
        </div>
        <div className="flex items-center gap-1">
          <Label className="text-[11px] text-gray-600">{APPROVAL_REVIEW_FILTER_LABELS.suggestedAction}</Label>
          <select
            value={filterSuggestedAction}
            onChange={(e) => setFilterSuggestedAction(e.target.value)}
            className="border border-gray-300 rounded px-2 py-0.5 text-xs bg-white"
            data-l6d2-filter="suggestedAction"
          >
            <option value="all">{APPROVAL_REVIEW_FILTER_LABELS.all}</option>
            {suggestedActionOptions.map((a) => (
              <option key={a} value={a}>
                {APPROVAL_REVIEW_SUGGESTED_ACTION_LABELS[a] ?? a}
              </option>
            ))}
          </select>
        </div>
        <div className="flex items-center gap-1">
          <Label className="text-[11px] text-gray-600">{APPROVAL_REVIEW_FILTER_LABELS.diagnostic}</Label>
          <select
            value={filterDiagnosticCode}
            onChange={(e) => setFilterDiagnosticCode(e.target.value)}
            className="border border-gray-300 rounded px-2 py-0.5 text-xs bg-white"
            data-l6d2-filter="diagnostic"
          >
            <option value="all">{APPROVAL_REVIEW_FILTER_LABELS.all}</option>
            {diagnosticCodeOptions.map((c) => (
              <option key={c} value={c}>
                {APPROVAL_REVIEW_DIAGNOSTIC_LABELS[c] ?? c}
              </option>
            ))}
          </select>
        </div>
        <div className="flex items-center gap-1 flex-1 min-w-[180px]">
          <Search className="w-3.5 h-3.5 text-gray-400" />
          <Input
            type="text"
            value={searchText}
            onChange={(e) => setSearchText(e.target.value)}
            placeholder={APPROVAL_REVIEW_FILTER_LABELS.searchPlaceholder}
            className="text-xs h-7"
            data-l6d2-filter="search"
          />
        </div>
      </div>

      {/* L7-A2: Pagination controls */}
      <div className="flex items-center justify-between bg-white border border-gray-200 rounded-md p-2">
        <span className="text-[11px] text-gray-500">
          共 {totalFilteredCount} 条审核项，当前显示 {(currentPage - 1) * pageSize + 1}-{Math.min(currentPage * pageSize, totalFilteredCount)} / {totalFilteredCount}
        </span>
        <div className="flex items-center gap-1">
          <Button
            size="sm"
            variant="outline"
            className="text-[10px] h-6 px-2"
            disabled={currentPage <= 1}
            onClick={() => onPageChange(1)}
            data-l7a2-action="first-page"
          >
            <ChevronsLeft className="w-3 h-3" />
          </Button>
          <Button
            size="sm"
            variant="outline"
            className="text-[10px] h-6 px-2"
            disabled={currentPage <= 1}
            onClick={() => onPageChange(currentPage - 1)}
            data-l7a2-action="prev-page"
          >
            <ChevronLeft className="w-3 h-3" />
          </Button>
          <span className="text-[11px] text-gray-600 px-2">
            第 {currentPage} / {totalPages} 页
          </span>
          <Button
            size="sm"
            variant="outline"
            className="text-[10px] h-6 px-2"
            disabled={currentPage >= totalPages}
            onClick={() => onPageChange(currentPage + 1)}
            data-l7a2-action="next-page"
          >
            <ChevronRight className="w-3 h-3" />
          </Button>
          <Button
            size="sm"
            variant="outline"
            className="text-[10px] h-6 px-2"
            disabled={currentPage >= totalPages}
            onClick={() => onPageChange(totalPages)}
            data-l7a2-action="last-page"
          >
            <ChevronsRight className="w-3 h-3" />
          </Button>
        </div>
      </div>

      {/* Review table */}
      <div className="overflow-x-auto">
        <table className="w-full text-xs">
          <thead className="bg-gray-50 text-gray-600">
            <tr>
              <th className="px-2 py-1.5 text-left">审核项ID</th>
              <th className="px-2 py-1.5 text-left">工作表</th>
              <th className="px-2 py-1.5 text-left">行号</th>
              <th className="px-2 py-1.5 text-left">专业</th>
              <th className="px-2 py-1.5 text-left">课程名</th>
              <th className="px-2 py-1.5 text-left">教师</th>
              <th className="px-2 py-1.5 text-left">班级</th>
              <th className="px-2 py-1.5 text-left">周课时</th>
              <th className="px-2 py-1.5 text-left">考试类型</th>
              <th className="px-2 py-1.5 text-left">备注</th>
              <th className="px-2 py-1.5 text-left">合班备注</th>
              <th className="px-2 py-1.5 text-left">诊断</th>
              <th className="px-2 py-1.5 text-left">建议处理</th>
              <th className="px-2 py-1.5 text-left">匹配状态</th>
              <th className="px-2 py-1.5 text-right">置信度</th>
              <th className="px-2 py-1.5 text-left">审核决定</th>
            </tr>
          </thead>
          <tbody>
            {filteredRows.length === 0 ? (
              <tr>
                <td colSpan={16} className="px-4 py-6 text-center text-gray-400">
                  当前筛选下没有审核项
                </td>
              </tr>
            ) : (
              filteredRows.map((row) => (
                <ReviewRow
                  key={row.approvalItemId}
                  row={row}
                  decisionValue={clientDecisions[row.approvalItemId] ?? row.decision.value}
                  onDecisionChange={(v) =>
                    setClientDecisions((prev) => ({ ...prev, [row.approvalItemId]: v }))
                  }
                />
              ))
            )}
          </tbody>
        </table>
      </div>

      {reviewResult.truncatedRows > 0 && (
        <p className="text-[11px] text-gray-500">
          服务端已截断 {reviewResult.truncatedRows} 条记录，导出 JSON 包含全部 {reviewResult.summary.totalItems} 条。
        </p>
      )}
    </div>
  )
}

