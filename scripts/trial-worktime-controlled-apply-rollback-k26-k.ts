/**
 * scripts/trial-worktime-controlled-apply-rollback-k26-k.ts
 *
 * K26-K: Controlled apply / rollback trial.
 *
 * Runs a real preview → apply → rollback chain and verifies that
 * business data is restored to pre-apply state. Does NOT commit any
 * DB or backup file.
 *
 * Usage:
 *   npx tsx scripts/trial-worktime-controlled-apply-rollback-k26-k.ts --controlled --create-new-preview
 *   npx tsx scripts/trial-worktime-controlled-apply-rollback-k26-k.ts --controlled --reuse-run-id=85
 */

import { existsSync, copyFileSync, statSync } from 'fs'
import { join } from 'path'
import { prisma } from '@/lib/prisma'
import { createSchedulerPreview } from '@/lib/scheduler/preview'
import { applySchedulerPreview } from '@/lib/scheduler/apply'
import { rollbackSchedulerApply } from '@/lib/scheduler/rollback'
import { readWorkTimeSnapshotFromRun } from '@/lib/worktime/worktime-snapshot'

const args = process.argv.slice(2)
const controlled = args.includes('--controlled')
const createNewPreview = args.includes('--create-new-preview')
const reuseArg = args.find((a) => a.startsWith('--reuse-run-id='))
const reuseRunId = reuseArg ? Number(reuseArg.split('=')[1]) : null

// ── Results accumulator ──

const output: Record<string, string | number | boolean> = {}
function set(k: string, v: string | number | boolean) { output[k] = v }

interface Signatures {
  scheduleSlotCount: number
  scheduleSlotHash: string
  teachingTaskCount: number
  teachingTaskClassCount: number
  scheduleAdjustmentCount: number
  schedulingRunCount: number
  schedulerRunChangeCount: number
}

function hashSlots(slots: { id: number; teachingTaskId: number; dayOfWeek: number; slotIndex: number; roomId: number | null }[]): string {
  // Simple deterministic hash: id|teachingTaskId|day|slot|room
  const sorted = [...slots].sort((a, b) => a.id - b.id)
  return sorted.map((s) => `${s.id}:${s.teachingTaskId}:${s.dayOfWeek}:${s.slotIndex}:${s.roomId ?? 0}`).join('|')
}

async function captureSignatures(): Promise<Signatures> {
  const slots = await prisma.scheduleSlot.findMany({
    select: { id: true, teachingTaskId: true, dayOfWeek: true, slotIndex: true, roomId: true },
  })
  const slotHash = hashSlots(slots)
  const [teachingTaskCount, teachingTaskClassCount, scheduleAdjustmentCount, schedulingRunCount, schedulerRunChangeCount] = await Promise.all([
    prisma.teachingTask.count(),
    prisma.teachingTaskClass.count(),
    prisma.scheduleAdjustment.count(),
    prisma.schedulingRun.count(),
    prisma.schedulerRunChange.count(),
  ])
  return {
    scheduleSlotCount: slots.length,
    scheduleSlotHash: slotHash,
    teachingTaskCount,
    teachingTaskClassCount,
    scheduleAdjustmentCount,
    schedulingRunCount,
    schedulerRunChangeCount,
  }
}

function sign(backupPath: string): void {
  console.log(`\nBackup created: ${backupPath}`)
  if (existsSync(backupPath)) {
    const s = statSync(backupPath)
    console.log(`  size=${s.size} bytes, mtime=${s.mtime.toISOString()}`)
  }
}

function sleep(ms: number): Promise<void> { return new Promise((r) => setTimeout(r, ms)) }

const backupPathRef: { current: string } = { current: '' }
function getBackupPath(): string { return backupPathRef.current }

async function main() {
  console.log('K26-K: Controlled Apply / Rollback Trial')
  console.log('─'.repeat(60))
  console.log(`controlled=${controlled} createNewPreview=${createNewPreview} reuseRunId=${reuseRunId}`)

  if (!controlled) {
    console.error('ERROR: --controlled flag required')
    process.exit(1)
  }

  const dbPath = join(projectRoot, 'prisma', 'dev.db')
  if (!existsSync(dbPath)) {
    console.error(`ERROR: dev.db not found at ${dbPath}`)
    process.exit(1)
  }

  // ── 1. Create backup ──
  const ts = new Date().toISOString().replace(/[:.]/g, '-')
  const backupPath = join(projectRoot, 'prisma', `dev.db.backup-before-k26-k-controlled-apply-rollback-${ts}`)
  copyFileSync(dbPath, backupPath)
  sign(backupPath)
  backupPathRef.current = backupPath
  set('backupPath', backupPath)

  // ── 2. Capture pre-apply signatures ──
  console.log('\nCapturing pre-apply signatures...')
  const preApply = await captureSignatures()
  set('preApplySlotCount', preApply.scheduleSlotCount)
  set('preApplySlotHash', preApply.scheduleSlotHash.slice(0, 64) + '...')
  set('preApplyTeachingTaskCount', preApply.teachingTaskCount)
  set('preApplyTeachingTaskClassCount', preApply.teachingTaskClassCount)
  set('preApplyScheduleAdjustmentCount', preApply.scheduleAdjustmentCount)
  set('preApplySchedulingRunCount', preApply.schedulingRunCount)
  set('preApplySchedulerRunChangeCount', preApply.schedulerRunChangeCount)
  console.log(`  slotCount=${preApply.scheduleSlotCount}`)
  console.log(`  teachingTaskCount=${preApply.teachingTaskCount}`)
  console.log(`  schedulingRunCount=${preApply.schedulingRunCount}`)

  // ── 3. Run or reuse preview ──
  let previewRunId: number
  if (createNewPreview) {
    console.log('\nRunning scheduler preview...')
    const activeSemester = await prisma.semester.findFirst({ where: { isActive: true } })
    if (!activeSemester) {
      console.error('ERROR: No active semester')
      process.exit(1)
    }
    const preview = await createSchedulerPreview({
      semesterId: activeSemester.id,
      maxIterations: 10000,
      randomSeed: 20260609,
    })
    previewRunId = preview.runId
    set('previewRunId', preview.runId)
    set('previewMode', 'create-new-preview')
    set('hardScore', preview.scoreAfter.hardScore)
    set('softScore', preview.scoreAfter.softScore)
    set('blocking', preview.blocked)
    console.log(`  preview runId=${preview.runId}, hardScore=${preview.scoreAfter.hardScore}, blocking=${preview.blocked}`)

    if (preview.scoreAfter.hardScore !== 0) {
      console.error('ERROR: Preview has hard conflicts, cannot apply safely')
      process.exit(1)
    }
  } else if (reuseRunId != null) {
    console.log(`\nReusing preview runId=${reuseRunId}`)
    const run = await prisma.schedulingRun.findUnique({ where: { id: reuseRunId } })
    if (!run) {
      console.error(`ERROR: runId=${reuseRunId} not found`)
      process.exit(1)
    }
    if (run.mode !== 'PREVIEW' || run.status !== 'COMPLETED') {
      console.error(`ERROR: runId=${reuseRunId} not in preview-completed state`)
      process.exit(1)
    }
    previewRunId = reuseRunId
    set('previewRunId', reuseRunId)
    set('previewMode', 'reuse-run-id')
    set('hardScore', run.hardScore ?? 0)
    set('softScore', run.softScore ?? 0)
    set('blocking', (run.hardScore ?? 0) !== 0)
  } else {
    console.error('ERROR: must specify --create-new-preview or --reuse-run-id=N')
    process.exit(1)
  }

  // Verify preview run has WorkTime snapshot
  const previewRun = await prisma.schedulingRun.findUnique({ where: { id: previewRunId } })
  const previewSnap = readWorkTimeSnapshotFromRun({ workTimeConfigSnapshot: previewRun?.workTimeConfigSnapshot ?? null })
  if (!previewSnap) {
    console.error('ERROR: preview run has no WorkTime snapshot')
    process.exit(1)
  }
  set('previewSnapshotPresent', true)
  set('previewSnapshotVersion', previewSnap.version)
  set('previewCandidateDays', JSON.stringify(previewSnap.allowedDayOfWeeks))
  set('previewCandidateSlots', JSON.stringify(previewSnap.activeTeachingSlotIndexes))
  set('legacySlotsExcluded', !previewSnap.activeTeachingSlotIndexes.includes(6) && !previewSnap.activeTeachingSlotIndexes.includes(7))
  console.log(`  snapshot version=${previewSnap.version}, candidateDays=${JSON.stringify(previewSnap.allowedDayOfWeeks)}, candidateSlots=${JSON.stringify(previewSnap.activeTeachingSlotIndexes)}`)

  // ── 4. Execute apply ──
  console.log('\nExecuting apply...')
  let applyResult: Awaited<ReturnType<typeof applySchedulerPreview>>
  try {
    applyResult = await applySchedulerPreview({
      previewRunId,
      confirmApply: true,
    })
    set('applySucceeded', true)
    set('applyRunId', applyResult.applyRunId)
    console.log(`  apply runId=${applyResult.applyRunId}, appliedSlots=${applyResult.appliedSlotCount}, hardScoreAfter=${applyResult.hardScoreAfter}`)
  } catch (e) {
    console.error('ERROR: apply failed:', e instanceof Error ? e.message : String(e))
    set('applySucceeded', false)
    set('failedStep', 'apply')
    set('restoreRecommendation', `Restore from backup: ${backupPath}`)
    await outputResult('BLOCKED')
    await prisma.$disconnect()
    process.exit(1)
  }

  // Verify apply run snapshot
  const applyRun = await prisma.schedulingRun.findUnique({ where: { id: applyResult.applyRunId } })
  const applySnap = readWorkTimeSnapshotFromRun({ workTimeConfigSnapshot: applyRun?.workTimeConfigSnapshot ?? null })
  set('applySnapshotPresent', applySnap != null)
  if (applySnap) {
    // Check raw JSON byte-identical
    const previewRaw = previewRun?.workTimeConfigSnapshot ?? ''
    const applyRaw = applyRun?.workTimeConfigSnapshot ?? ''
    set('applySnapshotIdenticalToPreview', previewRaw === applyRaw)
    console.log(`  apply snapshot present, byte-identical to preview: ${previewRaw === applyRaw}`)
  }

  // Capture after-apply signatures
  await sleep(100)
  const afterApply = await captureSignatures()
  set('afterApplySlotCount', afterApply.scheduleSlotCount)
  set('afterApplySlotHash', afterApply.scheduleSlotHash.slice(0, 64) + '...')
  set('afterApplySchedulingRunCount', afterApply.schedulingRunCount)
  set('afterApplySchedulerRunChangeCount', afterApply.schedulerRunChangeCount)
  set('scheduleSlotCountRestored', afterApply.scheduleSlotCount === preApply.scheduleSlotCount)
  console.log(`  slotCount: ${preApply.scheduleSlotCount} → ${afterApply.scheduleSlotCount}`)

  // ── 5. Execute rollback ──
  console.log('\nExecuting rollback...')
  let rollbackResult: Awaited<ReturnType<typeof rollbackSchedulerApply>>
  try {
    rollbackResult = await rollbackSchedulerApply({
      applyRunId: applyResult.applyRunId,
      confirmRollback: true,
    })
    set('rollbackSucceeded', true)
    set('rollbackRunId', rollbackResult.rollbackRunId)
    console.log(`  rollback runId=${rollbackResult.rollbackRunId}, rolledBackSlots=${rollbackResult.rolledBackSlotCount}, hardScoreAfter=${rollbackResult.hardScoreAfter}`)
  } catch (e) {
    console.error('ERROR: rollback failed:', e instanceof Error ? e.message : String(e))
    set('rollbackSucceeded', false)
    set('failedStep', 'rollback')
    set('restoreRecommendation', `Manual restore from backup: ${backupPath}`)
    await outputResult('BLOCKED')
    await prisma.$disconnect()
    process.exit(1)
  }

  // Verify rollback run snapshot
  const rollbackRun = await prisma.schedulingRun.findUnique({ where: { id: rollbackResult.rollbackRunId } })
  const rollbackSnap = readWorkTimeSnapshotFromRun({ workTimeConfigSnapshot: rollbackRun?.workTimeConfigSnapshot ?? null })
  set('rollbackSnapshotPresent', rollbackSnap != null)
  if (rollbackSnap) {
    const applyRaw2 = applyRun?.workTimeConfigSnapshot ?? ''
    const rollbackRaw = rollbackRun?.workTimeConfigSnapshot ?? ''
    set('rollbackSnapshotIdenticalToApply', applyRaw2 === rollbackRaw)
    console.log(`  rollback snapshot present, byte-identical to apply: ${applyRaw2 === rollbackRaw}`)
  }

  // ── 6. Capture after-rollback signatures ──
  await sleep(100)
  const afterRollback = await captureSignatures()
  set('afterRollbackSlotCount', afterRollback.scheduleSlotCount)
  set('afterRollbackSlotHash', afterRollback.scheduleSlotHash.slice(0, 64) + '...')
  set('afterRollbackTeachingTaskCount', afterRollback.teachingTaskCount)
  set('afterRollbackTeachingTaskClassCount', afterRollback.teachingTaskClassCount)
  set('afterRollbackScheduleAdjustmentCount', afterRollback.scheduleAdjustmentCount)
  set('afterRollbackSchedulingRunCount', afterRollback.schedulingRunCount)
  set('afterRollbackSchedulerRunChangeCount', afterRollback.schedulerRunChangeCount)

  // Verify business data restored
  const businessDataRestored =
    afterRollback.scheduleSlotCount === preApply.scheduleSlotCount &&
    afterRollback.scheduleSlotHash === preApply.scheduleSlotHash &&
    afterRollback.teachingTaskCount === preApply.teachingTaskCount &&
    afterRollback.teachingTaskClassCount === preApply.teachingTaskClassCount &&
    afterRollback.scheduleAdjustmentCount === preApply.scheduleAdjustmentCount
  set('businessDataRestored', businessDataRestored)
  console.log(`  slotCount: ${afterApply.scheduleSlotCount} → ${afterRollback.scheduleSlotCount} (preApply: ${preApply.scheduleSlotCount})`)
  console.log(`  businessDataRestored: ${businessDataRestored}`)

  // Audit drift = scheduling runs and change rows are expected to differ
  const auditDrift =
    afterRollback.schedulingRunCount > preApply.schedulingRunCount ||
    afterRollback.schedulerRunChangeCount > preApply.schedulerRunChangeCount
  set('acceptableAuditDrift', auditDrift)
  set('runAuditDriftCount', afterRollback.schedulingRunCount - preApply.schedulingRunCount)
  set('changeAuditDriftCount', afterRollback.schedulerRunChangeCount - preApply.schedulerRunChangeCount)
  console.log(`  audit drift: runs +${afterRollback.schedulingRunCount - preApply.schedulingRunCount}, changes +${afterRollback.schedulerRunChangeCount - preApply.schedulerRunChangeCount}`)

  // ── 7. Final result ──
  if (businessDataRestored && output.applySucceeded && output.rollbackSucceeded) {
    await outputResult('PASS')
  } else {
    await outputResult('BLOCKED')
    process.exit(1)
  }

  await prisma.$disconnect()
}

async function outputResult(status: 'PASS' | 'BLOCKED') {
  const lines = [
    '',
    '─'.repeat(60),
  ]
  if (status === 'PASS') {
    lines.push('K26-K CONTROLLED APPLY ROLLBACK TRIAL PASS')
  } else {
    lines.push('K26-K CONTROLLED APPLY ROLLBACK TRIAL BLOCKED')
  }
  for (const [k, v] of Object.entries(output)) {
    lines.push(`${k}=${v}`)
  }
  lines.push(`controlledApplyRollbackStatus=${status}`)
  lines.push(`businessDataRestored=${output.businessDataRestored ?? 'unknown'}`)
  lines.push(`acceptableAuditDrift=${output.acceptableAuditDrift ?? 'unknown'}`)
  if (status === 'PASS') {
    lines.push('recommendedNextStage=K27-SYSTEM-WIDE-REAL-USAGE-TRIAL-PLAN')
  } else {
    lines.push(`restoreRecommendation=${output.restoreRecommendation ?? getBackupPath()}`)
  }
  lines.push(`backupRetention=${getBackupPath()}`)
  console.log(lines.join('\n'))
}

const projectRoot = join(__dirname, '..')

main().catch(async (e) => {
  console.error('K26-K trial crashed:', e)
  try { await prisma.$disconnect() } catch { /* ignore */ }
  process.exit(1)
})
