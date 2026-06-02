# K13-SCHEDULE-CONFLICT-RESPONSE-SHAPE-AUDIT

## 1. 阶段名

K13-SCHEDULE-CONFLICT-RESPONSE-SHAPE-AUDIT

## 2. 审计日期

2026-06-02

## 3. 当前背景

K13 audit 收尾阶段（Fix-C 完成后），K13 main audit 仍存在一项 MEDIUM：

> conflict response shape 不统一

K13-FIX-C（commit `4beb66c`）建立了纯规则 kernel `src/lib/schedule/conflict-rules.ts`，shared helper 与 adjustment dry-run 已共享规则文本。但 response shape 仍存在多套实现，影响面较大，需先做专项审计，再决定 Fix-D 边界。

本阶段只审计，不修复。

## 4. 审计范围

| 范围 | 文件 | 备注 |
|------|------|------|
| conflict-check API | `src/app/api/conflict-check/route.ts` | 对外契约 |
| shared helper | `src/lib/schedule/conflict-check.ts` | response envelope 拥有者 |
| slot mutation guard | `src/lib/schedule/slot-mutation-guard.ts` | internal result shape |
| slot routes | `src/app/api/schedule-slot/[id]/route.ts`、`src/app/api/schedule-slot/route.ts` | guard → 409 转换 |
| admin model route | `src/app/api/admin/[model]/route.ts` | guard → 409 转换 |
| teaching-task route | `src/app/api/teaching-task/[id]/route.ts` | Error.conflicts 模式 |
| adjustment dry-run | `src/lib/schedule/adjustments.ts` | typed response |
| adjustment types | `src/types/schedule-adjustment.ts` | typed conflict 定义 |
| adjustment API | `src/app/api/schedule-adjustments/route.ts`、`src/app/api/schedule-adjustments/dry-run/route.ts` | envelope |
| frontend store | `src/store/scheduleStore.ts` | moveSlot preflight + PUT 错误 |
| frontend grid | `src/components/schedule-grid.tsx` | toast 消费 |
| frontend dialog | `src/components/schedule-adjustment-dialog.tsx` | typed conflict 展示 |
| verification scripts | Fix-A/B/C、K12、main audit、adjustment audit | 硬编码 shape |

未覆盖：scheduler / LAHC / capacity diagnostics / importer / parser / seed / RBAC / semester selector。

## 5. 审计方法

1. 静态源码 grep：搜索 `conflicts`、`hasConflict`、`ScheduleAdjustmentConflict`、`type:`/`severity`/`409`/`toast`/`SlotMutationGuardResult`/`ConflictResult`/`conflict response`
2. 逐文件阅读 lib + routes + components + types + store
3. 审计脚本 `scripts/audit-schedule-conflict-response-shapes.ts` 自动扫描 + 风险归类
4. 交叉引用 verification/audit 脚本硬编码模式

## 6. response shape 清单

| Area | File | Shape | Consumer | Compatibility Risk |
|------|------|-------|----------|---------------------|
| /api/conflict-check | `src/app/api/conflict-check/route.ts` | `{ hasConflict, conflicts: string[] }` (200/400/500) | scheduleStore preflight、schedule-grid preflight | LOW（已稳定） |
| shared helper internal | `src/lib/schedule/conflict-check.ts` | 内部用 typed `ScheduleConflictRuleMatch`，最终产出 `string[]` | conflict-check route、slot-mutation-guard、teaching-task route | MEDIUM（typed 信息在边界丢失） |
| slot-mutation-guard internal | `src/lib/schedule/slot-mutation-guard.ts` | `{ ok: boolean, error?, status?, conflicts?: string[], semesterId? }` | slot-slot routes、admin model route | LOW（内部 helper，不暴露给 API） |
| /api/schedule-slot/[id] | `src/app/api/schedule-slot/[id]/route.ts` | 200 `{ slotId, ...viewData }` / 409 `{ error, conflicts: string[] }` | scheduleStore moveSlot | LOW |
| /api/schedule-slot | `src/app/api/schedule-slot/route.ts` | 200 `{ success, record }` / 409 `{ error, conflicts }` | admin POST | LOW |
| /api/admin/[model] | `src/app/api/admin/[model]/route.ts` | 200 / 409 `{ error, conflicts }` | admin 客户端 | LOW |
| /api/teaching-task/[id] | `src/app/api/teaching-task/[id]/route.ts` | 200 `[viewData]` / 409 `{ error, conflicts: string[] }`（Error.conflicts 模式） | admin 客户端 | MEDIUM（Error.conflicts 模式） |
| adjustment dry-run internal | `src/lib/schedule/adjustments.ts` | `{ canApply, conflicts: ScheduleAdjustmentConflict[], warnings: ScheduleAdjustmentConflict[] }` | adjustment API route、adjustment dialog | NONE（typed） |
| /api/schedule-adjustments/dry-run | `src/app/api/schedule-adjustments/dry-run/route.ts` | 200 `{ success: true, dryRun }` / 500 `{ success: false, error }` | adjustment dialog | NONE |
| /api/schedule-adjustments | `src/app/api/schedule-adjustments/route.ts` | 200 `{ success, adjustment, dryRun }` / 400 `{ success: false, dryRun }` | adjustment dialog | NONE |
| scheduleStore moveSlot | `src/store/scheduleStore.ts` | preflight 读 `preflightResult.hasConflict`、`preflightResult.conflicts.join('\n')`；PUT 失败读 `errBody?.conflicts.join('\n') || errBody?.error` | schedule-grid | LOW（依赖 string[]） |
| schedule-grid preflight | `src/components/schedule-grid.tsx` | 读 `result.hasConflict`、迭代 `result.conflicts`、toast 每个 | store | LOW |
| adjustment dialog | `src/components/schedule-adjustment-dialog.tsx` | 读 typed `dryRunResult.conflicts`/`warnings`/`.canApply` | adjustment API | NONE |

## 7. `/api/conflict-check` 结论

- response shape：`{ hasConflict: boolean, conflicts: string[] }`
- consumer：scheduleStore preflight、schedule-grid preflight
- 是否 typed：否（内部 helper 有 typed `ScheduleConflictRuleMatch`，但 response 中已翻译为 string[]）
- 兼容风险：LOW（外部契约稳定 5 个版本）
- 风险等级：MEDIUM（`K13-RESPONSE-MEDIUM-1` / `MEDIUM-6`）
- 建议：增加可选 `conflictsTyped?: ScheduleConflictRuleMatch[]` 字段；保留 `conflicts: string[]` 兼容

## 8. `slot-mutation-guard.ts` 结论

- internal result shape：`{ ok: boolean, error?: string, status?: number, conflicts?: string[], semesterId?: number }`
- route response shape：翻译为 `{ error: guardResult.error, conflicts: guardResult.conflicts }`，status 默认 400（`guardResult.status ?? 400`），实际为 409（guard 内设置）
- 是否 typed：否（依赖 shared helper 的 `string[]`）
- 兼容风险：LOW（internal helper，对外契约在 route 层）
- 风险等级：MEDIUM（`K13-RESPONSE-MEDIUM-2`）
- 建议：在 `SlotMutationGuardResult` 增加可选 `conflictsTyped?`；route 通过 helper 透传

## 9. `teaching-task/[id]` 结论

- conflict response：409 `{ error: '教室冲突', conflicts: string[] }`
- 传播模式：`Error.conflicts = string[]` throw 在 transaction 内，catch 在 route boundary
- consumer：admin 客户端（解析 `errBody.conflicts.join('\n')`）
- 是否 typed：否
- 兼容风险：MEDIUM（`K13-RESPONSE-MEDIUM-3`，Error.conflicts 模式跨 transaction/route 两层）
- 风险等级：MEDIUM
- 建议：保留 Error.conflicts 模式；增加 `Error.conflictsTyped`，catch 时透传

## 10. schedule adjustment 结论

- typed conflict 类型：`ScheduleAdjustmentConflict { type, message, severity, relatedSlotIds? }`
- type 取值：TEACHER_CONFLICT / CLASS_CONFLICT / ROOM_CONFLICT / CAPACITY_CONFLICT / INVALID_WEEK / INVALID_SLOT / INVALID_ROOM
- severity：error / warning
- 是否适合作为全局 typed schema 基础：**是**
  - 已有 type 字段，可映射 helper 的 `teacher`/`classGroup`/`room` rule type
  - 已有 severity 字段，可与 helper 的 error 区分（capacity 是 warning）
  - 已有 relatedSlotIds 字段，可对应 helper 的 occupancyId
- adjustment-specific 字段：CAPACITY_CONFLICT、INVALID_WEEK、INVALID_SLOT、INVALID_ROOM、canApply、warnings
  - 不适合直接提升为全局（helper 不应有 INVALID_WEEK 等纯输入校验）
- 兼容风险：NONE（typed 自包含，dialog 端消费无 string[] 依赖）
- 风险等级：MEDIUM（`K13-RESPONSE-MEDIUM-4`，typed schema 不同于 helper envelope，**这是设计差异**）

## 11. frontend consumer 结论

- moveSlot preflight 消费 shape：依赖 `hasConflict` + `conflicts: string[]`（string iteration + join）
- PUT 失败消费 shape：依赖 `errBody?.conflicts.join('\n') || errBody?.error`
- toast 展示方式：直接显示 string（grid）或 string message（store）
- adjustment UI 消费 shape：typed `dryRunResult.conflicts.map(c => c.message)` + `warnings.map(w => w.message)` + `canApply`
- 兼容风险：LOW（store + grid 不依赖 typed 字段）
- 风险等级：LOW（`K13-RESPONSE-LOW-1` / `K13-RESPONSE-NONE-1`）
- 建议：fix-D 可不改动 store / grid；可选增强（typed 信息可让 toast 更精确）但需要业务判断

## 12. scripts / validation 结论

- 硬编码 `string[]` 的脚本：6 个
  - `scripts/verify-schedule-conflict-check-unification-fix-a.ts`（`NextResponse.json(result)` + `hasConflict`）
  - `scripts/verify-schedule-conflict-check-unification-fix-b.ts`（`{ error: err.message, conflicts: err.conflicts }`）
  - `scripts/verify-schedule-adjustment-conflict-rules-extraction-fix-c.ts`（`hasConflict: false` 字面量 + `conflicts: []`）
  - `scripts/verify-schedule-mutation-client-preflight-fix.ts`（`preflightResult.hasConflict` + `preflightResult.conflicts`）
  - `scripts/audit-schedule-conflict-check-unification.ts`（`hasConflict: boolean` + `conflicts: string[]`）
  - `scripts/audit-schedule-adjustment-conflict-check.ts`（`canApply: conflicts.length === 0`）
- 硬编码 typed conflicts 的脚本：1 个
  - `scripts/audit-schedule-adjustment-conflict-check.ts`（typed conflict 形态检查）
- 后续 Fix-D 需同步更新的脚本：**0**（只要不删除/重命名现有字段，脚本无需更新）
- 风险等级：MEDIUM（`K13-RESPONSE-MEDIUM-5`）

## 13. 统一 typed schema 可行性分析

### 13.1 共享 typed shape 设计

```ts
// 新增：src/types/schedule-conflict.ts
export interface ScheduleConflictDetail {
  type: 'teacher' | 'classGroup' | 'room'
  occupancyId: number | null
  message: string
}
```

### 13.2 兼容性

- shared helper（checkScheduleConflicts）增加 `conflictsTyped?: ScheduleConflictDetail[]`，**保留** `conflicts: string[]`
- slot-mutation-guard 内部 result 增加 `conflictsTyped?: ScheduleConflictDetail[]`，**保留** `conflicts?: string[]`
- /api/schedule-slot 与 /api/admin/[model] route 增加 `conflictsTyped` 字段，**保留** `error` + `conflicts`
- /api/teaching-task/[id] 在 Error 与 response 增加 `conflictsTyped`，**保留** `error` + `conflicts`
- /api/conflict-check response 增加 `conflictsTyped`，**保留** `hasConflict` + `conflicts`
- adjustment dry-run 内部不改动（已经是 typed `ScheduleAdjustmentConflict[]`）

### 13.3 风险

- **无破坏性**：所有现有字段保留，新字段是可选
- **类型丰富度提升**：frontend 可消费 typed 信息，dialog 端无需改
- **业务影响小**：只新增字段，不改业务逻辑

## 14. 兼容策略建议

### 14.1 策略对比

| Strategy | Description | Pros | Cons | Recommendation |
|----------|-------------|------|------|----------------|
| 维持现状 | 不统一，保持多套 response shape | 无任何改动 | K13 main 仍留 MEDIUM-4；未来 typed 信息无法跨边界传播 | 短期可接受 |
| 全局改 typed conflicts | 移除 string[]，全部 typed | 最干净 | 破坏 scheduleStore / schedule-grid / 6 个验证脚本；需同步更新 frontend | **不推荐** |
| 内部 typed + 外部保留 string[] | helper 内部用 typed，外层同时返回 string[] | 兼容 + 增强 | 字段略多 | **推荐** |
| 新增 conflictDetails 字段 | 完全独立字段名 `conflictDetails` | 完全独立命名空间 | 名称不一致 | 不推荐 |

### 14.2 推荐策略

**策略：内部 typed + 外部兼容 string[]**

具体：
1. 在 `src/types/schedule-conflict.ts` 新增 `ScheduleConflictDetail` typed shape
2. `ScheduleConflictCheckResult` 增加 `conflictsTyped?: ScheduleConflictDetail[]`
3. `SlotMutationGuardResult` 增加 `conflictsTyped?: ScheduleConflictDetail[]`
4. /api/conflict-check、`/api/schedule-slot/*`、`/api/admin/[model]` 透传 `conflictsTyped`
5. /api/teaching-task/[id] 在 Error 与 catch 块增加 `conflictsTyped`
6. **不**修改 scheduleStore / schedule-grid（无 typed 消费需求）
7. **不**修改 adjustment dry-run envelope（已是 typed）
8. **不**修改 verification scripts（兼容性 OK）

## 15. 风险清单

| Risk ID | Severity | Area | Description | Evidence | Recommendation |
|---------|----------|------|-------------|----------|----------------|
| K13-RESPONSE-MEDIUM-1 | MEDIUM | /api/conflict-check | 响应 shape 无 typed | `ccLibDefinesHasConflict=true` `ccLibDefinesConflicts=true` `ccLibHasTypedConflict=true`（内部 typed） | Fix-D 增加 `conflictsTyped` 字段 |
| K13-RESPONSE-MEDIUM-2 | MEDIUM | slot-mutation-guard | internal result shape 与 typed conflict 不一致 | `guardUsesHelper=true` | Fix-D 在 guard result 增加 typed |
| K13-RESPONSE-MEDIUM-3 | MEDIUM | teaching-task/[id] | Error.conflicts 模式跨 transaction/route | `ttThrowsErrorWithConflicts=true` | Fix-D 在 Error 与 response 增加 `conflictsTyped` |
| K13-RESPONSE-MEDIUM-4 | MEDIUM | adjustment dry-run | typed 与 helper shape 不同 | `adjTypeDefined=true` `adjUsesRuleKernel=true` | **保留差异**（design decision） |
| K13-RESPONSE-MEDIUM-5 | MEDIUM | verification scripts | 6 个脚本硬编码 shape | `fixAHardcodesShape` ~ `adjAuditHardcodesShape` 全部 true | Fix-D 不删现有字段即可 |
| K13-RESPONSE-MEDIUM-6 | MEDIUM | shared helper internal | 内部 typed 在 response 边界丢失 | `ccLibHasTypedConflict=true` | Fix-D 在 envelope 增加 typed |
| K13-RESPONSE-LOW-1 | LOW | frontend moveSlot | 依赖 string[] | `storeThrowsPreFlight=true` | 不必改 |
| K13-RESPONSE-LOW-2 | LOW | dry-run API | envelope 不同 | `adjDryRunSuccessEnvelope=true` | 不必改 |
| K13-RESPONSE-LOW-3 | LOW | schedule-slot routes | 409 envelope | `slotPutReturns409Shape=true` | 不必改 |
| K13-RESPONSE-NONE-1 | NONE | frontend adjustment dialog | typed 消费已 OK | `adjDialogReadsConflictsTyped=true` | 不必改 |

## 16. 是否建议进入 Fix-D

- 建议：**是（conditional）**
- 条件：
  1. **不**删除 / 重命名现有 `conflicts: string[]` 字段
  2. **不**修改 adjustment dry-run envelope
  3. **不**修改 frontend consumer
  4. **不**修改 /api/conflict-check 状态码
  5. **不**修改 Prisma schema
  6. **不**修改数据库
  7. **不**修改 solver / parser / importer / seed / RBAC

## 17. Fix-D 推荐边界

### 17.1 允许修改

- `src/types/schedule-conflict.ts`（新增 typed detail）
- `src/lib/schedule/conflict-check.ts`（`ScheduleConflictCheckResult` 增加 `conflictsTyped?`）
- `src/lib/schedule/slot-mutation-guard.ts`（`SlotMutationGuardResult` 增加 `conflictsTyped?`，透传 helper）
- `src/app/api/conflict-check/route.ts`（透传 `conflictsTyped`）
- `src/app/api/schedule-slot/[id]/route.ts`（透传 `conflictsTyped`）
- `src/app/api/schedule-slot/route.ts`（透传 `conflictsTyped`）
- `src/app/api/admin/[model]/route.ts`（透传 `conflictsTyped`）
- `src/app/api/teaching-task/[id]/route.ts`（Error 与 catch 增加 `conflictsTyped`）
- `scripts/verify-schedule-conflict-response-shape-fix-d.ts`（新增验证脚本）

### 17.2 不允许修改

- `src/lib/schedule/conflict-rules.ts`（纯规则 kernel，本阶段不再动）
- `src/lib/schedule/adjustments.ts`（effective schedule、targetWeek、capacity warning 保持）
- `src/types/schedule-adjustment.ts`（`ScheduleAdjustmentConflict` 保持）
- `src/store/scheduleStore.ts`（不消费 typed）
- `src/components/schedule-grid.tsx`（不消费 typed）
- `src/components/schedule-adjustment-dialog.tsx`（typed 消费已 OK）
- `prisma/schema.prisma`
- solver / parser / importer / seed / RBAC

## 18. 不建议直接修改的部分

- `src/lib/schedule/conflict-rules.ts`：已抽离，shape 决策与 Fix-D 无关
- `src/lib/schedule/adjustments.ts`：保持 effective schedule / targetWeek / capacity / typed
- scheduleStore / schedule-grid：string[] 消费 OK，可选增强但非必须
- 6 个 verification scripts：兼容性 OK，不需改

## 19. 下一阶段建议

- 推荐阶段名：`K13-FIX-D`：统一 schedule conflict response shape（additive typed fields）
- 范围：见 17.1
- 收益：K13 main MEDIUM-4 降级为 NONE；future frontend 可选消费 typed 信息
- 风险：低（additive only）

## 20. 验证命令与结果

| 命令 | 结果 |
|------|------|
| `npx.cmd tsx scripts/audit-schedule-conflict-response-shapes.ts` | exit 0，输出 HIGH 0 / MEDIUM 6 / LOW 3 / NONE 1 |
| `npm.cmd run build` | ✓ Compiled successfully |

## 21. 关键设计决策

1. **不强行统一为单一 typed schema**：typed `ScheduleAdjustmentConflict` 与 helper envelope `string[]` 有明确设计差异（adjustment 含 capacity / invalid week / warnings，helper 不含）
2. **additive 而非 breaking**：Fix-D 推荐**增加** typed 字段，**保留** string[] 字段
3. **scripts 兼容性优先**：6 个 verification/audit 脚本硬编码 string[]，Fix-D 不删现有字段即可
4. **frontend 不强求 typed 消费**：scheduleStore / schedule-grid 当前 string[] 消费已稳定，Fix-D 不需改

## 22. 阶段关闭标准

- 已审计 /api/conflict-check：✓
- 已审计 slot-mutation-guard：✓
- 已审计 teaching-task/[id] conflict response：✓
- 已审计 schedule adjustment typed conflict：✓
- 已审计 frontend consumers：✓
- 已审计 validation / audit scripts：✓
- 已输出 response shape 清单：✓（第 6 节）
- 已输出 Fix-D 策略表：✓（第 14.1 节）
- 已明确是否建议进入 Fix-D：✓（第 16 节，conditional yes）
- 已明确 Fix-D 兼容策略：✓（第 14.2 节）
- 已新增只读审计脚本：✓（`scripts/audit-schedule-conflict-response-shapes.ts`）
- 已新增审计文档：✓（本文档）
- 审计脚本运行成功：✓
- build 通过：✓
- 未修改 Prisma schema：✓
- 未运行 db push / migrate / reset：✓
- 未修改数据库：✓
- 未修改业务代码：✓（仅新增 audit 脚本 + 文档）
- 未修改 solver/parser/importer/seed：✓
- 未新增 UI selector：✓
- 已提交 Git commit：✓
- 工作区最终干净：✓
