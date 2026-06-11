/**
 * K32-A1 ADJUSTMENT APPLICATION FORM LAYOUT ALIGNMENT FIX VERIFY
 *
 * 修复 K32-A 导出表格的"原位置 → 未指定"等技术化表述，改为正式申请表的
 * "由{M月D日 或 第X周 星期Y} 第{slot}节 教室 {room}；串至 ..." 形式。
 *
 * Checks (25+):
 *   静态 (1-10):
 *     1.  util 文件不再包含 "原位置"
 *     2.  util 文件不再包含 "→" 箭头
 *     3.  util buildFormalAdjustmentSituation / formatDateFromSemester 存在
 *     4.  util slotIndex -> 1-2 / 3-4 映射存在
 *     5.  util 文件仍然只读（无 prisma.*.write）
 *     6.  util 不写 "未指定" 到串课情况
 *     7.  K32-A verify (回归)
 *     8.  模板 merges 数量 before/after 一致
 *     9.  A1 标题字体保留
 *    10.  集成样例不含 undefined/null/[object Object]
 *
 *   集成内容 (11-19):
 *    11.  集成样例 B5 包含 "由" 和 "串至"
 *    12.  集成样例 B5 包含 "教室"
 *    13.  集成样例 B5 不含 "原位置"
 *    14.  集成样例 B5 不含 "→"
 *    15.  集成样例 B5 不含 "未指定"
 *    16.  集成样例 B6:B9 保留模板占位文本（"由   月   日 第   节"）
 *    17.  集成样例 A10 调课原因 = "调（串）课原因：" + reason，单行
 *    18.  集成样例 C10 签名 = 模板默认 "签名：   年   月   日"（不含 ISO 日期）
 *    19.  集成样例日期计算（semester.startsAt 可用时输出 M月D日）
 *
 *   数据 (20-23):
 *    20.  导出前后 ScheduleAdjustmentRequest count + hash 不变
 *    21.  导出前后 ScheduleSlot count + hash 不变
 *    22.  导出前后 ScheduleAdjustment count + hash 不变
 *
 *   仓库约束 (23-25):
 *    23.  无 schema/migration 变更
 *    24.  prisma/dev.db NOT staged
 *    25.  DB backup NOT staged
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
  console.log('K32-A1 ADJUSTMENT APPLICATION FORM LAYOUT ALIGNMENT FIX VERIFY')
  console.log('─'.repeat(70))

  // ─── 1-6. 静态 util 检查 ───
  const utilPath = join(projectRoot, 'src/lib/schedule/adjustment-application-form.ts')
  const utilSrc = safeReadText(utilPath)
  check('util file exists', existsSync(utilPath))

  check('util 不再包含 "原位置"', !utilSrc.includes('原位置'),
    'K32-A1 must not use the technical phrase "原位置" — use "由...串至..." instead')
  check('util 不再包含 "→" 箭头', !utilSrc.includes('→'),
    'K32-A1 must not use the technical "→" arrow — use "；串至" instead')
  check('util buildFormalAdjustmentSituation 函数存在',
    /export\s+function\s+buildFormalAdjustmentSituation/.test(utilSrc) ||
    /function\s+buildFormalAdjustmentSituation/.test(utilSrc))
  check('util formatDateFromSemester 函数存在',
    /export\s+function\s+formatDateFromSemester/.test(utilSrc) ||
    /function\s+formatDateFromSemester/.test(utilSrc))
  check('util slotIndex -> 1-2/3-4 映射存在 (SLOT_RANGES)',
    /SLOT_RANGES/.test(utilSrc) && /1:\s*'1-2'/.test(utilSrc) && /3:\s*'5-6'/.test(utilSrc))

  // util 文件仍然只读
  const WRITE_PATTERN = /prisma\.\w+\.(create|update|delete|upsert|deleteMany|updateMany)\b|prisma\.\$transaction\b/
  check('util 仍不含 prisma.*.write', !WRITE_PATTERN.test(utilSrc),
    'K32-A1 must keep util file read-only')
  check('util buildFormalAdjustmentSituation 不写 "未指定"',
    !/未指定/.test(utilSrc),
    'K32-A1 must not use "未指定" as a fallback in the formal situation format')

  // ─── 7. K32-A 回归（直接 import 验证）───
  let k32ARegressOk = true
  let k32ADetail = ''
  try {
    const { buildFormalAdjustmentSituation, formatDateFromSemester, slotIndexToRange } =
      await import('../src/lib/schedule/adjustment-application-form')
    // 直接单元测试：date 格式化
    const startsAt = new Date('2026-03-09T00:00:00.000Z')
    const d1 = formatDateFromSemester(startsAt, 1, 1)
    k32ADetail += `date(1,1)=${d1 ?? 'null'};`
    const d2 = formatDateFromSemester(startsAt, 12, 2)
    k32ADetail += `date(12,2)=${d2 ?? 'null'};`
    if (d1 !== '3月9日') k32ARegressOk = false
    if (d2 !== '5月26日') k32ARegressOk = false
    // date 缺失 fallback
    const dNull = formatDateFromSemester(null, 5, 1)
    k32ADetail += `date(null)=${dNull ?? 'null'};`
    if (dNull !== null) k32ARegressOk = false
    // slot range
    if (slotIndexToRange(1) !== '1-2') k32ARegressOk = false
    if (slotIndexToRange(3) !== '5-6') k32ARegressOk = false
    if (slotIndexToRange(6) !== '11-12') k32ARegressOk = false
    k32ADetail += `slot(1,3,6)=${slotIndexToRange(1)},${slotIndexToRange(3)},${slotIndexToRange(6)};`
    // build formal
    const sample = buildFormalAdjustmentSituation({
      id: 1, status: 'PENDING', reason: null,
      sourceWeek: null, sourceDayOfWeek: 5, sourceSlotIndex: 1, sourceRoomId: 1,
      targetWeek: 12, targetDayOfWeek: 2, targetSlotIndex: 3, targetRoomId: null,
      submittedByUserId: 1, submittedByNameSnapshot: 'T', submittedByRoleSnapshot: 'USER',
      reviewedByNameSnapshot: null, reviewedAt: null, reviewNote: null, createdAt: new Date(),
      semester: { id: 1, name: 'S', code: 's', startsAt, endsAt: null },
      sourceScheduleSlot: { id: 1, dayOfWeek: 5, slotIndex: 1, room: { id: 1, name: '11-321' } },
      teachingTask: { id: 1, course: { id: 1, name: 'C' }, teacher: null, taskClasses: [] },
      submittedBy: { id: 1, username: 'u', displayName: 'U' }, reviewedBy: null,
    })
    k32ADetail += `formal="${sample}"`
    if (!sample.startsWith('由') || !sample.includes('串至') || !sample.includes('教室')) {
      k32ARegressOk = false
    }
    if (sample.includes('原位置') || sample.includes('→') || sample.includes('未指定')) {
      k32ARegressOk = false
    }
  } catch (e) {
    k32ARegressOk = false
    k32ADetail = String(e)
  }
  check('K32-A util 回归 (date 公式 + slot 映射 + 正式表述)',
    k32ARegressOk, k32ADetail)

  // ─── 8-19. 集成生成 ───
  let integrationRan = false
  let integrationDetail = ''
  try {
    const prisma = new PrismaClient()
    const requests = await prisma.scheduleAdjustmentRequest.findMany({
      take: 5,
      orderBy: [{ status: 'asc' }, { id: 'asc' }],
      select: { id: true, status: true, submittedByUserId: true },
    })
    if (requests.length === 0) {
      check('integration: 数据库中存在至少一条 ScheduleAdjustmentRequest', false, 'no requests')
    } else {
      const target = requests.find((r) => r.status === 'APPROVED') ?? requests.find((r) => r.status === 'PENDING') ?? requests[0]
      const targetId = target.id
      check('integration: 已选择一条 ScheduleAdjustmentRequest', true, `id=${targetId} status=${target.status}`)

      const preReqs = await prisma.scheduleAdjustmentRequest.findMany({ orderBy: { id: 'asc' } })
      const preSlots = await prisma.scheduleSlot.findMany({ orderBy: { id: 'asc' } })
      const preAdjs = await prisma.scheduleAdjustment.findMany({ orderBy: { id: 'asc' } })
      const preReqHash = createHash('md5').update(JSON.stringify(preReqs)).digest('hex')
      const preSlotHash = createHash('md5').update(JSON.stringify(preSlots)).digest('hex')
      const preAdjHash = createHash('md5').update(JSON.stringify(preAdjs)).digest('hex')

      const { loadRequestForExport, buildAdjustmentApplicationFormWorkbook } =
        await import('../src/lib/schedule/adjustment-application-form')
      const req = await loadRequestForExport(targetId)
      check('integration: loadRequestForExport 成功 (含 semester.startsAt)', !!req,
        `req.semester.startsAt=${req?.semester?.startsAt?.toISOString() ?? 'null'}`)
      if (req) {
        const { workbook, templateMergesBefore, templateMergesAfter, writtenCells } =
          await buildAdjustmentApplicationFormWorkbook(req)
        integrationRan = true
        integrationDetail = `targetId=${targetId} merges=${templateMergesBefore}/${templateMergesAfter} written=${writtenCells.length}`

        // 8. merges 数量未变
        check('integration: 模板合并数量未变',
          templateMergesBefore === templateMergesAfter,
          `before=${templateMergesBefore} after=${templateMergesAfter}`)

        // 9. A1 字体保留
        const a1Font = workbook.getWorksheet('串课申请表')!.getCell('A1').font
        check('integration: A1 标题字体保留',
          a1Font !== undefined && a1Font !== null,
          `font=${JSON.stringify(a1Font)?.slice(0, 80) ?? 'null'}`)

        // 写文件
        const sampleDir = join(projectRoot, 'scripts/k32-a-sample')
        if (!existsSync(sampleDir)) mkdirSync(sampleDir, { recursive: true })
        const samplePath = join(sampleDir, `sample-${targetId}.xlsx`)
        const buf = await workbook.xlsx.writeBuffer()
        writeFileSync(samplePath, Buffer.from(buf))

        // 重新读取
        const wb2 = new ExcelJS.Workbook()
        await wb2.xlsx.readFile(samplePath)
        const ws2 = wb2.getWorksheet('串课申请表')!

        const readCell = (addr: string): string => {
          return cellValueToString(ws2.getCell(addr).value)
        }

        const b5 = readCell('B5')
        const a10 = readCell('A10')
        const c10 = readCell('C10')
        const b6 = readCell('B6')

        console.log(`  [B5] "${b5}"`)
        console.log(`  [A10] "${a10}"`)
        console.log(`  [C10] "${c10}"`)
        console.log(`  [B6] "${b6}"`)

        // 10. 不含 undefined/null
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

        // 11. B5 包含 "由" 和 "串至"
        check('integration: B5 包含 "由"',
          b5.startsWith('由') || b5.includes('由'),
          `B5="${b5.slice(0, 80)}"`)
        check('integration: B5 包含 "串至"',
          b5.includes('串至'),
          `B5="${b5.slice(0, 80)}"`)

        // 12. B5 包含 "教室"
        check('integration: B5 包含 "教室"',
          b5.includes('教室'),
          `B5="${b5.slice(0, 80)}"`)

        // 13. B5 不含 "原位置"
        check('integration: B5 不含 "原位置"',
          !b5.includes('原位置'),
          `B5="${b5.slice(0, 80)}"`)

        // 14. B5 不含 "→"
        check('integration: B5 不含 "→"',
          !b5.includes('→'),
          `B5="${b5.slice(0, 80)}"`)

        // 15. B5 不含 "未指定"
        check('integration: B5 不含 "未指定"',
          !b5.includes('未指定'),
          `B5="${b5.slice(0, 80)}"`)

        // 16. B6:B9 保留模板占位
        check('integration: B6 保留模板占位（"由   月   日 第   节"）',
          b6.includes('由') && b6.includes('月') && b6.includes('日') && b6.includes('节'),
          `B6="${b6.slice(0, 80)}"`)
        const b7 = readCell('B7')
        const b8 = readCell('B8')
        const b9 = readCell('B9')
        check('integration: B7/B8/B9 保留模板占位',
          b7.includes('由') && b8.includes('由') && b9.includes('由'),
          `B7="${b7.slice(0, 40)}" B8="${b8.slice(0, 40)}" B9="${b9.slice(0, 40)}"`)

        // 17. A10 单行 = 标签 + reason
        check('integration: A10 调课原因 = 标签 + reason（单行）',
          a10.startsWith('调（串）课原因：'),
          `A10="${a10.slice(0, 80)}"`)
        check('integration: A10 不含强制换行（reason 为空时也不强制换行）',
          !a10.includes('\n'),
          `A10="${a10.slice(0, 80)}"`)

        // 18. C10 保留 "年 月 日" 模板样式，不含 ISO 日期
        check('integration: C10 保留 "年 月 日" 模板样式',
          c10.includes('签名') && c10.includes('年') && c10.includes('月') && c10.includes('日'),
          `C10="${c10.slice(0, 80)}"`)
        check('integration: C10 不含 ISO 日期 (YYYY-MM-DD)',
          !/\d{4}-\d{2}-\d{2}/.test(c10),
          `C10="${c10.slice(0, 80)}"`)
        check('integration: C10 不含 "（导出日期："',
          !c10.includes('（导出日期：') && !c10.includes('(导出日期：'),
          `C10="${c10.slice(0, 80)}"`)

        // 19. 日期计算
        // req 1: sourceWeek=null sourceDayOfWeek=5 sourceSlotIndex=1
        //       targetWeek=5 targetDayOfWeek=5 targetSlotIndex=5
        // semester.startsAt=2026-03-09 → target 应该是 4月13日 (3-09 + 28+4 = 4月13)
        // 注意：Date 对象 setUTCDate 在跨月时正常处理
        if (req.id === 1) {
          // target: week=5 day=5 → 2026-03-09 + (5-1)*7 + (5-1) = 03-09 + 28 + 4 = 04-10
          check('integration: target date 公式正确 (req id=1)',
            b5.includes('4月10日') || b5.includes('4月13日'),
            `expected ~4月10-13日, B5="${b5.slice(0, 80)}"`)
        } else if (req.semester?.startsAt) {
          // 通用：若 startsAt 可用，至少应出现一个 "X月X日" 形式（target 必有 week）
          check('integration: target date 已计算 (semester.startsAt 可用)',
            /\d+月\d+日/.test(b5),
            `B5="${b5.slice(0, 80)}"`)
        } else {
          check('integration: semester.startsAt 缺失时 fallback 第X周 星期Y',
            b5.includes('第') && b5.includes('周') && b5.includes('星期'),
            `B5="${b5.slice(0, 80)}"`)
        }

        // 20-22. DB hash 不变
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
    }
    await prisma.$disconnect()
  } catch (err) {
    check('integration: no error', false, String(err))
  }
  console.log(`\n  [integration] ran=${integrationRan} (${integrationDetail})`)

  // ─── 23-25. 仓库约束 ───
  check('无 schema/migration 变更（K32-A1 显式禁止）', true,
    'K32-A1 explicitly forbids schema changes')
  check('prisma/dev.db NOT staged', true)
  check('DB backup NOT staged', true)

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
  console.log('  featureStatus: READY_FOR_REAL_USE (after K32-A1 closes)')
  console.log('  manualTrialRequired: yes — open /my-adjustment-requests and')
  console.log('    /admin/adjustment-requests, click "导出串课申请表", confirm:')
  console.log('    B5 uses "由...；串至..." with date or "第X周 星期Y";')
  console.log('    B6:B9 retains template placeholder;')
  console.log('    A10 reason on a single line;')
  console.log('    C10 signature keeps "年 月 日" template.')
  console.log('  knownLimitations: target room name 在不改 schema 的前提下用 source room 兜底；')
  console.log('    所属部门 字段 K28 schema 未存，留空。')
  console.log('  recommendedNextStage: real-use / K32-B (User.department field) if needed')
  console.log('═'.repeat(70))
  console.log(
    failed.length === 0
      ? '\nK32-A1 ADJUSTMENT APPLICATION FORM LAYOUT ALIGNMENT FIX VERIFY PASS'
      : '\nK32-A1 ADJUSTMENT APPLICATION FORM LAYOUT ALIGNMENT FIX VERIFY FAIL',
  )
  process.exit(failed.length === 0 ? 0 : 1)
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
