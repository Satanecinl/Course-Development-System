# K26-E: WorkTime / TimeSlotConfig Schema Plan

## 1. Executive Summary

本阶段是 **schema 方案计划**，不实现。

- K26-D 已完成静态节次 helper 抽取（active 1-5 / legacy 6/7 / preferred 1-5 / weekend 6/7）。
- K26-C 已识别直接实现系统设置 UI 的 BLOCKERS（SC3/SC7 硬编码 + solver 无 filter + K22 expected 不变）。
- 本阶段比较 Option A / B / C，给出推荐方案与后续阶段拆分。
- **推荐**：**Hybrid**——短期保留 Option A（K26-D 现状）作为安全基线；中长期推进 Option C（独立 WorkTime / TimeSlotConfig 表）+ 显式 semester scope + version + snapshot into SchedulingRun.resultSnapshot。Option B（SystemSetting JSON）作为过渡方案，仅在短期用户强烈需要 UI 可编辑时考虑。
- **禁止**直接做系统设置 UI；先做 schema plan（K26-E，本阶段），再 schema 实现（K26-F），再 API（K26-G），再 UI（K26-H），最后 solver/score 接入（K26-I/K26-J）。

## 2. GitHub Sync Status

| Item | Value |
|------|-------|
| Branch | `master` |
| Remote | `origin` → `https://github.com/Satanecinl/Course-Development-System.git` |
| Tracking branch | `origin/master` |
| Local HEAD before | `6482a8a` (K26-D1 verification complete) |
| Local HEAD after | (to be filled after push) |
| Remote HEAD before | `6482a8a` |
| Remote HEAD after | (to be filled after push) |
| Ahead/behind | up to date |
| Fetch | yes |
| Pull/rebase | no (was up to date) |
| Push | yes |
| Force push | false |

## 3. Current State (K26-C / K26-D)

| Item | Status | Source |
|------|--------|--------|
| `slotIndex` semantics | 1-based | K26-C |
| Active teaching slots | `[1, 2, 3, 4, 5]` (1-2节..9-10节) | K26-D helper |
| Legacy display slots | `6 = 11-12节`, `7 = 中午` | K26-D helper |
| Preferred day values | `[1, 2, 3, 4, 5]` | K26-D helper |
| Weekend day values | `[6, 7]` | K26-D helper |
| DB legacy slotIndex=6 | 2 records | K26-C snapshot |
| DB weekend dayOfWeek IN (6,7) | 21 records | K26-C snapshot |
| `Semester` model | exists, NOT NULL FK target for many models | K25-C |
| `SchedulingConfig` | semester-scoped (K25-C) | K25-C |
| `ScheduleSlot`, `TeachingTask`, `ScheduleAdjustment`, `SchedulingRun`, `ImportBatch`, `ClassGroup` | all semester-scoped (K25-C) | K25-C |
| SC3 hardcode | `slotIndex >= 5` triggers -1 penalty | K26-C / score.ts |
| SC7 hardcode | `dayOfWeek >= 6` triggers -15 penalty | K26-C / score.ts |
| Solver candidate filter | none | K26-C |
| K22 score harness expected | fixed at K22 baseline; any score change breaks it | K22 / K26-C |
| Settings UI for WorkTime | not implemented | K26-A/B/C |

## 4. Option Comparison

### 4.1 Option A: Static helper only (K26-D 现状)

| 维度 | 评价 |
|------|------|
| 优点 | 零 DB 改动；零 migration；零 solver 改动；K22 expected 不变；DB 历史数据全保留；与 K26-D 完全兼容 |
| 缺点 | 用户**无法**在系统设置 UI 真正编辑节次与作息；只能修改代码常量；不同学期不能配置不同作息 |
| 类型安全 | 高（编译期 TypeScript） |
| Schema 变更 | 无 |
| Versioning | 无（依赖代码版本） |
| Rollback | 简单（改回 helper） |
| Runtime validation | helper 自带 |
| API | 无 |
| UI | 无 |
| Solver/score 接入 | 无（保持 1-5 / 周末-15 硬编码） |
| K22 影响 | 零 |
| 适合度 | **短期安全状态**，**不足以满足最终用户目标** |

### 4.2 Option B: SystemSetting JSON

| 维度 | 评价 |
|------|------|
| 优点 | migration 极小（单表）；可支持多类系统设置（不只 WorkTime）；admin 可 UI 编辑 |
| 缺点 | 类型安全弱（JSON 字符串）；版本管理复杂；key 命名散落；schema 演化管理靠应用层；不与 `Semester` 强耦合 |
| Schema 变更 | 1 个新表 + JSON 字段 |
| Versioning | 需自建 schema 字段（如 `version` / `effectiveFrom`） |
| Rollback | 简单（删表）但**历史快照**丢失 |
| Runtime validation | 需 Zod / 自写 schema |
| API | 通用 CRUD（key-value） |
| UI | 通用表单（弱类型提示） |
| Solver/score 接入 | 需引入 `resolveSetting(semesterId, key)` 路径；score 阈值需要按 key 解析；K22 expected 受影响 |
| K22 影响 | **必须更新** |
| 适合度 | 适合**通用配置**；**WorkTime 是结构化数据**，强行 JSON 化会导致 UI 复杂、solver 解析慢、Zod schema 复用成本高 |

### 4.3 Option C: 独立 WorkTime / TimeSlotConfig 表

| 维度 | 评价 |
|------|------|
| 优点 | 强类型；per-semester 自然；可版本化；UI 可生成；可快照到 `SchedulingRun.resultSnapshot`；与 `ScheduleSlot` 解耦 |
| 缺点 | migration 较大（2 张新表 + backfill + index）；solver 需读 config；K22 expected 必变 |
| Schema 变更 | 2 张新表：`WorkTimeConfig` + `TimeSlotDefinition` |
| Versioning | 通过 `version` 字段 + `effectiveFrom` 字段实现 |
| Rollback | 简单（删两张表；不破坏 `ScheduleSlot`） |
| Runtime validation | Prisma 类型 + 应用层 validator |
| API | 专用 CRUD（`/api/admin/worktime-configs`） |
| UI | 专用面板（节次列表、启用/禁用、start/end、allowWeekend、legacy 警告） |
| Solver/score 接入 | 直接读 `WorkTimeConfig` 解析 active slots / weekend policy；SC3/SC7 阈值参数化可走 JSON config 字段或额外表 |
| K22 影响 | **必须更新**（但**可分版本**：K22-baseline 保留旧 score 路径；K26-J 后 K22 切到新 config 路径） |
| 适合度 | **最适合 WorkTime 这种结构化配置** |

### 4.4 推荐

**Hybrid**：

- **当前 (K26-D 已完成)**：Option A 静态 helper 作为**安全基线**。
- **过渡 (K26-F / G / H)**：Option C 独立表 + 完整 CRUD + UI，但**不接 solver**——即 K26-F/G/H 不改 `score.ts`。
- **最终 (K26-I / J)**：Option C + solver/score 接入 + K22 expected 分版本更新。

**Option B 不推荐作为长期方案**；可作为 K26-F 之前的临时实验（如果 admin 强烈需要某种 key-value 设置），但不应作为 WorkTime 长期形态。

## 5. Recommended Schema

候选 schema（仅 plan，K26-F 实施前需进一步细化）：

```prisma
// K26-F candidate schema
model WorkTimeConfig {
  id            Int      @id @default(autoincrement())
  semesterId    Int
  semester      Semester @relation(fields: [semesterId], references: [id])
  name          String
  isDefault     Boolean  @default(false)
  allowWeekend  Boolean  @default(false)
  lunchStart    String?  // "12:00"
  lunchEnd      String?  // "13:30"
  isActive      Boolean  @default(true)
  version       Int      @default(1)     // K26-F: bump on edit
  effectiveFrom DateTime?               // K26-F: when this version becomes effective
  notes         String?
  createdAt     DateTime @default(now())
  updatedAt     DateTime @updatedAt

  slots TimeSlotDefinition[]

  @@unique([semesterId, name])
  @@index([semesterId, isDefault])
  @@index([semesterId, isActive])
}

model TimeSlotDefinition {
  id               Int      @id @default(autoincrement())
  workTimeConfigId Int
  workTimeConfig   WorkTimeConfig @relation(fields: [workTimeConfigId], references: [id], onDelete: Cascade)
  slotIndex        Int       // 1..7
  label            String    // "1-2节" / "11-12节" / "中午"
  startsAt         String?   // "08:00"
  endsAt           String?   // "09:50"
  isActive         Boolean  @default(true)
  isTeachingSlot   Boolean  @default(true)   // false for lunch break
  isLegacyDisplay  Boolean  @default(false)  // true for 6/7
  sortOrder        Int      @default(0)

  @@unique([workTimeConfigId, slotIndex])
  @@index([workTimeConfigId, isActive])
}
```

候选 candidate schema 关键点：

- `WorkTimeConfig` per-semester (`semesterId NOT NULL`)
- `isDefault` flag — 每个学期可有 1 个 default config（应用层 unique 约束，DB 层用 `@@index`）
- `isActive` — soft delete
- `version` + `effectiveFrom` — versioning
- `TimeSlotDefinition` 含 `isActive` / `isTeachingSlot` / `isLegacyDisplay` — 区分 active vs. legacy
- `onDelete: Cascade` 从 `WorkTimeConfig` → `TimeSlotDefinition`
- 保留历史快照可能需要 `resultSnapshot` JSON 字段（在 `SchedulingRun` 上已有，可直接复用）

## 6. Semester Scope and Defaults

| 决策 | 选择 | 理由 |
|------|------|------|
| Per-semester or global? | **Per-semester** | 不同学期可能用不同作息；SchedulingConfig 也是 per-semester；与 K25-C 一致 |
| Default config 数量 | 1 per semester | 应用层 unique 约束：切换 default 时把原 default 改 `isDefault=false` |
| Fallback when no config | **硬编码 baseline** (active=1-5, allowWeekend=false, legacy display 6/7) | K26-D helper 直接作 fallback；新代码 `resolveCurrentWorkTime(semesterId)` 应在找不到 config 时返回 helper 等价对象 |
| Versioning | `version Int` + `effectiveFrom DateTime?` | 每次编辑 bump version；新 version 可选 `effectiveFrom=now` 或未来某周；UI 显示当前 + 历史 version |
| Active version count per semester | 1 (最新) + 历史 N 个 | UI 默认显示最新；可手动查看历史；run snapshot 锁定历史 version |

## 7. Historical Data Compatibility

### 7.1 历史 `slotIndex=6 / 7`

| 维度 | 策略 |
|------|------|
| DB 保留 | **保留** (read-only 路径不变) |
| 新建 `slotIndex=6 / 7` | 走 admin 特权入口（`ScheduleSlotDialog` / `admin-db-content`），可继续创建；不允许走 plan recommendation / solver |
| Plan recommendation 是否包含 | **不包含**（K26-D helper 已限 1-5） |
| Solver candidate generation | 未来 K26-J：可配置 `includeLegacySlots` flag；默认 false |
| Conflict-check | 接受任意 `slotIndex`（读 row data，无 range 假设） |
| Score | SC3 仅对 `slotIndex >= 5` 触发（包括 6/7）；未来 K26-J 应参数化 |
| UI display | 保留 `11-12节` / `中午` label（`formatTeachingSlotLabel` 兼容） |

### 7.2 历史周末数据 (`dayOfWeek=6, 7`)

| 维度 | 策略 |
|------|------|
| DB 保留 | **保留**（21 条历史记录不动） |
| `allowWeekend=false` 时是否隐藏 | **不隐藏**（历史数据 read-only 路径保留） |
| Display | 继续显示 `周六` / `周日`（`DAYS` map 已含） |
| Score | SC7 `dayOfWeek >= 6` 触发 -15；未来 K26-J 可参数化（`weekendPenalty` 字段） |
| 调课到周末 | 默认不推荐；`includeWeekend=true` 显式 opt-in 后才进搜索空间 |
| Solver 候选生成 | K26-J 可加 weekend filter；当前不过滤 |

### 7.3 migration / backfill / rollback

| 步骤 | 策略 |
|------|------|
| 备份 | 实施 K26-F 前必须 `cp prisma/dev.db prisma/dev.db.backup-before-k26-f-YYYYMMDDHHMMSS` |
| 创建 default WorkTimeConfig | K26-F 实施时为每个 semester 创建 1 个 default config（active=1-5, allowWeekend=false, slots 1-7 全部写入，6/7 标记 `isLegacyDisplay=true`） |
| 激活默认 | K26-F 实施脚本中 `isDefault=true, isActive=true, version=1` |
| 历史数据修复 | **无**——ScheduleSlot 不需要 backfill，因为 `slotIndex/dayOfWeek` 是历史事实 |
| snapshot into existing SchedulingRun | K26-F 不强制回填（历史 `resultSnapshot` 不变）；新 run 自动 snapshot |
| rollback 策略 | 删 2 张新表 + 删 dev.db 改回 backup；FK 不破坏（`ScheduleSlot` 不引用 `WorkTimeConfig`） |
| 字段顺序 | backfill 必须按 `semesterId` 分组，每组按 sortOrder 写 TimeSlotDefinition |

## 8. Score / Solver / K22 Harness Impact

### 8.1 SC3 / SC7 参数化

| Constraint | Current hardcode | Future config field | Migration risk | K22 harness impact |
|------------|------------------|---------------------|----------------|---------------------|
| SC3 extreme time | `slotIndex >= 5` triggers -1 | `WorkTimeConfig.lateSlotIndex` (default=5) + `WorkTimeConfig.lateSlotPenalty` (default=-1) | MEDIUM：delta score 实现需参数化；K22 需新增 fixture | **HIGH**：必须分版本更新 K22 expected (K22-baseline 保留旧; K22-after-k26-j 切换新) |
| SC7 weekend | `dayOfWeek >= 6` triggers -15 | `WorkTimeConfig.allowWeekend` (default=false) + `WorkTimeConfig.weekendPenalty` (default=-15) | MEDIUM：delta score 实现需读 config | **HIGH**：同上 |
| Hard filter vs. soft penalty for weekend | 当前是 soft penalty (-15) | K26-I: 当 `allowWeekend=false`，solver candidate generation 阶段直接过滤周末；SC7 仍作为 score 兜底 | HIGH：solver 行为变更 | **HIGH** |
| Class gap (SC8) | `Math.abs(slotIndex diff)` | 保持现状（与 slotIndex 距离无关） | LOW | LOW |
| Teacher day balance (SC5) | `TEACHING_DAYS = [1..5]` | 保持硬编码（solver scoring 域，不与 UI 共享） | LOW | LOW |

### 8.2 Solver candidate generation 接入

- **K26-J 阶段**：solver 启动时调用 `resolveCurrentWorkTime(semesterId)` 获取 config；生成 candidate 时按 `isActive=true, isTeachingSlot=true` 过滤；周末按 `allowWeekend` 过滤。
- **delta score 路径**：`computeDelta*` 系列函数增加 `workTime` 参数；`applyCandidateChange` 时读取。
- **K22 expected 影响**：所有 score 路径增加 config 注入；K22-after-k26-j 重新生成 expected。

### 8.3 Score breakdown 影响

- `score.ts` 输出的 score breakdown 当前不显示 resolved WorkTime config 引用。K26-J 之后，breakdown 应在 SC3 / SC7 报告行附带"resolved config id / version / snapshot"字段，使人工调参时可回溯当前评分依据。
- `SchedulingRun.resultSnapshot` 已经存在 String 字段；K26-F 实施时新增 `workTimeConfigSnapshot` JSON 字段后，breakdown report 引用此 snapshot id。
- **K26-E 阶段不实施**；该变更属于 K26-J 的 score reporting 子任务。

### 8.3 K22 harness 版本管理

| 阶段 | K22 状态 |
|------|----------|
| 当前 (K26-E) | K22-baseline (K22 expected 在 `scripts/verify-score-regression-harness-k22-c.ts` 等) |
| K26-F / G / H | **不变**（不接 solver） |
| K26-I (recommendation integration) | K22-baseline 仍适用（recommendation 走 `getValidTeachingSlotIndexes()`，与 helper 等价） |
| K26-J (solver/score integration) | **必须新增 K22-after-k26-j fixture**，与 K22-baseline 并存；切换机制：env var 或脚本参数 |

## 9. API Plan (K26-G)

候选 endpoints（K26-G 实施）：

| Method | Path | Permissions | Purpose |
|--------|------|-------------|---------|
| GET | `/api/admin/worktime-configs` | `schedule:adjust` | 列出 configs（支持 `?semesterId=` filter） |
| POST | `/api/admin/worktime-configs` | `schedule:adjust` | 新建 config（含 slots） |
| GET | `/api/admin/worktime-configs/[id]` | `schedule:adjust` | 读取单 config |
| PUT | `/api/admin/worktime-configs/[id]` | `schedule:adjust` | 更新 config（**bump version**） |
| DELETE | `/api/admin/worktime-configs/[id]` | `schedule:adjust` | 删除 config（in-use 时 409） |
| POST | `/api/admin/worktime-configs/[id]/activate` | `schedule:adjust` | 设为 active（同时 deactivate 同 semester 旧 active） |
| POST | `/api/admin/worktime-configs/[id]/set-default` | `schedule:adjust` | 设为 default（同上） |
| GET | `/api/admin/worktime-configs/resolved?semesterId=...` | `schedule:read` | 解析当前 config（含 fallback to helper） |

**Validation**：

- `name` 1-100 字符，每 semester 唯一
- `slotIndex` ∈ [1, 7]
- `label` ≤ 50 字符
- `isTeachingSlot=false` 时 `isActive=true` 仍允许（lunch break 不进 score）
- `isLegacyDisplay=true` 时 `isTeachingSlot=false`
- `version` server-managed
- `effectiveFrom` ≥ `now() - 1 year`（防误输入远古日期）

**Delete protection**：

- 检查 `ScheduleSlot` 不引用 `WorkTimeConfig`（**事实**：当前 schema 不会引用；保护只对 `SchedulingRun.resultSnapshot` 中的 `workTimeConfigId` 引用）
- 检查 `SchedulingRun.resultSnapshot` 含此 `workTimeConfigId` 时返回 409 `WORKTIME_CONFIG_IN_USE`
- 检查 `ScheduleAdjustment.workTimeConfigSnapshotId`（K26-F 可选字段）含此 id 时返回 409

**Semester mismatch**：

- 同一 `WorkTimeConfig` 不能跨学期（`@@unique([semesterId, name])` 强制）
- 创建/更新时 `semesterId` 必须存在
- `set-default` 必须传 `semesterId`，只在同 semester 范围内切换

**Default config fallback**：

- `GET /resolved?semesterId=X`：先查 `isActive=true, isDefault=true`；找不到查 `isActive=true` 最新；再找不到返回 K26-D helper 等价对象（active 1-5, allowWeekend=false, labels 1-7）

**Response shape**：

```json
{
  "id": 1,
  "semesterId": 1,
  "name": "default",
  "isDefault": true,
  "isActive": true,
  "allowWeekend": false,
  "lunchStart": null,
  "lunchEnd": null,
  "version": 1,
  "effectiveFrom": "2026-01-01T00:00:00Z",
  "notes": null,
  "createdAt": "2026-06-08T...",
  "updatedAt": "2026-06-08T...",
  "slots": [
    { "slotIndex": 1, "label": "1-2节", "isActive": true, "isTeachingSlot": true, "isLegacyDisplay": false, "sortOrder": 1, "startsAt": "08:00", "endsAt": "09:50" },
    ...
    { "slotIndex": 6, "label": "11-12节", "isActive": true, "isTeachingSlot": false, "isLegacyDisplay": true, "sortOrder": 6, "startsAt": null, "endsAt": null },
    { "slotIndex": 7, "label": "中午", "isActive": true, "isTeachingSlot": false, "isLegacyDisplay": true, "sortOrder": 7, "startsAt": "12:00", "endsAt": "13:30" }
  ]
}
```

**Config snapshot into SchedulingRun**：

- `SchedulingRun.resultSnapshot`（已存在 String 字段）增加 `workTimeConfigSnapshot` JSON 字段（K26-F 新增字段；migration 添加 nullable column）
- Snapshot 在 `SchedulingRun` 创建时固化 config 内容（即使后续 config 修改，run 的 score/result 仍可重现）

## 10. UI Plan (K26-H)

模块路径：`/admin/settings` → **节次与作息设置**（status: planned, K26-H 上线后改为 ready）

布局（参考 K26-B 的 `SchedulerConfigSettingsPanel`）：

| Section | Content |
|---------|---------|
| Header | 标题"节次与作息设置" + 当前 semester 选择器 + 创建按钮 |
| Info card | 明确列出非目标（不含 solver / score 修改） |
| Config list | 表格：name / isDefault / isActive / allowWeekend / version / effectiveFrom / updatedAt / 操作 |
| Per-config dialog | 名称、是否 default、是否 active、allowWeekend、lunch start/end、节次列表（slotIndex/label/startsAt/endsAt/isTeachingSlot/isLegacyDisplay） |
| Legacy warning | 当 config 含 `isLegacyDisplay=true` slot 时显示警告条 |
| Delete protection | 后端 409 + UI toast |
| Loading / error / empty states | 复用 K26-B 模式 |
| 数据 testid | `k26h-worktime-config-panel`, `k26h-info-card`, `k26h-config-table`, `k26h-create-btn`, `k26h-edit-btn`, `k26h-delete-btn`, `k26h-loading`, `k26h-error`, `k26h-empty` |

**K26-H 实施期间**：

- **不接入 solver**（config 仅展示 + 持久化）
- **不影响 SC3/SC7 硬编码**（仅 doc 写明"修改 config 不影响当前 score"）
- **不影响 K22 expected**

## 11. Migration / Backfill / Rollback Plan

### 11.1 Pre-migration (K26-F)

1. **DB 备份**：`cp prisma/dev.db prisma/dev.db.backup-before-k26-f-$(date +%Y%m%d%H%M%S)`
2. **Schema 文档化**：在 `prisma/migrations/<timestamp>_k26f_worktime_config/` 写明：
   - 新表 1: `WorkTimeConfig`
   - 新表 2: `TimeSlotDefinition`
   - 新字段: `SchedulingRun.workTimeConfigSnapshot` (nullable String, default `null`)
3. **Index 设计**：`@@unique([semesterId, name])`、`@@index([semesterId, isDefault])`、`@@index([semesterId, isActive])`、`@@unique([workTimeConfigId, slotIndex])`

### 11.2 Backfill (K26-F 实施脚本)

```ts
// pseudo-code, K26-F 实施
for (const semester of await prisma.semester.findMany()) {
  const config = await prisma.workTimeConfig.create({
    data: {
      semesterId: semester.id,
      name: 'default',
      isDefault: true,
      isActive: true,
      allowWeekend: false,
      version: 1,
      effectiveFrom: new Date(),
      slots: {
        create: [
          { slotIndex: 1, label: '1-2节', isActive: true, isTeachingSlot: true, isLegacyDisplay: false, sortOrder: 1 },
          { slotIndex: 2, label: '3-4节', isActive: true, isTeachingSlot: true, isLegacyDisplay: false, sortOrder: 2 },
          { slotIndex: 3, label: '5-6节', isActive: true, isTeachingSlot: true, isLegacyDisplay: false, sortOrder: 3 },
          { slotIndex: 4, label: '7-8节', isActive: true, isTeachingSlot: true, isLegacyDisplay: false, sortOrder: 4 },
          { slotIndex: 5, label: '9-10节', isActive: true, isTeachingSlot: true, isLegacyDisplay: false, sortOrder: 5 },
          { slotIndex: 6, label: '11-12节', isActive: true, isTeachingSlot: false, isLegacyDisplay: true, sortOrder: 6 },
          { slotIndex: 7, label: '中午', isActive: true, isTeachingSlot: false, isLegacyDisplay: true, sortOrder: 7 },
        ],
      },
    },
  })
  // Sanity verify: assert exactly 1 default per semester
}
```

### 11.3 Rollback

```bash
# 1. Stop app
# 2. Restore DB
cp prisma/dev.db.backup-before-k26-f-YYYYMMDDHHMMSS prisma/dev.db
# 3. Revert migration (if using migrate dev with down)
npx prisma migrate resolve --rolled-back <migration-name>
# 4. Drop the 2 new tables (if not using migrate)
# 5. Restart app; verify K26-D helper fallback path still works
```

### 11.4 验证

- K26-F 实施后跑：prisma validate / migrate status / K26-D verify (helper unchanged) / K25-C validation (semester FK 一致性) / new K26-F verify script
- K22-baseline 仍 PASS（K26-F 不接 solver）

## 12. Recommended Next Stages

按"先 schema plan，再 schema，再 API，再 UI，再 recommendation 接入，最后 solver 接入"拆分：

| Stage | Stage Name | Scope | K22 expected change? |
|-------|------------|-------|----------------------|
| K26-E | **WorkTime schema plan** (本阶段) | doc + 方案比较 | 否 |
| K26-F | **WorkTime schema implementation** | migration + backfill + validation script | 否 |
| K26-G | **WorkTime API implementation** | CRUD + resolved + delete protection | 否 |
| K26-H | **WorkTime settings UI** | settings center panel | 否 |
| K26-I | **Recommendation integration** | plan / room / preferred day / 调课 接入 config | 否（仍走 helper 等价路径） |
| K26-J | **Solver / score integration** | candidate filter + SC3/SC7 参数化 + snapshot | **是** (新增 K22-after-k26-j fixture) |
| K26-J1 | **Solver/score verification complete** | 补齐 K26-J 验证链 | — |

后续阶段名称可调整，但顺序必须保持：
1. plan → 2. schema → 3. API → 4. UI → 5. recommendation → 6. solver/score

## 13. Non-Goals

确认本阶段**未做**：

- ❌ schema change
- ❌ migration
- ❌ DB 数据修改
- ❌ API 业务语义修改
- ❌ frontend UI 功能（K26-H 才会引入）
- ❌ solver algorithm
- ❌ `score.ts`
- ❌ scheduler preview / apply
- ❌ adjustment recommendation 路径变更
- ❌ room recommendation 路径变更
- ❌ importer / parser
- ❌ RBAC permission model
- ❌ K22 / K23 / K24 / K25 expected
- ❌ WorkTime API
- ❌ WorkTime UI
- ❌ seed
- ❌ 业务数据写入

## 14. Verification Results

| Command | Result |
|---------|--------|
| `npx tsx scripts/plan-worktime-schema-k26-e.ts` | (TBD run at closeout) |
| `npx tsx scripts/verify-static-time-slot-extraction-k26-d.ts` | (TBD run at closeout) |
| `npx tsx scripts/audit-time-slot-worktime-settings-k26-c.ts` | (TBD run at closeout) |
| `npx tsx scripts/verify-system-settings-shell-k26-a.ts` | (TBD run at closeout) |
| `npx tsx scripts/verify-scheduler-config-settings-acceptance-closeout-k26-b.ts` | (TBD run at closeout) |
| `npx tsx scripts/verify-semester-settings-acceptance-closeout-k25.ts` | (TBD run at closeout) |
| `npx tsx scripts/validate-multi-semester-schema-k25-c.ts` | (TBD run at closeout) |
| `npx prisma validate` | (TBD run at closeout) |
| `npx prisma migrate status` | (TBD run at closeout) |
| `npm run build` | (TBD run at closeout) |
| `npx eslint .` (= `npm run lint`) | (TBD run at closeout) |
| `npm run test:auth-foundation` | (TBD run at closeout) |

具体结果以最终 commit 时的 `npx tsx` / `npm run` 输出为准。

## 15. Final Recommendation

```txt
K26-E WORKTIME SCHEMA PLAN VERIFY: PASS
PASS=x FAIL=0
recommendedOption=hybrid (Option A baseline; Option C as long-term design)
blocking=false
recommendedNextStage=K26-F-WORKTIME-SCHEMA-IMPLEMENTATION
K26-F 注: 必须先备份 DB；migration + backfill + validation；不接 solver；不接 UI；不改 K22 expected
仍禁止直接做节次作息 UI；UI 必须等 K26-F/G 完成后再开始（K26-H）
```
