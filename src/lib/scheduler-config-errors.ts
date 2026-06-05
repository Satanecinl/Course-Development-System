// src/lib/scheduler-config-errors.ts
// K21-FIX-G-SOLVER-CONFIG-UI
//
// Translate raw API error envelopes (SCHEDULING_CONFIG_NOT_FOUND,
// SEMESTER_MISMATCH, CONFIG_IN_USE, etc.) into user-facing Chinese
// messages that the scheduler UI can show directly in toasts.

import type { FriendlyError } from '@/types/scheduling-config'

interface ApiErrorBody {
  success?: false
  error?: string
  message?: string
  runIds?: number[]
  invalidIds?: number[]
  mismatchedIds?: number[]
}

const FRIENDLY: Record<string, string> = {
  // ── 404 ──
  SCHEDULING_CONFIG_NOT_FOUND: '配置不存在或已删除，请重新选择',

  // ── 400 validation ──
  INVALID_NAME: '配置名称不合法（应为 1-100 字符）',
  INVALID_SEMESTER_ID: '学期 ID 必须是正整数或 null',
  INVALID_MAX_ITERATIONS: '最大迭代次数必须在 100-15000 之间',
  INVALID_LAHC_WINDOW_SIZE: 'LAHC 窗口大小必须在 50-2000 之间',
  INVALID_RANDOM_SEED: '随机种子必须是 0-2147483647 之间的整数',
  INVALID_SOLVER_VERSION: 'Solver 版本号不合法（最多 50 字符）',
  INVALID_LOCKED_SLOT_IDS: '锁定的课表槽位 ID 不合法',
  INVALID_CONFIG_ID: '配置 ID 必须是正整数',
  INVALID_OVERRIDE: '本次覆写参数不合法',
  INVALID_SLOT_IDS: '存在不存在的课表槽位 ID',
  LOCKED_SLOT_SEMESTER_MISMATCH: '部分锁定的课表槽位属于其他学期',
  TOO_MANY_LOCKED_SLOTS: '锁定的课表槽位过多（最多 1000 个）',

  // ── 400 semester ──
  SEMESTER_NOT_FOUND: '指定的学期不存在',
  SEMESTER_MISMATCH: '配置所属学期与当前学期不一致',
  NO_ACTIVE_SEMESTER: '当前没有活跃的学期，请先设置一个',
  MULTIPLE_ACTIVE_SEMESTERS: '存在多个活跃学期，请明确指定',

  // ── 409 ──
  CONFIG_IN_USE: '该配置已被历史排课运行引用，不能删除',

  // ── 401 / 403 ──
  UNAUTHENTICATED: '请先登录',
  FORBIDDEN: '当前账号没有权限执行该操作',

  // ── 500 ──
  PREVIEW_FAILED: '排课预览失败',
  APPLY_FAILED: '应用排课结果失败',
  ROLLBACK_FAILED: '撤销排课应用失败',
  FETCH_FAILED: '加载失败',
  CREATE_FAILED: '创建配置失败',
  UPDATE_FAILED: '更新配置失败',
  DELETE_FAILED: '删除配置失败',
}

/**
 * Build a FriendlyError from any thrown value.
 * - Pass through the body object thrown by the client.
 * - Map known `error` codes to user-facing messages.
 * - Fall back to the raw `message` for unknown codes.
 */
export function toFriendlyError(err: unknown): FriendlyError {
  const body = (err ?? {}) as ApiErrorBody
  const code = body.error ?? 'UNKNOWN'
  const userMessage = FRIENDLY[code] ?? body.message ?? '未知错误'

  return {
    code,
    userMessage,
    details: {
      runIds: body.runIds,
      invalidIds: body.invalidIds,
      mismatchedIds: body.mismatchedIds,
    },
  }
}
