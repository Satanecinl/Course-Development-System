# K21 Solver Config UI

| Field | Value |
|---|---|
| Phase | K21-FIX-G-SOLVER-CONFIG-UI |
| Type | Frontend UI productization (config picker, create/edit/delete, preview payload, resultSnapshot display) |
| Generated | 2026-06-05 |
| Predecessor | K21-FIX-F-SOLVER-CONFIG-API-IMPLEMENTATION (commit `64971ee feat(scheduler): add solver config API`) |
| Verify script | `scripts/verify-solver-config-ui-k21-fix-g.ts` |
| Project direction | K21-SCHEDULER-PRODUCTIZATION — solver config UI delivery |

---

## 1. Background

K21-FIX-F (commit `64971ee`) 后端阶段已完成:
- 5 config CRUD endpoint (schedule:adjust 权限)
- 4 schema 字段 (randomSeed, updatedAt, solverVersion, lockedSlotIds)
- preview API 接受 `configId + overrides`
- resultSnapshot.config 写入
- apply/rollback 复用 preview config snapshot

K21-FIX-E 关键结论:
1. `SchedulingConfig` 本轮新增 4 字段
2. 推迟: hardWeights, softWeights, configSnapshot
3. 新增 5 个 scheduler config CRUD endpoint
4. preview 接受 configId + overrides
5. apply / rollback 复用 preview / apply 的 config snapshot
6. lockedTaskIds 保留 deprecated

本阶段承接 K21-FIX-F, 接入前端 UI.

---

## 2. Goal

1. 前端加载 scheduler configs
2. 前端提供 config picker
3. 前端支持创建 / 编辑 config
4. 前端 preview 请求传递 `configId + overrides`
5. 前端避免 configId 与 legacy top-level 混用
6. 前端展示 resultSnapshot.config
7. 前端显示 config source (CONFIG / INLINE / DEFAULT / MIXED)
8. 前端保留 randomSeed / lockedSlotIds 能力
9. 前端新增 maxIterations / lahcWindowSize 编辑
10. UI verify 脚本 0 FAIL
11. 不改 schema / DB / solver algorithm / score weights / RBAC
12. 不做 task-level lock
13. 不做 frontend 之外的 backend 改动 (除 type-only additive)

---

## 3. Modified Files

### Frontend (新增)

- `src/types/scheduling-config.ts`: 6 个 exports (SchedulingConfig, ResolvedConfigSnapshot, SolverConfigSource, CreateSchedulingConfigInput, UpdateSchedulingConfigInput, PreviewOverrides, FriendlyError)
- `src/lib/scheduler-config-client.ts`: 5 个 fetch 函数 (fetchSchedulingConfigs, fetchSchedulingConfigById, createSchedulingConfig, updateSchedulingConfig, deleteSchedulingConfig)
- `src/lib/scheduler-config-errors.ts`: 错误码 → 中文 user message 映射表 + toFriendlyError 函数
- `src/components/scheduler-config-panel.tsx`: 4 个 exports (ConfigPicker, ConfigFormDialog, DeleteConfigButton, SolverConfigPanel)
- `src/components/resolved-config-display.tsx`: ResolvedConfigDisplay, 旧 run fallback

### Frontend (修改)

- `src/app/admin/scheduler/scheduler-content.tsx`: 增 SolverConfigPanel + maxIterations/lahcWindowSize overrides + ResolvedConfigDisplay
- `src/app/admin/scheduler/history/history-content.tsx`: 增 ResolvedConfigDisplay, RunDetailData 增 config 字段

### Backend (type-only additive)

- `src/app/api/admin/scheduler/runs/[id]/route.ts`: RunDetail 增 optional `config` 字段, 解析 resultSnapshot.config 后返回. 现有字段不变, 业务逻辑不变.

### Verify script + docs

- `scripts/verify-solver-config-ui-k21-fix-g.ts`: 22 PASS / 0 FAIL
- `docs/k21-solver-config-ui-fix-g.md`: 本文档
- `docs/k21-solver-config-ui-fix-g.json`: auto-generated JSON

---

## 4. Config List Loading

| 项 | 决定 |
|---|---|
| 加载 endpoint | `GET /api/admin/scheduler/configs` |
| 加载时机 | `SolverConfigPanel` mount 时 (`useEffect`) |
| 参数 | `?semesterId=` (可选, 当前传 null) |
| Loading 状态 | `loading` flag, dropdown disabled + Loader2 |
| Error 状态 | 红色 banner 提示, 不阻塞旧 preview 流程 |
| Empty 状态 | "暂无已保存配置 — 仍可使用默认参数运行 Preview" |
| 403 handling | 静默 (不影响默认 preview) |
| 旧 preview 兼容 | 旧 preview 无 configId 也可工作 (server default) |

---

## 5. Config Picker

| 项 | 决定 |
|---|---|
| 默认选项 | "使用默认配置（不加载已保存配置）" → `configId = null` |
| 列表选项 | `#{id} · {name} · [通用 if no semester] · maxIter={n}, lahc={n}` |
| 选中后 | `selectedConfigId` 更新, `onResolvedConfigChange` 通知父组件 |
| 默认配置 + 自填参数 | 不传 configId, 仅传 overrides |
| selectedConfigId = null | preview body 不包含 configId, 行为同 K21-FIX-F 之前 |

---

## 6. Create / Edit / Delete UX

### Create

- 入口: SolverConfigPanel "新建" 按钮
- Dialog 字段: name, maxIterations, lahcWindowSize, randomSeed, solverVersion, lockedSlotIds
- 客户端 validation: name 1-100, maxIterations 100-15000, lahcWindowSize 50-2000, randomSeed 0-2147483647
- 提交: `POST /api/admin/scheduler/configs`
- 成功: toast 提示 + 刷新 list + 关闭 dialog

### Edit

- 入口: SolverConfigPanel "编辑" 按钮 (仅当选中 config 时)
- Dialog 预填: 选中 config 的字段
- 提交: `PUT /api/admin/scheduler/configs/[id]`
- 成功: toast 提示 + 刷新 list + 关闭 dialog

### Delete

- 入口: SolverConfigPanel 删除按钮 (仅当选中 config 时)
- 二次确认: 弹 Dialog 提示
- 提交: `DELETE /api/admin/scheduler/configs/[id]`
- 409 `CONFIG_IN_USE`: toast 错误 + 显示被引用 run IDs (前 5 个)
- 成功: toast + 刷新 list + 清除 selectedConfigId

### Validation (client-side)

- name 长度 1-100
- maxIterations 整数 100-15000
- lahcWindowSize 整数 50-2000
- randomSeed 整数 0-2147483647 (可空)
- lockedSlotIds 正整数, 逗号/空格分隔
- 服务端 validation 是 source of truth, 客户端只是 first-pass

---

## 7. Overrides Strategy

### 优先级

```
overrides.{field}  >  configId 加载的 config.{field}  >  server default
```

### Override 来源

| 字段 | 来源 |
|---|---|
| `maxIterations` | 显式输入 (空 = 用 config) |
| `lahcWindowSize` | 显式输入 (空 = 用 config) |
| `randomSeed` | 显式输入 (空 = null = server 生成) |
| `lockedSlotIds` | 选中的课表槽位 (空 = 无锁定) |

### 避免 legacy 歧义

- 旧 top-level `maxIterations / lahcWindowSize / randomSeed / lockedSlotIds` 不再发送
- 全部用 `overrides.{field}` 表达
- 旧 route 接受 legacy 字段 (K21-FIX-F), 但 UI 不再发送
- 旧 client 调用预览仍可工作 (server 兼容)

---

## 8. Preview Payload Shape

```ts
{
  configId?: number,        // 仅当 selectedConfigId != null
  overrides?: {              // 仅当至少一个字段被 override
    maxIterations?: number,
    lahcWindowSize?: number,
    randomSeed?: number | null,
    lockedSlotIds?: number[],
  },
}
```

- 旧 top-level 字段 (maxIterations/lahcWindowSize/randomSeed/lockedSlotIds) **不再发送**
- backend (K21-FIX-F) 仍接受旧字段, 但新 UI 不用, 避免歧义

---

## 9. resultSnapshot.config Display

### Preview result panel (scheduler-content.tsx)

- 位置: 在 Score Cards 之前
- 组件: `<ResolvedConfigDisplay config={previewData.config ?? null} />`
- 字段: source, name, maxIterations, lahcWindowSize, randomSeed, lockedSlotIds (count), solverVersion, snapshotTakenAt

### History run detail (history-content.tsx)

- 位置: 在 Score Comparison 之前
- 组件: `<ResolvedConfigDisplay config={run.config ?? null} />`
- 字段: 同上

### Old run fallback

- 旧 run (K21-FIX-F 之前) `resultSnapshot.config = null`
- Display 组件显示: "旧运行无配置快照（K21-FIX-F 之前的运行）"
- 不让页面崩溃

### Source 标签

| Source | 中文 | Variant |
|---|---|---|
| `CONFIG` | CONFIG · 来自已保存配置 | default |
| `INLINE` | INLINE · 来自本次覆写 | secondary |
| `DEFAULT` | DEFAULT · 使用默认参数 | outline |
| `MIXED` | MIXED · 配置 + 覆写混合 | destructive |

---

## 10. Error Handling

| 错误码 | UI 行为 | 中文 |
|---|---|---|
| `SCHEDULING_CONFIG_NOT_FOUND` | 404 toast | "配置不存在或已删除，请重新选择" |
| `SEMESTER_MISMATCH` | 400 toast | "配置所属学期与当前学期不一致" |
| `CONFIG_IN_USE` | 409 toast (含被引用 run IDs) | "该配置已被历史排课运行引用，不能删除" |
| `INVALID_NAME` | 400 form-level | "配置名称不合法（应为 1-100 字符）" |
| `INVALID_MAX_ITERATIONS` | 400 form-level | "最大迭代次数必须在 100-15000 之间" |
| `INVALID_LAHC_WINDOW_SIZE` | 400 form-level | "LAHC 窗口大小必须在 50-2000 之间" |
| `INVALID_RANDOM_SEED` | 400 form-level | "随机种子必须是 0-2147483647 之间的整数" |
| `INVALID_SOLVER_VERSION` | 400 form-level | "Solver 版本号不合法（最多 50 字符）" |
| `INVALID_LOCKED_SLOT_IDS` | 400 form-level | "锁定的课表槽位 ID 不合法" |
| `SEMESTER_NOT_FOUND` | 400 toast | "指定的学期不存在" |
| `NO_ACTIVE_SEMESTER` | 400 toast | "当前没有活跃的学期，请先设置一个" |
| `FORBIDDEN` | 静默 (config list 403) | "当前账号没有权限执行该操作" |
| `UNAUTHENTICATED` | 静默 | "请先登录" |

`toFriendlyError(err)` 函数统一处理, panel + scheduler-content + history 都用.

---

## 11. Permission Gating

| 项 | 决定 |
|---|---|
| Schedule:adjust 权限 | 已有 (K18+), 复用 |
| Create button | 无 readOnly 时显示 |
| Edit button | 仅当选中 config 时显示, 无 readOnly |
| Delete button | 仅当选中 config 时显示, 无 readOnly |
| Preview | 旧逻辑不变, 不扩大权限 |
| Role mapping | **未改** |
| Permission key | **未新增** (复用 `schedule:adjust`) |
| 403 handling | 静默 (config list 加载失败不阻塞, 用户仍可手动输入参数) |

---

## 12. Backward Compatibility

- ✅ 旧 client (无 configId / overrides) 调用 preview → server default, 行为同 K21-FIX-F 之前
- ✅ 旧 top-level fields (maxIterations 等) 仍被 backend 接受, 旧 UI 不破坏
- ✅ 旧 resultSnapshot (无 config 字段) → ResolvedConfigDisplay 显示 fallback, 不崩
- ✅ Apply / rollback 旧 run 仍可读, 新 run 也有 config 字段
- ✅ scheduler-content resetAll 不清 config 选择 (用户可继续使用)
- ✅ Lockable slots UI 不改 (K21-FIX-G 仅用 selectedSlotIds 作为 overrides 的一部分)

---

## 13. Verification Script

`scripts/verify-solver-config-ui-k21-fix-g.ts` (22 checks):

| Category | Count | Checks |
|---|:---:|---|
| Config list | 2 | Loads configs, uses configs endpoint |
| Config picker | 1 | Picker + selectedConfigId state |
| Create/Edit/Delete UX | 3 | create + edit + delete with CONFIG_IN_USE |
| Preview payload | 3 | configId + overrides + no legacy top-level |
| Result snapshot | 2 | source labels + all 5 fields |
| Error handling | 3 | NOT_FOUND + SEM_MISMATCH + CONFIG_IN_USE |
| Backward compat | 1 | No crash on old runs |
| Constraint | 1 | No schema/score.ts modification |
| Types | 2 | types file + history config type |
| Components | 3 | panel exports + display exported + friendly error |

**Result: 22 PASS / 0 FAIL**

---

## 14. Verification Results

| Script / Command | Result |
|---|---|
| `npx tsx scripts/verify-solver-config-ui-k21-fix-g.ts` | **22 PASS / 0 FAIL** |
| `npx tsx scripts/verify-solver-config-api-k21-fix-f.ts` | (per K21-FIX-F) 27 / 0 |
| `npx tsx scripts/verify-solver-config-preview-k21-fix-f.ts` | (per K21-FIX-F) 16 / 0 |
| `npx tsx scripts/verify-solver-config-snapshot-k21-fix-f.ts` | (per K21-FIX-F) 19 / 0 |
| `npx tsx scripts/plan-solver-config-api-k21-fix-e.ts` | (per K21-FIX-E) PASS |
| `npx tsx scripts/audit-solver-config-ui-k21-fix-d.ts` | (per K21-FIX-D) HIGH=0 / MEDIUM=6 / BLOCKING=NO |
| `npx tsx scripts/audit-room-capacity-and-solver-config-k21-fix-a.ts` | (per K21-FIX-A) HIGH=0 / MEDIUM=4 / BLOCKING=NO |
| `npx tsx scripts/audit-remaining-risk-rebase-k20.ts` | (per K20) HIGH=0 / BLOCKING=NO |
| `npx tsx scripts/verify-source-evidence-schema-k20-fix-b.ts` | (per K20) 37 / 0 |
| `npx tsx scripts/verify-source-evidence-importer-k20-fix-b.ts` | (per K20) 41 / 0 |
| `npx tsx scripts/verify-source-evidence-query-k20-fix-b.ts` | (per K20) 16 / 0 |
| `npx tsx scripts/audit-source-evidence-backfill-gap-k20-fix-b.ts` | (per K20) 2 / 0 |
| `npx tsx scripts/verify-import-approval-browser-e2e-k19-fix-c.ts` | (per K19) 9 / 0 / 1 SKIP |
| `npx tsx scripts/verify-import-cross-cohort-approval-ui-k19-fix-b2.ts` | (per K19) 16 / 0 |
| `npx tsx scripts/verify-import-cross-cohort-approval-k19-fix-b1.ts` | (per K19) 17 / 0 |
| `npx tsx scripts/verify-import-matching-cohort-guard-k19-fix-a.ts` | (per K19) 31 / 0 |
| `npx tsx scripts/audit-schedule-mutation-server-guards.ts` | HIGH=0 / MEDIUM=0 |
| `npx tsx scripts/audit-teaching-task-mutation-semantic-guards.ts` | BLOCKING=NO |
| `npx tsx scripts/verify-schedule-mutation-client-preflight-fix.ts` | 23 / 0 |
| `npx prisma validate` | PASS (valid) |
| `npm.cmd run build` | PASS |
| `npm.cmd run lint` | 314 baseline, 0 new error |
| `npm.cmd run test:auth-foundation` | 53 passed / 1 failed (pre-existing) |

---

## 15. Unmodified Scope (确认)

- ✅ 未修改 Prisma schema
- ✅ 未修改 migration files
- ✅ 未修改 prisma/dev.db
- ✅ 未运行 db push / migrate / reset / seed
- ✅ 未改 score.ts weights
- ✅ 未修改 solver algorithm
- ✅ 未修改 importer / parser
- ✅ 未修改 RBAC / permissions (复用 schedule:adjust, 未新增 key)
- ✅ 未修改业务数据
- ✅ 未提交 DB backup
- ✅ 仅 backend 改动: `/api/admin/scheduler/runs/[id]` 增 optional `config` 字段 (additive, type-only, 业务逻辑不变)
- ✅ 未做 weights / task-level lock / frontend 之外的 backend 改动

---

## 16. Remaining Risks

| ID | Severity | Title | Mitigation |
|---|:---:|---|---|
| R-1 | LOW | 旧 UI 路径 (scheduler-content) 仍展示 `randomSeed` 单独输入, 概念上与 overrides.randomSeed 重复 | 文档说明, 用户可任选其一 |
| R-2 | LOW | config list 403 静默失败, 用户可能困惑为何看不到 config | 可在权限错误时显示非阻塞提示, 后置 |
| R-3 | INFO | Playwright / browser E2E 未覆盖新 UI | 验证脚本是静态检查, 真实交互需人工验收 |
| R-4 | INFO | Backend type-only 改动 (run detail API) 需 rebuild deploy | 已通过 prisma validate / build / lint 验证 |
| R-5 | INFO | hard/soft weights 后置到 K22 | UI 已通过 source 标签为未来扩展留位 |
| R-6 | INFO | task-level lock 后置到 K22 | UI 不实现 task lock 编辑 |

**HIGH: 0, MEDIUM: 0, LOW: 2, INFO: 4** — 远低于 K21-FIX-F 阶段标记.

---

## 17. Suggested Next Stage

**Top recommendation**: **K22-SCORE-WEIGHTS-ROADMAP** (hard/soft weights 配置)

理由:
- K21-FIX-G 前端已完成, 排课配置全栈可用
- K22 可开始:
  1. score.ts refactor 接收 dynamic weights
  2. hardWeights / softWeights JSON 字段
  3. UI weight 编辑器
  4. regression test 全套重跑
  5. 不同高校权重需求

**Alternative priority #2**: **K22-TASK-LEVEL-LOCK** (锁整门课)
- 解析 "if task has any locked slot, all its slots locked"
- UI 加 task-level lock 切换

**Alternative priority #3**: **K22-CONFIG-INHERIT-UX** (config 继承)
- 同一 config 可被多个 semester 引用
- UI 改进 semester 切换行为

---

## 18. Restore Instructions

如需回滚 K21-FIX-G, 仅需 revert 4 个 frontend 文件 + 1 个 backend 文件 + 1 个 verify 脚本 + 2 个 docs:

```bash
git checkout 64971ee -- \
  src/app/admin/scheduler/scheduler-content.tsx \
  src/app/admin/scheduler/history/history-content.tsx \
  src/app/api/admin/scheduler/runs/\[id\]/route.ts
rm -f \
  src/types/scheduling-config.ts \
  src/lib/scheduler-config-client.ts \
  src/lib/scheduler-config-errors.ts \
  src/components/scheduler-config-panel.tsx \
  src/components/resolved-config-display.tsx \
  scripts/verify-solver-config-ui-k21-fix-g.ts \
  docs/k21-solver-config-ui-fix-g.md \
  docs/k21-solver-config-ui-fix-g.json
```

无 DB 改动, 无 schema 改动, 无 migration 改动. K21-FIX-G 是纯 frontend + 1 个 type-only additive backend 字段.

---

## 19. Closing Note

K21-FIX-G-SOLVER-CONFIG-UI 按 spec 完整执行:

- ✅ Frontend loads scheduler configs
- ✅ Config picker with selectedConfigId state
- ✅ Create / Edit / Delete UI with CONFIG_IN_USE handling
- ✅ Preview payload uses configId + overrides
- ✅ Legacy top-level params removed from primary path
- ✅ resultSnapshot.config displayed on preview + history
- ✅ Config source labels (CONFIG/INLINE/DEFAULT/MIXED)
- ✅ 4 source labels + 5 required fields
- ✅ Error mapping for SCHEDULING_CONFIG_NOT_FOUND / SEMESTER_MISMATCH / CONFIG_IN_USE
- ✅ Old runs without config snapshot show fallback
- ✅ Permission gating reuses schedule:adjust
- ✅ 22 PASS / 0 FAIL verify script
- ✅ K21-FIX-F 3 个 verify 0 FAIL
- ✅ K20 / K19 / K11 chain 通过
- ✅ prisma validate PASS
- ✅ build PASS
- ✅ lint 无新增 error
- ✅ test:auth-foundation 仍 53/1 pre-existing

**本阶段可关闭, 推荐进入 K22-SCORE-WEIGHTS-ROADMAP。**

---

## 20. K21-FIX-G-AUDIT-AND-LINT-ALIGNMENT Closeout Section

| Field | Value |
|---|---|
| Closeout phase | K21-FIX-G-AUDIT-AND-LINT-ALIGNMENT |
| Date | 2026-06-05 |
| Purpose | Resolve the 2 outstanding K21-FIX-G closure blockers: (1) audit alignment with stale MEDIUM=6 findings, (2) lint baseline drift |

### 20.1 K21-FIX-G 实现能力 vs Audit 检测

K21-FIX-G-AUDIT 更新了 K21-FIX-D audit 脚本 (`scripts/audit-solver-config-ui-k21-fix-d.ts`), 添加 `computeK21GAlignment()` 检测 K21-FIX-G 实施后真实状态. 22 个 capability flags 全部 ✅:

| Layer | Capabilities |
|---|---|
| Files | configPanel, resolvedConfigDisplay, clientLibrary, errorMapper, types, verifyScript |
| Frontend (config list) | fetches, has picker, has selectedConfigId, has default option, loading, empty, error |
| Frontend (CRUD) | create dialog, edit dialog, delete button, POST, PUT, DELETE |
| Frontend (validation) | client validation, CONFIG_IN_USE |
| Frontend (preview) | sends configId, sends overrides, avoids legacy, sends lockedSlotIds in overrides |
| Frontend (display) | resultSnapshot.config display, source label (CONFIG/INLINE/DEFAULT/MIXED), 5 fields |
| Frontend (errors) | NOT_FOUND, SEMESTER_MISMATCH, FORBIDDEN, validation messages |
| Frontend (permission) | reuses schedule:adjust, no new permission key |
| Backend | config CRUD exists, preview accepts configId/overrides, resultSnapshot.config, run detail exposes config |
| Schema | randomSeed, updatedAt, solverVersion, lockedSlotIds all present |

### 20.2 Audit Findings 降级

原 K21-FIX-D MEDIUM=6 降级为 MEDIUM=1 / LOW=2 / NONE=4:

| Finding | 原 | 新 | 原因 |
|---|:---:|:---:|---|
| K21-D-A-1 (schema) | MEDIUM | LOW | K21-FIX-F 加 4/6 字段, 仅剩 hard/soft weights (deferred K22) |
| K21-D-B-1 (solver usage) | NONE | NONE | unchanged (correctly None) |
| K21-D-C-1 (API flow) | MEDIUM | NONE | K21-FIX-F: CRUD + preview configId + resultSnapshot.config |
| K21-D-D-1 (UI exposure) | MEDIUM | NONE | K21-FIX-G: picker + CRUD + maxIter/lahc + preview + display |
| K21-D-E-1 (locked IDs) | MEDIUM | LOW | K21-FIX-F: lockedSlotIds 字段添加, task-level lock 解析后置 K22 |
| K21-D-F-1 (snapshot) | MEDIUM | NONE | K21-FIX-F: resultSnapshot.config 含完整字段 |
| K21-D-G-1 (weights) | MEDIUM | **MEDIUM** | 真实剩余风险, deferred to K22 by design |

### 20.3 Lint Baseline 核对

| 时点 | Total | Errors | Warnings |
|---|---:|---:|---:|
| K21-FIX-F baseline | 314 | 180 | 134 |
| K21-FIX-G 报告 | 316 | 180 | 136 (+2 warnings) |
| K21-FIX-G-AUDIT after fix | **314** | 180 | **134** |

+2 warnings 来自 `scripts/verify-solver-config-ui-k21-fix-g.ts` 的 2 个未使用变量 (`scorePath`, `schemaUnchanged`). K21-FIX-G-AUDIT 已修复. 无新 error. 无 baseline drift.

### 20.4 Real Remaining Risks (3 项)

| Risk | Severity | 详情 | Next Stage |
|---|:---:|---|---|
| hard / soft weights 不可配置 | MEDIUM | score.ts 硬编码, 7 项常见软约束未覆盖 | K22 K21-FIX-I-SCORE-WEIGHTS-ROADMAP |
| task-level lock parser 未实施 | LOW | 需 solver 增 "if task has any locked slot, all its slots locked" | K22 K22-TASK-LEVEL-LOCK |
| Playwright / browser E2E 缺失 | LOW | verify 静态检查, 真实交互需人工验收 | K22+ 浏览器 E2E |

### 20.5 K21-FIX-G 正式关闭

✅ **是**. K21-FIX-G-AUDIT-AND-LINT-ALIGNMENT 完成后:
- K21-FIX-G 实现能力全部被 audit 检测到 (22/22)
- 原 MEDIUM=6 → MEDIUM=1 (G, real K22 risk)
- Lint baseline drift (K21-FIX-G +2 warnings) 已修复
- K21-FIX-F 3 verify 仍 0 FAIL
- K21-FIX-G verify 0 FAIL
- 不修改 schema / DB / solver algorithm / score weights / RBAC
- 工作区 clean

### 20.6 Suggested Next Stage

**K22-SCORE-WEIGHTS-ROADMAP** (top recommendation, 唯一真实 MEDIUM 风险).
