'use client'

import { useEffect } from 'react'
import { useSemesterStore } from '@/store/semesterStore'
import { ChevronDown, AlertCircle, Loader2 } from 'lucide-react'

interface SemesterSelectorProps {
  /** Show the active-fallback warning banner. Default true. */
  showFallbackWarning?: boolean
  /** Extra class names on the outer wrapper. */
  className?: string
}

/**
 * K25-E: Global semester selector.
 *
 * Loads the semester list on mount, displays the current semester,
 * lets the user switch, and shows a light warning when the API
 * response indicates `semesterSource: 'activeFallback'`.
 */
export function SemesterSelector({
  showFallbackWarning = true,
  className = '',
}: SemesterSelectorProps) {
  const {
    semesters,
    currentSemesterId,
    currentSemesterName,
    isActiveSemester,
    loaded,
    loading,
    error,
    fetchSemesters,
    setCurrentSemester,
  } = useSemesterStore()

  useEffect(() => {
    if (!loaded && !loading) {
      fetchSemesters()
    }
  }, [loaded, loading, fetchSemesters])

  // ── Loading state ──
  if (loading && !loaded) {
    return (
      <div className={`flex items-center gap-1.5 text-sm text-gray-400 ${className}`}>
        <Loader2 className="w-3.5 h-3.5 animate-spin" />
        <span>加载学期…</span>
      </div>
    )
  }

  // ── Error state ──
  if (error && !loaded) {
    return (
      <div className={`flex items-center gap-1.5 text-sm text-red-500 ${className}`}>
        <AlertCircle className="w-3.5 h-3.5" />
        <span>学期加载失败</span>
      </div>
    )
  }

  // ── Empty state ──
  if (loaded && semesters.length === 0) {
    return (
      <div className={`flex items-center gap-1.5 text-sm text-gray-400 ${className}`}>
        <span>暂无学期数据</span>
      </div>
    )
  }

  return (
    <div className={`flex flex-col gap-1 ${className}`}>
      {/* Selector row */}
      <div className="flex items-center gap-2">
        <label className="text-xs text-gray-500 whitespace-nowrap">当前学期</label>
        <div className="relative">
          <select
            value={currentSemesterId ?? ''}
            onChange={(e) => {
              const id = Number(e.target.value)
              if (Number.isInteger(id) && id > 0) {
                setCurrentSemester(id)
              }
            }}
            className="appearance-none pl-2.5 pr-7 py-1 text-sm font-medium border border-gray-200
                       rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-blue-500
                       min-w-[160px] cursor-pointer"
          >
            {semesters.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}{s.isActive ? ' (当前)' : ''}
              </option>
            ))}
          </select>
          <ChevronDown className="absolute right-2 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-gray-400 pointer-events-none" />
        </div>
        {currentSemesterName && !isActiveSemester && (
          <span className="text-xs text-amber-600 font-medium">
            非激活学期
          </span>
        )}
      </div>

      {/* Fallback warning */}
      {showFallbackWarning && isActiveSemester && loaded && (
        <p className="text-[11px] text-gray-400 leading-tight">
          当前使用默认激活学期
        </p>
      )}
    </div>
  )
}
