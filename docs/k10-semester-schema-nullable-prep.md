# K10-SEMESTER-SCHEMA-NULLABLE-PREP — Schema 变更报告

> **状态**: COMPLETE  
> **日期**: 2026-05-31  
> **前置阶段**: K10-SEMESTER-MODEL-DESIGN (commit `635824d`)

---

## 1. Schema 变更摘要

### 新增模型

**Semester** — 学期管理模型

| 字段 | 类型 | 说明 |
|------|------|------|
| `id` | `Int @id @default(autoincrement())` | 主键 |
| `name` | `String` | 学期名称（如 "2026年春季学期"） |
| `code` | `String @unique` | 唯一编码 |
| `academicYear` | `String?` | 学年（如 "2025-2026"） |
| `term` | `String?` | 学期类型（SPRING/FALL） |
| `startsAt` | `DateTime?` | 开始日期 |
| `endsAt` | `DateTime?` | 结束日期 |
| `isActive` | `Boolean @default(false)` | 是否当前活跃学期 |
| `createdAt` | `DateTime @default(now())` | 创建时间 |
| `updatedAt` | `DateTime @updatedAt` | 更新时间 |

### 新增 semesterId 的模型

| 模型 | 新增字段 | 类型 | 有 Index |
|------|---------|------|---------|
| ClassGroup | `semesterId` | `Int?` | ✅ |
| TeachingTask | `semesterId` | `Int?` | ✅ |
| ScheduleSlot | `semesterId` | `Int?` | ✅ |
| ScheduleAdjustment | `semesterId` | `Int?` | ✅ |
| SchedulingRun | `semesterId` | `Int?` | ✅ |
| SchedulingConfig | `semesterId` | `Int?`（已存在，新增 relation） | ✅ |

### 未新增 semesterId 的模型及理由

| 模型 | 理由 |
|------|------|
| Room | 全局共享物理场所，`capacity` 为全局固定参数 |
| Teacher | 全局共享人员字典 |
| Course | 全局共享课程字典 |
| TeachingTaskClass | 纯 join 表，通过 TeachingTask 间接归属 |
| SchedulerRunChange | 通过 SchedulingRun 间接归属 |
| ImportBatch | 设计文档建议加，但本阶段暂不加（后续阶段处理） |
| User / Role / Permission / Session | RBAC 模型，全局共享 |
| RoomAvailability | 全局可用性 |
| ScheduleChangeLog | 全局操作日志 |

---

## 2. 数据库备份

备份路径: `prisma/dev.db.backup-before-semester-nullable-20260531193040`

备份大小: 2,060,288 bytes (与原始 dev.db 一致)

---

## 3. 数据 Count 验证

| 模型 | 变更前 | 变更后 | 状态 |
|------|--------|--------|------|
| Room | 53 | 53 | ✅ |
| Teacher | 84 | 84 | ✅ |
| Course | 104 | 104 | ✅ |
| ClassGroup | 36 | 36 | ✅ |
| TeachingTask | 308 | 308 | ✅ |
| ScheduleSlot | 440 | 440 | ✅ |
| ScheduleAdjustment | 52 | 52 | ✅ |
| SchedulingRun | 73 | 73 | ✅ |
| SchedulerRunChange | 413 | 413 | ✅ |
| SchedulingConfig | 1 | 1 | ✅ |
| ImportBatch | 36 | 36 | ✅ |
| User | 18 | 18 | ✅ |
| TeachingTaskClass | 451 | 451 | ✅ |
| Semester | N/A | 0 | ✅ (新建表) |

**结论**: 无数据丢失，无 backfill。

---

## 4. 验证结果

| 测试 | 结果 |
|------|------|
| `test-semester-schema-nullable.ts` | ✅ 46 passed, 0 failed |
| `test-scheduler-final-safety-regression.ts` | ✅ 54 passed, 0 failed |
| `test-scheduler-seeded-prng.ts` | ✅ 27 passed, 0 failed |
| `npm run build` | ✅ 44 pages generated |
| `audit-semester-model-design.ts` | ✅ model Semester 存在: 是 |

---

## 5. db push 结果

```
npx prisma format → Formatted in 20ms
npx prisma db push → Your database is now in sync. Done in 284ms
```

- 未使用 `--force-reset`
- 未出现数据丢失提示
- Prisma Client 自动生成成功

---

## 6. 风险与下一阶段

### 当前状态

- 所有新增 `semesterId` 均为 `NULL`（未做 backfill）
- data-loader 仍全库加载
- Preview/Apply/Rollback 无 semester 边界
- 无 semester selector UI

### 风险

- 现有数据无 semester 归属，需在后续阶段 backfill
- 无 query scoping，多学期数据共存时可能混淆
- 无 UI selector，用户无法选择学期

### 推荐下一阶段

**K10-SEMESTER-BACKFILL-DEFAULT**

目标：
1. 创建默认 Semester（如 "2026年春季学期"）
2. 将所有现有业务数据绑定到默认 Semester
3. 验证 counts 和关系完整性
4. 仍不做 query scoping / UI selector
