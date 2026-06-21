# L6-D2 XLSX Course Setting Approval Review UI

> Stage: **L6-D2-XLSX-COURSE-SETTING-APPROVAL-REVIEW-UI**
> Status: **PASS** (code complete)
> Goal: provide an admin review UI over the L6-D target-semester-bound approval package. The UI exposes raw review rows (course / teacher / class / remark / sheet / row) to authorized admins, lets them flip per-row decisions between `pending` / `approved` / `rejected` / `needsReview`, and exports a redacted decision JSON. NEVER writes DB, NEVER creates ImportBatch/TeachingTask/TeachingTaskClass, NEVER switches the active semester.

## 1. Stage Overview

L6-D2 builds on L6-D (target-semester-bound approval package, 1116 items) + L6-D1 (initial decision overlay, all `pending`). It adds:

- **Runtime API** `POST /api/admin/import/course-setting-xlsx/approval-review` (review-only; permission `import:manage`) returning the UI-ready row set.
- **UI section** in `/admin/import` Excel preview: review table + decision dropdowns + filters + live counters + export button.
- **Decision file helper** that builds a redacted `course-setting-decision.target-<id>.redacted.json` payload for browser download.
- **Helper** `buildCourseSettingApprovalReviewUi` projects L6-D items into the UI row shape (pure, no DB, no fs).

## 2. Review API Contract

| field | value |
|---|---|
| route | `POST /api/admin/import/course-setting-xlsx/approval-review` |
| permission | `import:manage` |
| request | multipart `file` (.xlsx, ≤20MB) + `targetSemesterId` (required) + optional `maxRows` (default 200, max 5000) |
| reviewOnly | `true` |
| dryRunOnly | `true` |
| dbWritten | `false` |
| applyAllowed | `false` |
| applyListGenerated | `false` |
| runtime raw allowed | yes (authorized admin only) |
| exported decision file raw | forbidden |

## 3. UI Workflow

1. ADMIN opens `/admin/import` Excel preview area.
2. Selects / creates target semester (L6-C flow retained).
3. Uploads .xlsx.
4. Clicks `生成审核视图` (NOT `导入` / `确认导入` / `应用`).
5. Review table appears with raw course / teacher / class / remark / sheet / row + diagnostic chips + suggestedAction + match status + confidence + decision dropdown.
6. Summary cards + live counters reflect current client decisions.
7. Filters: decision / blocked / suggestedAction / diagnostic code / raw-text search.
8. User changes decision dropdown → live counter updates (client state only).
9. User clicks `导出审核决策 JSON` → browser downloads redacted decision file (`course-setting-decision.target-<id>.redacted.json`).

No apply / no DB write / no ImportBatch / no TeachingTask creation / no active-semester switch at any step.

## 4. Decision Dropdown Semantics

| value | meaning (client state) | DB effect |
|---|---|---|
| `pending` | default; mirror of server's initial state | none |
| `approved` | user marked item for approval | none — future L6-E may consume the exported decision file |
| `rejected` | user marked item as rejected | none |
| `needsReview` | user flagged item as needing further human review | none |

Auto-safe candidates are NEVER auto-flipped. The UI surfaces them via the `autoSafeCandidate` flag but keeps their initial decision as `pending`.

## 5. Exported Decision File

| field | shape |
|---|---|
| stage / fileType / version | `L6-D2-XLSX-COURSE-SETTING-APPROVAL-REVIEW-UI` / `course-setting-decision-file` / `l6-d2-decision-file-v1` |
| targetSemesterId | number |
| packageRef | `{ dryRunFingerprintHash, itemCount }` |
| decisions | `Array<{ approvalItemId, decision, reason? }>` |
| rawIncluded | `false` literal |

**No raw teacher / class / course / remark / sheet text is ever placed in the exported file.**
The file is built and serialized in the browser; nothing is uploaded to the server.

## 6. Raw Display Policy

| surface | raw included |
|---|---|
| runtime UI (L6-D2 `/admin/import` review section) | yes (authorized admin only) |
| exported decision JSON | **no** |
| committed docs/json | **no** |
| local artifacts | n/a (none generated) |

## 7. DB No-Write Proof

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

Allowed Prisma read methods used by L6-D2: `findUnique`, `findMany`, `count`, `findFirst`.
No `create / update / upsert / delete / $executeRaw` calls in route / helpers / verify script.
No `ImportBatch.create` / `TeachingTask.create` / `TeachingTaskClass.create` in L6-D2.

## 8. Validation Result

- 99 / 99 L6-D2 verify checks PASS
- K22-C: PASS (73/0/0/0)
- scan:docs-pii: PASS
- build / tsc / eslint: PASS
- git diff --check: clean on L6-D2-owned files
- forbidden files: clean

## 9. Relationship to Prior Stages

- **L6-D**: target-semester-bound approval package. L6-D2 consumes it unchanged; the L6-D helper is NOT modified.
- **L6-D1**: initial decision overlay. L6-D2 consumes its decisionPackage fingerprint cross-check; the L6-D1 helper is NOT modified.
- **L6-C**: create-new-semester flow. L6-D2 retains the createNew form + selector; the L6-C flow is NOT modified.
- **L6-B1**: runtime raw preview. L6-D2 extends raw preview to the review table (raw fields continue to be admin-only).
- **L5 / L6-0**: review packages (no per-item decision field). L6-D2 introduces the UI decision overlay on top of L6-D's approval package.
- **L4 / L2 / Word parser / scheduler / score / schema**: untouched.

## 10. Browser Manual Validation Checklist

> L6-D2 changes UI / API, so it CANNOT be fully closed until browser manual validation passes.

1. Start dev server (`npm run dev`) on localhost:3000.
2. ADMIN login.
3. Open `/admin/import` → Excel 课程设置识别预览.
4. Select existing target semester OR create new one.
5. Upload xlsx.
6. Click `生成审核视图`.
7. Confirm review summary appears (total / pending / approved / rejected / needsReview / blocked).
8. Confirm raw course / teacher / class / remark / sheet / row visible in table.
9. Confirm diagnostic chips + suggestedAction + blockingReasons + match status + confidence visible.
10. Confirm per-row decision dropdown.
11. Change one row → `approved` → live counter updates.
12. Change one row → `rejected` → live counter updates.
13. Change one row → `needsReview` → live counter updates.
14. Filter by decision works.
15. Filter by suggestedAction works.
16. Filter by diagnostic code works.
17. Filter by blocked / not blocked works.
18. Search over raw course / teacher / class / remark works.
19. Click `导出审核决策 JSON` → file `course-setting-decision.target-<id>.redacted.json` downloads.
20. Open downloaded file → contains `approvalItemId` + `decision` per item; NO raw course/teacher/class/remark.
21. Confirm NO `确认导入` / `应用` / `写入数据库` / `创建教学任务` / `切换当前学期` button.
22. Confirm browser console has no React error.
23. Confirm DB counts unchanged during review.
24. Confirm active semester NOT switched.
25. Confirm `dbCounts before == after` after the entire review session.

## 11. Next Steps

L6-D2 closes after browser manual validation passes. Future work:

- **L6-D-IMPORT-DECISION-FILE** (planned): consume the exported decision file in a future stage (server-side `importedDecisionFile` source).
- **L6-E** (planned): apply stage. Still BLOCKED — L6-D2 keeps `applyAllowed: false` and `applyListGenerated: false`.

Until either path lands, the system remains in L6-D2 review-only mode with all initial decisions `pending`.
