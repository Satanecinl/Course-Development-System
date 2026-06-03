# K18-D2 Task 37 Read-Only Action Preview

Generated: 2026-06-03

## 1. Background

K18-C source artifact review concluded that TeachingTask 37's cross-cohort grouping is LIKELY_ERROR (MEDIUM confidence). K18-D1 confirmed the current DB state. This document previews the candidate state if the suspected error link were removed — without executing any changes.

## 2. Goal

Preview the hypothetical state of TeachingTask 37 after removing the ClassGroup 35 (2024级森林草原防火技术1班) link, to validate that the repair would be safe and complete.

## 3. Scope

- Read-only preview only
- No database modifications
- No repair script generation
- No SQL/apply/rollback instructions

## 4. Input Evidence

- K18-D1 inspection JSON: task 37 current DB state
- K18-C review JSON: LIKELY_ERROR decision
- K18-B execute JSON: repair pattern reference
- K17 review JSON: historical context
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
- **Current Student Count**: 98
- **Current Cohort Years**: [2025, 2024]
- **Current Is Cross-Cohort**: true

**Current ScheduleSlot:**

| Slot ID | Day | Slot | Room ID | Room Name | Capacity |
|---:|---:|---:|---:|---|---:|
| 43 | 1 (Monday) | 5 | 18 | 1号楼虚拟仿真实训室 | 100 |

## 6. Candidate State

If TTC link id=94 (ClassGroup 35) were removed:

| Field | Current | Candidate |
|-------|---------|-----------|
| ClassGroup IDs | [3, 17, 35] | [3, 17] |
| Student Count | 98 | 61 |
| Cohort Years | [2025, 2024] | [2025] |
| Is Cross-Cohort | true | false |

**Candidate ClassGroups:**

| CG ID | ClassGroup Name | Students |
|---:|---|---:|
| 3 | 2025级钢铁智能冶金技术1班（高本贯通） | 30 |
| 17 | 2025级森林草原防火技术1班 | 31 |

## 7. Object Preservation

The following objects would remain unchanged:

| Object | ID | Status |
|--------|---:|--------|
| TeachingTask | 37 | Preserved |
| ScheduleSlot | 43 | Preserved |
| ClassGroup | 3 | Preserved (still linked) |
| ClassGroup | 17 | Preserved (still linked) |
| ClassGroup | 35 | Preserved (unlinked, still exists) |
| ImportBatch | 1 | Preserved |

## 8. Expected Impact

- **Display**: 修复后只显示 2 个班级 (2025级钢铁智能冶金技术1班（高本贯通）+ 2025级森林草原防火技术1班), studentCount=61
- **Adjustment**: Slot 43 保持原位，调课功能不受影响
- **Export**: Excel 导出不再包含 2024级森林草原防火技术1班
- **Solver Input**: 以 61 人计算容量约束
- **Capacity**: Room capacity 100 >= 61 students ✓

## 9. Consistency Checks

All 10 checks passed:

| Check | Result |
|-------|--------|
| task37_exists | ✅ |
| course_is_xi Jinping | ✅ |
| teacher_is_fangZhongMin | ✅ |
| current_links_include_ttc_92_93_94 | ✅ |
| current_classgroup_ids_include_3_17_35 | ✅ |
| scheduleSlot_43_exists | ✅ |
| scheduleSlot_43_belongs_to_task37 | ✅ |
| task37_only_remaining_cross_cohort | ✅ |
| k18c_decision_is_likely_error | ✅ |
| d1_json_consistent_with_db | ✅ |

## 10. Open Questions

1. 是否需要为 2024级森林草原防火技术1班 创建独立 TeachingTask？
   - K18-C 建议: 否，除非人工确认该班级确实需要该课程
2. ClassGroup 35 的学生是否需要在其他课程中重新安排？

## 11. Suggested Next Stage

**K18-E-TASK37-DATA-REPAIR-EXECUTE**

K18-E would:
1. Create DB backup
2. Execute dry-run validation
3. Apply: delete TTC link id=94 (teachingTaskId=37, classGroupId=35)
4. Post-fix validation: verify CG 35 removed, CG 3/17 preserved, slot 43 preserved

## 12. Unmodified Scope

This preview made no changes to:
- Prisma schema
- prisma/dev.db
- Any business data
- Any API route, import logic, frontend, solver, or parser

## 13. Verification Results

See terminal output above — all 10 consistency checks passed.
