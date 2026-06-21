# L6-E1 XLSX Course Setting Manual Resolution UI

> Stage: **L6-E1-XLSX-COURSE-SETTING-MANUAL-RESOLUTION-UI**
> Status: **PASS** (code complete)

## 1. Stage Overview
L6-E1 adds manual resolution UI to the L6-D2 approval review view. Users can resolve missing Course/Teacher/ClassGroup, override weeklyHours/examType, handle ambiguous mappings, and ignore rows — all in the browser. No DB writes, no apply list, no ImportBatch/TeachingTask creation.

## 2. Resolution Model
- Status: importable / needsResolution / ignored / pending
- Actions: useExistingCourse / createCourseCandidate / useExistingTeacher / createTeacherCandidate / allowBlankTeacher / useExistingClassGroup / createClassGroupCandidate / overrideWeeklyHours / overrideExamType / confirmAmbiguousMapping / markNeedsReview / ignoreRow
- Initial state: blocked rows → needsResolution, autoSafe → importable, needsHumanReview → pending

## 3. DB No-Write Proof
| table | before | after |
|---|---|---|
| all 9 tables | identical | identical |

## 4. Validation Result
- 89/89 PASS
- K22-C: PASS
- scan:docs-pii: PASS
- build: PASS
- tsc: PASS
- eslint: PASS

## 5. Next Stage
L6-E2 / L6-F: partial import plan. Will consume the resolution draft export to generate an apply plan.
