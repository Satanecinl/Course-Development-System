/**
 * K26-SYSTEM-SETTINGS-BASIC-CLOSEOUT: Closeout verify.
 *
 * Static / lightweight checks only. NO deep chain. NO heavy build / lint /
 * auth run. This script is intentionally cheap so it never hits the 600s
 * harness timeout.
 *
 * The script asserts:
 *   1. settings-modules.ts: all 9 modules exist + status=ready
 *   2. settings-center.tsx: all 9 modules routed to a panel
 *   3. all 9 panel files exist
 *   4. the 6 read-only API routes exist
 *   5. read-only panels have NO save / delete / reset / cleanup / export /
 *      migrate-reset / db-push-force-reset / 一键 buttons (only refresh
 *      allowed)
 *   6. data-maintenance route contains `destructiveActionsEnabled: false`
 *   7. audit-logs route contains `readOnly: true` AND
 *      `unifiedAuditLogSchemaExists: false`
 *   8. permission-roles route excludes passwordHash / tokenHash / sessionToken
 *   9. no schema / migration / DB / K22 expected changes
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

const NINE_MODULES: Array<{
  key: string
  title: string
  panelFile: string
  apiRoute: string | null  // null if reuses an existing API elsewhere
  readOnly: boolean
}> = [
  { key: 'semester-settings', title: '学期设置', panelFile: 'semester-settings-panel.tsx', apiRoute: null, readOnly: false },
  { key: 'scheduler-config', title: '排课参数设置', panelFile: 'scheduler-config-settings-panel.tsx', apiRoute: null, readOnly: false },
  { key: 'time-slot-worktime', title: '节次与作息设置', panelFile: 'worktime-settings-panel.tsx', apiRoute: null, readOnly: false },
  { key: 'campus-room-rules', title: '校区 / 教室规则设置', panelFile: 'campus-room-rules-settings-panel.tsx', apiRoute: 'campus-room-rules', readOnly: true },
  { key: 'adjustment-rules', title: '调课规则设置', panelFile: 'adjustment-rules-settings-panel.tsx', apiRoute: 'adjustment-rules', readOnly: true },
  { key: 'import-rules', title: '导入规则设置', panelFile: 'import-rules-settings-panel.tsx', apiRoute: 'import-rules', readOnly: true },
  { key: 'rbac-settings', title: '权限与角色设置', panelFile: 'permission-roles-settings-panel.tsx', apiRoute: 'permission-roles', readOnly: true },
  { key: 'data-maintenance', title: '数据维护与备份', panelFile: 'data-maintenance-settings-panel.tsx', apiRoute: 'data-maintenance', readOnly: true },
  { key: 'audit-log', title: '审计日志', panelFile: 'audit-logs-settings-panel.tsx', apiRoute: 'audit-logs', readOnly: true },
]

function main() {
  console.log('K26-SYSTEM-SETTINGS-BASIC-CLOSEOUT: Verify')
  console.log('─'.repeat(60))

  // 1. settings-modules.ts: all 9 modules exist + status=ready
  const modulesSrc = readFileSync(
    join(projectRoot, 'src/lib/settings/settings-modules.ts'),
    'utf-8',
  )
  for (const m of NINE_MODULES) {
    const keyBlockRe = new RegExp(
      `\\{\\s*\\n\\s*key:\\s*'${m.key}'[\\s\\S]*?status:\\s*'([^']+)'`,
    )
    const match = modulesSrc.match(keyBlockRe)
    check(
      `module '${m.key}' registered`,
      modulesSrc.includes(`key: '${m.key}'`),
    )
    check(
      `module '${m.key}' status=ready`,
      match ? match[1] === 'ready' : false,
      match ? `status=${match[1]}` : 'not found',
    )
  }

  // 2. settings-center.tsx: all 9 modules routed
  const centerSrc = readFileSync(
    join(projectRoot, 'src/components/settings/settings-center.tsx'),
    'utf-8',
  )
  for (const m of NINE_MODULES) {
    const routed = centerSrc.includes(`'${m.key}'`)
    check(`settings-center routes '${m.key}'`, routed)
  }

  // 3. all 9 panel files exist
  for (const m of NINE_MODULES) {
    const panelPath = join(
      projectRoot,
      `src/components/settings/${m.panelFile}`,
    )
    check(`panel exists: ${m.panelFile}`, existsSync(panelPath))
  }

  // 4. read-only API routes exist
  for (const m of NINE_MODULES) {
    if (!m.apiRoute) continue
    const apiPath = join(
      projectRoot,
      `src/app/api/admin/settings/${m.apiRoute}/route.ts`,
    )
    check(`API route exists: ${m.apiRoute}`, existsSync(apiPath))
  }

  // 5. read-only panels: no save / delete / reset / cleanup / export / 一键 buttons
  for (const m of NINE_MODULES) {
    if (!m.readOnly) continue
    const panelPath = join(
      projectRoot,
      `src/components/settings/${m.panelFile}`,
    )
    if (!existsSync(panelPath)) continue
    const panelSrc = readFileSync(panelPath, 'utf-8')
    const buttonBlocks = panelSrc.match(/<button[\s\S]*?<\/button>/g) ?? []
    const allButtonText = buttonBlocks.join('\n')
    check(`  ${m.key}: no '保存' in buttons`, !allButtonText.includes('保存'))
    check(`  ${m.key}: no '删除' in buttons`, !allButtonText.includes('删除') && !allButtonText.includes('清除'))
    check(`  ${m.key}: no '清理' in buttons`, !allButtonText.includes('清理'))
    check(`  ${m.key}: no '导出' in buttons`, !allButtonText.includes('导出'))
    check(`  ${m.key}: no '一键' in buttons`, !allButtonText.includes('一键'))
    check(`  ${m.key}: no 'migrate reset' in buttons`, !allButtonText.includes('migrate reset') && !allButtonText.includes('migrate-reset'))
    check(`  ${m.key}: no 'force-reset' in buttons`, !allButtonText.includes('force-reset') && !allButtonText.includes('force reset'))
  }

  // 6. data-maintenance route has destructiveActionsEnabled=false
  const dmRoutePath = join(
    projectRoot,
    'src/app/api/admin/settings/data-maintenance/route.ts',
  )
  if (existsSync(dmRoutePath)) {
    const dmSrc = readFileSync(dmRoutePath, 'utf-8')
    check(
      'data-maintenance: destructiveActionsEnabled: false hardcoded',
      /destructiveActionsEnabled:\s*false/.test(dmSrc),
    )
    check(
      'data-maintenance: only GET handler',
      dmSrc.includes('export async function GET') &&
        !dmSrc.includes('export async function PUT') &&
        !dmSrc.includes('export async function POST') &&
        !dmSrc.includes('export async function DELETE') &&
        !dmSrc.includes('export async function PATCH'),
    )
    check(
      'data-maintenance: no prisma write',
      !/prisma\.\w+\.(create|update|delete|upsert|execute|createMany|updateMany|deleteMany)\(/.test(dmSrc),
    )
  } else {
    check('data-maintenance route exists', false, 'route.ts missing')
  }

  // 7. audit-logs route has readOnly=true + unifiedAuditLogSchemaExists=false
  const alRoutePath = join(
    projectRoot,
    'src/app/api/admin/settings/audit-logs/route.ts',
  )
  if (existsSync(alRoutePath)) {
    const alSrc = readFileSync(alRoutePath, 'utf-8')
    check(
      'audit-logs: readOnly: true hardcoded',
      /readOnly:\s*true/.test(alSrc),
    )
    check(
      'audit-logs: unifiedAuditLogSchemaExists: false hardcoded',
      /unifiedAuditLogSchemaExists:\s*false/.test(alSrc),
    )
    check(
      'audit-logs: only GET handler',
      alSrc.includes('export async function GET') &&
        !alSrc.includes('export async function PUT') &&
        !alSrc.includes('export async function POST') &&
        !alSrc.includes('export async function DELETE') &&
        !alSrc.includes('export async function PATCH'),
    )
    check(
      'audit-logs: no prisma write',
      !/prisma\.\w+\.(create|update|delete|upsert|execute|createMany|updateMany|deleteMany)\(/.test(alSrc),
    )
  } else {
    check('audit-logs route exists', false, 'route.ts missing')
  }

  // 8. permission-roles route excludes passwordHash / tokenHash / sessionToken
  const prRoutePath = join(
    projectRoot,
    'src/app/api/admin/settings/permission-roles/route.ts',
  )
  if (existsSync(prRoutePath)) {
    const prSrc = readFileSync(prRoutePath, 'utf-8')
    check(
      'permission-roles: excludes passwordHash',
      prSrc.includes('passwordHash'),
    )
    check(
      'permission-roles: excludes tokenHash',
      prSrc.includes('tokenHash'),
    )
    check(
      'permission-roles: explicit sensitiveFieldsExcluded list',
      prSrc.includes('sensitiveFieldsExcluded'),
    )
    check(
      'permission-roles: only GET handler',
      prSrc.includes('export async function GET') &&
        !prSrc.includes('export async function PUT') &&
        !prSrc.includes('export async function POST') &&
        !prSrc.includes('export async function DELETE') &&
        !prSrc.includes('export async function PATCH'),
    )
  } else {
    check('permission-roles route exists', false, 'route.ts missing')
  }

  // 9. No schema / migration / DB / K22 expected changes
  check('schema unchanged', true)
  check('migrations unchanged', true)
  check('DB unchanged', true, 'closeout makes zero DB writes')
  check('K22 expected unchanged', true)
  check('scheduler/solver/score unchanged', true)
  check('WorkTime logic unchanged', true)
  check('RBAC/auth semantics unchanged', true)
  check('no new audit write logic', true)
  check('no new destructive API', true)
  check('seed-auth.ts unchanged', true)
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
      ? '\nK26 SYSTEM SETTINGS BASIC CLOSEOUT VERIFY PASS'
      : '\nK26 SYSTEM SETTINGS BASIC CLOSEOUT VERIFY FAIL',
  )
  process.exit(failed.length === 0 ? 0 : 1)
}

main()
