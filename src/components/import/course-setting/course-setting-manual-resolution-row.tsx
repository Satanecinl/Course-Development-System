'use client'

/**
 * L6-E2F — Manual Resolution Row (extracted)
 *
 * Stage: L6-E2F-XLSX-COURSE-SETTING-PREVIEW-COMPONENT-DECOMPOSITION
 *
 * Pure UI presentation for a single resolution row with expanded controls.
 * State lives in the top-level orchestrator. Pure refactor from L6-E2E.
 *
 * L6-E2G update (semantic fix):
 *  The legacy "课程缺失" UI label is split into TWO distinct sections so
 *  that Excel-course-name-empty (true blocker) and Excel-course-name-but-
 *  no-DB-match (new course candidate, confirmable) are no longer
 *  conflated:
 *
 *  - "课程名缺失" — Excel 行中没有可识别的课程名；显示 select-existing + 候选
 *    输入，必须选择/输入才能 importable。
 *  - "新课程候选" — Excel 有课程名但 DB 无匹配；默认从 Excel 课程名
 *    自动派生候选，用户可以：
 *      (a) 确认创建新课程（直接使用 Excel 课程名）
 *      (b) 选择已有课程替代
 *      (c) 修改候选名称后确认创建
 *      (d) 忽略本行
 */

import {
  ChevronDown,
  ChevronRight,
} from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import {
  COURSE_SITUATION_LABELS,
  formatDiagnosticCodeLabel,
  formatSuggestedActionLabel,
} from '@/lib/import/course-setting-approval-review-localization'
import {
  type CourseSettingManualResolutionItem,
  type CourseSettingResolutionStatus,
} from '@/lib/import/course-setting-manual-resolution-l6-e1'
import type {
  CourseSettingResolutionOptionsResponse,
} from '@/lib/import/course-setting-xlsx-client'
import { truncateId } from './course-setting-display-utils'
import type { ReviewRawMap, SplitCandidate } from './course-setting-ui-types'
import { TaskSplitCandidatePanel } from './course-setting-task-split-candidate-panel'

export type ResolutionItemRowProps = {
  item: CourseSettingManualResolutionItem
  resolutionOptions: CourseSettingResolutionOptionsResponse | null
  reviewRawMap: ReviewRawMap
  splitCandidates: SplitCandidate[] | null
  isExpanded: boolean
  onToggle: () => void
  onUpdate: (patch: Record<string, unknown>) => void
}

export function ResolutionItemRow({
  item,
  resolutionOptions,
  reviewRawMap,
  splitCandidates,
  isExpanded,
  onToggle,
  onUpdate,
}: ResolutionItemRowProps) {
  const truncatedId = truncateId(item.approvalItemId, 16)
  const ctx = reviewRawMap.get(item.approvalItemId)
  // L6-E2G: distinguish true course-name missing from new course candidate
  const courseSituation = item.baseCourseSituation
  const hasCourseNameMissing = courseSituation === 'courseNameMissing'
  const hasNewCourseCandidate = courseSituation === 'newCourseCandidate'
  const hasCourseAmbiguous = courseSituation === 'courseAmbiguous'
  const hasCourseIssue = hasCourseNameMissing || hasNewCourseCandidate || hasCourseAmbiguous
  const hasTeacherMissing = item.baseDiagnosticCodes.includes('TEACHER_MISSING') || item.baseDiagnosticCodes.includes('TEACHER_BLANK')
  const hasClassMissing = item.baseDiagnosticCodes.includes('CLASS_GROUP_MISSING') || item.baseDiagnosticCodes.includes('CLASS_GROUP_AMBIGUOUS')
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
        <td className="px-2 py-1.5 text-[10px] max-w-[100px] truncate" title={ctx?.majorName ?? ''}>{ctx?.majorName ?? '—'}</td>
        <td className="px-2 py-1.5 text-[10px] max-w-[80px] truncate" title={ctx?.sheetName ?? `Sheet ${ctx?.sheetIndex ?? ''}`}>{ctx?.sheetName ?? `S${ctx?.sheetIndex ?? '?'}`}</td>
        <td className="px-2 py-1.5 text-right tabular-nums text-[10px]">{ctx?.sourceRowIndex ?? '—'}</td>
        <td className="px-2 py-1.5 text-[10px] max-w-[120px] truncate" title={ctx?.courseName ?? ''}>{ctx?.courseName ?? '—'}</td>
        <td className="px-2 py-1.5 text-[10px] max-w-[120px] truncate" title={ctx?.teacherText ?? ''}>{ctx?.teacherText ?? '—'}</td>
        <td className="px-2 py-1.5 text-[10px] max-w-[120px] truncate" title={ctx?.classText ?? ''}>{ctx?.classText ?? '—'}</td>
        <td className="px-2 py-1.5 text-right tabular-nums text-[10px]">{ctx?.weeklyHoursText ?? '—'}</td>
        <td className="px-2 py-1.5 text-[10px] max-w-[60px] truncate" title={ctx?.examTypeText ?? ''}>{ctx?.examTypeText ?? '—'}</td>
        <td className="px-2 py-1.5 text-[10px] max-w-[100px] truncate" title={ctx?.remark ?? ''}>{ctx?.remark ?? '—'}</td>
        <td className="px-2 py-1.5 text-[10px] max-w-[100px] truncate" title={ctx?.mergeRemark ?? ''}>{ctx?.mergeRemark ?? '—'}</td>
        <td className="px-2 py-1.5">
          <div className="flex flex-wrap gap-1 max-w-[120px]">
            {item.baseDiagnosticCodes.length === 0 ? (
              <span className="text-gray-400">-</span>
            ) : (
              item.baseDiagnosticCodes
                .filter((c) => c !== 'COURSE_MISSING')
                .map((code) => (
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
          <td colSpan={15} className="px-4 py-3 bg-indigo-50/50 border-t border-indigo-100">
            <div className="space-y-3 text-[11px]">
              {/* Row context header */}
              {ctx && (
                <div className="bg-indigo-100/50 rounded-md p-2.5 space-y-1 text-[10px]" data-l6e1-row-context={item.approvalItemId}>
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-x-3 gap-y-0.5">
                    <div><span className="opacity-70">审核项ID: </span><span className="font-mono text-[9px]">{item.approvalItemId}</span></div>
                    <div><span className="opacity-70">工作表: </span>{ctx.sheetName ?? `Sheet ${ctx.sheetIndex}`}</div>
                    <div><span className="opacity-70">Excel 行号: </span>{ctx.sourceRowIndex}</div>
                    <div><span className="opacity-70">置信度: </span>{ctx.confidence.toFixed(2)}</div>
                  </div>
                  <div className="grid grid-cols-2 md:grid-cols-3 gap-x-3 gap-y-0.5">
                    <div><span className="opacity-70">专业: </span>{ctx.majorName ?? '—'}</div>
                    <div className="truncate max-w-[220px]" title={ctx.courseName ?? ''}><span className="opacity-70">课程: </span>{ctx.courseName ?? '—'}</div>
                    <div className="truncate max-w-[220px]" title={ctx.teacherText ?? ''}><span className="opacity-70">教师: </span>{ctx.teacherText ?? '—'}</div>
                  </div>
                  <div className="grid grid-cols-2 md:grid-cols-3 gap-x-3 gap-y-0.5">
                    <div className="truncate max-w-[220px]" title={ctx.classText ?? ''}><span className="opacity-70">班级: </span>{ctx.classText ?? '—'}</div>
                    <div><span className="opacity-70">周课时: </span>{ctx.weeklyHoursText ?? '—'}</div>
                    <div><span className="opacity-70">考试类型: </span>{ctx.examTypeText ?? '—'}</div>
                  </div>
                  <div className="grid grid-cols-2 md:grid-cols-2 gap-x-3 gap-y-0.5">
                    <div className="truncate max-w-[300px]" title={ctx.remark ?? ''}><span className="opacity-70">备注: </span>{ctx.remark ?? '—'}</div>
                    <div className="truncate max-w-[300px]" title={ctx.mergeRemark ?? ''}><span className="opacity-70">合班备注: </span>{ctx.mergeRemark ?? '—'}</div>
                  </div>
                  <div className="grid grid-cols-2 md:grid-cols-2 gap-x-3 gap-y-0.5">
                    <div className="truncate max-w-[300px]"><span className="opacity-70">建议处理: </span>{ctx.suggestedAction}</div>
                    <div className="flex flex-wrap gap-1">
                      <span className="opacity-70">诊断: </span>
                      {item.baseDiagnosticCodes
                        .filter((c) => c !== 'COURSE_MISSING')
                        .map((code) => (
                          <Badge key={code} variant="outline" className="text-[9px] bg-red-50 text-red-600 border-red-200">
                            {formatDiagnosticCodeLabel(code)}
                          </Badge>
                        ))}
                    </div>
                  </div>
                </div>
              )}

              {/* Course resolution — split by L6-E2G situation */}
              {hasCourseIssue && (
                <div className="space-y-2" data-l6e1-course-controls={item.approvalItemId} data-l6e2g-course-situation={courseSituation}>
                  <div className="flex items-center gap-2">
                    <span className={`font-medium ${hasCourseNameMissing ? 'text-red-700' : 'text-amber-700'}`}>
                      {COURSE_SITUATION_LABELS[courseSituation].short}
                    </span>
                    <span className="text-[10px] text-gray-500">
                      {COURSE_SITUATION_LABELS[courseSituation].long}
                    </span>
                  </div>

                  {hasCourseNameMissing && (
                    <div className="flex gap-2 items-center" data-l6e2g-course-controls="name-missing">
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
                  )}

                  {hasNewCourseCandidate && (
                    <div className="space-y-1" data-l6e2g-course-controls="new-candidate">
                      <div className="flex gap-2 items-center flex-wrap">
                        <span className="text-[10px] text-gray-500">Excel 课程名:</span>
                        <Badge variant="outline" className="text-[10px] bg-blue-50 text-blue-700 border-blue-200">
                          {ctx?.courseName ?? item.baseRawCourseName ?? '—'}
                        </Badge>
                      </div>
                      <div className="flex gap-2 items-center flex-wrap">
                        <select
                          className="border border-gray-300 rounded px-2 py-0.5 text-[11px] bg-white max-w-[200px]"
                          value={item.resolution.course?.existingCourseId ?? ''}
                          onChange={(e) => onUpdate({ course: { action: 'useExistingCourse', existingCourseId: e.target.value ? Number(e.target.value) : undefined } })}
                          data-l6e2g-course-action="use-existing"
                        >
                          <option value="">选择已有课程（替代）</option>
                          {resolutionOptions?.courses.map((c) => (
                            <option key={c.id} value={c.id}>{c.name}</option>
                          ))}
                        </select>
                        <span className="text-gray-400">或</span>
                        <Input
                          placeholder="新课程候选名称"
                          className="text-[11px] h-6 max-w-[160px]"
                          value={
                            item.resolution.course?.action === 'createCourseCandidate'
                              ? (item.resolution.course.candidateName ?? '')
                              : (item.baseRawCourseName ?? '')
                          }
                          onChange={(e) => onUpdate({ course: { action: 'createCourseCandidate', candidateName: e.target.value } })}
                          data-l6e2g-course-action="rename"
                        />
                        <Button
                          size="sm"
                          variant="default"
                          className="text-[10px] h-6"
                          data-l6e2g-course-action="confirm-create"
                          onClick={() => {
                            const name =
                              item.resolution.course?.action === 'createCourseCandidate'
                                ? (item.resolution.course.candidateName ?? '').trim()
                                : (item.baseRawCourseName ?? '').trim()
                            onUpdate({
                              course: { action: 'createCourseCandidate', candidateName: name || (item.baseRawCourseName ?? '') },
                            })
                          }}
                        >
                          确认创建新课程
                        </Button>
                      </div>
                      <p className="text-[10px] text-gray-500" data-l6e2g-course-status>
                        {item.resolution.course?.action === 'createCourseCandidate'
                          ? `已确认创建新课程："${item.resolution.course.candidateName ?? ''}"`
                          : '默认将作为新课程创建（可点击确认或选择已有课程）'}
                      </p>
                    </div>
                  )}

                  {hasCourseAmbiguous && (
                    <div className="flex gap-2 items-center" data-l6e2g-course-controls="ambiguous">
                      <select
                        className="border border-gray-300 rounded px-2 py-0.5 text-[11px] bg-white max-w-[200px]"
                        value={item.resolution.course?.existingCourseId ?? ''}
                        onChange={(e) => onUpdate({ course: { action: 'useExistingCourse', existingCourseId: e.target.value ? Number(e.target.value) : undefined } })}
                      >
                        <option value="">选择已有课程（消歧）</option>
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
                  )}
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

              {/* Task split detection — shown when TASK_SPLIT_REQUIRED is among diagnostics */}
              {item.baseDiagnosticCodes.includes('TASK_SPLIT_REQUIRED') && (
                <TaskSplitCandidatePanel
                  item={item}
                  splitCandidates={splitCandidates}
                  ctx={ctx ?? null}
                  onUpdate={onUpdate}
                />
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