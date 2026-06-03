# K19-FIX-A-IMPORT-MATCHING-COHORT-GUARD

## 1. Background

K19-IMPORT-MATCHING-IMPROVEMENT-AUDIT (commit `0e656a2`) identified the root cause
of historical K18 cross-cohort ClassGroup matching errors as the importer's
weak matching pipeline:

- `findMergedClassNames` in `src/lib/import/importer.ts` used
  `.includes()` + character-level subsequence matching after a partial
  cohort/track pre-filter.
- The pre-filter (`filterCandidatesByYearAndTrack`) was only "year same or
  absent", not strict cohort equality; it also allowed `baseClass = 2025` to
  match `candidate = 2024` when neither had an explicit cohort year in the
  keyword.
- Remark parsing (`parseRemarkKeywords`) did not distinguish explicit year
  markers (`2024级森林草原防火技术1班`) from implicit short forms (`森防`,
  `高本贯通`), so a short-form remark could expand to the wrong cohort.
- `TeachingTaskClass` creation in `executeImportInTransaction` had no
  cross-cohort audit — once a wrong-cohort candidate slipped through, it was
  silently linked.
- No warning/regression mechanism distinguished **legal public-course cross
  cohort** from **suspicious cross-cohort error**.

K18 historical errors (all repaired in K18-B / K18-E3, confirmed by K19 audit):

| Task  | Course                          | Wrong CG (K19)        | Correct CG            | Status    |
| ----- | ------------------------------- | --------------------- | --------------------- | --------- |
| 168   | 机械制图 (赵春超)                 | 2024 GTY 1班 (高本贯通) | 2025 cohort 现场工程师 | REPAIRED  |
| 174   | 机械制图 (张红梅)                 | 2024 GTY 1班 (高本贯通) | 2025 cohort 现场工程师 | REPAIRED  |
| 176   | 电子技术 (许进)                   | 2024 GTY 1班 (高本贯通) | 2025 cohort 现场工程师 | REPAIRED  |
| 181   | 传感器与检测技术 (张旭)           | 2024 GTY 1班 (高本贯通) | 2025 cohort 现场工程师 | REPAIRED  |
| 37    | 习近平思想 (房忠敏)               | 2024 SF 1班 (CG35)    | 2025 GTY + 2025 SF     | REPAIRED  |

This stage **does not re-import history**. K18 DB is already clean. This stage
hardens the matching pipeline so the same root cause cannot recur in any
future import batch.

## 2. Goal

Implement minimum, non-invasive hardening against cross-cohort false-positive
ClassGroup merges during import. Specifically:

- exact-match-first for ClassGroup matching
- cohort/year strict-equal guard on all weak and exact matches
- distinguish explicit-year remarks from implicit short-form remarks
- final cross-cohort assertion before `TeachingTaskClass` creation
- introduce cross-cohort warning categories for audit and downstream UI

## 3. Root Cause Addressed

| Root cause hypothesis                  | Addressed? | Mechanism                                                                              |
| -------------------------------------- | ---------- | -------------------------------------------------------------------------------------- |
| RCH-1 weak matching after partial filter | YES       | exact-match-first + cohort strict equal in `filterCandidatesByYearAndTrack`              |
| RCH-2 task37 historical seed path      | PARTIAL    | task 37 DB link is REPAIRED in K18-E3. Cohort strict equal now blocks re-import path.    |
| RCH-3 no source-evidence retention     | DEFERRED   | Out of scope per K19 spec (no schema changes); see Remaining Risks.                       |

## 4. Modified Files

- `src/lib/import/importer.ts`
  - Added exported helper `extractCohortYearFromClassName(name: string): number | null`
    - supports `2024级` → 2024
    - supports `24级` → 2024
    - returns `null` for course names, file names, dates, empty strings
  - Added `LIKELY_PUBLIC_COURSE_HINTS` constant (mirrors K19 audit's allowlist)
  - Strengthened `filterCandidatesByYearAndTrack`:
    - cohort strict equal enforced when both baseClass and candidate can be parsed
    - candidate without cohortYear is rejected when baseClass has one
    - candidate with cohortYear is rejected when baseClass has none (and keyword has no explicit year)
  - Rewrote `findMergedClassNames` to be **exact-match-first**:
    1. exact match (`c.name === kw`) wins
    2. `.includes()` fallback with `COHORT_MISMATCH_REJECTED (weak-match, kept)` warning
    3. subsequence fallback with `COHORT_MISMATCH_REJECTED (subseq-match, kept)` warning
    4. multi-hit weak matches are `AMBIGUOUS_CLASSGROUP_MATCH` and **not auto-linked**
  - Added final cross-cohort audit block in `executeImportInTransaction` (before
    `TeachingTask.create` and `TeachingTaskClass.create`):
    - collects `cohortYearSet` from `classGroupIds`
    - if `cohortYearSet.size > 1` and course is in `LIKELY_PUBLIC_COURSE_HINTS`,
      emits `LEGAL_PUBLIC_CROSS_COHORT`
    - if `cohortYearSet.size > 1` and course is NOT in the allowlist,
      emits `LIKELY_ERROR_CROSS_COHORT`
- `src/lib/import/quality-classifier.ts`
  - Added new types: `CrossCohortWarningKind`, `CrossCohortWarningSummary`
  - Added helper `classifyCrossCohortWarnings(warnings)` that classifies an
    existing warnings string array into the new categories (backward-compatible —
    no change to `ImportClassificationResult` shape)
- `scripts/verify-import-matching-cohort-guard-k19-fix-a.ts` (new)
- `docs/k19-import-matching-cohort-guard-fix-a.md` (this file)

## 5. Matching Strategy

```
findMergedClassNames(keywords, baseClass, candidates)
│
├── for each kw ∈ keywords:
│   ├── 1. cohort/track filter (filterCandidatesByYearAndTrack)
│   │      - cohortYear strict equal
│   │      - track equal when baseClass has track
│   │      - candidate without cohortYear is dropped when baseClass has one
│   │
│   ├── 2. exact match (c.name === kw)
│   │      - 1 hit  → use it (no warning)
│   │      - ≥2 hits → AMBIGUOUS_CLASSGROUP_MATCH, NOT auto-linked
│   │
│   ├── 3. .includes() weak match
│   │      - 1 hit  → use it, emit COHORT_MISMATCH_REJECTED (weak-match, kept)
│   │      - ≥2 hits → AMBIGUOUS_CLASSGROUP_MATCH, NOT auto-linked
│   │
│   └── 4. subsequence fallback
│          - 1 hit  → use it, emit COHORT_MISMATCH_REJECTED (subseq-match, kept)
│          - ≥2 hits → AMBIGUOUS_CLASSGROUP_MATCH, NOT auto-linked
│
└── return collected matches
```

Same-cohort positive case (e.g. 2025 GTY + remark `与2025级森林草原防火技术1班合班`):
- candidate `2025级森林草原防火技术1班` → cohort 2025 = baseClass cohort 2025 → passes filter
- exact match wins → single hit → used without warning

## 6. Cohort Guard Rules

- When `baseClass` has cohortYear (e.g. 2025):
  - candidate with `cohortYear` ≠ `baseClass.cohortYear` → **rejected**
  - candidate without `cohortYear` → **rejected** (cannot guarantee same cohort)
- When `baseClass` has no cohortYear:
  - candidate with `cohortYear` is rejected UNLESS the keyword has explicit year
  - candidate without `cohortYear` → retained
- Track guard (高本贯通 / 现场工程师) preserved as before: when keyword lacks
  explicit track, candidate track must equal baseClass track.
- Weak matches (`.includes()` and subsequence) that pass the cohort filter
  emit `COHORT_MISMATCH_REJECTED` as a warning (not blocking) and the match is
  recorded. This makes post-hoc audit possible.

## 7. Remark Handling Rules

- `parseRemarkKeywords` continues to extract multiple keyword variations from
  a remark, with two materialisations:
  - `与森防合班` → `['森防']` (core is "森防"; no numMatch, no slicing)
  - `与高本贯通合班` → `['高本贯通']`
  - `与钢铁智能冶金技术1班合班` → `['钢铁智能冶金技术1班', '技术1班', '冶金1班', '技术1']`
- Explicit-year remark (e.g. `与2024级森林草原防火技术1班合班`):
  - `parseRemarkKeywords` returns `['2024级森林草原防火技术1班', ...sliced]`
  - cohort filter applies; baseClass cohort and candidate cohort must match
  - exact match against the full remark-derived keyword is preferred
- Implicit short-form remark (`森防`, `高本贯通`):
  - search is restricted to **same cohort** as baseClass (cohort filter)
  - if multiple candidates match, the match is **AMBIGUOUS** and not auto-linked
  - alias expansion (e.g. `森防` → `森林草原防火`) is **out of scope** for this
    stage; it is a separate concern and would require an explicit alias table

## 8. Cross-Cohort Warning Strategy

Four new warning categories emitted by the importer and parsed by
`classifyCrossCohortWarnings` in `quality-classifier.ts`:

| Kind                          | Emitted when                                                              | Effect on import |
| ----------------------------- | ------------------------------------------------------------------------- | ---------------- |
| `LEGAL_PUBLIC_CROSS_COHORT`   | A `TeachingTask` links class groups from >1 cohort, course in allowlist   | warning-only     |
| `LIKELY_ERROR_CROSS_COHORT`   | A `TeachingTask` links class groups from >1 cohort, course NOT in allowlist | warning-only  |
| `AMBIGUOUS_CLASSGROUP_MATCH`  | weak fallback hit ≥2 candidates OR exact hit ≥2 candidates                | weak match **not** auto-linked |
| `COHORT_MISMATCH_REJECTED`    | weak fallback hit 1 candidate (kept)                                      | kept + warning   |

Public course allowlist (`LIKELY_PUBLIC_COURSE_HINTS`):

- `大学英语`, `大学日语`, `大学语文`, `高等数学`
- `习近平新时代中国特色社会主义思想概论`
- `毛泽东思想和中国特色社会主义理论体系概论`
- `思想道德与法治`, `形势与政策`, `创新创业教育`
- `职业生涯规划`, `体育`, `军事理论`, `心理健康教育`
- `劳动教育`, `信息技术`, `计算机应用基础`, `中华优秀传统文化`
- `美育`, `职业素养`, `大学生职业发展与就业指导`

These are the same hints used in the K19 audit and K17-FIX-A.

## 9. Regression Cases

Covered by `scripts/verify-import-matching-cohort-guard-k19-fix-a.ts`:

| #  | Case                                                                                                                                                | Expected                                                              | Result |
| -- | --------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------- | ------ |
| 1  | 2024 GTY (高本贯通) + remark `与高本贯通合班` vs 2025 GTY (高本贯通)                                                                                  | 2025 GTY is rejected by cohort strict equal                            | PASS   |
| 2  | 2024 SF + remark `与森林草原防火合班` vs 2025 SF                                                                                                     | 2025 SF is rejected by cohort strict equal                            | PASS   |
| 3  | 2025 GTY + remark `与森林草原防火合班` (single 2025 SF in candidate set)                                                                            | matches 2025 SF; 2024 SF rejected                                      | PASS   |
| 4  | 2025 SF + remark `与高本贯通合班`                                                                                                                     | matches 2025 GTY; 2024 GTY rejected                                    | PASS   |
| 5  | 2025 GTY + remark `与森林草原防火合班` (single 2025 SF in 2-class set)                                                                              | matches 2025 SF; no AMBIGUOUS warning                                  | PASS   |
| 6  | 2025 机械1班 + remark `与机械合班` (3 candidate 2025 机械X班)                                                                                        | AMBIGUOUS warning; result empty (no auto-link)                        | PASS   |
| 7  | K18-B pattern: 2025 GTY baseClass + remark `与高本贯通合班` vs 2024 GTY 1班/2班 + 2024 机械                                                            | 2024 GTY 1班/2班 rejected; self skipped                                | PASS   |
| 8  | K18-E3 pattern: 2025 GTY + remark `与森林草原防火合班` (single 2025 SF + 2024 SF)                                                                   | matches 2025 SF; 2024 SF rejected                                      | PASS   |
| 9  | Explicit year remark: 2024 GTY + remark `与2024级钢铁智能冶金技术1班（高本贯通）合班`                                                                  | allowed (cohort equal) or empty if no exact                           | PASS   |
| 10 | Filter strict-equal: 2024 GTY + remark `与钢铁智能冶金技术1班合班` vs 2025 GTY                                                                         | 2025 GTY rejected                                                      | PASS   |
| 11 | `classifyCrossCohortWarnings` shape (4 cross-cohort warnings + 1 non-cross-cohort warning)                                                          | 4 cross-cohort classified; 1 un-related ignored; total=4              | PASS   |
| 12 | `extractCohortYearFromClassName` safety (course names, dates, empty)                                                                                 | returns `null` for non-class names                                    | PASS   |

Plus 7 `extractCohortYearFromClassName` unit tests (T0) covering `2024级`,
`2025级`, `24级`, `25级`, course name, empty, year-like prefix.

**Total: 31 PASS / 0 FAIL**.

## 10. Backward Compatibility

- `extractCohortYearFromClassName` is the only new export; existing callers
  unaffected.
- `filterCandidatesByYearAndTrack` is internal; not exported. The signature is
  unchanged.
- `findMergedClassNames` is exported; its signature is unchanged. Callers
  (only `prepareRecords` in the same file) continue to work — they receive a
  `string[]` and may or may not consult `warnings[]`.
- `parseRemarkKeywords` is exported; its signature and output shape unchanged.
- `executeImportInTransaction` is internal; the cross-cohort audit runs only
  when `classGroupIds.length > 1` and adds warning strings; no existing
  behavior is changed for same-cohort tasks.
- `classifyCrossCohortWarnings` is a new export. Existing `ImportClassificationResult`
  shape is preserved; downstream API routes that consume warnings continue to
  receive the same string list.
- The new warning categories are string-prefix-based, so any consumer that
  filters by string pattern (e.g. `warnings.includes('AMBIGUOUS')`) continues
  to work; new categories are additive.

## 11. Out of Scope

- Prisma schema: no `crossCohortApproved` field, no `importSourceEvidence` table.
- API routes: no changes to `confirm/route.ts`, `parse/route.ts`, etc.
- Frontend: no UI changes; warnings are surfaced only through existing
  `warnings[]` field in the dry-run / confirm response.
- Parser: no changes to `parse-utils.ts` or `word-parser.ts`.
- Solver: untouched.
- RBAC: untouched.
- Re-import of K18 source artifacts: not executed.
- Alias / synonym expansion table (e.g. `森防` → `森林草原防火`): deferred.
- Source-evidence traceability (which source row / keyword created each
  TeachingTaskClass link): deferred.

## 12. Verification Results

Run via `npx.cmd tsx` on Windows; equivalent on POSIX:

```
K19-FIX-A Import Matching Cohort Guard Verification
═══════════════════════════════════════════════════════
[T0] extractCohortYearFromClassName  — 7 PASS
[T1] 2024 高本贯通 cohort guard     — 1 PASS
[T2] 2024 森林草原防火 cohort guard  — 1 PASS
[T3] source 2025 GTY 森林草原防火合班 — 2 PASS
[T4] source 2025 SF 高本贯通合班     — 2 PASS
[T5] same-cohort 合班 positive case  — 2 PASS
[T6] ambiguous implicit remark guard — 2 PASS
[T7] K18-B pattern                   — 3 PASS
[T8] K18-E3 task37 pattern           — 2 PASS
[T9]  explicit year remark           — 1 PASS
[T10] filter strict-equal guard      — 1 PASS
[T11] classifyCrossCohortWarnings    — 5 PASS
[T12] extractCohortYear safety       — 2 PASS
═══════════════════════════════════════════════════════
Summary: 31 PASS / 0 FAIL
═══════════════════════════════════════════════════════
```

## 13. Remaining Risks

- **No schema-level crossCohortApproved field.** This stage emits
  `LEGAL_PUBLIC_CROSS_COHORT` warnings but cannot block imports at the API
  layer. A future stage may add a schema column for explicit operator
  approval.
- **Import UI warning display unchanged.** The warnings are present in the
  `warnings[]` response, but the import UI may not yet surface the new
  categories distinctly. A future UI stage can add colour-coding.
- **No source-evidence traceability.** `TeachingTaskClass` has no
  `sourceRowIndex` / `sourceKeyword` column. A future schema change is needed
  for end-to-end reproducibility.
- **Alias expansion deferred.** `森防` → `森林草原防火` is a separate concern.
  The current stage correctly prevents cross-cohort mis-merge via the cohort
  filter, but does not improve alias coverage. If a real import batch has
  `与森防合班` and the importer has no class named `森防`, the merge simply
  fails silently (no auto-link), which is the correct conservative behavior.
- **K19 audit MEDIUM findings partially addressed.** Some MEDIUM findings
  (warning schema, UI display, source-evidence) are out of scope for this
  stage. MEDIUM severity is preserved as an INFO reminder in the audit
  report; closure of those findings depends on K19-FIX-B / K19-FIX-C.

## 14. Suggested Next Stage

**K19-FIX-B-IMPORT-CROSS-COHORT-PERSISTENT-FLAG**: add schema-level
`crossCohortApproved: boolean` field on `TeachingTask` (or import-level
override), with API flag `forceCrossCohort: true` for the confirm route.
Persist cross-cohort warnings into `ImportBatch.warningsJson` (already
supported) and add UI badge for cross-cohort tasks. Recommended scope:

- `prisma/schema.prisma` migration for `crossCohortApproved`
- `src/lib/import/importer.ts` guard to require approval before creating
  cross-cohort TeachingTask
- `src/app/api/admin/import/confirm/route.ts` flag pass-through
- frontend import-confirm dialog: explicit "allow cross-cohort" toggle
- regression tests covering operator-approval flow

This stage (K19-FIX-A) is **warning-first, non-blocking** and sufficient to
close the K19 MEDIUM findings that pertain to importer-side matching. The
remaining MEDIUM findings (schema-level gating, UI) belong to K19-FIX-B.
