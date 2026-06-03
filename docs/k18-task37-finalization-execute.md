# K18-E3 Task37 Finalization Execute

## 1. Background

K18-E2 confirmed task37 is cross-cohort: linked to CG3 (2025级), CG17 (2025级), and CG35 (2024级). TTC 94 (task37 ↔ CG35) was identified as a cross-cohort association to remove. K18-E3 executes this single-mutation fix.

## 2. Execution Goal

Remove TTC 94 (task37 ↔ CG35) to make task37 single-cohort (2025级 only).

## 3. Target Association

| Field | Value |
|---|---|
| TeachingTaskClass id | 94 |
| TeachingTask id | 37 |
| ClassGroup id | 35 |
| Action | DELETE |

## 4. Backup Path

- Created before apply: `prisma/dev.db.backup-before-k18-task37-finalization-20260603054609`
- Size: 3,571,712 bytes

## 5. Dry-run Result

- Executed before apply
- Safety checks: 20/20 PASS
- 0 DB changes
- Operation preview: DELETE TTC 94 only

## 6. Apply Result

- Prisma transaction executed
- Only TTC 94 removed
- Affected count: 1

## 7. Preserved Objects

- TeachingTask 37 (preserved)
- ClassGroup 3 (preserved)
- ClassGroup 17 (preserved)
- ClassGroup 35 (preserved, only link removed)
- TeachingTaskClass 92 (preserved)
- TeachingTaskClass 93 (preserved)
- ScheduleSlot 43 (preserved, still belongs to task37)
- ImportBatch 1 (preserved, status=confirmed)

## 8. ScheduleSlot Impact

Slot 43 is unaffected. It still belongs to task37. Day/slot/room unchanged.

## 9. StudentCount / Display / Export / Solver Impact

- Before: 3 class groups, 98 students, cross-cohort=true
- After: 2 class groups, 61 students, cross-cohort=false
- Display: only CG3 and CG17 shown in task37 details
- Export: only CG3 and CG17 included
- Solver input: 61 students for task37

## 10. Post-fix Validation

- validate-task37-finalization: 18/18 PASS (includes K18-B repaired tasks check)
- K18-B validator: 31 PASS / 1 FAIL (expected: task37 stale expectation [3,17,35] vs actual [3,17])
- K17-FIX-A: HIGH=0, MEDIUM=0, LOW=0, INFO=1, NONE=1
- K18-C: DECISION=LIKELY_ERROR (historical, source data classification unchanged)
- E1: 14/19 PASS (5 FAILs are stale — checked TTC94 existence pre-fix)
- E2: 15/21 PASS (6 FAILs are stale — checked TTC94 existence pre-fix)

## 11. Restore Instruction

```bash
cp prisma/dev.db.backup-before-k18-task37-finalization-20260603054609 prisma/dev.db
```

## 12. Unmodified Scope

- Prisma schema: unmodified
- API routes: unmodified
- Import logic: unmodified
- Frontend: unmodified
- Solver: unmodified
- Parser: unmodified
- TeachingTask 37 data: unmodified
- ClassGroup 35 data: unmodified
- ScheduleSlot 43 data: unmodified
- ImportBatch 1 data: unmodified

## 13. Verification Results

| Script | Result |
|---|---|
| finalize-task37-data-repair-k18-e3 --dry-run | PASS (20/20 safety checks) |
| finalize-task37-data-repair-k18-e3 --apply | PASS (TTC 94 deleted, 9/9 post-checks) |
| validate-task37-finalization-k18-e3 | PASS (18/18) |
| validate-cross-cohort-data-repair-k18-b | 31/32 (1 stale: task37 old expectation) |
| audit-data-quality-classgroup-matching-k17-fix-a | PASS (HIGH=0) |
| review-task37-source-artifact-k18-c | PASS (LIKELY_ERROR, historical) |
| dry-run-task37-readonly-preview-k18-e1 | 14/19 (5 stale pre-fix expectations) |
| prepare-task37-controlled-execution-k18-e2 | 15/21 (6 stale pre-fix expectations) |
| audit-remaining-risk-backlog-k17 | PASS (MEDIUM=5, LOW=6, INFO=2, BLOCKING=0) |
| audit-schedule-mutation-server-guards | PASS (HIGH=0, MEDIUM=0, LOW=3) |
| audit-teaching-task-mutation-semantic-guards | PASS (HIGH=0, MEDIUM=0, LOW=2) |
| verify-schedule-mutation-client-preflight-fix | PASS (23/23) |
| build | PASS |
| lint | PASS (312 problems, no new errors) |
| test:auth-foundation | 53/1 (pre-existing ACTIVE mismatch) |

## 14. Next Stage Recommendation

- K18 data quality mainline: ready to close
- All cross-cohort tasks repaired (K18-B: 4 tasks, K18-E3: task37)
- Recommended next: K19 or end of K18 pipeline
