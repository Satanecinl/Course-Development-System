# 高校排课系统 — AI 架构师交接报告

> 生成日期：2026-05-29
> 项目路径：`C:\Users\Satanecinl\Desktop\Course Development System\my-app`
> 框架：Next.js 16.2.6 (Turbopack) + Prisma 5.22 + SQLite + React 19

---

## 1. 项目目录结构

```
my-app/
├── data/                           # 外部数据文件（班级人数、教室容量 CSV）
├── docs/                           # 项目文档（本报告、开发指南、评估报告）
├── prisma/
│   ├── schema.prisma               # 数据库模型定义（251 行，20 个模型）
│   ├── migrations/                 # 3 次迁移（init + course_remark + capacity_fields）
│   ├── dev.db                      # SQLite 开发数据库
│   ├── dev.db.backup-*             # 7 个历史备份（按时间戳命名）
│   └── backups/                    # JSON 备份（排课调整数据）
├── scripts/
│   ├── *.py                        # 5 个 Python 脚本（Word 解析、数据清洗）
│   ├── *.ts                        # 60 个 TypeScript 脚本（测试、种子、审计）
│   ├── test-auth-helper.ts         # 认证测试辅助函数（核心基础设施）
│   ├── seed-auth.ts                # RBAC 种子数据
│   └── f2-verify-screenshots/      # UI 验证截图（22 张 PNG）
├── src/
│   ├── app/                        # Next.js App Router 页面
│   │   ├── (auth)/login/           # 登录页
│   │   ├── 403/                    # 无权限页
│   │   ├── admin/                  # 管理后台（5 个子页面）
│   │   ├── api/                    # API 路由（30 个路由文件）
│   │   ├── dashboard/              # 排课看板（拖拽式）
│   │   ├── data/                   # 普通用户数据页
│   │   └── page.tsx                # 首页（重定向）
│   ├── components/                 # React 组件
│   │   ├── admin-db/               # 管理后台 CRUD 组件（5 个）
│   │   ├── layout/                 # 布局组件（header/sidebar/protected-shell）
│   │   ├── ui/                     # UI 基础组件（shadcn，10 个）
│   │   ├── schedule-*.tsx          # 排课相关组件（6 个）
│   │   ├── edit-task-dialog.tsx    # 教学任务编辑弹窗
│   │   └── import-batch-history.tsx # 导入批次历史
│   ├── lib/                        # 核心业务逻辑
│   │   ├── auth/                   # 认证与权限系统（11 个文件）
│   │   ├── import/                 # 数据导入管道（5 个文件）
│   │   ├── schedule/               # 排课调整逻辑（3 个文件）
│   │   ├── scheduler/              # 自动排课引擎（7 个文件）
│   │   ├── admin-db/               # 管理后台工具（5 个文件）
│   │   ├── conflict.ts             # 周次冲突检测
│   │   ├── conflict-check.ts       # 服务端冲突检查
│   │   ├── prisma.ts               # Prisma 单例
│   │   └── utils.ts                # 通用工具函数
│   └── store/
│       └── scheduleStore.ts        # Zustand 状态管理
├── .env                            # 环境变量（DATABASE_URL, AUTH_COOKIE_SECRET）
├── CLAUDE.md                       # AI 开发指南（核心文档）
├── AGENTS.md                       # Agent 协作规范
└── package.json                    # 依赖声明
```

---

## 2. 数据库模型（Prisma Schema）

```prisma
generator client {
  provider = "prisma-client-js"
}

datasource db {
  provider = "sqlite"
  url      = env("DATABASE_URL")
}

// ─── 核心业务模型 ─────────────────────────────────────────────

model ClassGroup {
  id           Int                  @id @default(autoincrement())
  name         String               @unique
  studentCount Int?
  advisorName  String?
  advisorPhone String?
  taskClasses  TeachingTaskClass[]
  createdAt    DateTime             @default(now())
  updatedAt    DateTime             @updatedAt
}

model Teacher {
  id           Int            @id @default(autoincrement())
  name         String         @unique
  tasks        TeachingTask[]
  createdAt    DateTime       @default(now())
  updatedAt    DateTime       @updatedAt
}

model Course {
  id        Int            @id @default(autoincrement())
  name      String         @unique
  tasks     TeachingTask[]
  createdAt DateTime       @default(now())
  updatedAt DateTime       @updatedAt
}

model Room {
  id              Int                   @id @default(autoincrement())
  name            String                @unique
  building        String?
  capacity        Int                   @default(50)
  type            String                @default("NORMAL")
  slots           ScheduleSlot[]
  adjustments     ScheduleAdjustment[]
  availabilities  RoomAvailability[]
  createdAt       DateTime              @default(now())
  updatedAt       DateTime              @updatedAt
}

model TeachingTask {
  id              Int                  @id @default(autoincrement())
  courseId        Int
  course          Course               @relation(fields: [courseId], references: [id])
  teacherId       Int?
  teacher         Teacher?             @relation(fields: [teacherId], references: [id])
  weekType        String               @default("ALL")
  startWeek       Int                  @default(1)
  endWeek         Int                  @default(16)
  remark          String?
  importBatchId   Int?
  importBatch     ImportBatch?         @relation(fields: [importBatchId], references: [id])
  scheduleSlots   ScheduleSlot[]
  taskClasses     TeachingTaskClass[]
  createdAt       DateTime             @default(now())
  updatedAt       DateTime             @updatedAt
}

model ScheduleSlot {
  id             Int                  @id @default(autoincrement())
  teachingTaskId Int
  teachingTask   TeachingTask         @relation(fields: [teachingTaskId], references: [id])
  roomId        Int?
  room           Room?                @relation(fields: [roomId], references: [id])
  dayOfWeek      Int
  slotIndex      Int
  importBatchId  Int?
  importBatch    ImportBatch?         @relation(fields: [importBatchId], references: [id])
  adjustments    ScheduleAdjustment[]
  createdAt      DateTime             @default(now())
  updatedAt      DateTime             @updatedAt
}

model ScheduleAdjustment {
  id             Int           @id @default(autoincrement())
  type           String
  week           Int
  targetWeek     Int?
  originalSlotId Int
  originalSlot   ScheduleSlot  @relation(fields: [originalSlotId], references: [id], onDelete: Cascade)
  newDayOfWeek   Int?
  newSlotIndex   Int?
  newRoomId      Int?
  newRoom        Room?         @relation(fields: [newRoomId], references: [id])
  reason         String?
  status         String        @default("ACTIVE")
  createdAt      DateTime      @default(now())
  updatedAt      DateTime      @updatedAt
}

model TeachingTaskClass {
  id             Int          @id @default(autoincrement())
  teachingTaskId Int
  teachingTask   TeachingTask @relation(fields: [teachingTaskId], references: [id])
  classGroupId   Int
  classGroup     ClassGroup   @relation(fields: [classGroupId], references: [id])
  @@unique([teachingTaskId, classGroupId])
}

model ScheduleChangeLog {
  id          Int      @id @default(autoincrement())
  taskId      Int
  oldDay      Int
  oldSlotIndex Int
  oldRoomId   Int?
  newDay      Int
  newSlotIndex Int
  newRoomId   Int?
  reason      String?
  createdAt   DateTime @default(now())
}

model SchedulingConfig {
  id              Int              @id @default(autoincrement())
  name            String
  semesterId      Int?
  maxIterations   Int              @default(10000)
  lahcWindowSize  Int              @default(500)
  lockedTaskIds   String           @default("[]")
  createdAt       DateTime         @default(now())
  runs            SchedulingRun[]
}

model SchedulingRun {
  id              Int              @id @default(autoincrement())
  configId        Int
  config          SchedulingConfig @relation(fields: [configId], references: [id])
  status          String
  hardScore       Int?
  softScore       Int?
  iterations      Int?
  durationMs      Int?
  resultSnapshot  String?
  createdAt       DateTime         @default(now())
}

model RoomAvailability {
  id        Int     @id @default(autoincrement())
  roomId    Int
  room      Room    @relation(fields: [roomId], references: [id])
  dayOfWeek Int
  slotIndex Int
  available Boolean @default(true)
  reason    String?
  @@unique([roomId, dayOfWeek, slotIndex])
}

model ImportBatch {
  id               Int      @id @default(autoincrement())
  filename         String
  originalFilePath String?
  parsedJsonPath   String?
  statsJson        String?
  qualityJson      String?
  warningsJson     String?
  status           String   @default("pending")
  strategy         String?
  recordCount      Int      @default(0)
  createdTaskCount Int?
  createdSlotCount Int?
  errorMessage     String?
  confirmedAt      DateTime?
  rolledBackAt     DateTime?
  createdAt        DateTime @default(now())
  updatedAt        DateTime @updatedAt
  teachingTasks    TeachingTask[]
  scheduleSlots    ScheduleSlot[]
}

// ─── Auth / RBAC Models ─────────────────────────────────────────

model User {
  id           Int       @id @default(autoincrement())
  username     String    @unique
  displayName  String
  passwordHash String
  isActive     Boolean   @default(true)
  createdAt    DateTime  @default(now())
  updatedAt    DateTime  @updatedAt
  userRoles    UserRole[]
  sessions     Session[]
}

model Role {
  id          Int       @id @default(autoincrement())
  name        String    @unique
  description String?
  createdAt   DateTime  @default(now())
  updatedAt   DateTime  @updatedAt
  userRoles        UserRole[]
  rolePermissions  RolePermission[]
}

model Permission {
  id          Int       @id @default(autoincrement())
  key         String    @unique
  description String?
  createdAt   DateTime  @default(now())
  rolePermissions RolePermission[]
}

model UserRole {
  id        Int      @id @default(autoincrement())
  userId    Int
  roleId    Int
  createdAt DateTime @default(now())
  user User @relation(fields: [userId], references: [id], onDelete: Cascade)
  role Role @relation(fields: [roleId], references: [id], onDelete: Cascade)
  @@unique([userId, roleId])
}

model RolePermission {
  id           Int      @id @default(autoincrement())
  roleId       Int
  permissionId Int
  createdAt    DateTime @default(now())
  role       Role       @relation(fields: [roleId], references: [id], onDelete: Cascade)
  permission Permission @relation(fields: [permissionId], references: [id], onDelete: Cascade)
  @@unique([roleId, permissionId])
}

model Session {
  id           Int       @id @default(autoincrement())
  userId       Int
  tokenHash    String    @unique
  expiresAt    DateTime
  revokedAt    DateTime?
  createdAt    DateTime  @default(now())
  user User @relation(fields: [userId], references: [id], onDelete: Cascade)
}
```

---

## 3. 核心技术栈与版本

| 分类 | 技术 | 版本 |
|------|------|------|
| 框架 | Next.js | 16.2.6 |
| 构建 | Turbopack | (内置) |
| 前端 | React / React DOM | 19.2.4 |
| ORM | Prisma Client | 5.22.0 |
| 数据库 | SQLite | (文件) |
| 状态管理 | Zustand | 5.0.13 |
| 拖拽 | @dnd-kit/core | 6.3.1 |
| UI 组件 | shadcn | 4.8.0 |
| CSS | Tailwind CSS | 4.x |
| 密码哈希 | @node-rs/argon2 | 2.0.2 |
| Excel 导出 | exceljs | 4.4.0 |
| 图标 | lucide-react | 1.16.0 |
| 语言 | TypeScript | 5.x |
| 脚本运行 | tsx | 4.22.3 |
| Python | python-docx | (用于 Word 解析) |

---

## 4. API 路由清单

### 4.1 公共 API（无权限）

| 路由 | 方法 | 用途 |
|------|------|------|
| `/api/auth/login` | POST | 用户登录，返回 session cookie + auth_claims cookie |
| `/api/auth/logout` | POST | 用户登出，清除 session |

### 4.2 管理员 API — 用户管理 (`users:manage`)

| 路由 | 方法 | 用途 |
|------|------|------|
| `/api/admin/users` | GET | 获取用户列表（含角色，无密码） |
| `/api/admin/users` | POST | 创建用户（自动绑定 USER 角色） |
| `/api/admin/users/[id]/status` | PATCH | 启用/禁用用户（防止禁用最后一个 ADMIN） |
| `/api/admin/users/[id]/roles` | PATCH | 更新用户角色（防重复，防移除最后 ADMIN） |
| `/api/admin/users/[id]/password` | PATCH | 重置密码（自动撤销所有 session） |
| `/api/admin/roles` | GET | 获取所有角色列表 |

### 4.3 管理员 API — 数据导入 (`import:manage`)

| 路由 | 方法 | 用途 |
|------|------|------|
| `/api/admin/import/parse` | POST | 上传 .docx 文件，运行 Python 解析器，创建 pending 批次 |
| `/api/admin/import/confirm` | POST | 确认导入（支持 dryRun 模式） |
| `/api/admin/import/rollback` | POST | 回滚已确认的导入批次 |
| `/api/admin/import/batches` | GET | 获取所有导入批次列表 |
| `/api/admin/import/batches/[id]` | GET | 获取单个批次详情 |
| `/api/admin/import/batches/[id]/abandon` | POST | 放弃卡住的批次 |

### 4.4 管理员 API — 主数据 CRUD

| 路由 | 方法 | 权限 | 用途 |
|------|------|------|------|
| `/api/admin/[model]` | GET | `data:read` | 通用模型查询（ClassGroup/Teacher/Course/Room） |
| `/api/admin/[model]` | POST | `data:write` | 通用模型创建 |
| `/api/admin/[model]` | PUT | `data:write` | 通用模型更新 |
| `/api/admin/[model]` | DELETE | `data:write` | 通用模型删除 |

### 4.5 排课 API

| 路由 | 方法 | 权限 | 用途 |
|------|------|------|------|
| `/api/schedule` | GET | `schedule:view` | 获取排课数据（支持按周次、教师/班级/教室筛选，支持调整应用） |
| `/api/schedule-slot` | POST | `data:write` | 创建排课时段 |
| `/api/schedule-slot/[id]` | PUT | `data:write` | 更新排课时段（含冲突检测） |
| `/api/conflict-check` | POST | `schedule:view` | 冲突检测（教室/教师/班级/容量） |
| `/api/schedule-adjustments` | GET | `schedule:view` | 获取排课调整列表 |
| `/api/schedule-adjustments` | POST | `schedule:adjust` | 创建排课调整（调课/换教室/跨周调课） |
| `/api/schedule-adjustments/dry-run` | POST | `schedule:adjust` | 调整干跑（冲突预检） |
| `/api/schedule-adjustments/[id]/void` | POST | `schedule:adjust` | 撤销调整 |

### 4.6 数据查看与导出 API

| 路由 | 方法 | 权限 | 用途 |
|------|------|------|------|
| `/api/data/summary` | GET | `data:read` | 数据统计概览 |
| `/api/data/teaching-tasks` | GET | `data:read` | 教学任务列表 |
| `/api/data/schedule-slots` | GET | `data:read` | 排课时段列表 |
| `/api/export/excel` | GET/HEAD | `data:export` | Excel 导出（HEAD 用于权限探测） |
| `/api/entity-list` | GET | `data:read` | 实体下拉列表（用于 UI 选择器） |

### 4.7 辅助 API

| 路由 | 方法 | 权限 | 用途 |
|------|------|------|------|
| `/api/class-groups` | GET | `data:read` | 班级列表 |
| `/api/teachers` | GET/POST | `data:read`/`data:write` | 教师列表/创建 |
| `/api/courses` | POST | `data:write` | 创建课程 |
| `/api/rooms` | GET | `data:read` | 教室列表 |
| `/api/teaching-task` | POST | `data:write` | 创建教学任务 |
| `/api/teaching-task/[id]` | PUT | `data:write` | 更新教学任务 |

---

## 5. 前端页面清单

| 路由 | 文件 | 权限 | 功能 |
|------|------|------|------|
| `/` | `src/app/page.tsx` | 公共 | 首页（重定向到 login 或 dashboard） |
| `/login` | `src/app/(auth)/login/page.tsx` | 公共 | 登录页面 |
| `/403` | `src/app/403/page.tsx` | 公共 | 无权限提示页 |
| `/dashboard` | `src/app/dashboard/page.tsx` | `schedule:view` | **排课看板** — 拖拽式课表网格，支持按周次/教师/班级/教室筛选，支持调课弹窗 |
| `/data` | `src/app/data/page.tsx` | `data:read` | **普通用户数据页** — 统计概览、教学任务表、排课时段表、导出按钮（需 data:export） |
| `/admin/db` | `src/app/admin/db/page.tsx` | `data:write` | **管理后台** — ClassGroup/Teacher/Course/Room/TeachingTask/ScheduleSlot CRUD |
| `/admin/import` | `src/app/admin/import/page.tsx` | `import:manage` | 导入管理页（placeholder） |
| `/admin/users` | `src/app/admin/users/page.tsx` | `users:manage` | **用户管理** — 用户列表、创建、启用/禁用、角色分配、密码重置 |
| `/admin/diagnostics` | `src/app/admin/diagnostics/page.tsx` | `diagnostics:view` | 诊断工具（placeholder） |
| `/admin/settings` | `src/app/admin/settings/page.tsx` | `settings:manage` | 系统设置（placeholder） |

---

## 6. 核心业务组件

| 组件 | 路径 | 功能 |
|------|------|------|
| `schedule-grid.tsx` | `src/components/` | 排课看板主网格，@dnd-kit 拖拽实现 |
| `schedule-card.tsx` | `src/components/` | 单个课程卡片（显示课程名、教师、教室、周次） |
| `schedule-sidebar.tsx` | `src/components/` | 筛选侧边栏（班级/教师/教室切换） |
| `edit-task-dialog.tsx` | `src/components/` | 教学任务编辑弹窗 |
| `schedule-adjustment-dialog.tsx` | `src/components/` | 排课调整弹窗（调课/换教室/跨周调课，含干跑） |
| `schedule-import-dialog.tsx` | `src/components/` | 数据导入弹窗 |
| `import-batch-history.tsx` | `src/components/` | 导入批次历史列表 |
| `protected-shell.tsx` | `src/components/layout/` | 权限保护外壳（Server Component，注入 AuthUser） |
| `app-header.tsx` | `src/components/layout/` | 顶部导航栏（用户信息、登出） |
| `app-sidebar.tsx` | `src/components/layout/` | 侧边导航栏（菜单项按权限过滤） |
| `admin-data-table.tsx` | `src/components/admin-db/` | 管理后台通用数据表格 |
| `admin-sidebar.tsx` | `src/components/admin-db/` | 管理后台侧边栏（模型切换） |
| `admin-toolbar.tsx` | `src/components/admin-db/` | 管理后台工具栏（搜索、新增） |
| `teaching-task-dialog.tsx` | `src/components/admin-db/` | 教学任务编辑弹窗（管理后台版） |
| `schedule-slot-dialog.tsx` | `src/components/admin-db/` | 排课时段编辑弹窗（管理后台版） |

---

## 7. 自动排课算法（Scheduler）

### 7.1 开发进度

| 阶段 | 内容 | 状态 |
|------|------|------|
| Phase A | 数据加载 (`data-loader.ts`) | ✅ 完成 |
| Phase B | 状态/移动/评分 (`types.ts`, `score.ts`) | ✅ 完成 |
| Phase B+ | 诊断详情 (`diagnostics.ts`, `capacity.ts`) | ✅ 完成 |
| Phase C | LAHC 求解器 (`solver.ts`) | ✅ 完成 |
| Phase D | API 集成 / 持久化 | ❌ 未开始 |

### 7.2 算法核心

- **求解器类型**：LAHC (Late Acceptance Hill Climbing)
- **配置参数**：`maxIterations` (默认 10000), `lahcWindowSize` (默认 500), `lockedSlotIds` (锁定不可移动的时段)
- **硬约束 (HC1-HC5)**：教室冲突、教师冲突、班级冲突、容量不足、教室可用性
- **软约束 (SC1-SC4)**：同日同课程、教师连续课、班级午间休息、教室分散度
- **移动策略**：随机选 slot → 随机新时间+教室 → 计算 delta 分数 → LAHC 判定
- **容量感知**：预计算每个 task 的合格教室列表（按容量升序），优先分配小教室

### 7.3 当前状态

- 求解器可运行，但**仍有 165 个硬约束冲突**（源数据质量问题）
- 未实现 API 端点（无 `/api/scheduler/run`）
- 未实现结果持久化（求解结果不写回数据库）
- `SchedulingConfig` 和 `SchedulingRun` 模型已建好，等待 Phase D 集成

---

## 8. 核心算法与脚本

### 8.1 Python 脚本（数据解析管道）

| 脚本 | 用途 |
|------|------|
| `parse_schedule.py` | 读取 Word .docx 课表，调用 parse_cell 解析，输出 JSON |
| `parse_cell.py` | 核心单元格解析器 — 房间锚点反向拆分、合班处理、鬼空格移除、周次约束 |
| `diagnose_cells.py` | 诊断脏数据样本 |
| `create_mock_data.py` | 创建模拟数据 |
| `build_teacher_whitelist.py` | 构建教师白名单 |

### 8.2 TypeScript 脚本（测试与运维）

| 分类 | 脚本 | 用途 |
|------|------|------|
| **认证基础** | `test-auth-foundation.ts` | 52 项认证基础测试 |
| | `test-auth-helper.ts` | 测试辅助函数（createAdminCookie, fetchJsonAsAdmin 等） |
| | `seed-auth.ts` | RBAC 种子数据（3 角色 + 10 权限） |
| **H2 系列** | `test-h2b-login.ts` | 登录流程测试（50 项） |
| | `test-h2c-middleware.ts` | 中间件权限测试（69 项） |
| | `test-h2d-layout-sidebar.ts` | 布局侧边栏测试（70 项） |
| | `test-h2e-api-permissions.ts` | API 权限测试（84 项） |
| **H3 系列** | `test-h3a-user-management.ts` | 用户管理测试（31 项） |
| | `test-h3b-user-role-assignment.ts` | 角色分配测试（25 项） |
| | `test-h3c-password-reset.ts` | 密码重置测试（20 项） |
| | `test-h3d-user-data-read.ts` | 数据读取测试（40 项） |
| | `test-h3e-data-export-permission.ts` | 数据导出权限测试（19 项） |
| **审计** | `audit-api-permissions.ts` | API 权限覆盖审计（30 项） |
| | `audit-confirmed-import.ts` | 已确认导入审计 |
| | `audit-import-batches.ts` | 导入批次审计 |
| | `audit-import-coverage.ts` | 导入覆盖率审计 |
| **导入** | `confirm-import-once.ts` | 执行真实导入（需 CONFIRM_IMPORT=1） |
| | `test-confirm-import-dry-run.ts` | 导入干跑测试（10 项不变量检查） |
| | `test-confirm-import-transaction-rollback.ts` | 事务回滚测试 |
| | `test-confirm-api-guards.ts` | API 防护测试 |
| | `test-import-quality.ts` | 质量回归测试 |
| **排课调整** | `test-schedule-adjustment.ts` | 排课调整基础测试 |
| | `test-schedule-adjustment-api-e2e.ts` | API 端到端测试 |
| | `test-schedule-adjustment-cross-week.ts` | 跨周调课测试 |
| | `test-schedule-adjustment-final-acceptance.ts` | 最终验收测试 |
| **G0 修复** | `g0fixb-import-0420.ts` | 0420 版本数据导入 |
| | `g0fixb-verify-database.ts` | 数据库验证 |
| | `g0fixb-verify-dashboard.ts` | 看板验证 |
| **排课引擎** | `test-solver.ts` | 求解器测试 |
| | `test-capacity.ts` | 容量诊断测试 |
| | `test-diagnostics.ts` | 评分诊断测试 |
| | `test-data-loader.ts` | 数据加载测试 |
| **其他** | `test-abandon-import-batch.ts` | 放弃批次测试 |
| | `test-rollback-dry-run.ts` | 回滚干跑测试 |
| | `test-rollback-transaction-rollback.ts` | 回滚事务测试 |
| | `test-g0-parser-guards.ts` | 解析器防护测试 |

---

## 9. 认证与权限系统（RBAC）

### 9.1 架构

```
请求 → middleware.ts (Edge Runtime, Web Crypto)
         ↓ 读取 auth_claims cookie (HMAC 签名)
         ↓ 路由权限检查 (route-permissions.ts)
         ↓
       API Route → requirePermission() (Node.js Runtime)
         ↓ 读取 session_token cookie
         ↓ 查询 Session 表 → User → Roles → Permissions
         ↓ 最终授权
```

### 9.2 角色与权限矩阵

| 权限 | ADMIN | USER | DATA_EXPORTER |
|------|:-----:|:----:|:-------------:|
| schedule:view | ✅ | ✅ | ❌ |
| schedule:adjust | ✅ | ❌ | ❌ |
| data:read | ✅ | ✅ | ✅ |
| data:write | ✅ | ❌ | ❌ |
| data:delete | ✅ | ❌ | ❌ |
| data:export | ✅ | ❌ | ✅ |
| import:manage | ✅ | ❌ | ❌ |
| users:manage | ✅ | ❌ | ❌ |
| settings:manage | ✅ | ❌ | ❌ |
| diagnostics:view | ✅ | ❌ | ❌ |

### 9.3 关键文件

| 文件 | 用途 |
|------|------|
| `src/middleware.ts` | Edge Runtime 路由保护（Web Crypto HMAC） |
| `src/lib/auth/claims-edge.ts` | Edge 安全的 claims 签名/验证 |
| `src/lib/auth/claims.ts` | Node.js claims 工具 |
| `src/lib/auth/session.ts` | Session CRUD（创建/查询/撤销/清理） |
| `src/lib/auth/crypto.ts` | 密码哈希（argon2）、token 生成、HMAC 签名 |
| `src/lib/auth/require-permission.ts` | API 路由权限守卫 |
| `src/lib/auth/route-permissions.ts` | 路由权限映射表 |
| `src/lib/auth/current-user.ts` | 获取当前用户（从 session） |
| `src/lib/auth/permissions.ts` | 权限检查工具函数 |
| `src/lib/auth/navigation.ts` | 登录后默认重定向逻辑 |
| `src/lib/auth/types.ts` | 类型定义（AuthUser, PermissionKey, ROLES） |
| `src/lib/auth/constants.ts` | 常量（session 时长、cookie 名、默认密码） |

---

## 10. 数据导入管道

### 10.1 流程

```
Word .docx → [Python parse_schedule.py] → output.json
    → [POST /api/admin/import/parse] → pending ImportBatch + 文件存储
    → [质量检查 / 干跑] → 确认/放弃
    → [POST /api/admin/import/confirm] → 原子写入（pending→confirming→confirmed/failed）
```

### 10.2 关键设计

- **原子导入**：`pending→confirming` 通过 `updateMany({ where: { status: 'pending' } })` 防止并发
- **事务保护**：所有写入在 Prisma 事务内，失败自动回滚
- **空值安全**：`teacherId=null`（体育无教师）、`roomId=null`（校外实训无教室）不创建假实体
- **合班处理**：字符子序列模糊匹配（如 `森`+`防` → `森林草原防火技术1班`）
- **鬼空格移除**：`re.sub(r'(?<=[一-龥])\s+(?=[一-龥])', '', text)` — 去除 Word 中文间空格

---

## 11. 当前数据库状态

| 模型 | 记录数 |
|------|--------|
| ClassGroup | 36 |
| Teacher | 84 |
| Course | 104 |
| Room | 53 |
| TeachingTask | 308 |
| ScheduleSlot | 440 |
| ScheduleAdjustment | 37 |
| ImportBatch | 31 |
| User | 15 |
| Role | 3 |
| Permission | 10 |
| Session | 574 |

---

## 12. 构建健康度

### 12.1 `npm run build` 结果

```
✓ Compiled successfully in 2.1s
✓ TypeScript check passed
✓ Generating static pages (35/35)
```

**警告（非阻塞）：**

1. **Workspace root 推断警告**：检测到多个 lockfile，Next.js 选择了 `C:\Users\Satanecinl\package-lock.json` 作为根。可通过设置 `turbopack.root` 消除。
2. **Middleware 废弃警告**：Next.js 16 建议用 `proxy` 替代 `middleware`。当前功能正常，但需关注未来版本兼容。
3. **NFT 列表警告**：`importer.ts` 中有 `process.cwd()` 等文件系统操作导致 Turbopack 追踪了整个项目。仅影响构建优化，不影响运行。

### 12.2 代码质量扫描

**console.error 分布**（15 处，均在 catch 块中，属正常错误日志）：

| 文件 | 数量 |
|------|------|
| API 路由 (`src/app/api/`) | 13 |
| `src/lib/auth/require-permission.ts` | 1 |
| `src/store/scheduleStore.ts` | 1 |

**TODO/FIXME**：0 处（代码中无遗留 TODO）

---

## 13. 已知问题与技术债

### 13.1 高优先级

| 编号 | 问题 | 影响 | 建议 |
|------|------|------|------|
| K1 | **自动排课未集成 API** | LAHC 求解器已完成但无 API 端点，无法从前端触发 | 实现 Phase D：`/api/scheduler/run` + 结果持久化 |
| K2 | **求解器仍有 165 个硬冲突** | 源数据质量问题导致排课无法完全无冲突 | 需清洗源数据或增加求解器迭代次数 |
| K3 | **Middleware 废弃** | Next.js 16 已将 middleware 标记为 deprecated，建议迁移到 proxy | 评估迁移成本，当前功能不受影响 |

### 13.2 中优先级

| 编号 | 问题 | 影响 | 建议 |
|------|------|------|------|
| K4 | **多个 placeholder 页面** | `/admin/import`、`/admin/diagnostics`、`/admin/settings` 只有占位 UI | 按需实现真实功能 |
| K5 | **Session 清理无定时任务** | 574 个 session 记录可能包含大量过期数据 | 添加 cron job 或启动时清理 |
| K6 | **NFT 列表警告** | `importer.ts` 的 `process.cwd()` 导致构建追踪整个项目 | 将路径操作改为静态引用 |
| K7 | **Turbopack 缓存** | 开发时偶发 HMR 缓存过期，需重启 dev server | 已记录在 DEV-RUNBOOK.md |

### 13.3 低优先级

| 编号 | 问题 | 影响 | 建议 |
|------|------|------|------|
| K8 | **无 git 提交记录** | master 分支无任何 commit，无法追溯历史 | 建议初始化 git 提交 |
| K9 | **workspace root 警告** | 多个 lockfile 导致 Next.js 推断警告 | 设置 `turbopack.root` 或删除多余 lockfile |
| K10 | **dev.db 备份堆积** | 7 个备份文件占用空间 | 清理旧备份 |

---

## 14. 开发阶段回顾

| 阶段 | 内容 | 状态 | 关键成果 |
|------|------|------|----------|
| G0 | 数据修复 | ✅ 完成 | 0420 版本数据清洗、导入验证 |
| F1 | 排课调整 | ✅ 完成 | 调课/换教室/跨周调课 + 干跑 + 冲突检测 |
| F2 | 调整验收 | ✅ 完成 | UI 验证、截图存档 |
| H2 | 认证与 RBAC | ✅ 完成 | 完整认证系统 + 10 权限 + 3 角色 |
| I0 | 基础设施加固 | ✅ 完成 | Dev Runbook、测试 Helper 收口、权限开发规范 |
| H3 | 用户管理 | ✅ 完成 | 用户 CRUD、角色分配、密码重置、数据读取/导出权限 |
| H3-E | 数据导出权限 | ✅ 完成 | DATA_EXPORTER 角色、19/19 测试通过 |

---

## 15. 核心亮点与技术债总结

### 核心亮点

1. **完整的认证与权限系统**：从 Edge Runtime 中间件到 API 路由守卫，实现了端到端的 RBAC 保护。3 个角色、10 个细粒度权限、30 个 API 路由全覆盖。HMAC 签名的 claims cookie + 数据库 session 双重验证，安全性高。

2. **健壮的数据导入管道**：Python 解析 → JSON → API 导入，支持干跑、事务回滚、原子状态机（pending→confirming→confirmed/failed）。空值安全、合班模糊匹配、鬼空格移除等脏数据处理成熟。

3. **拖拽式排课看板**：@dnd-kit 实现的课表网格，支持按周次/教师/班级/教室筛选，支持实时冲突检测和排课调整（调课/换教室/跨周）。

4. **LAHC 自动排课引擎**：Phase A-C 已完成，包含完整的评分体系（5 硬约束 + 4 软约束）、容量感知、冲突聚焦优化。

### 技术债

1. **自动排课未落地**：LAHC 引擎完成但无 API 集成，求解结果不持久化，前端无法触发自动排课。

2. **Middleware 迁移风险**：Next.js 16 已废弃 middleware，当前实现依赖 Edge Runtime Web Crypto，需评估迁移到 proxy 的成本。

3. **无版本控制历史**：master 分支无 commit，无法追溯代码变更历史，建议尽快初始化 git。

4. **Session 积压**：574 个 session 记录无自动清理机制，长期运行会占用数据库空间。

---

## 16. 下一步建议

### 优先级 1：自动排课 API 集成（Phase D）

- 实现 `POST /api/scheduler/run`：接收配置参数，调用 LAHC 求解器，返回结果
- 实现结果持久化：将最优解写入 ScheduleSlot 表
- 实现前端触发：在 `/admin/diagnostics` 或 `/dashboard` 添加"自动排课"按钮
- 实现 `SchedulingRun` 记录：保存每次运行的分数、迭代次数、耗时

### 优先级 2：数据质量治理

- 分析 165 个硬冲突的根因（教室不足？教师冲突？班级冲突？）
- 实现数据清洗工具：在 `/admin/import` 页面添加数据质量报告
- 增加源数据校验：解析时检测重复分配、容量不足等问题

### 优先级 3：Session 生命周期管理

- 实现启动时自动清理过期 session（`cleanupExpiredSessions()` 已有，需调用）
- 考虑添加 session 数量上限（每用户最多 N 个活跃 session）
- 实现 session 续期（活跃用户自动延长过期时间）

---

## 17. 快速启动指南

```bash
# 1. 安装依赖
npm install

# 2. 环境变量（.env 已配置）
DATABASE_URL="file:./dev.db"
AUTH_COOKIE_SECRET="your-secret-here"

# 3. 数据库同步
npx prisma db push

# 4. 种子数据
npx tsx scripts/seed-auth.ts        # RBAC 种子
npx tsx scripts/seed_db.ts          # 业务数据种子

# 5. 启动开发服务器
npm run dev

# 6. 运行测试
npm run test:auth-foundation         # 认证基础
npm run test:h2e-api-permissions     # API 权限
npm run test:h3a-user-management     # 用户管理

# 7. 构建检查
npm run build
```

---

> **报告生成完毕。** 此报告基于项目实际文件系统和代码扫描生成，可直接发送给下一位 AI 架构师。
