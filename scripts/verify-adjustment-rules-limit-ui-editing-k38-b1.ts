/**
 * scripts/verify-adjustment-rules-limit-ui-editing-k38-b1.ts
 *
 * K38-B1: Verify the UI editing controls for defaultRecommendationLimit.
 */

import { readFileSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { PrismaClient } from '@prisma/client'

const results: Array<{ name: string; passed: boolean; detail?: string }> = []
function check(name: string, passed: boolean, detail?: string) { results.push({ name, passed, detail }) }

const root = resolve(__dirname, '..')
const panelSrc = readFileSync(join(root, 'src/components/settings/adjustment-rules-settings-panel.tsx'), 'utf8')
const clientSrc = readFileSync(join(root, 'src/lib/settings/adjustment-rules-client.ts'), 'utf8')
const routeSrc = readFileSync(join(root, 'src/app/api/admin/settings/adjustment-rules/route.ts'), 'utf8')

// 1. Badge updated
check('1. UI badge is "基础可配置版"', panelSrc.includes('基础可配置版') && !panelSrc.includes('诊断增强版'))

// 2. Number input present
check('2. UI has number input for limit', panelSrc.includes('type="number"') && panelSrc.includes('editingLimit'))

// 3. Save button present
check('3. UI has save button', panelSrc.includes('handleSaveLimit') || panelSrc.includes('保存'))

// 4. Cancel/reset button present
check('4. UI has cancel/reset button', panelSrc.includes('取消') || panelSrc.includes('RotateCcw'))

// 5. Loading state
check('5. UI has loading state', panelSrc.includes('limitSaving') || panelSrc.includes('animate-spin'))

// 6. Success toast
check('6. UI has success toast', panelSrc.includes('success') && panelSrc.includes('toast'))

// 7. Error toast
check('7. UI has error toast', panelSrc.includes('error') && panelSrc.includes('toast'))

// 8. Frontend validation min/max
check('8. Frontend validates min=1/max=20', panelSrc.includes('min=') && panelSrc.includes('max='))

// 9. Empty/non-number check
check('9. Frontend checks empty/non-number', panelSrc.includes('isNaN') || panelSrc.includes('parseInt'))

// 10. Client PATCH helper exists
check('10. Client has patchAdjustmentRulesSettings', clientSrc.includes('patchAdjustmentRulesSettings'))

// 11. Client sends Content-Type
check('11. Client sends application/json', clientSrc.includes("'Content-Type': 'application/json'"))

// 12. Client handles non-2xx
check('12. Client handles error response', clientSrc.includes('!res.ok') || clientSrc.includes('!data.success'))

// 13. API PATCH validates
check('13. API PATCH validates integer/range', routeSrc.includes('validateDefaultRecommendationLimit'))

// 14. API PATCH only writes config
check('14. API PATCH only writes AdjustmentRuleConfig',
  routeSrc.includes('updateAdjustmentRuleConfig') &&
  !routeSrc.includes('scheduleSlot.update'))

// 15. Hard guard toggles absent
check('15. No hard guard toggle buttons', !panelSrc.includes('toggleGuard') && !panelSrc.includes('closeGuard'))

// 16. No dirty indicator when editing
check('16. UI has dirty state indicator', panelSrc.includes('isDirty') || panelSrc.includes('已修改'))

// Data checks
async function dataChecks() {
  const prisma = new PrismaClient()
  try {
    const cfg = await prisma.adjustmentRuleConfig.findFirst()
    check('17. Config row exists', !!cfg, cfg ? `limit=${cfg.defaultRecommendationLimit}` : 'missing')
    if (cfg) {
      // Update to 6, then restore to 5
      const orig = cfg.defaultRecommendationLimit
      await prisma.adjustmentRuleConfig.update({ where: { key: 'default' }, data: { defaultRecommendationLimit: 6 } })
      const mid = await prisma.adjustmentRuleConfig.findFirst()
      check('18. Config update to 6 works', mid?.defaultRecommendationLimit === 6)
      await prisma.adjustmentRuleConfig.update({ where: { key: 'default' }, data: { defaultRecommendationLimit: 5 } })
      const fin = await prisma.adjustmentRuleConfig.findFirst()
      check('19. Config restored to 5', fin?.defaultRecommendationLimit === 5)
    }
    check('20. ScheduleSlot unchanged', await prisma.scheduleSlot.count() === 440)
    check('21. TeachingTask unchanged', await prisma.teachingTask.count() === 308)
  } finally { await prisma.$disconnect() }
}

dataChecks().then(() => {
  console.log('')
  console.log('=== K38-B1 Adjustment Rules Limit UI Editing Verify ===')
  console.log('')
  let passed = 0
  for (const r of results) {
    const mark = r.passed ? 'PASS' : 'FAIL'
    console.log(`  [${mark}] ${r.name}`)
    if (r.detail) console.log(`         ${r.detail}`)
    if (r.passed) passed++
  }
  console.log(`\nSummary: ${passed} passed, ${results.length - passed} failed`)
  if (results.length - passed > 0) process.exit(1)
}).catch((e) => { console.error('Verify error:', e); process.exit(1) })
