# K22 真实使用 / 人工验收 反馈记录模板

**阶段**: K22-PAUSE-REAL-USAGE-TRIAL
**日期**: ___________________
**试用者**: ___________________
**角色**: [ ] 系统管理员 / 排课管理员 | [ ] 教务验收人员 | [ ] 开发者观察员
**试用时段**: ___________________

---

## 0. 元数据

- K22 commit: `4353b53`
- 试用 semester: LEGACY-DEFAULT (id=1)
- Solver config: maxIterations=10000, lahcWindowSize=500, randomSeed=42
- Preview 耗时: ________ 秒
- 最终 hardScore: ____
- 最终 softScore: ____

---

## 1. 反馈记录

每条反馈使用一段独立的小节。**复制下面的模板**多次使用。

### 1.x 反馈标题

**类别** (从下面选):
- [ ] UI/UX (UI 不清晰 / 文字不准 / 颜色不合理 / 缺跳转)
- [ ] Solver/Algorithm (求解质量不达标 / 移动太多 / 求解太慢)
- [ ] Weight/Tuning (权重失衡 / 需要更高/更低某些约束)
- [ ] Data Quality (数据 bug / 缺字段 / 解析问题)
- [ ] Schema (缺字段 / 缺 type / 缺关系)
- [ ] Feature (缺能力 / 缺功能)
- [ ] Performance (慢 / 卡 / 内存)
- [ ] Other

**严重度**:
- [ ] **Blocker** (不可用, 必须修复)
- [ ] **High** (影响验收)
- [ ] **Medium** (可接受, 但建议改进)
- [ ] **Low** (nice-to-have)

**复现步骤**:
1. ...
2. ...
3. ...

**期望行为**: ...

**实际行为**: ...

**截图/数据** (可选):
```
(粘贴截图引用或具体数据)
```

**建议后续阶段** (从下面选):
- [ ] K22-L3-SCHEDULER-RESULT-QUALITY-ACTIONS (UI 跳转)
- [ ] K22-L1B-SOFT-WEIGHT-TUNING (软权重调参)
- [ ] K22-I-SCORE-WEIGHTS-IMPLEMENTATION-PLAN (动态权重)
- [ ] K22-FutureSchema (schema 扩展)
- [ ] K22-FutureConstraint (新约束)
- [ ] K22-DataQuality (数据修复)
- [ ] K22-Algorithm (算法升级)
- [ ] Other: ____________

**记录人签字**: ___________________
**日期**: ___________________

---

## 2. 反馈汇总 (开发者观察员填写)

试用结束后，开发者观察员汇总所有反馈：

### 2.1 反馈统计

- 总反馈数: ____
- Blocker: ____
- High: ____
- Medium: ____
- Low: ____

### 2.2 类别分布

- UI/UX: ____
- Solver/Algorithm: ____
- Weight/Tuning: ____
- Data Quality: ____
- Schema: ____
- Feature: ____
- Performance: ____
- Other: ____

### 2.3 试用判定

- [ ] **Go** - 所有 Go criteria 满足
- [ ] **Acceptable** - 仅 Acceptable if 边缘
- [ ] **No-Go** - 任一 No-Go criteria 触发

### 2.4 下一阶段决策

- [ ] 结束 K22 主线，转入真实生产使用
- [ ] 进入 K22-L3-SCHEDULER-RESULT-QUALITY-ACTIONS
- [ ] 进入 K22-L1B-SOFT-WEIGHT-TUNING
- [ ] 进入 K22-I-SCORE-WEIGHTS-IMPLEMENTATION-PLAN
- [ ] 进入 K22-FutureSchema
- [ ] 进入 K22-FutureConstraint
- [ ] Other: ___________________

**决策理由**: ...

**决策人签字**: ___________________
**日期**: ___________________

---

## 3. 附录: Go / No-Go 判定标准

### 3.1 Go Criteria (必须满足)

| 项 | 期望 | 实际 |
|----|------|------|
| hardScore | 0 | ____ |
| HC1-HC6 触发数 | 0 | ____ |
| 周末课 (SC7) | 0 | ____ |
| 林校违规 (HC6) | 0 | ____ |
| 汽车未入林校 (SC6) | 0 | ____ |
| breakdown UI 可理解 | yes | ____ |

### 3.2 Acceptable if (边缘可接受)

| 项 | 上限 | 实际 |
|----|------|------|
| softScore | -1500 ~ -1000 | ____ |
| SC5 触发 | ≤ 5 个教师 | ____ |
| SC8 触发 | ≤ 60 对 | ____ |
| SC8 最大 gap | ≤ 2 | ____ |
| SC9 触发 | ≤ 100 任务 | ____ |
| SC10 触发 | ≤ 50 | ____ |

### 3.3 No-Go Criteria (任一触发)

| 项 | 触发 | 实际 |
|----|------|------|
| HC1-HC6 任一 > 0 | 0 | ____ |
| 周末课 > 10 | no | ____ |
| 林校违规 > 0 | no | ____ |
| SC5 触发 > 20 个教师 | no | ____ |
| SC8 单点 gap > 3 | no | ____ |
| HC4 触发 > 0 | no | ____ |
| breakdown UI 完全不可理解 | no | ____ |

---

## 4. 备注

(其他需要记录的内容)

...
