import { prisma } from '@/lib/prisma'

export interface ResolvedSemester {
  id: number
  code: string
  name: string
}

/**
 * Resolve the semester to use for a scheduler operation.
 *
 * Priority:
 * 1. If explicit semesterId is provided, use it (must exist).
 * 2. If no semesterId, use the unique active semester.
 * 3. If no active semester exists, throw.
 * 4. If multiple active semesters exist, throw.
 */
export async function resolveSchedulerSemester(input?: {
  semesterId?: number | null
}): Promise<ResolvedSemester> {
  // 1. Explicit semesterId
  if (input?.semesterId != null) {
    const semester = await prisma.semester.findUnique({
      where: { id: input.semesterId },
    })
    if (!semester) {
      throw new Error(`SEMESTER_NOT_FOUND: semesterId=${input.semesterId}`)
    }
    return { id: semester.id, code: semester.code, name: semester.name }
  }

  // 2. Active semester
  const activeSemesters = await prisma.semester.findMany({
    where: { isActive: true },
    orderBy: { id: 'asc' },
  })

  if (activeSemesters.length === 0) {
    throw new Error('NO_ACTIVE_SEMESTER: No active semester found. Please set one active semester.')
  }

  if (activeSemesters.length > 1) {
    throw new Error(
      `MULTIPLE_ACTIVE_SEMESTERS: Found ${activeSemesters.length} active semesters. ` +
      `Please specify semesterId explicitly or keep only one active.`
    )
  }

  const semester = activeSemesters[0]
  return { id: semester.id, code: semester.code, name: semester.name }
}
