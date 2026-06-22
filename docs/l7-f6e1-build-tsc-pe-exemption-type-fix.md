# L7-F6E1-BUILD-TSC-PE-EXEMPTION-TYPE-FIX

> Stage: `L7-F6E1-BUILD-TSC-PE-EXEMPTION-TYPE-FIX`
> Date: 2026-06-22
> Status: **CLOSED**

## 一、Stage Summary

修复 L7-F6D1/D2 引入的 PE teacher exemption 导致的 TypeScript/build 类型错误。L7-F6D1 在 `course-setting-apply-l7-f.ts` 中添加了 `physicalEducationExempt` 分支处理逻辑，但 `L7FApplyPlanInput` 的 `teacherRef` 类型定义只包含 `useExisting | noTeacher` 两个变体，缺少 `physicalEducationExempt`。本阶段将其补齐，恢复 build + tsc。

## 二、Build / TSC Failure

```text
npm run build: FAIL (Next.js build type check failed)
npx tsc --noEmit: FAIL

error TS2367: This comparison appears to be unintentional because the types '"noTeacher"' and '"physicalEducationExempt"' have no overlap.
  → src/lib/import/course-setting-apply-l7-f.ts:528
  → src/lib/import/course-setting-apply-l7-f.ts:727

error TS2367: types '"useExisting" | "noTeacher"' and '"physicalEducationExempt"' have no overlap.
  → src/lib/import/course-setting-apply-l7-f.ts:541

error TS2339: Property 'exemptionCode' does not exist on type 'never'.
  → src/lib/import/course-setting-apply-l7-f.ts:542
  → src/lib/import/course-setting-apply-l7-f.ts:546
```

## 三、Root Cause

`L7FApplyPlanInput` 类型在 `course-setting-apply-l7-f.ts` line 158-160 定义 `teacherRef` 为:

```ts
teacherRef:
  | { kind: 'useExisting'; teacherId: number | null }
  | { kind: 'noTeacher' }
```

但 L7-F6D1 plan builder (`course-setting-partial-import-plan-l6-e2.ts` line 202) 创建的 teaching task 中 `teacherRef` 有第三个变体:

```ts
| { kind: 'physicalEducationExempt'; exemptionCode: 'PHYSICAL_EDUCATION_TEACHER_EXEMPT'; reason: string }
```

TypeScript 无法在 `teacherRef.kind` 上匹配 `'physicalEducationExempt'`，导致所有访问 `.exemptionCode` 的代码报 `never` 类型错误。

## 四、修复方案

在 `L7FApplyPlanInput.teacherRef` 联合类型中添加第三个变体:

```ts
teacherRef:
  | { kind: 'useExisting'; teacherId: number | null }
  | { kind: 'noTeacher' }
  | { kind: 'physicalEducationExempt'; exemptionCode: 'PHYSICAL_EDUCATION_TEACHER_EXEMPT'; reason: string }
```

**改动范围**: 仅 `src/lib/import/course-setting-apply-l7-f.ts` 一个文件，添加 1 行类型。

## 五、PE Exemption Semantics Preserved

- ✓ 体育课 teacherId=null 只有 `PHYSICAL_EDUCATION_TEACHER_EXEMPT` 才允许
- ✓ 非体育课 teacherId=null → `TEACHER_ID_MISSING` blocker
- ✓ invalid PE exemption code → `INVALID_TEACHER_EXEMPTION` blocker
- ✓ apply preflight 在 backup/transaction 前执行

## 六、Hard Gates Preserved

- ✓ non-PE teacherId null is blocker (line 534-539)
- ✓ PE exemption uses strict code match (line 541-548)
- ✓ apply preflight before backup (line 483+)
- ✓ natural key does not use `teacherId ?? "null"`

## 七、No-Write Proof

| 指标 | 值 |
|---|---|
| DB write | NONE |
| apply | NONE |
| backup | NONE |
| ImportBatch created | 0 |
| Course/Teacher/ClassGroup/TeachingTask/ScheduleSlot created | 0 |

## 八、Validation Results

- L7-F6E1 verify: 30/30 PASS
- L7-F6E regression: 153/155 PASS (2 expected: src/ change by L7-F6E1)
- L7-F6D2 regression: 131/131 PASS
- L7-F6D1 regression: 130/130 PASS
- L7-F6C regression: 142/142 PASS
- L7-F6B regression: 110/110 PASS
- L7-F6A regression: 110/110 PASS
- L7-F5D regression: 101/101 PASS
- prisma validate: PASS
- migrate status: up to date
- scan:docs-pii: PASS
- build: PASS
- tsc: PASS
- eslint: 0 errors
- K22-C: PASS
- git diff: clean
- forbidden files: clean

## 九、Next Stage

L7-F6E1 完成后，build/tsc 不再阻塞 L7-F6E。下一阶段应为 **L7-F6F-CONTROLLED-DB-COLLISION-RECONCILIATION-WRITE** (写 migration 规范化 L7-F6C 的 9 个 double-级 plannedName)。

仍不能进入 L7-F7 或 L7-G。
