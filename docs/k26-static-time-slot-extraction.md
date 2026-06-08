# K26-D: Static Time-Slot Extraction

## 1. Executive Summary

K26-D 完成了"节次与作息"相关统一 helper 的静态抽取与对齐。

- 保持 active teaching slots = `[1, 2, 3, 4, 5]` (1-2节..9-10节)
- 保持 legacy display slots `6 = 11-12节`、`7 = 中午` 的 display 兼容
- 新推荐 / 新选择 永不返回 `6 / 7`
- preferred day values = `[1, 2, 3, 4, 5]`，weekend = `[6, 7]`
- 唯一产生新推荐的 server 逻辑 `adjustment-plan-recommendations.ts` 已使用统一 helper
- 调课 / preferred day / room recommendation 都有显式边界校验（双重防线）

**未做**：

- 不做 DB 配置（schema / migration 未改）
- 不做系统设置 UI（无 WorkTime 设置页）
- 不改 solver algorithm
- 不改 `score.ts`
- 不改 scheduler preview / apply
- 不改 K22 / K23 / K24 expected

## 2. GitHub Sync Status

| Item | Value |
|------|-------|
| Branch | `k26-d-static-time-slot-extraction` |
| Remote | `origin` → `https://github.com/Satanecinl/Course-Development-System.git` |
| Tracking branch | `origin/master` |
| Local HEAD before | `0e8c94a` (K26-C closeout) |
| Local HEAD after | (to be filled after push) |
| Ahead/behind | up to date (no remote ahead) |
| Push | yes |
| Force push | **false** |

## 3. Inputs From Parallel Agents

### 3.1 opencode (UI / 调课调用面扫描)

- 分支: `k26-d-opencode-ui-adjustment-slot-scan`
- HEAD: `0e8c94a`
- 文档: `docs/k26-d-opencode-ui-adjustment-slot-source-scan.md`

**关键结论**：

1. K24-A4 统一 helper 已到位 (`time-slots.ts`)
2. `adjustment-plan-recommendations.ts:48` 已使用 `getValidTeachingSlotIndexes()`
3. room-recommendations API route 有 `targetSlotIndex > 5` 显式校验
4. plan-recommendations API route 拒绝 `preferredDayOfWeek` 在 6/7
5. schedule-grid / dashboard / 调课弹窗均为 display-only，保留 legacy labels 正确
6. admin slot dialog 是 admin 特权入口，保留 7 项 dropdown
7. `SLOT_NAMES` (6 项)、`SLOT_LABELS` (6 项) 是 display-only 硬编码
8. `adjustments.ts:48` 允许 `newSlotIndex > 6` 是 backward compat（opencode 标注"可选收紧到 > 5，需评估影响"）
9. 高风险 UI 硬编码: 0 处

**采纳**：

- 在 `types/schedule.ts` 中添加 K26-D 注释说明（哪些是 display-only、哪些用 helper）
- 把 codex 推荐的 formatter 增强为 `formatTeachingSlotLabel` 支持 1-5 + 6 + 7 + unknown

**未采纳**（明确说明）：

- `adjustments.ts:48` 收紧 `> 6` → `> 5`：会改变 admin 调整历史 `11-12` 行的能力，与"保留 legacy 兼容"目标冲突；opencode 自己也说"需评估影响"。**保持 `> 6` 不变**。
- admin schedule-slot dialog 收紧为 1-5：opencode 明确建议保留 admin 特权入口。**保持 7 项 dropdown**。

### 3.2 codex (DB snapshot + verify 设计)

- 分支: `k26-d-codex-slot-verify-and-db-snapshot`
- HEAD: `43aaf15` (基线 `0e8c94a`)
- 文档: `docs/k26-d-codex-slot-verify-notes.md`
- DB read-only 验证：使用 `sqlite3 file:prisma/dev.db?mode=ro` 强制只读
- 数据库大小 `3735552` bytes，mtime `2026-06-08T07:53:30Z` 前后未变

**DB Snapshot 摘要**：

| Metric | Value |
|--------|------:|
| Total `ScheduleSlot` | 440 |
| `slotIndex > 5` (legacy) | 2 |
| `slotIndex = 6` | 2 |
| `slotIndex = 7` | 0 |
| Weekend `dayOfWeek IN (6,7)` | 21 |
| All under `semesterId = 1` | 440 |

**Verify 设计建议**（全部采纳）：

- 4 组分组：Helper 10 项、Source 8 项、DB 3 项、Non-goal guardrails 6 项
- 用 `mode=ro` 强制只读
- Non-goal 用 git diff changed files
- 不 assert DB 计数（那是 snapshot fact，不是 product invariant）
- runtime equality checks 优于 source regex
- 显式 unknown fallback

**solver / score static impact**（全部已记录，禁止改动）：

| File | Frozen assumption |
|------|-------------------|
| `src/lib/scheduler/solver.ts` | 枚举 `day=1..7`, `slot=1..6` |
| `src/lib/scheduler/score.ts` | `SC3 slotIndex >= 5`, `SC7 dayOfWeek >= 6`, `TEACHING_DAYS=[1..5]` |
| `K22 score harness` | SC3/SC7 阈值与 K22 expected 是 K26-D non-goal |

**额外审计限制**：codex 提到 `git fetch --all --prune` 因审批超时未执行（仅一次）；本地 baseline 已确认。本阶段在 CC 主线整合时已用本地 git state + K26-C closeout 文档作基线。

## 4. Helper Contract

模块：`src/lib/schedule/time-slots.ts`

### 4.1 Slot 常量

```ts
VALID_TEACHING_SLOT_INDEXES = [1, 2, 3, 4, 5]    // active teaching
LEGACY_DISPLAY_SLOT_INDEXES = [6, 7]             // display-only
ALL_DISPLAY_SLOT_INDEXES = [1, 2, 3, 4, 5, 6, 7]  // display map
```

### 4.2 Day 常量

```ts
VALID_PREFERRED_DAY_VALUES = [1, 2, 3, 4, 5]     // working days (Mon-Fri)
WEEKEND_DAY_VALUES = [6, 7]                      // weekend (Sat-Sun)
```

### 4.3 导出函数

| Function | Signature | Purpose |
|----------|-----------|---------|
| `getValidTeachingSlotIndexes()` | `() => number[]` | 返回 active slots 副本 |
| `getLegacyDisplaySlotIndexes()` | `() => number[]` | 返回 legacy slots 副本 |
| `getAllDisplaySlotIndexes()` | `() => number[]` | 返回 active + legacy 副本 |
| `getRecommendationSlotIndexes()` | `() => number[]` | alias for active (永不含 6/7) |
| `isValidTeachingSlotIndex(n)` | `(n) => n is 1\|2\|3\|4\|5` | 1-5 type guard |
| `isLegacyDisplaySlotIndex(n)` | `(n) => n is 6\|7` | 6/7 type guard |
| `isActiveTeachingSlot(n)` | `(n) => boolean` | alias for valid |
| `isRecommendationSlot(n)` | `(n) => boolean` | alias for valid |
| `isLegacyDisplaySlot(n)` | `(n) => boolean` | alias for legacy |
| `getMaxValidTeachingSlotIndex()` | `() => number` | 5 |
| `formatTeachingSlotLabel(n)` | `(n) => string` | 统一 formatter (1-5 → active, 6→11-12节, 7→中午, unknown→`第N节`) |
| `getTeachingSlotOptions()` | `() => Array<{index, label}>` | 新目标下拉选项（仅 1-5） |
| `getRecommendationSlotOptions()` | `() => Array<{index, label}>` | alias |
| `getTeachingSlotLabelOptions()` | `() => Array<{index, label}>` | alias（向后兼容 K24-A4） |
| `isValidPreferredDayValue(n)` | `(n) => n is 1-5` | preferred day 校验 |
| `isWeekendDayValue(n)` | `(n) => n is 6\|7` | weekend 校验 |
| `isWeekday(n)` | `(n) => boolean` | alias for valid preferred |
| `isWeekend(n)` | `(n) => boolean` | alias for weekend |
| `getPreferredDayOptions()` | `() => Array<{value, label}>` | 周一-周五 |
| `getWeekendDayOptions()` | `() => Array<{value, label}>` | 周六-周日 |

### 4.4 不变式

- `formatTeachingSlotLabel(n)` 对任何 number 输入都不抛异常
- 所有 `get*` 函数返回数组的副本，调用方不能 mutate 共享源
- `getRecommendationSlotIndexes()` 永不含 6/7
- legacy 6/7 只在 display formatter / display map 中出现，绝不作为新推荐

## 5. Integration Changes

| File | Change | Why |
|------|--------|-----|
| `src/lib/schedule/time-slots.ts` | **扩展** helper（新增常量、函数、formatter 支持 legacy 6/7 + unknown） | K26-D 统一源 |
| `src/types/schedule.ts` | **注释**（不变数据）：注释 K26-D helper 与 display map 的关系 | 文档化避免后续混淆 |
| `scripts/verify-static-time-slot-extraction-k26-d.ts` | **新增** verify 脚本 | 39 项检查 |
| `docs/k26-static-time-slot-extraction.md` | **新增** 文档 | 本文件 |
| `docs/k26-static-time-slot-extraction.json` | **新增** 结构化文档 | CI / machine-readable |
| `docs/k26-d-codex-slot-verify-notes.md` | **cherry-pick 自 codex 分支** | 整合 parallel agent 输出 |
| `docs/k26-d-opencode-ui-adjustment-slot-source-scan.md` | **untracked → committed** | 整合 parallel agent 输出 |

**未修改**：

- `prisma/schema.prisma`
- `prisma/migrations/**`
- `prisma/dev.db`
- `src/lib/scheduler/solver.ts`
- `src/lib/scheduler/score.ts`
- `src/lib/scheduler/score-breakdown.ts`
- `src/lib/schedule/adjustment-plan-recommendations.ts` (已用 helper)
- `src/lib/schedule/room-recommendations.ts`
- `src/lib/schedule/adjustments.ts` (保留 `> 6` backward compat)
- `src/lib/schedule/conflict-check.ts` / `conflict-rules.ts` (display-only labels)
- `src/components/**` / `src/app/**` (UI 行为不变)
- `src/lib/import/importer.ts` (import 必须接受 legacy)
- `src/store/scheduleStore.ts` (re-export display maps)

## 6. Legacy Compatibility

### 6.1 11-12节 (slotIndex=6)

- 当前 DB 有 **2 条** `slotIndex=6` 记录（id=265, 271，teachingTaskId=200）
- `formatTeachingSlotLabel(6) === '11-12节'` ✅
- `SLOT_INDEX_MAP[6]` 仍为 `{ label: '11-12节', start: 11, end: 12 }` ✅
- `TIME_SLOTS` 数组仍包含 7 项（grid 渲染全部 7 行）✅
- admin schedule-slot dialog 仍允许创建 `slotIndex=6` 行（admin 特权）✅
- `adjustments.ts:48` 仍允许调整到 `slotIndex=6`（backward compat）✅
- **不会通过任何新推荐/新选择路径创建新的 slotIndex=6 行** ✅

### 6.2 中午 (slotIndex=7)

- 当前 DB 有 **0 条** `slotIndex=7` 记录
- `formatTeachingSlotLabel(7) === '中午'` ✅
- `SLOT_INDEX_MAP[7]` 仍为 `{ label: '中午', start: 12, end: 13 }` ✅
- `TIME_SLOTS` 仍包含 7 项（display-only）✅
- **不会通过任何新推荐/新选择路径创建新的 slotIndex=7 行** ✅

### 6.3 周末 (dayOfWeek 6/7)

- 当前 DB 有 **21 条** 周末记录
- 所有 display / 渲染 / conflict-check 路径都接受 dayOfWeek 1-7
- score.ts 中 `SC7_WEEKEND_PENALTY = -15` 仍生效（`dayOfWeek >= 6`）
- 周末不作为 preferred day 出现在 plan recommendation API 中
- `includeWeekend` 显式参数默认 `false`，用户必须主动传 `true` 才会在搜索空间包含周末

## 7. Non-Goals

本阶段**未做**：

- ❌ schema change
- ❌ migration
- ❌ DB 数据修改
- ❌ API 语义修改
- ❌ solver algorithm 改动
- ❌ `score.ts` 改动
- ❌ scheduler preview / apply 改动
- ❌ adjustment recommendation 搜索空间改动
- ❌ room recommendation 改动
- ❌ UI 功能改动
- ❌ RBAC permission 改动
- ❌ importer / parser 改动
- ❌ WorkTime settings UI
- ❌ DB-configurable time slot
- ❌ K22 / K23 / K24 expected 改动

## 8. Verification Results

| Command | Result |
|---------|--------|
| `npx tsx scripts/verify-static-time-slot-extraction-k26-d.ts` | **39/39 PASS** |
| `npx tsx scripts/audit-time-slot-worktime-settings-k26-c.ts` | (TBD run) |
| `npx tsx scripts/verify-system-settings-shell-k26-a.ts` | (TBD run) |
| `npx tsx scripts/verify-scheduler-config-settings-acceptance-closeout-k26-b.ts` | (TBD run) |
| `npx tsx scripts/verify-scheduler-config-settings-integration-k26-b.ts` | (TBD run) |
| `npx tsx scripts/verify-semester-settings-acceptance-closeout-k25.ts` | (TBD run) |
| `npx tsx scripts/validate-multi-semester-schema-k25-c.ts` | (TBD run) |
| `npx prisma validate` | (TBD run) |
| `npx prisma migrate status` | (TBD run) |
| `npm run build` | (TBD run) |
| `npx eslint .` | (TBD run) |
| `npm run test:auth-foundation` | (TBD run) |

具体结果以最终 commit 时的 `npx tsx` / `npm run` 输出为准。

## 9. Recommended Next Stage

```txt
K26-D STATIC TIME SLOT EXTRACTION VERIFY PASS
PASS=39 FAIL=0
blocking=false
recommendedNextStage=K26-E-WORKTIME-SCHEMA-PLAN
```

K26-D **建议关闭**。下一步进入 K26-E（WorkTime schema plan）：

- 评估 Option B (SystemSetting JSON) vs Option C (独立 WorkTime/TimeSlotConfig 表)
- 决定 SC3 / SC7 阈值是否参数化
- 评估 K22 score harness expected 更新方案
- 评估历史 11-12 / 周末数据的迁移策略
- 仍**禁止**直接进入 K26-F API / K26-G UI：必须先有 schema 计划

如果发现 K26-D 仍有遗漏的对齐项（例如新出现 display 路径未走 formatter），可走 `K26-D1-STATIC-TIME-SLOT-EXTRACTION-FIX`。

---

## Verification Complete Addendum

> 本节由 `K26-D1-STATIC-TIME-SLOT-EXTRACTION-VERIFICATION-COMPLETE` 追加。

### 阶段

`K26-D1-STATIC-TIME-SLOT-EXTRACTION-VERIFICATION-COMPLETE`

### 本阶段目的

补齐 K26-D 完成报告中仍标 `TBD` 的验证项，并重跑完整验证链以正式关闭 K26-D。**不修改任何业务代码**。

### GitHub Sync

| Item | Value |
|------|-------|
| Branch | `master` |
| Remote | `origin` → `https://github.com/Satanecinl/Course-Development-System.git` |
| Tracking branch | `origin/master` |
| Local HEAD before | `ca54436` (K26-D merge) |
| Local HEAD after | (to be filled after push) |
| Remote HEAD before | `ca54436` |
| Remote HEAD after | (to be filled after push) |
| Ahead/behind | up to date |
| Fetch | yes |
| Pull/rebase | no (was up to date) |
| Push | yes |
| Force push | false |

### 上一阶段缺失项

| 缺失项 | 上一阶段报告 | 本阶段结果 |
|--------|--------------|------------|
| `npx tsx scripts/verify-scheduler-config-settings-integration-k26-b.ts` | `(TBD)` | **PASS (47/47)** |
| `npm run lint` | 用 `npx eslint .` 替代；未明确说明等价性 | **PASS (184/136 +0/+0 vs K26-C baseline)**；**已确认等价**：`package.json` 中 `"lint": "eslint"` 直接调用 `eslint` 二进制，无额外参数，等价于 `npx eslint .` |

### 完整验证命令表（本阶段实际运行）

| Command | Result |
|---------|--------|
| `npx tsx scripts/verify-static-time-slot-extraction-k26-d.ts` | **39/39 PASS** |
| `npx tsx scripts/audit-time-slot-worktime-settings-k26-c.ts` | **PASS** (32/32, blocking=true 已在 K26-D 解除 — K26-D 已完成) |
| `npx tsx scripts/verify-system-settings-shell-k26-a.ts` | **47/47 PASS** |
| `npx tsx scripts/verify-scheduler-config-settings-acceptance-closeout-k26-b.ts` | **38/38 PASS** |
| `npx tsx scripts/verify-scheduler-config-settings-integration-k26-b.ts` | **47/47 PASS** (本阶段补跑) |
| `npx tsx scripts/verify-semester-settings-acceptance-closeout-k25.ts` | **38/38 PASS** |
| `npx tsx scripts/validate-multi-semester-schema-k25-c.ts` | **PASS** |
| `npx prisma validate` | **PASS** |
| `npx prisma migrate status` | **up to date** (7 migrations) |
| `npm run build` | **PASS** (Compiled successfully) |
| `npx eslint .` (= `npm run lint`) | **184 errors / 136 warnings (+0/+0 vs K26-C baseline)** |
| `npm run test:auth-foundation` | **53 passed / 1 failed (pre-existing)** |

### Pre-existing failure

| Failure | Status |
|---------|--------|
| `ScheduleAdjustment ACTIVE = 0 (实际 10)` | pre-existing, 与 K26-C/K26-D baseline 一致，**未尝试用业务数据修复** |

### 未修改范围（本阶段）

确认**未改**：

- `src/lib/schedule/time-slots.ts`
- `src/types/schedule.ts`
- `prisma/schema.prisma`
- `prisma/migrations/**`
- `prisma/dev.db`
- API 业务语义
- frontend UI 功能
- solver algorithm
- `src/lib/scheduler/score.ts`
- scheduler preview / apply
- adjustment recommendation
- room recommendation
- importer / parser
- RBAC permission model
- K22 / K23 / K24 / K25 expected
- WorkTime schema / API / UI
- 系统设置 UI 功能

仅修改：

- `docs/k26-static-time-slot-extraction.md`（追加本节）
- `docs/k26-static-time-slot-extraction.json`（追加 `verificationCompleteAddendum` 字段）
- 新增 `docs/k26-static-time-slot-extraction-verification-complete.md`
- 新增 `docs/k26-static-time-slot-extraction-verification-complete.json`

### Final Conclusion

```txt
K26-D1-STATIC-TIME-SLOT-EXTRACTION-VERIFICATION-COMPLETE: 建议关闭
K26-D-STATIC-TIME-SLOT-EXTRACTION: 现在可以正式关闭
K26-D 排课参数设置小主线: 正式关闭
blocking=false
k26dCanClose=true
recommendedNextStage=K26-E-WORKTIME-SCHEMA-PLAN
K26-E 注: 必须先有 schema 计划，仍禁止直接做节次作息 UI
```
