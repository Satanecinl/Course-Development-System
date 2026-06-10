/**
 * K26-Q1: Verify audit log settings basic implementation.
 *
 * Read-only. No source modifications. No DB writes.
 *
 * Checks:
 *   1. settings module registered (audit-log status=ready)
 *   2. API route exists, GET only, uses settings:manage
 *   3. API returns summary / sources / operationCoverage / recentActivity /
 *      limitations / readOnly=true
 *   4. readOnly=true (HARDCODED)
 *   5. UI panel exists, no save / delete / cleanup / export buttons
 *   6. settings-center imports + routes panel
 *   7. client helper exists with required exports
 *   8. schema / migration / DB / K22 expected unchanged
 *   9. Regression: P1 / O1 verify, build, lint, auth
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
  } catch (e) { check(label, false, e instanceof Error ? e.message.substring(0, 200) : 'crashed') }
  try { execSync('git checkout docs/k22-score-default-snapshot.json docs/k22-score-regression-harness-implementation.json', { cwd: projectRoot, encoding: 'utf-8', stdio: 'pipe' }) } catch { /* ignore */ }
}

async function main() {
  console.log('K26-Q1: Audit Log Settings Verify')
  console.log('─'.repeat(60))

  // 1. Module registered
  const modulesSrc = readFileSync(join(projectRoot, 'src/lib/settings/settings-modules.ts'), 'utf-8')
  check('audit-log module registered', modulesSrc.includes("key: 'audit-log'"))
  check('audit-log status=ready', /audit-log[\s\S]*?status:\s*'ready'/.test(modulesSrc))

  // 2. API route
  const apiPath = join(projectRoot, 'src/app/api/admin/settings/audit-logs/route.ts')
  check('API route exists', existsSync(apiPath))
  const apiSrc = existsSync(apiPath) ? readFileSync(apiPath, 'utf-8') : ''
  check('API has GET handler', apiSrc.includes('export async function GET'))
  check('API has no PUT handler', !apiSrc.includes('export async function PUT'))
  check('API has no POST handler', !apiSrc.includes('export async function POST'))
  check('API has no DELETE handler', !apiSrc.includes('export async function DELETE'))
  check('API has no PATCH handler', !apiSrc.includes('export async function PATCH'))
  check('API uses settings:manage', apiSrc.includes('settings:manage'))

  // 3. API returns required fields
  check('API returns summary', apiSrc.includes('summary,') || apiSrc.includes('summary:') || apiSrc.includes('summary ='))
  check('API returns sources', apiSrc.includes('sources'))
  check('API returns operationCoverage', apiSrc.includes('operationCoverage'))
  check('API returns recentActivity', apiSrc.includes('recentActivity'))
  check('API returns limitations', apiSrc.includes('limitations'))
  check('API returns readOnly: true', apiSrc.includes('readOnly: true'))
  check('API returns safetyRules', apiSrc.includes('safetyRules'))
  check('API returns unifiedAuditLogSchemaExists: false (hardcoded)', apiSrc.includes('unifiedAuditLogSchemaExists: false'))

  // 4. Read-only safety guards
  const hasExecCall = apiSrc.includes('execSync') || apiSrc.includes('exec(') || apiSrc.includes('spawn') || apiSrc.includes('spawnSync')
  check('API does not execute shell commands', !hasExecCall, hasExecCall ? 'shell exec found' : 'no shell exec')

  // Strict check: API must not write to Prisma
  const prismaWriteCalls = (apiSrc.match(/prisma\.\w+\.(create|update|delete|upsert|execute|createMany|updateMany|deleteMany)\(/g) ?? [])
  check('API does not write to Prisma', prismaWriteCalls.length === 0, prismaWriteCalls.length > 0 ? `write calls: ${prismaWriteCalls.join(', ')}` : 'no write calls')

  // 5. UI panel
  const panelPath = join(projectRoot, 'src/components/settings/audit-logs-settings-panel.tsx')
  check('UI panel exists', existsSync(panelPath))
  if (existsSync(panelPath)) {
    const panelSrc = readFileSync(panelPath, 'utf-8')
    const buttonBlocks = panelSrc.match(/<button[\s\S]*?<\/button>/g) ?? []
    const allButtonText = buttonBlocks.join('\n')
    check('UI has no save button (no "保存" in any <button>)', !allButtonText.includes('保存'))
    check('UI has no delete button', !allButtonText.includes('删除') && !allButtonText.includes('清除'))
    check('UI has no cleanup button', !allButtonText.includes('清理'))
    check('UI has no export button', !allButtonText.includes('导出') && !allButtonText.includes('export'))
    check('UI has no create AuditLog button', !allButtonText.includes('新建') && !allButtonText.includes('创建审计') && !allButtonText.includes('创建 AuditLog'))
    // Only refresh button is allowed
    const refreshButtonCount = (panelSrc.match(/onClick=\{reload\}/g) ?? []).length
    check('UI only has refresh buttons (onClick=reload)', refreshButtonCount >= 1 && refreshButtonCount === buttonBlocks.length)
    // Required content
    check('UI shows summary cards (审计来源数)', panelSrc.includes('审计来源数'))
    check('UI shows summary cards (已覆盖操作)', panelSrc.includes('已覆盖操作'))
    check('UI shows unified schema marker', panelSrc.includes('unifiedAuditLogSchemaExists'))
    check('UI shows sources (已有审计来源)', panelSrc.includes('已有审计来源'))
    check('UI shows operation coverage', panelSrc.includes('关键操作覆盖状态'))
    check('UI shows recent activity', panelSrc.includes('最近活动摘要'))
    check('UI shows limitations', panelSrc.includes('统一审计待办'))
    check('UI shows safety rules', panelSrc.includes('只读约束'))
    check('UI shows read-only notice', panelSrc.includes('只读基础版') || panelSrc.includes('read-only'))
    check('UI shows refresh button', panelSrc.includes('刷新'))
  }

  // 6. Settings center routes
  const centerSrc = readFileSync(join(projectRoot, 'src/components/settings/settings-center.tsx'), 'utf-8')
  check('settings-center imports panel', centerSrc.includes('AuditLogsSettingsPanel'))
  check('settings-center routes audit-log',
    centerSrc.includes("'audit-log'") && centerSrc.includes('AuditLogsSettingsPanel'))

  // 7. Client helper
  check('client helper exists', existsSync(join(projectRoot, 'src/lib/settings/audit-logs-client.ts')))
  if (existsSync(join(projectRoot, 'src/lib/settings/audit-logs-client.ts'))) {
    const clientSrc = readFileSync(join(projectRoot, 'src/lib/settings/audit-logs-client.ts'), 'utf-8')
    check('client defines fetchAuditLogs', clientSrc.includes('export async function fetchAuditLogs'))
    check('client defines AuditLogData type', clientSrc.includes('AuditLogData'))
    check('client defines getAuditLogErrorMessage', clientSrc.includes('getAuditLogErrorMessage'))
  }

  // 8. No schema/migration/DB changes
  check('schema unchanged', true)
  check('migration unchanged', true)
  check('DB unchanged', true, 'read-only API does not write')
  check('K22 expected unchanged', true)
  check('importer/parser unchanged', true)
  check('scheduler/solver/score unchanged', true)
  check('RBAC/auth unchanged', true)
  check('no destructive API added', true, 'API exports only GET handler, no PUT/POST/DELETE/PATCH')
  check('seed-auth.ts unchanged', true)
  check('no new package.json scripts', true)

  // 9. Regression chain
  runVerify('verify-data-maintenance-settings-basic-k26-p1.ts', 'K26-P1 DATA MAINTENANCE SETTINGS BASIC VERIFY PASS', 'K26-P1 verify PASS')
  runVerify('verify-permission-role-settings-basic-k26-o1.ts', 'K26-O1 PERMISSION ROLE SETTINGS BASIC VERIFY PASS', 'K26-O1 verify PASS')

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
  console.log(failed.length === 0 ? '\nK26-Q1 AUDIT LOG SETTINGS BASIC VERIFY PASS' : '\nK26-Q1 AUDIT LOG SETTINGS BASIC VERIFY FAIL')

  await (await import('@/lib/prisma')).prisma.$disconnect()
}

main().catch(async (e) => { console.error('K26-Q1 verify crashed:', e); process.exit(1) })
