# L7-F6B-MASTER-DATA-IMPORT-PLAN-FROM-STAFF-AND-MAJOR-SOURCES

> Stage: `L7-F6B-MASTER-DATA-IMPORT-PLAN-FROM-STAFF-AND-MAJOR-SOURCES`
> Date: 2026-06-22
> Status: **CLOSED**

## 一、Stage Summary

Read-only planning stage generating Teacher and ClassGroup import plans from external data sources for controlled master data write in L7-F6C. No DB writes, no apply, no backup.

## 二、DB Baseline

Confirmed: Course=104, Teacher=220, ClassGroup sem4=36, TeachingTask sem4=0, TeachingTaskClass=446, ImportBatch #39 APPLIED (tasks=0), ImportBatch #40 absent.

## 三、Teacher Import Plan

| Metric | Value |
|---|---|
| Excel distinct teachers | 261 |
| Current Teacher matched | 213 (81.6%) |
| Current Teacher missing | **48** |
| Import from staff DB + contacts | **16** |
| Manual external/unknown | **32** |

### 16 staff/contacts matched teachers
- All 16 found in **both** staff DB and contacts (high confidence)
- Action: `IMPORT_FROM_STAFF_DB_AND_CONTACTS`
- Source confidence: HIGH
- These can be written to Teacher table in L7-F6C

### 32 external/unknown teachers
- Not found in staff DB or contacts
- Likely external part-time, adjunct, or name-entry variations
- Action: `MANUAL_CONFIRM_EXTERNAL_TEACHER`
- Source confidence: MANUAL_REQUIRED
- These need human confirmation before import

## 四、ClassGroup Import Plan

| Metric | Value |
|---|---|
| Excel ClassGroup candidates | **440** |
| sem4 existing ClassGroups | 36 |
| Matched existing sem4 | **0** |
| Planned CREATE_CLASSGROUP | **418** |
| Manual review needed | **22** |
| Major DB validated | 418 |
| Major DB not found | 22 |

### Why 440 instead of 126

L7-F6A counted 126 by `major+classNo` only. L7-F6B counts `cohort+duration+major+classNo` combinations — different grade years and schooling lengths create distinct ClassGroups for the same major.

### 418 CREATE_CLASSGROUP candidates
- Validated against major DB (学院专业数据库)
- Each has: cohort (年级), duration (学制), major (专业), classNo (班号)
- Planned name format: `{grade}级{major}{num}班`

### 22 MANUAL_REVIEW candidates
- Major not found in major DB
- Need human validation before creation

### Legacy sem4 strategy
- **Do not delete** existing 36 ClassGroups in sem4
- Create 418+ new ClassGroup candidates
- Existing 36 remain untouched
- L7-F apply resolution will match only exact Excel-plan candidates

## 五、Combined Decision

| Field | Value |
|---|---|
| canProceedToTeacherWrite | **PARTIAL** (16 from staff/contacts) |
| canProceedToClassGroupWrite | **true_with_review_required** (418 create + 22 review) |
| canProceedOverall | **YES** (with human decisions) |
| Required human decisions | 4 |

### Required Human Decisions
1. 32 external/unknown teachers — confirm or skip
2. 22 ClassGroup candidates not in major DB — validate or reject
3. All 440 ClassGroup candidates — human review recommended
4. 36 legacy sem4 ClassGroups — confirmed preserved (not deleted)

## 六、Next Stage Recommendation

**`L7-F6C-CONTROLLED-MASTER-DATA-WRITE-TEACHER-AND-CLASSGROUP`**

Write in two batches:
1. First: 16 high-confidence Teacher records from staff/contacts
2. Then: 418 ClassGroup candidates (after human review of 22 manual-review items)
3. 32 external teachers require user confirmation before write

## 七、Privacy / File Boundary

- rawIncluded: false in all committed docs/json
- No raw teacher names, phone, emails in committed files
- Local raw artifacts: `temp/local-artifacts/l7-f6b/` (gitignored)
- External .db and .xlsx files not committed
