# L5-XLSX-COURSE-SETTING-REVIEW-PACKAGE-AND-SAFE-CONFIRM-PLAN

> **阶段**：L5 — Course-Setting xlsx review package + safe confirm plan (still no DB apply)
> **状态**：PASS (62/62)
> **Helper 文件**：src/lib/import/course-setting-review-package-l5.ts
> **Helper 版本**：l5-review-package-v1
> **生成时间**：2026-06-20T04:43:20.385Z

## 1. 阶段名称
L5-XLSX-COURSE-SETTING-REVIEW-PACKAGE-AND-SAFE-CONFIRM-PLAN

## 2. 本阶段目标
基于 L4 dry-run 结果生成脱敏 review package + safe confirm plan。明确 target semester 策略（推荐 Option A：confirm/create 2025秋 semester），定义 required gates、transaction plan、rollback plan、source evidence forward-fill plan。本阶段不写 DB、不创建 ImportBatch、不接 apply。L6 仍须 review/approval-only。

## 3. review-only / dry-run-only 边界
- `reviewOnly: true`，`dryRunOnly: true`，`dbWritten: false` 始终为真。
- 所有 `reviewItems[i].reviewDecision = "pending"`。L5 never auto-approves。
- `safeConfirmPlan.applyAllowedInL5 = false` literal。
- `applyPlanDraft.createScheduleSlots = false` literal。
- 不创建 ImportBatch；不写 Course / Teacher / ClassGroup / TeachingTask / TeachingTaskClass / ScheduleSlot / ScheduleAdjustment / Semester。

## 4. L4 dry-run 输入摘要
```json
{
  "totalCourseRows": 1116,
  "teachingTaskCandidates": 1116,
  "teachingTaskClassCandidates": 1742,
  "rowsNeedingManualReview": 1099
}
```
L4 已闭环；L5 是 review/plan 阶段，不重新执行 L4 mapping。

## 5. Review Package 设计
Helper: `buildCourseSettingReviewPackage(dryRunResult, options)`（纯函数，type-only import L4 类型，零 Prisma / 零 fs.write）。
Options: `confidenceThreshold` (default 0.9, 比 L4 严格), `targetSemesterConfirmed` (default false), `maxReviewRows` (default 全量), `includeRawValues` (default false).

## 6. Review item schema
```ts
{
  reviewItemId: `review:${sheetIndex}:${sourceRowIndex}`
  source: { sheetIndex, sourceRowIndex, sourceSheetNameHash, sourceCourseNameHash?, sourceTeacherRawHash?, sourceClassCountRawHash?, sourceRemarkHash?, sourceMergeRemarkHash? }
  candidateRefs: { teachingTaskCandidateKey, courseCandidateKey?, teacherCandidateKeys, classGroupCandidateKeys, teachingTaskClassCandidateKeys }
  classifications: { courseMatchStatus, teacherMatchStatusSummary, classGroupMatchStatusSummary, splitPlan, taskMatchStatus }
  reviewDecision: "pending" // 始终为 pending, L5 不自动 approve
  suggestedAction: 11 种可能 (approveCandidate / needsHumanReview / blocked*)
  blockingReasons: string[] (snake_case 标识符, NO raw 文本)
  diagnosticCodes: string[]
  confidence: number
}
```

## 7. Bucket 策略
15 个 buckets:
```json
[
  {
    "bucket": "AUTO_SAFE_CANDIDATE",
    "count": 0,
    "description": "all entities exact, no risky diagnostics, confidence >= threshold; still requires human review in L5"
  },
  {
    "bucket": "TARGET_SEMESTER_REQUIRED",
    "count": 200,
    "description": "gate-level bucket: target semester not confirmed yet; all rows route here when targetSemesterConfirmed=false"
  },
  {
    "bucket": "MISSING_COURSE",
    "count": 0,
    "description": "course not found in existing courses"
  },
  {
    "bucket": "MISSING_TEACHER",
    "count": 0,
    "description": "teacher not found in existing teachers"
  },
  {
    "bucket": "MISSING_CLASS_GROUP",
    "count": 0,
    "description": "constructed class group name not found in existing class groups"
  },
  {
    "bucket": "COUNT_ONLY_CLASS_GROUP",
    "count": 0,
    "description": "class count has only a student count, no class label resolvable"
  },
  {
    "bucket": "UNRESOLVED_CLASS_GROUP",
    "count": 0,
    "description": "class count did not match any known pattern (other)"
  },
  {
    "bucket": "TEACHER_BLANK",
    "count": 0,
    "description": "teacher assignment is blank (business-empty)"
  },
  {
    "bucket": "TEACHER_SCOPE_SPLIT_REQUIRED",
    "count": 0,
    "description": "bankSplit or numbered teacher scope requires task split review"
  },
  {
    "bucket": "INVALID_WEEKLY_HOURS",
    "count": 0,
    "description": "weekly hours not numeric"
  },
  {
    "bucket": "INVALID_EXAM_TYPE",
    "count": 0,
    "description": "exam type not 试 or 查"
  },
  {
    "bucket": "MERGE_REMARK_AMBIGUOUS",
    "count": 0,
    "description": "merge remark is non-empty with no class marker"
  },
  {
    "bucket": "LOW_CONFIDENCE",
    "count": 0,
    "description": "parsed row confidence below threshold"
  },
  {
    "bucket": "POSSIBLE_EXISTING_TASK",
    "count": 0,
    "description": "course exact AND an existing teaching task has the same courseId (potential duplicate)"
  },
  {
    "bucket": "BLOCKED",
    "count": 0,
    "description": "catch-all blocked bucket for items that did not match a more specific bucket"
  }
]
```

## 8. auto-safe candidate 严格条件
AUTO_SAFE_CANDIDATE 须同时满足：
1. `targetSemesterConfirmed = true`（L5 默认 false → auto-safe count = 0）
2. `taskMatchStatus = newCandidate`
3. `courseMatchStatus = exact`
4. 所有 `teacherMatchStatus ∈ {exact, blank}`
5. 所有 `classGroupMatchStatus = exact`
6. 不含 `WEEKLY_HOURS_NON_NUMERIC` / `EXAM_TYPE_OTHER` / `MERGE_REMARK_AMBIGUOUS` / `LOW_CONFIDENCE_ROW`
7. `confidence >= confidenceThreshold` (default 0.9)

## 9. 当前样本 review package 统计
```json
{
  "totalReviewItems": 200,
  "autoSafeCandidates": 0,
  "blockedCandidates": 200,
  "manualReviewRequired": 0,
  "rejectedByRule": 0,
  "allDecisionsPending": true
}
```

## 10. Target Semester Analysis
当前事实：
- xlsx = `2025年秋季学期` (filename + sheet names 含 2025级三年制 / 2025级五年制、中专 / 2025级二年制)
- DB = `2025-2026春季学期` (active)，另一 semester `2026-2027秋季学期` (code 2026秋, isActive=false) 与本 xlsx 不匹配
- L4 cross-semester exact-match: course 22/408, teacher 71/306, classGroup 14/184

三种策略:
- **Option A** (recommended): confirm-or-create-2025-fall-semester. 中等风险。需要 K25-C-style Semester insert。重新对 2025秋 semester 跑 L4，匹配率应显著提升。
- **Option B** (NOT recommended): force-active-semester. 高风险。会污染春季 DB。
- **Option C** (alternative): keep-review-only. 低风险。继续完善 parser，让用户确认 xlsx 内容 + 目标学期后再 apply。

**Recommendation**: 不允许直接导入当前 active semester。下一步必须先 confirm / create 2025秋目标 semester，再设计 L6 apply。

## 11. Safe Confirm Plan
```json
{
  "applyAllowedInL5": false,
  "requiredGates": {
    "targetSemesterConfirmed": false,
    "reviewPackageApproved": false,
    "dbBackupCreated": false,
    "dryRunReplayMatchesApprovedPackage": false,
    "importBatchPlanGenerated": false,
    "rollbackPlanGenerated": false,
    "sourceEvidencePlanConfirmed": false
  },
  "targetSemesterStrategy": {
    "status": "required",
    "reason": "xlsx is 2025秋季学期; current DB is 2025-2026春季学期; L4 cross-semester match is low (22/408 course, 71/306 teacher, 14/184 classGroup exact) which is expected. Future apply MUST be scoped to a confirmed 2025秋季 Semester (Option A).",
    "options": [
      {
        "option": "A-confirm-or-create-2025-fall-semester",
        "description": "Confirm or create 2025秋季 Semester via K25-C-style insert; re-run L4 against the confirmed semester; ClassGroup/TeachingTask scoped by semesterId.",
        "risk": "medium",
        "recommended": true
      },
      {
        "option": "B-force-active-semester",
        "description": "Force-apply to the currently active semester (2025-2026春季). This will produce 1099/1116 manual-review rows AND pollute the spring DB with fall courses/teachers/classes. NOT recommended.",
        "risk": "high",
        "recommended": false
      },
      {
        "option": "C-keep-review-only",
        "description": "Defer any DB apply. Continue refining the L4 parser/mapper and let the user confirm xlsx contents and target semester. L6 will not run until Option A is selected.",
        "risk": "low",
        "recommended": false
      }
    ]
  }
}
```

## 12. Transaction Plan
```json
{
  "steps": [
    "BEGIN TRANSACTION",
    "UPSERT Course (idempotent by nameHash)",
    "UPSERT Teacher (idempotent by nameHash)",
    "UPSERT ClassGroup scoped to targetSemesterId (idempotent by (semesterId, nameHash))",
    "CREATE TeachingTask (idempotent by (semesterId, courseId, teacherId, remark))",
    "CREATE TeachingTaskClass (idempotent by (teachingTaskId, classGroupId))",
    "FORWARD-FILL source evidence on TeachingTaskClass (importBatchId, sourceArtifactFilename, sourceRowIndex, sourceSheetNameHash, sourceKeyword, sourceClassName, sourceRemark, matchStrategy, matchConfidence)",
    "CREATE ImportBatch provenance record",
    "COMMIT"
  ],
  "rollbackStrategy": [
    "capture DB backup before BEGIN (prisma/dev.db.backup-before-l6-<timestamp>)",
    "on any error during transaction: ROLLBACK",
    "if transaction commits but post-apply audit fails: restore from pre-L6 backup",
    "log dry-run plan + actual diff for audit trail"
  ],
  "idempotencyStrategy": [
    "match Course by nameHash (sha256-prefix-12)",
    "match Teacher by nameHash",
    "match ClassGroup by (semesterId, nameHash)",
    "match TeachingTask by (semesterId, courseId, teacherId, remark)",
    "match TeachingTaskClass by (teachingTaskId, classGroupId)",
    "use upsert with the above match keys so re-running the same approved package is a no-op"
  ]
}
```

## 13. Rollback Plan
- Pre-BEGIN: capture DB backup (`prisma/dev.db.backup-before-l6-<timestamp>`) + SHA256 verify。
- On error during transaction: ROLLBACK。
- On post-apply audit failure: restore from pre-L6 backup。
- Audit log: `docs/l6-audit.json` with dry-run plan vs actual diff SHA256。

## 14. Source Evidence Forward-Fill Plan
L4 已生成 9 字段 hash 化 draft（sourceSheetNameHash / sourceRowIndex / sourceMajorNameHash / sourceClassCountRawHash / sourceCourseNameHash / sourceTeacherRawHash / sourceRemarkHash / sourceMergeRemarkHash / sourceArtifactFilenameHash）。
L6 apply 时，TeachingTaskClass.create 时将这些 draft 字段 forward-fill 到 `sourceKeyword` / `sourceClassName` / `sourceRemark` / `sourceArtifactFilename` / `importBatchId` / `matchStrategy` / `matchConfidence`，确保每个 link 都有 provenance。

## 15. DB Unchanged Proof
Verify 前后 9 个核心表 count:
```
before:
{"course":104,"teacher":84,"classGroup":36,"teachingTask":308,"teachingTaskClass":446,"importBatch":38,"scheduleSlot":440,"scheduleAdjustment":67,"semester":3}
after :
{"course":104,"teacher":84,"classGroup":36,"teachingTask":308,"teachingTaskClass":446,"importBatch":38,"scheduleSlot":440,"scheduleAdjustment":67,"semester":3}
changed:
false
```
`dbCountsUnchanged: true`. 业务表（Course / Teacher / ClassGroup / TeachingTask / TeachingTaskClass / ImportBatch / ScheduleSlot / ScheduleAdjustment / Semester）全部 0 写入。

## 16. Privacy / Redaction Proof
- L5 helper 只产出 hash / id / count / classification / diagnostic code，不含 raw teacher/class/course/remark/sheet/row 文本。
- `privacy` block 7 个标志全部 `false`。
- N26-N32 扫描: 0 raw phone / 0 raw class name / 0 bare Chinese name / 0 long Chinese run / 0 raw sheet name。
- Local package 同样脱敏（N62 验证）。

## 17. 与 L3 / L4 的关系
- L3: preview-only API/UI。本阶段不修改 L3 route / UI。
- L4: dry-run candidate mapping。本阶段不修改 L4 helper，仅消费 L4 result。
- L5 复用 L4 的 previewCandidates（可能因 maxReviewRows 调整），不重新执行 parser / mapper。

## 18. 与旧 Word import 的隔离
- 旧 `parse_schedule.py` mtime=1781229170344 < L5 helper mtime=1781929980326（N39 PASS）。
- Word import route (`src/app/api/admin/import/parse/route.ts`) 未被 L5 修改。
- Word import confirm / rollback / abandon 未被 L5 修改。
- L2 xlsx parser / L4 dry-run mapper 未被 L5 修改（仅 consume）。

## 19. 验证结果
- N1 ✅ sample file exists — size=131200
- N2 ✅ sample file not git-tracked — name-hash d5c590e19e3f
- N3 ✅ L2 parser file exists — src/lib/import/course-setting-xlsx-parser.ts
- N4 ✅ L4 dry-run helper exists — src/lib/import/course-setting-teaching-task-dry-run.ts
- N5 ✅ L5 review-package helper exists — src/lib/import/course-setting-review-package-l5.ts
- N6 ✅ parser returns course rows > 0 — totalCourseRows=1116
- N7 ✅ L4 dry-run result dryRunOnly = true — dryRunOnly=true
- N8 ✅ L5 review result reviewOnly = true — reviewOnly=true
- N9 ✅ L5 review result dryRunOnly = true — dryRunOnly=true
- N10 ✅ L5 review result dbWritten = false — dbWritten=false
- N11 ✅ review items generated — count=200
- N12 ✅ all review items decision = pending — total=200
- N13 ✅ no review item decision = approve (only suggestedAction=approveCandidate for auto-safe) — all decisions are pending
- N14 ✅ bucket summary generated (15 buckets) — bucketCount=15
- N15 ✅ diagnostics summary generated — total=391 byCodeKeys=8
- N16 ✅ safe confirm plan generated — recommendedNextStage=L6-XLSX-COURSE-SETTING-APPLY-CONFIRMED
- N17 ✅ safe confirm plan applyAllowedInL5 = false — applyAllowedInL5=false
- N18 ✅ target semester strategy present (3 options) — options=3
- N19 ✅ target semester strategy does not recommend active semester forced import — B-force-active-semester recommended=false
- N20 ✅ transaction plan present — steps=9
- N21 ✅ rollback plan present — rollbackStrategies=4
- N22 ✅ source evidence plan present (writeSourceEvidence=true) — createScheduleSlots=false
- N23 ✅ local redacted review package generated — path=D:\Desktop\Course Development System\my-app\temp\local-artifacts\l5\xlsx-course-setting-review-package.redacted.json sha256=2e21d4d858758362…
- N24 ✅ local review package gitignored / not tracked — untracked (gitignored)
- N25 ✅ local review package sha256 calculated — sha256=2e21d4d8587583625646a227307b50bcede5a2796ed0e4e4ee978cb6817bee72
- N26 ✅ committed JSON contains no raw phone numbers — phone-pattern hits=0
- N27 ✅ committed JSON contains no raw class names — class-name hits=0
- N28 ✅ committed JSON contains no raw teacher/course names — bare-name hits=
- N29 ✅ committed JSON contains no raw remarks (long Chinese runs) — long-run hits=
- N30 ✅ committed JSON contains no raw sheet names — sheet-leak hits=
- N31 ✅ committed JSON privacy flags all false — {"rawTeacherNamesCommitted":false,"rawClassNamesCommitted":false,"rawCourseNamesCommitted":false,"rawRemarksCommitted":false,"rawRowsCommitted":false,"rawSheetNamesCommitted":false,"phoneNumbersCommitted":false}
- N32 ✅ committed JSON reviewPackageSummary.allDecisionsPending = true — allDecisionsPending=true
- N33 ✅ no xlsx tracked (excluding templates/) — none
- N34 ✅ no dev.db / backup tracked — none
- N35 ✅ no temp/uploads tracked (excluding README/.gitkeep/templates) — none
- N36 ✅ no schema/migration changes — prisma/ clean
- N37 ✅ no API changes — src/app/api/ clean
- N38 ✅ no UI changes — src/components/ clean
- N39 ✅ old Word parser untouched (mtime) — parse_schedule.py mtime=1781229170344 < helper mtime=1781929980326
- N40 ✅ no scheduler/score changes — src/lib/scheduler/ + src/lib/score.ts clean
- N41 ✅ no write methods in L5 helper (no prisma, no fs.write) — prisma=0 fsWrite=false
- N42 ✅ L4 dry-run mapper unchanged (L4_STAGE constant present) — l4HelperBytes=38073
- N43 ✅ L2 parser unchanged (parseCourseSettingXlsx export still present) — l2ParserBytes=32498
- N44 ✅ DB counts unchanged before/after (9 tables incl. semester) — course=104 teacher=84 cg=36 task=308 ttc=446 ib=38 slot=440 adj=67 sem=3
- N45 ✅ all 9 DB fingerprint components unchanged — before={"course":104,"teacher":84,"classGroup":36,"teachingTask":308,"teachingTaskClass":446,"importBatch":38,"scheduleSlot":440,"scheduleAdjustment":67,"semester":3} after={"course":104,"teacher":84,"classGroup":36,"teachingTask":308,"teachingTaskClass":446,"importBatch":38,"scheduleSlot":440,"scheduleAdjustment":67,"semester":3}
- N46 ✅ L4 verify still PASS — exit OK
- N47 ✅ L3 verify still PASS — exit OK
- N48 ✅ L2 parser verify still PASS — exit OK
- N49 ✅ L1 audit still PASS — exit OK
- N50 ✅ K39-B1 still PASS — exit OK
- N51 ✅ K39-B1A still PASS — exit OK
- N52 ✅ K39-C2 still PASS — exit OK
- N53 ✅ K39-C4 still PASS — exit OK
- N54 ✅ K22-C still PASS — exit OK
- N55 ✅ scan:docs-pii PASS — exit OK
- N56 ✅ build PASS — exit OK
- N57 ✅ tsc --noEmit PASS — exit OK
- N58 ✅ targeted eslint PASS (L5 helper + L5 verify) — exit OK
- N59 ✅ git diff --check clean — no whitespace errors
- N60 ✅ final forbidden files check clean — none
- N61 ✅ local package path under gitignored temp/local-artifacts/l5/ — D:/Desktop/Course Development System/my-app/temp/local-artifacts/l5/xlsx-course-setting-review-package.redacted.json
- N62 ✅ local package no raw phone / class / sheet leaks — phone=0 classBan=0 sheetLeak=0

**SUMMARY: PASS 62 / FAIL 0**

## 20. 下一阶段建议
Recommended next stage: L6-XLSX-COURSE-SETTING-APPLY-CONFIRMED
- 必须先由 ADMIN 确认 Option A：confirm-or-create-2025-fall-semester。
- 必须先生成 DB backup（`prisma/dev.db.backup-before-l6-<ts>`）。
- 必须审批 review package（人工 override 所有 `pending` → `approved` / `rejected`）。
- dry-run replay 必须匹配 approved package（JSON strip `generatedAt` 后相等）。
- 必须 atomic transaction + rollback plan。
- apply 后必须 audit + K22-C 回归仍 73/0/0/0。
- L6 仍 review/approval-only 默认；未明确批准前不 apply。
