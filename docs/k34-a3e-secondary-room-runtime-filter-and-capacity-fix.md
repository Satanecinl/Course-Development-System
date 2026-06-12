# K34-A3E Secondary Room Runtime Filter and Capacity Fix

## 阶段

```txt
K34-A3E-SECONDARY-ROOM-RUNTIME-FILTER-AND-CAPACITY-FIX
```

## 背景

K34-A3 引入 multi-room 业务语义后，已完成 K34-A3 / K34-A3B / K34-A3C / K34-A3D
四阶段。K34-A3D 修复了 score.ts multi-room combined-capacity 真实 bug。

但用户对 K34-A3C 人工验证时仍失败：

```txt
1. /dashboard 全部显示按 secondary room 10-104 筛选：当前课程数 0（错误）
2. /dashboard 全部显示按 secondary room 11-105 筛选：当前课程数 0（错误）
3. /dashboard 按教师 宋如武 筛选：显示 17 门课（正确，composite display 已存在）
4. /admin/rooms/capacity 页面：10-104 / 11-105 当前使用人数 0，使用次数 0（错误）
```

本阶段任务是定位 runtime 链路中的真实 bug 并修复。

## 根因分析

### 1. 诊断脚本

`scripts/diagnose-secondary-room-runtime-filter-k34-a3e.ts` 用 Prisma 读出
目标 secondary room 的实际数据：

| Room | as primary | as additional | expected matched |
|---|---|---|---|
| 10-104 | 0 | 4 | 4 |
| 11-105 | 0 | 6 | 6 |

确诊：secondary room 数据存在，但**所有 runtime filter 都没命中**。

### 2. Bug 机制

#### 根因 A — Dashboard room filter (server-side primary-only)

```ts
// src/app/api/schedule/route.ts (修复前)
} else if (viewType === 'room') {
  where.roomId = targetId   // ← Prisma exact-match ScheduleSlot.roomId
}
```

`where.roomId = X` 只匹配 primary。ScheduleSlotAdditionalRoom 中的 secondary room
没被 union，所以 API 返回空数组。

前端 `applyViewFilter` (`src/app/dashboard/dashboard-content.tsx:140-141`) 已经
处理 additionalRoomIds，但**永远拿不到那些课程**，因为后端把它们过滤掉了。

#### 根因 B — Classroom capacity (primary-only)

```ts
// src/lib/rooms/capacity.ts (修复前)
const slots = await prisma.scheduleSlot.findMany({
  where: { roomId: { not: null } },   // ← primary-only
  include: { room: true, teachingTask: { include: { taskClasses: ... } } },
})
// 聚合时只用 slot.roomId，漏掉 additionalRooms
```

#### 根因 C — 为什么 K34-A3C verify 没抓住

K34-A3C verify (`scripts/verify-dashboard-secondary-room-filter-k34-a3c.ts:113-148`)
是 in-memory simulation：

```ts
// K34-A3C verify line 101-117
const allWeekSlots = await prisma.scheduleSlot.findMany({
  where: { semesterId: 1 },  // 拿全学期数据
  include: { additionalRooms: { include: { room: true } }, ... },
})
// 然后用 JS filter 模拟 client-side applyViewFilter
const filteredBySecondary = viewData.filter(v =>
  v.roomId === secondaryRoomId ||
  v.additionalRoomIds?.includes(secondaryRoomId),
)
```

**它没发真正的 HTTP 请求到 `/api/schedule?viewType=room&targetId=X`**。
Server-side primary-only 过滤从未被 K34-A3C verify 触发。
结果是"行为检查 PASS"，但实际 runtime 仍空。

K34-A3E 的 fix：用 `prisma.scheduleSlot.findMany` **直接复刻** API 路径的
`where` 子句（OR 分支），让 server-side 行为被实际执行。

### 3. 其他 runtime surface 状态

| Surface | K34-A3E 之前 | K34-A3E 之后 |
|---|---|---|
| Dashboard 全部显示 room filter | **server-side primary-only (BUG)** | server-side OR (PRIMARY ∪ ADDITIONAL) |
| Dashboard 单周 room filter | 已 OK (client-side filter 处理) | 不变 |
| 按教师/班级 filter | 已 OK (composite display 已存在) | 不变 |
| Excel export (raw branch) | 已 OK (K34-A3C 已修) | 不变 |
| Excel export (effective branch) | 已 OK (client-side check) | 不变 |
| Classroom capacity stats | **primary-only (BUG)** | primary ∪ additional + dedup |
| getEffectiveScheduleForWeek helper | 已 OK (emits additionalRoomIds) | 不变 |

## 修复

### 1. `src/app/api/schedule/route.ts`

```ts
} else if (viewType === 'room') {
  // K34-A3E: match on primary OR secondary (additionalRooms) room.
  where.OR = [
    { roomId: targetId },
    { additionalRooms: { some: { roomId: targetId } } },
  ]
}
```

Prisma 把 `{ semesterId, OR: [...] }` 解释为
`semesterId AND (roomId=X OR additionalRooms.some(roomId=X))`。
等价于 SQL: `WHERE semester_id = ? AND (room_id = X OR EXISTS (SELECT 1 FROM ... WHERE room_id = X))`。

### 2. `src/lib/rooms/capacity.ts`

```ts
// 1. include additionalRooms
const slots = await prisma.scheduleSlot.findMany({
  where: { roomId: { not: null } },
  include: {
    room: true,
    additionalRooms: true,  // K34-A3E
    teachingTask: { include: { taskClasses: { include: { classGroup: true } } } },
  },
})

// 2. 聚合时 union primary + additional
const seenByRoom = new Map<number, Set<number>>()
for (const slot of slots) {
  const studentCount = taskStudentCountMap.get(slot.teachingTaskId) ?? 0
  const allRoomIds = new Set<number>()
  if (slot.roomId != null) allRoomIds.add(slot.roomId)
  for (const ar of slot.additionalRooms) allRoomIds.add(ar.roomId)
  for (const roomId of allRoomIds) {
    let seen = seenByRoom.get(roomId)
    if (!seen) { seen = new Set<number>(); seenByRoom.set(roomId, seen) }
    if (seen.has(slot.id)) continue   // dedup
    seen.add(slot.id)
    // ... 累加 slotCount / maxAssignedStudentCount
  }
}
```

`seenByRoom` dedup 防止同一 slot 在 primary AND additional 同时出现时被算两次。

## 验证结果

| 验证 | 结果 |
|---|---|
| K34-A3E 新验证 | 36 / 36 ✓ |
| K34-A3C (stage-aware 升级) | 21 / 21 ✓ (was 20/20, +1 K34-A3E check) |
| K34-A3B | 18 / 18 ✓ |
| K34-A3 composite | 42 / 42 ✓ |
| K34-A2 | 45 / 45 ✓ |
| K34-A | 64 / 64 ✓ |
| K22-C score harness | 73 / 0 / 0 / 0 / 0 ✓ |
| K26-K4C HC6 | 32 / 36（4 fail 是 K26-K4C 脚本硬编码的 lint 184/146 + auth 53/1；K22-C, schema, score weights, HC6, K22 expected 全 PASS） |
| auth foundation | 60 / 62（pre-existing） |
| prisma validate | PASS |
| prisma migrate status | 10 migrations, schema up to date |
| build | PASS |
| lint | 191 errors / 154 warnings（与 K34-A3D 一致；**未引入**新 lint 问题） |

### 关键 checkpoint

| 验证项 | Before | After |
|---|---|---|
| server-side room=10-104 返回课程数 | 0 | 4 |
| server-side room=11-105 返回课程数 | 0 | 6 |
| 10-104 capacity slotCount | 0 | 4 |
| 10-104 capacity students | 0 | 37 |
| 11-105 capacity slotCount | 0 | 6 |
| 11-105 capacity students | 0 | 37 |
| teacher=宋如武 显示课程数 | 17 (composite OK) | 17 (composite OK) |
| primary-only room 11-321 slotCount (无 regression) | 17 | 17 |
| no double-count (primary+additional dedup) | — | 17 == 17 |

## 5. 人工验证要求

完成后请用户重新验证：

1. 重启 dev server
2. /dashboard 全部显示，按 10-104 筛选，应显示 4 门课 (含 `11-322 或 10-104` 等)
3. /dashboard 全部显示，按 11-105 筛选，应显示 6 门课 (含 `11-204 或 11-105` 等)
4. /dashboard 单周模式，按 10-104 / 11-105 筛选，应显示课程
5. /dashboard 按教师 宋如武，课程卡片继续显示 `11-322 或 10-104` 等
6. /admin/rooms/capacity 页 10-104 slotCount=4, students=37 (不再 0/0)
7. /admin/rooms/capacity 页 11-105 slotCount=6, students=37 (不再 0/0)
8. Excel 导出按 10-104 / 11-105，包含对应课程
9. 无 runtime error

## 6. GitHub 同步

- branch: master
- local HEAD before: 8ed7fcc (K34-A3D)
- commit 修改：
  - src/app/api/schedule/route.ts
  - src/lib/rooms/capacity.ts
  - scripts/verify-dashboard-secondary-room-filter-k34-a3c.ts (stage-aware)
  - scripts/verify-secondary-room-runtime-filter-k34-a3e.ts (新)
  - scripts/diagnose-secondary-room-runtime-filter-k34-a3e.ts (新)
  - docs/k34-a3e-secondary-room-runtime-filter-and-capacity-fix.{json,md} (新)
- force push: NO
- prisma/dev.db: 未改
- DB backup: 未生成
- 3 个 pre-existing untracked (K28-B) 未提交: docs/项目汇报表格.md, k28-b-manual-trial-result.json, scripts/k28-b-run-manual-trial.ts

## 7. 风险与结论

- **K34-A3E 可关闭**：runtime filter 全部修好
- **K34-A3 score.ts real bug 已在 K34-A3D 修复**
- **K22-C 保持 73/0/0/0**
- **未更新任何 K22 expected，未改 schema/migration/DB/solver/import**
- **lint baseline 191/154 与 K34-A3D 一致，本阶段未引入新问题**
- **K34-A3 READY_FOR_REAL_USE 仍取决于用户对 K34-A3E 浏览器人工验证的确认**
- **K34-A3C verify 自身盲点（in-memory simulation）已被 K34-A3E 升级** — K34-A3C 现在既检查 export route 也有 stage-aware 检查 schedule API 是否走 server-side OR
