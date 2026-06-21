# L6-E1C Teacher Reference Controlled Sync Apply

> Stage: **L6-E1C-TEACHER-REFERENCE-SCHEMA-AND-CONTROLLED-SYNC-APPLY**
> Status: **PASS** (controlled apply)

## 1. Schema / Migration
- Migration: `20260621200000_add_teacher_staff_reference_fields_l6_e1c`
- Fields added: `employeeNo, department, position, rank, phone, officePhone`
- All new columns nullable.
- No unique / index / relation added.
- No drop / delete / destructive change.

## 2. Source Plan
- L6-E1B raw plan sha256: `eff6f6913ec00cef3c72b43d4ae62710bb67810136158e12ff3ace0b4e14beac`
- Total candidates: 357
- Teacher count before: 84
- Teacher count after: 218

## 3. Apply Result
| metric | value |
|---|---|
| created Teacher | 134 |
| updated existing Teacher | 68 |
| skipped (needsManualReview + skipCandidate + alreadyExists w/ duplicate Staff) | 155 |
| conflicts (existing non-empty field differs from Staff) | 0 |
| duplicateStaffNameGroups | 3 |
| invalidTokens | 1 |

## 4. Local Raw Artifact
- Path: `temp/local-artifacts/l6-e1c/teacher-reference-controlled-sync-apply.raw.local.json`
- sha256: `8b35687f349846b89a7545dc282c126f14474e83adfd7489375c72e42172237e`
- Contains raw personal data: YES (local only)
- Git tracked: NO (under gitignored temp/)

## 5. DB Backup
- Path: `prisma/dev.db.backup-before-l6-e1c-teacher-sync-20260621200605`
- Committed: NO

## 6. Privacy / Isolation
- Committed docs/json contain raw teacher names: NO
- Committed docs/json contain raw phones: NO
- Committed docs/json contain raw employeeNo: NO
- Committed docs/json contain raw departments: NO
- ImportBatch created: NO
- TeachingTask created: NO
- TeachingTaskClass created: NO
- Course / ClassGroup / ScheduleSlot / ScheduleAdjustment touched: NO
- Excel partial import applied: NO

## 7. Next Stage
- L6-E2-XLSX-COURSE-SETTING-PARTIAL-IMPORT-PLAN-IN-PAGE: build a per-page resolution dry-run plan that consumes the now-richer Teacher table.
