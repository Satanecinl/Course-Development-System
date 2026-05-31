// scripts/test-scheduler-seeded-prng.ts
// Seeded PRNG audit and reproducibility test for the LAHC solver.
// Read-only on dev.db. Does NOT write ScheduleSlot, Room, TeachingTask, etc.

import { readFileSync } from 'fs'
import { join } from 'path'
import {
  normalizeSeed,
  createSeededRandom,
  randInt,
  shuffle,
} from '../src/lib/scheduler/prng'
import { loadSchedulingContext } from '../src/lib/scheduler/data-loader'
import { buildInitialState, solve } from '../src/lib/scheduler/solver'
import { calculateInitialScore, calculateScoreWithDetails } from '../src/lib/scheduler/score'

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

function arraysEqual<T>(a: T[], b: T[]): boolean {
  if (a.length !== b.length) return false
  for (let i = 0; i < a.length; i++) {
    if (a[i] !== b[i]) return false
  }
  return true
}

function fileContains(relPath: string, search: string): boolean {
  try {
    const content = readFileSync(join(process.cwd(), relPath), 'utf-8')
    return content.includes(search)
  } catch {
    return false
  }
}

// ─── A. PRNG Unit Tests ──────────────────────────────────────────

function testPrng() {
  console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━')
  console.log('A. PRNG 单元测试')
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━')

  // A1. Same seed same sequence
  const seq1: number[] = []
  const seq2: number[] = []
  const rng1 = createSeededRandom(12345)
  const rng2 = createSeededRandom(12345)
  for (let i = 0; i < 20; i++) {
    seq1.push(rng1())
    seq2.push(rng2())
  }
  assert(arraysEqual(seq1, seq2), '同 seed (12345) 序列完全一致（前20个）')

  // A2. Different seed different sequence
  const seq3: number[] = []
  const rng3 = createSeededRandom(54321)
  for (let i = 0; i < 20; i++) seq3.push(rng3())
  assert(!arraysEqual(seq1, seq3), '不同 seed (12345 vs 54321) 序列不同')

  // A3. String seed stable
  const strSeq1: number[] = []
  const strSeq2: number[] = []
  const rngS1 = createSeededRandom('abc')
  const rngS2 = createSeededRandom('abc')
  for (let i = 0; i < 20; i++) {
    strSeq1.push(rngS1())
    strSeq2.push(rngS2())
  }
  assert(arraysEqual(strSeq1, strSeq2), '字符串 seed ("abc") 序列一致')

  // A4. Output range [0, 1)
  const rngRange = createSeededRandom(99999)
  let allInRange = true
  for (let i = 0; i < 1000; i++) {
    const v = rngRange()
    if (v < 0 || v >= 1) {
      allInRange = false
      break
    }
  }
  assert(allInRange, '1000 次输出全部在 [0, 1) 范围内')

  // A5. normalizeSeed with null generates a number
  const ns1 = normalizeSeed(null)
  const ns2 = normalizeSeed(undefined)
  assert(typeof ns1 === 'number' && ns1 >= 0, 'normalizeSeed(null) 生成非负数')
  assert(typeof ns2 === 'number' && ns2 >= 0, 'normalizeSeed(undefined) 生成非负数')

  // A6. randInt inclusive range
  const rngInt = createSeededRandom(77777)
  let intInRange = true
  for (let i = 0; i < 500; i++) {
    const v = randInt(rngInt, 1, 6)
    if (v < 1 || v > 6) {
      intInRange = false
      break
    }
  }
  assert(intInRange, 'randInt(rng, 1, 6) 500 次全部在 [1,6] 范围内')

  // A7. shuffle changes order (with high probability)
  const rngShuffle = createSeededRandom(88888)
  const arr = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10]
  shuffle(rngShuffle, arr)
  assert(!arraysEqual(arr, [1, 2, 3, 4, 5, 6, 7, 8, 9, 10]), 'shuffle 改变了数组顺序')
}

// ─── B. Solver Reproducibility Tests ─────────────────────────────

async function testSolverReproducibility() {
  console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━')
  console.log('B. Solver 可复现性测试')
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━')

  const ctx = await loadSchedulingContext()
  console.log(`  加载: ${ctx.tasks.length} tasks, ${ctx.rooms.length} rooms, ${ctx.slots.length} slots`)

  const seed = 424242
  const config = { maxIterations: 5000, lahcWindowSize: 300, randomSeed: seed }

  // Run 1
  console.log('  运行 solver 第1次...')
  const result1 = solve(ctx, config)
  const state1 = result1.bestState
  const scoreDetails1 = calculateScoreWithDetails(ctx, state1)
  const hc1_1 = countConflictsByType(scoreDetails1.details)

  // Proposed changes (relative to original DB state)
  const changes1 = buildChangeList(ctx, state1)

  // Run 2
  console.log('  运行 solver 第2次（相同 seed）...')
  const result2 = solve(ctx, config)
  const state2 = result2.bestState
  const scoreDetails2 = calculateScoreWithDetails(ctx, state2)
  const hc1_2 = countConflictsByType(scoreDetails2.details)

  const changes2 = buildChangeList(ctx, state2)

  // Compare
  assertEqual(result1.usedSeed, result2.usedSeed, '两次 usedSeed 一致')
  assertEqual(result1.usedSeed, seed, 'usedSeed 等于传入的 seed')
  assertEqual(result1.bestScore.hardScore, result2.bestScore.hardScore, 'hardScore 一致')
  assertEqual(result1.bestScore.softScore, result2.bestScore.softScore, 'softScore 一致')
  assertEqual(result1.iterations, result2.iterations, 'iterations 一致')
  assertEqual(hc1_1.hc1, hc1_2.hc1, 'HC1 一致')
  assertEqual(hc1_1.hc2, hc1_2.hc2, 'HC2 一致')
  assertEqual(hc1_1.hc3, hc1_2.hc3, 'HC3 一致')
  assertEqual(hc1_1.hc4, hc1_2.hc4, 'HC4 一致')

  assertEqual(changes1.length, changes2.length, 'changedSlotCount 一致')

  if (changes1.length === changes2.length) {
    let changesMatch = true
    for (let i = 0; i < changes1.length; i++) {
      const a = changes1[i]
      const b = changes2[i]
      if (
        a.slotId !== b.slotId ||
        a.newDay !== b.newDay ||
        a.newSlotIndex !== b.newSlotIndex ||
        a.newRoomId !== b.newRoomId
      ) {
        changesMatch = false
        break
      }
    }
    assert(changesMatch, 'proposed changes 序列完全一致（slotId/day/slot/room）')
  }

  // Different seed → at least PRNG sequence differs
  const configDiff = { maxIterations: 5000, lahcWindowSize: 300, randomSeed: seed + 1 }
  console.log('  运行 solver 第3次（不同 seed）...')
  const result3 = solve(ctx, configDiff)
  assertEqual(result3.usedSeed, seed + 1, '不同 seed 的 usedSeed 正确')

  // We don't force final schedule to differ (data constraints may cause convergence),
  // but we at least verify the solver accepted the different seed.
  console.log('  ℹ️  不同 seed 的最终排课结果是否不同：不强制要求（可能收敛到相同局部最优）')
}

function countConflictsByType(details: { type: string }[]) {
  let hc1 = 0, hc2 = 0, hc3 = 0, hc4 = 0
  for (const d of details) {
    if (d.type === 'HC1_ROOM_CONFLICT') hc1++
    else if (d.type === 'HC2_TEACHER_CONFLICT') hc2++
    else if (d.type === 'HC3_CLASS_CONFLICT') hc3++
    else if (d.type === 'HC4_CAPACITY') hc4++
  }
  return { hc1, hc2, hc3, hc4 }
}

function buildChangeList(
  ctx: { slots: { id: number; dayOfWeek: number; slotIndex: number; roomId: number | null }[] },
  state: { assignments: Map<number, { dayOfWeek: number; slotIndex: number; roomId: number }> },
) {
  const changes: { slotId: number; newDay: number; newSlotIndex: number; newRoomId: number }[] = []
  for (const slot of ctx.slots) {
    const pos = state.assignments.get(slot.id)
    if (!pos) continue
    const origRoom = slot.roomId ?? 0
    if (
      pos.dayOfWeek === slot.dayOfWeek &&
      pos.slotIndex === slot.slotIndex &&
      pos.roomId === origRoom
    ) {
      continue
    }
    changes.push({
      slotId: slot.id,
      newDay: pos.dayOfWeek,
      newSlotIndex: pos.slotIndex,
      newRoomId: pos.roomId,
    })
  }
  // Sort for stable comparison
  changes.sort((a, b) => a.slotId - b.slotId)
  return changes
}

// ─── C. Static Checks ────────────────────────────────────────────

function testStaticChecks() {
  console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━')
  console.log('C. 静态代码检查')
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━')

  assert(
    !fileContains('src/lib/scheduler/solver.ts', 'Math.random()'),
    'solver.ts 中不再包含 Math.random() 调用',
  )

  assert(
    fileContains('src/lib/scheduler/solver.ts', 'createSeededRandom'),
    'solver.ts 导入了 createSeededRandom',
  )

  assert(
    fileContains('src/lib/scheduler/solver.ts', 'usedSeed'),
    'solver.ts 包含 usedSeed',
  )

  assert(
    fileContains('src/lib/scheduler/prng.ts', 'mulberry32'),
    'prng.ts 使用 mulberry32（或等效算法）',
  )

  assert(
    fileContains('src/lib/scheduler/preview.ts', 'solveResult.usedSeed'),
    'preview.ts 使用 solveResult.usedSeed',
  )

  assert(
    fileContains('src/lib/scheduler/preview.ts', 'randomSeed'),
    'preview.ts 仍保留 randomSeed 参数支持',
  )

  // Check that preview.ts no longer has the old best-effort comment
  assert(
    !fileContains('src/lib/scheduler/preview.ts', 'Math.random is not seedable natively'),
    'preview.ts 已移除 "Math.random is not seedable natively" 注释',
  )
}

// ─── Main ────────────────────────────────────────────────────────

function main() {
  console.log('🧪 Scheduler Seeded PRNG Audit & Reproducibility Tests')

  testPrng()
  testStaticChecks()

  testSolverReproducibility()
    .then(() => {
      console.log(`\n${'═'.repeat(50)}`)
      console.log(`📊 结果: ${passed} passed, ${failed} failed`)
      console.log(`${'═'.repeat(50)}`)
      if (failed > 0) process.exit(1)
    })
    .catch((e) => {
      console.error('Test error:', e)
      process.exit(1)
    })
}

main()
