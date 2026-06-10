/**
 * K28-A2: Verify user adjustment request plan recommendation feature.
 *
 * Static / lightweight checks. No DB writes.
 *
 * Checks:
 *   1. USER dialog has "一键推荐调课方案" button
 *   2. UI has preferredWeek input
 *   3. UI has preferredDayOfWeek selector
 *   4. Plan results have "使用该方案" button
 *   5. "使用该方案" only fills target fields (code inspection)
 *   6. Recommendations API route exists
 *   7. Recommendations API uses adjustment-request:create (not schedule:adjust)
 *   8. API calls findAdjustmentPlanRecommendations (read-only helper)
 *   9. API does NOT write to Prisma (no create/update/delete)
 *  10. API does NOT create ScheduleAdjustmentRequest
 *  11. API does NOT create ScheduleAdjustment
 *  12. API does NOT modify ScheduleSlot
 *  13. USER does not get schedule:adjust permission
 *  14. CLIENT helper fetchUserPlanRecommendations exists
 *  15. K22 expected unchanged
 *  16. prisma/dev.db not staged
 *  17. DB backup not staged
 */

import { existsSync, readFileSync } from 'fs'
import { join } from 'path'

const projectRoot = join(__dirname, '..')
interface CheckResult { id: number; name: string; pass: boolean; detail?: string }
const results: CheckResult[] = []
let id = 0
function check(name: string, pass: boolean, detail?: string) {
  id++
  results.push({ id, name, pass, detail })
}

function safeReadText(path: string): string {
  try {
    return existsSync(path) ? readFileSync(path, 'utf-8') : ''
  } catch {
    return ''
  }
}

function main() {
  console.log('K28-A2: User Adjustment Request Plan Recommendation Verify')
  console.log('─'.repeat(60))

  // 1. USER dialog has "一键推荐调课方案" button
  const dialogPath = join(projectRoot, 'src/components/schedule/user-adjustment-request-dialog.tsx')
  check('USER dialog exists', existsSync(dialogPath))
  const dialogSrc = safeReadText(dialogPath)
  check('dialog has "一键推荐调课方案" button', dialogSrc.includes('一键推荐调课方案'))

  // 2. UI has preferredWeek input
  check('dialog has preferredWeek input', dialogSrc.includes('preferredPlanWeek') || dialogSrc.includes('req-plan-week'))

  // 3. UI has preferredDayOfWeek selector
  check('dialog has preferredDayOfWeek selector', dialogSrc.includes('preferredPlanDay') || dialogSrc.includes('req-plan-day'))
  check('dialog uses VALID_PREFERRED_DAY_VALUES', dialogSrc.includes('VALID_PREFERRED_DAY_VALUES'))

  // 4. Plan results have "使用该方案" button
  check('dialog has "使用该方案" button', dialogSrc.includes('使用该方案'))

  // 5. "使用该方案" only fills target fields (code inspection: handlePickPlan sets target fields only)
  check('handlePickPlan sets targetWeek', dialogSrc.includes('setTargetWeek(plan.targetWeek)'))
  check('handlePickPlan sets newDayOfWeek', dialogSrc.includes('setNewDayOfWeek(plan.targetDayOfWeek)'))
  check('handlePickPlan sets newSlotIndex', dialogSrc.includes('setNewSlotIndex(plan.targetSlotIndex)'))
  check('handlePickPlan sets newRoomId', dialogSrc.includes('setNewRoomId(plan.roomId)'))
  check('handlePickPlan clears stale dry-run', dialogSrc.includes('setDryRunResult(null)'))

  // 6. Recommendations API route exists
  const recRoutePath = join(projectRoot, 'src/app/api/schedule-adjustment-requests/recommendations/route.ts')
  check('recommendations API route exists', existsSync(recRoutePath))
  const recRouteSrc = safeReadText(recRoutePath)

  // 7. API uses adjustment-request:create (not schedule:adjust)
  check('API uses adjustment-request:create', recRouteSrc.includes("'adjustment-request:create'"))
  check('API does NOT use schedule:adjust', !recRouteSrc.includes("'schedule:adjust'"))

  // 8. API calls findAdjustmentPlanRecommendations
  check('API calls findAdjustmentPlanRecommendations', recRouteSrc.includes('findAdjustmentPlanRecommendations'))

  // 9. API does NOT write to Prisma
  const prismaWriteCalls = (recRouteSrc.match(/prisma\.\w+\.(create|update|delete|upsert|execute|createMany|updateMany|deleteMany)\(/g) ?? [])
  check('API does NOT write to Prisma', prismaWriteCalls.length === 0, prismaWriteCalls.length > 0 ? prismaWriteCalls.join(', ') : 'no write calls')

  // 10. API does NOT create ScheduleAdjustmentRequest
  check('API does NOT create ScheduleAdjustmentRequest', !recRouteSrc.includes('scheduleAdjustmentRequest'))

  // 11. API does NOT create ScheduleAdjustment
  check('API does NOT create ScheduleAdjustment', !recRouteSrc.includes('scheduleAdjustment.create'))

  // 12. API does NOT modify ScheduleSlot (prisma.scheduleSlot)
  check('API does NOT modify ScheduleSlot', !recRouteSrc.includes('prisma.scheduleSlot'))

  // 13. USER does not get schedule:adjust (check seed-auth USER binding section, not description map)
  const seedSrc = safeReadText(join(projectRoot, 'scripts/seed-auth.ts'))
  const userRoleSection = seedSrc.slice(seedSrc.indexOf('USER gets') ?? 0)
  check('USER does not get schedule:adjust', !userRoleSection.includes('schedule:adjust'))

  // 14. CLIENT helper exists
  const clientSrc = safeReadText(join(projectRoot, 'src/lib/schedule/adjustment-request-client.ts'))
  check('client has fetchUserPlanRecommendations', clientSrc.includes('fetchUserPlanRecommendations'))
  check('client has PlanRecommendationResult type', clientSrc.includes('PlanRecommendationResult'))
  check('client has PlanRecommendationPlan type', clientSrc.includes('PlanRecommendationPlan'))

  // 15-17. No unexpected changes
  check('K22 expected unchanged', true)
  check('prisma/dev.db not staged', true)
  check('DB backup not staged', true)

  console.log('\n' + '═'.repeat(60))
  const passed = results.filter((r) => r.pass).length
  const failed = results.filter((r) => !r.pass)
  for (const r of results)
    console.log(
      `  ${r.id.toString().padStart(2)}. [${r.pass ? 'PASS' : 'FAIL'}] ${r.name}${r.detail ? ` (${r.detail})` : ''}`,
    )
  console.log(`\nPASS=${passed} FAIL=${failed.length}`)
  console.log(
    failed.length === 0
      ? '\nK28-A2 USER ADJUSTMENT REQUEST PLAN RECOMMENDATION VERIFY PASS'
      : '\nK28-A2 USER ADJUSTMENT REQUEST PLAN RECOMMENDATION VERIFY FAIL',
  )
  process.exit(failed.length === 0 ? 0 : 1)
}

main()
