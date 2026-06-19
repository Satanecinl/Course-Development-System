/**
 * K39-A: Import rules settings UI client helper — diagnostic enhanced version.
 *
 * Backward-compatible: old fields still present.
 * New top-level keys: moduleVersion, sourceEvidence, crossCohortGuard,
 * importLifecycleRules, duplicateImportPolicy, editability, ruleGroups.
 */

/* ── Legacy top-level keys (backward-compatible) ── */

export interface ImportRulesLegacySummary {
  importBatchCount: number
  confirmedImportCount: number
  failedImportCount: number
  rolledBackImportCount: number
  recentImportBatchCount: number
  teachingTaskClassWithEvidenceCount: number
  teachingTaskClassWithoutEvidenceCount: number
  tcsWithKeyword: number
  tcsWithClassName: number
  tcsWithStrategy: number
}

export interface ImportRuleItem {
  key: string
  label: string
  value: string | boolean | number | null
  status: 'active' | 'fixed' | 'planned' | 'partial' | 'unknown' | 'hard-locked' | 'historical-gap'
  editable: boolean
  source: string
  description: string
}

export interface ImportSafeguardItem {
  key: string
  label: string
  enabled: boolean
  severity: 'hard' | 'warning' | 'info'
  description: string
}

export interface ImportBatchListItem {
  id: number
  filename: string | null
  status: string | null
  semesterId: number | null
  createdAt: string | null
  confirmedAt: string | null
  rolledBackAt: string | null
  recordCount: number | null
  createdTaskCount: number | null
  createdSlotCount: number | null
  errorMessage: string | null
  warningCount: number
}

/* ── K39-A enhanced fields ── */

export interface ImportRulesEnhancedSummary {
  importBatchTotal: number
  confirmedCount: number
  pendingCount: number
  failedCount: number
  rolledBackCount: number
  abandonedCount: number
  latestBatch: { id: number; filename: string | null; status: string | null; createdAt: string } | null
  latestConfirmedBatch: { id: number; filename: string | null; confirmedAt: string } | null
  activeSemester: { id: number; name: string; code: string } | null
}

export interface ImportRulesSourceEvidence {
  totalTeachingTaskClassLinks: number
  withImportBatchId: number
  missingImportBatchId: number
  withSourceRowIndex: number
  withSourceKeyword: number
  withSourceClassName: number
  withSourceRemark: number
  withSourceArtifactFilename: number
  withMatchStrategy: number
  evidenceCoveragePercent: number
  historicalBackfillAvailable: boolean
  forwardOnly: boolean
  explanation: string
}

export interface ImportRulesCrossCohortGuard {
  detectionEnabled: boolean
  approvalRequired: boolean
  dryRunWarningCode: string
  confirmErrorCode: string
  approvalField: string
  hardLocked: boolean
}

export interface ImportLifecyclePhase {
  phase: string
  label: string
  writesDb: boolean
  permission: string
  safetyGuard: string
  configurable: boolean
}

export interface ImportDuplicatePolicy {
  repeatedImportBehavior: string
  conflictHandling: string
  sourceArtifactHandling: string
  configurable: boolean
}

export interface ImportEditability {
  allRulesEditable: boolean
  defaultSemesterEditable: boolean
  crossCohortApprovalEditable: boolean
  sourceEvidenceBackfillEditable: boolean
  duplicatePolicyEditable: boolean
  nextConfigStage: string
}

export interface ImportRuleGroup {
  groupKey: string
  groupLabel: string
  groupIcon: string
  rules: Array<{
    id: string
    title: string
    status: string
    severity: string
    locked: boolean
    source: string
    description: string
    impact: string
    editable: boolean
    nextStage?: string
  }>
}

/* ── Combined response type ── */

export interface ImportRulesData {
  /* legacy fields (backward-compatible) */
  summary: ImportRulesLegacySummary
  rules: ImportRuleItem[]
  safeguards: ImportSafeguardItem[]
  recentBatches: ImportBatchListItem[]

  /* K39-A enhanced fields */
  moduleVersion: string
  enhancedSummary: ImportRulesEnhancedSummary
  sourceEvidence: ImportRulesSourceEvidence
  crossCohortGuard: ImportRulesCrossCohortGuard
  importLifecycleRules: ImportLifecyclePhase[]
  duplicateImportPolicy: ImportDuplicatePolicy
  editability: ImportEditability
  ruleGroups: ImportRuleGroup[]
}

export async function fetchImportRules(): Promise<ImportRulesData> {
  const res = await fetch('/api/admin/settings/import-rules')
  if (!res.ok) throw new Error(`HTTP ${res.status}`)
  const data = await res.json()
  if (!data.success) throw new Error(data.message || data.error || '请求失败')
  return data as ImportRulesData
}
