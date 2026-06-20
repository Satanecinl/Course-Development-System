# L6-C-XLSX-COURSE-SETTING-CREATE-NEW-SEMESTER-FROM-IMPORT-FLOW

> Excel 课程设置导入流程新增"新建学期"模式，支持在没有合适学期时为本次导入创建新 Semester 并自动选为 targetSemesterId。
> L6-C 是 L6 主线**第一个允许写 DB 的阶段**，但写入范围严格限制在 `Semester` 一张表。

## 1. 阶段名称

`L6-C-XLSX-COURSE-SETTING-CREATE-NEW-SEMESTER-FROM-IMPORT-FLOW`

## 2. 用户需求

- Excel 课程设置导入时，可以选择**已有学期**作为目标学期（L6-B 已实现）。
- 如果没有合适学期，可以**在导入流程中新建学期**（L6-C 本阶段）。
- 新建学期**只作为本次导入目标学期**，**不应自动切换系统当前 active semester**。

## 3. 本阶段允许写入范围

```text
只允许创建 Semester。
```

- `POST /api/semesters` 创建 Semester
- 任何对 `Course` / `Teacher` / `ClassGroup` / `TeachingTask` / `TeachingTaskClass` / `ImportBatch` / `ScheduleSlot` / `ScheduleAdjustment` 的写操作均**禁止**

## 4. 为什么只允许创建 Semester

新建学期是 L6-C 的核心用户需求：

1. 用户上传的 Excel 是某一特定学期的课程设置，例如"2025 年秋季学期课程设置"
2. 当前系统可能没有这个学期（DB 只有春季和 2026 秋），需要先创建
3. 但学期创建本身是**系统设置行为**，不应携带任何业务数据

因此 L6-C 必须在导入流程中提供学期创建能力，但**严格隔离**：

- 不创建任何课程相关表（Course/Teacher/ClassGroup/TeachingTask/...）
- 不创建任何导入相关表（ImportBatch/ScheduleSlot/ScheduleAdjustment）
- 不切换 active semester

后续阶段（L6-D / L6-E / L6-F）才会实现 TeachingTask 写入和 confirm/apply。

## 5. 为什么不切换 active semester

active semester 是**全系统级别**的设置，影响所有用户的看板、课程表、统计。

如果导入流程自动切换 active semester：

- 现有用户打开 `/dashboard` 时课程表瞬间"变了"
- 工作时间、统计、过滤全部受影响
- 没有 audit / approval gate
- 不符合 K25-E 学期设置的"显式激活"原则

因此 L6-C 严格遵守：

- 创建学期时 `isActive: false`
- 不调用 `POST /api/semesters/[id]/activate`
- 不提供"设为当前学期" checkbox
- UI 显式提示"新建学期只会作为本次 Excel 课程设置导入的目标学期，不会自动切换系统当前学期"

## 6. UI existing/createNew flow

### 模式切换

在 `导入目标学期` 区域加入两个 radio：

- `选择已有学期`（L6-B 既有，下拉框）
- `新建学期`（L6-C 新增，表单）

### 已有学期模式（L6-B 保留）

- `<select>` 显示 `GET /api/semesters` 返回的列表
- 当前 active 学期标注 `(当前学期)`
- 选中后 `selectedSemesterId` 设为对应 id
- 提示："该选择只决定本次 Excel 课程设置导入的目标学期，不会自动切换系统当前学期。"

### 新建学期模式（L6-C 新增）

蓝色边框表单，包含 6 个字段：

| 字段 | 必填 | 校验 |
|---|---|---|
| 学期名称 (name) | ✅ | 非空，trim |
| 学期代码 (code) | ✅ | 非空，trim，全局唯一 |
| 学年 (academicYear) | ❌ | 可选 |
| 学期类型 (term) | ❌ | 可选 |
| 开始日期 (startsAt) | ❌ | date input |
| 结束日期 (endsAt) | ❌ | date input；如 < startsAt 则前端拦截 |

操作按钮：

- `创建学期`（主按钮，loading 时显示 `创建中...`）
- `清空表单`（次按钮，重置表单）
- 创建成功后显示 `当前已选 targetSemesterId = <id>` 确认

## 7. client / API 行为

### 7.1 client helper

新增 `src/lib/import/course-setting-xlsx-client.ts` 导出：

```ts
createSemesterForCourseSettingImport(input: {
  name: string
  code: string
  academicYear?: string | null
  term?: string | null
  startsAt?: string | null
  endsAt?: string | null
}): Promise<SemesterListItem>
```

内部：

- `POST /api/semesters` (JSON body)
- **强制 `isActive: false`**（hardcoded）
- 不调用 `/api/semesters/[id]/activate`
- 错误码透传：`SEMESTER_CODE_EXISTS` / `VALIDATION_ERROR` / `HTTP_403` 等
- 403 时提示 "无权限新建学期，请联系管理员或选择已有学期"

### 7.2 API contract（既有 `POST /api/semesters`）

- 要求权限：`settings:manage`
- 请求体：`{ name, code, academicYear?, term?, startsAt?, endsAt?, isActive? }`
- 响应：`201 { success: true, semester: { id, name, code, ... } }`
- 错误：
  - `400 VALIDATION_ERROR` / `INVALID_DATE` / `INVALID_DATE_RANGE`
  - `409 SEMESTER_CODE_EXISTS`
  - `500 INTERNAL_ERROR`
- L6-C **不修改** 该 API 任何逻辑

### 7.3 创建成功后行为

```text
1. POST /api/semesters 成功 → 拿到 createdSemester.id
2. 重新调用 fetchSemestersForImport() 刷新学期列表
3. setSelectedSemesterId(created.id)  // 自动选中新学期
4. 清空 createForm
5. 切换 targetSemesterMode = 'existing'  // 回到下拉框，可看到新学期
6. toast.success('学期创建成功')
7. 用户可继续上传/解析 xlsx
```

## 8. 权限行为

`POST /api/semesters` 要求 `settings:manage`。

L6-C **不弱化** 权限：用户必须拥有 `settings:manage` 才能创建学期。

UI 错误处理：

- 403 → toast + 错误区显示 "无权限新建学期，请选择已有学期或联系管理员"
- 409 → toast + 错误区显示 "学期代码已存在"
- 400 → 显示 server 返回的具体 message

## 9. 受控 DB 写入验证

L6-C 是首个允许写 DB 的 L6 阶段。verify 脚本必须：

### 9.1 备份

```ts
const ts = new Date().toISOString().replace(/[:.]/g, '-')
const backupPath = `prisma/dev.db.backup-before-l6-c-create-semester-${ts}`
fs.copyFileSync('prisma/dev.db', backupPath)
```

- 路径在 `prisma/` 下
- 文件名匹配 `.gitignore` 中 `prisma/dev.db.backup-*` 规则
- 不会被 `git ls-files` 找到（`gitignored`）

### 9.2 创建测试 Semester

```ts
const created = await prisma.semester.create({
  data: {
    name: `L6-C Verify Semester ${ts}`,
    code: `L6C-${tsDigits}`,
    isActive: false,  // 严格 isActive=false
  }
})
```

### 9.3 验证

- `Semester.count +1`
- `Course` / `Teacher` / `ClassGroup` / `TeachingTask` / `TeachingTaskClass` / `ImportBatch` / `ScheduleSlot` / `ScheduleAdjustment` 全部不变
- `activeSemesterId` 不变
- 新建 semester 的 `isActive=false`

### 9.4 恢复

```ts
// 先 disconnect prisma 释放 SQLite 文件锁
await prisma.$disconnect()
fs.copyFileSync(backupPath, 'prisma/dev.db')
// 重新 new PrismaClient 验证
```

- 重新读所有 count → 必须等于 before
- `activeSemesterId` 必须等于 before
- 留下新的 `PrismaClient` 用于最后 summary 后 disconnect

### 9.5 禁止清理

- **禁止** `prisma.semester.delete` 清理测试数据
- **禁止** 留下测试 Semester（必须通过 backup/restore 还原）
- 如果 restore 失败，verify 必须 exit non-zero 并报告

## 10. 隐私与日志边界

L6-C 继承 L6-B1 隐私规则：

- **runtime authorized API**: 可返回 raw preview fields（不变）
- **committed docs/json**: **不**含 raw 教师/班级/课程/备注/手机号
- **verify stdout**: **不** console.log raw rows
- **sample xlsx**: **不** commit
- **DB backup**: **不** commit（gitignore `prisma/dev.db.backup-*`）

## 11. 隔离确认

L6-C 严格不修改：

- `src/app/api/admin/import/course-setting-xlsx/preview/route.ts`（preview API 既有逻辑保留）
- `src/lib/import/course-setting-xlsx-preview.ts`（preview helper 既有逻辑保留）
- `src/lib/import/course-setting-xlsx-parser.ts`（L2 parser）
- `src/lib/import/course-setting-teaching-task-dry-run.ts`（L4 mapper）
- `src/lib/import/course-setting-review-package-l5.ts`（L5 helper）
- `prisma/schema.prisma`（schema）
- `prisma/migrations/**`（migrations）
- `src/lib/scheduler/**`（scheduler）
- `src/lib/score/**`（score）
- `scripts/parse_schedule.py`（旧 Word parser）
- `src/app/api/import/word/**`（旧 Word import）
- `package.json` / `package-lock.json`

L6-C **唯一** 修改：

- `src/lib/import/course-setting-xlsx-client.ts`（新增 `createSemesterForCourseSettingImport` + types）
- `src/components/import/course-setting-xlsx-preview.tsx`（新增 createNew mode + form）
- `scripts/verify-xlsx-course-setting-create-new-semester-l6-c.ts`（新增 verify）
- `docs/l6-c-*.md` / `docs/l6-c-*.json`（新增 docs）
- `docs/current-project-status.md`（追加 L6-C closeout line）

## 12. L6-B1 raw preview 保留

L6-C 不破坏 L6-B1 既有功能：

- 课程名 / 教师 / 班级 / 备注 / 合班备注 / 周课时 / 考试类型 / sheet / 行号 原文仍显示
- `rawPreview` metadata 仍包含 `committedArtifactsContainRaw: false`
- admin-only notice 仍展示
- 解析按钮在 createNew 模式下变 disabled（直到切回 existing 或创建成功）

## 13. L6-B target semester preview 保留

L6-C 不破坏 L6-B 既有功能：

- `targetSemesterId` 仍必填
- preview API 仍 `POST /api/admin/import/course-setting-xlsx/preview`
- existing mode 下拉框 + "不会自动切换系统当前学期" 提示保留
- preview-only guard（无 confirm/apply/写入 DB 按钮）保留

## 14. 浏览器人工验证 checklist

启动 dev server，ADMIN 登录，打开 `/admin/import`：

1. Excel preview 区有"选择已有学期"模式
2. Excel preview 区有"新建学期"模式
3. 不填写 name/code 不能创建（按钮 disabled）
4. 填写新学期 name + code，点击"创建学期"
5. 创建成功后学期列表刷新（出现新学期）
6. 新学期自动成为选中的 target semester（切回 existing mode 后下拉框选中）
7. 页面显示"新建学期只会作为本次 Excel 课程设置导入的目标学期，不会自动切换系统当前学期"
8. 系统当前 active semester 没有变化
9. 上传 `.xlsx` 样本
10. 点击"解析预览"
11. preview 成功
12. 目标学期 summary 显示新学期 ID
13. raw preview 表格仍显示真实课程/教师/班级/备注/sheet/行号
14. 没有"确认导入 / 应用 / 写入 DB / 创建教学任务 / 创建 ImportBatch"按钮
15. 没有"切换当前学期"按钮
16. 没有任何"设为当前学期"checkbox
17. DB 中只新增 Semester（其他表 counts 不变）
18. ImportBatch count 不变
19. TeachingTask count 不变
20. TeachingTaskClass count 不变
21. ScheduleSlot count 不变
22. Browser console 无 React error

## 15. 验证结果

- L6-C verify: PASS（86/86）
- L6-B1 verify: PASS
- L6-B verify: PASS
- L6-A audit: PASS
- L6-0 verify: PASS
- L5 verify: PASS
- L4 verify: PASS
- L3 verify: PASS
- L2 parser verify: PASS
- L1 audit: PASS
- K39-B1: PASS
- K39-C2: PASS
- K22-C: 73/0/0/0
- scan:docs-pii: 0 blocking
- build: PASS
- tsc: PASS
- targeted eslint: 0 errors
- git diff check: clean
- forbidden files: clean
- backup check: clean (gitignored, not tracked)

## 16. 下阶段建议

L6-D：Excel 课程设置导入的**审核包绑定 targetSemesterId** + 决策记录。

- 不创建 ImportBatch
- 不创建 TeachingTask
- 不切换 active semester
- 仍为 review/approval-only

L6-D 之后才是 L6-E（confirm + 真正写入 TeachingTask）和 L6-F（apply + rollback）。

## 17. 结论

L6-C **code complete**；**browser manual validation pending**；**not READY_FOR_REAL_USE yet**。

- 唯一 DB 写入：`Semester`
- 唯一 API 改动：client helper 追加；server API 零改动
- 唯一 UI 改动：createNew mode + form
- 所有 L6-B / L6-B1 / L6-A / L6-0 / L5 / L4 / L3 / L2 / L1 / K39 / K22 回归 PASS
