/**
 * K10 Import Semester Scoping Fix-B Verification
 *
 * Read-only verification script. Does NOT write to the database.
 * Checks that ClassGroup scoped uniqueness and import guard fixes are in place.
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

const schema = fs.readFileSync(path.join(ROOT, 'prisma', 'schema.prisma'), 'utf-8')

const classGroupModelMatch = schema.match(/model ClassGroup \{[\s\S]*?\n\}/)
const classGroupModel = classGroupModelMatch ? classGroupModelMatch[0] : ''

check(
  'ClassGroup.name does NOT have @unique',
  !/^\s+name\s+String\s+@unique/m.test(classGroupModel),
)

check(
  'ClassGroup has @@unique([semesterId, name])',
  classGroupModel.includes('@@unique([semesterId, name]'),
)

check(
  'ClassGroup.semesterId is still nullable',
  /^\s+semesterId\s+Int\?/m.test(classGroupModel),
)

check(
  'ClassGroup has @@index([semesterId])',
  classGroupModel.includes('@@index([semesterId])'),
)

// ── 2. Importer checks ──

const importer = fs.readFileSync(path.join(ROOT, 'src', 'lib', 'import', 'importer.ts'), 'utf-8')

check(
  'No classGroup.findUnique({ where: { name } }) in importer',
  !importer.includes('classGroup.findUnique({ where: { name }'),
)

check(
  'importer ClassGroup lookup uses findFirst with semesterId',
  /classGroup\.findFirst\(\{[\s\S]*?where:\s*\{[\s\S]*?semesterId[\s\S]*?name/.test(importer),
)

check(
  'importer ClassGroup create writes semesterId',
  /classGroup\.create\(\{[\s\S]*?semesterId/.test(importer),
)

check(
  'importer confirmImportBatchDryRun ClassGroup findMany scoped by semesterId',
  /classGroup\.findMany\(\{[\s\S]*?semesterId[\s\S]*?name/.test(importer),
)

check(
  'confirmed guard includes semesterId in where',
  /importBatch\.findFirst\(\{[\s\S]*?where:\s*\{[\s\S]*?semesterId[\s\S]*?status[\s\S]*?confirmed/.test(importer) ||
  /importBatch\.findFirst\(\{[\s\S]*?where:\s*\{[\s\S]*?status[\s\S]*?confirmed[\s\S]*?semesterId/.test(importer),
)

// ── 3. Confirm route checks ──

const confirmRoute = fs.readFileSync(path.join(ROOT, 'src', 'app', 'api', 'admin', 'import', 'confirm', 'route.ts'), 'utf-8')

check(
  'confirm route supports query semesterId',
  confirmRoute.includes('searchParams.get') && confirmRoute.includes('semesterId'),
)

check(
  'confirm route handles body semesterId',
  confirmRoute.includes('body.semesterId'),
)

check(
  'confirm route validates body/query semesterId consistency',
  confirmRoute.includes('body.semesterId !== semester.id'),
)

// ── 4. Fix-A regression checks (must still pass) ──

check(
  'ImportBatch has semesterId field',
  /^\s+semesterId\s+Int\?/m.test(schema),
)

check(
  'ImportBatch has @@index([semesterId])',
  /model ImportBatch[\s\S]*?@@index\(\[semesterId\]\)/.test(schema),
)

check(
  'TeachingTask.create writes semesterId',
  /teachingTask\.create\(\{[\s\S]*?semesterId/.test(importer),
)

check(
  'TeachingTask findMany includes semesterId',
  /teachingTask\.findMany\(\{[\s\S]*?where:\s*\{[\s\S]*?semesterId/.test(importer),
)

check(
  'ScheduleSlot.create writes semesterId',
  /scheduleSlot\.create\(\{[\s\S]*?semesterId/.test(importer),
)

check(
  'ScheduleSlot findFirst includes semesterId',
  /scheduleSlot\.findFirst\(\{[\s\S]*?where:\s*\{[\s\S]*?semesterId/.test(importer),
)

check(
  'parse route writes ImportBatch.semesterId',
  fs.readFileSync(path.join(ROOT, 'src', 'app', 'api', 'admin', 'import', 'parse', 'route.ts'), 'utf-8').includes('semesterId: semester.id'),
)

check(
  'batch detail route has same-semester guard',
  fs.readFileSync(path.join(ROOT, 'src', 'app', 'api', 'admin', 'import', 'batches', '[id]', 'route.ts'), 'utf-8').includes('batch.semesterId !== semester.id'),
)

// ── 5. No forbidden changes ──

const parserContent = fs.readFileSync(path.join(ROOT, 'scripts', 'parse_schedule.py'), 'utf-8')
check(
  'Python parser not modified',
  !parserContent.includes('semester'),
)

const solverDir = path.join(ROOT, 'src', 'lib', 'scheduler')
let solverModified = false
for (const f of fs.readdirSync(solverDir).filter(f => f.endsWith('.ts'))) {
  const content = fs.readFileSync(path.join(solverDir, f), 'utf-8')
  if (content.includes('importBatch') || content.includes('ImportBatch')) {
    solverModified = true
    break
  }
}
check(
  'No solver modifications',
  !solverModified,
)

check(
  'No UI semester selector',
  !fs.existsSync(path.join(ROOT, 'src', 'components', 'semester-selector.tsx')),
)

check(
  'ImportBatch.semesterId still nullable',
  /model ImportBatch[\s\S]*?semesterId\s+Int\?/.test(schema),
)

// ── Output ──

console.log('\n=== K10 Import Semester Scoping Fix-B Verification ===\n')

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
