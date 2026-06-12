# scripts/

This directory contains one-off scripts for the Course Development System (my-app) repo. Prefixes describe intended purpose, but they are a **naming convention, not a side-effect guarantee**.

Before running any script, inspect its source, the script inventory, and the relevant stage report. Some `verify-*`, `audit-*`, and `test-*` scripts write report JSON, create validation records, call mutating APIs, or modify the database. Never infer safety from the filename alone.

## Naming convention

| Prefix | Purpose | Side effects | When to run |
|---|---|---|---|
| `verify-*.ts` | Repeatable verification (positive/negative checks) | Varies: may write reports, fixtures, or validation data | Run only after source-level side-effect review |
| `audit-*.ts` | Inventory / inventory-style audits | Usually reads data, but some write reports or validation records | Run only after source-level side-effect review |
| `diagnose-*.ts` | One-off diagnostics for a specific bug | **Read-only** | On demand, when debugging. |
| `plan-*.ts` | Read-only planning / analysis that emits a follow-up plan | **Read-only** | At the start of a stage. |
| `trial-*.ts` | Controlled / manual trial runs (e.g. real-import, solver dry-runs) | **Read by default**; trial-of-truth paths may use explicit env vars | Run explicitly with the right env vars. |
| `evaluate-*.ts` | Quality / metric evaluation (e.g. real-solver quality) | **Read-only** | Periodic. |
| `validate-*.ts` | Schema / invariant validation | **Read-only** | CI / pre-commit. Safe to re-run. |
| `test-*.ts` | Unit / integration tests (legacy naming) | Varies: may write fixtures, create users/records, or call mutating APIs | Use an isolated environment unless proven read-only |
| `export-*.ts` | Export data to external formats | Writes export files outside `prisma/dev.db` | On demand. |
| `seed-*.ts` / `seed_*.ts` | CLI seed scripts (legacy) | **Writes DB** | Explicit invocation. |
| `import-*.ts` / `import_data.ts` | CLI import scripts (legacy) | **Writes DB** | Explicit invocation. |
| `confirm-*.ts` / `abandon-*.ts` / `rollback-*.ts` | One-off import lifecycle ops | **Writes DB** | Explicit invocation, gated by env. |
| `fix-*.ts` | One-off data fixes | **Writes DB** (often gated by `FIX_*` env) | Explicit invocation. |
| `repair-*.ts` | Data repair scripts | **Writes DB** | Explicit invocation, often gated by `--apply` |
| `backfill-*.ts` | Idempotent DB backfill | **Writes DB** | Explicit invocation, often gated by `--dry-run` first |
| `cleanup-*.ts` | DB cleanup | **Writes DB** | Explicit invocation |
| `implement-*.ts` | Schema / config implementation (one-off) | **Writes DB** | At the start of a stage |
| `dry-run-*.ts` | Read-only dry-run preview of a future write | **Read-only** | On demand, before a real write. |
| `prepare-*.ts` / `finalize-*.ts` / `review-*.ts` / `preview-*.ts` / `inspect-*.ts` | Stage-internal helpers | varies | On demand. |
| `*-k<stage>-*.ts` | Stage-tagged scripts. | Read by default. | Re-run when the stage is re-opened. |

**Rule of thumb**: prefixes indicate intent only. Read the script before running it and treat any DB client mutation, file write, mutating HTTP request, repair/apply path, or report generation as a side effect. Consult the inventory and stage report for known behavior.

## Python files

- `parse_cell.py` / `parse_schedule.py` — Word `.docx` parser (read-only on the file system, writes `output.json`)
- `build_teacher_whitelist.py` / `create_mock_data.py` / `diagnose_*.py` — one-off Python utilities
- `test_parse.py` / `test_parse_cell_sanitize.py` — Python unit tests

### Teacher whitelist

- The import API reads an optional private whitelist path from `TEACHER_WHITELIST_PATH`.
- The private whitelist must remain outside the repository. Missing or unavailable configuration falls back to parsing without a whitelist and emits a warning.
- `parse_schedule.py --teachers <path>` accepts an explicit whitelist for CLI use.
- `build_teacher_whitelist.py <input.xlsx> <output.txt>` requires explicit input and output paths.
- `fixtures/teachers.synthetic.txt` contains synthetic names for tests only.

## Disallowed (not in this directory)

- Anything that mass-updates source code (formatting, renaming) — do this in a dedicated stage with `package.json` updates.
- CI/CD scripts — these belong in `.github/` or a future `.ci/` directory.

## Subdirectories

- `f2-verify-screenshots/` — git-ignored; UI verification screenshots
- `k31-a-sample/`, `k32-a-sample/` — git-ignored; sample Excel exports
- `g0fixb-import/`, `diagnose-schedule-import/`, `plan-clean-schedule-dirty-data/` — stage-local artifacts (some git-ignored, some stage-specific)

## See also

- [docs/project-script-inventory-k35-a.md](../docs/project-script-inventory-k35-a.md) — full inventory with `candidate_for_archive` markers and dangerous-script list
