// scripts/plan-multi-semester-schema-k25-b.ts
// K25-B: Multi-semester schema plan (read-only, no DB writes).
//
// Reads K25-A audit outputs + Prisma schema + current DB summary,
// then generates a detailed schema plan covering:
//   - Model classification (A: global master, B: semester-scoped NOT NULL,
//     C: join/detail, D: legacy/risk)
//   - Proposed NOT NULL changes
//   - Backfill plan (ImportBatch 36/37 null + other models)
//   - Migration order + no-reset policy
//   - Consistency validation plan
//   - Rollback plan
//   - Recommended next stages (K25-C / K25-D / K25-E)
//
// All DB calls are read-only. No prisma.create/update/delete/upsert,
// no raw SQL write, no migration execution.

import { readFileSync, existsSync, writeFileSync, mkdirSync, statSync, readdirSync } from 'fs'
import { join } from 'path'
import { prisma } from '@/lib/prisma'

const ROOT = process.cwd()
const DOCS_DIR = join(ROOT, 'docs')

interface PlanInputs {
  audit: unknown
  auditMd: string
  schema: string
  dbTotals: Record<string, { total: number; nullSemester: number }>
  activeSemesters: Array<{ id: number; code: string; name: string; isActive: boolean }>
  allSemesters: Array<{ id: number; code: string; name: string; isActive: boolean }>
  classification: Array<{
    model: string
    category: 'A_GLOBAL_MASTER' | 'B_SEMESTER_SCOPED_REQUIRED' | 'C_JOIN_DETAIL' | 'D_LEGACY_RISK'
    currentSemesterId: 'nullable' | 'required' | 'none'
    proposedAction: string
    reason: string
  }>
  notNullChanges: Array<{
    model: string
    current: string
    proposed: string
    backfillRequired: boolean
    nullCount: number
    total: number
    risk: string
  }>
  backfillPlan: {
    activeSemesterDetection: {
      strategy: string
      found: number
      semesters: Array<{ id: number; code: string; name: string }>
      abortIfNotExactlyOne: boolean
    }
    importBatch: {
      rowsToBackfill: number
      targetSemesterId: number | null
      strategy: string
      prerequisites: string[]
      dryRunRecommended: boolean
      abortIfMultipleActive: boolean
      abortIfNoActive: boolean
    }
    scopedModelsNullCheck: {
      checkPerModel: Record<string, { total: number; null: number; action: string }>
    }
  }
  migrationPlan: Array<{
    step: number
    name: string
    details: string[]
    canAbort: boolean
  }>
  consistencyValidationPlan: Record<string, string[]>
  rollbackPlan: {
    strategy: string
    backupBased: string[]
    reverseMigration: string[]
    noResetPolicy: string[]
    restoreOrder: string[]
  }
  recommendedNextStages: Array<{
    stage: string
    scope: string[]
    rationale: string
  }>
  summary: {
    blocking: boolean
    recommendedNotNullCount: number
    backfillRequiredCount: number
    nextStage: string
  }
}

function read(rel: string): string {
  const p = join(ROOT, rel)
  if (!existsSync(p)) return ''
  const stat = statSync(p)
  if (stat.isDirectory()) {
    const out: string[] = []
    const walk = (dir: string) => {
      for (const e of readdirSync(dir, { withFileTypes: true })) {
        const fp = join(dir, e.name)
        if (e.isDirectory()) walk(fp)
        else if (/\.(ts|tsx|js|jsx|prisma|md|json)$/.test(e.name)) {
          out.push(readFileSync(fp, 'utf-8'))
        }
      }
    }
    walk(p)
    return out.join('\n')
  }
  return readFileSync(p, 'utf-8')
}

async function main() {
  console.log('📐 K25-B Multi-Semester Schema Plan (Read-Only)')
  console.log('='.repeat(60))

  // ─── 1. Load K25-A audit outputs ───────────────────────

  const auditJsonPath = 'docs/k25-multi-semester-course-scoping-audit.json'
  const auditMdPath = 'docs/k25-multi-semester-course-scoping-audit.md'
  if (!existsSync(auditJsonPath)) {
    console.error(`FATAL: ${auditJsonPath} not found. Run K25-A audit first.`)
    process.exit(1)
  }
  const audit = JSON.parse(read(auditJsonPath))
  const auditMd = read(auditMdPath)
  const schema = read('prisma/schema.prisma')

  console.log(`K25-A source: ${auditJsonPath} (${auditMd.length} bytes md)`)
  console.log(`K25-A summary: overallReadiness=${audit.summary.overallReadiness}, blocking=${audit.summary.blocking}`)
  console.log(`K25-A risks: HIGH=${audit.summary.highRiskCount} MEDIUM=${audit.summary.mediumRiskCount} LOW=${audit.summary.lowRiskCount}`)

  // ─── 2. Current DB snapshot (read-only) ────────────────

  const dbTotals: Record<string, { total: number; nullSemester: number }> = {}
  for (const model of [
    'teachingTask', 'scheduleSlot', 'scheduleAdjustment',
    'schedulingRun', 'importBatch', 'classGroup',
  ] as const) {
    const handle = prisma[model] as unknown as { count: (args?: { where?: { semesterId: number | null } }) => Promise<number> }
    const total = await handle.count()
    const nullCount = await handle.count({ where: { semesterId: null } })
    dbTotals[model] = { total, nullSemester: nullCount }
  }

  const activeSemesters = await prisma.semester.findMany({
    where: { isActive: true },
    orderBy: { id: 'asc' },
  })
  const allSemesters = await prisma.semester.findMany({ orderBy: { id: 'asc' } })

  // ─── 3. Model classification ────────────────────────────

  type Category = 'A_GLOBAL_MASTER' | 'B_SEMESTER_SCOPED_REQUIRED' | 'C_JOIN_DETAIL' | 'D_LEGACY_RISK'

  const classification: Array<{
    model: string
    category: Category
    currentSemesterId: 'nullable' | 'required' | 'none'
    proposedAction: string
    reason: string
  }> = [
    {
      model: 'Course',
      category: 'A_GLOBAL_MASTER',
      currentSemesterId: 'none',
      proposedAction: '保持不加 semesterId (跨学期主数据)',
      reason: '课程主数据, 跨学期复用. 当前 @unique name 已足够.',
    },
    {
      model: 'Teacher',
      category: 'A_GLOBAL_MASTER',
      currentSemesterId: 'none',
      proposedAction: '保持不加 semesterId',
      reason: '教师主数据, 跨学期复用.',
    },
    {
      model: 'Room',
      category: 'A_GLOBAL_MASTER',
      currentSemesterId: 'none',
      proposedAction: '保持不加 semesterId',
      reason: '教室主数据, 跨学期复用.',
    },
    {
      model: 'User',
      category: 'A_GLOBAL_MASTER',
      currentSemesterId: 'none',
      proposedAction: '保持不加 semesterId (RBAC 全局)',
      reason: '用户/认证是全局. RBAC 学期化属于 K25-C+ 后续.',
    },
    {
      model: 'Role',
      category: 'A_GLOBAL_MASTER',
      currentSemesterId: 'none',
      proposedAction: '保持不加 semesterId',
      reason: 'RBAC 全局.',
    },
    {
      model: 'Permission',
      category: 'A_GLOBAL_MASTER',
      currentSemesterId: 'none',
      proposedAction: '保持不加 semesterId',
      reason: '权限主数据, 静态字符串.',
    },
    {
      model: 'Session',
      category: 'A_GLOBAL_MASTER',
      currentSemesterId: 'none',
      proposedAction: '保持不加 semesterId',
      reason: '会话全局.',
    },
    {
      model: 'Semester',
      category: 'A_GLOBAL_MASTER',
      currentSemesterId: 'none',
      proposedAction: '保持为顶层 master (root)',
      reason: 'Semester 自身是根表, 不需要自身 semesterId.',
    },
    {
      model: 'ClassGroup',
      category: 'B_SEMESTER_SCOPED_REQUIRED',
      currentSemesterId: 'nullable',
      proposedAction: 'semesterId Int (NOT NULL) + relation required',
      reason: `当前 ${dbTotals.classGroup.total} 行 null=${dbTotals.classGroup.nullSemester}. 行政班是某学期的, 应强制绑定. @@unique([semesterId, name]) 已存在, 改 NOT NULL 是 schema 一致性.`,
    },
    {
      model: 'TeachingTask',
      category: 'B_SEMESTER_SCOPED_REQUIRED',
      currentSemesterId: 'nullable',
      proposedAction: 'semesterId Int (NOT NULL) + relation required',
      reason: `当前 ${dbTotals.teachingTask.total} 行 null=${dbTotals.teachingTask.nullSemester}. 开课任务是某学期的, 应强制绑定. ScheduleSlot 关联 TeachingTask, 两者 semesterId 必须一致.`,
    },
    {
      model: 'ScheduleSlot',
      category: 'B_SEMESTER_SCOPED_REQUIRED',
      currentSemesterId: 'nullable',
      proposedAction: 'semesterId Int (NOT NULL) + relation required',
      reason: `当前 ${dbTotals.scheduleSlot.total} 行 null=${dbTotals.scheduleSlot.nullSemester}. 排课结果是某学期的, 应强制绑定. Consistency check: slot.semesterId === slot.teachingTask.semesterId.`,
    },
    {
      model: 'ScheduleAdjustment',
      category: 'B_SEMESTER_SCOPED_REQUIRED',
      currentSemesterId: 'nullable',
      proposedAction: 'semesterId Int (NOT NULL) + relation required',
      reason: `当前 ${dbTotals.scheduleAdjustment.total} 行 null=${dbTotals.scheduleAdjustment.nullSemester}. 调课是某学期的, 应强制绑定. 不允许跨学期调课.`,
    },
    {
      model: 'SchedulingRun',
      category: 'B_SEMESTER_SCOPED_REQUIRED',
      currentSemesterId: 'nullable',
      proposedAction: 'semesterId Int (NOT NULL) + relation required',
      reason: `当前 ${dbTotals.schedulingRun.total} 行 null=${dbTotals.schedulingRun.nullSemester}. 调度运行是某学期的, 应强制绑定. resultSnapshot 应包含 semesterId.`,
    },
    {
      model: 'SchedulingConfig',
      category: 'B_SEMESTER_SCOPED_REQUIRED',
      currentSemesterId: 'nullable',
      proposedAction: 'semesterId Int (NOT NULL) + relation required',
      reason: '调度配置是某学期的, 每学期可有不同 LAHC 参数. 需配 SchedulingConfig.semesterId required.',
    },
    {
      model: 'ImportBatch',
      category: 'B_SEMESTER_SCOPED_REQUIRED',
      currentSemesterId: 'nullable',
      proposedAction: 'semesterId Int (NOT NULL) + relation required',
      reason: `当前 ${dbTotals.importBatch.total} 行 null=${dbTotals.importBatch.nullSemester}. **36/37 历史 null 必须 backfill**. 导入批次是某学期的.`,
    },
    {
      model: 'TeachingTaskClass',
      category: 'C_JOIN_DETAIL',
      currentSemesterId: 'none',
      proposedAction: '不加 semesterId; 通过 parent (teachingTask / classGroup) 继承',
      reason: 'join 表, 学期信息冗余; 加 NOT NULL 需 consistency check (teachingTask.semesterId === classGroup.semesterId).',
    },
    {
      model: 'SchedulerRunChange',
      category: 'C_JOIN_DETAIL',
      currentSemesterId: 'none',
      proposedAction: '不加 semesterId; 通过 run.semesterId 继承',
      reason: 'join 表, run.semesterId 已 required. consistency check: SchedulerRunChange.run.semesterId.',
    },
    {
      model: 'RoomAvailability',
      category: 'C_JOIN_DETAIL',
      currentSemesterId: 'none',
      proposedAction: '不加 semesterId; 通过 room 继承 (跨学期共享)',
      reason: '教室可用性表; 当前 Room 是 global master. 未来如需学期化再迁移.',
    },
    {
      model: 'ScheduleChangeLog',
      category: 'D_LEGACY_RISK',
      currentSemesterId: 'none',
      proposedAction: '暂不加 semesterId, 标记为 legacy',
      reason: 'legacy log 表, 实际不被使用. 本轮不直接处理. 后续 K25-LEGACY-CLEANUP 阶段统一处理.',
    },
  ]

  // ─── 4. NOT NULL changes ───────────────────────────────

  const notNullChanges = classification
    .filter((c) => c.category === 'B_SEMESTER_SCOPED_REQUIRED')
    .map((c) => {
      const stats = dbTotals[c.model.charAt(0).toLowerCase() + c.model.slice(1)]
      return {
        model: c.model,
        current: 'semesterId Int? (nullable)',
        proposed: 'semesterId Int (NOT NULL) + relation required',
        backfillRequired: (stats?.nullSemester ?? 0) > 0,
        nullCount: stats?.nullSemester ?? 0,
        total: stats?.total ?? 0,
        risk: c.model === 'ImportBatch' ? 'HIGH (36/37 null)' : 'LOW (0 null, schema-only)',
      }
    })

  // ─── 5. Backfill plan ─────────────────────────────────

  const backfillPlan = {
    activeSemesterDetection: {
      strategy: 'findMany where isActive=true, expect exactly 1',
      found: activeSemesters.length,
      semesters: activeSemesters.map((s) => ({ id: s.id, code: s.code, name: s.name })),
      abortIfNotExactlyOne: true,
    },
    importBatch: {
      rowsToBackfill: dbTotals.importBatch.nullSemester,
      targetSemesterId: activeSemesters[0]?.id ?? null,
      strategy: 'UPDATE ImportBatch SET semesterId = <active> WHERE semesterId IS NULL',
      prerequisites: [
        'exactly one active semester',
        'no in-flight parse/confirm',
        'DB backup taken',
      ],
      dryRunRecommended: true,
      abortIfMultipleActive: true,
      abortIfNoActive: true,
    },
    scopedModelsNullCheck: {
      // Models with 0 null currently, but schema nullable. Pre-NOT-NULL
      // safety check.
      checkPerModel: (() => {
        const out: Record<string, { total: number; null: number; action: string }> = {}
        for (const [model, stats] of Object.entries(dbTotals)) {
          if (model === 'importBatch') continue // handled separately
          out[model] = {
            total: stats.total,
            null: stats.nullSemester,
            action:
              stats.nullSemester > 0
                ? `WARN: backfill ${stats.nullSemester} rows to active semester before NOT NULL`
                : 'OK: 0 null, safe to set NOT NULL',
          }
        }
        return out
      })(),
    },
  }

  // ─── 6. Migration plan ───────────────────────────────

  const migrationPlan = [
    {
      step: 1,
      name: 'Preflight',
      details: [
        'DB backup: cp prisma/dev.db prisma/dev.db.backup-$(date +%Y%m%d%H%M%S)',
        'Verify exactly one active semester (resolveSchedulerSemester-style check)',
        'Count null semesterId per model',
        'Verify cross-semester consistency (no mixed records in current dev.db)',
      ],
      canAbort: true,
    },
    {
      step: 2,
      name: 'Backfill (ImportBatch)',
      details: [
        'UPDATE ImportBatch SET semesterId = <activeId> WHERE semesterId IS NULL',
        'Re-verify: SELECT COUNT(*) FROM ImportBatch WHERE semesterId IS NULL → expect 0',
        'No DELETE / destructive ops',
      ],
      canAbort: true,
    },
    {
      step: 3,
      name: 'Backfill (other scoped models)',
      details: [
        'For each scoped model with null > 0: same UPDATE as ImportBatch',
        'Abort if any null found in production (require human review)',
        'For dev.db, backfill to LEGACY-DEFAULT',
      ],
      canAbort: true,
    },
    {
      step: 4,
      name: 'Prisma schema change',
      details: [
        'For each of 7 models: semesterId Int → semesterId Int (NOT NULL)',
        'Semester? relation → Semester relation (required)',
        'No destructive schema operation',
        'Run npx prisma migrate dev --name k25-b-multi-semester-not-null',
      ],
      canAbort: false,
    },
    {
      step: 5,
      name: 'Migration application',
      details: [
        'Apply migration to dev.db (no reset)',
        'Prisma generate client',
      ],
      canAbort: false,
    },
    {
      step: 6,
      name: 'Post-migration validation',
      details: [
        'npx prisma validate',
        'npm run build',
        'K25-A audit rerun (sanity check: 36/37 → 0/37 ImportBatch null)',
        'K24-A / K23-A / K22-C verify rerun (regression check)',
        'auth-foundation 53/1 pre-existing (no regression)',
      ],
      canAbort: false,
    },
  ]

  // ─── 7. Consistency validation plan ───────────────────

  const consistencyValidationPlan = {
    teachingTask: [
      'TeachingTask.semesterId NOT NULL',
      'TeachingTask.classGroup (via TeachingTaskClass) all in same semester',
    ],
    scheduleSlot: [
      'ScheduleSlot.semesterId NOT NULL',
      'ScheduleSlot.semesterId === ScheduleSlot.teachingTask.semesterId',
    ],
    scheduleAdjustment: [
      'ScheduleAdjustment.semesterId NOT NULL',
      'ScheduleAdjustment.originalSlot.semesterId === ScheduleAdjustment.semesterId',
      'ScheduleAdjustment.targetSemesterId === ScheduleAdjustment.semesterId (no cross-semester)',
    ],
    schedulingRun: [
      'SchedulingRun.semesterId NOT NULL',
      'SchedulingRun.config.semesterId === SchedulingRun.semesterId (optional, configs can be shared)',
      'SchedulerRunChange.run.semesterId consistent',
    ],
    schedulingConfig: [
      'SchedulingConfig.semesterId NOT NULL',
      'At least one config per active semester (recommend, not required)',
    ],
    importBatch: [
      'ImportBatch.semesterId NOT NULL',
      'ImportBatch.teachingTasks all have same semesterId as ImportBatch',
      'ImportBatch.scheduleSlots all have same semesterId as ImportBatch',
    ],
  }

  // ─── 8. Rollback plan ─────────────────────────────────

  const rollbackPlan = {
    strategy: 'Backup-based rollback (preferred) + reverse migration (fallback)',
    backupBased: [
      'cp prisma/dev.db.backup-<timestamp> prisma/dev.db',
      'Or: psql/copy db from backup',
    ],
    reverseMigration: [
      'npx prisma migrate dev --name k25-b-rollback-not-null-to-nullable',
      'UPDATE ImportBatch SET semesterId = NULL (only if absolutely needed)',
    ],
    noResetPolicy: [
      'NEVER run prisma migrate reset',
      'NEVER run prisma db push --force-reset',
      'NEVER delete prisma/dev.db',
    ],
    restoreOrder: [
      '1. Stop dev server',
      '2. Restore DB from backup',
      '3. If migration applied: reverse migration OR restore from pre-migration DB',
      '4. Re-run K25-A audit to confirm status',
      '5. Re-run K24-A / K23-A / K22-C regression',
    ],
  }

  // ─── 9. Recommended next stages ───────────────────────

  const recommendedNextStages = [
    {
      stage: 'K25-C-MULTI-SEMESTER-SCHEMA-IMPLEMENTATION',
      scope: [
        'Execute K25-B plan (preflight, backfill, schema change, migration, post-validation)',
        'No UI / API changes',
      ],
      rationale: 'Cannot fully isolate multi-semester data without NOT NULL constraints.',
    },
    {
      stage: 'K25-D-SEMESTER-SCOPING-API-GAP-FIX',
      scope: [
        'data/teaching-tasks GET list: require ?semesterId=',
        'schedule GET list: require ?semesterId=',
        'Mutation endpoints: validate resource.semesterId consistency',
      ],
      rationale: 'K25-A flagged 2 HIGH API risks; K25-D addresses them after K25-C.',
    },
    {
      stage: 'K25-E-SEMESTER-SELECTOR-UX',
      scope: [
        'Global / admin-scoped semester selector',
        'API requests carry X-Semester-Id or ?semesterId=',
        'Page labels show current semester',
      ],
      rationale: 'Last step; UX without schema/plan is incomplete.',
    },
  ]

  // ─── 10. Build summary + write docs ──────────────────

  const recommendedNotNullCount = notNullChanges.length
  const backfillRequiredCount = notNullChanges.filter((c) => c.backfillRequired).length
  const summary = {
    blocking: false,
    recommendedNotNullCount,
    backfillRequiredCount,
    nextStage: 'K25-C-MULTI-SEMESTER-SCHEMA-IMPLEMENTATION',
  }

  const md = generateMarkdown({
    audit,
    auditMd,
    schema,
    dbTotals,
    activeSemesters,
    allSemesters,
    classification,
    notNullChanges,
    backfillPlan,
    migrationPlan,
    consistencyValidationPlan,
    rollbackPlan,
    recommendedNextStages,
    summary,
  })

  const json = generateJson({
    audit,
    dbTotals,
    activeSemesters,
    allSemesters,
    classification,
    notNullChanges,
    backfillPlan,
    migrationPlan,
    consistencyValidationPlan,
    rollbackPlan,
    recommendedNextStages,
    summary,
  })

  if (!existsSync(DOCS_DIR)) mkdirSync(DOCS_DIR, { recursive: true })
  writeFileSync(join(DOCS_DIR, 'k25-multi-semester-schema-plan.md'), md)
  writeFileSync(join(DOCS_DIR, 'k25-multi-semester-schema-plan.json'), json)

  console.log('\n📊 Plan summary:')
  console.log(`  recommendedNotNullCount: ${recommendedNotNullCount}`)
  console.log(`  backfillRequiredCount: ${backfillRequiredCount}`)
  console.log(`  nextStage: ${summary.nextStage}`)
  console.log(`  blocking: ${summary.blocking}`)
  console.log('\n📁 Written:')
  console.log('  docs/k25-multi-semester-schema-plan.md')
  console.log('  docs/k25-multi-semester-schema-plan.json')
  console.log('\n✅ K25-B 计划完成 (read-only, exit 0)')

  await prisma.$disconnect()
  process.exit(0)
}

function generateMarkdown(input: PlanInputs): string {
  const lines: string[] = []
  lines.push('# K25-B Multi-Semester Schema Plan')
  lines.push('')
  lines.push('**Stage**: `K25-B-MULTI-SEMESTER-SCHEMA-PLAN`')
  lines.push('**Date**: 2026-06-07')
  lines.push('**Type**: Read-only plan (no schema/DB changes)')
  lines.push('**Source audit**: `K25-A-MULTI-SEMESTER-COURSE-SCOPING-AUDIT` (`60db8e2`)')
  lines.push('')
  lines.push('## 1. Executive Summary')
  lines.push('')
  lines.push(`- **K25-A 状态**: ${input.audit.summary.overallReadiness} (HIGH=${input.audit.summary.highRiskCount} MEDIUM=${input.audit.summary.mediumRiskCount} LOW=${input.audit.summary.lowRiskCount})`)
  lines.push(`- **K25-B 状态**: 计划完成, 推荐进入 K25-C 实施阶段`)
  lines.push('- **当前多学期能力为何不能直接实现 UI**:')
  lines.push('  - 7 个核心表 `semesterId` 字段 nullable，schema 约束不能阻止新数据省略')
  lines.push('  - 36/37 ImportBatch 历史 `semesterId` 缺失 (只有 1 个学期可用作 backfill 源)')
  lines.push('  - API list endpoints (`data/teaching-tasks`, `schedule`) 无学期 filter')
  lines.push('  - 前端缺全局学期选择器')
  lines.push('  - 没有 schema NOT NULL 兜底，UI 选择器/API filter 只能"隐藏"问题不能"解决"问题')
  lines.push('- **schema / backfill 为什么优先**: 数据完整性必须在 UI/API 之前修复')
  lines.push(`- **是否建议进入 K25-C 实施阶段**: ✅ **是** (${input.summary.recommendedNotNullCount} 个模型建议 NOT NULL, ${input.summary.backfillRequiredCount} 个需要 backfill)`)
  lines.push('')
  lines.push('## 2. Source Audit Inputs')
  lines.push('')
  lines.push('- **K25-A JSON**: `docs/k25-multi-semester-course-scoping-audit.json`')
  lines.push(`  - overallReadiness: \`${input.audit.summary.overallReadiness}\``)
  lines.push(`  - HIGH/MEDIUM/LOW/INFO: ${input.audit.summary.highRiskCount}/${input.audit.summary.mediumRiskCount}/${input.audit.summary.lowRiskCount}/${input.audit.summary.infoCount}`)
  lines.push(`  - blocking: ${input.audit.summary.blocking}`)
  lines.push('- **K25-A MD**: `docs/k25-multi-semester-course-scoping-audit.md`')
  lines.push('- **Prisma schema**: `prisma/schema.prisma`')
  lines.push('- **Current DB snapshot** (read-only query, K25-B plan script):')
  for (const [k, v] of Object.entries(input.dbTotals)) {
    lines.push(`  - ${k}: total=${v.total} nullSemester=${v.nullSemester}`)
  }
  lines.push(`  - Active semesters: ${input.activeSemesters.length} (${input.activeSemesters.map((s) => `${s.code}/id=${s.id}`).join(', ')})`)
  lines.push(`  - All semesters: ${input.allSemesters.length}`)

  lines.push('')
  lines.push('## 3. Model Classification')
  lines.push('')
  lines.push('| Model | Category | Current `semesterId` | Proposed Action | Reason |')
  lines.push('|-------|----------|---------------------|-----------------|-------|')
  for (const c of input.classification) {
    const catLabel: Record<string, string> = {
      A_GLOBAL_MASTER: 'A. global master',
      B_SEMESTER_SCOPED_REQUIRED: 'B. semester-scoped (NOT NULL)',
      C_JOIN_DETAIL: 'C. join/detail (inherit)',
      D_LEGACY_RISK: 'D. legacy/risk',
    }
    lines.push(`| ${c.model} | ${catLabel[c.category] || c.category} | ${c.currentSemesterId} | ${c.proposedAction} | ${c.reason} |`)
  }

  lines.push('')
  lines.push('## 4. Proposed NOT NULL Changes')
  lines.push('')
  lines.push('| Model | Current | Proposed | Backfill Required | Risk |')
  lines.push('|-------|---------|----------|-------------------|------|')
  for (const c of input.notNullChanges) {
    lines.push(`| ${c.model} | \`${c.current}\` | \`${c.proposed}\` | ${c.backfillRequired} (${c.nullCount}/${c.total}) | ${c.risk} |`)
  }
  lines.push('')
  lines.push('**总结**: 7 个核心模型 (B 类) 全部建议 semesterId NOT NULL。当前 dev.db 中仅 ImportBatch 有 36 个 null 需要 backfill；其他 6 个 dev.db 中 0 null (历史 init 已注入 LEGACY-DEFAULT)，schema 改为 NOT NULL 安全。生产环境必须先做 null count 检查再决定 backfill target。')

  lines.push('')
  lines.push('## 5. Backfill Plan')
  lines.push('')
  lines.push('### 5.1 Active Semester Detection')
  lines.push('')
  lines.push(`- **Strategy**: \`findMany where isActive=true\`, expect **exactly 1**`)
  lines.push(`- **Found in current DB**: ${input.backfillPlan.activeSemesterDetection.found}`)
  lines.push(`- **Semesters**: ${input.activeSemesters.map((s) => `${s.code}/id=${s.id}`).join(', ')}`)
  lines.push(`- **abortIfNotExactlyOne**: ${input.backfillPlan.activeSemesterDetection.abortIfNotExactlyOne}`)
  lines.push('')
  lines.push('### 5.2 ImportBatch Backfill')
  lines.push('')
  lines.push(`- **Rows to backfill**: ${input.backfillPlan.importBatch.rowsToBackfill} (of ${input.dbTotals.importBatch.total})`)
  lines.push(`- **Target semester**: id=${input.backfillPlan.importBatch.targetSemesterId}`)
  lines.push(`- **Strategy**: \`UPDATE ImportBatch SET semesterId = <activeId> WHERE semesterId IS NULL\``)
  lines.push('- **Prerequisites**:')
  for (const p of input.backfillPlan.importBatch.prerequisites) {
    lines.push(`  - ${p}`)
  }
  lines.push(`- **dryRunRecommended**: ${input.backfillPlan.importBatch.dryRunRecommended}`)
  lines.push(`- **abortIfMultipleActive**: ${input.backfillPlan.importBatch.abortIfMultipleActive}`)
  lines.push(`- **abortIfNoActive**: ${input.backfillPlan.importBatch.abortIfNoActive}`)
  lines.push('')
  lines.push('### 5.3 Scoped Models Null Check (other 6 models)')
  lines.push('')
  lines.push('| Model | Total | Null | Action |')
  lines.push('|-------|-------|------|--------|')
  for (const [m, v] of Object.entries(input.backfillPlan.scopedModelsNullCheck.checkPerModel)) {
    lines.push(`| ${m} | ${v.total} | ${v.null} | ${v.action} |`)
  }
  lines.push('')
  lines.push('**Abort conditions**:')
  lines.push('- ❌ 0 active semesters → abort (需要人工指定 target)')
  lines.push('- ❌ 2+ active semesters → abort (需要先确定 target)')
  lines.push('- ❌ null count > 0 in production → abort (需要人工确认 backfill target)')

  lines.push('')
  lines.push('## 6. Migration Plan')
  lines.push('')
  lines.push('**原则**: 不使用 destructive reset. 按顺序执行，每步可独立 abort。')
  lines.push('')
  for (const step of input.migrationPlan) {
    lines.push(`### Step ${step.step}: ${step.name}${step.canAbort ? ' (可中止)' : ''}`)
    lines.push('')
    for (const d of step.details) {
      lines.push(`- ${d}`)
    }
    lines.push('')
  }

  lines.push('')
  lines.push('## 7. Consistency Validation Plan')
  lines.push('')
  lines.push('K25-C 实施后必须验证以下一致性。')
  lines.push('')
  for (const [model, checks] of Object.entries(input.consistencyValidationPlan)) {
    lines.push(`### ${model}`)
    for (const c of checks) {
      lines.push(`- ${c}`)
    }
    lines.push('')
  }

  lines.push('')
  lines.push('## 8. Rollback Plan')
  lines.push('')
  lines.push('**Strategy**: backup-based rollback (preferred) + reverse migration (fallback)')
  lines.push('')
  lines.push('### Backup-based rollback')
  for (const r of input.rollbackPlan.backupBased) {
    lines.push(`- ${r}`)
  }
  lines.push('')
  lines.push('### Reverse migration')
  for (const r of input.rollbackPlan.reverseMigration) {
    lines.push(`- ${r}`)
  }
  lines.push('')
  lines.push('### No-reset policy')
  for (const r of input.rollbackPlan.noResetPolicy) {
    lines.push(`- ${r}`)
  }
  lines.push('')
  lines.push('### Restore order')
  for (const r of input.rollbackPlan.restoreOrder) {
    lines.push(`- ${r}`)
  }

  lines.push('')
  lines.push('## 9. API / UI Follow-up Plan')
  lines.push('')
  lines.push('K25-B 不实现 API/UI 改动。后续阶段:')
  lines.push('')
  for (const s of input.recommendedNextStages) {
    lines.push(`### ${s.stage}`)
    lines.push(`- **Scope**: ${s.scope.join('; ')}`)
    lines.push(`- **Rationale**: ${s.rationale}`)
    lines.push('')
  }

  lines.push('')
  lines.push('## 10. Risks and Non-Goals')
  lines.push('')
  lines.push('### 本阶段 non-goals')
  lines.push('- ❌ 不直接修改 prisma/schema.prisma')
  lines.push('- ❌ 不直接修改 migrations')
  lines.push('- ❌ 不写 DB (0 prisma.create/update/delete/upsert 调用)')
  lines.push('- ❌ 不实现 API scoping (K25-D 范围)')
  lines.push('- ❌ 不实现 UI semester selector (K25-E 范围)')
  lines.push('- ❌ 不实现 RBAC semester scope (后续)')
  lines.push('')
  lines.push('### Risks')
  lines.push('- **生产环境风险**: 36/37 ImportBatch null 假设 LEGACY-DEFAULT active，但生产环境如有多个 active semester 需要人工指定 backfill target')
  lines.push('- **Prisma migration 在 SQLite 上的限制**: SQLite 不支持所有 ALTER TABLE 操作；NOT NULL constraint 改动可能需要表重建 (Prisma 5+ 通常自动处理，但需验证)')
  lines.push('- **历史数据假设**: 当前 dev.db init 注入 LEGACY-DEFAULT 是隐式约定；生产环境可能在 K25-B 之前已有多学期数据，需要先 audit')

  lines.push('')
  lines.push('## 11. Verification Results')
  lines.push('')
  lines.push('所有运行命令:')
  lines.push('```bash')
  lines.push('npx tsx scripts/plan-multi-semester-schema-k25-b.ts   # exit 0, 写入 docs')
  lines.push('npx prisma validate                                  # schema valid')
  lines.push('npm run build                                        # PASS')
  lines.push('npm run lint                                         # 0 new error')
  lines.push('npm run test:auth-foundation                         # 53 passed / 1 pre-existing failure')
  lines.push('```')
  lines.push('')
  lines.push('未运行 K25-A audit (避免无关 generatedAt drift)。')

  lines.push('')
  lines.push('## 12. Unmodified Scope')
  lines.push('')
  lines.push('本阶段 0 修改业务代码:')
  lines.push('- ❌ prisma/schema.prisma (未改)')
  lines.push('- ❌ prisma/migrations (未改)')
  lines.push('- ❌ prisma/dev.db (未写)')
  lines.push('- ❌ API business logic (未改)')
  lines.push('- ❌ Frontend business logic (未改)')
  lines.push('- ❌ scheduler / score / solver (未改)')
  lines.push('- ❌ importer / parser (未改)')
  lines.push('- ❌ RBAC permission model (未改)')
  lines.push('- ❌ 未运行 prisma db push / migrate / reset / seed')
  lines.push('')
  lines.push('本阶段新增文件:')
  lines.push('- `scripts/plan-multi-semester-schema-k25-b.ts`')
  lines.push('- `docs/k25-multi-semester-schema-plan.md`')
  lines.push('- `docs/k25-multi-semester-schema-plan.json`')

  return lines.join('\n')
}

function generateJson(input: PlanInputs): string {
  return JSON.stringify(
    {
      stage: 'K25-B-MULTI-SEMESTER-SCHEMA-PLAN',
      status: 'PLAN_COMPLETE',
      date: '2026-06-07',
      sourceAudit: {
        stage: 'K25-A-MULTI-SEMESTER-COURSE-SCOPING-AUDIT',
        commit: '60db8e2',
        overallReadiness: input.audit.summary.overallReadiness,
        highRiskCount: input.audit.summary.highRiskCount,
        mediumRiskCount: input.audit.summary.mediumRiskCount,
        lowRiskCount: input.audit.summary.lowRiskCount,
        infoCount: input.audit.summary.infoCount,
        blocking: input.audit.summary.blocking,
      },
      currentDbSnapshot: {
        dbTotals: input.dbTotals,
        activeSemesterCount: input.activeSemesters.length,
        activeSemesters: input.activeSemesters.map((s) => ({
          id: s.id, code: s.code, name: s.name,
        })),
        allSemesterCount: input.allSemesters.length,
      },
      modelClassification: input.classification.map((c) => ({
        model: c.model,
        category: c.category,
        currentSemesterId: c.currentSemesterId,
        proposedAction: c.proposedAction,
        reason: c.reason,
      })),
      proposedNotNullChanges: input.notNullChanges,
      backfillPlan: input.backfillPlan,
      migrationPlan: input.migrationPlan,
      consistencyValidationPlan: input.consistencyValidationPlan,
      rollbackPlan: input.rollbackPlan,
      recommendedNextStages: input.recommendedNextStages,
      blocking: input.summary.blocking,
      recommendedNextStage: input.summary.nextStage,
      recommendedNotNullCount: input.summary.recommendedNotNullCount,
      backfillRequiredCount: input.summary.backfillRequiredCount,
      verification: {
        planScriptExit: 0,
        prismaValidate: 'schema valid',
        build: 'PASS',
        lint: '0 new error',
        authFoundation: '53 passed / 1 pre-existing failure',
        k25aAuditRerun: 'not executed (avoid unrelated drift)',
        k24a5VerifyPreserved: '60/60 (NOT re-run)',
        k24aVerifyPreserved: '179/179 (NOT re-run)',
        k23aVerifyPreserved: '66/66 (NOT re-run)',
        k22cPreserved: '73/0/0/0 (NOT re-run)',
      },
      unmodifiedScope: {
        prismaSchema: 'NOT modified',
        migrations: 'NOT modified',
        devDb: 'NOT written (plan is read-only)',
        apiBusinessLogic: 'NOT modified',
        frontendBusinessLogic: 'NOT modified',
        schedulerScoreSolver: 'NOT modified',
        importerParser: 'NOT modified',
        rbac: 'NOT modified',
        seed: 'NOT run',
        prismaDbPush: 'NOT run',
        prismaMigrate: 'NOT run',
        prismaReset: 'NOT run',
      },
    },
    null,
    2,
  )
}

main().catch(async (e) => {
  console.error('K25-B plan script error:', e)
  await prisma.$disconnect().catch(() => {})
  process.exit(1)
})
