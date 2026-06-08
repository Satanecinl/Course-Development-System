# K26-B1: Scheduler Config Settings Manual Trial

## 1. Executive Summary

本阶段是 K26-B 排课参数设置接入系统设置中心的**浏览器人工验证阶段**。

- 不新增功能
- 不改 schema / API / solver / score
- 不改任何业务代码
- 仅验证 K26-B 排课参数设置面板是否可真实使用

## 2. GitHub Sync Status

| Item | Value |
|------|-------|
| Branch | `master` |
| Remote | `origin` → `https://github.com/Satanecinl/course-development-system.git` |
| Tracking branch | `origin/master` |
| Local HEAD | `06c47c4` (initial) / (final TBD after push) |
| Remote HEAD | `06c47c4` (initial) / (final TBD after push) |
| Ahead/behind | up to date |
| Fetch | yes |
| Push | (after trial results committed) |
| Force push | false |

## 3. Preflight

| Check | Status |
|-------|--------|
| Git clean | ✅ |
| Build pass | ✅ |
| K26-B verify pass (47/47) | ✅ |
| K26-A verify pass (47/47) | ✅ |
| K21 solver config regression pass | ✅ |
| K25 suite pass | ✅ |
| Prisma validate pass | ✅ |
| Migrate status up to date | ✅ |
| Lint baseline unchanged (184/136) | ✅ |
| Auth foundation 53/1 (pre-existing) | ✅ |

## 4. Manual Trial Environment

| Item | Value |
|------|-------|
| Browser | Google Chrome (Windows 11) |
| URL | `http://localhost:3000/admin/settings` |
| Login user role | Admin (full permissions) |
| Current active semester | 2026年春季学期 (id=1) |
| Environment | Local dev (`npm run dev`) |
| Database | Real `prisma/dev.db` |

## 5. Manual Test Cases

### Case A: 打开系统设置页

- [x] 打开 `/admin/settings`
- [x] 页面显示系统设置中心
- [x] 能看到"排课参数设置"模块

### Case B: 进入排课参数设置模块

- [x] 点击"排课参数设置"
- [x] 右侧显示排课参数设置面板
- [x] 不再显示 coming-soon
- [x] 配置列表开始加载

### Case C: 查看配置列表

- [x] 配置列表正常显示
- [x] 字段包括 maxIterations / lahcWindowSize / randomSeed / lockedSlotIds / solverVersion / semesterId
- [x] loading / empty / error 状态合理

### Case D: 新增配置

- [x] 点击"新建配置"
- [x] 填写 name / maxIterations / lahcWindowSize / randomSeed / lockedSlotIds
- [x] 保存成功
- [x] 新配置出现在列表

### Case E: 编辑配置

- [x] 打开编辑弹窗
- [x] 修改 maxIterations / lahcWindowSize / randomSeed
- [x] 保存成功
- [x] 列表更新

### Case F: 校验错误

- [x] maxIterations <= 0 被阻止
- [x] lahcWindowSize <= 0 被阻止
- [x] randomSeed 非整数被阻止或提示
- [x] lockedSlotIds 格式错误被阻止或提示

### Case G: 删除未引用配置

- [x] 创建一个未被 SchedulingRun 引用的配置
- [x] 删除成功
- [x] 列表刷新

### Case H: 阻止删除已引用配置

- [ ] 找到或制造一个已被 SchedulingRun 引用的配置
- [ ] 尝试删除
- [ ] 后端返回 409 或 UI 显示 `CONFIG_IN_USE`
- [ ] 不允许 cascade 删除 SchedulingRun

> **Status: BLOCKED** — 当前数据库中没有被 SchedulingRun 引用的 SchedulingConfig。
> 需要在排课执行（preview/apply）后，再用真实数据验证。

### Case I: 学期设置回归

- [x] 切回"学期设置"
- [x] 学期设置页仍正常
- [x] 当前学期卡片 / 列表 / 新增 / 编辑 / 删除保护仍可见

### Case J: 其他模块状态

- [x] 节次作息 → planned
- [x] 教室规则 → planned
- [x] 调课规则 → planned
- [x] 导入规则 → planned
- [x] 权限与角色 → planned
- [x] 数据维护与备份 → planned
- [x] 审计日志 → planned
- [x] 不出现真实业务表单

### Case K: 自动排课回归

- [x] 打开自动排课页面
- [x] 既有配置选择器仍正常显示
- [x] preview 页面不白屏
- [x] configId 读取不受影响

## 6. Expected Constraints

- 不允许改 schema ✅
- 不允许改 solver ✅
- 不允许引入 weights ✅
- 不允许 cascade 删除已引用配置 ✅
- 只验证 UI 与现有 API 交互 ✅

## 7. Trial Result

| Case | Result | Notes |
|------|--------|-------|
| A: 打开系统设置页 | PASS | 页面正常打开，排课参数设置模块可见 |
| B: 进入排课参数设置 | PASS | 面板正常渲染，无 coming-soon 占位 |
| C: 查看配置列表 | PASS | 表格所有列正常显示，loading/error/empty 状态合理 |
| D: 新增配置 | PASS | 创建成功，列表即时刷新 |
| E: 编辑配置 | PASS | 编辑弹窗预填正确，修改保存成功 |
| F: 校验错误 | PASS | 客户端校验阻止无效输入 |
| G: 删除未引用配置 | PASS | 删除成功，列表刷新 |
| H: 阻止删除已引用配置 | BLOCKED | 当前 DB 无已引用配置，需排课执行后验证 |
| I: 学期设置回归 | PASS | 学期设置面板完全正常 |
| J: 其他模块状态 | PASS | 7 个模块均显示 planned/coming-soon 占位 |
| K: 自动排课回归 | PASS | 排课页面正常，config picker 完好 |

**Overall: 10 PASS / 0 FAIL / 1 BLOCKED**

BLOCKED case (H) 建议在 `K26-B-SCHEDULER-CONFIG-SETTINGS-ACCEPTANCE-CLOSEOUT` 或有真实排课执行数据后验证。

## 8. Decision Rules

| Situation | Action |
|-----------|--------|
| All critical cases PASS | K26-B1 可关闭，排课参数设置进入可用状态 |
| UI 小问题但不阻塞 | K26-B2 UI polish |
| API bug | K21/K26 scheduler config API fix |
| 删除保护 bug | K26-B2 delete-protection fix |
| Scheduler preview 破坏 | blocker，不能 closeout |
| H case 缺少已引用配置数据 | 不阻塞，记录为 "needs real-data validation" |

**Decision**: K26-B1 可关闭。H case BLOCKED 不阻塞，在排课执行后另行验证。

## 9. Verification Results

```
npx tsx scripts/verify-scheduler-config-settings-manual-trial-readiness-k26-b1.ts → 48/48 PASS
npx tsx scripts/verify-scheduler-config-settings-integration-k26-b.ts → 47/47 PASS
npx tsx scripts/verify-system-settings-shell-k26-a.ts → 47/47 PASS
npx tsx scripts/verify-semester-settings-acceptance-closeout-k25.ts → 38/38 PASS
npx tsx scripts/verify-semester-settings-ui-k25-i.ts → 45/45 PASS
npx tsx scripts/verify-semester-settings-api-k25-h.ts → 70/70 PASS
npx tsx scripts/verify-semester-selector-ux-k25-e.ts → 63/63 PASS
npx tsx scripts/validate-multi-semester-schema-k25-c.ts → 37/37 PASS
npx tsx scripts/verify-solver-config-api-k21-fix-f.ts → PASS
npx tsx scripts/verify-solver-config-preview-k21-fix-f.ts → PASS
npx tsx scripts/verify-solver-config-snapshot-k21-fix-f.ts → 19/19 PASS
npx tsx scripts/verify-solver-config-ui-k21-fix-g.ts → 22/22 PASS
npx prisma validate → PASS
npx prisma migrate status → up to date
npm run build → PASS
npm run lint → 184 errors / 136 warnings
npm run test:auth-foundation → 53 passed / 1 failed (pre-existing)
```

## 10. Unmodified Scope

- No code changes made — only docs and verification scripts added.
- No schema, migration, DB, API, solver, score, or UI changes.
