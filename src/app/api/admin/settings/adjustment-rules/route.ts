/**
 * K26-M1 / K38-A / K38-B: Adjustment rules — configurable API.
 *
 * GET  /api/admin/settings/adjustment-rules
 * PATCH /api/admin/settings/adjustment-rules
 *
 * K38-B: Added AdjustmentRuleConfig persistence for defaultRecommendationLimit.
 * GET reads config. PATCH updates only defaultRecommendationLimit (1-20).
 */

import { NextResponse, type NextRequest } from 'next/server'
import { requirePermission } from '@/lib/auth/require-permission'
import { prisma } from '@/lib/prisma'
import {
  getDefaultRecommendationLimit,
  validateDefaultRecommendationLimit,
  updateAdjustmentRuleConfig,
  MAX_RECOMMENDATION_LIMIT,
  MIN_RECOMMENDATION_LIMIT,
} from '@/lib/settings/adjustment-rule-config'

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
    const config = await getDefaultRecommendationLimit()

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

    const ruleBaseEditable = false // base—only defaultRecommendationLimit is editable now

    const rules: AdjustmentRule[] = [
      // WorkTime group
      {
        key: 'workTimeConfigSource', group: 'worktime', label: 'WorkTime 配置来源',
        value: workTimeSource, status: 'active', editable: false,
        source: workTimeSource === 'database' ? 'workTimeConfig table (default config)' : workTimeSource === 'staticFallback' ? 'K26-D static fallback' : 'no active semester',
        description: '当前诊断学期下 WorkTime 配置的来源。database = 已激活的配置；staticFallback = 静态默认。',
      },
      {
        key: 'allowWeekend', group: 'worktime', label: '允许周末排课',
        value: allowWeekend, status: 'active', editable: false,
        source: workTimeConfigName ? `WorkTime config: ${workTimeConfigName}` : 'static fallback',
        description: '在「节次与作息设置」中修改。',
      },
      {
        key: 'activeSlotIndexes', group: 'worktime', label: 'Active teaching slots',
        value: `[${activeSlotIndexes.join(',')}]`, status: 'active', editable: false,
        source: 'workTimeConfig.slots isActive && isTeachingSlot',
        description: `当前 WorkTime 可教学节次：${activeSlotIndexes.join(', ')}（共 ${activeSlotIndexes.length} 个）。`,
      },
      {
        key: 'legacySlotIndexes', group: 'worktime', label: 'Legacy display slots',
        value: `[${legacySlotIndexes.join(',')}]`, status: 'fixed', editable: false,
        source: 'workTimeConfig.slots isActive && isLegacyDisplay',
        description: `仅历史数据显示：${legacySlotIndexes.join(', ')}。推荐方案拒绝这些节次。`,
      },
      // Recommendation group
      {
        key: 'recommendationUsesWorkTime', group: 'recommendation', label: '推荐使用 WorkTime',
        value: true, status: 'active', editable: false,
        source: 'adjustment-plan-recommendations.ts — slotIndexes 从 activeTeachingSlotIndexes 获取',
        description: '推荐方案使用 WorkTime allowed days 和 teachingSlotIndexes。排除 legacy slot 6/7。',
      },
      {
        key: 'excludeLegacySlots', group: 'recommendation', label: '排除 Legacy Slot 6/7',
        value: true, status: 'active', editable: false,
        source: 'adjustment-plan-recommendations.ts — slotIndexes 不含 6/7',
        description: '推荐方案不包含 slot 6（11-12 节）和 slot 7（中午）。',
      },
      {
        key: 'preferredDayOfWeek', group: 'recommendation', label: 'preferredDayOfWeek 支持',
        value: true, status: 'active', editable: false,
        source: 'plan-recommendations API — 接受 preferredDayOfWeek 参数',
        description: '推荐方案支持按 preferredDayOfWeek 排序。WorkTime allowWeekend=false 时拒绝 day 6/7。',
      },
      {
        key: 'defaultRecommendationLimit', group: 'recommendation', label: '默认推荐方案数量',
        value: config.value, status: 'active', editable: true,
        source: config.source === 'database' ? 'AdjustmentRuleConfig table' : 'Code default (DEFAULT_LIMIT=5)',
        description: `当前 ${config.source === 'database' ? 'config' : '代码默认'}值：${config.value}（范围 ${MIN_RECOMMENDATION_LIMIT}-${MAX_RECOMMENDATION_LIMIT}）。${config.source === 'database' ? '可在此页面编辑保存。' : '可通过请求参数 limit 覆盖。'}`,
      },
      {
        key: 'roomRecommendationIntegrated', group: 'recommendation', label: '教室推荐集成',
        value: true, status: 'active', editable: false,
        source: 'room-recommendations.ts',
        description: '推荐包含教室。考虑容量 + Linxiao 政策 + 冲突检查。',
      },
      // Dry-run group
      {
        key: 'crossWeekAdjustment', group: 'dry-run', label: '跨周调课',
        value: true, status: 'active', editable: false,
        source: 'adjustments.ts validateScheduleAdjustmentInput — targetWeek 允许 1-20',
        description: 'targetWeek 可与 week 不同（1-20 范围）。系统检查目标周冲突。',
      },
      {
        key: 'dryRunWorkTimeGuard', group: 'dry-run', label: 'dry-run WorkTime guard',
        value: true, status: 'active', editable: false,
        source: 'adjustments.ts dryRunScheduleAdjustment — K26-I2 checkWorkTimeTargetAllowed',
        description: 'dry-run 检查目标 day/slot 是否在 WorkTime 允许范围内。',
      },
      {
        key: 'dryRunConflictCheck', group: 'dry-run', label: 'dry-run 冲突检查',
        value: true, status: 'active', editable: false,
        source: 'adjustments.ts dryRunScheduleAdjustment → conflict-check.ts',
        description: 'dry-run 检查教师、班级、教室冲突。同时检查容量（warning）。',
      },
      // Apply group
      {
        key: 'applyGuardRequiresConfirmation', group: 'apply', label: 'apply 需要确认',
        value: true, status: 'active', editable: false,
        source: 'adjustments.ts createScheduleAdjustment — 需要 confirmText',
        description: '正式调课需要 confirmText="CONFIRM_ADJUSTMENT"。apply 前内部运行完整 dry-run。',
      },
      {
        key: 'noRoomAdjustmentAllowed', group: 'apply', label: '无教室调课',
        value: true, status: 'fixed', editable: false,
        source: 'validateScheduleAdjustmentInput — newRoomId 可为 null',
        description: '允许 roomId=null 的调课。冲突检查对 null room 不做教室冲突检测。',
      },
    ]

    const hardGuards = [
      {
        key: 'workTimeTargetGuard', label: 'WorkTime 目标合法性检查', enabled: true, severity: 'hard' as const,
        description: 'dry-run/apply 时检查目标 day/slot 是否在 WorkTime 允许范围内。',
      },
      {
        key: 'teacherConflictGuard', label: '教师冲突检查', enabled: true, severity: 'hard' as const,
        description: '检查目标时段是否有同教师的重叠课程。',
      },
      {
        key: 'classGroupConflictGuard', label: '班级冲突检查', enabled: true, severity: 'hard' as const,
        description: '检查目标时段是否有同班级的重叠课程。',
      },
      {
        key: 'roomConflictGuard', label: '教室冲突检查', enabled: true, severity: 'hard' as const,
        description: '检查目标教室在目标时段是否已被占用。',
      },
      {
        key: 'capacityWarningGuard', label: '容量警告', enabled: true, severity: 'warning' as const,
        description: '如果目标教室容量不足，生成 warning（不阻止）。',
      },
      {
        key: 'confirmationGuard', label: 'apply 确认门禁', enabled: true, severity: 'hard' as const,
        description: 'apply 必须传入 confirmText。dry-run 不需要确认。',
      },
      {
        key: 'weekendTargetGuard', label: '周末目标限制', enabled: !allowWeekend, severity: 'hard' as const,
        description: `WorkTime allowWeekend=${allowWeekend}。${allowWeekend ? '允许' : '禁止'}推荐到周末。本页不可关闭。`,
      },
    ]

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
      moduleVersion: 'K38-B',
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
        worktime: { label: 'WorkTime 规则', description: '节次与作息相关规则，由 WorkTime 配置驱动。' },
        recommendation: { label: '推荐规则', description: '调课推荐方案生成规则。' },
        'dry-run': { label: 'dry-run 安全规则', description: '调课预览阶段的安全检查。' },
        apply: { label: 'apply 安全规则', description: '正式调课阶段的安全门禁。' },
        'hard-guard': { label: '不可关闭的硬规则', description: '系统级 hard guard，不可通过 UI 关闭。' },
      },
      rules: grouped,
      safeguards: hardGuards,
      editability: {
        allRulesEditable: false,
        defaultRecommendationLimitEditable: true,
        allowWeekendEditableInThisPage: false,
        dryRunGuardClosable: false,
        applyGuardClosable: false,
        note: 'defaultRecommendationLimit 可在本页编辑（范围 1-20）。其他规则 hard-locked。',
      },
      defaultRecommendationLimit: {
        current: config.value,
        min: MIN_RECOMMENDATION_LIMIT,
        max: MAX_RECOMMENDATION_LIMIT,
        editable: true,
        source: config.source,
        note: `来源：${config.source}。请求参数 limit 优先于 config default。`,
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

// ── PATCH (K38-B: only allows defaultRecommendationLimit) ──

export async function PATCH(request: NextRequest) {
  const auth = await requirePermission('settings:manage', request)
  if ('error' in auth) return auth.error

  let body: { defaultRecommendationLimit?: unknown }
  try {
    body = await request.json()
  } catch {
    return NextResponse.json(
      { success: false, error: 'INVALID_JSON', message: '请求体必须为 JSON' },
      { status: 400 },
    )
  }

  if (body.defaultRecommendationLimit === undefined) {
    return NextResponse.json(
      { success: false, error: 'MISSING_FIELD', message: '仅支持更新 defaultRecommendationLimit' },
      { status: 400 },
    )
  }

  const v = validateDefaultRecommendationLimit(body.defaultRecommendationLimit)
  if (!v.valid) {
    return NextResponse.json(
      { success: false, error: 'INVALID_FIELD', message: v.message },
      { status: 400 },
    )
  }

  try {
    const config = await updateAdjustmentRuleConfig({ defaultRecommendationLimit: v.value })

    return NextResponse.json({
      success: true,
      config: {
        defaultRecommendationLimit: config.defaultRecommendationLimit,
        source: 'database',
      },
    })
  } catch (error) {
    console.error('PATCH adjustment rules error:', { error: (error as Error)?.message })
    return NextResponse.json(
      { success: false, error: 'INTERNAL_ERROR', message: '保存调课规则配置失败' },
      { status: 500 },
    )
  }
}

export async function POST() {
  return NextResponse.json(
    { success: false, error: 'METHOD_NOT_ALLOWED', message: '调课规则设置不支持 POST，请使用 PATCH 更新推荐数量' },
    { status: 405 },
  )
}