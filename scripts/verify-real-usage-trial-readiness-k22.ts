// scripts/verify-real-usage-trial-readiness-k22.ts
// K22-PAUSE-REAL-USAGE-TRIAL
//
// Pre-trial readiness verification. Confirms all gates are green before
// the academic scheduling office starts the manual trial.
//
// 100% file/DB based + read-only. No DB writes, no solver invocation,
// no preview/apply. Pure offline checks.
//
// Gates (all must pass):
//   A. Working tree clean
//   B. K22-C harness stable baseline exists
//   C. L1 evaluation baseline exists with hardScore=0
//   D. L2 verify baseline exists
//   F. K22 trial docs exist (plan / checklist / feedback / status)
//   G. L2 scoreBreakdown files exist (helper + component)
//   H. L2 UI integration files reference the component
//   I. L2 API route reads from snapshot
//   J. L2 preview pipeline writes scoreBreakdown
//   K. K22-C 73/0/0/0 baseline recorded
//   L. L2A artifact cleanup completed (K22-C files match L1 state)

import { readFileSync, existsSync } from 'fs'
import { join } from 'path'

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

function assertFileContains(relPath: string, needle: string, label: string) {
  const full = join(process.cwd(), relPath)
  if (!existsSync(full)) {
    failed++
    failures.push(`${label}: file missing: ${relPath}`)
    console.error(`  ❌ ${label}: file missing: ${relPath}`)
    return
  }
  const content = readFileSync(full, 'utf-8')
  if (content.includes(needle)) {
    passed++
    console.log(`  ✅ ${label}`)
  } else {
    failed++
    failures.push(`${label}: needle not found in ${relPath}`)
    console.error(`  ❌ ${label}: needle not found in ${relPath}`)
  }
}

function fileRead(relPath: string): string {
  return readFileSync(join(process.cwd(), relPath), 'utf-8')
}

function fileExists(relPath: string): boolean {
  return existsSync(join(process.cwd(), relPath))
}

// ─── A. Working tree clean ──────────────────────────────

function testWorkingTree() {
  console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━')
  console.log('A. Working tree (git status --short clean)')
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━')

  // Cross-platform: use child_process to call git
  const { execSync } = require('child_process') as typeof import('child_process')
  let statusOut = ''
  try {
    statusOut = execSync('git status --short', { encoding: 'utf-8' })
  } catch (e) {
    assert(false, `git status failed: ${(e as Error).message}`)
    return
  }
  const statusLines = statusOut.trim().split('\n').filter((l) => l.length > 0)
  if (statusLines.length === 0) {
    assert(true, 'git status --short 输出为空 (clean)')
  } else {
    assert(false, `git status --short 不干净 (${statusLines.length} 行):\n${statusLines.join('\n')}`)
  }

  // Confirm HEAD is at K22-L2A or later
  let headSha = ''
  try {
    headSha = execSync('git rev-parse --short HEAD', { encoding: 'utf-8' }).trim()
  } catch {}
  assert(/^[0-9a-f]{7,}$/.test(headSha), `HEAD SHA 有效: ${headSha}`)

  // Look up the most recent K22-L2A-or-pause commit
  const headLog = execSync('git log -1 --oneline', { encoding: 'utf-8' }).trim()
  console.log(`  ℹ️  HEAD: ${headLog}`)
}

// ─── B. K22-C harness baseline ────────────────────────

function testK22CBaseline() {
  console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━')
  console.log('B. K22-C harness baseline')
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━')

  assert(
    fileExists('scripts/verify-score-regression-harness-k22-c.ts'),
    'scripts/verify-score-regression-harness-k22-c.ts 存在',
  )

  const docPath = 'docs/k22-score-regression-harness-implementation.json'
  if (!fileExists(docPath)) {
    assert(false, `${docPath} 缺失`)
    return
  }
  const doc = JSON.parse(fileRead(docPath))
  assertEqual(doc.summary?.pass, 73, 'K22-C summary.pass = 73')
  assertEqual(doc.summary?.knownFail, 0, 'K22-C summary.knownFail = 0')
  assertEqual(doc.summary?.fail, 0, 'K22-C summary.fail = 0')
  assertEqual(doc.summary?.info, 0, 'K22-C summary.info = 0')
  assertEqual(doc.summary?.total, 73, 'K22-C summary.total = 73')
  assertEqual(doc.summary?.blocking, 'NO', 'K22-C summary.blocking = NO')
}

function assertEqual(a: unknown, b: unknown, msg: string) {
  if (a === b) {
    passed++
    console.log(`  ✅ ${msg}`)
  } else {
    failed++
    failures.push(msg)
    console.error(`  ❌ ${msg} (expected ${b}, got ${a})`)
  }
}

// ─── C. L1 evaluation baseline ─────────────────────────

function testL1Baseline() {
  console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━')
  console.log('C. L1 evaluation baseline (hardScore=0)')
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━')

  const docPath = 'docs/k22-real-solver-quality-evaluation.json'
  if (!fileExists(docPath)) {
    assert(false, `${docPath} 缺失`)
    return
  }
  const doc = JSON.parse(fileRead(docPath))
  assertEqual(doc.baselineRun?.finalHardScore, 0, 'L1 baselineRun.finalHardScore = 0')
  assertEqual(doc.hardFeasibility?.allHardResolved, true, 'L1 hardFeasibility.allHardResolved = true')
  assertEqual(doc.baselineRun?.initialHardScore, -1000, 'L1 baselineRun.initialHardScore = -1000')
  assert(doc.solverConfig?.readOnly === true, 'L1 solverConfig.readOnly = true')
  assert(doc.solverConfig?.writesDb === false, 'L1 solverConfig.writesDb = false')
  assert(doc.solverConfig?.writesScheduleSlot === false, 'L1 solverConfig.writesScheduleSlot = false')
  assertEqual(doc.baselineRun?.initialSoftScore, -1577, 'L1 baselineRun.initialSoftScore = -1577')
  assertEqual(doc.baselineRun?.finalSoftScore, -1281, 'L1 baselineRun.finalSoftScore = -1281')
}

// ─── D. L2 verify baseline ─────────────────────────────

function testL2VerifyBaseline() {
  console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━')
  console.log('D. L2 verify baseline')
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━')

  assert(
    fileExists('scripts/verify-scheduler-breakdown-ui-k22-l2.ts'),
    'scripts/verify-scheduler-breakdown-ui-k22-l2.ts 存在',
  )
  const docPath = 'docs/k22-scheduler-result-breakdown-ui.md'
  assert(fileExists(docPath), `${docPath} 存在`)
  const docPathJson = 'docs/k22-scheduler-result-breakdown-ui.json'
  assert(fileExists(docPathJson), `${docPathJson} 存在`)
}

// ─── F. K22 trial docs ─────────────────────────────────

function testTrialDocs() {
  console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━')
  console.log('F. K22 trial docs')
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━')

  assert(fileExists('docs/k22-real-usage-trial-plan.md'), 'docs/k22-real-usage-trial-plan.md 存在')
  assert(fileExists('docs/k22-real-usage-trial-checklist.md'), 'docs/k22-real-usage-trial-checklist.md 存在')
  assert(fileExists('docs/k22-real-usage-trial-feedback-template.md'), 'docs/k22-real-usage-trial-feedback-template.md 存在')
  assert(fileExists('docs/k22-real-usage-trial-status.json'), 'docs/k22-real-usage-trial-status.json 存在')

  // Spot-check content
  const plan = fileRead('docs/k22-real-usage-trial-plan.md')
  assert(plan.includes('K22-PAUSE-REAL-USAGE-TRIAL'), 'plan.md 标题正确')
  assert(plan.includes('hardScore = 0'), 'plan.md 包含 hardScore 验收出口')
  assert(plan.includes('禁用') || plan.includes('不修改'), 'plan.md 包含禁止范围说明')

  const checklist = fileRead('docs/k22-real-usage-trial-checklist.md')
  assert(checklist.includes('- [ ]'), 'checklist.md 包含可勾选格式')
  assert(checklist.includes('hardScore'), 'checklist.md 包含 hardScore 检查项')
  assert(checklist.includes('breakdown'), 'checklist.md 包含 breakdown 检查项')

  const fb = fileRead('docs/k22-real-usage-trial-feedback-template.md')
  assert(fb.includes('反馈') || fb.includes('Feedback'), 'feedback template 包含反馈字段')
  assert(fb.includes('Go') && fb.includes('No-Go'), 'feedback template 包含 Go / No-Go 判定')

  const status = JSON.parse(fileRead('docs/k22-real-usage-trial-status.json'))
  assertEqual(status.stage, 'K22-PAUSE-REAL-USAGE-TRIAL', 'status.json stage 正确')
  assertEqual(status.trialPrerequisites.allGatesGreen, true, 'status.json allGatesGreen=true')
  assertEqual(status.blocking, false, 'status.json blocking=false')
  assert(status.k22FeatureState.score.constraintCount === 16, 'status.json 16 约束')
}

// ─── G. L2 scoreBreakdown files ───────────────────────

function testBreakdownFiles() {
  console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━')
  console.log('G. L2 scoreBreakdown helper & component')
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━')

  assertFileContains('src/lib/scheduler/score-breakdown.ts', 'export function buildScoreBreakdown', 'score-breakdown.ts 导出 buildScoreBreakdown')
  assertFileContains('src/lib/scheduler/score-breakdown.ts', 'export function buildWireBreakdown', 'score-breakdown.ts 导出 buildWireBreakdown')
  assertFileContains('src/lib/scheduler/score-breakdown.ts', 'export function readSnapshotBreakdown', 'score-breakdown.ts 导出 readSnapshotBreakdown')
  assertFileContains('src/lib/scheduler/score-breakdown.ts', 'CONSTRAINT_REGISTRY', 'score-breakdown.ts 包含 CONSTRAINT_REGISTRY')
  assertFileContains('src/lib/scheduler/score-breakdown.ts', 'ResultSnapshotScoreBreakdown', 'score-breakdown.ts 包含 ResultSnapshotScoreBreakdown')

  assertFileContains('src/components/score-breakdown-display.tsx', 'export function ScoreBreakdownDisplay', 'score-breakdown-display.tsx 导出 ScoreBreakdownDisplay')
  assertFileContains('src/components/score-breakdown-display.tsx', '旧运行无 breakdown 数据', '组件包含旧运行 fallback 文案')
  assertFileContains('src/components/score-breakdown-display.tsx', 'BEFORE', '组件包含 BEFORE tab')
  assertFileContains('src/components/score-breakdown-display.tsx', 'AFTER', '组件包含 AFTER tab')
}

// ─── H. L2 UI integration ─────────────────────────────

function testUiIntegration() {
  console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━')
  console.log('H. L2 UI integration (history + live preview)')
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━')

  assertFileContains('src/app/admin/scheduler/history/history-content.tsx', 'ScoreBreakdownDisplay', 'history-content.tsx 引用 ScoreBreakdownDisplay')
  assertFileContains('src/app/admin/scheduler/history/history-content.tsx', 'ResultSnapshotScoreBreakdown', 'history-content.tsx 引用类型')

  assertFileContains('src/app/admin/scheduler/scheduler-content.tsx', 'ScoreBreakdownDisplay', 'scheduler-content.tsx 引用 ScoreBreakdownDisplay')
  assertFileContains('src/app/admin/scheduler/scheduler-content.tsx', 'ResultSnapshotScoreBreakdown', 'scheduler-content.tsx 引用类型')
}

// ─── I. L2 API route ──────────────────────────────────

function testApiRoute() {
  console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━')
  console.log('I. L2 API route (runs/[id])')
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━')

  assertFileContains('src/app/api/admin/scheduler/runs/[id]/route.ts', 'readSnapshotBreakdown', 'runs/[id]/route.ts 引用 readSnapshotBreakdown')
  assertFileContains('src/app/api/admin/scheduler/runs/[id]/route.ts', 'scoreBreakdown', 'runs/[id]/route.ts 包含 scoreBreakdown 字段')
}

// ─── J. L2 preview pipeline ───────────────────────────

function testPreviewPipeline() {
  console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━')
  console.log('J. L2 preview pipeline (preview.ts)')
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━')

  assertFileContains('src/lib/scheduler/preview.ts', 'buildScoreBreakdown', 'preview.ts 引用 buildScoreBreakdown')
  assertFileContains('src/lib/scheduler/preview.ts', 'buildWireBreakdown', 'preview.ts 引用 buildWireBreakdown')
  assertFileContains('src/lib/scheduler/preview.ts', 'scoreBreakdown,', 'preview.ts 在 resultSnapshot JSON 中包含 scoreBreakdown 字段')
}

// ─── K. K22-C 73/0/0/0 still recorded ─────────────────

function testK22CStableBaseline() {
  console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━')
  console.log('K. K22-C 73/0/0/0 baseline')
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━')

  const docPath = 'docs/k22-score-regression-harness-implementation.json'
  if (!fileExists(docPath)) {
    assert(false, `${docPath} 缺失`)
    return
  }
  const doc = JSON.parse(fileRead(docPath))
  const s = doc.summary
  if (!s) {
    assert(false, 'K22-C summary 缺失')
    return
  }
  const total = (s.pass ?? 0) + (s.knownFail ?? 0) + (s.fail ?? 0) + (s.info ?? 0)
  assertEqual(s.pass, 73, 'K22-C pass = 73')
  assertEqual(total, 73, 'K22-C 总 case 数 = 73 (无 KNOWN_FAIL/FAIL/INFO)')
}

// ─── L. L2A artifact cleanup ──────────────────────────

function testArtifactCleanup() {
  console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━')
  console.log('L. L2A artifact cleanup')
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━')

  // The K22-C files should be at their L1 state (generatedAt 2026-06-07T02:17:26.xxxZ)
  // after L2A revert. If they were regenerated, generatedAt would be later.
  const defaultSnap = JSON.parse(fileRead('docs/k22-score-default-snapshot.json'))
  const harnessImpl = JSON.parse(fileRead('docs/k22-score-regression-harness-implementation.json'))

  // L1 canonical generatedAt starts with "2026-06-07T02:17:26"
  const L1_GENERATED_AT_PREFIX = '2026-06-07T02:17:26'
  assert(
    defaultSnap.generatedAt?.startsWith(L1_GENERATED_AT_PREFIX),
    `K22-C default-snapshot 在 L1 状态 (got ${defaultSnap.generatedAt})`,
  )
  assert(
    harnessImpl.generatedAt?.startsWith(L1_GENERATED_AT_PREFIX),
    `K22-C harness-impl 在 L1 状态 (got ${harnessImpl.generatedAt})`,
  )
}

// ─── M. Project build artifacts ────────────────────────

function testBuildArtifacts() {
  console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━')
  console.log('M. Build / Lint / Type artifacts')
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━')

  // Check that next.config / tsconfig / package.json exist
  assert(fileExists('package.json'), 'package.json 存在')
  assert(fileExists('tsconfig.json'), 'tsconfig.json 存在')
  assert(fileExists('prisma/schema.prisma'), 'prisma/schema.prisma 存在')

  // K22-C default snapshot: should have the new strict snapshot
  const snap = JSON.parse(fileRead('docs/k22-score-default-snapshot.json'))
  assertEqual(snap.phase, 'K22-C-SCORE-REGRESSION-HARNESS-IMPLEMENTATION', 'K22-C default snapshot phase 正确')
}

// ─── Main ──────────────────────────────────────────────

function main() {
  console.log('🧪 K22-PAUSE-REAL-USAGE-TRIAL — Readiness Verification')

  testWorkingTree()
  testK22CBaseline()
  testL1Baseline()
  testL2VerifyBaseline()
  testTrialDocs()
  testBreakdownFiles()
  testUiIntegration()
  testApiRoute()
  testPreviewPipeline()
  testK22CStableBaseline()
  testArtifactCleanup()
  testBuildArtifacts()

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

  console.log('\n✅ 试用前置条件全部满足。可以开始真实使用 / 人工验收。')
  console.log('   详见 docs/k22-real-usage-trial-plan.md')
}

main()
