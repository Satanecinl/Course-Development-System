/**
 * K20-FIX-B Source Evidence Importer Write Verification
 *
 * Read-only / pure verification that the importer's helper functions
 * correctly construct source-evidence fields:
 *
 *   - extractBasename: handles Windows + POSIX paths, plain filenames, null
 *   - deriveMatchAttributes: maps (MatchKind, crossCohortApproved) to (matchStrategy, matchConfidence)
 *   - buildTeachingTaskClassEvidence: produces all 8 fields with the documented semantics
 *
 * This script does NOT import against the real DB. It only imports the pure
 * helper functions from src/lib/import/importer.ts.
 *
 * Notes on limitations:
 *   - We do not call executeImportInTransaction directly because it requires
 *     a live Prisma transaction with classGroupMap / teacherMap / etc.
 *     Instead we test the building block that executeImportInTransaction
 *     calls per-link. This gives us full coverage of the write contract.
 *
 * Exits 0 on PASS, 1 on any FAIL.
 */

import {
  extractBasename,
  deriveMatchAttributes,
  buildTeachingTaskClassEvidence,
} from '../src/lib/import/importer'
import type { ImportScheduleRecord, ClassNameEvidence, MatchKind } from '../src/lib/import/importer'

let passCount = 0
let failCount = 0
const failures: string[] = []

function check(label: string, ok: boolean, detail?: string) {
  if (ok) {
    passCount++
    console.log(`  PASS: ${label}${detail ? ` — ${detail}` : ''}`)
  } else {
    failCount++
    failures.push(`${label}${detail ? ` — ${detail}` : ''}`)
    console.log(`  FAIL: ${label}${detail ? ` — ${detail}` : ''}`)
  }
}

function eq<T>(label: string, actual: T, expected: T) {
  const ok = JSON.stringify(actual) === JSON.stringify(expected)
  check(label, ok, ok ? `actual=${JSON.stringify(actual)}` : `actual=${JSON.stringify(actual)} expected=${JSON.stringify(expected)}`)
}

function makeRecord(overrides: Partial<ImportScheduleRecord> = {}): ImportScheduleRecord {
  return {
    class_info: {
      class_name: '2025级智能轧钢技术1班',
      advisor_name: null,
      advisor_phone: null,
      student_count: 30,
      student_count_raw: '30',
    },
    teacher: '张三',
    course: '大学英语',
    room: 'A101',
    day_of_week: 1,
    time_slot: '1,2',
    period_start: 1,
    period_end: 2,
    week_constraints: null,
    week_start: 1,
    week_end: 16,
    week_type: 'ALL',
    remark: null,
    student_count: 30,
    student_count_raw: '30',
    ...overrides,
  }
}

function makeEvidence(name: string, keyword: string | null, matchKind: MatchKind): ClassNameEvidence {
  return { name, keyword, matchKind }
}

function main() {
  console.log('K20-FIX-B Source Evidence Importer Write Verification')
  console.log('='.repeat(60))

  // ── [1] extractBasename ──
  console.log('\n[1] extractBasename:')
  eq('plain filename', extractBasename('schedule.docx'), 'schedule.docx')
  eq('Windows path', extractBasename('C:\\Users\\me\\uploads\\2026年春季学期课程表(0420).docx'), '2026年春季学期课程表(0420).docx')
  eq('POSIX path', extractBasename('/var/uploads/imports/schedule.docx'), 'schedule.docx')
  eq('mixed separators', extractBasename('uploads/imports\\foo.json'), 'foo.json')
  eq('null input', extractBasename(null), null)
  eq('undefined input', extractBasename(undefined), null)
  eq('empty string', extractBasename(''), null)
  eq('trailing slash returns last non-empty segment', extractBasename('uploads/'), 'uploads')

  // ── [2] deriveMatchAttributes ──
  console.log('\n[2] deriveMatchAttributes:')
  eq('BASE → EXACT_CLASS_NAME / HIGH',
    deriveMatchAttributes('BASE', false),
    { matchStrategy: 'EXACT_CLASS_NAME', matchConfidence: 'HIGH' })
  eq('EXACT → EXACT_CLASS_NAME / HIGH',
    deriveMatchAttributes('EXACT', false),
    { matchStrategy: 'EXACT_CLASS_NAME', matchConfidence: 'HIGH' })
  eq('WEAK not approved → SAME_COHORT_WEAK_MATCH / LOW',
    deriveMatchAttributes('WEAK', false),
    { matchStrategy: 'SAME_COHORT_WEAK_MATCH', matchConfidence: 'LOW' })
  eq('WEAK approved → MANUAL_CROSS_COHORT_APPROVAL / MEDIUM',
    deriveMatchAttributes('WEAK', true),
    { matchStrategy: 'MANUAL_CROSS_COHORT_APPROVAL', matchConfidence: 'MEDIUM' })
  eq('SUBSEQ not approved → SAME_COHORT_WEAK_MATCH / LOW',
    deriveMatchAttributes('SUBSEQ', false),
    { matchStrategy: 'SAME_COHORT_WEAK_MATCH', matchConfidence: 'LOW' })
  eq('SUBSEQ approved → MANUAL_CROSS_COHORT_APPROVAL / MEDIUM',
    deriveMatchAttributes('SUBSEQ', true),
    { matchStrategy: 'MANUAL_CROSS_COHORT_APPROVAL', matchConfidence: 'MEDIUM' })
  eq('BASE approved → EXACT_CLASS_NAME / HIGH (approval irrelevant for BASE)',
    deriveMatchAttributes('BASE', true),
    { matchStrategy: 'EXACT_CLASS_NAME', matchConfidence: 'HIGH' })
  eq('EXACT approved → EXACT_CLASS_NAME / HIGH (approval irrelevant for EXACT)',
    deriveMatchAttributes('EXACT', true),
    { matchStrategy: 'EXACT_CLASS_NAME', matchConfidence: 'HIGH' })

  // ── [3] buildTeachingTaskClassEvidence ──
  console.log('\n[3] buildTeachingTaskClassEvidence:')

  // Case A: BASE match (the record's own class_name)
  {
    const record = makeRecord({ remark: null })
    const ev = makeEvidence('2025级智能轧钢技术1班', null, 'BASE')
    const out = buildTeachingTaskClassEvidence(7, 42, record, ev, '2025级智能轧钢技术1班', 'uploads/imports/2026年春季学期课程表(0420).docx', false)
    eq('A.importBatchId', out.importBatchId, 7)
    eq('A.sourceRowIndex (0-based)', out.sourceRowIndex, 42)
    eq('A.sourceKeyword (null for BASE)', out.sourceKeyword, null)
    eq('A.sourceClassName', out.sourceClassName, '2025级智能轧钢技术1班')
    eq('A.sourceRemark (null)', out.sourceRemark, null)
    eq('A.sourceArtifactFilename (basename)', out.sourceArtifactFilename, '2026年春季学期课程表(0420).docx')
    eq('A.matchStrategy (EXACT_CLASS_NAME)', out.matchStrategy, 'EXACT_CLASS_NAME')
    eq('A.matchConfidence (HIGH)', out.matchConfidence, 'HIGH')
  }

  // Case B: EXACT remark keyword match
  {
    const record = makeRecord({ remark: '与轧钢1班合班' })
    const ev = makeEvidence('2025级智能轧钢技术1班', '轧钢1班', 'EXACT')
    const out = buildTeachingTaskClassEvidence(7, 100, record, ev, '2025级智能轧钢技术1班', 'schedule.docx', false)
    eq('B.sourceKeyword (remark keyword)', out.sourceKeyword, '轧钢1班')
    eq('B.sourceRemark (record.remark)', out.sourceRemark, '与轧钢1班合班')
    eq('B.matchStrategy (EXACT_CLASS_NAME)', out.matchStrategy, 'EXACT_CLASS_NAME')
    eq('B.matchConfidence (HIGH)', out.matchConfidence, 'HIGH')
    eq('B.sourceRowIndex deterministic', out.sourceRowIndex, 100)
  }

  // Case C: WEAK match kept
  {
    const record = makeRecord({ remark: '与森防合班' })
    const ev = makeEvidence('2025级森林草原防火技术1班', '森防', 'WEAK')
    const out = buildTeachingTaskClassEvidence(7, 50, record, ev, '2025级森林草原防火技术1班', 'schedule.docx', false)
    eq('C.matchStrategy (SAME_COHORT_WEAK_MATCH)', out.matchStrategy, 'SAME_COHORT_WEAK_MATCH')
    eq('C.matchConfidence (LOW)', out.matchConfidence, 'LOW')
    eq('C.sourceKeyword (弱匹配 keyword)', out.sourceKeyword, '森防')
  }

  // Case D: SUBSEQ match kept
  {
    const record = makeRecord({ remark: '与森防合班' })
    const ev = makeEvidence('2025级森林草原防火技术1班', '森', 'SUBSEQ')
    const out = buildTeachingTaskClassEvidence(7, 50, record, ev, '2025级森林草原防火技术1班', 'schedule.docx', false)
    eq('D.matchStrategy (SAME_COHORT_WEAK_MATCH)', out.matchStrategy, 'SAME_COHORT_WEAK_MATCH')
    eq('D.matchConfidence (LOW)', out.matchConfidence, 'LOW')
  }

  // Case E: cross-cohort approved
  {
    const record = makeRecord({ remark: '与森防合班' })
    const ev = makeEvidence('2024级森林草原防火技术1班', '森防', 'WEAK')
    const out = buildTeachingTaskClassEvidence(7, 50, record, ev, '2024级森林草原防火技术1班', 'schedule.docx', true)
    eq('E.matchStrategy (MANUAL_CROSS_COHORT_APPROVAL)', out.matchStrategy, 'MANUAL_CROSS_COHORT_APPROVAL')
    eq('E.matchConfidence (MEDIUM)', out.matchConfidence, 'MEDIUM')
  }

  // Case F: no evidence (defensive UNKNOWN fallback)
  {
    const record = makeRecord()
    const out = buildTeachingTaskClassEvidence(7, null, record, undefined, '?className?', 'schedule.docx', false)
    eq('F.matchStrategy (UNKNOWN fallback)', out.matchStrategy, 'UNKNOWN')
    eq('F.matchConfidence (UNKNOWN fallback)', out.matchConfidence, 'UNKNOWN')
    eq('F.sourceRowIndex (null when unknown)', out.sourceRowIndex, null)
    eq('F.sourceClassName still written', out.sourceClassName, '?className?')
  }

  // Case G: null batch filename
  {
    const record = makeRecord()
    const ev = makeEvidence('2025级智能轧钢技术1班', null, 'BASE')
    const out = buildTeachingTaskClassEvidence(7, 0, record, ev, '2025级智能轧钢技术1班', null, false)
    eq('G.sourceArtifactFilename (null when batchFilename is null)', out.sourceArtifactFilename, null)
  }

  // ── Summary ──
  console.log('\n' + '='.repeat(60))
  console.log(`Summary: ${passCount} PASS / ${failCount} FAIL`)
  if (failCount > 0) {
    console.log('\nFailures:')
    for (const f of failures) console.log(`  - ${f}`)
    process.exit(1)
  }
}

main()
