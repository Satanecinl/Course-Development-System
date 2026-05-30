/**
 * K9-DQ-2-MATCHING: ClassGroup matching logic tests
 *
 * Tests for findMergedClassNames with year/track filtering and ambiguity protection.
 */

import { parseRemarkKeywords, findMergedClassNames } from '../src/lib/import/importer'

// ── Test Helpers ──

let passCount = 0
let failCount = 0

function assertEqual(actual: unknown, expected: unknown, label: string) {
  const actualJson = JSON.stringify(actual)
  const expectedJson = JSON.stringify(expected)
  if (actualJson === expectedJson) {
    console.log(`  PASS: ${label}`)
    passCount++
  } else {
    console.log(`  FAIL: ${label}`)
    console.log(`    expected: ${expectedJson}`)
    console.log(`    actual:   ${actualJson}`)
    failCount++
  }
}

function assertTrue(actual: boolean, label: string) {
  if (actual) {
    console.log(`  PASS: ${label}`)
    passCount++
  } else {
    console.log(`  FAIL: ${label}`)
    failCount++
  }
}

// ── Test Data ──

const ALL_CLASSES = [
  // 2024级
  { name: '2024级钢铁智能冶金技术1班（高本贯通）' },
  { name: '2024级钢铁智能冶金技术2班（高本贯通）' },
  { name: '2024级智能轧钢技术1班' },
  { name: '2024级森林草原防火技术1班' },
  { name: '2024级机电一体化技术1班' },
  // 2025级
  { name: '2025级钢铁智能冶金技术1班（高本贯通）' },
  { name: '2025级钢铁智能冶金技术2班（高本贯通）' },
  { name: '2025级钢铁智能冶金技术3班（高本贯通）' },
  { name: '2025级钢铁智能冶金技术（现场工程师）' },
  { name: '2025级智能轧钢技术1班' },
  { name: '2025级智能轧钢技术2班' },
  { name: '2025级智能轧钢技术（现场工程师）' },
  { name: '2025级机电一体化技术1班' },
  { name: '2025级机电一体化技术2班' },
  { name: '2025级机电一体化技术（现场工程师）' },
  { name: '2025级森林草原防火技术1班' },
  { name: '2025级森林草原资源保护1班' },
]

// ── Main ──

async function main() {
  console.log('=== K9-DQ-2-MATCHING: ClassGroup Matching Tests ===\n')

  // ── Test 1: 隐式跨年级不应匹配 ──
  console.log('Test 1: 隐式跨年级不应匹配')
  {
    const baseClass = '2024级钢铁智能冶金技术1班（高本贯通）'
    const remark = '与钢铁智能冶金合班'
    const keywords = parseRemarkKeywords(remark)
    const warnings: string[] = []
    const merged = await findMergedClassNames(keywords, baseClass, ALL_CLASSES, warnings)

    // 不应包含任何 2025 级班级
    const has2025 = merged.some((n) => n.startsWith('2025级'))
    assertTrue(!has2025, `base=2024, remark="${remark}" 不应匹配 2025 级`)
    assertEqual(merged.includes('2025级钢铁智能冶金技术1班（高本贯通）'), false, `不应匹配 2025级钢铁智能冶金技术1班（高本贯通）`)
    assertEqual(merged.includes('2025级钢铁智能冶金技术（现场工程师）'), false, `不应匹配 2025级钢铁智能冶金技术（现场工程师）`)
  }

  // ── Test 2: 隐式跨培养方向不应匹配 ──
  console.log('\nTest 2: 隐式跨培养方向不应匹配')
  {
    const baseClass = '2024级钢铁智能冶金技术1班（高本贯通）'
    const remark = '与钢铁智能冶金合班'
    const keywords = parseRemarkKeywords(remark)
    const warnings: string[] = []
    const merged = await findMergedClassNames(keywords, baseClass, ALL_CLASSES, warnings)

    assertEqual(merged.includes('2025级钢铁智能冶金技术（现场工程师）'), false, `不应匹配 现场工程师（方向不同）`)
    assertEqual(merged.includes('2025级智能轧钢技术（现场工程师）'), false, `不应匹配 智能轧钢现场工程师`)
  }

  // ── Test 3: 显式跨年级应允许匹配 ──
  console.log('\nTest 3: 显式跨年级应允许匹配')
  {
    const baseClass = '2024级钢铁智能冶金技术1班（高本贯通）'
    const remark = '与2025级钢铁智能冶金技术1班合班'
    const keywords = parseRemarkKeywords(remark)
    const warnings: string[] = []
    const merged = await findMergedClassNames(keywords, baseClass, ALL_CLASSES, warnings)

    assertTrue(merged.includes('2025级钢铁智能冶金技术1班（高本贯通）'), `显式 2025 级备注应匹配 2025级钢铁智能冶金技术1班（高本贯通）`)
  }

  // ── Test 4: 显式跨培养方向应允许匹配 ──
  console.log('\nTest 4: 显式跨培养方向应允许匹配')
  {
    const baseClass = '2024级钢铁智能冶金技术1班（高本贯通）'
    const remark = '与2025级钢铁智能冶金技术（现场工程师）合班'
    const keywords = parseRemarkKeywords(remark)
    const warnings: string[] = []
    const merged = await findMergedClassNames(keywords, baseClass, ALL_CLASSES, warnings)

    assertTrue(merged.includes('2025级钢铁智能冶金技术（现场工程师）'), `显式现场工程师备注应匹配 2025级钢铁智能冶金技术（现场工程师）`)
  }

  // ── Test 5: 同年级正常合班仍应匹配（精确匹配唯一班级） ──
  console.log('\nTest 5: 同年级正常合班仍应匹配（精确匹配唯一班级）')
  {
    // 使用包含班号的精确 remark，应唯一匹配到 2班
    const baseClass = '2025级钢铁智能冶金技术1班（高本贯通）'
    const remark = '与钢铁智能冶金技术2班合班'
    const keywords = parseRemarkKeywords(remark)
    const warnings: string[] = []
    const merged = await findMergedClassNames(keywords, baseClass, ALL_CLASSES, warnings)

    // "钢铁智能冶金技术2班" 应唯一匹配 2025级钢铁智能冶金技术2班（高本贯通）
    assertTrue(merged.includes('2025级钢铁智能冶金技术2班（高本贯通）'), `精确 remark 应匹配同年级 2班`)
    // 不应匹配 3班（remark 没提到 3班）
    assertEqual(merged.includes('2025级钢铁智能冶金技术3班（高本贯通）'), false, `不应匹配未提及的 3班`)
    // 不应跨方向
    assertEqual(merged.includes('2025级钢铁智能冶金技术（现场工程师）'), false, `同年级不同方向不应匹配`)
  }

  // ── Test 6: ambiguous 不静默绑定全部 ──
  console.log('\nTest 6: ambiguous 不静默绑定全部')
  {
    const baseClass = '2024级钢铁智能冶金技术1班（高本贯通）'
    const remark = '与钢铁智能冶金合班'
    const keywords = parseRemarkKeywords(remark)
    const warnings: string[] = []
    const merged = await findMergedClassNames(keywords, baseClass, ALL_CLASSES, warnings)

    // 2024级有：1班（高本贯通）、2班（高本贯通）—— 两个都匹配 "钢铁智能冶金"
    // 由于 keyword 没有显式年份/方向，过滤后只剩下 2024级高本贯通班
    // 其中 1班 是 baseClass(exclude)，2班 是唯一候选
    // 所以 merged 应包含 2班，不含 1班
    assertTrue(!merged.includes('2024级钢铁智能冶金技术1班（高本贯通）'), `不应包含 baseClass 自身`)

    // 检查 warnings 中是否有 AMBIGUOUS 标记
    const hasAmbiguousWarning = warnings.some((w) => w.includes('AMBIGUOUS'))
    // 对于 "钢铁智能冶金"，过滤后 2024级高本贯通只有 2班 一个候选（1班被排除）
    // 所以不应有 ambiguous
    console.log(`    warnings: ${JSON.stringify(warnings)}`)
  }

  // ── Test 7: 真正 ambiguous 场景 ──
  console.log('\nTest 7: 真正 ambiguous 场景（多个同年级同方向匹配）')
  {
    // 构造一个会有多个匹配的场景
    const ambiguousClasses = [
      { name: '2025级机电一体化技术1班' },
      { name: '2025级机电一体化技术2班' },
      { name: '2024级机电一体化技术1班' },
    ]
    const baseClass = '2025级机电一体化技术1班'
    const remark = '与机电合班'
    const keywords = parseRemarkKeywords(remark)
    const warnings: string[] = []
    const merged = await findMergedClassNames(keywords, baseClass, ambiguousClasses, warnings)

    // "机电" 会匹配 2025级机电一体化技术2班（唯一同年级候选，1班被排除）
    // 所以不应有 ambiguous
    assertTrue(!merged.includes(baseClass), `不应包含 baseClass`)
    assertTrue(merged.includes('2025级机电一体化技术2班'), `应匹配同年级 2班`)
    assertEqual(merged.includes('2024级机电一体化技术1班'), false, `不应跨年级匹配`)
  }

  // ── Test 8: 多个同年级匹配导致 ambiguous ──
  console.log('\nTest 8: 多个同年级匹配导致 ambiguous')
  {
    const ambiguousClasses = [
      { name: '2025级钢铁智能冶金技术1班（高本贯通）' },
      { name: '2025级钢铁智能冶金技术2班（高本贯通）' },
      { name: '2025级钢铁智能冶金技术3班（高本贯通）' },
      { name: '2024级钢铁智能冶金技术1班（高本贯通）' },
    ]
    const baseClass = '2025级钢铁智能冶金技术1班（高本贯通）'
    const remark = '与钢铁智能冶金合班'
    const keywords = parseRemarkKeywords(remark)
    const warnings: string[] = []
    const merged = await findMergedClassNames(keywords, baseClass, ambiguousClasses, warnings)

    // 过滤后剩下 2025级高本贯通：2班、3班（1班被排除）
    // "钢铁智能冶金" includes 匹配到 2班和3班 -> ambiguous -> 不绑定
    assertTrue(merged.length === 0, `ambiguous 时不应绑定任何班级 (merged.length=${merged.length})`)
    assertTrue(warnings.some((w) => w.includes('AMBIGUOUS')), `应有 AMBIGUOUS warning`)
    console.log(`    warnings: ${JSON.stringify(warnings)}`)
  }

  // ── Test 9: 无 track 班级不受 track 过滤影响 ──
  console.log('\nTest 9: 无 track 班级不受 track 过滤影响')
  {
    const classes = [
      { name: '2024级智能轧钢技术1班' },
      { name: '2024级智能轧钢技术2班' },
      { name: '2025级智能轧钢技术1班' },
    ]
    const baseClass = '2024级智能轧钢技术1班'
    const remark = '与智能轧钢合班'
    const keywords = parseRemarkKeywords(remark)
    const warnings: string[] = []
    const merged = await findMergedClassNames(keywords, baseClass, classes, warnings)

    assertTrue(merged.includes('2024级智能轧钢技术2班'), `同年级无 track 班级应匹配`)
    assertEqual(merged.includes('2025级智能轧钢技术1班'), false, `不应跨年级匹配`)
  }

  // ── Test 10: 显式年份在 keyword 中可跨年级 ──
  console.log('\nTest 10: 显式年份在 keyword 中可跨年级')
  {
    const baseClass = '2024级钢铁智能冶金技术1班（高本贯通）'
    const remark = '与2025级钢铁智能冶金技术2班合班'
    const keywords = parseRemarkKeywords(remark)
    const warnings: string[] = []
    const merged = await findMergedClassNames(keywords, baseClass, ALL_CLASSES, warnings)

    // 第一个 keyword "2025级钢铁智能冶金技术2班" 显式含 2025级，应能匹配
    assertTrue(merged.includes('2025级钢铁智能冶金技术2班（高本贯通）'), `显式 2025 级应匹配对应班级`)
  }

  // ── Test 11: 子序列匹配同样受过滤保护 ──
  console.log('\nTest 11: 子序列匹配同样受过滤保护')
  {
    const classes = [
      { name: '2024级森林草原防火技术1班' },
      { name: '2025级森林草原防火技术1班' },
      { name: '2024级森林草原资源保护1班' },
    ]
    const baseClass = '2024级森林草原防火技术1班'
    const remark = '与森防合班'
    const keywords = parseRemarkKeywords(remark)
    const warnings: string[] = []
    const merged = await findMergedClassNames(keywords, baseClass, classes, warnings)

    // "森防" 子序列匹配：过滤后只有 2024级班级
    // 2024级森林草原防火技术1班 是 baseClass（排除）
    // 2024级森林草原资源保护1班："森防" 子序列是否匹配？"森" 在 "森林草原资源保护" 中，"防" 不在
    // 所以 merged 应该为空
    assertTrue(merged.length === 0, `子序列匹配无其他同年级候选时应为空`)
    assertEqual(merged.includes('2025级森林草原防火技术1班'), false, `子序列匹配不应跨年级`)
  }

  // ── Summary ──
  console.log('\n=== Summary ===')
  console.log(`Passed: ${passCount}`)
  console.log(`Failed: ${failCount}`)

  if (failCount > 0) {
    process.exit(1)
  }
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
