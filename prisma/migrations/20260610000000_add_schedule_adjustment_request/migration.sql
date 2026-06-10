-- CreateTable: ScheduleAdjustmentRequest
-- K28-A-USER-ADJUSTMENT-APPROVAL-FLOW-IMPLEMENTATION
--
-- Stores user-submitted adjustment requests. Statuses (PENDING | APPROVED |
-- REJECTED | CANCELLED) are kept as String because SQLite does not support
-- native enums. The value set is enforced in the application layer.
--
-- This migration is additive only:
--   - creates ScheduleAdjustmentRequest
--   - back-relation fields on Semester / ScheduleSlot / TeachingTask / User /
--     ScheduleAdjustment are VIRTUAL in Prisma (no schema change required
--     for these).
--
-- The application layer is responsible for:
--   - enforcing the status value set
--   - never allowing USER to write a PENDING request that immediately creates
--     an ACTIVE ScheduleAdjustment
--   - never allowing direct mutation of ScheduleSlot from a USER request
--   - re-running dry-run before any APPROVE

-- 1. Create the new table
CREATE TABLE "ScheduleAdjustmentRequest" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "semesterId" INTEGER NOT NULL,
    "sourceScheduleSlotId" INTEGER NOT NULL,
    "teachingTaskId" INTEGER NOT NULL,
    "sourceWeek" INTEGER,
    "sourceDayOfWeek" INTEGER,
    "sourceSlotIndex" INTEGER,
    "sourceRoomId" INTEGER,
    "targetWeek" INTEGER NOT NULL,
    "targetDayOfWeek" INTEGER NOT NULL,
    "targetSlotIndex" INTEGER NOT NULL,
    "targetRoomId" INTEGER,
    "reason" TEXT,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "submittedByUserId" INTEGER NOT NULL,
    "submittedByNameSnapshot" TEXT,
    "submittedByRoleSnapshot" TEXT,
    "reviewedByUserId" INTEGER,
    "reviewedByNameSnapshot" TEXT,
    "reviewedAt" DATETIME,
    "reviewNote" TEXT,
    "approvedAdjustmentId" INTEGER,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "ScheduleAdjustmentRequest_semesterId_fkey" FOREIGN KEY ("semesterId") REFERENCES "Semester" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "ScheduleAdjustmentRequest_sourceScheduleSlotId_fkey" FOREIGN KEY ("sourceScheduleSlotId") REFERENCES "ScheduleSlot" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "ScheduleAdjustmentRequest_teachingTaskId_fkey" FOREIGN KEY ("teachingTaskId") REFERENCES "TeachingTask" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "ScheduleAdjustmentRequest_submittedByUserId_fkey" FOREIGN KEY ("submittedByUserId") REFERENCES "User" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "ScheduleAdjustmentRequest_reviewedByUserId_fkey" FOREIGN KEY ("reviewedByUserId") REFERENCES "User" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "ScheduleAdjustmentRequest_approvedAdjustmentId_fkey" FOREIGN KEY ("approvedAdjustmentId") REFERENCES "ScheduleAdjustment" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- 2. Unique index for approvedAdjustmentId
CREATE UNIQUE INDEX "ScheduleAdjustmentRequest_approvedAdjustmentId_key" ON "ScheduleAdjustmentRequest"("approvedAdjustmentId");

-- 3. Performance indexes
CREATE INDEX "ScheduleAdjustmentRequest_semesterId_idx" ON "ScheduleAdjustmentRequest"("semesterId");
CREATE INDEX "ScheduleAdjustmentRequest_status_idx" ON "ScheduleAdjustmentRequest"("status");
CREATE INDEX "ScheduleAdjustmentRequest_submittedByUserId_idx" ON "ScheduleAdjustmentRequest"("submittedByUserId");
CREATE INDEX "ScheduleAdjustmentRequest_reviewedByUserId_idx" ON "ScheduleAdjustmentRequest"("reviewedByUserId");
CREATE INDEX "ScheduleAdjustmentRequest_sourceScheduleSlotId_idx" ON "ScheduleAdjustmentRequest"("sourceScheduleSlotId");
