-- AlterTable: Add 4 additive fields to SchedulingConfig
-- K21-FIX-F-SOLVER-CONFIG-API-IMPLEMENTATION
--
-- All 4 fields are nullable + no default → existing rows are preserved
-- with new columns = null. No historical backfill required.
-- Forward-fill: future CRUD API operations will populate these fields.
--
-- 1. randomSeed Int?        — optional per-config seed for reproducibility
-- 2. solverVersion String?  — optional solver version tag (e.g. "lahc-hard-first-v3")
-- 3. lockedSlotIds String?  — runtime/UI primary lock field (replaces task-level lockedTaskIds)
-- 4. updatedAt DateTime     — Prisma @updatedAt tracking (default now() + auto-update)

ALTER TABLE "SchedulingConfig" ADD COLUMN "randomSeed" INTEGER;
ALTER TABLE "SchedulingConfig" ADD COLUMN "solverVersion" TEXT;
ALTER TABLE "SchedulingConfig" ADD COLUMN "lockedSlotIds" TEXT;
-- updatedAt: existing rows keep their createdAt; new mutations auto-update via Prisma
ALTER TABLE "SchedulingConfig" ADD COLUMN "updatedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP;
