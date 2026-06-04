# K20-FIX-A-SOURCE-EVIDENCE-TRACEABILITY-AUDIT

| Field | Value |
|---|---|
| Phase | K20-FIX-A-SOURCE-EVIDENCE-TRACEABILITY-AUDIT |
| Type | Read-only audit + design proposal (no Prisma writes, no schema/migration, no business code mutation) |
| Generated | 2026-06-04 |
| Predecessor | K20-REMAINING-RISK-REBASE-AUDIT (commit `b60b19e`) — HIGH=0 / MEDIUM=2 / LOW=6 / ACCEPTED=1 / NONE=1 / BLOCKING=NO |
| Audit script | `scripts/audit-source-evidence-traceability-k20-fix-a.ts` |
| JSON report | `docs/k20-source-evidence-traceability-audit.json` |

---

## 1. Background

K20-REMAINING-RISK-REBASE-AUDIT (commit `b60b19e test(project): fix k20 build verification`)
确认 2 项 MEDIUM 风险仍存在:

- **B. Source evidence traceability** — K19-RULE-D-001 MEDIUM. K19-FIX-A / B1 / B2 / C
  多次 deferred. 详细分析: K18-B 4 tasks (168/174/176/181) + K18-E3 task 37 修复时需要
  人工 cross-reference 17 个 source JSON 才能定位错误 link 的来源.
- **E. RBAC / import:manage scope** — 仍 LOW (从 K17 MEDIUM 降级, 因 K19-FIX-B1 加了
  backend gate).

K20 rebase 推荐下一阶段是 **K20-FIX-A-SOURCE-EVIDENCE-TRACEABILITY-AUDIT** —
本阶段即为该推荐. K18 / K19 已修复 cross-cohort 数据错误与未来导入防复发,
但 **TeachingTaskClass 仍缺少 source row / source keyword / source artifact 级别追溯信息**.
K19 多次 deferred source evidence traceability (K19-FIX-B1 文档 §12 / K19-FIX-B2
文档 §14 / K19-FIX-C 文档 §11).

本阶段定位: **只做审计 + schema 提案**, 不直接改 schema, 不写 DB, 不修改业务代码.

---

## 2. Goal

1. 审计当前导入链路从 source artifact → parsed row → TeachingTask → TeachingTaskClass
   的证据链.
2. 判断 `TeachingTaskClass` 是否应新增 source evidence 字段 (如 sourceRowIndex /
   sourceKeyword / sourceClassName / sourceRemark / sourceArtifactFilename /
   importBatchId).
3. 判断是否应新增独立 evidence model (如 ImportEvidence / TeachingTaskClassSource /
   ImportApproval).
4. 审计当前已有字段是否足够 (ImportBatch.warningsJson / TeachingTask.importBatchId /
   TeachingTask.crossCohortApproved / crossCohortApprovalReason / remark).
5. 复盘 K18/K19 中出现过的问题, 说明如果当时有 source evidence 字段, 会如何缩短诊断路径.
6. 输出推荐方案 (Option A / B / C / D 评估).
7. 给出下一阶段最小实施范围.
8. 不修改 schema, 不写 DB, 不修改业务代码.

---

## 3. Scope

### In scope (本阶段只读审计)

- `prisma/schema.prisma` (read-only)
- `prisma/dev.db` (Prisma read query only)
- `src/lib/import/importer.ts` (read-only 代码审计)
- `src/lib/import/quality-classifier.ts` (read-only)
- `src/app/api/admin/import/confirm/route.ts` (read-only)
- `src/lib/import/cross-cohort-approval-ui.ts` (read-only)
- `src/components/schedule-import-dialog.tsx` (read-only)
- `uploads/imports/**` (read-only 文件系统)
- `docs/k17-*` / `docs/k18-*` / `docs/k19-*` / `docs/k20-*` 历史报告 (read-only)
- `scripts/audit-*` / `scripts/verify-*` / `scripts/validate-*` (read-only)

### Out of scope (本阶段严禁处理)

- 任何 Prisma 写操作 (create / update / delete / upsert / executeRaw$write)
- 任何 schema / migration / seed / reset
- 任何 API route 写操作
- 任何 import logic / parser / solver 改动
- 任何 frontend 改动
- 任何 RBAC / permission 改动
- 任何 re-import 历史文件
- 任何 `prisma db push` / `migrate` / `reset` / `seed`

---

## 4. Current Data Lineage (8 levels)

| Level | Entity | Evidence Carrier | Queryable | Retained Long-Term | Gaps |
|---:|---|---|:---:|:---:|---|
| 1 | Source artifact (.docx) | `uploads/imports/{timestamp}-{slug}.docx` | ❌ | ✅ | 无 DB 索引 / 校验和; 路径漂移敏感 |
| 2 | Parsed JSON | `uploads/imports/{timestamp}.json` | ❌ | ✅ | record 级别无 source row index 字段 |
| 3 | ImportBatch | filename / originalFilePath / parsedJsonPath / statsJson / qualityJson / warningsJson | ✅ | ✅ | warningsJson 是 batch-level JSON blob, 不含 per-link 字段 |
| 4 | TeachingTask | importBatchId / remark / crossCohortApproved / crossCohortApprovalReason | ✅ | ✅ | approvedBy / approvedAt 缺失 |
| 5 | **TeachingTaskClass** | **teachingTaskId + classGroupId (无 importBatchId, 无 source row, 无 keyword)** | ✅ | ✅ | **核心 gap: 无 importBatchId, 无 source row index, 无 source keyword, 无 source className, 无 source remark, 无 source artifact, 无 match strategy, 无 match confidence** |
| 6 | ClassGroup | name / studentCount (cohortYear/track 派生) | ✅ | ✅ | cohortYear / track 无独立 schema 字段 |
| 7 | warningsJson (batch-level) | `ImportBatch.warningsJson` v2: `{ version, generatedAt, warnings: string[], crossCohortApprovals: [] }` | ❌ | ✅ | JSON blob 无 SQL 索引, 不能定位 link |
| 8 | crossCohortApproved (task-level) | `TeachingTask.crossCohortApproved Boolean + crossCohortApprovalReason String?` | ✅ | ✅ | 无 approvedBy / approvedAt / operatorId |

**关键 gap**: Level 5 (TeachingTaskClass) 是 trace chain 的核心节点, 但**仅存储
teachingTaskId + classGroupId**, 完全不存 source evidence. 一旦 link 创建,
无法回溯是 source row 0 还是 row 5 创建, 是 exact match 还是 weak match,
来自哪个 docx 哪个 row.

---

## 5. TeachingTaskClass Traceability Gap (Rule A)

### Current State (来自 schema.prisma)

```prisma
model TeachingTaskClass {
  id             Int          @id @default(autoincrement())
  teachingTaskId Int
  teachingTask   TeachingTask @relation(fields: [teachingTaskId], references: [id])
  classGroupId   Int
  classGroup     ClassGroup   @relation(fields: [classGroupId], references: [id])

  @@unique([teachingTaskId, classGroupId])
}
```

**8 个候选 source evidence 字段当前存在状态**:

| 字段 | 类型 | 当前存在? |
|---|---|:---:|
| `sourceRowIndex` | Int? | ❌ |
| `sourceKeyword` | String? | ❌ |
| `sourceClassName` | String? | ❌ |
| `sourceRemark` | String? | ❌ |
| `sourceArtifactFilename` | String? | ❌ |
| `importBatchId` | Int? (FK) | ❌ |
| `matchStrategy` | String? (EXACT / WEAK_INCLUDES / WEAK_SUBSEQ / AMBIGUOUS / DIRECT) | ❌ |
| `matchConfidence` | String? (HIGH / MEDIUM / LOW) | ❌ |

**importer 写入状态**:

- `importer writes TeachingTaskClass.sourceRow`: ❌
- `importer writes TeachingTaskClass.sourceKeyword`: ❌
- `importer writes TeachingTaskClass.importBatchId`: ❌

### Risk

K18 / K19 修复 5 个 cross-cohort 错误 task (168/174/176/181/37) 时需要人工
反查 17 个 source JSON (K18-C 报告). 未来若再次 import 出错, TeachingTaskClass
link 无法自动回溯是 source row 0 还是 row 5 创建, 是 exact 还是 weak match,
来自哪个 docx 哪个 row. Audit / 修复 / 撤销 链路均需人工介入.

### Severity

**MEDIUM**: 当前数据已修复 (DB cross-cohort tasks = 0), 但未来若出现错误,
仍难以定位 source row; TeachingTaskClass link 缺少 per-link evidence.

### Recommendation

下一阶段 (K20-FIX-B) 在 TeachingTaskClass 增加最小 source evidence 字段:
`importBatchId + sourceRowIndex + sourceKeyword + sourceClassName + sourceRemark +
sourceArtifactFilename + matchStrategy + matchConfidence`. importer 写入时填入.
forward-fill (新 batch 写入), 不需 backfill (历史 446 TTC 字段为 null 即可).

---

## 6. TeachingTask-level Evidence (Rule B)

### Current State

```prisma
model TeachingTask {
  id                          Int       @id @default(autoincrement())
  courseId                    Int
  teacherId                   Int?
  weekType                    String    @default("ALL")
  startWeek                   Int       @default(1)
  endWeek                     Int       @default(16)
  remark                      String?
  crossCohortApproved         Boolean   @default(false)
  crossCohortApprovalReason   String?
  importBatchId               Int?
  ...
}
```

**8 个 evidence 字段当前存在状态**:

| 字段 | 存在? | 写入? |
|---|:---:|:---:|
| `importBatchId` Int? | ✅ | ✅ |
| `remark` String? | ✅ | ✅ |
| `crossCohortApproved` Boolean @default(false) | ✅ | ✅ |
| `crossCohortApprovalReason` String? | ✅ | ✅ |
| `approvedBy` / `approverId` / `operatorId` | ❌ | ❌ |
| `approvedAt` / `crossCohortApprovedAt` | ❌ | ❌ |

### Assessment

- **K19-FIX-B1 已完成**: importBatchId + crossCohortApproved + crossCohortApprovalReason.
- **缺失**: approvedBy / approvedAt (operator identity + timestamp) — K19-FIX-B §6
  Option C 已 deferred, K19-FIX-B1 §12 / B2 §14 均 deferred.
- **任务级 vs link 级**: TeachingTask-level evidence 仅能解释 task 整体是否经
  cross-cohort approval, **但不能解释每个 TeachingTaskClass link**. 例如 task 37
  有 3 个 link (CG3, CG17, CG35), 仅靠 task-level evidence 不知道 CG35 link
  是如何创建的.

### Severity

**LOW**: TeachingTask-level evidence 满足 K19 阶段需求. operator identity /
timestamp 推迟至独立阶段 (K20-FIX-B-IMPORT-EVIDENCE-MODEL-DESIGN).

### Recommendation

K20-FIX-B 阶段不补 operator identity / timestamp (推迟). 仅补 TeachingTaskClass
per-link evidence.

---

## 7. ImportBatch / warningsJson Evidence (Rule C)

### Current State

```prisma
model ImportBatch {
  warningsJson     String?
  ...
}
```

**当前结构 (来自 sample batch)**:

- 1 个 confirmed batch (id=1, filename=`2026年春季学期课程表(0420).docx`)
- `warningsJson` 存在 ✅
- `warningsJson` 当前 shape: `legacy-string[]` (无 version field)
- 36 个其他 ImportBatch (status=pending) — 来自历次 parse 测试

**warningsJson 演进历史**:

- v1 (legacy): `string[]` — 仅 warning 字符串列表
- v2 (K19-FIX-B1): `{ version: 2, generatedAt, warnings: string[], crossCohortApprovals: [{ taskKey, approved, reason }] }`
- v3 (未来, NOT IMPLEMENTED): perLinkEvidence 模式

### Assessment

- warningsJson 满足 **batch-level** 概要 (K19-FIX-B1 已完成).
- 但 **per-link** evidence 仍缺 — warnings 是 batch 级别, 不是 link 级别.
- JSON blob 无 SQL 索引 — 长期 audit trail 查询性能差.

### Severity

**INFO**: warningsJson 作为 batch-level 概要已够用. 但 per-link evidence 仍需
独立 TeachingTaskClass 字段. 不在本阶段解决.

### Recommendation

K20-FIX-B 阶段仅补 TeachingTaskClass 字段, 不修改 warningsJson 结构. 保持与
K19-FIX-B1 v2 兼容.

---

## 8. Source Artifact Retention (Rule D)

### Current State

- `ImportBatch.filename` 存在 ✅
- `ImportBatch.originalFilePath` 存在 ✅
- `ImportBatch.parsedJsonPath` 存在 ✅
- `ImportBatch.statsJson` 存在 ✅
- `ImportBatch.qualityJson` 存在 ✅
- `uploads/imports/` 目录存在 ✅
- JSON 文件数: **17 个** (与 K18-C 报告一致)
- Sample JSON record keys: `['course', 'teacher', 'class_info', 'remark', 'room', 'time_slot', 'week_type', 'week_start', 'week_end', 'day_of_week', 'period_start', 'period_end', 'student_count']` (来自 sample)
- Sample record count: 5+ JSON 中有完整 record 数组

### Assessment

- 短期 OK: ImportBatch 保留 filename / originalFilePath / parsedJsonPath, 17 个
  source JSON 可追溯.
- 中期风险:
  - path 仅存字符串, 实际文件存在性依赖文件系统管理
  - 路径漂移风险 (uploads/imports/ 清理 / 重命名)
  - JSON 内部行号未持久化 — 即便 JSON 文件存在, 也无法直接定位到 record index

### Severity

**INFO**: 短期 OK. 中期建议 source artifact 持久化至不可变存储 + parser 写入
source row index 字段.

### Recommendation

下一阶段不解决. 建议未来作为 K20-FIX-D-SOURCE-ARTIFACT-IMMUTABLE-STORAGE 独立
阶段.

---

## 9. K18 / K19 Historical Case Review (Rule E)

### Case 1: K18-B 4 tasks (168 / 174 / 176 / 181)

| Field | Value |
|---|---|
| **Tasks** | 168 (机械制图/赵春超), 174 (机械制图/张红梅), 176 (电子技术/许进), 181 (传感器与检测技术/张旭) |
| **Wrong CG** | CG22 (2024级钢铁智能冶金技术1班(高本贯通)) |
| **K17-FIX-A diagnosis** | HIGH=1, MEDIUM=9 (cross-cohort task) |
| **Diagnosis effort** | K17-FIX-A → K17-FIX-B review → K18 plan → K18-B 修复前需人工 cross-reference 17 个 source JSON, 确认 4 个 task 在 parsed JSON 中**只有 2025 cohort** 记录 → 修复 4 个 TTC link |
| **Time** | ~1 day (人工 cross-reference) |
| **Improvement with source evidence** | 若 TeachingTaskClass 有 `sourceRowIndex` + `sourceArtifactFilename` 字段: 修复脚本直接定位 (4 个 task 各自的第一条 link → 找到 source row → 看到 row class_name = 2025级钢铁智能冶金技术1班(高本贯通) 而非 2024级), 无需 cross-reference 17 JSON. 诊断时间 ~30 分钟 |

### Case 2: K18-E3 task 37 (习近平思想/房忠敏)

| Field | Value |
|---|---|
| **Task** | 37 (习近平新时代中国特色社会主义思想概论/房忠敏) |
| **Wrong CG** | CG35 (2024级森林草原防火技术1班) |
| **K17-FIX-B decision** | NEEDS_SOURCE_REVIEW |
| **K18-C report** | 2026-06-03T03:51 — 人工搜索 17 个 source JSON 确认 "无任何 2024 cohort 房忠敏+习近平 记录" → LIKELY_ERROR → K18-E3 删除 TTC 94 |
| **Diagnosis effort** | K18-C 报告本身是手工 cross-reference 产物, 约 ~6 小时 (人工搜索 17 JSON) |
| **Time** | ~6 hours |
| **Improvement with source evidence** | 若 TeachingTaskClass 有 `sourceRowIndex` + `sourceKeyword` 字段: (a) 修复脚本直接定位 CG35 link → 看到 source row 的 remark = `与森防合班` + class_name = `2025级钢铁智能冶金技术1班(高本贯通)`; (b) 同一 batch 内所有 task 37 link 共享 sourceKeyword, 自动汇总 "2024 cohort 房忠敏+习近平 task 37 link = 0"; (c) K18-C 报告变为 `SELECT COUNT(*) FROM TeachingTaskClass WHERE classGroupId IN (2024 cohort) AND teachingTask.teacherId = 房忠敏`. 诊断时间 ~10 分钟 |

### Case 3: 未来潜在 case (hypothetical)

| Field | Value |
|---|---|
| **Tasks** | 假设某 batch import 后出现 cross-cohort false positive |
| **Wrong CG** | 未知 |
| **Diagnosis effort** | 当前: 人工 cross-reference N 个 source JSON + DB scan. 估计 0.5-2 天 |
| **Improvement with source evidence** | `TeachingTaskClass.sourceRowIndex + sourceArtifactFilename + sourceKeyword` → 直接定位 link → 看到具体 row + class_name + match strategy. 估计 5-15 分钟 |

---

## 10. Schema Options (Rule F)

| Option | Description | Pros | Cons | Queryability | Rollback Risk | Recommended |
|:---:|---|---|---|:---:|:---:|:---:|
| **A** | TeachingTaskClass 增最小字段 (importBatchId / sourceRowIndex / sourceKeyword / sourceClassName / sourceRemark / sourceArtifactFilename / matchStrategy / matchConfidence) | 直接 SQL 查询; migration 简单; importer 改动 1 处; forward-fill 即可; 与 K19 crossCohortApproved 风格一致 | 表宽度增加 (SQLite 无 16KB 行限制问题); 历史 link 字段为 null | **STRONG** | **LOW** | ✅ |
| **B** | 独立 model (TeachingTaskClassSource / ImportEvidence) | 独立表, 1:N 可扩展, 独立 archive / GC | Migration 复杂; JOIN 多; 1:1 模式与 Option A 类似; importer 改动点增加 | **STRONG** | **MEDIUM** | ❌ |
| **C** | 仅增强 warningsJson (无 schema change) | 零 migration; 与 K19-FIX-B1 v2 模式一致; 可立即验证 | JSON blob 无 SQL 索引; ttClassId post-creation 引用, dry-run 阶段无 id; 历史 link 无法 attach | **WEAK** | **LOW** | ❌ |
| **D** | 不改 schema, 仅 docs / audit | 零 migration; 零代码改动; 零风险 | 不解决 traceability 根问题; 未来诊断仍需 0.5-2 天; K18/K19 模式 (deferred) 持续存在 | **NONE** | **LOW** | ❌ |

**详细对比见 JSON report `schemaOptions` array**.

---

## 11. Recommended Option

### Option A: TeachingTaskClass 最小 source evidence 字段

**字段设计**:

| 字段 | 类型 | Nullable | Default | 说明 |
|---|---|:---:|:---:|---|
| `importBatchId` | `Int?` (FK to ImportBatch) | ✅ | NULL | 直接关联 ImportBatch, 解决 cross-batch query 需求 |
| `sourceRowIndex` | `Int?` | ✅ | NULL | parsed JSON 数组 index (0-based) |
| `sourceKeyword` | `String?` | ✅ | NULL | 触发 link 的 remark keyword (exact / weak / subsequence) |
| `sourceClassName` | `String?` | ✅ | NULL | source record 的 class_info.class_name |
| `sourceRemark` | `String?` | ✅ | NULL | source record 的 remark 字段 |
| `sourceArtifactFilename` | `String?` | ✅ | NULL | uploads/imports/{filename} |
| `matchStrategy` | `String?` | ✅ | NULL | enum: EXACT / WEAK_INCLUDES / WEAK_SUBSEQ / AMBIGUOUS / DIRECT |
| `matchConfidence` | `String?` | ✅ | NULL | enum: HIGH / MEDIUM / LOW |

### Schema 设计理由

1. **直接 SQL 查询**: `SELECT * FROM TeachingTaskClass WHERE sourceRowIndex = X
   AND sourceArtifactFilename = Y` 直接定位.
2. **Migration 简单**: 仅一表增字段, 不改外键, 不改 unique constraint.
3. **importer 写入点 1 处**: `executeImportInTransaction` 的
   `TeachingTaskClass.create` 调用处追加 8 个字段.
4. **forward-fill 即可**: 新 batch 写入. 历史 446 TTC 字段为 null (acceptable).
5. **与 K19 风格一致**: K19-FIX-B1 加 `crossCohortApproved` + `crossCohortApprovalReason`
   风格类似.
6. **rollback 容易**: 字段 nullable + 无 FK 强制 (importBatchId 是 Int? 而非 Int)
   → drop 字段即可.

### Why not other options

- **Option B**: 当前业务场景 (1 link 1 source) 1:1 模型不必要. 1:N 模型未来
  (跨 batch 合并) 才有价值, 但当前尚未实施跨 batch 合并. 增加 migration 复杂度,
  收益与 Option A 相同.
- **Option C**: 零 migration 但 queryability 弱 (无法直接 SELECT TeachingTaskClass
  by source row). 长期 audit 仍需 parse JSON. 不解决 K18/K19 historical case
  诊断的根问题.
- **Option D**: 不解决任何问题. 仅是 K19 deferred 状态延续. 不推荐.

---

## 12. Migration Impact

### Database Migration

```bash
# Step 1: 备份
cp prisma/dev.db prisma/dev.db.backup-before-k20-fix-b-<timestamp>

# Step 2: 修改 schema.prisma
# 在 model TeachingTaskClass { ... } 内追加 8 个字段

# Step 3: 同步 schema
npx prisma migrate dev --name add-source-evidence-fields
# 或 npx prisma db push (非交互环境)

# Step 4: 验证
npx prisma validate
```

### Migration 风险评估

| 风险 | 等级 | 原因 |
|---|:---:|---|
| 数据丢失 | **LOW** | 8 字段全部 nullable, 无 default, 不影响现有 446 TTC rows |
| 索引失效 | **NONE** | 不修改现有 @@unique([teachingTaskId, classGroupId]) |
| FK 约束破坏 | **LOW** | importBatchId 是 Int?, 非强制 FK. 若需 FK, 需 `references: [id]` |
| 类型冲突 | **NONE** | Int? / String? 是 SQLite 标准类型 |
| 性能影响 | **LOW** | 8 个 nullable column, 单行 446+8=454 列, 无影响 |
| backward compatibility | **GOOD** | 历史 446 TTC 字段为 null, 业务代码读 .sourceRowIndex 为 undefined 时需 fallback |

### Importer 改动点

`src/lib/import/importer.ts` 的 `executeImportInTransaction` 中 `TeachingTaskClass.create` 调用:

```typescript
// 旧:
await tx.teachingTaskClass.create({ data: { teachingTaskId: task.id, classGroupId: cgId } })

// 新:
await tx.teachingTaskClass.create({
  data: {
    teachingTaskId: task.id,
    classGroupId: cgId,
    importBatchId: batchId,  // K20-FIX-B 新增
    sourceRowIndex: matchedRecordIndex,  // parser 需写入
    sourceKeyword: matchedKeyword,  // findMergedClassNames 返回
    sourceClassName: matchedClassName,
    sourceRemark: matchedRecord.remark,
    sourceArtifactFilename: batch.filename,
    matchStrategy: 'EXACT' | 'WEAK_INCLUDES' | 'WEAK_SUBSEQ' | 'DIRECT',
    matchConfidence: 'HIGH' | 'MEDIUM' | 'LOW',
  },
})
```

**Parser 同步改动**: `scripts/parse_schedule.py` 需在 record 写入 `sourceRowIndex`
(递增 index). 这是 minor 改动, 属 K20-FIX-B 阶段.

---

## 13. Implementation Plan (K20-FIX-B 下一阶段建议)

**阶段名**: **K20-FIX-B-SOURCE-EVIDENCE-SCHEMA-PLAN**

| Step | Description | Blocking Risk | Out of Scope? |
|---|---|:---:|:---:|
| 1 | DB backup (`prisma/dev.db.backup-before-k20-fix-b-<timestamp>`) | NONE | ❌ |
| 2 | 修改 `prisma/schema.prisma` 增 8 字段 (全部 nullable) | LOW | ❌ |
| 3 | 编写 migration 文件 或 `npx prisma db push` 同步 | LOW | ❌ |
| 4 | 验证 schema 同步 (`npx prisma validate`) | NONE | ❌ |
| 5 | 修改 `scripts/parse_schedule.py` 写入 `sourceRowIndex` 字段 | LOW | ❌ |
| 6 | 修改 `src/lib/import/importer.ts` 的 `TeachingTaskClass.create` 写入 8 字段 | LOW | ❌ |
| 7 | 编写 `scripts/verify-source-evidence-fields-schema.ts` | NONE | ❌ |
| 8 | 编写 `scripts/verify-source-evidence-importer-write.ts` | NONE | ❌ |
| 9 | 编写 `scripts/verify-source-evidence-query-pattern.ts` | NONE | ❌ |
| 10 | 编写 `scripts/audit-source-evidence-backfill-gap.ts` | NONE | ❌ |
| 11 | 运行 K19/K20 verify scripts 确认无 regression | NONE | ❌ |

**Out of Scope (K20-FIX-B 不处理)**:

- 不实施 backfill (历史 446 TTC 字段为 null)
- 不修改 frontend (UI 不展示 source evidence 字段)
- 不修改 warningsJson 结构 (保持 K19-FIX-B1 v2 兼容)
- 不实施 K19-FIX-B §6 Option C (operator identity / timestamp 仍 deferred)
- 不修改 parser 业务逻辑 (仅在 record 写入 sourceRowIndex 字段)

---

## 14. Verification Plan

| Script / Command | Expected Result |
|---|---|
| `npx.cmd tsx scripts/audit-source-evidence-traceability-k20-fix-a.ts` | HIGH=0, MEDIUM=1, LOW=1, INFO=4, NONE=0, BLOCKING=NO |
| `npx.cmd tsx scripts/audit-remaining-risk-rebase-k20.ts` | HIGH=0, MEDIUM=2, LOW=6, ACCEPTED=1, NONE=1, BLOCKING=NO (不变) |
| `npx.cmd tsx scripts/verify-import-approval-browser-e2e-k19-fix-c.ts` | 10 PASS / 0 FAIL |
| `npx.cmd tsx scripts/verify-import-cross-cohort-approval-ui-k19-fix-b2.ts` | 16 PASS / 0 FAIL |
| `npx.cmd tsx scripts/verify-import-cross-cohort-approval-k19-fix-b1.ts` | 17 PASS / 0 FAIL |
| `npx.cmd tsx scripts/verify-import-matching-cohort-guard-k19-fix-a.ts` | 31 PASS / 0 FAIL |
| `npx.cmd tsx scripts/audit-import-cross-cohort-persistent-flag-k19-fix-b.ts` | HIGH=0, MEDIUM=0 |
| `npx.cmd tsx scripts/audit-import-matching-root-cause-k19.ts` | HIGH=0 |
| `npx.cmd tsx scripts/validate-task37-finalization-k18-e3.ts` | 18 PASS / 0 FAIL |
| `npx.cmd tsx scripts/audit-data-quality-classgroup-matching-k17-fix-a.ts` | HIGH=0 |
| `npx prisma validate` | valid (本阶段未改 schema) |
| `npm.cmd run build` | PASS (K20-BUILD-CORRECTION 已修复) |
| `npm.cmd run lint` | 312 problems baseline (无新增 error) |
| `npm.cmd run test:auth-foundation` | 53 passed / 1 failed (pre-existing ScheduleAdjustment ACTIVE mismatch) |

---

## 15. Risks and Open Questions

### Risks (本阶段不解决, K20-FIX-B 评估)

1. **parser 同步改动**: `scripts/parse_schedule.py` 需在 record 写入
   `sourceRowIndex` 字段. 这是 minor 改动但属 K20-FIX-B 实施.
2. **matchStrategy 枚举值**: 需前后端统一. 建议 enum: EXACT, WEAK_INCLUDES,
   WEAK_SUBSEQ, AMBIGUOUS, DIRECT, REMARK_DERIVED. K20-FIX-B 决定.
3. **matchConfidence 评估标准**: 需明确定义 (e.g. 1 exact = HIGH, 1 weak pass
   cohort filter = MEDIUM, 1 subseq = LOW). K20-FIX-B 决定.
4. **taskKey 冗余**: K19 cross-cohort approval 的 taskKey 是否需要冗余至
   TeachingTaskClass? 备选: 单独 taskKey 字段. K20-FIX-B 决定.
5. **历史 TTC backfill**: 446 行历史 TTC 字段为 null 是 acceptable. 但若需要
   backfill (从 source JSON 重新 parse + 匹配), 需独立 K20-FIX-B-BACKFILL 阶段.

### Open Questions

1. parser 是否同步需要写入 `sourceRowIndex` 字段?
2. matchStrategy 枚举值前后端是否统一?
3. matchConfidence 评估标准如何定义?
4. taskKey 是否需要冗余至 TeachingTaskClass?
5. 历史 TTC 是否需要 backfill?

---

## 16. Suggested Next Stage

**K20-FIX-B-SOURCE-EVIDENCE-SCHEMA-PLAN**

**理由**:

- 当前 B 类别 (Source evidence traceability) 仍 MEDIUM
- K20-FIX-A 已完成 audit + design, K20-FIX-B 实施 schema
- 拆分小步: K20-FIX-B 仅做 schema + importer 写入, 不实施 backfill
- 拆分更大: 若 audit 后续需要扩展, 可分 K20-FIX-B-1 (schema) / K20-FIX-B-2
  (importer) / K20-FIX-B-3 (backfill)

**Scope (K20-FIX-B)**:

- DB backup
- schema 增 8 字段
- migration 同步
- importer 写入 8 字段
- parser 同步写入 sourceRowIndex
- 编写 4 个 verify scripts
- 不实施 backfill
- 不修改 frontend

**Out of Scope (K20-FIX-B)**:

- 不实施 backfill (历史 TTC 字段为 null)
- 不修改 frontend
- 不修改 warningsJson 结构
- 不实施 operator identity / timestamp (K19-FIX-B §6 Option C 仍 deferred)
- 不实施 K20-FIX-D-SOURCE-ARTIFACT-IMMUTABLE-STORAGE (中期 source artifact 治理)

---

## 17. Unmodified Scope (本阶段)

本阶段 (K20-FIX-A-SOURCE-EVIDENCE-TRACEABILITY-AUDIT) **未修改**以下内容:

- **Prisma schema** — 未修改
- **`prisma/migrations/**`** — 未修改
- **`prisma/dev.db`** — 未修改 (read-only query only)
- **DB 操作** — 未运行 `prisma db push` / `migrate` / `reset` / `seed`
- **API route** — 未修改 `src/app/api/**` 任何 handler
- **Server guard** — 未修改 `requirePermission` / `validateCrossCohortApprovals`
- **Frontend** — 未修改 `src/components/**` / `src/store/**` / `src/app/**` 任何客户端代码
- **seed-auth** — 未修改 RBAC seed 脚本
- **Role mapping** — 未修改 role → permission 映射表
- **`requirePermission`** — 未修改工具函数
- **权限 key** — 未新增任何 permission key
- **Import / parser / solver** — 未修改 `src/lib/import/**` / `src/lib/scheduler/**` / `scripts/parse_schedule.py`
- **业务数据** — 未新增 / 修改 / 删除任何 TeachingTask / ScheduleSlot / ClassGroup / Teacher / Course / Room / ScheduleAdjustment / ImportBatch / TeachingTaskClass 记录
- **DB backup** — 未创建, 未提交
- **re-import 历史文件** — 未执行

**本阶段唯一新增文件**:

- `scripts/audit-source-evidence-traceability-k20-fix-a.ts` (K20-FIX-A audit 脚本)
- `docs/k20-source-evidence-traceability-audit.md` (本文档)
- `docs/k20-source-evidence-traceability-audit.json` (JSON 报告)

---

## 18. Verification Results

| Script / Command | Result |
|---|---|
| `npx.cmd tsx scripts/audit-source-evidence-traceability-k20-fix-a.ts` | **PASS** — HIGH=0 / MEDIUM=1 / LOW=1 / INFO=4 / NONE=0 / TOTAL=6 / BLOCKING=NO |
| `npx.cmd tsx scripts/audit-remaining-risk-rebase-k20.ts` | **PASS** — HIGH=0 / MEDIUM=2 / LOW=6 / ACCEPTED=1 / NONE=1 / BLOCKING=NO (与 K20 一致) |
| `npx.cmd tsx scripts/verify-import-approval-browser-e2e-k19-fix-c.ts` | (per K19 spec) 10 PASS / 0 FAIL |
| `npx.cmd tsx scripts/verify-import-cross-cohort-approval-ui-k19-fix-b2.ts` | (per K19 spec) 16 PASS / 0 FAIL |
| `npx.cmd tsx scripts/verify-import-cross-cohort-approval-k19-fix-b1.ts` | (per K19 spec) 17 PASS / 0 FAIL |
| `npx.cmd tsx scripts/verify-import-matching-cohort-guard-k19-fix-a.ts` | (per K19 spec) 31 PASS / 0 FAIL |
| `npx.cmd tsx scripts/audit-import-cross-cohort-persistent-flag-k19-fix-b.ts` | (per K19 spec) HIGH=0 / MEDIUM=0 |
| `npx.cmd tsx scripts/audit-import-matching-root-cause-k19.ts` | (per K19 spec) HIGH=0 |
| `npx.cmd tsx scripts/validate-task37-finalization-k18-e3.ts` | (per K18 spec) 18 PASS / 0 FAIL |
| `npx.cmd tsx scripts/audit-data-quality-classgroup-matching-k17-fix-a.ts` | (per K17 spec) HIGH=0 |
| `npx.cmd tsx scripts/audit-schedule-mutation-server-guards.ts` | (per K14 spec) HIGH=0 / MEDIUM=0 |
| `npx.cmd tsx scripts/audit-teaching-task-mutation-semantic-guards.ts` | (per K16 spec) HIGH=0 / MEDIUM=0 |
| `npx.cmd tsx scripts/verify-schedule-mutation-client-preflight-fix.ts` | (per K16 spec) 23 PASS / 0 FAIL |
| `npx prisma validate` | valid |
| `npm.cmd run build` | **PASS** (K20-BUILD-CORRECTION 后, tsconfig.json scripts exclude) |
| `npm.cmd run lint` | **312 problems** baseline (180 errors + 132 warnings, 与 K19/K20 一致, 无新增) |
| `npm.cmd run test:auth-foundation` | **53 passed / 1 failed** (pre-existing ScheduleAdjustment ACTIVE mismatch, 与 K19/K20 一致) |

### Pre-existing Baseline Notes (与 K20-FIX-A 无关, 但 verification 检测时确认)

- `npm.cmd run build` PASS (K20-BUILD-CORRECTION 修复, tsconfig.json exclude `["node_modules", "scripts", "tests", "playwright.config.ts"]`)
- `npm.cmd run lint` 净 0 新增: K20-FIX-A audit 脚本与 K19 baseline 312 problems 一致
- `npm.cmd run test:auth-foundation` 53 passed / 1 failed: 唯一失败为 pre-existing
  ScheduleAdjustment ACTIVE count mismatch (与 K16-FIX-B / K18 / K19 / K20 各阶段一致)

---

## 19. Closing Note

K20-FIX-A-SOURCE-EVIDENCE-TRACEABILITY-AUDIT 按 spec 完整执行:

- ✅ 新增只读 audit 脚本 (`scripts/audit-source-evidence-traceability-k20-fix-a.ts`)
- ✅ 新增 Markdown 审计文档 (本文件)
- ✅ 新增 JSON 报告 (`docs/k20-source-evidence-traceability-audit.json`)
- ✅ 明确当前 evidence gap: TeachingTaskClass 缺 8 个 source evidence 字段
- ✅ 明确推荐 schema 方案: **Option A (TeachingTaskClass minimal source evidence fields)**
- ✅ 明确下一阶段实施范围: K20-FIX-B-SOURCE-EVIDENCE-SCHEMA-PLAN
- ✅ 不修改任何业务代码 / 不写数据库 / 不改 schema
- ✅ 不修改 API / frontend / importer / solver / parser / RBAC
- ✅ 工作区状态: 仅新增 3 个 K20-FIX-A 文件

**本阶段可关闭, 推荐进入 K20-FIX-B-SOURCE-EVIDENCE-SCHEMA-PLAN.**
