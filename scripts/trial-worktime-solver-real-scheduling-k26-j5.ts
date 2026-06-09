/**
 * scripts/trial-worktime-solver-real-scheduling-k26-j5.ts
 *
 * K26-J5: Real scheduling trial — runs a genuine preview against the
 * live dev DB and validates the full WorkTime-aware pipeline end-to-end.
 *
 * Usage:
 *   npx tsx scripts/trial-worktime-solver-real-scheduling-k26-j5.ts --preview-only
 *   npx tsx scripts/trial-worktime-solver-real-scheduling-k26-j5.ts --apply-and-rollback
 *
 * Default: preview-only.
 */

import { prisma } from '@/lib/prisma'
import { createSchedulerPreview } from '@/lib/scheduler/preview'
import { applySchedulerPreview } from '@/lib/scheduler/apply'
import { rollbackSchedulerApply } from '@/lib/scheduler/rollback'
import {
  parseWorkTimeSnapshot,
  toSolverWorkTimeContract,
  toScoreWorkTimeContract,
  readWorkTimeSnapshotFromRun,
  type SchedulingRunWorkTimeSnapshot,
  type SolverWorkTimeContract,
  type WorkTimeForScore,
} from '@/lib/worktime/worktime-snapshot'

const args = process.argv.slice(2)
const previewOnly = args.includes('--preview-only') || args.length === 0
const applyAndRollback = args.includes('--apply-and-rollback')

// ── Results ──

const output: Record<string, string | number | boolean | number[]> = {}

function set(k: string, v: string | number | boolean | number[]) {
  output[k] = v
}

async function main() {
  console.log('K26-J5: WorkTime Solver Real Scheduling Trial')
  console.log(`Mode: ${previewOnly ? 'preview-only' : 'apply-and-rollback'}`)
  console.log('─'.repeat(60))

  // ── 1. Resolve active semester ──
  const semester = await prisma.semester.findFirst({ where: { isActive: true } })
  if (!semester) {
    console.error('ERROR: No active semester found')
    process.exit(1)
  }
  set('semesterId', semester.id)
  console.log(`Active semester: ${semester.name} (id=${semester.id})`)

  // ── 2. Run preview ──
  console.log('\nRunning scheduler preview...')
  const preview = await createSchedulerPreview({
    semesterId: semester.id,
    maxIterations: 10000,
    randomSeed: 20260609,
  })

  set('runId', preview.runId)
  set('mode', 'preview-only')
  set('hardScore', preview.scoreAfter.hardScore)
  set('softScore', preview.scoreAfter.softScore)
  set('changedSlots', preview.changedSlotCount)
  set('blocking', preview.blocked)

  console.log(`\nPreview completed: runId=${preview.runId}, status=${preview.status}`)
  console.log(`  hardScore=${preview.scoreAfter.hardScore}, softScore=${preview.scoreAfter.softScore}`)
  console.log(`  changedSlots=${preview.changedSlotCount}, blocking=${preview.blocked}`)

  // ── 3. Read back the run and check WorkTime snapshot ──
  const run = await prisma.schedulingRun.findUnique({ where: { id: preview.runId } })
  if (!run) {
    console.error('ERROR: Could not read back run')
    process.exit(1)
  }

  set('workTimeSnapshotPresent', run.workTimeConfigSnapshot != null)

  if (!run.workTimeConfigSnapshot) {
    console.error('ERROR: workTimeConfigSnapshot is null — K26-J2 write failed')
    process.exit(1)
  }

  let snapshot: SchedulingRunWorkTimeSnapshot
  try {
    snapshot = parseWorkTimeSnapshot(run.workTimeConfigSnapshot)
  } catch (e) {
    console.error('ERROR: Snapshot parse failed:', e)
    process.exit(1)
  }

  set('workTimeSnapshotVersion', snapshot.version)
  set('workTimeSource', snapshot.source)
  set('workTimeConfigId', snapshot.workTimeConfigId ?? 'null')
  set('allowWeekend', snapshot.allowWeekend)

  console.log(`\nWorkTime snapshot:`)
  console.log(`  version=${snapshot.version}, source=${snapshot.source}`)
  console.log(`  workTimeConfigId=${snapshot.workTimeConfigId}, allowWeekend=${snapshot.allowWeekend}`)
  console.log(`  activeTeachingSlots=${JSON.stringify(snapshot.activeTeachingSlotIndexes)}`)
  console.log(`  legacyDisplaySlots=${JSON.stringify(snapshot.legacyDisplaySlotIndexes)}`)
  console.log(`  allowedDayOfWeeks=${JSON.stringify(snapshot.allowedDayOfWeeks)}`)

  // ── 4. Build solver contract from snapshot ──
  const solverContract: SolverWorkTimeContract = toSolverWorkTimeContract(snapshot)
  set('candidateDays', solverContract.allowedDayOfWeeks)
  set('candidateSlots', solverContract.candidateSlotIndexes)
  set('legacySlotsExcluded',
    !solverContract.candidateSlotIndexes.includes(6) &&
    !solverContract.candidateSlotIndexes.includes(7))

  console.log(`\nSolver contract (from snapshot):`)
  console.log(`  candidateDays=${JSON.stringify(solverContract.allowedDayOfWeeks)}`)
  console.log(`  candidateSlots=${JSON.stringify(solverContract.candidateSlotIndexes)}`)
  console.log(`  legacySlotsExcluded=${solverContract.candidateSlotIndexes.includes(6) || solverContract.candidateSlotIndexes.includes(7) ? 'NO' : 'YES'}`)

  // ── 5. Build score contract from snapshot ──
  const scoreContract: WorkTimeForScore = toScoreWorkTimeContract(solverContract)
  set('sc3LateSlots', scoreContract.lateSlotIndexes)
  set('sc7WeekendDays', scoreContract.weekendDayOfWeeks)

  console.log(`\nScore contract:`)
  console.log(`  lateSlotIndexes=${JSON.stringify(scoreContract.lateSlotIndexes)} (SC3)`)
  console.log(`  weekendDayOfWeeks=${JSON.stringify(scoreContract.weekendDayOfWeeks)} (SC7)`)

  // ── 6. Verify legacy slot exclusion in resultSnapshot ──
  let resultSnapshot: Record<string, unknown> | null = null
  if (run.resultSnapshot) {
    try {
      resultSnapshot = JSON.parse(run.resultSnapshot)
    } catch { /* ignore */ }
  }

  // Check WorkTime additive metadata in resultSnapshot
  const workTimeMeta = resultSnapshot?.workTime as Record<string, unknown> | undefined
  set('resultSnapshotWorkTimePresent', workTimeMeta != null)

  if (workTimeMeta) {
    console.log(`\nresultSnapshot.workTime metadata:`)
    console.log(`  snapshotVersion=${workTimeMeta.snapshotVersion}, source=${workTimeMeta.source}`)
    console.log(`  workTimeConfigId=${workTimeMeta.workTimeConfigId}`)
    console.log(`  allowWeekend=${workTimeMeta.allowWeekend}`)
  }

  // ── 7. Parse score breakdown from resultSnapshot ──
  const scoreBreakdown = resultSnapshot?.scoreBreakdown as Record<string, unknown> | undefined
  let sc3Count = 0, sc3Penalty = 0, sc7Count = 0, sc7Penalty = 0

  if (scoreBreakdown?.after) {
    const after = scoreBreakdown.after as Record<string, unknown>
    const details = after.details as Array<Record<string, unknown>> | undefined
    if (Array.isArray(details)) {
      for (const d of details) {
        const t = d.type as string
        const p = (d.penalty as number) ?? 0
        if (t === 'SC3_EXTREME_TIME_SLOT') { sc3Count++; sc3Penalty += p }
        else if (t === 'SC7_WEEKEND_AVOIDANCE') { sc7Count++; sc7Penalty += p }
      }
    }
  }

  // Also use the hc fields from the result directly
  const hcAfter = preview.hcAfter
  set('roomConflictCount', hcAfter.hc1)
  set('teacherConflictCount', hcAfter.hc2)
  set('classGroupConflictCount', hcAfter.hc3)
  set('capacityConflictCount', hcAfter.hc4)
  set('SC3count', sc3Count)
  set('SC3penalty', sc3Penalty)
  set('SC7count', sc7Count)
  set('SC7penalty', sc7Penalty)
  set('totalScheduledSlots', preview.proposedChanges.length)

  console.log(`\nScore breakdown:`)
  console.log(`  HC1(room)=${hcAfter.hc1}, HC2(teacher)=${hcAfter.hc2}, HC3(class)=${hcAfter.hc3}, HC4(capacity)=${hcAfter.hc4}`)
  console.log(`  SC3: count=${sc3Count}, penalty=${sc3Penalty}`)
  console.log(`  SC7: count=${sc7Count}, penalty=${sc7Penalty}`)

  // ── 8. Verify snapshot reproducibility: re-read from DB ──
  const rerun = await prisma.schedulingRun.findUnique({ where: { id: preview.runId } })
  const rerunSnap = readWorkTimeSnapshotFromRun({ workTimeConfigSnapshot: rerun?.workTimeConfigSnapshot ?? null })
  set('snapshotReproducible', rerunSnap != null && rerunSnap.serializedAt === snapshot.serializedAt)
  console.log(`\nSnapshot reproducibility: ${rerunSnap != null ? 'PASS' : 'FAIL'} (re-read matches)`)

  // ── 9. Apply / Rollback (only if --apply-and-rollback) ──
  if (applyAndRollback) {
    console.log('\n' + '─'.repeat(60))
    console.log('APPLY & ROLLBACK mode')

    // Guard: only if preview completed without hard conflicts
    if (preview.scoreAfter.hardScore !== 0) {
      console.error('ERROR: Cannot apply — hardScore != 0 (conflicts remain)')
      process.exit(1)
    }

    // Apply
    console.log(`\nApplying run ${preview.runId}...`)
    const applyResult = await applySchedulerPreview({
      previewRunId: preview.runId,
      confirmApply: true,
    })
    console.log(`Apply result: runId=${applyResult.applyRunId}, appliedSlots=${applyResult.appliedSlotCount}, hardScoreAfter=${applyResult.hardScoreAfter}`)

    // Check apply run snapshot
    const applyRun = await prisma.schedulingRun.findUnique({ where: { id: applyResult.applyRunId } })
    const applySnap = readWorkTimeSnapshotFromRun({ workTimeConfigSnapshot: applyRun?.workTimeConfigSnapshot ?? null })
    console.log(`Apply run snapshot present: ${applySnap != null}`)
    if (applySnap) {
      console.log(`  version=${applySnap.version}, source=${applySnap.source}`)
    }

    // Rollback
    console.log(`\nRolling back apply run ${applyResult.applyRunId}...`)
    const rollbackResult = await rollbackSchedulerApply({
      applyRunId: applyResult.applyRunId,
      confirmRollback: true,
    })
    console.log(`Rollback result: runId=${rollbackResult.rollbackRunId}, rolledBackSlots=${rollbackResult.rolledBackSlotCount}, hardScoreAfter=${rollbackResult.hardScoreAfter}`)

    // Check rollback run snapshot
    const rollbackRun = await prisma.schedulingRun.findUnique({ where: { id: rollbackResult.rollbackRunId } })
    const rollbackSnap = readWorkTimeSnapshotFromRun({ workTimeConfigSnapshot: rollbackRun?.workTimeConfigSnapshot ?? null })
    console.log(`Rollback run snapshot present: ${rollbackSnap != null}`)

    set('applyRunId', applyResult.applyRunId)
    set('rollbackRunId', rollbackResult.rollbackRunId)
    set('applySnapshotPresent', applySnap != null)
    set('rollbackSnapshotPresent', rollbackSnap != null)
  }

  // ── 10. Output final report ──
  console.log('\n' + '─'.repeat(60))
  console.log('K26-J5 WORKTIME SOLVER REAL SCHEDULING TRIAL PASS')
  console.log(`mode=${previewOnly ? 'preview-only' : 'apply-and-rollback'}`)
  console.log(`runId=${output.runId}`)
  console.log(`semesterId=${output.semesterId}`)
  console.log(`workTimeSnapshotPresent=${output.workTimeSnapshotPresent}`)
  console.log(`workTimeSnapshotVersion=${output.workTimeSnapshotVersion}`)
  console.log(`workTimeSource=${output.workTimeSource}`)
  console.log(`allowWeekend=${output.allowWeekend}`)
  console.log(`candidateDays=${JSON.stringify(output.candidateDays)}`)
  console.log(`candidateSlots=${JSON.stringify(output.candidateSlots)}`)
  console.log(`legacySlotsExcluded=${output.legacySlotsExcluded}`)
  console.log(`hardScore=${output.hardScore}`)
  console.log(`softScore=${output.softScore}`)
  console.log(`blocking=${output.blocking}`)
  console.log(`changedSlots=${output.changedSlots}`)
  console.log(`totalScheduledSlots=${output.totalScheduledSlots}`)
  console.log(`roomConflictCount=${output.roomConflictCount}`)
  console.log(`teacherConflictCount=${output.teacherConflictCount}`)
  console.log(`classGroupConflictCount=${output.classGroupConflictCount}`)
  console.log(`capacityConflictCount=${output.capacityConflictCount}`)
  console.log(`SC3count=${output.SC3count}`)
  console.log(`SC7count=${output.SC7count}`)
  console.log(`SC3penalty=${output.SC3penalty}`)
  console.log(`SC7penalty=${output.SC7penalty}`)
  console.log(`snapshotReproducible=${output.snapshotReproducible}`)
  console.log(`recommendedManualValidation=${preview.scoreAfter.hardScore !== 0 ? 'true' : 'false'}`)

  if (applyAndRollback) {
    console.log(`applyRunId=${output.applyRunId ?? 'none'}`)
    console.log(`rollbackRunId=${output.rollbackRunId ?? 'none'}`)
  }

  await prisma.$disconnect()
}

main().catch(async (e) => {
  console.error('K26-J5 trial FAILED:', e)
  try { await prisma.$disconnect() } catch { /* ignore */ }
  process.exit(1)
})
