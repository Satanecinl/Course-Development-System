/**
 * scripts/repair-composite-room-expressions-k34-a3.ts
 *
 * K34-A3: Controlled data repair for composite Room rows.
 *
 * Splits composite "或" rooms (e.g. "11-322 或 10-104") into real
 * component rooms, migrates ScheduleSlot references, creates
 * ScheduleSlotAdditionalRoom for secondary rooms, and deletes
 * composite Room rows that are no longer referenced.
 *
 * Modes:
 *   --dry-run   Default. Inspect, plan, no writes.
 *   --apply     Create backup, migrate, delete.
 */

import { copyFileSync, existsSync, statSync } from 'fs'
import { join } from 'path'
import { prisma } from '@/lib/prisma'
import { parseCompositeRoomExpression } from '@/lib/rooms/composite-room-expression'
import { normalizeRoomNameForMatch } from '@/lib/rooms/room-name-normalization'

// ── Args ──
const args = process.argv.slice(2)
const apply = args.includes('--apply')

const projectRoot = join(__dirname, '..')
const dbPath = join(projectRoot, 'prisma', 'dev.db')

function log(s: string) { console.log(s) }
function head(s: string) { log(`\n${'─'.repeat(70)}\n${s}\n${'─'.repeat(70)}`) }

// ── Reference counts ──
async function getRefCounts(roomId: number) {
  const [slots, adj, avail] = await Promise.all([
    prisma.scheduleSlot.count({ where: { roomId } }),
    prisma.scheduleAdjustment.count({ where: { newRoomId: roomId } }),
    prisma.roomAvailability.count({ where: { roomId } }),
  ])
  return { slots, adj, avail, total: slots + adj + avail }
}

// ── Plan ──
interface CompositeRoomPlan {
  compositeRoomId: number
  compositeRoomName: string
  compositeRoomCapacity: number
  compositeRefs: { slots: number; adj: number; avail: number; total: number }
  componentNames: string[]
  componentRoomIds: number[] // primary first
  componentRoomsCreated: { id: number; name: string }[]
  componentRoomsMatched: { id: number; name: string }[]
  riskLevel: 'LOW' | 'MEDIUM' | 'HIGH'
  blockers: string[]
}

async function buildPlan(): Promise<CompositeRoomPlan[]> {
  // Find all rooms with "或" in name
  const compositeRooms = await prisma.room.findMany({
    where: { name: { contains: '或' } },
    select: { id: true, name: true, capacity: true },
  })

  const plans: CompositeRoomPlan[] = []
  for (const room of compositeRooms) {
    const parsed = parseCompositeRoomExpression(room.name)
    if (!parsed.isComposite || parsed.rooms.length < 2) continue

    const refs = await getRefCounts(room.id)
    const blockers: string[] = []
    let risk: 'LOW' | 'MEDIUM' | 'HIGH' = 'LOW'

    // Check if ScheduleAdjustment.newRoomId points here
    if (refs.adj > 0) {
      const adjRows = await prisma.scheduleAdjustment.findMany({
        where: { newRoomId: room.id },
        select: { id: true, status: true, type: true },
      })
      const activeAdj = adjRows.filter((a) => a.status === 'ACTIVE')
      if (activeAdj.length > 0) {
        risk = 'HIGH'
        blockers.push(`Composite room has ${activeAdj.length} active ScheduleAdjustment reference(s). Cannot safely migrate.`)
      }
    }

    // Resolve component rooms by normalized key
    const componentRoomIds: number[] = []
    const created: { id: number; name: string }[] = []
    const matched: { id: number; name: string }[] = []

    for (const compName of parsed.rooms) {
      const normKey = normalizeRoomNameForMatch(compName)
      // Find existing room with this normalized key
      const allRooms = await prisma.room.findMany({
        select: { id: true, name: true },
      })
      const existing = allRooms.find((r) => normalizeRoomNameForMatch(r.name) === normKey)
      if (existing) {
        componentRoomIds.push(existing.id)
        matched.push(existing)
      } else {
        // Plan to create
        componentRoomIds.push(-1) // placeholder
        created.push({ id: -1, name: compName.trim() })
      }
    }

    plans.push({
      compositeRoomId: room.id,
      compositeRoomName: room.name,
      compositeRoomCapacity: room.capacity,
      compositeRefs: refs,
      componentNames: parsed.rooms,
      componentRoomIds,
      componentRoomsCreated: created,
      componentRoomsMatched: matched,
      riskLevel: risk,
      blockers,
    })
  }
  return plans
}

function printPlan(plans: CompositeRoomPlan[]) {
  head(`Composite rooms to repair: ${plans.length}`)
  for (const p of plans) {
    log(`\n[${p.compositeRoomId}] ${JSON.stringify(p.compositeRoomName)}`)
    log(`  capacity=${p.compositeRoomCapacity} risk=${p.riskLevel}`)
    log(`  refs: slot=${p.compositeRefs.slots} adj=${p.compositeRefs.adj} avail=${p.compositeRefs.avail}`)
    log(`  components: ${p.componentNames.map((n) => JSON.stringify(n)).join(' + ')}`)
    if (p.componentRoomsMatched.length > 0) {
      log(`  matched: ${p.componentRoomsMatched.map((r) => `${r.id}=${JSON.stringify(r.name)}`).join(', ')}`)
    }
    if (p.componentRoomsCreated.length > 0) {
      log(`  to create: ${p.componentRoomsCreated.map((r) => JSON.stringify(r.name)).join(', ')}`)
    }
    if (p.blockers.length > 0) {
      log(`  blockers: ${p.blockers.join('; ')}`)
    }
  }
}

async function applyRepair(plans: CompositeRoomPlan[]): Promise<{
  roomsCreated: number
  slotsMigrated: number
  additionalRoomsCreated: number
  compositeRoomsDeleted: number
  compositeRoomsRetained: number
}> {
  let roomsCreated = 0
  let slotsMigrated = 0
  let additionalRoomsCreated = 0
  let compositeRoomsDeleted = 0
  let compositeRoomsRetained = 0

  // Cache: normalized component name → room id (for rooms created in
  // this run, so that multiple composite rooms sharing the same
  // component don't trigger duplicate create).
  const createdComponentCache = new Map<string, number>()

  for (const p of plans) {
    if (p.riskLevel === 'HIGH') {
      log(`[${p.compositeRoomId}] SKIP — HIGH risk: ${p.blockers.join('; ')}`)
      compositeRoomsRetained++
      continue
    }

    // Step 1: Resolve / create component rooms
    const resolvedIds: number[] = []
    for (let i = 0; i < p.componentNames.length; i++) {
      const existingMatch = p.componentRoomsMatched[i]
      if (existingMatch && p.componentRoomIds[i] !== -1) {
        resolvedIds.push(p.componentRoomIds[i])
      } else {
        // Check cache first (another composite room may have created
        // this component earlier in this run).
        const normKey = normalizeRoomNameForMatch(p.componentNames[i])
        const cachedId = createdComponentCache.get(normKey)
        if (cachedId != null) {
          resolvedIds.push(cachedId)
        } else {
          const canonicalName = p.componentNames[i].trim()
          const r = await prisma.room.create({
            data: { name: canonicalName, capacity: 50, type: 'NORMAL' },
          })
          createdComponentCache.set(normKey, r.id)
          resolvedIds.push(r.id)
          roomsCreated++
          log(`  created room ${r.id}=${JSON.stringify(canonicalName)}`)
        }
      }
    }

    const primaryId = resolvedIds[0]

    // Step 2: Migrate ScheduleSlot.roomId to primary component
    const slots = await prisma.scheduleSlot.findMany({
      where: { roomId: p.compositeRoomId },
      select: { id: true },
    })
    for (const slot of slots) {
      await prisma.scheduleSlot.update({
        where: { id: slot.id },
        data: { roomId: primaryId },
      })
      slotsMigrated++

      // Create ScheduleSlotAdditionalRoom for secondary components
      for (let ci = 1; ci < resolvedIds.length; ci++) {
        try {
          await prisma.scheduleSlotAdditionalRoom.create({
            data: {
              scheduleSlotId: slot.id,
              roomId: resolvedIds[ci],
              role: 'SECONDARY',
            },
          })
          additionalRoomsCreated++
        } catch {
          // Duplicate unique constraint — already exists
        }
      }
    }

    // Step 3: Migrate ScheduleAdjustment.newRoomId to primary
    await prisma.scheduleAdjustment.updateMany({
      where: { newRoomId: p.compositeRoomId },
      data: { newRoomId: primaryId },
    })

    // Step 4: Migrate RoomAvailability to primary
    const dupAvail = await prisma.roomAvailability.findMany({
      where: { roomId: p.compositeRoomId },
    })
    const primaryAvail = await prisma.roomAvailability.findMany({
      where: { roomId: primaryId },
    })
    const primaryKeys = new Set(primaryAvail.map((a) => `${a.dayOfWeek}:${a.slotIndex}`))
    for (const a of dupAvail) {
      const k = `${a.dayOfWeek}:${a.slotIndex}`
      if (primaryKeys.has(k)) {
        await prisma.roomAvailability.delete({ where: { id: a.id } })
      } else {
        await prisma.roomAvailability.update({ where: { id: a.id }, data: { roomId: primaryId } })
      }
    }

    // Step 5: Check if composite room has remaining references
    const remaining = await getRefCounts(p.compositeRoomId)
    if (remaining.total === 0) {
      await prisma.room.delete({ where: { id: p.compositeRoomId } })
      compositeRoomsDeleted++
      log(`  deleted composite room ${p.compositeRoomId}`)
    } else {
      compositeRoomsRetained++
      log(`  RETAINED composite room ${p.compositeRoomId} — ${remaining.total} refs remain`)
    }
  }

  return { roomsCreated, slotsMigrated, additionalRoomsCreated, compositeRoomsDeleted, compositeRoomsRetained }
}

// ── Backup ──
function createBackup(): string {
  if (!existsSync(dbPath)) throw new Error('dev.db not found: ' + dbPath)
  const ts = new Date().toISOString().replace(/[:.]/g, '-')
  const backupPath = join(projectRoot, 'prisma', `dev.db.backup-before-k34-a3-composite-room-${ts}`)
  copyFileSync(dbPath, backupPath)
  const sz = statSync(backupPath).size
  log(`\nBackup: ${backupPath} (${sz} bytes)`)
  return backupPath
}

// ── Verify post-state ──
async function verifyPostState() {
  const composites = await prisma.room.findMany({
    where: { name: { contains: '或' } },
    select: { id: true, name: true },
  })
  log(`\nPost-repair composite rooms: ${composites.length}`)
  for (const r of composites) {
    log(`  id=${r.id} name=${JSON.stringify(r.name)}`)
  }
}

// ── Main ──
async function main() {
  log(`mode: ${apply ? 'APPLY' : 'DRY-RUN'}`)

  const plans = await buildPlan()
  printPlan(plans)

  if (apply) {
    if (!existsSync(dbPath)) {
      log('FATAL: dev.db not found')
      process.exit(1)
    }
    createBackup()
    const result = await applyRepair(plans)
    log(`\n[result] roomsCreated=${result.roomsCreated} slotsMigrated=${result.slotsMigrated} ` +
        `additionalRoomsCreated=${result.additionalRoomsCreated} ` +
        `compositeRoomsDeleted=${result.compositeRoomsDeleted} retained=${result.compositeRoomsRetained}`)
    await verifyPostState()
  } else {
    const highRisk = plans.filter((p) => p.riskLevel === 'HIGH').length
    log(`\n[summary] composite rooms=${plans.length} high-risk=${highRisk} to create=${plans.reduce((a, p) => a + p.componentRoomsCreated.length, 0)}`)
    log(`(no DB writes performed; re-run with --apply)`)
  }

  await prisma.$disconnect()
}

main().catch((e) => { console.error(e); process.exit(1) })
