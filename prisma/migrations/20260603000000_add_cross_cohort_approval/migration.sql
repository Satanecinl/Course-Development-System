-- AlterTable: Add cross-cohort approval fields to TeachingTask
-- K19-FIX-B1-SCHEMA-AND-API-CROSS-COHORT-APPROVAL

ALTER TABLE "TeachingTask" ADD COLUMN "crossCohortApproved" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "TeachingTask" ADD COLUMN "crossCohortApprovalReason" TEXT;
