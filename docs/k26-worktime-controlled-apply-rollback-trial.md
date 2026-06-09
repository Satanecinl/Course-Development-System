# K26-K: Controlled Apply / Rollback Trial

## 1. Executive Summary

K26-K 进行 controlled apply / rollback trial，验证 K26-J 已完成 WorkTime-aware scheduler preview 结果能否安全 apply 并 rollback。

**Trial 结果：BLOCKED**

* apply 失败：post-apply validation 检测到 hard conflicts (`APPLY_POST_HARD_SCORE_NON_ZERO: hardScore=-2000`)，preview 声称 `hardScore=0` 但 apply 后状态 hardScore=-2000。
* rollback 未执行（因为 apply 未成功）。
* 业务数据未改变：apply 失败时 transaction 已 rollback DB 写入。
* DB backup 保留 2 份（每次 trial run 一份）。
* 不建议进入 K27 system-wide real usage。

**真实发现**：preview 报告的 hardScore=0 与 post-apply 实际 hardScore=-2000 不一致。这是 K26-J integration 链路的一个**真实问题**，需要单独 stage 调查（可能涉及 HC5/HC6 delta 不一致，或 preview 与 post-apply 的 hcAfter 统计差异）。

## 2. GitHub Sync Status

| Item | Value |
|------|-------|
| Branch | `master` |
| Remote | `origin` → `git@github.com:Satanecinl/Course-Development-System.git` |
| Local HEAD before | `52f200d` (K26-J closeout) |
| Local HEAD after | `<K26-K commit>` |
| Push | yes |
| Force push | **no** |
| Final worktree | clean |

## 3. Trial Mode

* mode: `controlled-apply-rollback`
* backup paths:
  * `prisma/dev.db.backup-before-k26-k-controlled-apply-rollback-2026-06-09T04-27-34-285Z`
  * `prisma/dev.db.backup-before-k26-k-controlled-apply-rollback-2026-06-09T04-29-01-876Z`
* create new preview: **YES** (default — `--create-new-preview` flag)
* reuse runId: NO
* previewRunId: 89 (first attempt), 90 (second attempt)
* applyRunId: N/A (apply failed)
* rollbackRunId: N/A (apply failed)

## 4. WorkTime Snapshot Evidence

* snapshot present: YES
* version: 1
* source: database
* workTimeConfigId: 1
* allowWeekend: false
* candidateDays: `[1,2,3,4,5]`
* candidateSlots: `[1,2,3,4,5]`
* legacy slot 6/7 excluded: YES
* preview/apply/rollback snapshot copy: N/A (apply failed before snapshot copy verification)

## 5. Apply Evidence

* apply run id: N/A (failed)
* apply result: **FAILED**
* error: `APPLY_POST_HARD_SCORE_NON_ZERO: hardScore=-2000 HC1=0 HC2=0 HC3=0 HC4=0`
* changed slot count: N/A
* SchedulerRunChange count: N/A
* ScheduleSlot signature after apply: **unchanged** (transaction rolled back)
* blocking conflicts: YES (post-apply validation detected)
* apply warnings / errors: hardScore mismatch between preview and post-apply

## 6. Rollback Evidence

* rollback run id: N/A (apply failed)
* rollback result: N/A
* rollback change count: N/A
* ScheduleSlot signature after rollback: N/A
* recovery to preApply: **YES (via transaction rollback)**
* rollback warnings / errors: N/A

## 7. Data Signature Comparison

| Signature | Pre-Apply | After Apply | After Rollback | Restored? |
|-----------| --------- | ----------- | -------------- | --------- |
| ScheduleSlot count | 440 | 440 | 440 | **YES** (apply failed → transaction rollback) |
| ScheduleSlot hash | unchanged | unchanged | unchanged | **YES** |
| TeachingTask count | 308 | 308 | 308 | **YES** |
| TeachingTaskClass count | 785 | 785 | 785 | **YES** |
| ScheduleAdjustment count | 10 | 10 | 10 | **YES** |
| SchedulingRun count | 78/79/80 | +1 (preview) | +1 (preview) | audit drift only |
| SchedulerRunChange count | 0 | 0 | 0 | YES |

## 8. Safety / Backup

* backup paths:
  * `prisma/dev.db.backup-before-k26-k-controlled-apply-rollback-2026-06-09T04-27-34-285Z` (3,735,552 bytes)
  * `prisma/dev.db.backup-before-k26-k-controlled-apply-rollback-2026-06-09T04-29-01-876Z` (3,735,552 bytes)
* backups not committed (gitignored)
* if needed: manual restore from backup
* backups retained for future debugging

## 9. Verification Summary

| Command | Result |
|---------|--------|
| K26-K controlled trial | **BLOCKED** (apply failed) |
| K26-J closeout verify | 52/52 PASS |
| J6 readiness | 50/50 PASS |
| J4 score verify | 47/47 PASS |
| J3 candidate verify | 53/53 PASS |
| J2 snapshot verify | 52/52 PASS |
| K22-C | PASS (73/0/0/0) |
| Prisma validate | PASS |
| migrate status | up to date |
| build | PASS |
| lint | 184/146 |
| auth foundation | 53/1 (pre-existing) |

## 10. Known Boundaries

* K22 expected 未更新
* score weights 未调整
* SC5 未 WorkTime-align
* 本阶段不做 UI 人工验收（仅 CLI 验证）
* audit drift retained（preview 仍新增 1 行 SchedulingRun）
* **真实发现**：preview 与 post-apply 的 hardScore 不一致（preview 报告 0，post-apply 报告 -2000）。

## 11. Final Decision

```txt
controlledApplyRollbackStatus=BLOCKED
businessDataRestored=true (via transaction rollback when apply failed)
acceptableAuditDrift=true (only preview run, no apply/rollback)
recommendedNextStage=K26-K2-WORKTIME-CONTROLLED-APPLY-DEBUG
```

**重要建议**：在 K26-J 链路被调试修复前，**不建议进入 K27 system-wide real usage**。需要单独 stage 调查：
1. preview 报告的 hardScore=0 与 post-apply 实际 hardScore=-2000 之间的差异。
2. HC5 / HC6 delta 计算在 preview 路径与 post-apply 路径之间是否一致。
3. 多次 apply 试验，确认该问题是否可重现。

DB backup 已保留两次 trial 状态，可在调试时还原到 pre-trial 状态。
