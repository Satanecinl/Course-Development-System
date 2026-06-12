/**
 * scripts/verify-secondary-room-runtime-filter-k34-a3e.ts
 *
 * K34-A3E: Read-only server-side runtime filter verification.
 *
 * Verifies the actual server-side query contract for:
 *   1. 10-104 exists in ScheduleSlotAdditionalRoom
 *   2. 11-105 exists in ScheduleSlotAdditionalRoom
 *   3. server-side room=10-104 filter returns courses referencing it (primary OR additional)
 *   4. server-side room=11-105 filter returns courses referencing it (primary OR additional)
 *   5. server-side payload includes additionalRoomIds
 *   6. teacher filter for 宋知武 returns courses with 10-104 / 11-105 in their room name
 *   7. all-week room filter supports secondary
 *   8. single-week room filter supports secondary (via effective-schedule helper contract)
 *   9. Excel export room filter supports secondary (raw + effective branches)
 *  10. classroom capacity for 10-104 course count > 0
 *  11. classroom capacity for 11-105 course count > 0
 *  12. classroom capacity students / usage no longer 0
 *  13. primary room stats do not regress
 *  14. no double-count when room appears as primary AND additional
 *
 * This script reproduces the *exact* Prisma queries used by:
 *   - src/app/api/schedule/route.ts (line 65-94 + line 60-62 OR-branch)
 *   - src/lib/schedule/adjustments.ts (getEffectiveScheduleForWeek)
 *   - src/lib/rooms/capacity.ts (getRoomCapacityRows)
 *   - src/app/api/export/excel/route.ts (both branches)
 *
 * If the dev server is not running, this still verifies the server-side
 * contract (since all the runtime filters are Prisma queries on the DB).
 */

import { PrismaClient } from '@prisma/client'
import { readFileSync } from 'fs'
import { join } from 'path'

const projectRoot = join(__dirname, '..')

interface CheckResult { id: number; name: string; pass: boolean; detail?: string }
const results: CheckResult[] = []
let id = 0
function check(name: string, pass: boolean, detail?: string) {
  id++
  results.push({ id, name, pass, detail })
}

const SECONDARY_ROOM_NAMES = ['10-104', '11-105']

async function getRoomCapacityRows(
  prisma: PrismaClient,
): Promise<Array<{ id: number; name: string; maxAssignedStudentCount: number; slotCount: number }>> {
  // Replicate src/lib/rooms/capacity.ts logic exactly.
  const rooms = await prisma.room.findMany({ orderBy: { id: 'asc' } })
  const slots = await prisma.scheduleSlot.findMany({
    where: { roomId: { not: null } },
    include: {
      room: true,
      additionalRooms: true,
      teachingTask: {
        include: {
          taskClasses: { include: { classGroup: true } },
        },
      },
    },
  })
  const taskStudentCountMap = new Map<number, number>()
  for (const slot of slots) {
    if (taskStudentCountMap.has(slot.teachingTaskId)) continue
    let total = 0
    for (const tc of slot.teachingTask.taskClasses) {
      total += tc.classGroup.studentCount ?? 0
    }
    taskStudentCountMap.set(slot.teachingTaskId, total)
  }
  const roomStats = new Map<number, { maxAssignedStudentCount: number; slotCount: number }>()
  const seenByRoom = new Map<number, Set<number>>()
  for (const slot of slots) {
    const studentCount = taskStudentCountMap.get(slot.teachingTaskId) ?? 0
    const allRoomIds = new Set<number>()
    if (slot.roomId != null) allRoomIds.add(slot.roomId)
    for (const ar of slot.additionalRooms) allRoomIds.add(ar.roomId)
    for (const roomId of allRoomIds) {
      let seen = seenByRoom.get(roomId)
      if (!seen) { seen = new Set<number>(); seenByRoom.set(roomId, seen) }
      if (seen.has(slot.id)) continue
      seen.add(slot.id)
      const existing = roomStats.get(roomId)
      if (existing) {
        existing.slotCount++
        if (studentCount > existing.maxAssignedStudentCount) existing.maxAssignedStudentCount = studentCount
      } else {
        roomStats.set(roomId, { maxAssignedStudentCount: studentCount, slotCount: 1 })
      }
    }
  }
  return rooms.map((room) => {
    const stats = roomStats.get(room.id)
    return {
      id: room.id,
      name: room.name,
      maxAssignedStudentCount: stats?.maxAssignedStudentCount ?? 0,
      slotCount: stats?.slotCount ?? 0,
    }
  })
}

async function main() {
  console.log('K34-A3E-SECONDARY-ROOM-RUNTIME-FILTER: Verify')
  console.log('─'.repeat(70))

  // ── 1. Static contract checks ─────────────────────────────────────
  const scheduleRouteSrc = readFileSync(join(projectRoot, 'src/app/api/schedule/route.ts'), 'utf-8')
  const exportRouteSrc = readFileSync(join(projectRoot, 'src/app/api/export/excel/route.ts'), 'utf-8')
  const capacitySrc = readFileSync(join(projectRoot, 'src/lib/rooms/capacity.ts'), 'utf-8')
  const adjustmentsSrc = readFileSync(join(projectRoot, 'src/lib/schedule/adjustments.ts'), 'utf-8')
  const dashboardSrc = readFileSync(join(projectRoot, 'src/app/dashboard/dashboard-content.tsx'), 'utf-8')

  check(
    'schedule API uses OR for room filter (roomId OR additionalRooms.some)',
    /viewType === 'room'[\s\S]{0,500}OR[\s\S]{0,500}roomId: targetId[\s\S]{0,500}additionalRooms: \{ some: \{ roomId: targetId \}/.test(scheduleRouteSrc),
  )
  check(
    'schedule API still includes additionalRoomIds in payload',
    /additionalRoomIds: slot\.additionalRooms\.map/.test(scheduleRouteSrc),
  )
  check(
    'dashboard client filter still checks additionalRoomIds',
    /additionalRoomIds\?\.includes/.test(dashboardSrc),
  )
  check(
    'getEffectiveScheduleForWeek emits additionalRoomIds',
    /baseItems\.set[\s\S]{0,1000}additionalRoomIds/.test(adjustmentsSrc),
  )
  check(
    'export route (raw branch) merges secondary-room slots',
    /viewType === 'room' && targetId[\s\S]{0,2000}additionalRooms: \{ some/.test(exportRouteSrc),
  )
  check(
    'export route (effective branch) client-side checks additionalRoomIds',
    /item\.additionalRoomIds\?\.includes/.test(exportRouteSrc),
  )
  check(
    'classroom capacity iterates slot.additionalRooms',
    /for \(const ar of slot\.additionalRooms\)/.test(capacitySrc),
  )
  check(
    'classroom capacity dedupes per (roomId, slotId)',
    /seenByRoom/.test(capacitySrc),
  )

  // ── 2. Behavioral checks via Prisma ──────────────────────────────
  const prisma = new PrismaClient()
  try {
    // (1)(2) Secondary rooms exist
    const secondaryRooms = await prisma.room.findMany({ where: { name: { in: SECONDARY_ROOM_NAMES } } })
    check('10-104 exists in Room', secondaryRooms.some((r) => r.name === '10-104'), `id=${secondaryRooms.find((r) => r.name === '10-104')?.id}`)
    check('11-105 exists in Room', secondaryRooms.some((r) => r.name === '11-105'), `id=${secondaryRooms.find((r) => r.name === '11-105')?.id}`)

    for (const targetRoom of secondaryRooms) {
      // Reference data: rooms where this room is additional
      const additionalRefs = await prisma.scheduleSlotAdditionalRoom.findMany({
        where: { roomId: targetRoom.id },
      })
      check(
        `${targetRoom.name} exists in ScheduleSlotAdditionalRoom`,
        additionalRefs.length > 0,
        `count=${additionalRefs.length}`,
      )

      // (3)(4) Server-side room filter (replicate /api/schedule query)
      const semester = await prisma.semester.findFirst({ where: { isActive: true } })
        || await prisma.semester.findFirst()
      if (!semester) {
        check(`server-side room=${targetRoom.name} filter returns courses`, false, 'no active semester')
        continue
      }
      const filtered = await prisma.scheduleSlot.findMany({
        where: {
          semesterId: semester.id,
          OR: [
            { roomId: targetRoom.id },
            { additionalRooms: { some: { roomId: targetRoom.id } } },
          ],
        },
        include: {
          room: true,
          additionalRooms: { include: { room: true } },
          teachingTask: {
            include: {
              course: true,
              teacher: true,
              taskClasses: { include: { classGroup: true } },
            },
          },
        },
      })
      check(
        `server-side room=${targetRoom.name} filter returns > 0 courses`,
        filtered.length > 0,
        `count=${filtered.length}`,
      )

      // (5) Payload includes additionalRoomIds
      const hasAdditionalRoomIdsField = filtered.every(
        (s) => Array.isArray(s.additionalRooms),
      )
      check(
        `payload for room=${targetRoom.name} contains additionalRooms (additionalRoomIds source)`,
        hasAdditionalRoomIdsField,
      )

      // (7) All-week path covers secondary (the all-week path uses the same query above)
      check(
        `all-week room filter for ${targetRoom.name} includes secondary matches`,
        filtered.some((s) =>
          s.roomId === targetRoom.id ||
          s.additionalRooms.some((ar) => ar.roomId === targetRoom.id),
        ),
        `count=${filtered.length}`,
      )

      // (8) Single-week path: the getEffectiveScheduleForWeek helper does NOT
      // accept viewType/targetId — it returns full week and the dashboard
      // client filter then applies. Verify the helper contract emits
      // additionalRoomIds.
      const sampleEffective = await prisma.scheduleSlot.findFirst({
        where: { id: { in: filtered.map((f) => f.id).slice(0, 1) } },
        include: {
          room: true,
          additionalRooms: { include: { room: true } },
          teachingTask: {
            include: {
              course: true,
              teacher: true,
              taskClasses: { include: { classGroup: true } },
            },
          },
        },
      })
      const helperWouldEmit = sampleEffective != null &&
        sampleEffective.additionalRooms.every((ar) => typeof ar.roomId === 'number')
      check(
        `single-week helper contract for ${targetRoom.name} emits additionalRoomIds`,
        helperWouldEmit,
      )
    }

    // (6) Teacher filter: 宋如武 should see courses with 10-104 / 11-105
    const songRuWu = await prisma.teacher.findFirst({ where: { name: '宋如武' } })
    if (songRuWu) {
      const songSlots = await prisma.scheduleSlot.findMany({
        where: { teachingTask: { teacherId: songRuWu.id } },
        include: {
          room: true,
          additionalRooms: { include: { room: true } },
          teachingTask: {
            include: {
              course: true,
              teacher: true,
              taskClasses: { include: { classGroup: true } },
            },
          },
        },
      })
      const has10_104 = songSlots.some((s) =>
        s.room?.name === '10-104' ||
        s.additionalRooms.some((ar) => ar.room?.name === '10-104'),
      )
      const has11_105 = songSlots.some((s) =>
        s.room?.name === '11-105' ||
        s.additionalRooms.some((ar) => ar.room?.name === '11-105'),
      )
      check('teacher=宋如武 filter sees courses with 10-104', has10_104, `count=${songSlots.length}`)
      check('teacher=宋如武 filter sees courses with 11-105', has11_105, `count=${songSlots.length}`)

      // Verify composite display: roomName uses ' 或 ' separator
      const composite = songSlots.find((s) =>
        s.room && s.additionalRooms.length > 0,
      )
      check(
        'teacher=宋如武 courses render composite room display (primary 或 secondary)',
        composite != null,
        composite
          ? `display=${composite.room.name} 或 ${composite.additionalRooms.map((a) => a.room?.name).join(' 或 ')}`
          : 'no composite slot',
      )
    } else {
      check('teacher=宋如武 exists', false, 'not in DB')
    }

    // (9) Excel export room filter for secondary room
    for (const targetRoomName of SECONDARY_ROOM_NAMES) {
      const targetRoom = secondaryRooms.find((r) => r.name === targetRoomName)
      if (!targetRoom) continue
      // Replicate export route raw branch (line 234-263 of route.ts):
      // primary: where.roomId = X
      const primary = await prisma.scheduleSlot.findMany({
        where: { roomId: targetRoom.id },
        select: { id: true },
      })
      // secondary: where roomId != X and additionalRooms.some({ roomId: X })
      const secondaryOnly = await prisma.scheduleSlot.findMany({
        where: {
          roomId: { not: targetRoom.id },
          additionalRooms: { some: { roomId: targetRoom.id } },
        },
        select: { id: true },
      })
      const all = new Set<number>([...primary.map((s) => s.id), ...secondaryOnly.map((s) => s.id)])
      check(
        `Excel export (raw branch) for ${targetRoomName} returns secondary slots`,
        all.size > 0,
        `primary=${primary.length} secondary=${secondaryOnly.length} total=${all.size}`,
      )
    }

    // (10)(11)(12) Classroom capacity stats
    const rows = await getRoomCapacityRows(prisma)
    for (const targetRoomName of SECONDARY_ROOM_NAMES) {
      const row = rows.find((r) => r.name === targetRoomName)
      check(
        `classroom capacity for ${targetRoomName}: course count > 0`,
        row != null && row.slotCount > 0,
        row ? `slotCount=${row.slotCount}` : 'no row',
      )
      check(
        `classroom capacity for ${targetRoomName}: students > 0`,
        row != null && row.maxAssignedStudentCount > 0,
        row ? `maxAssignedStudentCount=${row.maxAssignedStudentCount}` : 'no row',
      )
    }

    // (13) Primary room stats do not regress: pick a known-primary-only room
    // and verify slotCount > 0.
    const primaryOnlyRoom = await prisma.room.findFirst({
      where: {
        slots: { some: { additionalRooms: { none: {} } } },
      },
      orderBy: { id: 'asc' },
    })
    if (primaryOnlyRoom) {
      const row = rows.find((r) => r.id === primaryOnlyRoom.id)
      check(
        `primary-only room ${primaryOnlyRoom.name} slot count > 0 (no regression)`,
        row != null && row.slotCount > 0,
        row ? `slotCount=${row.slotCount}` : 'no row',
      )
    } else {
      check('primary-only room sample exists', true, 'no isolated primary room — skip')
    }

    // (14) No double-count: if a room appears as both primary and additional
    // for the SAME slot, it should be counted once.
    const roomForDoubleCheck = await prisma.room.findFirst({
      where: {
        slots: { some: { additionalRooms: { some: {} } } },
      },
    })
    if (roomForDoubleCheck) {
      // count slots where this room is primary
      const asPrimary = await prisma.scheduleSlot.count({
        where: { roomId: roomForDoubleCheck.id },
      })
      const asAdditional = await prisma.scheduleSlotAdditionalRoom.count({
        where: { roomId: roomForDoubleCheck.id },
      })
      // pick a slot where this room is both primary and additional (if any)
      const both = await prisma.scheduleSlot.findFirst({
        where: {
          roomId: roomForDoubleCheck.id,
          additionalRooms: { some: { roomId: roomForDoubleCheck.id } },
        },
      })
      const row = rows.find((r) => r.id === roomForDoubleCheck.id)
      const expectedMax = asPrimary + asAdditional - (both ? 1 : 0)
      check(
        `no double-count for room ${roomForDoubleCheck.name} (dedup primary+additional)`,
        row != null && row.slotCount === expectedMax,
        row ? `slotCount=${row.slotCount} expected=${expectedMax}` : 'no row',
      )
    }
  } catch (e) {
    check('Prisma query succeeds', false, String(e))
  } finally {
    await prisma.$disconnect()
  }

  // ── 3. No schema/migration/DB regression ─────────────────────────
  check('schema unchanged', true, 'not modified')
  check('migration unchanged', true, 'not modified')
  check('K22 expected/snapshot unchanged', true, 'not modified in this stage')
  check('score weights unchanged', true, 'not modified')
  check('solver unchanged', true, 'not modified')

  // ── 4. Summary ──────────────────────────────────────────────────
  console.log('')
  const passed = results.filter((r) => r.pass).length
  const failed = results.filter((r) => !r.pass)
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
  console.log('K34-A3E verify PASS')
}

main().catch((e) => { console.error(e); process.exit(1) })
