// scripts/validate-multi-semester-schema-k25-c.ts
// K25-C: Post-migration validation (read-only, no DB writes).
//
// Checks:
//   1. Schema markers: 7 models have semesterId Int (NOT NULL)
//   2. DB null counts: all 7 models have 0 null semesterId
//   3. Consistency checks (see comments per check)
//   4. Migration files exist for k25-multi-semester-not-null
//
// Exit 0 on PASS.

import { readFileSync, existsSync } from 'fs'
import { join } from 'path'
import { prisma } from '@/lib/prisma'

let passed = 0
let failed = 0
const failures: string[] = []

function assert(condition: boolean, message: string) {
  if (condition) {
    passed++
    console.log(`  ✅ ${message}`)
  } else {
    failed++
    failures.push(message)
    console.error(`  ❌ ${message}`)
  }
}

function fileRead(rel: string): string {
  return readFileSync(join(process.cwd(), rel), 'utf-8')
}

function fileExists(rel: string): boolean {
  return existsSync(join(process.cwd(), rel))
}

// ─── A. Schema markers: 7 models have semesterId Int ─────

function testSchemaMarkers() {
  console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━')
  console.log('A. Schema markers (NOT NULL)')
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━')

  const schema = fileRead('prisma/schema.prisma')
  const models = [
    'ClassGroup', 'TeachingTask', 'ScheduleSlot',
    'ScheduleAdjustment', 'SchedulingRun', 'SchedulingConfig',
    'ImportBatch',
  ]

  for (const m of models) {
    const blockRe = new RegExp(`model\\s+${m}\\s*\\{([\\s\\S]*?)\\n\\}`)
    const match = schema.match(blockRe)
    assert(!!match, `model ${m} block found`)
    if (!match) continue
    const body = match[1]
    // semesterId Int (NOT nullable)
    assert(
      /semesterId\s+Int\b(?!\?)/.test(body),
      `${m}.semesterId is Int (NOT NULL)`,
    )
    // relation Semester (NOT optional)
    assert(
      /semester\s+Semester\s+@relation/.test(body),
      `${m}.semester relation is Semester (required)`,
    )
  }
}

// ─── B. DB null counts = 0 ───────────────────────────────

async function testDbNullCounts() {
  console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━')
  console.log('B. DB null counts = 0')
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━')

  const models = [
    'ClassGroup', 'TeachingTask', 'ScheduleSlot',
    'ScheduleAdjustment', 'SchedulingRun', 'SchedulingConfig',
    'ImportBatch',
  ]

  for (const m of models) {
    const result = await prisma.$queryRawUnsafe<Array<{ cnt: number }>>(
      `SELECT COUNT(*) as cnt FROM ${m} WHERE semesterId IS NULL`,
    )
    assertEqual(result[0]?.cnt ?? -1, 0, `${m} null semesterId count = 0`)
  }
}

// ─── C. Consistency checks ───────────────────────────────

async function testConsistency() {
  console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━')
  console.log('C. Consistency checks')
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━')

  // C1. TeachingTaskClass: teachingTask.semesterId === classGroup.semesterId
  const ttc = await prisma.$queryRawUnsafe<Array<{ cnt: number }>>(
    `SELECT COUNT(*) as cnt FROM TeachingTaskClass ttc
     JOIN TeachingTask tt ON ttc.teachingTaskId = tt.id
     JOIN ClassGroup cg ON ttc.classGroupId = cg.id
     WHERE tt.semesterId <> cg.semesterId`,
  )
  assertEqual(ttc[0]?.cnt ?? -1, 0,
    'TeachingTaskClass: teachingTask.semesterId = classGroup.semesterId for all rows')

  // C2. ScheduleSlot: slot.semesterId === teachingTask.semesterId
  const ss = await prisma.$queryRawUnsafe<Array<{ cnt: number }>>(
    `SELECT COUNT(*) as cnt FROM ScheduleSlot ss
     JOIN TeachingTask tt ON ss.teachingTaskId = tt.id
     WHERE ss.semesterId <> tt.semesterId`,
  )
  assertEqual(ss[0]?.cnt ?? -1, 0,
    'ScheduleSlot: semesterId = teachingTask.semesterId for all rows')

  // C3. ScheduleAdjustment: semesterId non-null + consistent with originalSlot
  const sa = await prisma.$queryRawUnsafe<Array<{ cnt: number }>>(
    `SELECT COUNT(*) as cnt FROM ScheduleAdjustment
     WHERE semesterId IS NULL`,
  )
  assertEqual(sa[0]?.cnt ?? -1, 0, 'ScheduleAdjustment: all rows have non-null semesterId')

  // C4. ScheduleAdjustment.semesterId === originalSlot.semesterId
  const saSlot = await prisma.$queryRawUnsafe<Array<{ cnt: number }>>(
    `SELECT COUNT(*) as cnt FROM ScheduleAdjustment sa
     JOIN ScheduleSlot ss ON sa.originalSlotId = ss.id
     WHERE sa.semesterId <> ss.semesterId`,
  )
  assertEqual(saSlot[0]?.cnt ?? -1, 0,
    'ScheduleAdjustment.semesterId = originalSlot.semesterId for all rows')

  // C5. SchedulingRun: semesterId non-null
  const sr = await prisma.$queryRawUnsafe<Array<{ cnt: number }>>(
    `SELECT COUNT(*) as cnt FROM SchedulingRun WHERE semesterId IS NULL`,
  )
  assertEqual(sr[0]?.cnt ?? -1, 0, 'SchedulingRun: all rows have non-null semesterId')

  // C6. SchedulingConfig: semesterId non-null
  const sc = await prisma.$queryRawUnsafe<Array<{ cnt: number }>>(
    `SELECT COUNT(*) as cnt FROM SchedulingConfig WHERE semesterId IS NULL`,
  )
  assertEqual(sc[0]?.cnt ?? -1, 0, 'SchedulingConfig: all rows have non-null semesterId')

  // C7. ImportBatch: semesterId non-null
  const ib = await prisma.$queryRawUnsafe<Array<{ cnt: number }>>(
    `SELECT COUNT(*) as cnt FROM ImportBatch WHERE semesterId IS NULL`,
  )
  assertEqual(ib[0]?.cnt ?? -1, 0, 'ImportBatch: all rows have non-null semesterId')
}

// ─── D. Migration file exists ────────────────────────────

function testMigrationFile() {
  console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━')
  console.log('D. Migration file exists')
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━')

  const migrationDir = 'prisma/migrations/20260607000000_k25_multi_semester_not_null'
  assert(
    fileExists(`${migrationDir}/migration.sql`),
    `Migration file exists: ${migrationDir}/migration.sql`,
  )
  const content = fileRead(`${migrationDir}/migration.sql`)
  assert(
    content.includes('semesterId') && content.includes('NOT NULL'),
    'Migration SQL contains NOT NULL for semesterId',
  )
}

// ─── Helpers ─────────────────────────────────────────────

function assertEqual<T>(a: T, b: T, message: string) {
  // Normalize BigInt to number for comparison (SQLite raw returns BigInt)
  const normA = typeof a === 'bigint' ? Number(a) : a
  const normB = typeof b === 'bigint' ? Number(b) : b
  if (normA === normB) {
    passed++
    console.log(`  ✅ ${message} (${a} === ${b})`)
  } else {
    failed++
    failures.push(`${message} (expected ${b}, got ${a})`)
    console.error(`  ❌ ${message} (expected ${b}, got ${a})`)
  }
}

// ─── Main ───────────────────────────────────────────────

async function main() {
  console.log('🧪 K25-C Multi-Semester Schema Validation')

  testSchemaMarkers()
  await testDbNullCounts()
  await testConsistency()
  testMigrationFile()

  console.log(`\n${'═'.repeat(50)}`)
  console.log(`📊 结果: ${passed} passed, ${failed} failed`)
  console.log(`${'═'.repeat(50)}`)

  if (failed > 0) {
    console.log('\n失败列表:')
    for (const f of failures) {
      console.log(`  - ${f}`)
    }
    await prisma.$disconnect()
    process.exit(1)
  }

  console.log('\n✅ K25-C 多学期 schema 验证全部通过。')
  console.log('   - 7 个核心模型 semesterId 均为 NOT NULL')
  console.log('   - DB null counts 全部 0')
  console.log('   - TeachingTaskClass / ScheduleSlot / ScheduleAdjustment / SchedulingRun / Config / ImportBatch consistency 全部通过')
  console.log('   - Migration 文件已就位')
  await prisma.$disconnect()
  process.exit(0)
}

main().catch(async (e) => {
  console.error('K25-C validation script error:', e)
  await prisma.$disconnect().catch(() => {})
  process.exit(1)
})
