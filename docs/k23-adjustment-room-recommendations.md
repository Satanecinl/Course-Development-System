# K23-A Adjustment Auto Room Recommendation

**Stage**: `K23-A-ADJUSTMENT-AUTO-ROOM-RECOMMENDATION-IMPL`
**Date**: 2026-06-07
**K22 baseline commit**: `ab7d9fd` (K22 mainline CLOSED)
**K22 status**: scheduler `READY_FOR_REAL_OPERATIONAL_USE`, K22-C 73/0/0/0 stable
**K23-A status**: **READY_FOR_TRIAL** (read-only, no DB writes, no solver/score changes)

---

## 1. Executive Summary

K22 mainline 关闭后，用户首次真实反馈是"调课时希望系统自动匹配教室，并给出至少 2 个候选"。

K23-A 在不修改 score.ts / solver / schema / dev.db / RBAC 的前提下，新增调课流程中的"自动推荐教室"能力。

核心实现：
- `src/lib/schedule/room-recommendations.ts` — 纯函数 helper，**read-only** 复用现有 `checkScheduleConflicts` / `getTaskStudentCount` / K22-F2A specialty 规则
- `src/app/api/schedule-adjustments/room-recommendations/route.ts` — POST API，权限 `schedule:adjust`
- `src/components/schedule-adjustment-dialog.tsx` — 调课弹窗加"推荐教室"按钮，**保留**原手动选择
- 候选 < 2 时返回 `minimumSatisfied: false` + `rejectedSummary`，**不返虚假推荐**
- 候选理由（reasons / warnings）显式可解释

---

## 2. User Story

> 调课的时候，希望系统能自动匹配教室，而不是人工手动寻找是否有冲突；并且匹配教室需要给出至少两个及以上的教室可供选择。

**场景**:
- 教务在调课弹窗中选好目标周次 / 星期 / 节次后
- 点击"推荐教室"
- 系统返回至少 2 个候选（条件允许时）
- 候选附带：教室名、容量、推荐理由、警告
- 教务点击候选 → 自动填入调课表单 `roomId`
- 候选 < 2 → 展示 `rejectedSummary`，仍可手动选择
- 手动选择能力**完全保留**

---

## 3. Backend API

### 3.1 Route

`POST /api/schedule-adjustments/room-recommendations`

### 3.2 Request body

```ts
{
  scheduleSlotId: number          // 必填
  targetWeek: number              // 1-20, 必填
  targetDayOfWeek: number         // 1-7, 必填
  targetSlotIndex: number         // 1-6, 必填
  limit?: number                  // 1-20, 默认 5
  semesterId?: number             // 可选, 默认从 slot 推断
}
```

### 3.3 Response

```ts
{
  success: true,
  minimumSatisfied: boolean,
  candidates: [
    {
      roomId: number,
      roomName: string,
      building: string | null,
      capacity: number,
      type: string,
      score: number,
      reasons: string[],
      warnings: string[],
    }
  ],
  rejectedSummary: {
    conflict: number,
    capacity: number,
    linxiaoPolicy: number,
    unavailable: number,
    other: number,
  },
  message?: string
}
```

### 3.4 Permission

`requirePermission('schedule:adjust')` — 与调课 / void 调课同权限。

**未新增 RBAC permission**，复用现有 `'schedule:adjust'` 字符串。

### 3.5 DB writes

**None**. Route 整个文件不调用 `prisma.create / update / delete / upsert`。Helper 内部只读 Prisma 加载 slot / task / classGroup / room 实体。

### 3.6 Conflict / dry-run 复用

- **Room / teacher / classGroup conflict**: 复用 `src/lib/schedule/conflict-check.ts:checkScheduleConflicts` (与 `/api/conflict-check` 共享)
- **Capacity**: 复用 `src/lib/scheduler/capacity.ts:getTaskStudentCount` 的求和公式 (`sum(classGroup.studentCount ?? 50)`)
- **Linxiao / automotive**: 复制 `score.ts:classifySpecialty` (K22-F2A) 的 5-class 分类逻辑到独立模块（**不修改** score.ts）

### 3.7 targetWeek 处理

推荐 API 仅考虑单个目标周。调课 dry-run 在 `dryRunScheduleAdjustment` 中将 task 的 `weekConstraint` 与 targetWeek 做重叠判定；本 helper 也按 `candidateWeeks = [targetWeek]` 处理，自然兼容。

---

## 4. Recommendation Algorithm

### 4.1 Hard Filters (依次短路)

1. **Linxiao K22-F2A hard rule**:
   - 教室是林校 (name 或 building 含"林校")
   - 任务 specialty classification ≠ `AUTOMOTIVE_ONLY`
   - → 计入 `rejectedSummary.linxiaoPolicy++`，跳过
2. **Capacity**:
   - `studentCount > room.capacity`
   - → 计入 `rejectedSummary.capacity++`，跳过
3. **Conflict** (room / teacher / classGroup with week overlap):
   - 调用 `checkScheduleConflicts({...})`；`hasConflict === true`
   - → 计入 `rejectedSummary.conflict++`，跳过
4. **Room unavailability** (预留): 当前数据中 `RoomAvailability` 全部默认 `available=true`；helper 暂未直接读取 availabilities，冲突检查本身会覆盖。如未来加显式不可用记录，纳入 `unavailable` 计数。

### 4.2 Score (候选间相对评分)

```
base = 100
+20  教室 ID ∈ 该 TeachingTask 在同 semester 的历史 slot.roomId 集合
+15  AUTOMOTIVE_ONLY 任务 且 候选教室是林校
+10  capacity utilization ∈ [0.30, 0.90]
+5   capacity utilization > 0.90 (容量较紧)
+5   候选教室.building === slot 原教室.building
-10  capacity utilization < 0.30 (小班占超大)
```

- 排序：`score desc, roomId asc` (后者保证确定性)
- 取前 `limit` 个 (默认 5)
- 不替换 `room=0` placeholder

### 4.3 Reasons / Warnings

`reasons` 描述候选为什么被接受；`warnings` 描述候选的可疑点（如容量过紧）。

- "无教室冲突"
- "无教师/班级冲突"
- "容量满足：${studentCount} / ${room.capacity}"
- "容量利用率合理" (util ∈ [0.30, 0.90])
- "汽车专业优先林校"
- "与该教学任务历史教室一致"
- "同楼栋优先"
- warning: "容量较紧，余量较小" (util > 0.90)
- warning: "小班占用超大教室" (util < 0.30)

### 4.4 Rejected Summary

对每个被 hard filter 拒绝的 room，计数到对应桶：
- `conflict`: 房间 / 教师 / 班级冲突
- `capacity`: 容量不足
- `linxiaoPolicy`: 林校规则拒绝
- `unavailable`: 教室在该时段不可用 (预留)
- `other`: 其他

API **永远**返回 `rejectedSummary`，即使候选为 0 个。

---

## 5. Frontend UI

### 5.1 修改文件

`src/components/schedule-adjustment-dialog.tsx` (additive, 不破坏现有 dry-run / submit 流)

### 5.2 改动

- 新增 state: `recommendLoading`, `recommendResult`, `recommendError`
- 操作按钮区添加"推荐教室"按钮
- 推荐结果显示区:
  - 蓝色 panel，提示当前候选数 + 是否满足至少 2 个
  - 候选 < 2 时显示 `rejectedSummary` 汇总
  - 0 候选时显示 `message` + 引导用户改时间
  - 失败时显示错误 + 引导用户手动选择
- 候选列表项:
  - 教室名 + building / 容量 / 评分
  - reasons (绿) / warnings (黄) 子列表
  - 点击 → `setNewRoomId(c.roomId)`，高亮当前选中
- 切周次 / 星期 / 节次时清空 recommend（避免跨时间段误用）
- item 切换时清空 recommend

### 5.3 手动选择保留

原有 `<select>` with "不变" option + `roomOptions` 列表**完全保留**。推荐功能是**附加**在手动选择之上的能力，不替代。

### 5.4 错误处理

- API 失败: `toast.error('推荐失败')` + inline error + 不阻塞手动选择
- 0 候选: `toast.warning('没有可用教室')` + 提示
- 候选 < 2: `toast.warning('可用教室不足 2 个')` + rejected summary

### 5.5 确认流程

候选点击只填表单 (`newRoomId`)。**不会**自动跳到 dry-run 也不会自动 submit；仍需用户按"检查冲突"→"确认调课"。**不绕过现有 dry-run / conflict rules**。

---

## 6. Hard Filters 总结

| Filter | 来源 | 失败计入 | 失败是否硬阻断 |
|--------|------|---------|----------------|
| Linxiao K22-F2A | score.ts classifySpecialty (verbatim copy) | linxiaoPolicy | 是 |
| Capacity | getTaskStudentCount 求和 | capacity | 是 |
| Room / Teacher / Class conflict | checkScheduleConflicts | conflict | 是 |
| Room unavailability | (预留) | unavailable | 是 |

**Hard filter 优先于 score**。Score 仅用于在已通过 hard filter 的候选间排序。

---

## 7. Ranking Strategy

```
base = 100
+20  历史教室 (TeachingTask 在同 semester 用过的 room)
+15  汽车任务 + 林校教室
+10  容量利用率 ∈ [0.30, 0.90]
+5   容量利用率 > 0.90
+5   同楼栋
-10  容量利用率 < 0.30
```

排序：`score desc, roomId asc`。

---

## 8. Empty / fewer-than-two behavior

- **0 候选**: 返回 `minimumSatisfied: false`，`message: "当前时间段没有可用教室"`，`rejectedSummary` 仍填
- **1 候选**: `minimumSatisfied: false`，`message: "当前时间段可用教室少于 2 个"`
- **>= 2 候选**: `minimumSatisfied: true`

UI 显示：
- 0 候选: warning + `rejectedSummary` 汇总
- 1 候选: warning + `rejectedSummary` 汇总
- >= 2: 正常候选列表

**不造假**。如果 helper 通过 hard filter 的房间数 < `limit`，返回的就是真实数。

---

## 9. Compatibility with Manual Adjustment

- 推荐是**可选**，不是强制
- 手动 `<select>` 教室下拉框**完全保留**
- 推荐 API 失败**不影响**手动选择 / dry-run / submit
- 推荐的"填入"只 set state，不 submit
- 切候选 / 切手动值互不破坏

---

## 10. Permission / RBAC

- 路由权限: `requirePermission('schedule:adjust')` — 与调课 / void 调课同权限
- **未新增** RBAC permission
- **未修改** RBAC permission model
- 复用现有 `src/lib/auth/require-permission.ts` 模式
- 客户端 `useHasPermission('schedule:adjust')` gate 推荐按钮 disabled

---

## 11. Verification Results

### 11.1 验证脚本

`scripts/verify-adjustment-room-recommendations-k23-a.ts`

**17 节 / 30+ case**:
- A. helper file
- B. API route
- C. API permission
- D. API no DB write
- E. helper filters room=0
- F. helper calls checkScheduleConflicts
- G. helper applies capacity
- H. helper applies Linxiao / automotive
- **I. DB read-only integration (real slot in dev.db)** ← 真实数据库调用
- J. minimumSatisfied semantics
- K. frontend 推荐教室 button
- L. frontend candidate list
- M. frontend click fills newRoomId
- N. manual select preserved
- O. build-time imports
- P. score.ts not modified
- Q. schema / migration / dev.db not modified

### 11.2 完整验证链

详见完成报告。所有项必须 PASS。

---

## 12. Unmodified Scope

| Item | 状态 |
|------|------|
| `src/lib/scheduler/score.ts` | ❌ NOT modified |
| solver algorithm | ❌ NOT modified |
| Prisma schema | ❌ NOT modified |
| Migration | ❌ NOT modified |
| `prisma/dev.db` | ❌ NOT written (K23-A is read-only) |
| `src/lib/auth/*`, `src/lib/rbac/*` | ❌ NOT modified |
| RBAC permission model | ❌ NOT modified (复用现有 `schedule:adjust`) |
| K22 constraints | ❌ NOT modified |
| K22-C expected (73/0/0/0) | ❌ NOT changed |
| `hardWeights` / `softWeights` | ❌ NOT introduced |
| SchedulingConfig | ❌ NOT modified |
| Top Issues | ❌ NOT modified |
| Importer / parser | ❌ NOT modified |
| Business data | ❌ NOT written |

---

## 13. Known Limitations

- **L-AUTH-SCHED-ADJUST**: pre-existing `ScheduleAdjustment ACTIVE` count mismatch (历史, 与 K23-A 无关)
- **L-LINT-DEBT**: 历史 lint debt (K23-A 0 new error)
- **L-K23-A-NO-PERSONALIZED-RANKING**: 推荐 score 是固定权重；未来可加管理员调权重 (但本阶段不允许引入 hardWeights/softWeights)
- **L-K23-A-NO-WEEK-OVERLAP-MULTI-WEEK**: 候选仅评估 `targetWeek` 单周；多周调课会按 dry-run 单独判断，本 helper 不模拟
- **L-K23-A-NO-CAPACITY-FALLBACK-CONFIG**: capacity fallback = 50/人，与 `capacity.ts` 一致；无 per-class 配置

---

## 14. Next Stage Recommendation

- **`K23-B-ROOM-RECOMMENDATION-E2E-MANUAL-TRIAL`**: 浏览器真实调课试用推荐教室，收集反馈
- **`K23-C-ROOM-RECOMMENDATION-QUALITY-TUNING`**: 根据真实反馈调整排序权重
- **`K23-D-ROOM-RECOMMENDATION-STRICT-EXCEPTION-RULES`**: 如需 manual exception / preferred room / room type

**建议**: K23-A 关闭后进入 K23-B 真实试用，**不**直接做 K23-C 调参 (无真实反馈前调参无意义)。

---

**报告结束。K23-A 处于 READY_FOR_TRIAL 状态。**
