// scripts/verify-timeslot-range-correction-k24-a4.ts
// K24-A4: Time-slot range correction verification.
//
// Bug:
//   The academic schedule only has 1-2..9-10节 (slotIndex 1..5), but
//   the K24-A one-click plan helper enumerated slotIndex 1..6, which
//   would recommend 11-12节 plans. The K23-A room API also accepted
//   targetSlotIndex up to 6. The dialog rendered 11-12节 in the
//   manual slot select.
//
// Fix:
//   New shared helper src/lib/schedule/time-slots.ts defines
//   VALID_TEACHING_SLOT_INDEXES = [1, 2, 3, 4, 5] and the
//   K24-A / K23-A surfaces all derive from it.
//
// Read-only. No DB writes. Exits 0 on PASS.

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

// ─── A. Shared time-slot helper exists ────────────────────

function testSharedHelperExists() {
  console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━')
  console.log('A. Shared time-slot helper exists')
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━')

  assert(
    fileExists('src/lib/schedule/time-slots.ts'),
    'src/lib/schedule/time-slots.ts 存在',
  )
  const content = fileRead('src/lib/schedule/time-slots.ts')
  assert(
    content.includes('VALID_TEACHING_SLOT_INDEXES'),
    'helper 导出 VALID_TEACHING_SLOT_INDEXES',
  )
  assert(
    content.includes('[1, 2, 3, 4, 5]'),
    'VALID_TEACHING_SLOT_INDEXES = [1, 2, 3, 4, 5]',
  )
  assert(
    content.includes('isValidTeachingSlotIndex'),
    'helper 导出 isValidTeachingSlotIndex',
  )
  assert(
    content.includes('formatTeachingSlotLabel'),
    'helper 导出 formatTeachingSlotLabel',
  )
}

// ─── B. K24-A plan helper uses [1..5] only ────────────────

function testK24AUsesCorrectRange() {
  console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━')
  console.log('B. K24-A plan helper uses [1..5] only')
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━')

  const helper = fileRead('src/lib/schedule/adjustment-plan-recommendations.ts')
  // The old hard-coded [1, 2, 3, 4, 5, 6] must be gone.
  assert(
    !/DEFAULT_SLOT_INDEXES\s*=\s*\[\s*1\s*,\s*2\s*,\s*3\s*,\s*4\s*,\s*5\s*,\s*6\s*\]/.test(helper),
    'helper 不再硬编码 [1, 2, 3, 4, 5, 6]',
  )
  assert(
    helper.includes('getValidTeachingSlotIndexes'),
    'helper 引用 getValidTeachingSlotIndexes',
  )
  // searched.slotIndexes should be derived from the new constant.
  // The function body builds `slotIndexes` from `DEFAULT_SLOT_INDEXES`,
  // which is now bound to the helper's output.
  assert(
    /slotIndexes\s*=\s*\[\.\.\.DEFAULT_SLOT_INDEXES\]/.test(helper) ||
      /slotIndexes\s*=\s*DEFAULT_SLOT_INDEXES/.test(helper),
    'helper slotIndexes 来自 DEFAULT_SLOT_INDEXES (来自 helper)',
  )
}

// ─── C. K23-A room API defensive check ────────────────────

function testK23aApiDefensive() {
  console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━')
  console.log('C. K23-A room API defensive check')
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━')

  const route = fileRead('src/app/api/schedule-adjustments/room-recommendations/route.ts')
  assert(
    /targetSlotIndex\s*<\s*1\s*\|\|\s*targetSlotIndex\s*>\s*5/.test(route),
    'K23-A API 拒绝 targetSlotIndex > 5 (1-5 only)',
  )
  assert(
    route.includes('1-5 之间') || route.includes('1-5'),
    'K23-A API 错误信息说明 1-5 范围',
  )
  // No more "1-6" string in the route.
  assert(
    !/1-6/.test(route),
    'K23-A API 不再提及 1-6 范围',
  )
}

// ─── D. Dialog UI hides 11-12节 ──────────────────────────

function testDialogHides11to12() {
  console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━')
  console.log('D. Dialog UI hides 11-12节')
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━')

  const dialog = fileRead('src/components/schedule-adjustment-dialog.tsx')
  // 节次下拉 uses getTeachingSlotLabelOptions
  assert(
    dialog.includes('getTeachingSlotLabelOptions'),
    'dialog 节次下拉使用 getTeachingSlotLabelOptions',
  )
  // The dialog no longer iterates the full TIME_SLOTS for the new-slot select.
  // It still references TIME_SLOTS for display labels of existing
  // items/plans (which may have historical slotIndex=6), but the
  // dropdown for "新节次" must use the bounded options.
  // We assert that the dropdown iteration is bounded.
  const dropdownBounded = /新节次[\s\S]{0,800}?getTeachingSlotLabelOptions\(\)/.test(dialog) ||
    /getTeachingSlotLabelOptions\(\)[\s\S]{0,800}?新节次/.test(dialog)
  assert(dropdownBounded, 'dialog "新节次" select 使用 bounded options (getTeachingSlotLabelOptions)')
  // The dialog still uses TIME_SLOTS.find for displaying existing
  // items / recommended plans, which is fine (we don't want to
  // strip the label map for legacy rendering).
}

// ─── E. K24-A1 / A2 / A3 markers preserved ───────────────

function testK24a1a2a3MarkersPreserved() {
  console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━')
  console.log('E. K24-A1 / A2 / A3 markers preserved')
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━')

  const dialog = fileRead('src/components/schedule-adjustment-dialog.tsx')
  assert(dialog.includes('preferredPlanWeek'), 'K24-A1 preferredPlanWeek state 保留')
  assert(dialog.includes('showAdvancedTools'), 'K24-A1 showAdvancedTools state 保留')
  assert(/overflow-y-auto/.test(dialog), 'K24-A1 可滚动列表保留')

  const helper = fileRead('src/lib/schedule/adjustment-plan-recommendations.ts')
  assert(
    helper.includes('taskActiveInTargetWeek') || helper.includes('K24-A2'),
    'K24-A2 cross-week self-conflict gate 保留',
  )
  assert(
    helper.includes('preferredPlans') && helper.includes('fallbackPlans'),
    'K24-A3 preferredWeek-first 分桶 保留',
  )
  assert(
    helper.includes('isPreferredWeek'),
    'K24-A3 isPreferredWeek marker 保留',
  )
}

// ─── F. K23-A room recommendation still works ─────────────

function testK23aStillAvailable() {
  console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━')
  console.log('F. K23-A room recommendation still available')
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━')

  // K23-A helper itself is not modified.
  const k23a = fileRead('src/lib/schedule/room-recommendations.ts')
  assert(
    k23a.includes('findAdjustmentRoomRecommendations'),
    'K23-A helper 仍导出 findAdjustmentRoomRecommendations',
  )
}

// ─── G. Manual select still available ────────────────────

function testManualSelectPreserved() {
  console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━')
  console.log('G. Manual select still available')
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━')

  const dialog = fileRead('src/components/schedule-adjustment-dialog.tsx')
  assert(dialog.includes('roomOptions.map'), '手动教室 select 仍存在')
  assert(
    /onChange=\{\(e\)\s*=>\s*setNewRoomId\(e\.target\.value/.test(dialog),
    '手动 setNewRoomId 仍可用',
  )
  assert(dialog.includes('新教室'), '新教室 label 仍存在')
}

// ─── H. score.ts NOT modified ───────────────────────────

function testScoreTsUntouched() {
  console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━')
  console.log('H. score.ts NOT modified')
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━')

  assert(!gitDiffSince('ebdc18c', 'src/lib/scheduler/score.ts'),
    'src/lib/scheduler/score.ts 未改')
}

// ─── I. Schema / DB NOT modified ────────────────────────

function testSchemaDbUntouched() {
  console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━')
  console.log('I. Schema / DB NOT modified')
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━')

  assert(!gitDiffSince('ebdc18c', 'prisma/schema.prisma'),
    'prisma/schema.prisma 未改')
  assert(!gitDiffSince('ebdc18c', 'prisma/migrations'),
    'prisma/migrations/* 未改')
  assert(fileExists('prisma/dev.db'), 'prisma/dev.db 仍存在')
}

// ─── J. No DB writes ────────────────────────────────────

function testNoDbWrites() {
  console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━')
  console.log('J. No DB writes')
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━')

  const helper = fileRead('src/lib/schedule/time-slots.ts')
  assert(!/prisma\.\w+\.create[\(\s]/.test(helper), 'time-slots.ts 无 prisma.create')
  assert(!/prisma\.\w+\.update[\(\s]/.test(helper), 'time-slots.ts 无 prisma.update')

  const planHelper = fileRead('src/lib/schedule/adjustment-plan-recommendations.ts')
  assert(!/prisma\.\w+\.create[\(\s]/.test(planHelper), 'plan helper 无 prisma.create')
  assert(!/prisma\.\w+\.update[\(\s]/.test(planHelper), 'plan helper 无 prisma.update')
  assert(!/prisma\.\w+\.delete[\(\s]/.test(planHelper), 'plan helper 无 prisma.delete')
  assert(!/prisma\.\w+\.upsert[\(\s]/.test(planHelper), 'plan helper 无 prisma.upsert')
}

// ─── K. DB integration read-only: plan helper output ──────

async function testDbIntegration() {
  console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━')
  console.log('K. DB integration: plan helper output')
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━')

  const { findAdjustmentPlanRecommendations } = await import(
    '@/lib/schedule/adjustment-plan-recommendations'
  )

  const slot = await prisma.scheduleSlot.findFirst({
    where: { teachingTaskId: { not: undefined } },
    orderBy: { id: 'asc' },
  })
  if (!slot) {
    assert(false, 'DB 中未找到任何 schedule slot')
    return
  }

  const result = await findAdjustmentPlanRecommendations({
    scheduleSlotId: slot.id,
    weekWindow: 1,
    limit: 5,
  })

  assert(typeof result.searched.slotIndexes === 'object' && Array.isArray(result.searched.slotIndexes),
    'result.searched.slotIndexes 是数组')
  assert(
    !result.searched.slotIndexes.includes(6),
    'result.searched.slotIndexes 不含 6 (11-12节)',
  )
  assert(
    !result.searched.slotIndexes.includes(7),
    'result.searched.slotIndexes 不含 7 (中午)',
  )
  assert(
    result.searched.slotIndexes.every((s) => s >= 1 && s <= 5),
    `result.searched.slotIndexes 全部在 1-5 范围 (got ${JSON.stringify(result.searched.slotIndexes)})`,
  )

  for (const p of result.plans) {
    assert(
      p.targetSlotIndex >= 1 && p.targetSlotIndex <= 5,
      `plan (week=${p.targetWeek}) targetSlotIndex=${p.targetSlotIndex} 在 1-5 范围`,
    )
  }
}

// ─── Main ───────────────────────────────────────────────

async function main() {
  console.log('🧪 K24-A4 Time-Slot Range Correction — Verification')

  testSharedHelperExists()
  testK24AUsesCorrectRange()
  testK23aApiDefensive()
  testDialogHides11to12()
  testK24a1a2a3MarkersPreserved()
  testK23aStillAvailable()
  testManualSelectPreserved()
  testScoreTsUntouched()
  testSchemaDbUntouched()
  testNoDbWrites()
  await testDbIntegration()

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

  console.log('\n✅ K24-A4 节次范围修复验证全部通过。')
  console.log('   - 共享 helper: VALID_TEACHING_SLOT_INDEXES = [1..5]')
  console.log('   - K24-A plan helper 不再枚举 11-12节')
  console.log('   - K23-A API 拒绝 targetSlotIndex > 5')
  console.log('   - 调课弹窗节次下拉隐藏 11-12节')
  console.log('   - K24-A1/A2/A3 markers 保留')
  console.log('   - K23-A 推荐教室仍可用')
  console.log('   - 手动选择仍存在')
  console.log('   - score.ts / schema / dev.db 未改')
  await prisma.$disconnect()
  process.exit(0)
}

main().catch(async (e) => {
  console.error('verify 脚本异常:', e)
  await prisma.$disconnect().catch(() => {})
  process.exit(1)
})
