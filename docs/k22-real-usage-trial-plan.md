# K22 真实使用 / 人工验收 试用计划

**阶段**: K22-PAUSE-REAL-USAGE-TRIAL
**日期**: 2026-06-07
**性质**: 真实使用 / 人工验收准备（**不写新功能**）
**当前 K22 状态**: ✅ 已稳定 (K22-L1 / L2 / L2A 全部完成)

---

## 1. 试用目标

本次试用要回答的实际问题：

1. **可行性**: 当前自动排课能否在真实 dev.db 数据上生成 hardScore=0 的可行课表？
2. **可读性**: 排课管理员能否理解 `score breakdown` (HC1-HC6 / SC1-SC10 / MIN_PERT)？
3. **诊断力**: Top Issues 是否能帮助定位质量问题？
4. **质量可接受性**: 当前 soft quality (最终 softScore=-1281) 是否满足教务/教学需求？
5. **权重决策**: 是否需要调整 weight？(K22-L1B 决策依据)
6. **跳转决策**: 是否需要 Top Issues → 具体 slot/teacher/classGroup 跳转？(K22-L3 决策依据)
7. **Schema 决策**: 是否需要 Room.type / Course.type / preferred room / homeRoom 等 schema 扩展？
   (K22-FutureSchema 决策依据)

**不**通过本次试用回答的问题：
- 新约束 (SC11) 是否需要 (K22 主线已收敛)
- weights 动态化是否必要 (K22-I 决策依据，仅当管理员明确要求时)
- 算法替换 (当前 LAHC v3 稳定)

---

## 2. 试用范围

### 2.1 数据范围

- 使用 `prisma/dev.db` 当前快照 (LEGACY-DEFAULT semester, 308 tasks / 440 slots / 53 rooms)
- 学期: `LEGACY-DEFAULT` (id=1, isActive=true)
- 不引入新数据

### 2.2 配置范围

- Solver config: `DEFAULT_SOLVER_CONFIG` (maxIterations=10000, lahcWindowSize=500, randomSeed=42)
- 可选: 试不同 `randomSeed` 验证 solver 稳定性
- 可选: 试不同 `maxIterations` (e.g. 5000 vs 15000) 验证求解质量
- **不引入新 ScoringConfig** (除非管理员明确要求)
- **不引入 hardWeights / softWeights**

### 2.3 行为范围

- 仅使用 **preview** 与 **history 详情** 页面查看 solver 输出
- 人工抽查课表 (`/dashboard` 主表)
- 可选: 在确认需要的情况下执行 **apply** 写数据库
- **不在试用阶段自动 apply**
- **不修改业务数据** (ScheduleSlot 0 writes)

### 2.4 文档范围

- 4 个新增文档 + 1 个 verify 脚本
- 不修改任何 scheduler / API / frontend / schema / importer

---

## 3. 试用角色

| 角色 | 职责 | 人数建议 |
|------|------|----------|
| **系统管理员 / 排课管理员** | 主要 UI 操作者：触发 preview、查看 breakdown、记录问题 | 1-2 人 |
| **教务验收人员** | 业务质量判断：检查课表是否满足教学/教务要求 | 1-2 人 |
| **开发者观察员** | 记录技术问题、运行 verify 脚本、控制 trial 范围 | 1 人 |

---

## 4. 试用前置条件

试用前**必须**确认：

- [x] 工作区 git status --short **clean**
- [x] `npm run build` PASS
- [x] K22-C harness: **73 PASS / 0 KNOWN_FAIL / 0 FAIL / 0 INFO**
- [x] L1 evaluation: `hardScore=0`, `softScore=-1281`, exit 0, **read-only**
- [x] L2 verify: **186/186 PASS**
- [x] L2A artifact cleanup 已完成
- [x] F3/F4/F6/F8/F11 wrappers 全部 PASS
- [x] Prisma validate PASS
- [x] `npm run lint` 与基线一致 (180 errors / 134 warnings, 0 new error)
- [x] `test:auth-foundation` 唯一失败仍为 pre-existing ScheduleAdjustment (未尝试修复)

**dev.db 备份建议** (如果试用 apply 写):
```bash
cp prisma/dev.db prisma/dev.db.backup-before-trial-$(date +%Y%m%d%H%M%S)
```

**本阶段建议不执行 apply** — 仅在 preview 中查看。

---

## 5. 试用流程

### 5.1 启动 (开发者观察员)

1. 启动 dev server: `npm run dev` (localhost:3000)
2. 登录系统 (使用 `admin` 角色账号)
3. 确认 `/admin/scheduler` 页面可访问

### 5.2 主要试用步骤

| # | 步骤 | 期望结果 |
|---|------|----------|
| 1 | 进入 `/admin/scheduler` | 页面加载，scheduler-config-panel 可用 |
| 2 | 选择当前 semester (LEGACY-DEFAULT) | semester 信息显示 |
| 3 | 使用默认 solver config (无 overrides) | 显示 maxIterations=10000, lahc=500 |
| 4 | 点击 "运行 Preview" | 弹出结果卡 (~21 秒) |
| 5 | 查看 Score Summary | hardScore=0, softScore=~-1281, 绿/红 badge 正确 |
| 6 | 查看 8 个业务质量卡片 | 周末/林校HC6/汽车SC6=0, 教师均衡=1, 班级空洞=48, 教室稳定=76, 容量利用=26, MIN_PERT=427 |
| 7 | 切换 BEFORE / AFTER tab | 初始有 1 个硬冲突，优化后清零 |
| 8 | 展开 "约束详情" | 16 条约束全显示，触发数与扣分一致 |
| 9 | 查看 Top Issues | MIN_PERT 移动率 97% (因初始有冲突) 是 top 1 |
| 10 | 进入 `/admin/scheduler/history` | 找到当前 run |
| 11 | 展开 run 详情 | 同样的 breakdown 在 history 页面正常显示 |
| 12 | 展开一个旧 run (K22-L2 之前) | 显示 "旧运行无 breakdown 数据" fallback, 不报错 |
| 13 | 进入 `/dashboard` | 人工抽查若干班级的实际课表 |
| 14 | 按教师 / 班级 / 教室 过滤 | 抽查教师负载、教室冲突等 |
| 15 | 填写反馈记录 | 记录到 `docs/k22-real-usage-trial-feedback-template.md` |

### 5.3 反馈归类

不满意时**不立即改代码**，先归类问题类型：

| 问题类型 | 后续阶段 |
|----------|----------|
| UI 不可读 | K22-L3 改 UI / 文字 |
| 缺跳转定位 | K22-L3 加 Top Issue 跳转 |
| 权重失衡 | K22-L1B 软权重调参 |
| 缺新约束 | K22-FutureConstraint |
| 缺 schema 能力 | K22-FutureSchema |
| 真实数据 bug | K22-DataQuality |
| 算法问题 | K22-Algorithm |

---

## 6. 验收出口 (Go / No-Go Criteria)

### 6.1 必须满足 (Go criteria)

- [x] hardScore = 0 (K22-L1 已验证)
- [x] HC1-HC6 触发数 = 0
- [x] 周末课 (SC7) = 0
- [x] 非汽车专业未进入林校 (HC6 = 0)
- [x] 汽车专业林校偏好 (SC6 = 0)
- [x] 管理员能理解 breakdown UI

### 6.2 可接受 (Acceptable if)

- 软质量 (softScore) 在 -1000 ~ -1500 范围内 (K22-L1 baseline -1281)
- 教师日均衡 (SC5) 触发 ≤ 5 个教师
- 班级空洞 (SC8) 触发 ≤ 60 对, 最大 gap ≤ 2
- 教室稳定 (SC9) 触发 ≤ 100 任务
- 容量利用 (SC10) 触发 ≤ 50
- 最小扰动 (MIN_PERT) ≤ 50% 移动率 (若 0 冲突则不适用)

### 6.3 不通过 (No-Go criteria)

- 任何 HC1-HC6 触发 > 0
- 周末课 > 10
- 林校违规 (HC6) > 0
- 教师日均衡 (SC5) 触发 > 20 个教师
- 班级空洞 (SC8) 单点 gap > 3
- 容量超限 (HC4) 触发 > 0
- 管理员**完全无法理解** breakdown UI

### 6.4 试用人为 No-Go 时的处理

不立即改代码，先：

1. 在 feedback template 记录具体场景
2. 归类问题类型 (见 §5.3)
3. 由架构审查决定是否进入下一个 K22 阶段

---

## 7. 后续阶段决策规则

| 试用结果 | 推荐下一阶段 |
|----------|--------------|
| 全部 Go | **结束 K22 主线**，进入真实生产使用 |
| UI 不友好但数据 OK | K22-L3-SCHEDULER-RESULT-QUALITY-ACTIONS (加 Top Issue 跳转) |
| 软质量边界 (Acceptable if 边缘) | K22-L1B-SOFT-WEIGHT-TUNING |
| weights 需要可配置 | K22-I-SCORE-WEIGHTS-IMPLEMENTATION-PLAN |
| 缺 Room.type / preferred room | K22-FutureSchema |
| 真实数据 bug | K22-DataQuality |
| 算法需升级 | K22-Algorithm-NextGen |
| 完全 No-Go | 回 K22-L1B 或 K22-L1A 重新评估 |

---

## 8. 文档索引

| 文档 | 用途 |
|------|------|
| `docs/k22-real-usage-trial-plan.md` | 本文档 |
| `docs/k22-real-usage-trial-checklist.md` | 可勾选验收清单 |
| `docs/k22-real-usage-trial-feedback-template.md` | 反馈记录模板 |
| `docs/k22-real-usage-trial-status.json` | 当前 K22 功能状态固化 |
| `scripts/verify-real-usage-trial-readiness-k22.ts` | 试用前置条件自动 verify |

---

## 9. 风险与限制

### 9.1 当前系统已知限制 (来自 K22-L1 baseline)

| 限制 | 来源 | 决策 |
|------|------|------|
| MIN_PERT 移动率 97% (427/440) | K22-L1 baseline | 因初始排课有 1 个 HC 冲突；非权重问题 |
| 教室稳定 SC9 76 任务多教室 | K22-L1 baseline | 多数为合班任务 (需拆教室) |
| 班级空洞 SC8 48 对 | K22-L1 baseline | 多数 gap=1，结构性问题 |
| 容量过紧 SC10 23 个 slot | K22-L1 baseline | util>90%，可接受范围 |

### 9.2 当前系统不支持的能力 (不进入试用)

- ❌ 动态 weight (hardWeights / softWeights)
- ❌ SC11 等新约束
- ❌ Room.type / Course.type schema
- ❌ preferred room / homeRoom
- ❌ Top Issue 跳转
- ❌ 多个 P1/P2 约束

---

**报告结束。试用开始前请先运行 `scripts/verify-real-usage-trial-readiness-k22.ts` 确认所有前置条件。**
