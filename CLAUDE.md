# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

高校排课系统 (College Course Scheduling System) for 工程应用技术学院. A Next.js 16 app that parses Word `.docx` course schedules, stores them in SQLite via Prisma, and provides a drag-and-drop schedule dashboard with conflict detection, schedule adjustments (dry-run/apply), and a system settings center.

**This is Next.js 16** — breaking changes from earlier versions. Read guides in `node_modules/next/dist/docs/` before writing any Next.js code.

## Commands

```bash
npm run dev          # Next.js dev server (localhost:3000)
npm run build        # Production build
npm run lint         # ESLint (= "lint": "eslint" in package.json; identical to `npx eslint .`)

# Database
npx prisma db push --force-reset --skip-generate     # Reset + sync schema (destructive; backup first)
npx prisma migrate deploy                             # Apply pending migrations (non-destructive)
npx prisma generate                                   # Regenerate Prisma Client after schema change
npx prisma validate                                    # Validate schema
npx prisma migrate status                              # Check migration status

# Data pipeline
python scripts/parse_schedule.py "../2026年春季学期课程表(0420).docx" -o output.json -v
python test_parse.py                                # Run 7 parser unit tests

# Import pipeline tests
npm run test:import-quality                          # Quality regression test
npm run test:confirm-import-dry-run                  # Dry-run invariant test
npm run test:confirm-import-rollback                 # Transaction rollback test
npm run test:confirm-api-guards                      # API guard test (no real import)

# Scheduler tests
npm run test:capacity                                # Capacity diagnostics
npm run test:diagnostics                             # Score diagnostics + solver
npm run test:solver                                  # Full solver run
npm run test:schedule-adjustment                     # Adjustment dry-run/apply regression
npm run test:schedule-adjustment-api-e2e             # End-to-end API test

# Auth tests
npm run test:auth-foundation                         # 53 auth tests (1 pre-existing failure: ScheduleAdjustment ACTIVE count)

# K26 verification scripts (WorkTime system)
npx tsx scripts/audit-worktime-recommendation-integration-k26-i.ts   # K26-I audit (44 checks)
npx tsx scripts/verify-worktime-settings-ui-acceptance-closeout-k26-h.ts  # K26-H closeout (52 checks)
npx tsx scripts/verify-worktime-runtime-prisma-delegate-k26-h2a.ts  # K26-H2A runtime (15 checks)
npx tsx scripts/verify-worktime-settings-ui-k26-h.ts   # K26-H UI (43 checks)
npx tsx scripts/verify-worktime-api-k26-g.ts          # K26-G API (40 checks)
npx tsx scripts/validate-worktime-schema-k26-f.ts    # K26-F schema (30 checks)
npx tsx scripts/plan-worktime-schema-k26-e.ts         # K26-E plan (34 checks)
npx tsx scripts/verify-static-time-slot-extraction-k26-d.ts  # K26-D helper (39 checks)
npx tsx scripts/audit-time-slot-worktime-settings-k26-c.ts  # K26-C audit (32 checks)
npx tsx scripts/backfill-worktime-default-config-k26-f.ts --dry-run  # Idempotency check

# Real import (writes database — requires explicit confirmation)
CONFIRM_IMPORT=1 npm run confirm:import              # Execute real confirm import
npm run audit:confirmed-import                       # Audit confirmed import metadata
FIX_IMPORT_METADATA=1 npm run fix:confirmed-import-metadata  # Fix metadata if needed
```

## Architecture

```
Word .docx  ──[Python]──>  output.json  ──[Import API]──>  SQLite dev.db
                                                                 │
                                    Next.js App Router ──────────┘
                                    /api/schedule ── GET all items
                                    /api/conflict-check ── POST validation
                                    /api/schedule-adjustments/* ── dry-run/apply/plan/room
                                    /api/admin/worktime-configs/* ── K26 WorkTime CRUD
                                    /dashboard ── drag-and-drop grid
                                    /admin/db ── CRUD admin panel
                                    /admin/settings ── system settings center
```

### Data Pipeline (Python → TypeScript)

- **`scripts/parse_cell.py`** — Core cell parser `parse_cell_content(text)` using room-anchored reverse splitting. Handles: multi-course overlap, 合班 (merged-class) remarks, ghost-space removal, week constraints. Tested against 17 dirty-data samples in `test_parse.py`.
- **`scripts/parse_schedule.py`** — Reads Word tables via `python-docx`, calls `parse_cell_content`, outputs JSON with 585 records (latest run).
- **`scripts/seed_db.ts`** — Legacy CLI seed script. Upserts ClassGroup/Teacher/Course/Room, creates TeachingTask + ScheduleSlot + TeachingTaskClass. Auto-resolves 合班 via character-subsequence fuzzy matching.

### Import Pipeline (`src/lib/import/`)

- **`parse-utils.ts`** — `computeImportParseStats()` and `computeImportParseQuality()`. Tracks missing teacher/room/course/studentCount, duplicate candidates, week constraints.
- **`quality-classifier.ts`** — `classifyImportRecords()`, `classifyMissingTeacher()`, `classifyMissingRoom()`. Classifies issues as LIKELY_BUSINESS_EMPTY / LIKELY_PARSE_BUG / NEED_MANUAL_REVIEW. `canImport` gate blocks on: missing course, duplicates, parse bugs, teacher name suffix, week markers in course.
- **`importer.ts`** — Core import logic:
  - `confirmImportBatchDryRun()` — dry-run plan without writes
  - `simulateConfirmImportBatch()` — real writes in transaction, then rollback
  - `confirmImportBatch()` — real confirm with atomic pending→confirming→confirmed/failed
  - `executeImportInTransaction()` — internal function: upserts entities, creates TeachingTask/ScheduleSlot/TeachingTaskClass

### Import API (`src/app/api/admin/import/`)

- **`parse/route.ts`** — POST parse API. Uploads .docx, runs Python parser, creates pending ImportBatch, saves files to `uploads/imports/`.
- **`confirm/route.ts`** — POST confirm API. Supports `dryRun: true` (returns plan) and `dryRun: false` + `confirmText: "CONFIRM_IMPORT"` (real import).

### Import Scripts (`scripts/`)

- **`test-import-quality.ts`** — Quality regression test with sample checks
- **`test-confirm-import-dry-run.ts`** — Dry-run with 10 invariant checks
- **`test-confirm-import-transaction-rollback.ts`** — Transaction rollback verification
- **`test-confirm-api-guards.ts`** — API guard tests (no real import)
- **`confirm-import-once.ts`** — Real import execution (requires `CONFIRM_IMPORT=1`)
- **`audit-confirmed-import.ts`** — Post-import audit (metadata, null stats, fake entity check)
- **`fix-confirmed-import-metadata.ts`** — Metadata correction (requires `FIX_IMPORT_METADATA=1`)

### Database Schema (`prisma/schema.prisma`)

- **ClassGroup** — `name` unique, `studentCount`, `advisorName`, `advisorPhone`; **K25-C: `semesterId` NOT NULL** (per-semester scoping)
- **Teacher** — `name` unique (global, not per-semester)
- **Course** — `name` unique (global)
- **Room** — `name` unique, `building`, `capacity` (default 50), `type` (default NORMAL)
- **TeachingTask** — links Course + Teacher(nullable), `weekType`/`startWeek`/`endWeek`/`remark`, `importBatchId`; **K25-C: `semesterId` NOT NULL**
- **ScheduleSlot** — links TeachingTask + Room(nullable), `dayOfWeek`, `slotIndex` (1-6 for new writes, 1-7 for historical), `importBatchId`; **K25-C: `semesterId` NOT NULL**; **K26-F: `workTimeConfigSnapshot String?` (reserved for K26-J)**
- **TeachingTaskClass** — many-to-many TeachingTask ↔ ClassGroup (enables 合班)
- **ImportBatch** — import tracking: `status` (pending/confirming/confirmed/failed/rolled_back), `parsedJsonPath`, `createdTaskCount`, `createdSlotCount`, `warningsJson`, `confirmedAt`, `errorMessage`
- **ScheduleAdjustment** — `type`, `week`, `targetWeek`, `originalSlotId`, `newDayOfWeek`/`newSlotIndex`/`newRoomId` (nullable), `status` (ACTIVE/VOID), `semesterId` NOT NULL
- **SchedulingConfig** (K21-FIX-F) — solver config: `maxIterations`, `lahcWindowSize`, `randomSeed`, `solverVersion`, `lockedSlotIds`, `semesterId` NOT NULL
- **SchedulingRun** (K21-FIX-F) — solver run tracking: `mode`/`status`, `iterations`, `randomSeed`, `solverVersion`, `hardScore`/`softScore`/`hc1..hc4`, `resultSnapshot`, `workTimeConfigSnapshot String?` (K26-F), `semesterId` NOT NULL
- **SchedulerRunChange** (K21-FIX-F) — per-slot changes in a run
- **RoomAvailability** — room unavailable windows: `roomId`/`dayOfWeek`/`slotIndex`/`available`/`reason`
- **Semester** (K25) — `name`/`code` (unique)/`academicYear`/`term`/`startsAt`/`endsAt`/`isActive`; parent of 6+ models
- **WorkTimeConfig** (K26-F) — per-semester WorkTime config: `semesterId`, `name`, `isDefault`, `allowWeekend`, `lunchStart`/`lunchEnd` (HH:mm), `isActive`, `version`, `effectiveFrom`, `notes`
- **TimeSlotDefinition** (K26-F) — per-config slot definition: `workTimeConfigId`, `slotIndex` (1-7), `label`, `startsAt`/`endsAt`, `isActive`, `isTeachingSlot`, `isLegacyDisplay`, `sortOrder`; `@@unique([workTimeConfigId, slotIndex])`
- **User / Role / Permission / UserRole / RolePermission / Session** (auth) — RBAC model with 12 permission keys

### Frontend (Next.js App Router)

- **`src/store/scheduleStore.ts`** — Zustand store: `fetchSchedule()`, `moveItem()` with client-side conflict check via `/api/conflict-check`
- **`src/lib/conflict.ts`** — Pure week-overlap math (`expandWeeks`, `checkWeekOverlap`)
- **`src/lib/conflict-check.ts`** — Server-side conflict detection: room, teacher, class, and capacity checks on move
- **`src/components/schedule-grid.tsx`** — @dnd-kit drag-and-drop grid rendering the schedule
- **`src/components/schedule-sidebar.tsx`** — Filter sidebar (by class/teacher/room)
- **`src/components/schedule-adjustment-dialog.tsx`** — Adjustment dialog: dry-run, apply, plan recommendation, room recommendation
- **`/dashboard`** — Main schedule dashboard with drag-and-drop
- **`/admin/db`** — CRUD admin panel for all entity tables
- **`/admin/settings`** — System settings center (K26-A onwards): module navigation + panel routing

### System Settings Center (`src/components/settings/` + `src/lib/settings/`)

- **`settings-center.tsx`** — Top-level layout. Left: module nav (SettingsModuleCard). Right: panel routed by `currentModule.key`.
- **`settings-modules.ts`** — `SETTINGS_MODULES` array. Each module: `key`, `title`, `description`, `status` (`ready`/`planned`/`coming-soon`/`roadmap`), `priority`, `recommendedStage`, `riskLevel`, `notes`.
- **`settings-center.tsx` routing** — `key === 'semester-settings'` → `SemesterSettingsPanel`; `key === 'scheduler-config'` → `SchedulerConfigSettingsPanel`; `key === 'time-slot-worktime'` → `WorkTimeSettingsPanel` (K26-H); other → `PlannedModuleContent` placeholder.
- **Current ready modules**: `semester-settings`, `scheduler-config`, `time-slot-worktime` (K26-H).
- **`getStatusBadge()`** helper maps status to `{ label, color }` for UI.

### WorkTime System (K26)

- **`src/lib/schedule/time-slots.ts`** — K26-D static helper. Source of truth: `VALID_TEACHING_SLOT_INDEXES = [1..5]`, `LEGACY_DISPLAY_SLOT_INDEXES = [6, 7]`, `VALID_PREFERRED_DAY_VALUES = [1..5]`, `WEEKEND_DAY_VALUES = [6, 7]`, `getRecommendationSlotIndexes()` excludes 6/7, `formatTeachingSlotLabel(6) = '11-12节'`, `formatTeachingSlotLabel(7) = '中午'`. **Used by ALL recommendation/UI/score paths** unless explicitly upgraded.
- **`src/lib/worktime/worktime-service.ts`** — K26-G service. `resolveWorkTimeConfig(semesterId?)` returns `{ source: 'database' | 'staticFallback', config, ... }`; `buildStaticFallbackWorkTimeConfig()` returns K26-D-derived fallback. CRUD: `listWorkTimeConfigs`, `getWorkTimeConfig`, `createWorkTimeConfig`, `updateWorkTimeConfig`, `deleteWorkTimeConfig` (with delete protection: default config, last active, used by run snapshot), `activateWorkTimeConfig`. All transactional.
- **`src/lib/worktime/worktime-validation.ts`** — Validation: `semesterId`, `name` (≤100), HH:mm format, slotIndex uniqueness, slot 6/7 cannot be active teaching, legacy display cannot be active teaching, at least one active teaching slot required.
- **`src/lib/settings/worktime-settings-client.ts`** — K26-H UI client: typed fetch wrappers + `getWorkTimeErrorMessage()` (error code → Chinese).
- **`src/app/api/admin/worktime-configs/**`** — K26-G API routes (list/create, get/update/delete, activate, resolved). Permission: `settings:manage`. **CRITICAL: `validateScheduleAdjustmentInput` allows `newSlotIndex ≤ 6` (K26-I audit found this inconsistent with room-rec route's `≤ 5` cap)**.
- **`src/components/settings/worktime-settings-panel.tsx`** — K26-H settings panel (resolved card, config list, slot table, create/edit/delete/activate, semester integration via `useSemesterStore`).
- **`scripts/backfill-worktime-default-config-k26-f.ts`** — Per-semester default config backfill (idempotent). Default: slots 1-5 active teaching, slots 6/7 inactive/non-teaching/legacy display, `allowWeekend=false`.

### Scheduler (`src/lib/scheduler/`)

- **`data-loader.ts`** — Loads all scheduling data into memory. Null-safe: skips `teacherId=null` in slotsByTeacher, skips `roomId=null` in slotsByRoom.
- **`score.ts`** — HC1-HC5 (hard) + SC1-SC4 (soft) scoring. Null-safe: `roomId ?? 0` → room=0 skipped in HC1/HC4/HC5; `teacherId != null` check skips HC2. **SC3 (`slotIndex >= 5`) and SC7 (`dayOfWeek >= 6`) are HARDCODED** — to be parameterized in K26-J.
- **`capacity.ts`** — `getTaskStudentCount()` with fallback 50 per class, `getEligibleRoomsByCapacity()`
- **`capacity-diagnostics.ts`** — Capacity conflict detection and reporting
- **`diagnostics.ts`** — Score summary printing

### Schedule Adjustments (`src/lib/schedule/`)

- **`adjustment-plan-recommendations.ts`** — K24-A4 plan recommendation. `DEFAULT_SLOT_INDEXES = getValidTeachingSlotIndexes()` = [1..5]. `DEFAULT_DAYS_WORKING = [1..5]`, `WEEKEND_DAYS = [6,7]`, `VALID_PREFERRED_DAY_VALUES = [1..5]`. **Currently does NOT consult WorkTime config** (K26-I HIGH gap).
- **`room-recommendations.ts`** — K23-A room recommendation. Walks rooms, checks capacity + Linxiao policy + `checkScheduleConflicts()`. **Currently does NOT consult WorkTime config** (K26-I HIGH gap).
- **`adjustments.ts`** — `validateScheduleAdjustmentInput()` (numeric range 1..7 for day, 1..6 for slot — **inconsistent with K24-A4's 1..5 slot**), `dryRunScheduleAdjustment()`, `createScheduleAdjustment()`. **Currently no WorkTime guard** (K26-I HIGH gap).
- **`conflict-check.ts`** — Pure conflict engine over historical `ScheduleSlot` rows. **WorkTime guard belongs upstream, not here** (K26-I MEDIUM finding).
- **`conflict-rules.ts`** — Pure rule kernel: `isSameTimeSlot`, `isWeekOverlapping`, `isTeacherConflict`, `isRoomConflict`, `isClassGroupConflict`.

### Admin UI (`src/components/admin-db/` + `src/lib/admin-db/`)

- **`admin-sidebar.tsx`** / **`admin-toolbar.tsx`** / **`admin-data-table.tsx`** — Pure display components
- **`teaching-task-dialog.tsx`** — TeachingTask dialog. `teacherId: number | null` (nullable, placeholder="选择教师（可选）")
- **`schedule-slot-dialog.tsx`** — ScheduleSlot dialog. `roomId: number | null` (nullable, placeholder="选择教室（可选）")
- **`columns.ts`** — Column definitions. Null teacher/room displays as `'-'`
- **`config.ts`** — Table config, form fields, WEEK_TYPES

### Auth / RBAC (`src/lib/auth/`)

- **`require-permission.ts`** — `requirePermission(key, request)` → returns `{ user } | { error }`; `requireAnyPermission`, `requireAllPermissions`. Returns `unauthorizedResponse()` / `forbiddenResponse()`.
- **Permission keys** (in `src/lib/auth/types.ts`): `schedule:view`, `schedule:adjust`, `schedule:write`, `data:read`, `data:write`, `data:delete`, `data:export`, `import:manage`, `settings:manage`, `users:manage`, `diagnostics:view`, `teaching-task:write`.
- **Roles**: `ADMIN`, `USER`, `DATA_EXPORTER`.
- **All WorkTime API routes use `settings:manage`**. All semester routes use `settings:manage`. All schedule adjustments use `schedule:adjust`.
- **Semester store** (`src/store/semesterStore.ts`): Zustand store with `currentSemesterId`, `isActiveSemester`, `setCurrentSemester`, `fetchSemesters`, persisted to localStorage.

### Key Patterns

- **TimeSlot mapping**: `"1,2"→1`, `"3,4"→2`, …, `"9,10"→5`, `"11,12"→6` (also handles corrupted `"11,50"` → 6). **slotIndex=6 (11-12节) and slotIndex=7 (中午) are legacy display-only**, not new teaching targets. The K26-D helper enforces this; the K26-D plan recommendation uses this; the K26-H WorkTime settings panel disables `isTeachingSlot` checkbox for slot 6/7.
- **Ghost space removal**: `re.sub(r'(?<=[一-龥])\s+(?=[一-龥])', '', text)` — strips intra-Chinese spaces from Word
- **合班 auto-merge**: First tries exact `contains` match on keywords extracted from remarks like `"与森防合班"`, then falls back to character-subsequence matching (e.g., `森`+`防` → `森林草原防火技术1班`)
- **Null teacher/room**: `teacherId=null` / `roomId=null` for business-empty records (体育无教师, 校外实训无教室). No fake entities created. Scheduler skips conflict checks for null values.
- **Import safety**: Atomic `pending→confirming` via `updateMany({ where: { status: 'pending' } })`. Confirmed batch guard blocks duplicate imports. Transaction rollback on failure.
- **Per-semester scoping (K25-C)**: 6 core models (ClassGroup, TeachingTask, ScheduleSlot, ScheduleAdjustment, SchedulingRun, SchedulingConfig, ImportBatch) all have `semesterId NOT NULL`. Semester store is the UI's source of truth for which semester is "active". Backfilled in K25-C migration.
- **K26 stage-aware verify scripts**: After each K26 stage that adds models/UI/routes, older verify scripts (K26-D, K26-E, K26-F, K26-H2A, K26-G, K26-F1) were updated to accept the new legitimate changes. Each script's N1-N8 checks (no schema change, no migration, no API change, no UI change, no solver change, no score change, no K22 expected change) are **stage-aware** — the check now documents what stage it accepts.
- **Pre-existing auth-foundation failure**: `ScheduleAdjustment ACTIVE = 0 (实际 10)` is a known pre-existing test mismatch. **Do NOT attempt to fix with business data** — leave it for a dedicated stage.

## K26 Stage Progression

- **K26-A** (system settings shell) — settings center layout, module nav. Status: CLOSED.
- **K26-B** (scheduler config settings) — CRUD config in settings center. Status: CLOSED.
- **K26-C** (time-slot audit) — impact analysis for time-slot/day changes. Status: CLOSED.
- **K26-D** (static time-slot extraction) — extracted K24-A4 helper to `src/lib/schedule/time-slots.ts`. Status: CLOSED.
- **K26-E** (WorkTime schema plan) — Option A/B/C comparison. Recommended: hybrid (A baseline + C long-term). Status: CLOSED.
- **K26-F** (WorkTime schema implementation) — `WorkTimeConfig` + `TimeSlotDefinition` models, backfill, migration. Status: CLOSED.
- **K26-G** (WorkTime API) — CRUD + resolved + delete protection. Status: CLOSED.
- **K26-H** (WorkTime settings UI) — panel + dialogs + resolved card. Status: CLOSED.
- **K26-H2A** (runtime Prisma delegate fix) — stale Prisma Client singleton, fixed by dev server restart. Status: CLOSED.
- **K26-H1A** (verification complete) — missing regression补齐, manual validation recorded. Status: CLOSED.
- **K26-I** (recommendation integration audit) — 4 HIGH + 1 MEDIUM + 2 LOW + 1 INFO findings. Status: AUDIT_COMPLETE.
- **K26-I1 / I2 / I3 / I4** (planned) — plan rec / dry-run-apply / room rec / frontend integration.
- **K26-J** (planned) — solver/score integration + K22-after-k26-j fixture.

Each K26 stage MUST:
1. Run the full verification chain before claiming close.
2. Update older verify scripts to accept the new stage's legitimate changes (stage-aware).
3. Not modify `prisma/schema.prisma`, `prisma/migrations/**`, `prisma/dev.db`, solver algorithm, `score.ts`, or K22/K23/K24/K25 expected (unless explicitly that stage's job).
4. Use `prisma/dev.db.backup-before-k26-<stage>-<timestamp>` before any destructive operation.
5. Not commit: `.env`, `.next`, DB backup, `prisma/dev.db`, unrelated generated drift, temp files.

## Current Database State (2026-06-08)

- 2 Semesters (1 active): `2025-2026春季学期` (LEGACY-DEFAULT), `2026-2027学年秋季学期` (2026秋)
- 2 WorkTimeConfig (default, allowWeekend=false, 2 default configs)
- 14 TimeSlotDefinition (7 per config: slots 1-5 active teaching, slots 6/7 legacy display)
- 440 ScheduleSlot (preserved historical data; includes 2 slotIndex=6 rows and 21 weekend rows)
- 37 ClassGroups, 84 Teachers, 123 Courses, 53 Rooms
- 497 TeachingTasks, 785 TeachingTaskClasses
- 1 confirmed ImportBatch
- 8 Prisma migrations (latest: `20260608000000_add_worktime_config`)
