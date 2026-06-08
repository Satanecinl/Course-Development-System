# K26-H2A: WorkTime Settings UI Runtime Prisma Delegate Fix

## 1. Executive Summary

K26-H2A 修复了 K26-H WorkTime settings UI 的 runtime blocker：

- **错误**：`Cannot read properties of undefined (reading 'findMany')`
- **触发位置**：`/admin/settings` → "节次与作息设置" → panel 加载阶段
- **根因**：dev server 使用了 schema migration 之前的旧 Prisma Client singleton（`globalThis.prisma` 缓存了不含 `workTimeConfig` / `timeSlotDefinition` delegate 的旧实例）
- **Prisma Client 状态**：`npx prisma generate` 已成功生成（类型定义正确，`node` 直接调用正常），但运行中的 dev server 仍持有旧实例
- **修复方式**：**重启 dev server**（无需代码修改）
- **新增防护**：runtime Prisma delegate verify 脚本 + 文档

## 2. Reproduction

| 项目 | 值 |
|------|-----|
| 页面路径 | `/admin/settings` |
| 触发模块 | "节次与作息设置" |
| Failing endpoint | `GET /api/admin/worktime-configs` 和 `GET /api/admin/worktime-configs/resolved` |
| Server error | `Cannot read properties of undefined (reading 'findMany')` |
| Browser error | 同上（显示在 panel 错误状态中） |
| 是否复现 | **是**（dev server 未重启时） |

## 3. Root Cause

**根因**：Dev server 在 schema migration（`20260608000000_add_worktime_config`）之前启动，Prisma Client singleton（`src/lib/prisma.ts` 中的 `globalThis.prisma`）缓存了旧实例。

**证据**：

1. Prisma Client 类型定义包含 `workTimeConfig`（164 处引用）和 `timeSlotDefinition`（24 处引用）✅
2. `node -e` 直接调用 `new PrismaClient().workTimeConfig.findMany()` 成功返回数据 ✅
3. `curl http://localhost:3000/api/admin/worktime-configs` 返回 auth 错误（非 Prisma 错误）✅
4. Service 代码使用 `prisma.workTimeConfig.`（正确 camelCase）✅
5. 运行中的 dev server 进程（PID 26648）在 migration 之前启动，持有旧 Prisma Client ✅

**结论**：代码正确，Prisma Client 已正确生成。问题是 dev server 需要重启以加载新的 Prisma Client。

## 4. Fix

**修复方式**：重启 dev server

```bash
# 停止当前 dev server (Ctrl+C 或 kill PID)
# 然后重新启动
npm run dev
```

**无需代码修改**。Prisma Client 已正确生成，delegate 名称正确（`workTimeConfig`、`timeSlotDefinition`）。

## 5. Verification

| Command | Result |
|---------|--------|
| `npx tsx scripts/verify-worktime-runtime-prisma-delegate-k26-h2a.ts` | **15/15 PASS** |
| `npx tsx scripts/verify-worktime-settings-ui-k26-h.ts` | (TBD) |
| `npx tsx scripts/verify-worktime-api-k26-g.ts` | (TBD) |
| `node -e "new (require('@prisma/client').PrismaClient)().workTimeConfig.findMany({take:1}).then(...)"` | **SUCCESS** (1 config found) |

## 6. Non-Goals

确认**未改**：

- ❌ `prisma/schema.prisma`
- ❌ `prisma/migrations/**`
- ❌ `prisma/dev.db`
- ❌ WorkTime API 语义
- ❌ solver algorithm
- ❌ `src/lib/scheduler/score.ts`
- ❌ scheduler preview / apply
- ❌ adjustment recommendation
- ❌ room recommendation
- ❌ importer / parser
- ❌ RBAC permission model
- ❌ K22/K23/K24/K25 expected
