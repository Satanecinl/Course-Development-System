import { loadSchedulingContext } from '../src/lib/scheduler/data-loader'
import { buildInitialState, solve } from '../src/lib/scheduler/solver'
import { calculateInitialScore } from '../src/lib/scheduler/score'

async function main() {
  console.time('Data Loading')
  const ctx = await loadSchedulingContext()
  console.timeEnd('Data Loading')

  console.log(`\nTasks: ${ctx.tasks.length}, Rooms: ${ctx.rooms.length}, Slots: ${ctx.slots.length}`)

  // 1. 构建初始状态
  const state = buildInitialState(ctx)

  // 2. 计算初始分数（应该 hardScore = 0, softScore <= 0）
  console.time('Initial Score')
  const initialScore = calculateInitialScore(ctx, state)
  console.timeEnd('Initial Score')
  console.log(`\n--- Initial Score (before shuffle) ---`)
  console.log(`Hard: ${initialScore.hardScore}, Soft: ${initialScore.softScore}`)

  // 3. 故意打乱 20% 的 Slot 制造冲突
  const shuffleCount = Math.floor(ctx.slots.length * 0.2)
  const shuffledIds: number[] = []
  for (let i = 0; i < shuffleCount; i++) {
    const slot = ctx.slots[i]
    const randomRoom = ctx.rooms[Math.floor(Math.random() * ctx.rooms.length)]
    const randomDay = Math.floor(Math.random() * 7) + 1
    const randomSlot = Math.floor(Math.random() * 6) + 1
    state.assignments.set(slot.id, {
      dayOfWeek: randomDay,
      slotIndex: randomSlot,
      roomId: randomRoom.id,
    })
    shuffledIds.push(slot.id)
  }

  const shuffledScore = calculateInitialScore(ctx, state)
  console.log(`\n--- Score after shuffling ${shuffleCount} slots ---`)
  console.log(`Hard: ${shuffledScore.hardScore}, Soft: ${shuffledScore.softScore}`)

  // 4. 运行 LAHC 求解器
  console.log(`\n--- Running LAHC Solver (10000 iterations) ---`)
  console.time('Solver')
  const result = solve(ctx, { maxIterations: 10000, lahcWindowSize: 500 }, (iter, score) => {
    console.log(`  Iteration ${iter}: Hard = ${score.hardScore}, Soft = ${score.softScore}`)
  })
  console.timeEnd('Solver')

  console.log(`\n--- Best Score ---`)
  console.log(`Hard: ${result.bestScore.hardScore}, Soft: ${result.bestScore.softScore}`)
  console.log(`Iterations: ${result.iterations}`)

  // 5. 验证
  const improved = result.bestScore.hardScore > shuffledScore.hardScore ||
    (result.bestScore.hardScore === shuffledScore.hardScore && result.bestScore.softScore >= shuffledScore.softScore)
  console.log(`\n--- Verification ---`)
  console.log(`Score improved: ${improved}`)
  if (result.bestScore.hardScore === 0) {
    console.log('✓ All hard constraints satisfied!')
  } else {
    console.log(`✗ Still ${Math.abs(result.bestScore.hardScore / 1000)} hard constraint violations`)
  }
}

main().catch(console.error)
