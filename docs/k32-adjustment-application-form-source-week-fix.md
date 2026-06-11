# K32-A2: 调课申请表 Source Week Resolution Fix

## 概述

K32-A1 已修复 layout/format，但仍有问题：**导出原位置只显示"星期X"（无周次上下文）**。

| 维度 | K32-A1 现状 | K32-A2 修复后 |
| --- | --- | --- |
| 历史数据 (sourceWeek=null) | "由星期五 第1-2节 教室 11-223；..." | "由**第?周** 星期五 第1-2节 教室 11-223；..." |
| 新申请 (sourceWeek=7, startsAt=2026-03-09) | "由星期五 第1-2节 ..." | "由**4月10日** 第1-2节 ..." 或 "由**第7周** 星期五 ..." |

本阶段：

1. **导出解析/fallback**（核心修复）：`formatWeekAndDay` 严格保证输出包含 `第X周` 或 `第?周` 上下文，**禁止** fallback 到纯 "星期X"。
2. **submit path 最小修复**：把 dashboard 当前查看周次 (`week` prop) 作为 `sourceWeek` 写入 `ScheduleAdjustmentRequest.sourceWeek` 字段，让新申请能输出具体日期。**不改 schema / migration / RBAC**。

## 0. 诊断

| 项 | 现状 |
| --- | --- |
| `ScheduleAdjustmentRequest.sourceWeek` 字段 | ✅ 存在（schema.prisma: `sourceWeek Int?`） |
| 数据库当前 8 条请求的 sourceWeek 分布 | `notNull=0, null=8`（100% 缺失） |
| sample requestId=2 | `sourceWeek=null, sourceDayOfWeek=5, sourceSlotIndex=1, sourceRoomId=12` <br/> `→ targetWeek=12, targetDayOfWeek=2, targetSlotIndex=3, targetRoomId=2` |
| semester.startsAt | `2026-03-09T00:00:00.000Z`（可用，target 能算出 5月26日） |
| source week 来源分析 | 1. `request.sourceWeek` 字段已存在但 K28 service 永远写 null（`adjustment-request-service.ts:139` 旧逻辑 `sourceSlot.teachingTask.weekType === 'ALL' ? null : null`）；2. `ScheduleSlot` 是 recurring 无 week 字段；3. `createdAt` 不可作为 sourceWeek（spec 禁止） |
| K28 service 写入逻辑 | 之前：`sourceWeek: sourceSlot.teachingTask.weekType === 'ALL' ? null : null`（永远 null）<br/>K32-A2 修复：`sourceWeek: input.sourceWeek ?? null`（接受 caller 传入） |

## 1. 修复内容

### 1.1 导出解析/fallback（核心）

`src/lib/schedule/adjustment-application-form.ts`：

- **`formatWeekAndDay(week, dayOfWeek)`**: 严格保证输出包含 `第X周` 或 `第?周`：
  - week 已知 + dayOfWeek 已知 → `第X周 星期Y`
  - week 已知 + dayOfWeek 缺失 → `第X周`（保留周次）
  - week 缺失 + dayOfWeek 已知 → `第?周 星期Y`（占位）
  - week/dayOfWeek 都缺失 → `第?周`（纯占位）
  - **禁止** fallback 到纯 `星期X`
- **`resolveSourceWeekForExport(req)`** 新增：当前实现直接读 `req.sourceWeek`，但提供清晰的扩展点（未来可加 `approvedAdjustment.sourceWeek` / `sourceJson` / 其它来源）。
- **`buildFormalAdjustmentSituation(req)`** 改用 `resolveSourceWeekForExport` 替代直接读 `req.sourceWeek`。

### 1.2 Submit path 最小修复

`src/components/schedule/user-adjustment-request-dialog.tsx`：
- 在 `dryRunAdjustmentRequest` / `submitAdjustmentRequest` 调用中加 `sourceWeek: week`（dialog 已有 `week` prop，是 dashboard 当前查看周次）。

`src/lib/schedule/adjustment-request-client.ts`：
- `SubmitPayload` 加 `sourceWeek?: number | null` 字段。

`src/app/api/schedule-adjustment-requests/route.ts`：
- POST 接收 `sourceWeek`；类型守卫 `typeof sourceWeek === 'number'`。
- 透传给 `submitAdjustmentRequest`。

`src/lib/schedule/adjustment-request-service.ts`：
- `SubmitRequestInput` 加 `sourceWeek?: number | null`。
- 写入逻辑改为 `sourceWeek: input.sourceWeek ?? null`（之前是永远 null）。

**dry-run route 不变**（仅做冲突检查，不写 DB）。**recommendations route 不变**（无 sourceWeek 概念）。**mine / admin route 不变**（读路径）。

### 1.3 字段来源优先级（resolveSourceWeekForExport）

```
1. request.sourceWeek        (K32-A2 之后新申请会有值)
2. (future) approvedAdjustment.sourceWeek
3. (future) request.sourceSnapshot.sourceWeek
4. (future) sourceScheduleSlot.week  // schema 当前不存在
5. null → 导出 fallback "第?周 星期X"
```

**禁止** 用 `request.createdAt` 推断 source week（spec 明文）。

## 2. 输出示例

| sample input | 输出 |
| --- | --- |
| sourceWeek=null, sourceDay=5, sourceSlot=1, room="11-223"<br/>targetWeek=12, targetDay=2, targetSlot=3, room="11-223" | "由**第?周** 星期五 第1-2节 教室 11-223；串至 **5月26日** 第5-6节 教室 11-223" |
| sourceWeek=7, sourceDay=5, sourceSlot=1, room="11-223" | "由 **4月24日** 第1-2节 教室 11-223；..."<br/>（注：03-09 + 42 + 4 = 04-24） |
| sourceWeek=12, sourceDay=2, sourceSlot=3, room="11-223" | "由 **5月26日** 第5-6节 教室 11-223；..."<br/>（03-09 + 77 + 1 = 05-26） |

## 3. 修改范围

- `src/lib/schedule/adjustment-application-form.ts` — 核心修复（formatWeekAndDay + resolveSourceWeekForExport + buildFormalAdjustmentSituation）
- `src/lib/schedule/adjustment-request-client.ts` — SubmitPayload.sourceWeek
- `src/components/schedule/user-adjustment-request-dialog.tsx` — dry-run / submit payload 传 sourceWeek
- `src/app/api/schedule-adjustment-requests/route.ts` — POST 接收 sourceWeek
- `src/lib/schedule/adjustment-request-service.ts` — SubmitRequestInput.sourceWeek + service 写入修复
- `scripts/verify-adjustment-application-form-source-week-k32-a2.ts` — 新增（35 项检查）
- `docs/k32-adjustment-application-form-source-week-fix.md` — 本文档
- `docs/k32-adjustment-application-form-source-week-fix.json` — 机读报告

**未修改**：
- schema / migration / prisma/dev.db
- RBAC 权限矩阵
- 审批 approve/reject 语义
- ScheduleAdjustment 写入语义
- ScheduleSlot 写入语义
- solver / score / scheduler
- K22 expected
- 调课业务逻辑（dry-run / approve 流程）
- dry-run / recommendations / mine / admin GET routes

## 4. 验证

### 必跑

```bash
npx tsx scripts/verify-adjustment-application-form-source-week-k32-a2.ts   # 35/35 PASS
npx tsx scripts/verify-adjustment-application-form-layout-k32-a1.ts          # 34/34 PASS (回归)
npx tsx scripts/verify-adjustment-application-form-export-k32-a.ts          # 49/49 PASS (回归)
npx tsx scripts/verify-user-adjustment-approval-flow-closeout-k28.ts        # 41/41 PASS
npx tsx scripts/verify-adjustment-request-pages-protected-shell-k31-c.ts    # 26/26 PASS
npx prisma validate                                                          # PASS
npx prisma migrate status                                                    # 9 migrations, up to date
npm run build                                                                # PASS
npm run lint                                                                 # 188/152 (= baseline)
npm run test:auth-foundation                                                  # 60/2 (= baseline, pre-existing)
```

### 建议补跑

```bash
npx tsx scripts/verify-schedule-export-current-filter-k31-a.ts   # 24/24 PASS
npx tsx scripts/verify-score-regression-harness-k22-c.ts          # 73/73 PASS
```

## 5. 集成样例（gitignored，scripts/k32-a-sample/）

样例关键 cell 读回（requestId=2, sourceWeek=null）：

- **B5**: "由**第?周** 星期五 第1-2节 教室 11-223；串至 5月26日 第5-6节 教室 11-223"
- **B6/B7/B8/B9**: 保留模板默认占位
- **A10**: "调（串）课原因：未填写"（单行）
- **C10**: "签名：            年   月   日"（保留模板默认）
- merges 10/10, A1.font 保留

## 6. 已知局限

1. **历史数据 sourceWeek=null**：DB 中 8/8 现有请求 sourceWeek 为 null（K32-A2 之前创建）。他们的导出 fallback 为 "**第?周** 星期五"。**不在 K32-A2 范围**改历史数据；可由 K32-B / 后台脚本回填 dashboard 当时的 week（需要重新打开浏览器 E2E 记录）。
2. **新申请 sourceWeek 来源**：当前用 dashboard 当前查看周次作为 sourceWeek。如果用户在第 3 周操作但实际源位置是第 5 周（罕见但可能），会与实际原位置不同。改进方向是显示一个 source week 选择器，**不在 K32-A2 范围**。
3. **ScheduleAdjustment 模型无 sourceWeek 字段**：targetWeek 在 ScheduleAdjustment.week 中，但 ScheduleAdjustment 不区分 source vs target，所以 approvedAdjustment 不能作为 sourceWeek 来源。

## 7. 推荐下一阶段

- real-use / 视情况 K32-B（如需补 User.department 字段 + 完善 sourceWeek UI 选择器）

## 8. 关闭判断

**K32-A2 CAN CLOSE**

**K32-A 升级到 READY_FOR_REAL_USE：等人工浏览器 E2E 完成**

- ✅ 35/35 K32-A2 verify PASS
- ✅ 34/34 K32-A1 + 49/49 K32-A + 41/41 K28 + 26/26 K31-C + 24/24 K31-A + 73/73 K22-C 全部 PASS
- ✅ Prisma validate + migrate status PASS
- ✅ build / lint 188/152 baseline / auth foundation 60/2 baseline
- ✅ 无 schema/migration/DB/RBAC/K22 expected 变更
- ✅ Submit path 最小修复（dialog → client → API → service）让新申请有完整 sourceWeek
- ✅ 历史数据 fallback 安全（"第?周 星期X" 占位）
- ✅ 集成样例 gitignored，不入库
- ✅ 已 `git push origin master`（见完成报告）
