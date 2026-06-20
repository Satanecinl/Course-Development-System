# L6-0-XLSX-COURSE-SETTING-TARGET-SEMESTER-AND-FULL-REVIEW-PACKAGE

> **阶段**：L6-0 — Course-Setting xlsx target-semester analysis + full review package (still no DB apply)
> **状态**：PASS (76/76)
> **Helper 文件**：src/lib/import/course-setting-review-package-l5.ts
> **Helper 版本**：l5-review-package-v1
> **生成时间**：2026-06-20T06:16:04.444Z

## 1. 阶段名称
L6-0-XLSX-COURSE-SETTING-TARGET-SEMESTER-AND-FULL-REVIEW-PACKAGE

## 2. 本阶段目标
基于 L5 review-package helper 修复 L5 的 200-cap 问题（generate full uncapped review package），同时输出**只读 target-semester analysis**：识别当前 DB 中可作为 2025秋 target semester 的候选 Semester 行、判定 force-active-semester 是否可接受、明确 `targetSemesterConfirmed` / `targetSemesterCreatedOrSelected` / `activeSemesterForceImportAllowed` 三道 gate 必须保持 false。L6-0 不创建 Semester 行、不激活任何 Semester、不接 apply。L6 必须仍 review/approval-only，禁止 DB apply。

## 3. review-only / dry-run-only / target-not-confirmed 边界
- `reviewOnly: true`，`dryRunOnly: true`，`dbWritten: false`，`targetSemesterConfirmed: false`，`applyAllowedInL60: false` 始终为真。
- 所有 `reviewItems[i].reviewDecision = "pending"`。L6-0 never auto-approves。
- `safeConfirmPlan.applyAllowedInL5 = false` literal；`applyAllowedInL60 = false` literal。
- `applyPlanDraft.createScheduleSlots = false` literal（保持 L5 行为）。
- 不创建 ImportBatch；不创建 / 激活 Semester；不写 Course / Teacher / ClassGroup / TeachingTask / TeachingTaskClass / ScheduleSlot / ScheduleAdjustment。

## 4. L5 200-cap 修复说明
L5 调用 `buildCourseSettingReviewPackage` 时默认 `maxReviewRows = Number.POSITIVE_INFINITY`，但 L5 早期 demo / 上游调用可能传 `maxReviewRows: 200` 来限制 preview 输出的体积。L5 本地 artifact 因此只覆盖前 200 条 review items。L6-0 引入 `buildFullCourseSettingReviewPackage` thin wrapper，强制 `maxReviewRows: Number.POSITIVE_INFINITY`，确保 reviewItems 与 L4 teachingTaskCandidates（1116）一一对应。L6-0 本地 artifact 用新 serializer `serializeFullReviewPackageLocalArtifact`（`stage` 字段固定为 `L6_0_STAGE`），与 L5 preview artifact 形态区分。

## 5. L4 dry-run 输入摘要
```json
{
  "totalCourseRows": 1116,
  "teachingTaskCandidates": 1116,
  "teachingTaskClassCandidates": 1742,
  "rowsNeedingManualReview": 1099
}
```
L4 已闭环；L6-0 是 review/target-semester-analysis 阶段，不重新执行 L4 mapping。

## 6. Target Semester Analysis（只读）
Helper: `buildTargetSemesterAnalysis()`（直接 `prisma.semester.findMany` 只读，不写）。
```json
{
  "readOnly": true,
  "semesterCount": 3,
  "activeSemester": {
    "id": 1,
    "nameHash": "403faabe7bb0",
    "codeHash": "98c9ec1c3c71",
    "isActive": true
  },
  "candidateSemesters": [
    {
      "id": 1,
      "nameHash": "403faabe7bb0",
      "codeHash": "98c9ec1c3c71",
      "isActive": true,
      "matchSignals": [
        "year-2025-or-earlier-fall-window",
        "term-2-or-second"
      ],
      "confidence": 0.7,
      "recommendedAsTarget": false
    },
    {
      "id": 2,
      "nameHash": "de09f4acea23",
      "codeHash": "138103e76b68",
      "isActive": false,
      "matchSignals": [
        "token-qiu",
        "inactive"
      ],
      "confidence": 0.45,
      "recommendedAsTarget": false
    },
    {
      "id": 3,
      "nameHash": "84d9662d836b",
      "codeHash": "00906e7bc88f",
      "isActive": false,
      "matchSignals": [
        "year-2025-or-earlier-fall-window",
        "token-qiu",
        "inactive"
      ],
      "confidence": 0.7,
      "recommendedAsTarget": false
    }
  ],
  "targetSemesterDecision": {
    "status": "existingCandidateFoundNeedsUserConfirmation",
    "recommendedOption": "useExisting2025FallCandidate",
    "forceActiveSemesterRecommended": false,
    "reason": "Found 1 inactive semester candidate with confidence >= 0.5 (id=3); user must confirm before L6 apply."
  },
  "gates": {
    "targetSemesterConfirmed": false,
    "targetSemesterCreatedOrSelected": false,
    "activeSemesterForceImportAllowed": false
  }
}
```

**关键结论**：
- 当前 DB 共 3 个 Semester 行。
- active semester: id=1 (isActive=true)。
- 2025秋 候选数量：3（heuristic 命中）。
- targetSemesterDecision.status = existingCandidateFoundNeedsUserConfirmation
- targetSemesterDecision.recommendedOption = useExisting2025FallCandidate
- 三道 gate（targetSemesterConfirmed / CreatedOrSelected / activeSemesterForceImportAllowed）全部 false。

## 7. Full Review Package 设计
Helper: `buildFullCourseSettingReviewPackage(dryRunResult, options)`（纯函数，pin `maxReviewRows=Infinity`）。
Local serializer: `serializeFullReviewPackageLocalArtifact(result, generatedAt, packageSha256?)`（pin `stage=L6_0_STAGE`、`packageType=full-redacted-review-package`、显式 `targetSemesterConfirmed=false`）。

## 8. Review item schema
同 L5：`{ reviewItemId, source, candidateRefs, classifications, reviewDecision="pending", suggestedAction, blockingReasons, diagnosticCodes, confidence }`。L6-0 不引入新字段。

## 9. Bucket 策略
15 个 buckets (与 L5 一致)：
```json
[
  {
    "bucket": "AUTO_SAFE_CANDIDATE",
    "count": 0,
    "description": "all entities exact, no risky diagnostics, confidence >= threshold; still requires human review in L5"
  },
  {
    "bucket": "TARGET_SEMESTER_REQUIRED",
    "count": 1116,
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

## 10. auto-safe candidate 严格条件
同 L5 7 条件；但 L6-0 调用时 `targetSemesterConfirmed = false` → auto-safe count = 0。

## 11. 当前样本 full review package 统计
```json
{
  "totalReviewItems": 1116,
  "autoSafeCandidates": 0,
  "blockedCandidates": 1116,
  "manualReviewRequired": 0,
  "rejectedByRule": 0,
  "allDecisionsPending": true
}
```

## 12. Local Full Redacted Package
- Path: `temp/local-artifacts/l6-0/xlsx-course-setting-review-package.full.redacted.json` (gitignored).
- SHA256: `769192b5bbd34b0390ab91def2e3885d967dc946b67a0de1ba533f7b020c400d`
- 形态：包含完整 reviewItems[]、buckets[]，不包含 raw teacher / class / course / remark / sheet 文本。
- 与 L5 artifact 的区分：`stage = L6_0_STAGE`、`packageType = full-redacted-review-package`、显式 `targetSemesterConfirmed: false`、`dryRunOnly: true`、`dbWritten: false`。

## 13. Safe Confirm Plan
```json
{
  "applyAllowedInL5": false,
  "applyAllowedInL60": false,
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

## 14. Transaction Plan
（仅在 L6 由 ADMIN 显式确认后才执行；L6-0 不执行。）
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

## 15. Rollback Plan
- Pre-BEGIN: capture DB backup (`prisma/dev.db.backup-before-l6-<timestamp>`) + SHA256 verify。
- On error during transaction: ROLLBACK。
- On post-apply audit failure: restore from pre-L6 backup。
- Audit log: `docs/l6-audit.json` with dry-run plan vs actual diff SHA256。

## 16. Source Evidence Forward-Fill Plan
同 L5：L4 已生成 9 字段 hash 化 draft；L6 apply 时将这些 draft 字段 forward-fill 到 `sourceKeyword` / `sourceClassName` / `sourceRemark` / `sourceArtifactFilename` / `importBatchId` / `matchStrategy` / `matchConfidence`。

## 17. DB Unchanged Proof
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

## 18. Privacy / Redaction Proof
- L5 helper + L6-0 thin wrappers 只产出 hash / id / count / classification / diagnostic code，不含 raw teacher/class/course/remark/sheet/row 文本。
- `privacy` block 7 个标志全部 `false`。
- N32-N42 扫描: 0 raw phone / 0 raw class name / 0 bare Chinese name / 0 long Chinese run / 0 raw sheet name — committed JSON AND local package 都通过。

## 19. 与 L5 / L4 / L3 / L2 / L1 的关系
- L1: structural xlsx audit (no parser)。本阶段不修改 L1。
- L2: pure xlsx parser → `CourseSettingXlsxParseResult`。本阶段不修改 L2。
- L3: preview-only API/UI over L2 (no DB)。本阶段不修改 L3 route / UI。
- L4: dry-run candidate mapping → `CourseSettingTeachingTaskDryRunResult`。本阶段不修改 L4 helper，仅消费 L4 result。
- L5: review package + safe confirm plan。本阶段仅在 L5 helper 上**新增**（不修改）`buildFullCourseSettingReviewPackage` + `serializeFullReviewPackageLocalArtifact` + `L6_0_STAGE` constant；其余 L5 行为不变。

## 20. 与旧 Word import 的隔离
- 旧 `parse_schedule.py` mtime=1781229170344 < L5 helper mtime=1781931286139（N49 PASS）。
- Word import route (`src/app/api/admin/import/parse/route.ts`) 未被 L6-0 修改。
- Word import confirm / rollback / abandon 未被 L6-0 修改。
- L2 xlsx parser / L4 dry-run mapper / L5 review helper 主体未被 L6-0 修改（L6-0 only appends 3 new exports）。

## 21. 验证结果
- N1 ✅ sample file exists — size=131200
- N2 ✅ sample file not git-tracked — name-hash d5c590e19e3f
- N3 ✅ L2 parser file exists — src/lib/import/course-setting-xlsx-parser.ts
- N4 ✅ L4 dry-run helper exists — src/lib/import/course-setting-teaching-task-dry-run.ts
- N5 ✅ L5 review-package helper exists — src/lib/import/course-setting-review-package-l5.ts
- N6 ✅ stage name constants present in L5 helper (L5_STAGE + L6_0_STAGE) — L5=true L6-0=true
- N7 ✅ parser returns course rows > 0 — totalCourseRows=1116
- N8 ✅ L4 dry-run result dryRunOnly = true — dryRunOnly=true
- N9 ✅ L6-0 review result reviewOnly = true — reviewOnly=true
- N10 ✅ L6-0 review result dryRunOnly = true — dryRunOnly=true
- N11 ✅ L6-0 review result dbWritten = false — dbWritten=false
- N12 ✅ reviewResult.stage = L5_STAGE (helper reuses L5 stage; L6-0 marker is on the serialized local artifact) — stage=L5-XLSX-COURSE-SETTING-REVIEW-PACKAGE-AND-SAFE-CONFIRM-PLAN
- N13 ✅ full review item count > 200 (uncapped vs L5 200-cap) — count=1116
- N14 ✅ full review item count = L4 teachingTaskCandidates (expected=1116, got=1116) — expected=1116 got=1116
- N15 ✅ all review items decision = pending — total=1116
- N16 ✅ no review item decision = approve (only suggestedAction) — all decisions are pending
- N17 ✅ autoSafeCandidates = 0 (targetSemesterConfirmed=false) — autoSafe=0
- N18 ✅ blockedCandidates = totalReviewItems (all blocked because target semester not confirmed) — blocked=1116 total=1116
- N19 ✅ safeConfirmPlan.requiredGates.targetSemesterConfirmed = false — targetSemesterConfirmed=false
- N20 ✅ safeConfirmPlan.applyAllowedInL5 = false (applyAllowedInL60 = false) — applyAllowedInL5=false
- N21 ✅ all 7 safe confirm gates = false — gates={"targetSemesterConfirmed":false,"reviewPackageApproved":false,"dbBackupCreated":false,"dryRunReplayMatchesApprovedPackage":false,"importBatchPlanGenerated":false,"rollbackPlanGenerated":false,"sourceEvidencePlanConfirmed":false}
- N22 ✅ semester table read-only summary generated (L60TargetSemesterAnalysis) — semesterCount=3 readOnly=true
- N23 ✅ active semester identified (or null if no active) — activeId=1 isActive=true
- N24 ✅ 2025 fall candidate detection executed — candidates=3
- N25 ✅ targetSemesterDecision.forceActiveSemesterRecommended = false — forceActive=false
- N26 ✅ recommended option is one of allowed values — recommendedOption=useExisting2025FallCandidate
- N27 ✅ local full redacted package generated — path=D:/Desktop/Course Development System/my-app/temp/local-artifacts/l6-0/xlsx-course-setting-review-package.full.redacted.json sha256=769192b5bbd34b03…
- N28 ✅ local package path under gitignored temp/local-artifacts/l6-0/ — D:/Desktop/Course Development System/my-app/temp/local-artifacts/l6-0/xlsx-course-setting-review-package.full.redacted.json
- N29 ✅ local package gitignored / not tracked — untracked (gitignored)
- N30 ✅ local package sha256 calculated — sha256=769192b5bbd34b0390ab91def2e3885d967dc946b67a0de1ba533f7b020c400d
- N31 ✅ local package rawContentIncluded = false — rawContentIncluded=false stage=L6-0-XLSX-COURSE-SETTING-TARGET-SEMESTER-AND-FULL-REVIEW-PACKAGE packageType=full-redacted-review-package
- N32 ✅ committed JSON contains no raw phone numbers — phone-pattern hits=0
- N33 ✅ committed JSON contains no raw class names — class-name hits=0
- N34 ✅ committed JSON contains no raw teacher/course names — bare-name hits=
- N35 ✅ committed JSON contains no raw remarks (long Chinese runs) — long-run hits=
- N36 ✅ committed JSON contains no raw sheet names — sheet-leak hits=
- N37 ✅ committed JSON privacy flags all false — {"rawTeacherNamesCommitted":false,"rawClassNamesCommitted":false,"rawCourseNamesCommitted":false,"rawRemarksCommitted":false,"rawRowsCommitted":false,"rawSheetNamesCommitted":false,"phoneNumbersCommitted":false}
- N38 ✅ local package no raw phone / class / sheet leaks — phone=0 classBan=0 sheetLeak=0
- N39 ✅ local package no raw teacher/course names — bare-name hits=
- N40 ✅ local package no raw remarks (long Chinese runs) — long-run hits=
- N41 ✅ committed JSON fullReviewPackage.allDecisionsPending = true — allDecisionsPending=true
- N42 ✅ committed JSON applyAllowedInL60 = false — applyAllowedInL60=false
- N43 ✅ no xlsx tracked (excluding templates/) — none
- N44 ✅ no dev.db / backup tracked — none
- N45 ✅ no temp/uploads tracked (excluding README/.gitkeep/templates) — none
- N46 ✅ no schema/migration changes — prisma/ clean
- N47 ✅ no API changes — src/app/api/ clean
- N48 ✅ no UI changes — src/components/ clean
- N49 ✅ old Word parser untouched (mtime) — parse_schedule.py mtime=1781229170344 < L5 helper mtime=1781931286139
- N50 ✅ no scheduler/score changes — src/lib/scheduler/ + src/lib/score.ts clean
- N51 ✅ no write methods in L5 helper (no prisma, no fs.write) — prisma=0 fsWrite=false
- N52 ✅ no business-table writes in L6-0 verify (no prisma.create/update/delete/upsert/$executeRaw) — prismaWrites=0 (writeFileSync is allowed for local artifact + committed JSON)
- N53 ✅ L4 dry-run mapper unchanged (L4_STAGE constant present) — l4HelperBytes=38073
- N54 ✅ L2 parser unchanged (parseCourseSettingXlsx export still present) — l2ParserBytes=32498
- N55 ✅ no destructive fs writes in L6-0 verify (writeFileSync only for committed JSON + local artifact) — fsWriteHits=false
- N56 ✅ DB counts unchanged before/after (9 tables incl. semester) — course=104 teacher=84 cg=36 task=308 ttc=446 ib=38 slot=440 adj=67 sem=3
- N57 ✅ Semester count unchanged — before=3 after=3
- N58 ✅ Course count unchanged — before=104 after=104
- N59 ✅ Teacher count unchanged — before=84 after=84
- N60 ✅ ClassGroup count unchanged — before=36 after=36
- N61 ✅ TeachingTask / TeachingTaskClass / ImportBatch / ScheduleSlot / ScheduleAdjustment counts unchanged — task=308 ttc=446 ib=38 slot=440 adj=67
- N62 ✅ L5 verify still PASS — exit OK
- N63 ✅ L4 verify still PASS — exit OK
- N64 ✅ L3 verify still PASS — exit OK
- N65 ✅ L2 parser verify still PASS — exit OK
- N66 ✅ L1 audit still PASS — exit OK
- N67 ✅ K39-B1 still PASS — exit OK
- N68 ✅ K39-B1A still PASS — exit OK
- N69 ✅ K39-C2 still PASS — exit OK
- N70 ✅ K39-C4 still PASS — exit OK
- N71 ✅ K22-C still PASS — exit OK
- N72 ✅ scan:docs-pii PASS — exit OK
- N73 ✅ build PASS — exit OK
- N74 ✅ targeted eslint PASS (L5 helper + L6-0 verify) — exit OK
- N75 ✅ git diff --check clean — no whitespace errors
- N76 ✅ final forbidden files check clean — none

**SUMMARY: PASS 76 / FAIL 0**

## 22. 下一阶段建议
Recommended next stage: L6-XLSX-COURSE-SETTING-APPLY-CONFIRMED
- 必须先由 ADMIN 显式确认 Option A：confirm-or-create-2025-fall-semester。
- 必须先生成 DB backup（`prisma/dev.db.backup-before-l6-<ts>`）。
- 必须审批 full review package（人工 override 所有 `pending` → `approved` / `rejected`）。
- dry-run replay 必须匹配 approved package（JSON strip `generatedAt` 后相等）。
- 必须 atomic transaction + rollback plan。
- apply 后必须 audit + K22-C 回归仍 73/0/0/0。
- L6 仍 review/approval-only 默认；未明确批准前不 apply。
