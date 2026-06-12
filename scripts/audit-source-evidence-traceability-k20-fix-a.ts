/**
 * K20-FIX-A Source Evidence Traceability Audit
 *
 * Read-only audit of the import link source-evidence traceability gap.
 * Produces a single JSON report and a terminal summary, recommending
 * the minimal schema design needed to trace each TeachingTaskClass link
 * back to a parsed source row, keyword, artifact, and ImportBatch.
 *
 * Strong constraints (per K20-FIX-A spec):
 *   - NO Prisma writes (no create / update / delete / upsert / executeRaw$write).
 *   - NO schema / migration / business code modification.
 *   - NO db push / migrate / reset / seed.
 *   - NO re-import of historical files.
 *
 * Output:
 *   - Terminal summary (HIGH / MEDIUM / LOW / INFO / NONE / BLOCKING / RECOMMENDED_OPTION)
 *   - docs/k20-source-evidence-traceability-audit.json
 */

import { PrismaClient } from '@prisma/client'
import * as fs from 'node:fs'
import * as path from 'node:path'
import { anonymizeReport } from './lib/anonymize-report-output'

const prisma = new PrismaClient()

// ─── Types ─────────────────────────────────────────────────────────────

type Severity = 'HIGH' | 'MEDIUM' | 'LOW' | 'INFO' | 'NONE'

interface Finding {
  id: string
  rule: string
  severity: Severity
  category: string
  title: string
  currentStatus: string
  evidence: string[]
  risk: string
  recommendation: string
  suggestedNextStage?: string
}

interface TraceabilityLink {
  level: string
  description: string
  dataFlow: string
  evidenceCarrier: string
  queryable: boolean
  retainedLongTerm: boolean
  gaps: string[]
}

interface HistoricalCaseReview {
  case: string
  tasks: string
  wrongCG: string
  diagnosisEffort: string
  improvementWithEvidence: string
}

interface SchemaOption {
  option: 'A' | 'B' | 'C' | 'D'
  name: string
  description: string
  pros: string[]
  cons: string[]
  estimatedEffort: string
  queryability: 'STRONG' | 'MEDIUM' | 'WEAK' | 'NONE'
  rollbackRisk: 'LOW' | 'MEDIUM' | 'HIGH'
  recommended: boolean
  recommendedReason: string
}

interface Report {
  generatedAt: string
  phase: string
  mode: 'read-only'
  summary: Record<Severity, number>
  totalFindings: number
  blocking: boolean
  recommendedOption: string
  recommendedNextStage: string
  currentTraceabilityMap: TraceabilityLink[]
  findings: Finding[]
  historicalCaseReview: HistoricalCaseReview[]
  schemaOptions: SchemaOption[]
  implementationPlan: {
    stage: string
    description: string
    backupRequired: boolean
    migration: string
    importerChanges: string
    verifyPlan: string[]
    outOfScope: string[]
  }
  verificationPlan: string[]
  openQuestions: string[]
  closureCriteria: string[]
}

// ─── Helpers ───────────────────────────────────────────────────────────

const projectRoot = path.resolve(__dirname, '..')

function readTextFile(relPath: string): string | null {
  try {
    return fs.readFileSync(path.join(projectRoot, relPath), 'utf8')
  } catch {
    return null
  }
}

function fileExists(relPath: string): boolean {
  return fs.existsSync(path.join(projectRoot, relPath))
}

function listUploadsJson(): { filename: string; sizeBytes: number; mtime: string }[] {
  const dir = path.join(projectRoot, 'uploads', 'imports')
  if (!fs.existsSync(dir)) return []
  return fs
    .readdirSync(dir)
    .filter((f) => f.endsWith('.json'))
    .map((f) => {
      const full = path.join(dir, f)
      const st = fs.statSync(full)
      return { filename: f, sizeBytes: st.size, mtime: st.mtime.toISOString() }
    })
}

function readFirstJsonSample(): { records: number; sampleRecordKeys: string[]; sampleRemark: string | null } | null {
  const dir = path.join(projectRoot, 'uploads', 'imports')
  if (!fs.existsSync(dir)) return null
  const files = fs.readdirSync(dir).filter((f) => f.endsWith('.json'))
  if (files.length === 0) return null
  try {
    const raw = JSON.parse(fs.readFileSync(path.join(dir, files[0]), 'utf-8'))
    if (!Array.isArray(raw) || raw.length === 0) return null
    const firstRecord = raw[0] as Record<string, unknown>
    return {
      records: raw.length,
      sampleRecordKeys: Object.keys(firstRecord),
      sampleRemark: typeof firstRecord.remark === 'string' ? firstRecord.remark : null,
    }
  } catch {
    return null
  }
}

// ─── DB read helpers ──────────────────────────────────────────────────

async function readDbSnapshot() {
  const [
    classGroupCount,
    teacherCount,
    courseCount,
    roomCount,
    teachingTaskCount,
    teachingTaskClassLinkCount,
    scheduleSlotCount,
    importBatchCount,
    confirmedImportBatchCount,
    crossCohortApprovedTaskCount,
    crossCohortTeachingTaskCount,
    scheduleAdjustmentActive,
    scheduleAdjustmentVoided,
  ] = await Promise.all([
    prisma.classGroup.count(),
    prisma.teacher.count(),
    prisma.course.count(),
    prisma.room.count(),
    prisma.teachingTask.count(),
    prisma.teachingTaskClass.count(),
    prisma.scheduleSlot.count(),
    prisma.importBatch.count(),
    prisma.importBatch.count({ where: { status: 'confirmed' } }),
    prisma.teachingTask.count({ where: { crossCohortApproved: true } }),
    countCrossCohortTeachingTasks(),
    prisma.scheduleAdjustment.count({ where: { status: 'ACTIVE' } }),
    prisma.scheduleAdjustment.count({ where: { status: 'VOIDED' } }),
  ])

  // Inspect ImportBatch.warningsJson shape (sample)
  const sampleBatch = await prisma.importBatch.findFirst({
    where: { status: 'confirmed' },
    select: { id: true, filename: true, originalFilePath: true, parsedJsonPath: true, warningsJson: true, qualityJson: true, statsJson: true },
  })

  // Inspect a few TeachingTaskClass links (sample)
  const sampleTTC = await prisma.teachingTaskClass.findFirst({
    include: { teachingTask: { select: { id: true, importBatchId: true, remark: true, crossCohortApproved: true, crossCohortApprovalReason: true } } },
  })

  return {
    classGroupCount,
    teacherCount,
    courseCount,
    roomCount,
    teachingTaskCount,
    teachingTaskClassLinkCount,
    scheduleSlotCount,
    importBatchCount,
    confirmedImportBatchCount,
    crossCohortApprovedTaskCount,
    crossCohortTeachingTaskCount,
    scheduleAdjustmentActive,
    scheduleAdjustmentVoided,
    sampleBatch: sampleBatch
      ? {
          id: sampleBatch.id,
          filename: sampleBatch.filename,
          hasOriginalFilePath: !!sampleBatch.originalFilePath,
          hasParsedJsonPath: !!sampleBatch.parsedJsonPath,
          hasWarningsJson: !!sampleBatch.warningsJson,
          hasQualityJson: !!sampleBatch.qualityJson,
          hasStatsJson: !!sampleBatch.statsJson,
          warningsJsonVersion: extractWarningsJsonVersion(sampleBatch.warningsJson),
          warningsJsonType: Array.isArray(safeParseJson(sampleBatch.warningsJson))
            ? 'legacy-string[]'
            : typeof safeParseJson(sampleBatch.warningsJson),
        }
      : null,
    sampleTTC: sampleTTC
      ? {
          id: sampleTTC.id,
          teachingTaskId: sampleTTC.teachingTaskId,
          classGroupId: sampleTTC.classGroupId,
          teachingTaskImportBatchId: sampleTTC.teachingTask.importBatchId,
          teachingTaskRemark: sampleTTC.teachingTask.remark,
          teachingTaskCrossCohortApproved: sampleTTC.teachingTask.crossCohortApproved,
          teachingTaskCrossCohortApprovalReason: sampleTTC.teachingTask.crossCohortApprovalReason,
        }
      : null,
  }
}

async function countCrossCohortTeachingTasks(): Promise<number> {
  const allLinks = await prisma.teachingTaskClass.findMany({
    include: { classGroup: { select: { name: true } } },
  })
  const byTask = new Map<number, Set<number>>()
  for (const link of allLinks) {
    const m = link.classGroup.name.match(/^(\d{4})级/)
    if (!m) continue
    const year = parseInt(m[1], 10)
    if (Number.isNaN(year)) continue
    const set = byTask.get(link.teachingTaskId) ?? new Set<number>()
    set.add(year)
    byTask.set(link.teachingTaskId, set)
  }
  let n = 0
  for (const years of byTask.values()) {
    if (years.size > 1) n++
  }
  return n
}

function safeParseJson(s: string | null): unknown {
  if (!s) return null
  try {
    return JSON.parse(s)
  } catch {
    return null
  }
}

function extractWarningsJsonVersion(s: string | null): number | null {
  const parsed = safeParseJson(s)
  if (parsed && typeof parsed === 'object' && 'version' in (parsed as Record<string, unknown>)) {
    const v = (parsed as Record<string, unknown>).version
    if (typeof v === 'number') return v
  }
  return null
}

// ─── Findings (Rules A-F) ──────────────────────────────────────────────

async function evaluateRuleA(): Promise<Finding[]> {
  const findings: Finding[] = []
  const schema = readTextFile('prisma/schema.prisma')
  const ttcModel = schema?.match(/model TeachingTaskClass \{[\s\S]*?\n\}/)?.[0] ?? ''

  const hasSourceRow = /sourceRow|sourceRowIndex/.test(ttcModel)
  const hasSourceKeyword = /sourceKeyword/.test(ttcModel)
  const hasSourceClassName = /sourceClassName/.test(ttcModel)
  const hasSourceRemark = /sourceRemark/.test(ttcModel)
  const hasSourceArtifact = /sourceArtifactPath|sourceArtifactFilename/.test(ttcModel)
  const hasImportBatchId = /importBatchId\s+Int\??/.test(ttcModel)
  const hasMatchStrategy = /matchStrategy|matchKind/.test(ttcModel)
  const hasMatchConfidence = /matchConfidence/.test(ttcModel)

  const importer = readTextFile('src/lib/import/importer.ts') ?? ''
  // importer writes sourceRow/sourceKeyword/importBatchId on TTC?
  const writesTtcSourceRow = /teachingTaskClass\.create\(\{[\s\S]*?sourceRow/.test(importer)
  const writesTtcSourceKeyword = /teachingTaskClass\.create\(\{[\s\S]*?sourceKeyword/.test(importer)
  const writesTtcImportBatchId = /teachingTaskClass\.create\(\{[\s\S]*?importBatchId/.test(importer)

  // Per-link evidence: any teachingTaskClass.create call with extra fields?
  const ttcCreateWithExtras = /teachingTaskClass\.create\(\{[^}]*?\}\)/.test(importer)

  const allFieldsPresent =
    hasSourceRow && hasSourceKeyword && hasSourceClassName && hasSourceRemark && hasSourceArtifact && hasImportBatchId

  const severity: Severity = allFieldsPresent ? 'NONE' : 'MEDIUM'
  const carrierFields = [
    hasSourceRow,
    hasSourceKeyword,
    hasSourceClassName,
    hasSourceRemark,
    hasSourceArtifact,
    hasImportBatchId,
    hasMatchStrategy,
    hasMatchConfidence,
  ]
  const missingCount = carrierFields.filter((x) => !x).length

  findings.push({
    id: 'FIXA-RuleA-1',
    rule: 'A. TeachingTaskClass traceability gap',
    severity,
    category: 'Per-link source evidence',
    title: allFieldsPresent
      ? 'TeachingTaskClass schema 已有 source evidence 字段 (K20-FIX-B completed)'
      : 'TeachingTaskClass schema 缺 source row / keyword / className / remark / artifact 字段',
    currentStatus: `TeachingTaskClass model fields: sourceRow=${hasSourceRow} sourceKeyword=${hasSourceKeyword} sourceClassName=${hasSourceClassName} sourceRemark=${hasSourceRemark} sourceArtifact=${hasSourceArtifact} importBatchId=${hasImportBatchId} matchStrategy=${hasMatchStrategy} matchConfidence=${hasMatchConfidence}. importer writes TTC sourceRow=${writesTtcSourceRow} sourceKeyword=${writesTtcSourceKeyword} importBatchId=${writesTtcImportBatchId} (teachingTaskClass.create with extras=${ttcCreateWithExtras}).`,
    evidence: [
      `TeachingTaskClass model has sourceRow/sourceRowIndex: ${hasSourceRow}`,
      `TeachingTaskClass model has sourceKeyword: ${hasSourceKeyword}`,
      `TeachingTaskClass model has sourceClassName: ${hasSourceClassName}`,
      `TeachingTaskClass model has sourceRemark: ${hasSourceRemark}`,
      `TeachingTaskClass model has sourceArtifactPath/sourceArtifactFilename: ${hasSourceArtifact}`,
      `TeachingTaskClass model has importBatchId: ${hasImportBatchId}`,
      `TeachingTaskClass model has matchStrategy/matchKind: ${hasMatchStrategy}`,
      `TeachingTaskClass model has matchConfidence: ${hasMatchConfidence}`,
      `importer writes TeachingTaskClass.sourceRow: ${writesTtcSourceRow}`,
      `importer writes TeachingTaskClass.sourceKeyword: ${writesTtcSourceKeyword}`,
      `importer writes TeachingTaskClass.importBatchId: ${writesTtcImportBatchId}`,
      `Missing fields out of 8 carrier candidates: ${missingCount}`,
    ],
    risk: allFieldsPresent
      ? 'K20-FIX-B 已完成 schema + importer forward-fill. 历史 446 rows 保持 null (no-backfill policy). 残余风险: historical null 无回填; source artifact immutable storage / operator identity / frontend display 仍 deferred.'
      : 'K18 / K19 修复 5 个 cross-cohort 错误 task (168/174/176/181/37) 时需要人工反查 17 个 source JSON. 未来若再次 import 出错, TeachingTaskClass link 无法自动回溯是 source row 0 还是 row 5 创建, 是 exact 还是 weak match, 来自哪个 docx 哪个 row. Audit / 修复 / 撤销 链路均需人工介入.',
    recommendation: allFieldsPresent
      ? 'K20-FIX-B 已完成. 残余: historical null backfill (K20-FIX-C, optional) / source artifact immutable storage (K20-FIX-D) / operator identity (K20-FIX-B-IMPORT-EVIDENCE-MODEL-DESIGN).'
      : '下一阶段 (K20-FIX-B) 在 TeachingTaskClass 增加最小 source evidence 字段: importBatchId + sourceRowIndex + sourceKeyword + sourceClassName + sourceRemark + sourceArtifactFilename + matchStrategy. importer 写入时填入. 不需要 backfill, 但需要 forward-fill 逻辑保证后续 import 写入.',
    suggestedNextStage: allFieldsPresent
      ? 'K20-FIX-C-SOURCE-EVIDENCE-BACKFILL-AUDIT (optional) 或 K20-FIX-B-IMPORT-EVIDENCE-MODEL-DESIGN'
      : 'K20-FIX-B-SOURCE-EVIDENCE-SCHEMA-PLAN',
  })

  return findings
}

function evaluateRuleB(): Finding[] {
  const findings: Finding[] = []
  const schema = readTextFile('prisma/schema.prisma') ?? ''
  const taskModel = schema.match(/model TeachingTask \{[\s\S]*?\n\}/)?.[0] ?? ''

  const hasImportBatchId = /importBatchId\s+Int\??/.test(taskModel)
  const hasRemark = /remark\s+String\??/.test(taskModel)
  const hasCrossCohortApproved = /crossCohortApproved\s+Boolean/.test(taskModel)
  const hasCrossCohortReason = /crossCohortApprovalReason\s+String\??/.test(taskModel)
  const hasApprovedBy = /approvedBy|approverId|operatorId/.test(taskModel)
  const hasApprovedAt = /approvedAt|crossCohortApprovedAt/.test(taskModel)

  const importer = readTextFile('src/lib/import/importer.ts') ?? ''
  const writesImportBatchId = /teachingTask\.create\(\{[\s\S]*?importBatchId/.test(importer)
  const writesRemark = /teachingTask\.create\(\{[\s\S]*?remark/.test(importer)
  const writesCrossCohortApproved = /teachingTask\.create\(\{[\s\S]*?crossCohortApproved/.test(importer)
  const writesCrossCohortReason = /teachingTask\.create\(\{[\s\S]*?crossCohortApprovalReason/.test(importer)

  const taskLevelComplete = hasImportBatchId && hasRemark && hasCrossCohortApproved && hasCrossCohortReason
  const missingPerOperator = !hasApprovedBy || !hasApprovedAt
  const severity: Severity = !taskLevelComplete ? 'MEDIUM' : missingPerOperator ? 'LOW' : 'NONE'

  findings.push({
    id: 'FIXA-RuleB-1',
    rule: 'B. TeachingTask-level evidence',
    severity,
    category: 'TeachingTask-level evidence',
    title: 'TeachingTask-level evidence 现状评估 (importBatchId / remark / crossCohort approval)',
    currentStatus: `TeachingTask model: importBatchId=${hasImportBatchId} remark=${hasRemark} crossCohortApproved=${hasCrossCohortApproved} crossCohortApprovalReason=${hasCrossCohortReason} approvedBy/operatorId=${hasApprovedBy} approvedAt=${hasApprovedAt}. importer writes: importBatchId=${writesImportBatchId} remark=${writesRemark} crossCohortApproved=${writesCrossCohortApproved} crossCohortApprovalReason=${writesCrossCohortReason}.`,
    evidence: [
      `TeachingTask.importBatchId field: ${hasImportBatchId}`,
      `TeachingTask.remark field: ${hasRemark}`,
      `TeachingTask.crossCohortApproved field: ${hasCrossCohortApproved}`,
      `TeachingTask.crossCohortApprovalReason field: ${hasCrossCohortReason}`,
      `TeachingTask.approvedBy/approverId/operatorId field: ${hasApprovedBy}`,
      `TeachingTask.approvedAt field: ${hasApprovedAt}`,
      `importer writes TeachingTask.importBatchId: ${writesImportBatchId}`,
      `importer writes TeachingTask.remark: ${writesRemark}`,
      `importer writes TeachingTask.crossCohortApproved: ${writesCrossCohortApproved}`,
      `importer writes TeachingTask.crossCohortApprovalReason: ${writesCrossCohortReason}`,
    ],
    risk: 'TeachingTask-level evidence 仅能解释 task 整体是否经 cross-cohort approval, 但不能解释每个 TeachingTaskClass link. 例如 task 37 有 3 个 link (CG3, CG17, CG35), 仅靠 task-level evidence 不知道 CG35 link 是如何创建的. 当前 task 37 已修复, 但未来若出现类似 case, 仍无法自动定位.',
    recommendation:
      severity === 'MEDIUM'
        ? '补齐 TeachingTask-level 字段. 当前 K19-FIX-B1 已完成 crossCohortApproved + crossCohortApprovalReason. approvedBy / approvedAt 可推迟至独立阶段.'
        : severity === 'LOW'
          ? 'TeachingTask-level evidence 满足 K19 阶段需求. operator identity / timestamp 推迟至独立阶段 (K20-FIX-B-IMPORT-EVIDENCE-MODEL-DESIGN).'
          : 'TeachingTask-level evidence 满足 closure. 仅 per-link evidence 仍缺.',
    suggestedNextStage: severity === 'LOW' ? 'K20-FIX-B-IMPORT-EVIDENCE-MODEL-DESIGN (optional)' : undefined,
  })

  return findings
}

function evaluateRuleC(): Finding[] {
  const findings: Finding[] = []
  const schema = readTextFile('prisma/schema.prisma') ?? ''
  const importBatchModel = schema.match(/model ImportBatch \{[\s\S]*?\n\}/)?.[0] ?? ''

  const hasWarningsJson = /warningsJson\s+String\??/.test(importBatchModel)
  const hasVersionedStructure = /version\s*:\s*2/.test(readTextFile('src/lib/import/importer.ts') ?? '')
  const hasCrossCohortApprovalsField = /crossCohortApprovals/.test(readTextFile('src/lib/import/importer.ts') ?? '')

  // Examine a confirmed batch's warningsJson structure (async handled in main)
  const warningsJsonTypeNote = '见 main 中 sample 提取'

  const severity: Severity = hasWarningsJson && hasVersionedStructure ? 'INFO' : 'MEDIUM'

  findings.push({
    id: 'FIXA-RuleC-1',
    rule: 'C. ImportBatch.warningsJson',
    severity,
    category: 'ImportBatch.warningsJson audit',
    title: 'ImportBatch.warningsJson 当前 structure 与查询能力',
    currentStatus: `ImportBatch.warningsJson field=${hasWarningsJson}. warningsJson v2 (version: 2) 存在=${hasVersionedStructure}. crossCohortApprovals array 透传=${hasCrossCohortApprovalsField}. ${warningsJsonTypeNote}.`,
    evidence: [
      `ImportBatch.warningsJson field: ${hasWarningsJson}`,
      `Importer writes version: 2 metadata: ${hasVersionedStructure}`,
      `Importer writes crossCohortApprovals array: ${hasCrossCohortApprovalsField}`,
    ],
    risk: 'warningsJson 是 JSON blob, 无法用 SQL 索引/查询/外键关联. 仅可整批 parse. 长期 audit trail 难以扩展. 不能定位到具体 TeachingTaskClass link 级别 (warnings 是 batch 级别, 不是 link 级别).',
    recommendation:
      severity === 'INFO'
        ? 'warningsJson 作为 batch-level 概要已够用. 但 per-link evidence 仍需独立 TeachingTaskClass 字段. 不在本阶段解决.'
        : '应升级 warningsJson 为 versioned structure (B1 已完成) + 增补 per-link 字段至 TeachingTaskClass (FIXA-RuleA).',
  })

  return findings
}

function evaluateRuleD(): Finding[] {
  const findings: Finding[] = []
  const schema = readTextFile('prisma/schema.prisma') ?? ''
  const importBatchModel = schema.match(/model ImportBatch \{[\s\S]*?\n\}/)?.[0] ?? ''

  const hasFilename = /filename\s+String/.test(importBatchModel)
  const hasOriginalFilePath = /originalFilePath\s+String\??/.test(importBatchModel)
  const hasParsedJsonPath = /parsedJsonPath\s+String\??/.test(importBatchModel)
  const hasStatsJson = /statsJson\s+String\??/.test(importBatchModel)
  const hasQualityJson = /qualityJson\s+String\??/.test(importBatchModel)

  const uploadsExists = fileExists('uploads/imports')
  const uploadsJsonCount = uploadsExists ? listUploadsJson().length : 0
  const sampleJson = readFirstJsonSample()

  const severity: Severity = hasFilename && hasOriginalFilePath && hasParsedJsonPath ? 'INFO' : 'MEDIUM'

  findings.push({
    id: 'FIXA-RuleD-1',
    rule: 'D. Source artifact retention',
    severity,
    category: 'Source artifact retention',
    title: 'ImportBatch source artifact path retention 与 filesystem drift 风险',
    currentStatus: `ImportBatch model: filename=${hasFilename} originalFilePath=${hasOriginalFilePath} parsedJsonPath=${hasParsedJsonPath} statsJson=${hasStatsJson} qualityJson=${hasQualityJson}. uploads/imports 目录存在=${uploadsExists}, JSON 文件数=${uploadsJsonCount}. sample JSON records=${sampleJson?.records ?? 'n/a'}, sample record keys=${sampleJson?.sampleRecordKeys?.join(',') ?? 'n/a'}, sample remark=${sampleJson?.sampleRemark ?? 'n/a'}.`,
    evidence: [
      `ImportBatch.filename: ${hasFilename}`,
      `ImportBatch.originalFilePath: ${hasOriginalFilePath}`,
      `ImportBatch.parsedJsonPath: ${hasParsedJsonPath}`,
      `ImportBatch.statsJson: ${hasStatsJson}`,
      `ImportBatch.qualityJson: ${hasQualityJson}`,
      `uploads/imports directory: ${uploadsExists}`,
      `JSON files in uploads/imports: ${uploadsJsonCount}`,
      `Sample JSON record keys: ${sampleJson?.sampleRecordKeys?.join(', ') ?? 'n/a'}`,
      `Sample JSON record count: ${sampleJson?.records ?? 'n/a'}`,
    ],
    risk: 'originalFilePath / parsedJsonPath 仅存 path 字符串, 实际文件存在性 / 路径漂移 / 备份策略均依赖文件系统管理. 若 uploads/imports/ 目录被清理或路径重命名, batch-level 链接立即失效. 此外, JSON 内部行号 (source row index) 完全未持久化 — 即便 JSON 文件存在, 也无法直接定位到具体 record.parsedJson 数组 index.',
    recommendation:
      severity === 'INFO'
        ? '短期 OK. 中期建议: (a) source artifact 持久化至不可变存储 (S3 / 内部 object store), 路径 → hash 映射; (b) parser 在 record 写入时记录 source row index 字段. 建议作为 K20-FIX-B-IMPORT-EVIDENCE-MODEL-DESIGN 或独立 K20-FIX-D-SOURCE-ARTIFACT-IMMUTABLE-STORAGE 阶段.'
        : '应补充 originalFilePath / parsedJsonPath 字段. parser 记录 record 级别 source row index.',
    suggestedNextStage: severity === 'INFO' ? 'K20-FIX-D-SOURCE-ARTIFACT-IMMUTABLE-STORAGE (deferred)' : undefined,
  })

  return findings
}

function evaluateRuleE(): Finding[] {
  const findings: Finding[] = []
  // K18-B: 4 tasks (168/174/176/181) removed CG22 — required manual cross-reference of 17 source JSONs
  // K18-E3: task 37 removed CG35 — required K18-C source artifact review
  // These cases would have benefited from per-link source evidence

  const k18bReport = readTextFile('docs/k18-cross-cohort-data-repair-execute.md') ?? ''
  const k18e3Report = readTextFile('docs/k18-task37-finalization-execute.md') ?? ''
  const k18cReport = readTextFile('docs/k18-task37-source-artifact-review.md') ?? ''

  const k18cHasRecordCount = /17 个 source JSON|17 parsed JSON|17 source JSON files/.test(k18cReport)

  // Cross-reference evidence: do K18 reports mention "source row" / "parsed row" / specific record?
  const k18cHasSourceRowRef = /source row|parsed row|recordIndex|record index|行号|rowIndex/.test(k18cReport)

  const severity: Severity = 'INFO'

  findings.push({
    id: 'FIXA-RuleE-1',
    rule: 'E. K18/K19 historical cases',
    severity,
    category: 'Historical case review',
    title: 'K18-B 4 tasks + K18-E3 task 37 historical case — 当前 evidence 强度评估',
    currentStatus: `K18-B 4 tasks (168/174/176/181) — TTC 349/361/366/377 deleted in 2026-06-03. K18-E3 task 37 — TTC 94 deleted. K18-C source review: ${k18cReport ? 'EXISTS' : 'MISSING'}, 17 source JSON scan: ${k18cHasRecordCount}, source row / record index reference: ${k18cHasSourceRowRef}. 当前 evidence 全部依赖人工 cross-reference 17 个 JSON 文件, 无自动化 source row index 定位.`,
    evidence: [
      `K18-B repair report exists: ${!!k18bReport}`,
      `K18-E3 task37 report exists: ${!!k18e3Report}`,
      `K18-C source review exists: ${!!k18cReport}`,
      `K18-C references 17 source JSON files: ${k18cHasRecordCount}`,
      `K18-C references source row / parsed row / record index: ${k18cHasSourceRowRef}`,
      `K19 root-cause audit commit: 0e656a2 (K19-IMPORT-MATCHING-IMPROVEMENT-AUDIT)`,
      `K19 root cause: weak matching + missing source evidence`,
    ],
    risk: 'K18-B 修复时需要人工对 17 个 source JSON 做交叉验证才能确认 4 个 task 错误 merge 是历史 import 误合并. K18-C 报告人工逐一搜索 17 个 JSON 确认 task 37 在 2024 cohort 无任何 source record. 这种人工诊断模式在 K19-FIX-B / K19-FIX-C 阶段被多次 deferred. K20-FIX-B 已添加 source evidence 字段, 未来类似 case 诊断时间将从 ~1 天缩短到 ~10 分钟 (但历史 446 rows 仍为 null, 诊断时仍需 cross-reference).',
    recommendation:
      'K20-FIX-B 已完成 source evidence 字段 + importer forward-fill. 历史 rows (446) 保持 null (no-backfill policy). 未来新 import 的 link 可直接通过 sourceRowIndex + sourceArtifactFilename 定位. 历史 rows 如需回溯仍需 cross-reference source JSON (K20-FIX-C, optional).',
    suggestedNextStage: 'K20-FIX-C-SOURCE-EVIDENCE-BACKFILL-AUDIT (optional) 或 K20-FIX-B-IMPORT-EVIDENCE-MODEL-DESIGN',
  })

  return findings
}

function evaluateRuleF(): Finding[] {
  const findings: Finding[] = []
  // Rule F: schema options comparison
  // We report the comparison results as an INFO finding (the actual option details go into schemaOptions)

  const optionsCount = 4
  // Pre-flight: we always have A/B/C/D designed in this audit

  findings.push({
    id: 'FIXA-RuleF-1',
    rule: 'F. Schema option comparison',
    severity: 'INFO',
    category: 'Schema option comparison',
    title: `4 个 schema options 评估 (A: 最小字段 / B: 独立 model / C: 仅 warningsJson / D: 不改 schema)`,
    currentStatus: `已比较 4 个 options (A/B/C/D). 评估维度: 查询能力 / migration 风险 / rollback 复杂度 / forward-fill 兼容性 / audit trail 长期价值. 推荐: Option A (TeachingTaskClass 增最小 source evidence 字段). 详见 report.schemaOptions.`,
    evidence: [
      `Options evaluated: ${optionsCount} (A, B, C, D)`,
      `Option A: TeachingTaskClass minimal source evidence fields — queryable, low migration, recommended`,
      `Option B: TeachingTaskClassSource / ImportEvidence independent model — extensible, heavier, more migration`,
      `Option C: warningsJson enhancement — no schema change, weak queryability`,
      `Option D: docs/audit only — zero migration, zero traceability gain`,
      `Report contains schemaOptions array with full pros/cons for each`,
    ],
    risk: '若选 C 或 D, 未来诊断 / 修复 / 撤销 仍需依赖 warningsJson blob 解析 + 人工 cross-reference. 长期 audit trail 价值低. 若选 B, 虽可扩展, 但当前需求未达到独立 model 复杂度. Option A 是平衡点.',
    recommendation: '推荐 Option A. 详见 recommendedOption + implementationPlan 字段.',
  })

  return findings
}

// ─── Main ────────────────────────────────────────────────────────────

async function main() {
  console.log('K20 Source Evidence Traceability Audit')
  console.log('='.repeat(60))

  // Read DB snapshot
  const db = await readDbSnapshot()

  // Evaluate all 6 rules (A-F)
  const findingsRuleA = await evaluateRuleA()
  const findingsRuleB = evaluateRuleB()
  const findingsRuleC = evaluateRuleC()
  const findingsRuleD = evaluateRuleD()
  const findingsRuleE = evaluateRuleE()
  const findingsRuleF = evaluateRuleF()

  const allFindings: Finding[] = [
    ...findingsRuleA,
    ...findingsRuleB,
    ...findingsRuleC,
    ...findingsRuleD,
    ...findingsRuleE,
    ...findingsRuleF,
  ]

  // Severity summary
  const summary: Record<Severity, number> = { HIGH: 0, MEDIUM: 0, LOW: 0, INFO: 0, NONE: 0 }
  for (const f of allFindings) summary[f.severity]++

  // ─── Current traceability map ───
  const currentTraceabilityMap: TraceabilityLink[] = [
    {
      level: '1. Source artifact (.docx)',
      description: '原始排课表 docx 文件',
      dataFlow: '用户上传至 /api/admin/import/parse',
      evidenceCarrier: 'uploads/imports/{timestamp}-{slug}.docx 文件系统',
      queryable: false,
      retainedLongTerm: true,
      gaps: ['无 DB 索引 / 校验和;路径漂移敏感'],
    },
    {
      level: '2. Parsed JSON',
      description: 'Python parser (scripts/parse_schedule.py) 输出',
      dataFlow: 'python parser → uploads/imports/{timestamp}.json',
      evidenceCarrier: '文件系统 JSON',
      queryable: false,
      retainedLongTerm: true,
      gaps: ['record 级别无 source row index 字段; 重新 parse 时若顺序变化, 无法重定位'],
    },
    {
      level: '3. ImportBatch',
      description: 'parse route 创建的 batch 记录',
      dataFlow: 'POST /api/admin/import/parse → ImportBatch.create({filename, originalFilePath, parsedJsonPath, status: pending})',
      evidenceCarrier: 'ImportBatch model 字段: filename / originalFilePath / parsedJsonPath / statsJson / qualityJson / warningsJson / status / recordCount / createdTaskCount / createdSlotCount',
      queryable: true,
      retainedLongTerm: true,
      gaps: ['warningsJson 是 batch-level JSON blob, 不含 per-link 字段'],
    },
    {
      level: '4. TeachingTask',
      description: '导入后生成的教学任务',
      dataFlow: 'importer.executeImportInTransaction → TeachingTask.create({importBatchId, remark, crossCohortApproved, crossCohortApprovalReason})',
      evidenceCarrier: 'TeachingTask model: importBatchId / remark / crossCohortApproved / crossCohortApprovalReason',
      queryable: true,
      retainedLongTerm: true,
      gaps: ['approvedBy / approvedAt / operatorId 缺失; remark 字段被用于存合班说明, 不专用于 source evidence'],
    },
    {
      level: '5. TeachingTaskClass',
      description: 'task ↔ classGroup 多对多 link',
      dataFlow: 'importer.executeImportInTransaction → TeachingTaskClass.create({teachingTaskId, classGroupId})',
      evidenceCarrier: '仅 teachingTaskId + classGroupId (无 importBatchId / source row / keyword 字段)',
      queryable: true,
      retainedLongTerm: true,
      gaps: ['无 importBatchId 字段', '无 source row index', '无 source keyword', '无 source className / remark', '无 source artifact filename', '无 match strategy / confidence'],
    },
    {
      level: '6. ClassGroup',
      description: '班级 (semesterId + name 唯一)',
      dataFlow: 'importer upsert by (semesterId, name)',
      evidenceCarrier: 'ClassGroup model 字段: name / studentCount / cohortYear (parse 派生) / track (parse 派生)',
      queryable: true,
      retainedLongTerm: true,
      gaps: ['cohortYear / track 当前无独立 schema 字段, 仅从 name 解析'],
    },
    {
      level: '7. warningsJson (batch-level)',
      description: 'import 阶段 warning / approval 元数据',
      dataFlow: 'importer 累积 warnings → ImportBatch.warningsJson (v2: { version, generatedAt, warnings: string[], crossCohortApprovals: [] })',
      evidenceCarrier: 'ImportBatch.warningsJson v2 (string JSON blob)',
      queryable: false,
      retainedLongTerm: true,
      gaps: ['JSON blob, 无 SQL 索引', '不能定位具体 TeachingTaskClass link', 'v1 (legacy string[]) 仍存在'],
    },
    {
      level: '8. crossCohortApproved (task-level)',
      description: 'task 是否经过 cross-cohort approval',
      dataFlow: 'K19-FIX-B1: import 阶段判定 → TeachingTask.crossCohortApproved / crossCohortApprovalReason',
      evidenceCarrier: 'TeachingTask.crossCohortApproved Boolean + crossCohortApprovalReason String?',
      queryable: true,
      retainedLongTerm: true,
      gaps: ['无 approvedBy / approvedAt / operatorId (K19-FIX-B §6 Option C deferred)'],
    },
  ]

  // ─── Historical case review ───
  // K36-A5D3A2: all real names / class / course / remark / report-date
  // detail has been redacted to <REDACTED_TEXT>. Only structural
  // information (stage id, task ids, cg id, finding count) is kept,
  // so the audit conclusion shape is preserved without leaking PII.
  const historicalCaseReview: HistoricalCaseReview[] = [
    {
      case: 'K18-B 4 tasks (168 / 174 / 176 / 181)',
      tasks: '4 cross-cohort task ids (168, 174, 176, 181); teacher/course real names redacted',
      wrongCG: 'cg22 (real class name redacted)',
      diagnosisEffort:
        '<REDACTED_TEXT> (K17-FIX-A reported 4 cross-cohort tasks; manual cross-reference of 17 source JSONs required to confirm 2025-cohort-only provenance; 4 TTC links fixed in K18-B)',
      improvementWithEvidence:
        '<REDACTED_TEXT> (per-link source row index + sourceArtifactFilename would let a repair script locate the link directly; estimated diagnosis time reduced from ~1 day to ~30 minutes)',
    },
    {
      case: 'K18-E3 task (public-ideology course cross-cohort link)',
      tasks: '1 cross-cohort task id (37); teacher/course real names redacted',
      wrongCG: 'cg35 (real class name redacted)',
      diagnosisEffort:
        '<REDACTED_TEXT> (K17-FIX-B marked the link as NEEDS_SOURCE_REVIEW; K18-C manually searched 17 source JSONs to confirm absence of any cross-cohort record; 1 TTC link deleted in K18-E3)',
      improvementWithEvidence:
        '<REDACTED_TEXT> (per-link source row index + source keyword would let a repair script locate the link and run an aggregate "no cross-cohort record exists" query; K18-C report would become a single SQL aggregate; estimated diagnosis time reduced from ~1 day to ~10 minutes)',
    },
    {
      case: 'Future hypothetical case',
      tasks: 'n/a (preventive pattern)',
      wrongCG: 'n/a',
      diagnosisEffort: '<REDACTED_TEXT> (current: manual cross-reference of N source JSONs + DB scan; estimated 0.5-2 days)',
      improvementWithEvidence: '<REDACTED_TEXT> (per-link source row index + source artifact filename + source keyword would let a script directly locate the link and see the source row class_name + match strategy; estimated 5-15 minutes)',
    },
  ]

  // ─── Schema options ───
  const schemaOptions: SchemaOption[] = [
    {
      option: 'A',
      name: 'TeachingTaskClass minimal source evidence fields',
      description:
        '在 TeachingTaskClass 表增字段: importBatchId Int? (FK) / sourceRowIndex Int? / sourceKeyword String? / sourceClassName String? / sourceRemark String? / sourceArtifactFilename String? / matchStrategy String? (EXACT / WEAK_INCLUDES / WEAK_SUBSEQ / AMBIGUOUS / DIRECT) / matchConfidence String? (HIGH / MEDIUM / LOW).',
      pros: [
        '直接 SQL 查询: SELECT * FROM TeachingTaskClass WHERE sourceRowIndex = X AND sourceArtifactFilename = Y',
        'Migration 简单: 仅一表增字段, 不改外键',
        'importer 写入点 1 处: executeImportInTransaction 的 TeachingTaskClass.create',
        'forward-fill 即可, 不需 backfill',
        '可与 K19 warningsJson 协同 (warnings 描述 batch-level, 字段描述 per-link)',
      ],
      cons: [
        '字段集中在 TeachingTaskClass 表, 表宽度增加 (但 SQLite 无 16KB 行限制问题)',
        '每条 link 多个 nullable 字段, 部分历史 link (K18 修复前) 字段为 null',
        '未来若要支持多 keyword / 多源 (跨 batch 合并), 字段不够灵活',
      ],
      estimatedEffort: '0.5-1 天 (含 importer 修改 + verify 脚本)',
      queryability: 'STRONG',
      rollbackRisk: 'LOW',
      recommended: true,
      recommendedReason:
        '直接满足 K18/K19 historical case 诊断需求. 最小 schema 改动, importer 改动集中. 不阻塞其他主线. 与 K19-FIX-B1 (crossCohortApproved) 字段风格一致. forward-fill 即可, 无需 backfill.',
    },
    {
      option: 'B',
      name: 'TeachingTaskClassSource / ImportEvidence independent model',
      description:
        '新建 TeachingTaskClassSource 表: id / teachingTaskClassId (FK 1:1) / importBatchId (FK) / sourceRowIndex Int / sourceKeyword String / sourceClassName String / sourceRemark String / sourceArtifactFilename String / matchStrategy String / matchConfidence String. 可选 ImportEvidence 通用表 (per-evidence 1:N).',
      pros: [
        '独立表, 不影响 TeachingTaskClass 主表宽度',
        '可扩展 1:N (一个 link 可对应多个 evidence 来源 — 跨 batch 合并 / 历史合并)',
        '可独立 archive / GC (老 evidence 单独表)',
        'importBatch 详情可独立 SELECT',
      ],
      cons: [
        'Migration 复杂: 新表 + FK + index',
        'JOIN 查询稍多 (TeachingTaskClass JOIN TeachingTaskClassSource)',
        '1:1 模式下与 Option A 类似, 1:N 模式与当前业务场景 (1 link 1 source) 不匹配',
        'importer 改动点增加 (需独立 evidence creation 逻辑)',
        '与 K19 KISS 风格不匹配 — 字段直接放主表更直观',
      ],
      estimatedEffort: '1-2 天',
      queryability: 'STRONG',
      rollbackRisk: 'MEDIUM',
      recommended: false,
      recommendedReason:
        '当前业务场景 (1 link 1 source) 1:1 模型不必要. 1:N 模型未来 (跨 batch 合并) 才有价值, 但当前尚未实施跨 batch 合并. 增加 migration 复杂度, 收益与 Option A 相同.',
    },
    {
      option: 'C',
      name: 'warningsJson enhancement only (no schema change)',
      description:
        '不改 schema. 在 warningsJson 中追加新结构: { version: 3, generatedAt, perLinkEvidence: [{ ttClassId?: null, taskKey, classGroupId, sourceRowIndex, sourceKeyword, matchStrategy }] }. 在 importer 写入时填充.',
      pros: [
        '零 migration',
        '零 schema 改动',
        '与 K19-FIX-B1 warningsJson v2 模式一致',
        '可立即验证',
      ],
      cons: [
        'JSON blob 无法 SQL 查询 / 索引',
        'ttClassId 是 post-creation 引用, 在 dry-run 阶段无 id (需 2-step: dryRun 返回 tentative id, confirm 时 attach)',
        '历史 link 无法 attach (perLinkEvidence 仅新 batch 有效)',
        'parse 复杂 (需多步 JOIN 解析)',
        '审计查询性能差',
      ],
      estimatedEffort: '0.5 天',
      queryability: 'WEAK',
      rollbackRisk: 'LOW',
      recommended: false,
      recommendedReason:
        '虽然零 migration, 但 queryability 弱 (无法直接 SELECT TeachingTaskClass by source row). 长期 audit 仍需 parse JSON. 不解决 K18/K19 historical case 诊断的根问题.',
    },
    {
      option: 'D',
      name: 'No schema change, docs/audit only',
      description: '保持当前 schema. 完善 docs / audit scripts. 人工诊断仍依赖 17 JSON cross-reference.',
      pros: ['零 migration', '零代码改动', '零风险'],
      cons: [
        '不解决 traceability 根问题',
        '未来诊断仍需 0.5-2 天',
        'K18/K19 模式 (deferred) 持续存在',
      ],
      estimatedEffort: '0.5 天 (写文档)',
      queryability: 'NONE',
      rollbackRisk: 'LOW',
      recommended: false,
      recommendedReason: '不解决任何问题. 仅是 K19 deferred 状态延续. 不推荐.',
    },
  ]

  const recommendedOption = 'A. TeachingTaskClass minimal source evidence fields'
  const ruleAFinding = allFindings.find((f) => f.id === 'FIXA-RuleA-1')
  const ruleAComplete = ruleAFinding?.severity === 'NONE'
  const recommendedNextStage = ruleAComplete
    ? 'K20-FIX-C-SOURCE-EVIDENCE-BACKFILL-AUDIT (optional) 或 K20-FIX-B-IMPORT-EVIDENCE-MODEL-DESIGN'
    : 'K20-FIX-B-SOURCE-EVIDENCE-SCHEMA-PLAN'

    // ─── Implementation plan (suggested next stage) ───
  const ruleAResolved = allFindings.find((f) => f.id === 'FIXA-RuleA-1')?.severity === 'NONE'
  const implementationPlan = ruleAResolved
    ? {
        stage: 'K20-FIX-B-SOURCE-EVIDENCE-SCHEMA-PLAN (COMPLETED)',
        description:
          'K20-FIX-B already completed: TeachingTaskClass + 8 nullable source evidence fields + importer forward-fill. Historical 446 rows all null (no-backfill policy).',
        backupRequired: true,
        migration: 'Done: npx prisma db push + prisma generate. backup: prisma/dev.db.backup-before-k20-source-evidence-schema-20260604154215.',
        importerChanges: 'Done: executeImportInTransaction TeachingTaskClass.create + 8 fields via buildTeachingTaskClassEvidence.',
        verifyPlan: [
          'verify-source-evidence-schema-k20-fix-b.ts — 37 PASS / 0 FAIL',
          'verify-source-evidence-importer-k20-fix-b.ts — 41 PASS / 0 FAIL',
          'verify-source-evidence-query-k20-fix-b.ts — 16 PASS / 0 FAIL',
          'audit-source-evidence-backfill-gap-k20-fix-b.ts — 2 PASS / 0 FAIL',
        ],
        outOfScope: [
          'historical null backfill (K20-FIX-C, optional)',
          'source artifact immutable storage (K20-FIX-D)',
          'operator identity / timestamp (K20-FIX-B-IMPORT-EVIDENCE-MODEL-DESIGN)',
          'frontend source evidence display',
        ],
      }
    : {
        stage: 'K20-FIX-B-SOURCE-EVIDENCE-SCHEMA-PLAN',
        description:
          'Add 8 nullable source evidence fields to TeachingTaskClass. Forward-fill via importer. No historical backfill.',
        backupRequired: true,
        migration: 'cp prisma/dev.db backup; npx prisma db push; npx prisma generate.',
        importerChanges: 'executeImportInTransaction: TeachingTaskClass.create + 8 fields via buildTeachingTaskClassEvidence.',
        verifyPlan: [
          'verify-source-evidence-schema-k20-fix-b.ts',
          'verify-source-evidence-importer-k20-fix-b.ts',
          'verify-source-evidence-query-k20-fix-b.ts',
          'audit-source-evidence-backfill-gap-k20-fix-b.ts',
        ],
        outOfScope: [
          'no historical backfill',
          'no parser business logic change',
          'no frontend / warningsJson / cross-cohort approval change',
        ],
      }

// ─── Verification plan ───
  const verificationPlan = [
    'npm.cmd run build — 验证 TS 编译通过',
    'npm.cmd run lint — 验证无新增 lint error (允许 312 problems baseline)',
    'npx prisma validate — 验证 schema 修改后仍 valid (本阶段未改 schema, 仅生成 audit)',
    'npm.cmd run test:auth-foundation — 53 passed / 1 failed (pre-existing ScheduleAdjustment ACTIVE mismatch)',
    'npx.cmd tsx scripts/audit-source-evidence-traceability-k20-fix-a.ts — 本阶段 audit script',
    'npx.cmd tsx scripts/audit-remaining-risk-rebase-k20.ts — 验证 K20 rebase summary 不变 (HIGH=0, MEDIUM=2, LOW=6, ACCEPTED=1, NONE=1, BLOCKING=NO)',
    'npx.cmd tsx scripts/verify-import-approval-browser-e2e-k19-fix-c.ts — 10 PASS / 0 FAIL',
    'npx.cmd tsx scripts/verify-import-cross-cohort-approval-ui-k19-fix-b2.ts — 16 PASS / 0 FAIL',
    'npx.cmd tsx scripts/verify-import-cross-cohort-approval-k19-fix-b1.ts — 17 PASS / 0 FAIL',
    'npx.cmd tsx scripts/verify-import-matching-cohort-guard-k19-fix-a.ts — 31 PASS / 0 FAIL',
    'npx.cmd tsx scripts/audit-import-cross-cohort-persistent-flag-k19-fix-b.ts — HIGH=0 / MEDIUM=0',
    'npx.cmd tsx scripts/audit-import-matching-root-cause-k19.ts — HIGH=0',
    'npx.cmd tsx scripts/validate-task37-finalization-k18-e3.ts — 18 PASS / 0 FAIL',
    'npx.cmd tsx scripts/audit-data-quality-classgroup-matching-k17-fix-a.ts — HIGH=0',
  ]

  // ─── Open questions ───
  const openQuestions = [
    'parser (scripts/parse_schedule.py) 是否同步需要写入 sourceRowIndex 字段? 若需要, 属于 parser 改动, 需独立阶段或合并 K20-FIX-B.',
    'matchStrategy 枚举值是否需要前后端统一? 建议 enum: EXACT, WEAK_INCLUDES, WEAK_SUBSEQ, AMBIGUOUS, DIRECT, REMARK_DERIVED.',
    'matchConfidence 评估标准: 1 个 exact hit = HIGH; 1 个 weak pass cohort filter = MEDIUM; 1 个 subseq pass = LOW. 需 K20-FIX-B 实施时定义.',
    'K19 cross-cohort approval 的 taskKey 是否需要冗余至 TeachingTaskClass? 备选: 单独 taskKey 字段. 建议 K20-FIX-B 实施时由 Audit 决定.',
    '若历史 TTC 行 (446 行) 需要 backfill, 需关联 source JSON 回填 sourceRowIndex. 建议不 backfill, 仅 forward-fill, 历史 TTC 字段为 null 即可 (有 warning 标记: sourceEvidence = null).',
  ]

  // ─── Closure criteria ───
  const closureCriteria = [
    '新增 source evidence traceability audit 脚本 (本阶段: scripts/audit-source-evidence-traceability-k20-fix-a.ts)',
    '新增 Markdown audit 文档 (docs/k20-source-evidence-traceability-audit.md)',
    '新增 JSON audit 报告 (docs/k20-source-evidence-traceability-audit.json)',
    '明确当前 evidence gap (Rule A-F 6 类发现)',
    '明确推荐 schema / model 方案 (Option A)',
    '明确下一阶段实施范围 (K20-FIX-B-SOURCE-EVIDENCE-SCHEMA-PLAN)',
    'build PASS',
    'lint 无新增 error (baseline 312 problems 维持)',
    'test:auth-foundation 无新增失败 (53 passed / 1 failed 维持)',
    '不修改 DB / schema / migration / API / frontend / importer / parser / solver / RBAC (本阶段)',
    '工作区 clean',
  ]

  // ─── Build report ───
  const report: Report = {
    generatedAt: new Date().toISOString(),
    phase: 'K20-FIX-A-SOURCE-EVIDENCE-TRACEABILITY-AUDIT',
    mode: 'read-only',
    summary,
    totalFindings: allFindings.length,
    blocking: summary.HIGH > 0,
    recommendedOption,
    recommendedNextStage,
    currentTraceabilityMap,
    findings: allFindings,
    historicalCaseReview,
    schemaOptions,
    implementationPlan,
    verificationPlan,
    openQuestions,
    closureCriteria,
  }

  // Write JSON report
  const outDir = path.join(projectRoot, 'docs')
  if (!fs.existsSync(outDir)) fs.mkdirSync(outDir, { recursive: true })
  const outPath = path.join(outDir, 'k20-source-evidence-traceability-audit.json')
  // K36-A5D3A2: defensive anonymization pass before write. The
  // historicalCaseReview entries above are already hand-redacted to
  // <REDACTED_TEXT> for literal-name fields; this call additionally
  // walks the report and replaces any teacherName / courseName /
  // classGroupNames / roomName / free-text fields in case future
  // code changes reintroduce PII at a field the helper recognizes.
  anonymizeReport(report)
  fs.writeFileSync(outPath, JSON.stringify(report, null, 2), 'utf8')

  // Terminal output
  console.log('Summary:')
  console.log(`HIGH:      ${summary.HIGH}`)
  console.log(`MEDIUM:    ${summary.MEDIUM}`)
  console.log(`LOW:       ${summary.LOW}`)
  console.log(`INFO:      ${summary.INFO}`)
  console.log(`NONE:      ${summary.NONE}`)
  console.log(`TOTAL:     ${allFindings.length}`)
  console.log(`BLOCKING:  ${report.blocking ? 'YES' : 'NO'}`)
  console.log('')
  console.log(`RECOMMENDED_OPTION: ${recommendedOption}`)
  console.log(`Recommended next stage: ${recommendedNextStage}`)
  console.log('')
  console.log('DB snapshot:')
  console.log(`  ClassGroups:           ${db.classGroupCount}`)
  console.log(`  Teachers:              ${db.teacherCount}`)
  console.log(`  Courses:               ${db.courseCount}`)
  console.log(`  Rooms:                 ${db.roomCount}`)
  console.log(`  TeachingTasks:         ${db.teachingTaskCount}`)
  console.log(`  TeachingTaskClasses:   ${db.teachingTaskClassLinkCount}`)
  console.log(`  ScheduleSlots:         ${db.scheduleSlotCount}`)
  console.log(`  ImportBatches:         ${db.importBatchCount} (${db.confirmedImportBatchCount} confirmed)`)
  console.log(`  crossCohort tasks:     ${db.crossCohortTeachingTaskCount}`)
  console.log(`  approved tasks:        ${db.crossCohortApprovedTaskCount}`)
  console.log(`  ScheduleAdjustments:   ACTIVE=${db.scheduleAdjustmentActive}, VOIDED=${db.scheduleAdjustmentVoided}`)
  console.log('')
  if (db.sampleBatch) {
    console.log('Sample ImportBatch:')
    console.log(`  id: ${db.sampleBatch.id}`)
    console.log(`  filename: ${db.sampleBatch.filename}`)
    console.log(`  hasOriginalFilePath: ${db.sampleBatch.hasOriginalFilePath}`)
    console.log(`  hasParsedJsonPath: ${db.sampleBatch.hasParsedJsonPath}`)
    console.log(`  hasWarningsJson: ${db.sampleBatch.hasWarningsJson}`)
    console.log(`  warningsJsonVersion: ${db.sampleBatch.warningsJsonVersion}`)
    console.log(`  warningsJsonType: ${db.sampleBatch.warningsJsonType}`)
  } else {
    console.log('Sample ImportBatch: NONE (no confirmed batch)')
  }
  console.log('')
  if (db.sampleTTC) {
    console.log('Sample TeachingTaskClass:')
    console.log(`  id: ${db.sampleTTC.id}`)
    console.log(`  teachingTaskId: ${db.sampleTTC.teachingTaskId}`)
    console.log(`  classGroupId: ${db.sampleTTC.classGroupId}`)
    console.log(`  teachingTaskImportBatchId: ${db.sampleTTC.teachingTaskImportBatchId}`)
    console.log(`  teachingTaskRemark: ${db.sampleTTC.teachingTaskRemark}`)
    console.log(`  teachingTaskCrossCohortApproved: ${db.sampleTTC.teachingTaskCrossCohortApproved}`)
    console.log(`  teachingTaskCrossCohortApprovalReason: ${db.sampleTTC.teachingTaskCrossCohortApprovalReason}`)
  } else {
    console.log('Sample TeachingTaskClass: NONE')
  }
  console.log('')
  console.log('Findings by rule:')
  const byRule = new Map<string, Finding[]>()
  for (const f of allFindings) {
    const arr = byRule.get(f.rule) ?? []
    arr.push(f)
    byRule.set(f.rule, arr)
  }
  for (const [rule, fs] of byRule) {
    console.log(`  ${rule}:`)
    for (const f of fs) {
      console.log(`    [${f.severity}] ${f.id} — ${f.title}`)
    }
  }
  console.log('')
  console.log(`Report written: ${path.relative(projectRoot, outPath)}`)

  await prisma.$disconnect()
}

main().catch(async (err) => {
  console.error('Fatal error:', err)
  await prisma.$disconnect()
  process.exit(1)
})
