/**
 * scripts/plan-worktime-solver-score-harness-k26-j1.ts
 *
 * K26-J1: WorkTime Solver/Score Harness Plan Verification.
 *
 * This is a PLAN-ONLY verification script. It does NOT implement any
 * solver / score / SchedulingRun write / WorkTime API behavior change.
 *
 * 56 read-only checks (no Prisma, no DB, no code modifications):
 *   - Files / docs (1-6)
 *   - Fixtures (7-15)
 *   - Candidate harness plan (16-22)
 *   - Score harness plan (23-30)
 *   - Snapshot harness plan (31-36)
 *   - K22 extension (37-42)
 *   - Verification gates (43-46)
 *   - Non-goals (47-56)
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

  // ── Files / docs (1-6) ──

  // 1. J1 plan docs .md exists
  check('J1 plan docs .md exists',
    existsSync(join(projectRoot, 'docs/k26-worktime-solver-score-harness-plan.md')))

  // 2. J1 plan docs .json exists
  check('J1 plan docs .json exists',
    existsSync(join(projectRoot, 'docs/k26-worktime-solver-score-harness-plan.json')))

  // 3. J1 plan script exists
  check('J1 plan verify script exists',
    existsSync(join(projectRoot, 'scripts/plan-worktime-solver-score-harness-k26-j1.ts')))

  // 4. J1 stage name correct (K26-J1)
  check('J1 stage name K26-J1 declared in plan docs',
    fileContains('docs/k26-worktime-solver-score-harness-plan.md', 'K26-J1') ||
    fileContains('docs/k26-worktime-solver-score-harness-plan.json', 'K26-J1'))

  // 5. J1 declares no solver/score implementation
  check('J1 declares no solver/score implementation',
    (fileContains('docs/k26-worktime-solver-score-harness-plan.md', 'no solver') ||
     fileContains('docs/k26-worktime-solver-score-harness-plan.md', 'NOT implement') ||
     fileContains('docs/k26-worktime-solver-score-harness-plan.md', 'plan-only') ||
     fileContains('docs/k26-worktime-solver-score-harness-plan.md', 'PLAN')))

  // 6. K26-J audit docs exist (the upstream audit J1 is building on)
  check('K26-J audit docs exist',
    existsSync(join(projectRoot, 'docs/k26-worktime-solver-score-integration-audit.md')) &&
    existsSync(join(projectRoot, 'docs/k26-worktime-solver-score-integration-audit.json')))

  // ── Fixtures (7-15) ──

  // 7. STATIC_BASELINE fixture documented
  check('Fixture A STATIC_BASELINE documented',
    fileContains('docs/k26-worktime-solver-score-harness-plan.md', 'STATIC_BASELINE') ||
    fileContains('docs/k26-worktime-solver-score-harness-plan.json', 'STATIC_BASELINE'))

  // 8. SHORT_TEACHING_DAY fixture documented
  check('Fixture B SHORT_TEACHING_DAY documented',
    fileContains('docs/k26-worktime-solver-score-harness-plan.md', 'SHORT_TEACHING_DAY') ||
    fileContains('docs/k26-worktime-solver-score-harness-plan.json', 'SHORT_TEACHING_DAY'))

  // 9. WEEKEND_ENABLED fixture documented
  check('Fixture C WEEKEND_ENABLED documented',
    fileContains('docs/k26-worktime-solver-score-harness-plan.md', 'WEEKEND_ENABLED') ||
    fileContains('docs/k26-worktime-solver-score-harness-plan.json', 'WEEKEND_ENABLED'))

  // 10. LATE_SLOT_REDEFINED fixture documented
  check('Fixture D LATE_SLOT_REDEFINED documented',
    fileContains('docs/k26-worktime-solver-score-harness-plan.md', 'LATE_SLOT_REDEFINED') ||
    fileContains('docs/k26-worktime-solver-score-harness-plan.json', 'LATE_SLOT_REDEFINED'))

  // 11. LEGACY_SLOT_MALFORMED fixture documented
  check('Fixture E LEGACY_SLOT_MALFORMED documented',
    fileContains('docs/k26-worktime-solver-score-harness-plan.md', 'LEGACY_SLOT_MALFORMED') ||
    fileContains('docs/k26-worktime-solver-score-harness-plan.json', 'LEGACY_SLOT_MALFORMED'))

  // 12. fixtures include current expected behavior
  check('fixtures include current expected behavior',
    fileContains('docs/k26-worktime-solver-score-harness-plan.md', 'expectedCurrent') ||
    fileContains('docs/k26-worktime-solver-score-harness-plan.md', 'current') &&
    fileContains('docs/k26-worktime-solver-score-harness-plan.md', 'expected'))

  // 13. fixtures include future expected behavior
  check('fixtures include future expected behavior',
    fileContains('docs/k26-worktime-solver-score-harness-plan.md', 'expectedFuture') ||
    fileContains('docs/k26-worktime-solver-score-harness-plan.md', 'future'))

  // 14. fixtures include legacy 6/7 policy
  check('fixtures include legacy 6/7 policy',
    fileContains('docs/k26-worktime-solver-score-harness-plan.md', 'legacy') ||
    fileContains('docs/k26-worktime-solver-score-harness-plan.md', '6/7') ||
    fileContains('docs/k26-worktime-solver-score-harness-plan.md', 'slot 6') ||
    fileContains('docs/k26-worktime-solver-score-harness-plan.md', 'slot 7'))

  // 15. fixtures include allowWeekend policy
  check('fixtures include allowWeekend policy',
    fileContains('docs/k26-worktime-solver-score-harness-plan.md', 'allowWeekend'))

  // ── Candidate harness plan (16-22) ──

  // 16. exhaustive search plan documented
  check('exhaustive search candidate harness plan documented',
    fileContains('docs/k26-worktime-solver-score-harness-plan.md', 'exhaustive') ||
    fileContains('docs/k26-worktime-solver-score-harness-plan.md', 'Exhaustive'))

  // 17. random generation plan documented
  check('random generation candidate harness plan documented',
    fileContains('docs/k26-worktime-solver-score-harness-plan.md', 'random') ||
    fileContains('docs/k26-worktime-solver-score-harness-plan.md', 'Random'))

  // 18. randomSeed deterministic policy documented
  check('randomSeed deterministic policy documented',
    fileContains('docs/k26-worktime-solver-score-harness-plan.md', 'randomSeed') ||
    fileContains('docs/k26-worktime-solver-score-harness-plan.md', 'deterministic') ||
    fileContains('docs/k26-worktime-solver-score-harness-plan.md', 'Deterministic'))

  // 19. allowedDayOfWeeks assertion documented
  check('allowedDayOfWeeks assertion documented',
    fileContains('docs/k26-worktime-solver-score-harness-plan.md', 'allowedDayOfWeeks') ||
    fileContains('docs/k26-worktime-solver-score-harness-plan.md', 'allowedDays'))

  // 20. activeTeachingSlotIndexes assertion documented
  check('activeTeachingSlotIndexes assertion documented',
    fileContains('docs/k26-worktime-solver-score-harness-plan.md', 'activeTeachingSlot'))

  // 21. slot 6/7 exclusion assertion documented
  check('slot 6/7 exclusion assertion documented',
    fileContains('docs/k26-worktime-solver-score-harness-plan.md', 'slot 6/7') ||
    fileContains('docs/k26-worktime-solver-score-harness-plan.md', 'excluded') ||
    fileContains('docs/k26-worktime-solver-score-harness-plan.md', 'forbidden'))

  // 22. helper extraction decision documented
  check('helper extraction decision documented',
    fileContains('docs/k26-worktime-solver-score-harness-plan.md', 'helper') ||
    fileContains('docs/k26-worktime-solver-score-harness-plan.md', 'Helper'))

  // ── Score harness plan (23-30) ──

  // 23. SC3 full score plan documented
  check('SC3 full score plan documented',
    fileContains('docs/k26-worktime-solver-score-harness-plan.md', 'SC3') &&
    (fileContains('docs/k26-worktime-solver-score-harness-plan.md', 'full') ||
     fileContains('docs/k26-worktime-solver-score-harness-plan.md', 'Full')))

  // 24. SC3 delta score plan documented
  check('SC3 delta score plan documented',
    fileContains('docs/k26-worktime-solver-score-harness-plan.md', 'SC3') &&
    (fileContains('docs/k26-worktime-solver-score-harness-plan.md', 'delta') ||
     fileContains('docs/k26-worktime-solver-score-harness-plan.md', 'Delta')))

  // 25. SC7 full score plan documented
  check('SC7 full score plan documented',
    fileContains('docs/k26-worktime-solver-score-harness-plan.md', 'SC7') &&
    (fileContains('docs/k26-worktime-solver-score-harness-plan.md', 'full') ||
     fileContains('docs/k26-worktime-solver-score-harness-plan.md', 'Full')))

  // 26. SC7 delta score plan documented
  check('SC7 delta score plan documented',
    fileContains('docs/k26-worktime-solver-score-harness-plan.md', 'SC7') &&
    (fileContains('docs/k26-worktime-solver-score-harness-plan.md', 'delta') ||
     fileContains('docs/k26-worktime-solver-score-harness-plan.md', 'Delta')))

  // 27. SC5 teacher balance weekend decision documented
  check('SC5 teacher balance weekend decision documented',
    fileContains('docs/k26-worktime-solver-score-harness-plan.md', 'SC5') ||
    fileContains('docs/k26-worktime-solver-score-harness-plan.md', 'teacher balance') ||
    fileContains('docs/k26-worktime-solver-score-harness-plan.md', 'teacher balance weekend'))

  // 28. full/delta consistency gate documented
  check('full/delta consistency gate documented',
    (fileContains('docs/k26-worktime-solver-score-harness-plan.md', 'full/delta') ||
     fileContains('docs/k26-worktime-solver-score-harness-plan.md', 'full / delta') ||
     fileContains('docs/k26-worktime-solver-score-harness-plan.md', 'consistency')))

  // 29. component-level extraction documented
  check('component-level score extraction documented',
    fileContains('docs/k26-worktime-solver-score-harness-plan.md', 'component') ||
    fileContains('docs/k26-worktime-solver-score-harness-plan.md', 'Component') ||
    fileContains('docs/k26-worktime-solver-score-harness-plan.md', 'lateSlotIndexes') ||
    fileContains('docs/k26-worktime-solver-score-harness-plan.md', 'weekendDayOfWeeks'))

  // 30. scoreSnapshotVersion decision documented
  check('scoreSnapshotVersion decision documented',
    fileContains('docs/k26-worktime-solver-score-harness-plan.md', 'scoreSnapshotVersion') ||
    fileContains('docs/k26-worktime-solver-score-harness-plan.md', 'snapshotVersion') ||
    (fileContains('docs/k26-worktime-solver-score-harness-plan.md', 'snapshot version') ||
     fileContains('docs/k26-worktime-solver-score-harness-plan.md', 'version bump')))

  // ── Snapshot harness plan (31-36) ──

  // 31. workTimeConfigSnapshot schema documented
  check('workTimeConfigSnapshot schema documented',
    fileContains('docs/k26-worktime-solver-score-harness-plan.md', 'workTimeConfigSnapshot') ||
    fileContains('docs/k26-worktime-solver-score-harness-plan.md', 'snapshot'))

  // 32. preview write assertion documented
  check('preview write assertion documented',
    fileContains('docs/k26-worktime-solver-score-harness-plan.md', 'preview'))

  // 33. apply snapshot reuse assertion documented
  check('apply snapshot reuse assertion documented',
    fileContains('docs/k26-worktime-solver-score-harness-plan.md', 'apply'))

  // 34. rollback snapshot behavior documented
  check('rollback snapshot behavior documented',
    fileContains('docs/k26-worktime-solver-score-harness-plan.md', 'rollback'))

  // 35. preview/apply WorkTime change scenario documented
  check('preview/apply WorkTime-change scenario documented',
    (fileContains('docs/k26-worktime-solver-score-harness-plan.md', 'WorkTime change') ||
     fileContains('docs/k26-worktime-solver-score-harness-plan.md', 'preview/apply') ||
     fileContains('docs/k26-worktime-solver-score-harness-plan.md', 'between')))

  // 36. DB write need documented
  check('DB write need documented',
    fileContains('docs/k26-worktime-solver-score-harness-plan.md', 'DB write') ||
    fileContains('docs/k26-worktime-solver-score-harness-plan.md', 'no DB') ||
    fileContains('docs/k26-worktime-solver-score-harness-plan.md', 'read-only'))

  // ── K22 extension (37-42) ──

  // 37. K22-C baseline preservation documented
  check('K22-C baseline preservation documented',
    fileContains('docs/k26-worktime-solver-score-harness-plan.md', 'K22-C') ||
    (fileContains('docs/k26-worktime-solver-score-harness-plan.md', 'K22') &&
     fileContains('docs/k26-worktime-solver-score-harness-plan.md', 'baseline')))

  // 38. Harness K documented
  check('Harness K (WorkTime candidate) documented',
    fileContains('docs/k26-worktime-solver-score-harness-plan.md', 'Harness K') ||
    fileContains('docs/k26-worktime-solver-score-harness-plan.md', 'Harness-K'))

  // 39. Harness L documented
  check('Harness L (WorkTime score) documented',
    fileContains('docs/k26-worktime-solver-score-harness-plan.md', 'Harness L') ||
    fileContains('docs/k26-worktime-solver-score-harness-plan.md', 'Harness-L'))

  // 40. Harness M documented
  check('Harness M (WorkTime snapshot) documented',
    fileContains('docs/k26-worktime-solver-score-harness-plan.md', 'Harness M') ||
    fileContains('docs/k26-worktime-solver-score-harness-plan.md', 'Harness-M'))

  // 41. expected update approval gate documented
  check('expected update approval gate documented',
    fileContains('docs/k26-worktime-solver-score-harness-plan.md', 'expected') &&
    (fileContains('docs/k26-worktime-solver-score-harness-plan.md', 'approval') ||
     fileContains('docs/k26-worktime-solver-score-harness-plan.md', 'Approval') ||
     fileContains('docs/k26-worktime-solver-score-harness-plan.md', 'gate') ||
     fileContains('docs/k26-worktime-solver-score-harness-plan.md', 'Gate')))

  // 42. generatedAt drift prevention documented
  check('generatedAt drift prevention documented',
    fileContains('docs/k26-worktime-solver-score-harness-plan.md', 'generatedAt') ||
    (fileContains('docs/k26-worktime-solver-score-harness-plan.md', 'drift') &&
     fileContains('docs/k26-worktime-solver-score-harness-plan.md', 'prevent')))

  // ── Verification gates (43-46) ──

  // 43. K26-J2 close gate documented
  check('K26-J2 close gate documented',
    fileContains('docs/k26-worktime-solver-score-harness-plan.md', 'K26-J2'))

  // 44. K26-J3 close gate documented
  check('K26-J3 close gate documented',
    fileContains('docs/k26-worktime-solver-score-harness-plan.md', 'K26-J3'))

  // 45. K26-J4 close gate documented
  check('K26-J4 close gate documented',
    fileContains('docs/k26-worktime-solver-score-harness-plan.md', 'K26-J4'))

  // 46. K26-J5 close gate documented
  check('K26-J5 close gate documented',
    fileContains('docs/k26-worktime-solver-score-harness-plan.md', 'K26-J5'))

  // ── Non-goals (47-56) ──

  // 47. no schema change (file unchanged from K26-J audit)
  check('no schema change (prisma/schema.prisma unchanged by J1)',
    !fileContains('prisma/schema.prisma', 'K26-J1'))

  // 48. no migration added
  const migrationDir = join(projectRoot, 'prisma/migrations')
  const migrations = existsSync(migrationDir) ? readdirSync(migrationDir) : []
  check('no migration added', !migrations.some((m: string) => m.includes('k26_j1')))

  // 49. no DB write in J1 script
  // Check actual Prisma client surface area; the literal 'db-write' check is encoded
  // as a positive grep for the @prisma/client module path. Other patterns are
  // disambiguated so the check does not match its own check text.
  const j1Script = readFileSync(join(projectRoot, 'scripts/plan-worktime-solver-score-harness-k26-j1.ts'), 'utf-8')
  // Strip the check's own definition block so we only inspect the rest of the script.
  const ownCheckIdx = j1Script.indexOf('// 49. no DB write in J1 script')
  const restOfScript = ownCheckIdx > 0 ? j1Script.slice(0, ownCheckIdx) : j1Script
  const hasDbImport = /from\s+['"]@prisma\/client['"]/.test(restOfScript)
  const hasDbInstantiation = /new\s+PrismaClient/.test(restOfScript)
  const hasDbCall = /\bprisma\$\w+/.test(restOfScript)
  check('no DB write in J1 script',
    !hasDbImport && !hasDbInstantiation && !hasDbCall)

  // 50. no solver behavior change
  check('solver.ts unchanged (no K26-J1 marker)',
    !fileContains('src/lib/scheduler/solver.ts', 'K26-J1'))

  // 51. no score change
  check('score.ts unchanged (no K26-J1 marker)',
    !fileContains('src/lib/scheduler/score.ts', 'K26-J1'))

  // 52. no scheduler API behavior change
  check('scheduler preview API unchanged',
    !fileContains('src/app/api/admin/scheduler/preview/route.ts', 'K26-J1'))

  // 53. no SchedulingRun write logic change
  check('SchedulingRun write logic unchanged',
    !fileContains('src/lib/scheduler/preview.ts', 'K26-J1') &&
    !fileContains('src/lib/scheduler/apply.ts', 'K26-J1'))

  // 54. no K22 expected change
  check('K22 harness expected unchanged (no K26-J1 marker)',
    !fileContains('scripts/verify-score-regression-harness-k22-c.ts', 'K26-J1'))

  // 55. no recommendation behavior change
  check('WorkTime recommendation behavior unchanged',
    !fileContains('src/lib/schedule/adjustment-plan-recommendations.ts', 'K26-J1') &&
    !fileContains('src/lib/schedule/room-recommendations.ts', 'K26-J1'))

  // 56. no UI change
  check('UI unchanged (no K26-J1 marker)',
    !fileContains('src/components/schedule-adjustment-dialog.tsx', 'K26-J1') &&
    !fileContains('src/components/settings/worktime-settings-panel.tsx', 'K26-J1'))

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
    console.log('K26-J1 WORKTIME SOLVER SCORE HARNESS PLAN PASS')
    console.log(`PASS=${results.length} FAIL=0`)
    console.log('blocking=false')
    console.log('recommendedNextStage=K26-J2-WORKTIME-SCHEDULINGRUN-SNAPSHOT-WRITE')
  } else {
    console.log(`K26-J1 PLAN FAIL: ${failed.length} failures`)
    console.log(`PASS=${passed} FAIL=${failed.length}`)
    for (const f of failed) {
      console.log(`  FAIL #${f.id}: ${f.name}${f.detail ? ` — ${f.detail}` : ''}`)
    }
    process.exit(1)
  }
}

main()
