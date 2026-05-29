import { PrismaClient } from '@prisma/client'
import { readFileSync, existsSync } from 'fs'
import { join } from 'path'
import { computeImportParseStats, computeImportParseQuality } from '../src/lib/import/parse-utils'
import type { ImportScheduleRecord } from '../src/types/import'
import { fetchJsonAsAdmin } from './test-auth-helper'

const prisma = new PrismaClient()

async function fetchJson(path: string): Promise<any> {
  const result = await fetchJsonAsAdmin(path)
  return result.data
}

function assert(condition: boolean, message: string) {
  if (!condition) throw new Error(`ASSERTION FAILED: ${message}`)
}

/**
 * 创建临时 pending ImportBatch 用于测试，测试结束后 abandon。
 * 使用 0420 源文件的 parsed JSON，不依赖历史数据库状态。
 */
async function createTempPendingBatch(): Promise<number> {
  // 复用 0420 已解析的 JSON
  const confirmedBatch = await prisma.importBatch.findFirst({
    where: { status: 'confirmed' },
    orderBy: { id: 'asc' },
  })
  if (!confirmedBatch?.parsedJsonPath) {
    throw new Error('No confirmed batch with parsedJsonPath found — cannot create temp pending batch')
  }

  const jsonPath = join(process.cwd(), confirmedBatch.parsedJsonPath)
  if (!existsSync(jsonPath)) {
    throw new Error(`Parsed JSON not found: ${jsonPath}`)
  }

  const records: ImportScheduleRecord[] = JSON.parse(readFileSync(jsonPath, 'utf-8'))
  const stats = computeImportParseStats(records)
  const quality = computeImportParseQuality(records)

  const batch = await prisma.importBatch.create({
    data: {
      filename: 'test-audit-pending-0420.docx',
      originalFilePath: confirmedBatch.originalFilePath,
      parsedJsonPath: confirmedBatch.parsedJsonPath,
      statsJson: JSON.stringify(stats),
      qualityJson: JSON.stringify(quality),
      warningsJson: JSON.stringify(quality.warnings),
      status: 'pending',
      recordCount: records.length,
    },
  })
  return batch.id
}

/** Abandon 临时测试 batch */
async function abandonTempBatch(batchId: number) {
  await prisma.importBatch.updateMany({
    where: { id: batchId, status: 'pending' },
    data: { status: 'abandoned', errorMessage: 'Test cleanup: auto-abandoned' },
  })
}

async function main() {
  console.log('=== Audit Import Batches API ===\n')

  // 1. Query ImportBatch list
  console.log('1. GET /api/admin/import/batches')
  const listData = await fetchJson('/api/admin/import/batches')
  assert(listData.success === true, 'list API should return success=true')
  assert(Array.isArray(listData.batches), 'list API should return batches array')
  console.log(`   Total batches: ${listData.batches.length}`)

  // 2. Find the primary batch (confirmed or rolled_back)
  const confirmedBatch = listData.batches.find((b: any) => b.status === 'confirmed')
  const rolledBackBatch = listData.batches.find((b: any) => b.status === 'rolled_back')
  const primaryBatch = confirmedBatch ?? rolledBackBatch

  if (confirmedBatch) {
    console.log(`   Confirmed batch: #${confirmedBatch.id}`)
  } else if (rolledBackBatch) {
    console.log(`   Rolled back batch: #${rolledBackBatch.id}`)
  } else {
    console.log('   No confirmed or rolled_back batch found')
  }

  // 3. Pending batch — create temp if none exists
  let pendingBatchInList = listData.batches.find((b: any) => b.status === 'pending')
  let tempPendingBatchId: number | null = null

  if (!pendingBatchInList) {
    console.log('   No pending batch found — creating temp for testing...')
    tempPendingBatchId = await createTempPendingBatch()
    // Re-fetch list to include the temp pending batch
    const updatedList = await fetchJson('/api/admin/import/batches')
    pendingBatchInList = updatedList.batches.find((b: any) => b.id === tempPendingBatchId)
    assert(pendingBatchInList != null, 'temp pending batch should appear in list')
    console.log(`   Temp pending batch created: #${tempPendingBatchId}`)
  }
  console.log(`   Pending batch: #${pendingBatchInList.id}`)

  // 4. Verify list API does not expose sensitive fields
  const sensitiveFields = ['statsJson', 'qualityJson', 'warningsJson', 'parsedJsonPath', 'originalFilePath', 'records']
  if (primaryBatch) {
    for (const field of sensitiveFields) {
      assert(!(field in primaryBatch), `list API should not expose ${field}`)
    }
    console.log('   Sensitive fields check: OK')
  }

  // 5. Query primary batch detail
  if (primaryBatch) {
    console.log('\n2. GET /api/admin/import/batches/' + primaryBatch.id)
    const detail = await fetchJson(`/api/admin/import/batches/${primaryBatch.id}`)
    assert(detail.success === true, 'detail API should return success=true')
    const cb = detail.batch
    assert(cb != null, 'detail should contain batch object')

    // Verify detail API does not expose sensitive fields
    for (const field of sensitiveFields) {
      assert(!(field in cb), `detail API should not expose ${field}`)
    }

    if (cb.status === 'confirmed') {
      assert(cb.hasPlaceholderTeachers === false, `hasPlaceholderTeachers should be false, got ${cb.hasPlaceholderTeachers}`)
      console.log('   hasPlaceholderTeachers: false (OK)')
      assert(cb.hasPlaceholderRooms === false, `hasPlaceholderRooms should be false, got ${cb.hasPlaceholderRooms}`)
      console.log('   hasPlaceholderRooms: false (OK)')
      assert(cb.hasOrphanSlots === false, `hasOrphanSlots should be false, got ${cb.hasOrphanSlots}`)
      console.log('   hasOrphanSlots: false (OK)')
      assert(cb.metadataMatch === true, `metadataMatch should be true, got ${cb.metadataMatch}`)
      console.log('   metadataMatch: true (OK)')
    }

    console.log(`   actualCreatedTaskCount:      ${cb.actualCreatedTaskCount}`)
    console.log(`   actualCreatedSlotCount:      ${cb.actualCreatedSlotCount}`)
    console.log(`   actualTeachingTaskClassCount: ${cb.actualTeachingTaskClassCount}`)
    console.log(`   nullTeacherTaskCount:        ${cb.nullTeacherTaskCount}`)
    console.log(`   nullRoomSlotCount:           ${cb.nullRoomSlotCount}`)
  }

  // 6. Query pending batch detail
  console.log('\n3. GET /api/admin/import/batches/' + pendingBatchInList.id)
  const pendingDetail = await fetchJson(`/api/admin/import/batches/${pendingBatchInList.id}`)
  assert(pendingDetail.success === true, 'pending detail API should return success=true')
  const pb = pendingDetail.batch
  assert(pb != null, 'pending detail should contain batch object')

  assert(pb.actualCreatedTaskCount === 0, `pending batch actualCreatedTaskCount should be 0, got ${pb.actualCreatedTaskCount}`)
  assert(pb.actualCreatedSlotCount === 0, `pending batch actualCreatedSlotCount should be 0, got ${pb.actualCreatedSlotCount}`)
  console.log('   Pending batch zero counts: OK')

  assert(pb.stats === null || typeof pb.stats === 'object', 'stats should be deserialized object or null')
  assert(pb.quality === null || typeof pb.quality === 'object', 'quality should be deserialized object or null')
  assert(Array.isArray(pb.warnings), 'warnings should be deserialized array')
  console.log('   Stats/quality/warnings deserialization: OK')

  // Cleanup: abandon temp batch
  if (tempPendingBatchId != null) {
    await abandonTempBatch(tempPendingBatchId)
    console.log(`\n   Temp pending batch #${tempPendingBatchId} abandoned (cleanup)`)
  }

  console.log('\n=== ALL CHECKS PASSED ===')
}

main().catch((e) => {
  console.error('\n=== AUDIT FAILED ===')
  console.error(e)
  process.exit(1)
}).finally(() => {
  prisma.$disconnect()
})
