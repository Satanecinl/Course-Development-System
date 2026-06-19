# K36-A5K Fresh Repo Initialization Plan

## Stage

```text
K36-A5K-FRESH-REPO-INIT-PLAN
```

## 1. Purpose

Design a step-by-step plan for initializing a fresh public/reviewable Git
repository from the K36-A5J1 clean export package. This stage is **read-only
planning** — no repo is created, no files are copied, no push is made.

## 2. Current State

| Item | Value |
|---|---|
| branch | `master` |
| HEAD | `0dc2a3067f953ea97c72887d2837476a6ad018f3` |
| origin/master | `0dc2a3067f953ea97c72887d2837476a6ad018f3` |
| ahead/behind | `0 / 0` |
| git status | empty (strict clean) |
| Clean export package | `temp/clean-export/k36-a5j/package/courscheduling-system-v1.0.0-clean.tar.gz` |
| SHA256 | `5f0b2a520a595d445ecabbb58683ca1925282974eb6e0e27ac2c46f767088c70` |
| Strict guard (archive manifest) | PASS (0 blocking, 12 allowed, 0 unresolved) |
| PII scan | 0 BLOCKING, 2 existing WARNING |
| Prisma validate | schema valid |
| Build | PASS |
| Current repo public | **No-Go** |

## 3. Fresh Repo: Non-Goals

A fresh repo initialization is **NOT**:

- ❌ Mirror of the current private repo (`git push --mirror`)
- ❌ Copy of the `.git/` directory from the current repo
- ❌ History rewrite of the current repo (`git filter-repo` / BFG)
- ❌ Making the current private repo public
- ❌ Carrying any sensitive artifacts: `dev.db`, `.env`, `uploads/`, `temp/`, `backups/`
- ❌ Including Git history that contains real teacher names, class data, room capacities, schedule outputs
- ❌ Transferring GitHub Actions secrets, webhooks, deploy keys, or branch protection rules

A fresh repo **IS**:

- ✅ A new, standalone Git repository initialized from the clean export package
- ✅ Contains only source code + synthetic fixtures + docs (no real data)
- ✅ Has a single initial commit with no connection to the old repo's history
- ✅ Safe for public hosting, external review, or source code delivery

## 4. Fresh Repo Initialization Flow

> These steps describe future execution. **Nothing is executed in this stage.**

### Step 1: Verify Clean Export Package

Before creating the fresh repo, verify the package is intact.

```bash
cd /path/to/workdir

# Verify SHA256
sha256sum courscheduling-system-v1.0.0-clean.tar.gz
# Expected: 5f0b2a520a595d445ecabbb58683ca1925282974eb6e0e27ac2c46f767088c70

# Extract to temporary location
mkdir fresh-repo-staging
tar -xzf courscheduling-system-v1.0.0-clean.tar.gz -C fresh-repo-staging/
```

### Step 2: Pre-Init Safety Checks

Run these checks on the extracted content **before** `git init`.

```bash
cd fresh-repo-staging

# No .git from old repo
test ! -d .git && echo "OK: no .git"

# No sensitive files
test ! -f .env && echo "OK: no .env"
test ! -f prisma/dev.db && echo "OK: no dev.db"
test ! -d uploads && echo "OK: no uploads"
test ! -d temp/local-artifacts && echo "OK: no temp artifacts"

# Synthetic fixtures only
grep -r '测试专业\|SYN-\|测试教师' data/ scripts/fixtures/ && echo "OK: synthetic data present"
```

### Step 3: Run Guard on Extracted Content

```bash
# Generate manifest
find . -type f | sort > /tmp/fresh-repo-manifest.txt

# Run guard strict with allowlist
npx tsx /path/to/guard-release-package-k36-a5g.ts \
  --manifest /tmp/fresh-repo-manifest.txt \
  --strict \
  --allowlist /path/to/k36-a5j-export-warning-allowlist.json \
  --json

# Expected: PASS, 0 blocking, 12 allowed, 0 unresolved
```

### Step 4: Run PII Scan

```bash
# Scan docs for PII
npx tsx /path/to/scan-docs-pii.ts --dir docs/

# Expected: 0 BLOCKING
```

### Step 5: Initialize Fresh Git Repository

```bash
cd fresh-repo-staging

# Initialize (creates .git with empty history)
git init

# Stage all files
git add .

# Verify staged content
git diff --cached --name-only | wc -l   # Expected: ~951 files
git diff --cached --stat

# Initial commit
git commit -m "feat: initial clean export

Sanitized source code from College Course Scheduling System.
Contains synthetic fixtures only — no real teacher names, student
data, class schedules, or room assignments.

See FIXTURES.md for synthetic data documentation.
See SETUP.md for environment configuration instructions.
"
```

### Step 6: Create GitHub Repository

```bash
# Option A: via GitHub CLI
gh repo create courscheduling-system --public --source=. --push

# Option B: manual
# 1. Create repo on github.com (public or private-as-needed)
# 2. Add remote
git remote add origin git@github.com:<owner>/courscheduling-system.git
# 3. Push
git push -u origin master
```

### Step 7: Post-Init Configuration

```bash
# Branch protection (via GitHub UI or CLI)
gh api repos/<owner>/courscheduling-system/branches/master/protection \
  --method PUT \
  --field required_status_checks='{"strict":true,"contexts":[]}' \
  --field enforce_admins=true \
  --field required_pull_request_reviews='{"required_approving_review_count":1}'

# Set description
gh repo edit <owner>/courscheduling-system \
  --description "College Course Scheduling System — sanitized clean export" \
  --homepage ""

# Topics
gh repo edit <owner>/courscheduling-system \
  --add-topic scheduling --add-topic nextjs --add-topic prisma --add-topic typescript
```

### Step 8: Verify Fresh Repo

```bash
# Clone fresh repo to verify from clean state
cd /tmp
git clone git@github.com:<owner>/courscheduling-system.git verify-clone
cd verify-clone

# Verify no sensitive files
test ! -f .env && echo "OK"
test ! -f prisma/dev.db && echo "OK"
test ! -d uploads && echo "OK"

# Verify commit count (should be 1)
git log --oneline | wc -l   # Expected: 1

# Verify no old repo history
git log --oneline   # Should show only the initial commit

# Verify build
npm install && npx prisma generate && npm run build
```

### Step 9: Archive Verification Artifacts

Store these locally (NOT in the fresh repo):

| Artifact | Purpose |
|---|---|
| `courscheduling-system-v1.0.0-clean.tar.gz` | Original package |
| `sha256.txt` | Checksum verification |
| `archive-manifest.txt` | File list for auditing |
| `guard-archive.json` | Guard output record |
| `k36-a5j-export-warning-allowlist.json` | Allowlist used |
| K36-A5J/A5J1 closeout docs | Full decision trail |

## 5. README / Data Notice Requirements

The fresh repo README.md **must** include a Data Notice section. Suggested text:

```markdown
## Data Notice

This repository is a **sanitized clean export** of the College Course
Scheduling System. It was extracted from a private development repository
and verified to contain no sensitive data.

**Key facts:**
- This repository does **not** contain the original Git history.
- All schedule data uses **synthetic fixtures only** — no real teacher
  names, student data, class schedules, or room assignments are included.
- Real deployment requires creating a local `.env` file — see `SETUP.md`.
- No production database, uploads directory, or backup files are included.
- The original private development repository remains private.

**Files containing synthetic data:**
- `data/class-student-count.template.csv` — synthetic class names
- `data/room-capacity.template.csv` — synthetic room data
- `scripts/fixtures/teachers.synthetic.txt` — synthetic teacher names
- `scripts/fixtures/schedule.synthetic.json` — synthetic schedule data

See `FIXTURES.md` for complete documentation on replacing synthetic
fixtures with real data.
```

### Additional README Sections (Recommended)

| Section | Content |
|---|---|
| Quick Start | `npm install` → `npx prisma generate` → `npx prisma db push` → `npm run dev` |
| Architecture | Brief description of the system |
| Data Pipeline | `.docx` → Python parser → JSON → Import API → SQLite |
| Features | Schedule dashboard, conflict detection, adjustments, WorkTime settings |
| License | Add appropriate license |
| Contributing | If accepting contributions |

## 6. Pre-Publication Checklist

| # | Check | Command | Expected | Blocking? |
|---|---|---|---|---|
| 1 | SHA256 matches | `sha256sum tar.gz` | `5f0b2a...8c70` | ✅ Yes |
| 2 | Guard strict PASS | `guard --manifest <file> --strict --allowlist <file>` | PASS, 0 unresolved | ✅ Yes |
| 3 | PII scan 0 BLOCKING | `scan:docs-pii` | 0 BLOCKING | ✅ Yes |
| 4 | Build PASS | `npm run build` | Compiled successfully | ✅ Yes |
| 5 | No old .git history | `git log --oneline \| wc -l` | 1 (initial commit only) | ✅ Yes |
| 6 | No .env / dev.db / uploads | `test ! -f .env && test ! -f prisma/dev.db` | All OK | ✅ Yes |
| 7 | No temp / backups | `test ! -d temp/local-artifacts` | OK | ✅ Yes |
| 8 | Synthetic fixtures only | Verify `data/` + `scripts/fixtures/` content | No real names/data | ✅ Yes |
| 9 | README data notice | `grep -c 'synthetic' README.md` | ≥ 1 | ✅ Yes |
| 10 | FIXTURES.md exists | `test -f FIXTURES.md` | Exists | ⚠️ Recommended |
| 11 | SETUP.md exists | `test -f SETUP.md` | Exists | ⚠️ Recommended |
| 12 | No real teacher names in docs | PII scan + manual spot-check | 0 hits | ✅ Yes |
| 13 | Guard self-test | `guard --self-test` | 17/17 | ✅ Yes |
| 14 | Prisma schema valid | `prisma validate` | Valid | ⚠️ Recommended |
| 15 | Commit count = 1 | `git rev-list --count HEAD` | 1 | ✅ Yes |

## 7. Risks & Recommendations

| Risk | Status | Mitigation |
|---|---|---|
| Clean export package externally deliverable | **YES** (strict guard PASS) | Use fresh repo for reviewable delivery |
| Current repo public | **No-Go** | History contains real data |
| Fresh repo for external review | **YES** — safe from clean export | Initialize per this plan only |
| Make current repo public | Not recommended | Requires Route C history rewrite |
| Old repo remote made public | **Not recommended** | Would expose real data in history |
| Fresh repo diverges from dev repo | Expected | Sync manually or accept one-way |
| Fresh repo has no CI/CD history | Expected | Re-configure CI after init |
| License not yet chosen | Needs decision | Add LICENSE file before publishing |

### Sync Strategy (Post-Init)

After the fresh repo is created, ongoing development continues in the private
repo. Periodic clean exports can be pushed to the fresh repo as versioned
releases:

1. Run K36-A5J process (clean export → guard → verify)
2. Create new archive
3. Force-push or merge to fresh repo branch
4. Tag release version

**Note:** This is a one-way sync (private → public). The fresh repo should
never receive PRs that aren't also applied to the private repo.

## 8. Verification Results

| Item | Result |
|---|---|
| `git status --short` | ✅ 空 |
| `git branch --show-current` | ✅ `master` |
| `git rev-parse HEAD` | ✅ `0dc2a3067f953ea97c72887d2837476a6ad018f3` |
| `git rev-list --left-right --count HEAD...origin/master` | ✅ `0 / 0` |
| SHA256 | ✅ `5f0b2a52...8c70` (matches A5J1 record) |
| Archive manifest strict guard (allowlist) | ✅ PASS, 0 blocking, 12 allowed, 0 unresolved |
| Guard self-test | ✅ 17/17 PASS |
| PII scan | ✅ 0 BLOCKING, 2 WARNING |
| Prisma validate | ✅ schema valid |
| Build | ✅ PASS |

## 9. Prohibition Confirmation

| Prohibition | Status |
|---|---|
| 创建新仓库 | 否 |
| git init 到新目录 | 否 |
| push 到 GitHub | 否 |
| git filter-repo / BFG | 否 |
| 重写 Git history | 否 |
| force push | 否 |
| 删除文件 | 否 |
| 修改业务代码 | 否 |
| 修改 schema / migration | 否 |
| 写数据库 | 否 |
| 运行真实 preview / apply / rollback / import / 调课 / seed | 否 |
| 提交 temp/clean-export/** | 否 |
| 读取或输出真实教师姓名、手机号、班级、课程、课表内容 | 否 |
