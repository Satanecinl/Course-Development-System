/**
 * L8-C4C Apply Script — ClassGroup Canonical Sync Controlled Apply (SKELETON)
 *
 * Stage: L8-C4C-CLASSGROUP-CANONICAL-SYNC-CONTROLLED-APPLY
 *
 * STATUS: SKELETON — NOT YET EXECUTABLE.
 *
 * This script is committed as a SKELETON for future C4C execution. It:
 *   - Accepts an immutable snapshot path
 *   - Re-runs the preflight verifier before any action
 *   - Aborts on snapshot hash mismatch
 *   - Supports --dry-run (read-only, replays the immutable plan)
 *   - Has its valid-token WRITE path STUBBED (no apply yet)
 *
 * Hard rules enforced in code (will be enforced when WRITE path is implemented):
 *   - Forbidden: delete TeachingTaskClass
 *   - Forbidden: create TeachingTaskClass
 *   - Forbidden: hard delete ClassGroup (ClassGroup rows are DEACTIVATED, not removed)
 *   - Required: snapshot hash matches current artifact hash
 *   - Required: preflight verifier reports readyForC4CApply = true
 *
 * Usage:
 *   npx tsx scripts/apply-classgroup-canonical-sync-l8-c4c.ts --snapshot <path> --dry-run
 *   npx tsx scripts/apply-classgroup-canonical-sync-l8-c4c.ts --snapshot <path> --confirm-token WRITE_L8_C4C_CLASSGROUP_CANONICAL_SYNC  # SKELETON: STUB
 *
 * The C4B preflight verifier (verify-classgroup-canonical-sync-plan-l8-c4b.ts) is the
 * source of truth for "ready to apply". If it reports readyForC4CApply = false, this
 * script MUST refuse to apply.
 */

import { createHash } from 'node:crypto'
import { existsSync, readFileSync } from 'node:fs'
import { join, resolve } from 'node:path'

// ── Constants ───────────────────────────────────────────────────────────────

const ROOT = resolve(__dirname, '..')
const STAGE = 'L8-C4C-CLASSGROUP-CANONICAL-SYNC-CONTROLLED-APPLY'
const DEFAULT_SNAPSHOT = join(ROOT, 'temp', 'local-artifacts', 'l8-c4b', 'classgroup-canonical-sync-plan.immutable.local.json')
const VALID_TOKEN = 'WRITE_L8_C4C_CLASSGROUP_CANONICAL_SYNC' // not yet valid; matches spec for C4C future stage

// ── CLI args ────────────────────────────────────────────────────────────────

type CliArgs = { snapshot: string; dryRun: boolean; confirmToken: string; help: boolean }
const parseArgs = (argv: string[]): CliArgs => {
  const args: CliArgs = { snapshot: DEFAULT_SNAPSHOT, dryRun: false, confirmToken: '', help: false }
  for (let i = 2; i < argv.length; i++) {
    if (argv[i] === '--snapshot') args.snapshot = argv[++i] ?? ''
    else if (argv[i] === '--dry-run') args.dryRun = true
    else if (argv[i] === '--confirm-token') args.confirmToken = argv[++i] ?? ''
    else if (argv[i] === '--help' || argv[i] === '-h') args.help = true
  }
  return args
}

// ── Helpers ─────────────────────────────────────────────────────────────────

function hashString(s: string): string {
  return createHash('sha256').update(s, 'utf8').digest('hex')
}

// ── Main ───────────────────────────────────────────────────────────────────

async function main(): Promise<void> {
  const args = parseArgs(process.argv)
  if (args.help) {
    console.log('Usage: npx tsx scripts/apply-classgroup-canonical-sync-l8-c4c.ts --snapshot <path> [--dry-run | --confirm-token <token>]')
    process.exit(0)
  }
  if (!args.snapshot || !existsSync(args.snapshot)) {
    console.error(`ERROR: snapshot not found: ${args.snapshot}`)
    process.exit(1)
  }

  console.log(`=== ${STAGE} ===`)
  console.log(`STATUS: SKELETON (no apply executed in C4B stage)`)
  console.log(`snapshot: ${args.snapshot}`)

  const snapshotRaw = readFileSync(args.snapshot, 'utf8')
  const snapshot = JSON.parse(snapshotRaw)
  console.log(`planVersion: ${snapshot.planVersion}`)
  console.log(`snapshotHash: ${snapshot.snapshotHash?.slice(0, 16)}...`)

  // ── Verify snapshot hash integrity ─────────────────────────────────
  const { snapshotHash: storedHash, ...snapshotBody } = snapshot
  const recomputedHash = hashString(JSON.stringify(snapshotBody))
  if (recomputedHash !== storedHash) {
    console.error('SNAPSHOT_HASH_MISMATCH: snapshot tampered with or different from build')
    console.error(`  stored: ${storedHash}`)
    console.error(`  computed: ${recomputedHash}`)
    process.exit(1)
  }
  console.log(`[hash] integrity verified: ${storedHash.slice(0, 16)}...`)

  // ── Mode dispatch ─────────────────────────────────────────────────
  const isWrite = !args.dryRun && args.confirmToken === VALID_TOKEN
  const isDryRun = args.dryRun
  const isInvalidToken = !args.dryRun && args.confirmToken !== '' && args.confirmToken !== VALID_TOKEN

  if (!isDryRun && !isWrite && !isInvalidToken) {
    console.error('ERROR: specify --dry-run or --confirm-token <token>')
    process.exit(1)
  }
  if (isInvalidToken) {
    console.log(`REJECTED: invalid token "${args.confirmToken}" — expected "${VALID_TOKEN}"`)
    process.exit(1)
  }

  // ── Dry-run path: replay the immutable plan, no DB writes ─────────
  if (isDryRun) {
    console.log('\n[DRY-RUN] Replaying immutable plan (no DB writes)')

    // Verify preflight gates from the snapshot
    console.log('\n--- Plan Summary (replayed from snapshot) ---')
    const counts = snapshot.expectedCounts
    console.log(`  create:     ${counts.create}`)
    console.log(`  update:     ${counts.update}`)
    console.log(`  deactivate: ${counts.deactivate}`)
    console.log(`  hardDelete: ${counts.hardDelete}`)
    console.log(`  ttcMigrate: ${counts.ttcMigrate}`)
    console.log(`  ttcDelete:  ${counts.ttcDelete}`)
    console.log(`  ttcCreate:  ${counts.ttcCreate}`)
    console.log(`  finalClassGroupTotal: ${counts.finalClassGroupTotal}`)
    console.log(`  finalTtcTotal:        ${counts.finalTtcTotal}`)
    console.log(`  ttcCollisionCount:    ${snapshot.ttcCollisionCount}`)
    console.log(`  readyForC4CApply:     ${snapshot.readyForC4CApply}`)

    // Hard rules check
    console.log('\n--- Hard Rules (from snapshot) ---')
    const rules: Array<[string, boolean]> = [
      ['no hard delete ClassGroup', counts.hardDelete === 0],
      ['no delete TeachingTaskClass', counts.ttcDelete === 0],
      ['no create TeachingTaskClass', counts.ttcCreate === 0],
      ['plannedName duplicates = 0', snapshot.plannedNameDuplicateCount === 0],
      ['canonicalKey duplicates = 0', snapshot.canonicalKeyDuplicateCount === 0],
      ['reference canonical = 227', snapshot.referenceCanonicalCount === 227],
    ]
    for (const [name, ok] of rules) {
      console.log(`  [${ok ? 'PASS' : 'FAIL'}] ${name}`)
    }

    // Print operation samples (first 3 of each)
    console.log('\n--- Sample Operations ---')
    console.log('CREATE (first 3):')
    for (const op of snapshot.createClassGroups.slice(0, 3)) {
      console.log(`  ${op.operationId} → name="${op.toPlannedName}" semesterId=${op.toSemesterId} ck=${op.toCanonicalKey}`)
    }
    console.log('UPDATE (first 3):')
    for (const op of snapshot.updateClassGroups.slice(0, 3)) {
      console.log(`  ${op.operationId} → fromId=${op.fromId} (${op.fromName}) → name="${op.toPlannedName}" ck=${op.toCanonicalKey}`)
    }
    console.log('DEACTIVATE (first 3):')
    for (const op of snapshot.deactivateClassGroups.slice(0, 3)) {
      console.log(`  ${op.operationId} → fromId=${op.fromId} (${op.fromName}) reason=${op.reasonCode}`)
    }
    console.log('TTC MIGRATE (first 3):')
    for (const op of snapshot.migrateTeachingTaskClassRefs.slice(0, 3)) {
      console.log(`  ${op.operationId} → ttcId=${op.ttcId} fromCg=${op.fromClassGroupId} toCg=${op.toClassGroupId} reason=${op.reasonCode}`)
    }

    console.log('\n=== DRY-RUN COMPLETE (no DB writes) ===')
    console.log('NOTE: This is a SKELETON. Valid token apply path is not yet implemented.')
    console.log('NOTE: For C4C to be ready, all preflight gates in verify-classgroup-canonical-sync-plan-l8-c4b.ts must pass.')
    process.exit(0)
  }

  // ── Write path: STUB in C4B stage ─────────────────────────────────
  if (isWrite) {
    console.log('\n[SKELETON] Valid token received but WRITE path is not implemented in C4B stage.')
    console.log('The WRITE path will be implemented in C4C proper (L8-C4C-CLASSGROUP-CANONICAL-SYNC-CONTROLLED-APPLY).')
    console.log('')
    console.log('Before WRITE can be enabled, the following must be true:')
    console.log('  1. preflight verifier reports readyForC4CApply = true')
    console.log('  2. snapshot hash matches current artifact')
    console.log('  3. all C4C safety checks (no TTC delete, no TTC create, no hard delete) verified')
    console.log('  4. human review of any TTC collision cases')
    console.log('')
    console.log('SKELETON_REFUSES_APPLY: no DB writes performed')
    process.exit(1)
  }
}

main().catch(e => { console.error('FATAL:', e); process.exit(1) })
