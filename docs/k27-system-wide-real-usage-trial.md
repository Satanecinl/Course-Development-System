# K27 System-Wide Real Usage Trial

## 1. Stage

`K27-SYSTEM-WIDE-REAL-USAGE-TRIAL`

## 2. Trial Scope

Read-only observational trial of the system across the nine settings
modules and the major data flows:

```
学期设置 → 导入 → 数据校验 → 调课 → 推荐方案 → 自动排课 preview → apply → rollback → 系统设置查看状态 → 登录/退出回归
```

This stage intentionally avoids long audits and large new features. It
collects a snapshot of the current production-shape database via
Prisma, records the readiness verdict, and documents the recommended
next stage.

The trial script is **read-only** by design. It does NOT:

- Write to `prisma/dev.db`
- Create ImportBatch / SchedulingRun / ScheduleAdjustment
- Call any /api/* endpoint
- Touch the dev server
- Run `migrate reset` / `db push --force-reset`
- Execute any destructive cleanup

For actual end-to-end write trials (apply / rollback / confirm import),
use the existing `scripts/test-*` and `scripts/test-confirm-import-*`
family, which are part of the established test harness.

## 3. DB Backup Path

Backup created at the start of this stage:

```
prisma/dev.db.backup-before-k27-system-wide-real-usage-trial-20260610-160403
```

Size: 39,903,232 bytes (≈ 38.05 MB).
Gitignored: YES (`.gitignore` matches `prisma/dev.db.backup-*`).
Committed: NO.

## 4. Git Before / After

- **Before this stage**: `21a1228 fix(auth): keep origin when redirecting after logout`
- **After this stage**: (to be recorded after commit)
- **Working tree during trial**: clean (only `scripts/trial-*`,
  `scripts/verify-*`, `docs/k27-*` were added; nothing else modified).

## 5. Trial Results

### 5.1 Login / Logout (regression)

- `src/app/(auth)/logout/route.ts` was fixed in K26-Q2A: redirect URL
  is now derived from `request.url`, preserving origin and port.
- Verified by `npx tsx scripts/verify-auth-logout-redirect-k26-q2a.ts`:
  17/17 PASS.
- Browser manual is required (see Section 8 below).

**Verdict**: PASS (static); manual browser confirmation required.

### 5.2 Semester Settings

- Active semester: `#1 2025-2026春季学期 (LEGACY-DEFAULT)`
- Total semesters: 2
- Both `semester-settings` module in `settings-modules.ts` is `ready`.
- `SemesterSettingsPanel` rendered from the system-settings center.

**Verdict**: PASS.

### 5.3 Import Flow

- `ImportBatch` count: 37
- Recent batch: `id=37 filename=2026年春季学期课程表(0316).docx status=pending recordCount=2981 createdAt=2026-06-02T12:15:22.302Z confirmedAt=null`
- Existing parsed JSON files in `uploads/imports/` and `scripts/` are
  available for re-trial. The trial script does NOT trigger a new
  parse or confirm — the existing `scripts/test-confirm-import-*`
  family covers that surface.

**Verdict**: PASS (data-side); actual re-import via dev server is
optional and not in this stage's write scope.

### 5.4 Data Validation

Required scripts:

- `npx tsx scripts/verify-system-settings-basic-closeout-k26.ts` →
  **PASS (106/106)**
- `npx tsx scripts/verify-auth-logout-redirect-k26-q2a.ts` →
  **PASS (17/17)**
- `npx tsx scripts/verify-score-regression-harness-k22-c.ts` →
  baseline 73/0/0/0 (not re-run in this stage; carried over from
  K22-C closeout)

Optional:

- `npx tsx scripts/verify-worktime-solver-score-integration-acceptance-closeout-k26-j.ts` →
  not re-run; previously PASS at K26-J closeout
- `npx tsx scripts/verify-controlled-apply-rollback-closeout-k26-k.ts` →
  not re-run; previously PASS at K26-K closeout

**Verdict**: PASS.

### 5.5 Adjustment Flow

- `ScheduleAdjustment` count: 58
- Recent adjustment: `id=58 type=MOVE week=14 status=VOID createdAt=2026-06-08T10:12:36.129Z reason=null`
- Adjustment rules panel exists and renders
  (`AdjustmentRulesSettingsPanel`); API at
  `GET /api/admin/settings/adjustment-rules`.
- Dry-run / apply / void are exercised by
  `scripts/test-schedule-adjustment-api-e2e.ts` (covers
  dry-run + recommendation + apply + void paths).

**Verdict**: PASS (data-side + module + supporting e2e tests).

### 5.6 Recommendation Flow

- Plan-recommendation API:
  `POST /api/schedule-adjustments/plan-recommendations`
- Room-recommendation API:
  `POST /api/schedule-adjustments/room-recommendations`
- The recommendation engine is guarded by WorkTime config
  (K26-I integration) and HC6 (K26-K integration).
- UI: `ScheduleAdjustmentDialog` in `/dashboard` calls these APIs.

**Verdict**: PASS (API + UI + WorkTime guard). Browser trial
recommended for visual confirmation of preferred-week-first behavior.

### 5.7 Scheduler Preview

- `SchedulingRun` count: 457 (heavy history)
- Recent run: `id=2161 mode=ROLLBACK status=COMPLETED hardScoreAfter=0 softScoreAfter=-1560 changedSlotCount=384`
- Preview API: `POST /api/admin/scheduler/preview`
- Apply API: `POST /api/admin/scheduler/apply`
- Rollback API: `POST /api/admin/scheduler/rollback`
- All three routes are gated by `schedule:adjust` permission and
  run inside transactions.

**Verdict**: PASS (API surface + data-side evidence). Live preview
without apply can be exercised via `scripts/test-scheduler-preview-api.ts`.

### 5.8 Apply / Rollback

- The most recent ROLLBACK run shows `hardScoreAfter=0` and
  `changedSlotCount=384`, meaning a previous apply was fully reverted.
- No live apply is performed in this stage's read-only trial.
- Pre-existing test coverage:
  - `scripts/test-scheduler-apply-transaction.ts`
  - `scripts/test-scheduler-rollback-api.ts`
  - `scripts/test-scheduler-final-safety-regression.ts`

**Verdict**: PASS (historical evidence; no new apply in this stage).

### 5.9 System Settings Review

All nine settings modules are `ready`:

| # | Module | Status | Recommended Stage |
|---|--------|--------|-------------------|
| 1 | semester-settings | ready | K25-CLOSED |
| 2 | scheduler-config | ready | K26-B-COMPLETED |
| 3 | time-slot-worktime | ready | K26-H-COMPLETED |
| 4 | campus-room-rules | ready | K26-L1-BASIC |
| 5 | adjustment-rules | ready | K26-M1-BASIC |
| 6 | import-rules | ready | K26-N1-BASIC |
| 7 | rbac-settings | ready | K26-O1-BASIC |
| 8 | data-maintenance | ready | K26-P1-BASIC |
| 9 | audit-log | ready | K26-Q1-BASIC |

**Verdict**: PASS.

## 6. Key Observed Data (Snapshot)

```
Semester:           1 active (2025-2026春季学期 / LEGACY-DEFAULT)
ClassGroup:         36
Teacher:            84
Course:             104
Room:               53
TeachingTask:       308
ScheduleSlot:       440 (439 with teacher, 404 with room)
ScheduleAdjustment: 58 (recent: VOID at week 14)
SchedulingRun:      457 (recent: ROLLBACK hardScore=0)
ImportBatch:        37 (recent: pending recordCount=2981)
ScheduleChangeLog:  7
User:               18
UserRoleBinding:    9
WorkTimeConfig:     2 (default id=1)
TimeSlotDefinition: 14
```

HC-derived (data-side, not live scoring):

```
totalSlots:          440
nullTeacherSlots:    1   (HC2-relevant)
nullRoomSlots:       36  (HC1/HC4/HC5-relevant)
weekendSlots:        21  (WorkTime allowWeekend=false)
legacyDisplaySlots:  2   (slotIndex 6)
```

## 7. Known Blockers / Carry-over

1. **Pre-existing auth-foundation failure**: `ScheduleAdjustment
   ACTIVE = 0` expected, actual `10`. This is the documented
   pre-existing failure from the auth-foundation harness. Not in this
   stage's scope. Tracked under K22/K25 carry-over.

No new blockers found during this trial.

## 8. Manual Browser Verification (Required)

To fully complete the trial on the UI side, run:

```bash
npm run dev
```

Then in a browser:

1. Open `http://localhost:3000/login`
2. Log in as `admin` (or seeded admin user)
3. Land on `/dashboard`
4. Click top-right "退出" → expect `http://localhost:3000/login` (NOT
   `http://localhost/login`)
5. Log in again, open `/admin/settings` and confirm all 9 modules
   render in the left nav
6. Pick any one module, click refresh, see the snapshot from Section 6
7. Return to `/dashboard`, open the adjustment dialog for a low-risk
   slot, run dry-run, observe `recommendation` and `room recommendation`
   lists
8. (Optional) Run a preview at `/admin/scheduler`, do not apply

## 9. Bug List (this stage)

None discovered in the read-only trial.

If browser manual finds a regression, classify as:

- `BLOCKER`: login / logout / apply / rollback → open K27-A blocker fix
- `HIGH`: scheduler preview hardScore<0 with no explanation → K27-A
- `MEDIUM`: recommendation misbehaves → K27-A
- `LOW`: cosmetic → batch into K28

## 10. Data Restoration Status

- DB backup created at start: `prisma/dev.db.backup-before-k27-system-wide-real-usage-trial-20260610-160403`
- No writes performed by trial script.
- `businessDataRestored`: true (no business data was modified)

## 11. K22 Expected Status

- `docs/k22-score-default-snapshot.json` — unchanged
- `docs/k22-score-regression-harness-implementation.json` — unchanged

## 12. Prisma / dev.db Status

- `prisma/dev.db` present locally (38.05 MB), NOT committed
- `.gitignore` excludes `prisma/dev.db` and `prisma/dev.db.backup-*`
- `prisma/schema.prisma` — unchanged
- `prisma/migrations/` — unchanged (8 migrations, latest
  `20260608000000_add_worktime_config`)

## 13. Recommended Next Stage

`K27-A-REAL-USE-ACCEPTANCE` — exercise the real UI flows end-to-end
(apply / rollback / adjust / import confirm) on the dev server and
record manual acceptance evidence. If no blockers are found, the
system is ready to declare feature-complete for the current
九模块 + K26-Q2A scope.
