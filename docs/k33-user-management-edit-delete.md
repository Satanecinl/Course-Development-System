# K33-A: 用户管理编辑显示名称 + 安全删除

## 概述

管理员可在 `/admin/users` 页面修改用户显示名称、安全删除无业务依赖的用户。

## 修改范围

新增:
- `src/app/api/admin/users/[id]/route.ts` — PATCH (更新 displayName) + DELETE (安全删除)
- `scripts/verify-user-management-edit-delete-k33-a.ts` — 21 项检查

修改:
- `src/app/admin/users/users-content.tsx` — 新增编辑名称按钮 + 删除按钮 + 确认对话框

未改:
- schema / migration / prisma/dev.db
- RBAC 权限语义 (复用 `users:manage`，不新增 permission key)
- 调课/排课/导出/solver/score
- K22 expected

## PATCH /api/admin/users/[id] — 修改显示名称

鉴权: `requirePermission('users:manage')` (与现有 route 一致)

请求体: `{ displayName: string }`

校验: trim 非空, 1-50 字符; 只允许更新 displayName

返回: `{ success: true, user: { id, username, displayName } }`

## DELETE /api/admin/users/[id] — 安全删除

鉴权: `requirePermission('users:manage')`

保护规则 (按顺序):
1. 用户不存在 → 404 USER_NOT_FOUND
2. 不能删除自己 → 409 SELF_DELETE_FORBIDDEN
3. 不能删除内置 admin (username=admin) → 409 BUILTIN_ADMIN_DELETE_FORBIDDEN
4. 不能删除最后一个 ADMIN → 409 LAST_ADMIN_DELETE_FORBIDDEN
5. 有业务依赖 → 409 USER_HAS_DEPENDENCIES (返回依赖计数，建议使用"停用")
6. 安全用户 → prisma.$transaction 删除 (UserRole + Session 由 CASCADE 自动清理)

依赖检查:
- ScheduleAdjustmentRequest.submittedByUserId → 计数
- ScheduleAdjustmentRequest.reviewedByUserId → 计数
- SchedulingRun.operatorId → 计数

业务记录 (ScheduleAdjustmentRequest / ScheduleAdjustment / SchedulingRun) 不删除。

## UI 交互

编辑显示名称:
- 点「编辑」(铅笔图标) → 展开 inline 输入框 + 保存/取消
- 预填当前 displayName
- 保存成功 → toast + 刷新列表

删除用户:
- 点「删除」(垃圾桶图标, 红色) → 弹出确认对话框
- 显示用户名 + 显示名称 + 警告文字
- 确认后调用 DELETE API
- 409 错误 → toast 显示错误 + 建议使用停用
- 成功 → toast + 刷新列表

## 验证

```bash
npx tsx scripts/verify-user-management-edit-delete-k33-a.ts  # 21/21 PASS
npx prisma validate                                           # PASS
npx prisma migrate status                                     # 9 migrations, up to date
npm run build                                                 # PASS
npm run lint                                                  # 188/152 (= baseline)
npm run test:auth-foundation                                  # 60/2 (= baseline, pre-existing)
```

回归:
- K28 closeout: 41/41 PASS
- K32-A3: 26/26 PASS
- K32-A2: 35/35 PASS

## 关闭判断

- K33-A CAN CLOSE
- ✅ 21/21 verify PASS
- ✅ 所有回归 PASS
- ✅ build/lint/auth baseline 维持
- ✅ 无 schema/DB/RBAC/K22 变更
- ✅ 已 push origin/master
