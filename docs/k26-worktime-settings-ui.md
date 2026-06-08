# K26-H: WorkTime Settings UI

## 1. Executive Summary

K26-H 将 WorkTime 接入系统设置中心 UI：

- "节次与作息设置"模块状态从 `coming-soon` 改为 `ready`
- 新增 `WorkTimeSettingsPanel`（resolved card + config list + slot table）
- 新增 `WorkTimeConfigFormDialog`（create/edit with slot editor）
- 新增 `WorkTimeConfigDeleteDialog`（delete protection error display）
- 新增 `worktime-settings-client.ts`（API client helper）
- 使用 K26-G WorkTime API
- **不接 solver / score / recommendation**
- **不改 K22/K23/K24/K25 expected**
- **不新增 schema / migration**

## 2. GitHub Sync Status

| Item | Value |
|------|-------|
| Branch | `master` |
| Remote | `origin` → `https://github.com/Satanecinl/Course-Development-System.git` |
| Tracking branch | `origin/master` |
| Local HEAD before | `aca864e` (K26-G) |
| Local HEAD after | (to be filled after push) |
| Remote HEAD before | `aca864e` |
| Remote HEAD after | (to be filled after push) |
| Ahead/behind | up to date |
| Fetch | yes |
| Pull/rebase | no |
| Push | yes |
| Force push | false |

## 3. UI Scope

### 3.1 Settings Module

- `settings-modules.ts`: `time-slot-worktime` status changed from `coming-soon` to `ready`
- `settings-center.tsx`: added `WorkTimeSettingsPanel` route for `time-slot-worktime` key
- Other modules unchanged (semester-settings, scheduler-config still ready; others planned/coming-soon/roadmap)

### 3.2 Resolved Config Card

- Calls `GET /api/admin/worktime-configs/resolved?semesterId=<id>`
- Shows source (database / staticFallback), config name, semester, allowWeekend, version, active teaching count, legacy display count
- If `staticFallback`, shows warning: "当前学期尚无数据库作息配置，正在使用静态默认配置。"

### 3.3 Config List

- Calls `GET /api/admin/worktime-configs?semesterId=<id>&includeSlots=true`
- Shows name, isDefault badge, isActive, allowWeekend, version, slot counts, updatedAt
- Actions: edit, activate/set default, delete

### 3.4 Slot Table

- Displays per-config slot definitions in a table
- Columns: slotIndex, label, startsAt, endsAt, isActive, isTeachingSlot, isLegacyDisplay
- Slots 6/7 highlighted with amber background and "传统" badge

### 3.5 Create / Edit Dialog

- Config fields: name, allowWeekend, lunchStart, lunchEnd, isActive, isDefault, notes
- Slot editor: table with 7 default slots, editable fields
- Default template: slots 1-5 active teaching, slots 6/7 inactive/non-teaching/legacy display
- Validation: name required, HH:mm format, duplicate slotIndex, active teaching requirement, slot 6/7 cannot be active teaching

### 3.6 Delete Dialog

- Confirmation dialog with config name display
- If API returns 409, shows specific protection error:
  - "默认配置不能删除"
  - "该学期最后一个活跃配置不能删除"
  - "该配置已被排课任务引用，不能删除"

### 3.7 Activate / Set Default

- Calls `POST /api/admin/worktime-configs/[id]/activate`
- Already-default config shows disabled button with filled star
- After activate, refreshes list and resolved card

### 3.8 Semester Integration

- Uses `useSemesterStore()` for `currentSemesterId`
- Switching semester reloads all configs and resolved config

## 4. API Client

`src/lib/settings/worktime-settings-client.ts`

| Function | Endpoint |
|----------|----------|
| `listWorkTimeConfigs(params)` | `GET /api/admin/worktime-configs` |
| `getWorkTimeConfig(id)` | `GET /api/admin/worktime-configs/[id]` |
| `createWorkTimeConfig(input)` | `POST /api/admin/worktime-configs` |
| `updateWorkTimeConfig(id, input)` | `PUT /api/admin/worktime-configs/[id]` |
| `deleteWorkTimeConfig(id)` | `DELETE /api/admin/worktime-configs/[id]` |
| `activateWorkTimeConfig(id)` | `POST /api/admin/worktime-configs/[id]/activate` |
| `resolveWorkTimeConfig(semesterId?)` | `GET /api/admin/worktime-configs/resolved` |
| `getWorkTimeErrorMessage(error)` | Error code → Chinese message |

## 5. Validation / Error Handling

### Frontend Validation

- `name` required, max 100 chars
- `lunchStart/lunchEnd` HH:mm format if provided
- `slot.label` non-empty
- `slot.startsAt/endsAt` HH:mm format if provided
- `slotIndex` unique within config
- At least one active teaching slot required
- Slot 6/7 cannot be active teaching
- Legacy display cannot be active teaching

### Backend Error Display

- `SEMESTER_NOT_FOUND` → "学期不存在"
- `WORKTIME_CONFIG_NAME_EXISTS` → "同名配置已存在，请使用其他名称"
- `WORKTIME_CONFIG_DEFAULT_IN_USE` → "默认配置不能删除"
- `WORKTIME_CONFIG_LAST_ACTIVE` → "该学期最后一个活跃配置不能删除"
- `WORKTIME_CONFIG_USED_BY_RUN` → "该配置已被排课任务引用，不能删除"
- `INVALID_SLOT_DEFINITION` → "节次定义无效"
- `INVALID_TIME_FORMAT` → "时间格式无效，请使用 HH:mm 格式"

## 6. Legacy Compatibility

- Slots 6/7 displayed with amber background and "传统" badge
- Form dialog shows warning: "11-12节和中午当前为传统显示节次，不能设为教学节次"
- Slot 6/7 `isTeachingSlot` checkbox disabled in form
- Resolved card shows legacy display count
- Info card warns: "当前配置不影响自动排课 solver 和 score 计算"

## 7. Compatibility / Non-Goals

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

## 8. Verification Results

| Command | Result |
|---------|--------|
| `npx tsx scripts/verify-worktime-settings-ui-k26-h.ts` | (TBD) |
| `npx tsx scripts/verify-worktime-api-k26-g.ts` | (TBD) |
| `npm run build` | **PASS** |
| `npx eslint .` | (TBD) |

## 9. Recommended Next Stage

```txt
K26-H WORKTIME SETTINGS UI VERIFY PASS
PASS=x FAIL=0
blocking=false
recommendedNextStage=K26-H1-WORKTIME-SETTINGS-UI-MANUAL-TRIAL
```

K26-H **建议关闭**。下一步进入 K26-H1（manual trial）：

- 浏览器手动验证 UI 功能
- 不新增功能
- K26-I/J 才接 recommendation / solver-score

---

## Verification Complete and Manual Validation Addendum

> 本节由 `K26-H1A-WORKTIME-SETTINGS-UI-VERIFICATION-COMPLETE` 追加。

### 阶段

`K26-H1A-WORKTIME-SETTINGS-UI-VERIFICATION-COMPLETE`

### K26-H 中缺失的 required regression

K26-H 完成报告缺少以下回归项，本阶段已补齐：

| 缺失项 | 本阶段结果 |
|--------|------------|
| K26-C audit | **PASS** (32/32) |
| K26-A shell | **PASS** (47/47) |
| K26-B closeout | **PASS** (38/38) |
| K25 closeout | **PASS** (38/38) |
| K25-C validation | **PASS** |

### H2A Runtime Bug

| 项目 | 值 |
|------|-----|
| Stage | `K26-H2A-WORKTIME-SETTINGS-UI-PRISMA-DELEGATE-RUNTIME-FIX` |
| Root cause | Dev server 使用了 schema migration 前的旧 Prisma Client singleton（`globalThis.prisma` 缓存了不含 `workTimeConfig` / `timeSlotDefinition` delegate 的旧实例） |
| Fix | 重启 dev server（无需代码修改） |
| Runtime delegate verify | **15/15 PASS** |
| Status | **RESOLVED** |

### 用户人工验证

| 项目 | 值 |
|------|-----|
| Status | **PASSED** |
| Source | `user-provided browser validation` |
| Note | 用户重启 dev server 后人工验证通过 |
| 不再出现 `Cannot read properties of undefined (reading 'findMany')` | ✅ |
| WorkTime settings UI 可正常打开 | ✅ |

### 完整验证命令表

| Command | Result |
|---------|--------|
| `npx tsx scripts/verify-worktime-runtime-prisma-delegate-k26-h2a.ts` | **15/15 PASS** |
| `npx tsx scripts/verify-worktime-settings-ui-k26-h.ts` | **43/43 PASS** |
| `npx tsx scripts/verify-worktime-api-k26-g.ts` | **40/40 PASS** |
| `npx tsx scripts/verify-worktime-post-schema-regression-k26-f1.ts` | **30/30 PASS** |
| `npx tsx scripts/validate-worktime-schema-k26-f.ts` | **30/30 PASS** |
| `npx tsx scripts/backfill-worktime-default-config-k26-f.ts --dry-run` | **PASS** (0 missing) |
| `npx tsx scripts/plan-worktime-schema-k26-e.ts` | **34/34 PASS** |
| `npx tsx scripts/verify-static-time-slot-extraction-k26-d.ts` | **39/39 PASS** |
| `npx tsx scripts/audit-time-slot-worktime-settings-k26-c.ts` | **PASS** (32/32) |
| `npx tsx scripts/verify-system-settings-shell-k26-a.ts` | **47/47 PASS** |
| `npx tsx scripts/verify-scheduler-config-settings-acceptance-closeout-k26-b.ts` | **38/38 PASS** |
| `npx tsx scripts/verify-semester-settings-acceptance-closeout-k25.ts` | **38/38 PASS** |
| `npx tsx scripts/validate-multi-semester-schema-k25-c.ts` | **PASS** |
| `npx prisma validate` | **PASS** |
| `npx prisma migrate status` | **up to date** (8 migrations) |
| `npm run build` | **PASS** |
| `npx eslint .` (= `npm run lint`) | **184 errors / 136 warnings (+0/+0)** |
| `npm run test:auth-foundation` | **53 passed / 1 failed (pre-existing)** |

### Final Conclusion

```txt
K26-H1A-WORKTIME-SETTINGS-UI-VERIFICATION-COMPLETE: 建议关闭
K26-H2A: 现在可以关闭
K26-H1A: 现在可以关闭
K26-H: 现在可以正式关闭
featureStatus: READY_FOR_REAL_USE
manualFrontendValidation: PASSED
blocking=false
recommendedNextStage=K26-H-WORKTIME-SETTINGS-UI-ACCEPTANCE-CLOSEOUT
仍禁止接 solver/score/recommendation
```

---

## Acceptance Closeout

Acceptance closeout: K26-H-WORKTIME-SETTINGS-UI-ACCEPTANCE-CLOSEOUT
Status: CLOSED
featureStatus: READY_FOR_REAL_USE
