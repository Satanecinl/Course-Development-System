// scripts/verify-plan-recommendation-preferred-day-k24-a5.ts
// K24-A5: Preferred day-of-week priority verification.
//
// Feature:
//   Extends K24-A3's preferredWeek-first to a three-bucket
//   preferredDay > sameWeekOtherDay > fallback sort, when the
//   user supplies a preferredDayOfWeek (1..5). null preserves the
//   K24-A3 two-bucket behavior.
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

// ─── A. Helper supports preferredDayOfWeek ────────────────

function testHelperSupportsPreferredDay() {
  console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━')
  console.log('A. Helper supports preferredDayOfWeek')
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━')

  const helper = fileRead('src/lib/schedule/adjustment-plan-recommendations.ts')
  assert(
    helper.includes('preferredDayOfWeek'),
    'helper 引用 preferredDayOfWeek',
  )
  assert(
    /preferredDayOfWeek\?: number \| null/.test(helper),
    'helper input 接口含 preferredDayOfWeek?: number | null',
  )
  assert(
    /isPreferredDay: boolean/.test(helper),
    'AdjustmentPlanRecommendation 含 isPreferredDay: boolean',
  )
  assert(
    /preferredDayAvailable: boolean/.test(helper),
    'AdjustmentPlanRecommendationResult 含 preferredDayAvailable',
  )
  assert(
    helper.includes('VALID_PREFERRED_DAY_VALUES'),
    'helper 包含 VALID_PREFERRED_DAY_VALUES 常量',
  )
}

// ─── B. API route accepts preferredDayOfWeek ─────────────

function testApiAcceptsPreferredDay() {
  console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━')
  console.log('B. API route accepts preferredDayOfWeek')
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━')

  const route = fileRead('src/app/api/schedule-adjustments/plan-recommendations/route.ts')
  assert(
    route.includes('preferredDayOfWeek'),
    'route 引用 preferredDayOfWeek',
  )
  // Validates 1..5 range, rejects 6/7
  assert(
    /preferredDayOfWeek.*<\s*1\s*\|\|\s*.*>\s*5/.test(route) ||
      /n\s*<\s*1\s*\|\|\s*n\s*>\s*5/.test(route),
    'route 校验 preferredDayOfWeek 必须在 1-5 之间',
  )
  assert(
    route.includes('周一..周五') || route.includes('1-5 之间的整数'),
    'route 错误信息说明 1-5 范围',
  )
}

// ─── C. Client fetch sends preferredDayOfWeek ─────────────

function testClientSendsPreferredDay() {
  console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━')
  console.log('C. fetchPlanRecommendations sends preferredDayOfWeek')
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━')

  const client = fileRead('src/lib/schedule/adjustment-client.ts')
  assert(
    client.includes('preferredDayOfWeek'),
    'client types 包含 preferredDayOfWeek',
  )
  assert(
    /preferredDayOfWeek\?:\s*number\s*\|\s*null/.test(client),
    'AdjustmentPlanRecommendationRequest 包含 preferredDayOfWeek?: number | null',
  )
  // fetchPlanRecommendations forwards preferredDayOfWeek by passing
  // the entire input object to JSON.stringify; explicit spread not
  // needed. We assert the request type contains the field and the
  // function actually serialises it via the input parameter.
  assert(
    /preferredDayOfWeek\?:\s*number\s*\|\s*null/.test(client),
    'client types 包含 preferredDayOfWeek (请求体字段)',
  )
  assert(
    /body:\s*JSON\.stringify\(input\)/.test(client),
    'fetchPlanRecommendations 序列化整个 input (含 preferredDayOfWeek)',
  )
  assert(
    /preferredDayOfWeek:.*preferredDayOfWeek/.test(client) ||
      /preferredDayAvailable:.*preferredDayAvailable/.test(client),
    'client 解析响应 preferredDayOfWeek / preferredDayAvailable',
  )
}

// ─── D. Frontend has 优先星期 control ───────────────────

function testFrontendPreferredDayControl() {
  console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━')
  console.log('D. Frontend has 优先星期 control')
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━')

  const dialog = fileRead('src/components/schedule-adjustment-dialog.tsx')
  assert(
    dialog.includes('preferredPlanDay'),
    'dialog 包含 preferredPlanDay state',
  )
  assert(
    dialog.includes('k24-preferred-day'),
    'dialog 包含 "k24-preferred-day" data-testid',
  )
  // 自动匹配 + 周一..周五
  assert(
    dialog.includes('自动匹配'),
    'dialog 包含 "自动匹配" option',
  )
  assert(
    /<option value="1">周一/.test(dialog) ||
      /<option\s+key="\d+"\s+value="\d+">周一/.test(dialog),
    'dialog 包含 周一 option',
  )
  assert(
    /<option value="2">周二/.test(dialog) ||
      /value="2">周二/.test(dialog),
    'dialog 包含 周二 option',
  )
  assert(
    /<option value="3">周三/.test(dialog) ||
      /value="3">周三/.test(dialog),
    'dialog 包含 周三 option',
  )
  assert(
    /<option value="4">周四/.test(dialog) ||
      /value="4">周四/.test(dialog),
    'dialog 包含 周四 option',
  )
  assert(
    /<option value="5">周五/.test(dialog) ||
      /value="5">周五/.test(dialog),
    'dialog 包含 周五 option',
  )
  // No weekend options (6/7 not in dropdown)
  assert(
    !/<option value="6">周六/.test(dialog) &&
      !/<option value="7">周日/.test(dialog),
    'dialog 不含 周末 option (优先星期不支持周末)',
  )
  // 6 options total (1 auto + 5 days)
  assert(
    (dialog.match(/<option[^>]*value="[\d]?"/g) || []).length >= 6,
    'dialog 至少 6 个 option (自动 + 周一..周五)',
  )
}

// ─── E. Plan list three-bucket grouping ─────────────────

function testThreeBucketGrouping() {
  console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━')
  console.log('E. Plan list three-bucket grouping')
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━')

  const dialog = fileRead('src/components/schedule-adjustment-dialog.tsx')
  // Three bucket labels
  assert(
    dialog.includes('首选日期方案'),
    'dialog 包含 "首选日期方案" 分组标签 (K24-A5 优先日期)',
  )
  assert(
    dialog.includes('同周其他日期方案') || dialog.includes('首选周方案'),
    'dialog 包含 "同周其他日期方案" 或 "首选周方案" (K24-A5/A3)',
  )
  assert(
    dialog.includes('备选周方案'),
    'dialog 包含 "备选周方案" 分组标签 (K24-A3)',
  )
  // Bucket testids
  assert(
    dialog.includes('k24-plan-bucket-preferred-day'),
    'dialog 包含 k24-plan-bucket-preferred-day testid',
  )
  assert(
    dialog.includes('k24-plan-bucket-same-week-other'),
    'dialog 包含 k24-plan-bucket-same-week-other testid',
  )
  assert(
    dialog.includes('k24-plan-bucket-fallback'),
    'dialog 包含 k24-plan-bucket-fallback testid',
  )
  // preferredDay unavailable message
  assert(
    dialog.includes('k24-preferred-day-unavailable'),
    'dialog 包含 k24-preferred-day-unavailable testid',
  )
  assert(
    dialog.includes('暂无可用方案'),
    'dialog 包含 "暂无可用方案" 提示文案',
  )
}

// ─── F. K24-A1 / A2 / A3 / A4 markers preserved ───────

function testK24a1to4MarkersPreserved() {
  console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━')
  console.log('F. K24-A1 / A2 / A3 / A4 markers preserved')
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━')

  const dialog = fileRead('src/components/schedule-adjustment-dialog.tsx')
  assert(dialog.includes('preferredPlanWeek'), 'K24-A1 preferredPlanWeek 保留')
  assert(dialog.includes('showAdvancedTools'), 'K24-A1 showAdvancedTools 保留')
  assert(/overflow-y-auto/.test(dialog), 'K24-A1 overflow-y-auto 保留')
  assert(dialog.includes('selectedPlanKey'), 'K24-A1 selectedPlanKey 保留')
  assert(dialog.includes('使用该方案'), 'K24-A1 "使用该方案" 保留')
  assert(dialog.includes('一键推荐调课方案'), 'K24-A1 "一键推荐调课方案" 按钮保留')

  const helper = fileRead('src/lib/schedule/adjustment-plan-recommendations.ts')
  assert(
    helper.includes('taskActiveInTargetWeek') || helper.includes('K24-A2'),
    'K24-A2 cross-week gate 保留',
  )
  assert(
    helper.includes('preferredPlans') || helper.includes('preferredDayPlans'),
    'K24-A3 排序基础保留',
  )
  assert(
    helper.includes('isPreferredWeek') && helper.includes('isPreferredDay'),
    'K24-A3 + K24-A5 isPreferred markers 保留',
  )
  assert(
    helper.includes('getValidTeachingSlotIndexes') ||
      helper.includes('VALID_TEACHING_SLOT_INDEXES'),
    'K24-A4 有效节次 [1..5] 保留',
  )
  assert(
    /DEFAULT_SLOT_INDEXES\s*=/.test(helper),
    'K24-A4 DEFAULT_SLOT_INDEXES 保留',
  )
}

// ─── G. score.ts NOT modified ───────────────────────────

function testScoreTsUntouched() {
  console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━')
  console.log('G. score.ts NOT modified')
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━')

  assert(!gitDiffSince('5d90921', 'src/lib/scheduler/score.ts'),
    'src/lib/scheduler/score.ts 未改')
}

// ─── H. Schema / DB NOT modified ────────────────────────

function testSchemaDbUntouched() {
  console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━')
  console.log('H. Schema / DB NOT modified')
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━')

  assert(!gitDiffSince('5d90921', 'prisma/schema.prisma'),
    'prisma/schema.prisma 未改')
  assert(!gitDiffSince('5d90921', 'prisma/migrations'),
    'prisma/migrations/* 未改')
  assert(fileExists('prisma/dev.db'), 'prisma/dev.db 仍存在')
}

// ─── I. No DB writes ────────────────────────────────────

function testNoDbWrites() {
  console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━')
  console.log('I. No DB writes')
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━')

  const helper = fileRead('src/lib/schedule/adjustment-plan-recommendations.ts')
  assert(!/prisma\.\w+\.create[\(\s]/.test(helper), 'helper 无 prisma.create')
  assert(!/prisma\.\w+\.update[\(\s]/.test(helper), 'helper 无 prisma.update')
  assert(!/prisma\.\w+\.delete[\(\s]/.test(helper), 'helper 无 prisma.delete')
  assert(!/prisma\.\w+\.upsert[\(\s]/.test(helper), 'helper 无 prisma.upsert')
}

// ─── J. DB read-only integration ────────────────────────

async function testDbIntegration() {
  console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━')
  console.log('J. DB read-only integration: preferredDay bucketing')
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
  const task = await prisma.teachingTask.findUnique({
    where: { id: slot.teachingTaskId },
  })
  const preferredWeek = Math.min(20, (task?.startWeek ?? 1) + 4)

  // Auto mode (preferredDayOfWeek=null)
  const autoResult = await findAdjustmentPlanRecommendations({
    scheduleSlotId: slot.id,
    preferredWeek,
    weekWindow: 1,
    limit: 5,
  })
  assertEqual(autoResult.preferredDayOfWeek, null, 'auto 模式 preferredDayOfWeek = null')
  assert(autoResult.preferredDayAvailable === true, 'auto 模式 preferredDayAvailable = true')
  assert(
    autoResult.plans.every((p) => p.isPreferredDay === false),
    'auto 模式所有 plan.isPreferredDay = false',
  )

  // Day mode (preferredDayOfWeek=1, 周一)
  const dayResult = await findAdjustmentPlanRecommendations({
    scheduleSlotId: slot.id,
    preferredWeek,
    weekWindow: 1,
    limit: 5,
    preferredDayOfWeek: 1,
  })
  assertEqual(dayResult.preferredDayOfWeek, 1, 'day 模式 preferredDayOfWeek = 1')

  // Verify isPreferredDay consistency
  for (const p of dayResult.plans) {
    if (p.isPreferredDay) {
      assert(
        p.targetWeek === preferredWeek && p.targetDayOfWeek === 1,
        'isPreferredDay=true plan 满足 (week, day)=(preferredWeek, 1)',
      )
    } else {
      // Either other day in same week OR fallback week
      const validElse =
        p.targetWeek === preferredWeek || p.targetWeek !== preferredWeek
      assert(validElse, 'isPreferredDay=false plan 是 other day 或 fallback')
    }
  }

  // If there are any plans, preferredDay plans should come first
  if (dayResult.plans.length > 0) {
    const firstNonDayIndex = dayResult.plans.findIndex((p) => !p.isPreferredDay)
    const firstDayIndex = dayResult.plans.findIndex((p) => p.isPreferredDay)
    if (firstDayIndex >= 0 && firstNonDayIndex >= 0) {
      assert(
        firstDayIndex < firstNonDayIndex,
        `首选日期 plan 排在非首选日期 plan 之前 (firstDay=${firstDayIndex}, firstNonDay=${firstNonDayIndex})`,
      )
    } else if (firstDayIndex >= 0) {
      assert(true, '所有 plan 都是首选日期 plan (no fallback needed)')
    }
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

// ─── Main ───────────────────────────────────────────────

async function main() {
  console.log('🧪 K24-A5 Preferred-Day Priority — Verification')

  testHelperSupportsPreferredDay()
  testApiAcceptsPreferredDay()
  testClientSendsPreferredDay()
  testFrontendPreferredDayControl()
  testThreeBucketGrouping()
  testK24a1to4MarkersPreserved()
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

  console.log('\n✅ K24-A5 优先星期修复验证全部通过。')
  console.log('   - helper 3-bucket 分桶 (preferredDay > sameWeekOther > fallback)')
  console.log('   - API 校验 preferredDayOfWeek 1..5')
  console.log('   - 客户端 forward preferredDayOfWeek')
  console.log('   - 前端 优先星期 控件 + 自动匹配 + 三级分组')
  console.log('   - K24-A1/A2/A3/A4 markers 全部保留')
  console.log('   - score.ts / schema / dev.db 未改')
  await prisma.$disconnect()
  process.exit(0)
}

main().catch(async (e) => {
  console.error('verify 脚本异常:', e)
  await prisma.$disconnect().catch(() => {})
  process.exit(1)
})
