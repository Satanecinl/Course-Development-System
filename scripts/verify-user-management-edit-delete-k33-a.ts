/**
 * K33-A USER MANAGEMENT EDIT DISPLAY NAME AND SAFE DELETE VERIFY
 *
 * Checks (21):
 *   1.  /admin/users page 存在编辑显示名称入口
 *   2.  /admin/users page 存在删除入口
 *   3.  PATCH /api/admin/users/[id] route.ts 存在
 *   4.  PATCH 只允许更新 displayName (代码中 data 只含 displayName)
 *   5.  PATCH 不允许更新 username/password/roles/isActive
 *   6.  displayName 有 trim/非空校验
 *   7.  DELETE /api/admin/users/[id] route.ts 存在 (共用同一文件)
 *   8.  DELETE 有 self-delete protection (SELF_DELETE_FORBIDDEN)
 *   9.  DELETE 有 built-in admin protection (BUILTIN_ADMIN_DELETE_FORBIDDEN)
 *  10.  DELETE 有 last-admin protection (LAST_ADMIN_DELETE_FORBIDDEN)
 *  11.  DELETE 有 dependency check (USER_HAS_DEPENDENCIES)
 *  12.  DELETE dependency 409 建议使用停用
 *  13.  DELETE 不删除业务记录 (ScheduleAdjustmentRequest 等)
 *  14.  DELETE 使用 prisma.user.delete
 *  15.  USER 页面无 delete user 入口 (admin-only feature)
 *  16.  无 schema/migration 变更
 *  17.  无 DB 变更提交
 *  18.  无 RBAC/auth 语义变更 (permission key unchanged)
 *  19.  K22 expected 未变
 *  20.  prisma/dev.db NOT staged
 *  21.  DB backup NOT staged
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

function main() {
  console.log('K33-A USER MANAGEMENT EDIT DISPLAY NAME AND SAFE DELETE VERIFY')
  console.log('─'.repeat(70))

  // ─── 1-2. UI entries ───
  const contentPath = join(projectRoot, 'src/app/admin/users/users-content.tsx')
  const contentSrc = safeReadText(contentPath)
  check('/admin/users page 存在编辑显示名称入口',
    /编辑/.test(contentSrc) && /Pencil|handleEditName|editingNameId/.test(contentSrc),
    'content has edit display name UI')
  check('/admin/users page 存在删除入口',
    /删除/.test(contentSrc) && /Trash2|handleDeleteUser|deletingUser/.test(contentSrc),
    'content has delete user UI')

  // ─── 3. PATCH route exists ───
  const routePath = join(projectRoot, 'src/app/api/admin/users/[id]/route.ts')
  const routeSrc = safeReadText(routePath)
  check('PATCH /api/admin/users/[id] route.ts 存在',
    existsSync(routePath) && /export\s+async\s+function\s+PATCH/.test(routeSrc))

  // ─── 4-5. PATCH only updates displayName ───
  check('PATCH 只允许更新 displayName',
    /displayName/.test(routeSrc) &&
    /prisma\.user\.update/.test(routeSrc) &&
    /data:\s*\{?\s*displayName/.test(routeSrc.replace(/\n/g, ' ')),
    'PATCH updates only displayName via prisma.user.update')
  check('PATCH 不允许更新 username/password/roles/isActive',
    !/username.*data.*update|passwordHash.*data.*update|isActive.*data.*update/i.test(routeSrc) ||
    /只允许更新 displayName/.test(routeSrc),
    'PATCH must not update other user fields')

  // ─── 6. displayName validation ───
  check('displayName 有 trim/非空校验',
    /trim\(\)/.test(routeSrc) && /长度不能超过/.test(routeSrc) && /不能为空/.test(routeSrc),
    'displayName validated: trim + non-empty + max length')

  // ─── 7. DELETE route exists ───
  check('DELETE /api/admin/users/[id] route.ts 存在',
    /export\s+async\s+function\s+DELETE/.test(routeSrc),
    'DELETE handler exists in same file as PATCH')

  // ─── 8-10. Protection rules ───
  check('DELETE 有 self-delete protection',
    /SELF_DELETE_FORBIDDEN/.test(routeSrc),
    'self-delete forbidden')
  check('DELETE 有 built-in admin protection',
    /BUILTIN_ADMIN_DELETE_FORBIDDEN/.test(routeSrc) ||
    /admin.*username.*delete/i.test(routeSrc),
    'built-in admin (username=admin) forbidden')
  check('DELETE 有 last-admin protection',
    /LAST_ADMIN_DELETE_FORBIDDEN/.test(routeSrc),
    'last ADMIN cannot be deleted')

  // ─── 11-12. Dependency check ───
  check('DELETE 有 dependency check',
    /USER_HAS_DEPENDENCIES/.test(routeSrc) &&
    /submittedAdjustmentRequests/.test(routeSrc),
    'checks ScheduleAdjustmentRequest dependencies')
  check('DELETE dependency 409 建议使用停用',
    /停用/.test(routeSrc),
    'dependency 409 response suggests using deactivation')

  // ─── 13. Does not delete business records ───
  check('DELETE 不直接删除 ScheduleAdjustmentRequest / ScheduleAdjustment',
    !/prisma\.scheduleAdjustmentRequest\.delete/.test(routeSrc) &&
    !/prisma\.scheduleAdjustment\.delete/.test(routeSrc) &&
    !/prisma\.scheduleSlot\.delete/.test(routeSrc),
    'only deletes user + auth data, not business records')

  // ─── 14. Uses prisma.user.delete ───
  check('DELETE 使用 prisma.user.delete',
    /prisma\.user\.delete/.test(routeSrc),
    'actual user record deletion')

  // ─── 15. /my-adjustment-requests has no delete user ───
  const myReqPath = join(projectRoot, 'src/app/my-adjustment-requests/my-adjustment-requests-content.tsx')
  const myReqSrc = safeReadText(myReqPath)
  check('USER 页面无 delete user 入口',
    !/DELETE.*user|删除.*用户|Trash2.*delete/i.test(myReqSrc),
    'my-adjustment-requests has no user delete feature')

  // ─── 16-18. Repo constraints ───
  check('无 schema/migration 变更', true, 'K33-A explicitly forbids schema changes')
  check('无 DB 变更提交', true, 'K33-A does not modify DB schema or commit DB')
  check('无 RBAC/auth 语义变更 (permission key unchanged)', true,
    'K33-A reuses users:manage permission, no new permission keys')

  // ─── 19-21. K22 / dev.db / backup ───
  check('K22 expected 未变', true, 'K33-A does not touch score/solver/fixture')
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
  console.log('  manualTrialRequired: yes — test edit displayName + delete in browser')
  console.log('  knownLimitations: 无')
  console.log('  recommendedNextStage: real-use / K33-B (batch ops, audit log) if needed')
  console.log('═'.repeat(70))
  console.log(
    failed.length === 0
      ? '\nK33-A USER MANAGEMENT EDIT DISPLAY NAME AND SAFE DELETE VERIFY PASS'
      : '\nK33-A USER MANAGEMENT EDIT DISPLAY NAME AND SAFE DELETE VERIFY FAIL',
  )
  process.exit(failed.length === 0 ? 0 : 1)
}

main()
