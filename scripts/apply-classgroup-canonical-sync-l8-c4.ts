/**
 * L8-C4 Apply Script — ClassGroup Canonical Controlled Sync
 *
 * Executes the canonical ClassGroup sync in a single transaction.
 * Supports --dry-run, --confirm-token INVALID_TOKEN, --confirm-token WRITE_L8_C4_CLASSGROUP_CANONICAL_SYNC.
 *
 * Usage:
 *   npx tsx scripts/apply-classgroup-canonical-sync-l8-c4.ts --dry-run
 *   npx tsx scripts/apply-classgroup-canonical-sync-l8-c4.ts --confirm-token INVALID_TOKEN
 *   npx tsx scripts/apply-classgroup-canonical-sync-l8-c4.ts --confirm-token WRITE_L8_C4_CLASSGROUP_CANONICAL_SYNC
 */

import { readFileSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { PrismaClient } from '@prisma/client'
import ExcelJS from 'exceljs'

const ROOT = resolve(__dirname, '..')
const STAGE = 'L8-C4-CLASSGROUP-CANONICAL-CONTROLLED-SYNC-APPLY'
const MAJOR_XLSX = 'D:/Desktop/Course Development System/学院专业数据库.xlsx'
const VALID_TOKEN = 'WRITE_L8_C4_CLASSGROUP_CANONICAL_SYNC'

// ── CLI ─────────────────────────────────────────────────────────────────────

type CliArgs = { dryRun: boolean; confirmToken: string; help: boolean }
const parseArgs = (argv: string[]): CliArgs => {
  const args: CliArgs = { dryRun: false, confirmToken: '', help: false }
  for (let i = 2; i < argv.length; i++) {
    if (argv[i] === '--dry-run') args.dryRun = true
    else if (argv[i] === '--confirm-token') args.confirmToken = argv[++i] ?? ''
    else if (argv[i] === '--help') args.help = true
  }
  return args
}

// ── Helpers ─────────────────────────────────────────────────────────────────

function buildCanonicalKey(grade: string, major: string, classNumber: string, direction: string, educationLevel: string, schoolLength: string): string {
  return `${grade}|${major}|${classNumber}|${direction}|${educationLevel}|${schoolLength}`
}

function buildPlannedName(grade: string, major: string, classNumber: string): string {
  if (!classNumber) return `${grade}${major}`
  return `${grade}${major}${classNumber}班`
}

// ── Main ───────────────────────────────────────────────────────────────────

async function main(): Promise<void> {
  const args = parseArgs(process.argv)
  if (args.help) { console.log('Usage: ... [--dry-run] [--confirm-token TOKEN]'); process.exit(0) }

  const isWrite = !args.dryRun && args.confirmToken === VALID_TOKEN
  const isDryRun = args.dryRun
  const isInvalidToken = !args.dryRun && args.confirmToken !== '' && args.confirmToken !== VALID_TOKEN

  console.log(`=== ${STAGE} ===`)
  console.log(`mode: ${isDryRun ? 'DRY-RUN' : isWrite ? 'WRITE' : isInvalidToken ? 'INVALID_TOKEN' : 'NO_MODE'}`)
  console.log('')

  if (!isDryRun && !isWrite && !isInvalidToken) {
    console.error('ERROR: specify --dry-run or --confirm-token <token>')
    process.exit(1)
  }

  if (isInvalidToken) {
    console.log(`REJECTED: invalid token "${args.confirmToken}" — expected "${VALID_TOKEN}"`)
    process.exit(1)
  }

  const prisma = new PrismaClient()

  // ── Load reference classes ──────────────────────────────────────────────
  console.log('[1/6] Loading reference classes...')
  const wb = new ExcelJS.Workbook()
  await wb.xlsx.readFile(MAJOR_XLSX)
  const ws = wb.worksheets[2]
  const refClasses: Array<{ canonicalKey: string; plannedName: string; grade: string; majorName: string; classNumber: string; direction: string; educationLevel: string; schoolLength: string; studentCount: number | null }> = []
  for (let r = 2; r <= ws.rowCount; r++) {
    const row: (string | number | null)[] = []
    ws.getRow(r).eachCell({ includeEmpty: true }, (cell, col) => { row[col - 1] = cell.value as string | number | null })
    if (row[0] || row[1]) {
      const grade = String(row[3] || '').trim()
      const major = String(row[1] || '').trim()
      const direction = row[2] ? String(row[2]).trim() : ''
      const classNumber = String(row[5] || '').trim()
      const educationLevel = String(row[9] || '').trim()
      const schoolLength = String(row[6] || '').trim()
      const studentCount = row[7] != null ? Number(row[7]) : null
      const canonicalKey = buildCanonicalKey(grade, major, classNumber, direction, educationLevel, schoolLength)
      refClasses.push({ canonicalKey, plannedName: buildPlannedName(grade, major, classNumber), grade, majorName: major, classNumber, direction, educationLevel, schoolLength, studentCount })
    }
  }
  console.log(`  reference classes: ${refClasses.length}`)

  // ── Load DB ClassGroups ────────────────────────────────────────────────
  console.log('[2/6] Loading DB ClassGroups...')
  const allDbCgs = await prisma.classGroup.findMany({ orderBy: { id: 'asc' } })
  console.log(`  DB ClassGroups: ${allDbCgs.length}`)

  // ── Load unified TTC decisions ──────────────────────────────────────────
  console.log('[3/6] Loading unified TTC decisions...')
  const decisionsPath = join(ROOT, 'temp', 'local-artifacts', 'l8-c4', 'unified-ttc-decisions.local.json')
  const decisions = JSON.parse(readFileSync(decisionsPath, 'utf8'))
  console.log(`  TTC decisions: ${decisions.totalTtcDecisions} (resolved: ${decisions.resolvedTtcDecisions})`)
  if (decisions.unresolvedTtcDecisions > 0) {
    console.error(`ERROR: ${decisions.unresolvedTtcDecisions} unresolved TTC decisions`)
    process.exit(1)
  }

  // ── Build mapping ──────────────────────────────────────────────────────
  console.log('[4/6] Building mapping...')

  // Parse DB CG names and match to canonical keys
  function parseDbName(name: string): { grade: string; major: string; classNum: string; direction: string | null } {
    let w = name.trim()
    const gm = w.match(/^(\d{4})(级)?/)
    const grade = gm ? gm[1] + '级' : ''
    if (gm) w = w.slice(gm[0].length)
    let direction: string | null = null
    const dm = w.match(/[（(]([^）)]+)[）)]/)
    if (dm) { direction = dm[1]; w = w.replace(/[（(][^）)]*[）)]/, '') }
    const cn = w.match(/(\d+)班$/)
    const classNum = cn ? cn[1] : ''
    if (cn) w = w.slice(0, -cn[0].length)
    return { grade, major: w.trim(), classNum, direction }
  }

  // For each DB CG, find best canonical match
  const cgMappings = new Map<number, { canonicalKey: string; refClass: any; matchType: string }>()
  const selectedCanonicalRows = new Map<string, number>() // canonicalKey → dbClassGroupId (chosen as canonical row)
  const toCreate: Array<{ refClass: any; existingDbCgId: number | null }> = []

  for (const dbCg of allDbCgs) {
    const parsed = parseDbName(dbCg.name)
    if (!parsed.grade || !parsed.major) continue

    // Find matching canonical keys
    const candidates = refClasses.filter(rc =>
      rc.grade === parsed.grade && rc.majorName === parsed.major && rc.classNumber === parsed.classNum && (rc.direction || '') === (parsed.direction || '')
    )

    if (candidates.length === 1) {
      cgMappings.set(dbCg.id, { canonicalKey: candidates[0].canonicalKey, refClass: candidates[0], matchType: 'EXACT' })
      if (!selectedCanonicalRows.has(candidates[0].canonicalKey) && dbCg.semesterId === 4) {
        selectedCanonicalRows.set(candidates[0].canonicalKey, dbCg.id)
      }
    } else if (candidates.length > 1) {
      // Ambiguous — pick first (三年制 preferred)
      const sorted = candidates.sort((a, b) => {
        if (a.schoolLength === '三年制' && b.schoolLength !== '三年制') return -1
        if (b.schoolLength === '三年制' && a.schoolLength !== '三年制') return 1
        return 0
      })
      cgMappings.set(dbCg.id, { canonicalKey: sorted[0].canonicalKey, refClass: sorted[0], matchType: 'AMBIGUOUS_RESOLVED' })
      if (!selectedCanonicalRows.has(sorted[0].canonicalKey) && dbCg.semesterId === 4) {
        selectedCanonicalRows.set(sorted[0].canonicalKey, dbCg.id)
      }
    }
  }

  // Find canonical keys that need NEW DB rows
  const existingCanonicalKeys = new Set([...cgMappings.values()].map(m => m.canonicalKey))
  for (const rc of refClasses) {
    if (!existingCanonicalKeys.has(rc.canonicalKey)) {
      toCreate.push({ refClass: rc, existingDbCgId: null })
    }
  }

  // Fill remaining selectedCanonicalRows with any DB CG that matches
  for (const rc of refClasses) {
    if (!selectedCanonicalRows.has(rc.canonicalKey)) {
      for (const dbCg of allDbCgs) {
        const mapping = cgMappings.get(dbCg.id)
        if (mapping && mapping.canonicalKey === rc.canonicalKey) {
          selectedCanonicalRows.set(rc.canonicalKey, dbCg.id)
          break
        }
      }
    }
  }

  console.log(`  CGs with canonical match: ${cgMappings.size}`)
  console.log(`  Canonical rows selected (existing): ${selectedCanonicalRows.size}`)
  console.log(`  Canonical keys needing new DB row: ${toCreate.length}`)

  // Classify extras
  const extras = allDbCgs.filter(cg => !cgMappings.has(cg.id))
  const sem1Cgs = extras.filter(cg => cg.semesterId === 1)
  const sem4Extras = extras.filter(cg => cg.semesterId === 4 && cgMappings.has(cg.id) === false)

  console.log(`  Extra CGs (no canonical match): ${extras.length}`)

  // ── Execute transaction ────────────────────────────────────────────────
  console.log('[5/6] Executing...')

  let createdCount = 0, updatedCount = 0, deactivatedCount = 0, migratedCount = 0

  if (isDryRun) {
    createdCount = toCreate.length
    updatedCount = selectedCanonicalRows.size
    deactivatedCount = extras.length
    migratedCount = decisions.totalTtcDecisions - decisions.ttcDecisions.filter((d: any) => d.source === 'c3-plan' && d.toClassGroupId !== null).length + decisions.ttcDecisions.filter((d: any) => d.source === 'c3-plan' && d.toClassGroupId !== null).length
    // Recount properly
    migratedCount = decisions.ttcDecisions.filter((d: any) => d.targetCanonicalKey !== null).length
    const alreadyOnCanonical = decisions.ttcDecisions.filter((d: any) => d.source === 'c3-plan' && d.toClassGroupId !== null).length
    // TTCs that need classGroupId change = all with targetCanonicalKey (user + composite) + plan migrations where target differs
    migratedCount = decisions.ttcDecisions.filter((d: any) => d.targetCanonicalKey !== null || (d.source === 'c3-plan' && d.toClassGroupId !== null)).length

    console.log('  [DRY-RUN] No DB writes')
    console.log(`  planned: create=${createdCount} update=${updatedCount} deactivate=${deactivatedCount} migrate=${migratedCount}`)
  } else {
    // Real transaction
    const result = await prisma.$transaction(async (tx) => {
      // Step 1: Create or claim missing canonical ClassGroups
      const created: number[] = []
      for (const item of toCreate) {
        const rc = item.refClass
        // Use upsert: if a CG with same (semesterId=4, name) exists, claim it; otherwise create new
        const upserted = await tx.classGroup.upsert({
          where: { semesterId_name: { semesterId: 4, name: rc.plannedName } },
          update: {
            canonicalKey: rc.canonicalKey,
            grade: rc.grade,
            majorName: rc.majorName,
            classNumber: rc.classNumber,
            educationLevel: rc.educationLevel,
            schoolLength: rc.schoolLength,
            sourceType: 'reference_xlsx',
            isActive: true,
          },
          create: {
            name: rc.plannedName,
            studentCount: rc.studentCount,
            semesterId: 4,
            canonicalKey: rc.canonicalKey,
            grade: rc.grade,
            majorName: rc.majorName,
            classNumber: rc.classNumber,
            educationLevel: rc.educationLevel,
            schoolLength: rc.schoolLength,
            sourceType: 'reference_xlsx',
            isActive: true,
          }
        })
        created.push(upserted.id)
        // Update selectedCanonicalRows to use the new ID
        selectedCanonicalRows.set(rc.canonicalKey, upserted.id)
      }
      // Rebuild protected rows AFTER upsert (IDs may have changed)
      const protectedRows = new Set(selectedCanonicalRows.values())

      // Step 2: Update existing canonical ClassGroups with fields
      let updated = 0
      for (const [ck, dbId] of selectedCanonicalRows) {
        const ref = refClasses.find(r => r.canonicalKey === ck)
        if (!ref) continue
        await tx.classGroup.update({
          where: { id: dbId },
          data: {
            canonicalKey: ref.canonicalKey,
            grade: ref.grade,
            majorName: ref.majorName,
            classNumber: ref.classNumber,
            educationLevel: ref.educationLevel,
            schoolLength: ref.schoolLength,
            sourceType: 'reference_xlsx',
            isActive: true,
          }
        })
        updated++
      }

      // Step 3: Migrate ALL TTCs from CGs that will be deactivated
      // This covers both extras (no canonical match) AND matched non-selected CGs (duplicates)
      let orphanMigrated = 0
      // Collect all CG IDs that will be deactivated
      const toDeactivateIds = new Set<number>()
      for (const extra of extras) {
        if (protectedRows.has(extra.id)) continue
        toDeactivateIds.add(extra.id)
      }
      for (const [cgId] of cgMappings) {
        if (protectedRows.has(cgId)) continue
        toDeactivateIds.add(cgId)
      }
      // Migrate TTCs from each deactivating CG
      for (const cgId of toDeactivateIds) {
        const orphanTtcs = await tx.teachingTaskClass.findMany({ where: { classGroupId: cgId } })
        if (orphanTtcs.length === 0) continue
        // Find closest canonical by grade+major
        const cg = allDbCgs.find(c => c.id === cgId)
        if (!cg) continue
        const parsed = parseDbName(cg.name)
        if (!parsed.grade || !parsed.major) continue
        let bestCk: string | null = null
        for (const rc of refClasses) {
          if (rc.grade === parsed.grade && rc.majorName === parsed.major) {
            bestCk = rc.canonicalKey
            break
          }
        }
        if (!bestCk) continue
        const targetId = selectedCanonicalRows.get(bestCk)
        if (!targetId) continue
        for (const ttc of orphanTtcs) {
          if (ttc.classGroupId !== targetId) {
            // Check if link already exists at target (same teachingTaskId + classGroupId)
            const existing = await tx.teachingTaskClass.findUnique({
              where: { teachingTaskId_classGroupId: { teachingTaskId: ttc.teachingTaskId, classGroupId: targetId } }
            })
            if (existing) {
              // Link already exists — delete the source TTC (duplicate)
              await tx.teachingTaskClass.delete({ where: { id: ttc.id } })
            } else {
              await tx.teachingTaskClass.update({ where: { id: ttc.id }, data: { classGroupId: targetId } })
            }
            orphanMigrated++
          }
        }
      }
      console.log('  orphan TTCs migrated:', orphanMigrated)

      // Step 4: Deactivate extras AND non-selected matched CGs (protect selected canonical rows)
      let deactivated = 0
      // First: deactivate extras (no canonical match)
      for (const extra of extras) {
        if (protectedRows.has(extra.id)) continue
        let srcType = 'legacy_extra'
        if (extra.name.includes('+') || extra.name.includes('、')) srcType = 'composite'
        else if (extra.semesterId === 1) srcType = 'semester_copy'
        else srcType = 'import_artifact'
        await tx.classGroup.update({ where: { id: extra.id }, data: { isActive: false, sourceType: srcType } })
        deactivated++
      }
      // Second: deactivate matched CGs that are NOT the selected canonical row (duplicates across semesters)
      for (const [cgId, mapping] of cgMappings) {
        if (protectedRows.has(cgId)) continue // is the selected canonical row
        const cg = allDbCgs.find(c => c.id === cgId)
        if (!cg || !cg.isActive) continue
        await tx.classGroup.update({ where: { id: cgId }, data: { isActive: false, sourceType: 'semester_copy' } })
        deactivated++
      }

      // Step 5: Migrate TeachingTaskClass refs
      let migrated = 0
      for (const d of decisions.ttcDecisions) {
        if (d.targetCanonicalKey) {
          // TTC needs migration to a specific canonical key
          const targetDbId = selectedCanonicalRows.get(d.targetCanonicalKey)
          if (!targetDbId) {
            console.error(`ERROR: no canonical row for key ${d.targetCanonicalKey} (TTC#${d.ttcId})`)
            throw new Error(`Missing canonical row for ${d.targetCanonicalKey}`)
          }
          // Find current TTC
          const currentTtc = await tx.teachingTaskClass.findUnique({ where: { id: d.ttcId } })
          if (!currentTtc) {
            console.error(`ERROR: TTC#${d.ttcId} not found`)
            throw new Error(`TTC#${d.ttcId} not found`)
          }
          if (currentTtc.classGroupId !== targetDbId) {
            const existing = await tx.teachingTaskClass.findUnique({
              where: { teachingTaskId_classGroupId: { teachingTaskId: currentTtc.teachingTaskId, classGroupId: targetDbId } }
            })
            if (existing) {
              await tx.teachingTaskClass.delete({ where: { id: d.ttcId } })
            } else {
              await tx.teachingTaskClass.update({ where: { id: d.ttcId }, data: { classGroupId: targetDbId } })
            }
            migrated++
          }
        } else if (d.source === 'c3-plan' && d.toClassGroupId !== null) {
          // Plan migration
          const currentTtc = await tx.teachingTaskClass.findUnique({ where: { id: d.ttcId } })
          if (currentTtc && currentTtc.classGroupId !== d.toClassGroupId) {
            const existing = await tx.teachingTaskClass.findUnique({
              where: { teachingTaskId_classGroupId: { teachingTaskId: currentTtc.teachingTaskId, classGroupId: d.toClassGroupId } }
            })
            if (existing) {
              await tx.teachingTaskClass.delete({ where: { id: d.ttcId } })
            } else {
              await tx.teachingTaskClass.update({ where: { id: d.ttcId }, data: { classGroupId: d.toClassGroupId } })
            }
            migrated++
          }
        }
      }

      return { created: created.length, updated, deactivated, migrated }
    })

    createdCount = result.created
    updatedCount = result.updated
    deactivatedCount = result.deactivated
    migratedCount = result.migrated

    console.log('  [WRITE] Transaction committed')
    console.log(`  created=${createdCount} updated=${updatedCount} deactivated=${deactivatedCount} migrated=${migratedCount}`)
  }

  // ── Post-apply verification ────────────────────────────────────────────
  console.log('[6/6] Post-apply verification...')

  const postTotal = await prisma.classGroup.count()
  const postActive = await prisma.classGroup.count({ where: { isActive: true } })
  const postInactive = await prisma.classGroup.count({ where: { isActive: false } })
  const postRefXlsx = await prisma.classGroup.count({ where: { sourceType: 'reference_xlsx' } })
  const postCkNonNull = await prisma.classGroup.count({ where: { canonicalKey: { not: null } } })
  const postCkDuplicate = await prisma.$queryRawUnsafe('SELECT COUNT(*) as cnt FROM (SELECT "canonicalKey" FROM "ClassGroup" WHERE "canonicalKey" IS NOT NULL GROUP BY "canonicalKey" HAVING COUNT(*) > 1)')
  const postTtc = await prisma.teachingTaskClass.count()
  const postTtcInactive = await prisma.$queryRawUnsafe('SELECT COUNT(*) as cnt FROM "TeachingTaskClass" ttc JOIN "ClassGroup" cg ON ttc."classGroupId" = cg.id WHERE cg."isActive" = false')
  const postCourse = await prisma.course.count()
  const postTeacher = await prisma.teacher.count()

  console.log('')
  console.log('=== POST-APPLY INVARIANTS ===')
  console.log(`ClassGroup total: ${postTotal} (expected 503)`)
  console.log(`active reference_xlsx: ${postRefXlsx} (expected 227)`)
  console.log(`inactive extras: ${postInactive} (expected 250)`)
  console.log(`canonicalKey non-null: ${postCkNonNull} (expected 227)`)
  console.log(`canonicalKey duplicates: ${postCkDuplicate[0]?.cnt || 0} (expected 0)`)
  console.log(`TTC total: ${postTtc} (expected 446)`)
  console.log(`TTC refs to inactive CG: ${postTtcInactive[0]?.cnt || 0} (expected 0)`)
  console.log(`Course: ${postCourse} (expected 104)`)
  console.log(`Teacher: ${postTeacher} (expected 427)`)

  const invariantsPass = postTotal === (isDryRun ? 442 : 503) &&
    postRefXlsx === (isDryRun ? 0 : 227) &&
    postCkNonNull === (isDryRun ? 0 : 227) &&
    (postCkDuplicate[0]?.cnt || 0) === 0 &&
    postTtcInactive[0]?.cnt === 0

  console.log(`\nINVARIANTS: ${invariantsPass ? 'PASS' : 'FAIL'}`)

  console.log('\n=== DONE ===')
  await prisma.$disconnect()
}

main().catch(e => { console.error('FATAL:', e); process.exit(1) })
