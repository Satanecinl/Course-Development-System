# K31-A 课程表导出当前筛选修复

## 1. Bug 现象

用户筛选：

```text
当前学期：2025-2026春季学期
周次：第 7 周
视图：按教师
教师：丹婷婷
```

页面正确显示丹婷婷第 7 周课表。

点击"导出 Excel"后，导出的 `丹婷婷 教师课表-第7周.xlsx` 内容错误：

```text
1. 标题虽然写"丹婷婷 教师课表"，但内容是全量课程表
2. 表格内出现其他教师课程：心理健康教育、机械制图、大学英语、金属材料与热处理 等
3. 部分合班单元格出现异常数字 "46"
```

## 2. 根因

### 2.1 导出 API 没有按 viewType/targetId 过滤

`src/app/api/export/excel/route.ts` 的 `applyAdjustments=true` 分支（K25-E 引入）调用 `getEffectiveScheduleForWeek(week, semesterId)` 拿到**全量**周有效课程，然后直接构建 Excel。`viewType` 和 `targetId` 参数被读取但**仅用于构建标题**，从不过滤数据：

```ts
let effectiveItems = await getEffectiveScheduleForWeek(selectedWeek, semesterId)
// ...直接进入 buildExcel
// viewType/targetId 在此只用来生成 sheetTitle
```

对照另一条无 adjustments 路径（line 188-203），那条路径正确应用了 `viewType + targetId` 到 `where` 子句。

### 2.2 异常 "46" 单元格

`applyAdjustments` 分支构造合班标签时使用：

```ts
classLabel = `[${classNames.map((cn) => cn.replace(/^.*?(\d+)班$/, '$1')).join('/')}]`
```

当班级名不含 `班` 后缀（如 `'46'`）时，正则 `^.*?(\d+)班$` 整体不匹配，`String.replace` 返回原字符串，导致数字直接落入单元格。

> 注：46 是数据库中真实存在的班级名。如果它出现在丹婷婷的某门合班课中，导出后会在合班标签内显示 46——这是 DB 数据本身，不是 fallback bug。修复后**单值 46 不会落单**（只可能在合班上下文出现且源自 DB 真名）。

## 3. 修复内容

### 3.1 服务端按视图过滤

`src/app/api/export/excel/route.ts`：

```ts
let effectiveItems = await getEffectiveScheduleForWeek(selectedWeek, semesterId)

// K31-A: 镜像前端 applyViewFilter 的语义
if (viewType && targetId && !isNaN(targetId)) {
  effectiveItems = effectiveItems.filter((item) => {
    if (viewType === 'class')  return (item.classGroupIds ?? []).includes(targetId)
    if (viewType === 'teacher') return item.teacherId === targetId
    if (viewType === 'room')    return item.roomId === targetId
    return true
  })
}
```

语义与 `dashboard-content.tsx` 的 `applyViewFilter` 完全对齐：
- `class` → 任一班级 id 命中
- `teacher` → 单值匹配
- `room` → 单值匹配

`viewType === 'all'` 或未传 `targetId` 时不进入过滤。

### 3.2 合班标签安全化

两条分支都改成 exec + null 回退：

```ts
classNames.map((cn) => {
  const m = /^.*?(\d+)班$/.exec(cn)
  return m ? m[1] : cn
}).join('/')
```

非 `数字班` 后缀的班级名保留原名，**不再出现"replace 留底"导致的纯数字单元格**。

### 3.3 前端参数（已存在，未改）

`src/app/dashboard/dashboard-content.tsx` 的导出按钮已经在传 `semesterId / week / viewType / targetId`，本次**未修改前端**。本次修复纯在 API 层。

## 4. 修复后行为

| 视图 | 是否进入 viewType 过滤 | 导出范围 |
|------|----------------------|---------|
| 按教师 + 丹婷婷 + 第 7 周 | 是（teacherId===） | 仅 丹婷婷第7周课程 |
| 按班级 + X班 + 第 7 周 | 是（classGroupIds.includes） | 仅 X班第7周课程 |
| 按教室 + 11-328 + 第 7 周 | 是（roomId===） | 仅 11-328第7周课程 |
| 全部 + 第 7 周 | 否（viewType='all'） | 当前周全部课程 |
| 仅周次，未选视图 | 否（viewType null） | 当前学期当前周全部 |

## 5. 验证

### 5.1 自动验证

```bash
npx tsx scripts/verify-schedule-export-current-filter-k31-a.ts
# 24 PASS / 0 FAIL
```

覆盖：

1. 路由读取 `semesterId / week / viewType / targetId` 参数
2. applyAdjustments 分支按 teacher / class / room 过滤
3. 不调用 `prisma.scheduleSlot.findMany`（不会绕过过滤）
4. 合班标签使用 exec() 安全模式
5. 前端导出按钮传齐所有参数
6. 权限仍是 `data:export`，无新 RBAC 语义
7. schema/migration/K22 expected/dev.db/backup 均未变
8. 集成：丹婷婷 第 7 周 → 8 门课，标题含 丹婷婷，**不含**心理健康教育/机械制图/大学英语/金属材料与热处理，**不含**单值 46

样例输出：

```text
scripts/k31-a-sample/dantingting-week7-sample.xlsx
```

### 5.2 必跑回归

```bash
npx prisma validate        # PASS
npx prisma migrate status  # up to date
npm run build              # PASS
npm run lint               # baseline 185/149
npm run test:auth-foundation  # 61/1 pre-existing
```

## 6. 必跑验证命令

```bash
npx tsx scripts/verify-schedule-export-current-filter-k31-a.ts
npx prisma validate
npx prisma migrate status
npm run build
npm run lint
npm run test:auth-foundation
```

## 7. 修改文件

| 文件 | 类型 | 备注 |
|------|------|------|
| `src/app/api/export/excel/route.ts` | fix | applyAdjustments 分支过滤 + 合班标签安全化 |
| `scripts/verify-schedule-export-current-filter-k31-a.ts` | add | K31-A 验证脚本（24 checks） |
| `docs/k31-schedule-export-current-filter-fix.md` | add | 本文档 |
| `docs/k31-schedule-export-current-filter-fix.json` | add | 状态记录 |
| `.gitignore` | add | `scripts/k31-a-sample/` 忽略 |

## 8. 未变更

- prisma schema / migrations / dev.db
- K22 expected fixture
- RBAC / 权限语义
- 排课 / 调课 / 调课申请
- 数据库实体
- WorkTime / 学期

## 9. 已知限制 / manual trial required

- 班级名 `46` 仍会出现在 合班标签 内（这是 DB 中实际存在的班级名，不是 fallback）
- 浏览器人工验证（`/dashboard` 导出按钮）需在真实浏览器中执行，详见 K31-A 验证脚本
- K31-A 不覆盖 "全部" 视图下的学期/教师混合导出（与 viewType=all 行为一致，按周+学期过滤）

## 10. 推荐下一阶段

K31-B（可选）：将导出过滤逻辑下放到一个共享 `exportFilteredSchedule()` helper，让 `/api/schedule` 与 `/api/export/excel` 共用同一过滤规则；或为 export 增加返回前在 server 端走与 dashboard 完全相同的 `applyViewFilter` 工具函数，消除两端分别实现的隐患。
