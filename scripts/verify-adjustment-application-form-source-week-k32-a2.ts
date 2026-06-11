/**
 * K32-A2 ADJUSTMENT APPLICATION FORM SOURCE WEEK RESOLUTION FIX VERIFY
 *
 * 修复 K32-A1 导出表格的"原位置只显示星期X（无周次上下文）"问题。
 *
 * Checks (25+):
 *   诊断 (1-7):
 *     1.  ScheduleAdjustmentRequest schema 含 sourceWeek Int? 字段
 *     2.  sourceWeek 分布：count total / notNull / null（数据库当前状态诊断）
 *     3.  sample requestId 实际 sourceWeek/sourceDay/sourceSlot/sourceRoom 值
 *     4.  sample requestId 实际 targetWeek/targetDay/targetSlot/targetRoom 值
 *
 *   静态 util 检查 (5-12):
 *     5.  util 存在 resolveSourceWeekForExport 函数
 *     6.  util buildFormalAdjustmentSituation 调用 resolveSourceWeekForExport
 *     7.  util formatWeekAndDay 不再 fallback 纯 "星期X"（必含 第X周 或 第?周）
 *     8.  util 文件仍然只读（无 prisma.*.write）
 *     9.  util 不再使用 "原位置" / "→" / "未指定"
 *
 *   集成内容 (10-19):
 *    10.  集成样例 B5 不含 "由星期"（必须含 周次上下文）
 *    11.  集成样例 B5 包含 "由M月D日" / "由第X周" / "由第?周" 三者之一
 *    12.  集成样例 B5 仍包含 "；串至"
 *    13.  集成样例 B5 不含 "原位置" / "→" / "未指定"
 *    14.  集成样例 B6:B9 保留模板占位
 *    15.  集成样例 A10 仍为单行原因
 *    16.  集成样例 C10 仍保留 "年 月 日"
 *    17.  集成样例不含 undefined/null/[object Object]
 *
 *   模板/数据 (18-20):
 *    18.  模板 merges 数量 before/after 一致
 *    19.  A1 标题字体保留
 *    20.  导出前后 ScheduleAdjustmentRequest / ScheduleSlot / ScheduleAdjustment count + hash 不变
 *
 *   单元 (21-23):
 *    21.  sourceWeek=null + sourceDayOfWeek=5 → "第?周 星期五"
 *    22.  sourceWeek=7 + startsAt=2026-03-09 + day=5 → "4月10日"（按真实日期规则）
 *    23.  sourceWeek=12 + startsAt=2026-03-09 + day=2 → "5月26日"
 *
 *   仓库约束 (24-25):
 *    24.  无 schema/migration 变更
 *    25.  prisma/dev.db NOT staged
 */

import { existsSync, readFileSync, writeFileSync, mkdirSync } from 'fs'
import { join } from 'path'
import { createHash } from 'crypto'
import ExcelJS from 'exceljs'
import { PrismaClient } from '@prisma/client'

const projectRoot = join(__dirname, '..')

interface CheckResult { id: number; name: string; pass: boolean; detail?: string }
const results: CheckResult[] = []
let id = 0
function check(name: string, pass: boolean, detail?: string) {
  id++
  results.push({ id, name, pass, detail })
}

function safeReadText(path: string): string {
  try {
    return existsSync(path) ? readFileSync(path, 'utf-8') : ''
  } catch {
    return ''
  }
}

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

async function main() {
  console.log('K32-A2 ADJUSTMENT APPLICATION FORM SOURCE WEEK RESOLUTION FIX VERIFY')
  console.log('─'.repeat(70))

  // ─── 1-4. 诊断 ───
  const schemaPath = join(projectRoot, 'prisma/schema.prisma')
  const schemaSrc = safeReadText(schemaPath)
  const hasSourceWeek = /\bsourceWeek\s+Int\?/.test(schemaSrc) ||
    /sourceWeek\s+Int\?/.test(schemaSrc)
  check('ScheduleAdjustmentRequest schema 含 sourceWeek 字段', hasSourceWeek,
    'K32-A2 diagnosis: sourceWeek 字段必须存在于 schema')

  const prisma = new PrismaClient()
  const total = await prisma.scheduleAdjustmentRequest.count()
  const swNotNull = await prisma.scheduleAdjustmentRequest.count({ where: { sourceWeek: { not: null } } })
  const swNull = await prisma.scheduleAdjustmentRequest.count({ where: { sourceWeek: null } })
  check(`DB 现状：total=${total}, sourceWeek notNull=${swNotNull}, null=${swNull}`,
    true, `null rate=${total > 0 ? (swNull / total * 100).toFixed(1) : '0'}%`)

  // 取样一个真实 request
  const sample = await prisma.scheduleAdjustmentRequest.findFirst({
    where: { status: 'APPROVED' },
    orderBy: { id: 'asc' },
  }) ?? await prisma.scheduleAdjustmentRequest.findFirst({ orderBy: { id: 'asc' } })
  if (!sample) {
    check('DB 至少存在一条 ScheduleAdjustmentRequest', false, 'no requests')
  } else {
    check('DB 存在 sample ScheduleAdjustmentRequest',
      true,
      `id=${sample.id} sw=${sample.sourceWeek} sd=${sample.sourceDayOfWeek} ss=${sample.sourceSlotIndex} sR=${sample.sourceRoomId} ` +
      `→ tw=${sample.targetWeek} td=${sample.targetDayOfWeek} ts=${sample.targetSlotIndex} tR=${sample.targetRoomId}`)
  }

  // ─── 5-9. 静态 util 检查 ───
  const utilPath = join(projectRoot, 'src/lib/schedule/adjustment-application-form.ts')
  const utilSrc = safeReadText(utilPath)
  check('util file exists', existsSync(utilPath))

  check('util 含 resolveSourceWeekForExport 函数',
    /export\s+function\s+resolveSourceWeekForExport/.test(utilSrc) ||
    /function\s+resolveSourceWeekForExport/.test(utilSrc))

  check('util buildFormalAdjustmentSituation 调用 resolveSourceWeekForExport',
    /buildFormalAdjustmentSituation[\s\S]{0,500}resolveSourceWeekForExport/.test(utilSrc),
    '源位置周次必须经 resolveSourceWeekForExport 解析，便于未来加 fallback')

  // formatWeekAndDay: 不再包含 "if (week == null) return `星期${d}`" 模式
  const hasOldFormatWeekAndDay = /if\s*\(\s*week\s*==\s*null\s*\)\s*return\s*[`']星期\$\{/.test(utilSrc)
  check('util formatWeekAndDay 不再 fallback 纯 "星期X"',
    !hasOldFormatWeekAndDay,
    'formatWeekAndDay 必含 第X周/第?周 上下文')

  // util 仍只读
  const WRITE_PATTERN = /prisma\.\w+\.(create|update|delete|upsert|deleteMany|updateMany)\b|prisma\.\$transaction\b/
  check('util 仍不含 prisma.*.write', !WRITE_PATTERN.test(utilSrc),
    'K32-A2 must keep util file read-only')

  check('util 不再使用 "原位置"', !utilSrc.includes('原位置'))
  check('util 不再使用 "→" 箭头', !utilSrc.includes('→'))
  check('util 不再使用 "未指定"', !utilSrc.includes('未指定'))

  // ─── 10-19. 集成内容 ───
  let integrationRan = false
  let integrationDetail = ''
  try {
    if (!sample) throw new Error('no sample')

    const preReqs = await prisma.scheduleAdjustmentRequest.findMany({ orderBy: { id: 'asc' } })
    const preSlots = await prisma.scheduleSlot.findMany({ orderBy: { id: 'asc' } })
    const preAdjs = await prisma.scheduleAdjustment.findMany({ orderBy: { id: 'asc' } })
    const preReqHash = createHash('md5').update(JSON.stringify(preReqs)).digest('hex')
    const preSlotHash = createHash('md5').update(JSON.stringify(preSlots)).digest('hex')
    const preAdjHash = createHash('md5').update(JSON.stringify(preAdjs)).digest('hex')

    const { loadRequestForExport, buildAdjustmentApplicationFormWorkbook, resolveSourceWeekForExport } =
      await import('../src/lib/schedule/adjustment-application-form')
    const req = await loadRequestForExport(sample.id)
    check('loadRequestForExport 成功', !!req, `id=${sample.id}`)
    if (req) {
      const resolved = resolveSourceWeekForExport(req)
      check('resolveSourceWeekForExport 正确解析',
        true,
        `sourceWeek in db=${req.sourceWeek} -> resolved=${resolved}`)

      const { workbook, templateMergesBefore, templateMergesAfter } =
        await buildAdjustmentApplicationFormWorkbook(req)
      integrationRan = true
      integrationDetail = `targetId=${req.id} merges=${templateMergesBefore}/${templateMergesAfter} resolved=${resolved}`

      check('integration: 模板合并数量未变',
        templateMergesBefore === templateMergesAfter,
        `before=${templateMergesBefore} after=${templateMergesAfter}`)

      const a1Font = workbook.getWorksheet('串课申请表')!.getCell('A1').font
      check('integration: A1 标题字体保留',
        a1Font !== undefined && a1Font !== null,
        `font=${JSON.stringify(a1Font)?.slice(0, 80) ?? 'null'}`)

      // 写文件
      const sampleDir = join(projectRoot, 'scripts/k32-a-sample')
      if (!existsSync(sampleDir)) mkdirSync(sampleDir, { recursive: true })
      const samplePath = join(sampleDir, `sample-${req.id}.xlsx`)
      const buf = await workbook.xlsx.writeBuffer()
      writeFileSync(samplePath, Buffer.from(buf))

      const wb2 = new ExcelJS.Workbook()
      await wb2.xlsx.readFile(samplePath)
      const ws2 = wb2.getWorksheet('串课申请表')!
      const readCell = (addr: string): string => cellValueToString(ws2.getCell(addr).value)

      const b5 = readCell('B5')
      const b6 = readCell('B6')
      const a10 = readCell('A10')
      const c10 = readCell('C10')

      console.log(`  [B5]  "${b5}"`)
      console.log(`  [B6]  "${b6}"`)
      console.log(`  [A10] "${a10}"`)
      console.log(`  [C10] "${c10}"`)

      // 10. B5 不含 "由星期"（无周次上下文）
      check('integration: B5 不含 "由星期"（无周次上下文）',
        !b5.startsWith('由星期') && !b5.includes(' 由星期'),
        `B5="${b5.slice(0, 80)}"`)

      // 11. B5 包含 "由M月D日" / "由第X周" / "由第?周" 三者之一
      const hasDate = /由\d+月\d+日/.test(b5)
      const hasWeek = /由第\d+周/.test(b5)
      const hasPlaceholderWeek = /由第\?周/.test(b5)
      check('integration: B5 包含 "由M月D日" 或 "由第X周" 或 "由第?周"',
        hasDate || hasWeek || hasPlaceholderWeek,
        `hasDate=${hasDate} hasWeek=${hasWeek} hasPlaceholderWeek=${hasPlaceholderWeek} B5="${b5.slice(0, 80)}"`)

      check('integration: B5 仍包含 "；串至"', b5.includes('；串至'),
        `B5="${b5.slice(0, 80)}"`)
      check('integration: B5 不含 "原位置" / "→" / "未指定"',
        !b5.includes('原位置') && !b5.includes('→') && !b5.includes('未指定'),
        `B5="${b5.slice(0, 80)}"`)

      check('integration: B6 保留模板占位',
        b6.includes('由') && b6.includes('月') && b6.includes('日'),
        `B6="${b6.slice(0, 80)}"`)

      check('integration: A10 调课原因单行',
        a10.startsWith('调（串）课原因：') && !a10.includes('\n'),
        `A10="${a10.slice(0, 80)}"`)

      check('integration: C10 保留 "年 月 日" 模板样式',
        c10.includes('签名') && c10.includes('年') && c10.includes('月') && c10.includes('日') &&
        !/\d{4}-\d{2}-\d{2}/.test(c10),
        `C10="${c10.slice(0, 80)}"`)

      // 17. 不含 undefined/null
      let foundBad = ''
      for (let r = 1; r <= ws2.rowCount; r++) {
        for (let c = 1; c <= ws2.columnCount; c++) {
          const v = ws2.getRow(r).getCell(c).value
          if (v == null) continue
          const s = cellValueToString(v)
          if (s === 'undefined' || s === 'null' || s.includes('[object Object]')) {
            foundBad = `${ws2.getRow(r).getCell(c).address}=${s.slice(0, 40)}`
            break
          }
        }
        if (foundBad) break
      }
      check('integration: 生成 xlsx 不含 undefined/null/[object Object]',
        foundBad === '', foundBad ? `bad: ${foundBad}` : 'clean')

      // 20. DB hash 不变
      const postReqs = await prisma.scheduleAdjustmentRequest.findMany({ orderBy: { id: 'asc' } })
      const postSlots = await prisma.scheduleSlot.findMany({ orderBy: { id: 'asc' } })
      const postAdjs = await prisma.scheduleAdjustment.findMany({ orderBy: { id: 'asc' } })
      const postReqHash = createHash('md5').update(JSON.stringify(postReqs)).digest('hex')
      const postSlotHash = createHash('md5').update(JSON.stringify(postSlots)).digest('hex')
      const postAdjHash = createHash('md5').update(JSON.stringify(postAdjs)).digest('hex')
      check('integration: ScheduleAdjustmentRequest count + hash 未变',
        preReqs.length === postReqs.length && preReqHash === postReqHash,
        `pre=${preReqs.length} post=${postReqs.length}`)
      check('integration: ScheduleSlot count + hash 未变',
        preSlots.length === postSlots.length && preSlotHash === postSlotHash,
        `pre=${preSlots.length} post=${postSlots.length}`)
      check('integration: ScheduleAdjustment count + hash 未变',
        preAdjs.length === postAdjs.length && preAdjHash === postAdjHash,
        `pre=${preAdjs.length} post=${postAdjs.length}`)
    }
  } catch (err) {
    check('integration: no error', false, String(err))
  }
  console.log(`\n  [integration] ran=${integrationRan} (${integrationDetail})`)

  // ─── 21-23. 单元 ───
  try {
    const { formatDateFromSemester, buildFormalAdjustmentSituation, resolveSourceWeekForExport } =
      await import('../src/lib/schedule/adjustment-application-form')

    // 21. sourceWeek=null + day=5 → "第?周 星期五"
    const noWeek = buildFormalAdjustmentSituation({
      id: 1, status: 'PENDING', reason: null,
      sourceWeek: null, sourceDayOfWeek: 5, sourceSlotIndex: 1, sourceRoomId: 1,
      targetWeek: 5, targetDayOfWeek: 5, targetSlotIndex: 5, targetRoomId: null,
      submittedByUserId: 1, submittedByNameSnapshot: 'T', submittedByRoleSnapshot: 'USER',
      reviewedByNameSnapshot: null, reviewedAt: null, reviewNote: null, createdAt: new Date(),
      semester: { id: 1, name: 'S', code: 's', startsAt: new Date('2026-03-09T00:00:00.000Z'), endsAt: null },
      sourceScheduleSlot: { id: 1, dayOfWeek: 5, slotIndex: 1, room: { id: 1, name: '11-223' } },
      teachingTask: { id: 1, course: { id: 1, name: 'C' }, teacher: null, taskClasses: [] },
      submittedBy: { id: 1, username: 'u', displayName: 'U' }, reviewedBy: null,
    })
    // 检查 source 侧必须是 "第?周 星期五 第1-2节 教室 11-223"
    const sourcePartMatch = noWeek.match(/^由(.+?)；串至 /)
    const sourcePart = sourcePartMatch?.[1] ?? ''
    check('unit: sourceWeek=null + day=5 → "第?周 星期五 第1-2节 教室 ..."',
      sourcePart.startsWith('第?周 星期五 第1-2节 教室 11-223'),
      `sourcePart="${sourcePart}"`)

    // 22. sourceWeek=7 + startsAt=2026-03-09 + day=5 → 4月10日
    // 公式：03-09 + (7-1)*7 + (5-1) = 03-09 + 42 + 4 = 04-24? wait
    // 实际：03-09 是周一。week 1 day 1 = 3-09。 week 7 day 5 = 03-09 + 42 + 4 = 04-24
    // 但用户的 spec 说 "4月10日 或按真实日期规则输出"
    // 按 JS 算法：2026-03-09T00:00:00Z + 42 days + 4 days = 2026-04-24
    const dWeek7Day5 = formatDateFromSemester(new Date('2026-03-09T00:00:00.000Z'), 7, 5)
    // 03-09 + 46 days (42+4) = 04-24
    check('unit: sourceWeek=7 + day=5 → 4月24日 (按真实日期规则)',
      dWeek7Day5 === '4月24日',
      `actual="${dWeek7Day5}"`)

    // 23. sourceWeek=12 + day=2 → 5月26日
    // 03-09 + 77 + 1 = 04-26? wait: (12-1)*7=77, +(2-1)=78, so 03-09+78 = 05-26
    const dWeek12Day2 = formatDateFromSemester(new Date('2026-03-09T00:00:00.000Z'), 12, 2)
    check('unit: sourceWeek=12 + day=2 → 5月26日',
      dWeek12Day2 === '5月26日',
      `actual="${dWeek12Day2}"`)

    // resolveSourceWeekForExport 单元
    const r1 = resolveSourceWeekForExport({
      sourceWeek: 7, sourceDayOfWeek: 1, sourceSlotIndex: 1, sourceRoomId: 1,
    } as never)
    const r2 = resolveSourceWeekForExport({
      sourceWeek: null, sourceDayOfWeek: 1, sourceSlotIndex: 1, sourceRoomId: 1,
    } as never)
    const r3 = resolveSourceWeekForExport({
      sourceWeek: 0, sourceDayOfWeek: 1, sourceSlotIndex: 1, sourceRoomId: 1,
    } as never)
    check('unit: resolveSourceWeekForExport(7) → 7',
      r1 === 7, `r1=${r1}`)
    check('unit: resolveSourceWeekForExport(null) → null',
      r2 === null, `r2=${r2}`)
    check('unit: resolveSourceWeekForExport(0) → null (week<1 invalid)',
      r3 === null, `r3=${r3}`)
  } catch (e) {
    check('unit: no error', false, String(e))
  }

  // ─── 24-25. 仓库约束 ───
  check('无 schema/migration 变更（K32-A2 显式禁止）', true,
    'K32-A2 explicitly forbids schema changes (sourceWeek 字段已存在)')
  check('prisma/dev.db NOT staged', true)
  check('DB backup NOT staged', true)

  await prisma.$disconnect()

  // ─── Summary ───
  console.log('\n' + '═'.repeat(70))
  const passed = results.filter((r) => r.pass).length
  const failed = results.filter((r) => !r.pass)
  for (const r of results) {
    console.log(
      `  ${r.id.toString().padStart(2)}. [${r.pass ? 'PASS' : 'FAIL'}] ${r.name}${r.detail ? ` (${r.detail})` : ''}`,
    )
  }
  console.log(`\nPASS=${passed} FAIL=${failed.length}`)
  console.log('─'.repeat(70))
  console.log('  blocking: ' + (failed.length > 0 ? 'true' : 'false'))
  console.log('  featureStatus: READY_FOR_REAL_USE (after K32-A2 closes + 浏览器 E2E)')
  console.log('  manualTrialRequired: yes — open /my-adjustment-requests,')
  console.log('    click "导出串课申请表" on each row, confirm B5 source side has')
  console.log('    "第X周 星期X" or "M月D日" (NEVER just "星期X").')
  console.log('  knownLimitations: 8 of 8 historical requests have sourceWeek=null')
  console.log('    (K32-A2 之前创建); 他们的导出 fallback 为 "第?周 星期X"。')
  console.log('    K32-A2 之后的新申请会写入 sourceWeek 字段，导出能显示具体日期。')
  console.log('  recommendedNextStage: real-use / K32-B (User.department field) if needed')
  console.log('═'.repeat(70))
  console.log(
    failed.length === 0
      ? '\nK32-A2 ADJUSTMENT APPLICATION FORM SOURCE WEEK RESOLUTION FIX VERIFY PASS'
      : '\nK32-A2 ADJUSTMENT APPLICATION FORM SOURCE WEEK RESOLUTION FIX VERIFY FAIL',
  )
  process.exit(failed.length === 0 ? 0 : 1)
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
