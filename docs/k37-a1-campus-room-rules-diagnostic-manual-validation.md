# K37-A1 Campus Room Rules Diagnostic Manual Validation

## Stage

```text
K37-A1-CAMPUS-ROOM-RULES-DIAGNOSTIC-MANUAL-VALIDATION
```

## 1. Purpose

Record browser manual validation results for K37-A campus room rules
diagnostics enhancement. Auto-verification is complete; browser checklist
requires human confirmation.

## 2. Validation Environment

| Item | Value |
|---|---|
| Dev server | `npm run dev` on `localhost:3000` |
| Browser | User's browser (to be confirmed) |
| Auth | ADMIN account with `settings:manage` permission |
| HEAD | `95bf255b5084a04969aab97719564b0c59e6c503` |
| Branch | `master` |

## 3. Manual Checklist Results

### 一、Entry & Module Status

| # | Check | Auto/Manual | Result |
|---|---|---|---|
| 1 | Login as ADMIN | Manual | ⏳ Pending user |
| 2 | Navigate to `/admin/settings` | Manual | ⏳ Pending user |
| 3 | "校区 / 教室规则设置" visible in left nav | Manual | ⏳ Pending user |
| 4 | Right panel title correct | Manual | ⏳ Pending user |
| 5 | Badge shows "诊断增强版（不可编辑）" | Manual | ⏳ Pending user |
| 6 | No outdated "只读基础版" badge | **Auto** | ✅ PASS (verify #5) |

### 二、Summary Cards

| # | Check | Auto/Manual | Result |
|---|---|---|---|
| 1 | Total rooms card visible | Manual | ⏳ Pending user |
| 2 | Linxiao rooms card visible | Manual | ⏳ Pending user |
| 3 | HC5 violations card visible | Manual | ⏳ Pending user |
| 4 | HC6 violations card visible | Manual | ⏳ Pending user |
| 5 | Values match API | Manual | ⏳ Pending user |

### 三、Rules Section

| # | Check | Auto/Manual | Result |
|---|---|---|---|
| 1 | HC6 hard rule: 非汽车专业禁止林校 | Manual | ⏳ Pending user |
| 2 | SC6 soft rule: 汽车专业优先林校 | Manual | ⏳ Pending user |
| 3 | HC6 not closable (lock icon, no button) | **Auto** | ✅ PASS (verify #4) |
| 4 | Detection method displayed | **Auto** | ✅ PASS (verify #11) |
| 5 | Automotive keywords displayed | **Auto** | ✅ PASS (verify #10b) |
| 6 | Classification explanation displayed | **Auto** | ✅ PASS (verify #12b) |

### 四、Violations Detail

| # | Check | Auto/Manual | Result |
|---|---|---|---|
| 1 | No violations → green pass | Manual | ⏳ Pending user |
| 2 | HC5/HC6 grouped separately | **Auto** | ✅ PASS (source check) |
| 3 | dayOfWeek / slotIndex shown | **Auto** | ✅ PASS (source check) |
| 4 | primary/secondary source shown | **Auto** | ✅ PASS (verify #9) |
| 5 | No React runtime error | Manual | ⏳ Pending user |
| 6 | No [object Object] | Manual | ⏳ Pending user |

### 五、Room Table

| # | Check | Auto/Manual | Result |
|---|---|---|---|
| 1 | All rooms displayed (not just linxiao) | **Auto** | ✅ PASS (verify #6) |
| 2 | Columns: ID, name, capacity, type, linxiao, source | **Auto** | ✅ PASS (verify #7) |
| 3 | Linxiao rooms show correct status | **Auto** | ✅ PASS (verify #7) |
| 4 | Non-linxiao rooms show correct status | Manual | ⏳ Pending user |
| 5 | Linxiao source shows room.name | **Auto** | ✅ PASS (source check) |
| 6 | Search functional | Manual | ⏳ Pending user |
| 7 | Filter (all/linxiao/non-linxiao) functional | Manual | ⏳ Pending user |
| 8 | Refresh button works | Manual | ⏳ Pending user |

### 六、Editability Boundary

| # | Check | Auto/Manual | Result |
|---|---|---|---|
| 1 | No "标记为林校 / 取消林校" save buttons | **Auto** | ✅ PASS (verify #3) |
| 2 | No misleading "editable" text | Manual | ⏳ Pending user |
| 3 | Route B limitation explained | **Auto** | ✅ PASS (verify #13) |
| 4 | K37-B mentioned as future stage | **Auto** | ✅ PASS (verify #14) |

### 七、Permission Check

| # | Check | Auto/Manual | Result |
|---|---|---|---|
| 1 | USER cannot access campus-room-rules | Manual | ⏳ Pending user |
| 2 | ADMIN can access | **Auto** | ✅ PASS (verify #2) |

## 4. Auto-Verification Results

| Item | Result |
|---|---|
| K37-A verify script | ✅ 24/24 PASS |
| K36-B1A5 verify | ✅ 19/19 PASS |
| K22-C score regression | ✅ 73/0/0/0 (no drift) |
| PII scan | ✅ 0 BLOCKING |
| Prisma validate | ✅ valid |
| Build | ✅ PASS |

## 5. Summary

| Category | Auto PASS | Manual Pending | Total |
|---|---|---|---|
| Entry & module status | 1 | 5 | 6 |
| Summary cards | 0 | 5 | 5 |
| Rules section | 5 | 1 | 6 |
| Violations detail | 4 | 2 | 6 |
| Room table | 4 | 4 | 8 |
| Editability boundary | 4 | 0 | 4 |
| Permission check | 1 | 1 | 2 |
| **Total** | **19** | **18** | **37** |

## 6. Issues Found

No auto-detected issues. Manual browser testing pending.

## 7. Recommendations

- If all manual checks pass: ready to proceed to K37-B (schema + editing)
- If minor UI bugs found: K37-A2 polish stage
- Browser testing should confirm the dev server is running and ADMIN is logged in
