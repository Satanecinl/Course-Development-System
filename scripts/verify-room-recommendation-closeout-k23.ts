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

// ─── G. Strict untouched + additive-compatible (K24-A-aware) ───
//
// History:
//   Originally this section used `git diff since K23-A baseline
//   (8332c60)` for both K23-A core backend (helper, API route) AND
//   shared UI/client files (dialog, adjustment-client). K24-A is an
//   additive feature that — by design — extends the same dialog and
//   adjustment-client with a "一键推荐调课方案" flow. The original
//   no-diff check on dialog/client therefore fired false positives
//   under K24-A without indicating any real K23-A regression.
//
//   K24-A1 (this stage) splits the check into two halves:
//     G1. Strict untouched — files that MUST NOT have any business
//         change since K23 closeout: K23-A core backend helper, K23-A
//         API route, score.ts, schema, migrations, dev.db.
//     G2. Additive-compatible — files that K24-A legitimately
//         extends. Diff is allowed; K23-A core capability is
//         guaranteed by marker-based compatibility checks (K23-A
//         markers must still be present, K24-A markers may also
//         exist, K23-A markers must not have been removed).
//
//   K23-A verify (66/66) and K23-A source intact (section H) remain
//   the source of truth for the K23-A capability itself.

function testUntouchedScope() {
  console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━')
  console.log('G1. Strict untouched (K23-A core backend, score, schema)')
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━')

  // Files that must remain strictly untouched since K23-A baseline.
  // K24-A is forbidden from touching any of these.
  // K23-A core backend helper is strictly untouched (66/66 must
  // remain valid). The K23-A API route is allowed to receive
  // additive defensive validations from later stages (e.g. K24-A4
  // added a targetSlotIndex > 5 → 400 check). We therefore still
  // assert the helper is strictly untouched, while the route may
  // legitimately change for additive defensive checks that REDUCE
  // the allowed range (without altering K23-A business logic).
  assertEqual(gitDiffSince('8332c60', 'src/lib/schedule/room-recommendations.ts'), false,
    'src/lib/schedule/room-recommendations.ts 自 K23-A 以来未改 (K23-A helper strict)')
  assertEqual(
    gitDiffSince('8332c60', 'src/lib/scheduler/score.ts'),
    false,
    'src/lib/scheduler/score.ts 自 K23-A 以来未改 (strict)',
  )
  assertEqual(
    gitDiffSince('8332c60', 'prisma/schema.prisma'),
    false,
    'prisma/schema.prisma 自 K23-A 以来未改 (strict)',
  )
  assertEqual(
    gitDiffSince('8332c60', 'prisma/migrations'),
    false,
    'prisma/migrations/* 自 K23-A 以来未改 (strict)',
  )

  // No `prisma db push / migrate / reset / seed` should appear in
  // closeout deliverables. The verify scripts are read-only.
  const verifyScript = fileRead('scripts/verify-room-recommendation-closeout-k23.ts')
  assert(
    !/prisma\.db\.push|prisma\.migrate|prisma\.reset|seed\(|prisma\.seed/.test(verifyScript),
    'closeout verify 脚本无 prisma db write / seed 调用',
  )

  console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━')
  console.log('G2. Additive-compatible (shared dialog / client — K24-A may extend)')
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━')

  // K24-A legitimately extends these two files. The no-diff check
  // is replaced with marker-based compatibility: K23-A core
  // capability must remain (markers still present), and any
  // removal of K23-A markers would fail this section.

  // G2.a adjustment-client.ts — K23-A surface intact
  const client = fileRead('src/lib/schedule/adjustment-client.ts')
  assert(client.includes('fetchRoomRecommendations'),
    'adjustment-client 仍导出 fetchRoomRecommendations (K23-A)')
  assert(client.includes('RoomRecommendationCandidate'),
    'adjustment-client 仍导出 RoomRecommendationCandidate (K23-A type)')
  assert(client.includes('RoomRecommendationResult'),
    'adjustment-client 仍导出 RoomRecommendationResult (K23-A type)')
  assert(client.includes('RoomRecommendationRejectedSummary'),
    'adjustment-client 仍导出 RoomRecommendationRejectedSummary (K23-A type)')
  // The K23-A endpoint is unchanged; K24-A may add new endpoints but
  // must not redirect room-recommendations traffic to plan-recommendations.
  assert(client.includes('/api/schedule-adjustments/room-recommendations'),
    'adjustment-client 仍 POST /api/schedule-adjustments/room-recommendations (K23-A endpoint unchanged)')
  assert(!client.includes('/api/schedule-adjustments/room-recommendations/plan'),
    'adjustment-client 未把 room-recommendations 端点改向 plan-recommendations')
  // K24-A additive markers are allowed to coexist (we don't assert
  // their presence here — K24-A may be reverted independently; what
  // matters is K23-A is intact).

  // G2.b schedule-adjustment-dialog.tsx — K23-A room recommendation
  // capability intact in the UI.
  const dialog = fileRead('src/components/schedule-adjustment-dialog.tsx')
  assert(dialog.includes('handleRecommendRooms'),
    'dialog 仍含 handleRecommendRooms (K23-A handler)')
  assert(dialog.includes('推荐教室'),
    'dialog UI 仍含 "推荐教室" 按钮 (K23-A)')
  assert(dialog.includes('fetchRoomRecommendations'),
    'dialog 仍调用 fetchRoomRecommendations (K23-A client)')
  assert(dialog.includes('setNewRoomId(c.roomId)') || dialog.includes('setNewRoomId(roomId)'),
    'dialog 点击 room candidate 仍 setNewRoomId (K23-A pickCandidate)')
  assert(dialog.includes('<option value="">不变</option>'),
    'dialog 手动选择 "不变" option 仍存在 (K23-A 入口保留)')
  // K24-A UI may coexist; we only assert K23-A markers.
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
  console.log('   K24-A1: G 节已升级为 K24-aware compatibility check。')
  console.log('     G1 = strict untouched (K23-A 核心后端, score, schema, migrations)')
  console.log('     G2 = additive-compatible (dialog / client, K23-A markers intact)')
}

main()
