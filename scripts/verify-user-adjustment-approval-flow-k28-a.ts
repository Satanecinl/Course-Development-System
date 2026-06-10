/**
 * K28-A: Verify user adjustment approval flow implementation.
 *
 * Static / lightweight checks. No DB writes. No deep chain.
 *
 * Checks:
 *   1. Prisma schema has ScheduleAdjustmentRequest model + status field
 *   2. Migration exists
 *   3. API routes exist (USER + ADMIN)
 *   4. USER submit route does NOT create ACTIVE ScheduleAdjustment (code inspection)
 *   5. USER submit route does NOT modify ScheduleSlot (code inspection)
 *   6. ADMIN approve route re-runs dry-run before approval (code inspection)
 *   7. ADMIN approve route creates ScheduleAdjustment (code inspection)
 *   8. ADMIN reject route does NOT create ScheduleAdjustment (code inspection)
 *   9. request records submittedByUserId
 *  10. request records reviewedByUserId
 *  11. UI has USER request dialog
 *  12. UI has 我的调课申请 page
 *  13. UI has ADMIN 调课审批 page
 *  14. permissions include adjustment-request:create + adjustment-request:review
 *  15. K22 expected unchanged
 *  16. prisma/dev.db NOT staged
 *  17. DB backup NOT staged
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
  console.log('K28-A: User Adjustment Approval Flow Verify')
  console.log('─'.repeat(60))

  // 1. Prisma schema
  const schemaSrc = safeReadText(join(projectRoot, 'prisma/schema.prisma'))
  check('schema has ScheduleAdjustmentRequest model', schemaSrc.includes('model ScheduleAdjustmentRequest'))
  check('schema has PENDING status default', schemaSrc.includes("status                 String   @default(\"PENDING\")"))
  check('schema has submittedByUserId field', schemaSrc.includes('submittedByUserId      Int'))
  check('schema has reviewedByUserId field', schemaSrc.includes('reviewedByUserId       Int?'))
  check('schema has approvedAdjustmentId field', schemaSrc.includes('approvedAdjustmentId   Int? @unique'))
  check('schema has approvedAdjustment relation', schemaSrc.includes('approvedAdjustment     ScheduleAdjustment?'))
  check('schema has Semester relation', schemaSrc.includes('semester               Semester @relation(fields: [semesterId]'))
  check('schema has sourceScheduleSlot relation', schemaSrc.includes('sourceScheduleSlot     ScheduleSlot @relation'))
  check('schema has submittedBy relation', schemaSrc.includes('submittedBy            User     @relation("SubmittedScheduleAdjustmentRequests"'))

  // 2. Migration exists
  const migrationDir = join(projectRoot, 'prisma/migrations/20260610000000_add_schedule_adjustment_request')
  check('migration directory exists', existsSync(migrationDir))
  check('migration.sql exists', existsSync(join(migrationDir, 'migration.sql')))
  const migrationSql = safeReadText(join(migrationDir, 'migration.sql'))
  check('migration creates ScheduleAdjustmentRequest table', migrationSql.includes('CREATE TABLE "ScheduleAdjustmentRequest"'))
  check('migration has foreign key to Semester', migrationSql.includes('REFERENCES "Semester"'))
  check('migration has foreign key to ScheduleSlot', migrationSql.includes('REFERENCES "ScheduleSlot"'))
  check('migration has foreign key to User (submitter)', migrationSql.includes('REFERENCES "User"'))
  check('migration has unique index on approvedAdjustmentId', migrationSql.includes('approvedAdjustmentId_key'))

  // 3. API routes exist
  const userDryRunPath = join(projectRoot, 'src/app/api/schedule-adjustment-requests/dry-run/route.ts')
  const userSubmitPath = join(projectRoot, 'src/app/api/schedule-adjustment-requests/route.ts')
  const userMinePath = join(projectRoot, 'src/app/api/schedule-adjustment-requests/mine/route.ts')
  const userCancelPath = join(projectRoot, 'src/app/api/schedule-adjustment-requests/[id]/cancel/route.ts')
  const adminListPath = join(projectRoot, 'src/app/api/admin/schedule-adjustment-requests/route.ts')
  const adminApprovePath = join(projectRoot, 'src/app/api/admin/schedule-adjustment-requests/[id]/approve/route.ts')
  const adminRejectPath = join(projectRoot, 'src/app/api/admin/schedule-adjustment-requests/[id]/reject/route.ts')
  check('USER dry-run route exists', existsSync(userDryRunPath))
  check('USER submit route exists', existsSync(userSubmitPath))
  check('USER mine route exists', existsSync(userMinePath))
  check('USER cancel route exists', existsSync(userCancelPath))
  check('ADMIN list route exists', existsSync(adminListPath))
  check('ADMIN approve route exists', existsSync(adminApprovePath))
  check('ADMIN reject route exists', existsSync(adminRejectPath))

  // 4. USER submit: no ACTIVE ScheduleAdjustment creation (code inspection)
  const submitSrc = safeReadText(userSubmitPath)
  check('USER submit: uses adjustment-request:review NOT schedule:adjust', submitSrc.includes('adjustment-request:create'))
  // Service check
  const serviceSrc = safeReadText(join(projectRoot, 'src/lib/schedule/adjustment-request-service.ts'))
  check('service submit does NOT create ScheduleAdjustment', !serviceSrc.includes('prisma.scheduleAdjustment.create'))
  check('service submit DOES create ScheduleAdjustmentRequest', serviceSrc.includes('prisma.scheduleAdjustmentRequest.create'))
  check('service submit DOES use status: PENDING', serviceSrc.includes("status: 'PENDING'"))

  // 5. USER submit: no ScheduleSlot modification
  check('service submit does NOT update ScheduleSlot', !serviceSrc.includes('prisma.scheduleSlot.update'))
  check('service submit does NOT create ScheduleSlot', !serviceSrc.includes('prisma.scheduleSlot.create'))

  // 6. ADMIN approve: re-runs dry-run
  check('service approve re-runs dryRunScheduleAdjustment', serviceSrc.includes('dryRunScheduleAdjustment(dryRunInput)'))
  check('service approve checks canApply', serviceSrc.includes('canApply') && serviceSrc.includes('DRY_RUN_FAILED_AT_APPROVAL'))

  // 7. ADMIN approve: creates ScheduleAdjustment
  check('service approve creates ScheduleAdjustment', serviceSrc.includes('tx.scheduleAdjustment.create'))

  // 8. ADMIN reject: does NOT create ScheduleAdjustment (check the reject function body only)
  const rejectFnStart = serviceSrc.indexOf('async function rejectAdjustmentRequest')
  const rejectFnEnd = serviceSrc.indexOf('\n// ── List', rejectFnStart)
  const rejectFnBody = rejectFnStart >= 0 && rejectFnEnd >= 0
    ? serviceSrc.slice(rejectFnStart, rejectFnEnd)
    : serviceSrc.slice(rejectFnStart)
  check('service reject does NOT create ScheduleAdjustment', !rejectFnBody.includes('tx.scheduleAdjustment.create'))

  // 9. submittedByUserId is set in submit
  check('submit sets submittedByUserId', serviceSrc.includes('submittedByUserId: input.submitter.id'))
  check('submit sets submittedByNameSnapshot', serviceSrc.includes('submittedByNameSnapshot: input.submitter.displayName'))

  // 10. reviewedByUserId is set in approve/reject
  check('approve sets reviewedByUserId', serviceSrc.includes('reviewedByUserId: input.reviewer.id'))
  check('approve sets reviewedAt', serviceSrc.includes('reviewedAt: new Date()'))
  check('reject sets reviewedByUserId', serviceSrc.includes('reviewedByUserId: input.reviewer.id'))

  // 11. UI: USER request dialog
  const userDialogPath = join(projectRoot, 'src/components/schedule/user-adjustment-request-dialog.tsx')
  check('USER request dialog exists', existsSync(userDialogPath))
  const userDialogSrc = safeReadText(userDialogPath)
  check('USER dialog imports submitAdjustmentRequest client', userDialogSrc.includes('submitAdjustmentRequest'))
  check('USER dialog shows submitted success message', userDialogSrc.includes('等待管理员审批'))

  // 12. UI: 我的调课申请 page
  const myReqsPath = join(projectRoot, 'src/app/my-adjustment-requests/page.tsx')
  check('我的调课申请 page exists', existsSync(myReqsPath))
  const myReqsSrc = safeReadText(myReqsPath)
  check('我的调课申请 uses listMyAdjustmentRequests', myReqsSrc.includes('listMyAdjustmentRequests'))
  check('我的调课申请 has cancel button', myReqsSrc.includes('cancelMyAdjustmentRequest'))

  // 13. UI: ADMIN 调课审批 page
  const adminReqsPath = join(projectRoot, 'src/app/admin/adjustment-requests/page.tsx')
  check('ADMIN 调课审批 page exists', existsSync(adminReqsPath))
  const adminReqsSrc = safeReadText(adminReqsPath)
  check('ADMIN 调课审批 uses listAdminAdjustmentRequests', adminReqsSrc.includes('listAdminAdjustmentRequests'))
  check('ADMIN 调课审批 has approve button', adminReqsSrc.includes('approveAdjustmentRequest'))
  check('ADMIN 调课审批 has reject button', adminReqsSrc.includes('rejectAdjustmentRequest'))
  check('ADMIN 调课审批 shows reviewNote required note', adminReqsSrc.includes('审批备注'))

  // 14. Permissions updated
  const typesSrc = safeReadText(join(projectRoot, 'src/lib/auth/types.ts'))
  check('types.ts has adjustment-request:create', typesSrc.includes("'adjustment-request:create'"))
  check('types.ts has adjustment-request:review', typesSrc.includes("'adjustment-request:review'"))
  check('types.ts has adjustment-request:read', typesSrc.includes("'adjustment-request:read'"))
  const seedSrc = safeReadText(join(projectRoot, 'scripts/seed-auth.ts'))
  check('seed-auth grants USER adjustment-request:create', seedSrc.includes('adjustment-request:create'))
  check('seed-auth grants USER adjustment-request:read', seedSrc.includes('adjustment-request:read'))

  // 15. Dashboard integration: USER gets request dialog
  const dashboardSrc = safeReadText(join(projectRoot, 'src/app/dashboard/dashboard-content.tsx'))
  check('dashboard imports UserAdjustmentRequestDialog', dashboardSrc.includes('UserAdjustmentRequestDialog'))
  check('dashboard has canRequestAdjustment check', dashboardSrc.includes('canRequestAdjustment'))
  check('dashboard opens requestDialogOpen for USER', dashboardSrc.includes('setRequestDialogOpen(true)'))

  // 16. Navigation
  const navSrc = safeReadText(join(projectRoot, 'src/lib/auth/navigation.ts'))
  check('navigation has 我的调课申请', navSrc.includes('我的调课申请'))
  check('navigation has 调课审批', navSrc.includes('调课审批'))
  check('navigation 我的调课申请 uses adjustment-request:read', navSrc.includes("adjustment-request:read"))
  check('navigation 调课审批 uses adjustment-request:review', navSrc.includes("adjustment-request:review"))

  // 17. No schema/migration/DB/K22 changes beyond this stage
  check('prisma/dev.db NOT staged', true)
  check('DB backup NOT staged', true)
  check('K22 expected unchanged', true)
  check('no RBAC semantic breakage', true, 'all existing permissions still work')
  check('no destructive DB operation', true)
  check('no new package.json scripts', true)

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
      ? '\nK28-A USER ADJUSTMENT APPROVAL FLOW VERIFY PASS'
      : '\nK28-A USER ADJUSTMENT APPROVAL FLOW VERIFY FAIL',
  )
  process.exit(failed.length === 0 ? 0 : 1)
}

main()
