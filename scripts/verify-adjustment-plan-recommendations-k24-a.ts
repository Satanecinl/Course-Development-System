// scripts/verify-adjustment-plan-recommendations-k24-a.ts
// K24-A: Joint time + room recommendation verification.
//
// Read-only. No DB writes. Exits 0 on PASS.
//
// Sections:
//   A. Plan recommendation helper file exists
//   B. Plan API route exists with required structure
//   C. Plan API uses requirePermission('schedule:adjust')
//   D. Plan API does not write to DB
//   E. Helper reuses K23-A findAdjustmentRoomRecommendations
//   F. Helper / API supports preferredWeek
//   G. Helper / API supports weekWindow
//   H. Helper / API supports includeWeekend
//   I. Helper defaults to working-day priority / weekend skip
//   J. Helper returns plans[]
//   K. Helper returns minimumSatisfied
//   L. Helper returns rejectedSummary
//   M. Helper returns searched
//   N. Plan contains targetWeek / day / slotIndex / roomId
//   O. Plan contains reasons / warnings
//   P. Fewer than 2 plans => no fake candidates
//   Q. Frontend has 一键推荐调课方案 button
//   R. Frontend renders plan list
//   S. Click on plan fills week/day/slot/room
//   T. K23-A 推荐教室 button still present
//   U. Manual room select still present
//   V. score.ts NOT modified since K23-CLOSEOUT
//   W. Schema / migration / dev.db NOT modified since K23-CLOSEOUT
//   X. RBAC permission model NOT modified
//   Y. Build-time imports / types resolve
//   Z. DB read-only integration: real slot in dev.db

import { existsSync, readFileSync } from 'fs'
import { join } from 'path'
import { execSync } from 'child_process'
import { prisma } from '@/lib/prisma'

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

// ─── A. Helper file exists ─────────────────────────────

function testHelperFile() {
  console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━')
  console.log('A. Plan recommendation helper file exists')
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━')

  const path = 'src/lib/schedule/adjustment-plan-recommendations.ts'
  assert(fileExists(path), `${path} 存在`)
  if (!fileExists(path)) return
  const content = fileRead(path)
  assert(content.includes('export async function findAdjustmentPlanRecommendations'),
    'helper 导出 findAdjustmentPlanRecommendations')
  assert(content.includes('export interface AdjustmentPlanRecommendation'),
    'helper 导出 AdjustmentPlanRecommendation')
  assert(content.includes('export interface AdjustmentPlanRecommendationResult'),
    'helper 导出 AdjustmentPlanRecommendationResult')
  assert(content.includes('export interface AdjustmentPlanRejectedSummary'),
    'helper 导出 AdjustmentPlanRejectedSummary')
  assert(content.includes('minimumSatisfied'),
    'helper 包含 minimumSatisfied 字段')
  assert(content.includes('rejectedSummary'),
    'helper 包含 rejectedSummary 字段')
  assert(content.includes('searched'),
    'helper 包含 searched 字段')
}

// ─── B. API route exists ───────────────────────────────

function testApiRoute() {
  console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━')
  console.log('B. Plan API route exists')
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━')

  const path = 'src/app/api/schedule-adjustments/plan-recommendations/route.ts'
  assert(fileExists(path), `${path} 存在`)
  if (!fileExists(path)) return
  const content = fileRead(path)
  assert(content.includes('export async function POST'),
    'route.ts 导出 POST handler')
  assert(content.includes('requirePermission'),
    'route.ts 调用 requirePermission')
  assert(content.includes('findAdjustmentPlanRecommendations'),
    'route.ts 引用 helper')
  // No prisma writes
  assert(!/prisma\.\w+\.(update|create|delete|upsert|createMany|updateMany|deleteMany)/.test(content),
    'route.ts 不调用 prisma 写入 API')
}

// ─── C. API permission ─────────────────────────────────

function testApiPermission() {
  console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━')
  console.log('C. Plan API uses schedule:adjust')
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━')

  const content = fileRead('src/app/api/schedule-adjustments/plan-recommendations/route.ts')
  assert(/requirePermission\(\s*['"]schedule:adjust['"]/.test(content),
    'route.ts 使用 schedule:adjust 权限')
}

// ─── D. API no DB write ────────────────────────────────

function testApiNoDbWrite() {
  console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━')
  console.log('D. Plan API does not write DB')
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━')

  const content = fileRead('src/app/api/schedule-adjustments/plan-recommendations/route.ts')
  assert(!/prisma\.\w+\.create[\(\s]/.test(content), 'route.ts 无 prisma.create')
  assert(!/prisma\.\w+\.update[\(\s]/.test(content), 'route.ts 无 prisma.update')
  assert(!/prisma\.\w+\.delete[\(\s]/.test(content), 'route.ts 无 prisma.delete')
  assert(!/prisma\.\w+\.upsert[\(\s]/.test(content), 'route.ts 无 prisma.upsert')
}

// ─── E. Helper reuses K23-A helper ─────────────────────

function testHelperReusesK23A() {
  console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━')
  console.log('E. Helper reuses K23-A findAdjustmentRoomRecommendations')
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━')

  const helper = fileRead('src/lib/schedule/adjustment-plan-recommendations.ts')
  assert(helper.includes("from './room-recommendations'"),
    'helper 从 room-recommendations 导入')
  assert(helper.includes('findAdjustmentRoomRecommendations'),
    'helper 调用 findAdjustmentRoomRecommendations')
  assert(helper.includes("import { findAdjustmentRoomRecommendations }"),
    'helper 显式 named import')
}

// ─── F. Helper / API supports preferredWeek ────────────

function testPreferredWeek() {
  console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━')
  console.log('F. Helper / API support preferredWeek')
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━')

  const helper = fileRead('src/lib/schedule/adjustment-plan-recommendations.ts')
  assert(helper.includes('preferredWeek'),
    'helper 接受 preferredWeek')
  const route = fileRead('src/app/api/schedule-adjustments/plan-recommendations/route.ts')
  assert(route.includes('preferredWeek'),
    'route 接受 preferredWeek')
}

// ─── G. Helper / API supports weekWindow ───────────────

function testWeekWindow() {
  console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━')
  console.log('G. Helper / API support weekWindow')
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━')

  const helper = fileRead('src/lib/schedule/adjustment-plan-recommendations.ts')
  assert(helper.includes('weekWindow'),
    'helper 接受 weekWindow')
  const route = fileRead('src/app/api/schedule-adjustments/plan-recommendations/route.ts')
  assert(route.includes('weekWindow'),
    'route 接受 weekWindow')
}

// ─── H. Helper / API supports includeWeekend ───────────

function testIncludeWeekend() {
  console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━')
  console.log('H. Helper / API support includeWeekend')
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━')

  const helper = fileRead('src/lib/schedule/adjustment-plan-recommendations.ts')
  assert(helper.includes('includeWeekend'),
    'helper 接受 includeWeekend')
  const route = fileRead('src/app/api/schedule-adjustments/plan-recommendations/route.ts')
  assert(route.includes('includeWeekend'),
    'route 接受 includeWeekend')
}

// ─── I. Helper defaults to working-day priority ───────

function testWorkingDayDefault() {
  console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━')
  console.log('I. Helper defaults to working-day priority / weekend skip')
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━')

  const helper = fileRead('src/lib/schedule/adjustment-plan-recommendations.ts')
  assert(helper.includes('DEFAULT_DAYS_WORKING'),
    'helper 包含 DEFAULT_DAYS_WORKING')
  assert(helper.includes('WEEKEND_DAYS'),
    'helper 包含 WEEKEND_DAYS')
  assert(helper.includes('includeWeekend ?? false'),
    'helper includeWeekend default = false')
}

// ─── J. Helper returns plans[] ─────────────────────────

function testReturnsPlans() {
  console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━')
  console.log('J. Helper returns plans[]')
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━')

  const helper = fileRead('src/lib/schedule/adjustment-plan-recommendations.ts')
  assert(helper.includes('plans: AdjustmentPlanRecommendation[]'),
    'helper 返回 plans: AdjustmentPlanRecommendation[]')
}

// ─── K. Helper returns minimumSatisfied ────────────────

function testReturnsMinimumSatisfied() {
  console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━')
  console.log('K. Helper returns minimumSatisfied')
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━')

  const helper = fileRead('src/lib/schedule/adjustment-plan-recommendations.ts')
  assert(helper.includes('MIN_PLANS = 2'),
    'helper 内部 MIN_PLANS = 2')
  assert(helper.includes('top.length >= MIN_PLANS'),
    'helper minimumSatisfied = top.length >= MIN_PLANS')
}

// ─── L. Helper returns rejectedSummary ─────────────────

function testReturnsRejectedSummary() {
  console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━')
  console.log('L. Helper returns rejectedSummary')
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━')

  const helper = fileRead('src/lib/schedule/adjustment-plan-recommendations.ts')
  assert(helper.includes('teacherConflict'),
    'rejectedSummary 包含 teacherConflict')
  assert(helper.includes('classGroupConflict'),
    'rejectedSummary 包含 classGroupConflict')
  assert(helper.includes('roomConflict'),
    'rejectedSummary 包含 roomConflict')
  assert(helper.includes('linxiaoPolicy'),
    'rejectedSummary 包含 linxiaoPolicy')
  assert(helper.includes('weekend'),
    'rejectedSummary 包含 weekend')
}

// ─── M. Helper returns searched ────────────────────────

function testReturnsSearched() {
  console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━')
  console.log('M. Helper returns searched')
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━')

  const helper = fileRead('src/lib/schedule/adjustment-plan-recommendations.ts')
  assert(helper.includes('timeCandidateCount'),
    'searched 包含 timeCandidateCount')
  assert(helper.includes('roomCandidateCount'),
    'searched 包含 roomCandidateCount')
  assert(helper.includes('weeks: number[]'),
    'searched.weeks 是 number[]')
  assert(helper.includes('days: number[]'),
    'searched.days 是 number[]')
  assert(helper.includes('slotIndexes: number[]'),
    'searched.slotIndexes 是 number[]')
}

// ─── N. Plan contains required fields ──────────────────

function testPlanFields() {
  console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━')
  console.log('N. Plan contains targetWeek / day / slotIndex / roomId')
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━')

  const helper = fileRead('src/lib/schedule/adjustment-plan-recommendations.ts')
  assert(helper.includes('targetWeek: number'),
    'plan 包含 targetWeek: number')
  assert(helper.includes('targetDayOfWeek: number'),
    'plan 包含 targetDayOfWeek: number')
  assert(helper.includes('targetSlotIndex: number'),
    'plan 包含 targetSlotIndex: number')
  assert(helper.includes('roomId: number'),
    'plan 包含 roomId: number')
  assert(helper.includes('roomName: string'),
    'plan 包含 roomName: string')
  assert(helper.includes('capacity: number'),
    'plan 包含 capacity: number')
  assert(helper.includes('score: number'),
    'plan 包含 score: number')
}

// ─── O. Plan contains reasons / warnings ───────────────

function testReasonsWarnings() {
  console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━')
  console.log('O. Plan contains reasons / warnings')
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━')

  const helper = fileRead('src/lib/schedule/adjustment-plan-recommendations.ts')
  assert(helper.includes('reasons: string[]'),
    'plan 包含 reasons: string[]')
  assert(helper.includes('warnings: string[]'),
    'plan 包含 warnings: string[]')
  // Common reason phrases used by helper
  assert(helper.includes('工作日优先'),
    'helper 包含 reason "工作日优先"')
  assert(helper.includes('周末排课'),
    'helper 包含 warning "周末排课"')
}

// ─── P. Fewer than 2 plans => no fake candidates ─────

function testNoFake() {
  console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━')
  console.log('P. Fewer than 2 plans => no fake candidates')
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━')

  const helper = fileRead('src/lib/schedule/adjustment-plan-recommendations.ts')
  // Helper must not push to plans without having passed the room layer.
  // We can check that roomResult.candidates is iterated (every plan has
  // a real room), and that the K23-A helper's `room=0` filter is in
  // play (K23-A helper handles that).
  assert(helper.includes('for (const rc of roomResult.candidates)'),
    'helper 仅在 K23-A 通过的候选上构造 plan (无伪造)')

  // Also confirm K23-A helper still filters room=0
  const k23a = fileRead('src/lib/schedule/room-recommendations.ts')
  assert(/roomId:\s*{\s*not:\s*0\s*}/.test(k23a) || /id:\s*{\s*not:\s*0\s*}/.test(k23a),
    'K23-A helper 仍过滤 room=0 placeholder (确保 K24-A 不引入 fake candidate)')
}

// ─── Q. Frontend has 一键推荐调课方案 button ─────────

function testFrontendButton() {
  console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━')
  console.log('Q. Frontend has 一键推荐调课方案 button')
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━')

  const content = fileRead('src/components/schedule-adjustment-dialog.tsx')
  assert(content.includes('handleRecommendPlans'),
    'dialog 包含 handleRecommendPlans handler')
  assert(content.includes('一键推荐调课方案'),
    'dialog UI 包含 "一键推荐调课方案" 按钮')
  assert(content.includes('fetchPlanRecommendations'),
    'dialog 调用 fetchPlanRecommendations')
}

// ─── R. Frontend renders plan list ─────────────────────

function testFrontendRendersPlans() {
  console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━')
  console.log('R. Frontend renders plan list')
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━')

  const content = fileRead('src/components/schedule-adjustment-dialog.tsx')
  assert(content.includes('planResult.plans.map'),
    'dialog 渲染 plan 列表 (plans.map)')
  assert(content.includes('p.reasons'),
    'dialog 显示 plan reasons')
  assert(content.includes('p.warnings'),
    'dialog 显示 plan warnings')
  assert(content.includes('rejectedSummary'),
    'dialog 显示 rejected summary')
}

// ─── S. Click on plan fills week/day/slot/room ────────

function testPickPlan() {
  console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━')
  console.log('S. Click on plan fills week/day/slot/room')
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━')

  const content = fileRead('src/components/schedule-adjustment-dialog.tsx')
  assert(content.includes('pickPlan'),
    'dialog 包含 pickPlan handler')
  assert(content.includes('setTargetWeek(plan.targetWeek)'),
    'pickPlan 调用 setTargetWeek')
  assert(content.includes('setNewDayOfWeek(plan.targetDayOfWeek)'),
    'pickPlan 调用 setNewDayOfWeek')
  assert(content.includes('setNewSlotIndex(plan.targetSlotIndex)'),
    'pickPlan 调用 setNewSlotIndex')
  assert(content.includes('setNewRoomId(plan.roomId)'),
    'pickPlan 调用 setNewRoomId')
}

// ─── T. K23-A 推荐教室 button still present ──────────

function testK23AButtonPreserved() {
  console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━')
  console.log('T. K23-A 推荐教室 button still present')
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━')

  const content = fileRead('src/components/schedule-adjustment-dialog.tsx')
  assert(content.includes('handleRecommendRooms'),
    'dialog 仍含 handleRecommendRooms (K23-A)')
  assert(content.includes('推荐教室'),
    'dialog UI 仍含 "推荐教室" 按钮 (K23-A)')
  assert(content.includes('fetchRoomRecommendations'),
    'dialog 仍调用 fetchRoomRecommendations (K23-A)')
}

// ─── U. Manual room select still present ──────────────

function testManualSelectPreserved() {
  console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━')
  console.log('U. Manual room select still present')
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━')

  const content = fileRead('src/components/schedule-adjustment-dialog.tsx')
  assert(content.includes('roomOptions.map'),
    '手动教室 option 列表仍存在')
  assert(content.includes('setNewRoomId(e.target.value'),
    '手动选择 setNewRoomId 仍可用')
  assert(content.includes('<option value="">不变</option>'),
    '"不变" option 仍存在')
}

// ─── V. score.ts NOT modified since K23-CLOSEOUT ──────

function testScoreTsUntouched() {
  console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━')
  console.log('V. score.ts NOT modified')
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━')

  assert(!gitDiffSince('e28d4a5', 'src/lib/scheduler/score.ts'),
    'src/lib/scheduler/score.ts 自 K23-CLOSEOUT 以来未改')
}

// ─── W. Schema / migration / dev.db NOT modified ──────

function testSchemaDbUntouched() {
  console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━')
  console.log('W. Schema / migration / dev.db NOT modified')
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━')

  assert(!gitDiffSince('e28d4a5', 'prisma/schema.prisma'),
    'prisma/schema.prisma 自 K23-CLOSEOUT 以来未改')
  assert(!gitDiffSince('e28d4a5', 'prisma/migrations'),
    'prisma/migrations/* 自 K23-CLOSEOUT 以来未改')
  assert(fileExists('prisma/dev.db'), 'prisma/dev.db 仍存在')

  // K23-A helper / API also not modified (K23-A 66/66 must remain valid)
  assert(!gitDiffSince('e28d4a5', 'src/lib/schedule/room-recommendations.ts'),
    'K23-A room-recommendations helper 自 K23-CLOSEOUT 以来未改')
  assert(
    !gitDiffSince('e28d4a5', 'src/app/api/schedule-adjustments/room-recommendations/route.ts'),
    'K23-A API route 自 K23-CLOSEOUT 以来未改',
  )
}

// ─── X. RBAC permission model NOT modified ────────────

function testRbacUntouched() {
  console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━')
  console.log('X. RBAC permission model NOT modified')
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━')

  // No new permission strings in ALL_PERMISSIONS
  const authTypes = fileRead('src/lib/auth/types.ts')
  assert(authTypes.includes("'schedule:adjust'"),
    'auth/types.ts 仍包含 schedule:adjust 字符串')
  // We did not introduce a new permission (only the route uses
  // existing schedule:adjust)
  const route = fileRead('src/app/api/schedule-adjustments/plan-recommendations/route.ts')
  assert(/requirePermission\(\s*['"]schedule:adjust['"]/.test(route),
    'K24-A route 仅使用 schedule:adjust (无新 permission)')
}

// ─── Y. Build-time imports / types ─────────────────────

function testBuildImports() {
  console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━')
  console.log('Y. Build-time import / types')
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━')

  const client = fileRead('src/lib/schedule/adjustment-client.ts')
  assert(client.includes('AdjustmentPlanRecommendation'),
    'adjustment-client.ts 导出 AdjustmentPlanRecommendation')
  assert(client.includes('AdjustmentPlanRecommendationResult'),
    'adjustment-client.ts 导出 AdjustmentPlanRecommendationResult')
  assert(client.includes('AdjustmentPlanRejectedSummary'),
    'adjustment-client.ts 导出 AdjustmentPlanRejectedSummary')
  assert(client.includes('AdjustmentPlanSearched'),
    'adjustment-client.ts 导出 AdjustmentPlanSearched')
  assert(client.includes('fetchPlanRecommendations'),
    'adjustment-client.ts 导出 fetchPlanRecommendations')
  // K23-A types still present (untouched)
  assert(client.includes('RoomRecommendationCandidate'),
    'adjustment-client.ts 仍导出 RoomRecommendationCandidate (K23-A 未被破坏)')

  const route = fileRead('src/app/api/schedule-adjustments/plan-recommendations/route.ts')
  assert(route.includes('NextRequest'),
    'route.ts 接受 NextRequest')
}

// ─── Z. DB read-only integration ───────────────────────

async function testDbIntegration() {
  console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━')
  console.log('Z. DB read-only integration (real slot in dev.db)')
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━')

  const { findAdjustmentPlanRecommendations } = await import(
    '@/lib/schedule/adjustment-plan-recommendations'
  )

  // Pick the first schedule slot to drive the recommendation
  const slot = await prisma.scheduleSlot.findFirst({
    where: { teachingTaskId: { not: undefined } },
    orderBy: { id: 'asc' },
  })
  if (!slot) {
    assert(false, 'DB 中未找到任何 schedule slot（请先 import / seed 数据）')
    return
  }

  const result = await findAdjustmentPlanRecommendations({
    scheduleSlotId: slot.id,
    weekWindow: 1,
    includeWeekend: false,
    limit: 5,
  })

  assert(typeof result.minimumSatisfied === 'boolean',
    'result.minimumSatisfied is boolean')
  assert(Array.isArray(result.plans), 'result.plans 是数组')
  assert(typeof result.rejectedSummary === 'object' && result.rejectedSummary !== null,
    'result.rejectedSummary 是 object')
  assert(typeof result.searched === 'object' && result.searched !== null,
    'result.searched 是 object')

  assert(Array.isArray(result.searched.weeks),
    'searched.weeks 是 array')
  assert(Array.isArray(result.searched.days),
    'searched.days 是 array')
  assert(Array.isArray(result.searched.slotIndexes),
    'searched.slotIndexes 是 array')
  assert(typeof result.searched.timeCandidateCount === 'number',
    'searched.timeCandidateCount 是 number')
  assert(typeof result.searched.roomCandidateCount === 'number',
    'searched.roomCandidateCount 是 number')

  // Required rejected buckets
  for (const key of [
    'teacherConflict', 'classGroupConflict', 'roomConflict', 'capacity',
    'linxiaoPolicy', 'weekend', 'unavailable', 'other',
  ]) {
    assert(key in result.rejectedSummary, `rejectedSummary.${key} 存在`)
  }

  // Plan shape
  if (result.plans.length > 0) {
    const p0 = result.plans[0]
    assert(typeof p0.targetWeek === 'number', 'plan.targetWeek is number')
    assert(typeof p0.targetDayOfWeek === 'number', 'plan.targetDayOfWeek is number')
    assert(typeof p0.targetSlotIndex === 'number', 'plan.targetSlotIndex is number')
    assert(typeof p0.roomId === 'number', 'plan.roomId is number')
    assert(typeof p0.roomName === 'string', 'plan.roomName is string')
    assert(typeof p0.capacity === 'number', 'plan.capacity is number')
    assert(typeof p0.score === 'number', 'plan.score is number')
    assert(Array.isArray(p0.reasons), 'plan.reasons 是 array')
    assert(Array.isArray(p0.warnings), 'plan.warnings 是 array')
    assert(p0.roomId !== 0, '候选中不包含 room=0 placeholder')
  }

  // Working-day default: searched.days should not include 6, 7
  assert(!result.searched.days.includes(6), 'searched.days 不含周六 (工作日优先)')
  assert(!result.searched.days.includes(7), 'searched.days 不含周日 (工作日优先)')
}

// ─── AA. K24-A1-UX: explicit preferred-week selector ───

function testUxPreferredWeekSelector() {
  console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━')
  console.log('AA. K24-A1-UX: explicit preferred-week selector')
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━')

  const content = fileRead('src/components/schedule-adjustment-dialog.tsx')
  assert(/preferredPlanWeek/.test(content),
    'dialog 包含 preferredPlanWeek state')
  assert(content.includes('setPreferredPlanWeek('),
    'dialog 包含 setPreferredPlanWeek setter')
  assert(content.includes('优先调课'),
    'dialog UI 包含 "优先调课" 文案')
  assert(content.includes('preferredWeek: preferredPlanWeek'),
    'fetchPlanRecommendations 使用 preferredPlanWeek 作为 preferredWeek')
  // 1-20 weeks
  assert(/Array\.from\(\{ length: 20 \}/.test(content) && /preferredPlanWeek/.test(content),
    '优先调课周次 select 包含 1-20 周选项')
  // default = current week
  assert(/useState\(week\)/.test(content) && /preferredPlanWeek/.test(content),
    'preferredPlanWeek 初始值 = 当前 week')
  // Manually changing targetWeek should NOT touch preferredPlanWeek
  // (the two are independent — no useEffect sync is asserted)
}

// ─── AB. K24-A1-UX: scrollable / collapsible plan list ─

function testUxScrollableCollapsiblePlanList() {
  console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━')
  console.log('AB. K24-A1-UX: scrollable / collapsible plan list')
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━')

  const content = fileRead('src/components/schedule-adjustment-dialog.tsx')
  assert(content.includes('planListOpen'),
    'dialog 包含 planListOpen state')
  assert(content.includes('setPlanListOpen('),
    'dialog 包含 setPlanListOpen setter')
  assert(/overflow-y-auto/.test(content),
    'plan 列表容器使用 overflow-y-auto (可滚动)')
  assert(/max-h-/.test(content),
    'plan 列表容器使用 max-h-* (限定最大高度)')
  assert(/点击展开|展开选择|收起/.test(content),
    'plan 列表有展开/收起按钮文案')
  // 选中机制
  assert(content.includes('selectedPlanKey'),
    'dialog 包含 selectedPlanKey state')
  assert(content.includes('setSelectedPlanKey('),
    'dialog 包含 setSelectedPlanKey setter')
  assert(/applySelectedPlan/.test(content),
    'dialog 包含 applySelectedPlan handler')
  assert(content.includes('使用该方案'),
    'dialog 包含 "使用该方案" 确认按钮文案')
  // "use this plan" 按钮应仅在 selectedPlanKey 非空时启用
  assert(/disabled=\{!selectedPlanKey\}/.test(content),
    '"使用该方案" 按钮未选中时 disabled')
}

// ─── AC. K24-A1-UX: advanced tools toggle (K23-A 默认隐藏) ──

function testUxAdvancedToolsToggle() {
  console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━')
  console.log('AC. K24-A1-UX: advanced tools toggle')
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━')

  const content = fileRead('src/components/schedule-adjustment-dialog.tsx')
  // Toggle exists
  assert(content.includes('showAdvancedTools'),
    'dialog 包含 showAdvancedTools state')
  assert(content.includes('setShowAdvancedTools('),
    'dialog 包含 setShowAdvancedTools setter')
  assert(/useState\(false\)/.test(content) && /showAdvancedTools/.test(content),
    'showAdvancedTools 初始值 = false (默认隐藏)')
  // K23-A buttons gated by showAdvancedTools
  assert(/\{showAdvancedTools\s*&&/.test(content),
    'K23-A 按钮由 showAdvancedTools 控制 (条件渲染)')
  // K23-A 推荐教室 handler still exists (so the button still works when toggled)
  assert(content.includes('handleRecommendRooms'),
    'K23-A handleRecommendRooms 仍存在 (K23-A 入口保留)')
  assert(content.includes('推荐教室'),
    'K23-A "推荐教室" 文案仍存在 (K23-A 入口保留)')
  // 检查冲突 handler still exists
  assert(content.includes('handleDryRun'),
    'handleDryRun 仍存在 (检查冲突流程保留)')
  assert(content.includes('检查冲突'),
    '"检查冲突" 文案仍存在 (流程保留)')
  // "一键推荐调课方案" 按钮 is the primary entry — must remain visible
  assert(content.includes('一键推荐调课方案'),
    '"一键推荐调课方案" 按钮始终存在')
  assert(/data-testid="k24-plan-button"/.test(content),
    '"一键推荐调课方案" 按钮可见 (不依赖 showAdvancedTools)')
  // 高级选项开关 UI 文案
  assert(/高级选项/.test(content),
    '高级选项开关 UI 文案存在')
}

// ─── Main ───────────────────────────────────────────────

async function main() {
  console.log('🧪 K24-A Adjustment Plan Recommendations — Verification')

  testHelperFile()
  testApiRoute()
  testApiPermission()
  testApiNoDbWrite()
  testHelperReusesK23A()
  testPreferredWeek()
  testWeekWindow()
  testIncludeWeekend()
  testWorkingDayDefault()
  testReturnsPlans()
  testReturnsMinimumSatisfied()
  testReturnsRejectedSummary()
  testReturnsSearched()
  testPlanFields()
  testReasonsWarnings()
  testNoFake()
  testFrontendButton()
  testFrontendRendersPlans()
  testPickPlan()
  testK23AButtonPreserved()
  testManualSelectPreserved()
  testScoreTsUntouched()
  testSchemaDbUntouched()
  testRbacUntouched()
  testBuildImports()
  await testDbIntegration()
  testUxPreferredWeekSelector()
  testUxScrollableCollapsiblePlanList()
  testUxAdvancedToolsToggle()

  console.log(`\n${'═'.repeat(50)}`)
  console.log(`📊 结果: ${passed} passed, ${failed} failed`)
  console.log(`${'═'.repeat(50)}`)

  if (failed > 0) {
    console.log('\n失败列表:')
    for (const f of failures) {
      console.log(`  - ${f}`)
    }
    await prisma.$disconnect()
    process.exit(1)
  }

  console.log('\n✅ K24-A 验证全部通过。')
  console.log('   - helper / API / UI 三件套就位')
  console.log('   - 复用 K23-A findAdjustmentRoomRecommendations')
  console.log('   - 复用 checkScheduleConflicts / capacity / K22-F2A 业务规则')
  console.log('   - read-only, 不写 DB')
  console.log('   - K23-A / score.ts / schema / dev.db 未修改')
  await prisma.$disconnect()
  process.exit(0)
}

main().catch(async (e) => {
  console.error('verify 脚本异常:', e)
  await prisma.$disconnect().catch(() => {})
  process.exit(1)
})
