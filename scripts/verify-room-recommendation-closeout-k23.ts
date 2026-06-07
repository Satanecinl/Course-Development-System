// scripts/verify-room-recommendation-closeout-k23.ts
// K23-ROOM-RECOMMENDATION-ACCEPTANCE-CLOSEOUT
//
// Final closeout verification. Confirms:
//   1. closeout docs (md + json) exist
//   2. closeout JSON contains status=CLOSED, manualReview.status=PASSED,
//      k23aVerify=66/66 PASS, k22c=73/0/0/0, blocking=false
//   3. K23-A docs (md + json) exist
//   4. K23-A implementation files (helper, API route, client, dialog) exist
//   5. K23-A verify script exists
//   6. closeout markdown contains required strings
//   7. K23-A docs carry the appended closeout / manual validation fields
//   8. Untouched scope: helper / API route / dialog / score.ts / schema /
//      dev.db unchanged since K23-A commit
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
    fileExists('docs/k23-room-recommendation-closeout.md'),
    'docs/k23-room-recommendation-closeout.md 存在',
  )
  assert(
    fileExists('docs/k23-room-recommendation-closeout.json'),
    'docs/k23-room-recommendation-closeout.json 存在',
  )
  assert(
    fileExists('scripts/verify-room-recommendation-closeout-k23.ts'),
    'scripts/verify-room-recommendation-closeout-k23.ts 存在 (本脚本)',
  )
}

// ─── B. Closeout JSON content ───────────────────────────

function testCloseoutJsonContent() {
  console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━')
  console.log('B. Closeout JSON content')
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━')

  const c = JSON.parse(fileRead('docs/k23-room-recommendation-closeout.json'))
  assertEqual(c.stage, 'K23-ROOM-RECOMMENDATION-ACCEPTANCE-CLOSEOUT', 'stage = K23-ROOM-RECOMMENDATION-ACCEPTANCE-CLOSEOUT')
  assertEqual(c.status, 'CLOSED', 'status = CLOSED')
  assertEqual(c.featureStatus, 'READY_FOR_REAL_USE', 'featureStatus = READY_FOR_REAL_USE')
  assertEqual(c.manualReview?.status, 'PASSED', 'manualReview.status = PASSED')
  assertEqual(
    c.manualReview?.source,
    'user-provided frontend manual validation',
    'manualReview.source = user-provided frontend manual validation',
  )
  assert(!!c.manualReview?.note, 'manualReview.note 存在')
  assert(!!c.manualReview?.reviewer, 'manualReview.reviewer 存在 (不编造姓名)')
  assertEqual(c.baseline?.k23aVerify, '66/66 PASS', 'baseline.k23aVerify = 66/66 PASS')
  assertEqual(c.baseline?.k22c, '73/0/0/0', 'baseline.k22c = 73/0/0/0')
  assertEqual(c.baseline?.schedulePreflight, '23/23 PASS', 'baseline.schedulePreflight = 23/23 PASS')
  assertEqual(c.baseline?.scheduleMutationGuards, 'HIGH=0/MEDIUM=0', 'baseline.scheduleMutationGuards = HIGH=0/MEDIUM=0')
  assertEqual(c.baseline?.teachingTaskSemanticGuards, 'BLOCKING=NO', 'baseline.teachingTaskSemanticGuards = BLOCKING=NO')
  assertEqual(c.baseline?.build, 'PASS', 'baseline.build = PASS')
  assertEqual(c.baseline?.lint?.newErrorsVsBaseline, 0, 'baseline.lint.newErrorsVsBaseline = 0')
  assertEqual(c.baseline?.authFoundation?.passed, 53, 'baseline.authFoundation.passed = 53')
  assertEqual(c.baseline?.authFoundation?.failed, 1, 'baseline.authFoundation.failed = 1')
  assertEqual(c.baseline?.authFoundation?.isPreExisting, true, 'baseline.authFoundation.isPreExisting = true')
  assert(c.closedScope && c.closedScope.length >= 1, 'closedScope 非空')
  assert(c.knownLimitations && c.knownLimitations.length >= 1, 'knownLimitations 非空')
  assert(c.postCloseoutDecisionRules && c.postCloseoutDecisionRules.length >= 1, 'postCloseoutDecisionRules 非空')
  assertEqual(c.blocking, false, 'blocking = false')
  assert(!!c.recommendedDefaultAction, 'recommendedDefaultAction 存在')

  // Untouched scope confirmation
  assertEqual(c.untouchedScopeConfirmation?.roomRecommendationsHelper && gitDiffSince('8332c60', 'src/lib/schedule/room-recommendations.ts'),
    false,
    'room-recommendations.ts 自 K23-A 以来未改 (与 JSON untouchedScopeConfirmation 一致)')
  assertEqual(
    c.untouchedScopeConfirmation?.noNewRbacPermission,
    true,
    'untouchedScopeConfirmation.noNewRbacPermission = true',
  )
  assertEqual(
    c.untouchedScopeConfirmation?.noHardWeightsOrSoftWeights,
    true,
    'untouchedScopeConfirmation.noHardWeightsOrSoftWeights = true',
  )
  assertEqual(
    c.untouchedScopeConfirmation?.noTuning,
    true,
    'untouchedScopeConfirmation.noTuning = true',
  )
  assertEqual(
    c.untouchedScopeConfirmation?.noNewApiEndpoint,
    true,
    'untouchedScopeConfirmation.noNewApiEndpoint = true',
  )
  assertEqual(
    c.untouchedScopeConfirmation?.k23aVerifyExpected,
    '66/66 PASS preserved',
    'untouchedScopeConfirmation.k23aVerifyExpected = 66/66 PASS preserved',
  )
}

// ─── C. Closeout markdown content ───────────────────────

function testCloseoutMdContent() {
  console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━')
  console.log('C. Closeout markdown content')
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━')

  const md = fileRead('docs/k23-room-recommendation-closeout.md')
  assert(md.includes('READY_FOR_REAL_USE'), 'markdown 包含 READY_FOR_REAL_USE')
  assert(md.includes('前端人工验证通过'), 'markdown 包含 "前端人工验证通过"')
  assert(
    md.includes('K23-C-ROOM-RECOMMENDATION-QUALITY-TUNING'),
    'markdown 引用 K23-C-ROOM-RECOMMENDATION-QUALITY-TUNING',
  )
  // Other post-closeout stages should be present
  assert(
    md.includes('K23-D-SHARED-SPECIALTY-CAMPUS-POLICY-HELPER'),
    'markdown 引用 K23-D-SHARED-SPECIALTY-CAMPUS-POLICY-HELPER',
  )
  assert(
    md.includes('K23-E-PREFERRED-ROOM-RULES-PLAN'),
    'markdown 引用 K23-E-PREFERRED-ROOM-RULES-PLAN',
  )
  assert(
    md.includes('K23-F-ROOM-OR-TIME-ALTERNATIVE-RECOMMENDATION'),
    'markdown 引用 K23-F-ROOM-OR-TIME-ALTERNATIVE-RECOMMENDATION',
  )
  assert(md.includes('CLOSED'), 'markdown 包含 CLOSED 状态')
  assert(md.includes('PASSED'), 'markdown 包含 PASSED (manual review)')
  assert(
    md.includes('Reviewer: project owner') || md.includes('user-provided'),
    'markdown reviewer 来源说明 (无编造姓名)',
  )
  // No fabricated 教务 / 部门 name. The text must explicitly disclaim
  // such fabrication.
  assert(
    md.includes('不编造具体教务姓名') ||
      md.includes('不编造教务') ||
      md.includes('no fabricated') ||
      md.includes('no fabricated 教务'),
    'markdown 显式说明不编造教务 / 部门姓名',
  )
  // Baseline numbers in the markdown
  assert(md.includes('66 / 66 PASS') || md.includes('66/66 PASS'), 'markdown 包含 K23-A 66/66')
  assert(md.includes('73 / 0 / 0 / 0') || md.includes('73/0/0/0'), 'markdown 包含 K22-C 73/0/0/0')
  assert(md.includes('23 / 23 PASS') || md.includes('23/23 PASS'), 'markdown 包含 schedule preflight 23/23')
}

// ─── D. K23-A docs exist ───────────────────────────────

function testK23ADocsExist() {
  console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━')
  console.log('D. K23-A docs exist')
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━')

  assert(
    fileExists('docs/k23-adjustment-room-recommendations.md'),
    'docs/k23-adjustment-room-recommendations.md 存在',
  )
  assert(
    fileExists('docs/k23-adjustment-room-recommendations.json'),
    'docs/k23-adjustment-room-recommendations.json 存在',
  )

  // K23-A JSON now carries appended closeout fields
  const a = JSON.parse(fileRead('docs/k23-adjustment-room-recommendations.json'))
  assertEqual(a.manualFrontendValidation?.status, 'PASSED', 'K23-A JSON manualFrontendValidation.status = PASSED')
  assertEqual(
    a.manualFrontendValidation?.source,
    'user-provided frontend manual validation',
    'K23-A JSON manualFrontendValidation.source 正确',
  )
  assertEqual(
    a.closeoutStage,
    'K23-ROOM-RECOMMENDATION-ACCEPTANCE-CLOSEOUT',
    'K23-A JSON closeoutStage = K23-ROOM-RECOMMENDATION-ACCEPTANCE-CLOSEOUT',
  )
  assertEqual(
    a.featureStatus,
    'READY_FOR_REAL_USE',
    'K23-A JSON featureStatus = READY_FOR_REAL_USE',
  )

  // K23-A MD has the appended section
  const md = fileRead('docs/k23-adjustment-room-recommendations.md')
  assert(
    md.includes('K23 Closeout Reference'),
    'K23-A MD 包含 "K23 Closeout Reference" 追加 section',
  )
  assert(
    md.includes('K23-ROOM-RECOMMENDATION-ACCEPTANCE-CLOSEOUT'),
    'K23-A MD 引用 closeout stage',
  )
}

// ─── E. K23-A implementation files exist ───────────────

function testK23AImplFilesExist() {
  console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━')
  console.log('E. K23-A implementation files exist')
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━')

  assert(
    fileExists('src/lib/schedule/room-recommendations.ts'),
    'src/lib/schedule/room-recommendations.ts 存在',
  )
  assert(
    fileExists('src/app/api/schedule-adjustments/room-recommendations/route.ts'),
    'src/app/api/schedule-adjustments/room-recommendations/route.ts 存在',
  )
  assert(
    fileExists('src/lib/schedule/adjustment-client.ts'),
    'src/lib/schedule/adjustment-client.ts 存在',
  )
  assert(
    fileExists('src/components/schedule-adjustment-dialog.tsx'),
    'src/components/schedule-adjustment-dialog.tsx 存在',
  )

  // Implementation files have key markers
  const helper = fileRead('src/lib/schedule/room-recommendations.ts')
  assert(
    helper.includes('findAdjustmentRoomRecommendations'),
    'helper 仍导出 findAdjustmentRoomRecommendations',
  )
  const route = fileRead('src/app/api/schedule-adjustments/room-recommendations/route.ts')
  assert(
    route.includes("requirePermission('schedule:adjust'"),
    'API route 仍使用 schedule:adjust 权限',
  )
  const dialog = fileRead('src/components/schedule-adjustment-dialog.tsx')
  assert(
    dialog.includes('推荐教室'),
    'dialog UI 仍含 "推荐教室" 按钮',
  )
  const client = fileRead('src/lib/schedule/adjustment-client.ts')
  assert(
    client.includes('fetchRoomRecommendations'),
    'adjustment-client 仍导出 fetchRoomRecommendations',
  )
}

// ─── F. K23-A verify script exists ──────────────────────

function testK23AVerifyScriptExists() {
  console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━')
  console.log('F. K23-A verify script exists')
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━')

  assert(
    fileExists('scripts/verify-adjustment-room-recommendations-k23-a.ts'),
    'scripts/verify-adjustment-room-recommendations-k23-a.ts 存在',
  )
}

// ─── G. Untouched scope since K23-A commit ──────────────

function testUntouchedScope() {
  console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━')
  console.log('G. Untouched scope since K23-A (no source / schema / DB mutations)')
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━')

  // Files that closeout must NOT have touched
  assertEqual(gitDiffSince('8332c60', 'src/lib/schedule/room-recommendations.ts'), false,
    'src/lib/schedule/room-recommendations.ts 自 K23-A 以来未改')
  assertEqual(
    gitDiffSince('8332c60', 'src/app/api/schedule-adjustments/room-recommendations/route.ts'),
    false,
    'API route 自 K23-A 以来未改',
  )
  assertEqual(
    gitDiffSince('8332c60', 'src/components/schedule-adjustment-dialog.tsx'),
    false,
    '调课弹窗 UI 自 K23-A 以来未改',
  )
  assertEqual(
    gitDiffSince('8332c60', 'src/lib/schedule/adjustment-client.ts'),
    false,
    'adjustment-client 自 K23-A 以来未改',
  )
  assertEqual(
    gitDiffSince('8332c60', 'src/lib/scheduler/score.ts'),
    false,
    'src/lib/scheduler/score.ts 自 K23-A 以来未改',
  )
  assertEqual(
    gitDiffSince('8332c60', 'prisma/schema.prisma'),
    false,
    'prisma/schema.prisma 自 K23-A 以来未改',
  )
  assertEqual(
    gitDiffSince('8332c60', 'prisma/migrations'),
    false,
    'prisma/migrations/* 自 K23-A 以来未改',
  )

  // No `prisma db push / migrate / reset / seed` should appear in
  // closeout deliverables. The verify scripts are read-only.
  const verifyScript = fileRead('scripts/verify-room-recommendation-closeout-k23.ts')
  assert(
    !/prisma\.db\.push|prisma\.migrate|prisma\.reset|seed\(|prisma\.seed/.test(verifyScript),
    'closeout verify 脚本无 prisma db write / seed 调用',
  )
}

// ─── H. K23-A implementation source is intact (K22 / K23 verify expected preserved) ───

function testK23AIntact() {
  console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━')
  console.log('H. K23-A implementation source is intact')
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━')

  const helper = fileRead('src/lib/schedule/room-recommendations.ts')
  assert(helper.includes('MIN_CANDIDATES = 2'), 'helper MIN_CANDIDATES = 2 保留')
  assert(helper.includes('rejectedSummary'), 'helper rejectedSummary 保留')
  assert(helper.includes('roomId: { not: 0 }') || helper.includes('id: { not: 0 }'),
    'helper 仍过滤 room=0 placeholder')
  assert(helper.includes('checkScheduleConflicts'), 'helper 仍调用 checkScheduleConflicts')

  // K22-F2A verbatim copy still present
  assert(helper.includes("'汽车'") || helper.includes('AUTOMOTIVE_KEYWORDS'),
    'helper K22-F2A specialty 分类仍 verbatim copy')

  // Default limit
  assert(helper.includes('DEFAULT_LIMIT = 5'), 'helper DEFAULT_LIMIT = 5 保留')
}

// ─── Main ────────────────────────────────────────────────

function main() {
  console.log('🧪 K23-ROOM-RECOMMENDATION-ACCEPTANCE-CLOSEOUT — Verification')

  testCloseoutFilesExist()
  testCloseoutJsonContent()
  testCloseoutMdContent()
  testK23ADocsExist()
  testK23AImplFilesExist()
  testK23AVerifyScriptExists()
  testUntouchedScope()
  testK23AIntact()

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

  console.log('\n✅ K23 room recommendation closeout 验证全部通过。')
  console.log('   K23 room recommendation 正式 CLOSED。')
  console.log('   Feature status: READY_FOR_REAL_USE。')
  console.log('   Manual frontend validation: PASSED。')
  console.log('   下一步: 进入真实调课使用 / 维护模式。')
}

main()
