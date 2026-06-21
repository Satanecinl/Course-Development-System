/**
 * L6-E2F — Shared Display Utilities for Course-Setting Components
 *
 * Stage: L6-E2F-XLSX-COURSE-SETTING-PREVIEW-COMPONENT-DECOMPOSITION
 *
 * Pure formatting helpers and tone helpers. No React, no state, no I/O.
 */

import type { CourseSettingResolutionStatus } from '@/lib/import/course-setting-manual-resolution-l6-e1'
import type { CourseSettingApprovalReviewUiDecisionValue } from '@/lib/import/course-setting-xlsx-client'

/**
 * Truncate a long ID or hash for display.
 */
export const truncateId = (id: string, len = 16): string =>
  id.length > len ? id.slice(0, len) + '…' : id

/**
 * Status badge styles for resolution items.
 */
export const resolutionStatusBadge = (status: CourseSettingResolutionStatus): {
  className: string
  label: string
} => {
  switch (status) {
    case 'importable':
      return {
        className: 'bg-green-100 text-green-700 border-green-200',
        label: '可导入',
      }
    case 'needsResolution':
      return {
        className: 'bg-amber-100 text-amber-700 border-amber-200',
        label: '需处理',
      }
    case 'ignored':
      return {
        className: 'bg-gray-100 text-gray-500 border-gray-200',
        label: '已忽略',
      }
    default:
      return {
        className: 'bg-blue-100 text-blue-700 border-blue-200',
        label: '暂不处理',
      }
  }
}

/**
 * Tone classes for summary cards.
 */
export const toneClass = (tone: 'default' | 'muted' | 'success' | 'danger' | 'warn'): string => {
  switch (tone) {
    case 'success':
      return 'border-green-200 bg-green-50 text-green-700'
    case 'danger':
      return 'border-red-200 bg-red-50 text-red-700'
    case 'warn':
      return 'border-amber-200 bg-amber-50 text-amber-700'
    case 'muted':
      return 'border-gray-200 bg-gray-50 text-gray-700'
    default:
      return 'border-indigo-200 bg-indigo-50 text-indigo-700'
  }
}

/**
 * Translate match status to Chinese for assignment table.
 */
export const translateMatchStatus = (status: string): {
  label: string
  className: string
} => {
  switch (status) {
    case 'matched':
      return { label: 'matched', className: 'text-green-700' }
    case 'ambiguous':
      return { label: 'ambiguous', className: 'text-amber-700' }
    case 'missing':
      return { label: 'missing', className: 'text-red-700' }
    default:
      return { label: 'unknown', className: 'text-gray-500' }
  }
}

/**
 * Tone for decision badge.
 */
export const decisionTone = (
  decision: CourseSettingApprovalReviewUiDecisionValue,
): 'default' | 'success' | 'danger' | 'warn' | 'muted' => {
  switch (decision) {
    case 'approved':
      return 'success'
    case 'rejected':
      return 'danger'
    case 'needsReview':
      return 'warn'
    case 'pending':
      return 'muted'
    default:
      return 'default'
  }
}

/**
 * Empty/dash placeholder for missing values.
 */
export const DASH = '—' as const