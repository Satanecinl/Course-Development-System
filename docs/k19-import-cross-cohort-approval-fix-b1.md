# K19-FIX-B1-SCHEMA-AND-API-CROSS-COHORT-APPROVAL

| Field | Value |
|---|---|
| Phase | K19-FIX-B1-SCHEMA-AND-API-CROSS-COHORT-APPROVAL |
| Type | Implementation |
| Generated | 2026-06-03 |
| Predecessor | K19-FIX-B-AUDIT-CLEANUP (commit `7b53b28`) |
| Audit basis | `docs/k19-import-cross-cohort-persistent-flag-audit.md` — Option A: Backend-first persistent approval |

---

## 1. Background

K19-FIX-B audit 确认：

- HIGH: 1 (Confirm API 无 operator approval 参数)
- MEDIUM: 3 (TeachingTask 无 approval 字段 / 无 cross-cohort 阻断门 / UI 无区分展示)
- 推荐 Option A：Backend-first persistent approval

K19-FIX-B1 实现 backend-first 方案：schema + API + importer 持久化 approval。Frontend UI（B2）单独阶段。

---

## 2. Goal

1. TeachingTask 增加 `crossCohortApproved` + `crossCohortApprovalReason`
2. confirm API 接收 `crossCohortApprovals` payload
3. importer 对 LIKELY_ERROR_CROSS_COHORT 实施阻断门
4. `executeImportInTransaction` 写入 approval 字段
5. `ImportBatch.warningsJson` 使用 versioned structure
6. regression verify 17 PASS / 0 FAIL

---

## 3. Schema Changes

`prisma/schema.prisma` TeachingTask model 新增：

```prisma
crossCohortApproved       Boolean  @default(false)
crossCohortApprovalReason String?
```

- `crossCohortApproved`: 非 NULL Boolean，默认 false。历史 308 tasks 自动 false。
- `crossCohortApprovalReason`: NULLABLE String。无 approval 时为 null。

---

## 4. Migration / Backup

- **Backup**: `prisma/dev.db.backup-before-k19-cross-cohort-approval-<timestamp>`
- **Command**: `npx prisma db push` (非交互环境，项目此前已使用 db push 同步 schema)
- **Migration file**: `prisma/migrations/20260603000000_add_cross_cohort_approval/migration.sql`
- **Duration**: <100ms，308 rows 增量同步
- **Not committed**: prisma/dev.db, backup 文件

---

## 5. Approval Payload

confirm route request body 新增可选字段：

```ts
crossCohortApprovals?: Array<{
  taskKey: string      // 由 buildApprovalTaskKey 生成
  approved: boolean
  reason?: string      // approved=true 且 LIKELY_ERROR 时必填, >= 5 chars
}>
```

- `crossCohortApprovals` 为 optional。不传时，若存在 LIKELY_ERROR → 409
- 旧 frontend 不传此字段时，无 LIKELY_ERROR 的 import 仍正常工作

---

## 6. TaskKey Strategy

```ts
function buildApprovalTaskKey(
  courseName: string,
  teacherName: string | null,
  weekType: string,
  startWeek: number,
  endWeek: number,
): string {
  return [courseName, teacherName ?? '**NULL_TEACHER**', weekType, startWeek, endWeek].join('|')
}
```

- 确定性：同一输入产出同一 key
- 与 importer 内部 `taskKey` 的前 5 段完全一致
- 不含 DB id，不依赖导入顺序
- 嵌入 warning 字符串中（`taskKey=...`），前端从 dry-run 结果中提取
- 同一 batch 内同课程同教师同周次唯一（taskKey 分组逻辑保证）

---

## 7. Backend Gate Rules

`validateCrossCohortApprovals(warnings, approvals)` 在 `confirmImportBatch` 入口处调用：

| Warning kind | Approval required? | Reason required? | Behavior |
|---|---|---|---|
| `LIKELY_ERROR_CROSS_COHORT` | YES (approved=true) | YES (>= 5 chars) | 无 approval → throw `CROSS_COHORT_APPROVAL_REQUIRED` → 409 |
| `LEGAL_PUBLIC_CROSS_COHORT` | NO | NO | 不阻断。如有 approval 则记录到 TeachingTask |
| `AMBIGUOUS_CLASSGROUP_MATCH` | NO | NO | 不影响（K19-FIX-A 已不自动 link） |
| `COHORT_WEAK_MATCH_KEPT` | NO | NO | same-cohort weak match，无需 approval |
| 其他 warning | NO | NO | 不触发 gate |

---

## 8. TeachingTask Persistence

`executeImportInTransaction` 创建 TeachingTask 时写入：

```ts
crossCohortApproved: boolean        // default false
crossCohortApprovalReason: string | null
```

| Scenario | crossCohortApproved | crossCohortApprovalReason |
|---|---|---|
| same-cohort task | false | null |
| LEGAL_PUBLIC + no approval | false | null |
| LEGAL_PUBLIC + approval + reason | true | reason |
| LIKELY_ERROR + approval + reason | true | reason |
| LIKELY_ERROR + no approval | (gate 阻断，不创建) | — |

---

## 9. warningsJson Versioned Structure

B1 之后新 batch 的 `ImportBatch.warningsJson` 结构：

```json
{
  "version": 2,
  "generatedAt": "2026-06-03T12:34:56.000Z",
  "warnings": ["业务空值(缺教师): 17 条", ...],
  "crossCohortApprovals": [
    { "taskKey": "机械制图|赵春超|ALL|1|16", "approved": true, "reason": "跨年级合班已确认" }
  ]
}
```

- `version`: 2（B1 新增）
- `generatedAt`: ISO timestamp
- `warnings`: 与旧版 string[] 内容一致
- `crossCohortApprovals`: 透传自请求 payload

**Backward compatibility**：

- 旧 batch `warningsJson` 是 `string[]` 或 `null`，不影响读取
- 客户端解析时先 `JSON.parse`，若为 `Array` 则是 legacy string[]；若为 `{version: 2, ...}` 则是新版
- 读取兼容层可参考：`const warnings = Array.isArray(parsed) ? parsed : parsed.warnings`

---

## 10. Regression Cases

| Case | Input | Expected | Result |
|---|---|---|---|
| T1 | no approval + LIKELY_ERROR | blocked | PASS |
| T2 | approval true + LIKELY_ERROR + reason >= 5 | allowed | PASS |
| T3 | approval true + LIKELY_ERROR + reason < 5 | blocked (reason required) | PASS |
| T4 | approval false + LIKELY_ERROR | blocked (not granted) | PASS |
| T5 | LEGAL_PUBLIC no approval | allowed | PASS |
| T6 | LEGAL_PUBLIC with approval + reason | allowed + in map | PASS |
| T7 | COHORT_WEAK_MATCH_KEPT | no approval required | PASS |
| T8 | AMBIGUOUS_CLASSGROUP_MATCH | no approval required | PASS |
| T9 | same-cohort (no cross-cohort warnings) | unaffected | PASS |
| T10 | unknown taskKey approval | blocked (missing approval for LIKELY_ERROR) | PASS |
| T11 | warningsJson legacy shape | array format preserved | PASS |
| T12 | buildApprovalTaskKey deterministic | same input → same key | PASS |
| T13 | buildApprovalTaskKey null teacher | `**NULL_TEACHER**` placeholder | PASS |
| T14 | DB schema has crossCohortApproved | default false | PASS |
| T15 | all 308 tasks crossCohortApproved=false | no backfill needed | PASS |
| T16 | K18 5 historical tasks (168/174/176/181/37) | still crossCohortApproved=false | PASS |
| T17 | multiple LIKELY_ERROR + partial approval | blocked | PASS |

**17 PASS / 0 FAIL**

---

## 11. Backward Compatibility

| Item | Impact |
|---|---|
| Schema | 2 non-breaking fields (default false + nullable) |
| 308 existing tasks | All `crossCohortApproved=false`, no backfill needed |
| K18 repaired data | Unchanged (tasks 168/174/176/181/37 stay clean) |
| Old confirm API calls (no approvals) | Work if no LIKELY_ERROR warnings; 409 if LIKELY_ERROR exists |
| Old frontend | No changes needed in B1; 409 is expected for LIKELY_ERROR until B2 UI |
| Solver | Unaffected (new fields don't impact scoring) |
| RBAC | Unaffected |
| Old warningsJson readers | Legacy `string[]` still parseable |

---

## 12. Out of Scope

- **Frontend UI** (B2): toggle, reason input, warning display, 二次确认
- **Source evidence traceability**: TeachingTaskClass 仍无 source row / keyword 记录
- **Alias expansion**: `森防` → `森林草原防火` 别名表
- **Re-import 历史文件**: 不执行
- **Parser 修改**: 不动

---

## 13. Verification Results

| Script / Command | Result |
|---|---|
| `verify-import-cross-cohort-approval-k19-fix-b1` | 17 PASS / 0 FAIL |
| `verify-import-matching-cohort-guard-k19-fix-a` | 31 PASS / 0 FAIL |
| `audit-import-cross-cohort-persistent-flag-k19-fix-b` | HIGH=1 / MEDIUM=3 / LOW=4 / INFO=5 |
| `audit-import-matching-root-cause-k19` | HIGH=0 |
| `validate-task37-finalization-k18-e3` | 18 PASS / 0 FAIL |
| `audit-data-quality-classgroup-matching-k17-fix-a` | HIGH=0 |
| `audit-remaining-risk-backlog-k17` | No BLOCKING |
| `audit-schedule-mutation-server-guards` | HIGH=0 / MEDIUM=0 |
| `audit-teaching-task-mutation-semantic-guards` | HIGH=0 / MEDIUM=0 |
| `verify-schedule-mutation-client-preflight-fix` | 23 PASS / 0 FAIL |
| `build` | ✓ Compiled successfully |
| `lint` | 312 problems (baseline) |
| `test:auth-foundation` | 53 passed / 1 failed (pre-existing) |

---

## 14. Remaining Risks

| Risk | Status |
|---|---|
| Frontend UI toggle | **B2 待实现**。B1 后旧 frontend 遇 LIKELY_ERROR 会收到 409 |
| Source evidence traceability | **Deferred**。TeachingTaskClass 无 source row / keyword |
| Schema-level approval 已完成 | ✅ `crossCohortApproved` + `crossCohortApprovalReason` 已存在 |
| warnings display | **B2 待实现**。当前 warnings 混合列表，无 cross-cohort 区分 |

---

## 15. Suggested Next Stage

**K19-FIX-B2-FRONTEND-CROSS-COHORT-APPROVAL-UI**

- 范围：`schedule-import-dialog.tsx` 新增 LIKELY_ERROR toggle + reason input + 二次确认
- 依赖：B1 已上线的 `crossCohortApprovals` API
- 不改 backend 逻辑
- dry-run 返回中需新增 `crossCohortSummary` 和 `suspiciousTasks` 字段（前端消费）
