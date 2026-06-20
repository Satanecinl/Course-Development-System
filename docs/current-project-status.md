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
> **K37-B 校区教室规则可编辑版已完成**（[K37-B](k37-b-campus-room-rules-schema-and-editing.md)）。新增 `Room.isLinxiao` 字段 + migration + 5 间林校教室回填。PATCH API 实现林校标记维护。UI 升级为"基础可编辑版"，含标记/取消按钮。HC6 hard rule 不可关闭。K22-C 73/0/0/0 不变。需浏览器验收。
> **K37-B1 自动验证已通过**（[K37-B1](k37-b1-campus-room-rules-editing-manual-validation.md)）。Pre-test data state: 42 rooms, 5 linxiao (林校301/303/304/305/306). 8/35 auto PASS (K37-B 25/25, K37-A 25/25, K36-B1A5 19/19, K22-C 73/0/0/0, PII 0, build PASS). 27 项浏览器手动验收 pending.
> **K37-B2 runtime 修复已完成**（[K37-B2](k37-b2-campus-room-rules-editing-runtime-fix.md)）。Root cause: dev server Prisma Client 单例 stale（migration 之前加载）。DB state 始终正确（5/42, 0 mismatch）。修复：GET/PATCH route explicit select + fallback + 安全错误处理 + Prisma helper restart note。Verify 17/17 PASS。**用户必须重启 dev server**（Ctrl+C + npm run dev）使修复生效。
> **K37-C 学期感知 scoping 已修复**（[K37-C](k37-c-campus-room-rules-semester-scoping-fix.md)）。HC5/HC6 不再 hardcode semesterId=1。使用 `resolveSchedulerSemester` (query > active > error)。`?semesterId` query param 支持。UI 显示"当前诊断学期"banner。Room.isLinxiao 仍为全局属性。Verify 23/23 PASS + K37-B2/B/K37-A/K36-B1A5/K22-C 全部绿。
> **K38-A 调课规则诊断增强版已完成...K38-B 计划 UI 持久化）。Verify 22/22 PASS。
> **K38-B 调课规则推荐数量配置已完成**（[K38-B](k38-b-adjustment-rules-config-limit.md)）。新增 AdjustmentRuleConfig 表 + migration + backfill。API PATCH defaultRecommendationLimit（1-20）。Recommendation 使用 config 作为默认 limit（request > config > code fallback）。Verify 23/23 PASS。K22-C 73/0/0/0 不变。
> **K38-B1 调课规则推荐数量 UI 编辑闭环已完成**（[K38-B1](k38-b1-adjustment-rules-limit-ui-editing-fix.md)）。Panel badge → 基础可配置版。新增 number input / 保存 / 取消 / loading / toast / dirty indicator。Client PATCH helper 已补齐。Verify 21/21 PASS。
> **K39-A 导入规则设置诊断增强已完成**（[K39-A](k39-a-import-rules-settings-diagnostics.md)）。Badge → 诊断增强版。API 增加 moduleVersion/enhancedSummary/sourceEvidence/crossCohortGuard/importLifecycleRules/duplicateImportPolicy/editability/ruleGroups（backward-compatible）。UI 升级：8 summary cards + source evidence 覆盖率进度条 + cross-cohort guard 卡片 + 6 阶段生命周期 + 6 组 14 条规则。所有规则 hard-locked。Verify 26/26 PASS。K22-C 73/0/0/0 不变。
> **K39-B 导入规则默认学期配置计划已完成**（[K39-B](k39-b-import-rules-default-semester-config-plan.md)）。只读审查：parse API 无 semesterId 参数（始终 active semester），confirm API 支持 ?semesterId 覆盖，rollback/abandon 使用 active semester。推荐 K39-B1 实现 requireExplicitSemesterForImport（boolean 配置）。Audit 17/17 PASS。
> **K39-B1 导入学期确认配置已实现**（[K39-B1](k39-b1-import-rules-explicit-semester-config.md)）。ImportRuleConfig schema + migration + backfill。GET/PATCH API。Settings panel badge → 基础可配置版，toggle with save/cancel。Upload dialog semester banner + checkbox。Default false。Verify 26/26 PASS。K22-C 73/0/0/0 不变。
> **K39-B1A 运行时 500 修复**（[K39-B1A](k39-b1a-import-rules-runtime-500-fix.md)）。Root cause: dev server stale Prisma Client。修复: config helper defensive try/catch + fallback。DB backup: dev.db.backup-before-k39-b1a-20260619-185409 (gitignored)。Migration evidence 补齐。**用户必须重启 dev server**。
> **K39-C Source Evidence 回填方案已完成**（[K39-C](k39-c-source-evidence-backfill-plan.md)）。只读审查：446 条 TeachingTaskClass link 全部缺失 source evidence（0% 覆盖率）。importBatchId 可通过 TeachingTask.join 安全回填。artifact-based 回填需复跑匹配逻辑。推荐 K39-C1 dry-run candidate generator（不写 DB）。
> **K39-C1 Source Evidence 回填候选已生成**（[K39-C1](k39-c1-source-evidence-backfill-dry-run-candidates.md)）。Dry-run only：446/446 safe importBatchId candidates，192/446 conditional record candidates，254/446 blocked。matchStrategy/matchConfidence DO_NOT_BACKFILL。输出脱敏 JSON。Verify 24/24 PASS。
> **K39-C2 Source Evidence 安全字段回填已完成**（[K39-C2](k39-c2-source-evidence-safe-fields-backfill.md)）。446 TeachingTaskClass links: importBatchId 0→446, sourceArtifactFilename 0→446。conditional/unsafe fields unchanged。Business data unchanged (ImportBatch=38, TeachingTask=308, ScheduleSlot=440, ScheduleAdjustment=67)。DB backup: dev.db.backup-before-k39-c2-20260619-193254。Verify 30/30 PASS。
> **K39-C3 Conditional Source Evidence 人工审核方案已完成**（[K39-C3](k39-c3-source-evidence-conditional-review-plan.md)）。192/446 unique candidates 可供人工审核，254/446 MULTIPLE_CANDIDATES blocked。推荐 K39-C4 生成 gitignored 审核包。matchStrategy/matchConfidence 继续禁止。Audit 22/22 PASS。
> **K39-C4 人工审核包已生成**（[K39-C4](k39-c4-source-evidence-manual-review-package.md)）。192 records in `temp/local-artifacts/k39-c4/source-evidence-manual-review-package.json` (gitignored, SHA256 4b1c7a3c...). All decisions pending. Committed summary only contains aggregate. Verify 31/31 PASS。
> **K39-C5 条件字段 apply 已 BLOCKED**（[K39-C5](k39-c5-approved-source-evidence-conditional-apply.md)）。Review package 192/192 仍为 pending, 0 approved。按规则不写 DB, 不创建 apply 脚本, 不创建 DB backup。等待人工审核。
> **L1 Excel 课程设置导入审计已完成**（[L1](l1-xlsx-course-setting-import-audit.md)）。只读审查 + parser 方案设计：9 个 sheet / 1854 行 / 1116 course row / 3080 merged cells。Class count 859 行需 newline/space split，teacher 92 行 multi-scope。Word parser 保持 legacy。L2 推荐做 parser prototype only（不写 DB，不接 UI）。Audit 25/25 PASS。K22-C 73/0/0/0 不变；K39 全套仍 PASS。
> **L2 Excel 课程设置 parser prototype 已完成**（[L2](l2-xlsx-course-setting-parser-prototype.md)）。新增 `src/lib/import/course-setting-xlsx-parser.ts`（1051 行，纯函数），导出 `parseCourseSettingXlsx` + `parseCourseSettingXlsxFile`；支持 Buffer/Uint8Array 输入；merged cell 扩展 / A-B 列继承 / 8 关键词 header detection / 6 种 row 分类（互斥）/ class/teacher/exam/weekly hours/remark/mergeRemark 解析 + confidence + warnings / source evidence draft (9 字段 hash 化) / `includeRawValues` 默认 false。Verify 30/30 PASS。K22-C 73/0/0/0 不变；K39 全套仍 PASS。不写 DB / 不接 UI / 不改 confirm；不修改旧 Word import。
> **L3 Excel 课程设置 preview-only API/UI 已完成**（[L3](l3-xlsx-course-setting-preview-api-and-ui.md)）。新增 preview-only API route（`/api/admin/import/course-setting-xlsx/preview`）+ preview UI component（`CourseSettingXlsxPreview`）+ client helper；管理员可上传 .xlsx 并查看脱敏解析摘要、warning/manual-review rows；不写 DB、不创建 ImportBatch、不开放 confirm/apply，旧 Word import 保持 legacy。Verify 40/40 PASS。浏览器人工验收 pending。
> **L4 Excel 课程设置 TeachingTask dry-run mapping 已完成**（[L4](l4-xlsx-course-setting-teaching-task-dry-run-mapping.md)）。新增 `src/lib/import/course-setting-teaching-task-dry-run.ts`（纯函数 + 类型导出 `mapParsedCourseSettingRowsToTeachingTaskCandidates` / `buildCourseSettingTeachingTaskDryRun` / `normalizeForMatch`），将 L2 parsed rows 映射为 Course / Teacher / ClassGroup / TeachingTask / TeachingTaskClass 候选 + 18 种 diagnostic code + source evidence forward-fill draft。只读 DB（findMany / count），不写业务表，不创建 ImportBatch。Verify 54/54 PASS；L3/L2/L1/K39-B1/B1A/C2/C4/K22-C 全部回归 PASS；scan:docs-pii / build / tsc / eslint 全 PASS。134 classCount.other + 62 teacherAssignment.other + 19 weeklyHours.nonNumeric 全部产生 diagnostic，1099/1116 course rows 标记 needsManualReview（xlsx 2025秋 vs DB 春季跨学期）。仍不接 confirm/apply；L5 设计 safe confirm flow。
> **L5 Excel 课程设置 review package 与 safe confirm plan 已完成**（[L5](l5-xlsx-course-setting-review-package-and-safe-confirm-plan.md)）。基于 L4 dry-run 生成脱敏 review package（所有 decision=pending，auto-safe=0）+ safe confirm plan（target semester A/B/C 策略 + required gates + atomic transaction + rollback + source evidence forward-fill）；不写 DB、不创建 ImportBatch、不接 apply。Local redacted package 写入 `temp/local-artifacts/l5/`（gitignored）。Verify 62/62 PASS；L4/L3/L2/L1/K39-B1/B1A/C2/C4/K22-C 回归 PASS；scan:docs-pii / build / tsc / eslint 全 PASS。L6 必须仍 review/approval-only，禁止 DB apply。
> **L6-0 Excel 课程设置目标学期与完整审核包准备完成**（[L6-0](l6-0-xlsx-course-setting-target-semester-and-full-review-package.md)）。只读分析目标 Semester 候选（无创建/激活），生成完整 redacted review package（1116 items, 全部 decision=pending, auto-safe=0），明确 targetSemesterConfirmed=false, 7 gates 全 false；不写 DB、不创建 ImportBatch、不接 apply。Local full package 写入 `temp/local-artifacts/l6-0/`（gitignored）。Verify 70+/70+ PASS；L5/L4/L3/L2/L1/K39-B1/B1A/C2/C4/K22-C 回归 PASS。下一阶段仍 review/approval-only。
> **L6-A Excel 课程设置目标学期选择/新建方案设计完成**（[L6-A](l6-a-xlsx-course-setting-target-semester-selection-and-creation-design.md)）。明确导入 targetSemesterId 与全局 active semester 解耦，设计选择已有学期或新建学期的 contract/API/UI/后续阶段（L6-B 至 L6-F）。本阶段只读审查 + 设计文档，不写 DB，不创建 Semester，不导入业务数据。Audit 50/50 PASS。
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
| **Import rules settings (K39-A)** | READY | 诊断增强版: source evidence 覆盖率 + cross-cohort guard + lifecycle rules + grouped rules |
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
