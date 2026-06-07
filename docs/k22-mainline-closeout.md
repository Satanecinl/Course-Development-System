# K22 Mainline Closeout

**阶段**: K22-REAL-USAGE-ACCEPTANCE-CLOSEOUT
**日期**: 2026-06-07
**K22 commit 基线**: `5d83152`
**manual review status**: **PASSED**
**mainline status**: **CLOSED**
**scheduler status**: **READY_FOR_REAL_OPERATIONAL_USE**

---

## 1. Executive Summary

K22 自动排课引擎主线已正式完成。

**约束体系覆盖**:
- HC1-HC6 (硬约束, 6 个)
- SC1-SC10 (软约束, 10 个)
- MIN_PERT (扰动约束, 1 个)

**真实 solver 验证**:
- 已在 `prisma/dev.db` 真实数据 (308 tasks / 440 slots / 53 rooms / 84 teachers / 104 courses / 36 classGroups) 上跑通
- `hardScore`: -1000 → **0** (全部硬约束解决)
- `softScore`: -1577 → **-1281** (软约束改善 296)
- 完全 **read-only** (ScheduleSlot 0 writes, SchedulingRun 0 writes)

**UI 落地**:
- live preview 嵌入 ScoreBreakdownDisplay
- history run detail 嵌入 ScoreBreakdownDisplay
- 16 条约束 (HC1-HC6 / SC1-SC4 / SC6-SC10 / MIN_PERT) 全展示
- 8 个业务质量卡片 (周末 / 林校HC6 / 汽车SC6 / 教师均衡 / 班级空洞 / 教室稳定 / 容量利用 / 最小扰动)
- Top Issues (按 severity 排序, 前 20 条)
- BEFORE / AFTER tab 切换
- 旧 run fallback ("旧运行无 breakdown 数据")

**人工审核**:
- ✅ **人工审核通过** (user-provided manual acceptance)
- K22 mainline 建议 **正式关闭**

---

## 2. Scope Completed

### 2.1 Score / Constraints (K22 mainline)

| 类别 | 约束 | 状态 |
|------|------|------|
| 硬约束 | HC1 (教室冲突) | ✅ |
| 硬约束 | HC2 (教师冲突) | ✅ |
| 硬约束 | HC3 (班级冲突) | ✅ |
| 硬约束 | HC4 (容量) | ✅ |
| 硬约束 | HC5 (教室不可用) | ✅ |
| 硬约束 | HC6 (非汽车禁林校) | ✅ |
| 软约束 | SC1 (跨楼栋连续) | ✅ |
| 软约束 | SC2 (同天多节) | ✅ |
| 软约束 | SC3 (极端时间) | ✅ |
| 软约束 | SC4 (跨校区同 task) | ✅ |
| 软约束 | SC5 (教师均衡) | ✅ (businessCards) |
| 软约束 | SC6 (汽车优先林校) | ✅ |
| 软约束 | SC7 (周末排课) | ✅ |
| 软约束 | SC8 (班级空洞) | ✅ |
| 软约束 | SC9 (教室稳定) | ✅ |
| 软约束 | SC10 (容量利用率) | ✅ |
| 扰动 | MIN_PERT (最小扰动) | ✅ |

**总 16 + 1 = 17 个约束** (含 SC5 仅在业务卡片展示, 不在 CONSTRAINT_REGISTRY 独立行)。

### 2.2 Regression Harness (K22-C)

- **scripts/verify-score-regression-harness-k22-c.ts** (10 harnesses, 73 cases)
- **K22-C**: 73 PASS / 0 KNOWN_FAIL / 0 FAIL / 0 INFO
- 稳定 since K22-D SC1 delta fix

### 2.3 Constraint Wrappers (F3 / F4 / F6 / F8 / F11)

| Wrapper | 状态 |
|---------|------|
| F3 specialty / campus / weekend | 16/16 PASS |
| F4 teacher day balance | 13/13 PASS |
| F6 class gap | 12/12 PASS |
| F8 classroom stability | 11/11 PASS |
| F11 capacity preference | 13/13 PASS |

### 2.4 Real Solver Evaluation (K22-L1)

- **scripts/evaluate-real-solver-quality-k22-l1.ts**
- 真实 dev.db 数据 (LEGACY-DEFAULT semester)
- 配置: maxIterations=10000, lahcWindowSize=500, randomSeed=42
- hardScore -1000 → 0 (allHardResolved=true)
- softScore -1577 → -1281 (改善 296)
- 写 ScheduleSlot = 0
- 写 SchedulingRun = 0
- 文档: `docs/k22-real-solver-quality-evaluation.md` + `.json`

### 2.5 UI (K22-L2 / L2A)

- **src/lib/scheduler/score-breakdown.ts** (helper, ~500 lines, 16 约束 registry)
- **src/components/score-breakdown-display.tsx** (UI, ~430 lines)
- **live preview** (scheduler-content.tsx) 嵌入
- **history** (history-content.tsx) 嵌入
- **API**: runs/[id]/route.ts additive 解析 `scoreBreakdown`
- **preview**: preview.ts additive 持久化 `scoreBreakdown` 到 resultSnapshot
- **legacy fallback**: 旧 run 缺 `scoreBreakdown` 时显示 "旧运行无 breakdown 数据"
- **verify**: 186/186 PASS

### 2.6 Trial Readiness (K22-PAUSE)

- **plan**: `docs/k22-real-usage-trial-plan.md`
- **checklist**: `docs/k22-real-usage-trial-checklist.md`
- **feedback template**: `docs/k22-real-usage-trial-feedback-template.md`
- **status**: `docs/k22-real-usage-trial-status.json`
- **verify**: `scripts/verify-real-usage-trial-readiness-k22.ts` (13 sections, 62 cases)
- **result**: 62/62 PASS

### 2.7 Trial Readiness Verification Complete (K22-PAUSE-A)

- 8 项完整 verify 链通过:
  - readiness verify: 62/62 PASS
  - L2 verify: 186/186 PASS
  - L1 evaluation: hardScore=0, softScore=-1281, readOnly
  - K22-C: 73/0/0/0
  - prisma validate: schema valid
  - build: PASS
  - lint: 0 new error
  - auth-foundation: 53 passed / 1 pre-existing failure

### 2.8 Manual Acceptance (K22-REAL-USAGE-ACCEPTANCE-CLOSEOUT)

- ✅ **人工审核通过**
- 本文档正式记录 K22 mainline 关闭
- 系统进入 real operational use 阶段

---

## 3. Acceptance Evidence

| 维度 | 状态 | 来源 |
|------|------|------|
| **Manual review** | ✅ PASSED | user-provided manual acceptance (人工审核通过) |
| **Reviewer** | project owner / user-provided | 无实名, 不编造教务姓名 |
| **Date** | 2026-06-07 | K22-PAUSE-A verification stage date |
| **Verification baseline** | 8 项全绿 | K22-PAUSE-A complete verification chain |

### 3.1 Verification chain (8 项, K22-PAUSE-A 完整)

| # | 命令 | 结果 |
|---|------|------|
| 1 | `npx tsx scripts/verify-real-usage-trial-readiness-k22.ts` | 62/62 PASS |
| 2 | `npx tsx scripts/verify-scheduler-breakdown-ui-k22-l2.ts` | 186/186 PASS |
| 3 | `npx tsx scripts/evaluate-real-solver-quality-k22-l1.ts` | hardScore=0, softScore=-1281, readOnly |
| 4 | `npx tsx scripts/verify-score-regression-harness-k22-c.ts` | 73/0/0/0 |
| 5 | `npx prisma validate` | schema valid |
| 6 | `npm run build` | PASS |
| 7 | `npm run lint` | 181 errors / 134 warnings (0 new error) |
| 8 | `npm run test:auth-foundation` | 53 passed / 1 pre-existing failure |

---

## 4. Current Baseline

### 4.1 K22-C Regression Harness

- **K22-C**: 73 PASS / 0 KNOWN_FAIL / 0 FAIL / 0 INFO
- 稳定 since K22-D SC1 delta fix
- 文档: `docs/k22-score-regression-harness-implementation.json`

### 4.2 L1 Real Solver Evaluation

| 指标 | 初始 | 最终 | Δ |
|------|------|------|---|
| hardScore | -1000 | **0** | +1000 (全部硬约束解决) |
| softScore | -1577 | **-1281** | +296 |
| allHardResolved | — | true | ✓ |
| readOnly | — | true | ✓ |
| ScheduleSlot writes | — | 0 | ✓ |
| SchedulingRun writes | — | 0 | ✓ |
| iterations | — | 10000 | (default) |
| solverVersion | — | lahc-hard-first-v3 | ✓ |

### 4.3 UI

- L2 score breakdown UI verify: **186/186 PASS**
- readiness verify: **62/62 PASS**
- 16 约束 (HC1-HC6 / SC1-SC4 / SC6-SC10 / MIN_PERT) 全展示
- 8 业务质量卡片
- Top Issues (≤ 20)
- BEFORE / AFTER tab
- 旧 run fallback
- constraint type / level / penalty / samples 完整

### 4.4 Build / Lint / Schema

- `npm run build`: PASS
- `npm run lint`: 181 errors / 134 warnings (与 K22-PAUSE HEAD baseline 一致, 0 new error)
- `npx prisma validate`: schema valid

### 4.5 Auth Foundation

- `npm run test:auth-foundation`: 53 passed / 1 failed
- 唯一失败: pre-existing `ScheduleAdjustment ACTIVE count mismatch`
- 未尝试修复 (与本阶段无关)

---

## 5. Known Limitations (不阻塞 closeout)

### 5.1 Pre-Existing Test Issues

- `test:auth-foundation` 唯一失败: `ScheduleAdjustment ACTIVE = 0 (实际 10)`
- 与 K22 调度器无关, 历史数据问题
- 未尝试修复

### 5.2 Lint 历史 Debt

- 181 errors / 134 warnings
- 主要是 pre-existing `@typescript-eslint/no-explicit-any` 和 `prefer-const`
- 与 K22 调度器无直接关系
- 0 new error in K22 阶段

### 5.3 Schema 能力不足

- ❌ Room.type / Course.type 不足以支撑实训课 / 机房课硬规则
- ❌ 无 preferred room / homeRoom 字段
- ❌ 无多 P1/P2 约束层级

### 5.4 配置能力

- ❌ weights 尚不可配置 (hardWeights / softWeights 未引入)
- ❌ ScoringConfig 不可编辑权重
- ❌ 用户无法按场景调整 SC8 / SC9 / SC10 权重

### 5.5 UI 跳转

- ❌ Top Issues 尚未支持点击跳转到具体 slot / teacher / classGroup
- ❌ 管理员需手动对照 taskId / classGroupId 查找

### 5.6 数据质量

- real production rollout 前仍建议备份 DB
- 当前 trial 通过不代表所有未来导入数据都无需数据质量检查
- Importer / parser 不在本阶段

### 5.7 算法

- LAHC v3 在当前数据规模下可接受 (~21 秒 / 10000 iterations)
- 大规模数据 (10000+ tasks) 未测试

---

## 6. Post-Closeout Decision Rules

后续只有在真实反馈触发时才进入对应阶段:

| 反馈类型 | 阶段 |
|----------|------|
| UI 不好定位问题 (Top Issues 缺跳转) | `K22-L3-SCHEDULER-RESULT-QUALITY-ACTIONS` |
| 软质量不满意 (SC8 太多空洞 / SC9 太多多教室) | `K22-L1B-SOFT-WEIGHT-TUNING` |
| 管理员需要可配置权重 | `K22-I-SCORE-WEIGHTS-IMPLEMENTATION-PLAN` |
| 缺 Room.type / preferred room 能力 | `K22-FutureSchema` |
| 真实数据 bug (合并班级 / 解析问题) | `K22-DataQuality` |
| 算法能力不足 (LAHC 收敛慢 / 解质量差) | `K22-Algorithm-NextGen` |
| 缺新约束 (e.g. 实验课优先机房) | `K22-FutureConstraint` |
| 真实导入数据有冲突 (parser / importer) | `K22-ImportPipeline` |

**原则**: 任何机械式 K22 后续阶段都需要真实使用反馈 trigger, 不再继续按 audit 模式推进。

---

## 7. Final Recommendation

### 7.1 关闭状态

- **`K22 mainline: CLOSED`**
- **`Scheduler status: READY_FOR_REAL_OPERATIONAL_USE`**
- **Next default action: no further mechanical K22 development; use system in real workflow and collect feedback**

### 7.2 系统当前可承担

- ✅ 自动排课 (preview / apply)
- ✅ 真实 dev.db 数据
- ✅ 容量 / 教室 / 教师 / 班级冲突检测
- ✅ 教室稳定性 / 容量利用率优化
- ✅ 周末回避
- ✅ 林校 / 汽车专业硬规则
- ✅ 教师日均衡
- ✅ 班级空洞减少
- ✅ 最小扰动
- ✅ UI breakdown 可解释

### 7.3 后续行动 (按需)

1. **立即可做**: 进入 real operational use (教务处试用 → 收集反馈)
2. **如有反馈**: 按 §6 decision rules 触发对应阶段
3. **数据备份**: 任何 apply 前必须先 `cp prisma/dev.db prisma/dev.db.backup-*`
4. **监控**: K22-C harness 73/0/0/0 与 L1 baseline (hardScore=0, softScore=-1281) 应作为后续 regression 监控基线

### 7.4 不建议

- ❌ 继续 mechanical K22 阶段 (audit / 文档 / 调参) 除非有真实反馈
- ❌ 修改 score.ts / solver algorithm / penalty constants
- ❌ 修改 prisma schema
- ❌ 修改 resultSnapshot shape (K22-L2 已固化)
- ❌ 修改 frontend 业务逻辑
- ❌ 引入 hardWeights / softWeights (除非 K22-I 触发)

---

**报告结束。K22 mainline 正式关闭。系统进入 real operational use 阶段。**
