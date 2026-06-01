# K10-SEMESTER-IMPORT-SCOPING-FIX-B

## 1. 阶段名

`K10-SEMESTER-IMPORT-SCOPING-FIX-B`

## 2. 当前背景

Fix-A 完成了 import 主链路 semesterId 线程化，但剩余 3 个 MEDIUM 风险：

1. `ClassGroup.name @unique` 全局唯一，无法支持跨学期同名班级
2. import confirmed guard 全局语义，任意学期 confirmed batch 阻塞其他学期
3. confirm route 对 semesterId 来源不够明确

## 3. 修复目标

- 将 `ClassGroup.name @unique` 改为 `@@unique([semesterId, name])` semester scoped uniqueness
- 修复 importer ClassGroup 查重按 semesterId + name scoped
- 将 confirmed guard 改为 semester scoped
- confirm route 支持 query `?semesterId=X` 并校验 body semesterId 一致性
- 更新验证脚本和审计脚本

## 4. Schema 修改说明

### ClassGroup 变更

```prisma
# 修改前
model ClassGroup {
  name         String              @unique
  semesterId   Int?
  @@index([semesterId])
}

# 修改后
model ClassGroup {
  name         String
  semesterId   Int?
  @@unique([semesterId, name])
  @@index([semesterId])
}
```

- `name @unique` 已移除
- `@@unique([semesterId, name])` 已添加
- `semesterId` 仍为 nullable
- `@@index([semesterId])` 保留

### SQLite nullable unique 兼容行为

SQLite 中 `@@unique([semesterId, name])` 对 `semesterId = NULL` 的行不产生约束（NULL != NULL）。这意味着：
- 已有数据（全部 semesterId=1）受新约束保护
- 未来如有 null semesterId 行，同名不会冲突（符合预期）

## 5. 数据库备份

- 备份路径：`prisma/dev.db.backup-before-k10-import-scoping-fixb-20260601174155`

## 6. ClassGroup 数据预检结果

- 总数：36
- null semesterId 数量：0
- duplicate `(semesterId, name)` 数量：0
- 空 name：0
- 按 semesterId 分布：semesterId=1: 36

## 7. db push / generate 结果

- `npx.cmd prisma format`：成功
- `npx.cmd prisma db push --accept-data-loss`：成功（Prisma 要求此 flag 才能添加 unique 约束，实际无数据丢失）
- `npx.cmd prisma db push`（移除 @unique）：成功
- `npx.cmd prisma generate`：成功

## 8. Importer ClassGroup 查重修复

### executeImportInTransaction

```typescript
// 修改前
const existing = await tx.classGroup.findUnique({ where: { name }, select: { id: true, studentCount: true } })

// 修改后
const existing = await tx.classGroup.findFirst({ where: { semesterId, name }, select: { id: true, studentCount: true } })
```

### confirmImportBatchDryRun

```typescript
// 修改前
prisma.classGroup.findMany({ where: { name: { in: [...classNames] } }, select: { name: true, studentCount: true } })

// 修改后
prisma.classGroup.findMany({ where: { semesterId, name: { in: [...classNames] } }, select: { name: true, studentCount: true } })
```

## 9. Confirmed guard scoped 修复

```typescript
// 修改前
const existingConfirmed = await prisma.importBatch.findFirst({
  where: { id: { not: batchId }, status: { in: ['confirmed', 'confirming'] } },
})

// 修改后
const existingConfirmed = await prisma.importBatch.findFirst({
  where: { id: { not: batchId }, status: { in: ['confirmed', 'confirming'] }, semesterId },
})
```

- 目标学期内仍保持原有 confirmed guard 语义
- 其他学期的 confirmed batch 不再阻塞当前学期

## 10. Confirm route semester 来源策略

```typescript
// 支持 query ?semesterId=X
const { searchParams } = new URL(request.url)
const querySemesterId = searchParams.get('semesterId')
  ? parseInt(searchParams.get('semesterId')!, 10)
  : undefined

const semester = await resolveSchedulerSemester({ semesterId: querySemesterId })

// 若 body 传入 semesterId，校验与 resolved semester 一致
if (body.semesterId != null && body.semesterId !== semester.id) {
  return NextResponse.json(
    { success: false, error: `body semesterId=${body.semesterId} 与目标学期 ${semester.id} 不一致` },
    { status: 409 },
  )
}
```

## 11. Legacy null batch / null ClassGroup 策略

- **Legacy null semesterId batch**：confirm 时自动绑定到目标学期（Fix-A 已实现）
- **Legacy null semesterId ClassGroup**：当前数据无 null semesterId 行。SQLite nullable unique 允许 null 同名不冲突
- **跨学期同名 ClassGroup**：现在支持，受 `@@unique([semesterId, name])` 保护

## 12. 编译修复文件

因 `ClassGroup.name @unique` 移除，以下脚本从 `findUnique({ where: { name } })` 改为 `findFirst`：

- `scripts/diagnose-schedule-import-0420.ts`
- `scripts/g0fixb-verify-database.ts`
- `scripts/diagnose-classgroup-data-quality.ts`
- `scripts/seed_db.ts`（upsert 改为 findFirst + update/create）

## 13. 验证命令和结果

- `npx.cmd prisma format`：通过
- `npx.cmd prisma generate`：通过
- `npx.cmd tsx scripts/verify-import-semester-scoping-fix-b.ts`：24/24 PASS
- `npx.cmd tsx scripts/audit-import-semester-scoping.ts`：0 HIGH, 0 MEDIUM, 1 LOW
- `npm.cmd run build`：通过

## 14. 风险变化

| 阶段 | HIGH | MEDIUM | LOW |
|------|------|--------|-----|
| Fix-A 后 | 0 | 3 | 1 |
| Fix-B 后 | 0 | 0 | 1 |

剩余 LOW：
- K10-IMPORT-LOW-1：Rollback 删除按 importBatchId 而非 semesterId（功能安全，importBatchId 唯一）

## 15. 剩余风险

| 风险 | 严重度 | 说明 |
|------|--------|------|
| Rollback 无 semester 验证 | LOW | importBatchId 唯一保证安全 |
| UI semester selector | 无 | 不在本阶段范围 |
| Importer race window | 无 | 不在本阶段范围 |

## 16. 下一阶段建议

- import validation 阶段
- 考虑 UI semester selector
- 考虑 import 文件 GC
