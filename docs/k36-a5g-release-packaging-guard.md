# K36-A5G Release Packaging Guard

## Stage

```text
K36-A5G-RELEASE-PACKAGING-GUARD
```

## 1. Purpose

Add a pre-release packaging guard that prevents external delivery packages
(source archives, reporting bundles, scripts-packaging zips) from
accidentally including sensitive local artifacts such as `prisma/dev.db`,
`uploads/`, `.env`, real `.docx` teacher reports, `teachers` whitelist
files, `temp/` artifacts, ignored DB backups, `node_modules/`, etc.

The guard is a **prevention** mechanism for future packages. It does NOT
clean Git history (that's a separate decision requiring history rewrite or
fresh repo) and does NOT make the repository public-safe.

## 2. Implementation

### New files

| File | Purpose |
|---|---|
| `scripts/guard-release-package-k36-a5g.ts` | Main guard script with blocking/warning rules, root scan, manifest scan, self-test |
| `scripts/verify-release-package-guard-k36-a5g.ts` | Verification script: 17 independent test cases confirming guard behavior |
| `docs/k36-a5g-release-packaging-guard.md` | This document |
| `docs/k36-a5g-release-packaging-guard.json` | Machine-readable closeout record |
| `package.json` (1 line added) | `"guard:release": "tsx scripts/guard-release-package-k36-a5g.ts"` npm script |

### Modes

| Mode | Command | Description |
|---|---|---|
| Default root scan | `npm run guard:release -- --root .` | Walk target dir, skip ignored dirs (`.git`, `node_modules`, etc.) |
| Raw root scan | `npm run guard:release -- --root-raw .` | Walk target dir including ignored files (finds `.env`, `dev.db`, etc.) |
| Manifest scan | `npm run guard:release -- --manifest <file>` | Read a file listing one path per line |
| Self-test | `npm run guard:release -- --self-test` | Built-in 17-case self-test |
| Verify script | `npx tsx scripts/verify-release-package-guard-k36-a5g.ts` | External 17-case verification |

### Strict mode

`--strict` treats WARNING hits as BLOCKING (exit 1). Without `--strict`,
WARNINGs are informational — exit 0.

### File content policy

The guard **never opens or reads file contents**. Only path/filename
matching. Content-based PII scanning is the job of `npm run scan:docs-pii`.

## 3. Blocking Rules

| Rule ID | Pattern | Reason |
|---|---|---|
| VCS_GIT | `**/.git/**` | Git internals must never be packaged |
| NODE_MODULES | `**/node_modules/**` | Reproducible from package-lock |
| NEXT_BUILD | `**/.next/**` | Next.js build output is reproducible |
| TSBUILDINFO | `**/*.tsbuildinfo` | TypeScript incremental build info |
| COVERAGE | `**/coverage/**` | Test coverage output |
| CODEGRAPH | `**/.codegraph/**` | Local code graph cache |
| CLAUDE | `**/.claude/**` | Local Claude tool config |
| ENV_FILE | `**/.env` | .env must never be packaged |
| ENV_FILE_VARIANT | `**/.env.*` | .env.* variants must never be packaged |
| PRISMA_DEV_DB | `**/prisma/dev.db` | Local Prisma dev.db |
| PRISMA_DB | `**/prisma/*.db` | Prisma .db files |
| PRISMA_BACKUP | `**/prisma/*.backup*` | Prisma backup files |
| PRISMA_BACKUPS_DIR | `**/prisma/backups/**` | Prisma backup directory |
| GENERIC_DB | `**/*.db` | Generic .db files |
| SQLITE_DB | `**/*.sqlite` | SQLite files |
| SQLITE3_DB | `**/*.sqlite3` | SQLite3 files |
| BACKUP_FILE | `**/*.backup*` | Backup files |
| UPLOADS | `**/uploads/**` | Upload directory |
| IMPORTS | `**/imports/**` | Imports directory |
| TEMP | `**/temp/**` | Local-only temp directory (allowlisted: temp/README.md, temp/.gitkeep) |
| TEACHERS_LIST | `**/scripts/teachers.txt` | Real teacher whitelist |
| TEACHERS_XLSX | `**/scripts/teachers.xlsx` | Real teacher spreadsheet |
| TEACHERS_LIST_GLOB | `**/teachers.txt` | Real teacher whitelist |
| TEACHERS_XLSX_GLOB | `**/teachers.xlsx` | Real teacher spreadsheet |
| CLASS_STUDENT_COUNT_CSV | `**/data/class-student-count.csv` | Local real class data |
| ROOM_CAPACITY_CSV | `**/data/room-capacity.csv` | Local real room data |
| SEMESTER_2026_OUTPUT | `**/semester_2026.*` | Real semester export |
| OUTPUT_JSON | `**/output.json` | Generic real-data output |
| GENERATE_REPORT | `**/scripts/generate-report-*.js` | Generate-report scripts |
| REPORT_TECH_MD | `**/_check_tech.md` | Local report draft |
| REPORT_USAGE_MD | `**/_check_usage.md` | Local report draft |
| REPORT_DOCX_GLOB | `**/*汇报材料-*.docx` | Report docx (real data) |
| REPORT_DOCX_GLOB2 | `**/*汇报素材-*.docx` | Report docx (real data) |

## 4. Warning Rules

| Rule ID | Pattern | Reason |
|---|---|---|
| DOCX_FILE | `**/*.docx` | May contain real data; manual review |
| XLSX_FILE | `**/*.xlsx` | May contain real data; manual review |
| CSV_FILE | `**/*.csv` | May contain real data; manual review |
| ARCHIVE_ZIP/7Z/RAR | `**/*.{zip,7z,rar}` | May contain real data; manual review |
| IMG_PNG/JPG/JPEG/WEBP | `**/*.{png,jpg,jpeg,webp}` | May contain screenshots with real data |
| PATH_REPORT_KEYWORD | path contains `汇报材料` | K35-A report material |
| PATH_REAL_KEYWORD | path contains `真实` | Contains "real" keyword |
| PATH_TEACHER_KEYWORD | path contains `teacher` | Contains "teacher" keyword |
| PATH_STUDENT_KEYWORD | path contains `student` | Contains "student" keyword |
| PATH_PHONE_KEYWORD | path contains `phone` | Contains "phone" keyword |

## 5. Verification Results

| Test case | Expected | Actual | Result |
|---|---|---|---|
| 1. Clean synthetic manifest → PASS | PASS | PASS | ✓ |
| 2. prisma/dev.db → BLOCKING/FAIL | FAIL | FAIL (PRISMA_DEV_DB) | ✓ |
| 3. .env → BLOCKING/FAIL | FAIL | FAIL (ENV_FILE) | ✓ |
| 4. .env.production → BLOCKING/FAIL | FAIL | FAIL (ENV_FILE_VARIANT) | ✓ |
| 5. temp/artifact.docx → BLOCKING/FAIL | FAIL | FAIL (TEMP) | ✓ |
| 6. scripts/teachers.txt → BLOCKING/FAIL | FAIL | FAIL (TEACHERS_LIST) | ✓ |
| 7. ordinary docs md/json → PASS | PASS | PASS | ✓ |
| 8. docx → WARNING/PASS (default) | PASS | PASS (warning=1) | ✓ |
| 9. docx + strict → FAIL | FAIL | FAIL (warning=1, strict) | ✓ |
| 10. uploads/file.docx → BLOCKING/FAIL | FAIL | FAIL (UPLOADS) | ✓ |
| 11. generate-report-tech.js → BLOCKING/FAIL | FAIL | FAIL (GENERATE_REPORT) | ✓ |
| 12. 汇报材料 keyword → BLOCKING/FAIL | FAIL | FAIL (PATH_REPORT_KEYWORD) | ✓ |
| 13. temp/README.md + .gitkeep allowlisted → PASS | PASS | PASS (no blocking) | ✓ |
| 14. semester_2026.xlsx → BLOCKING/FAIL | FAIL | FAIL (SEMESTER_2026_OUTPUT) | ✓ |
| 15. output.json → BLOCKING/FAIL | FAIL | FAIL (OUTPUT_JSON) | ✓ |
| 16. JSON output has required fields | valid JSON | valid JSON | ✓ |
| 17. Output not file contents | no import/export | no import/export | ✓ |

### Root scan behavior

- `--root .` (default): skips ignored directories, finds `.env` at root → BLOCKING. This is **correct behavior** — the guard catches `.env` before package creation even though it's gitignored.
- `--root-raw .` (raw): also finds `prisma/dev.db`, 15+ backup files, `scripts/teachers.txt`, etc. All BLOCKING as expected.
- Neither scan modifies files, runs git commands, or reads file contents.

### Guard capabilities

- Scans a manifest (file listing paths) or a target directory
- Path/filename matching only (no content inspection)
- Strict mode option (warnings become blocking)
- JSON output for CI integration
- Exit codes: 0=PASS, 1=FAIL, 2=USAGE_ERROR

### Guard limitations

- Does NOT read file content (PII content scanning is `npm run scan:docs-pii`)
- Does NOT clean Git history (history sanitization is a separate decision)
- Does NOT decide whether the repo can be made public
- Does NOT delete, move, or upload files
- Path-based matching may miss cases (e.g. obfuscated filenames with sensitive content)

## 6. Current Repo Status (as of `09677d4`)

| Aspect | Status |
|---|---|
| Git history sensitive data | Not cleaned (still blocked from public) |
| Release packaging guard | **Done** (this stage) |
| Private repo internal dev | Go |
| Public repo | **No-Go** (Git history + guard not a history cleaner) |
| External source delivery | **No-Go** (needs history rewrite or fresh repo decision) |
| dev.db / uploads / temp artifacts | **Not deliverable** (guard correctly BLOCKS) |

## 7. Residual Risks

| Risk | Status |
|---|---|
| Git history sensitive data not cleaned | Still blocked from public repo / external source delivery |
| guard ≠ history sanitization | The guard protects future packages but does not address past history |
| public repo | No-Go — requires history rewrite or fresh repo decision |
| external source delivery | No-Go — requires clean export or history rewrite |
| dev.db / uploads / temp artifacts | Not deliverable (guard correctly blocks) |

## 8. Prohibition Confirmation

| Prohibition | Status |
|---|---|
| 修改业务代码 | 否 |
| 修改 schema/migration | 否 |
| 写数据库 | 否 |
| 运行真实 preview/apply/rollback/import/调课 | 否 |
| 处理 Git 历史 | 否 |
| force push | 否 |
| 提交 dev.db / uploads / temp / docx | 否 |
| 提交 generate-report scripts | 否 |