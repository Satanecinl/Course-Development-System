# K26-D: UI / 调课相关调用面扫描 — 审计报告

> **审计者**: opencode
> **分支**: `k26-d-opencode-ui-adjustment-slot-scan`
> **HEAD**: `0e8c94a` (K26-C: time-slot / worktime settings audit)
> **日期**: 2026-06-08
> **范围**: 只读审计，零代码修改

---

## 1. Executive Summary

本次只读审计扫描了 `src/components/**`、`src/app/**`、`src/lib/schedule/**`、`src/lib/**adjustment**`、`src/lib/**recommendation**`、`src/store/**` 等区域中所有与 `slotIndex`、`dayOfWeek`、`TIME_SLOTS`、`SLOT_INDEX_MAP`、`VALID_TEACHING_SLOT_INDEXES`、`weekend`、`preferredDay` 等关键词相关的调用点。

**主要发现**：

1. **K24-A4 统一 helper 已到位**：`src/lib/schedule/time-slots.ts` 导出 `VALID_TEACHING_SLOT_INDEXES = [1,2,3,4,5]`、`getValidTeachingSlotIndexes()`、`isValidTeachingSlotIndex()`、`formatTeachingSlotLabel()`、`getTeachingSlotLabelOptions()`，是 K26-D 推荐的统一源。
2. **plan-recommendations 已使用统一 helper**：`adjustment-plan-recommendations.ts:48` 直接 `import { getValidTeachingSlotIndexes } from './time-slots'`，搜索空间 `DEFAULT_SLOT_INDEXES` 正确限制为 `[1,2,3,4,5]`，不会推荐 `11-12`。
3. **room-recommendations API route 已做边界检查**：`room-recommendations/route.ts:68` 显式拒绝 `targetSlotIndex > 5`。
4. **schedule-adjustment-dialog (调课弹窗) 已使用 `TIME_SLOTS`**，但 `TIME_SLOTS` 来自 `types/schedule.ts` 的 `SLOT_INDEX_MAP`，包含 7 个条目（含 `11-12`/`中午`），不过该弹窗的 `TIME_SLOTS` 仅用于 **显示标签**，实际 slot 选择走的是 plan recommendation API（已限 1-5），**无新推荐风险**。
5. **schedule-grid 仍然渲染全部 7 个 TIME_SLOTS 行**：grid 使用 `TIME_SLOTS.map()` 渲染所有行，包括 `11-12`（slotIndex=6）和 `中午`（slotIndex=7），这是 **display-only** 行为，用于展示历史数据，符合预期。
6. **admin ScheduleSlotDialog 使用 `SLOT_INDEX_MAP` 生成节次下拉**：包含全部 7 项（含 `11-12`/`中午`），这是管理员手动编辑入口，允许创建 legacy slots，符合预期（管理员特权）。
7. **data-content.tsx 的 `SLOT_NAMES` 硬编码为 6 项**（不含 `中午`），用于 display-only，风险低。
8. **adjustments.ts 验证允许 `newSlotIndex` 最大到 6**：`adjustment-plan-recommendations.ts` 的搜索已限 1-5，但 `adjustments.ts:48` 的 dry-run 验证允许 `newSlotIndex` 到 6（不含 7），这是 **向后兼容**（允许对历史 slotIndex=6 的行做调整），风险低。
9. **conflict-check.ts / conflict-rules.ts 的 `getSlotLabel` 硬编码 7 项标签**：仅用于冲突消息中的 label 显示，display-only，风险低。
10. **export excel route 的 `SLOT_LABELS` 硬编码为 6 项**（不含 `中午`）：display-only，风险低。
11. **preferred day 绑定**：plan-recommendations 的 `preferredDayOfWeek` 只接受 1-5（周一到周五），周末（6/7）被 API route 显式拒绝，符合预期。
12. **`DEFAULT_DAYS_WORKING = [1,2,3,4,5]`**、`WEEKEND_DAYS = [6,7]` 在 `adjustment-plan-recommendations.ts` 中正确定义。

**高风险 UI 硬编码**: 无。所有产生新推荐/新写入的路径已限 slotIndex 1-5；display-only 路径保留 legacy labels 符合预期。

---

## 2. Slot Source Inventory

| Area | File | Current slot/day source | Hardcoded? | Should use unified helper? | Risk |
|------|------|------------------------|------------|---------------------------|------|
| Schedule Grid | `src/components/schedule-grid.tsx` | `TIME_SLOTS` (from `@/store/scheduleStore` → `@/types/schedule`) | No — re-exports `SLOT_INDEX_MAP` (7 items) | **Display-only**: No (renders all rows including legacy `11-12`/`中午` for historical data display). No new writes. | Low |
| Dashboard | `src/app/dashboard/dashboard-content.tsx` | `DAYS`, `TIME_SLOTS` from `@/types/schedule` | No — display lookups only | **Display-only**: No | Low |
| 调课弹窗 | `src/components/schedule-adjustment-dialog.tsx` | `DAYS`, `TIME_SLOTS` from `@/types/schedule` | No — display labels + plan API delegation | **Display-only for labels**: No. Plan API already uses `getValidTeachingSlotIndexes()`. No new recommendation of `11-12`. | Low |
| Plan Recommendation (server) | `src/lib/schedule/adjustment-plan-recommendations.ts` | `import { getValidTeachingSlotIndexes } from './time-slots'` | No — uses unified helper | ✅ Already uses unified helper | **None** |
| Plan Recommendation API route | `src/app/api/schedule-adjustments/plan-recommendations/route.ts` | Delegates to `findAdjustmentPlanRecommendations` | N/A — validated by helper | **Already correct** | **None** |
| Room Recommendation (server) | `src/lib/schedule/room-recommendations.ts` | Accepts `targetSlotIndex` as input (caller-bounded) | No — caller-bounded by plan layer | Plan layer already limits to 1-5 | **None** |
| Room Recommendation API route | `src/app/api/schedule-adjustments/room-recommendations/route.ts` | `targetSlotIndex < 1 \|\| > 5` validation | Explicit K24-A4 guard at line 68 | **Already correct** | **None** |
| Admin ScheduleSlot Dialog | `src/components/admin-db/schedule-slot-dialog.tsx` | `Object.entries(SLOT_INDEX_MAP)` (7 items) | Yes — shows all 7 slots in dropdown | **Admin特权**: No — admin can create legacy slots for historical data. | Low (admin only) |
| Admin DB Content | `src/app/admin/db/admin-db-content.tsx` | `slotIndex < 1 \|\| > 7` validation (line 436) | Yes — allows up to 7 | **Admin特权**: No — admin can create legacy slots. | Low (admin only) |
| ScheduleSlot API route | `src/app/api/schedule-slot/route.ts` | `slotIndex < 1 \|\| > 7` validation (line 24) | Yes — allows up to 7 | **Admin特权**: No — API accepts admin writes for legacy slots. | Low (admin only) |
| ScheduleSlot [id] API route | `src/app/api/schedule-slot/[id]/route.ts` | Accepts `slotIndex` as-is | No — passes through | **Admin特权**: No | Low (admin only) |
| Schedule Store | `src/store/scheduleStore.ts` | Re-exports `TIME_SLOTS`, `DAYS`, `getSlotLabelByIndex`, `parseSlotLabel` from `@/types/schedule` | No — re-exports display maps | **Display-only**: No | Low |
| types/schedule.ts | `src/types/schedule.ts` | `SLOT_INDEX_MAP` (7 items), `TIME_SLOTS` (derived), `DAYS` (7 items) | Yes — legacy display map | **Display source of truth**: No — kept for backward compat. K24-A4 helper is the source for new operations. | Low |
| Adjustment (server validation) | `src/lib/schedule/adjustments.ts` | `newSlotIndex < 1 \|\| > 6` (line 48) | Yes — allows up to 6 (not 7) | **Backward compat**: No — allows adjusting existing `11-12` (slotIndex=6) rows. New recommendations are bounded by plan layer. | Low |
| Conflict Check (display) | `src/lib/schedule/conflict-check.ts` | `labels` array (7 items) in `getSlotLabel` | Yes — hardcoded labels | **Display-only** (message formatting): No | Low |
| Conflict Rules (display) | `src/lib/schedule/conflict-rules.ts` | `labels` array (7 items) in `getSlotLabel` | Yes — hardcoded labels | **Display-only** (message formatting): No | Low |
| Data Content Page | `src/app/data/data-content.tsx` | `SLOT_NAMES` (6 items, no `中午`) | Yes — hardcoded 6 items | **Display-only**: No — read-only data view. Missing `中午` (slotIndex=7) is cosmetic. | Low |
| Excel Export | `src/app/api/export/excel/route.ts` | `SLOT_LABELS` (6 items, no `中午`) | Yes — hardcoded 6 items | **Display-only**: No — Excel grid has 6 rows. Missing `中午` (slotIndex=7) is cosmetic for export. | Low |
| Importer | `src/lib/import/importer.ts` | `mapTimeSlotToIndex` function (maps text → slotIndex, supports 1-7) | Yes — supports full range | **Import**: Accepts legacy `11-12` and `中午` from Excel source data. This is correct — import must accept what exists. | Low |
| Importer Validation | `src/app/api/schedule-slot/route.ts` | `slotIndex < 1 \|\| > 7` | Yes — allows 7 | **Import path**: Correct — import creates slots from Excel data which may include legacy. | Low |

---

## 3. UI Findings

### 3.1 已使用 `time-slots.ts` 的位置

| File | Line | Usage |
|------|------|-------|
| `src/lib/schedule/adjustment-plan-recommendations.ts` | 36 | `import { getValidTeachingSlotIndexes } from './time-slots'` |
| `src/lib/schedule/adjustment-plan-recommendations.ts` | 48 | `const DEFAULT_SLOT_INDEXES = getValidTeachingSlotIndexes() as readonly number[]` |

**结论**: 唯一产生新 slot 推荐的服务端逻辑已正确接入统一 helper。这是最关键的接入点。

### 3.2 仍使用 `TIME_SLOTS` / `SLOT_INDEX_MAP`（来自 `types/schedule.ts`）的 UI

| File | Type | Analysis |
|------|------|----------|
| `src/components/schedule-grid.tsx` | Display + Drag-drop | Grid 渲染所有 7 行（含 `11-12`/`中午`），用于显示历史排课。拖拽操作走 `moveSlot` → API，**不限制目标 slot**（admin 可拖到任何 slot）。**Display-only 行为，无需改**。 |
| `src/app/dashboard/dashboard-content.tsx` | Display | 仅用 `TIME_SLOTS.find()` 做标签查找。**Display-only，无需改**。 |
| `src/components/schedule-adjustment-dialog.tsx` | Display + Plan API | 标签显示用 `TIME_SLOTS.find()`；实际推荐走 `fetchPlanRecommendations()`（已限 1-5）。**无需改**。 |
| `src/store/scheduleStore.ts` | Re-export | 重导出 `TIME_SLOTS` 等给 grid 使用。**无需改**。 |
| `src/components/admin-db/schedule-slot-dialog.tsx` | Admin dropdown | 用 `SLOT_INDEX_MAP` 生成全部 7 项下拉选项。**Admin 特权，无需改**。 |
| `src/app/data/data-content.tsx` | Display (read-only) | `SLOT_NAMES` 硬编码 6 项，用于只读数据展示页。**无需改**。 |
| `src/app/api/export/excel/route.ts` | Display (Excel) | `SLOT_LABELS` 硬编码 6 项，用于 Excel 导出网格。**无需改**。 |

### 3.3 硬编码 `1-2` / `9-10` / `11-12` 标签的位置

| File | Line | Content | Category |
|------|------|---------|----------|
| `src/types/schedule.ts` | 28-36 | `SLOT_INDEX_MAP` 含 7 项 | Display source of truth |
| `src/app/data/data-content.tsx` | 40-42 | `SLOT_NAMES` 6 项 | Display-only (read-only page) |
| `src/app/api/export/excel/route.ts` | 8 | `SLOT_LABELS` 6 项 | Display-only (Excel export) |
| `src/lib/schedule/conflict-check.ts` | 303 | `labels` 7 项 | Display-only (conflict messages) |
| `src/lib/schedule/conflict-rules.ts` | 351 | `labels` 7 项 | Display-only (conflict messages) |
| `src/lib/import/importer.ts` | 152-173 | `mapTimeSlotToIndex` supports 1-7 | Import (must accept legacy) |
| `src/lib/schedule/time-slots.ts` | 45-51 | `TEACHING_SLOT_LABELS` 5 项 | ✅ **Unified helper** (only active slots) |

**结论**: 所有硬编码标签位置均为 display-only 或 import（接受 legacy 数据），不产生新推荐。K24-A4 统一 helper (`time-slots.ts`) 已是新操作的唯一源。

### 3.4 会产生新推荐或新写入、必须使用 active slot helper 的位置

| Location | Status | Notes |
|----------|--------|-------|
| `src/lib/schedule/adjustment-plan-recommendations.ts` | ✅ 已接入 `getValidTeachingSlotIndexes()` | 唯一产生新推荐的 server 逻辑 |
| `src/app/api/schedule-adjustments/room-recommendations/route.ts` | ✅ 显式 `> 5` 校验 | 阻断非法 slot |
| `src/app/api/schedule-adjustments/plan-recommendations/route.ts` | ✅ 委托给 plan helper | 间接受限 |
| `src/components/schedule-adjustment-dialog.tsx` | ✅ 委托给 plan API | 不直接生成 slot |
| `src/components/schedule-grid.tsx` (drag-drop) | ⚠️ `moveSlot` 不限目标 slot | Admin 拖拽可到任何 slot，这是**设计意图**（管理员特权） |
| `src/lib/schedule/adjustments.ts` (dry-run) | ⚠️ 验证允许 `newSlotIndex` 到 6 | 向后兼容：允许对历史 `11-12` 行做调整 |

---

## 4. Adjustment / Recommendation Findings

### 4.1 调课弹窗 (`schedule-adjustment-dialog.tsx`)

- **节次显示**: 使用 `TIME_SLOTS.find(t => t.index === newSlotIndex)?.label` 查找标签，来自 `types/schedule.ts` 的 7 项 map。这是 display-only。
- **节次选择**: 不直接提供 slot 选择 UI。用户点击"推荐方案"后，调用 `fetchPlanRecommendations()`（已限 1-5），返回的方案中的 `targetSlotIndex` 来自 server 端 `getValidTeachingSlotIndexes()`。
- **结论**: ✅ 不可能通过调课弹窗推荐 `11-12`。

### 4.2 一键推荐调课 (`adjustment-plan-recommendations.ts`)

- **搜索空间**: `DEFAULT_SLOT_INDEXES = getValidTeachingSlotIndexes()` = `[1,2,3,4,5]`。**硬编码限死**。
- **day 搜索**: `DEFAULT_DAYS_WORKING = [1,2,3,4,5]`，`WEEKEND_DAYS = [6,7]`。默认 `includeWeekend=false`，周末不进入搜索。
- **preferredDayOfWeek**: 只接受 1-5（`VALID_PREFERRED_DAY_VALUES = [1,2,3,4,5]`），周末（6/7）在 API route 中被显式拒绝。
- **结论**: ✅ 不可能推荐 `11-12`。✅ 不可能默认推荐周末。

### 4.3 Preferred Day 是否排除周末

- **API route** (`plan-recommendations/route.ts:101`): `if (!Number.isFinite(n) || n < 1 || n > 5 || !Number.isInteger(n))` → 拒绝 6/7。
- **Helper** (`adjustment-plan-recommendations.ts:59`): `VALID_PREFERRED_DAY_VALUES = [1,2,3,4,5]`。
- **结论**: ✅ 周末不可作为 preferredDay。

### 4.4 Room Recommendation 是否依赖 slot list

- `findAdjustmentRoomRecommendations` 接受 `targetSlotIndex` 参数，由调用方（plan layer）传入。
- plan layer 的 `slotIndexes` 已限 `[1,2,3,4,5]`。
- API route (`room-recommendations/route.ts:68`) 独立做 `targetSlotIndex > 5` 校验作为二次防线。
- **结论**: ✅ Room recommendation 不可能被传入 `11-12`。

### 4.5 是否可能重新推荐 `11-12`

- 唯一产生新推荐的路径：`findAdjustmentPlanRecommendations()` → `DEFAULT_SLOT_INDEXES = getValidTeachingSlotIndexes()` = `[1,2,3,4,5]`。
- 所有 API route 层都有 `> 5` 校验作为防线。
- **结论**: ✅ 不可能。

### 4.6 是否可能默认推荐周末

- `includeWeekend` 默认 `false`，plan API route 中 `const includeWeekend = body.includeWeekend === true`。
- `preferredDayOfWeek` 只接受 1-5。
- `DEFAULT_DAYS_WORKING = [1,2,3,4,5]`。
- **结论**: ✅ 不可能默认推荐周末。用户必须显式传入 `includeWeekend: true` 才会在搜索空间中包含周末（但即便包含，周末也仅作为 fallback，会被 `-20` 分降权）。

---

## 5. Proposed K26-D Integration Notes

### 5.1 必须在 K26-D 中接入统一 helper 的文件

**无。** 唯一产生新推荐的 server 逻辑 `adjustment-plan-recommendations.ts` 已在 K24-A4 中接入 `getValidTeachingSlotIndexes()`。如果 K26-D 想进一步增强统一性，可以考虑：

| File | Current State | Suggested Action |
|------|---------------|------------------|
| `src/types/schedule.ts` | `SLOT_INDEX_MAP` 7 items, `TIME_SLOTS` derived | 可新增 `ACTIVE_SLOT_INDEXES` 常量或从 `time-slots.ts` re-export，但非必须（display maps 保留 legacy 是正确的） |
| `src/lib/schedule/adjustments.ts:48` | `newSlotIndex > 6` 校验 | 可选：改为 `> 5` 以完全杜绝新创建 `11-12` 行（但需评估对历史调整的影响） |

### 5.2 暂不应改的文件

| File | Reason |
|------|--------|
| `src/lib/schedule/adjustment-plan-recommendations.ts` | ✅ 已正确使用统一 helper |
| `src/app/api/schedule-adjustments/plan-recommendations/route.ts` | ✅ 委托给 plan helper |
| `src/app/api/schedule-adjustments/room-recommendations/route.ts` | ✅ 已有 `> 5` 校验 |
| `src/components/schedule-adjustment-dialog.tsx` | ✅ 不直接生成 slot |
| `src/components/schedule-grid.tsx` | ✅ Display-only grid |
| `src/app/dashboard/dashboard-content.tsx` | ✅ Display-only |
| `src/store/scheduleStore.ts` | ✅ Re-export for display |
| `src/components/admin-db/schedule-slot-dialog.tsx` | ✅ Admin 特权入口 |
| `src/app/admin/db/admin-db-content.tsx` | ✅ Admin 特权入口 |
| `src/lib/schedule/conflict-check.ts` | ✅ Display-only labels |
| `src/lib/schedule/conflict-rules.ts` | ✅ Display-only labels |
| `src/app/api/export/excel/route.ts` | ✅ Display-only export |
| `src/lib/import/importer.ts` | ✅ Import 必须接受 legacy |

### 5.3 仅 Display-only（保留 legacy labels 是正确的）

- `schedule-grid.tsx` — 网格渲染所有 7 行，用于显示历史数据
- `dashboard-content.tsx` — 标签查找
- `schedule-adjustment-dialog.tsx` — 标签显示
- `data-content.tsx` — 只读数据页
- `export/excel/route.ts` — Excel 导出
- `conflict-check.ts` / `conflict-rules.ts` — 冲突消息中的 label

### 5.4 需要 verify 覆盖

| Area | Verify Action |
|------|---------------|
| plan-recommendations | 确认 `getValidTeachingSlotIndexes()` 返回 `[1,2,3,4,5]`，不返回 6/7 |
| room-recommendations API | 确认 `targetSlotIndex > 5` 校验存在且生效 |
| preferredDayOfWeek API | 确认 6/7 被拒绝 |
| schedule-adjustment-dialog | 确认推荐方案的 slotIndexes 来自 plan API（不直接生成） |
| adjustments.ts dry-run | 确认 `newSlotIndex > 6` 校验（历史兼容） |
| admin slot dialog | 确认只有 admin 角色可访问 |
| importer | 确认 `mapTimeSlotToIndex` 正确映射 11-12 → 6, 中午 → 7 |

---

## 6. Non-Modified Scope

本次审计 **未修改** 以下任何内容：

- `prisma/schema.prisma` — 未触碰
- `prisma/migrations/**` — 未触碰
- `prisma/dev.db` — 未触碰
- API route 业务逻辑 — 未修改
- frontend UI 业务逻辑 — 未修改
- solver / score.ts — 未修改
- scheduler preview / apply — 未修改
- adjustment recommendation — 未修改
- room recommendation — 未修改
- RBAC — 未修改
- K22/K23/K24/K25 expected — 未触碰

---

## 7. 完成报告

| Item | Value |
|------|-------|
| **Branch** | `k26-d-opencode-ui-adjustment-slot-scan` |
| **HEAD** | `0e8c94a` |
| **是否提交** | 否（仅输出审计文档） |
| **Commit hash** | N/A |
| **Changed files** | `docs/k26-d-opencode-ui-adjustment-slot-source-scan.md`（新增） |
| **Git status** | Untracked: `docs/k26-d-opencode-ui-adjustment-slot-source-scan.md` |
| **是否 push** | 否 |
| **是否 force push** | 否（必须为否） |

### 审计摘要

- **总扫描调用点**: 50+ 处 slotIndex/dayOfWeek 相关引用
- **已接入 K24-A4 统一 helper**: 1 处（plan-recommendations，最关键的推荐生成逻辑）
- **有显式边界校验**: 2 处（room-recommendations API `> 5`、plan-recommendations `preferredDayOfWeek` 只接受 1-5）
- **Display-only 保留 legacy**: ~10 处（grid、dashboard、弹窗标签、conflict messages、export、data page）
- **Admin 特权入口**: 2 处（schedule-slot dialog、admin DB content，允许创建 legacy slots）
- **Import 接受 legacy**: 1 处（importer，正确行为）
- **高风险硬编码**: 0 处
- **建议 K26-D 改动**: 可选（`adjustments.ts` 的 `newSlotIndex > 6` 可考虑收紧为 `> 5`，但需评估影响）

### 给 CC 的整合建议

1. **K26-D 的核心价值**：将 `types/schedule.ts` 的 display maps 与 `time-slots.ts` 的 active helper 之间的关系文档化，让后续开发者清楚区分"display source"和"business source"。
2. **无需紧急改动**：当前所有新推荐路径已限 1-5，无 `11-12` 泄漏风险。
3. **可选增强**：
   - 在 `types/schedule.ts` 中新增 `export const ACTIVE_SLOT_INDEX_MAP` 从 `time-slots.ts` re-export，作为 UI dropdown 的推荐源（用于非 admin 场景）。
   - 将 `adjustments.ts:48` 的 `newSlotIndex > 6` 收紧为 `> 5`，彻底杜绝通过 dry-run → create 路径创建新的 `11-12` 行。
4. **不要改**：admin 特权入口（schedule-slot dialog、admin DB）应保留 legacy slots 支持；importer 必须接受 legacy；display-only 路径保留 legacy labels。
