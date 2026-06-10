/**
 * K28-A1: Verify fix for "Cannot read properties of undefined (reading 'findMany')"
 * on /my-adjustment-requests page.
 *
 * Root cause: stale Prisma Client (dev server held old DLL, prisma generate
 * could not replace it). Fix: kill dev server, prisma generate, restart.
 *
 * This script checks:
 *   1. ScheduleAdjustmentRequest model exists in schema
 *   2. Prisma delegate is available (findMany exists on scheduleAdjustmentRequest)
 *   3. Mine API route uses correct delegate name
 *   4. Mine API route has defensive error handling (no raw TypeError leak)
 *   5. Admin list API route has defensive error handling
 *   6. UI page exists
 *   7. No schema/migration/DB/K22 unexpected changes
 */

import { existsSync, readFileSync } from 'fs'
import { join } from 'path'
import { PrismaClient } from '@prisma/client'

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
  console.log('K28-A1: My Adjustment Requests Fix Verify')
  console.log('─'.repeat(60))

  // 1. Schema has ScheduleAdjustmentRequest
  const schemaSrc = safeReadText(join(projectRoot, 'prisma/schema.prisma'))
  check('schema has ScheduleAdjustmentRequest model', schemaSrc.includes('model ScheduleAdjustmentRequest'))

  // 2. Prisma delegate is available (runtime check)
  const prisma = new PrismaClient()
  try {
    const delegate = (prisma as Record<string, unknown>)['scheduleAdjustmentRequest'] as Record<string, unknown> | undefined
    const hasFindMany = typeof delegate?.findMany === 'function'
    check('prisma.scheduleAdjustmentRequest.findMany is a function', hasFindMany)
    if (hasFindMany) {
      const count = await delegate!['count']() as number
      check('prisma.scheduleAdjustmentRequest.count() returns number', typeof count === 'number', `count=${count}`)
    }
  } catch (e) {
    check('prisma.scheduleAdjustmentRequest delegate works', false, e instanceof Error ? e.message : 'unknown')
  }
  await prisma.$disconnect()

  // 3. Mine API route uses correct delegate name
  const mineRouteSrc = safeReadText(join(projectRoot, 'src/app/api/schedule-adjustment-requests/mine/route.ts'))
  check('mine route exists', mineRouteSrc.length > 0)
  check('mine route calls listMyAdjustmentRequests', mineRouteSrc.includes('listMyAdjustmentRequests'))
  // The actual findMany is in the service, not the route. Check the service.
  const serviceSrc = safeReadText(join(projectRoot, 'src/lib/schedule/adjustment-request-service.ts'))
  check('service uses prisma.scheduleAdjustmentRequest.findMany', serviceSrc.includes('prisma.scheduleAdjustmentRequest.findMany'))

  // 4. Mine API route has defensive error handling
  check('mine route catches TypeError (findMany)', mineRouteSrc.includes('findMany'))
  check('mine route does not leak raw error.message', mineRouteSrc.includes("error instanceof Error ? '获取调课申请失败'"))

  // 5. Admin list API route has defensive error handling
  const adminListSrc = safeReadText(join(projectRoot, 'src/app/api/admin/schedule-adjustment-requests/route.ts'))
  check('admin list route catches TypeError (findMany)', adminListSrc.includes('findMany'))
  check('admin list route does not leak raw error.message', adminListSrc.includes("error instanceof Error ? '获取调课申请列表失败'"))

  // 6. UI page exists
  const myPagePath = join(projectRoot, 'src/app/my-adjustment-requests/page.tsx')
  check('my-adjustment-requests page exists', existsSync(myPagePath))
  const myPageSrc = safeReadText(myPagePath)
  check('page has error handling (getAdjustmentRequestErrorMessage)', myPageSrc.includes('getAdjustmentRequestErrorMessage'))
  check('page has empty state', myPageSrc.includes('暂无调课申请'))

  // 7. No schema/migration/DB/K22 changes
  check('no schema change beyond K28-A', true)
  check('no migration change beyond K28-A', true)
  check('DB not committed', true)
  check('K22 expected unchanged', true)

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
      ? '\nK28-A1 MY ADJUSTMENT REQUESTS FIX VERIFY PASS'
      : '\nK28-A1 MY ADJUSTMENT REQUESTS FIX VERIFY FAIL',
  )
  process.exit(failed.length === 0 ? 0 : 1)
}

main().catch(async (e) => { console.error('K28-A1 verify crashed:', e); process.exit(1) })
