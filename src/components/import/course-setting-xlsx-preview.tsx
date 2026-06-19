'use client'

/**
 * L3 UI Component - Course Setting XLSX Preview
 *
 * Preview-only component for Excel course setting file parsing. No confirm/apply
 * buttons. Shows hashed preview rows + field summaries + manual review flags.
 */

import { useCallback, useRef, useState } from 'react'
import { toast } from 'sonner'
import {
  Loader2,
  AlertCircle,
  FileSpreadsheet,
  Eye,
  AlertTriangle,
  Info,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  previewCourseSettingXlsx,
  type CourseSettingXlsxPreviewResponse,
  type CourseSettingXlsxPreviewRow,
} from '@/lib/import/course-setting-xlsx-client'

// -- Component ---------------------------------------------------------------

export default function CourseSettingXlsxPreview() {
  const [file, setFile] = useState<File | null>(null)
  const [parsing, setParsing] = useState(false)
  const [result, setResult] = useState<CourseSettingXlsxPreviewResponse | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [expandedRows, setExpandedRows] = useState<Set<number>>(new Set())
  const fileInputRef = useRef<HTMLInputElement>(null)

  const handleUpload = useCallback(async () => {
    if (!file) {
      toast.error('请选择 .xlsx 课程设置文件')
      return
    }
    setParsing(true)
    setError(null)
    setResult(null)
    try {
      const data = await previewCourseSettingXlsx(file)
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
  }, [file])

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
              disabled={!file || parsing}
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
