# K32-A: 调课申请表 Excel 导出

## 概述

K32-A 在 K28 / K31-C 已就绪的 USER 调课申请 → ADMIN 审批闭环之上，新增"导出串课申请表 Excel"能力：

- USER 在 `/my-adjustment-requests`、ADMIN 在 `/admin/adjustment-requests` 的每条记录操作区点"导出串课申请表"，即可下载一份按 `templates/串课申请表模板.xlsx` 模板格式、按申请数据填充的 xlsx。
- 导出 API 严格只读：仅 `findUnique` 读 `ScheduleAdjustmentRequest` + 关联，不调用任何 `prisma.*.create/update/delete/upsert/deleteMany/updateMany/$transaction`，不调用 `dryRunScheduleAdjustment`，不改 `ScheduleSlot` / `ScheduleAdjustment` / 申请状态。
- USER route 鉴权：`requirePermission('adjustment-request:read')` + `submittedByUserId === user.id` 所有权检查（否则 403 NOT_OWNER）。
- ADMIN route 鉴权：`requirePermission('adjustment-request:review')`（与 `/api/admin/schedule-adjustment-requests` 完全一致），无 ownership 限制。
- 模板 commit 至 `templates/串课申请表模板.xlsx`，运行时相对路径解析，**禁止**使用 `D:\Desktop\Course Development System` 绝对路径。

## 模板

| 项 | 值 |
| --- | --- |
| 源模板 | `D:\Desktop\Course Development System\串课申请表模板.xlsx`（用户桌面） |
| 提交后位置 | `templates/串课申请表模板.xlsx`（commit 进 repo） |
| sheet 名 | `串课申请表` |
| 范围 | A1:D13 |
| 合并单元格 | 10 个：`A1:D1`（标题）、`A5:A9`（串课情况 label 5 行）、`B5:D5`~`B9:D9`（5 个 value 单元格）、`A10:B10`（原因 label）、`C10:D10`（签名） |
| 样式保留 | 通过 `ExcelJS.xlsx.readFile` + 仅修改指定 cell `.value`，不动 `font/border/fill/alignment/rowHeight/columnWidth/merges`。验证脚本抽检 A1 的 `font` 未变（`{"bold":true,"size":22,"name":"宋体","charset":134}`） |

## 字段映射

| 字段 | 数据来源 | 写入 cell | 写入策略 | Fallback |
| --- | --- | --- | --- | --- |
| 申请教师 | `request.submittedByNameSnapshot` → `request.submittedBy.displayName` → `request.teachingTask.teacher.name` | B2 | 直接写 value | "未知教师" |
| 所属部门 | 当前 K28 schema 未存该字段（User 无 department） | D2 | 写空字符串 | "" |
| 学期 | `request.semester.name` | B3 | 直接写 | "" |
| 授课年级专业 | `request.teachingTask.taskClasses[].classGroup.name` join("、") | D3 | 直接写 | "" |
| 课程名称 | `request.teachingTask.course.name` | B4 | 直接写 | "" |
| 上课地点 | `request.sourceRoomId` → `sourceScheduleSlot.room.name` | D4 | 直接写 | "未知教室" |
| 串课情况 | `第{sourceWeek ?? '原位置'}周 星期{sourceDayOfWeek} 第{sourceSlotIndex}节 教室 {sourceRoom} → 第{targetWeek}周 星期{targetDayOfWeek} 第{targetSlotIndex}节 教室 {targetRoom}` | B5（master of `B5:D5` merge） | 写 value；B6~B9 master 清空默认占位文本 | "" |
| 调（串）课原因 | `request.reason` | A10（master of `A10:B10` merge） | 保留原 label `调（串）课原因：` + 换行 + reason，wrap-text | "未填写" |
| 签名日期 | `request.createdAt.toISOString().slice(0,10)` | C10（master of `C10:D10` merge） | 保留原签名模板文本，追加 `（导出日期：YYYY-MM-DD）` | 当前日期 |
| 审批信息 | 不破坏表格，保留模板原意见区空白 | — | — | — |

**K32-A 字段来源原则**：原始调课信息优先使用 `ScheduleAdjustmentRequest` 上的 snapshot 字段（`sourceWeek` / `sourceDayOfWeek` / `sourceSlotIndex` / `sourceRoomId` / `targetWeek` / `targetDayOfWeek` / `targetSlotIndex` / `targetRoomId` / `submittedByNameSnapshot` / `reviewedByNameSnapshot`）。关联表只用于补 name（`room.name` / `course.name` / `classGroup.name`）。**禁止**用当前 `ScheduleSlot` 实时状态覆盖历史申请记录，避免 approve/void 后导出的内容与当时申请不一致。

**不计算具体日期**：`Semester.startsAt` 可能为 null，因此使用周次（`第X周 星期Y`）表述而非月/日。

## API 设计

### USER route

```
GET /api/schedule-adjustment-requests/[id]/export-form
```

- 鉴权：`requirePermission('adjustment-request:read', request)`（与 `/api/schedule-adjustment-requests/mine` 一致）。
- 所有权：`request.submittedByUserId !== user.id` → 403 `{ error: 'NOT_OWNER' }`。
- 模板缺失 → 500 `{ error: 'TEMPLATE_NOT_FOUND' }`。
- 响应：
  - `Content-Type: application/vnd.openxmlformats-officedocument.spreadsheetml.sheet`
  - `Content-Disposition: attachment; filename*=UTF-8''<safe>.xlsx`
  - body: xlsx buffer

### ADMIN route

```
GET /api/admin/schedule-adjustment-requests/[id]/export-form
```

- 鉴权：`requirePermission('adjustment-request:review', request)`（与 `/api/admin/schedule-adjustment-requests` 一致）。
- 无 ownership 限制。
- 响应同 USER。

## UI 入口

### USER 页面 (`/my-adjustment-requests`)

每行"操作"列：

- **所有状态**都有"导出串课申请表"按钮。
- PENDING 行额外显示"取消"按钮（与 K28 既有行为一致）。
- 点击后：fetch → `response.blob()` → `URL.createObjectURL` → 临时 `<a download>` → 触发下载 → `URL.revokeObjectURL`。
- 失败 toast 显示 `getAdjustmentRequestErrorMessage(code)`。

### ADMIN 页面 (`/admin/adjustment-requests`)

每行"操作"列：

- PENDING 行：先显示"通过 / 拒绝"，下方再显示"导出串课申请表"。
- 非 PENDING 行：仅显示"导出串课申请表"。
- 点击后走 `isAdmin: true` 选项命中 ADMIN route。

## 关键文件

新增：

- `templates/串课申请表模板.xlsx`（commit）
- `src/lib/schedule/adjustment-application-form.ts`（**纯只读工具函数**，被 verify 脚本显式扫描禁止 write）
- `src/app/api/schedule-adjustment-requests/[id]/export-form/route.ts`（USER route）
- `src/app/api/admin/schedule-adjustment-requests/[id]/export-form/route.ts`（ADMIN route）
- `scripts/verify-adjustment-application-form-export-k32-a.ts`（49 checks）
- `docs/k32-adjustment-application-form-export.md`（本文档）
- `docs/k32-adjustment-application-form-export.json`（机读报告）

修改：

- `src/lib/schedule/adjustment-request-client.ts`：新增 `exportAdjustmentRequestForm(requestId, options?)` + `triggerBlobDownload(blob, filename)`。
- `src/app/my-adjustment-requests/my-adjustment-requests-content.tsx`：新增 `handleExport` + "导出串课申请表" 按钮。
- `src/app/admin/adjustment-requests/admin-adjustment-requests-content.tsx`：同上 + `isAdmin: true`。
- `.gitignore`：新增 `scripts/k32-a-sample/`（集成测试生成的样例，不入库）。

## 安全保证

- USER 越权：USER route 静态含 `submittedByUserId !== user.id` → 403 NOT_OWNER（验证脚本 check 8）。
- USER 调用 ADMIN route：ADMIN route 用 `requirePermission('adjustment-request:review')`，普通 USER 没有该权限 → 403 FORBIDDEN。
- 导出**不**写 DB：util 函数文件扫描 `prisma.*.create/update/delete/upsert/deleteMany/updateMany/$transaction` → 0 命中（验证脚本 check 4）。
- 导出**不**改申请状态：util 唯一 Prisma 调用是 `findUnique`，无 update。
- 导出**不**改课表：util 不触碰 `ScheduleSlot` / `ScheduleAdjustment`。
- 集成测试覆盖：导出前后 `ScheduleAdjustmentRequest` / `ScheduleSlot` / `ScheduleAdjustment` count + 关键字段 hash 完全一致（验证脚本 check 45-47）。

## 验证

### 必跑（K32-A）

```bash
npx tsx scripts/verify-adjustment-application-form-export-k32-a.ts
# 49/49 PASS
```

### 不回归

```bash
npx tsx scripts/verify-user-adjustment-approval-flow-closeout-k28.ts
# 41/41 PASS
npx tsx scripts/verify-adjustment-request-pages-protected-shell-k31-c.ts
# 26/26 PASS
npx prisma validate                                # PASS
npx prisma migrate status                          # 9 migrations, up to date
npm run build                                       # PASS（含新 route）
npm run lint                                        # 188/152 (= baseline，不新增)
npm run test:auth-foundation                        # 60/2 (= baseline，失败仅 pre-existing)
npx tsx scripts/verify-schedule-export-current-filter-k31-a.ts  # 24/24 PASS
npx tsx scripts/verify-score-regression-harness-k22-c.ts         # 73/73 PASS
```

## 人工浏览器验证

- USER 登录 → `/my-adjustment-requests` → 点"导出串课申请表" → 下载 xlsx → 打开确认模板格式 + 字段正确。
- USER 越权（动态）：在 USER 会话下用浏览器 devtools 命中 `/api/admin/schedule-adjustment-requests/<别人的id>/export-form` → 应得 403。
- USER 越权（动态）：在 USER 会话下命中 `/api/schedule-adjustment-requests/<别人的id>/export-form` → 应得 403。
- ADMIN 登录 → `/admin/adjustment-requests` → 同上 → 可导出所有状态。
- 确认导出后：`ScheduleAdjustmentRequest` 状态、`ScheduleSlot` 数据、`ScheduleAdjustment` 记录全部不变（集成测试已覆盖）。

## 已知局限

1. **所属部门字段**：当前 K28 schema（`User` 无 `department` 字段）未存该字段，模板原样保留为空白。
2. **target room name**：schema 不允许在不改表的前提下通过 `targetRoomId` 单独 `include` 出 target room 的 name，fallback 为 "未指定"。
3. **USER 越权动态 403**：当前 verify 仅做静态扫描（`submittedByUserId !== user.id`）。service 层路径已被 K28-B 浏览器 E2E 覆盖（见 `k28-b-manual-trial-result.json`），本阶段不需要重复一次 E2E。
4. **集成测试样例位置**：`scripts/k32-a-sample/sample-<id>.xlsx` 写入 gitignored 目录，**不**入库。

## 推荐下一阶段

- 真实使用 / K32-B 视情况：如要补"所属部门"字段可加 `User.department` + migration。

## 关闭判断

**K32-A CAN CLOSE**

- ✅ 49/49 verify PASS
- ✅ K28 / K31-C / K22-C / K31-A 不回归
- ✅ build / lint 188/152 baseline / prisma / auth foundation 全部通过
- ✅ 无 schema/migration/DB/RBAC/K22 expected 变更
- ✅ 模板 commit，导出样例 gitignored
- ✅ 已 `git push origin master`（见完成报告）
