# K11-SCHEDULE-MUTATION-SERVER-GUARD-FIX-A

## 1. 阶段名

`K11-SCHEDULE-MUTATION-SERVER-GUARD-FIX-A`

## 2. 日期

2026-06-01

## 3. 当前背景

K11 audit 发现 3 HIGH / 5 MEDIUM / 3 LOW。核心问题：

- `PUT /api/schedule-slot/[id]` 无 conflict check，无 semester guard
- `POST /api/schedule-slot` 无 conflict check，无 semesterId 写入
- `/api/admin/[model]` scheduleslot PUT/POST 无 conflict check
- 无任何 mutation route 调用 `checkScheduleConflict`

## 4. 修复内容

### 新增共享 guard 模块

`src/lib/schedule/slot-mutation-guard.ts`：

- `guardSlotUpdate()` — PUT 专用：same-semester 验证 + 冲突检查（教室/教师/班级 + 周次重叠）
- `guardSlotCreate()` — POST 专用：semesterId 解析 + 冲突检查
- `guardAdminSlotUpdate()` — admin PUT 专用：复用 admin 已有数据做冲突检查
- `guardAdminSlotCreate()` — admin POST 专用

### 修改 PUT /api/schedule-slot/[id]

- 增加 `guardSlotUpdate()` 调用（update 前）
- guard 内部：加载 slot → 验证 semester → 调用冲突检查 → 返回结果
- 冲突时返回 409 + conflicts 详情

### 修改 POST /api/schedule-slot

- 增加 `guardSlotCreate()` 调用（create 前）
- guard 返回 semesterId，写入新 slot
- 去除冗余的 `teachingTask.findUnique` 验证（guard 内部已做）

### 修改 /api/admin/[model] route

- POST handler：scheduleslot create 前调用 `guardAdminSlotCreate()`
- PUT handler：scheduleslot update 前调用 `guardAdminSlotUpdate()`
- guard 失败时返回 409

### 更新 audit 脚本

- 识别 guard module 调用为有效 conflict check
- HIGH-1 severity 动态化（基于实际检测结果）
- HIGH-3 计入 guard module 调用者

## 5. 风险变化

| 风险 | Fix-A 前 | Fix-A 后 |
|------|---------|---------|
| K11-MUTATION-HIGH-1 | HIGH | NONE |
| K11-MUTATION-HIGH-2 | HIGH | NONE |
| K11-MUTATION-HIGH-3 | HIGH | NONE |
| K11-MUTATION-MEDIUM-1 | MEDIUM | NONE |
| K11-MUTATION-MEDIUM-2 | MEDIUM | MEDIUM (Fix-B) |
| K11-MUTATION-MEDIUM-3 | MEDIUM | MEDIUM (Fix-B) |
| K11-MUTATION-MEDIUM-4 | MEDIUM | MEDIUM (Fix-B) |
| K11-MUTATION-MEDIUM-5 | MEDIUM | NONE |
| K11-MUTATION-LOW-1 | LOW | LOW |
| K11-MUTATION-LOW-2 | LOW | LOW |
| K11-MUTATION-LOW-3 | LOW | LOW |

## 6. 验证结果

- `verify-schedule-mutation-server-guard-fix-a.ts`：27/27 PASS
- `audit-schedule-mutation-server-guards.ts`：0 HIGH, 3 MEDIUM, 3 LOW
- `npm.cmd run build`：通过

## 7. 遗留到 Fix-B

- MEDIUM-2：Admin DELETE 无 ScheduleAdjustment 引用检查
- MEDIUM-3：Teaching task PUT updateMany 无 conflict check
- MEDIUM-4：Client moveSlot 无 preflight
- LOW-1/2/3：平行实现、adjustment 一致性、RBAC
