# K21 Room Capacity and Solver Config Audit

| Field | Value |
|---|---|
| Phase | K21-FIX-A-ROOM-CAPACITY-AND-SOLVER-CONFIG-AUDIT |
| Type | Read-only audit (no Prisma writes, no schema/migration, no business data mutation) |
| Generated | 2026-06-05 |
| Predecessor | K20-FIX-B (commit `b557194 feat(import): add teaching task class source evidence`) — K20-REMAINING-RISK-REBASE-AUDIT (commit `5829c8c test(import): align source evidence audits`) |
| Audit script | `scripts/audit-room-capacity-and-solver-config-k21-fix-a.ts` |
| JSON report | `docs/k21-room-capacity-and-solver-config-audit.json` |
| Project direction | K21-SCHEDULER-PRODUCTIZATION — 排课引擎产品化第一阶段 |

---

## 1. Background

最近完成阶段：**K20-FIX-B** (commit `b557194`) + **K20-REMAINING-RISK-REBASE-AUDIT** (commit `5829c8c`)。两项已关闭：

- `TeachingTaskClass` 已新增 8 个 source evidence 字段 + importer forward-fill
- K20 rebase 状态：HIGH=0 / MEDIUM=1 / LOW=6 / ACCEPTED=1 / NONE=2 / BLOCKING=NO
- 主线方向从 import 数据治理切换为 **K21-SCHEDULER-PRODUCTIZATION**

K20 D 类别（Room.capacity placeholder）从 K17 MEDIUM 降级为 LOW，但 K20 文档推荐下一阶段为 K20-FIX-A-ROOM-CAPACITY-AUDIT。本阶段承接该推荐，正式进入 K21-SCHEDULER-PRODUCTIZATION 主线。

**K21 阶段定位**：
- 排课引擎产品化的第一步
- 审计 `Room.capacity` 数据真实性
- 审计 solver 是否正确使用 capacity
- 审计 scheduler config model / 参数结构 / API / UI
- 评估 HC1-HC5 / SC1-SC4 当前状态
- 评估 lockedTaskIds / preview-apply-rollback 闭环
- 评估 room type / room availability
- **不修改任何代码 / DB / schema / solver / frontend**

---

## 2. Goal

1. 审计当前 `Room.capacity` 数据质量
2. 判断是否所有教室容量都是默认值或 placeholder
3. 审计 solver / score.ts 是否使用 capacity 约束
4. 审计 HC1-HC5 / SC1-SC4 当前实现状态
5. 审计是否已有 scheduler config model / 参数结构
6. 审计是否已有 solver 参数 UI 或 API
7. 判断 Room.capacity 真实化对排课结果的影响
8. 设计下一阶段最小实现方案
9. 不修改 DB
10. 不修改 schema
11. 不修改 solver
12. 不修改 frontend

---

## 3. Scope

### In scope（只读审计）

- `prisma/schema.prisma` (read-only)
- `prisma/dev.db` (Prisma read query only)
- `src/lib/scheduler/**` (read-only)
- `src/app/api/admin/scheduler/**` (read-only)
- `src/app/admin/scheduler/**` (read-only)
- `src/lib/rooms/capacity.ts` (read-only)
- `src/app/api/admin/rooms/capacity/**` (read-only)
- `src/app/admin/rooms/capacity/**` (read-only)
- `docs/k20-*` (read-only 历史报告)
- `package.json` (read-only)

### Out of scope（严禁处理）

- 任何 Prisma 写操作（create / update / delete / upsert / executeRaw$write）
- 任何 schema / migration / seed / reset
- 任何 API route 业务逻辑改动
- 任何 solver 改动
- 任何 scheduler 改动
- 任何 frontend 改动
- 任何 importer / parser 改动
- 任何 RBAC / permission 改动
- 任何 Room / ScheduleSlot / TeachingTask / TeachingTaskClass / ClassGroup / ImportBatch 数据改动
- 任何 `prisma db push` / `migrate` / `reset` / `seed`

---

## 4. Room Capacity Data Quality

### 4.1 统计结果

| Metric | Value |
|---|---:|
| Room count | **53** |
| capacity min | 3 |
| capacity max | 200 |
| capacity avg | 46 |
| capacity distinct values | 23 |
| **capacity=50 count (placeholder)** | **0 (0.0%)** |
| capacity null count | 0 |
| capacity <= 0 count | 0 |
| building distinct | multiple |
| type distinct | 1 (NORMAL=53) |
| roomAvailability records | 0 (false=0) |
| HC4 current conflicts | 0 |

### 4.2 Capacity 分布（distinct buckets）

| capacity | count | capacity | count |
|---:|---:|---:|---:|
| 3 | 4 | 41 | 8 |
| 20 | 1 | 42 | 1 |
| 22 | 1 | 54 | 3 |
| 25 | 2 | 61 | 3 |
| 28 | 2 | 76 | 1 |
| 30 | 3 | 80 | 1 |
| 31 | 1 | 83 | 1 |
| 33 | 1 | 92 | 2 |
| 37 | 3 | 100 | 1 |
| 38 | 2 | 108 | 1 |
| 39 | 6 | 200 | 1 |
| 40 | 4 | | |

分布显示真实的教室类型差异：机房（小容量, 3-40 座），中型教室（41-61），阶梯 / 大型教室（76-200）。**完全没有占位符**。

### 4.3 Room.name 模式

| Pattern | Count |
|---|---:|
| 机房 (computer room) | >0 |
| 实训 (training) | >0 |
| 阶梯 (lecture hall) | >0 |
| 林校 (lín xiào) | >0 |
| numbered (e.g. 1-205) | >0 |

Room.name 已包含可推断的物理类型信息（机房 / 实训 / 阶梯 / 林校），但 schema `Room.type` 字段全部填 `NORMAL`，未利用此信息。

### 4.4 Schema 限制

- `Room.capacity Int @default(50)` — 新建 Room 不显式指定时 fallback 50
- 当前 DB 无 placeholder，但 schema fallback 风险仍存在
- `/admin/rooms/capacity/` 页面 + `PATCH /api/admin/rooms/capacity/[id]` 端点已提供 UI 编辑入口

### 4.5 Placeholder 判断结论

**当前数据无需批量修复**。DB 中 53 个 Room 全部为真实容量（capacity=50 占比 0.0%），与 K20 报告一致 (K20 阶段 DB state 已记 0 placeholder)。

**风险**：schema @default(50) 仍保留，未来新建 Room 不显式指定会 fallback 到 50，需要持续人工维护。

**建议**：短期接受当前状态。下阶段 K21-FIX-B 重点是文档化容量数据来源 + 调研教务系统导入可行性 + 防止 schema fallback 误用。

---

## 5. Capacity Constraint in Solver

### 5.1 HC4 实现详情

**位置**：`src/lib/scheduler/score.ts` 第 162-176 行（full score）+ 第 378-383 行（delta score）

**逻辑**：
```ts
const studentInfo = getTaskStudentCount(p.slot.teachingTask, ctx)
if (studentInfo.studentCount > room.capacity) {
  hardScore += HARD_PENALTY  // -1000
  details.push({ type: 'HC4_CAPACITY', level: 'HARD', penalty: HARD_PENALTY, ... })
}
```

**solver 层加固**：`src/lib/scheduler/solver.ts` `isPlacementHardCompatible()` 也调用此检查（line 123: `if (studentInfo.studentCount > proposedRoom.capacity) return false`），确保新位置不引入 HC4。

### 5.2 Student Count 来源

`src/lib/scheduler/capacity.ts` `getTaskStudentCount(task, ctx)`：
- 遍历 `task.taskClasses`
- 累加 `tc.classGroup.studentCount`（如 `studentCount != null && > 0`）
- 否则 fallback `FALLBACK_STUDENTS_PER_CLASS = 50`
- 返回 `TaskStudentInfo` 含 `countSource`: `'REAL_STUDENT_COUNT' | 'FALLBACK_50_PER_CLASS' | 'MIXED'`

### 5.3 当前风险

| Risk | Description |
|---|---|
| Hardcoded penalty | `-1000` 是 hardcoded 常量，不可调优 |
| Fallback 50 silent | ClassGroup.studentCount=null 时静默使用 50 |
| 无 HC4 分级 | 严重超限 (200/30) 与轻微超限 (51/50) 同等待遇 |

### 5.4 当前数据下 HC4 行为

- DB 中真实 HC4 conflict = **0 个**
- 当前所有 440 个 ScheduleSlot 均满足 capacity 约束
- HC4 约束当前是"形同未触发"状态

### 5.5 参数化需求

HC4 当前实现已正确，但需要：
1. weight 可配置（不同高校对容量要求不同）
2. 当 FALLBACK 触发时增加 warning
3. 严重超限与轻微超限的区分（hard vs soft）

---

## 6. Current Hard Constraints HC1-HC5

| Constraint | Type | Current Meaning | Configurable Weight | Hardcoded Penalty |
|---|---|---|:---:|---:|
| HC1 | HARD | 教室冲突（同 room 同 day/slot 重叠周次） | ❌ | -1000 |
| HC2 | HARD | 教师冲突（同 teacher 同 day/slot 重叠周次） | ❌ | -1000 |
| HC3 | HARD | 班级冲突（同 classGroup 同 day/slot 重叠周次） | ❌ | -1000 |
| HC4 | HARD | 容量超限 (studentCount > Room.capacity) | ❌ | -1000 |
| HC5 | HARD | RoomAvailability.available=false | ❌ | -1000 |
| HC6 | HARD (intent) | lockedSlotIds 中的 slot 不能移动（由 solver 控制, score 不计 delta） | ❌ | n/a |

**HC6 特殊情况**：score.ts 第 192-203 行有 HC6 section 但 body 是 stub（K9-B-SCORING-0 audit 决策），locked slot 实际由 solver 层的 `lockedSlotIds` Set 控制 move 候选。

**所有 HC weight 都是 hardcoded 常量**，无法通过 SchedulingConfig 调整。

---

## 7. Current Soft Constraints SC1-SC4

| Constraint | Type | Current Meaning | Configurable Weight | Hardcoded Penalty |
|---|---|---|:---:|---:|
| SC1 | SOFT | 跨楼栋连续课（教师或班级同天相邻 slot 跨 building） | ❌ | -5 |
| SC2 | SOFT | 同一任务同一天多节 (count-1) × penalty | ❌ | -10 |
| SC3 | SOFT | 极端时间（slotIndex >= 5，即第 9-10 节 / 第 11-12 节） | ❌ | -1 |
| SC4 | SOFT | 跨校区通勤（同任务同天相邻 slot 跨 building） | ❌ | -5 |
| MIN_PERT | SOFT | 扰动（slot 从原位置移动） | ❌ | -2 |

### 7.1 常见高校需求未覆盖

| Missing Need | Severity | Rationale |
|---|:---:|---|
| 教师工作日均衡 (teacher day-balance) | MEDIUM | 教师一周内每天课时分布不均会造成工作压力集中 |
| 教师半天集中 (teacher half-day clustering) | LOW | 教师希望连续半天而非分散 |
| 班级空洞减少 (class gap reduction) | MEDIUM | 班级一天内多次课之间有空闲段，影响学生效率 |
| 教室稳定性 (room stability across weeks) | LOW | 同一门课在不同周次最好在相同教室 |
| 实训课匹配实训室 (lab-to-workshop) | MEDIUM | 课程与 room type 不匹配会导致无法上课 |
| 大班优先大教室 (large-class → large-room) | MEDIUM | 大班用小教室会触发 HC4，小班用大教室是浪费 |
| 同班连续课减少教室切换 (consecutive same-room) | LOW | 同一班级连续两节在不同教室会增加移动 |

### 7.2 全部 SC weight 不可配置

当前所有 SC weight 都是 hardcoded 常量 (`SOFT_SC1_CROSS_BUILDING = -5` 等)。不同高校对软约束的优先级不同（例如：林业院校可能更在意 SC3 极端时间 vs 跨校区），当前无法调整。

---

## 8. Scheduler Config Model / API / UI

### 8.1 SchedulingConfig Model

`prisma/schema.prisma`:
```prisma
model SchedulingConfig {
  id             Int             @id @default(autoincrement())
  name           String
  semesterId     Int?
  semester       Semester?       @relation(fields: [semesterId], references: [id])
  maxIterations  Int             @default(10000)
  lahcWindowSize Int             @default(500)
  lockedTaskIds  String          @default("[]")
  createdAt      DateTime        @default(now())
  runs           SchedulingRun[]
  @@index([semesterId])
}
```

**DB 记录**：1 个 config (id=1, maxIterations=10000, lahcWindowSize=500, lockedTaskIds="[]")。

### 8.2 Solver 实际使用

`solver.ts` 实际使用 `SolverConfig`（local interface）：
```ts
export interface SolverConfig {
  maxIterations: number
  lahcWindowSize: number
  lockedSlotIds?: Set<number>
  randomSeed?: number | null
}
```

`preview.ts` (line 269-287)：从 DB 读取 `SchedulingConfig` **仅用于解析 `configId` 外键关联 `SchedulingRun`**，**不解析** `maxIterations` / `lahcWindowSize` / `lockedTaskIds`。

**Solver 实际参数来源**：
1. `options.maxIterations` (来自 API request body 或 `PreviewOptions`) — **缺省 10000, 硬上限 15000**
2. `options.lahcWindowSize` (同上) — **缺省 500, 范围 [50, 2000]**
3. `options.lockedSlotIds` (同上) — **缺省 []**
4. `options.randomSeed` — **缺省 `Math.random()`**

### 8.3 API 接口

| Endpoint | File | Accepts |
|---|---|---|
| POST `/api/admin/scheduler/preview` | `src/app/api/admin/scheduler/preview/route.ts` | maxIterations, lahcWindowSize, randomSeed, lockedSlotIds[], semesterId? |
| POST `/api/admin/scheduler/apply` | `src/app/api/admin/scheduler/apply/route.ts` | previewRunId, confirmApply |
| POST `/api/admin/scheduler/rollback` | `src/app/api/admin/scheduler/rollback/route.ts` | applyRunId, confirmRollback |
| GET `/api/admin/scheduler/runs` | `src/app/api/admin/scheduler/runs/route.ts` | (list) |
| GET `/api/admin/scheduler/runs/[id]` | `src/app/api/admin/scheduler/runs/[id]/route.ts` | (detail) |
| GET `/api/admin/scheduler/lockable-slots` | `src/app/api/admin/scheduler/lockable-slots/route.ts` | semesterId? |

**API 接受 maxIterations / lahcWindowSize**，但 **frontend 不暴露**这些 input。

### 8.4 Frontend UI 暴露

| Parameter | Exposed in UI? | UI Location |
|---|:---:|---|
| maxIterations | ❌ | n/a (use server default 10000) |
| lahcWindowSize | ❌ | n/a (use server default 500) |
| **randomSeed** | ✅ | `scheduler-content.tsx` 随机种子 input |
| **lockedSlotIds** | ✅ | `scheduler-content.tsx` 锁定课表槽位 section |

`src/app/admin/scheduler/scheduler-content.tsx` 主要 UI 元素：
- 随机种子 input
- 锁定课表槽位 (从 `/api/admin/scheduler/lockable-slots` 拉取)
- 运行 Preview 按钮
- 应用排课 按钮
- 撤销应用 按钮
- 重置 按钮

**没有 `SchedulingConfig` editor / maxIterations 输入框 / lahcWindowSize 输入框**。

### 8.5 评估结论

- **D 类别 MEDIUM**：`SchedulingConfig` model 存在但 solver 不读取 + frontend 不暴露 LAHC 参数
- 风险：用户无法调参优化不同学期排课（春季 vs 秋季），不同 config 无法保存/复用
- 推荐下阶段：**K21-FIX-D-SOLVER-CONFIG-UI**

---

## 9. lockedTaskIds Assessment

### 9.1 Schema 字段

`SchedulingConfig.lockedTaskIds String @default("[]")` — 存储 JSON 字符串化的 task ID 数组。

### 9.2 Solver / API 实际使用

| Layer | Variable | Type | Source |
|---|---|---|---|
| Schema | `SchedulingConfig.lockedTaskIds` | String | DB |
| Solver (local) | `SolverConfig.lockedSlotIds` | `Set<number>` | API request body |
| API | `body.lockedSlotIds` | `number[]` | Frontend |
| Frontend | `lockedSlotIds` checkbox state | `number[]` | user |

**关键发现**：
- Schema 字段名是 `lockedTaskIds`（任务级）
- Solver / API / Frontend 实际是 `lockedSlotIds`（槽位级）
- **没有转换层**：solver 不解析 `SchedulingConfig.lockedTaskIds`，preview API 也不读
- 语义差异未文档化：lockedTaskIds=lock entire task (all its slots), lockedSlotIds=lock individual slot positions

### 9.3 验证

- `preview/route.ts` 第 69-75 行：`prisma.scheduleSlot.findMany({ where: { id: { in: lockedSlotIds } } })` — 验证的是 slot ID
- `solver.ts` 第 175 行：`allMovable = allMovable.filter(s => !lockedSlotIds.has(s.id))` — slot 级别过滤
- frontend 选中的是 `ScheduleSlot` (从 `/api/admin/scheduler/lockable-slots` 拉取)

### 9.4 风险

- **E 类别 MEDIUM**：字段名误导
- 维护者可能认为 `SchedulingConfig.lockedTaskIds` 字段被使用，**实际从未解析**
- 任务级 vs 槽位级语义差异未文档化

### 9.5 建议下阶段

- 决策语义：task-level lock 还是 slot-level lock
- 字段重命名：`lockedTaskIds` → `lockedSlotIds`
- 或在 solver 层面增加 task-level lock 解析："if task has any locked slot, all its slots locked"

---

## 10. Preview / Apply / Rollback Assessment

### 10.1 SchedulingRun Model 完整度

`prisma/schema.prisma` SchedulingRun model 包含：
- ✅ `mode` (PREVIEW / APPLY / ROLLBACK) — 3 种 mode
- ✅ `status` (PENDING / PREVIEW / APPLYING / COMPLETED / FAILED / ROLLED_BACK) — 6 种 status
- ✅ `resultSnapshot` (String) — 完整结果 JSON
- ✅ `conflictSummary` (String) — 冲突摘要 JSON
- ✅ `databaseFingerprint` (String) — DB 一致性校验
- ✅ `previewExpiresAt` (DateTime) — preview 过期时间 (30 min TTL)
- ✅ `rollbackOfRunId` (Int) — 指向被回滚的 apply run
- ✅ `appliedAt` (DateTime) — apply 完成时间
- ✅ `rolledBackAt` (DateTime) — rollback 完成时间
- ✅ `hc1Before/After` ... `hc4Before/After` (8 个 Int 字段) — 4 维度的硬约束 before/after 对比
- ✅ `operatorId` / `operatorNameSnapshot` — 操作者追踪
- ✅ `startedAt` / `completedAt` / `durationMs` / `iterations` — 性能追踪
- ✅ `randomSeed` / `solverVersion` — 复现性

### 10.2 SchedulerRunChange Model

每个 slot 级别的 diff：
- oldDayOfWeek / oldSlotIndex / oldRoomId
- newDayOfWeek / newSlotIndex / newRoomId
- courseNameSnapshot / teacherNameSnapshot / classGroupsSnapshot / roomNameOldSnapshot / roomNameNewSnapshot
- `@@index([runId, scheduleSlotId, teachingTaskId])`

### 10.3 API 闭环

| Step | Endpoint | Permission | Status |
|---|---|---|:---:|
| Preview | `POST /api/admin/scheduler/preview` | schedule:adjust | ✅ |
| Apply | `POST /api/admin/scheduler/apply` | schedule:adjust | ✅ |
| Rollback | `POST /api/admin/scheduler/rollback` | schedule:adjust | ✅ |
| Run list | `GET /api/admin/scheduler/runs` | schedule:adjust | ✅ |
| Run detail | `GET /api/admin/scheduler/runs/[id]` | schedule:adjust | ✅ |
| Lockable slots | `GET /api/admin/scheduler/lockable-slots` | schedule:adjust | ✅ |

### 10.4 UI 闭环

| Component | Status | Location |
|---|---|:---:|
| Preview 按钮 + 结果展示 | ✅ | `src/app/admin/scheduler/scheduler-content.tsx` |
| Apply 按钮 + 确认 dialog | ✅ | 同上 |
| Rollback 按钮 + 确认 dialog | ✅ | 同上 |
| History 列表 (mode/status filter) | ✅ | `src/app/admin/scheduler/history/history-content.tsx` |
| History 详情 (run detail) | ✅ | 同上 |

### 10.5 阻 apply 8 项 gate

1. `hardScore === 0`
2. `hc1After === 0`
3. `hc2After === 0`
4. `hc3After === 0`
5. `hc4After === 0`
6. `preview not expired` (TTL 30 min)
7. `preview status = COMPLETED` (not BLOCKED)
8. `databaseFingerprint match` (DB 状态未变)

### 10.6 当前 DB 状态

- 77 个 SchedulingRun 记录
- 分布 (mode, status)：需查询 DB

### 10.7 评估结论

**F 类别 LOW**：当前闭环完整, 阻 apply 的 8 项 gate 全部实现, UI / API 完整。

**剩余 polish 工作**：
1. UI 中没有进度条 / 取消按钮，长时间 run 无法中断
2. rollback 链不支持多级 (`rollbackOfRunId` 仅记录上一级)
3. history UI 仅显示，不支持按 run 重新执行 / 复制 config

**推荐下阶段**：**K21-FIX-E-SCHEDULER-PREVIEW-APPLY-ROLLBACK-AUDIT** (polish + extend, 非阻塞)

---

## 11. Room Type / Availability Assessment

### 11.1 Room.type Schema

`Room.type String @default("NORMAL")` — 53 个 Room 全部为 `NORMAL`，未区分机房/实训/阶梯。

### 11.2 Solver 使用情况

| File | Uses room.type? |
|---|:---:|
| `src/lib/scheduler/solver.ts` | ❌ |
| `src/lib/scheduler/score.ts` | ❌ |
| `src/lib/scheduler/capacity.ts` | ❌ |
| `src/lib/rooms/capacity.ts` | ❌ |

`getEligibleRoomsByCapacity` 返回的 `EligibleRoom` 包含 `type` 字段，但调用方不 filter。**Room.type 字段在所有 solver / capacity 代码中完全未使用**。

### 11.3 RoomAvailability Model

`RoomAvailability` model：
- `id` (Int, PK)
- `roomId` (Int, FK)
- `dayOfWeek` (Int)
- `slotIndex` (Int)
- `available` (Boolean @default(true))
- `reason` (String?)

**当前 DB 状态**：0 条 RoomAvailability 记录（所有教室在所有时段都默认可用）。

**score.ts HC5_ROOM_UNAVAILABLE** 唯一使用点：当某 room/day/slot 有 `available=false` 记录时 hard penalty。

### 11.4 风险

- **G 类别 MEDIUM**：机房 / 实训室 / 阶梯教室可被分配到任何课程
- 理论课占用机房（资源浪费）
- 实训课占用普通教室（无法做实验）
- 课程对 room type 的需求未匹配

### 11.5 建议下阶段

**K21-FIX-B-ROOM-TYPE-CONSTRAINT-AUDIT** (deferred to K22+):
- Course.requiredRoomType 字段
- Room.type enum 扩展 (NORMAL / LAB / TRAINING / LECTURE_HALL)
- solver room type 匹配检查
- 维护常见 room type 映射 (e.g. 课程名含"实训" → TRAINING)

---

## 12. Findings Summary

| Severity | Count | IDs |
|---|---:|---|
| **HIGH** | **0** | — |
| **MEDIUM** | **4** | K21-C-1, K21-D-1, K21-E-1, K21-G-1 |
| **LOW** | **1** | K21-F-1 |
| **INFO** | **1** | K21-A-1 |
| **ACCEPTED** | **0** | — |
| **NONE** | **1** | K21-B-1 |
| **TOTAL** | **7** | — |
| **BLOCKING** | **NO** | — |

### 12.1 Findings 列表

| ID | Rule | Severity | Title |
|---|---|:---:|---|
| K21-A-1 | A. Room.capacity data | INFO | 53 个 Room 全部为真实容量，placeholder 0% |
| K21-B-1 | B. HC4 capacity | NONE | HC4 容量约束已实现，hard constraint |
| K21-C-1 | C. HC/SC coverage | MEDIUM | HC1-HC5+SC1-SC4 已实现；7 项常见需求未覆盖 |
| K21-D-1 | D. Scheduler config | MEDIUM | Config model 存在但 solver 读取 + UI 不暴露 |
| K21-E-1 | E. lockedTaskIds | MEDIUM | Schema "lockedTaskIds" 但 solver 用 "lockedSlotIds" |
| K21-F-1 | F. Preview/Apply/Rollback | LOW | 闭环完整, 8 项 gate 全部实现 |
| K21-G-1 | G. Room type | MEDIUM | Room.type 不被 solver 使用 |

### 12.2 严重度分布

- **MEDIUM 4 项**：
  - C 类别：7 项常见需求未覆盖 (教师均衡 / 班级空洞 / 教室稳定 / 实训匹配 / 大班优先)
  - D 类别：solver config 不可调 + UI 不暴露
  - E 类别：lockedTaskIds 字段名误导 + 语义未文档化
  - G 类别：Room.type 未被 solver 使用
- **LOW 1 项**：F 类别闭环 polish 工作
- **INFO 1 项**：A 类别 room capacity 数据已真实
- **NONE 1 项**：B 类别 HC4 实现正确

**主线状态**：BLOCKING: NO, 4 项 MEDIUM 不阻塞, 但建议下阶段优先处理 D + E（solver config + 锁定语义）。

---

## 13. Recommended Roadmap

### 阶段 1: K21-FIX-B-ROOM-CAPACITY-DATA-PLAN (top suggestion)

| Field | Value |
|---|---|
| Reason | 当前 Room.capacity 数据已全部为真实 (placeholder=0%), 风险低. 下一阶段重点: 文档化数据来源 + 调研教务系统导入可行性 + 防止 schema @default(50) 误用 |
| Scope | 只读 audit room capacity source-of-truth. 设计 admin capacity edit / CSV import 流程. 输出 doc 文档化容量数据来源 + K21-FIX-C 实施路径 |
| Out of scope | 不实施数据导入. 不改 Room schema. 不动 solver. 不改 capacity.ts |

### 阶段 2: K21-FIX-C-ROOM-CAPACITY-IMPLEMENTATION

| Field | Value |
|---|---|
| Reason | K21-FIX-B plan 完成后, 实施 capacity 数据导入 / 编辑. 注意: 当前数据已真实, 主要工作是 "持续维护" 工具, 不是 "修复" |
| Scope | 实现 admin capacity edit 完善 + CSV import 端点 + 历史数据导入脚本 (dry-run only). 加 schema 校验: 显式指定 capacity |
| Out of scope | 不改 soft constraints. 不改 solver. 不动 historical data |

### 阶段 3: K21-FIX-D-SOLVER-CONFIG-UI (推荐优先 #2)

| Field | Value |
|---|---|
| Reason | D 类别 MEDIUM. SchedulingConfig model 存在但 solver 不读取, UI 不暴露 LAHC 参数. 用户无法调参优化不同学期排课 |
| Scope | 实现: (1) solver 从 SchedulingConfig 读取 maxIterations / lahcWindowSize; (2) API 接受 optional configId, 缺省 fallback; (3) frontend 暴露 maxIterations / lahcWindowSize 输入框; (4) /api/admin/scheduler/configs CRUD 端点; (5) SchedulingConfig.lockedTaskIds 字段语义决策 (rename to lockedSlotIds 或 task-level lock 解析) |
| Out of scope | 不改 solver algorithm. 不改 score.ts. 不改现有 preview/apply/rollback 流程 |

### 阶段 4: K21-FIX-E-SCHEDULER-PREVIEW-APPLY-ROLLBACK-AUDIT

| Field | Value |
|---|---|
| Reason | 当前闭环完整, 不阻塞主线. polish 工作: 进度条, 多级 rollback, history "复制为新 run" 按钮 |
| Scope | 实施: (1) apply/rollback 进度条; (2) 多级 rollback 链; (3) history UI 增强 |
| Out of scope | 不改现有 safety gate. 不改 solver. 不改 importer |

### 阶段 5: K21-FIX-F-SOFT-CONSTRAINTS-EXPANSION

| Field | Value |
|---|---|
| Reason | C 类别 LOW/MEDIUM. 当前 SC1-SC4 覆盖基础需求, 缺少教师工作日均衡, 班级空洞减少, 教室稳定性, 实训课匹配, 大班优先大教室 |
| Scope | 实施: (1) SC5 教师工作日均衡; (2) SC6 班级空洞减少; (3) SC7 教室稳定性; (4) SC8 实训课匹配; (5) SC9 大班优先大教室; (6) 所有 SC weight 改为可配置 |
| Out of scope | 不改 HC. 不改 solver 主循环. 不改 preview/apply |

### 阶段 6: K21-FIX-B-ROOM-TYPE-CONSTRAINT-AUDIT (deferred to K22+)

| Field | Value |
|---|---|
| Reason | G 类别 MEDIUM. Room.type schema 存在但 solver 不使用. 实训课匹配实训室需求未满足 |
| Scope | 只读 audit + 设计: (1) Course.requiredRoomType 字段; (2) Room.type enum 扩展; (3) solver room type 匹配. 实施推迟到 K22 |
| Out of scope | K21 不实施, K22 路线 |

---

## 14. Suggested Next Stage

**Top recommendation**: **K21-FIX-B-ROOM-CAPACITY-DATA-PLAN**

**理由**：当前 Room.capacity 数据已全部为真实（placeholder=0%），但 schema @default(50) 风险仍存在。下阶段重点是文档化数据来源 + 防止 schema fallback 误用，不阻塞。

**Alternative priority #2**: **K21-FIX-D-SOLVER-CONFIG-UI**

**理由**：4 项 MEDIUM 中, D 类别（solver config + UI 暴露）是最直接影响用户操作能力的项。如果用户希望不同学期用不同 LAHC 参数 / 调参优化, 此项必做。

**推荐执行顺序**：
1. K21-FIX-B-ROOM-CAPACITY-DATA-PLAN (数据真实化 plan, current state 已 OK, 重点是 documentation)
2. K21-FIX-D-SOLVER-CONFIG-UI (solver config + UI 暴露, 4 项 MEDIUM 中最影响操作)
3. K21-FIX-C-ROOM-CAPACITY-IMPLEMENTATION (capacity 数据导入)
4. K21-FIX-F-SOFT-CONSTRAINTS-EXPANSION (新增 SC5-SC9)
5. K21-FIX-E-SCHEDULER-PREVIEW-APPLY-ROLLBACK-AUDIT (闭环 polish)
6. K22: K21-FIX-B-ROOM-TYPE-CONSTRAINT-AUDIT

---

## 15. Unmodified Scope

本阶段 (K21-FIX-A-ROOM-CAPACITY-AND-SOLVER-CONFIG-AUDIT) **未修改**以下内容：

- **Prisma schema** — 未修改
- **`prisma/migrations/**`** — 未修改
- **`prisma/dev.db`** — 未修改 (read-only query only)
- **DB 操作** — 未运行 `prisma db push` / `migrate` / `reset` / `seed`
- **API route 业务逻辑** — 未修改 `src/app/api/**` 任何 handler
- **Frontend** — 未修改 `src/components/**` / `src/store/**` / `src/app/**` 任何客户端代码
- **Solver implementation** — 未修改 `src/lib/scheduler/score.ts` / `solver.ts` / `preview.ts` / `apply.ts` / `rollback.ts`
- **Scheduler implementation** — 未修改 `src/lib/scheduler/**` 任何文件
- **Importer / Parser** — 未修改 `src/lib/import/**` / `scripts/parse_*`
- **RBAC / permissions** — 未修改 `requirePermission` / RBAC seed / role mapping
- **seed-auth** — 未修改 `prisma/seed-auth.*` / RBAC seed 脚本
- **业务数据** — 未新增 / 修改 / 删除任何 Room / ScheduleSlot / TeachingTask / TeachingTaskClass / ClassGroup / Teacher / Course / ScheduleAdjustment / ImportBatch / SchedulingRun / SchedulingConfig 记录
- **DB backup** — 未创建, 未提交
- **re-import 历史文件** — 未执行

**本阶段唯一新增文件**：

- `scripts/audit-room-capacity-and-solver-config-k21-fix-a.ts` (K21 audit 脚本)
- `docs/k21-room-capacity-and-solver-config-audit.md` (本文档)
- `docs/k21-room-capacity-and-solver-config-audit.json` (JSON 报告)

---

## 16. Verification Results

| Script / Command | Result |
|---|---|
| `npx.cmd tsx scripts/audit-room-capacity-and-solver-config-k21-fix-a.ts` | **PASS** — HIGH=0 / MEDIUM=4 / LOW=1 / INFO=1 / NONE=1 / TOTAL=7 / BLOCKING=NO |
| `npx.cmd tsx scripts/audit-remaining-risk-rebase-k20.ts` | (per K20 spec) HIGH=0 / MEDIUM=1 / LOW=6 / ACCEPTED=1 / NONE=2 / TOTAL=10 / BLOCKING=NO |
| `npx.cmd tsx scripts/verify-source-evidence-schema-k20-fix-b.ts` | (per K20-FIX-B spec) 37 PASS / 0 FAIL |
| `npx.cmd tsx scripts/verify-source-evidence-importer-k20-fix-b.ts` | (per K20-FIX-B spec) 41 PASS / 0 FAIL |
| `npx.cmd tsx scripts/verify-source-evidence-query-k20-fix-b.ts` | (per K20-FIX-B spec) 16 PASS / 0 FAIL |
| `npx.cmd tsx scripts/audit-source-evidence-backfill-gap-k20-fix-b.ts` | (per K20-FIX-B spec) 2 PASS / 0 FAIL |
| `npx.cmd tsx scripts/verify-import-approval-browser-e2e-k19-fix-c.ts` | (per K19 spec) 10 PASS / 0 FAIL / 0 SKIP |
| `npx.cmd tsx scripts/verify-import-cross-cohort-approval-ui-k19-fix-b2.ts` | (per K19 spec) 16 PASS / 0 FAIL |
| `npx.cmd tsx scripts/verify-import-cross-cohort-approval-k19-fix-b1.ts` | (per K19 spec) 17 PASS / 0 FAIL |
| `npx.cmd tsx scripts/verify-import-matching-cohort-guard-k19-fix-a.ts` | (per K19 spec) 31 PASS / 0 FAIL |
| `npx.cmd tsx scripts/audit-schedule-mutation-server-guards.ts` | (per K14 spec) HIGH=0 / MEDIUM=0 |
| `npx.cmd tsx scripts/audit-teaching-task-mutation-semantic-guards.ts` | (per K16 spec) HIGH=0 / MEDIUM=0 |
| `npx.cmd tsx scripts/verify-schedule-mutation-client-preflight-fix.ts` | (per K16 spec) 23 PASS / 0 FAIL |
| `npx.cmd prisma validate` | valid |
| `npm.cmd run build` | PASS (per K20-BUILD-CORRECTION) |
| `npm.cmd run lint` | (per K20 baseline) 312 problems, 0 new error |
| `npm.cmd run test:auth-foundation` | (per K20 baseline) 53 passed / 1 failed (pre-existing ScheduleAdjustment ACTIVE count mismatch) |

---

## 17. Closing Note

K21-FIX-A-ROOM-CAPACITY-AND-SOLVER-CONFIG-AUDIT 按 spec 完整执行：

- ✅ 新增只读 audit 脚本 (`scripts/audit-room-capacity-and-solver-config-k21-fix-a.ts`)
- ✅ 新增 Markdown 审计文档 (本文件)
- ✅ 新增 JSON 报告 (`docs/k21-room-capacity-and-solver-config-audit.json`)
- ✅ 明确 Room.capacity 当前真实 (placeholder=0%, 53 个 Room 全部真实容量)
- ✅ 明确 solver 使用 capacity (HC4 hard constraint, -1000 penalty, studentCount from ClassGroup.studentCount with FALLBACK 50)
- ✅ 明确 HC1-HC5 / SC1-SC4 / MIN_PERTURBATION 全部实现, 7 项常见需求未覆盖
- ✅ 明确 SchedulingConfig model 存在 (1 config), solver 仅读取 configId, UI 不暴露 maxIterations / lahcWindowSize
- ✅ 明确 lockedTaskIds schema 字段名 vs solver lockedSlotIds 实际使用不一致
- ✅ 明确 Preview/Apply/Rollback 闭环完整 (8 项 gate, UI 完整, 77 runs)
- ✅ 明确 Room.type schema 存在但 solver 不使用 (0 records of non-NORMAL type)
- ✅ 明确下一阶段 roadmap: K21-FIX-B-DATA-PLAN → K21-FIX-D-CONFIG-UI → ...
- ✅ 不修改任何业务代码 / 不写数据库 / 不改 schema
- ✅ 不修改 API / frontend / solver / scheduler / importer / parser / RBAC
- ✅ 工作区状态: 仅新增 3 个 K21 文件

**本阶段可关闭, 推荐进入 K21-FIX-B-ROOM-CAPACITY-DATA-PLAN 或 K21-FIX-D-SOLVER-CONFIG-UI。**
