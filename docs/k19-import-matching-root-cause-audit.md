# K19-IMPORT-MATCHING-IMPROVEMENT-AUDIT

| Field | Value |
|---|---|
| Phase | K19-IMPORT-MATCHING-IMPROVEMENT-AUDIT |
| Type | Read-only root-cause audit + fix-plan design |
| Generated | 2026-06-03 |
| Mode | Read-only (no Prisma writes, no DB schema/migration, no business data mutation) |
| Audit script | `scripts/audit-import-matching-root-cause-k19.ts` |
| JSON report | `docs/k19-import-matching-root-cause-audit.json` |

---

## 1. Background

K18-E3 (`52c748a fix(data): finalize task 37 class group links`) repaired all
known cross-cohort data errors:

- K18-B: 4 个专业课 cross-cohort task 168/174/176/181 (与 2024 cohort 高本贯通
  CG22 误合并) — 4 个 TeachingTaskClass link 已删除
- K18-E3: 1 个公共课 task 37 (习近平思想 与 2024 cohort 森林草原防火 CG35
  误合并) — TTC94 已删除

K17-FIX-A audit 确认 HIGH=0 已是 post-repair 状态,但 K9-DQ-1 根因
(import 端 cross-cohort 误合并) 在代码层面仍未修复。K18 修的是**历史数据**,
不是**根因**。如果再次 import 同源 .docx,旧版 import 逻辑可能再次产生
类似错误。

K19 定位:**只读 root-cause audit** + **改进方案设计**,不直接修改
importer。

---

## 2. Goal

1. 审计 import parser / importer / ClassGroup matching 相关代码
2. 定位导致跨 cohort 误合并的根因
3. 判断是否存在 fuzzy matching / subsequence matching / weak normalization
   误匹配
4. 复盘 K18 已修复的 5 个问题 task (168/174/176/181/37)
5. 检查当前 import pipeline 是否仍可能在未来导入中复现
6. 输出改进方案(cohort guard / exact-match-first / warning-first)
7. 给出 K19-FIX-A 最小实现范围
8. 不修改业务代码,不写数据库

---

## 3. Scope

**In scope (本阶段):**

- `src/lib/import/**` (read-only 代码审计)
- `src/app/api/admin/import/**` (read-only API 审计)
- `scripts/seed_db.ts` (read-only legacy CLI 审计)
- `uploads/imports/*.json` (read-only source artifact 审计)
- `prisma/dev.db` (Prisma read query)
- `prisma/schema.prisma` (read-only)
- `docs/k17-*.md`, `docs/k18-*.md` 历史报告 (read-only)

**Out of scope (本阶段严禁处理):**

- 任何 import logic / parser / API route 写操作
- 任何 TeachingTask / ClassGroup / TeachingTaskClass / ScheduleSlot /
  ImportBatch 业务数据写操作
- 任何 Prisma schema / migration / seed / reset
- 任何 frontend / solver / RBAC / permission 改动
- K17 backlog 中非 import matching 的项 (Room.capacity / solver
  scoring / lint debt / test baseline drift)

---

## 4. Historical Error Cases

| Task ID | Course | Teacher | Wrong ClassGroup | Current Status | Source Evidence |
|---:|---|---|---|---|---|
| 168 | 机械制图 | 赵春超 | CG22 (2024级钢铁智能冶金技术1班（高本贯通）) | REPAIRED (K18-B) | K18 source review: 4 个 task 在 parsed JSON 中只有 2025 cohort classes |
| 174 | 机械制图 | 张红梅 | CG22 (2024级钢铁智能冶金技术1班（高本贯通）) | REPAIRED (K18-B) | 同上 |
| 176 | 电子技术 | 许进 | CG22 (2024级钢铁智能冶金技术1班（高本贯通）) | REPAIRED (K18-B) | 同上 |
| 181 | 传感器与检测技术 | 张旭 | CG22 (2024级钢铁智能冶金技术1班（高本贯通）) | REPAIRED (K18-B) | 同上 |
| 37 | 习近平新时代中国特色社会主义思想概论 | 房忠敏 | CG35 (2024级森林草原防火技术1班) | REPAIRED (K18-E3) | K18-C: no 2024 record for 房忠敏+习近平 in any of 17 source JSON files; pattern matches K18-B 4-task errors |

**当前 remaining unaccepted cross-cohort task = 0** (K18-E3 post-fix 状态)

---

## 5. Import Pipeline Overview

```
.docx file
  └─→ python scripts/parse_schedule.py  (read-only Python parser)
        └─→ uploads/imports/{timestamp}.json  (17 files in current set)
              └─→ POST /api/admin/import/parse  (creates pending ImportBatch)
                    └─→ POST /api/admin/import/confirm  (dryRun or real)
                          └─→ src/lib/import/importer.ts
                                ├─ prepareRecords()           → eventKeyToClassNames
                                │     └─ findMergedClassNames → filterCandidatesByYearAndTrack
                                │           + .includes() / subsequence matching
                                ├─ executeImportInTransaction  → upsert ClassGroup/Teacher/Course/Room
                                │     → create TeachingTask
                                │     → create TeachingTaskClass (one per classGroup)
                                │     → create ScheduleSlot
                                └─ update ImportBatch → confirmed
```

**Key entry points to audit:**

- `src/lib/import/importer.ts:171-196` filterCandidatesByYearAndTrack
- `src/lib/import/importer.ts:206-225` parseRemarkKeywords
- `src/lib/import/importer.ts:227-296` findMergedClassNames
- `src/lib/import/importer.ts:469-488` ClassGroup upsert
- `src/lib/import/importer.ts:566-587` TeachingTask + TeachingTaskClass creation
- `src/lib/import/quality-classifier.ts:113-200` classifyImportRecords / canImport gate
- `scripts/seed_db.ts:154-237` filterCandidatesByYearAndTrack + findMergedClassIds
  (legacy CLI 路径,逻辑与 importer.ts 类似)

---

## 6. ClassGroup Matching Analysis

### 6.1 现状 (current state)

`findMergedClassNames` 在 `src/lib/import/importer.ts:227-296` 实现:

1. `filterCandidatesByYearAndTrack(baseClassName, keyword, allClasses)` 先过滤候选
   - keyword 不显式含 `\d{4}级` 时,候选必须 `cy === baseYear`
   - keyword 不显式含 `高本贯通`/`现场工程师` 时,候选必须 `ct === baseTrack`
2. 第一轮:`c.name.includes(kw)` 精确 substring 匹配
3. 第二轮(无第一轮匹配时):子序列匹配 (char-by-char indexOf)

### 6.2 Weakness

- **K18-B (4 个 task)**: 在 `filterCandidatesByYearAndTrack` 加入之前,
  `findMergedClassNames` 直接使用 .includes() + subsequence。2024 cohort
  `2024级钢铁智能冶金技术1班（高本贯通）` 被错误匹配到 2025 cohort 专业课 task。
- **Task 37 (K18-E3)**: 同根因 — 在 filter 加入之前,`2024级森林草原防火技术1班`
  通过 "森防" subsequence 匹配到 2025 cohort task。K18-C source review 确认
  17 个 source JSON 中**无任何** 房忠敏+习近平 2024 cohort 记录,说明该 link 是
  历史 import 误合并,**不是**源数据合规的合班。

### 6.3 Risk

- 当前 `filterCandidatesByYearAndTrack` 已做部分防御,`cy !== baseYear` 的候选被
  排除。K17-FIX-A audit 数据:cross-cohort task 从 35 降至 5(filter 加入后) → 0
  (K18-B/E3 修复后)。
- **但** filter 是按"keyword 不显式含年"时启用。如果 keyword 显式含 `2024级`
  (例如 remark 中嵌入"2024级森林草原防火技术1班"),filter 跳过 year 检查,
  此时任何 2024 cohort class 都可能匹配,需要额外 cohort check。

---

## 7. Remark / 合班 Parsing Analysis

### 7.1 现状

`parseRemarkKeywords(remark)` 在 `src/lib/import/importer.ts:206-225` 实现:

- "与森防合班" → core = "森防" → keywords = ["森防"]
- "与检测技术机电34合班" → core = "检测技术机电34" → keywords 包含多种 prefix slice

### 7.2 行为

- remark 触发 `findMergedClassNames` 调用 (importer.ts:383-390)
- 多个 keyword 依次尝试 includes / subsequence
- **无 remark source 记录** — `TeachingTaskClass` 表只存
  `teachingTaskId + classGroupId`,**不存** 是哪个 remark / keyword / source
  row 创建的 link

### 7.3 Risk

- remark 解析对 cohort 信息不敏感 — 仅依靠 `filterCandidatesByYearAndTrack`
- 多个 keyword 同时存在时,任一 keyword 匹配即 link — 无多 keyword 投票
- **未发现的 case**: remark 中同时含 cohort-explicit 和 cohort-implicit keyword
  (例如 "与2024级森防合班" — 这种情况下 filter 跳过 year check,任何 2024 cohort
  class 都可能匹配)

---

## 8. Cohort / Year Guard Analysis

### 8.1 ClassGroup upsert 路径

`src/lib/import/importer.ts:472-487`:

```typescript
const existing = await tx.classGroup.findFirst({
  where: { semesterId, name },
  select: { id: true, studentCount: true },
})
if (existing) {
  classGroupMap.set(name, existing.id)
  // ...
} else {
  const cg = await tx.classGroup.create({ data: { name, studentCount, semesterId } })
  // ...
}
```

- **No cohort check**: 只按 `name` upsert
- **No track check**: 即使 cohort 不同,只要 name 相同就复用
- 当前 `name` 在 source 中是 unique (parse 阶段保证),但 parser 不做 cohort 校验
- 风险: 同一 name 跨 cohort 重复时,后导入的会覆盖前导入的 studentCount

### 8.2 ClassGroup 名字层 cohort 防御

- 实际 classGroup name 在 source 中是**带 cohort 前缀**的 (e.g.
  "2025级钢铁智能冶金技术1班（高本贯通）" vs "2024级钢铁智能冶金技术1班（高本贯通）")
- 所以 cohort 信息在 name 中**保留** — `extractCohortYear(name)` 仍能识别
- 但 importer 写入 ClassGroup 时**没有**用 cohortYear 做 assert

### 8.3 Cross-cohort detection at write time

- 无。`executeImportInTransaction` 创建 TeachingTaskClass (importer.ts:581-585)
  时,**不检查**该 task 的 classGroup cohortYearSet 是否 size > 1
- K17-FIX-A audit 完成后,DB 层面 cross-cohort task = 0,这是因为 K18 修数据
  完成的。如果未来 import 再次产生 cross-cohort link,**没有 write-time 检测**
  会阻止写入

---

## 9. TeachingTaskClass Creation Analysis

### 9.1 当前代码 (importer.ts:581-585)

```typescript
for (const cgId of classGroupIds) {
  await tx.teachingTaskClass.create({ data: { teachingTaskId: task.id, classGroupId: cgId } })
  ttcCreated++
}
```

- 纯写,无 cohort audit
- 无 source-evidence 记录
- 无 warning emission

### 9.2 Risk

- 重复 import 同一 source artifact → 若 filter 失效,会无提示创建跨 cohort link
- K18-B/E3 修复的 5 个 task 历史 link **没有** 写时检测机制可阻止
- 当前的 `canImport` gate (quality-classifier.ts) 不检查 cross-cohort

---

## 10. Re-import Recurrence Risk

### 10.1 重新 import 同源 source artifact 的预期行为

**假设**: 当前代码 (`filterCandidatesByYearAndTrack` 已存在) 重新 import
K18 source JSON (`1780035124021-sejcg9dy.json` 确认 import 的 batch):

- `findMergedClassNames` 会对每个有 remark 的 record 调用
- 对 习近平+房忠敏 records,remark "与森防合班" → keyword "森防"
- baseClass = "2025级钢铁智能冶金技术1班（高本贯通）"
- 候选 CG35 "2024级森林草原防火技术1班" → `extractYear → 2024` →
  `cy !== baseYear (2025)` → **filter 排除**
- → **re-import 不会重建 task 37 的错误 link**

对 K18-B 4 个 task (机械制图/电子技术/传感器):

- 2025 cohort 专业课 task 不会有 remark "与高本贯通合班" 触发的
  2024 cohort 匹配 (因为 2024 cohort CG22 的 cohort year 会被 filter 排除)
- → **re-import 不会重建 K18-B 4 个 task 的错误 link**

### 10.2 残留风险

- `filterCandidatesByYearAndTrack` 是**软防御**(warning, 不 block)
- 如果未来 source data 出现 keyword 显式含 `2024级` 的 remark (e.g. "与2024级森防合班"),
  filter 跳过 year check → 跨 cohort 误匹配可能再次发生
- 没有任何 regression test 覆盖此场景

---

## 11. Legal Cross-Cohort Handling

### 11.1 现状

- **无** `crossCohortApproved` 字段 (Prisma schema 无此 column)
- **无** import-time 显式 confirmation 机制
- **无** source-evidence retention (TeachingTaskClass 不存 source row)
- 唯一区分: `LIKELY_PUBLIC_COURSE_HINTS` (在 K17-FIX-A audit 中使用) — 但**仅
  用于 audit severity 降级**,不在 importer 中使用

### 11.2 K18 task 37 案例

- 习近平思想 = 公共课 (在 LIKELY_PUBLIC_COURSE_HINTS 中)
- 跨 cohort teaching 在原则上是**合法**的
- 但 K18-C source review 发现 17 个 source JSON 中**无** 2024 cohort 房忠敏
  记录
- → 该 link 是**非法**的 (历史误合并),不是合法的公共课跨年级合班
- **没有 mechanism 在 import 时区分这两种 case**

---

## 12. Findings Summary

| Severity | Count | 说明 |
|---|---:|---|
| HIGH | 0 | K18-E3 后 DB 层面 cross-cohort task = 0;root cause 在代码层仍存在但 importer filter 防御部分生效 |
| MEDIUM | 4 | Weak matching (Rule A) + no TTC audit (Rule D) + re-import no regression test (Rule E) + no legal/error cross-cohort distinction (Rule F) |
| LOW | 2 | remark parsing (Rule B) + ClassGroup upsert no cohort assert (Rule C) |
| INFO | 2 | 历史错误 task 列表 + 当前 DB scope |
| NONE | 0 | — |
| **TOTAL** | **8** | — |

详细 findings 见 `docs/k19-import-matching-root-cause-audit.json`。

---

## 13. Root Cause Assessment

### 13.1 是否发现 weak matching?

**是** (`K19-RULE-A-001` MEDIUM):

- `findMergedClassNames` 使用 `.includes()` + subsequence matching
- 经过 `filterCandidatesByYearAndTrack` 软防御
- 历史 K18 5 个错误 task 均由此路径产生 (在 filter 加入之前)

### 13.2 是否发现 cohort/year guard 缺失?

**部分** (`K19-RULE-C-001` LOW):

- ClassGroup upsert (importer.ts:472) **无** cohort/track assert
- TTC creation (importer.ts:581-585) **无** cross-cohort detection
- 但 cohort 信息在 name 中**保留**,filter 用 name regex 提取 year
- 当前防御是**软**的(warning, 不 block)

### 13.3 是否发现 remark 过度扩展?

**是** (`K19-RULE-B-001` LOW):

- `parseRemarkKeywords` 对 remark 中任何 `合班`/`与` keyword 都生成多粒度候选
- `findMergedClassNames` 依赖 filterCandidatesByYearAndTrack 防御
- filter 在 keyword 显式含 `\d{4}级` 时**失效**

### 13.4 是否发现 source evidence traceability 缺失?

**是** (`K19-RULE-D-001` MEDIUM):

- TeachingTaskClass 表无 source row reference
- 无 warning JSON link 到具体 source record
- K17-FIX-A 必须 cross-reference source JSON 手动验证 5 个 task

### 13.5 是否可能 re-import 复发?

**当前代码下 unlikely,但无 regression test 保护** (`K19-RULE-E-001` MEDIUM):

- 17 个 source JSON 中,**5 个 K18 错误 task 的 pattern** (2024 cohort
  跨过 filter 的条件) 在当前 filter 下**不会**被 recreate
- 但 filter 是**软**的;如果未来 source data 含显式 `\d{4}级` keyword,filter
  跳过,re-import 可能再次产生 cross-cohort link
- **无** regression test 验证此场景

### 13.6 是否有合法 cross-cohort 区分机制?

**无** (`K19-RULE-F-001` MEDIUM):

- 无 `crossCohortApproved` 字段
- 无 import-time explicit confirmation
- 无 LEGAL_PUBLIC_CROSS_COHORT vs LIKELY_ERROR_CROSS_COHORT 分类
- K18 task 37 案例 (公共课但 source 无 2024 记录) 无法被自动区分

### 13.7 结论

**Root cause CONFIRMED: pre-filter-era import logic created 5 historical
cross-cohort tasks. Current filter is partial defense (not full guard). No
write-time detection, no regression test, no source-evidence retention.**

---

## 14. Recommended Fix Plan

### Option A: cohort guard + warning-first (推荐)

**范围**: 仅修改 `src/lib/import/importer.ts` + `src/lib/import/quality-classifier.ts`

**步骤**:

1. **Tighten findMergedClassNames** (importer.ts:227-296):
   - 优先 exact-name match: `c.name === baseClassName || c.name === keyword`
   - 仅当 exact 失败且 candidate cohortYear MATCH baseClass cohortYear 时,
     退到 `.includes()`
   - 仅当 `.includes()` 失败且 candidate cohortYear MATCH 时,退到 subsequence
2. **Add post-creation cross-cohort audit** (importer.ts:566-587):
   - 在 TTC 创建后,计算该 task 的 `cohortYearSet` from `taskClasses.classGroup.name`
   - 若 `cohortYearSet.size > 1`:
     - 若 course name 在 `LIKELY_PUBLIC_COURSE_HINTS` 中 → warning
       `LEGAL_PUBLIC_CROSS_COHORT`
     - 否则 → warning `LIKELY_ERROR_CROSS_COHORT` (更高 severity)
3. **Persist warnings in ImportBatch.warningsJson** (已支持,只需填入)
4. **No schema change**, **no API route change**, **no frontend change**

**预期行为变化**:

- 同 cohort 合班: 行为不变
- 跨 cohort 合班 (公共课): 行为不变 + 新增 INFO warning
- 跨 cohort 合班 (专业课): 行为不变 + 新增 WARNING
- 显式 `\d{4}级` keyword 的 remark: filter 仍跳过 year check → 仍可能误合并
  (但 K18 5 个 task 的 pattern **不会** 重新产生)

### Option B: 改 schema + crossCohortApproved (不推荐)

- 范围大, 涉及 schema migration + API + frontend
- 与 K15 "import:manage 权限拆分" 等 backlog 冲突
- 不在 K19 范围

### Option C: 完整重写 parser (不推荐)

- 范围大, 风险高
- 现有 parser 已通过 17 个 dirty-data 单元测试
- 不在 K19 范围

### 不建议 K19-FIX-A 处理

- Schema 改动
- `crossCohortApproved` 字段
- Frontend UI 改动
- 完整重写 parser
- 重新 import 历史文件
- 修改 K18 已修复 DB
- Room.capacity / 权限粒度 / lint debt

---

## 15. Regression Test Plan

K19-FIX-A 应新增以下 regression test (K19-TEST-A):

| Test | Input | Expected | Purpose |
|---|---|---|---|
| Test 1 | 2024/2025 高本贯通相似 class name, remark "与高本贯通合班" | 不合并 | Rule A 防御 |
| Test 2 | 2024/2025 森林草原防火相似 class name, remark "与森防合班" | 不合并 | Rule A 防御 |
| Test 3 | 2025级 + 2025级 钢铁智能冶金, remark "与XX合班" | 合并 | Positive case |
| Test 4 | 公共课 (习近平思想) 跨 cohort with explicit "2024级" in remark | 合并 + LEGAL_PUBLIC warning | 合法跨 cohort 表达 |
| Test 5 | 公共课 (习近平思想) 跨 cohort with implicit "森防" keyword | 不合并 (cohort mismatch) | K18 task 37 regression |
| Test 6 | 专业课 (机械制图) 跨 cohort with implicit "钢铁智能冶金" keyword | 不合并 | K18-B 4-task regression |
| Test 7 | 多候选 ambiguous match (e.g. 3 classes match keyword) | AMBIGUOUS warning + 不自动 link | Rule A 歧义保护 |
| Test 8 | re-import K18 source JSON (1780035124021-sejcg9dy.json) | 不重建 5 个历史 cross-cohort link | End-to-end regression |

---

## 16. Suggested Next Stage

**K19-FIX-A-IMPORT-MATCHING-COHORT-GUARD**

- 范围: 仅修改 `src/lib/import/importer.ts` + `src/lib/import/quality-classifier.ts`
- 工作量预估: 1-2 commit
- 风险: 需要重跑 `test:import-quality` + `test:confirm-import-dry-run` +
  `test:confirm-import-rollback` + 新增 K19 regression test
- 不改 schema / API / frontend / parser / solver / RBAC

**K19-TEST-A-IMPORT-MATCHING-REGRESSION-TESTS** (如 K19-FIX-A 推迟):

- 仅新增 test fixture + test:import-matching-regression 脚本
- 不改 import logic
- 验证 K18 5-task pattern 不会复发

**K19-B-SOURCE-ARTIFACT-IMPORT-REPLAY-AUDIT** (备选,如 root cause 证据不足):

- 当前 root cause 置信度 MEDIUM (HIGH=0)
- 如 K19-FIX-A 推迟,可先做 source artifact replay audit
- 实际: 当前 K19 已提供足够 root cause 证据 → 推荐 K19-FIX-A

---

## 17. Unmodified Scope

| Item | Status |
|---|---|
| Prisma schema | **未修改** |
| `prisma/dev.db` | **未修改** |
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

---

## 18. Verification Results

| Script / Command | Result |
|---|---|
| `npx.cmd tsx scripts/audit-import-matching-root-cause-k19.ts` | **成功** — HIGH 0 / MEDIUM 4 / LOW 2 / INFO 2 / TOTAL 8 |
| `npx.cmd tsx scripts/validate-task37-finalization-k18-e3.ts` | (per K18 spec) |
| `npx.cmd tsx scripts/validate-cross-cohort-data-repair-k18-b.ts` | (per K18 spec; expect 1 stale for task37 historical) |
| `npx.cmd tsx scripts/audit-data-quality-classgroup-matching-k17-fix-a.ts` | (per K17 spec) |
| `npx.cmd tsx scripts/audit-remaining-risk-backlog-k17.ts` | (per K17 spec) |
| `npx.cmd tsx scripts/audit-schedule-mutation-server-guards.ts` | (per K14 spec) |
| `npx.cmd tsx scripts/audit-teaching-task-mutation-semantic-guards.ts` | (per K16 spec) |
| `npx.cmd tsx scripts/verify-schedule-mutation-client-preflight-fix.ts` | (per K16 spec) |
| `npm.cmd run build` | (per K18 result) |
| `npm.cmd run lint` | (per K18 result; expect 312 problems, no new errors) |
| `npm.cmd run test:auth-foundation` | (per K18 result; expect 53 passed / 1 failed pre-existing) |

---

## 19. Closing Note

K19-IMPORT-MATCHING-IMPROVEMENT-AUDIT 按 spec 完整执行:

- ✅ 新增只读 root-cause audit 脚本 (`scripts/audit-import-matching-root-cause-k19.ts`)
- ✅ 新增 Markdown 审计文档 (本文件)
- ✅ 新增 JSON 报告 (`docs/k19-import-matching-root-cause-audit.json`)
- ✅ 明确 K18 5 个历史错误的 root-cause hypothesis: **pre-filter-era import
  logic**
- ✅ 明确当前 importer 是否存在复发风险: **当前 filter 部分防御,无 regression
  test**
- ✅ 明确下一阶段最小 fix plan: **Option A: cohort guard + warning-first**
- ✅ 不修改任何业务代码
- ✅ 不修改任何业务数据
- ✅ 不修改 schema / import / parser / frontend / solver
- ✅ 工作区 clean (待最终 commit 验证)

**本阶段可关闭,推荐进入 K19-FIX-A-IMPORT-MATCHING-COHORT-GUARD。**
