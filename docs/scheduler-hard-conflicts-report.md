# K9-A2 Diagnostic Report

**Run timestamp:** 2026-05-30T04:50:54.133Z
**Duration:** 257ms

## Solver Config

- maxIterations: 10000
- lahcWindowSize: 500

## Data Summary

- tasks: 308
- rooms: 53
- slots: 440

## Solver Result

- iterations: 10000
- durationMs: 257
- hardScore (solver best): -119000
- softScore (solver best): -1277
- hardScore (re-evaluated): -119000
- softScore (re-evaluated): -1352
- assignmentCount: 440

## Score Reconciliation

- solver best hardScore: -119000
- re-evaluated hardScore: -119000
- difference: 0
- difference in conflict units: 0
- consistent: true
- needs K9-B-SCORING: no

## HC2 Consistency Check

- scoreWithDetails HC2 count: 2
- buildHC2Details count: 2
- consistent: true

## Conflict Summary

| Type | Count | Penalty |
|------|-------|---------|
| HC1_ROOM_CONFLICT | 1 | -1000 |
| HC2_TEACHER_CONFLICT | 2 | -2000 |
| HC3_CLASS_CONFLICT | 23 | -23000 |
| HC4_CAPACITY | 93 | -93000 |
| HC5_ROOM_UNAVAILABLE | 0 | 0 |
| **Total Hard** | **119** | **-119000** |

## HC1: Room Time Conflicts

Total: 1 conflict pairs

- **Room 11-301** (day=6, slot=5)
  - overlapWeeks: 1,2,3,4,5,6,7,8,9,10,11,12,13,14,15,16
  - courses: 公关与礼仪 vs 森林火灾预防与扑救
  - teachers: 汪雯雯 vs 赵强
  - classes: 2024级森林草原防火技术1班, 2024级森林草原防火技术1班
  - slotIds: 430, 435

## HC2: Teacher Time Conflicts

Total: 2 conflict pairs

- **Teacher 赵春超** (day=6, slot=4)
  - overlapWeeks: 1,3,5,7,9,11,13,15
  - courses: 机械制图 vs 机械制图
  - classes: 2025级钢铁智能冶金技术2班, 2025级钢铁智能冶金技术1班（高本贯通）, 2025级钢铁智能冶金技术3班, 2025级钢铁智能冶金技术（现场工程师）, 2025级智能轧钢技术（现场工程师）+2025级机电一体化技术（现场工程师）, 2024级钢铁智能冶金技术1班（高本贯通）
  - rooms: 11-208 vs 10-321
  - slotIds: 48, 62
- **Teacher 王淼** (day=3, slot=5)
  - overlapWeeks: 1,2,3,4,5,6,7,8,9,10,11,12,13,14,15,16
  - courses: 冶金热工基础 vs 流体力学
  - classes: 2025级钢铁智能冶金技术2班, 2025级钢铁智能冶金技术3班, 2024级钢铁智能冶金技术2班
  - rooms: 10-227 vs 11-504
  - slotIds: 59, 293

## HC3: Class Time Conflicts

Total: 23 conflict pairs

- **Class 2025级钢铁智能冶金技术1班（高本贯通）** (day=2, slot=3)
  - overlapWeeks: 1,3,5,7,9,11,13,15
  - courses: 机械制图 vs 心理健康教育
  - teachers: 于耀淇 vs 芦雪莹
  - rooms: 10-321 vs 11-333
  - slotIds: 11, 42
- **Class 2024级钢铁智能冶金技术1班（高本贯通）** (day=2, slot=3)
  - overlapWeeks: 1,3,5,7,9,11,13,15
  - courses: 机械制图 vs 大学英语
  - teachers: 于耀淇 vs 于秀杰
  - rooms: 10-321 vs 11-204 或 11-105
  - slotIds: 11, 270
- **Class 2025级钢铁智能冶金技术1班（高本贯通）** (day=6, slot=5)
  - overlapWeeks: 2,4,6,8,10,12,14,16
  - courses: 金属材料与热处理 vs 高等数学
  - teachers: 尹和鑫 vs 李媛
  - rooms: 林校303 vs 11-318
  - slotIds: 14, 41
- **Class 2025级钢铁智能冶金技术1班（高本贯通）** (day=6, slot=5)
  - overlapWeeks: 1,3,5,7,9,11,13,15
  - courses: 高等数学 vs 电子技术
  - teachers: 李媛 vs 许进
  - rooms: 11-318 vs 11-329
  - slotIds: 41, 75
- **Class 2024级钢铁智能冶金技术1班（高本贯通）** (day=3, slot=6)
  - overlapWeeks: 2,4,6,8,10,12,14,16
  - courses: 机械制图 vs 冶金传输原理
  - teachers: 于耀淇 vs 尹和鑫
  - rooms: 1-301 vs 林校306
  - slotIds: 24, 259
- **Class 2025级钢铁智能冶金技术1班（高本贯通）** (day=7, slot=1)
  - overlapWeeks: 1,3,5,7
  - courses: 形势与政策 vs 传感器与检测技术
  - teachers: 胡浩 vs 张旭
  - rooms: 11-529 vs 11-318
  - slotIds: 31, 104
- **Class 2025级森林草原防火技术1班** (day=7, slot=1)
  - overlapWeeks: 1,2,3,4,5,6,7,8
  - courses: 形势与政策 vs 森林草原火管理
  - teachers: 胡浩 vs 董继扬
  - rooms: 11-529 vs 11-329
  - slotIds: 31, 207
- **Class 2024级钢铁智能冶金技术1班（高本贯通）** (day=7, slot=1)
  - overlapWeeks: 1,3,5,7
  - courses: 形势与政策 vs 传感器与检测技术
  - teachers: 胡浩 vs 张旭
  - rooms: 11-529 vs 11-318
  - slotIds: 31, 104
- **Class 2024级钢铁智能冶金技术1班（高本贯通）** (day=7, slot=1)
  - overlapWeeks: 1,2,3,4,5,6,7,8
  - courses: 形势与政策 vs 冶金传输原理
  - teachers: 胡浩 vs 尹和鑫
  - rooms: 11-529 vs 11-209 或 12-111
  - slotIds: 31, 279
- **Class 2024级钢铁智能冶金技术1班（高本贯通）** (day=7, slot=1)
  - overlapWeeks: 1,3,5,7,9,11,13,15
  - courses: 传感器与检测技术 vs 冶金传输原理
  - teachers: 张旭 vs 尹和鑫
  - rooms: 11-318 vs 11-209 或 12-111
  - slotIds: 104, 279
- **Class 2024级森林草原防火技术1班** (day=7, slot=1)
  - overlapWeeks: 1,2,3,4,5,6,7,8
  - courses: 形势与政策 vs 森林防火通信技术
  - teachers: 胡浩 vs 王文来
  - rooms: 11-529 vs 11-212
  - slotIds: 31, 432
- **Class 2024级钢铁智能冶金技术1班（高本贯通）** (day=1, slot=4)
  - overlapWeeks: 1,2,3,4,5,6,7,8
  - courses: 创新创业教育 vs 大学日语
  - teachers: 徐燕 vs 葛书
  - rooms: 1号楼虚拟仿真实训室 vs 林校
304
  - slotIds: 34, 277
- **Class 2025级钢铁智能冶金技术1班（高本贯通）** (day=2, slot=1)
  - overlapWeeks: 2,4,6,8,10,12,14,16
  - courses: 习近平新时代中国特色社会主义思想概论 vs 林草环境
  - teachers: 房忠敏 vs 刘闯
  - rooms: 11-321 vs 林校306
  - slotIds: 43, 201
- **Class 2024级钢铁智能冶金技术1班（高本贯通）** (day=1, slot=5)
  - overlapWeeks: 2,4,6,8,10,12,14,16
  - courses: 金属材料与热处理 vs 金属材料与热处理
  - teachers: 王淼 vs 尹和鑫
  - rooms: 林校
306 vs 1-301
  - slotIds: 56, 263
- **Class 2025级机电一体化技术2班** (day=6, slot=5)
  - overlapWeeks: 1,3,5,7,9,11,13,15
  - courses: 电子技术 vs 机械制图
  - teachers: 许进 vs 张红梅
  - rooms: 11-329 vs 11-209
  - slotIds: 75, 84
- **Class 2024级钢铁智能冶金技术1班（高本贯通）** (day=7, slot=2)
  - overlapWeeks: 1,3,5,7,9,11,13,15
  - courses: ） 机械制图 vs 美育
  - teachers: 张红梅 vs 张显慧
  - rooms: 11-239 vs 11-204 或 11-105
  - slotIds: 114, 260
- **Class 2025级森林草原防火技术1班** (day=5, slot=6)
  - overlapWeeks: 1,2,3,4,5,6,7,8,9,10,11,12,13,14,15,16
  - courses: 消防法规 vs 森林火灾扑救指挥
  - teachers: 牛生光 vs 赵强
  - rooms: 11-504 vs 10-124
  - slotIds: 206, 214
- **Class 2024级钢铁智能冶金技术1班（高本贯通）** (day=4, slot=6)
  - overlapWeeks: 1,2,3,4,5,6,7,8,9,10,11,12,13,14,15,16
  - courses: 金属材料与热处理 vs 大学日语
  - teachers: 尹和鑫 vs 葛书
  - rooms: 11-322 vs 10-304
  - slotIds: 255, 265
- **Class 2024级钢铁智能冶金技术1班（高本贯通）** (day=5, slot=6)
  - overlapWeeks: 1,2,3,4,5,6,7,8,9,10,11,12,13,14,15,16
  - courses: 大学英语 vs 机械设计基础
  - teachers: 于秀杰 vs 于耀淇
  - rooms: 1-301 vs 林校
304
  - slotIds: 264, 268
- **Class 2024级钢铁智能冶金技术1班（高本贯通）** (day=2, slot=6)
  - overlapWeeks: 9,10,11,12,13,14,15,16
  - courses: 大学生职业发展与就业指导 vs 冶金传输原理
  - teachers: 董钇含 vs 尹和鑫
  - rooms: 10-316 vs 林校305
  - slotIds: 267, 273
- **Class 2024级钢铁智能冶金技术1班（高本贯通）** (day=2, slot=4)
  - overlapWeeks: 1,2,3,4,5,6,7,8,9,10,11,12,13,14,15,16
  - courses: 金属性能检测 vs 冶金热工基础
  - teachers: 尹和鑫 vs 赵春超
  - rooms: 11-329 vs 11-209
  - slotIds: 269, 272
- **Class 2024级汽车制造与试验技术2班** (day=4, slot=5)
  - overlapWeeks: 9,10,11,12,13,14,15,16
  - courses: 大学生职业发展与就业指导 vs 新能源汽车动力系统构造与测试
  - teachers: 孙文哲 vs 赵俣绗
  - rooms: 林校
303 vs 1-142
  - slotIds: 341, 359
- **Class 2024级森林草原防火技术1班** (day=6, slot=5)
  - overlapWeeks: 1,2,3,4,5,6,7,8,9,10,11,12,13,14,15,16
  - courses: 公关与礼仪 vs 森林火灾预防与扑救
  - teachers: 汪雯雯 vs 赵强
  - rooms: 11-301 vs 11-301
  - slotIds: 430, 435

## HC4: Capacity Violations

Total: 93 violations

- **机械制图** → Room 10-321
  - required: 93, capacity: 50, shortage: 43, ratio: 1.86x
  - classes: 2025级智能轧钢技术1班, 2025级钢铁智能冶金技术1班（高本贯通）, 2025级钢铁智能冶金技术（现场工程师）, 2025级智能轧钢技术（现场工程师）+2025级机电一体化技术（现场工程师）, 2024级钢铁智能冶金技术1班（高本贯通）
  - teacher: 于耀淇
  - day=2, slot=3
  - week: ODD (1-16)
- **金属材料与热处理** → Room 林校303
  - required: 93, capacity: 50, shortage: 43, ratio: 1.86x
  - classes: 2025级智能轧钢技术1班, 2025级钢铁智能冶金技术1班（高本贯通）, 2025级钢铁智能冶金技术（现场工程师）, 2025级智能轧钢技术（现场工程师）+2025级机电一体化技术（现场工程师）, 2024级钢铁智能冶金技术1班（高本贯通）
  - teacher: 尹和鑫
  - day=6, slot=5
  - week: EVEN (1-16)
- **机械制图** → Room 1-301
  - required: 92, capacity: 50, shortage: 42, ratio: 1.84x
  - classes: 2025级智能轧钢技术2班, 2025级钢铁智能冶金技术1班（高本贯通）, 2025级钢铁智能冶金技术（现场工程师）, 2025级智能轧钢技术（现场工程师）+2025级机电一体化技术（现场工程师）, 2024级钢铁智能冶金技术1班（高本贯通）
  - teacher: 于耀淇
  - day=3, slot=6
  - week: EVEN (1-16)
- **金属材料与热处理** → Room 11-521
  - required: 92, capacity: 50, shortage: 42, ratio: 1.84x
  - classes: 2025级智能轧钢技术2班, 2025级钢铁智能冶金技术1班（高本贯通）, 2025级钢铁智能冶金技术（现场工程师）, 2025级智能轧钢技术（现场工程师）+2025级机电一体化技术（现场工程师）, 2024级钢铁智能冶金技术1班（高本贯通）
  - teacher: 尹和鑫
  - day=4, slot=4
  - week: ODD (1-16)
- **形势与政策** → Room 11-529
  - required: 128, capacity: 50, shortage: 78, ratio: 2.56x
  - classes: 2025级钢铁智能冶金技术1班（高本贯通）, 2025级森林草原防火技术1班, 2024级钢铁智能冶金技术1班（高本贯通）, 2024级森林草原防火技术1班
  - teacher: 胡浩
  - day=7, slot=1
  - week: FIRST_HALF (1-8)
- **创新创业教育** → Room 1号楼虚拟仿真实训室
  - required: 128, capacity: 50, shortage: 78, ratio: 2.56x
  - classes: 2025级钢铁智能冶金技术1班（高本贯通）, 2025级森林草原防火技术1班, 2024级钢铁智能冶金技术1班（高本贯通）, 2024级森林草原防火技术1班
  - teacher: 徐燕
  - day=1, slot=4
  - week: FIRST_HALF (1-8)
- **习近平新时代中国特色社会主义思想概论** → Room 11-204 或 12-111
  - required: 128, capacity: 50, shortage: 78, ratio: 2.56x
  - classes: 2025级钢铁智能冶金技术1班（高本贯通）, 2025级森林草原防火技术1班, 2024级钢铁智能冶金技术1班（高本贯通）, 2024级森林草原防火技术1班
  - teacher: 房忠敏
  - day=5, slot=3
  - week: ALL (1-16)
- **中华优秀传统文化** → Room 11-208
  - required: 128, capacity: 50, shortage: 78, ratio: 2.56x
  - classes: 2025级钢铁智能冶金技术1班（高本贯通）, 2025级森林草原防火技术1班, 2024级钢铁智能冶金技术1班（高本贯通）, 2024级森林草原防火技术1班
  - teacher: 杨秀芳
  - day=3, slot=2
  - week: ALL (1-16)
- **习近平新时代中国特色社会主义思想概论** → Room 11-321
  - required: 98, capacity: 50, shortage: 48, ratio: 1.96x
  - classes: 2025级钢铁智能冶金技术1班（高本贯通）, 2025级森林草原防火技术1班, 2024级森林草原防火技术1班
  - teacher: 房忠敏
  - day=2, slot=1
  - week: ALL (1-16)
- **高等数学** → Room 10-227
  - required: 68, capacity: 50, shortage: 18, ratio: 1.36x
  - classes: 2025级钢铁智能冶金技术1班（高本贯通）, 2025级钢铁智能冶金技术（现场工程师）, 2025级智能轧钢技术（现场工程师）+2025级机电一体化技术（现场工程师）, 2024级钢铁智能冶金技术1班（高本贯通）
  - teacher: 李媛
  - day=7, slot=4
  - week: EVEN (1-16)
- **机械制图** → Room 11-333 或 11-105
  - required: 91, capacity: 50, shortage: 41, ratio: 1.82x
  - classes: 2025级钢铁智能冶金技术1班（高本贯通）, 2025级钢铁智能冶金技术2班, 2025级钢铁智能冶金技术（现场工程师）, 2025级智能轧钢技术（现场工程师）+2025级机电一体化技术（现场工程师）, 2024级钢铁智能冶金技术1班（高本贯通）
  - teacher: 赵春超
  - day=5, slot=1
  - week: EVEN (1-16)
- **金属材料与热处理** → Room 林校
306
  - required: 117, capacity: 50, shortage: 67, ratio: 2.34x
  - classes: 2025级钢铁智能冶金技术1班（高本贯通）, 2025级钢铁智能冶金技术2班, 2025级钢铁智能冶金技术3班, 2025级钢铁智能冶金技术（现场工程师）, 2025级智能轧钢技术（现场工程师）+2025级机电一体化技术（现场工程师）, 2024级钢铁智能冶金技术1班（高本贯通）
  - teacher: 王淼
  - day=1, slot=5
  - week: EVEN (1-16)
- **机械制图** → Room 10-321
  - required: 94, capacity: 50, shortage: 44, ratio: 1.88x
  - classes: 2025级钢铁智能冶金技术1班（高本贯通）, 2025级钢铁智能冶金技术3班, 2025级钢铁智能冶金技术（现场工程师）, 2025级智能轧钢技术（现场工程师）+2025级机电一体化技术（现场工程师）, 2024级钢铁智能冶金技术1班（高本贯通）
  - teacher: 赵春超
  - day=6, slot=4
  - week: ODD (1-16)
- **电子技术** → Room 11-223
  - required: 66, capacity: 50, shortage: 16, ratio: 1.32x
  - classes: 2025级机电一体化技术1班, 2025级机电一体化技术2班
  - teacher: 许进
  - day=6, slot=6
  - week: ALL (1-16)
- **创新创业教育** → Room 12-402
  - required: 66, capacity: 50, shortage: 16, ratio: 1.32x
  - classes: 2025级机电一体化技术1班, 2025级机电一体化技术2班
  - teacher: 孙文哲
  - day=2, slot=5
  - week: FIRST_HALF (1-8)
- **大学英语** → Room 11-212
  - required: 66, capacity: 50, shortage: 16, ratio: 1.32x
  - classes: 2025级机电一体化技术1班, 2025级机电一体化技术2班
  - teacher: 袁景丽
  - day=5, slot=1
  - week: ALL (1-16)
- **传感器** → Room 11-204
  - required: 103, capacity: 50, shortage: 53, ratio: 2.06x
  - classes: 2025级机电一体化技术1班, 2025级机电一体化技术2班, 2024级机电一体化技术1班
  - teacher: 张旭
  - day=7, slot=6
  - week: ALL (1-16)
- **习近平新时代中国特色社会主义思想概论** → Room 11-307
  - required: 66, capacity: 50, shortage: 16, ratio: 1.32x
  - classes: 2025级机电一体化技术1班, 2025级机电一体化技术2班
  - teacher: 牛怡亭
  - day=7, slot=2
  - week: ALL (1-16)
- **大学英语** → Room 11-223
  - required: 66, capacity: 50, shortage: 16, ratio: 1.32x
  - classes: 2025级机电一体化技术1班, 2025级机电一体化技术2班
  - teacher: 袁景丽
  - day=2, slot=1
  - week: ALL (1-16)
- **形势与政策** → Room 11-322 或 10-104
  - required: 66, capacity: 50, shortage: 16, ratio: 1.32x
  - classes: 2025级机电一体化技术1班, 2025级机电一体化技术2班
  - teacher: 董钇含
  - day=1, slot=4
  - week: FIRST_HALF (1-8)
- **习近平新时代中国特色社会主义思想概论** → Room 11-209 或 12-111
  - required: 66, capacity: 50, shortage: 16, ratio: 1.32x
  - classes: 2025级机电一体化技术1班, 2025级机电一体化技术2班
  - teacher: 牛怡亭
  - day=2, slot=3
  - week: FIRST_HALF (1-8)
- **电子技术** → Room 11-329
  - required: 134, capacity: 50, shortage: 84, ratio: 2.68x
  - classes: 2025级钢铁智能冶金技术1班（高本贯通）, 2025级机电一体化技术1班, 2025级机电一体化技术2班, 2025级钢铁智能冶金技术（现场工程师）, 2025级智能轧钢技术（现场工程师）+2025级机电一体化技术（现场工程师）, 2024级钢铁智能冶金技术1班（高本贯通）
  - teacher: 许进
  - day=6, slot=5
  - week: ODD (1-16)
- **传感器与检测技术** → Room 林校306
  - required: 101, capacity: 50, shortage: 51, ratio: 2.02x
  - classes: 2025级钢铁智能冶金技术1班（高本贯通）, 2025级机电一体化技术1班, 2025级钢铁智能冶金技术（现场工程师）, 2025级智能轧钢技术（现场工程师）+2025级机电一体化技术（现场工程师）, 2024级钢铁智能冶金技术1班（高本贯通）
  - teacher: 张旭
  - day=7, slot=3
  - week: ODD (1-16)
- **机械制图** → Room 林校305
  - required: 101, capacity: 50, shortage: 51, ratio: 2.02x
  - classes: 2025级钢铁智能冶金技术1班（高本贯通）, 2025级机电一体化技术1班, 2025级钢铁智能冶金技术（现场工程师）, 2025级智能轧钢技术（现场工程师）+2025级机电一体化技术（现场工程师）, 2024级钢铁智能冶金技术1班（高本贯通）
  - teacher: 张红梅
  - day=3, slot=4
  - week: ODD (1-16)
- **中华优秀传统文化** → Room 10-316
  - required: 66, capacity: 50, shortage: 16, ratio: 1.32x
  - classes: 2025级机电一体化技术1班, 2025级机电一体化技术2班
  - teacher: 杨旭
  - day=5, slot=2
  - week: ALL (1-16)
- **传感器与检测技术** → Room 11-322 或 10-104
  - required: 101, capacity: 50, shortage: 51, ratio: 2.02x
  - classes: 2025级钢铁智能冶金技术1班（高本贯通）, 2025级机电一体化技术2班, 2025级钢铁智能冶金技术（现场工程师）, 2025级智能轧钢技术（现场工程师）+2025级机电一体化技术（现场工程师）, 2024级钢铁智能冶金技术1班（高本贯通）
  - teacher: 张旭
  - day=5, slot=5
  - week: EVEN (1-16)
- **机械制图** → Room 11-521
  - required: 101, capacity: 50, shortage: 51, ratio: 2.02x
  - classes: 2025级钢铁智能冶金技术1班（高本贯通）, 2025级机电一体化技术2班, 2025级钢铁智能冶金技术（现场工程师）, 2025级智能轧钢技术（现场工程师）+2025级机电一体化技术（现场工程师）, 2024级钢铁智能冶金技术1班（高本贯通）
  - teacher: 张红梅
  - day=6, slot=3
  - week: EVEN (1-16)
- **大学英语** → Room 11-529
  - required: 68, capacity: 50, shortage: 18, ratio: 1.36x
  - classes: 2025级机电一体化技术3班, 2025级机电一体化技术4班
  - teacher: 沈军红
  - day=1, slot=1
  - week: ALL (1-16)
- **形势与政策** → Room 1-448
  - required: 68, capacity: 50, shortage: 18, ratio: 1.36x
  - classes: 2025级机电一体化技术3班, 2025级机电一体化技术4班
  - teacher: 胡浩
  - day=5, slot=5
  - week: FIRST_HALF (1-8)
- **传感器** → Room 1-142
  - required: 102, capacity: 50, shortage: 52, ratio: 2.04x
  - classes: 2025级机电一体化技术3班, 2025级机电一体化技术4班, 2024级机电一体化技术3班
  - teacher: 张旭
  - day=4, slot=2
  - week: ALL (1-16)
- **习近平新时代中国特色社会主义思想概论** → Room 11-239
  - required: 68, capacity: 50, shortage: 18, ratio: 1.36x
  - classes: 2025级机电一体化技术3班, 2025级机电一体化技术4班
  - teacher: 张帆
  - day=7, slot=3
  - week: ALL (1-16)
- **中华优秀传统文化** → Room 1-448
  - required: 68, capacity: 50, shortage: 18, ratio: 1.36x
  - classes: 2025级机电一体化技术3班, 2025级机电一体化技术4班
  - teacher: 杜红侠
  - day=5, slot=1
  - week: ALL (1-16)
- **大学英语** → Room 林校301
  - required: 68, capacity: 50, shortage: 18, ratio: 1.36x
  - classes: 2025级机电一体化技术3班, 2025级机电一体化技术4班
  - teacher: 沈军红
  - day=1, slot=2
  - week: ALL (1-16)
- **）机械制图** → Room 林校304
  - required: 103, capacity: 50, shortage: 53, ratio: 2.06x
  - classes: 2025级钢铁智能冶金技术1班（高本贯通）, 2025级机电一体化技术3班, 2025级钢铁智能冶金技术（现场工程师）, 2025级智能轧钢技术（现场工程师）+2025级机电一体化技术（现场工程师）, 2024级钢铁智能冶金技术1班（高本贯通）
  - teacher: 张红梅
  - day=1, slot=6
  - week: EVEN (1-16)
- **传感器与检测技术** → Room 11-318
  - required: 103, capacity: 50, shortage: 53, ratio: 2.06x
  - classes: 2025级钢铁智能冶金技术1班（高本贯通）, 2025级机电一体化技术3班, 2025级钢铁智能冶金技术（现场工程师）, 2025级智能轧钢技术（现场工程师）+2025级机电一体化技术（现场工程师）, 2024级钢铁智能冶金技术1班（高本贯通）
  - teacher: 张旭
  - day=7, slot=1
  - week: ODD (1-16)
- **习近平新时代中国特色社会主义思想概论** → Room 11-529
  - required: 68, capacity: 50, shortage: 18, ratio: 1.36x
  - classes: 2025级机电一体化技术3班, 2025级机电一体化技术4班
  - teacher: 张帆
  - day=5, slot=2
  - week: FIRST_HALF (1-8)
- **创新创业教育** → Room 11-529
  - required: 68, capacity: 50, shortage: 18, ratio: 1.36x
  - classes: 2025级机电一体化技术3班, 2025级机电一体化技术4班
  - teacher: 董钇含
  - day=7, slot=6
  - week: FIRST_HALF (1-8)
- **） 机械制图** → Room 11-239
  - required: 101, capacity: 50, shortage: 51, ratio: 2.02x
  - classes: 2025级钢铁智能冶金技术1班（高本贯通）, 2025级机电一体化技术4班, 2025级钢铁智能冶金技术（现场工程师）, 2025级智能轧钢技术（现场工程师）+2025级机电一体化技术（现场工程师）, 2024级钢铁智能冶金技术1班（高本贯通）
  - teacher: 张红梅
  - day=7, slot=2
  - week: ODD (1-16)
- **传感器与检测技术** → Room 11-209
  - required: 101, capacity: 50, shortage: 51, ratio: 2.02x
  - classes: 2025级钢铁智能冶金技术1班（高本贯通）, 2025级机电一体化技术4班, 2025级钢铁智能冶金技术（现场工程师）, 2025级智能轧钢技术（现场工程师）+2025级机电一体化技术（现场工程师）, 2024级钢铁智能冶金技术1班（高本贯通）
  - teacher: 张旭
  - day=1, slot=3
  - week: EVEN (1-16)
- **大学英语** → Room 林校304
  - required: 83, capacity: 50, shortage: 33, ratio: 1.66x
  - classes: 2025级汽车制造与试验技术1班, 2025级汽车制造与试验技术2班, 2025级智能网联汽车技术
  - teacher: 赵新宇
  - day=5, slot=1
  - week: ALL (1-16)
- **习近平新时代中国特色社会主义思想概论** → Room 12-402
  - required: 83, capacity: 50, shortage: 33, ratio: 1.66x
  - classes: 2025级汽车制造与试验技术1班, 2025级汽车制造与试验技术2班, 2025级智能网联汽车技术
  - teacher: 张帆
  - day=7, slot=1
  - week: ALL (1-16)
- **创新创业教育** → Room 林校305
  - required: 83, capacity: 50, shortage: 33, ratio: 1.66x
  - classes: 2025级汽车制造与试验技术1班, 2025级汽车制造与试验技术2班, 2025级智能网联汽车技术
  - teacher: 徐燕
  - day=2, slot=4
  - week: FIRST_HALF (1-8)
- **中华优秀传统文化** → Room 11-328
  - required: 83, capacity: 50, shortage: 33, ratio: 1.66x
  - classes: 2025级汽车制造与试验技术1班, 2025级汽车制造与试验技术2班, 2025级智能网联汽车技术
  - teacher: 汪雯雯
  - day=1, slot=3
  - week: ALL (1-16)
- **形势与政策** → Room 1-232
  - required: 83, capacity: 50, shortage: 33, ratio: 1.66x
  - classes: 2025级汽车制造与试验技术1班, 2025级汽车制造与试验技术2班, 2025级智能网联汽车技术
  - teacher: 崔春梅
  - day=5, slot=5
  - week: FIRST_HALF (1-8)
- **习近平新时代中国特色社会主义思想概论** → Room 11-204
  - required: 83, capacity: 50, shortage: 33, ratio: 1.66x
  - classes: 2025级汽车制造与试验技术1班, 2025级汽车制造与试验技术2班, 2025级智能网联汽车技术
  - teacher: 张帆
  - day=7, slot=5
  - week: FIRST_HALF (1-8)
- **大学英语** → Room 11-321 或 10-104
  - required: 83, capacity: 50, shortage: 33, ratio: 1.66x
  - classes: 2025级汽车制造与试验技术1班, 2025级汽车制造与试验技术2班, 2025级智能网联汽车技术
  - teacher: 赵新宇
  - day=1, slot=1
  - week: ALL (1-16)
- **形势与政策** → Room 11-208 或 12-201
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
- **中华优秀传统文化** → Room 1号楼虚拟仿真实训室
  - required: 52, capacity: 50, shortage: 2, ratio: 1.04x
  - classes: 2025级林业技术1班, 2025级林业技术2班
  - teacher: 杨旭
  - day=6, slot=4
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
- **大学英语** → Room 11-204 或 11-105
  - required: 55, capacity: 50, shortage: 5, ratio: 1.1x
  - classes: 2025级森林草原资源保护1班, 2025级森林草原资源保护2班
  - teacher: 刘明哲
  - day=5, slot=6
  - week: ALL (1-16)
- **形势与政策** → Room 10-316
  - required: 55, capacity: 50, shortage: 5, ratio: 1.1x
  - classes: 2025级森林草原资源保护1班, 2025级森林草原资源保护2班
  - teacher: 莫子君
  - day=1, slot=2
  - week: SECOND_HALF (9-16)
- **习近平新时代中国特色社会主义思想概论** → Room 林校
306
  - required: 55, capacity: 50, shortage: 5, ratio: 1.1x
  - classes: 2025级森林草原资源保护1班, 2025级森林草原资源保护2班
  - teacher: 张黎
  - day=4, slot=5
  - week: ALL (1-16)
- **创新创业教育** → Room 11-322
  - required: 55, capacity: 50, shortage: 5, ratio: 1.1x
  - classes: 2025级森林草原资源保护1班, 2025级森林草原资源保护2班
  - teacher: 徐燕
  - day=1, slot=1
  - week: FIRST_HALF (1-8)
- **中华优秀传统文化** → Room 林校304
  - required: 55, capacity: 50, shortage: 5, ratio: 1.1x
  - classes: 2025级森林草原资源保护1班, 2025级森林草原资源保护2班
  - teacher: 姜剑书
  - day=2, slot=5
  - week: ALL (1-16)
- **林草培育** → Room 11-322 或 10-104
  - required: 55, capacity: 50, shortage: 5, ratio: 1.1x
  - classes: 2025级森林草原资源保护1班, 2025级森林草原资源保护2班
  - teacher: 刘艳
  - day=2, slot=4
  - week: ALL (1-16)
- **习近平新时代中国特色社会主义思想概论** → Room 10-410
  - required: 55, capacity: 50, shortage: 5, ratio: 1.1x
  - classes: 2025级森林草原资源保护1班, 2025级森林草原资源保护2班
  - teacher: 张黎
  - day=6, slot=6
  - week: FIRST_HALF (1-8)
- **大学英语** → Room 林校301
  - required: 55, capacity: 50, shortage: 5, ratio: 1.1x
  - classes: 2025级森林草原资源保护1班, 2025级森林草原资源保护2班
  - teacher: 刘明哲
  - day=4, slot=3
  - week: ALL (1-16)
- **林草培育** → Room 11-333
  - required: 55, capacity: 50, shortage: 5, ratio: 1.1x
  - classes: 2025级森林草原资源保护1班, 2025级森林草原资源保护2班
  - teacher: 刘艳
  - day=1, slot=4
  - week: ALL (1-16)
- **林草环境** → Room 11-212
  - required: 95, capacity: 50, shortage: 45, ratio: 1.9x
  - classes: 2025级钢铁智能冶金技术1班（高本贯通）, 2025级森林草原资源保护1班, 2025级钢铁智能冶金技术（现场工程师）, 2025级智能轧钢技术（现场工程师）+2025级机电一体化技术（现场工程师）, 2024级钢铁智能冶金技术1班（高本贯通）
  - teacher: 刘闯
  - day=6, slot=1
  - week: ODD (1-16)
- **无人机应用技术** → Room 10-124
  - required: 95, capacity: 50, shortage: 45, ratio: 1.9x
  - classes: 2025级钢铁智能冶金技术1班（高本贯通）, 2025级森林草原资源保护1班, 2025级钢铁智能冶金技术（现场工程师）, 2025级智能轧钢技术（现场工程师）+2025级机电一体化技术（现场工程师）, 2024级钢铁智能冶金技术1班（高本贯通）
  - teacher: 董继扬
  - day=6, slot=3
  - week: ODD (1-16)
- **林草环境** → Room 林校306
  - required: 96, capacity: 50, shortage: 46, ratio: 1.92x
  - classes: 2025级钢铁智能冶金技术1班（高本贯通）, 2025级森林草原资源保护2班, 2025级钢铁智能冶金技术（现场工程师）, 2025级智能轧钢技术（现场工程师）+2025级机电一体化技术（现场工程师）, 2024级钢铁智能冶金技术1班（高本贯通）
  - teacher: 刘闯
  - day=2, slot=1
  - week: EVEN (1-16)
- **无人机应用技术** → Room 10-316
  - required: 96, capacity: 50, shortage: 46, ratio: 1.92x
  - classes: 2025级钢铁智能冶金技术1班（高本贯通）, 2025级森林草原资源保护2班, 2025级钢铁智能冶金技术（现场工程师）, 2025级智能轧钢技术（现场工程师）+2025级机电一体化技术（现场工程师）, 2024级钢铁智能冶金技术1班（高本贯通）
  - teacher: 董继扬
  - day=4, slot=4
  - week: EVEN (1-16)
- **习近平新时代中国特色社会主义思想概论** → Room 11-301
  - required: 91, capacity: 50, shortage: 41, ratio: 1.82x
  - classes: 2025级钢铁智能冶金技术1班（高本贯通）, 2025级森林草原防火技术1班, 2024级钢铁智能冶金技术1班（高本贯通）
  - teacher: 房忠敏
  - day=4, slot=3
  - week: FIRST_HALF (1-8)
- **美育** → Room 1-142
  - required: 75, capacity: 50, shortage: 25, ratio: 1.5x
  - classes: 2024级智能轧钢技术1班, 2024级智能轧钢技术2班, 2024级机电一体化技术1班
  - teacher: 苏英周
  - day=6, slot=5
  - week: ALL (1-16)
- **大学生职业发展与就业指导** → Room 11-204 或 11-105
  - required: 75, capacity: 50, shortage: 25, ratio: 1.5x
  - classes: 2024级智能轧钢技术1班, 2024级智能轧钢技术2班, 2024级机电一体化技术1班
  - teacher: 孙文哲
  - day=2, slot=2
  - week: CUSTOM (9-16)
- **美育** → Room 11-204 或 11-105
  - required: 78, capacity: 50, shortage: 28, ratio: 1.56x
  - classes: 2024级钢铁智能冶金技术1班（高本贯通）, 2024级钢铁智能冶金技术2班, 2024级钢铁智能冶金技术3班
  - teacher: 张显慧
  - day=7, slot=2
  - week: ALL (1-16)
- **大学生职业发展与就业指导** → Room 10-316
  - required: 78, capacity: 50, shortage: 28, ratio: 1.56x
  - classes: 2024级钢铁智能冶金技术1班（高本贯通）, 2024级钢铁智能冶金技术2班, 2024级钢铁智能冶金技术3班
  - teacher: 董钇含
  - day=2, slot=6
  - week: CUSTOM (9-16)
- **机械设计基础** → Room 11-212
  - required: 72, capacity: 50, shortage: 22, ratio: 1.44x
  - classes: 2024级机电一体化技术1班, 2024级机电一体化技术2班
  - teacher: 李媛
  - day=1, slot=2
  - week: ALL (1-16)
- **液压与气压传动** → Room 1-133
  - required: 72, capacity: 50, shortage: 22, ratio: 1.44x
  - classes: 2024级机电一体化技术1班, 2024级机电一体化技术2班
  - teacher: 李媛
  - day=2, slot=4
  - week: ALL (1-16)
- **机械设计基础** → Room 11-321 或 10-104
  - required: 72, capacity: 50, shortage: 22, ratio: 1.44x
  - classes: 2024级机电一体化技术1班, 2024级机电一体化技术2班
  - teacher: 李媛
  - day=4, slot=5
  - week: ALL (1-16)
- **液压与气压传动** → Room 11-504
  - required: 72, capacity: 50, shortage: 22, ratio: 1.44x
  - classes: 2024级机电一体化技术1班, 2024级机电一体化技术2班
  - teacher: 李媛
  - day=6, slot=3
  - week: ALL (1-16)
- **大学生职业发展与就业指导** → Room 1号楼虚拟仿真实训室
  - required: 69, capacity: 50, shortage: 19, ratio: 1.38x
  - classes: 2024级机电一体化技术2班, 2024级机电一体化技术3班
  - teacher: 孙文哲
  - day=5, slot=1
  - week: CUSTOM (9-16)
- **美育** → Room 林校
304
  - required: 69, capacity: 50, shortage: 19, ratio: 1.38x
  - classes: 2024级机电一体化技术2班, 2024级机电一体化技术3班
  - teacher: 苏英周
  - day=1, slot=5
  - week: ALL (1-16)
- **大学生职业发展与就业指导** → Room 林校
303
  - required: 55, capacity: 50, shortage: 5, ratio: 1.1x
  - classes: 2024级汽车制造与试验技术1班, 2024级汽车制造与试验技术2班
  - teacher: 孙文哲
  - day=4, slot=5
  - week: CUSTOM (9-16)
- **汽车机械基础** → Room 11-204 或 12-111
  - required: 55, capacity: 50, shortage: 5, ratio: 1.1x
  - classes: 2024级汽车制造与试验技术1班, 2024级汽车制造与试验技术2班
  - teacher: 李媛
  - day=6, slot=1
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
- **汽车营销（非学徒制）** → Room 10-410
  - required: 55, capacity: 50, shortage: 5, ratio: 1.1x
  - classes: 2024级汽车制造与试验技术1班, 2024级汽车制造与试验技术2班
  - teacher: 刘艳艳
  - day=2, slot=5
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
- **美育** → Room 林校
304
  - required: 51, capacity: 50, shortage: 1, ratio: 1.02x
  - classes: 2024级林业技术1班, 2024级林业技术2班
  - teacher: 张显慧
  - day=6, slot=4
  - week: ALL (1-16)
- **学生职业发展与就业指导** → Room 11-529
  - required: 51, capacity: 50, shortage: 1, ratio: 1.02x
  - classes: 2024级林业技术1班, 2024级林业技术2班
  - teacher: 徐燕
  - day=4, slot=1
  - week: CUSTOM (9-16)
- **经济林栽培** → Room 12楼机房
  - required: 51, capacity: 50, shortage: 1, ratio: 1.02x
  - classes: 2024级林业技术1班, 2024级林业技术2班
  - teacher: 刘娜
  - day=6, slot=1
  - week: ALL (1-16)
- **经济林栽培** → Room 11-328 或 11-105
  - required: 51, capacity: 50, shortage: 1, ratio: 1.02x
  - classes: 2024级林业技术1班, 2024级林业技术2班
  - teacher: 刘娜
  - day=5, slot=3
  - week: ALL (1-16)
- **美育** → Room 11-328
  - required: 89, capacity: 50, shortage: 39, ratio: 1.78x
  - classes: 2024级森林草原资源保护1班, 2024级森林草原资源保护2班, 2024级森林草原防火技术1班
  - teacher: 张显慧
  - day=3, slot=1
  - week: ALL (1-16)
- **经济林栽培** → Room 11-209 或 12-111
  - required: 52, capacity: 50, shortage: 2, ratio: 1.04x
  - classes: 2024级森林草原资源保护1班, 2024级森林草原资源保护2班
  - teacher: 刘娜
  - day=1, slot=6
  - week: ALL (1-16)
- **经济林栽培** → Room 林校
303
  - required: 52, capacity: 50, shortage: 2, ratio: 1.04x
  - classes: 2024级森林草原资源保护1班, 2024级森林草原资源保护2班
  - teacher: 刘娜
  - day=3, slot=4
  - week: ALL (1-16)
- **学生职业发展与就业指导** → Room 林校304
  - required: 89, capacity: 50, shortage: 39, ratio: 1.78x
  - classes: 2024级森林草原资源保护1班, 2024级森林草原资源保护2班, 2024级森林草原防火技术1班
  - teacher: 徐燕
  - day=6, slot=1
  - week: CUSTOM (9-16)

## HC5: Room Unavailability

No room unavailability violations detected.

## Top 5 Capacity Gaps

| # | Course | Classes | Required | Room(Cap) | Shortage | Ratio | Day-Slot |
|---|--------|---------|----------|-----------|----------|-------|----------|
| 1 | 电子技术 | 2025级钢铁智能冶金技术1班（高本贯通）, 2025级机电一体化技术1班, 2025级机电一体化技术2班, 2025级钢铁智能冶金技术（现场工程师）, 2025级智能轧钢技术（现场工程师）+2025级机电一体化技术（现场工程师）, 2024级钢铁智能冶金技术1班（高本贯通） | 134 | 11-329(50) | 84 | 2.68x | 6-5 |
| 2 | 形势与政策 | 2025级钢铁智能冶金技术1班（高本贯通）, 2025级森林草原防火技术1班, 2024级钢铁智能冶金技术1班（高本贯通）, 2024级森林草原防火技术1班 | 128 | 11-529(50) | 78 | 2.56x | 7-1 |
| 3 | 创新创业教育 | 2025级钢铁智能冶金技术1班（高本贯通）, 2025级森林草原防火技术1班, 2024级钢铁智能冶金技术1班（高本贯通）, 2024级森林草原防火技术1班 | 128 | 1号楼虚拟仿真实训室(50) | 78 | 2.56x | 1-4 |
| 4 | 习近平新时代中国特色社会主义思想概论 | 2025级钢铁智能冶金技术1班（高本贯通）, 2025级森林草原防火技术1班, 2024级钢铁智能冶金技术1班（高本贯通）, 2024级森林草原防火技术1班 | 128 | 11-204 或 12-111(50) | 78 | 2.56x | 5-3 |
| 5 | 中华优秀传统文化 | 2025级钢铁智能冶金技术1班（高本贯通）, 2025级森林草原防火技术1班, 2024级钢铁智能冶金技术1班（高本贯通）, 2024级森林草原防火技术1班 | 128 | 11-208(50) | 78 | 2.56x | 3-2 |

## Top 5 Class Conflict Hotspots

| # | Class Group | Conflicts | Worst Day-Slot | Involved Courses |
|---|-------------|-----------|----------------|------------------|
| 1 | 2024级钢铁智能冶金技术1班（高本贯通） | 12 | 7-1 | 机械制图, 大学英语, 冶金传输原理, 形势与政策, 传感器与检测技术, 创新创业教育, 大学日语, 金属材料与热处理, ） 机械制图, 美育 |
| 2 | 2025级钢铁智能冶金技术1班（高本贯通） | 5 | 6-5 | 机械制图, 心理健康教育, 金属材料与热处理, 高等数学, 电子技术, 形势与政策, 传感器与检测技术, 习近平新时代中国特色社会主义思想概论, 林草环境 |
| 3 | 2025级森林草原防火技术1班 | 2 | 7-1 | 形势与政策, 森林草原火管理, 消防法规, 森林火灾扑救指挥 |
| 4 | 2024级森林草原防火技术1班 | 2 | 7-1 | 形势与政策, 森林防火通信技术, 公关与礼仪, 森林火灾预防与扑救 |
| 5 | 2025级机电一体化技术2班 | 1 | 6-5 | 电子技术, 机械制图 |

## Top 5 Room Conflict Hotspots

| # | Room | Conflicts | Day-Slot | Involved Courses |
|---|------|-----------|----------|------------------|
| 1 | 11-301 | 1 | 6-5 | 公关与礼仪, 森林火灾预防与扑救 |

## Teacher Conflicts

2 teacher conflicts detected.

Top teacher conflict hotspots:
- **赵春超** (day=6, slot=4)
  - overlapWeeks: 1,3,5,7,9,11,13,15
  - courses: 机械制图 vs 机械制图
- **王淼** (day=3, slot=5)
  - overlapWeeks: 1,2,3,4,5,6,7,8,9,10,11,12,13,14,15,16
  - courses: 冶金热工基础 vs 流体力学

## Top 10 Time Slot Pressure

| Day-Slot | Slots | Rooms | Classes | CapShortage | ClassConf | RoomConf |
|----------|-------|-------|---------|-------------|-----------|----------|
| 7-1 | 12 | 10 | 14 | 3 | 6 | 0 |
| 6-5 | 10 | 8 | 13 | 3 | 4 | 1 |
| 2-4 | 13 | 13 | 18 | 4 | 1 | 0 |
| 5-1 | 11 | 10 | 21 | 5 | 0 | 0 |
| 1-1 | 11 | 11 | 16 | 4 | 0 | 0 |
| 1-4 | 16 | 15 | 20 | 3 | 1 | 0 |
| 1-5 | 8 | 7 | 14 | 3 | 1 | 0 |
| 2-1 | 10 | 10 | 17 | 3 | 1 | 0 |
| 2-3 | 13 | 12 | 27 | 2 | 2 | 0 |
| 4-3 | 8 | 8 | 13 | 4 | 0 | 0 |

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

## Notes

- HC1-HC5 details computed via secondary traversal of bestState (no score.ts modification)
- Week overlap computed using expandWeeks from conflict.ts
- Score reconciliation identifies delta-vs-full scoring discrepancy