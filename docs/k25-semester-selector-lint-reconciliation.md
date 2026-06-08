# K25-E1: Semester Selector Lint Baseline Reconciliation

## 1. Executive Summary

K25-E functional implementation was complete. This stage resolves the lint baseline drift that prevented K25-E from closing.

- **K25-E introduced 0 new lint errors and 0 new warnings** after correction
- The reported +1 error / +2 warnings were caused by:
  - A temporary analysis script (`scripts/tmp-parse-lint.js`) that was not cleaned up before lint count
  - A K25-E `useEffect` in `admin-db-content.tsx` that duplicated the existing `activeTable` effect, creating a redundant `set-state-in-effect` error
  - `fetchEntityOptions`/`fetchTaskOptions` closures capturing `currentSemesterId`, making them unstable and triggering `exhaustive-deps` warnings on existing effects
- **Fix**: deleted temp script, merged the duplicate useEffect, changed `fetchData`/`fetchEntityOptions`/`fetchTaskOptions` to read `currentSemesterId` from the Zustand store at call time (not closure capture)
- **K25-E can now be formally closed**
- No runtime behavior was changed

## 2. GitHub Sync Status

| Field | Value |
|---|---|
| Branch | `master` |
| Remote | `origin` → `git@github.com:Satanecinl/Course-Development-System.git` |
| Tracking | `origin/master` |
| Local HEAD before | `6222305` |
| Remote HEAD before | `6222305` |
| Fetch | ✅ executed |
| Pull/rebase | not needed (up to date) |
| Push | (to be filled after commit) |
| Force push | ❌ never |

## 3. Baseline Comparison

| Metric | K25-D2 baseline | K25-E reported | K25-E1 final |
|---|---|---|---|
| Errors | 184 | 185 | 184 |
| Warnings | 136 | 138 | 136 |
| Delta | — | +1 / +2 | 0 / 0 |

**Baseline comparison method**: Created a git worktree at K25-D2 commit `053c550`, ran `npx eslint . --ext .ts,.tsx -f json` in both worktrees, exported sorted issue lists (`file:line:col:severity:rule`), and ran `diff` to identify the 4 new issues and 0 removed issues (net +1 error + +2 warnings from admin-db, +1 error from temp script).

## 4. Located Issues

| File | Line | Rule | Cause | Fix |
|---|---|---|---|---|
| `scripts/tmp-parse-lint.js` | 2 | `@typescript-eslint/no-require-imports` | Temp analysis script created during investigation, not cleaned up | Deleted the file |
| `src/app/admin/db/admin-db-content.tsx` | 144 | `react-hooks/set-state-in-effect` | K25-E added a separate `useEffect` for semester-change that duplicated the existing `activeTable` effect | Merged into existing effect |
| `src/app/admin/db/admin-db-content.tsx` | 151 | `react-hooks/exhaustive-deps` | `fetchData` captured `currentSemesterId` in closure, making it an unstable dependency | Changed to read from `useSemesterStore.getState()` at call time |
| `src/app/admin/db/admin-db-content.tsx` | 156 | `react-hooks/exhaustive-deps` | `fetchEntityOptions` captured `currentSemesterId` in closure | Same fix — read from store at call time |

## 5. Fixes Applied

### Fix 1: Delete temp script
Deleted `scripts/tmp-parse-lint.js` — an investigation artifact that used `require()` and was never intended to be committed.

### Fix 2: Merge duplicate useEffect
The K25-E code had a separate `useEffect` watching `[semesterLoaded, currentSemesterId]` that called `fetchData(activeTable)`, `fetchCounts()`, and `fetchEntityOptions()`. The existing code already had a `useEffect` watching `[activeTable]` that called `fetchData(activeTable)`. Merged these into a single effect watching `[activeTable, semesterLoaded, currentSemesterId]` with a `semesterLoaded` guard. This eliminates 1 `set-state-in-effect` error.

### Fix 3: Stabilize function closures
Changed `fetchData`, `fetchEntityOptions`, and `fetchTaskOptions` to read `currentSemesterId` from `useSemesterStore.getState()` at call time instead of capturing it from the React component closure. This makes these functions stable references, eliminating the `exhaustive-deps` warnings on effects that use them but don't list them as dependencies.

**Runtime behavior**: Identical. The semester value is read from the same Zustand store at the same point in time. The only difference is whether the value comes from a closure capture or a store read — both return the same value.

## 6. Verification Results

| Command | Result |
|---|---|
| `npx tsx scripts/audit-lint-baseline-k25-e1.ts` | ✅ PASS=125 FAIL=0 |
| `npx tsx scripts/verify-semester-selector-ux-k25-e.ts` | ✅ PASS=64 FAIL=0 |
| `npx tsx scripts/verify-schedule-api-response-compat-k25-d1.ts` | ✅ PASS=20 FAIL=0 |
| `npx tsx scripts/verify-semester-scoping-api-k25-d.ts` | ✅ PASS=54 FAIL=0 |
| `npx tsx scripts/validate-multi-semester-schema-k25-c.ts` | ✅ 37/37 PASS |
| `npx prisma validate` | ✅ valid |
| `npx prisma migrate status` | ✅ up to date |
| `npm run build` | ✅ compiled |
| `npm run lint` | ✅ 184 errors / 136 warnings (matches K25-D2 baseline) |
| `npm run test:auth-foundation` | 53 passed / 1 failed |

## 7. test:auth-foundation

- ✅ Ran
- Result: 53 passed / 1 failed
- Only failure: `ScheduleAdjustment ACTIVE = 0 (实际 10)` — pre-existing, unchanged
- No business data was modified

## 8. Unmodified Scope

- ✅ Schema: not modified
- ✅ Migrations: not added
- ✅ DB: not written
- ✅ API scoping: not expanded
- ✅ K25-E UI functionality: not expanded (only useEffect structure changed)
- ✅ Frontend selector runtime: not broken (identical behavior)
- ✅ Scheduler / score / solver: not modified
- ✅ Importer / parser: not modified
- ✅ RBAC: not modified
- ✅ K22 / K23 / K24 expected: not modified
- ✅ reset / force reset / seed: not run

## 9. Recommendation

- ✅ **K25-E1 can be closed**
- ✅ **K25-E can be formally closed** — lint baseline is clean
- ✅ Recommend entering **K25-F-MULTI-SEMESTER-E2E-MANUAL-TRIAL**
- K25-F should be browser-based manual verification only — no new features
