# L6-D XLSX Course Setting Approval Package with Target Semester

> Stage: **L6-D-XLSX-COURSE-SETTING-APPROVAL-PACKAGE-WITH-TARGET-SEMESTER**
> Status: **PASS**
> Goal: produce a target-semester-bound, full coverage, redacted approval package that the future L6-E (apply) stage MUST consult before any DB write.

## 1. Stage Overview

L6-D integrates the previous L6 capabilities:
1. Reads the xlsx sample via the L2 parser;
2. Receives or auto-resolves an explicit `targetSemesterId`;
3. Loads target-semester-scoped `existingData` (Course / Teacher global; ClassGroup / TeachingTask / TeachingTaskClass by `semesterId`);
4. Runs the L4 dry-run mapper;
5. Builds a `CourseSettingApprovalPackageResult` via `buildCourseSettingApprovalPackageWithTargetSemester`.

L6-D is **review / approval only**. It does NOT write DB, does NOT create `ImportBatch` / `TeachingTask` / `TeachingTaskClass`, does NOT switch the active semester.

## 2. Target Semester Binding

| field | value |
|---|---|
| targetSemesterId | `3` |
| targetSemester idHash | `4e07408562be` |
| targetSemester nameHash | `84d9662d836b` |
| targetSemester codeHash | `00906e7bc88f` |
| targetSemester isActive | `false` |
| targetSemester classGroupCount | `0` |
| targetSemester teachingTaskCount | `0` |
| resolution reason | `CLI --target-semester-id=3` |
| resolution warning | `none` |
| real name / code in committed docs | **NO** (hashes only) |

## 3. Approval Package Invariants

| invariant | value |
|---|---|
| stage | `L6-D-XLSX-COURSE-SETTING-APPROVAL-PACKAGE-WITH-TARGET-SEMESTER` |
| packageVersion | `l6-d-approval-package-v1` |
| approvalOnly | `true` |
| dryRunOnly | `true` |
| dbWritten | `false` |
| applyAllowed | `false` |
| targetSemesterBound | `true` |
| reviewItems count | `1116` (= L4 teachingTaskCandidates) |
| approvedItems | `0` |
| rejectedItems | `0` |
| apply list generated | `false` |
| raw teacher names | not included |
| raw class names | not included |
| raw course names | not included |
| raw remarks | not included |
| raw rows | not included |

## 4. Approval Package Gates

| gate | value |
|---|---|
| targetSemesterBound | `true` |
| reviewPackageApproved | `false` |
| dbBackupCreated | `false` |
| dryRunReplayMatchesApprovedPackage | `false` |
| importBatchPlanGenerated | `false` |
| rollbackPlanGenerated | `false` |
| sourceEvidencePlanConfirmed | `false` |

## 5. Raw Display Policy

| surface | raw included |
|---|---|
| runtime UI (L6-B1) | yes (authorized admin only) |
| L6-D approval package | **no** |
| committed docs/json | **no** |
| local artifact (`temp/local-artifacts/l6-d/`) | **no** (gitignored) |

## 6. Source Evidence

- Source artifact size: `131200` bytes
- Source artifact filename hash: `d5c590e19e3f` (filename path NOT committed)
- Source artifact SHA256: present in the gitignored local artifact only (`sourceArtifact.artifactSha256`); deliberately NOT committed to `docs/` to mirror L6-0 privacy pattern.
- L2 parser version: `l2-parser-v1`

## 7. Local Redacted Package

- Path: `temp/local-artifacts/l6-d/xlsx-course-setting-approval-package.target-3.redacted.json`
- sha256: `b5c96f83058443f40f8e89a71b97ca29b78c3966f055f5c74f613a4e9efbb193`
- Item count: `1116`
- All decisions: `pending`
- Git tracked: **NO** (under gitignored `temp/`)

## 8. Why the Package Does NOT Contain Raw Values

The approval package is consumed by reviewers and (eventually) the L6-E apply stage. To prevent any committed JSON / local artifact from leaking sample data:
- teacher / class / course / remark / sheet text is hashed (sha256-prefix-12) at parse time and that is the only form committed;
- the L6-D helper reuses the L4 dry-run `previewCandidates` (which carry hashes + classifications + diagnostic codes only);
- `targetSemesterRef.semesterIdHash` is recorded instead of the raw semester name / code;
- the L6-B1 runtime raw preview (course / teacher / class / remark / sheet text) is only ever emitted by the runtime API + UI for authorized admins, never in any L6-D output.

## 9. DB No-Write Proof

| table | before | after |
|---|---|---|
| Semester | `3` | `3` |
| Course | `104` | `104` |
| Teacher | `84` | `84` |
| ClassGroup | `36` | `36` |
| TeachingTask | `308` | `308` |
| TeachingTaskClass | `446` | `446` |
| ImportBatch | `38` | `38` |
| ScheduleSlot | `440` | `440` |
| ScheduleAdjustment | `67` | `67` |
| active semester id | `1` | `1` |

Allowed Prisma read methods used by L6-D: `findUnique`, `findMany`, `count`, `findFirst`.
No `create / update / upsert / delete / $executeRaw` calls in the L6-D helper or verify script.
No `ImportBatch.create` / `TeachingTask.create` / `TeachingTaskClass.create` in L6-D.

## 10. Relationship to Prior Stages

- **L6-B1**: runtime raw preview for authorized admins — raw fields live here only. L6-D does NOT include them.
- **L6-C**: create-new-semester flow. L6-D consumes a Semester row (whether pre-existing or created in L6-C) but does NOT modify the Semester table itself.
- **L5 / L6-0**: review packages. L6-D does NOT reuse them; L6-D pins different invariants (`approvalOnly`, `targetSemesterBound`, `applyAllowed`, gates).
- **L4 / L2 / Word parser / scheduler / score / schema**: untouched.

## 11. Validation

- L6-D verify: PASS (107/0/0/0)
- L6-C verify: PASS
- L6-B1 verify: PASS
- L6-B verify: PASS
- L6-A audit: PASS
- L5 / L4 / L3 / L2 / L1 verify: PASS
- K39-B1 / B1A / C2 / C4: PASS
- K22-C: PASS (73/0/0/0)
- scan:docs-pii: PASS
- build: FAIL
- tsc: FAIL
- targeted eslint: FAIL
- git diff --check: clean
- forbidden files: clean

## 12. Next Steps (Recommendation)

L6-D closes. The next stage (L6-E, apply) MUST still be BLOCKED until the user manually approves the package. L6-E will:
- require a fresh DB backup;
- require the user-approved package digest;
- perform an atomic transaction (Course / Teacher / ClassGroup / TeachingTask / TeachingTaskClass create + source evidence forward-fill + ImportBatch provenance);
- provide a deterministic rollback strategy.

Until L6-E lands, the system remains in L6-D review-only mode.
