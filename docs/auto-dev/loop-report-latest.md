# AutoDev Loop Report — Loop 1 Plan

## Loop 信息

- Loop 编号：1
- 阶段名：K11-SCHEDULE-MUTATION-SERVER-GUARD-FIX-A
- 阶段类型：fix
- 开始 commit：365b71c

## 本轮目标

为 schedule slot mutation 路径增加 server-side conflict check + same-semester guard。

## 修改范围

1. 新增 `src/lib/schedule/slot-mutation-guard.ts` — 共享 guard 逻辑
2. 修改 `src/app/api/schedule-slot/[id]/route.ts` — PUT 增加 guard
3. 修改 `src/app/api/schedule-slot/route.ts` — POST 增加 guard
4. 修改 `src/app/api/admin/[model]/route.ts` — scheduleslot PUT/POST 增加 conflict check
5. 新增 `scripts/verify-schedule-mutation-server-guard-fix-a.ts` — 验证脚本
6. 新增 `docs/k11-schedule-mutation-server-guard-fix-a.md` — 文档

## 禁止事项

- 不修改 schema
- 不运行 db push/migrate
- 不修改 solver/parser/importer/seed
- 不处理 DELETE / TeachingTask updateMany / RBAC 收窄
- 不修改 UI

## 验证命令

- `npx.cmd tsx scripts/verify-schedule-mutation-server-guard-fix-a.ts`
- `npm.cmd run build`

## 预期 commit message

`fix(schedule): enforce server guards for slot mutations`
