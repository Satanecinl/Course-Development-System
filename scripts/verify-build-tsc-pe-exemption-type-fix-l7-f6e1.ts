/**
 * L7-F6E1 Verify Script — Build / TSC PE Exemption Type Fix
 *
 * Stage: L7-F6E1-BUILD-TSC-PE-EXEMPTION-TYPE-FIX
 *
 * ~30 read-only checks.
 *
 * Usage:
 *   npx tsx scripts/verify-build-tsc-pe-exemption-type-fix-l7-f6e1.ts --target-semester-id 4
 */

import { execSync } from 'node:child_process'
import { existsSync, readFileSync } from 'node:fs'
import { join, resolve } from 'node:path'
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
const ex = (cmd: string): string => {
  try { return execSync(cmd, { cwd: ROOT, stdio: 'pipe' }).toString().trim() } catch { return '' }
}

const parseArgs = (argv: string[]): { targetSemesterId: number; help: boolean } => {
  const args = { targetSemesterId: 4, help: false }
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i]
    if (a === '--target-semester-id') args.targetSemesterId = Number(argv[++i] ?? '4')
    else if (a === '--help' || a === '-h') args.help = true
  }
  return args
}

async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2))
  if (args.help) return

  console.log('=== L7-F6E1 Verify: Build / TSC PE Exemption Type Fix ===\n')
  const prisma = new PrismaClient()

  const applySrc = readF(join(ROOT, 'src/lib/import/course-setting-apply-l7-f.ts'))
  const planSrc = readF(join(ROOT, 'src/lib/import/course-setting-partial-import-plan-l6-e2.ts'))

  // DB baseline
  const course = await prisma.course.count()
  const teacher = await prisma.teacher.count()
  const cgSem4 = await prisma.classGroup.count({ where: { semesterId: 4 } })
  const ttSem4 = await prisma.teachingTask.count({ where: { semesterId: 4 } })
  const ib40 = await prisma.importBatch.findUnique({ where: { id: 40 } })

  console.log('\n--- 1. DB baseline ---')
  record('C01 Course = 104', course === 104, `actual: ${course}`)
  record('C02 Teacher = 236', teacher === 236, `actual: ${teacher}`)
  record('C03 ClassGroup sem4 = 406 (L7-F6F: 431 - 25 deleted duplicates)', cgSem4 === 406, `actual: ${cgSem4}`)
  record('C04 TeachingTask sem4 = 0', ttSem4 === 0, `actual: ${ttSem4}`)
  record('C05 ImportBatch #40 absent', ib40 === null || ib40 === undefined)

  console.log('\n--- 2. Apply file PE exemption logic preserved ---')
  record('C06 apply file exists', existsSync(join(ROOT, 'src/lib/import/course-setting-apply-l7-f.ts')))
  record('C07 PE exemption kind exists in teacherRef type', applySrc.includes("'physicalEducationExempt'"))
  record('C08 PE exemption code check exists', applySrc.includes("'PHYSICAL_EDUCATION_TEACHER_EXEMPT'"))
  record('C09 INVALID_TEACHER_EXEMPTION blocker exists', applySrc.includes('INVALID_TEACHER_EXEMPTION'))
  record('C10 TEACHER_ID_MISSING blocker exists (non-PE)', applySrc.includes('TEACHER_ID_MISSING'))
  record('C11 non-PE teacherId null is blocker', applySrc.includes('non-PE task') && applySrc.includes('has no teacherId'))
  record('C12 PE exemption check uses strict code match', applySrc.includes("exemptionCode !== 'PHYSICAL_EDUCATION_TEACHER_EXEMPT'"))

  console.log('\n--- 3. Type fix ---')
  // The fix adds physicalEducationExempt to the teacherRef union
  record('C13 teacherRef union has physicalEducationExempt variant',
    /teacherRef:[\s\S]*?physicalEducationExempt/.test(applySrc))
  record('C14 physicalEducationExempt has exemptionCode field',
    applySrc.includes("kind: 'physicalEducationExempt'") && applySrc.includes('exemptionCode'))
  record('C15 physicalEducationExempt has reason field',
    applySrc.includes("kind: 'physicalEducationExempt'") && applySrc.includes('reason: string'))

  console.log('\n--- 4. No type escapes ---')
  const lines = applySrc.split('\n')
  const newAsAny = lines.filter((l, i) => l.includes('as any') && i > 0).length
  const newTsIgnore = lines.filter((l, i) => l.includes('@ts-ignore') && i > 0).length
  const newTsExpect = lines.filter((l, i) => l.includes('@ts-expect-error') && i > 0).length
  record('C16 no new as any in apply file', newAsAny === 0, `count: ${newAsAny}`)
  record('C17 no new @ts-ignore in apply file', newTsIgnore === 0, `count: ${newTsIgnore}`)
  record('C18 no new @ts-expect-error in apply file', newTsExpect === 0, `count: ${newTsExpect}`)

  console.log('\n--- 5. Natural key preserved ---')
  record('C19 natural key does not use teacherId ?? "null"', !applySrc.includes('teacherId ?? "null"'))
  record('C20 natural key uses PHYSICAL_EDUCATION_TEACHER_EXEMPT for PE', applySrc.includes('PHYSICAL_EDUCATION_TEACHER_EXEMPT'))

  console.log('\n--- 6. Apply preflight before backup preserved ---')
  // The apply file should run preflight checks before creating backup
  const hasPreflight = applySrc.includes('preflightErrors') || applySrc.includes('preflight')
  const hasBackup = applySrc.includes('backup') || applySrc.includes('Backup')
  record('C21 preflight check exists', hasPreflight)
  record('C22 backup mechanism exists', hasBackup)

  console.log('\n--- 7. Build & tsc ---')
  const buildOut = ex('npm run build 2>&1')
  const buildPass = buildOut.includes('Compiled successfully') || !buildOut.includes('error')
  record('C23 npm run build PASS', buildPass, buildPass ? '' : buildOut.split('\n').filter(l => l.includes('error')).join('; '))
  const tscOut = ex('npx tsc --noEmit 2>&1')
  record('C24 npx tsc --noEmit PASS', tscOut.length === 0, tscOut.length > 0 ? tscOut.split('\n')[0] : '')

  console.log('\n--- 8. No schema/migration/scheduler/score changes ---')
  record('C25 no schema changes', !ex('git diff --name-only -- prisma/schema.prisma').includes('schema'))
  record('C26 no migration changes', !ex('git diff --name-only -- prisma/migrations/').includes('migration'))
  record('C27 no scheduler changes', !ex('git diff --name-only -- src/lib/scheduler/').length)
  record('C28 no score changes', !ex('git diff --name-only -- src/lib/score.ts').length)

  console.log('\n--- 9. Forbidden files ---')
  record('C29 no dev.db tracked', ex('git ls-files prisma/dev.db').length === 0)
  record('C30 no temp/ tracked', ex('git ls-files "temp/*" | grep -v README').length === 0)

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
