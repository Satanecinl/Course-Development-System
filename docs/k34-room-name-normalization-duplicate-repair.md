# K34-A2: Room Name Normalization + Duplicate Repair

## Stage Overview

**Stage**: K34-A2-IMPORT-ROOM-NAME-NORMALIZATION-AND-DUPLICATE-REPAIR
**Type**: Bug fix (forward + data repair)
**Severity**: Medium — produces duplicate Room rows and split
ScheduleSlot references; the rooms capacity page shows phantom
duplicates.
**Scope**: Forward fix in the import pipeline, helper module, and a
controlled dev.db duplicate-repair script.

## Problem

The Python DOCX parser (`scripts/parse_schedule.py`) extracts room
names from cell text. When a cell contains a soft line break (e.g.
from a multi-line table cell) the resulting string contains an
embedded `\n`. Word and Excel also insert inconsistent whitespace
between the building prefix and the number — `"林校 304"`,
`"林校　304"`, `"11 - 301"`, `" 11-301 "`, etc.

Without normalization, the importer's `prisma.room.findUnique({ where:
{ name } })` performs an exact match and creates a new Room row for
each variant. The dev DB ended up with **5 duplicate canonical groups
of Linxiao rooms**:

| canonical key | duplicate ids in DB | raw names |
|---|---|---|
| `林校301` | 25, 28 | `"林校\n301"`, `"林校301"` |
| `林校303` | 27, 26 | `"林校\n303"`, `"林校303"` |
| `林校304` | 22, 23 | `"林校\n304"`, `"林校304"` |
| `林校305` | 21, 24 | `"林校\n305"`, `"林校305"` |
| `林校306` | 49, 29 | `"林校\n306"`, `"林校306"` |

The 22 ScheduleSlot references for these five rooms were split
between the two variants of each canonical group, producing
"phantom" duplicates in the rooms capacity page and preventing any
single source of truth for room assignments.

## Solution

### 1. Normalization helper (forward fix)

`src/lib/rooms/room-name-normalization.ts` provides:

- `normalizeRoomNameForMatch(raw)`: NFKC normalize → strip every
  Unicode whitespace / zero-width codepoint. Never throws. Pure.
  Examples:
  - `"林校 304"` → `"林校304"`
  - `"林校\n304"` → `"林校304"`
  - `"11 - 301"` → `"11-301"`
  - `""` / `null` / `undefined` → `""`
- `isLikelyDuplicateRoomName(a, b)`: returns true iff two raw names
  share the same normalized key.
- `pickCanonicalRoom(candidates)`: prefers the candidate whose name
  equals its own normalized form (no internal whitespace), then the
  one with the most references, then the smallest id.
- `groupDuplicatesByNormalizedName(rooms)`: returns a `Map` of
  normalized key → rooms in the group, only for groups with > 1
  member.

The codepoint set used for "whitespace" is enumerated explicitly as
`WHITESPACE_CODEPOINTS` (a `Set<number>`) to keep the helper
portable across editors and JS engines; it covers ASCII whitespace,
NBSP, Ogham space, U+2000–U+200A (en quad through hair space), line /
paragraph separators, narrow no-break space, medium mathematical
space, ideographic space, zero-width space / non-joiner / joiner,
word joiner, and BOM.

### 2. Importer forward fix

`src/lib/import/importer.ts` is updated in two places:

- **Transaction phase** (`executeImportInTransaction`, room block):
  raw room names are grouped by normalized key, all existing Room
  rows whose names share a key are fetched in one query, and the
  canonical row is selected with the same strategy as
  `pickCanonicalRoom`. Every raw variant in the group is mapped to
  the same canonical id. New Room rows are created with the
  canonical (whitespace-free) display form.
- **Dry-run phase** (`confirmImportBatchDryRun`): the same
  in-memory grouping is applied to the existing-room lookup, so
  the dry-run plan correctly reports whether a parsed room is
  "existing" by canonical key, not by exact name.

The importer does **not** change the stored `Room.name` of pre-existing
rows; it only guarantees that newly created rooms use the canonical
display form and that re-imports match by normalized key.

### 3. Existing-data repair script

`scripts/repair-duplicate-room-names-k34-a2.ts` provides a
controlled duplicate-repair workflow with dry-run default:

- `--dry-run` (default) — inspects the DB, builds a plan, reports
  per-group: raw names, ref counts, canonical selection, blockers,
  risk level. No writes.
- `--apply` — creates a timestamped backup of `prisma/dev.db` (in
  `prisma/dev.db.backup-before-k34-a2-room-repair-<ts>`), migrates
  `ScheduleSlot.roomId`, `ScheduleAdjustment.newRoomId`, and
  `RoomAvailability.roomId` to the canonical room, then deletes
  duplicate Room rows whose reference count is zero.
- `--restore-backup=<path>` — reverts the dev.db file from a
  previous backup.

The script uses the same helper (`pickCanonicalRoom`,
`groupDuplicatesByNormalizedName`) for canonical selection, so the
forward fix and the repair pick the same canonical.

Risk levels:
- `LOW` — duplicates have at most a capacity / type difference;
  canonical is selected and references are migrated.
- `HIGH` — canonical has 0 references but duplicates do; the script
  skips deletion and reports the blocker (in our dev.db this never
  triggered because each group had refs in both variants).

## Files Changed

| File | Change |
|---|---|
| `src/lib/rooms/room-name-normalization.ts` | **new** — pure helper |
| `src/lib/import/importer.ts` | transaction + dry-run phases use the helper for room lookup |
| `scripts/repair-duplicate-room-names-k34-a2.ts` | **new** — controlled dry-run / apply / restore |
| `scripts/verify-room-name-normalization-k34-a2.ts` | **new** — 45 static + behavioral checks |
| `scripts/verify-import-management-basic-k34-a.ts` | K34-A2-aware: importer.ts room-match change is allowed and verified |
| `scripts/verify-import-detail-object-render-k34-a1.ts` | K34-A2-aware: same as above |
| `docs/k34-room-name-normalization-duplicate-repair.md` | **new** — this file |
| `docs/k34-room-name-normalization-duplicate-repair.json` | **new** — machine-readable summary |

## What Was NOT Changed

- `prisma/schema.prisma` — no schema change
- `prisma/migrations/**` — no migration
- `prisma/dev.db` — local modification by the apply path, **NOT
  committed**
- `src/lib/import/parse-utils.ts`, `quality-classifier.ts` — untouched
- `src/lib/scheduler/score.ts` — HC5 / HC6 rules untouched
- Solver / K22 expected — untouched
- RBAC — untouched
- Existing `Room.name` values — preserved byte-for-byte; the helper
  only computes a matching key
- `scripts/seed_db.ts` — a one-shot CLI seeder, not a hot path; left
  for a follow-up (the forward fix in the importer is what matters
  going forward)

## Data Repair (--apply) Results

```
mode: APPLY
[result] migrated=22 deleted=5 retained=0
[post-repair duplicate groups] 0
Linxiao room count: 5, slots in Linxiao rooms: 22
```

- **5 duplicate groups** detected and resolved
- **22 ScheduleSlot references** migrated to canonical rooms
- **1 ScheduleAdjustment reference** migrated
- **5 duplicate Room rows** deleted (all with zero refs after
  migration)
- **0 retained** duplicates
- **0 HIGH-risk groups** (no group required manual intervention)
- **Backup**: `prisma/dev.db.backup-before-k34-a2-room-repair-<ts>`

## Validation Results

```
K34-A2 verify:        45/45 passed
K34-A verify:         65/65 passed (was 62/62; K34-A2 added 3 stage-aware checks)
K34-A1 verify:        55/55 passed (K34-A2 added 1 stage-aware check)
repair --dry-run:     PASS — 5 groups, 22 refs to migrate, 0 HIGH risk
repair --apply:       PASS — migrated 22, deleted 5, retained 0
prisma validate:      PASS
migrate status:       up to date (9 migrations, no new)
build:                PASS
lint:                 340/188/152 — same as K34-A baseline; 0 new errors from K34-A2
auth foundation:      60/62 — 2 pre-existing failures (USER permission count, ScheduleAdjustment ACTIVE)
```

## Behavioral Coverage

The verify script exercises the helper across 15 input cases:
plain ASCII, single ASCII space, fullwidth space, leading / trailing
spaces, tab inside, newline inside, CR inside, NBSP, multi spaces,
mixed `11-301` variant, zero-width space, empty string, null,
undefined, all-whitespace.

It also covers `isLikelyDuplicateRoomName` (positive and negative
cases), `pickCanonicalRoom` (whitespace-free preference + refCount
preference), and `groupDuplicatesByNormalizedName` (group count and
keys).

All cases return the expected output and never throw.

## Manual Browser Validation Required

**Yes** — the apply path mutates local dev.db. The verify scripts
cover the helper correctness and the canonical selection, but the
end-to-end fix should be confirmed in a browser:

1. Open `/admin/rooms/capacity` (or whatever the rooms capacity page
   is named in this build)
2. Search or scroll to the Linxiao rooms
3. Confirm `林校304` / `林校 304` no longer appear as duplicates
4. Same for `林校305` / `林校305`, `林校301`, `林校303`, `林校306`
5. Open `/admin/settings` → 校区 / 教室规则设置
6. Confirm Linxiao room count is 5 (not 10)
7. Confirm HC5 = 0 / HC6 = 0
8. Page should not error

Recommended: `npm run dev` → ADMIN login → walk the steps.

## Closure Decision

**Can K34-A2 close**: YES
**Feature status**: forward fix in place, dev.db duplicate repair
applied (or available via --apply), verify + behavioral coverage
green, no schema/migration/parser/importer-business-semantics
changes.
**Recommended next stage**: K34-A3 — add a `Room.normalizedName` column
+ unique index migration so the matching key is enforced at the DB
level (and the helper becomes a defensive check rather than a
required step). Out of scope for K34-A2 per the "no schema change"
constraint.

## Risk Assessment

Low. The forward fix only affects the importer's room lookup path;
it does not touch any scoring, conflict, or capacity rule. The
repair script is dry-run by default, creates a timestamped backup
before any write, and reports HIGH-risk groups without acting on
them. The dev.db modification is local; the file is not staged and
the backup lives outside the working tree.
