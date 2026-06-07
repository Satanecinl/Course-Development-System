# K23 Room Recommendation Acceptance Closeout

**Stage**: `K23-ROOM-RECOMMENDATION-ACCEPTANCE-CLOSEOUT`
**Date**: 2026-06-07
**K23-A commit baseline**: `8332c60` (`feat(schedule-adjust): K23-A auto room recommendations`)
**K22 baseline commit**: `ab7d9fd` (K22 mainline CLOSED)
**Manual frontend validation**: **PASSED**
**Feature status**: **READY_FOR_REAL_USE**
**K23 room recommendation status**: **CLOSED**

---

## 1. Executive Summary

K23 调课自动推荐教室功能主线已正式完成。

**功能达成用户原始需求**:

- ✅ 调课时可以自动推荐教室
- ✅ 正常场景返回多个候选 (默认 limit=5，至少 2 个为可用基线)
- ✅ 候选不足 2 个时明确返回 `minimumSatisfied: false` + `rejectedSummary` + 可读 message，**不返虚假推荐**
- ✅ 每个候选附带 reasons / warnings，可解释
- ✅ 点击候选自动填入调课表单 `roomId`
- ✅ 手动选择教室流程**完全保留**
- ✅ API 失败不影响手动选择
- ✅ 复用现有 `checkScheduleConflicts` / capacity / K22-F2A 业务规则
- ✅ 权限复用 `schedule:adjust`，**未新增 RBAC permission**

**用户验收**: 前端人工验证通过。

---

## 2. Scope Completed

### 2.1 Backend

| 项 | 状态 |
|----|------|
| `findAdjustmentRoomRecommendations` helper | ✅ |
| `POST /api/schedule-adjustments/room-recommendations` API | ✅ |
| 权限复用 `schedule:adjust` | ✅ |
| 只读推荐，不写 DB | ✅ |
| 输入验证 (week/day/slot/limit bounds) | ✅ |
| 错误码映射 (SEMESTER_NOT_FOUND / NO_ACTIVE_SEMESTER / MULTIPLE_ACTIVE_SEMESTERS) | ✅ |

### 2.2 Rules (helper 内部)

| 规则 | 状态 |
|------|------|
| room / teacher / classGroup conflict (复用 `checkScheduleConflicts`) | ✅ |
| capacity 过滤 (复用 `getTaskStudentCount` 求和公式) | ✅ |
| 林校 / 汽车 (K22-F2A 5-class 分类, verbatim copy) | ✅ |
| `room=0` placeholder 排除 | ✅ |
| `rejectedSummary` 永远返回 | ✅ |
| 少于 2 个候选时 `minimumSatisfied: false` | ✅ |
| ranking score (历史教室 / 汽车林校 / 容量利用率 / 同楼栋) | ✅ |

### 2.3 Frontend

| 项 | 状态 |
|----|------|
| "推荐教室" 按钮 | ✅ |
| 候选列表 (教室名 / 容量 / 评分 / reasons / warnings) | ✅ |
| 点击候选填入 `newRoomId` + 高亮 | ✅ |
| 候选不足 2 个时显示 `rejectedSummary` 汇总 | ✅ |
| 0 候选时显示 `message` 引导改时段 | ✅ |
| API 失败时 toast + inline error，不阻塞手动 | ✅ |
| 切 targetWeek / day / slot 时清空 recommend | ✅ |
| item 变化时清空 recommend | ✅ |
| **手动 `<select>` 教室下拉框完全保留** | ✅ |
| 加载/权限 gate (`useHasPermission('schedule:adjust')`) | ✅ |

### 2.4 Verification

| 验证 | 结果 |
|------|------|
| K23-A verify | 66/66 PASS |
| schedule mutation preflight | 23/23 PASS |
| schedule mutation server guards | HIGH=0, MEDIUM=0 |
| teaching-task semantic guards | BLOCKING=NO |
| K22-C regression harness | 73/0/0/0 |
| prisma validate | schema valid |
| build | PASS |
| lint | 0 new error |
| auth-foundation | 53 passed / 1 pre-existing failure |

### 2.5 Manual Acceptance

- ✅ **前端人工验证通过**
- 用户在浏览器中实测"推荐教室"流程
- 确认候选可解释、点击填入、不影响手动选择
- 用户提供 feedback："前端人工验证通过"

---

## 3. Manual Acceptance Evidence

| 维度 | 状态 | 来源 |
|------|------|------|
| **Manual review status** | ✅ PASSED | user-provided frontend manual validation |
| **Reviewer source** | project owner / user-provided | 不编造具体教务姓名 / 部门 |
| **Validation date** | 2026-06-07 | K23-A 验收阶段 |
| **Validation scope** | 浏览器调课弹窗 | 推荐按钮 / 候选列表 / 点击填入 / rejected summary / 手动选择 fallback |
| **Note** | "前端人工验证通过" | user-provided |

> **Reviewer**: project owner / user-provided (no fabricated 教务 / 部门 name)

---

## 4. Current Baseline

| 指标 | 值 |
|------|-----|
| K23-A verify | **66 / 66 PASS** |
| K22-C regression harness | **73 / 0 / 0 / 0** (稳定 since K22-D SC1 delta fix) |
| Schedule mutation preflight | **23 / 23 PASS** |
| Schedule mutation server guards | **HIGH=0, MEDIUM=0** (LOW=3 无新增) |
| Teaching-task semantic guards | **BLOCKING=NO** (HIGH=0, MEDIUM=0) |
| K22-PAUSE trial readiness | **61 / 62** (1 expected: K23-A 新增文件导致 working tree 不空) |
| `npx prisma validate` | schema valid |
| `npm run build` | PASS |
| `npm run lint` | 181 errors / 136 warnings (**0 new error**) |
| `npm run test:auth-foundation` | 53 passed / 1 failed (pre-existing `ScheduleAdjustment ACTIVE count mismatch`) |
| DB writes by K23-A | **0** (read-only) |

### 4.1 推荐功能 baseline

- 默认 `limit = 5`
- `MIN_CANDIDATES = 2` (helper 内部常量)
- 推荐 ranking: `score desc, roomId asc` (确定性)
- 失败时 `minimumSatisfied: false` + `rejectedSummary` (5 桶: conflict / capacity / linxiaoPolicy / unavailable / other)
- 成功时 `candidates: RoomRecommendationCandidate[]` + reasons / warnings
- API 路由权限: `schedule:adjust` (与调课 / void 调课同权限)
- API DB writes: **0** (route 全文无 prisma create/update/delete/upsert)

### 4.2 性能 baseline

- 53 rooms × 1 conflict check each = 53 conflict check round-trips per request
- 每个 conflict check 内部 1 次 prisma.findMany(ScheduleSlot by day+slot)
- 真实调用 < 500ms (DB 本地)
- 限制 `limit ≤ 20` 防止 response unbounded

---

## 5. Known Limitations (不阻塞 closeout)

### 5.1 推荐排序 / 业务规则

- **L-K23-A-NO-TUNING**: 推荐 ranking score 权重固定；尚无真实反馈数据用于调参
- **L-K23-A-NO-SHARED-SPECIALTY**: K22-F2A specialty 分类逻辑当前 verbatim copy 在 helper 内部；未来应抽取共享 helper 避免 K22 / K23 维护不同步
- **L-K23-A-NO-PREFERRED-ROOM**: 无 preferred room / homeRoom / room type schema
- **L-K23-A-NO-TIME-ALTERNATIVE**: 仅推荐"目标时间"下可用教室；不推荐"可替代时间"
- **L-K23-A-NO-MULTI-WEEK**: 候选仅评估 `targetWeek` 单周；多周调课会按 dry-run 单独判定

### 5.2 候选不足 2 个时

- **L-K23-A-NO-FAKE**: 候选不足 2 个时**不**返虚假推荐 (e.g. 不会返 conflict room 凑数)
- 必须 `rejectedSummary` 显式说明原因
- 强制引导手动选择 / 改时段

### 5.3 历史 debt (跨 K22/K23)

- **L-LINT-DEBT**: 181 errors / 134-136 warnings (K22 阶段既有 debt；K23-A 0 new error)
- **L-AUTH-SCHED-ADJUST**: pre-existing `ScheduleAdjustment ACTIVE = 0 (实际 10)` (历史数据, 未尝试修复)
- **L-DB-BACKUP**: real production rollout 前仍建议备份 DB

### 5.4 业务限制

- 真实生产使用前仍建议管理员确认调课 dry-run 结果 (推荐是 advisory, 不是强制)
- 推荐结果在用户调课流程中是**辅助**, 最终决定权在教务

---

## 6. Post-Closeout Decision Rules

后续只有真实反馈触发才进入对应阶段。**不再继续按 audit 模式推进**。

| 反馈类型 | 下一阶段 |
|----------|----------|
| 推荐顺序不理想 (历史教室 / 容量 / 林校权重需调整) | `K23-C-ROOM-RECOMMENDATION-QUALITY-TUNING` |
| 林校 / 汽车规则需要统一维护 (避免 K22 / K23 复制) | `K23-D-SHARED-SPECIALTY-CAMPUS-POLICY-HELPER` |
| 需要指定偏好教室 / 专业教室 / room type | `K23-E-PREFERRED-ROOM-RULES-PLAN` |
| 候选不足时希望推荐"可替代时间" | `K23-F-ROOM-OR-TIME-ALTERNATIVE-RECOMMENDATION` |
| 浏览器流程发现 UX bug (按钮位置 / 候选渲染 / toast 抖动) | `K23-B-FIX-*` |

**原则**: 任何机械式 K23 后续阶段都需要真实使用反馈 trigger, 不再继续按 audit 模式推进。

---

## 7. Final Recommendation

### 7.1 关闭状态

- **`K23 room recommendation: CLOSED`**
- **`Feature status: READY_FOR_REAL_USE`**
- **`Manual frontend validation: PASSED`**
- **Next default action**: use in real adjustment workflow; do not tune ranking until real feedback exists

### 7.2 系统当前可承担

- ✅ 调课时自动推荐教室 (单次请求 < 500ms)
- ✅ 正常场景返回多个候选 (默认 5，至少 2)
- ✅ 候选不足 2 个时给出 rejected summary
- ✅ 复用现有冲突 / 容量 / 林校汽车规则
- ✅ 候选可解释 (reasons / warnings)
- ✅ 点击候选填入 / 手动选择保留
- ✅ 权限与调课同步 (`schedule:adjust`)
- ✅ 完全 read-only, 不影响业务数据

### 7.3 后续行动 (按需)

1. **立即可做**: 进入真实调课使用 (教务处 / 调课员试用 → 收集反馈)
2. **如有反馈**: 按 §6 decision rules 触发对应阶段
3. **数据备份**: 任何 apply 前必先 `cp prisma/dev.db prisma/dev.db.backup-*`
4. **监控**: K23-A verify 66/66 + K22-C 73/0/0/0 + L1 baseline 应作为后续 regression 监控基线

### 7.4 不建议

- ❌ 继续 mechanical K23 阶段 (audit / 文档 / 调参) 除非有真实反馈
- ❌ 修改 room-recommendations.ts / API route / 弹窗 UI 业务逻辑
- ❌ 修改 score.ts / solver algorithm / penalty constants
- ❌ 修改 prisma schema
- ❌ 引入 hardWeights / softWeights (除非 K23-C 触发)
- ❌ 抽取 specialty helper (除非 K23-D 触发)
- ❌ 加 preferred room schema (除非 K23-E 触发)
- ❌ 加可替代时间推荐 (除非 K23-F 触发)

---

**报告结束。K23 调课自动推荐教室小主线正式关闭。系统进入真实调课使用 / 维护模式。**

---

## 8. Post-Closeout Additive Compatibility (added by K24-A1)

> 本节由 K24-A1 (`K24-A1-PLAN-RECOMMENDATION-VERIFY-ALIGNMENT`) 阶段追加；不改 K23 closeout 主体关闭结论。
>
> 适用对象: 任何在 K23 closeout 之后、与 K23 共享 UI / client 文件的 additive 阶段。

### 8.1 背景

K23 closeout 验证脚本 (`scripts/verify-room-recommendation-closeout-k23.ts`) 最初对**所有**未改过的源码文件使用 `git diff since K23-A baseline (8332c60)` no-diff 检查。

K24-A 是 additive 阶段，目标是在 K23 共享的 `src/components/schedule-adjustment-dialog.tsx` 与 `src/lib/schedule/adjustment-client.ts` 上引入"一键推荐调课方案"。这导致 K23 closeout verify 在 K24-A HEAD 上误报 2 个 failure（73/75）。

### 8.2 K24-A1 修正

verify 脚本的 G 节已升级为:

- **G1. Strict untouched** — K23-A 核心后端 (`room-recommendations.ts` + API route) / `score.ts` / `prisma/schema.prisma` / `prisma/migrations/*` 仍按 no-diff 检查
- **G2. Additive-compatible** — `src/components/schedule-adjustment-dialog.tsx` / `src/lib/schedule/adjustment-client.ts` 改为 marker-based compatibility check。K23-A markers 仍必须存在 (e.g. `fetchRoomRecommendations` / `推荐教室` / `<option value="">不变</option>` / `pickCandidate`)，K24-A additive markers 可共存

K23 closeout verify 升级后 K24-A HEAD 上结果为 **84/84 PASS** (从 75 升)。

### 8.3 后续 additive 阶段规则

> 任何在 K23 closeout 之后、与 K23 共享 UI / client 文件的 additive 阶段，**应使用 compatibility check 而非 no-diff check** 验证这些共享文件。
>
> K23-A 业务能力 (K23-A verify 66/66, K23-A helper/API source intact, K23-A UI markers) 仍由独立 K23-A verify 与 K23 closeout verify §H 共同保证。

### 8.4 K23 closeout 关闭结论未改变

- K23 room recommendation: **CLOSED** (不变)
- Feature status: **READY_FOR_REAL_USE** (不变)
- Manual frontend validation: **PASSED** (不变)
- K23-A 业务能力 (helper / API / dialog 推荐教室入口 / 手动选择): **完整** (intact, 由 K24-A1 兼容性检查保证)
