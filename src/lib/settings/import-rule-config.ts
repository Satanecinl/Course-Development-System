/**
 * K39-B1: Import rule config helper service.
 *
 * Singleton config for import rule behaviors. Default key = "default".
 * Config row missing → fallback to safe defaults (false).
 * Stale Prisma Client → catch and fallback (defensive).
 */

import { prisma } from '@/lib/prisma'

export interface ImportRuleConfigData {
  id: number
  key: string
  requireExplicitSemesterForImport: boolean
  createdAt: Date
  updatedAt: Date
}

const DEFAULT_KEY = 'default'
const FALLBACK_CONFIG: ImportRuleConfigData = {
  id: 0,
  key: DEFAULT_KEY,
  requireExplicitSemesterForImport: false,
  createdAt: new Date(),
  updatedAt: new Date(),
}

/**
 * Get the import rule config. Returns fallback if row missing or Prisma error.
 */
export async function getImportRuleConfig(): Promise<ImportRuleConfigData> {
  try {
    const row = await prisma.importRuleConfig.findUnique({ where: { key: DEFAULT_KEY } })
    if (!row) return FALLBACK_CONFIG
    return row
  } catch {
    // Stale Prisma Client or table missing — safe fallback
    return FALLBACK_CONFIG
  }
}

/**
 * Get just the requireExplicitSemesterForImport flag.
 */
export async function getRequireExplicitSemesterForImport(): Promise<boolean> {
  const config = await getImportRuleConfig()
  return config.requireExplicitSemesterForImport
}

/**
 * Update import rule config (upsert on key="default").
 */
export async function updateImportRuleConfig(input: {
  requireExplicitSemesterForImport?: boolean
}): Promise<ImportRuleConfigData> {
  const data: Record<string, unknown> = {}
  if (input.requireExplicitSemesterForImport !== undefined) {
    data.requireExplicitSemesterForImport = input.requireExplicitSemesterForImport
  }

  if (Object.keys(data).length === 0) {
    return getImportRuleConfig()
  }

  try {
    const row = await prisma.importRuleConfig.upsert({
      where: { key: DEFAULT_KEY },
      create: { key: DEFAULT_KEY, ...data },
      update: data,
    })
    return row
  } catch {
    // Stale Prisma Client — return fallback
    return FALLBACK_CONFIG
  }
}

/**
 * Validate that a value is a valid requireExplicitSemesterForImport boolean.
 */
export function validateRequireExplicitSemesterForImport(value: unknown): {
  ok: boolean
  error?: string
  parsed?: boolean
} {
  if (typeof value === 'boolean') {
    return { ok: true, parsed: value }
  }
  if (typeof value === 'string') {
    if (value === 'true') return { ok: true, parsed: true }
    if (value === 'false') return { ok: true, parsed: false }
  }
  return { ok: false, error: 'requireExplicitSemesterForImport 必须是 boolean (true/false)' }
}
