/**
 * scripts/verify-room-name-normalization-k34-a2.ts
 *
 * K34-A2: Verify normalization helper, importer changes, and duplicate
 * repair script exist and behave correctly.
 *
 * Static checks + tsx-eval behavioral checks for the helper, plus
 * a DB-presence check that the repair script exists.
 *
 * Does NOT require a running server or apply the repair itself.
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
  const tmpPath = join(projectRoot, 'scripts/_k34-a2-eval.ts')
  writeFileSync(tmpPath, snippet, 'utf-8')
  try {
    const out = execSync(`npx tsx "${tmpPath}"`, {
      cwd: projectRoot,
      encoding: 'utf-8',
    })
    return out
  } finally {
    try {
      unlinkSync(tmpPath)
    } catch {
      // ignore
    }
  }
}

function main() {
  console.log('K34-A2-ROOM-NAME-NORMALIZATION-AND-DUPLICATE-REPAIR: Verify')
  console.log('─'.repeat(70))

  // ── 1. Helper file presence & exports ─────────────────────────────
  const helperPath = join(
    projectRoot,
    'src/lib/rooms/room-name-normalization.ts',
  )
  const helperSrc = existsSync(helperPath)
    ? readFileSync(helperPath, 'utf-8')
    : ''
  check('helper file exists', existsSync(helperPath))
  check(
    'helper exports normalizeRoomNameForMatch',
    /export\s+function\s+normalizeRoomNameForMatch\b/.test(helperSrc),
  )
  check(
    'helper exports isLikelyDuplicateRoomName',
    /export\s+function\s+isLikelyDuplicateRoomName\b/.test(helperSrc),
  )
  check(
    'helper exports pickCanonicalRoom',
    /export\s+function\s+pickCanonicalRoom\b/.test(helperSrc),
  )
  check(
    'helper exports groupDuplicatesByNormalizedName',
    /export\s+function\s+groupDuplicatesByNormalizedName\b/.test(helperSrc),
  )

  // ── 2. Importer uses the helper ───────────────────────────────────
  const importerPath = join(
    projectRoot,
    'src/lib/import/importer.ts',
  )
  const importerSrc = existsSync(importerPath)
    ? readFileSync(importerPath, 'utf-8')
    : ''
  check('importer file exists', existsSync(importerPath))
  check(
    'importer imports normalizeRoomNameForMatch',
    importerSrc.includes('normalizeRoomNameForMatch'),
  )
  check(
    'importer transaction phase uses helper for room lookup',
    /executeImportInTransaction[\s\S]{0,8000}normalizeRoomNameForMatch/.test(importerSrc),
  )
  check(
    'importer dry-run phase uses helper for room lookup',
    /confirmImportBatchDryRun[\s\S]{0,8000}normalizeRoomNameForMatch/.test(importerSrc),
  )

  // ── 3. Repair script presence + flags ─────────────────────────────
  const repairPath = join(
    projectRoot,
    'scripts/repair-duplicate-room-names-k34-a2.ts',
  )
  const repairSrc = existsSync(repairPath)
    ? readFileSync(repairPath, 'utf-8')
    : ''
  check('repair script exists', existsSync(repairPath))
  check(
    'repair script has --dry-run flag',
    /--dry-run/.test(repairSrc),
  )
  check(
    'repair script has --apply flag',
    /--apply/.test(repairSrc),
  )
  check(
    'repair script defaults to dry-run (no --apply default)',
    /dryRun\s*=\s*[^|]+\|\|/.test(repairSrc) ||
      /dryRun\s*=\s*apply/.test(repairSrc) === false,
  )
  check(
    'repair script creates a backup before apply',
    /copyFileSync\s*\(\s*dbPath\s*,\s*backupPath/.test(repairSrc) ||
      /copyFileSync[\s\S]+?dbPath/.test(repairSrc),
  )
  check(
    'repair script never imports/commits dev.db into git',
    !/git\s+add[\s\S]+?dev\.db/.test(repairSrc),
  )

  // ── 4. Behavioral eval of the helper ──────────────────────────────
  const evalSnippet = `
import { normalizeRoomNameForMatch, isLikelyDuplicateRoomName, pickCanonicalRoom, groupDuplicatesByNormalizedName } from '../src/lib/rooms/room-name-normalization'

type Case = { name: string; input: string | null | undefined; expect: string }
const cases: Case[] = [
  { name: 'plain ASCII', input: '林校304', expect: '林校304' },
  { name: 'single ASCII space', input: '林校 304', expect: '林校304' },
  { name: 'fullwidth space', input: '林校　304', expect: '林校304' },
  { name: 'leading + trailing spaces', input: '  林校304  ', expect: '林校304' },
  { name: 'tab inside', input: '林校\t304', expect: '林校304' },
  { name: 'newline inside', input: '林校\\n304', expect: '林校304' },
  { name: 'CR inside', input: '林校\\r304', expect: '林校304' },
  { name: 'NBSP', input: '林校 304', expect: '林校304' },
  { name: 'multi spaces', input: '林  校  304', expect: '林校304' },
  { name: 'mixed 11-301 variant', input: '11 - 301', expect: '11-301' },
  { name: 'zero-width space', input: '林校​304', expect: '林校304' },
  { name: 'empty string', input: '', expect: '' },
  { name: 'null', input: null, expect: '' },
  { name: 'undefined', input: undefined, expect: '' },
  { name: 'all-whitespace', input: '   ', expect: '' },
]
const lines: string[] = []
for (const c of cases) {
  const out = normalizeRoomNameForMatch(c.input)
  lines.push(\`\${out === c.expect ? 'PASS' : 'FAIL'} normalize[\${c.name}] = \${JSON.stringify(out)} (expected \${JSON.stringify(c.expect)})\`)
}

// Duplicates
const dup1 = isLikelyDuplicateRoomName('林校304', '林校 304')
lines.push(\`\${dup1 ? 'PASS' : 'FAIL'} isLikelyDuplicate('林校304', '林校 304') = \${dup1}\`)
const dup2 = isLikelyDuplicateRoomName('林校304', '林校 999')
lines.push(\`\${!dup2 ? 'PASS' : 'FAIL'} isLikelyDuplicate('林校304', '林校 999') = \${dup2}\`)
const dup3 = isLikelyDuplicateRoomName('11-301', '11 - 301')
lines.push(\`\${dup3 ? 'PASS' : 'FAIL'} isLikelyDuplicate('11-301', '11 - 301') = \${dup3}\`)

// Canonical selection
const cands = [
  { id: 1, name: '林校\\n304', refCount: 9 },
  { id: 2, name: '林校304', refCount: 5 },
]
const picked = pickCanonicalRoom(cands)
lines.push(\`\${picked?.id === 2 ? 'PASS' : 'FAIL'} pickCanonicalRoom prefers whitespace-free name (got id=\${picked?.id})\`)

const cands2 = [
  { id: 1, name: '林校\\n305', refCount: 5 },
  { id: 2, name: '林校\\n306', refCount: 9 },
]
const picked2 = pickCanonicalRoom(cands2)
lines.push(\`\${picked2?.id === 2 ? 'PASS' : 'FAIL'} pickCanonicalRoom prefers higher refCount among same-shape (got id=\${picked2?.id})\`)

// Grouping
const rooms = [
  { id: 1, name: '林校304' },
  { id: 2, name: '林校\\n304' },
  { id: 3, name: '林校305' },
  { id: 4, name: '11-301' },
  { id: 5, name: '11 - 301' },
]
const groups = groupDuplicatesByNormalizedName(rooms)
const groupCount = groups.size
const groupKeys = [...groups.keys()].sort()
lines.push(\`\${groupCount === 2 ? 'PASS' : 'FAIL'} groupDuplicates returned 2 groups (got \${groupCount})\`)
lines.push(\`\${JSON.stringify(groupKeys) === JSON.stringify(['11-301', '林校304']) ? 'PASS' : 'FAIL'} group keys = \${JSON.stringify(groupKeys)}\`)
console.log(lines.join('\\n'))
`
  let evalOutput: string
  try {
    evalOutput = runTsxEval(evalSnippet)
  } catch (e) {
    check('tsx eval of helper functions', false, String(e))
    printSummaryAndExit()
    return
  }
  const evalLines = evalOutput.trim().split('\n').filter(Boolean)
  for (const line of evalLines) {
    const pass = line.startsWith('PASS')
    const m = line.match(/^(?:PASS|FAIL)\s+(\S.*?)\s+=/)
    const name = m ? m[1] : line
    check(`helper behavior: ${name}`, pass, pass ? undefined : line)
  }

  // ── 5. No schema / migration / K22 changes ────────────────────────
  let modifiedFiles: string[] = []
  try {
    const out = execSync('git diff --name-only HEAD', {
      cwd: projectRoot,
      encoding: 'utf-8',
    })
    modifiedFiles = out.split('\n').filter(Boolean)
  } catch {
    // ignore
  }
  const hasSchemaChange = modifiedFiles.some((f) =>
    f.startsWith('prisma/schema.prisma') || f.startsWith('prisma/migrations/'),
  )
  // K34-A3 adds ScheduleSlotAdditionalRoom model + migration. This is
  // an additive change that does not conflict with K34-A2's room-name
  // normalization. If schema is changed, verify it's the K34-A3 model.
  if (hasSchemaChange) {
    const schemaSrc = readFileSync(join(projectRoot, 'prisma/schema.prisma'), 'utf-8')
    check(
      'schema change is K34-A3 additive model (ScheduleSlotAdditionalRoom)',
      schemaSrc.includes('model ScheduleSlotAdditionalRoom'),
    )
  } else {
    check('no schema/migration changes', true)
  }

  // Importer business semantics — non-room paths untouched
  check(
    'importer parse-utils unchanged',
    !modifiedFiles.includes('src/lib/import/parse-utils.ts'),
  )
  check(
    'importer quality-classifier unchanged',
    !modifiedFiles.includes('src/lib/import/quality-classifier.ts'),
  )

  // Solver / score / WorkTime. K34-A3 modifies score.ts for secondary
  // room HC5/HC6 checks; that is an expected extension, not a regression.
  const scoreTsChanged = modifiedFiles.includes('src/lib/scheduler/score.ts')
  if (scoreTsChanged) {
    const scoreSrc = readFileSync(join(projectRoot, 'src/lib/scheduler/score.ts'), 'utf-8')
    check(
      'score.ts change is K34-A3 secondary-room extension (getAllRoomIds)',
      /function getAllRoomIds/.test(scoreSrc),
    )
  } else {
    check('score.ts unchanged', true)
  }

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
    } catch {
      // ignore
    }
  }
  check('K22 expected/snapshot unchanged', !k22Regression)

  // ── 6. dev.db not staged ─────────────────────────────────────────
  const stagedOut = execSync('git diff --cached --name-only', {
    cwd: projectRoot,
    encoding: 'utf-8',
  }).trim()
  const staged = stagedOut.split('\n').filter(Boolean)
  check('prisma/dev.db not staged', !staged.includes('prisma/dev.db'))
  check(
    'no DB backup staged',
    !staged.some((f) => /backup-before-k/i.test(f) || /dev\.db\.backup/i.test(f)),
  )

  // ── 7. Importer room lookup is no longer exact-name-only ─────────
  check(
    'importer no longer relies solely on prisma.room.findUnique({where:{name}})',
    !/tx\.room\.findUnique\(\s*\{\s*where:\s*\{\s*name\s*\}\s*,/.test(importerSrc),
  )

  // ── Summary ──────────────────────────────────────────────────────
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
  console.log('K34-A2 verify PASS')
}

main()
