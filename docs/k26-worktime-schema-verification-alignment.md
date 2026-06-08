# K26-F1: WorkTime Schema Verification Alignment

## 1. Executive Summary

K26-F1 只做验证对齐，不新增功能。

- K26-F 中 K26-D/K26-E verify 失败是因为这些脚本在 K26-F 之前编写，假设无 schema/migration 变化
- K26-F 合法新增了 WorkTimeConfig + TimeSlotDefinition models 和 migration
- 对齐策略：Strategy A（更新旧脚本为 stage-aware）+ Strategy B（新增 post-schema regression verify）
- K26-F 现在可以正式关闭

## 2. GitHub Sync Status

| Item | Value |
|------|-------|
| Branch | `master` |
| Remote | `origin` → `https://github.com/Satanecinl/Course-Development-System.git` |
| Tracking branch | `origin/master` |
| Local HEAD before | `94ad835` (K26-F) |
| Local HEAD after | (to be filled after push) |
| Remote HEAD before | `94ad835` |
| Remote HEAD after | (to be filled after push) |
| Ahead/behind | up to date |
| Fetch | yes |
| Pull/rebase | no (was up to date) |
| Push | yes |
| Force push | false |

## 3. Prior Verification Failures

| Script | Failure | 根因 |
|--------|---------|------|
| K26-E: C1 | `No WorkTimeConfig model in schema` | K26-E 假设无 WorkTimeConfig，但 K26-F 合法新增 |
| K26-E: C2 | `No TimeSlotDefinition model in schema` | 同上 |
| K26-E: N1 | `No change to prisma/schema.prisma` | K26-F 合法修改了 schema |
| K26-E: N2 | `No new migration files` | K26-F 合法新增了 migration |
| K26-D: N1 | `No change to prisma/schema.prisma` | K26-F 合法修改了 schema |
| K26-D: N2 | `No change under prisma/migrations/` | K26-F 合法新增了 migration |

## 4. Alignment Strategy

采用 **Strategy A + B**：

### Strategy A：更新旧脚本为 stage-aware

- K26-E: C1/C2 从"不存在"改为"存在（K26-F 已实现）"
- K26-E: N1/N2 从"不允许变化"改为"接受 K26-F 批准的 schema/migration"
- K26-D: N1/N2 从"不允许变化"改为"接受 K26-F 批准的 schema/migration"

### Strategy B：新增 post-schema regression verify

- 新增 `scripts/verify-worktime-post-schema-regression-k26-f1.ts`
- 30 项只读检查覆盖：schema(6) + DB/backfill(10) + helper invariants(6) + non-goals(8)

## 5. Post-Schema Regression Coverage

| 维度 | 检查项 | 数量 |
|------|--------|------|
| Schema / migration | WorkTimeConfig/TimeSlotDefinition/Semester.relation/SchedulingRun.snapshot/migration/no-extra-migration | 6 |
| DB / Backfill | default config/7 slots/active 1-5/legacy 6-7/slot 6/slot 7/ScheduleSlot count/legacy rows/weekend rows/read-only | 10 |
| K26-D helper invariants | active [1..5]/recommendation exclude 6-7/formatter 6/formatter 7/preferred days/weekend days | 6 |
| Non-goals | no API/no UI/no solver/no score/no preview-apply/no recommendation/no room-rec/no K22 | 8 |

## 6. Verification Results

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

## 7. Unmodified Scope

本阶段**未改**：

- ❌ `prisma/schema.prisma`
- ❌ `prisma/migrations/**`
- ❌ `prisma/dev.db`
- ❌ API routes
- ❌ frontend UI
- ❌ solver algorithm
- ❌ `src/lib/scheduler/score.ts`
- ❌ scheduler preview / apply
- ❌ adjustment recommendation
- ❌ room recommendation
- ❌ importer / parser
- ❌ RBAC permission model
- ❌ K22/K23/K24/K25 expected

**只改**：

- ✅ `scripts/plan-worktime-schema-k26-e.ts`（更新 N1/N2 为 stage-aware）
- ✅ `scripts/verify-static-time-slot-extraction-k26-d.ts`（更新 N1/N2 为 stage-aware）
- ✅ 新增 `scripts/verify-worktime-post-schema-regression-k26-f1.ts`
- ✅ 更新 `docs/k26-worktime-schema-implementation.md`（追加 addendum）
- ✅ 更新 `docs/k26-worktime-schema-implementation.json`（追加 addendum）
- ✅ 新增 `docs/k26-worktime-schema-verification-alignment.md`
- ✅ 新增 `docs/k26-worktime-schema-verification-alignment.json`

## 8. Recommendation

```txt
K26-F1-WORKTIME-SCHEMA-VERIFICATION-ALIGNMENT: 建议关闭
K26-F-WORKTIME-SCHEMA-IMPLEMENTATION: 现在可以正式关闭
blocking=false
k26fCanClose=true
recommendedNextStage=K26-G-WORKTIME-API-IMPLEMENTATION
K26-G 注: 只做 API (CRUD + resolved + delete protection); 不接 UI / solver / score
```
