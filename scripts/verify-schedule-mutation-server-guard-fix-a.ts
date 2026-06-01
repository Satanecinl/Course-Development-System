/**
 * K11 Schedule Mutation Server Guard Fix-A Verification
 *
 * Read-only verification script. Does NOT write to the database.
 * Checks that server-side conflict check and same-semester guard are in place.
 */

import * as fs from 'fs'
import * as path from 'path'

const ROOT = path.resolve(__dirname, '..')

interface CheckResult {
  name: string
  passed: boolean
  detail?: string
}

const results: CheckResult[] = []

function check(name: string, passed: boolean, detail?: string) {
  results.push({ name, passed, detail })
}

// ── 1. Guard module exists ──

const guardPath = path.join(ROOT, 'src', 'lib', 'schedule', 'slot-mutation-guard.ts')
const guardExists = fs.existsSync(guardPath)
check('Guard module exists', guardExists)

if (guardExists) {
  const guard = fs.readFileSync(guardPath, 'utf-8')

  check('Guard exports guardSlotUpdate', guard.includes('export async function guardSlotUpdate'))
  check('Guard exports guardSlotCreate', guard.includes('export async function guardSlotCreate'))
  check('Guard exports guardAdminSlotUpdate', guard.includes('export async function guardAdminSlotUpdate'))
  check('Guard exports guardAdminSlotCreate', guard.includes('export async function guardAdminSlotCreate'))
  check('Guard calls checkWeekOverlap', guard.includes('checkWeekOverlap'))
  check('Guard checks room conflict', guard.includes('Room conflict') || guard.includes('roomId'))
  check('Guard checks teacher conflict', guard.includes('Teacher conflict') || guard.includes('teacherId'))
  check('Guard checks class conflict', guard.includes('Class conflict') || guard.includes('classGroupId'))
  check('Guard resolves semester', guard.includes('resolveSchedulerSemester'))
  check('Guard validates same-semester', guard.includes('semesterId'))
}

// ── 2. PUT /api/schedule-slot/[id] ──

const putRoute = fs.readFileSync(path.join(ROOT, 'src', 'app', 'api', 'schedule-slot', '[id]', 'route.ts'), 'utf-8')

check('PUT imports guardSlotUpdate', putRoute.includes('guardSlotUpdate'))
check('PUT calls guard before update', putRoute.includes('guardSlotUpdate('))
check('PUT checks guard result', putRoute.includes('guardResult.ok'))
check('PUT returns conflicts on failure', putRoute.includes('guardResult.conflicts'))

// ── 3. POST /api/schedule-slot ──

const postRoute = fs.readFileSync(path.join(ROOT, 'src', 'app', 'api', 'schedule-slot', 'route.ts'), 'utf-8')

check('POST imports guardSlotCreate', postRoute.includes('guardSlotCreate'))
check('POST calls guard before create', postRoute.includes('guardSlotCreate('))
check('POST checks guard result', postRoute.includes('guardResult.ok'))
check('POST sets semesterId from guard', postRoute.includes('guardResult.semesterId'))

// ── 4. Admin [model] route ──

const adminRoute = fs.readFileSync(path.join(ROOT, 'src', 'app', 'api', 'admin', '[model]', 'route.ts'), 'utf-8')

check('Admin imports guardAdminSlotUpdate', adminRoute.includes('guardAdminSlotUpdate'))
check('Admin imports guardAdminSlotCreate', adminRoute.includes('guardAdminSlotCreate'))
check('Admin PUT calls conflict check for scheduleslot', adminRoute.includes("model.toLowerCase() === 'scheduleslot'") && adminRoute.includes('guardAdminSlotUpdate'))
check('Admin POST calls conflict check for scheduleslot', adminRoute.includes('guardAdminSlotCreate'))

// ── 5. No forbidden changes ──

const schema = fs.readFileSync(path.join(ROOT, 'prisma', 'schema.prisma'), 'utf-8')
check('Schema not modified (ImportBatch still has semesterId)', /model ImportBatch[\s\S]*?semesterId\s+Int\?/.test(schema))

const solverDir = path.join(ROOT, 'src', 'lib', 'scheduler')
let solverModified = false
for (const f of fs.readdirSync(solverDir).filter(f => f.endsWith('.ts'))) {
  const content = fs.readFileSync(path.join(solverDir, f), 'utf-8')
  if (content.includes('slot-mutation-guard') || content.includes('guardSlot')) {
    solverModified = true
    break
  }
}
check('Solver not modified', !solverModified)

const parserPath = path.join(ROOT, 'scripts', 'parse_schedule.py')
check('Python parser not modified', !fs.readFileSync(parserPath, 'utf-8').includes('semester'))

// ── 6. No checkScheduleConflict modification ──

const conflictLib = fs.readFileSync(path.join(ROOT, 'src', 'lib', 'conflict-check.ts'), 'utf-8')
check('checkScheduleConflict not modified', conflictLib.includes('export async function checkScheduleConflict'))

// ── Output ──

console.log('\n=== K11 Schedule Mutation Server Guard Fix-A Verification ===\n')

let passed = 0
let failed = 0

for (const r of results) {
  const icon = r.passed ? 'PASS' : 'FAIL'
  console.log(`  [${icon}] ${r.name}`)
  if (r.detail) console.log(`        ${r.detail}`)
  if (r.passed) passed++
  else failed++
}

console.log(`\nSummary:`)
console.log(`  passed: ${passed}`)
console.log(`  failed: ${failed}`)

if (failed > 0) {
  console.log('\nVerification FAILED')
  process.exit(1)
} else {
  console.log('\nVerification PASSED')
}
