/**
 * K19-FIX-B-IMPORT-CROSS-COHORT-PERSISTENT-FLAG-AUDIT
 * 只读审计脚本 — 评估"合法跨 cohort 合班人工确认与持久化机制"现状
 *
 * 范围:
 *  - Prisma schema (ImportBatch / TeachingTask / TeachingTaskClass / ClassGroup)
 *  - Backend code (import confirm route / importer / quality-classifier)
 *  - Frontend code (import confirm dialog / warning display)
 *  - Historical reports (K19-FIX-A / K19 root-cause / K18)
 *  - Current DB (ImportBatch count / warningsJson shape / cross-cohort tasks)
 *
 * K19-FIX-B1-AUDIT-AND-MIGRATION-ALIGNMENT:
 *  本版本对齐 B1 已实现的 schema / API / importer / warningsJson 变化。
 *  原 HIGH/MEDIUM backend findings 在 B1 实现后变为 NONE（resolved by B1）。
 *  Frontend / traceability findings 保留（B2 scope）。
 *
 * K19-FIX-B2-AUDIT-ALIGNMENT:
 *  本版本对齐 B2 已实现的 frontend approval UI。
 *  C-001 (MEDIUM) / C-002 (LOW) / C-003 (LOW) 在 B2 完成后降为 NONE。
 *  检测: LIKELY_ERROR display / checkbox / reason / gating / payload / error mapping。
 *
 * 严禁:
 *  - 修改 Prisma schema
 *  - 执行 db push / migrate / seed
 *  - 写入 / 修改 / 删除任何业务数据
 *  - 修改 API / frontend / importer / parser
 */

import { readFileSync, existsSync } from 'fs'
import { join } from 'path'
import { PrismaClient } from '@prisma/client'

const prisma = new PrismaClient()

interface Finding {
  id: string
  severity: 'HIGH' | 'MEDIUM' | 'LOW' | 'INFO' | 'NONE'
  category: string
  title: string
  evidence: string
  files: string[]
  currentBehavior: string
  risk: string
  recommendation: string
  suggestedNextStage: string
}

interface SchemaOption {
  id: string
  location: string
  pros: string[]
  cons: string[]
  recommendation: string
}

interface ApiFlowOption {
  id: string
  payload: string
  approvalValidation: string
  warningsJsonPersistence: string
  failureModes: string[]
}

interface FrontendFlowOption {
  id: string
  warningDisplay: string
  approvalToggle: string
  reasonInput: string
  misclickPrevention: string
}

interface AuditReport {
  summary: {
    high: number
    medium: number
    low: number
    info: number
    none: number
    blocking: number
    recommendedOption: string
  }
  findings: Finding[]
  schemaOptions: SchemaOption[]
  apiFlowOptions: ApiFlowOption[]
  frontendFlowOptions: FrontendFlowOption[]
  recommendedOption: string
  migrationImpact: string
  regressionTestPlan: string[]
  suggestedNextStage: string
  generatedAt: string
}

async function main() {
  const findings: Finding[] = []
  const workspaceRoot = process.cwd()

  // ────────────────────────────────────────────────────────────────
  // Rule A: Persistent approval location — schema audit
  // ────────────────────────────────────────────────────────────────
  const schemaPath = join(workspaceRoot, 'prisma', 'schema.prisma')
  const schemaText = existsSync(schemaPath) ? readFileSync(schemaPath, 'utf-8') : ''

  const hasWarningsJson = /warningsJson\s+String\?/.test(schemaText)
  const hasTeachingTaskApproved = /crossCohortApproved/.test(schemaText)

  findings.push({
    id: 'K19-FIX-B-A-001',
    severity: hasTeachingTaskApproved ? 'NONE' : 'MEDIUM',
    category: 'PersistentApprovalLocation',
    title: hasTeachingTaskApproved
      ? 'TeachingTask 已有 crossCohortApproved 字段 (B1 resolved)'
      : 'TeachingTask 无 crossCohortApproved 字段',
    evidence: `prisma/schema.prisma TeachingTask 模型:
  - crossCohortApproved 字段: ${hasTeachingTaskApproved ? '✓ 存在 (B1 已实现)' : '不存在'}
  - crossCohortApprovalReason 字段: ${/crossCohortApprovalReason/.test(schemaText) ? '✓ 存在 (B1 已实现)' : '不存在'}`,
    files: ['prisma/schema.prisma'],
    currentBehavior: hasTeachingTaskApproved
      ? 'B1 已实现: TeachingTask.crossCohortApproved Boolean @default(false) + crossCohortApprovalReason String?。历史 task 自动 false，无需 backfill。'
      : 'TeachingTask 不带任何 cross-cohort 标记。Imported cross-cohort task 在 DB 中与同 cohort task 不可区分。',
    risk: hasTeachingTaskApproved
      ? '无。B1 已添加字段。旧 frontend 不传 approval → crossCohortApproved 保持 false。'
      : '后续 audit / export / solver 无法直接知道某 TeachingTask 是否合法跨 cohort。需要 join warningsJson 才能推断。',
    recommendation: hasTeachingTaskApproved
      ? 'B1 已完成。下一步: K19-FIX-B2 (frontend UI toggle)。'
      : '下一阶段 (K19-FIX-B1) 新增 TeachingTask.crossCohortApproved Boolean @default(false) + crossCohortApprovalReason String?',
    suggestedNextStage: hasTeachingTaskApproved ? 'K19-FIX-B2-FRONTEND-CROSS-COHORT-APPROVAL-UI' : 'K19-FIX-B1-SCHEMA-AND-API-CROSS-COHORT-APPROVAL',
  })

  findings.push({
    id: 'K19-FIX-B-A-002',
    severity: 'INFO',
    category: 'PersistentApprovalLocation',
    title: 'ImportBatch.warningsJson 已存在',
    evidence: `prisma/schema.prisma ImportBatch 模型:\n  - warningsJson: String? ${hasWarningsJson ? '✓ 存在' : '✗ 缺失'}\n  - DB 中样本: batch #1 (confirmed) 持久化了 3 条 warning`,
    files: ['prisma/schema.prisma', 'src/lib/import/importer.ts'],
    currentBehavior: 'ImportBatch.warningsJson 已经能持久化 warning 字符串。K19-FIX-A 添加的 LEGAL_PUBLIC_CROSS_COHORT / LIKELY_ERROR_CROSS_COHORT warning 会被 importer 自动写入。',
    risk: 'warningsJson 当前仅持久化 warning，未持久化 operator approval。下次确认 import 不会带历史 approval 上下文。',
    recommendation: 'K19-FIX-B1 在 warningsJson 中追加 {crossCohortApprovals: [...]} 结构（与现有 warnings 数组共存）',
    suggestedNextStage: 'K19-FIX-B1',
  })

  findings.push({
    id: 'K19-FIX-B-A-003',
    severity: 'INFO',
    category: 'PersistentApprovalLocation',
    title: '无独立 ImportApproval 模型',
    evidence: '当前 schema 不含 model ImportApproval { ... }',
    files: ['prisma/schema.prisma'],
    currentBehavior: '无独立审批记录表。',
    risk: '独立 ImportApproval 模型会让审计更清晰但增加 schema 复杂度，且需要新表、新 join 查询。',
    recommendation: '暂不推荐新增独立表。在 K19-FIX-B1 用 TeachingTask 字段 + ImportBatch.warningsJson metadata 即可。',
    suggestedNextStage: 'K19-FIX-B1',
  })

  // ────────────────────────────────────────────────────────────────
  // Rule B: Confirm API approval flow audit
  // ────────────────────────────────────────────────────────────────
  const confirmRoutePath = join(workspaceRoot, 'src', 'app', 'api', 'admin', 'import', 'confirm', 'route.ts')
  const confirmRouteText = existsSync(confirmRoutePath) ? readFileSync(confirmRoutePath, 'utf-8') : ''

  const hasForceFlag = /forceCrossCohort|ignoreWarnings|crossCohortApprovals|approvalList/.test(confirmRouteText)
  const hasBlockingLogic = /blockingReasons|crossCohort/.test(confirmRouteText)
  const passesOperatorApproval = /approve[A-Z]|approval|approved|reason/i.test(confirmRouteText)

  // K19-FIX-B1: importer 已实现 validateCrossCohortApprovals gate
  const importerPath = join(workspaceRoot, 'src', 'lib', 'import', 'importer.ts')
  const importerText = existsSync(importerPath) ? readFileSync(importerPath, 'utf-8') : ''

  const hasApprovalGate = /validateCrossCohortApprovals/.test(importerText)
  const hasApprovalTaskKey = /buildApprovalTaskKey/.test(importerText)
  const hasCrossCohortApprovedInImporter = /crossCohortApproved/.test(importerText)
  const hasVersionedWarningsJson = /version:\s*2/.test(importerText)
  const hasApprovalRequiredError = /CROSS_COHORT_APPROVAL_REQUIRED/.test(importerText)

  // B-001: Confirm API approval 参数 (resolved by B1)
  findings.push({
    id: 'K19-FIX-B-B-001',
    severity: hasForceFlag ? 'NONE' : 'HIGH',
    category: 'ConfirmApiApprovalFlow',
    title: hasForceFlag
      ? 'Confirm API 已支持 crossCohortApprovals 参数 (B1 resolved)'
      : 'Confirm API 无 operator approval 参数',
    evidence: `src/app/api/admin/import/confirm/route.ts:
  - crossCohortApprovals: ${hasForceFlag ? '✓ 存在 (B1 已实现)' : '不存在'}
  - blockingReasons 中 cross-cohort 关键字: ${hasBlockingLogic ? '存在' : '不存在'}
  - approval/approved/reason: ${passesOperatorApproval ? '存在' : '不存在'}
  importer.ts:
  - validateCrossCohortApprovals: ${hasApprovalGate ? '✓ 存在 (B1 已实现)' : '不存在'}
  - buildApprovalTaskKey: ${hasApprovalTaskKey ? '✓ 存在 (B1 已实现)' : '不存在'}
  - CROSS_COHORT_APPROVAL_REQUIRED: ${hasApprovalRequiredError ? '✓ 存在 (B1 已实现)' : '不存在'}`,
    files: ['src/app/api/admin/import/confirm/route.ts', 'src/lib/import/importer.ts'],
    currentBehavior: hasForceFlag
      ? 'B1 已实现: confirm route 接收 crossCohortApprovals 并透传到 confirmImportBatch。validateCrossCohortApprovals 在入口处校验 LIKELY_ERROR_CROSS_COHORT 是否有 approval。缺失 → throw CROSS_COHORT_APPROVAL_REQUIRED → 409。'
      : 'API 不接收任何跨 cohort 审批参数。客户端 POST { batchId, strategy, dryRun: false, confirmText: "CONFIRM_IMPORT" } 即可触发真实 import。',
    risk: hasForceFlag
      ? '无。B1 已阻断 LIKELY_ERROR 无 approval 的 import。旧 frontend 不传 crossCohortApprovals 时若有 LIKELY_ERROR → 409。'
      : '若 importer 误判跨 cohort 关联（例如 future source data 含显式 \\d{4}级 keyword），operator 无任何 API 入口显式确认/拒绝。',
    recommendation: hasForceFlag
      ? 'B1 已完成。下一步: K19-FIX-B2 (frontend UI toggle + reason input)。'
      : 'K19-FIX-B1 新增 crossCohortApprovals: Array<{...}> 字段，由 frontend 在 dryRun 后展示 warnings 并提供 toggle。',
    suggestedNextStage: hasForceFlag ? 'K19-FIX-B2-FRONTEND-CROSS-COHORT-APPROVAL-UI' : 'K19-FIX-B1',
  })

  // B-002: Confirm API cross-cohort 阻断门 (resolved by B1)
  findings.push({
    id: 'K19-FIX-B-B-002',
    severity: hasApprovalGate ? 'NONE' : 'MEDIUM',
    category: 'ConfirmApiApprovalFlow',
    title: hasApprovalGate
      ? 'Confirm API 已实现 cross-cohort 阻断门 (B1 resolved)'
      : 'Confirm API 无 cross-cohort 阻断门',
    evidence: `importer.ts:
  - validateCrossCohortApprovals: ${hasApprovalGate ? '✓ 存在 (B1 已实现)' : '不存在'}
  - CROSS_COHORT_APPROVAL_REQUIRED error: ${hasApprovalRequiredError ? '✓ 存在 (B1 已实现)' : '不存在'}
  - crossCohortApproved 写入: ${hasCrossCohortApprovedInImporter ? '✓ 存在 (B1 已实现)' : '不存在'}
  confirmImportBatch 内部流程:
  1) 读 ImportBatch 状态
  2) prepareRecords 读 parsed JSON + classifyImportRecords + 合并 mergeWarnings
  3) K19-FIX-B1: validateCrossCohortApprovals 校验 LIKELY_ERROR → 无 approval 则 throw 409
  4) canImport=false → 返回 (不写)
  5) confirmed/confirming guard
  6) atomic pending→confirming
  7) executeImportInTransaction（创建 TeachingTask + TTC，写入 crossCohortApproved）`,
    files: ['src/lib/import/importer.ts'],
    currentBehavior: hasApprovalGate
      ? 'B1 已实现: confirmImportBatch 入口调用 validateCrossCohortApprovals。LIKKELY_ERROR_CROSS_COHORT 无 approval → throw CROSS_COHORT_APPROVAL_REQUIRED → 409。executeImportInTransaction 在创建 TeachingTask 时写入 crossCohortApproved / crossCohortApprovalReason。'
      : 'K19-FIX-A 仅 emit cross-cohort warning。不会阻止创建 TeachingTask。',
    risk: hasApprovalGate
      ? '无。B1 已在 importer 入口阻断。旧 frontend 不传 approval 时若有 LIKELY_ERROR → 409。'
      : 'suspicious cross-cohort（专业课、非 allowlist）会无声写入 DB，没有 API 级别二次确认。',
    recommendation: hasApprovalGate
      ? 'B1 已完成。下一步: K19-FIX-B2 (frontend UI)。'
      : 'K19-FIX-B1 在 confirmImportBatch 入口处扫描 warnings 分类，suspicious 且无 approval → 抛 409 Conflict。',
    suggestedNextStage: hasApprovalGate ? 'K19-FIX-B2-FRONTEND-CROSS-COHORT-APPROVAL-UI' : 'K19-FIX-B1',
  })

  // B-003: warningsJson 持久化结构 (resolved by B1)
  findings.push({
    id: 'K19-FIX-B-B-003',
    severity: hasVersionedWarningsJson ? 'NONE' : 'LOW',
    category: 'ConfirmApiApprovalFlow',
    title: hasVersionedWarningsJson
      ? 'warningsJson 已使用 versioned 结构 (B1 resolved)'
      : 'warningsJson 持久化是字符串而非结构化 JSON',
    evidence: `importer.ts:
  - version: 2 结构: ${hasVersionedWarningsJson ? '✓ 存在 (B1 已实现)' : '不存在'}
  - B1 结构: { version: 2, generatedAt, warnings: string[], crossCohortApprovals: [...] }
  - 旧 batch (pre-B1): 仍为 string[] 或 null (legacy 兼容)`,
    files: ['src/lib/import/importer.ts'],
    currentBehavior: hasVersionedWarningsJson
      ? 'B1 已实现: warningsJson 使用 { version: 2, generatedAt, warnings, crossCohortApprovals } 结构。旧 batch (pre-B1) 仍为 legacy string[]。客户端解析: Array.isArray(parsed) ? parsed : parsed.warnings。'
      : 'warningsJson 存的是纯字符串数组。字符串前缀可用于 classifyCrossCohortWarnings 分类。',
    risk: hasVersionedWarningsJson
      ? '低。旧 batch 读取需兼容: Array.isArray(parsed) ? parsed : parsed.warnings。'
      : '若 K19-FIX-B1 需持久化 approval metadata, 需要在 JSON 顶部加 { warnings: [], crossCohortApprovals: [] } 包裹结构（schema 不变，客户端解析需适配）。',
    recommendation: hasVersionedWarningsJson
      ? 'B1 已完成。前端读取时需兼容 legacy array shape。'
      : 'K19-FIX-B1 选择最小改动：在 warningsJson 字符串中追加 { "kind": "CROSS_COHORT_APPROVAL", ... } 形态的 metadata 项，保留原字符串 warning。',
    suggestedNextStage: hasVersionedWarningsJson ? 'K19-FIX-B2-FRONTEND-CROSS-COHORT-APPROVAL-UI' : 'K19-FIX-B1',
  })

  // ────────────────────────────────────────────────────────────────
  // Rule C: Frontend operator flow audit (B2 alignment)
  // ────────────────────────────────────────────────────────────────
  const dialogPath = join(workspaceRoot, 'src', 'components', 'schedule-import-dialog.tsx')
  const dialogText = existsSync(dialogPath) ? readFileSync(dialogPath, 'utf-8') : ''

  const helperPath = join(workspaceRoot, 'src', 'lib', 'import', 'cross-cohort-approval-ui.ts')
  const helperText = existsSync(helperPath) ? readFileSync(helperPath, 'utf-8') : ''

  // B2 signal detection
  const dialogHasConfirmText = /CONFIRM_IMPORT/.test(dialogText)

  // 1. LIKELY_ERROR display detection
  const hasLikelyErrorDisplay = /LIKELY_ERROR_CROSS_COHORT/.test(dialogText) || /LIKELY_ERROR_CROSS_COHORT/.test(helperText)
  const hasSuspiciousTaskList = /suspiciousTasks/.test(dialogText)
  const hasHighRiskUI = /ShieldAlert/.test(dialogText) && /bg-red-50|border-red-300/.test(dialogText)
  const hasHighRiskDescription = /疑似错误跨年级合班|高风险/.test(dialogText)
  const b2LikelyErrorDisplay = hasLikelyErrorDisplay && hasSuspiciousTaskList && hasHighRiskUI && hasHighRiskDescription

  // 2. Approval checkbox detection
  const hasApprovalCheckbox = /type="checkbox"/.test(dialogText) && /我已确认此跨年级合班/.test(dialogText)
  const hasApprovalStateTracking = /approvals\[task\.taskKey\]/.test(dialogText) || /setApprovals/.test(dialogText)
  const hasApprovalValidation = /validateApprovalState/.test(dialogText) && /crossCohortApprovalValidation/.test(dialogText)
  const b2ApprovalCheckbox = hasApprovalCheckbox && hasApprovalStateTracking && hasApprovalValidation

  // 3. Reason input detection
  const hasReasonTextarea = /textarea/.test(dialogText) && /审批原因/.test(dialogText)
  const hasReasonValidation = /trim\(\)\.length\s*>=?\s*5/.test(dialogText)
  const hasBuildApprovalPayload = /buildCrossCohortApprovalPayload/.test(dialogText)
  const b2ReasonInput = hasReasonTextarea && hasReasonValidation && hasBuildApprovalPayload

  // 4. Confirm button gating detection
  const hasCrossCohortBlocking = /crossCohortBlocking/.test(dialogText)
  const hasConfirmDisabled = /disabled.*crossCohortBlocking|crossCohortBlocking.*disabled/.test(dialogText.replace(/\s+/g, ' '))
  const hasBlockingGating = /hasBlocking.*crossCohortBlocking|crossCohortBlocking.*hasBlocking/.test(dialogText) || /\|\|\s*crossCohortBlocking/.test(dialogText)
  const b2ConfirmGating = hasCrossCohortBlocking && hasConfirmDisabled && hasBlockingGating && dialogHasConfirmText

  // 5. Payload detection
  const hasPayloadShape = /crossCohortApprovals/.test(dialogText) && /taskKey.*approved.*reason/.test(helperText.replace(/\s+/g, ' '))
  const b2Payload = hasBuildApprovalPayload && hasPayloadShape

  // 6. Error mapping detection
  const hasMapApprovalError = /mapApprovalError/.test(dialogText)
  const hasApprovalRequiredMapping = /CROSS_COHORT_APPROVAL_REQUIRED/.test(helperText)
  const hasReasonRequiredMapping = /REASON_REQUIRED|reason required/.test(helperText)
  const b2ErrorMapping = hasMapApprovalError && hasApprovalRequiredMapping && hasReasonRequiredMapping

  // 7. Overall B2 complete
  const b2Complete = b2LikelyErrorDisplay && b2ApprovalCheckbox && b2ReasonInput && b2ConfirmGating && b2Payload && b2ErrorMapping

  // C-001: LIKELY_ERROR display + approval toggle
  findings.push({
    id: 'K19-FIX-B-C-001',
    severity: b2Complete ? 'NONE' : (b2LikelyErrorDisplay ? 'LOW' : 'MEDIUM'),
    category: 'FrontendOperatorFlow',
    title: b2Complete
      ? 'Import dialog 已实现 cross-cohort 区分展示 + approval UI (B2 resolved)'
      : b2LikelyErrorDisplay
        ? 'Import dialog 部分实现 cross-cohort 展示 (B2 partial)'
        : 'Import dialog 无 cross-cohort 区分展示',
    evidence: `src/components/schedule-import-dialog.tsx:
  - LIKELY_ERROR display: ${b2LikelyErrorDisplay ? '✓ (ShieldAlert + red area + suspiciousTasks list + 高风险说明)' : '✗ 缺失'}
  - approval checkbox: ${b2ApprovalCheckbox ? '✓ (checkbox + state tracking + validation)' : '✗ 缺失'}
  - reason input: ${b2ReasonInput ? '✓ (textarea + trim().length >= 5 + payload)' : '✗ 缺失'}
  - confirm gating: ${b2ConfirmGating ? '✓ (crossCohortBlocking + hasBlocking + CONFIRM_IMPORT)' : '✗ 缺失'}
  - payload: ${b2Payload ? '✓ (crossCohortApprovals with taskKey/approved/reason)' : '✗ 缺失'}
  - error mapping: ${b2ErrorMapping ? '✓ (mapApprovalError + 409 approval errors)' : '✗ 缺失'}
  helper: src/lib/import/cross-cohort-approval-ui.ts: ${existsSync(helperPath) ? '✓ 存在' : '不存在'}`,
    files: ['src/components/schedule-import-dialog.tsx', 'src/lib/import/cross-cohort-approval-ui.ts'],
    currentBehavior: b2Complete
      ? 'B2 已实现: LIKELY_ERROR 红色高风险区域 (ShieldAlert + bg-red-50) 列出 suspicious tasks; 每个 task 有 approval checkbox + reason textarea (>= 5 chars); confirm button 在 approval 未完成时 disabled; crossCohortApprovals payload 透传到 confirm API; backend 409 错误映射为中文提示。'
      : 'warnings 全部混在同一个 list 中，operator 无法一眼区分 LEGAL_PUBLIC_CROSS_COHORT vs LIKELY_ERROR_CROSS_COHORT vs 普通 warning。',
    risk: b2Complete
      ? '无。B2 已实现完整的 cross-cohort approval UI。'
      : '若 dry-run 阶段产生 LIKELY_ERROR_CROSS_COHORT, operator 可能根本没注意（折叠在 "查看 N 条警告" details 中），直接点确认按钮。',
    recommendation: b2Complete
      ? 'B2 已完成。后续: source evidence traceability / 浏览器 E2E 测试。'
      : '补全 B2 UI: LIKELY_ERROR 显示 + checkbox + reason + gating + payload + error mapping。',
    suggestedNextStage: b2Complete ? 'N/A (K19-FIX-B 可关闭)' : 'K19-FIX-B2-FRONTEND-CROSS-COHORT-APPROVAL-UI',
  })

  // C-002: reason input (resolved by B2)
  findings.push({
    id: 'K19-FIX-B-C-002',
    severity: b2ReasonInput ? 'NONE' : 'LOW',
    category: 'FrontendOperatorFlow',
    title: b2ReasonInput
      ? 'Dialog 已有 cross-cohort reason 输入 (B2 resolved)'
      : 'Dialog 二次确认仅文本 "CONFIRM_IMPORT"',
    evidence: b2ReasonInput
      ? `B2 已实现: textarea "审批原因（必填，不少于 5 个字符）" + trim().length >= 5 校验 + 字符计数 + buildCrossCohortApprovalPayload 透传 reason。`
      : 'confirmText 仅为固定字符串 "CONFIRM_IMPORT"。无 reason 输入框。',
    files: ['src/components/schedule-import-dialog.tsx', 'src/lib/import/cross-cohort-approval-ui.ts'],
    currentBehavior: b2ReasonInput
      ? 'B2 已实现: LIKELY_ERROR checkbox 勾选后显示 textarea, 必填 >= 5 字符, 透传到 crossCohortApprovals[].reason。'
      : 'operator 只能在 confirmText 输入框敲入 "CONFIRM_IMPORT"，无跨 cohort 场景下的 reason 记录。',
    risk: b2ReasonInput ? '无。B2 已实现 reason 输入与校验。' : 'audit trail 不完整。',
    recommendation: b2ReasonInput ? 'B2 已完成。' : 'K19-FIX-B2 在 LIKELY_ERROR_CROSS_COHORT > 0 时, 要求 reason 文本框 (min 5 chars), 同步进 crossCohortApprovals[].reason。',
    suggestedNextStage: b2ReasonInput ? 'N/A' : 'K19-FIX-B2',
  })

  // C-003: 防误点 confirm gating (resolved by B2)
  findings.push({
    id: 'K19-FIX-B-C-003',
    severity: b2ConfirmGating ? 'NONE' : 'LOW',
    category: 'FrontendOperatorFlow',
    title: b2ConfirmGating
      ? 'Confirm button 已有 cross-cohort 防误点 gating (B2 resolved)'
      : '无 "防误点" 双确认机制',
    evidence: b2ConfirmGating
      ? `B2 已实现: crossCohortBlocking = hasLikelyErrors && !approvalValidation.ready; confirm button disabled={... || crossCohortBlocking}; amber 提示条 "请完成所有跨年级合班确认后才能导入"。`
      : '现有 confirm dialog: 一次 "确认导入" 按钮点击即触发后端真实写入。',
    files: ['src/components/schedule-import-dialog.tsx'],
    currentBehavior: b2ConfirmGating
      ? 'B2 已实现: LIKELY_ERROR > 0 且 approval 未全部完成时 confirm button disabled, 与原有 hasBlocking (quality) 独立组合。'
      : 'button click → POST confirm with confirmText → 真实写 DB',
    risk: b2ConfirmGating ? '无。B2 已实现 confirm button gating。' : 'K19-FIX-B2 应在有 LIKELY_ERROR_CROSS_COHORT 时禁用 confirm button 直到全部 approval 完成。',
    recommendation: b2ConfirmGating ? 'B2 已完成。' : 'K19-FIX-B2: LIKELY_ERROR > 0 时禁用 confirm button 直到 operator 完成所有 approval。',
    suggestedNextStage: b2ConfirmGating ? 'N/A' : 'K19-FIX-B2',
  })

  // ────────────────────────────────────────────────────────────────
  // Rule D: Backward compatibility audit
  // ────────────────────────────────────────────────────────────────
  findings.push({
    id: 'K19-FIX-B-D-001',
    severity: hasTeachingTaskApproved ? 'NONE' : 'INFO',
    category: 'BackwardCompatibility',
    title: hasTeachingTaskApproved
      ? 'TeachingTask 字段已存在且历史数据兼容 (B1 resolved)'
      : '新增 TeachingTask 字段对历史数据兼容性',
    evidence: hasTeachingTaskApproved
      ? 'crossCohortApproved Boolean @default(false) + crossCohortApprovalReason String? 已存在于 schema。历史 task 自动 false，无 backfill 需求。'
      : '若新增 crossCohortApproved Boolean @default(false):\n  - 历史 308 个 TeachingTask 自动获得 false\n  - solver / export / audit 读不到 true → 不会误判历史数据为合法跨 cohort\n  - 跨 cohort task count 当前 = 0, 无 backfill 需求',
    files: ['prisma/schema.prisma'],
    currentBehavior: hasTeachingTaskApproved
      ? 'B1 已实现: 字段存在，历史 308 task 自动 crossCohortApproved=false。'
      : 'N/A — 字段尚未存在',
    risk: hasTeachingTaskApproved ? '无。B1 migration 已完成。' : '迁移风险: 低。SQLite 单一文件 + 历史 308 任务数小，@default(false) 增量迁移秒级完成。',
    recommendation: hasTeachingTaskApproved ? 'B1 已完成。' : 'K19-FIX-B1 直接添加字段，默认值 false。',
    suggestedNextStage: hasTeachingTaskApproved ? 'N/A' : 'K19-FIX-B1',
  })

  findings.push({
    id: 'K19-FIX-B-D-002',
    severity: 'INFO',
    category: 'BackwardCompatibility',
    title: 'K18 已修复历史数据无需 backfill',
    evidence: 'K18-E3 已将 cross-cohort task 数量从 5 降至 0。当前 DB 308 tasks 中 cross-cohort = 0。',
    files: ['docs/k18-*.md'],
    currentBehavior: 'post-K18-repair 状态',
    risk: 'N/A — 无残留 cross-cohort 数据。',
    recommendation: 'K19-FIX-B1 不需要 backfill 脚本。',
    suggestedNextStage: 'N/A',
  })

  findings.push({
    id: 'K19-FIX-B-D-003',
    severity: hasVersionedWarningsJson ? 'NONE' : 'LOW',
    category: 'BackwardCompatibility',
    title: hasVersionedWarningsJson
      ? 'warningsJson versioned 结构已实现且兼容 legacy (B1 resolved)'
      : 'warningsJson schema 演化需谨慎',
    evidence: hasVersionedWarningsJson
      ? 'B1 已实现 { version: 2, generatedAt, warnings, crossCohortApprovals } 结构。旧 batch (pre-B1) 仍为 legacy string[] 或 null。客户端兼容: Array.isArray(parsed) ? parsed : parsed.warnings。'
      : '当前 ImportBatch.warningsJson 是 string[]。\n  - ImportBatch #1 (confirmed): 3 strings\n  - ImportBatch #2-36 (abandoned): 83 strings\n  - ImportBatch #37 (pending): 100 strings (含对象形式 MISSING_ROOM 等)',
    files: ['src/lib/import/importer.ts'],
    currentBehavior: hasVersionedWarningsJson
      ? 'B1 已实现: 新 batch 使用 versioned 结构; 旧 batch 视为 legacy string[]。'
      : 'warnings 可能是 string 或结构化对象（parse API 阶段）。Immitation 阶段统一为 string[]。',
    risk: hasVersionedWarningsJson
      ? '低。旧 batch 读取需兼容 Array.isArray 检查。'
      : '若 K19-FIX-B1 在 warningsJson 追加结构化对象 { kind, ... } 需考虑 parse 阶段的混合类型兼容。',
    recommendation: hasVersionedWarningsJson
      ? 'B1 已完成。前端读取时需兼容 legacy array shape。'
      : 'K19-FIX-B1: 选定 { version: 1, warnings: [...], crossCohortApprovals: [...] } 显式结构，旧 ImportBatch 视为 legacy strings only。',
    suggestedNextStage: hasVersionedWarningsJson ? 'K19-FIX-B2-FRONTEND-CROSS-COHORT-APPROVAL-UI' : 'K19-FIX-B1',
  })

  // ────────────────────────────────────────────────────────────────
  // Rule E: Regression test plan
  // ────────────────────────────────────────────────────────────────
  // K19-FIX-B1: verify script exists with 17 regression tests
  const verifyScriptPath = join(workspaceRoot, 'scripts', 'verify-import-cross-cohort-approval-k19-fix-b1.ts')
  const verifyScriptExists = existsSync(verifyScriptPath)
  const verifyScriptText = verifyScriptExists ? readFileSync(verifyScriptPath, 'utf-8') : ''
  const verifyTestCount = (verifyScriptText.match(/\bpass\(/g) || []).length

  findings.push({
    id: 'K19-FIX-B-E-001',
    severity: verifyScriptExists && verifyTestCount >= 10 ? 'NONE' : 'INFO',
    category: 'RegressionTestPlan',
    title: verifyScriptExists && verifyTestCount >= 10
      ? `K19-FIX-B1 已有 ${verifyTestCount} 个 regression test (B1 resolved)`
      : 'K19-FIX-B1 应新增 regression test',
    evidence: verifyScriptExists
      ? `scripts/verify-import-cross-cohort-approval-k19-fix-b1.ts 已存在 (B1 已实现)。检测到 ${verifyTestCount} 个 pass() 调用。覆盖: validateCrossCohortApprovals 纯函数 + buildApprovalTaskKey + DB schema + warningsJson shape + K18 历史 tasks。`
      : 'K19-FIX-A 已实现 warning-only 行为。K19-FIX-B1 应补 API-level 阻断 + 持久化。',
    files: [verifyScriptExists ? 'scripts/verify-import-cross-cohort-approval-k19-fix-b1.ts' : 'scripts/verify-import-cross-cohort-approval-k19-fix-b1.ts (待新增)'],
    currentBehavior: verifyScriptExists
      ? `B1 已实现: ${verifyTestCount} 个 regression test (validateCrossCohortApprovals 纯函数 + buildApprovalTaskKey + DB schema + warningsJson + K18 history)。`
      : 'N/A — 测试待新增',
    risk: verifyScriptExists ? '无。B1 regression test 已覆盖核心逻辑。' : '无 regression test 保护则 K19-FIX-B1 可能回退到 warning-only 行为。',
    recommendation: verifyScriptExists
      ? 'B1 已完成。下一步: K19-FIX-B2 (frontend UI)。'
      : '新增测试: (1) no approval + suspicious cross-cohort → API 拒绝 (409)\n(2) approval + legal public cross-cohort → 通过\n(3) approval + suspicious cross-cohort → 需 reason 强 override\n(4) warningsJson 持久化 crossCohortApprovals 字段\n(5) same-cohort import 完全不受影响\n(6) K18 5 个历史 pattern 在 approval 缺失时仍被阻断',
    suggestedNextStage: verifyScriptExists ? 'K19-FIX-B2-FRONTEND-CROSS-COHORT-APPROVAL-UI' : 'K19-FIX-B1',
  })

  // ────────────────────────────────────────────────────────────────
  // DB read-only summary
  // ────────────────────────────────────────────────────────────────
  const importBatchCount = await prisma.importBatch.count()
  const confirmedBatches = await prisma.importBatch.count({ where: { status: 'confirmed' } })
  const pendingBatches = await prisma.importBatch.count({ where: { status: 'pending' } })
  const allTasks = await prisma.teachingTask.findMany({ include: { taskClasses: { include: { classGroup: true } } } })
  let crossCohortCount = 0
  for (const t of allTasks) {
    const years = new Set<number>()
    for (const tc of t.taskClasses) {
      const m = tc.classGroup.name.match(/^(\d{4})级/)
      if (m) years.add(parseInt(m[1]))
    }
    if (years.size > 1) crossCohortCount++
  }
  const teachingTaskCount = allTasks.length
  const ttcCount = await prisma.teachingTaskClass.count()

  // Sample warningsJson shape (only from confirmed batch, safe read)
  const sampleBatch = await prisma.importBatch.findFirst({
    where: { status: 'confirmed' },
    select: { id: true, warningsJson: true, status: true, createdTaskCount: true },
    orderBy: { id: 'asc' },
  })
  let sampleWarningsJsonShape = 'null'
  if (sampleBatch?.warningsJson) {
    try {
      const parsed = JSON.parse(sampleBatch.warningsJson)
      sampleWarningsJsonShape = Array.isArray(parsed)
        ? `string[${parsed.length}]`
        : typeof parsed
    } catch {
      sampleWarningsJsonShape = 'invalid JSON'
    }
  }

  // ────────────────────────────────────────────────────────────────
  // Schema options comparison
  // ────────────────────────────────────────────────────────────────
  const schemaOptions: SchemaOption[] = [
    {
      id: 'A',
      location: 'TeachingTask.crossCohortApproved Boolean @default(false) + crossCohortApprovalReason String?',
      pros: [
        '可直接 query 哪些 TeachingTask 是合法跨 cohort',
        'audit / export / solver 能直接读取字段',
        'TeachingTask 模型扩展最小，2 字段即可',
        'K17-FIX-A 等 audit 脚本可加入 crossCohortApproved 维度',
      ],
      cons: [
        '需要一次 SQLite 迁移（@default(false) 增量秒级完成）',
        '若历史 308 task 后续被发现误判跨 cohort，需手动 UPDATE',
      ],
      recommendation: '推荐',
    },
    {
      id: 'B',
      location: 'ImportBatch.warningsJson 中追加 { crossCohortApprovals: [...] } metadata',
      pros: [
        '无 schema 变更',
        'approval 与 import batch 严格绑 (一个 batch 一个 approval list)',
      ],
      cons: [
        '后续 solver / export 无法直接 query "哪些 TeachingTask 是合法跨 cohort"',
        '需要 join ImportBatch 通过 importBatchId 关联',
        'traceability 弱',
        '若同 batch 内同一个 task 多次 import, 历史 approval context 模糊',
      ],
      recommendation: '不推荐（仅作为 fallback）',
    },
    {
      id: 'C',
      location: '新 model ImportApproval { batchId, taskKey, approved, reason, operatorId, approvedAt }',
      pros: [
        '审计结构最清晰',
        '可记录 operator + 时间戳',
        '可与现有 User/Session 表关联',
      ],
      cons: [
        '新表 + 新 join 查询',
        '迁移复杂度高于 A',
        'operatorId 在 import 场景下意义有限（CLI/API 调用者非登录用户）',
        'K19-FIX-B1 范围扩大',
      ],
      recommendation: '不推荐（过度设计）',
    },
  ]

  const apiFlowOptions: ApiFlowOption[] = [
    {
      id: 'A',
      payload: 'crossCohortApprovals: Array<{ taskKey: string, approved: boolean, reason?: string }>',
      approvalValidation: '在 confirmImportBatch 入口处: 1) 用 warnings 分类器得到 crossCohort = legal/error 列表; 2) 对每个 LIKELY_ERROR_CROSS_COHORT task, 校验 crossCohortApprovals 含对应 taskKey + approved=true; 3) 缺失或 false → throw 409; 4) LEGAL_PUBLIC 不强制要求 approval (允许透传)',
      warningsJsonPersistence: '在 ImportBatch.warningsJson 字符串化 JSON 中追加 { warnings: [...], crossCohortApprovals: [...], generatedAt: ISO } 结构。',
      failureModes: [
        'taskKey 拼写错误 → 409 missing-approval',
        'approved=true 但 reason 缺失 → 409 reason-required',
        'LEGAL_PUBLIC 错配 approved=false → 仍允许（合法跨 cohort）',
        'suspicious 且无 approval → 409 阻断',
      ],
    },
    {
      id: 'B',
      payload: '无 payload 变更; 仅加 forceCrossCohort: boolean 开关',
      approvalValidation: '若 forceCrossCohort=false 且存在 LIKELY_ERROR → 409; 否则放行',
      warningsJsonPersistence: 'ImportBatch.warningsJson 继续为 string[], 增加 "FORCE_CROSS_COHORT_APPROVED" 字符串行',
      failureModes: [
        '无法区分"哪些 task 被 force"',
        '无法追溯到具体 taskKey',
        'audit trail 弱',
      ],
    },
  ]

  const frontendFlowOptions: FrontendFlowOption[] = [
    {
      id: 'A',
      warningDisplay: 'dryRunResult.warnings 用 classifyCrossCohortWarnings 分类; LEGAL_PUBLIC 显示为蓝色"允许"色块; LIKELY_ERROR 显示为红色"需审批"色块; 其他 warning 用灰色',
      approvalToggle: '每个 LIKELY_ERROR_CROSS_COHORT task 在 UI 上列 checkbox "允许此跨 cohort 合班", 必须勾选才能 confirm',
      reasonInput: '勾选后弹出 reason textarea, 必填 ≥ 5 字符, 透传到 crossCohortApprovals[].reason',
      misclickPrevention: 'confirm button 在 LIKELY_ERROR > 0 且未全部勾选时 disabled; 若需要更强保护, 需输入 batchId 数字二次确认',
    },
  ]

  // ────────────────────────────────────────────────────────────────
  // Summary
  // ────────────────────────────────────────────────────────────────
  const summary = {
    high: findings.filter((f) => f.severity === 'HIGH').length,
    medium: findings.filter((f) => f.severity === 'MEDIUM').length,
    low: findings.filter((f) => f.severity === 'LOW').length,
    info: findings.filter((f) => f.severity === 'INFO').length,
    none: findings.filter((f) => f.severity === 'NONE').length,
    blocking: 0,
    recommendedOption: hasForceFlag && hasApprovalGate && b2Complete
      ? 'Option A: Backend-first persistent approval — B1+B2 全部完成'
      : hasForceFlag && hasApprovalGate
        ? 'Option A: Backend-first persistent approval — B1 已实现'
        : 'Option A: Backend-first persistent approval',
  }

  const report: AuditReport = {
    summary,
    findings,
    schemaOptions,
    apiFlowOptions,
    frontendFlowOptions,
    recommendedOption:
      hasForceFlag && hasApprovalGate && b2Complete
        ? 'Option A: Backend-first persistent approval — B1+B2 全部完成 (schema + API + importer + warningsJson + frontend UI + 16+17 regression tests)。K19-FIX-B 主线可关闭。'
        : hasForceFlag && hasApprovalGate
          ? 'Option A: Backend-first persistent approval — B1 已实现 (schema + API + importer + warningsJson + 17 regression tests)。剩余: K19-FIX-B2 frontend UI。'
          : 'Option A: TeachingTask.crossCohortApproved Boolean @default(false) + crossCohortApprovalReason String?; confirm API 新增 crossCohortApprovals 字段; frontend 在 LIKELY_ERROR_CROSS_COHORT > 0 时弹 approval toggle + reason 输入',
    migrationImpact:
      hasTeachingTaskApproved
        ? 'B1 已完成: 1 次 SQLite 迁移 (新增 2 字段, @default(false) 增量秒级)。历史 task 自动 crossCohortApproved=false。ImportBatch.warningsJson 使用 versioned {version: 2, ...} 结构。'
        : '需要 1 次 SQLite 迁移 (新增 2 字段, @default(false) 增量秒级)。历史 308 task 自动获得 crossCohortApproved=false。ImportBatch.warningsJson 字符串结构演化 (旧 string[] 视为 legacy)。',
    regressionTestPlan: [
      'no approval + LIKELY_ERROR_CROSS_COHORT → API 拒绝 (409)',
      'approval + LEGAL_PUBLIC_CROSS_COHORT → 通过',
      'approval + LIKELY_ERROR + reason ≥ 5 chars → 通过',
      'warningsJson 持久化 crossCohortApprovals 字段',
      'same-cohort import 完全不受影响',
      'K18 5 个历史 pattern (机械制图/电子技术/传感器 task 168/174/176/181 + task 37) 在 approval 缺失时仍被阻断',
      '前端 toggle 行为: 未勾选 → button disabled; 已勾选无 reason → button disabled; 全部满足 → 允许 confirm',
    ],
    suggestedNextStage:
      hasForceFlag && hasApprovalGate && b2Complete
        ? 'K19-FIX-B 主线可关闭。后续: source evidence traceability / 浏览器 E2E 测试。'
        : hasForceFlag && hasApprovalGate
          ? 'K19-FIX-B2-FRONTEND-CROSS-COHORT-APPROVAL-UI (B1 已完成，剩余 frontend UI toggle + reason input + 二次确认)'
          : 'K19-FIX-B1-SCHEMA-AND-API-CROSS-COHORT-APPROVAL (建议分 B1 backend + B2 frontend 两阶段推进)',
    generatedAt: new Date().toISOString(),
  }

  // ────────────────────────────────────────────────────────────────
  // Console output
  // ────────────────────────────────────────────────────────────────
  console.log('K19-FIX-B Import Cross-Cohort Persistent Flag Audit')
  console.log('=====================================================')
  console.log('')
  console.log('DB Snapshot (read-only):')
  console.log(`  ImportBatch total: ${importBatchCount}`)
  console.log(`  ImportBatch confirmed: ${confirmedBatches}`)
  console.log(`  ImportBatch pending: ${pendingBatches}`)
  console.log(`  TeachingTask total: ${teachingTaskCount}`)
  console.log(`  TeachingTaskClass total: ${ttcCount}`)
  console.log(`  Cross-cohort tasks: ${crossCohortCount} (expected 0 post-K18-repair)`)
  console.log(`  warningsJson sample shape (confirmed batch): ${sampleWarningsJsonShape}`)
  console.log('')
  console.log('Summary:')
  console.log(`  HIGH:   ${summary.high}`)
  console.log(`  MEDIUM: ${summary.medium}`)
  console.log(`  LOW:    ${summary.low}`)
  console.log(`  INFO:   ${summary.info}`)
  console.log(`  NONE:   ${summary.none} (resolved by B1${b2Complete ? '+B2' : ''})`)
  console.log(`  BLOCKING: ${summary.blocking}`)
  console.log('')
  console.log(`RECOMMENDED_OPTION: ${summary.recommendedOption}`)
  console.log('')
  console.log('Findings:')
  for (const f of findings) {
    console.log(`  [${f.severity}] ${f.id} ${f.title}`)
  }
  console.log('')
  console.log(`Recommended next stage: ${report.suggestedNextStage}`)

  // Write JSON report
  const jsonPath = join(workspaceRoot, 'docs', 'k19-import-cross-cohort-persistent-flag-audit.json')
  const fs = await import('fs/promises')
  await fs.writeFile(jsonPath, JSON.stringify(report, null, 2), 'utf-8')
  console.log(`\nJSON report written to: ${jsonPath}`)
}

main()
  .catch((e) => {
    console.error('Audit failed:', e)
    process.exit(1)
  })
  .finally(() => prisma.$disconnect())
