'use client'

/**
 * L3/L6-B UI Component - Course Setting XLSX Preview
 *
 * Preview-only component for Excel course setting file parsing. No confirm/apply
 * buttons. Shows hashed preview rows + field summaries + manual review flags.
 * L6-B: adds target semester selector + dry-run/match summary display.
 */

import { useCallback, useEffect, useRef, useState } from 'react'
import { toast } from 'sonner'
import {
  Loader2,
  AlertCircle,
  FileSpreadsheet,
  Eye,
  AlertTriangle,
  Info,
  Database,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  previewCourseSettingXlsx,
  fetchSemestersForImport,
  type CourseSettingXlsxPreviewResponse,
  type CourseSettingXlsxPreviewRow,
  type SemesterListItem,
} from '@/lib/import/course-setting-xlsx-client'

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

  // Load semesters on mount
  useEffect(() => {
    if (semestersLoaded || semestersLoading) return
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setSemestersLoading(true)
    fetchSemestersForImport()
      .then((data) => {
        setSemesters(data.semesters)
        setSemestersLoaded(true)
      })
      .catch(() => {
        setSemestersLoaded(true)
      })
      .finally(() => {
        setSemestersLoading(false)
      })
  }, [semestersLoaded, semestersLoading])

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
    if (fileInputRef.current) fileInputRef.current.value = ''
  }, [])

  const canPreview = !!file && !!selectedSemesterId && !parsing

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
        {/* L6-B: Target semester selector */}
        <div className="space-y-1">
          <Label className="text-xs">导入目标学期</Label>
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
                  不会修改数据库。解析耗时 {(result.parser.durationMs / 1000).toFixed(1)}s，
                  识别 {result.workbookSummary.totalCourseRows} 条课程行，
                  {result.manualReviewSummary.totalRowsNeedingReview} 条需手动审核。
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
              课程行预览 (前 {Math.min(result.previewRows.length, 50)} 条)
            </h4>
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead className="bg-gray-50 text-gray-600">
                  <tr>
                    <th className="px-2 py-1.5 text-left">#</th>
                    <th className="px-2 py-1.5 text-left">Sheet</th>
                    <th className="px-2 py-1.5 text-left">Row</th>
                    <th className="px-2 py-1.5 text-left">课程名 Hash</th>
                    <th className="px-2 py-1.5 text-left">班级分类</th>
                    <th className="px-2 py-1.5 text-left">教师分类</th>
                    <th className="px-2 py-1.5 text-right">Confidence</th>
                    <th className="px-2 py-1.5 text-left">审核</th>
                  </tr>
                </thead>
                <tbody>
                  {result.previewRows.slice(0, 50).map((row, idx) => (
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
        <td className="px-2 py-1.5 font-mono text-[10px]">{row.sheetNameHash}</td>
        <td className="px-2 py-1.5 tabular-nums">{row.sourceRowIndex}</td>
        <td className="px-2 py-1.5 font-mono text-[10px]">{row.courseNameHash ?? '-'}</td>
        <td className="px-2 py-1.5">
          <Badge variant={row.classCountClassification === 'other' ? 'destructive' : 'secondary'} className="text-[10px]">
            {row.classCountClassification ?? '-'}
          </Badge>
        </td>
        <td className="px-2 py-1.5">
          <Badge variant={row.teacherAssignmentClassification === 'other' ? 'destructive' : 'secondary'} className="text-[10px]">
            {row.teacherAssignmentClassification ?? '-'}
          </Badge>
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
          <td colSpan={8} className="px-4 py-2 text-[10px] text-gray-600">
            <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
              <div>
                <span className="font-medium">年级专业 Hash: </span>
                <span className="font-mono">{row.gradeMajorHash ?? '-'}</span>
              </div>
              <div>
                <span className="font-medium">班级人数 Hash: </span>
                <span className="font-mono">{row.classCountRawHash ?? '-'}</span>
              </div>
              <div>
                <span className="font-medium">教师 Hash: </span>
                <span className="font-mono">{row.teacherRawHash ?? '-'}</span>
              </div>
              <div>
                <span className="font-medium">备注 Hash: </span>
                <span className="font-mono">{row.remarkHash ?? '-'}</span>
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
