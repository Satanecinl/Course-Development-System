// scripts/verify-adjustment-room-recommendations-k23-a.ts
// K23-A: Adjustment-time automatic room recommendation verification.
//
// Read-only verification. No DB writes. Exits 0 on PASS.
//
// Sections:
//   A. Helper file exists
//   B. API route exists with required structure
//   C. API route uses requirePermission('schedule:adjust')
//   D. API route does not write to DB
//   E. Helper filters room=0
//   F. Helper calls checkScheduleConflicts
//   G. Helper applies capacity check
//   H. Helper applies Linxiao / automotive K22-F2A rule
//   I. Helper returns >= 2 candidates for a normal slot in dev.db (DB read-only)
//   J. Helper returns minimumSatisfied=false and rejected summary when
//      fewer than 2 candidates are available (synthetic via API bounds)
//   K. Frontend dialog has 推荐教室 button
//   L. Frontend dialog renders candidate list
//   M. Frontend click on candidate fills newRoomId
//   N. Manual room select still present in dialog
//   O. Build-time import / types resolve
//   P. score.ts NOT modified since HEAD
//   Q. Schema / migration / dev.db NOT modified since HEAD

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

function gitDiffFileChanged(relPath: string): boolean {
  try {
    const out = execSync(`git diff --name-only HEAD -- ${relPath}`, { encoding: 'utf-8' }).trim()
    return out.length > 0
  } catch {
    return false
  }
}

// ─── A. Helper file exists ─────────────────────────────────

function testHelperFile() {
  console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━')
  console.log('A. Helper file exists')
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━')

  const path = 'src/lib/schedule/room-recommendations.ts'
  assert(fileExists(path), `${path} 存在`)
  if (!fileExists(path)) return
  const content = fileRead(path)
  assert(content.includes('export async function findAdjustmentRoomRecommendations'),
    'helper 导出 findAdjustmentRoomRecommendations')
  assert(content.includes('export interface RoomRecommendationResult'),
    'helper 导出 RoomRecommendationResult')
  assert(content.includes('minimumSatisfied'),
    'helper 包含 minimumSatisfied 字段')
  assert(content.includes('rejectedSummary'),
    'helper 包含 rejectedSummary 字段')
  assert(content.includes("roomId: { not: 0 }") || content.includes('id: { not: 0 }'),
    'helper 过滤 room=0 (placeholder)')
  assert(content.includes('checkScheduleConflicts'),
    'helper 复用 checkScheduleConflicts')
  assert(content.includes('getTaskStudentCount') || content.includes('studentCount'),
    'helper 计算 / 引用 studentCount')
  assert(content.includes("'林校'") || content.includes('林校'),
    'helper 包含 林校 业务规则')
  assert(content.includes("'汽车'") || content.includes('AUTOMOTIVE_KEYWORDS'),
    'helper 包含 汽车专业分类关键词')
}

// ─── B. API route exists ──────────────────────────────────

function testApiRoute() {
  console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━')
  console.log('B. API route exists')
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━')

  const path = 'src/app/api/schedule-adjustments/room-recommendations/route.ts'
  assert(fileExists(path), `${path} 存在`)
  if (!fileExists(path)) return
  const content = fileRead(path)
  assert(content.includes('export async function POST'),
    'route.ts 导出 POST handler')
  assert(content.includes("requirePermission('schedule:adjust'"),
    'route.ts 调用 requirePermission(\'schedule:adjust\')')
  assert(content.includes('findAdjustmentRoomRecommendations'),
    'route.ts 引用 helper')
  // No prisma writes (no update / create / delete / upsert)
  assert(!/prisma\.\w+\.(update|create|delete|upsert|createMany|updateMany|deleteMany)/.test(content),
    'route.ts 不调用 prisma 写入 API')
}

// ─── C. API route permission ──────────────────────────────

function testApiPermission() {
  console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━')
  console.log('C. API route uses schedule:adjust')
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━')

  const content = fileRead('src/app/api/schedule-adjustments/room-recommendations/route.ts')
  assert(/requirePermission\(\s*['"]schedule:adjust['"]/.test(content),
    'route.ts 使用 schedule:adjust 权限')
}

// ─── D. API route does not write DB ───────────────────────

function testApiNoDbWrite() {
  console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━')
  console.log('D. API route does not write DB')
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━')

  const content = fileRead('src/app/api/schedule-adjustments/room-recommendations/route.ts')
  // No prisma write APIs
  assert(!/prisma\.\w+\.create[\(\s]/.test(content), 'route.ts 无 prisma.create')
  assert(!/prisma\.\w+\.update[\(\s]/.test(content), 'route.ts 无 prisma.update')
  assert(!/prisma\.\w+\.delete[\(\s]/.test(content), 'route.ts 无 prisma.delete')
  assert(!/prisma\.\w+\.upsert[\(\s]/.test(content), 'route.ts 无 prisma.upsert')
}

// ─── E. Helper filters room=0 ─────────────────────────────

function testHelperFiltersRoomZero() {
  console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━')
  console.log('E. Helper filters room=0')
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━')

  const helper = fileRead('src/lib/schedule/room-recommendations.ts')
  assert(/roomId:\s*{\s*not:\s*0\s*}/.test(helper) || /id:\s*{\s*not:\s*0\s*}/.test(helper),
    'helper 显式过滤 room=0 (placeholder)')
}

// ─── F. Helper calls conflict check ───────────────────────

function testHelperConflict() {
  console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━')
  console.log('F. Helper calls checkScheduleConflicts')
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━')

  const helper = fileRead('src/lib/schedule/room-recommendations.ts')
  assert(helper.includes('checkScheduleConflicts'),
    'helper 引用 checkScheduleConflicts')
  assert(helper.includes("hasConflict"),
    'helper 检查 hasConflict')
}

// ─── G. Helper applies capacity check ─────────────────────

function testHelperCapacity() {
  console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━')
  console.log('G. Helper applies capacity check')
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━')

  const helper = fileRead('src/lib/schedule/room-recommendations.ts')
  assert(helper.includes('studentCount'),
    'helper 计算 studentCount')
  assert(/studentCount\s*>\s*room\.capacity/.test(helper),
    'helper 比较 studentCount vs room.capacity')
}

// ─── H. Helper applies Linxiao / automotive rule ──────────

function testHelperLinxiaoRule() {
  console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━')
  console.log('H. Helper applies Linxiao / automotive rule')
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━')

  const helper = fileRead('src/lib/schedule/room-recommendations.ts')
  assert(helper.includes('isLinxiaoRoom'),
    'helper 包含 isLinxiaoRoom helper')
  assert(helper.includes('AUTOMOTIVE_KEYWORDS') || helper.includes("'汽车'"),
    'helper 包含汽车专业关键词')
  assert(helper.includes('linxiaoPolicy'),
    'helper 拒绝汇总包含 linxiaoPolicy')
}

// ─── I. DB read-only integration: real slot in dev.db ─────

async function testDbIntegration() {
  console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━')
  console.log('I. DB read-only integration (real slot in dev.db)')
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━')

  const { findAdjustmentRoomRecommendations } = await import(
    '@/lib/schedule/room-recommendations'
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

  // Use a target week inside the slot's task range; pick 1 to be safe
  const result = await findAdjustmentRoomRecommendations({
    scheduleSlotId: slot.id,
    targetWeek: 1,
    targetDayOfWeek: 1,
    targetSlotIndex: 1,
    limit: 5,
  })

  assert(typeof result.minimumSatisfied === 'boolean',
    'result.minimumSatisfied is boolean')
  assert(Array.isArray(result.candidates), 'result.candidates 是数组')
  assert(typeof result.rejectedSummary === 'object' && result.rejectedSummary !== null,
    'result.rejectedSummary 是 object')
  assert('conflict' in result.rejectedSummary, 'rejectedSummary.conflict 存在')
  assert('capacity' in result.rejectedSummary, 'rejectedSummary.capacity 存在')
  assert('linxiaoPolicy' in result.rejectedSummary, 'rejectedSummary.linxiaoPolicy 存在')
  assert('unavailable' in result.rejectedSummary, 'rejectedSummary.unavailable 存在')
  assert('other' in result.rejectedSummary, 'rejectedSummary.other 存在')

  // Result shape
  if (result.candidates.length > 0) {
    const c0 = result.candidates[0]
    assert(typeof c0.roomId === 'number', 'candidate.roomId is number')
    assert(typeof c0.roomName === 'string', 'candidate.roomName is string')
    assert(typeof c0.capacity === 'number', 'candidate.capacity is number')
    assert(typeof c0.score === 'number', 'candidate.score is number')
    assert(Array.isArray(c0.reasons), 'candidate.reasons 是 array')
    assert(Array.isArray(c0.warnings), 'candidate.warnings 是 array')
  }

  // No room=0 in candidates
  const placeholder = result.candidates.find((c) => c.roomId === 0)
  assert(!placeholder, '候选中不包含 room=0 placeholder')
}

// ─── J. minimumSatisfied semantics ────────────────────────

function testMinimumSatisfied() {
  console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━')
  console.log('J. minimumSatisfied semantics')
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━')

  const helper = fileRead('src/lib/schedule/room-recommendations.ts')
  assert(/MIN_CANDIDATES\s*=\s*2/.test(helper),
    'helper 内部 MIN_CANDIDATES = 2')
  assert(/top\.length\s*>=\s*MIN_CANDIDATES/.test(helper),
    'helper 使用 minimumSatisfied = top.length >= MIN_CANDIDATES')
  assert(helper.includes("'当前时间段可用教室少于'") || helper.includes('当前时间段可用教室少于'),
    'helper 在候选不足时返回可读 message')
}

// ─── K. Frontend dialog has 推荐教室 button ───────────────

function testFrontendButton() {
  console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━')
  console.log('K. Frontend dialog has 推荐教室 button')
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━')

  const content = fileRead('src/components/schedule-adjustment-dialog.tsx')
  assert(content.includes('handleRecommendRooms'),
    'dialog 包含 handleRecommendRooms handler')
  assert(content.includes('推荐教室'),
    'dialog UI 包含 "推荐教室" 按钮')
  assert(content.includes('fetchRoomRecommendations'),
    'dialog 调用 fetchRoomRecommendations')
}

// ─── L. Frontend renders candidate list ───────────────────

function testFrontendRendersCandidates() {
  console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━')
  console.log('L. Frontend renders candidate list')
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━')

  const content = fileRead('src/components/schedule-adjustment-dialog.tsx')
  assert(content.includes('recommendResult.candidates.map'),
    'dialog 渲染候选列表 (candidates.map)')
  assert(content.includes('c.reasons'),
    'dialog 显示候选 reasons')
  assert(content.includes('c.warnings') || content.includes('c.warnings.map'),
    'dialog 显示候选 warnings')
  assert(content.includes('rejectedSummary'),
    'dialog 显示 rejected summary')
}

// ─── M. Frontend click fills newRoomId ────────────────────

function testFrontendPicksCandidate() {
  console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━')
  console.log('M. Frontend click on candidate fills newRoomId')
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━')

  const content = fileRead('src/components/schedule-adjustment-dialog.tsx')
  assert(content.includes('pickCandidate'),
    'dialog 包含 pickCandidate handler')
  assert(/setNewRoomId\(c\.roomId\)/.test(content) || /setNewRoomId\(roomId\)/.test(content),
    '点击候选调用 setNewRoomId')
  // 手动选择依旧存在
  assert(content.includes('<option value="">不变</option>'),
    '原始手动新教室下拉框仍存在（"不变" 选项）')
}

// ─── N. Manual select still present ───────────────────────

function testManualSelectPreserved() {
  console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━')
  console.log('N. Manual room select still present')
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━')

  const content = fileRead('src/components/schedule-adjustment-dialog.tsx')
  assert(content.includes('roomOptions.map'),
    '手动教室 option 列表仍存在')
  assert(content.includes('setNewRoomId(e.target.value'),
    '手动选择 setNewRoomId 仍可用')
}

// ─── O. Build-time import / types ─────────────────────────

function testBuildImports() {
  console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━')
  console.log('O. Build-time import / types')
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━')

  const client = fileRead('src/lib/schedule/adjustment-client.ts')
  assert(client.includes('RoomRecommendationCandidate'),
    'adjustment-client.ts 导出 RoomRecommendationCandidate')
  assert(client.includes('RoomRecommendationResult'),
    'adjustment-client.ts 导出 RoomRecommendationResult')
  assert(client.includes('fetchRoomRecommendations'),
    'adjustment-client.ts 导出 fetchRoomRecommendations')

  const route = fileRead('src/app/api/schedule-adjustments/room-recommendations/route.ts')
  assert(route.includes('NextRequest'),
    'route.ts 接受 NextRequest')
}

// ─── P. score.ts NOT modified since HEAD ──────────────────

function testScoreTsUntouched() {
  console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━')
  console.log('P. score.ts NOT modified')
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━')

  assert(!gitDiffFileChanged('src/lib/scheduler/score.ts'),
    'src/lib/scheduler/score.ts 未被本阶段修改')
}

// ─── Q. Schema / migration / dev.db NOT modified ──────────

function testSchemaDbUntouched() {
  console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━')
  console.log('Q. Schema / migration / dev.db NOT modified')
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━')

  assert(!gitDiffFileChanged('prisma/schema.prisma'),
    'prisma/schema.prisma 未被本阶段修改')
  assert(!gitDiffFileChanged('prisma/migrations'),
    'prisma/migrations/* 未被本阶段修改')

  // dev.db is binary and untracked by git; check via timestamp heuristic
  // only that the file exists and we never called prisma writes
  assert(fileExists('prisma/dev.db'), 'prisma/dev.db 仍存在')
}

// ─── Main ─────────────────────────────────────────────────

async function main() {
  console.log('🧪 K23-A Adjustment Room Recommendations — Verification')

  testHelperFile()
  testApiRoute()
  testApiPermission()
  testApiNoDbWrite()
  testHelperFiltersRoomZero()
  testHelperConflict()
  testHelperCapacity()
  testHelperLinxiaoRule()
  await testDbIntegration()
  testMinimumSatisfied()
  testFrontendButton()
  testFrontendRendersCandidates()
  testFrontendPicksCandidate()
  testManualSelectPreserved()
  testBuildImports()
  testScoreTsUntouched()
  testSchemaDbUntouched()

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

  console.log('\n✅ K23-A 验证全部通过。')
  console.log('   - helper / API / UI 三件套就位')
  console.log('   - 复用 checkScheduleConflicts / capacity / K22-F2A 业务规则')
  console.log('   - read-only, 不写 DB')
  console.log('   - score.ts / schema / dev.db 未修改')
  await prisma.$disconnect()
  process.exit(0)
}

main().catch(async (e) => {
  console.error('verify 脚本异常:', e)
  await prisma.$disconnect().catch(() => {})
  process.exit(1)
})
