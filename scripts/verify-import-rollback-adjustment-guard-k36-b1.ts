/**
 * K36-B1 source-only verification.
 *
 * This script reads source files only. It does not connect to Prisma, write a
 * database, or execute an import rollback.
 */

import { readFileSync } from 'fs'
import { join } from 'path'

const root = join(__dirname, '..')

function read(relativePath: string): string {
  return readFileSync(join(root, relativePath), 'utf8')
}

const rollback = read('src/lib/import/rollback.ts')
const route = read('src/app/api/admin/import/rollback/route.ts')
const schema = read('prisma/schema.prisma')

const checks: Array<{ name: string; pass: boolean }> = []

function check(name: string, pass: boolean): void {
  checks.push({ name, pass })
  console.log(`${pass ? 'PASS' : 'FAIL'} ${name}`)
}

const transactionStart = rollback.indexOf('const result = await prisma.$transaction')
const transactionGuard = rollback.indexOf(
  'const referenceSummary = await inspectRollbackSlotReferences(tx, batchId)',
  transactionStart,
)
const transactionDelete = rollback.indexOf(
  'const deletedScheduleSlots = await tx.scheduleSlot.deleteMany',
  transactionStart,
)

check(
  'schema confirms ScheduleAdjustment.originalSlot cascade risk',
  /originalSlot\s+ScheduleSlot\s+@relation\([^)]*onDelete:\s*Cascade/.test(schema),
)
check(
  'schema confirms ScheduleAdjustmentRequest source slot reference',
  /sourceScheduleSlot\s+ScheduleSlot\s+@relation\(fields:\s*\[sourceScheduleSlotId\]/.test(schema),
)
check(
  'schema confirms SchedulerRunChange scheduleSlotId audit field',
  /model SchedulerRunChange[\s\S]*scheduleSlotId\s+Int/.test(schema),
)
check(
  'guard queries ScheduleAdjustment references',
  rollback.includes('client.scheduleAdjustment.findMany') &&
    rollback.includes('originalSlotId: { in: slotIds }'),
)
check(
  'guard queries ScheduleAdjustmentRequest references',
  rollback.includes('client.scheduleAdjustmentRequest.findMany') &&
    rollback.includes('sourceScheduleSlotId: { in: slotIds }'),
)
check(
  'guard queries SchedulerRunChange references',
  rollback.includes('client.schedulerRunChange.findMany') &&
    rollback.includes('scheduleSlotId: { in: slotIds }'),
)
check(
  'dry-run plan exposes additive blocking summary',
  rollback.includes('blockingCode: string | null') &&
    rollback.includes('blockingSlotCount: number') &&
    rollback.includes('blockingReferenceCount: number') &&
    rollback.includes('referenceTypes: Record<string, number>') &&
    rollback.includes('affectedSlotIds: number[]'),
)
check(
  'blocking code is stable',
  rollback.includes("'ROLLBACK_BLOCKED_BY_ADJUSTMENT_REFERENCES'"),
)
check(
  'real rollback re-checks guard before slot deletion in transaction',
  transactionStart >= 0 &&
    transactionGuard > transactionStart &&
    transactionDelete > transactionGuard,
)
check(
  'route returns additive 409 blocking response',
  route.includes('RollbackBlockedBySlotReferencesError') &&
    route.includes('code: error.code') &&
    route.includes('blockingReferenceCount: error.summary.blockingReferenceCount') &&
    route.includes('{ status: 409 }'),
)
check(
  'guard does not delete adjustment records',
  !/scheduleAdjustment\.delete|scheduleAdjustment\.deleteMany/.test(rollback),
)
check(
  'guard does not detach or null adjustment slot references',
  !/originalSlotId:\s*null|sourceScheduleSlotId:\s*null|disconnect:\s*true/.test(rollback),
)

const failures = checks.filter((item) => !item.pass)
console.log(`\nK36-B1 verification: ${checks.length - failures.length}/${checks.length} passed`)

if (failures.length > 0) {
  process.exitCode = 1
}
