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
