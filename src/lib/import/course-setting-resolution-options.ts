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
 * - ClassGroup is scoped by targetSemesterId.
 */

import type { PrismaClient } from '@prisma/client'

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
 * @param targetSemesterId  Semester to scope ClassGroup results to.
 *                          Course and Teacher are global.
 */
export async function loadResolutionOptions(
  prisma: PrismaClient,
  targetSemesterId: number,
): Promise<CourseSettingResolutionOptions> {
  const [courses, teachers, classGroups] = await Promise.all([
    prisma.course.findMany({
      select: { id: true, name: true },
      orderBy: { name: 'asc' },
    }),
    prisma.teacher.findMany({
      select: { id: true, name: true },
      orderBy: { name: 'asc' },
    }),
    prisma.classGroup.findMany({
      where: { semesterId: targetSemesterId },
      select: { id: true, name: true, studentCount: true },
      orderBy: { name: 'asc' },
    }),
  ])

  return { courses, teachers, classGroups }
}
