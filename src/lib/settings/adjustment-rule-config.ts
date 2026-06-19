/**
 * src/lib/settings/adjustment-rule-config.ts
 *
 * K38-B: Adjustment rule config service.
 * Manages AdjustmentRuleConfig singleton (defaultRecommendationLimit etc.).
 * Read helpers have fallback — never crash on missing row.
 */

import { prisma } from '@/lib/prisma'

export const DEFAULT_RECOMMENDATION_LIMIT = 5
export const MAX_RECOMMENDATION_LIMIT = 20
export const MIN_RECOMMENDATION_LIMIT = 1

export interface AdjustmentRuleConfigRow {
  id: number
  key: string
  defaultRecommendationLimit: number
}

/**
 * Resolve the effective config row.
 * Falls back to defaults if no config row exists (no crash).
 */
export async function getAdjustmentRuleConfig(): Promise<{
  source: 'database' | 'fallback'
  defaultRecommendationLimit: number
  configRow: AdjustmentRuleConfigRow | null
}> {
  try {
    const row = await prisma.adjustmentRuleConfig.findFirst()
    if (row) {
      return {
        source: 'database',
        defaultRecommendationLimit: row.defaultRecommendationLimit,
        configRow: row,
      }
    }
  } catch {
    // Table may not exist yet if migration hasn't run — fallback
  }
  return {
    source: 'fallback',
    defaultRecommendationLimit: DEFAULT_RECOMMENDATION_LIMIT,
    configRow: null,
  }
}

/** Get the effective default limit for recommendation when request doesn't provide one. */
export async function getDefaultRecommendationLimit(): Promise<{
  value: number
  source: 'database' | 'fallback'
}> {
  const cfg = await getAdjustmentRuleConfig()
  return { value: cfg.defaultRecommendationLimit, source: cfg.source }
}

/** Validate a proposed defaultRecommendationLimit (integer, range 1-20). */
export function validateDefaultRecommendationLimit(
  value: unknown,
): { valid: true; value: number } | { valid: false; message: string } {
  if (typeof value !== 'number' || !Number.isInteger(value)) {
    return { valid: false, message: 'defaultRecommendationLimit 必须为整数' }
  }
  if (value < MIN_RECOMMENDATION_LIMIT || value > MAX_RECOMMENDATION_LIMIT) {
    return {
      valid: false,
      message: `defaultRecommendationLimit 必须在 ${MIN_RECOMMENDATION_LIMIT}-${MAX_RECOMMENDATION_LIMIT} 之间`,
    }
  }
  return { valid: true, value }
}

/** Upsert the singleton config (used by API PATCH). Only updates allowed fields. */
export async function updateAdjustmentRuleConfig(input: {
  defaultRecommendationLimit?: number
}): Promise<AdjustmentRuleConfigRow> {
  if (input.defaultRecommendationLimit !== undefined) {
    const v = validateDefaultRecommendationLimit(input.defaultRecommendationLimit)
    if (!v.valid) throw new Error(v.message)
  }

  const updated = await prisma.adjustmentRuleConfig.upsert({
    where: { key: 'default' },
    update: {
      ...(input.defaultRecommendationLimit !== undefined
        ? { defaultRecommendationLimit: input.defaultRecommendationLimit }
        : {}),
    },
    create: {
      key: 'default',
      defaultRecommendationLimit:
        input.defaultRecommendationLimit ?? DEFAULT_RECOMMENDATION_LIMIT,
    },
  })

  return updated
}