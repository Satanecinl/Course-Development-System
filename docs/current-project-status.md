# Current Project Status

> **K35-A housekeeping 时确认**。最近 closeout：[K34-A3F](k34-a3f-multi-room-worktree-cleanup-and-acceptance-closeout.md)。
>
> 详细阶段 closeout 文档位于 `docs/`，按 `k<stage>-*.md` / `k<stage>-*.json` 命名。
> 本文件只汇总 readiness、baseline、known artifacts、下一步建议。

## Feature readiness

| Feature | Status | Notes |
|---|---|---|
| **Semester settings (K25-E / K26-A)** | READY | System settings center module |
| **Scheduler config settings (K26-B)** | READY | LAHC / iterations / randomSeed / lockedSlotIds |
| **WorkTime settings (K26-H)** | READY | Per-semester WorkTimeConfig + TimeSlotDefinition; K26-J solver/score integration closed |
| **Time-slot audit (K26-C)** | READY | impact analysis for time-slot/day changes |
| **HC6 campus/room rules (K26-K)** | READY | solver HC6-aware hard placement |
| **K26-K4C HC6 verify chain** | READY | solver-introduced HC6 prevented |
| **User/Role/Permission RBAC (H-series)** | READY | 12 permission keys; 3 roles |
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

## Verification baselines

| 类别 | 当前值 | 来源 | 备注 |
|---|---|---|---|
| **K22-C** | **73 / 0 / 0 / 0 / 0** | `npx tsx scripts/verify-score-regression-harness-k22-c.ts` | 每次 verify 重跑会更新 `docs/k22-score-*.json` 的 `generatedAt` 时间戳，无功能性 drift。closeout 阶段必须 restore 该 drift，不允许 commit。 |
| **K34-A3F closeout** | 25 / 25 | `npx tsx scripts/verify-multi-room-acceptance-closeout-k34-a3f.ts` | 验收 K34-A3 全链路 |
| **K34-A3E** | 36 / 36 | `npx tsx scripts/verify-secondary-room-runtime-filter-k34-a3e.ts` | runtime filter + capacity |
| **K34-A3 composite** | 42 / 42 | `npx tsx scripts/verify-composite-room-expression-k34-a3.ts` | 包含 K34-A2 / A3C / D 链接的 stage-aware check |
| **lint** | 191 errors / 154 warnings (345 total) | `npm run lint` | 历史 baseline，本阶段**未新增**问题；后续 stage 不得新增。K26-K4C 脚本里硬编码的 184/146 已漂移到当前实际 191/154，是历史 baseline 滞后，不在本阶段修复范围。 |
| **auth foundation** | 60 / 62 | `npm run test:auth-foundation` | pre-existing `ScheduleAdjustment ACTIVE count` mismatch（实际 16，期望 0） |
| **prisma migrate status** | 10 migrations, schema up to date | `npx prisma migrate status` | latest: `20260608000000_add_worktime_config` |
| **build** | PASS | `npm run build` | Next.js 16 production build |
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
89b5807 docs(schedule): close multi-room acceptance (K34-A3F)
dedb5f5 fix(schedule): include secondary rooms in dashboard room filter and classroom capacity stats
8ed7fcc fix(score): K34-A3D multi-room combined capacity correctly uses current placement
29332be fix(schedule): include secondary rooms in dashboard filters
3cbe80a fix(schedule): restore all-week dashboard display
```

## Next recommended work

按风险递增：

1. **K35-B-DEPENDENCY-UPGRADE-PLAN-AND-SAFE-UPDATE** — 依赖升级规划与安全升级。盘点 Next.js 16 / React 19 / Prisma 5 / ESLint 当前 patch 状态；规划可升级范围；执行 dry-run。
2. **K35-C-SCRIPT-ARCHIVE-AND-NAMING-CONSOLIDATION** — 脚本归档与命名整合。把 `candidate_for_archive` 标记的脚本移到 `scripts/_archive/`；补 README 索引；不删 tracked 文件。
3. **K26-I1 / I2 / I3 / I4** — K26-I audit 后的 recommendation integration（plan rec / dry-run-apply / room rec / frontend）。需要在 K26-J 之前完成。
4. **K36-** — 下一个新功能 stage（待规划）。

## 已关闭但需保持的 stage

- K26-A → K26-J 全部 CLOSED（K22-C 验证、J 接入都已 PASS）
- K34-A / A1 / A2 / A3 / A3B / A3C / A3D / A3E / A3F 全部 CLOSED
- K28 / K29 全部 CLOSED

每个 stage 的 closeout 文档仍位于 `docs/`，命名 `k<stage>-*.md` / `k<stage>-*.json`，按 stage 顺序排列。
