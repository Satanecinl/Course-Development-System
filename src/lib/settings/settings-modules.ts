/**
 * K26-A: System settings module registry.
 *
 * Defines the 9 settings modules and their current status.
 * Only semester-settings is implemented; others are roadmap placeholders.
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
    description: '管理节次名称、起止时间、启用状态、午休、晚课和周末排课规则。当前仅管理配置本身，尚未接入调课推荐、自动排课 solver、score。',
    status: 'ready',
    priority: 'P2',
    recommendedStage: 'K26-H-COMPLETED',
    riskLevel: 'high',
    notes: 'K26-F schema + K26-G API + K26-H UI 已完成。影响面广，solver/score/recommendation 接入需 K26-I/K26-J。',
  },
  {
    key: 'campus-room-rules',
    title: '校区 / 教室规则设置',
    description: '管理林校教室、汽车专业规则、教室容量、教室类型、实训室/机房/普通教室和校区通勤规则。该模块可能需要 schema 支撑。',
    status: 'coming-soon',
    priority: 'P2',
    recommendedStage: 'K26-D-CAMPUS-ROOM-RULES-SCHEMA-PLAN',
    riskLevel: 'high',
    notes: '可能需要新增 schema 字段或 model。',
  },
  {
    key: 'adjustment-rules',
    title: '调课规则设置',
    description: '管理跨周调课、周末调课、推荐方案数量、推荐排序偏好、默认隐藏高级工具和是否允许无教室调课。',
    status: 'planned',
    priority: 'P1',
    recommendedStage: 'K26-E-ADJUSTMENT-RULES-SETTINGS-AUDIT',
    riskLevel: 'medium',
    notes: '调课推荐已有 room-recommendations 和 plan-recommendations，接入设置中心。',
  },
  {
    key: 'import-rules',
    title: '导入规则设置',
    description: '管理默认导入学期、跨年级合班审批、source evidence 保留策略、导入覆盖策略和重复导入策略。',
    status: 'planned',
    priority: 'P1',
    recommendedStage: 'K26-F-IMPORT-RULES-SETTINGS-AUDIT',
    riskLevel: 'medium',
    notes: '导入管线已有 quality-classifier 和 importer，接入设置中心。',
  },
  {
    key: 'rbac-settings',
    title: '权限与角色设置',
    description: '管理角色、权限和用户角色绑定。semester-scoped RBAC 暂不实现。',
    status: 'roadmap',
    priority: 'P3',
    recommendedStage: 'K26-G-RBAC-SETTINGS-ROADMAP',
    riskLevel: 'high',
    notes: '当前 RBAC 已有 admin/users 页面，设置中心集成为后续规划。',
  },
  {
    key: 'data-maintenance',
    title: '数据维护与备份',
    description: '管理数据库备份、导出数据、清理空学期、清理历史临时导入、异常数据检查、孤儿记录修复和 migration 状态查看。',
    status: 'roadmap',
    priority: 'P3',
    recommendedStage: 'K26-H-DATA-MAINTENANCE-SETTINGS-ROADMAP',
    riskLevel: 'high',
    notes: '需要单独设计备份和清理策略。',
  },
  {
    key: 'audit-log',
    title: '审计日志',
    description: '记录学期变更、导入、调课、排课运行等关键操作。需要单独设计审计事件模型。',
    status: 'roadmap',
    priority: 'P3',
    recommendedStage: 'K26-I-AUDIT-LOG-SETTINGS-ROADMAP',
    riskLevel: 'high',
    notes: '需要新增审计事件 model 和记录机制。',
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
