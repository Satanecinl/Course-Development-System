-- AlterTable: Add per-link source evidence fields to TeachingTaskClass
-- K20-FIX-B-SOURCE-EVIDENCE-SCHEMA-PLAN
--
-- All 8 fields are nullable + no default → existing rows are preserved with
-- source evidence = null (no historical backfill). Forward-fill: future
-- imports will populate these fields in executeImportInTransaction.

ALTER TABLE "TeachingTaskClass" ADD COLUMN "importBatchId" INTEGER;
ALTER TABLE "TeachingTaskClass" ADD COLUMN "sourceRowIndex" INTEGER;
ALTER TABLE "TeachingTaskClass" ADD COLUMN "sourceKeyword" TEXT;
ALTER TABLE "TeachingTaskClass" ADD COLUMN "sourceClassName" TEXT;
ALTER TABLE "TeachingTaskClass" ADD COLUMN "sourceRemark" TEXT;
ALTER TABLE "TeachingTaskClass" ADD COLUMN "sourceArtifactFilename" TEXT;
ALTER TABLE "TeachingTaskClass" ADD COLUMN "matchStrategy" TEXT;
ALTER TABLE "TeachingTaskClass" ADD COLUMN "matchConfidence" TEXT;
