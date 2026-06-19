# K36-A5H Git History Sanitization & Delivery Decision

## Stage

```text
K36-A5H-GIT-HISTORY-SANITIZATION-AND-DELIVERY-DECISION
```

## 1. Purpose

Read-only risk assessment of Git history sensitive data and evaluation of three
delivery routes: continue private-only (A), fresh clean repo / clean export (B),
or git filter-repo history rewrite (C). No destructive operations were performed.

## 2. Current HEAD State

| Item | Value |
|---|---|
| branch | `master` |
| HEAD | `fcaa7881e0b3d2b9e6d3bc047e05c19233ef3682` |
| origin/master | `fcaa7881e0b3d2b9e6d3bc047e05c19233ef3682` |
| ahead/behind | `0 / 0` |
| git status --short | 空（strict clean） |
| release guard exists | ✅ `scripts/guard-release-package-k36-a5g.ts` |
| guard:release exists | ✅ `package.json` script |
| repo private-only | ✅ 是（未公开） |

## 3. Historical Sensitive Path Risk Inventory

Git history contains 301 commits and 976 unique file paths. Sensitive data
exists primarily in the initial baseline commit `bfc678e` ("HANDOVER-REPORT")
and was progressively cleaned in subsequent commits.

### 3.1 Sensitive Paths in Git History (Not at HEAD)

| Pattern | Historical commits | Currently at HEAD | Risk |
|---|---|---|---|
| `scripts/teachers.txt` | `bfc678e` (add), `17366e2` (remove) | ❌ gitignored | **HIGH** — real teacher whitelist (272 bytes) |
| `scripts/teachers.xlsx` | `bfc678e` (add), `17366e2` (remove) | ❌ gitignored | **HIGH** — real teacher spreadsheet (263 bytes) |
| `data/class-student-count.csv` | `bfc678e` (add), `8272f5d` (remove) | ❌ gitignored | **HIGH** — real class student counts |
| `data/room-capacity.csv` | `bfc678e` (add), `8272f5d` (remove) | ❌ gitignored | **HIGH** — real room capacities |
| `output.json` | `bfc678e` (add), `578ba19` (remove) | ❌ gitignored | **HIGH** — real schedule output |
| `scripts/output.json` | `bfc678e` (add), `578ba19` (remove) | ❌ not tracked | **HIGH** — real schedule output |
| `scripts/semester_2026.csv` | `bfc678e` (add), `578ba19` (remove) | ❌ gitignored | **HIGH** — real semester data |
| `scripts/semester_2026.json` | `bfc678e` (add), `578ba19` (remove) | ❌ gitignored | **HIGH** — real semester data |
| `prisma/backups/*.json` | `bfc678e` (add), `a9d128f` (remove) | ❌ gitignored | **MEDIUM** — DB backup JSON (schedule adjustments snapshot) |
| `scripts/mock_schedule.docx` | `bfc678e` (add), `578ba19` (remove) | ❌ gitignored | **MEDIUM** — mock docx (may contain synthetic data) |
| `scripts/output.csv` | `bfc678e` | ❌ not tracked | **MEDIUM** — historical output CSV |

### 3.2 Sensitive Paths at HEAD (Tracked or Ignored)

| Pattern | At HEAD | Status | Risk |
|---|---|---|---|
| `.env` | On disk, gitignored | ✅ safe | BLOCKED by .gitignore + guard |
| `prisma/dev.db` | On disk, gitignored | ✅ safe | BLOCKED by .gitignore + guard |
| `prisma/dev.db.backup-*` | On disk (178 files), gitignored | ✅ safe | BLOCKED by .gitignore + guard |
| `uploads/imports/*` | On disk (30 files), gitignored | ✅ safe | BLOCKED by .gitignore + guard |
| `temp/local-artifacts/*` | On disk, gitignored | ✅ safe | BLOCKED by .gitignore + guard |
| `scripts/teachers.txt` | On disk, gitignored | ✅ safe | BLOCKED by .gitignore + guard |
| `data/class-student-count.csv` | On disk, gitignored | ✅ safe | BLOCKED by .gitignore + guard |
| `data/room-capacity.csv` | On disk, gitignored | ✅ safe | BLOCKED by .gitignore + guard |
| `data/*.template.csv` | Tracked (2 files) | ⚠️ tracked | **LOW** — 3-4 lines, headers + synthetic examples only |

### 3.3 PII Scan Results

- `npm run scan:docs-pii`: 0 BLOCKING, 2 WARNING (masked phone numbers in `k18-task37-source-artifact-review.json` and `k22-real-solver-quality-evaluation.json`)
- 2 masked phone numbers in docs JSON are from pre-existing historical commits
- No real teacher names, class data, or course content in docs at HEAD

### 3.4 Key Finding: Baseline Commit Concentration

The initial baseline commit `bfc678e` ("HANDOVER-REPORT-20260529") is the
**single largest concentration of sensitive data**. It contains:

- `scripts/teachers.txt` — real teacher whitelist
- `scripts/teachers.xlsx` — real teacher spreadsheet
- `data/class-student-count.csv` — real class enrollment
- `data/room-capacity.csv` — real room capacities
- `output.json` — real schedule output
- `scripts/semester_2026.csv/json` — real semester data
- `prisma/backups/*.json` — DB backup snapshot
- `scripts/mock_schedule.docx` — docx fixture

Subsequent commits (`17366e2`, `578ba19`, `8272f5d`, `a9d128f`) progressively
removed these paths from HEAD, but the blobs remain reachable from `bfc678e`.

**Not in history:** `.env`, `prisma/dev.db`, `uploads/` (never committed).

## 4. Route Comparison

| | Route A: Private-only | Route B: Fresh clean repo / export | Route C: git filter-repo |
|---|---|---|---|
| **操作** | 不清历史，继续内部开发 | 从 HEAD 导出干净源码，排除 .git history | 重写历史，删除敏感 blobs |
| **风险** | 不能公开，不能外发 | 丢失 Git 历史；需维护新 repo | 破坏所有 clone；force push；误删风险 |
| **优点** | 零成本，不影响团队 | 最安全；不破坏现有仓库 | 保留单仓库连续历史 |
| **复杂度** | 无 | 低（zip/copy + .gitignore 筛选） | 中-高（filter-repo + 验证） |
| **敏感历史** | 保留（但 private） | 不带走 | 从所有 commit 中移除 |
| **适用场景** | 单人/内部私有开发 | 外部评审、源码交付、演示 | 将当前 repo 本身公开 |
| **前置条件** | 无 | synthetic fixtures + clean .env.example | 备份 + 全量验证 |
| **后续维护** | 无 | 新 repo 需手动同步或单向导出 | force push 后所有协作者需 re-clone |

## 5. Recommended Conclusion

### 5.1 Current Go/No-Go

| Goal | Status | Reason |
|---|---|---|
| **Public GitHub repo** | **No-Go** | Git history contains real teacher names, class data, room capacities, schedule outputs in `bfc678e` |
| **External source delivery (zip/copy)** | **No-Go** | Same reason; zip of working tree is safe but delivery via Git clone is not |
| **Internal private development** | **Go** | HEAD is clean; `.gitignore` + guard cover all sensitive paths; private repo means history exposure is limited to authorized collaborators |

### 5.2 Recommendation

**Default recommendation: Route B (Fresh clean export) for any external delivery.**

- If the goal is **external review / source delivery / demo**: Use Route B.
  Export a clean zip from HEAD, excluding `.git/`, `dev.db`, `uploads/`,
  `temp/`, `.env`, backup files. Add `env.example` and synthetic fixtures.
  This is the lowest-risk path that does not affect the development repo.

- If the goal is **making the current repo public**: Use Route C (filter-repo)
  only after a full backup and with acceptance that all collaborators must
  re-clone. Plan a dedicated stage (K36-A5I-GIT-HISTORY-REWRITE-PLAN) with
  verification gates.

- If the goal is **continue internal development**: No action needed. The
  current private-only setup is sufficient.

**Do not immediately rewrite history.** The cost-benefit is unfavorable unless
there is an explicit decision to make the repository public. Route B (clean
export) covers most external delivery needs without touching the development
repo.

### 5.3 Suggested Next Stages

| If goal is... | Next stage |
|---|---|
| External delivery | `K36-A5I-CLEAN-EXPORT-PACKAGE-PLAN` |
| Public repo | `K36-A5I-GIT-HISTORY-REWRITE-PLAN` |
| Continue development | Proceed to next business/feature stage |

## 6. Residual Risks

| Risk | Status |
|---|---|
| Baseline commit `bfc678e` contains real teacher/class/room/schedule data | Blob reachable via `git log`; only matters if repo is shared |
| 2 masked phone numbers in docs JSON | WARNING only; masked with `***`; pre-existing |
| `.template.csv` tracked at HEAD | LOW risk — 3-4 lines, headers + synthetic examples |
| 178 backup files on disk | gitignored + guard blocked; not in Git history (only 1 historical backup JSON) |
| uploads/ on disk (30 files) | gitignored + guard blocked; never committed |

## 7. Verification Results

| Item | Result |
|---|---|
| `git status --short` | ✅ 空 |
| `git branch --show-current` | ✅ `master` |
| `git rev-parse HEAD` | ✅ `fcaa7881e0b3d2b9e6d3bc047e05c19233ef3682` |
| `git rev-list --left-right --count HEAD...origin/master` | ✅ `0 / 0` |
| `npm run scan:docs-pii` | ✅ 0 BLOCKING, 2 WARNING (unchanged) |
| `npm run guard:release -- --self-test` | ✅ 17/17 PASS |
| `npx tsx scripts/guard-release-package-k36-a5g.ts --root .` | ✅ FAIL = correct (.env blocked) |
| `npx tsx scripts/guard-release-package-k36-a5g.ts --root-raw .` | ✅ FAIL = correct (.env + backups + dev.db + uploads blocked) |
| `npx prisma validate` | ✅ schema valid |
| `npm run build` | ✅ Compiled successfully |

### Guard scan summaries

- `--root .`: 1164 scanned, 179 blocking (.env + dev.db + 177 backups), 49 warnings
- `--root-raw .`: 1210 scanned, 224 blocking (adds temp artifacts + uploads), 49 warnings

Both scans correctly identify sensitive paths. The FAIL verdict is expected and
correct — the guard prevents accidental packaging.

## 8. Prohibition Confirmation

| Prohibition | Status |
|---|---|
| 修改业务代码 | 否 |
| 修改 schema/migration | 否 |
| 写数据库 | 否 |
| 运行真实 preview/apply/rollback/import/调课/seed | 否 |
| 处理 Git 历史 (filter-repo / BFG / rebase / amend) | 否 |
| force push | 否 |
| 提交 dev.db / uploads / temp / docx / generate-report scripts | 否 |
| 读取或输出真实教师姓名、手机号、班级、课程、课表内容 | 否 |
| 删除文件 | 否 |
| 创建新仓库 | 否 |
