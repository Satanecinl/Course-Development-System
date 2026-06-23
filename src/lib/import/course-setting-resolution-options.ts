/**
 * L6-E1 Helper — Course Setting Resolution Options
 *
 * Loads existing Course / Teacher / ClassGroup records as resolution
 * reference options for the L6-E1 manual resolution UI. Users pick
 * existing entities when resolving missing courses, teachers, or
 * class groups during the xlsx course-setting import flow.
 *
 * READ-ONLY. No writes, no mutations, no side effects.
 *
 * - Course / Teacher are global (no semester filter).
 * - ClassGroup is global master data (L8-C5A): queries active canonical
 *   ClassGroups regardless of targetSemesterId.
 */

import type { PrismaClient } from '@prisma/client'
import { activeCanonicalClassGroupWhere } from '@/lib/classgroup-global-query'

export type CourseSettingResolutionOptionCourse = {
  id: number
  name: string
}

export type CourseSettingResolutionOptionTeacher = {
  id: number
  name: string
}

export type CourseSettingResolutionOptionClassGroup = {
  id: number
  name: string
  studentCount: number | null
}

export type CourseSettingResolutionOptions = {
  courses: CourseSettingResolutionOptionCourse[]
  teachers: CourseSettingResolutionOptionTeacher[]
  classGroups: CourseSettingResolutionOptionClassGroup[]
}

/**
 * Load resolution options from the database for the L6-E1 manual
 * resolution UI. All queries are read-only findMany/select.
 *
 * @param prisma  Active PrismaClient instance.
 * @param targetSemesterId  Kept for API compatibility; ClassGroup now uses
 *                          global active canonical query (L8-C5A).
 */
export async function loadResolutionOptions(
  prisma: PrismaClient,
  targetSemesterId: number,
): Promise<CourseSettingResolutionOptions> {
  void targetSemesterId // kept for API compat, no longer used for ClassGroup

  const [courses, teachers, classGroups] = await Promise.all([
    prisma.course.findMany({
      select: { id: true, name: true },
      orderBy: { name: 'asc' },
    }),
    prisma.teacher.findMany({
      select: { id: true, name: true },
      orderBy: { name: 'asc' },
    }),
    // L8-C5A: use global active canonical ClassGroup query
    prisma.classGroup.findMany({
      where: activeCanonicalClassGroupWhere(),
      select: { id: true, name: true, studentCount: true },
      orderBy: { name: 'asc' },
    }),
  ])

  return { courses, teachers, classGroups }
}
