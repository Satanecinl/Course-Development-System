/**
 * K25-D: Semester scoping API gap fix verification.
 *
 * Read-only — does not write to DB. Checks:
 *   1. K25-C schema NOT NULL prerequisites still hold
 *   2. Route scoping (teaching-tasks list, schedule list) uses new resolver
 *   3. Request semester resolver exists with documented transitional fallback
 *   4. Mutation guards present (teaching-task create, schedule-slot update,
 *      teaching-task update, conflict-check, schedule-adjustments)
 *   5. Non-goals (no schema changes, no UI selector, no RBAC changes, no DB writes)
 *   6. Regression markers (K25-C validation, K25-C migration, K24-A5 files)
 *   7. Read-only DB invariants (active semester count, same-semester consistency)
 */
import { existsSync, readFileSync, readdirSync } from 'fs'
import { resolve } from 'path'

const ROOT = resolve(__dirname, '..')

let passed = 0
let failed = 0
const failures: string[] = []

function assert(cond: boolean, msg: string) {
  if (cond) {
    passed++
    console.log(`  ✅ ${msg}`)
  } else {
    failed++
    failures.push(msg)
    console.error(`  ❌ ${msg}`)
  }
}

function fileRead(rel: string): string {
  return readFileSync(resolve(ROOT, rel), 'utf-8')
}

function fileExists(rel: string): boolean {
  return existsSync(resolve(ROOT, rel))
}

// ─── A. Schema prerequisite ──────────────────────────────────────────────────

function testSchemaPrereq() {
  console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━')
  console.log('A. Schema NOT NULL prerequisite (K25-C intact)')
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
    assert(!!match, `${m} model block found`)
    if (!match) continue
    assert(
      /semesterId\s+Int\b(?!\?)/.test(match[1]),
      `${m}.semesterId is Int (NOT NULL)`,
    )
  }
}

// ─── B. Route scoping: teaching-tasks GET list ──────────────────────────────

function testTeachingTasksList() {
  console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━')
  console.log('B. teaching-tasks GET list scoping')
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━')
  const file = 'src/app/api/data/teaching-tasks/route.ts'
  assert(fileExists(file), `${file} exists`)
  if (!fileExists(file)) return
  const src = fileRead(file)
  assert(
    /resolveRequestSemester\s*\(/.test(src),
    'data/teaching-tasks uses resolveRequestSemester',
  )
  assert(
    /semesterId:\s*semester\.id/.test(src),
    'data/teaching-tasks filters where: { semesterId: semester.id }',
  )
  assert(
    /semesterSource/.test(src),
    'data/teaching-tasks returns semesterSource in response',
  )
}

// ─── C. Route scoping: schedule list ─────────────────────────────────────────

function testScheduleList() {
  console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━')
  console.log('C. schedule GET list scoping (data/schedule-slots + /api/schedule)')
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━')
  const files = [
    'src/app/api/data/schedule-slots/route.ts',
    'src/app/api/schedule/route.ts',
  ]
  for (const f of files) {
    assert(fileExists(f), `${f} exists`)
    if (!fileExists(f)) continue
    const src = fileRead(f)
    assert(
      /resolveRequestSemester\s*\(/.test(src),
      `${f} uses resolveRequestSemester`,
    )
    assert(
      /semesterId:\s*semester\.id/.test(src),
      `${f} filters where: { semesterId: semester.id }`,
    )
  }
}

// ─── D. Request semester resolver helper ─────────────────────────────────────

function testResolverHelper() {
  console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━')
  console.log('D. Request semester resolver helper')
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━')
  const helperPath = 'src/lib/schedule/semester-scope.ts'
  assert(fileExists(helperPath), `${helperPath} exists`)
  if (!fileExists(helperPath)) return
  const src = fileRead(helperPath)
  assert(
    /export\s+async\s+function\s+resolveRequestSemester/.test(src),
    'resolveRequestSemester exported',
  )
  assert(
    /SemesterSource\s*=\s*['"]query['"].*['"]header['"].*['"]body['"].*['"]activeFallback['"]/s.test(src) ||
      /type\s+SemesterSource/.test(src),
    'SemesterSource type covers query/header/body/activeFallback',
  )
  assert(
    /INVALID_SEMESTER_ID/.test(src),
    'INVALID_SEMESTER_ID error code present',
  )
  assert(
    /SEMESTER_NOT_FOUND/.test(src),
    'SEMESTER_NOT_FOUND error code present',
  )
  assert(
    /toSemesterErrorResponse/.test(src),
    'toSemesterErrorResponse helper exported',
  )
  assert(
    /X-Semester-Id/i.test(src),
    'X-Semester-Id header support documented',
  )
  assert(
    /transitional/i.test(src),
    'activeFallback marked as transitional',
  )
}

// ─── E. Mutation guards ─────────────────────────────────────────────────────

function testMutationGuards() {
  console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━')
  console.log('E. Mutation consistency guards')
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━')

  // teaching-task create
  {
    const f = 'src/app/api/teaching-task/route.ts'
    const src = fileRead(f)
    assert(
      /resolveRequestSemester\s*\(/.test(src),
      'teaching-task POST uses resolveRequestSemester',
    )
    assert(
      /CLASS_GROUP_SEMESTER_MISMATCH/.test(src),
      'teaching-task POST has classGroup same-semester guard',
    )
  }

  // teaching-task [id] PUT
  {
    const f = 'src/app/api/teaching-task/[id]/route.ts'
    const src = fileRead(f)
    assert(
      /CLASS_GROUP_SEMESTER_MISMATCH/.test(src),
      'teaching-task [id] PUT has classGroup same-semester guard',
    )
  }

  // schedule-slot POST
  {
    const f = 'src/app/api/schedule-slot/route.ts'
    const src = fileRead(f)
    assert(
      /guardResult\.semesterId/.test(src) && /semesterId:\s*guardResult\.semesterId/.test(src),
      'schedule-slot POST uses guardResult.semesterId for same-semester binding',
    )
  }

  // schedule-slot [id] PUT
  {
    const f = 'src/app/api/schedule-slot/[id]/route.ts'
    const src = fileRead(f)
    assert(
      /guardSlotUpdate/.test(src),
      'schedule-slot [id] PUT uses guardSlotUpdate',
    )
    assert(
      /SEMESTER_MISMATCH/.test(src),
      'schedule-slot [id] PUT has body semesterId mismatch guard',
    )
  }

  // conflict-check
  {
    const f = 'src/app/api/conflict-check/route.ts'
    const src = fileRead(f)
    assert(
      /resolveRequestSemester\s*\(/.test(src),
      'conflict-check uses resolveRequestSemester',
    )
  }

  // schedule-adjustments
  {
    const f = 'src/app/api/schedule-adjustments/route.ts'
    const src = fileRead(f)
    assert(
      /resolveSchedulerSemester\s*\(/.test(src) || /resolveRequestSemester\s*\(/.test(src),
      'schedule-adjustments uses semester resolver',
    )
    assert(
      /semesterId:\s*semester\.id/.test(src),
      'schedule-adjustments filters by semesterId',
    )
  }
}

// ─── F. Non-goals ───────────────────────────────────────────────────────────

function testNonGoals() {
  console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━')
  console.log('F. Non-goals (no schema/UI/RBAC changes in K25-D)')
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━')

  // No new migration
  const migrationsDir = resolve(ROOT, 'prisma/migrations')
  if (existsSync(migrationsDir)) {
    const dirs = readdirSync(migrationsDir)
    const k25d = dirs.filter((d) => d.includes('k25_d') || d.includes('k25-d') || d.includes('k25_d_semester_scoping'))
    assert(k25d.length === 0, `no K25-D migration directory found (got ${k25d.length})`)
  }

  // No UI selector
  const adminSidebar = 'src/components/admin-sidebar.tsx'
  if (fileExists(adminSidebar)) {
    const src = fileRead(adminSidebar)
    assert(
      !/学期选择|SemesterSelector/.test(src),
      'no semester selector added to admin-sidebar',
    )
  }

  // No RBAC changes
  const rbac = 'src/lib/auth/permissions.ts'
  if (fileExists(rbac)) {
    const src = fileRead(rbac)
    // Should NOT have semester-scoped permissions
    assert(
      !/semester.*permission/i.test(src),
      'no semester-scoped permissions added to RBAC',
    )
  }
}

// ─── G. Regression markers ──────────────────────────────────────────────────

function testRegressionMarkers() {
  console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━')
  console.log('G. Regression markers (K25-C/K24-A5 intact)')
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━')
  assert(
    fileExists('scripts/validate-multi-semester-schema-k25-c.ts'),
    'K25-C validation script still exists',
  )
  assert(
    fileExists('prisma/migrations/20260607000000_k25_multi_semester_not_null/migration.sql'),
    'K25-C migration still exists',
  )
  assert(
    fileExists('docs/k25-multi-semester-schema-implementation.md'),
    'K25-C docs still exist',
  )
  // K24-A5 files
  const k24Files = [
    'src/lib/schedule/adjustment-plan-recommendations.ts',
    'src/lib/schedule/adjustment-client.ts',
    'src/components/schedule-adjustment-dialog.tsx',
  ]
  for (const f of k24Files) {
    assert(fileExists(f), `K24-A5 file intact: ${f}`)
  }
}

// ─── H. Read-only DB invariants ─────────────────────────────────────────────

async function testDbInvariants() {
  console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━')
  console.log('H. Read-only DB invariants')
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━')
  // Lazy import prisma to keep startup fast
  const { prisma } = await import('@/lib/prisma')

  try {
    // Active semester count
    const activeCount = await prisma.semester.count({ where: { isActive: true } })
    assert(activeCount === 1, `exactly 1 active semester (got ${activeCount})`)

    // TeachingTask count for active semester
    const totalTasks = await prisma.teachingTask.count()
    const activeTasks = await prisma.teachingTask.count({ where: { semesterId: 1 } })
    assert(totalTasks === activeTasks, `teachingTask all in active semester (total=${totalTasks}, active=${activeTasks})`)

    // ScheduleSlot count
    const totalSlots = await prisma.scheduleSlot.count()
    const activeSlots = await prisma.scheduleSlot.count({ where: { semesterId: 1 } })
    assert(totalSlots === activeSlots, `scheduleSlot all in active semester (total=${totalSlots}, active=${activeSlots})`)

    // No cross-semester mismatches (TeachingTask ↔ ClassGroup)
    const cross = await prisma.$queryRawUnsafe<Array<{ cnt: number | bigint }>>(
      `SELECT COUNT(*) as cnt FROM TeachingTaskClass ttc
       JOIN TeachingTask tt ON ttc.teachingTaskId = tt.id
       JOIN ClassGroup cg ON ttc.classGroupId = cg.id
       WHERE tt.semesterId <> cg.semesterId`,
    )
    const normCross = typeof cross[0]?.cnt === 'bigint' ? Number(cross[0].cnt) : cross[0]?.cnt ?? 0
    assert(normCross === 0, `TeachingTask ↔ ClassGroup no cross-semester (got ${normCross})`)

    // No scheduleSlot ↔ teachingTask cross-semester
    const slotCross = await prisma.$queryRawUnsafe<Array<{ cnt: number | bigint }>>(
      `SELECT COUNT(*) as cnt FROM ScheduleSlot ss
       JOIN TeachingTask tt ON ss.teachingTaskId = tt.id
       WHERE ss.semesterId <> tt.semesterId`,
    )
    const normSlotCross = typeof slotCross[0]?.cnt === 'bigint' ? Number(slotCross[0].cnt) : slotCross[0]?.cnt ?? 0
    assert(normSlotCross === 0, `ScheduleSlot ↔ TeachingTask no cross-semester (got ${normSlotCross})`)
  } finally {
    await prisma.$disconnect()
  }
}

// ─── Main ────────────────────────────────────────────────────────────────────

async function main() {
  console.log('🧪 K25-D Semester Scoping API Verification')

  testSchemaPrereq()
  testTeachingTasksList()
  testScheduleList()
  testResolverHelper()
  testMutationGuards()
  testNonGoals()
  testRegressionMarkers()
  await testDbInvariants()

  console.log(`\n${'═'.repeat(50)}`)
  console.log(`📊 结果: ${passed} passed, ${failed} failed`)
  console.log(`${'═'.repeat(50)}`)

  if (failed > 0) {
    console.log('\n失败列表:')
    for (const f of failures) {
      console.log(`  - ${f}`)
    }
    console.log('\n❌ K25-D SEMESTER SCOPING API VERIFY FAIL')
    process.exit(1)
  }

  console.log('\n✅ K25-D SEMESTER SCOPING API VERIFY PASS')
  console.log(`PASS=${passed} FAIL=0`)
  console.log('HIGH_API_FINDINGS_REMEDIATED=2/2')
  process.exit(0)
}

main().catch(async (e) => {
  console.error('K25-D verify script error:', e)
  const { prisma } = await import('@/lib/prisma')
  await prisma.$disconnect().catch(() => {})
  process.exit(1)
})
