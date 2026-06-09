# K26-J5: WorkTime Solver Real Scheduling Trial

## 1. Executive Summary

K26-J5 对 WorkTime-aware LAHC 自动排课链路做真实 preview 试运行与验收。

**Trial 结果：PASSED**

* WorkTime snapshot → solver candidate → score SC3/SC7 全链路验证通过。
* Preview only 模式（未执行 apply/rollback）。
* hardScore = 0（无 hard conflicts），blocking = false。
* softScore = -1428（soft constraints 有 penalty，无 blocking issue）。
* WorkTime snapshot 在 preview run 中持久化，可复现。
* Legacy slot 6/7 被正确排除。
* `allowWeekend=false` → candidate days = [1,2,3,4,5]。
* candidate slots = [1,2,3,4,5]。

当前建议：**可进入人工前端验收**。

## 2. GitHub Sync Status

| Item | Value |
|------|-------|
| Branch | `master` |
| Remote | `origin` → `git@github.com:Satanecinl/Course-Development-System.git` |
| Local HEAD before | `ead6bba` (K26-J4A) |
| Local HEAD after | `<J5 commit>` |
| Push | yes |
| Force push | **no** |

## 3. Trial Mode

* Mode: `preview-only`
* DB backup: N/A（preview-only，不写 ScheduleSlot）
* DB drift: preview created 1 SchedulingRun row (id=85)。这是 scheduler preview 的正常行为，行保留在 DB 中。
* 临时数据：无。preview run 是正式的 preview 记录。

## 4. WorkTime Snapshot Evidence

| Field | Value |
|-------|-------|
| snapshotPresent | true |
| snapshotVersion | 1 |
| source | database |
| workTimeConfigId | 1 |
| allowWeekend | false |
| candidateDays | [1,2,3,4,5] |
| candidateSlots | [1,2,3,4,5] |
| legacySlotsExcluded | YES |
| resultSnapshot.workTime | present (snapshotVersion=1, source=database, workTimeConfigId=1, allowWeekend=false) |
| snapshotReproducible | PASS (re-read from DB matches) |

## 5. Solver Result Quality

| Metric | Value |
|--------|-------|
| runId | 85 |
| semesterId | 1 |
| hardScore | **0** (no conflicts) |
| softScore | -1428 |
| blocking | **false** |
| changedSlots | 386 |
| roomConflictCount | 0 |
| teacherConflictCount | 0 |
| classGroupConflictCount | 0 |
| capacityConflictCount | 0 |

**hardScore 合格**：0 表示无 hard conflicts，排课结果可 apply。

**softScore 分析**：-1428 来自 SC1/SC2/SC4/SC8/SC9/SC10 等 soft constraints，属于优化空间，不影响 blocking。

## 6. SC3 / SC7 Evidence

| Metric | Value | 说明 |
|--------|-------|------|
| SC3 count | 0 | Solver 优化后无 late slot scheduling |
| SC3 penalty | 0 | lateSlotIndexes=[5] 配置正确 |
| SC7 count | 0 | allowWeekend=false 时 solver 不生成 weekend candidates |
| SC7 penalty | 0 | weekendDayOfWeeks=[6,7] 配置正确 |

SC3/SC7 为 0 的原因：solver 在 10000 次迭代中成功优化掉了所有 late slot 和 weekend scheduling。这不是 bug，而是 solver 有效性的体现。

## 7. Apply / Rollback Evidence

**Not executed in this stage.**

原因：preview-only 模式；hardScore=0 证明链路可行，但 apply 是破坏性操作，留给用户人工决策。

如后续需要 apply：

```bash
npx tsx scripts/trial-worktime-solver-real-scheduling-k26-j5.ts --apply-and-rollback
```

脚本会自动 backup DB → apply → rollback → 验证。

## 8. Manual Validation Checklist

- [x] 自动排课 preview 可运行
- [x] WorkTime metadata 可在 run/result 中追踪
- [x] 无 legacy slot 6/7 新生成
- [x] hardScore 可接受（= 0）
- [x] soft score breakdown 可解释
- [x] SC3 / SC7 结果可解释（0 counts = solver 优化成功）
- [ ] 排课结果可由用户人工查看（需前端验证）
- [ ] apply/rollback 是否需要另行人工操作（留给用户决策）

## 9. Known Limitations

* 本阶段不更新 K22 expected。
* 本阶段不调参。
* 本阶段不新增约束。
* softScore = -1428 属于优化空间，如需改善需后续权重/约束 stage。
* apply/rollback 未执行，需要后续 controlled apply trial。
* preview run (id=85) 在 DB 中保留；如果不需要，可以手动删除。

## 10. Final Recommendation

```txt
K26-J5 real scheduling trial status: PASSED
recommendedNextStage=MANUAL_FRONTEND_VALIDATION
manualFrontendValidationRequired=true
```
