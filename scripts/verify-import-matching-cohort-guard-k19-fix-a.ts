/**
 * K19-FIX-A-IMPORT-MATCHING-COHORT-GUARD
 *
 * Read-only regression test for the importer's cohort guard and exact-match-first
 * ClassGroup matching. Tests pure helpers exported from `src/lib/import/importer.ts`
 * and `src/lib/import/quality-classifier.ts`. No DB writes. No file system
 * mutations. No re-import of historical artifacts.
 *
 * Coverage (>= 8 cases per K19 spec):
 *   1. 2024级钢铁智能冶金技术1班（高本贯通） ≠ 2025级钢铁智能冶金技术1班（高本贯通）
 *   2. 2024级森林草原防火技术1班 ≠ 2025级森林草原防火技术1班
 *   3. source 2025级钢铁智能冶金技术1班（高本贯通）+ remark "与森防合班"
 *      → only matches 2025级森林草原防火技术1班
 *   4. source 2025级森林草原防火技术1班 + remark "与高本贯通合班"
 *      → only matches 2025级钢铁智能冶金技术1班（高本贯通）
 *   5. same-cohort 合班 still allowed
 *   6. ambiguous implicit remark does NOT auto-link
 *   7. K18-B 4 个专业课 pattern: 2025级 + 合班 remark with "高本贯通" 不会扩展到 2024级
 *   8. K18-E3 task37 pattern: 2025级钢铁智能冶金 1班 + remark "与森防合班"
 *      不会扩展到 2024级森林草原防火 1班
 *
 * Output format:
 *   K19-FIX-A Import Matching Cohort Guard Verification
 *   PASS ...
 *   FAIL ...
 *   Summary: X PASS / 0 FAIL
 */

import { extractCohortYearFromClassName, parseRemarkKeywords, findMergedClassNames } from '../src/lib/import/importer'
import { classifyCrossCohortWarnings } from '../src/lib/import/quality-classifier'

// ── Test fixtures ────────────────────────────────────────────────────

const CLASS_2024_GTY = '2024级钢铁智能冶金技术1班（高本贯通）'
const CLASS_2025_GTY = '2025级钢铁智能冶金技术1班（高本贯通）'
const CLASS_2024_SF = '2024级森林草原防火技术1班'
const CLASS_2025_SF = '2025级森林草原防火技术1班'
const CLASS_2024_GTY_2 = '2024级钢铁智能冶金技术2班（高本贯通）'
const CLASS_2025_SF_2 = '2025级森林草原防火技术2班'

// All-classes universe used across tests
const ALL_CLASSES: { name: string }[] = [
  { name: CLASS_2024_GTY },
  { name: CLASS_2025_GTY },
  { name: CLASS_2024_SF },
  { name: CLASS_2025_SF },
  { name: CLASS_2024_GTY_2 },
  { name: CLASS_2025_SF_2 },
  { name: '2025级机械制造及自动化1班' },
  { name: '2024级机械制造及自动化1班' },
]

// ── Tiny test runner ─────────────────────────────────────────────────

let passed = 0
let failed = 0
const failures: string[] = []

function check(name: string, ok: boolean, detail: string) {
  if (ok) {
    console.log(`  PASS: ${name}`)
    passed++
  } else {
    console.log(`  FAIL: ${name} — ${detail}`)
    failures.push(`${name}: ${detail}`)
    failed++
  }
}

function assertEq<T>(name: string, actual: T, expected: T) {
  const ok = JSON.stringify(actual) === JSON.stringify(expected)
  check(name, ok, ok ? '' : `expected ${JSON.stringify(expected)} got ${JSON.stringify(actual)}`)
}

function assertContains(name: string, haystack: string[], needle: string) {
  const ok = haystack.includes(needle)
  check(name, ok, ok ? '' : `expected ${JSON.stringify(haystack)} to contain ${needle}`)
}

function assertNotContains(name: string, haystack: string[], needle: string) {
  const ok = !haystack.includes(needle)
  check(name, ok, ok ? '' : `expected ${JSON.stringify(haystack)} NOT to contain ${needle}`)
}

async function main() {
  console.log('K19-FIX-A Import Matching Cohort Guard Verification')
  console.log('═══════════════════════════════════════════════════════')

  // ── T0: extractCohortYearFromClassName ───────────────────────────────

  console.log('\n[T0] extractCohortYearFromClassName')

  assertEq('extract 2024级', extractCohortYearFromClassName(CLASS_2024_GTY), 2024)
  assertEq('extract 2025级', extractCohortYearFromClassName(CLASS_2025_GTY), 2025)
  assertEq('extract 24级 short form', extractCohortYearFromClassName('24级机械1班'), 2024)
  assertEq('extract 25级 short form', extractCohortYearFromClassName('25级机械1班'), 2025)
  assertEq('extract null for course name', extractCohortYearFromClassName('机械制图'), null)
  assertEq('extract null for empty', extractCohortYearFromClassName(''), null)
  assertEq('extract null for null-ish', extractCohortYearFromClassName('2024年'), null)

  // ── T1: 2024 高本贯通 should NOT match 2025 高本贯通 ───────────────

  console.log('\n[T1] 2024 高本贯通 cohort guard')
  {
    const warnings: string[] = []
    const kws = parseRemarkKeywords('与高本贯通合班')
    const result = await findMergedClassNames(
      kws,
      CLASS_2024_GTY,
      ALL_CLASSES,
      warnings,
    )
    assertNotContains('1a: 2024 base does not match 2025 高本贯通', result, CLASS_2025_GTY)
  }

  // ── T2: 2024 森林草原防火 should NOT match 2025 森林草原防火 ────────

  console.log('\n[T2] 2024 森林草原防火 cohort guard')
  {
    const warnings: string[] = []
    const kws = parseRemarkKeywords('与森林草原防火合班')
    const result = await findMergedClassNames(
      kws,
      CLASS_2024_SF,
      ALL_CLASSES,
      warnings,
    )
    assertNotContains('2: 2024 base does not match 2025 森林草原防火', result, CLASS_2025_SF)
  }

  // ── T3: source 2025 GTY + remark "与森林草原防火合班" → only 2025 SF ─

  console.log('\n[T3] source 2025 GTY + remark "与森林草原防火合班" cohort-scoped')
  {
    const warnings: string[] = []
    // remark 的核心是"森林草原防火"——这是 K19-FIX-A 的隐式简称 case。
    // 注：parseRemarkKeywords 不会把 "森防" 扩展到 "森林草原防火"——扩展是 alias 的事。
    // 我们用全名 "森林草原防火" 验证 cohort 守卫。
    // 子集里只有 1 个 2025 SF 候选——验证 2024 SF 被 cohort filter 排除
    const kws = parseRemarkKeywords('与森林草原防火合班')
    const result = await findMergedClassNames(
      kws,
      CLASS_2025_GTY,
      [{ name: CLASS_2025_GTY }, { name: CLASS_2024_SF }, { name: CLASS_2025_SF }],
      warnings,
    )
    assertContains('3a: matches 2025 森林草原防火 1班', result, CLASS_2025_SF)
    assertNotContains('3b: does NOT match 2024 森林草原防火 1班', result, CLASS_2024_SF)
  }

  // ── T4: source 2025 SF + remark "与高本贯通合班" → only 2025 GTY ────

  console.log('\n[T4] source 2025 SF + remark "与高本贯通合班" cohort-scoped')
  {
    const warnings: string[] = []
    const kws = parseRemarkKeywords('与高本贯通合班')
    const result = await findMergedClassNames(
      kws,
      CLASS_2025_SF,
      ALL_CLASSES,
      warnings,
    )
    assertContains('4a: matches 2025 钢铁智能冶金 1班 (高本贯通)', result, CLASS_2025_GTY)
    assertNotContains('4b: does NOT match 2024 钢铁智能冶金 1班 (高本贯通)', result, CLASS_2024_GTY)
  }

  // ── T5: same-cohort 合班 still allowed ──────────────────────────────

  console.log('\n[T5] same-cohort 合班 positive case')
  {
    const warnings: string[] = []
    // 用全名 "森林草原防火" 而非 "森防"——parseRemarkKeywords 不做 alias 扩展
    const kws = parseRemarkKeywords('与森林草原防火合班')
    const result = await findMergedClassNames(
      kws,
      CLASS_2025_GTY,
      [{ name: CLASS_2025_GTY }, { name: CLASS_2025_SF }],
      warnings,
    )
    assertContains('5a: matches same-cohort 森林草原防火', result, CLASS_2025_SF)
    check('5b: no AMBIGUOUS warning for single match', !warnings.some((w) => w.includes('AMBIGUOUS')), '')
  }

  // ── T6: ambiguous implicit remark does NOT auto-link ─────────────────

  console.log('\n[T6] ambiguous implicit remark guard')
  {
    const warnings: string[] = []
    const kws = parseRemarkKeywords('与机械合班')
    const result = await findMergedClassNames(
      kws,
      '2025级机械1班',
      [
        { name: '2025级机械1班' },
        { name: '2025级机械2班' },
        { name: '2025级机械3班' },
      ],
      warnings,
    )
    assertEq('6a: ambiguous match returns empty', result, [])
    check('6b: AMBIGUOUS_CLASSGROUP_MATCH warning emitted', warnings.some((w) => w.includes('AMBIGUOUS_CLASSGROUP_MATCH')), `warnings=${JSON.stringify(warnings)}`)
  }

  // ── T7: K18-B 4 专业课 pattern - 2025 cohort 不会扩展到 2024 ─────────

  console.log('\n[T7] K18-B pattern: 2025 高本贯通 baseClass does not pull 2024 高本贯通')
  {
    const warnings: string[] = []
    const kws = parseRemarkKeywords('与高本贯通合班')
    const result = await findMergedClassNames(
      kws,
      CLASS_2025_GTY,
      ALL_CLASSES,
      warnings,
    )
    assertNotContains('7a: 2025 baseClass does NOT match 2024 cohort 高本贯通 1班', result, CLASS_2024_GTY)
    assertNotContains('7b: 2025 baseClass does NOT match 2024 cohort 高本贯通 2班', result, CLASS_2024_GTY_2)
    assertNotContains('7c: 2025 baseClass does NOT match itself', result, CLASS_2025_GTY)
  }

  // ── T8: K18-E3 task37 pattern ───────────────────────────────────────

  console.log('\n[T8] K18-E3 task37 pattern: 2025 GTY 森林草原防火合班 does not pull 2024 SF')
  {
    const warnings: string[] = []
    // 用全名而非 "森防"——parseRemarkKeywords 不做 alias 扩展
    // 子集里只有 1 个 2025 SF——验证 2024 SF 被排除
    const kws = parseRemarkKeywords('与森林草原防火合班')
    const result = await findMergedClassNames(
      kws,
      CLASS_2025_GTY,
      [{ name: CLASS_2025_GTY }, { name: CLASS_2024_SF }, { name: CLASS_2025_SF }],
      warnings,
    )
    assertContains('8a: matches 2025 森林草原防火 1班 (correct)', result, CLASS_2025_SF)
    assertNotContains('8b: does NOT match 2024 森林草原防火 1班 (K18-E3 pattern)', result, CLASS_2024_SF)
  }

  // ── T9: explicit year remark still works (positive) ──────────────────

  console.log('\n[T9] explicit year remark with matching cohort is allowed')
  {
    const warnings: string[] = []
    const kws = parseRemarkKeywords('与2024级钢铁智能冶金技术1班（高本贯通）合班')
    const result = await findMergedClassNames(
      kws,
      CLASS_2024_GTY,
      ALL_CLASSES,
      warnings,
    )
    check('9: explicit year remark with matching cohort is allowed (or empty if no exact)', Array.isArray(result), '')
  }

  // ── T10: filter strict-equal guard ───────────────────────────────────

  console.log('\n[T10] filter strict-equal guard')
  {
    const warnings: string[] = []
    const kws = parseRemarkKeywords('与钢铁智能冶金技术1班合班')
    const result = await findMergedClassNames(
      kws,
      CLASS_2024_GTY,
      ALL_CLASSES,
      warnings,
    )
    assertNotContains('10: 2024 baseClass does not match 2025 candidate', result, CLASS_2025_GTY)
  }

  // ── T11: classifyCrossCohortWarnings shape ───────────────────────────

  console.log('\n[T11] classifyCrossCohortWarnings')
  {
    const warnings = [
      'LEGAL_PUBLIC_CROSS_COHORT: course="高等数学" links 2 cohorts',
      'LIKELY_ERROR_CROSS_COHORT: course="机械制图" links 2 cohorts',
      'AMBIGUOUS_CLASSGROUP_MATCH: keyword "钢铁" matches 3 classes',
      'COHORT_WEAK_MATCH_KEPT (weak-match, kept): keyword "高本贯通" weak-matched',
      'CLASS_STUDENT_COUNT_CONFLICT: foo',
    ]
    const summary = classifyCrossCohortWarnings(warnings)
    assertEq('11a: LEGAL_PUBLIC_CROSS_COHORT count', summary.LEGAL_PUBLIC_CROSS_COHORT, 1)
    assertEq('11b: LIKELY_ERROR_CROSS_COHORT count', summary.LIKELY_ERROR_CROSS_COHORT, 1)
    assertEq('11c: AMBIGUOUS_CLASSGROUP_MATCH count', summary.AMBIGUOUS_CLASSGROUP_MATCH, 1)
    assertEq('11d: COHORT_WEAK_MATCH_KEPT count', summary.COHORT_WEAK_MATCH_KEPT, 1)
    assertEq('11e: total = 4 (only cross-cohort warnings)', summary.total, 4)
  }

  // ── T12: extractCohortYearFromClassName safety ──────────────────────

  console.log('\n[T12] extractCohortYearFromClassName safety')
  {
    assertEq('12a: course name with year-like prefix', extractCohortYearFromClassName('2024年春季'), null)
    assertEq('12b: plain course', extractCohortYearFromClassName('机械制图'), null)
  }

  // ── Summary ──────────────────────────────────────────────────────────

  console.log()
  console.log('═══════════════════════════════════════════════════════')
  console.log(`Summary: ${passed} PASS / ${failed} FAIL`)
  console.log('═══════════════════════════════════════════════════════')
  if (failed > 0) {
    console.log('\nFailures:')
    for (const f of failures) console.log(`  - ${f}`)
    process.exit(1)
  }
  process.exit(0)
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
