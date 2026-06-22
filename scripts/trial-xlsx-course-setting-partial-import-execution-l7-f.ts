/**
 * L7-F Trial Script — Course-Setting XLSX Partial Import Apply (Controlled)
 *
 * Stage: L7-F-XLSX-COURSE-SETTING-NEW-TEMPLATE-PARTIAL-IMPORT-EXECUTION
 *
 * CLI tool for executing the L7-F apply stage.
 *
 * Usage:
 *   # Dry-run only (no DB writes, no backup):
 *   npx tsx scripts/trial-xlsx-course-setting-partial-import-execution-l7-f.ts \
 *     --xlsx "<xlsx path>" --target-semester-id <id> --dry-run
 *
 *   # Real apply (writes DB; requires confirm token):
 *   npx tsx scripts/trial-xlsx-course-setting-partial-import-execution-l7-f.ts \
 *     --xlsx "<xlsx path>" --target-semester-id <id> --apply \
 *     --confirm-token APPLY_XLSX_COURSE_SETTING_<id>
 *
 * Output: local raw artifact to temp/local-artifacts/l7-f/
 */

import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { createHash } from 'node:crypto'

// ── Args parsing ─────────────────────────────────────────────────────────────

type CliArgs = {
  xlsx: string
  targetSemesterId: number
  apply: boolean
  dryRun: boolean
  confirmToken: string | null
  expectClassgroupGate: boolean
  help: boolean
}

const parseArgs = (argv: string[]): CliArgs => {
  const args: CliArgs = {
    xlsx: '',
    targetSemesterId: 0,
    apply: false,
    dryRun: false,
    confirmToken: null,
    expectClassgroupGate: false,
    help: false,
  }
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i]
    if (a === '--xlsx') args.xlsx = argv[++i] ?? ''
    else if (a === '--target-semester-id') args.targetSemesterId = Number(argv[++i] ?? '0')
    else if (a === '--apply') args.apply = true
    else if (a === '--dry-run') args.dryRun = true
    else if (a === '--confirm-token') args.confirmToken = argv[++i] ?? null
    else if (a === '--expect-classgroup-gate') args.expectClassgroupGate = true
    else if (a === '--help' || a === '-h') args.help = true
  }
  return args
}

const printHelp = (): void => {
  console.log(`L7-F Trial Script — Course-Setting XLSX Partial Import Apply

Usage:
  --xlsx <path>                    Path to .xlsx file (required)
  --target-semester-id <id>        Target semester ID (required)
  --dry-run                        Dry-run mode (default if --apply absent)
  --apply                          Real apply mode (writes DB)
  --confirm-token <token>          Confirm token (required for --apply)
  --help, -h                       Show this help

Default mode: dry-run (no writes).
Confirm token must match: APPLY_XLSX_COURSE_SETTING_<targetSemesterId>

Examples:
  npx tsx scripts/trial-xlsx-course-setting-partial-import-execution-l7-f.ts \\
    --xlsx "D:/Desktop/Course Development System/课程设置新模板.xlsx" \\
    --target-semester-id 4 --dry-run

  npx tsx scripts/trial-xlsx-course-setting-partial-import-execution-l7-f.ts \\
    --xlsx "D:/Desktop/Course Development System/课程设置新模板.xlsx" \\
    --target-semester-id 4 --apply \\
    --confirm-token APPLY_XLSX_COURSE_SETTING_4
`)
}

// ── Main ─────────────────────────────────────────────────────────────────────

async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2))
  if (args.help) {
    printHelp()
    return
  }

  if (!args.xlsx) {
    console.error('ERROR: --xlsx <path> is required')
    printHelp()
    process.exit(1)
  }
  if (!Number.isInteger(args.targetSemesterId) || args.targetSemesterId <= 0) {
    console.error('ERROR: --target-semester-id <id> is required (positive integer)')
    process.exit(1)
  }
  if (!existsSync(args.xlsx)) {
    console.error(`ERROR: xlsx file not found: ${args.xlsx}`)
    process.exit(1)
  }

  const mode: 'dry-run' | 'apply' = args.apply && !args.dryRun ? 'apply' : 'dry-run'
  const expectedToken = `APPLY_XLSX_COURSE_SETTING_${args.targetSemesterId}`

  if (mode === 'apply') {
    if (!args.confirmToken) {
      console.error('ERROR: --apply requires --confirm-token')
      console.error(`Expected: ${expectedToken}`)
      process.exit(1)
    }
    if (args.confirmToken !== expectedToken) {
      console.error(`ERROR: confirm token mismatch`)
      console.error(`  expected: ${expectedToken}`)
      console.error(`  got:      ${args.confirmToken}`)
      process.exit(1)
    }
  }

  console.log(`L7-F trial script`)
  console.log(`  xlsx: ${args.xlsx}`)
  console.log(`  target semester: ${args.targetSemesterId}`)
  console.log(`  mode: ${mode}`)
  console.log(`  confirm token: ${mode === 'apply' ? expectedToken : '(n/a)'}`)
  console.log('')

  // Read xlsx
  const buffer = readFileSync(args.xlsx)
  const fileSha256 = createHash('sha256').update(buffer).digest('hex')
  console.log(`xlsx sha256: ${fileSha256}`)
  console.log(`xlsx size:   ${buffer.length} bytes`)
  console.log('')

  // Build the L6-E2 plan via the service layer
  console.log('--- Building L6-E2 plan (server-side recompute) ---')
  const { prisma } = await import('@/lib/prisma')
  const { loadCourseSettingExistingDataForSemester } = await import(
    '@/lib/import/course-setting-xlsx-preview'
  )
  const { buildCourseSettingTeachingTaskDryRun } = await import(
    '@/lib/import/course-setting-teaching-task-dry-run'
  )
  const { buildCourseSettingApprovalPackageWithTargetSemester } = await import(
    '@/lib/import/course-setting-approval-package-l6-d'
  )
  const { buildCourseSettingApprovalReviewUi } = await import(
    '@/lib/import/course-setting-approval-review-ui-l6-d2'
  )
  const {
    buildCourseSettingPartialImportPlan,
    validatePartialImportPlan,
  } = await import('@/lib/import/course-setting-partial-import-plan-l6-e2')

  const semester = await prisma.semester.findUnique({
    where: { id: args.targetSemesterId },
    select: { id: true, name: true, code: true, isActive: true },
  })
  if (!semester) {
    console.error(`ERROR: semester ${args.targetSemesterId} not found`)
    process.exit(1)
  }
  console.log(`target semester: ${semester.name} (${semester.code ?? 'no code'}) isActive=${semester.isActive}`)

  const existingData = await loadCourseSettingExistingDataForSemester(args.targetSemesterId)
  const dryRunResult = await buildCourseSettingTeachingTaskDryRun({
    xlsxBuffer: buffer,
    artifactFilename: args.xlsx,
    existingData,
    options: { parserVersion: 'l2-parser-v1', includeRawValues: false, maxPreviewRows: 100000 },
  })
  const filenameHash = createHash('sha256').update(args.xlsx, 'utf8').digest('hex').slice(0, 12)
  const idHash = createHash('sha256').update(String(semester.id), 'utf8').digest('hex').slice(0, 12)
  const nameHash = createHash('sha256').update(semester.name, 'utf8').digest('hex').slice(0, 12)
  const codeHash = semester.code
    ? createHash('sha256').update(semester.code, 'utf8').digest('hex').slice(0, 12)
    : null

  const approvalPackage = buildCourseSettingApprovalPackageWithTargetSemester({
    dryRunResult,
    targetSemester: {
      id: semester.id,
      idHash,
      nameHash,
      codeHash,
      isActive: semester.isActive,
      taskCount: dryRunResult.existingDataSummary.teachingTaskCount,
      classGroupCount: dryRunResult.existingDataSummary.classGroupCount,
    },
    sourceArtifact: {
      artifactSha256: fileSha256,
      artifactFilenameHash: filenameHash,
      sizeBytes: buffer.length,
      parserVersion: dryRunResult.parser.parserVersion,
    },
  })

  const reviewUi = buildCourseSettingApprovalReviewUi({ approvalPackage })

  // No manual resolutions provided in CLI mode → use initial state
  const plan = await buildCourseSettingPartialImportPlan({
    reviewRows: reviewUi.rows,
    manualResolutions: [],
    existingData,
    targetSemesterId: args.targetSemesterId,
    sourceArtifact: { filename: args.xlsx, sha256: fileSha256, sizeBytes: buffer.length },
    reviewPackageFingerprintHash: approvalPackage.dryRunFingerprint.hash,
  })
  const planValidation = validatePartialImportPlan(plan)
  if (!planValidation.ok) {
    console.error('ERROR: plan validation failed')
    console.error(JSON.stringify(planValidation.violations, null, 2))
    process.exit(1)
  }

  console.log(`\nL6-E2 plan summary:`)
  console.log(`  total rows:           ${plan.summary.totalRows}`)
  console.log(`  planned import:       ${plan.summary.plannedImportRows}`)
  console.log(`  skipped:              ${plan.summary.skippedRows}`)
  console.log(`  unresolved:           ${plan.summary.unresolvedRows}`)
  console.log(`  course create cand.:  ${plan.summary.courseCreateCandidates}`)
  console.log(`  teaching task cand.:  ${plan.summary.teachingTaskCandidates}`)
  console.log(`  teaching task class:  ${plan.summary.teachingTaskClassCandidates}`)

  // Compute plan hash
  const stableStringify = (v: unknown): string => {
    if (v == null || typeof v !== 'object') return JSON.stringify(v)
    if (Array.isArray(v)) return `[${v.map(stableStringify).join(',')}]`
    const keys = Object.keys(v as Record<string, unknown>).sort()
    return `{${keys.map((k) => JSON.stringify(k) + ':' + stableStringify((v as Record<string, unknown>)[k])).join(',')}}`
  }
  const planHash = createHash('sha256').update(stableStringify(plan), 'utf8').digest('hex')
  console.log(`  planHash:             ${planHash}`)

  // Save plan artifact
  const artifactDir = join(resolve(__dirname, '..'), 'temp', 'local-artifacts', 'l7-f')
  if (!existsSync(artifactDir)) {
    mkdirSync(artifactDir, { recursive: true })
  }
  const planPath = join(artifactDir, `plan.target-${args.targetSemesterId}.${planHash.slice(0, 12)}.json`)
  writeFileSync(planPath, JSON.stringify(plan, null, 2) + '\n', 'utf-8')
  console.log(`\nplan artifact: ${planPath}`)

  // Run apply
  const { executeL7FCourseSettingApply } = await import('@/lib/import/course-setting-apply-l7-f')

  // ClassGroup hard gate — must be checked before backup and transaction.
  if (mode === 'apply') {
    const classGroupCount = await prisma.classGroup.count({
      where: { semesterId: args.targetSemesterId },
    })
    if (classGroupCount === 0) {
      console.log(`\n--- CLASSGROUP GATE ---`)
      console.log(`  Target semester ${args.targetSemesterId} has ${classGroupCount} ClassGroups.`)
      console.log(`  Cannot apply: TARGET_SEMESTER_HAS_NO_CLASS_GROUPS`)
      console.log(`  No backup created, no DB write.`)
      if (args.expectClassgroupGate) {
        console.log(`\n  --expect-classgroup-gate: gate triggered as expected. PASS.`)
        process.exit(0)
      }
      process.exit(1)
    }
  }

  console.log(`\n--- Executing L7-F apply (${mode}) ---`)
  const result = await executeL7FCourseSettingApply({
    targetSemesterId: args.targetSemesterId,
    plan: plan as unknown as Parameters<typeof executeL7FCourseSettingApply>[0]['plan'],
    confirmToken: mode === 'apply' ? expectedToken : undefined,
    dryRunOnly: mode === 'dry-run',
  })

  console.log(`\nL7-F result:`)
  console.log(`  applied:        ${result.applied}`)
  console.log(`  dbWritten:      ${result.dbWritten}`)
  console.log(`  dryRunOnly:     ${result.dryRunOnly}`)
  console.log(`  importBatchId:  ${result.importBatchId}`)
  console.log(`  backupPath:     ${result.backupPath ?? '(none — dry-run)'}`)
  console.log(`  rawIncluded:    ${result.rawIncluded}`)
  console.log(`\n  summary:`)
  for (const [k, v] of Object.entries(result.summary)) {
    console.log(`    ${k.padEnd(38)} ${v}`)
  }
  console.log(`\n  post-apply audit: ${result.postApplyAudit.passed ? 'PASSED' : 'FAILED'}`)
  for (const c of result.postApplyAudit.checks) {
    console.log(`    ${c.ok ? '✓' : '✗'} ${c.name}${c.detail ? ` (${c.detail})` : ''}`)
  }
  console.log(`\n  rollback note:`)
  console.log(`    ${result.rollbackNote.split('\n').join('\n    ')}`)

  // Save result artifact
  const resultPath = join(
    artifactDir,
    `result.target-${args.targetSemesterId}.${mode}.${planHash.slice(0, 12)}.json`,
  )
  writeFileSync(
    resultPath,
    JSON.stringify({ result, planHash, mode, planSummary: plan.summary }, null, 2) + '\n',
    'utf-8',
  )
  console.log(`\nresult artifact: ${resultPath}`)

  if (!result.applied && !result.dryRunOnly) {
    console.error(`\nERROR: apply failed audit. See ${resultPath} for details.`)
    process.exit(1)
  }

  await prisma.$disconnect()
}

main().catch(async (e) => {
  console.error('FATAL:', e)
  try {
    const { prisma } = await import('@/lib/prisma')
    await prisma.$disconnect()
  } catch {
    // ignore
  }
  process.exit(1)
})
