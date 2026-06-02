# K16-FIX-B-SCHEDULE-MUTATION-AUDIT-ALIGNMENT

## Stage Name

K16-FIX-B-SCHEDULE-MUTATION-AUDIT-ALIGNMENT

## Date

2026-06-02

## Background

K16-FIX-A (commit f02f35b) added `guardTeachingTaskUpdateSemantics()` to the dedicated `PUT /api/teaching-task/[id]` route, covering teacherId/roomId/classGroupIds/week/semester guards. The K16专项 audit (`audit-teaching-task-mutation-semantic-guards.ts`) correctly shows HIGH 0 / MEDIUM 0 / LOW 2 / NONE 13.

However, the K11 schedule mutation server guard audit (`audit-schedule-mutation-server-guards.ts`) still showed MEDIUM 1, while the historical baseline was HIGH 0 / MEDIUM 0 / LOW 3 / NONE 8. This stage investigates and resolves the discrepancy.

## Goal

Audit baseline calibration — no business code changes.

## Initial Problem

### audit-schedule-mutation-server-guards.ts (before fix)

```
HIGH: 0
MEDIUM: 1
LOW: 3
NONE: 7
```

### MEDIUM 1 Finding

```
[MEDIUM] K11-MUTATION-MEDIUM-3: PUT /api/teaching-task/[id]
  Teaching task PUT 通过 scheduleSlot.updateMany 批量更新所有关联 slot 的 roomId，
  无 conflict check，无 same-semester guard。批量 roomId 变更可能制造教室冲突。
  Evidence: updatesSlots: true; hasConflictCheck: false; hasSemesterGuard: false
```

### audit-teaching-task-mutation-semantic-guards.ts (unchanged)

```
HIGH: 0
MEDIUM: 0
LOW: 2
NONE: 13
BLOCKING: NO
```

### Inconsistency

The K16 audit correctly recognizes `guardTeachingTaskUpdateSemantics` as a valid conflict check + semester guard. The K11 audit only checks for inline `checkScheduleConflict` or `checkWeekOverlap` in the route file, and does not recognize the shared guard pattern.

## Verdict

**MEDIUM 1 is a false positive.**

### Reason

The audit script at line 171 checks:
```ts
const ttHasConflictCheck = teachingTaskRoute.includes('checkScheduleConflict')
  || teachingTaskRoute.includes('checkWeekOverlap')
```

After Fix-A, the dedicated route calls `guardTeachingTaskUpdateSemantics` from the guard module, which internally uses `checkScheduleConflicts` for conflict detection. The script does not recognize this delegation pattern.

### Why not a real risk

- The dedicated route calls `guardTeachingTaskUpdateSemantics` before the transaction
- The guard reads existing ScheduleSlots and calls `checkScheduleConflicts` for each
- The guard checks same-semester, week constraints, teacherId, roomId, and classGroupIds
- The response shape is `{ error, conflicts, conflictDetails }` with status 409
- K16专项 audit confirms all guards are in place (NONE-9 through NONE-13)

## Changes

### audit-schedule-mutation-server-guards.ts

1. **Added `ttUsesSharedGuard` detection**: Recognizes `guardTeachingTaskUpdateSemantics` in the teaching-task route as a valid conflict check and semester guard.

2. **Updated `ttHasConflictCheck`**: Now includes `ttUsesSharedGuard` alongside the existing inline checks.

3. **Updated `ttHasSemesterGuard`**: Now includes `ttUsesSharedGuard` alongside the existing inline checks.

4. **Updated guard callers grep**: Added `guardTeachingTaskUpdate` to the pattern so the shared guard is counted in the `K11-MUTATION-HIGH-3` server-side enforcement check.

### audit-teaching-task-mutation-semantic-guards.ts

Removed unused variables:
- `readLines()` function — only called by unused `findLineOf`/`findAllLinesOf`
- `findLineOf()` function — defined but never called
- `findAllLinesOf()` function — defined but never called
- `importerUpdatePath` — set to `false`, never referenced
- `solverUpdatePath` — set to `false`, never referenced
- `hasRawSqlOnTask` — defined but never referenced

### New files

- `scripts/verify-k16-schedule-mutation-audit-alignment-fix-b.ts` — verification script
- `docs/k16-schedule-mutation-audit-alignment-fix-b.md` — this document

## Audit Results After Fix

### audit-schedule-mutation-server-guards.ts

```
HIGH: 0
MEDIUM: 0
LOW: 3
NONE: 8
```

Matches the expected baseline (HIGH 0 / MEDIUM 0 / LOW 3 / NONE 8).

### audit-teaching-task-mutation-semantic-guards.ts (unchanged)

```
HIGH: 0
MEDIUM: 0
LOW: 2
NONE: 13
BLOCKING: NO
```

## Lint Warnings Cleanup

Removed 6 unused constructs from `audit-teaching-task-mutation-semantic-guards.ts`:
- `readLines`, `findLineOf`, `findAllLinesOf` (dead code functions)
- `importerUpdatePath`, `solverUpdatePath` (unused constants)
- `hasRawSqlOnTask` (unused variable)

No business code was modified. No verification logic was removed.

## Unmodified Scope

- Prisma schema — NOT modified
- prisma/dev.db — NOT modified
- db push / migrate / reset — NOT run
- seed-auth — NOT modified
- role mapping — NOT modified
- requirePermission — NOT modified
- Permission keys — NOT added or modified
- K15 permission matrix — NOT modified
- `src/app/api/teaching-task/[id]/route.ts` — NOT modified
- `src/lib/schedule/teaching-task-mutation-guard.ts` — NOT modified
- Frontend — NOT modified
- Import / rollback / solver / parser — NOT modified
- /api/scheduler/run — NOT added
- Re-run button — NOT added
- UI semester selector — NOT added
- POST /api/teaching-task permission — NOT migrated

## Verification Commands

```bash
# Fix-B verification
npx.cmd tsx scripts/verify-k16-schedule-mutation-audit-alignment-fix-b.ts
# Expected: all PASS, 0 FAIL

# Schedule mutation audit (should be HIGH 0 / MEDIUM 0 / LOW 3 / NONE 8)
npx.cmd tsx scripts/audit-schedule-mutation-server-guards.ts

# K16 audit (should remain HIGH 0 / MEDIUM 0 / LOW 2 / NONE 13)
npx.cmd tsx scripts/audit-teaching-task-mutation-semantic-guards.ts

# Other verifications (should not regress)
npx.cmd tsx scripts/verify-teaching-task-mutation-guard-parity-fix-a.ts
npx.cmd tsx scripts/audit-rbac-permission-granularity-migration.ts
npx.cmd tsx scripts/audit-rbac-schedule-write-hardening.ts
npx.cmd tsx scripts/verify-schedule-conflict-response-shape-fix-d.ts
npx.cmd tsx scripts/verify-schedule-mutation-client-preflight-fix.ts

# Build + lint + test
npm.cmd run build
npm.cmd run lint
npm.cmd run test:auth-foundation
```

## Remaining Risks

- **LOW (K11)**: Parallel conflict-check implementations (adjustments.ts vs conflict-check.ts)
- **LOW (K11)**: ScheduleAdjustment consistency (direct slot PUT bypasses adjustment path)
- **LOW (K11)**: RBAC — schedule slot mutation uses data:write instead of schedule:adjust
- **LOW (K16)**: guardAdminTaskUpdate does not cover roomId (by design)
- **LOW (K16)**: POST /api/teaching-task uses data:write (not teaching-task:write)

All LOW items are documented and non-blocking.

## Suggested Next Stage

Close K16 if all audits show expected baselines and no HIGH/MEDIUM remain. The remaining LOW items can be addressed in future dedicated stages if needed.
