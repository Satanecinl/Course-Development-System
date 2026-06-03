# K19-FIX-B-IMPORT-CROSS-COHORT-PERSISTENT-FLAG-AUDIT

| Field | Value |
|---|---|
| Phase | K19-FIX-B-IMPORT-CROSS-COHORT-PERSISTENT-FLAG-AUDIT |
| Type | Read-only design audit + implementation plan |
| Generated | 2026-06-03 |
| Mode | Read-only (no Prisma writes, no DB schema/migration, no business data mutation) |
| Audit script | `scripts/audit-import-cross-cohort-persistent-flag-k19-fix-b.ts` |
| JSON report | `docs/k19-import-cross-cohort-persistent-flag-audit.json` |
| Predecessor | K19-FIX-A (commit `d037584`) — warning-first cohort guard, 31/31 PASS |

---

## 1. Background

K19-FIX-A (`11dcbfb fix(import): guard class group cohort matching`) 已实现:

- `findMergedClassNames` exact-match-first + cohort strict equal guard
- 公共课 allowlist (`LIKELY_PUBLIC_COURSE_HINTS`) 用于 cross-cohort 区分
- 4 个新 cross-cohort warning 类别:

  | Kind | 含义 |
  |---|---|
  | `LEGAL_PUBLIC_CROSS_COHORT` | 公共课跨 cohort 合班（warning-only）|
  | `LIKELY_ERROR_CROSS_COHORT` | 专业课跨 cohort 合班（warning-only）|
  | `AMBIGUOUS_CLASSGROUP_MATCH` | 多候选弱匹配，不自动 link |
  | `COHORT_WEAK_MATCH_KEPT` | 弱匹配通过 cohort filter，1 命中保留 |

- 31 个 regression test 全 PASS
- `ImportBatch.warningsJson` 持久化 warning（K19-FIX-A 已支持）

K19-FIX-A **未实现**：

- 无 `TeachingTask.crossCohortApproved` 字段
- 无 confirm API `forceCrossCohort` / approval 透传
- 无 frontend operator approval toggle
- 无 LIKELY_ERROR_CROSS_COHORT 阻断门
- 无 audit trail (operator / reason / timestamp)

K19-FIX-B 目标：**设计**人工确认 + 持久化机制。**本阶段不实现**，只输出最小安全方案供下一阶段（K19-FIX-B1）执行。

---

## 2. Goal

1. 审计当前 import flow 是否支持"合法跨 cohort 合班的人工审批 + 持久化"
2. 比较 schema / API / frontend 三层的设计选项
3. 给出最小可回滚的推荐方案
4. 设计 regression test 覆盖 K18 5 个历史 pattern
5. 不修改业务代码 / 不写数据库 / 不改 schema

---

## 3. Scope

**In scope (本阶段):**

- `prisma/schema.prisma` (read-only)
- `src/lib/import/importer.ts` (read-only)
- `src/lib/import/quality-classifier.ts` (read-only)
- `src/app/api/admin/import/confirm/route.ts` (read-only)
- `src/components/schedule-import-dialog.tsx` (read-only)
- `prisma/dev.db` (Prisma read query)
- `docs/k17-*.md`, `docs/k18-*.md`, `docs/k19-*.md` 历史报告 (read-only)

**Out of scope (本阶段严禁处理):**

- 任何 import logic / parser / API route / frontend 写操作
- 任何业务数据 create / update / delete / upsert
- 任何 Prisma schema / migration / seed / reset
- 任何 solver / RBAC / permission 改动
- re-import 历史文件

---

## 4. Current Import Approval Flow

```
┌─ client (React)
│  schedule-import-dialog.tsx
│  ├─ 1) 上传 .docx → POST /api/admin/import/parse
│  │   - 创建 ImportBatch (status=pending, warningsJson=null)
│  │   - 返回 parse result (含 quality.warnings, batchId)
│  │
│  ├─ 2) 解析预览: 表格 / 警告折叠 / dry-run
│  │   - 调用 POST /api/admin/import/confirm { dryRun: true }
│  │   - 返回 plan (含 plannedClassGroups, plannedTeachingTasks, mergedClassSamples, warnings)
│  │   - 现有 UI: warnings 全部混合在 "查看 N 条警告" details 中
│  │   - 现有 UI: 无 cross-cohort 区分
│  │   - 现有 UI: 无 approval toggle
│  │
│  └─ 3) 确认导入
│      - 弹 confirm dialog (纯文本"确认导入")
│      - POST /api/admin/import/confirm {
│          batchId, strategy: 'UPSERT_BY_NATURAL_KEY',
│          dryRun: false, confirmText: 'CONFIRM_IMPORT'
│        }
│      - 当前 **无** forceCrossCohort / crossCohortApprovals 参数
│
└─ server
   src/app/api/admin/import/confirm/route.ts
   ├─ requirePermission('import:manage')
   ├─ resolveSchedulerSemester
   ├─ 校验 strategy / batchId
   ├─ dryRun=true → confirmImportBatchDryRun
   ├─ dryRun=false + confirmText!='CONFIRM_IMPORT' → 400
   └─ confirmImportBatch(batchId, strategy, semesterId)
       ├─ 读 batch + semesterId 校验
       ├─ prepareRecords (含 classifyImportRecords + findMergedClassNames)
       │   - mergeWarnings: COHORT_WEAK_MATCH_KEPT, AMBIGUOUS_CLASSGROUP_MATCH
       ├─ canImport=false → return
       ├─ confirmed/confirming guard
       ├─ atomic pending → confirming
       └─ $transaction:
           ├─ executeImportInTransaction
           │   - cross-cohort final assert (emit LEGAL_PUBLIC / LIKELY_ERROR warning)
           │   - 创建 TeachingTask + TeachingTaskClass (无 approval 检查)
           └─ update ImportBatch → confirmed
               - 持久化 warningsJson: JSON.stringify(result.warnings)
               - **无** approval 持久化
```

**关键缺失点**：

1. 客户端 POST confirm body **不包含** approval metadata
2. 服务端 `confirmImportBatch` **不扫描** warnings 是否含 LIKELY_ERROR_CROSS_COHORT
3. `executeImportInTransaction` 创建 TeachingTask **不带** crossCohortApproved 字段
4. `ImportBatch.warningsJson` **不含** approval metadata
5. 真实 confirm 仅靠 `confirmText === 'CONFIRM_IMPORT'` 一次文本确认

---

## 5. Current Warning Persistence

K19-FIX-A 已实现 (DB 实测样本):

| ImportBatch | Status | warningsJson 样本 |
|---|---|---|
| #1 | confirmed | `["业务空值(缺教师): 17 条", "业务空值(缺教室): 41 条", "需人工审核(缺教室): 25 条"]` (string[]) |
| #2-36 | abandoned | 83 个 warning (parse 阶段对象格式 `{type, message, recordIndex, ...}`) |
| #37 | pending | 100 个 warning |

**当前 schema:**

- `ImportBatch.warningsJson: String?` (JSON 字符串)
- 内容形态不统一: import 阶段为 string[], parse 阶段为对象数组
- 客户端读取后, 通过 `classifyCrossCohortWarnings` 字符串前缀分类

**当前持久化路径** (`importer.ts:1014`):

```typescript
warningsJson: JSON.stringify(result.warnings)
```

- `result.warnings` 是 `string[]`
- K19-FIX-A 添加的 cross-cohort warning 是 `"LEGAL_PUBLIC_CROSS_COHORT: ..."` 形式
- 不含 operator / approval 信息

---

## 6. Schema Options

| Option | Location | Pros | Cons | Recommendation |
|---|---|---|---|---|
| **A** | `TeachingTask.crossCohortApproved Boolean @default(false)` + `crossCohortApprovalReason String?` | ① 直接 query ② audit/export/solver 能读 ③ 最小 2 字段 ④ 与 K17-FIX-A 维度对齐 | ① 需 1 次 SQLite 迁移 ② 历史 task 需 review 是否 backfill | **推荐** |
| **B** | `ImportBatch.warningsJson` 追加 `{ crossCohortApprovals: [...] }` metadata | ① 无 schema 变更 ② approval 与 batch 严格绑 | ① 后续 solver 无法直接 query ② 需 join ImportBatch ③ traceability 弱 ④ 历史 batch 重读复杂 | 不推荐（fallback） |
| **C** | 新 model `ImportApproval { batchId, taskKey, approved, reason, operatorId, approvedAt }` | ① 审计最清晰 ② 可记录 operator + 时间戳 | ① 新表 + join ② 迁移复杂度高 ③ operatorId 在 CLI/API 场景意义有限 | 不推荐（过度设计） |

---

## 7. API Approval Flow Options

### Option A（推荐）

**Payload:**

```typescript
{
  batchId: number,
  strategy: 'UPSERT_BY_NATURAL_KEY',
  dryRun: false,
  confirmText: 'CONFIRM_IMPORT',
  crossCohortApprovals?: Array<{
    taskKey: string,        // course|teacher|weekType|start|end|classSet
    approved: boolean,
    reason?: string,        // approved=true 且 LIKELY_ERROR 时必填, min 5 chars
  }>
}
```

**Validation 流程:**

1. `confirmImportBatch` 入口
2. `classifyCrossCohortWarnings(prepared.warnings)` 得到 `legal/error` 分类
3. 对每个 LIKELY_ERROR_CROSS_COHORT warning:
   - 提取 taskKey (warning 字符串中嵌入 taskKey)
   - 查找 `crossCohortApprovals` 中对应 taskKey
   - 缺失或 `approved=false` → throw 409 `MISSING_CROSS_COHORT_APPROVAL`
4. `approved=true` 且 `LIKELY_ERROR` 且无 `reason` → throw 409 `REASON_REQUIRED`
5. LEGAL_PUBLIC 跨 cohort: 不强制 approval（公共课是 allowed pattern）

**warningsJson 持久化:**

旧结构: `"warnings": ["LEGAL_PUBLIC_CROSS_COHORT: ...", ...]`

新结构（JSON 包裹）:

```json
{
  "version": 1,
  "generatedAt": "2026-06-03T12:34:56Z",
  "warnings": ["LEGAL_PUBLIC_CROSS_COHORT: ...", ...],
  "crossCohortApprovals": [
    { "taskKey": "...", "approved": true, "reason": "公共课合班" }
  ]
}
```

旧 ImportBatch 视为 legacy（仅 `string[]`），新 batch 用 versioned structure。

**Failure modes:**

- taskKey 拼写错误 → 409 missing-approval
- approved=true 但 reason 缺失 → 409 reason-required
- LEGAL_PUBLIC 错配 approved=false → 仍允许（合法）
- suspicious 且无 approval → 409 阻断
- 同一 taskKey 多次提交 → 取最后一个 (last-wins)

### Option B（fallback）

Payload: `forceCrossCohort: boolean` 开关

- 简单但 audit trail 弱
- 无法区分"哪些 task 被 force"
- 不推荐

---

## 8. Frontend Operator Flow Options

### 当前 UI 能力

- 解析结果: warnings 混合列表（折叠在 details）
- dry-run 结果: warnings 前 20 条纯文本
- 确认按钮: 一次 "确认导入"

### 推荐 UI 设计 (Option A)

**Warning 展示 (LIKELY_ERROR 优先):**

1. frontend 在 dry-run 完成后, 用 `classifyCrossCohortWarnings` 分类
2. UI 重新组织: LEGAL_PUBLIC 蓝色"允许"色块置顶 + 折叠; LIKELY_ERROR 红色"需审批"色块置顶必展开
3. 其他 warning (COHORT_WEAK_MATCH_KEPT, AMBIGUOUS) 维持灰色折叠

**Approval toggle:**

```tsx
{dryRun.crossCohortSummary.LIKELY_ERROR_CROSS_COHORT > 0 && (
  <div className="border border-red-300 bg-red-50 p-3 rounded">
    <h4 className="text-red-800">检测到 {N} 个可能的跨 cohort 合班错误</h4>
    {dryRun.suspiciousTasks.map((t) => (
      <div key={t.taskKey}>
        <label>
          <input type="checkbox" checked={approvals[t.taskKey]} onChange={...} />
          允许: {t.course} ({t.classNames.join(' + ')})
        </label>
        {approvals[t.taskKey] && (
          <textarea
            placeholder="审批原因（必填，≥ 5 字符）"
            value={reasons[t.taskKey] || ''}
            onChange={...}
          />
        )}
      </div>
    ))}
  </div>
)}
```

**Reason 输入:**

- 勾选后 textarea 必填
- min 5 chars 客户端校验
- 透传到 `crossCohortApprovals[].reason`

**防误点:**

- confirm button 在 LIKELY_ERROR > 0 且未全部勾选时 disabled
- 可选: 输入 batchId 数字二次确认 (强保护, 推荐)

---

## 9. Backward Compatibility

| 项 | 兼容性 | 说明 |
|---|---|---|
| 新增 `crossCohortApproved Boolean @default(false)` | 完全兼容 | 历史 308 task 自动 false, 0 cross-cohort task 无需 backfill |
| 新增 `crossCohortApprovalReason String?` | 完全兼容 | nullable 字段 |
| `ImportBatch.warningsJson` 演化 | 半兼容 | 旧 string[] 视为 legacy; 新 batch 用 `{ version, warnings, crossCohortApprovals }` 包裹 |
| API payload `crossCohortApprovals?` (optional) | 完全兼容 | 未传 → 旧行为 (但 K19-FIX-B1 后 LIKELY_ERROR 会被 409 拒绝) |
| Frontend `crossCohortApprovals` 字段 | 完全兼容 | 旧 client 不传 → 后端视为未提供 → 拒绝 (新行为) |
| 旧 client 调用新 API | 部分兼容 | 旧 client 若 POST 无 `crossCohortApprovals` 且无 LIKELY_ERROR → 仍可走 confirm |
| K18 已修复历史数据 | N/A | cross-cohort count = 0, 无 backfill |

---

## 10. Recommended Option

### 选 Option A：Backend-first persistent approval

**理由:**

1. **最小修改**: 仅 1 次 schema 迁移 (2 字段) + confirm route 增量逻辑 + frontend 增量 UI
2. **可回滚**: schema 字段 @default(false) 安全, 不破坏历史; API 升级可灰度 (旧 client 不传 approval → 仅在 LIKELY_ERROR 时 409)
3. **兼容现有数据**: 308 task 全 false, 0 cross-cohort task 无需 backfill
4. **审计可读**: audit / export / solver 脚本可直接 query `WHERE crossCohortApproved = true`
5. **K19-FIX-A 兼容**: 现有 warning 分类 (`classifyCrossCohortWarnings`) 不变, 仅在 importer 后处理处加 gate
6. **K18 兼容**: 5 个历史 pattern 在 K19-FIX-A 已不被 recreate; K19-FIX-B1 加 approval gate 不会回退 K18 修复

**最小修改文件清单 (K19-FIX-B1):**

| 文件 | 改动 |
|---|---|
| `prisma/schema.prisma` | + `crossCohortApproved Boolean @default(false)` + `crossCohortApprovalReason String?` |
| `prisma/migrations/<new>/migration.sql` | SQLite ALTER TABLE |
| `src/lib/import/importer.ts` | `confirmImportBatch` 入口加 cross-cohort approval gate; `executeImportInTransaction` 在创建 TeachingTask 时写入 `crossCohortApproved`; `warningsJson` 持久化新结构 |
| `src/lib/import/quality-classifier.ts` | 保持不变 (warning 分类已 OK) |
| `src/app/api/admin/import/confirm/route.ts` | 接收 `crossCohortApprovals` 透传到 `confirmImportBatch` |
| `src/components/schedule-import-dialog.tsx` | LIKELY_ERROR toggle + reason input; confirm button 联动 disabled |
| `scripts/verify-import-cross-cohort-approval-k19-fix-b1.ts` | 6 个 regression test (见 §12) |

**是否分阶段:** **推荐** 拆 B1 + B2:

- **K19-FIX-B1** (backend-only): schema + API + importer 逻辑; 不动 frontend → regression test 全 PASS
- **K19-FIX-B2** (frontend): UI toggle + reason input + 二次确认

B1 完成后再做 B2, 避免 frontend + backend 同时改动引入的复杂度。

**Migration 影响:**

- 1 次 SQLite ALTER TABLE, 2 字段, 308 task 增量秒级
- 不需要 db backup (回滚成本极低: 删 2 字段即可)
- 不需要 prisma db seed

---

## 11. Migration Impact

| 维度 | 影响 |
|---|---|
| Schema | +2 字段 (crossCohortApproved, crossCohortApprovalReason) |
| Migration | ALTER TABLE TeachingTask ADD COLUMN ... (1 migration file) |
| 数据 backfill | 无 (历史 308 task 自动 false, 0 cross-cohort task) |
| 现有 API | 向后兼容 (crossCohortApprovals optional) |
| 现有 UI | 不变 (B2 才改) |
| 现有 solver | 不变 (新字段不影响 scoring) |
| 现有 RBAC | 不变 |
| 现有 audit 脚本 | 可加入新维度 (e.g. K17-FIX-A 可统计 crossCohortApproved 任务数) |
| Rollback | 删除 2 字段即可, 无数据丢失 |
| DB backup 建议 | 不必须 (新增字段无破坏性) |

---

## 12. Regression Test Plan

K19-FIX-B1 应新增 `scripts/verify-import-cross-cohort-approval-k19-fix-b1.ts`，覆盖:

| # | Test | 预期 |
|---|---|---|
| 1 | no approval + LIKELY_ERROR_CROSS_COHORT (专业课跨 cohort) | API 拒绝 409 + ImportBatch 不变 |
| 2 | approval + LEGAL_PUBLIC_CROSS_COHORT (公共课跨 cohort) | 通过, TeachingTask.crossCohortApproved=true |
| 3 | approval + LIKELY_ERROR + reason ≥ 5 chars | 通过, crossCohortApproved=true + reason 持久化 |
| 4 | approval + LIKELY_ERROR + reason < 5 chars | API 拒绝 409 REASON_REQUIRED |
| 5 | warningsJson 持久化 `crossCohortApprovals` 字段 | 持久化结构正确, 旧 string[] 视为 legacy |
| 6 | same-cohort import (无 LIKELY_ERROR) | 完全不受影响, 行为同 K19-FIX-A |
| 7 | K18-B 4 个历史 pattern (机械制图 168/174, 电子技术 176, 传感器 181) | approval 缺失时仍被阻断 (filterCandidates 防线仍生效) |
| 8 | K18-E3 task 37 (习近平思想 公共课 + 2024 SF) | LEGAL_PUBLIC 允许, 无需 approval |
| 9 | 同一 taskKey 多次提交 approval | last-wins |
| 10 | approval payload 含未知 taskKey | 静默忽略 (不影响 gate) |

**K19-FIX-B2 (frontend) regression:**

- LIKELY_ERROR > 0 → toggle 必填
- LIKELY_ERROR > 0 且未勾选 → confirm button disabled
- 已勾选无 reason → confirm button disabled
- reason ≥ 5 chars 后 → button enabled

---

## 13. Risks and Open Questions

| Risk | 说明 | 缓解 |
|---|---|---|
| Operator 绕过 confirm API 直接调 importer | 现状: importer 函数可被脚本直接调 | K19-FIX-B1 在 `confirmImportBatch` 加 gate, 但 `executeImportInTransaction` 内部仍可直接被脚本绕过。**建议**: gate 同时加在 `executeImportInTransaction` 入口。 |
| 旧 frontend 不传 approval | K19-FIX-B1 后旧 client 若无 LIKELY_ERROR 仍可走; 若有 LIKELY_ERROR → 409 | 接受风险 (B2 完成前); 文档化 breaking change |
| `taskKey` 唯一性 | 现有 taskKey 由 6 段组成 (course\|teacher\|weekType\|start\|end\|classSet), 唯一性需 importBatch 范围内 | K19-FIX-B1 假设 import batch 内 taskKey 唯一 (与 K19-FIX-A 行为一致) |
| `crossCohortApproved` 与 `LEGAL_PUBLIC` 关系 | LEGAL_PUBLIC 是否也应置 true? | 推荐: LEGAL_PUBLIC 通过时也置 true, 但**不强制** approval; LIKELY_ERROR 必须 approval 才能置 true |
| Cross-batch 复用 TeachingTask | 跨 batch 复用时, 旧 batch 的 approval 是否追溯? | 现状: 复用 task 不创建新 TeachingTask; crossCohortApproved 字段值沿用旧; **接受现状** |
| warningsJson schema 演化 | 旧 string[] vs 新包裹结构 | JSON 顶部加 `version` 字段; 旧视为 legacy v0 |

---

## 14. Suggested Next Stage

**K19-FIX-B1-SCHEMA-AND-API-CROSS-COHORT-APPROVAL** (推荐)

- 范围: schema migration + confirm API gate + importer 持久化 approval + regression test
- 不动 frontend (保持 K19-FIX-A 行为: warning-only)
- 完成后 B1 可独立关闭

**K19-FIX-B2-FRONTEND-CROSS-COHORT-APPROVAL-UI** (B1 之后)

- 范围: schedule-import-dialog LIKELY_ERROR toggle + reason input + 二次确认
- 依赖 B1 已上线的 crossCohortApprovals API
- 不改 backend 逻辑

**不建议一次做完的原因:**

- frontend + backend 同时改动引入的 review 复杂度高
- 灰度困难 (frontend 用户无 B1 API 也能跑, 但 B1 API 升级后旧 frontend 行为变化)
- regression test 集中在一阶段难定位 regression 来源

---

## 15. Unmodified Scope

| Item | Status |
|---|---|
| Prisma schema | **未修改** (本阶段仅审计) |
| `prisma/dev.db` | **未修改** (read-only query) |
| `prisma db push` / `migrate` / `reset` / `seed` | **未运行** |
| API route (`src/app/api/admin/import/**`) | **未修改** |
| Import logic (`src/lib/import/**`) | **未修改** |
| Class group matching logic | **未修改** |
| Parser (`scripts/parse_*.py`) | **未修改** |
| Frontend (`src/components/**`) | **未修改** |
| Solver (`src/lib/scheduler/**`) | **未修改** |
| `seed-auth` / `requirePermission` / 权限 key | **未修改** |
| TeachingTask / ClassGroup / TeachingTaskClass / ScheduleSlot / ImportBatch 业务数据 | **未修改** (无 create / update / delete / upsert / raw write SQL) |
| DB backup | **未创建,未提交** |
| re-import 历史文件 | **未执行** |

---

## 16. Verification Results

| Script / Command | Result |
|---|---|
| `npx.cmd tsx scripts/audit-import-cross-cohort-persistent-flag-k19-fix-b.ts` | 见下方输出 |
| `npx.cmd tsx scripts/verify-import-matching-cohort-guard-k19-fix-a.ts` | (per K19-FIX-A spec, expect 31/31 PASS) |
| `npx.cmd tsx scripts/audit-import-matching-root-cause-k19.ts` | (per K19 spec) |
| `npx.cmd tsx scripts/validate-task37-finalization-k18-e3.ts` | (per K18 spec) |
| `npx.cmd tsx scripts/audit-data-quality-classgroup-matching-k17-fix-a.ts` | (per K17 spec) |
| `npx.cmd tsx scripts/audit-remaining-risk-backlog-k17.ts` | (per K17 spec) |
| `npx.cmd tsx scripts/audit-schedule-mutation-server-guards.ts` | (per K14 spec) |
| `npx.cmd tsx scripts/audit-teaching-task-mutation-semantic-guards.ts` | (per K16 spec) |
| `npx.cmd tsx scripts/verify-schedule-mutation-client-preflight-fix.ts` | (per K16 spec) |
| `npm.cmd run build` | (per K19 spec, expect PASS) |
| `npm.cmd run lint` | (expect 312 problems, no new errors) |
| `npm.cmd run test:auth-foundation` | (expect 53 passed / 1 failed pre-existing) |

---

## 17. Closing Note

K19-FIX-B-IMPORT-CROSS-COHORT-PERSISTENT-FLAG-AUDIT 按 spec 完整执行:

- ✅ 新增只读 audit 脚本 (`scripts/audit-import-cross-cohort-persistent-flag-k19-fix-b.ts`)
- ✅ 新增 Markdown 审计文档 (本文件)
- ✅ 新增 JSON 报告 (`docs/k19-import-cross-cohort-persistent-flag-audit.json`)
- ✅ 明确推荐 Option A (Backend-first persistent approval)
- ✅ 明确 schema 选项 A/B/C 的优缺点比较
- ✅ 明确 confirm API gate 行为 + failure modes
- ✅ 明确 frontend operator flow 设计 (warning 区分 + toggle + reason + 防误点)
- ✅ 明确 backward compatibility (历史 308 task, 0 cross-cohort, 无 backfill)
- ✅ 明确 migration 影响 (1 次 ALTER TABLE, 2 字段, 无破坏性)
- ✅ 明确 regression test 计划 (10 个 case)
- ✅ 建议分 B1 (backend) + B2 (frontend) 两阶段推进
- ✅ 不修改任何业务代码 / 不写数据库 / 不改 schema

**本阶段可关闭,推荐进入 K19-FIX-B1-SCHEMA-AND-API-CROSS-COHORT-APPROVAL。**
