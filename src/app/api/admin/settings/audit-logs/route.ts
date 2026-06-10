/**
 * K26-Q1: Audit Log settings — read-only API.
 *
 * GET /api/admin/settings/audit-logs
 *
 * Returns a read-only snapshot of the existing partial audit / change log
 * sources in the system, the coverage status of key operations, recent
 * activity samples, and a list of unified-audit-log limitations.
 *
 * IMPORTANT: this is a BASIC, READ-ONLY first version.
 *   - NO unified AuditLog table is added.
 *   - NO schema/migration changes.
 *   - NO new write logic is introduced.
 *   - The endpoint only enumerates EXISTING local record sources
 *     (SchedulingRun / SchedulerRunChange / ScheduleAdjustment /
 *     ImportBatch / ScheduleChangeLog / Semester timestamps / UserRole
 *     timestamps / audit-script docs).
 *   - Items that are NOT yet covered are surfaced as planned / partial /
 *     not-covered. They are not invented.
 *
 * Permission: `settings:manage` (reused from existing system settings APIs).
 */

import { NextResponse, type NextRequest } from 'next/server'
import { readdirSync, existsSync } from 'fs'
import { join } from 'path'
import { requirePermission } from '@/lib/auth/require-permission'
import { prisma } from '@/lib/prisma'
import type { OperationCoverageStatus } from '@/lib/settings/audit-logs-client'

// ─── Filesystem sources (read-only) ─────────────────────────────────────

const PROJECT_ROOT = join(process.cwd())
const DOCS_DIR = join(PROJECT_ROOT, 'docs')
const SCRIPTS_DIR = join(PROJECT_ROOT, 'scripts')

function safeReadDir(path: string): string[] {
  try {
    return existsSync(path) ? readdirSync(path) : []
  } catch {
    return []
  }
}

function countAuditScripts(): number {
  // Any script starting with `audit-` is considered an existing local
  // audit / verification capability. This is used as a static summary
  // count, not a guarantee of coverage.
  if (!existsSync(SCRIPTS_DIR)) return 0
  let count = 0
  for (const name of safeReadDir(SCRIPTS_DIR)) {
    if (name.startsWith('audit-') && name.endsWith('.ts')) count++
  }
  return count
}

function countK26Docs(): number {
  if (!existsSync(DOCS_DIR)) return 0
  let count = 0
  for (const name of safeReadDir(DOCS_DIR)) {
    if (name.startsWith('k26-') && name.endsWith('.md')) count++
  }
  return count
}

// ─── Handler ───────────────────────────────────────────────────────────

export async function GET(request: NextRequest) {
  const auth = await requirePermission('settings:manage', request)
  if ('error' in auth) return auth.error

  try {
    // ── 1. Local DB read-only counts for existing record sources ──
    const [
      schedulingRunCount,
      schedulerRunChangeCount,
      scheduleAdjustmentCount,
      importBatchCount,
      scheduleChangeLogCount,
      semesterCount,
      userRoleCount,
      rolePermissionCount,
    ] = await Promise.all([
      prisma.schedulingRun.count(),
      prisma.schedulerRunChange.count(),
      prisma.scheduleAdjustment.count(),
      prisma.importBatch.count(),
      prisma.scheduleChangeLog.count(),
      prisma.semester.count(),
      prisma.userRole.count(),
      prisma.rolePermission.count(),
    ])

    // ── 2. Sources catalogue ──
    const sources = [
      {
        key: 'scheduling-run',
        label: 'SchedulingRun',
        status: 'available' as const,
        modelOrTable: 'prisma.schedulingRun',
        recordCount: schedulingRunCount,
        description:
          '自动排课运行记录 (PREVIEW / APPLY / ROLLBACK)。字段包括 mode, status, operatorId, operatorNameSnapshot, ' +
          'startedAt, completedAt, appliedAt, rolledBackAt, errorMessage, changedSlotCount, hardScore/softScore。',
      },
      {
        key: 'scheduler-run-change',
        label: 'SchedulerRunChange',
        status: 'available' as const,
        modelOrTable: 'prisma.schedulerRunChange',
        recordCount: schedulerRunChangeCount,
        description:
          '每次排课运行产生的 per-slot 改动 (oldDayOfWeek / newDayOfWeek / oldRoomId / newRoomId / courseNameSnapshot 等)。' +
          '提供排课前后的具体差异。',
      },
      {
        key: 'schedule-adjustment',
        label: 'ScheduleAdjustment',
        status: 'available' as const,
        modelOrTable: 'prisma.scheduleAdjustment',
        recordCount: scheduleAdjustmentCount,
        description:
          '调课操作记录 (type, week, originalSlotId, newDayOfWeek/newSlotIndex/newRoomId, reason, status, createdAt)。' +
          'ACTIVATE / VOID 状态变更可追溯。',
      },
      {
        key: 'import-batch',
        label: 'ImportBatch',
        status: 'available' as const,
        modelOrTable: 'prisma.importBatch',
        recordCount: importBatchCount,
        description:
          '导入批次记录 (filename, status, strategy, recordCount, createdTaskCount, createdSlotCount, ' +
          'confirmedAt, rolledBackAt, errorMessage, warningsJson, statsJson, qualityJson)。' +
          '每次导入创建一条独立记录。',
      },
      {
        key: 'schedule-change-log',
        label: 'ScheduleChangeLog',
        status: 'partial' as const,
        modelOrTable: 'prisma.scheduleChangeLog',
        recordCount: scheduleChangeLogCount,
        description:
          'ScheduleSlot 写入时由 /api/schedule-slot 自动写入的轻量变更日志 (taskId, oldDay, oldSlotIndex, ' +
          'oldRoomId, newDay, newSlotIndex, newRoomId, reason, createdAt)。' +
          '覆盖范围有限: 仅 admin/db 直写 ScheduleSlot 时触发, 不记录 operatorId / ip / userAgent。',
      },
      {
        key: 'semester-timestamps',
        label: 'Semester createdAt / updatedAt',
        status: 'partial' as const,
        modelOrTable: 'prisma.semester',
        recordCount: semesterCount,
        description:
          'Semester 模型自带 createdAt / updatedAt 时间戳。仅记录学期本身的最后更新时间, ' +
          '不区分创建 / 编辑 / 设置当前 / 删除 / 起止日期维护等具体操作, ' +
          '也不记录 operator。学期设置管理缺统一审计。',
      },
      {
        key: 'user-role-timestamps',
        label: 'UserRole / RolePermission createdAt',
        status: 'partial' as const,
        modelOrTable: 'prisma.userRole / prisma.rolePermission',
        recordCount: userRoleCount + rolePermissionCount,
        description:
          'UserRole 和 RolePermission 仅有 createdAt 时间戳, 没有 updatedAt 或 reason。' +
          '可推断创建时点, 但无法区分解绑 / 重新绑定 / 权限调整等具体操作, ' +
          '无 operator / ip 记录。RBAC 操作缺统一审计。',
      },
      {
        key: 'worktime-config-timestamps',
        label: 'WorkTimeConfig / TimeSlotDefinition createdAt + updatedAt',
        status: 'partial' as const,
        modelOrTable: 'prisma.workTimeConfig / prisma.timeSlotDefinition',
        description:
          'K26-F 引入的 WorkTime 配置含 createdAt / updatedAt / version 字段。' +
          'version 在 update 时递增, 可推断"修改过"。' +
          '但同样不记录 operator / 具体修改项 / reason。',
      },
      {
        key: 'audit-scripts',
        label: 'scripts/audit-* 审计型脚本',
        status: 'available' as const,
        modelOrTable: 'scripts/audit-*.ts',
        recordCount: countAuditScripts(),
        description:
          '本地审计型脚本 (audit-source-evidence-traceability-k20-fix-a / ' +
          'audit-room-capacity-data / audit-rbac-permission-granularity-migration 等)。' +
          '人工执行, 输出审计报告。无统一触发, 不记录被审计操作的历史。',
      },
      {
        key: 'k26-docs',
        label: 'docs/k26-*.md 阶段验收文档',
        status: 'available' as const,
        modelOrTable: 'docs/k26-*.md',
        recordCount: countK26Docs(),
        description:
          'K26 阶段验收 markdown 文档, 记录每阶段的实施摘要、API/UI 路径、' +
          '验证结果、下阶段建议。属于"项目维基"型审计证据, 不提供结构化检索。',
      },
      {
        key: 'unified-audit-log',
        label: '统一 AuditLog 表',
        status: 'planned' as const,
        modelOrTable: '(未实现)',
        recordCount: 0,
        description:
          '当前系统无统一 AuditLog schema / table。本阶段不引入。' +
          '统一审计日志 (含 actor / ip / userAgent / before-after diff / 保留策略 / 清理机制) ' +
          '在后续 K26-Q2+ 阶段规划。',
      },
    ]

    // ── 3. Operation coverage ──
    const operationCoverage: Array<{
      key: string
      label: string
      status: OperationCoverageStatus
      source: string
      description: string
    }> = [
      {
        key: 'semester-create',
        label: '新增学期',
        status: 'partial' as const,
        source: 'Semester.createdAt (无 operator)',
        description: 'Semester 表 createdAt 记录创建时点, 但不记录 operator / IP / userAgent。',
      },
      {
        key: 'semester-update',
        label: '编辑学期',
        status: 'partial' as const,
        source: 'Semester.updatedAt (无 operator)',
        description: 'Semester 表 updatedAt 记录最后更新时间, 但不区分修改字段, 不记录 operator。',
      },
      {
        key: 'semester-delete',
        label: '删除学期',
        status: 'partial' as const,
        source: 'Semester 行消失 (无显式审计)',
        description: 'Semester 物理删除, 仅由 semester-delete API 处理。无独立审计表, 依赖外部备份。',
      },
      {
        key: 'set-active-semester',
        label: '设置当前学期',
        status: 'partial' as const,
        source: 'Semester.isActive 字段 (无 operator)',
        description: 'isActive 切换在 Semester 表中可见, 但无 operator 记录, 也无历史切换日志。',
      },
      {
        key: 'import-data',
        label: '导入数据 (parse + 创建 ImportBatch)',
        status: 'covered' as const,
        source: 'ImportBatch (filename, status, createdAt, operatorId via session)',
        description:
          'ImportBatch 完整记录每次导入: filename, status, recordCount, createdAt, confirmedAt, rolledBackAt。' +
          '可通过 semesterId 关联到学期。',
      },
      {
        key: 'confirm-import',
        label: '确认导入批次',
        status: 'covered' as const,
        source: 'ImportBatch.confirmedAt + status=confirmed',
        description: 'confirm API 写入 confirmedAt 时间戳, status 转为 confirmed, 形成确认记录。',
      },
      {
        key: 'rollback-import',
        label: '回滚导入批次',
        status: 'covered' as const,
        source: 'ImportBatch.rolledBackAt + status=rolled_back',
        description: 'rolledBackAt 字段记录回滚时间点。',
      },
      {
        key: 'submit-adjustment',
        label: '提交调课',
        status: 'covered' as const,
        source: 'ScheduleAdjustment (type, week, status, reason, createdAt)',
        description: 'ScheduleAdjustment 记录每次调课: type, week, originalSlotId, newDayOfWeek, newSlotIndex, newRoomId, reason, status。',
      },
      {
        key: 'apply-adjustment',
        label: 'apply 调课',
        status: 'covered' as const,
        source: 'ScheduleAdjustment.status (ACTIVE) + 相关 ScheduleSlot 更新',
        description: 'Apply 操作通过 status=ACTIVE 标识。ScheduleSlot 的实际更新可由 ScheduleChangeLog 追溯。',
      },
      {
        key: 'rollback-adjustment',
        label: 'rollback 调课',
        status: 'partial' as const,
        source: 'ScheduleAdjustment.status=VOID (无 apply 时间戳 / 原始值快照)',
        description: 'Rollback 只能看到 status=VOID, 没有 operatorId / appliedAt / rolledBackAt 字段。',
      },
      {
        key: 'run-scheduler',
        label: '运行自动排课',
        status: 'covered' as const,
        source: 'SchedulingRun (mode, status, operatorId, operatorNameSnapshot, startedAt, completedAt)',
        description: 'SchedulingRun 完整记录排课运行: mode, status, operatorId, operatorNameSnapshot, startedAt, completedAt, appliedAt, rolledBackAt, errorMessage。',
      },
      {
        key: 'rollback-scheduler',
        label: 'rollback 排课',
        status: 'covered' as const,
        source: 'SchedulingRun.rolledBackAt + status=ROLLED_BACK + rollbackOfRunId',
        description: 'rolledBackAt + status + rollbackOfRunId 共同记录回滚关系。',
      },
      {
        key: 'modify-system-settings',
        label: '修改系统设置 (WorkTime / ScheduleConfig 等)',
        status: 'partial' as const,
        source: 'WorkTimeConfig.version / updatedAt (无 operator)',
        description:
          'WorkTimeConfig 在 update 时 version 递增 + updatedAt 更新。' +
          'SchedulingConfig 同理含 updatedAt。但均不记录 operator / 修改字段。',
      },
      {
        key: 'user-permission-ops',
        label: '用户 / 权限相关操作',
        status: 'partial' as const,
        source: 'UserRole.createdAt (无 updatedAt / operator)',
        description:
          'UserRole / RolePermission 仅有 createdAt。无 updatedAt / 解绑记录 / operator。' +
          '当前解绑/重绑都通过删除旧行 + 创建新行实现, 不留额外审计痕迹。',
      },
      {
        key: 'create-user',
        label: '创建用户',
        status: 'partial' as const,
        source: 'User.createdAt (无 operator)',
        description: 'User 表 createdAt 记录创建时点, 但不记录 operator (谁创建了此用户)。',
      },
    ]

    // ── 4. Recent activity samples (mixed sources, read-only) ──
    // Pull a small number of rows from each source so the panel can show
    // a real "recent" snapshot. We only use the small subset below.
    const [
      recentRuns,
      recentChanges,
      recentAdjustments,
      recentBatches,
      recentSemesters,
    ] = await Promise.all([
      prisma.schedulingRun.findMany({
        orderBy: { id: 'desc' },
        take: 5,
        select: {
          id: true,
          mode: true,
          status: true,
          operatorNameSnapshot: true,
          startedAt: true,
          completedAt: true,
          appliedAt: true,
          rolledBackAt: true,
          changedSlotCount: true,
          errorMessage: true,
        },
      }),
      prisma.schedulerRunChange.findMany({
        orderBy: { id: 'desc' },
        take: 5,
        select: {
          id: true,
          createdAt: true,
          oldDayOfWeek: true,
          oldSlotIndex: true,
          oldRoomId: true,
          newDayOfWeek: true,
          newSlotIndex: true,
          newRoomId: true,
          courseNameSnapshot: true,
          teacherNameSnapshot: true,
        },
      }),
      prisma.scheduleAdjustment.findMany({
        orderBy: { id: 'desc' },
        take: 5,
        select: {
          id: true,
          type: true,
          week: true,
          status: true,
          reason: true,
          createdAt: true,
          newDayOfWeek: true,
          newSlotIndex: true,
        },
      }),
      prisma.importBatch.findMany({
        orderBy: { id: 'desc' },
        take: 5,
        select: {
          id: true,
          filename: true,
          status: true,
          createdAt: true,
          confirmedAt: true,
          rolledBackAt: true,
          recordCount: true,
          createdTaskCount: true,
          createdSlotCount: true,
          errorMessage: true,
        },
      }),
      prisma.semester.findMany({
        orderBy: { id: 'desc' },
        take: 5,
        select: {
          id: true,
          name: true,
          code: true,
          isActive: true,
          createdAt: true,
          updatedAt: true,
        },
      }),
    ])

    const recentActivity: Array<{
      id: string | number
      type: string
      label: string
      createdAt: string | null
      actor: string | null
      source: string
      detail: string
    }> = []

    for (const r of recentRuns) {
      recentActivity.push({
        id: `run-${r.id}`,
        type: 'SchedulingRun',
        label: `排课运行 #${r.id} (${r.mode})`,
        createdAt: (r.startedAt ?? r.completedAt ?? r.appliedAt ?? r.rolledBackAt ?? null)?.toISOString() ?? null,
        actor: r.operatorNameSnapshot ?? null,
        source: 'SchedulingRun',
        detail:
          `mode=${r.mode} status=${r.status} ` +
          (r.changedSlotCount != null ? `changedSlot=${r.changedSlotCount} ` : '') +
          (r.errorMessage ? `error=${r.errorMessage}` : ''),
      })
    }
    for (const c of recentChanges) {
      recentActivity.push({
        id: `change-${c.id}`,
        type: 'SchedulerRunChange',
        label: `排课单条变更 #${c.id}`,
        createdAt: c.createdAt.toISOString(),
        actor: null,
        source: 'SchedulerRunChange',
        detail:
          `${c.courseNameSnapshot ?? '?'} 教师=${c.teacherNameSnapshot ?? '?'} ` +
          `${c.oldDayOfWeek}节${c.oldSlotIndex} -> ${c.newDayOfWeek}节${c.newSlotIndex}`,
      })
    }
    for (const a of recentAdjustments) {
      recentActivity.push({
        id: `adj-${a.id}`,
        type: 'ScheduleAdjustment',
        label: `调课 #${a.id} (${a.type})`,
        createdAt: a.createdAt.toISOString(),
        actor: null,
        source: 'ScheduleAdjustment',
        detail:
          `week=${a.week} status=${a.status} ` +
          (a.newDayOfWeek != null && a.newSlotIndex != null ? `-> ${a.newDayOfWeek}节${a.newSlotIndex} ` : '') +
          (a.reason ? `原因=${a.reason}` : ''),
      })
    }
    for (const b of recentBatches) {
      recentActivity.push({
        id: `batch-${b.id}`,
        type: 'ImportBatch',
        label: `导入批次 #${b.id} (${b.filename})`,
        createdAt: b.createdAt.toISOString(),
        actor: null,
        source: 'ImportBatch',
        detail:
          `status=${b.status} ` +
          (b.recordCount != null ? `record=${b.recordCount} ` : '') +
          (b.createdTaskCount != null ? `task=${b.createdTaskCount} ` : '') +
          (b.createdSlotCount != null ? `slot=${b.createdSlotCount} ` : '') +
          (b.errorMessage ? `error=${b.errorMessage}` : ''),
      })
    }
    for (const s of recentSemesters) {
      recentActivity.push({
        id: `sem-${s.id}`,
        type: 'Semester',
        label: `学期 #${s.id} ${s.name}`,
        createdAt: s.createdAt.toISOString(),
        actor: null,
        source: 'Semester',
        detail:
          `code=${s.code} ` +
          (s.isActive ? '[active]' : '[inactive]') +
          ` updatedAt=${s.updatedAt.toISOString()}`,
      })
    }

    // Sort by createdAt desc, then trim to a reasonable recent window
    recentActivity.sort((a, b) => {
      const ta = a.createdAt ? Date.parse(a.createdAt) : 0
      const tb = b.createdAt ? Date.parse(b.createdAt) : 0
      return tb - ta
    })
    const trimmedRecent = recentActivity.slice(0, 15)

    // ── 5. Summary ──
    const summary = {
      unifiedAuditLogSchemaExists: false, // HARD-CODED: 当前无统一 AuditLog 表
      auditSourcesCount: sources.length,
      coveredOperationCount: operationCoverage.filter((o) => o.status === 'covered').length,
      partialOperationCount: operationCoverage.filter((o) => o.status === 'partial').length,
      plannedOperationCount: operationCoverage.filter((o) => o.status === 'planned').length,
      notCoveredOperationCount: operationCoverage.filter((o) => o.status === 'not-covered').length,
      recentActivityCount: trimmedRecent.length,
      readOnly: true as const,
    }

    // ── 6. Limitations — explicit list of what's NOT covered yet ──
    const limitations = [
      {
        key: 'unified-audit-log-table',
        label: '统一 AuditLog 表',
        description: '当前无统一 AuditLog 模型。审计依赖各业务表的局部字段 (createdAt / updatedAt / status / operatorNameSnapshot), 未做归一。',
      },
      {
        key: 'no-actor-record',
        label: '缺统一 actor 字段',
        description: '大部分审计源不记录 operatorId / operatorName / ip / userAgent。' +
          '仅 SchedulingRun 含 operatorId / operatorNameSnapshot。',
      },
      {
        key: 'no-before-after-diff',
        label: '缺 before/after diff',
        description: '大部分表只记录"新值", 不保存"旧值快照"。' +
          'ScheduleChangeLog / SchedulerRunChange 是例外, 含 oldDayOfWeek / newDayOfWeek。',
      },
      {
        key: 'no-export',
        label: '缺统一审计日志导出',
        description: '本 API 不提供导出功能。无 CSV / Excel 审计报表端点。',
      },
      {
        key: 'no-cleanup-policy',
        label: '缺审计保留 / 清理策略',
        description: '无 retention period, 无 prune job。当前依赖业务表的常规 cleanup。',
      },
      {
        key: 'no-realtime-trail',
        label: '缺实时审计 trail',
        description: '本 API 不提供 WebSocket / SSE 实时审计流。仅按需轮询 / 刷新。',
      },
    ]

    return NextResponse.json({
      success: true,
      source: 'prisma read-only counts + filesystem scan + constants',
      summary,
      sources,
      operationCoverage,
      recentActivity: trimmedRecent,
      limitations,
      readOnly: true,
      // Explicit read-only invariants
      safetyRules: [
        '本模块不提供删除审计日志入口',
        '本模块不提供清理审计日志入口',
        '本模块不提供导出审计日志入口',
        '本模块不提供修改审计日志入口',
        '本模块不写入任何 AuditLog 表 (当前无该表)',
        'API 仅暴露 GET handler, 无 PUT/POST/DELETE/PATCH',
        '权限沿用 settings:manage, 不新增 RBAC',
      ],
    })
  } catch (e) {
    console.error('[audit-logs] failed:', e)
    return NextResponse.json(
      { success: false, error: 'INTERNAL', message: e instanceof Error ? e.message : '查询失败' },
      { status: 500 },
    )
  }
}
