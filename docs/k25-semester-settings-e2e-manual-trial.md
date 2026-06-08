# K25-J: Semester Settings E2E Manual Trial

## 1. Executive Summary

本阶段是浏览器人工验证阶段。不新增功能、不改 schema / API / UI。验证 K25-I 系统设置学期管理 UI 是否可真实使用。

**当前状态**: `manualTrial.status = READY` — 等待用户进行浏览器人工验证。

## 2. GitHub Sync Status

| Field | Value |
|---|---|
| Branch | `master` |
| Remote | `origin` → `git@github.com:Satanecinl/Course-Development-System.git` |
| Tracking | `origin/master` |
| Local HEAD | `8698680` |
| Remote HEAD | `8698680` |
| ahead/behind | up to date |
| Fetch | ✅ executed |
| Push | (after commit) |
| Force push | ❌ never |

## 3. Preflight

- ✅ Git clean
- ✅ Build pass
- ✅ K25-I UI verify PASS (45/45)
- ✅ K25-H API verify PASS (70/70)
- ✅ K25-E selector verify PASS (63/63)
- ✅ K25-C validation PASS (37/37)
- ✅ Active semester exists (LEGACY-DEFAULT, id=1)
- ✅ LEGACY-DEFAULT has dependencies (308 tasks, 440 slots, 57 adjustments, 37 imports) — non-deletable

## 4. Manual Trial Environment

| Item | Value |
|---|---|
| Browser | (to be filled by user) |
| URL | `http://localhost:3000/admin/settings` |
| Login user | admin (has `settings:manage`) |
| Environment | local dev (`npm run dev`) |
| Database | real `prisma/dev.db` |
| Active semester | LEGACY-DEFAULT (id=1) |

## 5. Manual Test Cases

### Case A：打开系统设置页

- [ ] 打开 `http://localhost:3000/admin/settings`
- [ ] 页面不是占位（不应显示"功能建设中"）
- [ ] 能看到"系统设置"标题
- [ ] 当前学期卡片正常显示（名称：既有数据默认学期）
- [ ] 学期列表表格正常显示

**Result**: __________ (PASS / FAIL / BLOCKED)
**Notes**: __________
**Screenshot**: __________

### Case B：新增空学期

- [ ] 点击"新增学期"按钮
- [ ] 弹窗打开，显示表单
- [ ] 填写：名称=`2026年秋季学期`，代码=`2026FALL`，学年=`2025-2026`，学期=`1`，起始日期=`2026-09-01`，结束日期=`2027-01-15`
- [ ] 不勾选"设为当前学期"
- [ ] 点击"创建"
- [ ] 提示"学期创建成功"
- [ ] 新学期出现在列表中
- [ ] 新学期 `isActive = false`（不是当前）
- [ ] `SemesterSelector`（dashboard 顶部）可看到新学期

**Result**: __________ (PASS / FAIL / BLOCKED)
**Notes**: __________
**Screenshot**: __________

### Case C：编辑学期

- [ ] 在列表中找到刚创建的 `2026年秋季学期`
- [ ] 点击编辑按钮（铅笔图标）
- [ ] 弹窗打开，预填现有数据
- [ ] 修改名称为 `2026年秋季学期（测试）`
- [ ] 修改起始日期为 `2026-09-05`
- [ ] 代码字段应为禁用状态
- [ ] 点击"保存"
- [ ] 提示"学期已更新"
- [ ] 列表中名称和日期更新
- [ ] `SemesterSelector` 中名称同步更新

**Result**: __________ (PASS / FAIL / BLOCKED)
**Notes**: __________
**Screenshot**: __________

### Case D：设置当前学期

- [ ] 在列表中找到 `2026年秋季学期（测试）`
- [ ] 点击"设为当前"按钮（对勾图标）
- [ ] 确认弹窗显示"确定将…设为当前学期吗？"
- [ ] 点击"确认设置"
- [ ] 提示"已将…设为当前学期"
- [ ] 当前学期卡片更新为新学期
- [ ] 旧 active（LEGACY-DEFAULT）的"当前"badge 消失
- [ ] `SemesterSelector` 同步更新
- [ ] Dashboard 不白屏，能正常加载
- [ ] Admin-db 不白屏，能正常加载

**Result**: __________ (PASS / FAIL / BLOCKED)
**Notes**: __________
**Screenshot**: __________

### Case E：删除空学期

- [ ] 确保要删除的学期是 `2026年秋季学期（测试）` 且已切回 LEGACY-DEFAULT 为 active
- [ ] 在列表中找到该学期
- [ ] 删除按钮应为可用状态（canDelete = true）
- [ ] 点击删除
- [ ] 确认弹窗显示"确定删除该空学期吗？"
- [ ] 点击"确认删除"
- [ ] 提示"学期已删除"
- [ ] 学期从列表中消失
- [ ] `SemesterSelector` 中该学期消失
- [ ] 如果 localStorage 指向被删除学期，刷新后 fallback 到 active

**Result**: __________ (PASS / FAIL / BLOCKED)
**Notes**: __________
**Screenshot**: __________

### Case F：阻止删除有数据学期

- [ ] 找到 `LEGACY-DEFAULT`（id=1）
- [ ] 删除按钮应为禁用状态
- [ ] 鼠标悬停应显示"当前激活学期"或"已有 N 条业务数据"
- [ ] 即使点击删除，弹窗应显示：
  - "该学期无法删除"
  - 依赖计数（教学任务 308、课表 440 等）
  - 阻塞原因列表
- [ ] 弹窗中不显示"确认删除"按钮

**Result**: __________ (PASS / FAIL / BLOCKED)
**Notes**: __________
**Screenshot**: __________

### Case G：阻止删除 active 学期

- [ ] 当前 active 学期的删除被阻止
- [ ] 阻塞原因包含"当前激活学期"
- [ ] 提示必须先切换当前学期

**Result**: __________ (PASS / FAIL / BLOCKED)
**Notes**: __________
**Screenshot**: __________

### Case H：localStorage 持久化

- [ ] 在 Dashboard 的 `SemesterSelector` 中选择某个学期
- [ ] 刷新页面（F5）
- [ ] `SemesterSelector` 仍显示上次选择的学期
- [ ] 如果删除该学期后再刷新，selector 应 fallback 到 active

**Result**: __________ (PASS / FAIL / BLOCKED)
**Notes**: __________
**Screenshot**: __________

### Case I：权限 / 入口

- [ ] 系统设置页仍需要 `settings:manage` 权限
- [ ] 普通 USER 角色无法访问 `/admin/settings`（应被重定向或显示 403）
- [ ] 侧边栏中"系统设置"入口对无权限用户不可见

**Result**: __________ (PASS / FAIL / BLOCKED)
**Notes**: __________
**Screenshot**: __________

### Case J：回归检查

- [ ] Dashboard (`/dashboard`) 仍能正常加载
- [ ] Admin-db (`/admin/db`) 仍能正常加载
- [ ] `SemesterSelector` 仍能切换学期
- [ ] 切换学期后 dashboard 数据刷新
- [ ] 浏览器 console 无 critical error
- [ ] 页面无卡死、白屏、无限 loading

**Result**: __________ (PASS / FAIL / BLOCKED)
**Notes**: __________
**Screenshot**: __________

## 6. Expected Constraints

- 不允许删除 `LEGACY-DEFAULT`（有 308 教学任务 + 440 课表 + 57 调课 + 37 导入批次）
- 不允许删除 active semester
- 不允许删除最后一个 semester
- 只有空学期（所有依赖计数 = 0）可删除
- 删除操作不会 cascade 删除业务数据

## 7. Trial Result

| Case | Result | Notes | Screenshot |
|------|--------|-------|------------|
| A. 打开系统设置页 | (pending) | | |
| B. 新增空学期 | (pending) | | |
| C. 编辑学期 | (pending) | | |
| D. 设置当前学期 | (pending) | | |
| E. 删除空学期 | (pending) | | |
| F. 阻止删除有数据学期 | (pending) | | |
| G. 阻止删除 active 学期 | (pending) | | |
| H. localStorage 持久化 | (pending) | | |
| I. 权限 / 入口 | (pending) | | |
| J. 回归检查 | (pending) | | |

**Overall**: (pending — awaiting human validation)

## 8. Decision Rules

| Condition | Next Stage |
|---|---|
| All critical cases PASS | K25-SEMESTER-SETTINGS-ACCEPTANCE-CLOSEOUT |
| UI 小问题但不阻塞 | K25-J1-SEMESTER-SETTINGS-E2E-FIX (UI polish) |
| API / data bug | K25-H1-SEMESTER-SETTINGS-API-FIX |
| Selector sync bug | K25-E2-SELECTOR-SYNC-FIX |
| 删除保护 bug | **blocker — 不能 closeout** |

## 9. Verification Results

| Command | Result |
|---|---|
| `npx tsx scripts/verify-semester-settings-e2e-manual-trial-readiness-k25-j.ts` | ✅ PASS=56 FAIL=0 |
| `npx tsx scripts/verify-semester-settings-ui-k25-i.ts` | ✅ PASS=45 FAIL=0 |
| `npx tsx scripts/verify-semester-settings-api-k25-h.ts` | ✅ PASS=70 FAIL=0 |
| `npx tsx scripts/audit-semester-settings-management-k25-g.ts` | ✅ PASS=58 FAIL=0 |
| `npx tsx scripts/verify-semester-selector-ux-k25-e.ts` | ✅ PASS=63 FAIL=0 |
| `npx tsx scripts/verify-semester-scoping-api-k25-d.ts` | ✅ PASS=54 FAIL=0 |
| `npx tsx scripts/validate-multi-semester-schema-k25-c.ts` | ✅ 37/37 PASS |
| `npx prisma validate` | ✅ valid |
| `npx prisma migrate status` | ✅ up to date |
| `npm run build` | ✅ compiled |
| `npm run lint` | ✅ 184 errors / 136 warnings |
| `npm run test:auth-foundation` | 53 passed / 1 failed |

## 10. Unmodified Scope

- ✅ Schema: not modified
- ✅ Migrations: not added
- ✅ DB: not written
- ✅ API semantics: not modified
- ✅ Frontend UI: not modified
- ✅ Scheduler / score / solver: not modified
- ✅ Importer / parser: not modified
- ✅ RBAC permission model: not modified
- ✅ K22 / K23 / K24 expected: not modified
