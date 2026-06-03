# K18-B Cross-Cohort Data Repair Execute

## 1. Background

K18 planning phase identified 4 incorrect TeachingTaskClass links where ClassGroup id=22 (2024级钢铁智能冶金技术1班（高本贯通）) was incorrectly linked to 2025-cohort professional course TeachingTasks via import parser auto-merge.

K18 plan commit: `b8b3458 docs(data): plan cross-cohort data repair`

## 2. Execution Goal

Delete exactly 4 target TeachingTaskClass links from prisma/dev.db. No other database changes.

## 3. Target Links

| TTC ID | TeachingTask ID | ClassGroup ID | Course | Teacher | Keep CGs | Slot IDs |
|-------:|----------------:|--------------:|--------|---------|----------|----------|
| 349 | 168 | 22 | 机械制图 | 赵春超 | 3, 18, 19 | 218 |
| 361 | 174 | 22 | 机械制图 | 张红梅 | 3, 18, 19 | 226 |
| 366 | 176 | 22 | 电子技术 | 许进 | 3, 18, 19 | 228 |
| 377 | 181 | 22 | 传感器与检测技术 | 张旭 | 3, 18, 19 | 233 |

## 4. Backup Path

`prisma/dev.db.backup-before-k18-cross-cohort-repair-20260603110020`

Created before apply via `fs.copyFileSync`. Verified to exist.

## 5. Dry-run Result

- Safety checks: 35/35 PASS
- Target links: 4 (exact match)
- ScheduleSlot impact: 0 (all 4 slots preserved)
- DB changes: 0 (dry-run mode)
- Apply allowed: Yes

| TeachingTask ID | TTC ID | Remove CG | Keep CGs | Slot IDs | Dry-run Status |
|---:|---:|---:|---|---|---|
| 168 | 349 | 22 | 3, 18, 19 | 218 | PASS |
| 174 | 361 | 22 | 3, 18, 19 | 226 | PASS |
| 176 | 366 | 22 | 3, 18, 19 | 228 | PASS |
| 181 | 377 | 22 | 3, 18, 19 | 233 | PASS |

## 6. Apply Result

- Safety checks (pre-apply re-run): 35/35 PASS
- Deletion count: 4 (exact match)
- Post-apply checks: 31/31 PASS
- All target links deleted
- All keep links preserved
- All ScheduleSlots preserved
- All non-target entities unchanged

| TeachingTask ID | TTC ID | ClassGroup ID | Action | Status |
|---:|---:|---:|---|---|
| 168 | 349 | 22 | DELETE | ✅ Deleted |
| 174 | 361 | 22 | DELETE | ✅ Deleted |
| 176 | 366 | 22 | DELETE | ✅ Deleted |
| 181 | 377 | 22 | DELETE | ✅ Deleted |

## 7. Deleted TeachingTaskClass Links

1. TTC id=349: task 168 (机械制图/赵春超) ↔ CG 22 (2024级钢铁智能冶金技术1班（高本贯通）)
2. TTC id=361: task 174 (机械制图/张红梅) ↔ CG 22
3. TTC id=366: task 176 (电子技术/许进) ↔ CG 22
4. TTC id=377: task 181 (传感器与检测技术/张旭) ↔ CG 22

## 8. Preserved Objects

| Entity | IDs | Status |
|--------|-----|--------|
| TeachingTask | 168, 174, 176, 181 | Preserved (not modified) |
| ClassGroup | 22 | Preserved (not deleted) |
| ClassGroup | 3, 18, 19 | Preserved (still linked to tasks) |
| ScheduleSlot | 218, 226, 228, 233 | Preserved (not modified) |
| ImportBatch | #1 | Preserved (status=confirmed) |
| Task 37 | 37 | Preserved (not in mutation plan) |
| TeachingTaskClass | 346, 347, 348, 358, 359, 360, 363, 364, 365, 374, 375, 376 | Preserved (keep links) |

## 9. ScheduleSlot Impact

No ScheduleSlot was deleted or modified.

| Slot ID | Day | Index | Task | Status |
|--------:|-----|------:|-----:|--------|
| 218 | 6 | 2 | 168 | Preserved |
| 226 | 6 | 2 | 174 | Preserved |
| 228 | 6 | 4 | 176 | Preserved |
| 233 | 7 | 4 | 181 | Preserved |

## 10. StudentCount / Display / Export / Solver Impact

- Each task classGroup count: 4 → 3
- Each task studentCount: 68 → 38 (removed CG 22 with studentCount=30)
- Dashboard: tasks no longer show 2024级 class in合班 list
- Export: only 2025-cohort classes listed for these 4 tasks
- Solver: capacity constraints use lower student count (38 vs 68)
- Room eligibility: smaller rooms now acceptable for these tasks

## 11. Post-fix Validation

### K18-B Validation Script: 32 PASS / 0 FAIL

All checks passed:
- Tasks 168/174/176/181 no longer have CG 22 ✅
- Tasks still have CG 3, 18, 19 ✅
- TTC ids 349/361/366/377 deleted ✅
- ClassGroup 22 still exists ✅
- ScheduleSlots 218/226/228/233 preserved ✅
- Task 37 unchanged ✅
- Tasks still exist ✅
- ImportBatch #1 unchanged ✅
- No new cross-cohort pollution ✅

### K17-FIX-A Audit (post-repair)

- findings: 4 (down from 16)
- HIGH: 0 (down from 1)
- cross-cohort tasks: 1 (down from 5, only task 37 remaining)
- Target class "2024级钢铁智能冶金技术1班（高本贯通）": no cross-cohort merges found ✅

### K17-FIX-B Review (post-repair)

- LIKELY_ERROR: 0 (down from 4)
- NEEDS_SOURCE_REVIEW: 1 (task 37, unchanged)
- ACCEPTED_CROSS_COHORT: 4 (up from 0 — tasks 168/174/176/181 now accepted)
- BLOCKING: 0 (down from 4)

### K18 Plan (post-repair)

- REPAIR_CANDIDATES: 4 (historical, but all now ACCEPTED_CROSS_COHORT)
- REQUIRES_STUDENT_COUNT_RECALCULATION: 0
- BLOCKING: 0

## 12. Rollback Instruction

Restore from backup:

```bash
# Windows
copy prisma\dev.db.backup-before-k18-cross-cohort-repair-20260603110020 prisma\dev.db

# Unix
cp prisma/dev.db.backup-before-k18-cross-cohort-repair-20260603110020 prisma/dev.db
```

After restore, re-run validation to confirm rollback succeeded.

## 13. Unmodified Scope

- Prisma schema: not modified
- API route: not modified
- Import logic: not modified
- Class group matching logic: not modified
- Frontend: not modified
- Solver / Parser: not modified
- Task 37: not modified
- ImportBatch: not modified
- TeachingTask data: not modified (only TTC links deleted)
- ClassGroup data: not modified
- ScheduleSlot data: not modified
- Seed files / Role mapping / Permission keys: not modified

## 14. Verification Results

| Script / Command | Result |
|-----------------|--------|
| repair-cross-cohort-data-k18-b --dry-run | PASS (35/35 safety checks) |
| repair-cross-cohort-data-k18-b --apply | PASS (4/4 deletions, 31/31 post-checks) |
| validate-cross-cohort-data-repair-k18-b | PASS (32/32) |
| audit-data-quality-classgroup-matching-k17-fix-a | PASS (HIGH=0, down from 1) |
| review-cross-cohort-classgroup-decisions-k17-fix-b | PASS (LIKELY_ERROR=0, down from 4) |
| plan-cross-cohort-data-repair-k18 | PASS (BLOCKING=0) |
| audit-remaining-risk-backlog-k17 | PASS |
| audit-schedule-mutation-server-guards | PASS |
| audit-teaching-task-mutation-semantic-guards | PASS |
| verify-schedule-mutation-client-preflight-fix | PASS |
| build | PASS |
| lint | PASS (312 problems, 2 new warnings from new scripts, no new errors) |
| test:auth-foundation | PASS (53 passed / 1 failed, pre-existing) |

## 15. Next Stage Recommendation

K18-B repair is complete. Recommended next steps:

1. **K18-C**: Review task 37 (习近平新时代中国特色社会主义思想概论) — human verification against original .docx
2. **K19**: Consider improving import matching logic to prevent future cross-cohort merges
3. **Backlog**: Address remaining K17 risk backlog items (MEDIUM 5 / LOW 6 / INFO 2)
