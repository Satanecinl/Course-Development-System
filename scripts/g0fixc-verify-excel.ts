/**
 * G0-FIX-C: Excel 导出最终验收
 *
 * 验证：
 * 1. ALL 导出成功
 * 2. 第 7 周导出成功
 * 3. 第 8 周导出成功
 * 4. 不含非法课程
 * 5. 不含同格重复记录
 */

import { PrismaClient } from '@prisma/client'

const prisma = new PrismaClient()

const BASE_URL = 'http://localhost:3000'
const ILLEGAL_COURSES = ['周六', '周日', '3、4', '5、6', '7、8', '9、10', '9.10', '专业年级班', '人数', '教室']

interface TestResult {
  name: string
  passed: boolean
  details: string
}

const results: TestResult[] = []

function record(name: string, passed: boolean, details: string) {
  results.push({ name, passed, details })
  const emoji = passed ? '✅' : '❌'
  console.log(`  ${emoji} ${name}: ${details}`)
}

async function fetchExcel(week?: number): Promise<{ ok: boolean; text: string; contentType: string | null }> {
  const params = new URLSearchParams()
  if (week != null) {
    params.set('week', String(week))
    params.set('applyAdjustments', 'true')
  }
  const url = `${BASE_URL}/api/export/excel${params.toString() ? '?' + params.toString() : ''}`

  try {
    const res = await fetch(url)
    const text = await res.text()
    return {
      ok: res.ok,
      text,
      contentType: res.headers.get('content-type'),
    }
  } catch (e: any) {
    return { ok: false, text: e.message, contentType: null }
  }
}

/** 检查 CSV/文本内容中的非法课程 */
function checkIllegalInContent(content: string): string[] {
  const found: string[] = []
  for (const name of ILLEGAL_COURSES) {
    if (content.includes(name)) found.push(name)
  }
  return found
}

async function main() {
  console.log('═══════════════════════════════════════════════════════════════')
  console.log('              G0-FIX-C: Excel 导出最终验收')
  console.log('═══════════════════════════════════════════════════════════════')

  // ── 1. ALL 导出 ──
  console.log('\n--- 1. ALL 导出 ---')
  const allRes = await fetchExcel()
  record(
    'ALL 导出状态',
    allRes.ok,
    allRes.ok ? `HTTP 200, content-type=${allRes.contentType}` : `HTTP 失败: ${allRes.text.slice(0, 100)}`
  )

  if (allRes.ok) {
    const illegal = checkIllegalInContent(allRes.text)
    record(
      'ALL 导出无非法课程',
      illegal.length === 0,
      illegal.length === 0 ? '未检测到非法课程' : `发现: [${illegal.join(', ')}]`
    )
  }

  // ── 2. 第 7 周导出 ──
  console.log('\n--- 2. 第 7 周导出 ---')
  const w7Res = await fetchExcel(7)
  record(
    '第 7 周导出状态',
    w7Res.ok,
    w7Res.ok ? `HTTP 200, content-type=${w7Res.contentType}` : `HTTP 失败: ${w7Res.text.slice(0, 100)}`
  )

  if (w7Res.ok) {
    const illegal7 = checkIllegalInContent(w7Res.text)
    record(
      '第 7 周导出无非法课程',
      illegal7.length === 0,
      illegal7.length === 0 ? '未检测到非法课程' : `发现: [${illegal7.join(', ')}]`
    )

    // 检查第 7 周应包含有效课程（非空）
    record(
      '第 7 周导出非空',
      w7Res.text.length > 100,
      `内容长度: ${w7Res.text.length}`
    )
  }

  // ── 3. 第 8 周导出 ──
  console.log('\n--- 3. 第 8 周导出 ---')
  const w8Res = await fetchExcel(8)
  record(
    '第 8 周导出状态',
    w8Res.ok,
    w8Res.ok ? `HTTP 200, content-type=${w8Res.contentType}` : `HTTP 失败: ${w8Res.text.slice(0, 100)}`
  )

  if (w8Res.ok) {
    const illegal8 = checkIllegalInContent(w8Res.text)
    record(
      '第 8 周导出无非法课程',
      illegal8.length === 0,
      illegal8.length === 0 ? '未检测到非法课程' : `发现: [${illegal8.join(', ')}]`
    )

    record(
      '第 8 周导出非空',
      w8Res.text.length > 100,
      `内容长度: ${w8Res.text.length}`
    )
  }

  // ── 4. 同格重复检查（从数据库层面） ──
  console.log('\n--- 4. 数据库层面重复检查 ---')
  const duplicates = await prisma.$queryRaw<Array<{ cnt: number }>>`
    SELECT COUNT(*) as cnt FROM (
      SELECT tt.courseId, ttc.classGroupId, tt.teacherId, ss.roomId, ss.dayOfWeek, ss.slotIndex,
             tt.weekType, tt.startWeek, tt.endWeek, COUNT(*) as c
      FROM ScheduleSlot ss
      JOIN TeachingTask tt ON ss.teachingTaskId = tt.id
      JOIN TeachingTaskClass ttc ON ttc.teachingTaskId = tt.id
      GROUP BY tt.courseId, ttc.classGroupId, tt.teacherId, ss.roomId, ss.dayOfWeek, ss.slotIndex,
               tt.weekType, tt.startWeek, tt.endWeek
      HAVING c > 1
    )
  `
  const dupCount = Number(duplicates[0]?.cnt ?? 0)
  record(
    '导出数据源无重复 slot',
    dupCount === 0,
    dupCount === 0 ? '数据库中 0 组重复 ScheduleSlot' : `发现 ${dupCount} 组重复`
  )

  // ── 总结 ──
  console.log('\n═══════════════════════════════════════════════════════════════')
  const passed = results.filter((r) => r.passed).length
  const failed = results.filter((r) => !r.passed).length
  console.log(`  结果: ${passed}/${results.length} 通过, ${failed} 失败`)
  if (failed > 0) {
    for (const r of results.filter((r) => !r.passed)) {
      console.log(`    ❌ ${r.name}: ${r.details}`)
    }
  }
  console.log('═══════════════════════════════════════════════════════════════')

  await prisma.$disconnect()
  if (failed > 0) process.exit(1)
}

main().catch(async (e) => {
  console.error(e)
  await prisma.$disconnect()
  process.exit(1)
})
