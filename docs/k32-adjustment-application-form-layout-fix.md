# K32-A1: 调课申请表 Layout 对齐修复

## 概述

K32-A 完成了 export pipeline（USER/ADMIN routes、只读工具、UI 入口），但人工浏览器验证发现**导出表格的内容格式不符合正式串课申请表预期**：

| 维度 | K32-A 现状（不理想） | K32-A1 修复后（接近目标图） |
| --- | --- | --- |
| 串课情况表述 | "原位置 星期一 1-2节 教室 11-321 → 第12周 星期二 5-6节 教室 未指定" | "由星期五 第1-2节 教室 11-321；串至 5月26日 第5-6节 教室 11-321" |
| 日期 | 仅 "第X周 星期Y" | 优先 "M月D日"（根据 Semester.startsAt + week + dayOfWeek 计算），缺失时 fallback |
| 节次 | "1-2节" | "第1-2节"（页面常用正式表述） |
| 教室 fallback | "未指定" | 空字符串（多数业务情况只改时间不改教室，target room 缺失时用 source room 兜底） |
| B5:B9 区域 | 仅 B5 写一行，B6:B9 强制清空 | B5 写真实数据；B6:B9 **保留模板默认占位**（"由   月   日 第   节 教室       ；串至   月   日 第   节 教室"） |
| 调（串）课原因 | 模板标签 + `\n` + reason（强制换行） | 单行 "调（串）课原因：<reason>"（reason 为空时 "未填写"） |
| 签名区 | "签名：  （导出日期：2026-06-11）"（破坏 "年 月 日" 模板） | 保留模板默认 "签名：      年   月   日"（教师手写填日期） |

本阶段只修导出 Excel 的展示格式，不改审批逻辑、不改调课逻辑、不改 DB、不改 schema、不改 RBAC。

## 字段来源原则（K32-A 沿用）

原始调课信息优先使用 `ScheduleAdjustmentRequest` 上的 snapshot / source* / target* 字段；关联表只用于补 name。**禁止**用当前 `ScheduleSlot` 实时状态覆盖历史申请记录，避免 approve/void 后导出的内容与当时申请不一致。

新引入 `semester.startsAt`（`loadRequestForExport` 已在 include 中 select），仅用于日期计算。

## 日期计算策略

`Semester.startsAt` 是 `DateTime?`（schema.prisma 已确认）。当 `startsAt` 非空且 `week` 与 `dayOfWeek` 均为正整数时：

```
date = semester.startsAt + (week - 1) * 7 + (dayOfWeek - 1) days
```

输出 `M月D日` 形式（如 `3月2日`、`5月26日`）。

`startsAt` 缺失或字段为空或 week/dayOfWeek 不合法时，fallback 到 `第X周 星期Y`；`week` 也为 null 时退化为 `星期Y`（不写 "第?周"）。

测试样例（semester.startsAt=2026-03-09）：

| week | dayOfWeek | 输出 |
| --- | --- | --- |
| 1 | 1 | 3月9日 |
| 12 | 2 | 5月26日 |
| 5 | 5 | 4月10日 |

## 节次格式

| slotIndex | 输出 |
| --- | --- |
| 1 | 第1-2节 |
| 2 | 第3-4节 |
| 3 | 第5-6节 |
| 4 | 第7-8节 |
| 5 | 第9-10节 |
| 6 | 第11-12节 |

slotIndex 为 null 时输出 `第?节`。

## 教室 fallback

- `targetRoomId == null` → 使用 source room name（业务语义：多数调课只改时间不改教室）
- `targetRoomId != null` 但 K32-A1 不改 schema 无法单独 select target room.name → 兜底使用 source room name
- source room 也为 null → 输出空字符串（保留 "教室 " 后的空格，便于视觉对齐）

## Cell 映射

| Cell | K32-A 行为 | K32-A1 行为 |
| --- | --- | --- |
| B2 (申请教师) | 写值 | 不变（沿用 K32-A） |
| B3 (学期) | 写值 | 不变 |
| B4 (课程名称) | 写值 | 不变 |
| D2 (所属部门) | 写空 | 不变（schema 未存 User.department） |
| D3 (授课年级专业) | 写值 | 不变 |
| D4 (上课地点) | 写 source room | 不变 |
| **B5** | `原位置 ... → ...` | `由{date 或 第X周 星期Y} 第{slot}节 教室 {room}；串至 {date 或 第X周 星期Y} 第{slot}节 教室 {room}` |
| **B6:B9** | 强制清空 | **保留模板默认占位**（不写任何值） |
| **A10** | `调（串）课原因：\n<reason>` | `调（串）课原因：<reason>`（单行） |
| **C10** | `签名：... （导出日期：2026-06-11）` | **保留模板默认** "签名：      年   月   日" |

## 修改范围

- `src/lib/schedule/adjustment-application-form.ts` — 主要修改
  - 新增 `formatDateFromSemester` / `slotIndexToRange` 导出函数
  - 新增 `buildFormalAdjustmentSituation(req)` — 正式串课情况表述
  - `loadRequestForExport` 增加 select `semester.startsAt` / `semester.endsAt`
  - `resolveTargetRoomName` 改为 fallback 到 source room
  - `buildAdjustmentApplicationFormWorkbook` 中：
    - B5 用 `buildFormalAdjustmentSituation` 写入
    - B6:B9 保留模板原值（不再 writeCell 空字符串）
    - A10 单行 "调（串）课原因：<reason>"
    - C10 保留模板默认（不再追加 ISO 日期）
- `scripts/verify-adjustment-application-form-export-k32-a.ts` — stage-aware 更新
  - `knownLimitations` 更新（不再说 "未指定"）
  - 添加 K32-A1 衔接说明
- `scripts/verify-adjustment-application-form-layout-k32-a1.ts` — 新增（34 项检查）
- `docs/k32-adjustment-application-form-layout-fix.md` — 本文档
- `docs/k32-adjustment-application-form-layout-fix.json` — 机读报告

**未修改**：
- schema / migration / prisma/dev.db
- RBAC 权限矩阵
- 调课申请审批业务逻辑
- ScheduleAdjustmentRequest 写入逻辑
- ScheduleAdjustment 写入逻辑
- ScheduleSlot 写入逻辑
- solver / score / scheduler
- K22 expected

## 验证

### 必跑

```bash
npx tsx scripts/verify-adjustment-application-form-layout-k32-a1.ts   # 34/34 PASS
npx tsx scripts/verify-adjustment-application-form-export-k32-a.ts   # 49/49 PASS (回归)
npx tsx scripts/verify-user-adjustment-approval-flow-closeout-k28.ts # 41/41 PASS
npx tsx scripts/verify-adjustment-request-pages-protected-shell-k31-c.ts # 26/26 PASS
npx prisma validate                                                    # PASS
npx prisma migrate status                                              # 9 migrations, up to date
npm run build                                                          # PASS
npm run lint                                                           # 188/152 (= baseline)
npm run test:auth-foundation                                            # 60/2 (= baseline，pre-existing)
```

### 建议补跑

```bash
npx tsx scripts/verify-schedule-export-current-filter-k31-a.ts   # 24/24 PASS
npx tsx scripts/verify-score-regression-harness-k22-c.ts          # 73/73 PASS
```

## 集成样例（gitignored，scripts/k32-a-sample/）

`scripts/verify-adjustment-application-form-layout-k32-a1.ts` 集成检查生成 `sample-2.xlsx`（targetId=2 status=APPROVED），**不**入库。

样例关键 cell 读回：
- **B5**: "由星期五 第1-2节 教室 11-223；串至 5月26日 第5-6节 教室 11-223"
  - target 5月26日 = 2026-03-09 + (12-1)\*7 + (2-1) = 2026-05-26 ✓
  - source `sourceWeek=null`，按 fallback 退化为 "星期五"（不写 "第?周"）
- **B6/B7/B8/B9**: 保留模板默认 "由   月   日 第   节 教室       ；串至   月   日 第   节 教室"
- **A10**: "调（串）课原因：未填写"（单行）
- **C10**: "签名：            年   月   日"（保留模板默认）

## 人工浏览器验证

- USER 登录 → `/my-adjustment-requests` → 选一条记录 → "导出串课申请表" → 打开 xlsx
  - B5 是 "由...；串至..." 正式格式
  - B6:B9 是模板默认占位
  - A10 调课原因单行
  - C10 签名保留 "年 月 日"
  - 模板边框/合并/字体未变
- ADMIN 登录 → `/admin/adjustment-requests` → 同上
- 越权 403：USER 不能导别人，USER 不能命中 ADMIN route

## 已知局限

1. **所属部门字段**：当前 K28 schema（`User` 无 `department` 字段）未存该字段，模板原样保留为空白。
2. **target room name**：schema 不允许在不改表的前提下通过 `targetRoomId` 单独 `include` 出 target room 的 name，K32-A1 用 source room 兜底（业务语义上"只改时间不改教室"是大多数情况）。
3. **sourceWeek 字段**：K28 服务层始终将 `sourceWeek` 写为 null（见 `adjustment-request-service.ts:133`），因此源位置 fallback 到 "星期Y"（不写 "第?周"）。若需要完整源周次，需要回到 K28 阶段修改 service 层，**不在 K32-A1 范围**。

## 推荐下一阶段

- real-use / K32-A2 source week resolution fix（已完成 → 见 `docs/k32-adjustment-application-form-source-week-fix.md`）
- 视情况 K32-B（如需补"所属部门"字段可加 `User.department` + migration）

## 关闭判断

**K32-A1 CAN CLOSE**

**K32-A 升级到 READY_FOR_REAL_USE：等人工浏览器 E2E 完成**

- ✅ 34/34 K32-A1 verify PASS
- ✅ 49/49 K32-A 回归 PASS
- ✅ 41/41 K28 closeout PASS
- ✅ 26/26 K31-C PASS
- ✅ Prisma validate + migrate status PASS
- ✅ build / lint 188/152 baseline / auth foundation baseline
- ✅ 24/24 K31-A + 73/73 K22-C PASS
- ✅ 无 schema/migration/DB/RBAC/K22 expected 变更
- ✅ 集成样例 gitignored，不入库
- ✅ 已 `git push origin master`（见完成报告）
