# K18-C Task 37 Source Artifact Review

Generated: 2026-06-03T03:51:40.059Z

## 1. Background

K18-B repaired 4 confirmed cross-cohort merge errors (tasks 168, 174, 176, 181) by removing
incorrect TeachingTaskClass links to ClassGroup 22 (2024级钢铁智能冶金技术1班（高本贯通）).
Task 37 (习近平新时代中国特色社会主义思想概论) remained as the only cross-cohort candidate,
classified as NEEDS_SOURCE_REVIEW by K17-FIX-B.

## 2. Goal

Review source artifacts for task 37 to determine whether its cross-cohort grouping
(2025级 + 2024级) is a legitimate public course arrangement or an import matching error.

## 3. Scope

- Read-only review of DB state, parsed JSON, and historical documents
- No modifications to any business data, schema, or import logic

## 4. Task 37 Current State

- **TeachingTask ID**: 37
- **Course**: 习近平新时代中国特色社会主义思想概论 (id=10)
- **Teacher**: 房忠敏 (id=16)
- **Semester**: 既有数据默认学期 (id=1)
- **ImportBatch**: id=1, status=confirmed
- **Remark**: 2024级森林草原防火技术1班
- **Week**: ALL, weeks 1-16
- **ClassGroups**:
  - id=3: 2025级钢铁智能冶金技术1班（高本贯通） (cohortYear=2025, track=高本贯通, students=30)
  - id=17: 2025级森林草原防火技术1班 (cohortYear=2025, track=null, students=31)
  - id=35: 2024级森林草原防火技术1班 (cohortYear=2024, track=null, students=37)
- **Cohort Years**: [2025, 2024]
- **Is Cross-Cohort**: true
- **ScheduleSlots**:
  - id=43: day=1, slot=5, room=1号楼虚拟仿真实训室 (id=18, cap=100)
- **Is only remaining cross-cohort candidate after K18-B**: true

## 5. Source Artifact Status

- **Parsed JSON found**: true
- **DOCX found**: true
- **Source artifact found**: true
- **ImportBatch originalFilePath**: uploads/imports/1780035124021-sejcg9dy.docx
- **ImportBatch parsedJsonPath**: uploads/imports/1780035124021-sejcg9dy.json

## 6. Source Evidence Findings

Searched all 17 parsed JSON files in uploads/imports/.

| Source | Match Type | Evidence | Confidence |
|--------|-----------|----------|------------|
| uploads/imports/1779884424539-wlidp76z.json | remark | class=2025级钢铁智能冶金技术1班（高本贯通）, remark="与森防合班" | HIGH |
| uploads/imports/1779884424539-wlidp76z.json | teacher | class=2025级钢铁智能冶金技术1班（高本贯通）, teacher=房忠敏, remark=与森防合班 | HIGH |
| uploads/imports/1779884424539-wlidp76z.json | remark | class=2025级森林草原防火技术1班, remark="与高本贯通合班" | HIGH |
| uploads/imports/1779884424539-wlidp76z.json | teacher | class=2025级森林草原防火技术1班, teacher=房忠敏, remark=与高本贯通合班 | HIGH |
| uploads/imports/1779884429876-r7u2mgcx.json | remark | class=2025级钢铁智能冶金技术1班（高本贯通）, remark="与森防合班" | HIGH |
| uploads/imports/1779884429876-r7u2mgcx.json | teacher | class=2025级钢铁智能冶金技术1班（高本贯通）, teacher=房忠敏, remark=与森防合班 | HIGH |
| uploads/imports/1779884429876-r7u2mgcx.json | remark | class=2025级森林草原防火技术1班, remark="与高本贯通合班" | HIGH |
| uploads/imports/1779884429876-r7u2mgcx.json | teacher | class=2025级森林草原防火技术1班, teacher=房忠敏, remark=与高本贯通合班 | HIGH |
| uploads/imports/1779884487689-jokh5t82.json | remark | class=2025级钢铁智能冶金技术1班（高本贯通）, remark="与森防合班" | HIGH |
| uploads/imports/1779884487689-jokh5t82.json | teacher | class=2025级钢铁智能冶金技术1班（高本贯通）, teacher=房忠敏, remark=与森防合班 | HIGH |
| uploads/imports/1779884487689-jokh5t82.json | remark | class=2025级森林草原防火技术1班, remark="与高本贯通合班" | HIGH |
| uploads/imports/1779884487689-jokh5t82.json | teacher | class=2025级森林草原防火技术1班, teacher=房忠敏, remark=与高本贯通合班 | HIGH |
| uploads/imports/1779933822564-7pxf32k7.json | remark | class=2025级钢铁智能冶金技术1班（高本贯通）, remark="与森防合班" | HIGH |
| uploads/imports/1779933822564-7pxf32k7.json | teacher | class=2025级钢铁智能冶金技术1班（高本贯通）, teacher=房忠敏, remark=与森防合班 | HIGH |
| uploads/imports/1779933822564-7pxf32k7.json | remark | class=2025级森林草原防火技术1班, remark="与高本贯通合班" | HIGH |
| uploads/imports/1779933822564-7pxf32k7.json | teacher | class=2025级森林草原防火技术1班, teacher=房忠敏, remark=与高本贯通合班 | HIGH |
| uploads/imports/1779933960259-p6y2noah.json | remark | class=2025级钢铁智能冶金技术1班（高本贯通）, remark="与森防合班" | HIGH |
| uploads/imports/1779933960259-p6y2noah.json | teacher | class=2025级钢铁智能冶金技术1班（高本贯通）, teacher=房忠敏, remark=与森防合班 | HIGH |
| uploads/imports/1779933960259-p6y2noah.json | remark | class=2025级森林草原防火技术1班, remark="与高本贯通合班" | HIGH |
| uploads/imports/1779933960259-p6y2noah.json | teacher | class=2025级森林草原防火技术1班, teacher=房忠敏, remark=与高本贯通合班 | HIGH |
| uploads/imports/1779943575320-txese617.json | remark | class=2025级钢铁智能冶金技术1班（高本贯通）, remark="与森防合班" | HIGH |
| uploads/imports/1779943575320-txese617.json | teacher | class=2025级钢铁智能冶金技术1班（高本贯通）, teacher=房忠敏, remark=与森防合班 | HIGH |
| uploads/imports/1779943575320-txese617.json | remark | class=2025级森林草原防火技术1班, remark="与高本贯通合班" | HIGH |
| uploads/imports/1779943575320-txese617.json | teacher | class=2025级森林草原防火技术1班, teacher=房忠敏, remark=与高本贯通合班 | HIGH |
| uploads/imports/1779944138596-jzaa5cyg.json | remark | class=2023级护理（五年制）1班张洪宇[手机号已脱敏], remark="与23学前五年制合班 （） 409" | HIGH |
| uploads/imports/1779944138596-jzaa5cyg.json | remark | class=2023级护理（五年制）1班张洪宇[手机号已脱敏], remark="与23学前五年制合班 形势与政策崔春梅后八周（） 413" | HIGH |
| uploads/imports/1779944138596-jzaa5cyg.json | remark | class=2023级口腔医学技术（五年制）1班田洋[手机号已脱敏], remark="与23学前五年制合班 （） 409" | HIGH |
| uploads/imports/1779944138596-jzaa5cyg.json | remark | class=2023级口腔医学技术（五年制）1班田洋[手机号已脱敏], remark="与23学前五年制合班 形势与政策崔春梅后八周（） 413" | HIGH |
| uploads/imports/1779944138596-jzaa5cyg.json | teacher | class=2025级护理（二年制）1班 张洪宇[手机号已脱敏], teacher=房忠敏, remark=429 | HIGH |
| uploads/imports/1779944138596-jzaa5cyg.json | teacher | class=2025级护理（二年制）2班张洪宇[手机号已脱敏], teacher=房忠敏, remark=429 | HIGH |
| uploads/imports/1779944138596-jzaa5cyg.json | teacher | class=2025级口腔医学技术1班, teacher=房忠敏, remark=614 | HIGH |
| uploads/imports/1779944138596-jzaa5cyg.json | teacher | class=2025 级口腔医学技术2班, teacher=房忠敏, remark=614 | HIGH |
| uploads/imports/1779944138596-jzaa5cyg.json | remark | class=2025级钢铁智能冶金技术1班（高本贯通）, remark="与森防合班" | HIGH |
| uploads/imports/1779944138596-jzaa5cyg.json | teacher | class=2025级钢铁智能冶金技术1班（高本贯通）, teacher=房忠敏, remark=与森防合班 | HIGH |
| uploads/imports/1779944138596-jzaa5cyg.json | remark | class=2025级森林草原防火技术1班, remark="与高本贯通合班" | HIGH |
| uploads/imports/1779944138596-jzaa5cyg.json | teacher | class=2025级森林草原防火技术1班, teacher=房忠敏, remark=与高本贯通合班 | HIGH |
| uploads/imports/1779944138596-jzaa5cyg.json | teacher | class=2025级高速铁路客运服务1班, teacher=房忠敏, remark=(none) | HIGH |
| uploads/imports/1779944138596-jzaa5cyg.json | teacher | class=2025级高速铁路客运服务1班, teacher=房忠敏, remark=八东一 | HIGH |
| uploads/imports/1779944138596-jzaa5cyg.json | teacher | class=2025级高速铁路客运服务2班, teacher=房忠敏, remark=(none) | HIGH |
| uploads/imports/1779944138596-jzaa5cyg.json | teacher | class=2025级高速铁路客运服务2班, teacher=房忠敏, remark=八东一 | HIGH |
| uploads/imports/1779944450360-2fawvrrl.json | remark | class=2025级钢铁智能冶金技术1班（高本贯通）, remark="与森防合班" | HIGH |
| uploads/imports/1779944450360-2fawvrrl.json | teacher | class=2025级钢铁智能冶金技术1班（高本贯通）, teacher=房忠敏, remark=与森防合班 | HIGH |
| uploads/imports/1779944450360-2fawvrrl.json | remark | class=2025级森林草原防火技术1班, remark="与高本贯通合班" | HIGH |
| uploads/imports/1779944450360-2fawvrrl.json | teacher | class=2025级森林草原防火技术1班, teacher=房忠敏, remark=与高本贯通合班 | HIGH |
| uploads/imports/1779950873258-o7hbe67f.json | remark | class=2025级钢铁智能冶金技术1班（高本贯通）, remark="与森防合班" | HIGH |
| uploads/imports/1779950873258-o7hbe67f.json | teacher | class=2025级钢铁智能冶金技术1班（高本贯通）, teacher=房忠敏, remark=与森防合班 | HIGH |
| uploads/imports/1779950873258-o7hbe67f.json | remark | class=2025级森林草原防火技术1班, remark="与高本贯通合班" | HIGH |
| uploads/imports/1779950873258-o7hbe67f.json | teacher | class=2025级森林草原防火技术1班, teacher=房忠敏, remark=与高本贯通合班 | HIGH |
| uploads/imports/1779951224407-rzbu5xc5.json | remark | class=2023级护理（五年制）1班张洪宇[手机号已脱敏], remark="与23学前五年制合班 （） 409" | HIGH |
| uploads/imports/1779951224407-rzbu5xc5.json | remark | class=2023级护理（五年制）1班张洪宇[手机号已脱敏], remark="与23学前五年制合班 形势与政策崔春梅后八周（） 413" | HIGH |
| uploads/imports/1779951224407-rzbu5xc5.json | remark | class=2023级口腔医学技术（五年制）1班田洋[手机号已脱敏], remark="与23学前五年制合班 （） 409" | HIGH |
| uploads/imports/1779951224407-rzbu5xc5.json | remark | class=2023级口腔医学技术（五年制）1班田洋[手机号已脱敏], remark="与23学前五年制合班 形势与政策崔春梅后八周（） 413" | HIGH |
| uploads/imports/1779951224407-rzbu5xc5.json | teacher | class=2025级护理（二年制）1班 张洪宇[手机号已脱敏], teacher=房忠敏, remark=429 | HIGH |
| uploads/imports/1779951224407-rzbu5xc5.json | teacher | class=2025级护理（二年制）2班张洪宇[手机号已脱敏], teacher=房忠敏, remark=429 | HIGH |
| uploads/imports/1779951224407-rzbu5xc5.json | teacher | class=2025级口腔医学技术1班, teacher=房忠敏, remark=614 | HIGH |
| uploads/imports/1779951224407-rzbu5xc5.json | teacher | class=2025 级口腔医学技术2班, teacher=房忠敏, remark=614 | HIGH |
| uploads/imports/1779951224407-rzbu5xc5.json | remark | class=2025级钢铁智能冶金技术1班（高本贯通）, remark="与森防合班" | HIGH |
| uploads/imports/1779951224407-rzbu5xc5.json | teacher | class=2025级钢铁智能冶金技术1班（高本贯通）, teacher=房忠敏, remark=与森防合班 | HIGH |
| uploads/imports/1779951224407-rzbu5xc5.json | remark | class=2025级森林草原防火技术1班, remark="与高本贯通合班" | HIGH |
| uploads/imports/1779951224407-rzbu5xc5.json | teacher | class=2025级森林草原防火技术1班, teacher=房忠敏, remark=与高本贯通合班 | HIGH |
| uploads/imports/1779951224407-rzbu5xc5.json | teacher | class=2025级高速铁路客运服务1班, teacher=房忠敏, remark=(none) | HIGH |
| uploads/imports/1779951224407-rzbu5xc5.json | teacher | class=2025级高速铁路客运服务1班, teacher=房忠敏, remark=八东一 | HIGH |
| uploads/imports/1779951224407-rzbu5xc5.json | teacher | class=2025级高速铁路客运服务2班, teacher=房忠敏, remark=(none) | HIGH |
| uploads/imports/1779951224407-rzbu5xc5.json | teacher | class=2025级高速铁路客运服务2班, teacher=房忠敏, remark=八东一 | HIGH |
| uploads/imports/1779951316728-rcte9nzg.json | remark | class=2025级钢铁智能冶金技术1班（高本贯通）, remark="与森防合班" | HIGH |
| uploads/imports/1779951316728-rcte9nzg.json | teacher | class=2025级钢铁智能冶金技术1班（高本贯通）, teacher=房忠敏, remark=与森防合班 | HIGH |
| uploads/imports/1779951316728-rcte9nzg.json | remark | class=2025级森林草原防火技术1班, remark="与高本贯通合班" | HIGH |
| uploads/imports/1779951316728-rcte9nzg.json | teacher | class=2025级森林草原防火技术1班, teacher=房忠敏, remark=与高本贯通合班 | HIGH |
| uploads/imports/1779954351511-hgcdh2pw.json | remark | class=2025级钢铁智能冶金技术1班（高本贯通）, remark="与森防合班" | HIGH |
| uploads/imports/1779954351511-hgcdh2pw.json | teacher | class=2025级钢铁智能冶金技术1班（高本贯通）, teacher=房忠敏, remark=与森防合班 | HIGH |
| uploads/imports/1779954351511-hgcdh2pw.json | remark | class=2025级森林草原防火技术1班, remark="与高本贯通合班" | HIGH |
| uploads/imports/1779954351511-hgcdh2pw.json | teacher | class=2025级森林草原防火技术1班, teacher=房忠敏, remark=与高本贯通合班 | HIGH |
| uploads/imports/1779959653439-24xx4q2x.json | remark | class=2025级钢铁智能冶金技术1班（高本贯通）, remark="与森防合班" | HIGH |
| uploads/imports/1779959653439-24xx4q2x.json | teacher | class=2025级钢铁智能冶金技术1班（高本贯通）, teacher=房忠敏, remark=与森防合班 | HIGH |
| uploads/imports/1779959653439-24xx4q2x.json | remark | class=2025级森林草原防火技术1班, remark="与高本贯通合班" | HIGH |
| uploads/imports/1779959653439-24xx4q2x.json | teacher | class=2025级森林草原防火技术1班, teacher=房忠敏, remark=与高本贯通合班 | HIGH |
| uploads/imports/1780022027147-ptuir9ma.json | remark | class=2025级钢铁智能冶金技术1班（高本贯通）, remark="与森防合班" | HIGH |
| uploads/imports/1780022027147-ptuir9ma.json | teacher | class=2025级钢铁智能冶金技术1班（高本贯通）, teacher=房忠敏, remark=与森防合班 | HIGH |
| uploads/imports/1780022027147-ptuir9ma.json | remark | class=2025级森林草原防火技术1班, remark="与高本贯通合班" | HIGH |
| uploads/imports/1780022027147-ptuir9ma.json | teacher | class=2025级森林草原防火技术1班, teacher=房忠敏, remark=与高本贯通合班 | HIGH |
| uploads/imports/1780034746995-iffaqlb9.json | remark | class=2025级钢铁智能冶金技术1班（高本贯通）, remark="与森防合班" | HIGH |
| uploads/imports/1780034746995-iffaqlb9.json | teacher | class=2025级钢铁智能冶金技术1班（高本贯通）, teacher=房忠敏, remark=与森防合班 | HIGH |
| uploads/imports/1780034746995-iffaqlb9.json | remark | class=2025级森林草原防火技术1班, remark="与高本贯通合班" | HIGH |
| uploads/imports/1780034746995-iffaqlb9.json | teacher | class=2025级森林草原防火技术1班, teacher=房忠敏, remark=与高本贯通合班 | HIGH |
| uploads/imports/1780035124021-sejcg9dy.json | remark | class=2025级钢铁智能冶金技术1班（高本贯通）, remark="与森防合班" | HIGH |
| uploads/imports/1780035124021-sejcg9dy.json | teacher | class=2025级钢铁智能冶金技术1班（高本贯通）, teacher=房忠敏, remark=与森防合班 | HIGH |
| uploads/imports/1780035124021-sejcg9dy.json | remark | class=2025级森林草原防火技术1班, remark="与高本贯通合班" | HIGH |
| uploads/imports/1780035124021-sejcg9dy.json | teacher | class=2025级森林草原防火技术1班, teacher=房忠敏, remark=与高本贯通合班 | HIGH |
| uploads/imports/1780402522289-7mlo9dn8.json | remark | class=2023级护理（五年制）1班张洪宇[手机号已脱敏], remark="与23学前五年制合班 （） 409" | HIGH |
| uploads/imports/1780402522289-7mlo9dn8.json | remark | class=2023级护理（五年制）1班张洪宇[手机号已脱敏], remark="与23学前五年制合班 形势与政策崔春梅后八周（） 413" | HIGH |
| uploads/imports/1780402522289-7mlo9dn8.json | remark | class=2023级口腔医学技术（五年制）1班田洋[手机号已脱敏], remark="与23学前五年制合班 （） 409" | HIGH |
| uploads/imports/1780402522289-7mlo9dn8.json | remark | class=2023级口腔医学技术（五年制）1班田洋[手机号已脱敏], remark="与23学前五年制合班 形势与政策崔春梅后八周（） 413" | HIGH |
| uploads/imports/1780402522289-7mlo9dn8.json | teacher | class=2025级护理（二年制）1班 张洪宇[手机号已脱敏], teacher=房忠敏, remark=429 | HIGH |
| uploads/imports/1780402522289-7mlo9dn8.json | teacher | class=2025级护理（二年制）2班张洪宇[手机号已脱敏], teacher=房忠敏, remark=429 | HIGH |
| uploads/imports/1780402522289-7mlo9dn8.json | teacher | class=2025级口腔医学技术1班, teacher=房忠敏, remark=614 | HIGH |
| uploads/imports/1780402522289-7mlo9dn8.json | teacher | class=2025 级口腔医学技术2班, teacher=房忠敏, remark=614 | HIGH |
| uploads/imports/1780402522289-7mlo9dn8.json | remark | class=2025级钢铁智能冶金技术1班（高本贯通）, remark="与森防合班" | HIGH |
| uploads/imports/1780402522289-7mlo9dn8.json | teacher | class=2025级钢铁智能冶金技术1班（高本贯通）, teacher=房忠敏, remark=与森防合班 | HIGH |
| uploads/imports/1780402522289-7mlo9dn8.json | remark | class=2025级森林草原防火技术1班, remark="与高本贯通合班" | HIGH |
| uploads/imports/1780402522289-7mlo9dn8.json | teacher | class=2025级森林草原防火技术1班, teacher=房忠敏, remark=与高本贯通合班 | HIGH |
| uploads/imports/1780402522289-7mlo9dn8.json | teacher | class=2025级高速铁路客运服务1班, teacher=房忠敏, remark=(none) | HIGH |
| uploads/imports/1780402522289-7mlo9dn8.json | teacher | class=2025级高速铁路客运服务1班, teacher=房忠敏, remark=八东一 | HIGH |
| uploads/imports/1780402522289-7mlo9dn8.json | teacher | class=2025级高速铁路客运服务2班, teacher=房忠敏, remark=(none) | HIGH |
| uploads/imports/1780402522289-7mlo9dn8.json | teacher | class=2025级高速铁路客运服务2班, teacher=房忠敏, remark=八东一 | HIGH |

### Key Observations

1. **2025级 records found**: Multiple parsed JSON records show 2025级钢铁智能冶金技术1班（高本贯通）
   and 2025级森林草原防火技术1班 taking 习近平新时代中国特色社会主义思想概论 with teacher 房忠敏.
   These have 合班 remarks: "与森防合班" and "与高本贯通合班" respectively.

2. **No 2024级 record**: No parsed JSON file contains a record for 2024级森林草原防火技术1班
   taking 习近平新时代中国特色社会主义思想概论 with teacher 房忠敏.

3. **Task 32 comparison**: Task 32 (same teacher, same course, same 2025级 classes)
   has remark "2024级森林草原防火技术1班" but does NOT link the 2024级 class.
   Task 37 links it — the source evidence does not support this link.

4. **Pattern match**: The cross-cohort link pattern (2024级 class added via fuzzy matching)
   matches the 4 confirmed-error tasks repaired in K18-B.

### Evidence Gaps

- No parsed JSON record found for 2024级森林草原防火技术1班 taking 习近平新时代中国特色社会主义思想概论 with teacher 房忠敏

## 7. Decision

- **Decision**: LIKELY_ERROR
- **Confidence**: MEDIUM
- **Recommended Action**: PLAN_REPAIR
- **Suggested Next Stage**: K18-D-TASK37-DATA-REPAIR-PLAN
- **Blocking**: YES

## 8. Risk Assessment

- Task 37 cross-cohort grouping is **likely an import matching error**
- The course is a 思政课 (public course), so cross-cohort teaching is plausible in principle
- However, the parsed JSON source does NOT contain a 2024级 record for this course+teacher
- The pattern matches the 4 confirmed-error tasks repaired in K18-B
- **Recommendation**: Plan repair (remove 2024级 link) or verify with original .docx
- K18 data quality mainline should NOT be closed until resolved

## 9. Recommended Action

1. **Preferred**: Verify with original .docx (manual inspection of the source schedule table)
2. **If confirmed error**: Proceed to K18-D-TASK37-DATA-REPAIR-PLAN to remove the 2024级 link
3. **If confirmed legitimate**: Mark as ACCEPTED_CROSS_COHORT and close K18

## 10. Unmodified Scope

- Prisma schema: NOT modified
- prisma/dev.db: NOT modified
- TeachingTask / TeachingTaskClass / ClassGroup / ScheduleSlot: NOT modified
- ImportBatch: NOT modified
- API routes: NOT modified
- Import logic: NOT modified
- Frontend: NOT modified
- Solver / parser: NOT modified

## 11. Verification Results

See terminal output for full verification results.
