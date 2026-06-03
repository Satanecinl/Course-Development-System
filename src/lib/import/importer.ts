import { readFileSync, existsSync } from 'fs'
import { join } from 'path'
import type { ImportScheduleRecord, ImportParseQuality } from '@/types/import'
import type { ImportClassificationResult } from './quality-classifier'
import { computeImportParseQuality } from './parse-utils'
import { classifyImportRecords } from './quality-classifier'
import { prisma } from '@/lib/prisma'
import type { PrismaClient } from '@prisma/client'

// ── 类型 ──

export type ImportStrategy = 'UPSERT_BY_NATURAL_KEY'

export interface StudentCountUpdate {
  className: string
  studentCount: number
  existingStudentCount: number | null
}

export interface StudentCountConflict {
  className: string
  values: number[]
}

export interface PlannedClassGroups {
  createCount: number
  updateStudentCountCount: number
  names: string[]
  studentCountUpdates: StudentCountUpdate[]
  studentCountConflicts: StudentCountConflict[]
}

export interface PlannedTeachers {
  createCount: number
  missingCount: number
  names: string[]
  missingExamples: string[]
}

export interface PlannedCourses {
  createCount: number
  names: string[]
}

export interface PlannedRooms {
  createCount: number
  missingCount: number
  names: string[]
  missingExamples: string[]
}

export interface PlannedTeachingTasks {
  createCount: number
  sampleKeys: string[]
  duplicateKeyCount: number
}

export interface PlannedScheduleSlots {
  createCount: number
  missingRoomCount: number
  sampleKeys: string[]
  duplicateKeyCount: number
}

export interface MergedClassSample {
  course: string
  teacher: string | null
  room: string | null
  dayOfWeek: number
  periodStart: number
  periodEnd: number
  weekType: string
  classNames: string[]
}

export interface ImportPlan {
  batchId: number
  strategy: ImportStrategy
  recordCount: number

  quality: ImportParseQuality
  classification: ImportClassificationResult

  plannedClassGroups: PlannedClassGroups
  plannedTeachers: PlannedTeachers
  plannedCourses: PlannedCourses
  plannedRooms: PlannedRooms
  plannedTeachingTasks: PlannedTeachingTasks
  plannedScheduleSlots: PlannedScheduleSlots

  eventGroupCount: number
  teachingTaskGroupCount: number
  scheduleSlotGroupCount: number
  mergedClassSamples: MergedClassSample[]

  warnings: string[]
  blockingReasons: string[]
  canImport: boolean
}

export interface ImportExecutionResult {
  batchId: number
  strategy: ImportStrategy
  simulated: boolean
  canImport: boolean
  blockingReasons: string[]
  warnings: string[]

  classGroups: { created: number; updatedStudentCount: number; conflictCount: number }
  teachers: { created: number; missing: number }
  courses: { created: number }
  rooms: { created: number; missing: number }
  teachingTasks: { created: number; reused: number }
  teachingTaskClasses: { created: number }
  scheduleSlots: { created: number; reused: number; missingRoom: number }
}

// ── 辅助：time_slot → slotIndex ──

export function mapTimeSlotToIndex(timeSlot: string): number {
  const normalized = timeSlot.trim()
  if (normalized === '1,2' || normalized === '1.2') return 1
  if (normalized === '3,4' || normalized === '3.4') return 2
  if (normalized === '5,6' || normalized === '5.6') return 3
  if (normalized === '7,8' || normalized === '7.8') return 4
  if (normalized === '9,10' || normalized === '9.10') return 5
  if (normalized === '11,12' || normalized === '11.12') return 6
  if (normalized.startsWith('11,') || normalized.startsWith('11.')) return 6
  if (normalized.includes('中午')) return 7
  if (normalized.includes('12')) return 6
  const nums = normalized.split(/[,，.]/).map(Number)
  if (nums.length >= 2 && !isNaN(nums[0])) {
    const first = nums[0]
    if (first === 1) return 1
    if (first === 3) return 2
    if (first === 5) return 3
    if (first === 7) return 4
    if (first === 9) return 5
  }
  return 1
}

// ── 辅助：年份 / 培养方向提取 ──

const KNOWN_TRACKS = ['高本贯通', '现场工程师']

// 公共课/合班允许的弱匹配来源：跨 cohort 通常是公共课合班
// 列表与 K19 audit / K17-FIX-A 一致；本阶段不强制 gate，仅作为 warning 分类依据
const LIKELY_PUBLIC_COURSE_HINTS = [
  '大学英语', '大学日语', '大学语文', '高等数学',
  '习近平新时代中国特色社会主义思想概论',
  '毛泽东思想和中国特色社会主义理论体系概论',
  '思想道德与法治', '形势与政策', '创新创业教育',
  '职业生涯规划', '体育', '军事理论', '心理健康教育',
  '劳动教育', '信息技术', '计算机应用基础', '中华优秀传统文化',
  '美育', '职业素养', '大学生职业发展与就业指导',
]

// K19-FIX-A: extractYear 已废弃；统一使用 extractCohortYearFromClassName
// （原 extractYear 返回 string 形式的 cohort year；K19-FIX-A 强化为 number 形式
// 并支持短年份 24级/25级；旧调用点已全部迁移到 extractCohortYearFromClassName。）

/**
 * K19-FIX-A: 公共 helper — 从 class name 提取 cohort year。

/**
 * K19-FIX-A: 公共 helper — 从 class name 提取 cohort year。
 * 支持 `2024级` / `24级` 两种形式；非 class name 字段（course / file）会因锚定
 * 失败而返回 null。
 */
export function extractCohortYearFromClassName(name: string): number | null {
  if (!name) return null
  const m4 = name.match(/^(\d{4})级/)
  if (m4) return parseInt(m4[1], 10)
  // 短年份 24级 / 25级（必须以 ^ 开头，避免把 2024级 或 课程内数字 误判）
  const m2 = name.match(/^(\d{2})级/)
  if (m2) {
    const n = parseInt(m2[1], 10)
    // 约定：00-79 → 20xx；80-99 → 19xx
    return n <= 79 ? 2000 + n : 1900 + n
  }
  return null
}

function extractTrack(name: string): string | null {
  for (const t of KNOWN_TRACKS) {
    if (name.includes(t)) return t
  }
  return null
}

function hasExplicitYear(text: string): boolean {
  return /\d{4}级/.test(text)
}

function hasExplicitTrack(text: string): boolean {
  for (const t of KNOWN_TRACKS) {
    if (text.includes(t)) return true
  }
  return false
}

/**
 * K19-FIX-A: 按 cohort year + track 严格过滤候选班级。
 * 在 K17 的 `filterCandidatesByYearAndTrack` 基础上增加：
 *   - candidate cohortYear 必须等于 baseClass cohortYear（两边都能解析时强制 equal）
 *   - candidate 无法解析 cohortYear 时，仅在 baseClass 也无 cohortYear 时保留
 *     （否则视为 ambiguous，丢弃以防跨 cohort 误合并）
 */
function filterCandidatesByYearAndTrack(
  baseClassName: string,
  keyword: string,
  candidates: { name: string }[],
): { name: string }[] {
  const baseYear = extractCohortYearFromClassName(baseClassName)
  const baseTrack = extractTrack(baseClassName)
  const keywordHasYear = hasExplicitYear(keyword)
  const keywordHasTrack = hasExplicitTrack(keyword)

  return candidates.filter((c) => {
    const cy = extractCohortYearFromClassName(c.name)
    const ct = extractTrack(c.name)

    // K19-FIX-A cohort strict equal:
    //   - baseClass 有 cohortYear，candidate 也必须 == baseYear
    //   - baseClass 有 cohortYear，candidate 无 cohortYear → reject（无法保证同 cohort）
    if (baseYear != null) {
      if (cy == null) return false
      if (cy !== baseYear) return false
    } else {
      // baseClass 无 cohortYear：candidate 有 cohortYear 时显式 year remark
      // 才允许；keyword 显式带 year 时保留（filter 留 keywordHasYear 路径），
      // 否则仅允许同样无 cohortYear 的 candidate
      if (cy != null && !keywordHasYear) return false
    }

    // 培养方向约束：keyword 不显式含方向时，候选班级必须与 baseClass 同方向
    if (!keywordHasTrack && baseTrack) {
      if (ct && ct !== baseTrack) return false
    }

    return true
  })
}

// ── 辅助：合班解析 ──

function isMeaningfulRemarkKeyword(keyword: string): boolean {
  const trimmed = keyword.trim()
  if (trimmed.length === 0) return false
  return /[\p{Letter}\p{Number}]/u.test(trimmed)
}

export function parseRemarkKeywords(remark: string | null): string[] {
  if (!remark) return []
  const core = remark.replace(/^与/, '').replace(/合班$/, '').trim()
  if (!core || !isMeaningfulRemarkKeyword(core)) return []
  const keywords: string[] = [core]
  const numMatch = core.match(/([一-龥]+?)(\d+)$/)
  if (numMatch) {
    const prefix = numMatch[1]
    const num = numMatch[2]
    for (let len = 2; len <= Math.min(4, prefix.length); len++) {
      const kw = prefix.slice(-len) + num
      if (isMeaningfulRemarkKeyword(kw)) keywords.push(kw)
    }
    if (num.length >= 2 && prefix.length >= 2) {
      const kw = prefix.slice(-2) + num[0]
      if (isMeaningfulRemarkKeyword(kw)) keywords.push(kw)
    }
  }
  return keywords
}

/**
 * K19-FIX-A-IMPORT-MATCHING-COHORT-GUARD
 * ClassGroup 合班匹配：exact-match-first + cohort strict guard。
 *
 * 策略：
 *   1. 先按 cohort/track 过滤候选集（filterCandidatesByYearAndTrack 已确保 cohort 相等）
 *   2. 在过滤后集合上做 exact name match（c.name === baseClassName 或 === keyword）
 *   3. 仅有 1 个 exact 命中时直接采用
 *   4. 没有 exact 时，fallback 到 .includes() / subsequence 弱匹配
 *      - 弱匹配命中 0 → 静默
 *      - 弱匹配命中 1 → **采用**，emit COHORT_WEAK_MATCH_KEPT（warning 强度高，
 *        表示通过了 cohort filter 但仅为弱匹配）
 *      - 弱匹配命中 ≥2 → 标记 AMBIGUOUS_CLASSGROUP_MATCH，**不自动 link**
 *   5. remark 的隐式简称（无显式 2024级）始终在 cohort 过滤下做 fallback，
 *      多于 1 命中时 ambiguous，不自动 link
 */
export async function findMergedClassNames(
  keywords: string[],
  baseClassName: string,
  allClasses: { name: string }[],
  warnings?: string[],
): Promise<string[]> {
  const results: string[] = []
  const seen = new Set<string>()

  for (const kw of keywords) {
    if (kw.length < 2) continue

    // 步骤 1：cohort / track 严格过滤
    const filtered = filterCandidatesByYearAndTrack(baseClassName, kw, allClasses)

    // 步骤 2：exact-match-first
    const exactMatches: string[] = []
    for (const c of filtered) {
      if (c.name === baseClassName || seen.has(c.name)) continue
      if (c.name === kw) {
        exactMatches.push(c.name)
      }
    }

    if (exactMatches.length === 1) {
      seen.add(exactMatches[0])
      results.push(exactMatches[0])
      continue
    }
    if (exactMatches.length > 1) {
      if (warnings) {
        warnings.push(
          `AMBIGUOUS_CLASSGROUP_MATCH: keyword "${kw}" exact-matches ${exactMatches.length} classes: ${exactMatches.join(', ')}`,
        )
      }
      continue
    }

    // 步骤 3：fallback - includes() 弱匹配
    const includesMatches: string[] = []
    for (const c of filtered) {
      if (c.name === baseClassName || seen.has(c.name)) continue
      if (c.name.includes(kw)) {
        includesMatches.push(c.name)
      }
    }

    if (includesMatches.length === 1) {
      // K19-FIX-A: 单个 weak 匹配通过 cohort filter 到达，cohort 已严格 equal。
      // weak 不如 exact 可靠，但 cohort 一致且无歧义，保留 link 并记录 warning 以便审计。
      seen.add(includesMatches[0])
      results.push(includesMatches[0])
      if (warnings) {
        warnings.push(
          `COHORT_WEAK_MATCH_KEPT (weak-match, kept): keyword "${kw}" weak-matched 1 candidate "${includesMatches[0]}" after cohort filter`,
        )
      }
      continue
    }
    if (includesMatches.length > 1) {
      // 歧义保护：弱匹配多于 1 命中，**不自动 link**
      if (warnings) {
        warnings.push(
          `AMBIGUOUS_CLASSGROUP_MATCH: keyword "${kw}" weak-matches ${includesMatches.length} classes: ${includesMatches.join(', ')} — not auto-linked`,
        )
      }
      continue
    }

    // 步骤 4：subsequence 弱匹配（fallback of fallback）
    if (includesMatches.length === 0) {
      const subseqMatches: string[] = []
      const chars = [...kw]
      for (const c of filtered) {
        if (c.name === baseClassName || seen.has(c.name)) continue
        let pos = 0
        let matched = true
        for (const ch of chars) {
          pos = c.name.indexOf(ch, pos)
          if (pos === -1) { matched = false; break }
          pos++
        }
        if (matched) {
          subseqMatches.push(c.name)
        }
      }

      if (subseqMatches.length === 1) {
        seen.add(subseqMatches[0])
        results.push(subseqMatches[0])
        if (warnings) {
          warnings.push(
            `COHORT_WEAK_MATCH_KEPT (subseq-match, kept): keyword "${kw}" subseq-matched 1 candidate "${subseqMatches[0]}" after cohort filter`,
          )
        }
      } else if (subseqMatches.length > 1) {
        if (warnings) {
          warnings.push(
            `AMBIGUOUS_CLASSGROUP_MATCH: keyword "${kw}" subseq-matches ${subseqMatches.length} classes: ${subseqMatches.join(', ')} — not auto-linked`,
          )
        }
      }
    }
  }

  return results
}

// ── 辅助：构建 eventKey ──

export function buildEventKey(r: ImportScheduleRecord): string {
  return [
    r.course ?? '',
    r.teacher ?? '**NULL_TEACHER**',
    r.room ?? '**NULL_ROOM**',
    r.day_of_week,
    r.period_start,
    r.period_end,
    r.week_type,
    r.week_start,
    r.week_end,
  ].join('|')
}

// ── 事务回滚信号 ──

class RollbackSignal {
  constructor(public readonly result: ImportExecutionResult) {}
}

// ── 公共：prepareRecords（读取 + 质量检查 + 事件聚合）──

interface PreparedData {
  records: ImportScheduleRecord[]
  quality: ImportParseQuality
  classification: ImportClassificationResult
  classNames: Set<string>
  teacherNames: Set<string>
  courseNames: Set<string>
  roomNames: Set<string>
  eventKeyToClassNames: Map<string, Set<string>>
  taskKeyToClassNames: Map<string, Set<string>>
  taskKeyToRecord: Map<string, ImportScheduleRecord>
  taskKeys: string[]
  slotKeyToRecord: Map<string, ImportScheduleRecord>
  slotKeys: string[]
  missingTeacherCount: number
  missingRoomCount: number
  mergeWarnings: string[]
}

async function prepareRecords(batchId: number, targetSemesterId?: number): Promise<PreparedData> {
  const batch = await prisma.importBatch.findUnique({ where: { id: batchId } })
  if (!batch) throw new Error(`ImportBatch ${batchId} 不存在`)
  if (batch.status !== 'pending') throw new Error(`ImportBatch ${batchId} 状态为 "${batch.status}"，只允许 pending 状态`)

  // Validate batch semesterId against target semester
  if (batch.semesterId != null && targetSemesterId != null && batch.semesterId !== targetSemesterId) {
    throw new Error(`ImportBatch ${batchId} 属于学期 ${batch.semesterId}，不能导入到学期 ${targetSemesterId}`)
  }

  const jsonPath = join(process.cwd(), batch.parsedJsonPath!)
  if (!existsSync(jsonPath)) throw new Error(`解析文件不存在: ${jsonPath}`)
  const records: ImportScheduleRecord[] = JSON.parse(readFileSync(jsonPath, 'utf-8'))

  const quality = computeImportParseQuality(records)
  const classification = classifyImportRecords(records)

  const classNames = new Set<string>()
  const teacherNames = new Set<string>()
  const courseNames = new Set<string>()
  const roomNames = new Set<string>()
  let missingTeacherCount = 0
  let missingRoomCount = 0

  for (const r of records) {
    const cn = r.class_info?.class_name
    if (cn) classNames.add(cn)
    if (r.teacher) teacherNames.add(r.teacher)
    else missingTeacherCount++
    if (r.course) courseNames.add(r.course)
    if (r.room) roomNames.add(r.room)
    else missingRoomCount++
  }

  // 事件聚合
  const eventKeyToClassNames = new Map<string, Set<string>>()
  const mergeWarnings: string[] = []
  for (const r of records) {
    const ek = buildEventKey(r)
    let set = eventKeyToClassNames.get(ek)
    if (!set) { set = new Set(); eventKeyToClassNames.set(ek, set) }
    set.add(r.class_info?.class_name ?? '')
    if (r.remark) {
      const keywords = parseRemarkKeywords(r.remark)
      if (keywords.length > 0) {
        const allClasses = [...classNames].map((n) => ({ name: n }))
        const merged = await findMergedClassNames(keywords, r.class_info?.class_name ?? '', allClasses, mergeWarnings)
        for (const m of merged) set.add(m)
      }
    }
  }

  // TeachingTask 聚合
  const taskKeySet = new Set<string>()
  const taskKeys: string[] = []
  const taskKeyToClassNames = new Map<string, Set<string>>()
  const taskKeyToRecord = new Map<string, ImportScheduleRecord>()

  for (const r of records) {
    const ek = buildEventKey(r)
    const classGroupSet = eventKeyToClassNames.get(ek)
    const canonicalSet = classGroupSet ? [...classGroupSet].sort().join('|') : (r.class_info?.class_name ?? '')
    const taskKey = [r.course ?? '', r.teacher ?? '**NULL_TEACHER**', r.week_type, r.week_start, r.week_end, canonicalSet].join('|')
    if (!taskKeySet.has(taskKey)) {
      taskKeySet.add(taskKey)
      taskKeys.push(taskKey)
      taskKeyToClassNames.set(taskKey, classGroupSet ?? new Set([r.class_info?.class_name ?? '']))
      taskKeyToRecord.set(taskKey, r)
    }
  }

  // ScheduleSlot 聚合
  const slotKeySet = new Set<string>()
  const slotKeys: string[] = []
  const slotKeyToRecord = new Map<string, ImportScheduleRecord>()

  for (const r of records) {
    const ek = buildEventKey(r)
    const classGroupSet = eventKeyToClassNames.get(ek)
    const canonicalSet = classGroupSet ? [...classGroupSet].sort().join('|') : (r.class_info?.class_name ?? '')
    const taskKey = [r.course ?? '', r.teacher ?? '**NULL_TEACHER**', r.week_type, r.week_start, r.week_end, canonicalSet].join('|')
    const slotKey = [taskKey, r.room ?? '**NULL_ROOM**', r.day_of_week, mapTimeSlotToIndex(r.time_slot)].join('|')
    if (!slotKeySet.has(slotKey)) {
      slotKeySet.add(slotKey)
      slotKeys.push(slotKey)
      slotKeyToRecord.set(slotKey, r)
    }
  }

  return { records, quality, classification, classNames, teacherNames, courseNames, roomNames, eventKeyToClassNames, taskKeyToClassNames, taskKeyToRecord, taskKeys, slotKeyToRecord, slotKeys, missingTeacherCount, missingRoomCount, mergeWarnings }
}

// ── 事务内真实写入逻辑 ──

type TxClient = Parameters<Parameters<typeof prisma.$transaction>[0]>[0]

async function executeImportInTransaction(
  tx: TxClient,
  prepared: PreparedData,
  batchId: number,
  semesterId: number,
): Promise<ImportExecutionResult> {
  const { records, classification, classNames, teacherNames, courseNames, roomNames, taskKeyToClassNames, taskKeyToRecord, taskKeys, slotKeyToRecord, slotKeys, missingTeacherCount, missingRoomCount } = prepared

  const warnings: string[] = [...classification.warnings, ...prepared.mergeWarnings]
  let classGroupCreated = 0
  let classGroupUpdated = 0
  let classGroupConflict = 0
  let teacherCreated = 0
  let courseCreated = 0
  let roomCreated = 0
  let taskCreated = 0
  let taskReused = 0
  let ttcCreated = 0
  let slotCreated = 0
  let slotReused = 0

  // ── 1. ClassGroup ──
  const classGroupMap = new Map<string, number>()
  const studentCountByClass = new Map<string, Set<number>>()
  for (const r of records) {
    const cn = r.class_info?.class_name
    if (!cn || r.student_count == null) continue
    let set = studentCountByClass.get(cn)
    if (!set) { set = new Set(); studentCountByClass.set(cn, set) }
    set.add(r.student_count)
  }

  for (const name of classNames) {
    const values = studentCountByClass.get(name)
    const studentCount = values ? [...values][0] : null
    const existing = await tx.classGroup.findFirst({ where: { semesterId, name }, select: { id: true, studentCount: true } })
    if (existing) {
      classGroupMap.set(name, existing.id)
      if (existing.studentCount == null && studentCount != null) {
        await tx.classGroup.update({ where: { id: existing.id }, data: { studentCount } })
        classGroupUpdated++
      }
      if (values && values.size > 1) {
        classGroupConflict++
        warnings.push(`CLASS_STUDENT_COUNT_CONFLICT: ${name} 出现多个不同人数: ${[...values].sort((a, b) => a - b).join(', ')}`)
      }
    } else {
      const cg = await tx.classGroup.create({ data: { name, studentCount, semesterId } })
      classGroupMap.set(name, cg.id)
      classGroupCreated++
    }
  }

  // ── 2. Teacher ──
  const teacherMap = new Map<string, number>()
  for (const name of teacherNames) {
    const existing = await tx.teacher.findUnique({ where: { name }, select: { id: true } })
    if (existing) {
      teacherMap.set(name, existing.id)
    } else {
      const t = await tx.teacher.create({ data: { name } })
      teacherMap.set(name, t.id)
      teacherCreated++
    }
  }

  // ── 3. Course ──
  const courseMap = new Map<string, number>()
  for (const name of courseNames) {
    const existing = await tx.course.findUnique({ where: { name }, select: { id: true } })
    if (existing) {
      courseMap.set(name, existing.id)
    } else {
      const c = await tx.course.create({ data: { name } })
      courseMap.set(name, c.id)
      courseCreated++
    }
  }

  // ── 4. Room ──
  const roomMap = new Map<string, number>()
  for (const name of roomNames) {
    const existing = await tx.room.findUnique({ where: { name }, select: { id: true } })
    if (existing) {
      roomMap.set(name, existing.id)
    } else {
      const r = await tx.room.create({ data: { name, capacity: 50, type: 'NORMAL' } })
      roomMap.set(name, r.id)
      roomCreated++
    }
  }

  // ── 5. TeachingTask + TeachingTaskClass ──
  const taskKeyToTaskId = new Map<string, number>()

  for (const taskKey of taskKeys) {
    const parts = taskKey.split('|')
    const [courseName, teacherStr, weekType, startWeekStr, endWeekStr, remark, _canonicalSet] = parts
    const teacherName = teacherStr === '**NULL_TEACHER**' ? null : teacherStr
    const startWeek = parseInt(startWeekStr, 10)
    const endWeek = parseInt(endWeekStr, 10)

    const courseId = courseMap.get(courseName)
    if (!courseId) continue

    const teacherId = teacherName ? (teacherMap.get(teacherName) ?? null) : null
    const classGroupNames = taskKeyToClassNames.get(taskKey) ?? new Set<string>()
    const classGroupIds = [...classGroupNames].map((n) => classGroupMap.get(n)).filter((id): id is number => id != null).sort((a, b) => a - b)

    // 查找已有 TeachingTask：同 semesterId + courseId + teacherId + weekType + startWeek + endWeek + remark
    const existingTasks = await tx.teachingTask.findMany({
      where: { semesterId, courseId, teacherId, weekType, startWeek, endWeek, remark: remark || null },
      include: { taskClasses: { select: { classGroupId: true } } },
    })

    // 比较 canonicalClassGroupSet
    let matchedTask: typeof existingTasks[number] | null = null
    for (const et of existingTasks) {
      const existingSet = et.taskClasses.map((tc) => tc.classGroupId).sort((a, b) => a - b)
      if (existingSet.length === classGroupIds.length && existingSet.every((id, i) => id === classGroupIds[i])) {
        matchedTask = et
        break
      }
    }

    if (matchedTask) {
      taskKeyToTaskId.set(taskKey, matchedTask.id)
      taskReused++
    } else {
      // K19-FIX-A: 在创建 TeachingTask + TTC 前进行 cross-cohort final assert
      // 1) 收集将要链接的 classGroup 名称 + cohort year
      const cgNamesForAudit: string[] = []
      for (const cgId of classGroupIds) {
        // 查 cgName：从 records 找对应 classInfo（cgId → cgName via classGroupMap 反查）
        // 实际实现：classGroupMap 是 name → id，遍历 classGroupIds 反查 name
        for (const [n, id] of classGroupMap.entries()) {
          if (id === cgId) {
            cgNamesForAudit.push(n)
            break
          }
        }
      }
      const cohortYearSet = new Set<number>()
      for (const n of cgNamesForAudit) {
        const y = extractCohortYearFromClassName(n)
        if (y != null) cohortYearSet.add(y)
      }
      const isPublicCourse = courseName
        ? LIKELY_PUBLIC_COURSE_HINTS.some((h) => courseName.includes(h))
        : false

      let allowedCrossCohort = false
      if (cohortYearSet.size > 1) {
        if (isPublicCourse) {
          warnings.push(
            `LEGAL_PUBLIC_CROSS_COHORT: course="${courseName}" links ${cohortYearSet.size} cohorts (${[...cohortYearSet].sort().join(',')}) — allowed as public-course 合班`,
          )
          allowedCrossCohort = true
        } else {
          warnings.push(
            `LIKELY_ERROR_CROSS_COHORT: course="${courseName}" links ${cohortYearSet.size} cohorts (${[...cohortYearSet].sort().join(',')}) — not a known public course; review manually`,
          )
        }
      }

      const task = await tx.teachingTask.create({
        data: {
          courseId,
          teacherId,
          weekType,
          startWeek,
          endWeek,
          remark: remark || null,
          importBatchId: batchId,
          semesterId,
        },
      })
      taskKeyToTaskId.set(taskKey, task.id)
      taskCreated++

      // TeachingTaskClass
      for (const cgId of classGroupIds) {
        await tx.teachingTaskClass.create({ data: { teachingTaskId: task.id, classGroupId: cgId } })
        ttcCreated++
      }
      // allowedCrossCohort 当前仅作 warning-first 占位，标志未使用
      void allowedCrossCohort
    }
  }

  // ── 6. ScheduleSlot ──
  for (const slotKey of slotKeys) {
    const parts = slotKey.split('|')
    // slotKey = taskKey + room + dayOfWeek + slotIndex
    // taskKey 本身有 7 段，所以 slotKey 共 11 段
    const roomStr = parts[parts.length - 3]
    const dayOfWeek = parseInt(parts[parts.length - 2], 10)
    const slotIndex = parseInt(parts[parts.length - 1], 10)

    // 重建 taskKey
    const taskKey = parts.slice(0, parts.length - 3).join('|')

    const teachingTaskId = taskKeyToTaskId.get(taskKey)
    if (!teachingTaskId) continue

    const roomName = roomStr === '**NULL_ROOM**' ? null : roomStr
    const roomId = roomName ? (roomMap.get(roomName) ?? null) : null

    // 查找已有 ScheduleSlot（去重 key: semesterId + teachingTaskId + dayOfWeek + slotIndex + roomId）
    const existingSlot = await tx.scheduleSlot.findFirst({
      where: { semesterId, teachingTaskId, dayOfWeek, slotIndex, roomId },
    })

    if (existingSlot) {
      slotReused++
    } else {
      await tx.scheduleSlot.create({
        data: { teachingTaskId, roomId, dayOfWeek, slotIndex, importBatchId: batchId, semesterId },
      })
      slotCreated++
    }
  }

  return {
    batchId,
    strategy: 'UPSERT_BY_NATURAL_KEY',
    simulated: true,
    canImport: true,
    blockingReasons: [],
    warnings,
    classGroups: { created: classGroupCreated, updatedStudentCount: classGroupUpdated, conflictCount: classGroupConflict },
    teachers: { created: teacherCreated, missing: missingTeacherCount },
    courses: { created: courseCreated },
    rooms: { created: roomCreated, missing: missingRoomCount },
    teachingTasks: { created: taskCreated, reused: taskReused },
    teachingTaskClasses: { created: ttcCreated },
    scheduleSlots: { created: slotCreated, reused: slotReused, missingRoom: missingRoomCount },
  }
}

// ── 公共：dry-run ──

export async function confirmImportBatchDryRun(
  batchId: number,
  strategy: ImportStrategy,
  semesterId: number,
): Promise<ImportPlan> {
  const prepared = await prepareRecords(batchId, semesterId)
  const { quality, classification, records, classNames, teacherNames, courseNames, roomNames, eventKeyToClassNames, taskKeyToClassNames, taskKeys, slotKeys, missingTeacherCount, missingRoomCount, mergeWarnings } = prepared

  if (!classification.canImport) {
    return {
      batchId, strategy, recordCount: records.length, quality, classification,
      plannedClassGroups: { createCount: 0, updateStudentCountCount: 0, names: [], studentCountUpdates: [], studentCountConflicts: [] },
      plannedTeachers: { createCount: 0, missingCount: 0, names: [], missingExamples: [] },
      plannedCourses: { createCount: 0, names: [] },
      plannedRooms: { createCount: 0, missingCount: 0, names: [], missingExamples: [] },
      plannedTeachingTasks: { createCount: 0, sampleKeys: [], duplicateKeyCount: 0 },
      plannedScheduleSlots: { createCount: 0, missingRoomCount: 0, sampleKeys: [], duplicateKeyCount: 0 },
      eventGroupCount: 0, teachingTaskGroupCount: 0, scheduleSlotGroupCount: 0, mergedClassSamples: [],
      warnings: [...classification.warnings, ...mergeWarnings], blockingReasons: classification.blockingReasons, canImport: false,
    }
  }

  // 查询已有实体
  const [existingClassGroups, existingTeachers, existingCourses, existingRooms] = await Promise.all([
    prisma.classGroup.findMany({ where: { semesterId, name: { in: [...classNames] } }, select: { name: true, studentCount: true } }),
    prisma.teacher.findMany({ where: { name: { in: [...teacherNames] } }, select: { name: true } }),
    prisma.course.findMany({ where: { name: { in: [...courseNames] } }, select: { name: true } }),
    prisma.room.findMany({ where: { name: { in: [...roomNames] } }, select: { name: true } }),
  ])

  const existingClassGroupMap = new Map(existingClassGroups.map((c) => [c.name, c.studentCount]))
  const existingTeacherNames = new Set(existingTeachers.map((t) => t.name))
  const existingCourseNames = new Set(existingCourses.map((c) => c.name))
  const existingRoomNames = new Set(existingRooms.map((r) => r.name))

  const newClassGroupNames = [...classNames].filter((n) => !existingClassGroupMap.has(n))
  const newTeacherNames = [...teacherNames].filter((n) => !existingTeacherNames.has(n))
  const newCourseNames = [...courseNames].filter((n) => !existingCourseNames.has(n))
  const newRoomNames = [...roomNames].filter((n) => !existingRoomNames.has(n))

  // studentCount 更新计划
  const studentCountByClass = new Map<string, Set<number>>()
  for (const r of records) {
    const cn = r.class_info?.class_name
    if (!cn || r.student_count == null) continue
    let set = studentCountByClass.get(cn)
    if (!set) { set = new Set(); studentCountByClass.set(cn, set) }
    set.add(r.student_count)
  }
  const studentCountUpdates: StudentCountUpdate[] = []
  const studentCountConflicts: StudentCountConflict[] = []
  let updateStudentCountCount = 0
  for (const [cn, values] of studentCountByClass) {
    if (values.size > 1) studentCountConflicts.push({ className: cn, values: [...values].sort((a, b) => a - b) })
    const studentCount = [...values][0]
    const existing = existingClassGroupMap.get(cn)
    if (existing !== undefined && existing !== studentCount) {
      updateStudentCountCount++
      studentCountUpdates.push({ className: cn, studentCount, existingStudentCount: existing })
    }
  }

  // 合班样本
  const mergedClassSamples: MergedClassSample[] = []
  for (const [taskKey, clsSet] of taskKeyToClassNames) {
    if (clsSet.size > 1 && mergedClassSamples.length < 20) {
      const parts = taskKey.split('|')
      mergedClassSamples.push({ course: parts[0], teacher: parts[1] === '**NULL_TEACHER**' ? null : parts[1], room: null, dayOfWeek: 0, periodStart: 0, periodEnd: 0, weekType: parts[2], classNames: [...clsSet].sort() })
    }
  }

  const missingTeacherExamples = records.filter((r) => !r.teacher).slice(0, 5).map((r) => `${r.class_info?.class_name ?? '?'} - ${r.course ?? '?'}`)
  const missingRoomExamples = records.filter((r) => !r.room).slice(0, 5).map((r) => `${r.class_info?.class_name ?? '?'} - ${r.course ?? '?'}`)

  const planWarnings: string[] = [...classification.warnings, ...mergeWarnings]
  if (missingTeacherCount > 0) planWarnings.push(`${missingTeacherCount} 条记录缺教师，将写入 teacherId=null`)
  if (missingRoomCount > 0) planWarnings.push(`${missingRoomCount} 条记录缺教室，将写入 roomId=null`)
  for (const conflict of studentCountConflicts) planWarnings.push(`CLASS_STUDENT_COUNT_CONFLICT: ${conflict.className} 出现多个不同人数: ${conflict.values.join(', ')}`)

  // 统计 duplicateKeyCount
  const taskKeyAllSet = new Set<string>()
  let taskDupCount = 0
  for (const r of records) {
    const ek = buildEventKey(r)
    const cgs = eventKeyToClassNames.get(ek)
    const cs = cgs ? [...cgs].sort().join('|') : (r.class_info?.class_name ?? '')
    const tk = [r.course ?? '', r.teacher ?? '**NULL_TEACHER**', r.week_type, r.week_start, r.week_end, r.remark ?? '', cs].join('|')
    if (taskKeyAllSet.has(tk)) taskDupCount++
    else taskKeyAllSet.add(tk)
  }
  const slotKeyAllSet = new Set<string>()
  let slotDupCount = 0
  for (const r of records) {
    const ek = buildEventKey(r)
    const cgs = eventKeyToClassNames.get(ek)
    const cs = cgs ? [...cgs].sort().join('|') : (r.class_info?.class_name ?? '')
    const tk = [r.course ?? '', r.teacher ?? '**NULL_TEACHER**', r.week_type, r.week_start, r.week_end, r.remark ?? '', cs].join('|')
    const sk = [tk, r.room ?? '**NULL_ROOM**', r.day_of_week, mapTimeSlotToIndex(r.time_slot)].join('|')
    if (slotKeyAllSet.has(sk)) slotDupCount++
    else slotKeyAllSet.add(sk)
  }

  return {
    batchId, strategy, recordCount: records.length, quality, classification,
    plannedClassGroups: { createCount: newClassGroupNames.length, updateStudentCountCount, names: newClassGroupNames, studentCountUpdates, studentCountConflicts },
    plannedTeachers: { createCount: newTeacherNames.length, missingCount: missingTeacherCount, names: newTeacherNames, missingExamples: missingTeacherExamples },
    plannedCourses: { createCount: newCourseNames.length, names: newCourseNames },
    plannedRooms: { createCount: newRoomNames.length, missingCount: missingRoomCount, names: newRoomNames, missingExamples: missingRoomExamples },
    plannedTeachingTasks: { createCount: taskKeyAllSet.size, sampleKeys: taskKeys.slice(0, 20), duplicateKeyCount: taskDupCount },
    plannedScheduleSlots: { createCount: slotKeyAllSet.size, missingRoomCount: missingRoomCount, sampleKeys: slotKeys.slice(0, 20), duplicateKeyCount: slotDupCount },
    eventGroupCount: eventKeyToClassNames.size, teachingTaskGroupCount: taskKeyAllSet.size, scheduleSlotGroupCount: slotKeyAllSet.size, mergedClassSamples,
    warnings: planWarnings, blockingReasons: classification.blockingReasons, canImport: true,
  }
}

// ── 公共：事务回滚演练 ──

export async function simulateConfirmImportBatch(
  batchId: number,
  strategy: ImportStrategy,
  semesterId: number,
): Promise<ImportExecutionResult> {
  const prepared = await prepareRecords(batchId, semesterId)

  if (!prepared.classification.canImport) {
    return {
      batchId, strategy, simulated: true, canImport: false,
      blockingReasons: prepared.classification.blockingReasons, warnings: prepared.classification.warnings,
      classGroups: { created: 0, updatedStudentCount: 0, conflictCount: 0 },
      teachers: { created: 0, missing: prepared.missingTeacherCount },
      courses: { created: 0 },
      rooms: { created: 0, missing: prepared.missingRoomCount },
      teachingTasks: { created: 0, reused: 0 },
      teachingTaskClasses: { created: 0 },
      scheduleSlots: { created: 0, reused: 0, missingRoom: prepared.missingRoomCount },
    }
  }

  try {
    await prisma.$transaction(async (tx) => {
      const result = await executeImportInTransaction(tx, prepared, batchId, semesterId)
      throw new RollbackSignal(result)
    })
    // 理论上不会到达这里
    throw new Error('unexpected: transaction did not rollback')
  } catch (e) {
    if (e instanceof RollbackSignal) {
      return e.result
    }
    throw e
  }
}

// ── 公共：真实 confirm ──

export interface ConfirmImportResult {
  batchId: number
  strategy: ImportStrategy
  success: boolean
  canImport: boolean
  blockingReasons: string[]
  warnings: string[]
  createdTaskCount: number
  createdSlotCount: number
}

export async function confirmImportBatch(
  batchId: number,
  strategy: ImportStrategy,
  semesterId: number,
): Promise<ConfirmImportResult> {
  // 1. 读取 ImportBatch
  const batch = await prisma.importBatch.findUnique({ where: { id: batchId } })
  if (!batch) throw new Error(`ImportBatch ${batchId} 不存在`)
  if (batch.status !== 'pending') throw new Error(`ImportBatch ${batchId} 状态为 "${batch.status}"，只允许 pending 状态`)

  // Validate batch semesterId against target semester
  if (batch.semesterId != null && batch.semesterId !== semesterId) {
    throw new Error(`ImportBatch ${batchId} 属于学期 ${batch.semesterId}，不能导入到学期 ${semesterId}`)
  }

  // Bind legacy null semesterId to target semester
  if (batch.semesterId == null) {
    await prisma.importBatch.update({
      where: { id: batchId },
      data: { semesterId },
    })
  }

  // 2. 读取 parsedJson + quality gate
  const prepared = await prepareRecords(batchId, semesterId)

  // canImport=false → 直接返回，不修改 batch 状态
  if (!prepared.classification.canImport) {
    return {
      batchId, strategy, success: false, canImport: false,
      blockingReasons: prepared.classification.blockingReasons,
      warnings: prepared.classification.warnings,
      createdTaskCount: 0, createdSlotCount: 0,
    }
  }

  // 3. confirmed / confirming guard (scoped to target semester)
  const existingConfirmed = await prisma.importBatch.findFirst({
    where: { id: { not: batchId }, status: { in: ['confirmed', 'confirming'] }, semesterId },
    select: { id: true, status: true },
  })
  if (existingConfirmed) {
    throw new Error(`学期 ${semesterId} 已有 ImportBatch #${existingConfirmed.id} 状态为 "${existingConfirmed.status}"，不允许重复确认导入`)
  }

  // 4. 原子 pending → confirming
  const updateResult = await prisma.importBatch.updateMany({
    where: { id: batchId, status: 'pending' },
    data: { status: 'confirming' },
  })
  if (updateResult.count !== 1) {
    throw new Error(`ImportBatch ${batchId} 状态已变化，可能被并发操作修改`)
  }

  // 5. 执行真实 transaction
  try {
    const execResult = await prisma.$transaction(async (tx) => {
      const result = await executeImportInTransaction(tx, prepared, batchId, semesterId)

      // 在 transaction 内更新 ImportBatch 为 confirmed
      await tx.importBatch.update({
        where: { id: batchId },
        data: {
          status: 'confirmed',
          confirmedAt: new Date(),
          strategy,
          createdTaskCount: result.teachingTasks.created,
          createdSlotCount: result.scheduleSlots.created,
          warningsJson: JSON.stringify(result.warnings),
        },
      })

      return result
    })

    return {
      batchId, strategy, success: true, canImport: true,
      blockingReasons: [],
      warnings: execResult.warnings,
      createdTaskCount: execResult.teachingTasks.created,
      createdSlotCount: execResult.scheduleSlots.created,
    }
  } catch (e: unknown) {
    // transaction 外更新 status = failed
    const errorMessage = e instanceof Error ? e.message : String(e)
    try {
      await prisma.importBatch.update({
        where: { id: batchId },
        data: { status: 'failed', errorMessage },
      })
    } catch {
      // 如果连 status 更新也失败，至少抛出原始错误
    }
    throw e
  }
}
