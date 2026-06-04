/**
 * K20-FIX-B Source Evidence Backfill Gap Audit
 *
 * Read-only audit that quantifies the gap between historical (no evidence)
 * and forward-fill (with evidence) TeachingTaskClass rows. No backfill is
 * performed. Output:
 *   - total TeachingTaskClass rows
 *   - rows with at least one non-null source-evidence field
 *   - rows with all-null source-evidence fields (the gap)
 *   - breakdown of how many rows are non-null for each of the 8 fields
 *   - forward-fill expectation: future imports will populate these via
 *     executeImportInTransaction → buildTeachingTaskClassEvidence
 *
 * Exits 0 on PASS, 1 on any FAIL.
 */

import { PrismaClient } from '@prisma/client'

const prisma = new PrismaClient()

const SOURCE_EVIDENCE_FIELDS = [
  'importBatchId',
  'sourceRowIndex',
  'sourceKeyword',
  'sourceClassName',
  'sourceRemark',
  'sourceArtifactFilename',
  'matchStrategy',
  'matchConfidence',
] as const

let passCount = 0
let failCount = 0

function check(label: string, ok: boolean, detail?: string) {
  if (ok) {
    passCount++
    console.log(`  PASS: ${label}${detail ? ` — ${detail}` : ''}`)
  } else {
    failCount++
    console.log(`  FAIL: ${label}${detail ? ` — ${detail}` : ''}`)
  }
}

async function main() {
  console.log('K20-FIX-B Source Evidence Backfill Gap Audit')
  console.log('='.repeat(60))

  const total = await prisma.teachingTaskClass.count()
  console.log(`\n[1] Total TeachingTaskClass rows: ${total}`)

  console.log('\n[2] Per-field non-null count:')
  const fieldCounts: Record<string, number> = {}
  for (const f of SOURCE_EVIDENCE_FIELDS) {
    const c = await prisma.teachingTaskClass.count({ where: { [f]: { not: null } } })
    fieldCounts[f] = c
    console.log(`  ${f}: ${c}`)
  }

  // A row is "all null" only if all 8 fields are null
  const allNull = await prisma.teachingTaskClass.count({
    where: {
      importBatchId: null,
      sourceRowIndex: null,
      sourceKeyword: null,
      sourceClassName: null,
      sourceRemark: null,
      sourceArtifactFilename: null,
      matchStrategy: null,
      matchConfidence: null,
    },
  })
  const anyNonNull = total - allNull
  console.log(`\n[3] Backfill gap summary:`)
  console.log(`  rows with at least 1 non-null evidence field: ${anyNonNull}`)
  console.log(`  rows with all-null evidence (gap):             ${allNull}`)

  // Audit: all-null count must equal total for historical data (no backfill performed).
  console.log(`\n[4] No-backfill policy verification:`)
  check('all-null count == total (no backfill performed)', allNull === total,
    `allNull=${allNull} total=${total} → ${allNull === total ? 'confirmed' : 'MISMATCH'}`)
  check('any-non-null count == 0 (no backfill performed)', anyNonNull === 0,
    `anyNonNull=${anyNonNull} → ${anyNonNull === 0 ? 'confirmed' : 'MISMATCH'}`)

  // Forward-fill expectation: importer now writes 8 fields via buildTeachingTaskClassEvidence
  console.log(`\n[5] Forward-fill expectation (no DB change required):`)
  console.log(`  - Future imports create TTC links via executeImportInTransaction`)
  console.log(`  - Each link now passes through buildTeachingTaskClassEvidence`)
  console.log(`  - importBatchId, sourceRowIndex, sourceArtifactFilename are deterministic`)
  console.log(`  - sourceKeyword, sourceClassName, sourceRemark, matchStrategy, matchConfidence`)
  console.log(`    are derived from the per-link evidence populated by`)
  console.log(`    findMergedClassNamesWithEvidence during prepareRecords.`)
  console.log(`  - Historical rows remain all-null until an independent K20-FIX-C stage`)
  console.log(`    decides to backfill from the 17 source JSON files in uploads/imports/.`)

  console.log('\n' + '='.repeat(60))
  console.log(`Summary: ${passCount} PASS / ${failCount} FAIL`)
  await prisma.$disconnect()
  process.exit(failCount > 0 ? 1 : 0)
}

main().catch(async (err) => {
  console.error('Fatal error:', err)
  await prisma.$disconnect()
  process.exit(1)
})
