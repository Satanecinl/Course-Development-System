# K26-A: System Settings Navigation Shell

## 1. Executive Summary

K26-A 将 `/admin/settings` 从单一学期设置页面升级为模块化系统设置中心。9 个设置模块以导航卡片形式展示，学期设置为已完成模块，其他模块显示为规划中/后续实现/后置状态，不实现任何业务逻辑。

## 2. GitHub Sync Status

| Field | Value |
|---|---|
| Branch | `master` |
| Remote | `origin` → `git@github.com:Satanecinl/Course-Development-System.git` |
| Tracking | `origin/master` |
| Local HEAD | `e81a6b8` |
| Remote HEAD | `e81a6b8` |
| ahead/behind | up to date |
| Fetch | ✅ executed |
| Push | (after commit) |
| Force push | ❌ never |

## 3. Implemented Shell

- **页面结构**: 左侧模块导航 + 右侧内容区
- **模块导航**: 9 个 SettingsModuleCard 组件，带状态 badge 和描述
- **学期设置集成**: 点击学期设置模块直接显示 K25-I SemesterSettingsPanel
- **未实现模块**: 点击后显示 PlannedModuleContent（描述、优先级、推荐阶段、风险等级、备注）

## 4. Settings Modules

| Module | Status | Priority | Recommended Stage |
|---|---|---|---|
| 学期设置 | ✅ 已完成 | P0 | K25-CLOSED |
| 排课参数设置 | 规划中 | P1 | K26-B-SCHEDULER-CONFIG-SETTINGS-INTEGRATION |
| 节次与作息设置 | 后续实现 | P2 | K26-C-TIME-SLOT-WORKTIME-SETTINGS-AUDIT |
| 校区/教室规则设置 | 后续实现 | P2 | K26-D-CAMPUS-ROOM-RULES-SCHEMA-PLAN |
| 调课规则设置 | 规划中 | P1 | K26-E-ADJUSTMENT-RULES-SETTINGS-AUDIT |
| 导入规则设置 | 规划中 | P1 | K26-F-IMPORT-RULES-SETTINGS-AUDIT |
| 权限与角色设置 | 后置 | P3 | K26-G-RBAC-SETTINGS-ROADMAP |
| 数据维护与备份 | 后置 | P3 | K26-H-DATA-MAINTENANCE-SETTINGS-ROADMAP |
| 审计日志 | 后置 | P3 | K26-I-AUDIT-LOG-SETTINGS-ROADMAP |

## 5. Non-Goals

- ❌ 排课参数真实配置
- ❌ 节次作息真实配置
- ❌ 教室规则真实配置
- ❌ 调课规则真实配置
- ❌ 导入规则真实配置
- ❌ 权限角色真实配置
- ❌ 数据维护备份真实功能
- ❌ 审计日志真实功能
- ❌ schema change
- ❌ migration
- ❌ DB write

## 6. Verification Results

| Command | Result |
|---|---|
| `npx tsx scripts/verify-system-settings-shell-k26-a.ts` | ✅ PASS=47 FAIL=0 |
| `npx tsx scripts/verify-semester-settings-acceptance-closeout-k25.ts` | ✅ PASS=38 FAIL=0 |
| `npx tsx scripts/verify-semester-settings-ui-k25-i.ts` | ✅ PASS=45 FAIL=0 |
| `npx tsx scripts/verify-semester-settings-api-k25-h.ts` | ✅ PASS=70 FAIL=0 |
| `npx tsx scripts/verify-semester-selector-ux-k25-e.ts` | ✅ PASS=63 FAIL=0 |
| `npx tsx scripts/validate-multi-semester-schema-k25-c.ts` | ✅ 37/37 PASS |
| `npx prisma validate` | ✅ valid |
| `npx prisma migrate status` | ✅ up to date |
| `npm run build` | ✅ compiled |
| `npm run lint` | ✅ 184 errors / 136 warnings |
| `npm run test:auth-foundation` | 53 passed / 1 failed |

## 7. Recommended Next Stage

`K26-B-SCHEDULER-CONFIG-SETTINGS-INTEGRATION`

K26-B 应聚焦排课参数设置接入设置中心，不做节次/教室/调课/导入/权限/备份/审计日志。
