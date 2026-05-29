/**
 * 周次重叠检测工具
 *
 * 将周次约束展开为具体周数集合，求交集判断是否存在重叠。
 */

export type WeekType = 'ALL' | 'ODD' | 'EVEN' | 'FIRST_HALF' | 'SECOND_HALF' | 'CUSTOM'

export interface WeekConstraint {
  start: number
  end: number
  type: WeekType
}

/**
 * 将 WeekConstraint 展开为具体周数集合（Set<number>）
 */
export function expandWeeks(week: WeekConstraint): Set<number> {
  const weeks = new Set<number>()
  const rawStart = Math.max(1, week.start)
  const rawEnd = Math.min(16, week.end)

  for (let w = rawStart; w <= rawEnd; w++) {
    switch (week.type) {
      case 'ALL':
      case 'FIRST_HALF':
      case 'SECOND_HALF':
      case 'CUSTOM':
        weeks.add(w)
        break
      case 'ODD':
        if (w % 2 === 1) weeks.add(w)
        break
      case 'EVEN':
        if (w % 2 === 0) weeks.add(w)
        break
    }
  }

  return weeks
}

/**
 * 检查两个周次约束是否存在重叠
 * @returns true 表示存在重叠，false 表示无重叠
 */
export function checkWeekOverlap(weekA: WeekConstraint, weekB: WeekConstraint): boolean {
  const setA = expandWeeks(weekA)
  const setB = expandWeeks(weekB)

  // 求交集
  for (const w of setA) {
    if (setB.has(w)) {
      return true
    }
  }

  return false
}

/**
 * 计算两个周次约束的重叠周数（用于调试/日志）
 */
export function getOverlapWeeks(weekA: WeekConstraint, weekB: WeekConstraint): number[] {
  const setA = expandWeeks(weekA)
  const setB = expandWeeks(weekB)
  const overlap: number[] = []

  for (const w of setA) {
    if (setB.has(w)) {
      overlap.push(w)
    }
  }

  return overlap.sort((a, b) => a - b)
}
