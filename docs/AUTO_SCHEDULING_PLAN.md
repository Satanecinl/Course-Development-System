# 基于 UniTime/OptaPlanner 思想的自动排课引擎实现 Prompt

## 背景

我们有一个已建成的高校排课系统（Next.js + Prisma + SQLite），目前已完成：
- Word 课程表 → JSON → SQLite 的数据管道（304 条教学任务，449 条排课记录）
- 前端课表展示（按班级/教师/教室视图切换、周次查看、学期管理）
- 冲突检测 API（教室、教师、班级冲突）
- 手动编辑引擎（EditTaskDialog，可修改课程、教师、教室、合班、周次）
- Excel 导出、调课日志（ScheduleChangeLog）

**现在需要实现：自动排课算法引擎。** 借鉴 UniTime 的 CPSolver 和 OptaPlanner 的约束满足思想，用纯 TypeScript 实现，融入现有项目。

---

## 现有 Prisma Schema（关键模型）

```prisma
model ClassGroup {
  id       Int    @id @default(autoincrement())
  name     String @unique
  teachingTaskClasses TeachingTaskClass[]
}

model Teacher {
  id           Int       @id @default(autoincrement())
  name         String    @unique
  teachingTasks TeachingTask[]
}

model Course {
  id           Int       @id @default(autoincrement())
  name         String    @unique
  teachingTasks TeachingTask[]
}

model Room {
  id           Int    @id @default(autoincrement())
  name         String @unique
  building     String?
  capacity     Int?
  scheduleSlots ScheduleSlot[]
}

model TeachingTask {
  id          Int       @id @default(autoincrement())
  courseId    Int
  course      Course    @relation(fields: [courseId], references: [id])
  teacherId   Int?
  teacher     Teacher?  @relation(fields: [teacherId], references: [id])
  roomId      Int?
  room        Room?     @relation(fields: [roomId], references: [id])
  weekType    String    @default("ALL")  // ALL|ODD|EVEN|FIRST_HALF|SECOND_HALF|CUSTOM
  startWeek   Int       @default(1)
  endWeek     Int       @default(16)
  remark      String?
  scheduleSlots ScheduleSlot[]
  teachingTaskClasses TeachingTaskClass[]
  changeLogs  ScheduleChangeLog[]
}

model ScheduleSlot {
  id          Int       @id @default(autoincrement())
  taskId      Int
  task        TeachingTask @relation(fields: [taskId], references: [id])
  roomId      Int?
  room        Room?     @relation(fields: [roomId], references: [id])
  dayOfWeek   Int       // 1-7 (周一到周日)
  slotIndex   Int       // 1-6 (对应第1-2节、3-4节...11-12节)
}

model TeachingTaskClass {
  id          Int       @id @default(autoincrement())
  taskId      Int
  task        TeachingTask @relation(fields: [taskId], references: [id])
  classGroupId Int
  classGroup  ClassGroup @relation(fields: [classGroupId], references: [id])
}

model ScheduleChangeLog {
  id            Int       @id @default(autoincrement())
  taskId        Int
  oldDay        Int
  oldSlotIndex  Int
  oldRoomId     Int?
  newDay        Int
  newSlotIndex  Int
  newRoomId     Int?
  reason        String?
  createdAt     DateTime  @default(now())
}
```

---

## 核心需求：实现自动排课算法

### 1. 约束建模（借鉴 UniTime 的硬约束 + 软约束思想）

#### 硬约束（Hard Constraints）—— 违反任何一条则方案不可行

| 约束 ID | 名称 | 说明 |
|---------|------|------|
| HC1 | 教室时间冲突 | 同一间教室在同一时间段不能安排两门课 |
| HC2 | 教师时间冲突 | 同一位教师在同一时间段不能上两门课 |
| HC3 | 班级时间冲突 | 同一个班级在同一时间段不能有两门课 |
| HC4 | 教室容量 | 教室容量必须 ≥ 上课班级总人数（如有班级人数数据；否则可降级为软约束） |
| HC5 | 课程节次合法性 | slotIndex 必须在 1-6 范围内（对应学校实际节次） |
| HC6 | 教室存在性 | 排课的教室必须真实存在且可用 |

#### 软约束（Soft Constraints）—— 尽量满足，用于评分优化

| 约束 ID | 名称 | 权重 | 说明 |
|---------|------|------|------|
| SC1 | 教师时间偏好 | 10 | 如教师标记某时段不可用（预留扩展） |
| SC2 | 课程分布均匀 | 8 | 同一门课的多个时段应分散在不同天（避免同天连排） |
| SC3 | 班级课程分布 | 7 | 同一班级每天的课程节数尽量均衡 |
| SC4 | 跨校区通勤 | 5 | 同一班级相邻时段的教室应在同一校区/楼栋（复用现有 building 字段） |
| SC5 | 教师工作量均衡 | 3 | 教师每天的课时数尽量均衡 |
| SC6 | 优先保留已有排课 | 15 | 已手动排好的课优先不动（最小扰动原则，借鉴 UniTime 的 perturbation） |

### 2. 算法设计（借鉴 OptaPlanner 的 Construction Heuristic + Local Search）

#### Phase 1：初始解构建（Construction Heuristic）

按以下优先级顺序逐个排课：
1. **约束最多的任务优先排**（班级数多、合班多的任务先排）
2. **可用时间段最少的任务优先排**（如固定了某些时段的任务）
3. 对每个任务，遍历所有合法的 (dayOfWeek, slotIndex, roomId) 组合
4. 选择**冲突最少**的组合（贪心策略）

#### Phase 2：局部搜索优化（Local Search）

使用 **Late Acceptance Hill Climbing (LAHC)** 算法（OptaPlanner 默认的局部搜索策略之一）：

```
score = Σ(违反的硬约束 × 1000) + Σ(违反的软约束 × 权重)
目标：score 最小化（0 表示完美解）
```

迭代过程：
1. 随机选择一个 TeachingTask
2. 尝试将其移动到另一个合法的 (day, slot, room) 组合
3. 计算新方案的 score
4. 如果 score ≤ 历史最优解的 score（Late Acceptance 策略），接受移动
5. 重复 N 次（N 可配置，默认 10000 次迭代或直到收敛）

#### Phase 3：最小扰动（Perturbation Minimization）

如果已有部分手动排课（现有 ScheduleSlot 记录），算法应：
1. 将已有排课标记为"锁定"（locked = true）
2. 优先不动锁定的课程
3. 只在必须时才移动锁定课程（如无法找到合法解）

### 3. 需要新增的 Prisma 模型

```prisma
// 排课任务配置
model SchedulingConfig {
  id              Int     @id @default(autoincrement())
  name            String  // 配置名称，如 "2026春季学期"
  semesterId      Int?    // 关联学期（如有）
  maxIterations   Int     @default(10000)
  lahcWindowSize  Int     @default(500)
  lockedTaskIds   String  // JSON数组，锁定的教学任务ID列表
  createdAt       DateTime @default(now())
}

// 排课运行记录
model SchedulingRun {
  id              Int       @id @default(autoincrement())
  configId        Int
  config          SchedulingConfig @relation(fields: [configId], references: [id])
  status          String    // PENDING|RUNNING|COMPLETED|FAILED
  hardScore       Int?      // 违反的硬约束数（负数=有冲突）
  softScore       Int?      // 软约束得分（越高越好）
  iterations      Int?      // 实际迭代次数
  durationMs      Int?      // 耗时毫秒
  resultSnapshot  String?   // JSON，排课结果快照
  createdAt       DateTime  @default(now())
}

// 教室可用性约束（可选扩展）
model RoomAvailability {
  id          Int     @id @default(autoincrement())
  roomId      Int
  room        Room    @relation(fields: [roomId], references: [id])
  dayOfWeek   Int     // 1-7
  slotIndex   Int     // 1-6
  available   Boolean @default(true)
  reason      String? // 如 "实验室专用"
}
```

### 4. API 设计

#### POST /api/schedule/auto-generate

请求体：
```json
{
  "configId": 1,
  "taskIds": [1, 2, 3],        // 可选，指定要排的任务；不传则排所有未锁定任务
  "dryRun": false               // true=只返回评分不入库；false=排完直接入库
}
```

响应体：
```json
{
  "runId": 42,
  "status": "completed",
  "hardScore": 0,
  "softScore": 856,
  "iterations": 3247,
  "durationMs": 1523,
  "conflicts": [],
  "warnings": ["教师 张旭 周三课时偏多（6节）"],
  "summary": {
    "totalTasks": 304,
    "placed": 304,
    "locked": 12,
    "moved": 292
  }
}
```

#### GET /api/schedule/auto-generate/[runId]

获取排课运行结果详情。

#### POST /api/schedule/auto-generate/preview

预览模式，不入库，返回排课结果 JSON 供前端展示对比。

### 5. 前端需求

#### 5.1 排课控制面板（在 dashboard 页面顶部新增）

- "自动排课" 按钮，点击后弹出配置弹窗
- 配置弹窗内容：
  - 选择排课范围（全部课程 / 指定班级 / 指定教师）
  - 已锁定课程列表（可勾选解锁）
  - 迭代次数设置（高级选项）
  - "开始排课" 和 "预览结果" 两个按钮

#### 5.2 排课结果对比视图

- 左右分栏：左边"排课前"、右边"排课后"
- 高亮显示变动的课程卡片（移动了的标黄色，新增冲突标红色）
- "应用结果" 和 "撤销" 按钮

#### 5.3 排课历史

- 展示 SchedulingRun 列表（时间、评分、耗时）
- 可回滚到某次排课结果

### 6. 实现注意事项

1. **纯 TypeScript 实现**，不依赖 Java 或外部服务
2. **算法模块独立**：`src/lib/scheduler/` 目录下，与 API 和 UI 解耦
3. **可中断**：排课过程支持取消（用户可随时停止迭代）
4. **日志**：迭代过程输出进度日志（每 1000 次迭代报告一次当前分数）
5. **数据安全**：排课前自动备份当前 ScheduleSlot 状态到 SchedulingRun.resultSnapshot
6. **复用现有冲突检测**：`/api/schedule/conflict-check` 的逻辑应提取为共享函数
7. **SQLite 性能**：304 条任务 × 46 间教室 = 约 14000 种组合，完全在内存中计算，无需担心性能
8. **合班处理**：一个 TeachingTask 关联多个 ClassGroup 时，所有班级必须同时有空

### 7. 文件结构建议

```
src/
├── lib/
│   └── scheduler/
│       ├── index.ts              // 导出入口
│       ├── types.ts              // 类型定义（Constraint, Score, SchedulerConfig 等）
│       ├── score.ts              // 评分函数（硬约束 + 软约束评分）
│       ├── constraints/
│       │   ├── hard.ts           // 硬约束实现（HC1-HC6）
│       │   └── soft.ts           // 软约束实现（SC1-SC6）
│       ├── solver.ts             // 核心求解器（Construction Heuristic + LAHC）
│       └── utils.ts              // 工具函数（时间段映射、冲突检查等）
├── app/
│   └── api/
│       └── schedule/
│           └── auto-generate/
│               └── route.ts      // 自动排课 API
└── components/
    ├── scheduling-panel.tsx      // 排课控制面板
    └── scheduling-diff.tsx       // 排课结果对比视图
```

---

## 验收标准

1. `npm run build` 编译通过
2. 对 304 条教学任务执行自动排课，硬约束评分为 0（无冲突）
3. 软约束评分 > 0（有优化效果）
4. 排课结果可在 dashboard 课表中正确展示
5. 已锁定的手动排课在排课后未被移动（除非必要）
6. 排课耗时 < 30 秒（304 条任务规模）
7. 可预览、可回滚
