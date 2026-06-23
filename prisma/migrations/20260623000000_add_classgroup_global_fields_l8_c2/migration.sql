-- L8-C2: Additive global master data prep fields for ClassGroup
-- These fields are backward-compatible: all nullable (except isActive which defaults to true).

ALTER TABLE "ClassGroup" ADD COLUMN "canonicalKey" TEXT;
ALTER TABLE "ClassGroup" ADD COLUMN "grade" TEXT;
ALTER TABLE "ClassGroup" ADD COLUMN "majorName" TEXT;
ALTER TABLE "ClassGroup" ADD COLUMN "classNumber" TEXT;
ALTER TABLE "ClassGroup" ADD COLUMN "educationLevel" TEXT;
ALTER TABLE "ClassGroup" ADD COLUMN "schoolLength" TEXT;
ALTER TABLE "ClassGroup" ADD COLUMN "sourceType" TEXT;
ALTER TABLE "ClassGroup" ADD COLUMN "isActive" BOOLEAN NOT NULL DEFAULT true;

-- Prisma @unique creates a UNIQUE INDEX (not inline constraint)
CREATE UNIQUE INDEX "ClassGroup_canonicalKey_key" ON "ClassGroup"("canonicalKey");
CREATE INDEX "ClassGroup_isActive_idx" ON "ClassGroup"("isActive");
