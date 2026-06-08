/**
 * K25-D2: Lint baseline reconciliation.
 *
 * Compares current master lint count to K25-C1 baseline (commit a0ecd7b) by
 * actually running `npm run lint` at that commit and at current master.
 *
 * This is the ground-truth check. The previous audit script's file-based
 * detection of "K25-D/D1 introduced errors" was a heuristic; this script
 * uses git checkout to compare the two states directly.
 */
import { execSync } from 'child_process'
import { existsSync, rmSync } from 'fs'
import { resolve } from 'path'

const ROOT = resolve(__dirname, '..')
const K25C1_COMMIT = 'a0ecd7b'
const WORKTREE_DIR = resolve(ROOT, '..', '.tmp-lint-baseline-worktree')

interface LintResult {
  errors: number
  warnings: number
}

function runLintAtRef(ref: string): LintResult {
  // Use a separate worktree to avoid disturbing current state
  const wtPath = `${WORKTREE_DIR}-${ref.slice(0, 7)}`
  try {
    // Remove old worktree if any
    try { rmSync(wtPath, { recursive: true, force: true }) } catch {}
    try {
      execSync(`git worktree prune`, { cwd: ROOT, stdio: 'ignore' })
    } catch {}
    // Create new worktree at the ref
    try {
      execSync(`git worktree add "${wtPath}" ${ref}`, { cwd: ROOT, stdio: 'ignore' })
    } catch {
      // May already exist
    }
    // Symlink node_modules from the main worktree to avoid full install
    const nodeModules = resolve(ROOT, 'node_modules')
    const targetNm = resolve(wtPath, 'node_modules')
    if (!existsSync(targetNm) && existsSync(nodeModules)) {
      try {
        execSync(`cmd /c mklink /D "${targetNm.replace(/\//g, '\\')}" "${nodeModules.replace(/\//g, '\\')}"`, { stdio: 'ignore' })
      } catch {
        // Junction may fail; try copy
        try { execSync(`xcopy "${nodeModules}" "${targetNm}" /E /I /Q /Y`, { stdio: 'ignore' }) } catch {}
      }
    }
    // Run lint
    const output = execSync('npm run lint 2>&1 | tail -3', {
      cwd: wtPath,
      encoding: 'utf-8',
      shell: true,
    })
    // Parse "✖ N problems (M errors, K warnings)"
    const errMatch = output.match(/\((\d+)\s+errors?,\s+(\d+)\s+warnings?\)/)
    if (!errMatch) {
      throw new Error(`Failed to parse lint output: ${output}`)
    }
    return { errors: parseInt(errMatch[1], 10), warnings: parseInt(errMatch[2], 10) }
  } finally {
    // Cleanup worktree
    try {
      execSync(`git worktree remove --force "${wtPath}"`, { cwd: ROOT, stdio: 'ignore' })
    } catch {}
  }
}

function getCurrentLint(): LintResult {
  const output = execSync('npm run lint 2>&1 | tail -3', {
    cwd: ROOT,
    encoding: 'utf-8',
    shell: true,
  })
  const errMatch = output.match(/\((\d+)\s+errors?,\s+(\d+)\s+warnings?\)/)
  if (!errMatch) {
    throw new Error(`Failed to parse lint output: ${output}`)
  }
  return { errors: parseInt(errMatch[1], 10), warnings: parseInt(errMatch[2], 10) }
}

function main() {
  console.log('🧪 K25-D2 Lint Baseline Reconciliation\n')
  console.log('Comparing current master vs K25-C1 baseline (commit a0ecd7b)\n')

  console.log('Step 1: Lint at K25-C1 baseline (a0ecd7b)...')
  const k25c1 = runLintAtRef(K25C1_COMMIT)
  console.log(`  K25-C1: ${k25c1.errors} errors, ${k25c1.warnings} warnings`)

  console.log('\nStep 2: Lint at current master...')
  const current = getCurrentLint()
  console.log(`  Current: ${current.errors} errors, ${current.warnings} warnings`)

  const errorDelta = current.errors - k25c1.errors
  const warningDelta = current.warnings - k25c1.warnings

  console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━')
  console.log('Delta vs K25-C1 baseline')
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━')
  console.log(`  errors:   ${errorDelta >= 0 ? '+' : ''}${errorDelta}`)
  console.log(`  warnings: ${warningDelta >= 0 ? '+' : ''}${warningDelta}`)

  const blocking = errorDelta > 0 || warningDelta > 0
  if (blocking) {
    console.log('\n❌ K25-D2 LINT BASELINE AUDIT FAIL')
    console.log(`  Current is worse than K25-C1 by ${errorDelta} errors and ${warningDelta} warnings.`)
    process.exit(1)
  } else {
    console.log('\n✅ K25-D2 LINT BASELINE AUDIT PASS')
    console.log(`  0 new errors vs K25-C1 baseline.`)
    console.log(`  0 new warnings vs K25-C1 baseline.`)
    process.exit(0)
  }
}

main()
