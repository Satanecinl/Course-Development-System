# K24 Plan Recommendation Acceptance Closeout

**Stage**: `K24-PLAN-RECOMMENDATION-ACCEPTANCE-CLOSEOUT`
**Date**: 2026-06-07
**K24 baseline commit**: `d6821d5` (K24-A4A build verification)
**K23 baseline commit**: `e28d4a5` (K23 closeout)
**K22 baseline commit**: `ab7d9fd` (K22 mainline)
**Manual frontend validation**: **PASSED**
**Feature status**: **READY_FOR_REAL_USE**
**K24 plan recommendation status**: **CLOSED**

---

## 1. Executive Summary

K24 一键推荐调课方案小主线已正式完成。

**功能达成用户原始需求**：

- ✅ 一键推荐调课时间和教室组合
- ✅ 用户可选择"优先调课至第几周"
- ✅ 系统自动配对目标周次 / 星期 / 节次 / 教室
- ✅ 推荐结果按"首选周方案 / 备选周方案"分组
- ✅ 推荐列表可滚动 / 可展开 / 可选择
- ✅ 用户选中方案后点击"使用该方案"填入表单
- ✅ 跨周自冲突已过滤（不再推荐第 13 周同课程同位置）
- ✅ 11-12 节不再出现（业务只到 9-10 节）
- ✅ "检查冲突"和"推荐教室"按钮默认隐藏，可通过高级选项打开
- ✅ 手动调课、dry-run、提交调课流程完整保留
- ✅ 调课弹窗中"不变"等手动选项完整

**前端人工核验**：✅ 人工核验通过。

---

## 2. Scope Completed

### 2.1 Backend

| 项 | 状态 |
|----|------|
| `findAdjustmentPlanRecommendations` helper (`src/lib/schedule/adjustment-plan-recommendations.ts`) | ✅ |
| `POST /api/schedule-adjustments/plan-recommendations` API route | ✅ |
| 权限 `schedule:adjust`（与 K23-A / 调课 / void 调课同权限） | ✅ |
| 只读推荐，不写 DB | ✅ |
| 复用 K23-A `findAdjustmentRoomRecommendations`（房间层 delegate） | ✅ |
| 复用 `checkScheduleConflicts` / capacity / K22-F2A 业务规则 | ✅ |
| 跨周自冲突 gate (K24-A2) | ✅ |
| preferredWeek-first 分桶排序 (K24-A3) | ✅ |
| 有效节次 [1..5] 范围 (K24-A4) | ✅ |

### 2.2 Frontend (调课弹窗)

| 项 | 状态 |
|----|------|
| "一键推荐调课方案" 按钮（主入口） | ✅ |
| "优先调课至第 X 周" 控件（独立 preferredPlanWeek） | ✅ |
| 紫色"首选周方案 / 备选周方案"分组展示 | ✅ |
| 可滚动 (`max-h-64 overflow-y-auto`) | ✅ |
| `selectedPlanKey` 选中机制 + "使用该方案" 确认按钮 | ✅ |
| "展开/收起" 切换 | ✅ |
| 高级选项开关 `showAdvancedTools` | ✅ |
| "检查冲突" / K23-A "推荐教室" 按钮默认隐藏 (gated by `showAdvancedTools`) | ✅ |
| 弹窗"新节次" select 隐藏 11-12 节（仅 [1..5]） | ✅ |
| K23-A 推荐教室 handler 仍可用（高级选项打开后） | ✅ |
| 手动选择周次 / 星期 / 节次 / 教室 下拉完整保留 | ✅ |
| dry-run / 提交调课 流程不变 | ✅ |
| 调课成功 toast / 错误处理 | ✅ |

### 2.3 K24 Fixes (A1 / A2 / A3 / A4 / A4A)

| 阶段 | 修复 | 验证 |
|------|------|------|
| K24-A1 | 优先周次选择 / 可滚动列表 / 高级选项 toggle | UX markers intact |
| K24-A2 | 跨周自冲突 gate（teachingTaskId 查 targetWeek occupancy） | 32/32 PASS |
| K24-A3 | preferredWeek-first 分桶（preferredPlans 在前, fallback 后置） | 50/50 PASS |
| K24-A4 | 节次范围 [1..5] 修复（11-12 节不再出现） | 42/42 PASS |
| K24-A4A | build 验证补齐（`npm run build` exit=0） | PASS |

### 2.4 K23-A 兼容性

- K23-A `room-recommendations.ts` helper 完整未改
- K23-A 推荐教室功能（高级选项打开后）仍可用
- K23-A verify 66/66 PASS

---

## 3. Manual Acceptance Evidence

| 维度 | 状态 | 来源 |
|------|------|------|
| **Manual review status** | ✅ PASSED | user-provided frontend manual validation |
| **Reviewer source** | project owner / user-provided | 不编造具体教务 / 部门姓名 |
| **Validation date** | 2026-06-07 | K24 验收阶段 |
| **Validation scope** | 浏览器调课弹窗一键推荐流程 + 选中方案填入 + 备选周 + 高级选项 | K24-A / A1 / A2 / A3 / A4 全部 |
| **Note** | 人工核验通过 | user-provided |

> **Reviewer**: project owner / user-provided (no fabricated 教务 / 部门 name)

---

## 4. Current Baseline

### 4.1 K24 verify 链

| Verify | 结果 |
|--------|------|
| K24 closeout verify (本阶段) | **PASS** |
| K24-A4 专项 verify | **42/42 PASS** |
| K24-A3 专项 verify | **50/50 PASS** |
| K24-A2 专项 verify | **31/31 PASS** |
| K24-A verify | **167/167 PASS** |

### 4.2 K23 / K22 回归

| Verify | 结果 |
|--------|------|
| K23-A verify | **66/66 PASS** |
| K23 closeout verify | **83/83 PASS** |
| K22-C | **73/0/0/0** |
| schedule preflight | **23/23 PASS** |
| schedule mutation guards | **HIGH=0, MEDIUM=0** |
| teaching-task semantic guards | **BLOCKING=NO** |

### 4.3 Build / Lint / Schema / Auth

| 项 | 状态 |
|----|------|
| `npx prisma validate` | schema valid |
| `npm run build` | **PASS** (`✓ Compiled successfully in 2.8s`, exit=0) |
| `npm run lint` | **181 errors / 136 warnings** (0 new error, 0 warning drift vs K24-A4 baseline) |
| `npm run test:auth-foundation` | 53 passed / 1 pre-existing failure (pre-existing `ScheduleAdjustment ACTIVE count mismatch`) |
| Working tree | clean |

### 4.4 Commit Baseline

- K24 主线 HEAD: `d6821d5` (K24-A4A)
- K23 主线 HEAD: `e28d4a5`
- K22 主线 HEAD: `ab7d9fd`
- 本阶段 HEAD: `d6821d5` + closeout commit

---

## 5. Known Limitations (不阻塞 closeout)

### 5.1 推荐 / 业务规则

- **L-K24-A-NO-TUNING**: 推荐排序还没有基于长期真实数据调优；目前是默认权重
- **L-K24-A-NO-GLOBAL-OPTIMAL**: 只推荐目标搜索范围内的方案（K24-A 默认 ±1 周 / 工作日 / 5 节次 = 90 时间点），不做全局最优
- **L-K24-HISTORICAL-SLOTINDEX-6**: 历史 DB 中仍有 2 条 `slotIndex=6` 记录（440 个中），本阶段不清理；K24-A4 文档化为 data cleanup candidate
- **L-K24-A-NO-PREFERRED-ROOM**: 没有 preferred room / room type / manual exception
- **L-K24-A-NO-WEEKEND-STRATEGY**: 没有"替代周末策略"或复杂跨周策略
- **L-K24-A-NO-FAKE**: 候选不足时不会造假（必须有真实 K23-A 房间 + 通过 cross-week gate）
- **L-K24-A-DAILY-DRYRUN**: 真实生产使用前仍建议管理员确认 dry-run 结果（推荐是 advisory, 不是强制）

### 5.2 历史 debt (跨 K22/K23)

- **L-LINT-DEBT**: 181 errors / 136 warnings (K22 阶段既有 debt)
- **L-AUTH-SCHED-ADJUST**: pre-existing `ScheduleAdjustment ACTIVE = 0 (实际 10)` (历史)
- **L-DB-BACKUP**: real production rollout 前仍建议备份 DB

### 5.3 K24-A1 / A2 / A3 / A4 后续可调

- 排序权重 / 时间相似度阈值可调
- 跨周搜索窗口可调 (weekWindow)
- includeWeekend 可调
- preferred room / room type 未实现

---

## 6. Post-Closeout Decision Rules

后续只有真实反馈触发才进入：

| 反馈类型 | 阶段 | 触发 |
|----------|------|------|
| 推荐排序不理想 (历史教室 / 容量 / 林校权重需调整) | `K24-C-PLAN-RECOMMENDATION-QUALITY-TUNING` | 真实调课反馈 |
| 搜索性能慢 | `K24-D-PLAN-RECOMMENDATION-PERFORMANCE-OPTIMIZATION` | 性能反馈 |
| 需要复杂跨周 / 周末策略 | `K24-E-ALTERNATIVE-WEEKEND-OR-CROSS-WEEK-POLICY` | 教务业务需求 |
| 历史 slotIndex=6 需要清理 | `K24-A5-FUTURE-DATA-CLEANUP` | 数据治理需求 |
| UI 仍有 bug | `K24-B-FIX-*` | QA 反馈 |
| 需要 preferred room / room type | `K24-FUTURE-SCHEMA` | 教务业务需求 |

**原则**: 任何机械式 K24 后续阶段都需要真实使用反馈 trigger，不再继续按 audit 模式推进。

---

## 7. Final Recommendation

### 7.1 关闭状态

- **`K24 plan recommendation: CLOSED`**
- **`Feature status: READY_FOR_REAL_USE`**
- **`Manual frontend validation: PASSED`**
- **Next default action**: use in real adjustment workflow; no further K24 mechanical development unless real feedback triggers a follow-up stage

### 7.2 系统当前可承担

- ✅ 一键推荐调课时间和教室组合（首选周 + 备选周分组）
- ✅ 跨周自冲突已过滤（K24-A2 gate）
- ✅ preferredWeek-first 排序（K24-A3 分桶）
- ✅ 有效节次 [1..5] 范围（K24-A4 修复）
- ✅ 推荐列表可滚动 / 可选择 / 可确认
- ✅ 高级选项 toggle（K24-A1 UX）
- ✅ K23-A 推荐教室能力（高级选项打开后）保留
- ✅ 手动调课 / dry-run / submit 流程完整
- ✅ 完全 read-only, 不影响业务数据
- ✅ 权限复用 `schedule:adjust`，未新增 RBAC

### 7.3 后续行动 (按需)

1. **立即可做**: 进入真实调课使用（教务处 / 调课员试用 → 收集反馈）
2. **如有反馈**: 按 §6 decision rules 触发对应阶段
3. **数据备份**: 任何 apply 前必先 `cp prisma/dev.db prisma/dev.db.backup-*`
4. **监控**: K24-A4 42/42, K24-A3 50/50, K24-A2 31/31, K24-A 167/167, K23-A 66/66, K22-C 73/0/0/0 应作为后续 regression 监控基线

### 7.4 不建议

- ❌ 继续 mechanical K24 阶段（audit / 文档 / 调参）除非有真实反馈
- ❌ 修改 K24-A / A1 / A2 / A3 / A4 业务代码
- ❌ 修改 score.ts / solver algorithm / penalty constants
- ❌ 修改 prisma schema
- ❌ 修改 K24-A4 共享 helper (`time-slots.ts`)
- ❌ 引入 hardWeights / softWeights（除非 K24-C 触发）
- ❌ 抽取 specialty helper（除非 K24-D 触发）
- ❌ 加 preferred room / room type schema（除非 K24-FUTURE-SCHEMA 触发）
- ❌ 加复杂跨周 / 周末策略（除非 K24-E 触发）

---

**报告结束。K24 一键推荐调课方案小主线正式关闭。系统进入真实调课使用 / 维护模式。**
