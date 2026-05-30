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

function extractYear(name: string): string | null {
  const m = name.match(/^(\d{4})级/)
  return m ? m[1] : null
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

// 按年份和培养方向过滤候选班级
function filterCandidatesByYearAndTrack(
  baseClassName: string,
  keyword: string,
  candidates: { name: string }[],
): { name: string }[] {
  const baseYear = extractYear(baseClassName)
  const baseTrack = extractTrack(baseClassName)
  const keywordHasYear = hasExplicitYear(keyword)
  const keywordHasTrack = hasExplicitTrack(keyword)

  return candidates.filter((c) => {
    // 年份约束：keyword 不显式含年级时，候选班级必须与 baseClass 同年级
    if (!keywordHasYear && baseYear) {
      const cy = extractYear(c.name)
      if (cy && cy !== baseYear) return false
    }

    // 培养方向约束：keyword 不显式含方向时，候选班级必须与 baseClass 同方向
    if (!keywordHasTrack && baseTrack) {
      const ct = extractTrack(c.name)
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

    // 步骤 1：先按年份 / 培养方向过滤候选集
    const filtered = filterCandidatesByYearAndTrack(baseClassName, kw, allClasses)

    // 步骤 2：在过滤后的候选集上做 includes() 匹配
    const includesMatches: string[] = []
    for (const c of filtered) {
      if (c.name === baseClassName || seen.has(c.name)) continue
      if (c.name.includes(kw)) {
        includesMatches.push(c.name)
      }
    }

    if (includesMatches.length === 1) {
      seen.add(includesMatches[0])
      results.push(includesMatches[0])
    } else if (includesMatches.length > 1) {
      // 歧义保护：多个匹配时拒绝并记录 warning
      if (warnings) {
        warnings.push(
          `AMBIGUOUS_MATCH: keyword "${kw}" matches ${includesMatches.length} classes: ${includesMatches.join(', ')}`,
        )
      }
      continue
    }

    // 步骤 3：includes 无匹配时，在过滤候选集上做子序列匹配
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
      } else if (subseqMatches.length > 1) {
        if (warnings) {
          warnings.push(
            `AMBIGUOUS_SUBSEQ_MATCH: keyword "${kw}" matches ${subseqMatches.length} classes: ${subseqMatches.join(', ')}`,
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

async function prepareRecords(batchId: number): Promise<PreparedData> {
  const batch = await prisma.importBatch.findUnique({ where: { id: batchId } })
  if (!batch) throw new Error(`ImportBatch ${batchId} 不存在`)
  if (batch.status !== 'pending') throw new Error(`ImportBatch ${batchId} 状态为 "${batch.status}"，只允许 pending 状态`)

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
    const existing = await tx.classGroup.findUnique({ where: { name }, select: { id: true, studentCount: true } })
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
      const cg = await tx.classGroup.create({ data: { name, studentCount } })
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

    // 查找已有 TeachingTask：同 courseId + teacherId + weekType + startWeek + endWeek + remark
    const existingTasks = await tx.teachingTask.findMany({
      where: { courseId, teacherId, weekType, startWeek, endWeek, remark: remark || null },
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
      const task = await tx.teachingTask.create({
        data: {
          courseId,
          teacherId,
          weekType,
          startWeek,
          endWeek,
          remark: remark || null,
          importBatchId: batchId,
        },
      })
      taskKeyToTaskId.set(taskKey, task.id)
      taskCreated++

      // TeachingTaskClass
      for (const cgId of classGroupIds) {
        await tx.teachingTaskClass.create({ data: { teachingTaskId: task.id, classGroupId: cgId } })
        ttcCreated++
      }
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

    // 查找已有 ScheduleSlot（去重 key: teachingTaskId + dayOfWeek + slotIndex + roomId）
    const existingSlot = await tx.scheduleSlot.findFirst({
      where: { teachingTaskId, dayOfWeek, slotIndex, roomId },
    })

    if (existingSlot) {
      slotReused++
    } else {
      await tx.scheduleSlot.create({
        data: { teachingTaskId, roomId, dayOfWeek, slotIndex, importBatchId: batchId },
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
): Promise<ImportPlan> {
  const prepared = await prepareRecords(batchId)
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
    prisma.classGroup.findMany({ where: { name: { in: [...classNames] } }, select: { name: true, studentCount: true } }),
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
): Promise<ImportExecutionResult> {
  const prepared = await prepareRecords(batchId)

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
      const result = await executeImportInTransaction(tx, prepared, batchId)
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
): Promise<ConfirmImportResult> {
  // 1. 读取 ImportBatch
  const batch = await prisma.importBatch.findUnique({ where: { id: batchId } })
  if (!batch) throw new Error(`ImportBatch ${batchId} 不存在`)
  if (batch.status !== 'pending') throw new Error(`ImportBatch ${batchId} 状态为 "${batch.status}"，只允许 pending 状态`)

  // 2. 读取 parsedJson + quality gate
  const prepared = await prepareRecords(batchId)

  // canImport=false → 直接返回，不修改 batch 状态
  if (!prepared.classification.canImport) {
    return {
      batchId, strategy, success: false, canImport: false,
      blockingReasons: prepared.classification.blockingReasons,
      warnings: prepared.classification.warnings,
      createdTaskCount: 0, createdSlotCount: 0,
    }
  }

  // 3. confirmed / confirming guard
  const existingConfirmed = await prisma.importBatch.findFirst({
    where: { id: { not: batchId }, status: { in: ['confirmed', 'confirming'] } },
    select: { id: true, status: true },
  })
  if (existingConfirmed) {
    throw new Error(`已有 ImportBatch #${existingConfirmed.id} 状态为 "${existingConfirmed.status}"，当前阶段不支持重复确认导入`)
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
      const result = await executeImportInTransaction(tx, prepared, batchId)

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
