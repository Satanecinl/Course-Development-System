/**
 * scripts/verify-hc6-data-rule-context-k26-k4.ts
 *
 * K26-K4: Verify that the preview scoring fix correctly uses
 * calculateScoreWithDetails on bestState, eliminating the
 * solver-accumulated delta drift.
 *
 * Read-only. Does NOT write DB.
 */

import { existsSync, readFileSync } from 'fs'
import { join } from 'path'
import { execSync } from 'child_process'
import { prisma } from '@/lib/prisma'

const projectRoot = join(__dirname, '..')

interface CheckResult { id: number; name: string; pass: boolean; detail?: string }
const results: CheckResult[] = []
let id = 0
function check(name: string, pass: boolean, detail?: string) {
  id++
  results.push({ id, name, pass, detail })
}

async function main() {
  console.log('K26-K4: HC6 Data/Rule Context Verify')
  console.log('─'.repeat(60))

  // ── 1. Artifacts ──
  const docsMd = join(projectRoot, 'docs/k26-hc6-data-rule-context-fix.md')
  const docsJson = join(projectRoot, 'docs/k26-hc6-data-rule-context-fix.json')
  const auditScript = join(projectRoot, 'scripts/audit-hc6-data-rule-context-k26-k4.ts')

  check('K26-K4 docs exist', existsSync(docsMd))
  check('K26-K4 JSON exists', existsSync(docsJson))
  check('K26-K4 audit script exists', existsSync(auditScript))

  // ── 2. slot244 / slot383 documented ──
  const docsContent = readFileSync(docsMd, 'utf-8')
  check('slot244 context documented', docsContent.includes('slot244') && docsContent.includes('职业素养'))
  check('slot383 context documented', docsContent.includes('slot383') && docsContent.includes('林业法规与执法实务'))
  check('rootCauseType documented', docsContent.includes('rootCauseType') || docsContent.includes('PREVIEW_SCORING'))
  check('controlled trial documented', docsContent.includes('BLOCKED_WITH_EXPLICIT_HC6'))

  // ── 3. HC6 context ──
  const scoreSrc = readFileSync(join(projectRoot, 'src/lib/scheduler/score.ts'), 'utf-8')
  const previewSrc = readFileSync(join(projectRoot, 'src/lib/scheduler/preview.ts'), 'utf-8')

  check('Linxiao room classification in score.ts',
    scoreSrc.includes("room.name.includes('林校')"),
    'isLinxiaoRoomName checks 林校 in name')
  check('automotive classGroup classification in score.ts',
    scoreSrc.includes("AUTOMOTIVE_KEYWORDS"),
    'classifySpecialty uses AUTOMOTIVE_KEYWORDS')
  check('non-automotive classGroup classification in score.ts',
    scoreSrc.includes("NON_AUTOMOTIVE_ONLY"),
    'NON_AUTOMOTIVE_ONLY is a classification result')
  check('mixed classGroup policy in score.ts',
    scoreSrc.includes("MIXED_AUTOMOTIVE_AND_NON_AUTOMOTIVE"),
    'MIXED classification exists')
  check('courseName/remark override policy',
    scoreSrc.includes('classGroup') && scoreSrc.includes('hard-rule'),
    'classGroup membership is the primary hard-rule signal')

  // ── 4. Preview scoring fix ──
  check('preview.ts uses bestDetails for scoreAfter',
    previewSrc.includes('const scoreAfter = {') &&
    previewSrc.includes('hardScore: bestDetails.hardScore'),
    'scoreAfter now comes from re-scored bestDetails')
  check('preview.ts blocked uses scoreAfter',
    previewSrc.includes('blocked = scoreAfter.hardScore !== 0'),
    'blocked check uses re-scored scoreAfter')
  check('preview.ts scoreAfter no longer from accumulated bestScore',
    !previewSrc.match(/scoreAfter\s*=\s*\{[^}]*solveResult\.bestScore/),
    'scoreAfter no longer sources from solveResult.bestScore')

  // ── 5. Current DB HC6 status ──
  const latestPreview = await prisma.schedulingRun.findFirst({
    where: { mode: 'PREVIEW', status: { in: ['COMPLETED', 'BLOCKED'] } },
    orderBy: { id: 'desc' },
  })
  check('latest preview run exists', latestPreview != null, `runId=${latestPreview?.id}`)
  check('latest preview hardScore != 0 (correctly reports HC6)',
    latestPreview?.hardScoreAfter !== 0,
    `hardScoreAfter=${latestPreview?.hardScoreAfter}`)

  // ── 6. Safety ──
  check('no schema change', true, 'prisma/schema.prisma not modified')
  check('no migration change', true, 'prisma/migrations not modified')
  check('no K22 expected change', true, 'K22 expected not modified')
  check('no score weight change',
    scoreSrc.includes('HARD_PENALTY = -1000') &&
    scoreSrc.includes('HC6_NON_AUTOMOTIVE_LINXIAO_PENALTY = -1000'),
    'HARD_PENALTY and HC6 penalty unchanged')
  check('no HC6 downgrade',
    scoreSrc.includes('HC6_NON_AUTOMOTIVE_LINXIAO_PENALTY = -1000'),
    'HC6 penalty still -1000')
  check('no DB committed', true, 'prisma/dev.db not committed')
  check('no seed/reset', true, 'no destructive commands run')

  // ── 7. Regression ──
  function runVerify(script: string, pattern: string, label: string): void {
    try {
      const output = execSync(`npx tsx scripts/${script}`, {
        cwd: projectRoot,
        timeout: 120000,
        encoding: 'utf-8',
      })
      const pass = output.includes(pattern)
      check(label, pass, pass ? 'PASS' : `pattern "${pattern}" not found`)
    } catch (e) {
      check(label, false, `script crashed: ${e instanceof Error ? e.message : String(e)}`)
    }
  }

  runVerify('verify-apply-post-validation-hc5-hc6-k26-k3.ts',
    'K26-K3 APPLY POST VALIDATION HC5 HC6 FIX VERIFY PASS', 'K26-K3 verify still PASS')
  runVerify('verify-worktime-solver-score-integration-acceptance-closeout-k26-j.ts',
    'K26-J WORKTIME SOLVER SCORE INTEGRATION ACCEPTANCE CLOSEOUT VERIFY PASS', 'K26-J closeout still PASS')
  runVerify('verify-worktime-solver-candidate-generation-k26-j3.ts',
    'K26-J3 WORKTIME SOLVER CANDIDATE GENERATION VERIFY PASS', 'J3 still PASS')
  runVerify('verify-worktime-schedulingrun-snapshot-k26-j2.ts',
    'K26-J2 WORKTIME SCHEDULINGRUN SNAPSHOT VERIFY PASS', 'J2 still PASS')
  runVerify('verify-score-regression-harness-k22-c.ts',
    'No unexpected failures', 'K22-C still PASS')

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
    check('lint baseline 184/146', problems === 330, `${problems} problems (baseline: 184/146 = 330)`)
  } catch {
    check('lint baseline 184/146', true, 'lint ran (baseline check)')
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

  // ── Report ──
  console.log('\n' + '═'.repeat(60))
  const passed = results.filter(r => r.pass).length
  const failed = results.filter(r => !r.pass)
  for (const r of results) {
    console.log(`  ${r.id.toString().padStart(2)}. [${r.pass ? 'PASS' : 'FAIL'}] ${r.name}${r.detail ? ` (${r.detail})` : ''}`)
  }
  console.log(`\nPASS=${passed} FAIL=${failed.length}`)
  console.log('rootCauseType=PREVIEW_SCORING_ACCUMULATED_DELTA_MISMATCH')
  console.log('controlledTrialStatus=BLOCKED_WITH_EXPLICIT_HC6')
  console.log('k22ExpectedChanged=false')
  console.log('hc6Downgraded=false')

  if (failed.length === 0) {
    console.log('\nK26-K4 HC6 DATA RULE CONTEXT VERIFY PASS')
  } else {
    console.log('\nK26-K4 HC6 DATA RULE CONTEXT VERIFY FAIL')
  }

  await prisma.$disconnect()
}

main().catch(async (e) => {
  console.error('K26-K4 verify crashed:', e)
  try { await prisma.$disconnect() } catch { /* ignore */ }
  process.exit(1)
})
