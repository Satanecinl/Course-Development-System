import type { ImportScheduleRecord, ImportParseStats, ImportParseQuality, ImportParseWarning } from '@/types/import'

export function computeImportParseStats(records: ImportScheduleRecord[]): ImportParseStats {
  const classNames = new Set<string>()
  const teachers = new Set<string>()
  const rooms = new Set<string>()

  for (const r of records) {
    if (r.class_info?.class_name) classNames.add(r.class_info.class_name)
    if (r.teacher) teachers.add(r.teacher)
    if (r.room) rooms.add(r.room)
  }

  return {
    class_count: classNames.size,
    total_records: records.length,
    teacher_count: teachers.size,
    room_count: rooms.size,
  }
}

const MERGED_CLASS_KEYWORDS = ['合班', '与', '多班']

function makeDuplicateKey(r: ImportScheduleRecord): string {
  return [
    r.class_info?.class_name ?? '',
    r.course ?? '',
    r.teacher ?? '',
    r.room ?? '',
    r.day_of_week,
    r.period_start,
    r.period_end,
    r.week_start,
    r.week_end,
    r.week_type,
  ].join('|')
}

export function computeImportParseQuality(records: ImportScheduleRecord[]): ImportParseQuality {
  let recordsWithStudentCount = 0
  let recordsMissingStudentCount = 0
  let recordsMissingTeacher = 0
  let recordsMissingRoom = 0
  let recordsMissingCourse = 0
  let recordsWithWeekConstraints = 0
  let recordsWithOddEvenWeek = 0
  let recordsWithHalfSemester = 0
  let recordsWithMergedClassRemark = 0

  const warnings: ImportParseWarning[] = []
  const duplicateMap = new Map<string, number[]>()

  for (let i = 0; i < records.length; i++) {
    const r = records[i]
    const className = r.class_info?.class_name ?? ''
    const course = r.course ?? ''
    const teacher = r.teacher ?? ''
    const room = r.room ?? ''
    const remark = r.remark ?? ''
    const weekConstraints = r.week_constraints ?? ''

    // student count
    if (r.student_count != null) {
      recordsWithStudentCount++
    } else {
      recordsMissingStudentCount++
      if (warnings.length < 100) {
        warnings.push({
          type: 'MISSING_STUDENT_COUNT',
          message: `缺少人数: ${className} - ${course}`,
          recordIndex: i,
          className,
          courseName: course,
          teacher,
          room,
        })
      }
    }

    // teacher
    if (!teacher) {
      recordsMissingTeacher++
      if (warnings.length < 100) {
        warnings.push({
          type: 'MISSING_TEACHER',
          message: `缺少教师: ${className} - ${course}`,
          recordIndex: i,
          className,
          courseName: course,
          room,
        })
      }
    }

    // room
    if (!room) {
      recordsMissingRoom++
      if (warnings.length < 100) {
        warnings.push({
          type: 'MISSING_ROOM',
          message: `缺少教室: ${className} - ${course}`,
          recordIndex: i,
          className,
          courseName: course,
          teacher,
        })
      }
    }

    // course
    if (!course) {
      recordsMissingCourse++
      if (warnings.length < 100) {
        warnings.push({
          type: 'MISSING_COURSE',
          message: `缺少课程: ${className}`,
          recordIndex: i,
          className,
          teacher,
          room,
        })
      }
    }

    // week constraints
    if (weekConstraints) {
      recordsWithWeekConstraints++
    }

    // odd/even week
    if (r.week_type === 'ODD' || r.week_type === 'EVEN' || weekConstraints.includes('单周') || weekConstraints.includes('双周')) {
      recordsWithOddEvenWeek++
    }

    // half semester
    if (r.week_type === 'FIRST_HALF' || r.week_type === 'SECOND_HALF' || weekConstraints.includes('前八周') || weekConstraints.includes('后八周')) {
      recordsWithHalfSemester++
    }

    // merged class remark
    if (MERGED_CLASS_KEYWORDS.some((kw) => remark.includes(kw))) {
      recordsWithMergedClassRemark++
    }

    // duplicate tracking
    const key = makeDuplicateKey(r)
    const arr = duplicateMap.get(key)
    if (arr) {
      arr.push(i)
    } else {
      duplicateMap.set(key, [i])
    }
  }

  // duplicate warnings
  let duplicateCandidateCount = 0
  for (const [, indices] of duplicateMap) {
    if (indices.length > 1) {
      duplicateCandidateCount += indices.length
      for (const idx of indices) {
        if (warnings.length >= 100) break
        const r = records[idx]
        warnings.push({
          type: 'DUPLICATE_CANDIDATE',
          message: `疑似重复: ${r.class_info?.class_name} - ${r.course} - ${r.teacher} - ${r.room} ${r.time_slot}`,
          recordIndex: idx,
          className: r.class_info?.class_name,
          courseName: r.course ?? undefined,
          teacher: r.teacher ?? undefined,
          room: r.room ?? undefined,
        })
      }
    }
  }

  return {
    totalRecords: records.length,
    recordsWithStudentCount,
    recordsMissingStudentCount,
    recordsMissingTeacher,
    recordsMissingRoom,
    recordsMissingCourse,
    recordsWithWeekConstraints,
    recordsWithOddEvenWeek,
    recordsWithHalfSemester,
    recordsWithMergedClassRemark,
    duplicateCandidateCount,
    warnings,
  }
}
