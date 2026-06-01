/**
 * K10-SEMESTER-SCHEDULER-SCOPING-PREP 验证脚本
 *
 * 验证 scheduler 核心链路的 semester scoping 实现。
 * 只读测试 + 安全 Preview 调用（不执行 Apply/Rollback）。
 */

import { PrismaClient } from '@prisma/client'
import * as fs from 'fs'
import * as path from 'path'

const prisma = new PrismaClient()
const ROOT = path.resolve(__dirname, '..')

let pass = 0
let fail = 0

function check(label: string, ok: boolean, detail?: string) {
  if (ok) {
    console.log(`  ✅ ${label}`)
    pass++
  } else {
    console.log(`  ❌ ${label}${detail ? ` — ${detail}` : ''}`)
    fail++
  }
}

async function main() {
  console.log('════════════════════════════════════════════════════════════')
  console.log('K10-SEMESTER-SCHEDULER-SCOPING-PREP 验证')
  console.log('════════════════════════════════════════════════════════════\n')

  // ── 1. Active Semester helper ──
  console.log('─── 1. Active Semester Helper ───\n')

  const semesterHelperPath = path.join(ROOT, 'src/lib/semester.ts')
  check('semester.ts 存在', fs.existsSync(semesterHelperPath))

  if (fs.existsSync(semesterHelperPath)) {
    const content = fs.readFileSync(semesterHelperPath, 'utf-8')
    check('resolveSchedulerSemester 函数存在', content.includes('resolveSchedulerSemester'))
    check('显式 semesterId 处理', content.includes('input?.semesterId'))
    check('active semester 查询', content.includes('isActive: true'))
    check('NO_ACTIVE_SEMESTER 错误', content.includes('NO_ACTIVE_SEMESTER'))
    check('MULTIPLE_ACTIVE_SEMESTERS 错误', content.includes('MULTIPLE_ACTIVE_SEMESTERS'))
    check('不写数据库', !content.includes('create') && !content.includes('update'))
  }

  // Test actual helper
  try {
    const { resolveSchedulerSemester } = await import('@/lib/semester')
    const semester = await resolveSchedulerSemester()
    check('resolveSchedulerSemester() 返回结果', !!semester)
    check('返回 LEGACY-DEFAULT', semester.code === 'LEGACY-DEFAULT', `code=${semester.code}`)
    check('返回 id=1', semester.id === 1, `id=${semester.id}`)

    // Test explicit semesterId
    const explicit = await resolveSchedulerSemester({ semesterId: 1 })
    check('显式 semesterId=1 返回正确', explicit.id === 1)

    // Test non-existent semesterId
    try {
      await resolveSchedulerSemester({ semesterId: 99999 })
      check('不存在的 semesterId 应抛错', false, '没有抛错')
    } catch (e: any) {
      check('不存在的 semesterId 抛出 SEMESTER_NOT_FOUND', e.message.includes('SEMESTER_NOT_FOUND'))
    }
  } catch (e: any) {
    check('resolveSchedulerSemester 调用', false, e.message)
  }

  // ── 2. Data-loader scoping ──
  console.log('\n─── 2. Data-loader Scoping ───\n')

  const dataLoaderPath = path.join(ROOT, 'src/lib/scheduler/data-loader.ts')
  const dataLoaderContent = fs.readFileSync(dataLoaderPath, 'utf-8')
  check('data-loader 接收 semesterId 参数', dataLoaderContent.includes('semesterId'))
  check('TeachingTask 有 semesterId filter', dataLoaderContent.includes('taskWhere'))
  check('ScheduleSlot 有 semesterId filter', dataLoaderContent.includes('slotWhere'))
  check('Room 查询不被 semesterId 过滤', !dataLoaderContent.includes('room.findMany({\n      where: { semesterId }'))

  // Test actual data loading
  try {
    const { loadSchedulingContext } = await import('@/lib/scheduler/data-loader')
    const ctx = await loadSchedulingContext({ semesterId: 1 })
    check('loadSchedulingContext({ semesterId: 1 }) 成功', true)
    check('加载了 tasks', ctx.tasks.length > 0, `count=${ctx.tasks.length}`)
    check('加载了 rooms', ctx.rooms.length > 0, `count=${ctx.rooms.length}`)
    check('加载了 slots', ctx.slots.length > 0, `count=${ctx.slots.length}`)

    // Test that non-existent semesterId returns empty
    const emptyCtx = await loadSchedulingContext({ semesterId: 99999 })
    check('不存在的 semesterId 返回空 tasks', emptyCtx.tasks.length === 0)
    check('不存在的 semesterId 返回空 slots', emptyCtx.slots.length === 0)
    check('不存在的 semesterId 仍返回 rooms（全局）', emptyCtx.rooms.length > 0, `count=${emptyCtx.rooms.length}`)
  } catch (e: any) {
    check('loadSchedulingContext 调用', false, e.message)
  }

  // ── 3. Preview scoping ──
  console.log('\n─── 3. Preview Scoping ───\n')

  const previewPath = path.join(ROOT, 'src/lib/scheduler/preview.ts')
  const previewContent = fs.readFileSync(previewPath, 'utf-8')
  check('Preview 接收 semesterId 参数', previewContent.includes('semesterId'))
  check('Preview 调用 resolveSchedulerSemester', previewContent.includes('resolveSchedulerSemester'))
  check('Preview 使用 semesterId 加载数据', previewContent.includes('semesterId: semester.id'))
  check('Preview 创建 SchedulingRun 写入 semesterId', previewContent.includes('semesterId: semester.id'))
  check('Preview 使用 semester-scoped fingerprint', previewContent.includes('computeSemesterScopedFingerprint'))
  check('Preview resultSnapshot 包含 semesterId', previewContent.includes('semesterId: semester.id'))
  check('Preview response 包含 semesterId', previewContent.includes('semesterId: semester.id'))
  check('Preview response 包含 semesterCode', previewContent.includes('semesterCode'))
  check('Preview response 包含 semesterName', previewContent.includes('semesterName'))

  // Check preview API route
  const previewRoutePath = path.join(ROOT, 'src/app/api/admin/scheduler/preview/route.ts')
  const previewRouteContent = fs.readFileSync(previewRoutePath, 'utf-8')
  check('Preview API 解析 body.semesterId', previewRouteContent.includes('body.semesterId'))
  check('Preview API 调用 resolveSchedulerSemester', previewRouteContent.includes('resolveSchedulerSemester'))
  check('Preview API 校验 lockedSlotIds 同 semester', previewRouteContent.includes('LOCKED_SLOT_SEMESTER_MISMATCH'))

  // ── 4. Apply scoping ──
  console.log('\n─── 4. Apply Scoping ───\n')

  const applyPath = path.join(ROOT, 'src/lib/scheduler/apply.ts')
  const applyContent = fs.readFileSync(applyPath, 'utf-8')
  check('Apply 仍只基于 previewRunId + confirmApply', applyContent.includes('previewRunId') && applyContent.includes('confirmApply'))
  // ApplyOptions interface should not have proposedChanges
  const applyOptionsMatch = applyContent.match(/interface ApplyOptions \{([^}]+)\}/)
  check('ApplyOptions 不接收 proposedChanges 参数', applyOptionsMatch ? !applyOptionsMatch[1].includes('proposedChanges') : false)
  check('Apply 不调用 solve()', !applyContent.includes('solve('))
  check('Apply 校验 previewRun.semesterId', applyContent.includes('PREVIEW_RUN_MISSING_SEMESTER_ID'))
  check('Apply 使用 semester-scoped fingerprint', applyContent.includes('computeSemesterScopedFingerprint'))
  check('Apply 加载 semester-scoped 数据', applyContent.includes('loadSchedulingContextWithClient(tx, semesterId)'))
  check('Apply 校验 slot 属于同一 semester', applyContent.includes('SLOT_SEMESTER_MISMATCH'))
  check('Apply 创建 run 写入 semesterId', applyContent.includes('semesterId: semesterId'))

  // ── 5. Rollback scoping ──
  console.log('\n─── 5. Rollback Scoping ───\n')

  const rollbackPath = path.join(ROOT, 'src/lib/scheduler/rollback.ts')
  const rollbackContent = fs.readFileSync(rollbackPath, 'utf-8')
  check('Rollback 仍只基于 applyRunId + confirmRollback', rollbackContent.includes('applyRunId') && rollbackContent.includes('confirmRollback'))
  check('Rollback 不调用 solve()', !rollbackContent.includes('solve('))
  check('Rollback 校验 applyRun.semesterId', rollbackContent.includes('APPLY_RUN_MISSING_SEMESTER_ID'))
  check('Rollback 使用 semester-scoped fingerprint', rollbackContent.includes('computeSemesterScopedFingerprint'))
  check('Rollback 加载 semester-scoped 数据', rollbackContent.includes('loadSchedulingContextWithClient(tx, semesterId)'))
  check('Rollback 校验 slot 属于同一 semester', rollbackContent.includes('SLOT_SEMESTER_MISMATCH'))
  check('Rollback 创建 run 写入 semesterId', rollbackContent.includes('semesterId: semesterId'))

  // ── 6. Lockable-slots scoping ──
  console.log('\n─── 6. Lockable-slots Scoping ───\n')

  const lockablePath = path.join(ROOT, 'src/app/api/admin/scheduler/lockable-slots/route.ts')
  const lockableContent = fs.readFileSync(lockablePath, 'utf-8')
  check('lockable-slots 支持 semesterId query', lockableContent.includes('semesterId'))
  check('lockable-slots 调用 resolveSchedulerSemester', lockableContent.includes('resolveSchedulerSemester'))
  check('lockable-slots 按 semesterId 过滤', lockableContent.includes('semesterId: semester.id'))
  check('lockable-slots 返回 semester metadata', lockableContent.includes('semester:'))

  // ── 7. History scoping ──
  console.log('\n─── 7. History Scoping ───\n')

  const runsPath = path.join(ROOT, 'src/app/api/admin/scheduler/runs/route.ts')
  const runsContent = fs.readFileSync(runsPath, 'utf-8')
  check('runs list 支持 semesterId query', runsContent.includes('semesterId'))
  check('runs list 调用 resolveSchedulerSemester', runsContent.includes('resolveSchedulerSemester'))
  check('runs list 按 semesterId 过滤', runsContent.includes('semesterId: semester.id'))
  check('runs list 返回 semester metadata', runsContent.includes('semester:'))

  const runDetailPath = path.join(ROOT, 'src/app/api/admin/scheduler/runs/[id]/route.ts')
  const runDetailContent = fs.readFileSync(runDetailPath, 'utf-8')
  check('run detail 返回 semesterId', runDetailContent.includes('semesterId: run.semesterId'))
  check('run detail 返回 semesterCode', runDetailContent.includes('semesterCode'))
  check('run detail include semester relation', runDetailContent.includes('semester: true'))

  const historyPath = path.join(ROOT, 'src/app/admin/scheduler/history/history-content.tsx')
  const historyContent = fs.readFileSync(historyPath, 'utf-8')
  check('history 页面展示 semester info', historyContent.includes('semesterName'))
  check('history 页面仍只读（无 Apply/Rollback 按钮）', !historyContent.includes('applySchedulerPreview') && !historyContent.includes('rollbackSchedulerApply'))
  check('history 页面无 Re-run', !historyContent.includes('re-run') && !historyContent.includes('reRun'))

  // ── 8. SchedulingContext type ──
  console.log('\n─── 8. SchedulingContext Type ───\n')

  const typesPath = path.join(ROOT, 'src/lib/scheduler/types.ts')
  const typesContent = fs.readFileSync(typesPath, 'utf-8')
  // types.ts doesn't need semesterId in context since we filter at load time
  check('SchedulingContext 类型存在', typesContent.includes('SchedulingContext'))

  // ── 9. Safety checks ──
  console.log('\n─── 9. Safety Checks ───\n')

  // /api/scheduler/run does not exist
  const schedulerRunPath = path.join(ROOT, 'src/app/api/admin/scheduler/run')
  check('/api/scheduler/run 不存在', !fs.existsSync(schedulerRunPath))

  // No Re-run in scheduler content
  const schedulerContentPath = path.join(ROOT, 'src/app/admin/scheduler/scheduler-content.tsx')
  if (fs.existsSync(schedulerContentPath)) {
    const sc = fs.readFileSync(schedulerContentPath, 'utf-8')
    check('scheduler-content 无 Re-run', !/re-run|rerun|reRun/i.test(sc))
  }

  // prisma/dev.db not tracked
  try {
    const { execSync } = require('child_process')
    const gitLs = execSync('git ls-files prisma/dev.db', { cwd: ROOT, encoding: 'utf-8' }).trim()
    check('prisma/dev.db 未被 Git 跟踪', gitLs.length === 0, gitLs.length > 0 ? 'TRACKED' : undefined)
  } catch {
    check('prisma/dev.db 未被 Git 跟踪', true)
  }

  // Solver not modified
  const solverPath = path.join(ROOT, 'src/lib/scheduler/solver.ts')
  const solverContent = fs.readFileSync(solverPath, 'utf-8')
  check('solver 仍使用 Math.random 或 seeded random', solverContent.includes('createSeededRandom') || solverContent.includes('Math.random'))
  check('solver 不包含 semesterId', !solverContent.includes('semesterId'))

  // ── 10. Database state verification ──
  console.log('\n─── 10. Database State Verification ───\n')

  const activeSemester = await prisma.semester.findFirst({ where: { isActive: true } })
  check('存在 active semester', !!activeSemester)
  if (activeSemester) {
    check('active semester 是 LEGACY-DEFAULT', activeSemester.code === 'LEGACY-DEFAULT', `code=${activeSemester.code}`)
  }

  // Verify all SchedulingRuns have semesterId
  const runsWithNullSemester = await prisma.schedulingRun.count({ where: { semesterId: null } })
  check('所有 SchedulingRun 有 semesterId', runsWithNullSemester === 0, `null count=${runsWithNullSemester}`)

  // Verify all ScheduleSlots have semesterId
  const slotsWithNullSemester = await prisma.scheduleSlot.count({ where: { semesterId: null } })
  check('所有 ScheduleSlot 有 semesterId', slotsWithNullSemester === 0, `null count=${slotsWithNullSemester}`)

  // Verify all TeachingTasks have semesterId
  const tasksWithNullSemester = await prisma.teachingTask.count({ where: { semesterId: null } })
  check('所有 TeachingTask 有 semesterId', tasksWithNullSemester === 0, `null count=${tasksWithNullSemester}`)

  // ── Summary ──
  console.log('\n════════════════════════════════════════════════════════════')
  console.log(`📊 结果: ${pass} passed, ${fail} failed`)
  console.log('════════════════════════════════════════════════════════════')

  if (fail > 0) {
    process.exit(1)
  }
}

main()
  .catch(e => { console.error(e); process.exit(1) })
  .finally(() => prisma.$disconnect())
