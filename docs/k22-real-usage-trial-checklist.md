# K22 真实使用 / 人工验收 Checklist

**阶段**: K22-PAUSE-REAL-USAGE-TRIAL
**日期**: 2026-06-07
**试用者**: ___________________
**试用日期**: ___________________
**K22 commit 基线**: `4353b53`

> 复选框 `- [ ]` 为待勾选；`[x]` 为通过；`[!]` 为不通过；`[~]` 为部分通过。
> 试用过程中**不要修改业务代码**，仅观察、记录。

---

## 1. 启动前置条件 (开发者观察员执行)

- [ ] 工作区 git status --short clean
- [ ] `npx tsx scripts/verify-real-usage-trial-readiness-k22.ts` 全部 PASS
- [ ] `npm run dev` 启动成功 (localhost:3000)
- [ ] 登录系统 (admin 角色)
- [ ] dev.db 已备份 (如果试用 apply): `prisma/dev.db.backup-before-trial-YYYYMMDDHHMMSS`

---

## 2. Live Preview 流程

### 2.1 入口

- [ ] 系统能成功打开 `/admin/scheduler`
- [ ] scheduler-config-panel 显示默认配置
- [ ] semester 下拉框显示 `LEGACY-DEFAULT`

### 2.2 触发 Preview

- [ ] 能成功运行一次 preview
- [ ] 等待约 21 秒 (maxIterations=10000) 出现结果卡
- [ ] 结果卡显示模式 = PREVIEW, status = COMPLETED, blocked = false
- [ ] blockReasons 数组为空

### 2.3 Score Summary (4 张卡片)

- [ ] hardScore = 0 (绿 badge "可行")
- [ ] softScore ≈ -1281 (与 L1 baseline 一致)
- [ ] 违反总数 = 484 (= 427 MIN_PERT + 76 SC9 + 48 SC8 + 26 SC10 + 90 SC3 + 3 SC1)
- [ ] 来源 = "优化后"

### 2.4 8 个业务质量卡片

- [ ] 周末排课 = 0
- [ ] 林校违规 HC6 = 0
- [ ] 汽车未入林校 SC6 = 0
- [ ] 教师均衡 SC5 = 1 (李媛 [3,2,1,4,4])
- [ ] 班级空洞 SC8 = 48 对
- [ ] 教室稳定 SC9 = 76 个 task
- [ ] 容量利用 SC10 = 26 次
- [ ] 最小扰动 MIN_PERT = 427 个 slot

### 2.5 约束详情表 (16 行)

- [ ] HC1 = 0
- [ ] HC2 = 0
- [ ] HC3 = 0
- [ ] HC4 = 0
- [ ] HC5 = 0
- [ ] HC6 = 0
- [ ] SC1 = 3
- [ ] SC2 = 0
- [ ] SC3 = 90
- [ ] SC4 = 0
- [ ] SC6 = 0
- [ ] SC7 = 0
- [ ] SC8 = 48
- [ ] SC9 = 76
- [ ] SC10 = 26
- [ ] MIN_PERT = 427

### 2.6 展开功能

- [ ] BEFORE / AFTER tab 可正常切换
- [ ] BEFORE 视图显示初始 hardScore = -1000
- [ ] AFTER 视图显示最终 hardScore = 0
- [ ] "展开详情" 按钮可展开 topExamples
- [ ] Top Issues 列表 ≥ 1 条 (MIN_PERT 应排第一)
- [ ] Top Issues rank 编号连续 1..N

---

## 3. History Run Detail

### 3.1 列表

- [ ] `/admin/scheduler/history` 显示 run 列表
- [ ] 最新一次 preview run 在列表顶部
- [ ] 点击 expand 可展开 run 详情

### 3.2 Detail (新 run)

- [ ] run 详情显示 hardScoreBefore / hardScoreAfter
- [ ] run 详情显示 score breakdown 完整 4 区
- [ ] breakdown 内容与 live preview 一致

### 3.3 Detail (旧 run)

- [ ] 找到一个 K22-L2 之前创建的 run (如果存在)
- [ ] 该 run 显示 "旧运行无 breakdown 数据" placeholder
- [ ] **不报错**, 不出现 console error
- [ ] 不阻塞其他 run 详情加载

### 3.4 Config Snapshot

- [ ] ResolvedConfigDisplay 显示 maxIterations=10000, lahc=500
- [ ] solverVersion = "lahc-hard-first-v3"
- [ ] source badge = DEFAULT / INLINE / CONFIG / MIXED

---

## 4. 课表人工抽查

### 4.1 按班级

- [ ] 进入 `/dashboard`
- [ ] 抽查 `2025级智能轧钢技术1班` 课表
- [ ] 抽查 `2025级机电一体化技术1班` 课表
- [ ] 抽查 `2025级森林草原防火技术1班` 课表
- [ ] 没有"同教师同时间两节课"的硬冲突
- [ ] 没有"同班级同时间两节课"的硬冲突
- [ ] 没有班级在周末有课
- [ ] 班级每周上课时段分布合理 (无明显空洞)

### 4.2 按教师

- [ ] 抽查 `李媛` 教师 (有 SC5 触发) 课表
- [ ] 抽查典型教师课表
- [ ] 教师没有"同时间两节课"硬冲突
- [ ] 教师没有周末课
- [ ] 教师每日课程数差距 ≤ 2 (李媛例外)

### 4.3 按教室

- [ ] 抽查 `林校301` 教室课表
- [ ] 抽查 `1-142` 教室 (200 人大教室) 课表
- [ ] 抽查 `10-316` 教室 (61 人, 100% 利用率) 课表
- [ ] 教室没有"同时间两节课"硬冲突
- [ ] 林校教室的课程都是汽车相关专业
- [ ] 大教室没有严重浪费 (util < 30%)

### 4.4 按课程

- [ ] 抽查 `大学英语` 课程 (使用 3 教室, SC9 top 1)
- [ ] 抽查 `无机化学` 课程
- [ ] 同 task 在 weekday 集中度合理
- [ ] 同一 task 不在多个楼栋同日连续

---

## 5. UI / 文字可读性

- [ ] "质量 Breakdown" 标题清晰
- [ ] "HC1 / HC2 / ..." 标识符有 hover 提示或 description
- [ ] 业务卡片标签清晰 (周末排课 / 林校违规 / ...)
- [ ] 中文文案无错别字
- [ ] 颜色编码合理 (红=阻断, 琥珀=注意, 蓝=提示, 绿=通过)
- [ ] **管理员能独立理解** 4 张 summary 卡片含义
- [ ] **管理员能独立理解** 8 张业务卡片含义
- [ ] **管理员能独立理解** 16 条约束表

---

## 6. 反馈记录

- [ ] 填写 `docs/k22-real-usage-trial-feedback-template.md` 中至少 3 条
- [ ] 每条反馈包含: 类别 / 严重度 / 复现步骤 / 期望 vs 实际
- [ ] 归类问题类型 (见 plan §5.3)

---

## 7. 验收出口判定

- [ ] **Go**: 所有 Go criteria 满足 (plan §6.1)
- [ ] **Acceptable**: 仅有 Acceptable if 边缘情况 (plan §6.2)
- [ ] **No-Go**: 任一 No-Go criteria 触发 (plan §6.3)

**最终判定**: ___________________________

**判定人签字**: ___________________________

---

## 8. 试用结果摘要 (填写)

- hardScore: ____
- softScore: ____
- 周末课数量: ____
- 林校违规数: ____
- 汽车偏好偏差: ____
- 班级空洞最严重: ___________________
- 教室稳定最严重: ___________________
- 容量利用最严重: ___________________
- 教师均衡最严重: ___________________

**试用是否通过** (Go / Acceptable / No-Go): ____

**后续阶段建议**:
- [ ] 结束 K22 主线
- [ ] 进入 K22-L3-SCHEDULER-RESULT-QUALITY-ACTIONS
- [ ] 进入 K22-L1B-SOFT-WEIGHT-TUNING
- [ ] 进入 K22-I-SCORE-WEIGHTS-IMPLEMENTATION-PLAN
- [ ] 其他: ___________________
