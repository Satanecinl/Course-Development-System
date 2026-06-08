'use client'

import { useState, useCallback, useEffect, useRef } from 'react'
import { toast } from 'sonner'
import { Plus, Pencil, CheckCircle, Trash2, Loader2, AlertCircle } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { SemesterFormDialog } from '@/components/settings/semester-form-dialog'
import { SemesterDeleteDialog } from '@/components/settings/semester-delete-dialog'
import { SemesterActivateDialog } from '@/components/settings/semester-activate-dialog'
import { useSemesterStore } from '@/store/semesterStore'
import {
  fetchSemestersWithCounts,
  createSemester,
  updateSemester,
  deleteSemester,
  activateSemester,
  type SemesterWithCounts,
  type SemesterCreateInput,
  type SemesterUpdateInput,
} from '@/lib/semesters/semester-settings-client'

export function SemesterSettingsPanel() {
  const [semesters, setSemesters] = useState<SemesterWithCounts[]>([])
  const [activeSemesterId, setActiveSemesterId] = useState<number | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  // Dialog states
  const [formOpen, setFormOpen] = useState(false)
  const [formMode, setFormMode] = useState<'create' | 'edit'>('create')
  const [editingSemester, setEditingSemester] = useState<SemesterWithCounts | null>(null)
  const [saving, setSaving] = useState(false)

  const [deleteOpen, setDeleteOpen] = useState(false)
  const [deletingSemester, setDeletingSemester] = useState<SemesterWithCounts | null>(null)
  const [deleting, setDeleting] = useState(false)

  const [activateOpen, setActivateOpen] = useState(false)
  const [activatingSemester, setActivatingSemester] = useState<SemesterWithCounts | null>(null)
  const [activating, setActivating] = useState(false)

  // K25-E semester store for selector refresh
  const { fetchSemesters: refreshSemesterStore } = useSemesterStore()

  const loadData = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const data = await fetchSemestersWithCounts()
      setSemesters(data.semesters)
      setActiveSemesterId(data.activeSemesterId)
    } catch (err) {
      setError(err instanceof Error ? err.message : '加载失败')
    } finally {
      setLoading(false)
    }
  }, [])

  // Initial data load
  const loadDataRef = useRef(loadData)
  useEffect(() => {
    loadDataRef.current = loadData
    void loadDataRef.current()
  }, [loadData])

  // Refresh semester store after any change
  function refreshAll() {
    loadData()
    refreshSemesterStore()
  }

  // ── Create ──

  function handleCreateClick() {
    setFormMode('create')
    setEditingSemester(null)
    setFormOpen(true)
  }

  async function handleFormSubmit(input: SemesterCreateInput | SemesterUpdateInput) {
    setSaving(true)
    try {
      if (formMode === 'create') {
        await createSemester(input as SemesterCreateInput)
        toast.success('学期创建成功')
      } else if (editingSemester) {
        await updateSemester(editingSemester.id, input as SemesterUpdateInput)
        toast.success('学期已更新')
      }
      setFormOpen(false)
      refreshAll()
    } catch (err) {
      const msg = err instanceof Error ? err.message : '操作失败'
      toast.error(msg)
    } finally {
      setSaving(false)
    }
  }

  // ── Edit ──

  function handleEditClick(semester: SemesterWithCounts) {
    setFormMode('edit')
    setEditingSemester(semester)
    setFormOpen(true)
  }

  // ── Activate ──

  function handleActivateClick(semester: SemesterWithCounts) {
    setActivatingSemester(semester)
    setActivateOpen(true)
  }

  async function handleActivateConfirm() {
    if (!activatingSemester) return
    setActivating(true)
    try {
      await activateSemester(activatingSemester.id)
      toast.success(`已将 ${activatingSemester.name} 设为当前学期`)
      setActivateOpen(false)
      refreshAll()
    } catch (err) {
      toast.error(err instanceof Error ? err.message : '操作失败')
    } finally {
      setActivating(false)
    }
  }

  // ── Delete ──

  function handleDeleteClick(semester: SemesterWithCounts) {
    setDeletingSemester(semester)
    setDeleteOpen(true)
  }

  async function handleDeleteConfirm() {
    if (!deletingSemester) return
    setDeleting(true)
    try {
      await deleteSemester(deletingSemester.id)
      toast.success('学期已删除')
      setDeleteOpen(false)
      refreshAll()
    } catch (err) {
      toast.error(err instanceof Error ? err.message : '删除失败')
    } finally {
      setDeleting(false)
    }
  }

  // ── Active semester info ──

  const activeSemester = semesters.find((s) => s.id === activeSemesterId)

  // ── Loading / Error / Empty ──

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12 text-gray-400">
        <Loader2 className="w-5 h-5 animate-spin mr-2" />
        <span>加载学期数据…</span>
      </div>
    )
  }

  if (error) {
    return (
      <div className="flex flex-col items-center justify-center py-12 text-red-500 gap-2">
        <AlertCircle className="w-6 h-6" />
        <p>{error}</p>
        <Button variant="outline" size="sm" onClick={loadData}>重试</Button>
      </div>
    )
  }

  if (semesters.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-12 text-gray-400 gap-3">
        <p>暂无学期数据</p>
        <Button size="sm" onClick={handleCreateClick}>
          <Plus className="w-4 h-4 mr-1" /> 新增学期
        </Button>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      {/* Current semester card */}
      {activeSemester ? (
        <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
          <div className="flex items-center gap-2 mb-2">
            <CheckCircle className="w-5 h-5 text-blue-600" />
            <h3 className="font-semibold text-blue-900">当前学期</h3>
          </div>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-sm">
            <div>
              <span className="text-gray-500">名称</span>
              <p className="font-medium text-gray-900">{activeSemester.name}</p>
            </div>
            <div>
              <span className="text-gray-500">代码</span>
              <p className="font-medium text-gray-900">{activeSemester.code}</p>
            </div>
            {activeSemester.academicYear && (
              <div>
                <span className="text-gray-500">学年</span>
                <p className="font-medium text-gray-900">{activeSemester.academicYear}</p>
              </div>
            )}
            {activeSemester.term && (
              <div>
                <span className="text-gray-500">学期</span>
                <p className="font-medium text-gray-900">{activeSemester.term}</p>
              </div>
            )}
            {activeSemester.startsAt && (
              <div>
                <span className="text-gray-500">起始日期</span>
                <p className="font-medium text-gray-900">{activeSemester.startsAt.substring(0, 10)}</p>
              </div>
            )}
            {activeSemester.endsAt && (
              <div>
                <span className="text-gray-500">结束日期</span>
                <p className="font-medium text-gray-900">{activeSemester.endsAt.substring(0, 10)}</p>
              </div>
            )}
          </div>
        </div>
      ) : (
        <div className="bg-amber-50 border border-amber-200 rounded-lg p-4">
          <div className="flex items-center gap-2">
            <AlertCircle className="w-5 h-5 text-amber-600" />
            <p className="text-amber-800 font-medium">当前没有激活的学期</p>
          </div>
        </div>
      )}

      {/* Toolbar */}
      <div className="flex items-center justify-between">
        <h3 className="text-lg font-semibold text-gray-900">学期列表</h3>
        <Button size="sm" onClick={handleCreateClick}>
          <Plus className="w-4 h-4 mr-1" /> 新增学期
        </Button>
      </div>

      {/* Semester table */}
      <div className="overflow-x-auto border rounded-lg">
        <table className="w-full text-sm">
          <thead className="bg-gray-50 text-gray-600">
            <tr>
              <th className="px-3 py-2 text-left font-medium">学期名称</th>
              <th className="px-3 py-2 text-left font-medium">代码</th>
              <th className="px-3 py-2 text-left font-medium">学年</th>
              <th className="px-3 py-2 text-left font-medium">学期</th>
              <th className="px-3 py-2 text-left font-medium">起始日期</th>
              <th className="px-3 py-2 text-left font-medium">结束日期</th>
              <th className="px-3 py-2 text-center font-medium">当前</th>
              <th className="px-3 py-2 text-right font-medium">教学任务</th>
              <th className="px-3 py-2 text-right font-medium">课表</th>
              <th className="px-3 py-2 text-right font-medium">调课</th>
              <th className="px-3 py-2 text-right font-medium">导入</th>
              <th className="px-3 py-2 text-center font-medium">可删除</th>
              <th className="px-3 py-2 text-center font-medium">操作</th>
            </tr>
          </thead>
          <tbody className="divide-y">
            {semesters.map((s) => (
              <tr key={s.id} className={s.isActive ? 'bg-blue-50/50' : ''}>
                <td className="px-3 py-2 font-medium">{s.name}</td>
                <td className="px-3 py-2 text-gray-500 font-mono text-xs">{s.code}</td>
                <td className="px-3 py-2 text-gray-600">{s.academicYear ?? '-'}</td>
                <td className="px-3 py-2 text-gray-600">{s.term ?? '-'}</td>
                <td className="px-3 py-2 text-gray-600">{s.startsAt?.substring(0, 10) ?? '-'}</td>
                <td className="px-3 py-2 text-gray-600">{s.endsAt?.substring(0, 10) ?? '-'}</td>
                <td className="px-3 py-2 text-center">
                  {s.isActive ? (
                    <Badge className="bg-blue-100 text-blue-700 border-blue-200">当前</Badge>
                  ) : (
                    <span className="text-gray-300">-</span>
                  )}
                </td>
                <td className="px-3 py-2 text-right text-gray-600">
                  {s.counts?.teachingTasks ?? 0}
                </td>
                <td className="px-3 py-2 text-right text-gray-600">
                  {s.counts?.scheduleSlots ?? 0}
                </td>
                <td className="px-3 py-2 text-right text-gray-600">
                  {s.counts?.scheduleAdjustments ?? 0}
                </td>
                <td className="px-3 py-2 text-right text-gray-600">
                  {s.counts?.importBatches ?? 0}
                </td>
                <td className="px-3 py-2 text-center">
                  {s.canDelete ? (
                    <Badge className="bg-green-100 text-green-700 border-green-200">可删除</Badge>
                  ) : (
                    <span
                      className="text-xs text-gray-400 cursor-help"
                      title={s.deleteBlockers?.join('\n') ?? '不可删除'}
                    >
                      不可删除
                    </span>
                  )}
                </td>
                <td className="px-3 py-2">
                  <div className="flex items-center justify-center gap-1">
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => handleEditClick(s)}
                      title="编辑"
                    >
                      <Pencil className="w-3.5 h-3.5" />
                    </Button>
                    {!s.isActive && (
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => handleActivateClick(s)}
                        title="设为当前"
                      >
                        <CheckCircle className="w-3.5 h-3.5" />
                      </Button>
                    )}
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => handleDeleteClick(s)}
                      disabled={!s.canDelete}
                      title={s.canDelete ? '删除' : (s.deleteBlockers?.[0] ?? '不可删除')}
                    >
                      <Trash2 className={`w-3.5 h-3.5 ${s.canDelete ? 'text-red-500' : 'text-gray-300'}`} />
                    </Button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Info text */}
      <p className="text-xs text-gray-400">其他系统设置模块将在后续阶段实现。</p>

      {/* Dialogs */}
      <SemesterFormDialog
        key={`${formMode}-${editingSemester?.id ?? 'new'}-${formOpen}`}
        open={formOpen}
        mode={formMode}
        semester={editingSemester}
        saving={saving}
        onOpenChange={setFormOpen}
        onSubmit={handleFormSubmit}
      />

      <SemesterDeleteDialog
        open={deleteOpen}
        semester={deletingSemester}
        deleting={deleting}
        onOpenChange={setDeleteOpen}
        onConfirm={handleDeleteConfirm}
      />

      <SemesterActivateDialog
        open={activateOpen}
        semester={activatingSemester}
        activating={activating}
        onOpenChange={setActivateOpen}
        onConfirm={handleActivateConfirm}
      />
    </div>
  )
}
