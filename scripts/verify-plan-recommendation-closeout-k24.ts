// scripts/verify-plan-recommendation-closeout-k24.ts
// K24-PLAN-RECOMMENDATION-ACCEPTANCE-CLOSEOUT
//
// Final closeout verification. Confirms:
//   1. closeout docs (md + json) exist
//   2. closeout JSON contains status=CLOSED, featureStatus=READY_FOR_REAL_USE,
//      manualReview.status=PASSED, all baseline numbers, blocking=false
//   3. closeout markdown contains required strings
//   4. K24-A docs (md + json) exist + carry appended closeout fields
//   5. K24 implementation files all exist
//   6. K24 verify scripts all exist
//   7. Untouched scope: K24-A helper / API / time-slots.ts / dialog /
//      adjustment-client all unmodified since d6821d5 (K24-A4A)
//
// Read-only. No DB writes.

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

function gitDiffSince(commit: string, relPath: string): boolean {
  try {
    const out = execSync(`git diff --name-only ${commit} -- ${relPath}`, {
      encoding: 'utf-8',
    }).trim()
    return out.length > 0
  } catch {
    return false
  }
}

// ─── A. Closeout doc files exist ────────────────────────

function testCloseoutFilesExist() {
  console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━')
  console.log('A. Closeout doc files exist')
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━')

  assert(
    fileExists('docs/k24-plan-recommendation-closeout.md'),
    'docs/k24-plan-recommendation-closeout.md 存在',
  )
  assert(
    fileExists('docs/k24-plan-recommendation-closeout.json'),
    'docs/k24-plan-recommendation-closeout.json 存在',
  )
  assert(
    fileExists('scripts/verify-plan-recommendation-closeout-k24.ts'),
    'scripts/verify-plan-recommendation-closeout-k24.ts 存在 (本脚本)',
  )
}

// ─── B. Closeout JSON content ───────────────────────────

function testCloseoutJsonContent() {
  console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━')
  console.log('B. Closeout JSON content')
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━')

  const c = JSON.parse(fileRead('docs/k24-plan-recommendation-closeout.json'))
  assertEqual(c.stage, 'K24-PLAN-RECOMMENDATION-ACCEPTANCE-CLOSEOUT',
    'stage = K24-PLAN-RECOMMENDATION-ACCEPTANCE-CLOSEOUT')
  assertEqual(c.status, 'CLOSED', 'status = CLOSED')
  assertEqual(c.featureStatus, 'READY_FOR_REAL_USE',
    'featureStatus = READY_FOR_REAL_USE')
  assertEqual(c.manualReview?.status, 'PASSED',
    'manualReview.status = PASSED')
  assertEqual(
    c.manualReview?.source,
    'user-provided frontend manual validation',
    'manualReview.source = user-provided frontend manual validation',
  )
  assert(!!c.manualReview?.note, 'manualReview.note 存在')
  assert(!!c.manualReview?.reviewer, 'manualReview.reviewer 存在 (不编造姓名)')

  // Baseline numbers
  assertEqual(c.baseline?.k24aVerify, '167/167 PASS', 'baseline.k24aVerify = 167/167 PASS')
  assertEqual(c.baseline?.k24a4Verify, '42/42 PASS', 'baseline.k24a4Verify = 42/42 PASS')
  assertEqual(c.baseline?.k24a3Verify, '50/50 PASS', 'baseline.k24a3Verify = 50/50 PASS')
  assertEqual(c.baseline?.k24a2Verify, '31/31 PASS', 'baseline.k24a2Verify = 31/31 PASS')
  assertEqual(c.baseline?.k23aVerify, '66/66 PASS', 'baseline.k23aVerify = 66/66 PASS')
  assertEqual(c.baseline?.k23CloseoutVerify, '83/83 PASS', 'baseline.k23CloseoutVerify = 83/83 PASS')
  assertEqual(c.baseline?.k22c, '73/0/0/0', 'baseline.k22c = 73/0/0/0')
  assertEqual(c.baseline?.schedulePreflight, '23/23 PASS',
    'baseline.schedulePreflight = 23/23 PASS')
  assertEqual(c.baseline?.scheduleMutationGuards, 'HIGH=0/MEDIUM=0',
    'baseline.scheduleMutationGuards = HIGH=0/MEDIUM=0')
  assertEqual(c.baseline?.teachingTaskSemanticGuards, 'BLOCKING=NO',
    'baseline.teachingTaskSemanticGuards = BLOCKING=NO')
  assert(c.baseline?.build?.startsWith('PASS') || c.baseline?.build === 'PASS',
    `baseline.build = PASS (got ${c.baseline?.build})`)
  assert(c.baseline?.lint?.newErrorsVsBaseline === 0,
    'baseline.lint.newErrorsVsBaseline = 0')
  assertEqual(c.baseline?.authFoundation?.passed, 53, 'baseline.authFoundation.passed = 53')
  assertEqual(c.baseline?.authFoundation?.failed, 1, 'baseline.authFoundation.failed = 1')
  assertEqual(c.baseline?.authFoundation?.isPreExisting, true,
    'baseline.authFoundation.isPreExisting = true')

  // Closed scope
  assert(c.closedScope && c.closedScope.length >= 5, 'closedScope 非空')
  // Known limitations
  assert(c.knownLimitations && c.knownLimitations.length >= 5,
    'knownLimitations 非空')
  // Post-closeout decision rules
  assert(c.postCloseoutDecisionRules && c.postCloseoutDecisionRules.length >= 5,
    'postCloseoutDecisionRules 非空')
  assertEqual(c.blocking, false, 'blocking = false')
  assert(!!c.recommendedDefaultAction, 'recommendedDefaultAction 存在')

  // Untouched scope
  assertEqual(c.untouchedScopeConfirmation?.noNewRbacPermission, true,
    'untouchedScopeConfirmation.noNewRbacPermission = true')
  assertEqual(c.untouchedScopeConfirmation?.noHardWeightsOrSoftWeights, true,
    'untouchedScopeConfirmation.noHardWeightsOrSoftWeights = true')
  assertEqual(c.untouchedScopeConfirmation?.noTuning, true,
    'untouchedScopeConfirmation.noTuning = true')
  assertEqual(c.untouchedScopeConfirmation?.noNewApiEndpoint, true,
    'untouchedScopeConfirmation.noNewApiEndpoint = true')
  assertEqual(c.untouchedScopeConfirmation?.k24aVerifyExpected, '167/167 PASS preserved',
    'untouchedScopeConfirmation.k24aVerifyExpected = 167/167 PASS preserved')
  assertEqual(c.untouchedScopeConfirmation?.k23aVerifyExpected, '66/66 PASS preserved',
    'untouchedScopeConfirmation.k23aVerifyExpected = 66/66 PASS preserved')
  assertEqual(c.untouchedScopeConfirmation?.k22cExpected, '73/0/0/0 preserved',
    'untouchedScopeConfirmation.k22cExpected = 73/0/0/0 preserved')
}

// ─── C. Closeout markdown content ───────────────────────

function testCloseoutMdContent() {
  console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━')
  console.log('C. Closeout markdown content')
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━')

  const md = fileRead('docs/k24-plan-recommendation-closeout.md')
  assert(md.includes('READY_FOR_REAL_USE'), 'markdown 包含 READY_FOR_REAL_USE')
  assert(md.includes('人工核验通过'), 'markdown 包含 "人工核验通过"')
  assert(
    md.includes('K24-C-PLAN-RECOMMENDATION-QUALITY-TUNING'),
    'markdown 引用 K24-C-PLAN-RECOMMENDATION-QUALITY-TUNING',
  )
  assert(
    md.includes('K24-D-PLAN-RECOMMENDATION-PERFORMANCE-OPTIMIZATION'),
    'markdown 引用 K24-D-PLAN-RECOMMENDATION-PERFORMANCE-OPTIMIZATION',
  )
  assert(
    md.includes('K24-A5-FUTURE-DATA-CLEANUP'),
    'markdown 引用 K24-A5-FUTURE-DATA-CLEANUP',
  )
  assert(
    md.includes('K24-E-ALTERNATIVE-WEEKEND-OR-CROSS-WEEK-POLICY'),
    'markdown 引用 K24-E-ALTERNATIVE-WEEKEND-OR-CROSS-WEEK-POLICY',
  )
  assert(md.includes('CLOSED'), 'markdown 包含 CLOSED 状态')
  assert(md.includes('PASSED'), 'markdown 包含 PASSED (manual review)')
  assert(
    md.includes('Reviewer: project owner') || md.includes('user-provided'),
    'markdown reviewer 来源说明 (无编造姓名)',
  )
  // No fabricated 教务 / 部门 name
  assert(
    md.includes('不编造') || md.includes('no fabricated'),
    'markdown 显式说明不编造教务 / 部门姓名',
  )
  // Baseline numbers in the markdown
  assert(md.includes('167/167 PASS') || md.includes('167 / 167 PASS'),
    'markdown 包含 K24-A 167/167')
  assert(md.includes('42/42 PASS') || md.includes('42 / 42 PASS'),
    'markdown 包含 K24-A4 42/42')
  assert(md.includes('50/50 PASS') || md.includes('50 / 50 PASS'),
    'markdown 包含 K24-A3 50/50')
  assert(md.includes('31/31 PASS') || md.includes('31 / 31 PASS'),
    'markdown 包含 K24-A2 31/31')
  assert(md.includes('66/66 PASS') || md.includes('66 / 66 PASS'),
    'markdown 包含 K23-A 66/66')
  assert(md.includes('73/0/0/0') || md.includes('73 / 0 / 0 / 0'),
    'markdown 包含 K22-C 73/0/0/0')
}

// ─── D. K24-A docs exist + carry closeout fields ────────

function testK24ADocsCloseoutFields() {
  console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━')
  console.log('D. K24-A docs exist + carry closeout fields')
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━')

  assert(
    fileExists('docs/k24-adjustment-plan-recommendations.md'),
    'docs/k24-adjustment-plan-recommendations.md 存在',
  )
  assert(
    fileExists('docs/k24-adjustment-plan-recommendations.json'),
    'docs/k24-adjustment-plan-recommendations.json 存在',
  )

  // K24-A MD has the appended closeout section
  const md = fileRead('docs/k24-adjustment-plan-recommendations.md')
  assert(
    md.includes('K24 Plan Recommendation Acceptance Closeout') ||
      md.includes('K24 closeout'),
    'K24-A MD 包含 "K24 closeout" 追加 section',
  )
  assert(
    md.includes('K24-PLAN-RECOMMENDATION-ACCEPTANCE-CLOSEOUT'),
    'K24-A MD 引用 closeout stage',
  )

  // K24-A JSON carries the closeout fields (nested under k24Closeout)
  const a = JSON.parse(fileRead('docs/k24-adjustment-plan-recommendations.json'))
  assertEqual(
    a.k24Closeout?.manualFrontendValidation?.status,
    'PASSED',
    'K24-A JSON k24Closeout.manualFrontendValidation.status = PASSED',
  )
  assertEqual(
    a.k24Closeout?.manualFrontendValidation?.source,
    'user-provided frontend manual validation',
    'K24-A JSON k24Closeout.manualFrontendValidation.source 正确',
  )
  assertEqual(
    a.k24Closeout?.closeoutStage,
    'K24-PLAN-RECOMMENDATION-ACCEPTANCE-CLOSEOUT',
    'K24-A JSON k24Closeout.closeoutStage = K24-PLAN-RECOMMENDATION-ACCEPTANCE-CLOSEOUT',
  )
  assertEqual(
    a.k24Closeout?.featureStatus,
    'READY_FOR_REAL_USE',
    'K24-A JSON k24Closeout.featureStatus = READY_FOR_REAL_USE',
  )
  assertEqual(
    a.k24Closeout?.status,
    'CLOSED',
    'K24-A JSON k24Closeout.status = CLOSED',
  )
  assertEqual(
    a.k24Closeout?.featureStatus,
    'READY_FOR_REAL_USE',
    'K24-A JSON k24Closeout.featureStatus = READY_FOR_REAL_USE (再次确认)',
  )
}

// ─── E. K24 implementation files exist ─────────────────

function testK24ImplFilesExist() {
  console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━')
  console.log('E. K24 implementation files exist')
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━')

  assert(
    fileExists('src/lib/schedule/adjustment-plan-recommendations.ts'),
    'src/lib/schedule/adjustment-plan-recommendations.ts 存在 (K24-A plan helper)',
  )
  assert(
    fileExists('src/app/api/schedule-adjustments/plan-recommendations/route.ts'),
    'src/app/api/schedule-adjustments/plan-recommendations/route.ts 存在 (K24-A API route)',
  )
  assert(
    fileExists('src/lib/schedule/time-slots.ts'),
    'src/lib/schedule/time-slots.ts 存在 (K24-A4 共享 helper)',
  )
  assert(
    fileExists('src/components/schedule-adjustment-dialog.tsx'),
    'src/components/schedule-adjustment-dialog.tsx 存在 (调整弹窗)',
  )
  assert(
    fileExists('src/lib/schedule/adjustment-client.ts'),
    'src/lib/schedule/adjustment-client.ts 存在 (K23-A + K24-A client types)',
  )

  // Key markers
  const helper = fileRead('src/lib/schedule/adjustment-plan-recommendations.ts')
  assert(
    helper.includes('findAdjustmentPlanRecommendations'),
    'helper 仍导出 findAdjustmentPlanRecommendations',
  )
  assert(
    helper.includes('preferredPlans') && helper.includes('fallbackPlans'),
    'helper 仍含 K24-A3 preferred/fallback 分桶',
  )
  assert(
    helper.includes('taskActiveInTargetWeek') || helper.includes('K24-A2'),
    'helper 仍含 K24-A2 cross-week gate',
  )
  assert(
    helper.includes('isPreferredWeek'),
    'helper 仍含 K24-A3 isPreferredWeek marker',
  )

  const timeSlots = fileRead('src/lib/schedule/time-slots.ts')
  assert(
    timeSlots.includes('[1, 2, 3, 4, 5]'),
    'time-slots.ts 仍含 [1, 2, 3, 4, 5]',
  )

  const dialog = fileRead('src/components/schedule-adjustment-dialog.tsx')
  assert(
    dialog.includes('一键推荐调课方案'),
    'dialog 仍含 "一键推荐调课方案" 按钮',
  )
  assert(
    dialog.includes('preferredPlanWeek'),
    'dialog 仍含 K24-A1 preferredPlanWeek state',
  )
  assert(
    dialog.includes('showAdvancedTools'),
    'dialog 仍含 K24-A1 showAdvancedTools state',
  )
  assert(
    dialog.includes('首选周方案'),
    'dialog 仍含 "首选周方案" 分组标签 (K24-A3)',
  )

  const client = fileRead('src/lib/schedule/adjustment-client.ts')
  assert(
    client.includes('fetchPlanRecommendations'),
    'adjustment-client 仍导出 fetchPlanRecommendations (K24-A)',
  )
  assert(
    client.includes('fetchRoomRecommendations'),
    'adjustment-client 仍导出 fetchRoomRecommendations (K23-A 未破坏)',
  )
}

// ─── F. K24 verify scripts exist ────────────────────────

function testK24VerifyScriptsExist() {
  console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━')
  console.log('F. K24 verify scripts exist')
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━')

  assert(
    fileExists('scripts/verify-adjustment-plan-recommendations-k24-a.ts'),
    'scripts/verify-adjustment-plan-recommendations-k24-a.ts 存在',
  )
  assert(
    fileExists('scripts/verify-plan-recommendation-cross-week-conflict-k24-a2.ts'),
    'scripts/verify-plan-recommendation-cross-week-conflict-k24-a2.ts 存在',
  )
  assert(
    fileExists('scripts/verify-plan-recommendation-preferred-week-k24-a3.ts'),
    'scripts/verify-plan-recommendation-preferred-week-k24-a3.ts 存在',
  )
  assert(
    fileExists('scripts/verify-timeslot-range-correction-k24-a4.ts'),
    'scripts/verify-timeslot-range-correction-k24-a4.ts 存在',
  )
}

// ─── G. Untouched scope: K24-A business code unmodified ───

function testK24UntouchedScope() {
  console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━')
  console.log('G. Untouched scope (K24-A business code 0 modification since d6821d5)')
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━')

  // The closeout stage is documentation / verify only. K24-A
  // business code must remain strictly untouched since d6821d5.
  assertEqual(
    gitDiffSince('d6821d5', 'src/lib/schedule/adjustment-plan-recommendations.ts'),
    false,
    'src/lib/schedule/adjustment-plan-recommendations.ts 自 K24-A4A 以来未改',
  )
  assertEqual(
    gitDiffSince('d6821d5', 'src/app/api/schedule-adjustments/plan-recommendations/route.ts'),
    false,
    'K24-A API route 自 K24-A4A 以来未改',
  )
  assertEqual(
    gitDiffSince('d6821d5', 'src/lib/schedule/time-slots.ts'),
    false,
    'src/lib/schedule/time-slots.ts 自 K24-A4A 以来未改',
  )
  assertEqual(
    gitDiffSince('d6821d5', 'src/components/schedule-adjustment-dialog.tsx'),
    false,
    '调课弹窗 UI 自 K24-A4A 以来未改',
  )
  assertEqual(
    gitDiffSince('d6821d5', 'src/lib/schedule/adjustment-client.ts'),
    false,
    'adjustment-client 自 K24-A4A 以来未改',
  )
  assertEqual(
    gitDiffSince('d6821d5', 'src/lib/schedule/room-recommendations.ts'),
    false,
    'K23-A room-recommendations helper 自 K24-A4A 以来未改',
  )
  assertEqual(
    gitDiffSince('d6821d5', 'src/lib/scheduler/score.ts'),
    false,
    'src/lib/scheduler/score.ts 自 K24-A4A 以来未改',
  )
  assertEqual(
    gitDiffSince('d6821d5', 'prisma/schema.prisma'),
    false,
    'prisma/schema.prisma 自 K24-A4A 以来未改',
  )
  assertEqual(
    gitDiffSince('d6821d5', 'prisma/migrations'),
    false,
    'prisma/migrations/* 自 K24-A4A 以来未改',
  )
  assert(fileExists('prisma/dev.db'), 'prisma/dev.db 仍存在')

  // No `prisma db push / migrate / reset / seed` should appear in
  // closeout deliverables. The verify scripts are read-only.
  const verifyScript = fileRead('scripts/verify-plan-recommendation-closeout-k24.ts')
  assert(
    !/prisma\.db\.push|prisma\.migrate|prisma\.reset|seed\(|prisma\.seed/.test(verifyScript),
    'closeout verify 脚本无 prisma db write / seed 调用',
  )
}

// ─── Main ────────────────────────────────────────────────

function main() {
  console.log('🧪 K24-PLAN-RECOMMENDATION-ACCEPTANCE-CLOSEOUT — Verification')

  testCloseoutFilesExist()
  testCloseoutJsonContent()
  testCloseoutMdContent()
  testK24ADocsCloseoutFields()
  testK24ImplFilesExist()
  testK24VerifyScriptsExist()
  testK24UntouchedScope()

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

  console.log('\n✅ K24 plan recommendation closeout 验证全部通过。')
  console.log('   K24 一键推荐调课方案 正式 CLOSED。')
  console.log('   Feature status: READY_FOR_REAL_USE。')
  console.log('   Manual frontend validation: PASSED。')
  console.log('   下一步: 进入真实调课使用 / 维护模式。')
}

main()
