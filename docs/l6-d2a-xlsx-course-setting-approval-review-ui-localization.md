# L6-D2A XLSX Course Setting Approval Review UI Localization

> Stage: **L6-D2A-XLSX-COURSE-SETTING-APPROVAL-REVIEW-UI-LOCALIZATION**
> Status: **PASS** (code complete)
> Goal: add Chinese display labels for the L6-D2 approval review UI (filter labels, table headers, dropdown labels, badges) while keeping ALL machine values (option `value=...`, state, exported JSON field names + values) unchanged. NO DB writes, NO API changes, NO fs writes outside `docs/l6-d2a-*` and the local status append.

## 1. Stage Overview

L6-D2A is a follow-up polish to L6-D2 (commit `ea77f5e`). L6-D2 added the review UI with English text in filter labels, table headers, dropdowns, and badges. L6-D2A introduces:

- **Pure localization helper** `src/lib/import/course-setting-approval-review-localization.ts`: constants + formatters, no React / Prisma / fs / API / UI imports.
- **UI component update** `src/components/import/course-setting-xlsx-preview.tsx`: uses the helper for all user-visible English text.

## 2. Chinese Constants Provided

| constant | count |
|---|---|
| `APPROVAL_REVIEW_TABLE_HEADERS` | 14 |
| `APPROVAL_REVIEW_DECISION_OPTIONS` | 4 |
| `APPROVAL_REVIEW_BLOCKED_OPTIONS` | 3 |
| `APPROVAL_REVIEW_SUGGESTED_ACTION_LABELS` | 10 |
| `APPROVAL_REVIEW_DIAGNOSTIC_LABELS` | 18 |
| `APPROVAL_REVIEW_MATCH_STATUS_LABELS` | 11 |

## 3. Formatters

| function | input → output |
|---|---|
| `formatApprovalDecisionLabel` | `'pending' → '待审核'`, etc. |
| `formatSuggestedActionLabel` | `'blockedByMissingCourse' → '因课程缺失阻塞'`; unknown → `未知建议：<value>` |
| `formatDiagnosticCodeLabel` | `'COURSE_MISSING' → '课程缺失'`; unknown → `未知诊断：<code>` |
| `formatMatchStatusLabel` | `'exact' → '精确匹配'`; `'a / b' → 'A / B'` |
| `formatBlockedLabel` | `true → '是'`, `false → '否'`, `'blocked' → '阻塞'`, `'notBlocked' → '不阻塞'` |
| `formatConfidence` | `0.85 → '0.85'`; null / undefined / NaN → `'-'` |

## 4. Machine-Value Preservation

| surface | value |
|---|---|
| decision option value | `pending` / `approved` / `rejected` / `needsReview` (English) |
| blocked option value | `all` / `blocked` / `notBlocked` (English) |
| exported JSON field names | `approvalItemId` / `decision` / `targetSemesterId` / `packageRef` / `decisions` / `rawIncluded` (English) |
| exported JSON `rawIncluded` | `false` literal |
| exported JSON `decision` | `pending` / `approved` / `rejected` / `needsReview` (English) |
| filter state | English machine values (no Chinese) |

## 5. Privacy

- Helper source: 0 raw teacher / class / course / remark / sheet / phone leaks (privacy detector).
- Committed JSON: 0 PII leaks.
- Exported decision JSON: `rawIncluded=false`, no raw teacher / class / course / remark text.

## 6. Validation Result

- 66 / 66 L6-D2A verify checks PASS
- scan:docs-pii: PASS
- build: PASS
- tsc --noEmit: PASS
- eslint: PASS
- K22-C: PASS (73/0/0/0)
- git diff --check on L6-D2A-owned files: clean
- forbidden files: clean

## 7. Isolation

- `src/app/api/` clean (no API modifications)
- `prisma/` clean (no schema/migration changes)
- No xlsx / dev.db / backup / temp / uploads tracked
- DB counts unchanged (read-only verification: this script only uses `prisma.count()`)

## 8. Relationship to Prior Stages

- **L6-D2** (commit `ea77f5e`): the review UI base. L6-D2A ONLY swaps English display text for Chinese via the helper; the underlying logic, API, decision-file shape, and machine-value contract are unchanged.
- **L6-D / L6-D1 / L6-C / L4 / L2 / Word parser / scheduler / score / schema**: untouched.

## 9. Next Steps

L6-D2A closes after browser manual validation passes. Future work (planned):

- Browser-side manual UI check: open /admin/import review section, confirm all Chinese labels render correctly.
- Optional: extract a generalized i18n registry if other UI surfaces need localization.
