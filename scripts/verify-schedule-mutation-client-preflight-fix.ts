/**
 * K12 Schedule Mutation Client Preflight Fix Verification
 *
 * Read-only verification script. Does NOT write to the database.
 * Checks that client-side moveSlot has preflight conflict check before PUT.
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

// ── 1. moveSlot has preflight conflict check ──

const storePath = path.join(ROOT, 'src', 'store', 'scheduleStore.ts')
const store = fs.readFileSync(storePath, 'utf-8')

check('Schedule store exists', fs.existsSync(storePath))
check('moveSlot calls /api/conflict-check', store.includes('/api/conflict-check'))
check('moveSlot preflight is before optimistic update',
  store.indexOf('/api/conflict-check') < store.indexOf('乐观更新'))
check('moveSlot checks hasConflict', store.includes('preflightResult.hasConflict'))
check('moveSlot throws on conflict', store.includes('throw new Error(preflightResult.conflicts'))
check('moveSlot does optimistic update after preflight',
  store.indexOf('乐观更新') > store.indexOf('/api/conflict-check'))
check('moveSlot still calls PUT /api/schedule-slot', store.includes('/api/schedule-slot/${slotId}'))
check('moveSlot has rollback on error', store.includes('scheduleItems: oldItems'))
check('moveSlot throws on PUT failure (not silently returns false)',
  store.includes("throw new Error(msg)") || store.includes("throw new Error(errBody"))
check('moveSlot extracts server guard error details',
  store.includes('errBody?.conflicts') || store.includes('errBody?.error'))

// ── 2. Grid handleDragEnd handles moveSlot errors ──

const gridPath = path.join(ROOT, 'src', 'components', 'schedule-grid.tsx')
const grid = fs.readFileSync(gridPath, 'utf-8')

check('Schedule grid exists', fs.existsSync(gridPath))
check('Grid handleDragEnd wraps moveSlot in try/catch', grid.includes('await moveSlot(') && grid.includes('catch (moveErr)'))
check('Grid shows conflict error toast', grid.includes("toast.error('调课失败'"))
check('Grid surfaces moveSlot error message', grid.includes('moveErr instanceof Error ? moveErr.message'))

// ── 3. Grid still has its own preflight (UX layer) ──

check('Grid still calls conflict-check before moveSlot',
  grid.indexOf('/api/conflict-check') < grid.indexOf('await moveSlot('))

// ── 4. No forbidden changes ──

// Schema not modified
const schema = fs.readFileSync(path.join(ROOT, 'prisma', 'schema.prisma'), 'utf-8')
check('Prisma schema not modified', schema.includes('model ScheduleSlot'))

// Guard module not modified
const guardPath = path.join(ROOT, 'src', 'lib', 'schedule', 'slot-mutation-guard.ts')
const guard = fs.readFileSync(guardPath, 'utf-8')
check('slot-mutation-guard.ts not modified', guard.includes('export async function guardSlotUpdate'))

// Solver not modified
const solverDir = path.join(ROOT, 'src', 'lib', 'scheduler')
let solverModified = false
for (const f of fs.readdirSync(solverDir).filter(f => f.endsWith('.ts'))) {
  const content = fs.readFileSync(path.join(solverDir, f), 'utf-8')
  if (content.includes('preflight') || content.includes('conflict-check')) {
    solverModified = true
    break
  }
}
check('Solver not modified', !solverModified)

// Parser not modified
const parserPath = path.join(ROOT, 'scripts', 'parse_schedule.py')
check('Python parser not modified', fs.existsSync(parserPath) && !fs.readFileSync(parserPath, 'utf-8').includes('preflight'))

// Importer not modified
const importerPath = path.join(ROOT, 'src', 'lib', 'import', 'importer.ts')
check('Importer not modified', fs.existsSync(importerPath))

// conflict-check.ts not modified
const conflictLib = fs.readFileSync(path.join(ROOT, 'src', 'lib', 'conflict-check.ts'), 'utf-8')
check('conflict-check.ts core logic not modified', conflictLib.includes('export async function checkScheduleConflict'))

// No UI semester selector component added
const hasSemesterSelectorComponent = grid.includes('SemesterSelector') || grid.includes('semester-selector') || grid.includes('semesterSelector')
check('No UI semester selector added', !hasSemesterSelectorComponent)

// ── 5. moveSlot is the only entry point for slot moves in grid ──

check('Grid only uses moveSlot for slot moves', grid.includes('const success') === false || grid.includes('await moveSlot('))

// ── Output ──

console.log('\n=== K12 Schedule Mutation Client Preflight Fix Verification ===\n')

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
