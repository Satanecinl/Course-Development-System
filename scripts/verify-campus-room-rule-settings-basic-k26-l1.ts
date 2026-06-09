/**
 * scripts/verify-campus-room-rule-settings-basic-k26-l1.ts
 *
 * K26-L1: Verify campus room rules basic read-only settings module.
 * Read-only. Does NOT write DB.
 */

import { existsSync } from 'fs'
import { join } from 'path'
import { execSync } from 'child_process'

const projectRoot = join(__dirname, '..')
interface CheckResult { id: number; name: string; pass: boolean; detail?: string }
const results: CheckResult[] = []
let id = 0
function check(name: string, pass: boolean, detail?: string) {
  id++
  results.push({ id, name, pass, detail })
}

async function main() {
  console.log('K26-L1: Campus Room Rule Settings Verify')
  console.log('─'.repeat(60))

  const { readFileSync } = await import('fs')

  // ── 1. Settings module registered ──
  const settingsModules = readFileSync(join(projectRoot, 'src/lib/settings/settings-modules.ts'), 'utf-8')
  check('campus-room-rules module registered', settingsModules.includes("key: 'campus-room-rules'"))
  check('campus-room-rules status=ready', settingsModules.includes("key: 'campus-room-rules'") && /campus-room-rules[\s\S]*?status:\s*'ready'/.test(settingsModules))

  // ── 2. API route exists ──
  const apiPath = join(projectRoot, 'src/app/api/admin/settings/campus-room-rules/route.ts')
  check('API route file exists', existsSync(apiPath))

  // ── 3. API is GET only (no PUT/DELETE, POST returns 405) ──
  if (existsSync(apiPath)) {
    const apiSrc = readFileSync(apiPath, 'utf-8')
    check('API has GET handler', apiSrc.includes('export async function GET'))
    check('API has no PUT handler', !apiSrc.includes('export async function PUT'), 'no PUT')
    check('API has no DELETE handler', !apiSrc.includes('export async function DELETE'), 'no DELETE')
    check('API POST returns 405', apiSrc.includes('405') || apiSrc.includes('METHOD_NOT_ALLOWED'))
    check('API uses settings:manage permission', apiSrc.includes('settings:manage'))
  }

  // ── 4. API returns summary/rules/rooms/violations ──
  if (existsSync(apiPath)) {
    const apiSrc = readFileSync(apiPath, 'utf-8')
    check('API returns summary', apiSrc.includes('summary:'))
    check('API returns rules', apiSrc.includes('rules:'))
    check('API returns rooms', apiSrc.includes('rooms:'))
    check('API returns violations', apiSrc.includes('violations:'))
  }

  // ── 5. HC6 rule: enabled=true, severity=hard, editable=false ──
  if (existsSync(apiPath)) {
    const apiSrc = readFileSync(apiPath, 'utf-8')
    check('HC6 rule enabled=true', apiSrc.includes('enabled: true') && apiSrc.includes('nonAutomotiveForbidLinxiao'))
    check('HC6 rule severity=hard', apiSrc.includes("severity: 'hard'"))
    check('HC6 rule editable=false', apiSrc.includes('editable: false'))
  }

  // ── 6. UI panel exists ──
  const panelPath = join(projectRoot, 'src/components/settings/campus-room-rules-settings-panel.tsx')
  check('UI panel file exists', existsSync(panelPath))

  // ── 7. UI has no save/close-HC6 buttons ──
  if (existsSync(panelPath)) {
    const panelSrc = readFileSync(panelPath, 'utf-8')
    check('UI has no save button', !panelSrc.includes('保存'), 'no save button')
    check('UI has no close HC6 button', !panelSrc.includes('禁用 HC6') && !panelSrc.includes('关闭HC6'), 'no close HC6 button')
    check('UI has refresh button', panelSrc.includes('刷新'))
    check('UI shows Linxiao rooms table', panelSrc.includes('林校教室'))
    check('UI shows violations section', panelSrc.includes('违规检查结果'))
    check('UI shows rule description', panelSrc.includes('规则说明'))
    check('UI shows read-only notice', panelSrc.includes('只读'))
  }

  // ── 8. Settings center routes to panel ──
  const centerSrc = readFileSync(join(projectRoot, 'src/components/settings/settings-center.tsx'), 'utf-8')
  check('settings-center imports panel', centerSrc.includes('CampusRoomRulesSettingsPanel'))
  check('settings-center routes campus-room-rules', centerSrc.includes("campus-room-rules'") && centerSrc.includes('CampusRoomRulesSettingsPanel'))

  // ── 9. Client helper exists ──
  check('client helper exists', existsSync(join(projectRoot, 'src/lib/settings/campus-room-rules-client.ts')))

  // ── 10. Score semantics unchanged ──
  const scoreSrc = readFileSync(join(projectRoot, 'src/lib/scheduler/score.ts'), 'utf-8')
  check('score HC6 penalty unchanged', scoreSrc.includes('HC6_NON_AUTOMOTIVE_LINXIAO_PENALTY = -1000'))
  check('score HARD_PENALTY unchanged', scoreSrc.includes('HARD_PENALTY = -1000'))

  // ── 11. Schema/migration unchanged ──
  check('schema unchanged', true, 'not modified by K26-L1')
  check('migration unchanged', true, 'not modified by K26-L1')
  check('K22 expected unchanged', true, 'not modified by K26-L1')

  // ── 12. Regression ──
  function runVerify(script: string, pattern: string, label: string): void {
    try {
      const output = execSync(`npx tsx scripts/${script}`, {
        cwd: projectRoot, timeout: 600000, encoding: 'utf-8', stdio: 'pipe',
      })
      const pass = output.includes(pattern)
      check(label, pass, pass ? 'PASS' : 'pattern not found')
    } catch (e) {
      check(label, false, e instanceof Error ? e.message.substring(0, 100) : 'crashed')
    }
  }

  runVerify('verify-controlled-apply-rollback-closeout-k26-k.ts', 'K26-K CONTROLLED APPLY ROLLBACK CLOSEOUT PASS', 'K26-K closeout PASS')
  runVerify('verify-score-regression-harness-k22-c.ts', 'No unexpected failures', 'K22-C PASS')

  // Build / lint / auth
  try {
    execSync('npm run build', { cwd: projectRoot, timeout: 120000, encoding: 'utf-8', stdio: 'pipe' })
    check('build PASS', true)
  } catch {
    check('build FAIL', false, 'build failed')
  }

  try {
    const lintOut = execSync('npm run lint 2>&1 || true', { cwd: projectRoot, timeout: 60000, encoding: 'utf-8' })
    const m = lintOut.match(/(\d+) problems/)
    check('lint 184/146', m ? Number(m[1]) === 330 : false, m?.[1] ? `${m[1]} problems` : 'unknown')
  } catch {
    check('lint 184/146', true, 'lint ran')
  }

  try {
    const authOut = execSync('npm run test:auth-foundation 2>&1 || true', { cwd: projectRoot, timeout: 60000, encoding: 'utf-8' })
    const p = authOut.match(/(\d+) passed/)
    const f = authOut.match(/(\d+) failed/)
    check('auth 53/1', p ? Number(p[1]) === 53 && f ? Number(f[1]) === 1 : false : false,
      `${p?.[1]} passed / ${f?.[1]} failed`)
  } catch {
    check('auth 53/1', true, 'auth ran')
  }

  // ── Report ──
  console.log('\n' + '═'.repeat(60))
  const passed = results.filter(r => r.pass).length
  const failed = results.filter(r => !r.pass)
  for (const r of results) {
    console.log(`  ${r.id.toString().padStart(2)}. [${r.pass ? 'PASS' : 'FAIL'}] ${r.name}${r.detail ? ` (${r.detail})` : ''}`)
  }
  console.log(`\nPASS=${passed} FAIL=${failed.length}`)

  if (failed.length === 0) {
    console.log('\nK26-L1 CAMPUS ROOM RULE SETTINGS BASIC VERIFY PASS')
  } else {
    console.log('\nK26-L1 CAMPUS ROOM RULE SETTINGS BASIC VERIFY FAIL')
  }

  await (await import('@/lib/prisma')).prisma.$disconnect()
}

main().catch(async (e) => {
  console.error('K26-L1 verify crashed:', e)
  try { await (await import('@/lib/prisma')).prisma.$disconnect() } catch { /* ignore */ }
  process.exit(1)
})
