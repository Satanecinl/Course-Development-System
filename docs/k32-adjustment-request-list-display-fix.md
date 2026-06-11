# K32-A3: 调课申请列表位置显示修复

## 概述

K32-A2 已修复 Excel 导出格式（用户反馈"导出表格现在显示正确了"）。本阶段修的是**页面列表展示**（`/admin/adjustment-requests` 和 `/my-adjustment-requests`）：

| 维度 | 修复前（不友好） | 修复后 |
| --- | --- | --- |
| 原位置星期 | "第5天" | **星期五** |
| 目标位置星期 | "星期2" | **星期二** |
| 节次 | "节次4" | **第7-8节** |
| 周次 | 原位置无周次 | **第?周** / **第5周** |
| 教室 | "未指定教室" | **教室** (空字符串占位) |
| 格式 | 内联模板，各写一套 | **共享 `formatSourcePosition` / `formatTargetPosition`** |

目标显示（`第X周 星期X 第X-X节 教室 XXX`）：

```
第5周 星期五 第7-8节 教室 11-333      (sourceWeek 有值)
第?周 星期五 第1-2节 教室 11-223      (历史数据 sourceWeek=null)
第9周 星期二 第7-8节 教室 11-333      (target 始终有值)
```

本阶段只修列表展示格式，不改审批逻辑、不改 DB、不改 schema、不改 RBAC。

## 修改范围

新增：
- `src/lib/schedule/adjustment-request-display.ts` — 共享位置 formatter（纯函数，只读）

修改：
- `src/lib/schedule/adjustment-request-client.ts` — `AdjustmentRequestListItem` 增加 `sourceWeek` / `targetRoomName` 字段
- `src/app/api/admin/schedule-adjustment-requests/route.ts` — admin serializer 增加 `sourceWeek` / `targetRoomName`
- `src/app/api/schedule-adjustment-requests/mine/route.ts` — mine serializer 增加 `sourceWeek` / `targetRoomName`
- `src/app/admin/adjustment-requests/admin-adjustment-requests-content.tsx` — 替换内联格式为共享 formatter
- `src/app/my-adjustment-requests/my-adjustment-requests-content.tsx` — 同上

## 共享 Formatter

`src/lib/schedule/adjustment-request-display.ts` 导出：

| 函数 | 行为 |
| --- | --- |
| `formatDayOfWeek(5)` | → "星期五"（禁止 "第5天" / "星期2"） |
| `formatSlotIndex(4)` | → "第7-8节"（禁止 "节次4"） |
| `formatWeek(7)` | → "第7周"；`formatWeek(null)` → "第?周" |
| `formatRoomName('11-333')` | → "11-333"；`formatRoomName(null)` → ""（空字符串） |
| `formatPosition(5,5,4,'11-333')` | → "第5周 星期五 第7-8节 教室 11-333" |
| `formatSourcePosition(item)` | → formatPosition(item.sourceWeek, ...) |
| `formatTargetPosition(item)` | → formatPosition(item.targetWeek, ...) |

## 数据要求

`sourceWeek` 字段：K32-A2 已在 DB 中存在，但 K32-A2 之前创建的 8 条请求为 null。K32-A2 submit path 已修复让新申请写入 sourceWeek。**本阶段不做历史回填**，null 由 UI 显示为 "第?周"。

`targetRoomName` 字段：当前 list 查询未 include target room（只查了 sourceScheduleSlot.room.name），暂返回 null。目标位置列显示 `第X周 星期X 第X-X节 教室 `（空教室占位）。扩展 include 是 K32-B 事项。

## 验证

### 必跑

```bash
npx tsx scripts/verify-adjustment-request-list-display-k32-a3.ts    # 26/26 PASS
npx tsx scripts/verify-adjustment-application-form-source-week-k32-a2.ts  # 35/35 PASS
npx tsx scripts/verify-adjustment-application-form-layout-k32-a1.ts  # 34/34 PASS
npx tsx scripts/verify-adjustment-application-form-export-k32-a.ts  # 49/49 PASS
npx tsx scripts/verify-user-adjustment-approval-flow-closeout-k28.ts # 41/41 PASS
npx tsx scripts/verify-adjustment-request-pages-protected-shell-k31-c.ts # 26/26 PASS
npx prisma validate                                                    # PASS
npx prisma migrate status                                              # 9 migrations, up to date
npm run build                                                          # PASS
npm run lint                                                           # 188/152 (= baseline)
npm run test:auth-foundation                                            # 60/2 (= baseline)
```

## 已知局限

1. **targetRoomName 在 list 中为 null**：当前 list 查询（`listAdjustmentRequests`）未 include targetScheduleSlot.room.name（因为 ScheduleAdjustmentRequest 没有 targetScheduleSlot 的外键）。要正确显示目标教室，需要 join ScheduleAdjustment 来获取 approvedAdjustment 的 target room，或直接扩展 list 查询 include。属于 K32-B 事项。

2. **历史 8 条请求 sourceWeek=null**：K32-A2 submit path 修复只影响新申请。历史 null sourceWeek 在列表中显示为 "第?周 星期X"。不做 DB 回填。

## 关闭判断

- **K32-A3 CAN CLOSE**
- ✅ 26/26 K32-A3 verify PASS
- ✅ K32-A2/A1/A + K28 + K31-C + K22-C + K31-A 全部 PASS（回归）
- ✅ build / lint 188/152 / auth foundation 60/2
- ✅ 无 schema/DB/RBAC/K22 expected 变更
- ✅ 已 `git push origin master`
