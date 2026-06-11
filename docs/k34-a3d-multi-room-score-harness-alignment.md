# K34-A3D Multi-Room Score Harness Alignment

## 阶段

```txt
K34-A3D-MULTI-ROOM-SCORE-HARNESS-ALIGNMENT
```

## 背景

K34-A3 (commit `bdf1bbe fix(score): use combined capacity for multi-room HC4/SC10`)
引入了 multi-room 业务语义：

```txt
"11-322 或 10-104" 表示同一节课同时占用 primary room 11-322 和 secondary room 10-104
```

并修改了 `src/lib/scheduler/score.ts`：

- 新增 `getAllRoomIds(slot)` helper，返回 `[slot.roomId, ...additionalRoomIds]`。
- HC4 (line 431) / SC10 (line 732) 在 full 计算时改用 combined capacity。
- HC5 / HC6 也通过 getAllRoomIds 覆盖 secondary rooms。

K34-A3C 验证报告显示 K22-C 出现 5 个 FAIL：

```txt
A2, A3, A3b (harness A — full vs delta consistency)
J10-DELTA-WORSEN-GOOD-TO-TIGHT, J11-DELTA-SMALL-HUGE-TO-NORMAL (harness J — SC10)
```

报告归因于 K34-A3 combined capacity 语义变化。本阶段任务是判断这些 FAIL
是合理 expected drift 还是真实 bug，并据此修复。

## 根因分析

### 1. 诊断脚本

`scripts/diagnose-multi-room-k22-score-alignment-k34-a3d.ts` 隔离每个失败
case 的 SC10 详情。

**A2 移动后 SC10 显示**：

```txt
- 容量利用率 20.0% (waste): 任务 1 20 人，教室 A101 容量 100
- 容量利用率 10.0% (waste): 任务 2 20 人，教室 A101 容量 200  ← BUG
```

A2 移动 slot2 从 room 200 (cap=100) → room 100 (cap=100)。期望
combined=100, util=0.20 waste -1。但 score.ts 算出 combined=200, util=0.10。
**capacity 被算两次**。

### 2. Bug 机制

`getAllRoomIds(p.slot)` 在 K34-A3 中返回 `[slot.roomId, ...additionalRoomIds]`。
但 `slot.roomId` 是 DB 存的 primary（**不随 state 移动改变**），而
`p.room` 是 state 当前 assign 的 roomId（可能改变）。

当 slot 被移动到新房间时：

```js
const allRoomIds = getAllRoomIds(p.slot)   // [200] (slot.roomId stale)
let combinedCapacity = room.capacity         // 100 (room = ctx.roomById.get(p.room=100))
for (const rid of allRoomIds) {              // rid = 200
  if (rid === p.room) continue                // 200 !== 100 → 不跳过
  const additionalRoom = ctx.roomById.get(rid)  // room 200, cap=100
  if (additionalRoom) combinedCapacity += additionalRoom.capacity  // 100 + 100 = 200
}
```

**primary room 的 capacity 被算了两次**：
- 一次作为 `room.capacity` (p.room 100)
- 一次作为 `additionalRoom.capacity` (stale slot.roomId 200)

### 3. 影响范围

4 个调用点都有此 bug：

- HC4 (line 442)
- HC5 (line 460) — 教室可用性检查，会查 stale primary 的可用性
- HC6 (line 601) — Linxiao 限制，会查 stale primary
- SC10 (line 744) — 容量利用率

**在以下条件触发**：
- slot 有 `slot.roomId` (always true)
- slot 被移动到 `p.room != slot.roomId` 的新房间
- 旧的 slot.roomId 仍然在 `roomById` 中 (即 room 没被删除)

K22-C 5 个 FAIL 全部满足这个条件。

### 4. K34-A3 verify 没发现

K34-A3 verify (commit bdf1bbe 添加的 grep check) 是源代码静态检查：

```ts
check('HC4 uses combined capacity for multi-room', /HC4[\s\S]{0,1500}combinedCapacity/.test(scoreSrc))
check('SC10 uses combined capacity for multi-room', /SC10[\s\S]{0,1500}combinedCapacity/.test(scoreSrc))
```

**没真验证移动后的多房间行为**。K22-C harness 的 delta/full 移动
case 才是真正能暴露这个 bug 的测试，但 K22-C 在 K34-A3 之后没重跑。

## 5 个 FAIL 详细

| ID | Harness | 标题 | 原因 |
|---|---|---|---|
| A2 | A | SC1 cross-building consecutive delta | fullΔsoft=2 期望 3。SC10 多算 old primary cap |
| A3 | A | MIN_PERT introduction | fullΔsoft=-3 期望 -2。SC10 waste -1 多算 |
| A3b | A | HC1 + MIN_PERT | fullΔsoft=-3 期望 -2。同 A3 |
| J10-DELTA-WORSEN-GOOD-TO-TIGHT | J | good 0.475 → tight 0.95 | SC10 组件 delta=0 期望 -2。after state 算成 combined=200 触发 0 |
| J11-DELTA-SMALL-HUGE-TO-NORMAL | J | waste 0.17 → good 0.50 | SC10 组件 delta=0 期望 +1。after state combined=160 cap>=100 仍 waste -1 |

## 修复

**最小修改**：`getAllRoomIds` 加可选 `currentRoomId` 参数，4 个调用点都传 `p.room`。

```ts
// src/lib/scheduler/score.ts
function getAllRoomIds(slot: SlotWithRelations, currentRoomId?: number): number[] {
  const ids: number[] = []
  const primaryId = currentRoomId ?? slot.roomId
  if (primaryId != null) ids.push(primaryId)
  const additionalRooms = slot.additionalRooms as Array<{ roomId: number }> | undefined
  if (additionalRooms) {
    for (const ar of additionalRooms) ids.push(ar.roomId)
  }
  return ids
}
```

调用点全改：

- HC4 (line 442): `getAllRoomIds(p.slot, p.room)`
- HC5 (line 460): `getAllRoomIds(p.slot, p.room)`
- HC6 (line 601): `getAllRoomIds(p.slot, p.room)`
- SC10 (line 744): `getAllRoomIds(p.slot, p.room)`

`combinedCapacity` 循环里的 `if (rid === p.room) continue` 保留作为防御性
去重（防止 future additionalRooms 与 p.room 重复）。

## 修复后多房间行为

| 场景 | getAllRoomIds 返回 | combinedCapacity | 行为 |
|---|---|---|---|
| 单房间 slot，无移动 | `[currentRoomId]` | `room.capacity` | 与 pre-K34-A3 一致 |
| 单房间 slot，已移动 | `[newRoomId]` | `newRoom.capacity` | **修复点** |
| 多房间 slot，无移动 | `[currentRoomId, ...additional]` | primary + sum(additional) | K34-A3 设计意图 |
| 多房间 slot，已移动 | `[newRoomId, ...additional]` | new primary + sum(additional) | K34-A3 设计意图 |

**未更新 expected，未更新 fixture，未改 schema/migration/DB**。

## 验证结果

| 验证 | 结果 |
|---|---|
| K22-C score regression | **73 / 0 / 0 / 0 / 0** |
| K34-A basic | 64 / 64 |
| K34-A1 detail render | 55 / 55 |
| K34-A2 room name normalization | 45 / 45 |
| K34-A3 composite room | 42 / 42 |
| K34-A3B dashboard all-weeks | 18 / 18 |
| K34-A3C dashboard secondary filter | 20 / 20 |
| K26-K4C HC6 | 32 / 36 — 4 fail 是 K26-K4C 脚本硬编码的 lint baseline 184/146 和 auth 53/1，K34-A3D 未引入回归 (K22-C, schema, score weights, HC6, K22 expected 全 PASS) |
| auth foundation | 60 / 62 — pre-existing ScheduleAdjustment ACTIVE count |
| prisma validate | PASS |
| prisma migrate status | 10 migrations, schema up to date |
| npm run build | PASS |
| lint | 191 errors / 154 warnings (与 K34-A3D 前一致) |
| K22-C A2 | PASS — fullΔsoft=3, delta.soft=3, SC1 details before=1 after=0 |
| K22-C A3 | PASS — fullΔsoft=-2, delta.soft=-2 |
| K22-C A3b | PASS — fullHardDelta=-1000 (HC1), fullSoftDelta=-2, delta.hard=-1000, delta.soft=-2 |
| K22-C J10 | PASS — before count=0 sum=0, after count=1 sum=-2, SC10 component delta=-2 |
| K22-C J11 | PASS — before count=1 sum=-1, after count=0 sum=0, SC10 component delta=+1 |

## GitHub 同步状态

- branch: master
- commit bdf1bbe (K34-A3) → 修改 score.ts + verify script
- 本阶段 commit 修改 score.ts + 新增 doc/json + 新增诊断脚本
- force push: NO
- prisma/dev.db: 未改动
- DB backup: 未生成

## 风险与结论

- **K34-A3D 可关闭**：K22-C 恢复 73/0/0/0，K34-A3 系列全部 PASS。
- **K34-A3 score.ts 真实 bug 已修复**：combined capacity 不再 double-count。
- **未更新任何 K22 expected，未改 fixture，未改 schema/migration/DB**。
- **K34-A3 READY_FOR_REAL_USE 仍取决于用户对 K34-A3C 浏览器人工验证的确认**。
- **lint baseline drift (191/154 vs K26-K4C 硬编码 184/146) 是历史问题，与本阶段无关**。K26-K4C 脚本的 4 个 FAIL 实际是 K26-K4C 自己的 stage-aware baseline 滞后，不在 K34-A3D 修复范围。
- **未引入新 lint error/warning**。
