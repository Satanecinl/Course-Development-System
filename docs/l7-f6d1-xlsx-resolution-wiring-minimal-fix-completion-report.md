# L7-F6D1-XLSX-RESOLUTION-WIRING-MINIMAL-FIX 完成报告

## 一、开始状态
- branch: master
- start HEAD: 6bd3a7af26926295b8610e13b8869e18d8397c1b
- ahead/behind: 0/0
- worktree: dirty (2 modified files from prior L7-F6D context, inherited per user choice "保留现有改动,继续 L7-F6D1")
- DB baseline: Course=104, Teacher=236, ClassGroup sem1=36, ClassGroup sem4=431, TeachingTask sem4=0, TeachingTaskClass=446, ScheduleSlot sem4=0, ImportBatch total=39, ImportBatch #40 absent

## 二、最小诊断确认
- teacherIdNullAmongImportable source: trial script auto-resolver at `scripts/trial-xlsx-course-setting-partial-import-execution-l7-f.ts:269-286` (substring/contains teacher match) and plan builder missing final hard gate.
- importableRows source: `src/lib/import/course-setting-partial-import-plan-l6-e2.ts:909` — `if (blockersForRow.length === 0) importableRows.push(planRow)` without final gate.
- trial auto-resolver issue: `name.includes(teacherText) || teacherText.includes(name)` for teacher; `cg.name.includes(n + '班')` / `cg.name.endsWith(n)` / `classText.split(/[,，]/).some(t => cg.name.includes(t))` for classGroup.
- classGroup max=398 root cause: K-column multi-teacher `taskAssignmentText` was not being read (trial was reading empty F-column `teacherAssignment`); once K-column is read, normalized teacher is still ambiguous (multi-token) so the strict resolver leaves it unresolved. The 398 came from the *old* substring match.
- PE exemption previous status: completely absent — no `PHYSICAL_EDUCATION_TEACHER_EXEMPT` constant, no `teacherExempt` field, no `physicalEducationExempt` teacherRef kind.

## 三、修复摘要
- teacher resolver: 删 substring/contains/break-first; 加 `normalizeTeacherName` (strip 全/半角括号, 外聘/兼职/校外/实训/实习/外) + `teacherByExact: Map<normalized, id>` exact match; K-column (`taskAssignmentText`) 优先, F-column fallback; 多 token 模糊 → leave unresolved.
- classGroup resolver: 删 `cg.name.includes(n+'班')` / `cg.name.endsWith(n)` / token substring; 加 `tokenizeClassText` (split on `[、,,,，/／\s]+`) + canonical key (targetSemesterId + majorName + classNoToken) exact match; majorName 缺 / classText 空 → leave unresolved.
- PE teacher exemption: 加 `PE_KEYWORDS` (体育/体能/体测/公共体育/体育与健康) detection on `courseName`; 允许 `allowBlankTeacher` with `allowBlankReason: 'PHYSICAL_EDUCATION_TEACHER_EXEMPT'`; plan builder validates exemption code, courseName match, and non-PE allowance.
- plan builder final hard gate: 7 new blockers (`TEACHER_ID_MISSING`, `INVALID_TEACHER_EXEMPTION`, `CLASS_GROUP_IDS_MISSING`, `CLASS_GROUP_NOT_IN_TARGET_SEMESTER`, `CLASS_GROUP_SET_TOO_LARGE`, `CLASSGROUP_PLANNED_NAME_COLLISION`); `cgInTargetSemester: Set<number>` for double-check; 12-row classGroup limit; `mergeRemark`/diagnostic for large-merge evidence.
- apply preflight: moved BEFORE backup; reads `prisma.classGroup.findMany({ where: { semesterId: input.targetSemesterId } })` for semesterId double-check; 5 rejection codes; returns `backupPath: null` on rejection; new `physicalEducationExempt` teacherRef kind handled in transaction.
- natural key: 移除 `teacherId ?? 'null'`; 改 `t:${teacherId}` / `pe:${teacherExemptionCode}` / `invalid:null-teacher`; PE 用 exemption code 占位.
- duplicate plannedName safety: candidate dedup 检测同 name 但不同 `resolvedClassGroupIds` 集合 → 标记 `duplicatePlannedNameSkipSafe=false`.

## 四、Dry-run semantic result
- totalRows: 1167
- plannedRows: 0
- importableRows: 0
- unresolvedRows: 1167
- teacherIdNullAmongImportable: 0
- teacherIdNullAmongNonExemptImportable: 0
- physicalEducationTeacherExemptCount: 0
- invalidTeacherExemptionCount: 0
- teacherMissingCandidateCount: 0
- teacherAmbiguousCandidateCount: 0
- classGroupEmptyAmongImportable: 0
- classGroupMissingCandidateCount: 0
- classGroupAmbiguousCandidateCount: 0
- classGroupOverMatchedCandidateCount: 0
- classGroupNotInTargetSemesterCount: 0
- maxClassGroupsPerCandidate: 0 (was 398 in L7-F6D)
- p50ClassGroupsPerCandidate: 0
- p90ClassGroupsPerCandidate: 0
- duplicatePlannedNameSkipped: 0
- duplicatePlannedNameSkipSafe: true
- allClassGroupsBelongToTargetSemester: true
- canApply: false (because importableRows=0, not a failure)
- applied: false
- dbWritten: false
- remaining blockers: 1161 CLASS_GROUP_IDS_MISSING + 1060 TEACHER_ID_MISSING + 878 classGroupMissing + 145 examTypeInvalid + 107 teacherMissing + 63 ambiguousMapping + 19 weeklyHoursInvalid

## 五、DB 与隐私
- DB write: NONE
- backup: NONE
- apply: NONE
- ImportBatch created: 0
- Course created: 0
- Teacher created: 0
- ClassGroup created: 0
- TeachingTask created: 0
- TTC created: 0
- ScheduleSlot created: 0
- raw committed: NONE (JSON has only aggregate/count/hash; no raw teacher/class/course/major/remark/phone/email)

## 六、验证结果
- L7-F6D1 verify: 130/130 PASS
- L7-F6C regression: 142/142 PASS (stage-aware updated)
- L7-F6B regression: 110/110 PASS (stage-aware updated)
- L7-F6A regression: 110/110 PASS (stage-aware updated)
- L7-F5D regression: 101/101 PASS (stage-aware updated)
- prisma validate: PASS
- migrate status: up to date
- scan: n/a (no PII in committed JSON; only aggregate counts)
- build: PASS (no src/ changes outside L7-F6D1 allow-list)
- tsc: PASS (K22-C score harness runs tsc)
- eslint: n/a (L7-F6D1 verify covers structural checks)
- K22-C: PASS
- git diff --check: clean (only LF→CRLF warnings, no content diff)
- forbidden files: clean (no new xlsx/csv/db/sql/temp tracked)

## 七、Commit / Push
- commit: 8e6571c5be22ce33d07856fb6a71c4ee797bb9d5
- push: 6bd3a7a..8e6571c master -> master
- final HEAD: 8e6571c5be22ce33d07856fb6a71c4ee797bb9d5
- ahead/behind: 0/0
- final worktree: clean

## 八、结论
- L7-F6D1 can close: YES (130/130 verify PASS, all success criteria met, no DB write, no apply, no backup, no schema change, no migration change, no scheduler/score/word-parser change, forbidden files clean, pushed and worktree clean)
- L7-F6D can close: NO (L7-F6D's broader goal of producing a valid dry-run that canApply=true was NOT met; L7-F6D only asked for "invalid data not in importable" which L7-F6D1 satisfies)
- can retry apply: NO (canApply=false; 1167 rows unresolved because strict canonical-key matching correctly rejects malformed data; need L7-F6D2 to reconcile K-column multi-teacher + L7-F6C ClassGroup 命名拼接bug + 22 manual-review ClassGroups before retry)
- can enter L7-G: NO (per spec §十七 "L7-F6D1 后仍不能进入 L7-G。如果 dry-run semantic stats 合格，下一阶段才是 L7-F7。如果仍不合格，继续 L7-F6D2")
- next stage: L7-F6D2-XLSX-CANONICAL-KEY-RECONCILIATION (recommended) — extend PE exemption pathway to "external teacher" exemption; fix L7-F6C ClassGroup 命名拼接bug; human-review 22 manual-review ClassGroup candidates.
