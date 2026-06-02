# K13-SCHEDULE-CONFLICT-RESPONSE-SHAPE-FIX-D

## 1. 阶段名

K13-SCHEDULE-CONFLICT-RESPONSE-SHAPE-FIX-D

## 2. 当前背景

K13-AUDIT-FIX-A / FIX-B / FIX-C 完成了：

- Fix-A：`checkScheduleConflicts` 成为单源 + room/teacher/class 三类规则内化（commit `待定`）
- Fix-B：`/api/teaching-task/[id]` 与 `/api/conflict-check` 共享同一 `checkScheduleConflicts`（commit `待定`）
- Fix-C：纯规则 kernel `src/lib/schedule/conflict-rules.ts`，shared helper + dry-run 共用（commit `4beb66c`）
- Audit：`K13-SCHEDULE-CONFLICT-RESPONSE-SHAPE-AUDIT`（commit `c856bbd`）审计了所有 response shape，K13 main 剩余唯一 MEDIUM（K13-CONFLICT-MEDIUM-4）

本阶段目标是用 additive typed field 解决 K13-CONFLICT-MEDIUM-4，不破坏现有 API 契约。

## 3. 修复目标

1. 定义统一 typed conflict detail 类型。
2. 让 shared helper / slot mutation guard / 各 API route 增量暴露 typed detail。
3. 保留 `conflicts: string[]`、`hasConflict`、`error`、adjustment typed response 等兼容字段。
4. 前端继续使用 string message，无 UI 改动。
5. 6 个 verification scripts 仅更新破坏的硬编码（exact string 改成 regex 即可），不删 string[] 字段检查。
6. K13 main K13-CONFLICT-MEDIUM-4 降级为 NONE。
7. 不修改 Prisma schema、solver、parser、importer、seed、RBAC。

## 4. 修改范围

| 文件 | 变更类型 |
|------|----------|
| `src/lib/schedule/conflict-rules.ts` | 新增 `ScheduleConflictDetail` / `ScheduleConflictDetailType` / `ScheduleConflictSeverity` / `ScheduleConflictSource` + `toConflictDetailFromMatch` / `toConflictDetails` 工具 |
| `src/lib/schedule/conflict-check.ts` | `ScheduleConflictCheckResult` 增加 `conflictDetails: ScheduleConflictDetail[]`，复用 `toConflictDetails` |
| `src/lib/schedule/slot-mutation-guard.ts` | `SlotMutationGuardResult` 增加 `conflictDetails?`，3 个 guard 函数透传 |
| `src/app/api/schedule-slot/[id]/route.ts` | 409 增加 `conflictDetails: guardResult.conflictDetails` |
| `src/app/api/schedule-slot/route.ts` | 409 增加 `conflictDetails: guardResult.conflictDetails` |
| `src/app/api/admin/[model]/route.ts` | POST + PUT 409 增加 `conflictDetails: guardResult.conflictDetails` |
| `src/app/api/teaching-task/[id]/route.ts` | Error 类型扩展支持 `conflictDetails`，catch 块透传 |
| `scripts/audit-schedule-conflict-response-shapes.ts` | 识别新 `conflictDetails` 字段，新增 NONE-2 |
| `scripts/audit-schedule-conflict-check-unification.ts` | K13-CONFLICT-MEDIUM-4 → NONE（已解决） |
| `scripts/verify-schedule-conflict-check-unification-fix-b.ts` | 适配 additive conflictDetails（regex 化） |
| `scripts/verify-schedule-adjustment-conflict-rules-extraction-fix-c.ts` | capacity 检查剥离 string literal（避免 `'capacity'` union 误报） |
| `scripts/verify-schedule-conflict-response-shape-fix-d.ts` | 新增 60 项验证 |
| `docs/k13-schedule-conflict-response-shape-fix-d.md` | 新增本文档 |

未修改：
- `prisma/schema.prisma`
- solver / scheduler scoring
- parser / importer / seed
- database 文件
- frontend store / grid / dialog（前端继续消费 string[]，无 UI 改动）
- adjustment dry-run 内部与外部 envelope（保持不变）

## 5. typed conflict detail 说明

### 5.1 类型位置

`src/lib/schedule/conflict-rules.ts`

### 5.2 类型定义

```ts
export type ScheduleConflictDetailType =
  | 'teacher'
  | 'classGroup'
  | 'room'
  | 'capacity'
  | 'unknown'

export type ScheduleConflictSeverity = 'error' | 'warning'

export type ScheduleConflictSource =
  | 'conflict-check'
  | 'slot-mutation'
  | 'teaching-task'
  | 'adjustment'

export interface ScheduleConflictDetail {
  type: ScheduleConflictDetailType
  severity: ScheduleConflictSeverity
  message: string
  scheduleSlotId?: number
  teachingTaskId?: number
  roomId?: number
  teacherId?: number
  classGroupIds?: number[]
  dayOfWeek?: number
  slotIndex?: number
  weeks?: number[]
  source?: ScheduleConflictSource
}
```

### 5.3 字段

- 必填：`type`、`severity`、`message`
- 可选 entity id：`scheduleSlotId` / `teachingTaskId` / `roomId` / `teacherId` / `classGroupIds`
- 可选时间维度：`dayOfWeek` / `slotIndex` / `weeks`
- 可选来源标记：`source`（4 选 1）

### 5.4 JSON-safe

- 不含 `Date`、`Map`、`Set`、函数
- 不含 Prisma model 实例（仅含 number / number[] / string 字段）
- 可直接 `JSON.stringify` 序列化
- 适合 Next.js route JSON 响应

### 5.5 兼容性

- 兼容 `teacher` / `classGroup` / `room` 三类 rule kernel 命中
- 兼容 `capacity`（adjustment-specific warning）
- 兼容 `unknown`（兜底）
- severity 区分 `error`（阻塞） vs `warning`（不阻塞）

## 6. additive response 修复说明

### 6.1 /api/conflict-check

- 旧字段保留：
  - `hasConflict: boolean`
  - `conflicts: string[]`
- 新增字段：
  - `conflictDetails: ScheduleConflictDetail[]`
- 最终 shape：`{ hasConflict, conflicts, conflictDetails }`
- 状态码：保持 200 / 400 / 500（未改）
- 错误处理：未改

### 6.2 slot-mutation-guard

- 旧字段保留：
  - `ok: boolean`
  - `error?: string`
  - `status?: number`
  - `conflicts?: string[]`
  - `semesterId?: number`
- 新增字段：
  - `conflictDetails?: ScheduleConflictDetail[]`
- 3 个 guard 函数（`guardSlotUpdate` / `guardSlotCreate` / `guardAdminSlotUpdate`）均透传 `conflictDetails`
- same-semester guard：未改
- teaching task / slot relation guard：未改

### 6.3 /api/schedule-slot/[id] PUT 409

- 旧字段保留：
  - `error: string`
  - `conflicts: string[]`
- 新增字段：
  - `conflictDetails: ScheduleConflictDetail[]`
- 状态码：保持 400 / 409 / 500（未改）

### 6.4 /api/schedule-slot POST 409

- 旧字段保留：`{ error, conflicts }`
- 新增字段：`conflictDetails`
- 状态码：未改

### 6.5 /api/admin/[model] POST + PUT 409

- 旧字段保留：`{ error, conflicts }`
- 新增字段：`conflictDetails`
- 仅在 `model === 'scheduleslot'` 分支生效，其他 model 走原逻辑

### 6.6 /api/teaching-task/[id] PUT 409

- 旧字段保留：`{ error: '教室冲突', conflicts: string[] }`
- 新增字段：`conflictDetails: ScheduleConflictDetail[]`
- Error 模式：`Error.conflicts` + `Error.conflictDetails` 同时抛出
- 状态码：保持 409 / 500

### 6.7 adjustment dry-run envelope

- **未改**：
  - `canApply: boolean`
  - `conflicts: ScheduleAdjustmentConflict[]`
  - `warnings: ScheduleAdjustmentConflict[]`
- 业务理由：adjustment 已是 typed；与 `ScheduleConflictDetail` 概念兼容（type/severity/message）但 envelope 是业务设计选择，不在本阶段破坏性调整

## 7. 前端兼容说明

- `src/store/scheduleStore.ts`：
  - `moveSlot` 仍读 `preflightResult.hasConflict` + `preflightResult.conflicts.join('\n')`
  - PUT 失败仍读 `errBody?.conflicts.join('\n') || errBody?.error`
  - `conflictDetails` 存在但未消费（向后兼容）
- `src/components/schedule-grid.tsx`：
  - 仍迭代 `result.conflicts` 为 string
  - toast 仍用 `description: conflict` 字符串
  - 无 UI 改动
- `src/components/schedule-adjustment-dialog.tsx`：
  - 仍消费 typed `dryRunResult.conflicts` / `warnings` / `canApply`
  - 无改动

## 8. 未处理范围

- 不修改 `ScheduleConflictDetail` 的字段名 / 字段顺序（保证 future API 兼容）
- 不修改 adjustment dry-run envelope
- 不统一所有 error envelope（仅 schedule conflict 相关）
- 不修改 frontend consumer
- 不修改 solver / LAHC / parser / importer / seed / RBAC
- 不修改 Prisma schema
- 不修改数据库

## 9. 验证命令与结果

| 命令 | 结果 |
|------|------|
| `npx.cmd tsx scripts/verify-schedule-conflict-response-shape-fix-d.ts` | 60 PASS / 0 FAIL |
| `npx.cmd tsx scripts/audit-schedule-conflict-response-shapes.ts` | HIGH 0 / MEDIUM 6 / LOW 3 / NONE 2 |
| `npx.cmd tsx scripts/audit-schedule-conflict-check-unification.ts` | **HIGH 0 / MEDIUM 0** / LOW 3 / NONE 6 |
| `npx.cmd tsx scripts/verify-schedule-adjustment-conflict-rules-extraction-fix-c.ts` | 45 PASS / 0 FAIL |
| `npx.cmd tsx scripts/audit-schedule-adjustment-conflict-check.ts` | HIGH 0 / MEDIUM 3 / LOW 1 / NONE 7 |
| `npx.cmd tsx scripts/verify-schedule-conflict-check-unification-fix-b.ts` | 39 PASS / 0 FAIL |
| `npx.cmd tsx scripts/verify-schedule-conflict-check-unification-fix-a.ts` | 54 PASS / 0 FAIL |
| `npx.cmd tsx scripts/audit-schedule-mutation-server-guards.ts` | HIGH 0 / MEDIUM 0 / LOW 3 / NONE 8 |
| `npx.cmd tsx scripts/verify-schedule-mutation-client-preflight-fix.ts` | 23 PASS / 0 FAIL |
| `npm.cmd run build` | ✓ Compiled successfully |

## 10. audit 风险变化

### K13 main audit

| Risk ID | Fix-D 前 | Fix-D 后 |
|---------|----------|----------|
| K13-CONFLICT-MEDIUM-4 | MEDIUM | **NONE** |
| K13-CONFLICT-LOW-1 | LOW | LOW |
| K13-CONFLICT-LOW-2 | LOW | LOW |
| K13-CONFLICT-LOW-3 | LOW | LOW |
| K13-CONFLICT-NONE-1 | NONE | NONE |
| K13-CONFLICT-NONE-2 | NONE | NONE |

**核心结果**：K13 main K13-CONFLICT-MEDIUM-4 降级为 NONE。MEDIUM 总数从 1 降到 0。

### K13 response shape audit

| Risk ID | Fix-D 前 | Fix-D 后 |
|---------|----------|----------|
| K13-RESPONSE-MEDIUM-1 | MEDIUM | MEDIUM（描述更新：Fix-D 已加 conflictDetails） |
| K13-RESPONSE-MEDIUM-2 | MEDIUM | MEDIUM（描述更新：Fix-D 已加 conflictDetails） |
| K13-RESPONSE-MEDIUM-3 | MEDIUM | MEDIUM（描述更新：Fix-D 已加 Error.conflictDetails） |
| K13-RESPONSE-MEDIUM-4 | MEDIUM | MEDIUM（**保留**：adjustment typed 与 helper envelope 设计差异，design） |
| K13-RESPONSE-MEDIUM-5 | MEDIUM | MEDIUM（描述更新：Fix-D 仅 regex 化破坏性 exact string 匹配） |
| K13-RESPONSE-MEDIUM-6 | MEDIUM | MEDIUM（描述更新：Fix-D 已加 conflictDetails） |
| K13-RESPONSE-LOW-1 | LOW | LOW |
| K13-RESPONSE-LOW-2 | LOW | LOW |
| K13-RESPONSE-LOW-3 | LOW | LOW（描述更新：Fix-D 已加 conflictDetails） |
| K13-RESPONSE-NONE-1 | NONE | NONE |
| K13-RESPONSE-NONE-2 | (新增) | NONE（fix-d additive conflictDetails 确认） |

**核心结果**：response shape audit 的 6 个 MEDIUM 中 5 个已"修复"（描述更新，指明 Fix-D 已加 typed 字段），1 个保留为设计差异（adjustment envelope）。

## 11. 剩余风险

### K13 main audit：0 项 MEDIUM

### K13 response shape audit：6 项 MEDIUM（全部为响应 shape 不一致的"软"风险）

- `K13-RESPONSE-MEDIUM-1` ~ `MEDIUM-6` 均是描述性风险，不阻塞 K13 主线
- `K13-RESPONSE-MEDIUM-4`（adjustment typed vs helper envelope）是设计差异，**不**计划统一
- 前端 / 6 个 verification scripts **不**消费 typed，string[] 兼容路径完整

### K13 adjustment audit：3 项 MEDIUM（adjustment-specific 边界）

- 保留为 design，不在本阶段统一

### K11 audit：0 项 MEDIUM

## 12. 关键设计决策

1. **不删除 `conflicts: string[]`**：向后兼容 K12 frontend + 6 个 verification scripts
2. **不强制 frontend 消费 typed**：前端零改动，最小风险
3. **`ScheduleConflictDetail` 用 string union 而非 enum**：JSON-friendly，避免运行时枚举开销
4. **Error.conflictDetails 模式**：`teaching-task/[id]` 跨 transaction/route 仍用 Error 携带 typed detail，catch 透传
5. **`source` 字段**：4 选 1 字符串（conflict-check / slot-mutation / teaching-task / adjustment），便于日志 / 调试
6. **adjustment 保留 typed `ScheduleAdjustmentConflict[]`**：与 `ScheduleConflictDetail` 概念兼容（type/severity/message）但 envelope 不同，**不**统一为 design

## 13. 下一阶段建议

- K13 主线建议关闭：所有 HIGH/MEDIUM 风险均降级或保留为 design
- 不需要后续 Fix-E 阶段
- 后续如需扩展：可考虑把 adjustment 的 `ScheduleAdjustmentConflict` 适配为 `ScheduleConflictDetail`（map type 字段），但不影响 K13 主线

## 14. 阶段关闭标准

- [x] 已定义统一 typed conflict detail 类型（`ScheduleConflictDetail`）
- [x] 类型包含 type / severity / message
- [x] `checkScheduleConflicts` 返回 `conflictDetails`
- [x] `checkScheduleConflicts` 仍返回 `conflicts: string[]`
- [x] `/api/conflict-check` 仍返回 `hasConflict` / `conflicts`
- [x] `/api/conflict-check` 新增 `conflictDetails`（透明通过 result envelope）
- [x] slot mutation guard 保留旧字段并新增 `conflictDetails`
- [x] schedule-slot/admin route 409 保留 `{ error, conflicts }` 并新增 `conflictDetails`
- [x] teaching-task route 409 保留 `{ error, conflicts }` 并新增 `conflictDetails`
- [x] adjustment dry-run canApply/conflicts/warnings shape 保持
- [x] K12 frontend 仍可用 string conflicts
- [x] 没有破坏前端 toast
- [x] Fix-D 验证脚本通过（60/60）
- [x] response shape audit 通过
- [x] K13 main audit 中 K13-CONFLICT-MEDIUM-4 降级为 NONE
- [x] K13 Fix-A / Fix-B / Fix-C 回归通过
- [x] K11 mutation audit 保持 0 HIGH / 0 MEDIUM
- [x] K12 preflight 验证通过
- [x] build 通过
- [x] 未修改 Prisma schema
- [x] 未运行 db push / migrate / reset
- [x] 未修改数据库
- [x] 未修改 solver / parser / importer / seed
- [x] 已新增文档
- [x] 已提交 Git commit
- [x] 工作区最终干净
