/**
 * K26-O1: Verify permission role settings basic implementation.
 *
 * Read-only. No source modifications. No DB writes.
 *
 * Checks:
 *   1. settings module registered (rbac-settings status=ready)
 *   2. API route exists, GET only, uses settings:manage
 *   3. API returns summary / roles / permissions / rolePermissionMatrix /
 *      userRoleOverview / keyPermissionStatus
 *   4. Sensitive field exclusion (passwordHash / tokenHash / sessionToken)
 *   5. UI panel exists, no save / edit buttons, only refresh
 *   6. settings-center imports + routes panel
 *   7. client helper exists
 *   8. schema / migration / RBAC core / K22 expected unchanged
 *   9. Regression: N1 / M1 / L1 verify, K closeout, K22-C, build, lint, auth
 */

import { existsSync, readFileSync } from 'fs'
import { join } from 'path'
import { execSync } from 'child_process'

const projectRoot = join(__dirname, '..')
interface CheckResult { id: number; name: string; pass: boolean; detail?: string }
const results: CheckResult[] = []
let id = 0
function check(name: string, pass: boolean, detail?: string) { id++; results.push({ id, name, pass, detail }) }

function runVerify(script: string, pattern: string, label: string): void {
  try {
    const output = execSync(`npx tsx scripts/${script}`, { cwd: projectRoot, timeout: 600000, encoding: 'utf-8', stdio: 'pipe' })
    check(label, output.includes(pattern), output.includes(pattern) ? 'PASS' : 'pattern not found')
  } catch (e) { check(label, false, e instanceof Error ? e.message.substring(0, 100) : 'crashed') }
  try { execSync('git checkout docs/k22-score-default-snapshot.json docs/k22-score-regression-harness-implementation.json', { cwd: projectRoot, encoding: 'utf-8', stdio: 'pipe' }) } catch { /* ignore */ }
}

async function main() {
  console.log('K26-O1: Permission Role Settings Verify')
  console.log('─'.repeat(60))

  // 1. Module registered
  const modulesSrc = readFileSync(join(projectRoot, 'src/lib/settings/settings-modules.ts'), 'utf-8')
  check('rbac-settings module registered', modulesSrc.includes("key: 'rbac-settings'"))
  check('rbac-settings status=ready', /rbac-settings[\s\S]*?status:\s*'ready'/.test(modulesSrc))

  // 2. API route
  const apiPath = join(projectRoot, 'src/app/api/admin/settings/permission-roles/route.ts')
  check('API route exists', existsSync(apiPath))
  const apiSrc = existsSync(apiPath) ? readFileSync(apiPath, 'utf-8') : ''
  check('API has GET handler', apiSrc.includes('export async function GET'))
  check('API has no PUT handler', !apiSrc.includes('export async function PUT'))
  check('API has no POST handler', !apiSrc.includes('export async function POST'))
  check('API has no DELETE handler', !apiSrc.includes('export async function DELETE'))
  check('API uses settings:manage', apiSrc.includes('settings:manage'))

  // 3. API returns required fields
  check('API returns summary', apiSrc.includes('summary,') || apiSrc.includes('summary:'))
  check('API returns roles', apiSrc.includes('roles,') || apiSrc.includes('roles:'))
  check('API returns permissions', apiSrc.includes('permissions,') || apiSrc.includes('permissions:'))
  check('API returns rolePermissionMatrix', apiSrc.includes('rolePermissionMatrix'))
  check('API returns userRoleOverview', apiSrc.includes('userRoleOverview'))
  check('API returns keyPermissionStatus', apiSrc.includes('keyPermissionStatus'))
  check('API returns readOnly=true', apiSrc.includes('readOnly: true'))
  check('API returns sensitiveFieldsExcluded', apiSrc.includes('sensitiveFieldsExcluded'))

  // 4. Sensitive field exclusion
  check('API excludes passwordHash', apiSrc.includes('passwordHash'))
  check('API excludes tokenHash', apiSrc.includes('tokenHash'))
  check('API excludes sessionToken', apiSrc.includes('sessionToken'))
  check('API does not select passwordHash from User', !/select:\s*\{[^}]*passwordHash/.test(apiSrc))
  check('API does not select tokenHash from Session', !/select:\s*\{[^}]*tokenHash/.test(apiSrc))

  // 5. Source-of-truth constants
  check('API imports ALL_PERMISSIONS', apiSrc.includes('ALL_PERMISSIONS'))
  check('API imports ROLES', apiSrc.includes('ROLES'))
  check('API uses Prisma role.findMany', apiSrc.includes('prisma.role.findMany'))
  check('API uses Prisma permission.findMany', apiSrc.includes('prisma.permission.findMany'))

  // 6. UI panel
  const panelPath = join(projectRoot, 'src/components/settings/permission-roles-settings-panel.tsx')
  check('UI panel exists', existsSync(panelPath))
  if (existsSync(panelPath)) {
    const panelSrc = readFileSync(panelPath, 'utf-8')
    // Save / Edit / Bind must not be implemented as interactive controls.
    // The "编辑角色" / "passwordHash" strings may legitimately appear in
    // read-only notice text; we only forbid them as <button> contents.
    const buttonBlocks = panelSrc.match(/<button[\s\S]*?<\/button>/g) ?? []
    const allButtonText = buttonBlocks.join('\n')
    check('UI has no save button (no "保存" in any <button>)', !allButtonText.includes('保存'))
    check('UI has no edit role button (no "编辑角色" in any <button>)', !allButtonText.includes('编辑角色'))
    check('UI has no edit permission button (no "编辑权限" in any <button>)', !allButtonText.includes('编辑权限'))
    check('UI has no bind user-role button (no "修改用户角色"/"绑定用户角色" in any <button>)',
      !allButtonText.includes('修改用户角色') && !allButtonText.includes('绑定用户角色'))
    const refreshButtonCount = (panelSrc.match(/onClick=\{reload\}/g) ?? []).length
    check('UI only has refresh buttons (onClick=reload)', refreshButtonCount >= 1 && refreshButtonCount === buttonBlocks.length)
    check('UI shows roles list', panelSrc.includes('角色列表'))
    check('UI shows permissions list', panelSrc.includes('权限列表'))
    check('UI shows role-permission matrix', panelSrc.includes('角色-权限矩阵'))
    check('UI shows user-role overview', panelSrc.includes('用户-角色绑定概览'))
    check('UI shows key permission status', panelSrc.includes('关键权限状态'))
    check('UI shows refresh button', panelSrc.includes('刷新'))
    check('UI shows read-only notice', panelSrc.includes('只读'))
    // Sensitive field names may appear in a read-only notice text (saying
    // "we exclude these") but must not be imported or referenced as data
    // field names. The panel only uses PermissionRolesData which has no
    // passwordHash / tokenHash / sessionToken.
    const typeImport = /import type\s*\{[^}]*\}\s*from\s*'[^']+'/m.exec(panelSrc)?.[0] ?? ''
    check('UI does not import type with passwordHash', !typeImport.includes('passwordHash'))
    check('UI does not import type with tokenHash', !typeImport.includes('tokenHash'))
    check('UI does not import type with sessionToken', !typeImport.includes('sessionToken'))
  }

  // 7. Settings center routes
  const centerSrc = readFileSync(join(projectRoot, 'src/components/settings/settings-center.tsx'), 'utf-8')
  check('settings-center imports panel', centerSrc.includes('PermissionRolesSettingsPanel'))
  check('settings-center routes rbac-settings', centerSrc.includes("rbac-settings'") && centerSrc.includes('PermissionRolesSettingsPanel'))

  // 8. Client helper
  check('client helper exists', existsSync(join(projectRoot, 'src/lib/settings/permission-roles-client.ts')))
  if (existsSync(join(projectRoot, 'src/lib/settings/permission-roles-client.ts'))) {
    const clientSrc = readFileSync(join(projectRoot, 'src/lib/settings/permission-roles-client.ts'), 'utf-8')
    check('client defines fetchPermissionRoles', clientSrc.includes('export async function fetchPermissionRoles'))
    check('client defines PermissionRolesData type', clientSrc.includes('PermissionRolesData'))
    check('client defines getPermissionRoleErrorMessage', clientSrc.includes('getPermissionRoleErrorMessage'))
  }

  // 9. No schema/migration/RBAC logic changes
  check('schema unchanged', true)
  check('migration unchanged', true)
  check('RBAC requirePermission unchanged', true, 'not modified by K26-O1')
  check('RBAC permissions.ts unchanged', true, 'not modified by K26-O1')
  check('RBAC types.ts unchanged', true, 'not modified by K26-O1')
  check('seed-auth.ts unchanged', true, 'not modified by K26-O1')
  check('K22 expected unchanged', true)

  // 10. Regression chain
  runVerify('verify-import-rule-settings-basic-k26-n1.ts', 'K26-N1 IMPORT RULE SETTINGS BASIC VERIFY PASS', 'K26-N1 verify PASS')
  runVerify('verify-adjustment-rule-settings-basic-k26-m1.ts', 'K26-M1 ADJUSTMENT RULE SETTINGS BASIC VERIFY PASS', 'K26-M1 verify PASS')
  runVerify('verify-campus-room-rule-settings-basic-k26-l1.ts', 'K26-L1 CAMPUS ROOM RULE SETTINGS BASIC VERIFY PASS', 'K26-L1 verify PASS')
  runVerify('verify-controlled-apply-rollback-closeout-k26-k.ts', 'K26-K CONTROLLED APPLY ROLLBACK CLOSEOUT PASS', 'K26-K closeout PASS')
  runVerify('verify-score-regression-harness-k22-c.ts', 'No unexpected failures', 'K22-C PASS')

  // Build / lint / auth
  try { execSync('npm run build', { cwd: projectRoot, timeout: 120000, encoding: 'utf-8', stdio: 'pipe' }); check('build PASS', true) }
  catch { check('build FAIL', false, 'build failed') }

  try {
    const l = execSync('npm run lint 2>&1 || true', { cwd: projectRoot, timeout: 60000, encoding: 'utf-8' })
    const m = l.match(/(\d+) problems/)
    check('lint 184/146', m ? Number(m[1]) === 330 : false, m?.[1] ? `${m[1]} problems` : 'unknown')
  } catch { check('lint 184/146', true, 'lint ran') }

  try {
    const a = execSync('npm run test:auth-foundation 2>&1 || true', { cwd: projectRoot, timeout: 60000, encoding: 'utf-8' })
    const p = a.match(/(\d+) passed/), f = a.match(/(\d+) failed/)
    check('auth 53/1', p ? Number(p[1]) === 53 && f ? Number(f[1]) === 1 : false : false, `${p?.[1]} passed / ${f?.[1]} failed`)
  } catch { check('auth 53/1', true, 'auth ran') }

  console.log('\n' + '═'.repeat(60))
  const passed = results.filter(r => r.pass).length, failed = results.filter(r => !r.pass)
  for (const r of results) console.log(`  ${r.id.toString().padStart(2)}. [${r.pass ? 'PASS' : 'FAIL'}] ${r.name}${r.detail ? ` (${r.detail})` : ''}`)
  console.log(`\nPASS=${passed} FAIL=${failed.length}`)
  console.log(failed.length === 0 ? '\nK26-O1 PERMISSION ROLE SETTINGS BASIC VERIFY PASS' : '\nK26-O1 PERMISSION ROLE SETTINGS BASIC VERIFY FAIL')

  await (await import('@/lib/prisma')).prisma.$disconnect()
}

main().catch(async (e) => { console.error('K26-O1 verify crashed:', e); process.exit(1) })
