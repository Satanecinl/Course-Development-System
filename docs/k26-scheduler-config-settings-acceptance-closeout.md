# K26-B: Scheduler Config Settings Acceptance Closeout

## 1. Executive Summary

系统设置页 → 排课参数设置功能已完成验收。

- K26-B integration（系统设置中心集成）已通过自动验证（47/47 PASS）
- K26-B1 manual trial（浏览器人工验证）已由用户反馈通过
- K26-B 排课参数设置小主线正式关闭
- 功能状态：`READY_FOR_REAL_USE`
- 手动前端验证状态：`PASSED`
- 推荐下一阶段：`K26-C-TIME-SLOT-WORKTIME-SETTINGS-AUDIT`（先做影响面审计，不直接实现节次作息配置）

## 2. GitHub Sync Status

| Item | Value |
|------|-------|
| Branch | `master` |
| Remote | `origin` → `https://github.com/Satanecinl/course-development-system.git` |
| Tracking branch | `origin/master` |
| Local HEAD before | `6f80b9d` |
| Remote HEAD before | `6f80b9d` |
| Local HEAD after | (to be filled after push) |
| Remote HEAD after | (to be filled after push) |
| Ahead/behind | up to date |
| Fetch | yes |
| Pull/rebase | no (was up to date) |
| Push | yes |
| Push target | `origin/master` |
| Force push | false |

## 3. Closed Scope

### 3.1 System Settings Integration

- `/admin/settings` 中"排课参数设置"模块为 ready
- `SchedulerConfigSettingsPanel`（settings center 专用表格化面板）
- 配置列表（按 maxIterations / lahcWindowSize / randomSeed / lockedSlotIds / solverVersion / semesterId / createdAt 等列）
- 新建配置（复用 `ConfigFormDialog`）
- 编辑配置（复用 `ConfigFormDialog`）
- 删除未引用配置（复用 `DeleteConfigButton`）
- 删除保护提示（`CONFIG_IN_USE` 后端 409 + UI toast）
- loading / error / empty states（k26b-loading / k26b-error / k26b-empty）
- 信息卡片（明确列出非目标项：不含 score 权重、节次作息、教室规则）
- 学期设置模块仍正常（SemesterSettingsPanel 仍由 SettingsCenter 渲染）

### 3.2 Reused SchedulingConfig Capability

- Prisma `SchedulingConfig` model（10 字段，含 semesterId、maxIterations、lahcWindowSize、randomSeed、solverVersion、lockedSlotIds）
- Existing CRUD API（GET/POST 列表，GET/PUT/DELETE 单项，全部受 `schedule:adjust` 保护）
- Existing client（`scheduler-config-client.ts` 中的 5 个 fetch 辅助函数）
- Existing types（`SchedulingConfig`、CRUD 输入/响应类型）
- `ConfigFormDialog`（含客户端校验：name 1-100, maxIterations 100-15000, lahcWindowSize 50-2000, randomSeed 0-2^31-1, lockedSlotIds 正整数）
- `DeleteConfigButton`（含 409 CONFIG_IN_USE 错误处理）
- Server-side validation（`src/lib/scheduler/config.ts` 中的 CONFIG_LIMITS、validateConfigPayload）
- `CONFIG_IN_USE` delete protection（409 + runIds）
- Semester-scoped config（semesterId NOT NULL, K25-C 已回填）

### 3.3 Manual Trial

- 打开系统设置页（Case A）— PASS
- 进入排课参数设置模块（Case B）— PASS
- 查看配置列表（Case C）— PASS
- 新建配置（Case D）— PASS
- 编辑配置（Case E）— PASS
- 校验错误（Case F）— PASS
- 删除未引用配置（Case G）— PASS
- 阻止删除已引用配置（Case H）— BLOCKED，详见 §6
- 学期设置回归（Case I）— PASS
- 其他模块状态（Case J）— PASS
- 自动排课回归（Case K）— PASS

**总结果：10 PASS / 0 FAIL / 1 BLOCKED**

## 4. Manual Acceptance Evidence

```txt
manualFrontendValidation: PASSED
source: user-provided browser validation
summary: 10 PASS / 0 FAIL / 1 BLOCKED
blockedCaseH: needs real-data validation
```

未提供其他细节（浏览器版本、截图、具体操作人姓名、验证时间）不在文档中编造。

## 5. Verification Baseline

| Verification | Result |
|--------------|--------|
| K26-B1 readiness verify | `48/48 PASS` |
| K26-B integration verify | `47/47 PASS` |
| K26-A shell verify | `47/47 PASS` |
| K21 solver config API verify | `PASS` |
| K21 solver config UI verify | `22/22 PASS` |
| Prisma validate | `PASS` |
| Prisma migrate status | `up to date` |
| Build | `PASS`（K26-B1 时已记录；如本阶段重新运行请更新） |
| Lint | `184 errors / 136 warnings`（与 K26-B1 baseline +0/+0） |
| Auth foundation | `53 passed / 1 failed`（pre-existing ScheduleAdjustment ACTIVE count mismatch） |

如本阶段实际运行结果不同，以实际结果为准。

## 6. Known Limitations

不阻塞 closeout 的限制：

- hardWeights / softWeights 未实现
- 软约束开关未实现
- 节次与作息设置未实现
- 教室规则设置未实现
- 调课规则设置未实现
- 导入规则设置未实现
- 权限与角色设置未实现
- 数据维护与备份未实现
- 审计日志未实现
- 当前 DB 无已引用 config，因此 Case H 人工验证 `CONFIG_IN_USE` 分支为 BLOCKED，需未来真实数据覆盖（followUp: needs real-data validation）
- lint 仍有历史 debt `184/136`（与 K26-B1 baseline 一致）
- `test:auth-foundation` 仍有 pre-existing `ScheduleAdjustment ACTIVE count mismatch`（与 K26-B1 baseline 一致）

## 7. Non-Goals

确认本阶段未做：

- schema change
- migration
- DB 数据修改
- API 语义修改
- solver algorithm
- score.ts
- scheduler preview / apply
- settings UI 功能扩张
- hardWeights / softWeights
- 节次作息
- 教室规则
- 调课规则
- 导入规则
- RBAC
- 数据维护
- 审计日志

## 8. Post-Closeout Decision Rules

后续只有真实反馈才触发：

| Situation | Action |
|-----------|--------|
| 排课参数设置 UI 小问题 | `K26-B-Settings-UI-Polish` |
| SchedulingConfig API bug | `K26-B-Settings-API-Fix` |
| 删除保护 bug | `K26-B-Config-Delete-Protection-Fix` |
| 需要 weights / presets | 独立 `K22/K26-SCORE-WEIGHTS-PLAN` |
| 需要软约束开关 | 独立 planning，不在 K26-B closeout 内处理 |
| 自动排课 preview 受影响 | blocker fix stage |
| 进入下一个设置模块 | `K26-C-TIME-SLOT-WORKTIME-SETTINGS-AUDIT` |

## 9. Final Recommendation

```txt
K26 scheduler config settings: CLOSED
featureStatus: READY_FOR_REAL_USE
manualFrontendValidation: PASSED
recommendedDefaultAction: use in real workflow; no further K26-B scheduler config settings mechanical development unless real feedback exists
```

## 10. Closed Stages

- `K26-B-SCHEDULER-CONFIG-SETTINGS-INTEGRATION`
- `K26-B1-SCHEDULER-CONFIG-SETTINGS-MANUAL-TRIAL`
- `K26-B-SCHEDULER-CONFIG-SETTINGS-ACCEPTANCE-CLOSEOUT`（本阶段）

## Verification Complete Addendum

本阶段：`K26-B-CLOSEOUT-A-VERIFICATION-COMPLETE`

### 补齐的验证项

| 缺失项 | 本阶段结果 |
|--------|-----------|
| `npm run build` | PASS (Compiled successfully) |
| `npm run test:auth-foundation` | 53 passed / 1 failed (pre-existing) |
| K21 solver config preview 回归 | 16/16 PASS |
| K21 solver config snapshot 回归 | 19/19 PASS |

### 完整验证命令表（本阶段实际运行）

| Command | Result |
|---------|--------|
| `npx tsx scripts/verify-scheduler-config-settings-acceptance-closeout-k26-b.ts` | **38/38 PASS** |
| `npx tsx scripts/verify-scheduler-config-settings-manual-trial-readiness-k26-b1.ts` | **48/48 PASS** |
| `npx tsx scripts/verify-scheduler-config-settings-integration-k26-b.ts` | **47/47 PASS** |
| `npx tsx scripts/verify-system-settings-shell-k26-a.ts` | **47/47 PASS** |
| `npx tsx scripts/verify-solver-config-api-k21-fix-f.ts` | **27/27 PASS** |
| `npx tsx scripts/verify-solver-config-ui-k21-fix-g.ts` | **22/22 PASS** |
| `npx tsx scripts/verify-solver-config-preview-k21-fix-f.ts` | **16/16 PASS** |
| `npx tsx scripts/verify-solver-config-snapshot-k21-fix-f.ts` | **19/19 PASS** |
| `npx prisma validate` | **PASS** |
| `npx prisma migrate status` | **up to date** |
| `npm run build` | **PASS** |
| `npx eslint .` | **184 errors / 136 warnings (+0/+0 vs baseline)** |
| `npm run test:auth-foundation` | **53 passed / 1 failed (pre-existing)** |

### Final Conclusion

```txt
K26-B-CLOSEOUT-A-VERIFICATION-COMPLETE: 建议关闭
K26-B-SCHEDULER-CONFIG-SETTINGS-ACCEPTANCE-CLOSEOUT: 现在可以正式关闭
K26-B 排课参数设置小主线: 正式关闭
featureStatus: READY_FOR_REAL_USE
manualFrontendValidation: PASSED
recommendedNextStage: K26-C-TIME-SLOT-WORKTIME-SETTINGS-AUDIT
K26-C 注: 必须先做影响面审计，不直接实现节次作息配置
```
