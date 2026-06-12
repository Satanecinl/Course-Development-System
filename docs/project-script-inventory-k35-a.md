# Project Script Inventory (K35-A)

> **盘点时点**: K35-A housekeeping（K34-A3F closeout 之后）。
>
> **目的**: 给出 `scripts/` 当前清单，按类别分组；标记危险脚本（写 DB / 写文件）和 `candidate_for_archive` 候选；为后续 stage（如 `K35-C-SCRIPT-ARCHIVE-AND-NAMING-CONSOLIDATION`）提供基础数据。
>
> **本阶段不删除、不移动任何 tracked 脚本**。所有 mark 仅是 inventory 标注。

## 总览

| 类别 | 数量 | 副作用 | 典型用途 |
|---|---:|---|---|
| `verify-*.ts` | 115 | **read-only** | 可重复验证。CI / pre-commit / closeout |
| `audit-*.ts` | 51 | **read-only** | 库存盘点 / 一致性审计 |
| `diagnose-*.ts` | 8 | **read-only** | 一次性诊断 |
| `plan-*.ts` | 7 | **read-only** | 阶段开头的规划分析 |
| `trial-*.ts` | 3 | 视情况 | 受控/手动试跑，默认 read-only |
| `evaluate-*.ts` | 1 | **read-only** | 质量评估 |
| `validate-*.ts` | 7 | **read-only** | 不变量校验 |
| `test-*.ts` | 47 | 视情况（多数 read-only，少数写 fixture） | 单元/集成测试（legacy 命名） |
| `seed-*` / `import-*.ts` | 5 | **writes DB** | CLI 种子/导入（legacy） |
| `confirm-*` / `abandon-*` / `rollback-*.ts` | 3 | **writes DB** | 一次性导入生命周期 |
| `fix-*.ts` | 1 | **writes DB** | 一次性数据修复 |
| `repair-*.ts` | 4 | **writes DB**（常 gated by `--apply`） | 数据 repair |
| `backfill-*.ts` | 2 | **writes DB**（常 `--dry-run`） | 幂等回填 |
| `cleanup-*.ts` | 1 | **writes DB** | DB cleanup |
| `implement-*.ts` | 1 | **writes DB** | schema/配置一次性实施 |
| `export-*.ts` | 2 | 写文件 | 导出 |
| `dry-run-*.ts` | 3 | **read-only** | 写之前的预览 |
| `prepare-*` / `finalize-*` / `review-*` / `preview-*` / `inspect-*` | 5 | 视情况 | 阶段内 helper |
| `g0fixb-*` / `g0fixc-*` | 8 | 视情况 | 早期 hotfix series（K26 之前） |
| `f2-fix-e-ui-verify*` | 3 | 视情况 | F2 系列 UI verify |
| `parse_*.py` | 2 | 写文件 | Word docx 解析 |
| Python utility | 6 | 视情况 | one-off Python 工具 |
| 其它 (legacy) | 6 | 视情况 | seed / tmp / debug |

**危险 / write-capable scripts（共 8 个，**显式门控**）**：

- `backfill-default-semester.ts`
- `backfill-worktime-default-config-k26-f.ts`（建议先用 `--dry-run`）
- `cleanup-teaching-task-class-pollution.ts`
- `fix-confirmed-import-metadata.ts`（环境变量 `FIX_IMPORT_METADATA=1` 门控）
- `repair-composite-room-expressions-k34-a3.ts`
- `repair-cross-cohort-data-k18-b.ts`
- `repair-duplicate-room-names-k34-a2.ts`
- `repair-hc6-existing-slot383-k26-k4a.ts`

其它 write-capable 但已通过 `package.json` 显式暴露：

- `seed-auth.ts`, `seed_db.ts` — CLI 种子脚本；`seed_db.ts` 要求显式 synthetic 输入
- `confirm-import-once.ts`（`CONFIRM_IMPORT=1` 门控）, `rollback-import-once.ts`, `abandon-import-once.ts`
- `implement-multi-semester-schema-k25-c.ts`
- `import-data.ts`

## `candidate_for_archive`（建议下一阶段归档）

> 这些脚本对应的 stage 已 CLOSED 一段时间，且当前不再被任何 closeout 验证或 CI 阶段直接调用。**本阶段不删除/不移动**，仅作 inventory 标记。下个归档 stage（推荐名 `K35-C-SCRIPT-ARCHIVE-AND-NAMING-CONSOLIDATION`）会决定：
> - 移到 `scripts/_archive/<stage>/`
> - 移走前做一次"无引用"确认
> - 在 `scripts/_archive/README.md` 写明归档原因

### 早期 hotfix 残留（g0fix* / f2-fix-e-*）

K36-A5D2A 已从当前 HEAD 移除带固定真实数据路径或破坏性导入流程的
`g0fixb-import-0420.ts` 与 `g0fixc-check-remark-merge-safety.ts`。

```txt
g0fixb-debug-duplicates.ts
g0fixb-verify-dashboard.ts
g0fixb-verify-database.ts
g0fixc-check-adjustments.ts
g0fixc-verify-excel.ts
f2-fix-e-ui-verify.ts
f2-fix-e-ui-verify-final.ts
f2-fix-e-ui-verify-v2.ts
```

理由：K26 之前的 hotfix series，已被后续 verify 脚本完全覆盖（例如 `verify-import-*-k19-*` / `verify-multi-room-*` 等）。

### K17/K18/K19/K20 阶段残留（K25 / K26 / K28 已 CLOSED 后续）

```txt
audit-remaining-risk-backlog-k17.ts
audit-remaining-risk-rebase-k20.ts
audit-source-evidence-backfill-gap-k20-fix-b.ts
audit-source-evidence-traceability-k20-fix-a.ts
validate-cross-cohort-data-repair-k18-b.ts
review-cross-cohort-classgroup-decisions-k17-fix-b.ts
review-task37-source-artifact-k18-c.ts
inspect-task37-readonly-k18-d1.ts
preview-task37-readonly-candidate-state-k18-d2.ts
prepare-task37-controlled-execution-k18-e2.ts
finalize-task37-data-repair-k18-e3.ts
validate-task37-finalization-k18-e3.ts
dry-run-task37-readonly-preview-k18-e1.ts
repair-cross-cohort-data-k18-b.ts
audit-data-quality-classgroup-matching-k17-fix-a.ts
audit-import-cross-cohort-persistent-flag-k19-fix-b.ts
audit-import-matching-root-cause-k19.ts
verify-import-approval-browser-e2e-k19-fix-c.ts
verify-import-approval-browser-e2e-readiness-k19-fix-c.ts
verify-import-cross-cohort-approval-k19-fix-b1.ts
verify-import-cross-cohort-approval-ui-k19-fix-b2.ts
verify-import-matching-cohort-guard-k19-fix-a.ts
verify-import-semester-scoping-fix-a.ts
verify-import-semester-scoping-fix-b.ts
verify-source-evidence-importer-k20-fix-b.ts
verify-source-evidence-query-k20-fix-b.ts
verify-source-evidence-schema-k20-fix-b.ts
```

理由：K25-C 引入 per-semester scoping 后，K17-K20 的 cross-cohort / source-evidence 系列验证已被 `verify-class-groups-semester-scope.ts` / `validate-import-semester-scoping.ts` / `verify-semester-scoping-api-k25-d.ts` 等覆盖。原始验证仍可运行但 closeout chain 已不引用。

### K22-L / K22 阶段残留

```txt
verify-scheduler-breakdown-ui-k22-l2.ts
evaluate-real-solver-quality-k22-l1.ts
```

理由：K22-L 阶段是探索性 UI 改造，最终未成为主路径。建议归档到 `scripts/_archive/k22-l/`，但 K22-L 相关 closeout doc 仍保留在 `docs/`。

### 早期 import workflow 验证（被 K34-A 系列覆盖）

```txt
test-import-quality.ts
test-confirm-import-dry-run.ts
test-confirm-import-transaction-rollback.ts
test-confirm-api-guards.ts
test-rollback-dry-run.ts
test-rollback-transaction-rollback.ts
test-rollback-api-guards.ts
test-abandon-import-batch.ts
audit-import-batches.ts
audit-confirmed-import.ts
audit-import-coverage.ts
```

理由：K34-A 引入 import management page + K34-A2 room name normalization 后，import workflow 验证已由 `verify-import-management-basic-k34-a.ts` / `verify-import-detail-object-render-k34-a1.ts` 覆盖。原始 test-* 仍可跑，但与 K34-A 的 stage-aware check 重复。

### temp-* / tmp-* / debug-*

```txt
tmp-check-classes.ts
debug-worktime-controlled-apply-hardscore-mismatch-k26-k2.ts
g0fixb-debug-duplicates.ts
```

理由：阶段内临时调试脚本，应在 stage 关闭时一并清理。`temp-cookie.ts` 与 `temp-debug.ts` 已在 K36-A5D1 从当前 HEAD 移除；其余候选后续单独处理。

## 全量 verify 列表（115 个，K35-A 盘点）

按字母排序：

```txt
verify-adjustment-application-form-export-k32-a.ts
verify-adjustment-application-form-layout-k32-a1.ts
verify-adjustment-application-form-source-week-k32-a2.ts
verify-adjustment-plan-recommendations-k24-a.ts
verify-adjustment-request-list-display-k32-a3.ts
verify-adjustment-request-pages-back-nav-k31-b.ts
verify-adjustment-request-pages-protected-shell-k31-c.ts
verify-adjustment-room-recommendations-k23-a.ts
verify-adjustment-rule-settings-basic-k26-m1.ts
verify-apply-post-validation-hc5-hc6-k26-k3.ts
verify-audit-log-settings-basic-k26-q1.ts
verify-auth-logout-redirect-k26-q2a.ts
verify-batch-classgroup-matching.ts
verify-campus-room-rule-settings-basic-k26-l1.ts
verify-capacity-preference-constraint-k22-f11.ts
verify-class-gap-reduction-constraint-k22-f6.ts
verify-class-groups-semester-scope.ts
verify-classroom-stability-constraint-k22-f8.ts
verify-collapsible-sidebar-k30-a.ts
verify-composite-room-expression-k34-a3.ts
verify-controlled-apply-rollback-closeout-k26-k.ts
verify-dashboard-all-weeks-schedule-k34-a3b.ts
verify-dashboard-secondary-room-filter-k34-a3c.ts
verify-data-maintenance-settings-basic-k26-p1.ts
verify-hc6-data-repair-k26-k4a.ts
verify-hc6-data-rule-context-k26-k4.ts
verify-import-approval-browser-e2e-k19-fix-c.ts
verify-import-approval-browser-e2e-readiness-k19-fix-c.ts
verify-import-cross-cohort-approval-k19-fix-b1.ts
verify-import-cross-cohort-approval-ui-k19-fix-b2.ts
verify-import-detail-object-render-k34-a1.ts
verify-import-management-basic-k34-a.ts
verify-import-matching-cohort-guard-k19-fix-a.ts
verify-import-rule-settings-basic-k26-n1.ts
verify-import-semester-scoping-fix-a.ts
verify-import-semester-scoping-fix-b.ts
verify-k16-schedule-mutation-audit-alignment-fix-b.ts
verify-k22-mainline-closeout.ts
verify-multi-room-acceptance-closeout-k34-a3f.ts
verify-multi-semester-scheduler-closeout-k29.ts
verify-multi-semester-scheduler-k29-a.ts
verify-permission-role-settings-basic-k26-o1.ts
verify-plan-recommendation-closeout-k24.ts
verify-plan-recommendation-cross-week-conflict-k24-a2.ts
verify-plan-recommendation-preferred-day-k24-a5.ts
verify-plan-recommendation-preferred-week-k24-a3.ts
verify-rbac-permission-granularity-fix-a.ts
verify-rbac-permission-granularity-fix-b.ts
verify-rbac-permission-granularity-fix-c.ts
verify-rbac-permission-granularity-fix-d.ts
verify-rbac-permission-granularity-fix-e.ts
verify-rbac-schedule-write-hardening-fix-a.ts
verify-rbac-schedule-write-hardening-fix-b.ts
verify-real-usage-trial-readiness-k22.ts
verify-room-name-normalization-k34-a2.ts
verify-room-recommendation-closeout-k23.ts
verify-schedule-adjustment-conflict-rules-extraction-fix-c.ts
verify-schedule-api-response-compat-k25-d1.ts
verify-schedule-conflict-check-unification-fix-a.ts
verify-schedule-conflict-check-unification-fix-b.ts
verify-schedule-conflict-response-shape-fix-d.ts
verify-schedule-export-current-filter-k31-a.ts
verify-schedule-mutation-client-preflight-fix.ts
verify-schedule-mutation-server-guard-fix-a.ts
verify-scheduler-breakdown-ui-k22-l2.ts
verify-scheduler-config-settings-acceptance-closeout-k26-b.ts
verify-scheduler-config-settings-integration-k26-b.ts
verify-scheduler-config-settings-manual-trial-readiness-k26-b1.ts
verify-score-delta-sc1-fix-k22-d.ts
verify-score-regression-harness-k22-c.ts
verify-secondary-room-runtime-filter-k34-a3e.ts
verify-semester-scoping-api-k25-d.ts
verify-semester-selector-ux-k25-e.ts
verify-semester-settings-acceptance-closeout-k25.ts
verify-semester-settings-api-k25-h.ts
verify-semester-settings-e2e-manual-trial-readiness-k25-j.ts
verify-semester-settings-ui-k25-i.ts
verify-semester-switching-mode-k28-c.ts
verify-solver-config-api-k21-fix-f.ts
verify-solver-config-preview-k21-fix-f.ts
verify-solver-config-snapshot-k21-fix-f.ts
verify-solver-config-ui-k21-fix-g.ts
verify-solver-hc6-aware-k26-k4c.ts
verify-source-evidence-importer-k20-fix-b.ts
verify-source-evidence-query-k20-fix-b.ts
verify-source-evidence-schema-k20-fix-b.ts
verify-specialty-campus-weekend-constraints-k22-f3.ts
verify-static-time-slot-extraction-k26-d.ts
verify-system-settings-basic-closeout-k26.ts
verify-system-settings-shell-k26-a.ts
verify-system-wide-real-usage-trial-k27.ts
verify-teacher-day-balance-constraint-k22-f4.ts
verify-teaching-task-mutation-guard-parity-fix-a.ts
verify-timeslot-range-correction-k24-a4.ts
verify-user-adjustment-approval-flow-closeout-k28.ts
verify-user-adjustment-approval-flow-k28-a.ts
verify-user-adjustment-approval-flow-manual-trial-k28-b.ts
verify-user-adjustment-request-mine-fix-k28-a1.ts
verify-user-adjustment-request-plan-recommendation-k28-a2.ts
verify-user-management-edit-delete-k33-a.ts
verify-worktime-adjustment-dialog-integration-k26-i4.ts
verify-worktime-adjustment-dry-run-apply-guard-k26-i2.ts
verify-worktime-api-k26-g.ts
verify-worktime-plan-recommendation-integration-k26-i1.ts
verify-worktime-post-schema-regression-k26-f1.ts
verify-worktime-recommendation-integration-acceptance-closeout-k26-i.ts
verify-worktime-room-recommendation-guard-k26-i3.ts
verify-worktime-runtime-prisma-delegate-k26-h2a.ts
verify-worktime-schedulingrun-snapshot-k26-j2.ts
verify-worktime-score-sc3-sc7-alignment-k26-j4.ts
verify-worktime-settings-ui-acceptance-closeout-k26-h.ts
verify-worktime-settings-ui-k26-h.ts
verify-worktime-solver-candidate-generation-k26-j3.ts
verify-worktime-solver-manual-frontend-readiness-k26-j6.ts
verify-worktime-solver-score-integration-acceptance-closeout-k26-j.ts
```

## 下一阶段建议

`K35-C-SCRIPT-ARCHIVE-AND-NAMING-CONSOLIDATION`：

1. 创建 `scripts/_archive/<stage>/` 子目录（按 stage 分组）
2. 移动 `candidate_for_archive` 标记的脚本
3. 在 `scripts/_archive/README.md` 写归档原因与原 commit 引用
4. 补 stage-aware 索引（哪些 verify 引用了哪些已归档脚本，必要时改 closeout chain 引用）
5. 重新跑最近 stage 的 closeout verify（K34-A3F 等）确认无回归

**绝不在 `K35-C` 之前的 stage 动这些脚本**。
