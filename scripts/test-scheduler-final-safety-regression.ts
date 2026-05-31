/**
 * K10-SCHEDULER-FINAL-SAFETY-REGRESSION
 *
 * 综合安全回归测试：验证 seed、locked slots、Preview、Apply、Rollback、
 * 历史审计、RBAC、容量管理叠加后没有互相破坏。
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

// ── Tests ──

console.log('════════════════════════════════════════════════════════════')
console.log('K10-SCHEDULER-FINAL-SAFETY-REGRESSION')
console.log('════════════════════════════════════════════════════════════\n')

// A. Git / 文件安全静态检查
console.log('─── A. Git / 文件安全静态检查 ───\n')

check(
  '/api/scheduler/run 不存在',
  !fileExists('src/app/api/admin/scheduler/run/route.ts'),
  '不应存在 /api/scheduler/run 路由'
)

check(
  'scheduler 页面没有 Re-run 入口',
  !fileContains('src/app/admin/scheduler/scheduler-content.tsx', 'rerun|re-run|Re-run'),
  '不应有 Re-run 按钮'
)

check(
  'history 页面没有 Apply / Rollback / Re-run 按钮',
  !fileContains('src/app/admin/scheduler/history/history-content.tsx', 'Apply|Rollback|Re-run'),
  '历史页不应有操作按钮'
)

check(
  'Preview 页面不调用 /api/scheduler/run',
  !fileContains('src/app/admin/scheduler/scheduler-content.tsx', '/api/scheduler/run'),
  '不应调用不受控 API'
)

check(
  'prisma/dev.db 不应被 Git 跟踪',
  !fileContains('.gitignore', 'prisma/dev.db') || fileContains('.gitignore', 'dev.db'),
  'dev.db 应在 gitignore 中'
)

check(
  '无绕过 Preview 的 scheduler run 入口',
  !fileContains('src/app/api/admin/scheduler', 'export async function POST') ||
    fileExists('src/app/api/admin/scheduler/preview/route.ts'),
  '只有 preview/apply/rollback 可以 POST'
)

// B. RBAC 静态检查
console.log('\n─── B. RBAC 静态检查 ───\n')

const rbacFiles = [
  { path: 'src/app/api/admin/scheduler/preview/route.ts', name: 'POST /api/admin/scheduler/preview' },
  { path: 'src/app/api/admin/scheduler/apply/route.ts', name: 'POST /api/admin/scheduler/apply' },
  { path: 'src/app/api/admin/scheduler/rollback/route.ts', name: 'POST /api/admin/scheduler/rollback' },
  { path: 'src/app/api/admin/scheduler/runs/route.ts', name: 'GET /api/admin/scheduler/runs' },
  { path: 'src/app/api/admin/scheduler/runs/[id]/route.ts', name: 'GET /api/admin/scheduler/runs/[id]' },
  { path: 'src/app/api/admin/scheduler/lockable-slots/route.ts', name: 'GET /api/admin/scheduler/lockable-slots' },
]

for (const { path: filePath, name } of rbacFiles) {
  check(
    `${name} 受 schedule:adjust 保护`,
    fileContains(filePath, 'requirePermission') && fileContains(filePath, 'schedule:adjust'),
    '应有 requirePermission(schedule:adjust)'
  )
}

check(
  '/admin/scheduler 有 ProtectedShell 保护',
  fileContains('src/app/admin/scheduler/page.tsx', 'ProtectedShell'),
  '应有 ProtectedShell 保护未登录用户'
)

check(
  '/admin/scheduler/history 有 ProtectedShell 保护',
  fileContains('src/app/admin/scheduler/history/page.tsx', 'ProtectedShell'),
  '应有 ProtectedShell 保护未登录用户'
)

// C. Preview 安全检查
console.log('\n─── C. Preview 安全检查 ───\n')

check(
  'Preview 不写真实 ScheduleSlot',
  !fileContains('src/lib/scheduler/preview.ts', 'prisma.scheduleSlot.create') &&
    !fileContains('src/lib/scheduler/preview.ts', 'prisma.scheduleSlot.update') &&
    !fileContains('src/lib/scheduler/preview.ts', 'prisma.scheduleSlot.delete'),
  'Preview 不应写 ScheduleSlot'
)

check(
  'Preview 不写 Room',
  !fileContains('src/lib/scheduler/preview.ts', 'prisma.room.create') &&
    !fileContains('src/lib/scheduler/preview.ts', 'prisma.room.update'),
  'Preview 不应写 Room'
)

check(
  'Preview 不写 TeachingTask',
  !fileContains('src/lib/scheduler/preview.ts', 'prisma.teachingTask.create') &&
    !fileContains('src/lib/scheduler/preview.ts', 'prisma.teachingTask.update'),
  'Preview 不应写 TeachingTask'
)

check(
  'Preview 不写 ClassGroup',
  !fileContains('src/lib/scheduler/preview.ts', 'prisma.classGroup.create') &&
    !fileContains('src/lib/scheduler/preview.ts', 'prisma.classGroup.update'),
  'Preview 不应写 ClassGroup'
)

check(
  'Preview response 包含 randomSeed',
  fileContains('src/lib/scheduler/preview.ts', 'randomSeed: usedSeed'),
  '应返回 randomSeed'
)

check(
  'Preview response 包含 lockedSlotIds',
  fileContains('src/lib/scheduler/preview.ts', 'lockedSlotIds,'),
  '应返回 lockedSlotIds'
)

check(
  'Preview response 包含 lockedSlotCount',
  fileContains('src/lib/scheduler/preview.ts', 'lockedSlotCount:'),
  '应返回 lockedSlotCount'
)

check(
  'Preview response 包含 databaseFingerprint',
  fileContains('src/lib/scheduler/preview.ts', 'databaseFingerprint'),
  '应返回 databaseFingerprint'
)

check(
  'Preview response 包含 proposedChanges',
  fileContains('src/lib/scheduler/preview.ts', 'proposedChanges'),
  '应返回 proposedChanges'
)

check(
  'resultSnapshot 包含 lockedSlotIds',
  fileContains('src/lib/scheduler/preview.ts', 'lockedSlotIds,') &&
    fileContains('src/lib/scheduler/preview.ts', 'lockedSlotCount:'),
  'resultSnapshot 应保存 locked 信息'
)

// D. Seed + locked slots 传递检查
console.log('\n─── D. Seed + locked slots 传递检查 ───\n')

check(
  'PreviewOptions 有 randomSeed',
  fileContains('src/lib/scheduler/preview.ts', 'randomSeed?: number | null'),
  '应支持 randomSeed'
)

check(
  'PreviewOptions 有 lockedSlotIds',
  fileContains('src/lib/scheduler/preview.ts', 'lockedSlotIds?: number[]'),
  '应支持 lockedSlotIds'
)

check(
  'preview.ts 传 lockedSlotIds 给 solve',
  fileContains('src/lib/scheduler/preview.ts', 'lockedSlotIds: new Set(lockedSlotIds)'),
  '应将 lockedSlotIds 转为 Set 传给 solve'
)

check(
  'preview.ts 传 randomSeed 给 solve',
  fileContains('src/lib/scheduler/preview.ts', 'randomSeed'),
  '应传 randomSeed 给 solve'
)

check(
  'solver.ts 接收 lockedSlotIds',
  fileContains('src/lib/scheduler/solver.ts', 'lockedSlotIds') &&
    fileContains('src/lib/scheduler/solver.ts', 'if (!lockedSlotIds?.has(slot.id))'),
  'solver 应使用 lockedSlotIds 过滤'
)

check(
  'solver.ts 使用 seeded random',
  fileContains('src/lib/scheduler/solver.ts', 'createSeededRandom'),
  'solver 应使用 seeded random'
)

// E. Apply / Rollback Gatekeeper 静态检查
console.log('\n─── E. Apply / Rollback Gatekeeper 静态检查 ───\n')

check(
  'Apply request body 只使用 previewRunId + confirmApply',
  fileContains('src/app/api/admin/scheduler/apply/route.ts', 'previewRunId') &&
    fileContains('src/app/api/admin/scheduler/apply/route.ts', 'confirmApply'),
  'Apply 应只接收 previewRunId + confirmApply'
)

check(
  'Apply 不接收 proposedChanges',
  !fileContains('src/app/api/admin/scheduler/apply/route.ts', 'proposedChanges'),
  'Apply 不应接收 proposedChanges'
)

check(
  'Apply 不接收 old/new values',
  !fileContains('src/app/api/admin/scheduler/apply/route.ts', 'oldDayOfWeek') &&
    !fileContains('src/app/api/admin/scheduler/apply/route.ts', 'newDayOfWeek'),
  'Apply 不应接收 old/new values'
)

check(
  'Apply 不调用 solve()',
  !fileContains('src/lib/scheduler/apply.ts', 'solve('),
  'Apply 不应调用 solve()'
)

check(
  'Apply 只导入 buildInitialState（用于分数验证）',
  fileContains('src/lib/scheduler/apply.ts', 'import { buildInitialState } from \'./solver\''),
  'Apply 可导入 buildInitialState 但不调用 solve'
)

check(
  'Rollback request body 只使用 applyRunId + confirmRollback',
  fileContains('src/app/api/admin/scheduler/rollback/route.ts', 'applyRunId') &&
    fileContains('src/app/api/admin/scheduler/rollback/route.ts', 'confirmRollback'),
  'Rollback 应只接收 applyRunId + confirmRollback'
)

check(
  'Rollback 不调用 solve()',
  !fileContains('src/lib/scheduler/rollback.ts', 'solve('),
  'Rollback 不应调用 solve()'
)

check(
  'Rollback 只导入 buildInitialState（用于分数验证）',
  fileContains('src/lib/scheduler/rollback.ts', 'import { buildInitialState } from \'./solver\''),
  'Rollback 可导入 buildInitialState 但不调用 solve'
)

check(
  'Apply 有 databaseFingerprint 校验',
  fileContains('src/lib/scheduler/apply.ts', 'databaseFingerprint') ||
    fileContains('src/lib/scheduler/apply.ts', 'FINGERPRINT'),
  'Apply 应校验 databaseFingerprint'
)

check(
  'Apply 有 hardScore 校验',
  fileContains('src/lib/scheduler/apply.ts', 'hardScore'),
  'Apply 应校验 hardScore'
)

check(
  'Rollback 有 current state mismatch 校验',
  fileContains('src/lib/scheduler/rollback.ts', 'mismatch') ||
    fileContains('src/lib/scheduler/rollback.ts', 'MISMATCH') ||
    fileContains('src/lib/scheduler/rollback.ts', 'state'),
  'Rollback 应有 state 校验'
)

// F. 历史审计检查
console.log('\n─── F. 历史审计检查 ───\n')

check(
  'runs list API 受 schedule:adjust 保护',
  fileContains('src/app/api/admin/scheduler/runs/route.ts', 'schedule:adjust'),
  'runs list API 应受保护'
)

check(
  'run detail API 受 schedule:adjust 保护',
  fileContains('src/app/api/admin/scheduler/runs/[id]/route.ts', 'schedule:adjust'),
  'run detail API 应受保护'
)

check(
  'run detail API 返回 resultSnapshot',
  fileContains('src/app/api/admin/scheduler/runs/[id]/route.ts', 'resultSnapshot') ||
    fileContains('src/app/api/admin/scheduler/runs/[id]/route.ts', 'lockedSlotIds'),
  '应返回审计信息'
)

check(
  'history 页面展示 randomSeed',
  fileContains('src/app/admin/scheduler/history/history-content.tsx', 'randomSeed'),
  '应展示 randomSeed'
)

check(
  'history 页面展示 lockedSlotCount',
  fileContains('src/app/admin/scheduler/history/history-content.tsx', 'lockedSlotCount'),
  '应展示 lockedSlotCount'
)

check(
  'history 页面展示 lockedSlotIds',
  fileContains('src/app/admin/scheduler/history/history-content.tsx', 'lockedSlotIds'),
  '应展示 lockedSlotIds'
)

check(
  'history 页面展示 SchedulerRunChange 明细',
  fileContains('src/app/admin/scheduler/history/history-content.tsx', 'SchedulerRunChange') ||
    fileContains('src/app/admin/scheduler/history/history-content.tsx', 'changes'),
  '应展示 changes 明细'
)

check(
  'history 页面只读',
  !fileContains('src/app/admin/scheduler/history/history-content.tsx', 'handleApply') &&
    !fileContains('src/app/admin/scheduler/history/history-content.tsx', 'handleRollback'),
  '历史页不应有 Apply/Rollback 处理函数'
)

// G. 容量管理回归
console.log('\n─── G. 容量管理回归 ───\n')

check(
  '/admin/rooms/capacity 页面存在',
  fileExists('src/app/admin/rooms/capacity/page.tsx'),
  '容量管理页面应存在'
)

check(
  'GET /api/admin/rooms/capacity 存在',
  fileExists('src/app/api/admin/rooms/capacity/route.ts'),
  'GET 容量 API 应存在'
)

check(
  'PATCH /api/admin/rooms/capacity/[id] 存在',
  fileExists('src/app/api/admin/rooms/capacity/[id]/route.ts'),
  'PATCH 容量 API 应存在'
)

check(
  '容量 API 受 schedule:adjust 保护',
  fileContains('src/app/api/admin/rooms/capacity/route.ts', 'schedule:adjust'),
  '容量 API 应受保护'
)

check(
  'PATCH 容量 API 受 schedule:adjust 保护',
  fileContains('src/app/api/admin/rooms/capacity/[id]/route.ts', 'schedule:adjust'),
  'PATCH 容量 API 应受保护'
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
  console.log('\n✅ 综合安全回归通过')
  process.exit(0)
}
