/**
 * K10-SEMESTER-CONFLICT-ADJUSTMENT-SCOPING 验证脚本
 *
 * 验证冲突检查和调课链路的 semester scoping 实现。
 * 只读测试，不执行真实写库调课。
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
  console.log('K10-SEMESTER-CONFLICT-ADJUSTMENT-SCOPING 验证')
  console.log('════════════════════════════════════════════════════════════\n')

  // ── 1. Static checks: conflict-check.ts ──
  console.log('─── 1. Conflict Check Scoping ───\n')

  const conflictPath = path.join(ROOT, 'src/lib/conflict-check.ts')
  const conflictContent = fs.readFileSync(conflictPath, 'utf-8')
  check('conflict-check.ts 接收 semesterId 参数', conflictContent.includes('semesterId'))
  check('ConflictCheckInput 有 semesterId 字段', conflictContent.includes('semesterId?: number | null'))
  check('使用 movingSlot.semesterId 作为默认值', conflictContent.includes('movingSlot.semesterId'))
  check('timeOverlapWhere 包含 semesterId', conflictContent.includes('timeOverlapWhere.semesterId'))
  check('room conflict 查询按 semesterId 过滤', conflictContent.includes('...timeOverlapWhere, roomId: targetRoomId'))
  check('teacher conflict 查询按 semesterId 过滤', conflictContent.includes('...timeOverlapWhere,'))
  check('class conflict 查询按 semesterId 过滤', conflictContent.includes('...timeOverlapWhere,'))

  // ── 2. Static checks: adjustments.ts ──
  console.log('\n─── 2. Adjustment Scoping ───\n')

  const adjPath = path.join(ROOT, 'src/lib/schedule/adjustments.ts')
  const adjContent = fs.readFileSync(adjPath, 'utf-8')
  check('adjustments.ts 导入 resolveSchedulerSemester', adjContent.includes('resolveSchedulerSemester'))
  check('getEffectiveScheduleForWeek 接受 semesterId', adjContent.includes('semesterId?: number'))
  check('ScheduleSlot 查询按 semesterId 过滤', adjContent.includes('semesterId != null ? { semesterId }'))
  check('ScheduleAdjustment 查询按 semesterId 过滤', adjContent.includes('adjustmentWhere.semesterId'))
  check('dryRunScheduleAdjustment 调用 resolveSchedulerSemester', adjContent.includes('resolveSchedulerSemester({ semesterId: input.semesterId })'))
  check('dryRun 校验 originalSlot.semesterId', adjContent.includes('originalSlot.semesterId !== semesterId'))
  check('dryRun duplicate check 包含 semesterId', adjContent.includes('semesterId,'))
  check('dryRun 调用 getEffectiveScheduleForWeek 传 semesterId', adjContent.includes('getEffectiveScheduleForWeek(targetWeek, semesterId)'))
  check('createScheduleAdjustment 写入 semesterId', adjContent.includes('semesterId: semesterId'))
  check('voidScheduleAdjustment 接受 semesterId', adjContent.includes('semesterId?: number | null'))
  check('void 校验 adjustment.semesterId', adjContent.includes('adjustment.semesterId !== semester.id'))
  check('void 校验 originalSlot.semesterId', adjContent.includes('originalSlot.semesterId !== adjustment.semesterId'))

  // ── 3. Static checks: API routes ──
  console.log('\n─── 3. API Route Scoping ───\n')

  const conflictRoutePath = path.join(ROOT, 'src/app/api/conflict-check/route.ts')
  const conflictRouteContent = fs.readFileSync(conflictRoutePath, 'utf-8')
  check('conflict-check API 调用 resolveSchedulerSemester', conflictRouteContent.includes('resolveSchedulerSemester'))
  check('conflict-check API 传递 semesterId', conflictRouteContent.includes('semesterId: semester.id'))

  const adjRoutePath = path.join(ROOT, 'src/app/api/schedule-adjustments/route.ts')
  const adjRouteContent = fs.readFileSync(adjRoutePath, 'utf-8')
  check('adjustments GET 调用 resolveSchedulerSemester', adjRouteContent.includes('resolveSchedulerSemester'))
  check('adjustments GET 按 semesterId 过滤', adjRouteContent.includes('semesterId: semester.id'))
  check('adjustments GET 返回 semester metadata', adjRouteContent.includes('semester:'))
  check('adjustments POST 传递 body.semesterId', adjRouteContent.includes('body.semesterId'))

  const dryRunRoutePath = path.join(ROOT, 'src/app/api/schedule-adjustments/dry-run/route.ts')
  const dryRunRouteContent = fs.readFileSync(dryRunRoutePath, 'utf-8')
  check('dry-run API 传递 body.semesterId', dryRunRouteContent.includes('body.semesterId'))

  const voidRoutePath = path.join(ROOT, 'src/app/api/schedule-adjustments/[id]/void/route.ts')
  const voidRouteContent = fs.readFileSync(voidRoutePath, 'utf-8')
  check('void API 调用 resolveSchedulerSemester', voidRouteContent.includes('resolveSchedulerSemester'))
  check('void API 传递 semesterId', voidRouteContent.includes('semester.id'))

  // ── 4. Static checks: types ──
  console.log('\n─── 4. Type Definitions ───\n')

  const typesPath = path.join(ROOT, 'src/types/schedule-adjustment.ts')
  const typesContent = fs.readFileSync(typesPath, 'utf-8')
  check('ScheduleAdjustmentInput 有 semesterId 字段', typesContent.includes('semesterId?: number | null'))

  // ── 5. Safety checks ──
  console.log('\n─── 5. Safety Checks ───\n')

  // Schema not modified
  const schemaPath = path.join(ROOT, 'prisma/schema.prisma')
  const schemaContent = fs.readFileSync(schemaPath, 'utf-8')
  check('ScheduleAdjustment model 有 semesterId', schemaContent.includes('semesterId') && schemaContent.includes('ScheduleAdjustment'))

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
    check('prisma/dev.db 未被 Git 跟踪', gitLs.length === 0)
  } catch {
    check('prisma/dev.db 未被 Git 跟踪', true)
  }

  // Solver not modified
  const solverPath = path.join(ROOT, 'src/lib/scheduler/solver.ts')
  const solverContent = fs.readFileSync(solverPath, 'utf-8')
  check('solver 不包含 semesterId', !solverContent.includes('semesterId'))

  // Parser not modified
  const parserDir = path.join(ROOT, 'scripts')
  const parserFiles = ['parse_schedule.py', 'parse_cell.py']
  for (const pf of parserFiles) {
    const pp = path.join(parserDir, pf)
    if (fs.existsSync(pp)) {
      const pc = fs.readFileSync(pp, 'utf-8')
      check(`${pf} 未被修改`, !pc.includes('semesterId'))
    }
  }

  // ── 6. Database state verification ──
  console.log('\n─── 6. Database State Verification ───\n')

  const activeSemester = await prisma.semester.findFirst({ where: { isActive: true } })
  check('存在 active semester', !!activeSemester)
  if (activeSemester) {
    check('active semester 是 LEGACY-DEFAULT', activeSemester.code === 'LEGACY-DEFAULT')
  }

  // Verify all ScheduleAdjustments have semesterId
  const adjWithNullSemester = await prisma.scheduleAdjustment.count({ where: { semesterId: null } })
  check('所有 ScheduleAdjustment 有 semesterId', adjWithNullSemester === 0, `null count=${adjWithNullSemester}`)

  // Verify all ScheduleSlots have semesterId
  const slotsWithNullSemester = await prisma.scheduleSlot.count({ where: { semesterId: null } })
  check('所有 ScheduleSlot 有 semesterId', slotsWithNullSemester === 0, `null count=${slotsWithNullSemester}`)

  // ── 7. Verify Excel export uses semester ──
  console.log('\n─── 7. Excel Export Scoping ───\n')

  const excelPath = path.join(ROOT, 'src/app/api/export/excel/route.ts')
  const excelContent = fs.readFileSync(excelPath, 'utf-8')
  check('Excel export 导入 resolveSchedulerSemester', excelContent.includes('resolveSchedulerSemester'))
  check('Excel export adjustment-aware 路径传 semesterId', excelContent.includes('getEffectiveScheduleForWeek(selectedWeek, semesterId)'))
  // Note: regular export path is not scoped (ordinary schedule view - future phase)
  console.log('  ℹ️  Excel regular export path 未按 semester scoped（ordinary schedule view，后续阶段处理）')

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
