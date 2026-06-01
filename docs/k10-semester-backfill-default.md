# K10-SEMESTER-BACKFILL-DEFAULT

## 概述

为既有数据创建默认学期，并将已新增 nullable `semesterId` 的业务数据安全回填到默认学期。

## 备份

回填前已备份数据库：

```
prisma/dev.db.backup-before-semester-backfill-20260601082024
```

## 默认 Semester

| 字段 | 值 |
|------|-----|
| id | 1 |
| code | LEGACY-DEFAULT |
| name | 既有数据默认学期 |
| academicYear | null |
| term | null |
| startsAt | null |
| endsAt | null |
| isActive | true |
| 是否新建 | 是 |
| 是否复用 | 否 |

## Dry-run 结果

| 模型 | 总数 | null semesterId | 预计回填 |
|------|------|-----------------|----------|
| classGroup | 36 | 36 | 36 |
| teachingTask | 308 | 308 | 308 |
| scheduleSlot | 440 | 440 | 440 |
| scheduleAdjustment | 52 | 52 | 52 |
| schedulingRun | 74 | 74 | 74 |
| schedulingConfig | 1 | 1 | 1 |
| **TOTAL** | | | **911** |

## Apply 结果

| 模型 | 实际更新数量 |
|------|--------------|
| classGroup | 36 |
| teachingTask | 308 |
| scheduleSlot | 440 |
| scheduleAdjustment | 52 |
| schedulingRun | 74 |
| schedulingConfig | 1 |
| **TOTAL** | **911** |

## 回填后验证

| 模型 | 总数 | null semesterId |
|------|------|-----------------|
| ClassGroup | 36 | 0 |
| TeachingTask | 308 | 0 |
| ScheduleSlot | 440 | 0 |
| ScheduleAdjustment | 52 | 0 |
| SchedulingRun | 74 | 0 |
| SchedulingConfig | 1 | 0 |

- ✓ 所有目标模型 null semesterId = 0
- ✓ 无 count 异常
- ✓ Room / Teacher / Course 未新增 semesterId
- ✓ SchedulerRunChange 通过 run 间接归属
- ✓ /api/scheduler/run 不存在
- ✓ prisma/dev.db 未被 Git 跟踪

## Rollback 策略

`scripts/backfill-default-semester.ts --rollback` 已实现：

1. 将目标模型中 `semesterId = 默认SemesterID` 的记录恢复为 NULL
2. 如默认 Semester 无引用则自动删除
3. 不自动运行，仅作紧急回滚工具

### 如需 rollback

```bash
npx.cmd tsx scripts/backfill-default-semester.ts --rollback
```

## 脚本

- `scripts/backfill-default-semester.ts` — 回填脚本，支持 `--dry-run` / `--apply` / `--rollback`
- `scripts/test-semester-backfill-default.ts` — 验证脚本，29 项测试
- `scripts/test-semester-schema-nullable.ts` — Schema 验证（已更新 Semester count 检查）

## 风险

- 当前尚未 query scoping
- 当前尚未 UI selector
- 当前尚未 required constraint
- 存在跨学期查询风险（所有数据指向同一默认学期）

## 下一阶段建议

K10-SEMESTER-QUERY-SCOPING-AUDIT

目标：审计所有查询入口和数据加载边界，决定 Preview / Apply / Rollback / history / import / normal schedule view 如何按 semester 过滤。
