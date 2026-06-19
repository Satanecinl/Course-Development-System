# K38-B Adjustment Rules Config — Limit Editing

## Stage

```text
K38-B-ADJUSTMENT-RULES-CONFIG-SCHEMA-AND-LIMIT-EDITING
```

## 1. Purpose

Add persistent editing for `defaultRecommendationLimit` via a minimal
`AdjustmentRuleConfig` singleton table. Admin can configure 1-20 via
settings UI PATCH. Recommendation uses config when request doesn't
specify its own limit.

## 2. Schema

```prisma
model AdjustmentRuleConfig {
  id                         Int      @id @default(autoincrement())
  key                        String   @unique @default("default")
  defaultRecommendationLimit Int      @default(5)
  createdAt                  DateTime @default(now())
  updatedAt                  DateTime @updatedAt
}
```

Migration: `20260619000001_add_adjustment_rule_config_k38_b`

## 3. DB Backup

Path: `prisma/dev.db.backup-before-k38-b-adjustment-rule-config-20260619-163007`
Size: 62MB
Gitignored: ✅

## 4. Backfill

Script: `scripts/backfill-adjustment-rule-config-k38-b.ts`

- dry-run: no row → would create defaultRecommendationLimit=5
- apply: created singleton row with limit=5
- idempotent

## 5. API

### GET `/api/admin/settings/adjustment-rules`

- `moduleVersion: "K38-B"`
- `defaultRecommendationLimit.editable: true`
- `defaultRecommendationLimit.source: "database"` (previously "code default")

### PATCH `/api/admin/settings/adjustment-rules` (new)

Request: `{ "defaultRecommendationLimit": 10 }`

- Requires `settings:manage`
- Validates integer, range 1-20
- Only writes `AdjustmentRuleConfig`
- Does NOT touch ScheduleAdjustment/ScheduleSlot/TeachingTask

## 6. Recommendation Limit Precedence

| Priority | Source | Scope |
|---|---|---|
| 1 | Request `limit` param | Per-request override |
| 2 | `AdjustmentRuleConfig.defaultRecommendationLimit` | Admin setting (PATCHable) |
| 3 | `DEFAULT_LIMIT = 5` | Code fallback |

## 7. UI Changes

- Badge: "诊断增强版" (unchanged from K38-A; primary change is config persistence + editable limit)
- `defaultRecommendationLimit` card now editable
- PATCH via settings API (no separate UI input in this stage — PATCH handled by API; UI panel shows editable status)

## 8. Verification

| Item | Result |
|---|---|
| K38-B verify | ✅ 23/23 PASS |
| K38-A verify | ✅ 22/22 PASS (updated for K38-B) |
| K37-C verify | ✅ 23/23 PASS |
| K22-C regression | ✅ 73/0/0/0 |
| PII scan | ✅ 0 BLOCKING |
| Prisma validate | ✅ valid |
| Prisma migrate status | ✅ up to date (12 migrations) |
| Build | ✅ PASS |
| ESLint | ✅ 0 errors |

## 9. Rollback

- Code: `git revert` the K38-B commit
- DB: restore from backup `prisma/dev.db.backup-before-k38-b-...`
- Config: `DELETE FROM AdjustmentRuleConfig` (revert migration then deploy)