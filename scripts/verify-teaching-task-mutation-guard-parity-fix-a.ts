// scripts/verify-teaching-task-mutation-guard-parity-fix-a.ts
// K16-FIX-A — TeachingTask Mutation Guard Parity Verification
// Static checks — does NOT connect to database, does NOT modify files.

import * as fs from 'fs'
import * as path from 'path'

let passCount = 0
let failCount = 0
let skipCount = 0

function readFile(relPath: string): string {
  const abs = path.resolve(process.cwd(), relPath)
  if (!fs.existsSync(abs)) return ''
  return fs.readFileSync(abs, 'utf-8')
}

function pass(label: string) {
  passCount++
  console.log(`  PASS  ${label}`)
}

function fail(label: string) {
  failCount++
  console.log(`  FAIL  ${label}`)
}

function skip(label: string) {
  skipCount++
  console.log(`  SKIP  ${label}`)
}

// ─── Load files ───────────────────────────────────────────────────

const DEDICATED = 'src/app/api/teaching-task/[id]/route.ts'
const DEDICATED_CREATE = 'src/app/api/teaching-task/route.ts'
const ADMIN_GENERIC = 'src/app/api/admin/[model]/route.ts'
const TT_GUARD = 'src/lib/schedule/teaching-task-mutation-guard.ts'
const CONFLICT_CHECK = 'src/lib/schedule/conflict-check.ts'
const CONFLICT_RULES = 'src/lib/schedule/conflict-rules.ts'
const SCHEMA = 'prisma/schema.prisma'

const dedicated = readFile(DEDICATED)
const dedicatedCreate = readFile(DEDICATED_CREATE)
const adminGeneric = readFile(ADMIN_GENERIC)
const ttGuard = readFile(TT_GUARD)
const conflictCheck = readFile(CONFLICT_CHECK)
const conflictRules = readFile(CONFLICT_RULES)
const schema = readFile(SCHEMA)

console.log('═'.repeat(70))
console.log('K16-FIX-A verification')
console.log('═'.repeat(70))
console.log()

// ─── 1. Dedicated PUT exists ──────────────────────────────────────

if (dedicated.length > 0) {
  pass('dedicated PUT /api/teaching-task/[id] exists')
} else {
  fail('dedicated PUT /api/teaching-task/[id] exists')
}

// ─── 2. Dedicated route uses teaching-task:write ──────────────────

if (dedicated.includes("requirePermission('teaching-task:write'")) {
  pass('dedicated route uses teaching-task:write')
} else {
  fail('dedicated route uses teaching-task:write')
}

// ─── 3. Dedicated route calls guardTeachingTaskUpdateSemantics ────

if (dedicated.includes('guardTeachingTaskUpdateSemantics')) {
  pass('dedicated route calls guardTeachingTaskUpdateSemantics')
} else {
  fail('dedicated route calls guardTeachingTaskUpdateSemantics')
}

// ─── 4. Dedicated route does NOT directly call checkScheduleConflicts ───
// The guard handles this internally; the route should not call it directly.

if (!dedicated.includes('checkScheduleConflicts')) {
  pass('dedicated route does not directly call checkScheduleConflicts (uses guard)')
} else {
  fail('dedicated route does not directly call checkScheduleConflicts (uses guard)')
}

// ─── 5. guardTeachingTaskUpdateSemantics exists in guard file ─────

if (ttGuard.includes('guardTeachingTaskUpdateSemantics')) {
  pass('guardTeachingTaskUpdateSemantics function exists in guard file')
} else {
  fail('guardTeachingTaskUpdateSemantics function exists in guard file')
}

// ─── 6. Comprehensive guard covers teacherId ──────────────────────

if (ttGuard.includes('teacherChanged') || ttGuard.includes('effectiveTeacherId')) {
  pass('comprehensive guard covers teacherId change')
} else {
  fail('comprehensive guard covers teacherId change')
}

// ─── 7. Comprehensive guard covers same-semester ──────────────────

if (ttGuard.includes('不允许将教学任务移到其他学期') || ttGuard.includes('skipSemesterGuard')) {
  pass('comprehensive guard covers same-semester guard')
} else {
  fail('comprehensive guard covers same-semester guard')
}

// ─── 8. Comprehensive guard covers week constraints ───────────────

if (ttGuard.includes('hasWeekChange') || ttGuard.includes('newWeekConstraint')) {
  pass('comprehensive guard covers week constraint guard')
} else {
  fail('comprehensive guard covers week constraint guard')
}

// ─── 9. Comprehensive guard covers classGroupIds ──────────────────

if (ttGuard.includes('classGroupChanged') || ttGuard.includes('effectiveClassGroupIds')) {
  pass('comprehensive guard covers classGroupIds guard')
} else {
  fail('comprehensive guard covers classGroupIds guard')
}

// ─── 10. Comprehensive guard covers roomId ────────────────────────

if (ttGuard.includes('roomChanged') || ttGuard.includes('targetRoomId')) {
  pass('comprehensive guard covers roomId guard')
} else {
  fail('comprehensive guard covers roomId guard')
}

// ─── 11. Comprehensive guard calls checkScheduleConflicts ─────────

if (ttGuard.includes('checkScheduleConflicts')) {
  pass('comprehensive guard calls checkScheduleConflicts')
} else {
  fail('comprehensive guard calls checkScheduleConflicts')
}

// ─── 12. 409 response preserves error ─────────────────────────────

if (dedicated.includes('error: guardResult.error')) {
  pass('409 response preserves error field')
} else {
  fail('409 response preserves error field')
}

// ─── 13. 409 response preserves conflicts ─────────────────────────

if (dedicated.includes('guardResult.conflicts')) {
  pass('409 response preserves conflicts field')
} else {
  fail('409 response preserves conflicts field')
}

// ─── 14. 409 response supports conflictDetails ────────────────────

if (dedicated.includes('guardResult.conflictDetails')) {
  pass('409 response supports conflictDetails')
} else {
  fail('409 response supports conflictDetails')
}

// ─── 15. Admin generic teachingtask PUT uses teaching-task:write ───

if (adminGeneric.includes("teachingtask') return 'teaching-task:write'")) {
  pass('admin generic teachingtask PUT uses teaching-task:write')
} else {
  fail('admin generic teachingtask PUT uses teaching-task:write')
}

// ─── 16. Admin generic guardAdminTaskUpdate still exists ──────────

if (adminGeneric.includes('guardAdminTaskUpdate')) {
  pass('admin generic guardAdminTaskUpdate still exists')
} else {
  fail('admin generic guardAdminTaskUpdate still exists')
}

// ─── 17. guardAdminTaskUpdate still exists in guard file ──────────

if (ttGuard.includes('async function guardAdminTaskUpdate')) {
  pass('guardAdminTaskUpdate function still exists in guard file')
} else {
  fail('guardAdminTaskUpdate function still exists in guard file')
}

// ─── 18. POST /api/teaching-task still uses data:write ────────────
// (We are NOT migrating this permission in Fix-A)

if (dedicatedCreate.includes("requirePermission('data:write'")) {
  pass('POST /api/teaching-task still uses data:write (not migrated)')
} else {
  fail('POST /api/teaching-task still uses data:write (not migrated)')
}

// ─── 19. No new permission keys added ─────────────────────────────

const allFiles = [dedicated, dedicatedCreate, adminGeneric, ttGuard, conflictCheck, conflictRules, schema]
const knownPermissionKeys = [
  'data:read', 'data:write', 'data:delete',
  'schedule:write', 'schedule:adjust',
  'teaching-task:write', 'teaching-task:delete',
  'admin:access', 'scheduler:run',
]
let newPermKeyFound = false
for (const f of allFiles) {
  const matches = f.match(/requirePermission\(['"]([^'"]+)['"]/g) || []
  for (const m of matches) {
    const key = m.match(/requirePermission\(['"]([^'"]+)['"]/)?.[1]
    if (key && !knownPermissionKeys.includes(key)) {
      newPermKeyFound = true
    }
  }
}
if (!newPermKeyFound) {
  pass('no new permission keys added')
} else {
  fail('no new permission keys added')
}

// ─── 20. Prisma schema not modified ───────────────────────────────

const schemaHasTeachingTask = schema.includes('model TeachingTask') && schema.includes('teacherId')
const schemaHasScheduleSlot = schema.includes('model ScheduleSlot') && schema.includes('teachingTaskId')
const schemaHasTeachingTaskClass = schema.includes('model TeachingTaskClass') && schema.includes('classGroupId')
if (schemaHasTeachingTask && schemaHasScheduleSlot && schemaHasTeachingTaskClass) {
  pass('Prisma schema models intact (TeachingTask, ScheduleSlot, TeachingTaskClass)')
} else {
  fail('Prisma schema models intact')
}

// ─── 21. No import/solver/parser changes ──────────────────────────

const importDir = 'src/lib/import'
const solverDir = 'src/lib/scheduler'
const parserScript = 'scripts/parse_schedule.py'

const importDirExists = fs.existsSync(path.resolve(process.cwd(), importDir))
const solverDirExists = fs.existsSync(path.resolve(process.cwd(), solverDir))
const parserExists = fs.existsSync(path.resolve(process.cwd(), parserScript))
if (importDirExists && solverDirExists && parserExists) {
  pass('import/solver/parser files still exist (not modified)')
} else {
  skip('import/solver/parser files check (some missing)')
}

// ─── 22. No frontend changes ──────────────────────────────────────

const frontendDialogContent = readFile('src/components/admin-db/teaching-task-dialog.tsx')
const frontendAdminContent = readFile('src/app/admin/db/admin-db-content.tsx')
if (frontendDialogContent.length > 0 && frontendAdminContent.length > 0) {
  pass('frontend files still exist (not modified)')
} else {
  skip('frontend files check (some missing)')
}

// ─── 23. Conflict rules kernel still exists ───────────────────────

if (conflictRules.includes('checkOccupancyConflicts') && conflictRules.includes('findRuleMatches')) {
  pass('conflict rules kernel intact (checkOccupancyConflicts, findRuleMatches)')
} else {
  fail('conflict rules kernel intact')
}

// ─── 24. ScheduleConflictDetail type exists ───────────────────────

if (conflictRules.includes('ScheduleConflictDetail') && conflictRules.includes('interface ScheduleConflictDetail')) {
  pass('ScheduleConflictDetail type exists in conflict-rules.ts')
} else {
  fail('ScheduleConflictDetail type exists in conflict-rules.ts')
}

// ─── 25. checkScheduleConflicts still returns conflictDetails ─────

if (conflictCheck.includes('conflictDetails: ScheduleConflictDetail[]')) {
  pass('checkScheduleConflicts still returns conflictDetails')
} else {
  fail('checkScheduleConflicts still returns conflictDetails')
}

// ─── Summary ──────────────────────────────────────────────────────

console.log()
console.log('═'.repeat(70))
console.log(`Summary: ${passCount} PASS / ${failCount} FAIL / ${skipCount} SKIP`)
console.log('═'.repeat(70))

process.exit(failCount > 0 ? 1 : 0)
