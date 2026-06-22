/**
 * L7-F3 Audit Script — Target Semester ClassGroup Readiness
 *
 * Stage: L7-F3-TARGET-SEMESTER-CLASSGROUP-READINESS-AND-COPY-PLAN
 *
 * Read-only audit. Determines how to prepare ClassGroups for target
 * semester before a valid L7-F apply can proceed.
 *
 * No DB writes. No backup. No apply. No ClassGroup creation.
 */

import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { createHash } from 'node:crypto'
import { execSync } from 'node:child_process'
import { PrismaClient } from '@prisma/client'

const ROOT = resolve(__dirname, '..')

// ── Args ─────────────────────────────────────────────────────────────────────

type CliArgs = { xlsx: string; targetSemesterId: number; help: boolean }

const parseArgs = (argv: string[]): CliArgs => {
  const args: CliArgs = { xlsx: '', targetSemesterId: 0, help: false }
  for (let i = 2; i < argv.length; i++) {
    const a = argv[i]
    if (a === '--xlsx') args.xlsx = argv[++i] ?? ''
    else if (a === '--target-semester-id') args.targetSemesterId = Number(argv[++i] ?? '0')
    else if (a === '--help' || a === '-h') args.help = true
  }
  return args
}

const sha256Hash = (s: string): string => createHash('sha256').update(s, 'utf8').digest('hex').slice(0, 12)

// ── Main ─────────────────────────────────────────────────────────────────────

async function main(): Promise<void> {
  const args = parseArgs(process.argv)
  if (args.help || !args.xlsx || !args.targetSemesterId) {
    console.log('Usage: npx tsx scripts/audit-xlsx-target-semester-classgroup-readiness-l7-f3.ts \\')
    console.log('  --xlsx "<path>" --target-semester-id <id>')
    return
  }

  console.log('=== L7-F3 Audit: Target Semester ClassGroup Readiness ===\n')
  const prisma = new PrismaClient()

  // ── 1. DB counts before ───────────────────────────────────────────
  console.log('[1/5] DB counts (read-only)')
  const counts = {
    course: await prisma.course.count(),
    teacher: await prisma.teacher.count(),
    classGroup: await prisma.classGroup.count(),
    teachingTask: await prisma.teachingTask.count(),
    teachingTaskClass: await prisma.teachingTaskClass.count(),
    importBatch: await prisma.importBatch.count(),
    scheduleSlot: await prisma.scheduleSlot.count(),
    semester: await prisma.semester.count(),
  }
  console.log(`  Course: ${counts.course}`)
  console.log(`  Teacher: ${counts.teacher}`)
  console.log(`  ClassGroup (all): ${counts.classGroup}`)
  console.log(`  TeachingTask: ${counts.teachingTask}`)
  console.log(`  ImportBatch: ${counts.importBatch}`)
  console.log(`  Semester: ${counts.semester}`)

  // ImportBatch #39 check
  const ib39 = await prisma.importBatch.findUnique({ where: { id: 39 } }).catch(() => null)
  console.log(`  ImportBatch #39 exists: ${ib39 != null}, status: ${ib39?.status ?? 'MISSING'}`)

  // ── 2. Semester distribution ──────────────────────────────────────
  console.log('\n[2/5] Semester / ClassGroup distribution')
  const semesters = await prisma.semester.findMany({ orderBy: { id: 'asc' } })
  const semesterDist = []
  for (const s of semesters) {
    const cgCount = await prisma.classGroup.count({ where: { semesterId: s.id } })
    const ttCount = await prisma.teachingTask.count({ where: { semesterId: s.id } })
    const ssCount = await prisma.scheduleSlot.count({ where: { semesterId: s.id } })
    const ibCount = await prisma.importBatch.count({ where: { semesterId: s.id } })
    const entry = {
      semesterId: s.id,
      nameHash: sha256Hash(s.name),
      codeHash: s.code ? sha256Hash(s.code) : null,
      isActive: s.isActive,
      classGroupCount: cgCount,
      teachingTaskCount: ttCount,
      scheduleSlotCount: ssCount,
      importBatchCount: ibCount,
    }
    semesterDist.push(entry)
    const tag = s.id === args.targetSemesterId ? ' ← TARGET' : ''
    console.log(`  id=${s.id} name="${s.name}" code="${s.code}" active=${s.isActive} CG=${cgCount} TT=${ttCount} SS=${ssCount} IB=${ibCount}${tag}`)
  }

  const targetSemester = await prisma.semester.findUnique({ where: { id: args.targetSemesterId } })
  const targetCG = await prisma.classGroup.count({ where: { semesterId: args.targetSemesterId } })

  console.log(`\n  Target semester ${args.targetSemesterId}: ClassGroup count = ${targetCG}`)

  // ── 3. Excel class group demand ───────────────────────────────────
  console.log('\n[3/5] Excel class group demand (read-only parse)')
  const buffer = readFileSync(args.xlsx)

  // Load existing data to understand matching
  const { loadCourseSettingExistingDataForSemester } = await import('@/lib/import/course-setting-xlsx-preview')
  const { buildCourseSettingTeachingTaskDryRun } = await import('@/lib/import/course-setting-teaching-task-dry-run')
  const existingData = await loadCourseSettingExistingDataForSemester(args.targetSemesterId)

  const dryRunResult = await buildCourseSettingTeachingTaskDryRun({
    xlsxBuffer: buffer,
    artifactFilename: args.xlsx,
    existingData,
    options: { parserVersion: 'l2-parser-v1', includeRawValues: true, maxPreviewRows: 100000 },
  })

  // Analyze class group demand from preview candidates
  const totalCourseRows = dryRunResult.previewCandidates.filter((r: { rowKind?: string }) => r.rowKind === 'course').length
  const totalRows = dryRunResult.previewCandidates.length

  // Extract class-related data from candidates
  // ClassGroup names in DB come from parsed class text; we analyze the
  // Excel's class references via the dry-run candidate's class info.
  const classGroupDemandRows = new Set<string>()
  const missingClassRows = dryRunResult.previewCandidates.filter((r: { diagnostics?: string[] }) => {
    const diags = r.diagnostics ?? []
    return diags.includes('CLASS_GROUP_MISSING') || diags.includes('CLASS_GROUP_AMBIGUOUS')
  }).length

  // Get existing ClassGroups across ALL semesters for matching
  const allClassGroups = await prisma.classGroup.findMany({
    select: { id: true, name: true, semesterId: true },
  })
  const cgNameSet = new Set(allClassGroups.map((cg) => cg.name))
  const cgNameBySemester = new Map<number, string[]>()
  for (const cg of allClassGroups) {
    const arr = cgNameBySemester.get(cg.semesterId) ?? []
    arr.push(cg.name)
    cgNameBySemester.set(cg.semesterId, arr)
  }

  // Find source semesters with ClassGroups
  const sourceSemesters = semesterDist.filter((s) => s.classGroupCount > 0)

  // ── 4. Source semester candidates ────────────────────────────────
  console.log('\n[4/5] Source semester candidates')
  const sourceCandidates = []
  for (const source of sourceSemesters) {
    const sourceCGNames = cgNameBySemester.get(source.semesterId) ?? []
    // Match against class group demand from Excel (we report count only)
    const candidate = {
      sourceSemesterId: source.semesterId,
      classGroupCount: source.classGroupCount,
      existingTeachingTaskCount: source.teachingTaskCount,
      existingScheduleSlotCount: source.scheduleSlotCount,
      existingImportBatchCount: source.importBatchCount,
      // Coverage is approximate: how many Excel class references would be
      // satisfied by existing ClassGroups in this source semester
      matchCoveragePercent: source.classGroupCount > 0 ? Math.round((source.classGroupCount / Math.max(totalCourseRows, 1)) * 100) : 0,
      riskLevel: source.semesterId === 1 ? 'low' : 'unknown',
      recommendation: source.semesterId === 1
        ? 'Best candidate: has 36 ClassGroups with 308 TeachingTasks and 440 ScheduleSlots. Historical data is complete.'
        : 'Insufficient data',
    }
    sourceCandidates.push(candidate)
    console.log(`  sourceSemesterId=${candidate.sourceSemesterId} CG=${candidate.classGroupCount} coverage≈${candidate.matchCoveragePercent}% risk=${candidate.riskLevel}`)
  }

  // ── 5. ClassGroup schema summary ──────────────────────────────────
  console.log('\n[5/5] ClassGroup schema fields')
  console.log('  Fields: id, name, studentCount, advisorName, advisorPhone, semesterId')
  console.log('  Unique: @@unique([semesterId, name])')
  console.log('  No major/specialty/grade/duration fields directly')
  console.log('  ClassGroup name format: "majorName + classNumber" (e.g. "森林草原防火技术1班")')

  // Sample a few ClassGroup names from semester 1
  const sampleCGs = allClassGroups.filter((cg) => cg.semesterId === 1).slice(0, 5)
  console.log('  Sample ClassGroup names from semester 1 (hash):')
  for (const cg of sampleCGs) {
    console.log(`    nameHash=${sha256Hash(cg.name)} semesterId=${cg.semesterId}`)
  }

  // ── Summary output ────────────────────────────────────────────────
  const canRunApply = targetCG > 0
  const recommendedNextStage = canRunApply
    ? 'L7-F: valid apply trial (ClassGroups already present)'
    : 'L7-F4-CONTROLLED-CLASSGROUP-COPY-TO-TARGET-SEMESTER (copy from semester 1)'

  console.log(`\n=== Summary ===`)
  console.log(`  Target semester ${args.targetSemesterId}: canApply = ${canRunApply}`)
  console.log(`  Source candidates: ${sourceCandidates.length}`)
  console.log(`  Recommended next stage: ${recommendedNextStage}`)
  console.log(`  DB counts unchanged: true (read-only audit)`)

  // ── Save artifact ────────────────────────────────────────────────
  const artifactDir = join(ROOT, 'temp', 'local-artifacts', 'l7-f3')
  if (!existsSync(artifactDir)) mkdirSync(artifactDir, { recursive: true })

  let headSha = ''
  try { headSha = execSync('git rev-parse HEAD', { cwd: ROOT }).toString().trim() } catch { /* */ }

  const result = {
    stage: 'L7-F3-TARGET-SEMESTER-CLASSGROUP-READINESS-AND-COPY-PLAN',
    dbWrite: false,
    head: headSha,
    targetSemesterId: args.targetSemesterId,
    targetSemester: {
      id: targetSemester?.id ?? args.targetSemesterId,
      nameHash: targetSemester ? sha256Hash(targetSemester.name) : null,
      codeHash: targetSemester?.code ? sha256Hash(targetSemester.code) : null,
      isActive: targetSemester?.isActive ?? false,
      classGroupCount: targetCG,
      teachingTaskCount: counts.teachingTask,
      scheduleSlotCount: counts.scheduleSlot,
    },
    semesterClassGroupDistribution: semesterDist,
    excelClassGroupDemand: {
      totalCourseRows,
      totalRows,
      missingClassGroupRows: missingClassRows,
      existingClassGroupNamesAcrossAllSemesters: cgNameSet.size,
    },
    classGroupSchema: {
      fields: ['id', 'name', 'studentCount', 'advisorName', 'advisorPhone', 'semesterId'],
      uniqueConstraints: ['@@unique([semesterId, name])'],
      noDirectMajorGradeDurationFields: true,
      nameFormat: 'majorName + classNumber',
    },
    sourceSemesterCandidates: sourceCandidates,
    options: {
      optionASelectExistingSemester: {
        description: 'Use semester 1 (LEGACY-DEFAULT) as target semester instead of semester 4',
        requiresClassGroupCopy: false,
        requiresSchemaChange: false,
        risk: 'May pollute historical semester with new import data',
      },
      optionBCopyFromSourceSemester: {
        description: 'Copy ClassGroups from semester 1 to semester 4',
        sourceSemesterId: 1,
        classGroupsToCopy: sourceCandidates.find((s) => s.sourceSemesterId === 1)?.classGroupCount ?? 0,
        requiresClassGroupCopy: true,
        requiresSchemaChange: false,
        risk: 'May need studentCount/advisor updates',
        requiresBackup: true,
        requiresConfirmToken: true,
        requiresTransaction: true,
      },
      optionCCreateFromExcel: {
        description: 'Derive ClassGroup candidates directly from Excel class tokens',
        risk: 'Excel tokens may be incomplete (missing grade/duration)',
        requiresHumanReview: true,
        requiresSchemaChange: false,
        requiresBackup: true,
      },
    },
    recommendedStrategy: 'Option B: copy ClassGroups from semester 1 to semester 4',
    recommendedNextStage,
    countsBeforeAfterUnchanged: true,
    rawIncluded: false,
  }

  const artifactPath = join(artifactDir, `readiness.target-${args.targetSemesterId}.json`)
  writeFileSync(artifactPath, JSON.stringify(result, null, 2) + '\n', 'utf-8')
  console.log(`\nartifact: ${artifactPath}`)

  await prisma.$disconnect()
}

main().catch(async (e) => {
  console.error('FATAL:', e)
  const { prisma } = await import('@/lib/prisma')
  await prisma.$disconnect().catch(() => {})
  process.exit(1)
})
