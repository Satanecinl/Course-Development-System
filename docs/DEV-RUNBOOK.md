# 开发运行规范 (DEV-RUNBOOK)

## 1. 项目当前稳定基线

### H2 状态

- **H2 已关闭** — 首页重构与权限系统升级全部完成
- 归档文档: `docs/H2-AUTH-RBAC-FINAL-REPORT.md`

### 主数据基线

| 项目 | 数量 |
|------|------|
| ClassGroup | 36 |
| Teacher | 84 |
| Course | 104 |
| Room | 53 |
| TeachingTask | 308 |
| TeachingTaskClass | 548 |
| ScheduleSlot | 440 |
| ImportBatch (confirmed) | #1 |
| ScheduleAdjustment ACTIVE | 0 |

### 权限系统状态

- API routes: 22/22 protected
- 角色: ADMIN (全部权限), USER (data:read)
- 最终授权基于数据库 Session
- Middleware 使用 claims-edge.ts (Web Crypto API)

## 2. 推荐启动方式

### Windows PowerShell

```powershell
# 使用 npm.cmd 而非 npm（避免 PowerShell 执行策略问题）
npm.cmd run dev
npm.cmd run build
npm.cmd run test:xxx
```

### 手动启动 Dev Server

```bash
npm.cmd run dev
# 启动后访问 http://localhost:3000
# Ctrl+C 停止
```

### 不建议由 Claude Code 启动 Dev Server

- Claude Code 不运行 `npm run dev`
- Claude Code 不启动后台长期进程
- Dev server 由用户手动维护

## 3. Claude Code 使用规范

### 允许的命令

- `npm run build` — 生产构建（短命令，会自动结束）
- `npm run test:xxx` — 各类测试（短命令，会自动结束）
- `npx tsx scripts/xxx.ts` — 运行脚本（短命令）
- `npx prisma db push` — 数据库同步（需用户确认）
- 文件读写操作

### 禁止的命令

- `npm run dev` — 不启动 dev server
- `curl` 循环 — 不轮询 API
- 后台进程 — 不使用 `&` 或 `run_in_background`
- 长时间运行的命令 — 超过 2 分钟的命令需谨慎

### Dev Server 管理

- Dev server 由用户手动启动和停止
- Claude Code 需要测试 API 时，假设 dev server 已运行
- 如 dev server 未运行，提示用户启动

## 4. 常见问题处理

### PowerShell npm.ps1 执行策略问题

**症状**: `npm` 命令报错 `无法加载文件 C:\Program Files\nodejs\npm.ps1，因为在此系统上禁止运行脚本`

**解决**: 使用 `npm.cmd` 代替 `npm`

```powershell
npm.cmd run dev
npm.cmd run build
```

### Next.js Dev Server Stale Cache

**症状**: API 返回 HTML 500，错误信息 `components.ComponentMod.handler is not a function`

**原因**: Turbopack 编译缓存损坏

**解决**:
1. 停止 dev server (Ctrl+C)
2. 删除 `.next` 目录: `rm -rf .next`
3. 重启 dev server: `npm.cmd run dev`

### API 返回 HTML 500

**症状**: 预期 JSON 但收到 `<!DOCTYPE html>`

**诊断步骤**:
1. 查看 dev server 终端的 stack trace
2. 检查 `response.headers.get("content-type")`
3. 检查 `response.status` 和 `response.url`
4. 读取 body 前 500 字符

**常见原因**:
- Turbopack stale cache → 删除 .next 重启
- 模块导入失败 → 检查 import 路径
- PrismaClient 未初始化 → 检查数据库连接

### Unexpected token '<' JSON Parse Error

**症状**: `SyntaxError: Unexpected token '<', "<!DOCTYPE "... is not valid JSON`

**诊断**: 使用 `parseJsonOrDiagnose` helper 检查:
- content-type 是否为 application/json
- response.url 是否被重定向
- body 前 500 字符是否为 HTML

### ECONNREFUSED

**症状**: `FetchError: request to http://localhost:3000/... failed, reason: connect ECONNREFUSED`

**原因**: Dev server 未启动

**解决**: 提示用户启动 dev server

## 5. 测试运行规范

### 需要 Dev Server 的测试

以下测试需要 dev server 运行:

- `test:h2e-api-permissions` — 调用 API 测试权限
- `test:import-workflow` — 调用 import API
- `test:schedule-adjustment-api-e2e` — 调用 schedule API
- `test:schedule-adjustment-cross-week` — 调用 schedule API
- `test:schedule-adjustment-final-acceptance` — 调用 schedule + export API
- `test:abandon-import-batch` — 调用 import API

### 不需要 Dev Server 的测试

以下测试只读取数据库或文件:

- `test:auth-foundation` — 数据库查询
- `test:h2b-login` — 数据库查询 + 文件检查
- `test:h2c-middleware` — 文件检查 + 数据库查询
- `test:h2d-layout-sidebar` — 文件检查
- `test:diagnostics` — 数据库查询 + solver
- `test:schedule-adjustment` — 数据库查询
- `test:capacity` — 数据库查询
- `test:solver` — 数据库查询 + 计算
- `test:import-quality` — 文件解析
- `audit:api-permissions` — 文件扫描
- `g0fixb-verify-database` — 数据库查询

### H2 权限相关测试顺序

```bash
# 1. 基础验证（不需要 dev server）
npm run build
npm run test:auth-foundation
npm run test:h2b-login
npm run test:h2c-middleware
npm run test:h2d-layout-sidebar

# 2. API 权限测试（需要 dev server）
npm.cmd run test:h2e-api-permissions

# 3. 权限审计（不需要 dev server）
npx tsx scripts/audit-api-permissions.ts
```

### 完整回归命令清单

```bash
# 基础验证
npm run build
npm run test:auth-foundation
npm run test:h2b-login
npm run test:h2c-middleware
npm run test:h2d-layout-sidebar
npm run test:h2e-api-permissions
npx tsx scripts/audit-api-permissions.ts
npx tsx scripts/g0fixb-verify-database.ts

# 业务回归
npm run test:diagnostics
npm run test:import-workflow
npm run test:schedule-adjustment
npm run test:schedule-adjustment-api-e2e
npm run test:schedule-adjustment-cross-week
npm run test:capacity
npm run test:solver
npm run test:schedule-adjustment-final-acceptance
```

## 6. 数据安全规范

### 禁止操作

- `npx prisma db push --force-reset` — 不重置数据库
- 直接删除 ImportBatch #1 — 不删除确认的导入批次
- 不备份就修改 schema — 修改前先备份 dev.db

### 备份规范

```bash
# 修改 schema 前备份
cp prisma/dev.db prisma/dev.db.backup-$(date +%Y%m%d%H%M%S)
```

### 测试数据清理

测试创建的临时数据必须清理:

| 数据类型 | 清理方式 |
|----------|----------|
| pending ImportBatch | abandon 或 delete |
| test Session | revoke 或 delete |
| ACTIVE ScheduleAdjustment | void |
| test User | delete |

### 数据库操作确认

以下操作需要用户明确确认:

- `npx prisma db push` — 同步 schema
- `CONFIRM_IMPORT=1 npm run confirm:import` — 执行导入
- `npm run rollback:import` — 回滚导入

## 7. 后续建议

### I0-B: Middleware/Proxy Warning 评估

- Next.js 16 建议从 middleware 迁移到 proxy convention
- 评估迁移影响和工作量
- 不急于迁移，先观察 Next.js 16 稳定性

### I0-C: Workspace Root Warning 清理

- 当前有多个 package-lock.json 导致 warning
- 考虑删除多余的 lockfile
- 或在 next.config.ts 中配置 turbopack.root

### I0-D: Test Auth Helper 收口

- 当前各测试脚本各自创建 admin cookie
- 考虑统一到 test-auth-helper.ts
- 减少重复代码
