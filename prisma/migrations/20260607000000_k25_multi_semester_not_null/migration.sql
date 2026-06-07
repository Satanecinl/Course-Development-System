-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_ClassGroup" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "name" TEXT NOT NULL,
    "studentCount" INTEGER,
    "advisorName" TEXT,
    "advisorPhone" TEXT,
    "semesterId" INTEGER NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "ClassGroup_semesterId_fkey" FOREIGN KEY ("semesterId") REFERENCES "Semester" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
INSERT INTO "new_ClassGroup" ("advisorName", "advisorPhone", "createdAt", "id", "name", "semesterId", "studentCount", "updatedAt") SELECT "advisorName", "advisorPhone", "createdAt", "id", "name", "semesterId", "studentCount", "updatedAt" FROM "ClassGroup";
DROP TABLE "ClassGroup";
ALTER TABLE "new_ClassGroup" RENAME TO "ClassGroup";
CREATE INDEX "ClassGroup_semesterId_idx" ON "ClassGroup"("semesterId");
CREATE UNIQUE INDEX "ClassGroup_semesterId_name_key" ON "ClassGroup"("semesterId", "name");
CREATE TABLE "new_ImportBatch" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "filename" TEXT NOT NULL,
    "originalFilePath" TEXT,
    "parsedJsonPath" TEXT,
    "statsJson" TEXT,
    "qualityJson" TEXT,
    "warningsJson" TEXT,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "strategy" TEXT,
    "recordCount" INTEGER NOT NULL DEFAULT 0,
    "createdTaskCount" INTEGER,
    "createdSlotCount" INTEGER,
    "errorMessage" TEXT,
    "confirmedAt" DATETIME,
    "rolledBackAt" DATETIME,
    "semesterId" INTEGER NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "ImportBatch_semesterId_fkey" FOREIGN KEY ("semesterId") REFERENCES "Semester" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
INSERT INTO "new_ImportBatch" ("confirmedAt", "createdAt", "createdSlotCount", "createdTaskCount", "errorMessage", "filename", "id", "originalFilePath", "parsedJsonPath", "qualityJson", "recordCount", "rolledBackAt", "semesterId", "statsJson", "status", "strategy", "updatedAt", "warningsJson") SELECT "confirmedAt", "createdAt", "createdSlotCount", "createdTaskCount", "errorMessage", "filename", "id", "originalFilePath", "parsedJsonPath", "qualityJson", "recordCount", "rolledBackAt", "semesterId", "statsJson", "status", "strategy", "updatedAt", "warningsJson" FROM "ImportBatch";
DROP TABLE "ImportBatch";
ALTER TABLE "new_ImportBatch" RENAME TO "ImportBatch";
CREATE INDEX "ImportBatch_semesterId_idx" ON "ImportBatch"("semesterId");
CREATE TABLE "new_ScheduleAdjustment" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "type" TEXT NOT NULL,
    "week" INTEGER NOT NULL,
    "targetWeek" INTEGER,
    "originalSlotId" INTEGER NOT NULL,
    "newDayOfWeek" INTEGER,
    "newSlotIndex" INTEGER,
    "newRoomId" INTEGER,
    "semesterId" INTEGER NOT NULL,
    "reason" TEXT,
    "status" TEXT NOT NULL DEFAULT 'ACTIVE',
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "ScheduleAdjustment_originalSlotId_fkey" FOREIGN KEY ("originalSlotId") REFERENCES "ScheduleSlot" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "ScheduleAdjustment_newRoomId_fkey" FOREIGN KEY ("newRoomId") REFERENCES "Room" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "ScheduleAdjustment_semesterId_fkey" FOREIGN KEY ("semesterId") REFERENCES "Semester" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
INSERT INTO "new_ScheduleAdjustment" ("createdAt", "id", "newDayOfWeek", "newRoomId", "newSlotIndex", "originalSlotId", "reason", "semesterId", "status", "targetWeek", "type", "updatedAt", "week") SELECT "createdAt", "id", "newDayOfWeek", "newRoomId", "newSlotIndex", "originalSlotId", "reason", "semesterId", "status", "targetWeek", "type", "updatedAt", "week" FROM "ScheduleAdjustment";
DROP TABLE "ScheduleAdjustment";
ALTER TABLE "new_ScheduleAdjustment" RENAME TO "ScheduleAdjustment";
CREATE INDEX "ScheduleAdjustment_semesterId_idx" ON "ScheduleAdjustment"("semesterId");
CREATE TABLE "new_ScheduleSlot" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "teachingTaskId" INTEGER NOT NULL,
    "roomId" INTEGER,
    "dayOfWeek" INTEGER NOT NULL,
    "slotIndex" INTEGER NOT NULL,
    "importBatchId" INTEGER,
    "semesterId" INTEGER NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "ScheduleSlot_teachingTaskId_fkey" FOREIGN KEY ("teachingTaskId") REFERENCES "TeachingTask" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "ScheduleSlot_roomId_fkey" FOREIGN KEY ("roomId") REFERENCES "Room" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "ScheduleSlot_importBatchId_fkey" FOREIGN KEY ("importBatchId") REFERENCES "ImportBatch" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "ScheduleSlot_semesterId_fkey" FOREIGN KEY ("semesterId") REFERENCES "Semester" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
INSERT INTO "new_ScheduleSlot" ("createdAt", "dayOfWeek", "id", "importBatchId", "roomId", "semesterId", "slotIndex", "teachingTaskId", "updatedAt") SELECT "createdAt", "dayOfWeek", "id", "importBatchId", "roomId", "semesterId", "slotIndex", "teachingTaskId", "updatedAt" FROM "ScheduleSlot";
DROP TABLE "ScheduleSlot";
ALTER TABLE "new_ScheduleSlot" RENAME TO "ScheduleSlot";
CREATE INDEX "ScheduleSlot_semesterId_idx" ON "ScheduleSlot"("semesterId");
CREATE TABLE "new_SchedulingConfig" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "name" TEXT NOT NULL,
    "semesterId" INTEGER NOT NULL,
    "maxIterations" INTEGER NOT NULL DEFAULT 10000,
    "lahcWindowSize" INTEGER NOT NULL DEFAULT 500,
    "randomSeed" INTEGER,
    "solverVersion" TEXT,
    "lockedSlotIds" TEXT,
    "lockedTaskIds" TEXT NOT NULL DEFAULT '[]',
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "SchedulingConfig_semesterId_fkey" FOREIGN KEY ("semesterId") REFERENCES "Semester" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
INSERT INTO "new_SchedulingConfig" ("createdAt", "id", "lahcWindowSize", "lockedSlotIds", "lockedTaskIds", "maxIterations", "name", "randomSeed", "semesterId", "solverVersion", "updatedAt") SELECT "createdAt", "id", "lahcWindowSize", "lockedSlotIds", "lockedTaskIds", "maxIterations", "name", "randomSeed", "semesterId", "solverVersion", "updatedAt" FROM "SchedulingConfig";
DROP TABLE "SchedulingConfig";
ALTER TABLE "new_SchedulingConfig" RENAME TO "SchedulingConfig";
CREATE INDEX "SchedulingConfig_semesterId_idx" ON "SchedulingConfig"("semesterId");
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
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "SchedulingRun_configId_fkey" FOREIGN KEY ("configId") REFERENCES "SchedulingConfig" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "SchedulingRun_semesterId_fkey" FOREIGN KEY ("semesterId") REFERENCES "Semester" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "SchedulingRun_operatorId_fkey" FOREIGN KEY ("operatorId") REFERENCES "User" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);
INSERT INTO "new_SchedulingRun" ("appliedAt", "changedSlotCount", "completedAt", "configId", "conflictSummary", "createdAt", "databaseFingerprint", "durationMs", "errorMessage", "hardScore", "hardScoreAfter", "hardScoreBefore", "hc1After", "hc1Before", "hc2After", "hc2Before", "hc3After", "hc3Before", "hc4After", "hc4Before", "id", "iterations", "mode", "operatorId", "operatorNameSnapshot", "previewExpiresAt", "randomSeed", "resultSnapshot", "rollbackOfRunId", "rolledBackAt", "semesterId", "softScore", "softScoreAfter", "softScoreBefore", "solverVersion", "startedAt", "status", "updatedAt") SELECT "appliedAt", "changedSlotCount", "completedAt", "configId", "conflictSummary", "createdAt", "databaseFingerprint", "durationMs", "errorMessage", "hardScore", "hardScoreAfter", "hardScoreBefore", "hc1After", "hc1Before", "hc2After", "hc2Before", "hc3After", "hc3Before", "hc4After", "hc4Before", "id", "iterations", "mode", "operatorId", "operatorNameSnapshot", "previewExpiresAt", "randomSeed", "resultSnapshot", "rollbackOfRunId", "rolledBackAt", "semesterId", "softScore", "softScoreAfter", "softScoreBefore", "solverVersion", "startedAt", "status", "updatedAt" FROM "SchedulingRun";
DROP TABLE "SchedulingRun";
ALTER TABLE "new_SchedulingRun" RENAME TO "SchedulingRun";
CREATE INDEX "SchedulingRun_semesterId_idx" ON "SchedulingRun"("semesterId");
CREATE TABLE "new_TeachingTask" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "courseId" INTEGER NOT NULL,
    "teacherId" INTEGER,
    "weekType" TEXT NOT NULL DEFAULT 'ALL',
    "startWeek" INTEGER NOT NULL DEFAULT 1,
    "endWeek" INTEGER NOT NULL DEFAULT 16,
    "remark" TEXT,
    "crossCohortApproved" BOOLEAN NOT NULL DEFAULT false,
    "crossCohortApprovalReason" TEXT,
    "importBatchId" INTEGER,
    "semesterId" INTEGER NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "TeachingTask_courseId_fkey" FOREIGN KEY ("courseId") REFERENCES "Course" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "TeachingTask_teacherId_fkey" FOREIGN KEY ("teacherId") REFERENCES "Teacher" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "TeachingTask_importBatchId_fkey" FOREIGN KEY ("importBatchId") REFERENCES "ImportBatch" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "TeachingTask_semesterId_fkey" FOREIGN KEY ("semesterId") REFERENCES "Semester" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
INSERT INTO "new_TeachingTask" ("courseId", "createdAt", "crossCohortApprovalReason", "crossCohortApproved", "endWeek", "id", "importBatchId", "remark", "semesterId", "startWeek", "teacherId", "updatedAt", "weekType") SELECT "courseId", "createdAt", "crossCohortApprovalReason", "crossCohortApproved", "endWeek", "id", "importBatchId", "remark", "semesterId", "startWeek", "teacherId", "updatedAt", "weekType" FROM "TeachingTask";
DROP TABLE "TeachingTask";
ALTER TABLE "new_TeachingTask" RENAME TO "TeachingTask";
CREATE INDEX "TeachingTask_semesterId_idx" ON "TeachingTask"("semesterId");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;

