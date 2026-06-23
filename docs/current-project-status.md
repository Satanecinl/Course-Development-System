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
> **L6-B Excel 课程设置目标学期 preview 集成 code complete**（[L6-B](l6-b-xlsx-course-setting-target-semester-preview-integration.md)）。`/admin/import` Excel preview 支持选择已有目标学期；preview API 接收 `targetSemesterId` 并按目标学期加载 dry-run existingData；UI 显示"该选择只影响本次导入，不会切换系统当前学期"；不写 DB、不创建 ImportBatch、不切换 active semester、不实现新建学期。Verify 69/69 PASS。**浏览器人工验收 PENDING**。
> **L6-B1 Excel 课程设置 raw preview display code complete**（[L6-B1](l6-b1-xlsx-course-setting-raw-preview-display.md)）。授权管理员在 `/admin/import` preview 表格可看到课程名/教师/班级/备注/合班备注/sheet/行号等 Excel 原文用于人工核对；仍 preview-only，不写 DB、不创建 ImportBatch、不切换 active semester；committed docs/json 仍脱敏。Verify 82/82 PASS。**浏览器人工验收 PENDING**。
>
> **L6-C Excel 课程设置导入流程新建学期已完成**（[L6-C](l6-c-xlsx-course-setting-create-new-semester-from-import-flow.md)）。`/admin/import` 支持在 preview 区创建新 Semester 并自动选为 targetSemesterId；仅允许 Semester 写入，不创建 ImportBatch/TeachingTask/TeachingTaskClass，不切换 active semester，验证中通过 backup/restore 保持最终 DB 状态。Verify 86/86 PASS。**浏览器人工验收 PENDING**。
>
> **L6-D Excel 课程设置 target semester approval package 已完成**（[L6-D](l6-d-xlsx-course-setting-approval-package-with-target-semester.md)）：基于明确 targetSemesterId 生成 full redacted approval package（1116 items, 全部 decision=pending, auto-safe=42/blocked=1069/needs-review=5，approvalOnly/dryRunOnly/dbWritten/applyAllowed 全 false），targetSemesterBound=true；不写 DB、不创建 ImportBatch/TeachingTask/TeachingTaskClass，不切换 active semester；本地 artifact 写入 `temp/local-artifacts/l6-d/`（gitignored）；committed docs/json 脱敏，仅含 idHash/nameHash/codeHash 和 counts。
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

> **L6-D1 Excel 课程设置 approval review workflow 已完成**：基于 L6-D target-semester-bound approval package 生成初始 decision package，1116 items 全部 pending；不写 DB、不创建 ImportBatch/TeachingTask/TeachingTaskClass，不生成 apply list。

- L6-D2 Excel 课程设置 approval review UI 已完成：管理员可在 /admin/import 生成审核视图，查看 raw 原文并在前端标记 pending/approved/rejected/needsReview，可导出 redacted decision JSON；不写 DB、不创建 ImportBatch/TeachingTask/TeachingTaskClass，不生成 apply list。

- L6-D2A Excel 课程设置 approval review UI 本地化已完成：新增纯函数 helper (course-setting-approval-review-localization.ts) 提供 Chinese display labels；UI 组件 (course-setting-xlsx-preview.tsx) 接入 helper。Machine values (option value / state / exported JSON) 保持 English，不写 DB、不修改 API/UI 契约。

- L6-E1 Excel 课程设置人工处理 UI 已完成：审核视图支持页面内处理缺课程/教师/班级/周课时/考试类型/歧义项，支持忽略行和导出 redacted resolution draft；仍不写 DB、不创建 ImportBatch/TeachingTask/TeachingTaskClass，不生成 apply list。

- L6-E1A 教职工参考库只读审计完成：对课程设置 Excel 教师原文、当前 Teacher 表和用户提供的教职工参考库做只读匹配统计，输出脱敏 aggregate 报告；未写 DB，未创建 Teacher/ImportBatch/TeachingTask。

- L6-E1B Teacher 受控同步计划已完成：基于课程设置 Excel、当前 Teacher 表和教职工 Staff DB 生成 dry-run 同步候选统计与本地未脱敏 raw 明细；未写 DB、未创建 Teacher/ImportBatch/TeachingTask，committed docs/json 仅含 aggregate。

- L6-E1C Teacher 受控同步执行完成：扩展 Teacher schema 增加工号、部门、职务、职级、手机、办公电话字段；基于教职工 Staff DB 受控创建 safe Teacher 候选并补写已存在 Teacher 的 Staff 字段；未创建 ImportBatch/TeachingTask/TeachingTaskClass，raw apply 明细仅保存在 gitignored local artifact。

- L6-E2 Excel 课程设置部分导入计划已完成：基于页面内 manual resolution state 生成 dry-run partial import plan，展示可导入/跳过/仍需处理/候选/重复风险/阻塞项；不写 DB、不创建 ImportBatch/TeachingTask/TeachingTaskClass，不执行 apply。

- L6-E2A 修复 Excel 课程设置人工处理交互：忽略行、允许暂缺、选择已有课程/教师/班级等控件现在会更新 manual resolution state，并用于生成部分导入计划；不写 DB、不创建 ImportBatch/TeachingTask。

- L6-E2B 修复 Excel 课程设置人工处理上下文与多问题行：同一行多个 diagnostics 会同时显示对应处理控件，处理区补齐工作表/行号/专业/课程/教师/班级/备注等上下文，partial import plan 也携带专业上下文；不写 DB、不执行 apply。

- L6-E2C 修复 Excel 课程设置审核主表上下文并新增任务拆分识别：审核主表不展开即可看到专业/课程/教师/班级/备注摘要，系统可识别同课多班多教师授课模式并生成拆分候选，确认后进入 partial import plan；不写 DB、不执行 apply。

- L6-E2D 修复 Excel 课程设置拆分候选明细与折叠上下文：手动处理区不展开即可看到专业/工作表/行号/课程/教师/班级/课时/考试/备注摘要，教学任务拆分区展示具体 candidate 与教师-班级 assignment，确认拆分绑定 candidateId；不写 DB、不执行 apply。

- L6-E2E 修复 Excel 课程设置真实教学任务拆分解析：支持教师字段中“姓名(班级编号)”模式并映射到真实班级，不再生成教师A/班级1占位候选；确认拆分后 partial import plan 可按真实 assignment 生成多个 TeachingTask candidates；不写 DB、不执行 apply。

- L6-E2F 拆分 Excel 课程设置预览巨型组件：将 course-setting-xlsx-preview.tsx 中的审核表、人工处理、任务拆分候选、部分导入计划等 UI 拆成子组件，保持 L6-E2E 行为不变；不写 DB、不执行 apply。

- L6-E2G 修复 Excel 课程设置导入中的课程缺失语义：Excel 有课程名但 DB 无匹配时改为“新课程候选/待创建课程”，不再作为错误性课程缺失；真正课程缺失仅指 Excel 课程名为空或无法解析。L6-F 未来只允许创建已确认的新 Course，仍禁止自动创建 Teacher/ClassGroup。

- L6-E2G1 修复 Excel 课程设置 task split 班级映射回归：教师括号中的 1.2/3.4/5.6 会先展开为独立 token 再映射为当前行 classText 中的真实班级名，DB 未匹配只显示 missing，不再误报 classTokenUnmatched；不写 DB、不执行 apply。

- L7-A 替换 Excel 课程设置导入主规则为新版 A:M 固定列模板：每行独立解析，目标学期来自 UI 选择的 targetSemesterId，不再从 Excel 学年/学期列过滤；小计行跳过，K 列授课任务分配优先生成 task split，J 列任课教师为 fallback；不写 DB、不执行 apply，L6-F 继续暂缓。

- L7-A 新版 A:M Excel 课程设置模板规则替换已通过浏览器验收与自动验证补证，可正式关闭；L7-F 写库仍需单独强 gate 阶段。

- L7-A2 修复新版 Excel 课程设置审核数据全量与分页：后端返回全量审核项，前端按 50 条分页显示并展示当前范围/总数，导出与部分导入计划基于全量数据；不写 DB、不执行 apply。

- L7-A2A 修复新版 Excel 课程设置"生成审核视图"仍只返回 50 条的问题：approval-review API 与 review package builder 使用全量数据（root cause：L4 mapper 默认 maxPreviewRows=50 在 L7-A2 漏修），PAGE_SIZE=50 仅用于前端分页展示；新增 reviewDatasetSummary 暴露 dataScope=fullDataset 与 approvalItemsReturned；导出与部分导入计划基于全量审核项；不写 DB、不执行 apply。L7-F 写库继续 blocked。

- L7-A3 修复新版 Excel 课程设置可导入分类：新课程候选（COURSE_CREATE_CANDIDATE）不再作为阻塞项，可进入 dry-run importable plan 并由未来写库阶段创建 Course；blockedItems 从 1167 降至 264（仅教师缺失/班级缺失/任务分配异常等）；可导入从 0 升至 903；真正课程名缺失（COURSE_NAME_MISSING）仍阻塞；旧 COURSE_MISSING 从 blocking 移除（deprecated superset）；partial plan 现有 795 条 importableRows / 248 个课程候选 / 207 条教师缺失；不写 DB、不执行 apply；L7-F 写库继续 blocked（等浏览器验收）。

- L7-F 实现新版 Excel 课程设置受控写库执行：基于 fullDataset partial plan，只导入 importable rows，允许创建已确认/自动允许的新 Course，禁止自动创建 Teacher/ClassGroup，不创建课表；执行前备份 DB，后端重算 plan，transaction 写入 ImportBatch/TeachingTask/TeachingTaskClass，并执行 post-apply audit。

- L7-F1 只读诊断 L7-F apply trial 与 L7-A3 dry-run 口径不一致：对比 L7-A3 classification、browser-equivalent partial plan、L7-F service recompute，定位为何 apply trial 只创建空 ImportBatch #39；发现三级根因（maxPreviewRows=50 截断、importable 定义不一致、semester 4 无 ClassGroup）；不写 DB、不 rollback。

- L7-F2 修复新版 Excel 课程设置写库前 full dataset wiring，确保 partial-import-plan / partial-import-apply / CLI trial 不再回退到 50 行；新增目标学期 ClassGroup hard gate，若目标学期无班级则禁止 apply，防止再次生成空 ImportBatch。

- L7-F3 只读审计目标学期 ClassGroup readiness：确认 semesterId=4 无班级数据，分析 Excel 新模板班级需求与可用 source semester，输出选择已有学期、复制 ClassGroup、或从 Excel 派生 ClassGroup 的方案比较；推荐 Option B（从 semester 1 复制 36 个 ClassGroup 到 semester 4）；本阶段不写 DB。

- L7-F4 受控复制 ClassGroup：在 backup + confirm token + transaction 下，将 semester 1 的 36 个 ClassGroup 复制到 target semester 4；只创建 ClassGroup，不创建 Course/Teacher/TeachingTask/TeachingTaskClass/ImportBatch/ScheduleSlot，为 L7-F valid apply trial 准备班级数据。

- L7-F5 在 semester 4 已具备 ClassGroup 后执行新版 Excel 课程设置有效导入试跑：backup + confirm token + server-side recompute + plan hash + transaction，只导入 importable rows，允许创建 Course/ImportBatch/TeachingTask/TeachingTaskClass，禁止创建 Teacher/ClassGroup/ScheduleSlot，并执行 post-apply audit。

- L7-F5A 对 L7-F5 新版 Excel 课程设置有效导入进行 closeout：只读确认 ImportBatch #40、Course/TeachingTask/TeachingTaskClass 写入结果、Teacher/ClassGroup/ScheduleSlot 不变，解释 importableRows 与实际任务数的聚合口径，补齐 build/scan/K22/regression/git 证据，并准备浏览器验收。

- L7-F5C 修复 /admin/import 导入批次列表无法显示新版 Excel 课程设置 ImportBatch #40 的问题：API 移除 semesterId 过滤改为返回所有学期批次，UI 增加 APPLIED/COMPLETED 状态支持，扩展 ImportBatchListItem 类型增加 strategy 字段；本阶段不写 DB。

- L7-F5D 将 L7-F5 视为 invalid apply 并回滚：诊断确认 248 个 TeachingTask 全部 teacherId=NULL，TeachingTaskClass 过度合班（avg 21.77 per task）；使用 L7-F5 apply 前 backup restore dev.db，保留 L7-F4 sem4 ClassGroup=36，移除 #40/248 Course/248 TeachingTask/5398 TTC，并固化后续 teacher/classGroup resolution hard gates。

- L7-F6A 对新版 Excel 课程设置导入所需 Teacher / ClassGroup 主数据覆盖率做只读审计：比较课程设置 Excel、当前 Teacher 表、职员数据库、通讯录、学院专业数据库与 sem4 ClassGroup，输出教师/班级覆盖率、缺失/歧义统计和 L7-F5 事故归因；本阶段不写 DB、不执行 apply。

- L7-F6B 基于课程设置 Excel、学院专业数据库、职员数据库与通讯录生成 Teacher/ClassGroup 主数据补齐计划：规划 16 个可从 staff/contacts 高置信补齐的教师、32 个外聘/未知教师人工确认策略、440 个 sem4 ClassGroup 创建候选（418 validated + 22 manual review）与现有 36 个 legacy ClassGroup 处理策略；本阶段不写 DB、不执行 apply。

- L7-F6C 受控写入 Teacher/ClassGroup 主数据：基于 L7-F6B 计划，在 confirm token 与 DB backup 保护下只写入 16 个 high-confidence Teacher（Teacher 220→236）与 395 个 validated sem4 ClassGroup（sem4 36→431，23 duplicate names skipped），保留 36 个 legacy sem4 ClassGroup，跳过 32 个 external/unknown Teacher 与 22 个 manual-review ClassGroup；不执行 Excel apply、不创建 ImportBatch/TeachingTask/ScheduleSlot。

- L7-F6D1 修复新版 Excel 课程设置导入 resolution wiring：移除 trial 脚本 teacher/classGroup substring auto-resolve，改为 teacher normalized exact match 与 ClassGroup targetSemesterId+年级+学制+专业+班号 canonical exact match；新增体育课教师豁免显式规则、plan builder final hard gate、apply preflight hard gate 与 dry-run semantic stats。本阶段不写 DB、不执行 apply。

- L7-F6D2 对新版 Excel 课程设置导入 canonical key 做只读复核：统一 Excel row、K列分段授课、L7-F6C ClassGroup 写入结果与 resolver 的 targetSemesterId+年级+学制+专业+班号 key，复核 23 个 duplicate plannedName skip 与 22 个 manual-review ClassGroup，验证体育课教师豁免和 K列多教师通路；本阶段不写 DB、不执行 apply。

- L7-F6E 对新版 Excel 课程设置导入剩余 blockers 做只读人工处理计划：分类 missing teachers（1060 个缺失教师，其中 844 可从 staff/contacts 导入）、manual-review ClassGroups（96 个 rows × 8 个 majors）、DB collisions（32 个，9 个 unsafe 阻塞）、exam type invalid（145 个，全部可归一）、weekly hours invalid（19 个，需人工输入）与 ambiguous mappings（63 个，需人工选择班级），输出 row/candidate-level final action aggregate（AUTO_FIX=1 + WRITE_MASTER_DATA=858 + MANUAL=164 + SKIP=59 = 1082）和 L7-F6F 后续受控处理建议；本阶段不写 DB、不执行 apply。

- L7-F6E1 修复新版 Excel 课程设置导入 PE teacher exemption 的 TypeScript/build 类型错误，保持非体育课 teacherId=null blocker、体育课 PHYSICAL_EDUCATION_TEACHER_EXEMPT 显式豁免、apply preflight before backup 与 natural key 语义不变；本阶段不写 DB、不执行 apply。

- L7-F6F 受控修复新版 Excel 课程设置导入的 sem4 ClassGroup double-级 命名问题：通过 backup、confirm token、invalid token test、transaction 与 post-audit，规范化 366 个 double-级 ClassGroup 名称并删除 25 个与 legacy sem4 重复的 L7-F6C 副本（无 TeachingTaskClass 引用），修复后 double-级 从 391 降到 0，canonical key collision 从 25 降到 0，ClassGroup sem4 从 431 降到 406；不创建 Teacher/TeachingTask/ImportBatch/ScheduleSlot。

- L7-F6F1 对 L7-F6F 越界数据修复做只读 containment 审查：验证 backup 存在、25 个删除的 sem4 ClassGroup 均为 L7-F6C duplicate 且无业务引用（zero TTC/ScheduleSlot/ScheduleAdj refs）、366 个 normalized rows 仅删除重复"级"且不改变 canonical identity，并判断 ClassGroup sem4=406（431-25 safe deletes）可作为新合法 baseline，L7-F6F accepted as scope exception；本阶段不写 DB、不 rollback、不进入后续导入。

- L7-F6G1 生成新版 Excel 课程设置导入的人工确认包：将 226 个 staff/contacts teacher unique candidates、22 个 external teacher、98 个 ambiguous teacher groups、8 个 new major ClassGroup（含 1 个 major alias）、59 个 skip rows、weeklyHours/examType/ambiguous mapping 等剩余项整理为用户确认用 local artifacts；本阶段不写 DB、不执行 apply、不进入 L7-F7/L7-G。

- L7-F6G2 摄入新版 Excel 课程设置导入的用户人工决策，并生成 L7-F6H 受控主数据写入计划；当前无用户决策文件，标记 BLOCKED_WAITING_FOR_USER_DECISIONS（411 个 pending items），recommendedAction 未被自动转成 approval；本阶段不写 DB、不执行 apply、不创建 Teacher/ClassGroup/TeachingTask/ImportBatch。

- L7-F6G2A 生成新版 Excel 课程设置导入的用户决策补全草案：将 G1/G2 的 358 个 pending decisions 分层为 22 个可批量确认低风险项、204 个 duplicate risk 教师、22 个 external teacher、98 个 ambiguous teacher、8 个 new major ClassGroup、weeklyHours/ambiguousMapping 等需要 manualValue 的项，输出 user-decisions.intake.local.draft.json 与用户 review 文档；本阶段不写 DB、不执行 apply、不创建 Teacher/ClassGroup/TeachingTask/ImportBatch。

- L7-F6G2B 生成新版 Excel 课程设置导入的 partial formal user decision file：只批准 22 个低风险 staff/contacts Teacher、1 个 examType 自动归一、7 个 new major ClassGroup、1 个 major alias，并确认跳过 1 个 generic external teacher 与 1 个 skipRow aggregate；其余 duplicate-risk (204) / external (21) / ambiguous (98) / weeklyHours (1) / ambiguousMapping (1) 继续 pending。同时发现 G2 intake 必须使用 (category, decisionId) 复合键（22 个 decisionId 跨 category 重复但 composite key 唯一）。本阶段不写 DB、不执行 apply、不进入 L7-F6H/F7/G。

- L7-F6G2C0 对 L7-F6G2B 后的 pending count 口径做只读 reconciliation：解释 G2 intake 的 411/378 与 G2A/G2B grouped decision breakdown 的 358/325 差异（53 extra = row-level expansion of 59 skipRows + 19 weeklyHours），明确后续用户决策 source of truth 为 L7-F6G2A_DRAFT（composite decisions，358 项），并确认无 bug、无需 code fix、safeToProceedToNextDecisionBatch=true；本阶段不写 DB、不执行 apply、不创建 Teacher/ClassGroup/TeachingTask/ImportBatch。
