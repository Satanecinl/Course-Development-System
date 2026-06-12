# K35-A Project Housekeeping — README, temp, Script Inventory

## 阶段

```txt
K35-A-PROJECT-HOUSEKEEPING-README-TEMP-AND-SCRIPT-INVENTORY
```

## 1. 目的

K34-A3 multi-room / secondary room support 已 **READY_FOR_REAL_USE**。K35-A 是项目整理的第一阶段，本阶段**只做 housekeeping**，不做新功能、不动业务代码、不升级依赖。

具体目标：

1. 建立 `temp/` 目录规则（git-ignored，本地临时工件专用）
2. 清理当前已知 untracked 临时文件（K28-B 三件）
3. 更新 `README.md`（项目入口、状态、规则）
4. 新增项目状态文档（`docs/current-project-status.md`）
5. 新增 scripts 目录说明和脚本盘点（`scripts/README.md` + `docs/project-script-inventory-k35-a.md`）
6. 识别失效脚本（标记 `candidate_for_archive`），但**不删除、不移动**
7. 输出下一阶段依赖升级 / 脚本归档建议

## 2. 修改清单

### 2.1 新增 tracked 文件

| 文件 | 用途 |
|---|---|
| `temp/README.md` | `temp/` 目录说明（仅此文件被跟踪） |
| `README.md` | 项目入口（替换原 README） |
| `docs/current-project-status.md` | 当前项目状态（功能 readiness + baseline + 已知工件 + 下一阶段建议） |
| `scripts/README.md` | scripts 目录约定与命名规范 |
| `docs/project-script-inventory-k35-a.md` | 完整脚本盘点 + 危险脚本列表 + `candidate_for_archive` 标记 |
| `docs/k35-a-project-housekeeping-readme-temp-and-script-inventory.md` | 本文档 |
| `docs/k35-a-project-housekeeping-readme-temp-and-script-inventory.json` | 本阶段 JSON 报告 |

### 2.2 修改 tracked 文件

- `.gitignore` — 末尾追加 `/temp/**` 块（仅 `temp/README.md` 与 `temp/.gitkeep` 例外）

### 2.3 移动 untracked 到 `temp/`（**未提交**）

| 来源 | 目标 | 备注 |
|---|---|---|
| `docs/项目汇报材料.md` | `temp/local-artifacts/k28-b/项目汇报材料.md` | UTF-8 草稿 |
| `k28-b-manual-trial-result.json` | `temp/local-artifacts/k28-b/k28-b-manual-trial-result.json` | K28-B 人工试跑 |
| `scripts/k28-b-run-manual-trial.ts` | `temp/local-artifacts/k28-b/k28-b-run-manual-trial.ts` | K28-B 人工试跑 |

K35-A 范围内**明确禁止**：
- ❌ 提交这些 untracked
- ❌ 移动任何 tracked 脚本
- ❌ 删除任何 tracked 脚本
- ❌ 删除任何 tracked 文件

## 3. temp 规则

```gitignore
# K35-A: temp directory for local-only artifacts ...
/temp/**
!/temp/README.md
!/temp/.gitkeep
```

只有 `temp/README.md`（与可能的 `.gitkeep`）被跟踪；其余内容全部 git-ignored。

`temp/local-artifacts/<stage>/` 建议作为各 stage 临时工件的子目录。

## 4. 脚本盘点摘要

| 类别 | 数量 |
|---|---:|
| `verify-*.ts` | 115 |
| `audit-*.ts` | 51 |
| `diagnose-*.ts` | 8 |
| `plan-*.ts` | 7 |
| `validate-*.ts` | 7 |
| `test-*.ts` | 47 |
| `trial-*.ts` | 3 |
| `evaluate-*.ts` | 1 |
| `seed-*` / `import-*.ts` | 5（write DB） |
| `confirm-*` / `abandon-*` / `rollback-*.ts` | 3（write DB） |
| `fix-*.ts` | 1（write DB） |
| `repair-*.ts` | 4（write DB，gated） |
| `backfill-*.ts` | 2（write DB，gated） |
| `cleanup-*.ts` | 1（write DB） |
| `implement-*.ts` | 1（write DB） |
| `export-*.ts` | 2 |
| `dry-run-*.ts` | 3（read-only） |
| 其它 (legacy / g0fix* / f2-* / temp-* / tmp-* / prepare-* / finalize-* / review-* / preview-* / inspect-*) | ~30 |

**`candidate_for_archive` 数量**：~50（详见 `docs/project-script-inventory-k35-a.md`）

**危险 / write-capable scripts**（共 8 个）：

```txt
backfill-default-semester.ts
backfill-worktime-default-config-k26-f.ts
cleanup-teaching-task-class-pollution.ts
fix-confirmed-import-metadata.ts            (gated: FIX_IMPORT_METADATA=1)
repair-composite-room-expressions-k34-a3.ts
repair-cross-cohort-data-k18-b.ts
repair-duplicate-room-names-k34-a2.ts
repair-hc6-existing-slot383-k26-k4a.ts
```

## 5. 依赖/框架版本盘点

| 包 / 配置 | 当前版本 |
|---|---|
| **next** | `16.2.6` |
| **react** | `19.2.4` |
| **react-dom** | `19.2.4` |
| **typescript** | `^5` |
| **prisma** / **@prisma/client** | `^5.22.0` |
| **eslint** | `^9` |
| **eslint-config-next** | `16.2.6` |
| **tailwindcss** | `^4` |
| **@types/node** | `^20` |
| **tsconfig target** | `ES2017` |
| **tsconfig module** | `esnext` |
| **tsconfig moduleResolution** | `bundler` |
| **lockfile** | `package-lock.json` (npm) |
| **eslint config** | `eslint.config.mjs`（flat config） |
| **prisma client provider** | `prisma-client-js` |
| **prisma db provider** | `sqlite` |

**本阶段没有升级任何依赖**。

**下一阶段建议（K35-B-DEPENDENCY-UPGRADE-PLAN-AND-SAFE-UPDATE）**：

- 在不跨大版本的前提下做 patch-level review（Next.js 16.2.x → 16.2.y；Prisma 5.22.x → 5.22.y；ESLint 9.x → 9.y）
- 对 ESLint flat config 与 Tailwind 4 配置做兼容性复查
- 不动 `prisma/schema.prisma` 与 `prisma/migrations/**`
- 不动 K22 expected / K22 fixture
- 升级前先在 `temp/` 下做 dry-run 备份，必要时回滚

## 6. 严格范围确认

```txt
是否改业务代码:               NO
是否改 schema/migration:      NO
是否改 DB:                   NO
是否改 package.json:         NO
是否改 package-lock.json:    NO
是否改 tsconfig.json:        NO
是否改 eslint config:        NO
是否改 K22 expected:         NO
是否改 K22 fixture:          NO
是否删除 tracked 脚本:       NO
是否移动 tracked 脚本:       NO
是否删除 tracked 文件:       NO
是否升级依赖版本:            NO
是否 force push:             NO
是否提交 prisma/dev.db:      NO
是否提交 DB backup:          NO
是否提交 K22 generatedAt drift: NO
是否提交 K28-B untracked:    NO
是否提交 temp/local-artifacts 内容: NO
```

预期均为 NO。✓

## 7. 验证结果

| 验证 | 结果 |
|---|---|
| `npx prisma validate` | PASS |
| `npx prisma migrate status` | 10 migrations, schema up to date |
| `npm run build` | PASS |
| `npm run lint` | 191 errors / 154 warnings（与 K34-A3D/E/F 一致；**未引入**新问题） |
| K34-A3F closeout verify | 25 / 25 ✓ |
| K22-C score harness | 73 / 0 / 0 / 0 / 0 ✓（最终 commit 前 restore generatedAt drift） |
| `npm run test:auth-foundation` | 60 / 62（pre-existing） |

## 8. GitHub 同步

- branch: master
- local HEAD before: 89b5807 (K34-A3F)
- 本阶段 commit: 待 push
- force push: NO
- ahead/behind: 0/0
- prisma/dev.db: 未提交
- DB backup: 未生成
- K22 generatedAt drift: 未提交（已 restore）
- K28-B untracked: 未提交（已移到 `temp/local-artifacts/k28-b/`，git-ignored）
- `temp/local-artifacts` 内容: 未提交（git-ignored）

## 9. 下一阶段建议

```txt
1. K35-B-DEPENDENCY-UPGRADE-PLAN-AND-SAFE-UPDATE
   - 依赖 patch-level 升级规划与安全升级
   - 不跨大版本
   - 升级前后跑 K22-C / K34-A3F / auth foundation / build / lint
   - DB 与 schema 不动

2. K35-C-SCRIPT-ARCHIVE-AND-NAMING-CONSOLIDATION
   - 移动 candidate_for_archive 标记的脚本到 scripts/_archive/<stage>/
   - 写 scripts/_archive/README.md
   - 跑当前 closeout chain 确认无回归
   - 不删除任何 tracked 文件
```

## 10. 结论

```txt
K35-A 可关闭                          ✓
项目整理第一阶段已完成                 ✓
K34-A3 multi-room 仍 READY_FOR_REAL_USE  ✓
K22-C 保持 73/0/0/0/0                 ✓
本阶段未改业务代码                     ✓
本阶段未改 schema/migration/DB         ✓
本阶段未改 package.json / lockfile     ✓
本阶段未引入新 lint error/warning      ✓
允许进入 K35-B                        ✓
遗留阻塞: 无
```
