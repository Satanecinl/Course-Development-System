# K26-B: Scheduler Config Settings Integration

## 1. Executive Summary

K26-B integrates the "排课参数设置" (Scheduler Config Settings) module into the system settings center (`/admin/settings`). This reuses the existing K21 SchedulingConfig CRUD API, client, types, and UI components — no new backend was created.

Key outcomes:
- **Reused**: Existing `SchedulingConfig` API routes (GET/POST/PUT/DELETE), `scheduler-config-client.ts`, `scheduler-config-errors.ts`, `ConfigFormDialog`, `DeleteConfigButton`, and `SchedulingConfig` type
- **New**: `SchedulerConfigSettingsPanel` — a table-based list view for the settings center
- **Updated**: `settings-modules.ts` status from `planned` to `ready`, `settings-center.tsx` to route scheduler-config to the new panel
- **Not changed**: schema, migrations, DB, API semantics, solver algorithm, score.ts, scheduler preview/apply

## 2. GitHub Sync Status

| Item | Value |
|------|-------|
| Branch | `master` |
| Remote | `origin` → `https://github.com/Satanecinl/course-development-system.git` |
| Tracking branch | `origin/master` |
| Local HEAD before | `c11a8ab` |
| Remote HEAD before | `c11a8ab` |
| Local HEAD after | (to be filled after push) |
| Remote HEAD after | (to be filled after push) |
| Ahead/behind | up to date |
| Fetch | yes |
| Push | (to be confirmed) |
| Force push | false |

## 3. Existing SchedulingConfig Audit

| Item | Existing Path | Reused? | Notes |
|------|--------------|---------|-------|
| SchedulingConfig model | `prisma/schema.prisma` (model SchedulingConfig) | ✅ read-only | id, name, semesterId, maxIterations, lahcWindowSize, randomSeed, solverVersion, lockedSlotIds, lockedTaskIds (deprecated), createdAt, updatedAt |
| GET/POST configs API | `src/app/api/admin/scheduler/configs/route.ts` | ✅ reused | Permission: `schedule:adjust` |
| GET/PUT/DELETE config API | `src/app/api/admin/scheduler/configs/[id]/route.ts` | ✅ reused | DELETE returns 409 CONFIG_IN_USE if referenced by SchedulingRun |
| Config client | `src/lib/scheduler-config-client.ts` | ✅ reused | fetchSchedulingConfigs, createSchedulingConfig, updateSchedulingConfig, deleteSchedulingConfig |
| Error handler | `src/lib/scheduler-config-errors.ts` | ✅ reused | toFriendlyError with 20+ error codes |
| Config types | `src/types/scheduling-config.ts` | ✅ reused | SchedulingConfig, CreateSchedulingConfigInput, UpdateSchedulingConfigInput |
| ConfigFormDialog | `src/components/scheduler-config-panel.tsx` | ✅ reused | Create/edit dialog with client-side validation |
| DeleteConfigButton | `src/components/scheduler-config-panel.tsx` | ✅ reused | Handles CONFIG_IN_USE error |
| SolverConfigPanel | `src/components/scheduler-config-panel.tsx` | ⬜ not used in settings | Picker-based panel for inline scheduler use; not duplicated |
| ResolvedConfigDisplay | `src/components/resolved-config-display.tsx` | ⬜ not used in settings | Read-only snapshot viewer for run results |
| Config validation | `src/lib/scheduler/config.ts` | ✅ reused (server-side) | validateConfigPayload, CONFIG_LIMITS, parseLockedSlotIdsJson |
| Permission | `schedule:adjust` | ✅ unchanged | No new RBAC permission added |

### API Capabilities Confirmed

- **GET /api/admin/scheduler/configs**: List all configs, optional `?semesterId=` filter
- **POST /api/admin/scheduler/configs**: Create config (name required, all solver params optional with defaults)
- **GET /api/admin/scheduler/configs/[id]**: Fetch single config
- **PUT /api/admin/scheduler/configs/[id]**: Partial update of any field
- **DELETE /api/admin/scheduler/configs/[id]**: Delete config; 409 if SchedulingRun references it

### Delete Protection

DELETE checks `schedulingRun.findMany({ where: { configId: id } })`. If any runs reference the config, returns `409 CONFIG_IN_USE` with the `runIds`. The UI displays this as: "该配置已被排课运行记录使用，不能删除。"

### Semester Scope

`SchedulingConfig.semesterId` is required (NOT NULL, backfilled in K25-C). The API resolves the active semester if not provided on POST.

## 4. UI Implemented

### Settings Center Module Status

- `scheduler-config` module: `status: "ready"`, `priority: "P1"`, `recommendedStage: "K26-B-COMPLETED"`
- `semester-settings` module: `status: "ready"` (unchanged)
- All other 7 modules: `status: "planned"` / `"coming-soon"` / `"roadmap"` (unchanged)

### SchedulerConfigSettingsPanel

**File**: `src/components/settings/scheduler-config-settings-panel.tsx`

**Layout**:
1. **Info card** — Explains what scheduler config controls and explicitly lists non-goals (no score weights, no time-slot config, no room-rule config)
2. **Header bar** — Title "排课配置列表", config count badge, refresh button, "新建配置" button
3. **Config table** — Columns: ID, 名称, 最大迭代, LAHC 窗口, 随机种子, 锁定槽位, Solver 版本, 学期, 创建日期, 操作(编辑/删除)

### CRUD Operations

- **List**: Fetches via `fetchSchedulingConfigs()`, renders in table format
- **Create**: Opens `ConfigFormDialog` in create mode; fields include name, maxIterations, lahcWindowSize, randomSeed, solverVersion, lockedSlotIds
- **Edit**: Opens `ConfigFormDialog` in edit mode, pre-filled with config data
- **Delete**: Uses `DeleteConfigButton` which handles CONFIG_IN_USE 409 gracefully

### Validation (via reused ConfigFormDialog)

- `name`: 1-100 chars, required
- `maxIterations`: 100-15000
- `lahcWindowSize`: 50-2000
- `randomSeed`: optional, 0-2147483647
- `lockedSlotIds`: comma/space-separated positive integers

### States

- **Loading**: Spinner with "加载排课配置..." message (`data-testid="k26b-loading"`)
- **Error**: Red alert card with error message and retry button (`data-testid="k26b-error"`)
- **Empty**: Centered message "暂无排课配置" with create button (`data-testid="k26b-empty"`)
- **Submit loading**: Handled by reused `ConfigFormDialog`
- **Delete loading**: Handled by reused `DeleteConfigButton`

## 5. Compatibility

| Concern | Status | Notes |
|---------|--------|-------|
| K21 solver config capability | ✅ intact | Original `SolverConfigPanel` and all API routes unchanged |
| K22 score harness | ✅ unchanged | No modification to score.ts or expected test results |
| Scheduler preview/apply | ✅ unchanged | Preview route still uses configId/overrides resolution chain |
| K25 settings shell | ✅ intact | SemesterSettingsPanel still renders; other modules remain planned |
| K26-A shell | ✅ intact | Settings center navigation unchanged; only added routing for scheduler-config |
| ConfigFormDialog | ✅ reused | Importing from existing scheduler-config-panel.tsx, not duplicated |
| DeleteConfigButton | ✅ reused | CONFIG_IN_USE 409 handling intact |

## 6. Non-Goals

The following were explicitly **not** implemented in K26-B:

- Schema changes
- New migration
- Solver algorithm changes
- Score weights (hardWeights / softWeights)
- Soft constraint toggles
- 节次作息配置 (time-slot/worktime settings)
- 教室规则配置 (room rule settings)
- 调课规则配置 (adjustment rule settings)
- 导入规则配置 (import rule settings)
- RBAC permission model changes
- 数据维护/备份
- 审计日志

## 7. Verification Results

### K26-B Verification
```
npx tsx scripts/verify-scheduler-config-settings-integration-k26-b.ts
→ 47/47 PASS
```

### K26-A Shell Verification
```
npx tsx scripts/verify-system-settings-shell-k26-a.ts
→ 47/47 PASS
```

### K25 Verification Suite
```
npx tsx scripts/verify-semester-settings-acceptance-closeout-k25.ts → 38/38 PASS
npx tsx scripts/verify-semester-settings-ui-k25-i.ts → 45/45 PASS
npx tsx scripts/verify-semester-settings-api-k25-h.ts → 70/70 PASS
npx tsx scripts/verify-semester-selector-ux-k25-e.ts → 63/63 PASS
npx tsx scripts/validate-multi-semester-schema-k25-c.ts → 37/37 PASS
```

### K21 Verification Suite
```
npx tsx scripts/verify-solver-config-api-k21-fix-f.ts → PASS
npx tsx scripts/verify-solver-config-preview-k21-fix-f.ts → PASS
npx tsx scripts/verify-solver-config-snapshot-k21-fix-f.ts → 19/19 PASS
npx tsx scripts/verify-solver-config-ui-k21-fix-g.ts → 22/22 PASS
```

### Build / Schema / Lint
```
npx prisma validate → PASS
npx prisma migrate status → up to date
npm run build → PASS
npm run lint → 184 errors / 136 warnings (+0/+0 vs K26-A baseline)
```

## 8. Recommended Next Stage

```
K26-B1-SCHEDULER-CONFIG-SETTINGS-MANUAL-TRIAL
```

Before moving to K26-C (time-slot/worktime settings audit), it is recommended to perform a manual browser trial of the scheduler config settings panel to verify:
- Config list renders correctly
- Create/edit/delete operations work in the browser
- CONFIG_IN_USE error displays properly
- Existing solver page (SolverConfigPanel) still works independently
