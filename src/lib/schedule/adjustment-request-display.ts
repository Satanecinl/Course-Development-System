// src/lib/schedule/adjustment-request-display.ts
// K32-A3: 共享调课申请位置显示 formatter
//
// 两个列表页面（/admin/adjustment-requests + /my-adjustment-requests）共用
// 该 helper，确保"第X周 星期X 第X-X节 教室 XXX"的统一显示格式。
//
// 读取 ScheduleAdjustmentRequest 上的 source*/target* 字段 + 关联名称；
// 不做任何 DB 写入。

// ── 常量 ──

const DAY_NAMES = ['', '星期一', '星期二', '星期三', '星期四', '星期五', '星期六', '星期日'] as const

const SLOT_RANGES: Record<number, string> = {
  1: '第1-2节',
  2: '第3-4节',
  3: '第5-6节',
  4: '第7-8节',
  5: '第9-10节',
  6: '第11-12节',
}

// ── 纯函数 ──

/**
 * 将数字星期转为中文。dayOfWeek=1→"星期一"，dayOfWeek=null→"星期?"。
 * 禁止输出 "第X天" / "星期2"。
 */
export function formatDayOfWeek(dayOfWeek: number | null | undefined): string {
  if (dayOfWeek == null || !Number.isFinite(dayOfWeek)) return '星期?'
  return DAY_NAMES[dayOfWeek] ?? '星期?'
}

/**
 * 将 slotIndex 映射为 "第1-2节" / "第3-4节" 等页面常用形式。
 * 禁止输出 "节次4"。
 */
export function formatSlotIndex(slotIndex: number | null | undefined): string {
  if (slotIndex == null || !Number.isFinite(slotIndex)) return '第?节'
  return SLOT_RANGES[slotIndex] ?? `第${slotIndex}节`
}

/**
 * 将 week 映射为 "第X周" 或 "第?周"（week 为 null 时）。
 * 禁止省略周次。
 */
export function formatWeek(week: number | null | undefined): string {
  if (week == null || !Number.isFinite(week)) return '第?周'
  return `第${week}周`
}

/**
 * 格式化教室名。roomName 缺失时输出空字符串（不输出 "未指定" / "undefined"）。
 */
export function formatRoomName(roomName: string | null | undefined): string {
  if (roomName == null) return ''
  const s = String(roomName).trim()
  return s.length > 0 ? s : ''
}

/**
 * K32-A3: 统一位置格式化。
 * 输出：第{week}周 星期{weekday} 第{slotRange}节 教室 {roomName}
 *
 * 原位置（source）示例：
 *   第5周 星期五 第7-8节 教室 11-333
 *   第?周 星期五 第1-2节 教室 11-223  (历史数据 sourceWeek=null)
 *
 * 目标位置（target）示例：
 *   第9周 星期二 第7-8节 教室 11-333
 */
export function formatPosition(
  week: number | null | undefined,
  dayOfWeek: number | null | undefined,
  slotIndex: number | null | undefined,
  roomName: string | null | undefined,
): string {
  const w = formatWeek(week)
  const d = formatDayOfWeek(dayOfWeek)
  const s = formatSlotIndex(slotIndex)
  const r = formatRoomName(roomName)
  // 教室为空时仍然保留 "教室 " 占位，便于视觉对齐
  return `${w} ${d} ${s} 教室 ${r}`
}

/**
 * K32-A3: 对外暴露的便捷函数，供列表直接传入 item 对象调用。
 */
export function formatSourcePosition(item: {
  sourceWeek?: number | null
  sourceDayOfWeek?: number | null
  sourceSlotIndex?: number | null
  sourceRoomName?: string | null
}): string {
  return formatPosition(
    item.sourceWeek ?? null,
    item.sourceDayOfWeek ?? null,
    item.sourceSlotIndex ?? null,
    item.sourceRoomName ?? null,
  )
}

export function formatTargetPosition(item: {
  targetWeek?: number | null
  targetDayOfWeek?: number | null
  targetSlotIndex?: number | null
  targetRoomName?: string | null
}): string {
  return formatPosition(
    item.targetWeek ?? null,
    item.targetDayOfWeek ?? null,
    item.targetSlotIndex ?? null,
    item.targetRoomName ?? null,
  )
}
