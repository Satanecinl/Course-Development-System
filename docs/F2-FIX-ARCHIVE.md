# F2-FIX 阶段归档总结

> 归档日期：2026-05-29
> 状态：**已正式验收通过**
> 验收脚本：`scripts/f2-fix-e-ui-verify-final.ts`
> 验收截图：`scripts/f2-verify-screenshots/`

---

## 1. 阶段演进（F2-FIX-A → F2-FIX-E-UI-VERIFY）

### F2-FIX-A：调课弹窗与 Dry-Run API
- **新增组件**：`ScheduleAdjustmentDialog`（`src/components/schedule-adjustment-dialog.tsx`）
- **新增 API**：
  - `POST /api/schedule-adjustments/dry-run` — dry-run 冲突检测
  - `POST /api/schedule-adjustments` — confirm 创建 adjustment（需 `confirmText: "CONFIRM_ADJUSTMENT"`）
- **新增客户端**：`src/lib/schedule/adjustment-client.ts`（`dryRunScheduleAdjustment`、`createScheduleAdjustment`）
- **UI 能力**：
  - 弹窗展示源课程信息（教师、班级、原位置）
  - 可修改：目标周次、新星期、新节次、新教室、调课原因
  - dry-run 结果展示（绿色=可以调课 / 红色=存在冲突）
  - 二次确认弹窗（防止误操作）

### F2-FIX-B：已调课标记与撤销
- **新增组件**：撤销确认弹窗（`DashboardPage` 内嵌）
- **新增 API**：`PATCH /api/schedule-adjustments/[id]/void`（需 `confirmText: "VOID_ADJUSTMENT"`）
- **UI 能力**：
  - 已调课卡片显示蓝色"已调课"标记
  - "调课"按钮替换为"撤销"按钮（`Undo2` 图标）
  - 撤销需输入 `VOID_ADJUSTMENT` 确认
- **新增客户端方法**：`voidScheduleAdjustment`

### F2-FIX-C：筛选验证与调入课程参与筛选
- **验证点**：跨周调入课程在以下筛选模式下均正确显示
  - 按班级筛选（`viewType=class`）
  - 按教师筛选（`viewType=teacher`）
  - 按教室筛选（`viewType=room`）
  - ALL 模式（`viewType=all`）
- **实现机制**：`getEffectiveScheduleForWeek` 返回的 `EffectiveScheduleItem` 包含完整 `classGroupIds` / `teacherId` / `roomId`，前端 `applyViewFilter` 统一过滤

### F2-FIX-D：跨周调课核心逻辑
- **Schema 扩展**：`ScheduleAdjustment.targetWeek` 字段（INTEGER, nullable）
- **核心逻辑**（`src/lib/schedule/adjustments.ts`）：
  - `getEffectiveScheduleForWeek(week)`：
    - 加载基础 ScheduleSlot
    - 叠加 ACTIVE adjustments：
      - sourceWeek === week：原 slot 标记为 moved-out（不显示）
      - targetWeek === week：新增调入 item（`isAdjusted=true`，新位置）
  - `dryRunScheduleAdjustment`：在 targetWeek 的有效课表上做冲突检测
  - `createScheduleAdjustment`：原子创建 ACTIVE 记录
  - `voidScheduleAdjustment`：将 ACTIVE 改为 VOID

### F2-FIX-E：API 层最终验收
- 执行 `scripts/test-schedule-adjustment-final-acceptance.ts`
- 验证：dry-run → confirm → verify effective schedule → void → verify restored
- 同周/跨周/容量冲突/重复 adjustment 等边界全部通过

### F2-FIX-E-UI-VERIFY：真实浏览器 UI 点击验收
- **测试方式**：Playwright headless Chromium 真实浏览器自动化 + API 数据闭环验证
- **验证场景**：
  1. 同周调课：dashboard → week7 → 调课 → 修改位置 → dry-run → confirm → verify → void → verify restored
  2. 跨周调课：dashboard → week7 → 调课 → targetWeek=8 → dry-run → confirm → verify week7 gone / week8 appeared → void → verify restored
  3. 筛选验证：跨周调入课程在班级/教师/教室/ALL 筛选下均正确显示
- **全部通过**，截图留存 `scripts/f2-verify-screenshots/`

---

## 2. 跨周调课最终行为定义

### 2.1 数据模型

| 实体 | 角色 | 是否可变 |
|------|------|----------|
| `ScheduleSlot` | 基础学期课表 | **不可变**（F2-FIX 不直接修改） |
| `ScheduleAdjustment` | 周次覆盖记录 | 仅可创建 / void（不可 edit） |

### 2.2 ScheduleAdjustment 字段语义

| 字段 | 同周调课 | 跨周调课 |
|------|----------|----------|
| `type` | `MOVE` | `MOVE` |
| `week` | sourceWeek = 7 | sourceWeek = 7 |
| `targetWeek` | **null**（即等于 `week`） | **8**（明确指定目标周） |
| `originalSlotId` | 原 slot id | 原 slot id |
| `newDayOfWeek` | 新位置星期 | 新位置星期 |
| `newSlotIndex` | 新位置节次 | 新位置节次 |
| `newRoomId` | 新教室（null=不变） | 新教室（null=不变） |
| `status` | `ACTIVE` / `VOID` | `ACTIVE` / `VOID` |

### 2.3 Effective Schedule 计算规则

```
getEffectiveScheduleForWeek(currentWeek):
  1. 加载所有 ScheduleSlot（base items）
  2. 过滤出当前 week 活跃的 slot（按 weekType / startWeek / endWeek）
  3. 加载所有 status=ACTIVE 且 (week==currentWeek OR targetWeek==currentWeek) 的 adjustments
  4. 对每个 adjustment:
     - 若 sourceWeek == currentWeek：将 originalSlotId 标记为 moved-out（不显示）
     - 若 targetWeek == currentWeek：新增调入 item（isAdjusted=true, 使用新位置）
  5. 返回：base items（排除 moved-out）+ 调入 items
```

### 2.4 Void 行为

- Void 后 adjustment `status` 变为 `VOID`
- 再次计算 effective schedule 时，该 adjustment 被忽略
- 原 slot 恢复显示，调入 item 消失

---

## 3. 测试命令清单与通过情况

### 3.1 调课专项测试

```bash
# F2-FIX-E API 验收（同周/跨周/dry-run/confirm/void）
npx tsx scripts/test-schedule-adjustment-final-acceptance.ts
# ✅ 通过

# F2-FIX-E-UI-VERIFY 真实浏览器验收
npx tsx scripts/f2-fix-e-ui-verify-final.ts
# ✅ 通过（Playwright + API 闭环）
```

### 3.2 既有测试

```bash
# 导入质量回归
npm run test:import-quality
# ✅ 通过

# Dry-run 不变性测试
npm run test:confirm-import-dry-run
# ✅ 通过

# 事务回滚测试
npm run test:confirm-import-rollback
# ✅ 通过

# API 守卫测试
npm run test:confirm-api-guards
# ✅ 通过

# 容量诊断
npm run test:capacity
# ✅ 通过

# 评分诊断 + 求解器
npm run test:diagnostics
# ✅ 通过

# 完整求解器
npm run test:solver
# ✅ 通过
```

### 3.3 已知失败（与 F2-FIX 无关）

```bash
npm run test:import-workflow
# ❌ 失败 — ImportBatch #5 数据质量与测试基线不匹配
# 该问题属于导入 pipeline，与 F2-FIX 无关，应单独开阶段处理
```

---

## 4. 数据安全边界

| 约束 | 状态 |
|------|------|
| 不直接修改 `ScheduleSlot` | ✅ 遵守（仅通过 `ScheduleAdjustment` 间接影响 effective schedule） |
| 测试 adjustment 最终 VOID | ✅ 遵守（`scripts/f2-fix-e-ui-verify-final.ts` 每个场景结束后均 void） |
| 不执行 `CONFIRM_IMPORT` | ✅ 遵守（F2-FIX 全程未执行真实导入） |
| 不执行 `ROLLBACK_IMPORT` / `ABANDON_IMPORT` | ✅ 遵守 |
| 不删除业务数据 | ✅ 遵守（仅 void adjustment，不删 slot/task/course） |
| 不修改 Prisma schema（除 F2-FIX-D 的 targetWeek） | ✅ 遵守（targetWeek 已在 F2-FIX-D 完成） |
| 不执行 `db push` | ✅ 遵守 |
| 测试结束无新增 ACTIVE adjustment | ✅ 验证通过（最终 count = 0） |

---

## 5. 已知遗留问题

### 5.1 `npm run test:import-workflow` 失败

- **表现**：ImportBatch #5 的测试断言与当前数据库状态不匹配
- **根因**：该测试基于特定导入批次的数据假设，当前数据库已有多批导入历史，基线漂移
- **影响范围**：仅影响导入 pipeline 的回归测试，不影响调课功能
- **处理建议**：单独开阶段修复测试基线，或改用 mock 数据隔离测试

### 5.2 其他（本次未引入）

- `claude-mem` / `zod/v3` / stop hook 等本地插件问题：属于本地 Claude Code 环境配置，与项目代码无关
- Playwright 浏览器二进制版本（1.60.0）较旧：当前功能正常，如需升级可在后续维护阶段处理

---

## 6. 关键文件清单

| 文件 | 说明 |
|------|------|
| `src/components/schedule-adjustment-dialog.tsx` | 调课弹窗组件 |
| `src/components/schedule-card.tsx` | 课程卡片（已调课标记/撤销按钮） |
| `src/app/dashboard/page.tsx` | Dashboard（调课/撤销弹窗状态管理） |
| `src/lib/schedule/adjustments.ts` | 核心调课逻辑（effective schedule / dry-run / create / void） |
| `src/lib/schedule/adjustment-client.ts` | 客户端调课 API 封装 |
| `src/app/api/schedule-adjustments/dry-run/route.ts` | Dry-run API |
| `src/app/api/schedule-adjustments/route.ts` | Create API |
| `src/app/api/schedule-adjustments/[id]/void/route.ts` | Void API |
| `src/app/api/schedule/route.ts` | Effective schedule API（含 applyAdjustments 参数） |
| `src/types/schedule-adjustment.ts` | 调课类型定义 |
| `scripts/f2-fix-e-ui-verify-final.ts` | F2-FIX-E-UI-VERIFY 验收脚本 |
| `scripts/f2-verify-screenshots/` | 验收截图目录 |
| `docs/F2-FIX-ARCHIVE.md` | 本文档 |

---

## 7. 结论

**F2-FIX 阶段已全部完成并通过验收。**

跨周调课能力已完整交付：
- 同周调课：修改位置，原周次生效
- 跨周调课：指定 targetWeek，sourceWeek 消失、targetWeek 出现
- 撤销：void 后 effective schedule 恢复原始状态
- 筛选：调入课程正确参与班级/教师/教室/ALL 筛选
- 数据安全：ScheduleSlot 不被直接修改，全部通过 adjustment 间接实现
