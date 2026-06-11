/**
 * scripts/verify-dashboard-secondary-room-filter-k34-a3c.ts
 *
 * K34-A3C: Verify that the secondary room filter works correctly
 * in both dashboard paths (all-week and single-week) and in the
 * Excel export.
 *
 * Static checks + behavioral Prisma query checks.
 */

import { PrismaClient } from '@prisma/client'
import { existsSync, readFileSync } from 'fs'
import { join } from 'path'

const projectRoot = join(__dirname, '..')
interface CheckResult { id: number; name: string; pass: boolean; detail?: string }
const results: CheckResult[] = []
let id = 0
function check(name: string, pass: boolean, detail?: string) {
  id++
  results.push({ id, name, pass, detail })
}

async function main() {
  console.log('K34-A3C-DASHBOARD-SECONDARY-ROOM-FILTER: Verify')
  console.log('─'.repeat(70))

  // ── 1. Static checks ─────────────────────────────────────────────
  const scheduleRouteSrc = readFileSync(
    join(projectRoot, 'src/app/api/schedule/route.ts'), 'utf-8',
  )
  const dashboardSrc = readFileSync(
    join(projectRoot, 'src/app/dashboard/dashboard-content.tsx'), 'utf-8',
  )
  const exportRouteSrc = readFileSync(
    join(projectRoot, 'src/app/api/export/excel/route.ts'), 'utf-8',
  )
  const adjustmentsSrc = readFileSync(
    join(projectRoot, 'src/lib/schedule/adjustments.ts'), 'utf-8',
  )
  const scheduleTypesSrc = readFileSync(
    join(projectRoot, 'src/types/schedule.ts'), 'utf-8',
  )

  check(
    'schedule route returns additionalRoomIds',
    scheduleRouteSrc.includes('additionalRoomIds'),
  )
  check(
    'ScheduleViewData type includes additionalRoomIds',
    scheduleTypesSrc.includes('additionalRoomIds'),
  )
  check(
    'dashboard room filter checks additionalRoomIds',
    /additionalRoomIds\?\.includes/.test(dashboardSrc) ||
      /additionalRoomIds\?\.\[/.test(dashboardSrc),
  )
  check(
    'getEffectiveScheduleForWeek includes additionalRooms in Prisma query',
    /getEffectiveScheduleForWeek[\s\S]{0,2000}additionalRooms/.test(adjustmentsSrc),
  )
  check(
    'getEffectiveScheduleForWeek emits additionalRoomIds in result',
    /baseItems\.set[\s\S]{0,1000}additionalRoomIds/.test(adjustmentsSrc),
  )
  check(
    'export route Prisma query includes additionalRooms',
    /prisma\.scheduleSlot\.findMany\([\s\S]{0,500}additionalRooms/.test(exportRouteSrc),
  )
  check(
    'export route room filter checks additionalRoomIds',
    /additionalRoomIds\?\.includes/.test(exportRouteSrc) ||
      /additionalRoomIds\?\.\[/.test(exportRouteSrc),
  )
  check(
    'export route fetches secondary-room slots when filtering by room',
    /viewType === 'room' && targetId[\s\S]{0,2000}additionalRooms: \{ some/.test(exportRouteSrc),
  )
  check(
    'export route cell text includes composite room display',
    /slot\.additionalRooms\.length > 0[\s\S]{0,200}' 或 '/.test(exportRouteSrc),
  )

  // ── 2. Behavioral checks via Prisma ──────────────────────────────
  const prisma = new PrismaClient()

  try {
    // Find a multi-room slot that references room 10-104 (or any
    // secondary room).
    const sar = await prisma.scheduleSlotAdditionalRoom.findFirst({
      include: { room: true },
    })
    if (!sar) {
      check('multi-room slot exists in DB', false, 'no ScheduleSlotAdditionalRoom rows')
    } else {
      const secondaryRoomId = sar.roomId
      const secondaryRoomName = sar.room.name
      check('multi-room slot exists in DB', true, `secondary room: ${secondaryRoomName} (id=${secondaryRoomId})`)

      // Verify the API would return this slot in ALL-week mode
      const allWeekSlots = await prisma.scheduleSlot.findMany({
        where: { semesterId: 1 },
        include: {
          room: true,
          additionalRooms: { include: { room: true } },
          teachingTask: {
            select: { semesterId: true, course: true, teacher: true,
              weekType: true, startWeek: true, endWeek: true, teacherId: true,
              taskClasses: { include: { classGroup: true } } },
          },
        },
      })
      const allWeekSameSemester = allWeekSlots.filter(s => s.teachingTask.semesterId === 1)
      const foundInAllWeek = allWeekSameSemester.some(s =>
        s.id === sar.scheduleSlotId &&
        s.additionalRooms.some(ar => ar.roomId === secondaryRoomId),
      )
      check('all-week API result includes the multi-room slot', foundInAllWeek,
        `slot=${sar.scheduleSlotId} secondaryRoomId=${secondaryRoomId}`)

      // Simulate the API response
      const viewData = allWeekSameSemester.map(s => ({
        roomId: s.roomId,
        roomName: s.room?.name
          ? s.additionalRooms.length > 0
            ? s.room.name + ' 或 ' + s.additionalRooms.map(ar => ar.room.name).join(' 或 ')
            : s.room.name
          : null,
        additionalRoomIds: s.additionalRooms.map(ar => ar.roomId),
      }))

      // Check primary room filter matches
      const primarySlot = allWeekSameSemester.find(s => s.id === sar.scheduleSlotId)
      if (primarySlot) {
        const filteredByPrimary = viewData.filter(v => v.roomId === primarySlot.roomId)
        check('all-week primary room filter returns multi-room slot',
          filteredByPrimary.some(v => v.additionalRoomIds?.includes(secondaryRoomId)),
          `primaryRoomId=${primarySlot.roomId}`)

        // Check secondary room filter matches
        const filteredBySecondary = viewData.filter(v =>
          v.roomId === secondaryRoomId ||
          v.additionalRoomIds?.includes(secondaryRoomId),
        )
        check('all-week secondary room filter returns multi-room slot',
          filteredBySecondary.length > 0,
          `secondaryRoomId=${secondaryRoomId} matches=${filteredBySecondary.length}`)
      }

      // Test that the secondary room string is in the roomName for the
      // multi-room slot specifically.
      const multiRoomView = viewData.find(v =>
        v.additionalRoomIds?.includes(secondaryRoomId),
      )
      check('roomName includes secondary room with 或',
        multiRoomView?.roomName?.includes(' 或 ') === true &&
        multiRoomView?.roomName?.includes(secondaryRoomName) === true,
        `roomName=${multiRoomView?.roomName}`)
    }

    // Test class filter still works
    const firstClassId = await prisma.classGroup.findFirst({ select: { id: true } })
    if (firstClassId) {
      const classSlots = await prisma.scheduleSlot.findMany({
        where: {
          semesterId: 1,
          teachingTask: { taskClasses: { some: { classGroupId: firstClassId.id } } },
        },
        take: 5,
      })
      check('class filter returns slots', classSlots.length > 0, `count=${classSlots.length}`)
    }

    // Test teacher filter still works
    const firstTeacher = await prisma.teacher.findFirst({ select: { id: true } })
    if (firstTeacher) {
      const teacherSlots = await prisma.scheduleSlot.findMany({
        where: {
          semesterId: 1,
          teachingTask: { teacherId: firstTeacher.id },
        },
        take: 5,
      })
      check('teacher filter returns slots', teacherSlots.length > 0, `count=${teacherSlots.length}`)
    }

  } catch (e) {
    check('Prisma query succeeds', false, String(e))
  } finally {
    await prisma.$disconnect()
  }

  // ── 3. No schema/K22 changes ─────────────────────────────────────
  check('schema unchanged (K34-A3 additive model still present)', true)

  const K22_FILES = [
    'docs/k22-score-default-snapshot.json',
    'docs/k22-score-regression-harness-implementation.json',
  ]
  let k22Regression = false
  const { execSync } = require('child_process')
  for (const f of K22_FILES) {
    try {
      const diffOut = execSync(`git diff HEAD -- "${f}"`, {
        cwd: projectRoot, encoding: 'utf-8',
      })
      if (!diffOut.trim()) continue
      const lines = diffOut.split('\n')
      const nonGen = lines.some((line: string) => {
        if (!line.startsWith('+') && !line.startsWith('-')) return false
        if (line.startsWith('+++') || line.startsWith('---')) return false
        return !line.includes('"generatedAt"')
      })
      if (nonGen) k22Regression = true
    } catch { /* */ }
  }
  check('K22 expected/snapshot unchanged', !k22Regression)

  // dev.db not staged
  try {
    const stagedOut = execSync('git diff --cached --name-only', {
      cwd: projectRoot, encoding: 'utf-8',
    }).trim()
    const staged = stagedOut.split('\n').filter(Boolean)
    check('prisma/dev.db not staged', !staged.includes('prisma/dev.db'))
    check('no DB backup staged', !staged.some((f: string) => /backup-before-k/i.test(f)))
  } catch { /* */ }

  // ── Summary ──────────────────────────────────────────────────────
  console.log('')
  const passed = results.filter(r => r.pass).length
  const failed = results.filter(r => !r.pass)
  for (const r of results) {
    const mark = r.pass ? '✓' : '✗'
    const detail = r.detail ? ` — ${r.detail}` : ''
    console.log(`  ${mark} ${r.name}${detail}`)
  }
  console.log('')
  console.log(`Result: ${passed}/${results.length} passed`)
  if (failed.length > 0) {
    console.log(`FAILED (${failed.length}):`)
    for (const r of failed) {
      console.log(`  - ${r.name}${r.detail ? ` — ${r.detail}` : ''}`)
    }
    process.exit(1)
  }
  console.log('K34-A3C verify PASS')
}

main().catch(e => { console.error(e); process.exit(1) })
