'use client'

/**
 * L6-E2F — Partial Import Plan Section (extracted)
 *
 * Stage: L6-E2F-XLSX-COURSE-SETTING-PREVIEW-COMPONENT-DECOMPOSITION
 *
 * Pure UI presentation. State lives in the top-level orchestrator.
 * Pure refactor from L6-E2E.
 */

import { Download } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { FileSpreadsheet, Info } from 'lucide-react'
import { Label } from '@/components/ui/label'
import type {
  CourseSettingPartialImportPlanResponse,
} from '@/lib/import/course-setting-xlsx-client'
import type { PlanTableFilter } from './course-setting-ui-types'
import { truncateId } from './course-setting-display-utils'
import { ReviewSummaryCard } from './course-setting-summary-card'

export type PartialPlanSectionProps = {
  plan: CourseSettingPartialImportPlanResponse
  filter: PlanTableFilter
  setFilter: (v: PlanTableFilter) => void
  onExport: () => void
}

export function PartialPlanSection({ plan, filter, setFilter, onExport }: PartialPlanSectionProps) {
  const s = plan.summary
  return (
    <div
      className="border-t-2 border-emerald-200 bg-emerald-50/30 px-4 py-3 space-y-3"
      data-l6e2-section="plan"
    >
      <div className="flex items-center gap-2 flex-wrap">
        <FileSpreadsheet className="w-4 h-4 text-emerald-700" />
        <h4 className="text-sm font-semibold text-emerald-800">
          部分导入计划 (Partial Import Plan)
        </h4>
        <Badge
          variant="outline"
          className="text-[10px] font-normal bg-emerald-50 text-emerald-700 border-emerald-200"
        >
          planOnly · dryRunOnly · applyAllowed=false
        </Badge>
        {/* L7-A: show template version when new template is used */}
        {(plan as Record<string, unknown>)['templateVersion'] === 'new-course-setting-a-m-v2' && (
          <Badge
            variant="outline"
            className="text-[10px] font-normal bg-blue-50 text-blue-700 border-blue-200"
          >
            新版 A:M 模板
          </Badge>
        )}
        <span className="text-[11px] text-gray-500 ml-auto">
          {plan.targetSemester.name} (ID {plan.targetSemester.id})
        </span>
      </div>

      <div className="bg-emerald-50 border border-emerald-200 rounded-lg p-3 text-sm text-emerald-800 flex items-start gap-2">
        <Info className="w-4 h-4 mt-0.5 shrink-0" />
        <span>当前仅生成导入计划，不会写入数据库，不会创建教学任务或导入批次。</span>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-5 gap-2">
        <ReviewSummaryCard label="计划导入" value={s.plannedImportRows} tone="success" />
        <ReviewSummaryCard label="跳过" value={s.skippedRows} tone="muted" />
        <ReviewSummaryCard label="仍需处理" value={s.unresolvedRows} tone="warn" />
        <ReviewSummaryCard label="已忽略" value={s.ignoredRows} tone="muted" />
        <ReviewSummaryCard label="阻塞项" value={s.blockingRows} tone="danger" />
      </div>
      <div className="grid grid-cols-2 md:grid-cols-5 gap-2">
        <ReviewSummaryCard label="课程候选" value={s.courseCreateCandidates} tone="default" />
        <ReviewSummaryCard
          label="新课程候选（已确认）"
          value={s.confirmedNewCourseCandidates}
          tone={s.confirmedNewCourseCandidates > 0 ? 'success' : 'muted'}
        />
        <ReviewSummaryCard
          label="课程名缺失行"
          value={s.courseNameMissingRows}
          tone={s.courseNameMissingRows > 0 ? 'danger' : 'muted'}
        />
        <ReviewSummaryCard
          label="课程匹配歧义行"
          value={s.courseAmbiguousRows}
          tone={s.courseAmbiguousRows > 0 ? 'warn' : 'muted'}
        />
        <ReviewSummaryCard
          label="班级候选"
          value={s.classGroupCreateCandidates}
          tone="default"
        />
      </div>
      <div className="grid grid-cols-2 md:grid-cols-5 gap-2">
        <ReviewSummaryCard
          label="教学任务候选"
          value={s.teachingTaskCandidates}
          tone="default"
        />
        <ReviewSummaryCard
          label="任务-班级关联"
          value={s.teachingTaskClassCandidates}
          tone="default"
        />
        <ReviewSummaryCard
          label="教师候选"
          value={s.teacherCreateCandidates}
          tone="muted"
          extra="L6-E1C 处理"
        />
        <ReviewSummaryCard
          label="新课程候选引用行"
          value={s.rowsUsingNewCourseCandidate}
          tone="default"
        />
        <ReviewSummaryCard
          label="重复风险"
          value={s.duplicateRiskRows}
          tone={s.duplicateRiskRows > 0 ? 'warn' : 'muted'}
        />
      </div>
      <div className="flex items-center gap-2 flex-wrap">
        <ReviewSummaryCard
          label="applyReadyForFutureStage"
          value={s.applyReadyForFutureStage ? 1 : 0}
          tone={s.applyReadyForFutureStage ? 'success' : 'muted'}
        />
        <Button
          size="sm"
          variant="outline"
          onClick={onExport}
          data-l6e2-action="export-plan"
        >
          <Download className="w-3.5 h-3.5 mr-1" />
          导出部分导入计划 JSON
        </Button>
      </div>

      <div className="flex items-center gap-2 flex-wrap">
        <Label className="text-[11px] text-gray-600">查看</Label>
        <select
          value={filter}
          onChange={(e) => setFilter(e.target.value as PlanTableFilter)}
          className="border border-gray-300 rounded px-2 py-0.5 text-xs bg-white"
          data-l6e2-filter="view"
        >
          <option value="importable">可导入行 ({plan.plan.importableRows.length})</option>
          <option value="skipped">跳过行 ({plan.plan.skippedRows.length})</option>
          <option value="unresolved">仍需处理 ({plan.plan.unresolvedRows.length})</option>
          <option value="candidates">课程/班级候选 ({plan.plan.createCandidates.courses.length + plan.plan.createCandidates.classGroups.length})</option>
          <option value="duplicates">重复风险 ({plan.plan.duplicateRisks.length})</option>
          <option value="blockers">阻塞项 ({plan.plan.blockers.length})</option>
        </select>
      </div>

      {filter === 'importable' && (
        <PartialPlanImportableTable rows={plan.plan.importableRows} />
      )}
      {filter === 'skipped' && <PartialPlanSkippedTable rows={plan.plan.skippedRows} />}
      {filter === 'unresolved' && (
        <PartialPlanUnresolvedTable rows={plan.plan.unresolvedRows} />
      )}
      {filter === 'candidates' && (
        <PartialPlanCandidatesView
          courses={plan.plan.createCandidates.courses}
          classGroups={plan.plan.createCandidates.classGroups}
        />
      )}
      {filter === 'duplicates' && (
        <PartialPlanDuplicateRisksTable rows={plan.plan.duplicateRisks} />
      )}
      {filter === 'blockers' && <PartialPlanBlockersTable rows={plan.plan.blockers} />}
    </div>
  )
}

// ── Sub-tables ──────────────────────────────────────────────────────────────

function PartialPlanImportableTable({ rows }: { rows: CourseSettingPartialImportPlanResponse['plan']['importableRows'] }) {
  if (rows.length === 0) return <p className="text-[11px] text-gray-500">无可导入行</p>
  return (
    <div className="overflow-x-auto" data-l6e2-table="importable">
      <table className="w-full text-xs">
        <thead className="bg-emerald-50 text-emerald-700">
          <tr>
            <th className="px-2 py-1.5 text-left">审核项ID</th>
            <th className="px-2 py-1.5 text-right">Sheet</th>
            <th className="px-2 py-1.5 text-right">行号</th>
            <th className="px-2 py-1.5 text-left">专业</th>
            <th className="px-2 py-1.5 text-left">课程</th>
            <th className="px-2 py-1.5 text-left">教师</th>
            <th className="px-2 py-1.5 text-left">班级</th>
            <th className="px-2 py-1.5 text-right">周课时</th>
            <th className="px-2 py-1.5 text-left">考试类型</th>
            <th className="px-2 py-1.5 text-left">重复风险</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.approvalItemId} className="border-t hover:bg-emerald-50/30">
              <td className="px-2 py-1.5 font-mono text-[10px]">{truncateId(r.approvalItemId, 14)}</td>
              <td className="px-2 py-1.5 text-right tabular-nums">{r.sheetIndex}</td>
              <td className="px-2 py-1.5 text-right tabular-nums">{r.sourceRowIndex}</td>
              <td className="px-2 py-1.5 text-[10px]">{r.majorNameRaw ?? '—'}</td>
              <td className="px-2 py-1.5">
                {r.coursePlan.mode === 'useExistingCourse' && r.coursePlan.courseId != null
                  ? <span className="text-green-700">已有 (ID:{r.coursePlan.courseId})</span>
                  : r.coursePlan.mode === 'createCourse'
                    ? r.coursePlan.createCourseCandidate?.confirmed
                      ? <span className="text-blue-700" data-l6e2g-plan-course="confirmed">新候选（已确认）</span>
                      : <span className="text-amber-700" data-l6e2g-plan-course="unconfirmed">新候选（未确认）</span>
                    : r.plannedCourseAction === 'createCandidate'
                      ? <span className="text-blue-700">新候选</span>
                      : <span className="text-gray-400">—</span>}
              </td>
              <td className="px-2 py-1.5">
                {r.plannedTeacherAction === 'useExisting' && r.resolvedTeacherId != null
                  ? <span className="text-green-700">已有 (ID:{r.resolvedTeacherId})</span>
                  : r.plannedTeacherAction === 'allowBlank'
                    ? <span className="text-gray-500">允许暂缺</span>
                    : r.plannedTeacherAction === 'unresolved_no_create_in_l6_e2'
                      ? <span className="text-amber-700">L6-E2 不创建</span>
                      : <span className="text-gray-400">—</span>}
              </td>
              <td className="px-2 py-1.5">
                {r.plannedClassGroupAction === 'useExisting'
                  ? <span className="text-green-700">已有 ({r.resolvedClassGroupIds.length})</span>
                  : r.plannedClassGroupAction === 'createCandidate'
                    ? <span className="text-blue-700">新候选 ({r.plannedClassGroupCandidateNames.length})</span>
                    : <span className="text-gray-400">—</span>}
              </td>
              <td className="px-2 py-1.5 text-right tabular-nums">{r.weeklyHours ?? '-'}</td>
              <td className="px-2 py-1.5">{r.examType ?? '-'}</td>
              <td className="px-2 py-1.5">
                <Badge variant="outline" className="text-[10px]">{r.duplicateRisk}</Badge>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

function PartialPlanSkippedTable({ rows }: { rows: CourseSettingPartialImportPlanResponse['plan']['skippedRows'] }) {
  if (rows.length === 0) return <p className="text-[11px] text-gray-500">无跳过行</p>
  return (
    <div className="overflow-x-auto" data-l6e2-table="skipped">
      <table className="w-full text-xs">
        <thead className="bg-gray-50 text-gray-700">
          <tr>
            <th className="px-2 py-1.5 text-left">审核项ID</th>
            <th className="px-2 py-1.5 text-right">Sheet</th>
            <th className="px-2 py-1.5 text-right">行号</th>
            <th className="px-2 py-1.5 text-left">原因</th>
            <th className="px-2 py-1.5 text-left">备注</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.approvalItemId} className="border-t">
              <td className="px-2 py-1.5 font-mono text-[10px]">{truncateId(r.approvalItemId, 14)}</td>
              <td className="px-2 py-1.5 text-right tabular-nums">{r.sheetIndex}</td>
              <td className="px-2 py-1.5 text-right tabular-nums">{r.sourceRowIndex}</td>
              <td className="px-2 py-1.5">{r.skipReason}</td>
              <td className="px-2 py-1.5 text-gray-500">{r.note ?? '-'}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

function PartialPlanUnresolvedTable({ rows }: { rows: CourseSettingPartialImportPlanResponse['plan']['unresolvedRows'] }) {
  if (rows.length === 0) return <p className="text-[11px] text-gray-500">无未处理行</p>
  return (
    <div className="overflow-x-auto" data-l6e2-table="unresolved">
      <table className="w-full text-xs">
        <thead className="bg-amber-50 text-amber-700">
          <tr>
            <th className="px-2 py-1.5 text-left">审核项ID</th>
            <th className="px-2 py-1.5 text-right">Sheet</th>
            <th className="px-2 py-1.5 text-right">行号</th>
            <th className="px-2 py-1.5 text-left">未处理原因</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.approvalItemId} className="border-t">
              <td className="px-2 py-1.5 font-mono text-[10px]">{truncateId(r.approvalItemId, 14)}</td>
              <td className="px-2 py-1.5 text-right tabular-nums">{r.sheetIndex}</td>
              <td className="px-2 py-1.5 text-right tabular-nums">{r.sourceRowIndex}</td>
              <td className="px-2 py-1.5">
                <div className="flex flex-wrap gap-1">
                  {r.unresolvedReasons.map((reason) => (
                    <Badge key={reason} variant="outline" className="text-[10px] bg-amber-50 text-amber-700 border-amber-200">
                      {reason}
                    </Badge>
                  ))}
                </div>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

function PartialPlanCandidatesView({
  courses,
  classGroups,
}: {
  courses: CourseSettingPartialImportPlanResponse['plan']['createCandidates']['courses']
  classGroups: CourseSettingPartialImportPlanResponse['plan']['createCandidates']['classGroups']
}) {
  if (courses.length === 0 && classGroups.length === 0) {
    return <p className="text-[11px] text-gray-500">无创建候选</p>
  }
  return (
    <div className="space-y-3" data-l6e2-table="candidates">
      <div>
        <h5 className="text-xs font-semibold text-emerald-800 mb-1">
          课程候选 (Course) — {courses.length}
        </h5>
        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead className="bg-emerald-50 text-emerald-700">
              <tr>
                <th className="px-2 py-1.5 text-left">candidateKey</th>
                <th className="px-2 py-1.5 text-left">候选名称</th>
                <th className="px-2 py-1.5 text-right">关联行数</th>
                <th className="px-2 py-1.5 text-right">已确认行数</th>
                <th className="px-2 py-1.5 text-right">置信度</th>
              </tr>
            </thead>
            <tbody>
              {courses.map((c) => (
                <tr key={c.candidateKey} className="border-t" data-l6e2g-candidate-row={c.candidateKey}>
                  <td className="px-2 py-1.5 font-mono text-[10px]">{c.candidateKey}</td>
                  <td className="px-2 py-1.5">{c.candidateName}</td>
                  <td className="px-2 py-1.5 text-right tabular-nums">{c.approvalItemIds.length}</td>
                  <td className="px-2 py-1.5 text-right tabular-nums">
                    {c.confirmedCount > 0 ? (
                      <span className="text-blue-700">{c.confirmedCount}</span>
                    ) : (
                      <span className="text-gray-400">0</span>
                    )}
                  </td>
                  <td className="px-2 py-1.5 text-right tabular-nums">{c.confidence.toFixed(2)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
      <div>
        <h5 className="text-xs font-semibold text-emerald-800 mb-1">
          班级候选 (ClassGroup) — {classGroups.length}
        </h5>
        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead className="bg-emerald-50 text-emerald-700">
              <tr>
                <th className="px-2 py-1.5 text-left">candidateKey</th>
                <th className="px-2 py-1.5 text-left">候选名称</th>
                <th className="px-2 py-1.5 text-right">关联行数</th>
                <th className="px-2 py-1.5 text-right">学生数</th>
              </tr>
            </thead>
            <tbody>
              {classGroups.map((c) => (
                <tr key={c.candidateKey} className="border-t">
                  <td className="px-2 py-1.5 font-mono text-[10px]">{c.candidateKey}</td>
                  <td className="px-2 py-1.5">{c.candidateName}</td>
                  <td className="px-2 py-1.5 text-right tabular-nums">{c.approvalItemIds.length}</td>
                  <td className="px-2 py-1.5 text-right tabular-nums">{c.studentCount ?? '-'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}

function PartialPlanDuplicateRisksTable({ rows }: { rows: CourseSettingPartialImportPlanResponse['plan']['duplicateRisks'] }) {
  if (rows.length === 0) return <p className="text-[11px] text-gray-500">无重复风险</p>
  return (
    <div className="overflow-x-auto" data-l6e2-table="duplicates">
      <table className="w-full text-xs">
        <thead className="bg-amber-50 text-amber-700">
          <tr>
            <th className="px-2 py-1.5 text-left">审核项ID</th>
            <th className="px-2 py-1.5 text-right">Sheet</th>
            <th className="px-2 py-1.5 text-right">行号</th>
            <th className="px-2 py-1.5 text-left">风险类型</th>
            <th className="px-2 py-1.5 text-left">已存在任务</th>
            <th className="px-2 py-1.5 text-left">原因</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.approvalItemId} className="border-t">
              <td className="px-2 py-1.5 font-mono text-[10px]">{truncateId(r.approvalItemId, 14)}</td>
              <td className="px-2 py-1.5 text-right tabular-nums">{r.sheetIndex}</td>
              <td className="px-2 py-1.5 text-right tabular-nums">{r.sourceRowIndex}</td>
              <td className="px-2 py-1.5">
                <Badge variant="outline" className="text-[10px] bg-amber-50 text-amber-700 border-amber-200">
                  {r.kind}
                </Badge>
              </td>
              <td className="px-2 py-1.5 tabular-nums">{r.existingTeachingTaskId ?? '-'}</td>
              <td className="px-2 py-1.5 text-gray-600">{r.reason}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

function PartialPlanBlockersTable({ rows }: { rows: CourseSettingPartialImportPlanResponse['plan']['blockers'] }) {
  if (rows.length === 0) return <p className="text-[11px] text-gray-500">无阻塞项</p>
  return (
    <div className="overflow-x-auto" data-l6e2-table="blockers">
      <table className="w-full text-xs">
        <thead className="bg-red-50 text-red-700">
          <tr>
            <th className="px-2 py-1.5 text-left">审核项ID</th>
            <th className="px-2 py-1.5 text-right">Sheet</th>
            <th className="px-2 py-1.5 text-right">行号</th>
            <th className="px-2 py-1.5 text-left">原因</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.approvalItemId} className="border-t">
              <td className="px-2 py-1.5 font-mono text-[10px]">{truncateId(r.approvalItemId, 14)}</td>
              <td className="px-2 py-1.5 text-right tabular-nums">{r.sheetIndex}</td>
              <td className="px-2 py-1.5 text-right tabular-nums">{r.sourceRowIndex}</td>
              <td className="px-2 py-1.5">
                <Badge variant="outline" className="text-[10px] bg-red-50 text-red-700 border-red-200">
                  {r.reason}
                </Badge>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}