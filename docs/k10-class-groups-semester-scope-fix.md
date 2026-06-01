# K10-SEMESTER-ORDINARY-SCHEDULE-SCOPING-FIX

**阶段**：修复 `GET /api/class-groups` 的 semester scoping
**修复对象**：`src/app/api/class-groups/route.ts`
**风险等级**：MEDIUM（审计阶段发现）

---

## 修复前

```ts
// GET handler:
const classGroups = await prisma.classGroup.findMany({
  orderBy: { name: 'asc' },
  select: { id: true, name: true },
})
```

- 无 `where` 条件，返回全库所有学期的 ClassGroup
- 普通用户（`data:read`）可读取所有学期的 ClassGroup
- 不支持显式 `?semesterId=X`
- 不使用 `resolveSchedulerSemester`

## 修复后

```ts
const { searchParams } = new URL(request.url)
const semesterIdParam = searchParams.get('semesterId')
const semester = await resolveSchedulerSemester({
  semesterId: semesterIdParam ? parseInt(semesterIdParam, 10) : undefined,
})

const classGroups = await prisma.classGroup.findMany({
  where: { semesterId: semester.id },
  orderBy: { name: 'asc' },
  select: { id: true, name: true },
})
```

- 支持显式 `?semesterId=X`（优先）
- 未传 `semesterId` 时默认 active Semester（`resolveSchedulerSemester` 行为）
- `ClassGroup.findMany` 按 `semesterId: semester.id` 过滤
- `response shape` 保持不变：`[{ id, name }]`
- `requirePermission('data:read')` 权限守卫保持不变
- 新增 import：`resolveSchedulerSemester` from `@/lib/semester`

---

## 验证结果

| 命令 | 结果 |
|---|---|
| `npx.cmd tsx scripts/verify-class-groups-semester-scope.ts` | ✅ 7/7 passed |
| `npm.cmd run lint` | ✅ 无新增 lint 错误（`class-groups` 文件无报错） |
| `npm.cmd run build` | ✓ Compiled successfully |
| API 验证 | 无法 curl 验证（login 使用 server action，无 REST 登录端点） |

---

## 遗留问题

- 本阶段无遗留问题
- 唯一修复项（`/api/class-groups`）已完成
- 后续阶段：K10-SEMESTER-IMPORT-SCOPING-AUDIT
