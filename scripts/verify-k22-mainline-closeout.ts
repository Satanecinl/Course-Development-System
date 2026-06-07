// scripts/verify-k22-mainline-closeout.ts
// K22-REAL-USAGE-ACCEPTANCE-CLOSEOUT
//
// Final closeout verification. Confirms:
//   1. All required closeout files exist
//   2. Trial status JSON records manualReview=PASSED + mainlineCloseout=CLOSED
//   3. Closeout JSON records K22-C 73/0/0/0, finalHardScore=0, etc.
//   4. Cross-references to K22-L1, K22-L2, K22-PAUSE all exist
//
// Read-only. No DB writes, no solver invocation, no API calls.

import { readFileSync, existsSync } from 'fs'
import { join } from 'path'
import { execSync } from 'child_process'

let passed = 0
let failed = 0
const failures: string[] = []

function assert(condition: boolean, message: string) {
  if (condition) {
    passed++
    console.log(`  ✅ ${message}`)
  } else {
    failed++
    failures.push(message)
    console.error(`  ❌ ${message}`)
  }
}

function assertEqual<T>(a: T, b: T, message: string) {
  if (a === b) {
    passed++
    console.log(`  ✅ ${message} (${a} === ${b})`)
  } else {
    failed++
    failures.push(`${message} (expected ${b}, got ${a})`)
    console.error(`  ❌ ${message} (expected ${b}, got ${a})`)
  }
}

function fileExists(relPath: string): boolean {
  return existsSync(join(process.cwd(), relPath))
}

function fileRead(relPath: string): string {
  return readFileSync(join(process.cwd(), relPath), 'utf-8')
}

// ─── A. Closeout doc files exist ────────────────────────

function testCloseoutFilesExist() {
  console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━')
  console.log('A. Closeout doc files exist')
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━')

  assert(fileExists('docs/k22-mainline-closeout.md'), 'docs/k22-mainline-closeout.md 存在')
  assert(fileExists('docs/k22-mainline-closeout.json'), 'docs/k22-mainline-closeout.json 存在')
  assert(fileExists('docs/k22-real-usage-trial-status.json'), 'docs/k22-real-usage-trial-status.json 存在')
  assert(fileExists('scripts/verify-k22-mainline-closeout.ts'), 'scripts/verify-k22-mainline-closeout.ts 存在 (本脚本)')
}

// ─── B. Trial status JSON fields ─────────────────────────

function testTrialStatusFields() {
  console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━')
  console.log('B. Trial status JSON: manualReview + mainlineCloseout')
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━')

  const status = JSON.parse(fileRead('docs/k22-real-usage-trial-status.json'))
  assertEqual(status.manualReview?.status, 'PASSED', 'trial status.manualReview.status = PASSED')
  assert(!!status.manualReview?.note, 'trial status.manualReview.note 存在')
  assertEqual(status.mainlineCloseout?.status, 'CLOSED', 'trial status.mainlineCloseout.status = CLOSED')
  assertEqual(status.mainlineCloseout?.stage, 'K22-REAL-USAGE-ACCEPTANCE-CLOSEOUT', 'trial status.mainlineCloseout.stage = K22-REAL-USAGE-ACCEPTANCE-CLOSEOUT')
  assert(!!status.mainlineCloseout?.closedAt, 'trial status.mainlineCloseout.closedAt 存在')
  assert(!!status.mainlineCloseout?.baselineCommit, 'trial status.mainlineCloseout.baselineCommit 存在')
}

// ─── C. Trial readiness docs exist ───────────────────────

function testTrialDocsExist() {
  console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━')
  console.log('C. Trial readiness docs exist')
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━')

  assert(fileExists('docs/k22-real-usage-trial-plan.md'), 'docs/k22-real-usage-trial-plan.md 存在')
  assert(fileExists('docs/k22-real-usage-trial-checklist.md'), 'docs/k22-real-usage-trial-checklist.md 存在')
  assert(fileExists('docs/k22-real-usage-trial-feedback-template.md'), 'docs/k22-real-usage-trial-feedback-template.md 存在')
}

// ─── D. L2 + L1 docs exist ───────────────────────────────

function testPriorStageDocs() {
  console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━')
  console.log('D. Prior stage docs exist (L1, L2)')
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━')

  assert(fileExists('docs/k22-scheduler-result-breakdown-ui.json'), 'docs/k22-scheduler-result-breakdown-ui.json 存在')
  assert(fileExists('docs/k22-scheduler-result-breakdown-ui.md'), 'docs/k22-scheduler-result-breakdown-ui.md 存在')
  assert(fileExists('docs/k22-real-solver-quality-evaluation.json'), 'docs/k22-real-solver-quality-evaluation.json 存在')
  assert(fileExists('docs/k22-real-solver-quality-evaluation.md'), 'docs/k22-real-solver-quality-evaluation.md 存在')

  // K22-C harness output
  assert(fileExists('docs/k22-score-regression-harness-implementation.json'), 'docs/k22-score-regression-harness-implementation.json 存在')
  assert(fileExists('docs/k22-score-default-snapshot.json'), 'docs/k22-score-default-snapshot.json 存在')
}

// ─── E. Closeout JSON content ────────────────────────────

function testCloseoutJsonContent() {
  console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━')
  console.log('E. Closeout JSON content')
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━')

  const c = JSON.parse(fileRead('docs/k22-mainline-closeout.json'))
  assertEqual(c.status, 'CLOSED', 'closeout.status = CLOSED')
  assertEqual(c.manualReview?.status, 'PASSED', 'closeout.manualReview.status = PASSED')
  assertEqual(c.manualReview?.source, 'user-provided manual acceptance', 'closeout.manualReview.source')
  assertEqual(c.baseline?.k22c, '73/0/0/0', 'closeout.baseline.k22c = 73/0/0/0')
  assertEqual(c.baseline?.k22cDetails?.pass, 73, 'closeout.baseline.k22cDetails.pass = 73')
  assertEqual(c.baseline?.realSolver?.finalHardScore, 0, 'closeout.baseline.realSolver.finalHardScore = 0')
  assertEqual(c.baseline?.realSolver?.initialHardScore, -1000, 'closeout.baseline.realSolver.initialHardScore = -1000')
  assertEqual(c.baseline?.realSolver?.initialSoftScore, -1577, 'closeout.baseline.realSolver.initialSoftScore = -1577')
  assertEqual(c.baseline?.realSolver?.finalSoftScore, -1281, 'closeout.baseline.realSolver.finalSoftScore = -1281')
  assertEqual(c.baseline?.realSolver?.readOnly, true, 'closeout.baseline.realSolver.readOnly = true')
  assertEqual(c.baseline?.ui?.scoreBreakdown, true, 'closeout.baseline.ui.scoreBreakdown = true')
  assertEqual(c.baseline?.ui?.businessCards, 8, 'closeout.baseline.ui.businessCards = 8')
  assert(c.closedScope?.scoreConstraints?.length >= 16, 'closeout.closedScope.scoreConstraints >= 16')
  assert(c.closedScope?.harness?.length >= 5, 'closeout.closedScope.harness >= 5')
  assert(c.closedScope?.realSolverEvaluation?.length >= 1, 'closeout.closedScope.realSolverEvaluation >= 1')
  assert(c.closedScope?.ui?.length >= 1, 'closeout.closedScope.ui >= 1')
  assert(c.closedScope?.trialReadiness?.length >= 1, 'closeout.closedScope.trialReadiness >= 1')
  assert(c.knownLimitations?.length >= 1, 'closeout.knownLimitations >= 1')
  assert(c.postCloseoutDecisionRules?.length >= 1, 'closeout.postCloseoutDecisionRules >= 1')
  assertEqual(c.blocking, false, 'closeout.blocking = false')
  assert(!!c.recommendedDefaultAction, 'closeout.recommendedDefaultAction 存在')
  assert(c.untouchedScopeConfirmation?.noNewConstraints === true, 'untouchedScopeConfirmation.noNewConstraints = true')
  assert(c.untouchedScopeConfirmation?.noTuning === true, 'untouchedScopeConfirmation.noTuning = true')
  assert(c.untouchedScopeConfirmation?.noHardWeightsOrSoftWeights === true, 'untouchedScopeConfirmation.noHardWeightsOrSoftWeights = true')
}

// ─── F. Closeout MD content spot checks ──────────────────

function testCloseoutMdContent() {
  console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━')
  console.log('F. Closeout markdown content')
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━')

  const md = fileRead('docs/k22-mainline-closeout.md')
  assert(md.includes('K22-REAL-USAGE-ACCEPTANCE-CLOSEOUT'), 'markdown 包含 stage 标题')
  assert(md.includes('CLOSED'), 'markdown 包含 CLOSED 状态')
  assert(md.includes('READY_FOR_REAL_OPERATIONAL_USE'), 'markdown 包含 scheduler status')
  assert(md.includes('PASSED'), 'markdown 包含 manual review PASSED')
  assert(md.includes('73'), 'markdown 包含 K22-C 73 case')
  assert(md.includes('hardScore'), 'markdown 包含 hardScore 讨论')
  assert(md.includes('-1281') || md.includes('softScore'), 'markdown 包含 softScore -1281')
  assert(md.includes('K22-L3') || md.includes('post-closeout'), 'markdown 包含 post-closeout decision rules')
  assert(md.includes('Reviewer: project owner') || md.includes('user-provided'), 'markdown reviewer 来源说明 (无编造姓名)')

  // Cross-references
  assert(md.includes('K22-L1'), 'markdown 引用 K22-L1')
  assert(md.includes('K22-L2'), 'markdown 引用 K22-L2')
  assert(md.includes('K22-PAUSE') || md.includes('K22-PAUSE-A'), 'markdown 引用 K22-PAUSE / K22-PAUSE-A')
  assert(md.includes('K22-C'), 'markdown 引用 K22-C')
}

// ─── G. Verify scripts exist ────────────────────────────

function testVerifyScriptsExist() {
  console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━')
  console.log('G. Verify scripts exist')
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━')

  assert(fileExists('scripts/verify-real-usage-trial-readiness-k22.ts'), 'verify-real-usage-trial-readiness-k22.ts 存在')
  assert(fileExists('scripts/verify-scheduler-breakdown-ui-k22-l2.ts'), 'verify-scheduler-breakdown-ui-k22-l2.ts 存在')
  assert(fileExists('scripts/verify-score-regression-harness-k22-c.ts'), 'verify-score-regression-harness-k22-c.ts 存在')
  assert(fileExists('scripts/evaluate-real-solver-quality-k22-l1.ts'), 'evaluate-real-solver-quality-k22-l1.ts 存在')
}

// ─── H. Untouched scope: no source code modified ────────

function testUntouchedScope() {
  console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━')
  console.log('H. Untouched scope (no source code modified)')
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━')

  // We only created/modified docs and scripts. No src/ files modified.
  let statusOut = ''
  try {
    statusOut = execSync('git status --short', { encoding: 'utf-8' })
  } catch (e) {
    assert(false, `git status failed: ${(e as Error).message}`)
    return
  }
  const statusLines = statusOut.trim().split('\n').filter((l) => l.length > 0)

  const modifiedFiles = statusLines
    .map((l) => l.replace(/^..\s+/, '').trim())
    .filter((f) => f.length > 0)

  const sourceFiles = modifiedFiles.filter((f) => f.startsWith('src/') || f.startsWith('prisma/'))
  assertEqual(sourceFiles.length, 0, 'src/ 和 prisma/ 文件未修改 (0 source files in working tree)')

  if (modifiedFiles.length > 0) {
    console.log(`  ℹ️  Working tree (${modifiedFiles.length} files):`)
    for (const f of modifiedFiles) {
      console.log(`    - ${f}`)
    }
  } else {
    console.log('  ℹ️  Working tree clean (everything already committed)')
  }
}

// ─── Main ────────────────────────────────────────────────

function main() {
  console.log('🧪 K22-REAL-USAGE-ACCEPTANCE-CLOSEOUT — Verification')

  testCloseoutFilesExist()
  testTrialStatusFields()
  testTrialDocsExist()
  testPriorStageDocs()
  testCloseoutJsonContent()
  testCloseoutMdContent()
  testVerifyScriptsExist()
  testUntouchedScope()

  console.log(`\n${'═'.repeat(50)}`)
  console.log(`📊 结果: ${passed} passed, ${failed} failed`)
  console.log(`${'═'.repeat(50)}`)

  if (failed > 0) {
    console.log('\n失败列表:')
    for (const f of failures) {
      console.log(`  - ${f}`)
    }
    process.exit(1)
  }

  console.log('\n✅ K22 mainline closeout 验证全部通过。')
  console.log('   K22 mainline 正式 CLOSED。')
  console.log('   Scheduler status: READY_FOR_REAL_OPERATIONAL_USE。')
  console.log('   下一步: 进入真实生产使用 / 维护模式。')
}

main()
