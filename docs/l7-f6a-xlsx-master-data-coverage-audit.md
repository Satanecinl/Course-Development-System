# L7-F6A-XLSX-MASTER-DATA-COVERAGE-AUDIT

> Stage: `L7-F6A-XLSX-MASTER-DATA-COVERAGE-AUDIT`
> Date: 2026-06-22
> Status: **CLOSED**

## 一、Stage Summary

Read-only audit comparing teacher text and class group candidates from the course setting Excel against current Teacher table, staff DB, contacts xlsx, and sem4 ClassGroups. No DB writes, no apply, no backup.

## 二、Input Files

All 4 external files verified present.

## 三、DB Baseline

Confirmed: Course=104, Teacher=220, ClassGroup sem4=36, TeachingTask sem4=0, TeachingTaskClass=446, ImportBatch #39 APPLIED (tasks=0), ImportBatch #40 absent.

## 四、Teacher Coverage

| Metric | Value |
|---|---|
| Excel rows total | 1059 |
| Rows with J teacher | 1051 |
| Rows with K teacher | 141 |
| Distinct teachers J | 261 |
| Distinct teachers K | 128 |
| Distinct merged | 261 |
| Current Teacher DB | 220 |
| **Matched current** | **213** (81.6%) |
| **Missing current** | **48** |
| Ambiguous current | 0 |
| Staff DB persons | 436 |
| Matched in staff DB | 226 (86.6%) |
| **Missing but staff DB match** | **16** |
| Contacts persons | 436 |
| Matched in contacts | 226 (86.6%) |
| **Missing but contacts match** | **16** |

**Conclusion**: 261 distinct teachers needed. 213 (81.6%) already in Teacher table. 48 missing: 16 found in staff DB/contacts (need import), 32 not found in any source (likely external/part-time not in staff roster).

## 五、ClassGroup Coverage

| Metric | Value |
|---|---|
| Excel ClassGroup candidates | 126 |
| sem4 ClassGroup count | 36 |
| Matched sem4 | 0 |
| Missing sem4 | **126** |
| Coverage rate | **0.0%** |

**Conclusion**: sem4 has 36 ClassGroups (copied from sem1 in L7-F4), but the Excel course setting template identifies 126 distinct class group candidates. **None match.** This is likely because the Excel's major/class text doesn't match sem4 ClassGroup naming (sem4 ClassGroups came from sem1 historical data, while Excel reflects the new semester's actual class structure).

## 六、Attribution Matrix

| Factor | Status |
|---|---|
| Teacher DB incomplete | **YES** — 48 missing, 16 in staff DB |
| Teacher parser/resolution broken | **NO** — L7-F5 parser was not tested against correct master data |
| ClassGroup DB incomplete | **YES** — 126 Excel candidates, 0 matched in sem4 |
| ClassGroup resolution heuristic unsafe | **YES** — confirmed by L7-F5 (avg 21.77 per task) |
| Apply hard gate missing | **YES** — L7-F5 allowed teacherId=null through |

## 七、L7-F5 Root Cause Conclusion

L7-F5 failed due to **both** incomplete master data **and** unsafe resolution logic:

1. **Teacher**: 48 missing teachers → auto-resolve failed for those rows → teacherId=null
2. **ClassGroup**: sem4 ClassGroups (from sem1) don't match Excel class structure → auto-resolve over-matched with broad substring heuristic
3. **Hard gate**: apply service allowed teacherId=null to pass through

## 八、Next-Stage Recommendation

**`L7-F6B-MASTER-DATA-IMPORT-PLAN-FROM-STAFF-AND-MAJOR-SOURCES`**

Both Teacher and ClassGroup master data are incomplete. Next stage should:
1. Plan import of 16 known missing teachers from staff DB
2. Plan ClassGroup import from Excel candidates (126 classes)
3. Add teacher/classGroup resolution hard gates to apply service
4. Add dry-run proof requirement before any retry apply

## 九、Privacy / File Boundary

- rawIncluded: false
- All docs/json contain aggregate/hash/count only
- No raw teacher names, phone numbers, emails, or class names in committed files
- External .db and .xlsx files not committed to git
