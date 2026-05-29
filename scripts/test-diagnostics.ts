import { loadSchedulingContext } from '../src/lib/scheduler/data-loader'
import { buildInitialState, solve } from '../src/lib/scheduler/solver'
import { calculateScoreWithDetails } from '../src/lib/scheduler/score'
import { summarizeScore, printScoreSummary } from '../src/lib/scheduler/diagnostics'

async function main() {
  console.time('Data Loading')
  const ctx = await loadSchedulingContext()
  console.timeEnd('Data Loading')

  console.log(`Tasks: ${ctx.tasks.length}, Rooms: ${ctx.rooms.length}, Slots: ${ctx.slots.length}`)

  // 1. 初始状态
  const state = buildInitialState(ctx)

  // 2. 初始分数诊断
  console.time('Initial Score')
  const initialDetails = calculateScoreWithDetails(ctx, state)
  console.timeEnd('Initial Score')
  const initialSummary = summarizeScore(initialDetails)
  printScoreSummary('Initial Score Summary', initialSummary)

  // 3. 运行 solver
  console.log('\n--- Running LAHC Solver (10000 iterations) ---')
  console.time('Solver')
  const result = solve(ctx, { maxIterations: 10000, lahcWindowSize: 500 }, (iter, score) => {
    console.log(`  Iteration ${iter}: Hard = ${score.hardScore}, Soft = ${score.softScore}`)
  })
  console.timeEnd('Solver')

  // 4. 最终分数诊断
  console.time('Best Score')
  const bestDetails = calculateScoreWithDetails(ctx, result.bestState)
  console.timeEnd('Best Score')
  const bestSummary = summarizeScore(bestDetails)
  printScoreSummary('Solver Best Score Summary', bestSummary)

  // 5. 改进统计
  console.log('\n=== Improvement ===')
  console.log(`Hard improvement: ${initialSummary.hardScore} → ${bestSummary.hardScore} (${bestSummary.hardScore - initialSummary.hardScore})`)
  console.log(`Soft improvement: ${initialSummary.softScore} → ${bestSummary.softScore} (${bestSummary.softScore - initialSummary.softScore})`)

  // 统计解决的硬约束详情数
  const initialHardTypes = Object.entries(initialSummary.byType)
    .filter(([, v]) => v.level === 'HARD')
    .reduce((sum, [, v]) => sum + v.count, 0)
  const bestHardTypes = Object.entries(bestSummary.byType)
    .filter(([, v]) => v.level === 'HARD')
    .reduce((sum, [, v]) => sum + v.count, 0)
  console.log(`Resolved hard details: ${initialHardTypes} → ${bestHardTypes} (${initialHardTypes - bestHardTypes} resolved)`)

  // 最大前三类硬冲突
  console.log('\n--- Top 3 Hard Constraint Violations (Best State) ---')
  const hardTypes = Object.entries(bestSummary.byType)
    .filter(([, v]) => v.level === 'HARD')
    .sort((a, b) => a[1].totalPenalty - b[1].totalPenalty)
  for (const [type, entry] of hardTypes.slice(0, 3)) {
    console.log(`  ${type}: count=${entry.count}, penalty=${entry.totalPenalty}`)
    for (const s of entry.samples.slice(0, 2)) {
      console.log(`    - ${s.message || `slotId=${s.slotId}`}`)
    }
  }
}

main().catch(console.error)
