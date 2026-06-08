/**
 * scripts/backfill-worktime-default-config-k26-f.ts
 *
 * K26-F: Backfill default WorkTimeConfig + TimeSlotDefinition for all semesters.
 *
 * Usage:
 *   npx tsx scripts/backfill-worktime-default-config-k26-f.ts --dry-run
 *   npx tsx scripts/backfill-worktime-default-config-k26-f.ts --apply
 *
 * This script is idempotent: it skips semesters that already have a
 * default WorkTimeConfig (isDefault=true). It does NOT modify existing
 * configs, ScheduleSlot, SchedulingRun, or any other business data.
 */

import { PrismaClient } from '@prisma/client'

const prisma = new PrismaClient()

const mode = process.argv[2]
const isDryRun = mode === '--dry-run'
const isApply = mode === '--apply'

if (!isDryRun && !isApply) {
  console.error('Usage: npx tsx scripts/backfill-worktime-default-config-k26-f.ts --dry-run|--apply')
  process.exit(1)
}

interface SlotSeed {
  slotIndex: number
  label: string
  startsAt: string | null
  endsAt: string | null
  isActive: boolean
  isTeachingSlot: boolean
  isLegacyDisplay: boolean
  sortOrder: number
}

const DEFAULT_SLOTS: SlotSeed[] = [
  { slotIndex: 1, label: '1-2节', startsAt: null, endsAt: null, isActive: true, isTeachingSlot: true, isLegacyDisplay: false, sortOrder: 1 },
  { slotIndex: 2, label: '3-4节', startsAt: null, endsAt: null, isActive: true, isTeachingSlot: true, isLegacyDisplay: false, sortOrder: 2 },
  { slotIndex: 3, label: '5-6节', startsAt: null, endsAt: null, isActive: true, isTeachingSlot: true, isLegacyDisplay: false, sortOrder: 3 },
  { slotIndex: 4, label: '7-8节', startsAt: null, endsAt: null, isActive: true, isTeachingSlot: true, isLegacyDisplay: false, sortOrder: 4 },
  { slotIndex: 5, label: '9-10节', startsAt: null, endsAt: null, isActive: true, isTeachingSlot: true, isLegacyDisplay: false, sortOrder: 5 },
  { slotIndex: 6, label: '11-12节', startsAt: null, endsAt: null, isActive: false, isTeachingSlot: false, isLegacyDisplay: true, sortOrder: 6 },
  { slotIndex: 7, label: '中午', startsAt: null, endsAt: null, isActive: false, isTeachingSlot: false, isLegacyDisplay: true, sortOrder: 7 },
]

async function main() {
  console.log(`\n[Backfill WorkTimeConfig] Mode: ${isDryRun ? 'DRY-RUN' : 'APPLY'}`)
  console.log('─'.repeat(60))

  // 1. List all semesters
  const semesters = await prisma.semester.findMany({
    orderBy: { id: 'asc' },
  })

  console.log(`\nFound ${semesters.length} semester(s):`)
  for (const s of semesters) {
    console.log(`  [${s.id}] ${s.name} (${s.code})`)
  }

  if (semesters.length === 0) {
    console.log('\nNo semesters found. Nothing to backfill.')
    return
  }

  // 2. Check existing configs
  const existingConfigs = await prisma.workTimeConfig.findMany({
    where: { isDefault: true },
    select: { semesterId: true, id: true, name: true },
  })

  const semestersWithConfig = new Set(existingConfigs.map((c) => c.semesterId))

  console.log(`\nSemesters with existing default config: ${semestersWithConfig.size}`)

  // 3. Identify missing semesters
  const missingSemesters = semesters.filter((s) => !semestersWithConfig.has(s.id))

  console.log(`\nSemesters needing backfill: ${missingSemesters.length}`)
  for (const s of missingSemesters) {
    console.log(`  [${s.id}] ${s.name} (${s.code})`)
  }

  if (missingSemesters.length === 0) {
    console.log('\nAll semesters already have a default WorkTimeConfig. Nothing to do.')
    return
  }

  if (isDryRun) {
    console.log('\n[DRY-RUN] Would create the following:')
    for (const s of missingSemesters) {
      console.log(`  WorkTimeConfig (semesterId=${s.id}, name="default", isDefault=true, allowWeekend=false, version=1)`)
      console.log(`    + 7 TimeSlotDefinition rows (slots 1-7)`)
    }
    console.log('\n[DRY-RUN] No changes made.')
    return
  }

  // 4. Apply: create configs + slots
  let createdConfigs = 0
  let createdSlots = 0

  for (const s of missingSemesters) {
    const config = await prisma.workTimeConfig.create({
      data: {
        semesterId: s.id,
        name: 'default',
        isDefault: true,
        allowWeekend: false,
        isActive: true,
        version: 1,
        effectiveFrom: new Date(),
        notes: 'Auto-created by K26-F backfill script',
      },
    })
    createdConfigs++

    await prisma.timeSlotDefinition.createMany({
      data: DEFAULT_SLOTS.map((slot) => ({
        workTimeConfigId: config.id,
        ...slot,
      })),
    })
    createdSlots += DEFAULT_SLOTS.length

    console.log(`  Created WorkTimeConfig id=${config.id} for semester [${s.id}] ${s.name}`)
    console.log(`    + ${DEFAULT_SLOTS.length} TimeSlotDefinition rows`)
  }

  console.log(`\n[APPLY] Summary:`)
  console.log(`  Created WorkTimeConfig: ${createdConfigs}`)
  console.log(`  Created TimeSlotDefinition: ${createdSlots}`)
}

main()
  .catch((err) => {
    console.error('Backfill failed:', err)
    process.exit(1)
  })
  .finally(() => prisma.$disconnect())
