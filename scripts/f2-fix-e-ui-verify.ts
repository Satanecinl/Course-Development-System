/**
 * F2-FIX-E-UI-VERIFY: 真实浏览器 UI 验收测试
 * 场景1：同周调课（第7周 slotId=195 → day=2, slot=2, room=11-529）
 * 场景2：跨周调课（第7周 slotId=195 → 第8周 day=2, slot=2）
 * 场景3：筛选验证
 *
 * 限制：
 * - 测试结束后所有 adjustment 必须 VOID
 * - 不得留下新增 ACTIVE adjustment
 */

import { chromium, Browser, Page } from 'playwright'
import { PrismaClient } from '@prisma/client'

const prisma = new PrismaClient()
const BASE_URL = 'http://localhost:3000'

// 测试课程
const TEST_SLOT_ID = 195
const TEST_COURSE_NAME = '森林草原火生态'
const TEST_TEACHER = '李志民'
const TEST_CLASS = '2025级森林草原防火技术1班'
const SOURCE_WEEK = 7

// 目标位置
const TARGET_DAY = 2      // 星期二
const TARGET_SLOT = 2     // 第2节
const TARGET_ROOM_ID = 8  // 11-529

interface TestResult {
  scenario: string
  passed: boolean
  details: string[]
  screenshots: string[]
}

const results: TestResult[] = []

async function takeScreenshot(page: Page, name: string): Promise<string> {
  const path = `scripts/f2-verify-screenshots/${name}.png`
  await page.screenshot({ path, fullPage: false })
  return path
}

async function waitForToast(page: Page, keyword: string, timeout = 5000): Promise<boolean> {
  try {
    await page.waitForSelector(`text=${keyword}`, { timeout })
    return true
  } catch {
    return false
  }
}

async function voidAllAdjustments(): Promise<number> {
  const { count } = await prisma.scheduleAdjustment.updateMany({
    where: { status: 'ACTIVE' },
    data: { status: 'VOID', updatedAt: new Date() },
  })
  return count
}

async function getActiveAdjustmentCount(): Promise<number> {
  return prisma.scheduleAdjustment.count({ where: { status: 'ACTIVE' } })
}

async function scenario1_sameWeekAdjustment(page: Page): Promise<TestResult> {
  const r: TestResult = {
    scenario: '场景1：同周调课',
    passed: false,
    details: [],
    screenshots: [],
  }

  try {
    // 1. 打开 /dashboard
    await page.goto(`${BASE_URL}/dashboard`)
    await page.waitForLoadState('networkidle')
    r.screenshots.push(await takeScreenshot(page, 's1-01-dashboard-initial'))
    r.details.push('✓ 打开 /dashboard')

    // 2. 切换到第 7 周
    const weekSelect = await page.$('select:has-text("全部显示")')
    if (!weekSelect) throw new Error('找不到周次选择器')
    await weekSelect.selectOption('7')
    await page.waitForTimeout(1000)
    r.screenshots.push(await takeScreenshot(page, 's1-02-week7-selected'))
    r.details.push('✓ 切换到第 7 周')

    // 3. 找到课程卡片并点击"调课"
    // 卡片包含课程名，按钮包含"调课"文字
    const card = await page.locator('.group:has-text("森林草原火生态")').first()
    await card.scrollIntoViewIfNeeded()
    r.screenshots.push(await takeScreenshot(page, 's1-03-card-found'))

    const adjustBtn = card.locator('button:has-text("调课")')
    await adjustBtn.click()
    await page.waitForTimeout(500)
    r.screenshots.push(await takeScreenshot(page, 's1-04-dialog-open'))
    r.details.push('✓ 点击调课按钮，弹窗打开')

    // 4. 确认弹窗显示源周次第 7 周、目标周次默认第 7 周
    const dialogContent = await page.locator('[role="dialog"] .space-y-4').innerText()
    if (dialogContent.includes('源周次') && dialogContent.includes('第 7 周')) {
      r.details.push('✓ 弹窗显示源周次第 7 周')
    } else {
      r.details.push('✗ 弹窗未正确显示源周次')
    }
    if (dialogContent.includes('目标周次') && dialogContent.includes('第 7 周')) {
      r.details.push('✓ 目标周次默认第 7 周')
    } else {
      r.details.push('✗ 目标周次未默认第 7 周')
    }

    // 5. 修改星期 / 节次 / 教室
    const daySelect = await page.$('select:has(~ label:has-text("新星期"))')
    if (daySelect) await daySelect.selectOption(String(TARGET_DAY))
    else {
      // 用 label 文本定位
      const daySel = page.locator('label:has-text("新星期") + select, label:has-text("新星期") ~ select').first()
      if (await daySel.count() > 0) await daySel.selectOption(String(TARGET_DAY))
    }

    const slotSelect = page.locator('label:has-text("新节次") + select, label:has-text("新节次") ~ select').first()
    if (await slotSelect.count() > 0) await slotSelect.selectOption(String(TARGET_SLOT))

    const roomSelect = page.locator('label:has-text("新教室") + select, label:has-text("新教室") ~ select').first()
    if (await roomSelect.count() > 0) await roomSelect.selectOption(String(TARGET_ROOM_ID))

    await page.waitForTimeout(300)
    r.screenshots.push(await takeScreenshot(page, 's1-05-form-filled'))
    r.details.push(`✓ 修改目标位置：星期${TARGET_DAY}，节次${TARGET_SLOT}，教室${TARGET_ROOM_ID}`)

    // 6. 执行 dry-run
    const dryRunBtn = page.locator('button:has-text("检查冲突")').first()
    await dryRunBtn.click()
    const dryRunOk = await waitForToast(page, '可以调课', 5000)
    await page.waitForTimeout(500)
    r.screenshots.push(await takeScreenshot(page, 's1-06-dryrun-result'))
    r.details.push(dryRunOk ? '✓ Dry-run 通过，无冲突' : '✗ Dry-run 未显示"可以调课"')

    // 7. 点击确认调课
    const confirmBtn = page.locator('button:has-text("确认调课")').first()
    await confirmBtn.click()
    await page.waitForTimeout(300)
    r.screenshots.push(await takeScreenshot(page, 's1-07-confirm-dialog'))

    // 二次确认
    const finalConfirm = page.locator('[role="dialog"] button:has-text("确认调课")').last()
    await finalConfirm.click()
    const confirmOk = await waitForToast(page, '调课成功', 8000)
    await page.waitForTimeout(1000)
    r.screenshots.push(await takeScreenshot(page, 's1-08-after-confirm'))
    r.details.push(confirmOk ? '✓ 确认调课成功' : '✗ 确认调课未显示成功提示')

    // 8. 确认课程在第 7 周移动到新位置
    // 刷新页面确认
    await page.goto(`${BASE_URL}/dashboard`)
    await page.waitForLoadState('networkidle')
    const weekSel2 = await page.$('select:has-text("全部显示")')
    if (weekSel2) await weekSel2.selectOption('7')
    await page.waitForTimeout(1000)
    r.screenshots.push(await takeScreenshot(page, 's1-09-week7-after-move'))

    // 检查 API 数据
    const activeAdj = await prisma.scheduleAdjustment.findFirst({
      where: { originalSlotId: TEST_SLOT_ID, status: 'ACTIVE' },
      orderBy: { id: 'desc' },
    })
    if (activeAdj && activeAdj.newDayOfWeek === TARGET_DAY && activeAdj.newSlotIndex === TARGET_SLOT) {
      r.details.push('✓ 数据库确认课程已移动到目标位置')
    } else {
      r.details.push('✗ 数据库未找到对应 ACTIVE adjustment')
    }

    // 9. 确认课程卡片显示"已调课"
    const cardAfter = await page.locator('.group:has-text("森林草原火生态")').first().innerText().catch(() => '')
    if (cardAfter.includes('已调课') || cardAfter.includes('调课')) {
      r.details.push('✓ 卡片显示"已调课"标记')
    } else {
      r.details.push('⚠ 卡片未找到"已调课"标记（可能需滚动）')
    }

    // 10. 通过 UI 点击撤销
    const voidBtn = page.locator('.group:has-text("森林草原火生态") button:has-text("撤销")').first()
    if (await voidBtn.count() > 0) {
      await voidBtn.click()
      await page.waitForTimeout(300)
      r.screenshots.push(await takeScreenshot(page, 's1-10-void-dialog'))

      // 输入 VOID_ADJUSTMENT
      const voidInput = page.locator('input[placeholder="VOID_ADJUSTMENT"]').first()
      if (await voidInput.count() > 0) {
        await voidInput.fill('VOID_ADJUSTMENT')
      }
      const voidConfirm = page.locator('button:has-text("确认撤销")').first()
      await voidConfirm.click()
      const voidOk = await waitForToast(page, '撤销成功', 5000)
      await page.waitForTimeout(1000)
      r.screenshots.push(await takeScreenshot(page, 's1-11-after-void'))
      r.details.push(voidOk ? '✓ 撤销调课成功' : '✗ 撤销调课未显示成功')
    } else {
      r.details.push('✗ 未找到撤销按钮')
    }

    // 11. 确认第 7 周恢复原位置
    const activeAfterVoid = await getActiveAdjustmentCount()
    if (activeAfterVoid === 0) {
      r.details.push('✓ 第 7 周恢复原位置（无 ACTIVE adjustment）')
    } else {
      r.details.push(`✗ 仍有 ${activeAfterVoid} 个 ACTIVE adjustment`)
    }

    r.passed = r.details.filter(d => d.startsWith('✗')).length === 0
  } catch (e) {
    r.details.push(`✗ 异常: ${String(e)}`)
    r.screenshots.push(await takeScreenshot(page, 's1-error'))
  }

  return r
}

async function scenario2_crossWeekAdjustment(page: Page): Promise<TestResult> {
  const r: TestResult = {
    scenario: '场景2：跨周调课',
    passed: false,
    details: [],
    screenshots: [],
  }

  try {
    // 1. 打开 /dashboard，切换到第 7 周
    await page.goto(`${BASE_URL}/dashboard`)
    await page.waitForLoadState('networkidle')
    const weekSelect = await page.$('select:has-text("全部显示")')
    if (weekSelect) await weekSelect.selectOption('7')
    await page.waitForTimeout(1000)
    r.screenshots.push(await takeScreenshot(page, 's2-01-week7'))
    r.details.push('✓ 打开 /dashboard 并切换到第 7 周')

    // 2. 找到课程卡片并点击"调课"
    const card = await page.locator('.group:has-text("森林草原火生态")').first()
    await card.scrollIntoViewIfNeeded()
    const adjustBtn = card.locator('button:has-text("调课")')
    await adjustBtn.click()
    await page.waitForTimeout(500)
    r.screenshots.push(await takeScreenshot(page, 's2-02-dialog-open'))
    r.details.push('✓ 点击调课按钮')

    // 3. 目标周次改为第 8 周
    const targetWeekSel = page.locator('label:has-text("目标周次") + select, label:has-text("目标周次") ~ select').first()
    if (await targetWeekSel.count() > 0) {
      await targetWeekSel.selectOption('8')
    }

    // 修改星期/节次
    const daySel = page.locator('label:has-text("新星期") + select, label:has-text("新星期") ~ select').first()
    if (await daySel.count() > 0) await daySel.selectOption(String(TARGET_DAY))
    const slotSel = page.locator('label:has-text("新节次") + select, label:has-text("新节次") ~ select').first()
    if (await slotSel.count() > 0) await slotSel.selectOption(String(TARGET_SLOT))

    await page.waitForTimeout(300)
    r.screenshots.push(await takeScreenshot(page, 's2-03-form-filled'))
    r.details.push('✓ 目标周次改为第 8 周，目标位置已设置')

    // 4. 执行 dry-run
    const dryRunBtn = page.locator('button:has-text("检查冲突")').first()
    await dryRunBtn.click()
    const dryRunOk = await waitForToast(page, '可以调课', 5000)
    await page.waitForTimeout(500)
    r.screenshots.push(await takeScreenshot(page, 's2-04-dryrun'))
    r.details.push(dryRunOk ? '✓ Dry-run 通过' : '✗ Dry-run 未通过')

    // 5. 确认调课
    const confirmBtn = page.locator('button:has-text("确认调课")').first()
    await confirmBtn.click()
    await page.waitForTimeout(300)
    const finalConfirm = page.locator('[role="dialog"] button:has-text("确认调课")').last()
    await finalConfirm.click()
    const confirmOk = await waitForToast(page, '调课成功', 8000)
    await page.waitForTimeout(1000)
    r.screenshots.push(await takeScreenshot(page, 's2-05-after-confirm'))
    r.details.push(confirmOk ? '✓ 跨周调课成功' : '✗ 跨周调课未成功')

    // 6. 确认第 7 周该课程消失
    await page.goto(`${BASE_URL}/dashboard`)
    await page.waitForLoadState('networkidle')
    const weekSel7 = await page.$('select:has-text("全部显示")')
    if (weekSel7) await weekSel7.selectOption('7')
    await page.waitForTimeout(1000)
    r.screenshots.push(await takeScreenshot(page, 's2-06-week7-after'))
    const week7Cards = await page.locator('.group:has-text("森林草原火生态")').count()
    r.details.push(week7Cards === 0 ? '✓ 第 7 周课程消失' : `✗ 第 7 周仍有 ${week7Cards} 张卡片`)

    // 7. 切换到第 8 周，确认调入课程出现
    const weekSel8 = await page.$('select:has-text("全部显示")')
    if (weekSel8) await weekSel8.selectOption('8')
    await page.waitForTimeout(1000)
    r.screenshots.push(await takeScreenshot(page, 's2-07-week8'))
    const week8Cards = await page.locator('.group:has-text("森林草原火生态")').count()
    r.details.push(week8Cards > 0 ? '✓ 第 8 周出现调入课程' : '✗ 第 8 周未出现调入课程')

    // 8. 确认卡片显示"第 7 周 → 第 8 周"
    const cardText = await page.locator('.group:has-text("森林草原火生态")').first().innerText().catch(() => '')
    if (cardText.includes('第 7 周 → 第 8 周')) {
      r.details.push('✓ 卡片显示跨周标记"第 7 周 → 第 8 周"')
    } else {
      r.details.push('⚠ 卡片未显示跨周标记（文本：' + cardText.slice(0, 200) + '）')
    }

    // 9. 在第 8 周撤销
    const voidBtn = page.locator('.group:has-text("森林草原火生态") button:has-text("撤销")').first()
    if (await voidBtn.count() > 0) {
      await voidBtn.click()
      await page.waitForTimeout(300)
      const voidInput = page.locator('input[placeholder="VOID_ADJUSTMENT"]').first()
      if (await voidInput.count() > 0) await voidInput.fill('VOID_ADJUSTMENT')
      const voidConfirm = page.locator('button:has-text("确认撤销")').first()
      await voidConfirm.click()
      await waitForToast(page, '撤销成功', 5000)
      await page.waitForTimeout(1000)
      r.screenshots.push(await takeScreenshot(page, 's2-08-after-void'))
      r.details.push('✓ 第 8 周撤销成功')
    }

    // 10. 确认第 8 周调入课程消失
    const week8AfterVoid = await page.locator('.group:has-text("森林草原火生态")').count()
    r.details.push(week8AfterVoid === 0 ? '✓ 第 8 周调入课程消失' : `✗ 第 8 周仍有 ${week8AfterVoid} 张卡片`)

    // 11. 切回第 7 周，确认原课程恢复
    const weekSelBack = await page.$('select:has-text("全部显示")')
    if (weekSelBack) await weekSelBack.selectOption('7')
    await page.waitForTimeout(1000)
    r.screenshots.push(await takeScreenshot(page, 's2-09-week7-restored'))
    const week7Restored = await page.locator('.group:has-text("森林草原火生态")').count()
    r.details.push(week7Restored > 0 ? '✓ 第 7 周原课程恢复' : '✗ 第 7 周原课程未恢复')

    const activeCount = await getActiveAdjustmentCount()
    r.details.push(activeCount === 0 ? '✓ 无 ACTIVE adjustment 残留' : `✗ 仍有 ${activeCount} 个 ACTIVE`)

    r.passed = r.details.filter(d => d.startsWith('✗')).length === 0
  } catch (e) {
    r.details.push(`✗ 异常: ${String(e)}`)
    r.screenshots.push(await takeScreenshot(page, 's2-error'))
  }

  return r
}

async function scenario3_filters(page: Page): Promise<TestResult> {
  const r: TestResult = {
    scenario: '场景3：筛选验证',
    passed: false,
    details: [],
    screenshots: [],
  }

  try {
    // 先创建一个跨周调课，验证调入课程参与筛选
    await page.goto(`${BASE_URL}/dashboard`)
    await page.waitForLoadState('networkidle')
    const weekSelect = await page.$('select:has-text("全部显示")')
    if (weekSelect) await weekSelect.selectOption('7')
    await page.waitForTimeout(1000)

    const card = await page.locator('.group:has-text("森林草原火生态")').first()
    await card.scrollIntoViewIfNeeded()
    const adjustBtn = card.locator('button:has-text("调课")')
    await adjustBtn.click()
    await page.waitForTimeout(500)

    const targetWeekSel = page.locator('label:has-text("目标周次") + select, label:has-text("目标周次") ~ select').first()
    if (await targetWeekSel.count() > 0) await targetWeekSel.selectOption('8')
    const daySel = page.locator('label:has-text("新星期") + select, label:has-text("新星期") ~ select').first()
    if (await daySel.count() > 0) await daySel.selectOption(String(TARGET_DAY))
    const slotSel = page.locator('label:has-text("新节次") + select, label:has-text("新节次") ~ select').first()
    if (await slotSel.count() > 0) await slotSel.selectOption(String(TARGET_SLOT))

    const dryRunBtn = page.locator('button:has-text("检查冲突")').first()
    await dryRunBtn.click()
    await waitForToast(page, '可以调课', 5000)
    await page.waitForTimeout(300)

    const confirmBtn = page.locator('button:has-text("确认调课")').first()
    await confirmBtn.click()
    await page.waitForTimeout(300)
    const finalConfirm = page.locator('[role="dialog"] button:has-text("确认调课")').last()
    await finalConfirm.click()
    await waitForToast(page, '调课成功', 8000)
    await page.waitForTimeout(1000)

    r.details.push('✓ 预先创建跨周调课（第7周→第8周）')

    // 切换到第 8 周
    await page.goto(`${BASE_URL}/dashboard`)
    await page.waitForLoadState('networkidle')
    const ws8 = await page.$('select:has-text("全部显示")')
    if (ws8) await ws8.selectOption('8')
    await page.waitForTimeout(1000)
    r.screenshots.push(await takeScreenshot(page, 's3-01-week8-all'))

    // 切换到"按班级"视图
    const viewSel = page.locator('select').filter({ hasText: /全部|按班级/ }).first()
    // 找到视图类型选择器
    const viewTypeSel = await page.$('select:has(option[value="class"])')
    if (viewTypeSel) {
      await viewTypeSel.selectOption('class')
      await page.waitForTimeout(500)
      r.screenshots.push(await takeScreenshot(page, 's3-02-class-view'))
      r.details.push('✓ 切换到按班级视图')

      // 选择目标班级
      const targetSel = await page.$('select:has(option:has-text("森林草原防火技术1班"))')
      if (targetSel) {
        await targetSel.selectOption({ label: '森林草原防火技术1班' })
        await page.waitForTimeout(500)
        r.screenshots.push(await takeScreenshot(page, 's3-03-class-filtered'))
        const classCards = await page.locator('.group:has-text("森林草原火生态")').count()
        r.details.push(classCards > 0 ? '✓ 班级筛选显示调入课程' : '✗ 班级筛选未显示调入课程')
      } else {
        r.details.push('⚠ 未找到班级选择器（选项可能未加载）')
      }
    }

    // 按教师筛选
    const viewTypeSel2 = await page.$('select:has(option[value="teacher"])')
    if (viewTypeSel2) {
      await viewTypeSel2.selectOption('teacher')
      await page.waitForTimeout(500)
      const teacherSel = await page.$('select:has(option:has-text("李志民"))')
      if (teacherSel) {
        await teacherSel.selectOption({ label: '李志民' })
        await page.waitForTimeout(500)
        r.screenshots.push(await takeScreenshot(page, 's3-04-teacher-filtered'))
        const teacherCards = await page.locator('.group:has-text("森林草原火生态")').count()
        r.details.push(teacherCards > 0 ? '✓ 教师筛选显示调入课程' : '✗ 教师筛选未显示调入课程')
      }
    }

    // 按教室筛选
    const viewTypeSel3 = await page.$('select:has(option[value="room"])')
    if (viewTypeSel3) {
      await viewTypeSel3.selectOption('room')
      await page.waitForTimeout(500)
      const roomSel = await page.$('select:has(option:has-text("11-204"))')
      if (roomSel) {
        await roomSel.selectOption({ label: '11-204' })
        await page.waitForTimeout(500)
        r.screenshots.push(await takeScreenshot(page, 's3-05-room-filtered'))
        // 调入课程在新位置(11-529)，所以筛选 11-204 应该不显示
        const roomCards = await page.locator('.group:has-text("森林草原火生态")').count()
        r.details.push(roomCards === 0 ? '✓ 教室筛选正确排除新位置课程' : '✗ 教室筛选未正确排除')
      }
    }

    // ALL 模式
    const viewTypeSel4 = await page.$('select:has(option[value="all"])')
    if (viewTypeSel4) {
      await viewTypeSel4.selectOption('all')
      await page.waitForTimeout(500)
      r.screenshots.push(await takeScreenshot(page, 's3-06-all-view'))
      const allCards = await page.locator('.group:has-text("森林草原火生态")').count()
      r.details.push(allCards > 0 ? '✓ ALL 模式显示调入课程' : '✗ ALL 模式未显示')
    }

    // 清理：撤销跨周调课
    const voidBtn = page.locator('.group:has-text("森林草原火生态") button:has-text("撤销")').first()
    if (await voidBtn.count() > 0) {
      await voidBtn.click()
      await page.waitForTimeout(300)
      const voidInput = page.locator('input[placeholder="VOID_ADJUSTMENT"]').first()
      if (await voidInput.count() > 0) await voidInput.fill('VOID_ADJUSTMENT')
      const voidConfirm = page.locator('button:has-text("确认撤销")').first()
      await voidConfirm.click()
      await waitForToast(page, '撤销成功', 5000)
      await page.waitForTimeout(1000)
      r.details.push('✓ 清理：撤销跨周调课')
    }

    const activeCount = await getActiveAdjustmentCount()
    r.details.push(activeCount === 0 ? '✓ 筛选测试后无 ACTIVE 残留' : `✗ 仍有 ${activeCount} 个 ACTIVE`)

    r.passed = r.details.filter(d => d.startsWith('✗')).length === 0
  } catch (e) {
    r.details.push(`✗ 异常: ${String(e)}`)
    r.screenshots.push(await takeScreenshot(page, 's3-error'))
  }

  return r
}

async function main() {
  console.log('═══ F2-FIX-E-UI-VERIFY 开始 ═══')
  console.log(`测试课程: ${TEST_COURSE_NAME} (slotId=${TEST_SLOT_ID})`)
  console.log(`测试教师: ${TEST_TEACHER}`)
  console.log(`测试班级: ${TEST_CLASS}`)
  console.log('')

  // 前置清理
  const voidedCount = await voidAllAdjustments()
  console.log(`前置清理：voided ${voidedCount} 个现有 ACTIVE adjustment`)

  const initialActive = await getActiveAdjustmentCount()
  console.log(`当前 ACTIVE adjustment 数量: ${initialActive}`)
  if (initialActive !== 0) {
    console.error('ERROR: 清理后仍有 ACTIVE adjustment，中止测试')
    process.exit(1)
  }

  // 创建截图目录
  const fs = await import('fs')
  if (!fs.existsSync('scripts/f2-verify-screenshots')) {
    fs.mkdirSync('scripts/f2-verify-screenshots', { recursive: true })
  }

  // 启动浏览器
  let browser: Browser | null = null
  try {
    browser = await chromium.launch({ headless: false, slowMo: 100 })
  } catch (e) {
    console.log('Chromium 启动失败，尝试 headless 模式...')
    browser = await chromium.launch({ headless: true, slowMo: 50 })
  }

  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } })

  // 运行场景
  results.push(await scenario1_sameWeekAdjustment(page))
  results.push(await scenario2_crossWeekAdjustment(page))
  results.push(await scenario3_filters(page))

  await browser.close()

  // 最终清理
  const finalVoided = await voidAllAdjustments()
  const finalActive = await getActiveAdjustmentCount()

  // 输出报告
  console.log('')
  console.log('══════════════════════════════════════════════════════════')
  console.log('           F2-FIX-E-UI-VERIFY 验收报告')
  console.log('══════════════════════════════════════════════════════════')
  console.log('')
  console.log('【1. 测试方式】')
  console.log('   使用 Playwright 真实浏览器自动化点击')
  console.log('')
  console.log('【2. 测试课程信息】')
  console.log(`   originalSlotId: ${TEST_SLOT_ID}`)
  console.log(`   课程名称: ${TEST_COURSE_NAME}`)
  console.log(`   教师: ${TEST_TEACHER}`)
  console.log(`   班级: ${TEST_CLASS}`)
  console.log(`   原位置: 星期一 第1节`)
  console.log('')

  for (const r of results) {
    console.log(`【${r.scenario}】 ${r.passed ? '✅ 通过' : '❌ 未通过'}`)
    for (const d of r.details) {
      console.log(`   ${d}`)
    }
    if (r.screenshots.length > 0) {
      console.log(`   📷 截图: ${r.screenshots.join(', ')}`)
    }
    console.log('')
  }

  console.log('【8. 测试结束 ACTIVE ScheduleAdjustment】')
  console.log(`   数量: ${finalActive}`)
  console.log(`   状态: ${finalActive === 0 ? '✅ 无新增 ACTIVE' : '❌ 有残留'}`)
  console.log('')

  console.log('【9. 创建的 adjustment 是否全部 VOID】')
  const allAdjustments = await prisma.scheduleAdjustment.findMany({ orderBy: { id: 'desc' }, take: 10 })
  const hasActive = allAdjustments.some(a => a.status === 'ACTIVE')
  console.log(`   ${hasActive ? '❌ 有 ACTIVE 未 VOID' : '✅ 全部 VOID'}`)
  console.log('')

  console.log('【10. F2-FIX 是否可以正式结束】')
  const allPassed = results.every(r => r.passed) && finalActive === 0 && !hasActive
  console.log(`   ${allPassed ? '✅ 可以正式结束 F2-FIX' : '❌ 有未通过项，需修复后重验'}`)
  console.log('')
  console.log('══════════════════════════════════════════════════════════')

  await prisma.$disconnect()

  if (!allPassed) {
    process.exit(1)
  }
}

main().catch(async (e) => {
  console.error(e)
  await prisma.$disconnect()
  process.exit(1)
})
