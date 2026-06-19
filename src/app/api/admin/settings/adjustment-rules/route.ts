/**
 * K26-M1 / K38-A: Adjustment rules — diagnostics-enhanced read-only API.
 *
 * GET /api/admin/settings/adjustment-rules
 *
 * K38-A: Added rules grouping (recommendation / dry-run / apply / WorkTime /
 * hard-guard), explicit editability section, defaultRecommendationLimit
 * surfaced, WorkTime context enhanced. No PATCH — all rules remain locked.
 * K38-B (future): add config table for user-editable defaultRecommendationLimit.
 */

import { NextResponse, type NextRequest } from 'next/server'
import { requirePermission } from '@/lib/auth/require-permission'
import { prisma } from '@/lib/prisma'

type RuleGroup = 'recommendation' | 'dry-run' | 'apply' | 'worktime' | 'hard-guard' | 'other'

interface AdjustmentRule {
  key: string
  group: RuleGroup
  label: string
  value: boolean | number | string
  status: 'active' | 'fixed' | 'planned' | 'unknown'
  editable: boolean
  source: string
  description: string
}

export async function GET(_request: NextRequest) {
  const auth = await requirePermission('settings:manage', _request)
  if ('error' in auth) return auth.error

  try {
    // ── Resolve current WorkTime for the active semester ──
    const activeSemester = await prisma.semester.findFirst({ where: { isActive: true } })
    let workTimeSource: 'database' | 'staticFallback' | 'unknown' = 'unknown'
    let allowWeekend = false
    let activeSlotIndexes: number[] = []
    let legacySlotIndexes: number[] = []
    let workTimeConfigName: string | null = null

    if (activeSemester) {
      const wtConfig = await prisma.workTimeConfig.findFirst({
        where: { semesterId: activeSemester.id, isDefault: true, isActive: true },
        include: { slots: { orderBy: { sortOrder: 'asc' } } },
      })
      if (wtConfig) {
        workTimeSource = 'database'
        workTimeConfigName = wtConfig.name
        allowWeekend = wtConfig.allowWeekend
        activeSlotIndexes = wtConfig.slots.filter((s) => s.isActive && s.isTeachingSlot).map((s) => s.slotIndex)
        legacySlotIndexes = wtConfig.slots.filter((s) => s.isActive && s.isLegacyDisplay).map((s) => s.slotIndex)
      } else {
        workTimeSource = 'staticFallback'
        activeSlotIndexes = [1, 2, 3, 4, 5]
        legacySlotIndexes = [6, 7]
      }
    }

    const totalAdjustments = await prisma.scheduleAdjustment.count()
    const activeAdjustments = await prisma.scheduleAdjustment.count({ where: { status: 'ACTIVE' } })

    // ── Rules grouped by category (K38-A) ──
    const rules: AdjustmentRule[] = [
      // WorkTime group
      {
        key: 'workTimeConfigSource',
        group: 'worktime',
        label: 'WorkTime 配置来源',
        value: workTimeSource,
        status: 'active',
        editable: false,
        source: workTimeSource === 'database' ? 'workTimeConfig table (default config)' : workTimeSource === 'staticFallback' ? 'K26-D static fallback' : 'no active semester',
        description: '当前诊断学期下 WorkTime 配置的来源。database = 已激活的配置；staticFallback = 静态默认。',
      },
      {
        key: 'allowWeekend',
        group: 'worktime',
        label: '允许周末排课',
        value: allowWeekend,
        status: 'active',
        editable: false,
        source: workTimeConfigName ? `WorkTime config: ${workTimeConfigName}` : 'static fallback',
        description: 'WorkTime 配置的 allowWeekend。控制周末（day 6/7）是否可用于推荐和调课。在「节次与作息设置」中修改。',
      },
      {
        key: 'activeSlotIndexes',
        group: 'worktime',
        label: 'Active teaching slot indexes',
        value: `[${activeSlotIndexes.join(',')}]`,
        status: 'active',
        editable: false,
        source: 'workTimeConfig.slots isActive && isTeachingSlot',
        description: `当前 WorkTime 配置的可教学节次。共 ${activeSlotIndexes.length} 个：${activeSlotIndexes.join(', ')}。`,
      },
      {
        key: 'legacySlotIndexes',
        group: 'worktime',
        label: 'Legacy display slot indexes',
        value: `[${legacySlotIndexes.join(',')}]`,
        status: 'fixed',
        editable: false,
        source: 'workTimeConfig.slots isActive && isLegacyDisplay',
        description: `仅用于历史数据显示的节次：${legacySlotIndexes.join(', ')}。推荐方案和调课 dry-run 拒绝这些 slotIndex。`,
      },

      // Recommendation group
      {
        key: 'recommendationUsesWorkTime',
        group: 'recommendation',
        label: '推荐使用 WorkTime',
        value: true,
        status: 'active',
        editable: false,
        source: 'adjustment-plan-recommendations.ts — slotIndexes 从 activeTeachingSlotIndexes 获取',
        description: '推荐方案使用 WorkTime 的 allowed days 和 activeTeachingSlotIndexes。排除 legacy slot 6/7。',
      },
      {
        key: 'excludeLegacySlots',
        group: 'recommendation',
        label: '排除 Legacy Slot 6/7',
        value: true,
        status: 'active',
        editable: false,
        source: 'adjustment-plan-recommendations.ts — slotIndexes 不含 6/7',
        description: '推荐方案不包含 slot 6（11-12 节）和 slot 7（中午）。这两个节次仅用于历史数据显示。',
      },
      {
        key: 'preferredDayOfWeek',
        group: 'recommendation',
        label: 'preferredDayOfWeek 支持',
        value: true,
        status: 'active',
        editable: false,
        source: 'plan-recommendations API — 接受 preferredDayOfWeek 参数',
        description: '推荐方案支持按 preferredDayOfWeek 排序偏好。WorkTime allowWeekend=false 时拒绝 day 6/7。三桶排序：首选日 > 同周其他日 > 回退。',
      },
      {
        key: 'defaultRecommendationLimit',
        group: 'recommendation',
        label: '默认推荐方案数量',
        value: 5,
        status: 'fixed',
        editable: false,
        source: 'adjustment-plan-recommendations.ts DEFAULT_LIMIT=5, MAX_LIMIT=20',
        description: '当前代码默认返回 5 个推荐方案，最大 20 个。可通过 limit 参数调整（请求参数 > 默认值）。本阶段不支持 UI 持久化编辑（需 K38-B schema stage）。',
      },
      {
        key: 'roomRecommendationIntegrated',
        group: 'recommendation',
        label: '教室推荐集成',
        value: true,
        status: 'active',
        editable: false,
        source: 'room-recommendations.ts',
        description: '推荐方案包含教室推荐。默认 5 个。考虑容量 + Linxiao 政策 + 冲突检查。',
      },

      // Dry-run group
      {
        key: 'crossWeekAdjustment',
        group: 'dry-run',
        label: '跨周调课',
        value: true,
        status: 'active',
        editable: false,
        source: 'adjustments.ts validateScheduleAdjustmentInput — targetWeek 允许 1-20',
        description: '支持跨周调课。targetWeek 允许与 week 不同的周次（1-20 范围内）。系统会检查目标周的教室/教师/班级冲突。',
      },
      {
        key: 'dryRunWorkTimeGuard',
        group: 'dry-run',
        label: 'dry-run WorkTime guard',
        value: true,
        status: 'active',
        editable: false,
        source: 'adjustments.ts dryRunScheduleAdjustment — K26-I2 checkWorkTimeTargetAllowed',
        description: 'dry-run 阶段检查目标 day/slot 是否在 WorkTime 允许范围内。非法 target 被拦截。',
      },
      {
        key: 'dryRunConflictCheck',
        group: 'dry-run',
        label: 'dry-run 冲突检查',
        value: true,
        status: 'active',
        editable: false,
        source: 'adjustments.ts dryRunScheduleAdjustment → conflict-check.ts',
        description: 'dry-run 检查教师冲突、班级冲突、教室冲突。同时检查容量（warning）。',
      },

      // Apply group
      {
        key: 'applyGuardRequiresConfirmation',
        group: 'apply',
        label: 'apply 需要确认',
        value: true,
        status: 'active',
        editable: false,
        source: 'adjustments.ts createScheduleAdjustment — 需要 confirmText',
        description: '正式调课需要传入 confirmText="CONFIRM_ADJUSTMENT"。apply 前内部运行完整 dry-run。',
      },
      {
        key: 'noRoomAdjustmentAllowed',
        group: 'apply',
        label: '无教室调课',
        value: true,
        status: 'fixed',
        editable: false,
        source: 'validateScheduleAdjustmentInput — newRoomId 可为 null',
        description: '当前允许 roomId=null 的调课。冲突检查对 null room 不做教室冲突检测。',
      },
    ]

    // ── Hard guards (不可关闭) ──
    const hardGuards = [
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
        description: `WorkTime allowWeekend=${allowWeekend}。${allowWeekend ? '允许' : '禁止'}推荐到周末。本页不可关闭此 guard。`,
      },
    ]

    // ── Group rules ──
    const grouped: Record<RuleGroup, AdjustmentRule[]> = {
      worktime: rules.filter((r) => r.group === 'worktime'),
      recommendation: rules.filter((r) => r.group === 'recommendation'),
      'dry-run': rules.filter((r) => r.group === 'dry-run'),
      apply: rules.filter((r) => r.group === 'apply'),
      'hard-guard': [],
      other: rules.filter((r) => r.group === 'other'),
    }

    return NextResponse.json({
      success: true,
      moduleVersion: 'K38-A',
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
        workTimeConfigName,
        allowWeekend,
        activeSlotIndexes,
        legacySlotIndexes,
        activeSlotCount: activeSlotIndexes.length,
      },
      workTimeContext: {
        source: workTimeSource,
        configName: workTimeConfigName,
        allowWeekend,
        activeSlotIndexes,
        legacySlotIndexes,
        weekendBehavior: allowWeekend
          ? '当前 WorkTime 允许周末排课。推荐方案和调课可涉及 day 6/7。'
          : '当前 WorkTime 禁止周末排课。推荐方案和调课目标若为 day 6/7 会被拒绝。在「节次与作息设置」中修改 allowWeekend。',
      },
      groups: {
        worktime: {
          label: 'WorkTime 规则',
          description: '节次与作息相关规则，由 WorkTime 配置驱动。',
        },
        recommendation: {
          label: '推荐规则',
          description: '调课推荐方案生成规则。',
        },
        'dry-run': {
          label: 'dry-run 安全规则',
          description: '调课预览阶段的安全检查。',
        },
        apply: {
          label: 'apply 安全规则',
          description: '正式调课阶段的安全门禁。',
        },
        'hard-guard': {
          label: '不可关闭的硬规则',
          description: '系统级 hard guard，不可通过 UI 关闭。',
        },
      },
      rules: grouped,
      safeguards: hardGuards,
      editability: {
        allRulesEditable: false,
        defaultRecommendationLimitEditable: false,
        allowWeekendEditableInThisPage: false,
        dryRunGuardClosable: false,
        applyGuardClosable: false,
        note: '本阶段（K38-A）仅做诊断增强。defaultRecommendationLimit 等可配置项需后续 K38-B schema/config 阶段。',
      },
      // Surfaced for client display
      defaultRecommendationLimit: {
        current: 5,
        min: 1,
        max: 20,
        editable: false,
        source: 'adjustment-plan-recommendations.ts DEFAULT_LIMIT=5, MAX_LIMIT=20',
        note: '可通过请求参数 limit 覆盖（1-20）。本阶段不支持 UI 持久化。',
      },
    })
  } catch (error) {
    console.error('Adjustment rules API error:', error)
    return NextResponse.json(
      { success: false, error: 'INTERNAL_ERROR', message: '获取调课规则失败' },
      { status: 500 },
    )
  }
}

export async function POST() {
  return NextResponse.json(
    { success: false, error: 'METHOD_NOT_ALLOWED', message: '调课规则设置不支持 POST' },
    { status: 405 },
  )
}
