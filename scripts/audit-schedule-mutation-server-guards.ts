/**
 * K11 Schedule Mutation Server Guard Audit
 *
 * Read-only audit script. Does NOT write to the database.
 * Scans source code to identify all ScheduleSlot mutation paths and evaluates guard coverage.
 */

import * as fs from 'fs'
import * as path from 'path'

const ROOT = path.resolve(__dirname, '..')

interface Finding {
  id: string
  severity: 'HIGH' | 'MEDIUM' | 'LOW' | 'NONE'
  area: string
  description: string
  evidence: string
  recommendation: string
}

const findings: Finding[] = []

function addFinding(f: Finding) {
  findings.push(f)
}

// ═══════════════════════════════════════
// Helpers
// ═══════════════════════════════════════

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

// ═══════════════════════════════════════
// Audit logic
// ═══════════════════════════════════════

const slotPutRoute = readFile('src/app/api/schedule-slot/[id]/route.ts')
const slotPostRoute = readFile('src/app/api/schedule-slot/route.ts')
const adminModelRoute = readFile('src/app/api/admin/[model]/route.ts')
const conflictCheckRoute = readFile('src/app/api/conflict-check/route.ts')
const conflictLib = readFile('src/lib/conflict-check.ts')
const scheduleStore = readFile('src/store/scheduleStore.ts')
const adjustmentsLib = readFile('src/lib/schedule/adjustments.ts')

// ── 1. PUT /api/schedule-slot/[id] ──

const slotPutExists = fileExists('src/app/api/schedule-slot/[id]/route.ts')
const slotPutHasConflictCheck = slotPutRoute.includes('checkScheduleConflict') || slotPutRoute.includes('conflict-check') || slotPutRoute.includes('guardSlot')
const slotPutHasSemesterGuard = (slotPutRoute.includes('semesterId') && (
  slotPutRoute.includes('semester') && (slotPutRoute.includes('guard') || slotPutRoute.includes('existing') || slotPutRoute.includes('!=='))
)) || slotPutRoute.includes('guardSlotUpdate')
const slotPutCallsUpdate = /scheduleSlot\.update/.test(slotPutRoute) || /prisma\.scheduleSlot\.update/.test(slotPutRoute)
const slotPutAllowsDaySlotRoom = /dayOfWeek/.test(slotPutRoute) && /slotIndex/.test(slotPutRoute)
const slotPutPermission = slotPutRoute.match(/requirePermission\(['"]([^'"]+)['"]\)/)?.[1] ?? 'unknown'

if (slotPutExists) {
  const putSeverity = slotPutHasConflictCheck && slotPutHasSemesterGuard ? 'NONE' : slotPutHasConflictCheck || slotPutHasSemesterGuard ? 'MEDIUM' : 'HIGH'
  addFinding({
    id: 'K11-MUTATION-HIGH-1',
    severity: putSeverity,
    area: 'PUT /api/schedule-slot/[id]',
    description: `PUT 更新 ScheduleSlot ${slotPutHasConflictCheck ? '有' : '无'} server-side conflict check，${slotPutHasSemesterGuard ? '有' : '无'} same-semester guard。${!slotPutHasConflictCheck || !slotPutHasSemesterGuard ? '具备 data:write 权限的用户可通过 curl 绕过前端，制造硬冲突或跨学期写入。' : '服务端 guard 已就位。'}`,
    evidence: `Route exists: ${slotPutExists}; hasConflictCheck: ${slotPutHasConflictCheck}; hasSemesterGuard: ${slotPutHasSemesterGuard}; callsUpdate: ${slotPutCallsUpdate}; permission: ${slotPutPermission}`,
    recommendation: putSeverity === 'NONE' ? 'N/A' : '在 PUT handler 中调用 conflict check + same-semester guard。',
  })
} else {
  addFinding({
    id: 'K11-MUTATION-HIGH-1',
    severity: 'NONE',
    area: 'PUT /api/schedule-slot/[id]',
    description: 'Route does not exist.',
    evidence: 'File not found',
    recommendation: 'N/A',
  })
}

// ── 2. POST /api/schedule-slot ──

const slotPostExists = fileExists('src/app/api/schedule-slot/route.ts')
const slotPostHasConflictCheck = slotPostRoute.includes('checkScheduleConflict') || slotPostRoute.includes('conflict-check') || slotPostRoute.includes('guardSlot')
const slotPostSetsSemesterId = /semesterId/.test(slotPostRoute) && /create/.test(slotPostRoute)

if (slotPostExists) {
  addFinding({
    id: 'K11-MUTATION-HIGH-2',
    severity: slotPostHasConflictCheck ? 'NONE' : 'HIGH',
    area: 'POST /api/schedule-slot',
    description: `POST 创建 ScheduleSlot ${slotPostHasConflictCheck ? '有' : '无'} conflict check，${slotPostSetsSemesterId ? '有' : '无'} semesterId 写入。${!slotPostSetsSemesterId ? '创建的 slot semesterId 为 null，导致数据在 scoped 链路中不可见。' : ''}`,
    evidence: `hasConflictCheck: ${slotPostHasConflictCheck}; setsSemesterId: ${slotPostSetsSemesterId}`,
    recommendation: !slotPostHasConflictCheck ? '增加 conflict check 和 semesterId 写入。' : 'N/A',
  })
}

// ── 3. Admin [model] scheduleslot PUT ──

const adminFieldWhitelist = adminModelRoute.match(/scheduleslot:\s*\[([^\]]+)\]/)?.[1] ?? ''
const adminAllowsCoreFields = ['dayOfWeek', 'slotIndex', 'roomId', 'teachingTaskId'].every(f => adminFieldWhitelist.includes(f))
const adminPutHasConflictCheck = adminModelRoute.includes('checkScheduleConflict') || adminModelRoute.includes('guardAdminSlot')
const adminPutHasSemesterGuard = adminModelRoute.includes('semesterId') && adminModelRoute.includes('existing')
const adminPutPermission = adminModelRoute.match(/PUT[\s\S]*?requirePermission\(['"]([^'"]+)['"]\)/)?.[1] ?? 'unknown'

if (fileExists('src/app/api/admin/[model]/route.ts')) {
  addFinding({
    id: 'K11-MUTATION-MEDIUM-1',
    severity: adminPutHasConflictCheck ? 'NONE' : 'MEDIUM',
    area: '/api/admin/[model] scheduleslot PUT',
    description: `Admin 通用 PUT 允许修改 scheduleslot 核心字段(${adminFieldWhitelist})，${adminPutHasConflictCheck ? '有' : '无'} conflict check，${adminPutHasSemesterGuard ? '有' : '无'} same-semester guard。${adminPutHasSemesterGuard ? '有 semester guard 但无 conflict check，仍可制造硬冲突。' : ''}`,
    evidence: `whitelist: [${adminFieldWhitelist}]; hasConflictCheck: ${adminPutHasConflictCheck}; hasSemesterGuard: ${adminPutHasSemesterGuard}; permission: ${adminPutPermission}`,
    recommendation: '增加 conflict check 或要求 schedule:adjust 权限。',
  })
}

// ── 4. Admin [model] scheduleslot DELETE ──

const adminDeleteChecksAdjustment = adminModelRoute.includes('countReferences') && adminModelRoute.match(/case\s+['"]scheduleslot['"]/) !== null

addFinding({
  id: 'K11-MUTATION-MEDIUM-2',
  severity: adminDeleteChecksAdjustment ? 'NONE' : 'MEDIUM',
  area: '/api/admin/[model] scheduleslot DELETE',
  description: `Admin DELETE 对 scheduleslot ${adminDeleteChecksAdjustment ? '有' : '无'} referential integrity check。countReferences 未覆盖 scheduleslot，删除 slot 不会检查 ScheduleAdjustment.originalSlotId 引用。`,
  evidence: `countReferences covers scheduleslot: ${adminDeleteChecksAdjustment}`,
  recommendation: '在 countReferences 中增加 scheduleslot case，检查 ScheduleAdjustment 引用。',
})

// ── 5. Teaching task PUT updates slot roomId ──

const teachingTaskRoute = readFile('src/app/api/teaching-task/[id]/route.ts')
const ttUpdatesSlots = /scheduleSlot\.updateMany/.test(teachingTaskRoute) || /scheduleSlot\.update/.test(teachingTaskRoute)
// K16-FIX-B: Recognize guardTeachingTaskUpdateSemantics as a valid conflict check.
// The dedicated route calls this shared guard pre-transaction, which internally
// uses checkScheduleConflicts for teacherId/roomId/classGroupIds and expandWeeks
// for week constraints, plus a same-semester check.
const ttUsesSharedGuard = teachingTaskRoute.includes('guardTeachingTaskUpdateSemantics')
const ttHasConflictCheck = ttUsesSharedGuard || teachingTaskRoute.includes('checkScheduleConflict') || teachingTaskRoute.includes('checkWeekOverlap')
const ttHasSemesterGuard = ttUsesSharedGuard || (teachingTaskRoute.includes('semesterId') && (
  teachingTaskRoute.includes('guard') || teachingTaskRoute.includes('existing') || teachingTaskRoute.includes('semester')
))

if (ttUpdatesSlots) {
  const ttSeverity = ttHasConflictCheck ? 'NONE' : 'MEDIUM'
  addFinding({
    id: 'K11-MUTATION-MEDIUM-3',
    severity: ttSeverity,
    area: 'PUT /api/teaching-task/[id]',
    description: `Teaching task PUT 通过 scheduleSlot.updateMany 批量更新所有关联 slot 的 roomId，${ttHasConflictCheck ? '有' : '无'} conflict check，${ttHasSemesterGuard ? '有' : '无'} same-semester guard。批量 roomId 变更可能制造教室冲突。`,
    evidence: `updatesSlots: ${ttUpdatesSlots}; hasConflictCheck: ${ttHasConflictCheck}; hasSemesterGuard: ${ttHasSemesterGuard}`,
    recommendation: '增加 conflict check 或在 updateMany 后验证。',
  })
}

// ── 6. No server-side conflict enforcement ──

const conflictCheckCallers = grep('checkScheduleConflict')
const guardCallers = grep('guardSlot|guardAdminSlot|guardTeachingTaskUpdate|slot-mutation-guard|teaching-task-mutation-guard')
const mutationCallers = conflictCheckCallers.filter(f =>
  f.file.includes('route.ts') && !f.file.includes('conflict-check/route.ts')
)
const guardMutationCallers = guardCallers.filter(f =>
  f.file.includes('route.ts') && !f.file.includes('verify-') && !f.file.includes('audit-')
)

addFinding({
  id: 'K11-MUTATION-HIGH-3',
  severity: mutationCallers.length + guardMutationCallers.length === 0 ? 'HIGH' : 'NONE',
  area: 'Server-side conflict enforcement',
  description: `checkScheduleConflict 被 ${conflictCheckCallers.length} 个文件引用，guard module 被 ${guardMutationCallers.length} 个 route 文件引用。${mutationCallers.length + guardMutationCallers.length === 0 ? '无任何 mutation route 在写入前调用 conflict check。' : `${mutationCallers.length + guardMutationCallers.length} 个 mutation route 已接入 conflict guard。`}`,
  evidence: `checkScheduleConflict callers: ${conflictCheckCallers.map(f => `${f.file}:${f.line}`).join(', ')}; guard callers: ${guardMutationCallers.map(f => `${f.file}:${f.line}`).join(', ')}`,
  recommendation: mutationCallers.length + guardMutationCallers.length === 0 ? '所有 schedule mutation 路径应在写入前调用 checkScheduleConflict。' : 'N/A',
})

// ── 7. Client store does not call conflict-check ──

const clientCallsConflictCheck = scheduleStore.includes('conflict-check') || scheduleStore.includes('checkScheduleConflict')

addFinding({
  id: 'K11-MUTATION-MEDIUM-4',
  severity: clientCallsConflictCheck ? 'NONE' : 'MEDIUM',
  area: 'Client scheduleStore moveSlot',
  description: `客户端 moveSlot ${clientCallsConflictCheck ? '调用' : '未调用'} conflict-check API。${!clientCallsConflictCheck ? '拖拽移动直接 PUT 不做冲突预检，完全依赖服务端 guard（当前不存在）。' : ''}`,
  evidence: `clientCallsConflictCheck: ${clientCallsConflictCheck}`,
  recommendation: '在 moveSlot 中先调用 conflict-check API。',
})

// ── 8. Two parallel conflict-check implementations ──

const adjustmentHasOwnConflictCheck = adjustmentsLib.includes('teacherConflict') || adjustmentsLib.includes('roomConflict') || adjustmentsLib.includes('classConflict') || adjustmentsLib.includes('checkWeekOverlap')

addFinding({
  id: 'K11-MUTATION-LOW-1',
  severity: 'LOW',
  area: 'Parallel conflict-check implementations',
  description: `conflict-check.ts 和 schedule/adjustments.ts ${adjustmentHasOwnConflictCheck ? '各自独立实现冲突检查' : '共享冲突检查逻辑'}。两套实现可能导致行为不一致。`,
  evidence: `adjustments has own check: ${adjustmentHasOwnConflictCheck}`,
  recommendation: '统一冲突检查入口，复用 checkScheduleConflict。',
})

// ── 9. ScheduleAdjustment consistency ──

const adjustmentRoute = readFile('src/app/api/schedule-adjustments/route.ts')
const adjustmentHasDryRun = adjustmentRoute.includes('dryRun') || fileExists('src/app/api/schedule-adjustments/dry-run/route.ts')
const adjustmentHasConflictGuard = adjustmentsLib.includes('conflict') || adjustmentsLib.includes('checkWeekOverlap')

addFinding({
  id: 'K11-MUTATION-LOW-2',
  severity: 'LOW',
  area: 'ScheduleAdjustment consistency',
  description: `手动调课路径 ${adjustmentHasDryRun ? '有' : '无'} dry-run，${adjustmentHasConflictGuard ? '有' : '无'} conflict guard。但直接 PUT /api/schedule-slot/[id] 绕过 ScheduleAdjustment，直接修改后撤销调课可能失效。`,
  evidence: `hasDryRun: ${adjustmentHasDryRun}; hasConflictGuard: ${adjustmentHasConflictGuard}`,
  recommendation: '考虑禁止直接 slot mutation 或强制通过 adjustment 路径。',
})

// ── 10. Semester guard coverage ──

const putSemesterScoped = slotPutRoute.includes('semesterId') || slotPutRoute.includes('guardSlotUpdate')
const postSemesterScoped = slotPostRoute.includes('semesterId')
const adminSemesterScoped = adminModelRoute.includes('SEMESTER_SCOPED_MODELS') && adminModelRoute.includes('scheduleslot')

addFinding({
  id: 'K11-MUTATION-MEDIUM-5',
  severity: putSemesterScoped && postSemesterScoped ? 'NONE' : 'MEDIUM',
  area: 'Semester guard coverage',
  description: `PUT /api/schedule-slot/[id]: ${putSemesterScoped ? '有' : '无'} semester guard; POST /api/schedule-slot: ${postSemesterScoped ? '有' : '无'} semester guard; admin route: ${adminSemesterScoped ? '有' : '无'} semester guard。专用 route 缺 semester guard，可跨学期写入。`,
  evidence: `PUT scoped: ${putSemesterScoped}; POST scoped: ${postSemesterScoped}; admin scoped: ${adminSemesterScoped}`,
  recommendation: '专用 route 增加 same-semester guard。',
})

// ── 11. RBAC ──

addFinding({
  id: 'K11-MUTATION-LOW-3',
  severity: 'LOW',
  area: 'RBAC',
  description: `schedule slot mutation 使用 data:write 权限（与普通数据编辑相同），未要求更严格的 schedule:adjust。admin data page 的 PUT/DELETE 同样使用 data:write/data:delete，可绕过 schedule:adjust 保护。`,
  evidence: `PUT /api/schedule-slot/[id]: ${slotPutPermission}; admin PUT: ${adminPutPermission}; admin DELETE: data:delete; schedule-adjustments: schedule:adjust`,
  recommendation: '考虑将 slot mutation 权限提升为 schedule:adjust。',
})

// ═══════════════════════════════════════
// Collect all ScheduleSlot write operations
// ═══════════════════════════════════════

const writeOps = grep('scheduleSlot\\.(create|createMany|update|updateMany|delete|deleteMany|upsert)', 'src')

// ═══════════════════════════════════════
// Output
// ═══════════════════════════════════════

console.log('\n=== K11 Schedule Mutation Server Guard Audit ===\n')

// Count files scanned
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
countFiles(path.join(ROOT, 'src'))
countFiles(path.join(ROOT, 'scripts'))

console.log(`Files scanned: ${fileCount}`)
console.log(`ScheduleSlot write operations in src/: ${writeOps.length}`)
console.log()

// List write operations
console.log('─── ScheduleSlot Write Operations ───')
for (const op of writeOps) {
  console.log(`  ${op.file}:${op.line}  ${op.text.substring(0, 100)}`)
}
console.log()

// List mutation routes
console.log('─── API Mutation Routes ───')
const mutationRoutes = [
  { path: 'PUT /api/schedule-slot/[id]', exists: slotPutExists, conflict: slotPutHasConflictCheck, semester: slotPutHasSemesterGuard },
  { path: 'POST /api/schedule-slot', exists: slotPostExists, conflict: slotPostHasConflictCheck, semester: postSemesterScoped },
  { path: 'PUT /api/admin/[model] (scheduleslot)', exists: true, conflict: adminPutHasConflictCheck, semester: adminSemesterScoped },
  { path: 'DELETE /api/admin/[model] (scheduleslot)', exists: true, conflict: false, semester: adminSemesterScoped },
  { path: 'POST /api/schedule-slot (create)', exists: slotPostExists, conflict: slotPostHasConflictCheck, semester: postSemesterScoped },
]
for (const r of mutationRoutes) {
  console.log(`  ${r.path}`)
  console.log(`    exists: ${r.exists}; conflict check: ${r.conflict}; semester guard: ${r.semester}`)
}
console.log()

// Findings
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

console.log('════════════════════════════════════════════════════════════')
console.log('Summary:')
console.log(`  HIGH: ${high}`)
console.log(`  MEDIUM: ${medium}`)
console.log(`  LOW: ${low}`)
console.log(`  NONE: ${none}`)
console.log('════════════════════════════════════════════════════════════')

if (high > 0) {
  console.log('\n⚠  HIGH risks found — Fix phase recommended')
} else if (medium > 0) {
  console.log('\n⚠  MEDIUM risks found — Fix phase recommended')
} else {
  console.log('\n✓  No HIGH/MEDIUM risks')
}
