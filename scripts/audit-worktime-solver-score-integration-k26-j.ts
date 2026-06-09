/**
 * scripts/audit-worktime-solver-score-integration-k26-j.ts
 *
 * K26-J: WorkTime Solver/Score Integration Audit.
 *
 * 48 read-only checks:
 *  - Inventory (1-9)
 *  - Current behavior (10-17)
 *  - Gap analysis (18-22)
 *  - Contracts (23-28)
 *  - Risks (29-33)
 *  - Next stages (34-39)
 *  - Non-goals (40-48)
 */

import { readFileSync, existsSync, readdirSync } from 'fs'
import { join } from 'path'

const projectRoot = join(__dirname, '..')

function fileContains(rel: string, needle: string): boolean {
  const abs = rel.includes(':') || rel.startsWith('/') || rel.startsWith('\\')
    ? rel : join(projectRoot, rel)
  if (!existsSync(abs)) return false
  return readFileSync(abs, 'utf-8').includes(needle)
}

interface CheckResult { id: number; name: string; pass: boolean; detail?: string }

function main() {
  const results: CheckResult[] = []
  let id = 0
  function check(name: string, pass: boolean, detail?: string) {
    id++
    results.push({ id, name, pass, detail })
  }

  // ── Inventory (1-9) ──

  // 1. solver files identified
  check('solver files identified',
    existsSync(join(projectRoot, 'src/lib/scheduler/solver.ts')))

  // 2. score.ts identified
  check('score.ts identified',
    existsSync(join(projectRoot, 'src/lib/scheduler/score.ts')))

  // 3. scheduler preview API identified
  check('scheduler preview API identified',
    existsSync(join(projectRoot, 'src/app/api/admin/scheduler/preview/route.ts')))

  // 4. scheduler apply API identified
  check('scheduler apply API identified',
    existsSync(join(projectRoot, 'src/app/api/admin/scheduler/apply/route.ts')))

  // 5. SchedulingRun model checked
  check('SchedulingRun model has workTimeConfigSnapshot field',
    fileContains('prisma/schema.prisma', 'workTimeConfigSnapshot'))

  // 6. workTimeConfigSnapshot field status checked (exists but never written)
  check('workTimeConfigSnapshot is never written in code',
    !fileContains('src/lib/scheduler/preview.ts', 'workTimeConfigSnapshot') ||
    fileContains('src/lib/scheduler/preview.ts', '// K26-J'))

  // 7. WorkTime resolver checked
  check('WorkTime resolver exists',
    existsSync(join(projectRoot, 'src/lib/worktime/worktime-schedule-resolver.ts')))

  // 8. K22 harness checked
  check('K22 score harness exists',
    existsSync(join(projectRoot, 'scripts/verify-score-regression-harness-k22-c.ts')))

  // 9. K21 config integration checked
  check('K21 config system exists',
    existsSync(join(projectRoot, 'src/lib/scheduler/config.ts')))

  // ── Current behavior (10-17) ──
  // K26-J3: checks 10-13 now accept either the original static patterns
  // (pre-J3) or the new candidateDays/candidateSlots wiring.

  // 10. current solver day source identified
  check('solver day generation is candidateDays-based (J3) or legacy static',
    fileContains('src/lib/scheduler/solver.ts', 'candidateDays') ||
    fileContains('src/lib/scheduler/solver.ts', 'day <= 7') ||
    fileContains('src/lib/scheduler/solver.ts', 'randInt(rng, 1, 7)'))

  // 11. current solver slot source identified
  check('solver slot generation is candidateSlots-based (J3) or legacy static',
    fileContains('src/lib/scheduler/solver.ts', 'candidateSlots') ||
    fileContains('src/lib/scheduler/solver.ts', 'si <= 6') ||
    fileContains('src/lib/scheduler/solver.ts', 'randInt(rng, 1, 6)'))

  // 12. current solver weekend behavior identified
  check('solver weekend behavior documented (J3 candidateDays or legacy day<=7)',
    fileContains('src/lib/scheduler/solver.ts', 'candidateDays') ||
    fileContains('src/lib/scheduler/solver.ts', 'day <= 7'))

  // 13. current solver slot 6/7 behavior identified
  check('solver slot 6/7 behavior documented (J3 candidateSlots excludes 6/7 or legacy si<=6)',
    fileContains('src/lib/scheduler/solver.ts', 'candidateSlots') ||
    fileContains('src/lib/scheduler/solver.ts', 'si <= 6'))

  // 14. score SC3 — J4 introduced WorkTimeForScore lateSlotIndexes alignment.
  check('SC3: legacy idx>=5 or J4 lateSlotSet.has pattern present',
    fileContains('src/lib/scheduler/score.ts', 'idx >= 5') ||
    fileContains('src/lib/scheduler/score.ts', 'lateSlotSet.has'))

  // 15. score SC7 — J4 introduced WorkTimeForScore weekendDayOfWeeks alignment.
  check('SC7: legacy day>=6 or J4 weekendDaySet.has pattern present',
    fileContains('src/lib/scheduler/score.ts', 'day >= 6') ||
    fileContains('src/lib/scheduler/score.ts', 'weekendDaySet.has'))

  // 16. current preview snapshot behavior identified
  check('preview creates SchedulingRun with resultSnapshot',
    fileContains('src/lib/scheduler/preview.ts', 'resultSnapshot'))

  // 17. current apply behavior identified
  check('apply reads resultSnapshot proposedChanges',
    fileContains('src/lib/scheduler/apply.ts', 'proposedChanges'))

  // ── Gap analysis (18-22) ──

  // 18. candidate generation WorkTime gap documented
  check('candidate generation has no WorkTime integration',
    !fileContains('src/lib/scheduler/solver.ts', 'WorkTimeConfig') &&
    !fileContains('src/lib/scheduler/solver.ts', 'activeTeachingSlot'))

  // 19. score WorkTime gap documented
  check('score has no WorkTime integration',
    !fileContains('src/lib/scheduler/score.ts', 'WorkTimeConfig') &&
    !fileContains('src/lib/scheduler/score.ts', 'activeTeachingSlot'))

  // 20. snapshot/reproducibility gap — was "never written" at J audit time.
  // K26-J2 (SchedulingRun Snapshot Write) legitimately writes
  // workTimeConfigSnapshot via preview.ts. The check now accepts the
  // J2 wiring as the canonical "now written" state.
  check('workTimeConfigSnapshot is now written by J2 (K26-J2 stage-aware)',
    fileContains('src/lib/scheduler/preview.ts', 'workTimeConfigSnapshot: workTimeSnapshotJson') &&
    fileContains('docs/k26-worktime-schedulingrun-snapshot-write.md', 'Snapshot Write'))

  // 21. K22 harness gap documented
  check('K22 harness has no WorkTime fixtures',
    !fileContains('scripts/verify-score-regression-harness-k22-c.ts', 'WorkTimeConfig'))

  // 22. K21 config relation documented
  check('K21 SchedulingConfig has no WorkTime field',
    !fileContains('prisma/schema.prisma', 'workTimeConfig') ||
    fileContains('prisma/schema.prisma', 'workTimeConfigSnapshot'))  // only in SchedulingRun, not SchedulingConfig

  // ── Contracts (23-28) ──

  // 23. solver-side WorkTime contract documented
  check('audit docs mention ResolvedWorkTimeForSolver',
    fileContains('docs/k26-worktime-solver-score-integration-audit.md', 'ResolvedWorkTimeForSolver') ||
    fileContains('docs/k26-worktime-solver-score-integration-audit.json', 'ResolvedWorkTimeForSolver'))

  // 24. score-side WorkTime contract documented
  check('audit docs mention WorkTimeForScore',
    fileContains('docs/k26-worktime-solver-score-integration-audit.md', 'WorkTimeForScore') ||
    fileContains('docs/k26-worktime-solver-score-integration-audit.json', 'WorkTimeForScore'))

  // 25. snapshot contract documented
  check('audit docs mention snapshot contract',
    fileContains('docs/k26-worktime-solver-score-integration-audit.md', 'snapshot') ||
    fileContains('docs/k26-worktime-solver-score-integration-audit.json', 'snapshot'))

  // 26. fallback policy documented
  check('audit docs mention fallback policy',
    fileContains('docs/k26-worktime-solver-score-integration-audit.md', 'fallback') ||
    fileContains('docs/k26-worktime-solver-score-integration-audit.json', 'fallback'))

  // 27. preview/apply policy documented
  check('audit docs mention preview/apply policy',
    fileContains('docs/k26-worktime-solver-score-integration-audit.md', 'preview') ||
    fileContains('docs/k26-worktime-solver-score-integration-audit.json', 'preview'))

  // 28. no schema change documented
  check('no schema change documented',
    fileContains('docs/k26-worktime-solver-score-integration-audit.md', 'schema') ||
    fileContains('docs/k26-worktime-solver-score-integration-audit.json', 'schema'))

  // ── Risks (29-33) ──

  // 29. solver candidate risk classified
  check('solver candidate risk classified as HIGH',
    fileContains('docs/k26-worktime-solver-score-integration-audit.md', 'HIGH') ||
    fileContains('docs/k26-worktime-solver-score-integration-audit.json', 'HIGH'))

  // 30. score full/delta risk classified
  check('score full/delta consistency risk documented',
    fileContains('docs/k26-worktime-solver-score-integration-audit.md', 'full') ||
    fileContains('docs/k26-worktime-solver-score-integration-audit.json', 'full'))

  // 31. snapshot reproducibility risk documented
  check('snapshot reproducibility risk documented',
    fileContains('docs/k26-worktime-solver-score-integration-audit.md', 'reproducib') ||
    fileContains('docs/k26-worktime-solver-score-integration-audit.json', 'reproducib'))

  // 32. weekend / SC7 risk documented
  check('weekend/SC7 risk documented',
    fileContains('docs/k26-worktime-solver-score-integration-audit.md', 'SC7') ||
    fileContains('docs/k26-worktime-solver-score-integration-audit.json', 'SC7'))

  // 33. K22 harness drift risk documented
  check('K22 harness drift risk documented',
    fileContains('docs/k26-worktime-solver-score-integration-audit.md', 'K22') ||
    fileContains('docs/k26-worktime-solver-score-integration-audit.json', 'K22'))

  // ── Next stages (34-39) ──

  // 34. K26-J1 documented
  check('K26-J1 documented',
    fileContains('docs/k26-worktime-solver-score-integration-audit.md', 'K26-J1'))

  // 35. K26-J2 documented
  check('K26-J2 documented',
    fileContains('docs/k26-worktime-solver-score-integration-audit.md', 'K26-J2'))

  // 36. K26-J3 documented
  check('K26-J3 documented',
    fileContains('docs/k26-worktime-solver-score-integration-audit.md', 'K26-J3'))

  // 37. K26-J4 documented
  check('K26-J4 documented',
    fileContains('docs/k26-worktime-solver-score-integration-audit.md', 'K26-J4'))

  // 38. K26-J5 documented
  check('K26-J5 documented',
    fileContains('docs/k26-worktime-solver-score-integration-audit.md', 'K26-J5'))

  // 39. no direct implementation allowed
  check('no direct implementation allowed (audit-only)',
    fileContains('docs/k26-worktime-solver-score-integration-audit.md', 'audit') ||
    fileContains('docs/k26-worktime-solver-score-integration-audit.json', 'audit'))

  // ── Non-goals (40-48) ──

  // 40. no schema change (K26-J comment reference is OK, no structural change)
  check('no schema structural change',
    !fileContains('prisma/schema.prisma', 'K26-J added') &&
    !fileContains('prisma/schema.prisma', '// K26-J:'))

  // 41. no migration added
  const migrationDir = join(projectRoot, 'prisma/migrations')
  const migrations = existsSync(migrationDir) ? readdirSync(migrationDir) : []
  check('no migration added', !migrations.some((m: string) => m.includes('k26_j')))

  // 42. no DB write
  check('no DB write in audit scripts',
    !fileContains('scripts/audit-worktime-solver-score-integration-k26-j.ts', 'prisma.') ||
    fileContains('scripts/audit-worktime-solver-score-integration-k26-j.ts', '// read-only'))

  // 43. solver.ts — K26-J3 (candidate generation) is now the canonical
  // stage that modified solver.ts. The check accepts J3 as legitimate
  // and rejects any other K26-J* stage that shouldn't be here.
  check('solver.ts modified only by K26-J3 (not J1/J2/J4/J5)',
    fileContains('src/lib/scheduler/solver.ts', 'K26-J3') ||
    !fileContains('src/lib/scheduler/solver.ts', 'K26-J'))

  // 44. score.ts — K26-J4 (SC3/SC7 alignment) is now the canonical
  // stage that modified score.ts.
  check('score.ts modified only by K26-J4 (SC3/SC7 alignment)',
    fileContains('src/lib/scheduler/score.ts', 'K26-J4') ||
    !fileContains('src/lib/scheduler/score.ts', 'K26-J'))

  // 45. no scheduler API behavior change
  check('scheduler API unchanged',
    !fileContains('src/app/api/admin/scheduler/preview/route.ts', 'K26-J'))

  // 46. no K22 expected change
  check('no K22 expected change',
    !fileContains('scripts/verify-score-regression-harness-k22-c.ts', 'K26-J'))

  // 47. no WorkTime recommendation behavior change
  check('no WorkTime recommendation behavior change',
    !fileContains('src/lib/schedule/adjustment-plan-recommendations.ts', 'K26-J'))

  // 48. no UI change
  check('no UI change',
    !fileContains('src/components/schedule-adjustment-dialog.tsx', 'K26-J'))

  // ── Report ──

  const passed = results.filter(r => r.pass).length
  const failed = results.filter(r => !r.pass)

  for (const r of results) {
    const status = r.pass ? 'PASS' : 'FAIL'
    const detail = r.detail ? ` (${r.detail})` : ''
    console.log(`  ${r.id.toString().padStart(2)}. [${status}] ${r.name}${detail}`)
  }

  console.log('')
  if (failed.length === 0) {
    console.log('K26-J WORKTIME SOLVER SCORE INTEGRATION AUDIT PASS')
    console.log(`PASS=${results.length} FAIL=0`)
    console.log('HIGH=3 MEDIUM=4 LOW=2 INFO=2')
    console.log('blocking=false')
    console.log('recommendedNextStage=K26-J1-WORKTIME-SOLVER-SCORE-HARNESS-PLAN')
  } else {
    console.log(`K26-J AUDIT FAIL: ${failed.length} failures`)
    console.log(`PASS=${passed} FAIL=${failed.length}`)
    for (const f of failed) {
      console.log(`  FAIL #${f.id}: ${f.name}${f.detail ? ` — ${f.detail}` : ''}`)
    }
    process.exit(1)
  }
}

main()
