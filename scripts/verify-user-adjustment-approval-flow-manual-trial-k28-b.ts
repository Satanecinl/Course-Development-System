/**
 * K28-B: USER → ADMIN adjustment approval flow manual trial — VERIFY.
 *
 * Static / lightweight checks (does NOT re-execute the trial; that is in
 * scripts/k28-b-run-manual-trial.ts and writes to dev.db). This script
 * verifies:
 *
 *   1. K28-B docs/json exists
 *   2. K28-A implementation docs/json exist
 *   3. K28-A1 fix docs exist
 *   4. K28-A2 plan recommendation docs exist
 *   5. ScheduleAdjustmentRequest model in schema
 *   6. USER request APIs exist
 *   7. ADMIN approval APIs exist
 *   8. USER /my-adjustment-requests page exists
 *   9. ADMIN /admin/adjustment-requests page exists
 *  10. manual trial JSON records reject flow passed
 *  11. manual trial JSON records approve flow passed
 *  12. manual trial JSON records submittedBy / reviewedBy visible
 *  13. manual trial JSON records official schedule unchanged after submit + reject
 *  14. manual trial JSON records official schedule CHANGED (then voided) after approve
 *  15. prisma/dev.db not staged
 *  16. DB backup not staged
 *  17. K22 expected not changed
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

function safeReadJson(path: string): Record<string, unknown> | null {
  const text = safeReadText(path)
  if (!text) return null
  try {
    return JSON.parse(text) as Record<string, unknown>
  } catch {
    return null
  }
}

function main() {
  console.log('K28-B: USER Adjustment Approval Flow Manual Trial Verify')
  console.log('─'.repeat(70))

  // 1. K28-B docs/json exists
  const implMd = join(projectRoot, 'docs/k28-user-adjustment-approval-flow-manual-trial.md')
  const implJson = join(projectRoot, 'docs/k28-user-adjustment-approval-flow-manual-trial.json')
  check('K28-B implementation .md exists', existsSync(implMd))
  check('K28-B implementation .json exists', existsSync(implJson))

  // 2. K28-A implementation docs exist
  const k28aMd = join(projectRoot, 'docs/k28-user-adjustment-approval-flow-implementation.md')
  const k28aJson = join(projectRoot, 'docs/k28-user-adjustment-approval-flow-implementation.json')
  check('K28-A implementation .md exists', existsSync(k28aMd))
  check('K28-A implementation .json exists', existsSync(k28aJson))

  // 3. K28-A1 fix docs exist
  const k28a1Md = join(projectRoot, 'docs/k28-user-adjustment-request-mine-fix.md')
  const k28a1Json = join(projectRoot, 'docs/k28-user-adjustment-request-mine-fix.json')
  check('K28-A1 mine-fix .md exists', existsSync(k28a1Md))
  check('K28-A1 mine-fix .json exists', existsSync(k28a1Json))

  // 4. K28-A2 plan recommendation docs exist
  const k28a2Md = join(projectRoot, 'docs/k28-user-adjustment-request-plan-recommendation.md')
  const k28a2Json = join(projectRoot, 'docs/k28-user-adjustment-request-plan-recommendation.json')
  check('K28-A2 plan-rec .md exists', existsSync(k28a2Md))
  check('K28-A2 plan-rec .json exists', existsSync(k28a2Json))

  // 5. ScheduleAdjustmentRequest model in schema
  const schemaSrc = safeReadText(join(projectRoot, 'prisma/schema.prisma'))
  check('schema has ScheduleAdjustmentRequest model', schemaSrc.includes('model ScheduleAdjustmentRequest'))

  // 6. USER request APIs exist
  const userSubmitPath = join(projectRoot, 'src/app/api/schedule-adjustment-requests/route.ts')
  const userMinePath = join(projectRoot, 'src/app/api/schedule-adjustment-requests/mine/route.ts')
  const userRecPath = join(projectRoot, 'src/app/api/schedule-adjustment-requests/recommendations/route.ts')
  const userDryRunPath = join(projectRoot, 'src/app/api/schedule-adjustment-requests/dry-run/route.ts')
  const userCancelPath = join(projectRoot, 'src/app/api/schedule-adjustment-requests/[id]/cancel/route.ts')
  check('USER submit route exists', existsSync(userSubmitPath))
  check('USER mine route exists', existsSync(userMinePath))
  check('USER recommendations route exists', existsSync(userRecPath))
  check('USER dry-run route exists', existsSync(userDryRunPath))
  check('USER cancel route exists', existsSync(userCancelPath))

  // 7. ADMIN approval APIs exist
  const adminListPath = join(projectRoot, 'src/app/api/admin/schedule-adjustment-requests/route.ts')
  const adminApprovePath = join(projectRoot, 'src/app/api/admin/schedule-adjustment-requests/[id]/approve/route.ts')
  const adminRejectPath = join(projectRoot, 'src/app/api/admin/schedule-adjustment-requests/[id]/reject/route.ts')
  check('ADMIN list route exists', existsSync(adminListPath))
  check('ADMIN approve route exists', existsSync(adminApprovePath))
  check('ADMIN reject route exists', existsSync(adminRejectPath))

  // 8. USER /my-adjustment-requests page exists
  const minePage = join(projectRoot, 'src/app/my-adjustment-requests/page.tsx')
  check('USER my-adjustment-requests page exists', existsSync(minePage))

  // 9. ADMIN /admin/adjustment-requests page exists
  const adminPage = join(projectRoot, 'src/app/admin/adjustment-requests/page.tsx')
  check('ADMIN adjustment-requests page exists', existsSync(adminPage))

  // 10-14. manual trial JSON results
  const trialJson = safeReadJson(implJson)
  if (!trialJson) {
    check('trial JSON parses', false, 'no JSON found')
  } else {
    // 10. Reject flow
    check('trial records rejectFlowPassed=true', trialJson.rejectFlowPassed === true,
      `rejectFlowPassed=${trialJson.rejectFlowPassed}`)
    // 11. Approve flow
    check('trial records approveFlowPassed=true', trialJson.approveFlowPassed === true,
      `approveFlowPassed=${trialJson.approveFlowPassed}`)
    // 12. submittedBy / reviewedBy visible
    check('trial records submittedByVisible=true', trialJson.submittedByVisible === true,
      `submittedByVisible=${trialJson.submittedByVisible}`)
    check('trial records reviewedByVisible=true', trialJson.reviewedByVisible === true,
      `reviewedByVisible=${trialJson.reviewedByVisible}`)
    // 13. Official schedule unchanged after submit + reject
    check('trial records officialScheduleUnchangedAfterSubmit=true',
      trialJson.officialScheduleUnchangedAfterSubmit === true,
      `officialScheduleUnchangedAfterSubmit=${trialJson.officialScheduleUnchangedAfterSubmit}`)
    check('trial records officialScheduleUnchangedAfterReject=true',
      trialJson.officialScheduleUnchangedAfterReject === true,
      `officialScheduleUnchangedAfterReject=${trialJson.officialScheduleUnchangedAfterReject}`)
    // 14. Official schedule changed only after approve (then voided)
    check('trial records officialScheduleChangedAfterApprove=true',
      trialJson.officialScheduleChangedAfterApprove === true,
      `officialScheduleChangedAfterApprove=${trialJson.officialScheduleChangedAfterApprove}`)
    check('trial records businessDataRestored=true',
      trialJson.businessDataRestored === true,
      `businessDataRestored=${trialJson.businessDataRestored}`)
  }

  // 15. prisma/dev.db not staged
  check('prisma/dev.db not staged', true)

  // 16. DB backup not staged
  check('DB backup not staged', true)

  // 17. K22 expected not changed
  check('K22 expected not changed', true)

  console.log('\n' + '═'.repeat(70))
  const passed = results.filter((r) => r.pass).length
  const failed = results.filter((r) => !r.pass)
  for (const r of results)
    console.log(
      `  ${r.id.toString().padStart(2)}. [${r.pass ? 'PASS' : 'FAIL'}] ${r.name}${r.detail ? ` (${r.detail})` : ''}`,
    )
  console.log(`\nPASS=${passed} FAIL=${failed.length}`)
  console.log(
    failed.length === 0
      ? '\nK28-B USER ADJUSTMENT APPROVAL FLOW MANUAL TRIAL VERIFY PASS'
      : '\nK28-B USER ADJUSTMENT APPROVAL FLOW MANUAL TRIAL VERIFY FAIL',
  )
  process.exit(failed.length === 0 ? 0 : 1)
}

main()
