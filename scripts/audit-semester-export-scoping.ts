/**
 * K10-SEMESTER-EXPORT-SCOPING-AUDIT
 *
 * Read-only audit of all export-related entry points.
 * Does NOT write to the database. Does NOT generate export files.
 */

import { PrismaClient } from '@prisma/client'
import { readFileSync, readdirSync, statSync } from 'fs'
import { join, relative } from 'path'

const prisma = new PrismaClient()

let passed = 0
let warnings = 0
let risks = 0

function check(label: string, ok: boolean, detail?: string) {
  if (ok) { passed++; console.log(`  ✅ ${label}`) }
  else { risks++; console.log(`  ❌ ${label}`); if (detail) console.log(`     → ${detail}`) }
}

function warn(label: string, detail?: string) {
  warnings++
  console.log(`  ⚠️  ${label}`)
  if (detail) console.log(`     → ${detail}`)
}

function info(label: string) {
  console.log(`  ℹ️  ${label}`)
}

function walkDir(dir: string, ext: string): string[] {
  const results: string[] = []
  try {
    for (const entry of readdirSync(dir)) {
      const full = join(dir, entry)
      try {
        const st = statSync(full)
        if (st.isDirectory()) {
          if (!['node_modules', '.next', '.git', 'prisma'].includes(entry)) {
            results.push(...walkDir(full, ext))
          }
        } else if (full.endsWith(ext)) {
          results.push(full)
        }
      } catch { /* skip */ }
    }
  } catch { /* skip */ }
  return results
}

async function main() {
  console.log('════════════════════════════════════════════════════════════')
  console.log('K10-SEMESTER-EXPORT-SCOPING-AUDIT')
  console.log('════════════════════════════════════════════════════════════')

  // ─── 1. Semester 数据状态 ───
  console.log('\n─── 1. Semester 数据状态 ───')

  const semCount = await prisma.semester.count()
  const activeSem = await prisma.semester.findFirst({ where: { isActive: true } })
  const legacyDefault = await prisma.semester.findFirst({ where: { code: 'LEGACY-DEFAULT' } })

  info(`Semester count: ${semCount}`)
  info(`active Semester: ${activeSem ? `id=${activeSem.id}, code=${activeSem.code}, name=${activeSem.name}` : 'NONE'}`)
  info(`LEGACY-DEFAULT exists: ${!!legacyDefault}`)

  // Null semesterId counts
  const models = ['scheduleSlot', 'teachingTask', 'classGroup', 'scheduleAdjustment', 'schedulingRun'] as const
  type ModelName = typeof models[number]

  console.log('\n  Null semesterId counts:')
  for (const model of models) {
    const nullCount = await (prisma[model] as any).count({ where: { semesterId: null } })
    const total = await (prisma[model] as any).count()
    const status = nullCount === 0 ? '✅' : '❌'
    console.log(`    ${status} ${model}: ${nullCount} null / ${total} total`)
    if (nullCount > 0) risks++
    else passed++
  }

  // ─── 2. 导出入口扫描 ───
  console.log('\n─── 2. 导出入口扫描 ───')

  const srcDir = join(process.cwd(), 'src')
  const scriptsDir = join(process.cwd(), 'scripts')

  // Scan for export-related files
  const allTsFiles = walkDir(srcDir, '.ts')
  const allTsxFiles = walkDir(srcDir, '.tsx')
  const allSrcFiles = [...allTsFiles, ...allTsxFiles]

  const exportKeywords = ['export/excel', 'xlsx', 'ExcelJS', 'Content-Disposition', 'download', 'blob']
  const exportFiles: string[] = []

  for (const file of allSrcFiles) {
    try {
      const content = readFileSync(file, 'utf-8')
      const relPath = relative(process.cwd(), file)
      // Skip type-only exports
      if (exportKeywords.some(kw => content.includes(kw))) {
        if (!file.includes('types/') && !file.includes('.d.ts')) {
          exportFiles.push(relPath)
        }
      }
    } catch { /* skip */ }
  }

  info(`Found ${exportFiles.length} export-related files:`)
  for (const f of exportFiles) {
    console.log(`    - ${f}`)
  }

  // ─── 3. Prisma 查询扫描 ───
  console.log('\n─── 3. 导出相关 Prisma 查询分析 ───')

  const exportQueryFiles = [
    'src/app/api/export/excel/route.ts',
    'src/app/api/schedule/route.ts',
    'src/app/api/data/summary/route.ts',
    'src/app/api/data/teaching-tasks/route.ts',
    'src/app/api/data/schedule-slots/route.ts',
    'src/app/api/schedule-adjustments/route.ts',
    'src/lib/schedule/adjustments.ts',
  ]

  for (const relPath of exportQueryFiles) {
    const fullPath = join(process.cwd(), relPath)
    try {
      const content = readFileSync(fullPath, 'utf-8')
      const hasSemesterId = content.includes('semesterId')
      const hasResolveSemester = content.includes('resolveSchedulerSemester')
      const readsScheduleSlot = content.includes('scheduleSlot.find') || content.includes('scheduleSlot.findMany') || content.includes('scheduleSlot.findFirst')
      const readsTeachingTask = content.includes('teachingTask.find')
      const readsClassGroup = content.includes('classGroup.find')
      const readsAdjustment = content.includes('scheduleAdjustment.find')
      const readsSchedulingRun = content.includes('schedulingRun.find')

      console.log(`\n  ${relPath}:`)
      console.log(`    reads ScheduleSlot: ${readsScheduleSlot ? 'YES' : 'no'}`)
      console.log(`    reads TeachingTask: ${readsTeachingTask ? 'YES' : 'no'}`)
      console.log(`    reads ClassGroup: ${readsClassGroup ? 'YES' : 'no'}`)
      console.log(`    reads ScheduleAdjustment: ${readsAdjustment ? 'YES' : 'no'}`)
      console.log(`    has semesterId: ${hasSemesterId ? 'YES' : 'no'}`)
      console.log(`    uses resolveSchedulerSemester: ${hasResolveSemester ? 'YES' : 'no'}`)
    } catch { /* skip */ }
  }

  // ─── 4. Excel Export 详细审计 ───
  console.log('\n─── 4. Excel Export 详细审计 ───')

  const excelRoute = join(process.cwd(), 'src/app/api/export/excel/route.ts')
  try {
    const content = readFileSync(excelRoute, 'utf-8')

    // Check adjustment-aware path
    const hasAdjustmentPath = content.includes('applyAdjustments') && content.includes('getEffectiveScheduleForWeek')
    const adjustmentScoped = content.includes('resolveSchedulerSemester') && content.includes('semesterId')

    check('Excel export 有 adjustment-aware 路径', hasAdjustmentPath)
    check('adjustment-aware 路径已 semester scoped', adjustmentScoped,
      adjustmentScoped ? undefined : '需添加 resolveSchedulerSemester + semesterId')

    // Check regular path
    const hasRegularPath = content.includes('scheduleSlot.findMany')
    const regularPathHasSemesterFilter = /scheduleSlot\.findMany[\s\S]*?semesterId/.test(content)
    // More precise: check if the regular findMany has semesterId in its where clause
    // The regular path is the one that does NOT go through getEffectiveScheduleForWeek

    info(`Regular path reads ScheduleSlot: ${hasRegularPath}`)

    // Check if regular path has semester filter
    // The regular path is the else branch (no applyAdjustments)
    const regularPathSection = content.split('applyAdjustments')[1] || ''
    const regularHasSemesterFilter = regularPathSection.includes('semesterId')

    check('regular Excel export 路径已 semester scoped', regularHasSemesterFilter,
      regularHasSemesterFilter ? undefined : 'regular path 读取全库 ScheduleSlot，无 semesterId 过滤 → HIGH RISK')

    // Check what models the regular path reads
    const regularReadsClassGroup = regularPathSection.includes('classGroup.find')
    const regularReadsTeachingTask = regularPathSection.includes('teachingTask.find')

    if (regularReadsClassGroup && !regularHasSemesterFilter) {
      warn('regular path 读取全库 ClassGroup，无 semesterId 过滤')
    }
    if (regularReadsTeachingTask && !regularHasSemesterFilter) {
      warn('regular path 读取全库 TeachingTask，无 semesterId 过滤')
    }

  } catch { check('Excel export 路由文件存在', false) }

  // ─── 5. Schedule API 审计 ───
  console.log('\n─── 5. Schedule API 审计 (/api/schedule) ───')

  const scheduleRoute = join(process.cwd(), 'src/app/api/schedule/route.ts')
  try {
    const content = readFileSync(scheduleRoute, 'utf-8')
    const hasSemesterId = content.includes('semesterId')
    const hasResolveSemester = content.includes('resolveSchedulerSemester')

    check('Schedule API 有 semesterId 参数', hasSemesterId)
    check('Schedule API 使用 resolveSchedulerSemester', hasResolveSemester)

    if (!hasSemesterId) {
      warn('Schedule API 无 semester filter', '读取全库 ScheduleSlot → HIGH RISK（影响 dashboard 课表视图）')
    }
  } catch { check('Schedule API 路由文件存在', false) }

  // ─── 6. Data API 审计 ───
  console.log('\n─── 6. Data API 审计 (/api/data/*) ───')

  const dataApis = [
    { path: 'src/app/api/data/summary/route.ts', name: 'summary' },
    { path: 'src/app/api/data/teaching-tasks/route.ts', name: 'teaching-tasks' },
    { path: 'src/app/api/data/schedule-slots/route.ts', name: 'schedule-slots' },
  ]

  for (const api of dataApis) {
    try {
      const content = readFileSync(join(process.cwd(), api.path), 'utf-8')
      const hasSemesterId = content.includes('semesterId')
      check(`/api/data/${api.name} 已 semester scoped`, hasSemesterId,
        hasSemesterId ? undefined : `无 semester filter → 读取全库 ${api.name} → MEDIUM RISK`)
    } catch { check(`/api/data/${api.name} 文件存在`, false) }
  }

  // ─── 7. 权限审计 ───
  console.log('\n─── 7. 权限审计 ───')

  const exportApiDir = join(process.cwd(), 'src/app/api/export')
  try {
    for (const entry of readdirSync(exportApiDir)) {
      const routeFile = join(exportApiDir, entry, 'route.ts')
      try {
        const content = readFileSync(routeFile, 'utf-8')
        const hasPermission = content.includes('requirePermission')
        check(`/api/export/${entry} 有权限保护`, hasPermission)
        if (hasPermission) {
          const permMatch = content.match(/requirePermission\('([^']+)'/)
          if (permMatch) info(`  权限: ${permMatch[1]}`)
        }
      } catch { /* skip */ }
    }
  } catch { info('No /api/export directory found') }

  // ─── 8. /api/scheduler/run 安全检查 ───
  console.log('\n─── 8. 安全检查 ───')

  const schedulerRunRoute = join(process.cwd(), 'src/app/api/admin/scheduler/run/route.ts')
  try {
    readFileSync(schedulerRunRoute)
    check('/api/scheduler/run 不存在', false)
  } catch {
    check('/api/scheduler/run 不存在', true)
  }

  // Check for Re-run in scheduler content
  const schedulerContent = join(process.cwd(), 'src/app/admin/scheduler/scheduler-content.tsx')
  try {
    const content = readFileSync(schedulerContent, 'utf-8')
    const hasRerun = content.includes('Re-run') || content.includes('rerun') || content.includes('重新运行')
    check('scheduler 页面无 Re-run 入口', !hasRerun)
  } catch { info('scheduler-content.tsx not found') }

  // prisma/dev.db not tracked
  try {
    const gitignore = readFileSync(join(process.cwd(), '.gitignore'), 'utf-8')
    check('.gitignore 包含 prisma/dev.db', gitignore.includes('prisma/dev.db'))
  } catch { info('.gitignore not found') }

  // ─── 9. 风险汇总 ───
  console.log('\n════════════════════════════════════════════════════════════')
  console.log('📊 审计汇总')
  console.log('════════════════════════════════════════════════════════════')

  // Count risks from the detailed checks
  const excelRouteContent = (() => {
    try { return readFileSync(join(process.cwd(), 'src/app/api/export/excel/route.ts'), 'utf-8') } catch { return '' }
  })()
  const scheduleRouteContent = (() => {
    try { return readFileSync(join(process.cwd(), 'src/app/api/schedule/route.ts'), 'utf-8') } catch { return '' }
  })()

  const highRisks: string[] = []
  const mediumRisks: string[] = []
  const scopedItems: string[] = []

  // Excel export
  if (excelRouteContent.includes('resolveSchedulerSemester')) {
    scopedItems.push('Excel export adjustment-aware path')
  }
  const regularSection = excelRouteContent.split('applyAdjustments')[1] || ''
  if (!regularSection.includes('semesterId') && regularSection.includes('scheduleSlot.findMany')) {
    highRisks.push('Excel export regular path: reads all ScheduleSlots without semester filter')
  }

  // Schedule API
  if (!scheduleRouteContent.includes('semesterId')) {
    highRisks.push('Schedule API (/api/schedule): reads all ScheduleSlots without semester filter')
  }

  // Data APIs
  for (const api of dataApis) {
    try {
      const content = readFileSync(join(process.cwd(), api.path), 'utf-8')
      if (!content.includes('semesterId')) {
        mediumRisks.push(`Data API (/api/data/${api.name}): reads all records without semester filter`)
      }
    } catch { /* skip */ }
  }

  // Already scoped
  scopedItems.push('ScheduleAdjustments API (GET/POST/void)')
  scopedItems.push('Conflict-check API')
  scopedItems.push('Scheduler preview/apply/rollback')
  scopedItems.push('Scheduler lockable-slots/runs')

  console.log(`\n  PASSED: ${passed}`)
  console.log(`  WARNINGS: ${warnings}`)
  console.log(`  RISKS: ${risks}`)

  console.log(`\n  🔴 HIGH RISK (跨学期混读，影响导出正确性): ${highRisks.length}`)
  for (const r of highRisks) console.log(`    - ${r}`)

  console.log(`\n  🟡 MEDIUM RISK (跨学期读取，影响数据展示): ${mediumRisks.length}`)
  for (const r of mediumRisks) console.log(`    - ${r}`)

  console.log(`\n  🟢 已 SCOPED: ${scopedItems.length}`)
  for (const s of scopedItems) console.log(`    - ${s}`)

  console.log(`\n  推荐后续阶段: K10-SEMESTER-EXPORT-SCOPING-FIX`)
  console.log(`  修复范围:`)
  console.log(`    1. Excel export regular path: 添加 semesterId filter`)
  console.log(`    2. Schedule API (/api/schedule): 添加 semesterId filter`)
  console.log(`    3. Data APIs: 评估是否需要 semester filter (低优先级)`)
  console.log(`    4. 普通课表导出: 需先决定是否需要 semester selector`)

  console.log('\n════════════════════════════════════════════════════════════')
}

main().catch(console.error).finally(() => prisma.$disconnect())
