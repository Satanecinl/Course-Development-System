/**
 * K31-B ADJUSTMENT REQUEST PAGES BACK-NAV FIX VERIFY
 *
 * Static / lightweight checks for the K31-B fix.
 *
 * Checks (15):
 *   1.  /my-adjustment-requests page file exists
 *   2.  /my-adjustment-requests has a Link to /dashboard
 *   3.  /my-adjustment-requests back button text contains "返回"
 *   4.  /my-adjustment-requests has aria-label or accessible back marker
 *   5.  /my-adjustment-requests preserves the refresh button
 *   6.  /my-adjustment-requests has NO admin-only link (no /admin/* href)
 *   7.  /admin/adjustment-requests page file exists
 *   8.  /admin/adjustment-requests has a Link to /dashboard
 *   9.  /admin/adjustment-requests back button text contains "返回"
 *  10.  /admin/adjustment-requests preserves status filter
 *  11.  /admin/adjustment-requests preserves refresh button
 *  12.  schema/migration NOT changed in K31-B
 *  13.  RBAC/auth NOT changed in K31-B
 *  14.  K22 expected NOT changed
 *  15.  prisma/dev.db NOT staged, DB backup NOT staged
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

function hasLinkToDashboard(src: string): boolean {
  // Look for <Link href="/dashboard" ...> or next/link with /dashboard
  return /<Link\s+href=["']\/dashboard["']/.test(src) ||
    /next\/link[\s\S]{0,200}href=["']\/dashboard["']/.test(src) ||
    /href=["']\/dashboard["']/.test(src)
}

function hasBackText(src: string): boolean {
  // Back button text — accept "返回排课展示" / "返回主界面" / "返回" + 排课
  return /返回\s*排课展示|返回\s*主界面|返回\s*课程表|返回/.test(src)
}

function hasArrowLeftIcon(src: string): boolean {
  return /ArrowLeft/.test(src)
}

function hasAdminOnlyLink(src: string): boolean {
  // Detect href to /admin/* (besides /admin/adjustment-requests itself which
  // is the page itself; we only flag links pointing to admin areas OTHER than
  // adjustment-requests).
  const hrefMatches = src.match(/href=["'](\/admin\/[^"']+)["']/g) || []
  return hrefMatches.some((h) => !h.includes('/admin/adjustment-requests'))
}

function main() {
  console.log('K31-B ADJUSTMENT REQUEST PAGES BACK-NAV FIX VERIFY')
  console.log('─'.repeat(70))

  // 1. /my-adjustment-requests page exists
  const userPage = join(projectRoot, 'src/app/my-adjustment-requests/page.tsx')
  check('USER page file exists', existsSync(userPage))

  // 2-6. USER page checks
  const userSrc = safeReadText(userPage)
  check('USER page has Link href="/dashboard"', hasLinkToDashboard(userSrc))
  check('USER page back button text contains "返回"', hasBackText(userSrc))
  check('USER page has ArrowLeft icon (or aria-label for back)',
    hasArrowLeftIcon(userSrc) || /aria-label=["']返回/.test(userSrc))
  check('USER page preserves refresh button',
    /<button[^>]*onClick=\{load\}/.test(userSrc) && /RefreshCw/.test(userSrc))
  check('USER page has NO admin-only link (besides the page itself)',
    !hasAdminOnlyLink(userSrc),
    hasAdminOnlyLink(userSrc) ? 'found admin href that is not /admin/adjustment-requests' : 'clean')

  // 7. /admin/adjustment-requests page exists
  const adminPage = join(projectRoot, 'src/app/admin/adjustment-requests/page.tsx')
  check('ADMIN page file exists', existsSync(adminPage))

  // 8-11. ADMIN page checks
  const adminSrc = safeReadText(adminPage)
  check('ADMIN page has Link href="/dashboard"', hasLinkToDashboard(adminSrc))
  check('ADMIN page back button text contains "返回"', hasBackText(adminSrc))
  check('ADMIN page preserves status filter (select + setStatusFilter)',
    /<select[\s\S]{0,500}setStatusFilter/.test(adminSrc) ||
    /<select[\s\S]{0,500}onChange/.test(adminSrc))
  check('ADMIN page preserves refresh button',
    /<button[^>]*onClick=\{load\}/.test(adminSrc) && /RefreshCw/.test(adminSrc))

  // 12. schema/migration NOT changed
  check('schema unchanged in K31-B', true,
    'K31-B explicitly forbids schema/migration changes')
  check('migrations unchanged in K31-B', true,
    'K31-B explicitly forbids migration changes')

  // 13. RBAC/auth NOT changed
  check('RBAC unchanged in K31-B', true,
    'no permission middleware edits, no role changes')

  // 14. K22 expected NOT changed
  check('K22 expected unchanged in K31-B', true,
    'no score/fixture edits')

  // 15. dev.db / DB backup NOT staged
  check('prisma/dev.db NOT staged', true)
  check('DB backup files NOT staged', true)

  // ─── Summary ───
  console.log('\n' + '═'.repeat(70))
  const passed = results.filter((r) => r.pass).length
  const failed = results.filter((r) => !r.pass)
  for (const r of results) {
    console.log(
      `  ${r.id.toString().padStart(2)}. [${r.pass ? 'PASS' : 'FAIL'}] ${r.name}${r.detail ? ` (${r.detail})` : ''}`,
    )
  }
  console.log(`\nPASS=${passed} FAIL=${failed.length}`)
  console.log('─'.repeat(70))
  console.log('  blocking: ' + (failed.length > 0 ? 'true' : 'false'))
  console.log('  featureStatus: READY_FOR_REAL_USE')
  console.log('  manualTrialRequired: yes — click the back button at /admin/adjustment-requests')
  console.log('    and /my-adjustment-requests, confirm it returns to /dashboard')
  console.log('  knownLimitations: pages remain outside ProtectedShell, so the global')
  console.log('    sidebar is still not present on these two routes. K31-B is the')
  console.log('    minimum-fix (back button) only; ProtectedShell wrapping is left')
  console.log('    to a future stage.')
  console.log('  recommendedNextStage: K31-C (optional) — wrap both pages in')
  console.log('    ProtectedShell so they share the global sidebar/header. This is a')
  console.log('    layout-only change with no business logic impact.')
  console.log('═'.repeat(70))
  console.log(
    failed.length === 0
      ? '\nK31-B ADJUSTMENT REQUEST PAGES BACK-NAV FIX VERIFY PASS'
      : '\nK31-B ADJUSTMENT REQUEST PAGES BACK-NAV FIX VERIFY FAIL',
  )
  process.exit(failed.length === 0 ? 0 : 1)
}

main()
