'use client'

/**
 * L6-E2F — Task Split Candidate Panel (extracted)
 *
 * Stage: L6-E2F-XLSX-COURSE-SETTING-PREVIEW-COMPONENT-DECOMPOSITION
 *
 * Pure UI presentation. State lives in the top-level orchestrator.
 * Pure refactor from L6-E2E.
 */

import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import type { CourseSettingManualResolutionItem } from '@/lib/import/course-setting-manual-resolution-l6-e1'
import type { ReviewRawMap, SplitCandidate } from './course-setting-ui-types'

export type TaskSplitCandidatePanelProps = {
  item: CourseSettingManualResolutionItem
  splitCandidates: SplitCandidate[] | null
  ctx: ReviewRawMap extends Map<string, infer V> ? V : never
  onUpdate: (patch: Record<string, unknown>) => void
}

export function TaskSplitCandidatePanel({
  item,
  splitCandidates,
  ctx,
  onUpdate,
}: TaskSplitCandidatePanelProps) {
  return (
    <div className="space-y-2 bg-amber-50/60 rounded-md p-3 border border-amber-100" data-l6e1-task-split-controls={item.approvalItemId}>
      <div className="flex items-center gap-2">
        <span className="font-medium text-amber-700">教学任务拆分候选</span>
        <span className="text-[10px] text-amber-600">
          {splitCandidates && splitCandidates.length > 0
            ? `系统识别到 ${splitCandidates.length} 个拆分方案，请选择确认：`
            : '系统未识别到可解析的拆分方案；可标记需复核或保持单任务。'}
        </span>
      </div>

      {splitCandidates && splitCandidates.length > 0 ? (
        <>
          {splitCandidates.map((candidate, cIdx) => (
            <div
              key={candidate.candidateId}
              className="bg-white rounded border border-amber-200 p-2.5 space-y-2"
              data-l6e1-split-candidate={candidate.candidateId}
            >
              <div className="flex items-center gap-2 text-[11px] flex-wrap">
                <span className="font-semibold text-amber-800">候选 {String.fromCharCode(65 + cIdx)}</span>
                <Badge variant="outline" className="text-[10px] bg-amber-50 text-amber-700 border-amber-200">
                  {candidate.kind}
                </Badge>
                <span className="text-amber-700">置信度 {candidate.confidence.toFixed(2)}</span>
                {candidate.requiresManualConfirmation && (
                  <span className="text-[10px] text-gray-500">需人工确认</span>
                )}
                <span className="text-[10px] text-gray-400 font-mono">id: {candidate.candidateId.slice(0, 20)}…</span>
              </div>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-x-3 gap-y-0.5 text-[10px]">
                <div><span className="opacity-60">专业: </span>{ctx?.majorName ?? '—'}</div>
                <div><span className="opacity-60">课程: </span>{ctx?.courseName ?? '—'}</div>
                <div><span className="opacity-60">周课时: </span>{ctx?.weeklyHoursText ?? '—'}</div>
                <div><span className="opacity-60">考试: </span>{ctx?.examTypeText ?? '—'}</div>
                <div><span className="opacity-60">来源: </span>Sheet{ctx?.sheetIndex} 行{ctx?.sourceRowIndex}</div>
              </div>

              {/* Real assignment table */}
              <table className="w-full text-[10px]" data-l6e1-split-assignments={candidate.candidateId}>
                <thead className="bg-amber-50/50 text-amber-700">
                  <tr>
                    <th className="px-2 py-1 text-left">#</th>
                    <th className="px-2 py-1 text-left">教师</th>
                    <th className="px-2 py-1 text-left">教师匹配</th>
                    <th className="px-2 py-1 text-left">班级</th>
                    <th className="px-2 py-1 text-left">班级匹配</th>
                    <th className="px-2 py-1 text-left">warning</th>
                  </tr>
                </thead>
                <tbody>
                  {candidate.assignments.map((a, aIdx) => (
                    <tr key={a.assignmentId} className="border-t border-amber-100">
                      <td className="px-2 py-1">{aIdx + 1}</td>
                      <td className="px-2 py-1 font-medium" title={a.teacherRaw}>
                        {a.teacherRaw}
                        {a.teacherId != null && <span className="text-gray-400"> (id={a.teacherId})</span>}
                      </td>
                      <td className="px-2 py-1">
                        {a.teacherMatchStatus === 'matched' ? (
                          <span className="text-green-700">matched</span>
                        ) : a.teacherMatchStatus === 'ambiguous' ? (
                          <span className="text-amber-700">ambiguous</span>
                        ) : a.teacherMatchStatus === 'missing' ? (
                          <span className="text-red-700">missing</span>
                        ) : (
                          <span className="text-gray-500">unknown</span>
                        )}
                      </td>
                      <td className="px-2 py-1" title={a.classRaw}>{a.classRaw || '—'}</td>
                      <td className="px-2 py-1">
                        {a.classMatchStatus === 'matched' ? (
                          <span className="text-green-700">matched ({a.classGroupIds.length})</span>
                        ) : a.classMatchStatus === 'ambiguous' ? (
                          <span className="text-amber-700">ambiguous</span>
                        ) : a.classMatchStatus === 'missing' ? (
                          <span className="text-red-700">missing</span>
                        ) : (
                          <span className="text-gray-500">unknown</span>
                        )}
                      </td>
                      <td className="px-2 py-1 text-gray-600">
                        {a.warningCodes.length > 0 ? a.warningCodes.join(';') : '—'}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>

              {/* Per-candidate confirm radio */}
              <div className="flex items-center gap-2 pt-1 border-t border-amber-100">
                <label className="flex items-center gap-1 text-[11px]">
                  <input
                    type="radio"
                    name={`ts-${item.approvalItemId}`}
                    checked={
                      item.resolution.taskSplit?.action === 'confirmDetectedSplit' &&
                      item.resolution.taskSplit?.selectedCandidateId === candidate.candidateId
                    }
                    onChange={() =>
                      onUpdate({
                        taskSplit: {
                          action: 'confirmDetectedSplit',
                          selectedCandidateId: candidate.candidateId,
                        },
                      })
                    }
                    data-l6e1-split-confirm={candidate.candidateId}
                  />
                  确认使用此候选
                </label>
              </div>
            </div>
          ))}

          {/* Global actions */}
          <div className="flex gap-3 items-center pt-1 border-t border-amber-100 flex-wrap">
            <label className="flex items-center gap-1 text-[11px]">
              <input
                type="radio"
                name={`ts-${item.approvalItemId}`}
                checked={item.resolution.taskSplit?.action === 'markNeedsReview'}
                onChange={() => onUpdate({ taskSplit: { action: 'markNeedsReview' } })}
              />
              标记需复核
            </label>
            <label className="flex items-center gap-1 text-[11px]">
              <input
                type="radio"
                name={`ts-${item.approvalItemId}`}
                checked={item.resolution.taskSplit?.action === 'rejectSplit'}
                onChange={() => onUpdate({ taskSplit: { action: 'rejectSplit' } })}
              />
              不拆分（单任务）
            </label>
            {item.resolution.taskSplit?.action === 'confirmDetectedSplit' && (
              <Input
                placeholder="拆分备注（可选）"
                className="text-[11px] h-6 max-w-[200px]"
                value={item.resolution.taskSplit?.note ?? ''}
                onChange={(e) =>
                  onUpdate({
                    taskSplit: {
                      action: 'confirmDetectedSplit',
                      selectedCandidateId: item.resolution.taskSplit?.selectedCandidateId ?? '',
                      note: e.target.value,
                    },
                  })
                }
              />
            )}
          </div>

          {item.resolution.taskSplit?.action === 'confirmDetectedSplit' && !item.resolution.taskSplit?.selectedCandidateId && (
            <p className="text-[10px] text-red-600">请选择一个拆分候选后再确认。</p>
          )}
        </>
      ) : (
        <div className="flex gap-3 items-center pt-1 border-t border-amber-100">
          <label className="flex items-center gap-1 text-[11px]">
            <input
              type="radio"
              name={`ts-${item.approvalItemId}`}
              checked={item.resolution.taskSplit?.action === 'markNeedsReview'}
              onChange={() => onUpdate({ taskSplit: { action: 'markNeedsReview' } })}
            />
            标记需复核
          </label>
          <label className="flex items-center gap-1 text-[11px]">
            <input
              type="radio"
              name={`ts-${item.approvalItemId}`}
              checked={item.resolution.taskSplit?.action === 'rejectSplit'}
              onChange={() => onUpdate({ taskSplit: { action: 'rejectSplit' } })}
            />
            不拆分（单任务）
          </label>
        </div>
      )}
    </div>
  )
}