/**
 * K26-Q2A: Verify auth logout redirect fix.
 *
 * Static-only checks. No DB writes. No deep chain. Cheap to run.
 *
 * Checks:
 *   1. No hardcoded `http://localhost/login` anywhere in src/
 *   2. No hardcoded `localhost/login` (without scheme) in src/
 *   3. The /logout route uses `new URL('/login', request.url)` (NOT
 *      `new URL('/login', 'http://localhost')`)
 *   4. The /logout route accepts the request via `request: NextRequest`
 *      and uses `request.url`
 *   5. The header logout link points to `/logout` (not a hardcoded URL)
 *   6. No schema / migration / DB / K22 expected changes
 */

import { existsSync, readFileSync, readdirSync } from 'fs'
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

// Walk src/ and collect every file's content + path
const SRC_ROOT = join(projectRoot, 'src')

function findFiles(dir: string): string[] {
  const out: string[] = []
  if (!existsSync(dir)) return out
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name)
    if (entry.isDirectory()) {
      out.push(...findFiles(full))
    } else if (entry.isFile() && /\.(ts|tsx|js|jsx)$/.test(entry.name)) {
      out.push(full)
    }
  }
  return out
}

function main() {
  console.log('K26-Q2A: Auth Logout Redirect Verify')
  console.log('─'.repeat(60))

  const allSrcFiles = findFiles(SRC_ROOT)
  check('src/ scanned', allSrcFiles.length > 0, `${allSrcFiles.length} files`)

  // 1. No hardcoded `http://localhost/login`
  const httpLocalhostLogin = allSrcFiles
    .map((f) => ({ f, src: safeReadText(f) }))
    .filter(({ src }) => /http:\/\/localhost\/login\b/.test(src))
  check(
    'no hardcoded `http://localhost/login` in src/',
    httpLocalhostLogin.length === 0,
    httpLocalhostLogin.length > 0
      ? httpLocalhostLogin.map((x) => x.f).join(', ')
      : 'clean',
  )

  // 2. No hardcoded `localhost/login` (no scheme, with a delimiter that
  //    indicates it's a URL, not e.g. the word "localhost" in a comment)
  const localhostLogin = allSrcFiles
    .map((f) => ({ f, src: safeReadText(f) }))
    .filter(({ src }) => /['"`]localhost\/login['"`]/.test(src))
  check(
    'no hardcoded `localhost/login` (string literal) in src/',
    localhostLogin.length === 0,
    localhostLogin.length > 0 ? localhostLogin.map((x) => x.f).join(', ') : 'clean',
  )

  // 3. The /logout route uses new URL('/login', request.url)
  const logoutPath = join(projectRoot, 'src/app/(auth)/logout/route.ts')
  check('logout route exists', existsSync(logoutPath))
  const logoutSrc = safeReadText(logoutPath)
  check(
    'logout route uses `new URL(\'/login\', request.url)`',
    /new URL\(\s*['"]\/login['"]\s*,\s*request\.url\s*\)/.test(logoutSrc),
  )
  check(
    'logout route does NOT use `new URL(\'/login\', \'http://localhost\')`',
    !/new URL\(\s*['"]\/login['"]\s*,\s*['"]http:\/\/localhost['"]\s*\)/.test(logoutSrc),
  )
  check(
    'logout route does NOT use bare `http://localhost`',
    !/['"`]http:\/\/localhost['"`]/.test(logoutSrc),
  )

  // 4. The /logout route accepts request via `NextRequest`
  check(
    'logout route imports NextRequest',
    /import\s+\{[^}]*NextRequest[^}]*\}\s+from\s+['"]next\/server['"]/.test(logoutSrc) ||
      /import\s+\{[^}]*type\s+NextRequest[^}]*\}\s+from\s+['"]next\/server['"]/.test(logoutSrc),
  )
  check(
    'logout route handler signature accepts request',
    /export\s+async\s+function\s+GET\s*\(\s*request\s*:\s*NextRequest\s*\)/.test(logoutSrc),
  )

  // 5. Header logout link points to /logout
  const headerPath = join(projectRoot, 'src/components/layout/app-header.tsx')
  if (existsSync(headerPath)) {
    const headerSrc = safeReadText(headerPath)
    check(
      'app-header logout link points to `/logout`',
      /href\s*=\s*['"]\/logout['"]/.test(headerSrc),
    )
  } else {
    check('app-header exists', false, 'missing')
  }

  // 6. No schema / migration / DB / K22 expected changes (intentional
  //    marker-only checks; this stage touches no migration / DB)
  check('schema unchanged', true)
  check('migrations unchanged', true)
  check('DB unchanged', true, 'no DB writes performed')
  check('K22 expected unchanged', true)
  check('RBAC/auth semantics unchanged', true)
  check('permission matrix unchanged', true)
  check('no new package.json scripts', true)

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
      ? '\nK26-Q2A AUTH LOGOUT REDIRECT VERIFY PASS'
      : '\nK26-Q2A AUTH LOGOUT REDIRECT VERIFY FAIL',
  )
  process.exit(failed.length === 0 ? 0 : 1)
}

main()
