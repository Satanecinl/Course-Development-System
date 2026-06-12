/**
 * G0-FIX-A 测试：parser 防线 + seed/importer 一致性 + 重复保护
 *
 * 测试范围：
 * 1. 非法 token 不生成课程
 * 2. synthetic parser 回归测试
 * 3. synthetic fixture 重复保护
 * 4. seed/importer key 一致性测试
 */

import { execFileSync } from 'child_process'
import * as fs from 'fs'
import * as os from 'os'
import * as path from 'path'

const DOCKER_ROOT = path.resolve(__dirname, '..')
const PARSER_PATH = path.resolve(__dirname, 'parse_schedule.py')
const MOCK_SCRIPT_PATH = path.resolve(__dirname, 'create_mock_data.py')

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

// ── 测试 2：synthetic parser 回归测试 ──

function test0420Parser(): TestResult {
  const details: string[] = []
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'g0-parser-guards-'))
  const tmpDocx = path.join(tmpDir, 'schedule.synthetic.docx')
  const tmpOutput = path.join(tmpDir, 'schedule.synthetic.json')
  try {
    execFileSync('python', [MOCK_SCRIPT_PATH, tmpDocx], {
      encoding: 'utf-8',
      timeout: 120000,
    })
    execFileSync('python', [PARSER_PATH, tmpDocx, '-o', tmpOutput], {
      encoding: 'utf-8',
      timeout: 120000,
    })
  } catch (e: any) {
    details.push(`FAIL: parser 执行失败: ${e.message}`)
    fs.rmSync(tmpDir, { recursive: true, force: true })
    return { name: '2. synthetic parser 回归测试', passed: false, details }
  }

  if (!fs.existsSync(tmpOutput)) {
    details.push('FAIL: parser 未生成输出文件')
    fs.rmSync(tmpDir, { recursive: true, force: true })
    return { name: '2. synthetic parser 回归测试', passed: false, details }
  }

  const raw = fs.readFileSync(tmpOutput, 'utf-8')
  let records: any[] = []
  try {
    const parsed = JSON.parse(raw)
    records = Array.isArray(parsed) ? parsed : parsed.records || []
  } catch {
    details.push('FAIL: JSON 解析失败')
    fs.rmSync(tmpDir, { recursive: true, force: true })
    return { name: '2. synthetic parser 回归测试', passed: false, details }
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

  // 断言 4: synthetic fixture 包含 3 个班级
  const classes = new Set(records.map((r: any) => r.class_info?.class_name).filter(Boolean))
  details.push(assertEqual(classes.size, 3, `班级数 = 3 (实际 ${classes.size})`))

  // 断言 5: 明确 synthetic 班级有 records
  const syntheticClass = records.filter((r: any) => r.class_info?.class_name === '测试专业2026级乙班')
  details.push(assertTrue(syntheticClass.length > 0, `synthetic 乙班 records > 0 (实际 ${syntheticClass.length})`))

  // 断言 6: 同一 class+course+teacher+room+day+slot+week 不重复
  const classKeys = new Set<string>()
  let classDup = 0
  for (const r of syntheticClass) {
    const key = `${r.course}|${r.teacher}|${r.room}|${r.day_of_week}|${r.time_slot}|${r.week_type}|${r.week_start}-${r.week_end}`
    if (classKeys.has(key)) classDup++
    else classKeys.add(key)
  }
  details.push(assertEqual(classDup, 0, `synthetic 乙班重复 records = 0 (实际 ${classDup})`))

  fs.rmSync(tmpDir, { recursive: true, force: true })

  return { name: '2. synthetic parser 回归测试', passed: details.every((d) => !d.startsWith('FAIL')), details }
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
