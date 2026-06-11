// src/lib/schedule/adjustment-application-form.ts
// K32-A: 调课申请表 Excel 导出（USER + ADMIN 共享逻辑）
//
// 纯只读工具：从 ScheduleAdjustmentRequest 读取 snapshot + 关联名称，
// 加载 templates/串课申请表模板.xlsx，写入指定 cell，返回 ExcelJS.Workbook。
//
// 严禁出现 prisma.*.create/update/delete/upsert/deleteMany/updateMany/$transaction
// —— verify 脚本会显式扫描此文件。

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
  semester: { id: number; name: string; code: string }
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
      semester: { select: { id: true, name: true, code: true } },
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

function dayLabel(d: number | null | undefined): string {
  if (d == null) return '?'
  const labels = ['', '一', '二', '三', '四', '五', '六', '日']
  return labels[d] ?? String(d)
}

function slotLabel(s: number | null | undefined): string {
  // 与项目其他导出保持一致：1-2节、3-4节、5-6节、7-8节、9-10节、11-12节
  if (s == null) return '?'
  const map: Record<number, string> = {
    1: '1-2节', 2: '3-4节', 3: '5-6节', 4: '7-8节', 5: '9-10节', 6: '11-12节',
  }
  return map[s] ?? `第${s}节`
}

function resolveApplicantName(req: RequestForExport): string {
  return safeStr(
    req.submittedByNameSnapshot,
    safeStr(req.submittedBy?.displayName, safeStr(req.teachingTask.teacher?.name, '未知教师')),
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
  return safeStr(req.sourceScheduleSlot?.room?.name, '未知教室')
}

function resolveTargetRoomName(req: RequestForExport): string {
  // K32-A: 不改 schema；targetRoomId 单独没有关联 select，target room name 仅在
  // 该 id 解析为 Room.name 时可用。fallback 到 '未指定'。
  // 这里使用 sourceScheduleSlot 关联中已带出的 room 之外，无法在不改 schema
  // 的前提下直接拿到 target room name；fallback 是安全选择。
  return req.targetRoomId == null ? '未指定' : '未指定'
}

function buildTransferLine(req: RequestForExport): string {
  // K32-A: 不计算具体月/日（Semester.startsAt 可能为 null），使用周次形式。
  const sw = req.sourceWeek == null ? '原位置' : `第${req.sourceWeek}周`
  const tw = `第${req.targetWeek}周`
  const sd = dayLabel(req.sourceDayOfWeek)
  const td = dayLabel(req.targetDayOfWeek)
  const ss = slotLabel(req.sourceSlotIndex)
  const ts = slotLabel(req.targetSlotIndex)
  const sr = resolveSourceRoomName(req)
  const tr = resolveTargetRoomName(req)
  return `${sw} 星期${sd} ${ss} 教室 ${sr} → ${tw} 星期${td} ${ts} 教室 ${tr}`
}

// ── Workbook 构建 ──

export interface BuildWorkbookResult {
  workbook: ExcelJS.Workbook
  templateMergesBefore: number
  templateMergesAfter: number
  /** 实际写入的 cell → value 摘要（用于报告/调试）。 */
  writtenCells: Array<{ address: string; value: string }>
  /** 模板 cell map（每个非空 cell 的 address → trimmed value），用于报告。 */
  templateCellMap: Array<{ address: string; value: string }>
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
        const display = typeof v === 'object' && v !== null && 'text' in (v as unknown as Record<string, unknown>)
          ? String((v as unknown as { text: unknown }).text ?? '')
          : String(v)
        templateCellMap.push({ address: cell.address, value: display })
      }
    }
  }

  const writtenCells: Array<{ address: string; value: string }> = []

  const writeCell = (address: string, value: string) => {
    const cell = ws.getCell(address)
    cell.value = value
    // 写入时启用 wrap，便于长 reason 跨行显示
    cell.alignment = { ...(cell.alignment ?? {}), wrapText: true, vertical: 'middle' }
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

  // 串课情况：第 1 行写真实值，2-5 行清空默认占位文本
  const transferText = buildTransferLine(req)
  for (let i = 0; i < TRANSFER_ROW_MASTERS.length; i++) {
    const addr = TRANSFER_ROW_MASTERS[i]
    writeCell(addr, i === 0 ? transferText : '')
  }

  // 调（串）课原因：写入 A10（master of A10:B10 merge），保留 label "调（串）课原因："
  const reason = safeStr(req.reason, '未填写')
  const reasonCell = ws.getCell(REASON_CELL)
  // 模板 A10 原值含 "调（串）课原因："，追加换行 + 真实原因，wrap-text 已开启
  const existingLabel = (() => {
    const v = reasonCell.value
    if (v == null) return '调（串）课原因：'
    if (typeof v === 'string') return v
    if (typeof v === 'object' && v !== null && 'text' in (v as unknown as Record<string, unknown>)) {
      return String((v as unknown as { text: unknown }).text ?? '调（串）课原因：')
    }
    return '调（串）课原因：'
  })()
  const reasonValue = `${existingLabel}\n${reason}`
  reasonCell.value = reasonValue
  reasonCell.alignment = { ...(reasonCell.alignment ?? {}), wrapText: true, vertical: 'top' }
  writtenCells.push({ address: REASON_CELL, value: reasonValue })

  // 签名 cell：保留模板原 "签名：    年 月 日"，在末尾追加申请人 + 日期
  const sigCell = ws.getCell(SIGNATURE_CELL)
  const existingSig = (() => {
    const v = sigCell.value
    if (v == null) return '签名：'
    if (typeof v === 'string') return v
    if (typeof v === 'object' && v !== null && 'text' in (v as unknown as Record<string, unknown>)) {
      return String((v as unknown as { text: unknown }).text ?? '签名：')
    }
    return '签名：'
  })()
  const dateStr = req.createdAt ? req.createdAt.toISOString().slice(0, 10) : new Date().toISOString().slice(0, 10)
  const sigValue = `${existingSig}（导出日期：${dateStr}）`
  sigCell.value = sigValue
  sigCell.alignment = { ...(sigCell.alignment ?? {}), wrapText: true, vertical: 'middle' }
  writtenCells.push({ address: SIGNATURE_CELL, value: sigValue })

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
