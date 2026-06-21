# L6-E1A XLSX Course Setting Teacher Reference Audit

> Stage: **L6-E1A-XLSX-COURSE-SETTING-TEACHER-REFERENCE-AUDIT**
> Status: **PASS** (read-only audit)

## 1. Staff Reference Database

| field | value |
|---|---|
| filename | `6bccbd173598` (hash) |
| file size | 49152 bytes |
| tables | 1 (职员) |
| records | 436 |
| unique normalized names | 424 |
| duplicate groups | 10 |
| blank names | 0 |
| departments | 28 |
| fields | id, 部门, 姓名, 职务, 职级, 办公电话 (隐私 — 仅检测不输出), 手机 (隐私 — 仅检测不输出), 工号 |

## 2. Current Teacher Table

| field | value |
|---|---|
| count | 84 |
| unique names | 84 |
| unique normalized | 84 |
| duplicate normalized groups | 0 |

## 3. Excel Teacher Text

| field | value |
|---|---|
| raw total | 1160 |
| unique raw | 357 |
| blank | 86 |
| split (multi-teacher) | 71 |
| unique normalized | 357 |

## 4. Three-Way Match

### Excel → Teacher
| type | count |
|---|---|
| exact | 326 |
| normalized exact | 0 |
| missing | 748 |
| blank | 86 |

### Excel → Staff
| type | count |
|---|---|
| exact | 881 |
| normalized exact | 0 |
| ambiguous | 0 |
| missing | 193 |
| blank | 86 |

### Teacher → Staff
| type | count |
|---|---|
| exact | 79 |
| normalized exact | 0 |
| ambiguous | 0 |
| missing | 5 |

## 5. Candidate Analysis

| type | count |
|---|---|
| missingInTeacherButFoundInStaff | 559 |
| missingInTeacherAndMissingInStaff | 189 |
| needsManualReview | 71 |

## 6. Risks

| severity | description | count |
|---|---|---|
| HIGH | 大量Excel教师不在Teacher表但在教职工库中，建议受控同步 | 559 |
| HIGH | 大量Excel教师既不在Teacher表也不在教职工库，需人工核实 | 189 |
| MEDIUM | 教职工库存在同名重复，人工审核时需注意工号辅助 | 10 |
| MEDIUM | Excel教师原文直接匹配率偏低，可能需要做跨学期规范化 | 326 |
| LOW | 多教师单元格需要拆分处理 | 71 |

## 7. DB Read-Only Proof

| field | before | after |
|---|---|---|
| Teacher count | 84 | 84 |
| counts unchanged | YES |
| prisma methods | findMany, count (0 writes) |

## 8. Next Stage

Based on audit results:
- If Teacher table missing many but staff DB is reliable → L6-E1B: controlled sync plan (dry-run first)
- If Teacher table is sufficient → L6-E2: partial import plan
