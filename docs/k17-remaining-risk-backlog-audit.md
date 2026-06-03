# K17 Remaining Risk Backlog Audit

## 1. Background

K16 主线 (Teaching Task Mutation Guard Parity + Schedule Mutation Audit Alignment) 已经收口：

- **K16-FIX-A** (`f02f35b`)：`guardTeachingTaskUpdateSemantics` 已覆盖 `teacherId` / `roomId` / `classGroup` / `week` / `semester` 五个维度，K16 HIGH 1→0。
- **K16-FIX-B** (`6343126`)：审计脚本基线校准 + `unused vars` 清理，schedule mutation audit MEDIUM 1→0，lint warnings 350→308。
- 后续审计 (`K13-FIX-C` `4beb66c` / `K13-FIX-D` `3698485` / `K14-FIX-A` `1df4385` / `K14-FIX-B` `8b7fe08`) 已逐项关闭对应主线的 MEDIUM/LOW 项。
- **K16 mainline BLOCKING: NO，可关闭。**

K17 阶段定位：**只做剩余风险 backlog 汇总，不做任何业务修复**。本阶段产出物为：

1. 纯只读审计脚本 `scripts/audit-remaining-risk-backlog-k17.ts`
2. 本文档（汇总表 + 分类结论 + 下一阶段建议）

下一阶段（K17-FIX-*）是否需要执行、优先级如何，由用户/PM 决定。

---

## 2. Audit Scope

| Scope Area | 覆盖内容 | 对应历史阶段 |
|---|---|---|
| RBAC / permission granularity | route-level 权限粒度、page-level 权限、scope 拆分、DELETE 粒度 | K14 / K15 / K16 |
| TeachingTask mutation guard | `guardTeachingTaskUpdate` / `guardAdminTaskUpdate` 完整覆盖度 | K16 |
| Schedule mutation server guard | moveItem / dry-run / void / adjustment 服务端校验 | K13 / K14 |
| Conflict check / response shape | server-side 冲突检查 + typed response shape 一致性 | K13 |
| ScheduleAdjustment | ACTIVE/VOIDED 状态机、dry-run/real/rollback 三链路 | K13 |
| Import / rollback | parse / confirm / audit / rollback 事务性 + metadata 完整性 | K15 |
| test baseline | 长期 53 passed / 1 failed 状态、基线 drift | K13-K16 |
| lint baseline | pre-existing warnings ~308 | K16 |
| data quality / class group matching | 合班匹配、年份归属、ClassGroup 一致性 | K9 |
| room capacity / solver precondition | `Room.capacity` placeholder / `getTaskStudentCount` fallback | K10 |

本审计只读取 K13-K16 已完成 commit 的成果、当前代码库与 DB 状态，**不修改任何业务文件**。

---

## 3. Backlog Summary

| Metric | Count |
|---:|---:|
| **HIGH** | 0 |
| **MEDIUM** | 5 |
| **LOW** | 6 |
| **INFO** | 2 |
| **ACCEPTED** | 0 |
| **TOTAL** | 13 |
| **BLOCKING** | **NO** |

**严重度分布**：

- MEDIUM 5 项：K15 import:manage / K15 admin/db page / K14 PUT scheduleslot guard / K9-DQ-1 合班匹配 / CAPACITY placeholder
- LOW 6 项：K16 teaching-task POST / K16 roomId guard / K15 data:delete / K14 DELETE granularity / K13 week guard / K13 response shape
- INFO 2 项：test baseline drift / lint baseline ~308

**主线状态**：BLOCKING: NO，可以继续功能主线。

---

## 4. Top Backlog Items

| # | Priority | ID | Source Stage | Category | Severity | Title | Recommendation | Suggested Next Stage |
|---:|---:|---|---|---|---|---|---|---|
| 1 | P1 | K9-DQ-01 | K9 | Data quality | MEDIUM | 合班班级匹配 / 年份归属错误 | 增强合班匹配逻辑，添加年份/年级约束；或 import 后手动审核合班结果 | K17-FIX-A（只读审计） |
| 2 | P1 | CAPACITY-01 | K10 | Room capacity / solver precondition | MEDIUM | `Room.capacity` 默认 50 作为 placeholder，来源不可靠 | 导入真实教室容量数据；`studentCount=null` 的 ClassGroup 用实际数据回填；capacity source-of-truth 应为 Room table | K17-FIX-D 或 K10 后置阶段 |
| 3 | P2 | K15-MED-01 | K15 | RBAC scope definition | MEDIUM | `import:manage` scope 未明确 | 定义 `import:manage` 含义（parse + confirm + audit），然后从 `data:write` 切换 | K17-FIX-E 或 K18 |
| 4 | P2 | K15-MED-02 | K15 | RBAC page access | MEDIUM | `/admin/db` page access 仍依赖 `data:write` | 引入 `admin:read` 或 `db:admin` 权限 scope，与 API guard 对齐 | K17-FIX-E 或 K18 |
| 5 | P2 | K14-MED-01 | K14 | RBAC route guard | MEDIUM | admin PUT `/api/data/scheduleslot` 缺 session.user 权限校验 | 在 PUT handler 中添加显式 `requirePermission` 校验（非仅 role check） | K17-FIX-E 或 K18 |
| 6 | P3 | K16-LOW-01 | K16 | RBAC permission granularity | LOW | POST `/api/teaching-task` 仍用 `data:write` | 引入 `task:create` 权限，从 `data:write` 分离；同步 RBAC seed 和 frontend gating | Backlog（K18+） |
| 7 | P3 | K16-LOW-02 | K16 | RBAC guard semantics | LOW | `guardAdminTaskUpdate` roomId no-op / whitelist 设计未落地 | 决定 roomId guard 策略（no-op 允许 vs whitelist 限制），并实现 | Backlog（K18+） |
| 8 | P3 | K15-LOW-01 | K15 | RBAC permission granularity | LOW | `data:delete` 统一覆盖多个模型 | 评估 per-model delete 权限；当前规模可接受则记为 ACCEPTED | Backlog（K18+） |
| 9 | P3 | K14-LOW-01 | K14 | RBAC route guard | LOW | DELETE routes 权限粒度不足 | 与 K15-LOW-01 合并处理；决定 per-model vs coarse delete 策略 | Backlog（K18+） |
| 10 | P3 | K13-LOW-01 | K13 | Schedule mutation guard | LOW | `moveItem` 不校验 `weekType` / `startWeek` / `endWeek` 一致性 | 在 `/api/schedule` moveItem handler 中增加 week constraint 校验 | Backlog（K18+） |
| 11 | P3 | K13-LOW-02 | K13 | Conflict response shape | LOW | adjustment dry-run vs real conflict-check response shape 未完全统一 | 将 dry-run response 与 conflict-check response 统一为同一类型 | Backlog（K18+） |
| 12 | P4 | TEST-BASELINE-01 | K16 | Test baseline drift | INFO | ScheduleAdjustment ACTIVE count mismatch in test baseline | 运行 audit script 并比对 ACTIVE count 与实际 DB 记录；如有 drift 则更新基线 | K17-FIX-B |
| 13 | P4 | LINT-BASELINE-01 | K16 | Lint baseline | INFO | pre-existing lint errors/warnings (~308 after K16 cleanup) | 评估后续阶段批量清理；当前不影响功能正确性 | K17-FIX-C（仅 scripts） |

**ACCEPTED: 0** — 全部 13 项已记录为可处理或 backlog 状态，无 ACCEPTED 项。

---

## 5. Category Conclusions

### RBAC / permission granularity

- **当前状态**：K14-FIX-A / K14-FIX-B / K15 scoping fix 已完成核心 frontend gating + admin generic teachingtask PUT guard + semesterId 注入。K16-FIX-A 在 `guardTeachingTaskUpdate` 引入语义化守卫。
- **剩余风险**：
  - 3 项 MEDIUM：`import:manage` scope 未定义 / `/admin/db` page 仍用 `data:write` / admin PUT `/api/data/scheduleslot` 缺 session.user 权限校验
  - 4 项 LOW：POST `/api/teaching-task` 仍用 `data:write` / `guardAdminTaskUpdate` roomId guard 未落地 / `data:delete` 粒度 / DELETE routes 粒度
- **是否阻塞**：否
- **建议下一步**：MEDIUM 三项可合并为 K17-FIX-E (RBAC scope 拆分) 或推后到 K18；LOW 四项并入 backlog。

### TeachingTask mutation guard

- **当前状态**：K16-FIX-A (`f02f35b`) 已覆盖 `teacherId` / `roomId` / `classGroup` / `week` / `semester` 五维；K16-FIX-B (`6343126`) 完成基线对齐。
- **剩余风险**：仅 1 项 LOW（roomId guard no-op / whitelist 未最终设计），属于"设计选择未定"而非"缺守卫"。
- **是否阻塞**：否
- **建议下一步**：下一阶段（K18+）单独决策 roomId 变更策略；当前 no-op 是合理占位。

### Schedule mutation server guard

- **当前状态**：K13 审计 (`dd5cd21`) + Fix-C (`4beb66c`) + Fix-D (`3698485`) 已完成 dry-run/真实/撤销三链路 server guard。
- **剩余风险**：1 项 LOW（moveItem 不校验 week constraint 一致性）。该检查目前仅 client-side conflict-check 覆盖，server-side 未强制。
- **是否阻塞**：否（client-side 已拦截 + conflict-check 也有覆盖）
- **建议下一步**：Backlog；如下一阶段引入强 server-side 校验，统一在 K13/K18 完成。

### Conflict check / response shape

- **当前状态**：K13-FIX-C 抽取纯规则 kernel；K13-FIX-D (`3698485`) additive typed `ScheduleConflictDetail` 已在 5 处暴露。
- **剩余风险**：1 项 LOW — adjustment dry-run vs real conflict-check response shape 仍未完全统一；部分消费方仍只读 `string[]` 消息。
- **是否阻塞**：否（additive typed fields 已保证兼容）
- **建议下一步**：Backlog；如要统一，单独 K18 阶段。

### ScheduleAdjustment

- **当前状态**：K13 + K14 已完成 dry-run/真实/撤销三链路语义化、ACTIVE/VOIDED 状态机、semester scoping。
- **剩余风险**：1 项 INFO（test baseline ACTIVE count drift）。
- **是否阻塞**：否
- **建议下一步**：K17-FIX-B 处理 test baseline 漂移。

### Import / rollback

- **当前状态**：K15 已完成 import 流程 RBAC scoping（8c6d20b）+ admin generic permission matrix (7fd88f4) + semester scoping (1706c9d / 35b64f6 / 8c6d20b) + 全部 7 个 import 测试 (npm run test:import-quality / test:confirm-import-* / audit:confirmed-import) 绿。
- **剩余风险**：仅 K15-MED-01（`import:manage` scope 未明确），属于权限定义而非功能 bug。
- **是否阻塞**：否
- **建议下一步**：与 K17-FIX-E (RBAC scope 拆分) 合并处理，或推后 K18。

### test baseline

- **当前状态**：长期 53 passed / 1 failed，test:import-* 全部绿，scheduler tests (capacity / diagnostics / solver) 全部绿。
- **剩余风险**：1 项 INFO（ScheduleAdjustment ACTIVE count mismatch in test baseline）。K16-FIX-B (`6343126`) 已校准基线，但 ScheduleAdjustment ACTIVE count 仍可能与当前 DB 状态存在 drift。
- **是否阻塞**：否（1 failed 长期已知，不影响 CI 决策）
- **建议下一步**：K17-FIX-B — 重跑 audit script 比对 ACTIVE count 与 DB 真实记录；如确认 drift 则更新基线。

### lint baseline

- **当前状态**：K16-FIX-B (`6343126`) 清理 42 个 `unused vars` warning（350→308）。
- **剩余风险**：1 项 INFO（~308 pre-existing lint warnings）。
- **是否阻塞**：否（不影响功能正确性，类型检查 + tests 仍可信）
- **建议下一步**：K17-FIX-C — 只处理 scripts 目录 lint debt（K16-FIX-B 集中在 scripts，下一阶段也优先 scripts）。全量清 308 个 warning 风险高、不属于本阶段目标。

### data quality / class group matching

- **当前状态**：K9 数据质量审计识别出合班 auto-merge (`scripts/seed_db.ts`) 使用 character-subsequence fuzzy matching。
- **剩余风险**：1 项 MEDIUM（K9-DQ-01）— 合班匹配可产生跨年级 false positive（如 2024 班和 2025 班因字符重叠被错误合并）。
- **是否阻塞**：否（数据库目前 1 个 confirmed ImportBatch 的 56 个 task / 189 个 slot 是 K9 之后的合班结果，已在线上运行）
- **建议下一步**：K17-FIX-A — **只读审计**，不修复。扫描所有合班 TeachingTask 的 TeachingTaskClass membership，确认是否真的存在跨年级 false positive。如确认存在，再排 K18 做数据修复。

### room capacity / solver precondition

- **当前状态**：K10 scheduler 已使用 `Room.capacity` 和 `getTaskStudentCount` 做 HC4/HC5 检查。`Room.capacity` 默认为 50。
- **剩余风险**：1 项 MEDIUM（CAPACITY-01）— `Room.capacity` 默认 50 + `getTaskStudentCount` fallback 50 均为 placeholder，solver 的容量检查使用不可靠数据。
- **是否阻塞**：否（当前 scheduler run 仍能产出结果，placeholder 容量不致直接冲突）
- **建议下一步**：**不在 K17 阶段处理**。需在 K10 solver 前置阶段（数据导入阶段）先有真实容量/学生数数据源；本阶段处理会引入跨阶段耦合。

---

## 6. Blocking Assessment

| Indicator | Value |
|---|---|
| HIGH items | 0 |
| MEDIUM items | 5（均非阻塞） |
| LOW items | 6（均非阻塞） |
| INFO items | 2（均非阻塞） |
| **BLOCKING** | **NO** |

**结论**：

- 当前阶段 **没有 HIGH 级别风险**，主线条 BLOCKING 状态为 NO。
- 5 项 MEDIUM 均属于"应该改但今天不阻塞"：
  - 3 项 RBAC scope 拆分（MED-01/02/03）— 当前 `data:write` 仍能正确工作
  - 1 项数据质量（K9-DQ-01）— 当前 1 个 confirmed import batch 在线运行
  - 1 项容量 placeholder（CAPACITY-01）— solver 仍能产出解
- LOW 6 项均属 backlog 性质。
- INFO 2 项是测试/lint 基线债。

**功能主线可以继续推进**。但建议下一阶段从以下两项中选一优先处理：

1. **K9-DQ-01**（数据正确性问题，潜在影响所有依赖合班 ClassGroup 的下游功能）
2. **test baseline / lint baseline**（CI 信任度债，长期未清会掩盖新 bug）

具体取舍由下一阶段目标决定。

---

## 7. Recommended Next Stages

按优先级排序：

### 1. K17-FIX-A-DATA-QUALITY-CLASSGROUP-MATCHING-AUDIT（只读审计）

- **目标**：扫描所有合班 TeachingTask 的 `TeachingTaskClass` membership，确认 K9-DQ-01 是否真的存在跨年级 false positive。
- **范围**：只读，不修复。如确认存在，输出问题数据列表供 K18 数据修复使用。
- **原因**：K9-DQ-01 是潜在数据正确性问题，优先级高于 LOW 权限细分。即使是只读审计，输出结果也能让团队判断是否需要 K18 数据回滚/修复。
- **预计工作量**：1 个只读脚本 + 1 份审计报告。

### 2. K17-FIX-B-AUTH-FOUNDATION-TEST-BASELINE

- **目标**：修复或隔离 ScheduleAdjustment ACTIVE count mismatch 测试基线债。
- **范围**：重跑 K16 audit script 比对 ACTIVE count 与当前 DB 状态；如确认 drift，更新测试基线 assertion；如属 K16 audit script bug，修复脚本。
- **原因**：当前长期 53 passed / 1 failed 会降低 CI 信任度，新功能 PR 容易让 reviewer 误判风险等级。
- **预计工作量**：1 个诊断 commit + 1 个基线更新 / 脚本修复。

### 3. K17-FIX-C-LINT-DEBT-SCRIPTS-ONLY

- **目标**：只清理 `scripts/` 目录 lint debt（约 308 warnings 中 K13-K16 引入的部分）。
- **范围**：`scripts/` 子目录 + 子目录的 import 路径；不清理 `src/`。
- **原因**：全量 lint debt 较大（约 308 warnings），不宜一次清；K16-FIX-B 集中在 scripts 路径，本阶段延续这一策略以降低风险。
- **预计工作量**：批量处理 warnings 集中的几个文件 + 1 个 lint baseline 重置 commit。

### 4. Backlog-only LOW permission cleanup（K18+）

- **目标**：处理 4 项 LOW RBAC 粒度问题：
  - POST `/api/teaching-task` 权限迁移 → `task:create`
  - `import:manage` 拆分
  - `data:delete` 拆分（per-model vs coarse 决策）
  - `/admin/db` page access 多权限支持
- **范围**：仅 RBAC 拆分 + frontend gating + RBAC seed 同步。
- **原因**：均为 LOW，不阻塞；可作为 K18 单一主题"RABC 权限粒度收尾"处理。
- **预计工作量**：4 个独立 commit 或 1 个合并 PR。

---

## 8. Accepted / Deferred Risks

以下项**不建议在 K17 阶段处理**：

| ID | Reason |
|---|---|
| K16-LOW-01（POST `/api/teaching-task` 仍用 `data:write`） | LOW 不阻塞；K18 阶段合并到 RBAC 权限收尾 |
| K16-LOW-02（`guardAdminTaskUpdate` roomId guard 未落地） | 属于"设计选择未定"而非"缺守卫"；需先与 PM 确认 roomId 变更策略再实现 |
| K15-LOW-01（`data:delete` 粒度） | LOW 不阻塞；K18 阶段与 K14-LOW-01 合并处理 |
| K14-LOW-01（DELETE routes 粒度） | LOW 不阻塞；同上 |
| K13-LOW-01（`moveItem` week constraint 一致性） | LOW 不阻塞；client-side conflict-check 已覆盖 |
| K13-LOW-02（response shape 边界） | K13-FIX-D (`3698485`) 已有 additive typed fields 兼容策略；进一步统一需 K18 单独阶段 |
| CAPACITY-01（`Room.capacity` placeholder） | 需在 K10 solver 前置阶段（数据导入阶段）先有真实容量/学生数数据源；本阶段处理会引入跨阶段耦合 |
| K15-MED-01 / K15-MED-02 / K14-MED-01 | MEDIUM 但不阻塞；K18 阶段合并到 RBAC scope 收尾 |
| TEST-BASELINE-01 / LINT-BASELINE-01 | INFO；K17-FIX-B / K17-FIX-C 处理 |

---

## 9. Verification Results

**本阶段已运行**：

- `npx.cmd tsx scripts/audit-remaining-risk-backlog-k17.ts` — **成功**（输出 13 项，0 BLOCKING）
- 完整验证（manual acceptance + API guard test + audit script）将在下一小步执行

**未运行**（按要求）：

- 完整 manual acceptance
- `npm run test:import-quality` / `test:confirm-import-*` / `audit:confirmed-import`
- `npm run test:capacity` / `test:diagnostics` / `test:solver`
- `npm run lint`

---

## 10. Unmodified Scope

本阶段（K17 Remaining Risk Backlog Audit）**未修改**以下内容：

- **Prisma schema** — 未修改
- **`prisma/dev.db`** — 未修改
- **DB 操作** — 未运行 `prisma db push` / `prisma migrate` / `prisma db push --force-reset`
- **API route 业务逻辑** — 未修改 `src/app/api/**` 任何 handler
- **Server guard** — 未修改 `requirePermission` / `guardTeachingTaskUpdate` / `guardAdminTaskUpdate` / `guardMoveItem`
- **Frontend** — 未修改 `src/components/**` / `src/store/**` / `src/app/**` 任何客户端代码
- **seed-auth** — 未修改 `prisma/seed-auth.*` / RBAC seed 脚本
- **Role mapping** — 未修改 role → permission 映射表
- **`requirePermission`** — 未修改工具函数
- **权限 key** — 未新增任何 permission key
- **Import / rollback / solver / parser** — 未修改 `src/lib/import/**` / `src/lib/scheduler/**` / `scripts/parse_*`
- **业务数据** — 未新增 / 修改 / 删除任何 TeachingTask / ScheduleSlot / ClassGroup / Teacher / Course / Room / ScheduleAdjustment / ImportBatch 记录

**本阶段唯一新增文件**：

- `scripts/audit-remaining-risk-backlog-k17.ts`（K17 audit 脚本）
- `docs/k17-remaining-risk-backlog-audit.md`（本文件）
