/**
 * L8-C4B Verify Script — Preflight Verifier for Immutable Plan Snapshot
 *
 * Stage: L8-C4B-CLASSGROUP-CANONICAL-SYNC-REDESIGN
 *
 * READ-ONLY. NO DB WRITES. NO SCHEMA CHANGES.
 *
 * Verifies the immutable plan snapshot against current DB state and asserts
 * preflight gates for future C4C apply.
 *
 * Gates (all must pass for readyForC4CApply = true):
 *   1. DB baseline matches snapshot baseline
 *   2. referenceCanonicalCount = 227
 *   3. canonicalKey duplicate count = 0
 *   4. plannedName duplicate count = 0
 *   5. activeCanonicalPlanned = 227
 *   6. finalClassGroupTotal matches expected
 *   7. finalTtcTotal = 446
 *   8. planned hard delete = 0
 *   9. planned TTC delete = 0
 *  10. planned TTC create = 0
 *  11. TTC collision count = 0
 *  12. manualReviewRequired = 0
 *  13. readyForC4CApply = true in snapshot
 *
 * Usage:
 *   npx tsx scripts/verify-classgroup-canonical-sync-plan-l8-c4b.ts \
 *     --snapshot temp/local-artifacts/l8-c4b/classgroup-canonical-sync-plan.immutable.local.json
 */

import { createHash } from 'node:crypto'
import { existsSync, readFileSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { PrismaClient } from '@prisma/client'

// ── Constants ───────────────────────────────────────────────────────────────

const ROOT = resolve(__dirname, '..')
const STAGE = 'L8-C4B-CLASSGROUP-CANONICAL-SYNC-REDESIGN'
const DEFAULT_SNAPSHOT = join(ROOT, 'temp', 'local-artifacts', 'l8-c4b', 'classgroup-canonical-sync-plan.immutable.local.json')
const TTC_COLLISION_CHECK = join(ROOT, 'temp', 'local-artifacts', 'l8-c4b', 'ttc-migration-collision-check.local.json')

// ── CLI args ────────────────────────────────────────────────────────────────

type CliArgs = { snapshot: string; help: boolean }
const parseArgs = (argv: string[]): CliArgs => {
  const args: CliArgs = { snapshot: DEFAULT_SNAPSHOT, help: false }
  for (let i = 2; i < argv.length; i++) {
    if (argv[i] === '--snapshot') args.snapshot = argv[++i] ?? ''
    else if (argv[i] === '--help' || argv[i] === '-h') args.help = true
  }
  return args
}

// ── Helpers ─────────────────────────────────────────────────────────────────

type Gate = { name: string; pass: boolean; actual: string | number | boolean; expected: string | number | boolean; note?: string }
const gates: Gate[] = []
function check(name: string, pass: boolean, actual: string | number | boolean, expected: string | number | boolean, note?: string) {
  gates.push({ name, pass, actual, expected, note })
}

function hashString(s: string): string {
  return createHash('sha256').update(s, 'utf8').digest('hex')
}

// ── Main ───────────────────────────────────────────────────────────────────

async function main(): Promise<void> {
  const args = parseArgs(process.argv)
  if (args.help) {
    console.log('Usage: npx tsx scripts/verify-classgroup-canonical-sync-plan-l8-c4b.ts --snapshot <path>')
    process.exit(0)
  }
  if (!args.snapshot || !existsSync(args.snapshot)) {
    console.error(`ERROR: snapshot not found: ${args.snapshot}`)
    process.exit(1)
  }

  console.log(`=== ${STAGE} ===`)
  console.log(`snapshot: ${args.snapshot}`)

  const snapshotRaw = readFileSync(args.snapshot, 'utf8')
  const snapshot = JSON.parse(snapshotRaw)
  console.log(`planVersion: ${snapshot.planVersion}`)
  console.log(`generatedAt: ${snapshot.generatedAt}`)
  console.log(`snapshotHash: ${snapshot.snapshotHash?.slice(0, 16)}...`)
  console.log('')

  // ── Re-hash snapshot to detect tampering ─────────────────────────────
  const { snapshotHash: storedHash, ...snapshotBody } = snapshot
  void storedHash // already exposed via storedHash in log
  const recomputedHash = hashString(JSON.stringify(snapshotBody))
  check('snapshot-hash-integrity', recomputedHash === snapshot.snapshotHash, recomputedHash.slice(0, 16), snapshot.snapshotHash?.slice(0, 16))

  const prisma = new PrismaClient()

  // ── DB baseline (read-only) ──────────────────────────────────────────
  const actualBaseline = {
    course: await prisma.course.count(),
    teacher: await prisma.teacher.count(),
    cgTotal: await prisma.classGroup.count(),
    cgSem1: await prisma.classGroup.count({ where: { semesterId: 1 } }),
    cgSem4: await prisma.classGroup.count({ where: { semesterId: snapshot.targetSemesterId } }),
    ttc: await prisma.teachingTaskClass.count(),
    ttSem4: await prisma.teachingTask.count({ where: { semesterId: snapshot.targetSemesterId } }),
    ssSem4: await prisma.scheduleSlot.count({ where: { semesterId: snapshot.targetSemesterId } }),
    saSem4: await prisma.scheduleAdjustment.count({ where: { semesterId: snapshot.targetSemesterId } }),
    ibTotal: await prisma.importBatch.count(),
    ckNull: await prisma.classGroup.count({ where: { canonicalKey: null } }),
    activeTrue: await prisma.classGroup.count({ where: { isActive: true } }),
  }

  // ── Gate 1: DB baseline matches snapshot baseline ────────────────────
  for (const k of Object.keys(snapshot.dbBaseline)) {
    check(`db-baseline-${k}`, actualBaseline[k as keyof typeof actualBaseline] === snapshot.dbBaseline[k], actualBaseline[k as keyof typeof actualBaseline], snapshot.dbBaseline[k])
  }

  // ── Gate 2: referenceCanonicalCount = 227 ───────────────────────────
  check('reference-canonical-count', snapshot.referenceCanonicalCount === 227, snapshot.referenceCanonicalCount, 227)

  // ── Gate 3: canonicalKey duplicate count = 0 ─────────────────────────
  check('canonical-key-duplicate-count', snapshot.canonicalKeyDuplicateCount === 0, snapshot.canonicalKeyDuplicateCount, 0)

  // ── Gate 4: plannedName duplicate count = 0 ──────────────────────────
  check('planned-name-duplicate-count', snapshot.plannedNameDuplicateCount === 0, snapshot.plannedNameDuplicateCount, 0)

  // ── Gate 5: activeCanonicalRefXlsx = 227 ─────────────────────────────
  check('active-canonical-ref-xlsx', snapshot.expectedCounts.activeCanonicalRefXlsx === 227, snapshot.expectedCounts.activeCanonicalRefXlsx, 227)

  // ── Gate 6: finalClassGroupTotal matches expected ────────────────────
  // Note: total = 442 (existing) + create count (existing rows stay; creates add new rows)
  const expectedFinalCG = 442 + snapshot.expectedCounts.create
  check('final-class-group-total', snapshot.expectedCounts.finalClassGroupTotal === expectedFinalCG, snapshot.expectedCounts.finalClassGroupTotal, expectedFinalCG)

  // ── Gate 7: finalTtcTotal = 446 ──────────────────────────────────────
  check('final-ttc-total', snapshot.expectedCounts.finalTtcTotal === 446, snapshot.expectedCounts.finalTtcTotal, 446)

  // ── Gate 8: planned hard delete = 0 ──────────────────────────────────
  check('planned-hard-delete', snapshot.expectedCounts.hardDelete === 0, snapshot.expectedCounts.hardDelete, 0)

  // ── Gate 9: planned TTC delete = 0 ───────────────────────────────────
  check('planned-ttc-delete', snapshot.expectedCounts.ttcDelete === 0, snapshot.expectedCounts.ttcDelete, 0)

  // ── Gate 10: planned TTC create = 0 ──────────────────────────────────
  check('planned-ttc-create', snapshot.expectedCounts.ttcCreate === 0, snapshot.expectedCounts.ttcCreate, 0)

  // ── Gate 11: TTC collision count = 0 (read from collision artifact) ──
  let ttcCollisionCount = snapshot.ttcCollisionCount
  if (existsSync(TTC_COLLISION_CHECK)) {
    const collisionCheck = JSON.parse(readFileSync(TTC_COLLISION_CHECK, 'utf8'))
    ttcCollisionCount = collisionCheck.collisionCount
  }
  check('ttc-collision-count', ttcCollisionCount === 0, ttcCollisionCount, 0)

  // ── Gate 12: manualReviewRequired = 0 ────────────────────────────────
  check('manual-review-required', snapshot.manualReviewRequired === 0, snapshot.manualReviewRequired, 0)

  // ── Gate 13: snapshot's own readyForC4CApply = true ─────────────────
  check('snapshot-ready-for-c4c', snapshot.readyForC4CApply === true, snapshot.readyForC4CApply, true)

  // ── Additional structural gates ──────────────────────────────────────
  // DB coverage: every existing DB row is either UPDATE (stays) or DEACTIVATE (isActive=false)
  // CREATE operations add NEW rows. So update + deactivate = 442 (all existing rows accounted for).
  const existingRowCoverage = snapshot.updateClassGroups.length + snapshot.deactivateClassGroups.length
  check('db-coverage-complete', existingRowCoverage === 442, existingRowCoverage, 442,
    `update(${snapshot.updateClassGroups.length}) + deactivate(${snapshot.deactivateClassGroups.length}) = 442; create(${snapshot.createClassGroups.length}) adds new rows`)

  // create + update = 227 (all canonical keys)
  check('canonical-coverage-complete', snapshot.createClassGroups.length + snapshot.updateClassGroups.length === 227, snapshot.createClassGroups.length + snapshot.updateClassGroups.length, 227)

  // activeCanonicalRows in snapshot = 227
  const plannedActive = snapshot.updateClassGroups.length + snapshot.createClassGroups.length
  check('planned-active-canonical-rows', plannedActive === 227, plannedActive, 227)

  // No DEACTIVATE on rows that are also CREATE/UPDATE targets
  const protectedIds = new Set<number>([
    ...snapshot.updateClassGroups.map((u: { fromId: number }) => u.fromId),
  ])
  const conflictDeactivates = snapshot.deactivateClassGroups.filter((d: { fromId: number }) => protectedIds.has(d.fromId))
  check('no-conflicting-deactivates', conflictDeactivates.length === 0, conflictDeactivates.length, 0, 'DEACTIVATE rows that are also UPDATE targets')

  // ── Print results ───────────────────────────────────────────────────
  console.log('--- Preflight Gates ---')
  for (const g of gates) {
    const status = g.pass ? 'PASS' : 'FAIL'
    console.log(`  [${status}] ${g.name}: actual=${g.actual} expected=${g.expected}${g.note ? ' (' + g.note + ')' : ''}`)
  }

  const failedGates = gates.filter(g => !g.pass)
  const readyForC4CApply = failedGates.length === 0

  console.log('')
  console.log(`=== VERIFIER RESULT ===`)
  console.log(`total gates: ${gates.length}`)
  console.log(`passed: ${gates.length - failedGates.length}`)
  console.log(`failed: ${failedGates.length}`)
  if (failedGates.length > 0) {
    console.log('failed gates:')
    for (const g of failedGates) console.log(`  - ${g.name}: actual=${g.actual} expected=${g.expected}`)
  }
  console.log(`readyForC4CApply: ${readyForC4CApply}`)

  // Write verifier output (local artifact)
  const { writeFileSync, mkdirSync } = await import('node:fs')
  const verifierArtifactDir = join(ROOT, 'temp', 'local-artifacts', 'l8-c4b')
  if (!existsSync(verifierArtifactDir)) mkdirSync(verifierArtifactDir, { recursive: true })
  writeFileSync(
    join(verifierArtifactDir, 'preflight-verifier-result.local.json'),
    JSON.stringify({
      stage: STAGE,
      snapshotPath: args.snapshot,
      snapshotHash: snapshot.snapshotHash,
      verifiedAt: new Date().toISOString(),
      gates: gates.map(g => ({ name: g.name, pass: g.pass, actual: g.actual, expected: g.expected, note: g.note })),
      totalGates: gates.length,
      passedGates: gates.length - failedGates.length,
      failedGates: failedGates.length,
      readyForC4CApply,
      noDBWrite: true,
    }, null, 2),
    'utf8'
  )

  await prisma.$disconnect()
  process.exit(readyForC4CApply ? 0 : 1)
}

main().catch(e => { console.error('FATAL:', e); process.exit(1) })
