// scripts/verify-class-groups-semester-scope.ts
// K10-SEMESTER-ORDINARY-SCHEDULE-SCOPING-FIX — verification script
// Read-only: checks that GET /api/class-groups is semester-scoped.

import { readFileSync } from 'node:fs'
import { join } from 'node:path'

const ROOT = process.cwd()
const TARGET = join(ROOT, 'src/app/api/class-groups/route.ts')

let passed = 0
let failed = 0
function check(name: string, ok: boolean, detail: string) {
  if (ok) {
    console.log(`  ✅ ${name}`)
    passed++
  } else {
    console.log(`  ❌ ${name} — ${detail}`)
    failed++
  }
}

console.log('═'.repeat(60))
console.log('K10: verify-class-groups-semester-scope')
console.log('═'.repeat(60))

let src: string
try {
  src = readFileSync(TARGET, 'utf8')
} catch (err) {
  console.error(`Cannot read ${TARGET}:`, err)
  process.exit(1)
}

console.log(`\nTarget file: ${TARGET}\n`)

// 1. resolveSchedulerSemester imported
check(
  'imports resolveSchedulerSemester',
  /import\s+\{[^}]*resolveSchedulerSemester[^}]*\}\s+from\s+['"]@\/lib\/semester['"]/.test(src),
  'missing import of resolveSchedulerSemester from @/lib/semester'
)

// 2. resolveSchedulerSemester called in handler
check(
  'calls resolveSchedulerSemester()',
  /resolveSchedulerSemester\s*\(\s*\{/.test(src),
  'resolveSchedulerSemester() call not found'
)

// 3. reads semesterId from query params
check(
  'reads semesterId from searchParams',
  /searchParams\.get\s*\(\s*['"]semesterId['"]\s*\)/.test(src),
  'semesterId query param read not found'
)

// 4. classGroup.findMany has semesterId in where
check(
  'classGroup.findMany includes semesterId filter',
  /where\s*:\s*\{\s*semesterId\s*:\s*semester\.id\s*\}/.test(src),
  'classGroup.findMany missing where: { semesterId: semester.id }'
)

// 5. response shape preserved (select { id, name })
check(
  'select { id: true, name: true } preserved',
  /select\s*:\s*\{\s*id\s*:\s*true\s*,\s*name\s*:\s*true\s*\}/.test(src),
  'select shape changed'
)

// 6. requirePermission still present
check(
  'requirePermission guard still present',
  /requirePermission\s*\(\s*['"]data:read['"]/.test(src),
  'requirePermission removed'
)

// 7. no direct prisma db writes in file
check(
  'no write operations in file',
  !/\.(create|update|delete|upsert|updateMany|deleteMany|createMany)\b/.test(src),
  'unexpected write operation found'
)

console.log(`\n${'═'.repeat(60)}`)
console.log(`Results: ${passed} passed, ${failed} failed`)
console.log(`${'═'.repeat(60)}`)

if (failed > 0) {
  console.log('\n❌ Verification FAILED')
  process.exit(1)
} else {
  console.log('\n✅ All checks passed')
}
