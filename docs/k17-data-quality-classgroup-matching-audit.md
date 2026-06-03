# K17-FIX-A Data Quality — ClassGroup Matching Audit

| Field | Value |
|---|---|
| Phase | K17-FIX-A |
| Type | Read-only data quality audit |
| Generated | 2026-06-03 |
| Mode | Read-only (no Prisma writes, no DB schema/migration, no business data mutation) |
| Target class | `2024级钢铁智能冶金技术1班（高本贯通）` (id=22) |
| Audit script | `scripts/audit-data-quality-classgroup-matching-k17-fix-a.ts` |
| JSON report | `docs/k17-data-quality-classgroup-matching-audit.json` |
| Raw auto-generated tables | `docs/k17-data-quality-classgroup-matching-audit-raw.md` |

---

## 1. Background

K17-REMAINING-RISK-BACKLOG-AUDIT (commit `e4ddfb6`, 2026-06-03) 收口后,剩余风险 backlog 中 K9-DQ-1 仍为 P1 优先级:

> 早前已发现数据质量问题:class "2024级钢铁智能冶金技术1班（高本贯通）" 显示课程错误混入 2025 cohort 合班。

K9-DQ-1 在 2026-05-30 已有初次诊断 (`scripts/diagnose-classgroup-data-quality.ts` + `docs/classgroup-data-quality-report.md`)。本阶段定位:

- **不重做** K9-DQ-1 的诊断 (脚本仍可运行,数据已变化但根因未变)
- **不修复** 任何业务数据
- **不做** import logic / frontend display / solver / parser 修改
- **只输出** 当前 DB 真实状态下的 cross-cohort / cross-track false positive 清单,以及建议的下一阶段

K17-FIX-A 是 K17 backlog 的 "P1 next stage" — 优先级高于 LOW 权限细分、lint debt、test baseline debt。

---

## 2. Audit Goal

1. 扫描当前 DB 中的 `TeachingTask` + `TeachingTaskClass` + `ClassGroup` membership
2. 识别疑似跨年级 / 跨 cohort / 跨届合班 false positive
3. 重点验证已知问题:
   - "2024级钢铁智能冶金技术1班（高本贯通）" 是否仍与 2025 cohort 班级或课程错误合并
4. 找出可能由 fuzzy matching / character-subsequence matching / import 合班解析导致的错误
5. 输出问题数据清单
6. 输出推荐的后续修复策略,但不做修复
7. 判断是否需要进入 K17-FIX-B 或 K18 数据修复阶段

---

## 3. Scope

**In scope** (本阶段):

- `ClassGroup` (id / name / semesterId / studentCount / cohortYear / track)
- `TeachingTask` (id / courseId / teacherId / semesterId / importBatchId / weekType / startWeek / endWeek / remark)
- `TeachingTaskClass` (teachingTaskId ↔ classGroupId)
- `ScheduleSlot` (id / teachingTaskId / semesterId, 只 count 不 dump)
- `ImportBatch` (id / filename / status / semesterId / confirmedAt)
- `Semester` (id / name)

**Out of scope** (本阶段严禁处理):

- `Room.capacity` placeholder / `Room.capacity=50` / `getTaskStudentCount` fallback (K10-CAPACITY-01)
- LAHC solver scoring / `hc1..hc4` / `SchedulingRun` / Re-run 按钮
- UI semester selector / frontend 任何变更
- Import logic / `findMergedClassNames` / `parseRemarkKeywords` / `filterCandidatesByYearAndTrack` (本阶段只观察现状,不改 import 逻辑)
- Frontend display layer bug (K9-DQ-FRONTEND,详见 K9-DQ-1 diagnose 报告)
- RBAC / `requirePermission` / `seed-auth` / 权限 key
- DB schema / migration / seed / reset
- 任何业务数据写操作 (create / update / delete / upsert / raw SQL write)

---

## 4. Data Sources

只读查询的 Prisma 模型:

| Model | Fields read | Purpose |
|---|---|---|
| `ClassGroup` | id, name, semesterId, studentCount | 提取 cohortYear + track,构造 ParsedClassGroup |
| `TeachingTask` | id, courseId, teacherId, semesterId, importBatchId, weekType, startWeek, endWeek, remark | 关联 course + teacher + importBatch |
| `Course` | id, name | 课程名称 + 公共课判断 |
| `Teacher` | id, name | 教师名称 (用于 evidence) |
| `TeachingTaskClass` | id, teachingTaskId, classGroupId | 关联任务 ↔ 班级 (含嵌套 classGroup) |
| `ScheduleSlot` | id, teachingTaskId, semesterId (count only) | Slot 影响度 |
| `ImportBatch` | id, filename, status, semesterId, confirmedAt, createdTaskCount, createdSlotCount | Batch-level 跨 cohort 汇总 |
| `Semester` | id, name, code | 学期名称 (evidence) |

**No write operations issued**. 脚本启动时建立 Prisma client,审计结束后 `prisma.$disconnect()` 关闭连接。

---

## 5. Cohort Detection Rules

`parseCohortYear(name)` 纯函数实现,优先级:

| 优先级 | 正则 | 置信度 | 说明 |
|---:|---|---|---|
| 1 | `^(\d{4})级` | HIGH | 显式 YYYY级,4 位年份 2000-2099 |
| 2 | `^(\d{2})级` | MEDIUM | 显式 YY级,如 "24级" → 2024 |
| 3 | `^(\d{4})(?!\d)` | LOW | 4 位年份无 级 后缀,可能是 course code |
| 4 | none | UNKNOWN | 标记为无法识别,audit 不做硬判 |

- 排除课程编号误识别:正则要求年份在字符串开头,课程编号通常在中间位置,不会误命中
- `parseTrack(name)` 单独识别 `高本贯通` / `现场工程师` 两个已知培养方向
- `LIKELY_PUBLIC_COURSE_HINTS` 包含大学英语/日语/语文/数学/思政课/体育/心理健康教育等 17 个公共课关键词,用于 Rule A 的 severity 降级

### 5.1 Audit Rules (A-F)

| Rule | 检测内容 | Severity |
|---|---|---|
| A | 同一 TeachingTask 关联多个 cohortYear | MEDIUM (默认) / INFO (公共课) |
| B | 高相似 class name 但 cohortYear 不同 (去 cohort/track 标记后 core 名称一致) | LOW |
| C | ImportBatch 级别 cross-cohort 汇总 (count) | MEDIUM (如有 confirmed) |
| D | TeachingTask.semesterId ≠ ClassGroup.semesterId | HIGH |
| E | cross-cohort TeachingTask 已排课 (slot impact) | MEDIUM |
| F | 已知目标班级 (2024级钢铁智能冶金技术1班（高本贯通）) 与 2025 cohort 出现在同一 TeachingTask | HIGH (如有 slot) / MEDIUM (无 slot) |

---

## 6. Findings Summary

| Severity | Count | 说明 |
|---|---:|---|
| HIGH | 1 | 已知目标班级 (2024级钢铁智能冶金技术1班（高本贯通）) 出现在 4 个 cross-cohort + 2025 cohort 的 TeachingTask 中,且全部已排课 |
| MEDIUM | 9 | 5 个 cross-cohort task (含 4 个已排课) + 1 个 ImportBatch-level 汇总 |
| LOW | 4 | 4 个 high-similarity class name with different cohort year (均为同一组任务的延伸观察) |
| INFO | 2 | 1 个公共课 cross-cohort (习近平思想概论) + 1 个 DB scope 摘要 |
| NONE | 0 | — |
| **TOTAL** | **16** | — |

**Severity 分布**:K9-DQ-1 根因 (`findMergedClassNames` 跨年级匹配) 仍存在于当前数据中,但 import 端已有 `filterCandidatesByYearAndTrack` 函数 (`src/lib/import/importer.ts` lines 170-196) 做部分防御,导致当前 cross-cohort task 数量从 2026-05-30 的 35 下降到 5。

**已确认受影响 ImportBatch**:

| batchId | filename | status | crossYearTasks | suspiciousTasks | confirmed |
|---:|---|---|---:|---:|---|
| 1 | 2026年春季学期课程表(0420).docx | confirmed | 5 | 4 | true |

**已确认受影响 ScheduleSlot 数**:4 (task 168 / 174 / 176 / 181 各 1 个 slot)

---

## 7. Target Class Investigation

| Field | Value |
|---|---|
| 是否找到 "2024级钢铁智能冶金技术1班（高本贯通）" | **是** |
| 找到的 ClassGroup id | **22** |
| 找到的 ClassGroup name | **2024级钢铁智能冶金技术1班（高本贯通）** |
| 找到的 ClassGroup semesterId | **1** (既有数据默认学期) |
| 找到的 ClassGroup studentCount | **30** |
| 找到的 ClassGroup cohortYear | **2024** (HIGH confidence,匹配 `^2024级`) |
| 是否找到 2025 cohort 相似 ClassGroup | **是** (id=3 "2025级钢铁智能冶金技术1班（高本贯通）") |
| 是否存在同一 TeachingTask 同时关联 2024 和 2025 | **是** (4 个 task) |
| 是否已有 ScheduleSlot | **是** (4 个 task 全部已排课) |
| 是否关联 confirmed ImportBatch | **是** (ImportBatch #1, confirmed) |
| **结论** | **K9-DQ-1 根因仍存在,目标班级 (2024 cohort) 与 2025 cohort 在 4 个已排课任务中合并,均出自 confirmed import batch #1** |

### 7.1 已知问题任务列表

| taskId | course | teacher | years | classes | importBatchId | slotCount |
|---:|---|---|---|---|---:|---:|
| 168 | 机械制图 | 赵春超 | 2025+2024 | 2025级钢铁智能冶金技术1班（高本贯通）, 2025级钢铁智能冶金技术（现场工程师）, 2025级智能轧钢技术（现场工程师）+2025级机电一体化技术（现场工程师）, 2024级钢铁智能冶金技术1班（高本贯通） | 1 | 1 |
| 174 | 机械制图 | 张红梅 | 2025+2024 | (同上,4 个班级) | 1 | 1 |
| 176 | 电子技术 | 许进 | 2025+2024 | (同上,4 个班级) | 1 | 1 |
| 181 | 传感器与检测技术 | 张旭 | 2025+2024 | (同上,4 个班级) | 1 | 1 |

每个任务的 classGroups 都包含:
- 2025 cohort 高本贯通方向班级 (id=3)
- 2025 cohort 现场工程师方向班级 (id=18)
- 2025 cohort 智能轧钢 + 机电一体化 联合现场工程师班级 (id=19, 解析时是 "2025级智能轧钢技术（现场工程师）+2025级机电一体化技术（现场工程师）")
- 2024 cohort 高本贯通方向班级 (id=22) ← **目标班级**

classification = `SUSPICIOUS_CROSS_TRACK_MERGE` (跨 cohort + 跨方向 双重 false positive)。

### 7.2 目标班级自身任务分布

| Metric | Value |
|---|---:|
| Target class tasks 总数 | 15 |
| 其中 cross-year (与 2025) | 4 |
| 其中 cross-track (现场工程师) | 4 |
| 其中 single-cohort single-track | 11 |

11 个 single-cohort single-track 任务均为合理 (大学英语/日语/材料科学基础/冶金传输原理/美育/职业素养/职业发展/机械设计基础/金属性能检测 等专业基础课)。

---

## 8. Cross-Cohort TeachingTask Findings

全部 5 个 cross-cohort TeachingTask 均出自 ImportBatch #1,4 个 (168/174/176/181) 涉及目标班级 2024级钢铁智能冶金技术1班（高本贯通）;1 个 (task 37) 涉及公共课 "习近平新时代中国特色社会主义思想概论" 与 2025 cohort "钢铁智能冶金技术1班（高本贯通）" + 2025 cohort "森林草原防火技术1班"。

| Severity | ID | Rule | taskId | course | crossYear | crossTrack | publicCourse | slotCount |
|---|---|---|---:|---|---|---|---|---:|
| HIGH | K17-DQ-HIGH-1 | F | — | — | true | true | false | 4 |
| MEDIUM | K17-DQ-MEDIUM-1 | C | — | (ImportBatch #1) | — | — | — | 440 |
| MEDIUM | K17-DQ-MEDIUM-2 | E | 168 | 机械制图 | true | true | false | 1 |
| MEDIUM | K17-DQ-MEDIUM-3 | E | 174 | 机械制图 | true | true | false | 1 |
| MEDIUM | K17-DQ-MEDIUM-4 | E | 176 | 电子技术 | true | true | false | 1 |
| MEDIUM | K17-DQ-MEDIUM-5 | E | 181 | 传感器与检测技术 | true | true | false | 1 |
| MEDIUM | K17-DQ-MEDIUM-6 | A | 168 | 机械制图 | true | true | false | 1 |
| MEDIUM | K17-DQ-MEDIUM-7 | A | 174 | 机械制图 | true | true | false | 1 |
| MEDIUM | K17-DQ-MEDIUM-8 | A | 176 | 电子技术 | true | true | false | 1 |
| MEDIUM | K17-DQ-MEDIUM-9 | A | 181 | 传感器与检测技术 | true | true | false | 1 |
| LOW | K17-DQ-LOW-1 | B | 168 | 机械制图 | true | true | false | 1 |
| LOW | K17-DQ-LOW-2 | B | 174 | 机械制图 | true | true | false | 1 |
| LOW | K17-DQ-LOW-3 | B | 176 | 电子技术 | true | true | false | 1 |
| LOW | K17-DQ-LOW-4 | B | 181 | 传感器与检测技术 | true | true | false | 1 |
| INFO | K17-DQ-INFO-1 | A | 37 | 习近平新时代中国特色社会主义思想概论 | true | false | true | 1 |
| INFO | K17-DQ-INFO-2 | — | (database scope summary) | — | — | — | — | 0 |

注:
- Rule A: cross-cohort TeachingTask scan
- Rule B: high-similarity class name
- Rule C: ImportBatch summary
- Rule E: cross-cohort + already scheduled (slot impact)
- Rule F: known target class 专项
- Task 37 (公共课) severity 降为 INFO,需要人工核对原始排课表

### 8.1 Rule D (semester mismatch) — 未发现

`TeachingTask.semesterId` 与所有关联 `ClassGroup.semesterId` 全部一致 (均为 1,既有数据默认学期)。未发现跨学期 false positive。

---

## 9. ImportBatch Summary

| batchId | filename | status | crossYearTasks | suspiciousTasks | slotCount | confirmed |
|---:|---|---|---:|---:|---:|---|
| 1 | 2026年春季学期课程表(0420).docx | confirmed | 5 | 4 | 440 | true |

- **涉及多少 ImportBatch**:1 (即全部 37 个 batch 中只有 1 个含 cross-cohort task)
- **是否 confirmed**:是
- **哪些 batch 产生最多疑似跨 cohort task**:Batch #1 (5 个)
- **是否建议人工复核**:是 — 在 K17-FIX-B 决策阶段,需打开 `parsedJsonPath` 对照原始排课表 (2026年春季学期课程表(0420).docx) 确认这 5 个 cross-cohort task 是否为 import 误合并

---

## 10. ScheduleSlot Impact

| Metric | Value |
|---|---:|
| 疑似错误 TeachingTask 中已排课数 | 4 (task 168 / 174 / 176 / 181) |
| 总受影响 ScheduleSlot 数 | 4 |
| 是否影响 schedule display | **是** (4 个 slot 出现在课表) |
| 是否影响 adjustment | **是** (drag/drop / dry-run / void 路径会读取 cross-cohort classGroups) |
| 是否影响 solver input | **是** (`data-loader.ts` 会读取 taskClasses;HC3 class conflict 计算会用到所有关联 classGroup) |
| 是否影响 export | **是** (Excel 导出 / 调课历史会包含这些 task) |
| 是否需要修复前冻结相关操作 | **建议** — 在 K17-FIX-B 决策阶段前,可考虑暂时锁定这 4 个 task 的 drag/drop |

### 10.1 Slot 详情

| taskId | course | dayOfWeek | slotIndex | importBatchId |
|---:|---|---:|---:|---:|
| 168 | 机械制图 | 6 | 2 | 1 |
| 174 | 机械制图 | 6 | 2 | 1 |
| 176 | 电子技术 | 6 | 4 | 1 |
| 181 | 传感器与检测技术 | 6 | 4 | 1 |

注:具体 slot id / roomId 详见 `docs/k17-data-quality-classgroup-matching-audit.json` (本 MD 仅展示影响度,完整 evidence 在 JSON 中)。

---

## 11. Risk Assessment

| Question | Answer |
|---|---|
| 是否存在 HIGH | **是** (1 项,K17-DQ-HIGH-1) |
| 是否存在 MEDIUM | **是** (9 项) |
| 是否属于真实数据错误还是仅潜在匹配风险 | **真实数据错误**:5 个 cross-cohort task 已写入 DB,4 个已排课,均出自 confirmed import batch |
| 是否建议进入数据修复阶段 | **建议** — K9-DQ-1 根因确认存在,但修复前需 K17-FIX-B 决策 (删除/拆分/标记) |
| 是否建议先修 import matching 逻辑 | **是 (长期)** — `filterCandidatesByYearAndTrack` 已做部分防御,但对 cohort 严格相等约束可进一步加强;短期不阻塞,作为 K9-DQ-2-MATCHING 长期改进 |

### 11.1 风险传导路径

```
ImportBatch #1 (confirmed)  ──>  5 cross-cohort TeachingTask
                                          │
                                          ├─ 4 已排课 (168/174/176/181)
                                          │      │
                                          │      ├─ schedule display
                                          │      ├─ drag/drop conflict check
                                          │      ├─ schedule adjustment (dry-run/real/void)
                                          │      ├─ HC3 (class conflict) solver input
                                          │      └─ Excel export
                                          │
                                          └─ 1 公共课 (task 37)
                                                 └─ 需人工核对原始排课表
```

### 11.2 修复策略候选 (供 K17-FIX-B 决策)

| 策略 | 描述 | 风险 | 工作量 |
|---|---|---|---|
| A. 删除误合班 TeachingTaskClass 后重新 import | 拆 task 168/174/176/181 → 各自独立任务 | 需重新 import 整张课表 | 高 |
| B. 手动逐任务拆分 | 仅修改这 4 个 task 的 taskClasses | 风险低,影响范围有限 | 低 |
| C. 接受现状并标记为 KNOWN_FALSE_POSITIVE | 不修复,记录到 K9-DQ-1 文档 | 风险:错误数据继续影响下游 | 0 |
| D. 在 UI 层做 cohort 过滤 (frontend display) | 已识别为 K9-DQ-FRONTEND,不在本阶段 scope | 治标不治本 | 中 |

推荐:先 B 短期止血,再 K9-DQ-2-MATCHING 长期根因修复。

---

## 12. Recommendations

### 12.1 短期 (K17-FIX-B 决策阶段)

1. **人工核对原始排课表** (`2026年春季学期课程表(0420).docx`),确认这 4 个任务是否真的应该跨 cohort 合班
2. **如果确认是误合并**:
   - 决策修复策略 (A/B/C/D)
   - 修复前冻结这 4 个 task 的 drag/drop
   - 修复后重新跑本审计脚本验证 findings 数量下降
3. **如果确认是合理合班** (如 2024+2025 同教师上同一门专业基础课):
   - 将 `K17-DQ-HIGH-1` 标记为 ACCEPTED
   - 修复本审计脚本:增加 "explicitly approved cross-cohort" 白名单
   - 长期:考虑在 ClassGroup 上加 `crossCohortApproved` 字段

### 12.2 长期 (K9-DQ-2-MATCHING)

1. **加强 `filterCandidatesByYearAndTrack`**:当前函数已按 year + track 过滤候选 (lines 170-196),但当 keyword 不显式含年级时只要求候选与 baseClass 同年级,可考虑严格相等约束 (即 `cy === baseYear` 而非 `cy && cy !== baseYear`)
2. **增加 `crossCohortCheck` 阶段**:在 import `executeImportInTransaction` 之后增加 cross-cohort 检测,自动标记疑似 false positive 供人工 review
3. **K9-DQ-FRONTEND**:修复 `/api/schedule` GET handler 中 `taskClasses` 的 eager load 行为,确保 class filter 时只返回 filter target class (lines 50-53, 73)

### 12.3 不建议立即处理

- Task 37 (习近平思想概论) 公共课跨 cohort:需人工核对原始排课表后再决定
- Room.capacity placeholder / solver precondition:K10-CAPACITY-01 仍留在 K17 backlog
- Lint debt 308 / test baseline drift:与 K9-DQ-1 修复并行推进即可

---

## 13. Suggested Next Stage

**K17-FIX-B-CROSS-COHORT-REVIEW-DECISION**

- 范围:只读分析 + 修复决策,**不做修复**
- 工作量预估:1-2 小时人工 review 4 个任务的原始排课表
- 产出:
  - 4 个 task 的逐个 accept/reject 决策
  - 如 reject:输出修复执行清单 (delete which taskClasses, add which new tasks)
  - 如 accept:更新 ClassGroup / TeachingTask 增加显式 `crossCohortApproved` 标记 (这需要 K18 schema 扩展)
- 决策依据:
  - 4 个 task 的 teacher 全部不同 (赵春超/张红梅/许进/张旭),说明非同一教师"借课"
  - 4 个 task 课程都是专业基础课 (机械制图/电子技术/传感器与检测技术)
  - 课程 + 教师 + 周次组合在 2024 cohort 中应能找到 4 个独立 task (在 single-cohort 11 个 task 中已部分出现)

**K9-DQ-2-MATCHING** (长期,不在 K17 范围)

- 范围:import matching logic 增强
- 边界:仅修改 `src/lib/import/importer.ts` + 增加 cross-cohort 检测;不改 UI / 不改 solver / 不改 parser
- 工作量预估:1-2 个 commit
- 风险:需回归 `npm run test:import-quality` + `npm run test:confirm-import-dry-run` + `npm run test:confirm-import-rollback`

---

## 14. Unmodified Scope

| Item | Status |
|---|---|
| Prisma schema | **未修改** |
| `prisma/dev.db` | **未修改** |
| `prisma db push` / `migrate` / `reset` / `seed` | **未运行** |
| API route 业务逻辑 | **未修改** |
| Server guard | **未修改** |
| Frontend | **未修改** |
| `seed-auth` | **未修改** |
| role mapping | **未修改** |
| `requirePermission` | **未修改** |
| 权限 key | **未新增** |
| Import logic | **未修改** |
| Class group matching logic | **未修改** |
| Solver / parser | **未修改** |
| TeachingTask / ClassGroup / TeachingTaskClass / ScheduleSlot / ImportBatch 业务数据 | **未修改** (无 create / update / delete / upsert / raw write SQL) |

---

## 15. Verification Results

本阶段已运行:

| 命令 | 结果 |
|---|---|
| `npx.cmd tsx scripts/audit-data-quality-classgroup-matching-k17-fix-a.ts` | **成功** — HIGH 1 / MEDIUM 9 / LOW 4 / INFO 2 / TOTAL 16 |
| `npx.cmd tsx scripts/audit-remaining-risk-backlog-k17.ts` | **成功** (K17 audit script 仍能运行,0 BLOCKING) |
| `npx.cmd tsx scripts/audit-schedule-mutation-server-guards.ts` | **成功** (HIGH 0 / MEDIUM 0 / LOW 3 / NONE 8) |
| `npx.cmd tsx scripts/audit-teaching-task-mutation-semantic-guards.ts` | **成功** (HIGH 0 / MEDIUM 0 / LOW 2 / NONE 13 / BLOCKING NO) |
| `npx.cmd tsx scripts/verify-schedule-mutation-client-preflight-fix.ts` | **成功** (23 passed / 0 failed) |
| `npm.cmd run build` | **成功** (`✓ Compiled successfully in 2.3s`) |
| `npm.cmd run lint` | **成功** (180 errors / 128 warnings = 308, 与 K16 baseline 一致,无新增 lint error) |
| `npm.cmd run test:auth-foundation` | **成功** (53 passed / 1 failed, 唯一失败为 pre-existing ScheduleAdjustment ACTIVE count mismatch) |

### 15.1 test:auth-foundation 说明

- 是否运行:是
- 结果:53 passed / 1 failed
- 唯一失败:`ScheduleAdjustment ACTIVE = 0 (实际 10)`,与 K17 backlog 报告 (`K17-remaining-risk-backlog-audit.md`) 中 TEST-BASELINE-01 完全一致
- 是否修改数据库业务数据尝试修复:否

### 15.2 lint 说明

- 是否运行:是
- 结果:180 errors / 128 warnings = 308 problems
- 是否仍为 pre-existing lint debt:是(与 K16 baseline 350→308 完全一致,本阶段无新增 lint issue)
- 是否有新增 lint error:否

---

## 16. Closing Note

K17-FIX-A 阶段按 spec 完整执行:

- ✅ 新增只读数据质量审计脚本 (`scripts/audit-data-quality-classgroup-matching-k17-fix-a.ts`)
- ✅ 新增 Markdown 审计文档 (本文件)
- ✅ 新增 JSON 报告 (`docs/k17-data-quality-classgroup-matching-audit.json`)
- ✅ 明确 known target class 是否存在跨 cohort false positive:**是** (4 个任务,均已排课,均出自 confirmed ImportBatch #1)
- ✅ 明确是否有已排课 ScheduleSlot 受影响:**是** (4 个 slot)
- ✅ 明确是否有 confirmed ImportBatch 受影响:**是** (ImportBatch #1)
- ✅ 明确 HIGH / MEDIUM / LOW / INFO / NONE:1 / 9 / 4 / 2 / 0
- ✅ 不修改任何业务数据
- ✅ 不修改 schema / import / frontend / solver / parser
- ✅ build 通过
- ✅ test:auth-foundation 无新增失败
- ✅ 工作区 clean (待最终 commit 验证)

**未关闭事项**:K9-DQ-1 根因修复 (K9-DQ-2-MATCHING 长期 + K17-FIX-B 决策短期) 仍待后续阶段处理。

本阶段可关闭,推荐进入 K17-FIX-B-CROSS-COHORT-REVIEW-DECISION。
