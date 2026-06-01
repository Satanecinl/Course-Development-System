# K10-SEMESTER-IMPORT-SCOPING-VALIDATION-SCRIPT-BASELINE-FIX

## 阶段名

`K10-SEMESTER-IMPORT-SCOPING-VALIDATION-SCRIPT-BASELINE-FIX`

## 日期

2026-06-01

## 问题来源

Validation 阶段运行 `verify-import-semester-scoping-fix-a.ts` 时结果为 31/33 PASS、2 FAIL：

1. `confirm route calls resolveSchedulerSemester()` — Fix-B 重构了 confirm route，调用签名从 `resolveSchedulerSemester()` 变为 `resolveSchedulerSemester({ semesterId: querySemesterId })`，精确字符串匹配失败
2. `ClassGroup.name @unique preserved` / `ClassGroup does NOT have @@unique([semesterId, name])` — Fix-B 将 `ClassGroup.name @unique` 替换为 `@@unique([semesterId, name])`，脚本仍检查旧设计

两个 FAIL 均为 Fix-B 后的预期设计变化，非真实风险。

## 修复内容

### ClassGroup unique 检查基线更新

```typescript
// 旧检查（Fix-A 原始）
'ClassGroup.name @unique preserved'  → 期望 @unique 存在
'ClassGroup does NOT have @@unique([semesterId, name])'  → 期望 @@unique 不存在

// 新检查（Fix-B baseline）
'ClassGroup.name does NOT have @unique (Fix-B: replaced by composite unique)'  → 期望 @unique 不存在
'ClassGroup has @@unique([semesterId, name]) (Fix-B final design)'  → 期望 @@unique 存在
```

### Confirm route 检查基线更新

```typescript
// 旧检查
confirmRoute.includes('resolveSchedulerSemester()')  // 精确匹配空括号

// 新检查
confirmRoute.includes('resolveSchedulerSemester(')   // 匹配有参调用
```

### 是否保留 Fix-A 核心检查

是。所有 33 项检查保留，仅调整 2 项过时预期。

### 是否删除真实风险检查

否。

### 是否修改业务代码

否。

## 验证结果

| 脚本 | 结果 |
|------|------|
| `verify-import-semester-scoping-fix-a.ts` | 33/33 PASS |
| `verify-import-semester-scoping-fix-b.ts` | 24/24 PASS |
| `audit-import-semester-scoping.ts` | 0 HIGH, 0 MEDIUM, 1 LOW |
| `validate-import-semester-scoping.ts` | 46 PASS, 0 FAIL, 1 SKIP |
| `npm.cmd run build` | 通过 |
| `npm.cmd run lint` | 274 pre-existing problems，与本阶段无关 |

## 是否修改业务代码

否

## 是否修改 schema

否

## 是否可关闭 import scoping 主线

是。所有验证脚本恢复全绿，import scoping 主线可正式关闭。
