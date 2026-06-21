'use client'

/**
 * L3/L6-B/L6-B1/L6-C/L6-D2/L6-E1 UI Component - Course Setting XLSX Preview
 *
 * Preview-only component for Excel course setting file parsing. No confirm/apply
 * buttons. Shows hashed preview rows + field summaries + manual review flags.
 * L6-B: adds target semester selector + dry-run/match summary display.
 * L6-B1: shows authorized admin raw preview fields for manual verification.
 * L6-C: adds createNew semester mode — create a new Semester from the
 *        import flow and auto-select it as targetSemesterId. The new semester
 *        is NEVER auto-activated; active semester is decoupled.
 * L6-D2: adds "审核模式" (review mode) section. Calls approval-review API
 *        and renders a review-only decision table. NEVER writes the DB,
 *        never creates an ImportBatch, never applies anything. Decisions
 *        stay in client state and can be exported as a redacted JSON.
 * L6-E1: adds "手动处理" (manual resolution) section below the review table.
 *        Allows the reviewer to resolve each blocked/pending row by selecting
 *        existing entities or providing candidate names. NEVER writes the DB,
 *        never creates an ImportBatch, never creates TeachingTasks.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { toast } from 'sonner'
import {
  Loader2,
  AlertCircle,
  FileSpreadsheet,
  Eye,
  AlertTriangle,
  Info,
  Database,
  Plus,
  CheckCircle2,
  ListChecks,
  Download,
  Search,
  ChevronDown,
  ChevronRight,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  previewCourseSettingXlsx,
  fetchSemestersForImport,
  createSemesterForCourseSettingImport,
  reviewCourseSettingApproval,
  buildCourseSettingDecisionFile,
  downloadCourseSettingDecisionFile,
  fetchResolutionOptions,
  buildResolutionDraftExport,
  downloadManualResolutionDraftExport,
  planCourseSettingPartialImport,
  downloadCourseSettingPartialImportPlanExport,
  type CourseSettingXlsxPreviewResponse,
  type CourseSettingXlsxPreviewRow,
  type SemesterListItem,
  type CourseSettingApprovalReviewUiResponse,
  type CourseSettingApprovalReviewUiRow,
  type CourseSettingApprovalReviewUiDecisionValue,
  type CourseSettingResolutionOptionsResponse,
  type CourseSettingPartialImportPlanResponse,
} from '@/lib/import/course-setting-xlsx-client'
import {
  APPROVAL_REVIEW_DECISION_OPTIONS,
  APPROVAL_REVIEW_BLOCKED_OPTIONS,
  APPROVAL_REVIEW_FILTER_LABELS,
  APPROVAL_REVIEW_SUGGESTED_ACTION_LABELS,
  APPROVAL_REVIEW_DIAGNOSTIC_LABELS,
  formatSuggestedActionLabel,
  formatDiagnosticCodeLabel,
  formatMatchStatusLabel,
  formatConfidence,
} from '@/lib/import/course-setting-approval-review-localization'
import {
  type CourseSettingManualResolutionItem,
  type CourseSettingManualResolutionSummary,
  type CourseSettingResolutionStatus,
  buildInitialManualResolutionState,
  applyManualResolutionUpdate,
  summarizeManualResolutionState,
} from '@/lib/import/course-setting-manual-resolution-l6-e1'

// L6-C: targetSemester mode (existing vs createNew)
type TargetSemesterMode = 'existing' | 'createNew'

// L6-C: form state for new semester
type CreateSemesterFormState = {
  name: string
  code: string
  academicYear: string
  term: string
  startsAt: string
  endsAt: string
}

const EMPTY_CREATE_FORM: CreateSemesterFormState = {
  name: '',
  code: '',
  academicYear: '',
  term: '',
  startsAt: '',
  endsAt: '',
}

// -- Component ---------------------------------------------------------------

export default function CourseSettingXlsxPreview() {
  const [file, setFile] = useState<File | null>(null)
  const [parsing, setParsing] = useState(false)
  const [result, setResult] = useState<CourseSettingXlsxPreviewResponse | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [expandedRows, setExpandedRows] = useState<Set<number>>(new Set())
  const fileInputRef = useRef<HTMLInputElement>(null)

  // L6-B: semester selector state
  const [semesters, setSemesters] = useState<SemesterListItem[]>([])
  const [selectedSemesterId, setSelectedSemesterId] = useState<number | null>(null)
  const [semestersLoaded, setSemestersLoaded] = useState(false)
  const [semestersLoading, setSemestersLoading] = useState(false)

  // L6-C: targetSemester mode + createNew form state
  const [targetSemesterMode, setTargetSemesterMode] = useState<TargetSemesterMode>('existing')
  const [createForm, setCreateForm] = useState<CreateSemesterFormState>(EMPTY_CREATE_FORM)
  const [createError, setCreateError] = useState<string | null>(null)
  const [creatingSemester, setCreatingSemester] = useState(false)

  // L6-D2: 审核模式 (review mode) state
  const [reviewing, setReviewing] = useState(false)
  const [reviewResult, setReviewResult] = useState<CourseSettingApprovalReviewUiResponse | null>(null)
  const [reviewError, setReviewError] = useState<string | null>(null)
  const [clientDecisions, setClientDecisions] = useState<
    Record<string, CourseSettingApprovalReviewUiDecisionValue>
  >({})

  // L6-D2: filter state (live)
  const [filterDecision, setFilterDecision] = useState<'all' | CourseSettingApprovalReviewUiDecisionValue>(
    'all',
  )
  const [filterBlocked, setFilterBlocked] = useState<'all' | 'blocked' | 'notBlocked'>('all')
  const [filterSuggestedAction, setFilterSuggestedAction] = useState<string>('all')
  const [filterDiagnosticCode, setFilterDiagnosticCode] = useState<string>('all')
  const [searchText, setSearchText] = useState<string>('')

  // L6-E1: manual resolution state
  const [resolutionItems, setResolutionItems] = useState<CourseSettingManualResolutionItem[]>([])
  const [resolutionOptions, setResolutionOptions] = useState<CourseSettingResolutionOptionsResponse | null>(null)
  const [resolutionFilter, setResolutionFilter] = useState<'all' | CourseSettingResolutionStatus>('all')
  const [expandedResolutionRows, setExpandedResolutionRows] = useState<Set<string>>(new Set())

  // L6-E2: partial import plan state
  const [partialPlan, setPartialPlan] = useState<CourseSettingPartialImportPlanResponse | null>(null)
  const [partialPlanError, setPartialPlanError] = useState<string | null>(null)
  const [partialPlanLoading, setPartialPlanLoading] = useState(false)
  const [partialPlanFilter, setPartialPlanFilter] = useState<'importable' | 'skipped' | 'unresolved' | 'candidates' | 'duplicates' | 'blockers'>('importable')

  const refreshSemesters = useCallback(async () => {
    setSemestersLoading(true)
    try {
      const data = await fetchSemestersForImport()
      setSemesters(data.semesters)
      setSemestersLoaded(true)
    } catch {
      setSemestersLoaded(true)
    } finally {
      setSemestersLoading(false)
    }
  }, [])

  // Load semesters on mount
  useEffect(() => {
    if (semestersLoaded || semestersLoading) return
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void refreshSemesters()
  }, [semestersLoaded, semestersLoading, refreshSemesters])

  const handleCreateSemester = useCallback(async () => {
    const name = createForm.name.trim()
    const code = createForm.code.trim()
    if (!name) {
      setCreateError('学期名称 (name) 不能为空')
      return
    }
    if (!code) {
      setCreateError('学期代码 (code) 不能为空')
      return
    }
    if (createForm.startsAt && createForm.endsAt && createForm.endsAt < createForm.startsAt) {
      setCreateError('结束日期不能早于开始日期')
      return
    }
    setCreatingSemester(true)
    setCreateError(null)
    try {
      const created = await createSemesterForCourseSettingImport({
        name,
        code,
        academicYear: createForm.academicYear.trim() || null,
        term: createForm.term.trim() || null,
        startsAt: createForm.startsAt || null,
        endsAt: createForm.endsAt || null,
      })
      // Refresh semester list and auto-select new semester
      await refreshSemesters()
      setSelectedSemesterId(created.id)
      setCreateForm(EMPTY_CREATE_FORM)
      setTargetSemesterMode('existing')
      toast.success('学期创建成功', {
        description: `已创建并选为目标学期：${created.name}（ID ${created.id}）`,
      })
    } catch (e: unknown) {
      const err = e as { code?: string; message?: string }
      const code = err.code ?? ''
      let msg = err.message ?? '创建失败'
      if (code === 'SEMESTER_CODE_EXISTS') msg = `学期代码 "${code}" 已存在`
      else if (code === 'VALIDATION_ERROR' || code === 'INVALID_DATE' || code === 'INVALID_DATE_RANGE') {
        // server-supplied message is already descriptive
      } else if (code === 'HTTP_403') {
        msg = '无权限新建学期，请选择已有学期或联系管理员'
      }
      setCreateError(msg)
      toast.error('创建学期失败', { description: msg })
    } finally {
      setCreatingSemester(false)
    }
  }, [createForm, refreshSemesters])

  const handleUpload = useCallback(async () => {
    if (!file) {
      toast.error('请选择 .xlsx 课程设置文件')
      return
    }
    if (!selectedSemesterId) {
      toast.error('请先选择导入目标学期')
      return
    }
    setParsing(true)
    setError(null)
    setResult(null)
    try {
      const data = await previewCourseSettingXlsx(file, selectedSemesterId)
      setResult(data)
      toast.success('解析完成', {
        description: '识别 ' + data.workbookSummary.totalCourseRows + ' 条课程行，' + data.manualReviewSummary.totalRowsNeedingReview + ' 条需人工审核',
      })
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e)
      setError(msg)
      toast.error('解析失败', { description: msg })
    } finally {
      setParsing(false)
    }
  }, [file, selectedSemesterId])

  const toggleRow = useCallback((idx: number) => {
    setExpandedRows((prev) => {
      const next = new Set(prev)
      if (next.has(idx)) next.delete(idx)
      else next.add(idx)
      return next
    })
  }, [])

  const handleReset = useCallback(() => {
    setFile(null)
    setResult(null)
    setError(null)
    setExpandedRows(new Set())
    // L6-D2: also clear review state
    setReviewResult(null)
    setReviewError(null)
    setClientDecisions({})
    setFilterDecision('all')
    setFilterBlocked('all')
    setFilterSuggestedAction('all')
    setFilterDiagnosticCode('all')
    setSearchText('')
    // L6-E1: also clear resolution state
    setResolutionItems([])
    setResolutionOptions(null)
    setResolutionFilter('all')
    setExpandedResolutionRows(new Set())
    // L6-E2: also clear plan state
    setPartialPlan(null)
    setPartialPlanError(null)
    setPartialPlanLoading(false)
    setPartialPlanFilter('importable')
    if (fileInputRef.current) fileInputRef.current.value = ''
  }, [])

  // L6-D2: review handler
  const handleReview = useCallback(async () => {
    if (!file) {
      toast.error('请选择 .xlsx 课程设置文件')
      return
    }
    if (!selectedSemesterId) {
      toast.error('请先选择导入目标学期')
      return
    }
    setReviewing(true)
    setReviewError(null)
    setReviewResult(null)
    setClientDecisions({})
    try {
      const data = await reviewCourseSettingApproval(file, selectedSemesterId)
      setReviewResult(data)
      // Initialize client decisions from server (all 'pending' initially)
      const init: Record<string, CourseSettingApprovalReviewUiDecisionValue> = {}
      for (const row of data.rows) {
        init[row.approvalItemId] = row.decision.value
      }
      setClientDecisions(init)
      toast.success('审核视图已生成', {
        description: `共 ${data.summary.totalItems} 条，不会写入数据库`,
      })
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e)
      setReviewError(msg)
      toast.error('审核视图生成失败', { description: msg })
    } finally {
      setReviewing(false)
    }
  }, [file, selectedSemesterId])

  // L6-D2: export decision file from current client state (ALL rows, regardless of filter)
  const handleExportDecision = useCallback(() => {
    if (!reviewResult) return
    const rows = reviewResult.rows
    const decisions = rows.map((r) => ({
      approvalItemId: r.approvalItemId,
      decision: clientDecisions[r.approvalItemId] ?? r.decision.value,
    }))
    const file = buildCourseSettingDecisionFile({
      targetSemesterId: reviewResult.targetSemester.id,
      dryRunFingerprintHash: reviewResult.packageRef.dryRunFingerprintHash,
      itemCount: reviewResult.packageRef.itemCount,
      decisions,
    })
    downloadCourseSettingDecisionFile(file)
    toast.success('审核决策已导出', {
      description: '已生成脱敏 JSON 文件，文件名按 targetSemesterId 标识',
    })
  }, [reviewResult, clientDecisions])

  // L6-E1: Initialize manual resolution state when reviewResult first loads
  useEffect(() => {
    if (!reviewResult || !selectedSemesterId) return
    // Build initial resolution items from review rows
    const items = buildInitialManualResolutionState(reviewResult.rows, selectedSemesterId)
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setResolutionItems(items)
    setExpandedResolutionRows(new Set())
    // Load resolution options (courses, teachers, classGroups) from API
    void (async () => {
      try {
        const opts = await fetchResolutionOptions(selectedSemesterId)
        setResolutionOptions(opts)
      } catch {
        // Resolution options are non-critical; leave as null
      }
    })()
  }, [reviewResult, selectedSemesterId])

  // L6-E1: Summary for resolution items
  const resolutionSummary = useMemo(() => {
    if (resolutionItems.length === 0) return null
    return summarizeManualResolutionState(resolutionItems)
  }, [resolutionItems])

  // L6-E1: Filtered resolution items
  const filteredResolutionItems = useMemo(() => {
    if (resolutionFilter === 'all') return resolutionItems
    return resolutionItems.filter((item) => item.resolutionStatus === resolutionFilter)
  }, [resolutionItems, resolutionFilter])

  // L6-E1: Toggle expand/collapse for resolution rows
  const toggleResolutionRow = useCallback((id: string) => {
    setExpandedResolutionRows((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }, [])

  // L6-E1: Export resolution draft
  const handleExportResolutionDraft = useCallback(() => {
    if (!reviewResult || resolutionItems.length === 0) return
    const summary = summarizeManualResolutionState(resolutionItems)
    const draftItems = resolutionItems.map((item) => ({
      approvalItemId: item.approvalItemId,
      resolutionStatus: item.resolutionStatus,
      resolution: item.resolution as Record<string, unknown>,
      validation: item.validation,
    }))
    const draft = buildResolutionDraftExport({
      targetSemesterId: reviewResult.targetSemester.id,
      dryRunFingerprintHash: reviewResult.packageRef.dryRunFingerprintHash,
      itemCount: reviewResult.packageRef.itemCount,
      summary: {
        totalItems: summary.totalItems,
        importableItems: summary.importableItems,
        needsResolutionItems: summary.needsResolutionItems,
        ignoredItems: summary.ignoredItems,
        pendingItems: summary.pendingItems,
        manuallyResolvedItems: summary.manuallyResolvedItems,
        unresolvedBlockers: summary.unresolvedBlockers,
      },
      items: draftItems,
    })
    downloadManualResolutionDraftExport(draft)
    toast.success('处理结果已导出', {
      description: '已生成手动处理结果 JSON 文件',
    })
  }, [reviewResult, resolutionItems])

  // L6-E2: Generate partial import plan (dry-run, no DB writes)
  const handleGeneratePartialPlan = useCallback(async () => {
    if (!file) {
      toast.error('请选择 .xlsx 课程设置文件')
      return
    }
    if (!selectedSemesterId) {
      toast.error('请先选择导入目标学期')
      return
    }
    if (resolutionItems.length === 0) {
      toast.error('请先生成审核视图')
      return
    }
    setPartialPlanLoading(true)
    setPartialPlanError(null)
    setPartialPlan(null)
    try {
      const data = await planCourseSettingPartialImport(
        file,
        selectedSemesterId,
        resolutionItems,
      )
      setPartialPlan(data)
      toast.success('部分导入计划已生成', {
        description: `可导入 ${data.summary.plannedImportRows} 条 / 跳过 ${data.summary.skippedRows} 条 / 仍需处理 ${data.summary.unresolvedRows} 条`,
      })
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e)
      setPartialPlanError(msg)
      toast.error('生成部分导入计划失败', { description: msg })
    } finally {
      setPartialPlanLoading(false)
    }
  }, [file, selectedSemesterId, resolutionItems])

  // L6-E2: Export the plan as redacted JSON
  const handleExportPartialPlan = useCallback(() => {
    if (!partialPlan) return
    downloadCourseSettingPartialImportPlanExport(partialPlan)
    toast.success('部分导入计划已导出', {
      description: '已生成脱敏 JSON（rawIncluded: false）',
    })
  }, [partialPlan])

  // L6-D2: compute live counters from clientDecisions (not server state)
  const liveCounters = useMemo(() => {
    if (!reviewResult) return null
    const counts: Record<CourseSettingApprovalReviewUiDecisionValue, number> = {
      pending: 0,
      approved: 0,
      rejected: 0,
      needsReview: 0,
    }
    for (const row of reviewResult.rows) {
      const d = clientDecisions[row.approvalItemId] ?? row.decision.value
      counts[d] += 1
    }
    return {
      total: reviewResult.rows.length,
      pending: counts.pending,
      approved: counts.approved,
      rejected: counts.rejected,
      needsReview: counts.needsReview,
    }
  }, [reviewResult, clientDecisions])

  // L6-D2: unique suggestedAction values
  const suggestedActionOptions = useMemo(() => {
    if (!reviewResult) return [] as string[]
    const set = new Set<string>()
    for (const r of reviewResult.rows) {
      if (r.match.suggestedAction) set.add(r.match.suggestedAction)
    }
    return Array.from(set).sort()
  }, [reviewResult])

  // L6-D2: unique diagnostic codes
  const diagnosticCodeOptions = useMemo(() => {
    if (!reviewResult) return [] as string[]
    const set = new Set<string>()
    for (const r of reviewResult.rows) {
      for (const c of r.match.diagnosticCodes) set.add(c)
    }
    return Array.from(set).sort()
  }, [reviewResult])

  // L6-D2: filtered rows (sliced for display, full set held in state)
  const filteredRows = useMemo(() => {
    if (!reviewResult) return [] as CourseSettingApprovalReviewUiRow[]
    const lowerSearch = searchText.trim().toLowerCase()
    return reviewResult.rows.filter((row) => {
      const d = clientDecisions[row.approvalItemId] ?? row.decision.value
      if (filterDecision !== 'all' && d !== filterDecision) return false
      if (filterBlocked === 'blocked' && !row.flags.blocked) return false
      if (filterBlocked === 'notBlocked' && row.flags.blocked) return false
      if (filterSuggestedAction !== 'all' && row.match.suggestedAction !== filterSuggestedAction) {
        return false
      }
      if (filterDiagnosticCode !== 'all' && !row.match.diagnosticCodes.includes(filterDiagnosticCode)) {
        return false
      }
      if (lowerSearch) {
        const raw = row.raw
        const haystack = [
          raw.courseName,
          raw.teacherText,
          raw.classText,
          raw.remark,
          raw.mergeRemark,
        ]
          .filter((v): v is string => !!v)
          .join(' ')
          .toLowerCase()
        if (!haystack.includes(lowerSearch)) return false
      }
      return true
    })
  }, [
    reviewResult,
    clientDecisions,
    filterDecision,
    filterBlocked,
    filterSuggestedAction,
    filterDiagnosticCode,
    searchText,
  ])

  const canPreview = !!file && !!selectedSemesterId && !parsing && targetSemesterMode === 'existing'
  const canReview = !!file && !!selectedSemesterId && !reviewing

  return (
    <div className="bg-white rounded-lg shadow">
      <div className="px-4 py-3 border-b">
        <h3 className="text-sm font-semibold text-gray-800 flex items-center gap-2">
          <FileSpreadsheet className="w-4 h-4" />
          Excel 课程设置识别预览
          <Badge variant="outline" className="text-xs font-normal">
            Preview Only
          </Badge>
        </h3>
        <p className="text-xs text-gray-500 mt-1">
          上传 .xlsx 课程设置文件，解析并预览识别结果。此功能为只读预览，不会修改数据库。
        </p>
      </div>

      {/* Upload area */}
      <div className="px-4 py-3 space-y-3">
        {/* L6-B + L6-C: Target semester mode + selector / create form */}
        <div className="space-y-2">
          <div className="flex items-center gap-4 flex-wrap">
            <Label className="text-xs">导入目标学期</Label>
            <label className="flex items-center gap-1.5 text-xs cursor-pointer">
              <input
                type="radio"
                name="l6c-target-semester-mode"
                value="existing"
                checked={targetSemesterMode === 'existing'}
                onChange={() => {
                  setTargetSemesterMode('existing')
                  setCreateError(null)
                }}
                className="cursor-pointer"
              />
              <span>选择已有学期</span>
            </label>
            <label className="flex items-center gap-1.5 text-xs cursor-pointer">
              <input
                type="radio"
                name="l6c-target-semester-mode"
                value="createNew"
                checked={targetSemesterMode === 'createNew'}
                onChange={() => {
                  setTargetSemesterMode('createNew')
                  setCreateError(null)
                }}
                className="cursor-pointer"
              />
              <span>新建学期</span>
            </label>
          </div>

          {targetSemesterMode === 'existing' ? (
            <>
              <select
                value={selectedSemesterId ?? ''}
                onChange={(e) => setSelectedSemesterId(e.target.value ? Number(e.target.value) : null)}
                className="w-full border border-gray-300 rounded-md px-3 py-1.5 text-sm bg-white disabled:opacity-50"
                disabled={semestersLoading}
              >
                <option value="">
                  {semestersLoading ? '加载学期中...' : '请选择目标学期'}
                </option>
                {semesters.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name} {s.isActive ? '(当前学期)' : ''}
                  </option>
                ))}
              </select>
              <p className="text-[11px] text-gray-400">
                该选择只决定本次 Excel 课程设置导入的目标学期，不会自动切换系统当前学期。
              </p>
            </>
          ) : (
            <div className="border border-blue-200 bg-blue-50/40 rounded-md p-3 space-y-2">
              <p className="text-[11px] text-blue-700">
                新建学期只会作为本次 Excel 课程设置导入的目标学期，不会自动切换系统当前学期。
              </p>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                <div className="space-y-1">
                  <Label className="text-[11px]">学期名称 (name) <span className="text-red-500">*</span></Label>
                  <Input
                    type="text"
                    value={createForm.name}
                    onChange={(e) => setCreateForm((s) => ({ ...s, name: e.target.value }))}
                    placeholder="例如：2026-2027学年春季学期"
                    className="text-xs h-8"
                    disabled={creatingSemester}
                    data-l6c-field="name"
                  />
                </div>
                <div className="space-y-1">
                  <Label className="text-[11px]">学期代码 (code) <span className="text-red-500">*</span></Label>
                  <Input
                    type="text"
                    value={createForm.code}
                    onChange={(e) => setCreateForm((s) => ({ ...s, code: e.target.value }))}
                    placeholder="例如：2027SPRING"
                    className="text-xs h-8"
                    disabled={creatingSemester}
                    data-l6c-field="code"
                  />
                </div>
                <div className="space-y-1">
                  <Label className="text-[11px]">学年 (academicYear, 可选)</Label>
                  <Input
                    type="text"
                    value={createForm.academicYear}
                    onChange={(e) => setCreateForm((s) => ({ ...s, academicYear: e.target.value }))}
                    placeholder="例如：2026-2027"
                    className="text-xs h-8"
                    disabled={creatingSemester}
                  />
                </div>
                <div className="space-y-1">
                  <Label className="text-[11px]">学期类型 (term, 可选)</Label>
                  <Input
                    type="text"
                    value={createForm.term}
                    onChange={(e) => setCreateForm((s) => ({ ...s, term: e.target.value }))}
                    placeholder="例如：春季 / 秋季 / 夏季"
                    className="text-xs h-8"
                    disabled={creatingSemester}
                  />
                </div>
                <div className="space-y-1">
                  <Label className="text-[11px]">开始日期 (startsAt, 可选)</Label>
                  <Input
                    type="date"
                    value={createForm.startsAt}
                    onChange={(e) => setCreateForm((s) => ({ ...s, startsAt: e.target.value }))}
                    className="text-xs h-8"
                    disabled={creatingSemester}
                  />
                </div>
                <div className="space-y-1">
                  <Label className="text-[11px]">结束日期 (endsAt, 可选)</Label>
                  <Input
                    type="date"
                    value={createForm.endsAt}
                    onChange={(e) => setCreateForm((s) => ({ ...s, endsAt: e.target.value }))}
                    className="text-xs h-8"
                    disabled={creatingSemester}
                  />
                </div>
              </div>
              {createError && (
                <p className="text-[11px] text-red-600 flex items-center gap-1" data-l6c-error>
                  <AlertCircle className="w-3 h-3" />
                  {createError}
                </p>
              )}
              <div className="flex items-center gap-2">
                <Button
                  size="sm"
                  onClick={() => void handleCreateSemester()}
                  disabled={creatingSemester || !createForm.name.trim() || !createForm.code.trim()}
                  data-l6c-action="create-semester"
                >
                  {creatingSemester ? (
                    <>
                      <Loader2 className="w-3.5 h-3.5 mr-1 animate-spin" />
                      创建中...
                    </>
                  ) : (
                    <>
                      <Plus className="w-3.5 h-3.5 mr-1" />
                      创建学期
                    </>
                  )}
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => {
                    setCreateForm(EMPTY_CREATE_FORM)
                    setCreateError(null)
                  }}
                  disabled={creatingSemester}
                >
                  清空表单
                </Button>
                {selectedSemesterId && (
                  <span className="text-[11px] text-blue-700 flex items-center gap-1" data-l6c-success>
                    <CheckCircle2 className="w-3 h-3" />
                    当前已选 targetSemesterId = {selectedSemesterId}
                  </span>
                )}
              </div>
            </div>
          )}
        </div>

        <div className="flex items-end gap-3 flex-wrap">
          <div className="flex-1 min-w-[200px] space-y-1">
            <Label className="text-xs">选择 .xlsx 文件</Label>
            <Input
              ref={fileInputRef}
              type="file"
              accept=".xlsx"
              onChange={(e) => setFile(e.target.files?.[0] ?? null)}
              className="text-sm"
            />
          </div>
          <div className="flex items-center gap-2">
            <Button
              size="sm"
              onClick={() => void handleUpload()}
              disabled={!canPreview}
            >
              {parsing ? (
                <>
                  <Loader2 className="w-3.5 h-3.5 mr-1 animate-spin" />
                  解析中...
                </>
              ) : (
                <>
                  <Eye className="w-3.5 h-3.5 mr-1" />
                  解析预览
                </>
              )}
            </Button>
            {/* L6-D2: 审核模式 trigger (review-only, no DB writes) */}
            <Button
              size="sm"
              variant="outline"
              onClick={() => void handleReview()}
              disabled={!canReview}
              data-l6d2-action="review"
            >
              {reviewing ? (
                <>
                  <Loader2 className="w-3.5 h-3.5 mr-1 animate-spin" />
                  生成中...
                </>
              ) : (
                <>
                  <ListChecks className="w-3.5 h-3.5 mr-1" />
                  生成审核视图
                </>
              )}
            </Button>
            {(file || result) && (
              <Button size="sm" variant="outline" onClick={handleReset}>
                重置
              </Button>
            )}
          </div>
        </div>
        {file && !result && !parsing && (
          <p className="text-xs text-gray-500 flex items-center gap-1">
            <FileSpreadsheet className="w-3.5 h-3.5" />
            {file.name} ({(file.size / 1024).toFixed(1)} KB)
          </p>
        )}
      </div>

      {/* Error */}
      {error && (
        <div className="px-4 py-3 border-t">
          <div className="bg-red-50 border border-red-200 rounded-lg p-3 text-sm text-red-700 flex items-start gap-2">
            <AlertCircle className="w-4 h-4 mt-0.5 shrink-0" />
            <span>{error}</span>
          </div>
        </div>
      )}

      {/* L6-D2: Review error */}
      {reviewError && (
        <div className="px-4 py-3 border-t">
          <div className="bg-red-50 border border-red-200 rounded-lg p-3 text-sm text-red-700 flex items-start gap-2">
            <AlertCircle className="w-4 h-4 mt-0.5 shrink-0" />
            <span>{reviewError}</span>
          </div>
        </div>
      )}

      {/* L6-D2: 审核模式 (review mode) — review-only, never writes DB */}
      {reviewResult && (
        <ReviewSection
          reviewResult={reviewResult}
          clientDecisions={clientDecisions}
          setClientDecisions={setClientDecisions}
          liveCounters={liveCounters}
          suggestedActionOptions={suggestedActionOptions}
          diagnosticCodeOptions={diagnosticCodeOptions}
          filterDecision={filterDecision}
          setFilterDecision={setFilterDecision}
          filterBlocked={filterBlocked}
          setFilterBlocked={setFilterBlocked}
          filterSuggestedAction={filterSuggestedAction}
          setFilterSuggestedAction={setFilterSuggestedAction}
          filterDiagnosticCode={filterDiagnosticCode}
          setFilterDiagnosticCode={setFilterDiagnosticCode}
          searchText={searchText}
          setSearchText={setSearchText}
          filteredRows={filteredRows}
          onExport={handleExportDecision}
        />
      )}

      {/* L6-E1: 手动处理 (manual resolution) section — read-only, never writes DB */}
      {reviewResult && resolutionItems.length > 0 && (
        <ResolutionSection
          resolutionItems={resolutionItems}
          setResolutionItems={setResolutionItems}
          resolutionOptions={resolutionOptions}
          resolutionSummary={resolutionSummary}
          resolutionFilter={resolutionFilter}
          setResolutionFilter={setResolutionFilter}
          expandedResolutionRows={expandedResolutionRows}
          toggleResolutionRow={toggleResolutionRow}
          filteredResolutionItems={filteredResolutionItems}
          onExportDraft={handleExportResolutionDraft}
          partialPlanLoading={partialPlanLoading}
          partialPlanError={partialPlanError}
          onGeneratePartialPlan={() => void handleGeneratePartialPlan()}
        />
      )}

      {/* L6-E2: Partial import plan section — read-only, no apply */}
      {partialPlan && (
        <PartialPlanSection
          plan={partialPlan}
          filter={partialPlanFilter}
          setFilter={setPartialPlanFilter}
          onExport={handleExportPartialPlan}
        />
      )}

      {/* Results */}
      {result && (
        <div className="px-4 py-3 border-t space-y-4">
          {/* Summary banner */}
          <div className="bg-amber-50 border border-amber-200 rounded-lg p-3 text-sm">
            <div className="flex items-start gap-2 text-amber-800">
              <AlertTriangle className="w-4 h-4 mt-0.5 shrink-0" />
              <div>
                <p className="font-medium">Preview Only - 此结果为只读预览</p>
                <p className="text-xs text-amber-700 mt-1">
                  当前仅为预览和人工核对，不会写入数据库。解析耗时 {(result.parser.durationMs / 1000).toFixed(1)}s，
                  识别 {result.workbookSummary.totalCourseRows} 条课程行，
                  {result.manualReviewSummary.totalRowsNeedingReview} 条需手动审核。
                  {result.rawPreview && `本预览显示 ${result.rawPreview.returnedRows}/${result.rawPreview.maxPreviewRows} 条原文记录。`}
                </p>
              </div>
            </div>
          </div>

          {/* L6-B: Target semester summary */}
          {result.targetSemester && (
            <div className="bg-blue-50 border border-blue-200 rounded-lg p-3 text-sm">
              <div className="flex items-center gap-2 mb-2 text-blue-800">
                <Database className="w-4 h-4" />
                <span className="font-medium">目标学期</span>
                {result.targetSemester.isActive && (
                  <Badge variant="secondary" className="text-xs bg-blue-100 text-blue-700">
                    当前学期
                  </Badge>
                )}
              </div>
              <div className="grid grid-cols-2 md:grid-cols-5 gap-2 text-xs text-blue-700">
                <div><span className="opacity-70">ID:</span> {result.targetSemester.id}</div>
                <div><span className="opacity-70">Code:</span> {result.targetSemester.code ?? '-'}</div>
                <div><span className="opacity-70">班级:</span> {result.targetSemester.classGroupCount}</div>
                <div><span className="opacity-70">教学任务:</span> {result.targetSemester.teachingTaskCount}</div>
                <div><span className="opacity-70">Course/Teacher:</span> {result.targetSemester.courseCount}/{result.targetSemester.teacherCount}</div>
              </div>
            </div>
          )}

          {/* Workbook summary cards */}
          <div className="grid grid-cols-2 md:grid-cols-5 gap-2">
            <SummaryCard label="Sheet 数" value={result.workbookSummary.sheetCount} />
            <SummaryCard label="已解析 Sheet" value={result.workbookSummary.parsedSheetCount} />
            <SummaryCard label="总行数" value={result.workbookSummary.totalRows} />
            <SummaryCard label="课程行" value={result.workbookSummary.totalCourseRows} />
            <SummaryCard
              label="Warnings"
              value={result.workbookSummary.totalWarnings}
              warn={result.workbookSummary.totalWarnings > 0}
            />
          </div>

          {/* L6-B: Dry-run summary cards */}
          {result.dryRunSummary && (
            <div className="bg-indigo-50 border border-indigo-200 rounded-lg p-3">
              <h4 className="text-xs font-semibold text-indigo-800 mb-2">Dry-Run 匹配摘要（目标学期上下文）</h4>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-2 text-xs">
                <div className="text-indigo-700"><span className="opacity-70">课程候选:</span> {result.dryRunSummary.courseCandidates}</div>
                <div className="text-indigo-700"><span className="opacity-70">教师候选:</span> {result.dryRunSummary.teacherCandidates}</div>
                <div className="text-indigo-700"><span className="opacity-70">班级候选:</span> {result.dryRunSummary.classGroupCandidates}</div>
                <div className="text-indigo-700"><span className="opacity-70">教学任务候选:</span> {result.dryRunSummary.teachingTaskCandidates}</div>
                <div className="text-indigo-700"><span className="opacity-70">任务班级关联:</span> {result.dryRunSummary.teachingTaskClassCandidates}</div>
                <div className="text-indigo-700"><span className="opacity-70">需人工审核:</span> {result.dryRunSummary.rowsNeedingManualReview}</div>
                <div className="text-indigo-700"><span className="opacity-70">跳过行:</span> {result.dryRunSummary.rowsSkipped}</div>
                <div className="text-indigo-700"><span className="opacity-70">existingData 范围:</span> 按目标学期</div>
              </div>
              {result.matchSummary && (
                <div className="mt-2 pt-2 border-t border-indigo-200">
                  <span className="text-[11px] font-semibold text-indigo-700">Match Summary:</span>
                  <div className="grid grid-cols-2 md:grid-cols-5 gap-1 mt-1 text-[11px] text-indigo-700">
                    {Object.entries(result.matchSummary).map(([key, buckets]) => (
                      <div key={key}>
                        <span className="font-medium">{key}:</span>{' '}
                        {Object.entries(buckets).map(([b, c]) => `${b}=${c}`).join(', ')}
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Source evidence */}
          <div className="bg-gray-50 rounded-lg p-3 text-xs text-gray-600">
            <div className="flex items-center gap-2 mb-1">
              <Info className="w-3.5 h-3.5" />
              <span className="font-medium">Source Evidence 覆盖率</span>
            </div>
            <div className="flex items-center gap-3">
              <div className="flex-1 bg-gray-200 rounded-full h-2">
                <div
                  className="bg-blue-500 rounded-full h-2 transition-all"
                  style={{ width: result.sourceEvidenceSummary.coveragePercent + '%' }}
                />
              </div>
              <span className="tabular-nums">
                {result.sourceEvidenceSummary.draftRows} / {result.workbookSummary.totalRows} 行
                ({result.sourceEvidenceSummary.coveragePercent}%)
              </span>
            </div>
          </div>

          {/* Manual review summary */}
          {result.manualReviewSummary.totalRowsNeedingReview > 0 && (
            <div className="bg-amber-50 border border-amber-200 rounded-lg p-3">
              <h4 className="text-xs font-semibold text-amber-800 mb-2 flex items-center gap-1">
                <AlertTriangle className="w-3.5 h-3.5" />
                手动审核摘要 ({result.manualReviewSummary.totalRowsNeedingReview} 条)
              </h4>
              <div className="flex flex-wrap gap-2">
                {Object.entries(result.manualReviewSummary.reasons).map(([reason, count]) => (
                  <Badge key={reason} variant="outline" className="text-xs bg-amber-100 text-amber-700 border-amber-300">
                    {reason}: {count}
                  </Badge>
                ))}
              </div>
            </div>
          )}

          {/* Field summaries */}
          <FieldSummaryTable label="班级人数分类" data={result.fieldSummary.classCount} />
          <FieldSummaryTable label="教师分配分类" data={result.fieldSummary.teacherAssignment} />
          <FieldSummaryTable label="考试类型" data={result.fieldSummary.examType} />
          <FieldSummaryTable label="周学时" data={result.fieldSummary.weeklyHours} />

          {/* Preview rows */}
          <div>
            <h4 className="text-xs font-semibold text-gray-700 mb-2">
              课程行预览 (前 {result.rawPreview?.returnedRows ?? result.previewRows.length} 条)
            </h4>
            {/* L6-B1: Admin-only notice */}
            <p className="text-[10px] text-gray-500 mb-2">
              下方表格显示 Excel 原文，仅供有权限的管理员进行导入核对；这些内容不会写入审计文档或提交到代码仓库。
            </p>
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead className="bg-gray-50 text-gray-600">
                  <tr>
                    <th className="px-2 py-1.5 text-left">#</th>
                    <th className="px-2 py-1.5 text-left">Sheet</th>
                    <th className="px-2 py-1.5 text-left">行号</th>
                    <th className="px-2 py-1.5 text-left">课程名</th>
                    <th className="px-2 py-1.5 text-left">教师</th>
                    <th className="px-2 py-1.5 text-left">班级</th>
                    <th className="px-2 py-1.5 text-left">周课时</th>
                    <th className="px-2 py-1.5 text-left">考试类型</th>
                    <th className="px-2 py-1.5 text-left">备注</th>
                    <th className="px-2 py-1.5 text-left">合班备注</th>
                    <th className="px-2 py-1.5 text-right">Conf</th>
                    <th className="px-2 py-1.5 text-left">审核</th>
                  </tr>
                </thead>
                <tbody>
                  {(result.rawPreview?.returnedRows ? result.previewRows : result.previewRows.slice(0, 50)).map((row, idx) => (
                    <PreviewRow
                      key={idx}
                      row={row}
                      expanded={expandedRows.has(idx)}
                      onToggle={() => toggleRow(idx)}
                    />
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

// -- Sub-components ----------------------------------------------------------

function SummaryCard({
  label,
  value,
  warn,
}: {
  label: string
  value: number
  warn?: boolean
}) {
  return (
    <div
      className={'rounded-lg border p-2 ' + (warn ? 'border-amber-200 bg-amber-50 text-amber-700' : 'border-gray-200 bg-white text-gray-700')}
    >
      <div className="text-xs opacity-80">{label}</div>
      <div className="text-lg font-semibold tabular-nums">{value}</div>
    </div>
  )
}

function FieldSummaryTable({ label, data }: { label: string; data: Record<string, number> }) {
  const entries = Object.entries(data)
  if (entries.length === 0) return null
  return (
    <div className="text-xs">
      <h4 className="font-semibold text-gray-700 mb-1">{label}</h4>
      <div className="flex flex-wrap gap-1.5">
        {entries.map(([k, v]) => (
          <Badge key={k} variant="secondary" className="text-xs">
            {k}: {v}
          </Badge>
        ))}
      </div>
    </div>
  )
}

function PreviewRow({
  row,
  expanded,
  onToggle,
}: {
  row: CourseSettingXlsxPreviewRow
  expanded: boolean
  onToggle: () => void
}) {
  const hasWarnings = row.warningCodes.length > 0
  return (
    <>
      <tr
        className={'border-t cursor-pointer hover:bg-gray-50 ' + (hasWarnings ? 'bg-amber-50/50' : '')}
        onClick={onToggle}
      >
        <td className="px-2 py-1.5 tabular-nums">{row.displayIndex}</td>
        <td className="px-2 py-1.5 text-[10px] max-w-[80px] truncate" title={row.sheetName ?? row.sheetNameHash}>
          {row.sheetName ?? row.sheetNameHash.slice(0, 8)}
        </td>
        <td className="px-2 py-1.5 tabular-nums">{row.sourceRowIndex}</td>
        <td className="px-2 py-1.5 text-[11px] max-w-[120px] truncate" title={row.raw?.courseName ?? ''}>
          {row.raw?.courseName ?? '-'}
        </td>
        <td className="px-2 py-1.5 text-[11px] max-w-[140px] truncate" title={row.raw?.teacherText ?? ''}>
          {row.raw?.teacherText ?? '-'}
        </td>
        <td className="px-2 py-1.5 text-[11px] max-w-[140px] truncate" title={row.raw?.classText ?? ''}>
          {row.raw?.classText ?? '-'}
        </td>
        <td className="px-2 py-1.5 tabular-nums">{row.raw?.weeklyHoursText ?? row.weeklyHoursValue ?? '-'}</td>
        <td className="px-2 py-1.5 text-[11px] max-w-[80px] truncate" title={row.raw?.examTypeText ?? ''}>
          {row.raw?.examTypeText ?? '-'}
        </td>
        <td className="px-2 py-1.5 text-[11px] max-w-[120px] truncate" title={row.raw?.remark ?? ''}>
          {row.raw?.remark ?? '-'}
        </td>
        <td className="px-2 py-1.5 text-[11px] max-w-[120px] truncate" title={row.raw?.mergeRemark ?? ''}>
          {row.raw?.mergeRemark ?? '-'}
        </td>
        <td className="px-2 py-1.5 text-right tabular-nums">
          <span className={row.confidence < 0.8 ? 'text-amber-600 font-semibold' : ''}>
            {row.confidence.toFixed(2)}
          </span>
        </td>
        <td className="px-2 py-1.5">
          {row.needsManualReview && (
            <Badge variant="outline" className="text-[10px] bg-amber-100 text-amber-700 border-amber-300">
              manualReview
            </Badge>
          )}
        </td>
      </tr>
      {expanded && (
        <tr className="bg-gray-50">
          <td colSpan={12} className="px-4 py-2 text-[10px] text-gray-600">
            <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
              <div>
                <span className="font-medium">年级专业 (raw): </span>
                <span className="text-[11px]">{row.raw?.majorName ?? '-'}</span>
              </div>
              <div>
                <span className="font-medium">课程名 Hash: </span>
                <span className="font-mono">{row.courseNameHash ?? '-'}</span>
              </div>
              <div>
                <span className="font-medium">教师 Hash: </span>
                <span className="font-mono">{row.teacherRawHash ?? '-'}</span>
              </div>
              <div>
                <span className="font-medium">班级 Hash: </span>
                <span className="font-mono">{row.classCountRawHash ?? '-'}</span>
              </div>
              <div>
                <span className="font-medium">备注 Hash: </span>
                <span className="font-mono">{row.remarkHash ?? '-'}</span>
              </div>
              <div>
                <span className="font-medium">合班备注 Hash: </span>
                <span className="font-mono">{row.mergeRemarkHash ?? '-'}</span>
              </div>
              <div>
                <span className="font-medium">Sheet Hash: </span>
                <span className="font-mono">{row.sheetNameHash}</span>
              </div>
              {row.warningCodes.length > 0 && (
                <div className="col-span-2 md:col-span-4">
                  <span className="font-medium">Warning codes: </span>
                  {row.warningCodes.map((code) => (
                    <Badge key={code} variant="outline" className="text-[10px] mr-1 bg-red-50 text-red-600 border-red-200">
                      {code}
                    </Badge>
                  ))}
                </div>
              )}
              {row.manualReviewReasons.length > 0 && (
                <div className="col-span-2 md:col-span-4">
                  <span className="font-medium">手动审核原因: </span>
                  {row.manualReviewReasons.map((r) => (
                    <Badge key={r} variant="outline" className="text-[10px] mr-1 bg-amber-50 text-amber-700 border-amber-200">
                      {r}
                    </Badge>
                  ))}
                </div>
              )}
            </div>
          </td>
        </tr>
      )}
    </>
  )
}

// ── L6-D2: 审核模式 sub-components ──────────────────────────────────────────

type ReviewCounters = {
  total: number
  pending: number
  approved: number
  rejected: number
  needsReview: number
}

function ReviewSection(props: {
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
  onExport: () => void
}) {
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
            <span className="font-mono">{reviewResult.packageRef.dryRunFingerprintHash.slice(0, 16)}…</span>
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
              (显示 {filteredRows.length} / {liveCounters.total} 条)
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

      {/* Review table */}
      <div className="overflow-x-auto">
        <table className="w-full text-xs">
          <thead className="bg-gray-50 text-gray-600">
            <tr>
              <th className="px-2 py-1.5 text-left">审核项ID</th>
              <th className="px-2 py-1.5 text-left">工作表</th>
              <th className="px-2 py-1.5 text-left">行号</th>
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
                <td colSpan={15} className="px-4 py-6 text-center text-gray-400">
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

function ReviewSummaryCard({
  label,
  value,
  tone,
}: {
  label: string
  value: number
  tone: 'default' | 'muted' | 'success' | 'danger' | 'warn'
}) {
  const toneClass =
    tone === 'success'
      ? 'border-green-200 bg-green-50 text-green-700'
      : tone === 'danger'
        ? 'border-red-200 bg-red-50 text-red-700'
        : tone === 'warn'
          ? 'border-amber-200 bg-amber-50 text-amber-700'
          : tone === 'muted'
            ? 'border-gray-200 bg-gray-50 text-gray-700'
            : 'border-indigo-200 bg-indigo-50 text-indigo-700'
  return (
    <div className={'rounded-lg border p-2 ' + toneClass}>
      <div className="text-[10px] opacity-80">{label}</div>
      <div className="text-base font-semibold tabular-nums">{value}</div>
    </div>
  )
}

function ReviewRow({
  row,
  decisionValue,
  onDecisionChange,
}: {
  row: CourseSettingApprovalReviewUiRow
  decisionValue: CourseSettingApprovalReviewUiDecisionValue
  onDecisionChange: (v: CourseSettingApprovalReviewUiDecisionValue) => void
}) {
  const truncatedId =
    row.approvalItemId.length > 14 ? row.approvalItemId.slice(0, 14) + '…' : row.approvalItemId
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

// -- L6-E2: Partial Import Plan Sub-component ---------------------------------

type PartialPlanSectionProps = {
  plan: CourseSettingPartialImportPlanResponse
  filter: 'importable' | 'skipped' | 'unresolved' | 'candidates' | 'duplicates' | 'blockers'
  setFilter: (v: 'importable' | 'skipped' | 'unresolved' | 'candidates' | 'duplicates' | 'blockers') => void
  onExport: () => void
}

function PartialPlanSection({ plan, filter, setFilter, onExport }: PartialPlanSectionProps) {
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
        <span className="text-[11px] text-gray-500 ml-auto">
          {plan.targetSemester.name} (ID {plan.targetSemester.id})
        </span>
      </div>

      <div className="bg-emerald-50 border border-emerald-200 rounded-lg p-3 text-sm text-emerald-800 flex items-start gap-2">
        <Info className="w-4 h-4 mt-0.5 shrink-0" />
        <span>当前仅生成导入计划，不会写入数据库，不会创建教学任务或导入批次。</span>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-5 gap-2">
        <PartialPlanSummaryCard label="计划导入" value={s.plannedImportRows} tone="success" />
        <PartialPlanSummaryCard label="跳过" value={s.skippedRows} tone="muted" />
        <PartialPlanSummaryCard label="仍需处理" value={s.unresolvedRows} tone="warn" />
        <PartialPlanSummaryCard label="已忽略" value={s.ignoredRows} tone="muted" />
        <PartialPlanSummaryCard label="阻塞项" value={s.blockingRows} tone="danger" />
      </div>
      <div className="grid grid-cols-2 md:grid-cols-5 gap-2">
        <PartialPlanSummaryCard label="课程候选" value={s.courseCreateCandidates} tone="default" />
        <PartialPlanSummaryCard
          label="教师候选"
          value={s.teacherCreateCandidates}
          tone="muted"
          extra="L6-E1C 处理"
        />
        <PartialPlanSummaryCard label="班级候选" value={s.classGroupCreateCandidates} tone="default" />
        <PartialPlanSummaryCard label="教学任务候选" value={s.teachingTaskCandidates} tone="default" />
        <PartialPlanSummaryCard label="任务-班级关联" value={s.teachingTaskClassCandidates} tone="default" />
      </div>
      <div className="grid grid-cols-2 md:grid-cols-3 gap-2">
        <PartialPlanSummaryCard
          label="applyReadyForFutureStage"
          value={s.applyReadyForFutureStage ? 1 : 0}
          tone={s.applyReadyForFutureStage ? 'success' : 'muted'}
        />
        <PartialPlanSummaryCard
          label="重复风险"
          value={s.duplicateRiskRows}
          tone={s.duplicateRiskRows > 0 ? 'warn' : 'muted'}
        />
        <div className="flex items-center gap-2">
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
      </div>

      <div className="flex items-center gap-2 flex-wrap">
        <Label className="text-[11px] text-gray-600">查看</Label>
        <select
          value={filter}
          onChange={(e) => setFilter(e.target.value as PartialPlanSectionProps['filter'])}
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

function PartialPlanSummaryCard({
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
  const toneClass =
    tone === 'success'
      ? 'border-green-200 bg-green-50 text-green-700'
      : tone === 'danger'
        ? 'border-red-200 bg-red-50 text-red-700'
        : tone === 'warn'
          ? 'border-amber-200 bg-amber-50 text-amber-700'
          : tone === 'muted'
            ? 'border-gray-200 bg-gray-50 text-gray-700'
            : 'border-emerald-200 bg-emerald-50 text-emerald-700'
  return (
    <div className={'rounded-lg border p-2 ' + toneClass}>
      <div className="text-[10px] opacity-80">{label}</div>
      <div className="text-base font-semibold tabular-nums">{value}</div>
      {extra && <div className="text-[10px] opacity-60">{extra}</div>}
    </div>
  )
}

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
              <td className="px-2 py-1.5 font-mono text-[10px]">{r.approvalItemId.slice(0, 14)}…</td>
              <td className="px-2 py-1.5 text-right tabular-nums">{r.sheetIndex}</td>
              <td className="px-2 py-1.5 text-right tabular-nums">{r.sourceRowIndex}</td>
              <td className="px-2 py-1.5">
                {r.plannedCourseAction === 'useExisting' && r.resolvedCourseId != null
                  ? <span className="text-green-700">已有 (ID:{r.resolvedCourseId})</span>
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
              <td className="px-2 py-1.5 font-mono text-[10px]">{r.approvalItemId.slice(0, 14)}…</td>
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
              <td className="px-2 py-1.5 font-mono text-[10px]">{r.approvalItemId.slice(0, 14)}…</td>
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
                <th className="px-2 py-1.5 text-right">置信度</th>
              </tr>
            </thead>
            <tbody>
              {courses.map((c) => (
                <tr key={c.candidateKey} className="border-t">
                  <td className="px-2 py-1.5 font-mono text-[10px]">{c.candidateKey}</td>
                  <td className="px-2 py-1.5">{c.candidateName}</td>
                  <td className="px-2 py-1.5 text-right tabular-nums">{c.approvalItemIds.length}</td>
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
              <td className="px-2 py-1.5 font-mono text-[10px]">{r.approvalItemId.slice(0, 14)}…</td>
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
              <td className="px-2 py-1.5 font-mono text-[10px]">{r.approvalItemId.slice(0, 14)}…</td>
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

// -- L6-E1: Manual Resolution Sub-component -----------------------------------

type ResolutionSectionProps = {
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
  // L6-E2: plan trigger
  partialPlanLoading: boolean
  partialPlanError: string | null
  onGeneratePartialPlan: () => void
}

function ResolutionSection({
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
  partialPlanLoading,
  partialPlanError,
  onGeneratePartialPlan,
}: ResolutionSectionProps) {
  const updateItem = (approvalItemId: string, patch: Record<string, unknown>) => {
    // The flat patch shape is the canonical UI form: each control sends
    // `{ course: {...} }` or `{ ignored: true }` directly. The helper
    // (applyManualResolutionUpdate) accepts both this flat shape and
    // the `{ resolution: {...} }` wrapper, but we always pass the flat
    // form here so behaviour is uniform and unambiguous.
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
              <th className="px-2 py-1.5 text-left">课程名</th>
              <th className="px-2 py-1.5 text-left">教师</th>
              <th className="px-2 py-1.5 text-left">诊断</th>
              <th className="px-2 py-1.5 text-left">建议处理</th>
              <th className="px-2 py-1.5 text-left">状态</th>
              <th className="px-2 py-1.5 text-left">操作</th>
            </tr>
          </thead>
          <tbody>
            {filteredResolutionItems.length === 0 ? (
              <tr>
                <td colSpan={7} className="px-4 py-6 text-center text-gray-400">
                  当前筛选下没有处理项
                </td>
              </tr>
            ) : (
              filteredResolutionItems.map((item) => {
                const isExpanded = expandedResolutionRows.has(item.approvalItemId)
                return (
                  <ResolutionItemRow
                    key={item.approvalItemId}
                    item={item}
                    resolutionOptions={resolutionOptions}
                    isExpanded={isExpanded}
                    onToggle={() => toggleResolutionRow(item.approvalItemId)}
                    onUpdate={(patch) => updateItem(item.approvalItemId, patch)}
                  />
                )
              })
            )}
          </tbody>
        </table>
      </div>
    </div>
  )
}

function ResolutionItemRow({
  item,
  resolutionOptions,
  isExpanded,
  onToggle,
  onUpdate,
}: {
  item: CourseSettingManualResolutionItem
  resolutionOptions: CourseSettingResolutionOptionsResponse | null
  isExpanded: boolean
  onToggle: () => void
  onUpdate: (patch: Record<string, unknown>) => void
}) {
  const truncatedId = item.approvalItemId.length > 16 ? item.approvalItemId.slice(0, 16) + '…' : item.approvalItemId
  const hasCourseMissing = item.baseDiagnosticCodes.includes('COURSE_MISSING')
  const hasTeacherMissing = item.baseDiagnosticCodes.includes('TEACHER_MISSING') || item.baseDiagnosticCodes.includes('TEACHER_BLANK')
  const hasClassMissing = item.baseDiagnosticCodes.includes('CLASS_GROUP_MISSING')
  const hasHoursInvalid = item.baseDiagnosticCodes.includes('WEEKLY_HOURS_NON_NUMERIC')
  const hasExamInvalid = item.baseDiagnosticCodes.includes('EXAM_TYPE_OTHER')
  const hasAmbiguous = item.baseDiagnosticCodes.includes('MERGE_REMARK_AMBIGUOUS')
  const hasLowConf = item.baseDiagnosticCodes.includes('LOW_CONFIDENCE_ROW')

  const statusBadge = (status: CourseSettingResolutionStatus) => {
    const cls =
      status === 'importable' ? 'bg-green-100 text-green-700 border-green-200'
        : status === 'needsResolution' ? 'bg-amber-100 text-amber-700 border-amber-200'
          : status === 'ignored' ? 'bg-gray-100 text-gray-500 border-gray-200'
            : 'bg-blue-100 text-blue-700 border-blue-200'
    const label =
      status === 'importable' ? '可导入'
        : status === 'needsResolution' ? '需处理'
          : status === 'ignored' ? '已忽略'
            : '暂不处理'
    return <Badge variant="outline" className={`text-[10px] ${cls}`}>{label}</Badge>
  }

  return (
    <>
      <tr className="border-t hover:bg-indigo-50/30">
        <td className="px-2 py-1.5 font-mono text-[10px]" title={item.approvalItemId}>{truncatedId}</td>
        <td className="px-2 py-1.5 text-[10px] max-w-[120px] truncate" title={item.resolution.course?.candidateName ?? ''}>
          {item.resolution.course?.action === 'useExistingCourse' && item.resolution.course.existingCourseId
            ? <span className="text-green-700">已选择 (ID:{item.resolution.course.existingCourseId})</span>
            : item.resolution.course?.action === 'createCourseCandidate' && item.resolution.course.candidateName
              ? <span className="text-blue-700">新候选：{item.resolution.course.candidateName}</span>
              : <span className="text-gray-400">—</span>}
        </td>
        <td className="px-2 py-1.5 text-[10px] max-w-[120px] truncate">
          {item.resolution.teacher?.action === 'useExistingTeacher' && item.resolution.teacher.existingTeacherId
            ? <span className="text-green-700">已选择 (ID:{item.resolution.teacher.existingTeacherId})</span>
            : item.resolution.teacher?.action === 'createTeacherCandidate' && item.resolution.teacher.candidateName
              ? <span className="text-blue-700">新候选：{item.resolution.teacher.candidateName}</span>
              : item.resolution.teacher?.action === 'allowBlankTeacher'
                ? <span className="text-gray-500">允许暂缺</span>
                : <span className="text-gray-400">—</span>}
        </td>
        <td className="px-2 py-1.5">
          <div className="flex flex-wrap gap-1 max-w-[120px]">
            {item.baseDiagnosticCodes.length === 0 ? (
              <span className="text-gray-400">-</span>
            ) : (
              item.baseDiagnosticCodes.slice(0, 3).map((code) => (
                <Badge key={code} variant="outline" className="text-[9px] bg-red-50 text-red-600 border-red-200">
                  {formatDiagnosticCodeLabel(code)}
                </Badge>
              ))
            )}
          </div>
        </td>
        <td className="px-2 py-1.5 text-[10px]">{formatSuggestedActionLabel(item.baseSuggestedAction)}</td>
        <td className="px-2 py-1.5">{statusBadge(item.resolutionStatus)}</td>
        <td className="px-2 py-1.5">
          <Button
            size="sm"
            variant="ghost"
            className="text-[10px] h-6 px-2"
            onClick={onToggle}
            data-l6e1-toggle={item.approvalItemId}
          >
            {isExpanded ? <ChevronDown className="w-3 h-3" /> : <ChevronRight className="w-3 h-3" />}
            {isExpanded ? '收起' : '处理'}
          </Button>
        </td>
      </tr>
      {isExpanded && (
        <tr>
          <td colSpan={7} className="px-4 py-3 bg-indigo-50/50 border-t border-indigo-100">
            <div className="space-y-3 text-[11px]">
              {/* Course resolution */}
              {hasCourseMissing && (
                <div className="space-y-1" data-l6e1-course-controls={item.approvalItemId}>
                  <span className="font-medium text-red-700">课程缺失</span>
                  <div className="flex gap-2 items-center">
                    <select
                      className="border border-gray-300 rounded px-2 py-0.5 text-[11px] bg-white max-w-[200px]"
                      value={item.resolution.course?.existingCourseId ?? ''}
                      onChange={(e) => onUpdate({ course: { action: 'useExistingCourse', existingCourseId: e.target.value ? Number(e.target.value) : undefined } })}
                    >
                      <option value="">选择已有课程</option>
                      {resolutionOptions?.courses.map((c) => (
                        <option key={c.id} value={c.id}>{c.name}</option>
                      ))}
                    </select>
                    <span className="text-gray-400">或</span>
                    <Input
                      placeholder="新课程候选名称"
                      className="text-[11px] h-6 max-w-[160px]"
                      value={item.resolution.course?.candidateName ?? ''}
                      onChange={(e) => onUpdate({ course: { action: 'createCourseCandidate', candidateName: e.target.value || undefined } })}
                    />
                  </div>
                </div>
              )}

              {/* Teacher resolution */}
              {hasTeacherMissing && (
                <div className="space-y-1" data-l6e1-teacher-controls={item.approvalItemId}>
                  <span className="font-medium text-red-700">教师缺失</span>
                  <div className="flex gap-2 items-center flex-wrap">
                    <select
                      className="border border-gray-300 rounded px-2 py-0.5 text-[11px] bg-white max-w-[200px]"
                      value={item.resolution.teacher?.existingTeacherId ?? ''}
                      onChange={(e) => onUpdate({ teacher: { action: 'useExistingTeacher', existingTeacherId: e.target.value ? Number(e.target.value) : undefined } })}
                    >
                      <option value="">选择已有教师</option>
                      {resolutionOptions?.teachers.map((t) => (
                        <option key={t.id} value={t.id}>{t.name}</option>
                      ))}
                    </select>
                    <span className="text-gray-400">或</span>
                    <Input
                      placeholder="新教师候选名称"
                      className="text-[11px] h-6 max-w-[160px]"
                      value={item.resolution.teacher?.candidateName ?? ''}
                      onChange={(e) => onUpdate({ teacher: { action: 'createTeacherCandidate', candidateName: e.target.value || undefined } })}
                    />
                    <label className="flex items-center gap-1 text-[11px]">
                      <input
                        type="checkbox"
                        checked={item.resolution.teacher?.action === 'allowBlankTeacher'}
                        onChange={(e) => onUpdate({ teacher: e.target.checked ? { action: 'allowBlankTeacher', allowBlankReason: '用户允许暂缺' } : { action: 'none' } })}
                      />
                      允许暂缺
                    </label>
                  </div>
                </div>
              )}

              {/* ClassGroup resolution */}
              {hasClassMissing && (
                <div className="space-y-1" data-l6e1-class-controls={item.approvalItemId}>
                  <span className="font-medium text-red-700">班级缺失</span>
                  <div className="flex gap-2 items-center">
                    <select
                      className="border border-gray-300 rounded px-2 py-0.5 text-[11px] bg-white max-w-[200px]"
                      value={item.resolution.classGroups?.existingClassGroupIds?.[0] ?? ''}
                      onChange={(e) => onUpdate({ classGroups: e.target.value ? { action: 'useExistingClassGroup', existingClassGroupIds: [Number(e.target.value)] } : { action: 'none' } })}
                    >
                      <option value="">选择已有班级</option>
                      {resolutionOptions?.classGroups.map((cg) => (
                        <option key={cg.id} value={cg.id}>{cg.name}{cg.studentCount ? ` (${cg.studentCount}人)` : ''}</option>
                      ))}
                    </select>
                    <span className="text-gray-400">或</span>
                    <Input
                      placeholder="新班级候选名称"
                      className="text-[11px] h-6 max-w-[160px]"
                      value={item.resolution.classGroups?.candidateNames?.[0] ?? ''}
                      onChange={(e) => onUpdate({ classGroups: e.target.value ? { action: 'createClassGroupCandidate', candidateNames: [e.target.value] } : { action: 'none' } })}
                    />
                  </div>
                </div>
              )}

              {/* Weekly hours override */}
              {hasHoursInvalid && (
                <div className="flex gap-2 items-center" data-l6e1-hours-controls={item.approvalItemId}>
                  <span className="font-medium text-amber-700">周课时异常</span>
                  <Input
                    type="number"
                    placeholder="修正周课时"
                    className="text-[11px] h-6 w-24"
                    min={1}
                    max={20}
                    value={item.resolution.weeklyHours?.value ?? ''}
                    onChange={(e) => {
                      const v = Number(e.target.value)
                      onUpdate({ weeklyHours: e.target.value ? { action: 'overrideWeeklyHours', value: v } : { action: 'none' } })
                    }}
                  />
                </div>
              )}

              {/* Exam type override */}
              {hasExamInvalid && (
                <div className="flex gap-2 items-center" data-l6e1-exam-controls={item.approvalItemId}>
                  <span className="font-medium text-amber-700">考试类型异常</span>
                  <select
                    className="border border-gray-300 rounded px-2 py-0.5 text-[11px] bg-white"
                    value={item.resolution.examType?.value ?? ''}
                    onChange={(e) => onUpdate({ examType: e.target.value ? { action: 'overrideExamType', value: e.target.value } : { action: 'none' } })}
                  >
                    <option value="">空</option>
                    <option value="考试">考试</option>
                    <option value="考查">考查</option>
                  </select>
                </div>
              )}

              {/* Ambiguous mapping */}
              {hasAmbiguous && (
                <div className="space-y-1" data-l6e1-ambiguous-controls={item.approvalItemId}>
                  <span className="font-medium text-amber-700">匹配歧义</span>
                  <div className="flex gap-2 items-center">
                    <label className="flex items-center gap-1 text-[11px]">
                      <input type="radio" name={`amb-${item.approvalItemId}`} checked={item.resolution.ambiguousMapping?.action === 'confirmAmbiguousMapping'} onChange={() => onUpdate({ ambiguousMapping: { action: 'confirmAmbiguousMapping' } })} />
                      确认当前匹配
                    </label>
                    <label className="flex items-center gap-1 text-[11px]">
                      <input type="radio" name={`amb-${item.approvalItemId}`} checked={item.resolution.ambiguousMapping?.action === 'markNeedsReview'} onChange={() => onUpdate({ ambiguousMapping: { action: 'markNeedsReview' } })} />
                      标记需复核
                    </label>
                    <Input placeholder="处理备注" className="text-[11px] h-6 max-w-[160px]" value={item.resolution.ambiguousMapping?.note ?? ''} onChange={(e) => onUpdate({ ambiguousMapping: { action: item.resolution.ambiguousMapping?.action ?? 'confirmAmbiguousMapping', note: e.target.value } })} />
                  </div>
                </div>
              )}

              {/* Low confidence */}
              {hasLowConf && (
                <div className="flex gap-2 items-center" data-l6e1-lowconf-controls={item.approvalItemId}>
                  <span className="font-medium text-amber-700">低置信度</span>
                  <label className="flex items-center gap-1 text-[11px]">
                    <input type="radio" name={`lc-${item.approvalItemId}`} checked={item.resolution.ambiguousMapping?.action === 'confirmAmbiguousMapping'} onChange={() => onUpdate({ ambiguousMapping: { action: 'confirmAmbiguousMapping' } })} />
                    手动确认
                  </label>
                  <label className="flex items-center gap-1 text-[11px]">
                    <input type="radio" name={`lc-${item.approvalItemId}`} checked={item.resolution.ambiguousMapping?.action === 'markNeedsReview'} onChange={() => onUpdate({ ambiguousMapping: { action: 'markNeedsReview' } })} />
                    需复核
                  </label>
                </div>
              )}

              {/* Ignore row — always available */}
              <div className="pt-1 border-t border-indigo-100 flex gap-2 items-center" data-l6e1-ignore-controls={item.approvalItemId}>
                <Button
                  size="sm"
                  variant={item.resolution.ignored ? 'default' : 'outline'}
                  className="text-[10px] h-6"
                  onClick={() => onUpdate({ ignored: !item.resolution.ignored, ignoreReason: item.resolution.ignored ? undefined : item.resolution.ignoreReason })}
                >
                  {item.resolution.ignored ? '取消忽略' : '忽略本行'}
                </Button>
                {item.resolution.ignored && (
                  <Input
                    placeholder="忽略原因"
                    className="text-[11px] h-6 max-w-[200px]"
                    value={item.resolution.ignoreReason ?? ''}
                    onChange={(e) => onUpdate({ ignoreReason: e.target.value })}
                  />
                )}
              </div>
            </div>
          </td>
        </tr>
      )}
    </>
  )
}
