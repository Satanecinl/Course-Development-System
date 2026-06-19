# Current Project Status

> **K35-A housekeeping 已完成**。最近功能 closeout：[K34-A3F](k34-a3f-multi-room-worktree-cleanup-and-acceptance-closeout.md)。
> K36-A2 已完成本地 repository hygiene commit；本文不声明该 commit 已同步到远端。
> K36-A3 只做状态文档对齐，未重跑 build、lint、auth、score 或 verify 命令。
> **K36-B1A multi-room / secondary room 主线 final closeout 已完成**（[K36-B1A7](k36-b1a7-multi-room-final-closeout.md)）。K22-C 恢复 73/0/0/0；K36-B1A6B 修复 I11 HC5 delta regression 已 push。
> **K36-B2 WorkTime B-03 score contract 标签已 explicit close**（[K36-B2](k36-b2-worktime-b03-explicit-close.md)）。K26-J 在 52f200d 处已 CLOSED workTimeSolverScoreIntegration；B-03 仅是 K36-B1A 系列的 meta-label。
> **K36-A5G release packaging guard 已建立**（[K36-A5G](k36-a5g-release-packaging-guard.md)）。Guard 脚本 + verify 脚本已可用，`npm run guard:release -- --self-test` 17/17 PASS。注意：guard 仅保护未来 package，不等于 Git history 脱敏；公开仓库仍需 history rewrite 或 fresh repo 决策。
> **K36-A5H Git history sanitization & delivery decision 已完成**（[K36-A5H](k36-a5h-git-history-sanitization-and-delivery-decision.md)）。结论：public=No-Go, external delivery=No-Go, private-only=Go。推荐外部交付用 Route B（fresh clean export），公开 repo 用 Route C（filter-repo）。
> **K36-A5I clean export package plan 已完成**（[K36-A5I](k36-a5i-clean-export-package-plan.md)）。11 步可执行流程：rsync from HEAD → allowlist filter → env.example → guard verify → PII scan → build → zip → manifest verify → sha256。~947 files, 1 tracked xlsx excluded.
> **K36-A5J clean export 已执行**（[K36-A5J](k36-a5j-clean-export-execution.md)）。Archive: `temp/clean-export/k36-a5j/package/courscheduling-system-v1.0.0-clean.tar.gz`（2.4MB, 951 files）。Guard PASS（0 blocking, 12 false-positive warnings documented）。Package deliverable for external review。当前 repo 仍 private-only，history 未清理。
> **K36-A5J1 strict warning clearance 已完成**（[K36-A5J1](k36-a5j1-clean-export-strict-warning-clearance.md)）。Guard 新增 `--allowlist` 参数支持受控 suppression。Staging + archive manifest strict guard 均 PASS（0 blocking, 12 allowed, 0 unresolved）。Package 现可正式外部交付。
> **K36-A5K fresh repo init plan 已完成**（[K36-A5K](k36-a5k-fresh-repo-init-plan.md)）。10 步初始化流程：SHA256 verify → extract → safety checks → guard strict → PII scan → git init → create GitHub → push → configure → verify clone。15 项发布前 checklist（11 blocking + 4 recommended）。Fresh repo 可从 clean export 包安全创建，当前 private repo 仍不公开。
> **K36-A5L fresh repo 已初始化并 push**（[K36-A5L](k36-a5l-fresh-repo-init-execution.md)）。Public repo: https://github.com/Satanecinl/Academic-Affairs-System 。Single commit `ff56036`（951 files）。Guard strict PASS。Build PASS。Old private repo 保持 private-only，history 未清理。
> **K37-A 校区教室规则诊断增强版已完成**（[K37-A](k37-a-campus-room-rules-settings-editable-basic.md)）。Route B（不可编辑）：Room schema 无 campus/isLinxiao 字段，building 全为 null。UI 增强：全部教室表格+筛选搜索、HC5/HC6 违规明细（含 dayOfWeek/slotIndex/primary-secondary source）、汽车专业关键词和分类说明、识别方式说明。K37-B 可实现持久编辑（需 migration）。
> **K37-A1 自动验证已通过**（[K37-A1](k37-a1-campus-room-rules-diagnostic-manual-validation.md)）。19/37 auto PASS（K37-A 24/24, K36-B1A5 19/19, K22-C 73/0/0/0, PII 0, build PASS）。18 项浏览器人工验收 pending（用户需启动 dev server + ADMIN 登录确认）。
>
> 详细阶段 closeout 文档位于 `docs/`，按 `k<stage>-*.md` / `k<stage>-*.json` 命名。
> 本文件只汇总 readiness、baseline、known artifacts、下一步建议。

## Feature readiness

| Feature | Status | Notes |
|---|---|---|
| **Semester settings (K25-E / K26-A)** | READY | System settings center module |
| **Scheduler config settings (K26-B)** | READY | LAHC / iterations / randomSeed / lockedSlotIds |
| **WorkTime settings and integration (K26-H / I / J / K)** | READY_FOR_REAL_USE | Settings UI completed in K26-H; recommendation / adjustment / solver / score / apply / rollback integrated into the main flow |
| **Time-slot audit (K26-C)** | READY | impact analysis for time-slot/day changes |
| **HC6 campus/room rules (K26-K)** | READY | solver HC6-aware hard placement |
| **K26-K4C HC6 verify chain** | READY | solver-introduced HC6 prevented |
| **User/Role/Permission RBAC (H-series)** | READY | 15 permission keys; 3 roles |
| **Adjustment rules + dry-run/apply/plan (K23 / K24 / K31)** | READY | schedule-adjustment API + UI |
| **Import pipeline (K34-A)** | READY | parse → quality → confirm → rollback → abandon |
| **Import management page (K34-A)** | READY_FOR_REAL_USE | `/admin/db` 入口 + 详情渲染修复 |
| **Room name normalization (K34-A2)** | READY_FOR_REAL_USE | composite `或` 解析后 primary+additional 拆分 |
| **Multi-room support (K34-A3)** | **READY_FOR_REAL_USE** | primary OR additional room display/filter/capacity; composite 已通过 K34-A3E 浏览器人工验收 |
| **K28 USER→ADMIN adjustment approval** | READY_FOR_REAL_USE | USER request → ADMIN apply |
| **K29 multi-semester scheduler entry** | READY_FOR_REAL_USE | multi-semester LAHC |
| **K22-C score regression harness** | READY | 73 / 0 / 0 / 0 / 0 baseline locked |
| **Export (Excel / adjustment application form)** | READY | secondary room filter support in both raw + effective branches |
| **Audit log** | READY | import / confirm / rollback / abandon all audited |
| **Data maintenance** | READY | `/admin/db` CRUD |

## Historical verification records

> These values were recorded by K35-A or earlier stages. K36-A/A1/A2/A3 did not rerun these commands, so they are not current release-gate results.

| 类别 | 当前值 | 来源 | 备注 |
|---|---|---|---|
| **K22-C** | **73 / 0 / 0 / 0 / 0** | `npx tsx scripts/verify-score-regression-harness-k22-c.ts` | Historical result. The verify script updates `docs/k22-score-*.json` timestamps; inspect side effects before rerunning. |
| **K34-A3F closeout** | 25 / 25 | `npx tsx scripts/verify-multi-room-acceptance-closeout-k34-a3f.ts` | 验收 K34-A3 全链路 |
| **K34-A3E** | 36 / 36 | `npx tsx scripts/verify-secondary-room-runtime-filter-k34-a3e.ts` | runtime filter + capacity |
| **K34-A3 composite** | 42 / 42 | `npx tsx scripts/verify-composite-room-expression-k34-a3.ts` | 包含 K34-A2 / A3C / D 链接的 stage-aware check |
| **lint** | 191 errors / 154 warnings (345 total) | `npm run lint` | Historical baseline, not rerun by K36-A series. K26-K4C still contains older hard-coded values. |
| **auth foundation** | 60 / 62 | `npm run test:auth-foundation` | Historical result; pre-existing `ScheduleAdjustment ACTIVE count` mismatch（实际 16，期望 0） |
| **prisma migrate status** | Historical: 10 migrations, schema up to date | `npx prisma migrate status` | Not rerun by K36-A series. Current latest migration directory: `20260611000000_add_schedule_slot_additional_rooms`. |
| **build** | Historical PASS | `npm run build` | Next.js 16 production build; not rerun by K36-A series |
| **K26-K4C solver HC6** | 32 / 36 | `npx tsx scripts/verify-solver-hc6-aware-k26-k4c.ts` | 4 fails = 硬编码 lint 184/146 + auth 53/1 vs 实际 191/154 + 60/62；K22-C / schema / score weights / HC6 / K22 expected 全 PASS |

## Known local artifacts

### temp/local-artifacts/

K35-A 引入，由 `.gitignore` `/temp/**` 覆盖（仅 `temp/README.md` 跟踪）。

```txt
temp/
  README.md                              ← 跟踪
  local-artifacts/
    k28-b/
      k28-b-manual-trial-result.json   ← git-ignored（K28-B 人工试跑）
      k28-b-run-manual-trial.ts        ← git-ignored
      项目汇报材料.md                   ← git-ignored（UTF-8 草稿）
```

详见 [temp/README.md](../temp/README.md)。

### DB backups policy

- 命名规则：`prisma/dev.db.backup-before-<stage>-<timestamp>`
- 由 `.gitignore` 规则 `prisma/dev.db.backup-*` 覆盖，**禁止提交**
- 当前 ignore 区有历史 backup（最新：`prisma/dev.db.backup-before-conflict-adjustment-manual-acceptance-20260601101600`）—— 保留不动，本阶段不处理

## Recent commits (top 5)

```txt
f5b8a7e chore(repo): ignore local tool config and backups
24059c0 docs(project): organize housekeeping (K35-A: README, temp/, scripts inventory)
89b5807 docs(schedule): close multi-room acceptance (K34-A3F)
dedb5f5 fix(schedule): include secondary rooms in dashboard room filter and classroom capacity stats
8ed7fcc fix(score): K34-A3D multi-room combined capacity correctly uses current placement
```

The list reflects local history at the time of K36-A3 and does not assert remote synchronization.

## Next recommended work

按风险递增：

1. **K36-A4-SCRIPT-SAFETY-DOCUMENTATION-ALIGNMENT** — 对齐脚本命名与真实副作用说明。
2. **K36-A5-TRACKED-ARTIFACT-SENSITIVITY-REVIEW** — 审查 tracked 课表、教师名单、备份和历史输出的敏感性。
3. **K35-B-DEPENDENCY-UPGRADE-PLAN-AND-SAFE-UPDATE** — 独立规划依赖升级，不与发布卫生清理混合。
4. **K35-C-SCRIPT-ARCHIVE-AND-NAMING-CONSOLIDATION** — 在敏感性审查后归档已关闭阶段脚本。

## 已关闭但需保持的 stage

- K26-A → K26-J 全部 CLOSED（K22-C 验证、J 接入都已 PASS）
- K34-A / A1 / A2 / A3 / A3B / A3C / A3D / A3E / A3F 全部 CLOSED
- K28 / K29 全部 CLOSED

每个 stage 的 closeout 文档仍位于 `docs/`，命名 `k<stage>-*.md` / `k<stage>-*.json`，按 stage 顺序排列。
