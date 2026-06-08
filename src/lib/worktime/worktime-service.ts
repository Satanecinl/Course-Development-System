/**
 * src/lib/worktime/worktime-service.ts
 *
 * K26-G: WorkTime API service layer.
 */

import { prisma } from '@/lib/prisma'
import type {
  CreateWorkTimeConfigInput,
  ResolvedWorkTimeConfig,
  TimeSlotDefinitionDTO,
  UpdateWorkTimeConfigInput,
  WorkTimeConfigDTO,
  WorkTimeErrorCode,
} from '@/types/worktime'
import { VALID_TEACHING_SLOT_INDEXES, LEGACY_DISPLAY_SLOT_INDEXES } from '@/lib/schedule/time-slots'

// ── Service result types ──

export interface ServiceSuccess<T> {
  ok: true
  data: T
}

export interface ServiceError {
  ok: false
  error: WorkTimeErrorCode
  message: string
}

export type ServiceResult<T> = ServiceSuccess<T> | ServiceError

function success<T>(data: T): ServiceSuccess<T> {
  return { ok: true, data }
}

function error(error: WorkTimeErrorCode, message: string): ServiceError {
  return { ok: false, error, message }
}

// ── DTO mapper ──

export function mapTimeSlotToDTO(slot: {
  id: number
  slotIndex: number
  label: string
  startsAt: string | null
  endsAt: string | null
  isActive: boolean
  isTeachingSlot: boolean
  isLegacyDisplay: boolean
  sortOrder: number
}): TimeSlotDefinitionDTO {
  return {
    id: slot.id,
    slotIndex: slot.slotIndex,
    label: slot.label,
    startsAt: slot.startsAt,
    endsAt: slot.endsAt,
    isActive: slot.isActive,
    isTeachingSlot: slot.isTeachingSlot,
    isLegacyDisplay: slot.isLegacyDisplay,
    sortOrder: slot.sortOrder,
  }
}

export function mapWorkTimeConfigToDTO(
  config: {
    id: number
    semesterId: number
    semester?: { name: string }
    name: string
    isDefault: boolean
    allowWeekend: boolean
    lunchStart: string | null
    lunchEnd: string | null
    isActive: boolean
    version: number
    effectiveFrom: Date | null
    notes: string | null
    createdAt: Date
    updatedAt: Date
    slots?: Array<{
      id: number
      slotIndex: number
      label: string
      startsAt: string | null
      endsAt: string | null
      isActive: boolean
      isTeachingSlot: boolean
      isLegacyDisplay: boolean
      sortOrder: number
    }>
  },
  includeSlots = false,
): WorkTimeConfigDTO {
  return {
    id: config.id,
    semesterId: config.semesterId,
    semesterName: config.semester?.name,
    name: config.name,
    isDefault: config.isDefault,
    allowWeekend: config.allowWeekend,
    lunchStart: config.lunchStart,
    lunchEnd: config.lunchEnd,
    isActive: config.isActive,
    version: config.version,
    effectiveFrom: config.effectiveFrom?.toISOString() ?? null,
    notes: config.notes,
    createdAt: config.createdAt.toISOString(),
    updatedAt: config.updatedAt.toISOString(),
    slots: includeSlots && config.slots
      ? config.slots.map(mapTimeSlotToDTO)
      : undefined,
  }
}

// ── Service functions ──

export async function listWorkTimeConfigs(params: {
  semesterId?: number
  includeSlots?: boolean
  includeInactive?: boolean
}): Promise<ServiceResult<{ items: WorkTimeConfigDTO[]; semesterId?: number; count: number }>> {
  try {
    const where: Record<string, unknown> = {}
    if (params.semesterId != null) {
      where.semesterId = params.semesterId
    }
    if (!params.includeInactive) {
      where.isActive = true
    }

    const configs = await prisma.workTimeConfig.findMany({
      where,
      include: {
        semester: { select: { name: true } },
        slots: params.includeSlots ?? false,
      },
      orderBy: [{ semesterId: 'asc' }, { isDefault: 'desc' }, { updatedAt: 'desc' }],
    })

    return success({
      items: configs.map((c) => mapWorkTimeConfigToDTO(c, params.includeSlots)),
      semesterId: params.semesterId,
      count: configs.length,
    })
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error'
    return error('INVALID_REQUEST', message)
  }
}

export async function getWorkTimeConfig(
  id: number,
): Promise<ServiceResult<WorkTimeConfigDTO>> {
  try {
    const config = await prisma.workTimeConfig.findUnique({
      where: { id },
      include: {
        semester: { select: { name: true } },
        slots: true,
      },
    })

    if (!config) {
      return error('WORKTIME_CONFIG_NOT_FOUND', `WorkTimeConfig ${id} not found`)
    }

    return success(mapWorkTimeConfigToDTO(config, true))
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error'
    return error('INVALID_REQUEST', message)
  }
}

export async function createWorkTimeConfig(
  input: CreateWorkTimeConfigInput,
): Promise<ServiceResult<WorkTimeConfigDTO>> {
  try {
    // Verify semester exists
    const semester = await prisma.semester.findUnique({
      where: { id: input.semesterId },
    })
    if (!semester) {
      return error('SEMESTER_NOT_FOUND', `Semester ${input.semesterId} not found`)
    }

    // Check name uniqueness
    const existing = await prisma.workTimeConfig.findFirst({
      where: {
        semesterId: input.semesterId,
        name: input.name.trim(),
      },
    })
    if (existing) {
      return error('WORKTIME_CONFIG_NAME_EXISTS', `WorkTimeConfig name "${input.name}" already exists for semester ${input.semesterId}`)
    }

    // Create in transaction
    const config = await prisma.$transaction(async (tx) => {
      // If setting as default, unset other defaults
      if (input.isDefault) {
        await tx.workTimeConfig.updateMany({
          where: {
            semesterId: input.semesterId,
            isDefault: true,
          },
          data: { isDefault: false },
        })
      }

      return tx.workTimeConfig.create({
        data: {
          semesterId: input.semesterId,
          name: input.name.trim(),
          isDefault: input.isDefault ?? false,
          allowWeekend: input.allowWeekend ?? false,
          lunchStart: input.lunchStart ?? null,
          lunchEnd: input.lunchEnd ?? null,
          isActive: input.isActive ?? true,
          effectiveFrom: input.effectiveFrom ? new Date(input.effectiveFrom) : null,
          notes: input.notes ?? null,
          slots: {
            create: input.slots.map((slot, index) => ({
              slotIndex: slot.slotIndex,
              label: slot.label.trim(),
              startsAt: slot.startsAt ?? null,
              endsAt: slot.endsAt ?? null,
              isActive: slot.isActive ?? true,
              isTeachingSlot: slot.isTeachingSlot ?? true,
              isLegacyDisplay: slot.isLegacyDisplay ?? false,
              sortOrder: slot.sortOrder ?? index + 1,
            })),
          },
        },
        include: {
          semester: { select: { name: true } },
          slots: true,
        },
      })
    })

    return success(mapWorkTimeConfigToDTO(config, true))
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error'
    return error('INVALID_REQUEST', message)
  }
}

export async function updateWorkTimeConfig(
  id: number,
  input: UpdateWorkTimeConfigInput,
): Promise<ServiceResult<WorkTimeConfigDTO>> {
  try {
    // Check config exists
    const existing = await prisma.workTimeConfig.findUnique({
      where: { id },
      include: { slots: true },
    })
    if (!existing) {
      return error('WORKTIME_CONFIG_NOT_FOUND', `WorkTimeConfig ${id} not found`)
    }

    // Check name uniqueness if changing name
    if (input.name != null && input.name.trim() !== existing.name) {
      const nameExists = await prisma.workTimeConfig.findFirst({
        where: {
          semesterId: existing.semesterId,
          name: input.name.trim(),
          id: { not: id },
        },
      })
      if (nameExists) {
        return error('WORKTIME_CONFIG_NAME_EXISTS', `WorkTimeConfig name "${input.name}" already exists for semester ${existing.semesterId}`)
      }
    }

    // Update in transaction
    const config = await prisma.$transaction(async (tx) => {
      // If setting as default, unset other defaults
      if (input.isDefault && !existing.isDefault) {
        await tx.workTimeConfig.updateMany({
          where: {
            semesterId: existing.semesterId,
            isDefault: true,
            id: { not: id },
          },
          data: { isDefault: false },
        })
      }

      // Update config fields
      const updated = await tx.workTimeConfig.update({
        where: { id },
        data: {
          name: input.name?.trim(),
          isDefault: input.isDefault,
          allowWeekend: input.allowWeekend,
          lunchStart: input.lunchStart,
          lunchEnd: input.lunchEnd,
          isActive: input.isActive,
          effectiveFrom: input.effectiveFrom ? new Date(input.effectiveFrom) : undefined,
          notes: input.notes,
          version: existing.version + 1,
        },
        include: {
          semester: { select: { name: true } },
          slots: true,
        },
      })

      // If slots provided, replace them
      if (input.slots != null) {
        await tx.timeSlotDefinition.deleteMany({
          where: { workTimeConfigId: id },
        })

        await tx.timeSlotDefinition.createMany({
          data: input.slots.map((slot, index) => ({
            workTimeConfigId: id,
            slotIndex: slot.slotIndex,
            label: slot.label.trim(),
            startsAt: slot.startsAt ?? null,
            endsAt: slot.endsAt ?? null,
            isActive: slot.isActive ?? true,
            isTeachingSlot: slot.isTeachingSlot ?? true,
            isLegacyDisplay: slot.isLegacyDisplay ?? false,
            sortOrder: slot.sortOrder ?? index + 1,
          })),
        })

        // Re-fetch with new slots
        return tx.workTimeConfig.findUnique({
          where: { id },
          include: {
            semester: { select: { name: true } },
            slots: true,
          },
        })
      }

      return updated
    })

    if (!config) {
      return error('INVALID_REQUEST', 'Failed to update config')
    }

    return success(mapWorkTimeConfigToDTO(config, true))
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error'
    return error('INVALID_REQUEST', message)
  }
}

export async function deleteWorkTimeConfig(
  id: number,
): Promise<ServiceResult<{ id: number }>> {
  try {
    // Check config exists
    const config = await prisma.workTimeConfig.findUnique({
      where: { id },
      include: { slots: true },
    })
    if (!config) {
      return error('WORKTIME_CONFIG_NOT_FOUND', `WorkTimeConfig ${id} not found`)
    }

    // Cannot delete default config
    if (config.isDefault) {
      return error('WORKTIME_CONFIG_DEFAULT_IN_USE', 'Cannot delete the default WorkTimeConfig')
    }

    // Cannot delete last active config for a semester
    const activeCount = await prisma.workTimeConfig.count({
      where: {
        semesterId: config.semesterId,
        isActive: true,
      },
    })
    if (activeCount <= 1 && config.isActive) {
      return error('WORKTIME_CONFIG_LAST_ACTIVE', 'Cannot delete the last active WorkTimeConfig for this semester')
    }

    // Check if config is referenced by any SchedulingRun
    const runsWithSnapshot = await prisma.schedulingRun.findMany({
      where: {
        semesterId: config.semesterId,
        workTimeConfigSnapshot: { not: null },
      },
      select: { id: true, workTimeConfigSnapshot: true },
    })

    for (const run of runsWithSnapshot) {
      if (run.workTimeConfigSnapshot) {
        try {
          const snapshot = JSON.parse(run.workTimeConfigSnapshot)
          if (
            snapshot.id === id ||
            snapshot.workTimeConfigId === id ||
            snapshot.configId === id
          ) {
            return error('WORKTIME_CONFIG_USED_BY_RUN', `WorkTimeConfig is referenced by SchedulingRun ${run.id}`)
          }
        } catch {
          // Unparsable snapshot - ignore for this stage
        }
      }
    }

    // Delete in transaction (cascade will delete TimeSlotDefinition)
    await prisma.$transaction(async (tx) => {
      await tx.workTimeConfig.delete({ where: { id } })
    })

    return success({ id })
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error'
    return error('INVALID_REQUEST', message)
  }
}

export async function activateWorkTimeConfig(
  id: number,
): Promise<ServiceResult<WorkTimeConfigDTO>> {
  try {
    // Check config exists
    const config = await prisma.workTimeConfig.findUnique({
      where: { id },
    })
    if (!config) {
      return error('WORKTIME_CONFIG_NOT_FOUND', `WorkTimeConfig ${id} not found`)
    }

    // Activate in transaction
    const updated = await prisma.$transaction(async (tx) => {
      // Unset other defaults for same semester
      await tx.workTimeConfig.updateMany({
        where: {
          semesterId: config.semesterId,
          isDefault: true,
          id: { not: id },
        },
        data: { isDefault: false },
      })

      // Set this config as default and active
      return tx.workTimeConfig.update({
        where: { id },
        data: {
          isDefault: true,
          isActive: true,
        },
        include: {
          semester: { select: { name: true } },
          slots: true,
        },
      })
    })

    return success(mapWorkTimeConfigToDTO(updated, true))
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error'
    return error('INVALID_REQUEST', message)
  }
}

export async function resolveWorkTimeConfig(
  semesterId?: number,
): Promise<ServiceResult<ResolvedWorkTimeConfig>> {
  try {
    // If no semesterId, try to find active semester
    let targetSemesterId = semesterId
    if (targetSemesterId == null) {
      const activeSemester = await prisma.semester.findFirst({
        where: { isActive: true },
      })
      if (activeSemester) {
        targetSemesterId = activeSemester.id
      } else {
        // Return static fallback
        return success(buildStaticFallbackWorkTimeConfig())
      }
    }

    // Find default active config
    const config = await prisma.workTimeConfig.findFirst({
      where: {
        semesterId: targetSemesterId,
        isDefault: true,
        isActive: true,
      },
      include: {
        semester: { select: { name: true } },
        slots: true,
      },
    })

    if (config) {
      return success({
        semesterId: targetSemesterId,
        source: 'database',
        config: mapWorkTimeConfigToDTO(config, true),
      })
    }

    // Return static fallback
    return success(buildStaticFallbackWorkTimeConfig(targetSemesterId))
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error'
    return error('INVALID_REQUEST', message)
  }
}

export function buildStaticFallbackWorkTimeConfig(
  semesterId?: number,
): ResolvedWorkTimeConfig {
  const activeSlots = [...VALID_TEACHING_SLOT_INDEXES].map((slotIndex) => ({
    slotIndex,
    label: `${slotIndex * 2 - 1}-${slotIndex * 2}节`,
    startsAt: null,
    endsAt: null,
    isActive: true,
    isTeachingSlot: true,
    isLegacyDisplay: false,
    sortOrder: slotIndex,
  }))

  const legacySlots = [...LEGACY_DISPLAY_SLOT_INDEXES].map((slotIndex) => ({
    slotIndex,
    label: slotIndex === 6 ? '11-12节' : '中午',
    startsAt: null,
    endsAt: null,
    isActive: false,
    isTeachingSlot: false,
    isLegacyDisplay: true,
    sortOrder: slotIndex,
  }))

  return {
    semesterId: semesterId ?? 0,
    source: 'staticFallback',
    config: {
      id: 0,
      semesterId: semesterId ?? 0,
      name: 'static-fallback',
      isDefault: true,
      allowWeekend: false,
      lunchStart: null,
      lunchEnd: null,
      isActive: true,
      version: 0,
      effectiveFrom: null,
      notes: 'Static fallback from K26-D helper',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      slots: [...activeSlots, ...legacySlots].map((s, i) => ({
        id: 0,
        ...s,
        sortOrder: s.sortOrder ?? i + 1,
      })),
    },
  }
}
