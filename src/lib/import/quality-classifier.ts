import type { ImportScheduleRecord } from '@/types/import'
import { computeImportParseQuality } from './parse-utils'

export type ImportIssueClassification = 'LIKELY_BUSINESS_EMPTY' | 'LIKELY_PARSE_BUG' | 'NEED_MANUAL_REVIEW'

/**
 * K19-FIX-A: Cross-cohort / matching warning categories emitted by the importer.
 * These are surfaced as `warnings` strings (backward-compatible) but the importer
 * can also pass them through `classifyImportWarnings` to get a structured
 * cross-cohort audit summary without changing the existing response shape.
 */
export type CrossCohortWarningKind =
  | 'LEGAL_PUBLIC_CROSS_COHORT'
  | 'LIKELY_ERROR_CROSS_COHORT'
  | 'AMBIGUOUS_CLASSGROUP_MATCH'
  | 'COHORT_MISMATCH_REJECTED'

export interface CrossCohortWarningSummary {
  LEGAL_PUBLIC_CROSS_COHORT: number
  LIKELY_ERROR_CROSS_COHORT: number
  AMBIGUOUS_CLASSGROUP_MATCH: number
  COHORT_MISMATCH_REJECTED: number
  total: number
}

const CROSS_COHORT_PREFIX_BY_KIND: Record<CrossCohortWarningKind, string> = {
  LEGAL_PUBLIC_CROSS_COHORT: 'LEGAL_PUBLIC_CROSS_COHORT',
  LIKELY_ERROR_CROSS_COHORT: 'LIKELY_ERROR_CROSS_COHORT',
  AMBIGUOUS_CLASSGROUP_MATCH: 'AMBIGUOUS_CLASSGROUP_MATCH',
  COHORT_MISMATCH_REJECTED: 'COHORT_MISMATCH_REJECTED',
}

/**
 * K19-FIX-A: 将 importer 产生的 warnings 字符串数组分类为 cross-cohort 类别。
 * 不修改 ImportClassificationResult / warnings 数组本身，仅作为附加审计。
 * 与 K19 audit / K17-FIX-A 协同：本阶段不强制 gate，仅作为 warning 分类。
 */
export function classifyCrossCohortWarnings(warnings: readonly string[]): CrossCohortWarningSummary {
  const summary: CrossCohortWarningSummary = {
    LEGAL_PUBLIC_CROSS_COHORT: 0,
    LIKELY_ERROR_CROSS_COHORT: 0,
    AMBIGUOUS_CLASSGROUP_MATCH: 0,
    COHORT_MISMATCH_REJECTED: 0,
    total: 0,
  }
  for (const w of warnings) {
    for (const [kind, prefix] of Object.entries(CROSS_COHORT_PREFIX_BY_KIND) as [CrossCohortWarningKind, string][]) {
      if (w.includes(prefix)) {
        summary[kind]++
        summary.total++
        break
      }
    }
  }
  return summary
}

export interface ClassifiedIssue {
  recordIndex: number
  record: ImportScheduleRecord
  classification: ImportIssueClassification
  reason: string
}

export interface ImportClassificationResult {
  recordsMissingTeacher: number
  recordsMissingRoom: number

  missingTeacherBusinessEmpty: number
  missingTeacherParseBug: number
  missingTeacherManualReview: number

  missingRoomBusinessEmpty: number
  missingRoomParseBug: number
  missingRoomManualReview: number

  teacherNameSuffixCandidates: ClassifiedIssue[]
  weekMarkerInCourse: ClassifiedIssue[]

  canImport: boolean
  blockingReasons: string[]
  warnings: string[]
}

const BUSINESS_EMPTY_TEACHER_KEYWORDS = ['体育', '职业素养', '企业学徒实训', '集中实践', '劳动教育', '入学教育', '军事理论']
const BUSINESS_EMPTY_ROOM_KEYWORDS = ['体育', '企业学徒实训', '现场工程师', '集中实践', '校外实训', '实习', '线上', '职业素养']
const ROOM_PATTERNS_IN_TEXT = /\d{1,2}-\d{3}[A-Z]?|林校\s*\d+|实训室|机房|报告厅/
const WEEK_MARKER_RE = /单周|双周|前八周|后八周/

const COMMON_SURNAMES = new Set('赵钱孙李周吴郑王冯陈褚卫蒋沈韩杨朱秦尤许何吕施张孔曹严华金魏陶姜戚谢邹喻柏水窦章云苏潘葛奚范彭郎鲁韦昌马苗凤花方俞任袁柳酆鲍史唐费廉岑薛雷贺倪汤滕殷罗毕郝邬安常乐于时傅皮卞齐康伍余元卜顾孟平黄和穆萧尹姚邵湛汪祁毛禹狄米贝明臧计伏成戴谈宋茅庞熊纪舒屈项祝董梁杜阮蓝闵席季麻强贾路娄危江童颜郭梅盛林刁钟徐邱骆高夏蔡田樊胡凌霍虞万支柯昝管卢莫经房裘缪干解应宗丁宣贲邓郁单杭洪包诸左右石崔吉钮龚程嵇邢滑裴陆荣翁荀羊於惠甄麹家封芮羿储靳汲邴糜松井段富巫乌焦巴弓牧隗山谷车侯宓蓬全郗班仰秋仲伊宫宁仇栾暴甘钭厉戎祖武符刘景詹束龙叶幸司韶郜黎蓟薄印宿白怀蒲邰从鄂索咸籍赖卓蔺屠蒙池乔阴鬱胥能苍双闻莘党翟谭贡劳逄姬申扶堵冉宰郦雍郤璩桑桂濮牛寿通边扈燕冀郏浦尚农温别庄晏柴瞿阎充慕连茹习宦艾鱼容向古易慎戈廖庾终暨居衡步都耿满弘匡国文寇广禄阙东殴殳沃利蔚越夔隆师巩厍聂晁勾敖融冷訾辛阚那简饶空曾毋沙乜养鞠须丰巢关蒯相查后荆红游竺权逯盖益桓公')

export function classifyMissingTeacher(r: ImportScheduleRecord): { category: ImportIssueClassification; reason: string } {
  const course = r.course ?? ''
  const remark = r.remark ?? ''

  if (BUSINESS_EMPTY_TEACHER_KEYWORDS.some((kw) => course.includes(kw))) {
    return { category: 'LIKELY_BUSINESS_EMPTY', reason: `课程"${course}"通常无教师` }
  }

  if (remark && /^[一-龥]{2,4}$/.test(remark.trim()) && COMMON_SURNAMES.has(remark.trim()[0])) {
    return { category: 'LIKELY_PARSE_BUG', reason: `remark="${remark}"疑似教师名` }
  }

  return { category: 'NEED_MANUAL_REVIEW', reason: '无法自动判断' }
}

export function classifyMissingRoom(r: ImportScheduleRecord): { category: ImportIssueClassification; reason: string } {
  const course = r.course ?? ''
  const remark = r.remark ?? ''

  if (BUSINESS_EMPTY_ROOM_KEYWORDS.some((kw) => course.includes(kw))) {
    return { category: 'LIKELY_BUSINESS_EMPTY', reason: `课程"${course}"通常无固定教室` }
  }

  if (ROOM_PATTERNS_IN_TEXT.test(course) || ROOM_PATTERNS_IN_TEXT.test(remark)) {
    return { category: 'LIKELY_PARSE_BUG', reason: '文本中含教室模式但未提取' }
  }

  return { category: 'NEED_MANUAL_REVIEW', reason: '无法自动判断' }
}

export function findTeacherNameSuffixCandidates(records: ImportScheduleRecord[]): ClassifiedIssue[] {
  const knownTeachers = new Set(records.filter((r) => r.teacher).map((r) => r.teacher!))
  const results: ClassifiedIssue[] = []

  for (let i = 0; i < records.length; i++) {
    const r = records[i]
    if (r.teacher || !r.course) continue
    const course = r.course
    for (const name of knownTeachers) {
      if (course.endsWith(name) && course.length > name.length) {
        results.push({
          recordIndex: i,
          record: r,
          classification: 'LIKELY_PARSE_BUG',
          reason: `course="${course}"以已知教师"${name}"结尾`,
        })
        break
      }
    }
  }

  return results
}

export function findWeekMarkerInCourse(records: ImportScheduleRecord[]): ClassifiedIssue[] {
  const results: ClassifiedIssue[] = []

  for (let i = 0; i < records.length; i++) {
    const r = records[i]
    if (r.course && WEEK_MARKER_RE.test(r.course)) {
      const match = r.course.match(WEEK_MARKER_RE)
      results.push({
        recordIndex: i,
        record: r,
        classification: 'LIKELY_PARSE_BUG',
        reason: `course="${r.course}"含周次标记"${match?.[0]}"`,
      })
    }
  }

  return results
}

export function classifyImportRecords(records: ImportScheduleRecord[]): ImportClassificationResult {
  const quality = computeImportParseQuality(records)

  let missingTeacherBusinessEmpty = 0
  let missingTeacherParseBug = 0
  let missingTeacherManualReview = 0
  let missingRoomBusinessEmpty = 0
  let missingRoomParseBug = 0
  let missingRoomManualReview = 0

  for (let i = 0; i < records.length; i++) {
    const r = records[i]

    if (!r.teacher) {
      const cls = classifyMissingTeacher(r)
      if (cls.category === 'LIKELY_BUSINESS_EMPTY') missingTeacherBusinessEmpty++
      else if (cls.category === 'LIKELY_PARSE_BUG') missingTeacherParseBug++
      else missingTeacherManualReview++
    }

    if (!r.room) {
      const cls = classifyMissingRoom(r)
      if (cls.category === 'LIKELY_BUSINESS_EMPTY') missingRoomBusinessEmpty++
      else if (cls.category === 'LIKELY_PARSE_BUG') missingRoomParseBug++
      else missingRoomManualReview++
    }
  }

  const teacherNameSuffixCandidates = findTeacherNameSuffixCandidates(records)
  const weekMarkerInCourse = findWeekMarkerInCourse(records)

  const blockingReasons: string[] = []
  const warnings: string[] = []

  if (quality.recordsMissingStudentCount > 0) {
    blockingReasons.push(`缺少人数记录: ${quality.recordsMissingStudentCount} 条`)
  }
  if (quality.recordsMissingCourse > 0) {
    blockingReasons.push(`缺少课程记录: ${quality.recordsMissingCourse} 条`)
  }
  if (quality.duplicateCandidateCount > 0) {
    blockingReasons.push(`疑似重复记录: ${quality.duplicateCandidateCount} 条`)
  }
  if (missingTeacherParseBug > 0) {
    blockingReasons.push(`教师解析缺陷: ${missingTeacherParseBug} 条`)
  }
  if (missingRoomParseBug > 0) {
    blockingReasons.push(`教室解析缺陷: ${missingRoomParseBug} 条`)
  }
  if (teacherNameSuffixCandidates.length > 0) {
    blockingReasons.push(`疑似教师粘连: ${teacherNameSuffixCandidates.length} 条`)
  }
  if (weekMarkerInCourse.length > 0) {
    blockingReasons.push(`course含周次标记: ${weekMarkerInCourse.length} 条`)
  }

  if (missingTeacherBusinessEmpty > 0) {
    warnings.push(`业务空值(缺教师): ${missingTeacherBusinessEmpty} 条`)
  }
  if (missingRoomBusinessEmpty > 0) {
    warnings.push(`业务空值(缺教室): ${missingRoomBusinessEmpty} 条`)
  }
  if (missingTeacherManualReview > 0) {
    warnings.push(`需人工审核(缺教师): ${missingTeacherManualReview} 条`)
  }
  if (missingRoomManualReview > 0) {
    warnings.push(`需人工审核(缺教室): ${missingRoomManualReview} 条`)
  }

  return {
    recordsMissingTeacher: quality.recordsMissingTeacher,
    recordsMissingRoom: quality.recordsMissingRoom,

    missingTeacherBusinessEmpty,
    missingTeacherParseBug,
    missingTeacherManualReview,

    missingRoomBusinessEmpty,
    missingRoomParseBug,
    missingRoomManualReview,

    teacherNameSuffixCandidates,
    weekMarkerInCourse,

    canImport: blockingReasons.length === 0,
    blockingReasons,
    warnings,
  }
}
