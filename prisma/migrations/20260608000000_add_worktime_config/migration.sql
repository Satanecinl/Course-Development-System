-- CreateTable
CREATE TABLE "WorkTimeConfig" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "semesterId" INTEGER NOT NULL,
    "name" TEXT NOT NULL,
    "isDefault" BOOLEAN NOT NULL DEFAULT false,
    "allowWeekend" BOOLEAN NOT NULL DEFAULT false,
    "lunchStart" TEXT,
    "lunchEnd" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "version" INTEGER NOT NULL DEFAULT 1,
    "effectiveFrom" DATETIME,
    "notes" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "WorkTimeConfig_semesterId_fkey" FOREIGN KEY ("semesterId") REFERENCES "Semester" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "TimeSlotDefinition" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "workTimeConfigId" INTEGER NOT NULL,
    "slotIndex" INTEGER NOT NULL,
    "label" TEXT NOT NULL,
    "startsAt" TEXT,
    "endsAt" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "isTeachingSlot" BOOLEAN NOT NULL DEFAULT true,
    "isLegacyDisplay" BOOLEAN NOT NULL DEFAULT false,
    "sortOrder" INTEGER NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "TimeSlotDefinition_workTimeConfigId_fkey" FOREIGN KEY ("workTimeConfigId") REFERENCES "WorkTimeConfig" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
-- Add workTimeConfigSnapshot to SchedulingRun
CREATE TABLE "new_SchedulingRun" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "configId" INTEGER NOT NULL,
    "semesterId" INTEGER NOT NULL,
    "mode" TEXT NOT NULL DEFAULT 'PREVIEW',
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "operatorId" INTEGER,
    "operatorNameSnapshot" TEXT,
    "startedAt" DATETIME,
    "completedAt" DATETIME,
    "appliedAt" DATETIME,
    "rolledBackAt" DATETIME,
    "rollbackOfRunId" INTEGER,
    "iterations" INTEGER,
    "durationMs" INTEGER,
    "randomSeed" INTEGER,
    "solverVersion" TEXT,
    "hardScore" INTEGER,
    "softScore" INTEGER,
    "hardScoreBefore" INTEGER,
    "softScoreBefore" INTEGER,
    "hardScoreAfter" INTEGER,
    "softScoreAfter" INTEGER,
    "hc1Before" INTEGER,
    "hc2Before" INTEGER,
    "hc3Before" INTEGER,
    "hc4Before" INTEGER,
    "hc1After" INTEGER,
    "hc2After" INTEGER,
    "hc3After" INTEGER,
    "hc4After" INTEGER,
    "resultSnapshot" TEXT,
    "conflictSummary" TEXT,
    "databaseFingerprint" TEXT,
    "previewExpiresAt" DATETIME,
    "changedSlotCount" INTEGER NOT NULL DEFAULT 0,
    "errorMessage" TEXT,
    "workTimeConfigSnapshot" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "SchedulingRun_configId_fkey" FOREIGN KEY ("configId") REFERENCES "SchedulingConfig" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "SchedulingRun_semesterId_fkey" FOREIGN KEY ("semesterId") REFERENCES "Semester" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "SchedulingRun_operatorId_fkey" FOREIGN KEY ("operatorId") REFERENCES "User" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);
INSERT INTO "new_SchedulingRun" ("appliedAt", "changedSlotCount", "completedAt", "configId", "createdAt", "databaseFingerprint", "durationMs", "errorMessage", "hardScore", "hardScoreAfter", "hardScoreBefore", "hc1After", "hc1Before", "hc2After", "hc2Before", "hc3After", "hc3Before", "hc4After", "hc4Before", "id", "iterations", "mode", "operatorId", "operatorNameSnapshot", "previewExpiresAt", "randomSeed", "resultSnapshot", "conflictSummary", "rollbackOfRunId", "rolledBackAt", "semesterId", "softScore", "softScoreAfter", "softScoreBefore", "solverVersion", "startedAt", "status", "updatedAt") SELECT "appliedAt", "changedSlotCount", "completedAt", "configId", "createdAt", "databaseFingerprint", "durationMs", "errorMessage", "hardScore", "hardScoreAfter", "hardScoreBefore", "hc1After", "hc1Before", "hc2After", "hc2Before", "hc3After", "hc3Before", "hc4After", "hc4Before", "id", "iterations", "mode", "operatorId", "operatorNameSnapshot", "previewExpiresAt", "randomSeed", "resultSnapshot", "conflictSummary", "rollbackOfRunId", "rolledBackAt", "semesterId", "softScore", "softScoreAfter", "softScoreBefore", "solverVersion", "startedAt", "status", "updatedAt" FROM "SchedulingRun";
DROP TABLE "SchedulingRun";
ALTER TABLE "new_SchedulingRun" RENAME TO "SchedulingRun";
CREATE INDEX "SchedulingRun_semesterId_idx" ON "SchedulingRun"("semesterId");

-- CreateIndex
CREATE UNIQUE INDEX "WorkTimeConfig_semesterId_name_key" ON "WorkTimeConfig"("semesterId", "name");

-- CreateIndex
CREATE INDEX "WorkTimeConfig_semesterId_idx" ON "WorkTimeConfig"("semesterId");

-- CreateIndex
CREATE INDEX "WorkTimeConfig_semesterId_isDefault_idx" ON "WorkTimeConfig"("semesterId", "isDefault");

-- CreateIndex
CREATE UNIQUE INDEX "TimeSlotDefinition_workTimeConfigId_slotIndex_key" ON "TimeSlotDefinition"("workTimeConfigId", "slotIndex");

-- CreateIndex
CREATE INDEX "TimeSlotDefinition_workTimeConfigId_idx" ON "TimeSlotDefinition"("workTimeConfigId");

-- CreateIndex
CREATE INDEX "TimeSlotDefinition_slotIndex_idx" ON "TimeSlotDefinition"("slotIndex");
