/**
 * K10 Import Semester Scoping Fix-A Verification
 *
 * Read-only verification script. Does NOT write to the database.
 * Checks that import main flow correctly threads semesterId.
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

// ── 1. Schema checks ──

const schemaPath = path.join(ROOT, 'prisma', 'schema.prisma')
const schema = fs.readFileSync(schemaPath, 'utf-8')

check(
  'ImportBatch has semesterId field',
  /^\s+semesterId\s+Int\?/m.test(schema),
)

check(
  'ImportBatch has semester relation',
  /^\s+semester\s+Semester\?\s+@relation/m.test(schema),
)

check(
  'ImportBatch has @@index([semesterId])',
  /model ImportBatch[\s\S]*?@@index\(\[semesterId\]\)/.test(schema),
)

check(
  'Semester has importBatches back-relation',
  /^\s+importBatches\s+ImportBatch\[\]/m.test(schema),
)

// ── 2. Import route checks ──

const parseRoute = fs.readFileSync(path.join(ROOT, 'src', 'app', 'api', 'admin', 'import', 'parse', 'route.ts'), 'utf-8')

check(
  'parse route imports resolveSchedulerSemester',
  parseRoute.includes("import { resolveSchedulerSemester }"),
)

check(
  'parse route calls resolveSchedulerSemester()',
  parseRoute.includes('resolveSchedulerSemester()'),
)

check(
  'parse route creates ImportBatch with semesterId',
  /prisma\.importBatch\.create\(\{[\s\S]*?semesterId/.test(parseRoute),
)

check(
  'parse route returns semesterId in response',
  parseRoute.includes('semesterId: semester.id'),
)

// ── 3. Confirm route checks ──

const confirmRoute = fs.readFileSync(path.join(ROOT, 'src', 'app', 'api', 'admin', 'import', 'confirm', 'route.ts'), 'utf-8')

check(
  'confirm route imports resolveSchedulerSemester',
  confirmRoute.includes("import { resolveSchedulerSemester }"),
)

check(
  'confirm route calls resolveSchedulerSemester()',
  confirmRoute.includes('resolveSchedulerSemester()'),
)

check(
  'confirm route passes semesterId to confirmImportBatchDryRun',
  /confirmImportBatchDryRun\(.*semester\.id\)/.test(confirmRoute),
)

check(
  'confirm route passes semesterId to confirmImportBatch',
  /confirmImportBatch\(.*semester\.id\)/.test(confirmRoute),
)

// ── 4. Importer checks ──

const importer = fs.readFileSync(path.join(ROOT, 'src', 'lib', 'import', 'importer.ts'), 'utf-8')

check(
  'importer executeImportInTransaction accepts semesterId',
  /async function executeImportInTransaction\([\s\S]*?semesterId:\s*number/.test(importer),
)

check(
  'importer TeachingTask.create writes semesterId',
  /teachingTask\.create\(\{[\s\S]*?semesterId/.test(importer),
)

check(
  'importer TeachingTask.findMany includes semesterId in where',
  /teachingTask\.findMany\(\{[\s\S]*?where:\s*\{[\s\S]*?semesterId/.test(importer),
)

check(
  'importer ScheduleSlot.create writes semesterId',
  /scheduleSlot\.create\(\{[\s\S]*?semesterId/.test(importer),
)

check(
  'importer ScheduleSlot.findFirst includes semesterId in where',
  /scheduleSlot\.findFirst\(\{[\s\S]*?where:\s*\{[\s\S]*?semesterId/.test(importer),
)

check(
  'importer ClassGroup.create writes semesterId',
  /classGroup\.create\(\{[\s\S]*?semesterId/.test(importer),
)

check(
  'importer prepareRecords validates batch semesterId',
  importer.includes('batch.semesterId !== targetSemesterId'),
)

check(
  'importer confirmImportBatch validates batch semesterId',
  importer.includes('batch.semesterId !== semesterId'),
)

check(
  'confirmImportBatchDryRun accepts semesterId parameter',
  /async function confirmImportBatchDryRun\([\s\S]*?semesterId:\s*number/.test(importer),
)

check(
  'confirmImportBatch accepts semesterId parameter',
  /async function confirmImportBatch\([\s\S]*?semesterId:\s*number/.test(importer),
)

// ── 5. Batch route checks ──

const batchesRoute = fs.readFileSync(path.join(ROOT, 'src', 'app', 'api', 'admin', 'import', 'batches', 'route.ts'), 'utf-8')

check(
  'batches route imports resolveSchedulerSemester',
  batchesRoute.includes("import { resolveSchedulerSemester }"),
)

check(
  'batches route filters by semesterId',
  batchesRoute.includes('semesterId: semester.id'),
)

const batchDetailRoute = fs.readFileSync(path.join(ROOT, 'src', 'app', 'api', 'admin', 'import', 'batches', '[id]', 'route.ts'), 'utf-8')

check(
  'batch detail route has same-semester guard',
  batchDetailRoute.includes('batch.semesterId !== semester.id'),
)

// ── 6. Rollback route checks ──

const rollbackRoute = fs.readFileSync(path.join(ROOT, 'src', 'app', 'api', 'admin', 'import', 'rollback', 'route.ts'), 'utf-8')

check(
  'rollback route imports resolveSchedulerSemester',
  rollbackRoute.includes("import { resolveSchedulerSemester }"),
)

check(
  'rollback route has same-semester guard',
  rollbackRoute.includes('batch.semesterId !== semester.id'),
)

// ── 7. Abandon route checks ──

const abandonRoute = fs.readFileSync(path.join(ROOT, 'src', 'app', 'api', 'admin', 'import', 'batches', '[id]', 'abandon', 'route.ts'), 'utf-8')

check(
  'abandon route imports resolveSchedulerSemester',
  abandonRoute.includes("import { resolveSchedulerSemester }"),
)

check(
  'abandon route has same-semester guard',
  abandonRoute.includes('batch.semesterId !== semester.id'),
)

// ── 8. Python parser unchanged ──

const parserPath = path.join(ROOT, 'scripts', 'parse_schedule.py')
const parserContent = fs.readFileSync(parserPath, 'utf-8')

check(
  'Python parser does not contain semester concept',
  !parserContent.includes('semester'),
)

// ── 9. No solver modifications ──

const solverDir = path.join(ROOT, 'src', 'lib', 'scheduler')
const solverFiles = fs.readdirSync(solverDir).filter(f => f.endsWith('.ts'))

let solverModified = false
for (const f of solverFiles) {
  const content = fs.readFileSync(path.join(solverDir, f), 'utf-8')
  if (content.includes('importBatch') || content.includes('ImportBatch')) {
    solverModified = true
    break
  }
}

check(
  'No solver files reference import logic',
  !solverModified,
)

// ── 10. ClassGroup global unique preserved ──

check(
  'ClassGroup.name @unique preserved',
  /model ClassGroup[\s\S]*?name\s+String\s+@unique/.test(schema),
)

check(
  'ClassGroup does NOT have @@unique([semesterId, name])',
  !/model ClassGroup[\s\S]*?@@unique\(\[semesterId,\s*name\]\)/.test(schema),
)

// ── Output ──

console.log('\n=== K10 Import Semester Scoping Fix-A Verification ===\n')

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
