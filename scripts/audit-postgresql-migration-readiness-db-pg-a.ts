import { execFileSync } from 'node:child_process'
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs'
import { join, relative } from 'node:path'

type Severity = 'blocking' | 'warning' | 'pass' | 'info'

type Finding = {
  id: string
  severity: Severity
  title: string
  evidence: unknown
  recommendation: string
}

type SqliteStatement = {
  all: (...args: readonly unknown[]) => unknown[]
  get: (...args: readonly unknown[]) => unknown
}

type SqliteDatabase = {
  prepare: (sql: string) => SqliteStatement
  close: () => void
}

type DatabaseSyncConstructor = new (
  filename: string,
  options?: { readOnly?: boolean },
) => SqliteDatabase

const ROOT = process.cwd()
const SCHEMA_PATH = join(ROOT, 'prisma', 'schema.prisma')
const MIGRATIONS_DIR = join(ROOT, 'prisma', 'migrations')
const MIGRATION_LOCK_PATH = join(MIGRATIONS_DIR, 'migration_lock.toml')
const SQLITE_DB_PATH = join(ROOT, 'prisma', 'dev.db')
const AUDIT_SCRIPT_PATH = join(ROOT, 'scripts', 'audit-postgresql-migration-readiness-db-pg-a.ts')

const SQLITE_SQL_PATTERNS = [
  /\bAUTOINCREMENT\b/i,
  /\bPRAGMA\b/i,
  /\bDATETIME\b/i,
  /\bCURRENT_TIMESTAMP\b/i,
  /\bDROP TABLE\b/i,
  /\bRENAME TO\b/i,
]

const L7_SQLITE_TERMS = [
  'prisma/dev.db',
  "join(ROOT, 'prisma', 'dev.db')",
  'dev.db.backup',
  'copyFileSync',
  'node:sqlite',
  'prisma/migrations',
]

function readText(path: string): string {
  return existsSync(path) ? readFileSync(path, 'utf8') : ''
}

function gitBranch(): string {
  try {
    return execFileSync('git', ['branch', '--show-current'], {
      cwd: ROOT,
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore'],
    }).trim()
  } catch {
    return 'UNKNOWN'
  }
}

function listMigrationSqlFiles(): string[] {
  if (!existsSync(MIGRATIONS_DIR)) return []

  return readdirSync(MIGRATIONS_DIR, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => join(MIGRATIONS_DIR, entry.name, 'migration.sql'))
    .filter((path) => existsSync(path))
}

function scanSqliteMigrationSql(): Array<{ file: string; matches: string[] }> {
  return listMigrationSqlFiles()
    .map((file) => {
      const text = readText(file)
      const matches = SQLITE_SQL_PATTERNS
        .filter((pattern) => pattern.test(text))
        .map((pattern) => pattern.source.replace(/\\b/g, ''))

      return {
        file: relative(ROOT, file).replace(/\\/g, '/'),
        matches,
      }
    })
    .filter((entry) => entry.matches.length > 0)
}

function walkFiles(start: string): string[] {
  if (!existsSync(start)) return []

  const entries = readdirSync(start, { withFileTypes: true })
  const files: string[] = []

  for (const entry of entries) {
    const path = join(start, entry.name)
    if (entry.isDirectory()) {
      if (['.git', '.next', 'node_modules'].includes(entry.name)) continue
      files.push(...walkFiles(path))
      continue
    }

    if (entry.isFile() && /\.(ts|tsx|js|mjs|cjs)$/.test(entry.name)) {
      files.push(path)
    }
  }

  return files
}

function scanL7SqliteAssumptions(): Array<{ file: string; terms: string[] }> {
  const candidates = [...walkFiles(join(ROOT, 'scripts')), ...walkFiles(join(ROOT, 'src', 'lib', 'import'))].filter(
    (file) => file !== AUDIT_SCRIPT_PATH,
  )

  return candidates
    .map((file) => {
      const normalized = relative(ROOT, file).replace(/\\/g, '/')
      const text = readText(file)
      const appearsL7 =
        /(^|[-_/])l7([-_/]|$)/i.test(normalized) ||
        /\bL7\b/i.test(text) ||
        /xlsx|course-setting|master-data/i.test(normalized)
      const terms = L7_SQLITE_TERMS.filter((term) => text.includes(term))

      return {
        file: normalized,
        terms: appearsL7 ? terms : [],
      }
    })
    .filter((entry) => entry.terms.length > 0)
}

function countSummary(findings: Finding[]): Record<Severity, number> {
  return findings.reduce<Record<Severity, number>>(
    (summary, finding) => {
      summary[finding.severity] += 1
      return summary
    },
    { blocking: 0, warning: 0, pass: 0, info: 0 },
  )
}

function quoteSqliteIdentifier(identifier: string): string {
  return `"${identifier.replace(/"/g, '""')}"`
}

function readCount(row: unknown): number | string {
  if (!row || typeof row !== 'object' || !('count' in row)) return 'UNKNOWN'
  const count = (row as { count: unknown }).count
  if (typeof count === 'number') return count
  if (typeof count === 'bigint') return Number(count)
  if (typeof count === 'string') return Number.parseInt(count, 10)
  return 'UNKNOWN'
}

async function inspectSqliteDb(): Promise<{
  exists: boolean
  bytes?: number
  tableCount?: number
  rowCounts?: Record<string, number | string>
  error?: string
}> {
  if (!existsSync(SQLITE_DB_PATH)) return { exists: false }

  const bytes = statSync(SQLITE_DB_PATH).size

  try {
    const sqlite = (await import('node:sqlite')) as unknown as {
      DatabaseSync: DatabaseSyncConstructor
    }
    const db = new sqlite.DatabaseSync(SQLITE_DB_PATH, { readOnly: true })

    try {
      const tableRows = db
        .prepare(
          "SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%' ORDER BY name",
        )
        .all() as Array<{ name: string }>
      const rowCounts: Record<string, number | string> = {}

      for (const table of tableRows) {
        const row = db.prepare(`SELECT COUNT(*) AS count FROM ${quoteSqliteIdentifier(table.name)}`).get()
        rowCounts[table.name] = readCount(row)
      }

      return {
        exists: true,
        bytes,
        tableCount: tableRows.length,
        rowCounts,
      }
    } finally {
      db.close()
    }
  } catch (error) {
    return {
      exists: true,
      bytes,
      error: error instanceof Error ? error.message : String(error),
    }
  }
}

async function main() {
  const schema = readText(SCHEMA_PATH)
  const migrationLock = readText(MIGRATION_LOCK_PATH)
  const sqliteMigrationSql = scanSqliteMigrationSql()
  const l7SqliteAssumptions = scanL7SqliteAssumptions()
  const sqliteDb = await inspectSqliteDb()

  const findings: Finding[] = [
    {
      id: 'SQLITE_PROVIDER_CURRENT',
      severity: schema.includes('provider = "sqlite"') ? 'info' : 'warning',
      title: 'Current Prisma datasource provider is SQLite',
      evidence: {
        schema: relative(ROOT, SCHEMA_PATH).replace(/\\/g, '/'),
        migrationLock: relative(ROOT, MIGRATION_LOCK_PATH).replace(/\\/g, '/'),
        providerInSchema: schema.includes('provider = "sqlite"') ? 'sqlite' : 'not-sqlite-or-not-found',
        providerInMigrationLock: migrationLock.includes('provider = "sqlite"')
          ? 'sqlite'
          : 'not-sqlite-or-not-found',
      },
      recommendation:
        'Do not switch provider in DB-PG-A. Plan a later DB-PG-B cutover with a dedicated PostgreSQL schema baseline.',
    },
    {
      id: 'SQLITE_MIGRATION_SQL',
      severity: sqliteMigrationSql.length > 0 ? 'blocking' : 'pass',
      title: 'Existing Prisma migration SQL contains SQLite-specific statements',
      evidence: {
        migrationCount: listMigrationSqlFiles().length,
        affectedFiles: sqliteMigrationSql,
      },
      recommendation:
        'Do not replay the current SQLite migration history against PostgreSQL. Generate and review a PostgreSQL baseline later.',
    },
    {
      id: 'L7_SQLITE_BACKUP_ASSUMPTIONS',
      severity: l7SqliteAssumptions.length > 0 ? 'warning' : 'pass',
      title: 'L7 Excel import path still assumes SQLite file backup and migration layout',
      evidence: {
        affectedFiles: l7SqliteAssumptions,
      },
      recommendation:
        'Keep L7 Excel import SQLite-based for DB-PG-A. Rework backup/rollback semantics before any PostgreSQL write-path migration.',
    },
    {
      id: 'SQLITE_SOURCE_DB_READONLY',
      severity: sqliteDb.exists ? 'info' : 'warning',
      title: 'Current SQLite source database inventory was inspected read-only',
      evidence: sqliteDb,
      recommendation:
        'Use this inventory only for planning. Do not write to dev.db during DB-PG-A.',
    },
    {
      id: 'DB_PG_A_SCOPE_GUARD',
      severity: 'pass',
      title: 'DB-PG-A scope remains audit/plan only',
      evidence: {
        forbiddenActions: [
          'no provider switch',
          'no PostgreSQL migration generation',
          'no package script integration',
          'no database write',
          'no L7 import script edits',
        ],
      },
      recommendation:
        'Start real PostgreSQL migration later as DB-PG-B or equivalent after L7 write path is closed or frozen.',
    },
  ]

  const result = {
    auditId: 'DB-PG-A-POSTGRESQL-MIGRATION-AUDIT-AND-PLAN',
    generatedAt: new Date().toISOString(),
    branch: gitBranch(),
    summary: countSummary(findings),
    findings,
  }

  console.log(JSON.stringify(result, null, 2))

  if (findings.some((finding) => finding.severity === 'blocking')) {
    process.exitCode = 2
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error)
  process.exitCode = 1
})
