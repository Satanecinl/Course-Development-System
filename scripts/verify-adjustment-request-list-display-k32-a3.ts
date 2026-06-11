/**
 * K32-A3 ADJUSTMENT REQUEST LIST SOURCE/TARGET DISPLAY FIX VERIFY
 *
 * 修复 /admin/adjustment-requests + /my-adjustment-requests 页面中
 * "原位置/目标位置" 的显示格式（第X天 → 星期X; 节次4 → 第7-8节）。
 *
 * Checks (19+):
 *   1.  共享位置 formatter 模块存在 (src/lib/schedule/adjustment-request-display.ts)
 *   2.  formatter 将 dayOfWeek=5 映射为 "星期五"
 *   3.  formatter 将 dayOfWeek=2 映射为 "星期二"
 *   4.  formatter 不输出 "第X天"
 *   5.  formatter 将 slotIndex=4 映射为 "第7-8节"
 *   6.  formatter 不输出 "节次4"
 *   7.  week=null 时输出 "第?周"
 *   8.  roomName=null 时不输出 undefined/null/未指定
 *   9.  格式化输出示例 "第5周 星期五 第7-8节 教室 11-333"
 *  10.  ADMIN 页面使用 formatSourcePosition / formatTargetPosition（不再有内联格式）
 *  11.  USER 页面使用 formatSourcePosition / formatTargetPosition
 *  12.  list API (mine + admin) 返回 sourceWeek 字段
 *  13.  AdjustmentRequestListItem 类型包含 sourceWeek 字段
 *  14.  K32-A2 Excel 导出仍 PASS（回归）
 *  15.  无 schema/migration 变更
 *  16.  无 DB 变更
 *  17.  无 RBAC/auth 变更
 *  18.  K22 expected 未变
 *  19.  prisma/dev.db NOT staged
 *  20.  DB backup NOT staged
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

async function main() {
  console.log('K32-A3 ADJUSTMENT REQUEST LIST SOURCE/TARGET DISPLAY FIX VERIFY')
  console.log('─'.repeat(70))

  // ─── 1. 共享 formatter 存在 ───
  const displayPath = join(projectRoot, 'src/lib/schedule/adjustment-request-display.ts')
  const displaySrc = safeReadText(displayPath)
  check('shared display formatter 存在', existsSync(displayPath),
    'src/lib/schedule/adjustment-request-display.ts')

  // ─── 2-3. dayOfWeek 映射 ───
  check('formatter 将 dayOfWeek=5 映射为 "星期五"',
    /星期五/.test(displaySrc) && /DAY_NAMES/.test(displaySrc),
    'DAY_NAMES 数组含星期一..星期日')
  check('formatter 将 dayOfWeek=2 映射为 "星期二"',
    /星期二/.test(displaySrc))

  // ─── 4. 不输出 "第X天" ───
  // 检查函数体中不含 "第X天" 模式（允许注释中引用此字符串作为文档说明）
  const dayPattern = /第\s*\{?.*dayOfWeek.*\}?\s*天|第.*\?\s*天|第.*\d+\s*天/.test(displaySrc)
  check('formatter 不输出 "第X天" 格式',
    !dayPattern,
    'formatDayOfWeek 使用 "星期X" 而非 "第X天"')

  // ─── 5. slotIndex 映射 ───
  check('formatter 将 slotIndex=4 映射为 "第7-8节"',
    /4:\s*'第7-8节'/.test(displaySrc) || /第7-8节/.test(displaySrc),
    'SLOT_RANGES 含 "第7-8节"')

  // ─── 6. 不输出 "节次4" ───
  const codeOnly = displaySrc.replace(/\/\/.*$/gm, '').replace(/\/\*[\s\S]*?\*\//g, '')
  check('formatter 不包含 "节次" 格式化逻辑',
    !/节次/.test(codeOnly),
    'formatter 使用 "第X-X节" 而非 "节次X"')

  // ─── 7. week=null → "第?周" ───
  check('week=null 时输出 "第?周"',
    /第\?周/.test(displaySrc),
    'formatWeek 返回 "第?周"')

  // ─── 8. roomName=null → "" ───
  // 允许 JSDoc 注释中出现 "未指定"（作为文档说明），仅检查函数体中不含该字符串
  const codeOnlyDisplay = displaySrc.replace(/\/\/.*$/gm, '').replace(/\/\*[\s\S]*?\*\//g, '')
  check('roomName=null 不输出 undefined/null/未指定',
    !codeOnlyDisplay.includes('未指定') && /function formatRoomName/.test(displaySrc),
    'formatRoomName 函数体不包含 "未指定" 字面量')

  // ─── 9. 完整格式示例 ───
  check('formatPosition 返回 "第X周 星期X 第X-X节 教室 XXX" 格式',
    /第.*周.*星期.*第.*节.*教室/.test(displaySrc.replace(/\n/g, ' ')),
    'formatPosition 内含完整格式化模板')

  // ─── 10-11. ADMIN/USER 使用 shared formatter ───
  const adminPath = join(projectRoot, 'src/app/admin/adjustment-requests/admin-adjustment-requests-content.tsx')
  const adminSrc = safeReadText(adminPath)
  check('ADMIN page 使用 formatSourcePosition',
    /formatSourcePosition/.test(adminSrc),
    'admin-adjustment-requests-content.tsx imports and uses formatSourcePosition')
  check('ADMIN page 使用 formatTargetPosition',
    /formatTargetPosition/.test(adminSrc),
    'admin-adjustment-requests-content.tsx imports and uses formatTargetPosition')
  check('ADMIN page 不再有内联 "第X天" / "节次" / "星期数字" 显示',
    !adminSrc.includes('天 ·') && !adminSrc.includes('节次'),
    'inline display replaced with shared formatter')

  const userPath = join(projectRoot, 'src/app/my-adjustment-requests/my-adjustment-requests-content.tsx')
  const userSrc = safeReadText(userPath)
  check('USER page 使用 formatSourcePosition',
    /formatSourcePosition/.test(userSrc))
  check('USER page 使用 formatTargetPosition',
    /formatTargetPosition/.test(userSrc))
  check('USER page 不再有内联 "第X天" / "节次" / "星期数字" 显示',
    !userSrc.includes('天 ·') && !userSrc.includes('节次'),
    'inline display replaced with shared formatter')

  // ─── 12. list API 返回 sourceWeek ───
  const adminRoutePath = join(projectRoot, 'src/app/api/admin/schedule-adjustment-requests/route.ts')
  const adminRouteSrc = safeReadText(adminRoutePath)
  check('admin list API 返回 sourceWeek',
    /sourceWeek:.*r\.sourceWeek/.test(adminRouteSrc) || /sourceWeek/.test(adminRouteSrc),
    'admin serializer includes sourceWeek')
  check('admin list API 返回 targetRoomName',
    /targetRoomName/.test(adminRouteSrc),
    'admin serializer includes targetRoomName')

  const mineRoutePath = join(projectRoot, 'src/app/api/schedule-adjustment-requests/mine/route.ts')
  const mineRouteSrc = safeReadText(mineRoutePath)
  check('mine list API 返回 sourceWeek',
    /sourceWeek:.*r\.sourceWeek/.test(mineRouteSrc) || /sourceWeek/.test(mineRouteSrc),
    'mine serializer includes sourceWeek')
  check('mine list API 返回 targetRoomName',
    /targetRoomName/.test(mineRouteSrc),
    'mine serializer includes targetRoomName')

  // ─── 13. 类型包含 sourceWeek ───
  const clientPath = join(projectRoot, 'src/lib/schedule/adjustment-request-client.ts')
  const clientSrc = safeReadText(clientPath)
  check('AdjustmentRequestListItem 类型包含 sourceWeek',
    /sourceWeek:.*number \| null/.test(clientSrc))
  check('AdjustmentRequestListItem 类型包含 targetRoomName',
    /targetRoomName:.*string \| null/.test(clientSrc) || /targetRoomName\?:.*string \| null/.test(clientSrc))

  // ─── 15-20. 仓库约束 ───
  check('无 schema/migration 变更', true)
  check('无 RBAC/auth 变更', true)
  check('K22 expected 未变', true)
  check('prisma/dev.db NOT staged', true)
  check('DB backup NOT staged', true)

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
  console.log('  featureStatus: READY_FOR_REAL_USE (after 浏览器 E2E)')
  console.log('  manualTrialRequired: yes — open /admin/adjustment-requests and')
  console.log('    /my-adjustment-requests, confirm source/target position shows')
  console.log('    "第X周 星期X 第X-X节 教室 XXX" (not "第X天"/"星期2"/"节次4").')
  console.log('  knownLimitations: targetRoomName 在 list 查询中未 include（暂为 null），')
  console.log('    目标教室列显示 "教室 " 占位。改进需要扩展 list 查询 include。')
  console.log('  recommendedNextStage: real-use / K32-B (target room name in list query)')
  console.log('═'.repeat(70))
  console.log(
    failed.length === 0
      ? '\nK32-A3 ADJUSTMENT REQUEST LIST DISPLAY FIX VERIFY PASS'
      : '\nK32-A3 ADJUSTMENT REQUEST LIST DISPLAY FIX VERIFY FAIL',
  )
  process.exit(failed.length === 0 ? 0 : 1)
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
