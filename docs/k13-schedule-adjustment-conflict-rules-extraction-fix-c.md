# K13-SCHEDULE-ADJUSTMENT-CONFLICT-RULES-EXTRACTION-FIX-C

## 1. 阶段名

K13-SCHEDULE-ADJUSTMENT-CONFLICT-RULES-EXTRACTION-FIX-C

## 2. 当前背景

K13-AUDIT（commit `dd5cd21`）确认 adjustment 不能直接复用 `checkScheduleConflicts`，原因：
- effective schedule scope 不可直接套用 helper 的 Prisma findMany
- targetWeek 单周 vs 整段 WeekConstraint 语义冲突
- capacity 是 adjustment 独有规则

审计推荐 Fix-C 策略：抽纯规则 kernel（teacher/classGroup/room/week 命中规则），让 shared helper 与 dry-run 共用规则文本，保留 adjustment-specific 语义（effective schedule、targetWeek、capacity、typed response）。

## 3. 修复目标

1. 新增 `src/lib/schedule/conflict-rules.ts`：纯规则 helper，不依赖 Prisma / NextRequest / NextResponse
2. `checkScheduleConflicts` 复用纯规则 kernel
3. `dryRunScheduleAdjustment` 复用纯规则 kernel（不直接调用 `checkScheduleConflicts`）
4. 保留所有 adjustment-specific 语义
5. `/api/conflict-check` 对外契约保持
6. `slot-mutation-guard.ts` / `teaching-task/[id]/route.ts` 行为保持
7. K12 `moveSlot` 不变

## 4. 修改范围

| 文件 | 变更类型 |
|------|----------|
| `src/lib/schedule/conflict-rules.ts` | 新增（纯规则 kernel） |
| `src/lib/schedule/conflict-check.ts` | 重构（委托给纯规则 kernel） |
| `src/lib/schedule/adjustments.ts` | 重构 dry-run 段（调用纯规则 kernel） |
| `scripts/audit-schedule-conflict-check-unification.ts` | 更新（识别 rule kernel 复用） |
| `scripts/audit-schedule-adjustment-conflict-check.ts` | 更新（识别 rule kernel 复用 + NONE-6 / NONE-7） |
| `scripts/verify-schedule-conflict-check-unification-fix-a.ts` | 更新（适配新 helper 调用方式） |
| `scripts/verify-schedule-adjustment-conflict-rules-extraction-fix-c.ts` | 新增（45 项检查） |
| `docs/k13-schedule-adjustment-conflict-rules-extraction-fix-c.md` | 新增 |

未修改：
- `prisma/schema.prisma`
- `src/lib/schedule/slot-mutation-guard.ts`
- `src/app/api/teaching-task/[id]/route.ts`
- `src/app/api/conflict-check/route.ts`
- `src/store/scheduleStore.ts`（K12 moveSlot）
- solver / parser / importer / seed
- frontend adjustment dialog
- RBAC

## 5. 纯规则 helper 设计

### 5.1 文件位置

`src/lib/schedule/conflict-rules.ts`

### 5.2 导出

| 函数 | 用途 |
|------|------|
| `isSameTimeSlot(candidate, occupancy)` | 时间维度比对（dayOfWeek + slotIndex） |
| `isWeekOverlapping(candidateWeeks, occupancyWeek)` | 周次维度比对（candidate 用 weeks[]，occupancy 用 WeekConstraint） |
| `isWeekOverlappingConstraints(a, b)` | 双 WeekConstraint 比对（兼容旧调用方） |
| `isTeacherConflict(candidate, occupancy)` | 教师身份比对 |
| `isRoomConflict(candidate, occupancy)` | 教室身份比对 |
| `isClassGroupConflict(candidate, occupancy)` | 班级身份比对（任一 classGroupId 相同即冲突） |
| `checkOccupancyConflicts(candidate, occupancy, options)` | 对单个 occupancy 应用规则内核 |
| `findRuleMatches(candidate, occupancies, options)` | 批量版，返回所有 rule matches |
| `formatRuleMatchMessage(match, candidate, occupancy)` | 中文消息格式化（保留原 message 文本） |

### 5.3 输入类型

```ts
export interface ScheduleConflictOccupancy {
  id?: number | null
  teachingTaskId?: number | null
  teacherId?: number | null
  classGroupIds: number[]
  roomId?: number | null
  dayOfWeek: number
  slotIndex: number
  weekConstraint: WeekConstraint
  // 可选显示字段
  teacherName?: string | null
  classNames?: string[]
  courseName?: string | null
  roomName?: string | null
}

export interface ScheduleConflictCandidate {
  teacherId?: number | null
  classGroupIds: number[]
  roomId?: number | null
  dayOfWeek: number
  slotIndex: number
  weeks: number[]
  excludeOccupancyId?: number | null
  teacherName?: string | null
  classNames?: string[]
}
```

### 5.4 输出类型

```ts
export type ScheduleConflictRuleType = 'teacher' | 'classGroup' | 'room'

export interface ScheduleConflictRuleMatch {
  type: ScheduleConflictRuleType
  occupancyId?: number
  message: string
}
```

### 5.5 依赖

- 依赖：`@/lib/conflict`（`checkWeekOverlap` / `expandWeeks` / `WeekConstraint`）
- **不**依赖 Prisma
- **不**依赖 NextRequest / NextResponse
- **不**写数据库
- **不**包含 capacity 逻辑（capacity 是 adjustment 独有）

## 6. `checkScheduleConflicts` 改造

- 是否复用纯规则 helper：**是**（`findRuleMatches`）
- 数据库读取逻辑是否保留：是（baseSlots Prisma findMany）
- response shape 是否保持：是（`{ hasConflict, conflicts: string[] }`）
- `/api/conflict-check` 契约是否保持：是
- 内部改造：
  - 删除三段独立 room/teacher/class 循环
  - 改为：构造 candidate + toOccupancy + findRuleMatches
  - 每条 rule match 用 `formatMatchMessage` 翻译为中文消息
  - 房间消息使用 `targetRoomLabel`（保持原"被 X 占用"语义）

## 7. `dryRunScheduleAdjustment` 改造

- 是否复用纯规则 helper：**是**（`ruleIsTeacherConflict` / `ruleIsClassGroupConflict` / `ruleIsRoomConflict` / `ruleIsSameTimeSlot` / `ruleIsWeekOverlapping` + `expandWeeks`）
- 是否保留 effective schedule：是
- 是否保留 targetWeek 单周语义：是
- 是否保留 capacity warning：是（保留 `prisma.room.findUnique` + studentCount 合计 vs capacity）
- 是否保留 typed response：是（`ScheduleAdjustmentConflict[]`）
- 是否直接调用 `checkScheduleConflicts`：**否**
- create / void 语义是否保持：是
- 内部改造：
  - effective items 在内存中构造 `ScheduleConflictOccupancy[]`
  - 对每种冲突类型（teacher / classGroup / room）使用纯规则谓词判断
  - first-match-wins（teacher/room） / per-overlap（class）行为与原版一致
  - 周次范围用 `expandWeeks(weekConstraint)` 转成 weeks[] 后调用 `isWeekOverlapping`

## 8. 保留的 adjustment-specific 语义

- effective schedule 构造（`getEffectiveScheduleForWeek`）
- targetWeek 单周过滤
- capacity warning（severity=`warning`，不阻塞 canApply）
- typed `ScheduleAdjustmentConflict[]` response
- ScheduleAdjustment CRUD（create / void）
- `canApply: boolean` 行为

## 9. 未处理范围

- 不统一 response shape（Fix-D 关注）
- 不修改 effective schedule 构造逻辑
- 不修改 capacity 规则
- 不修改 ScheduleAdjustment CRUD
- 不修改 void 行为
- 不修改 solver / parser / importer / seed
- 不修改 frontend moveSlot / adjustment dialog
- 不修改 RBAC
- 不修改 Prisma schema

## 10. 验证命令与结果

| 命令 | 结果 |
|------|------|
| `npx.cmd tsx scripts/verify-schedule-adjustment-conflict-rules-extraction-fix-c.ts` | 45 PASS / 0 FAIL |
| `npx.cmd tsx scripts/audit-schedule-adjustment-conflict-check.ts` | HIGH 0 / MEDIUM 3 / LOW 1 / NONE 7 |
| `npx.cmd tsx scripts/audit-schedule-conflict-check-unification.ts` | HIGH 0 / MEDIUM 1 / LOW 3 / NONE 5 |
| `npx.cmd tsx scripts/verify-schedule-conflict-check-unification-fix-b.ts` | 39 PASS / 0 FAIL |
| `npx.cmd tsx scripts/verify-schedule-conflict-check-unification-fix-a.ts` | 54 PASS / 0 FAIL |
| `npx.cmd tsx scripts/audit-schedule-mutation-server-guards.ts` | HIGH 0 / MEDIUM 0 / LOW 3 / NONE 8 |
| `npx.cmd tsx scripts/verify-schedule-mutation-client-preflight-fix.ts` | 23 PASS / 0 FAIL |
| `npm.cmd run build` | ✓ Compiled successfully in 2.3s |

## 11. audit 风险变化

### K13 main audit

| Risk ID | Fix-C 前 | Fix-C 后 |
|---------|----------|----------|
| K13-CONFLICT-NONE-1 | NONE | NONE |
| K13-CONFLICT-MEDIUM-1 | NONE | NONE |
| K13-CONFLICT-MEDIUM-2 | MEDIUM | **NONE** |
| K13-CONFLICT-MEDIUM-3 | NONE | NONE |
| K13-CONFLICT-MEDIUM-4 | MEDIUM | MEDIUM（response shape，保留） |
| K13-CONFLICT-LOW-1 | LOW | LOW |
| K13-CONFLICT-LOW-2 | LOW | LOW |
| K13-CONFLICT-LOW-3 | LOW | LOW（描述已更新） |
| K13-CONFLICT-NONE-2 | NONE | NONE |

**核心结果**：`K13-CONFLICT-MEDIUM-2` 降级为 NONE（dry-run 已通过纯规则 kernel 与 shared helper 共享规则文本）。MEDIUM 总数从 2 降到 1。

### K13 adjustment audit

| Risk ID | Fix-C 前 | Fix-C 后 |
|---------|----------|----------|
| K13-ADJUSTMENT-MEDIUM-1 | MEDIUM | **NONE**（dry-run 现在复用纯规则 kernel） |
| K13-ADJUSTMENT-MEDIUM-2 | MEDIUM | MEDIUM（capacity adjustment-specific，保留） |
| K13-ADJUSTMENT-MEDIUM-3 | MEDIUM | MEDIUM（targetWeek vs movingWeek 语义差异，保留） |
| K13-ADJUSTMENT-MEDIUM-4 | MEDIUM | MEDIUM（effective schedule scope 差异，保留） |
| K13-ADJUSTMENT-LOW-2 | LOW | LOW |
| K13-ADJUSTMENT-LOW-3 | LOW | LOW |
| K13-ADJUSTMENT-NONE-1 | NONE | NONE |
| K13-ADJUSTMENT-NONE-2 | NONE | NONE |
| K13-ADJUSTMENT-NONE-3 | NONE | NONE |
| K13-ADJUSTMENT-NONE-4 | NONE | NONE |
| K13-ADJUSTMENT-NONE-5 | NONE | NONE |
| K13-ADJUSTMENT-NONE-6 | (新增) | NONE（rule kernel reuse 确认） |
| K13-ADJUSTMENT-NONE-7 | (新增) | NONE（rule kernel shared 确认） |

**核心结果**：`K13-ADJUSTMENT-MEDIUM-1` 降级为 NONE。MEDIUM 总数从 4 降到 3（剩余均为 adjustment-specific 边界语义，保留为 MEDIUM 提示）。

## 12. 剩余风险

### K13 main audit
- `K13-CONFLICT-MEDIUM-4`（response shape 不统一）：Fix-D 关注

### K13 adjustment audit
- `K13-ADJUSTMENT-MEDIUM-2`（capacity 是 adjustment 独有）：设计上不应进入共享 helper
- `K13-ADJUSTMENT-MEDIUM-3`（targetWeek vs movingWeek 语义差异）：adjustment 用单周，helper 用整段，调用方语义不同
- `K13-ADJUSTMENT-MEDIUM-4`（effective schedule scope）：helper 用原始 slot，adjustment 用 effective schedule

### K11 audit
- LOW 3：与本阶段无关（pre-existing）

## 13. 下一阶段建议

候选：

- `K13-FIX-D`（独立阶段）：统一 response shape 为 typed conflict
  - 范围：影响 /api/conflict-check、slot-mutation-guard、teaching-task、adjustments 全部 response
  - 跨多个调用方，影响面较大
  - 推荐放在本阶段之后

## 14. 关键设计决策

1. **不直接复用 `checkScheduleConflicts` 给 dry-run**：effective schedule 已在内存中构造，再走 Prisma findMany 既浪费又有语义差异
2. **纯规则 kernel 接受 occupancy[] 而非 occupancy source**：调用方负责从 Prisma 行 / effective items / 任意来源构造 occupancy，kernel 只负责比对
3. **保留 capacity / typed response / effective schedule 在 adjustment 层**：这些是 adjustment 独有的边界语义，不应污染共享 kernel
4. **共享 helper 改为单次 Prisma findMany + 纯规则扫描**：原版三次循环（room / teacher / classGroup）合并为一次 findMany + 一次 kernel 扫描，性能更好、规则统一
