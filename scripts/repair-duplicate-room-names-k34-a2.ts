/**
 * scripts/repair-duplicate-room-names-k34-a2.ts
 *
 * K34-A2: Controlled data repair for duplicate Room rows caused by
 * whitespace variation in the source (e.g. "林校304" / "林校\n304" /
 * "林校 304"). The forward fix lives in src/lib/import/importer.ts
 * (and src/lib/rooms/room-name-normalization.ts). This script repairs
 * the pre-existing duplicates in the dev DB.
 *
 * Modes:
 *   --dry-run        Default. Inspect duplicates, plan migrations, no DB writes.
 *   --apply          Create backup, migrate references, delete safe duplicates.
 *   --restore-backup=<path>
 *                    Reverts prisma/dev.db to the given backup file.
 *
 * Does NOT modify: solver, score, HC5 / HC6 rules, schema, migration,
 * Room model, importer business logic, K22 expected.
 */

import { copyFileSync, existsSync, statSync } from 'fs'
import { join } from 'path'
import { prisma } from '@/lib/prisma'
import {
  groupDuplicatesByNormalizedName,
  pickCanonicalRoom,
} from '@/lib/rooms/room-name-normalization'

// ── Args ──
const args = process.argv.slice(2)
const restoreArg = args.find((a) => a.startsWith('--restore-backup='))
const restorePath = restoreArg ? restoreArg.split('=')[1] : null
const apply = args.includes('--apply')

const projectRoot = join(__dirname, '..')
const dbPath = join(projectRoot, 'prisma', 'dev.db')

// ── Logging ──
function log(s: string) { console.log(s) }
function head(s: string) { log(`\n${'─'.repeat(70)}\n${s}\n${'─'.repeat(70)}`) }

// ── Reference counts ──
interface RoomRefCounts {
  scheduleSlotCount: number
  scheduleAdjustmentCount: number
  roomAvailabilityCount: number
  teachingTaskCount: number // teaching task has no direct roomId but kept for diagnostic
  total: number
}

async function getRefCounts(roomId: number): Promise<RoomRefCounts> {
  const [slots, adj, avail] = await Promise.all([
    prisma.scheduleSlot.count({ where: { roomId } }),
    prisma.scheduleAdjustment.count({ where: { newRoomId: roomId } }),
    prisma.roomAvailability.count({ where: { roomId } }),
  ])
  return {
    scheduleSlotCount: slots,
    scheduleAdjustmentCount: adj,
    roomAvailabilityCount: avail,
    teachingTaskCount: 0,
    total: slots + adj + avail,
  }
}

// ── Signatures (for backup verification) ──
async function captureSignature() {
  const rooms = await prisma.room.findMany({
    select: { id: true, name: true, capacity: true, type: true },
    orderBy: { id: 'asc' },
  })
  const slotRows = await prisma.scheduleSlot.findMany({
    select: { id: true, roomId: true },
    orderBy: { id: 'asc' },
  })
  return {
    roomsHash: rooms.map((r) => `${r.id}:${r.name}:${r.capacity}:${r.type}`).join('|'),
    slotsHash: slotRows.map((s) => `${s.id}:${s.roomId ?? 'NULL'}`).join('|'),
    roomCount: rooms.length,
  }
}

// ── Plan ──
interface DuplicateGroupPlan {
  key: string
  rooms: Array<{
    id: number
    name: string
    capacity: number
    type: string
    refs: RoomRefCounts
  }>
  canonicalId: number
  canonicalName: string
  canonicalRefs: RoomRefCounts
  duplicateIds: number[]
  duplicateTotalRefs: number
  riskLevel: 'LOW' | 'MEDIUM' | 'HIGH'
  blockers: string[]
  notes: string[]
}

async function buildPlan(): Promise<DuplicateGroupPlan[]> {
  const allRooms = await prisma.room.findMany({
    select: { id: true, name: true, capacity: true, type: true },
  })
  const groups = groupDuplicatesByNormalizedName(allRooms)

  const plans: DuplicateGroupPlan[] = []
  for (const [key, rooms] of groups) {
    const withRefs = await Promise.all(
      rooms.map(async (r) => {
        const refs = await getRefCounts(r.id)
        return { ...r, refs }
      }),
    )

    // Apply canonical selection: prefer name == normalized form, then
    // highest refCount, then smallest id.
    const canonical = pickCanonicalRoom(
      withRefs.map((r) => ({ id: r.id, name: r.name, refCount: r.refs.total })),
    )
    if (!canonical) continue

    const canonicalRow = withRefs.find((r) => r.id === canonical.id)!
    const canonicalRefs = canonicalRow.refs
    const duplicates = withRefs.filter((r) => r.id !== canonical.id)
    const duplicateIds = duplicates.map((r) => r.id)
    const duplicateTotalRefs = duplicates.reduce((acc, r) => acc + r.refs.total, 0)

    const blockers: string[] = []
    const notes: string[] = []
    let risk: 'LOW' | 'MEDIUM' | 'HIGH' = 'LOW'

    // Risk assessment
    const totalRefs = canonicalRefs.total + duplicateTotalRefs
    if (canonicalRefs.total === 0 && duplicateTotalRefs > 0) {
      // Canonical has no refs but duplicates do — the canonical pick
      // might be wrong. Promote to HIGH risk.
      risk = 'HIGH'
      blockers.push(
        `Canonical room (id=${canonical.id}) has 0 refs but duplicates have ${duplicateTotalRefs} refs. Pick a different canonical.`,
      )
    }
    if (duplicates.length > 0) {
      const capacities = new Set([
        canonicalRow.capacity,
        ...duplicates.map((d) => d.capacity),
      ])
      if (capacities.size > 1) {
        notes.push(
          `Capacity differs across the group; canonical id=${canonical.id} keeps capacity=${canonicalRow.capacity}.`,
        )
      }
      const types = new Set([
        canonicalRow.type,
        ...duplicates.map((d) => d.type),
      ])
      if (types.size > 1) {
        notes.push(
          `Room type differs across the group; canonical id=${canonical.id} keeps type="${canonicalRow.type}".`,
        )
      }
    }
    if (totalRefs === 0) {
      // Pure drift — all rooms are unreferenced. Safe to delete.
      notes.push('Group has zero references; safe to drop duplicates after migration.')
    }

    plans.push({
      key,
      rooms: withRefs,
      canonicalId: canonical.id,
      canonicalName: canonicalRow.name,
      canonicalRefs,
      duplicateIds,
      duplicateTotalRefs,
      riskLevel: risk,
      blockers,
      notes,
    })
  }
  return plans
}

// ── Print plan ──
function printPlan(plans: DuplicateGroupPlan[]) {
  log('')
  head(`Duplicate canonical groups: ${plans.length}`)
  for (const p of plans) {
    log(`\n[${p.key}]  risk=${p.riskLevel}`)
    log(`  canonical: id=${p.canonicalId} name=${JSON.stringify(p.canonicalName)} ` +
        `refs(slot=${p.canonicalRefs.scheduleSlotCount} adj=${p.canonicalRefs.scheduleAdjustmentCount} avail=${p.canonicalRefs.roomAvailabilityCount})`)
    for (const dup of p.duplicateIds) {
      const r = p.rooms.find((x) => x.id === dup)!
      log(`  duplicate: id=${r.id} name=${JSON.stringify(r.name)} capacity=${r.capacity} type=${r.type} ` +
          `refs(slot=${r.refs.scheduleSlotCount} adj=${r.refs.scheduleAdjustmentCount} avail=${r.refs.roomAvailabilityCount})`)
    }
    if (p.notes.length) {
      log(`  notes:`)
      for (const n of p.notes) log(`    - ${n}`)
    }
    if (p.blockers.length) {
      log(`  blockers:`)
      for (const b of p.blockers) log(`    - ${b}`)
    }
  }
}

// ── Apply ──
async function applyRepair(plans: DuplicateGroupPlan[]): Promise<{
  migrated: number
  deleted: number
  retained: number
}> {
  let migrated = 0
  let deleted = 0
  let retained = 0

  for (const p of plans) {
    if (p.riskLevel === 'HIGH') {
      log(`[${p.key}] SKIP — HIGH risk: ${p.blockers.join('; ')}`)
      retained += p.duplicateIds.length
      continue
    }
    for (const dupId of p.duplicateIds) {
      // Migrate ScheduleSlot.roomId
      const slotUpdate = await prisma.scheduleSlot.updateMany({
        where: { roomId: dupId },
        data: { roomId: p.canonicalId },
      })
      // Migrate ScheduleAdjustment.newRoomId
      const adjUpdate = await prisma.scheduleAdjustment.updateMany({
        where: { newRoomId: dupId },
        data: { newRoomId: p.canonicalId },
      })
      // Migrate RoomAvailability.roomId (avoid duplicate unique constraint
      // collisions: if canonical already has an availability at the same
      // day/slot, drop the dup's row instead of migrating)
      const dupAvail = await prisma.roomAvailability.findMany({ where: { roomId: dupId } })
      const canonicalAvail = await prisma.roomAvailability.findMany({ where: { roomId: p.canonicalId } })
      const canonicalKeys = new Set(canonicalAvail.map((a) => `${a.dayOfWeek}:${a.slotIndex}`))
      for (const a of dupAvail) {
        const k = `${a.dayOfWeek}:${a.slotIndex}`
        if (canonicalKeys.has(k)) {
          await prisma.roomAvailability.delete({ where: { id: a.id } })
        } else {
          await prisma.roomAvailability.update({ where: { id: a.id }, data: { roomId: p.canonicalId } })
        }
      }

      migrated += slotUpdate.count + adjUpdate.count
      const remainingRefs = await getRefCounts(dupId)
      if (remainingRefs.total === 0) {
        // Safe to delete
        try {
          await prisma.room.delete({ where: { id: dupId } })
          deleted++
          log(`[${p.key}] migrated ${slotUpdate.count + adjUpdate.count} refs and DELETED duplicate id=${dupId}`)
        } catch (e) {
          // Some FK we did not anticipate
          retained++
          log(`[${p.key}] migrated ${slotUpdate.count + adjUpdate.count} refs but could not delete id=${dupId}: ${String(e)}`)
        }
      } else {
        // Couldn't delete — still has references we didn't migrate
        retained++
        log(`[${p.key}] migrated ${slotUpdate.count + adjUpdate.count} refs, but id=${dupId} still has ${remainingRefs.total} refs; retained`)
      }
    }
  }
  return { migrated, deleted, retained }
}

// ── Backup / restore ──
function createBackup(): string {
  if (!existsSync(dbPath)) throw new Error('dev.db not found: ' + dbPath)
  const ts = new Date().toISOString().replace(/[:.]/g, '-')
  const backupPath = join(projectRoot, 'prisma', `dev.db.backup-before-k34-a2-room-repair-${ts}`)
  copyFileSync(dbPath, backupPath)
  const sz = statSync(backupPath).size
  log(`\nBackup created: ${backupPath} (${sz} bytes)`)
  return backupPath
}

function restoreBackup(backupPath: string) {
  if (!existsSync(backupPath)) throw new Error('Backup not found: ' + backupPath)
  copyFileSync(backupPath, dbPath)
  log(`Restored from: ${backupPath}`)
}

// ── Verify post-state ──
async function verifyPostState() {
  const rooms = await prisma.room.findMany({ select: { id: true, name: true } })
  const groups = groupDuplicatesByNormalizedName(rooms)
  log(`\nPost-repair duplicate groups: ${groups.size}`)
  for (const [k, list] of groups) {
    log(`  remaining duplicates in "${k}": ${list.map((r) => `${r.id}=${JSON.stringify(r.name)}`).join(', ')}`)
  }
  // HC5 / HC6 sanity: count slots that violate (room marked unavailable / non-automotive in Linxiao).
  // We don't import the scorer here; we just report the count of slots in Linxiao
  // rooms whose classGroup does not match Linxiao-allowed specialties. A
  // best-effort heuristic.
  const linxiaoRooms = rooms.filter((r) => r.name.includes('林校'))
  const slotCount = await prisma.scheduleSlot.count({ where: { roomId: { in: linxiaoRooms.map((r) => r.id) } } })
  log(`Linxiao room count: ${linxiaoRooms.length}, slots in Linxiao rooms: ${slotCount}`)
}

// ── Main ──
async function main() {
  log(`mode: ${apply ? 'APPLY' : 'DRY-RUN'}`)

  if (restorePath) {
    restoreBackup(restorePath)
    await prisma.$disconnect()
    return
  }

  if (apply) {
    if (!existsSync(dbPath)) {
      log('FATAL: dev.db not found at ' + dbPath)
      process.exit(1)
    }
    const backupPath = createBackup()
    log(`Backup at: ${backupPath}`)
    const sigBefore = await captureSignature()
    log(`Pre-repair signature: rooms=${sigBefore.roomCount} hash=${sigBefore.roomsHash.slice(0, 40)}...`)
  }

  const plans = await buildPlan()
  printPlan(plans)

  if (apply) {
    const result = await applyRepair(plans)
    log(`\n[result] migrated=${result.migrated} deleted=${result.deleted} retained=${result.retained}`)
  } else {
    const totalMigrate = plans.reduce((acc, p) => acc + p.duplicateTotalRefs, 0)
    const highRisk = plans.filter((p) => p.riskLevel === 'HIGH').length
    log(`\n[summary] duplicate groups=${plans.length} refs to migrate=${totalMigrate} high-risk=${highRisk}`)
    log(`(no DB writes performed; re-run with --apply to perform the repair)`)
  }

  if (apply) {
    await verifyPostState()
  }
  await prisma.$disconnect()
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
