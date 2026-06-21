'use client'

/**
 * L6-E2F — Manual Resolution Section (extracted)
 *
 * Stage: L6-E2F-XLSX-COURSE-SETTING-PREVIEW-COMPONENT-DECOMPOSITION
 *
 * Pure UI presentation. State lives in the top-level orchestrator.
 * Pure refactor: behavior identical to L6-E2E.
 */

import {
  AlertCircle,
  Download,
  FileSpreadsheet,
  ListChecks,
  Loader2,
} from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import {
  type CourseSettingManualResolutionItem,
  type CourseSettingManualResolutionSummary,
  type CourseSettingResolutionStatus,
  applyManualResolutionUpdate,
} from '@/lib/import/course-setting-manual-resolution-l6-e1'
import type {
  CourseSettingResolutionOptionsResponse,
} from '@/lib/import/course-setting-xlsx-client'
import type { ReviewRawMap, SplitCandidate } from './course-setting-ui-types'
import { ResolutionItemRow } from './course-setting-manual-resolution-row'
import { ReviewSummaryCard } from './course-setting-summary-card'

export type ManualResolutionSectionProps = {
  resolutionItems: CourseSettingManualResolutionItem[]
  setResolutionItems: (items: CourseSettingManualResolutionItem[]) => void
  resolutionOptions: CourseSettingResolutionOptionsResponse | null
  resolutionSummary: CourseSettingManualResolutionSummary | null
  resolutionFilter: 'all' | CourseSettingResolutionStatus
  setResolutionFilter: (v: 'all' | CourseSettingResolutionStatus) => void
  expandedResolutionRows: Set<string>
  toggleResolutionRow: (id: string) => void
  filteredResolutionItems: CourseSettingManualResolutionItem[]
  onExportDraft: () => void
  reviewRawMap: ReviewRawMap
  splitCandidatesById: Map<string, SplitCandidate[]>
  partialPlanLoading: boolean
  partialPlanError: string | null
  onGeneratePartialPlan: () => void
}

export function ManualResolutionSection(props: ManualResolutionSectionProps) {
  const {
    resolutionItems,
    setResolutionItems,
    resolutionOptions,
    resolutionSummary,
    resolutionFilter,
    setResolutionFilter,
    expandedResolutionRows,
    toggleResolutionRow,
    filteredResolutionItems,
    onExportDraft,
    reviewRawMap,
    splitCandidatesById,
    partialPlanLoading,
    partialPlanError,
    onGeneratePartialPlan,
  } = props

  const updateItem = (approvalItemId: string, patch: Record<string, unknown>) => {
    const updated = applyManualResolutionUpdate(
      resolutionItems,
      approvalItemId,
      patch as Parameters<typeof applyManualResolutionUpdate>[2],
    )
    setResolutionItems(updated)
  }

  return (
    <div className="border-t-2 border-indigo-200 bg-indigo-50/30 px-4 py-3 space-y-3">
      <h4 className="text-sm font-semibold text-indigo-800 flex items-center gap-2">
        <ListChecks className="w-4 h-4" />
        手动处理（Manual Resolution）
        <Badge variant="outline" className="text-xs font-normal">Resolution Only — 不写数据库</Badge>
      </h4>
      <p className="text-[11px] text-indigo-700">
        对于有阻塞问题的行，可选择已有实体或填写新候选名称。处理结果保存在前端状态中，不会写入数据库。
      </p>

      {/* Summary cards */}
      {resolutionSummary && (
        <div className="grid grid-cols-2 md:grid-cols-5 gap-2">
          <ReviewSummaryCard label="可导入" value={resolutionSummary.importableItems} tone="success" />
          <ReviewSummaryCard label="需处理" value={resolutionSummary.needsResolutionItems} tone="warn" />
          <ReviewSummaryCard label="已忽略" value={resolutionSummary.ignoredItems} tone="muted" />
          <ReviewSummaryCard label="暂不处理" value={resolutionSummary.pendingItems} tone="default" />
          <ReviewSummaryCard label="已手动处理" value={resolutionSummary.manuallyResolvedItems} tone="success" />
        </div>
      )}

      {/* Filter + Export */}
      <div className="flex items-center gap-3 flex-wrap">
        <div className="flex items-center gap-1">
          <Label className="text-[11px] text-gray-600">处理状态</Label>
          <select
            value={resolutionFilter}
            onChange={(e) => setResolutionFilter(e.target.value as 'all' | CourseSettingResolutionStatus)}
            className="border border-gray-300 rounded px-2 py-0.5 text-xs bg-white"
            data-l6e1-filter="status"
          >
            <option value="all">全部</option>
            <option value="importable">可导入</option>
            <option value="needsResolution">需处理</option>
            <option value="ignored">已忽略</option>
            <option value="pending">暂不处理</option>
          </select>
        </div>
        <Button size="sm" variant="outline" onClick={onExportDraft} data-l6e1-action="export-draft">
          <Download className="w-3.5 h-3.5 mr-1" />
          导出处理结果 JSON
        </Button>
      </div>

      {/* L6-E2: Generate partial import plan (no DB write, no apply) */}
      <div className="flex items-center gap-2 flex-wrap pt-2 border-t border-emerald-100">
        <Button
          size="sm"
          onClick={onGeneratePartialPlan}
          disabled={partialPlanLoading}
          className="bg-emerald-600 hover:bg-emerald-700"
          data-l6e2-action="generate-plan"
        >
          {partialPlanLoading ? (
            <>
              <Loader2 className="w-3.5 h-3.5 mr-1 animate-spin" />
              生成中...
            </>
          ) : (
            <>
              <FileSpreadsheet className="w-3.5 h-3.5 mr-1" />
              生成部分导入计划
            </>
          )}
        </Button>
        <span className="text-[11px] text-emerald-700">
          当前仅生成导入计划，不会写入数据库，不会创建教学任务或导入批次。
        </span>
      </div>
      {partialPlanError && (
        <div className="bg-red-50 border border-red-200 rounded-lg p-3 text-sm text-red-700 flex items-start gap-2">
          <AlertCircle className="w-4 h-4 mt-0.5 shrink-0" />
          <span>{partialPlanError}</span>
        </div>
      )}

      {/* Resolution items table */}
      <div className="overflow-x-auto">
        <table className="w-full text-xs">
          <thead className="bg-indigo-50 text-indigo-700">
            <tr>
              <th className="px-2 py-1.5 text-left">审核项ID</th>
              <th className="px-2 py-1.5 text-left">专业</th>
              <th className="px-2 py-1.5 text-left">工作表</th>
              <th className="px-2 py-1.5 text-right">行号</th>
              <th className="px-2 py-1.5 text-left">课程名</th>
              <th className="px-2 py-1.5 text-left">教师</th>
              <th className="px-2 py-1.5 text-left">班级</th>
              <th className="px-2 py-1.5 text-right">周课时</th>
              <th className="px-2 py-1.5 text-left">考试</th>
              <th className="px-2 py-1.5 text-left">备注</th>
              <th className="px-2 py-1.5 text-left">合班备注</th>
              <th className="px-2 py-1.5 text-left">诊断</th>
              <th className="px-2 py-1.5 text-left">建议处理</th>
              <th className="px-2 py-1.5 text-left">状态</th>
              <th className="px-2 py-1.5 text-left">操作</th>
            </tr>
          </thead>
          <tbody>
            {filteredResolutionItems.length === 0 ? (
              <tr>
                <td colSpan={15} className="px-4 py-6 text-center text-gray-400">
                  当前筛选下没有处理项
                </td>
              </tr>
            ) : (
              filteredResolutionItems.map((item) => (
                <ResolutionItemRow
                  key={item.approvalItemId}
                  item={item}
                  resolutionOptions={resolutionOptions}
                  reviewRawMap={reviewRawMap}
                  splitCandidates={splitCandidatesById.get(item.approvalItemId) ?? null}
                  isExpanded={expandedResolutionRows.has(item.approvalItemId)}
                  onToggle={() => toggleResolutionRow(item.approvalItemId)}
                  onUpdate={(patch) => updateItem(item.approvalItemId, patch)}
                />
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  )
}