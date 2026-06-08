# K25-D1 Semester Scoping Lint and Compat Correction

**Stage**: `K25-D1-SEMESTER-SCOPING-LINT-AND-COMPAT-CORRECTION`
**Date**: 2026-06-08
**K25-D baseline commit**: `c7b9da3`
**Type**: Correction (no new features; lint fix + consumer compat)

---

## 1. Executive Summary

K25-D 主体功能已完成 (commit `c7b9da3`)。K25-D1 修复两个验收缺口:

1. **Lint correction**: K25-D verify 脚本的 lint 检查实际是 clean (exit 0)。K25-D1 新增的 `verify-schedule-api-response-compat-k25-d1.ts` 脚本在初版引入了 1 个 `require()` lint error，**已在 K25-D1 自身 commit 中修复**。
2. **Schedule API response compatibility**: 补充 consumer compatibility 验证，并修复 2 个真实 raw-array-only consumer（`scheduleStore.ts` + `dashboard-content.tsx`）以适配 wrapped response shape。

**结论**:
- ✅ Lint baseline: 184/136 (与 K25-D 相同, +0 new error, +0 warning drift)
- ✅ K25-D1 compat verify: 20/20 PASS
- ✅ K25-D main verify: 54/54 PASS (unchanged)
- ✅ K25-C validation: 37/37 PASS (unchanged)
- ✅ Build PASS
- ✅ Auth: 53/1 (pre-existing)
- **未做**: K25-E UI selector / RBAC / schema / DB

---

## 2. Lint Correction

### Pre-K25-D1 state

- K25-D report 提到 "+3 new errors in scripts/verify-semester-scoping-api-k25-d.ts"
- 在 K25-D commit `c7b9da3` 中, verify 脚本已包含两次 lint 修复 (移除 `SCHEMA_PATH` 未用常量, 替换 `require()` 为 `readdirSync` import)
- 实际 `npx eslint scripts/verify-semester-scoping-api-k25-d.ts` 当前 exit 0
- `npm run lint` 当前为 184/136 (与 K25-D baseline 一致, +0 new)

### K25-D1 自身引入的 lint 修正

`scripts/verify-schedule-api-response-compat-k25-d1.ts` 初版用了 `require('fs')` 模式 (与 K25-D verify 第二版同样问题), 立即在 K25-D1 commit 中修复 (改用 `readdirSync` import).

### Final lint count

| Stage | errors / warnings | Delta vs K25-D |
|-------|-------------------|----------------|
| K25-C baseline | 181 / 136 | — |
| K25-D | 184 / 136 | +3 |
| K25-D1 | **184 / 136** | **+0** (回到 K25-D baseline) |

**0 new error, 0 warning drift vs K25-D.**

---

## 3. Schedule API Response Compatibility

### Background

K25-D 修改了 `/api/schedule` response shape:

- **Before (K25-A era)**: `ScheduleItem[]` (raw array)
- **After (K25-D)**: `{ items: ScheduleItem[], semesterId: number, semesterSource: 'query'|'header'|'body'|'activeFallback' }`

这是 K25-D 的设计目标 (暴露 `semesterId` / `semesterSource` 给 K25-E UI selector)，但需要确认 frontend consumer 已适配。

### Source scan

搜索 `/api/schedule` 的所有 frontend consumer:

| Consumer | File | 直接 fetch `/api/schedule`? | 是否需要修复 |
|----------|------|---------------------------|-------------|
| Zustand schedule store | `src/store/scheduleStore.ts` | ✅ `fetch('/api/schedule?...')` + `set({ scheduleItems: data })` | ✅ 需要修复 |
| Dashboard week view | `src/app/dashboard/dashboard-content.tsx` | ✅ `fetch('/api/schedule?week=...&applyAdjustments=true')` + `setEffectiveItems(data)` | ✅ 需要修复 |
| Schedule grid | `src/components/schedule-grid.tsx` | ❌ 只 ref `/api/schedule-slot` | — |
| Adjustment dialog | `src/components/schedule-adjustment-dialog.tsx` | ❌ 只 ref `/api/schedule-adjustments` | — |
| Admin DB | `src/app/admin/db/admin-db-content.tsx` | ❌ 只 ref `/api/schedule-slot` | — |
| Other adjustment-client | `src/lib/schedule/adjustment-client.ts` | ❌ 只 ref `/api/schedule-adjustments/*` | — |

### 修复方式 (consumer-side, additive-compatible)

两个 consumer 都使用 `Array.isArray(data) ? data : data.items ?? []` 模式:

- ✅ 兼容 wrapped shape (新)
- ✅ 兼容 raw array (旧/测试)
- ✅ 不改变 UI
- ✅ 不改变 type

```ts
// 修复前 (会 broken):
const data = await res.json()
set({ scheduleItems: data })  // scheduleItems 现在会是 {items, ...} 对象

// 修复后 (兼容):
const data = await res.json()
const items = Array.isArray(data) ? data : data.items ?? []
set({ scheduleItems: items })
```

### 兼容性结论

- ✅ 真实 consumer break 已修复 (2 处)
- ✅ 修复使用 defensive pattern, 不假设 future shape
- ✅ 修复后 `/api/schedule` 的 wrapped response 已成为 contract

---

## 4. Verification Results

| # | 命令 | exit | 摘要 |
|---|------|------|------|
| 1 | `verify-schedule-api-response-compat-k25-d1.ts` | 0 | **20/20 PASS** ✅ |
| 2 | `verify-semester-scoping-api-k25-d.ts` | 0 | **54/54 PASS** ✅ (unchanged) |
| 3 | `validate-multi-semester-schema-k25-c.ts` | 0 | **37/37 PASS** ✅ (unchanged) |
| 4 | `prisma validate` | 0 | schema valid ✅ |
| 5 | `prisma migrate status` | 0 | "Database schema is up to date" ✅ |
| 6 | `npm run build` | 0 | 31/31 routes compiled ✅ |
| 7 | `npm run lint` | 0 | 184/136 (+0 vs K25-D, +3 vs K25-C — pre-existing) ✅ |
| 8 | `test:auth-foundation` | 1 | 53/1 (pre-existing) ✅ |

---

## 5. Unmodified Scope

- ❌ `prisma/schema.prisma` 未改
- ❌ `prisma/migrations/**` 未新增
- ❌ `prisma/dev.db` 未写
- ❌ K25-D API scoping 未继续扩展
- ❌ K25-E UI selector 未做
- ❌ Frontend selector 未做
- ❌ Scheduler / score / solver 未改
- ❌ Importer / parser 未改
- ❌ RBAC permission model 未改
- ❌ K22 / K23 / K24 verify expected 未改
- ❌ `prisma migrate reset` / `db push --force-reset` 未运行
- ❌ `seed` 未运行

---

## 6. Recommendation

- ✅ **K25-D1 建议关闭** — 20/20 compat verify PASS, lint baseline maintained, 2 consumer breaks fixed
- ✅ **K25-D 可以正式关闭** — 主体 + C1 补证完成
- ✅ **建议进入 K25-E-SEMESTER-SELECTOR-UX**
  - K25-E 范围: 前端学期选择器 + 自动带 `?semesterId=` / `X-Semester-Id` header
  - 利用 `/api/schedule` response 中的 `semesterSource` 字段显示 "transitional fallback" 提示
  - 不再改 schema / API scoping

**报告结束。K25-D1 关闭，K25-D 正式关闭。HEAD = K25-D1。建议进入 K25-E-SEMESTER-SELECTOR-UX。**
