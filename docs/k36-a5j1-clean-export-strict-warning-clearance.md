# K36-A5J1 Clean Export Strict Warning Clearance

## Stage

```text
K36-A5J1-CLEAN-EXPORT-STRICT-WARNING-CLEARANCE
```

## 1. Purpose

Clear the 12 strict-mode warnings from K36-A5J clean export so the package can
achieve strict guard PASS and be marked as externally deliverable.

## 2. A5J Blocking Point

K36-A5J produced a clean export package that passed guard in default mode
(0 blocking, 12 warnings → PASS) but failed in strict mode (12 warnings
treated as blocking → FAIL). The 12 warnings were all false positives from
safe source code and synthetic data, but the guard had no mechanism to
acknowledge them as verified-safe.

## 3. Strategy: A (Refined Guard + Allowlist)

Implemented `--allowlist` flag on the guard script. When provided with a JSON
file listing verified-safe path+ruleId pairs, the guard suppresses those
warnings in strict mode while preserving them in the output for transparency.

### Guard Changes

| Change | File | Description |
|---|---|---|
| Added `--allowlist <path>` arg | `scripts/guard-release-package-k36-a5g.ts` | Loads JSON allowlist file |
| Added `allowedWarningCount` | `ScanResult` interface | Tracks suppressed warnings |
| Updated verdict logic | `scanPaths()` | `strict && (warning - allowed > 0)` → FAIL |
| Updated output | `formatHumanReadable()` | Shows allowed/unresolved counts |
| Self-test | unchanged | 17/17 PASS without allowlist |

### Allowlist File

`docs/k36-a5j-export-warning-allowlist.json` — 12 entries, each with:
- `path`: exact relative path
- `ruleId`: the guard rule that generated the warning
- `reason`: why this path contains no sensitive data
- `approvedForExternalExport: true`

## 4. Per-Warning Treatment Table

| # | Path | Rule | Decision | Reason | Final |
|---|---|---|---|---|---|
| 1 | `data/class-student-count.template.csv` | CSV_FILE | Included + allowlisted | 3-line synthetic template (测试专业2026级甲班/乙班) | ✅ Safe |
| 2 | `data/room-capacity.template.csv` | CSV_FILE | Included + allowlisted | 4-line synthetic template (SYN-R101/R102/LAB01) | ✅ Safe |
| 3 | `docs/k22-teacher-day-balance-constraint-impl.json` | PATH_TEACHER | Included + allowlisted | Design spec, 0 real teacher names | ✅ Safe |
| 4 | `docs/k22-teacher-day-balance-constraint-impl.md` | PATH_TEACHER | Included + allowlisted | Markdown version | ✅ Safe |
| 5 | `docs/k22-teacher-day-balance-soft-constraint-audit.json` | PATH_TEACHER | Included + allowlisted | Audit record, 0 real teacher names | ✅ Safe |
| 6 | `docs/k22-teacher-day-balance-soft-constraint-audit.md` | PATH_TEACHER | Included + allowlisted | Markdown version | ✅ Safe |
| 7 | `scripts/audit-teacher-day-balance-soft-constraint-k22-f1.ts` | PATH_TEACHER | Included + allowlisted | TypeScript audit, no real data | ✅ Safe |
| 8 | `scripts/build_teacher_whitelist.py` | PATH_TEACHER | Included + allowlisted | Python utility, no hardcoded real names | ✅ Safe |
| 9 | `scripts/diagnose_teachers.ts` | PATH_TEACHER | Included + allowlisted | TypeScript diagnostic, keyword filters only | ✅ Safe |
| 10 | `scripts/fixtures/teachers.synthetic.txt` | PATH_TEACHER | Included + allowlisted | Synthetic fixture (测试教师甲/乙/丙) | ✅ Safe |
| 11 | `scripts/verify-teacher-day-balance-constraint-k22-f4.ts` | PATH_TEACHER | Included + allowlisted | TypeScript verify, synthetic test data | ✅ Safe |
| 12 | `src/app/api/teachers/route.ts` | PATH_TEACHER | Included + allowlisted | API route source code, no hardcoded data | ✅ Safe |

Additional exclusions (same as A5J):
- `docs/k18-task37-source-artifact-review.json` — Excluded (PII: masked phone)
- `docs/k22-real-solver-quality-evaluation.json` — Excluded (PII: masked phone)
- `templates/串课申请表模板.xlsx` — Excluded (tracked xlsx)

## 5. New Package Info

| Item | Value |
|---|---|
| **Staging path** | `temp/clean-export/k36-a5j/staging/` |
| **Archive path** | `temp/clean-export/k36-a5j/package/courscheduling-system-v1.0.0-clean.tar.gz` |
| **SHA256** | `5f0b2a520a595d445ecabbb58683ca1925282974eb6e0e27ac2c46f767088c70` |
| **File count** | 951 |
| **Size** | 2.4 MB |

## 6. Strict Guard Verification

### Staging (strict + allowlist)

```
Verdict:  PASS ✅
Scanned:  950
Blocking: 0
Warnings: 12
Allowed:  12
Unresolved: 0
```

### Archive manifest (strict + allowlist)

```
Verdict:  PASS ✅
Scanned:  951
Blocking: 0
Warnings: 12
Allowed:  12
Unresolved: 0
```

### Self-test (no allowlist)

```
17/17 PASS ✅
```

## 7. PII / Build / Baseline Verification

| Item | Result |
|---|---|
| `npm run scan:docs-pii` | ✅ 0 BLOCKING, 2 WARNING (unchanged) |
| `npx prisma validate` | ✅ schema valid |
| `npm run build` | ✅ Compiled successfully |
| `npx eslint guard script` | ✅ 0 errors |
| `git diff --check` | ✅ empty |
| `git diff --cached --check` | ✅ empty |

## 8. Delivery Readiness

| Criterion | Status |
|---|---|
| Guard strict PASS (staging) | ✅ |
| Guard strict PASS (archive manifest) | ✅ |
| Blocking = 0 | ✅ |
| Unresolved warnings = 0 | ✅ |
| PII flagged docs excluded | ✅ |
| No real data in package | ✅ |
| Allowlist documented | ✅ (12 entries with reasons) |
| **Package externally deliverable** | **YES** |
