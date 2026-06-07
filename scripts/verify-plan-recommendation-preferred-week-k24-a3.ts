// scripts/verify-plan-recommendation-preferred-week-k24-a3.ts
// K24-A3: preferredWeek-first priority fix verification.
//
// Bug:
//   When the user selects preferredWeek=13, plans from weeks 12/15
//   (with higher scores) can squeeze out week 13 plans because the
//   global score-desc sort + limit=5 truncation doesn't respect
//   preferredWeek as a first-class grouping.
//
// Fix:
//   The K24-A helper now uses bucketed sorting: preferredWeek plans
//   are collected separately, sorted by score, then composited
//   before fallback plans. The result includes additive fields:
//   preferredWeek, preferredWeekAvailable, isPreferredWeek (per plan),
//   searched.preferredWeekPlanCount, searched.fallbackPlanCount.
//   The frontend groups the list into "首选周" / "备选周" sections.
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

// ─── A. K24-A plan helper exists ─────────────────────────

function testHelperExists() {
  console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━')
  console.log('A. K24-A plan helper exists')
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━')

  assert(
    fileExists('src/lib/schedule/adjustment-plan-recommendations.ts'),
    'src/lib/schedule/adjustment-plan-recommendations.ts 存在',
  )
}

// ─── B. preferredWeek-first logic present ────────────────

function testPreferredWeekFirstLogic() {
  console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━')
  console.log('B. preferredWeek-first bucketed sorting logic')
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━')

  const helper = fileRead('src/lib/schedule/adjustment-plan-recommendations.ts')
  assert(
    helper.includes('preferredPlans') && helper.includes('fallbackPlans'),
    'helper 包含 preferredPlans / fallbackPlans 分桶',
  )
  assert(
    helper.includes('sortByScore'),
    'helper 包含 sortByScore 排序函数',
  )
  assert(
    /[.*preferredPlans.*fallbackPlans.*]\.slice\(0,\s*limit\)/.test(helper) ||
      /\[\.\.\.preferredPlans,\s*\.\.\.fallbackPlans\]\.slice\(0,\s*limit\)/.test(helper),
    'helper 先 preferred 后 fallback 再 slice limit (不是全局排序)',
  )
}

// ─── C. preferredWeek plans not squeezed by limit ────────

function testPreferredNotSqueezed() {
  console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━')
  console.log('C. preferredWeek plans not squeezed by limit')
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━')

  const helper = fileRead('src/lib/schedule/adjustment-plan-recommendations.ts')
  // Verify there is NO global sort-then-slice (the old bug pattern).
  // The fix uses bucketed composite: [...preferred, ...fallback].slice(0, limit).
  // Ensure the old pattern (plans.sort then plans.slice) is gone.
  assert(
    !/plans\.sort\([\s\S]{0,200}?plans\.slice\(0,\s*limit\)/.test(helper),
    '旧的全局 plans.sort + plans.slice 已被替换为分桶排序',
  )
  // The new pattern: preferredPlans.sort + fallbackPlans.sort + composite
  assert(
    /preferredPlans\.sort\(sortByScore\)/.test(helper),
    'preferredPlans 单独按 score 排序',
  )
  assert(
    /fallbackPlans\.sort\(sortByScore\)/.test(helper),
    'fallbackPlans 单独按 score 排序',
  )
}

// ─── D. Result contains preferredWeek summary ───────────

function testPreferredWeekSummary() {
  console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━')
  console.log('D. Result contains preferredWeek summary')
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━')

  const helper = fileRead('src/lib/schedule/adjustment-plan-recommendations.ts')
  assert(
    helper.includes('preferredWeekAvailable'),
    'result 包含 preferredWeekAvailable 字段',
  )
  assert(
    helper.includes('preferredWeekPlanCount'),
    'result.searched 包含 preferredWeekPlanCount',
  )
  assert(
    helper.includes('fallbackPlanCount'),
    'result.searched 包含 fallbackPlanCount',
  )
  assert(
    helper.includes('preferredWeek: centerWeek'),
    'result 包含 preferredWeek 字段',
  )
}

// ─── E. Plan contains isPreferredWeek marker ────────────

function testIsPreferredWeekMarker() {
  console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━')
  console.log('E. Plan contains isPreferredWeek marker')
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━')

  const helper = fileRead('src/lib/schedule/adjustment-plan-recommendations.ts')
  assert(
    helper.includes('isPreferredWeek: targetWeek === centerWeek'),
    'plan push 包含 isPreferredWeek = targetWeek === centerWeek',
  )
  const typeBlock = helper.slice(0, helper.indexOf('export interface AdjustmentPlanRecommendationResult'))
  assert(
    /isPreferredWeek:\s*boolean/.test(typeBlock),
    'AdjustmentPlanRecommendation type 包含 isPreferredWeek: boolean',
  )
}

// ─── F. preferredWeek has plans → plans starts with preferred ─

function testPreferredWeekHasPlansPriority() {
  console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━')
  console.log('F. preferredWeek has plans → plans starts with preferred')
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━')

  const helper = fileRead('src/lib/schedule/adjustment-plan-recommendations.ts')
  assert(
    /\[\.\.\.preferredPlans,\s*\.\.\.fallbackPlans\]/.test(helper) ||
      /\[.*preferredPlans.*\.\.\.fallbackPlans\]/.test(helper),
    'composite 顺序: preferredPlans 在前, fallbackPlans 在后',
  )
}

// ─── G. preferredWeek no plans → message ─────────────────

function testPreferredWeekNoPlanMessage() {
  console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━')
  console.log('G. preferredWeek no plans → explicit message')
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━')

  const helper = fileRead('src/lib/schedule/adjustment-plan-recommendations.ts')
  assert(
    helper.includes('暂无可用方案') || helper.includes('preferredWeekAvailable'),
    'preferredWeek 无方案时有明确 message 或 preferredWeekAvailable=false',
  )
  assert(
    helper.includes('邻近周备选方案'),
    'message 包含 "邻近周备选方案" 引导文案',
  )
}

// ─── H. Frontend displays "首选周" / "备选周" labels ─────

function testFrontendPreferredFallbackLabels() {
  console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━')
  console.log('H. Frontend displays 首选周 / 备选周 labels')
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━')

  const dialog = fileRead('src/components/schedule-adjustment-dialog.tsx')
  assert(
    dialog.includes('首选周方案'),
    'dialog UI 包含 "首选周方案" 分组标签',
  )
  assert(
    dialog.includes('备选周方案'),
    'dialog UI 包含 "备选周方案" 分组标签',
  )
  assert(
    dialog.includes('planResult.preferredWeek'),
    'dialog 引用 planResult.preferredWeek',
  )
}

// ─── I. Frontend still has scrollable list ───────────────

function testFrontendScrollableList() {
  console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━')
  console.log('I. Frontend still has scrollable list')
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━')

  const dialog = fileRead('src/components/schedule-adjustment-dialog.tsx')
  assert(
    /overflow-y-auto/.test(dialog),
    'plan 列表容器使用 overflow-y-auto (可滚动)',
  )
  assert(
    /max-h-/.test(dialog),
    'plan 列表容器使用 max-h-* (限定最大高度)',
  )
}

// ─── J. K24-A1 preferredPlanWeek control still exists ────

function testPreferredPlanWeekControlExists() {
  console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━')
  console.log('J. K24-A1 preferredPlanWeek control still exists')
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━')

  const dialog = fileRead('src/components/schedule-adjustment-dialog.tsx')
  assert(
    dialog.includes('preferredPlanWeek'),
    'dialog 包含 preferredPlanWeek state',
  )
  assert(
    dialog.includes('优先调课'),
    'dialog UI 包含 "优先调课" 文案',
  )
}

// ─── K. K24-A2 cross-week self-conflict gate still exists ─

function testK24A2GateStillExists() {
  console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━')
  console.log('K. K24-A2 cross-week self-conflict gate still exists')
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━')

  const helper = fileRead('src/lib/schedule/adjustment-plan-recommendations.ts')
  assert(
    helper.includes('taskActiveInTargetWeek') || helper.includes('K24-A2'),
    'helper 包含 K24-A2 cross-week 拦截 marker',
  )
  assert(
    helper.includes('isTaskActiveInWeek'),
    'helper 包含 isTaskActiveInWeek (K24-A2 pure helper)',
  )
}

// ─── L. score.ts NOT modified ───────────────────────────

function testScoreTsUntouched() {
  console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━')
  console.log('L. score.ts NOT modified')
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━')

  assert(!gitDiffSince('3a832fd', 'src/lib/scheduler/score.ts'),
    'src/lib/scheduler/score.ts 未改')
}

// ─── M. Schema / DB NOT modified ────────────────────────

function testSchemaDbUntouched() {
  console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━')
  console.log('M. Schema / DB NOT modified')
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━')

  assert(!gitDiffSince('3a832fd', 'prisma/schema.prisma'),
    'prisma/schema.prisma 未改')
  assert(!gitDiffSince('3a832fd', 'prisma/migrations'),
    'prisma/migrations/* 未改')
  assert(fileExists('prisma/dev.db'), 'prisma/dev.db 仍存在')
}

// ─── N. No DB writes ────────────────────────────────────

function testNoDbWrites() {
  console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━')
  console.log('N. No DB writes')
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━')

  const helper = fileRead('src/lib/schedule/adjustment-plan-recommendations.ts')
  assert(!/prisma\.\w+\.create[\(\s]/.test(helper), 'helper 无 prisma.create')
  assert(!/prisma\.\w+\.update[\(\s]/.test(helper), 'helper 无 prisma.update')
  assert(!/prisma\.\w+\.delete[\(\s]/.test(helper), 'helper 无 prisma.delete')
  assert(!/prisma\.\w+\.upsert[\(\s]/.test(helper), 'helper 无 prisma.upsert')
}

// ─── O. DB read-only integration ────────────────────────

async function testDbIntegration() {
  console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━')
  console.log('O. DB read-only integration: preferredWeek-first')
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

  // Use a preferredWeek that is NOT the task's startWeek to stress
  // the preferred / fallback split.
  const task = await prisma.teachingTask.findUnique({
    where: { id: slot.teachingTaskId },
  })
  const preferredWeek = Math.min(20, (task?.startWeek ?? 1) + 5)

  const result = await findAdjustmentPlanRecommendations({
    scheduleSlotId: slot.id,
    preferredWeek,
    weekWindow: 1,
    limit: 5,
  })

  assert(typeof result.preferredWeek === 'number', 'result.preferredWeek is number')
  assert(typeof result.preferredWeekAvailable === 'boolean', 'result.preferredWeekAvailable is boolean')
  assert(typeof result.searched.preferredWeek === 'number', 'searched.preferredWeek is number')
  assert(typeof result.searched.preferredWeekPlanCount === 'number', 'searched.preferredWeekPlanCount is number')
  assert(typeof result.searched.fallbackPlanCount === 'number', 'searched.fallbackPlanCount is number')

  // If there are plans, check that preferred plans come before fallback
  // in the returned array.
  if (result.plans.length > 0) {
    let firstFallback = result.plans.findIndex(
      (p) => p.targetWeek !== preferredWeek,
    )
    if (firstFallback === -1) firstFallback = result.plans.length
    // All plans before firstFallback should be preferredWeek.
    const allPreferredBeforeFallback = result.plans
      .slice(0, firstFallback)
      .every((p) => p.targetWeek === preferredWeek)
    assert(
      allPreferredBeforeFallback,
      `preferredWeek(${preferredWeek}) plans 排在 fallback 前 (firstFallback=${firstFallback})`,
    )

    // Every plan should carry the isPreferredWeek marker.
    for (const p of result.plans) {
      assert(
        typeof p.isPreferredWeek === 'boolean',
        `plan (week=${p.targetWeek}) isPreferredWeek is boolean`,
      )
      if (p.targetWeek === preferredWeek) {
        assert(p.isPreferredWeek === true, `preferredWeek plan isPreferredWeek=true (week=${p.targetWeek})`)
      } else {
        assert(p.isPreferredWeek === false, `fallback plan isPreferredWeek=false (week=${p.targetWeek})`)
      }
    }
  }

  // preferredWeekAvailable must match the presence of preferred plans.
  const hasPreferredPlan = result.plans.some((p) => p.targetWeek === preferredWeek)
  if (hasPreferredPlan) {
    assert(result.preferredWeekAvailable === true, '有 preferredWeek plan 时 preferredWeekAvailable=true')
  }

  // If no preferred plan, message should indicate that.
  if (!result.preferredWeekAvailable && result.plans.length > 0) {
    assert(
      result.message?.includes('暂无可用方案') || result.message?.includes('邻近周备选'),
      `preferredWeek 无方案时 message 包含说明: ${result.message}`,
    )
  }
}

// ─── Main ───────────────────────────────────────────────

async function main() {
  console.log('🧪 K24-A3 Preferred-Week-First Priority — Verification')

  testHelperExists()
  testPreferredWeekFirstLogic()
  testPreferredNotSqueezed()
  testPreferredWeekSummary()
  testIsPreferredWeekMarker()
  testPreferredWeekHasPlansPriority()
  testPreferredWeekNoPlanMessage()
  testFrontendPreferredFallbackLabels()
  testFrontendScrollableList()
  testPreferredPlanWeekControlExists()
  testK24A2GateStillExists()
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

  console.log('\n✅ K24-A3 preferredWeek-first 修复验证全部通过。')
  console.log('   - 分桶排序: preferredPlans 在前, fallbackPlans 在后')
  console.log('   - preferredWeek 无方案时有明确 message')
  console.log('   - plan 包含 isPreferredWeek marker')
  console.log('   - result 包含 preferredWeek / preferredWeekAvailable / searched counts')
  console.log('   - 前端分组展示首选周 / 备选周')
  console.log('   - K24-A2 cross-week gate 保留')
  console.log('   - score.ts / schema / dev.db 未改')
  await prisma.$disconnect()
  process.exit(0)
}

main().catch(async (e) => {
  console.error('verify 脚本异常:', e)
  await prisma.$disconnect().catch(() => {})
  process.exit(1)
})
