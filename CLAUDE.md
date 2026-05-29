# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

高校排课系统 (College Course Scheduling System) for 工程应用技术学院. A Next.js 16 app that parses Word `.docx` course schedules, stores them in SQLite via Prisma, and provides a drag-and-drop schedule dashboard with conflict detection.

**This is Next.js 16** — breaking changes from earlier versions. Read guides in `node_modules/next/dist/docs/` before writing any Next.js code.

## Commands

```bash
npm run dev          # Next.js dev server (localhost:3000)
npm run build        # Production build
npm run lint         # ESLint

# Data pipeline
python scripts/parse_schedule.py "../2026年春季学期课程表(0420).docx" -o output.json -v
python test_parse.py                                # Run 7 parser unit tests

# Database
npx prisma db push --force-reset --skip-generate     # Reset + sync schema
npx tsx scripts/seed_db.ts                           # Seed from output.json (legacy CLI)

# Import pipeline tests
npm run test:import-quality                          # Quality regression test
npm run test:confirm-import-dry-run                  # Dry-run invariant test
npm run test:confirm-import-rollback                 # Transaction rollback test
npm run test:confirm-api-guards                      # API guard test (no real import)

# Scheduler tests
npm run test:capacity                                # Capacity diagnostics
npm run test:diagnostics                             # Score diagnostics + solver
npm run test:solver                                  # Full solver run

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
                                    /dashboard ── drag-and-drop grid
                                    /admin/db ── CRUD admin panel
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

- **ClassGroup** — `name` unique, `studentCount`, `advisorName`, `advisorPhone`
- **Teacher** — `name` unique
- **Course** — `name` unique
- **Room** — `name` unique, `building`, `capacity` (default 50), `type` (default NORMAL)
- **TeachingTask** — links Course + Teacher(nullable), stores `weekType`/`startWeek`/`endWeek`/`remark`, `importBatchId`
- **ScheduleSlot** — links TeachingTask + Room(nullable), `dayOfWeek`, `slotIndex` (1-6), `importBatchId`
- **TeachingTaskClass** — many-to-many TeachingTask ↔ ClassGroup (enables 合班)
- **ImportBatch** — import tracking: `status` (pending/confirming/confirmed/failed/rolled_back), `parsedJsonPath`, `createdTaskCount`, `createdSlotCount`, `warningsJson`, `confirmedAt`, `errorMessage`

### Frontend (Next.js App Router)

- **`src/store/scheduleStore.ts`** — Zustand store: `fetchSchedule()`, `moveItem()` with client-side conflict check via `/api/conflict-check`
- **`src/lib/conflict.ts`** — Pure week-overlap math (`expandWeeks`, `checkWeekOverlap`)
- **`src/lib/conflict-check.ts`** — Server-side conflict detection: room, teacher, class, and capacity checks on move
- **`src/components/schedule-grid.tsx`** — @dnd-kit drag-and-drop grid rendering the schedule
- **`src/components/schedule-sidebar.tsx`** — Filter sidebar (by class/teacher/room)
- **`/dashboard`** — Main schedule dashboard with drag-and-drop
- **`/admin/db`** — CRUD admin panel for all entity tables

### Scheduler (`src/lib/scheduler/`)

- **`data-loader.ts`** — Loads all scheduling data into memory. Null-safe: skips `teacherId=null` in slotsByTeacher, skips `roomId=null` in slotsByRoom.
- **`score.ts`** — HC1-HC5 (hard) + SC1-SC4 (soft) scoring. Null-safe: `roomId ?? 0` → room=0 skipped in HC1/HC4/HC5; `teacherId != null` check skips HC2.
- **`capacity.ts`** — `getTaskStudentCount()` with fallback 50 per class, `getEligibleRoomsByCapacity()`
- **`capacity-diagnostics.ts`** — Capacity conflict detection and reporting
- **`diagnostics.ts`** — Score summary printing

### Admin UI (`src/components/admin-db/` + `src/lib/admin-db/`)

- **`admin-sidebar.tsx`** / **`admin-toolbar.tsx`** / **`admin-data-table.tsx`** — Pure display components
- **`teaching-task-dialog.tsx`** — TeachingTask dialog. `teacherId: number | null` (nullable, placeholder="选择教师（可选）")
- **`schedule-slot-dialog.tsx`** — ScheduleSlot dialog. `roomId: number | null` (nullable, placeholder="选择教室（可选）")
- **`columns.ts`** — Column definitions. Null teacher/room displays as `'-'`
- **`config.ts`** — Table config, form fields, WEEK_TYPES

### Key Patterns

- **TimeSlot mapping**: `"1,2"→1`, `"3,4"→2`, …, `"9,10"→5`, `"11,12"→6` (also handles corrupted `"11,50"` → 6)
- **Ghost space removal**: `re.sub(r'(?<=[一-龥])\s+(?=[一-龥])', '', text)` — strips intra-Chinese spaces from Word
- **合班 auto-merge**: First tries exact `contains` match on keywords extracted from remarks like `"与森防合班"`, then falls back to character-subsequence matching (e.g., `森`+`防` → `森林草原防火技术1班`)
- **Null teacher/room**: `teacherId=null` / `roomId=null` for business-empty records (体育无教师, 校外实训无教室). No fake entities created. Scheduler skips conflict checks for null values.
- **Import safety**: Atomic `pending→confirming` via `updateMany({ where: { status: 'pending' } })`. Confirmed batch guard blocks duplicate imports. Transaction rollback on failure.

## Current Database State (2026-05-27)

- 37 ClassGroups, 84 Teachers, 123 Courses, 53 Rooms
- 497 TeachingTasks, 785 TeachingTaskClasses, 630 ScheduleSlots
- 1 confirmed ImportBatch (id=1, createdTaskCount=56, createdSlotCount=189)
- Backup: `prisma/dev.db.backup-before-import-20260527204043`
