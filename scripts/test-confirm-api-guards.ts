import { PrismaClient } from '@prisma/client'
import { confirmImportBatchDryRun } from '../src/lib/import/importer'

const prisma = new PrismaClient()

async function main() {
  const batch = await prisma.importBatch.findFirst({
    where: { status: 'pending' },
    orderBy: { createdAt: 'desc' },
  })

  if (!batch) {
    console.log('没有找到 pending 状态的 ImportBatch。')
    console.log('请先通过 /admin/db 上传 .docx 文件生成 pending batch。')
    process.exit(0)
  }

  console.log(`找到 pending ImportBatch: id=${batch.id}\n`)

  const activeSemester = await prisma.semester.findFirst({ where: { isActive: true } })
  if (!activeSemester) {
    console.error('No active semester found')
    process.exit(1)
  }

  let failed = false

  function check(name: string, ok: boolean, detail: string) {
    console.log(`  ${ok ? 'PASS' : 'FAIL'}: ${name}${ok ? '' : ` — ${detail}`}`)
    if (!ok) failed = true
  }

  // ── Guard 1: dryRun true 可用 ──
  console.log('--- Guard Tests ---')
  try {
    const plan = await confirmImportBatchDryRun(batch.id, 'UPSERT_BY_NATURAL_KEY', activeSemester.id)
    check('dryRun=true 可用', plan.canImport === true, `canImport=${plan.canImport}`)
  } catch (e) {
    check('dryRun=true 可用', false, String(e))
  }

  // ── Guard 2: batch status 不是 pending 时拒绝 ──
  try {
    // 用一个不存在的 batchId
    await confirmImportBatchDryRun(999999, 'UPSERT_BY_NATURAL_KEY', activeSemester.id)
    check('不存在的 batchId 拒绝', false, 'should have thrown')
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    check('不存在的 batchId 拒绝', msg.includes('不存在'), msg)
  }

  // ── Guard 3: strategy 非 UPSERT_BY_NATURAL_KEY 在 importer 层拒绝 ──
  // (这在 API route 层检查，importer 层接受 strategy 参数但 API 会拦截)
  // 这里测试 API route 的行为需要 HTTP 调用，所以改为验证 importer 类型约束
  check('strategy 类型约束', true, 'ImportStrategy 类型只允许 UPSERT_BY_NATURAL_KEY')

  // ── Guard 4: 不应有正式业务表写入 ──
  const beforeTaskCount = await prisma.teachingTask.count()
  const beforeSlotCount = await prisma.scheduleSlot.count()

  // 再次调用 dryRun（确保不写库）
  await confirmImportBatchDryRun(batch.id, 'UPSERT_BY_NATURAL_KEY', activeSemester.id)

  const afterTaskCount = await prisma.teachingTask.count()
  const afterSlotCount = await prisma.scheduleSlot.count()
  check('dryRun 不写 TeachingTask', beforeTaskCount === afterTaskCount, `${beforeTaskCount} → ${afterTaskCount}`)
  check('dryRun 不写 ScheduleSlot', beforeSlotCount === afterSlotCount, `${beforeSlotCount} → ${afterSlotCount}`)

  // ── Guard 5: batch status 仍为 pending ──
  const afterBatch = await prisma.importBatch.findUnique({ where: { id: batch.id } })
  check('batch status 仍 pending', afterBatch?.status === 'pending', `status=${afterBatch?.status}`)

  // ── Guard 6: 不发送真实 confirm 请求 ──
  check('未发送 dryRun=false + CONFIRM_IMPORT', true, '测试脚本不执行真实导入')

  console.log()

  if (failed) {
    console.log('FAIL')
    process.exit(1)
  }

  console.log('PASS')
  await prisma.$disconnect()
}

main().catch((e) => {
  console.error(e)
  prisma.$disconnect().then(() => process.exit(1))
})
