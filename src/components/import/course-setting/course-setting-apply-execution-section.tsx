'use client'

/**
 * L7-F — Apply Execution Section (extracted)
 *
 * Stage: L7-F-XLSX-COURSE-SETTING-NEW-TEMPLATE-PARTIAL-IMPORT-EXECUTION
 *
 * Pure UI presentation. State lives in the top-level orchestrator.
 * Renders a controlled write panel with:
 *   - Confirm token input (disabled until plan exists & importableRows > 0)
 *   - Risk warning text (what will / will not be created)
 *   - Apply button (disabled until confirm token matches pattern)
 *   - Post-apply result display (summary, audit, backup path, rollback note)
 */

import { useState } from 'react'
import {
  AlertTriangle,
  CheckCircle2,
  Info,
  PlayCircle,
  ShieldCheck,
  ShieldAlert,
} from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import type {
  CourseSettingPartialImportPlanResponse,
  CourseSettingApplyResponse,
} from '@/lib/import/course-setting-xlsx-client'
import { ReviewSummaryCard } from './course-setting-summary-card'

// ── Types ────────────────────────────────────────────────────────────────────

export type ApplyExecutionSectionProps = {
  plan: CourseSettingPartialImportPlanResponse
  targetSemesterId: number
  onApply: (confirmToken: string) => void
  onDryRun: () => void
  applyLoading: boolean
  applyResult: CourseSettingApplyResponse | null
  applyError: string | null
}

// ── Constants ────────────────────────────────────────────────────────────────

const CONFIRM_TOKEN_PATTERN = /^APPLY_XLSX_COURSE_SETTING_\d+$/

const RISK_WARNINGS = [
  { label: '会创建新课程', enabled: true },
  { label: '会创建教学任务', enabled: true },
  { label: '会创建教学任务-班级关联', enabled: true },
  { label: '会创建导入批次记录', enabled: true },
  { label: '不会创建教师', enabled: false },
  { label: '不会创建班级', enabled: false },
  { label: '不会创建课表', enabled: false },
  { label: '不会执行自动排课', enabled: false },
]

// ── Component ────────────────────────────────────────────────────────────────

export function ApplyExecutionSection({
  plan,
  targetSemesterId,
  onApply,
  onDryRun,
  applyLoading,
  applyResult,
  applyError,
}: ApplyExecutionSectionProps) {
  const s = plan.summary
  const hasImportableRows = s.plannedImportRows > 0
  const [confirmToken, setConfirmToken] = useState('')
  const [showResult, setShowResult] = useState(false)

  const tokenValid = CONFIRM_TOKEN_PATTERN.test(confirmToken)
  const expectedToken = `APPLY_XLSX_COURSE_SETTING_${targetSemesterId}`

  const handleApplyClick = () => {
    if (!tokenValid || !hasImportableRows) return
    onApply(confirmToken)
    setShowResult(true)
  }

  const handleDryRunClick = () => {
    onDryRun()
    setShowResult(true)
  }

  return (
    <div
      className="border-t-2 border-orange-200 bg-orange-50/30 px-4 py-3 space-y-3"
      data-l7f-section="apply-execution"
    >
      {/* ── Header ── */}
      <div className="flex items-center gap-2 flex-wrap">
        <PlayCircle className="w-4 h-4 text-orange-700" />
        <h4 className="text-sm font-semibold text-orange-800">
          受控执行导入 (Partial Import Apply)
        </h4>
        <Badge
          variant="outline"
          className="text-[10px] font-normal bg-orange-50 text-orange-700 border-orange-200"
        >
          L7-F · write stage
        </Badge>
        <span className="text-[11px] text-gray-500 ml-auto">
          {plan.targetSemester.name} (ID {plan.targetSemester.id})
        </span>
      </div>

      {/* ── Risk warning panel ── */}
      <div className="bg-orange-50 border border-orange-200 rounded-lg p-3 space-y-2">
        <div className="flex items-start gap-2 text-sm text-orange-800">
          <AlertTriangle className="w-4 h-4 mt-0.5 shrink-0" />
          <span className="font-medium">写库风险说明</span>
        </div>
        <div className="text-xs text-orange-700 pl-6 space-y-1">
          <p className="font-medium">这是写库操作，会创建课程、教学任务和教学任务-班级关联。</p>
          <ul className="list-none space-y-0.5">
            {RISK_WARNINGS.map((w) => (
              <li key={w.label} className="flex items-center gap-1.5">
                {w.enabled ? (
                  <CheckCircle2 className="w-3 h-3 text-orange-500" />
                ) : (
                  <ShieldCheck className="w-3 h-3 text-green-500" />
                )}
                <span>{w.label}</span>
              </li>
            ))}
          </ul>
          <p className="mt-1 text-orange-600">执行前会创建数据库备份。</p>
        </div>
      </div>

      {/* ── Plan readiness summary ── */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
        <ReviewSummaryCard label="计划导入" value={s.plannedImportRows} tone={hasImportableRows ? 'success' : 'muted'} />
        <ReviewSummaryCard label="跳过" value={s.skippedRows} tone="muted" />
        <ReviewSummaryCard label="仍需处理" value={s.unresolvedRows} tone={s.unresolvedRows > 0 ? 'warn' : 'muted'} />
        <ReviewSummaryCard label="新课程候选" value={s.confirmedNewCourseCandidates} tone={s.confirmedNewCourseCandidates > 0 ? 'default' : 'muted'} />
      </div>

      {/* ── Confirm token input ── */}
      <div className="space-y-2">
        <Label className="text-xs font-medium text-gray-700">
          确认口令 (Confirm Token)
        </Label>
        <div className="flex items-center gap-2">
          <Input
            value={confirmToken}
            onChange={(e) => setConfirmToken(e.target.value)}
            placeholder={expectedToken}
            className="flex-1 font-mono text-xs"
            disabled={!hasImportableRows}
            data-l7f-confirm-token-input="true"
          />
          {confirmToken.length > 0 && (
            tokenValid ? (
              <ShieldCheck className="w-4 h-4 text-green-500 shrink-0" />
            ) : (
              <ShieldAlert className="w-4 h-4 text-red-400 shrink-0" />
            )
          )}
        </div>
        <p className="text-[10px] text-gray-500">
          预期口令: <code className="bg-gray-100 px-1 rounded">{expectedToken}</code>
        </p>
      </div>

      {/* ── Action buttons ── */}
      <div className="flex items-center gap-2 flex-wrap">
        <Button
          size="sm"
          variant="destructive"
          className="bg-red-600 hover:bg-red-700 text-white"
          disabled={!tokenValid || applyLoading || !hasImportableRows}
          onClick={handleApplyClick}
          data-l7f-apply-button="true"
        >
          {applyLoading ? '执行中…' : '确认执行课程设置导入'}
        </Button>
        <Button
          size="sm"
          variant="outline"
          disabled={applyLoading || !hasImportableRows}
          onClick={handleDryRunClick}
          data-l7f-dry-run-button="true"
        >
          仅试运行 (Dry-Run)
        </Button>
      </div>

      {/* ── Post-apply result ── */}
      {showResult && applyResult && (
        <div className="space-y-3">
          {applyResult.dbWritten && (
            <div className="bg-green-50 border border-green-200 rounded-lg p-3 text-sm space-y-1">
              <div className="flex items-center gap-2 text-green-800">
                <CheckCircle2 className="w-4 h-4" />
                <span className="font-medium">导入执行成功</span>
              </div>
              <p className="text-xs text-green-700">
                ImportBatch ID: <strong>{applyResult.importBatchId}</strong>
              </p>
              <p className="text-xs text-green-700">
                备份路径: <code className="bg-green-100 px-1 rounded text-[10px] break-all">{applyResult.backupPath}</code>
              </p>
            </div>
          )}
          {!applyResult.dbWritten && !applyResult.dryRunOnly && applyResult.success && (
            <div className="bg-amber-50 border border-amber-200 rounded-lg p-3 text-sm space-y-1">
              <div className="flex items-center gap-2 text-amber-800">
                <AlertTriangle className="w-4 h-4" />
                <span className="font-medium">执行未完成，请检查审计结果</span>
              </div>
            </div>
          )}
          {applyResult.dryRunOnly && (
            <div className="bg-blue-50 border border-blue-200 rounded-lg p-3 text-sm space-y-1">
              <div className="flex items-center gap-2 text-blue-800">
                <Info className="w-4 h-4" />
                <span className="font-medium">试运行完成，未写入数据库</span>
              </div>
            </div>
          )}

          {/* Summary cards */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
            <ReviewSummaryCard label="已创建课程" value={applyResult.summary.createdCourses} tone={applyResult.summary.createdCourses > 0 ? 'success' : 'muted'} />
            <ReviewSummaryCard label="复用课程" value={applyResult.summary.reusedCourses} tone="default" />
            <ReviewSummaryCard label="教学任务" value={applyResult.summary.createdTeachingTasks} tone="success" />
            <ReviewSummaryCard label="任务-班级" value={applyResult.summary.createdTeachingTaskClasses} tone="success" />
          </div>

          {/* Counts delta */}
          <div className="bg-gray-50 border border-gray-200 rounded-lg p-3 text-xs text-gray-600">
            <h5 className="font-semibold mb-1">变更计数</h5>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-1">
              <span>Course: {applyResult.counts.courseBefore} → {applyResult.counts.courseAfter}</span>
              <span>TeachingTask: {applyResult.counts.teachingTaskBefore} → {applyResult.counts.teachingTaskAfter}</span>
              <span>TeachingTaskClass: {applyResult.counts.teachingTaskClassBefore} → {applyResult.counts.teachingTaskClassAfter}</span>
              <span>ImportBatch: {applyResult.counts.importBatchBefore} → {applyResult.counts.importBatchAfter}</span>
              <span>Teacher: {applyResult.counts.teacherBefore} → {applyResult.counts.teacherAfter} (不变)</span>
              <span>ClassGroup: {applyResult.counts.classGroupBefore} → {applyResult.counts.classGroupAfter} (不变)</span>
              <span>ScheduleSlot: {applyResult.counts.scheduleSlotBefore} → {applyResult.counts.scheduleSlotAfter} (不变)</span>
              <span>ScheduleAdj: {applyResult.counts.scheduleAdjustmentBefore} → {applyResult.counts.scheduleAdjustmentAfter} (不变)</span>
            </div>
          </div>

          {/* Post-apply audit */}
          <div className={`border rounded-lg p-3 text-xs ${applyResult.postApplyAudit.passed ? 'bg-green-50 border-green-200' : 'bg-red-50 border-red-200'}`}>
            <div className="flex items-center gap-2 mb-1">
              {applyResult.postApplyAudit.passed ? (
                <ShieldCheck className="w-3 h-3 text-green-600" />
              ) : (
                <ShieldAlert className="w-3 h-3 text-red-600" />
              )}
              <span className={`font-semibold ${applyResult.postApplyAudit.passed ? 'text-green-700' : 'text-red-700'}`}>
                Post-Apply Audit: {applyResult.postApplyAudit.passed ? 'PASSED' : 'FAILED'}
              </span>
            </div>
            <ul className="space-y-0.5 text-[10px]">
              {applyResult.postApplyAudit.checks.map((c, i) => (
                <li key={i} className="flex items-start gap-1">
                  <span>{c.ok ? '✓' : '✗'}</span>
                  <span>{c.name}</span>
                  {c.detail && <span className="text-gray-400">({c.detail})</span>}
                </li>
              ))}
            </ul>
          </div>

          {/* Rollback note */}
          <div className="bg-gray-50 border border-gray-200 rounded-lg p-2 text-[10px] font-mono text-gray-600 whitespace-pre-wrap break-all">
            {applyResult.rollbackNote}
          </div>
        </div>
      )}

      {/* ── Apply error ── */}
      {applyError && (
        <div className="bg-red-50 border border-red-200 rounded-lg p-3 text-sm text-red-700">
          <div className="flex items-center gap-2">
            <ShieldAlert className="w-4 h-4" />
            <span className="font-medium">执行失败</span>
          </div>
          <p className="text-xs mt-1">{applyError}</p>
        </div>
      )}
    </div>
  )
}
