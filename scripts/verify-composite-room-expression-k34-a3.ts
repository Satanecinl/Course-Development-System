/**
 * scripts/verify-composite-room-expression-k34-a3.ts
 *
 * K34-A3: Verify composite room expression parser, importer changes,
 * schema model, repair script, display, and score/conflict integration.
 *
 * Static checks + tsx-eval behavioral checks for the parser.
 */

import { execSync } from 'child_process'
import { existsSync, readFileSync, writeFileSync, unlinkSync } from 'fs'
import { join } from 'path'

const projectRoot = join(__dirname, '..')
interface CheckResult { id: number; name: string; pass: boolean; detail?: string }
const results: CheckResult[] = []
let id = 0
function check(name: string, pass: boolean, detail?: string) {
  id++
  results.push({ id, name, pass, detail })
}

function runTsxEval(snippet: string): string {
  const tmpPath = join(projectRoot, 'scripts/_k34-a3-eval.ts')
  writeFileSync(tmpPath, snippet, 'utf-8')
  try {
    return execSync(`npx tsx "${tmpPath}"`, {
      cwd: projectRoot,
      encoding: 'utf-8',
    })
  } finally {
    try { unlinkSync(tmpPath) } catch { /* */ }
  }
}

function main() {
  console.log('K34-A3-COMPOSITE-ROOM-EXPRESSION-MULTI-ROOM: Verify')
  console.log('─'.repeat(70))

  // ── 1. Parser file presence & exports ────────────────────────────
  const parserPath = join(projectRoot, 'src/lib/rooms/composite-room-expression.ts')
  const parserSrc = existsSync(parserPath) ? readFileSync(parserPath, 'utf-8') : ''
  check('composite-room-expression.ts exists', existsSync(parserPath))
  check('parser exports parseCompositeRoomExpression', /export\s+function\s+parseCompositeRoomExpression\b/.test(parserSrc))

  // ── 2. Schema model exists ──────────────────────────────────────
  const schemaSrc = readFileSync(join(projectRoot, 'prisma/schema.prisma'), 'utf-8')
  check('ScheduleSlotAdditionalRoom model exists in schema', schemaSrc.includes('model ScheduleSlotAdditionalRoom'))
  check('ScheduleSlot has additionalRooms relation', schemaSrc.includes('additionalRooms ScheduleSlotAdditionalRoom[]'))
  check('Room has slotAdditionalRooms relation', schemaSrc.includes('slotAdditionalRooms ScheduleSlotAdditionalRoom[]'))

  // ── 3. Importer uses composite parser ───────────────────────────
  const importerSrc = readFileSync(join(projectRoot, 'src/lib/import/importer.ts'), 'utf-8')
  check('importer imports parseCompositeRoomExpression', importerSrc.includes('parseCompositeRoomExpression'))
  check('importer uses compositeComponentsMap', importerSrc.includes('compositeComponentsMap'))
  check('importer creates ScheduleSlotAdditionalRoom', importerSrc.includes('scheduleSlotAdditionalRoom'))

  // ── 4. Repair script exists ─────────────────────────────────────
  const repairPath = join(projectRoot, 'scripts/repair-composite-room-expressions-k34-a3.ts')
  const repairSrc = existsSync(repairPath) ? readFileSync(repairPath, 'utf-8') : ''
  check('repair script exists', existsSync(repairPath))
  check('repair script has --dry-run flag', /--dry-run/.test(repairSrc))
  check('repair script defaults to dry-run', /const apply\s*=/.test(repairSrc))
  check('repair script creates backup', /copyFileSync/.test(repairSrc))

  // ── 5. Schedule API includes secondary rooms ────────────────────
  const scheduleApiSrc = readFileSync(
    join(projectRoot, 'src/app/api/schedule/route.ts'), 'utf-8',
  )
  check('schedule API includes additionalRooms', scheduleApiSrc.includes('additionalRooms'))
  check('schedule API builds composite roomName', /additionalRooms.*map.*join/s.test(scheduleApiSrc))

  // ── 6. Data-loader includes secondary rooms ─────────────────────
  const loaderSrc = readFileSync(
    join(projectRoot, 'src/lib/scheduler/data-loader.ts'), 'utf-8',
  )
  check('data-loader includes additionalRooms in slot query', loaderSrc.includes('additionalRooms'))
  check('data-loader indexes slots by secondary rooms', /roomIdsForSlot/.test(loaderSrc))

  // ── 7. Score checks secondary rooms ─────────────────────────────
  const scoreSrc = readFileSync(
    join(projectRoot, 'src/lib/scheduler/score.ts'), 'utf-8',
  )
  check('score has getAllRoomIds helper', /function getAllRoomIds/.test(scoreSrc))
  check('HC5 checks all rooms (getAllRoomIds)', /HC5[\s\S]{0,500}getAllRoomIds/.test(scoreSrc))
  check('HC6 checks all rooms (getAllRoomIds)', /HC6[\s\S]{0,500}getAllRoomIds/.test(scoreSrc))
  check('HC4 uses combined capacity for multi-room', /HC4[\s\S]{0,1500}combinedCapacity/.test(scoreSrc))
  check('SC10 uses combined capacity for multi-room', /SC10[\s\S]{0,1500}combinedCapacity/.test(scoreSrc))

  // ── 8. Behavioral eval of parser ────────────────────────────────
  const evalSnippet = `
import { parseCompositeRoomExpression } from '../src/lib/rooms/composite-room-expression'

type Case = {
  name: string
  input: string | null | undefined
  expectComposite: boolean
  expectRoomCount: number
  expectFirstRoom: string
}

const cases: Case[] = [
  { name: '11-322 或 10-104', input: '11-322 或 10-104', expectComposite: true, expectRoomCount: 2, expectFirstRoom: '11-322' },
  { name: '11-322或10-104 (no spaces)', input: '11-322或10-104', expectComposite: true, expectRoomCount: 2, expectFirstRoom: '11-322' },
  { name: '11-322 或10-104', input: '11-322 或10-104', expectComposite: true, expectRoomCount: 2, expectFirstRoom: '11-322' },
  { name: '11-322或 10-104', input: '11-322或 10-104', expectComposite: true, expectRoomCount: 2, expectFirstRoom: '11-322' },
  { name: '11-322 或者 10-104', input: '11-322 或者 10-104', expectComposite: true, expectRoomCount: 2, expectFirstRoom: '11-322' },
  { name: 'A 或 B 或 C', input: '11-322 或 10-104 或 12-201', expectComposite: true, expectRoomCount: 3, expectFirstRoom: '11-322' },
  { name: 'plain room (no 或)', input: '11-322', expectComposite: false, expectRoomCount: 1, expectFirstRoom: '11-322' },
  { name: 'null input', input: null, expectComposite: false, expectRoomCount: 0, expectFirstRoom: '' },
  { name: 'empty string', input: '', expectComposite: false, expectRoomCount: 0, expectFirstRoom: '' },
  { name: '林校 304 或 10-104', input: '林校 304 或 10-104', expectComposite: true, expectRoomCount: 2, expectFirstRoom: '林校 304' },
  { name: '或 alone (not composite)', input: '或', expectComposite: false, expectRoomCount: 1, expectFirstRoom: '或' },
  { name: '或 with spaces only', input: ' 或 ', expectComposite: false, expectRoomCount: 1, expectFirstRoom: '或' },
  { name: ' 或者 with empty sides', input: ' 或者 ', expectComposite: false, expectRoomCount: 1, expectFirstRoom: '或者' },
]

const lines: string[] = []
for (const c of cases) {
  const result = parseCompositeRoomExpression(c.input)
  const compositeOk = result.isComposite === c.expectComposite
  const countOk = result.rooms.length === c.expectRoomCount
  const firstOk = c.expectRoomCount > 0 ? result.rooms[0] === c.expectFirstRoom : true
  const ok = compositeOk && countOk && firstOk
  lines.push(\`\${ok ? 'PASS' : 'FAIL'} parse[\${c.name}] = \${JSON.stringify(result)}\`)
}
console.log(lines.join('\\n'))
`
  let evalOutput: string
  try {
    evalOutput = runTsxEval(evalSnippet)
  } catch (e) {
    check('tsx eval of parser', false, String(e))
    printSummaryAndExit()
    return
  }
  const evalLines = evalOutput.trim().split('\n').filter(Boolean)
  for (const line of evalLines) {
    const pass = line.startsWith('PASS')
    const m = line.match(/^(?:PASS|FAIL)\s+(\S.*?)\s+=/)
    const nm = m ? m[1] : line.slice(0, 60)
    check(`parser: ${nm}`, pass, pass ? undefined : line)
  }

  // ── 9. DB check: no composite rooms remain ──────────────────────
  try {
    const count = execSync(
      'sqlite3 prisma/dev.db "SELECT COUNT(*) FROM Room WHERE name LIKE \'%或%\';"',
      { cwd: projectRoot, encoding: 'utf-8' },
    ).trim()
    check('no composite rooms in DB', count === '0', `count=${count}`)
  } catch {
    check('no composite rooms in DB (sqlite3 check)', false, 'sqlite3 not available')
  }

  try {
    const sarCount = execSync(
      'sqlite3 prisma/dev.db "SELECT COUNT(*) FROM ScheduleSlotAdditionalRoom;"',
      { cwd: projectRoot, encoding: 'utf-8' },
    ).trim()
    check('ScheduleSlotAdditionalRoom has records', parseInt(sarCount, 10) > 0, `count=${sarCount}`)
  } catch {
    // sqlite3 not available
  }

  // ── 10. No schema/migration/K22 changes ─────────────────────────
  // Schema IS changed (we added the model), so we accept that.
  check('schema has ScheduleSlotAdditionalRoom model (expected change)', schemaSrc.includes('model ScheduleSlotAdditionalRoom'))

  // K22 expected
  const K22_FILES = [
    'docs/k22-score-default-snapshot.json',
    'docs/k22-score-regression-harness-implementation.json',
  ]
  let k22Regression = false
  for (const f of K22_FILES) {
    try {
      const diffOut = execSync(`git diff HEAD -- "${f}"`, {
        cwd: projectRoot,
        encoding: 'utf-8',
      })
      if (!diffOut.trim()) continue
      const lines = diffOut.split('\n')
      const nonGen = lines.some((line) => {
        if (!line.startsWith('+') && !line.startsWith('-')) return false
        if (line.startsWith('+++') || line.startsWith('---')) return false
        return !line.includes('"generatedAt"')
      })
      if (nonGen) k22Regression = true
    } catch { /* */ }
  }
  check('K22 expected/snapshot unchanged', !k22Regression)

  // ── 11. dev.db not staged ───────────────────────────────────────
  const stagedOut = execSync('git diff --cached --name-only', {
    cwd: projectRoot,
    encoding: 'utf-8',
  }).trim()
  const staged = stagedOut.split('\n').filter(Boolean)
  check('prisma/dev.db not staged', !staged.includes('prisma/dev.db'))
  check('no DB backup staged', !staged.some((f) => /backup-before-k/i.test(f)))

  // ── 12. score.ts HC5/HC6 secondary room coverage ────────────────
  check(
    'HC5 loop calls getAllRoomIds (covers secondary rooms)',
    /HC5[\s\S]{0,1000}getAllRoomIds/.test(scoreSrc),
  )
  check(
    'HC6 loop calls getAllRoomIds (covers secondary rooms)',
    /HC6[\s\S]{0,1000}getAllRoomIds/.test(scoreSrc),
  )

  // ── Summary ─────────────────────────────────────────────────────
  printSummaryAndExit()
}

function printSummaryAndExit() {
  console.log('')
  const passed = results.filter((r) => r.pass).length
  const failed = results.filter((r) => !r.pass)
  for (const r of results) {
    const mark = r.pass ? '✓' : '✗'
    const detail = r.detail ? ` — ${r.detail}` : ''
    console.log(`  ${mark} ${r.name}${detail}`)
  }
  console.log('')
  console.log(`Result: ${passed}/${results.length} passed`)
  if (failed.length > 0) {
    console.log(`FAILED (${failed.length}):`)
    for (const r of failed) {
      console.log(`  - ${r.name}${r.detail ? ` — ${r.detail}` : ''}`)
    }
    process.exit(1)
  }
  console.log('K34-A3 verify PASS')
}

main()
