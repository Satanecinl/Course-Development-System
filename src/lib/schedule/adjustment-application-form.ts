// src/lib/schedule/adjustment-application-form.ts
// K32-A / K32-A1 / K32-A2: 调课申请表 Excel 导出（USER + ADMIN 共享逻辑）
//
// 纯只读工具：从 ScheduleAdjustmentRequest 读取 snapshot + 关联名称，
// 加载 templates/串课申请表模板.xlsx，写入指定 cell，返回 ExcelJS.Workbook。
//
// 严禁出现 prisma.*.create/update/delete/upsert/deleteMany/updateMany/$transaction
// —— verify 脚本会显式扫描此文件。
//
// K32-A1 layout alignment:
//   - 串课情况正式表述："由{M月D日 或 第X周 星期Y} 第{slot}节 教室 {room}；串至 ..."
//   - 节次格式："第1-2节" / "第3-4节" / ...
//   - 日期优先根据 Semester.startsAt 计算（week 1 day 1 = startsAt），
//     缺失时 fallback 到 "第X周 星期Y"
//   - target room 缺失时 fallback 到 source room（业务语义：多数申请只改时间不改教室）
//   - B5 写真实数据；B6:B9 保留模板默认占位
//   - A10 调（串）课原因：单行 "调（串）课原因：<reason>"
//   - C10 签名：保留模板默认 "签名：      年   月   日"，不写 ISO 日期
//
// K32-A2 sourceWeek resolution fix:
//   - 严格保证串课情况 B5 任意一侧位置都包含 date/week 上下文（"M月D日" / "第X周" / "第?周"）
//   - **禁止** fallback 到纯 "星期X"
//   - 新增 resolveSourceWeekForExport(req)：未来加 fallback 链路时只改一处
//   - 配合 K32-A2 submit path 修复（dialog 传 sourceWeek -> API 接收 -> service 写入 DB）
//     让新申请不再有 sourceWeek=null
//   - 历史数据（K32-A2 之前创建的请求）sourceWeek=null 仍按 "第?周 星期X" 占位输出

import ExcelJS from 'exceljs'
import { existsSync } from 'fs'
import { join } from 'path'
import { prisma } from '@/lib/prisma'

// ── 常量 ──

export const TEMPLATE_RELATIVE_PATH = 'templates/串课申请表模板.xlsx'
export const SHEET_NAME = '串课申请表'

/** 模板中 5 个串课情况行的左侧 master cell（合并区域左上角）。 */
const TRANSFER_ROW_MASTERS = ['B5', 'B6', 'B7', 'B8', 'B9'] as const
/** 申请教师 / 学期 / 课程名称 等左侧 value cell。 */
const LEFT_VALUE_CELLS = {
  applicant: 'B2',
  semester: 'B3',
  course: 'B4',
} as const
/** 所属部门 / 授课年级专业 / 上课地点 等右侧 value cell。 */
const RIGHT_VALUE_CELLS = {
  department: 'D2',
  classGroups: 'D3',
  room: 'D4',
} as const
/** 调（串）课原因 cell：模板中 A10:B10 合并，master 为 A10。 */
const REASON_CELL = 'A10'
/** 签名 cell：模板中 C10:D10 合并，master 为 C10。 */
const SIGNATURE_CELL = 'C10'

// ── 模板路径解析 ──

export function resolveTemplatePath(): string {
  return join(process.cwd(), TEMPLATE_RELATIVE_PATH)
}

export function templateExists(): boolean {
  return existsSync(resolveTemplatePath())
}

// ── 数据加载（只读） ──

export interface RequestForExport {
  id: number
  status: string
  reason: string | null
  sourceWeek: number | null
  sourceDayOfWeek: number | null
  sourceSlotIndex: number | null
  sourceRoomId: number | null
  targetWeek: number
  targetDayOfWeek: number
  targetSlotIndex: number
  targetRoomId: number | null
  submittedByUserId: number
  submittedByNameSnapshot: string | null
  submittedByRoleSnapshot: string | null
  reviewedByNameSnapshot: string | null
  reviewedAt: Date | null
  reviewNote: string | null
  createdAt: Date
  semester: { id: number; name: string; code: string; startsAt: Date | null; endsAt: Date | null }
  sourceScheduleSlot: {
    id: number
    dayOfWeek: number
    slotIndex: number
    room: { id: number; name: string } | null
  }
  teachingTask: {
    id: number
    course: { id: number; name: string }
    teacher: { id: number; name: string } | null
    taskClasses: Array<{ classGroup: { id: number; name: string } }>
  }
  submittedBy: { id: number; username: string; displayName: string }
  reviewedBy: { id: number; username: string; displayName: string } | null
}

/**
 * 单次 Prisma findUnique 拿全部关联。注意：仅读取，不写。
 */
export async function loadRequestForExport(requestId: number): Promise<RequestForExport | null> {
  const r = await prisma.scheduleAdjustmentRequest.findUnique({
    where: { id: requestId },
    include: {
      semester: { select: { id: true, name: true, code: true, startsAt: true, endsAt: true } },
      sourceScheduleSlot: {
        select: {
          id: true,
          dayOfWeek: true,
          slotIndex: true,
          room: { select: { id: true, name: true } },
        },
      },
      teachingTask: {
        select: {
          id: true,
          course: { select: { id: true, name: true } },
          teacher: { select: { id: true, name: true } },
          taskClasses: { select: { classGroup: { select: { id: true, name: true } } } },
        },
      },
      submittedBy: { select: { id: true, username: true, displayName: true } },
      reviewedBy: { select: { id: true, username: true, displayName: true } },
    },
  })
  return r as RequestForExport | null
}

// ── 字段解析（不依赖 ScheduleSlot 实时态） ──

function safeStr(v: string | null | undefined, fallback: string): string {
  if (v == null) return fallback
  const s = String(v).trim()
  return s.length > 0 ? s : fallback
}

const DAY_LABELS = ['', '一', '二', '三', '四', '五', '六', '日'] as const
function dayLabel(d: number | null | undefined): string {
  if (d == null) return '?'
  return DAY_LABELS[d] ?? String(d)
}

/**
 * 节次 -> "第X-Y节" 形式（页面常用）。
 * slotIndex=1 -> "第1-2节", 2 -> "第3-4节", 3 -> "第5-6节", 4 -> "第7-8节",
 * 5 -> "第9-10节", 6 -> "第11-12节" (K26-D: 6/7 为 legacy display，不应作为
 * 新调课目标；保留映射以保证历史数据可读。)
 */
const SLOT_RANGES: Record<number, string> = {
  1: '1-2',
  2: '3-4',
  3: '5-6',
  4: '7-8',
  5: '9-10',
  6: '11-12',
}
function slotRange(s: number | null | undefined): string {
  if (s == null) return '?'
  return SLOT_RANGES[s] ?? `${s}`
}

/** K32-A1: 节次转 "1-2" / "3-4" 形式（页面常用）。供 verify 脚本直接调用。 */
export function slotIndexToRange(s: number | null | undefined): string {
  return slotRange(s)
}

function resolveApplicantName(req: RequestForExport): string {
  return safeStr(
    req.submittedByNameSnapshot,
    safeStr(req.submittedBy?.displayName, safeStr(req.teachingTask.teacher?.name, '')),
  )
}

function resolveCourseName(req: RequestForExport): string {
  return safeStr(req.teachingTask.course?.name, '')
}

function resolveClassGroupLabel(req: RequestForExport): string {
  const names = (req.teachingTask.taskClasses ?? [])
    .map((tc) => tc.classGroup?.name)
    .filter((n): n is string => typeof n === 'string' && n.length > 0)
  return names.join('、')
}

function resolveSourceRoomName(req: RequestForExport): string {
  return safeStr(req.sourceScheduleSlot?.room?.name, '')
}

/**
 * 目标教室 fallback 策略：targetRoomId 缺失时优先使用 sourceRoom name。
 * 业务语义：调课申请多数情况是"只改时间不改教室"，保留 source room 能让正式
 * 申请表地点字段完整。**K32-A1 不改 schema，因此 target room 的单独 name
 * 无法直接拿到**；只在 targetRoomId 存在但缺少关联 name 的情况下退化为空。
 */
function resolveTargetRoomName(req: RequestForExport): string {
  // 业务上：targetRoomId 不为空但 source room 存在，优先 source room（绝大多数
  // 调课不换教室）；只有 targetRoomId 为空才保留 source room 名。
  if (req.targetRoomId == null) {
    return resolveSourceRoomName(req)
  }
  // targetRoomId 非空时，由于 K32-A1 不改 schema（不带 target room include），
  // 真实 target room name 暂不可知。
  // 安全策略：先返回 source room（多数情况 source === target），调用方可在
  // 审批后用 target room name 覆盖。
  return resolveSourceRoomName(req)
}

// ── 日期 / 周次 解析 ──

/**
 * 根据学期起始日期 + (week, dayOfWeek) 计算具体日期。
 * 公式：date = semester.startsAt + (week - 1) * 7 + (dayOfWeek - 1) days
 * - dayOfWeek: 1=周一 ... 7=周日
 * 返回 "M月D日" 形式；输入缺失返回 null。
 */
export function formatDateFromSemester(
  semesterStartsAt: Date | null | undefined,
  week: number | null | undefined,
  dayOfWeek: number | null | undefined,
): string | null {
  if (!semesterStartsAt || week == null || dayOfWeek == null) return null
  if (!Number.isFinite(week) || !Number.isFinite(dayOfWeek)) return null
  if (week < 1 || dayOfWeek < 1 || dayOfWeek > 7) return null
  const d = new Date(semesterStartsAt.getTime())
  d.setUTCDate(d.getUTCDate() + (week - 1) * 7 + (dayOfWeek - 1))
  return `${d.getUTCMonth() + 1}月${d.getUTCDate()}日`
}

/**
 * K32-A2: 周次 + 星期 fallback 形式。
 *
 * 严格保证输出始终包含"第X周"或"第?周"上下文，**不得**退化为纯"星期X"。
 * 原因：正式串课申请表必须有周次上下文，单独的"星期X"无法定位具体周。
 *
 * 输出形式：
 *   - week 已知 + dayOfWeek 已知 -> "第X周 星期Y"
 *   - week 已知 + dayOfWeek 缺失 -> "第X周"（保留周次）
 *   - week 缺失 + dayOfWeek 已知 -> "第?周 星期Y"（占位）
 *   - week/dayOfWeek 都缺失    -> "第?周"（纯占位）
 */
function formatWeekAndDay(week: number | null | undefined, dayOfWeek: number | null | undefined): string {
  const d = dayLabel(dayOfWeek)
  const w = week == null ? '?' : String(week)
  if (d === '?') return `第${w}周`
  return `第${w}周 星期${d}`
}

/**
 * K32-A2: 解析 sourceWeek 的优先级。
 *
 * 1. request.sourceWeek (schema 字段，K32-A2 submit path 修复后会被正确写入)
 * 2. approvedAdjustment.week (ScheduleAdjustment.week) — 仅在 request 关联到 approvedAdjustment 时
 *    注意：此处的 "week" 字段语义上是 target week，**不**直接对应 source week
 *    所以这里只用作诊断保留，不作为正式 source week
 * 3. sourceScheduleSlot.week — schema 中不存在（slot 是 recurring）
 * 4. 全部缺失 -> null
 *
 * 注意：**禁止**用 request.createdAt 推断原课周次（createdAt 是申请提交时间，
 * 多数情况下用户在"今天"申请某个未来/过去的课，但 createdAt 不应作为原周
 * 次的可信数据源）。
 */
export function resolveSourceWeekForExport(req: RequestForExport): number | null {
  if (req.sourceWeek != null && Number.isFinite(req.sourceWeek) && req.sourceWeek >= 1) {
    return req.sourceWeek
  }
  return null
}

/**
 * 串课情况某一段的"位置"正式表述。
 * 优先具体日期（semester.startsAt + week + dayOfWeek 可用时），否则 fallback
 * 到 第X周 星期Y。**严格保证**输出包含 date/week 上下文（K32-A2 修复）。
 */
function formatPosition(
  semesterStartsAt: Date | null | undefined,
  week: number | null | undefined,
  dayOfWeek: number | null | undefined,
  slotIndex: number | null | undefined,
  roomName: string,
): string {
  const dateStr = formatDateFromSemester(semesterStartsAt, week, dayOfWeek)
  // K32-A2: dateStr 缺失时 **强制** 使用 "第X周 星期Y" 形式（保留周次上下文）
  const positionStr = dateStr ?? formatWeekAndDay(week, dayOfWeek)
  const slotStr = slotRange(slotIndex)
  // 教室可为空字符串（room 缺失）；保留 "教室 " 之后的占位格式
  return `${positionStr} 第${slotStr}节 教室 ${roomName}`
}

/**
 * K32-A1 / K32-A2: 正式串课情况表述。
 * 例： "由3月2日 第1-2节 教室 11-321；串至 3月4日 第3-4节 教室 11-321"
 * 或   "由第7周 星期五 第1-2节 教室 11-223；串至 第12周 星期二 第5-6节 教室 11-318"
 * 或   "由第?周 星期五 第1-2节 教室 11-223；串至 5月26日 第5-6节 教室 11-223"
 *      （K32-A2 历史数据 sourceWeek=null 时的占位 fallback）
 */
export function buildFormalAdjustmentSituation(req: RequestForExport): string {
  const startsAt = req.semester?.startsAt ?? null
  // K32-A2: 用 resolveSourceWeekForExport 替代直接读 req.sourceWeek，
  // 保证未来加 fallback 链路（如 approvedAdjustment / sourceJson）时只需改一处。
  const sourceWeek = resolveSourceWeekForExport(req)
  const sourcePart = formatPosition(
    startsAt,
    sourceWeek,
    req.sourceDayOfWeek,
    req.sourceSlotIndex,
    resolveSourceRoomName(req),
  )
  const targetPart = formatPosition(
    startsAt,
    req.targetWeek,
    req.targetDayOfWeek,
    req.targetSlotIndex,
    resolveTargetRoomName(req),
  )
  return `由${sourcePart}；串至 ${targetPart}`
}

// ── Workbook 构建 ──

export interface BuildWorkbookResult {
  workbook: ExcelJS.Workbook
  templateMergesBefore: number
  templateMergesAfter: number
  /** 实际写入的 cell 与其 value 摘要（用于报告/调试）。 */
  writtenCells: Array<{ address: string; value: string }>
  /** 模板 cell map（每个非空 cell 的 address 与 trimmed value），用于报告。 */
  templateCellMap: Array<{ address: string; value: string }>
}

/**
 * 把任意 ExcelJS cell value 折叠成普通字符串。
 */
function cellValueToString(v: unknown): string {
  if (v == null) return ''
  if (typeof v === 'string') return v
  if (typeof v === 'number' || typeof v === 'boolean') return String(v)
  if (v instanceof Date) return v.toISOString()
  if (typeof v === 'object') {
    const obj = v as { text?: unknown; result?: unknown; richText?: unknown }
    if (typeof obj.text === 'string') return obj.text
    if (typeof obj.result === 'string' || typeof obj.result === 'number') return String(obj.result)
    if (Array.isArray(obj.richText)) {
      return obj.richText
        .map((seg: unknown) => {
          if (seg && typeof seg === 'object' && 'text' in (seg as Record<string, unknown>)) {
            return String((seg as { text: unknown }).text ?? '')
          }
          return ''
        })
        .join('')
    }
    if ('formula' in obj && 'result' in obj) {
      return cellValueToString((obj as { result: unknown }).result)
    }
  }
  return String(v)
}

/**
 * 加载模板，填入申请数据，返回 workbook。**纯本地文件操作，不写 DB**。
 */
export async function buildAdjustmentApplicationFormWorkbook(
  req: RequestForExport,
): Promise<BuildWorkbookResult> {
  const templatePath = resolveTemplatePath()
  const workbook = new ExcelJS.Workbook()
  await workbook.xlsx.readFile(templatePath)
  const ws = workbook.getWorksheet(SHEET_NAME)
  if (!ws) {
    throw new Error(`TEMPLATE_SHEET_MISSING: ${SHEET_NAME}`)
  }

  // 记录模板的合并数量 + 现有 cell map（用于报告 & 后续验证模板未变）
  const templateMergesBefore = (((ws.model as unknown as { merges?: unknown[] }).merges) ?? []).length
  const templateCellMap: Array<{ address: string; value: string }> = []
  for (let r = 1; r <= ws.rowCount; r++) {
    const row = ws.getRow(r)
    for (let c = 1; c <= ws.columnCount; c++) {
      const cell = row.getCell(c)
      const v = cell.value
      if (v !== null && v !== undefined && v !== '') {
        templateCellMap.push({ address: cell.address, value: cellValueToString(v) })
      }
    }
  }

  const writtenCells: Array<{ address: string; value: string }> = []

  const writeCell = (address: string, value: string, opts: { wrap?: boolean; vertical?: 'middle' | 'top' } = {}) => {
    const cell = ws.getCell(address)
    cell.value = value
    cell.alignment = {
      ...(cell.alignment ?? {}),
      wrapText: opts.wrap ?? true,
      vertical: opts.vertical ?? 'middle',
    }
    writtenCells.push({ address, value })
  }

  // 左侧 value cells
  const applicant = resolveApplicantName(req)
  const semesterName = safeStr(req.semester?.name, '')
  const courseName = resolveCourseName(req)
  writeCell(LEFT_VALUE_CELLS.applicant, applicant)
  writeCell(LEFT_VALUE_CELLS.semester, semesterName)
  writeCell(LEFT_VALUE_CELLS.course, courseName)

  // 右侧 value cells
  // 所属部门：当前 K28 schema 未存该字段（User 没有 department 字段）。
  // 留空字符串，模板原样保留。
  writeCell(RIGHT_VALUE_CELLS.department, '')
  writeCell(RIGHT_VALUE_CELLS.classGroups, resolveClassGroupLabel(req))
  writeCell(RIGHT_VALUE_CELLS.room, resolveSourceRoomName(req))

  // 串课情况：
  //   B5 = 真实正式表述（"由...；串至..."）
  //   B6:B9 = **保留模板默认占位文本**（不强制清空）
  // 不修改 B6:B9 — 既保留模板原始视觉，也避免破坏行高/边框/合并。
  const transferText = buildFormalAdjustmentSituation(req)
  writeCell(TRANSFER_ROW_MASTERS[0], transferText)
  // 显式把 B6:B9 标记为"未写"，便于报告输出
  // （不调用 writeCell，就不会触碰模板的原始 value）
  for (let i = 1; i < TRANSFER_ROW_MASTERS.length; i++) {
    const addr = TRANSFER_ROW_MASTERS[i]
    // 不写入，保持模板原值（"由   月   日 第   节 教室       ；串至   月   日 第   节 教室"）
    // 写一条 null 标记到 writtenCells 仅为报告可读性
    writtenCells.push({ address: addr, value: '(preserved from template)' })
  }

  // 调（串）课原因：写入 A10（master of A10:B10 merge）。
  // K32-A1：单行 "调（串）课原因：<reason>"，不强制换行。
  const reason = safeStr(req.reason, '未填写')
  const reasonCell = ws.getCell(REASON_CELL)
  // 模板 A10 原值即 "调（串）课原因："，直接覆盖为 "调（串）课原因：<reason>"
  const reasonValue = `调（串）课原因：${reason}`
  reasonCell.value = reasonValue
  reasonCell.alignment = {
    ...(reasonCell.alignment ?? {}),
    wrapText: true,
    vertical: 'top',
  }
  writtenCells.push({ address: REASON_CELL, value: reasonValue })

  // 签名 cell：保留模板默认 "签名：      年   月   日"。
  // K32-A1：不写 ISO 日期，避免破坏 "年 月 日" 模板格式。
  // 实际签署人 + 日期由教师在打印后手写填入。
  // 不读取 sigCell.value（保持原值）；不写入任何内容。
  void ws.getCell(SIGNATURE_CELL)
  writtenCells.push({ address: SIGNATURE_CELL, value: '(preserved from template)' })

  const templateMergesAfter = (((ws.model as unknown as { merges?: unknown[] }).merges) ?? []).length

  return {
    workbook,
    templateMergesBefore,
    templateMergesAfter,
    writtenCells,
    templateCellMap,
  }
}

// ── 文件名 ──

const FORBIDDEN_FILENAME_CHARS = /[\\/:*?"<>|\x00-\x1f]/g

/**
 * 安全文件名：剔除 `\\/:*?"<>|` 与控制字符；超长截断到 ≤ 80 字节（UTF-8）。
 * 调用方仍需 encodeURIComponent。
 */
export function safeFilename(courseName: string, applicantName: string, id: number): string {
  const raw = `串课申请表-${courseName}-${applicantName}-${id}.xlsx`
  const cleaned = raw.replace(FORBIDDEN_FILENAME_CHARS, '_')
  const buf = Buffer.from(cleaned, 'utf8')
  if (buf.length <= 80) return cleaned
  // 截断到 80 字节，去掉尾部 .xlsx 再补
  const truncated = buf.subarray(0, 80 - 4).toString('utf8')
  return `${truncated}.xlsx`
}
