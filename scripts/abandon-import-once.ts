import { PrismaClient } from '@prisma/client'

const prisma = new PrismaClient()
const BASE_URL = 'http://localhost:3000'

async function main() {
  if (process.env.ABANDON_IMPORT !== '1') {
    console.log('⚠️  This script mutates the database.')
    console.log('Run with ABANDON_IMPORT=1 to execute:')
    console.log()
    console.log('  ABANDON_IMPORT=1 npx tsx scripts/abandon-import-once.ts')
    console.log()
    process.exit(0)
  }

  const batch = await prisma.importBatch.findFirst({
    where: { status: 'pending' },
    orderBy: { id: 'desc' },
  })

  if (!batch) {
    console.log('No pending ImportBatch found.')
    console.log('Nothing to abandon.')
    process.exit(0)
  }

  console.log(`Found pending ImportBatch: id=${batch.id}\n`)

  // Record counts before
  const before = {
    batchStatus: (await prisma.importBatch.findUnique({ where: { id: batch.id } }))!.status,
  }

  console.log('--- Before ---')
  console.log(`  batchStatus: ${before.batchStatus}`)
  console.log()

  try {
    const res = await fetch(`${BASE_URL}/api/admin/import/batches/${batch.id}/abandon`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ confirmText: 'ABANDON_IMPORT' }),
    })

    const data = await res.json()

    if (!res.ok || !data.success) {
      throw new Error(data.error || `HTTP ${res.status}`)
    }

    console.log('--- Abandon Result ---')
    console.log(`  batchId: ${data.batchId}`)
    console.log(`  status:  ${data.status}`)
    console.log()

    // Record counts after
    const afterBatch = await prisma.importBatch.findUnique({ where: { id: batch.id } })
    console.log(`Batch status: ${afterBatch?.status}`)
    console.log(`errorMessage: ${afterBatch?.errorMessage}`)
    console.log('\nDONE')
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e)
    console.error(`\nAbandon failed: ${msg}`)
    const afterBatch = await prisma.importBatch.findUnique({ where: { id: batch.id } })
    console.log(`Batch status: ${afterBatch?.status}`)
    process.exit(1)
  } finally {
    await prisma.$disconnect()
  }
}

main()
