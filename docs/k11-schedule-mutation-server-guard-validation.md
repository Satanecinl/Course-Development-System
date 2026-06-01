# K11-SCHEDULE-MUTATION-SERVER-GUARD-VALIDATION

## 1. 阶段名

`K11-SCHEDULE-MUTATION-SERVER-GUARD-VALIDATION`

## 2. 日期

2026-06-01

## 3. 验收范围

- Guard module 函数行为（guardSlotUpdate / guardSlotCreate）
- PUT /api/schedule-slot/[id] guard 集成
- POST /api/schedule-slot guard 集成
- Admin PUT/POST scheduleslot guard 集成
- Admin DELETE scheduleslot 引用检查
- Teaching task PUT post-update 冲突检查
- DB 完整性
- 无禁止变更

## 4. 验收方法

- 静态代码检查（13 项）
- DB 完整性检查（13 项）
- Guard 函数行为测试（5 项，含事务回滚）
- DELETE 引用检查（3 项）
- 禁止变更检查（3 项）

## 5. 验收结果

- **37 PASS, 0 FAIL, 1 SKIP**
- SKIP：冲突检测测试（数据库中无两个 slot 在同一时间占不同教室的情况）

## 6. 风险清单最终状态

| Risk ID | Severity | 状态 |
|---------|----------|------|
| K11-MUTATION-HIGH-1 | NONE | 已修复（guardSlotUpdate） |
| K11-MUTATION-HIGH-2 | NONE | 已修复（guardSlotCreate + semesterId） |
| K11-MUTATION-HIGH-3 | NONE | 已修复（guard module 被 7 个 route 引用） |
| K11-MUTATION-MEDIUM-1 | NONE | 已修复（admin guardAdminSlotUpdate） |
| K11-MUTATION-MEDIUM-2 | NONE | 已修复（countReferences scheduleslot case） |
| K11-MUTATION-MEDIUM-3 | NONE | 已修复（post-update checkWeekOverlap） |
| K11-MUTATION-MEDIUM-4 | MEDIUM | 未修复（client moveSlot preflight，UI 范围） |
| K11-MUTATION-MEDIUM-5 | NONE | 已修复（all routes scoped） |
| K11-MUTATION-LOW-1 | LOW | 未修复（平行实现，架构问题） |
| K11-MUTATION-LOW-2 | LOW | 未修复（adjustment 一致性，设计问题） |
| K11-MUTATION-LOW-3 | LOW | 未修复（RBAC 收窄，需人工决策） |

## 7. 剩余风险

- 0 HIGH
- 1 MEDIUM（client moveSlot preflight — UI 层面，server guard 已兜底）
- 3 LOW（架构/设计/RBAC，需人工决策）

## 8. 阶段关闭建议

- K11 audit 阶段：建议关闭
- K11 Fix 阶段：建议关闭
- 剩余 MEDIUM-4 可作为独立 UI 优化任务
- 剩余 LOW 需人工评估优先级
