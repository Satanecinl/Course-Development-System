# K16-FIX-A-TEACHING-TASK-MUTATION-GUARD-PARITY

## Stage Name

K16-FIX-A-TEACHING-TASK-MUTATION-GUARD-PARITY

## Date

2026-06-02

## Background

K16-TEACHING-TASK-MUTATION-SEMANTIC-GUARD-AUDIT (commit 5b8876d) identified:
- **HIGH 1**: Dedicated `PUT /api/teaching-task/[id]` can modify `teacherId` without calling `guardAdminTaskUpdate` or equivalent `checkScheduleConflicts` teacher conflict guard, bypassing the admin generic route's teacherId guard.
- **MEDIUM 3**: Missing same-semester guard, week constraint guard, and classGroupIds guard on the dedicated route.
- **LOW 2**: Documentation/permission details (not addressed in Fix-A).

## Goal

Eliminate the HIGH and MEDIUM findings by adding comprehensive semantic guards to the dedicated teaching-task PUT route, achieving parity with (or exceeding) the admin generic route's guard coverage.

## Modified Files

| File | Change |
|---|---|
| `src/lib/schedule/teaching-task-mutation-guard.ts` | Added `guardTeachingTaskUpdateSemantics()` — comprehensive guard covering teacherId, roomId, classGroupIds, week constraints, and semester |
| `src/app/api/teaching-task/[id]/route.ts` | Replaced inline roomId-only conflict check with `guardTeachingTaskUpdateSemantics` call before transaction |
| `scripts/audit-teaching-task-mutation-semantic-guards.ts` | Updated static detection to recognize `guardTeachingTaskUpdateSemantics` patterns |
| `scripts/verify-teaching-task-mutation-guard-parity-fix-a.ts` | New verification script for Fix-A |
| `docs/k16-teaching-task-mutation-guard-parity-fix-a.md` | This document |

## Guard Design

### New Function: `guardTeachingTaskUpdateSemantics`

Located in `src/lib/schedule/teaching-task-mutation-guard.ts`.

**Input:**
```ts
taskId: number
proposed: {
  teacherId?: number | null
  roomId?: number | null
  weekType?: string
  startWeek?: number
  endWeek?: number
  classGroupIds?: number[]
  semesterId?: number | null
}
options?: { skipSemesterGuard?: boolean }
```

**Output:**
```ts
TaskMutationGuardResult = {
  ok: boolean
  error?: string
  status?: number
  conflicts?: string[]
  conflictDetails?: ScheduleConflictDetail[]
  semesterId?: number
}
```

### Guard Logic

1. **Read existing task** with all relations (teacherId, semesterId, weekType, startWeek, endWeek, taskClasses, scheduleSlots).

2. **Same-semester guard**: If `proposed.semesterId` differs from `existing.semesterId`, return 403.

3. **Week constraint guard**:
   - If `newStartWeek > newEndWeek`, return 400.
   - If week fields changed AND existing slots exist, verify the new week range has non-empty intersection with the old week range (via `expandWeeks`). If zero overlap, return 409.

4. **Conflict check guard** (teacherId / classGroupIds / roomId):
   - Determine if any conflict-relevant field changed (`teacherChanged`, `classGroupChanged`, `roomChanged`).
   - If yes, for each existing ScheduleSlot, call `checkScheduleConflicts` with:
     - `scheduleSlotId`: existing slot id (exclude self)
     - `teacherId`: new teacherId if changed, else existing
     - `classGroupIds`: new classGroupIds if changed, else existing
     - `movingWeek`: new week constraint
     - `targetDayOfWeek/targetSlotIndex`: existing slot position
     - `targetRoomId`: new roomId if changed, else existing slot roomId
     - `semesterId`: existing slot semester
   - If any conflict found, return 409 with `conflicts` and `conflictDetails`.

### Design Decisions

- **Pre-transaction guard**: The guard runs BEFORE the Prisma transaction, so failed guards don't touch the database.
- **Reuses `checkScheduleConflicts`**: Same engine as `/api/conflict-check`, slot-mutation-guard, and admin generic route. Single source of truth.
- **`arraysEqual` helper**: Compares proposed vs existing classGroupIds to detect changes.
- **`expandWeeks` for week overlap**: Uses the same week expansion logic as the conflict check engine.
- **`skipSemesterGuard` option**: Available for callers that already resolved the semester externally (not used by dedicated route currently).

## Dedicated Route Fix

### Before (K16 audit state)

```ts
// In transaction:
// 1. Upsert course
// 2. Update TeachingTask (no guard for teacherId/week/classGroup)
// 3. Inline roomId conflict check (only if roomId != null)
// 4. Update ScheduleSlots roomId
// 5. Sync TeachingTaskClass (no guard)
```

### After (Fix-A)

```ts
// Before transaction:
const guardResult = await guardTeachingTaskUpdateSemantics(taskId, {
  teacherId, roomId, weekType, startWeek, endWeek, classGroupIds
})
if (!guardResult.ok) return 409

// In transaction:
// 1. Upsert course
// 2. Update TeachingTask
// 3. Propagate roomId to ScheduleSlots
// 4. Sync TeachingTaskClass
```

## Guard Coverage by Field

| Mutation Field | Guard | Conflict Response | Notes |
|---|---|---|---|
| `teacherId` | `guardTeachingTaskUpdateSemantics` → `checkScheduleConflicts` | 409 with `conflicts` + `conflictDetails` | Checks all existing slots for teacher conflicts with new teacher |
| `roomId` | `guardTeachingTaskUpdateSemantics` → `checkScheduleConflicts` | 409 with `conflicts` + `conflictDetails` | Checks all existing slots for room conflicts with new room |
| `weekType` | `guardTeachingTaskUpdateSemantics` → week overlap check | 409 if no overlap with existing slots | Verifies new week range intersects old week range |
| `startWeek` | Same as weekType | Same | Same |
| `endWeek` | Same as weekType | Same | Same |
| `classGroupIds` | `guardTeachingTaskUpdateSemantics` → `checkScheduleConflicts` | 409 with `conflicts` + `conflictDetails` | Checks all existing slots for class group conflicts with new class groups |
| `semesterId` | `guardTeachingTaskUpdateSemantics` → same-semester check | 403 if cross-semester | Prevents moving task to different semester |

## Admin Generic Parity

| Aspect | Dedicated PUT (after Fix-A) | Admin Generic PUT | Parity |
|---|---|---|---|
| Permission | `teaching-task:write` | `teaching-task:write` | ✅ Same |
| teacherId guard | `guardTeachingTaskUpdateSemantics` | `guardAdminTaskUpdate` | ✅ Both check conflicts |
| roomId guard | `guardTeachingTaskUpdateSemantics` | N/A (whitelist excludes) | ✅ Dedicated covers |
| week constraint guard | `guardTeachingTaskUpdateSemantics` | N/A (whitelist includes but guard doesn't cover) | ✅ Dedicated now covers |
| classGroupIds guard | `guardTeachingTaskUpdateSemantics` | N/A (whitelist excludes) | ✅ Dedicated now covers |
| semester guard | `guardTeachingTaskUpdateSemantics` | `resolveSemesterIfNeeded` | ✅ Both check same-semester |
| Conflict response | `{ error, conflicts, conflictDetails }` 409 | `{ error, conflicts, conflictDetails }` 409 | ✅ Same |

**Conclusion**: Dedicated route now has equal or better guard coverage than admin generic route. The HIGH bypass is eliminated.

## Response Shape

All 409 responses from the guard follow the K13-FIX-D shape:

```json
{
  "error": "排课冲突",
  "conflicts": ["教师X在周一1-2节已有..."],
  "conflictDetails": [{ "type": "teacher", "severity": "error", "message": "...", ... }]
}
```

The `error` field is always present. `conflicts: string[]` is always present. `conflictDetails: ScheduleConflictDetail[]` is always present (possibly empty). This matches the existing shape used by `/api/conflict-check`, slot-mutation-guard, and admin generic route.

## Unmodified Scope

- Prisma schema — NOT modified
- prisma/dev.db — NOT modified
- db push / migrate / reset — NOT run
- seed-auth — NOT modified
- role mapping — NOT modified
- requirePermission — NOT modified
- Permission keys — NOT added or modified
- K15 permission matrix — NOT modified
- Frontend — NOT modified
- Import / rollback / solver / parser — NOT modified
- /api/scheduler/run — NOT added
- Re-run button — NOT added
- UI semester selector — NOT added
- POST /api/teaching-task permission — NOT migrated (still `data:write`)

## Verification Commands

```bash
# Fix-A verification
npx.cmd tsx scripts/verify-teaching-task-mutation-guard-parity-fix-a.ts
# Expected: all PASS, 0 FAIL

# K16 audit (post-fix)
npx.cmd tsx scripts/audit-teaching-task-mutation-semantic-guards.ts
# Expected: HIGH 0, MEDIUM reduced, BLOCKING: NO

# Other audits (should not regress)
npx.cmd tsx scripts/audit-rbac-permission-granularity-migration.ts
npx.cmd tsx scripts/audit-rbac-schedule-write-hardening.ts
npx.cmd tsx scripts/audit-schedule-mutation-server-guards.ts
npx.cmd tsx scripts/verify-schedule-conflict-response-shape-fix-d.ts
npx.cmd tsx scripts/verify-schedule-mutation-client-preflight-fix.ts

# Build + lint + test
npm.cmd run build
npm.cmd run lint
npm.cmd run test:auth-foundation
```

## Remaining Risks

- **LOW**: `guardAdminTaskUpdate` only guards teacherId (by design for admin generic route). The admin generic route's FIELD_WHITELIST excludes roomId, classGroupIds — these are handled by the dedicated route.
- **LOW**: `POST /api/teaching-task` uses `data:write` instead of `teaching-task:write`. Not a conflict risk (no existing slots at create time), but a permission consistency issue for a future stage.
- **MEDIUM**: `courseId` / `courseName` change on the dedicated route is not guarded (display-only change, no conflict semantics). Both routes allow it.

## Suggested Next Stage

**K16-FIX-B** (if needed): Address remaining MEDIUM findings from the updated audit, if any survive. Or close K16 if all HIGH are eliminated and remaining MEDIUM/LOW are acceptable.
