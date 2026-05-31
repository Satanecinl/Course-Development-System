/**
 * K10-SCHEDULER-LOCKED-SLOTS-UI 测试脚本
 *
 * 覆盖：
 * - 静态检查：Preview API、前端、lockable-slots API
 * - 逻辑验证：lockedSlotIds 校验、传递、显示
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
console.log('K10-SCHEDULER-LOCKED-SLOTS-UI 测试')
console.log('════════════════════════════════════════════════════════════\n')

// 1. Preview API 静态检查
console.log('─── 1. Preview API 检查 ───\n')

check(
  'Preview route 接收 lockedSlotIds',
  fileContains('src/app/api/admin/scheduler/preview/route.ts', 'lockedSlotIds?: number[]'),
  'PreviewRequest 应有 lockedSlotIds 字段'
)

check(
  'Preview route 校验 lockedSlotIds 非数组',
  fileContains('src/app/api/admin/scheduler/preview/route.ts', 'INVALID_LOCKED_SLOT_IDS'),
  '应校验 lockedSlotIds 必须是数组'
)

check(
  'Preview route 校验 lockedSlotIds 为正整数',
  fileContains('src/app/api/admin/scheduler/preview/route.ts', 'INVALID_LOCKED_SLOT_ID'),
  '应校验 lockedSlotIds 每项是正整数'
)

check(
  'Preview route 去重 lockedSlotIds',
  fileContains('src/app/api/admin/scheduler/preview/route.ts', 'new Set('),
  '应去重 lockedSlotIds'
)

check(
  'Preview route 校验 ScheduleSlot 存在',
  fileContains('src/app/api/admin/scheduler/preview/route.ts', 'INVALID_SLOT_IDS'),
  '应校验 ScheduleSlot ID 存在'
)

// 2. Preview helper 检查
console.log('\n─── 2. Preview helper 检查 ───\n')

check(
  'PreviewOptions 有 lockedSlotIds',
  fileContains('src/lib/scheduler/preview.ts', 'lockedSlotIds?: number[]'),
  'PreviewOptions 应有 lockedSlotIds 字段'
)

check(
  'PreviewResult 有 lockedSlotIds',
  fileContains('src/lib/scheduler/preview.ts', 'lockedSlotIds: number[]'),
  'PreviewResult 应有 lockedSlotIds 字段'
)

check(
  'PreviewResult 有 lockedSlotCount',
  fileContains('src/lib/scheduler/preview.ts', 'lockedSlotCount: number'),
  'PreviewResult 应有 lockedSlotCount 字段'
)

check(
  'preview.ts 传 lockedSlotIds 给 solve',
  fileContains('src/lib/scheduler/preview.ts', 'lockedSlotIds: new Set(lockedSlotIds)'),
  '应将 lockedSlotIds 转为 Set 传给 solve'
)

check(
  'resultSnapshot 保存 lockedSlotIds',
  fileContains('src/lib/scheduler/preview.ts', 'lockedSlotIds,') &&
    fileContains('src/lib/scheduler/preview.ts', 'lockedSlotCount:'),
  'resultSnapshot 应保存 lockedSlotIds 和 lockedSlotCount'
)

// 3. Lockable slots API 检查
console.log('\n─── 3. Lockable slots API 检查 ───\n')

check(
  'lockable-slots API 存在',
  fileExists('src/app/api/admin/scheduler/lockable-slots/route.ts'),
  '应存在 lockable-slots API'
)

check(
  'lockable-slots API 只有 GET',
  fileContains('src/app/api/admin/scheduler/lockable-slots/route.ts', 'export async function GET') &&
    !fileContains('src/app/api/admin/scheduler/lockable-slots/route.ts', 'export async function POST'),
  'lockable-slots API 应只有 GET 方法'
)

check(
  'lockable-slots API 有 requirePermission',
  fileContains('src/app/api/admin/scheduler/lockable-slots/route.ts', 'requirePermission'),
  '应有 requirePermission 保护'
)

check(
  'lockable-slots API 不写数据库',
  !fileContains('src/app/api/admin/scheduler/lockable-slots/route.ts', 'prisma.scheduleSlot.create') &&
    !fileContains('src/app/api/admin/scheduler/lockable-slots/route.ts', 'prisma.scheduleSlot.update'),
  '不应写数据库'
)

// 4. 前端 UI 检查
console.log('\n─── 4. 前端 UI 检查 ───\n')

check(
  '页面包含"锁定课表槽位"',
  fileContains('src/app/admin/scheduler/scheduler-content.tsx', '锁定课表槽位'),
  '应有锁定区域标题'
)

check(
  '页面有 selectedSlotIds 状态',
  fileContains('src/app/admin/scheduler/scheduler-content.tsx', 'selectedSlotIds'),
  '应有选中 slot 状态'
)

check(
  '页面有清空选择功能',
  fileContains('src/app/admin/scheduler/scheduler-content.tsx', 'clearSlotSelection'),
  '应有清空选择功能'
)

check(
  '页面有搜索功能',
  fileContains('src/app/admin/scheduler/scheduler-content.tsx', 'lockSearchQuery'),
  '应有搜索功能'
)

check(
  'Preview 请求携带 lockedSlotIds',
  fileContains('src/app/admin/scheduler/scheduler-content.tsx', 'body.lockedSlotIds = Array.from(selectedSlotIds)'),
  'Preview 请求应携带 lockedSlotIds'
)

check(
  'Preview 结果显示 lockedSlotCount',
  fileContains('src/app/admin/scheduler/scheduler-content.tsx', 'previewData.lockedSlotCount'),
  'Preview 结果应显示锁定数量'
)

// 5. Gatekeeper 安全检查
console.log('\n─── 5. Gatekeeper 安全检查 ───\n')

check(
  'Apply 请求不传 lockedSlotIds',
  !fileContains('src/app/admin/scheduler/scheduler-content.tsx', 'lockedSlotIds') ||
    !(/apply.*lockedSlotIds|lockedSlotIds.*apply/i.test(readFileSync('src/app/admin/scheduler/scheduler-content.tsx'))),
  'Apply 请求不应传 lockedSlotIds'
)

check(
  'Rollback 请求不传 lockedSlotIds',
  !(/rollback.*lockedSlotIds|lockedSlotIds.*rollback/i.test(readFileSync('src/app/admin/scheduler/scheduler-content.tsx'))),
  'Rollback 请求不应传 lockedSlotIds'
)

check(
  '无 /api/scheduler/run 路由',
  !fileExists('src/app/api/admin/scheduler/run/route.ts'),
  '不应存在 /api/scheduler/run 路由'
)

check(
  '无 Re-run 按钮',
  !fileContains('src/app/admin/scheduler/scheduler-content.tsx', 'rerun|re-run|Re-run'),
  '不应有 Re-run 按钮'
)

// 6. 历史页检查
console.log('\n─── 6. 历史页检查 ───\n')

check(
  '历史页有 lockedSlotCount 字段',
  fileContains('src/app/admin/scheduler/history/history-content.tsx', 'lockedSlotCount'),
  '历史页应显示 lockedSlotCount'
)

check(
  '历史页有 lockedSlotIds 字段',
  fileContains('src/app/admin/scheduler/history/history-content.tsx', 'lockedSlotIds'),
  '历史页应显示 lockedSlotIds'
)

check(
  '历史详情 API 返回 lockedSlotIds',
  fileContains('src/app/api/admin/scheduler/runs/[id]/route.ts', 'lockedSlotIds'),
  '历史详情 API 应返回 lockedSlotIds'
)

// 7. Solver 未修改检查
console.log('\n─── 7. Solver 未修改检查 ───\n')

check(
  'solver.ts 仍使用 lockedSlotIds',
  fileContains('src/lib/scheduler/solver.ts', 'lockedSlotIds') &&
    fileContains('src/lib/scheduler/solver.ts', 'if (!lockedSlotIds?.has(slot.id))'),
  'solver.ts 应继续使用 lockedSlotIds 过滤'
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
  console.log('\n✅ 测试通过')
  process.exit(0)
}
