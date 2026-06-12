# 高校排课系统 (College Course Scheduling System)

工程应用技术学院排课系统。Next.js 16 + Prisma + SQLite，支持 Word 课表解析、冲突检测、拖拽排课、Multi-room 复合教室、调课审批流、多学期自动排课、WorkTime 引擎接入、K22 score 回归体系。

> **当前主要功能状态**（K35-A housekeeping 后汇总；K36-A3 仅对齐文档，未重跑验证命令）：
>
> - ✅ 系统设置九模块基础版已验收
> - ✅ WorkTime 设置 UI 已完成，recommendation / adjustment / solver / score / apply / rollback 已接入主流程，**READY_FOR_REAL_USE**
> - ✅ K26-K HC6 闭环已完成
> - ✅ K28 用户调课申请审批流 **READY_FOR_REAL_USE**
> - ✅ K29 多学期自动排课入口 **READY_FOR_REAL_USE**
> - ✅ K34 导入管理基础页 **READY_FOR_REAL_USE**
> - ✅ K34-A3 multi-room / secondary room support **READY_FOR_REAL_USE**
> - ✅ K35-A repository housekeeping 已完成
> - ℹ️ K22-C score 历史 baseline 为 **73 / 0 / 0 / 0 / 0**
> - ⚠ auth foundation 历史记录为 **60 / 62**（pre-existing ScheduleAdjustment ACTIVE count）
> - ⚠ lint 历史 baseline 为 **191 errors / 154 warnings**；K36-A 系列未重跑，以后续实际验证为准

详细状态与最近一次整合请看：

- [docs/current-project-status.md](docs/current-project-status.md) — 当前项目状态
- [docs/k34-a3f-multi-room-worktree-cleanup-and-acceptance-closeout.md](docs/k34-a3f-multi-room-worktree-cleanup-and-acceptance-closeout.md) — 最近一次 closeout
- [docs/k35-a-project-housekeeping-readme-temp-and-script-inventory.md](docs/k35-a-project-housekeeping-readme-temp-and-script-inventory.md) — 本次 housekeeping

## 快速开始

```bash
# 安装依赖
npm install

# 启动开发服务器
npm run dev
# 访问 http://localhost:3000

# 构建
npm run build
```

## 技术栈

- **前端**: Next.js 16 (App Router), React 19, Zustand, @dnd-kit, Tailwind CSS, base-ui
- **后端**: Next.js API Routes, Prisma ORM, SQLite
- **Auth**: 自建 RBAC（User / Role / Permission / UserRole / RolePermission / Session）
- **解析**: Python (python-docx)
- **排课**: 自定义 LAHC 约束求解器；多约束 HC1–HC6 / SC1–SC10；K22-C 回归

## 数据流程

```txt
Word .docx ──[Python 解析]──> JSON ──[Import API]──> SQLite (prisma/dev.db)
                                                    │
                       Next.js App Router ─────────┘
                       /api/schedule / /api/conflict-check / /api/schedule-adjustments/*
                       /api/admin/worktime-configs/* / /api/admin/import/*
                       /dashboard / /admin/db / /admin/settings
```

### 解析

```bash
python scripts/parse_schedule.py "../2026年春季学期课程表(0420).docx" -o output.json -v
```

### 导入（通过 Web UI）

1. 访问 `/admin/db`
2. 点击"导入课表"，上传 .docx 文件
3. 查看解析质量报告
4. 确认导入（需输入 `CONFIRM_IMPORT`）

### 导入（CLI，受控）

```bash
npm run test:confirm-import-dry-run     # 先做 dry-run
npm run test:confirm-import-rollback    # 验证事务回滚
CONFIRM_IMPORT=1 npm run confirm:import # 真实导入（写 DB）
npm run audit:confirmed-import          # 导入后审计
```

## 常用命令

| 类别 | 命令 |
|---|---|
| 启动 | `npm run dev` / `npm run build` / `npm run start` |
| Lint | `npm run lint` |
| Prisma | `npx prisma validate` / `npx prisma migrate status` / `npx prisma migrate deploy` / `npx prisma generate` |
| 解析 | `python scripts/parse_schedule.py <input.docx> -o output.json -v` |
| 解析单测 | `python test_parse.py` |
| Import pipeline | `npm run test:import-quality` / `npm run test:confirm-import-dry-run` / `npm run test:confirm-import-rollback` / `npm run test:confirm-api-guards` |
| Scheduler | `npm run test:capacity` / `npm run test:diagnostics` / `npm run test:solver` / `npm run test:schedule-adjustment` / `npm run test:schedule-adjustment-api-e2e` |
| Auth | `npm run test:auth-foundation` |
| K22 score | `npx tsx scripts/verify-score-regression-harness-k22-c.ts` |
| K34 multi-room | `npx tsx scripts/verify-multi-room-acceptance-closeout-k34-a3f.ts` |

完整脚本盘点请看 [scripts/README.md](scripts/README.md) 与 [docs/project-script-inventory-k35-a.md](docs/project-script-inventory-k35-a.md)。

## 数据库

- **本地数据库**：`prisma/dev.db`（SQLite，**禁止提交**）
- **Schema**：`prisma/schema.prisma`（10 个 migrations；最新：`20260611000000_add_schedule_slot_additional_rooms`）
- **Backup 规则**：DESTRUCTIVE 操作前生成 `prisma/dev.db.backup-before-<stage>-<timestamp>`；**禁止提交 backup**
- **Backup 状态**（K35-A 盘点时）：ignore 区域内已有 `prisma/dev.db.backup-before-conflict-adjustment-manual-acceptance-20260601101600` 等历史 backup；保留不动

## 文档入口

| 入口 | 内容 |
|---|---|
| [docs/current-project-status.md](docs/current-project-status.md) | 当前项目状态（功能 readiness + 验证 baseline + 已知工件 + 下一阶段建议） |
| [CLAUDE.md](CLAUDE.md) | Claude Code 项目指令（架构、阶段、命令、注意点） |
| [scripts/README.md](scripts/README.md) | scripts 目录约定与命名规范 |
| [docs/project-script-inventory-k35-a.md](docs/project-script-inventory-k35-a.md) | scripts 目录脚本盘点 |
| [docs/k34-a3f-multi-room-worktree-cleanup-and-acceptance-closeout.md](docs/k34-a3f-multi-room-worktree-cleanup-and-acceptance-closeout.md) | 最近一次 closeout（K34-A3F） |
| [docs/k35-a-project-housekeeping-readme-temp-and-script-inventory.md](docs/k35-a-project-housekeeping-readme-temp-and-script-inventory.md) | 本次 housekeeping 整理 |
| `docs/import-workflow.md` | 导入流水线 |
| `docs/k22-score-regression-harness-implementation.md` | K22 score 回归基线 |

## 重要安全规则

**禁止**：

- ❌ 提交 `prisma/dev.db`
- ❌ 提交任何 `prisma/dev.db.backup-*`
- ❌ 随意更新 K22 expected / fixture
- ❌ `git push --force`
- ❌ `npx prisma migrate reset`
- ❌ `npx prisma db push --force-reset`
- ❌ `npm update` / `npm audit fix` / `npm install <pkg>@latest`（未经 K35-B 之前不动依赖）
- ❌ 批量格式化 / 批量重命名源码
- ❌ 删除 tracked 脚本（不活跃脚本请打 `candidate_for_archive` 标记，等后续 stage 走归档流程）
- ❌ 移动 tracked 脚本（stage closeout 阶段除外）
- ❌ 修改 `prisma/schema.prisma` 与 `prisma/migrations/**`（除非本阶段明确任务）
- ❌ 修改 `package.json` / `package-lock.json` / `pnpm-lock.yaml` / `yarn.lock`

**应当**：

- ✅ 用 `temp/`（git-ignored）放本地临时文件、人工试跑产物、未纳入 git 的草稿
- ✅ 工件要保留证据时，**转为** `docs/` 下的正式 md/json
- ✅ DESTRUCTIVE 操作前先 backup，backup 文件名加时间戳

## temp 目录

`temp/` 目录由 K35-A 引入，由 `.gitignore` 规则 `/temp/**` 覆盖（仅 `temp/README.md` 跟踪）。详见 [temp/README.md](temp/README.md)。

当前 temp 下的已知子目录：

- `temp/local-artifacts/k28-b/` — K28-B 手动试跑产物（从 repo root 与 `scripts/`、`docs/` 移入）

## 当前开发建议

- **K34-A3 multi-room 链路已 READY_FOR_REAL_USE**，可放心使用 secondary room 筛选与显示。
- **K35-A housekeeping 已完成**；K36-A 系列正在进行发布基线与文档对齐，本地阶段状态不代表远端已同步。
- **K28 / K29 / K34 入口**功能可用；继续做新功能前，先在 [docs/current-project-status.md](docs/current-project-status.md) 顶部确认最近 closeout。
- **依赖升级**是独立 stage（推荐名：`K35-B-DEPENDENCY-UPGRADE-PLAN-AND-SAFE-UPDATE`），当前不升级。
- **脚本归档**是独立 stage（推荐名：`K35-C-SCRIPT-ARCHIVE-AND-NAMING-CONSOLIDATION`），当前只盘点不归档。
