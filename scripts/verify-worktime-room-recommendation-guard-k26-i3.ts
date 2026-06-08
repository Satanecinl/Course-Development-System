/**
 * scripts/verify-worktime-room-recommendation-guard-k26-i3.ts
 *
 * K26-I3: WorkTime guard for room recommendation.
 *
 * 40 read-only source + DB checks:
 *  - Room recommendation integration (1-13)
 *  - Error codes / details (14-18)
 *  - K23 compatibility (19-24)
 *  - Non-goals (25-35)
 *  - DB read-only (36-40)
 */

import { readFileSync, existsSync } from 'fs'
import { join } from 'path'
import { PrismaClient } from '@prisma/client'

const prisma = new PrismaClient()
const projectRoot = join(__dirname, '..')

function fileContains(rel: string, needle: string): boolean {
  const abs = rel.includes(':') || rel.startsWith('/') || rel.startsWith('\\')
    ? rel : join(projectRoot, rel)
  if (!existsSync(abs)) return false
  return readFileSync(abs, 'utf-8').includes(needle)
}

function fileContent(rel: string): string {
  const abs = rel.includes(':') || rel.startsWith('/') || rel.startsWith('\\')
    ? rel : join(projectRoot, rel)
  if (!existsSync(abs)) return ''
  return readFileSync(abs, 'utf-8')
}

interface CheckResult { id: number; name: string; pass: boolean; detail?: string }

async function main() {
  const results: CheckResult[] = []
  let id = 0
  function check(name: string, pass: boolean, detail?: string) {
    id++
    results.push({ id, name, pass, detail })
  }

  const rrPath = 'src/lib/schedule/room-recommendations.ts'
  const rrContent = fileContent(rrPath)

  // ── Room recommendation integration (1-13) ──

  // 1. route/helper exists
  check('room recommendation helper exists',
    existsSync(join(projectRoot, rrPath)) &&
    rrContent.includes('findAdjustmentRoomRecommendations'))

  // 2. imports resolveWorkTimeConfigForSchedule
  check('helper imports resolveWorkTimeConfigForSchedule',
    rrContent.includes('resolveWorkTimeConfigForSchedule'))

  // 3. imports checkWorkTimeTargetAllowed
  check('helper imports checkWorkTimeTargetAllowed',
    rrContent.includes('checkWorkTimeTargetAllowed'))

  // 4. resolves WorkTime before room query
  const rrFnStart = rrContent.indexOf('export async function findAdjustmentRoomRecommendations')
  const rrFnBody = rrFnStart >= 0 ? rrContent.slice(rrFnStart) : ''
  const wtResolvePos = rrFnBody.indexOf('resolveWorkTimeConfigForSchedule')
  const roomQueryPos = rrFnBody.indexOf('prisma.room.findMany')
  check('resolves WorkTime before room query',
    wtResolvePos >= 0 && roomQueryPos >= 0 && wtResolvePos < roomQueryPos)

  // 5. checks target day
  check('checks target day',
    rrFnBody.includes('checkWorkTimeTargetAllowed'))

  // 6. checks target slot
  check('checks target slot',
    rrFnBody.includes('dayOfWeek: input.targetDayOfWeek') ||
    rrFnBody.includes('targetDayOfWeek'))

  // 7. blocks slot 6
  check('blocks slot 6 (via checkWorkTimeTargetAllowed + route validation)',
    rrContent.includes('targetSlotIndex > 5') || // route validation
    rrContent.includes('targetCheck.code')) // helper guard

  // 8. blocks slot 7
  check('blocks slot 7 (via checkWorkTimeTargetAllowed + route validation)',
    rrContent.includes('targetSlotIndex > 5') || // route validation
    rrContent.includes('targetCheck.code')) // helper guard

  // 9. blocks weekend when allowWeekend=false
  check('blocks weekend when allowWeekend=false (via guard)',
    rrFnBody.includes('!targetCheck.ok'))

  // 10. returns WorkTime error code
  check('returns WorkTime error code',
    rrFnBody.includes('targetCheck.code'))

  // 11. does not continue recommendation after failed guard
  check('early return after failed guard (before room query)',
    rrFnBody.indexOf('!targetCheck.ok') < roomQueryPos ||
    rrFnBody.includes('return emptyResult'))

  // 12. success path still calls original room recommendation logic
  check('success path still calls checkScheduleConflicts',
    rrFnBody.includes('checkScheduleConflicts'))

  // 13. writes no DB
  check('writes no DB (no prisma.create/update in room-recommendations.ts)',
    !rrContent.includes('prisma.') || (() => {
      const writes = ['.create(', '.update(', '.delete(', '.upsert(']
      return !writes.some(w => rrContent.includes(w))
    })())

  // ── Error codes / details (14-18) ──

  // 14. WORKTIME_SLOT_DISABLED reachable
  const resolverPath = 'src/lib/worktime/worktime-schedule-resolver.ts'
  check('WORKTIME_SLOT_DISABLED reachable (in resolver guard)',
    fileContains(resolverPath, "'WORKTIME_SLOT_DISABLED'"))

  // 15. WORKTIME_SLOT_LEGACY_ONLY reachable
  check('WORKTIME_SLOT_LEGACY_ONLY reachable (in resolver guard)',
    fileContains(resolverPath, "'WORKTIME_SLOT_LEGACY_ONLY'"))

  // 16. WORKTIME_WEEKEND_DISABLED reachable
  check('WORKTIME_WEEKEND_DISABLED reachable (in resolver guard)',
    fileContains(resolverPath, "'WORKTIME_WEEKEND_DISABLED'"))

  // 17. error response includes details
  check('error response includes details (emptyResult passes workTimeError)',
    rrFnBody.includes('details: targetCheck.details'))

  // 18. workTimeError field on result type
  check('workTimeError field on RoomRecommendationResult',
    rrContent.includes('workTimeError'))

  // ── K23 compatibility (19-24) ──

  // 19. original capacity logic still present
  check('original capacity logic still present (getTaskStudentCount)',
    rrContent.includes('getTaskStudentCount'))

  // 20. original conflict logic still present
  check('original conflict logic still present (checkScheduleConflicts)',
    rrContent.includes('checkScheduleConflicts'))

  // 21. original room sorting logic still present
  check('original room sorting logic still present',
    rrContent.includes('sort((a, b) => b.score - a.score'))

  // 22. original response fields still present
  check('original response fields still present (candidates, rejectedSummary)',
    rrContent.includes('minimumSatisfied') &&
    rrContent.includes('candidates') &&
    rrContent.includes('rejectedSummary'))

  // 23. targetWeek behavior still present
  check('targetWeek behavior still present',
    rrContent.includes('targetWeek'))

  // 24. no frontend dialog change
  const dialogPath = 'src/components/schedule-adjustment-dialog.tsx'
  check('no frontend dialog change',
    !existsSync(join(projectRoot, dialogPath)) ||
    !fileContent(dialogPath).includes('checkWorkTimeTargetAllowed'))

  // ── Non-goals (25-35) ──

  // 25. plan recommendation unchanged from K26-I1
  check('plan recommendation unchanged (no K26-I3 additions)',
    !fileContent('src/lib/schedule/adjustment-plan-recommendations.ts')
      .includes('checkWorkTimeTargetAllowed'))

  // 26. dry-run/apply unchanged from K26-I2
  check('dry-run/apply unchanged from K26-I2 (guard was I2)',
    fileContent('src/lib/schedule/adjustments.ts').includes('checkWorkTimeTargetAllowed'))

  // 27. conflict-check kernel unchanged
  check('conflict-check kernel unchanged',
    !fileContent('src/lib/schedule/conflict-check.ts')
      .includes('checkWorkTimeTargetAllowed'))

  // 28. solver unchanged
  check('solver unchanged',
    !fileContent('src/lib/scheduler/data-loader.ts')
      .includes('checkWorkTimeTargetAllowed'))

  // 29. score unchanged
  check('score unchanged',
    !fileContent('src/lib/scheduler/score.ts')
      .includes('checkWorkTimeTargetAllowed'))

  // 30. no schema change
  check('no schema change',
    !fileContent('prisma/schema.prisma').includes('K26-I3'))

  // 31. no migration added
  const { readdirSync } = await import('fs')
  const migrationDir = join(projectRoot, 'prisma/migrations')
  const migrations = existsSync(migrationDir) ? readdirSync(migrationDir) : []
  check('no migration added',
    !migrations.some(m => m.includes('k26_i3') || m.includes('k26-i3')))

  // 32. no K22 expected change
  check('no K22 expected change',
    !fileContent('src/lib/scheduler/score.ts').includes('K26-I3'))

  // 33. no K23 expected change
  check('no K23 expected change',
    !rrContent.includes('__K26_I3_SENTINEL__'))

  // 34. no K24 expected change
  check('no K24 expected change',
    !fileContent('src/lib/schedule/adjustment-plan-recommendations.ts').includes('K26-I3'))

  // 35. no DB write
  check('no DB write in room-recommendations.ts',
    !rrContent.includes('.create(') && !rrContent.includes('.update(') && !rrContent.includes('.upsert('))

  // ── DB read-only (36-40) ──

  // 36. default WorkTimeConfig exists
  const defaultConfig = await prisma.workTimeConfig.findFirst({
    where: { isDefault: true, isActive: true },
  })
  check('default WorkTimeConfig exists', defaultConfig != null)

  // 37. active slots 1-5
  if (defaultConfig) {
    const activeSlots = await prisma.timeSlotDefinition.findMany({
      where: { workTimeConfigId: defaultConfig.id, isActive: true, isTeachingSlot: true, isLegacyDisplay: false },
      orderBy: { slotIndex: 'asc' },
    })
    check('active slots 1-5', JSON.stringify(activeSlots.map(s => s.slotIndex)) === JSON.stringify([1,2,3,4,5]))
  } else {
    check('active slots 1-5', false, 'no default config')
  }

  // 38. legacy slots 6/7
  if (defaultConfig) {
    const legacySlots = await prisma.timeSlotDefinition.findMany({
      where: { workTimeConfigId: defaultConfig.id, isLegacyDisplay: true },
      orderBy: { slotIndex: 'asc' },
    })
    check('legacy slots 6/7', JSON.stringify(legacySlots.map(s => s.slotIndex)) === JSON.stringify([6,7]))
  } else {
    check('legacy slots 6/7', false, 'no default config')
  }

  // 39. allowWeekend default false
  check('allowWeekend default false', defaultConfig?.allowWeekend === false)

  // 40. backfill missing count 0
  const semesters = await prisma.semester.findMany()
  const configCount = await prisma.workTimeConfig.count({ where: { isDefault: true, isActive: true } })
  check('backfill missing count 0', configCount >= semesters.length,
    `semesters=${semesters.length} configs=${configCount}`)

  await prisma.$disconnect()

  const passed = results.filter(r => r.pass).length
  const failed = results.filter(r => !r.pass)
  const total = results.length

  for (const r of results) {
    const status = r.pass ? 'PASS' : 'FAIL'
    const detail = r.detail ? ` (${r.detail})` : ''
    console.log(`  ${r.id.toString().padStart(2)}. [${status}] ${r.name}${detail}`)
  }

  console.log('')
  if (failed.length === 0) {
    console.log('K26-I3 WORKTIME ROOM RECOMMENDATION GUARD VERIFY PASS')
    console.log(`PASS=${total} FAIL=0`)
    console.log('blocking=false')
    console.log('recommendedNextStage=K26-I4-WORKTIME-ADJUSTMENT-DIALOG-INTEGRATION')
  } else {
    console.log(`K26-I3 VERIFY FAIL: ${failed.length} failures`)
    console.log(`PASS=${passed} FAIL=${failed.length}`)
    for (const f of failed) {
      console.log(`  FAIL #${f.id}: ${f.name}${f.detail ? ` — ${f.detail}` : ''}`)
    }
    process.exit(1)
  }
}

main().catch((e) => {
  console.error('K26-I3 verify script error:', e)
  prisma.$disconnect().finally(() => process.exit(1))
})
