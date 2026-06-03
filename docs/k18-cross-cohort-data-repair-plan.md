# K18 Cross-Cohort Data Repair Plan

## 1. Background

K17-FIX-B 完成了对 5 个 cross-cohort TeachingTask 的 review decision，结论如下：

- 4 个 LIKELY_ERROR / HIGH：task 168, 174, 176, 181（专业课跨年级合班错误）
- 1 个 NEEDS_SOURCE_REVIEW / MEDIUM：task 37（公共/思政课，需人工确认）

4 个 LIKELY_ERROR task 的核心问题：`2024级钢铁智能冶金技术1班（高本贯通）`（ClassGroup id=22, cohortYear=2024）通过 import parser 的合班模糊匹配被错误关联到 2025 cohort 的 TeachingTask 中。

本阶段 K18 是 **repair plan**，不是 repair execution。本阶段只生成可执行数据修复计划、dry-run 方案、回滚方案和验收脚本设计，**不修改任何业务数据**。

## 2. Goal

- 精确列出 4 个 LIKELY_ERROR task 的待修复 TeachingTaskClass links
- 查明每个 task 当前关联的所有 ClassGroup、ScheduleSlot
- 判断 remove ClassGroup id=22 后的影响（task 合法性、studentCount、ScheduleSlot、display、export、solver）
- 判断 ClassGroup id=22 是否需要单独 TeachingTask
- 为 K18-B 生成 dry-run repair script 设计、回滚方案、验收脚本
- 对 task 37 给出明确处理建议

## 3. Scope

| Entity | Scope |
|--------|-------|
| TeachingTask | task 168, 174, 176, 181, 37 |
| TeachingTaskClass | 上述 5 个 task 关联的所有 class group link |
| ClassGroup | id=22 及关联的 2025 级班级 (3, 18, 19) |
| ScheduleSlot | 上述 5 个 task 的所有 slot |
| ImportBatch | #1 (confirmed) |
| Course / Teacher / Semester | 关联查询 |

## 4. Input Evidence

| Source | Status |
|--------|--------|
| K17-FIX-B JSON (`docs/k17-cross-cohort-review-decision.json`) | Read |
| K17-FIX-A JSON (`docs/k17-data-quality-classgroup-matching-audit.json`) | Read |
| DB (Prisma read-only queries) | Read |
| ImportBatch #1 | Found (confirmed) |
| Source artifacts (`uploads/imports/`) | Available |
| Pre-import backup (`prisma/dev.db.backup-before-import-20260527204043`) | Available |

No evidence gap identified. All source artifacts needed for repair planning are available.

## 5. Repair Candidate Summary

```
REPAIR_CANDIDATES:              4  (task 168, 174, 176, 181)
EXCLUDED_TASKS:                 1  (task 37)
REQUIRES_NEW_TEACHING_TASK:     4  (CG 22 has no standalone task for these courses)
REQUIRES_STUDENT_COUNT_RECALCULATION: 4  (current 68 → proposed 38)
REQUIRES_MANUAL_REVIEW:         1  (task 37)
BLOCKING:                       0  (repair plan is clear, can proceed to K18-B)
```

## 6. Per-Task Repair Plan

### Task 168 — 机械制图（赵春超）

| Field | Value |
|-------|-------|
| teachingTaskId | 168 |
| courseId | 2 |
| courseName | 机械制图 |
| teacherId | 23 |
| teacherName | 赵春超 |
| semesterId | 1 |
| importBatchId | 1 |
| weekType | ODD |
| startWeek / endWeek | 1 / 16 |
| remark | 2024级钢铁智能冶金技术1班（高本贯通） |
| ScheduleSlot | id=218, day=6, slot=2, roomId=null |
| currentStudentCount | 68 (30+4+4+30) |
| proposedStudentCount | 38 (30+4+4) |

**ClassGroups:**

| CG ID | Name | Cohort | Track | Keep? | Reason |
|------:|------|--------|-------|-------|--------|
| 3 | 2025级钢铁智能冶金技术1班（高本贯通） | 2025 | 高本贯通 | ✅ Keep | Same cohort |
| 18 | 2025级钢铁智能冶金技术（现场工程师） | 2025 | 现场工程师 | ✅ Keep | Same cohort |
| 19 | 2025级智能轧钢技术（现场工程师）+2025级机电一体化技术（现场工程师） | 2025 | 现场工程师 | ✅ Keep | Same cohort |
| 22 | 2024级钢铁智能冶金技术1班（高本贯通） | 2024 | 高本贯通 | ❌ Remove | Cross-cohort, parser auto-merge error |

**Repair Action:** Remove TTC link (taskId=168, classGroupId=22, ttcId=349). Keep 3 classGroups. ScheduleSlot 218 preserved.

---

### Task 174 — 机械制图（张红梅）

| Field | Value |
|-------|-------|
| teachingTaskId | 174 |
| courseId | 2 |
| courseName | 机械制图 |
| teacherId | 31 |
| teacherName | 张红梅 |
| semesterId | 1 |
| importBatchId | 1 |
| weekType | ODD |
| startWeek / endWeek | 1 / 16 |
| remark | 2024级钢铁智能冶金技术1班（高本贯通） |
| ScheduleSlot | id=226, day=6, slot=2, roomId=null |
| currentStudentCount | 68 |
| proposedStudentCount | 38 |

**ClassGroups:** Same structure as task 168 (CG 3, 18, 19 keep; CG 22 remove).

**Repair Action:** Remove TTC link (taskId=174, classGroupId=22, ttcId=361). Keep 3 classGroups. ScheduleSlot 226 preserved.

---

### Task 176 — 电子技术（许进）

| Field | Value |
|-------|-------|
| teachingTaskId | 176 |
| courseId | 19 |
| courseName | 电子技术 |
| teacherId | 28 |
| teacherName | 许进 |
| semesterId | 1 |
| importBatchId | 1 |
| weekType | ODD |
| startWeek / endWeek | 1 / 16 |
| remark | 2024级钢铁智能冶金技术1班（高本贯通） |
| ScheduleSlot | id=228, day=6, slot=4, roomId=null |
| currentStudentCount | 68 |
| proposedStudentCount | 38 |

**ClassGroups:** Same structure (CG 3, 18, 19 keep; CG 22 remove).

**Repair Action:** Remove TTC link (taskId=176, classGroupId=22, ttcId=366). Keep 3 classGroups. ScheduleSlot 228 preserved.

---

### Task 181 — 传感器与检测技术（张旭）

| Field | Value |
|-------|-------|
| teachingTaskId | 181 |
| courseId | 23 |
| courseName | 传感器与检测技术 |
| teacherId | 30 |
| teacherName | 张旭 |
| semesterId | 1 |
| importBatchId | 1 |
| weekType | ODD |
| startWeek / endWeek | 1 / 16 |
| remark | 2024级钢铁智能冶金技术1班（高本贯通） |
| ScheduleSlot | id=233, day=7, slot=4, roomId=null |
| currentStudentCount | 68 |
| proposedStudentCount | 38 |

**ClassGroups:** Same structure (CG 3, 18, 19 keep; CG 22 remove).

**Repair Action:** Remove TTC link (taskId=181, classGroupId=22, ttcId=377). Keep 3 classGroups. ScheduleSlot 233 preserved.

## 7. Task 37 Review Decision

- **teachingTaskId:** 37
- **courseName:** 习近平新时代中国特色社会主义思想概论
- **teacherName:** 房忠敏
- **decision:** NEEDS_SOURCE_REVIEW
- **reason:** Public/ideology course — cross-cohort merge (2025级钢铁 + 2025级森林防火 + 2024级森林防火) may be legitimate
- **current K18 status:** EXCLUDED from repair plan
- **nextStep:** Human reviews original .docx to determine if 2024级森林草原防火技术1班 and 2025级森林草原防火技术1班 should attend this course together
- **if confirmed legitimate:** Mark as ACCEPTED_CROSS_COHORT
- **if confirmed error:** Enter separate repair plan

Task 37 is excluded because:
1. It's a public/ideology course where cross-cohort classes are common
2. The cross-cohort pattern involves different classes (森林防火技术) from different years, not the same class name across years
3. Requires human verification against original .docx before any action

## 8. Student Count / Display / Export / Solver Impact

### Student Count

| Task | Current (all CGs) | After Repair (keep only) | Change |
|-----:|-------------------:|-------------------------:|-------:|
| 168 | 68 | 38 | -30 |
| 174 | 68 | 38 | -30 |
| 176 | 68 | 38 | -30 |
| 181 | 68 | 38 | -30 |

- Remove CG 22 (studentCount=30) from each task
- StudentCount field on TeachingTask is not directly stored (computed from linked ClassGroups)
- No explicit TeachingTask.studentCount field to update in current schema
- Solver uses `getTaskStudentCount()` which reads from linked ClassGroups

### Display Impact

- Dashboard: Tasks 168/174/176/181 will no longer show 2024级 class in合班 list
- Schedule grid: Slot display unchanged (slot time/room not affected)
- Sidebar filters: 2024级 class filter will no longer match these 4 tasks

### Export Impact

- Excel export: These 4 tasks will only list 2025-cohort classes
- No 2024级 class entry in exported schedule for these tasks

### Solver Input

- Solver will compute studentCount = 38 (instead of 68) for these tasks
- Capacity constraints (HC4/HC5) will use lower student count
- Room eligibility may expand (fewer students → smaller rooms acceptable)

## 9. ScheduleSlot Impact

| Task | Slot ID | Day | Slot Index | Room | Action |
|-----:|--------:|-----|-----------:|------|--------|
| 168 | 218 | 6 | 2 | null | **Preserved** — not modified |
| 174 | 226 | 6 | 2 | null | **Preserved** — not modified |
| 176 | 228 | 6 | 4 | null | **Preserved** — not modified |
| 181 | 233 | 7 | 4 | null | **Preserved** — not modified |

- **No ScheduleSlot will be deleted**
- **No ScheduleSlot will be modified**
- Slots remain assigned to the same TeachingTask
- Room assignment (null) unchanged
- Time assignment unchanged

## 10. TeachingTaskClass Link Plan

The following 4 links will be deleted in K18-B:

| TeachingTask ID | ClassGroup ID | ClassGroup Name | TTC ID | Action | Reason |
|----------------:|--------------:|-----------------|-------:|--------|--------|
| 168 | 22 | 2024级钢铁智能冶金技术1班（高本贯通） | 349 | DELETE | Cross-cohort parser error |
| 174 | 22 | 2024级钢铁智能冶金技术1班（高本贯通） | 361 | DELETE | Cross-cohort parser error |
| 176 | 22 | 2024级钢铁智能冶金技术1班（高本贯通） | 366 | DELETE | Cross-cohort parser error |
| 181 | 22 | 2024级钢铁智能冶金技术1班（高本贯通） | 377 | DELETE | Cross-cohort parser error |

Links preserved (not modified):

| TeachingTask ID | ClassGroup ID | ClassGroup Name | TTC ID |
|----------------:|--------------:|-----------------|-------:|
| 168 | 3 | 2025级钢铁智能冶金技术1班（高本贯通） | 346 |
| 168 | 18 | 2025级钢铁智能冶金技术（现场工程师） | 347 |
| 168 | 19 | 2025级智能轧钢技术（现场工程师）+... | 348 |
| 174 | 3 | 2025级钢铁智能冶金技术1班（高本贯通） | 358 |
| 174 | 18 | 2025级钢铁智能冶金技术（现场工程师） | 359 |
| 174 | 19 | 2025级智能轧钢技术（现场工程师）+... | 360 |
| 176 | 3 | 2025级钢铁智能冶金技术1班（高本贯通） | 363 |
| 176 | 18 | 2025级钢铁智能冶金技术（现场工程师） | 364 |
| 176 | 19 | 2025级智能轧钢技术（现场工程师）+... | 365 |
| 181 | 3 | 2025级钢铁智能冶金技术1班（高本贯通） | 374 |
| 181 | 18 | 2025级钢铁智能冶金技术（现场工程师） | 375 |
| 181 | 19 | 2025级智能轧钢技术（现场工程师）+... | 376 |

## 11. Backup / Dry-Run / Apply / Rollback Plan

### Backup

Before K18-B executes any write:

```bash
# Windows
copy prisma\dev.db prisma\dev.db.backup-before-k18-cross-cohort-repair-YYYYMMDDHHMMSS

# Unix
cp prisma/dev.db prisma/dev.db.backup-before-k18-cross-cohort-repair-$(date +%Y%m%d%H%M%S)
```

### Dry-Run

K18-B must support:

```bash
npx.cmd tsx scripts/repair-cross-cohort-data-k18-b.ts --dry-run
```

Expected output:
- List of TTC links to be deleted
- List of TTC links to be preserved
- Affected ScheduleSlot ids (not modified)
- Whether new TeachingTask creation is needed
- Student count recalculation details
- Safety check results

### Apply

Only after dry-run passes:

```bash
npx.cmd tsx scripts/repair-cross-cohort-data-k18-b.ts --apply
```

Prerequisites:
- Dry-run must pass all safety checks
- DB backup must be created
- Human must confirm no active drag/drop/solver on affected tasks

Operations:
1. Delete TTC links: (168,22), (174,22), (176,22), (181,22)
2. Verify remaining classGroups per task are non-empty
3. Verify ScheduleSlots are preserved
4. Optionally update remark field (remove 2024级 reference)
5. No new TeachingTask creation for CG 22 in this phase (manual review first)

### Rollback

Primary method: Restore DB from backup

```bash
# Windows
copy prisma\dev.db.backup-before-k18-cross-cohort-repair-YYYYMMDDHHMMSS prisma\dev.db
```

Alternative method: Re-insert deleted TTC links

```sql
INSERT INTO TeachingTaskClass (teachingTaskId, classGroupId) VALUES (168, 22);
INSERT INTO TeachingTaskClass (teachingTaskId, classGroupId) VALUES (174, 22);
INSERT INTO TeachingTaskClass (teachingTaskId, classGroupId) VALUES (176, 22);
INSERT INTO TeachingTaskClass (teachingTaskId, classGroupId) VALUES (181, 22);
```

Recommended: DB backup restore (primary) — simpler and more reliable.

## 12. Post-Fix Validation Plan

K18-B repair后必须运行：

| Command | Expected Result |
|---------|----------------|
| `npx.cmd tsx scripts/audit-data-quality-classgroup-matching-k17-fix-a.ts` | No HIGH cross-cohort findings for tasks 168/174/176/181 |
| `npx.cmd tsx scripts/review-cross-cohort-classgroup-decisions-k17-fix-b.ts` | Tasks 168/174/176/181 no longer LIKELY_ERROR |
| `npx.cmd tsx scripts/plan-cross-cohort-data-repair-k18.ts` | 0 repair candidates remaining |
| `npx.cmd tsx scripts/audit-schedule-mutation-server-guards.ts` | No new findings |
| `npx.cmd tsx scripts/audit-teaching-task-mutation-semantic-guards.ts` | No new findings |
| `npx.cmd tsx scripts/verify-schedule-mutation-client-preflight-fix.ts` | All checks pass |
| `npm.cmd run build` | Build succeeds |
| `npm.cmd run test:auth-foundation` | 53 passed / 1 failed (pre-existing) |

Post-repair checks:
- Tasks 168/174/176/181 no longer contain ClassGroup 22
- ClassGroup 22 not orphaned (still has tasks 198-208)
- ScheduleSlots 218/226/228/233 preserved
- No TeachingTask deleted
- No ImportBatch modified
- Task 37 unchanged

## 13. Safety Checks

1. Remove only TTC links — never delete TeachingTask or ScheduleSlot
2. Verify each task has at least 1 classGroup remaining after removal
3. Verify ClassGroup 22 has other tasks — not orphaned
4. No ScheduleAdjustment references affected TTC links
5. Backup DB before any write operation
6. Dry-run must pass before apply
7. Freeze drag/drop/solver/export on affected tasks during repair

## 14. Risks and Open Questions

### Risks

- **studentCount change:** Removing CG 22 reduces studentCount from 68 to 38 per task. This affects solver capacity constraints. If the 2024级 class should legitimately attend these courses, the student count will be incorrect after repair.
- **No new task created:** K18-B does not create new TeachingTask for CG 22 for these 4 courses. If the 2024级 class should have its own task, that requires a separate planning phase.
- **remark field:** The remark "2024级钢铁智能冶金技术1班（高本贯通）" will become misleading after the link is removed. Consider updating or clearing it.

### Open Questions

1. Should CG 22 have standalone tasks for 机械制图 (赵春超/张红梅), 电子技术 (许进), and 传感器与检测技术 (张旭)?
2. If yes, should these be created in K18-B or deferred to a later phase?
3. Should the remark field be updated after repair?
4. Should the import matching logic be modified to prevent future cross-cohort merges?

## 15. Recommended Next Stage

**K18-B-CROSS-COHORT-DATA-REPAIR-EXECUTE**

Scope:
1. Create `scripts/repair-cross-cohort-data-k18-b.ts` with `--dry-run` and `--apply` flags
2. Implement backup creation before apply
3. Execute dry-run → verify → apply workflow
4. Run post-fix validation
5. Verify all safety checks pass
6. Update remark fields if needed
7. Decide on CG 22 standalone task creation (manual review)

## 16. Unmodified Scope

本阶段未修改以下内容：

- Prisma schema
- prisma/dev.db
- TeachingTask / TeachingTaskClass / ClassGroup / ScheduleSlot 数据
- API route
- Import logic
- Class group matching logic
- Frontend
- Solver / Parser
- Seed files
- Role mapping / Permission keys
- 任何业务数据

## 17. Verification Results

| Script / Command | Result |
|-----------------|--------|
| plan-cross-cohort-data-repair-k18 | PASS — 4 repair candidates, 1 excluded, 0 blocking |
| review-cross-cohort-classgroup-decisions-k17-fix-b | PASS — LIKELY_ERROR=4, NEEDS_SOURCE_REVIEW=1 |
| audit-data-quality-classgroup-matching-k17-fix-a | PASS — HIGH=1, MEDIUM=9, LOW=4, INFO=2 |
| audit-remaining-risk-backlog-k17 | PASS — MEDIUM=5, LOW=6, INFO=2, BLOCKING=NO |
| audit-schedule-mutation-server-guards | PASS — HIGH=0, MEDIUM=0, LOW=3 |
| audit-teaching-task-mutation-semantic-guards | PASS — HIGH=0, MEDIUM=0, LOW=2 |
| verify-schedule-mutation-client-preflight-fix | PASS — 23 passed, 0 failed |
| build | PASS |
| lint | PASS — 310 problems (pre-existing), no new errors |
| test:auth-foundation | PASS — 53 passed, 1 failed (pre-existing) |
