# 高校排课系统 (College Course Scheduling System)

工程应用技术学院排课系统。Next.js 16 + Prisma + SQLite，支持 Word 课表解析、冲突检测、拖拽排课。

## 快速开始

```bash
# 安装依赖
npm install

# 启动开发服务器
npm run dev
# 访问 http://localhost:3000

# 构建
npm run build
```

## 功能模块

- **`/dashboard`** — 排课主界面，拖拽排课，冲突实时检测
- **`/admin/db`** — 数据管理面板，CRUD 所有实体表，课表导入

## Import Workflow

See [docs/import-workflow.md](docs/import-workflow.md)

## 数据流程

```
Word .docx ──[Python 解析]──> JSON ──[Import API]──> SQLite
```

### 解析

```bash
python scripts/parse_schedule.py "../2026年春季学期课程表(0420).docx" -o output.json -v
```

### 导入（通过 Web UI）

1. 访问 `/admin/db`
2. 点击"导入课表"，上传 .docx 文件
3. 查看解析质量报告
4. 确认导入（需输入 `CONFIRM_IMPORT`）

### 导入（CLI，受控）

```bash
npm run test:confirm-import-dry-run     # 先做 dry-run
npm run test:confirm-import-rollback    # 验证事务回滚
CONFIRM_IMPORT=1 npm run confirm:import # 真实导入
npm run audit:confirmed-import          # 导入后审计
```

## 测试命令

```bash
npm run test:import-quality             # 解析质量回归
npm run test:confirm-import-dry-run     # Dry-run 不变量检查
npm run test:confirm-import-rollback    # 事务回滚演练
npm run test:confirm-api-guards         # API guard 测试
npm run test:capacity                   # 容量诊断
npm run test:diagnostics                # 评分诊断 + solver
npm run test:solver                     # 完整 solver 运行
```

## 技术栈

- **前端**: Next.js 16 (App Router), React 19, Zustand, @dnd-kit, Tailwind CSS
- **后端**: Next.js API Routes, Prisma ORM, SQLite
- **解析**: Python (python-docx)
- **排课**: 自定义约束求解器 (LAHC 算法)

## 项目结构

```
src/
├── app/
│   ├── admin/db/           # 数据管理页面
│   ├── api/
│   │   ├── admin/          # 管理 API (CRUD + import)
│   │   ├── schedule/       # 排课数据 API
│   │   └── conflict-check/ # 冲突检测 API
│   └── dashboard/          # 排课主界面
├── components/
│   ├── admin-db/           # 管理面板组件
│   ├── schedule-grid.tsx   # 拖拽排课网格
│   └── schedule-sidebar.tsx # 筛选侧栏
├── lib/
│   ├── import/             # 导入管线 (parse-utils, quality-classifier, importer)
│   ├── scheduler/          # 排课引擎 (data-loader, score, capacity, diagnostics)
│   ├── admin-db/           # 管理面板配置
│   ├── conflict.ts         # 周次冲突数学
│   └── conflict-check.ts   # 服务端冲突检测
└── types/                  # TypeScript 类型定义

scripts/
├── parse_cell.py           # 单元格解析器
├── parse_schedule.py       # Word 课表解析主脚本
├── seed_db.ts              # CLI 种子脚本 (旧)
├── test-*.ts               # 各类测试脚本
├── confirm-import-once.ts  # 真实导入 (需 CONFIRM_IMPORT=1)
├── audit-confirmed-import.ts  # 导入审计
└── fix-confirmed-import-metadata.ts  # 元数据修正
```
