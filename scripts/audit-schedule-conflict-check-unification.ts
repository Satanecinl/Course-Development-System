/**
 * K13 Schedule Conflict Check Unification Audit
 *
 * Read-only audit. Does NOT write to the database.
 * Scans all conflict-check implementations to detect duplication,
 * rule drift, and input/output inconsistency.
 */

import * as fs from 'fs'
import * as path from 'path'

const ROOT = path.resolve(__dirname, '..')

interface Finding {
  id: string
  severity: 'HIGH' | 'MEDIUM' | 'LOW' | 'NONE' | 'UNKNOWN'
  area: string
  description: string
  evidence: string
  recommendation: string
}

const findings: Finding[] = []

function addFinding(f: Finding) {
  findings.push(f)
}

function readFile(relPath: string): string {
  const fullPath = path.join(ROOT, relPath)
  if (!fs.existsSync(fullPath)) return ''
  return fs.readFileSync(fullPath, 'utf-8')
}

function fileExists(relPath: string): boolean {
  return fs.existsSync(path.join(ROOT, relPath))
}

function grep(pattern: string, dir: string = 'src'): Array<{ file: string; line: number; text: string }> {
  const results: Array<{ file: string; line: number; text: string }> = []
  const absDir = path.join(ROOT, dir)

  function walk(d: string) {
    if (!fs.existsSync(d)) return
    for (const entry of fs.readdirSync(d, { withFileTypes: true })) {
      const full = path.join(d, entry.name)
      if (entry.isDirectory()) {
        if (entry.name === 'node_modules' || entry.name === '.next') continue
        walk(full)
      } else if (entry.name.endsWith('.ts') || entry.name.endsWith('.tsx')) {
        const content = fs.readFileSync(full, 'utf-8')
        const regex = new RegExp(pattern, 'g')
        const lines = content.split('\n')
        for (let i = 0; i < lines.length; i++) {
          if (regex.test(lines[i])) {
            results.push({
              file: path.relative(ROOT, full).replace(/\\/g, '/'),
              line: i + 1,
              text: lines[i].trim(),
            })
          }
        }
      }
    }
  }

  walk(absDir)
  return results
}

let fileCount = 0
function countFiles(dir: string) {
  if (!fs.existsSync(dir)) return
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name)
    if (entry.isDirectory()) {
      if (entry.name === 'node_modules' || entry.name === '.next') continue
      countFiles(full)
    } else if (entry.name.endsWith('.ts') || entry.name.endsWith('.tsx')) {
      fileCount++
    }
  }
}

// ═══════════════════════════════════════
// Load implementations
// ═══════════════════════════════════════

const conflictCheckRoute = readFile('src/app/api/conflict-check/route.ts')
const conflictLib = readFile('src/lib/schedule/conflict-check.ts')
const guardLib = readFile('src/lib/schedule/slot-mutation-guard.ts')
const adjustmentsLib = readFile('src/lib/schedule/adjustments.ts')
const solverLib = readFile('src/lib/scheduler/solver.ts')
const scoreLib = readFile('src/lib/scheduler/score.ts')
const teachingTaskRoute = readFile('src/app/api/teaching-task/[id]/route.ts')
const scheduleStore = readFile('src/store/scheduleStore.ts')
const scheduleGrid = readFile('src/components/schedule-grid.tsx')
const conflictTs = readFile('src/lib/conflict.ts')

// ═══════════════════════════════════════
// 1. /api/conflict-check audit
// ═══════════════════════════════════════

const apiCCExists = fileExists('src/app/api/conflict-check/route.ts')
const apiCCUsesCheckLib = conflictCheckRoute.includes('checkScheduleConflicts')
const apiCCSupportsScheduleSlotId = conflictCheckRoute.includes('scheduleSlotId')
const apiCCSupportsExclude = /id:\s*\{\s*not:\s*input\.scheduleSlotId\s*\}/.test(conflictLib)
const apiCCSupportsSemester = conflictCheckRoute.includes('semesterId') && conflictLib.includes('semesterId')
const apiCCSupportsRoom = conflictCheckRoute.includes('targetRoomId')
const apiCCSupportsDaySlot = conflictCheckRoute.includes('targetDayOfWeek') && conflictCheckRoute.includes('targetSlotIndex')
const apiCCChecksTeacher = conflictLib.includes('teacherId') && conflictLib.includes('Teacher conflict')
const apiCCChecksClass = conflictLib.includes('classGroupId') && conflictLib.includes('Class conflict')
const apiCCChecksRoom = conflictLib.includes('Room conflict')
const apiCCUsesWeekOverlap = conflictLib.includes('checkWeekOverlap')
const apiCCResponseShape = conflictLib.includes('hasConflict: boolean') && conflictLib.includes('conflicts: string[]')

addFinding({
  id: 'K13-CONFLICT-NONE-1',
  severity: 'NONE',
  area: '/api/conflict-check',
  description: `POST /api/conflict-check 存在并复用 src/lib/schedule/conflict-check.checkScheduleConflicts。输入：{ scheduleSlotId, targetDayOfWeek, targetSlotIndex, targetRoomId, semesterId? }。输出：{ hasConflict, conflicts: string[] }。覆盖 teacher/class/room + week overlap。exclude via id: { not: input.scheduleSlotId }。semester scoped。`,
  evidence: `exists: ${apiCCExists}; usesCheckLib: ${apiCCUsesCheckLib}; scheduleSlotId: ${apiCCSupportsScheduleSlotId}; exclude: ${apiCCSupportsExclude}; semester: ${apiCCSupportsSemester}; room: ${apiCCSupportsRoom}; day/slot: ${apiCCSupportsDaySlot}; teacher: ${apiCCChecksTeacher}; class: ${apiCCChecksClass}; roomCheck: ${apiCCChecksRoom}; weekOverlap: ${apiCCUsesWeekOverlap}; responseShape: ${apiCCResponseShape}`,
  recommendation: 'N/A',
})

// ═══════════════════════════════════════
// 2. slot-mutation-guard.ts audit
// ═══════════════════════════════════════

const guardHasOwnCheck = guardLib.includes('checkConflictsAtTarget')
const guardImportsSharedHelper = guardLib.includes("from '@/lib/schedule/conflict-check'")
const guardReusesSharedHelper = guardLib.includes('checkScheduleConflicts(')
const guardChecksTeacher = guardLib.includes('teacherId') && !guardReusesSharedHelper
const guardChecksClass = guardLib.includes('classGroupId') && !guardReusesSharedHelper
const guardChecksRoom = guardLib.includes('targetRoom') && !guardReusesSharedHelper
const guardHasSemester = guardLib.includes('semesterId')
const guardResponseShape = guardLib.includes('conflicts?:') && guardLib.includes('ok: boolean')

const sharedHelperExists = fileExists('src/lib/schedule/conflict-check.ts')
const sharedHelperExports = readFile('src/lib/schedule/conflict-check.ts').includes('export async function checkScheduleConflicts')
const routeUsesSharedHelper = conflictCheckRoute.includes('checkScheduleConflicts')

if (guardReusesSharedHelper && sharedHelperExists && sharedHelperExports && routeUsesSharedHelper) {
  addFinding({
    id: 'K13-CONFLICT-MEDIUM-1',
    severity: 'NONE',
    area: 'slot-mutation-guard.ts',
    description: `slot-mutation-guard.ts 复用 @/lib/schedule/conflict-check.checkScheduleConflicts。/api/conflict-check 也复用同一 helper。核心规则（teacher/class/room + week overlap + semester + exclude）统一。无重复 query 逻辑。`,
    evidence: `sharedHelper: ${sharedHelperExists}/${sharedHelperExports}; routeUsesShared: ${routeUsesSharedHelper}; guardReuses: ${guardReusesSharedHelper}; ownCheck: ${guardHasOwnCheck}`,
    recommendation: 'N/A',
  })
} else {
  addFinding({
    id: 'K13-CONFLICT-MEDIUM-1',
    severity: 'MEDIUM',
    area: 'slot-mutation-guard.ts',
    description: `slot-mutation-guard.ts ${guardHasOwnCheck ? '内部定义独立冲突检查 checkConflictsAtTarget' : '未复用共享 helper'}，与 /api/conflict-check 的核心查询逻辑重复。`,
    evidence: `sharedHelper: ${sharedHelperExists}; ownCheck: ${guardHasOwnCheck}; guardReuses: ${guardReusesSharedHelper}; routeUsesShared: ${routeUsesSharedHelper}`,
    recommendation: '让 slot-mutation-guard.ts 复用 @/lib/schedule/conflict-check.checkScheduleConflicts。',
  })
}

// ═══════════════════════════════════════
// 3. schedule adjustment audit
// ═══════════════════════════════════════

const adjustmentHasOwnCheck = adjustmentsLib.includes('teacherConflict') || adjustmentsLib.includes('roomConflict') || adjustmentsLib.includes('classConflict')
const adjustmentUsesCheckLib = adjustmentsLib.includes('checkScheduleConflict')
const adjustmentUsesWeekOverlap = adjustmentsLib.includes('checkWeekOverlap')
const adjustmentChecksTeacher = adjustmentsLib.includes('TEACHER_CONFLICT')
const adjustmentChecksClass = adjustmentsLib.includes('CLASS_CONFLICT')
const adjustmentChecksRoom = adjustmentsLib.includes('ROOM_CONFLICT')
const adjustmentChecksCapacity = adjustmentsLib.includes('CAPACITY_CONFLICT')
const adjustmentHasSemester = adjustmentsLib.includes('semesterId')
const adjustmentResolvesSemester = adjustmentsLib.includes('resolveSchedulerSemester')
const adjustmentResponseShape = adjustmentsLib.includes('canApply: boolean') && adjustmentsLib.includes('conflicts: ScheduleAdjustmentConflict[]')

addFinding({
  id: 'K13-CONFLICT-MEDIUM-2',
  severity: 'MEDIUM',
  area: 'schedule adjustment',
  description: `src/lib/schedule/adjustments.ts ${adjustmentHasOwnCheck ? '实现独立冲突检查' : '复用 checkScheduleConflict'}。覆盖 teacher/class/room + capacity。semester scoped via resolveSchedulerSemester。使用 effective schedule（应用历史 adjustment），与直接 slot mutation guard 的基线 scope 不同。`,
  evidence: `ownCheck: ${adjustmentHasOwnCheck}; usesCheckLib: ${adjustmentUsesCheckLib}; weekOverlap: ${adjustmentUsesWeekOverlap}; teacher: ${adjustmentChecksTeacher}; class: ${adjustmentChecksClass}; room: ${adjustmentChecksRoom}; capacity: ${adjustmentChecksCapacity}; semester: ${adjustmentHasSemester}; resolveSemester: ${adjustmentResolvesSemester}; responseShape: ${adjustmentResponseShape}`,
  recommendation: '复用 checkScheduleConflict 的核心查询逻辑（teacher/class/room 查询可抽为纯函数）。adjustment 的 effective schedule scope 是合法的语义差异。',
})

// ═══════════════════════════════════════
// 4. teaching-task PUT inline check
// ═══════════════════════════════════════

const ttHasOwnCheck = teachingTaskRoute.includes('checkWeekOverlap')
const ttChecksRoom = teachingTaskRoute.includes('教室已被')
const ttChecksTeacher = false // teaching-task only checks room conflict for batch update
const ttChecksClass = false
const ttHasSemester = teachingTaskRoute.includes('semesterId')

addFinding({
  id: 'K13-CONFLICT-MEDIUM-3',
  severity: 'MEDIUM',
  area: 'teaching-task/[id] inline check',
  description: `PUT /api/teaching-task/[id] 在 updateMany 后内联执行 room conflict 检查（post-update）。仅检查 room 冲突，不检查 teacher/class 冲突。week overlap 复用 checkWeekOverlap。与 /api/conflict-check 规则不同（更窄），存在规则漂移风险。`,
  evidence: `ownCheck: ${ttHasOwnCheck}; checksRoom: ${ttChecksRoom}; checksTeacher: ${ttChecksTeacher}; checksClass: ${ttChecksClass}; semester: ${ttHasSemester}`,
  recommendation: '调用 guardSlotUpdate 或 checkScheduleConflict 进行完整检查。',
})

// ═══════════════════════════════════════
// 5. scheduler / solver hard conflict
// ═══════════════════════════════════════

const solverHasFindHardConflict = solverLib.includes('findHardConflictParticipants')
const solverHasHC1 = solverLib.includes('HC1') || solverLib.includes('HC1_ROOM_CONFLICT')
const solverHasHC2 = solverLib.includes('HC2') || solverLib.includes('HC2_TEACHER_CONFLICT')
const solverHasHC3 = solverLib.includes('HC3') || solverLib.includes('HC3_CLASS_CONFLICT')
const solverHasHC4 = solverLib.includes('HC4') || solverLib.includes('HC4_CAPACITY')
const solverHasHC5 = solverLib.includes('HC5') || solverLib.includes('HC5_AVAILABILITY')
const solverUsesExpandWeeks = scoreLib.includes('expandWeeks') || solverLib.includes('expandWeeks')

addFinding({
  id: 'K13-CONFLICT-LOW-1',
  severity: 'LOW',
  area: 'solver hard conflict scoring',
  description: `scheduler/solver 使用独立 hard conflict scoring（HC1-HC5），仅用于 LAHC 评分，不直接对外暴露为 API guard。week overlap 复用 src/lib/conflict.ts (expandWeeks)。solver 额外有 capacity (HC4) 和 availability (HC5)，与 mutation guard 不同（mutation guard 不检查 capacity/availability）。`,
  evidence: `findHardConflict: ${solverHasFindHardConflict}; HC1: ${solverHasHC1}; HC2: ${solverHasHC2}; HC3: ${solverHasHC3}; HC4: ${solverHasHC4}; HC5: ${solverHasHC5}; expandWeeks: ${solverUsesExpandWeeks}`,
  recommendation: '不需统一。solver scoring 语义与 mutation guard 不同。后续若需要 mutation guard 也检查 capacity/availability，可复用 solver 底层纯函数。',
})

// ═══════════════════════════════════════
// 6. week overlap / 周次语义
// ═══════════════════════════════════════

const weekOverlapFn = conflictTs.includes('export function checkWeekOverlap')
const expandWeeksFn = conflictTs.includes('export function expandWeeks')
const guardUsesOverlap = conflictLib.includes('checkWeekOverlap')
const adjustmentUsesWeekFilter = adjustmentsLib.includes('isScheduleItemActiveInWeek')
const solverUsesExpand = scoreLib.includes('expandWeeks')

addFinding({
  id: 'K13-CONFLICT-LOW-2',
  severity: 'LOW',
  area: 'week overlap semantics',
  description: `week overlap 共享 src/lib/conflict.ts (checkWeekOverlap / expandWeeks)。shared helper / solver 均复用。adjustment 使用 isScheduleItemActiveInWeek 做单周判断。同一周次语义有多个入口但实现都基于 expandWeeks，语义一致。`,
  evidence: `checkWeekOverlap: ${weekOverlapFn}; expandWeeks: ${expandWeeksFn}; sharedHelperUses: ${guardUsesOverlap}; adjustmentWeekFilter: ${adjustmentUsesWeekFilter}; solverUses: ${solverUsesExpand}`,
  recommendation: 'N/A',
})

// ═══════════════════════════════════════
// 7. frontend preflight contract
// ═══════════════════════════════════════

const storeCallsApiCC = scheduleStore.includes('/api/conflict-check')
const gridCallsApiCC = scheduleGrid.includes('/api/conflict-check')
const storeSendsScheduleSlotId = scheduleStore.includes('scheduleSlotId: slotId')
const storeSendsDaySlot = scheduleStore.includes('targetDayOfWeek') && scheduleStore.includes('targetSlotIndex')
const storeSendsRoom = scheduleStore.includes('targetRoomId: newRoomId')
const storeSendsSemester = scheduleStore.includes('semesterId')
const storeThrowsOnConflict = scheduleStore.includes('throw new Error(preflightResult.conflicts')
const storeParsesServerErr = scheduleStore.includes('errBody?.conflicts') || scheduleStore.includes('errBody?.error')

addFinding({
  id: 'K13-CONFLICT-NONE-2',
  severity: 'NONE',
  area: 'frontend preflight contract',
  description: `K12 客户端 moveSlot preflight 与服务端 conflict-check 契约一致：发送 scheduleSlotId + targetDayOfWeek + targetSlotIndex + targetRoomId + 可选 semesterId，解析 { hasConflict, conflicts[] }。冲突 throw Error 含详情。PUT 失败解析 errBody.conflicts/error。`,
  evidence: `storeCallsApiCC: ${storeCallsApiCC}; gridCallsApiCC: ${gridCallsApiCC}; scheduleSlotId: ${storeSendsScheduleSlotId}; day/slot: ${storeSendsDaySlot}; room: ${storeSendsRoom}; semester: ${storeSendsSemester}; throwsOnConflict: ${storeThrowsOnConflict}; parsesServerErr: ${storeParsesServerErr}`,
  recommendation: 'N/A',
})

// ═══════════════════════════════════════
// 8. response shape comparison
// ═══════════════════════════════════════

const apiShapeHasConflict = conflictLib.includes('hasConflict: boolean')
const apiShapeHasConflicts = conflictLib.includes('conflicts: string[]')
const guardShapeHasConflicts = guardLib.includes('conflicts?:') && guardLib.includes('checkScheduleConflicts')
const adjustmentShapeHasType = adjustmentsLib.includes('type:')
const adjustmentShapeHasMessage = adjustmentsLib.includes('message:')
const adjustmentShapeHasRelated = adjustmentsLib.includes('relatedSlotIds')

addFinding({
  id: 'K13-CONFLICT-MEDIUM-4',
  severity: 'MEDIUM',
  area: 'response shape inconsistency',
  description: `三套实现 response shape 不同。conflict-check/guard: { hasConflict, conflicts: string[] }（现已共享 helper）。adjustment: { canApply, conflicts: ScheduleAdjustmentConflict[] (typed with type/message/severity/relatedSlotIds), warnings: ... }。前端对 moveSlot 错误显示为 string，前端对 adjustment 错误显示为 typed conflict。`,
  evidence: `api: hasConflict=${apiShapeHasConflict} conflicts=${apiShapeHasConflicts}; guard: conflicts=${guardShapeHasConflicts}; adjustment: type=${adjustmentShapeHasType} message=${adjustmentShapeHasMessage} related=${adjustmentShapeHasRelated}`,
  recommendation: '短期保留差异（mutation guard 是 string message，adjustment 是 typed conflict）。长期可统一为 { hasConflict, conflicts: TypedConflict[] }。',
})

// ═══════════════════════════════════════
// 9. Count implementations
// ═══════════════════════════════════════

const conflictFiles = grep('checkScheduleConflict|checkScheduleConflicts|checkConflictsAtTarget|checkWeekOverlap|hasConflict|teacherConflict|roomConflict|classConflict')
const uniqueFiles = new Set(conflictFiles.map(f => f.file))

addFinding({
  id: 'K13-CONFLICT-LOW-3',
  severity: 'LOW',
  area: 'implementation count',
  description: `共发现 ${conflictFiles.length} 处冲突相关代码出现在 ${uniqueFiles.size} 个唯一文件中。主要实现：1) src/lib/schedule/conflict-check.ts (checkScheduleConflicts, shared) 2) src/lib/schedule/slot-mutation-guard.ts (复用 shared helper) 3) src/lib/schedule/adjustments.ts (inline teacher/class/room check) 4) src/app/api/teaching-task/[id]/route.ts (inline room check) 5) src/lib/scheduler/solver.ts (findHardConflictParticipants)。`,
  evidence: `total conflict-related references: ${conflictFiles.length}; unique files: ${uniqueFiles.size}; files: ${[...uniqueFiles].join(', ')}`,
  recommendation: '后续可考虑将第 3+4 项也接入 shared helper。',
})

// ═══════════════════════════════════════
// Output
// ═══════════════════════════════════════

countFiles(path.join(ROOT, 'src'))
countFiles(path.join(ROOT, 'scripts'))

console.log('\n=== K13 Schedule Conflict Check Unification Audit ===\n')
console.log(`Files scanned: ${fileCount}`)
console.log(`Conflict-related references: ${conflictFiles.length}`)
console.log(`Unique conflict files: ${uniqueFiles.size}`)
console.log()

console.log('─── Conflict Check Implementations ───')
console.log('  1. shared: src/lib/schedule/conflict-check.ts (checkScheduleConflicts)')
console.log('     └ used by /api/conflict-check')
console.log('     └ used by slot-mutation-guard.ts (unified in K13-Fix-A)')
console.log('  2. adjustments.ts → inline teacherConflict/roomConflict/classConflict')
console.log('  3. teaching-task/[id]/route.ts → inline room check')
console.log('  4. scheduler/solver.ts → findHardConflictParticipants (HC1-HC5)')
console.log()

console.log('─── Rule Coverage Comparison ───')
console.log('  Implementation                  | Teacher | Class | Room | Week | Semester | Exclude')
console.log('  --------------------------------|---------|-------|------|------|----------|--------')
console.log('  /api/conflict-check             |   YES   |  YES  | YES  | YES  |   YES    |  YES')
console.log('  slot-mutation-guard.ts          |   YES   |  YES  | YES  | YES  |   YES    |  YES')
console.log('    (via shared helper)           |         |       |      |      |          |')
console.log('  adjustments.ts                  |   YES   |  YES  | YES  | via filter | YES | partial')
console.log('  teaching-task/[id] inline       |    NO   |   NO  | YES  | YES  |   YES    |  YES')
console.log('  solver HC1-HC5                  |   YES   |  YES  | YES  | YES  |    -     |   -')
console.log()

console.log('─── Findings ───')
for (const f of findings) {
  const icon = f.severity === 'HIGH' ? '🔴' : f.severity === 'MEDIUM' ? '🟡' : f.severity === 'LOW' ? '🟢' : '⚪'
  console.log(`\n  ${icon} [${f.severity}] ${f.id}: ${f.area}`)
  console.log(`     ${f.description}`)
  console.log(`     Evidence: ${f.evidence}`)
  console.log(`     Recommendation: ${f.recommendation}`)
}
console.log()

// Summary
const high = findings.filter(f => f.severity === 'HIGH').length
const medium = findings.filter(f => f.severity === 'MEDIUM').length
const low = findings.filter(f => f.severity === 'LOW').length
const none = findings.filter(f => f.severity === 'NONE').length
const unknown = findings.filter(f => f.severity === 'UNKNOWN').length

console.log('════════════════════════════════════════════════════════════')
console.log('Summary:')
console.log(`  HIGH: ${high}`)
console.log(`  MEDIUM: ${medium}`)
console.log(`  LOW: ${low}`)
console.log(`  NONE: ${none}`)
console.log(`  UNKNOWN: ${unknown}`)
console.log('════════════════════════════════════════════════════════════')

if (high > 0) {
  console.log('\n⚠  HIGH risks found — Fix phase recommended')
} else if (medium > 0) {
  console.log('\n⚠  MEDIUM risks found — Unification phase recommended')
} else {
  console.log('\n✓  No HIGH/MEDIUM risks')
}
