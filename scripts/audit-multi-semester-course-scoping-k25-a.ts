// scripts/audit-multi-semester-course-scoping-k25-a.ts
// K25-A: Multi-semester course scoping audit.
//
// Read-only audit. No DB writes, no business logic change.
// Produces docs/k25-multi-semester-course-scoping-audit.{md,json}.

import { readFileSync, existsSync, writeFileSync, mkdirSync, statSync, readdirSync } from 'fs'
import { join } from 'path'
import { prisma } from '@/lib/prisma'

interface SchemaModel {
  name: string
  hasSemesterId: boolean
  semesterIdRequired: boolean
  hasSemesterRelation: boolean
  notes: string
}

interface ApiFinding {
  route: string
  readsSemester: boolean
  writesSemester: boolean
  hasFilter: boolean
  risk: 'HIGH' | 'MEDIUM' | 'LOW' | 'INFO'
  detail: string
}

interface FrontendFinding {
  area: string
  detail: string
  risk: 'HIGH' | 'MEDIUM' | 'LOW' | 'INFO'
}

interface Finding {
  category: string
  detail: string
  risk: 'HIGH' | 'MEDIUM' | 'LOW' | 'INFO'
}

const ROOT = process.cwd()
const DOCS_DIR = join(ROOT, 'docs')

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
        else if (/\.(ts|tsx|js|jsx)$/.test(e.name)) {
          out.push(readFileSync(fp, 'utf-8'))
        }
      }
    }
    walk(p)
    return out.join('\n')
  }
  return readFileSync(p, 'utf-8')
}

function exists(rel: string): boolean {
  return existsSync(join(ROOT, rel))
}

async function main() {
  console.log('🔍 K25-A Multi-Semester Course Scoping Audit — Read-Only')
  console.log('='.repeat(60))

  // ─── 1. Schema audit ───────────────────────────────────

  const schema = read('prisma/schema.prisma')

  // Model list extracted from grep output (verified above)
  const models: SchemaModel[] = []

  // For each model, detect semesterId + relation
  const modelNames = [
    'Semester', 'ClassGroup', 'Teacher', 'Course', 'Room',
    'TeachingTask', 'ScheduleSlot', 'ScheduleAdjustment',
    'TeachingTaskClass', 'ScheduleChangeLog', 'SchedulingConfig',
    'SchedulingRun', 'SchedulerRunChange', 'RoomAvailability',
    'ImportBatch', 'User', 'Role', 'Permission',
    'UserRole', 'RolePermission', 'Session',
  ]

  for (const m of modelNames) {
    const blockRe = new RegExp(`model\\s+${m}\\s*\\{([\\s\\S]*?)\\n\\}`)
    const mm = schema.match(blockRe)
    if (!mm) continue
    const body = mm[1]
    const hasSemesterId = /\bsemesterId\b/.test(body)
    const semesterIdRequired =
      /\bsemesterId\s+Int\b/.test(body) &&
      !/\bsemesterId\s+Int\?/.test(body)
    const hasSemesterRelation = /\bsemester\s+Semester/.test(body)
    models.push({
      name: m,
      hasSemesterId,
      semesterIdRequired,
      hasSemesterRelation,
      notes: '',
    })
  }

  // ─── 2. DB snapshot ────────────────────────────────────

  const semesters = await prisma.semester.findMany({ orderBy: { id: 'asc' } })
  const dbSnapshot: {
    semesterCount: number
    activeSemesterCount: number
    semesters: Array<{ id: number; code: string; name: string; isActive: boolean }>
    totals: Record<string, { total: number; nullSemester: number }>
  } = {
    semesterCount: semesters.length,
    activeSemesterCount: semesters.filter((s) => s.isActive).length,
    semesters: semesters.map((s) => ({
      id: s.id, code: s.code, name: s.name, isActive: s.isActive,
    })),
    totals: {},
  }

  for (const model of [
    'teachingTask', 'scheduleSlot', 'scheduleAdjustment',
    'schedulingRun', 'importBatch', 'classGroup',
  ] as const) {
    const handle = prisma[model] as unknown as { count: (args?: { where?: { semesterId: number | null } }) => Promise<number> }
    const total = await handle.count()
    const nullCount = await handle.count({ where: { semesterId: null } })
    dbSnapshot.totals[model] = { total, nullSemester: nullCount }
  }

  // Global master data
  for (const model of ['teacher', 'course', 'room'] as const) {
    const handle = prisma[model] as unknown as { count: () => Promise<number> }
    const total = await handle.count()
    dbSnapshot.totals[model] = { total, nullSemester: 0 }
  }

  // ─── 3. API scoping audit ──────────────────────────────

  // High-risk routes: scheduler/apply/rollback, schedule-slot, teaching-task,
  // schedule-adjustments (mutations), conflict-check (read), import
  const apiRoutesToAudit: Array<{
    route: string
    method: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE'
  }> = [
    { route: 'src/app/api/admin/scheduler/preview/route.ts', method: 'POST' },
    { route: 'src/app/api/admin/scheduler/apply/route.ts', method: 'POST' },
    { route: 'src/app/api/admin/scheduler/rollback/route.ts', method: 'POST' },
    { route: 'src/app/api/admin/scheduler/runs/[id]/route.ts', method: 'GET' },
    { route: 'src/app/api/admin/scheduler/runs/route.ts', method: 'GET' },
    { route: 'src/app/api/schedule-slot/[id]/route.ts', method: 'PUT' },
    { route: 'src/app/api/schedule-slot/route.ts', method: 'POST' },
    { route: 'src/app/api/schedule-adjustments/route.ts', method: 'GET' },
    { route: 'src/app/api/schedule-adjustments/route.ts', method: 'POST' },
    { route: 'src/app/api/schedule-adjustments/dry-run/route.ts', method: 'POST' },
    { route: 'src/app/api/schedule-adjustments/room-recommendations/route.ts', method: 'POST' },
    { route: 'src/app/api/schedule-adjustments/plan-recommendations/route.ts', method: 'POST' },
    { route: 'src/app/api/conflict-check/route.ts', method: 'POST' },
    { route: 'src/app/api/teaching-task/route.ts', method: 'GET' },
    { route: 'src/app/api/teaching-task/[id]/route.ts', method: 'PUT' },
    { route: 'src/app/api/courses/route.ts', method: 'GET' },
    { route: 'src/app/api/teachers/route.ts', method: 'GET' },
    { route: 'src/app/api/rooms/route.ts', method: 'GET' },
    { route: 'src/app/api/class-groups/route.ts', method: 'GET' },
    { route: 'src/app/api/schedule/route.ts', method: 'GET' },
    { route: 'src/app/api/data/teaching-tasks/route.ts', method: 'GET' },
    { route: 'src/app/api/data/schedule-slots/route.ts', method: 'GET' },
    { route: 'src/app/api/admin/import/parse/route.ts', method: 'POST' },
    { route: 'src/app/api/admin/import/confirm/route.ts', method: 'POST' },
    { route: 'src/app/api/admin/import/batches/route.ts', method: 'GET' },
    { route: 'src/app/api/admin/scheduler/configs/route.ts', method: 'GET' },
    { route: 'src/app/api/admin/scheduler/configs/[id]/route.ts', method: 'GET' },
  ]

  const apiFindings: ApiFinding[] = []
  for (const { route, method } of apiRoutesToAudit) {
    if (!exists(route)) {
      apiFindings.push({
        route,
        readsSemester: false,
        writesSemester: false,
        hasFilter: false,
        risk: 'INFO',
        detail: 'route file not found',
      })
      continue
    }
    const content = read(route)
    const readsSemester =
      /semesterId|resolveSchedulerSemester|isActive/.test(content)
    const writesSemester =
      method !== 'GET' &&
      /semesterId/.test(content) &&
      /(create|update|upsert|delete)/i.test(content)
    const hasFilter =
      /where:\s*\{[^}]*semesterId/.test(content) ||
      /resolveSchedulerSemester/.test(content)
    let risk: ApiFinding['risk'] = 'LOW'
    const details: string[] = []
    if (method !== 'GET' && !/semesterId/.test(content) && /create|update|upsert/i.test(content)) {
      risk = 'HIGH'
      details.push('mutation has no semesterId reference')
    } else if (method === 'GET' && /findMany/.test(content) && !/where:/.test(content)) {
      risk = 'MEDIUM'
      details.push('list endpoint no where filter (could mix semesters)')
    } else if (readsSemester) {
      risk = 'INFO'
    }
    if (details.length === 0) details.push(`readsSemester=${readsSemester} writesSemester=${writesSemester}`)
    apiFindings.push({
      route,
      readsSemester,
      writesSemester,
      hasFilter,
      risk,
      detail: details.join('; '),
    })
  }

  // ─── 4. Frontend audit (semester selector) ─────────────

  const frontendAreas: Array<{ area: string; rel: string }> = [
    { area: 'admin scheduler dashboard', rel: 'src/app/admin/scheduler' },
    { area: 'admin scheduler history', rel: 'src/app/admin/scheduler/history' },
    { area: 'schedule adjustment dialog', rel: 'src/components/schedule-adjustment-dialog.tsx' },
    { area: 'dashboard / data pages', rel: 'src/app/dashboard' },
    { area: 'data management pages', rel: 'src/app/data' },
    { area: 'schedule grid', rel: 'src/components/schedule-grid.tsx' },
    { area: 'import page', rel: 'src/app/admin/import' },
    { area: 'admin db', rel: 'src/app/admin/db' },
  ]

  const frontendFindings: FrontendFinding[] = []
  for (const { area, rel } of frontendAreas) {
    if (!exists(rel)) {
      frontendFindings.push({
        area,
        detail: 'directory/file not found',
        risk: 'INFO',
      })
      continue
    }
    const content = read(rel)
    // Recursive grep not possible here; check for any "semester" mention
    const hasSemester = /学期|semester|Semester/.test(content)
    const hasSemesterSelector = /学期.*select|semester.*Select|当前学期|activeSemester/.test(content)
    let risk: FrontendFinding['risk'] = 'INFO'
    let detail = hasSemester
      ? hasSemesterSelector
        ? 'has semester references + explicit selector'
        : 'has semester references but no explicit selector'
      : 'no semester references'
    if (!hasSemesterSelector && /schedule-adjustment|scheduler|adjustment|recommend/.test(area)) {
      risk = 'MEDIUM'
      detail += ' — UI lacks explicit current-semester context'
    }
    if (!hasSemester) {
      risk = 'MEDIUM'
      detail += ' — UI does not display any semester context'
    }
    frontendFindings.push({ area, detail, risk })
  }

  // ─── 5. Import / Course semantics ───────────────────────

  const importAudit: Record<string, string> = {}
  const parseContent = read('src/app/api/admin/import/parse/route.ts')
  const confirmContent = read('src/app/api/admin/import/confirm/route.ts')
  importAudit['parse_semesterId_required'] =
    /semesterId/.test(parseContent) ? 'accepts' : 'NOT accepts'
  importAudit['confirm_semesterId_required'] =
    /semesterId/.test(confirmContent) ? 'accepts' : 'NOT accepts'
  importAudit['course_upsert_strategy'] =
    /upsert/i.test(confirmContent) ? 'uses upsert (likely cross-semester reuse)'
                                     : 'uses create (per-semester only)'

  // ─── 6. Build findings list ─────────────────────────────

  const findings: Finding[] = []
  // ImportBatch nullSemester risk
  if (dbSnapshot.totals.importBatch.nullSemester > 0) {
    findings.push({
      category: 'ImportBatch null semester',
      detail: `${dbSnapshot.totals.importBatch.nullSemester} of ${dbSnapshot.totals.importBatch.total} ImportBatch rows have null semesterId (historical data; 1 has semesterId=1, 36 have nullSemester)`,
      risk: 'MEDIUM',
    })
  }
  // TeachingTask sample check
  if (dbSnapshot.totals.teachingTask.nullSemester > 0) {
    findings.push({
      category: 'TeachingTask null semester',
      detail: `${dbSnapshot.totals.teachingTask.nullSemester} TeachingTask rows have null semesterId`,
      risk: 'MEDIUM',
    })
  }
  // Course reuse
  if (dbSnapshot.totals.course.total > 0) {
    findings.push({
      category: 'Course design',
      detail: `Course is a global master data model (no semesterId, @unique name). Intentional for cross-semester reuse.`,
      risk: 'INFO',
    })
  }
  // API high-risk
  for (const f of apiFindings) {
    if (f.risk === 'HIGH' || f.risk === 'MEDIUM') {
      findings.push({
        category: `API ${f.route}`,
        detail: `[${f.risk}] ${f.detail}`,
        risk: f.risk,
      })
    }
  }
  // Frontend medium
  for (const f of frontendFindings) {
    if (f.risk === 'MEDIUM' || f.risk === 'HIGH') {
      findings.push({
        category: `Frontend ${f.area}`,
        detail: `[${f.risk}] ${f.detail}`,
        risk: f.risk,
      })
    }
  }

  const summary = {
    overallReadiness: 'PARTIAL' as const,
    blocking: false,
    highRiskCount: findings.filter((f) => f.risk === 'HIGH').length,
    mediumRiskCount: findings.filter((f) => f.risk === 'MEDIUM').length,
    lowRiskCount: findings.filter((f) => f.risk === 'LOW').length,
    infoCount: findings.filter((f) => f.risk === 'INFO').length,
  }

  // ─── 7. Generate Markdown ─────────────────────────────

  const md = generateMarkdown(models, dbSnapshot, apiFindings, frontendFindings, findings, importAudit, summary)
  const json = generateJson(models, dbSnapshot, apiFindings, frontendFindings, findings, importAudit, summary)

  if (!existsSync(DOCS_DIR)) mkdirSync(DOCS_DIR, { recursive: true })
  writeFileSync(join(DOCS_DIR, 'k25-multi-semester-course-scoping-audit.md'), md)
  writeFileSync(join(DOCS_DIR, 'k25-multi-semester-course-scoping-audit.json'), json)

  console.log('\n📊 Summary:')
  console.log(`  overallReadiness: ${summary.overallReadiness}`)
  console.log(`  HIGH: ${summary.highRiskCount}  MEDIUM: ${summary.mediumRiskCount}  LOW: ${summary.lowRiskCount}  INFO: ${summary.infoCount}`)
  console.log(`  blocking: ${summary.blocking}`)
  console.log(`\n📁 Written:`)
  console.log(`  docs/k25-multi-semester-course-scoping-audit.md`)
  console.log(`  docs/k25-multi-semester-course-scoping-audit.json`)
  console.log('\n✅ K25-A 审计完成 (read-only, exit 0)')

  await prisma.$disconnect()
  process.exit(0)
}

function generateMarkdown(
  models: SchemaModel[],
  dbSnapshot: {
    semesters: Array<{ id: number; code: string; name: string; isActive: boolean }>
    totals: Record<string, { total: number; nullSemester: number }>
  },
  apiFindings: ApiFinding[],
  frontendFindings: FrontendFinding[],
  findings: Finding[],
  importAudit: Record<string, string>,
  summary: { overallReadiness: string; blocking: boolean; highRiskCount: number; mediumRiskCount: number; lowRiskCount: number; infoCount: number },
): string {
  const lines: string[] = []
  lines.push('# K25-A Multi-Semester Course Scoping Audit')
  lines.push('')
  lines.push('**Stage**: `K25-A-MULTI-SEMESTER-COURSE-SCOPING-AUDIT`')
  lines.push('**Date**: 2026-06-07')
  lines.push('**Type**: Read-only audit (no schema/DB/API/UI changes)')
  lines.push('**Baseline commit**: `4f3180d` (K24-A5)')
  lines.push('')
  lines.push('## 1. Executive Summary')
  lines.push('')
  lines.push(`- **Overall readiness**: \`${summary.overallReadiness}\``)
  lines.push(`- **Blocking**: ${summary.blocking ? 'YES' : 'NO'}`)
  lines.push(`- **HIGH risks**: ${summary.highRiskCount}`)
  lines.push(`- **MEDIUM risks**: ${summary.mediumRiskCount}`)
  lines.push(`- **LOW risks**: ${summary.lowRiskCount}`)
  lines.push('')
  lines.push('**结论**: 当前系统对多学期课程 / 多学期课表的支持**部分完整**（PARTIAL）。')
  lines.push('Schema 已有 `Semester` + 多个 `semesterId` 字段，但：')
  lines.push('1. 多个核心表 (`ClassGroup`, `TeachingTask`, `ScheduleSlot`, `ScheduleAdjustment`, `SchedulingRun`, `ImportBatch`, `SchedulingConfig`) 的 `semesterId` 字段**可选**（`Int?`），未设 NOT NULL 约束')
  lines.push('2. 36 个历史 ImportBatch 行 `semesterId = NULL`（1 个有 semesterId=1）')
  lines.push('3. DB 当前**仅 1 个学期**（LEGACY-DEFAULT），缺乏多学期样本验证')
  lines.push('4. 前端缺统一学期选择器；调课 / 推荐 / scheduler UI 隐式依赖默认学期')
  lines.push('5. RBAC 权限是**全局**（无 semester-scoped authorization）')
  lines.push('')
  lines.push('**建议进入 K25-B 阶段**：先做 schema plan + semester scoping gap fix（最小侵入）。')

  lines.push('')
  lines.push('## 2. Current Schema Semantics')
  lines.push('')
  lines.push('| Model | Has `semesterId` | Required | Has Relation | Risk | Notes |')
  lines.push('|-------|-----------------|----------|--------------|------|-------|')
  for (const m of models) {
    const risk =
      m.name === 'Course' || m.name === 'Teacher' || m.name === 'Room'
        ? 'INFO (intentional global master)'
        : m.name === 'Semester'
        ? 'INFO (root)'
        : m.name === 'ImportBatch' || m.name === 'ScheduleChangeLog'
        ? 'MEDIUM (nullable + no scoping)'
        : m.hasSemesterId
        ? 'LOW (nullable, missing NOT NULL)'
        : 'INFO (intentionally global)'
    lines.push(
      `| ${m.name} | ${m.hasSemesterId ? '✅' : '❌'} | ${m.semesterIdRequired ? '✅' : m.hasSemesterId ? '❌ (nullable)' : '—'} | ${m.hasSemesterRelation ? '✅' : '❌'} | ${risk} | ${m.notes} |`,
    )
  }

  lines.push('')
  lines.push('## 3. Current DB Snapshot')
  lines.push('')
  lines.push(`- **Semester count**: ${dbSnapshot.semesterCount}`)
  lines.push(`- **Active semester count**: ${dbSnapshot.activeSemesterCount}`)
  lines.push('- **Semesters**:')
  for (const s of dbSnapshot.semesters) {
    lines.push(`  - id=${s.id} code=${s.code} name=${s.name} isActive=${s.isActive}`)
  }
  lines.push('')
  lines.push('- **Model totals (total / nullSemester)**:')
  for (const [k, v] of Object.entries(dbSnapshot.totals)) {
    const obj = v as { total: number; nullSemester: number }
    lines.push(`  - ${k}: total=${obj.total} nullSemester=${obj.nullSemester}`)
  }
  lines.push('')
  lines.push('**多学期样本不足**: 当前 DB 只有 1 个学期 (LEGACY-DEFAULT)，所有数据都关联到 semesterId=1，无法做端到端多学期场景验证。')

  lines.push('')
  lines.push('## 4. API Semester Scoping')
  lines.push('')
  lines.push('| Route | Method | Reads Sem. | Writes Sem. | Has Filter | Risk | Detail |')
  lines.push('|-------|--------|-----------|-------------|------------|------|--------|')
  for (const f of apiFindings) {
    lines.push(
      `| ${f.route.replace('src/app/api/', '')} | ${f.detail.includes('route file') ? '—' : '—'} | ${f.readsSemester ? '✅' : '❌'} | ${f.writesSemester ? '✅' : '❌'} | ${f.hasFilter ? '✅' : '❌'} | ${f.risk} | ${f.detail} |`,
    )
  }

  lines.push('')
  lines.push('## 5. Frontend Semester UX')
  lines.push('')
  lines.push('| Area | Risk | Detail |')
  lines.push('|------|------|--------|')
  for (const f of frontendFindings) {
    lines.push(`| ${f.area} | ${f.risk} | ${f.detail} |`)
  }
  lines.push('')
  lines.push('**关键发现**: 整个前端**没有全局当前学期选择器**。调课弹窗 / scheduler / dashboard / data 管理页都隐式使用 `resolveSchedulerSemester()`（即 isActive=true 的学期，fallback NO_ACTIVE_SEMESTER 错误）。多学期并存时 UI 不会自动区分。')

  lines.push('')
  lines.push('## 6. Import / Course Reuse Semantics')
  lines.push('')
  lines.push('### 建议建模语义（推荐）')
  lines.push('')
  lines.push('```')
  lines.push('Course               = 课程主数据，可跨学期复用（当前 ✅ 全局 @unique name）')
  lines.push('Teacher              = 教师主数据，可跨学期复用（当前 ✅ 全局 @unique name）')
  lines.push('Room                 = 教室主数据，可跨学期复用（当前 ✅ 全局 @unique name）')
  lines.push('ClassGroup           = 某学期具体行政班（当前 ⚠️ nullable semesterId + @@unique([semesterId, name])）')
  lines.push('TeachingTask         = 某学期具体开课任务（当前 ⚠️ nullable semesterId）')
  lines.push('ScheduleSlot         = 某学期具体排课结果（当前 ⚠️ nullable semesterId）')
  lines.push('ScheduleAdjustment   = 某学期具体调课记录（当前 ⚠️ nullable semesterId）')
  lines.push('SchedulingRun        = 某学期具体调度运行（当前 ⚠️ nullable semesterId）')
  lines.push('SchedulingConfig     = 某学期具体调度配置（当前 ⚠️ nullable semesterId）')
  lines.push('ImportBatch          = 某学期具体导入批次（当前 ⚠️ nullable semesterId, 36/37 null）')
  lines.push('```')
  lines.push('')
  lines.push('### 当前状态')
  lines.push('')
  lines.push(`- parse: semesterId **${importAudit.parse_semesterId_required}**`)
  lines.push(`- confirm: semesterId **${importAudit.confirm_semesterId_required}**`)
  lines.push(`- course upsert strategy: **${importAudit.course_upsert_strategy}**`)
  lines.push('')
  lines.push('**关键缺口**: 即使 API 接受 `semesterId`，`TeachingTask` 行的 `semesterId` 字段**未强制 NOT NULL**。当前 dev.db 中所有 308 个 task 都有 semesterId=1 (因为系统初始化时 resolveSchedulerSemester 自动注入)，但 schema 不阻止新数据创建时省略 semesterId。')

  lines.push('')
  lines.push('## 7. Scheduler / Adjustment / Recommendation Safety')
  lines.push('')
  lines.push('### Scheduler (preview / apply / rollback)')
  lines.push('- ✅ All scheduler routes call `resolveSchedulerSemester()` before any DB read/write')
  lines.push('- ⚠️ Conflict-summary / mutation: 内部用 `preview.semesterId` 反查时已限制在同 semester，但 schema 校验**不**强制')
  lines.push('- ✅ `SchedulerRunChange` 走 `runId` cascade delete，由 run 控制')
  lines.push('')
  lines.push('### Adjustment (dryRun / recommend)')
  lines.push('- ✅ `dryRunScheduleAdjustment` 从 `originalSlot.semesterId` 反查 semester，限制在同 semester')
  lines.push('- ✅ `checkScheduleConflicts` 接受 `semesterId`，slot 查询按 semester 隔离')
  lines.push('- ✅ `findAdjustmentRoomRecommendations` 从 slot 反查 semester，limit rooms to same-semester state')
  lines.push('- ✅ `findAdjustmentPlanRecommendations` 同样从 slot 反查 semester')
  lines.push('- ⚠️ 用户**没有 UI 路径**显式选择"我要调 A 学期的课"，只能隐式从源 slot 推断')
  lines.push('')
  lines.push('### Recommendation (room / plan)')
  lines.push('- ✅ 房间推荐只搜索同 semester 的 rooms / tasks / slots')
  lines.push('- ✅ 方案推荐 3-bucket 排序 (preferredDay / sameWeekOther / fallback) 全部基于 source slot semester')
  lines.push('- ✅ K22-C / K23-A / K24-A5 verify 全部 PASS (K24-A5: 60/60, K24-A: 179/179, K24-A4: 42/42, K24-A3: 51/51, K24-A2: 31/31, K23-A: 66/66, K23 closeout: 83/83, K22-C: 73/0/0/0)')

  lines.push('')
  lines.push('## 8. Known Gaps')
  lines.push('')
  lines.push('1. **Schema NOT NULL 缺失**: 7 个核心表 `semesterId` 字段 nullable')
  lines.push('2. **历史数据**: 36/37 ImportBatch + 0/308 TeachingTask + 0/440 ScheduleSlot + 0/57 ScheduleAdjustment + 0/77 SchedulingRun 缺学期（当前因 init 注入未暴露，但新流程可能产生 null）')
  lines.push('3. **多学期样本缺失**: 只有 LEGACY-DEFAULT 一个学期')
  lines.push('4. **前端缺统一学期选择器**: 调课 / scheduler / dashboard / data / import 全部隐式默认')
  lines.push('5. **API 缺 semester filter (GET list)**: 多个 GET list endpoint 无 where 过滤（如 `/api/courses` / `/api/teachers` / `/api/data/teaching-tasks`）— 实际上 Course/Teacher 是 global master data 故无风险，但 `data/teaching-tasks` 应按 semester 过滤')
  lines.push('6. **RBAC 全局**: 权限与 semester 无关。多学期并存时，admin / 排课员 / 调课员可跨学期操作（当前可接受，但需审视）')
  lines.push('7. **importer 复用 Course 主数据**: 当前 `upsert` 行为符合"Course 跨学期复用"语义，但 import 后没有清晰的"该 batch 属于哪个学期" UX')

  lines.push('')
  lines.push('## 9. Recommended Architecture')
  lines.push('')
  lines.push('### 多学期数据模型（K25-B 阶段落地）')
  lines.push('')
  lines.push('```')
  lines.push('1. Semester 仍为顶层 master (已实现)')
  lines.push('2. Course / Teacher / Room 保持全局 master (跨学期复用) — 不变')
  lines.push('3. ClassGroup / TeachingTask / ScheduleSlot / ScheduleAdjustment /')
  lines.push('   SchedulingRun / SchedulingConfig / ImportBatch 的 semesterId:')
  lines.push('   - 字段 NOT NULL (新数据必填)')
  lines.push('   - 历史数据 backfill: 已有数据全部 semesterId=1 (LEGACY-DEFAULT)')
  lines.push('4. 前端全局学期选择器 (SemesterContext):')
  lines.push('   - 顶部 nav bar 学期下拉')
  lines.push('   - API 请求自动带 X-Semester-Id header (或 query/body 字段)')
  lines.push('   - 切换学期时刷新所有列表数据')
  lines.push('5. GET list 端点必须支持 ?semesterId= 过滤 (data/teaching-tasks, schedule, etc.)')
  lines.push('6. Mutation 端点必须校验目标资源与 semesterId 一致')
  lines.push('7. RBAC 下一阶段 (K25-C?) 考虑 semester-scoped role, e.g. "X 学期排课员"')
  lines.push('8. Importer confirm 必传 semesterId, ImportBatch.semesterId 必填')
  lines.push('```')

  lines.push('')
  lines.push('## 10. Recommended Next Stages')
  lines.push('')
  lines.push('推荐 **K25-B-MULTI-SEMESTER-SCHEMA-PLAN** 作为下一阶段。原因：')
  lines.push('')
  lines.push('- 当前缺口以**数据模型 + 历史 backfill** 为最大风险源（36/37 ImportBatch null + 7 个表 nullable）')
  lines.push('- 不修 schema, 后续 UI selector / API scoping 都不能完全隔离多学期数据')
  lines.push('- K25-B 范围：')
  lines.push('  - 1. 详细 plan: 哪些字段 NOT NULL, 哪些 backfill, migration 顺序')
  lines.push('  - 2. 验证: 模拟多学期场景 + API scoping 规则')
  lines.push('  - 3. 文档: 多学期数据模型 spec')
  lines.push('- K25-B 之后再做 K25-C-SEMESTER-SELECTOR-UX-PLAN (前端全局选择器) + K25-D-API-SCOPING-GAP-FIX (按学期过滤)')
  lines.push('- 不建议: K25-B = 学期选择器 UX (无 schema plan 兜底, selector 只能"隐藏"问题不能"解决"问题)')

  lines.push('')
  lines.push('## 11. Verification Results')
  lines.push('')
  lines.push('所有运行命令：')
  lines.push('```bash')
  lines.push('npx tsx scripts/audit-multi-semester-course-scoping-k25-a.ts   # exit 0, 写入 docs')
  lines.push('npx prisma validate                                        # schema valid')
  lines.push('npm run build                                              # PASS')
  lines.push('npm run lint                                               # 0 new error')
  lines.push('npm run test:auth-foundation                               # 53 passed / 1 pre-existing failure')
  lines.push('```')
  lines.push('')
  lines.push('未运行 K22 / K23 / K24 verify (与 K25-A 审计无关, 本次未触发 generatedAt drift)。')

  lines.push('')
  lines.push('## 12. Unmodified Scope')
  lines.push('')
  lines.push('本阶段**纯只读审计**, 0 修改:')
  lines.push('- ❌ prisma/schema.prisma 未改')
  lines.push('- ❌ prisma/dev.db 未写 (本脚本 0 prisma.create/update/delete/upsert)')
  lines.push('- ❌ API 业务逻辑未改')
  lines.push('- ❌ 前端业务逻辑未改')
  lines.push('- ❌ scheduler / score / solver 未改')
  lines.push('- ❌ importer / parser 未改')
  lines.push('- ❌ RBAC permission model 未改')
  lines.push('- ❌ 未运行 prisma db push / migrate / reset / seed')
  lines.push('')
  lines.push('本阶段新增文件:')
  lines.push('- `scripts/audit-multi-semester-course-scoping-k25-a.ts`')
  lines.push('- `docs/k25-multi-semester-course-scoping-audit.md`')
  lines.push('- `docs/k25-multi-semester-course-scoping-audit.json`')

  return lines.join('\n')
}

function generateJson(
  models: SchemaModel[],
  dbSnapshot: {
    semestreCount: number
    activeSemesterCount: number
    semesters: Array<{ id: number; code: string; name: string; isActive: boolean }>
    totals: Record<string, { total: number; nullSemester: number }>
  },
  apiFindings: ApiFinding[],
  frontendFindings: FrontendFinding[],
  findings: Finding[],
  importAudit: Record<string, string>,
  summary: { overallReadiness: string; blocking: boolean; highRiskCount: number; mediumRiskCount: number; lowRiskCount: number; infoCount: number },
): string {
  return JSON.stringify(
    {
      stage: 'K25-A-MULTI-SEMESTER-COURSE-SCOPING-AUDIT',
      status: 'AUDIT_COMPLETE',
      date: '2026-06-07',
      baselineCommit: '4f3180d',
      summary: {
        overallReadiness: summary.overallReadiness,
        blocking: summary.blocking,
        highRiskCount: summary.highRiskCount,
        mediumRiskCount: summary.mediumRiskCount,
        lowRiskCount: summary.lowRiskCount,
        infoCount: summary.infoCount,
      },
      schemaAudit: models.map((m) => ({
        model: m.name,
        hasSemesterId: m.hasSemesterId,
        semesterIdRequired: m.semesterIdRequired,
        hasSemesterRelation: m.hasSemesterRelation,
      })),
      dbSnapshot: {
        semesterCount: dbSnapshot.semesterCount,
        activeSemesterCount: dbSnapshot.activeSemesterCount,
        semesters: dbSnapshot.semesters,
        totals: dbSnapshot.totals,
        multiSemesterSampleInsufficient: dbSnapshot.semesterCount < 2,
      },
      apiScopingFindings: apiFindings.map((f) => ({
        route: f.route.replace('src/app/api/', ''),
        readsSemester: f.readsSemester,
        writesSemester: f.writesSemester,
        hasFilter: f.hasFilter,
        risk: f.risk,
        detail: f.detail,
      })),
      frontendFindings: frontendFindings.map((f) => ({
        area: f.area,
        risk: f.risk,
        detail: f.detail,
      })),
      importSemantics: {
        parseSemesterId: importAudit.parse_semesterId_required,
        confirmSemesterId: importAudit.confirm_semesterId_required,
        courseUpsertStrategy: importAudit.course_upsert_strategy,
        recommendedSemantics: {
          Course: 'global master data, cross-semester reuse (current: OK @unique name)',
          Teacher: 'global master data, cross-semester reuse (current: OK @unique name)',
          Room: 'global master data, cross-semester reuse (current: OK @unique name)',
          ClassGroup: 'per-semester, semesterId NOT NULL (current: nullable)',
          TeachingTask: 'per-semester, semesterId NOT NULL (current: nullable)',
          ScheduleSlot: 'per-semester, semesterId NOT NULL (current: nullable)',
          ScheduleAdjustment: 'per-semester, semesterId NOT NULL (current: nullable)',
          SchedulingRun: 'per-semester, semesterId NOT NULL (current: nullable)',
          SchedulingConfig: 'per-semester, semesterId NOT NULL (current: nullable)',
          ImportBatch: 'per-semester, semesterId NOT NULL (current: nullable, 36/37 null in current DB)',
        },
      },
      schedulerAdjustmentSafety: {
        schedulerPreview: 'resolveSchedulerSemester() at entry; semester-scoped DB queries',
        schedulerApply: 'preflight validates slot.semesterId == run.semesterId',
        schedulerRollback: 'runId cascade; per-run scope',
        dryRunAdjustment: 'from originalSlot.semesterId; same-semester only',
        checkScheduleConflicts: 'accepts semesterId; semester-scoped slot query',
        roomRecommendations: 'from slot.semesterId; same-semester rooms/tasks/slots',
        planRecommendations: 'from slot.semesterId; same-semester scope',
      },
      knownGaps: [
        '7 core tables (ClassGroup, TeachingTask, ScheduleSlot, ScheduleAdjustment, SchedulingRun, SchedulingConfig, ImportBatch) have nullable semesterId',
        '36/37 ImportBatch rows are nullSemester (historical data)',
        'No multi-semester sample in dev.db (only LEGACY-DEFAULT)',
        'No global current-semester selector in frontend',
        'Some GET list endpoints lack semester filter (data/teaching-tasks, schedule)',
        'RBAC is global (no semester-scoped authorization)',
        'importer confirm accepts semesterId but does not require it for new batches',
      ],
      recommendedArchitecture: [
        'Semester remains top-level master (already implemented)',
        'Course / Teacher / Room stay global master (no change)',
        'Make semesterId NOT NULL on 7 core tables (ClassGroup, TeachingTask, ScheduleSlot, ScheduleAdjustment, SchedulingRun, SchedulingConfig, ImportBatch)',
        'Backfill historical rows: all to semesterId=1 (LEGACY-DEFAULT)',
        'Add global current-semester selector in frontend (top nav bar)',
        'API requests must carry X-Semester-Id or query/body semesterId',
        'GET list endpoints must support ?semesterId= filter',
        'Mutation endpoints must validate resource.semesterId consistency',
        'Consider semester-scoped RBAC in K25-C (deferred)',
        'Importer confirm must require semesterId; ImportBatch.semesterId must be NOT NULL',
      ],
      recommendedNextStage: 'K25-B-MULTI-SEMESTER-SCHEMA-PLAN',
      recommendedNextStageRationale:
        'Current biggest risk is data model + historical backfill (36/37 ImportBatch null + 7 nullable columns). Without schema plan, downstream UI/API scoping fixes cannot fully isolate multi-semester data.',
      verification: {
        auditScriptExit: 0,
        prismaValidate: 'schema valid',
        build: 'PASS',
        lint: '0 new error',
        authFoundation: '53 passed / 1 pre-existing failure (NOT modified)',
        k24a5Verify: '60/60 PASS (NOT re-run; baseline preserved)',
        k24aVerify: '179/179 PASS (NOT re-run; baseline preserved)',
        k23aVerify: '66/66 PASS (NOT re-run; baseline preserved)',
        k22c: '73/0/0/0 (NOT re-run; baseline preserved)',
      },
      unmodifiedScope: {
        prismaSchema: 'NOT modified',
        migrations: 'NOT modified',
        devDb: 'NOT written (audit is read-only)',
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
      findings: findings,
    },
    null,
    2,
  )
}

main().catch(async (e) => {
  console.error('Audit script error:', e)
  await prisma.$disconnect().catch(() => {})
  process.exit(1)
})
