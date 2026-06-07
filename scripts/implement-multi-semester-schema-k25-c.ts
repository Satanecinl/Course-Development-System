// scripts/implement-multi-semester-schema-k25-c.ts
// K25-C: Controlled implementation of K25-B schema plan.
//
// Modes:
//   --dry-run (default): read-only, report counts, do NOT write DB.
//   --apply          : apply ImportBatch backfill (only write op).
//
// Only write operation allowed:
//   prisma.importBatch.updateMany({ where: { semesterId: null },
//                                  data: { semesterId: activeSemesterId } })
//
// Does NOT touch prisma.schema, does NOT run migrate, does NOT
// write any other model. Backfill scope is strictly limited to
// ImportBatch.semesterId.

import { prisma } from '@/lib/prisma'

interface Summary {
  mode: 'DRY_RUN' | 'APPLY'
  activeSemesterId: number | null
  activeSemesterCode: string | null
  importBatchTotal: number
  importBatchNullBefore: number
  importBatchUpdated: number
  importBatchNullAfter: number
  otherScopedNullCounts: Record<string, number>
  blocking: boolean
  abortReason?: string
}

async function countNullRaw(model: string): Promise<number> {
  // Use raw SQL to count nulls — Prisma client now rejects null for
  // NOT NULL fields, so we must bypass.
  const result = await prisma.$queryRawUnsafe<Array<{ cnt: number }>>(
    `SELECT COUNT(*) as cnt FROM ${model} WHERE semesterId IS NULL`,
  )
  return result[0]?.cnt ?? 0
}

async function main() {
  const args = process.argv.slice(2)
  const mode: 'DRY_RUN' | 'APPLY' = args.includes('--apply') ? 'APPLY' : 'DRY_RUN'

  console.log(`K25-C IMPLEMENT ${mode}`)
  console.log('='.repeat(60))

  // ─── 1. Active semester detection ─────────────────────

  const activeSemesters = await prisma.semester.findMany({
    where: { isActive: true },
    orderBy: { id: 'asc' },
  })
  if (activeSemesters.length === 0) {
    const summary: Summary = {
      mode,
      activeSemesterId: null,
      activeSemesterCode: null,
      importBatchTotal: 0,
      importBatchNullBefore: 0,
      importBatchUpdated: 0,
      importBatchNullAfter: 0,
      otherScopedNullCounts: {},
      blocking: true,
      abortReason: 'NO_ACTIVE_SEMESTER',
    }
    outputSummary(summary)
    await prisma.$disconnect()
    process.exit(1)
  }
  if (activeSemesters.length > 1) {
    const summary: Summary = {
      mode,
      activeSemesterId: null,
      activeSemesterCode: null,
      importBatchTotal: 0,
      importBatchNullBefore: 0,
      importBatchUpdated: 0,
      importBatchNullAfter: 0,
      otherScopedNullCounts: {},
      blocking: true,
      abortReason: `MULTIPLE_ACTIVE_SEMESTERS: ${activeSemesters.length}`,
    }
    outputSummary(summary)
    await prisma.$disconnect()
    process.exit(1)
  }

  const activeSemester = activeSemesters[0]
  const activeSemesterId = activeSemester.id
  const activeSemesterCode = activeSemester.code

  // ─── 2. Null counts per scoped model (use raw SQL for NOT NULL
  //         fields — Prisma client now rejects null in where) ──

  const importBatchTotal = await prisma.importBatch.count()
  const importBatchNullBefore = await countNullRaw('ImportBatch', activeSemesterId)

  const otherModels = [
    'ClassGroup', 'TeachingTask', 'ScheduleSlot', 'ScheduleAdjustment',
    'SchedulingRun', 'SchedulingConfig',
  ] as const
  const otherScopedNullCounts: Record<string, number> = {}
  for (const m of otherModels) {
    otherScopedNullCounts[m.toLowerCase()] = await countNullRaw(m, activeSemesterId)
  }

  // ─── 3. Apply backfill (only for ImportBatch) ───────────

  let importBatchUpdated = 0
  let importBatchNullAfter = importBatchNullBefore

  if (mode === 'APPLY' && importBatchNullBefore > 0) {
    // K25-C backfill: use raw SQL to bypass Prisma client NOT NULL
    // validation. The client now reflects the NOT NULL constraint
    // from schema, but the DB itself still has nulls.
    const result = await prisma.$executeRawUnsafe(
      `UPDATE ImportBatch SET semesterId = ${activeSemesterId} WHERE semesterId IS NULL`,
    )
    importBatchUpdated = result
    importBatchNullAfter = await countNullRaw('ImportBatch', activeSemesterId)
  }

  // ─── 4. Build summary ──────────────────────────────────

  const blocking = Object.entries(otherScopedNullCounts).some(([, n]) => n > 0) || importBatchNullAfter > 0

  const summary: Summary = {
    mode,
    activeSemesterId,
    activeSemesterCode,
    importBatchTotal,
    importBatchNullBefore,
    importBatchUpdated,
    importBatchNullAfter,
    otherScopedNullCounts,
    blocking,
  }
  outputSummary(summary)

  await prisma.$disconnect()
  process.exit(blocking ? 1 : 0)
}

function outputSummary(s: Summary) {
  console.log('\nK25-C IMPLEMENT', s.mode)
  console.log('='.repeat(60))
  console.log(`activeSemesterId=${s.activeSemesterId ?? 'NONE'}`)
  console.log(`activeSemesterCode=${s.activeSemesterCode ?? 'NONE'}`)
  console.log(`importBatchTotal=${s.importBatchTotal}`)
  console.log(`importBatchNullBefore=${s.importBatchNullBefore}`)
  console.log(`importBatchUpdated=${s.importBatchUpdated}`)
  console.log(`importBatchNullAfter=${s.importBatchNullAfter}`)
  for (const [m, n] of Object.entries(s.otherScopedNullCounts)) {
    console.log(`nullCount.${m}=${n}`)
  }
  console.log(`blocking=${s.blocking}`)
  if (s.abortReason) {
    console.log(`abortReason=${s.abortReason}`)
  }
}

main().catch(async (e) => {
  console.error('K25-C implement script error:', e)
  await prisma.$disconnect().catch(() => {})
  process.exit(1)
})
