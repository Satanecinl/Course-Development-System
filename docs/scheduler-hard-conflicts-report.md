# K9-A2 Diagnostic Report

**Run timestamp:** 2026-05-30T04:34:02.311Z
**Duration:** 281ms

## Solver Config

- maxIterations: 10000
- lahcWindowSize: 500

## Data Summary

- tasks: 308
- rooms: 53
- slots: 440

## Solver Result

- iterations: 10000
- durationMs: 281
- hardScore (solver best): -162000
- softScore (solver best): -609
- hardScore (re-evaluated): -130000
- softScore (re-evaluated): -644
- assignmentCount: 440

## Score Reconciliation

- solver best hardScore: -162000
- re-evaluated hardScore: -130000
- difference: -32000
- difference in conflict units: -32
- consistent: false
- needs K9-B-SCORING: yes

Possible causes:

- solver 返回 bestScore 和 bestState 不同步：bestScore 在迭代中更新，bestState 在迭代结束后从 bestAssignments 恢复
- solver 内部 delta scoring 与 calculateScoreWithDetails 全量评分实现不一致
- score.ts 中 HC6（锁定课程移动）在 calculateScoreWithDetails 中为空实现，但 delta scoring 中有实际逻辑
- solver 的 findConflictingSlots 与 calculateScoreWithDetails 的成对遍历范围不同
- 差异恰好等于 32 个 hard conflict × 1000 penalty

## HC2 Consistency Check

- scoreWithDetails HC2 count: 5
- buildHC2Details count: 5
- consistent: true

## Conflict Summary

| Type | Count | Penalty |
|------|-------|---------|
| HC1_ROOM_CONFLICT | 2 | -2000 |
| HC2_TEACHER_CONFLICT | 5 | -5000 |
| HC3_CLASS_CONFLICT | 29 | -29000 |
| HC4_CAPACITY | 94 | -94000 |
| HC5_ROOM_UNAVAILABLE | 0 | 0 |
| **Total Hard** | **130** | **-130000** |

## HC1: Room Time Conflicts

Total: 2 conflict pairs

- **Room 11-322** (day=1, slot=2)
  - overlapWeeks: 1,2,3,4,5,6,7,8,9,10,11,12,13,14,15,16
  - courses: 机械制图 vs 金属材料与热处理
  - teachers: 于耀淇 vs 尹和鑫
  - classes: 2025级智能轧钢技术1班, 2024级钢铁智能冶金技术1班（高本贯通）
  - slotIds: 2, 263
- **Room 12楼机房** (day=1, slot=2)
  - overlapWeeks: 1,2,3,4,5,6,7,8
  - courses: 习近平新时代中国特色社会主义思想概论 vs 机械产品数字化设计
  - teachers: 房忠敏 vs 杨志强
  - classes: 2025级钢铁智能冶金技术1班（高本贯通）, 2025级森林草原防火技术1班, 2024级钢铁智能冶金技术1班（高本贯通）, 2024级机电一体化技术3班
  - slotIds: 213, 329

## HC2: Teacher Time Conflicts

Total: 5 conflict pairs

- **Teacher 尹和鑫** (day=1, slot=2)
  - overlapWeeks: 1,2,3,4,5,6,7,8,9,10,11,12,13,14,15,16
  - courses: 金属材料与热处理 vs 金属材料与热处理
  - classes: 2025级智能轧钢技术2班, 2024级钢铁智能冶金技术1班（高本贯通）
  - rooms: 11-318 vs 11-322
  - slotIds: 21, 263
- **Teacher 李媛** (day=3, slot=4)
  - overlapWeeks: 2,4,6,8,10,12,14,16
  - courses: 高等数学 vs 汽车机械基础
  - classes: 2025级钢铁智能冶金技术1班（高本贯通）, 2025级钢铁智能冶金技术（现场工程师）, 2025级智能轧钢技术（现场工程师）+2025级机电一体化技术（现场工程师）, 2024级钢铁智能冶金技术1班（高本贯通）, 2024级汽车制造与试验技术1班, 2024级汽车制造与试验技术2班
  - rooms: 11-322 vs 林校
304
  - slotIds: 44, 347
- **Teacher 张红梅** (day=2, slot=1)
  - overlapWeeks: 1,3,5,7,9,11,13,15
  - courses: 机械制图 vs ） 机械制图
  - classes: 2025级机电一体化技术1班, 2025级钢铁智能冶金技术1班（高本贯通）, 2025级机电一体化技术4班, 2025级钢铁智能冶金技术（现场工程师）, 2025级智能轧钢技术（现场工程师）+2025级机电一体化技术（现场工程师）, 2024级钢铁智能冶金技术1班（高本贯通）
  - rooms: 11-322 vs 12号楼机器人实训室
  - slotIds: 69, 114
- **Teacher 张旭** (day=2, slot=5)
  - overlapWeeks: 1,3,5,7,9,11,13,15
  - courses: 传感器与检测技术 vs 传感器
  - classes: 2025级钢铁智能冶金技术1班（高本贯通）, 2025级机电一体化技术1班, 2025级钢铁智能冶金技术（现场工程师）, 2025级智能轧钢技术（现场工程师）+2025级机电一体化技术（现场工程师）, 2024级钢铁智能冶金技术1班（高本贯通）, 2025级机电一体化技术3班, 2025级机电一体化技术4班, 2024级机电一体化技术3班
  - rooms: 11-328 vs 11-239
  - slotIds: 76, 95
- **Teacher 房忠敏** (day=1, slot=2)
  - overlapWeeks: 1,2,3,4,5,6,7,8
  - courses: 习近平新时代中国特色社会主义思想概论 vs 林业法规与执法实务
  - classes: 2025级钢铁智能冶金技术1班（高本贯通）, 2025级森林草原防火技术1班, 2024级钢铁智能冶金技术1班（高本贯通）, 2024级林业技术2班
  - rooms: 12楼机房 vs 10-128
  - slotIds: 213, 395

## HC3: Class Time Conflicts

Total: 29 conflict pairs

- **Class 2024级钢铁智能冶金技术1班（高本贯通）** (day=3, slot=3)
  - overlapWeeks: 9,11,13,15
  - courses: 机械制图 vs 大学生职业发展与就业指导
  - teachers: 于耀淇 vs 董钇含
  - rooms: 11-318 vs 林校305
  - slotIds: 11, 267
- **Class 2025级钢铁智能冶金技术1班（高本贯通）** (day=4, slot=2)
  - overlapWeeks: 2,4,6,8,10,12,14,16
  - courses: 金属材料与热处理 vs 高等数学
  - teachers: 尹和鑫 vs 李媛
  - rooms: 11-318 vs 11-204 或 12-111
  - slotIds: 14, 41
- **Class 2025级钢铁智能冶金技术1班（高本贯通）** (day=4, slot=2)
  - overlapWeeks: 1,3,5,7,9,11,13,15
  - courses: 金属材料与热处理 vs 高等数学
  - teachers: 尹和鑫 vs 李媛
  - rooms: 11-318 vs 11-204 或 12-111
  - slotIds: 25, 41
- **Class 2024级钢铁智能冶金技术1班（高本贯通）** (day=4, slot=2)
  - overlapWeeks: 2,4,6,8,10,12,14,16
  - courses: 金属材料与热处理 vs 大学日语
  - teachers: 尹和鑫 vs 葛书
  - rooms: 11-318 vs 11-223
  - slotIds: 14, 271
- **Class 2024级钢铁智能冶金技术1班（高本贯通）** (day=4, slot=2)
  - overlapWeeks: 1,3,5,7,9,11,13,15
  - courses: 金属材料与热处理 vs 大学日语
  - teachers: 尹和鑫 vs 葛书
  - rooms: 11-318 vs 11-223
  - slotIds: 25, 271
- **Class 2025级钢铁智能冶金技术1班（高本贯通）** (day=7, slot=2)
  - overlapWeeks: 2,4,6,8,10,12,14,16
  - courses: 机械制图 vs 习近平新时代中国特色社会主义思想概论
  - teachers: 于耀淇 vs 房忠敏
  - rooms: 10-410 vs 1-448
  - slotIds: 24, 43
- **Class 2024级钢铁智能冶金技术1班（高本贯通）** (day=7, slot=2)
  - overlapWeeks: 2,4,6,8,10,12,14,16
  - courses: 机械制图 vs 大学日语
  - teachers: 于耀淇 vs 葛书
  - rooms: 10-410 vs 10-316
  - slotIds: 24, 257
- **Class 2024级钢铁智能冶金技术1班（高本贯通）** (day=7, slot=2)
  - overlapWeeks: 2,4,6,8,10,12,14,16
  - courses: 机械制图 vs 金属性能检测
  - teachers: 于耀淇 vs 尹和鑫
  - rooms: 10-410 vs 11-318
  - slotIds: 24, 269
- **Class 2024级钢铁智能冶金技术1班（高本贯通）** (day=7, slot=2)
  - overlapWeeks: 1,2,3,4,5,6,7,8,9,10,11,12,13,14,15,16
  - courses: 大学日语 vs 金属性能检测
  - teachers: 葛书 vs 尹和鑫
  - rooms: 10-316 vs 11-318
  - slotIds: 257, 269
- **Class 2025级钢铁智能冶金技术1班（高本贯通）** (day=1, slot=2)
  - overlapWeeks: 1,2,3,4,5,6,7,8
  - courses: 高等数学 vs 习近平新时代中国特色社会主义思想概论
  - teachers: 李媛 vs 房忠敏
  - rooms: 11-212 vs 12楼机房
  - slotIds: 30, 213
- **Class 2025级钢铁智能冶金技术1班（高本贯通）** (day=2, slot=1)
  - overlapWeeks: 1,3,5,7,9,11,13,15
  - courses: 大学英语 vs ） 机械制图
  - teachers: 袁景丽 vs 张红梅
  - rooms: 11-212 vs 12号楼机器人实训室
  - slotIds: 33, 114
- **Class 2025级钢铁智能冶金技术1班（高本贯通）** (day=3, slot=4)
  - overlapWeeks: 2,4,6,8,10,12,14,16
  - courses: 中华优秀传统文化 vs 高等数学
  - teachers: 杨秀芳 vs 李媛
  - rooms: 11-529 vs 11-322
  - slotIds: 38, 44
- **Class 2024级钢铁智能冶金技术1班（高本贯通）** (day=3, slot=4)
  - overlapWeeks: 2,4,6,8,10,12,14,16
  - courses: 中华优秀传统文化 vs 高等数学
  - teachers: 杨秀芳 vs 李媛
  - rooms: 11-529 vs 11-322
  - slotIds: 38, 44
- **Class 2025级钢铁智能冶金技术3班** (day=4, slot=1)
  - overlapWeeks: 9,11,13,15
  - courses: 形势与政策 vs 机械制图
  - teachers: 郭玉莲 vs 赵春超
  - rooms: 10-410 vs 11-318
  - slotIds: 50, 62
- **Class 2024级钢铁智能冶金技术1班（高本贯通）** (day=4, slot=1)
  - overlapWeeks: 1,3,5,7,9,11,13,15
  - courses: 机械制图 vs 大学英语
  - teachers: 赵春超 vs 于秀杰
  - rooms: 11-318 vs 林校303
  - slotIds: 62, 256
- **Class 2024级钢铁智能冶金技术1班（高本贯通）** (day=4, slot=1)
  - overlapWeeks: 2,4,6,8,10,12,14,16
  - courses: 传感器与检测技术 vs 大学英语
  - teachers: 张旭 vs 于秀杰
  - rooms: 11-321 vs 林校303
  - slotIds: 85, 256
- **Class 2024级钢铁智能冶金技术1班（高本贯通）** (day=7, slot=3)
  - overlapWeeks: 1,3,5,7,9,11,13,15
  - courses: 机械制图 vs 冶金传输原理
  - teachers: 张红梅 vs 尹和鑫
  - rooms: 11-301 vs 林校306
  - slotIds: 78, 273
- **Class 2025级机电一体化技术3班** (day=3, slot=1)
  - overlapWeeks: 1,3,5,7,9,11,13,15
  - courses: 习近平新时代中国特色社会主义思想概论 vs 传感器与检测技术
  - teachers: 张帆 vs 张旭
  - rooms: 11-529 vs 11-321
  - slotIds: 96, 104
- **Class 2024级钢铁智能冶金技术1班（高本贯通）** (day=2, slot=1)
  - overlapWeeks: 1,3,5,7,9,11,13,15
  - courses: ） 机械制图 vs 美育
  - teachers: 张红梅 vs 张显慧
  - rooms: 12号楼机器人实训室 vs 1-142
  - slotIds: 114, 260
- **Class 2024级钢铁智能冶金技术1班（高本贯通）** (day=4, slot=5)
  - overlapWeeks: 2,4,6,8,10,12,14,16
  - courses: 传感器与检测技术 vs 材料科学基础
  - teachers: 张旭 vs 于耀淇
  - rooms: 11-328 vs 11-504
  - slotIds: 115, 274
- **Class 2024级钢铁智能冶金技术1班（高本贯通）** (day=5, slot=2)
  - overlapWeeks: 1,3,5,7,9,11,13,15
  - courses: 无人机应用技术 vs 大学英语
  - teachers: 董继扬 vs 于秀杰
  - rooms: 11-318 vs 11-504
  - slotIds: 193, 276
- **Class 2024级钢铁智能冶金技术1班（高本贯通）** (day=5, slot=2)
  - overlapWeeks: 1,3,5,7,9,11,13,15
  - courses: 无人机应用技术 vs 大学日语
  - teachers: 董继扬 vs 葛书
  - rooms: 11-318 vs 11-223
  - slotIds: 193, 277
- **Class 2024级钢铁智能冶金技术1班（高本贯通）** (day=5, slot=2)
  - overlapWeeks: 2,4,6,8,10,12,14,16
  - courses: 无人机应用技术 vs 大学英语
  - teachers: 董继扬 vs 于秀杰
  - rooms: 11-208 或 12-201 vs 11-504
  - slotIds: 202, 276
- **Class 2024级钢铁智能冶金技术1班（高本贯通）** (day=5, slot=2)
  - overlapWeeks: 2,4,6,8,10,12,14,16
  - courses: 无人机应用技术 vs 大学日语
  - teachers: 董继扬 vs 葛书
  - rooms: 11-208 或 12-201 vs 11-223
  - slotIds: 202, 277
- **Class 2024级钢铁智能冶金技术1班（高本贯通）** (day=5, slot=2)
  - overlapWeeks: 1,2,3,4,5,6,7,8,9,10,11,12,13,14,15,16
  - courses: 大学英语 vs 大学日语
  - teachers: 于秀杰 vs 葛书
  - rooms: 11-504 vs 11-223
  - slotIds: 276, 277
- **Class 2025级森林草原防火技术1班** (day=1, slot=2)
  - overlapWeeks: 1,2,3,4,5,6,7,8
  - courses: 大学英语 vs 习近平新时代中国特色社会主义思想概论
  - teachers: 刘明哲 vs 房忠敏
  - rooms: 11-204 vs 12楼机房
  - slotIds: 205, 213
- **Class 2024级钢铁智能冶金技术1班（高本贯通）** (day=1, slot=2)
  - overlapWeeks: 1,2,3,4,5,6,7,8
  - courses: 习近平新时代中国特色社会主义思想概论 vs 金属材料与热处理
  - teachers: 房忠敏 vs 尹和鑫
  - rooms: 12楼机房 vs 11-322
  - slotIds: 213, 263
- **Class 2024级钢铁智能冶金技术1班（高本贯通）** (day=1, slot=5)
  - overlapWeeks: 1,2,3,4,5,6,7,8,9,10,11,12,13,14,15,16
  - courses: 冶金传输原理 vs 冶金热工基础
  - teachers: 尹和鑫 vs 赵春超
  - rooms: 11-504 vs 11-328
  - slotIds: 259, 261
- **Class 2024级钢铁智能冶金技术1班（高本贯通）** (day=6, slot=1)
  - overlapWeeks: 1,2,3,4,5,6,7,8,9,10,11,12,13,14,15,16
  - courses: 大学英语 vs 金属性能检测
  - teachers: 于秀杰 vs 尹和鑫
  - rooms: 11-329 vs 11-333
  - slotIds: 270, 275

## HC4: Capacity Violations

Total: 94 violations

- **机械制图** → Room 11-318
  - required: 93, capacity: 50, shortage: 43, ratio: 1.86x
  - classes: 2025级智能轧钢技术1班, 2025级钢铁智能冶金技术1班（高本贯通）, 2025级钢铁智能冶金技术（现场工程师）, 2025级智能轧钢技术（现场工程师）+2025级机电一体化技术（现场工程师）, 2024级钢铁智能冶金技术1班（高本贯通）
  - teacher: 于耀淇
  - day=3, slot=3
  - week: ODD (1-16)
- **金属材料与热处理** → Room 11-318
  - required: 93, capacity: 50, shortage: 43, ratio: 1.86x
  - classes: 2025级智能轧钢技术1班, 2025级钢铁智能冶金技术1班（高本贯通）, 2025级钢铁智能冶金技术（现场工程师）, 2025级智能轧钢技术（现场工程师）+2025级机电一体化技术（现场工程师）, 2024级钢铁智能冶金技术1班（高本贯通）
  - teacher: 尹和鑫
  - day=4, slot=2
  - week: EVEN (1-16)
- **机械制图** → Room 10-410
  - required: 92, capacity: 50, shortage: 42, ratio: 1.84x
  - classes: 2025级智能轧钢技术2班, 2025级钢铁智能冶金技术1班（高本贯通）, 2025级钢铁智能冶金技术（现场工程师）, 2025级智能轧钢技术（现场工程师）+2025级机电一体化技术（现场工程师）, 2024级钢铁智能冶金技术1班（高本贯通）
  - teacher: 于耀淇
  - day=7, slot=2
  - week: EVEN (1-16)
- **金属材料与热处理** → Room 11-318
  - required: 92, capacity: 50, shortage: 42, ratio: 1.84x
  - classes: 2025级智能轧钢技术2班, 2025级钢铁智能冶金技术1班（高本贯通）, 2025级钢铁智能冶金技术（现场工程师）, 2025级智能轧钢技术（现场工程师）+2025级机电一体化技术（现场工程师）, 2024级钢铁智能冶金技术1班（高本贯通）
  - teacher: 尹和鑫
  - day=4, slot=2
  - week: ODD (1-16)
- **形势与政策** → Room 1-142
  - required: 128, capacity: 50, shortage: 78, ratio: 2.56x
  - classes: 2025级钢铁智能冶金技术1班（高本贯通）, 2025级森林草原防火技术1班, 2024级钢铁智能冶金技术1班（高本贯通）, 2024级森林草原防火技术1班
  - teacher: 胡浩
  - day=1, slot=3
  - week: FIRST_HALF (1-8)
- **创新创业教育** → Room 林校
303
  - required: 128, capacity: 50, shortage: 78, ratio: 2.56x
  - classes: 2025级钢铁智能冶金技术1班（高本贯通）, 2025级森林草原防火技术1班, 2024级钢铁智能冶金技术1班（高本贯通）, 2024级森林草原防火技术1班
  - teacher: 徐燕
  - day=7, slot=5
  - week: FIRST_HALF (1-8)
- **习近平新时代中国特色社会主义思想概论** → Room 林校305
  - required: 128, capacity: 50, shortage: 78, ratio: 2.56x
  - classes: 2025级钢铁智能冶金技术1班（高本贯通）, 2025级森林草原防火技术1班, 2024级钢铁智能冶金技术1班（高本贯通）, 2024级森林草原防火技术1班
  - teacher: 房忠敏
  - day=2, slot=6
  - week: ALL (1-16)
- **机械制图** → Room 11-239
  - required: 68, capacity: 50, shortage: 18, ratio: 1.36x
  - classes: 2025级钢铁智能冶金技术1班（高本贯通）, 2025级钢铁智能冶金技术（现场工程师）, 2025级智能轧钢技术（现场工程师）+2025级机电一体化技术（现场工程师）, 2024级钢铁智能冶金技术1班（高本贯通）
  - teacher: 于耀淇
  - day=2, slot=2
  - week: ODD (1-16)
- **中华优秀传统文化** → Room 11-529
  - required: 128, capacity: 50, shortage: 78, ratio: 2.56x
  - classes: 2025级钢铁智能冶金技术1班（高本贯通）, 2025级森林草原防火技术1班, 2024级钢铁智能冶金技术1班（高本贯通）, 2024级森林草原防火技术1班
  - teacher: 杨秀芳
  - day=3, slot=4
  - week: ALL (1-16)
- **习近平新时代中国特色社会主义思想概论** → Room 1-448
  - required: 98, capacity: 50, shortage: 48, ratio: 1.96x
  - classes: 2025级钢铁智能冶金技术1班（高本贯通）, 2025级森林草原防火技术1班, 2024级森林草原防火技术1班
  - teacher: 房忠敏
  - day=7, slot=2
  - week: ALL (1-16)
- **高等数学** → Room 11-322
  - required: 68, capacity: 50, shortage: 18, ratio: 1.36x
  - classes: 2025级钢铁智能冶金技术1班（高本贯通）, 2025级钢铁智能冶金技术（现场工程师）, 2025级智能轧钢技术（现场工程师）+2025级机电一体化技术（现场工程师）, 2024级钢铁智能冶金技术1班（高本贯通）
  - teacher: 李媛
  - day=3, slot=4
  - week: EVEN (1-16)
- **机械制图** → Room 11-322 或 10-104
  - required: 91, capacity: 50, shortage: 41, ratio: 1.82x
  - classes: 2025级钢铁智能冶金技术1班（高本贯通）, 2025级钢铁智能冶金技术2班, 2025级钢铁智能冶金技术（现场工程师）, 2025级智能轧钢技术（现场工程师）+2025级机电一体化技术（现场工程师）, 2024级钢铁智能冶金技术1班（高本贯通）
  - teacher: 赵春超
  - day=1, slot=6
  - week: EVEN (1-16)
- **金属材料与热处理** → Room 林校301
  - required: 117, capacity: 50, shortage: 67, ratio: 2.34x
  - classes: 2025级钢铁智能冶金技术1班（高本贯通）, 2025级钢铁智能冶金技术2班, 2025级钢铁智能冶金技术3班, 2025级钢铁智能冶金技术（现场工程师）, 2025级智能轧钢技术（现场工程师）+2025级机电一体化技术（现场工程师）, 2024级钢铁智能冶金技术1班（高本贯通）
  - teacher: 王淼
  - day=7, slot=6
  - week: EVEN (1-16)
- **机械制图** → Room 11-318
  - required: 94, capacity: 50, shortage: 44, ratio: 1.88x
  - classes: 2025级钢铁智能冶金技术1班（高本贯通）, 2025级钢铁智能冶金技术3班, 2025级钢铁智能冶金技术（现场工程师）, 2025级智能轧钢技术（现场工程师）+2025级机电一体化技术（现场工程师）, 2024级钢铁智能冶金技术1班（高本贯通）
  - teacher: 赵春超
  - day=4, slot=1
  - week: ODD (1-16)
- **电子技术** → Room 1号楼虚拟仿真实训室
  - required: 66, capacity: 50, shortage: 16, ratio: 1.32x
  - classes: 2025级机电一体化技术1班, 2025级机电一体化技术2班
  - teacher: 许进
  - day=1, slot=1
  - week: ALL (1-16)
- **创新创业教育** → Room 11-239
  - required: 66, capacity: 50, shortage: 16, ratio: 1.32x
  - classes: 2025级机电一体化技术1班, 2025级机电一体化技术2班
  - teacher: 孙文哲
  - day=1, slot=2
  - week: FIRST_HALF (1-8)
- **大学英语** → Room 11-239
  - required: 66, capacity: 50, shortage: 16, ratio: 1.32x
  - classes: 2025级机电一体化技术1班, 2025级机电一体化技术2班
  - teacher: 袁景丽
  - day=1, slot=4
  - week: ALL (1-16)
- **传感器** → Room 11-239
  - required: 103, capacity: 50, shortage: 53, ratio: 2.06x
  - classes: 2025级机电一体化技术1班, 2025级机电一体化技术2班, 2024级机电一体化技术1班
  - teacher: 张旭
  - day=1, slot=5
  - week: ALL (1-16)
- **习近平新时代中国特色社会主义思想概论** → Room 1-142
  - required: 66, capacity: 50, shortage: 16, ratio: 1.32x
  - classes: 2025级机电一体化技术1班, 2025级机电一体化技术2班
  - teacher: 牛怡亭
  - day=2, slot=4
  - week: ALL (1-16)
- **大学英语** → Room 1-142
  - required: 66, capacity: 50, shortage: 16, ratio: 1.32x
  - classes: 2025级机电一体化技术1班, 2025级机电一体化技术2班
  - teacher: 袁景丽
  - day=3, slot=1
  - week: ALL (1-16)
- **形势与政策** → Room 1-142
  - required: 66, capacity: 50, shortage: 16, ratio: 1.32x
  - classes: 2025级机电一体化技术1班, 2025级机电一体化技术2班
  - teacher: 董钇含
  - day=3, slot=2
  - week: FIRST_HALF (1-8)
- **习近平新时代中国特色社会主义思想概论** → Room 1-133
  - required: 66, capacity: 50, shortage: 16, ratio: 1.32x
  - classes: 2025级机电一体化技术1班, 2025级机电一体化技术2班
  - teacher: 牛怡亭
  - day=3, slot=3
  - week: FIRST_HALF (1-8)
- **电子技术** → Room 1号楼虚拟仿真实训室
  - required: 134, capacity: 50, shortage: 84, ratio: 2.68x
  - classes: 2025级钢铁智能冶金技术1班（高本贯通）, 2025级机电一体化技术1班, 2025级机电一体化技术2班, 2025级钢铁智能冶金技术（现场工程师）, 2025级智能轧钢技术（现场工程师）+2025级机电一体化技术（现场工程师）, 2024级钢铁智能冶金技术1班（高本贯通）
  - teacher: 许进
  - day=3, slot=5
  - week: ODD (1-16)
- **传感器与检测技术** → Room 11-328
  - required: 101, capacity: 50, shortage: 51, ratio: 2.02x
  - classes: 2025级钢铁智能冶金技术1班（高本贯通）, 2025级机电一体化技术1班, 2025级钢铁智能冶金技术（现场工程师）, 2025级智能轧钢技术（现场工程师）+2025级机电一体化技术（现场工程师）, 2024级钢铁智能冶金技术1班（高本贯通）
  - teacher: 张旭
  - day=2, slot=5
  - week: ODD (1-16)
- **机械制图** → Room 11-301
  - required: 101, capacity: 50, shortage: 51, ratio: 2.02x
  - classes: 2025级钢铁智能冶金技术1班（高本贯通）, 2025级机电一体化技术1班, 2025级钢铁智能冶金技术（现场工程师）, 2025级智能轧钢技术（现场工程师）+2025级机电一体化技术（现场工程师）, 2024级钢铁智能冶金技术1班（高本贯通）
  - teacher: 张红梅
  - day=7, slot=3
  - week: ODD (1-16)
- **中华优秀传统文化** → Room 11-529
  - required: 66, capacity: 50, shortage: 16, ratio: 1.32x
  - classes: 2025级机电一体化技术1班, 2025级机电一体化技术2班
  - teacher: 杨旭
  - day=5, slot=4
  - week: ALL (1-16)
- **传感器与检测技术** → Room 11-321
  - required: 101, capacity: 50, shortage: 51, ratio: 2.02x
  - classes: 2025级钢铁智能冶金技术1班（高本贯通）, 2025级机电一体化技术2班, 2025级钢铁智能冶金技术（现场工程师）, 2025级智能轧钢技术（现场工程师）+2025级机电一体化技术（现场工程师）, 2024级钢铁智能冶金技术1班（高本贯通）
  - teacher: 张旭
  - day=4, slot=1
  - week: EVEN (1-16)
- **机械制图** → Room 11-322 或 10-104
  - required: 101, capacity: 50, shortage: 51, ratio: 2.02x
  - classes: 2025级钢铁智能冶金技术1班（高本贯通）, 2025级机电一体化技术2班, 2025级钢铁智能冶金技术（现场工程师）, 2025级智能轧钢技术（现场工程师）+2025级机电一体化技术（现场工程师）, 2024级钢铁智能冶金技术1班（高本贯通）
  - teacher: 张红梅
  - day=3, slot=6
  - week: EVEN (1-16)
- **大学英语** → Room 11-529
  - required: 68, capacity: 50, shortage: 18, ratio: 1.36x
  - classes: 2025级机电一体化技术3班, 2025级机电一体化技术4班
  - teacher: 沈军红
  - day=1, slot=1
  - week: ALL (1-16)
- **形势与政策** → Room 1-142
  - required: 68, capacity: 50, shortage: 18, ratio: 1.36x
  - classes: 2025级机电一体化技术3班, 2025级机电一体化技术4班
  - teacher: 胡浩
  - day=1, slot=4
  - week: FIRST_HALF (1-8)
- **传感器** → Room 11-239
  - required: 102, capacity: 50, shortage: 52, ratio: 2.04x
  - classes: 2025级机电一体化技术3班, 2025级机电一体化技术4班, 2024级机电一体化技术3班
  - teacher: 张旭
  - day=2, slot=5
  - week: ALL (1-16)
- **习近平新时代中国特色社会主义思想概论** → Room 11-529
  - required: 68, capacity: 50, shortage: 18, ratio: 1.36x
  - classes: 2025级机电一体化技术3班, 2025级机电一体化技术4班
  - teacher: 张帆
  - day=3, slot=1
  - week: ALL (1-16)
- **中华优秀传统文化** → Room 1-142
  - required: 68, capacity: 50, shortage: 18, ratio: 1.36x
  - classes: 2025级机电一体化技术3班, 2025级机电一体化技术4班
  - teacher: 杜红侠
  - day=4, slot=1
  - week: ALL (1-16)
- **大学英语** → Room 1-142
  - required: 68, capacity: 50, shortage: 18, ratio: 1.36x
  - classes: 2025级机电一体化技术3班, 2025级机电一体化技术4班
  - teacher: 沈军红
  - day=4, slot=2
  - week: ALL (1-16)
- **）机械制图** → Room 11-333
  - required: 103, capacity: 50, shortage: 53, ratio: 2.06x
  - classes: 2025级钢铁智能冶金技术1班（高本贯通）, 2025级机电一体化技术3班, 2025级钢铁智能冶金技术（现场工程师）, 2025级智能轧钢技术（现场工程师）+2025级机电一体化技术（现场工程师）, 2024级钢铁智能冶金技术1班（高本贯通）
  - teacher: 张红梅
  - day=4, slot=4
  - week: EVEN (1-16)
- **传感器与检测技术** → Room 11-321
  - required: 103, capacity: 50, shortage: 53, ratio: 2.06x
  - classes: 2025级钢铁智能冶金技术1班（高本贯通）, 2025级机电一体化技术3班, 2025级钢铁智能冶金技术（现场工程师）, 2025级智能轧钢技术（现场工程师）+2025级机电一体化技术（现场工程师）, 2024级钢铁智能冶金技术1班（高本贯通）
  - teacher: 张旭
  - day=3, slot=1
  - week: ODD (1-16)
- **习近平新时代中国特色社会主义思想概论** → Room 11-529
  - required: 68, capacity: 50, shortage: 18, ratio: 1.36x
  - classes: 2025级机电一体化技术3班, 2025级机电一体化技术4班
  - teacher: 张帆
  - day=5, slot=2
  - week: FIRST_HALF (1-8)
- **创新创业教育** → Room 11-239
  - required: 68, capacity: 50, shortage: 18, ratio: 1.36x
  - classes: 2025级机电一体化技术3班, 2025级机电一体化技术4班
  - teacher: 董钇含
  - day=5, slot=3
  - week: FIRST_HALF (1-8)
- **） 机械制图** → Room 12号楼机器人实训室
  - required: 101, capacity: 50, shortage: 51, ratio: 2.02x
  - classes: 2025级钢铁智能冶金技术1班（高本贯通）, 2025级机电一体化技术4班, 2025级钢铁智能冶金技术（现场工程师）, 2025级智能轧钢技术（现场工程师）+2025级机电一体化技术（现场工程师）, 2024级钢铁智能冶金技术1班（高本贯通）
  - teacher: 张红梅
  - day=2, slot=1
  - week: ODD (1-16)
- **传感器与检测技术** → Room 11-328
  - required: 101, capacity: 50, shortage: 51, ratio: 2.02x
  - classes: 2025级钢铁智能冶金技术1班（高本贯通）, 2025级机电一体化技术4班, 2025级钢铁智能冶金技术（现场工程师）, 2025级智能轧钢技术（现场工程师）+2025级机电一体化技术（现场工程师）, 2024级钢铁智能冶金技术1班（高本贯通）
  - teacher: 张旭
  - day=4, slot=5
  - week: EVEN (1-16)
- **大学英语** → Room 林校
305
  - required: 83, capacity: 50, shortage: 33, ratio: 1.66x
  - classes: 2025级汽车制造与试验技术1班, 2025级汽车制造与试验技术2班, 2025级智能网联汽车技术
  - teacher: 赵新宇
  - day=1, slot=1
  - week: ALL (1-16)
- **习近平新时代中国特色社会主义思想概论** → Room 林校305
  - required: 83, capacity: 50, shortage: 33, ratio: 1.66x
  - classes: 2025级汽车制造与试验技术1班, 2025级汽车制造与试验技术2班, 2025级智能网联汽车技术
  - teacher: 张帆
  - day=2, slot=1
  - week: ALL (1-16)
- **创新创业教育** → Room 林校305
  - required: 83, capacity: 50, shortage: 33, ratio: 1.66x
  - classes: 2025级汽车制造与试验技术1班, 2025级汽车制造与试验技术2班, 2025级智能网联汽车技术
  - teacher: 徐燕
  - day=2, slot=4
  - week: FIRST_HALF (1-8)
- **中华优秀传统文化** → Room 林校305
  - required: 83, capacity: 50, shortage: 33, ratio: 1.66x
  - classes: 2025级汽车制造与试验技术1班, 2025级汽车制造与试验技术2班, 2025级智能网联汽车技术
  - teacher: 汪雯雯
  - day=3, slot=1
  - week: ALL (1-16)
- **形势与政策** → Room 林校305
  - required: 83, capacity: 50, shortage: 33, ratio: 1.66x
  - classes: 2025级汽车制造与试验技术1班, 2025级汽车制造与试验技术2班, 2025级智能网联汽车技术
  - teacher: 崔春梅
  - day=3, slot=3
  - week: FIRST_HALF (1-8)
- **习近平新时代中国特色社会主义思想概论** → Room 林校
305
  - required: 83, capacity: 50, shortage: 33, ratio: 1.66x
  - classes: 2025级汽车制造与试验技术1班, 2025级汽车制造与试验技术2班, 2025级智能网联汽车技术
  - teacher: 张帆
  - day=4, slot=1
  - week: FIRST_HALF (1-8)
- **大学英语** → Room 林校
305
  - required: 83, capacity: 50, shortage: 33, ratio: 1.66x
  - classes: 2025级汽车制造与试验技术1班, 2025级汽车制造与试验技术2班, 2025级智能网联汽车技术
  - teacher: 赵新宇
  - day=4, slot=3
  - week: ALL (1-16)
- **形势与政策** → Room 10-316
  - required: 52, capacity: 50, shortage: 2, ratio: 1.04x
  - classes: 2025级林业技术1班, 2025级林业技术2班
  - teacher: 莫子君
  - day=1, slot=1
  - week: SECOND_HALF (9-16)
- **习近平新时代中国特色社会主义思想概论** → Room 11-529
  - required: 52, capacity: 50, shortage: 2, ratio: 1.04x
  - classes: 2025级林业技术1班, 2025级林业技术2班
  - teacher: 张帆
  - day=1, slot=5
  - week: ALL (1-16)
- **大学英语** → Room 10-316
  - required: 52, capacity: 50, shortage: 2, ratio: 1.04x
  - classes: 2025级林业技术1班, 2025级林业技术2班
  - teacher: 王楠
  - day=2, slot=4
  - week: ALL (1-16)
- **中华优秀传统文化** → Room 11-239
  - required: 52, capacity: 50, shortage: 2, ratio: 1.04x
  - classes: 2025级林业技术1班, 2025级林业技术2班
  - teacher: 杨旭
  - day=3, slot=2
  - week: ALL (1-16)
- **大学英语** → Room 10-316
  - required: 52, capacity: 50, shortage: 2, ratio: 1.04x
  - classes: 2025级林业技术1班, 2025级林业技术2班
  - teacher: 王楠
  - day=4, slot=2
  - week: ALL (1-16)
- **习近平新时代中国特色社会主义思想概论** → Room 11-529
  - required: 52, capacity: 50, shortage: 2, ratio: 1.04x
  - classes: 2025级林业技术1班, 2025级林业技术2班
  - teacher: 张帆
  - day=4, slot=3
  - week: FIRST_HALF (1-8)
- **创新创业教育** → Room 11-529
  - required: 52, capacity: 50, shortage: 2, ratio: 1.04x
  - classes: 2025级林业技术1班, 2025级林业技术2班
  - teacher: 王素燕
  - day=4, slot=4
  - week: FIRST_HALF (1-8)
- **大学英语** → Room 11-239
  - required: 55, capacity: 50, shortage: 5, ratio: 1.1x
  - classes: 2025级森林草原资源保护1班, 2025级森林草原资源保护2班
  - teacher: 刘明哲
  - day=1, slot=1
  - week: ALL (1-16)
- **形势与政策** → Room 10-316
  - required: 55, capacity: 50, shortage: 5, ratio: 1.1x
  - classes: 2025级森林草原资源保护1班, 2025级森林草原资源保护2班
  - teacher: 莫子君
  - day=1, slot=2
  - week: SECOND_HALF (9-16)
- **习近平新时代中国特色社会主义思想概论** → Room 11-529
  - required: 55, capacity: 50, shortage: 5, ratio: 1.1x
  - classes: 2025级森林草原资源保护1班, 2025级森林草原资源保护2班
  - teacher: 张黎
  - day=1, slot=3
  - week: ALL (1-16)
- **创新创业教育** → Room 11-529
  - required: 55, capacity: 50, shortage: 5, ratio: 1.1x
  - classes: 2025级森林草原资源保护1班, 2025级森林草原资源保护2班
  - teacher: 徐燕
  - day=2, slot=1
  - week: FIRST_HALF (1-8)
- **中华优秀传统文化** → Room 1-142
  - required: 55, capacity: 50, shortage: 5, ratio: 1.1x
  - classes: 2025级森林草原资源保护1班, 2025级森林草原资源保护2班
  - teacher: 姜剑书
  - day=2, slot=2
  - week: ALL (1-16)
- **林草培育** → Room 11-529
  - required: 55, capacity: 50, shortage: 5, ratio: 1.1x
  - classes: 2025级森林草原资源保护1班, 2025级森林草原资源保护2班
  - teacher: 刘艳
  - day=2, slot=4
  - week: ALL (1-16)
- **习近平新时代中国特色社会主义思想概论** → Room 11-239
  - required: 55, capacity: 50, shortage: 5, ratio: 1.1x
  - classes: 2025级森林草原资源保护1班, 2025级森林草原资源保护2班
  - teacher: 张黎
  - day=3, slot=3
  - week: FIRST_HALF (1-8)
- **大学英语** → Room 11-239
  - required: 55, capacity: 50, shortage: 5, ratio: 1.1x
  - classes: 2025级森林草原资源保护1班, 2025级森林草原资源保护2班
  - teacher: 刘明哲
  - day=3, slot=4
  - week: ALL (1-16)
- **林草培育** → Room 1-142
  - required: 55, capacity: 50, shortage: 5, ratio: 1.1x
  - classes: 2025级森林草原资源保护1班, 2025级森林草原资源保护2班
  - teacher: 刘艳
  - day=4, slot=3
  - week: ALL (1-16)
- **林草环境** → Room 11-329
  - required: 95, capacity: 50, shortage: 45, ratio: 1.9x
  - classes: 2025级钢铁智能冶金技术1班（高本贯通）, 2025级森林草原资源保护1班, 2025级钢铁智能冶金技术（现场工程师）, 2025级智能轧钢技术（现场工程师）+2025级机电一体化技术（现场工程师）, 2024级钢铁智能冶金技术1班（高本贯通）
  - teacher: 刘闯
  - day=5, slot=1
  - week: ODD (1-16)
- **无人机应用技术** → Room 11-318
  - required: 95, capacity: 50, shortage: 45, ratio: 1.9x
  - classes: 2025级钢铁智能冶金技术1班（高本贯通）, 2025级森林草原资源保护1班, 2025级钢铁智能冶金技术（现场工程师）, 2025级智能轧钢技术（现场工程师）+2025级机电一体化技术（现场工程师）, 2024级钢铁智能冶金技术1班（高本贯通）
  - teacher: 董继扬
  - day=5, slot=2
  - week: ODD (1-16)
- **林草环境** → Room 11-329
  - required: 96, capacity: 50, shortage: 46, ratio: 1.92x
  - classes: 2025级钢铁智能冶金技术1班（高本贯通）, 2025级森林草原资源保护2班, 2025级钢铁智能冶金技术（现场工程师）, 2025级智能轧钢技术（现场工程师）+2025级机电一体化技术（现场工程师）, 2024级钢铁智能冶金技术1班（高本贯通）
  - teacher: 刘闯
  - day=5, slot=1
  - week: EVEN (1-16)
- **无人机应用技术** → Room 11-208 或 12-201
  - required: 96, capacity: 50, shortage: 46, ratio: 1.92x
  - classes: 2025级钢铁智能冶金技术1班（高本贯通）, 2025级森林草原资源保护2班, 2025级钢铁智能冶金技术（现场工程师）, 2025级智能轧钢技术（现场工程师）+2025级机电一体化技术（现场工程师）, 2024级钢铁智能冶金技术1班（高本贯通）
  - teacher: 董继扬
  - day=5, slot=2
  - week: EVEN (1-16)
- **习近平新时代中国特色社会主义思想概论** → Room 12楼机房
  - required: 91, capacity: 50, shortage: 41, ratio: 1.82x
  - classes: 2025级钢铁智能冶金技术1班（高本贯通）, 2025级森林草原防火技术1班, 2024级钢铁智能冶金技术1班（高本贯通）
  - teacher: 房忠敏
  - day=1, slot=2
  - week: FIRST_HALF (1-8)
- **美育** → Room 11-529
  - required: 75, capacity: 50, shortage: 25, ratio: 1.5x
  - classes: 2024级智能轧钢技术1班, 2024级智能轧钢技术2班, 2024级机电一体化技术1班
  - teacher: 苏英周
  - day=2, slot=2
  - week: ALL (1-16)
- **大学生职业发展与就业指导** → Room 11-239
  - required: 75, capacity: 50, shortage: 25, ratio: 1.5x
  - classes: 2024级智能轧钢技术1班, 2024级智能轧钢技术2班, 2024级机电一体化技术1班
  - teacher: 孙文哲
  - day=4, slot=1
  - week: CUSTOM (9-16)
- **美育** → Room 1-142
  - required: 78, capacity: 50, shortage: 28, ratio: 1.56x
  - classes: 2024级钢铁智能冶金技术1班（高本贯通）, 2024级钢铁智能冶金技术2班, 2024级钢铁智能冶金技术3班
  - teacher: 张显慧
  - day=2, slot=1
  - week: ALL (1-16)
- **大学生职业发展与就业指导** → Room 林校305
  - required: 78, capacity: 50, shortage: 28, ratio: 1.56x
  - classes: 2024级钢铁智能冶金技术1班（高本贯通）, 2024级钢铁智能冶金技术2班, 2024级钢铁智能冶金技术3班
  - teacher: 董钇含
  - day=3, slot=3
  - week: CUSTOM (9-16)
- **机械设计基础** → Room 1-133
  - required: 72, capacity: 50, shortage: 22, ratio: 1.44x
  - classes: 2024级机电一体化技术1班, 2024级机电一体化技术2班
  - teacher: 李媛
  - day=1, slot=1
  - week: ALL (1-16)
- **液压与气压传动** → Room 1-133
  - required: 72, capacity: 50, shortage: 22, ratio: 1.44x
  - classes: 2024级机电一体化技术1班, 2024级机电一体化技术2班
  - teacher: 李媛
  - day=2, slot=4
  - week: ALL (1-16)
- **机械设计基础** → Room 11-239
  - required: 72, capacity: 50, shortage: 22, ratio: 1.44x
  - classes: 2024级机电一体化技术1班, 2024级机电一体化技术2班
  - teacher: 李媛
  - day=3, slot=1
  - week: ALL (1-16)
- **液压与气压传动** → Room 1-133
  - required: 72, capacity: 50, shortage: 22, ratio: 1.44x
  - classes: 2024级机电一体化技术1班, 2024级机电一体化技术2班
  - teacher: 李媛
  - day=5, slot=2
  - week: ALL (1-16)
- **大学生职业发展与就业指导** → Room 11-529
  - required: 69, capacity: 50, shortage: 19, ratio: 1.38x
  - classes: 2024级机电一体化技术2班, 2024级机电一体化技术3班
  - teacher: 孙文哲
  - day=4, slot=2
  - week: CUSTOM (9-16)
- **美育** → Room 1-301
  - required: 69, capacity: 50, shortage: 19, ratio: 1.38x
  - classes: 2024级机电一体化技术2班, 2024级机电一体化技术3班
  - teacher: 苏英周
  - day=4, slot=3
  - week: ALL (1-16)
- **大学生职业发展与就业指导** → Room 林校
305
  - required: 55, capacity: 50, shortage: 5, ratio: 1.1x
  - classes: 2024级汽车制造与试验技术1班, 2024级汽车制造与试验技术2班
  - teacher: 孙文哲
  - day=1, slot=3
  - week: CUSTOM (9-16)
- **汽车机械基础** → Room 林校
304
  - required: 55, capacity: 50, shortage: 5, ratio: 1.1x
  - classes: 2024级汽车制造与试验技术1班, 2024级汽车制造与试验技术2班
  - teacher: 李媛
  - day=3, slot=3
  - week: ALL (1-16)
- **汽车机械基础** → Room 林校
304
  - required: 55, capacity: 50, shortage: 5, ratio: 1.1x
  - classes: 2024级汽车制造与试验技术1班, 2024级汽车制造与试验技术2班
  - teacher: 李媛
  - day=3, slot=4
  - week: ALL (1-16)
- **美育** → Room 林校
304
  - required: 55, capacity: 50, shortage: 5, ratio: 1.1x
  - classes: 2024级汽车制造与试验技术1班, 2024级汽车制造与试验技术2班
  - teacher: 李恩翠
  - day=4, slot=3
  - week: ALL (1-16)
- **汽车营销（非学徒制）** → Room 林校
304
  - required: 55, capacity: 50, shortage: 5, ratio: 1.1x
  - classes: 2024级汽车制造与试验技术1班, 2024级汽车制造与试验技术2班
  - teacher: 刘艳艳
  - day=5, slot=1
  - week: ALL (1-16)
- **汽车营销（非学徒制）** → Room 林校
304
  - required: 55, capacity: 50, shortage: 5, ratio: 1.1x
  - classes: 2024级汽车制造与试验技术1班, 2024级汽车制造与试验技术2班
  - teacher: 刘艳艳
  - day=5, slot=2
  - week: ALL (1-16)
- **汽车保险与理赔（非学徒制）** → Room 林校
304
  - required: 55, capacity: 50, shortage: 5, ratio: 1.1x
  - classes: 2024级汽车制造与试验技术1班, 2024级汽车制造与试验技术2班
  - teacher: 刘艳艳
  - day=5, slot=3
  - week: ALL (1-16)
- **汽车保险与理赔（非学徒制）** → Room 林校
304
  - required: 55, capacity: 50, shortage: 5, ratio: 1.1x
  - classes: 2024级汽车制造与试验技术1班, 2024级汽车制造与试验技术2班
  - teacher: 刘艳艳
  - day=5, slot=4
  - week: ALL (1-16)
- **美育** → Room 1-142
  - required: 51, capacity: 50, shortage: 1, ratio: 1.02x
  - classes: 2024级林业技术1班, 2024级林业技术2班
  - teacher: 张显慧
  - day=1, slot=1
  - week: ALL (1-16)
- **学生职业发展与就业指导** → Room 11-529
  - required: 51, capacity: 50, shortage: 1, ratio: 1.02x
  - classes: 2024级林业技术1班, 2024级林业技术2班
  - teacher: 徐燕
  - day=4, slot=1
  - week: CUSTOM (9-16)
- **经济林栽培** → Room 1-133
  - required: 51, capacity: 50, shortage: 1, ratio: 1.02x
  - classes: 2024级林业技术1班, 2024级林业技术2班
  - teacher: 刘娜
  - day=4, slot=3
  - week: ALL (1-16)
- **经济林栽培** → Room 1-133
  - required: 51, capacity: 50, shortage: 1, ratio: 1.02x
  - classes: 2024级林业技术1班, 2024级林业技术2班
  - teacher: 刘娜
  - day=5, slot=3
  - week: ALL (1-16)
- **美育** → Room 1-142
  - required: 89, capacity: 50, shortage: 39, ratio: 1.78x
  - classes: 2024级森林草原资源保护1班, 2024级森林草原资源保护2班, 2024级森林草原防火技术1班
  - teacher: 张显慧
  - day=1, slot=2
  - week: ALL (1-16)
- **经济林栽培** → Room 1-133
  - required: 52, capacity: 50, shortage: 2, ratio: 1.04x
  - classes: 2024级森林草原资源保护1班, 2024级森林草原资源保护2班
  - teacher: 刘娜
  - day=1, slot=4
  - week: ALL (1-16)
- **经济林栽培** → Room 1-133
  - required: 52, capacity: 50, shortage: 2, ratio: 1.04x
  - classes: 2024级森林草原资源保护1班, 2024级森林草原资源保护2班
  - teacher: 刘娜
  - day=3, slot=4
  - week: ALL (1-16)
- **学生职业发展与就业指导** → Room 11-239
  - required: 89, capacity: 50, shortage: 39, ratio: 1.78x
  - classes: 2024级森林草原资源保护1班, 2024级森林草原资源保护2班, 2024级森林草原防火技术1班
  - teacher: 徐燕
  - day=4, slot=2
  - week: CUSTOM (9-16)

## HC5: Room Unavailability

No room unavailability violations detected.

## Top 5 Capacity Gaps

| # | Course | Classes | Required | Room(Cap) | Shortage | Ratio | Day-Slot |
|---|--------|---------|----------|-----------|----------|-------|----------|
| 1 | 电子技术 | 2025级钢铁智能冶金技术1班（高本贯通）, 2025级机电一体化技术1班, 2025级机电一体化技术2班, 2025级钢铁智能冶金技术（现场工程师）, 2025级智能轧钢技术（现场工程师）+2025级机电一体化技术（现场工程师）, 2024级钢铁智能冶金技术1班（高本贯通） | 134 | 1号楼虚拟仿真实训室(50) | 84 | 2.68x | 3-5 |
| 2 | 形势与政策 | 2025级钢铁智能冶金技术1班（高本贯通）, 2025级森林草原防火技术1班, 2024级钢铁智能冶金技术1班（高本贯通）, 2024级森林草原防火技术1班 | 128 | 1-142(50) | 78 | 2.56x | 1-3 |
| 3 | 创新创业教育 | 2025级钢铁智能冶金技术1班（高本贯通）, 2025级森林草原防火技术1班, 2024级钢铁智能冶金技术1班（高本贯通）, 2024级森林草原防火技术1班 | 128 | 林校
303(50) | 78 | 2.56x | 7-5 |
| 4 | 习近平新时代中国特色社会主义思想概论 | 2025级钢铁智能冶金技术1班（高本贯通）, 2025级森林草原防火技术1班, 2024级钢铁智能冶金技术1班（高本贯通）, 2024级森林草原防火技术1班 | 128 | 林校305(50) | 78 | 2.56x | 2-6 |
| 5 | 中华优秀传统文化 | 2025级钢铁智能冶金技术1班（高本贯通）, 2025级森林草原防火技术1班, 2024级钢铁智能冶金技术1班（高本贯通）, 2024级森林草原防火技术1班 | 128 | 11-529(50) | 78 | 2.56x | 3-4 |

## Top 5 Class Conflict Hotspots

| # | Class Group | Conflicts | Worst Day-Slot | Involved Courses |
|---|-------------|-----------|----------------|------------------|
| 1 | 2024级钢铁智能冶金技术1班（高本贯通） | 20 | 5-2 | 机械制图, 大学生职业发展与就业指导, 金属材料与热处理, 大学日语, 金属性能检测, 中华优秀传统文化, 高等数学, 大学英语, 传感器与检测技术, 冶金传输 |
| 2 | 2025级钢铁智能冶金技术1班（高本贯通） | 6 | 4-2 | 金属材料与热处理, 高等数学, 机械制图, 习近平新时代中国特色社会主义思想概论, 大学英语, ） 机械制图, 中华优秀传统文化 |
| 3 | 2025级钢铁智能冶金技术3班 | 1 | 4-1 | 形势与政策, 机械制图 |
| 4 | 2025级机电一体化技术3班 | 1 | 3-1 | 习近平新时代中国特色社会主义思想概论, 传感器与检测技术 |
| 5 | 2025级森林草原防火技术1班 | 1 | 1-2 | 大学英语, 习近平新时代中国特色社会主义思想概论 |

## Top 5 Room Conflict Hotspots

| # | Room | Conflicts | Day-Slot | Involved Courses |
|---|------|-----------|----------|------------------|
| 1 | 11-322 | 1 | 1-2 | 机械制图, 金属材料与热处理 |
| 2 | 12楼机房 | 1 | 1-2 | 习近平新时代中国特色社会主义思想概论, 机械产品数字化设计 |

## Teacher Conflicts

5 teacher conflicts detected.

Top teacher conflict hotspots:
- **尹和鑫** (day=1, slot=2)
  - overlapWeeks: 1,2,3,4,5,6,7,8,9,10,11,12,13,14,15,16
  - courses: 金属材料与热处理 vs 金属材料与热处理
- **李媛** (day=3, slot=4)
  - overlapWeeks: 2,4,6,8,10,12,14,16
  - courses: 高等数学 vs 汽车机械基础
- **张红梅** (day=2, slot=1)
  - overlapWeeks: 1,3,5,7,9,11,13,15
  - courses: 机械制图 vs ） 机械制图
- **张旭** (day=2, slot=5)
  - overlapWeeks: 1,3,5,7,9,11,13,15
  - courses: 传感器与检测技术 vs 传感器
- **房忠敏** (day=1, slot=2)
  - overlapWeeks: 1,2,3,4,5,6,7,8
  - courses: 习近平新时代中国特色社会主义思想概论 vs 林业法规与执法实务

## Top 10 Time Slot Pressure

| Day-Slot | Slots | Rooms | Classes | CapShortage | ClassConf | RoomConf |
|----------|-------|-------|---------|-------------|-----------|----------|
| 4-2 | 23 | 20 | 28 | 6 | 4 | 0 |
| 5-2 | 20 | 19 | 26 | 5 | 5 | 0 |
| 1-2 | 24 | 22 | 29 | 4 | 3 | 2 |
| 4-1 | 23 | 21 | 31 | 6 | 3 | 0 |
| 1-1 | 19 | 19 | 27 | 7 | 0 | 0 |
| 3-3 | 17 | 15 | 28 | 6 | 1 | 0 |
| 3-4 | 17 | 17 | 26 | 5 | 2 | 0 |
| 2-1 | 21 | 21 | 29 | 4 | 2 | 0 |
| 3-1 | 19 | 19 | 29 | 5 | 1 | 0 |
| 4-3 | 19 | 19 | 28 | 6 | 0 | 0 |

## Week Overlap Sanity Check

| Pair | Expected Overlap | Actual Overlap | Status | Weeks |
|------|-----------------|----------------|--------|-------|
| ODD vs EVEN | false | false | OK | (none) |
| FIRST_HALF vs SECOND_HALF | false | false | OK | (none) |
| FIRST_HALF vs ALL | true | true | OK | 1,2,3,4,5,6,7,8 |
| CUSTOM(5-12) vs FIRST_HALF | true | true | OK | 5,6,7,8 |
| CUSTOM(actual 5-8) vs FIRST_HALF | true | true | OK | 5,6,7,8 |
| CUSTOM range | true | true | OK | 5,6,7,8 |

## Diagnosis Classification

- CAPACITY_BOTTLENECK
- CLASS_CONFLICT
- ROOM_CONFLICT
- SCORING_OR_DIAGNOSTIC_MISMATCH

## Notes

- HC1-HC5 details computed via secondary traversal of bestState (no score.ts modification)
- Week overlap computed using expandWeeks from conflict.ts
- Score reconciliation identifies delta-vs-full scoring discrepancy