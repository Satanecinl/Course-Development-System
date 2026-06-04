# K19-FIX-C-IMPORT-APPROVAL-BROWSER-E2E

| Field | Value |
|---|---|
| Phase | K19-FIX-C-IMPORT-APPROVAL-BROWSER-E2E |
| Type | E2E Readiness (Situation B) |
| Generated | 2026-06-04 |
| Predecessor | K19-FIX-B2-AUDIT-ALIGNMENT (commit `0720cd0`) |

---

## 1. Background

K19-FIX-B1 + K19-FIX-B2 已完成 cross-cohort approval 能力：

- Backend: `TeachingTask.crossCohortApproved` + `crossCohortApprovalReason` + confirm API `crossCohortApprovals` payload + `validateCrossCohortApprovals` gate (commit `6bc87bb`)
- Frontend helper: `src/lib/import/cross-cohort-approval-ui.ts` (parse / validate / payload / error mapping)
- Frontend UI: `src/components/schedule-import-dialog.tsx` 集成 warning display + approval checkbox + reason textarea + confirm button gating
- Audit: HIGH=0 / MEDIUM=0 / LOW=0 / INFO=3 / NONE=10 / BLOCKING=0 (K19-FIX-B2-AUDIT-ALIGNMENT)

剩余缺口：B2 验证为**纯函数测试 + build**，未做真实浏览器 E2E。K19-FIX-C 目标为 import dialog cross-cohort approval 流程增加最小浏览器端 E2E 覆盖。

---

## 2. Goal

1. 审查项目当前是否已有 Playwright / browser E2E 测试框架。
2. 如果已有可用框架，新增最小 E2E 测试。
3. 如果没有可用框架（Situation B），新增轻量 E2E readiness audit / plan，并给出后续引入方案。
4. 优先测试 frontend 行为，不写 DB。
5. 覆盖：
   - LIKELY_ERROR_CROSS_COHORT warning 展示
   - checkbox 未勾选时 confirm disabled
   - checkbox 勾选但 reason < 5 时 confirm disabled
   - reason >= 5 时 confirm enabled
   - request payload 包含 `crossCohortApprovals`
   - backend 409 approval required / reason required 显示用户可读错误

---

## 3. E2E Framework Discovery

### 3.1 项目 E2E 现状

| Item | Status |
|---|---|
| Playwright / `@playwright/test` | **未安装** |
| Vitest / Jest | **未安装** |
| Testing Library | **未安装** |
| MSW (Mock Service Worker) | **未安装** |
| `e2e/` 目录 | **不存在** |
| `tests/e2e/` 目录 | **不存在** |
| `playwright.config.*` | **不存在** |
| `test:e2e` 脚本 | **不存在** |

### 3.2 现有 test 模式

项目当前测试基础设施以 `tsx` 驱动的 Node-side 脚本为主（`scripts/verify-*.ts`、`scripts/audit-*.ts`、`scripts/test-*.ts`），覆盖：

- 单元 / 纯函数 / 数据 quality / RBAC matrix 验证
- API 真实 fetch 验证（dev server 运行下）
- DB schema inspect 验证（read-only）

`test:auth-foundation` 是个例外，使用了 lighter 的 fetch-based 验证（非真实浏览器）。

**结论：Situation B — 项目没有 Playwright 或等价 browser E2E 框架。**

### 3.3 不引入大型 dependency 的理由

1. 项目阶段目标为 K19 收尾，K19-FIX-C 是 E2E readiness 阶段而非实施阶段。
2. 引入 Playwright 需要 4 个步骤（install、chromium download、config 编写、test 编写），超出本阶段范围。
3. 真实浏览器 E2E 收益与成本不匹配（项目无 CI、无 nightly E2E、本地浏览器手动验收已覆盖 happy path）。
4. K19-FIX-B2 verify 16 个 regression case 已覆盖所有 helper 行为。
5. 真实浏览器端 import flow 的人工验收已在 K19-FIX-B2 阶段覆盖（warning 显示、checkbox 交互、reason 校验、confirm 按钮 gating）。

### 3.4 推荐后续阶段引入

下一阶段可考虑：

- `K19-FIX-D-IMPORT-APPROVAL-BROWSER-E2E-EXEC`：实施 Playwright + 9 个 test case（见 §6）
- 引入 `@playwright/test` + `playwright.config.ts` + `tests/e2e/import-cross-cohort-approval.spec.ts`
- 使用 `page.route()` 拦截 /api/admin/import/parse + /api/admin/import/confirm
- 不写 DB（route mock + fixture response）

---

## 4. Test Strategy

### 4.1 本阶段策略

| Aspect | Approach |
|---|---|
| 是否执行真实浏览器 E2E | **否**（no Playwright configured） |
| 是否写 DB | **否** |
| 是否 re-import 历史文件 | **否** |
| 是否修改 schema / migration / importer core | **否** |
| 是否修改 confirm API backend gate | **否** |
| 是否修改 parser / solver / RBAC | **否** |
| 是否新增 data-testid | **是**（仅 schedule-import-dialog.tsx，已 commit 在 K19-FIX-B2-AUDIT-ALIGNMENT 中） |
| 是否新增 test 基础设施 | **是**（readiness audit script + verify script） |

### 4.2 已新增的 data-testid 选择器

`src/components/schedule-import-dialog.tsx` 已稳定 9 个 data-testid（K19-FIX-B2-AUDIT-ALIGNMENT 阶段 commit `0720cd0` 中）：

| data-testid | Purpose |
|---|---|
| `cross-cohort-warning-panel` | LIKELY_ERROR warning 红色区域 |
| `cross-cohort-approval-checkbox` | 每个 suspicious task 的 approval checkbox |
| `cross-cohort-approval-reason` | 每个 suspicious task 的 reason textarea |
| `cross-cohort-reason-hint` | reason 字符数提示（绿/红） |
| `cross-cohort-approval-message` | validation 失败消息 |
| `cross-cohort-blocking-message` | confirm disabled 原因 |
| `cross-cohort-legal-public-info` | LEGAL_PUBLIC 蓝色信息 |
| `import-confirm-button` | 确认导入数据库按钮 |
| `import-confirm-error` | confirm 错误显示 |

**零行为变化**：data-testid 仅添加 testability hooks，不影响 UI 渲染、state、props。

---

## 5. Mocking Strategy

未来 K19-FIX-D 实施真实 Playwright E2E 时采用以下 mock 策略：

### 5.1 /api/admin/import/parse mock

```ts
await page.route('**/api/admin/import/parse', (route) => {
  route.fulfill({
    status: 200,
    contentType: 'application/json',
    body: JSON.stringify({
      success: true,
      batchId: 999,
      stats: { class_count: 5, total_records: 50, teacher_count: 10, room_count: 8 },
      quality: { /* ... */ },
      records: [ /* ... */ ],
    }),
  })
})
```

### 5.2 /api/admin/import/confirm (dryRun) mock

```ts
await page.route('**/api/admin/import/confirm', (route, request) => {
  const body = JSON.parse(request.postData() ?? '{}')
  if (body.dryRun) {
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        success: true,
        dryRun: true,
        plan: {
          canImport: false,
          warnings: [
            'LIKELY_ERROR_CROSS_COHORT: ... (taskKey=机械制图|赵春超|ALL|1|16)',
          ],
        },
      }),
    })
  }
})
```

### 5.3 /api/admin/import/confirm (real) mock

```ts
await page.route('**/api/admin/import/confirm', (route, request) => {
  const body = JSON.parse(request.postData() ?? '{}')
  // Assert payload contains crossCohortApprovals
  expect(body.crossCohortApprovals).toBeDefined()
  expect(body.crossCohortApprovals[0].taskKey).toBe('机械制图|赵春超|ALL|1|16')
  expect(body.crossCohortApprovals[0].approved).toBe(true)
  expect(body.crossCohortApprovals[0].reason.length).toBeGreaterThanOrEqual(5)

  route.fulfill({
    status: 200,
    contentType: 'application/json',
    body: JSON.stringify({ success: true, dryRun: false, result: { /* ... */ } }),
  })
})
```

### 5.4 409 approval error mock

```ts
await page.route('**/api/admin/import/confirm', (route) => {
  route.fulfill({
    status: 409,
    contentType: 'application/json',
    body: JSON.stringify({
      success: false,
      error: 'CROSS_COHORT_APPROVAL_REQUIRED',
      details: 'Missing approval for taskKey=机械制图|赵春超|ALL|1|16',
    }),
  })
})
```

### 5.5 不写 DB

所有测试通过 `page.route()` 拦截所有后端 API 调用，从不真实写入 `prisma/dev.db`。无需 backup、无需 `prisma db push`、无需 reset。

---

## 6. Test Cases

未来 K19-FIX-D 阶段将实施的 9 个 Playwright test case：

| ID | Case | Selector | Strategy |
|---|---|---|---|
| TC-1 | LIKELY_ERROR warning panel visible | `[data-testid="cross-cohort-warning-panel"]` | 注入 mock dry-run 响应包含 `LIKELY_ERROR_CROSS_COHORT`；断言 panel 可见 |
| TC-2 | Confirm disabled when unchecked | `[data-testid="import-confirm-button"]:disabled` | LIKELY_ERROR 存在且无 checkbox checked；断言 button disabled |
| TC-3 | Confirm disabled when reason < 5 | `[data-testid="import-confirm-button"]:disabled` | Checkbox checked；reason 输入 "abc"（3 chars）；断言仍 disabled |
| TC-4 | Confirm enabled when reason >= 5 | `[data-testid="import-confirm-button"]:not([disabled])` | Checkbox checked；reason 输入 "abcde"（5 chars）；断言 enabled |
| TC-5 | Reason hint green when >= 5 | `[data-testid="cross-cohort-reason-hint"]` | 输入 "abcde"；断言 hint 文本包含 "✓ 原因已填写" |
| TC-6 | Payload contains crossCohortApprovals | network request to /api/admin/import/confirm | 拦截 POST；断言 `body.crossCohortApprovals[0].taskKey` 与 `.reason` 存在 |
| TC-7 | 409 CROSS_COHORT_APPROVAL_REQUIRED shows Chinese error | `[data-testid="import-confirm-error"]` | Mock 409 + `CROSS_COHORT_APPROVAL_REQUIRED`；断言错误文本含 "未确认的跨年级合班" |
| TC-8 | 409 REASON_REQUIRED shows Chinese error | `[data-testid="import-confirm-error"]` | Mock 409 + `REASON_REQUIRED`；断言错误文本含 "审批原因不完整" |
| TC-9 | LEGAL_PUBLIC info panel visible | `[data-testid="cross-cohort-legal-public-info"]` | 仅注入 `LEGAL_PUBLIC_CROSS_COHORT`；断言蓝色 info panel 可见 |

---

## 7. Selectors / Testability

### 7.1 当前 dialog 中已稳定的 data-testid

| Selector | Purpose | Used in TC |
|---|---|---|
| `data-testid="cross-cohort-warning-panel"` | 红色 LIKELY_ERROR 容器 | TC-1 |
| `data-testid="cross-cohort-approval-checkbox"` | per-task checkbox | TC-2, TC-3, TC-4 |
| `data-testid="cross-cohort-approval-reason"` | per-task reason textarea | TC-3, TC-4, TC-5 |
| `data-testid="cross-cohort-reason-hint"` | 字符数提示 | TC-5 |
| `data-testid="cross-cohort-approval-message"` | validation 消息 | TC-2, TC-3 |
| `data-testid="cross-cohort-blocking-message"` | confirm disabled 原因 | TC-2, TC-3 |
| `data-testid="cross-cohort-legal-public-info"` | LEGAL_PUBLIC 蓝色 info | TC-9 |
| `data-testid="import-confirm-button"` | confirm 按钮 | TC-2, TC-3, TC-4 |
| `data-testid="import-confirm-error"` | 错误显示 | TC-7, TC-8 |

### 7.2 未来可能新增的 selectors

为保持 K19-FIX-C 范围最小，本阶段不新增 selector。未来 K19-FIX-D 实施 Playwright 时如发现仍缺，可补充：

- `data-testid="import-file-input"` — file input
- `data-testid="parse-button"` — 解析按钮
- `data-testid="dry-run-button"` — Dry Run 按钮
- `data-testid="confirm-dialog-confirm"` — 二次确认弹窗的"确认导入"按钮
- `data-testid="confirm-dialog-cancel"` — 二次确认弹窗的"取消"按钮

### 7.3 Testability 原则

- data-testid 仅添加 testability hooks
- 不影响 UI 渲染、state、props、accessibility
- 不影响 production bundle size（React 不会 strip data-* 属性，但浏览器渲染性能影响可忽略）
- K19-FIX-B2-AUDIT-ALIGNMENT commit 验证 0 lint 增加、0 functional change

---

## 8. Implemented Tests or Readiness Result

### 8.1 本阶段实施内容

| Item | Status |
|---|---|
| `scripts/verify-import-approval-browser-e2e-readiness-k19-fix-c.ts` | **新增** — 9 个 readiness check + 9 个 test case plan + selectors summary |
| `scripts/verify-import-approval-browser-e2e-k19-fix-c.ts` | **新增** — 10 个静态验证 check（PASS/FAIL/SKIP） |
| `docs/k19-import-approval-browser-e2e-fix-c.md` | **新增** — 本文档 |
| `data-testid` 属性（9 个） | 已在 K19-FIX-B2-AUDIT-ALIGNMENT (commit `0720cd0`) 中添加 |
| 真实浏览器 E2E | **未实施**（无 Playwright） |

### 8.2 验证结果

| Script | Result |
|---|---|
| `verify-import-approval-browser-e2e-k19-fix-c` | **PASS** (10 PASS / 0 FAIL / 0 SKIP) |
| `verify-import-approval-browser-e2e-readiness-k19-fix-c` | 9 PASS / 0 FAIL / 0 SKIP (内部 check) |

---

## 9. Verification Results

| Script / Command | Result |
|---|---|
| `verify-import-approval-browser-e2e-k19-fix-c` | 10 PASS / 0 FAIL / 0 SKIP |
| `verify-import-cross-cohort-approval-ui-k19-fix-b2` | 16 PASS / 0 FAIL |
| `verify-import-cross-cohort-approval-k19-fix-b1` | 17 PASS / 0 FAIL |
| `verify-import-matching-cohort-guard-k19-fix-a` | 31 PASS / 0 FAIL |
| `audit-import-cross-cohort-persistent-flag-k19-fix-b` | HIGH=0 / MEDIUM=0 / LOW=0 / INFO=3 / NONE=10 / BLOCKING=0 |
| `audit-import-matching-root-cause-k19` | HIGH=0 |
| `validate-task37-finalization-k18-e3` | 18 PASS / 0 FAIL |
| `audit-data-quality-classgroup-matching-k17-fix-a` | HIGH=0 |
| `audit-remaining-risk-backlog-k17` | No BLOCKING |
| `audit-schedule-mutation-server-guards` | HIGH=0 / MEDIUM=0 |
| `audit-teaching-task-mutation-semantic-guards` | HIGH=0 / MEDIUM=0 |
| `verify-schedule-mutation-client-preflight-fix` | 23 PASS / 0 FAIL |
| `prisma validate` | ✓ valid |
| `build` | ✓ Compiled successfully |
| `lint` | baseline 312 problems（无新增） |
| `test:auth-foundation` | 53 passed / 1 failed (pre-existing) |
| `playwright / e2e` | **未配置** (Situation B) |

---

## 10. Out of Scope

- **真实 Playwright E2E 实施**：本阶段为 readiness，仅规划 9 个 test case + 5 个未来 selector，未实际执行。
- **Schema / migration**：不修改。
- **Importer core validation**：不修改。
- **Confirm API backend gate**：不修改（B1 已完成）。
- **Parser**：不修改。
- **Solver**：不修改。
- **RBAC / permissions**：不修改。
- **Re-import 历史文件**：不执行。
- **业务数据写入 / 读取**：本阶段无任何 prisma client 调用。
- **Source evidence traceability**：仍待后续阶段。
- **ImportApproval 独立 model**：仍不做。

---

## 11. Remaining Risks

| Risk | Status | Mitigation |
|---|---|---|
| 真实浏览器 E2E 缺失 | **Accepted (K19-FIX-C scope)** | K19-FIX-D 阶段实施 Playwright；9 个 test case 已规划 |
| 人工浏览器验收 | **已覆盖** (K19-FIX-B2 阶段) | warning 显示 / checkbox 交互 / reason 校验 / confirm gating 全部已人工验收 |
| Source evidence traceability | **Deferred** | TeachingTaskClass 仍无 source row / keyword |
| data-testid 缺失（import 流程其他元素） | **Deferred** | K19-FIX-D 阶段可补充 file input / parse button / dry-run button / 二次确认 dialog 的 testid |
| Lint baseline 312 problems | **Pre-existing** | 不在本阶段范围 |
| test:auth-foundation 1 failed | **Pre-existing** (ScheduleAdjustment ACTIVE count mismatch) | 不在本阶段范围，未修改业务数据 |

---

## 12. Suggested Next Stage

### 12.1 推荐选项

**Option 1（推荐）：K19-FIX-D-IMPORT-APPROVAL-BROWSER-E2E-EXEC**

- 引入 `@playwright/test` dependency
- 创建 `playwright.config.ts` (baseURL=http://localhost:3000)
- 创建 `tests/e2e/import-cross-cohort-approval.spec.ts` 包含 9 个 test case
- 使用 `page.route()` mock 所有 API 调用，**不写 DB**
- 实施后所有 K19 fix 阶段均通过真实浏览器端验收

**Option 2（保守）：保持当前 readiness audit 状态**

- 接受 K19-FIX-C 作为 readiness stage 关闭
- 真实 E2E 推迟到其他 stage
- 风险：未来 cross-cohort UI 改动无 browser regression 覆盖

### 12.2 范围建议（Option 1）

| File | Purpose |
|---|---|
| `playwright.config.ts` | Playwright 配置（baseURL, web server, browsers） |
| `tests/e2e/import-cross-cohort-approval.spec.ts` | 9 个 test case |
| `package.json` scripts | `"test:e2e": "playwright test"` |
| `docs/k19-import-approval-browser-e2e-fix-d.md` | 实施文档 |

### 12.3 强约束（沿用 K19-FIX-C）

- 不修改 schema / migration / importer core / confirm API gate / parser / solver / RBAC
- 不写 DB（page.route mock only）
- 不 re-import 历史文件
- 不修改业务数据

### 12.4 K19 主线关闭建议

K19-FIX-C 完成后：

- K19 import approval 主线可关闭
- 真实 E2E 推迟到 K19-FIX-D 或下个 sprint
- 整体风险：Source evidence traceability 仍 deferred（与 K19 无关，长期 backlog）

---

## 13. References

- K19-FIX-B1: `docs/k19-import-cross-cohort-approval-fix-b1.md` (commit `6bc87bb`)
- K19-FIX-B2: `docs/k19-import-cross-cohort-approval-ui-fix-b2.md`
- K19-FIX-B2-AUDIT-ALIGNMENT: commit `0720cd0`
- Helper module: `src/lib/import/cross-cohort-approval-ui.ts`
- Component: `src/components/schedule-import-dialog.tsx`
- API: `src/app/api/admin/import/confirm/route.ts`
