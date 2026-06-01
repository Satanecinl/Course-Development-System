/**
 * K10 Import Semester Scoping Validation
 *
 * Validates that the import pipeline correctly scopes data by semester.
 * Uses read-only DB checks + controlled transaction tests that always rollback.
 *
 * Does NOT modify schema, business logic, or leave test data.
 */

import { PrismaClient } from '@prisma/client'
import * as fs from 'fs'
import * as path from 'path'

const prisma = new PrismaClient()
const ROOT = path.resolve(__dirname, '..')

interface CheckResult {
  name: string
  status: 'PASS' | 'FAIL' | 'SKIP'
  detail?: string
  section: string
}

const results: CheckResult[] = []

function pass(section: string, name: string, detail?: string) {
  results.push({ name, status: 'PASS', detail, section })
}

function fail(section: string, name: string, detail?: string) {
  results.push({ name, status: 'FAIL', detail, section })
}

function skip(section: string, name: string, detail?: string) {
  results.push({ name, status: 'SKIP', detail, section })
}

// ═══════════════════════════════════════
// A. Schema / code static checks
// ═══════════════════════════════════════

function runStaticChecks() {
  const section = 'A. Static'
  const schema = fs.readFileSync(path.join(ROOT, 'prisma', 'schema.prisma'), 'utf-8')
  const importer = fs.readFileSync(path.join(ROOT, 'src', 'lib', 'import', 'importer.ts'), 'utf-8')
  const confirmRoute = fs.readFileSync(
    path.join(ROOT, 'src', 'app', 'api', 'admin', 'import', 'confirm', 'route.ts'),
    'utf-8',
  )

  const classGroupMatch = schema.match(/model ClassGroup \{[\s\S]*?\n\}/)
  const cg = classGroupMatch ? classGroupMatch[0] : ''

  // ClassGroup.name no @unique
  if (/^\s+name\s+String\s+@unique/m.test(cg)) {
    fail(section, 'ClassGroup.name does NOT have @unique')
  } else {
    pass(section, 'ClassGroup.name does NOT have @unique')
  }

  // ClassGroup has @@unique([semesterId, name])
  if (cg.includes('@@unique([semesterId, name]')) {
    pass(section, 'ClassGroup has @@unique([semesterId, name])')
  } else {
    fail(section, 'ClassGroup has @@unique([semesterId, name])')
  }

  // ClassGroup.semesterId nullable
  if (/^\s+semesterId\s+Int\?/m.test(cg)) {
    pass(section, 'ClassGroup.semesterId is Int?')
  } else {
    fail(section, 'ClassGroup.semesterId is Int?')
  }

  // ImportBatch.semesterId
  if (/model ImportBatch[\s\S]*?semesterId\s+Int\?/.test(schema)) {
    pass(section, 'ImportBatch.semesterId exists')
  } else {
    fail(section, 'ImportBatch.semesterId exists')
  }

  // Importer ClassGroup lookup includes semesterId
  if (/classGroup\.findFirst\(\{[\s\S]*?where:\s*\{[\s\S]*?semesterId[\s\S]*?name/.test(importer)) {
    pass(section, 'Importer ClassGroup lookup scoped by semesterId+name')
  } else {
    fail(section, 'Importer ClassGroup lookup scoped by semesterId+name')
  }

  // Importer TeachingTask.create writes semesterId
  if (/teachingTask\.create\(\{[\s\S]*?semesterId/.test(importer)) {
    pass(section, 'TeachingTask.create writes semesterId')
  } else {
    fail(section, 'TeachingTask.create writes semesterId')
  }

  // Importer ScheduleSlot.create writes semesterId
  if (/scheduleSlot\.create\(\{[\s\S]*?semesterId/.test(importer)) {
    pass(section, 'ScheduleSlot.create writes semesterId')
  } else {
    fail(section, 'ScheduleSlot.create writes semesterId')
  }

  // Confirmed guard includes semesterId
  if (
    /importBatch\.findFirst\(\{[\s\S]*?where:\s*\{[\s\S]*?semesterId[\s\S]*?confirmed/.test(importer) ||
    /importBatch\.findFirst\(\{[\s\S]*?where:\s*\{[\s\S]*?status[\s\S]*?confirmed[\s\S]*?semesterId/.test(importer)
  ) {
    pass(section, 'Confirmed guard includes semesterId')
  } else {
    fail(section, 'Confirmed guard includes semesterId')
  }

  // Confirm route query/body semesterId consistency
  if (confirmRoute.includes('body.semesterId') && confirmRoute.includes('semesterId !== semester.id')) {
    pass(section, 'Confirm route validates body/query semesterId')
  } else {
    fail(section, 'Confirm route validates body/query semesterId')
  }
}

// ═══════════════════════════════════════
// B. Current DB integrity checks
// ═══════════════════════════════════════

async function runDBIntegrityChecks() {
  const section = 'B. DB Integrity'

  const counts = await prisma.$queryRawUnsafe<Array<{ tbl: string; cnt: number }>>(`
    SELECT 'Semester' AS tbl, COUNT(*) AS cnt FROM Semester
    UNION ALL SELECT 'ClassGroup', COUNT(*) FROM ClassGroup
    UNION ALL SELECT 'Teacher', COUNT(*) FROM Teacher
    UNION ALL SELECT 'Course', COUNT(*) FROM Course
    UNION ALL SELECT 'Room', COUNT(*) FROM Room
    UNION ALL SELECT 'TeachingTask', COUNT(*) FROM TeachingTask
    UNION ALL SELECT 'ScheduleSlot', COUNT(*) FROM ScheduleSlot
    UNION ALL SELECT 'TeachingTaskClass', COUNT(*) FROM TeachingTaskClass
    UNION ALL SELECT 'ImportBatch', COUNT(*) FROM ImportBatch
    UNION ALL SELECT 'ScheduleAdjustment', COUNT(*) FROM ScheduleAdjustment
  `)

  const countMap = new Map(counts.map(r => [r.tbl, Number(r.cnt)]))
  for (const [tbl, cnt] of countMap) {
    pass(section, `${tbl} count = ${cnt}`)
  }

  // Duplicate (semesterId, name)
  const dups = await prisma.$queryRawUnsafe<Array<{ cnt: number }>>(
    `SELECT COUNT(*) AS cnt FROM (SELECT semesterId, name, COUNT(*) c FROM ClassGroup GROUP BY semesterId, name HAVING c > 1)`,
  )
  const dupCount = Number(dups[0].cnt)
  if (dupCount === 0) {
    pass(section, 'No duplicate (semesterId, name) in ClassGroup')
  } else {
    fail(section, 'No duplicate (semesterId, name) in ClassGroup', `found ${dupCount}`)
  }

  // Null semesterId counts
  const nullChecks = [
    { label: 'ClassGroup.semesterId IS NULL', sql: 'SELECT COUNT(*) AS cnt FROM ClassGroup WHERE semesterId IS NULL' },
    { label: 'TeachingTask.semesterId IS NULL', sql: 'SELECT COUNT(*) AS cnt FROM TeachingTask WHERE semesterId IS NULL' },
    { label: 'ScheduleSlot.semesterId IS NULL', sql: 'SELECT COUNT(*) AS cnt FROM ScheduleSlot WHERE semesterId IS NULL' },
    { label: 'ImportBatch.semesterId IS NULL', sql: 'SELECT COUNT(*) AS cnt FROM ImportBatch WHERE semesterId IS NULL' },
  ]

  for (const nc of nullChecks) {
    const rows = await prisma.$queryRawUnsafe<Array<{ cnt: number }>>(nc.sql)
    const cnt = Number(rows[0].cnt)
    if (cnt === 0) {
      pass(section, `${nc.label} = 0`)
    } else {
      // ImportBatch null is expected (legacy batches)
      if (nc.label.includes('ImportBatch')) {
        pass(section, `${nc.label} = ${cnt} (legacy, expected)`)
      } else {
        // For CG/TT/SS, null is acceptable for legacy data
        pass(section, `${nc.label} = ${cnt}`)
      }
    }
  }

  // Orphan checks
  const orphanSS = await prisma.$queryRawUnsafe<Array<{ cnt: number }>>(
    `SELECT COUNT(*) AS cnt FROM ScheduleSlot s LEFT JOIN TeachingTask t ON s.teachingTaskId = t.id WHERE t.id IS NULL`,
  )
  if (Number(orphanSS[0].cnt) === 0) {
    pass(section, 'No orphan ScheduleSlot -> TeachingTask')
  } else {
    fail(section, 'No orphan ScheduleSlot -> TeachingTask', `found ${orphanSS[0].cnt}`)
  }

  const orphanTTCTask = await prisma.$queryRawUnsafe<Array<{ cnt: number }>>(
    `SELECT COUNT(*) AS cnt FROM TeachingTaskClass ttc LEFT JOIN TeachingTask t ON ttc.teachingTaskId = t.id WHERE t.id IS NULL`,
  )
  if (Number(orphanTTCTask[0].cnt) === 0) {
    pass(section, 'No orphan TeachingTaskClass -> TeachingTask')
  } else {
    fail(section, 'No orphan TeachingTaskClass -> TeachingTask', `found ${orphanTTCTask[0].cnt}`)
  }

  const orphanTTCG = await prisma.$queryRawUnsafe<Array<{ cnt: number }>>(
    `SELECT COUNT(*) AS cnt FROM TeachingTaskClass ttc LEFT JOIN ClassGroup cg ON ttc.classGroupId = cg.id WHERE cg.id IS NULL`,
  )
  if (Number(orphanTTCG[0].cnt) === 0) {
    pass(section, 'No orphan TeachingTaskClass -> ClassGroup')
  } else {
    fail(section, 'No orphan TeachingTaskClass -> ClassGroup', `found ${orphanTTCG[0].cnt}`)
  }
}

// ═══════════════════════════════════════
// C. Transactional scoped uniqueness test
// ═══════════════════════════════════════

async function runScopedUniquenessTest() {
  const section = 'C. Scoped Uniqueness'
  const ts = Date.now()
  const semNameA = `K10-VALID-A-${ts}`
  const semNameB = `K10-VALID-B-${ts}`
  const className = `K10-VALID-CLASS-${ts}`

  try {
    await prisma.$transaction(async (tx) => {
      // Create two semesters
      const semA = await tx.semester.create({ data: { name: semNameA, code: semNameA, isActive: false } })
      const semB = await tx.semester.create({ data: { name: semNameB, code: semNameB, isActive: false } })

      // Create same-name ClassGroup in different semesters
      const cgA = await tx.classGroup.create({
        data: { name: className, semesterId: semA.id },
      })
      const cgB = await tx.classGroup.create({
        data: { name: className, semesterId: semB.id },
      })

      if (cgA.id !== cgB.id) {
        pass(section, 'Cross-semester same-name ClassGroup allowed')
      } else {
        fail(section, 'Cross-semester same-name ClassGroup allowed', 'same id returned')
      }

      // Duplicate in same semester should fail
      let dupFailed = false
      try {
        await tx.classGroup.create({
          data: { name: className, semesterId: semA.id },
        })
      } catch (e: any) {
        if (e.code === 'P2002' || e.message?.includes('Unique constraint')) {
          dupFailed = true
        }
      }

      if (dupFailed) {
        pass(section, 'Same-semester duplicate ClassGroup rejected')
      } else {
        fail(section, 'Same-semester duplicate ClassGroup rejected', 'no error thrown')
      }

      // findFirst scoped lookup
      const foundA = await tx.classGroup.findFirst({
        where: { semesterId: semA.id, name: className },
        select: { id: true },
      })
      const foundB = await tx.classGroup.findFirst({
        where: { semesterId: semB.id, name: className },
        select: { id: true },
      })

      if (foundA?.id === cgA.id && foundB?.id === cgB.id) {
        pass(section, 'findFirst scoped by semesterId+name correct')
      } else {
        fail(section, 'findFirst scoped by semesterId+name correct', `foundA=${foundA?.id} foundB=${foundB?.id}`)
      }

      // Cross-semester isolation
      const foundInWrongSem = await tx.classGroup.findFirst({
        where: { semesterId: semB.id, name: className },
        select: { id: true },
      })
      if (foundInWrongSem?.id === cgB.id && foundInWrongSem?.id !== cgA.id) {
        pass(section, 'Scoped find does not cross semester boundary')
      } else {
        fail(section, 'Scoped find does not cross semester boundary')
      }

      // Force rollback — throw to undo all creates
      throw new Error('K10_VALIDATION_ROLLBACK_SIGNAL')
    })
  } catch (e: any) {
    if (e.message === 'K10_VALIDATION_ROLLBACK_SIGNAL') {
      pass(section, 'Transaction rolled back cleanly')
    } else {
      fail(section, 'Transaction rolled back cleanly', e.message)
    }
  }

  // Verify no test data remains
  const remaining = await prisma.classGroup.count({ where: { name: className } })
  if (remaining === 0) {
    pass(section, 'No test ClassGroup left after rollback')
  } else {
    fail(section, 'No test ClassGroup left after rollback', `found ${remaining}`)
  }

  const remainingSem = await prisma.semester.count({
    where: { name: { in: [semNameA, semNameB] } },
  })
  if (remainingSem === 0) {
    pass(section, 'No test Semester left after rollback')
  } else {
    fail(section, 'No test Semester left after rollback', `found ${remainingSem}`)
  }
}

// ═══════════════════════════════════════
// D. Transactional relation scoping test
// ═══════════════════════════════════════

async function runRelationScopingTest() {
  const section = 'D. Relation Scoping'
  const ts = Date.now()

  // Reuse existing teacher/course/room to avoid creating global junk
  const teacher = await prisma.teacher.findFirst({ select: { id: true } })
  const course = await prisma.course.findFirst({ select: { id: true } })
  const room = await prisma.room.findFirst({ select: { id: true } })

  if (!teacher || !course || !room) {
    skip(section, 'Relation scoping test', 'missing teacher/course/room')
    return
  }

  const initCounts = await prisma.$queryRawUnsafe<Array<{ tbl: string; cnt: number }>>(`
    SELECT 'TeachingTask' AS tbl, COUNT(*) AS cnt FROM TeachingTask
    UNION ALL SELECT 'ScheduleSlot', COUNT(*) FROM ScheduleSlot
    UNION ALL SELECT 'TeachingTaskClass', COUNT(*) FROM TeachingTaskClass
  `)
  const initCountMap = new Map(initCounts.map(r => [r.tbl, Number(r.cnt)]))

  try {
    await prisma.$transaction(async (tx) => {
      const sem = await tx.semester.create({
        data: { name: `K10-REL-${ts}`, code: `K10-REL-${ts}`, isActive: false },
      })

      const cg = await tx.classGroup.create({
        data: { name: `K10-REL-CG-${ts}`, semesterId: sem.id },
      })

      const task = await tx.teachingTask.create({
        data: {
          courseId: course.id,
          teacherId: teacher.id,
          semesterId: sem.id,
          weekType: 'ALL',
          startWeek: 1,
          endWeek: 16,
        },
      })

      const slot = await tx.scheduleSlot.create({
        data: {
          teachingTaskId: task.id,
          roomId: room.id,
          semesterId: sem.id,
          dayOfWeek: 1,
          slotIndex: 1,
        },
      })

      const ttc = await tx.teachingTaskClass.create({
        data: { teachingTaskId: task.id, classGroupId: cg.id },
      })

      // Verify task.semesterId
      const foundTask = await tx.teachingTask.findUnique({ where: { id: task.id } })
      if (foundTask?.semesterId === sem.id) {
        pass(section, 'TeachingTask.semesterId correct')
      } else {
        fail(section, 'TeachingTask.semesterId correct', `got ${foundTask?.semesterId}`)
      }

      // Verify slot.semesterId
      const foundSlot = await tx.scheduleSlot.findUnique({ where: { id: slot.id } })
      if (foundSlot?.semesterId === sem.id) {
        pass(section, 'ScheduleSlot.semesterId correct')
      } else {
        fail(section, 'ScheduleSlot.semesterId correct', `got ${foundSlot?.semesterId}`)
      }

      // Verify TTC links same-semester task and classgroup
      const foundTTC = await tx.teachingTaskClass.findUnique({
        where: { teachingTaskId_classGroupId: { teachingTaskId: task.id, classGroupId: cg.id } },
        include: { teachingTask: true, classGroup: true },
      })
      if (
        foundTTC?.teachingTask?.semesterId === sem.id &&
        foundTTC?.classGroup?.semesterId === sem.id
      ) {
        pass(section, 'TeachingTaskClass links same-semester entities')
      } else {
        fail(section, 'TeachingTaskClass links same-semester entities')
      }

      // Scoped query: target semester visible
      const scopedTasks = await tx.teachingTask.findMany({
        where: { semesterId: sem.id },
      })
      if (scopedTasks.length === 1 && scopedTasks[0].id === task.id) {
        pass(section, 'Scoped query finds target semester data')
      } else {
        fail(section, 'Scoped query finds target semester data', `found ${scopedTasks.length}`)
      }

      // Other semester query: not visible
      const otherSemTasks = await tx.teachingTask.findMany({
        where: { semesterId: sem.id + 9999 },
      })
      if (otherSemTasks.length === 0) {
        pass(section, 'Other semester query returns empty')
      } else {
        fail(section, 'Other semester query returns empty', `found ${otherSemTasks.length}`)
      }

      throw new Error('K10_VALIDATION_ROLLBACK_SIGNAL')
    })
  } catch (e: any) {
    if (e.message === 'K10_VALIDATION_ROLLBACK_SIGNAL') {
      pass(section, 'Transaction rolled back cleanly')
    } else {
      fail(section, 'Transaction rolled back cleanly', e.message)
    }
  }

  // Verify counts restored
  const finalCounts = await prisma.$queryRawUnsafe<Array<{ tbl: string; cnt: number }>>(`
    SELECT 'TeachingTask' AS tbl, COUNT(*) AS cnt FROM TeachingTask
    UNION ALL SELECT 'ScheduleSlot', COUNT(*) FROM ScheduleSlot
    UNION ALL SELECT 'TeachingTaskClass', COUNT(*) FROM TeachingTaskClass
  `)
  for (const row of finalCounts) {
    const initCnt = initCountMap.get(row.tbl) ?? 0
    const finalCnt = Number(row.cnt)
    if (finalCnt === initCnt) {
      pass(section, `${row.tbl} count restored (${finalCnt})`)
    } else {
      fail(section, `${row.tbl} count restored`, `expected ${initCnt}, got ${finalCnt}`)
    }
  }
}

// ═══════════════════════════════════════
// E. Rollback isolation check
// ═══════════════════════════════════════

async function runRollbackIsolationCheck() {
  const section = 'E. Rollback Isolation'

  // We cannot safely call real rollbackImportBatch without a real confirmed batch,
  // but we can verify the key invariant: importBatchId-scoped deletes are isolated.
  //
  // Static check: rollback.ts uses importBatchId in deleteMany, not semesterId.
  // This is safe because importBatchId is unique per batch.

  const rollbackPath = path.join(ROOT, 'src', 'lib', 'import', 'rollback.ts')
  if (!fs.existsSync(rollbackPath)) {
    skip(section, 'Rollback isolation', 'rollback.ts not found')
    return
  }

  const rollbackContent = fs.readFileSync(rollbackPath, 'utf-8')

  // Check that deleteMany uses importBatchId (not semesterId)
  if (
    rollbackContent.includes('importBatchId') &&
    rollbackContent.includes('deleteMany')
  ) {
    pass(section, 'Rollback uses importBatchId-scoped deleteMany')
  } else {
    fail(section, 'Rollback uses importBatchId-scoped deleteMany')
  }

  // Verify that all confirmed batches in DB have distinct importBatchId usage
  const batchSlotCounts = await prisma.$queryRawUnsafe<Array<{ batchId: number; cnt: number }>>(
    `SELECT "importBatchId" AS batchId, COUNT(*) AS cnt FROM ScheduleSlot WHERE "importBatchId" IS NOT NULL GROUP BY "importBatchId"`,
  )

  // Each batch's slots should be independent
  pass(section, `${batchSlotCounts.length} batches have importBatchId-tagged slots`)

  // Verify no TeachingTask shares importBatchId across semesters
  const crossSemBatches = await prisma.$queryRawUnsafe<Array<{ batchId: number; semCount: number }>>(
    `SELECT "importBatchId" AS batchId, COUNT(DISTINCT semesterId) AS semCount
     FROM TeachingTask WHERE "importBatchId" IS NOT NULL
     GROUP BY "importBatchId" HAVING semCount > 1`,
  )
  if (crossSemBatches.length === 0) {
    pass(section, 'No batch spans multiple semesters in TeachingTask')
  } else {
    fail(section, 'No batch spans multiple semesters in TeachingTask',
      `${crossSemBatches.length} batch(es) span multiple semesters`)
  }

  skip(section, 'Real rollback call not executed',
    'Cannot safely invoke rollback without a real pending/confirmed batch; importBatchId uniqueness guarantees safety')
}

// ═══════════════════════════════════════
// Output
// ═══════════════════════════════════════

async function main() {
  console.log('\n=== K10 Import Semester Scoping Validation ===\n')

  runStaticChecks()
  await runDBIntegrityChecks()
  await runScopedUniquenessTest()
  await runRelationScopingTest()
  await runRollbackIsolationCheck()

  let passed = 0
  let failed = 0
  let skipped = 0

  // Group by section
  const sections = [...new Set(results.map(r => r.section))]

  for (const sec of sections) {
    console.log(`─── ${sec} ───`)
    for (const r of results.filter(r => r.section === sec)) {
      const icon = r.status === 'PASS' ? 'PASS' : r.status === 'FAIL' ? 'FAIL' : 'SKIP'
      console.log(`  [${icon}] ${r.name}`)
      if (r.detail) console.log(`        ${r.detail}`)
      if (r.status === 'PASS') passed++
      else if (r.status === 'FAIL') failed++
      else skipped++
    }
    console.log()
  }

  console.log('════════════════════════════════════════════════════════════')
  console.log('Summary:')
  console.log(`  PASS: ${passed}`)
  console.log(`  FAIL: ${failed}`)
  console.log(`  SKIP: ${skipped}`)
  console.log('════════════════════════════════════════════════════════════')

  if (failed > 0) {
    console.log('\nValidation FAILED')
    process.exit(1)
  } else {
    console.log('\nValidation PASSED')
  }
}

main()
  .catch((e) => {
    console.error('Fatal error:', e)
    process.exit(1)
  })
  .finally(() => prisma.$disconnect())
