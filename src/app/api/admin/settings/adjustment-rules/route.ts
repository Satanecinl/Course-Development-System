/**
 * K26-M1: Adjustment rules — read-only API.
 *
 * GET /api/admin/settings/adjustment-rules
 *
 * Returns current adjustment rule status, WorkTime integration,
 * and safeguard configuration. Read-only.
 */

import { NextResponse, type NextRequest } from 'next/server'
import { requirePermission } from '@/lib/auth/require-permission'
import { prisma } from '@/lib/prisma'

export async function GET(_request: NextRequest) {
  const auth = await requirePermission('settings:manage', _request)
  if ('error' in auth) return auth.error

  try {
    // ── Resolve current WorkTime for the active semester ──
    const activeSemester = await prisma.semester.findFirst({ where: { isActive: true } })
    let workTimeSource = 'unknown'
    let allowWeekend = false
    let activeSlotIndexes: number[] = []
    let legacySlotIndexes: number[] = []

    if (activeSemester) {
      const wtConfig = await prisma.workTimeConfig.findFirst({
        where: { semesterId: activeSemester.id, isDefault: true, isActive: true },
        include: { slots: { orderBy: { sortOrder: 'asc' } } },
      })
      if (wtConfig) {
        workTimeSource = 'database'
        allowWeekend = wtConfig.allowWeekend
        activeSlotIndexes = wtConfig.slots.filter(s => s.isActive && s.isTeachingSlot).map(s => s.slotIndex)
        legacySlotIndexes = wtConfig.slots.filter(s => s.isActive && s.isLegacyDisplay).map(s => s.slotIndex)
      } else {
        workTimeSource = 'staticFallback'
        allowWeekend = false
        activeSlotIndexes = [1, 2, 3, 4, 5]
        legacySlotIndexes = [6, 7]
      }
    }

    // ── Check ScheduleAdjustment table stats ──
    const totalAdjustments = await prisma.scheduleAdjustment.count()
    const activeAdjustments = await prisma.scheduleAdjustment.count({ where: { status: 'ACTIVE' } })

    // ── Build rules ──
    const rules = [
      {
        key: 'crossWeekAdjustment',
        label: '跨周调课',
        value: true,
        status: 'active' as const,
        editable: false,
        source: 'adjustments.ts validateScheduleAdjustmentInput — targetWeek 允许 1-20',
        description: '支持跨周调课。targetWeek 允许与 week 不同的周次（1-20 范围内）。系统会检查目标周的教室/教师/班级冲突。',
      },
      {
        key: 'weekendAdjustment',
        label: '周末调课',
        value: allowWeekend,
        status: 'active' as const,
        editable: false,
        source: `WorkTime allowWeekend=${allowWeekend} (${workTimeSource})`,
        description: `当前 WorkTime 配置 ${allowWeekend ? '允许' : '禁止'}周末排课。推荐方案 ${allowWeekend ? '可' : '不可'}推荐到周末。WorkTime 设置页可修改此行为。`,
      },
      {
        key: 'recommendationUsesWorkTime',
        label: '推荐使用 WorkTime',
        value: true,
        status: 'active' as const,
        editable: false,
        source: 'adjustment-plan-recommendations.ts — slotIndexes 从 activeTeachingSlotIndexes 获取',
        description: '推荐方案使用 WorkTime 的 allowed days 和 activeTeachingSlotIndexes。排除 legacy slot 6/7。',
      },
      {
        key: 'excludeLegacySlots',
        label: '排除 Legacy Slot 6/7',
        value: true,
        status: 'active' as const,
        editable: false,
        source: 'adjustment-plan-recommendations.ts — slotIndexes 不含 6/7',
        description: '推荐方案不包含 slot 6（11-12 节）和 slot 7（中午）。这两个节次仅用于历史数据显示。',
      },
      {
        key: 'preferredDayOfWeek',
        label: 'preferredDayOfWeek 支持',
        value: true,
        status: 'active' as const,
        editable: false,
        source: 'plan-recommendations API — 接受 preferredDayOfWeek 参数',
        description: '推荐方案支持按 preferredDayOfWeek 排序偏好。WorkTime allowWeekend=false 时拒绝 day 6/7。三桶排序：首选日 > 同周其他日 > 回退。',
      },
      {
        key: 'defaultRecommendationLimit',
        label: '默认推荐方案数量',
        value: 5,
        status: 'active' as const,
        editable: false,
        source: 'adjustment-plan-recommendations.ts DEFAULT_LIMIT=5, MAX_LIMIT=20',
        description: '默认返回 5 个推荐方案，最大 20 个。可通过 limit 参数调整。',
      },
      {
        key: 'dryRunWorkTimeGuard',
        label: 'dry-run WorkTime guard',
        value: true,
        status: 'active' as const,
        editable: false,
        source: 'adjustments.ts dryRunScheduleAdjustment — K26-I2 checkWorkTimeTargetAllowed',
        description: 'dry-run 阶段检查目标 day/slot 是否在 WorkTime 允许范围内。非法 target 被拦截。',
      },
      {
        key: 'dryRunConflictCheck',
        label: 'dry-run 冲突检查',
        value: true,
        status: 'active' as const,
        editable: false,
        source: 'adjustments.ts dryRunScheduleAdjustment → conflict-check.ts',
        description: 'dry-run 检查教师冲突、班级冲突、教室冲突。同时检查容量（warning）。',
      },
      {
        key: 'applyGuardRequiresConfirmation',
        label: 'apply 需要确认',
        value: true,
        status: 'active' as const,
        editable: false,
        source: 'adjustments.ts createScheduleAdjustment — 需要 confirmText',
        description: '正式调课需要传入 confirmText="CONFIRM_ADJUSTMENT"。apply 前内部运行完整 dry-run。',
      },
      {
        key: 'noRoomAdjustmentAllowed',
        label: '无教室调课',
        value: true,
        status: 'fixed' as const,
        editable: false,
        source: 'validateScheduleAdjustmentInput — newRoomId 可为 null',
        description: '当前允许 roomId=null 的调课。冲突检查对 null room 不做教室冲突检测。',
      },
    ]

    // ── Build safeguards ──
    const safeguards = [
      {
        key: 'workTimeTargetGuard',
        label: 'WorkTime 目标合法性检查',
        enabled: true,
        severity: 'hard' as const,
        description: 'dry-run/apply 时检查目标 day/slot 是否在 WorkTime 允许范围内。',
      },
      {
        key: 'teacherConflictGuard',
        label: '教师冲突检查',
        enabled: true,
        severity: 'hard' as const,
        description: '检查目标时段是否有同教师的重叠课程。',
      },
      {
        key: 'classGroupConflictGuard',
        label: '班级冲突检查',
        enabled: true,
        severity: 'hard' as const,
        description: '检查目标时段是否有同班级的重叠课程。',
      },
      {
        key: 'roomConflictGuard',
        label: '教室冲突检查',
        enabled: true,
        severity: 'hard' as const,
        description: '检查目标教室在目标时段是否已被占用。',
      },
      {
        key: 'capacityWarningGuard',
        label: '容量警告',
        enabled: true,
        severity: 'warning' as const,
        description: '如果目标教室容量不足，生成 warning（不阻止）。',
      },
      {
        key: 'confirmationGuard',
        label: 'apply 确认门禁',
        enabled: true,
        severity: 'hard' as const,
        description: 'apply 必须传入 confirmText。dry-run 不需要确认。',
      },
      {
        key: 'weekendTargetGuard',
        label: '周末目标限制',
        enabled: !allowWeekend,
        severity: 'hard' as const,
        description: `WorkTime allowWeekend=${allowWeekend}。${allowWeekend ? '允许' : '禁止'}推荐到周末。`,
      },
    ]

    return NextResponse.json({
      success: true,
      summary: {
        crossWeekAdjustmentSupported: true,
        weekendAdjustmentControlledByWorkTime: true,
        workTimeIntegrated: true,
        recommendationIntegrated: true,
        dryRunGuardIntegrated: true,
        applyGuardIntegrated: true,
        roomRecommendationIntegrated: true,
        totalAdjustments,
        activeAdjustments,
        workTimeSource,
        allowWeekend,
        activeSlotIndexes,
        legacySlotIndexes,
      },
      rules,
      safeguards,
    })
  } catch (error) {
    console.error('Adjustment rules API error:', error)
    return NextResponse.json(
      { success: false, error: 'INTERNAL_ERROR', message: '获取调课规则失败' },
      { status: 500 },
    )
  }
}
