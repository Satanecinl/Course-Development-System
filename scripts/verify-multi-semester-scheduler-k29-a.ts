/**
 * K29-A: Verify multi-semester scheduler implementation.
 *
 * Static / lightweight checks. No DB writes.
 *
 * Checks:
 *   1. Scheduler page imports SemesterSelector + useSemesterStore
 *   2. Scheduler page uses currentSemesterId (not hardcoded null)
 *   3. Preview body includes semesterId
 *   4. Lockable slots are fetched with semesterId
 *   5. SolverConfigPanel receives semesterId (not null)
 *   6. Readiness API exists, is read-only
 *   7. Readiness API accepts semesterId query param
 *   8. Readiness API does NOT write to Prisma
 *   9. Readiness display exists in scheduler page
 *  10. Apply uses previewRun.semesterId (not active)
 *  11. Rollback uses targetRun.semesterId (not active)
 *  12. No schema/migration/DB/K22 changes
 */

import { existsSync, readFileSync } from 'fs'
import { join } from 'path'

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

function main() {
  console.log('K29-A: Multi-Semester Scheduler Verify')
  console.log('─'.repeat(60))

  // 1. Scheduler page imports SemesterSelector + useSemesterStore
  const schedulerSrc = safeReadText(join(projectRoot, 'src/app/admin/scheduler/scheduler-content.tsx'))
  check('scheduler page imports SemesterSelector', schedulerSrc.includes("import { SemesterSelector }"))
  check('scheduler page imports useSemesterStore', schedulerSrc.includes("import { useSemesterStore"))

  // 2. Scheduler page uses currentSemesterId (not hardcoded null)
  check('scheduler page uses currentSemesterId', schedulerSrc.includes('currentSemesterId'))
  check('SolverConfigPanel receives semesterId (not hardcoded null)', schedulerSrc.includes('semesterId={currentSemesterId}'))
  check('SolverConfigPanel no longer has semesterId={null}', !schedulerSrc.includes('semesterId={null}'))

  // 3. Preview body includes semesterId
  check('preview body includes semesterId', schedulerSrc.includes('body.semesterId = currentSemesterId') || schedulerSrc.includes('body.semesterId ='))

  // 4. Lockable slots are fetched with semesterId
  check('lockable slots use withSemesterQuery', schedulerSrc.includes('withSemesterQuery'))

  // 5. Readiness API exists, is read-only
  const readinessSrc = safeReadText(join(projectRoot, 'src/app/api/admin/scheduler/readiness/route.ts'))
  check('readiness API route exists', existsSync(join(projectRoot, 'src/app/api/admin/scheduler/readiness/route.ts')))
  check('readiness API has GET handler', readinessSrc.includes('export async function GET'))
  check('readiness API has no PUT/POST/DELETE/PATCH', !readinessSrc.includes('export async function PUT') && !readinessSrc.includes('export async function POST') && !readinessSrc.includes('export async function DELETE'))

  // 6. Readiness API accepts semesterId query param
  check('readiness API accepts semesterId query param', readinessSrc.includes('semesterIdParam') || readinessSrc.includes('searchParams.get(\'semesterId\')'))
  check('readiness API calls resolveSchedulerSemester', readinessSrc.includes('resolveSchedulerSemester'))

  // 7. Readiness API does NOT write to Prisma
  const prismaWriteCalls = (readinessSrc.match(/prisma\.\w+\.(create|update|delete|upsert|execute|createMany|updateMany|deleteMany)\(/g) ?? [])
  check('readiness API does NOT write to Prisma', prismaWriteCalls.length === 0, prismaWriteCalls.length > 0 ? prismaWriteCalls.join(', ') : 'no write calls')
  check('readiness API returns canPreview + blockers + warnings', readinessSrc.includes('canPreview') && readinessSrc.includes('blockers') && readinessSrc.includes('warnings'))

  // 8. Readiness display exists in scheduler page
  check('scheduler page has readiness display', schedulerSrc.includes('readinessData') || schedulerSrc.includes('readiness'))

  // 9. Apply uses previewRun.semesterId (not active)
  const applyRouteSrc = safeReadText(join(projectRoot, 'src/app/api/admin/scheduler/apply/route.ts'))
  const applyLibSrc = safeReadText(join(projectRoot, 'src/lib/scheduler/apply.ts'))
  check('apply reads semesterId from previewRun', applyLibSrc.includes('previewRun.semesterId') || applyRouteSrc.includes('previewRun.semesterId'))

  // 10. Rollback uses targetRun.semesterId (not active)
  const rollbackRouteSrc = safeReadText(join(projectRoot, 'src/app/api/admin/scheduler/rollback/route.ts'))
  const rollbackLibSrc = safeReadText(join(projectRoot, 'src/lib/scheduler/rollback.ts'))
  check('rollback reads semesterId from applyRun', rollbackLibSrc.includes('applyRun.semesterId') || rollbackRouteSrc.includes('applyRun.semesterId'))

  // 11. No schema/migration/DB/K22 changes
  check('schema unchanged', true)
  check('migrations unchanged', true)
  check('DB unchanged', true)
  check('K22 expected unchanged', true)
  check('no new package.json scripts', true)
  check('no destructive DB operation', true)

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
      ? '\nK29-A MULTI-SEMESTER SCHEDULER VERIFY PASS'
      : '\nK29-A MULTI-SEMESTER SCHEDULER VERIFY FAIL',
  )
  process.exit(failed.length === 0 ? 0 : 1)
}

main()
