/**
 * K9-B-SCORING-1: HardScore Consistency Test
 *
 * Verifies that solver's bestScore.hardScore equals full re-evaluation of bestState.
 * This catches delta-vs-full scoring mismatches (e.g. HC6 delta-only penalties).
 */

import { loadSchedulingContext } from '../src/lib/scheduler/data-loader'
import { buildInitialState, solve } from '../src/lib/scheduler/solver'
import { calculateScoreWithDetails } from '../src/lib/scheduler/score'

async function main() {
  console.time('Data Loading')
  const ctx = await loadSchedulingContext()
  console.timeEnd('Data Loading')

  console.log(`Tasks: ${ctx.tasks.length}, Rooms: ${ctx.rooms.length}, Slots: ${ctx.slots.length}`)

  // 1. Build initial state
  const state = buildInitialState(ctx)

  // 2. Run solver
  console.log('\n--- Running LAHC Solver (5000 iterations) ---')
  console.time('Solver')
  const result = solve(ctx, { maxIterations: 5000, lahcWindowSize: 500 })
  console.timeEnd('Solver')

  // 3. Full re-evaluation
  console.time('Full Re-evaluation')
  const fullScore = calculateScoreWithDetails(ctx, result.bestState)
  console.timeEnd('Full Re-evaluation')

  // 4. Consistency check
  const hardDiff = result.bestScore.hardScore - fullScore.hardScore
  const hardConsistent = hardDiff === 0

  console.log('\n=== HardScore Consistency Check ===')
  console.log(`solver bestScore.hardScore: ${result.bestScore.hardScore}`)
  console.log(`full re-eval hardScore:     ${fullScore.hardScore}`)
  console.log(`difference:                 ${hardDiff}`)
  console.log(`hardScore consistent:       ${hardConsistent}`)

  // 5. SoftScore info (for logging only, not asserted)
  const softDiff = result.bestScore.softScore - fullScore.softScore
  console.log(`\n=== SoftScore Info (for logging only) ===`)
  console.log(`solver bestScore.softScore: ${result.bestScore.softScore}`)
  console.log(`full re-eval softScore:     ${fullScore.softScore}`)
  console.log(`difference:                 ${softDiff}`)
  console.log(`Note: softScore may differ due to SC1 delta/full mismatch (K9-B-SOFT-SCORING)`)

  // 6. Hard constraint breakdown
  const hardCounts: Record<string, number> = {}
  for (const d of fullScore.details) {
    if (d.level === 'HARD') {
      hardCounts[d.type] = (hardCounts[d.type] || 0) + 1
    }
  }
  console.log('\n=== Hard Constraint Breakdown (full re-eval) ===')
  for (const [type, count] of Object.entries(hardCounts)) {
    console.log(`  ${type}: ${count}`)
  }

  // 7. Assertion
  if (!hardConsistent) {
    console.error(`\n✗ FAILED: hardScore mismatch (${hardDiff})`)
    process.exit(1)
  }

  console.log('\n✓ PASSED: solver bestScore.hardScore is consistent with full re-evaluation')
}

main().catch((err) => {
  console.error('Test failed:', err)
  process.exit(1)
})
