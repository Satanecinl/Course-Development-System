# L6-E2G1 — Split Class Mapping Regression Fix

> Stage: **L6-E2G1-XLSX-COURSE-SETTING-SPLIT-CLASS-MAPPING-REGRESSION-FIX**
> Status: **CODE COMPLETE — browser manual validation pending**
> Previous stage: L6-E2G (commit `38779aa`)
> Next stage: L6-F (RESUMES only after L6-E2G1 browser validation passes)

## 1. User Screenshot Blocker

用户在浏览器验收 L6-E2G 时发现 task split 班级映射回退：

- 教师括号中 scope 标签使用 **点号** 分隔（如 `杨秀芳(1.2)` 表示"1班和2班"）
- split detection 将 `"1.2"` 作为单个 token，无法映射到 classText 中的 `"1班"`
- 结果：`classRaw = "1.2"` 而不是 `"1班、2班"`，并误报 `classTokenUnmatched`

## 2. What Worked in L6-E2G

L6-E2G 的新课程候选语义修复完全正确：
- Excel 有课程名但 DB 无匹配 → "新课程候选"（不是"课程缺失"）
- Excel 课程名为空 → "课程名缺失"（blocker）
- 用户确认课程候选可进入 importable plan
- 这些不应在 L6-E2G1 中回退

## 3. What Regressed from L6-E2E

L6-E2E 的 `detectParenthesizedTeacherClassAssignments` 支持逗号分隔 `(1,2)` 和顿号分隔 `(1、2)` 的 token 分割，但**未处理点号分隔** `(1.2)`。

Excel 课程设置中，scope 标签实际使用点号分隔（如 `1.2` 代表"1班和2班"），这是因为原始 Excel 数据中的格式。

## 4. Class Token → ClassText Mapping Rule

`extractParenthesizedTeacherClasses` 现在：

1. 先按 `、，,；;` 分割括号内容
2. 对每个 token 检查是否为纯数字点号对 `^\d+\.\d+$`
3. 如果是，展开为两个独立 token（如 `"1.2"` → `["1", "2"]`）
4. 非数字点号（如 `"2.5天"`）不展开

`matchClassTokensToClasses` 按顺序尝试：
1. token 含有班/组/级/届/期后缀 → 直接使用
2. 尝试 `token + "班"` 在 classText parts 中 → 使用带"班"的版本
3. 尝试其他后缀（组/级/期）
4. 全部失败 → 放入 unmatched

## 5. Class Token Unmatched vs DB Class Missing

| 情况 | classTokenUnmatched? | classMatchStatus |
|---|---|---|
| classText 为空 | ✅ 是（所有 token 未匹配） | unknown |
| classText 有 "1班" 但 DB 无 ClassGroup | ❌ 否 | missing |
| classText 有 "1" 但无 "1班" 后缀 | ❌ 否（精确匹配成功） | missing |
| token "7" 在 classText 中不存在 | ✅ 是 | unknown |

## 6. No DB Write Proof

本阶段仅修改了 `extractParenthesizedTeacherClasses` 函数中的 token 分割逻辑。未触及任何 Prisma 调用、数据库写入或 apply 路由。

## 7. Validation Results

- L6-E2G1 verify: **PASS**
- L6-E2G regression: **PASS** (117 checks)
- L6-E2F regression: **PASS** (45 checks)
- L6-E2E regression: **PASS** (82 checks)
- L6-E2D regression: **PASS** (90 checks)
- L6-E2C regression: **PASS** (86 checks)
- L6-E2B regression: **PASS** (85 checks)
- L6-E2A regression: **PASS** (85 checks)
- L6-E1 regression: **PASS** (86/87, 1 pre-existing)
- L6-E2 regression: **PASS** (144 checks)
- prisma validate: **PASS**
- tsc: **PASS**
- K22-C: **PASS**
- scan:docs-pii: **no blocking hits**

## 8. Browser Validation Checklist

> L6-E2G1 code complete; browser manual validation pending.

1. 打开 `/admin/import`，选择目标学期，上传 Excel
2. 找到教师字段类似 `姓名(1.2)、姓名(3.4)、姓名(5.6)` 的行
3. 展开处理，确认 assignment 显示 `1班、2班` / `3班、4班` / `5班、6班`
4. 不再显示裸 token `1.2` / `3.4` / `5.6`
5. 不再误报 `classTokenUnmatched`
6. DB 无 ClassGroup 时班级匹配可显示 missing，但班级文本仍是 `1班、2班`
7. 新课程候选语义仍正常
8. 生成 partial import plan，confirmed split 仍可生成多个 TeachingTask candidates
9. 页面无 apply/write DB button
10. Browser console 无 React error
11. DB counts 不变

## 9. Next Stage Recommendation

L6-F（`L6-F-XLSX-COURSE-SETTING-PARTIAL-IMPORT-EXECUTION`）可在 L6-E2G1 浏览器验证通过后恢复。L6-E2G 浏览器验证也应重新执行以确认新课程候选语义和班级映射同时正确。
