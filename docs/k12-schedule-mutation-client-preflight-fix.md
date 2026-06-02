# K12-SCHEDULE-MUTATION-CLIENT-PREFLIGHT-FIX

## 1. 阶段名

K12-SCHEDULE-MUTATION-CLIENT-PREFLIGHT-FIX

## 2. 当前背景

K11 完成了服务端 mutation guard（`slot-mutation-guard.ts`），所有 `PUT /api/schedule-slot/[id]` 和 `POST /api/schedule-slot` 请求都有服务端冲突检查和学期边界保护。

K11 唯一剩余 MEDIUM：

- `K11-MUTATION-MEDIUM-4`: Client moveSlot 无 preflight
- 客户端 `moveSlot` 直接做乐观更新 + PUT，不调用 conflict-check
- 虽然 `schedule-grid.tsx` 的 `handleDragEnd` 已有 conflict-check，但 `moveSlot` 本身无保护
- 任何其他调用者可绕过冲突检查

## 3. 修复目标

在 `moveSlot` 函数内部增加 preflight conflict check，使其在乐观更新和 PUT 之前先验证是否冲突。

## 4. moveSlot 入口位置

- 文件：`src/store/scheduleStore.ts`，第 95 行
- 原行为：直接乐观更新 + PUT `/api/schedule-slot/${slotId}`，无 preflight
- 调用者：`src/components/schedule-grid.tsx` `handleDragEnd`（第 125 行）

## 5. conflict-check 契约

- 使用的 endpoint：`POST /api/conflict-check`
- Request body：
  ```json
  {
    "scheduleSlotId": number,
    "targetDayOfWeek": number,
    "targetSlotIndex": number,
    "targetRoomId": number,
    "semesterId?": number
  }
  ```
- Response shape：
  ```json
  {
    "hasConflict": boolean,
    "conflicts": string[]
  }
  ```
- 支持 exclude 当前 slot：是（`scheduleSlotId` 被排除在 `id: { not: scheduleSlotId }`）
- 支持 semesterId：是（可选，不传则从 slot 自身获取）
- 支持 week/weekType：是（服务端从 TeachingTask 读取并做 week overlap 检查）

## 6. preflight 实现说明

### moveSlot 内部 preflight

1. 从 `scheduleItems` 中查找被移动的 slot
2. 构造 preflight body：`scheduleSlotId, targetDayOfWeek, targetSlotIndex, targetRoomId`
3. 若 item 有 `semesterId` 字段则传入
4. 调用 `POST /api/conflict-check`
5. 若 `hasConflict === true`，`throw new Error(conflicts.join('\n'))`
6. 若 preflight 通过，继续乐观更新 + PUT

### Grid handleDragEnd

Grid 保留自己的 preflight（步骤 1），作为 UX 层：冲突时直接 toast 并 return。moveSlot 内部的 preflight 是安全网，保护非拖拽调用路径。

## 7. 冲突时行为

- 不发送 PUT
- 不做乐观更新
- 抛出 Error，包含冲突详情
- Grid catch 块显示 `toast.error('调课失败', { description: msg })`

## 8. PUT 失败时行为

- 解析服务端返回的 `errBody.conflicts` 或 `errBody.error`
- 抛出包含详情的 Error
- 回滚乐观更新（`set({ scheduleItems: oldItems })`）
- Grid catch 块显示错误 toast

## 9. 验证命令

```bash
npx.cmd tsx scripts/verify-schedule-mutation-client-preflight-fix.ts
npx.cmd tsx scripts/audit-schedule-mutation-server-guards.ts
npm.cmd run build
npm.cmd run lint
```

## 10. audit 风险变化

| 指标 | 修复前 | 修复后 |
|------|--------|--------|
| HIGH | 0 | 0 |
| MEDIUM | 1 (K11-MUTATION-MEDIUM-4) | 0 |
| LOW | 3 | 3 |

`K11-MUTATION-MEDIUM-4` 自动降级为 NONE，因为 audit 检测 `scheduleStore.includes('conflict-check')` 现在为 true。

## 11. 剩余风险

- LOW-1: 两套独立 conflict-check 实现（conflict-check.ts vs adjustments.ts）
- LOW-2: ScheduleAdjustment 一致性（直接 PUT 绕过 adjustment 路径）
- LOW-3: RBAC（slot mutation 使用 data:write 而非更严格的 schedule:adjust）

## 12. 下一阶段建议

- K13 或后续可考虑：统一 conflict-check 实现、RBAC 收窄、或禁止直接 slot mutation
