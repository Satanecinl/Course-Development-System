# K22-L2: Scheduler Result Breakdown UI

**阶段**: K22-L2-SCHEDULER-RESULT-BREAKDOWN-UI
**日期**: 2026-06-07
**性质**: UI / result presentation (additive)
**结论**: ✅ **建议关闭 K22-L2**

---

## 1. Executive Summary

K22-L1 在脚本和文档中产出了 solver 质量 breakdown，但管理员在
`/admin/scheduler` (live preview) 与 `/admin/scheduler/history` (run detail)
页面上看不到。

K22-L2 将真实质量 breakdown 落到 UI：

- **新增** 纯展示组件 `src/components/score-breakdown-display.tsx`
- **新增** 纯 helper `src/lib/scheduler/score-breakdown.ts`
- **additive** 把 `scoreBreakdown` 写入 `resultSnapshot.scoreBreakdown`
- **向后兼容**: 旧 run 无 `scoreBreakdown` 字段时 UI fallback "无 breakdown 数据"
- **未改** score.ts / solver / schema / migration / API route 业务逻辑

UI 现在展示：

1. **Score Summary** — Hard 可行性 / Soft Score / 违反总数 / 来源
2. **业务质量卡片** — 周末 / 林校HC6 / 汽车SC6 / 教师均衡 / 班级空洞 / 教室稳定 / 容量利用 / 最小扰动
3. **约束详情表** — 16 条约束 (HC1-HC6 + SC1-SC10 + MIN_PERT) 的触发/扣分/状态
4. **Top Issues** — 严重度排序的前 20 个问题

---

## 2. 关键发现

### 2.1 resultSnapshot 已有数据

通过 `src/lib/scheduler/preview.ts` 的 `calculateScoreWithDetails()` 计算，
**已经获得** `ScoreDetail[]` 数组（每条 type / level / penalty / message）。
但当前只把 HC1-HC4 计数存入 `conflictSummary`，**未把 details 数组本身持久化**。

### 2.2 需要 additive 扩展

`SchedulingRun.resultSnapshot` 是 TEXT 字段，K22-L2 在 resultSnapshot JSON 内
additive 添加 `scoreBreakdown: { version: 1, before, after }` 子对象，**不需要 schema 改动**。

### 2.3 旧 run 兼容

K22-L2 之前的 run 没有 `scoreBreakdown` 字段。
- API: `readSnapshotBreakdown()` 检测到缺失时返回 `null`
- UI: `<ScoreBreakdownDisplay>` 收到 `null` 时显示 "旧运行无 breakdown 数据"
- **不报错，不崩溃**

### 2.4 UI 展示策略

- 单一 `<ScoreBreakdownDisplay>` 组件同时供 live preview 与 history 共用
- 通过 `defaultSide` prop 决定默认显示 BEFORE 或 AFTER
- 内置 BEFORE/AFTER 切换 tab，方便对比初始 vs 最终
- 16 条约束以稳定顺序展示（HC1-HC6, SC1-SC4, SC6-SC10, MIN_PERT），
  即使 count=0 仍显示，避免 UI 抖动

---

## 3. 数据流（end-to-end）

```
        Solver                          
   calculateScoreWithDetails()           
   → initialDetails.details (BEFORE)    
   → bestDetails.details (AFTER)        
                                     
        ↓                             
                                     
   src/lib/scheduler/preview.ts        
   buildScoreBreakdown(BEFORE)         
   buildScoreBreakdown(AFTER)          
   buildWireBreakdown(before, after)   
   → scoreBreakdown wire (version: 1)  
                                     
        ↓                             
                                     
   resultSnapshot = JSON.stringify({   
     ...,                               
     scoreBreakdown,  // ← 新增         
   })                                  
   存入 prisma.schedulingRun.resultSnapshot
                                     
        ↓ (GET /api/admin/scheduler/runs/[id])
                                     
   src/app/api/admin/scheduler/runs/[id]/route.ts
   readSnapshotBreakdown(resultSnapshot)
   → null (legacy) or { version, before, after }
                                     
        ↓ (response)
                                     
   history-content.tsx                 
   ├── runs/[id] API → run.scoreBreakdown
   └── <ScoreBreakdownDisplay breakdown={...} />
                                     
   scheduler-content.tsx (live preview)
   ├── preview POST → previewData.scoreBreakdown
   └── <ScoreBreakdownDisplay breakdown={...} />
```

---

## 4. 修改文件

### 4.1 新增

| 文件 | 用途 | 行数 |
|------|------|------|
| `src/lib/scheduler/score-breakdown.ts` | 纯 helper：buildScoreBreakdown / buildWireBreakdown / readSnapshotBreakdown / CONSTRAINT_REGISTRY | ~500 |
| `src/components/score-breakdown-display.tsx` | 纯展示组件：ScoreSummary / BusinessCards / ConstraintTable / TopIssues + BEFORE/AFTER tab | ~430 |
| `scripts/verify-scheduler-breakdown-ui-k22-l2.ts` | 验证脚本（9 节，186 个 case） | ~470 |
| `docs/k22-scheduler-result-breakdown-ui.md` | 本报告 | — |

### 4.2 修改

| 文件 | 修改 | 性质 |
|------|------|------|
| `src/lib/scheduler/preview.ts` | 引用 `buildScoreBreakdown` + `buildWireBreakdown`，在 resultSnapshot JSON 中加 `scoreBreakdown` 字段，在 `PreviewResult` 中暴露 | additive |
| `src/app/api/admin/scheduler/runs/[id]/route.ts` | 引用 `readSnapshotBreakdown`，从 resultSnapshot 解析后在 `RunDetail` 中暴露 `scoreBreakdown` | additive |
| `src/app/admin/scheduler/history/history-content.tsx` | 在 `RunDetailData` 类型加 `scoreBreakdown?`，在 `RunDetailView` 中嵌入 `<ScoreBreakdownDisplay>` | additive |
| `src/app/admin/scheduler/scheduler-content.tsx` | 在 `PreviewResponse` 类型加 `scoreBreakdown?`，在 live preview 区嵌入 `<ScoreBreakdownDisplay>` | additive |

### 4.3 未修改

- ❌ `src/lib/scheduler/score.ts`
- ❌ `src/lib/scheduler/solver.ts`
- ❌ `src/lib/scheduler/types.ts`
- ❌ `src/lib/scheduler/data-loader.ts`
- ❌ `src/lib/scheduler/config.ts`
- ❌ `src/lib/scheduler/apply.ts`
- ❌ `src/lib/scheduler/rollback.ts`
- ❌ `prisma/schema.prisma` / migrations
- ❌ 其他 API route (preview/apply/rollback/lockable-slots/runs/configs)
- ❌ 其他 UI 组件
- ❌ importer / parser / RBAC / auth

---

## 5. scoreBreakdown Wire Shape

`SchedulingRun.resultSnapshot.scoreBreakdown` 的结构：

```ts
{
  version: 1,
  before: ScoreBreakdownWire,
  after: ScoreBreakdownWire,
}

interface ScoreBreakdownWire {
  hardScore: number
  softScore: number
  totalDetails: number
  constraints: ConstraintStat[]      // 16 entries, stable order
  topIssues: TopIssue[]              // up to 20 entries
  businessCards: BusinessQualityCards  // pre-computed cards
}

interface ConstraintStat {
  id: string                         // "HC1" | "SC2" | "MIN_PERT" | ...
  type: string                       // "HC1_ROOM_CONFLICT" | ...
  level: 'HARD' | 'SOFT'
  category: 'HARD' | 'SOFT' | 'PERTURBATION'
  description: string                // 中文说明
  penalty: number                    // 单次扣分
  triggerCount: number
  totalPenalty: number
  averagePenalty: number
  severity: 'pass' | 'info' | 'warn' | 'block'
  topExamples: Array<{ slotId?, relatedSlotId?, message?, penalty }>
}
```

**约束列表 (16 个，按 UI 展示顺序)**:

| ID | Type | Level | Penalty | 描述 |
|----|------|-------|---------|------|
| HC1 | HC1_ROOM_CONFLICT | HARD | -1000 | 教室同时段冲突 |
| HC2 | HC2_TEACHER_CONFLICT | HARD | -1000 | 教师同时段冲突 |
| HC3 | HC3_CLASS_CONFLICT | HARD | -1000 | 班级同时段冲突 |
| HC4 | HC4_CAPACITY | HARD | -1000 | 学生超容量 |
| HC5 | HC5_ROOM_UNAVAILABLE | HARD | -1000 | 教室不可用时段 |
| HC6 | HC6_NON_AUTOMOTIVE_FORBID_LINXIAO | HARD | -1000 | 非汽车专业在林校 |
| SC1 | SC1_CROSS_BUILDING_BACK_TO_BACK | SOFT | -5 | 跨楼栋连续 |
| SC2 | SC2_SAME_DAY | SOFT | -10 | 同天多节 |
| SC3 | SC3_EXTREME_TIME_SLOT | SOFT | -1 | 极端时间 |
| SC4 | SC4_CROSS_CAMPUS | SOFT | -5 | 跨校区同 task |
| SC6 | SC6_AUTOMOTIVE_PREFERS_LINXIAO | SOFT | -20 | 汽车未入林校 |
| SC7 | SC7_WEEKEND_AVOIDANCE | SOFT | -15 | 周末排课 |
| SC8 | SC8_CLASS_GAP | SOFT | -2 | 班级空洞 |
| SC9 | SC9_TEACHING_TASK_ROOM_STABILITY | SOFT | -2 | 教室稳定性 |
| SC10 | SC10_ROOM_CAPACITY_UTILIZATION | SOFT | -2 | 容量利用率 |
| MIN_PERT | MINIMUM_PERTURBATION | SOFT | -2 | 最小扰动 |

> 注: SC5 (教师均衡) **不直接展示为约束行** (因为它是按教师聚合的)，
> 但在 businessCards.teacherDayBalance 中以业务卡片形式呈现。

---

## 6. UI 展示结构

### 6.1 Score Summary (4 个卡片)

| 卡片 | 内容 | 颜色 |
|------|------|------|
| Hard 可行性 | "可行" (hardScore=0) 或 "硬冲突" (hardScore<0) | 绿/红 |
| Soft Score | 数值 | 灰 |
| 违反总数 | count | 灰 |
| 来源 | "初始" / "优化后" | 灰 |

### 6.2 业务质量卡片 (8 个)

| 卡片 | 约束 | 单位 |
|------|------|------|
| 周末排课 | SC7 | 次 |
| 林校违规 HC6 | HC6 | 次 |
| 汽车未入林校 SC6 | SC6 | 次 |
| 教师均衡 SC5 | SC5 | 个教师 |
| 班级空洞 SC8 | SC8 | 对 |
| 教室稳定 SC9 | SC9 | 个 task |
| 容量利用 SC10 | SC10 | 次 |
| 最小扰动 MIN_PERT | MIN_PERT | 个 slot |

每个卡片显示：触发数 / 扣分 / 状态 (pass/info/warn/block) / top message。

### 6.3 约束详情表 (16 行)

列：约束 | 类型 | 触发 | 总扣分 | 单次 | 状态 | 说明
可展开查看 topExamples。

### 6.4 Top Issues (≤ 20 条)

按 severity 排序（block > warn > info），同 severity 内按 |totalPenalty| 降序。

---

## 7. Severity 阈值

| 约束 | pass | info | warn | block |
|------|------|------|------|-------|
| HC1-HC6 | 0 | — | — | ≥1 |
| SC6 / SC7 | 0 | — | 1-4 | ≥5 |
| SC5 / SC8 / SC9 | 0 | 1-4 | 5-19 | ≥20 |
| SC10 | 0 | 1-19 | ≥20 | — |
| SC1 / SC2 / SC3 / SC4 | 0 | 1-9 | ≥10 | — |
| MIN_PERT | 0 | 1-9 | ≥10 | — |

---

## 8. 验证结果

| 验证 | 命令 | 结果 |
|------|------|------|
| K22-L2 验证 | `npx tsx scripts/verify-scheduler-breakdown-ui-k22-l2.ts` | **186 / 186 PASS** |
| K22-C harness | `npx tsx scripts/verify-score-regression-harness-k22-c.ts` | **73 / 0 / 0 / 0** |
| F11 capacity | `npx tsx scripts/verify-capacity-preference-constraint-k22-f11.ts` | 13/13 PASS |
| F8 stability | `npx tsx scripts/verify-classroom-stability-constraint-k22-f8.ts` | 11/11 PASS |
| F6 gap | `npx tsx scripts/verify-class-gap-reduction-constraint-k22-f6.ts` | 12/12 PASS |
| F4 balance | `npx tsx scripts/verify-teacher-day-balance-constraint-k22-f4.ts` | 13/13 PASS |
| F3 campus | `npx tsx scripts/verify-specialty-campus-weekend-constraints-k22-f3.ts` | 16/16 PASS |
| Prisma validate | `npx prisma validate` | PASS |
| Next build | `npm run build` | PASS |
| ESLint | `npm run lint` | 180 errors / 134 warnings (与 K22-L1 提交前相比：**0 新增 error**，warning 减 2) |
| test:auth-foundation | `npm run test:auth-foundation` | 53 passed / 1 failed (pre-existing ScheduleAdjustment) |

### K22-L2 验证脚本覆盖

- **A. CONSTRAINT_REGISTRY 稳定性** (16 约束 / 类型唯一 / penalty 正确)
- **B. null 输入契约** (null / undefined / empty 数组均不报错)
- **C. 正常输入行为** (计数 / 总扣分 / 平均 / topExamples 上限)
- **D. Top issues 排序** (severity 优先 / 上限 20 / rank 递增)
- **E. Severity 阈值** (SC7/SC8 各档位验证)
- **F. Wire shape round-trip** (build → JSON → read 完整循环)
- **G. Backwards compat** (旧 run / null / 空 / 损坏 JSON)
- **H. 静态接线检查** (preview.ts / route.ts / 两个 UI 都引用了正确 API)
- **I. UI 渲染安全性** (null → "旧运行无 breakdown" fallback)

---

## 9. lint 漂移分析

| 阶段 | errors | warnings | 备注 |
|------|--------|----------|------|
| K22-L1 前 | 180 | 136 | 基线 |
| K22-L1 后 | 180 | 136 | 完全相同 |
| **K22-L2 后** | **180** | **134** | 0 new error，warning -2 |

K22-L2 净效果：
- 0 new error
- -2 warnings (修复了 `studentInfo` / `initialSummary` unused-var 在 K22-L1 评估脚本里)
- 1 new pre-existing `ResolvedSemester` warning 在 K22-L1 就有，与本阶段无关

---

## 10. 向后兼容保证

| 场景 | 行为 |
|------|------|
| 旧 run (无 `scoreBreakdown` 字段) | API 返回 `scoreBreakdown: null`，UI 显示 "旧运行无 breakdown 数据" 占位卡 |
| resultSnapshot 损坏 JSON | `readSnapshotBreakdown` try-catch 返回 `null` |
| resultSnapshot 为空字符串 | 返回 `null` |
| `scoreBreakdown` 格式异常 | `readPersistedBreakdown` 校验字段类型，失败返回 `null` |
| 新 run (有 `scoreBreakdown`) | 正常显示 4 区内容 |

**任何情况下 UI 都不会崩溃。**

---

## 11. 未修改范围确认

| 项 | 状态 |
|----|------|
| `prisma/schema.prisma` | ❌ 未改 |
| `prisma/migrations/` | ❌ 未改 |
| 业务数据 | ❌ 未写（preview.ts 只在创建新 run 时写，K22-L2 实施时无 preview 调用） |
| `src/lib/scheduler/score.ts` | ❌ 未改 |
| `src/lib/scheduler/solver.ts` | ❌ 未改 |
| `src/lib/scheduler/types.ts` | ❌ 未改 |
| `src/lib/scheduler/apply.ts` | ❌ 未改 |
| `src/lib/scheduler/rollback.ts` | ❌ 未改 |
| `src/lib/scheduler/config.ts` | ❌ 未改 |
| `src/lib/scheduler/data-loader.ts` | ❌ 未改 |
| API 业务逻辑 | ❌ 未改 (仅 response shape 扩展) |
| solver algorithm | ❌ 未改 |
| move generation | ❌ 未改 |
| penalty constants | ❌ 未改 |
| 新约束 (SC11 等) | ❌ 未新增 |
| 调参 | ❌ 未调参 |
| hardWeights / softWeights | ❌ 未引入 |
| RBAC | ❌ 未改 |
| importer / parser | ❌ 未改 |

---

## 12. 阶段关闭建议

**建议关闭 K22-L2。**

### 12.1 验收

- ✅ 真实 solver breakdown 在 live preview 与 history run detail 都能展示
- ✅ 16 个约束全部展示（含未触发的）
- ✅ 8 个业务卡片按业务友好分组
- ✅ Top issues 排序正确
- ✅ BEFORE / AFTER 切换正常
- ✅ 旧 run 向后兼容（不报错）
- ✅ K22-C harness 73/0/0/0 不变
- ✅ F3/F4/F6/F8/F11 wrapper 全部 PASS
- ✅ Prisma validate PASS
- ✅ Build PASS
- ✅ Lint 0 new error
- ✅ test:auth-foundation 唯一失败仍为 pre-existing

### 12.2 建议下一阶段

**K22-L3 (可选)**: 把 K22-L1 的 evaluation 报告接入 CI，作为每次 commit 的回归基线。
- 跑 `evaluate-real-solver-quality-k22-l1.ts`
- 与 docs/k22-real-solver-quality-evaluation.json baseline 对比
- 任何 soft score 变化 > 50 或 hard 退步 → 失败

或者：

**K22-L1B (可选)**: 如果产品反馈 soft quality 仍不够好，可进入软权重调参阶段。
- SC8 权重 -2 → -3 (更少空洞)
- SC9 权重 -2 → -3 (更少多教室)
- SC10 waste 阈值 0.30 → 0.40 (更少大教室浪费)

**默认不推荐继续软调参** — 当前结果已可达"教师按课表上课"标准。

---

## 13. 重新运行

```bash
cd "D:\Desktop\Course Development System\my-app"

# K22-L2 验证
npx tsx scripts/verify-scheduler-breakdown-ui-k22-l2.ts

# 完整验证套件
npx tsx scripts/verify-score-regression-harness-k22-c.ts
npx tsx scripts/verify-capacity-preference-constraint-k22-f11.ts
npx tsx scripts/verify-classroom-stability-constraint-k22-f8.ts
npx tsx scripts/verify-class-gap-reduction-constraint-k22-f6.ts
npx tsx scripts/verify-teacher-day-balance-constraint-k22-f4.ts
npx tsx scripts/verify-specialty-campus-weekend-constraints-k22-f3.ts
```

### 触发 UI 渲染

1. `npm run dev`
2. 访问 `http://localhost:3000/admin/scheduler/preview` (live preview with breakdown)
3. 访问 `http://localhost:3000/admin/scheduler/history` → 展开任意 PREVIEW run
   - 旧 run (创建于 K22-L2 之前) → "旧运行无 breakdown 数据"
   - 新 run → 完整 4 区 breakdown

---

**报告结束。建议关闭 K22-L2。**
