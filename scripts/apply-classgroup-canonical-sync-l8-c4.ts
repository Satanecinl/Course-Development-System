/**
 * L8-C4 Apply Script — SUPERSEDED
 *
 * This script has been superseded by L8-C4B/C4C after the failed C4 apply.
 * All write paths are permanently blocked.
 *
 * The old C4 apply failed due to:
 *   1. plannedName collision (29 canonical keys → @@unique violation)
 *   2. TTC deletion (96 rows deleted, violating historical data prohibition)
 *   3. count drift (dry-run and apply used different plan snapshots)
 *
 * See docs/l8-c4b-classgroup-canonical-sync-redesign.md for the redesign.
 *
 * Usage:
 *   npx tsx scripts/apply-classgroup-canonical-sync-l8-c4.ts --dry-run   # outputs blocked notice
 *   npx tsx scripts/apply-classgroup-canonical-sync-l8-c4.ts --confirm-token WRITE_L8_C4_CLASSGROUP_CANONICAL_SYNC  # REJECTED
 */

const STAGE = 'L8-C4-CLASSGROUP-CANONICAL-CONTROLLED-SYNC-APPLY'
const SUPERSEDED_BY = 'L8-C4B-CLASSGROUP-CANONICAL-SYNC-REDESIGN'

function main(): void {
  const args = process.argv.slice(2)
  const isDryRun = args.includes('--dry-run')

  console.log(`=== ${STAGE} ===`)
  console.log(`STATUS: BLOCKED_FAILED_L8_C4_SCRIPT_SUPERSEDED`)
  console.log(`SUPERSEDED_BY: ${SUPERSEDED_BY}`)
  console.log('')

  if (isDryRun) {
    console.log('[DRY-RUN] This script is permanently blocked after failed C4 apply.')
    console.log('')
    console.log('What happened:')
    console.log('  1. plannedName collision: buildPlannedName omitted educationLevel/schoolLength.')
    console.log('     29 canonical keys could not be represented because @@unique([semesterId, name]) collided.')
    console.log('  2. TTC deletion: old apply script deleted 96 TeachingTaskClass rows via dedupe branch.')
    console.log('     This violated the explicit prohibition against deleting historical data.')
    console.log('  3. count drift: dry-run and valid apply did not use one immutable plan snapshot.')
    console.log('')
    console.log('Use instead:')
    console.log('  npx tsx scripts/build-classgroup-canonical-sync-plan-l8-c4b.ts --target-semester-id <id>')
    console.log('  npx tsx scripts/verify-classgroup-canonical-sync-plan-l8-c4b.ts --snapshot <path>')
    console.log('  npx tsx scripts/apply-classgroup-canonical-sync-l8-c4c.ts --snapshot <path> --dry-run')
    console.log('')
    console.log('=== BLOCKED (no DB writes) ===')
    process.exit(0)
  } else {
    console.log('REJECTED: This script is permanently blocked after failed C4 apply.')
    console.log('')
    console.log('All write paths are disabled. The confirm token is no longer accepted.')
    console.log('Use C4B/C4C scripts instead (see above).')
    process.exit(1)
  }
}

main()
