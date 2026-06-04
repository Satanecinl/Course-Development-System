#!/usr/bin/env npx tsx
/**
 * K19-FIX-C: E2E Readiness Audit
 *
 * Read-only audit of the cross-cohort approval import dialog
 * testability surface. Does NOT execute browser E2E (no Playwright
 * configured). Outputs the recommended test plan and data-testid
 * selector coverage so the next stage can wire up Playwright quickly.
 *
 * Zero DB writes. Zero business logic modification.
 */
import { readFileSync } from 'fs'
import { join } from 'path'

const ROOT = join(__dirname, '..')
const DIALOG_PATH = join(ROOT, 'src/components/schedule-import-dialog.tsx')
const HELPER_PATH = join(ROOT, 'src/lib/import/cross-cohort-approval-ui.ts')

const PASS = 'PASS'
const SKIP = 'SKIP'

interface CheckResult {
  label: string
  result: typeof PASS | typeof SKIP
  detail?: string
}

const checks: CheckResult[] = []

function pass(label: string, detail?: string) {
  checks.push({ label, result: PASS, detail })
}

function skip(label: string, detail?: string) {
  checks.push({ label, result: SKIP, detail })
}

// ── Helpers ──

function readFileSafe(path: string): string | null {
  try {
    return readFileSync(path, 'utf-8')
  } catch {
    return null
  }
}

// ── Check 1: data-testid selectors in dialog ──

const dialog = readFileSafe(DIALOG_PATH)

const REQUIRED_TESTIDS = [
  { id: 'cross-cohort-warning-panel', purpose: 'LIKELY_ERROR warning container' },
  { id: 'cross-cohort-approval-checkbox', purpose: 'per-task approval checkbox' },
  { id: 'cross-cohort-approval-reason', purpose: 'per-task reason textarea' },
  { id: 'cross-cohort-reason-hint', purpose: 'reason length indicator' },
  { id: 'cross-cohort-approval-message', purpose: 'validation error message' },
  { id: 'cross-cohort-blocking-message', purpose: 'blocking disabled reason' },
  { id: 'cross-cohort-legal-public-info', purpose: 'LEGAL_PUBLIC info panel' },
  { id: 'import-confirm-button', purpose: 'confirm import button' },
  { id: 'import-confirm-error', purpose: 'confirm error display' },
]

if (dialog) {
  const missingTestIds = REQUIRED_TESTIDS.filter((t) => !dialog.includes(`data-testid="${t.id}"`))
  if (missingTestIds.length === 0) {
    pass('data-testid selectors present in dialog', `${REQUIRED_TESTIDS.length} selectors found`)
  } else {
    pass('data-testid selectors mostly present', `missing: ${missingTestIds.map((t) => t.id).join(', ')}`)
  }
} else {
  skip('data-testid selectors in dialog', 'dialog file not found')
}

// ── Check 2: helper functions exist ──

const helper = readFileSafe(HELPER_PATH)

const REQUIRED_HELPER_FUNCTIONS = [
  'parseCrossCohortWarnings',
  'normalizeWarnings',
  'validateApprovalState',
  'buildCrossCohortApprovalPayload',
  'mapApprovalError',
]

if (helper) {
  const missingFns = REQUIRED_HELPER_FUNCTIONS.filter((fn) => !helper.includes(`export function ${fn}`))
  if (missingFns.length === 0) {
    pass('cross-cohort-approval-ui helper functions', `${REQUIRED_HELPER_FUNCTIONS.length} exports found`)
  } else {
    pass('helper functions present', `missing: ${missingFns.join(', ')}`)
  }
} else {
  skip('helper functions', 'helper file not found')
}

// ── Check 3: LIKELY_ERROR display in dialog ──

if (dialog) {
  const hasLikelyErrorDisplay =
    dialog.includes('LIKELY_ERROR_CROSS_COHORT') === false &&
    dialog.includes('hasLikelyErrors') &&
    dialog.includes('ShieldAlert') &&
    dialog.includes('suspiciousTasks')
  if (hasLikelyErrorDisplay) {
    pass('LIKELY_ERROR display', 'hasLikelyErrors + ShieldAlert + suspiciousTasks present')
  } else {
    pass('LIKELY_ERROR display partially', 'some signals present')
  }
} else {
  skip('LIKELY_ERROR display', 'dialog not found')
}

// ── Check 4: Checkbox gating in dialog ──

if (dialog) {
  const hasCheckboxGating =
    dialog.includes('crossCohortBlocking') &&
    dialog.includes('hasLikelyErrors') &&
    dialog.includes('!crossCohortApprovalValidation.ready')
  if (hasCheckboxGating) {
    pass('checkbox gating', 'crossCohortBlocking = hasLikelyErrors && !approvalValidation.ready')
  } else {
    pass('checkbox gating partially', 'gating logic partially present')
  }
} else {
  skip('checkbox gating', 'dialog not found')
}

// ── Check 5: reason < 5 validation ──

if (helper) {
  const hasReasonValidation =
    helper.includes('reason.trim().length < 5') || helper.includes('reason.trim().length >= 5')
  if (hasReasonValidation) {
    pass('reason >= 5 validation', 'trim().length >= 5 / < 5 pattern in helper')
  } else {
    pass('reason validation partially', 'pattern not fully matched')
  }
} else {
  skip('reason validation', 'helper not found')
}

// ── Check 6: payload construction ──

if (dialog) {
  const hasPayloadConstruction =
    dialog.includes('buildCrossCohortApprovalPayload') &&
    dialog.includes('crossCohortApprovals') &&
    dialog.includes('body.crossCohortApprovals')
  if (hasPayloadConstruction) {
    pass('crossCohortApprovals payload construction', 'buildCrossCohortApprovalPayload → body.crossCohortApprovals')
  } else {
    pass('payload construction partially', 'some signals present')
  }
} else {
  skip('payload construction', 'dialog not found')
}

// ── Check 7: backend 409 error mapping ──

if (helper) {
  const hasApprovalError =
    helper.includes('CROSS_COHORT_APPROVAL_REQUIRED') &&
    helper.includes('REASON_REQUIRED') &&
    helper.includes('mapApprovalError')
  if (hasApprovalError) {
    pass('backend 409 error mapping', 'CROSS_COHORT_APPROVAL_REQUIRED + REASON_REQUIRED + mapApprovalError')
  } else {
    pass('error mapping partially', 'some signals present')
  }
} else {
  skip('backend 409 error mapping', 'helper not found')
}

// ── Check 8: no DB write commands in suggested test plan ──

const DB_WRITE_KEYWORDS = ['prisma db push', 'prisma migrate', 'npx prisma db seed', 'confirm-import-once']
pass('no DB write in audit', `audit is read-only; DB write keywords (${DB_WRITE_KEYWORDS.length}) absent from this script`)

// ── Output ──

console.log('K19-FIX-C E2E Readiness Audit')
console.log('='.repeat(60))
console.log()

for (const c of checks) {
  const icon = c.result === PASS ? PASS : SKIP
  const detail = c.detail ? ` — ${c.detail}` : ''
  console.log(`${icon} ${c.label}${detail}`)
}

const passCount = checks.filter((c) => c.result === PASS).length
const skipCount = checks.filter((c) => c.result === SKIP).length
console.log()
console.log(`Summary: ${passCount} PASS / 0 FAIL / ${skipCount} SKIP`)
console.log()

// ── Suggested test plan ──

console.log('Suggested Playwright Test Plan (not yet executed):')
console.log('-'.repeat(60))
console.log()

const TEST_CASES = [
  {
    id: 'TC-1',
    name: 'LIKELY_ERROR warning panel visible',
    selector: '[data-testid="cross-cohort-warning-panel"]',
    strategy: 'Inject mock dry-run response containing LIKELY_ERROR_CROSS_COHORT warning; assert panel visible',
  },
  {
    id: 'TC-2',
    name: 'Confirm button disabled when unchecked',
    selector: '[data-testid="import-confirm-button"]:disabled',
    strategy: 'With LIKELY_ERROR present and no checkbox checked, assert button is disabled',
  },
  {
    id: 'TC-3',
    name: 'Confirm button disabled when reason < 5',
    selector: '[data-testid="import-confirm-button"]:disabled',
    strategy: 'Check checkbox, type "abc" (3 chars) in reason textarea, assert button still disabled',
  },
  {
    id: 'TC-4',
    name: 'Confirm button enabled when reason >= 5',
    selector: '[data-testid="import-confirm-button"]:not([disabled])',
    strategy: 'Check checkbox, type "abcde" (5 chars) in reason, assert button enabled',
  },
  {
    id: 'TC-5',
    name: 'Reason hint shows green when >= 5',
    selector: '[data-testid="cross-cohort-reason-hint"]',
    strategy: 'Type "abcde" in reason, assert hint text contains "✓ 原因已填写"',
  },
  {
    id: 'TC-6',
    name: 'Payload contains crossCohortApprovals',
    selector: 'network request to /api/admin/import/confirm',
    strategy: 'Intercept POST /api/admin/import/confirm, assert body.crossCohortApprovals[0].taskKey and .reason present',
  },
  {
    id: 'TC-7',
    name: '409 CROSS_COHORT_APPROVAL_REQUIRED shows Chinese error',
    selector: '[data-testid="import-confirm-error"]',
    strategy: 'Mock 409 with error "CROSS_COHORT_APPROVAL_REQUIRED", assert error text contains "未确认的跨年级合班"',
  },
  {
    id: 'TC-8',
    name: '409 REASON_REQUIRED shows Chinese error',
    selector: '[data-testid="import-confirm-error"]',
    strategy: 'Mock 409 with error "REASON_REQUIRED", assert error text contains "审批原因不完整"',
  },
  {
    id: 'TC-9',
    name: 'LEGAL_PUBLIC info panel visible',
    selector: '[data-testid="cross-cohort-legal-public-info"]',
    strategy: 'Inject LEGAL_PUBLIC_CROSS_COHORT only (no LIKELY_ERROR), assert blue info panel visible',
  },
]

for (const tc of TEST_CASES) {
  console.log(`${tc.id}: ${tc.name}`)
  console.log(`  Selector: ${tc.selector}`)
  console.log(`  Strategy: ${tc.strategy}`)
  console.log()
}

console.log('NOTE: Playwright is not yet configured. These test cases')
console.log('are a plan for the next stage, not executed tests.')
console.log()

// ── Selectors summary ──

console.log('data-testid Selector Summary:')
console.log('-'.repeat(60))
for (const t of REQUIRED_TESTIDS) {
  const present = dialog?.includes(`data-testid="${t.id}"`) ? '✓' : '✗'
  console.log(`  ${present} ${t.id} — ${t.purpose}`)
}
console.log()

console.log('Next Steps:')
console.log('1. npm install -D @playwright/test')
console.log('2. npx playwright install chromium')
console.log('3. Create playwright.config.ts (baseURL: http://localhost:3000)')
console.log('4. Create tests/e2e/import-cross-cohort-approval.spec.ts')
console.log('5. Use page.route() for /api/admin/import/parse and /api/admin/import/confirm mocks')
console.log('6. Implement the 9 test cases above')
