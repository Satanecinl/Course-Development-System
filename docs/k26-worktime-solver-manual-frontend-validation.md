# K26-J6: Manual Frontend Validation

## 1. Executive Summary

K26-J6 准备并记录前端人工验收流程。基于 J5 preview trial（runId=85, hardScore=0）的结果，指导用户在前端 dashboard 中确认 WorkTime-aware 排课 pipeline 的业务可接受性。

**本阶段不改 solver / score / UI / WorkTime API。**

当前状态：`PENDING_USER_VALIDATION`（技术就绪，等待用户人工确认）。

## 2. GitHub Sync Status

| Item | Value |
|------|-------|
| Branch | `master` |
| Remote | `origin` → `git@github.com:Satanecinl/Course-Development-System.git` |
| Local HEAD before | `b954ab7` (K26-J5) |
| Local HEAD after | `<J6 commit>` |
| Push | yes |
| Force push | **no** |

## 3. Trial Source

* J5 commit: `b954ab7`
* J5 runId=85
* mode: `preview-only`
* hardScore: `0`
* softScore: `-1428`
* candidateDays: `[1,2,3,4,5]`
* candidateSlots: `[1,2,3,4,5]`
* allowWeekend: `false`
* legacy slots excluded: `true`
* blocking: `false`
* changedSlots: `386`

如果当前 DB 中 runId=85 不存在，执行：

```bash
npx tsx scripts/trial-worktime-solver-real-scheduling-k26-j5.ts --preview-only
```

重新生成 preview run 并以新 runId 为准。

## 4. Manual Validation Checklist

### A. Preview run visibility

- [ ] 在 `/admin/scheduler/history` 或 run list 中找到 preview run (runId=85)
- [ ] 状态显示 `COMPLETED`
- [ ] hardScore = 0
- [ ] softScore = -1428
- [ ] changedSlotCount = 386

### B. WorkTime evidence

- [ ] run 有 WorkTime snapshot（可通过 API `/api/admin/scheduler/runs/85` 查看）
- [ ] `resultSnapshot.workTime.source = "database"`
- [ ] `resultSnapshot.workTime.allowWeekend = false`
- [ ] candidateDays 不含 6/7
- [ ] candidateSlots 不含 6/7
- [ ] 无 legacy slot 6/7 新生成课位

### C. Schedule grid evidence

- [ ] `/dashboard` 能显示 preview 结果的排课分布
- [ ] 课程分布在工作日（周一至周五）
- [ ] 节次只在 1-5
- [ ] 没有周末课
- [ ] 没有 11-12节 / 中午 legacy slot 新课位

### D. Score evidence

- [ ] hardScore=0 → 无 blocking conflicts
- [ ] blocking=false
- [ ] SC3 = 0（solver 优化后无 late slot scheduling）
- [ ] SC7 = 0（allowWeekend=false 时 solver 不生成 weekend）
- [ ] softScore breakdown 可读（来自 K22 breakdown UI）
- [ ] 用户能理解 soft penalty 来源（SC1/SC2/SC4/SC8/SC9/SC10 等）

### E. Business acceptance

- [ ] 排课结果是否业务上可接受
- [ ] 是否存在明显不合理课程分布
- [ ] 是否需要调参
- [ ] 是否需要新的业务约束
- [ ] 是否允许进入 apply/rollback controlled trial
- [ ] 是否允许关闭 K26-J 主线

## 5. Screenshot / Evidence Slots

| Screenshot | Status | Notes |
|------------|--------|-------|
| dashboard screenshot | _PENDING_ | |
| run detail screenshot | _PENDING_ | |
| score breakdown screenshot | _PENDING_ | |
| schedule grid screenshot | _PENDING_ | |
| WorkTime settings screenshot | _PENDING_ | |
| user decision notes | _PENDING_ | |

## 6. Pass / Fail Criteria

### PASS

* preview run 可在前端查看
* hardScore=0
* blocking=false
* 无 slot 6/7 新生成
* allowWeekend=false 时无 weekend
* score breakdown 可解释
* 用户人工确认可接受

### NEEDS_FIX

* UI 无法查看 run
* UI 数据与 CLI 不一致
* 生成 slot 6/7
* allowWeekend=false 仍生成 weekend
* hardScore 非 0
* score breakdown 不可解释
* 用户认为结果业务不可接受

## 7. Apply / Rollback Policy

**默认不 apply。**

auth foundation pre-existing failure: `ScheduleAdjustment ACTIVE = 0 (实际 10)`，未尝试修复。

如果用户后续要测试 apply/rollback：

1. 必须进入单独阶段（K26-J7）
2. 先 DB backup
3. apply 后检查 snapshot
4. rollback 后检查 data counts
5. 不在 J6 内执行

## 8. Current Status

```txt
manualFrontendValidationStatus=PENDING_USER_VALIDATION
manualFrontendValidationRequired=true
technicalReadiness=PASS
```

## 9. Recommended Next Stage

如果用户验收通过：`K26-J-WORKTIME-SOLVER-SCORE-INTEGRATION-ACCEPTANCE-CLOSEOUT`
如果用户验收失败：`K26-J6A-WORKTIME-SOLVER-FRONTEND-VALIDATION-FIX-PLAN`
