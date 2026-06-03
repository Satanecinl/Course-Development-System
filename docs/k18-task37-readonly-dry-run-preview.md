# K18-E1 Task 37 Read-Only Dry-Run Preview

Generated: 2026-06-03

## 1. Background

K18-C source artifact review concluded that TeachingTask 37's cross-cohort grouping is LIKELY_ERROR (MEDIUM confidence). K18-D1 confirmed the current DB state. K18-D2 previewed the candidate state. This document provides a read-only dry-run preview of what would happen if the suspected error link were removed — without executing any changes.

## 2. Goal

Preview the hypothetical state of TeachingTask 37 after removing TTC link 94 (ClassGroup 35), with comprehensive safety checks, to validate that the repair would be safe and complete.

## 3. Scope

- Read-only dry-run preview only
- No database modifications
- No execution script generation
- No SQL/apply/rollback instructions

## 4. Input Evidence

- K18-D2 preview JSON: candidate state preview
- K18-D1 inspection JSON: task 37 current DB state
- K18-C review JSON: LIKELY_ERROR decision
- DB direct queries: verified current state

## 5. Current State

| Field | Value |
|-------|-------|
| TeachingTask ID | 37 |
| Course | 习近平新时代中国特色社会主义思想概论 |
| Teacher | 房忠敏 |
| ImportBatch | id=1, status=confirmed |
| Semester | id=1 (既有数据默认学期) |
| Remark | 2024级森林草原防火技术1班 |

**Current ClassGroup Links:**

| TTC ID | CG ID | ClassGroup Name | Cohort Year | Students |
|---:|---:|---|---:|---:|
| 92 | 3 | 2025级钢铁智能冶金技术1班（高本贯通） | 2025 | 30 |
| 93 | 17 | 2025级森林草原防火技术1班 | 2025 | 31 |
| 94 | 35 | 2024级森林草原防火技术1班 | 2024 | 37 |

- **Current ClassGroup IDs**: [3, 17, 35]
- **Current TTC IDs**: [92, 93, 94]
- **Current Student Count**: 98
- **Current Cohort Years**: [2025, 2024]
- **Current Is Cross-Cohort**: true
- **ScheduleSlot**: id=43, day=1 (Monday), slot=5, room=1号楼虚拟仿真实训室, capacity=100

## 6. Candidate Preview

If TTC link 94 (ClassGroup 35) were excluded:

| Field | Current | Candidate |
|-------|---------|-----------|
| ClassGroup IDs | [3, 17, 35] | [3, 17] |
| TTC IDs | [92, 93, 94] | [92, 93] |
| Student Count | 98 | 61 |
| Cohort Years | [2025, 2024] | [2025] |
| Is Cross-Cohort | true | false |

**Candidate ClassGroups:**

| CG ID | ClassGroup Name | Students |
|---:|---|---:|
| 3 | 2025级钢铁智能冶金技术1班（高本贯通） | 30 |
| 17 | 2025级森林草原防火技术1班 | 31 |

**Link Excluded from Preview:**

| TTC ID | CG ID | ClassGroup Name |
|---:|---:|---|
| 94 | 35 | 2024级森林草原防火技术1班 |

**Preserved Objects:**

| Object | ID | Status |
|--------|---:|--------|
| TeachingTask | 37 | Preserved |
| ScheduleSlot | 43 | Preserved |
| ClassGroup | 3 | Preserved (still linked) |
| ClassGroup | 17 | Preserved (still linked) |
| ClassGroup | 35 | Preserved (unlinked, still exists) |
| ImportBatch | 1 | Preserved |

## 7. Safety Checks

All 19 safety checks passed:

| ID | Pass | Detail |
|----|------|--------|
| task37_exists | ✅ | Task 37 found: 习近平新时代中国特色社会主义思想概论 |
| course_is_xi Jinping | ✅ | Course: 习近平新时代中国特色社会主义思想概论 |
| teacher_is_fangZhongMin | ✅ | Teacher: 房忠敏 |
| importBatch_1_exists | ✅ | ImportBatch: id=1, status=confirmed |
| importBatch_1_confirmed | ✅ | ImportBatch status: confirmed |
| current_cg_ids_include_3_17_35 | ✅ | CG IDs: [3, 17, 35] |
| current_ttc_ids_include_92_93_94 | ✅ | TTC IDs: [92, 93, 94] |
| ttc_94_belongs_to_task37_and_cg35 | ✅ | TTC 94: task=37, cg=35 |
| cg35_exists | ✅ | CG 35: 2024级森林草原防火技术1班 |
| scheduleSlot_43_exists | ✅ | Slot 43 found |
| scheduleSlot_43_belongs_to_task37 | ✅ | Slot 43 belongs to task 37 |
| candidate_keeps_at_least_one_cg | ✅ | Candidate CG count: 2 |
| candidate_keeps_cg_3_and_17 | ✅ | Candidate CG IDs: [3, 17] |
| candidate_preserves_task37 | ✅ | Task 37 preserved |
| candidate_preserves_slot43 | ✅ | Slot 43 preserved |
| candidate_preserves_cg35_standalone | ✅ | CG 35 preserved as standalone ClassGroup (unlinked) |
| d2_json_current_state_matches_db | ✅ | D2 CG IDs: [3, 17, 35], DB CG IDs: [3, 17, 35] |
| k18c_decision_is_likely_error | ✅ | K18-C decision: LIKELY_ERROR |
| no_db_changes_made | ✅ | Script is read-only, no mutations performed |

## 8. Expected Impact

- **Display**: 候选 display 只包含 2025级钢铁智能冶金技术1班（高本贯通）和 2025级森林草原防火技术1班，不再包含 2024级森林草原防火技术1班
- **Adjustment**: Slot 43 仍属于 task37，调课功能不受影响
- **Export**: 候选 export 只包含 CG3 和 CG17，不再包含 CG35
- **Solver Input**: 候选 student count 61，以 61 人计算容量约束
- **Capacity**: Room capacity 100 >= 61 students ✓

## 9. Non-Mutation Guarantee

- 是否修改 DB：否
- 是否创建 execution script：否
- 是否提供 execution switch：否
- 是否执行 write API：否
- 是否修改业务数据：否

## 10. Open Questions

1. 是否需要为 2024级森林草原防火技术1班 创建独立 TeachingTask？
   - K18-C 建议: 否，除非人工确认该班级确实需要该课程
2. ClassGroup 35 的学生是否需要在其他课程中重新安排？

## 11. Suggested Next Stage

**K18-E2-TASK37-CONTROLLED-EXECUTION-PREP**

K18-E2 would:
1. Create DB backup
2. Execute controlled dry-run with real transaction validation
3. Prepare for actual TTC link 94 deletion
4. Post-fix validation planning

## 12. Unmodified Scope

This preview made no changes to:
- Prisma schema
- prisma/dev.db
- Any business data
- Any API route, import logic, frontend, solver, or parser

## 13. Verification Results

See terminal output above — all 19 safety checks passed.
