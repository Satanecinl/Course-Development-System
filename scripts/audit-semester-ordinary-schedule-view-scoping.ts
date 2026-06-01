// scripts/audit-semester-ordinary-schedule-view-scoping.ts
// K10-SEMESTER-ORDINARY-SCHEDULE-SCOPING-AUDIT — read-only audit script
//
// 严格只读：
// - 只扫描文件 (read-only fs)
// - 只读 Prisma count() / findMany() (无写入)
// - 不调用写接口
// - 不修改业务数据
//
// 输出：
// 1) 当前 Semester 状态
// 2) 目标模型 null semesterId 计数
// 3) 普通课表页面扫描
// 4) 普通课表 API 扫描
// 5) 风险分类
// 6) 最终汇总

import { readFileSync, readdirSync, statSync } from 'node:fs'
import { join, relative, extname } from 'node:path'
import { PrismaClient } from '@prisma/client'

const prisma = new PrismaClient()
const ROOT = process.cwd()
const SCAN_DIRS = ['src/app', 'src/components', 'src/lib', 'src/store']

// ── helpers ──────────────────────────────────────────────────────────

function walk(dir: string, out: string[] = []): string[] {
  let entries: string[]
  try {
    entries = readdirSync(dir)
  } catch {
    return out
  }
  for (const e of entries) {
    const p = join(dir, e)
    let s
    try { s = statSync(p) } catch { continue }
    if (s.isDirectory()) {
      // skip node_modules and .next
      if (e === 'node_modules' || e === '.next') continue
      walk(p, out)
    } else if (/\.(ts|tsx)$/.test(e)) {
      out.push(p)
    }
  }
  return out
}

function readSafe(p: string): string {
  try { return readFileSync(p, 'utf8') } catch { return '' }
}

function matchesAny(haystack: string, needles: RegExp[]): boolean {
  return needles.some(n => n.test(haystack))
}

function extractApiCalls(src: string): string[] {
  const m = src.match(/['"`](\/api\/[a-zA-Z0-9_\-\/\?\=\&\{\}\.]+)['"`]/g) ?? []
  return Array.from(new Set(m.map(s => s.replace(/['"`]/g, ''))))
}

function extractPrismaModelCalls(src: string): string[] {
  // Find prisma.<model>.<verb> patterns
  const m = src.match(/prisma\.([a-zA-Z]+)\.(find|findMany|findFirst|findUnique|count|aggregate)\b/g) ?? []
  return Array.from(new Set(m))
}

function pickRisk(level: 'HIGH' | 'MEDIUM' | 'LOW' | 'SCOPED', reasons: string[]): { level: typeof level; reasons: string[] } {
  return { level, reasons }
}

// ── 1) 当前 Semester 状态 ────────────────────────────────────────────

async function reportSemesterState() {
  console.log('═'.repeat(72))
  console.log('1) 当前 Semester 状态')
  console.log('═'.repeat(72))

  const all = await prisma.semester.findMany({
    select: { id: true, code: true, name: true, isActive: true },
    orderBy: { id: 'asc' },
  })
  const active = all.filter(s => s.isActive)
  const legacyDefault = all.find(s => s.code === 'LEGACY-DEFAULT')

  console.log(`Semester count: ${all.length}`)
  console.log(`active Semester count: ${active.length}`)
  console.log(`LEGACY-DEFAULT 存在: ${legacyDefault ? '是' : '否'}`)
  for (const s of all) {
    console.log(`  - id=${s.id} code=${s.code} name=${s.name} isActive=${s.isActive}`)
  }
  return { all, active, legacyDefault }
}

async function reportNullSemesterCounts() {
  console.log('')
  console.log('═'.repeat(72))
  console.log('2) 目标模型回填状态 (null semesterId 计数)')
  console.log('═'.repeat(72))

  const result: Record<string, number> = {}
  result['ClassGroup'] = await prisma.classGroup.count({ where: { semesterId: null } })
  result['TeachingTask'] = await prisma.teachingTask.count({ where: { semesterId: null } })
  result['ScheduleSlot'] = await prisma.scheduleSlot.count({ where: { semesterId: null } })
  result['ScheduleAdjustment'] = await prisma.scheduleAdjustment.count({ where: { semesterId: null } })
  result['SchedulingRun'] = await prisma.schedulingRun.count({ where: { semesterId: null } })
  for (const [model, n] of Object.entries(result)) {
    console.log(`  ${model.padEnd(20)} null semesterId: ${n}`)
  }
  return result
}

// ── 3) 普通课表页面扫描 ──────────────────────────────────────────────

interface PageScanRow {
  path: string
  userType: string
  apiCalls: string[]
  hasScheduleKeyword: boolean
  passesSemesterId: boolean
  dependsOnScopedSchedule: boolean
  hasDirectPrisma: boolean
  risk: 'HIGH' | 'MEDIUM' | 'LOW' | 'SCOPED'
  reasons: string[]
}

const SCHEDULE_KEYWORDS: RegExp[] = [
  /schedule/i, /timetable/i, /calendar/i, /课表/, /课程表/, /我的课表/, /班级课表/, /教师课表/, /教室课表/,
]

function scanPages(): PageScanRow[] {
  console.log('')
  console.log('═'.repeat(72))
  console.log('3) 普通课表页面/组件扫描')
  console.log('═'.repeat(72))

  const files = SCAN_DIRS.flatMap(d => walk(join(ROOT, d)))
  const pageFiles = files.filter(f => {
    const rel = relative(ROOT, f).replace(/\\/g, '/')
    return (
      rel.startsWith('src/app/') ||
      rel.startsWith('src/components/') ||
      rel.startsWith('src/store/')
    )
  })

  const rows: PageScanRow[] = []
  for (const f of pageFiles) {
    const src = readSafe(f)
    if (!src) continue
    const hasScheduleKeyword = matchesAny(src, SCHEDULE_KEYWORDS)
    if (!hasScheduleKeyword) continue

    const rel = relative(ROOT, f)
    const apiCalls = extractApiCalls(src)
    const prismaCalls = extractPrismaModelCalls(src)
    const hasDirectPrisma = prismaCalls.length > 0

    // Only consider "ordinary" schedule view pages (exclude admin/scheduler pages)
    const isAdmin = /admin\/scheduler|admin\/import|admin\/db|admin\/rooms/.test(rel)
    if (isAdmin) continue

    // Whether this page passes semesterId query string
    const passesSemesterId = /semesterId\s*[:=]/.test(src) || /params\.set\(['"]semesterId['"]/.test(src) || /searchParams\.get\(['"]semesterId['"]/.test(src)
    // Whether this page calls /api/schedule
    const dependsOnScopedSchedule = apiCalls.some(a => a.startsWith('/api/schedule'))

    // User type heuristic
    let userType = '普通用户/管理员'
    if (/admin\/|schedule:adjust/.test(src)) userType = '管理员'
    else if (/dashboard/.test(rel)) userType = '普通用户/管理员'
    else if (/data\b/.test(rel)) userType = '普通用户'
    else if (/api\//.test(rel)) userType = 'API endpoint'

    // Risk classification
    let risk: 'HIGH' | 'MEDIUM' | 'LOW' | 'SCOPED' = 'LOW'
    const reasons: string[] = []

    if (dependsOnScopedSchedule || (apiCalls.some(a => a.startsWith('/api/schedule?')) || apiCalls.includes('/api/schedule'))) {
      risk = 'SCOPED'
      reasons.push('reuses /api/schedule (already scoped via resolveSchedulerSemester)')
    } else if (hasDirectPrisma) {
      // Direct Prisma access in a page/component is unusual — flag
      risk = 'MEDIUM'
      reasons.push(`direct Prisma calls: ${prismaCalls.slice(0, 3).join(', ')}`)
    } else if (passesSemesterId) {
      risk = 'SCOPED'
      reasons.push('passes semesterId query param')
    } else if (apiCalls.length > 0) {
      // Calls other APIs but not /api/schedule — depends on backend scoping
      risk = 'LOW'
      reasons.push(`calls: ${apiCalls.slice(0, 4).join(', ')}`)
    } else {
      risk = 'LOW'
      reasons.push('no schedule API call detected')
    }

    rows.push({
      path: rel,
      userType,
      apiCalls,
      hasScheduleKeyword,
      passesSemesterId,
      dependsOnScopedSchedule,
      hasDirectPrisma,
      risk,
      reasons,
    })
  }

  // Print table
  for (const r of rows) {
    console.log('')
    console.log(`  ${r.path}`)
    console.log(`    userType:           ${r.userType}`)
    console.log(`    apiCalls:           ${r.apiCalls.join(', ') || '(none)'}`)
    console.log(`    dependsOnSchedule:  ${r.dependsOnScopedSchedule}`)
    console.log(`    passesSemesterId:   ${r.passesSemesterId}`)
    console.log(`    hasDirectPrisma:    ${r.hasDirectPrisma}`)
    console.log(`    RISK:               ${r.risk}`)
    for (const rs of r.reasons) console.log(`      - ${rs}`)
  }
  return rows
}

// ── 4) 普通课表 API 扫描 ──────────────────────────────────────────────

interface ApiScanRow {
  path: string
  methods: string[]
  modelsRead: string[]
  semesterScoped: boolean
  usesActiveSemesterHelper: boolean
  hasPermissionGuard: boolean
  risk: 'HIGH' | 'MEDIUM' | 'LOW' | 'SCOPED'
  reasons: string[]
}

// APIs that are part of the "ordinary schedule view" surface
const TARGET_API_PATTERNS = [
  /\/api\/schedule(\/|$)/,
  /\/api\/schedule-slot/,
  /\/api\/schedule-adjustments/,
  /\/api\/teaching-task/,
  /\/api\/class-groups/,
  /\/api\/entity-list/,
  /\/api\/conflict-check/,
  /\/api\/data\//,
  /\/api\/rooms/,
  /\/api\/teachers/,
  /\/api\/courses/,
  /\/api\/export/,
]

const SEMESTER_BOUND_MODELS = [
  'classGroup', 'teachingTask', 'scheduleSlot', 'scheduleAdjustment',
  'schedulingRun', 'teachingTaskClass',
]

const GLOBAL_MODELS = ['room', 'teacher', 'course', 'user', 'role', 'permission']

function scanApis(): ApiScanRow[] {
  console.log('')
  console.log('═'.repeat(72))
  console.log('4) 普通课表 API 扫描')
  console.log('═'.repeat(72))

  const apiRoot = join(ROOT, 'src/app/api')
  const apiFiles = walk(apiRoot).filter(f => f.endsWith('route.ts') || f.endsWith('route.tsx'))

  const rows: ApiScanRow[] = []
  for (const f of apiFiles) {
    const rel = relative(ROOT, f).replace(/\\/g, '/')
    if (!TARGET_API_PATTERNS.some(p => p.test('/' + rel))) continue

    const src = readSafe(f)
    if (!src) continue

    // HTTP methods present
    const methods: string[] = []
    if (/export\s+async\s+function\s+GET\b/.test(src)) methods.push('GET')
    if (/export\s+async\s+function\s+POST\b/.test(src)) methods.push('POST')
    if (/export\s+async\s+function\s+PUT\b/.test(src)) methods.push('PUT')
    if (/export\s+async\s+function\s+PATCH\b/.test(src)) methods.push('PATCH')
    if (/export\s+async\s+function\s+DELETE\b/.test(src)) methods.push('DELETE')

    // Prisma models read
    const prismaCalls = extractPrismaModelCalls(src)
    const modelsRead = Array.from(new Set(prismaCalls.map(c => c.split('.')[1] || '')))

    // Does it use resolveSchedulerSemester helper?
    const usesActiveSemesterHelper = /resolveSchedulerSemester\s*\(/.test(src)

    // Does it pass semesterId / scope by semesterId?
    const semesterScoped =
      /semesterId\s*:\s*semester\.id/.test(src) ||
      /where\s*:\s*\{\s*semesterId/.test(src) ||
      /getEffectiveScheduleForWeek\s*\(/.test(src) ||
      usesActiveSemesterHelper

    // Does it have permission guard?
    const hasPermissionGuard = /requirePermission\s*\(/.test(src)

    // Risk classification
    let risk: 'HIGH' | 'MEDIUM' | 'LOW' | 'SCOPED' = 'LOW'
    const reasons: string[] = []

    if (!hasPermissionGuard) {
      risk = 'HIGH'
      reasons.push('NO requirePermission guard — anonymous or unauthenticated access possible')
    } else {
      // Permission guard present — check scoping
      const readsSemesterBound = modelsRead.some(m => SEMESTER_BOUND_MODELS.includes(m))
      if (!readsSemesterBound) {
        // Reads only global models or no model at all
        if (modelsRead.some(m => GLOBAL_MODELS.includes(m))) {
          risk = 'SCOPED'
          reasons.push('reads only global models (room/teacher/course) — semester scope not required')
        } else {
          risk = 'SCOPED'
          reasons.push('no semester-bound model reads detected')
        }
      } else if (semesterScoped) {
        risk = 'SCOPED'
        reasons.push('uses resolveSchedulerSemester or explicit semesterId filter')
      } else {
        risk = 'MEDIUM'
        reasons.push(`reads semester-bound models (${modelsRead.filter(m => SEMESTER_BOUND_MODELS.includes(m)).join(', ')}) without semesterId filter`)
      }
    }

    rows.push({
      path: rel,
      methods,
      modelsRead,
      semesterScoped,
      usesActiveSemesterHelper,
      hasPermissionGuard,
      risk,
      reasons,
    })
  }

  // Sort: HIGH → MEDIUM → LOW → SCOPED
  const order = { HIGH: 0, MEDIUM: 1, LOW: 2, SCOPED: 3 }
  rows.sort((a, b) => order[a.risk] - order[b.risk])

  for (const r of rows) {
    console.log('')
    console.log(`  ${r.path}`)
    console.log(`    methods:             ${r.methods.join(', ') || '(none)'}`)
    console.log(`    modelsRead:          ${r.modelsRead.join(', ') || '(none)'}`)
    console.log(`    semesterScoped:      ${r.semesterScoped}`)
    console.log(`    usesActiveHelper:    ${r.usesActiveSemesterHelper}`)
    console.log(`    hasPermissionGuard:  ${r.hasPermissionGuard}`)
    console.log(`    RISK:                ${r.risk}`)
    for (const rs of r.reasons) console.log(`      - ${rs}`)
  }
  return rows
}

// ── 5) 风险汇总 ──────────────────────────────────────────────────────

function summarize(pages: PageScanRow[], apis: ApiScanRow[]) {
  console.log('')
  console.log('═'.repeat(72))
  console.log('5) 风险汇总')
  console.log('═'.repeat(72))

  const pageRisks = { HIGH: 0, MEDIUM: 0, LOW: 0, SCOPED: 0 }
  for (const p of pages) pageRisks[p.risk]++

  const apiRisks = { HIGH: 0, MEDIUM: 0, LOW: 0, SCOPED: 0 }
  for (const a of apis) apiRisks[a.risk]++

  console.log('Pages:')
  console.log(`  total: ${pages.length}`)
  console.log(`  HIGH: ${pageRisks.HIGH}, MEDIUM: ${pageRisks.MEDIUM}, LOW: ${pageRisks.LOW}, SCOPED: ${pageRisks.SCOPED}`)

  console.log('APIs:')
  console.log(`  total: ${apis.length}`)
  console.log(`  HIGH: ${apiRisks.HIGH}, MEDIUM: ${apiRisks.MEDIUM}, LOW: ${apiRisks.LOW}, SCOPED: ${apiRisks.SCOPED}`)

  const highRisks = pageRisks.HIGH + apiRisks.HIGH
  const mediumRisks = pageRisks.MEDIUM + apiRisks.MEDIUM
  const lowWarnings = pageRisks.LOW + apiRisks.LOW
  const scopedPaths = pageRisks.SCOPED + apiRisks.SCOPED

  console.log('')
  console.log('Combined:')
  console.log(`  high risks:        ${highRisks}`)
  console.log(`  medium risks:      ${mediumRisks}`)
  console.log(`  low warnings:      ${lowWarnings}`)
  console.log(`  scoped paths:      ${scopedPaths}`)

  console.log('')
  console.log('Recommended next phase:')
  if (highRisks > 0) {
    console.log('  K10-SEMESTER-ORDINARY-SCHEDULE-SCOPING-FIX (HIGH risks must be fixed first)')
  } else if (mediumRisks > 0) {
    console.log('  K10-SEMESTER-ORDINARY-SCHEDULE-SCOPING-FIX (MEDIUM risks present)')
  } else {
    console.log('  Ordinary schedule view paths appear well-scoped. Next: K10-SEMESTER-IMPORT-SCOPING-AUDIT')
  }
}

// ── main ─────────────────────────────────────────────────────────────

async function main() {
  try {
    await reportSemesterState()
    await reportNullSemesterCounts()
    const pages = scanPages()
    const apis = scanApis()
    summarize(pages, apis)
    console.log('')
    console.log('═'.repeat(72))
    console.log('Audit complete (READ-ONLY). No data was modified.')
    console.log('═'.repeat(72))
  } catch (err) {
    console.error('Audit script error:', err)
    process.exitCode = 1
  } finally {
    await prisma.$disconnect()
  }
}

main()
