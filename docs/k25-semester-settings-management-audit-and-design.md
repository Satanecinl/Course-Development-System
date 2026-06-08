# K25-G: Semester Settings Management — Audit and Design

## 1. Executive Summary

The current system settings page (`/admin/settings`) is a placeholder showing "功能建设中". The user requires semester settings management capabilities (create, edit, delete, activate, date management).

This stage performs a read-only audit of the current state and designs the full semester management feature. **No code changes are made** — only analysis and design documents are produced.

**Recommended implementation order**:
1. `K25-H-SEMESTER-SETTINGS-API-IMPLEMENTATION` — CRUD API
2. `K25-I-SEMESTER-SETTINGS-UI-IMPLEMENTATION` — Settings page UI
3. `K25-J-SEMESTER-SETTINGS-E2E-MANUAL-TRIAL` — Browser manual trial

## 2. GitHub Sync Status

| Field | Value |
|---|---|
| Branch | `master` |
| Remote | `origin` → `git@github.com:Satanecinl/Course-Development-System.git` |
| Tracking | `origin/master` |
| Local HEAD | `466a4fa` |
| Remote HEAD | `466a4fa` |
| ahead/behind | up to date |
| Fetch | ✅ executed |
| Pull/rebase | not needed |
| Push | (after commit) |
| Force push | ❌ never |

## 3. Current Semester Schema

### Fields

| Field | Type | Nullable | Default | Notes |
|---|---|---|---|---|
| `id` | `Int` | PK | autoincrement | — |
| `name` | `String` | required | — | Display name, e.g. "2026年春季学期" |
| `code` | `String` | required, unique | — | Machine code, e.g. "2026SPRING" |
| `academicYear` | `String?` | nullable | null | e.g. "2025-2026" |
| `term` | `String?` | nullable | null | e.g. "1" or "2" |
| `startsAt` | `DateTime?` | nullable | null | Semester start date |
| `endsAt` | `DateTime?` | nullable | null | Semester end date |
| `isActive` | `Boolean` | required | `false` | Whether this is the current active semester |
| `createdAt` | `DateTime` | auto | `now()` | — |
| `updatedAt` | `DateTime` | auto | `@updatedAt` | — |

### Relations (7)

- `classGroups ClassGroup[]`
- `teachingTasks TeachingTask[]`
- `scheduleSlots ScheduleSlot[]`
- `scheduleAdjustments ScheduleAdjustment[]`
- `schedulingRuns SchedulingRun[]`
- `schedulingConfigs SchedulingConfig[]`
- `importBatches ImportBatch[]`

### Capability Assessment

| Requirement | Supported? | Field |
|---|---|---|
| Create semester | ✅ | `name` (required), `code` (unique), dates (nullable) |
| Rename | ✅ | `name` is a regular `String` field |
| Adjust dates | ✅ | `startsAt` / `endsAt` exist as `DateTime?` |
| Set active | ✅ | `isActive` exists as `Boolean` |
| Delete | ✅ | Relations allow dependency counting |
| Archive | ❌ | No `status` or `archived` field |

### Assessment

**The existing schema is sufficient for full CRUD + activate implementation.** No schema changes are needed for K25-H.

Optional future enhancement: add an `archived` or `status` field for soft-delete/archive semantics. This is NOT required for the initial implementation — hard delete with dependency protection is sufficient.

## 4. Current DB Snapshot

| Semester | id | name | code | isActive | startsAt | endsAt |
|---|---|---|---|---|---|---|
| LEGACY-DEFAULT | 1 | 既有数据默认学期 | LEGACY-DEFAULT | ✅ true | null | null |

**Dependency counts for semester 1:**

| Table | Count |
|---|---|
| ClassGroup | 36 |
| TeachingTask | 308 |
| ScheduleSlot | 440 |
| ScheduleAdjustment | 57 |
| SchedulingRun | 77 |
| SchedulingConfig | 1 |
| ImportBatch | 37 |

**Observations:**
- Only 1 semester exists — the legacy default
- It has no start/end dates (created during K25-C backfill)
- It holds ALL existing business data — cannot be deleted
- Active count = 1 (correct, no multiple-active issue)
- No empty semesters exist
- No safe-to-delete semesters exist

## 5. Existing API Audit

### GET /api/semesters

- **File**: `src/app/api/semesters/route.ts`
- **Method**: GET only
- **Auth**: None (public read for semester selector)
- **Returns**: `{ success, semesters[], activeSemesterId }`
- **Fields returned**: id, name, code, academicYear, term, startsAt, endsAt, isActive
- **No POST/PUT/DELETE/activate handlers**

### Missing routes

| Route | Status |
|---|---|
| `POST /api/semesters` | ❌ Not implemented |
| `PUT /api/semesters/[id]` | ❌ Not implemented |
| `DELETE /api/semesters/[id]` | ❌ Not implemented |
| `POST /api/semesters/[id]/activate` | ❌ Not implemented |
| `GET /api/semesters/[id]/dependencies` | ❌ Not implemented |

## 6. Existing Settings Page Audit

| Item | Value |
|---|---|
| Path | `/admin/settings` |
| File | `src/app/admin/settings/page.tsx` |
| Status | Placeholder — "功能建设中" |
| Auth | `ProtectedShell` (requires login) |
| Nav permission | `settings:manage` |
| Route permission | `/admin/settings` → `settings:manage` |
| Icon | `Settings` from lucide-react |
| Content | Single card with placeholder text |

**Navigation**: Listed in `src/lib/auth/navigation.ts` with `permission: 'settings:manage'`, gated by sidebar.

**Existing components that can be reused**:
- `ProtectedShell` — auth wrapper
- `Dialog`, `DialogContent`, `DialogHeader`, `DialogTitle`, `DialogFooter` — shadcn/ui dialogs
- `Button`, `Input`, `Label` — form primitives
- `AdminDataTable` pattern — table with CRUD
- `AdminToolbar` pattern — toolbar with add button
- `toast` from sonner — notifications
- `useHasPermission` — permission gating hook

## 7. Proposed Semester Management API

### GET /api/semesters (existing, enhance)

Enhance the existing endpoint to optionally include dependency counts:

```ts
// Response (enhanced)
{
  success: true,
  semesters: Array<{
    id: number
    name: string
    code: string
    academicYear: string | null
    term: string | null
    startsAt: string | null
    endsAt: string | null
    isActive: boolean
    // New: dependency counts (optional, via ?includeCounts=true)
    _count?: {
      classGroups: number
      teachingTasks: number
      scheduleSlots: number
      scheduleAdjustments: number
      schedulingRuns: number
      schedulingConfigs: number
      importBatches: number
    }
  }>,
  activeSemesterId: number | null
}
```

### POST /api/semesters (new)

Create a new semester.

```ts
// Request
{
  name: string           // required
  code: string           // required, unique
  academicYear?: string  // optional
  term?: string          // optional
  startDate?: string     // ISO date, optional
  endDate?: string       // ISO date, optional
  isActive?: boolean     // default false
}

// Validation
// - name: non-empty
// - code: non-empty, unique
// - startDate < endDate (if both provided)
// - code: format validation (e.g., YYYY+TERM)

// If isActive=true:
// - Transaction: set all other semesters isActive=false, then create with isActive=true

// Response
{ success: true, semester: { id, name, code, ... } }
```

### PUT /api/semesters/[id] (new)

Edit an existing semester.

```ts
// Request
{
  name?: string
  code?: string
  academicYear?: string
  term?: string
  startDate?: string | null
  endDate?: string | null
  isActive?: boolean
}

// Validation
// - name: non-empty if provided
// - code: unique if changed
// - startDate < endDate (if both provided)
// - If isActive=true: transaction to ensure uniqueness

// Response
{ success: true, semester: { id, name, code, ... } }
```

### DELETE /api/semesters/[id] (new)

Delete an empty semester with dependency protection.

```ts
// Pre-check (same transaction):
// 1. Semester exists → 404 if not
// 2. Not the active semester → 409 if active
// 3. Not the last semester → 409 if last
// 4. All dependency counts = 0 → 409 if any > 0

// Response (success)
{ success: true }

// Response (blocked)
{
  success: false,
  error: "该学期已有业务数据，不能删除",
  dependencies: { classGroups: 36, teachingTasks: 308, ... }
}
```

### POST /api/semesters/[id]/activate (new)

Set a semester as the active semester.

```ts
// Transaction:
// 1. Target semester exists → 404 if not
// 2. updateMany({ data: { isActive: false } }) — deactivate all
// 3. update({ where: { id }, data: { isActive: true } }) — activate target

// Response
{ success: true, semester: { id, name, isActive: true } }
```

### GET /api/semesters/[id]/dependencies (new, optional)

Return dependency counts for UI display and delete confirmation.

```ts
// Response
{
  success: true,
  semesterId: number,
  dependencies: {
    classGroups: number
    teachingTasks: number
    scheduleSlots: number
    scheduleAdjustments: number
    schedulingRuns: number
    schedulingConfigs: number
    importBatches: number
  },
  canDelete: boolean,
  deleteBlockReason: string | null
}
```

## 8. Proposed UI Design

### Page Structure

```
/admin/settings
  └── 系统设置
        └── 学期设置 (tab or section)
              ├── 当前学期卡片 (active semester highlight)
              ├── 学期列表表格
              │     ├── Columns: 名称 | 起止日期 | 是否当前 | 教学任务 | 课表 | 调课 | 导入 | 操作
              │     └── Actions: 编辑 | 设为当前 | 删除
              ├── 新增学期按钮
              └── 数据量 / 删除保护提示
```

### Table Columns

| Column | Content | Notes |
|---|---|---|
| 学期名称 | `name` | Primary display |
| 学期代码 | `code` | Machine identifier |
| 起止日期 | `startsAt` ~ `endsAt` | "未设置" if null |
| 是否当前 | `isActive` | ✅ badge if active |
| 教学任务数 | `_count.teachingTasks` | Dependency indicator |
| 课表数 | `_count.scheduleSlots` | Dependency indicator |
| 调课记录 | `_count.scheduleAdjustments` | Dependency indicator |
| 导入批次 | `_count.importBatches` | Dependency indicator |
| 操作 | Edit / Activate / Delete | Delete disabled if has data |

### Dialogs

**1. Create/Edit Semester Dialog**
- Fields: name (required), code (required), academicYear, term, startDate, endDate
- isActive checkbox with confirmation: "设置为当前学期将取消其他学期的当前状态"
- Validation: name non-empty, code unique, startDate < endDate

**2. Delete Confirmation Dialog**
- Shows dependency counts
- If any count > 0: "该学期已有 N 条教学任务、M 条课表记录，不能删除"
- If active: "请先切换当前学期"
- If last: "系统至少需要保留一个学期"
- Confirmation text: type semester name to confirm

**3. Activate Confirmation Dialog**
- "将 [name] 设为当前学期？当前学期 [old-name] 将被取消。"
- Confirm button

## 9. Delete Protection and Dependency Rules

### Hard Delete Allowed Only When ALL Conditions Met

1. ✅ All dependency counts = 0:
   - ClassGroup = 0
   - TeachingTask = 0
   - ScheduleSlot = 0
   - ScheduleAdjustment = 0
   - SchedulingRun = 0
   - SchedulingConfig = 0
   - ImportBatch = 0

2. ✅ Not the current active semester (`isActive = false`)

3. ✅ Not the last remaining semester (total count > 1)

### Hard Delete Blocked

| Condition | Error | HTTP |
|---|---|---|
| Any dependency count > 0 | "该学期已有业务数据，不能删除。可选择归档该学期。" | 409 |
| Is active semester | "请先将当前学期切换到其他学期，再执行删除。" | 409 |
| Last remaining semester | "系统至少需要保留一个学期。" | 409 |
| Semester not found | "学期不存在" | 404 |

### Future Enhancement: Soft Delete / Archive

If a `status` field is added later (e.g., `ACTIVE`, `ARCHIVED`, `DRAFT`), semesters with data could be archived instead of deleted. This is out of scope for K25-H.

## 10. Active Semester Rules

### Invariants

1. **At most 1 active semester** at any time
2. **At least 1 active semester** recommended (not strictly enforced — system can operate with 0 active via explicit semesterId)
3. **Activate is atomic**: use a Prisma transaction

### Activate Transaction

```ts
await prisma.$transaction([
  // Step 1: Deactivate all
  prisma.semester.updateMany({ data: { isActive: false } }),
  // Step 2: Activate target
  prisma.semester.update({ where: { id: targetId }, data: { isActive: true } }),
])
```

### Edge Cases

- **Activate already-active**: no-op, return success
- **Activate non-existent**: 404
- **Create with isActive=true**: same transaction pattern
- **Edit to set isActive=true**: same transaction pattern

## 11. Permission Design

### Current State

- `settings:manage` permission exists in `ALL_PERMISSIONS`
- Settings page is gated by `settings:manage` in navigation and route-permissions
- ADMIN role has all permissions including `settings:manage`
- USER role does NOT have `settings:manage`

### Recommended Permission Mapping

| Operation | Permission | Notes |
|---|---|---|
| View semester list | `data:read` (existing GET) | Public read, no change needed |
| Create semester | `settings:manage` | Admin-only |
| Edit semester | `settings:manage` | Admin-only |
| Delete semester | `settings:manage` | Admin-only, high-risk |
| Activate semester | `settings:manage` | Admin-only, high-risk |
| View dependencies | `data:read` | Read-only, non-sensitive |

### Permission Debt

None identified. The existing `settings:manage` permission is appropriate for all write operations. No new permissions needed.

## 12. Out of Scope

系统设置长期规划（排课参数、节次作息、教室规则、调课规则、导入规则、备份、审计日志等）不在 K25-G 范围内，后续另行规划。

## 13. Recommended Next Stages

| Stage | Scope | Prerequisite |
|---|---|---|
| `K25-H-SEMESTER-SETTINGS-API-IMPLEMENTATION` | CRUD API + activate + dependency check | K25-G docs |
| `K25-I-SEMESTER-SETTINGS-UI-IMPLEMENTATION` | Settings page UI with table, dialogs, CRUD | K25-H API |
| `K25-J-SEMESTER-SETTINGS-E2E-MANUAL-TRIAL` | Browser manual trial, create real semester | K25-I UI |

K25-H should be API-only (no UI). K25-I should be UI-only (consumes K25-H API). K25-J should be manual browser testing.

## 14. Verification Results

| Command | Result |
|---|---|
| `npx tsx scripts/audit-semester-settings-management-k25-g.ts` | ✅ PASS=65 FAIL=0 |
| `npx tsx scripts/verify-semester-selector-ux-k25-e.ts` | ✅ PASS=64 FAIL=0 |
| `npx tsx scripts/verify-semester-scoping-api-k25-d.ts` | ✅ PASS=54 FAIL=0 |
| `npx tsx scripts/validate-multi-semester-schema-k25-c.ts` | ✅ 37/37 PASS |
| `npx prisma validate` | ✅ valid |
| `npx prisma migrate status` | ✅ up to date |
| `npm run build` | ✅ compiled |
| `npm run lint` | ✅ 184 errors / 136 warnings (matches K25-E1 baseline) |
| `npm run test:auth-foundation` | 53 passed / 1 failed (pre-existing) |

## 15. Unmodified Scope

- ✅ Schema: not modified
- ✅ Migrations: not added
- ✅ DB: not written
- ✅ API business logic: not modified
- ✅ Frontend business logic: not modified
- ✅ Scheduler / score / solver: not modified
- ✅ Importer / parser: not modified
- ✅ RBAC: not modified
- ✅ K22 / K23 / K24 expected: not modified
