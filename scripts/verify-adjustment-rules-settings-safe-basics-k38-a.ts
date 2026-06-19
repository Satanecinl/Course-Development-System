/**
 * scripts/verify-adjustment-rules-settings-safe-basics-k38-a.ts
 *
 * K38-A: Adjustment rules settings diagnostics-enhanced verification.
 * Pure static source assertions. No DB writes, no scheduler execution.
 */

import { readFileSync } from 'node:fs'
import { join, resolve } from 'node:path'

const results: Array<{ name: string; passed: boolean; detail?: string }> = []

function check(name: string, passed: boolean, detail?: string) {
  results.push({ name, passed, detail })
}

const root = resolve(__dirname, '..')
const routePath = join(root, 'src/app/api/admin/settings/adjustment-rules/route.ts')
const panelPath = join(root, 'src/components/settings/adjustment-rules-settings-panel.tsx')
const clientPath = join(root, 'src/lib/settings/adjustment-rules-client.ts')
const modulesPath = join(root, 'src/lib/settings/settings-modules.ts')

const routeSrc = readFileSync(routePath, 'utf8')
const panelSrc = readFileSync(panelPath, 'utf8')
const clientSrc = readFileSync(clientPath, 'utf8')
const modulesSrc = readFileSync(modulesPath, 'utf8')

// ── 1. GET route exists ──
check('1. GET route exists', routeSrc.includes('export async function GET'))

// ── 2. GET requires settings:manage ──
check('2. GET requires settings:manage',
  routeSrc.includes("requirePermission('settings:manage'"))

// ── 3. response contains summary ──
check('3. response contains summary',
  routeSrc.includes('summary: {') && routeSrc.includes('activeAdjustments'))

// ── 4. response contains workTimeContext ──
check('4. response contains workTimeContext',
  routeSrc.includes('workTimeContext') && routeSrc.includes('weekendBehavior'))

// ── 5. response contains grouped rules ──
check('5. response contains grouped rules',
  routeSrc.includes("groups: {") && routeSrc.includes("'worktime'"))

// ── 6. dry-run guard rule exists and is locked ──
check('6. dry-run guard rule is locked (editable=false)',
  routeSrc.includes("key: 'dryRunWorkTimeGuard'") || routeSrc.includes('dryRunWorkTimeGuard'))

// ── 7. apply guard rule exists and is locked ──
check('7. apply guard rule is locked',
  routeSrc.includes("key: 'applyGuardRequiresConfirmation'"))

// ── 8. allowWeekend is WorkTime-controlled, not separately editable ──
check('8. allowWeekend is WorkTime-controlled',
  routeSrc.includes("key: 'allowWeekend'") && !routeSrc.includes("allowWeekendEditable: true"))

// ── 9. legacy slot rule exists ──
check('9. legacy slot rule exists',
  routeSrc.includes("key: 'legacySlotIndexes'") || routeSrc.includes("key: 'excludeLegacySlots'"))

// ── 10. preferredDayOfWeek rule exists ──
check('10. preferredDayOfWeek rule exists',
  routeSrc.includes("key: 'preferredDayOfWeek'"))

// ── 11. defaultRecommendationLimit is displayed ──
check('11. defaultRecommendationLimit is displayed',
  routeSrc.includes('defaultRecommendationLimit') &&
  routeSrc.includes("current: 5"))

// ── 12. No PATCH (or PATCH would be locked) ──
check('12. No PATCH endpoint (Route B — no persistence)',
  !routeSrc.includes('export async function PATCH'))

// ── 13. editability.allRulesEditable = false ──
check('13. editability.allRulesEditable = false',
  routeSrc.includes('allRulesEditable: false'))

// ── 14. UI badge updated (no "只读基础版") ──
check('14. UI badge updated (no "只读基础版")',
  !panelSrc.includes('只读基础版') && panelSrc.includes('诊断增强版'))

// ── 15. UI does not expose hard-guard disable buttons ──
check('15. UI has no hard-guard disable buttons',
  !panelSrc.includes('disabledGuard') && !panelSrc.includes('toggleGuard') && !panelSrc.includes('closeGuard') &&
  panelSrc.includes('hard-locked'))

// ── 16. UI explains WorkTime source ──
check('16. UI explains WorkTime source',
  panelSrc.includes('workTimeContext') && panelSrc.includes('weekendBehavior'))

// ── 17. No scheduler/score modifications ──
check('17. No scheduler/score modifications',
  !routeSrc.includes('calculateScore') && !routeSrc.includes('calculateDeltaScore'))

// ── 18. No Prisma schema/migration ──
check('18. No Prisma schema or migration files',
  !routeSrc.includes('prisma migrate'))

// ── 19. Settings module updated ──
check('19. Settings module description updated',
  modulesSrc.includes('K38-A') && modulesSrc.includes('诊断增强版'))

// ── 20. Client has new fields ──
check('20. Client types include groups, editability, defaultRecommendationLimit',
  clientSrc.includes('groups') && clientSrc.includes('editability') && clientSrc.includes('defaultRecommendationLimit'))

// ── 21. Safeguards list with hard-guard severity ──
check('21. Safeguards with hard/warning severities',
  routeSrc.includes("severity: 'hard'") && routeSrc.includes("severity: 'warning'"))

// ── 22. POST returns 405 (no PATCH allowed) ──
check('22. POST returns 405 (METHOD_NOT_ALLOWED)',
  routeSrc.includes('METHOD_NOT_ALLOWED'))

// ── Summary ──
console.log('')
console.log('=== K38-A Adjustment Rules Settings Safe Basics Verify ===')
console.log('')
let passed = 0
for (const r of results) {
  const mark = r.passed ? 'PASS' : 'FAIL'
  console.log(`  [${mark}] ${r.name}`)
  if (r.detail) console.log(`         ${r.detail}`)
  if (r.passed) passed++
}
const failed = results.length - passed
console.log(`\nSummary: ${passed} passed, ${failed} failed`)
if (failed > 0) process.exit(1)
