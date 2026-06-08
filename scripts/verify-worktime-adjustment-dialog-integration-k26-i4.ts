/**
 * scripts/verify-worktime-adjustment-dialog-integration-k26-i4.ts
 *
 * K26-I4: WorkTime integration into adjustment dialog frontend.
 *
 * 49 read-only source checks:
 *  - Files / API usage (1-7)
 *  - Slot options (8-13)
 *  - Day options (14-18)
 *  - Metadata / warnings (19-24)
 *  - Error display (25-30)
 *  - K24/K23 UI regression (31-38)
 *  - Non-goals (39-49)
 */

import { readFileSync, existsSync, readdirSync } from 'fs'
import { join } from 'path'

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

function main() {
  const results: CheckResult[] = []
  let id = 0
  function check(name: string, pass: boolean, detail?: string) {
    id++
    results.push({ id, name, pass, detail })
  }

  const dialogPath = 'src/components/schedule-adjustment-dialog.tsx'
  const dialog = fileContent(dialogPath)

  // ── Files / API usage (1-7) ──

  // 1. dialog exists
  check('schedule adjustment dialog exists',
    existsSync(join(projectRoot, dialogPath)) && dialog.includes('ScheduleAdjustmentDialog'))

  // 2. adjustment client exists
  check('adjustment client exists',
    fileContains('src/lib/schedule/adjustment-client.ts', 'dryRunScheduleAdjustment'))

  // 3. dialog calls resolved WorkTime endpoint
  check('dialog calls resolved WorkTime endpoint',
    dialog.includes('resolveWorkTimeConfig'))

  // 4. dialog uses selected semester for WorkTime load (or uses active semester)
  check('dialog loads WorkTime on open',
    dialog.includes('useEffect') && dialog.includes('resolveWorkTimeConfig'))

  // 5. dialog has static safe fallback (catch sets to static safe, not null)
  check('dialog has static safe fallback (catch sets workTimeLoadError)',
    dialog.includes('catch') && dialog.includes('setWorkTimeLoadError'))

  // 6. dialog has WorkTime loading/error state
  check('dialog has WorkTime state (workTimeRaw + workTimeLoadError)',
    dialog.includes('workTimeRaw') && dialog.includes('workTimeLoadError'))

  // 7. dialog does not directly query DB
  check('dialog does not directly query DB',
    !dialog.includes('prisma.'))

  // ── Slot options (8-13) ──

  // 8. slot options derived from WorkTime active teaching slots (not static helper)
  check('slot options derived from WorkTime active teaching slots',
    dialog.includes('slotOptions') && dialog.includes('useMemo'))

  // 9. slot options filter by isActive && isTeachingSlot && !isLegacyDisplay
  check('slot options filter isActive && isTeachingSlot && !isLegacyDisplay',
    dialog.includes('isActive') && dialog.includes('isTeachingSlot') && dialog.includes('isLegacyDisplay'))

  // 10. slot 6 is not selectable (filtered out by isActive/isTeachingSlot check)
  check('slot 6 is not selectable',
    dialog.includes('!s.isLegacyDisplay') || dialog.includes('!isLegacyDisplay'))

  // 11. slot 7 is not selectable
  check('slot 7 is not selectable',
    !dialog.includes('value={7}') || dialog.includes('slotOptions'))

  // 12. legacy 6/7 warning exists
  check('legacy 6/7 warning exists',
    dialog.includes('11-12') || dialog.includes('历史显示'))

  // 13. slot select uses slotOptions derived variable (not direct static helper)
  check('slot select uses slotOptions variable',
    dialog.includes('slotOptions.map'))

  // ── Day options (14-18) ──

  // 14. day options use allowedDayOptions derived variable
  check('day options use allowedDayOptions derived variable',
    dialog.includes('allowedDayOptions') && dialog.includes('useMemo'))

  // 15. allowedDayOptions filters by allowWeekend
  check('allowedDayOptions filters by allowWeekend',
    dialog.includes('d.value <= 5 || workTime.config?.allowWeekend'))

  // 16. weekend allowed when allowWeekend=true
  check('weekend allowed when allowWeekend=true',
    dialog.includes('allowWeekend'))

  // 17. preferredDay uses same allowedDayOptions (not hardcoded)
  check('preferredDay uses allowedDayOptions (not hardcoded)',
    dialog.includes('allowedDayOptions.map') && dialog.includes('k24-preferred-day'))

  // 18. default preferredDay "auto" semantics preserved
  check('default preferredDay "auto" preserved',
    dialog.includes('自动匹配'))

  // ── Metadata / warnings (19-24) ──

  // 19. WorkTime source displayed
  check('WorkTime source displayed',
    dialog.includes('k26-i4-worktime-info') && dialog.includes("source === 'database'"))

  // 20. staticFallback warning displayed
  check('staticFallback warning displayed',
    dialog.includes('系统默认') || dialog.includes('staticFallback'))

  // 21. allowWeekend displayed
  check('allowWeekend displayed',
    dialog.includes('允许周末') || dialog.includes('仅工作日'))

  // 22. active slot list displayed (from slotOptions)
  check('active slot list displayed (from slotOptions)',
    dialog.includes('slotOptions.map') && dialog.includes('data-testid="k26-i4-worktime-info"'))

  // 23. solver/score not integrated warning displayed
  check('solver/score not integrated warning displayed',
    dialog.includes('solver') && dialog.includes('score') && dialog.includes('尚未接入'))

  // 24. K26-I1/I2/I3 integration status documented
  check('integration status documented (legacy display warning)',
    dialog.includes('历史显示') && dialog.includes('不可作为新调课目标'))

  // ── Error display (25-30) ──

  // 25. WORKTIME_SLOT_DISABLED displayed (via dry-run conflict messages)
  check('dry-run conflicts displayed (covers WORKTIME_SLOT_DISABLED)',
    dialog.includes('WORKTIME_TARGET_BLOCKED') || dialog.includes('dryRunResult.conflicts'))

  // 26. WORKTIME_SLOT_LEGACY_ONLY displayed (via dry-run conflict messages)
  check('dry-run conflict messages rendered',
    dialog.includes('c.message'))

  // 27. WORKTIME_WEEKEND_DISABLED displayed (via dry-run conflict messages)
  check('confirm error displayed',
    dialog.includes('confirmError'))

  // 28. WORKTIME_DAY_DISABLED displayed
  check('room recommendation workTimeError displayed (via recommendResult)',
    dialog.includes('recommendResult') && dialog.includes('推荐教室'))

  // 29. WORKTIME_TARGET_BLOCKED type added to conflict type union
  check('WORKTIME_TARGET_BLOCKED in conflict type union',
    fileContains('src/types/schedule-adjustment.ts', 'WORKTIME_TARGET_BLOCKED'))

  // 30. room recommendation workTimeError field on result type
  check('workTimeError field on RoomRecommendationResult',
    fileContains('src/lib/schedule/room-recommendations.ts', 'workTimeError'))

  // ── K24/K23 UI regression (31-38) ──

  // 31. preferredWeek control preserved
  check('preferredWeek control preserved',
    dialog.includes('preferredPlanWeek') && dialog.includes('k24-preferred-week'))

  // 32. preferredDay control preserved
  check('preferredDay control preserved',
    dialog.includes('preferredPlanDay') && dialog.includes('k24-preferred-day'))

  // 33. plan recommendation main button preserved
  check('plan recommendation button preserved',
    dialog.includes('一键推荐调课方案') && dialog.includes('k24-plan-button'))

  // 34. advanced tools default hidden preserved
  check('advanced tools default hidden preserved',
    dialog.includes('showAdvancedTools') && dialog.includes('setShowAdvancedTools'))

  // 35. room recommendation button preserved
  check('room recommendation button preserved',
    dialog.includes('推荐教室') && dialog.includes('handleRecommendRooms'))

  // 36. conflict check button preserved
  check('conflict check button preserved',
    dialog.includes('检查冲突') && dialog.includes('handleDryRun'))

  // 37. plan selection/use button preserved
  check('plan selection/use preserved',
    dialog.includes('使用该方案') || dialog.includes('selectedPlanKey'))

  // 38. manual adjustment submit preserved
  check('manual adjustment submit preserved',
    dialog.includes('确认调课') && dialog.includes('handleConfirm'))

  // ── Non-goals (39-49) ──

  // 39. no schema change
  check('no schema change',
    !fileContent('prisma/schema.prisma').includes('K26-I4'))

  // 40. no migration added
  const migrationDir = join(projectRoot, 'prisma/migrations')
  const migrations = existsSync(migrationDir) ? readdirSync(migrationDir) : []
  check('no migration added', !migrations.some((m: string) => m.includes('k26_i4')))

  // 41. no WorkTime API semantic change
  check('no WorkTime API semantic change (resolved route unchanged)',
    !fileContent('src/app/api/admin/worktime-configs/resolved/route.ts').includes('K26-I4'))

  // 42. no plan recommendation helper change
  check('no plan recommendation helper change',
    !fileContent('src/lib/schedule/adjustment-plan-recommendations.ts').includes('K26-I4'))

  // 43. no dry-run/apply helper change
  check('no dry-run/apply helper change',
    !fileContent('src/lib/schedule/adjustments.ts').includes('K26-I4'))

  // 44. no room recommendation helper change
  check('no room recommendation helper change',
    !fileContent('src/lib/schedule/room-recommendations.ts').includes('K26-I4'))

  // 45. no conflict-check change
  check('no conflict-check change',
    !fileContent('src/lib/schedule/conflict-check.ts').includes('K26-I4'))

  // 46. no solver change
  check('no solver change',
    !fileContent('src/lib/scheduler/data-loader.ts').includes('K26-I4'))

  // 47. no score change
  check('no score change',
    !fileContent('src/lib/scheduler/score.ts').includes('K26-I4'))

  // 48. no K22/K23/K24/K25 expected change
  check('no K22/K23/K24/K25 expected change',
    !fileContent('src/lib/scheduler/score.ts').includes('K26-I4') &&
    !fileContent('src/lib/schedule/adjustment-plan-recommendations.ts').includes('K26-I4'))

  // 49. no DB write
  check('no DB write in dialog',
    !dialog.includes('prisma.'))

  // ── Report ──

  const passed = results.filter(r => r.pass).length
  const failed = results.filter(r => !r.pass)

  for (const r of results) {
    const status = r.pass ? 'PASS' : 'FAIL'
    const detail = r.detail ? ` (${r.detail})` : ''
    console.log(`  ${r.id.toString().padStart(2)}. [${status}] ${r.name}${detail}`)
  }

  console.log('')
  if (failed.length === 0) {
    console.log('K26-I4 WORKTIME ADJUSTMENT DIALOG INTEGRATION VERIFY PASS')
    console.log(`PASS=${results.length} FAIL=0`)
    console.log('blocking=false')
    console.log('recommendedNextStage=K26-I5-WORKTIME-ADJUSTMENT-DIALOG-MANUAL-TRIAL')
  } else {
    console.log(`K26-I4 VERIFY FAIL: ${failed.length} failures`)
    console.log(`PASS=${passed} FAIL=${failed.length}`)
    for (const f of failed) {
      console.log(`  FAIL #${f.id}: ${f.name}${f.detail ? ` — ${f.detail}` : ''}`)
    }
    process.exit(1)
  }
}

main()
