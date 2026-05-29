import type { ScoreDetail, ScoreSummary, ScoreWithDetails } from './types'

/**
 * 将 ScoreDetail[] 汇总为 ScoreSummary
 */
export function summarizeScore(score: ScoreWithDetails): ScoreSummary {
  const byType: Record<string, {
    count: number
    totalPenalty: number
    level: 'HARD' | 'SOFT'
    samples: ScoreDetail[]
  }> = {}

  for (const d of score.details) {
    let entry = byType[d.type]
    if (!entry) {
      entry = { count: 0, totalPenalty: 0, level: d.level, samples: [] }
      byType[d.type] = entry
    }
    entry.count++
    entry.totalPenalty += d.penalty
    if (entry.samples.length < 5) {
      entry.samples.push(d)
    }
  }

  // 按 totalPenalty 从小到大排序（扣分最严重的排最前）
  const sortedEntries = Object.entries(byType).sort((a, b) => a[1].totalPenalty - b[1].totalPenalty)
  const sortedByType: Record<string, typeof sortedEntries[0][1]> = {}
  for (const [key, val] of sortedEntries) {
    sortedByType[key] = val
  }

  return {
    hardScore: score.hardScore,
    softScore: score.softScore,
    totalDetails: score.details.length,
    byType: sortedByType,
  }
}

/**
 * 打印 ScoreSummary 到控制台
 */
export function printScoreSummary(label: string, summary: ScoreSummary): void {
  console.log(`\n=== ${label} ===`)
  console.log(`Hard: ${summary.hardScore}, Soft: ${summary.softScore}`)
  console.log(`Total violations: ${summary.totalDetails}`)
  console.log(`\nBy Type:`)

  for (const [type, entry] of Object.entries(summary.byType)) {
    console.log(`  ${type} [${entry.level}]: count=${entry.count}, penalty=${entry.totalPenalty}`)
    for (const s of entry.samples.slice(0, 3)) {
      console.log(`    - ${s.message || `slotId=${s.slotId}`}`)
    }
  }
}
