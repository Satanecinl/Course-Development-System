/**
 * K13 Schedule Adjustment Conflict Check Audit
 *
 * Read-only audit. Does NOT write to the database.
 * Does NOT connect to the database. Inspects source code only.
 *
 * Audits:
 *  - src/lib/schedule/adjustments.ts (dryRun / create / void / getEffective)
 *  - src/app/api/schedule-adjustments/route.ts (POST create)
 *  - src/app/api/schedule-adjustments/dry-run/route.ts (POST dry-run)
 *  - src/app/api/schedule-adjustments/[id]/void/route.ts (PATCH void)
 *  - src/lib/schedule/adjustment-client.ts (frontend wrappers)
 *  - src/types/schedule-adjustment.ts (types)
 *
 * Compares adjustment conflict check capabilities against
 * src/lib/schedule/conflict-check.ts:checkScheduleConflicts (the shared helper).
 */

import * as fs from 'fs'
import * as path from 'path'

const ROOT = path.resolve(__dirname, '..')

function read(rel: string): string {
  return fs.readFileSync(path.join(ROOT, rel), 'utf-8')
}
function exists(rel: string): boolean {
  return fs.existsSync(path.join(ROOT, rel))
}

const adjustments = read('src/lib/schedule/adjustments.ts')
const createRoute = read('src/app/api/schedule-adjustments/route.ts')
const dryRunRoute = read('src/app/api/schedule-adjustments/dry-run/route.ts')
const voidRoute = read('src/app/api/schedule-adjustments/[id]/void/route.ts')
const types = read('src/types/schedule-adjustment.ts')
const sharedHelper = read('src/lib/schedule/conflict-check.ts')

// ── 1. File presence ──

const fileChecks = [
  ['adjustments.ts', exists('src/lib/schedule/adjustments.ts')],
  ['create route', exists('src/app/api/schedule-adjustments/route.ts')],
  ['dry-run route', exists('src/app/api/schedule-adjustments/dry-run/route.ts')],
  ['void route', exists('src/app/api/schedule-adjustments/[id]/void/route.ts')],
  ['frontend client', exists('src/lib/schedule/adjustment-client.ts')],
  ['types', exists('src/types/schedule-adjustment.ts')],
  ['shared conflict helper', exists('src/lib/schedule/conflict-check.ts')],
] as const

// ── 2. Dry-run feature surface ──

const dryRunFn = adjustments.match(
  /export async function dryRunScheduleAdjustment[\s\S]*?\n\}/,
)?.[0] ?? ''

const dryRunChecks = {
  hasDryRunFn: /export async function dryRunScheduleAdjustment/.test(adjustments),
  callsValidate: dryRunFn.includes('validateScheduleAdjustmentInput'),
  resolvesSemester: dryRunFn.includes('resolveSchedulerSemester'),
  loadsOriginalSlot: /originalSlot = await prisma\.scheduleSlot\.findUnique/.test(dryRunFn),
  loadsTeachingTask: /teachingTask:\s*\{[\s\S]*?include:/.test(dryRunFn),
  rejectsCrossSemester: /originalSlot\.semesterId !== semesterId/.test(dryRunFn),
  checksActiveInSourceWeek: /isScheduleItemActiveInWeek/.test(dryRunFn),
  rejectsDuplicateActiveAdjustment: /existingActive/.test(dryRunFn),
  usesEffectiveSchedule: /getEffectiveScheduleForWeek\(targetWeek/.test(dryRunFn),
  filtersByDayAndSlot: /item\.dayOfWeek !== newDay/.test(dryRunFn),
  excludesSelfWhenSameWeek: /targetWeek === sourceWeek && item\.slotId === input\.originalSlotId/.test(dryRunFn),
  checksTeacher: /TEACHER_CONFLICT/.test(dryRunFn),
  checksClassGroup: /CLASS_CONFLICT/.test(dryRunFn),
  checksRoom: /ROOM_CONFLICT/.test(dryRunFn),
  checksCapacity: /CAPACITY_CONFLICT/.test(dryRunFn),
  loadsRoom: /prisma\.room\.findUnique/.test(dryRunFn),
  sumsStudentCount: /studentCount\s*\?\?\s*50/.test(dryRunFn),
  callsSharedHelper: /checkScheduleConflicts/.test(dryRunFn),
  usesRuleKernel: /ruleIsTeacherConflict|ruleIsClassGroupConflict|ruleIsRoomConflict/.test(adjustments),
  usesCheckWeekOverlap: /checkWeekOverlap\(/.test(dryRunFn),
  usesExpandWeeks: /expandWeeks\(/.test(dryRunFn),
  returnsCanApply: /canApply: conflicts\.length === 0/.test(dryRunFn),
  returnsWarnings: /warnings/.test(dryRunFn),
}

// ── 3. Create / void surface ──

const createFn = adjustments.match(
  /export async function createScheduleAdjustment[\s\S]*?\n\}/,
)?.[0] ?? ''

const createChecks = {
  callsDryRun: /await dryRunScheduleAdjustment\(/.test(createFn),
  rejectsOnDryRunFail: /if \(!dryRun\.canApply\)/.test(createFn),
  reResolvesSemester: /resolveSchedulerSemester/.test(createFn),
  usesPrismaCreate: /prisma\.scheduleAdjustment\.create/.test(createFn),
  noIndependentConflictRecheck: !/checkScheduleConflict|checkWeekOverlap\(/.test(createFn),
}

const voidFn = adjustments.match(
  /export async function voidScheduleAdjustment[\s\S]*?\n\}/,
)?.[0] ?? ''

const voidChecks = {
  loadsAdjustment: /prisma\.scheduleAdjustment\.findUnique/.test(voidFn),
  rejectsNonActive: /adjustment\.status !== 'ACTIVE'/.test(voidFn),
  resolvesSemester: /resolveSchedulerSemester/.test(voidFn),
  validatesSemesterMatch: /adjustment\.semesterId !== semester\.id/.test(voidFn),
  validatesOriginalSlotSemester: /originalSlot\.semesterId !== adjustment\.semesterId/.test(voidFn),
  noConflictRecheck: !/checkScheduleConflict|checkWeekOverlap\(|TEACHER_CONFLICT|ROOM_CONFLICT|CLASS_CONFLICT/.test(voidFn),
  flipsToVoid: /status:\s*'VOID'/.test(voidFn),
}

// ── 4. Create / void API routes ──

const createApiChecks = {
  requiresPermission: /requirePermission\('schedule:adjust'/.test(createRoute),
  requiresConfirmText: /CONFIRM_ADJUSTMENT/.test(createRoute),
  callsCreateFn: /createScheduleAdjustment\(/.test(createRoute),
  doesNotReRunDryRun: !/dryRunScheduleAdjustment\(/.test(createRoute),
}
const dryRunApiChecks = {
  requiresPermission: /requirePermission\('schedule:adjust'/.test(dryRunRoute),
  callsDryRunFn: /dryRunScheduleAdjustment\(/.test(dryRunRoute),
}
const voidApiChecks = {
  requiresPermission: /requirePermission\('schedule:adjust'/.test(voidRoute),
  requiresConfirmText: /VOID_ADJUSTMENT/.test(voidRoute),
  callsVoidFn: /voidScheduleAdjustment\(/.test(voidRoute),
}

// ── 5. Same-semester guard presence ──

const sameSemesterChecks = {
  resolveSchedulerSemester: /resolveSchedulerSemester/.test(adjustments),
  originalSlotSemesterCheck: /originalSlot\.semesterId !== semesterId/.test(adjustments),
  adjustmentSemesterCheck: /adjustment\.semesterId !== semester/.test(adjustments),
  effectiveScheduleScoped: /getEffectiveScheduleForWeek\(targetWeek, semesterId\)/.test(adjustments),
}

// ── 6. capacity logic ──

const capacityChecks = {
  capacityInDryRun: /CAPACITY_CONFLICT/.test(dryRunFn),
  capacityFromStudentCount: /task\.taskClasses\.reduce/.test(dryRunFn),
  fallbackStudentCount: /studentCount\s*\?\?\s*50/.test(dryRunFn),
  roomLookup: /prisma\.room\.findUnique/.test(dryRunFn),
  thresholdCheck: /studentCount\s*>\s*room\.capacity/.test(dryRunFn),
  reportedAsWarning: /severity:\s*'warning'/.test(dryRunFn),
}

// ── 7. Response shape ──

const responseShapeChecks = {
  typedConflictType: /type:\s*'TEACHER_CONFLICT'\|'CLASS_CONFLICT'\|'ROOM_CONFLICT'\|'CAPACITY_CONFLICT'/.test(types),
  hasSeverity: /severity:\s*'error'\s*\|\s*'warning'/.test(types),
  hasRelatedSlotIds: /relatedSlotIds/.test(types),
  dryRunReturnsTyped: /ScheduleAdjustmentConflict\[\]/.test(dryRunFn),
  dryRunReturnsCanApply: /canApply:/.test(dryRunFn),
  dryRunReturnsWarnings: /warnings:/.test(dryRunFn),
}

// ── 8. targetWeek semantics ──

const targetWeekChecks = {
  targetWeekInput: /targetWeek\?:\s*number\s*\|\s*null/.test(types),
  sourceWeekUsed: /const sourceWeek = input\.week/.test(adjustments),
  targetWeekUsed: /const targetWeek = input\.targetWeek \?\? input\.week/.test(adjustments),
  weekRangeValidated: /week < 1 \|\| .* week > 20/.test(adjustments),
  cancelIgnoresTargetWeek: /input\.type === 'CANCEL'/.test(adjustments),
  moveUsesEffectiveForTarget: /getEffectiveScheduleForWeek\(targetWeek/.test(adjustments),
  movePreservesSourceWeek: /sourceWeek === week/.test(adjustments),
  effectiveItemsHaveTargetWeek: /adj\.targetWeek === week/.test(adjustments),
  effectiveItemsHaveSourceWeek: /sourceWeek = adj\.week/.test(adjustments),
  effectiveItemsHaveOriginalSlotId: /adj\.originalSlotId/.test(adjustments),
}

// ── 9. effective schedule use ──

const effectiveChecks = {
  effectiveFnExists: /export async function getEffectiveScheduleForWeek/.test(adjustments),
  effectiveFiltersActiveInWeek: /isScheduleItemActiveInWeek/.test(adjustments),
  effectiveAppliesCancel: /adj\.type === 'CANCEL'/.test(adjustments),
  effectiveAppliesMove: /adj\.type === 'MOVE'/.test(adjustments),
  effectiveUsesTargetWeek: /targetWeek === week/.test(adjustments),
  effectiveRemovesMovedOut: /movedOutSlotIds/.test(adjustments),
  effectiveDropsCancelled: /cancelledSlotIds/.test(adjustments),
  effectiveScopedBySemester: /adjustmentWhere\.semesterId = semesterId/.test(adjustments),
}

// ── 10. Shared helper capability mapping ──

const sharedHelperChecks = {
  exists: exists('src/lib/schedule/conflict-check.ts'),
  exportsCheckFn: /export async function checkScheduleConflicts/.test(sharedHelper),
  supportsExcludeSelf: /id = \{ not: input\.scheduleSlotId \}/.test(sharedHelper) || /id:\s*\{\s*not:\s*input\.scheduleSlotId\s*\}/.test(sharedHelper),
  supportsSemester: /semesterId/.test(sharedHelper),
  supportsTeacher: /TEACHER/.test(sharedHelper) || /teacherId/.test(sharedHelper),
  supportsClass: /classGroupIds/.test(sharedHelper),
  supportsRoom: /roomId/.test(sharedHelper),
  supportsWeekOverlap: /checkWeekOverlap/.test(sharedHelper),
  usesWeekConstraintType: /WeekConstraint/.test(sharedHelper),
  excludesCapacity: !/capacity/.test(sharedHelper),
  excludesEffectiveSchedule: !/getEffectiveScheduleForWeek/.test(sharedHelper),
  excludesTargetWeek: !/targetWeek/.test(sharedHelper),
}

// ── 11. Cross-week / cross-semester handling ──

const crossWeekChecks = {
  effectiveSupportsCrossWeek: /targetWeek !== sourceWeek/.test(adjustments) || /targetWeek/.test(adjustments),
  cancelOnlySingleWeek: !/cancel[\s\S]{0,200}targetWeek/.test(adjustments.toLowerCase()),
  moveCanTargetAnotherWeek: /adj\.targetWeek === week/.test(adjustments),
  moveKeepsSourceSlotInSourceWeek: /sourceWeek === week[\s\S]{0,50}movedOutSlotIds/.test(adjustments),
  originalSlotNotModified: !/update.*originalSlot/.test(adjustments),
}

// ── 12. Findings (risk roll-up) ──

interface Finding {
  riskId: string
  severity: 'HIGH' | 'MEDIUM' | 'LOW' | 'NONE'
  area: string
  description: string
  evidence: string
  recommendation: string
}

const findings: Finding[] = []

// MEDIUM-1: dry-run has independent teacher/class/room check (and not using rule kernel)
if (
  dryRunChecks.checksTeacher &&
  dryRunChecks.checksClassGroup &&
  dryRunChecks.checksRoom &&
  !dryRunChecks.callsSharedHelper &&
  !dryRunChecks.usesRuleKernel
) {
  findings.push({
    riskId: 'K13-ADJUSTMENT-MEDIUM-1',
    severity: 'MEDIUM',
    area: 'adjustment dry-run conflict logic',
    description:
      'dryRunScheduleAdjustment 实现独立的 teacher/class/room 冲突检查（通过 effective schedule 内存比对），未复用 src/lib/schedule/conflict-check.checkScheduleConflicts 或 src/lib/schedule/conflict-rules。两套实现存在长期漂移风险。',
    evidence: `teacher=${dryRunChecks.checksTeacher} class=${dryRunChecks.checksClassGroup} room=${dryRunChecks.checksRoom} callsSharedHelper=${dryRunChecks.callsSharedHelper} usesRuleKernel=${dryRunChecks.usesRuleKernel}`,
    recommendation:
      'Fix-C 已抽出纯规则 helper 并让 dry-run 复用。',
  })
}

// NONE-6: dry-run uses rule kernel (Fix-C refactor target)
if (dryRunChecks.usesRuleKernel) {
  findings.push({
    riskId: 'K13-ADJUSTMENT-NONE-6',
    severity: 'NONE',
    area: 'dry-run rule kernel reuse',
    description:
      'dryRunScheduleAdjustment 复用 src/lib/schedule/conflict-rules 的纯规则函数（ruleIsTeacherConflict / ruleIsClassGroupConflict / ruleIsRoomConflict）。teacher/class/room 冲突规则文本与 shared checkScheduleConflicts 统一。effective schedule 仍由 adjustment 层构造。',
    evidence: `usesRuleKernel=${dryRunChecks.usesRuleKernel} checksTeacher=${dryRunChecks.checksTeacher} checksClass=${dryRunChecks.checksClassGroup} checksRoom=${dryRunChecks.checksRoom}`,
    recommendation: '无需修改。',
  })
}

// MEDIUM-2: capacity 是 adjustment 独有
if (capacityChecks.capacityInDryRun && sharedHelperChecks.excludesCapacity) {
  findings.push({
    riskId: 'K13-ADJUSTMENT-MEDIUM-2',
    severity: 'MEDIUM',
    area: 'adjustment capacity check',
    description:
      'dryRun 检查 room capacity（学生人数合计 vs room.capacity），shared checkScheduleConflicts 不覆盖。此规则在普通 slot mutation 路径上不强制（导致：直接修改教学任务 roomId 时不检查 capacity，adjustment 路径会检查）。',
    evidence: `capacityInDryRun=${capacityChecks.capacityInDryRun} helperExcludesCapacity=${sharedHelperChecks.excludesCapacity}`,
    recommendation:
      '容量检查应保留在 adjustment 层（adjustment-specific 规则）。不应进入 shared helper，避免扩大 mutation guard 的语义。',
  })
}

// MEDIUM-3: targetWeek 与 movingWeek 语义差异
if (targetWeekChecks.targetWeekUsed && sharedHelperChecks.excludesTargetWeek) {
  findings.push({
    riskId: 'K13-ADJUSTMENT-MEDIUM-3',
    severity: 'MEDIUM',
    area: 'targetWeek / movingWeek semantics',
    description:
      'adjustment 用单周 targetWeek（调课目标周），shared checkScheduleConflicts 用 WeekConstraint（任务整段周次范围）。直接传 targetWeek 给 helper 会把单周调课误判为整段课程冲突。例如：单周 6 周调课，helper 用整段 startWeek..endWeek 扫描，会把 7-8 周等不相关的占用也报告为冲突。',
    evidence: `targetWeek=${targetWeekChecks.targetWeekUsed} helperSupportsTargetWeek=${!sharedHelperChecks.excludesTargetWeek}`,
    recommendation:
      '不直接复用 helper 的 movingWeek 语义。Fix-C 若引入 helper 复用，必须仅复用 room/teacher/class 的 findMany 查询骨架，再叠加 effective schedule 的 in-memory 过滤（targetWeek 在 effectiveItems 中已应用）。',
  })
}

// MEDIUM-4: effective schedule 是 adjustment 独有
if (effectiveChecks.effectiveFnExists && sharedHelperChecks.excludesEffectiveSchedule) {
  findings.push({
    riskId: 'K13-ADJUSTMENT-MEDIUM-4',
    severity: 'MEDIUM',
    area: 'effective schedule scope',
    description:
      'dry-run 使用 effective schedule（应用历史 ACTIVE adjustment 后的周视图），shared helper 使用原始 ScheduleSlot。两者语义不同：直接复用 helper 会忽略已存在的调整，导致漏报（一个被前序 adjustment 移动到目标时段的课程不会被识别为冲突）或误报（一个被前序 adjustment 移走的课程仍被算作冲突）。',
    evidence: `effectiveFnExists=${effectiveChecks.effectiveFnExists} helperExcludesEffective=${sharedHelperChecks.excludesEffectiveSchedule}`,
    recommendation:
      'effective schedule 视为 adjustment 边界语义，保留在 adjustment 层。Fix-C 必须保留此语义。',
  })
}

// MEDIUM-5: response shape 不统一
if (responseShapeChecks.typedConflictType && responseShapeChecks.hasRelatedSlotIds) {
  findings.push({
    riskId: 'K13-ADJUSTMENT-MEDIUM-5',
    severity: 'MEDIUM',
    area: 'response shape',
    description:
      'adjustment response 使用 typed ScheduleAdjustmentConflict { type, message, severity, relatedSlotIds }。shared helper 返回 string[] conflicts。K13-CONFLICT-MEDIUM-4 重复关注此问题。',
    evidence: `typed=${responseShapeChecks.typedConflictType} severity=${responseShapeChecks.hasSeverity} relatedSlotIds=${responseShapeChecks.hasRelatedSlotIds}`,
    recommendation:
      '短期保留差异。Fix-D（独立阶段）统一为 typed conflict。Fix-C 不应改动 response shape。',
  })
}

// NONE-5: create route does not re-run dry-run independently
if (createChecks.callsDryRun && createApiChecks.doesNotReRunDryRun) {
  findings.push({
    riskId: 'K13-ADJUSTMENT-NONE-5',
    severity: 'NONE',
    area: 'create + dry-run coupling',
    description:
      'createScheduleAdjustment 内部调用 dryRun，POST /api/schedule-adjustments 入口不再独立 dry-run。create 必经过 dry-run，规则不会漂移。',
    evidence: `createCallsDryRun=${createChecks.callsDryRun} apiDoesNotReRun=${createApiChecks.doesNotReRunDryRun}`,
    recommendation: '无需修改。',
  })
}

// LOW-2: void 不重做冲突检查
if (voidChecks.noConflictRecheck) {
  findings.push({
    riskId: 'K13-ADJUSTMENT-LOW-2',
    severity: 'LOW',
    area: 'void semantics',
    description:
      'voidScheduleAdjustment 撤销时不做冲突检查（只检查 status、semester、originalSlot 存在性）。这是合理的：撤销 = 恢复原始 slot，原始 slot 在创建时已通过 dry-run 验证。',
    evidence: `noRecheck=${voidChecks.noConflictRecheck}`,
    recommendation: '保持现状。',
  })
}

// LOW-3: rule 重复维护
if (
  !dryRunChecks.callsSharedHelper &&
  !dryRunChecks.usesRuleKernel &&
  sharedHelperChecks.exportsCheckFn
) {
  findings.push({
    riskId: 'K13-ADJUSTMENT-LOW-3',
    severity: 'LOW',
    area: 'rule maintenance',
    description:
      'teacher/class/room 冲突规则同时存在于 adjustments.ts（effective 内存比对）和 src/lib/schedule/conflict-check.ts（Prisma query + checkWeekOverlap）。规则文本逻辑相似但数据来源不同，长期维护有漂移风险。',
    evidence: `adjustmentChecksTeacher=${dryRunChecks.checksTeacher} helperExists=${sharedHelperChecks.exportsCheckFn}`,
    recommendation: 'Fix-C 抽出纯函数（teacherIds / classGroupIds / roomId + WeekConstraint → 对 effectiveItems 集合查冲突），同时给 helper 加同款纯函数（针对 baseItems），保持规则文本统一。',
  })
}

// NONE: rule kernel extracted (Fix-C complete)
if (dryRunChecks.usesRuleKernel && sharedHelperChecks.exportsCheckFn) {
  findings.push({
    riskId: 'K13-ADJUSTMENT-NONE-7',
    severity: 'NONE',
    area: 'rule kernel shared',
    description:
      'adjustments.ts 和 shared checkScheduleConflicts 都通过 src/lib/schedule/conflict-rules 的纯规则函数（ruleIsTeacherConflict / ruleIsClassGroupConflict / ruleIsRoomConflict / isSameTimeSlot / isWeekOverlapping）实现 teacher/class/room/week 判断。规则文本统一，数据源不同（effective items vs base slots），这是合法的语义差异。',
    evidence: `usesRuleKernel=${dryRunChecks.usesRuleKernel} helperExists=${sharedHelperChecks.exportsCheckFn}`,
    recommendation: '无需修改。',
  })
}

// NONE: same-semester guard 完整
if (
  sameSemesterChecks.resolveSchedulerSemester &&
  sameSemesterChecks.originalSlotSemesterCheck &&
  sameSemesterChecks.effectiveScheduleScoped
) {
  findings.push({
    riskId: 'K13-ADJUSTMENT-NONE-1',
    severity: 'NONE',
    area: 'same-semester guard',
    description:
      'adjustment 全链路有 same-semester guard：dry-run 解析 semester、校验 originalSlot.semesterId、effective schedule 用 semesterId 过滤、create 重新 resolve、void 校验 adjustment.semesterId 与 originalSlot.semesterId。',
    evidence: `resolveSemester=${sameSemesterChecks.resolveSchedulerSemester} origCheck=${sameSemesterChecks.originalSlotSemesterCheck} effectiveScoped=${sameSemesterChecks.effectiveScheduleScoped}`,
    recommendation: '无需修改。',
  })
}

// NONE: cancel 不需要冲突检查
if (targetWeekChecks.cancelIgnoresTargetWeek) {
  findings.push({
    riskId: 'K13-ADJUSTMENT-NONE-2',
    severity: 'NONE',
    area: 'cancel semantics',
    description:
      'CANCEL 类型在 validate 后直接返回 canApply=true，不做 teacher/class/room 检查。逻辑正确（取消只会让该 slot 在该周消失，不引入新占用）。',
    evidence: `cancelEarlyReturn=${targetWeekChecks.cancelIgnoresTargetWeek}`,
    recommendation: '无需修改。',
  })
}

// NONE: cross-week move 已支持
if (targetWeekChecks.moveUsesEffectiveForTarget && crossWeekChecks.effectiveSupportsCrossWeek) {
  findings.push({
    riskId: 'K13-ADJUSTMENT-NONE-3',
    severity: 'NONE',
    area: 'cross-week move',
    description:
      'MOVE 类型支持 sourceWeek → targetWeek 跨周移动：sourceWeek 该 slot 移出，targetWeek 在新位置加入。effective schedule 正确处理此场景。',
    evidence: `moveCrossWeek=${crossWeekChecks.effectiveSupportsCrossWeek} effectiveSupportsCrossWeek=${targetWeekChecks.moveUsesEffectiveForTarget}`,
    recommendation: '无需修改。',
  })
}

// NONE: void 不修改 ScheduleSlot
if (crossWeekChecks.originalSlotNotModified) {
  findings.push({
    riskId: 'K13-ADJUSTMENT-NONE-4',
    severity: 'NONE',
    area: 'void does not mutate slots',
    description:
      'voidScheduleAdjustment 只更新 ScheduleAdjustment.status=VOID，不修改原始 ScheduleSlot。',
    evidence: `originalSlotNotModified=${crossWeekChecks.originalSlotNotModified}`,
    recommendation: '无需修改。',
  })
}

// ── 13. Summary ──

const summary = {
  high: findings.filter((f) => f.severity === 'HIGH').length,
  medium: findings.filter((f) => f.severity === 'MEDIUM').length,
  low: findings.filter((f) => f.severity === 'LOW').length,
  none: findings.filter((f) => f.severity === 'NONE').length,
}

// ── 14. Fix-C recommendation ──

const fixCAllowed =
  summary.high === 0 && dryRunChecks.hasDryRunFn && sharedHelperChecks.exportsCheckFn

const fixCStrategy: string[] = []
if (fixCAllowed) {
  fixCStrategy.push('直接复用 checkScheduleConflicts 不可行。')
  fixCStrategy.push('effective schedule / targetWeek / capacity 是 adjustment 独有语义。')
  fixCStrategy.push('推荐策略：')
  fixCStrategy.push(
    '  (a) 抽出纯函数 `findConflictsInSchedule(targetDay, targetSlot, teacherId, classGroupIds, roomId, weekConstraint, items, excludeSlotId?)` 用于在内存中扫描 items 数组。',
  )
  fixCStrategy.push(
    '  (b) shared checkScheduleConflicts 重构为：先 findMany 取 baseItems → 调用同款纯函数。',
  )
  fixCStrategy.push(
    '  (c) dry-run 直接调用纯函数扫描 effectiveItems（targetWeek 在 effectiveItems 已应用）。',
  )
  fixCStrategy.push(
    '  (d) capacity 检查保留为 adjustment 独有（不进入纯函数 / helper）。',
  )
  fixCStrategy.push(
    '  (e) response shape 维持 typed ScheduleAdjustmentConflict，不动 shared helper 输出。',
  )
}

// ── Output ──

console.log('\n=== K13 Schedule Adjustment Conflict Check Audit ===\n')

console.log('Files scanned:')
for (const [name, ok] of fileChecks) {
  console.log(`  [${ok ? 'OK' : 'MISS'}] ${name}`)
}
console.log('')

console.log('dryRunScheduleAdjustment feature surface:')
for (const [k, v] of Object.entries(dryRunChecks)) {
  console.log(`  [${v ? 'YES' : 'NO '}] ${k}`)
}
console.log('')

console.log('createScheduleAdjustment feature surface:')
for (const [k, v] of Object.entries(createChecks)) {
  console.log(`  [${v ? 'YES' : 'NO '}] ${k}`)
}
console.log('')

console.log('voidScheduleAdjustment feature surface:')
for (const [k, v] of Object.entries(voidChecks)) {
  console.log(`  [${v ? 'YES' : 'NO '}] ${k}`)
}
console.log('')

console.log('Create / void API routes:')
for (const [k, v] of Object.entries(createApiChecks)) {
  console.log(`  [${v ? 'YES' : 'NO '}] create-route.${k}`)
}
for (const [k, v] of Object.entries(dryRunApiChecks)) {
  console.log(`  [${v ? 'YES' : 'NO '}] dry-run-route.${k}`)
}
for (const [k, v] of Object.entries(voidApiChecks)) {
  console.log(`  [${v ? 'YES' : 'NO '}] void-route.${k}`)
}
console.log('')

console.log('Same-semester guard:')
for (const [k, v] of Object.entries(sameSemesterChecks)) {
  console.log(`  [${v ? 'YES' : 'NO '}] ${k}`)
}
console.log('')

console.log('Capacity logic:')
for (const [k, v] of Object.entries(capacityChecks)) {
  console.log(`  [${v ? 'YES' : 'NO '}] ${k}`)
}
console.log('')

console.log('Response shape:')
for (const [k, v] of Object.entries(responseShapeChecks)) {
  console.log(`  [${v ? 'YES' : 'NO '}] ${k}`)
}
console.log('')

console.log('targetWeek semantics:')
for (const [k, v] of Object.entries(targetWeekChecks)) {
  console.log(`  [${v ? 'YES' : 'NO '}] ${k}`)
}
console.log('')

console.log('Effective schedule:')
for (const [k, v] of Object.entries(effectiveChecks)) {
  console.log(`  [${v ? 'YES' : 'NO '}] ${k}`)
}
console.log('')

console.log('Shared helper capability mapping:')
for (const [k, v] of Object.entries(sharedHelperChecks)) {
  console.log(`  [${v ? 'YES' : 'NO '}] ${k}`)
}
console.log('')

console.log('Cross-week / cross-semester:')
for (const [k, v] of Object.entries(crossWeekChecks)) {
  console.log(`  [${v ? 'YES' : 'NO '}] ${k}`)
}
console.log('')

console.log('Findings:')
for (const f of findings) {
  console.log(`  [${f.severity}] ${f.riskId} (${f.area})`)
  console.log(`        ${f.description}`)
  console.log(`        Evidence: ${f.evidence}`)
  console.log(`        Recommendation: ${f.recommendation}`)
}
console.log('')

console.log('Summary:')
console.log(`  HIGH:   ${summary.high}`)
console.log(`  MEDIUM: ${summary.medium}`)
console.log(`  LOW:    ${summary.low}`)
console.log(`  NONE:   ${summary.none}`)
console.log('')

console.log('Fix-C Recommendation:')
console.log(`  Fix-C allowed: ${fixCAllowed ? 'conditional (with helper refactor)' : 'no'}`)
if (fixCStrategy.length > 0) {
  for (const line of fixCStrategy) {
    console.log(`  ${line}`)
  }
}
console.log('')
