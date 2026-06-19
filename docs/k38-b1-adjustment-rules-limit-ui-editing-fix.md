# K38-B1 Adjustment Rules Limit UI Editing Fix

## Stage

```text
K38-B1-ADJUSTMENT-RULES-LIMIT-UI-EDITING-FIX
```

## 1. Root Cause

K38-B added `AdjustmentRuleConfig` table, PATCH API, and recommendation config integration, but the UI panel (`adjustment-rules-settings-panel.tsx`) was never updated to include the actual editing controls. The panel only displayed `current=5, range=1-20, source=database, 可编辑` with no input field, save button, or editing flow.

## 2. UI Changes

| Before | After |
|---|---|
| Badge "诊断增强版" | Badge **"基础可配置版"** |
| Lock icon + "可编辑" text | **Number input + 保存 + 取消 + loading** |
| No toast handling | **Success + error toasts** |
| No frontend validation | **isNaN / min / max validation** |
| No dirty state | **Dirty indicator: 已修改（当前已确认值：X）** |
| Editability notice references K38-A | **Updated to reference K38-B1 editable status** |

## 3. Client API

New function: `patchAdjustmentRulesSettings({ defaultRecommendationLimit })`
- Method: PATCH
- Content-Type: application/json
- Returns: `{ success, config: { defaultRecommendationLimit, source } }`

## 4. Frontend Validation

- `parseInt(editingLimit, 10)` — must be integer
- `min=1, max=20` — HTML input attrs + explicit checks
- Empty/non-number: shows error, no PATCH
- Backend validates independently (defense in depth)

## 5. Save Flow

1. User edits input → dirty state shown
2. Click 保存 → loading spinner
3. PATCH to `/api/admin/settings/adjustment-rules`
4. Success: toast + refresh GET + update confirmed value
5. Failure: toast + error message + keep current value

## 6. Locked Rules (unchanged)

- dry-run guard: 🔒 hard-locked
- apply guard: 🔒 hard-locked
- WorkTime allowWeekend: controlled by WorkTime settings page
- Conflict guards: 🔒 hard-locked

## 7. Verification

| Script | Result |
|---|---|
| K38-B1 verify | ✅ 21/21 PASS |
| K38-B verify | ✅ 23/23 PASS |
| K38-A verify | ✅ 22/22 PASS (updated for K38-B1) |
| K37-C verify | ✅ 23/23 PASS |
| K22-C regression | ✅ 73/0/0/0 (no drift) |
| Build | ✅ PASS |
| ESLint | ✅ 0 errors |
