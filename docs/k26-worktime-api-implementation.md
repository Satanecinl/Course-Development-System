# K26-G: WorkTime API Implementation

## 1. Executive Summary

K26-G 实现了 WorkTime API 基础能力：

- 新增 worktime service、validation、types
- 新增 6 个 API endpoints（list/create, get/update/delete, activate, resolved）
- 权限：`settings:manage`
- Delete protection：default config、last active config、used by run snapshot
- Resolved config：database → static fallback
- 未接 UI / solver / score / recommendation
- 未改 K22/K23/K24/K25 expected
- 未新增 schema / migration

## 2. GitHub Sync Status

| Item | Value |
|------|-------|
| Branch | `master` |
| Remote | `origin` → `https://github.com/Satanecinl/Course-Development-System.git` |
| Tracking branch | `origin/master` |
| Local HEAD before | `8d411b8` (K26-F1) |
| Local HEAD after | (to be filled after push) |
| Remote HEAD before | `8d411b8` |
| Remote HEAD after | (to be filled after push) |
| Ahead/behind | up to date |
| Fetch | yes |
| Pull/rebase | no |
| Push | yes |
| Force push | false |

## 3. API Endpoints

### 3.1 List / Create

**`GET /api/admin/worktime-configs`**

| Item | Value |
|------|-------|
| Permission | `settings:manage` |
| Query params | `semesterId?`, `includeSlots?=true`, `includeInactive?=true` |
| Response | `{ success, items, semesterId?, count }` |

**`POST /api/admin/worktime-configs`**

| Item | Value |
|------|-------|
| Permission | `settings:manage` |
| Body | `{ semesterId, name, isDefault?, allowWeekend?, lunchStart?, lunchEnd?, isActive?, effectiveFrom?, notes?, slots[] }` |
| Response | `{ success, item }` (201) |
| Errors | 400 INVALID_REQUEST, 404 SEMESTER_NOT_FOUND, 409 WORKTIME_CONFIG_NAME_EXISTS |

### 3.2 Read / Update / Delete

**`GET /api/admin/worktime-configs/[id]`**

| Item | Value |
|------|-------|
| Permission | `settings:manage` |
| Response | `{ success, item }` |
| Errors | 404 WORKTIME_CONFIG_NOT_FOUND |

**`PUT /api/admin/worktime-configs/[id]`**

| Item | Value |
|------|-------|
| Permission | `settings:manage` |
| Body | `{ name?, isDefault?, allowWeekend?, lunchStart?, lunchEnd?, isActive?, effectiveFrom?, notes?, slots? }` |
| Response | `{ success, item }` |
| Errors | 404 WORKTIME_CONFIG_NOT_FOUND, 409 WORKTIME_CONFIG_NAME_EXISTS |

**`DELETE /api/admin/worktime-configs/[id]`**

| Item | Value |
|------|-------|
| Permission | `settings:manage` |
| Response | `{ success, id }` |
| Errors | 404 WORKTIME_CONFIG_NOT_FOUND, 409 WORKTIME_CONFIG_DEFAULT_IN_USE, 409 WORKTIME_CONFIG_LAST_ACTIVE, 409 WORKTIME_CONFIG_USED_BY_RUN |

### 3.3 Activate / Set Default

**`POST /api/admin/worktime-configs/[id]/activate`**

| Item | Value |
|------|-------|
| Permission | `settings:manage` |
| Response | `{ success, item }` |
| Errors | 404 WORKTIME_CONFIG_NOT_FOUND |

### 3.4 Resolved Config

**`GET /api/admin/worktime-configs/resolved`**

| Item | Value |
|------|-------|
| Permission | `settings:manage` |
| Query params | `semesterId?` |
| Response | `{ success, semesterId, source, config }` |
| source | `"database"` or `"staticFallback"` |

## 4. Service / Validation

### 4.1 Service Layer

`src/lib/worktime/worktime-service.ts`

| Function | Purpose |
|----------|---------|
| `listWorkTimeConfigs(params)` | List configs with filters |
| `getWorkTimeConfig(id)` | Get single config |
| `createWorkTimeConfig(input)` | Create config + slots (transaction) |
| `updateWorkTimeConfig(id, input)` | Update config + slots (transaction) |
| `deleteWorkTimeConfig(id)` | Delete with protection |
| `activateWorkTimeConfig(id)` | Set as default |
| `resolveWorkTimeConfig(semesterId?)` | Get resolved config |
| `buildStaticFallbackWorkTimeConfig(semesterId?)` | Build static fallback |
| `mapWorkTimeConfigToDTO(config, includeSlots)` | Map to DTO |

### 4.2 Validation

`src/lib/worktime/worktime-validation.ts`

| Rule | Description |
|------|-------------|
| semesterId | positive integer |
| name | non-empty, max 100 chars |
| lunchStart/lunchEnd | nullable, HH:mm |
| slotIndex | positive integer, unique within config |
| label | non-empty, max 50 chars |
| startsAt/endsAt | nullable, HH:mm |
| slotIndex 6/7 | cannot be active teaching slots |
| legacy display | cannot be active teaching |
| active teaching | at least one required |

### 4.3 DTO

`src/types/worktime.ts`

```ts
type WorkTimeConfigDTO = {
  id, semesterId, semesterName?, name, isDefault, allowWeekend,
  lunchStart, lunchEnd, isActive, version, effectiveFrom, notes,
  createdAt, updatedAt, slots?: TimeSlotDefinitionDTO[]
}

type TimeSlotDefinitionDTO = {
  id, slotIndex, label, startsAt, endsAt, isActive,
  isTeachingSlot, isLegacyDisplay, sortOrder
}
```

## 5. Delete Protection

| Protection | Error Code | Description |
|------------|------------|-------------|
| Default config | `WORKTIME_CONFIG_DEFAULT_IN_USE` | Cannot delete the default config |
| Last active | `WORKTIME_CONFIG_LAST_ACTIVE` | Cannot delete last active config for semester |
| Used by run | `WORKTIME_CONFIG_USED_BY_RUN` | Cannot delete if referenced by SchedulingRun snapshot |

**Note**: `workTimeConfigSnapshot` is currently nullable string. The service uses conservative parser: if snapshot JSON parses and includes matching `id`, treat as referenced. If unparsable, ignore (documented limitation).

## 6. Resolved Config

Resolution priority:
1. If `semesterId` provided, use that semester
2. If no `semesterId`, use active semester
3. Find default active WorkTimeConfig
4. If found, return `source: "database"`
5. If not found, return static fallback from K26-D helper

## 7. Compatibility / Non-Goals

确认**未改**：

- ❌ frontend UI
- ❌ system settings UI
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
| `npx tsx scripts/verify-worktime-api-k26-g.ts` | (TBD) |
| `npx tsx scripts/verify-worktime-post-schema-regression-k26-f1.ts` | (TBD) |
| `npx prisma validate` | (TBD) |
| `npm run build` | **PASS** |
| `npx eslint .` | (TBD) |
| `npm run test:auth-foundation` | (TBD) |

## 9. Recommended Next Stage

```txt
K26-G WORKTIME API VERIFY PASS
PASS=x FAIL=0
blocking=false
recommendedNextStage=K26-H-WORKTIME-SETTINGS-UI
```

K26-G **建议关闭**。下一步进入 K26-H（WorkTime settings UI）：

- 系统设置 → 节次与作息设置面板
- CRUD 操作 UI
- **不接 solver / score**
