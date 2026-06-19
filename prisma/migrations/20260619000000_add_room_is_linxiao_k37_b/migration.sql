-- K37-B: Add isLinxiao persistent flag to Room
ALTER TABLE "Room" ADD COLUMN "isLinxiao" BOOLEAN NOT NULL DEFAULT false;
