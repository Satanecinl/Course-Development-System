/**
 * K20-FIX-B Source Evidence Schema Verification
 *
 * Read-only verification that:
 *   - prisma/schema.prisma TeachingTaskClass has all 8 new nullable source evidence fields
 *   - DB table TeachingTaskClass has the same 8 columns
 *   - All 8 fields are nullable
 *   - Migration was non-destructive (historical row count preserved)
 *   - Historical rows have source evidence = null (no backfill)
 *
 * Exits 0 on PASS, 1 on any FAIL.
 */

import { PrismaClient } from '@prisma/client'
import * as fs from 'node:fs'
import * as path from 'node:path'

const prisma = new PrismaClient()
const projectRoot = path.resolve(__dirname, '..')

const EXPECTED_FIELDS = [
  'importBatchId',
  'sourceRowIndex',
  'sourceKeyword',
  'sourceClassName',
  'sourceRemark',
  'sourceArtifactFilename',
  'matchStrategy',
  'matchConfidence',
] as const

const EXPECTED_HISTORICAL_TTC_COUNT = 446

let passCount = 0
let failCount = 0
const failures: string[] = []

function check(label: string, ok: boolean, detail?: string) {
  if (ok) {
    passCount++
    console.log(`  PASS: ${label}${detail ? ` — ${detail}` : ''}`)
  } else {
    failCount++
    failures.push(`${label}${detail ? ` — ${detail}` : ''}`)
    console.log(`  FAIL: ${label}${detail ? ` — ${detail}` : ''}`)
  }
}

async function main() {
  console.log('K20-FIX-B Source Evidence Schema Verification')
  console.log('='.repeat(60))

  // 1. schema.prisma contains the 8 fields (in TeachingTaskClass model)
  const schemaText = fs.readFileSync(path.join(projectRoot, 'prisma/schema.prisma'), 'utf8')
  const ttcMatch = schemaText.match(/model TeachingTaskClass \{[\s\S]*?\n\}/)
  const ttcModel = ttcMatch?.[0] ?? ''
  console.log('\n[1] prisma/schema.prisma TeachingTaskClass fields:')
  for (const f of EXPECTED_FIELDS) {
    // Match: fieldName + whitespace + Type + ? (nullable) + ... + (no @default)
    const re = new RegExp(`^\\s*${f}\\s+(\\w+)(\\?)?(\\s+@default\\([^)]*\\))?`, 'm')
    const m = ttcModel.match(re)
    const hasField = !!m
    const isNullable = hasField && m![2] === '?'
    const hasDefault = hasField && !!m![3]
    check(`schema has ${f} (nullable, no default)`, hasField && isNullable && !hasDefault,
      `present=${hasField} nullable=${isNullable} default=${hasDefault}`)
  }

  // 2. Migration file exists
  console.log('\n[2] Migration file:')
  const migrationsDir = path.join(projectRoot, 'prisma/migrations')
  const migrationDirs = fs.readdirSync(migrationsDir).filter((d) => d.includes('source_evidence'))
  check('migration directory exists', migrationDirs.length > 0, `dirs=${migrationDirs.join(', ')}`)
  if (migrationDirs.length > 0) {
    const sqlPath = path.join(migrationsDir, migrationDirs[0], 'migration.sql')
    const sql = fs.readFileSync(sqlPath, 'utf8')
    const alterCount = (sql.match(/ALTER TABLE "TeachingTaskClass" ADD COLUMN/g) ?? []).length
    check('migration has 8 ALTER TABLE ... ADD COLUMN', alterCount === 8, `alterCount=${alterCount}`)
    // No DROP / RENAME
    const hasDestructive = /DROP|RENAME/i.test(sql)
    check('migration is non-destructive (no DROP/RENAME)', !hasDestructive, `hasDestructive=${hasDestructive}`)
  }

  // 3. DB table columns
  console.log('\n[3] DB table TeachingTaskClass columns:')
  // Use PRAGMA table_info since SQLite
  const columns = await prisma.$queryRawUnsafe<Array<{ name: string; notnull: number | bigint; dflt_value: string | null }>>(
    `PRAGMA table_info("TeachingTaskClass")`,
  )
  const colMap = new Map(columns.map((c) => [c.name, c]))
  for (const f of EXPECTED_FIELDS) {
    const col = colMap.get(f)
    check(`DB has column ${f}`, !!col, `name=${col?.name ?? 'MISSING'}`)
    if (col) {
      const nn = Number(col.notnull)
      check(`DB column ${f} is nullable (notnull=0)`, nn === 0, `notnull=${col.notnull} (numeric=${nn})`)
    }
  }

  // 4. Historical row count + null evidence
  console.log('\n[4] Historical row preservation:')
  const totalTTC = await prisma.teachingTaskClass.count()
  check(`total TeachingTaskClass count = ${EXPECTED_HISTORICAL_TTC_COUNT}`, totalTTC === EXPECTED_HISTORICAL_TTC_COUNT,
    `actual=${totalTTC}`)

  // Each of the 8 fields should be null for all historical rows
  for (const f of EXPECTED_FIELDS) {
    const nonNullCount = await prisma.teachingTaskClass.count({ where: { [f]: { not: null } } })
    check(`historical TTC has 0 non-null ${f} (no-backfill verified)`, nonNullCount === 0,
      `nonNullCount=${nonNullCount}`)
  }

  // 5. Unique constraint preserved
  console.log('\n[5] Unique constraint:')
  const indexInfo = await prisma.$queryRawUnsafe<Array<{ name: string; unique: number | bigint }>>(
    `PRAGMA index_list("TeachingTaskClass")`,
  )
  const hasUniq = indexInfo.some((i) => Number(i.unique) === 1)
  check('TeachingTaskClass has at least one unique index', hasUniq, `indexes=${indexInfo.map((i) => `${i.name}(unique=${i.unique})`).join(', ')}`)

  // Summary
  console.log('\n' + '='.repeat(60))
  console.log(`Summary: ${passCount} PASS / ${failCount} FAIL`)
  if (failCount > 0) {
    console.log('\nFailures:')
    for (const f of failures) console.log(`  - ${f}`)
  }
  await prisma.$disconnect()
  process.exit(failCount > 0 ? 1 : 0)
}

main().catch(async (err) => {
  console.error('Fatal error:', err)
  await prisma.$disconnect()
  process.exit(1)
})
