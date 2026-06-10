/**
 * K26-P1: Data Maintenance & Backup settings — read-only API.
 *
 * GET /api/admin/settings/data-maintenance
 *
 * Returns a read-only snapshot of the current data maintenance, backup,
 * export, cleanup, and migration capabilities of the system. Source of
 * truth is the filesystem (prisma/migrations, scripts/, .gitignore,
 * package.json) plus constants describing current coverage.
 *
 * Read-only. No writes. No destructive operation endpoint. No migrate
 * commands executed. Permission: `settings:manage` (reused).
 *
 * IMPORTANT: This endpoint intentionally exposes ZERO write capability.
 * Destructive operations (backup, restore, cleanup, fix, migrate reset)
 * are forbidden in the UI/API and are only described in the response
 * as safety-rule guidance.
 */

import { NextResponse, type NextRequest } from 'next/server'
import { readdirSync, existsSync, readFileSync, statSync } from 'fs'
import { join } from 'path'
import { requirePermission } from '@/lib/auth/require-permission'

// ─── Filesystem sources (read-only) ─────────────────────────────────────

const PROJECT_ROOT = join(process.cwd())
const PRISMA_DIR = join(PROJECT_ROOT, 'prisma')
const MIGRATIONS_DIR = join(PRISMA_DIR, 'migrations')
const GITIGNORE_PATH = join(PROJECT_ROOT, '.gitignore')
const SCHEMA_PATH = join(PRISMA_DIR, 'schema.prisma')

function safeReadDir(path: string): string[] {
  try {
    return existsSync(path) ? readdirSync(path) : []
  } catch {
    return []
  }
}

function safeReadText(path: string): string {
  try {
    return existsSync(path) ? readFileSync(path, 'utf-8') : ''
  } catch {
    return ''
  }
}

function countMigrations(): number {
  // Each migration is a directory under prisma/migrations/ containing
  // a migration.sql. migration_lock.toml is a sibling file, not a migration.
  if (!existsSync(MIGRATIONS_DIR)) return 0
  let count = 0
  for (const entry of safeReadDir(MIGRATIONS_DIR)) {
    const full = join(MIGRATIONS_DIR, entry)
    try {
      if (statSync(full).isDirectory()) count++
    } catch {
      // ignore stat errors
    }
  }
  return count
}

function gitignoreExcludesDevDb(): boolean {
  if (!existsSync(GITIGNORE_PATH)) return false
  const text = safeReadText(GITIGNORE_PATH)
  // Match common dev.db patterns
  return /(^|\n)\s*prisma\/dev\.db(\s|$)/.test(text) ||
    /(^|\n)\s*\*\.db(\s|$)/.test(text)
}

function gitignoreExcludesBackups(): boolean {
  if (!existsSync(GITIGNORE_PATH)) return false
  const text = safeReadText(GITIGNORE_PATH)
  return /prisma\/dev\.db\.backup-/.test(text) || /prisma\/dev\.db-journal/.test(text)
}

function schemaHasDatasourceSqlite(): boolean {
  if (!existsSync(SCHEMA_PATH)) return false
  return /datasource\s+db\s*\{[\s\S]*?provider\s*=\s*"sqlite"/i.test(safeReadText(SCHEMA_PATH))
}

// ─── Composed response ─────────────────────────────────────────────────

export async function GET(request: NextRequest) {
  const auth = await requirePermission('settings:manage', request)
  if ('error' in auth) return auth.error

  const migrationFileCount = countMigrations()
  const devDbIgnored = gitignoreExcludesDevDb()
  const backupIgnored = gitignoreExcludesBackups()
  const schemaIsSqlite = schemaHasDatasourceSqlite()

  // Database section
  const databaseSection = {
    key: 'database-status',
    label: '数据库状态',
    status: schemaIsSqlite ? ('available' as const) : ('unknown' as const),
    risk: 'low' as const,
    editable: false,
    description: schemaIsSqlite
      ? '当前使用 SQLite 数据库。开发环境数据库文件位于 prisma/dev.db。生产环境推荐切换到 PostgreSQL，schema 已就绪。'
      : '未能识别当前数据库 provider。请检查 prisma/schema.prisma。',
    facts: [
      `数据库类型: ${schemaIsSqlite ? 'SQLite' : '未识别'}`,
      `数据库文件: prisma/dev.db (开发环境)`,
      `是否被 .gitignore 排除: ${devDbIgnored ? '是 (推荐)' : '否 (警告)'}`,
      `备份文件是否被 .gitignore 排除: ${backupIgnored ? '是' : '否'}`,
    ],
    commands: schemaIsSqlite
      ? [
          '查看 migration 状态: npx prisma migrate status',
          '查看 schema 同步状态: npx prisma validate',
          '查看数据库 schema 是否最新: npx prisma migrate status (与 npx prisma generate 配合)',
        ]
      : [],
  }

  // Backup & restore section
  const backupSection = {
    key: 'backup-and-restore',
    label: '备份与恢复',
    status: 'manual' as const,
    risk: 'high' as const,
    editable: false,
    description:
      '当前未提供一键备份 / 一键恢复 API。备份方式：手动复制 prisma/dev.db 至安全位置。' +
      '恢复前必须停服、确认环境、保留原始备份。命名规范建议: prisma/dev.db.backup-YYYYMMDD-HHmmss。',
    facts: [
      '一键备份按钮: 不提供',
      '一键恢复按钮: 不提供',
      '建议备份命名: prisma/dev.db.backup-YYYYMMDD-HHmmss',
      '恢复前置条件: 停服 + 确认环境 + 保留原 backup',
    ],
    commands: [
      '手动备份: cp prisma/dev.db prisma/dev.db.backup-$(date +%Y%m%d-%H%M%S)',
      '手动恢复: cp prisma/dev.db.backup-YYYYMMDD-HHmmss prisma/dev.db (必须先停服)',
    ],
  }

  // Data export section
  const exportSection = {
    key: 'data-export',
    label: '数据导出',
    status: 'available' as const,
    risk: 'low' as const,
    editable: false,
    description:
      '当前已有课表 Excel 导出 API (GET /api/export/excel)，权限 data:export。' +
      '数据摘要 API (GET /api/data/summary)，权限 data:read。' +
      '脚本侧有 export:data-template (scripts/export-data-template.ts)。' +
      '不提供"一键导出全库"统一入口。',
    facts: [
      '课表 Excel 导出: GET /api/export/excel (data:export)',
      '数据摘要: GET /api/data/summary (data:read)',
      '脚本: export:data-template (scripts/export-data-template.ts)',
      '一键导出全库入口: 待统一入口 / 不提供',
    ],
    commands: [
      'npm run export:data-template  # 导出数据模板',
      'GET /api/export/excel?viewType=class&targetId=...',
    ],
  }

  // Cleanup section
  const cleanupSection = {
    key: 'cleanup-capability',
    label: '清理能力',
    status: 'manual' as const,
    risk: 'high' as const,
    editable: false,
    description:
      '当前清理能力：审计型脚本 (audit-cleanup-candidates.ts / cleanup-teaching-task-class-pollution.ts / ' +
      'audit-data-quality-classgroup-matching-k17-fix-a.ts 等)。' +
      '不提供一键清理按钮。学期删除已接入 /admin/settings → 学期设置，并带依赖保护。' +
      'ImportBatch 的 abandon 流程已通过 /api/admin/import/parse + 不 confirm 方式过期。' +
      '所有破坏性操作需人工确认 + 备份 + dry-run。',
    facts: [
      '学期删除: /admin/settings → 学期设置 (带依赖保护)',
      '历史临时导入清理: 不开放 UI (使用 scripts/cleanup-* 脚本需人工执行)',
      '孤儿记录检查: scripts/audit-* 审计型脚本 (无 UI)',
      '一键清理按钮: 不提供',
    ],
    commands: [
      '学期删除: /admin/settings → 学期设置 → 删除 (依赖保护)',
      '审计孤儿记录: npx tsx scripts/audit-cleanup-candidates.ts (只读)',
    ],
  }

  // Anomaly data checks section
  const anomalySection = {
    key: 'anomaly-data-checks',
    label: '异常数据检查',
    status: 'available' as const,
    risk: 'low' as const,
    editable: false,
    description:
      '已具备的异常数据检查：HC5/HC6 容量违规 (K21 系列)、cross-cohort 检测 (K17-K19)、' +
      'source evidence 完整性 (K20)、auth foundation 已知 pre-existing (ScheduleAdjustment ACTIVE=0)、' +
      'K22-C score regression harness。' +
      '不提供"一键修复"入口。',
    facts: [
      'HC5/HC6 检查: 已具备 (K21 fix-a / K26-K4 系列)',
      'cross-cohort 检测: 已具备 (K17-K19 系列)',
      'source evidence 检查: 已具备 (K20 fix-a / fix-b)',
      'auth foundation: 53 passed / 1 pre-existing (ScheduleAdjustment ACTIVE=0)',
      'K22-C score harness: 73/0/0/0',
    ],
    commands: [
      'npm run test:auth-foundation',
      'npx tsx scripts/verify-score-regression-harness-k22-c.ts',
      'npx tsx scripts/audit-rbac-permission-granularity-migration.ts',
    ],
  }

  // Migration status section
  const migrationSection = {
    key: 'migration-status',
    label: 'Migration 状态',
    status: 'available' as const,
    risk: 'medium' as const,
    editable: false,
    description:
      '本面板仅从文件系统读取 prisma/migrations/ 目录下的 migration 目录数量。' +
      '实际数据库 schema 同步状态需运行 npx prisma migrate status。' +
      '不通过本 API 执行任何 migrate 命令。' +
      '迁移历史不可删除，rollback 需新建迁移。',
    facts: [
      `migration 目录数量 (filesystem): ${migrationFileCount}`,
      '实际数据库状态: 需运行 npx prisma migrate status',
      'migrate reset: 禁止 (UI 不提供入口)',
      'db push --force-reset: 禁止 (UI 不提供入口)',
    ],
    commands: [
      'npx prisma migrate status',
      'npx prisma validate',
      'npx prisma migrate deploy (生产环境应用 pending migration)',
    ],
  }

  // ─── Sections list ──────────────────────────────────────────────────
  const sections = [
    databaseSection,
    backupSection,
    exportSection,
    cleanupSection,
    anomalySection,
    migrationSection,
  ]

  // ─── Safeguards (read-only safety guarantees) ──────────────────────
  const safeguards = [
    {
      key: 'destructiveActionsEnabled',
      label: 'destructiveActionsEnabled',
      enabled: false,
      severity: 'hard' as const,
      description:
        '本模块所有破坏性操作 (backup/restore/cleanup/fix/migrate-reset/db-push-force-reset) 始终为 disabled。' +
        'API 端不提供任何写入或破坏性端点。',
    },
    {
      key: 'dev-db-not-in-git',
      label: 'dev.db 不入 git',
      enabled: devDbIgnored,
      severity: devDbIgnored ? ('info' as const) : ('hard' as const),
      description: devDbIgnored
        ? '.gitignore 已排除 prisma/dev.db (符合预期)。'
        : '.gitignore 未排除 prisma/dev.db。强烈建议将 prisma/dev.db 加入 .gitignore (当前已存在条目，请检查)。',
    },
    {
      key: 'backup-not-in-git',
      label: 'DB backup 不入 git',
      enabled: backupIgnored,
      severity: backupIgnored ? ('info' as const) : ('warning' as const),
      description: backupIgnored
        ? '.gitignore 已排除 prisma/dev.db.backup-* (符合预期)。'
        : '.gitignore 未排除 prisma/dev.db.backup-*。建议添加。',
    },
    {
      key: 'no-write-endpoint',
      label: 'API 无写入端点',
      enabled: true,
      severity: 'hard' as const,
      description:
        '本 API 路由只导出 GET handler。绝无 PUT/POST/DELETE/PATCH handler，不接受任何写入操作。',
    },
    {
      key: 'no-migrate-reset-endpoint',
      label: '禁止 migrate reset 入口',
      enabled: true,
      severity: 'hard' as const,
      description:
        'UI 不暴露任何 migrate reset / db push --force-reset / drop table / 删库 入口。' +
        '任何破坏性操作必须人工 + 备份 + dry-run + review。',
    },
    {
      key: 'permission-isolation',
      label: '权限隔离 (settings:manage)',
      enabled: true,
      severity: 'info' as const,
      description:
        '本 API 沿用 settings:manage 权限 (与其他系统设置 API 一致)，不引入 data:write，避免误用。',
    },
  ]

  // ─── Known checks (read-only catalogue of existing audit / verify) ─
  const knownChecks = [
    {
      key: 'k22-c-score-harness',
      label: 'K22-C score regression harness',
      command: 'npx tsx scripts/verify-score-regression-harness-k22-c.ts',
      lastKnownStatus: '73 passed / 0 unexpected failed / 0 known failed / 0 info',
      description: 'HC1-HC5 hard invariant + SC1-SC10 软约束 + default snapshot + fixed-seed solver smoke。',
    },
    {
      key: 'auth-foundation',
      label: 'Auth foundation',
      command: 'npm run test:auth-foundation',
      lastKnownStatus: '53 passed / 1 pre-existing failed (ScheduleAdjustment ACTIVE=0)',
      description:
        '53 个 auth 集成测试 + 1 个 pre-existing 失败 (ScheduleAdjustment ACTIVE 实际 10, 期望 0)。' +
        '此失败为已知遗留，不在本阶段处理。',
    },
    {
      key: 'lint-baseline',
      label: 'Lint baseline',
      command: 'npm run lint',
      lastKnownStatus: '184 errors + 146 warnings = 330 problems',
      description: '历史 lint baseline。每次新 stage 不得新增 lint 问题。',
    },
    {
      key: 'hc5-hc6-room-check',
      label: 'HC5/HC6 教室规则检查',
      command: 'npx tsx scripts/audit-room-capacity-data.ts (K21 fix-a 系列)',
      lastKnownStatus: '见 docs/k22-* 报告',
      description: '教室容量与 Linxiao 教室规则 (HC5/HC6) 检查。',
    },
    {
      key: 'cross-cohort-detection',
      label: '跨年级合班检测',
      command: 'scripts/audit-import-cross-cohort-persistent-flag-k19-fix-b.ts',
      lastKnownStatus: '已通过 K17-K19 阶段',
      description: '跨年级合班检测和 source evidence 持久化字段审计。',
    },
    {
      key: 'source-evidence',
      label: 'Source evidence 完整性',
      command: 'scripts/audit-source-evidence-traceability-k20-fix-a.ts',
      lastKnownStatus: '已通过 K20 阶段',
      description: 'TeachingTaskClass.sourceKeyword / sourceClassName / matchStrategy 字段填充率。',
    },
    {
      key: 'rbac-permission-matrix',
      label: 'RBAC permission matrix 审计',
      command: 'scripts/audit-rbac-permission-granularity-migration.ts',
      lastKnownStatus: '已通过',
      description: 'RBAC role-permission 矩阵与 ALL_PERMISSIONS 一致性。',
    },
  ]

  // ─── Summary ──────────────────────────────────────────────────────
  const summary = {
    databaseType: schemaIsSqlite ? 'SQLite' : '未识别',
    databaseFile: 'prisma/dev.db',
    migrationFileCount,
    knownBackupFilesCount: 0, // intentionally 0 — UI 不枚举 backup 文件 (避免敏感)
    knownDataCheckCount: knownChecks.length,
    destructiveActionsEnabled: false, // HARDCODED — 模块硬约束
    dbTrackedByGit: devDbIgnored ? null : false, // null 表示"应被排除且已排除"
    backupTrackedByGit: backupIgnored ? null : false,
    permission: 'settings:manage',
    readOnly: true,
  }

  return NextResponse.json({
    success: true,
    source: 'filesystem (prisma/migrations, scripts/, .gitignore) + constants',
    summary,
    sections,
    safeguards,
    knownChecks,
    // Safety rules — explicit text
    safetyRules: [
      '禁止执行 npx prisma migrate reset',
      '禁止执行 npx prisma db push --force-reset',
      '禁止提交 prisma/dev.db 至 git',
      '禁止提交 prisma/dev.db.backup-* 至 git',
      '禁止通过本模块 API 触发任何数据库写操作',
      '破坏性操作必须先 backup + dry-run + review',
      '所有 backup 命名使用 prisma/dev.db.backup-YYYYMMDD-HHmmss 规范',
      '所有 restore 操作必须先停服 + 确认环境 + 保留原 backup',
    ],
    destructiveActionsEnabled: false,
  })
}
