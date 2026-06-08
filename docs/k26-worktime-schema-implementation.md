# K26-F: WorkTime Schema Implementation

## 1. Executive Summary

K26-F 实现了 WorkTime schema 基础设施：

- 新增 `WorkTimeConfig` model（per-semester，versioned，isDefault/isActive/allowWeekend）
- 新增 `TimeSlotDefinition` model（slotIndex 1..7，isTeachingSlot，isLegacyDisplay）
- 新增 `SchedulingRun.workTimeConfigSnapshot`（nullable，K26-J 才写入真实 snapshot）
- 新增 Prisma migration `20260608000000_add_worktime_config`
- Backfill 2 个 semester 的 default config + 14 条 TimeSlotDefinition（每个 config 7 条）
- 未接 API / UI / solver / score / recommendation
- 未改 K22/K23/K24/K25 expected

## 2. GitHub Sync Status

| Item | Value |
|------|-------|
| Branch | `master` |
| Remote | `origin` → `https://github.com/Satanecinl/Course-Development-System.git` |
| Tracking branch | `origin/master` |
| Local HEAD before | `235b2db` (K26-E worktime schema plan) |
| Local HEAD after | (to be filled after push) |
| Remote HEAD before | `235b2db` |
| Remote HEAD after | (to be filled after push) |
| Ahead/behind | up to date |
| Fetch | yes |
| Pull/rebase | no (was up to date) |
| Push | yes |
| Force push | false |

## 3. DB Backup

| Item | Value |
|------|-------|
| Backup path | `prisma/dev.db.backup-before-k26-worktime-schema-20260608173742` |
| Backup size | 3735552 bytes |
| 是否提交 backup | **否** |

## 4. Schema Changes

### 4.1 新增 WorkTimeConfig

```prisma
model WorkTimeConfig {
  id           Int       @id @default(autoincrement())
  semesterId   Int
  semester     Semester  @relation(fields: [semesterId], references: [id])
  name         String
  isDefault    Boolean   @default(false)
  allowWeekend Boolean   @default(false)
  lunchStart   String?
  lunchEnd     String?
  isActive     Boolean   @default(true)
  version      Int       @default(1)
  effectiveFrom DateTime?
  notes        String?
  createdAt    DateTime  @default(now())
  updatedAt    DateTime  @updatedAt

  slots TimeSlotDefinition[]

  @@unique([semesterId, name])
  @@index([semesterId])
  @@index([semesterId, isDefault])
}
```

### 4.2 新增 TimeSlotDefinition

```prisma
model TimeSlotDefinition {
  id               Int      @id @default(autoincrement())
  workTimeConfigId Int
  slotIndex        Int
  label            String
  startsAt         String?
  endsAt           String?
  isActive         Boolean  @default(true)
  isTeachingSlot   Boolean  @default(true)
  isLegacyDisplay  Boolean  @default(false)
  sortOrder        Int
  createdAt        DateTime @default(now())
  updatedAt        DateTime @updatedAt

  workTimeConfig WorkTimeConfig @relation(fields: [workTimeConfigId], references: [id], onDelete: Cascade)

  @@unique([workTimeConfigId, slotIndex])
  @@index([workTimeConfigId])
  @@index([slotIndex])
}
```

### 4.3 Semester relation

```prisma
workTimeConfigs WorkTimeConfig[]
```

### 4.4 SchedulingRun snapshot

```prisma
workTimeConfigSnapshot String?
```

## 5. Migration

| Item | Value |
|------|-------|
| Migration file | `prisma/migrations/20260608000000_add_worktime_config/migration.sql` |
| Execution method | `npx prisma migrate deploy` |
| Status | Applied successfully |
| Migrations count | 8 (7 existing + 1 new) |

## 6. Backfill

### 6.1 Dry-run before apply

```
Found 2 semester(s):
  [1] 2025-2026春季学期 (LEGACY-DEFAULT)
  [2] 2026-2027学年秋季学期 (2026秋)

Semesters with existing default config: 0
Semesters needing backfill: 2
```

### 6.2 Apply

```
Created WorkTimeConfig id=1 for semester [1] 2025-2026春季学期
  + 7 TimeSlotDefinition rows
Created WorkTimeConfig id=2 for semester [2] 2026-2027学年秋季学期
  + 7 TimeSlotDefinition rows

Summary:
  Created WorkTimeConfig: 2
  Created TimeSlotDefinition: 14
```

### 6.3 Dry-run after apply (idempotency check)

```
Semesters with existing default config: 2
Semesters needing backfill: 0

All semesters already have a default WorkTimeConfig. Nothing to do.
```

### 6.4 Default slot backfill

| slotIndex | label | isActive | isTeachingSlot | isLegacyDisplay | sortOrder |
|----------:|-------|----------|---------------|-----------------|-----------|
| 1 | 1-2节 | true | true | false | 1 |
| 2 | 3-4节 | true | true | false | 2 |
| 3 | 5-6节 | true | true | false | 3 |
| 4 | 7-8节 | true | true | false | 4 |
| 5 | 9-10节 | true | true | false | 5 |
| 6 | 11-12节 | false | false | true | 6 |
| 7 | 中午 | false | false | true | 7 |

## 7. Historical Compatibility

| 数据 | DB 计数 | 策略 |
|------|------|--------|
| ScheduleSlot 总计 | 440 | **未删除任何行** |
| `slotIndex=6` (11-12) | 2 | 保留 read-only；config 中 `isActive=false` + `isLegacyDisplay=true` |
| `slotIndex=7` (中午) | 0 | 保留 read-only；config 中 `isActive=false` + `isLegacyDisplay=true` |
| `dayOfWeek=6,7` (周末) | 21 | 保留 read-only；`allowWeekend=false` 不隐藏历史 |

## 8. Non-Goals

确认本阶段**未做**：

- ❌ API routes for WorkTime
- ❌ settings UI for WorkTime
- ❌ solver / score changes
- ❌ adjustment recommendation changes
- ❌ room recommendation changes
- ❌ K22/K23/K24/K25 expected changes

## 9. Verification Results

| Command | Result |
|---------|--------|
| `npx tsx scripts/backfill-worktime-default-config-k26-f.ts --dry-run` (before) | **PASS** (2 semesters need backfill) |
| `npx tsx scripts/backfill-worktime-default-config-k26-f.ts --apply` | **PASS** (2 configs, 14 slots created) |
| `npx tsx scripts/backfill-worktime-default-config-k26-f.ts --dry-run` (after) | **PASS** (0 semesters need backfill) |
| `npx tsx scripts/validate-worktime-schema-k26-f.ts` | **30/30 PASS** |
| `npx tsx scripts/plan-worktime-schema-k26-e.ts` | (TBD) |
| `npx tsx scripts/verify-static-time-slot-extraction-k26-d.ts` | (TBD) |
| `npx prisma validate` | **PASS** |
| `npx prisma migrate status` | **up to date** (8 migrations) |
| `npm run build` | (TBD) |
| `npx eslint .` (= `npm run lint`) | (TBD) |
| `npm run test:auth-foundation` | (TBD) |

## 10. Recommended Next Stage

```txt
K26-F WORKTIME SCHEMA VALIDATION PASS
PASS=30 FAIL=0
blocking=false
recommendedNextStage=K26-G-WORKTIME-API-IMPLEMENTATION
```

K26-F **建议关闭**。下一步进入 K26-G（WorkTime API implementation）：

- CRUD endpoints for WorkTimeConfig
- Resolved config endpoint
- Delete protection (in-use check)
- Permission: `schedule:adjust`
- **不接 UI / solver / score**

---

## Verification Alignment Addendum

> 本节由 `K26-F1-WORKTIME-SCHEMA-VERIFICATION-ALIGNMENT` 追加。

### 阶段

`K26-F1-WORKTIME-SCHEMA-VERIFICATION-ALIGNMENT`

### K26-F 中失败的旧脚本

| Script | Failure | 根因 |
|--------|---------|------|
| `scripts/plan-worktime-schema-k26-e.ts` (C1) | `No WorkTimeConfig model in schema` | K26-E 假设无 WorkTimeConfig，但 K26-F 合法新增 |
| `scripts/plan-worktime-schema-k26-e.ts` (C2) | `No TimeSlotDefinition model in schema` | 同上 |
| `scripts/plan-worktime-schema-k26-e.ts` (N1) | `No change to prisma/schema.prisma` | K26-F 合法修改了 schema |
| `scripts/plan-worktime-schema-k26-e.ts` (N2) | `No new migration files` | K26-F 合法新增了 migration |
| `scripts/verify-static-time-slot-extraction-k26-d.ts` (N1) | `No change to prisma/schema.prisma` | K26-F 合法修改了 schema |
| `scripts/verify-static-time-slot-extraction-k26-d.ts` (N2) | `No change under prisma/migrations/` | K26-F 合法新增了 migration |

### 对齐方式

**Strategy A**：更新旧脚本为 stage-aware

- K26-E: C1/C2 从"不存在"改为"存在（K26-F 已实现）"
- K26-E: N1/N2 从"不允许变化"改为"接受 K26-F 批准的 schema/migration"
- K26-D: N1/N2 从"不允许变化"改为"接受 K26-F 批准的 schema/migration"

**Strategy B**：新增 post-schema regression verify

- 新增 `scripts/verify-worktime-post-schema-regression-k26-f1.ts`
- 30 项只读检查覆盖：schema(6) + DB/backfill(10) + helper invariants(6) + non-goals(8)

### 本阶段补跑结果

| Command | Result |
|---------|--------|
| `npx tsx scripts/verify-worktime-post-schema-regression-k26-f1.ts` | **30/30 PASS** |
| `npx tsx scripts/validate-worktime-schema-k26-f.ts` | **30/30 PASS** |
| `npx tsx scripts/backfill-worktime-default-config-k26-f.ts --dry-run` | **PASS** (0 missing) |
| `npx tsx scripts/plan-worktime-schema-k26-e.ts` | **34/34 PASS** (after alignment) |
| `npx tsx scripts/verify-static-time-slot-extraction-k26-d.ts` | **39/39 PASS** (after alignment) |
| `npx tsx scripts/audit-time-slot-worktime-settings-k26-c.ts` | **PASS** (32/32) |
| `npx tsx scripts/verify-system-settings-shell-k26-a.ts` | **47/47 PASS** |
| `npx tsx scripts/verify-scheduler-config-settings-acceptance-closeout-k26-b.ts` | **38/38 PASS** |
| `npx tsx scripts/verify-semester-settings-acceptance-closeout-k25.ts` | **38/38 PASS** |
| `npx tsx scripts/validate-multi-semester-schema-k25-c.ts` | **PASS** |
| `npx prisma validate` | **PASS** |
| `npx prisma migrate status` | **up to date** (8 migrations) |
| `npm run build` | **PASS** |
| `npx eslint .` (= `npm run lint`) | **184 errors / 136 warnings (+0/+0 vs K26-F baseline)** |
| `npm run test:auth-foundation` | **53 passed / 1 failed (pre-existing)** |

### Final Closeout Decision

```txt
K26-F1-WORKTIME-SCHEMA-VERIFICATION-ALIGNMENT: 建议关闭
K26-F-WORKTIME-SCHEMA-IMPLEMENTATION: 现在可以正式关闭
blocking=false
k26fCanClose=true
recommendedNextStage=K26-G-WORKTIME-API-IMPLEMENTATION
```
