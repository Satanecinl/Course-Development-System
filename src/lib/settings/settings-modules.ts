/**
 * K26-A: System settings module registry.
 *
 * Defines the 9 settings modules and their current status.
 * Some modules are editable settings; others are intentionally read-only status views.
 */

export type ModuleStatus = 'ready' | 'planned' | 'coming-soon' | 'roadmap'

export interface SettingsModule {
  key: string
  title: string
  description: string
  status: ModuleStatus
  priority: string
  recommendedStage: string
  riskLevel: 'low' | 'medium' | 'high'
  notes?: string
}

export const SETTINGS_MODULES: SettingsModule[] = [
  {
    key: 'semester-settings',
    title: '学期设置',
    description: '管理学期新增、编辑、删除、设置当前学期、起止日期维护和依赖保护。',
    status: 'ready',
    priority: 'P0',
    recommendedStage: 'K25-CLOSED',
    riskLevel: 'low',
    notes: '已完成。K25 学期设置管理主线已 closeout。',
  },
  {
    key: 'scheduler-config',
    title: '排课参数设置',
    description: '管理自动排课默认迭代次数、LAHC window size、random seed、默认 SchedulingConfig。不包含 score 权重、节次作息和教室规则。',
    status: 'ready',
    priority: 'P1',
    recommendedStage: 'K26-B-COMPLETED',
    riskLevel: 'medium',
    notes: '复用 K21 已有 SchedulingConfig CRUD API，接入系统设置中心。',
  },
  {
    key: 'time-slot-worktime',
    title: '节次与作息设置',
    description: '管理节次名称、起止时间、启用状态、午休、晚课和周末排课规则。已接入调课推荐、自动排课 solver、score、apply 和 rollback 主流程。',
    status: 'ready',
    priority: 'P2',
    recommendedStage: 'K26-H-COMPLETED',
    riskLevel: 'high',
    notes: 'K26-F schema + K26-G API + K26-H UI 已完成；recommendation / adjustment / solver / score / apply / rollback 集成已在 K26-I/K26-J/K26-K 相关阶段完成。',
  },
  {
    key: 'campus-room-rules',
    title: '校区 / 教室规则设置',
    description: '管理林校教室标记、查看教室容量类型、HC5/HC6 违规检查结果、汽车专业分类和当前 hard rule 说明。基础可编辑版。',
    status: 'ready',
    priority: 'P2',
    recommendedStage: 'K37-B-EDITABLE',
    riskLevel: 'medium',
    notes: 'K37-B: 基础可编辑版。Room.isLinxiao 持久字段。HC6 hard rule 不可关闭。',
  },
  {
    key: 'adjustment-rules',
    title: '调课规则设置',
    description: '查看跨周调课、周末调课、推荐方案、WorkTime guard、dry-run/apply 规则、安全限制、规则分组和 hard-locked 状态。诊断增强版。',
    status: 'ready',
    priority: 'P1',
    recommendedStage: 'K38-A-DIAGNOSTIC',
    riskLevel: 'medium',
    notes: 'K38-A: 诊断增强版。规则按 WorkTime/推荐/dry-run/apply/hard-guard 分组。所有规则 hard-locked。K38-B 计划增加可配置项。',
  },
  {
    key: 'import-rules',
    title: '导入规则设置',
    description: '查看默认导入学期、跨年级合班 guard、source evidence 覆盖率、批次生命周期规则、回滚/废弃安全边界、数据安全策略和最近导入批次。诊断增强版。',
    status: 'ready',
    priority: 'P1',
    recommendedStage: 'K39-A-DIAGNOSTIC',
    riskLevel: 'medium',
    notes: 'K39-A: 诊断增强版。规则按学期/跨年级合班/source evidence/生命周期/回滚废弃/数据安全分组。所有规则 hard-locked。K39-B 计划增加默认导入行为配置。',
  },
  {
    key: 'rbac-settings',
    title: '权限与角色设置',
    description: '查看当前 RBAC 角色、权限、角色-权限矩阵、用户-角色绑定概览和关键权限状态。基础只读版。',
    status: 'ready',
    priority: 'P3',
    recommendedStage: 'K26-O1-BASIC',
    riskLevel: 'high',
    notes: '只读基础版。展示当前 RBAC 配置，不提供编辑。schema 未变，沿用 settings:manage 权限。',
  },
  {
    key: 'data-maintenance',
    title: '数据维护与备份',
    description: '查看数据库状态、备份与恢复说明、数据导出能力、清理能力、异常数据检查、migration 状态和安全操作规则。基础只读版。',
    status: 'ready',
    priority: 'P3',
    recommendedStage: 'K26-P1-BASIC',
    riskLevel: 'high',
    notes: '只读基础版。destructiveActionsEnabled=false，无任何破坏性写 API。',
  },
  {
    key: 'audit-log',
    title: '审计日志',
    description: '查看现有局部审计来源 (SchedulingRun / SchedulerRunChange / ScheduleAdjustment / ImportBatch / ScheduleChangeLog / Semester / UserRole / 审计脚本 / K26 文档)、关键操作覆盖状态、最近活动摘要和统一审计日志待办。基础只读版。',
    status: 'ready',
    priority: 'P3',
    recommendedStage: 'K26-Q1-BASIC',
    riskLevel: 'high',
    notes: '只读基础版。统一 AuditLog schema 未实现 (unifiedAuditLogSchemaExists=false)。不提供删除/清理/导出/保存入口。',
  },
]

/**
 * Get the status badge label for display.
 */
export function getStatusBadge(status: ModuleStatus): { label: string; color: string } {
  switch (status) {
    case 'ready':
      return { label: '已完成', color: 'bg-green-100 text-green-700 border-green-200' }
    case 'planned':
      return { label: '规划中', color: 'bg-blue-100 text-blue-700 border-blue-200' }
    case 'coming-soon':
      return { label: '后续实现', color: 'bg-amber-100 text-amber-700 border-amber-200' }
    case 'roadmap':
      return { label: '后置', color: 'bg-gray-100 text-gray-500 border-gray-200' }
  }
}
