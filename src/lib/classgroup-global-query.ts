/**
 * L8-C5A — Global Active Canonical ClassGroup Query
 *
 * Provides a unified Prisma where clause for querying the 227 authoritative
 * ClassGroups from 学院专业数据库.xlsx. These are global master data and
 * do not change with semester selection.
 *
 * Usage:
 *   import { activeCanonicalClassGroupWhere } from '@/lib/classgroup-global-query'
 *   const classGroups = await prisma.classGroup.findMany({
 *     where: activeCanonicalClassGroupWhere(),
 *     select: { id: true, name: true },
 *   })
 */

/**
 * Returns the standard where clause for querying active canonical ClassGroups.
 * These are the 227 reference_xlsx ClassGroups imported in L8-C4C0.
 */
export function activeCanonicalClassGroupWhere() {
  return {
    isActive: true,
    sourceType: 'reference_xlsx' as const,
  }
}

/**
 * Whether a model is a "global master data" table that should ignore semester
 * scoping in the admin DB page.
 */
export function isGlobalMasterTable(modelKey: string): boolean {
  return modelKey === 'classgroup'
}
