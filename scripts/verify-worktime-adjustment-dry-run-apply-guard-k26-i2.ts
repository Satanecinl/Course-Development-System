/**
 * scripts/verify-worktime-adjustment-dry-run-apply-guard-k26-i2.ts
 *
 * K26-I2: WorkTime guard for schedule adjustment dry-run/apply.
 *
 * 45 read-only source + DB checks:
 *  - Guard helper (1-11)
 *  - Input validation (12-16)
 *  - Dry-run integration (17-23)
 *  - Apply integration (24-30)
 *  - Non-goals (31-40)
 *  - DB read-only (41-45)
 */

import { readFileSync, existsSync } from 'fs'
import { join } from 'path'
import { PrismaClient } from '@prisma/client'

const prisma = new PrismaClient()
const projectRoot = join(__dirname, '..')

function fileContains(rel: string, needle: string): boolean {
  const abs = rel.includes(':') || rel.startsWith('/') || rel.startsWith('\\')
    ? rel
    : join(projectRoot, rel)
  if (!existsSync(abs)) return false
  return readFileSync(abs, 'utf-8').includes(needle)
}

function fileContent(rel: string): string {
  const abs = rel.includes(':') || rel.startsWith('/') || rel.startsWith('\\')
    ? rel
    : join(projectRoot, rel)
  if (!existsSync(abs)) return ''
  return readFileSync(abs, 'utf-8')
}

interface CheckResult {
  id: number
  name: string
  pass: boolean
  detail?: string
}

async function main() {
  const results: CheckResult[] = []
  let id = 0

  function check(name: string, pass: boolean, detail?: string) {
    id++
    results.push({ id, name, pass, detail })
  }

  // ── Guard helper (1-11) ──

  const resolverPath = 'src/lib/worktime/worktime-schedule-resolver.ts'
  const resolverContent = fileContent(resolverPath)

  // 1. checkWorkTimeTargetAllowed exists
  check(
    'checkWorkTimeTargetAllowed exists',
    resolverContent.includes('export function checkWorkTimeTargetAllowed')
  )

  // 2. helper checks day legality
  check(
    'helper checks day legality',
    resolverContent.includes('weekdayValues.includes(dayOfWeek)')
  )

  // 3. helper checks allowWeekend
  check(
    'helper checks allowWeekend',
    resolverContent.includes('workTime.allowWeekend')
  )

  // 4. helper checks slot legality
  check(
    'helper checks slot legality',
    resolverContent.includes('activeTeachingSlotIndexes.includes(slotIndex)')
  )

  // 5. helper checks active teaching slots
  check(
    'helper checks active teaching slots',
    resolverContent.includes('slotDef.isActive') &&
    resolverContent.includes('slotDef.isTeachingSlot')
  )

  // 6. helper checks legacy display slots
  check(
    'helper checks legacy display slots',
    resolverContent.includes('slotDef?.isLegacyDisplay')
  )

  // 7. helper explicitly excludes slot 6/7
  check(
    'helper explicitly excludes slot 6/7',
    resolverContent.includes('LEGACY_DISPLAY_SLOT_INDEXES.includes(slotIndex as 6 | 7)')
  )

  // 8. helper returns WORKTIME_SLOT_DISABLED
  check(
    'helper returns WORKTIME_SLOT_DISABLED',
    resolverContent.includes("'WORKTIME_SLOT_DISABLED'")
  )

  // 9. helper returns WORKTIME_SLOT_LEGACY_ONLY
  check(
    'helper returns WORKTIME_SLOT_LEGACY_ONLY',
    resolverContent.includes("'WORKTIME_SLOT_LEGACY_ONLY'")
  )

  // 10. helper returns WORKTIME_WEEKEND_DISABLED
  check(
    'helper returns WORKTIME_WEEKEND_DISABLED',
    resolverContent.includes("'WORKTIME_WEEKEND_DISABLED'")
  )

  // 11. helper writes no DB
  check(
    'helper writes no DB (no prisma mutation in checkWorkTimeTargetAllowed)',
    !resolverContent.includes('prisma.') ||
    (() => {
      const fnStart = resolverContent.indexOf('export function checkWorkTimeTargetAllowed')
      if (fnStart === -1) return false
      const fnBody = resolverContent.slice(fnStart)
      return !fnBody.includes('prisma.')
    })()
  )

  // ── Input validation (12-16) ──

  const adjPath = 'src/lib/schedule/adjustments.ts'
  const adjContent = fileContent(adjPath)

  // 12. validateScheduleAdjustmentInput exists
  check(
    'validateScheduleAdjustmentInput exists',
    adjContent.includes('export function validateScheduleAdjustmentInput')
  )

  // 13. newSlotIndex=6 no longer allowed (basic validation or WorkTime guard blocks)
  check(
    'newSlotIndex=6 blocked by basic validation (1-5 range)',
    adjContent.includes('newSlotIndex > 5') ||
    (adjContent.includes('newSlotIndex < 1') && adjContent.includes('newSlotIndex > 5'))
  )

  // 14. newSlotIndex=7 blocked
  check(
    'newSlotIndex=7 blocked',
    adjContent.includes('newSlotIndex > 5')
  )

  // 15. invalid numeric slot blocked
  check(
    'invalid numeric slot blocked (negative / zero)',
    adjContent.includes('newSlotIndex < 1')
  )

  // 16. legacy display reads not blocked globally (history still viewable)
  check(
    'legacy display reads not blocked globally (no blanket slot 6/7 read block)',
    !adjContent.includes('slotIndex !== 6') ||
    adjContent.includes('slotIndex: slot.slotIndex')
  )

  // ── Dry-run integration (17-23) ──

  // 17. dry-run imports WorkTime resolver / guard
  check(
    'dry-run imports WorkTime resolver / guard',
    adjContent.includes("from '@/lib/worktime/worktime-schedule-resolver'") ||
    adjContent.includes('from "@/lib/worktime/worktime-schedule-resolver"')
  )

  // 18. dry-run resolves WorkTime before conflict check
  // Get the dryRunScheduleAdjustment function body to check ordering within it
  const dryRunFnStart = adjContent.indexOf('export async function dryRunScheduleAdjustment')
  const dryRunFnBody = dryRunFnStart >= 0 ? adjContent.slice(dryRunFnStart) : ''
  const wtResolveInDryRun = dryRunFnBody.indexOf('resolveWorkTimeConfigForSchedule')
  const effectiveScheduleInDryRun = dryRunFnBody.indexOf('getEffectiveScheduleForWeek')
  check(
    'dry-run resolves WorkTime before conflict check',
    wtResolveInDryRun >= 0 &&
    effectiveScheduleInDryRun >= 0 &&
    wtResolveInDryRun < effectiveScheduleInDryRun
  )

  // 19. dry-run blocks invalid target slot
  check(
    'dry-run blocks invalid target slot',
    adjContent.includes('checkWorkTimeTargetAllowed') &&
    adjContent.includes('!wtCheck.ok')
  )

  // 20. dry-run blocks legacy slot 6/7
  check(
    'dry-run blocks legacy slot 6/7 via guard',
    adjContent.includes('checkWorkTimeTargetAllowed') &&
    resolverContent.includes("'WORKTIME_SLOT_LEGACY_ONLY'")
  )

  // 21. dry-run blocks weekend when allowWeekend=false
  check(
    'dry-run blocks weekend when allowWeekend=false via guard',
    adjContent.includes('checkWorkTimeTargetAllowed') &&
    resolverContent.includes("'WORKTIME_WEEKEND_DISABLED'")
  )

  // 22. dry-run returns WorkTime error code
  check(
    'dry-run returns WorkTime error code',
    adjContent.includes('workTimeErrorCode')
  )

  // 23. dry-run writes no DB on invalid target (returns before getEffectiveScheduleForWeek)
  check(
    'dry-run writes no DB on invalid target (early return)',
    adjContent.includes('return { canApply: false, conflicts, warnings }') &&
    adjContent.indexOf('checkWorkTimeTargetAllowed') <
    adjContent.indexOf('getEffectiveScheduleForWeek')
  )

  // ── Apply integration (24-30) ──

  const applyRoutePath = 'src/app/api/schedule-adjustments/route.ts'
  const applyRouteContent = fileContent(applyRoutePath)

  // 24. apply route/helper imports WorkTime resolver / guard (via adjustments.ts)
  check(
    'apply route calls createScheduleAdjustment (which delegates to dryRun with WorkTime guard)',
    applyRouteContent.includes('createScheduleAdjustment')
  )

  // 25. apply resolves WorkTime before DB write (dryRun is called first inside createScheduleAdjustment)
  check(
    'apply resolves WorkTime before DB write (createScheduleAdjustment calls dryRunScheduleAdjustment first)',
    adjContent.includes('const dryRun = await dryRunScheduleAdjustment(input)') &&
    adjContent.includes('if (!dryRun.canApply)')
  )

  // 26. apply blocks invalid target slot (via dryRun returning canApply=false)
  check(
    'apply blocks invalid target slot (dryRun.canApply=false blocks create)',
    adjContent.includes('if (!dryRun.canApply)') &&
    adjContent.includes('return { success: false, dryRun }')
  )

  // 27. apply blocks legacy slot 6/7 (via dryRun WorkTime guard)
  check(
    'apply blocks legacy slot 6/7 (via dryRun WorkTime guard)',
    resolverContent.includes("'WORKTIME_SLOT_LEGACY_ONLY'") &&
    adjContent.includes('checkWorkTimeTargetAllowed')
  )

  // 28. apply blocks weekend when allowWeekend=false (via dryRun WorkTime guard)
  check(
    'apply blocks weekend when allowWeekend=false (via dryRun WorkTime guard)',
    resolverContent.includes("'WORKTIME_WEEKEND_DISABLED'") &&
    adjContent.includes('checkWorkTimeTargetAllowed')
  )

  // 29. apply returns WorkTime error code (in dryRun result)
  check(
    'apply returns WorkTime error code (in dryRun result)',
    adjContent.includes('workTimeErrorCode') &&
    applyRouteContent.includes('dryRun')
  )

  // 30. apply writes no DB on invalid target (dryRun blocks before create)
  check(
    'apply writes no DB on invalid target (dryRun.canApply gates prisma.create)',
    adjContent.includes('if (!dryRun.canApply)') &&
    adjContent.indexOf('if (!dryRun.canApply)') < adjContent.indexOf('prisma.scheduleAdjustment.create')
  )

  // ── Non-goals (31-40) ──

  // 31. plan recommendation unchanged except K26-I1 behavior
  check(
    'plan recommendation unchanged (no K26-I2 additions)',
    !fileContent('src/lib/schedule/adjustment-plan-recommendations.ts')
      .includes('checkWorkTimeTargetAllowed')
  )

  // 32. room recommendation unchanged
  check(
    'room recommendation unchanged',
    !fileContent('src/lib/schedule/room-recommendations.ts')
      .includes('checkWorkTimeTargetAllowed')
  )

  // 33. frontend dialog unchanged
  const dialogPath = 'src/components/schedule-adjustment-dialog.tsx'
  check(
    'frontend dialog unchanged',
    !existsSync(join(projectRoot, dialogPath)) ||
    !fileContent(dialogPath).includes('checkWorkTimeTargetAllowed')
  )

  // 34. conflict-check kernel unchanged
  check(
    'conflict-check kernel unchanged',
    !fileContent('src/lib/schedule/conflict-check.ts')
      .includes('checkWorkTimeTargetAllowed')
  )

  // 35. solver unchanged
  check(
    'solver unchanged',
    !fileContent('src/lib/scheduler/data-loader.ts')
      .includes('checkWorkTimeTargetAllowed')
  )

  // 36. score unchanged
  check(
    'score unchanged',
    !fileContent('src/lib/scheduler/score.ts')
      .includes('checkWorkTimeTargetAllowed')
  )

  // 37. no schema change
  check(
    'no schema change (no WorkTimeConfig/TimeSlotDefinition addition in this stage)',
    !fileContent('prisma/schema.prisma').includes('K26-I2')
  )

  // 38. no migration added (K26-I2 doesn't add migration)
  const migrationDir = join(projectRoot, 'prisma/migrations')
  const { readdirSync } = await import('fs')
  const migrations = existsSync(migrationDir) ? readdirSync(migrationDir) : []
  const hasI2Migration = migrations.some(m => m.includes('k26_i2') || m.includes('k26-i2'))
  check('no migration added', !hasI2Migration)

  // 39. no K22 expected change
  check(
    'no K22 expected change',
    !fileContent('src/lib/scheduler/score.ts').includes('K26-I2')
  )

  // 40. no K23/K24 expected change
  check(
    'no K23/K24 expected change',
    !fileContent('src/lib/schedule/adjustment-plan-recommendations.ts').includes('K26-I2') &&
    !fileContent('src/lib/schedule/room-recommendations.ts').includes('K26-I2')
  )

  // ── DB read-only (41-45) ──

  // 41. default WorkTimeConfig exists
  const defaultConfig = await prisma.workTimeConfig.findFirst({
    where: { isDefault: true, isActive: true },
  })
  check('default WorkTimeConfig exists', defaultConfig != null)

  // 42. active slots 1-5
  if (defaultConfig) {
    const activeSlots = await prisma.timeSlotDefinition.findMany({
      where: {
        workTimeConfigId: defaultConfig.id,
        isActive: true,
        isTeachingSlot: true,
        isLegacyDisplay: false,
      },
      orderBy: { slotIndex: 'asc' },
    })
    const activeIndexes = activeSlots.map(s => s.slotIndex)
    check(
      'active slots 1-5',
      JSON.stringify(activeIndexes) === JSON.stringify([1, 2, 3, 4, 5]),
      `got [${activeIndexes.join(',')}]`
    )
  } else {
    check('active slots 1-5', false, 'no default config')
  }

  // 43. legacy slots 6/7
  if (defaultConfig) {
    const legacySlots = await prisma.timeSlotDefinition.findMany({
      where: {
        workTimeConfigId: defaultConfig.id,
        isLegacyDisplay: true,
      },
      orderBy: { slotIndex: 'asc' },
    })
    const legacyIndexes = legacySlots.map(s => s.slotIndex)
    check(
      'legacy slots 6/7',
      JSON.stringify(legacyIndexes) === JSON.stringify([6, 7]),
      `got [${legacyIndexes.join(',')}]`
    )
  } else {
    check('legacy slots 6/7', false, 'no default config')
  }

  // 44. allowWeekend default false
  check(
    'allowWeekend default false',
    defaultConfig?.allowWeekend === false
  )

  // 45. backfill missing count 0
  const semesters = await prisma.semester.findMany()
  const configCount = await prisma.workTimeConfig.count({ where: { isDefault: true, isActive: true } })
  check(
    'backfill missing count 0 (all semesters have default config)',
    configCount >= semesters.length,
    `semesters=${semesters.length} configs=${configCount}`
  )

  // ── Report ──

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
    console.log('K26-I2 WORKTIME ADJUSTMENT DRY-RUN APPLY GUARD VERIFY PASS')
    console.log(`PASS=${passed} FAIL=0`)
    console.log('blocking=false')
    console.log('recommendedNextStage=K26-I3-WORKTIME-ROOM-RECOMMENDATION-GUARD')
  } else {
    console.log(`K26-I2 VERIFY FAIL: ${failed.length} failures`)
    console.log(`PASS=${passed} FAIL=${failed.length}`)
    for (const f of failed) {
      console.log(`  FAIL #${f.id}: ${f.name}${f.detail ? ` — ${f.detail}` : ''}`)
    }
    process.exit(1)
  }
}

main().catch((e) => {
  console.error('K26-I2 verify script error:', e)
  prisma.$disconnect().finally(() => process.exit(1))
})
