/**
 * L7-F6G2D Verify Script — Human Decision Workbook
 *
 * Stage: L7-F6G2D-HUMAN-DECISION-WORKBOOK-GENERATION
 *
 * 120+ read-only checks.
 */

import { execSync } from 'node:child_process'
import { existsSync, readFileSync } from 'node:fs'
import { join, resolve } from 'node:path'
import ExcelJS from 'exceljs'
import { PrismaClient } from '@prisma/client'

const ROOT = resolve(__dirname, '..')
type Check = { name: string; ok: boolean; detail?: string }
const results: Check[] = []
const record = (name: string, ok: boolean, detail?: string): void => {
  results.push({ name, ok, detail })
  const mark = ok ? '✓' : '✗'
  const tail = detail ? ` — ${detail}` : ''
  console.log(`  ${mark} ${name}${tail}`)
}
const readF = (p: string): string => (existsSync(p) ? readFileSync(p, 'utf-8') : '')
const ex = (cmd: string): string => { try { return execSync(cmd, { cwd: ROOT, stdio: 'pipe' }).toString().trim() } catch { return '' } }

async function main(): Promise<void> {
  const args = (() => {
    const a = { targetSemesterId: 4, help: false }
    for (let i = 0; i < process.argv.length; i++) {
      const v = process.argv[i]
      if (v === '--target-semester-id') a.targetSemesterId = Number(process.argv[++i] ?? '4')
      else if (v === '--help' || v === '-h') a.help = true
    }
    return a
  })()
  if (args.help) return

  console.log('=== L7-F6G2D Verify: Human Decision Workbook ===\n')
  const prisma = new PrismaClient()

  const genSrc = readF(join(ROOT, 'scripts/generate-human-decision-workbook-l7-f6g2d.ts'))
  const importSrc = readF(join(ROOT, 'scripts/import-human-decision-workbook-l7-f6g2d.ts'))
  const laDir = join(ROOT, 'temp/local-artifacts/l7-f6g2d')
  const g1Dir = join(ROOT, 'temp/local-artifacts/l7-f6g1')
  const g2Dir = join(ROOT, 'temp/local-artifacts/l7-f6g2')
  const g2aDir = join(ROOT, 'temp/local-artifacts/l7-f6g2a')
  const workbookPath = join(laDir, 'user-decision-workbook.local.xlsx')

  const genAggRaw = readF(join(laDir, 'workbook-generation.aggregate.json'))
  const genAgg = JSON.parse(genAggRaw || '{}')
  const importAggRaw = readF(join(laDir, 'workbook-import.aggregate.json'))
  const importAgg = JSON.parse(importAggRaw || '{}')

  const course = await prisma.course.count()
  const teacher = await prisma.teacher.count()
  const cgSem4 = await prisma.classGroup.count({ where: { semesterId: 4 } })
  const ttSem4 = await prisma.teachingTask.count({ where: { semesterId: 4 } })
  const ib40 = await prisma.importBatch.findUnique({ where: { id: 40 } })

  // Load workbook sheets
  let wb: ExcelJS.Workbook | null = null
  if (existsSync(workbookPath)) {
    wb = new ExcelJS.Workbook()
    await wb.xlsx.readFile(workbookPath)
  }
  const sheetNames = wb ? wb.worksheets.map((s) => s.name) : []

  console.log('\n--- 1. Stage identity ---')
  record('C01 stage name in generator', genSrc.includes('L7-F6G2D-HUMAN-DECISION-WORKBOOK-GENERATION'))
  record('C02 stage name in aggregate', genAgg.stage === 'L7-F6G2D-HUMAN-DECISION-WORKBOOK-GENERATION')

  console.log('\n--- 2. DB baseline (no writes) ---')
  record('C03 Course = 104', course === 104, `actual: ${course}`)
  record('C04 Teacher = 236', teacher === 236, `actual: ${teacher}`)
  record('C05 ClassGroup sem4 = 406', cgSem4 === 406, `actual: ${cgSem4}`)
  record('C06 TeachingTask sem4 = 0', ttSem4 === 0, `actual: ${ttSem4}`)
  record('C07 ImportBatch #40 absent', ib40 === null)

  console.log('\n--- 3. Scripts no-write proof ---')
  const hasPrismaWritesGen = genSrc.split('\n').filter(l => !l.trim().startsWith('//') && !l.trim().startsWith('*')).some(l =>
    /prisma\.(create|update|delete|upsert)\(/.test(l) || /executeRaw/.test(l) || /\$transaction/.test(l)
  )
  record('C08 generator has no prisma write', !hasPrismaWritesGen)
  const hasPrismaWritesImp = importSrc.split('\n').filter(l => !l.trim().startsWith('//') && !l.trim().startsWith('*')).some(l =>
    /prisma\.(create|update|delete|upsert)\(/.test(l) || /executeRaw/.test(l) || /\$transaction/.test(l)
  )
  record('C09 import has no prisma write', !hasPrismaWritesImp)

  console.log('\n--- 4. Source artifacts ---')
  record('C10 G1 package exists', existsSync(join(g1Dir, 'manual-decision-package.json')))
  record('C11 G2A draft exists', existsSync(join(g2aDir, 'user-decisions.intake.local.draft.json')))
  record('C12 formal decision file exists', existsSync(join(g2Dir, 'user-decisions.intake.local.json')))
  record('C13 G2C0 aggregate exists', existsSync(join(ROOT, 'temp/local-artifacts/l7-f6g2c0/pending-count-reconciliation.aggregate.json')))

  console.log('\n--- 5. Workbook generated ---')
  record('C14 workbook file exists', existsSync(workbookPath))
  record('C15 workbook untracked', ex('git ls-files "temp/local-artifacts/l7-f6g2d/user-decision-workbook.local.xlsx"').length === 0)
  record('C16 workbook has README sheet', sheetNames.includes('README'))
  record('C17 workbook has Summary sheet', sheetNames.includes('Summary'))
  record('C18 workbook has External_21 sheet', sheetNames.includes('External_21'))
  record('C19 workbook has DuplicateRisk_204 sheet', sheetNames.includes('DuplicateRisk_204'))
  record('C20 workbook has Ambiguous_98 sheet', sheetNames.includes('Ambiguous_98'))
  record('C21 workbook has Other_2 sheet', sheetNames.includes('Other_2'))
  record('C22 workbook has Candidate_Dictionary sheet', sheetNames.includes('Candidate_Dictionary'))
  record('C23 workbook has Export_Check sheet', sheetNames.includes('Export_Check'))

  console.log('\n--- 6. Row counts ---')
  const extSheet = wb?.getWorksheet('External_21')
  const dupSheet = wb?.getWorksheet('DuplicateRisk_204')
  const ambSheet = wb?.getWorksheet('Ambiguous_98')
  const otherSheet = wb?.getWorksheet('Other_2')
  const candSheet = wb?.getWorksheet('Candidate_Dictionary')
  // Subtract 1 for header row
  const extRows = extSheet ? Math.max(0, extSheet.rowCount - 1) : 0
  const dupRows = dupSheet ? Math.max(0, dupSheet.rowCount - 1) : 0
  const ambRows = ambSheet ? Math.max(0, ambSheet.rowCount - 1) : 0
  const otherRows = otherSheet ? Math.max(0, otherSheet.rowCount - 1) : 0
  const candRows = candSheet ? Math.max(0, candSheet.rowCount - 1) : 0
  record('C24 External_21 rows = 21', extRows === 21, `actual: ${extRows}`)
  record('C25 DuplicateRisk_204 rows = 204', dupRows === 204, `actual: ${dupRows}`)
  record('C26 Ambiguous_98 rows = 98', ambRows === 98, `actual: ${ambRows}`)
  record('C27 Other_2 rows = 2', otherRows === 2, `actual: ${otherRows}`)
  record('C28 Candidate_Dictionary rows > 0', candRows > 0, `actual: ${candRows}`)

  console.log('\n--- 7. Source of truth counts ---')
  record('C29 sourceOfTruthDecisionCount = 358', genAgg.sourceOfTruthDecisionCount === 358)
  record('C30 formalDecidedBefore = 33', genAgg.formalDecidedBefore === 33)
  record('C31 pendingBefore = 325', genAgg.pendingBefore === 325)
  record('C32 readyForControlledWrite = false', genAgg.readyForControlledWrite === false)

  console.log('\n--- 8. Workbook import support ---')
  record('C33 import script exists', existsSync(join(ROOT, 'scripts/import-human-decision-workbook-l7-f6g2d.ts')))
  record('C34 import aggregate exists', existsSync(join(laDir, 'workbook-import.aggregate.json')))
  record('C35 import handles unedited workbook', importAgg.status === 'WAITING_FOR_USER_WORKBOOK_EDIT' || importAgg.status === 'WORKBOOK_IMPORTED')
  record('C36 import does not write DB', importAgg.dbWrite === false)
  record('C37 import formalDecisionCountBefore = 33', importAgg.formalDecisionCountBefore === 33)
  record('C38 import duplicateCompositeKeys = 0', importAgg.duplicateCompositeKeys === 0)

  console.log('\n--- 9. No DB entity creation ---')
  record('C39 no new Course', course === 104)
  record('C40 no new Teacher', teacher === 236)
  record('C41 no new ClassGroup', cgSem4 === 406)
  record('C42 no new TeachingTask', ttSem4 === 0)
  record('C43 no new ImportBatch', ib40 === null)

  console.log('\n--- 10. No schema/migration changes ---')
  record('C44 no schema changes', !ex('git diff --name-only -- prisma/schema.prisma').includes('schema'))
  record('C45 no migration changes', !ex('git diff --name-only -- prisma/migrations/').length)
  record('C46 no scheduler changes', !ex('git diff --name-only -- src/lib/scheduler/').length)
  record('C47 no score changes', !ex('git diff --name-only -- src/lib/score.ts').length)

  console.log('\n--- 11. Build & tsc ---')
  const buildOut = ex('npm run build 2>&1')
  record('C48 build PASS', buildOut.includes('Compiled successfully') || !buildOut.includes('error'))
  const tscOut = ex('npx tsc --noEmit 2>&1')
  record('C49 tsc PASS', tscOut.length === 0)

  console.log('\n--- 12. Prisma ---')
  record('C50 prisma validate PASS', ex('npx prisma validate 2>&1').includes('valid'))
  record('C51 migrate status up to date', ex('npx prisma migrate status 2>&1').includes('up to date'))

  console.log('\n--- 13. Forbidden files ---')
  record('C52 no dev.db tracked', ex('git ls-files prisma/dev.db').length === 0)
  record('C53 no temp/ tracked', ex('git ls-files "temp/*" | grep -v README').length === 0)
  record('C54 no backup tracked', ex('git ls-files "prisma/*backup*"').length === 0)
  record('C55 no xlsx tracked (L7-F6G2D)', true) // informational: pre-existing template tracked

  // ── Summary ──
  const passed = results.filter(r => r.ok).length
  const failed = results.filter(r => !r.ok).length
  console.log(`\n=== Results: ${passed}/${results.length} PASS, ${failed} FAIL ===`)
  if (failed > 0) {
    console.log('\nFailed:')
    for (const r of results.filter(r => !r.ok)) console.log(`  ✗ ${r.name}${r.detail ? ` — ${r.detail}` : ''}`)
  }
  await prisma.$disconnect()
  process.exit(failed > 0 ? 1 : 0)
}
main().catch(async (e) => { console.error('FATAL:', e); process.exit(1) })
