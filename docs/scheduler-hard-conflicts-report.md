# K9-A2 Diagnostic Report

**Run timestamp:** 2026-05-30T05:35:39.412Z
**Duration:** 244ms

## Solver Config

- maxIterations: 10000
- lahcWindowSize: 500

## Data Summary

- tasks: 308
- rooms: 53
- slots: 440

## Solver Result

- iterations: 10000
- durationMs: 244
- hardScore (solver best): -59000
- softScore (solver best): -1296
- hardScore (re-evaluated): -59000
- softScore (re-evaluated): -1426
- assignmentCount: 440

## Score Reconciliation

- solver best hardScore: -59000
- re-evaluated hardScore: -59000
- difference: 0
- difference in conflict units: 0
- consistent: true
- needs K9-B-SCORING: no

## HC2 Consistency Check

- scoreWithDetails HC2 count: 5
- buildHC2Details count: 5
- consistent: true

## Conflict Summary

| Type | Count | Penalty |
|------|-------|---------|
| HC1_ROOM_CONFLICT | 17 | -17000 |
| HC2_TEACHER_CONFLICT | 5 | -5000 |
| HC3_CLASS_CONFLICT | 27 | -27000 |
| HC4_CAPACITY | 10 | -10000 |
| HC5_ROOM_UNAVAILABLE | 0 | 0 |
| **Total Hard** | **59** | **-59000** |

## HC1: Room Time Conflicts

Total: 17 conflict pairs

- **Room 11-239** (day=3, slot=6)
  - overlapWeeks: 1,3,5,7,9,11,13,15
  - courses: 机械制图 vs 机械设计基础
  - teachers: 于耀淇 vs 李媛
  - classes: 2025级智能轧钢技术1班, 2025级钢铁智能冶金技术1班（高本贯通）, 2025级钢铁智能冶金技术（现场工程师）, 2025级智能轧钢技术（现场工程师）+2025级机电一体化技术（现场工程师）, 2024级钢铁智能冶金技术1班（高本贯通）, 2024级机电一体化技术1班, 2024级机电一体化技术2班
  - slotIds: 11, 312
- **Room 11-239** (day=3, slot=6)
  - overlapWeeks: 1,3,5,7,9,11,13,15
  - courses: 机械制图 vs 美育
  - teachers: 于耀淇 vs 李恩翠
  - classes: 2025级智能轧钢技术1班, 2025级钢铁智能冶金技术1班（高本贯通）, 2025级钢铁智能冶金技术（现场工程师）, 2025级智能轧钢技术（现场工程师）+2025级机电一体化技术（现场工程师）, 2024级钢铁智能冶金技术1班（高本贯通）, 2024级汽车制造与试验技术1班, 2024级汽车制造与试验技术2班
  - slotIds: 11, 349
- **Room 11-239** (day=3, slot=6)
  - overlapWeeks: 2,4,6,8,10,12,14,16
  - courses: 金属材料与热处理 vs 机械设计基础
  - teachers: 尹和鑫 vs 李媛
  - classes: 2025级智能轧钢技术1班, 2025级钢铁智能冶金技术1班（高本贯通）, 2025级钢铁智能冶金技术（现场工程师）, 2025级智能轧钢技术（现场工程师）+2025级机电一体化技术（现场工程师）, 2024级钢铁智能冶金技术1班（高本贯通）, 2024级机电一体化技术1班, 2024级机电一体化技术2班
  - slotIds: 14, 312
- **Room 11-239** (day=3, slot=6)
  - overlapWeeks: 2,4,6,8,10,12,14,16
  - courses: 金属材料与热处理 vs 美育
  - teachers: 尹和鑫 vs 李恩翠
  - classes: 2025级智能轧钢技术1班, 2025级钢铁智能冶金技术1班（高本贯通）, 2025级钢铁智能冶金技术（现场工程师）, 2025级智能轧钢技术（现场工程师）+2025级机电一体化技术（现场工程师）, 2024级钢铁智能冶金技术1班（高本贯通）, 2024级汽车制造与试验技术1班, 2024级汽车制造与试验技术2班
  - slotIds: 14, 349
- **Room 11-239** (day=3, slot=6)
  - overlapWeeks: 1,2,3,4,5,6,7,8,9,10,11,12,13,14,15,16
  - courses: 机械设计基础 vs 美育
  - teachers: 李媛 vs 李恩翠
  - classes: 2024级机电一体化技术1班, 2024级机电一体化技术2班, 2024级汽车制造与试验技术1班, 2024级汽车制造与试验技术2班
  - slotIds: 312, 349
- **Room 1-142** (day=5, slot=2)
  - overlapWeeks: 9,10,11,12,13,14,15,16
  - courses: 大学英语 vs 大学生职业发展与就业指导
  - teachers: 王琳 vs 孙文哲
  - classes: 2025级智能轧钢技术1班, 2025级智能轧钢技术2班, 2024级智能轧钢技术1班, 2024级智能轧钢技术2班, 2024级机电一体化技术1班
  - slotIds: 12, 245
- **Room 11-239** (day=2, slot=2)
  - overlapWeeks: 1,3,5,7
  - courses: 金属材料与热处理 vs 创新创业教育
  - teachers: 尹和鑫 vs 王素燕
  - classes: 2025级智能轧钢技术2班, 2025级钢铁智能冶金技术1班（高本贯通）, 2025级钢铁智能冶金技术（现场工程师）, 2025级智能轧钢技术（现场工程师）+2025级机电一体化技术（现场工程师）, 2024级钢铁智能冶金技术1班（高本贯通）, 2025级林业技术1班, 2025级林业技术2班
  - slotIds: 25, 164
- **Room 11-239** (day=3, slot=5)
  - overlapWeeks: 2,4,6,8
  - courses: 机械制图 vs 形势与政策
  - teachers: 赵春超 vs 胡浩
  - classes: 2025级钢铁智能冶金技术1班（高本贯通）, 2025级钢铁智能冶金技术2班, 2025级钢铁智能冶金技术（现场工程师）, 2025级智能轧钢技术（现场工程师）+2025级机电一体化技术（现场工程师）, 2024级钢铁智能冶金技术1班（高本贯通）, 2025级机电一体化技术3班, 2025级机电一体化技术4班
  - slotIds: 55, 93
- **Room 11-239** (day=3, slot=5)
  - overlapWeeks: 1,3,5,7
  - courses: 机械制图 vs 形势与政策
  - teachers: 赵春超 vs 胡浩
  - classes: 2025级钢铁智能冶金技术1班（高本贯通）, 2025级钢铁智能冶金技术3班, 2025级钢铁智能冶金技术（现场工程师）, 2025级智能轧钢技术（现场工程师）+2025级机电一体化技术（现场工程师）, 2024级钢铁智能冶金技术1班（高本贯通）, 2025级机电一体化技术3班, 2025级机电一体化技术4班
  - slotIds: 62, 93
- **Room 1号楼虚拟仿真实训室** (day=4, slot=6)
  - overlapWeeks: 1,2,3,4,5,6,7,8,9,10,11,12,13,14,15,16
  - courses: 习近平新时代中国特色社会主义思想概论 vs 经济林栽培
  - teachers: 牛怡亭 vs 刘娜
  - classes: 2025级机电一体化技术1班, 2025级机电一体化技术2班, 2024级林业技术1班, 2024级林业技术2班
  - slotIds: 71, 391
- **Room 1-142** (day=3, slot=4)
  - overlapWeeks: 1,2,3,4,5,6,7,8
  - courses: 形势与政策 vs 汽车营销（非学徒制）
  - teachers: 董钇含 vs 刘艳艳
  - classes: 2025级机电一体化技术1班, 2025级机电一体化技术2班, 2024级汽车制造与试验技术1班, 2024级汽车制造与试验技术2班
  - slotIds: 73, 352
- **Room 11-208 或 12-201** (day=1, slot=1)
  - overlapWeeks: 1,2,3,4,5,6,7,8,9,10,11,12,13,14,15,16
  - courses: PLC技术与应用 vs 林业法规与执法实务
  - teachers: 许进 vs 徐厚朴
  - classes: 2025级机电一体化技术4班, 2024级林业技术1班
  - slotIds: 111, 383
- **Room 1-142** (day=5, slot=6)
  - overlapWeeks: 2,4,6,8,10,12,14,16
  - courses: 传感器与检测技术 vs 林草培育
  - teachers: 张旭 vs 刘艳
  - classes: 2025级钢铁智能冶金技术1班（高本贯通）, 2025级机电一体化技术4班, 2025级钢铁智能冶金技术（现场工程师）, 2025级智能轧钢技术（现场工程师）+2025级机电一体化技术（现场工程师）, 2024级钢铁智能冶金技术1班（高本贯通）, 2025级森林草原资源保护1班, 2025级森林草原资源保护2班
  - slotIds: 115, 183
- **Room 1-142** (day=5, slot=6)
  - overlapWeeks: 2,4,6,8,10,12,14,16
  - courses: 传感器与检测技术 vs 美育
  - teachers: 张旭 vs 张显慧
  - classes: 2025级钢铁智能冶金技术1班（高本贯通）, 2025级机电一体化技术4班, 2025级钢铁智能冶金技术（现场工程师）, 2025级智能轧钢技术（现场工程师）+2025级机电一体化技术（现场工程师）, 2024级钢铁智能冶金技术1班（高本贯通）, 2024级森林草原资源保护1班, 2024级森林草原资源保护2班, 2024级森林草原防火技术1班
  - slotIds: 115, 408
- **Room 1-142** (day=5, slot=6)
  - overlapWeeks: 1,2,3,4,5,6,7,8,9,10,11,12,13,14,15,16
  - courses: 林草培育 vs 美育
  - teachers: 刘艳 vs 张显慧
  - classes: 2025级森林草原资源保护1班, 2025级森林草原资源保护2班, 2024级森林草原资源保护1班, 2024级森林草原资源保护2班, 2024级森林草原防火技术1班
  - slotIds: 183, 408
- **Room 1-133** (day=6, slot=4)
  - overlapWeeks: 1,2,3,4,5,6,7,8,9,10,11,12,13,14,15,16
  - courses: 林草环境 vs 机械设计基础
  - teachers: 刘闯 vs 于耀淇
  - classes: 2025级森林草原资源保护1班, 2024级钢铁智能冶金技术1班（高本贯通）
  - slotIds: 185, 278
- **Room 10-321** (day=3, slot=4)
  - overlapWeeks: 1,2,3,4,5,6,7,8,9,10,11,12,13,14,15,16
  - courses: 机电技能实训 vs 数据库应用技术
  - teachers: 杨志强 vs 孙伟伟
  - classes: 2024级机电一体化技术2班, 2024级汽车制造与试验技术五年制
  - slotIds: 319, 372

## HC2: Teacher Time Conflicts

Total: 5 conflict pairs

- **Teacher 尹和鑫** (day=3, slot=6)
  - overlapWeeks: 2,4,6,8,10,12,14,16
  - courses: 金属材料与热处理 vs 金属性能检测
  - classes: 2025级智能轧钢技术1班, 2025级钢铁智能冶金技术1班（高本贯通）, 2025级钢铁智能冶金技术（现场工程师）, 2025级智能轧钢技术（现场工程师）+2025级机电一体化技术（现场工程师）, 2024级钢铁智能冶金技术1班（高本贯通）, 2024级钢铁智能冶金技术1班（高本贯通）
  - rooms: 11-239 vs 11-204 或 11-105
  - slotIds: 14, 275
- **Teacher 王淼** (day=1, slot=2)
  - overlapWeeks: 2,4,6,8,10,12,14,16
  - courses: 金属材料与热处理 vs 炼铁技术
  - classes: 2025级钢铁智能冶金技术1班（高本贯通）, 2025级钢铁智能冶金技术2班, 2025级钢铁智能冶金技术3班, 2025级钢铁智能冶金技术（现场工程师）, 2025级智能轧钢技术（现场工程师）+2025级机电一体化技术（现场工程师）, 2024级钢铁智能冶金技术1班（高本贯通）, 2024级智能轧钢技术1班, 2024级智能轧钢技术2班
  - rooms: 1-142 vs 11-521
  - slotIds: 56, 236
- **Teacher 张红梅** (day=6, slot=5)
  - overlapWeeks: 2,4,6,8,10,12,14,16
  - courses: 机械制图 vs 机械制图
  - classes: 2025级钢铁智能冶金技术1班（高本贯通）, 2025级机电一体化技术2班, 2025级钢铁智能冶金技术（现场工程师）, 2025级智能轧钢技术（现场工程师）+2025级机电一体化技术（现场工程师）, 2024级钢铁智能冶金技术1班（高本贯通）, 2025级汽车制造与试验技术2班
  - rooms: 1-142 vs 11-204
  - slotIds: 88, 141
- **Teacher 刘艳艳** (day=1, slot=5)
  - overlapWeeks: 1,2,3,4,5,6,7,8,9,10,11,12,13,14,15,16
  - courses: 智能网联汽车概论 vs 智能网联汽车概论
  - classes: 2025级智能网联汽车技术, 2025级智能网联汽车技术
  - rooms: 10-321 vs 林校
305
  - slotIds: 145, 150
- **Teacher 李媛** (day=2, slot=5)
  - overlapWeeks: 1,2,3,4,5,6,7,8,9,10,11,12,13,14,15,16
  - courses: 液压与气压传动 vs 机械设计基础
  - classes: 2024级智能轧钢技术1班, 2024级智能轧钢技术2班, 2024级机电一体化技术1班, 2024级机电一体化技术2班
  - rooms: 林校301 vs 1号楼虚拟仿真实训室
  - slotIds: 247, 307

## HC3: Class Time Conflicts

Total: 27 conflict pairs

- **Class 2025级智能轧钢技术1班** (day=3, slot=6)
  - overlapWeeks: 1,3,5,7,9,11,13,15
  - courses: 无机化学 vs 机械制图
  - teachers: 丹婷婷 vs 于耀淇
  - rooms: 11-333 或 11-105 vs 11-239
  - slotIds: 6, 11
- **Class 2025级智能轧钢技术1班** (day=3, slot=6)
  - overlapWeeks: 2,4,6,8,10,12,14,16
  - courses: 无机化学 vs 金属材料与热处理
  - teachers: 丹婷婷 vs 尹和鑫
  - rooms: 11-333 或 11-105 vs 11-239
  - slotIds: 6, 14
- **Class 2024级钢铁智能冶金技术1班（高本贯通）** (day=3, slot=6)
  - overlapWeeks: 1,3,5,7,9,11,13,15
  - courses: 机械制图 vs 金属性能检测
  - teachers: 于耀淇 vs 尹和鑫
  - rooms: 11-239 vs 11-204 或 11-105
  - slotIds: 11, 275
- **Class 2024级钢铁智能冶金技术1班（高本贯通）** (day=3, slot=6)
  - overlapWeeks: 2,4,6,8,10,12,14,16
  - courses: 金属材料与热处理 vs 金属性能检测
  - teachers: 尹和鑫 vs 尹和鑫
  - rooms: 11-239 vs 11-204 或 11-105
  - slotIds: 14, 275
- **Class 2025级智能轧钢技术2班** (day=6, slot=3)
  - overlapWeeks: 2,4,6,8,10,12,14,16
  - courses: 机械制图 vs 电工电子技术
  - teachers: 于耀淇 vs 宋如武
  - rooms: 1号楼虚拟仿真实训室 vs 10-410
  - slotIds: 24, 27
- **Class 2025级钢铁智能冶金技术1班（高本贯通）** (day=3, slot=4)
  - overlapWeeks: 1,2,3,4,5,6,7,8,9,10,11,12,13,14,15,16
  - courses: 机械制图 vs 大学英语
  - teachers: 于耀淇 vs 袁景丽
  - rooms: 林校301 vs 12号楼机器人实训室
  - slotIds: 29, 33
- **Class 2024级钢铁智能冶金技术1班（高本贯通）** (day=6, slot=4)
  - overlapWeeks: 1,2,3,4,5,6,7,8
  - courses: 创新创业教育 vs 机械设计基础
  - teachers: 徐燕 vs 于耀淇
  - rooms: 1-142 vs 1-133
  - slotIds: 34, 278
- **Class 2025级钢铁智能冶金技术1班（高本贯通）** (day=6, slot=5)
  - overlapWeeks: 2,4,6,8,10,12,14,16
  - courses: 大学英语 vs 机械制图
  - teachers: 袁景丽 vs 张红梅
  - rooms: 11-307 vs 1-142
  - slotIds: 37, 88
- **Class 2024级钢铁智能冶金技术1班（高本贯通）** (day=1, slot=6)
  - overlapWeeks: 1,2,3,4,5,6,7,8,9,10,11,12,13,14,15,16
  - courses: 中华优秀传统文化 vs 冶金热工基础
  - teachers: 杨秀芳 vs 赵春超
  - rooms: 1-142 vs 11-322
  - slotIds: 38, 261
- **Class 2025级钢铁智能冶金技术1班（高本贯通）** (day=5, slot=5)
  - overlapWeeks: 2,4,6,8,10,12,14,16
  - courses: 线性代数 vs ）机械制图
  - teachers: 李媛 vs 张红梅
  - rooms: 10-321 vs 1-142
  - slotIds: 40, 103
- **Class 2025级钢铁智能冶金技术1班（高本贯通）** (day=7, slot=6)
  - overlapWeeks: 2,4,6,8,10,12,14,16
  - courses: 习近平新时代中国特色社会主义思想概论 vs 高等数学
  - teachers: 房忠敏 vs 李媛
  - rooms: 11-239 vs 1-142
  - slotIds: 43, 44
- **Class 2025级机电一体化技术1班** (day=3, slot=4)
  - overlapWeeks: 1,2,3,4,5,6,7,8
  - courses: 创新创业教育 vs 形势与政策
  - teachers: 孙文哲 vs 董钇含
  - rooms: 11-239 vs 1-142
  - slotIds: 65, 73
- **Class 2025级机电一体化技术2班** (day=3, slot=4)
  - overlapWeeks: 1,2,3,4,5,6,7,8
  - courses: 创新创业教育 vs 形势与政策
  - teachers: 孙文哲 vs 董钇含
  - rooms: 11-239 vs 1-142
  - slotIds: 65, 73
- **Class 2024级钢铁智能冶金技术1班（高本贯通）** (day=2, slot=6)
  - overlapWeeks: 1,3,5,7,9,11,13,15
  - courses: 机械制图 vs 机械设计基础
  - teachers: 张红梅 vs 于耀淇
  - rooms: 1-142 vs 林校
305
  - slotIds: 78, 268
- **Class 2024级钢铁智能冶金技术1班（高本贯通）** (day=6, slot=5)
  - overlapWeeks: 2,4,6,8,10,12,14,16
  - courses: 机械制图 vs 大学日语
  - teachers: 张红梅 vs 葛书
  - rooms: 1-142 vs 林校
303
  - slotIds: 88, 257
- **Class 2025级智能网联汽车技术** (day=1, slot=5)
  - overlapWeeks: 1,2,3,4,5,6,7,8,9,10,11,12,13,14,15,16
  - courses: 智能网联汽车概论 vs 智能网联汽车概论
  - teachers: 刘艳艳 vs 刘艳艳
  - rooms: 10-321 vs 林校
305
  - slotIds: 145, 150
- **Class 2025级林业技术1班** (day=2, slot=2)
  - overlapWeeks: 1,2,3,4,5,6,7,8
  - courses: 森林植物（二） vs 创新创业教育
  - teachers: 刘娜 vs 王素燕
  - rooms: 10-124 vs 11-239
  - slotIds: 158, 164
- **Class 2025级森林草原资源保护1班** (day=6, slot=4)
  - overlapWeeks: 1,2,3,4,5,6,7,8,9,10,11,12,13,14,15,16
  - courses: 林草环境 vs 大学英语
  - teachers: 刘闯 vs 刘明哲
  - rooms: 1-133 vs 11-239
  - slotIds: 185, 187
- **Class 2025级森林草原资源保护2班** (day=5, slot=3)
  - overlapWeeks: 2,4,6,8,10,12,14,16
  - courses: 林草培育 vs 无人机应用技术
  - teachers: 刘艳 vs 董继扬
  - rooms: 11-239 vs 1-142
  - slotIds: 190, 202
- **Class 2024级钢铁智能冶金技术1班（高本贯通）** (day=5, slot=3)
  - overlapWeeks: 2,4,6,8,10,12,14,16
  - courses: 无人机应用技术 vs 冶金传输原理
  - teachers: 董继扬 vs 尹和鑫
  - rooms: 1-142 vs 11-321
  - slotIds: 202, 259
- **Class 2024级钢铁智能冶金技术1班（高本贯通）** (day=7, slot=5)
  - overlapWeeks: 1,2,3,4,5,6,7,8
  - courses: 习近平新时代中国特色社会主义思想概论 vs 冶金热工基础
  - teachers: 房忠敏 vs 赵春超
  - rooms: 1-142 vs 11-333 或 11-105
  - slotIds: 213, 272
- **Class 2024级钢铁智能冶金技术1班（高本贯通）** (day=1, slot=5)
  - overlapWeeks: 1,2,3,4,5,6,7,8,9,10,11,12,13,14,15,16
  - courses: 材料科学基础 vs 大学日语
  - teachers: 于耀淇 vs 葛书
  - rooms: 12楼机房 vs 林校
303
  - slotIds: 262, 277
- **Class 2024级钢铁智能冶金技术1班（高本贯通）** (day=3, slot=4)
  - overlapWeeks: 1,2,3,4,5,6,7,8,9,10,11,12,13,14,15,16
  - courses: 大学日语 vs 冶金传输原理
  - teachers: 葛书 vs 尹和鑫
  - rooms: 11-212 vs 11-208 或 10-104
  - slotIds: 271, 273
- **Class 2024级机电一体化技术2班** (day=2, slot=6)
  - overlapWeeks: 1,2,3,4,5,6,7,8,9,10,11,12,13,14,15,16
  - courses: 液压与气压传动 vs 机电设备故障诊断与维修
  - teachers: 李媛 vs 任城龙
  - rooms: 1号楼虚拟仿真实训室 vs 11-333 或 11-105
  - slotIds: 317, 326
- **Class 2024级机电一体化技术2班** (day=7, slot=4)
  - overlapWeeks: 9,10,11,12,13,14,15,16
  - courses: 大学生职业发展与就业指导 vs 美育
  - teachers: 孙文哲 vs 苏英周
  - rooms: 1号楼虚拟仿真实训室 vs 11-239
  - slotIds: 324, 325
- **Class 2024级机电一体化技术3班** (day=7, slot=4)
  - overlapWeeks: 9,10,11,12,13,14,15,16
  - courses: 大学生职业发展与就业指导 vs 美育
  - teachers: 孙文哲 vs 苏英周
  - rooms: 1号楼虚拟仿真实训室 vs 11-239
  - slotIds: 324, 325
- **Class 2024级森林草原资源保护2班** (day=4, slot=3)
  - overlapWeeks: 1,2,3,4,5,6,7,8,9,10,11,12,13,14,15,16
  - courses: 经济林栽培 vs 林业有害生物控制技术
  - teachers: 刘娜 vs 许哲
  - rooms: 1号楼虚拟仿真实训室 vs 11-321
  - slotIds: 409, 428

## HC4: Capacity Violations

Total: 10 violations

- **习近平新时代中国特色社会主义思想概论** → Room 11-529
  - required: 68, capacity: 50, shortage: 18, ratio: 1.36x
  - classes: 2025级机电一体化技术3班, 2025级机电一体化技术4班
  - teacher: 张帆
  - day=5, slot=2
  - week: FIRST_HALF (1-8)
- **大学英语** → Room 林校
305
  - required: 83, capacity: 50, shortage: 33, ratio: 1.66x
  - classes: 2025级汽车制造与试验技术1班, 2025级汽车制造与试验技术2班, 2025级智能网联汽车技术
  - teacher: 赵新宇
  - day=1, slot=1
  - week: ALL (1-16)
- **大学英语** → Room 10-316
  - required: 52, capacity: 50, shortage: 2, ratio: 1.04x
  - classes: 2025级林业技术1班, 2025级林业技术2班
  - teacher: 王楠
  - day=2, slot=4
  - week: ALL (1-16)
- **习近平新时代中国特色社会主义思想概论** → Room 11-529
  - required: 52, capacity: 50, shortage: 2, ratio: 1.04x
  - classes: 2025级林业技术1班, 2025级林业技术2班
  - teacher: 张帆
  - day=4, slot=3
  - week: FIRST_HALF (1-8)
- **美育** → Room 11-529
  - required: 75, capacity: 50, shortage: 25, ratio: 1.5x
  - classes: 2024级智能轧钢技术1班, 2024级智能轧钢技术2班, 2024级机电一体化技术1班
  - teacher: 苏英周
  - day=2, slot=2
  - week: ALL (1-16)
- **汽车营销（非学徒制）** → Room 林校
304
  - required: 55, capacity: 50, shortage: 5, ratio: 1.1x
  - classes: 2024级汽车制造与试验技术1班, 2024级汽车制造与试验技术2班
  - teacher: 刘艳艳
  - day=5, slot=1
  - week: ALL (1-16)
- **汽车保险与理赔（非学徒制）** → Room 林校
304
  - required: 55, capacity: 50, shortage: 5, ratio: 1.1x
  - classes: 2024级汽车制造与试验技术1班, 2024级汽车制造与试验技术2班
  - teacher: 刘艳艳
  - day=5, slot=4
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
  - day=5, slot=3
  - week: ALL (1-16)
- **经济林栽培** → Room 1-133
  - required: 52, capacity: 50, shortage: 2, ratio: 1.04x
  - classes: 2024级森林草原资源保护1班, 2024级森林草原资源保护2班
  - teacher: 刘娜
  - day=3, slot=4
  - week: ALL (1-16)

## HC5: Room Unavailability

No room unavailability violations detected.

## Top 5 Capacity Gaps

| # | Course | Classes | Required | Room(Cap) | Shortage | Ratio | Day-Slot |
|---|--------|---------|----------|-----------|----------|-------|----------|
| 1 | 大学英语 | 2025级汽车制造与试验技术1班, 2025级汽车制造与试验技术2班, 2025级智能网联汽车技术 | 83 | 林校
305(50) | 33 | 1.66x | 1-1 |
| 2 | 美育 | 2024级智能轧钢技术1班, 2024级智能轧钢技术2班, 2024级机电一体化技术1班 | 75 | 11-529(50) | 25 | 1.5x | 2-2 |
| 3 | 习近平新时代中国特色社会主义思想概论 | 2025级机电一体化技术3班, 2025级机电一体化技术4班 | 68 | 11-529(50) | 18 | 1.36x | 5-2 |
| 4 | 汽车营销（非学徒制） | 2024级汽车制造与试验技术1班, 2024级汽车制造与试验技术2班 | 55 | 林校
304(50) | 5 | 1.1x | 5-1 |
| 5 | 汽车保险与理赔（非学徒制） | 2024级汽车制造与试验技术1班, 2024级汽车制造与试验技术2班 | 55 | 林校
304(50) | 5 | 1.1x | 5-4 |

## Top 5 Class Conflict Hotspots

| # | Class Group | Conflicts | Worst Day-Slot | Involved Courses |
|---|-------------|-----------|----------------|------------------|
| 1 | 2024级钢铁智能冶金技术1班（高本贯通） | 10 | 3-6 | 机械制图, 金属性能检测, 金属材料与热处理, 创新创业教育, 机械设计基础, 中华优秀传统文化, 冶金热工基础, 大学日语, 无人机应用技术, 冶金传输原理 |
| 2 | 2025级钢铁智能冶金技术1班（高本贯通） | 4 | 3-4 | 机械制图, 大学英语, 线性代数, ）机械制图, 习近平新时代中国特色社会主义思想概论, 高等数学 |
| 3 | 2025级智能轧钢技术1班 | 2 | 3-6 | 无机化学, 机械制图, 金属材料与热处理 |
| 4 | 2024级机电一体化技术2班 | 2 | 2-6 | 液压与气压传动, 机电设备故障诊断与维修, 大学生职业发展与就业指导, 美育 |
| 5 | 2025级智能轧钢技术2班 | 1 | 6-3 | 机械制图, 电工电子技术 |

## Top 5 Room Conflict Hotspots

| # | Room | Conflicts | Day-Slot | Involved Courses |
|---|------|-----------|----------|------------------|
| 1 | 11-239 | 8 | 3-6 | 机械制图, 机械设计基础, 美育, 金属材料与热处理, 创新创业教育, 形势与政策 |
| 2 | 1-142 | 5 | 5-2 | 大学英语, 大学生职业发展与就业指导, 形势与政策, 汽车营销（非学徒制）, 传感器与检测技术, 林草培育, 美育 |
| 3 | 1号楼虚拟仿真实训室 | 1 | 4-6 | 习近平新时代中国特色社会主义思想概论, 经济林栽培 |
| 4 | 11-208 或 12-201 | 1 | 1-1 | PLC技术与应用, 林业法规与执法实务 |
| 5 | 1-133 | 1 | 6-4 | 林草环境, 机械设计基础 |

## Teacher Conflicts

5 teacher conflicts detected.

Top teacher conflict hotspots:
- **尹和鑫** (day=3, slot=6)
  - overlapWeeks: 2,4,6,8,10,12,14,16
  - courses: 金属材料与热处理 vs 金属性能检测
- **王淼** (day=1, slot=2)
  - overlapWeeks: 2,4,6,8,10,12,14,16
  - courses: 金属材料与热处理 vs 炼铁技术
- **张红梅** (day=6, slot=5)
  - overlapWeeks: 2,4,6,8,10,12,14,16
  - courses: 机械制图 vs 机械制图
- **刘艳艳** (day=1, slot=5)
  - overlapWeeks: 1,2,3,4,5,6,7,8,9,10,11,12,13,14,15,16
  - courses: 智能网联汽车概论 vs 智能网联汽车概论
- **李媛** (day=2, slot=5)
  - overlapWeeks: 1,2,3,4,5,6,7,8,9,10,11,12,13,14,15,16
  - courses: 液压与气压传动 vs 机械设计基础

## Top 10 Time Slot Pressure

| Day-Slot | Slots | Rooms | Classes | CapShortage | ClassConf | RoomConf |
|----------|-------|-------|---------|-------------|-----------|----------|
| 3-6 | 11 | 8 | 15 | 0 | 4 | 5 |
| 3-4 | 13 | 11 | 13 | 1 | 4 | 2 |
| 2-2 | 11 | 10 | 19 | 1 | 1 | 1 |
| 5-3 | 10 | 9 | 16 | 1 | 2 | 0 |
| 5-6 | 9 | 7 | 19 | 0 | 0 | 3 |
| 6-4 | 16 | 13 | 21 | 0 | 2 | 1 |
| 1-1 | 11 | 10 | 18 | 1 | 0 | 1 |
| 1-5 | 11 | 10 | 11 | 0 | 2 | 0 |
| 2-6 | 12 | 12 | 18 | 0 | 2 | 0 |
| 3-5 | 10 | 7 | 17 | 0 | 0 | 2 |

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