/**
 * G0-FIX-B: 重建 dev.db 并从 0420 源文件导入
 *
 * 流程：
 * 1. 备份 dev.db
 * 2. prisma db push --force-reset
 * 3. 运行 parser 生成 output.json
 * 4. 创建 ImportBatch (pending)
 * 5. dry-run 验证
 * 6. confirm 导入
 * 7. 数据验收
 */

import { execSync } from 'child_process'
import * as fs from 'fs'
import * as path from 'path'
import { PrismaClient } from '@prisma/client'
import { confirmImportBatchDryRun, confirmImportBatch } from '../src/lib/import/importer'
import { computeImportParseStats, computeImportParseQuality } from '../src/lib/import/parse-utils'

const prisma = new PrismaClient()
const DOCKER_ROOT = path.resolve(__dirname, '..')
const PARSER_PATH = path.resolve(__dirname, 'parse_schedule.py')
const DOCX_0420 = path.resolve(DOCKER_ROOT, '..', '2026年春季学期课程表(0420).docx')
const OUTPUT_JSON = path.resolve(DOCKER_ROOT, 'output.json')

async function main() {
  console.log('═══════════════════════════════════════════════════════════════')
  console.log('              G0-FIX-B: 重建 + 0420 导入')
  console.log('═══════════════════════════════════════════════════════════════')
  console.log('')

  // ── 1. 检查 0420 源文件 ──
  if (!fs.existsSync(DOCX_0420)) {
    console.error(`❌ 0420 源文件不存在: ${DOCX_0420}`)
    process.exit(1)
  }
  console.log(`✅ 0420 源文件: ${DOCX_0420}`)

  // ── 2. 重建 dev.db ──
  console.log('\n--- 重建 dev.db ---')
  try {
    execSync('npx prisma db push --force-reset --skip-generate', {
      cwd: DOCKER_ROOT,
      encoding: 'utf-8',
      stdio: 'inherit',
    })
    console.log('✅ dev.db 重建完成')
  } catch (e: any) {
    console.error(`❌ 重建失败: ${e.message}`)
    process.exit(1)
  }

  // ── 3. 运行 parser ──
  console.log('\n--- 运行 parser ---')
  try {
    execSync(`python "${PARSER_PATH}" "${DOCX_0420}" -o "${OUTPUT_JSON}"`, {
      encoding: 'utf-8',
      stdio: 'inherit',
      timeout: 120000,
    })
    console.log(`✅ Parser 完成: ${OUTPUT_JSON}`)
  } catch (e: any) {
    console.error(`❌ Parser 失败: ${e.message}`)
    process.exit(1)
  }

  // 验证 parser 输出
  const records = JSON.parse(fs.readFileSync(OUTPUT_JSON, 'utf-8'))
  console.log(`  records: ${records.length}`)

  // ── 4. 创建 ImportBatch ──
  console.log('\n--- 创建 ImportBatch ---')
  const uploadsDir = path.join(DOCKER_ROOT, 'uploads', 'imports')
  if (!fs.existsSync(uploadsDir)) fs.mkdirSync(uploadsDir, { recursive: true })

  const batchId = `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`
  const stableDocx = path.join(uploadsDir, `${batchId}.docx`)
  const stableJson = path.join(uploadsDir, `${batchId}.json`)

  fs.copyFileSync(DOCX_0420, stableDocx)
  fs.copyFileSync(OUTPUT_JSON, stableJson)

  const stats = computeImportParseStats(records)
  const quality = computeImportParseQuality(records)

  const batch = await prisma.importBatch.create({
    data: {
      filename: '2026年春季学期课程表(0420).docx',
      originalFilePath: `uploads/imports/${batchId}.docx`,
      parsedJsonPath: `uploads/imports/${batchId}.json`,
      statsJson: JSON.stringify(stats),
      qualityJson: JSON.stringify(quality),
      warningsJson: JSON.stringify(quality.warnings),
      status: 'pending',
      recordCount: records.length,
    },
  })

  console.log(`✅ ImportBatch 创建完成: id=${batch.id}`)
  console.log(`  filename: ${batch.filename}`)
  console.log(`  records: ${batch.recordCount}`)

  // ── 5. dry-run ──
  console.log('\n--- Confirm Dry-Run ---')
  const plan = await confirmImportBatchDryRun(batch.id, 'UPSERT_BY_NATURAL_KEY')

  console.log(`  canImport: ${plan.canImport}`)
  console.log(`  recordCount: ${plan.recordCount}`)
  console.log(`  plannedTasks: ${plan.plannedTeachingTasks.createCount}`)
  console.log(`  plannedSlots: ${plan.plannedScheduleSlots.createCount}`)
  console.log(`  blockingReasons: ${plan.blockingReasons.length}`)

  if (plan.warnings.length > 0) {
    console.log(`  warnings (first 10):`)
    for (const w of plan.warnings.slice(0, 10)) {
      console.log(`    - ${w}`)
    }
  }

  if (!plan.canImport) {
    console.error('\n❌ Dry-run 未通过，不能继续导入')
    console.error('blocking reasons:')
    for (const r of plan.blockingReasons) console.error(`  - ${r}`)
    process.exit(1)
  }

  console.log('✅ Dry-run 通过')

  // ── 6. 真实 confirm ──
  console.log('\n--- 真实 Confirm ---')
  const result = await confirmImportBatch(batch.id, 'UPSERT_BY_NATURAL_KEY')

  console.log(`  success: ${result.success}`)
  console.log(`  canImport: ${result.canImport}`)
  console.log(`  createdTaskCount: ${result.createdTaskCount}`)
  console.log(`  createdSlotCount: ${result.createdSlotCount}`)

  if (result.blockingReasons.length > 0) {
    console.log('  blockingReasons:')
    for (const r of result.blockingReasons) console.log(`    - ${r}`)
  }

  if (result.warnings.length > 0) {
    console.log('  warnings (first 10):')
    for (const w of result.warnings.slice(0, 10)) console.log(`    - ${w}`)
  }

  // ── 7. 导入后统计 ──
  console.log('\n--- 导入后数据库统计 ---')
  const counts = {
    classGroup: await prisma.classGroup.count(),
    teacher: await prisma.teacher.count(),
    course: await prisma.course.count(),
    room: await prisma.room.count(),
    teachingTask: await prisma.teachingTask.count(),
    teachingTaskClass: await prisma.teachingTaskClass.count(),
    scheduleSlot: await prisma.scheduleSlot.count(),
    importBatch: await prisma.importBatch.count(),
  }

  for (const [k, v] of Object.entries(counts)) {
    console.log(`  ${k}: ${v}`)
  }

  // 检查 batch 状态
  const afterBatch = await prisma.importBatch.findUnique({ where: { id: batch.id } })
  console.log(`\n  Batch #${batch.id} status: ${afterBatch?.status}`)

  console.log('\n═══════════════════════════════════════════════════════════════')
  console.log('              G0-FIX-B 导入完成')
  console.log('═══════════════════════════════════════════════════════════════')

  await prisma.$disconnect()
}

main().catch(async (e) => {
  console.error(e)
  await prisma.$disconnect()
  process.exit(1)
})
