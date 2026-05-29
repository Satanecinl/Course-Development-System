/**
 * G0-FIX-B: Dashboard 浏览器验收
 *
 * 验证：
 * 1. 全部显示模式下无假课程卡片
 * 2. 汽车制造2班无同一格重复卡片（通过UI筛选）
 * 3. 汽车制造1班无同一格重复卡片（通过UI筛选）
 * 4. 第 7/8 周视图正常
 * 5. 班级/教师/教室筛选有效
 */

import { chromium, Browser, Page } from 'playwright'

const BASE_URL = 'http://localhost:3000'

const ILLEGAL_COURSES = ['周六', '周日', '3、4', '5、6', '7、8', '9、10', '9.10']

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

async function waitForGrid(page: Page) {
  await page.waitForSelector('.grid', { timeout: 10000 })
  await page.waitForTimeout(1500)
}

/** 获取课程卡片文本（排除表头） */
async function getCourseCardTexts(page: Page): Promise<string[]> {
  const texts = await page.locator('.font-semibold.text-gray-900').allInnerTexts()
  return [...new Set(texts.map((t) => t.trim()).filter(Boolean))]
}

/** 检查每个 cell 中是否有重复课程名 */
async function checkDuplicateCardsInCells(page: Page): Promise<{ cell: string; duplicates: string[] }[]> {
  const duplicates: { cell: string; duplicates: string[] }[] = []
  const cells = await page.locator('div.min-h-\\[100px\\]').all()

  for (let i = 0; i < cells.length; i++) {
    const cell = cells[i]
    const courseNames = await cell.locator('.font-semibold.text-gray-900').allInnerTexts()
    const nameCount = new Map<string, number>()
    for (const name of courseNames) {
      const trimmed = name.trim()
      if (trimmed) nameCount.set(trimmed, (nameCount.get(trimmed) ?? 0) + 1)
    }
    const cellDups = [...nameCount.entries()].filter(([_, cnt]) => cnt > 1).map(([name]) => name)
    if (cellDups.length > 0) {
      duplicates.push({ cell: `cell-${i}`, duplicates: cellDups })
    }
  }

  return duplicates
}

/** 通过UI选择筛选条件
 * Dashboard 有 3 个 select:
 *  1. 周次选择 (value: 'ALL' | '1' | '2' | ...)
 *  2. 视图类型 (value: 'all' | 'class' | 'teacher' | 'room')
 *  3. 目标对象 (当 viewType !== 'all' 时显示)
 */
async function selectFilter(page: Page, type: 'class' | 'teacher' | 'room', value: string) {
  const selects = page.locator('select')

  // 第2个 select 是视图类型
  const viewSelect = selects.nth(1)
  await viewSelect.selectOption(type)
  await page.waitForTimeout(800)

  // 第3个 select 是目标对象
  const targetSelect = selects.nth(2)
  await targetSelect.waitFor({ state: 'visible', timeout: 5000 })
  await targetSelect.selectOption({ label: value })
  await page.waitForTimeout(1500)
}

async function selectWeek(page: Page, week: number | 'ALL') {
  const weekSelect = page.locator('select').first()
  await weekSelect.selectOption(week === 'ALL' ? 'ALL' : String(week))
  await page.waitForTimeout(1500)
}

async function main() {
  console.log('═══════════════════════════════════════════════════════════════')
  console.log('              G0-FIX-B Dashboard 浏览器验收')
  console.log('═══════════════════════════════════════════════════════════════')

  let browser: Browser | null = null

  try {
    browser = await chromium.launch({ headless: true })
    const page = await browser.newPage()

    // ── 1. 全部显示模式 ──
    console.log('\n--- 1. 全部显示模式 ---')
    await page.goto(`${BASE_URL}/dashboard`)
    await waitForGrid(page)

    const allCards = await getCourseCardTexts(page)
    const illegalFound = allCards.filter((c) => ILLEGAL_COURSES.includes(c))
    record(
      '无假课程卡片',
      illegalFound.length === 0,
      illegalFound.length === 0
        ? `检查 ${allCards.length} 个课程卡片，无非法课程`
        : `发现非法课程: [${illegalFound.join(', ')}]`
    )

    // ── 2. 汽车制造2班筛选 ──
    console.log('\n--- 2. 汽车制造2班筛选 ---')
    await page.goto(`${BASE_URL}/dashboard`)
    await waitForGrid(page)
    await selectFilter(page, 'class', '2024级汽车制造与试验技术2班')
    await waitForGrid(page)

    const car2Cards = await page.locator('.font-semibold.text-gray-900').allInnerTexts()
    const car2Unique = [...new Set(car2Cards.map((t) => t.trim()).filter(Boolean))]
    const car2Targets = car2Unique.filter((c) =>
      /底盘电控|智能网联|新能源|汽车营销|企业学徒|汽车保险|智能网联汽车概论/.test(c)
    )
    record(
      '汽车制造2班目标课程可见',
      car2Targets.length >= 3,
      `找到 ${car2Targets.length} 个目标课程: [${car2Targets.join(', ')}]`
    )

    const car2Dups = await checkDuplicateCardsInCells(page)
    record(
      '汽车制造2班无同格重复卡片',
      car2Dups.length === 0,
      car2Dups.length === 0
        ? '无同一格子内的重复课程卡片'
        : `发现 ${car2Dups.length} 个格子有重复: ${car2Dups.map((d) => d.duplicates.join(',')).join('; ')}`
    )

    // ── 3. 汽车制造1班筛选 ──
    console.log('\n--- 3. 汽车制造1班筛选 ---')
    await page.goto(`${BASE_URL}/dashboard`)
    await waitForGrid(page)
    await selectFilter(page, 'class', '2024级汽车制造与试验技术1班')
    await waitForGrid(page)

    const car1Cards = await page.locator('.font-semibold.text-gray-900').allInnerTexts()
    const car1Unique = [...new Set(car1Cards.map((t) => t.trim()).filter(Boolean))]
    const car1Targets = car1Unique.filter((c) =>
      /底盘电控|智能网联|新能源|汽车营销|企业学徒|汽车保险|智能网联汽车概论/.test(c)
    )
    record(
      '汽车制造1班目标课程可见',
      car1Targets.length >= 3,
      `找到 ${car1Targets.length} 个目标课程: [${car1Targets.join(', ')}]`
    )

    const car1Dups = await checkDuplicateCardsInCells(page)
    record(
      '汽车制造1班无同格重复卡片',
      car1Dups.length === 0,
      car1Dups.length === 0
        ? '无同一格子内的重复课程卡片'
        : `发现 ${car1Dups.length} 个格子有重复: ${car1Dups.map((d) => d.duplicates.join(',')).join('; ')}`
    )

    // ── 4. 第 7 周视图 ──
    console.log('\n--- 4. 第 7 周视图 ---')
    await page.goto(`${BASE_URL}/dashboard`)
    await waitForGrid(page)
    await selectWeek(page, 7)
    await waitForGrid(page)

    const week7Cards = await getCourseCardTexts(page)
    const week7Illegal = week7Cards.filter((c) => ILLEGAL_COURSES.includes(c))
    record(
      '第7周无假课程',
      week7Illegal.length === 0,
      week7Illegal.length === 0
        ? `检查 ${week7Cards.length} 个课程卡片，无非法课程`
        : `发现非法: [${week7Illegal.join(', ')}]`
    )

    // ── 5. 第 8 周视图 ──
    console.log('\n--- 5. 第 8 周视图 ---')
    await page.goto(`${BASE_URL}/dashboard`)
    await waitForGrid(page)
    await selectWeek(page, 8)
    await waitForGrid(page)

    const week8Cards = await getCourseCardTexts(page)
    record(
      '第8周视图正常',
      week8Cards.length > 0,
      `找到 ${week8Cards.length} 个课程卡片`
    )

    // ── 6. 教师筛选 ──
    console.log('\n--- 6. 教师筛选 ---')
    await page.goto(`${BASE_URL}/dashboard`)
    await waitForGrid(page)
    await selectFilter(page, 'teacher', '徐燕')
    await waitForGrid(page)

    const teacherCards = await getCourseCardTexts(page)
    record(
      '教师筛选有效',
      teacherCards.length > 0,
      `徐燕: ${teacherCards.length} 个课程卡片`
    )

    // ── 7. 教室筛选 ──
    console.log('\n--- 7. 教室筛选 ---')
    await page.goto(`${BASE_URL}/dashboard`)
    await waitForGrid(page)
    await selectFilter(page, 'room', '11-239')
    await waitForGrid(page)

    const roomCards = await getCourseCardTexts(page)
    record(
      '教室筛选有效',
      roomCards.length > 0,
      `11-239: ${roomCards.length} 个课程卡片`
    )

    // ── 总结 ──
    console.log('\n═══════════════════════════════════════════════════════════════')
    const passed = results.filter((r) => r.passed).length
    const failed = results.filter((r) => !r.passed).length
    console.log(`  结果: ${passed}/${results.length} 通过, ${failed} 失败`)
    if (failed > 0) {
      console.log('  失败项:')
      for (const r of results.filter((r) => !r.passed)) {
        console.log(`    ❌ ${r.name}: ${r.details}`)
      }
    }
    console.log('═══════════════════════════════════════════════════════════════')

    await browser.close()
    if (failed > 0) process.exit(1)
  } catch (e: any) {
    console.error('浏览器测试失败:', e.message)
    if (browser) await browser.close()
    process.exit(1)
  }
}

main()
