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
  applyCourseSettingPartialImport,
  computePlanHashClient,
  type CourseSettingXlsxPreviewResponse,
  type CourseSettingXlsxPreviewRow,
  type SemesterListItem,
  type CourseSettingApprovalReviewUiResponse,
  type CourseSettingApprovalReviewUiRow,
  type CourseSettingApprovalReviewUiDecisionValue,
  type CourseSettingResolutionOptionsResponse,
  type CourseSettingPartialImportPlanResponse,
  type CourseSettingApplyResponse,
} from '@/lib/import/course-setting-xlsx-client'
import type { TargetSemesterMode, CreateSemesterFormState } from './course-setting/course-setting-ui-types'
import {
  type CourseSettingManualResolutionItem,
  type CourseSettingResolutionStatus,
  buildInitialManualResolutionState,
  summarizeManualResolutionState,
} from '@/lib/import/course-setting-manual-resolution-l6-e1'
import { detectTaskSplitCandidates } from '@/lib/import/course-setting-task-split-detection-l6-e2c'
import { ApprovalReviewSection } from './course-setting/course-setting-approval-review-section'
// eslint-disable-next-line @typescript-eslint/no-unused-vars
import type { ReviewCounters } from './course-setting/course-setting-approval-review-section'
import { ManualResolutionSection } from './course-setting/course-setting-manual-resolution-section'
import { PartialPlanSection } from './course-setting/course-setting-partial-import-plan-section'
import { ApplyExecutionSection } from './course-setting/course-setting-apply-execution-section'
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
  // L7-F: apply execution state
  const [applyResult, setApplyResult] = useState<CourseSettingApplyResponse | null>(null)
  const [applyError, setApplyError] = useState<string | null>(null)
  const [applyLoading, setApplyLoading] = useState(false)
  // L7-A2: pagination state for approval review and manual resolution tables
  const PAGE_SIZE = 50
  const [reviewPage, setReviewPage] = useState(1)
  const [resolutionPage, setResolutionPage] = useState(1)
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
      // L7-A2A: surface the real full-dataset total to the user; never
      // report pageSize as the total.
      const total = data.reviewDatasetSummary?.totalReviewItems ?? data.summary.totalItems
      toast.success('审核视图已生成', {
        description: `共 ${total} 条审核项（${data.reviewDatasetSummary?.dataScope ?? 'fullDataset'}），不会写入数据库`,
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
  // L7-F: Apply execution handlers
  const runApply = useCallback(
    async (confirmToken: string, dryRunOnly: boolean) => {
      if (!file) {
        toast.error('请选择 .xlsx 课程设置文件')
        return
      }
      if (!selectedSemesterId) {
        toast.error('请先选择导入目标学期')
        return
      }
      if (!partialPlan) {
        toast.error('请先生成部分导入计划')
        return
      }
      if (!dryRunOnly && !confirmToken) {
        toast.error('请输入确认口令')
        return
      }
      setApplyLoading(true)
      setApplyError(null)
      setApplyResult(null)
      try {
        const expectedToken = `APPLY_XLSX_COURSE_SETTING_${selectedSemesterId}`
        if (!dryRunOnly && confirmToken !== expectedToken) {
          throw new Error('确认口令与目标学期不匹配')
        }
        const planHash = await computePlanHashClient(partialPlan)
        const data = await applyCourseSettingPartialImport(
          file,
          selectedSemesterId,
          resolutionItems,
          confirmToken,
          planHash,
          { dryRunOnly },
        )
        setApplyResult(data)
        if (data.dbWritten) {
          toast.success('导入执行成功', {
            description: `ImportBatch ${data.importBatchId} · 课程 ${data.summary.createdCourses} · 教学任务 ${data.summary.createdTeachingTasks}`,
          })
        } else if (data.dryRunOnly) {
          toast.info('试运行完成（未写入数据库）', {
            description: `将创建课程 ${data.summary.createdCourses ?? 0} · 教学任务 ${data.summary.createdTeachingTasks ?? 0}`,
          })
        } else {
          toast.warning('导入未完成', {
            description: '请查看 Post-Apply Audit 结果',
          })
        }
      } catch (e: unknown) {
        const msg = e instanceof Error ? e.message : String(e)
        setApplyError(msg)
        toast.error(dryRunOnly ? '试运行失败' : '导入执行失败', { description: msg })
      } finally {
        setApplyLoading(false)
      }
    },
    [file, selectedSemesterId, partialPlan, resolutionItems],
  )
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
  // L6-E2B: build raw context map from reviewResult.rows for expanded resolution context
  type ReviewRawContext = { courseName: string | null; teacherText: string | null; classText: string | null; remark: string | null; mergeRemark: string | null; weeklyHoursText: string | null; examTypeText: string | null; majorName: string | null; sheetIndex: number; sheetName: string | null; sourceRowIndex: number; suggestedAction: string; diagnosticCodes: string[]; confidence: number }
  const reviewRawMap = useMemo(() => {
    const map = new Map<string, ReviewRawContext | null>()
    if (reviewResult) {
      for (const row of reviewResult.rows) {
        map.set(row.approvalItemId, {
          courseName: row.raw.courseName ?? null,
          teacherText: row.raw.teacherText ?? null,
          classText: row.raw.classText ?? null,
          remark: row.raw.remark ?? null,
          mergeRemark: row.raw.mergeRemark ?? null,
          weeklyHoursText: row.raw.weeklyHoursText ?? null,
          examTypeText: row.raw.examTypeText ?? null,
          majorName: (row.raw as Record<string, unknown>)['majorName'] as string | null ?? null,
          sheetIndex: row.source.sheetIndex,
          sheetName: row.source.sheetName,
          sourceRowIndex: row.source.sourceRowIndex,
          suggestedAction: row.match.suggestedAction,
          diagnosticCodes: row.match.diagnosticCodes,
          confidence: row.match.confidence,
        })
      }
    }
    return map
  }, [reviewResult])
  // L6-E2E: run real task split detection client-side for display in the
  // expanded resolution row. Pass existing teachers/classes (from
  // resolutionOptions) for match resolution. Pure function — no DB writes.
  type SplitCandidate = {
    candidateId: string
    kind: string
    confidence: number
    requiresManualConfirmation: boolean
    meta: { weeklyHours: number | null; weeklyHoursText: string | null; examType: string | null; examTypeText: string | null }
    assignments: Array<{
      assignmentId: string
      teacherRaw: string
      teacherNameHash: string
      teacherId: number | null
      teacherMatchStatus: string
      classRaw: string
      classNameHashes: string[]
      classGroupIds: number[]
      classMatchStatus: string
      warningCodes: string[]
    }>
    warningCodes: string[]
  }
  const splitCandidatesById = useMemo(() => {
    const map = new Map<string, SplitCandidate[]>()
    if (reviewResult) {
      for (const row of reviewResult.rows) {
        if (!row.match.diagnosticCodes.includes('TASK_SPLIT_REQUIRED')) continue
        // Map resolution options to the input shape expected by the detection
        const existingTeachers = (resolutionOptions?.teachers ?? []).map((t) => ({ id: t.id, name: t.name }))
        const existingClassGroups = (resolutionOptions?.classGroups ?? []).map((cg) => ({ id: cg.id, name: cg.name, semesterId: selectedSemesterId ?? null }))
        const result = detectTaskSplitCandidates({
          approvalItemId: row.approvalItemId,
          sheetName: row.source.sheetName ?? null,
          sheetIndex: row.source.sheetIndex,
          sourceRowIndex: row.source.sourceRowIndex,
          majorName: (row.raw as Record<string, unknown>)['majorName'] as string | null ?? null,
          majorNameHash: null,
          courseName: row.raw.courseName ?? null,
          teacherText: row.raw.teacherText ?? null,
          classText: row.raw.classText ?? null,
          remark: row.raw.remark ?? null,
          mergeRemark: row.raw.mergeRemark ?? null,
          weeklyHours: null,
          weeklyHoursText: row.raw.weeklyHoursText ?? null,
          examType: null,
          examTypeText: row.raw.examTypeText ?? null,
          diagnosticCodes: row.match.diagnosticCodes,
          suggestedAction: row.match.suggestedAction,
          existingTeachers,
          existingClassGroups,
        })
        if (result.hasSplitDetection) {
          map.set(row.approvalItemId, result.candidates as unknown as SplitCandidate[])
        }
      }
    }
    return map
  }, [reviewResult, resolutionOptions, selectedSemesterId])
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
  // L7-A2: pagination computations
  const totalFilteredReviewRows = filteredRows.length
  const totalReviewPages = Math.max(1, Math.ceil(totalFilteredReviewRows / PAGE_SIZE))
  // Clamp page to valid range
  const effectiveReviewPage = Math.min(reviewPage, totalReviewPages)
  const paginatedFilteredRows = filteredRows.slice(
    (effectiveReviewPage - 1) * PAGE_SIZE,
    effectiveReviewPage * PAGE_SIZE,
  )
  const totalFilteredResolutionItems = filteredResolutionItems.length
  const totalResolutionPages = Math.max(1, Math.ceil(totalFilteredResolutionItems / PAGE_SIZE))
  const effectiveResolutionPage = Math.min(resolutionPage, totalResolutionPages)
  const paginatedFilteredResolutionItems = filteredResolutionItems.slice(
    (effectiveResolutionPage - 1) * PAGE_SIZE,
    effectiveResolutionPage * PAGE_SIZE,
  )

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
          {/* L7-A: show new template badge when applicable */}
          {result && result.previewRows.some((r) => (r as Record<string, unknown>)['templateVersion'] === 'new-course-setting-a-m-v2') && (
            <Badge variant="outline" className="text-xs font-normal bg-blue-50 text-blue-700 border-blue-200">
              新版课程设置模板规则（A:M 固定列）
            </Badge>
          )}
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
        <ApprovalReviewSection
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
          filteredRows={paginatedFilteredRows}
          totalFilteredCount={totalFilteredReviewRows}
          currentPage={effectiveReviewPage}
          totalPages={totalReviewPages}
          pageSize={PAGE_SIZE}
          onPageChange={setReviewPage}
          onExport={handleExportDecision}
        />
      )}
      {/* L6-E1: 手动处理 (manual resolution) section — read-only, never writes DB */}
      {reviewResult && resolutionItems.length > 0 && (
        <ManualResolutionSection
          resolutionItems={resolutionItems}
          setResolutionItems={setResolutionItems}
          resolutionOptions={resolutionOptions}
          resolutionSummary={resolutionSummary}
          resolutionFilter={resolutionFilter}
          setResolutionFilter={setResolutionFilter}
          expandedResolutionRows={expandedResolutionRows}
          toggleResolutionRow={toggleResolutionRow}
          filteredResolutionItems={paginatedFilteredResolutionItems}
          totalFilteredCount={totalFilteredResolutionItems}
          currentPage={effectiveResolutionPage}
          totalPages={totalResolutionPages}
          pageSize={PAGE_SIZE}
          onPageChange={setResolutionPage}
          onExportDraft={handleExportResolutionDraft}
          reviewRawMap={reviewRawMap}
          splitCandidatesById={splitCandidatesById}
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
      {/* L7-F: Apply execution section — controlled write panel */}
      {partialPlan && selectedSemesterId && (
        <ApplyExecutionSection
          plan={partialPlan}
          targetSemesterId={selectedSemesterId}
          onApply={(token) => void runApply(token, false)}
          onDryRun={() => void runApply('', true)}
          applyLoading={applyLoading}
          applyResult={applyResult}
          applyError={applyError}
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
// ── Sub-components (extracted to course-setting/ directory) ────────────────
// See: course-setting/approval-review-section.tsx
// See: course-setting/manual-resolution-section.tsx
// See: course-setting/partial-import-plan-section.tsx
// ── Sub-components (extracted to course-setting/ directory) ────────────────
// See: course-setting/course-setting-approval-review-section.tsx
// See: course-setting/course-setting-manual-resolution-section.tsx
// See: course-setting/course-setting-partial-import-plan-section.tsx
// See: course-setting/course-setting-manual-resolution-row.tsx
// See: course-setting/course-setting-task-split-candidate-panel.tsx
// See: course-setting/course-setting-ui-types.ts
// See: course-setting/course-setting-display-utils.ts
// See: course-setting/course-setting-summary-card.tsx
