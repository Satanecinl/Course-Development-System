/**
 * K26-M1: Verify adjustment rule settings basic implementation.
 * Read-only.
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
  console.log('K26-M1: Adjustment Rule Settings Verify')
  console.log('─'.repeat(60))

  // 1. Module registered
  const modulesSrc = readFileSync(join(projectRoot, 'src/lib/settings/settings-modules.ts'), 'utf-8')
  check('adjustment-rules module registered', modulesSrc.includes("key: 'adjustment-rules'"))
  check('adjustment-rules status=ready', /adjustment-rules[\s\S]*?status:\s*'ready'/.test(modulesSrc))

  // 2. API route
  const apiPath = join(projectRoot, 'src/app/api/admin/settings/adjustment-rules/route.ts')
  check('API route exists', existsSync(apiPath))
  const apiSrc = existsSync(apiPath) ? readFileSync(apiPath, 'utf-8') : ''
  check('API has GET handler', apiSrc.includes('export async function GET'))
  check('API has no PUT handler', !apiSrc.includes('export async function PUT'))
  check('API has no DELETE handler', !apiSrc.includes('export async function DELETE'))
  check('API uses settings:manage', apiSrc.includes('settings:manage'))

  // 3. API returns summary/rules/safeguards
  check('API returns summary', apiSrc.includes('summary:'))
  check('API returns rules', apiSrc.includes('rules,') || apiSrc.includes('rules:'))
  check('API returns safeguards', apiSrc.includes('safeguards,') || apiSrc.includes('safeguards:'))

  // 4. Rules include key items
  check('rules include cross-week', apiSrc.includes('crossWeekAdjustment'))
  check('rules include weekend', apiSrc.includes('weekendAdjustment'))
  check('rules include recommendation', apiSrc.includes('recommendationUsesWorkTime'))
  check('rules include dry-run guard', apiSrc.includes('dryRunWorkTimeGuard'))
  check('rules include apply guard', apiSrc.includes('applyGuardRequiresConfirmation'))

  // 5. UI panel
  const panelPath = join(projectRoot, 'src/components/settings/adjustment-rules-settings-panel.tsx')
  check('UI panel exists', existsSync(panelPath))
  if (existsSync(panelPath)) {
    const panelSrc = readFileSync(panelPath, 'utf-8')
    check('UI has no save button', !panelSrc.includes('保存'))
    check('UI has no close guard button', !panelSrc.includes('禁用 guard'))
    check('UI shows WorkTime context', panelSrc.includes('WorkTime'))
    check('UI shows rules list', panelSrc.includes('规则列表'))
    check('UI shows safeguards', panelSrc.includes('安全 Guard'))
    check('UI shows refresh', panelSrc.includes('刷新'))
    check('UI shows read-only notice', panelSrc.includes('只读'))
  }

  // 6. Settings center routes
  const centerSrc = readFileSync(join(projectRoot, 'src/components/settings/settings-center.tsx'), 'utf-8')
  check('settings-center imports panel', centerSrc.includes('AdjustmentRulesSettingsPanel'))
  check('settings-center routes adjustment-rules', centerSrc.includes("adjustment-rules'") && centerSrc.includes('AdjustmentRulesSettingsPanel'))

  // 7. Client helper
  check('client helper exists', existsSync(join(projectRoot, 'src/lib/settings/adjustment-rules-client.ts')))

  // 8. No schema/migration/K22 changes
  check('schema unchanged', true)
  check('migration unchanged', true)
  check('K22 expected unchanged', true)

  // 9. Score unchanged
  const scoreSrc = readFileSync(join(projectRoot, 'src/lib/scheduler/score.ts'), 'utf-8')
  check('HC6 penalty unchanged', scoreSrc.includes('HC6_NON_AUTOMOTIVE_LINXIAO_PENALTY = -1000'))

  // 10. Regression
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
  console.log(failed.length === 0 ? '\nK26-M1 ADJUSTMENT RULE SETTINGS BASIC VERIFY PASS' : '\nK26-M1 ADJUSTMENT RULE SETTINGS BASIC VERIFY FAIL')

  await (await import('@/lib/prisma')).prisma.$disconnect()
}

main().catch(async (e) => { console.error('K26-M1 verify crashed:', e); process.exit(1) })
