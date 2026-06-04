'use client'

import { useState, useRef, useMemo } from 'react'
import { Upload, FileSpreadsheet, Users, BookOpen, GraduationCap, DoorOpen, Loader2, AlertCircle, Copy, Check, Filter, Database, PlayCircle, AlertTriangle, ShieldAlert, Info } from 'lucide-react'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import type {
  ImportParseResult,
  ImportParseResponse,
  ImportScheduleRecord,
  ImportConfirmResponse,
  ImportConfirmDryRunPlan,
  ImportConfirmSuccessResult,
} from '@/types/import'
import { DAY_NAME_MAP } from '@/types/schedule'
import { toast } from 'sonner'
import {
  parseCrossCohortWarnings,
  normalizeWarnings,
  validateApprovalState,
  buildCrossCohortApprovalPayload,
  mapApprovalError,
  type ApprovalState,
} from '@/lib/import/cross-cohort-approval-ui'

interface ScheduleImportDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
}

type FilterKey = 'all' | 'missing_student' | 'missing_teacher' | 'missing_room' | 'missing_course' | 'week_constraints' | 'odd_even' | 'half_semester' | 'merged_class' | 'duplicate'

const FILTER_OPTIONS: { key: FilterKey; label: string }[] = [
  { key: 'all', label: '全部记录' },
  { key: 'missing_student', label: '缺少人数' },
  { key: 'missing_teacher', label: '缺少教师' },
  { key: 'missing_room', label: '缺少教室' },
  { key: 'missing_course', label: '缺少课程' },
  { key: 'week_constraints', label: '有周次约束' },
  { key: 'odd_even', label: '单双周' },
  { key: 'half_semester', label: '前/后八周' },
  { key: 'merged_class', label: '合班备注' },
  { key: 'duplicate', label: '疑似重复' },
]

function matchesFilter(r: ImportScheduleRecord, idx: number, filter: FilterKey, quality: ImportParseResult['quality']): boolean {
  if (filter === 'all') return true
  const weekConstraints = r.week_constraints ?? ''
  const remark = r.remark ?? ''
  const warningIndices = new Set(quality.warnings.map((w) => w.recordIndex))

  switch (filter) {
    case 'missing_student': return r.student_count == null
    case 'missing_teacher': return !r.teacher
    case 'missing_room': return !r.room
    case 'missing_course': return !r.course
    case 'week_constraints': return !!weekConstraints
    case 'odd_even': return r.week_type === 'ODD' || r.week_type === 'EVEN' || weekConstraints.includes('单周') || weekConstraints.includes('双周')
    case 'half_semester': return r.week_type === 'FIRST_HALF' || r.week_type === 'SECOND_HALF' || weekConstraints.includes('前八周') || weekConstraints.includes('后八周')
    case 'merged_class': return ['合班', '与', '多班'].some((kw) => remark.includes(kw))
    case 'duplicate': return warningIndices.has(idx) && quality.warnings.some((w) => w.recordIndex === idx && w.type === 'DUPLICATE_CANDIDATE')
    default: return true
  }
}

export function ScheduleImportDialog({ open, onOpenChange }: ScheduleImportDialogProps) {
  const [file, setFile] = useState<File | null>(null)
  const [loading, setLoading] = useState(false)
  const [result, setResult] = useState<ImportParseResult | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [filter, setFilter] = useState<FilterKey>('all')
  const [copied, setCopied] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)

  // Confirm flow state
  const [dryRunLoading, setDryRunLoading] = useState(false)
  const [confirmLoading, setConfirmLoading] = useState(false)
  const [dryRunResult, setDryRunResult] = useState<ImportConfirmDryRunPlan | null>(null)
  const [confirmResult, setConfirmResult] = useState<ImportConfirmSuccessResult | null>(null)
  const [confirmError, setConfirmError] = useState<string | null>(null)
  const [confirmDialogOpen, setConfirmDialogOpen] = useState(false)

  // K19-FIX-B2: cross-cohort approval state
  const [approvals, setApprovals] = useState<Record<string, ApprovalState>>({})
  const [approvalTouched, setApprovalTouched] = useState(false)

  const reset = () => {
    setFile(null)
    setResult(null)
    setError(null)
    setLoading(false)
    setFilter('all')
    setCopied(false)
    clearConfirmState()
    if (inputRef.current) inputRef.current.value = ''
  }

  const clearConfirmState = () => {
    setDryRunLoading(false)
    setConfirmLoading(false)
    setDryRunResult(null)
    setConfirmResult(null)
    setConfirmError(null)
    setConfirmDialogOpen(false)
    setApprovals({})
    setApprovalTouched(false)
  }

  const handleOpenChange = (nextOpen: boolean) => {
    if (!nextOpen) reset()
    onOpenChange(nextOpen)
  }

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const selected = e.target.files?.[0]
    if (selected) {
      setFile(selected)
      setResult(null)
      setError(null)
      setFilter('all')
      clearConfirmState()
    }
  }

  const handleParse = async () => {
    if (!file) return

    setLoading(true)
    setError(null)
    setResult(null)
    clearConfirmState()

    try {
      const formData = new FormData()
      formData.append('file', file)

      const res = await fetch('/api/admin/import/parse', {
        method: 'POST',
        body: formData,
      })

      const data: ImportParseResponse = await res.json()

      if (!data.success) {
        setError(data.error || '解析失败')
        return
      }

      setResult(data)
    } catch (e: unknown) {
      const err = e as { message?: string }
      setError(err.message || '请求失败')
    } finally {
      setLoading(false)
    }
  }

  const handleDryRun = async () => {
    if (!result?.success || !result.batchId) return

    setDryRunLoading(true)
    setDryRunResult(null)
    setConfirmResult(null)
    setConfirmError(null)

    try {
      const res = await fetch('/api/admin/import/confirm', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          batchId: result.batchId,
          strategy: 'UPSERT_BY_NATURAL_KEY',
          dryRun: true,
        }),
      })

      const data: ImportConfirmResponse = await res.json()

      if (!data.success) {
        setConfirmError(data.error || 'Dry Run 失败')
        return
      }

      if (data.dryRun) {
        setDryRunResult(data.plan)
      }
    } catch (e: unknown) {
      const err = e as { message?: string }
      setConfirmError(err.message || '请求失败')
    } finally {
      setDryRunLoading(false)
    }
  }

  const handleConfirmClick = () => {
    setConfirmDialogOpen(true)
  }

  const handleConfirmImport = async () => {
    if (!result?.success || !result.batchId) return

    setConfirmDialogOpen(false)
    setConfirmLoading(true)
    setConfirmResult(null)
    setConfirmError(null)

    // K19-FIX-B2: build crossCohortApprovals from approval state
    const crossCohortWarnings = parseCrossCohortWarnings(normalizeWarnings(dryRunResult?.warnings))
    const crossCohortApprovals = buildCrossCohortApprovalPayload(
      crossCohortWarnings.suspiciousTasks,
      approvals,
    )

    try {
      const body: Record<string, unknown> = {
        batchId: result.batchId,
        strategy: 'UPSERT_BY_NATURAL_KEY',
        dryRun: false,
        confirmText: 'CONFIRM_IMPORT',
      }
      if (crossCohortApprovals.length > 0) {
        body.crossCohortApprovals = crossCohortApprovals
      }

      const res = await fetch('/api/admin/import/confirm', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })

      const data: ImportConfirmResponse = await res.json()

      if (!data.success) {
        // K19-FIX-B2: check for approval-specific 409 errors
        const approvalError = mapApprovalError(data.error, data.details)
        setConfirmError(approvalError || data.error || '导入失败')
        return
      }

      if (!data.dryRun) {
        if (data.result) {
          setConfirmResult(data.result)
          toast.success('导入成功')
        } else {
          setConfirmError('导入响应缺少结果数据')
        }
      }
    } catch (e: unknown) {
      const err = e as { message?: string }
      setConfirmError(err.message || '请求失败')
    } finally {
      setConfirmLoading(false)
    }
  }

  const handleCopyJson = async () => {
    if (!result) return
    try {
      await navigator.clipboard.writeText(JSON.stringify(result, null, 2))
      setCopied(true)
      toast.success('已复制到剪贴板')
      setTimeout(() => setCopied(false), 2000)
    } catch {
      toast.error('复制失败')
    }
  }

  const filteredRecords = useMemo(() => {
    if (!result?.success) return []
    if (filter === 'all') return result.records
    return result.records.filter((r, i) => matchesFilter(r, i, filter, result.quality))
  }, [result, filter])

  const previewRecords = filteredRecords.slice(0, 50)

  const hasBlocking = result?.success && result.quality.recordsMissingStudentCount > 0 || result?.success && result.quality.recordsMissingCourse > 0 || result?.success && result.quality.duplicateCandidateCount > 0

  // K19-FIX-B2: cross-cohort warnings from dry-run result
  const crossCohortWarnings = useMemo(() => {
    if (!dryRunResult?.warnings) return null
    return parseCrossCohortWarnings(normalizeWarnings(dryRunResult.warnings))
  }, [dryRunResult])

  const crossCohortApprovalValidation = useMemo(() => {
    if (!crossCohortWarnings) return { ready: true, reasons: [] }
    return validateApprovalState(crossCohortWarnings.suspiciousTasks, approvals)
  }, [crossCohortWarnings, approvals])

  const hasLikelyErrors = crossCohortWarnings ? crossCohortWarnings.suspiciousTasks.length > 0 : false
  const crossCohortBlocking = hasLikelyErrors && !crossCohortApprovalValidation.ready

  return (
    <>
      <Dialog open={open} onOpenChange={handleOpenChange}>
        <DialogContent className="sm:max-w-5xl max-h-[90vh] overflow-hidden flex flex-col">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <FileSpreadsheet className="w-5 h-5 text-blue-600" />
              导入课程表
            </DialogTitle>
          </DialogHeader>

          <div className="flex-1 overflow-auto space-y-4 py-2">
            {/* Upload area */}
            <div className="flex items-center gap-3">
              <input
                ref={inputRef}
                type="file"
                accept=".docx"
                onChange={handleFileChange}
                className="hidden"
                id="schedule-file-input"
              />
              <label
                htmlFor="schedule-file-input"
                className="flex items-center gap-2 px-4 py-2 border-2 border-dashed border-gray-300 rounded-lg cursor-pointer hover:border-blue-400 hover:bg-blue-50 transition-colors text-sm text-gray-600"
              >
                <Upload className="w-4 h-4" />
                {file ? file.name : '选择 .docx 文件'}
              </label>
              <Button
                onClick={handleParse}
                disabled={!file || loading}
                className="bg-blue-600 hover:bg-blue-700"
              >
                {loading ? (
                  <>
                    <Loader2 className="w-4 h-4 mr-1.5 animate-spin" />
                    解析中...
                  </>
                ) : (
                  '解析'
                )}
              </Button>
              {result?.success && (
                <Button variant="outline" size="sm" onClick={handleCopyJson} className="ml-auto">
                  {copied ? <Check className="w-4 h-4 mr-1" /> : <Copy className="w-4 h-4 mr-1" />}
                  {copied ? '已复制' : '复制解析 JSON'}
                </Button>
              )}
            </div>

            {/* Error */}
            {error && (
              <div className="flex items-start gap-2 p-3 bg-red-50 border border-red-200 rounded-lg text-sm text-red-700">
                <AlertCircle className="w-4 h-4 mt-0.5 shrink-0" />
                <div>
                  <div className="font-medium">{error}</div>
                </div>
              </div>
            )}

            {/* Stats cards */}
            {result?.success && result.stats && (
              <div className="grid grid-cols-4 gap-3">
                <StatCard
                  icon={<GraduationCap className="w-5 h-5" />}
                  label="班级"
                  value={result.stats.class_count}
                  color="blue"
                />
                <StatCard
                  icon={<BookOpen className="w-5 h-5" />}
                  label="课程记录"
                  value={result.stats.total_records}
                  color="green"
                />
                <StatCard
                  icon={<Users className="w-5 h-5" />}
                  label="教师"
                  value={result.stats.teacher_count}
                  color="purple"
                />
                <StatCard
                  icon={<DoorOpen className="w-5 h-5" />}
                  label="教室"
                  value={result.stats.room_count}
                  color="orange"
                />
              </div>
            )}

            {/* Quality section */}
            {result?.success && result.quality && (
              <div className="bg-gray-50 border border-gray-200 rounded-lg p-3 space-y-2">
                <h3 className="text-sm font-medium text-gray-700">解析质量</h3>
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-xs">
                  <QualityItem label="人数解析率" value={`${result.quality.recordsWithStudentCount}/${result.quality.totalRecords}`} warn={result.quality.recordsMissingStudentCount > 0} />
                  <QualityItem label="缺少人数" value={result.quality.recordsMissingStudentCount} warn={result.quality.recordsMissingStudentCount > 0} />
                  <QualityItem label="缺少教师" value={result.quality.recordsMissingTeacher} warn={result.quality.recordsMissingTeacher > 0} />
                  <QualityItem label="缺少教室" value={result.quality.recordsMissingRoom} warn={result.quality.recordsMissingRoom > 0} />
                  <QualityItem label="缺少课程" value={result.quality.recordsMissingCourse} warn={result.quality.recordsMissingCourse > 0} />
                  <QualityItem label="周次约束" value={result.quality.recordsWithWeekConstraints} />
                  <QualityItem label="单双周" value={result.quality.recordsWithOddEvenWeek} />
                  <QualityItem label="前/后八周" value={result.quality.recordsWithHalfSemester} />
                  <QualityItem label="合班备注" value={result.quality.recordsWithMergedClassRemark} />
                  <QualityItem label="疑似重复" value={result.quality.duplicateCandidateCount} warn={result.quality.duplicateCandidateCount > 0} />
                </div>

                {/* Warnings */}
                {result.quality.warnings.length > 0 && (
                  <details className="mt-2">
                    <summary className="text-xs text-amber-700 cursor-pointer hover:underline">
                      查看 {result.quality.warnings.length} 条警告（前 50 条）
                    </summary>
                    <div className="mt-2 max-h-48 overflow-auto space-y-1">
                      {result.quality.warnings.slice(0, 50).map((w, i) => (
                        <div key={i} className="text-xs text-gray-600 bg-white px-2 py-1 rounded border border-gray-100">
                          <span className="inline-block px-1.5 py-0.5 bg-amber-100 text-amber-800 rounded text-[10px] font-medium mr-1.5">{w.type}</span>
                          <span className="text-gray-700">{w.message}</span>
                          {w.rawText && <span className="text-gray-400 ml-1">({w.rawText})</span>}
                        </div>
                      ))}
                    </div>
                  </details>
                )}
              </div>
            )}

            {/* Confirm import section */}
            {result?.success && result.batchId && (
              <div className="bg-blue-50 border border-blue-200 rounded-lg p-3 space-y-3">
                <div className="flex items-center justify-between">
                  <h3 className="text-sm font-medium text-blue-800 flex items-center gap-1.5">
                    <Database className="w-4 h-4" />
                    确认导入
                    <span className="text-xs font-normal text-blue-600">batchId: {result.batchId}</span>
                  </h3>
                  {hasBlocking ? (
                    <span className="text-xs px-2 py-0.5 bg-red-100 text-red-700 rounded-full">存在阻断项，不可导入</span>
                  ) : (
                    <span className="text-xs px-2 py-0.5 bg-green-100 text-green-700 rounded-full">可尝试导入</span>
                  )}
                </div>

                {/* Risk summary */}
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-xs">
                  <QualityItem label="缺教师" value={result.quality.recordsMissingTeacher} warn={result.quality.recordsMissingTeacher > 0} />
                  <QualityItem label="缺教室" value={result.quality.recordsMissingRoom} warn={result.quality.recordsMissingRoom > 0} />
                  <QualityItem label="疑似重复" value={result.quality.duplicateCandidateCount} warn={result.quality.duplicateCandidateCount > 0} />
                  <QualityItem label="警告数" value={result.quality.warnings.length} warn={result.quality.warnings.length > 0} />
                </div>

                {/* Action buttons */}
                <div className="flex items-center gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={handleDryRun}
                    disabled={dryRunLoading || confirmLoading}
                  >
                    {dryRunLoading ? (
                      <>
                        <Loader2 className="w-3.5 h-3.5 mr-1 animate-spin" />
                        检查中...
                      </>
                    ) : (
                      <>
                        <PlayCircle className="w-3.5 h-3.5 mr-1" />
                        导入前检查 (Dry Run)
                      </>
                    )}
                  </Button>
                  <Button
                    size="sm"
                    className="bg-amber-600 hover:bg-amber-700"
                    onClick={handleConfirmClick}
                    disabled={dryRunLoading || confirmLoading || !!hasBlocking || crossCohortBlocking}
                    data-testid="import-confirm-button"
                  >
                    {confirmLoading ? (
                      <>
                        <Loader2 className="w-3.5 h-3.5 mr-1 animate-spin" />
                        导入中...
                      </>
                    ) : (
                      <>
                        <Database className="w-3.5 h-3.5 mr-1" />
                        确认导入数据库
                      </>
                    )}
                  </Button>
                </div>

                {/* Dry Run result */}
                {dryRunResult && dryRunResult.plannedClassGroups && dryRunResult.plannedTeachingTasks && dryRunResult.plannedScheduleSlots && (
                  <div className="bg-white border border-blue-100 rounded-lg p-3 space-y-2">
                    <h4 className="text-xs font-medium text-gray-700">Dry Run 结果</h4>
                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-xs">
                      <QualityItem label="可导入" value={dryRunResult.canImport ? '是' : '否'} warn={!dryRunResult.canImport} />
                      <QualityItem label="事件组" value={dryRunResult.eventGroupCount} />
                      <QualityItem label="任务组" value={dryRunResult.teachingTaskGroupCount} />
                      <QualityItem label="时段组" value={dryRunResult.scheduleSlotGroupCount} />
                      <QualityItem label="新建班级" value={dryRunResult.plannedClassGroups.createCount} />
                      <QualityItem label="新建教师" value={dryRunResult.plannedTeachers?.createCount ?? 0} />
                      <QualityItem label="新建课程" value={dryRunResult.plannedCourses?.createCount ?? 0} />
                      <QualityItem label="新建教室" value={dryRunResult.plannedRooms?.createCount ?? 0} />
                      <QualityItem label="新建任务" value={dryRunResult.plannedTeachingTasks.createCount} />
                      <QualityItem label="新建时段" value={dryRunResult.plannedScheduleSlots.createCount} />
                    </div>
                    {dryRunResult.blockingReasons?.length > 0 && (
                      <div className="text-xs text-red-600">
                        阻断原因: {dryRunResult.blockingReasons.join('; ')}
                      </div>
                    )}
                    {dryRunResult.warnings?.length > 0 && (
                      <details className="text-xs">
                        <summary className="text-amber-700 cursor-pointer">查看 {dryRunResult.warnings.length} 条警告</summary>
                        <div className="mt-1 max-h-32 overflow-auto space-y-0.5">
                          {dryRunResult.warnings.slice(0, 20).map((w, i) => (
                            <div key={i} className="text-gray-600">{typeof w === 'string' ? w : JSON.stringify(w)}</div>
                          ))}
                        </div>
                      </details>
                    )}
                  </div>
                )}

                {/* K19-FIX-B2: Cross-cohort approval section */}
                {crossCohortWarnings && hasLikelyErrors && (
                  <div className="bg-red-50 border border-red-300 rounded-lg p-3 space-y-3" data-testid="cross-cohort-warning-panel">
                    <div className="flex items-center gap-2">
                      <ShieldAlert className="w-4 h-4 text-red-600 shrink-0" />
                      <h4 className="text-sm font-medium text-red-800">
                        检测到 {crossCohortWarnings.suspiciousTasks.length} 个疑似错误跨年级合班
                      </h4>
                    </div>
                    <p className="text-xs text-red-700">
                      该导入包含疑似错误的跨年级 / 跨 cohort 合班记录。后端要求对每个可疑任务显式确认并填写审批原因，未确认前无法正式导入。
                    </p>
                    {crossCohortWarnings.suspiciousTasks.map((task) => {
                      const state = approvals[task.taskKey]
                      const checked = state?.checked ?? false
                      const reason = state?.reason ?? ''
                      return (
                        <div key={task.taskKey} className="bg-white border border-red-200 rounded p-2.5 space-y-2">
                          <div className="text-xs text-gray-700">
                            <span className="font-medium text-gray-900">{task.title}</span>
                            {task.taskKey && (
                              <span className="ml-2 text-gray-400 font-mono text-[10px]">({task.taskKey})</span>
                            )}
                          </div>
                          <div className="text-[11px] text-gray-500 break-all">{task.warningText}</div>
                          <label className="flex items-start gap-2 cursor-pointer">
                            <input
                              type="checkbox"
                              className="mt-0.5"
                              checked={checked}
                              data-testid="cross-cohort-approval-checkbox"
                              onChange={(e) => {
                                setApprovals((prev) => ({
                                  ...prev,
                                  [task.taskKey]: {
                                    ...prev[task.taskKey],
                                    checked: e.target.checked,
                                    reason: prev[task.taskKey]?.reason ?? '',
                                  },
                                }))
                                setApprovalTouched(true)
                              }}
                            />
                            <span className="text-xs text-gray-700">我已确认此跨年级合班为合理需求</span>
                          </label>
                          {checked && (
                            <div className="space-y-1">
                              <textarea
                                className="w-full text-xs border border-gray-300 rounded px-2 py-1.5 resize-none focus:outline-none focus:ring-1 focus:ring-red-400"
                                rows={2}
                                placeholder="审批原因（必填，不少于 5 个字符）"
                                value={reason}
                                data-testid="cross-cohort-approval-reason"
                                onChange={(e) => {
                                  setApprovals((prev) => ({
                                    ...prev,
                                    [task.taskKey]: {
                                      ...prev[task.taskKey],
                                      checked: true,
                                      reason: e.target.value,
                                    },
                                  }))
                                }}
                              />
                              <div className="flex items-center justify-between text-[11px]">
                                <span className={reason.trim().length >= 5 ? 'text-green-600' : 'text-red-500'} data-testid="cross-cohort-reason-hint">
                                  {reason.trim().length >= 5 ? '✓ 原因已填写' : `还需要 ${Math.max(0, 5 - reason.trim().length)} 个字符`}
                                </span>
                                <span className="text-gray-400">{reason.trim().length} 字符</span>
                              </div>
                            </div>
                          )}
                        </div>
                      )
                    })}
                    {approvalTouched && !crossCohortApprovalValidation.ready && (
                      <div className="text-xs text-red-600 flex items-center gap-1.5" data-testid="cross-cohort-approval-message">
                        <AlertCircle className="w-3.5 h-3.5 shrink-0" />
                        {crossCohortApprovalValidation.reasons[0]}
                      </div>
                    )}
                  </div>
                )}

                {/* K19-FIX-B2: LEGAL_PUBLIC info (non-blocking) */}
                {crossCohortWarnings && crossCohortWarnings.legalPublics.length > 0 && !hasLikelyErrors && (
                  <div className="bg-blue-50 border border-blue-200 rounded-lg p-2.5 space-y-1" data-testid="cross-cohort-legal-public-info">
                    <div className="flex items-center gap-2 text-xs">
                      <Info className="w-3.5 h-3.5 text-blue-500 shrink-0" />
                      <span className="text-blue-800 font-medium">
                        {crossCohortWarnings.legalPublics.length} 条公共课跨年级合班（允许，无需审批）
                      </span>
                    </div>
                  </div>
                )}

                {/* K19-FIX-B2: confirm disabled reason */}
                {crossCohortBlocking && (
                  <div className="text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded p-2 flex items-center gap-1.5" data-testid="cross-cohort-blocking-message">
                    <AlertTriangle className="w-3.5 h-3.5 shrink-0" />
                    请完成所有跨年级合班确认后才能导入
                  </div>
                )}

                {/* Confirm error */}
                {confirmError && (
                  <div className="flex items-start gap-2 p-2 bg-red-50 border border-red-200 rounded-lg text-xs text-red-700" data-testid="import-confirm-error">
                    <AlertCircle className="w-3.5 h-3.5 mt-0.5 shrink-0" />
                    <div className="font-medium">{confirmError}</div>
                  </div>
                )}

                {/* Confirm success result */}
                {confirmResult && confirmResult.classGroups && confirmResult.teachingTasks && confirmResult.scheduleSlots && (
                  <div className="bg-green-50 border border-green-200 rounded-lg p-3 space-y-2">
                    <h4 className="text-xs font-medium text-green-800">导入成功</h4>
                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-xs">
                      <QualityItem label="新建班级" value={confirmResult.classGroups.created} />
                      <QualityItem label="更新人数" value={confirmResult.classGroups.updatedStudentCount} />
                      <QualityItem label="新建教师" value={confirmResult.teachers?.created ?? 0} />
                      <QualityItem label="新建课程" value={confirmResult.courses?.created ?? 0} />
                      <QualityItem label="新建教室" value={confirmResult.rooms?.created ?? 0} />
                      <QualityItem label="新建任务" value={confirmResult.teachingTasks.created} />
                      <QualityItem label="复用任务" value={confirmResult.teachingTasks.reused} />
                      <QualityItem label="新建时段" value={confirmResult.scheduleSlots.created} />
                      <QualityItem label="复用时段" value={confirmResult.scheduleSlots.reused} />
                      <QualityItem label="新建合班" value={confirmResult.teachingTaskClasses?.created ?? 0} />
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* Filter bar + Preview table */}
            {result?.success && result.records.length > 0 && (
              <div>
                <div className="flex items-center gap-2 mb-2 flex-wrap">
                  <Filter className="w-3.5 h-3.5 text-gray-400" />
                  {FILTER_OPTIONS.map((opt) => {
                    let count: number | undefined
                    if (opt.key !== 'all' && result.quality) {
                      const q = result.quality
                      switch (opt.key) {
                        case 'missing_student': count = q.recordsMissingStudentCount; break
                        case 'missing_teacher': count = q.recordsMissingTeacher; break
                        case 'missing_room': count = q.recordsMissingRoom; break
                        case 'missing_course': count = q.recordsMissingCourse; break
                        case 'week_constraints': count = q.recordsWithWeekConstraints; break
                        case 'odd_even': count = q.recordsWithOddEvenWeek; break
                        case 'half_semester': count = q.recordsWithHalfSemester; break
                        case 'merged_class': count = q.recordsWithMergedClassRemark; break
                        case 'duplicate': count = q.duplicateCandidateCount; break
                      }
                    }
                    return (
                      <button
                        key={opt.key}
                        onClick={() => setFilter(opt.key)}
                        className={`px-2 py-1 text-xs rounded-md transition-colors ${
                          filter === opt.key
                            ? 'bg-gray-900 text-white'
                            : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                        }`}
                      >
                        {opt.label}
                        {count != null && count > 0 && (
                          <span className={`ml-1 ${filter === opt.key ? 'text-white/70' : 'text-gray-400'}`}>({count})</span>
                        )}
                      </button>
                    )
                  })}
                </div>

                <h3 className="text-sm font-medium text-gray-700 mb-2">
                  {filter === 'all' ? '解析预览' : '筛选结果'}（前 {previewRecords.length} 条，共 {filteredRecords.length} 条{filter !== 'all' ? `，总 ${result.records.length} 条` : ''}）
                </h3>
                <div className="border border-gray-200 rounded-lg overflow-hidden">
                  <div className="overflow-x-auto max-h-80 overflow-y-auto">
                    <table className="w-full text-xs">
                      <thead className="bg-gray-50 sticky top-0">
                        <tr>
                          <th className="px-2 py-1.5 text-left font-medium text-gray-600">班级</th>
                          <th className="px-2 py-1.5 text-left font-medium text-gray-600">人数</th>
                          <th className="px-2 py-1.5 text-left font-medium text-gray-600">课程</th>
                          <th className="px-2 py-1.5 text-left font-medium text-gray-600">教师</th>
                          <th className="px-2 py-1.5 text-left font-medium text-gray-600">教室</th>
                          <th className="px-2 py-1.5 text-left font-medium text-gray-600">星期</th>
                          <th className="px-2 py-1.5 text-left font-medium text-gray-600">节次</th>
                          <th className="px-2 py-1.5 text-left font-medium text-gray-600">周次</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-gray-100">
                        {previewRecords.map((r, i) => (
                          <tr key={i} className="hover:bg-gray-50">
                            <td className="px-2 py-1.5 text-gray-900 max-w-[160px] truncate" title={r.class_info.class_name}>
                              {r.class_info.class_name}
                            </td>
                            <td className="px-2 py-1.5 text-gray-700 whitespace-nowrap">
                              {r.student_count_raw ?? '-'}
                              {r.student_count != null && r.student_count_raw !== String(r.student_count) && (
                                <span className="text-gray-400 ml-1">={r.student_count}</span>
                              )}
                            </td>
                            <td className="px-2 py-1.5 text-gray-900 max-w-[140px] truncate" title={r.course ?? ''}>
                              {r.course ?? '-'}
                            </td>
                            <td className="px-2 py-1.5 text-gray-700">{r.teacher ?? '-'}</td>
                            <td className="px-2 py-1.5 text-gray-700">{r.room ?? '-'}</td>
                            <td className="px-2 py-1.5 text-gray-700">{DAY_NAME_MAP[r.day_of_week] ?? r.day_of_week}</td>
                            <td className="px-2 py-1.5 text-gray-700">{r.time_slot}</td>
                            <td className="px-2 py-1.5 text-gray-700 whitespace-nowrap">
                              {r.week_type === 'ALL' ? '全周' : r.week_constraints ?? `${r.week_start}-${r.week_end}周`}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              </div>
            )}
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => handleOpenChange(false)}>
              关闭
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Confirm import dialog */}
      <Dialog open={confirmDialogOpen} onOpenChange={setConfirmDialogOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <AlertTriangle className="w-5 h-5 text-amber-600" />
              确认导入数据库
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-3 text-sm">
            <p>该操作会将解析结果写入数据库，包括：</p>
            <ul className="list-disc list-inside text-gray-600 space-y-1">
              <li>创建/更新班级、教师、课程、教室</li>
              <li>创建教学任务和排课时段</li>
            </ul>
            <div className="bg-amber-50 border border-amber-200 rounded-lg p-2 text-amber-800 text-xs">
              <strong>注意：</strong>当前阶段不支持前端回滚。如果已有 confirmed batch，后端会拒绝重复导入。
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setConfirmDialogOpen(false)}>
              取消
            </Button>
            <Button
              className="bg-amber-600 hover:bg-amber-700"
              onClick={handleConfirmImport}
              disabled={confirmLoading}
            >
              {confirmLoading ? (
                <>
                  <Loader2 className="w-4 h-4 mr-1 animate-spin" />
                  导入中...
                </>
              ) : (
                '确认导入'
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  )
}

function StatCard({ icon, label, value, color }: {
  icon: React.ReactNode
  label: string
  value: number
  color: 'blue' | 'green' | 'purple' | 'orange'
}) {
  const colorMap = {
    blue: 'bg-blue-50 text-blue-700 border-blue-200',
    green: 'bg-green-50 text-green-700 border-green-200',
    purple: 'bg-purple-50 text-purple-700 border-purple-200',
    orange: 'bg-orange-50 text-orange-700 border-orange-200',
  }

  return (
    <div className={`flex items-center gap-2 p-3 rounded-lg border ${colorMap[color]}`}>
      {icon}
      <div>
        <div className="text-lg font-bold">{value}</div>
        <div className="text-xs opacity-75">{label}</div>
      </div>
    </div>
  )
}

function QualityItem({ label, value, warn }: { label: string; value: string | number; warn?: boolean }) {
  return (
    <div className="flex items-center justify-between px-2 py-1 bg-white rounded border border-gray-100">
      <span className="text-gray-500">{label}</span>
      <span className={`font-medium ${warn ? 'text-amber-600' : 'text-gray-800'}`}>{value}</span>
    </div>
  )
}
