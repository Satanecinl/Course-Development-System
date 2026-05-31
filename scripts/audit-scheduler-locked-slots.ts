/**
 * K10-SCHEDULER-LOCKED-SLOTS-AUDIT
 *
 * 只读审计：检查自动排课系统是否已支持锁定槽位机制
 *
 * 审计范围：
 * 1. 数据层（Prisma schema）
 * 2. Solver 配置
 * 3. Preview API
 * 4. 前端 UI
 * 5. Apply / Rollback
 * 6. 不受控接口
 */

import * as fs from 'fs'
import * as path from 'path'

const ROOT = path.resolve(__dirname, '..')

// ── Helpers ──

function readFileSync(relPath: string): string {
  const abs = path.join(ROOT, relPath)
  return fs.readFileSync(abs, 'utf-8')
}

function fileExists(relPath: string): boolean {
  return fs.existsSync(path.join(ROOT, relPath))
}

function fileContains(relPath: string, pattern: string | RegExp): boolean {
  try {
    const content = readFileSync(relPath)
    return typeof pattern === 'string'
      ? content.includes(pattern)
      : pattern.test(content)
  } catch {
    return false
  }
}

function countMatches(relPath: string, pattern: RegExp): number {
  try {
    const content = readFileSync(relPath)
    return (content.match(pattern) || []).length
  } catch {
    return 0
  }
}

// ── Assertion Tracking ──

let passed = 0
let failed = 0
const failures: string[] = []

function check(name: string, condition: boolean, detail: string) {
  if (condition) {
    passed++
    console.log(`  ✅ ${name}`)
  } else {
    failed++
    failures.push(`${name}: ${detail}`)
    console.log(`  ❌ ${name} — ${detail}`)
  }
}

// ── Audit ──

console.log('════════════════════════════════════════════════════════════')
console.log('K10-SCHEDULER-LOCKED-SLOTS-AUDIT')
console.log('════════════════════════════════════════════════════════════\n')

// 1. 数据层审计
console.log('─── 1. 数据层审计 ───\n')

check(
  'ScheduleSlot 无 isLocked 字段',
  !fileContains('prisma/schema.prisma', 'isLocked'),
  'ScheduleSlot 不应有 isLocked 字段'
)

check(
  'ScheduleSlot 无 locked 字段',
  !fileContains('prisma/schema.prisma', 'model ScheduleSlot {') ||
    !(/model ScheduleSlot \{[^}]*locked/.test(readFileSync('prisma/schema.prisma'))),
  'ScheduleSlot 不应有 locked 字段'
)

check(
  'SchedulingConfig 有 lockedTaskIds 字段',
  fileContains('prisma/schema.prisma', 'lockedTaskIds'),
  'SchedulingConfig 应有 lockedTaskIds 字段'
)

check(
  'lockedTaskIds 默认值为空数组',
  fileContains('prisma/schema.prisma', 'lockedTaskIds   String           @default("[]")'),
  'lockedTaskIds 应默认为 "[]"'
)

check(
  '无 ScheduleSlotLock 独立表',
  !fileContains('prisma/schema.prisma', 'model ScheduleSlotLock'),
  '不应存在独立的锁定表'
)

// 2. Solver 配置审计
console.log('\n─── 2. Solver 配置审计 ───\n')

check(
  'SolverConfig 已声明 lockedSlotIds',
  fileContains('src/lib/scheduler/types.ts', 'lockedSlotIds?: Set<number>'),
  'SolverConfig 应有 lockedSlotIds 可选字段'
)

check(
  'solver.ts 已解构 lockedSlotIds',
  fileContains('src/lib/scheduler/solver.ts', 'const { maxIterations, lahcWindowSize, lockedSlotIds } = config'),
  'solver.ts 应从 config 解构 lockedSlotIds'
)

check(
  'solver.ts 已过滤 locked slots',
  fileContains('src/lib/scheduler/solver.ts', 'if (!lockedSlotIds?.has(slot.id))'),
  'solver.ts 应使用 lockedSlotIds 过滤可移动槽位'
)

check(
  'solver.ts 使用 allMovable 数组',
  fileContains('src/lib/scheduler/solver.ts', 'const allMovable: number[]'),
  'solver.ts 应使用 allMovable 数组存储可移动槽位'
)

check(
  'solver.ts 处理全部锁定的情况',
  fileContains('src/lib/scheduler/solver.ts', 'if (allMovable.length === 0)'),
  'solver.ts 应处理所有槽位都被锁定的情况'
)

check(
  'solver.ts 随机选择从 allMovable 中选取',
  fileContains('src/lib/scheduler/solver.ts', 'sourceSlotId = allMovable[randInt(rng, 0, allMovable.length - 1)]'),
  '随机模式应从 allMovable 中选取'
)

// 3. Preview API 审计
console.log('\n─── 3. Preview API 审计 ───\n')

check(
  'PreviewRequest 有 lockedSlotIds 字段',
  fileContains('src/app/api/admin/scheduler/preview/route.ts', 'lockedSlotIds?: number[]'),
  'Preview API 应接收 lockedSlotIds'
)

check(
  'PreviewOptions 有 lockedSlotIds 字段',
  fileContains('src/lib/scheduler/preview.ts', 'lockedSlotIds?: number[]'),
  'createSchedulerPreview 应接收 lockedSlotIds'
)

check(
  'preview.ts 调用 solve 传递 lockedSlotIds',
  fileContains('src/lib/scheduler/preview.ts', 'lockedSlotIds: new Set(lockedSlotIds)'),
  'preview.ts 调用 solve 时应传递 lockedSlotIds'
)

// 4. 前端审计
console.log('\n─── 4. 前端审计 ───\n')

check(
  'scheduler-content.tsx 有 lockedSlotIds',
  fileContains('src/app/admin/scheduler/scheduler-content.tsx', 'lockedSlotIds'),
  '前端应处理 lockedSlotIds'
)

check(
  'scheduler-content.tsx 有锁定选择 UI',
  fileContains('src/app/admin/scheduler/scheduler-content.tsx', '锁定课表槽位'),
  '前端应有锁定 UI'
)

check(
  'history-content.tsx 有 lockedSlotIds',
  fileContains('src/app/admin/scheduler/history/history-content.tsx', 'lockedSlotIds'),
  '历史页应显示 lockedSlotIds'
)

// 5. Apply / Rollback 审计
console.log('\n─── 5. Apply / Rollback 审计 ───\n')

check(
  'apply.ts 不调用 solve()',
  !fileContains('src/lib/scheduler/apply.ts', 'solve('),
  'Apply 不应调用 solver'
)

check(
  'apply.ts 只导入 buildInitialState',
  fileContains('src/lib/scheduler/apply.ts', 'import { buildInitialState } from \'./solver\''),
  'Apply 应只导入 buildInitialState（用于分数验证）'
)

check(
  'rollback.ts 不调用 solve()',
  !fileContains('src/lib/scheduler/rollback.ts', 'solve('),
  'Rollback 不应调用 solver'
)

check(
  'rollback.ts 只导入 buildInitialState',
  fileContains('src/lib/scheduler/rollback.ts', 'import { buildInitialState } from \'./solver\''),
  'Rollback 应只导入 buildInitialState（用于分数验证）'
)

// 6. 不受控接口检查
console.log('\n─── 6. 不受控接口检查 ───\n')

check(
  '无 /api/scheduler/run 路由',
  !fileExists('src/app/api/admin/scheduler/run/route.ts'),
  '不应存在 /api/scheduler/run 路由'
)

check(
  '无 Re-run 入口',
  !fileContains('src/app/admin/scheduler/scheduler-content.tsx', 'rerun|re-run|Re-run'),
  '前端不应有 Re-run 按钮'
)

check(
  '/api/scheduler/runs 只是列表查询',
  fileContains('src/app/api/admin/scheduler/runs/route.ts', 'export async function GET'),
  '/api/scheduler/runs 应只有 GET 方法'
)

check(
  '/api/scheduler/runs 无 POST 方法',
  !fileContains('src/app/api/admin/scheduler/runs/route.ts', 'export async function POST'),
  '/api/scheduler/runs 不应有 POST 方法'
)

// ── Summary ──

console.log('\n════════════════════════════════════════════════════════════')
console.log(`📊 结果: ${passed} passed, ${failed} failed`)
console.log('════════════════════════════════════════════════════════════')

if (failed > 0) {
  console.log('\n❌ 失败项:')
  for (const f of failures) {
    console.log(`  - ${f}`)
  }
  process.exit(1)
} else {
  console.log('\n✅ 审计通过')
  process.exit(0)
}
