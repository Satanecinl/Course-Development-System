/**
 * scripts/guard-release-package-k36-a5g.ts
 *
 * K36-A5G: Release packaging guard. Prevents external delivery packages
 * (source archives, reporting bundles, scripts-packaging zips) from
 * accidentally including sensitive local artifacts such as
 * prisma/dev.db, uploads/, .env, real .docx teacher reports, teachers
 * whitelist files, temp/local-artifacts, ignored DB backups, etc.
 *
 * DESIGN
 *   Read-only. Never opens or reads file contents — only path/filename
 *   matching. Does not modify any file. Does not run git, npm, or any
 *   side-effecting command. Suitable as a CI gate before a release
 *   zip is created.
 *
 * SCOPE (what this guard does)
 *   1. Validates a "release manifest" — a plain-text file with one
 *      relative path per line (the paths that would be packaged).
 *   2. Walks a target directory (e.g. --root .) and applies the same
 *      rules to every regular file under it.
 *   3. By default the walker respects a hard-skip list (.git, node_modules,
 *      .next, .claude, .codegraph, .gitignored files) so it doesn't
 *      explode on repo-scale trees. Use --include-ignored to force
 *      scanning them (and document that the root scan will then
 *      correctly report BLOCKING on real .env, dev.db, etc.).
 *
 * SCOPE (what this guard does NOT do)
 *   - Does NOT read file content. PII content scanning is the job of
 *     `scripts/scan-docs-pii.ts` (run via `npm run scan:docs-pii`).
 *   - Does NOT clean Git history. The guard protects future packages,
 *     not the past.
 *   - Does NOT decide whether the repo can be made public. Public
 *     publishing requires a separate Git history rewrite / fresh
 *     repo decision.
 *   - Does NOT delete, move, or upload anything.
 *
 * MODES
 *   --root <path>            Walk a target directory. Default: skip
 *                            .git, node_modules, .next, .claude,
 *                            .codegraph, .gitignored files.
 *   --root-raw <path>        Walk a target directory and include
 *                            ignored paths (e.g. for a sanity check
 *                            that dev.db / uploads are correctly
 *                            BLOCKED when present).
 *   --manifest <path>        Read a manifest file (one path per line,
 *                            `#` for comments, blank lines allowed).
 *                            Each non-comment line is treated as a
 *                            relative path under --root (default
 *                            --root = ".").
 *   --strict                 Also treat WARNING hits as BLOCKING.
 *   --json                   Emit machine-readable JSON only.
 *   --self-test              Run built-in self-test suite and exit.
 *
 * EXIT CODES
 *   0  PASS  (no blocking hits, no warnings, OR only warnings under
 *            non-strict mode)
 *   1  FAIL  (one or more BLOCKING hits, OR WARNING hits in strict mode)
 *   2  USAGE_ERROR (bad arguments, missing manifest, missing root)
 *
 * CONTENT NEVER PRINTED
 *   This script only prints paths and rule IDs. It does not open or
 *   echo file contents.
 */

import * as fs from 'node:fs'
import * as path from 'node:path'

// ── Types ─────────────────────────────────────────────────────────────

interface Hit {
  path: string
  ruleId: string
  reason: string
  level: 'BLOCKING' | 'WARNING'
}

interface ScanResult {
  scannedFileCount: number
  bannedHitCount: number
  warningHitCount: number
  blockingHits: Hit[]
  warningHits: Hit[]
  finalVerdict: 'PASS' | 'FAIL'
  mode: 'manifest' | 'root' | 'root-raw' | 'self-test'
  root: string
  strict: boolean
  scannedAt: string
}

// ── Rules ─────────────────────────────────────────────────────────────
// Patterns are POSIX-style. We use a minimal matcher that supports:
//   - ** for any number of path segments
//   - *  for any sequence of non-separator chars
//   - ?  for any single non-separator char
//   - literal path segments otherwise
// This avoids pulling in minimatch / micromatch and keeps the script
// dependency-free.

interface BlockingRule {
  ruleId: string
  pattern: string
  reason: string
}
interface WarningRule {
  ruleId: string
  pattern: string
  reason: string
}

const BLOCKING_RULES: BlockingRule[] = [
  // VCS / build / runtime caches
  { ruleId: 'VCS_GIT', pattern: '**/.git/**', reason: 'Git internals must never be packaged' },
  { ruleId: 'NODE_MODULES', pattern: '**/node_modules/**', reason: 'node_modules is reproducible from package-lock and must be omitted' },
  { ruleId: 'NEXT_BUILD', pattern: '**/.next/**', reason: 'Next.js build output is reproducible and must be omitted' },
  { ruleId: 'TSBUILDINFO', pattern: '**/*.tsbuildinfo', reason: 'TypeScript incremental build info must be omitted' },
  { ruleId: 'COVERAGE', pattern: '**/coverage/**', reason: 'Test coverage output must be omitted' },
  { ruleId: 'CODEGRAPH', pattern: '**/.codegraph/**', reason: 'Local code graph cache must be omitted' },
  { ruleId: 'CLAUDE', pattern: '**/.claude/**', reason: 'Local Claude tool config must be omitted' },

  // Environment / secrets
  { ruleId: 'ENV_FILE', pattern: '**/.env', reason: '.env must never be packaged' },
  { ruleId: 'ENV_FILE_VARIANT', pattern: '**/.env.*', reason: '.env.* variants (incl. .env.local, .env.production) must never be packaged' },

  // Database / backups
  { ruleId: 'PRISMA_DEV_DB', pattern: '**/prisma/dev.db', reason: 'Local Prisma dev.db must never be packaged' },
  { ruleId: 'PRISMA_DB', pattern: '**/prisma/*.db', reason: 'Local Prisma .db files must never be packaged' },
  { ruleId: 'PRISMA_BACKUP', pattern: '**/prisma/*.backup*', reason: 'Prisma backup files must never be packaged' },
  { ruleId: 'PRISMA_BACKUPS_DIR', pattern: '**/prisma/backups/**', reason: 'Prisma backup directory must never be packaged' },
  { ruleId: 'GENERIC_DB', pattern: '**/*.db', reason: 'Generic .db files must never be packaged' },
  { ruleId: 'SQLITE_DB', pattern: '**/*.sqlite', reason: 'SQLite files must never be packaged' },
  { ruleId: 'SQLITE3_DB', pattern: '**/*.sqlite3', reason: 'SQLite3 files must never be packaged' },
  { ruleId: 'BACKUP_FILE', pattern: '**/*.backup*', reason: 'Backup files must never be packaged' },

  // User uploads
  { ruleId: 'UPLOADS', pattern: '**/uploads/**', reason: 'Upload directory must never be packaged' },
  { ruleId: 'IMPORTS', pattern: '**/imports/**', reason: 'Imports directory must never be packaged' },

  // Local-only / scratch
  { ruleId: 'TEMP', pattern: '**/temp/**', reason: 'Local-only temp directory must never be packaged (allowlisted: temp/README.md, temp/.gitkeep)' },

  // Teacher whitelist / class data / real fixture / data files
  { ruleId: 'TEACHERS_LIST', pattern: '**/scripts/teachers.txt', reason: 'Real teacher whitelist must never be packaged' },
  { ruleId: 'TEACHERS_XLSX', pattern: '**/scripts/teachers.xlsx', reason: 'Real teacher spreadsheet must never be packaged' },
  { ruleId: 'TEACHERS_LIST_GLOB', pattern: '**/teachers.txt', reason: 'Real teacher whitelist must never be packaged' },
  { ruleId: 'TEACHERS_XLSX_GLOB', pattern: '**/teachers.xlsx', reason: 'Real teacher spreadsheet must never be packaged' },
  { ruleId: 'CLASS_STUDENT_COUNT_CSV', pattern: '**/data/class-student-count.csv', reason: 'Local real class data must never be packaged' },
  { ruleId: 'ROOM_CAPACITY_CSV', pattern: '**/data/room-capacity.csv', reason: 'Local real room data must never be packaged' },
  { ruleId: 'SEMESTER_2026_OUTPUT', pattern: '**/semester_2026.*', reason: 'Real semester export must never be packaged' },
  { ruleId: 'OUTPUT_JSON', pattern: '**/output.json', reason: 'Generic real-data output.json must never be packaged' },

  // Reports / generate-report scripts (K36-B1A7A moved these to temp)
  { ruleId: 'GENERATE_REPORT', pattern: '**/scripts/generate-report-*.js', reason: 'Generate-report scripts produce real data and must never be packaged' },
  { ruleId: 'REPORT_TECH_MD', pattern: '**/_check_tech.md', reason: 'Local report draft must never be packaged' },
  { ruleId: 'REPORT_USAGE_MD', pattern: '**/_check_usage.md', reason: 'Local report draft must never be packaged' },

  // K35-A report docx
  { ruleId: 'REPORT_DOCX_GLOB', pattern: '**/*汇报材料-*.docx', reason: 'K35-A report docx (real data) must never be packaged' },
  { ruleId: 'REPORT_DOCX_GLOB2', pattern: '**/*汇报素材-*.docx', reason: 'K35-A report docx (real data) must never be packaged' },
]

const WARNING_RULES: WarningRule[] = [
  // Document / media files
  { ruleId: 'DOCX_FILE', pattern: '**/*.docx', reason: '.docx files may contain real business data; manually review before packaging' },
  { ruleId: 'XLSX_FILE', pattern: '**/*.xlsx', reason: '.xlsx files may contain real business data; manually review before packaging' },
  { ruleId: 'CSV_FILE', pattern: '**/*.csv', reason: '.csv files may contain real business data; manually review before packaging' },
  { ruleId: 'ARCHIVE_ZIP', pattern: '**/*.zip', reason: '.zip files may contain real business data; manually review before packaging' },
  { ruleId: 'ARCHIVE_7Z', pattern: '**/*.7z', reason: '.7z files may contain real business data; manually review before packaging' },
  { ruleId: 'ARCHIVE_RAR', pattern: '**/*.rar', reason: '.rar files may contain real business data; manually review before packaging' },
  // Image files
  { ruleId: 'IMG_PNG', pattern: '**/*.png', reason: 'Image files may contain screenshots with real data; manually review' },
  { ruleId: 'IMG_JPG', pattern: '**/*.jpg', reason: 'Image files may contain screenshots with real data; manually review' },
  { ruleId: 'IMG_JPEG', pattern: '**/*.jpeg', reason: 'Image files may contain screenshots with real data; manually review' },
  { ruleId: 'IMG_WEBP', pattern: '**/*.webp', reason: 'Image files may contain screenshots with real data; manually review' },

  // Path-content guards (case-sensitive, applies to path string only — never opens file)
  { ruleId: 'PATH_REPORT_KEYWORD', pattern: '__KEYWORD__:汇报材料', reason: 'Path contains 汇报材料 (K35-A report material); manually review' },
  { ruleId: 'PATH_REAL_KEYWORD', pattern: '__KEYWORD__:真实', reason: 'Path contains 真实 (real); manually review for sensitive content' },
  { ruleId: 'PATH_TEACHER_KEYWORD', pattern: '__KEYWORD__:teacher', reason: 'Path contains "teacher"; manually review for sensitive content' },
  { ruleId: 'PATH_STUDENT_KEYWORD', pattern: '__KEYWORD__:student', reason: 'Path contains "student"; manually review for sensitive content' },
  { ruleId: 'PATH_PHONE_KEYWORD', pattern: '__KEYWORD__:phone', reason: 'Path contains "phone"; manually review for sensitive content' },
]

// ── Path matcher (minimal POSIX glob) ────────────────────────────────
// Supports `**`, `*`, `?` in each segment. Case-insensitive on Windows.

function globToRegExp(pattern: string): RegExp {
  // Normalize separators to /
  const normalized = pattern.replace(/\\/g, '/')

  // Convert glob to regex. Semantics:
  //   - `**` between segments matches any prefix (including empty) and
  //     any suffix (including empty), spanning zero or more path
  //     segments. Effectively: `^.*` or `.*$` around the literal part.
  //   - `*` matches any sequence of non-separator characters.
  //   - `?` matches any single non-separator character.
  //   - All other characters are literal.
  //
  // For patterns like `**/temp/**`, the resulting regex must match both
  // root-level `temp/foo` and nested `x/temp/y`. So we use:
  //   ^ (.*/)? LITERAL_PART (?:/.*)? $
  // where LITERAL_PART is the part between any leading `**/` and trailing `/**`.

  // Strip leading `**/` and trailing `/**`
  let core = normalized
  let prefixGlob = false
  let suffixGlob = false
  if (core.startsWith('**/')) {
    core = core.slice(3)
    prefixGlob = true
  }
  if (core.endsWith('/**')) {
    core = core.slice(0, -3)
    suffixGlob = true
  }

  // Now `core` is a literal path with possible `*` and `?` in segments.
  let coreRegex = ''
  for (let i = 0; i < core.length; i++) {
    const c = core[i]
    if (c === '*') {
      coreRegex += '[^/]*'
    } else if (c === '?') {
      coreRegex += '[^/]'
    } else if (c === '/') {
      coreRegex += '/'
    } else {
      coreRegex += c.replace(/[.+^$|()[\]{}\\]/g, '\\$&')
    }
  }

  const regex =
    '^' +
    (prefixGlob ? '(?:.*/)?' : '') +
    coreRegex +
    (suffixGlob ? '(?:/.*)?' : '') +
    '$'

  return new RegExp(regex, process.platform === 'win32' ? 'i' : '')
}

// Pre-compile rule regexps
const COMPILED_BLOCKING = BLOCKING_RULES.map((r) => ({
  ...r,
  regex: r.pattern.startsWith('__KEYWORD__:')
    ? null
    : globToRegExp(r.pattern),
  isKeyword: r.pattern.startsWith('__KEYWORD__:'),
  keyword: r.pattern.replace('__KEYWORD__:', ''),
}))

const COMPILED_WARNING = WARNING_RULES.map((r) => ({
  ...r,
  regex: r.pattern.startsWith('__KEYWORD__:')
    ? null
    : globToRegExp(r.pattern),
  isKeyword: r.pattern.startsWith('__KEYWORD__:'),
  keyword: r.pattern.replace('__KEYWORD__:', ''),
}))

// ── Path classification ─────────────────────────────────────────────

function normalizePath(p: string): string {
  // Normalize separators, remove leading ./ and ./
  let s = p.replace(/\\/g, '/')
  while (s.startsWith('./')) s = s.slice(2)
  // Resolve .. segments (no symlink following; just lexical)
  const parts = s.split('/').filter((p) => p.length > 0 && p !== '.')
  const result: string[] = []
  for (const part of parts) {
    if (part === '..') {
      result.pop()
    } else {
      result.push(part)
    }
  }
  return result.join('/')
}

function isAllowlistedForRule(relPath: string, rule: { ruleId: string; pattern: string }): boolean {
  // temp/README.md and temp/.gitkeep are tracked files inside the otherwise-ignored temp/ — allowlist.
  if (rule.ruleId === 'TEMP') {
    if (relPath === 'temp/README.md' || relPath === 'temp/.gitkeep') return true
  }
  return false
}

function classifyPath(relPath: string): { level: 'BLOCKING' | 'WARNING' | null; ruleId: string; reason: string } {
  const p = normalizePath(relPath)
  // Check blocking first (more specific)
  for (const r of COMPILED_BLOCKING) {
    if (r.isKeyword) {
      if (p.includes(r.keyword!)) {
        if (isAllowlistedForRule(p, r)) continue
        return { level: 'BLOCKING', ruleId: r.ruleId, reason: r.reason }
      }
    } else if (r.regex && r.regex.test(p)) {
      if (isAllowlistedForRule(p, r)) continue
      return { level: 'BLOCKING', ruleId: r.ruleId, reason: r.reason }
    }
  }
  for (const r of COMPILED_WARNING) {
    if (r.isKeyword) {
      if (p.includes(r.keyword!)) {
        return { level: 'WARNING', ruleId: r.ruleId, reason: r.reason }
      }
    } else if (r.regex && r.regex.test(p)) {
      return { level: 'WARNING', ruleId: r.ruleId, reason: r.reason }
    }
  }
  return { level: null, ruleId: '', reason: '' }
}

// ── Directory walker ────────────────────────────────────────────────

const HARD_SKIP_DIRS = new Set([
  '.git',
  'node_modules',
  '.next',
  '.claude',
  '.codegraph',
  'coverage',
  'out',
  'build',
])

function isGitignored(absPath: string, root: string): boolean {
  // Minimal gitignore check: just look for the file at top-level
  // and check against well-known ignore patterns. This is intentionally
  // approximate; for the guard's purpose it's enough.
  const rel = path.relative(root, absPath).replace(/\\/g, '/')
  const top = rel.split('/')[0]
  const IGNORED_TOP = new Set([
    'node_modules',
    '.next',
    '.claude',
    '.codegraph',
    'coverage',
    'out',
    'build',
    'uploads',
    'prisma/backups',
    'temp',
    'scripts/f2-verify-screenshots',
    'scripts/k31-a-sample',
    'scripts/k32-a-sample',
  ])
  return IGNORED_TOP.has(top)
}

interface WalkOptions {
  root: string
  includeIgnored: boolean
}

async function walkRoot(opts: WalkOptions): Promise<string[]> {
  const out: string[] = []
  async function visit(dir: string): Promise<void> {
    let entries: fs.Dirent[]
    try {
      entries = await fs.promises.readdir(dir, { withFileTypes: true })
    } catch {
      return
    }
    for (const entry of entries) {
      const abs = path.join(dir, entry.name)
      const rel = normalizePath(path.relative(opts.root, abs))
      if (entry.isDirectory()) {
        if (HARD_SKIP_DIRS.has(entry.name)) continue
        if (!opts.includeIgnored && isGitignored(abs, opts.root)) continue
        await visit(abs)
      } else if (entry.isFile()) {
        if (!opts.includeIgnored && isGitignored(abs, opts.root)) continue
        out.push(rel)
      } else if (entry.isSymbolicLink()) {
        // Skip symlinks to avoid escaping the root.
        continue
      }
    }
  }
  await visit(opts.root)
  return out
}

// ── Manifest reader ─────────────────────────────────────────────────

async function readManifest(manifestPath: string): Promise<string[]> {
  const content = await fs.promises.readFile(manifestPath, 'utf8')
  const lines = content.split(/\r?\n/)
  const paths: string[] = []
  for (const raw of lines) {
    const line = raw.trim()
    if (!line || line.startsWith('#')) continue
    paths.push(line)
  }
  return paths
}

// ── Scan core ───────────────────────────────────────────────────────

interface ScanOptions {
  mode: 'manifest' | 'root' | 'root-raw'
  root: string
  paths: string[]
  strict: boolean
}

async function scanPaths(opts: ScanOptions): Promise<ScanResult> {
  const blockingHits: Hit[] = []
  const warningHits: Hit[] = []
  let scannedFileCount = 0

  for (const p of opts.paths) {
    scannedFileCount++
    const cls = classifyPath(p)
    if (cls.level === 'BLOCKING') {
      blockingHits.push({ path: p, ruleId: cls.ruleId, reason: cls.reason, level: 'BLOCKING' })
    } else if (cls.level === 'WARNING') {
      warningHits.push({ path: p, ruleId: cls.ruleId, reason: cls.reason, level: 'WARNING' })
    }
  }

  const blocking = blockingHits.length
  const warning = warningHits.length
  let verdict: 'PASS' | 'FAIL' = 'PASS'
  if (blocking > 0) verdict = 'FAIL'
  else if (opts.strict && warning > 0) verdict = 'FAIL'

  return {
    scannedFileCount,
    bannedHitCount: blocking,
    warningHitCount: warning,
    blockingHits,
    warningHits,
    finalVerdict: verdict,
    mode: opts.mode,
    root: opts.root,
    strict: opts.strict,
    scannedAt: new Date().toISOString(),
  }
}

// ── Output ──────────────────────────────────────────────────────────

function formatHumanReadable(result: ScanResult): string {
  const lines: string[] = []
  lines.push('=== K36-A5G Release Packaging Guard ===')
  lines.push('')
  lines.push(`Mode:           ${result.mode}`)
  lines.push(`Root:           ${result.root}`)
  lines.push(`Strict:         ${result.strict}`)
  lines.push(`Scanned at:     ${result.scannedAt}`)
  lines.push('')
  lines.push(`Scanned files:  ${result.scannedFileCount}`)
  lines.push(`Blocking hits:  ${result.bannedHitCount}`)
  lines.push(`Warning hits:   ${result.warningHitCount}`)
  lines.push('')
  if (result.blockingHits.length > 0) {
    lines.push('--- BLOCKING HITS ---')
    for (const h of result.blockingHits) {
      lines.push(`  [${h.ruleId}] ${h.path}`)
      lines.push(`     ${h.reason}`)
    }
    lines.push('')
  }
  if (result.warningHits.length > 0) {
    lines.push('--- WARNING HITS ---')
    for (const h of result.warningHits) {
      lines.push(`  [${h.ruleId}] ${h.path}`)
      lines.push(`     ${h.reason}`)
    }
    lines.push('')
  }
  lines.push(`Final verdict:  ${result.finalVerdict}`)
  if (result.finalVerdict === 'PASS') {
    lines.push('Package is safe to assemble from this manifest / root.')
  } else {
    lines.push('DO NOT assemble a release package from this manifest / root. Remove or exclude the listed paths first.')
  }
  return lines.join('\n')
}

// ── Self-test ────────────────────────────────────────────────────────

interface SelfTestCase {
  name: string
  paths: string[]
  strict?: boolean
  expectVerdict: 'PASS' | 'FAIL'
  expectBlockingContains?: string[]
  expectWarningContains?: string[]
}

const SELF_TEST_CASES: SelfTestCase[] = [
  {
    name: 'clean synthetic manifest: src/, scripts/, docs/, prisma/schema.prisma',
    paths: [
      'src/lib/scheduler/score.ts',
      'scripts/verify-score-regression-harness-k22-c.ts',
      'docs/k36-a5g-release-packaging-guard.md',
      'prisma/schema.prisma',
      'package.json',
      'tsconfig.json',
    ],
    expectVerdict: 'PASS',
  },
  {
    name: 'manifest includes prisma/dev.db → BLOCKING',
    paths: ['prisma/dev.db'],
    expectVerdict: 'FAIL',
    expectBlockingContains: ['prisma/dev.db'],
  },
  {
    name: 'manifest includes .env → BLOCKING',
    paths: ['.env'],
    expectVerdict: 'FAIL',
    expectBlockingContains: ['.env'],
  },
  {
    name: 'manifest includes .env.production → BLOCKING',
    paths: ['.env.production'],
    expectVerdict: 'FAIL',
    expectBlockingContains: ['.env.production'],
  },
  {
    name: 'manifest includes temp/local-artifacts/file.docx → BLOCKING',
    paths: ['temp/local-artifacts/k36-b1a7a/some.docx'],
    expectVerdict: 'FAIL',
    expectBlockingContains: ['temp/local-artifacts/k36-b1a7a/some.docx'],
  },
  {
    name: 'manifest includes scripts/teachers.txt → BLOCKING',
    paths: ['scripts/teachers.txt'],
    expectVerdict: 'FAIL',
    expectBlockingContains: ['scripts/teachers.txt'],
  },
  {
    name: 'manifest includes ordinary docx → WARNING only (default mode)',
    paths: ['docs/sample.docx'],
    expectVerdict: 'PASS',
    expectWarningContains: ['docs/sample.docx'],
  },
  {
    name: 'manifest includes ordinary docx in strict mode → FAIL',
    paths: ['docs/sample.docx'],
    strict: true,
    expectVerdict: 'FAIL',
    expectWarningContains: ['docs/sample.docx'],
  },
  {
    name: 'manifest includes uploads/x.docx → BLOCKING',
    paths: ['uploads/x.docx'],
    expectVerdict: 'FAIL',
    expectBlockingContains: ['uploads/x.docx'],
  },
  {
    name: 'manifest includes scripts/generate-report-tech.js → BLOCKING',
    paths: ['scripts/generate-report-tech.js'],
    expectVerdict: 'FAIL',
    expectBlockingContains: ['scripts/generate-report-tech.js'],
  },
  {
    name: 'manifest includes report docx with 汇报材料 keyword → BLOCKING',
    paths: ['temp/汇报材料-高校排课系统-test.docx'],
    expectVerdict: 'FAIL',
    expectBlockingContains: ['temp/汇报材料-高校排课系统-test.docx'],
  },
  {
    name: 'temp/README.md and temp/.gitkeep are allowlisted',
    paths: ['temp/README.md', 'temp/.gitkeep'],
    expectVerdict: 'PASS',
  },
  {
    name: 'manifest includes path with teacher keyword → WARNING (not BLOCKING per task spec)',
    paths: ['data/teacher-export.xlsx'],
    expectVerdict: 'PASS',
    expectWarningContains: ['data/teacher-export.xlsx'],
  },
  {
    name: 'manifest includes *.backup file → BLOCKING',
    paths: ['prisma/dev.backup-20260618'],
    expectVerdict: 'FAIL',
    expectBlockingContains: ['prisma/dev.backup-20260618'],
  },
  {
    name: 'manifest includes semester_2026.xlsx → BLOCKING',
    paths: ['semester_2026.xlsx'],
    expectVerdict: 'FAIL',
    expectBlockingContains: ['semester_2026.xlsx'],
  },
  {
    name: 'manifest includes node_modules/foo.js → BLOCKING',
    paths: ['node_modules/foo.js'],
    expectVerdict: 'FAIL',
    expectBlockingContains: ['node_modules/foo.js'],
  },
  {
    name: 'manifest includes .git/config → BLOCKING',
    paths: ['.git/config'],
    expectVerdict: 'FAIL',
    expectBlockingContains: ['.git/config'],
  },
]

async function runSelfTest(): Promise<{ passed: number; failed: number; failures: string[] }> {
  let passed = 0
  let failed = 0
  const failures: string[] = []
  for (const tc of SELF_TEST_CASES) {
    const result = await scanPaths({
      mode: 'self-test',
      root: '.',
      paths: tc.paths,
      strict: !!tc.strict,
    })
    let ok = result.finalVerdict === tc.expectVerdict
    if (ok && tc.expectBlockingContains) {
      for (const p of tc.expectBlockingContains) {
        if (!result.blockingHits.some((h) => h.path === p)) {
          ok = false
          failures.push(`Case "${tc.name}": expected BLOCKING hit ${p}, not found`)
        }
      }
    }
    if (ok && tc.expectWarningContains) {
      for (const p of tc.expectWarningContains) {
        if (!result.warningHits.some((h) => h.path === p)) {
          ok = false
          failures.push(`Case "${tc.name}": expected WARNING hit ${p}, not found`)
        }
      }
    }
    if (ok) {
      passed++
    } else {
      failed++
      if (!failures.some((f) => f.startsWith(`Case "${tc.name}"`))) {
        failures.push(`Case "${tc.name}": expected verdict=${tc.expectVerdict}, got ${result.finalVerdict}; blocking=[${result.blockingHits.map((h) => h.path).join(',')}], warning=[${result.warningHits.map((h) => h.path).join(',')}]`)
      }
    }
  }
  return { passed, failed, failures }
}

// ── CLI entry ───────────────────────────────────────────────────────

function parseArgs(argv: string[]): { opts: { mode: 'manifest' | 'root' | 'root-raw'; root: string; manifest?: string; strict: boolean; json: boolean; selfTest: boolean } } {
  const args = argv.slice(2)
  const opts = {
    mode: 'root' as 'manifest' | 'root' | 'root-raw',
    root: '.',
    manifest: undefined as string | undefined,
    strict: false,
    json: false,
    selfTest: false,
  }
  for (let i = 0; i < args.length; i++) {
    const a = args[i]
    if (a === '--root') opts.root = args[++i]
    else if (a === '--root-raw') {
      opts.mode = 'root-raw'
      opts.root = args[++i]
    } else if (a === '--manifest') opts.manifest = args[++i]
    else if (a === '--strict') opts.strict = true
    else if (a === '--json') opts.json = true
    else if (a === '--self-test') opts.selfTest = true
    else if (a === '--help' || a === '-h') {
      console.log(
        [
          'Usage:',
          '  tsx scripts/guard-release-package-k36-a5g.ts [--root <path>|--root-raw <path>|--manifest <path>] [--strict] [--json] [--self-test]',
          '',
          'Options:',
          '  --root <path>     Walk target directory. Default: skip ignored paths.',
          '  --root-raw <path> Walk target directory and include ignored paths.',
          '  --manifest <path> Read manifest (one path per line, # comments).',
          '  --strict          Treat WARNING hits as BLOCKING.',
          '  --json            Emit JSON only.',
          '  --self-test       Run built-in self-test suite.',
          '',
          'Exit codes: 0 PASS, 1 FAIL, 2 USAGE_ERROR',
        ].join('\n'),
      )
      process.exit(0)
    } else {
      console.error(`Unknown argument: ${a}`)
      process.exit(2)
    }
  }
  return { opts }
}

async function main(): Promise<void> {
  const { opts } = parseArgs(process.argv)

  if (opts.selfTest) {
    const r = await runSelfTest()
    if (r.failed > 0) {
      console.log('=== K36-A5G Release Packaging Guard SELF-TEST ===')
      console.log(`Passed: ${r.passed}`)
      console.log(`Failed: ${r.failed}`)
      for (const f of r.failures) console.log(`  - ${f}`)
      process.exit(1)
    } else {
      console.log(`=== K36-A5G Release Packaging Guard SELF-TEST ===`)
      console.log(`Passed: ${r.passed} / ${SELF_TEST_CASES.length}`)
      process.exit(0)
    }
  }

  let paths: string[] = []
  let mode: 'manifest' | 'root' | 'root-raw' = opts.mode

  if (opts.manifest) {
    mode = 'manifest'
    try {
      paths = await readManifest(opts.manifest)
    } catch (err) {
      console.error(`Failed to read manifest: ${(err as Error).message}`)
      process.exit(2)
    }
  } else {
    const rootAbs = path.resolve(opts.root)
    if (!fs.existsSync(rootAbs)) {
      console.error(`Root path does not exist: ${rootAbs}`)
      process.exit(2)
    }
    paths = await walkRoot({ root: rootAbs, includeIgnored: mode === 'root-raw' })
  }

  const result = await scanPaths({ mode, root: opts.root, paths, strict: opts.strict })

  if (opts.json) {
    process.stdout.write(JSON.stringify(result, null, 2) + '\n')
  } else {
    process.stdout.write(formatHumanReadable(result) + '\n')
  }
  process.exit(result.finalVerdict === 'PASS' ? 0 : 1)
}

main().catch((err) => {
  console.error('Guard crashed:', err)
  process.exit(2)
})
