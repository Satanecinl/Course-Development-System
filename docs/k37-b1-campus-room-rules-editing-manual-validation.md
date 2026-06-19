# K37-B1 Campus Room Rules Editing Manual Validation

## Stage

```text
K37-B1-CAMPUS-ROOM-RULES-EDITING-MANUAL-VALIDATION
```

## 1. Purpose

Record browser manual validation results for K37-B campus room rules editing
implementation. Auto-verification is complete; browser checklist requires
human confirmation.

## 2. Validation Environment

| Item | Value |
|---|---|
| Dev server | `npm run dev` on `localhost:3000` |
| Browser | User's browser (to be confirmed) |
| Auth | ADMIN account with `settings:manage` permission |
| HEAD | `47e35d6a0a38f4bd20274f9c566dab1c4173d6f8` |
| Branch | `master` |

## 3. Pre-Validation Data State

| Item | Value |
|---|---|
| Room count | 42 |
| isLinxiao=true count | 5 |
| Linxiao rooms | 林校301, 林校303, 林校304, 林校305, 林校306 |
| ScheduleSlot count | 440 |
| TeachingTask count | 308 |
| ScheduleAdjustment count | 67 |

## 4. Manual Checklist Results

### 一、Page Basic Checks

| # | Check | Auto/Manual | Result |
|---|---|---|---|
| 1 | Title "校区 / 教室规则设置" | Manual | ⏳ Pending user |
| 2 | Badge "基础可编辑版" | Manual | ⏳ Pending user |
| 3 | No "诊断增强版（不可编辑）" as primary | **Auto** | ✅ PASS |
| 4 | Summary cards visible | Manual | ⏳ Pending user |
| 5 | Linxiao count = 5 | **Auto** | ✅ PASS (5 verified) |
| 6 | HC6 hard rule "强制启用 / 不可关闭" | Manual | ⏳ Pending user |
| 7 | No HC6 close button | **Auto** | ✅ PASS (verify #13) |
| 8 | No React runtime error | Manual | ⏳ Pending user |
| 9 | No [object Object] | Manual | ⏳ Pending user |

### 二、Room Table Checks

| # | Check | Auto/Manual | Result |
|---|---|---|---|
| 1 | All rooms displayed | **Auto** | ✅ PASS (verify #6) |
| 2 | Columns: ID, name, capacity, type, isLinxiao, source, action | Manual | ⏳ Pending user |
| 3 | 林校301/303/304/305/306 show isLinxiao=true | **Auto** | ✅ PASS (DB verified) |
| 4 | Non-linxiao rooms show false | Manual | ⏳ Pending user |
| 5 | Search by name functional | Manual | ⏳ Pending user |
| 6 | Filter (all/linxiao/non-linxiao) functional | Manual | ⏳ Pending user |
| 7 | Refresh button works | Manual | ⏳ Pending user |

### 三、Editing Tests

#### Test A: Mark as Linxiao (non-key room)

| # | Step | Manual | Result |
|---|---|---|---|
| 1 | Click "标记为林校" on a non-linxiao room | Manual | ⏳ Pending user |
| 2 | Confirm dialog appears | Manual | ⏳ Pending user |
| 3 | Success toast appears | Manual | ⏳ Pending user |
| 4 | Table status changes to linxiao | Manual | ⏳ Pending user |
| 5 | Linxiao count +1 | Manual | ⏳ Pending user |
| 6 | HC5/HC6 summary refreshes | Manual | ⏳ Pending user |
| 7 | HC6 warning (if any) doesn't crash page | Manual | ⏳ Pending user |

#### Test B: Unmark as Linxiao

| # | Step | Manual | Result |
|---|---|---|---|
| 1 | Click "取消林校" on the same room | Manual | ⏳ Pending user |
| 2 | Success toast appears | Manual | ⏳ Pending user |
| 3 | Table status returns to non-linxiao | Manual | ⏳ Pending user |
| 4 | Linxiao count returns to 5 | Manual | ⏳ Pending user |
| 5 | HC5/HC6 summary refreshes | Manual | ⏳ Pending user |
| 6 | No React error | Manual | ⏳ Pending user |

#### Test C (optional): Toggle linxiao room

If business permits, toggle 林校301 or another linxiao room and restore.
Skip if data concern.

### 四、Post-Validation Data Recovery

| Item | Required | Pre-test | Post-test (must match) |
|---|---|---|---|
| Room count | 42 | 42 | ⏳ Pending user |
| isLinxiao=true count | 5 | 5 | ⏳ Pending user |
| Linxiao rooms | 林校301/303/304/305/306 | ✅ | ⏳ Pending user |
| ScheduleSlot count | 440 | 440 | ⏳ Pending user |
| TeachingTask count | 308 | 308 | ⏳ Pending user |
| ScheduleAdjustment count | 67 | 67 | ⏳ Pending user |

## 5. Auto-Verification Results

| Item | Result |
|---|---|
| K37-B verify | ✅ 25/25 PASS |
| K37-A verify | ✅ 25/25 PASS |
| K36-B1A5 verify | ✅ 19/19 PASS |
| K22-C regression | ✅ 73/0/0/0 (restored) |
| PII scan | ✅ 0 BLOCKING |
| Prisma validate | ✅ valid |
| Prisma migrate status | ✅ up to date |
| Build | ✅ PASS |
| DB data check (direct) | ✅ 42 rooms, 5 linxiao, slot/task/adj unchanged |

## 6. Summary

| Category | Auto PASS | Manual Pending | Total |
|---|---|---|---|
| Page basic | 4 | 5 | 9 |
| Room table | 2 | 5 | 7 |
| Editing A (mark) | 0 | 7 | 7 |
| Editing B (unmark) | 0 | 6 | 6 |
| Editing C (toggle, optional) | 0 | 0 | 0 |
| Post-recovery | 2 | 4 | 6 |
| **Total** | **8** | **27** | **35** |

## 7. Issues Found

No auto-detected issues. Manual browser testing pending.

## 8. Recommendations

- If all manual checks pass: **READY_FOR_REAL_USE**
- If minor UI bugs found: K37-B2 polish stage
- Browser testing should confirm dev server running + ADMIN logged in