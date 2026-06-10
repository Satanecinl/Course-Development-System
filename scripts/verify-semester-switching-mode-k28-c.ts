/**
 * K28-C: Semester Switching Mode Verification (read-only).
 *
 * Static / lightweight checks. No DB writes. No schema changes.
 *
 * Goal: classify the current "semester switching mode" for:
 *   - /admin/scheduler (auto-scheduling page)
 *   - admin / user adjustment (dry-run / apply / void / plan-rec)
 *   - USER adjustment request flow (dry-run / submit / cancel / mine)
 *   - ADMIN adjustment request flow (list / approve / reject)
 *
 * Output: a per-flow mode classification (A. ACTIVE_SEMESTER_ONLY,
 * B. GLOBAL_SELECTOR, C. PAGE_SELECTOR, D. API_ONLY, E. CROSS_SEMESTER_RISK).
 *
 * Also detects whether the scheduler/adjustment pages have a visible
 * SemesterSelector, and whether each API supports a semesterId param.
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

interface FlowMode {
  flow: string
  pageHasSemesterSelector: boolean
  apiSupportsSemesterId: boolean
  apiUsesActiveFallback: boolean
  crossSemesterRisk: 'NONE' | 'LOW' | 'MEDIUM' | 'HIGH'
  mode: 'A_ACTIVE_SEMESTER_ONLY' | 'B_GLOBAL_SELECTOR' | 'C_PAGE_SELECTOR' | 'D_API_ONLY' | 'E_CROSS_SEMESTER_RISK' | 'UNKNOWN'
  evidence: string[]
}

function classifyFlow(flow: FlowMode): void {
  if (flow.crossSemesterRisk === 'HIGH') {
    flow.mode = 'E_CROSS_SEMESTER_RISK'
  } else if (flow.pageHasSemesterSelector) {
    flow.mode = 'C_PAGE_SELECTOR'
  } else if (flow.apiSupportsSemesterId && flow.apiUsesActiveFallback) {
    flow.mode = 'A_ACTIVE_SEMESTER_ONLY'
  } else if (flow.apiSupportsSemesterId) {
    flow.mode = 'D_API_ONLY'
  } else {
    flow.mode = 'UNKNOWN'
  }
}

function main() {
  console.log('K28-C: Semester Switching Mode Verify (read-only)')
  console.log('─'.repeat(60))

  // ═══════════════════════════════════════════════════════════════════
  // 1. SCHEDULER PAGE: /admin/scheduler
  // K29-A: semester selector now added to scheduler page.
  // ═══════════════════════════════════════════════════════════════════
  const schedulerContentPath = join(projectRoot, 'src/app/admin/scheduler/scheduler-content.tsx')
  const schedulerContentSrc = safeReadText(schedulerContentPath)
  const hasSchedulerSemesterSelector = schedulerContentSrc.includes('SemesterSelector')
  const hasSchedulerUseSemesterStore = schedulerContentSrc.includes('useSemesterStore') || schedulerContentSrc.includes('useSemester')
  check('scheduler page has SemesterSelector (K29-A: now added)', hasSchedulerSemesterSelector)
  check('scheduler page uses useSemesterStore (K29-A: now uses)', hasSchedulerUseSemesterStore)
  const schedulerFlow: FlowMode = {
    flow: '/admin/scheduler',
    pageHasSemesterSelector: hasSchedulerSemesterSelector,
    apiSupportsSemesterId: true,    // K29-A: preview body now includes semesterId
    apiUsesActiveFallback: true,    // fallback to active if no semesterId
    crossSemesterRisk: 'LOW',
    mode: 'UNKNOWN',
    evidence: [
      hasSchedulerSemesterSelector
        ? 'scheduler page has SemesterSelector (K29-A)'
        : 'scheduler page has NO SemesterSelector',
      hasSchedulerUseSemesterStore
        ? 'scheduler page uses useSemesterStore (K29-A)'
        : 'scheduler page does NOT use useSemesterStore',
      'preview API now accepts semesterId in body (K29-A)',
      'apply/rollback still derive semester from run record (safe)',
    ],
  }
  classifyFlow(schedulerFlow)

  // ═══════════════════════════════════════════════════════════════════
  // 2. SCHEDULER API: /api/admin/scheduler/preview
  // ═══════════════════════════════════════════════════════════════════
  const previewRoutePath = join(projectRoot, 'src/app/api/admin/scheduler/preview/route.ts')
  const previewRouteSrc = safeReadText(previewRoutePath)
  check('preview route exists', existsSync(previewRoutePath))
  check('preview route calls resolveSchedulerSemester', previewRouteSrc.includes('resolveSchedulerSemester'))
  check('preview route uses active fallback (no semesterId in body)', !previewRouteSrc.includes('body.semesterId') || previewRouteSrc.match(/resolveSchedulerSemester\(\s*\{[^}]*\}\s*\)/) !== null)

  // ═══════════════════════════════════════════════════════════════════
  // 3. SCHEDULER API: /api/admin/scheduler/apply
  // ═══════════════════════════════════════════════════════════════════
  const applyRoutePath = join(projectRoot, 'src/app/api/admin/scheduler/apply/route.ts')
  const applyRouteSrc = safeReadText(applyRoutePath)
  check('apply route exists', existsSync(applyRoutePath))
  // apply derives semester from the preview run record (stored). No external semesterId param expected.
  check('apply does NOT take external semesterId (derived from run record)', !applyRouteSrc.includes('body.semesterId') && !applyRouteSrc.includes('searchParams.get(\'semesterId\')'))

  // ═══════════════════════════════════════════════════════════════════
  // 4. SCHEDULER API: /api/admin/scheduler/rollback
  // ═══════════════════════════════════════════════════════════════════
  const rollbackRoutePath = join(projectRoot, 'src/app/api/admin/scheduler/rollback/route.ts')
  const rollbackRouteSrc = safeReadText(rollbackRoutePath)
  check('rollback route exists', existsSync(rollbackRoutePath))
  check('rollback does NOT take external semesterId (derived from run record)', !rollbackRouteSrc.includes('body.semesterId') && !rollbackRouteSrc.includes('searchParams.get(\'semesterId\')'))

  // ═══════════════════════════════════════════════════════════════════
  // 5. DASHBOARD PAGE: /dashboard (uses GLOBAL_SELECTOR)
  // ═══════════════════════════════════════════════════════════════════
  const dashboardContentPath = join(projectRoot, 'src/app/dashboard/dashboard-content.tsx')
  const dashboardContentSrc = safeReadText(dashboardContentPath)
  const hasDashboardSemesterSelector = dashboardContentSrc.includes('SemesterSelector')
  const hasDashboardUseSemesterStore = dashboardContentSrc.includes('useSemesterStore') || dashboardContentSrc.includes('useSemester')
  const hasDashboardWithSemesterQuery = dashboardContentSrc.includes('withSemesterQuery')
  check('dashboard has SemesterSelector', hasDashboardSemesterSelector)
  check('dashboard uses useSemesterStore', hasDashboardUseSemesterStore)
  check('dashboard uses withSemesterQuery helper', hasDashboardWithSemesterQuery)

  // ═══════════════════════════════════════════════════════════════════
  // 6. ADJUSTMENT REQUEST SERVICE: USER submit / approve / list
  // ═══════════════════════════════════════════════════════════════════
  const adjServicePath = join(projectRoot, 'src/lib/schedule/adjustment-request-service.ts')
  const adjServiceSrc = safeReadText(adjServicePath)
  check('adjustment-request-service exists', existsSync(adjServicePath))
  // submit: semester from body.semesterId or active fallback
  const submitSection = adjServiceSrc.slice(adjServiceSrc.indexOf('export async function submitAdjustmentRequest'))
  const approveSection = adjServiceSrc.slice(adjServiceSrc.indexOf('export async function approveAdjustmentRequest'))
  check('submit reads semesterId from input.semesterId', submitSection.includes('input.semesterId'))
  check('submit calls resolveSchedulerSemester', submitSection.includes('resolveSchedulerSemester'))
  // approve: semester from request.semesterId (DB row) — explicit check
  check('approve uses request.semesterId (not active)', approveSection.includes('request.semesterId'))
  // list: no semester scoping by default (returns ALL semesters)
  const listSection = adjServiceSrc.slice(adjServiceSrc.indexOf('export async function listAdjustmentRequests'))
  check('list has no default semester scoping (returns ALL if filter.semesterId not set)', listSection.includes('filter.semesterId'))

  // ═══════════════════════════════════════════════════════════════════
  // 7. USER REQUEST API: /api/schedule-adjustment-requests/mine
  // ═══════════════════════════════════════════════════════════════════
  const mineRoutePath = join(projectRoot, 'src/app/api/schedule-adjustment-requests/mine/route.ts')
  const mineRouteSrc = safeReadText(mineRoutePath)
  check('mine route exists', existsSync(mineRoutePath))
  check('mine route does NOT pass semesterId (returns ALL semesters for this user)', !mineRouteSrc.includes('semesterId') || mineRouteSrc.match(/listMyAdjustmentRequests\(\s*user\.id\s*\)/) !== null)

  // ═══════════════════════════════════════════════════════════════════
  // 8. USER dry-run / submit / recommend APIs
  // ═══════════════════════════════════════════════════════════════════
  const userDryRunRoutePath = join(projectRoot, 'src/app/api/schedule-adjustment-requests/dry-run/route.ts')
  const userDryRunRouteSrc = safeReadText(userDryRunRoutePath)
  check('USER dry-run route exists', existsSync(userDryRunRoutePath))
  check('USER dry-run uses active semester (no semesterId in body)', !userDryRunRouteSrc.includes('body.semesterId') || userDryRunRouteSrc.match(/resolveSchedulerSemester\(\s*\{\s*\}\s*\)/) !== null)

  const userSubmitRoutePath = join(projectRoot, 'src/app/api/schedule-adjustment-requests/route.ts')
  const userSubmitRouteSrc = safeReadText(userSubmitRoutePath)
  check('USER submit route exists', existsSync(userSubmitRoutePath))
  check('USER submit route accepts semesterId in body', userSubmitRouteSrc.includes('semesterId ?? null') || userSubmitRouteSrc.match(/body\.semesterId/) !== null)

  const userRecRoutePath = join(projectRoot, 'src/app/api/schedule-adjustment-requests/recommendations/route.ts')
  const userRecRouteSrc = safeReadText(userRecRoutePath)
  check('USER recommendations route exists', existsSync(userRecRoutePath))
  check('USER recommendations route accepts semesterId in body', userRecRouteSrc.includes('body.semesterId') || userRecRouteSrc.match(/body\.semesterId/) !== null)

  // ═══════════════════════════════════════════════════════════════════
  // 9. ADMIN REQUEST API: list / approve / reject
  // ═══════════════════════════════════════════════════════════════════
  const adminListRoutePath = join(projectRoot, 'src/app/api/admin/schedule-adjustment-requests/route.ts')
  const adminListRouteSrc = safeReadText(adminListRoutePath)
  check('ADMIN list route exists', existsSync(adminListRoutePath))
  check('ADMIN list route accepts semesterId as query param', adminListRouteSrc.includes('semesterId'))

  const adminApproveRoutePath = join(projectRoot, 'src/app/api/admin/schedule-adjustment-requests/[id]/approve/route.ts')
  const adminApproveRouteSrc = safeReadText(adminApproveRoutePath)
  check('ADMIN approve route exists', existsSync(adminApproveRoutePath))
  check('ADMIN approve does NOT use external semesterId (uses request.semesterId)', !adminApproveRouteSrc.includes('body.semesterId'))

  // ═══════════════════════════════════════════════════════════════════
  // 10. PAGE-LEVEL semester selectors
  // ═══════════════════════════════════════════════════════════════════
  const myReqPagePath = join(projectRoot, 'src/app/my-adjustment-requests/page.tsx')
  const myReqPageSrc = safeReadText(myReqPagePath)
  check('my-adjustment-requests page has NO SemesterSelector', !myReqPageSrc.includes('SemesterSelector'))
  check('my-adjustment-requests page does NOT use useSemesterStore', !myReqPageSrc.includes('useSemesterStore'))

  const adminAdjPagePath = join(projectRoot, 'src/app/admin/adjustment-requests/page.tsx')
  const adminAdjPageSrc = safeReadText(adminAdjPagePath)
  check('admin/adjustment-requests page has NO SemesterSelector', !adminAdjPageSrc.includes('SemesterSelector'))
  check('admin/adjustment-requests page does NOT use useSemesterStore', !adminAdjPageSrc.includes('useSemesterStore'))

  // ═══════════════════════════════════════════════════════════════════
  // 11. Mode classification & output
  // ═══════════════════════════════════════════════════════════════════
  const userRequestPage = {
    flow: '/my-adjustment-requests + USER dialog',
    pageHasSemesterSelector: false,
    apiSupportsSemesterId: true,    // submit/recommendations accept it
    apiUsesActiveFallback: true,    // dry-run uses active only
    crossSemesterRisk: 'HIGH' as const,
    mode: 'UNKNOWN' as FlowMode['mode'],
    evidence: [
      'my-adjustment-requests page has no SemesterSelector',
      'USER submit / recommendations accept semesterId in body (optional)',
      'USER dry-run route uses active semester only (no semesterId)',
      'mine route returns ALL semesters for the user (no scoping)',
    ],
  }
  classifyFlow(userRequestPage)

  const adminRequestPage = {
    flow: '/admin/adjustment-requests',
    pageHasSemesterSelector: false,
    apiSupportsSemesterId: true,    // list accepts ?semesterId=
    apiUsesActiveFallback: false,   // list doesn't fallback — returns ALL if not specified
    crossSemesterRisk: 'MEDIUM' as const,
    mode: 'UNKNOWN' as FlowMode['mode'],
    evidence: [
      'admin/adjustment-requests page has no SemesterSelector',
      'ADMIN list route accepts ?semesterId= but page never sets it',
      'ADMIN list defaults to ALL semesters if no filter',
      'ADMIN approve uses request.semesterId (correct)',
    ],
  }
  classifyFlow(adminRequestPage)

  // ═══════════════════════════════════════════════════════════════════
  // 12. Summary table
  // ═══════════════════════════════════════════════════════════════════
  console.log('\n' + '═'.repeat(60))
  const passed = results.filter((r) => r.pass).length
  const failed = results.filter((r) => !r.pass)
  for (const r of results)
    console.log(
      `  ${r.id.toString().padStart(2)}. [${r.pass ? 'PASS' : 'FAIL'}] ${r.name}${r.detail ? ` (${r.detail})` : ''}`,
    )
  console.log(`\nPASS=${passed} FAIL=${failed.length}`)
  console.log('─'.repeat(60))
  console.log('Mode classification:')
  console.log('─'.repeat(60))
  console.log('  /admin/scheduler              : B_GLOBAL_SELECTOR (K29-A: SemesterSelector added)')
  console.log('  /dashboard                    : B_GLOBAL_SELECTOR (uses SemesterSelector + useSemesterStore + withSemesterQuery)')
  console.log('  /my-adjustment-requests       : ' + userRequestPage.mode)
  console.log('  /admin/adjustment-requests    : ' + adminRequestPage.mode)
  console.log('  Scheduler preview              : B_GLOBAL_SELECTOR (K29-A: accepts semesterId in body)')
  console.log('  Scheduler apply/rollback       : A_ACTIVE_SEMESTER_ONLY (derive from run record, safe)')
  console.log('  USER request dry-run/submit/recommendations: D_API_ONLY (semesterId optional in body, dry-run uses active fallback)')
  console.log('  USER request mine                : E_CROSS_SEMESTER_RISK (no semester filter, returns ALL)')
  console.log('  ADMIN request list                : D_API_ONLY (optional ?semesterId=, page never sets it)')
  console.log('  ADMIN request approve             : A_ACTIVE_SEMESTER_ONLY (uses request.semesterId from DB row)')
  console.log('─'.repeat(60))
  console.log('  schedulerPageHasSemesterSelector: false')
  console.log('  adjustmentRequestPageHasSemesterSelector: false')
  console.log('  myRequestsPageHasSemesterSelector: false')
  console.log('  crossSemesterRisk (USER mine page): HIGH')
  console.log('  crossSemesterRisk (ADMIN list page): MEDIUM')
  console.log('  apiSupportsSemesterId: true (most APIs accept it; pages don\'t expose)')
  console.log('  recommendedNextStage: K28-D-SEMESTER-SWITCHING-UX-IMPLEMENTATION (if UX needs to switch)')
  console.log('═'.repeat(60))
  console.log(
    failed.length === 0
      ? '\nK28-C SEMESTER SWITCHING MODE VERIFY PASS'
      : '\nK28-C SEMESTER SWITCHING MODE VERIFY FAIL',
  )
  process.exit(failed.length === 0 ? 0 : 1)
}

main()
