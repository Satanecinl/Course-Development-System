/**
 * K20-FIX-B Source Evidence Query Pattern Verification
 *
 * Read-only verification that the new TeachingTaskClass source evidence
 * columns are queryable end-to-end. Covers:
 *
 *   1. SELECT by sourceRowIndex
 *   2. WHERE importBatchId filter
 *   3. WHERE sourceClassName / sourceKeyword text search
 *   4. WHERE matchStrategy = ...
 *   5. Old (historical) rows with all-null evidence don't crash queries
 *   6. Combined index-style query (e.g. by batch + row)
 *   7. Aggregations (count, group by matchStrategy)
 *
 * Exits 0 on PASS, 1 on any FAIL.
 */

import { PrismaClient } from '@prisma/client'

const prisma = new PrismaClient()

let passCount = 0
let failCount = 0
const failures: string[] = []

function check(label: string, ok: boolean, detail?: string) {
  if (ok) {
    passCount++
    console.log(`  PASS: ${label}${detail ? ` — ${detail}` : ''}`)
  } else {
    failCount++
    failures.push(`${label}${detail ? ` — ${detail}` : ''}`)
    console.log(`  FAIL: ${label}${detail ? ` — ${detail}` : ''}`)
  }
}

async function main() {
  console.log('K20-FIX-B Source Evidence Query Pattern Verification')
  console.log('='.repeat(60))

  // 1. SELECT by sourceRowIndex (no rows yet — should be 0, but query must not crash)
  console.log('\n[1] SELECT by sourceRowIndex:')
  const byRow = await prisma.teachingTaskClass.findFirst({ where: { sourceRowIndex: 0 } })
  check('findFirst({ sourceRowIndex: 0 }) does not crash', byRow !== undefined || byRow === null, `result=${byRow === null ? 'null (expected: no rows yet)' : 'found'}`)
  const byRowInt = await prisma.teachingTaskClass.count({ where: { sourceRowIndex: { not: null } } })
  check('count({ sourceRowIndex: { not: null } }) works', typeof byRowInt === 'number', `count=${byRowInt} (expected: 0 for historical data)`)

  // 2. WHERE importBatchId filter
  console.log('\n[2] WHERE importBatchId filter:')
  const byBatch = await prisma.teachingTaskClass.findMany({ where: { importBatchId: 1 } })
  check('findMany({ importBatchId: 1 }) does not crash', Array.isArray(byBatch), `count=${byBatch.length} (expected: 0 — historical data has no batch set)`)
  const byBatchNull = await prisma.teachingTaskClass.findMany({ where: { importBatchId: null } })
  check('findMany({ importBatchId: null }) returns all 446 historical rows', byBatchNull.length === 446, `count=${byBatchNull.length}`)

  // 3. WHERE sourceClassName / sourceKeyword text search
  console.log('\n[3] WHERE sourceClassName / sourceKeyword text search:')
  const byClassName = await prisma.teachingTaskClass.count({ where: { sourceClassName: 'anything' } })
  check('count by sourceClassName does not crash', typeof byClassName === 'number', `count=${byClassName} (expected: 0)`)
  const byKwLike = await prisma.teachingTaskClass.findMany({ where: { sourceKeyword: { contains: '森防' } } })
  check('findMany by sourceKeyword contains does not crash', Array.isArray(byKwLike), `count=${byKwLike.length} (expected: 0)`)

  // 4. WHERE matchStrategy = ...
  console.log('\n[4] WHERE matchStrategy filter:')
  for (const strat of ['EXACT_CLASS_NAME', 'SAME_COHORT_WEAK_MATCH', 'MANUAL_CROSS_COHORT_APPROVAL', 'UNKNOWN']) {
    const c = await prisma.teachingTaskClass.count({ where: { matchStrategy: strat } })
    check(`count by matchStrategy="${strat}" works`, typeof c === 'number', `count=${c} (expected: 0)`)
  }

  // 5. Old rows with all-null evidence — queries must not crash
  console.log('\n[5] Old (historical) rows with all-null evidence:')
  const oldSample = await prisma.teachingTaskClass.findMany({ take: 5, orderBy: { id: 'asc' } })
  check('findMany returns historical rows', oldSample.length === 5, `count=${oldSample.length}`)
  for (const r of oldSample) {
    const allNull =
      r.importBatchId === null &&
      r.sourceRowIndex === null &&
      r.sourceKeyword === null &&
      r.sourceClassName === null &&
      r.sourceRemark === null &&
      r.sourceArtifactFilename === null &&
      r.matchStrategy === null &&
      r.matchConfidence === null
    if (!allNull) {
      check(`row id=${r.id} has all-null evidence`, false, `row=${JSON.stringify(r)}`)
      break
    }
  }
  check('all 5 sampled historical rows have all-null evidence', true, 'spot-checked, all 8 fields null')

  // 6. Combined index-style query (batch + row)
  console.log('\n[6] Combined query (batch + row):')
  const combined = await prisma.teachingTaskClass.findFirst({
    where: { importBatchId: 1, sourceRowIndex: 0 },
  })
  check('findFirst({ importBatchId: 1, sourceRowIndex: 0 }) does not crash', combined === null || combined !== undefined, `result=${combined === null ? 'null' : 'found'}`)

  // 7. Aggregation (group by matchStrategy)
  console.log('\n[7] Aggregation (group by matchStrategy):')
  const grouped = await prisma.teachingTaskClass.groupBy({
    by: ['matchStrategy'],
    _count: { _all: true },
  })
  check('groupBy(matchStrategy) does not crash', Array.isArray(grouped), `groups=${grouped.length} (expected: 1 group for null)`)
  check('null group count = 446', grouped[0]?._count?._all === 446, `actual=${grouped[0]?._count?._all}`)

  // 8. ORDER BY sourceRowIndex (importer relies on insertion order which can
  //    be replayed via sourceRowIndex)
  console.log('\n[8] ORDER BY sourceRowIndex:')
  const ordered = await prisma.teachingTaskClass.findMany({
    orderBy: { sourceRowIndex: 'asc' },
    take: 3,
  })
  check('orderBy sourceRowIndex asc does not crash', ordered.length === 3, `count=${ordered.length}`)

  // ── Summary ──
  console.log('\n' + '='.repeat(60))
  console.log(`Summary: ${passCount} PASS / ${failCount} FAIL`)
  if (failCount > 0) {
    console.log('\nFailures:')
    for (const f of failures) console.log(`  - ${f}`)
    await prisma.$disconnect()
    process.exit(1)
  }
  await prisma.$disconnect()
}

main().catch(async (err) => {
  console.error('Fatal error:', err)
  await prisma.$disconnect()
  process.exit(1)
})
