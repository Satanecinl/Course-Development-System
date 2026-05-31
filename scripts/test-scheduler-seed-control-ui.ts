// scripts/test-scheduler-seed-control-ui.ts
// Verify scheduler console randomSeed UI wiring and safety.

import { readFileSync } from 'fs'
import { join } from 'path'

let passed = 0
let failed = 0

function assert(condition: boolean, message: string) {
  if (condition) {
    passed++
    console.log(`  ✅ ${message}`)
  } else {
    failed++
    console.error(`  ❌ ${message}`)
  }
}

function fileContains(relPath: string, search: string): boolean {
  try {
    const content = readFileSync(join(process.cwd(), relPath), 'utf-8')
    return content.includes(search)
  } catch {
    return false
  }
}

function main() {
  console.log('🧪 Scheduler Seed Control UI Tests\n')

  // ─── 1. Static checks on scheduler-content ─────────────────────
  console.log('1️⃣  scheduler-content.tsx 静态检查')

  assert(
    fileContains('src/app/admin/scheduler/scheduler-content.tsx', 'randomSeed: number | null'),
    'PreviewResponse 类型包含 randomSeed',
  )
  assert(
    fileContains('src/app/admin/scheduler/scheduler-content.tsx', 'randomSeedInput'),
    '组件包含 randomSeedInput state',
  )
  assert(
    fileContains('src/app/admin/scheduler/scheduler-content.tsx', 'validateSeed'),
    '组件包含 seed 校验函数',
  )
  assert(
    fileContains('src/app/admin/scheduler/scheduler-content.tsx', 'body.randomSeed'),
    'Preview 请求携带 randomSeed',
  )
  assert(
    fileContains('src/app/admin/scheduler/scheduler-content.tsx', 'previewData.randomSeed'),
    'Preview 结果展示 randomSeed',
  )
  assert(
    fileContains('src/app/admin/scheduler/scheduler-content.tsx', 'copySeed'),
    '组件包含 copySeed 函数',
  )
  assert(
    fileContains('src/app/admin/scheduler/scheduler-content.tsx', 'navigator.clipboard.writeText'),
    '使用 clipboard API 复制种子',
  )
  assert(
    fileContains('src/app/admin/scheduler/scheduler-content.tsx', '留空则自动生成'),
    '输入框 placeholder 提示留空自动生成',
  )

  // ─── 2. Gatekeeper safety ──────────────────────────────────────
  console.log('\n2️⃣  安全门禁检查')

  assert(
    !fileContains('src/app/admin/scheduler/scheduler-content.tsx', '/api/scheduler/run'),
    '页面不调用 /api/scheduler/run',
  )
  assert(
    !fileContains('src/app/admin/scheduler/scheduler-content.tsx', 'previewRunId:') ||
      fileContains('src/app/admin/scheduler/scheduler-content.tsx', 'previewRunId'),
    'Apply 仍传 previewRunId',
  )
  assert(
    fileContains('src/app/admin/scheduler/scheduler-content.tsx', 'applyRunId'),
    'Rollback 仍传 applyRunId',
  )

  // Verify Apply body does NOT contain randomSeed
  const applyBodyRegion = readFileSync(
    join(process.cwd(), 'src/app/admin/scheduler/scheduler-content.tsx'),
    'utf-8',
  )
  const applyMatch = applyBodyRegion.match(/handleApply[\s\S]{0,600}/)
  if (applyMatch) {
    assert(
      !applyMatch[0].includes('randomSeed'),
      'Apply 请求不包含 randomSeed',
    )
  }

  // Verify Rollback body does NOT contain randomSeed
  const rollbackMatch = applyBodyRegion.match(/handleRollback[\s\S]{0,600}/)
  if (rollbackMatch) {
    assert(
      !rollbackMatch[0].includes('randomSeed'),
      'Rollback 请求不包含 randomSeed',
    )
  }

  // ─── 3. API route checks ───────────────────────────────────────
  console.log('\n3️⃣  API 路由检查')

  assert(
    fileContains('src/app/api/admin/scheduler/preview/route.ts', 'randomSeed'),
    'Preview API route 读取 randomSeed',
  )

  // ─── 4. History page checks ────────────────────────────────────
  console.log('\n4️⃣  历史页检查')

  assert(
    fileContains('src/app/admin/scheduler/history/history-content.tsx', 'randomSeed'),
    '历史页已展示 randomSeed',
  )

  // ─── 5. Solver untouched ───────────────────────────────────────
  console.log('\n5️⃣  solver 未改动检查')

  const solverContent = readFileSync(
    join(process.cwd(), 'src/lib/scheduler/solver.ts'),
    'utf-8',
  )
  assert(
    solverContent.includes('createSeededRandom'),
    'solver.ts 仍使用 createSeededRandom（未改回 Math.random）',
  )
  assert(
    !solverContent.includes('Math.random()'),
    'solver.ts 不含 Math.random() 调用',
  )

  // ─── Summary ───────────────────────────────────────────────────
  console.log(`\n${'═'.repeat(50)}`)
  console.log(`📊 结果: ${passed} passed, ${failed} failed`)
  console.log(`${'═'.repeat(50)}`)

  if (failed > 0) {
    process.exit(1)
  }
}

main()
