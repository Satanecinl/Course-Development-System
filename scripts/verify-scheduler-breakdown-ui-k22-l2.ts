// scripts/verify-scheduler-breakdown-ui-k22-l2.ts
// K22-L2-SCHEDULER-RESULT-BREAKDOWN-UI
//
// Verifies that:
//  1. The score-breakdown helper produces a complete, stable breakdown
//     covering all 16 known constraints (HC1-HC6, SC1-SC10, MIN_PERT).
//  2. buildScoreBreakdown is backwards compatible:
//     - null / undefined input → empty breakdown (no throw)
//     - empty details → zeroed stats for every constraint
//  3. buildWireBreakdown + readSnapshotBreakdown round-trip
//     produces an equivalent structure that the UI can consume.
//  4. Top issues are sorted by severity (block > warn > info) then
//     |totalPenalty| desc, capped at 20.
//  5. Severity buckets follow the documented thresholds.
//  6. The CONSTRAINT_REGISTRY covers all 16 known constraint ids.
//  7. Static check: the score-breakdown module is imported by the
//     history-content.tsx and scheduler-content.tsx, so the UI
//     actually uses the field.
//  8. Static check: runs/[id]/route.ts reads snapshot.scoreBreakdown
//     and emits it on the response.
//  9. Static check: preview.ts computes and writes scoreBreakdown
//     into resultSnapshot and into the PreviewResult return value.
// 10. Static check: legacy runs (no scoreBreakdown sub-object) are
//     tolerated by both the API parser and the UI display.
//
// Pure file-based / type-driven — no DB writes.

import { readFileSync, existsSync } from 'fs'
import { join } from 'path'

import {
  CONSTRAINT_REGISTRY,
  buildScoreBreakdown,
  buildBreakdownFromDetails,
  buildWireBreakdown,
  readPersistedBreakdown,
  readSnapshotBreakdown,
} from '../src/lib/scheduler/score-breakdown'

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

function assertEqual<T>(a: T, b: T, message: string) {
  const ok = a === b
  if (ok) {
    passed++
    console.log(`  ✅ ${message} (${a} === ${b})`)
  } else {
    failed++
    console.error(`  ❌ ${message} (expected ${b}, got ${a})`)
  }
}

function fileContains(relPath: string, needle: string): boolean {
  if (!existsSync(join(process.cwd(), relPath))) return false
  return readFileSync(join(process.cwd(), relPath), 'utf-8').includes(needle)
}

function fileRead(relPath: string): string {
  return readFileSync(join(process.cwd(), relPath), 'utf-8')
}

// ─── A. Registry stability ─────────────────────────────────

function testRegistry() {
  console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━')
  console.log('A. CONSTRAINT_REGISTRY 稳定性')
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━')

  assertEqual(CONSTRAINT_REGISTRY.length, 16, 'registry 覆盖 16 个约束 (HC1-HC6 + SC1-SC10 + MIN_PERT)')

  const ids = new Set(CONSTRAINT_REGISTRY.map((c) => c.id))
  const expectedIds = [
    'HC1', 'HC2', 'HC3', 'HC4', 'HC5', 'HC6',
    'SC1', 'SC2', 'SC3', 'SC4', 'SC6', 'SC7', 'SC8', 'SC9', 'SC10',
    'MIN_PERT',
  ]
  for (const id of expectedIds) {
    assert(ids.has(id), `registry 包含 ${id}`)
  }

  // 类型 vs 类别一致性
  for (const c of CONSTRAINT_REGISTRY) {
    if (c.id.startsWith('HC')) {
      assertEqual(c.level, 'HARD', `${c.id} level=HARD`)
      assertEqual(c.category, 'HARD', `${c.id} category=HARD`)
    } else {
      assertEqual(c.level, 'SOFT', `${c.id} level=SOFT`)
    }
    if (c.id === 'MIN_PERT') {
      assertEqual(c.category, 'PERTURBATION', `${c.id} category=PERTURBATION`)
    }
  }

  // Penalty 常量正确性 (mirror K22-L1 evaluation)
  const expectedPenalty: Record<string, number> = {
    HC1: -1000, HC2: -1000, HC3: -1000, HC4: -1000, HC5: -1000, HC6: -1000,
    SC1: -5, SC2: -10, SC3: -1, SC4: -5,
    SC6: -20, SC7: -15, SC8: -2, SC9: -2, SC10: -2,
    MIN_PERT: -2,
  }
  for (const c of CONSTRAINT_REGISTRY) {
    assertEqual(c.penalty, expectedPenalty[c.id], `${c.id} penalty=${expectedPenalty[c.id]}`)
  }

  // Type string 唯一性
  const types = new Set(CONSTRAINT_REGISTRY.map((c) => c.type))
  assertEqual(types.size, CONSTRAINT_REGISTRY.length, 'type 字符串唯一')
}

// ─── B. buildScoreBreakdown 输入契约 ──────────────────────

function testNullSafety() {
  console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━')
  console.log('B. buildScoreBreakdown 输入契约 (backwards compat)')
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━')

  // null input
  const empty = buildScoreBreakdown('AFTER', null)
  assertEqual(empty.source, 'AFTER', 'null 输入 → source 仍保留')
  assertEqual(empty.hardScore, 0, 'null 输入 → hardScore=0')
  assertEqual(empty.softScore, 0, 'null 输入 → softScore=0')
  assertEqual(empty.totalDetails, 0, 'null 输入 → totalDetails=0')
  assertEqual(empty.constraints.length, 16, 'null 输入 → constraints 仍 16 个 (zeroed)')
  assertEqual(empty.topIssues.length, 0, 'null 输入 → topIssues=[]')
  assert(empty.businessCards, 'null 输入 → businessCards 存在')
  for (const c of empty.constraints) {
    assertEqual(c.triggerCount, 0, `null 输入 → ${c.id} triggerCount=0`)
    assertEqual(c.totalPenalty, 0, `null 输入 → ${c.id} totalPenalty=0`)
    assertEqual(c.severity, 'pass', `null 输入 → ${c.id} severity=pass`)
  }

  // empty details array
  const emptyDetails = buildBreakdownFromDetails('BEFORE', 0, 0, [])
  assertEqual(emptyDetails.totalDetails, 0, '空 details → totalDetails=0')
  assertEqual(emptyDetails.constraints.length, 16, '空 details → 16 个 zeroed constraints')

  // null details
  const nullDetails = buildBreakdownFromDetails('AFTER', -1000, -50, null)
  assertEqual(nullDetails.totalDetails, 0, 'null details → totalDetails=0')

  // undefined details
  const undefDetails = buildBreakdownFromDetails('BEFORE', 0, 0, undefined)
  assertEqual(undefDetails.totalDetails, 0, 'undefined details → totalDetails=0')
}

// ─── C. 正常输入行为 ─────────────────────────────────────

function testNormalInput() {
  console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━')
  console.log('C. buildScoreBreakdown 正常输入')
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━')

  const details = [
    // HC1 教室冲突 - 1 次
    { type: 'HC1_ROOM_CONFLICT', level: 'HARD' as const, penalty: -1000, message: 'HC1 示例' },
    // SC2 一次
    { type: 'SC2_SAME_DAY', level: 'SOFT' as const, penalty: -10, message: 'SC2 示例 1' },
    { type: 'SC2_SAME_DAY', level: 'SOFT' as const, penalty: -10, message: 'SC2 示例 2' },
    // SC8 三次
    { type: 'SC8_CLASS_GAP', level: 'SOFT' as const, penalty: -2, message: 'SC8 示例 1' },
    { type: 'SC8_CLASS_GAP', level: 'SOFT' as const, penalty: -2, message: 'SC8 示例 2' },
    { type: 'SC8_CLASS_GAP', level: 'SOFT' as const, penalty: -2, message: 'SC8 示例 3' },
    // MIN_PERT 5 次
    ...Array.from({ length: 5 }, (_, i) => ({
      type: 'MINIMUM_PERTURBATION' as const, level: 'SOFT' as const, penalty: -2, message: `MIN_PERT 示例 ${i+1}`,
    })),
  ]

  const bd = buildScoreBreakdown('AFTER', { hardScore: -1000, softScore: -36, details })
  assertEqual(bd.hardScore, -1000, 'hardScore 透传')
  assertEqual(bd.softScore, -36, 'softScore 透传')
  assertEqual(bd.totalDetails, details.length, 'totalDetails 计数正确')
  assertEqual(bd.source, 'AFTER', 'source 透传')

  // 单约束检查
  const hc1 = bd.constraints.find((c) => c.id === 'HC1')!
  assertEqual(hc1.triggerCount, 1, 'HC1 计数=1')
  assertEqual(hc1.totalPenalty, -1000, 'HC1 总扣分=-1000')
  assertEqual(hc1.severity, 'block', 'HC1 1 次 → severity=block (HARD)')

  const sc2 = bd.constraints.find((c) => c.id === 'SC2')!
  assertEqual(sc2.triggerCount, 2, 'SC2 计数=2')
  assertEqual(sc2.totalPenalty, -20, 'SC2 总扣分=-20')
  assertEqual(sc2.averagePenalty, -10, 'SC2 平均=-10')

  const sc8 = bd.constraints.find((c) => c.id === 'SC8')!
  assertEqual(sc8.triggerCount, 3, 'SC8 计数=3')
  assertEqual(sc8.totalPenalty, -6, 'SC8 总扣分=-6')

  const minPert = bd.constraints.find((c) => c.id === 'MIN_PERT')!
  assertEqual(minPert.triggerCount, 5, 'MIN_PERT 计数=5')
  assertEqual(minPert.totalPenalty, -10, 'MIN_PERT 总扣分=-10')

  // 未触发的约束也应在列表中
  const sc7 = bd.constraints.find((c) => c.id === 'SC7')!
  assertEqual(sc7.triggerCount, 0, '未触发的 SC7 仍存在且 triggerCount=0')
  assertEqual(sc7.severity, 'pass', '未触发的 SC7 severity=pass')

  // topExamples 上限
  assert(minPert.topExamples.length === 5, 'MIN_PERT topExamples=5 (上限)')
}

// ─── D. Top issues 排序与上限 ───────────────────────────

function testTopIssues() {
  console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━')
  console.log('D. Top issues 排序与上限')
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━')

  // 制造混合: 1 HARD block, 5 SOFT warn (SC7 5 次), 1 SOFT info (SC3 1 次), 30 SC8
  const details: { type: string; level: 'HARD' | 'SOFT'; penalty: number; message?: string }[] = [
    { type: 'HC1_ROOM_CONFLICT', level: 'HARD', penalty: -1000, message: 'HC1' },
    ...Array.from({ length: 5 }, () => ({ type: 'SC7_WEEKEND_AVOIDANCE', level: 'SOFT' as const, penalty: -15, message: 'SC7' })),
    { type: 'SC3_EXTREME_TIME_SLOT', level: 'SOFT', penalty: -1, message: 'SC3' },
    ...Array.from({ length: 30 }, () => ({ type: 'SC8_CLASS_GAP', level: 'SOFT' as const, penalty: -2, message: 'SC8' })),
  ]

  const bd = buildScoreBreakdown('AFTER', { hardScore: -1000, softScore: -786, details })
  const top = bd.topIssues

  // 上限 20
  assert(top.length <= 20, `topIssues 上限 ≤ 20 (实际 ${top.length})`)

  // 第一名必须是 HC1 (block severity 优先)
  assertEqual(top[0].constraintId, 'HC1', '第一名是 HC1 (block severity)')
  assertEqual(top[0].severity, 'block', '第一名 severity=block')

  // 后续应该都是 SOFT (HARD 只有 HC1 一个)
  for (let i = 1; i < top.length; i++) {
    assertEqual(top[i].level, 'SOFT', `top[${i}] level=SOFT`)
  }

  // rank 严格递增
  for (let i = 0; i < top.length; i++) {
    assertEqual(top[i].rank, i + 1, `top[${i}].rank = ${i+1}`)
  }
}

// ─── E. Severity 阈值 ───────────────────────────────────

function testSeverityThresholds() {
  console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━')
  console.log('E. Severity 阈值')
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━')

  // SC7: 0=pass, 1=warn, 5=block
  const mk = (n: number) => Array.from({ length: n }, () => ({
    type: 'SC7_WEEKEND_AVOIDANCE' as const, level: 'SOFT' as const, penalty: -15,
  }))
  const bd0 = buildScoreBreakdown('AFTER', { hardScore: 0, softScore: 0, details: mk(0) })
  const bd1 = buildScoreBreakdown('AFTER', { hardScore: 0, softScore: 0, details: mk(1) })
  const bd4 = buildScoreBreakdown('AFTER', { hardScore: 0, softScore: 0, details: mk(4) })
  const bd5 = buildScoreBreakdown('AFTER', { hardScore: 0, softScore: 0, details: mk(5) })

  const sc70 = bd0.constraints.find((c) => c.id === 'SC7')!
  const sc71 = bd1.constraints.find((c) => c.id === 'SC7')!
  const sc74 = bd4.constraints.find((c) => c.id === 'SC7')!
  const sc75 = bd5.constraints.find((c) => c.id === 'SC7')!

  assertEqual(sc70.severity, 'pass', 'SC7 0 次 → pass')
  assertEqual(sc71.severity, 'warn', 'SC7 1 次 → warn')
  assertEqual(sc74.severity, 'warn', 'SC7 4 次 → warn')
  assertEqual(sc75.severity, 'block', 'SC7 5 次 → block')

  // SC8: 0=pass, 1=info, 4=info, 5=warn, 20=block
  const mk8 = (n: number) => Array.from({ length: n }, () => ({
    type: 'SC8_CLASS_GAP' as const, level: 'SOFT' as const, penalty: -2,
  }))
  const bd8_1 = buildScoreBreakdown('AFTER', { hardScore: 0, softScore: 0, details: mk8(1) })
  const bd8_5 = buildScoreBreakdown('AFTER', { hardScore: 0, softScore: 0, details: mk8(5) })
  const bd8_20 = buildScoreBreakdown('AFTER', { hardScore: 0, softScore: 0, details: mk8(20) })
  assertEqual(bd8_1.constraints.find((c) => c.id === 'SC8')!.severity, 'info', 'SC8 1 次 → info')
  assertEqual(bd8_5.constraints.find((c) => c.id === 'SC8')!.severity, 'warn', 'SC8 5 次 → warn')
  assertEqual(bd8_20.constraints.find((c) => c.id === 'SC8')!.severity, 'block', 'SC8 20 次 → block')
}

// ─── F. Wire shape round-trip ───────────────────────────

function testWireRoundTrip() {
  console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━')
  console.log('F. Wire shape round-trip')
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━')

  const before = buildScoreBreakdown('BEFORE', { hardScore: -1000, softScore: -1577, details: [
    { type: 'HC1_ROOM_CONFLICT', level: 'HARD', penalty: -1000, message: 'HC1 before' },
  ] })
  const after = buildScoreBreakdown('AFTER', { hardScore: 0, softScore: -1281, details: [
    ...Array.from({ length: 90 }, () => ({ type: 'SC3_EXTREME_TIME_SLOT' as const, level: 'SOFT' as const, penalty: -1 })),
    ...Array.from({ length: 76 }, () => ({ type: 'SC9_TEACHING_TASK_ROOM_STABILITY' as const, level: 'SOFT' as const, penalty: -2 })),
    ...Array.from({ length: 427 }, () => ({ type: 'MINIMUM_PERTURBATION' as const, level: 'SOFT' as const, penalty: -2 })),
  ] })

  const wire = buildWireBreakdown(before, after)
  assertEqual(wire.version, 1, 'wire.version=1')

  // JSON 往返 (wire 必须包裹在 resultSnapshot shape 中)
  const snapshot = JSON.stringify({ scoreBreakdown: wire })
  const parsed = JSON.parse(snapshot)
  assertEqual(parsed.scoreBreakdown.before.hardScore, -1000, 'snapshot JSON before.hardScore 正确')
  assertEqual(parsed.scoreBreakdown.after.softScore, -1281, 'snapshot JSON after.softScore 正确')
  assertEqual(parsed.scoreBreakdown.after.constraints.length, 16, 'snapshot JSON after.constraints=16')

  // readSnapshotBreakdown
  const restored = readSnapshotBreakdown(snapshot)
  assert(restored !== null, 'readSnapshotBreakdown → 非 null')
  assertEqual(restored!.version, 1, 'restored.version=1')
  assertEqual(restored!.after.softScore, -1281, 'restored after.softScore 正确')
  assertEqual(restored!.after.constraints.length, 16, 'restored after.constraints=16')

  // readPersistedBreakdown
  const beforeBd = readPersistedBreakdown(restored!.before, 'BEFORE')
  const afterBd = readPersistedBreakdown(restored!.after, 'AFTER')
  assert(beforeBd !== null && afterBd !== null, 'readPersistedBreakdown 双侧均非 null')
  assertEqual(beforeBd!.hardScore, -1000, 'restored before.hardScore 正确')
  assertEqual(afterBd!.softScore, -1281, 'restored after.softScore 正确')

  // Top issues 在 wire 中仍可读
  assert(afterBd!.topIssues.length > 0, 'restored after.topIssues 存在')
}

// ─── G. Backwards compat: 旧 run 无 scoreBreakdown ───────

function testLegacyBackwardsCompat() {
  console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━')
  console.log('G. Backwards compat: 旧 run 无 scoreBreakdown')
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━')

  // 旧 resultSnapshot 字符串 (K22-L2 之前)
  const legacySnapshot = JSON.stringify({
    scoreBefore: { hardScore: -1000, softScore: -500 },
    scoreAfter: { hardScore: 0, softScore: -100 },
    hcBefore: { hc1: 1, hc2: 0, hc3: 0, hc4: 0 },
    hcAfter: { hc1: 0, hc2: 0, hc3: 0, hc4: 0 },
    proposedChanges: [],
    blockReasons: [],
    solverMetrics: null,
    lockedSlotIds: [],
    lockedSlotCount: 0,
    semesterId: 1,
    semesterCode: 'LEGACY-DEFAULT',
    semesterName: '既有数据默认学期',
    config: { configId: null, name: null, maxIterations: 10000, lahcWindowSize: 500, randomSeed: 42, lockedSlotIds: [], solverVersion: 'lahc-hard-first-v3', source: 'DEFAULT', snapshotTakenAt: '2026-05-27T00:00:00Z' },
    // 注意: 没有 scoreBreakdown 字段
  })

  const restored = readSnapshotBreakdown(legacySnapshot)
  assertEqual(restored, null, '旧 snapshot 无 scoreBreakdown → restored=null')

  // 空字符串
  assertEqual(readSnapshotBreakdown(''), null, '空字符串 → null')
  assertEqual(readSnapshotBreakdown(null), null, 'null → null')
  assertEqual(readSnapshotBreakdown(undefined), null, 'undefined → null')

  // 损坏 JSON
  assertEqual(readSnapshotBreakdown('not json {{{'), null, '损坏 JSON → null')
}

// ─── H. Static wiring 检查 ──────────────────────────────

function testStaticWiring() {
  console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━')
  console.log('H. 静态接线检查 (文件 / 字符串)')
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━')

  // 1. preview.ts 写入 scoreBreakdown
  const previewSrc = fileRead('src/lib/scheduler/preview.ts')
  assert(previewSrc.includes('buildWireBreakdown'), 'preview.ts 引用 buildWireBreakdown')
  assert(previewSrc.includes('buildScoreBreakdown'), 'preview.ts 引用 buildScoreBreakdown')
  assert(previewSrc.includes('scoreBreakdown,'), 'preview.ts 在 resultSnapshot JSON 中包含 scoreBreakdown 字段')
  assert(/scoreBreakdown,?\s*\n\s*\}/m.test(previewSrc), 'preview.ts 在 return 中返回 scoreBreakdown')

  // 2. runs/[id]/route.ts 读取并转发
  const routeSrc = fileRead('src/app/api/admin/scheduler/runs/[id]/route.ts')
  assert(routeSrc.includes('readSnapshotBreakdown'), 'runs/[id]/route.ts 引用 readSnapshotBreakdown')
  assert(/scoreBreakdown: RunDetail\['scoreBreakdown'\] = null/.test(routeSrc), 'runs/[id]/route.ts 初始化 scoreBreakdown=null')
  assert(routeSrc.includes('scoreBreakdown,'), 'runs/[id]/route.ts 把 scoreBreakdown 写入 runDetail')

  // 3. history-content.tsx 接收并展示
  const histSrc = fileRead('src/app/admin/scheduler/history/history-content.tsx')
  assert(histSrc.includes('ScoreBreakdownDisplay'), 'history-content.tsx 引用 ScoreBreakdownDisplay')
  assert(histSrc.includes('ResultSnapshotScoreBreakdown'), 'history-content.tsx 引用类型 ResultSnapshotScoreBreakdown')
  assert(/scoreBreakdown\?:\s*ResultSnapshotScoreBreakdown/.test(histSrc), 'history-content.tsx 在 RunDetailData 类型中定义 scoreBreakdown?')

  // 4. scheduler-content.tsx 接收并展示
  const schSrc = fileRead('src/app/admin/scheduler/scheduler-content.tsx')
  assert(schSrc.includes('ScoreBreakdownDisplay'), 'scheduler-content.tsx 引用 ScoreBreakdownDisplay')
  assert(schSrc.includes('ResultSnapshotScoreBreakdown'), 'scheduler-content.tsx 引用类型 ResultSnapshotScoreBreakdown')
  assert(/scoreBreakdown\?:\s*ResultSnapshotScoreBreakdown/.test(schSrc), 'scheduler-content.tsx 在 PreviewResponse 类型中定义 scoreBreakdown?')

  // 5. 组件文件存在
  assert(
    fileContains('src/components/score-breakdown-display.tsx', 'export function ScoreBreakdownDisplay'),
    'src/components/score-breakdown-display.tsx 存在并导出 ScoreBreakdownDisplay',
  )

  // 6. helper 文件存在
  assert(
    fileContains('src/lib/scheduler/score-breakdown.ts', 'export function buildScoreBreakdown'),
    'src/lib/scheduler/score-breakdown.ts 存在并导出 buildScoreBreakdown',
  )
  assert(
    fileContains('src/lib/scheduler/score-breakdown.ts', 'export function readSnapshotBreakdown'),
    'src/lib/scheduler/score-breakdown.ts 导出 readSnapshotBreakdown',
  )
}

// ─── I. UI 渲染安全性 ───────────────────────────────────

function testUiRenderingSafety() {
  console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━')
  console.log('I. UI 渲染安全性 (Props contract)')
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━')

  const compSrc = fileRead('src/components/score-breakdown-display.tsx')
  assert(/breakdown[\s\S]*null[\s\S]*旧运行/.test(compSrc), '组件在 breakdown=null 时显示 "旧运行无 breakdown" 文案')
  assert(/breakdown\.version/.test(compSrc), '组件展示 version 标签')

  // 不应假设 scoreBreakdown 一定存在 (runtime check)
  assert(/readPersistedBreakdown\(/.test(compSrc), '组件使用 readPersistedBreakdown 做容错读取')
}

// ─── Main ────────────────────────────────────────────────

function main() {
  console.log('🧪 K22-L2 Scheduler Result Breakdown UI — 验证脚本')

  testRegistry()
  testNullSafety()
  testNormalInput()
  testTopIssues()
  testSeverityThresholds()
  testWireRoundTrip()
  testLegacyBackwardsCompat()
  testStaticWiring()
  testUiRenderingSafety()

  console.log(`\n${'═'.repeat(50)}`)
  console.log(`📊 结果: ${passed} passed, ${failed} failed`)
  console.log(`${'═'.repeat(50)}`)
  if (failed > 0) process.exit(1)
}

main()
