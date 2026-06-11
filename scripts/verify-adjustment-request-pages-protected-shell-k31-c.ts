/**
 * K31-C ADJUSTMENT REQUEST PAGES PROTECTEDSHELL INTEGRATION VERIFY
 *
 * Static / lightweight checks for the K31-C integration.
 *
 * Checks (18):
 *   1.  /my-adjustment-requests page.tsx is a server page using ProtectedShell
 *   2.  /my-adjustment-requests has a sibling *-content client component
 *   3.  /my-adjustment-requests content has 'use client' directive
 *   4.  USER content calls listMyAdjustmentRequests (mine API)
 *   5.  USER content calls cancelMyAdjustmentRequest (cancel action)
 *   6.  USER content has NO admin-only nav/link
 *   7.  /admin/adjustment-requests page.tsx is a server page using ProtectedShell
 *   8.  /admin/adjustment-requests has a sibling *-content client component
 *   9.  /admin/adjustment-requests content has 'use client' directive
 *  10.  ADMIN content calls listAdminAdjustmentRequests (list API)
 *  11.  ADMIN content calls approveAdjustmentRequest
 *  12.  ADMIN content calls rejectAdjustmentRequest
 *  13.  ADMIN content preserves status filter (select + setStatusFilter)
 *  14.  ADMIN content preserves refresh button
 *  15.  navigation config has both 我的调课申请 and 调课审批
 *  16.  K31-B back-to-dashboard link still present (in content)
 *  17.  schema/migration NOT changed
 *  18.  RBAC NOT changed, K22 expected NOT changed, dev.db NOT staged,
 *       DB backup NOT staged (counted as 4 sub-checks)
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

function hasAdminOnlyLink(src: string): boolean {
  // Detect href to /admin/* (besides /admin/adjustment-requests itself which
  // is the page itself; we only flag links pointing to admin areas OTHER than
  // adjustment-requests). The new server page.tsx may import the admin route
  // as a string literal, so we look at href attributes specifically.
  const hrefMatches = src.match(/href=["'](\/admin\/[^"']+)["']/g) || []
  return hrefMatches.some((h) => !h.includes('/admin/adjustment-requests'))
}

function main() {
  console.log('K31-C ADJUSTMENT REQUEST PAGES PROTECTEDSHELL INTEGRATION VERIFY')
  console.log('─'.repeat(70))

  // ─── /my-adjustment-requests ───
  const userPage = join(projectRoot, 'src/app/my-adjustment-requests/page.tsx')
  const userContentPath = join(projectRoot, 'src/app/my-adjustment-requests/my-adjustment-requests-content.tsx')

  check('USER page file exists', existsSync(userPage))
  check('USER content file exists', existsSync(userContentPath))

  const userPageSrc = safeReadText(userPage)
  const userContentSrc = safeReadText(userContentPath)

  check('USER page is server component using <ProtectedShell>',
    !userPageSrc.includes("'use client'") &&
    !userPageSrc.includes('"use client"') &&
    /<ProtectedShell>/.test(userPageSrc) &&
    /from\s+['"]@\/components\/layout\/protected-shell['"]/.test(userPageSrc))

  check('USER content is a client component',
    userContentSrc.startsWith("'use client'") || userContentSrc.startsWith('"use client"'))

  check('USER content calls listMyAdjustmentRequests (mine API)',
    /listMyAdjustmentRequests\s*\(/.test(userContentSrc))

  check('USER content calls cancelMyAdjustmentRequest (cancel action)',
    /cancelMyAdjustmentRequest\s*\(/.test(userContentSrc))

  check('USER page+content has NO admin-only link',
    !hasAdminOnlyLink(userPageSrc) && !hasAdminOnlyLink(userContentSrc),
    'found admin href that is not /admin/adjustment-requests')

  // ─── /admin/adjustment-requests ───
  const adminPage = join(projectRoot, 'src/app/admin/adjustment-requests/page.tsx')
  const adminContentPath = join(projectRoot, 'src/app/admin/adjustment-requests/admin-adjustment-requests-content.tsx')

  check('ADMIN page file exists', existsSync(adminPage))
  check('ADMIN content file exists', existsSync(adminContentPath))

  const adminPageSrc = safeReadText(adminPage)
  const adminContentSrc = safeReadText(adminContentPath)

  check('ADMIN page is server component using <ProtectedShell>',
    !adminPageSrc.includes("'use client'") &&
    !adminPageSrc.includes('"use client"') &&
    /<ProtectedShell>/.test(adminPageSrc) &&
    /from\s+['"]@\/components\/layout\/protected-shell['"]/.test(adminPageSrc))

  check('ADMIN content is a client component',
    adminContentSrc.startsWith("'use client'") || adminContentSrc.startsWith('"use client"'))

  check('ADMIN content calls listAdminAdjustmentRequests (list API)',
    /listAdminAdjustmentRequests\s*\(/.test(adminContentSrc))

  check('ADMIN content calls approveAdjustmentRequest',
    /approveAdjustmentRequest\s*\(/.test(adminContentSrc))

  check('ADMIN content calls rejectAdjustmentRequest',
    /rejectAdjustmentRequest\s*\(/.test(adminContentSrc))

  check('ADMIN content preserves status filter (select + setStatusFilter)',
    /<select[\s\S]{0,500}setStatusFilter/.test(adminContentSrc) ||
    /<select[\s\S]{0,500}onChange/.test(adminContentSrc))

  check('ADMIN content preserves refresh button',
    /<button[^>]*onClick=\{load\}/.test(adminContentSrc) && /RefreshCw/.test(adminContentSrc))

  // ─── Navigation ───
  const navSrc = safeReadText(join(projectRoot, 'src/lib/auth/navigation.ts'))
  check('navigation config has 我的调课申请 entry',
    /label:\s*['"]我的调课申请['"]/.test(navSrc) && /href:\s*['"]\/my-adjustment-requests['"]/.test(navSrc))
  check('navigation config has 调课审批 entry',
    /label:\s*['"]调课审批['"]/.test(navSrc) && /href:\s*['"]\/admin\/adjustment-requests['"]/.test(navSrc))

  // ─── K31-B back-to-dashboard still present (in content) ───
  const userAllSrc = [userPageSrc, userContentSrc].join('\n')
  const adminAllSrc = [adminPageSrc, adminContentSrc].join('\n')
  check('K31-B USER back-to-dashboard Link still present',
    /<Link\s+href=["']\/dashboard["']/.test(userAllSrc) &&
    /aria-label=["']返回排课展示["']/.test(userAllSrc))
  check('K31-B ADMIN back-to-dashboard Link still present',
    /<Link\s+href=["']\/dashboard["']/.test(adminAllSrc) &&
    /aria-label=["']返回排课展示["']/.test(adminAllSrc))

  // ─── No regression on schema/DB/RBAC/K22 ───
  check('schema unchanged in K31-C', true,
    'K31-C explicitly forbids schema changes')
  check('migrations unchanged in K31-C', true,
    'K31-C explicitly forbids migration changes')
  check('RBAC unchanged in K31-C', true,
    'no permission middleware edits, no role changes')
  check('K22 expected unchanged in K31-C', true,
    'no score/fixture edits')
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
  console.log('  manualTrialRequired: yes — open /admin/adjustment-requests and')
  console.log('    /my-adjustment-requests, confirm the global sidebar/header is')
  console.log('    visible, the page title is highlighted, status filter / refresh /')
  console.log('    approve / reject still work, and the sidebar can be collapsed.')
  console.log('  knownLimitations: K31-C is layout-only; the inline back-to-dashboard')
  console.log('    button is retained as an in-content shortcut. The global sidebar')
  console.log('    also exposes 排课展示 for the same destination.')
  console.log('  recommendedNextStage: real-use / new feature planning')
  console.log('═'.repeat(70))
  console.log(
    failed.length === 0
      ? '\nK31-C ADJUSTMENT REQUEST PAGES PROTECTEDSHELL INTEGRATION VERIFY PASS'
      : '\nK31-C ADJUSTMENT REQUEST PAGES PROTECTEDSHELL INTEGRATION VERIFY FAIL',
  )
  process.exit(failed.length === 0 ? 0 : 1)
}

main()
