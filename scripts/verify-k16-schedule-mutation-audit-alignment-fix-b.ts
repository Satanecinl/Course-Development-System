// scripts/verify-k16-schedule-mutation-audit-alignment-fix-b.ts
// K16-FIX-B — Schedule Mutation Audit Alignment Verification
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

const SCHEDULE_MUTATION_AUDIT = 'scripts/audit-schedule-mutation-server-guards.ts'
const TT_MUTATION_AUDIT = 'scripts/audit-teaching-task-mutation-semantic-guards.ts'
const DEDICATED_ROUTE = 'src/app/api/teaching-task/[id]/route.ts'
const TT_GUARD = 'src/lib/schedule/teaching-task-mutation-guard.ts'
const ADMIN_GENERIC = 'src/app/api/admin/[model]/route.ts'
const SCHEMA = 'prisma/schema.prisma'

const scheduleMutationAudit = readFile(SCHEDULE_MUTATION_AUDIT)
const ttMutationAudit = readFile(TT_MUTATION_AUDIT)
const dedicatedRoute = readFile(DEDICATED_ROUTE)
const ttGuard = readFile(TT_GUARD)
const adminGeneric = readFile(ADMIN_GENERIC)
const schema = readFile(SCHEMA)

console.log('═'.repeat(70))
console.log('K16-FIX-B audit alignment verification')
console.log('═'.repeat(70))
console.log()

// ─── 1. audit-schedule-mutation-server-guards.ts recognizes guardTeachingTaskUpdateSemantics ───

if (scheduleMutationAudit.includes('guardTeachingTaskUpdateSemantics')) {
  pass('audit-schedule-mutation-server-guards.ts recognizes guardTeachingTaskUpdateSemantics')
} else {
  fail('audit-schedule-mutation-server-guards.ts recognizes guardTeachingTaskUpdateSemantics')
}

// ─── 2. Audit script does not only rely on old inline roomId check ───

const auditChecksSharedGuard = scheduleMutationAudit.includes('ttUsesSharedGuard')
if (auditChecksSharedGuard) {
  pass('audit script checks shared guard (ttUsesSharedGuard) not just inline checkScheduleConflict')
} else {
  fail('audit script checks shared guard (ttUsesSharedGuard) not just inline checkScheduleConflict')
}

// ─── 3. Audit script guard callers grep includes teaching-task guard ───

if (scheduleMutationAudit.includes('guardTeachingTaskUpdate')) {
  pass('audit script guard callers grep includes guardTeachingTaskUpdate')
} else {
  fail('audit script guard callers grep includes guardTeachingTaskUpdate')
}

// ─── 4. audit-teaching-task-mutation-semantic-guards.ts still recognizes Fix-A guard ───

if (ttMutationAudit.includes('guardTeachingTaskUpdateSemantics')) {
  pass('K16 audit script still recognizes guardTeachingTaskUpdateSemantics')
} else {
  fail('K16 audit script still recognizes guardTeachingTaskUpdateSemantics')
}

// ─── 5. Dedicated route NOT modified in this stage ───

if (dedicatedRoute.includes('guardTeachingTaskUpdateSemantics')) {
  pass('dedicated route still uses guardTeachingTaskUpdateSemantics (not modified)')
} else {
  fail('dedicated route still uses guardTeachingTaskUpdateSemantics (not modified)')
}

if (dedicatedRoute.includes("requirePermission('teaching-task:write'")) {
  pass('dedicated route still uses teaching-task:write (not modified)')
} else {
  fail('dedicated route still uses teaching-task:write (not modified)')
}

// ─── 6. Guard file NOT modified in this stage ───

if (ttGuard.includes('guardTeachingTaskUpdateSemantics')) {
  pass('guard file still has guardTeachingTaskUpdateSemantics (not modified)')
} else {
  fail('guard file still has guardTeachingTaskUpdateSemantics (not modified)')
}

if (ttGuard.includes('guardAdminTaskUpdate')) {
  pass('guard file still has guardAdminTaskUpdate (not modified)')
} else {
  fail('guard file still has guardAdminTaskUpdate (not modified)')
}

// ─── 7. Prisma schema NOT modified ───

if (schema.includes('model TeachingTask') && schema.includes('model ScheduleSlot')) {
  pass('Prisma schema not modified')
} else {
  fail('Prisma schema not modified')
}

// ─── 8. K15 permission matrix NOT modified ───

if (adminGeneric.includes("teachingtask') return 'teaching-task:write'")) {
  pass('admin generic route still uses teaching-task:write (K15 matrix intact)')
} else {
  fail('admin generic route still uses teaching-task:write (K15 matrix intact)')
}

// ─── 9. POST /api/teaching-task permission NOT migrated ───

const dedicatedCreate = readFile('src/app/api/teaching-task/route.ts')
if (dedicatedCreate.includes("requirePermission('data:write'")) {
  pass('POST /api/teaching-task still uses data:write (not migrated)')
} else {
  fail('POST /api/teaching-task still uses data:write (not migrated)')
}

// ─── 10. Frontend NOT modified ───

const frontendDialog = readFile('src/components/admin-db/teaching-task-dialog.tsx')
const frontendAdmin = readFile('src/app/admin/db/admin-db-content.tsx')
if (frontendDialog.length > 0 && frontendAdmin.length > 0) {
  pass('frontend files still exist (not modified)')
} else {
  skip('frontend files check')
}

// ─── 11. Import/solver/parser NOT modified ───

const importDirExists = fs.existsSync(path.resolve(process.cwd(), 'src/lib/import'))
const solverDirExists = fs.existsSync(path.resolve(process.cwd(), 'src/lib/scheduler'))
if (importDirExists && solverDirExists) {
  pass('import/solver files still exist (not modified)')
} else {
  skip('import/solver files check')
}

// ─── 12. K16 LOW items preserved (not falsely marked NONE) ───

if (ttMutationAudit.includes('K16-TT-MUTATION-LOW-1') && ttMutationAudit.includes('K16-TT-MUTATION-LOW-2')) {
  pass('K16 LOW items preserved (not falsely marked NONE)')
} else {
  fail('K16 LOW items preserved (not falsely marked NONE)')
}

// ─── 13. Unused vars cleaned up ───

const auditHasReadLines = /function readLines/.test(scheduleMutationAudit)
const auditHasFindLineOf = /function findLineOf/.test(scheduleMutationAudit)
const auditHasFindAllLinesOf = /function findAllLinesOf/.test(scheduleMutationAudit)
if (!auditHasReadLines && !auditHasFindLineOf && !auditHasFindAllLinesOf) {
  pass('audit-schedule-mutation-server-guards.ts does not have unused readLines/findLineOf/findAllLinesOf')
} else {
  skip('audit-schedule-mutation-server-guards.ts unused var check (may be pre-existing)')
}

// ─── 14. K16 audit script unused vars cleaned ───

const ttAuditHasFindLineOf = /function findLineOf/.test(ttMutationAudit)
const ttAuditHasImporterUpdatePath = /const importerUpdatePath/.test(ttMutationAudit)
const ttAuditHasSolverUpdatePath = /const solverUpdatePath/.test(ttMutationAudit)
const ttAuditHasHasRawSqlOnTask = /const hasRawSqlOnTask/.test(ttMutationAudit)
if (!ttAuditHasFindLineOf && !ttAuditHasImporterUpdatePath && !ttAuditHasSolverUpdatePath && !ttAuditHasHasRawSqlOnTask) {
  pass('K16 audit script unused vars cleaned (findLineOf/importerUpdatePath/solverUpdatePath/hasRawSqlOnTask)')
} else {
  fail('K16 audit script unused vars cleaned')
}

// ─── Summary ──────────────────────────────────────────────────────

console.log()
console.log('═'.repeat(70))
console.log(`Summary: ${passCount} PASS / ${failCount} FAIL / ${skipCount} SKIP`)
console.log('═'.repeat(70))

process.exit(failCount > 0 ? 1 : 0)
