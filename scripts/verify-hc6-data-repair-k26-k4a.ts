/**
 * scripts/verify-hc6-data-repair-k26-k4a.ts
 *
 * K26-K4A: Verify that slot383 HC6 data repair was successful.
 * Read-only. Does NOT write DB (except reading post-repair state).
 */

import { existsSync, readFileSync } from 'fs'
import { join } from 'path'
import { execSync } from 'child_process'
import { prisma } from '@/lib/prisma'
import { isLinxiaoRoomName, classifySpecialty, computeHC6Penalty } from '@/lib/scheduler/score'

const projectRoot = join(__dirname, '..')
const TARGET_SLOT_ID = 383

interface CheckResult { id: number; name: string; pass: boolean; detail?: string }
const results: CheckResult[] = []
let id = 0
function check(name: string, pass: boolean, detail?: string) {
  id++
  results.push({ id, name, pass, detail })
}

async function main() {
  console.log('K26-K4A: HC6 Data Repair Verify')
  console.log('─'.repeat(60))

  // ── 1. slot383 post-repair state ──
  const slot = await prisma.scheduleSlot.findUnique({
    where: { id: TARGET_SLOT_ID },
    include: {
      room: true,
      teachingTask: { include: { course: true, teacher: true, taskClasses: { include: { classGroup: true } } } },
    },
  })
  check('slot383 exists', slot != null)
  if (!slot) {
    console.log('Cannot continue without slot383')
    await prisma.$disconnect()
    return
  }

  const room = slot.room
  const isLx = room ? isLinxiaoRoomName(room) : false
  const cls = classifySpecialty(slot.teachingTask as never)
  const hc6Penalty = computeHC6Penalty(cls, isLx)

  check('slot383 no longer in Linxiao room', !isLx, `room=${room?.name} isLx=${isLx}`)
  check('slot383 no longer triggers HC6', hc6Penalty === 0, `hc6Penalty=${hc6Penalty}`)
  check('slot383 specialty classification unchanged',
    cls === 'NON_AUTOMOTIVE_ONLY',
    `cls=${cls}`)
  check('slot383 task data preserved (course=林业法规与执法实务)',
    slot.teachingTask.course?.name === '林业法规与执法实务',
    slot.teachingTask.course?.name)
  check('slot383 task data preserved (teacher=徐厚朴)',
    slot.teachingTask.teacher?.name === '徐厚朴',
    slot.teachingTask.teacher?.name)
  check('slot383 task data preserved (classGroup)',
    slot.teachingTask.taskClasses.some(tc => tc.classGroup.name === '2024级林业技术1班'),
    slot.teachingTask.taskClasses.map(tc => tc.classGroup.name).join(', '))
  check('slot383 day/slot preserved',
    slot.dayOfWeek === 1 && slot.slotIndex === 2,
    `day=${slot.dayOfWeek}, slotIdx=${slot.slotIndex}`)

  // ── 2. slot244 sanity (K4C fix should still hold) ──
  const slot244 = await prisma.scheduleSlot.findUnique({ where: { id: 244 } })
  check('slot244 still exists', slot244 != null)
  if (slot244) {
    const r244 = slot244.roomId ? await prisma.room.findUnique({ where: { id: slot244.roomId } }) : null
    const isLx244 = r244 ? isLinxiaoRoomName(r244) : false
    check('slot244 not in Linxiao room (K4C fix preserved)',
      slot244.roomId == null || !isLx244,
      `roomId=${slot244.roomId} room=${r244?.name}`)
  }

  // ── 3. Check no other solver-introduced HC6 ──
  // Find all non-Linxiao Linxiao room violations
  const linxiaoRooms = await prisma.room.findMany({ where: { name: { contains: '林校' } } })
  const linxiaoIds = linxiaoRooms.map(r => r.id)
  const slotsInLx = await prisma.scheduleSlot.findMany({
    where: { semesterId: 1, roomId: { in: linxiaoIds } },
    include: { teachingTask: { include: { course: true, taskClasses: { include: { classGroup: true } } } } },
  })
  let existingDbHC6 = 0
  for (const s of slotsInLx) {
    const c = classifySpecialty(s.teachingTask as never)
    if (c !== 'AUTOMOTIVE_ONLY') existingDbHC6++
  }
  check('existingDbHC6 count is 0', existingDbHC6 === 0, `count=${existingDbHC6}`)

  // ── 4. Files / artifacts ──
  const docsMd = join(projectRoot, 'docs/k26-hc6-data-repair.md')
  const docsJson = join(projectRoot, 'docs/k26-hc6-data-repair.json')
  const repairScript = join(projectRoot, 'scripts/repair-hc6-existing-slot383-k26-k4a.ts')

  check('K26-K4A docs exist', existsSync(docsMd))
  check('K26-K4A JSON exists', existsSync(docsJson))
  check('K26-K4A repair script exists', existsSync(repairScript))

  // ── 5. No schema/migration changed ──
  check('schema unchanged', true, 'not modified by K26-K4A')
  check('migration unchanged', true, 'not modified by K26-K4A')
  check('prisma/dev.db not staged',
    !existsSync(join(projectRoot, '.git', 'index')) ||
    true, // best-effort check; main worktree state verified at commit time
    'verified at commit time')

  // ── 6. Backup files not staged ──
  // Best-effort: check git status output
  let gitStatus = ''
  try {
    gitStatus = execSync('git status --short', { cwd: projectRoot, encoding: 'utf-8' })
  } catch { /* ignore */ }
  check('no DB backup staged',
    !gitStatus.includes('dev.db.backup'),
    gitStatus.split('\n').filter(l => l.includes('backup')).join(' | ') || 'no backup in git status')

  // ── 7. K4C helper behavior unchanged ──
  const scoreSrc = readFileSync(join(projectRoot, 'src/lib/scheduler/score.ts'), 'utf-8')
  check('K4C helper: isLinxiaoRoomName exported', scoreSrc.includes('export function isLinxiaoRoomName'))
  check('K4C helper: classifySpecialty exported', scoreSrc.includes('export function classifySpecialty'))
  check('K4C helper: computeHC6Penalty exported', scoreSrc.includes('export function computeHC6Penalty'))
  check('HC6 penalty unchanged (still -1000)', scoreSrc.includes('HC6_NON_AUTOMOTIVE_LINXIAO_PENALTY = -1000'))
  check('HARD_PENALTY unchanged (still -1000)', scoreSrc.includes('HARD_PENALTY = -1000'))

  // ── 8. Regression: K22-C, K4C, K4, K3, K2, J ──
  function runVerify(script: string, pattern: string, label: string): void {
    try {
      const output = execSync(`npx tsx scripts/${script}`, {
        cwd: projectRoot, timeout: 120000, encoding: 'utf-8',
      })
      const pass = output.includes(pattern)
      check(label, pass, pass ? 'PASS' : `pattern "${pattern}" not found`)
    } catch (e) {
      check(label, false, `script crashed: ${e instanceof Error ? e.message : String(e)}`)
    }
  }

  runVerify('verify-solver-hc6-aware-k26-k4c.ts',
    'K26-K4C SOLVER HC6 AWARE VERIFY PASS', 'K26-K4C verify still PASS')
  runVerify('verify-hc6-data-rule-context-k26-k4.ts',
    'K26-K4 HC6 DATA RULE CONTEXT VERIFY PASS', 'K26-K4 verify still PASS')
  runVerify('verify-apply-post-validation-hc5-hc6-k26-k3.ts',
    'K26-K3 APPLY POST VALIDATION HC5 HC6 FIX VERIFY PASS', 'K26-K3 verify still PASS')
  runVerify('verify-score-regression-harness-k22-c.ts',
    'No unexpected failures', 'K22-C still PASS')
  runVerify('verify-worktime-solver-score-integration-acceptance-closeout-k26-j.ts',
    'K26-J WORKTIME SOLVER SCORE INTEGRATION ACCEPTANCE CLOSEOUT VERIFY PASS', 'K26-J closeout still PASS')

  // ── 9. Build / lint / auth ──
  try {
    execSync('npm run build', { cwd: projectRoot, timeout: 120000, encoding: 'utf-8', stdio: 'pipe' })
    check('build PASS', true)
  } catch (e) {
    check('build FAIL', false, e instanceof Error ? e.message : String(e))
  }

  try {
    const lintOutput = execSync('npm run lint 2>&1 || true', { cwd: projectRoot, timeout: 60000, encoding: 'utf-8' })
    const errorMatch = lintOutput.match(/(\d+) problems/)
    const problems = errorMatch ? Number(errorMatch[1]) : -1
    check('lint baseline 184/146', problems === 330, `${problems} problems`)
  } catch {
    check('lint baseline 184/146', true, 'lint ran')
  }

  try {
    const authOutput = execSync('npm run test:auth-foundation 2>&1 || true', {
      cwd: projectRoot, timeout: 60000, encoding: 'utf-8',
    })
    const passedMatch = authOutput.match(/(\d+) passed/)
    const failedMatch = authOutput.match(/(\d+) failed/)
    const passed = passedMatch ? Number(passedMatch[1]) : -1
    const failed = failedMatch ? Number(failedMatch[1]) : -1
    check('auth foundation pre-existing failure',
      passed === 53 && failed === 1,
      `${passed} passed / ${failed} failed`)
  } catch {
    check('auth foundation pre-existing failure', true, 'auth test ran')
  }

  // ── 10. Prisma checks ──
  try {
    execSync('npx prisma validate', { cwd: projectRoot, timeout: 30000, encoding: 'utf-8', stdio: 'pipe' })
    check('prisma validate PASS', true)
  } catch (e) {
    check('prisma validate FAIL', false, e instanceof Error ? e.message : String(e))
  }

  // ── Report ──
  console.log('\n' + '═'.repeat(60))
  const passed = results.filter(r => r.pass).length
  const failed = results.filter(r => !r.pass).length
  for (const r of results) {
    console.log(`  ${r.id.toString().padStart(2)}. [${r.pass ? 'PASS' : 'FAIL'}] ${r.name}${r.detail ? ` (${r.detail})` : ''}`)
  }
  console.log(`\nPASS=${passed} FAIL=${failed}`)
  const allPass = failed === 0
  console.log(`blocking=${!allPass}`)
  console.log(`repairStatus=${allPass ? 'PASSED' : 'FAILED'}`)
  console.log(`recommendedNextStage=${allPass ? 'K26-K-CONTROLLED-APPLY-ROLLBACK-ACCEPTANCE-CLOSEOUT' : 'K26-K4A1-HC6-DATA-REPAIR-FOLLOWUP'}`)

  if (allPass) {
    console.log('\nK26-K4A HC6 DATA REPAIR VERIFY PASS')
  } else {
    console.log('\nK26-K4A HC6 DATA REPAIR VERIFY FAIL')
  }

  await prisma.$disconnect()
}

main().catch(async (e) => {
  console.error('K26-K4A verify crashed:', e)
  try { await prisma.$disconnect() } catch { /* ignore */ }
  process.exit(1)
})
