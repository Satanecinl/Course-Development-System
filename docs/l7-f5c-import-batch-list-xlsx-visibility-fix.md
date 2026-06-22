# L7-F5C-IMPORT-BATCH-LIST-XLSX-VISIBILITY-FIX

> Stage: `L7-F5C-IMPORT-BATCH-LIST-XLSX-VISIBILITY-FIX`
> Date: 2026-06-22
> Status: **CLOSED** (pending browser validation)

## 一、Browser failure summary

User reported: `/admin/import` shows 38 batches, list up to #38. ImportBatch #39 and #40 not visible.

## 二、Root cause

**Two-layer issue:**

1. **API semesterId filter** (`src/app/api/admin/import/batches/route.ts`):
   - API calls `resolveSchedulerSemester()` (active semester = id=1)
   - Query filters `where: { semesterId: semester.id }` (= id=1)
   - ImportBatch #39/#40 have `semesterId = 4` → excluded entirely
   - **This was the primary visibility blocker**

2. **UI status recognition** (`import-management-content.tsx`):
   - `STATUS_LABELS` / `STATUS_VARIANTS` / `STATUS_GROUPS` / stats did not recognize `'APPLIED'` status
   - Even if returned, batches would fall through filters and stats counters

## 三、Fix summary

| File | Fix |
|---|---|
| `src/app/api/admin/import/batches/route.ts` | Removed `semesterId` filter; return all batches across all semesters |
| `src/app/admin/import/import-management-content.tsx` | Added `'APPLIED'` and `'COMPLETED'` to `STATUS_LABELS`, `STATUS_VARIANTS`, `STATUS_GROUPS`; included in stats calculation |
| `src/types/import.ts` | Added `strategy` field to `ImportBatchListItem` |
| `import-management-content.tsx` table | Added "类型" (Type) column showing `XLSX_COURSE_SETTING_NEW_TEMPLATE` → "新版Excel课程设置" |

## 四、DB read-only confirmation

| Check | Value |
|---|---|
| ImportBatch #40 | APPLIED, tasks=248, slots=0 |
| ImportBatch #39 | APPLIED, tasks=0 (untouched) |
| Course | 352 |
| Teacher | 220 |
| ClassGroup sem4 | 36 |
| TeachingTask sem4 | 248 |
| ScheduleSlot sem4 | 0 |

No DB writes during L7-F5C.

## 五、Browser validation

After deployment, user should verify:
1. `/admin/import` shows 40+ batches (was 38)
2. ImportBatch #40 visible with status "已应用"
3. #40 type shows "新版Excel课程设置"
4. #40 task count = 248
5. #40 slot count = 0
6. Stats count includes #39/#40 in "已确认/已应用"
