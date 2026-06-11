-- K34-A3: Add ScheduleSlotAdditionalRoom model for composite room expressions.
-- This is an additive change: no existing tables or columns are modified.

CREATE TABLE "ScheduleSlotAdditionalRoom" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "scheduleSlotId" INTEGER NOT NULL,
    "roomId" INTEGER NOT NULL,
    "role" TEXT NOT NULL DEFAULT 'SECONDARY',
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "ScheduleSlotAdditionalRoom_scheduleSlotId_fkey"
        FOREIGN KEY ("scheduleSlotId") REFERENCES "ScheduleSlot" ("id")
        ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "ScheduleSlotAdditionalRoom_roomId_fkey"
        FOREIGN KEY ("roomId") REFERENCES "Room" ("id")
        ON DELETE RESTRICT ON UPDATE CASCADE
);

CREATE UNIQUE INDEX "ScheduleSlotAdditionalRoom_scheduleSlotId_roomId_key"
    ON "ScheduleSlotAdditionalRoom" ("scheduleSlotId", "roomId");

CREATE INDEX "ScheduleSlotAdditionalRoom_roomId_idx"
    ON "ScheduleSlotAdditionalRoom" ("roomId");
