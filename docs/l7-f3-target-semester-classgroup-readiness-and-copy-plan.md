# L7-F3-TARGET-SEMESTER-CLASSGROUP-READINESS-AND-COPY-PLAN

> Stage: `L7-F3-TARGET-SEMESTER-CLASSGROUP-READINESS-AND-COPY-PLAN`
> Date: 2026-06-22
> Status: **CLOSED**

## 一、Target Semester Readiness

| Field | Value |
|---|---|
| targetSemesterId | 4 |
| name | 2025-2026秋季学期 (2025-2) |
| isActive | false |
| ClassGroup count | **0** |
| TeachingTask count | 0 |
| ScheduleSlot count | 0 |
| ImportBatch count | 1 (empty #39) |
| can run L7-F apply | **NO** |

## 二、Semester / ClassGroup Distribution

| Semester | ClassGroups | TeachingTasks | ScheduleSlots | ImportBatches |
|---|---|---|---|---|
| 1 (2025-2026春季, LEGACY-DEFAULT, active) | **36** | 308 | 440 | 38 |
| 2 (2026-2027秋季) | 0 | 0 | 0 | 0 |
| 4 (2025-2026秋季, TARGET) | **0** | 0 | 0 | 1 |

Only semester 1 has ClassGroups. It is the sole source candidate.

## 三、Excel Class Group Demand

- totalCourseRows: 1167
- ClassGroup missing rows: 207 (teacher missing diagnostic, not class group)
- Existing ClassGroup names across all semesters: 36 (all in semester 1)

## 四、ClassGroup Schema Fields

```
id          Int      @id @default(autoincrement())
name        String
studentCount Int?    (nullable)
advisorName String?  (nullable)
advisorPhone String? (nullable)
semesterId  Int      (NOT NULL)
@@unique([semesterId, name])
```

- No major/specialty/grade/duration fields
- Name format: `majorName + classNumber` (e.g. "森林草原防火技术1班")
- Safe to copy: `id` will auto-generate, `name` + `semesterId` stays unique

## 五、Source Semester Candidates

| Source | ClassGroups | Coverage | Risk | Recommendation |
|---|---|---|---|---|
| semester 1 (LEGACY-DEFAULT) | 36 | ~100% | **low** | Best candidate: complete historical data |

## 六、方案比较

### Option A: Use semester 1 as target
- No ClassGroup copy needed
- Risk: may pollute historical semester with new import data
- **Not recommended** if semester semantics matter

### Option B: Copy ClassGroups from semester 1 to semester 4 (RECOMMENDED)
- 36 ClassGroups copied with new IDs
- Same `name` preserved; `semesterId` changed to 4
- Requires: backup + confirm token + transaction
- Risk: studentCount/advisor may need updates
- **Recommended strategy**

### Option C: Derive from Excel
- Too risky: Excel tokens may be incomplete
- Requires human review
- Not recommended for immediate execution

## 七、Recommended Strategy

**Option B**: Controlled ClassGroup copy from semester 1 to semester 4.

Copy all 36 ClassGroups:
- `name` → preserved
- `semesterId` → 4
- `studentCount` → preserved (may need update)
- `advisorName`/`advisorPhone` → preserved

This enables L7-F valid apply trial in the next stage.

## 八、Next Stage

`L7-F4-CONTROLLED-CLASSGROUP-COPY-TO-TARGET-SEMESTER`

Must include:
- DB backup before copy
- Confirm token gate
- Transaction for ClassGroup creation
- Post-copy audit
- Then re-run L7-F valid apply trial

## 九、ImportBatch #39

Untouched. Status: APPLIED. No action needed.

## 十. DB counts

No DB writes during L7-F3. Read-only audit only.
