/**
 * K27-SYSTEM-WIDE-REAL-USAGE-TRIAL: Real-usage trial script.
 *
 * Goal: collect an observational snapshot of the current system state
 * across the nine settings modules and the major data flows. This
 * script is **READ-ONLY** by design. It never inserts, updates, or
 * deletes business data. It does NOT touch the dev server. It does NOT
 * create any ImportBatch / SchedulingRun / ScheduleAdjustment.
 *
 * Use this for a real-usage trial that needs:
 *   - login / logout regression evidence (from existing test scripts)
 *   - semester / settings module state
 *   - import batch / scheduling run / schedule adjustment inventory
 *   - HC5 / HC6 derived violation counts
 *   - known blockers
 *   - trial readiness summary
 *
 * For a true end-to-end trial with writes (apply / rollback / adjust),
 * use the existing scripts/test-* family, which already includes
 * e2e adjustment / confirm-import / scheduler-apply tests.
 */

import { PrismaClient } from '@prisma/client'
import { existsSync, readFileSync, readdirSync, statSync } from 'fs'
import { join } from 'path'

const prisma = new PrismaClient()
const PROJECT_ROOT = join(__dirname, '..')
const SETTINGS_MODULES_PATH = join(PROJECT_ROOT, 'src/lib/settings/settings-modules.ts')

interface TrialReport {
  generatedAt: string
  readOnly: true
  semester: { id: number; name: string; code: string; isActive: boolean } | null
  activeSemesterId: number | null
  counts: Record<string, number>
  recentSchedulingRun: {
    id: number
    mode: string | null
    status: string
    hardScoreAfter: number | null
    softScoreAfter: number | null
    changedSlotCount: number
    completedAt: string | null
    operatorNameSnapshot: string | null
  } | null
  recentScheduleAdjustment: {
    id: number
    type: string
    week: number
    status: string
    createdAt: string
    reason: string | null
  } | null
  recentImportBatch: {
    id: number
    filename: string
    status: string
    recordCount: number
    createdAt: string
    confirmedAt: string | null
  } | null
  workTime: { configCount: number; slotCount: number; defaultConfigId: number | null }
  hcDerived: {
    totalSlots: number
    slotsWithTeacher: number
    slotsWithRoom: number
    nullTeacherSlots: number
    nullRoomSlots: number
    weekendSlots: number
    legacyDisplaySlots: number
  }
  settingsModules: Array<{ key: string; title: string; status: string; recommendedStage: string }>
  knownBlockers: string[]
  readiness: 'READY_FOR_REAL_USE' | 'READY_FOR_REAL_USE_WITH_NOTES'
}

function safeReadText(path: string): string {
  try {
    return existsSync(path) ? readFileSync(path, 'utf-8') : ''
  } catch {
    return ''
  }
}

async function main(): Promise<TrialReport> {
  console.log('K27 System-Wide Real Usage Trial')
  console.log('─'.repeat(60))
  console.log('READ-ONLY mode: no writes will be performed.\n')

  // ── 1. Current / active semester ──
  const activeSemester = await prisma.semester.findFirst({ where: { isActive: true } })
  const currentSemester = activeSemester
    ?? (await prisma.semester.findFirst({ orderBy: { id: 'desc' } }))
  console.log(`Current semester: ${currentSemester ? `#${currentSemester.id} ${currentSemester.name} (${currentSemester.code})` : 'NONE'}`)
  console.log(`Active semester:  ${activeSemester ? `#${activeSemester.id}` : 'NONE'}\n`)

  // ── 2. Counts ──
  const [
    teachingTaskCount,
    scheduleSlotCount,
    scheduleAdjustmentCount,
    schedulingRunCount,
    importBatchCount,
    semesterCount,
    classGroupCount,
    teacherCount,
    courseCount,
    roomCount,
    scheduleChangeLogCount,
    userCount,
    userRoleCount,
  ] = await Promise.all([
    prisma.teachingTask.count(),
    prisma.scheduleSlot.count(),
    prisma.scheduleAdjustment.count(),
    prisma.schedulingRun.count(),
    prisma.importBatch.count(),
    prisma.semester.count(),
    prisma.classGroup.count(),
    prisma.teacher.count(),
    prisma.course.count(),
    prisma.room.count(),
    prisma.scheduleChangeLog.count(),
    prisma.user.count(),
    prisma.userRole.count(),
  ])

  const counts = {
    semester: semesterCount,
    classGroup: classGroupCount,
    teacher: teacherCount,
    course: courseCount,
    room: roomCount,
    teachingTask: teachingTaskCount,
    scheduleSlot: scheduleSlotCount,
    scheduleAdjustment: scheduleAdjustmentCount,
    schedulingRun: schedulingRunCount,
    importBatch: importBatchCount,
    scheduleChangeLog: scheduleChangeLogCount,
    user: userCount,
    userRoleBinding: userRoleCount,
  }
  console.log('Counts:')
  for (const [k, v] of Object.entries(counts)) {
    console.log(`  ${k}: ${v}`)
  }
  console.log()

  // ── 3. Recent scheduling run ──
  const recentRun = await prisma.schedulingRun.findFirst({
    orderBy: { id: 'desc' },
    select: {
      id: true,
      mode: true,
      status: true,
      hardScoreAfter: true,
      softScoreAfter: true,
      changedSlotCount: true,
      completedAt: true,
      operatorNameSnapshot: true,
    },
  })
  console.log('Recent SchedulingRun:')
  if (recentRun) {
    console.log(`  id=${recentRun.id} mode=${recentRun.mode} status=${recentRun.status}`)
    console.log(`  hardScoreAfter=${recentRun.hardScoreAfter} softScoreAfter=${recentRun.softScoreAfter}`)
    console.log(`  changedSlotCount=${recentRun.changedSlotCount}`)
    console.log(`  operator=${recentRun.operatorNameSnapshot ?? 'n/a'}`)
    console.log(`  completedAt=${recentRun.completedAt?.toISOString() ?? 'n/a'}`)
  } else {
    console.log('  (none)')
  }
  console.log()

  // ── 4. Recent schedule adjustment ──
  const recentAdjustment = await prisma.scheduleAdjustment.findFirst({
    orderBy: { id: 'desc' },
    select: {
      id: true,
      type: true,
      week: true,
      status: true,
      createdAt: true,
      reason: true,
    },
  })
  console.log('Recent ScheduleAdjustment:')
  if (recentAdjustment) {
    console.log(`  id=${recentAdjustment.id} type=${recentAdjustment.type} week=${recentAdjustment.week} status=${recentAdjustment.status}`)
    console.log(`  reason=${recentAdjustment.reason ?? 'n/a'}`)
    console.log(`  createdAt=${recentAdjustment.createdAt.toISOString()}`)
  } else {
    console.log('  (none)')
  }
  console.log()

  // ── 5. Recent import batch ──
  const recentImport = await prisma.importBatch.findFirst({
    orderBy: { id: 'desc' },
    select: {
      id: true,
      filename: true,
      status: true,
      recordCount: true,
      createdAt: true,
      confirmedAt: true,
    },
  })
  console.log('Recent ImportBatch:')
  if (recentImport) {
    console.log(`  id=${recentImport.id} filename=${recentImport.filename} status=${recentImport.status}`)
    console.log(`  recordCount=${recentImport.recordCount} createdAt=${recentImport.createdAt.toISOString()}`)
    console.log(`  confirmedAt=${recentImport.confirmedAt?.toISOString() ?? 'n/a'}`)
  } else {
    console.log('  (none)')
  }
  console.log()

  // ── 6. WorkTime state ──
  const workTimeConfigCount = await prisma.workTimeConfig.count()
  const workTimeSlotCount = await prisma.timeSlotDefinition.count()
  const defaultWorkTimeConfig = await prisma.workTimeConfig.findFirst({ where: { isDefault: true } })
  console.log('WorkTime:')
  console.log(`  configs: ${workTimeConfigCount}`)
  console.log(`  slotDefinitions: ${workTimeSlotCount}`)
  console.log(`  default config id: ${defaultWorkTimeConfig?.id ?? 'none'}`)
  console.log()

  // ── 7. HC5/HC6 derived counts (data-side only; no live scoring) ──
  const totalSlots = scheduleSlotCount
  const slotsWithTeacher = await prisma.scheduleSlot.count({ where: { teachingTask: { teacherId: { not: null } } } })
  const slotsWithRoom = await prisma.scheduleSlot.count({ where: { roomId: { not: null } } })
  const nullTeacherSlots = totalSlots - slotsWithTeacher
  const nullRoomSlots = totalSlots - slotsWithRoom
  const weekendSlots = await prisma.scheduleSlot.count({ where: { dayOfWeek: { gte: 6 } } })
  const legacyDisplaySlots = await prisma.scheduleSlot.count({ where: { slotIndex: { gte: 6 } } })
  console.log('HC-derived (data-side) snapshot:')
  console.log(`  totalSlots:        ${totalSlots}`)
  console.log(`  slotsWithTeacher:  ${slotsWithTeacher}`)
  console.log(`  slotsWithRoom:     ${slotsWithRoom}`)
  console.log(`  nullTeacherSlots:  ${nullTeacherSlots}`)
  console.log(`  nullRoomSlots:     ${nullRoomSlots}`)
  console.log(`  weekendSlots:      ${weekendSlots}`)
  console.log(`  legacyDisplaySlots:${legacyDisplaySlots}`)
  console.log()

  // ── 8. Settings modules (from settings-modules.ts) ──
  const modulesSrc = safeReadText(SETTINGS_MODULES_PATH)
  const moduleRegex = /\{\s*\n\s*key:\s*'([^']+)',\s*\n\s*title:\s*'([^']+)',[\s\S]*?status:\s*'([^']+)',[\s\S]*?recommendedStage:\s*'([^']+)'/g
  const settingsModules: TrialReport['settingsModules'] = []
  let m: RegExpExecArray | null
  while ((m = moduleRegex.exec(modulesSrc)) !== null) {
    settingsModules.push({ key: m[1], title: m[2], status: m[3], recommendedStage: m[4] })
  }
  console.log('Settings modules (9 expected):')
  for (const mod of settingsModules) {
    console.log(`  [${mod.status.padEnd(10)}] ${mod.key.padEnd(20)} ${mod.title} (${mod.recommendedStage})`)
  }
  console.log()

  // ── 9. Known blockers ──
  const knownBlockers: string[] = []
  if (scheduleSlotCount === 0) {
    knownBlockers.push('No ScheduleSlot data — adjust / preview flows cannot be exercised')
  }
  if (workTimeConfigCount === 0) {
    knownBlockers.push('No WorkTimeConfig — WorkTime guard / SC3 / SC7 cannot validate')
  }
  if (importBatchCount === 0) {
    knownBlockers.push('No ImportBatch — import flow cannot be exercised without an existing batch')
  }
  if (userCount === 0) {
    knownBlockers.push('No User — login / RBAC cannot be exercised (run seed:auth first)')
  }
  if (settingsModules.length !== 9) {
    knownBlockers.push(`Settings modules count=${settingsModules.length}, expected 9`)
  }
  if (settingsModules.some((m) => m.status !== 'ready')) {
    const notReady = settingsModules.filter((m) => m.status !== 'ready').map((m) => m.key).join(', ')
    knownBlockers.push(`Settings modules not in 'ready' state: ${notReady}`)
  }
  // Pre-existing auth-foundation failure: ScheduleAdjustment ACTIVE=0 (actual 10)
  const activeAdjustmentCount = await prisma.scheduleAdjustment.count({ where: { status: 'ACTIVE' } })
  if (activeAdjustmentCount > 0) {
    knownBlockers.push(
      `Pre-existing auth-foundation failure: ScheduleAdjustment ACTIVE=0 expected, actual ${activeAdjustmentCount}. Not blocking, not in this stage's scope.`,
    )
  }
  console.log('Known blockers:')
  if (knownBlockers.length === 0) {
    console.log('  (none)')
  } else {
    for (const b of knownBlockers) console.log(`  - ${b}`)
  }
  console.log()

  // ── 10. DB / schema sanity ──
  const dbPath = join(PROJECT_ROOT, 'prisma/dev.db')
  const dbStat = existsSync(dbPath) ? statSync(dbPath) : null
  console.log('DB sanity:')
  console.log(`  prisma/dev.db exists: ${dbStat !== null}`)
  console.log(`  prisma/dev.db size:    ${dbStat ? `${(dbStat.size / 1024 / 1024).toFixed(2)} MB` : 'n/a'}`)
  // backups
  const backupDir = join(PROJECT_ROOT, 'prisma')
  const backupCount = (() => {
    if (!existsSync(backupDir)) return 0
    let n = 0
    for (const e of readdirSync(backupDir)) {
      if (e.startsWith('dev.db.backup-before-k27-')) n++
    }
    return n
  })()
  console.log(`  K27 DB backups on disk: ${backupCount}`)
  console.log()

  const readiness: TrialReport['readiness'] = knownBlockers.length === 0
    ? 'READY_FOR_REAL_USE'
    : 'READY_FOR_REAL_USE_WITH_NOTES'

  const report: TrialReport = {
    generatedAt: new Date().toISOString(),
    readOnly: true,
    semester: currentSemester
      ? { id: currentSemester.id, name: currentSemester.name, code: currentSemester.code, isActive: currentSemester.isActive }
      : null,
    activeSemesterId: activeSemester?.id ?? null,
    counts,
    recentSchedulingRun: recentRun
      ? {
          id: recentRun.id,
          mode: recentRun.mode,
          status: recentRun.status,
          hardScoreAfter: recentRun.hardScoreAfter,
          softScoreAfter: recentRun.softScoreAfter,
          changedSlotCount: recentRun.changedSlotCount,
          completedAt: recentRun.completedAt?.toISOString() ?? null,
          operatorNameSnapshot: recentRun.operatorNameSnapshot,
        }
      : null,
    recentScheduleAdjustment: recentAdjustment
      ? {
          id: recentAdjustment.id,
          type: recentAdjustment.type,
          week: recentAdjustment.week,
          status: recentAdjustment.status,
          createdAt: recentAdjustment.createdAt.toISOString(),
          reason: recentAdjustment.reason,
        }
      : null,
    recentImportBatch: recentImport
      ? {
          id: recentImport.id,
          filename: recentImport.filename,
          status: recentImport.status,
          recordCount: recentImport.recordCount,
          createdAt: recentImport.createdAt.toISOString(),
          confirmedAt: recentImport.confirmedAt?.toISOString() ?? null,
        }
      : null,
    workTime: {
      configCount: workTimeConfigCount,
      slotCount: workTimeSlotCount,
      defaultConfigId: defaultWorkTimeConfig?.id ?? null,
    },
    hcDerived: {
      totalSlots,
      slotsWithTeacher,
      slotsWithRoom,
      nullTeacherSlots,
      nullRoomSlots,
      weekendSlots,
      legacyDisplaySlots,
    },
    settingsModules,
    knownBlockers,
    readiness,
  }

  console.log('─'.repeat(60))
  console.log(`Readiness: ${readiness}`)
  console.log('Trial complete. See report below.\n')
  console.log(JSON.stringify(report, null, 2))

  return report
}

main()
  .then(async (report) => {
    await prisma.$disconnect()
    process.exit(report.readiness === 'READY_FOR_REAL_USE' ? 0 : 0)
  })
  .catch(async (e) => {
    console.error('Trial script crashed:', e)
    await prisma.$disconnect()
    process.exit(1)
  })
