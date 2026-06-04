/**
 * K19-FIX-B2 Frontend Cross-Cohort Approval UI Verification
 *
 * Pure function tests — no DB access, no side effects.
 * Validates that frontend helpers correctly parse warnings, validate approvals,
 * build payloads, and map errors.
 */

import {
  parseCrossCohortWarnings,
  normalizeWarnings,
  validateApprovalState,
  buildCrossCohortApprovalPayload,
  mapApprovalError,
} from '@/lib/import/cross-cohort-approval-ui'
import type { ApprovalState } from '@/lib/import/cross-cohort-approval-ui'

interface TestResult {
  name: string
  pass: boolean
  detail?: string
}

const results: TestResult[] = []

function pass(name: string) {
  results.push({ name, pass: true })
  console.log(`  PASS: ${name}`)
}

function fail(name: string, detail: string) {
  results.push({ name, pass: false, detail })
  console.log(`  FAIL: ${name} — ${detail}`)
}

// ── Helper warning strings (matching B1 backend format) ──

function likelyErrorWarning(taskKey: string): string {
  return `LIKELY_ERROR_CROSS_COHORT: course="机械制图" links 2 cohorts (2024,2025) — not a known public course; review manually (taskKey=${taskKey})`
}

function legalPublicWarning(taskKey: string): string {
  return `LEGAL_PUBLIC_CROSS_COHORT: course="习近平新时代中国特色社会主义思想概论" links 2 cohorts (2024,2025) — allowed as public-course 合班 (taskKey=${taskKey})`
}

function ambiguousWarning(): string {
  return 'AMBIGUOUS_CLASSGROUP_MATCH: keyword "森防" weak-matches 2 classes: 2024级森林草原防火技术1班, 2025级森林草原防火技术1班 — not auto-linked'
}

function weakMatchWarning(): string {
  return 'COHORT_WEAK_MATCH_KEPT (weak-match, kept): keyword "森防" weak-matched 1 candidate "2025级森林草原防火技术1班" after cohort filter'
}

function businessWarning(): string {
  return '业务空值(缺教师): 17 条'
}

// ── Tests ──

async function main() {
  console.log('K19-FIX-B2 Frontend Cross-Cohort Approval UI Verification')
  console.log('='.repeat(60))

  // ── T1: legacy string[] warnings can be parsed ──
  {
    const warnings = [businessWarning(), likelyErrorWarning('机械制图|赵春超|ALL|1|16'), legalPublicWarning('习近平新时代中国特色社会主义思想概论|房忠敏|ALL|1|16')]
    const summary = parseCrossCohortWarnings(warnings)
    if (summary.suspiciousTasks.length === 1 && summary.legalPublics.length === 1) {
      pass('T1: legacy string[] warnings can be parsed')
    } else {
      fail('T1', `expected 1 suspicious + 1 legal, got suspicious=${summary.suspiciousTasks.length} legal=${summary.legalPublics.length}`)
    }
  }

  // ── T2: versioned warnings object can be parsed ──
  {
    const versioned = {
      version: 2,
      generatedAt: '2026-06-03T12:00:00Z',
      warnings: [likelyErrorWarning('机械制图|赵春超|ALL|1|16')],
      crossCohortApprovals: [],
    }
    const normalized = normalizeWarnings(versioned)
    const summary = parseCrossCohortWarnings(normalized)
    if (normalized.length === 1 && summary.suspiciousTasks.length === 1) {
      pass('T2: versioned warnings object can be parsed')
    } else {
      fail('T2', `normalized=${normalized.length} suspicious=${summary.suspiciousTasks.length}`)
    }
  }

  // ── T3: LIKELY_ERROR generates required suspicious task ──
  {
    const warnings = [likelyErrorWarning('机械制图|赵春超|ALL|1|16')]
    const summary = parseCrossCohortWarnings(warnings)
    if (summary.suspiciousTasks.length === 1 && summary.suspiciousTasks[0].taskKey === '机械制图|赵春超|ALL|1|16' && summary.suspiciousTasks[0].courseName === '机械制图') {
      pass('T3: LIKELY_ERROR generates required suspicious task with correct taskKey')
    } else {
      fail('T3', `got ${JSON.stringify(summary.suspiciousTasks)}`)
    }
  }

  // ── T4: LEGAL_PUBLIC does not generate required approval ──
  {
    const warnings = [legalPublicWarning('习近平新时代中国特色社会主义思想概论|房忠敏|ALL|1|16')]
    const summary = parseCrossCohortWarnings(warnings)
    if (summary.suspiciousTasks.length === 0 && summary.legalPublics.length === 1) {
      pass('T4: LEGAL_PUBLIC does not generate required approval')
    } else {
      fail('T4', `suspicious=${summary.suspiciousTasks.length} legal=${summary.legalPublics.length}`)
    }
  }

  // ── T5: AMBIGUOUS does not generate required approval ──
  {
    const warnings = [ambiguousWarning()]
    const summary = parseCrossCohortWarnings(warnings)
    if (summary.suspiciousTasks.length === 0 && summary.ambiguous.length === 1) {
      pass('T5: AMBIGUOUS does not generate required approval')
    } else {
      fail('T5', `suspicious=${summary.suspiciousTasks.length} ambiguous=${summary.ambiguous.length}`)
    }
  }

  // ── T6: COHORT_WEAK_MATCH_KEPT does not generate required approval ──
  {
    const warnings = [weakMatchWarning()]
    const summary = parseCrossCohortWarnings(warnings)
    if (summary.suspiciousTasks.length === 0 && summary.weakMatches.length === 1) {
      pass('T6: COHORT_WEAK_MATCH_KEPT does not generate required approval')
    } else {
      fail('T6', `suspicious=${summary.suspiciousTasks.length} weak=${summary.weakMatches.length}`)
    }
  }

  // ── T7: missing checkbox → confirm disabled ──
  {
    const tasks = [{ taskKey: '机械制图|赵春超|ALL|1|16', title: '机械制图', warningText: '...', courseName: '机械制图' }]
    const approvals: Record<string, ApprovalState> = {}
    const validation = validateApprovalState(tasks, approvals)
    if (!validation.ready && validation.reasons.length === 1) {
      pass('T7: missing checkbox → confirm disabled')
    } else {
      fail('T7', `ready=${validation.ready} reasons=${validation.reasons.length}`)
    }
  }

  // ── T8: checkbox checked but reason < 5 → confirm disabled ──
  {
    const tasks = [{ taskKey: '机械制图|赵春超|ALL|1|16', title: '机械制图', warningText: '...', courseName: '机械制图' }]
    const approvals: Record<string, ApprovalState> = {
      '机械制图|赵春超|ALL|1|16': { checked: true, reason: 'ok' },
    }
    const validation = validateApprovalState(tasks, approvals)
    if (!validation.ready && validation.reasons.some((r) => r.includes('审批原因'))) {
      pass('T8: checkbox checked but reason < 5 → confirm disabled')
    } else {
      fail('T8', `ready=${validation.ready} reasons=${JSON.stringify(validation.reasons)}`)
    }
  }

  // ── T9: checkbox checked + reason >= 5 → confirm enabled ──
  {
    const tasks = [{ taskKey: '机械制图|赵春超|ALL|1|16', title: '机械制图', warningText: '...', courseName: '机械制图' }]
    const approvals: Record<string, ApprovalState> = {
      '机械制图|赵春超|ALL|1|16': { checked: true, reason: '跨年级合班已确认' },
    }
    const validation = validateApprovalState(tasks, approvals)
    if (validation.ready && validation.reasons.length === 0) {
      pass('T9: checkbox checked + reason >= 5 → confirm enabled')
    } else {
      fail('T9', `ready=${validation.ready} reasons=${JSON.stringify(validation.reasons)}`)
    }
  }

  // ── T10: payload only contains approved LIKELY_ERROR tasks ──
  {
    const tasks = [
      { taskKey: '机械制图|赵春超|ALL|1|16', title: '机械制图', warningText: '...', courseName: '机械制图' },
      { taskKey: '电子技术|许进|ALL|1|16', title: '电子技术', warningText: '...', courseName: '电子技术' },
    ]
    const approvals: Record<string, ApprovalState> = {
      '机械制图|赵春超|ALL|1|16': { checked: true, reason: '跨年级合班已确认' },
      // 电子技术 not approved
    }
    const payload = buildCrossCohortApprovalPayload(tasks, approvals)
    if (payload.length === 1 && payload[0].taskKey === '机械制图|赵春超|ALL|1|16' && payload[0].approved === true) {
      pass('T10: payload only contains approved LIKELY_ERROR tasks')
    } else {
      fail('T10', `payload=${JSON.stringify(payload)}`)
    }
  }

  // ── T11: confirmText gating and cross-cohort gating can both apply ──
  {
    // Simulate: hasBlocking (from quality) + crossCohortBlocking (from approvals)
    // Both should independently block confirm
    const tasks = [{ taskKey: '机械制图|赵春超|ALL|1|16', title: '机械制图', warningText: '...', courseName: '机械制图' }]
    const emptyApprovals: Record<string, ApprovalState> = {}
    const validation = validateApprovalState(tasks, emptyApprovals)
    // crossCohortBlocking = hasLikelyErrors && !validation.ready
    const crossCohortBlocking = tasks.length > 0 && !validation.ready
    // hasBlocking from quality (independent)
    const hasQualityBlocking = true
    // confirm disabled = hasQualityBlocking || crossCohortBlocking
    const confirmDisabled = hasQualityBlocking || crossCohortBlocking
    if (confirmDisabled && crossCohortBlocking && hasQualityBlocking) {
      pass('T11: confirmText gating and cross-cohort gating can both apply')
    } else {
      fail('T11', `disabled=${confirmDisabled} cross=${crossCohortBlocking} quality=${hasQualityBlocking}`)
    }
  }

  // ── T12: backend 409 approval error maps to user-readable error ──
  {
    const err1 = mapApprovalError('CROSS_COHORT_APPROVAL_REQUIRED: Missing crossCohortApproval for LIKELY_ERROR taskKey="x"')
    const err2 = mapApprovalError('Cross-cohort approval reason required (>= 5 chars)')
    const err3 = mapApprovalError('Some other error')
    if (err1 && err1.includes('未确认') && err2 && err2.includes('原因不完整') && err3 === null) {
      pass('T12: backend 409 approval error maps to user-readable error')
    } else {
      fail('T12', `err1=${err1} err2=${err2} err3=${err3}`)
    }
  }

  // ── T13: duplicate LIKELY_ERROR warnings are deduplicated ──
  {
    const tk = '机械制图|赵春超|ALL|1|16'
    const warnings = [likelyErrorWarning(tk), likelyErrorWarning(tk)]
    const summary = parseCrossCohortWarnings(warnings)
    if (summary.suspiciousTasks.length === 1) {
      pass('T13: duplicate LIKELY_ERROR warnings are deduplicated')
    } else {
      fail('T13', `expected 1, got ${summary.suspiciousTasks.length}`)
    }
  }

  // ── T14: normalizeWarnings handles null/undefined gracefully ──
  {
    const r1 = normalizeWarnings(null)
    const r2 = normalizeWarnings(undefined)
    const r3 = normalizeWarnings('not an array')
    if (r1.length === 0 && r2.length === 0 && r3.length === 0) {
      pass('T14: normalizeWarnings handles null/undefined gracefully')
    } else {
      fail('T14', `r1=${r1.length} r2=${r2.length} r3=${r3.length}`)
    }
  }

  // ── T15: no cross-cohort warnings → approval validation passes ──
  {
    const tasks: never[] = []
    const validation = validateApprovalState(tasks as never, {})
    if (validation.ready && validation.reasons.length === 0) {
      pass('T15: no cross-cohort warnings → approval validation passes')
    } else {
      fail('T15', `ready=${validation.ready}`)
    }
  }

  // ── T16: taskKey from warning matches buildApprovalTaskKey format ──
  {
    // buildApprovalTaskKey('机械制图', '赵春超', 'ALL', 1, 16) = '机械制图|赵春超|ALL|1|16'
    const expectedKey = '机械制图|赵春超|ALL|1|16'
    const warning = likelyErrorWarning(expectedKey)
    const summary = parseCrossCohortWarnings([warning])
    if (summary.suspiciousTasks[0]?.taskKey === expectedKey) {
      pass('T16: taskKey from warning matches buildApprovalTaskKey format')
    } else {
      fail('T16', `expected="${expectedKey}" got="${summary.suspiciousTasks[0]?.taskKey}"`)
    }
  }

  // ── Summary ──
  console.log('')
  console.log('='.repeat(60))
  const passed = results.filter((r) => r.pass).length
  const failed = results.filter((r) => !r.pass).length
  console.log(`Summary: ${passed} PASS / ${failed} FAIL`)
  if (failed > 0) {
    console.log('')
    console.log('Failed tests:')
    for (const r of results.filter((r) => !r.pass)) {
      console.log(`  ${r.name}: ${r.detail}`)
    }
  }
  console.log('='.repeat(60))

  if (failed > 0) process.exit(1)
}

main().catch((e) => {
  console.error('Verification failed:', e)
  process.exit(1)
})
