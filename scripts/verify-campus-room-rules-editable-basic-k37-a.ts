/**
 * scripts/verify-campus-room-rules-editable-basic-k37-a.ts
 *
 * K37-A: Campus room rules diagnostics enhancement verification.
 * Pure static source assertions. No DB writes, no scheduler execution.
 */

import { readFileSync } from 'node:fs'
import { join, resolve } from 'node:path'

const results: Array<{ name: string; passed: boolean; detail?: string }> = []

function check(name: string, passed: boolean, detail?: string) {
  results.push({ name, passed, detail })
}

const root = resolve(__dirname, '..')
const routePath = join(root, 'src/app/api/admin/settings/campus-room-rules/route.ts')
const panelPath = join(root, 'src/components/settings/campus-room-rules-settings-panel.tsx')
const clientPath = join(root, 'src/lib/settings/campus-room-rules-client.ts')
const modulesPath = join(root, 'src/lib/settings/settings-modules.ts')
const scorePath = join(root, 'src/lib/scheduler/score.ts')

const routeSrc = readFileSync(routePath, 'utf8')
const panelSrc = readFileSync(panelPath, 'utf8')
const clientSrc = readFileSync(clientPath, 'utf8')
const modulesSrc = readFileSync(modulesPath, 'utf8')
const scoreSrc = readFileSync(scorePath, 'utf8')

// ── 1. API route exists ──
check('1. API route file exists', routeSrc.includes('campus-room-rules'))

// ── 2. GET requires settings:manage ──
check('2. GET requires settings:manage', routeSrc.includes("requirePermission('settings:manage'"))

// ── 3. No PATCH/PUT — Route B (not editable) ──
check('3. No PATCH/PUT endpoint (Route B)',
  !routeSrc.includes('export async function PATCH') && !routeSrc.includes('export async function PUT'))

// ── 4. HC6 hard rule has no close button ──
check('4. HC6 hard rule no close/disable button',
  !panelSrc.includes('关闭 HC6') && !panelSrc.includes('disableHC6') && !panelSrc.includes('toggleHc6'))

// ── 5. UI updated — no outdated "只读基础版" badge ──
check('5. UI badge updated (no "只读基础版")',
  !panelSrc.includes('只读基础版'))

// ── 6. Room table has all rooms (not just linxiao) ──
check('6. All rooms displayed with filter',
  panelSrc.includes("roomFilter") && panelSrc.includes("filteredRooms"))

// ── 7. Linxiao status shown per room ──
check('7. Linxiao status per room',
  panelSrc.includes('r.isLinxiao') && panelSrc.includes('r.linxiaoSource'))

// ── 8. Violations cover HC5 and HC6 ──
check('8. Violations cover HC5',
  panelSrc.includes("v.type === 'HC5_ROOM_UNAVAILABLE'"))
check('8b. Violations cover HC6',
  panelSrc.includes("v.type === 'HC6_NON_AUTOMOTIVE_FORBID_LINXIAO'"))

// ── 9. Secondary rooms included in violations ──
check('9. Secondary rooms included (additionalRooms)',
  routeSrc.includes('additionalRooms: { some:') && routeSrc.includes('additionalRooms'))

// ── 10. Automotive keywords displayed ──
check('10. Automotive keywords in response',
  routeSrc.includes('automotiveKeywords: AUTOMOTIVE_KEYWORDS'))
check('10b. Automotive keywords in UI',
  panelSrc.includes('automotiveKeywords'))

// ── 11. Detection method displayed ──
check('11. Detection method in response',
  routeSrc.includes('editability'))
check('11b. Detection method in UI',
  panelSrc.includes('editability.detectionMethod'))

// ── 12. Classification detail exposed ──
check('12. Automotive classification in response',
  routeSrc.includes('automotiveClassification'))
check('12b. Classification in UI',
  panelSrc.includes('automotiveClassification.classifications'))

// ── 13. Not-editable notice present ──
check('13. Not-editable notice in UI',
  panelSrc.includes('当前不支持编辑林校教室标记'))

// ── 14. K37-B mention (future stage) ──
check('14. K37-B future stage mentioned',
  panelSrc.includes('K37-B'))

// ── 15. No scheduler score modification ──
check('15. Route does not modify score.ts',
  !routeSrc.includes('calculateScore') && !routeSrc.includes('calculateDeltaScore'))

// ── 16. No ScheduleSlot write ──
check('16. Route does not write ScheduleSlot',
  !routeSrc.includes('scheduleSlot.create') && !routeSrc.includes('scheduleSlot.update') &&
  !routeSrc.includes('scheduleSlot.delete') && !routeSrc.includes('scheduleSlot.upsert'))

// ── 17. No TeachingTask write ──
check('17. Route does not write TeachingTask',
  !routeSrc.includes('teachingTask.create') && !routeSrc.includes('teachingTask.update'))

// ── 18. Settings module updated ──
check('18. Settings module description updated',
  modulesSrc.includes('K37-A') && modulesSrc.includes('诊断增强版'))

// ── 19. AUTOMOTIVE_KEYWORDS imported ──
check('19. AUTOMOTIVE_KEYWORDS imported in route',
  routeSrc.includes("import { classifySpecialty, AUTOMOTIVE_KEYWORDS } from '@/lib/scheduler/score'"))

// ── 20. score.ts AUTOMOTIVE_KEYWORDS still exported ──
check('20. AUTOMOTIVE_KEYWORDS still exported from score.ts',
  scoreSrc.includes('export const AUTOMOTIVE_KEYWORDS'))

// ── Summary ──
console.log('')
console.log('=== K37-A Campus Room Rules Editable Basic Verify ===')
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
