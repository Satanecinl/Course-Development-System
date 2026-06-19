# K37-A Campus Room Rules Settings — Diagnostics Enhanced

## Stage

```text
K37-A-CAMPUS-ROOM-RULES-SETTINGS-EDITABLE-BASIC
```

## 1. Schema Reconnaissance

| Aspect | Finding |
|---|---|
| Room model fields | `id`, `name`, `building` (nullable), `capacity`, `type`, `createdAt`, `updatedAt` |
| `campus` / `isLinxiao` field | **不存在** |
| `building` data | 全部 42 间教室均为 NULL |
| Linxiao detection | `name.includes('林校')` OR `building?.includes('林校')` — 纯名称匹配 |
| Linxiao rooms | 5 间：林校301、303、304、305、306 |
| Automotive detection | `classifySpecialty()` — classGroup name 为主信号，courseName/remark 为辅助 |

## 2. Route Decision: B

**Route B** — 不可编辑（诊断增强版）

**理由：**
- Room schema 无 `campus`/`isLinxiao` 字段
- `building` 字段对全部 42 间教室均为空
- 林校识别完全依赖 `name` 字符串匹配
- 没有稳定可用的持久编辑字段
- 新增 schema 需要 migration，需用户确认后在 K37-B 执行

## 3. API Changes

### GET `/api/admin/settings/campus-room-rules`

**新增字段（additive, 不 break 现有 consumer）：**

| Field | Type | Description |
|---|---|---|
| `editability` | object | 编辑能力标志和检测方式说明 |
| `editability.linxiaoEditable` | `false` | 当前不支持编辑 |
| `editability.reason` | string | 为什么不可编辑 |
| `editability.detectionMethod` | string | 当前检测方式 |
| `automotiveKeywords` | `string[]` | 汽车专业关键词列表 |
| `automotiveClassification` | object | 分类依据和分类结果 |
| `rooms[].linxiaoSource` | `string \| null` | 每间教室的林校识别来源 |

### POST / PATCH / PUT

**未新增。** Route B 不实现写入操作。POST 已有 405 响应保持不变。

### Violations 增强

每个 violation 新增 `dayOfWeek`、`slotIndex`、`source`（primary/secondary）字段。

## 4. UI Changes

### Header

- Badge 从 "只读基础版" 改为 **"诊断增强版（不可编辑）"**

### 规则说明区

- 保留 HC6 hard rule / SC6 soft rule 展示
- 新增林校识别方式说明
- 新增汽车专业关键词展示
- 新增分类依据和分类结果说明

### 违规明细区

- 分 HC5 / HC6 两个分组显示
- 每条违规显示：slotId、课程名、教室名、时间（dayOfWeek + slotIndex）、来源（primary/secondary）
- 无违规时显示绿色通过

### 教室管理区（原"林校教室列表"）

- 从仅显示林校教室改为**显示全部教室**
- 每行显示：ID、名称、容量、类型、林校状态（是/否）、识别来源
- 支持**筛选**：全部 / 林校 / 非林校
- 支持**搜索**：按教室名称搜索
- 操作列：不可编辑（显示林校状态和来源，无编辑按钮）

### 只读提示

- 从"当前为只读基础版"更新为明确说明不可编辑原因
- 提及 K37-B 作为后续可编辑方案

## 5. Permissions & Security

- API 仍要求 `settings:manage` 权限
- 无新增写操作
- 无新增 RBAC key
- HC6 hard rule 不可关闭（无关闭按钮）
- 不触发 scheduler / score / adjustment

## 6. HC5/HC6 / Multi-room Coverage

| Feature | Status |
|---|---|
| HC5 room unavailability | ✅ 包含 primary + secondary rooms |
| HC6 non-automotive in Linxiao | ✅ 包含 primary + secondary rooms |
| Secondary room 来源标记 | ✅ violation 显示 source: primary/secondary |
| `additionalRooms` 查询 | ✅ 保留 K36-B1A5 修复 |
| Score/solver 语义 | ✅ 未修改 |
| K22 expected | ✅ 73/0/0/0 未变更 |

## 7. Verification Results

| Item | Result |
|---|---|
| K37-A verify script | ✅ 24/24 PASS |
| K36-B1A5 verify | ✅ 19/19 PASS |
| K22-C score regression | ✅ 73/0/0/0 (no drift) |
| PII scan | ✅ 0 BLOCKING |
| Prisma validate | ✅ schema valid |
| ESLint | ✅ 0 errors |
| Build | ✅ PASS |
