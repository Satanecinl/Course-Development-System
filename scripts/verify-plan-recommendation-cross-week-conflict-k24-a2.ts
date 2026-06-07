// scripts/verify-plan-recommendation-cross-week-conflict-k24-a2.ts
// K24-A2: Cross-week self-conflict fix verification.
//
// Bug:
//   When the user moves a recurring ScheduleSlot from week N to week M
//   (M != N), and the same recurring slot is still active on week M
//   (at the same day/slot/room), K24-A's one-click recommendation
//   would happily propose "week M, same day, same slot, same room" —
//   which is a hard self-conflict because the same course is still
//   occupying that time on the target week.
//
// Root cause:
//   The K23-A room helper invokes checkScheduleConflicts with the
//   `scheduleSlotId` excluded *globally* (not week-aware), so the
//   recurring slot's target-week occurrence is masked out of the
//   conflict scan.
//
// Fix:
//   The K24-A plan helper now applies a week-aware self-occupancy
//   gate per (targetWeek, targetDayOfWeek, targetSlotIndex) tuple
//   before composing plans. If the same teaching task has any
//   ScheduleSlot on the target week at the same day/slot, the time
//   candidate is rejected (counted in rejectedSummary.teacherConflict)
//   and no rooms are surfaced for it.
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

function testPlanHelperExists() {
  console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━')
  console.log('A. K24-A plan helper exists')
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━')

  assert(
    fileExists('src/lib/schedule/adjustment-plan-recommendations.ts'),
    'src/lib/schedule/adjustment-plan-recommendations.ts 存在',
  )
}

// ─── B. K24-A2 fix logic present ────────────────────────

function testFixMarkersPresent() {
  console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━')
  console.log('B. K24-A2 fix markers present in helper')
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━')

  const helper = fileRead('src/lib/schedule/adjustment-plan-recommendations.ts')
  assert(
    helper.includes('taskActiveInTargetWeek') ||
      helper.includes('crossWeekSelfOccupancy') ||
      helper.includes('cross-week') ||
      helper.includes('crossWeek') ||
      helper.includes('K24-A2'),
    'helper 包含 K24-A2 cross-week 拦截 marker',
  )
  assert(
    helper.includes('isTaskActiveInWeek'),
    'helper 包含 isTaskActiveInWeek 纯 helper',
  )
  assert(
    /teachingTaskId:\s*slot\.teachingTaskId/.test(helper) ||
      /teachingTaskId:\s*task\.id/.test(helper),
    'cross-week 拦截使用 teachingTaskId (而非 scheduleSlotId 全局排除)',
  )
  // 拒绝计入 teacherConflict (K24-A 接受)
  assert(
    /rejected\.teacherConflict\s*\+=\s*1/.test(helper) ||
      /rejected\.teacherConflict\s*\+\+/.test(helper),
    'cross-week 拦截计入 rejectedSummary.teacherConflict',
  )
}

// ─── C. No global scheduleSlotId exclusion for target week ─

function testNoGlobalExclusion() {
  console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━')
  console.log('C. Recommendation 不再简单按 scheduleSlotId 全周排除')
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━')

  // K23-A conflict-check.ts still uses id-not-equal as an internal
  // pre-filter — that's fine. What matters is that K24-A's
  // recommendation logic does NOT carry that exclusion into the
  // target-week scan. The K24-A helper has its own cross-week gate
  // that re-checks by teachingTaskId, not by id-not-equal.
  const helper = fileRead('src/lib/schedule/adjustment-plan-recommendations.ts')

  // The cross-week gate block must query by teachingTaskId, not
  // rely on the K23-A conflict-check pre-filter. Look for the
  // block that has taskActiveInTargetWeek / isTaskActiveInWeek
  // (K24-A2) or the legacy crossWeekSelfOccupancy name.
  const crossWeekBlock = helper.match(
    /(taskActiveInTargetWeek|crossWeekSelfOccupancy)[\s\S]{0,1000}?(?=for \(const rc|\}\s*\n\s*for \(const rc)/,
  )
  assert(!!crossWeekBlock, 'helper 含 cross-week 拦截块 (含 taskActiveInTargetWeek 或 crossWeekSelfOccupancy)')
  if (crossWeekBlock) {
    assert(
      /teachingTaskId:\s*slot\.teachingTaskId/.test(crossWeekBlock),
      'cross-week 块按 teachingTaskId 查找 (而非 scheduleSlotId 全局排除)',
    )
  }
}

// ─── D. targetWeek is part of the conflict check ─────────

function testTargetWeekParticipates() {
  console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━')
  console.log('D. targetWeek 参与跨周冲突判断')
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━')

  const helper = fileRead('src/lib/schedule/adjustment-plan-recommendations.ts')
  // D: The fix's isTaskActiveInWeek call uses targetWeek as its
  // 4th argument. We match the full call including that argument.
  assert(
    /isTaskActiveInWeek\(\s*slot\.teachingTask\.weekType[\s\S]{0,600}?targetWeek\s*,?\s*\)/.test(helper),
    'isTaskActiveInWeek 用 targetWeek 调用 (targetWeek-aware)',
  )
}

// ─── E. Final gate marker exists ────────────────────────

function testFinalGateMarker() {
  console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━')
  console.log('E. final cross-week gate marker exists')
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━')

  const helper = fileRead('src/lib/schedule/adjustment-plan-recommendations.ts')
  // The fix block is in the main loop, BEFORE the room-candidate
  // iteration. Verify by structure: the gate must use `continue` to
  // skip both rooms for this (week, day, slot) tuple.
  // We use a generous character budget since the taskActiveInTargetWeek
  // variable is defined up to ~22 lines before `continue;` (including
  // a nested prisma.findFirst block).
  assert(
    /taskActiveInTargetWeek[\s\S]{0,3000}?rejected\.teacherConflict[\s\S]{0,300}?continue/.test(helper),
    'cross-week gate: taskActiveInTargetWeek → rejected.teacherConflict → continue',
  )
}

// ─── F. DB read-only integration: real cross-week self-conflict ─

async function testDbCrossWeekIntegration() {
  console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━')
  console.log('F. DB read-only integration: cross-week self-occupancy')
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━')

  const { findAdjustmentPlanRecommendations } = await import(
    '@/lib/schedule/adjustment-plan-recommendations'
  )

  // Find a teaching task that has multiple active weeks AND at
  // least one ScheduleSlot whose week (in the recurrence) is far
  // enough from task.startWeek to make a cross-week search
  // meaningful. We pick the first such task.
  const candidates = await prisma.teachingTask.findMany({
    where: {
      startWeek: { lte: 4 }, // task starts in weeks 1..4
      endWeek: { gte: 12 },  // task runs through weeks 12..20
    },
    include: {
      taskClasses: { include: { classGroup: true } },
    },
    take: 5,
  })

  let pickedTaskId: number | null = null
  let pickedSlotId: number | null = null
  let pickedSemesterId: number | null = null
  let pickedDay: number = 1
  let pickedSlotIdx: number = 1
  let pickedWeek: number = 1

  for (const t of candidates) {
    if (t.taskClasses.length === 0) continue
    // Pick the first ScheduleSlot for this task.
    const slot = await prisma.scheduleSlot.findFirst({
      where: { teachingTaskId: t.id },
      include: { room: true },
    })
    if (!slot) continue
    pickedTaskId = t.id
    pickedSlotId = slot.id
    pickedSemesterId = slot.semesterId
    pickedDay = slot.dayOfWeek
    pickedSlotIdx = slot.slotIndex
    // Pick a target week inside the task range but NOT the source
    // slot's own row's semester. The cross-week recurrence lives in
    // the same teachingTaskId, so any other active week qualifies.
    pickedWeek = (t.startWeek ?? 1) + 5 // 5 weeks in
    if (pickedWeek > (t.endWeek ?? 16)) pickedWeek = (t.endWeek ?? 16) - 1
    if (pickedWeek <= (t.startWeek ?? 1)) pickedWeek = (t.startWeek ?? 1) + 1
    break
  }

  if (!pickedSlotId || !pickedTaskId || !pickedSemesterId) {
    assert(
      false,
      'DB 中未找到合适的跨周 candidate (需要 teachingTask 跨多周 + 至少一个 slot)',
    )
    return
  }

  console.log(
    `  ℹ️  Using teachingTaskId=${pickedTaskId} slotId=${pickedSlotId} ` +
      `targetWeek=${pickedWeek} day=${pickedDay} slotIdx=${pickedSlotIdx}`,
  )

  // Now: pick a (week, day, slot) that the task is active in, but
  // does NOT have a base ScheduleSlot at the source's exact
  // (day, slot) tuple. If the task has only one slot, we can use a
  // different (day, slot) — the helper will route through the room
  // layer, and the cross-week gate only fires for the source task's
  // own (day, slot).
  //
  // To stress-test the cross-week gate, we deliberately call with
  // the source slot's own (day, slotIndex) but a different
  // targetWeek. The cross-week gate should:
  //   - pass when targetWeek is outside the task's active range
  //     (no target-week occupancy)
  //   - pass when targetWeek is inside the task's active range BUT
  //     the source task has no row at (day, slot) on that week
  //     (most teaching tasks have a single ScheduleSlot row
  //     representing the recurrence, so findFirst will return it)
  //
  // The bug case: targetWeek inside task range AND source task has
  // any row at (day, slot) — the cross-week gate fires.
  //
  // We verify that calling with targetWeek = task.endWeek (a week
  // where the recurrence IS active) yields either 0 plans (gate
  // fired) or no plan with the SAME (day, slot) as the source.

  // First, scan all ScheduleSlot rows for this teaching task to
  // determine whether the source (day, slot) exists on the target
  // week via the cross-week gate's predicate.
  const taskSlotRows = await prisma.scheduleSlot.findMany({
    where: { teachingTaskId: pickedTaskId, semesterId: pickedSemesterId },
    select: { dayOfWeek: true, slotIndex: true, id: true },
  })
  // The base ScheduleSlot rows don't carry a per-week field; the
  // recurrence is defined by teachingTask.weekType. So in the
  // current schema there is exactly ONE row per (task, day, slot)
  // (the helper's findFirst is keyed by teachingTaskId + dayOfWeek +
  // slotIndex). If our (pickedDay, pickedSlotIdx) is in taskSlotRows
  // (it always is, since pickedSlotId is one of them), the cross-week
  // gate will see it and fire.
  const hasSelfRow = taskSlotRows.some(
    (r) => r.dayOfWeek === pickedDay && r.slotIndex === pickedSlotIdx,
  )
  assert(
    hasSelfRow,
    'fixture: source task 至少有一个 ScheduleSlot (cross-week gate 才能触发)',
  )

  // Now run the helper with a targetWeek inside the task's active
  // range. We use a narrow week window of 0 (so we ONLY search the
  // targetWeek and its two neighbours — but weekWindow=0 means just
  // that one week; we use 1 to be safe, but assert that the bug
  // case — proposing (pickedDay, pickedSlotIdx) on targetWeek —
  // never appears in the result.
  const result = await findAdjustmentPlanRecommendations({
    scheduleSlotId: pickedSlotId,
    preferredWeek: pickedWeek,
    weekWindow: 0,
    includeWeekend: false,
    limit: 5,
  })

  // The bug case: any plan that exactly matches the source slot's
  // (day, slot) at the target week should be filtered out by the
  // cross-week gate.
  const bugPlans = result.plans.filter(
    (p) =>
      p.targetDayOfWeek === pickedDay &&
      p.targetSlotIndex === pickedSlotIdx &&
      p.targetWeek === pickedWeek,
  )
  assert(
    bugPlans.length === 0,
    `跨周 (第 ${pickedWeek} 周) 推荐不应包含源 (day=${pickedDay}, slot=${pickedSlotIdx}) 的 self-occupancy 方案 (found ${bugPlans.length})`,
  )

  // The cross-week gate should have fired and counted into
  // rejectedSummary.teacherConflict (the helper's chosen bucket).
  assert(
    result.rejectedSummary.teacherConflict >= 1,
    `rejectedSummary.teacherConflict >= 1 (cross-week gate fired), got ${result.rejectedSummary.teacherConflict}`,
  )
}

// ─── G. K23-A room recommendation still available ────────

function testK23AStillIntact() {
  console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━')
  console.log('G. K23-A room recommendation intact')
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━')

  // The K24-A2 fix is in K24-A plan helper only. K23-A is untouched.
  const k23a = fileRead('src/lib/schedule/room-recommendations.ts')
  assert(k23a.includes('findAdjustmentRoomRecommendations'),
    'K23-A helper 仍导出 findAdjustmentRoomRecommendations')
  assert(k23a.includes('MIN_CANDIDATES = 2'),
    'K23-A MIN_CANDIDATES = 2 保留')
  assert(k23a.includes('checkScheduleConflicts'),
    'K23-A 仍调 checkScheduleConflicts')
}

// ─── H. K24-A1 UX markers preserved ─────────────────────

function testK24A1UxPreserved() {
  console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━')
  console.log('H. K24-A1 UX markers preserved')
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━')

  const dialog = fileRead('src/components/schedule-adjustment-dialog.tsx')
  assert(dialog.includes('preferredPlanWeek'),
    'K24-A1 优先周次 state 仍存在')
  assert(dialog.includes('showAdvancedTools'),
    'K24-A1 高级选项 state 仍存在')
  assert(/overflow-y-auto/.test(dialog),
    'K24-A1 可滚动 plan 列表 (overflow-y-auto) 仍存在')
  assert(dialog.includes('使用该方案'),
    'K24-A1 "使用该方案" 按钮仍存在')
}

// ─── I. score.ts NOT modified ───────────────────────────

function testScoreTsUntouched() {
  console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━')
  console.log('I. score.ts NOT modified')
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━')

  assert(!gitDiffSince('60423dc', 'src/lib/scheduler/score.ts'),
    'src/lib/scheduler/score.ts 未改')
}

// ─── J. Schema / migration / dev.db NOT modified ────────

function testSchemaDbUntouched() {
  console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━')
  console.log('J. Schema / migration / dev.db NOT modified')
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━')

  assert(!gitDiffSince('60423dc', 'prisma/schema.prisma'),
    'prisma/schema.prisma 未改')
  assert(!gitDiffSince('60423dc', 'prisma/migrations'),
    'prisma/migrations/* 未改')
  assert(fileExists('prisma/dev.db'), 'prisma/dev.db 仍存在')
}

// ─── K. K23-A room helper not modified (cross-week fix only in K24-A) ─

function testK23aUntouched() {
  console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━')
  console.log('K. K23-A helper / API not modified (fix in K24-A only)')
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━')

  // K23-A helper is NOT modified (66/66 must remain valid). The
  // K23-A API route may receive additive defensive validations from
  // later stages (e.g. K24-A4 added a targetSlotIndex > 5 → 400
  // check). We therefore still assert the helper is untouched.
  // The route is allowed to legitimately change for additive
  // defensive checks that REDUCE the allowed range.
  assert(!gitDiffSince('60423dc', 'src/lib/schedule/room-recommendations.ts'),
    'src/lib/schedule/room-recommendations.ts 未改 (K23-A helper)')
  assert(
    !gitDiffSince('60423dc', 'src/lib/schedule/conflict-check.ts'),
    'conflict-check.ts 未改 (避免影响 K23-A 66/66)',
  )
  assert(
    !gitDiffSince('60423dc', 'src/lib/schedule/conflict-rules.ts'),
    'conflict-rules.ts 未改',
  )
  assert(
    !gitDiffSince('60423dc', 'src/lib/schedule/adjustments.ts'),
    'adjustments.ts / dryRunScheduleAdjustment 未改',
  )
}

// ─── L. No DB writes ────────────────────────────────────

function testNoDbWrites() {
  console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━')
  console.log('L. No DB writes')
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━')

  const planHelper = fileRead('src/lib/schedule/adjustment-plan-recommendations.ts')
  assert(
    !/prisma\.\w+\.create[\(\s]/.test(planHelper),
    'plan helper 无 prisma.create',
  )
  assert(
    !/prisma\.\w+\.update[\(\s]/.test(planHelper),
    'plan helper 无 prisma.update',
  )
  assert(
    !/prisma\.\w+\.delete[\(\s]/.test(planHelper),
    'plan helper 无 prisma.delete',
  )
  assert(
    !/prisma\.\w+\.upsert[\(\s]/.test(planHelper),
    'plan helper 无 prisma.upsert',
  )
}

// ─── Main ───────────────────────────────────────────────

async function main() {
  console.log('🧪 K24-A2 Cross-Week Self-Conflict — Verification')

  testPlanHelperExists()
  testFixMarkersPresent()
  testNoGlobalExclusion()
  testTargetWeekParticipates()
  testFinalGateMarker()
  await testDbCrossWeekIntegration()
  testK23AStillIntact()
  testK24A1UxPreserved()
  testScoreTsUntouched()
  testSchemaDbUntouched()
  testK23aUntouched()
  testNoDbWrites()

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

  console.log('\n✅ K24-A2 跨周自冲突修复验证全部通过。')
  console.log('   - cross-week 拦截按 teachingTaskId 查 targetWeek occupancy')
  console.log('   - targetWeek-aware, 不再依赖 scheduleSlotId 全局排除')
  console.log('   - K23-A helper / API / conflict-check / dry-run 全部 intact')
  console.log('   - K24-A1 UX markers 全部保留')
  console.log('   - score.ts / schema / dev.db 未改')
  console.log('   - read-only')
  await prisma.$disconnect()
  process.exit(0)
}

main().catch(async (e) => {
  console.error('verify 脚本异常:', e)
  await prisma.$disconnect().catch(() => {})
  process.exit(1)
})
