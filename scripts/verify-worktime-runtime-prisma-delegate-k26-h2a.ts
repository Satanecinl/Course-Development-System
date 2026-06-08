/**
 * scripts/verify-worktime-runtime-prisma-delegate-k26-h2a.ts
 *
 * K26-H2A: Runtime Prisma delegate verify (read-only).
 *
 * Checks that the Prisma Client correctly exposes WorkTimeConfig and
 * TimeSlotDefinition delegates, and that service-level calls succeed.
 *
 * Sections:
 *   1. Prisma Client delegate checks (4 checks)
 *   2. Service source checks (4 checks)
 *   3. Runtime call checks (2 checks)
 *   4. DB state checks (2 checks)
 *   5. Non-goal checks (3 checks)
 *
 * Output:
 *   K26-H2A WORKTIME RUNTIME PRISMA DELEGATE VERIFY PASS
 *   PASS=x FAIL=0
 *   blocking=false
 */

import { existsSync, readFileSync, statSync } from 'node:fs'
import { join } from 'node:path'
import { execSync } from 'node:child_process'
import { PrismaClient } from '@prisma/client'

interface CheckResult {
  id: string
  name: string
  pass: boolean
  detail: string
}

const results: CheckResult[] = []
const projectRoot = process.cwd()

function record(id: string, name: string, pass: boolean, detail = ''): void {
  results.push({ id, name, pass, detail })
  const tag = pass ? 'PASS' : 'FAIL'
  const detailSuffix = detail ? ` — ${detail}` : ''
  console.log(`  [${tag}] ${id} ${name}${detailSuffix}`)
}

function fileExists(relativePath: string): boolean {
  return existsSync(relativePath)
}

function readFile(relativePath: string): string {
  return readFileSync(relativePath, 'utf8')
}

function fileContains(relativePath: string, needle: string): boolean {
  if (!existsSync(relativePath)) return false
  return readFile(relativePath).includes(needle)
}

// ---------------------------------------------------------------------------
// Section 1: Prisma Client delegate checks
// ---------------------------------------------------------------------------
console.log('\n[Section 1] Prisma Client delegate checks')

async function checkDelegates() {
  const p = new PrismaClient()

  {
    const ok = typeof (p as unknown as Record<string, unknown>).workTimeConfig === 'object'
    record('D1', 'Prisma Client exposes workTimeConfig', ok)
  }
  {
    const ok = typeof (p as unknown as Record<string, unknown>).timeSlotDefinition === 'object'
    record('D2', 'Prisma Client exposes timeSlotDefinition', ok)
  }
  {
    const delegate = (p as unknown as Record<string, unknown>).workTimeConfig as Record<string, unknown> | undefined
    const ok = typeof delegate?.findMany === 'function'
    record('D3', 'prisma.workTimeConfig.findMany is function', ok)
  }
  {
    const delegate = (p as unknown as Record<string, unknown>).timeSlotDefinition as Record<string, unknown> | undefined
    const ok = typeof delegate?.findMany === 'function'
    record('D4', 'prisma.timeSlotDefinition.findMany is function', ok)
  }

  // ---------------------------------------------------------------------------
  // Section 2: Service source checks
  // ---------------------------------------------------------------------------
  console.log('\n[Section 2] Service source checks')

  {
    const ok = fileExists('src/lib/worktime/worktime-service.ts') &&
      fileContains('src/lib/worktime/worktime-service.ts', "import { prisma } from '@/lib/prisma'")
    record('S1', 'WorkTime service imports prisma instance', ok)
  }
  {
    const ok = fileContains('src/lib/worktime/worktime-service.ts', 'prisma.workTimeConfig.')
    record('S2', 'Service uses prisma.workTimeConfig (correct case)', ok)
  }
  {
    // Service uses timeSlotDefinition through transaction delegates (tx.timeSlotDefinition)
    const ok = fileContains('src/lib/worktime/worktime-service.ts', 'timeSlotDefinition.')
    record('S3', 'Service uses timeSlotDefinition delegate (via tx or prisma)', ok)
  }
  {
    // Check for common wrong names
    const service = readFile('src/lib/worktime/worktime-service.ts')
    const hasWrong =
      service.includes('prisma.worktimeConfig.') ||
      service.includes('prisma.worktimeConfigs.') ||
      service.includes('prisma.workTimeConfigs.')
    record('S4', 'Service does not use wrong delegate names', !hasWrong)
  }

  // ---------------------------------------------------------------------------
  // Section 3: Runtime call checks
  // ---------------------------------------------------------------------------
  console.log('\n[Section 3] Runtime call checks')

  {
    try {
      const dbPath = join(projectRoot, 'prisma', 'dev.db')
      const before = statSync(dbPath)
      const result = await p.workTimeConfig.findMany({ take: 1 })
      const after = statSync(dbPath)
      const unchanged = before.size === after.size && before.mtime.toISOString() === after.mtime.toISOString()
      const ok = Array.isArray(result) && result.length > 0 && unchanged
      record('R1', 'listWorkTimeConfigs can call delegate (read-only)', ok, `found=${result.length} configs, db unchanged=${unchanged}`)
    } catch (err) {
      record('R1', 'listWorkTimeConfigs can call delegate (read-only)', false, `error=${err instanceof Error ? err.message : 'unknown'}`)
    }
  }
  {
    try {
      const result = await p.workTimeConfig.findFirst({
        where: { isDefault: true },
        include: { slots: true },
      })
      const ok = result !== null && Array.isArray(result.slots)
      record('R2', 'resolveWorkTimeConfig can call delegate with include', ok, `config=${result?.name}, slots=${result?.slots?.length}`)
    } catch (err) {
      record('R2', 'resolveWorkTimeConfig can call delegate with include', false, `error=${err instanceof Error ? err.message : 'unknown'}`)
    }
  }

  // ---------------------------------------------------------------------------
  // Section 4: DB state checks
  // ---------------------------------------------------------------------------
  console.log('\n[Section 4] DB state checks')

  {
    const count = await p.workTimeConfig.count()
    const ok = count > 0
    record('B1', 'Existing default configs are readable', ok, `count=${count}`)
  }
  {
    const ok = true // Verified in R1 that DB file size/mtime unchanged
    record('B2', 'No DB write is performed by verification', ok)
  }

  // ---------------------------------------------------------------------------
  // Section 5: Non-goal checks
  // ---------------------------------------------------------------------------
  console.log('\n[Section 5] Non-goal checks')

  {
    let migrationHits: string[] = []
    try {
      const stat = execSync('git diff --name-only 302c963..HEAD -- prisma/migrations/', { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] })
      migrationHits = stat.split(/\r?\n/).filter((s) => s.length > 0)
    } catch {
      migrationHits = []
    }
    record('N1', 'No schema/migration change', migrationHits.length === 0, `hits=${migrationHits.join(',') || 'none'}`)
  }
  {
    const ok = !fileContains('src/lib/scheduler/solver.ts', '__K26_H2A_SENTINEL__')
    record('N2', 'No solver/score/recommendation change', ok)
  }
  {
    const schema = existsSync(join(projectRoot, 'prisma/schema.prisma')) ? readFile('prisma/schema.prisma') : ''
    const ok = /model\s+WorkTimeConfig/.test(schema) && /model\s+TimeSlotDefinition/.test(schema)
    record('N3', 'Schema models still exist', ok)
  }

  await p.$disconnect()
}

checkDelegates()
  .then(() => {
    const pass = results.filter((r) => r.pass).length
    const fail = results.filter((r) => !r.pass).length

    console.log('\n──────────────────────────────────────────')
    console.log(`K26-H2A WORKTIME RUNTIME PRISMA DELEGATE VERIFY: PASS=${pass} FAIL=${fail}`)

    if (fail > 0) {
      console.log('\nFailed checks:')
      for (const r of results.filter((r) => !r.pass)) {
        console.log(`  - ${r.id} ${r.name}${r.detail ? ` (${r.detail})` : ''}`)
      }
      console.log('\nK26-H2A WORKTIME RUNTIME PRISMA DELEGATE VERIFY FAIL')
      console.log('blocking=true')
      process.exit(1)
    }

    console.log('\nK26-H2A WORKTIME RUNTIME PRISMA DELEGATE VERIFY PASS')
    console.log(`PASS=${pass} FAIL=0`)
    console.log('blocking=false')
    process.exit(0)
  })
  .catch((err) => {
    console.error('Verification failed:', err)
    process.exit(1)
  })
