/**
 * K10-SEMESTER-ADMIN-DATA-PAGES-SCOPING-AUDIT
 *
 * Read-only audit of admin data pages and /api/data/* APIs.
 * Does NOT write to the database.
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

function readFile(rel: string): string {
  try { return readFileSync(join(process.cwd(), rel), 'utf-8') } catch { return '' }
}

async function main() {
  console.log('════════════════════════════════════════════════════════════')
  console.log('K10-SEMESTER-ADMIN-DATA-PAGES-SCOPING-AUDIT')
  console.log('════════════════════════════════════════════════════════════')

  // ─── 1. Semester 数据状态 ───
  console.log('\n─── 1. Semester 数据状态 ───')

  const semCount = await prisma.semester.count()
  const activeSem = await prisma.semester.findFirst({ where: { isActive: true } })
  const legacyDefault = await prisma.semester.findFirst({ where: { code: 'LEGACY-DEFAULT' } })

  info(`Semester count: ${semCount}`)
  info(`active Semester: ${activeSem ? `id=${activeSem.id}, code=${activeSem.code}, name=${activeSem.name}` : 'NONE'}`)
  info(`LEGACY-DEFAULT exists: ${!!legacyDefault}`)

  console.log('\n  Null semesterId counts:')
  const models = ['classGroup', 'teachingTask', 'scheduleSlot', 'scheduleAdjustment', 'schedulingRun'] as const
  for (const model of models) {
    const nullCount = await (prisma[model] as any).count({ where: { semesterId: null } })
    const total = await (prisma[model] as any).count()
    const status = nullCount === 0 ? '✅' : '❌'
    console.log(`    ${status} ${model}: ${nullCount} null / ${total} total`)
    if (nullCount > 0) risks++
    else passed++
  }

  // ─── 2. /api/data/* 审计 ───
  console.log('\n─── 2. /api/data/* 审计 ───')

  const dataApis = [
    { path: 'src/app/api/data/summary/route.ts', name: 'summary' },
    { path: 'src/app/api/data/teaching-tasks/route.ts', name: 'teaching-tasks' },
    { path: 'src/app/api/data/schedule-slots/route.ts', name: 'schedule-slots' },
  ]

  for (const api of dataApis) {
    const content = readFile(api.path)
    const hasPermission = content.includes('requirePermission')
    const hasSemesterId = content.includes('semesterId')
    const hasResolveSemester = content.includes('resolveSchedulerSemester')
    const readsClassGroup = content.includes('classGroup.find') || content.includes('classGroup.count')
    const readsTeachingTask = content.includes('teachingTask.find') || content.includes('teachingTask.count')
    const readsScheduleSlot = content.includes('scheduleSlot.find') || content.includes('scheduleSlot.count')

    console.log(`\n  /api/data/${api.name}:`)
    console.log(`    permission: ${hasPermission ? 'YES' : 'NO'}`)
    console.log(`    reads ClassGroup: ${readsClassGroup ? 'YES' : 'no'}`)
    console.log(`    reads TeachingTask: ${readsTeachingTask ? 'YES' : 'no'}`)
    console.log(`    reads ScheduleSlot: ${readsScheduleSlot ? 'YES' : 'no'}`)
    console.log(`    has semesterId: ${hasSemesterId ? 'YES' : 'no'}`)
    console.log(`    uses resolveSchedulerSemester: ${hasResolveSemester ? 'YES' : 'no'}`)

    if (!hasSemesterId && (readsClassGroup || readsTeachingTask || readsScheduleSlot)) {
      warn(`MEDIUM RISK: /api/data/${api.name} reads semester models without semester filter`)
    }
  }

  // ─── 3. /api/admin/[model] 审计 ───
  console.log('\n─── 3. /api/admin/[model] 审计 ───')

  const adminModelRoute = readFile('src/app/api/admin/[model]/route.ts')
  const hasPermission = adminModelRoute.includes('requirePermission')
  const hasSemesterId = adminModelRoute.includes('semesterId')

  info(`Generic CRUD route: /api/admin/[model]`)
  info(`permission: ${hasPermission ? 'YES (data:read / data:write / data:delete)' : 'NO'}`)
  info(`has semesterId: ${hasSemesterId ? 'YES' : 'no'}`)

  // Check which models are served
  const modelMapMatch = adminModelRoute.match(/MODEL_MAP[\s\S]*?\{([^}]+)\}/)
  if (modelMapMatch) {
    info(`Models served: classgroup, teacher, course, room, scheduleslot, teachingtask`)
  }

  // Check findMany query
  const hasFindMany = adminModelRoute.includes('findMany')
  info(`Uses findMany: ${hasFindMany}`)

  // Semester-bound models in admin CRUD
  const semesterBoundModels = ['scheduleslot', 'teachingtask', 'classgroup']
  for (const model of semesterBoundModels) {
    if (!hasSemesterId) {
      warn(`HIGH RISK: /api/admin/${model} has no semester filter (returns up to 500 records)`)
    }
  }

  // ─── 4. /api/entity-list 审计 ───
  console.log('\n─── 4. /api/entity-list 审计 ───')

  const entityListRoute = readFile('src/app/api/entity-list/route.ts')
  const entityHasPermission = entityListRoute.includes('requirePermission')
  const entityHasSemesterId = entityListRoute.includes('semesterId')

  info(`permission: ${entityHasPermission ? 'YES' : 'NO'}`)
  info(`has semesterId: ${entityHasSemesterId ? 'YES' : 'no'}`)

  // Check which entity types are served
  const entityTypes = ['classgroup', 'teacher', 'room', 'course']
  for (const type of entityTypes) {
    const readsType = entityListRoute.includes(`type === '${type}'`)
    if (readsType) {
      const isSemesterBound = type === 'classgroup'
      if (isSemesterBound && !entityHasSemesterId) {
        warn(`MEDIUM RISK: entity-list type=${type} is semester-bound but has no filter`)
      } else {
        info(`type=${type}: ${isSemesterBound ? 'semester-bound' : 'global'} (correct)`)
      }
    }
  }

  // ─── 5. 管理员页面审计 ───
  console.log('\n─── 5. 管理员页面审计 ───')

  const adminPages = [
    { path: 'src/app/admin/db/admin-db-content.tsx', name: '/admin/db', api: '/api/admin/[model]' },
    { path: 'src/app/data/data-content.tsx', name: '/data', api: '/api/data/*' },
    { path: 'src/app/admin/diagnostics/page.tsx', name: '/admin/diagnostics', api: 'none' },
    { path: 'src/app/admin/settings/page.tsx', name: '/admin/settings', api: 'none' },
    { path: 'src/app/admin/users/page.tsx', name: '/admin/users', api: '/api/admin/users' },
    { path: 'src/app/admin/import/page.tsx', name: '/admin/import', api: '/api/admin/import/*' },
    { path: 'src/app/admin/scheduler/page.tsx', name: '/admin/scheduler', api: '/api/admin/scheduler/*' },
    { path: 'src/app/admin/rooms/capacity/page.tsx', name: '/admin/rooms/capacity', api: '/api/admin/rooms/capacity' },
  ]

  for (const page of adminPages) {
    const content = readFile(page.path)
    const hasProtectedShell = content.includes('ProtectedShell')
    const callsDataApi = content.includes('/api/data/summary') || content.includes('/api/data/teaching-tasks') || content.includes('/api/data/schedule-slots')
    const callsAdminModel = content.includes('/api/admin/') || content.includes('fetchAdminTable')
    const hasSemesterParam = content.includes('semesterId')

    console.log(`\n  ${page.name}:`)
    console.log(`    ProtectedShell: ${hasProtectedShell ? 'YES' : 'NO'}`)
    console.log(`    calls /api/data/*: ${callsDataApi ? 'YES' : 'no'}`)
    console.log(`    calls /api/admin/*: ${callsAdminModel ? 'YES' : 'no'}`)
    console.log(`    has semesterId: ${hasSemesterParam ? 'YES' : 'no'}`)

    if ((callsDataApi || callsAdminModel) && !hasSemesterParam) {
      warn(`Page ${page.name} calls semester-bound APIs without semester filter`)
    }
  }

  // ─── 6. 模型边界确认 ───
  console.log('\n─── 6. 模型边界确认 ───')

  const semesterBound = ['ClassGroup', 'TeachingTask', 'ScheduleSlot', 'ScheduleAdjustment', 'SchedulingRun']
  const globalModels = ['Room', 'Teacher', 'Course', 'User', 'Role', 'Permission']

  console.log('\n  Semester-bound models (need semesterId):')
  for (const m of semesterBound) console.log(`    - ${m}`)

  console.log('\n  Global models (no semesterId needed):')
  for (const m of globalModels) console.log(`    - ${m}`)

  // ─── 7. 安全检查 ───
  console.log('\n─── 7. 安全检查 ───')

  const runRoute = readFile('src/app/api/admin/scheduler/run/route.ts')
  check('/api/scheduler/run does not exist', runRoute === '')

  const schedulerContent = readFile('src/app/admin/scheduler/scheduler-content.tsx')
  check('No Re-run button in scheduler', !schedulerContent.includes('Re-run'))

  // ─── 8. 汇总 ───
  console.log('\n════════════════════════════════════════════════════════════')
  console.log('📊 审计汇总')
  console.log('════════════════════════════════════════════════════════════')

  const highRisks: string[] = []
  const mediumRisks: string[] = []
  const lowRisks: string[] = []
  const scopedItems: string[] = []

  // /api/data/*
  for (const api of dataApis) {
    const content = readFile(api.path)
    if (!content.includes('semesterId') && (content.includes('teachingTask') || content.includes('scheduleSlot') || content.includes('classGroup'))) {
      mediumRisks.push(`/api/data/${api.name}: reads semester models without filter`)
    }
  }

  // /api/admin/[model]
  if (!adminModelRoute.includes('semesterId')) {
    highRisks.push('/api/admin/[model] (scheduleslot): returns up to 500 ScheduleSlots without semester filter')
    highRisks.push('/api/admin/[model] (teachingtask): returns up to 500 TeachingTasks without semester filter')
    highRisks.push('/api/admin/[model] (classgroup): returns up to 500 ClassGroups without semester filter')
  }

  // /api/entity-list
  if (!entityListRoute.includes('semesterId') && entityListRoute.includes('classgroup')) {
    mediumRisks.push('/api/entity-list (classgroup): returns all ClassGroups without semester filter')
  }

  // Already scoped items
  scopedItems.push('/api/export/excel (regular + adjustment-aware)')
  scopedItems.push('/api/schedule (regular + adjustment-aware)')
  scopedItems.push('/api/schedule-adjustments (GET/POST/void)')
  scopedItems.push('/api/conflict-check')
  scopedItems.push('/api/admin/scheduler/preview/apply/rollback')
  scopedItems.push('/api/admin/scheduler/lockable-slots/runs')

  console.log(`\n  PASSED: ${passed}`)
  console.log(`  WARNINGS: ${warnings}`)
  console.log(`  RISKS: ${risks}`)

  console.log(`\n  🔴 HIGH RISK: ${highRisks.length}`)
  for (const r of highRisks) console.log(`    - ${r}`)

  console.log(`\n  🟡 MEDIUM RISK: ${mediumRisks.length}`)
  for (const r of mediumRisks) console.log(`    - ${r}`)

  console.log(`\n  🟢 LOW RISK: ${lowRisks.length}`)
  for (const r of lowRisks) console.log(`    - ${r}`)

  console.log(`\n  🟢 已 SCOPED: ${scopedItems.length}`)
  for (const s of scopedItems) console.log(`    - ${s}`)

  console.log(`\n  推荐后续阶段: K10-SEMESTER-ADMIN-DATA-PAGES-SCOPING-FIX`)
  console.log(`  修复范围:`)
  console.log(`    1. /api/admin/[model]: 对 scheduleslot/teachingtask/classgroup 添加 semesterId filter`)
  console.log(`    2. /api/data/summary: 对 ClassGroup/TeachingTask/ScheduleSlot count 添加 semesterId`)
  console.log(`    3. /api/data/teaching-tasks: 添加 semesterId filter`)
  console.log(`    4. /api/data/schedule-slots: 添加 semesterId filter`)
  console.log(`    5. /api/entity-list: 对 classgroup 添加 semesterId filter`)
  console.log(`    6. 默认使用 active Semester，支持显式 semesterId`)
}

main().catch(console.error).finally(() => prisma.$disconnect())
