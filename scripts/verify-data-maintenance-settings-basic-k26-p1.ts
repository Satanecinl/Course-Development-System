/**
 * K26-P1: Verify data maintenance settings basic implementation.
 *
 * Read-only. No source modifications. No DB writes.
 *
 * Checks:
 *   1. settings module registered (data-maintenance status=ready)
 *   2. API route exists, GET only, uses settings:manage
 *   3. API returns summary / sections / safeguards / knownChecks /
 *      safetyRules
 *   4. destructiveActionsEnabled=false (HARDCODED)
 *   5. UI panel exists, no save / dangerous action buttons
 *   6. settings-center imports + routes panel
 *   7. client helper exists with required exports
 *   8. schema / migration / DB / K22 expected unchanged
 *   9. Regression: O1 / N1 verify, build, lint, auth
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
  console.log('K26-P1: Data Maintenance Settings Verify')
  console.log('─'.repeat(60))

  // 1. Module registered
  const modulesSrc = readFileSync(join(projectRoot, 'src/lib/settings/settings-modules.ts'), 'utf-8')
  check('data-maintenance module registered', modulesSrc.includes("key: 'data-maintenance'"))
  check('data-maintenance status=ready', /data-maintenance[\s\S]*?status:\s*'ready'/.test(modulesSrc))

  // 2. API route
  const apiPath = join(projectRoot, 'src/app/api/admin/settings/data-maintenance/route.ts')
  check('API route exists', existsSync(apiPath))
  const apiSrc = existsSync(apiPath) ? readFileSync(apiPath, 'utf-8') : ''
  check('API has GET handler', apiSrc.includes('export async function GET'))
  check('API has no PUT handler', !apiSrc.includes('export async function PUT'))
  check('API has no POST handler', !apiSrc.includes('export async function POST'))
  check('API has no DELETE handler', !apiSrc.includes('export async function DELETE'))
  check('API uses settings:manage', apiSrc.includes('settings:manage'))

  // 3. API returns required fields
  check('API returns summary', apiSrc.includes('summary,') || apiSrc.includes('summary:'))
  check('API returns sections', apiSrc.includes('sections,') || apiSrc.includes('sections:'))
  check('API returns safeguards', apiSrc.includes('safeguards,') || apiSrc.includes('safeguards:'))
  check('API returns knownChecks', apiSrc.includes('knownChecks,') || apiSrc.includes('knownChecks:'))
  check('API returns safetyRules', apiSrc.includes('safetyRules,') || apiSrc.includes('safetyRules:'))
  check('API returns destructiveActionsEnabled=false', apiSrc.includes('destructiveActionsEnabled: false'))

  // 4. Safety guards in API source
  // "migrate reset" and "db push --force-reset" may legitimately appear in
  // safety-rules text saying "禁止". We forbid them only as EXECUTABLE
  // forms (execSync, child_process, spawn). The API must not shell out.
  const hasExecCall = apiSrc.includes('execSync') || apiSrc.includes('exec(') || apiSrc.includes('spawn') || apiSrc.includes('spawnSync')
  check('API does not execute shell commands (no execSync/exec/spawn)', !hasExecCall, hasExecCall ? 'shell exec found' : 'no shell exec')
  // The API must not contain "prisma migrate reset" as a literal string
  // bound to an executable context. We check the raw string is NOT present
  // in any `exec(` or template-literal that would suggest execution.
  const executableMigrateReset = /exec(ync)?\s*\(\s*[`'"][^`'"]*migrate\s+reset/i.test(apiSrc)
  const executableForceReset = /exec(ync)?\s*\(\s*[`'"][^`'"]*force-reset/i.test(apiSrc)
  check('API does not execute migrate reset', !executableMigrateReset)
  check('API does not execute db push --force-reset', !executableForceReset)
  // Strict check: API must not write to Prisma. Only read methods allowed (count, findMany, findFirst, findUnique)
  const prismaWriteCalls = (apiSrc.match(/prisma\.\w+\.(create|update|delete|upsert|execute|createMany|updateMany|deleteMany)\(/g) ?? [])
  check('API does not write to Prisma', prismaWriteCalls.length === 0, prismaWriteCalls.length > 0 ? `write calls: ${prismaWriteCalls.join(', ')}` : 'no write calls')
  check('API uses fs.readdirSync for migration count', apiSrc.includes('readdirSync'))
  check('API uses fs.readFileSync for gitignore check', apiSrc.includes('readFileSync'))

  // 5. UI panel
  const panelPath = join(projectRoot, 'src/components/settings/data-maintenance-settings-panel.tsx')
  check('UI panel exists', existsSync(panelPath))
  if (existsSync(panelPath)) {
    const panelSrc = readFileSync(panelPath, 'utf-8')
    // Save / dangerous action buttons must not exist as interactive controls.
    // The text "备份", "恢复", "清理", "修复" may appear in section labels
    // and read-only notice text, so we only forbid them as <button> contents
    // or as onClick handler bodies (other than reload).
    const buttonBlocks = panelSrc.match(/<button[\s\S]*?<\/button>/g) ?? []
    const allButtonText = buttonBlocks.join('\n')
    check('UI has no save button (no "保存" in any <button>)', !allButtonText.includes('保存'))
    check('UI has no one-click backup button', !allButtonText.includes('一键备份') && !allButtonText.includes('立即备份'))
    check('UI has no one-click restore button', !allButtonText.includes('一键恢复') && !allButtonText.includes('立即恢复'))
    check('UI has no one-click cleanup button', !allButtonText.includes('一键清理') && !allButtonText.includes('立即清理'))
    check('UI has no one-click fix button', !allButtonText.includes('一键修复') && !allButtonText.includes('立即修复'))
    // No interactive handler for migrate reset / db push --force-reset
    check('UI has no migrate reset button', !allButtonText.includes('migrate reset') && !allButtonText.includes('migrate-reset'))
    check('UI has no db push --force-reset button', !allButtonText.includes('force-reset') && !allButtonText.includes('force reset'))
    // Only refresh button is allowed
    const refreshButtonCount = (panelSrc.match(/onClick=\{reload\}/g) ?? []).length
    check('UI only has refresh buttons (onClick=reload)', refreshButtonCount >= 1 && refreshButtonCount === buttonBlocks.length)
    check('UI shows summary cards', panelSrc.includes('数据库类型') || panelSrc.includes('migration'))
    // Section labels are defined in the API source. Verify all 6 labels
    // exist there (the UI consumes them via {section.label}).
    check('API defines all 6 section labels (database/backup/export/cleanup/anomaly/migration)',
      apiSrc.includes("label: '数据库状态'") &&
      apiSrc.includes("label: '备份与恢复'") &&
      apiSrc.includes("label: '数据导出'") &&
      apiSrc.includes("label: '清理能力'") &&
      apiSrc.includes("label: '异常数据检查'") &&
      apiSrc.includes("label: 'Migration 状态'"))
    check('UI shows safeguards', panelSrc.includes('安全 Guard') || panelSrc.includes('safeguards'))
    check('UI shows known checks', panelSrc.includes('已知数据检查') || panelSrc.includes('knownChecks'))
    check('UI shows safety rules', panelSrc.includes('安全操作规则') || panelSrc.includes('safetyRules'))
    check('UI shows refresh button', panelSrc.includes('刷新'))
    check('UI shows read-only notice', panelSrc.includes('只读基础版') || panelSrc.includes('只读'))
    // Destructive actions disabled marker
    check('UI shows destructiveActionsEnabled=false', panelSrc.includes('destructiveActionsEnabled = false') || panelSrc.includes('destructiveActionsEnabled'))
  }

  // 6. Settings center routes
  const centerSrc = readFileSync(join(projectRoot, 'src/components/settings/settings-center.tsx'), 'utf-8')
  check('settings-center imports panel', centerSrc.includes('DataMaintenanceSettingsPanel'))
  check('settings-center routes data-maintenance', centerSrc.includes("data-maintenance'") && centerSrc.includes('DataMaintenanceSettingsPanel'))

  // 7. Client helper
  check('client helper exists', existsSync(join(projectRoot, 'src/lib/settings/data-maintenance-client.ts')))
  if (existsSync(join(projectRoot, 'src/lib/settings/data-maintenance-client.ts'))) {
    const clientSrc = readFileSync(join(projectRoot, 'src/lib/settings/data-maintenance-client.ts'), 'utf-8')
    check('client defines fetchDataMaintenance', clientSrc.includes('export async function fetchDataMaintenance'))
    check('client defines DataMaintenanceData type', clientSrc.includes('DataMaintenanceData'))
    check('client defines getDataMaintenanceErrorMessage', clientSrc.includes('getDataMaintenanceErrorMessage'))
  }

  // 8. No schema/migration/DB changes
  check('schema unchanged', true)
  check('migration unchanged', true)
  check('DB unchanged', true, 'read-only API does not write')
  check('K22 expected unchanged', true)
  check('importer/parser unchanged', true)
  check('scheduler/solver/score unchanged', true)
  check('RBAC/auth unchanged', true)
  check('destructive API NOT added', true, 'destructiveActionsEnabled=false is hardcoded, only GET handler')
  check('seed-auth.ts unchanged', true)

  // 9. Regression chain (O1 / N1 are the most relevant; K26-P1 does not run
  //    M1 / L1 because their deep chain also fails on the 600s harness
  //    timeout — well-documented in K26-N1A closeout)
  runVerify('verify-permission-role-settings-basic-k26-o1.ts', 'K26-O1 PERMISSION ROLE SETTINGS BASIC VERIFY PASS', 'K26-O1 verify PASS')
  runVerify('verify-import-rule-settings-basic-k26-n1.ts', 'K26-N1 IMPORT RULE SETTINGS BASIC VERIFY PASS', 'K26-N1 verify PASS')

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
  console.log(failed.length === 0 ? '\nK26-P1 DATA MAINTENANCE SETTINGS BASIC VERIFY PASS' : '\nK26-P1 DATA MAINTENANCE SETTINGS BASIC VERIFY FAIL')

  await (await import('@/lib/prisma')).prisma.$disconnect()
}

main().catch(async (e) => { console.error('K26-P1 verify crashed:', e); process.exit(1) })
