-- L6-E1C: Add Staff reference fields to Teacher (controlled sync from教职工 Staff DB)
--
-- These nullable columns back the L6-E1C controlled sync apply:
--   scripts/apply-teacher-reference-controlled-sync-l6-e1c.ts
--
-- Columns map:
--   employeeNo   ← Staff.工号
--   department   ← Staff.部门
--   position     ← Staff.职务
--   rank         ← Staff.职级
--   phone        ← Staff.手机
--   officePhone  ← Staff.办公电话
--
-- Constraints:
--   - All columns are nullable; existing Teacher rows are unaffected.
--   - No unique constraints; same name across DBs/imports is a human judgment.
--   - No FK additions.
--   - No drop / delete / destructive change.

ALTER TABLE "Teacher" ADD COLUMN "employeeNo" TEXT;
ALTER TABLE "Teacher" ADD COLUMN "department" TEXT;
ALTER TABLE "Teacher" ADD COLUMN "position" TEXT;
ALTER TABLE "Teacher" ADD COLUMN "rank" TEXT;
ALTER TABLE "Teacher" ADD COLUMN "phone" TEXT;
ALTER TABLE "Teacher" ADD COLUMN "officePhone" TEXT;
