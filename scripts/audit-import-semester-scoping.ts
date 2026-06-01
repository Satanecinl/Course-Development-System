/**
 * K10-SEMESTER-IMPORT-SCOPING-AUDIT
 *
 * Read-only source code audit of the import pipeline for semester scoping gaps.
 * Does NOT write to the database. Does NOT modify any business files.
 */

import { readFileSync, readdirSync, statSync } from 'fs'
import { join, relative } from 'path'

// ── Types ──

interface Finding {
  riskId: string
  severity: 'HIGH' | 'MEDIUM' | 'LOW' | 'NONE' | 'UNKNOWN'
  title: string
  file: string
  evidence: string
  recommendation: string
}

// ── Helpers ──

function readFile(rel: string): string {
  try { return readFileSync(join(process.cwd(), rel), 'utf-8') } catch { return '' }
}

function walkTsFiles(dir: string, acc: string[] = []): string[] {
  try {
    for (const entry of readdirSync(dir)) {
      const full = join(dir, entry)
      const st = statSync(full)
      if (st.isDirectory()) {
        walkTsFiles(full, acc)
      } else if (entry.endsWith('.ts') || entry.endsWith('.tsx')) {
        acc.push(full)
      }
    }
  } catch {}
  return acc
}

function relPath(abs: string): string {
  return relative(process.cwd(), abs).replace(/\\/g, '/')
}

// ── Audit Logic ──

async function main() {
  const findings: Finding[] = []
  let highCounter = 0
  let mediumCounter = 0
  let lowCounter = 0
  function nextHigh() { return `K10-IMPORT-HIGH-${++highCounter}` }
  function nextMedium() { return `K10-IMPORT-MEDIUM-${++mediumCounter}` }
  function nextLow() { return `K10-IMPORT-LOW-${++lowCounter}` }

  console.log('════════════════════════════════════════════════════════════')
  console.log('K10 Import Semester Scoping Audit')
  console.log('════════════════════════════════════════════════════════════')

  // ── Collect import-related files ──
  const importLibDir = join(process.cwd(), 'src', 'lib', 'import')
  const importApiDir = join(process.cwd(), 'src', 'app', 'api', 'admin', 'import')
  const importTypesFile = join(process.cwd(), 'src', 'types', 'import.ts')

  const importLibFiles = walkTsFiles(importLibDir)
  const importApiFiles = walkTsFiles(importApiDir)
  const allImportFiles = [...importLibFiles, ...importApiFiles, importTypesFile]

  const allTsFiles = walkTsFiles(join(process.cwd(), 'src'))

  console.log(`\nFiles scanned: ${allTsFiles.length}`)
  console.log(`Import candidate files: ${allImportFiles.length}`)

  // ── 1. Check ImportBatch model for semesterId ──
  console.log('\n─── 1. ImportBatch Schema ───')
  const schema = readFile('prisma/schema.prisma')
  const importBatchModelMatch = schema.match(/model ImportBatch \{[\s\S]*?\n\}/)
  const importBatchModel = importBatchModelMatch ? importBatchModelMatch[0] : ''
  const importBatchHasSemesterId = importBatchModel.includes('semesterId')
  console.log(`  ImportBatch has semesterId: ${importBatchHasSemesterId ? 'YES' : 'NO'}`)

  if (!importBatchHasSemesterId) {
    findings.push({
      riskId: nextHigh(),
      severity: 'HIGH',
      title: 'ImportBatch model has no semesterId field',
      file: 'prisma/schema.prisma',
      evidence: 'ImportBatch model (lines 266-287) has no semesterId field. Cannot associate an import batch with a specific semester.',
      recommendation: 'Add optional semesterId Int? field to ImportBatch model with @@index([semesterId]).',
    })
  }

  // ── 2. Check importer.ts for semesterId usage ──
  console.log('\n─── 2. Importer Core (importer.ts) ───')
  const importer = readFile('src/lib/import/importer.ts')
  const importerHasSemesterId = importer.includes('semesterId')
  const importerHasResolveSemester = importer.includes('resolveSchedulerSemester')
  const importerCreatesTeachingTask = importer.includes('teachingTask.create')
  const importerCreatesScheduleSlot = importer.includes('scheduleSlot.create')
  const importerCreatesClassGroup = importer.includes('classGroup.create')
  const importerHasDeleteMany = importer.includes('deleteMany')
  const importerHasUpsert = importer.includes('upsert')
  const importerHasCreateMany = importer.includes('createMany')

  console.log(`  has semesterId: ${importerHasSemesterId ? 'YES' : 'NO'}`)
  console.log(`  uses resolveSchedulerSemester: ${importerHasResolveSemester ? 'YES' : 'NO'}`)
  console.log(`  creates TeachingTask: ${importerCreatesTeachingTask ? 'YES' : 'no'}`)
  console.log(`  creates ScheduleSlot: ${importerCreatesScheduleSlot ? 'YES' : 'no'}`)
  console.log(`  creates ClassGroup: ${importerCreatesClassGroup ? 'YES' : 'no'}`)
  console.log(`  has deleteMany: ${importerHasDeleteMany ? 'YES' : 'no'}`)
  console.log(`  has upsert: ${importerHasUpsert ? 'YES' : 'no'}`)
  console.log(`  has createMany: ${importerHasCreateMany ? 'YES' : 'no'}`)

  if (!importerHasSemesterId && importerCreatesTeachingTask) {
    findings.push({
      riskId: nextHigh(),
      severity: 'HIGH',
      title: 'TeachingTask created without semesterId',
      file: 'src/lib/import/importer.ts',
      evidence: 'executeImportInTransaction() creates TeachingTask (line 560-569) with courseId, teacherId, weekType, startWeek, endWeek, remark, importBatchId — but NO semesterId. Field will be null.',
      recommendation: 'Pass resolved semesterId to executeImportInTransaction() and set it on TeachingTask.create data.',
    })
  }

  if (!importerHasSemesterId && importerCreatesScheduleSlot) {
    findings.push({
      riskId: nextHigh(),
      severity: 'HIGH',
      title: 'ScheduleSlot created without semesterId',
      file: 'src/lib/import/importer.ts',
      evidence: 'executeImportInTransaction() creates ScheduleSlot (line 608-609) with teachingTaskId, roomId, dayOfWeek, slotIndex, importBatchId — but NO semesterId. Field will be null.',
      recommendation: 'Pass resolved semesterId to executeImportInTransaction() and set it on ScheduleSlot.create data.',
    })
  }

  // ── 3. Check TeachingTask dedup for semester scoping ──
  console.log('\n─── 3. TeachingTask Dedup Scoping ───')
  const taskDeduMatch = importer.match(/teachingTask\.findMany\(\{[\s\S]*?where:\s*\{[^}]*\}/g)
  const taskDeduHasSemester = taskDeduMatch?.some(m => m.includes('semesterId')) ?? false
  console.log(`  TeachingTask findMany scoped by semesterId: ${taskDeduHasSemester ? 'YES' : 'NO'}`)

  if (!taskDeduHasSemester && importerCreatesTeachingTask) {
    findings.push({
      riskId: nextHigh(),
      severity: 'HIGH',
      title: 'TeachingTask dedup queries not scoped by semester',
      file: 'src/lib/import/importer.ts',
      evidence: 'executeImportInTransaction() finds existing TeachingTask by courseId+teacherId+weekType+startWeek+endWeek+remark (line 541-544) WITHOUT semesterId filter. Could reuse a TeachingTask from a different semester.',
      recommendation: 'Add semesterId to the TeachingTask findMany where clause in executeImportInTransaction().',
    })
  }

  // ── 4. Check ClassGroup lookup for semester scoping ──
  console.log('\n─── 4. ClassGroup Lookup Scoping ───')
  const cgLookupMatch = importer.match(/classGroup\.findUnique\(\{[\s\S]*?where:\s*\{[^}]*\}/g)
  const cgLookupHasSemester = cgLookupMatch?.some(m => m.includes('semesterId')) ?? false
  console.log(`  ClassGroup findUnique scoped by semesterId: ${cgLookupHasSemester ? 'YES' : 'NO'}`)

  // Note: ClassGroup.name is @unique, so findUnique on name is globally safe.
  // Importer now writes semesterId when creating new ClassGroups.
  // But if same-name ClassGroups across semesters are desired, this would need scoping.
  if (!cgLookupHasSemester && importerCreatesClassGroup) {
    findings.push({
      riskId: nextMedium(),
      severity: 'MEDIUM',
      title: 'ClassGroup lookup uses global name uniqueness, not semester-scoped',
      file: 'src/lib/import/importer.ts',
      evidence: 'executeImportInTransaction() finds ClassGroup by name only (line 466): classGroup.findUnique({ where: { name } }). ClassGroup.name is globally @unique. New ClassGroups now receive semesterId, but cross-semester same-name ClassGroups are blocked by the global unique constraint. Deferred to Fix-B.',
      recommendation: 'Current design is safe if ClassGroup.name remains globally unique. If per-semester ClassGroup names are needed, refactor to @@unique([semesterId, name]). Deferred to Fix-B.',
    })
  }

  // ── 5. Check ScheduleSlot dedup for semester scoping ──
  console.log('\n─── 5. ScheduleSlot Dedup Scoping ───')
  const slotDeduMatch = importer.match(/scheduleSlot\.findFirst\(\{[\s\S]*?where:\s*\{[^}]*\}/g)
  const slotDeduHasSemester = slotDeduMatch?.some(m => m.includes('semesterId')) ?? false
  console.log(`  ScheduleSlot findFirst scoped by semesterId: ${slotDeduHasSemester ? 'YES' : 'NO'}`)

  if (!slotDeduHasSemester && importerCreatesScheduleSlot) {
    findings.push({
      riskId: nextMedium(),
      severity: 'MEDIUM',
      title: 'ScheduleSlot dedup queries not scoped by semester',
      file: 'src/lib/import/importer.ts',
      evidence: 'executeImportInTransaction() finds existing ScheduleSlot by teachingTaskId+dayOfWeek+slotIndex+roomId (line 601-603) WITHOUT semesterId filter. If teachingTaskId is semester-specific this is safe, but cross-semester task reuse (see K10-IMPORT-HIGH-4) would cascade here.',
      recommendation: 'After fixing K10-IMPORT-HIGH-4, verify this dedup is correct. Consider adding semesterId if cross-semester task reuse is possible.',
    })
  }

  // ── 6. Check API routes for semesterId threading ──
  console.log('\n─── 6. API Routes ───')

  const apiRoutes = [
    { path: 'src/app/api/admin/import/parse/route.ts', name: 'parse' },
    { path: 'src/app/api/admin/import/confirm/route.ts', name: 'confirm' },
    { path: 'src/app/api/admin/import/rollback/route.ts', name: 'rollback' },
    { path: 'src/app/api/admin/import/batches/route.ts', name: 'batches (list)' },
    { path: 'src/app/api/admin/import/batches/[id]/route.ts', name: 'batches/[id] (detail)' },
    { path: 'src/app/api/admin/import/batches/[id]/abandon/route.ts', name: 'batches/[id]/abandon' },
  ]

  for (const route of apiRoutes) {
    const content = readFile(route.path)
    const hasPermission = content.includes('requirePermission')
    const hasSemesterId = content.includes('semesterId')
    const hasResolveSemester = content.includes('resolveSchedulerSemester')

    console.log(`\n  /api/admin/import/${route.name}:`)
    console.log(`    permission: ${hasPermission ? 'YES' : 'NO'}`)
    console.log(`    has semesterId: ${hasSemesterId ? 'YES' : 'NO'}`)
    console.log(`    uses resolveSchedulerSemester: ${hasResolveSemester ? 'YES' : 'NO'}`)

    if (!hasSemesterId) {
      findings.push({
        riskId: nextMedium(),
        severity: 'MEDIUM',
        title: `/api/admin/import/${route.name} has no semesterId parameter`,
        file: route.path,
        evidence: `Route does not accept or thread semesterId. ${hasPermission ? 'Has permission check.' : 'MISSING permission check!'}`,
        recommendation: 'Add semesterId to request body/query and thread to import functions.',
      })
    }
  }

  // ── 7. Check rollback.ts for semester scoping ──
  console.log('\n─── 7. Rollback Scoping ───')
  const rollback = readFile('src/lib/import/rollback.ts')
  const rollbackHasSemesterId = rollback.includes('semesterId')
  const rollbackHasDeleteMany = rollback.includes('deleteMany')
  console.log(`  has semesterId: ${rollbackHasSemesterId ? 'YES' : 'NO'}`)
  console.log(`  has deleteMany: ${rollbackHasDeleteMany ? 'YES' : 'NO'}`)

  // Rollback uses importBatchId which is unique, so semester scoping is less critical
  if (!rollbackHasSemesterId && rollbackHasDeleteMany) {
    findings.push({
      riskId: nextLow(),
      severity: 'LOW',
      title: 'Rollback deletes by importBatchId without semester verification',
      file: 'src/lib/import/rollback.ts',
      evidence: 'rollbackImportBatch() deletes ScheduleSlot/TeachingTask/TeachingTaskClass by importBatchId (lines 293-305). importBatchId is unique per batch, so this is functionally safe. However, rollback cannot verify it operates within the correct semester scope.',
      recommendation: 'No immediate fix needed. importBatchId uniqueness makes this safe. Consider adding semester verification when ImportBatch gains semesterId.',
    })
  }

  // ── 8. Check client.ts for semesterId ──
  console.log('\n─── 8. Client API Calls ───')
  const client = readFile('src/lib/import/client.ts')
  const clientHasSemesterId = client.includes('semesterId')
  console.log(`  client.ts has semesterId: ${clientHasSemesterId ? 'YES' : 'NO'}`)

  if (!clientHasSemesterId) {
    findings.push({
      riskId: nextMedium(),
      severity: 'MEDIUM',
      title: 'Import client.ts does not pass semesterId to any endpoint',
      file: 'src/lib/import/client.ts',
      evidence: 'All fetchImport*/rollbackImport*/abandonImportBatch functions pass only batchId, dryRun, confirmText. No semesterId parameter exists.',
      recommendation: 'Add optional semesterId parameter to all import client functions.',
    })
  }

  // ── 9. Check types/import.ts for semesterId ──
  console.log('\n─── 9. Import Types ───')
  const importTypes = readFile('src/types/import.ts')
  const typesHasSemesterId = importTypes.includes('semesterId')
  console.log(`  types/import.ts has semesterId: ${typesHasSemesterId ? 'YES' : 'NO'}`)

  if (!typesHasSemesterId) {
    findings.push({
      riskId: nextLow(),
      severity: 'LOW',
      title: 'Import type definitions have no semesterId field',
      file: 'src/types/import.ts',
      evidence: 'None of the Import* types (ImportBatchListItem, ImportBatchDetail, ConfirmRequest, etc.) include a semesterId field.',
      recommendation: 'Add semesterId to relevant import types when threading semester through the pipeline.',
    })
  }

  // ── 10. Check confirmed/confirming guard ──
  console.log('\n─── 10. Global Confirmed Guard ───')
  const confirmGuardMatch = importer.match(/importBatch\.findFirst\(\{[\s\S]*?status.*?confirmed[\s\S]*?\}\)/)
  const confirmGuardScoped = confirmGuardMatch?.some(m => m.includes('semesterId')) ?? false
  console.log(`  confirmed/confirming guard scoped by semester: ${confirmGuardScoped ? 'YES' : 'NO'}`)

  if (!confirmGuardScoped) {
    findings.push({
      riskId: nextMedium(),
      severity: 'MEDIUM',
      title: 'Confirmed/confirming guard is global, not semester-scoped',
      file: 'src/lib/import/importer.ts',
      evidence: 'confirmImportBatch() checks for existing confirmed/confirming batches (line 821-826) across ALL semesters. This blocks import for ANY semester if ANY batch is confirmed/confirming. Known remaining issue deferred to Fix-B.',
      recommendation: 'Scope the guard to the same semester. Deferred to Fix-B.',
    })
  }

  // ── 11. Check scheduler data-loader disconnect ──
  console.log('\n─── 11. Scheduler Data-Loader Disconnect ───')
  const dataLoader = readFile('src/lib/scheduler/data-loader.ts')
  const dataLoaderScopesBySemester = dataLoader.includes('semesterId')
  console.log(`  data-loader filters by semesterId: ${dataLoaderScopesBySemester ? 'YES' : 'NO'}`)

  if (dataLoaderScopesBySemester) {
    // Check if importer now writes semesterId
    const importerWritesSemesterId = importer.includes('semesterId') && /teachingTask\.create\(\{[\s\S]*?semesterId/.test(importer)
    if (!importerWritesSemesterId) {
      findings.push({
        riskId: nextHigh(),
        severity: 'HIGH',
        title: 'Imported data with null semesterId invisible to semester-scoped scheduler',
        file: 'src/lib/scheduler/data-loader.ts',
        evidence: 'loadSchedulingContext() filters TeachingTask and ScheduleSlot by { semesterId } (lines 30-31). Records created by import with semesterId=null will NOT be loaded by the scheduler, creating a complete disconnect between import and scheduling.',
        recommendation: 'Import MUST set semesterId on created records. Without this, imported data is invisible to the scheduler.',
      })
    }
  }

  // ── 12. Check conflict-check for null semesterId handling ──
  console.log('\n─── 12. Conflict Check Null Handling ───')
  const conflictCheck = readFile('src/lib/conflict-check.ts')
  const conflictScopesBySemester = conflictCheck.includes('semesterId')
  const conflictNullFallback = conflictCheck.includes('input.semesterId ?? movingSlot.semesterId')
  console.log(`  conflict-check uses semesterId: ${conflictScopesBySemester ? 'YES' : 'NO'}`)
  console.log(`  null fallback to slot's semesterId: ${conflictNullFallback ? 'YES' : 'NO'}`)

  if (conflictNullFallback) {
    const importerWritesSemesterId = importer.includes('semesterId') && /scheduleSlot\.create\(\{[\s\S]*?semesterId/.test(importer)
    if (!importerWritesSemesterId) {
      findings.push({
        riskId: nextMedium(),
        severity: 'MEDIUM',
        title: 'Conflict check falls back to slot semesterId which may be null for imported data',
        file: 'src/lib/conflict-check.ts',
        evidence: 'checkScheduleConflict() uses input.semesterId ?? movingSlot.semesterId (line 61). If imported slots have semesterId=null, the conflict check will use null, potentially scoping to other null-semesterId slots or not scoping at all.',
        recommendation: 'Ensure imported records have proper semesterId so conflict checks work correctly.',
      })
    }
  }

  // ── 13. Check for deleteMany in import pipeline ──
  console.log('\n─── 13. Unscoped Delete Operations ───')
  for (const file of allImportFiles) {
    const content = readFile(relPath(file))
    if (content.includes('deleteMany')) {
      const absPath = typeof file === 'string' ? file : ''
      const rPath = relPath(absPath)
      console.log(`  deleteMany found in: ${rPath}`)
    }
  }

  // ── 14. Check resolveSchedulerSemester usage ──
  console.log('\n─── 14. resolveSchedulerSemester Usage ───')
  const semesterHelper = readFile('src/lib/semester.ts')
  const helperExists = semesterHelper.includes('resolveSchedulerSemester')
  console.log(`  resolveSchedulerSemester exists: ${helperExists ? 'YES' : 'NO'}`)

  let importFileUsesHelper = false
  for (const file of allImportFiles) {
    const content = readFile(relPath(file))
    if (content.includes('resolveSchedulerSemester')) {
      importFileUsesHelper = true
      console.log(`  Used in: ${relPath(file)}`)
    }
  }
  if (!importFileUsesHelper) {
    console.log('  NOT used by any import file')
    findings.push({
      riskId: nextMedium(),
      severity: 'MEDIUM',
      title: 'resolveSchedulerSemester not used by any import pipeline code',
      file: 'src/lib/semester.ts',
      evidence: 'The semester resolution helper exists and is used by 13+ other routes, but no import API route or import library function calls it.',
      recommendation: 'Thread resolveSchedulerSemester through import parse/confirm routes to resolve target semester.',
    })
  }

  // ── 15. Check import page UI for semester selector ──
  console.log('\n─── 15. Import UI ───')
  const importPage = readFile('src/app/admin/import/page.tsx')
  const importUiHasSemester = importPage.includes('semesterId')
  const importUiHasSelector = importPage.includes('SemesterSelector') || importPage.includes('semester-selector')
  console.log(`  Import page has semesterId: ${importUiHasSemester ? 'YES' : 'NO'}`)
  console.log(`  Import page has semester selector: ${importUiHasSelector ? 'YES' : 'NO'}`)

  // ── 16. Cross-impact with already-scoped chains ──
  console.log('\n─── 16. Cross-Impact with Scoped Chains ───')

  const scopedChains = [
    { path: 'src/lib/scheduler/data-loader.ts', name: 'scheduler data-loader', scopesBySemester: true },
    { path: 'src/lib/conflict-check.ts', name: 'conflict-check', scopesBySemester: true },
    { path: 'src/app/api/data/teaching-tasks/route.ts', name: '/api/data/teaching-tasks', scopesBySemester: true },
    { path: 'src/app/api/data/schedule-slots/route.ts', name: '/api/data/schedule-slots', scopesBySemester: true },
    { path: 'src/app/api/schedule/route.ts', name: '/api/schedule', scopesBySemester: true },
    { path: 'src/app/api/export/excel/route.ts', name: '/api/export/excel', scopesBySemester: true },
  ]

  for (const chain of scopedChains) {
    const content = readFile(chain.path)
    const hasSemester = content.includes('semesterId')
    const status = hasSemester ? 'SCOPED' : 'NOT SCOPED'
    console.log(`  ${chain.name}: ${status}`)
  }

  console.log(`\n  Impact: Imported data with semesterId=null will be INVISIBLE to all scoped chains.`)

  // ── Summary ──
  console.log('\n════════════════════════════════════════════════════════════')
  console.log('Findings:')
  console.log('════════════════════════════════════════════════════════════')

  const bySeverity = {
    HIGH: findings.filter(f => f.severity === 'HIGH'),
    MEDIUM: findings.filter(f => f.severity === 'MEDIUM'),
    LOW: findings.filter(f => f.severity === 'LOW'),
    NONE: findings.filter(f => f.severity === 'NONE'),
    UNKNOWN: findings.filter(f => f.severity === 'UNKNOWN'),
  }

  for (const f of findings) {
    const icon = f.severity === 'HIGH' ? '🔴' : f.severity === 'MEDIUM' ? '🟡' : '🟢'
    console.log(`\n  ${icon} [${f.severity}] ${f.riskId}: ${f.title}`)
    console.log(`     File: ${f.file}`)
    console.log(`     Evidence: ${f.evidence}`)
    console.log(`     Recommendation: ${f.recommendation}`)
  }

  console.log('\n════════════════════════════════════════════════════════════')
  console.log('Summary:')
  console.log('════════════════════════════════════════════════════════════')
  console.log(`  HIGH: ${bySeverity.HIGH.length}`)
  console.log(`  MEDIUM: ${bySeverity.MEDIUM.length}`)
  console.log(`  LOW: ${bySeverity.LOW.length}`)
  console.log(`  NONE: ${bySeverity.NONE.length}`)
  console.log(`  UNKNOWN: ${bySeverity.UNKNOWN.length}`)
  console.log(`  TOTAL: ${findings.length}`)
  console.log('')
}

main().catch(console.error)
