/**
 * G0-FIX-A 测试：parser 防线 + seed/importer 一致性 + 重复保护
 *
 * 测试范围：
 * 1. 非法 token 不生成课程
 * 2. 0420 parser 回归测试
 * 3. 汽车制造与试验技术2班重复保护
 * 4. seed/importer key 一致性测试
 */

import { execSync } from 'child_process'
import * as fs from 'fs'
import * as path from 'path'

const DOCKER_ROOT = path.resolve(__dirname, '..')
const PARSER_PATH = path.resolve(__dirname, 'parse_schedule.py')
const DOCX_0420 = path.resolve(DOCKER_ROOT, '..', '2026年春季学期课程表(0420).docx')

interface TestResult {
  name: string
  passed: boolean
  details: string[]
}

const results: TestResult[] = []

function assertEqual(actual: any, expected: any, msg: string): string {
  if (actual !== expected) {
    return `FAIL: ${msg} — expected ${expected}, got ${actual}`
  }
  return `PASS: ${msg}`
}

function assertTrue(cond: boolean, msg: string): string {
  return cond ? `PASS: ${msg}` : `FAIL: ${msg}`
}

// ── 测试 1：非法 token 不生成课程 ──

function testIllegalTokens(): TestResult {
  const details: string[] = []
  const illegalTokens = [
    '周一', '周二', '周三', '周四', '周五', '周六', '周日',
    '一', '二', '三', '四', '五', '六', '日',
    '1、2', '3、4', '5、6', '7、8', '9、10', '9.10',
    '1-2节', '3-4节', '5-6节', '7-8节', '9-10节',
    '专业年级班', '人数', '教室',
  ]

  // 检查 parse_schedule.py 中的 HEADER_COURSE_TEXTS 是否包含所有 token
  const parserSource = fs.readFileSync(PARSER_PATH, 'utf-8')

  for (const token of illegalTokens) {
    // 在 HEADER_COURSE_TEXTS 集合中查找该 token
    const hasToken = parserSource.includes(`'${token}'`)
    if (!hasToken) {
      details.push(`FAIL: HEADER_COURSE_TEXTS 缺少 "${token}"`)
    }
  }
  details.push(assertTrue(
    illegalTokens.every((t) => parserSource.includes(`'${t}'`)),
    `所有 ${illegalTokens.length} 个非法 token 都在 parser 过滤列表中`
  ))

  return { name: '1. 非法 token 过滤列表完整性', passed: details.every((d) => !d.startsWith('FAIL')), details }
}

// ── 测试 2：0420 parser 回归测试 ──

function test0420Parser(): TestResult {
  const details: string[] = []

  if (!fs.existsSync(DOCX_0420)) {
    details.push(`SKIP: 0420 源文件不存在: ${DOCX_0420}`)
    return { name: '2. 0420 parser 回归测试', passed: true, details }
  }

  const tmpOutput = path.resolve(__dirname, '0420_test_output.json')
  try {
    execSync(`python "${PARSER_PATH}" "${DOCX_0420}" -o "${tmpOutput}"`, {
      encoding: 'utf-8',
      timeout: 120000,
    })
  } catch (e: any) {
    details.push(`FAIL: parser 执行失败: ${e.message}`)
    return { name: '2. 0420 parser 回归测试', passed: false, details }
  }

  if (!fs.existsSync(tmpOutput)) {
    details.push('FAIL: parser 未生成输出文件')
    return { name: '2. 0420 parser 回归测试', passed: false, details }
  }

  const raw = fs.readFileSync(tmpOutput, 'utf-8')
  let records: any[] = []
  try {
    const parsed = JSON.parse(raw)
    records = Array.isArray(parsed) ? parsed : parsed.records || []
  } catch {
    details.push('FAIL: JSON 解析失败')
    return { name: '2. 0420 parser 回归测试', passed: false, details }
  }

  // 断言 1: records > 0
  details.push(assertTrue(records.length > 0, `records > 0 (实际 ${records.length})`))

  // 断言 2: 非法课程 = 0
  const illegal = ['周六', '周日', '3、4', '5、6', '7、8', '9、10', '9.10', '专业年级班', '人数', '教室']
  const badCourses = records.filter((r: any) => illegal.includes(r.course?.trim()))
  details.push(assertEqual(badCourses.length, 0, `非法课程数量 = 0 (实际 ${badCourses.length})`))

  // 断言 3: 完全重复 records = 0
  const keySet = new Set<string>()
  let dupCount = 0
  for (const r of records) {
    const key = [
      r.class_info?.class_name,
      r.course,
      r.teacher,
      r.room,
      r.day_of_week,
      r.time_slot,
      r.week_type,
      r.week_start,
      r.week_end,
      r.remark,
    ].join('|')
    if (keySet.has(key)) dupCount++
    else keySet.add(key)
  }
  details.push(assertEqual(dupCount, 0, `完全重复 records = 0 (实际 ${dupCount})`))

  // 断言 4: 班级数约等于 37
  const classes = new Set(records.map((r: any) => r.class_info?.class_name).filter(Boolean))
  details.push(assertTrue(classes.size >= 30 && classes.size <= 40, `班级数在 30-40 之间 (实际 ${classes.size})`))

  // 断言 5: 2024级汽车制造与试验技术2班 有 records
  const car2 = records.filter((r: any) => r.class_info?.class_name === '2024级汽车制造与试验技术2班')
  details.push(assertTrue(car2.length > 0, `2024级汽车制造与试验技术2班 records > 0 (实际 ${car2.length})`))

  // 断言 6: 同一 class+course+teacher+room+day+slot+week 不重复
  const car2Keys = new Set<string>()
  let car2Dup = 0
  for (const r of car2) {
    const key = `${r.course}|${r.teacher}|${r.room}|${r.day_of_week}|${r.time_slot}|${r.week_type}|${r.week_start}-${r.week_end}`
    if (car2Keys.has(key)) car2Dup++
    else car2Keys.add(key)
  }
  details.push(assertEqual(car2Dup, 0, `汽车制造2班重复 records = 0 (实际 ${car2Dup})`))

  fs.unlinkSync(tmpOutput)

  return { name: '2. 0420 parser 回归测试', passed: details.every((d) => !d.startsWith('FAIL')), details }
}

// ── 测试 3：seed_db.ts / importer.ts key 一致性（remark 不在 dedup key 中） ──

function testKeyConsistency(): TestResult {
  const details: string[] = []

  // 读取 seed_db.ts 的 taskKey 逻辑
  const seedSource = fs.readFileSync(path.resolve(__dirname, 'seed_db.ts'), 'utf-8')
  // 提取 taskKey 定义区域（从 "const taskKey = [" 到 "].join"）
  const taskKeyMatch = seedSource.match(/const taskKey = \[([\s\S]*?)\]\.join\("\|"\)/)
  const taskKeyBlock = taskKeyMatch ? taskKeyMatch[1] : ''

  const hasSlotIndexInSeed = taskKeyBlock.includes('slotIndex')
  const hasDayOfWeekInSeed = taskKeyBlock.includes('day_of_week')
  const hasRoomIdInSeed = taskKeyBlock.includes('roomId')

  details.push(assertTrue(
    !hasSlotIndexInSeed,
    'seed_db.ts taskKey 不再包含 slotIndex'
  ))
  details.push(assertTrue(
    !hasDayOfWeekInSeed,
    'seed_db.ts taskKey 不再包含 dayOfWeek'
  ))
  details.push(assertTrue(
    !hasRoomIdInSeed,
    'seed_db.ts taskKey 不再包含 roomId'
  ))

  // 确认 seed_db.ts 不再包含 remark（remark 差异不应导致重复 TeachingTask）
  const hasRemarkInSeed = taskKeyBlock.includes('remark')
  const hasClassSigInSeed = seedSource.includes('classSignature')
  details.push(assertTrue(!hasRemarkInSeed, 'seed_db.ts taskKey 不再包含 remark'))
  details.push(assertTrue(hasClassSigInSeed, 'seed_db.ts 使用 classSignature'))

  // 确认 importer.ts 的 ScheduleSlot 去重包含 roomId
  const importerSource = fs.readFileSync(
    path.resolve(DOCKER_ROOT, 'src', 'lib', 'import', 'importer.ts'),
    'utf-8'
  )
  const slotDedupHasRoom = /scheduleSlot\.findFirst.*roomId/.test(importerSource) ||
    /where:.*roomId/.test(importerSource)
  details.push(assertTrue(slotDedupHasRoom, 'importer.ts ScheduleSlot 去重包含 roomId'))

  return { name: '3. seed/importer key 一致性', passed: details.every((d) => !d.startsWith('FAIL')), details }
}

// ── 主流程 ──

function main() {
  console.log('═══════════════════════════════════════════════════════════════')
  console.log('              G0-FIX-A 测试报告')
  console.log('═══════════════════════════════════════════════════════════════')
  console.log('')

  results.push(testIllegalTokens())
  results.push(test0420Parser())
  results.push(testKeyConsistency())

  let totalPass = 0
  let totalFail = 0

  for (const r of results) {
    const emoji = r.passed ? '✅' : '❌'
    console.log(`\n${emoji} ${r.name}`)
    console.log('-'.repeat(60))
    for (const d of r.details) {
      console.log(`  ${d}`)
      if (d.startsWith('PASS')) totalPass++
      if (d.startsWith('FAIL')) totalFail++
    }
  }

  console.log('\n')
  console.log('═══════════════════════════════════════════════════════════════')
  console.log(`  总断言: ${totalPass + totalFail} | 通过: ${totalPass} | 失败: ${totalFail}`)
  console.log(`  测试套件: ${results.filter((r) => r.passed).length}/${results.length} 通过`)
  console.log('═══════════════════════════════════════════════════════════════')

  if (totalFail > 0 || results.some((r) => !r.passed)) {
    process.exit(1)
  }
}

main()
