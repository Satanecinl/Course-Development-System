# K36-A5I Clean Export Package Plan

## Stage

```text
K36-A5I-CLEAN-EXPORT-PACKAGE-PLAN
```

## 1. Purpose

Design an executable clean export plan for producing a safe, deliverable source
code package (zip) or fresh repo from the current HEAD. This stage is
**read-only planning** — no export is created, no repo is initialized, no files
are copied.

## 2. Current State

| Item | Value |
|---|---|
| branch | `master` |
| HEAD | `be2157ef4eb76fe301661a7f5a86994f96e8d911` |
| origin/master | `be2157ef4eb76fe301661a7f5a86994f96e8d911` |
| ahead/behind | `0 / 0` |
| git status --short | 空（strict clean） |
| release guard | ✅ `guard-release-package-k36-a5g.ts` (22 blocking + 15 warning rules) |
| guard:release | ✅ npm script available |
| tracked files | 948 |
| Total commits | 301 |
| public repo | **No-Go** (Git history contains real data) |
| external delivery | **No-Go** (same reason) |
| A5H recommended route | **Route B: Fresh clean export** |

## 3. Clean Export: Goal and Non-Goal

### 3.1 What Clean Export Is NOT

- ❌ Current repo made public (history not sanitized)
- ❌ Current repo history rewrite (filter-repo / BFG)
- ❌ Source code package containing `.git/` directory
- ❌ Archive containing `dev.db`, `uploads/`, `temp/`, `.env`, backup files
- ❌ Archive containing real teacher names, real class data, real room capacities
- ❌ Mirror of current repo to a new GitHub repository

### 3.2 What Clean Export IS

- ✅ Source code extracted from the current HEAD's working tree
- ✅ Only files that pass the allowlist (Section 4) are included
- ✅ Real data files replaced with synthetic fixtures / template CSVs
- ✅ `.env` replaced with `.env.example` (placeholder keys, no real values)
- ✅ `prisma/dev.db` excluded; `prisma/schema.prisma` + migrations included
- ✅ Verified by `guard-release-package` and `scan:docs-pii` before delivery
- ✅ Suitable for external review, source code delivery, demonstration

## 4. Allowlist Design

### 4.1 Core Source (include)

| Category | Pattern | Notes |
|---|---|---|
| Application source | `src/**` | 232 files. All business logic, API routes, components, lib, store |
| Prisma schema | `prisma/schema.prisma` | Database schema definition |
| Prisma migrations | `prisma/migrations/**` | 10 migration SQL files + lock. No real data; DDL only |
| Prisma seed | `prisma/seed.ts` (if exists) | Not currently tracked; skip if absent |

### 4.2 Config Files at Root (include)

| File | Notes |
|---|---|
| `package.json` | Project config; no secrets |
| `package-lock.json` | Dependency lock |
| `tsconfig.json` | TypeScript config |
| `next.config.ts` | Next.js config |
| `eslint.config.mjs` | ESLint config |
| `postcss.config.mjs` | PostCSS config |
| `components.json` | shadcn/ui config |
| `.gitignore` | Needed for fresh repo |

### 4.3 Documentation (include, with filtering)

| Category | Pattern | Notes |
|---|---|---|
| README | `README.md` | Project readme |
| CLAUDE.md | `CLAUDE.md` | AI assistant instructions (may need sanitization if sharing with external parties) |
| AGENTS.md | `AGENTS.md` | Agent configuration |
| Setup docs | `docs/DEV-RUNBOOK.md` | Development runbook |
| Import workflow | `docs/import-workflow.md` | Pipeline documentation |
| Stage closeout docs | `docs/k*-*.md`, `docs/k*-*.json` | Internal stage records; **review for PII before external delivery** |

### 4.4 Scripts (include, with filtering)

| Category | Pattern | Notes |
|---|---|---|
| Python parser | `scripts/parse_cell.py`, `scripts/parse_schedule.py` | Core parser logic |
| Python tests | `scripts/test_parse.py`, `test_parse.py`, `test_parse_schedule.py` | Parser tests |
| Verify scripts | `scripts/verify-*.ts` | 128 verification scripts |
| Audit scripts | `scripts/audit-*.ts` | 53 audit scripts |
| Test scripts | `scripts/test-*.ts` | 47 test scripts |
| Guard scripts | `scripts/guard-*.ts` | 8 guard scripts |
| Plan scripts | `scripts/plan-*.ts` | 13 plan scripts |
| Backfill scripts | `scripts/backfill-*.ts` | 4 backfill scripts |
| Diagnose scripts | `scripts/diagnose-*.ts` | 9 diagnostic scripts |
| Dry-run scripts | `scripts/dry-run-*.ts` | 6 dry-run scripts |
| Other helper TS | `scripts/build_*.py`, `scripts/diagnose_teachers.ts` etc. | Review case by case |
| Synthetic fixtures | `scripts/fixtures/**` | Synthetic schedule + teacher data |
| Scripts README | `scripts/README.md` | Scripts documentation |

### 4.5 Data (include, template only)

| File | Notes |
|---|---|
| `data/class-student-count.template.csv` | 3 lines: header + synthetic example |
| `data/room-capacity.template.csv` | 4 lines: header + synthetic examples |

### 4.6 Public (include)

| File | Notes |
|---|---|
| `public/file.svg` | Next.js default assets |
| `public/globe.svg` | Next.js default assets |
| `public/next.svg` | Next.js default assets |
| `public/vercel.svg` | Next.js default assets |
| `public/window.svg` | Next.js default assets |

### 4.7 Root Files (include)

| File | Notes |
|---|---|
| `test_parse.py` | Parser tests (root level) |
| `test_parse_schedule.py` | Parser tests (root level) |

### 4.8 New Files to Create for Export

| File | Purpose |
|---|---|
| `.env.example` | Placeholder environment variables (no real values) |
| `FIXTURES.md` | Documents synthetic data sources and how to replace with real data |

## 5. Exclude / Blocking Rules

### 5.1 Must Exclude (never enters clean export)

| Pattern | Reason |
|---|---|
| `.git/**` | Git history contains real data |
| `.env`, `.env.*` | Secrets |
| `prisma/dev.db` | Local database with real data |
| `prisma/*.db` | Any SQLite databases |
| `prisma/dev.db.backup-*` | 178 backup files |
| `prisma/backups/**` | Backup directory |
| `uploads/**` | 30 real imported docx/json files |
| `imports/**` | Import artifacts |
| `temp/**` | Local artifacts, report drafts, docx |
| `.claude/**` | Local tool config |
| `.codegraph/**` | Code graph cache |
| `.next/**` | Build output |
| `node_modules/**` | Dependencies |
| `coverage/**` | Test coverage |
| `tsconfig.tsbuildinfo` | Build cache |
| `scripts/teachers.txt` | Real teacher whitelist |
| `scripts/teachers.xlsx` | Real teacher spreadsheet |
| `data/class-student-count.csv` | Real class enrollment |
| `data/room-capacity.csv` | Real room capacities |
| `output.json` | Real schedule output |
| `scripts/output.json` | Real schedule output |
| `scripts/semester_2026.*` | Real semester data |
| `scripts/generate-report-*.js` | Generate-report scripts (untracked but on disk) |
| `scripts/mock_schedule.docx` | Docx file (untracked but on disk) |
| `scripts/k31-a-sample/*.xlsx` | Real sample xlsx (untracked) |
| `scripts/k32-a-sample/*.xlsx` | Real sample xlsx (untracked) |
| `scripts/f2-verify-screenshots/*.png` | Screenshots with real UI data (untracked) |
| `templates/串课申请表模板.xlsx` | xlsx template (tracked; **must be excluded from export despite being tracked**) |
| `*汇报材料*.docx` | Report docx with real data |
| `*_check_tech.md` | Local report drafts |
| `*_check_usage.md` | Local report drafts |

### 5.2 Review Before External Delivery

| Pattern | Action |
|---|---|
| `docs/k18-task37-source-artifact-review.json` | Contains masked phone number; review for PII |
| `docs/k22-real-solver-quality-evaluation.json` | Contains masked phone number; review for PII |
| `docs/k22-teacher-day-balance-*.json` | Contains teacher keyword; review |
| `CLAUDE.md` | Contains internal workflow details; may need sanitization |
| `AGENTS.md` | Agent config; review |
| `docs/HANDOVER-REPORT-20260529.md` | Handover document; review |
| `docs/k*-*.md`, `docs/k*-*.json` | 386 docs; PII scan covers JSON only; md files need manual check if public |

## 6. Future Export Execution Flow

> This section describes the future execution steps. **Nothing is executed in this stage.**

### Step 1: Create Staging Directory

```bash
mkdir -p /tmp/clean-export/cours scheduling-system
cd /tmp/clean-export/cours scheduling-system
```

### Step 2: Extract Files from HEAD by Allowlist

```bash
# Method A: git archive from HEAD, then filter
cd /path/to/repo
git archive HEAD | tar -x -C /tmp/clean-export/cours scheduling-system

# Method B: rsync with include/exclude rules (see Section 6.1)
```

#### 6.1 rsync-based extraction (recommended)

```bash
rsync -av --delete \
  --exclude='.git/' \
  --exclude='.env' --exclude='.env.*' \
  --exclude='prisma/dev.db' --exclude='prisma/*.db' \
  --exclude='prisma/dev.db.backup-*' --exclude='prisma/backups/' \
  --exclude='uploads/' --exclude='imports/' \
  --exclude='temp/' \
  --exclude='.claude/' --exclude='.codegraph/' \
  --exclude='.next/' --exclude='node_modules/' \
  --exclude='coverage/' \
  --exclude='tsconfig.tsbuildinfo' \
  --exclude='templates/串课申请表模板.xlsx' \
  --exclude='*.docx' --exclude='*.xlsx' --exclude='*.png' --exclude='*.jpg' \
  /path/to/repo/ /tmp/clean-export/cours scheduling-system/
```

### Step 3: Remove Excluded Tracked Files from Staging

After extraction, explicitly remove tracked-but-excluded files:

```bash
rm -f /tmp/clean-export/cours scheduling-system/templates/串课申请表模板.xlsx
```

### Step 4: Create `.env.example`

```bash
cat > /tmp/clean-export/cours scheduling-system/.env.example << 'EOF'
# Database
DATABASE_URL="file:./dev.db"

# Auth
AUTH_SECRET="replace-with-openssl-rand-base64-32"
NEXTAUTH_URL="http://localhost:3000"

# Next.js
NEXT_TELEMETRY_DISABLED=1
EOF
```

### Step 5: Create `FIXTURES.md`

Document all synthetic data sources:
- `data/class-student-count.template.csv` — header + example row
- `data/room-capacity.template.csv` — header + example rows
- `scripts/fixtures/schedule.synthetic.json` — synthetic schedule data
- `scripts/fixtures/teachers.synthetic.txt` — synthetic teacher list

### Step 6: Verify with Guard

```bash
cd /tmp/clean-export/cours scheduling-system
npx tsx /path/to/repo/scripts/guard-release-package-k36-a5g.ts --root . --strict
```

Expected: PASS with zero blocking, warnings acceptable.

### Step 7: Verify PII

```bash
# Copy scan:docs-pii script to staging or run from repo
npx tsx /path/to/repo/scripts/scan-docs-pii.ts --dir docs/
```

Expected: 0 BLOCKING.

### Step 8: Verify Build (optional, for full delivery)

```bash
cd /tmp/clean-export/cours scheduling-system
npm install
npx prisma generate
npm run build
```

### Step 9: Generate Archive

```bash
cd /tmp/clean-export
tar -czf cours scheduling-system-v1.0.0-clean.tar.gz cours scheduling-system/
# or
cd /tmp/clean-export && zip -r cours scheduling-system-v1.0.0-clean.zip cours scheduling-system/
```

### Step 10: Verify Archive Manifest

```bash
# List archive contents
tar -tzf /tmp/clean-export/cours scheduling-system-v1.0.0-clean.tar.gz | sort > /tmp/archive-manifest.txt

# Run guard on manifest
npx tsx /path/to/repo/scripts/guard-release-package-k36-a5g.ts --manifest /tmp/archive-manifest.txt --strict
```

Expected: PASS.

### Step 11: Record Artifacts

```bash
sha256sum /tmp/clean-export/cours scheduling-system-v1.0.0-clean.tar.gz > /tmp/cours scheduling-system-v1.0.0-clean.sha256
# Save manifest + guard output + PII scan output + build log
```

## 7. Fresh Repo Plan

If the goal is a standalone fresh repo (not just a zip):

### 7.1 Initialization

```bash
mkdir fresh-cours scheduling-system && cd fresh-cours scheduling-system
git init
```

### 7.2 Content

- Copy the clean export content (from Step 2-5 above)
- Initial commit: `feat: initial clean export of cours scheduling-system`

### 7.3 README Update

Add to README.md:

```markdown
## Data Notice

This repository uses **synthetic fixtures only**. No real teacher names, student
data, class schedules, or room assignments are included. To use with real data:

1. Replace `data/*.template.csv` with actual data
2. Import real schedule via `.docx` → Python parser → Import API
3. Configure `.env` with real `DATABASE_URL`
```

### 7.4 What Does NOT Transfer

- `.git/` history from old repo
- Old issues / PRs / wikis
- GitHub Actions secrets
- Webhooks / deploy keys
- Any real data blobs reachable from old commits

### 7.5 Post-Init

- Re-configure CI/CD secrets (if any)
- Set up branch protection rules
- Configure `.gitignore` (already included from clean export)
- Verify guard + PII scan pass on fresh repo

### 7.6 Prohibition

- ❌ Do NOT mirror the old repo (carries history)
- ❌ Do NOT `git push --mirror` from old repo
- ❌ Do NOT copy `.git/` directory

## 8. Verification Results

| Item | Result |
|---|---|
| `git status --short` | ✅ 空 |
| `git branch --show-current` | ✅ `master` |
| `git rev-parse HEAD` | ✅ `be2157ef4eb76fe301661a7f5a86994f96e8d911` |
| `git rev-list --left-right --count HEAD...origin/master` | ✅ `0 / 0` |
| `npm run scan:docs-pii` | ✅ 0 BLOCKING, 2 WARNING (unchanged) |
| `npm run guard:release -- --self-test` | ✅ 17/17 PASS |
| `guard --root .` | ✅ FAIL = correct (.env + dev.db + 177 backups blocked) |
| `guard --root-raw .` | ✅ FAIL = correct (adds temp + uploads + more artifacts) |
| `npx prisma validate` | ✅ schema valid |
| `npm run build` | ✅ Compiled successfully |

Guard FAIL scans are **expected** — they detect real data on disk that must not
enter the clean export. This confirms the guard works correctly as a pre-delivery
gate.

## 9. File Count Summary (Tracked at HEAD)

| Directory | Count | Clean Export | Notes |
|---|---|---|---|
| `src/` | 232 | ✅ All | Application source |
| `prisma/` | 12 | ✅ Schema + migrations only | Exclude dev.db (not tracked) |
| `scripts/` | 296 | ✅ Most | Exclude `templates/串课申请表模板.xlsx`; fixtures included |
| `docs/` | 386 | ✅ Most | PII review needed for 2 flagged JSON files |
| `public/` | 5 | ✅ All | SVG assets only |
| `data/` | 2 | ✅ All | Template CSVs only |
| Root configs | 13 | ✅ Most | Exclude nothing at root (no .env/dev.db tracked) |
| **Total** | **948** | **~947** | Only `templates/串课申请表模板.xlsx` excluded from tracked |

## 10. Prohibition Confirmation

| Prohibition | Status |
|---|---|
| 创建 zip / tar | 否 |
| 创建 fresh repo | 否 |
| 复制完整源码到新目录 | 否 |
| 运行 git filter-repo / BFG | 否 |
| 重写 Git history | 否 |
| 删除文件 | 否 |
| 修改业务代码 | 否 |
| 修改 schema / migration | 否 |
| 写数据库 | 否 |
| 运行真实 preview / apply / rollback / import / 调课 / seed | 否 |
| 提交 dev.db / uploads / temp / docx / generate-report scripts | 否 |
| 读取或输出真实教师姓名、手机号、班级、课程、课表内容 | 否 |
