# K26-J: WorkTime Solver/Score Integration Audit

## 1. Executive Summary

本阶段审计 WorkTime 接入 solver / score 的影响面。**不实现任何代码变更。**

主要发现：

- **solver candidate generation** 硬编码 `day ∈ [1,7]`, `slot ∈ [1,6]`，完全忽略 WorkTime
- **score SC3/SC7** 硬编码阈值，不 consult WorkTimeConfig
- **SchedulingRun.workTimeConfigSnapshot** schema 字段已存在但从未写入
- **K22 harness** 无 WorkTime fixtures
- **K21 config** 与 WorkTime 独立，无集成

风险等级：3 HIGH / 4 MEDIUM / 2 LOW / 2 INFO

推荐下一阶段：`K26-J1-WORKTIME-SOLVER-SCORE-HARNESS-PLAN`

## 2. GitHub Sync Status

| Item | Value |
|------|-------|
| Branch | `master` |
| Remote | `origin` → `git@github.com:Satanecinl/Course-Development-System.git` |
| Local HEAD before | `79fca03` |
| Push | yes |
| Force push | no |

## 3. Current WorkTime Baseline

K26-D 到 K26-I 已完成能力：

- settings UI / API / schema / migration
- plan recommendation WorkTime-aware candidate search space
- dry-run / apply WorkTime guard
- room recommendation WorkTime guard
- adjustment dialog WorkTime integration
- slot 6/7 legacy exclusion
- allowWeekend 控制
- static safe fallback

## 4. Solver Candidate Generation Impact

| Area | File | Current source | WorkTime impact | Risk |
|------|------|---------------|-----------------|------|
| Exhaustive search | solver.ts:327-328 | `day ∈ [1,7]`, `si ∈ [1,6]` | 需改为 `allowedDays × activeSlots` | **HIGH** |
| Random generation | solver.ts:408-413 | `randInt(1,7)`, `randInt(1,6)` | 需改为 `randInt` from allowed sets | **HIGH** |
| Semester context | solver.ts | 无 semesterId | 需通过 config/context 传入 | **MEDIUM** |
| Slot 6/7 | solver.ts | `si ≤ 6` 包含 slot 6 | 需排除 legacy slots | **HIGH** |

## 5. Score / SC3 / SC7 Impact

| Constraint | Current assumption | WorkTime impact | Risk |
|------------|-------------------|-----------------|------|
| SC3 extreme time | `slotIndex >= 5` | 应从 WorkTime 派生 early/late slots | **MEDIUM** |
| SC7 weekend | `day >= 6` | 应 consult allowWeekend + weekendDayOfWeeks | **MEDIUM** |
| SC5 teacher balance | `TEACHING_DAYS = [1..5]` | allowWeekend=true 时需扩展 | **LOW** |
| SC8 class gaps | weekday-only `[1..5]` | 同上 | **LOW** |
| SC9 room stability | weekday-only `[1..5]` | 同上 | **INFO** |

## 6. SchedulingRun Snapshot / Reproducibility Impact

| Flow | Current state | WorkTime gap | Risk |
|------|--------------|--------------|------|
| Preview write | `workTimeConfigSnapshot` 未写入 | 需 resolve + serialize | **MEDIUM** |
| Apply carry-forward | 未传递 WorkTime snapshot | 需从 preview run 读取 | **MEDIUM** |
| Rollback | 未传递 WorkTime snapshot | 需从 apply run 读取 | **LOW** |
| Reproducibility | 旧 run 无法复现 WorkTime 配置 | snapshot 使 future runs 可审计 | **INFO** |

## 7. Scheduler API Impact

| API | Current behavior | WorkTime needed? | Risk | Proposed change |
|-----|-----------------|------------------|------|-----------------|
| preview | 解析 semester, 创建 SchedulingRun | 是 | MEDIUM | resolve WorkTime, 写 snapshot, 传入 solver |
| apply | 读 preview proposedChanges, 写 DB | 否（复用 preview） | LOW | 传递 WorkTime snapshot 到 apply run |
| rollback | 逆向 apply changes | 否 | LOW | 传递 WorkTime snapshot 到 rollback run |
| config | SchedulingConfig CRUD | 否 | LOW | 保持独立 |
| runs | 查询 SchedulingRun | 否 | INFO | additive WorkTime metadata |

## 8. Solver-side Contract

```ts
export type ResolvedWorkTimeForSolver = {
  semesterId: number
  source: 'database' | 'staticFallback' | 'snapshot'
  workTimeConfigId?: number | null
  allowWeekend: boolean
  activeTeachingSlotIndexes: number[]
  legacyDisplaySlotIndexes: number[]
  allowedDayOfWeeks: number[]
  weekdayDayOfWeeks: number[]
  weekendDayOfWeeks: number[]
  slotsByIndex: Record<number, {
    slotIndex: number
    label: string
    startsAt: string | null
    endsAt: string | null
    isActive: boolean
    isTeachingSlot: boolean
    isLegacyDisplay: boolean
    sortOrder: number
  }>
}
```

设计决策：

- 复用 `resolveWorkTimeConfigForSchedule` 作为基础 resolver
- 需要 solver-specific mapper 添加 `allowedDayOfWeeks`
- preview 阶段 resolve → serialize to snapshot → solver 使用 snapshot
- apply/rollback 从 run snapshot 读取，不重新 resolve
- slot 6/7 通过 `activeTeachingSlotIndexes` 强制排除
- static fallback 仅在 preview 阶段允许，apply 不允许 fallback
- resolve 失败时 preview 应 fail-fast（返回错误，不使用 fallback）

## 9. Score-side Contract

```ts
export type WorkTimeForScore = {
  allowWeekend: boolean
  activeTeachingSlotIndexes: number[]
  legacyDisplaySlotIndexes: number[]
  earlySlotIndexes: number[]   // e.g., [1] if first slot is "early"
  lateSlotIndexes: number[]    // e.g., [5] if last slot is "late"
  weekendDayOfWeeks: number[]  // [6, 7] or [] if !allowWeekend
  weekdayDayOfWeeks: number[]  // [1, 2, 3, 4, 5]
}
```

设计决策：

- SC3 使用 `lateSlotIndexes` 替代硬编码 `>= 5`
- SC7 使用 `weekendDayOfWeeks` 替代硬编码 `>= 6`
- allowWeekend 只影响 candidate generation，SC7 penalty 由 `weekendDayOfWeeks` 决定
- static fallback 下保持 K22 snapshot（当前行为不变）
- full score 和 delta score 必须同时接入，否则 LAHC 接受错误 move
- 先新增 harness 再改 score
- 不需要 feature flag（直接替换阈值）
- 不需要 score snapshot version bump（scoring 是函数式，无状态）
- 历史 run 不受影响（snapshot 已保存当时的 config）

## 10. Risk Summary

| # | Risk | Level |
|---|------|-------|
| 1 | solver candidate generation 可能改变所有排课结果 | **HIGH** |
| 2 | score full/delta 必须一致，否则 LAHC 接受错误 move | **HIGH** |
| 3 | WorkTime settings 改变后旧 SchedulingRun 可复现性 | **MEDIUM** |
| 4 | allowWeekend=true 后 SC7 / weekend penalty 语义变化 | **MEDIUM** |
| 5 | slot 6/7 历史显示 vs 新生成边界 | **MEDIUM** |
| 6 | K22 harness expected 大范围漂移 | **HIGH** |
| 7 | K21 config UI 与 WorkTime snapshot 关系 | **MEDIUM** |
| 8 | fallback 策略不一致导致 recommendation 与 solver 不一致 | **LOW** |
| 9 | apply 重新 resolve WorkTime 导致 preview/apply 不一致 | **LOW** |
| 10 | real usage trial 风险 | **INFO** |

## 11. Recommended Implementation Stages

| Stage | Scope | Dependencies |
|-------|-------|-------------|
| K26-J1 | Harness plan: synthetic WorkTime fixtures, verify current static behavior | None |
| K26-J2 | Snapshot write: preview resolve WorkTime, write workTimeConfigSnapshot | K26-J1 |
| K26-J3 | Candidate generation: allowed days/slots from snapshot, slot 6/7 excluded | K26-J2 |
| K26-J4 | Score SC3/SC7: harness first, full/delta consistency, score snapshot update | K26-J3 |
| K26-J5 | Manual real scheduling trial: run real solver, compare with pre-K26 baseline | K26-J4 |

## 12. Non-Goals（本阶段未做）

- schema change / migration / DB write
- solver behavior change
- score change
- scheduler API behavior change
- K22 expected change
- WorkTime recommendation behavior change
- UI change

## 13. Verification Results

| Command | Result |
|---------|--------|
| `audit-worktime-solver-score-integration-k26-j.ts` | **48/48 PASS** |
| K26-I closeout verify | **64/64 PASS** |
| K26-I4 verify | **49/49 PASS** |
| K26-I3 verify | **40/40 PASS** |
| K26-I2 verify | **45/45 PASS** |
| K26-I1 verify | **36/36 PASS** |
| K26-I audit | **44/44 PASS** |
| K26-H closeout | **52/52 PASS** |
| H2A runtime | **15/15 PASS** |
| K26-H UI | **43/43 PASS** |
| K26-G API | **40/40 PASS** |
| K26-F1 | **30/30 PASS** |
| K26-F validation | **30/30 PASS** |
| backfill dry-run | **0 missing** |
| K26-E | **34/34 PASS** |
| K26-D | **39/39 PASS** |
| K26-C | **32/32 PASS** |
| K26-A | **47/47 PASS** |
| K26-B closeout | **38/38 PASS** |
| K25 closeout | **38/38 PASS** |
| K25-C | **PASS** |
| K23-A | **PASS** |
| K22-C score harness | **PASS** |
| Prisma validate | **PASS** |
| Prisma migrate status | **up to date** (8 migrations) |
| build | **PASS** |
| lint | **184 errors / 146 warnings** |
| auth foundation | **53 passed / 1 failed** (pre-existing) |
