# K19-FIX-B2-FRONTEND-CROSS-COHORT-APPROVAL-UI

| Field | Value |
|---|---|
| Phase | K19-FIX-B2-FRONTEND-CROSS-COHORT-APPROVAL-UI |
| Type | Implementation |
| Generated | 2026-06-04 |
| Predecessor | K19-FIX-B1 (commit `6bc87bb`) + K19-FIX-B1-AUDIT-AND-MIGRATION-ALIGNMENT (commit `fbbb7ff`) |

---

## 1. Background

K19-FIX-B1 已完成 backend-first approval 能力：

- `TeachingTask.crossCohortApproved` + `crossCohortApprovalReason`
- confirm API 支持 `crossCohortApprovals` payload
- `validateCrossCohortApprovals` gate 阻断 LIKELY_ERROR 无 approval 的 import
- `warningsJson` versioned structure

B1 audit alignment 确认 HIGH=0，B1 可关闭。

当前剩余：前端 import dialog 无法区分 cross-cohort warnings，无法提供 approval toggle / reason input，无法透传 `crossCohortApprovals` 到 confirm API。

---

## 2. Goal

1. 前端解析 dry-run warnings 中的 cross-cohort 类型
2. 对 `LIKELY_ERROR_CROSS_COHORT` 显示高风险区域 + approval checkbox + reason input
3. confirm button 在 required approvals 未完成时 disabled
4. confirm API 请求中透传 `crossCohortApprovals`
5. 保持 same-cohort import 原流程不受影响
6. 不修改 schema / migration / importer gate / backend validation 逻辑

---

## 3. Modified Files

| File | Change |
|---|---|
| `src/lib/import/cross-cohort-approval-ui.ts` | **新增** — frontend-safe pure helpers: warning parsing, approval validation, payload construction, error mapping |
| `src/components/schedule-import-dialog.tsx` | **修改** — 集成 cross-cohort approval UI: warning display, checkbox + reason, confirm button gating, payload construction, error handling |
| `scripts/verify-import-cross-cohort-approval-ui-k19-fix-b2.ts` | **新增** — 16 个 regression tests |
| `docs/k19-import-cross-cohort-approval-ui-fix-b2.md` | **新增** — 本文档 |

**未修改**: Prisma schema, migration files, importer core, confirm route, parser, solver, RBAC。

---

## 4. Warning Parsing

### 4.1 Helper Module

`src/lib/import/cross-cohort-approval-ui.ts` 提供以下纯函数：

| Function | Purpose |
|---|---|
| `parseCrossCohortWarnings(warnings)` | 将 `string[]` 解析为 `{ likelyErrors, legalPublics, ambiguous, weakMatches, suspiciousTasks }` |
| `normalizeWarnings(warnings)` | 兼容 legacy `string[]` 和 versioned `{ warnings: string[] }` shape |
| `validateApprovalState(tasks, approvals)` | 检查所有 suspicious tasks 是否已 checked + reason >= 5 |
| `buildCrossCohortApprovalPayload(tasks, approvals)` | 构建 `crossCohortApprovals` API payload |
| `mapApprovalError(error, details?)` | 将 backend 409 approval 错误映射为用户可读中文提示 |

### 4.2 Warning Kind Detection

通过字符串前缀匹配（与 backend `classifyCrossCohortWarnings` 一致）：

| Prefix | Kind | UI Behavior |
|---|---|---|
| `LIKELY_ERROR_CROSS_COHORT` | 高风险 | 红色区域 + checkbox + reason（必须） |
| `LEGAL_PUBLIC_CROSS_COHORT` | 信息性 | 蓝色提示（非阻断） |
| `AMBIGUOUS_CLASSGROUP_MATCH` | 信息性 | 不生成 required approval |
| `COHORT_WEAK_MATCH_KEPT` | 信息性 | 不生成 required approval |

### 4.3 TaskKey 提取

从 warning 字符串中提取嵌入的 taskKey：

```
/taskKey=([^)]+)\)/
```

与 B1 backend `buildApprovalTaskKey` 格式一致：`courseName|teacherName|weekType|startWeek|endWeek`。

---

## 5. Suspicious Task UI

每个 `LIKELY_ERROR_CROSS_COHORT` suspicious task 显示：

- 课程名称（从 warning 中 `course="..."` 提取）
- taskKey（monospace 小字）
- 完整 warning 文本（灰色小字）
- Approval checkbox："我已确认此跨年级合班为合理需求"
- Reason textarea（checkbox 勾选后显示）
- 字符计数 + 验证提示

重复 taskKey 的 warnings 自动去重。

---

## 6. Approval Toggle and Reason Validation

| State | Checkbox | Reason | Confirm |
|---|---|---|---|
| 未勾选 | unchecked | hidden | disabled |
| 勾选，reason < 5 | checked | visible, red hint | disabled |
| 勾选，reason >= 5 | checked | visible, green hint | enabled |

Reason 规则与 B1 backend 一致：`reason.trim().length >= 5`。

---

## 7. Confirm Button Gating

```
confirmDisabled = hasBlocking (quality) || crossCohortBlocking
crossCohortBlocking = hasLikelyErrors && !approvalValidation.ready
```

- `hasBlocking`：原有 quality 阻断（缺人数/缺课程/疑似重复）
- `crossCohortBlocking`：K19-FIX-B2 新增（LIKELY_ERROR approval 未完成）
- 两者独立生效，任一为 true 即 disabled
- 原有 `confirmText` 规则仍保持

Disabled reason 在 UI 中可见：amber 提示条 "请完成所有跨年级合班确认后才能导入"。

---

## 8. API Payload

### 8.1 crossCohortApprovals Shape

```ts
crossCohortApprovals: Array<{
  taskKey: string      // from warning embedded taskKey
  approved: true       // always true (only submitted when checked)
  reason: string       // user-provided, trim().length >= 5
}>
```

### 8.2 TaskKey 来源

从 dry-run warnings 中 `LIKELY_ERROR_CROSS_COHORT` warning 字符串的 `taskKey=...` 提取。

与 B1 backend `buildApprovalTaskKey` 格式完全一致。

### 8.3 Reason 规则

`reason.trim().length >= 5`，与 B1 backend `validateCrossCohortApprovals` 一致。

### 8.4 Submission Rules

- 只提交 approved LIKELY_ERROR tasks
- 不为 same-cohort / weak kept / ambiguous 自动提交
- LEGAL_PUBLIC 不强制，如 UI 无提供可不提交
- `crossCohortApprovals` 仅在 payload 非空时附加到请求 body

---

## 9. Error Handling

### 9.1 Backend 409 Approval Errors

| Backend Error | Frontend Display |
|---|---|
| `CROSS_COHORT_APPROVAL_REQUIRED` | "存在未确认的跨年级合班，请在上方勾选确认并填写原因后重新导入。" |
| `reason required (>= 5 chars)` | "跨年级合班审批原因不完整，请确保每个确认项的原因不少于 5 个字符。" |
| `CROSS_COHORT_APPROVAL` (generic) | "跨年级合班审批校验失败，请检查确认项后重试。" |

### 9.2 Generic Errors

非 approval 相关错误仍显示原始 error message（原有行为不变）。

---

## 10. Backward Compatibility

| Item | Impact |
|---|---|
| Same-cohort import | 完全不受影响（无 LIKELY_ERROR warnings → no approval section） |
| Old dry-run (no cross-cohort warnings) | UI 不变，crossCohortWarnings 为空 |
| LEGAL_PUBLIC only | 蓝色 info 提示，不阻断 |
| Old confirm request (no approvals) | 无 LIKELY_ERROR 时仍正常；有 LIKELY_ERROR 时 backend 返回 409（B1 行为） |
| Versioned warningsJson | `normalizeWarnings` 兼容 `{ version: 2, warnings: [...] }` |
| Legacy string[] warnings | `normalizeWarnings` 直接透传 |

---

## 11. Regression Cases

| Case | Expected | Result |
|---|---|---|
| T1 | legacy string[] warnings 可解析 | PASS |
| T2 | versioned warnings object 可解析 | PASS |
| T3 | LIKELY_ERROR 生成 required suspicious task | PASS |
| T4 | LEGAL_PUBLIC 不生成 required approval | PASS |
| T5 | AMBIGUOUS 不生成 required approval | PASS |
| T6 | COHORT_WEAK_MATCH_KEPT 不生成 required approval | PASS |
| T7 | missing checkbox → confirm disabled | PASS |
| T8 | checkbox checked but reason < 5 → confirm disabled | PASS |
| T9 | checkbox checked + reason >= 5 → confirm enabled | PASS |
| T10 | payload 只包含 approved LIKELY_ERROR tasks | PASS |
| T11 | confirmText gating 与 cross-cohort gating 可同时生效 | PASS |
| T12 | backend 409 approval error 可映射到用户可读错误 | PASS |
| T13 | duplicate LIKELY_ERROR warnings 去重 | PASS |
| T14 | normalizeWarnings handles null/undefined gracefully | PASS |
| T15 | no cross-cohort warnings → approval validation passes | PASS |
| T16 | taskKey from warning matches buildApprovalTaskKey format | PASS |

**16 PASS / 0 FAIL**

---

## 12. Verification Results

| Script / Command | Result |
|---|---|
| `verify-import-cross-cohort-approval-ui-k19-fix-b2` | 16 PASS / 0 FAIL |
| `verify-import-cross-cohort-approval-k19-fix-b1` | 17 PASS / 0 FAIL |
| `verify-import-matching-cohort-guard-k19-fix-a` | 31 PASS / 0 FAIL |
| `audit-import-cross-cohort-persistent-flag-k19-fix-b` | HIGH=0 |
| `audit-import-matching-root-cause-k19` | HIGH=0 |
| `validate-task37-finalization-k18-e3` | 18 PASS / 0 FAIL |
| `audit-data-quality-classgroup-matching-k17-fix-a` | HIGH=0 |
| `audit-remaining-risk-backlog-k17` | No BLOCKING |
| `audit-schedule-mutation-server-guards` | HIGH=0 / MEDIUM=0 |
| `audit-teaching-task-mutation-semantic-guards` | HIGH=0 / MEDIUM=0 |
| `verify-schedule-mutation-client-preflight-fix` | 23 PASS / 0 FAIL |
| `prisma validate` | ✓ valid |
| `build` | ✓ Compiled successfully |
| `lint` | 312 problems (baseline) |
| `test:auth-foundation` | 53 passed / 1 failed (pre-existing) |

---

## 13. Out of Scope

- **Schema / migration**: 不修改
- **Importer core validation**: 不修改
- **Backend confirm route**: 不修改（B1 已完成）
- **Parser**: 不修改
- **Solver**: 不修改
- **RBAC / permissions**: 不修改
- **Source evidence traceability**: 仍待后续阶段
- **ImportApproval 独立 model**: 仍不做
- **Re-import 历史文件**: 不执行

---

## 14. Remaining Risks

| Risk | Status |
|---|---|
| Source evidence traceability | **Deferred**。TeachingTaskClass 仍无 source row / keyword |
| ImportApproval 独立 model | **Deferred**。当前用 TeachingTask 字段 + warningsJson |
| Frontend E2E 测试 | **Deferred**。B2 验证为纯函数测试 + build，未做浏览器 E2E |
| K19-FIX-B audit MEDIUM | **已消除**。B2 完成后原 C-001 (MEDIUM) 应降为 NONE |
| LEGAL_PUBLIC optional approval | **Accepted**。B2 不强制 LEGAL_PUBLIC approval |

---

## 15. Suggested Next Stage

K19-FIX-B 主线可关闭。推荐后续：

1. **K19-FIX-B2-AUDIT-ALIGNMENT**: 更新 audit 脚本，使 C-001/C-002/C-003 识别 B2 UI 实现
2. **Source evidence traceability**: TeachingTaskClass 新增 source row / keyword 字段
3. **E2E 测试**: 浏览器端 import dialog + cross-cohort approval 完整流程
