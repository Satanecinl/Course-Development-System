# L7-A1: XLSX Course Setting New Template Validation Closeout

## 1. Browser Validation Passed

User confirmed `/admin/import` browser manual validation passed:
- New template xlsx uploaded successfully
- 13-column A:M schema detected
- Row-level parsing working (no forward-fill)
- K column `授课任务分配` primary task split source
- J column `任课教师` fallback
- Subtotal rows skipped
- New course candidate semantics preserved (COURSE_NAME_MISSING / COURSE_CREATE_CANDIDATE)
- ClassTokenUnmatched only when truly unmatched
- Template version badge shown
- No apply/write DB buttons
- DB counts unchanged

## 2. scan:docs-pii Result

- Result: **PASS**
- Blocking hits: 0
- Warning hits: 3 (pre-existing in l1/l2 docs: PHONE_NUMBER pattern in audit JSON files)
- Parse failed: 0

## 3. L6-E1 Regression Clarification

- Rerun result: **87/87 PASS**
- Previous L7-A report showed `86/1 (1 pre-existing)` — this was a transient failure during the L7-A commit run
- Second run: **87/87 PASS** (consistent)
- The `ScheduleAdjustment ACTIVE count` pre-existing failure did NOT appear in any rerun
- Conclusion: L6-E1 is 87/87 PASS, fully compatible with L7-A

## 4. L6-E2G1 Check Count Clarification

- Current script result: **54/54 PASS**
- L7-A report wrote `117/117` — this was a **report typo**. The L7-A report mixed up L6-E2G (117 checks) with L6-E2G1 (54 checks)
- L6-E2G1 verify script has 54 checks (confirmed by running the script)
- L6-E2G verify script has 117 checks (separate script)
- Conclusion: L6-E2G1 = 54/54 PASS, L6-E2G = 117/117 PASS

## 5. L6-E2E/E2D/E2C Regression Results

All scripts run against the new template xlsx (`课程设置新模板.xlsx`, target-semester-id 3):

- **L6-E2E** (real task split parsing): **82/82 PASS**
  - The new template's K column format `1,2:teacher;3,4:teacher` is handled by the new Pattern 0a in `detectTaskSplitCandidates`
  - Old parenthesized format `teacher(1.2)` is still supported as Pattern 0b
  - The verify script was updated to be template-aware (checks both orchestrator and extracted files)

- **L6-E2D** (split candidate details): **90/90 PASS**
  - Split candidate details display correctly for new template rows
  - The verify script was updated to use `allUi` (orchestrator + extracted files)

- **L6-E2C** (review table context + task split): **86/86 PASS**
  - Review table shows all required columns
  - Task split detection works with K column format
  - The verify script was updated to use `allUi` and correct function names

- **L6-E2G** (new course candidate semantics): **117/117 PASS**
  - COURSE_NAME_MISSING / COURSE_CREATE_CANDIDATE semantics preserved
  - The verify script is template-agnostic (checks helper and UI code, not xlsx content)

## 6. Core Checks

- prisma validate: **PASS**
- migrate status: **PASS** (14 migrations, up to date)
- build: **PASS**
- tsc: **PASS** (0 errors)
- eslint: **PASS** (0 errors, 0 warnings)
- K22-C: **PASS** (KNOWN_FAIL=0)

## 7. DB / No-Apply / No-Write Proof

- DB write: **none**
- Course create: **none**
- Teacher create: **none**
- ClassGroup create: **none**
- ImportBatch/TeachingTask: **none**
- raw committed: **none** (rawIncluded: false in all exports)
- apply button: **none**

## 8. Git / GitHub

- Final HEAD: `e51a565`
- Remote tracking: `origin/master`
- ahead/behind: `0/0`
- Push: already pushed (commit `e51a565`)
- Force push: no
- Final worktree: **clean** (K22 snapshot drift restored, L6-E1 verify output restored)

## 9. Closeout Decision

L7-A is officially **CLOSED**.

All validation evidence collected:
- Browser validation: PASSED (user confirmed)
- scan:docs-pii: PASS (0 blocking)
- L7-A verify: 105/105 PASS
- L6-E1 regression: 87/87 PASS
- L6-E2G1 regression: 54/54 PASS
- L6-E2G regression: 117/117 PASS
- L6-E2F regression: 45/45 PASS
- L6-E2E regression: 82/82 PASS
- L6-E2D regression: 90/90 PASS
- L6-E2C regression: 86/86 PASS
- L6-E2A regression: 85/85 PASS
- L6-E2 regression: 144/144 PASS
- Core checks: all PASS

## 10. Next Stage Recommendation

L7-F-XLSX-COURSE-SETTING-NEW-TEMPLATE-PARTIAL-IMPORT-EXECUTION

L7-F must be a standalone write-stage with:
- DB backup before any writes
- Explicit confirmation gate
- Transaction + rollback
- Only create confirmed/importable courses
- Still no auto-create Teacher/ClassGroup
- Must be planned and gated independently from L7-A
