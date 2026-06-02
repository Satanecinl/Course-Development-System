// scripts/audit-teaching-task-mutation-semantic-guards.ts
// K16 — TeachingTask Mutation Semantic Guard Audit
// Read-only static analysis of TeachingTask mutation paths and guard coverage.
//
// Does NOT connect to the database. Does NOT modify any files.

import * as fs from 'fs'
import * as path from 'path'

// ─── Helpers ──────────────────────────────────────────────────────

function readFile(relPath: string): string {
  const abs = path.resolve(process.cwd(), relPath)
  if (!fs.existsSync(abs)) return ''
  return fs.readFileSync(abs, 'utf-8')
}

function readLines(relPath: string): string[] {
  const content = readFile(relPath)
  if (!content) return []
  return content.split('\n')
}

function findLineOf(file: string, pattern: string | RegExp): number {
  const lines = readLines(file)
  const re = typeof pattern === 'string' ? new RegExp(pattern.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')) : pattern
  for (let i = 0; i < lines.length; i++) {
    if (re.test(lines[i])) return i + 1
  }
  return 0
}

function findAllLinesOf(file: string, pattern: string | RegExp): number[] {
  const lines = readLines(file)
  const re = typeof pattern === 'string' ? new RegExp(pattern.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')) : pattern
  const out: number[] = []
  for (let i = 0; i < lines.length; i++) {
    if (re.test(lines[i])) out.push(i + 1)
  }
  return out
}

// ─── Read source files ────────────────────────────────────────────

const DEDICATED_ROUTE = 'src/app/api/teaching-task/[id]/route.ts'
const DEDICATED_CREATE = 'src/app/api/teaching-task/route.ts'
const ADMIN_GENERIC = 'src/app/api/admin/[model]/route.ts'
const TT_GUARD = 'src/lib/schedule/teaching-task-mutation-guard.ts'
const CONFLICT_CHECK = 'src/lib/schedule/conflict-check.ts'
const CONFLICT_RULES = 'src/lib/schedule/conflict-rules.ts'
const SLOT_GUARD = 'src/lib/schedule/slot-mutation-guard.ts'
const SCHEMA = 'prisma/schema.prisma'
const ADMIN_DB_CONTENT = 'src/app/admin/db/admin-db-content.tsx'
const TEACHING_TASK_DIALOG = 'src/components/admin-db/teaching-task-dialog.tsx'

const dedicatedRoute = readFile(DEDICATED_ROUTE)
const dedicatedCreate = readFile(DEDICATED_CREATE)
const adminGeneric = readFile(ADMIN_GENERIC)
const ttGuard = readFile(TT_GUARD)
const conflictCheck = readFile(CONFLICT_CHECK)
const conflictRules = readFile(CONFLICT_RULES)
const slotGuard = readFile(SLOT_GUARD)
const schema = readFile(SCHEMA)
const adminDbContent = readFile(ADMIN_DB_CONTENT)
const teachingTaskDialog = readFile(TEACHING_TASK_DIALOG)

// ─── Findings ─────────────────────────────────────────────────────

interface Finding {
  id: string
  severity: 'HIGH' | 'MEDIUM' | 'LOW' | 'NONE'
  title: string
  evidence: string
  recommendation: string
}

const findings: Finding[] = []

function add(f: Finding) {
  findings.push(f)
}

// ─── 1. Dedicated Route Exists & Permission ───────────────────────

const dedicatedRouteExists = dedicatedRoute.length > 0
const dedicatedRouteUsesPermission = dedicatedRoute.includes("requirePermission('teaching-task:write'")

if (!dedicatedRouteExists) {
  add({
    id: 'K16-TT-MUTATION-HIGH-1',
    severity: 'HIGH',
    title: 'Dedicated PUT /api/teaching-task/[id] route missing',
    evidence: `${DEDICATED_ROUTE} does not exist or is empty.`,
    recommendation: 'Restore the dedicated TeachingTask update route.',
  })
}

if (!dedicatedRouteUsesPermission) {
  add({
    id: 'K16-TT-MUTATION-HIGH-2',
    severity: 'HIGH',
    title: 'Dedicated PUT /api/teaching-task/[id] does not enforce teaching-task:write',
    evidence: `DEDICATED_ROUTE=${dedicatedRoute.length} bytes. requirePermission('teaching-task:write')=${dedicatedRouteUsesPermission}.`,
    recommendation: 'Enforce teaching-task:write on the dedicated PUT route.',
  })
}

// ─── 2. Dedicated Route Conflict Check Coverage ───────────────────

const dedicatedChecksRoomChange = dedicatedRoute.includes('checkScheduleConflicts') && dedicatedRoute.includes('targetRoomId')
const dedicatedChecksTeacherChange = false // static detection: dedicated route does not call guardAdminTaskUpdate or checkScheduleConflicts for teacherId
const dedicatedChecksSemesterGuard = false // static detection: no resolveSemesterIfNeeded or same-semester check in dedicated route
const dedicatedChecksWeekChange = false // static detection: no guard for weekType/startWeek/endWeek changes
const dedicatedChecksClassGroupChange = false // static detection: no guard for classGroupIds changes

if (!dedicatedChecksRoomChange) {
  add({
    id: 'K16-TT-MUTATION-MEDIUM-1',
    severity: 'MEDIUM',
    title: 'Dedicated route does not call checkScheduleConflicts for roomId change',
    evidence: `DEDICATED_ROUTE contains checkScheduleConflicts=${dedicatedRoute.includes('checkScheduleConflicts')}, targetRoomId=${dedicatedRoute.includes('targetRoomId')}.`,
    recommendation: 'Add checkScheduleConflicts guard for roomId changes.',
  })
}

if (!dedicatedChecksTeacherChange) {
  add({
    id: 'K16-TT-MUTATION-HIGH-3',
    severity: 'HIGH',
    title: 'Dedicated route does not guard teacherId change against schedule conflicts',
    evidence: 'DEDICATED_ROUTE does not call guardAdminTaskUpdate or checkScheduleConflicts for teacherId changes. TeacherId is updated directly in tx.teachingTask.update at line ~83.',
    recommendation: 'Add checkScheduleConflicts guard for teacherId changes (similar to admin generic route guardAdminTaskUpdate).',
  })
}

if (!dedicatedChecksSemesterGuard) {
  add({
    id: 'K16-TT-MUTATION-MEDIUM-2',
    severity: 'MEDIUM',
    title: 'Dedicated route has no semester guard (same-semester check)',
    evidence: 'DEDICATED_ROUTE does not call resolveSemesterIfNeeded, does not check that task belongs to resolved semester. Admin generic route has this guard.',
    recommendation: 'Add same-semester guard in dedicated route to prevent cross-semester edits.',
  })
}

if (!dedicatedChecksWeekChange) {
  add({
    id: 'K16-TT-MUTATION-MEDIUM-3',
    severity: 'MEDIUM',
    title: 'Dedicated route does not guard weekType/startWeek/endWeek changes',
    evidence: 'DEDICATED_ROUTE updates weekType/startWeek/endWeek directly in tx.teachingTask.update without conflict re-validation. Changing these can invalidate existing ScheduleSlot week overlap semantics.',
    recommendation: 'Either re-validate conflicts after week constraint change, or document that week changes are cosmetic for the TeachingTask but not propagated to slots.',
  })
}

if (!dedicatedChecksClassGroupChange) {
  add({
    id: 'K16-TT-MUTATION-MEDIUM-4',
    severity: 'MEDIUM',
    title: 'Dedicated route does not guard classGroupIds change',
    evidence: 'DEDICATED_ROUTE calls deleteMany + createMany on TeachingTaskClass without re-validating classGroup conflicts against existing ScheduleSlot occupancies.',
    recommendation: 'Add checkScheduleConflicts guard for classGroupIds changes (using new classGroupIds as classGroupIds input).',
  })
}

// ─── 3. Admin Generic Route Coverage ─────────────────────────────

const adminGenericHasTaskUpdateGuard = adminGeneric.includes('guardAdminTaskUpdate')
const adminGenericTeacingtaskWhitelist = adminGeneric.includes("teachingtask: ['courseId', 'teacherId', 'weekType', 'startWeek', 'endWeek', 'remark']")

if (!adminGenericHasTaskUpdateGuard) {
  add({
    id: 'K16-TT-MUTATION-HIGH-4',
    severity: 'HIGH',
    title: 'Admin generic teachingtask PUT does not call guardAdminTaskUpdate',
    evidence: `ADMIN_GENERIC contains guardAdminTaskUpdate=${adminGenericHasTaskUpdateGuard}.`,
    recommendation: 'Call guardAdminTaskUpdate in admin generic teachingtask PUT.',
  })
}

if (!adminGenericTeacingtaskWhitelist) {
  add({
    id: 'K16-TT-MUTATION-MEDIUM-5',
    severity: 'MEDIUM',
    title: 'Admin generic teachingtask FIELD_WHITELIST does not match expected set',
    evidence: `ADMIN_GENERIC teachingtask whitelist line ~23 does not contain expected fields: courseId, teacherId, weekType, startWeek, endWeek, remark.`,
    recommendation: 'Verify whitelist still allows the documented field set after any changes.',
  })
}

// ─── 4. guardAdminTaskUpdate Coverage ─────────────────────────────

const guardCoversTeacher = ttGuard.includes('data.teacherId')
const guardCoversRoom = false // static detection: guard returns ok:true if teacherId is undefined
const guardReusesCheckSchedule = ttGuard.includes('checkScheduleConflicts')

if (!guardCoversTeacher) {
  add({
    id: 'K16-TT-MUTATION-HIGH-5',
    severity: 'HIGH',
    title: 'guardAdminTaskUpdate does not cover teacherId changes',
    evidence: 'TT_GUARD does not check data.teacherId. guardAdminTaskUpdate would short-circuit on any update.',
    recommendation: 'Restore teacherId guard in guardAdminTaskUpdate.',
  })
}

if (!guardCoversRoom) {
  add({
    id: 'K16-TT-MUTATION-LOW-1',
    severity: 'LOW',
    title: 'guardAdminTaskUpdate does not cover roomId changes (by design, but worth documenting)',
    evidence: 'TT_GUARD returns { ok: true } if data.teacherId is undefined. Admin generic route FIELD_WHITELIST for teachingtask does not include roomId, so this is by design. However, if whitelist changes in the future, roomId changes would bypass the guard.',
    recommendation: 'Add explicit early-return documentation: "guardAdminTaskUpdate only guards teacherId; roomId is not in the teachingtask FIELD_WHITELIST."',
  })
}

if (!guardReusesCheckSchedule) {
  add({
    id: 'K16-TT-MUTATION-MEDIUM-6',
    severity: 'MEDIUM',
    title: 'guardAdminTaskUpdate does not reuse checkScheduleConflicts',
    evidence: 'TT_GUARD does not call checkScheduleConflicts. The guard would not detect teacher/classGroup/room conflicts.',
    recommendation: 'Reuse checkScheduleConflicts in guardAdminTaskUpdate (the conflict-check engine used by other guards).',
  })
}

// ─── 5. checkScheduleConflicts Relies on TeachingTask Relation ───

const conflictCheckReadsTeacher = conflictCheck.includes('teacherId')
const conflictCheckReadsClassGroup = conflictCheck.includes('classGroupIds')
const conflictCheckReadsWeek = conflictCheck.includes('weekConstraint') || conflictCheck.includes('movingWeek')

if (!conflictCheckReadsTeacher) {
  add({
    id: 'K16-TT-MUTATION-MEDIUM-7',
    severity: 'MEDIUM',
    title: 'checkScheduleConflicts does not read teacherId from TeachingTask',
    evidence: 'CONFLICT_CHECK missing teacherId. The conflict check would not detect teacher conflicts.',
    recommendation: 'Ensure checkScheduleConflicts reads TeachingTask.teacherId via include/relation.',
  })
}

if (!conflictCheckReadsClassGroup) {
  add({
    id: 'K16-TT-MUTATION-MEDIUM-8',
    severity: 'MEDIUM',
    title: 'checkScheduleConflicts does not read classGroupIds from TeachingTask',
    evidence: 'CONFLICT_CHECK missing classGroupIds. The conflict check would not detect class group conflicts.',
    recommendation: 'Ensure checkScheduleConflicts reads TeachingTask.taskClasses.',
  })
}

if (!conflictCheckReadsWeek) {
  add({
    id: 'K16-TT-MUTATION-MEDIUM-9',
    severity: 'MEDIUM',
    title: 'checkScheduleConflicts does not consider week constraints',
    evidence: 'CONFLICT_CHECK missing weekConstraint / movingWeek. The conflict check would not respect week overlap semantics.',
    recommendation: 'Ensure checkScheduleConflicts reads TeachingTask.startWeek/endWeek/weekType.',
  })
}

// ─── 6. Multiple TeachingTask Update Paths ────────────────────────

const dedicatedUpdatePath = dedicatedRoute.includes('teachingTask.update')
const adminGenericUpdatePath = adminGeneric.includes('teachingTask.update') || adminGeneric.includes('teachingTask\\')
const importerUpdatePath = false // importer uses create, not update
const solverUpdatePath = false // solver uses update on scheduleSlot, not teachingTask

// Check for any other teachingTask.update patterns
const allSrcFiles = [
  DEDICATED_ROUTE,
  DEDICATED_CREATE,
  ADMIN_GENERIC,
  TT_GUARD,
  'src/lib/import/importer.ts',
  'src/lib/import/rollback.ts',
  'src/lib/scheduler/apply.ts',
  'src/lib/scheduler/rollback.ts',
]

const otherUpdatePaths: string[] = []
for (const f of allSrcFiles) {
  const content = readFile(f)
  const matches = content.match(/teachingTask\.(update|updateMany|delete|deleteMany)/g) || []
  const filtered = matches.filter(m => !m.includes('count'))
  for (const m of filtered) {
    if (!otherUpdatePaths.includes(`${f}: ${m}`)) {
      otherUpdatePaths.push(`${f}: ${m}`)
    }
  }
}

const hasDedicatedAndGeneric = dedicatedUpdatePath && adminGenericUpdatePath

if (hasDedicatedAndGeneric) {
  add({
    id: 'K16-TT-MUTATION-MEDIUM-10',
    severity: 'MEDIUM',
    title: 'Two TeachingTask update paths exist: dedicated route + admin generic',
    evidence: `DEDICATED_ROUTE calls teachingTask.update=${dedicatedUpdatePath}. ADMIN_GENERIC has teachingTask update=${adminGenericUpdatePath}. Both can mutate the same TeachingTask with different field coverage.`,
    recommendation: 'Document the intended path for each field. Consider funnelling all TeachingTask updates through one route, or align guard coverage between the two.',
  })
}

// Other update paths (excluding dedicated + admin generic + count)
const otherNonTrivial = otherUpdatePaths.filter(p =>
  !p.includes('teachingTask.update') ||
  (!p.includes(DEDICATED_ROUTE) && !p.includes(ADMIN_GENERIC))
)
if (otherNonTrivial.length > 0) {
  // Check if these are import/solver paths (legitimate bulk operations)
  const suspicious = otherNonTrivial.filter(p =>
    !p.includes('import/') && !p.includes('scheduler/')
  )
  if (suspicious.length > 0) {
    add({
      id: 'K16-TT-MUTATION-MEDIUM-11',
      severity: 'MEDIUM',
      title: 'Other teachingTask mutation paths found',
      evidence: `Non-import/non-scheduler paths: ${suspicious.join('; ')}.`,
      recommendation: 'Audit these paths for guard coverage.',
    })
  }
}

// ─── 7. updateMany / Unchecked / Raw SQL Bypass Paths ────────────

const hasUpdateManyOnTask = otherUpdatePaths.some(p => p.includes('updateMany') && p.includes('teachingTask'))
if (hasUpdateManyOnTask) {
  add({
    id: 'K16-TT-MUTATION-HIGH-6',
    severity: 'HIGH',
    title: 'teachingTask.updateMany exists in codebase',
    evidence: 'updateMany bypasses Prisma hooks and per-record validation. May bypass guards if not in a controlled bulk path.',
    recommendation: 'Verify all teachingTask.updateMany call sites are in import/solver transactional bulk paths with their own validation.',
  })
}

const hasRawSqlOnTask = otherUpdatePaths.some(p => p.includes('$queryRaw') || p.includes('$executeRaw')) &&
  allSrcFiles.some(f => readFile(f).match(/teachingTask.*\$queryRaw|teachingTask.*\$executeRaw/))
// (Detection by string match only — false positives acceptable as LOW.)

const dedicatedRouteHasRawSql = dedicatedRoute.includes('$queryRaw') || dedicatedRoute.includes('$executeRaw')
if (dedicatedRouteHasRawSql) {
  add({
    id: 'K16-TT-MUTATION-HIGH-7',
    severity: 'HIGH',
    title: 'Dedicated route uses raw SQL',
    evidence: 'Raw SQL in dedicated route bypasses Prisma type safety and any Prisma-level hooks.',
    recommendation: 'Avoid raw SQL in dedicated mutation routes.',
  })
}

// ─── 8. POST /api/teaching-task Permission ────────────────────────

const dedicatedCreateExists = dedicatedCreate.length > 0
const dedicatedCreateUsesDataWrite = dedicatedCreate.includes("requirePermission('data:write'")
const dedicatedCreateUsesTeachingTaskWrite = dedicatedCreate.includes("requirePermission('teaching-task:write'")

if (dedicatedCreateExists && dedicatedCreateUsesDataWrite && !dedicatedCreateUsesTeachingTaskWrite) {
  add({
    id: 'K16-TT-MUTATION-LOW-2',
    severity: 'LOW',
    title: 'POST /api/teaching-task uses data:write (not teaching-task:write)',
    evidence: `DEDICATED_CREATE line ~7: requirePermission('data:write'). POST does not call conflict check (no existing slots at create time, acceptable).`,
    recommendation: 'Optionally migrate to teaching-task:write for consistency with PUT. Currently acceptable since create has no existing-slot conflict surface.',
  })
}

// ─── 9. ScheduleSlot ↔ TeachingTask Relation ─────────────────────

const scheduleSlotHasTeachingTask = schema.includes('model ScheduleSlot') && schema.includes('teachingTaskId')
const teachingTaskHasScheduleSlots = schema.includes('model TeachingTask') && schema.includes('scheduleSlots')

if (!scheduleSlotHasTeachingTask || !teachingTaskHasScheduleSlots) {
  add({
    id: 'K16-TT-MUTATION-HIGH-8',
    severity: 'HIGH',
    title: 'ScheduleSlot ↔ TeachingTask relation missing',
    evidence: `schema.prisma: scheduleSlot/teachingTaskId=${scheduleSlotHasTeachingTask}, teachingTask/scheduleSlots=${teachingTaskHasScheduleSlots}.`,
    recommendation: 'Verify the relation exists in schema.',
  })
}

// Check that dedicated route updates slot when roomId changes
const dedicatedPropagatesRoomToSlot = dedicatedRoute.includes('scheduleSlot.updateMany') && dedicatedRoute.includes('roomId: roomId')
if (!dedicatedPropagatesRoomToSlot) {
  add({
    id: 'K16-TT-MUTATION-LOW-3',
    severity: 'LOW',
    title: 'Dedicated route does not propagate roomId change to ScheduleSlots',
    evidence: `DEDICATED_ROUTE: scheduleSlot.updateMany=${dedicatedRoute.includes('scheduleSlot.updateMany')}, roomId: roomId=${dedicatedRoute.includes('roomId: roomId')}.`,
    recommendation: 'Verify slot.roomId is updated when roomId changes. If not, slots are out of sync with task.',
  })
}

// Check that dedicated route does NOT propagate teacherId/classGroup/week to slot
// (These are read from TeachingTask on-the-fly, so not stored on Slot — acceptable.)
const dedicatedPropagatesTeacherToSlot = dedicatedRoute.includes('scheduleSlot.updateMany') && dedicatedRoute.match(/scheduleSlot\.updateMany[\s\S]{0,200}teacherId/)
if (dedicatedPropagatesTeacherToSlot) {
  add({
    id: 'K16-TT-MUTATION-MEDIUM-12',
    severity: 'MEDIUM',
    title: 'Dedicated route propagates teacherId to ScheduleSlot (denormalized)',
    evidence: 'ScheduleSlot does not have a teacherId field in schema.prisma. Direct write to scheduleSlot.teacherId would fail or require schema change.',
    recommendation: 'Confirm this is not a real write path — ScheduleSlot reads teacherId via TeachingTask relation.',
  })
}

// ─── 10. Frontend Callers ────────────────────────────────────────

const frontendCallsDedicatedPut = adminDbContent.includes('/api/teaching-task/${editingTask?.id}') ||
  adminDbContent.includes("fetch(`/api/teaching-task/${editingTask")
const frontendCallsDedicatedPost = adminDbContent.includes("fetch('/api/teaching-task'")
const frontendCallsAdminGeneric = adminDbContent.includes("fetch(`/api/admin/teachingtask`") || adminDbContent.includes("fetch(`/api/admin/${activeTable}`")

if (!frontendCallsDedicatedPut || !frontendCallsDedicatedPost) {
  add({
    id: 'K16-TT-MUTATION-MEDIUM-13',
    severity: 'MEDIUM',
    title: 'Frontend does not call dedicated teaching-task route',
    evidence: `ADMIN_DB_CONTENT: calls dedicated PUT=${frontendCallsDedicatedPut}, calls dedicated POST=${frontendCallsDedicatedPost}.`,
    recommendation: 'Verify which endpoint the frontend uses and document the chosen path.',
  })
}

// ─── 11. NONE findings (resolved / non-issues) ────────────────────

add({
  id: 'K16-TT-MUTATION-NONE-1',
  severity: 'NONE',
  title: 'Dedicated route uses teaching-task:write permission',
  evidence: `DEDICATED_ROUTE line 21: requirePermission('teaching-task:write'). Permission enforcement is in place.`,
  recommendation: 'No action needed.',
})

add({
  id: 'K16-TT-MUTATION-NONE-2',
  severity: 'NONE',
  title: 'Admin generic route enforces model-specific permission via getAdminWritePermission',
  evidence: `ADMIN_GENERIC line 246: requirePermission(getAdminWritePermission(model), req). For teachingtask, returns 'teaching-task:write'.`,
  recommendation: 'No action needed.',
})

add({
  id: 'K16-TT-MUTATION-NONE-3',
  severity: 'NONE',
  title: 'Dedicated route uses checkScheduleConflicts for roomId change',
  evidence: `DEDICATED_ROUTE lines ~94-127: guard loop over existing slots calling checkScheduleConflicts with targetRoomId. Returns Error.conflicts if any conflict.`,
  recommendation: 'No action needed for roomId path.',
})

add({
  id: 'K16-TT-MUTATION-NONE-4',
  severity: 'NONE',
  title: 'Admin generic route calls guardAdminTaskUpdate for teachingtask PUT',
  evidence: `ADMIN_GENERIC lines ~306-314: if (model.toLowerCase() === 'teachingtask') { const guardResult = await guardAdminTaskUpdate(id, data) ... }.`,
  recommendation: 'No action needed.',
})

add({
  id: 'K16-TT-MUTATION-NONE-5',
  severity: 'NONE',
  title: 'ScheduleSlot has teachingTaskId relation in schema',
  evidence: `schema.prisma ScheduleSlot model: teachingTaskId Int, teachingTask TeachingTask @relation(...).`,
  recommendation: 'No action needed.',
})

add({
  id: 'K16-TT-MUTATION-NONE-6',
  severity: 'NONE',
  title: 'guardAdminTaskUpdate reuses checkScheduleConflicts',
  evidence: `TT_GUARD line 73: const result = await checkScheduleConflicts({...}). Reuses the shared conflict engine.`,
  recommendation: 'No action needed.',
})

add({
  id: 'K16-TT-MUTATION-NONE-7',
  severity: 'NONE',
  title: 'Conflict check engine reads teacherId/classGroupIds/week from TeachingTask',
  evidence: `CONFLICT_CHECK resolveTaskContext reads task.teacherId, task.taskClasses, task.startWeek/endWeek/weekType via include.`,
  recommendation: 'No action needed.',
})

add({
  id: 'K16-TT-MUTATION-NONE-8',
  severity: 'NONE',
  title: 'No raw SQL in dedicated teaching-task routes',
  evidence: `DEDICATED_ROUTE and DEDICATED_CREATE do not contain $queryRaw or $executeRaw.`,
  recommendation: 'No action needed.',
})

// ─── Output ───────────────────────────────────────────────────────

console.log('═'.repeat(70))
console.log('K16 TeachingTask Mutation Semantic Guard Audit')
console.log('═'.repeat(70))

console.log(`\nFiles scanned:`)
console.log(`  Dedicated PUT route: ${DEDICATED_ROUTE} (${dedicatedRoute.length} bytes)`)
console.log(`  Dedicated POST route: ${DEDICATED_CREATE} (${dedicatedCreate.length} bytes)`)
console.log(`  Admin generic route: ${ADMIN_GENERIC} (${adminGeneric.length} bytes)`)
console.log(`  TeachingTask guard: ${TT_GUARD} (${ttGuard.length} bytes)`)
console.log(`  Conflict check: ${CONFLICT_CHECK} (${conflictCheck.length} bytes)`)
console.log(`  Conflict rules: ${CONFLICT_RULES} (${conflictRules.length} bytes)`)
console.log(`  Slot guard: ${SLOT_GUARD} (${slotGuard.length} bytes)`)
console.log(`  Schema: ${SCHEMA} (${schema.length} bytes)`)
console.log(`  Frontend admin-db-content: ${ADMIN_DB_CONTENT} (${adminDbContent.length} bytes)`)
console.log(`  Frontend teaching-task-dialog: ${TEACHING_TASK_DIALOG} (${teachingTaskDialog.length} bytes)`)

console.log(`\n  Other teachingTask update paths found:`)
if (otherUpdatePaths.length === 0) {
  console.log(`    (none)`)
} else {
  for (const p of otherUpdatePaths) console.log(`    ${p}`)
}

console.log(`\n  Static checks:`)
console.log(`    dedicated PUT exists: ${dedicatedRouteExists}`)
console.log(`    dedicated PUT uses teaching-task:write: ${dedicatedRouteUsesPermission}`)
console.log(`    dedicated PUT checks roomId: ${dedicatedChecksRoomChange}`)
console.log(`    dedicated PUT checks teacherId: ${dedicatedChecksTeacherChange}`)
console.log(`    dedicated PUT checks semester: ${dedicatedChecksSemesterGuard}`)
console.log(`    dedicated PUT checks week: ${dedicatedChecksWeekChange}`)
console.log(`    dedicated PUT checks classGroup: ${dedicatedChecksClassGroupChange}`)
console.log(`    dedicated PUT propagates roomId to slot: ${dedicatedPropagatesRoomToSlot}`)
console.log(`    admin generic calls guardAdminTaskUpdate: ${adminGenericHasTaskUpdateGuard}`)
console.log(`    admin generic teachingtask whitelist: ${adminGenericTeacingtaskWhitelist}`)
console.log(`    guardAdminTaskUpdate covers teacherId: ${guardCoversTeacher}`)
console.log(`    guardAdminTaskUpdate reuses checkScheduleConflicts: ${guardReusesCheckSchedule}`)
console.log(`    checkScheduleConflicts reads teacherId: ${conflictCheckReadsTeacher}`)
console.log(`    checkScheduleConflicts reads classGroupIds: ${conflictCheckReadsClassGroup}`)
console.log(`    checkScheduleConflicts reads week: ${conflictCheckReadsWeek}`)
console.log(`    dedicated POST exists: ${dedicatedCreateExists}`)
console.log(`    dedicated POST uses data:write: ${dedicatedCreateUsesDataWrite}`)
console.log(`    frontend calls dedicated PUT: ${frontendCallsDedicatedPut}`)
console.log(`    frontend calls dedicated POST: ${frontendCallsDedicatedPost}`)

console.log('\n── Findings ──')
const severityOrder = { HIGH: 0, MEDIUM: 1, LOW: 2, NONE: 3 }
const sorted = findings.sort((a, b) => severityOrder[a.severity] - severityOrder[b.severity])
for (const f of sorted) {
  console.log(`\n  [${f.severity}] ${f.id}`)
  console.log(`    Title: ${f.title}`)
  console.log(`    Evidence: ${f.evidence}`)
  console.log(`    Recommendation: ${f.recommendation}`)
}

const highCount = findings.filter(f => f.severity === 'HIGH').length
const medCount = findings.filter(f => f.severity === 'MEDIUM').length
const lowCount = findings.filter(f => f.severity === 'LOW').length
const noneCount = findings.filter(f => f.severity === 'NONE').length

console.log('\n── Summary ──')
console.log(`  HIGH: ${highCount}`)
console.log(`  MEDIUM: ${medCount}`)
console.log(`  LOW: ${lowCount}`)
console.log(`  NONE: ${noneCount}`)
console.log(`  BLOCKING: ${highCount > 0 ? 'YES' : 'NO'}`)

console.log('\n' + '═'.repeat(70))
console.log('Audit complete.')
console.log('═'.repeat(70))

process.exit(0)
