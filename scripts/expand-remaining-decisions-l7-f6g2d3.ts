/**
 * L7-F6G2D3 Script — Remaining Decision Row-Level Expansion
 *
 * Stage: L7-F6G2D3-REMAINING-DECISION-ROW-LEVEL-EXPANSION
 *
 * Read-only. Expands the 6 remaining needsReview items into row-level decisions:
 *   - 5 ambiguousTeacher: row-level per source class
 *   - 1 ambiguousMapping-aggregate: 63 row-level decisions
 *
 * Generates local artifacts:
 *   - remaining-row-level-decisions.local.xlsx
 *   - remaining-row-level-decisions.aggregate.json
 *   - remaining-row-level-decisions.raw.local.json
 *
 * Does NOT write DB.
 */

import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { createHash } from 'node:crypto'
import ExcelJS from 'exceljs'
import { PrismaClient } from '@prisma/client'

const STAGE = 'L7-F6G2D3-REMAINING-DECISION-ROW-LEVEL-EXPANSION' as const
const shortHash = (s: string, len = 16): string =>
  createHash('sha256').update(s, 'utf8').digest('hex').slice(0, len)

type G1Ambiguous = {
  decisionId: string
  normalizedText: string
  candidateCount: number
  candidates: Array<{ nameHash: string; name: string; source: string; department: string | null }>
}

type G1Package = {
  staffContacts: Array<{ decisionId: string; name: string }>
  external: Array<{ decisionId: string; name: string }>
  ambiguous: G1Ambiguous[]
  classGroups: Array<{ major: string; count: number; action: string }>
  skipRows: number
  weeklyHours: number
}

type G2ADraftDecision = {
  decisionId: string
  category: string
  recommendedAction: string
  recommendedStatus: string
  reasonCode: string
  riskLevel: string
  affectedRowCount: number
}

type G2ADraft = {
  decisions: G2ADraftDecision[]
}

type TrialPlan = {
  plan: {
    unresolvedRows: Array<{
      approvalItemId: string
      sheetIndex: number
      sourceRowIndex: number
      unresolvedReasons: string[]
    }>
  }
}

type RawSourceRow = {
  approvalItemId: string
  sheetIndex: number
  sheetName: string
  sourceRowIndex: number
  cohort: string
  duration: string
  major: string
  classText: string
  courseName: string
  examType: string
  weeklyHours: string
  teacherText: string
  taskAssignmentText: string
  mergeRemark: string
  remark: string
}

type RowDecision = {
  rowDecisionId: string
  category: string
  sourceRowHash: string
  courseKeyHash: string
  teacherTextHash: string
  classTextHash: string
  remarkHash: string
  mergeRemarkHash: string
  suggestedAction: string
  suggestedTeacherId: number | null
  suggestedClassGroupId: number | null
  confidenceBand: string
  reasonCode: string
  evidenceSummary: string
  // For ambiguous mapping: classGroup candidates
  candidateClassGroupIds: number[]
  classGroupNames: string[]
}

async function main(): Promise<void> {
  console.log(`L7-F6G2D3 Remaining Decision Row-Level Expansion`)
  console.log(`  stage: ${STAGE}\n`)

  const prisma = new PrismaClient()

  // Load G1 package
  const g1Path = join(resolve(__dirname, '..'), 'temp', 'local-artifacts', 'l7-f6g1', 'manual-decision-package.json')
  const g1 = JSON.parse(readFileSync(g1Path, 'utf-8')) as G1Package

  // Load G2A draft
  const g2aPath = join(resolve(__dirname, '..'), 'temp', 'local-artifacts', 'l7-f6g2a', 'user-decisions.intake.local.draft.json')
  const g2aDraft = JSON.parse(readFileSync(g2aPath, 'utf-8')) as G2ADraft

  // Load 63 ambiguousMapping raw data (pre-extracted)
  const ambMapPath = join(resolve(__dirname, '..'), 'temp', 'local-artifacts', 'l7-f6g2d3', 'ambiguous-mapping-63-raw.local.json')
  let ambMapRaw: RawSourceRow[] = []
  if (existsSync(ambMapPath)) {
    ambMapRaw = JSON.parse(readFileSync(ambMapPath, 'utf-8')) as RawSourceRow[]
  }
  console.log(`Loaded ${ambMapRaw.length} ambiguousMapping raw rows`)

  // Load ClassGroup table for candidate matching
  const classGroups = await prisma.classGroup.findMany({
    where: { semesterId: 4 },
    select: { id: true, name: true, semesterId: true },
  })
  console.log(`Loaded ${classGroups.length} ClassGroups`)

  // Load Teacher table for candidate matching
  const teachers = await prisma.teacher.findMany({
    select: { id: true, name: true, department: true },
  })
  const teacherByNorm = new Map<string, { id: number; name: string; department: string | null }[]>()
  const normTeacher = (s: string): string => s.replace(/\s+/g, '').replace(/[（(](外聘|兼职|校外|实训|实习|外)[）)]/g, '').replace(/[（(][^）)]*[）)]/g, '').replace(/[、，,;；/／\\|]/g, '|').trim()
  for (const t of teachers) {
    const norm = normTeacher(t.name)
    if (norm.length === 0) continue
    if (!teacherByNorm.has(norm)) teacherByNorm.set(norm, [])
    teacherByNorm.get(norm)!.push({ id: t.id, name: t.name, department: t.department })
  }

  // ClassGroup lookup by name hash
  const classGroupByNorm = new Map<string, { id: number; name: string }[]>()
  for (const cg of classGroups) {
    // Normalize classGroup name: remove double-级
    const norm = cg.name.replace(/级级/g, '级')
    if (!classGroupByNorm.has(norm)) classGroupByNorm.set(norm, [])
    classGroupByNorm.get(norm)!.push({ id: cg.id, name: cg.name })
  }

  // ── 1. Expand 5 ambiguousTeacher ─────────────────────────────────────
  const ambTeacherIds = ['85af8665960c794e', 'dcab9c9111a2116d', '6a9018730359997a', '5f4ee2d0cdd7cd1d', '7081a99ebaea8ae6']
  const ambTeacherDecisions: RowDecision[] = []

  for (const amb of g1.ambiguous) {
    if (!ambTeacherIds.includes(amb.decisionId)) continue
    const text = amb.normalizedText

    // Build candidate teacher lookup for this ambiguous item
    const candTeachers: { id: number; name: string; department: string | null }[] = []
    for (const c of amb.candidates) {
      const norm = normTeacher(c.name)
      const matches = teacherByNorm.get(norm) ?? []
      for (const m of matches) candTeachers.push(m)
    }

    // Determine row-level structure based on text pattern
    if (amb.decisionId === '85af8665960c794e') {
      // Pattern: "teacher1|teacher2" — two teachers, no class assignment
      // Evidence insufficient for row-level split
      // Recommend: keep as needsReview with candidates listed
      for (let i = 0; i < amb.candidates.length; i++) {
        const c = amb.candidates[i]
        ambTeacherDecisions.push({
          rowDecisionId: `${amb.decisionId}-r${i + 1}`,
          category: 'ambiguousTeacher',
          sourceRowHash: shortHash(amb.decisionId + '-r' + (i + 1)),
          courseKeyHash: shortHash(amb.decisionId + '-course'),
          teacherTextHash: shortHash(c.name),
          classTextHash: shortHash('unknown-class'),
          remarkHash: shortHash('no-task-assignment'),
          mergeRemarkHash: shortHash('no-merge-remark'),
          suggestedAction: candTeachers.length > 0 ? 'manualSelect' : 'needsReview',
          suggestedTeacherId: candTeachers[0]?.id ?? null,
          suggestedClassGroupId: null,
          confidenceBand: candTeachers.length === 0 ? 'NO_SAFE_MATCH' : 'EXACT_SINGLE',
          reasonCode: 'AMBIGUOUS_TWO_TEACHERS_NO_TASK',
          evidenceSummary: `2 teachers: ${c.name}; class assignment missing; user must select per class`,
          candidateClassGroupIds: [],
          classGroupNames: [],
        })
      }
    } else if (amb.decisionId === 'dcab9c9111a2116d' || amb.decisionId === '6a9018730359997a') {
      // Pattern: "1|2:teacherA|3|4:teacherB" — 4 classes, 2 teachers
      // Recommend: 1=teacherA, 2=teacherA, 3=teacherB, 4=teacherB
      const patternMatch = text.match(/^(\d+)\|(\d+):(.+?)\|(\d+)\|(\d+):(.+)$/)
      if (patternMatch) {
        const [, c1, c2, , c3, c4, ] = patternMatch
        // Teacher A: c1, c2; Teacher B: c3, c4
        const teacherA = amb.candidates[0]
        const teacherB = amb.candidates[1]
        for (const [cls, teacherCand] of [[c1, teacherA], [c2, teacherA], [c3, teacherB], [c4, teacherB]] as const) {
          if (!teacherCand) continue
          const norm = normTeacher(teacherCand.name)
          const match = teacherByNorm.get(norm)?.[0]
          ambTeacherDecisions.push({
            rowDecisionId: `${amb.decisionId}-cls${cls}`,
            category: 'ambiguousTeacher',
            sourceRowHash: shortHash(amb.decisionId + '-cls' + cls),
            courseKeyHash: shortHash(amb.decisionId + '-course'),
            teacherTextHash: shortHash(teacherCand.name),
            classTextHash: shortHash(cls + '班'),
            remarkHash: shortHash('k-segment-row-level'),
            mergeRemarkHash: shortHash('no-merge-remark'),
            suggestedAction: match ? 'manualSelect' : 'needsReview',
            suggestedTeacherId: match?.id ?? null,
            suggestedClassGroupId: null,
            confidenceBand: match ? 'EXACT_SINGLE' : 'NO_SAFE_MATCH',
            reasonCode: 'K_SEGMENT_ROW_LEVEL_EXPANSION',
            evidenceSummary: `class ${cls} = ${teacherCand.name} (from K-column segment 1|2:${teacherA.name};3|4:${teacherB.name})`,
            candidateClassGroupIds: [],
            classGroupNames: [],
          })
        }
      }
    } else if (amb.decisionId === '5f4ee2d0cdd7cd1d') {
      // Pattern: "3|4:王健1|2班|刘艳艳" — messy text
      // Recommendation: 1,2:刘艳艳; 3,4:王健 (user must verify)
      for (const [cls, teacherCand, ev] of [
        ['1', amb.candidates[0], 'tentative: 1,2 class → 王健'],
        ['2', amb.candidates[0], 'tentative: 1,2 class → 王健'],
        ['3', amb.candidates[1], 'tentative: 3,4 class → 刘艳艳'],
        ['4', amb.candidates[1], 'tentative: 3,4 class → 刘艳艳'],
      ] as const) {
        if (!teacherCand) continue
        const norm = normTeacher(teacherCand.name)
        const match = teacherByNorm.get(norm)?.[0]
        ambTeacherDecisions.push({
          rowDecisionId: `${amb.decisionId}-cls${cls}`,
          category: 'ambiguousTeacher',
          sourceRowHash: shortHash(amb.decisionId + '-cls' + cls),
          courseKeyHash: shortHash(amb.decisionId + '-course'),
          teacherTextHash: shortHash(teacherCand.name),
          classTextHash: shortHash(cls + '班'),
          remarkHash: shortHash('messy-text'),
          mergeRemarkHash: shortHash('no-merge-remark'),
          suggestedAction: 'needsReview', // messy — must verify
          suggestedTeacherId: match?.id ?? null,
          suggestedClassGroupId: null,
          confidenceBand: 'NO_SAFE_MATCH',
          reasonCode: 'MESSY_TEXT_NEEDS_VERIFICATION',
          evidenceSummary: ev,
          candidateClassGroupIds: [],
          classGroupNames: [],
        })
      }
    } else if (amb.decisionId === '7081a99ebaea8ae6') {
      // Pattern: "1:|2班李源" — 1班 teacher missing, 2班 = 李源
      // Recommendation: 1班 = needsReview, 2班 = manualSelect 李源
      const cand2 = amb.candidates[0]
      for (const cls of ['1', '2']) {
        if (cls === '1') {
          ambTeacherDecisions.push({
            rowDecisionId: `${amb.decisionId}-cls1`,
            category: 'ambiguousTeacher',
            sourceRowHash: shortHash(amb.decisionId + '-cls1'),
            courseKeyHash: shortHash(amb.decisionId + '-course'),
            teacherTextHash: shortHash('1班-teacher-missing'),
            classTextHash: shortHash('1班'),
            remarkHash: shortHash('k-segment-1-班-missing'),
            mergeRemarkHash: shortHash('no-merge-remark'),
            suggestedAction: 'needsReview',
            suggestedTeacherId: null,
            suggestedClassGroupId: null,
            confidenceBand: 'NO_SAFE_MATCH',
            reasonCode: 'CLASS_1_TEACHER_MISSING',
            evidenceSummary: '1班教师缺失（K-column: "1:|..."），无法自动分配',
            candidateClassGroupIds: [],
            classGroupNames: [],
          })
        } else {
          if (!cand2) continue
          const norm = normTeacher(cand2.name)
          const match = teacherByNorm.get(norm)?.[0]
          ambTeacherDecisions.push({
            rowDecisionId: `${amb.decisionId}-cls2`,
            category: 'ambiguousTeacher',
            sourceRowHash: shortHash(amb.decisionId + '-cls2'),
            courseKeyHash: shortHash(amb.decisionId + '-course'),
            teacherTextHash: shortHash(cand2.name),
            classTextHash: shortHash('2班'),
            remarkHash: shortHash('k-segment-2-班-李源'),
            mergeRemarkHash: shortHash('no-merge-remark'),
            suggestedAction: match ? 'manualSelect' : 'needsReview',
            suggestedTeacherId: match?.id ?? null,
            suggestedClassGroupId: null,
            confidenceBand: match ? 'EXACT_SINGLE' : 'NO_SAFE_MATCH',
            reasonCode: 'K_SEGMENT_ROW_LEVEL_EXPANSION',
            evidenceSummary: `2班 = ${cand2.name} (from K-column "2班${cand2.name}")`,
            candidateClassGroupIds: [],
            classGroupNames: [],
          })
        }
      }
    }
  }

  console.log(`\nGenerated ${ambTeacherDecisions.length} ambiguousTeacher row decisions`)

  // ── 2. Expand ambiguousMapping-aggregate (63 rows) ─────────────────
  const ambMapDecisions: RowDecision[] = []

  for (const r of ambMapRaw) {
    // Try to match classText against existing ClassGroups
    const candidateClassGroupIds: number[] = []
    const classGroupNames: string[] = []
    if (r.classText) {
      // Try direct match
      const direct = classGroupByNorm.get(r.classText)
      if (direct) {
        for (const cg of direct) {
          candidateClassGroupIds.push(cg.id)
          classGroupNames.push(cg.name)
        }
      }
      // Try parsing classText as "X班,Y班" and finding each
      const tokens = r.classText.split(/[,，、\s]+/).map((t: string) => t.trim()).filter((t: string) => t.length > 0)
      for (const t of tokens) {
        const tokenMatch = classGroupByNorm.get(t)
        if (tokenMatch) {
          for (const cg of tokenMatch) {
            if (!candidateClassGroupIds.includes(cg.id)) {
              candidateClassGroupIds.push(cg.id)
              classGroupNames.push(cg.name)
            }
          }
        }
      }
    }

    const suggested = candidateClassGroupIds.length > 0 ? 'manualSelect' : 'needsReview'
    const confidence = candidateClassGroupIds.length === 0
      ? 'NO_SAFE_MATCH'
      : candidateClassGroupIds.length === 1
        ? 'EXACT_SINGLE'
        : 'EXACT_MULTI'

    ambMapDecisions.push({
      rowDecisionId: `ambMap-${r.sheetIndex}-${r.sourceRowIndex}`,
      category: 'ambiguousMapping',
      sourceRowHash: shortHash(r.approvalItemId),
      courseKeyHash: shortHash((r.courseName ?? '') + '-' + (r.examType ?? '') + '-' + (r.weeklyHours ?? '')),
      teacherTextHash: shortHash(r.teacherText ?? ''),
      classTextHash: shortHash(r.classText ?? ''),
      remarkHash: shortHash(r.remark ?? ''),
      mergeRemarkHash: shortHash(r.mergeRemark ?? ''),
      suggestedAction: suggested,
      suggestedTeacherId: null,
      suggestedClassGroupId: candidateClassGroupIds[0] ?? null,
      confidenceBand: confidence,
      reasonCode: 'MERGE_REMARK_AMBIGUOUS_ROW_LEVEL',
      evidenceSummary: `merge remark: "${r.mergeRemark}"; classText: "${r.classText}"; ${candidateClassGroupIds.length} candidate class groups`,
      candidateClassGroupIds,
      classGroupNames,
    })
  }

  console.log(`Generated ${ambMapDecisions.length} ambiguousMapping row decisions`)

  // ── 3. Generate Excel workbook ──────────────────────────────────────
  const wb = new ExcelJS.Workbook()
  wb.creator = 'L7-F6G2D3'
  wb.created = new Date()

  // README
  const readme = wb.addWorksheet('README')
  readme.getCell('A1').value = 'L7-F6G2D3 剩余决策 row-level 展开 - 使用说明'
  readme.getCell('A1').font = { bold: true, size: 14 }
  const readmeLines = [
    '',
    '本工作簿展开 6 个 remaining needsReview 项为 row-level decisions。',
    '',
    '【5 个 ambiguousTeacher】已展开为 per-class row decisions。',
    '【1 个 ambiguousMapping-aggregate】已展开为 63 行 row-level decisions。',
    '',
    '【用户只允许编辑以下 4 列】',
    '  action              approve | skip | manualSelect | manualEdit | needsReview',
    '  selectedExistingId  ambiguousTeacher → Teacher ID; ambiguousMapping → ClassGroup ID',
    '  editedValue         当 action=manualEdit 时必填',
    '  note                高风险 manualSelect 必须填写',
    '',
    '【完成后】',
    '  npx tsx scripts/import-remaining-row-level-decisions-l7-f6g2d3.ts --target-semester-id 4',
  ]
  readmeLines.forEach((line, i) => { readme.getCell(`A${i + 2}`).value = line })

  // Summary
  const summary = wb.addWorksheet('Summary')
  const summaryData: [string, string | number][] = [
    ['ambiguousTeacherExpandedCount', ambTeacherDecisions.length],
    ['ambiguousMappingExpandedCount', ambMapDecisions.length],
    ['totalRowDecisions', ambTeacherDecisions.length + ambMapDecisions.length],
    ['ambiguousTeacherHighConfidence', ambTeacherDecisions.filter(d => d.confidenceBand === 'EXACT_SINGLE').length],
    ['ambiguousTeacherNeedsReview', ambTeacherDecisions.filter(d => d.suggestedAction === 'needsReview').length],
    ['ambiguousMappingWithCandidates', ambMapDecisions.filter(d => d.candidateClassGroupIds.length > 0).length],
    ['ambiguousMappingNoCandidates', ambMapDecisions.filter(d => d.candidateClassGroupIds.length === 0).length],
    ['readyForControlledWrite', false],
    ['workbookStage', 'L7-F6G2D3'],
    ['generatedAt', new Date().toISOString()],
  ]
  summary.columns = [{ header: 'metric', key: 'metric', width: 40 }, { header: 'value', key: 'value', width: 30 }]
  summaryData.forEach(row => summary.addRow({ metric: row[0], value: row[1] }))

  // AmbiguousTeacher_5 (expanded to N rows)
  const ambSheet = wb.addWorksheet('AmbiguousTeacher_5')
  const ambCols = ['rowDecisionId', 'category', 'courseKeyHash', 'classTextHash', 'teacherTextHash', 'suggestedAction', 'suggestedTeacherId', 'confidenceBand', 'reasonCode', 'evidenceSummary', 'action', 'selectedExistingId', 'editedValue', 'note']
  ambSheet.columns = ambCols.map(c => ({ header: c, key: c, width: 25 }))
  ambTeacherDecisions.forEach(r => ambSheet.addRow({
    rowDecisionId: r.rowDecisionId,
    category: r.category,
    courseKeyHash: r.courseKeyHash,
    classTextHash: r.classTextHash,
    teacherTextHash: r.teacherTextHash,
    suggestedAction: r.suggestedAction,
    suggestedTeacherId: r.suggestedTeacherId,
    confidenceBand: r.confidenceBand,
    reasonCode: r.reasonCode,
    evidenceSummary: r.evidenceSummary,
    action: '', selectedExistingId: null, editedValue: '', note: '',
  }))

  // AmbiguousMapping_63
  const mapSheet = wb.addWorksheet('AmbiguousMapping_63')
  const mapCols = ['rowDecisionId', 'category', 'sourceRowHash', 'classTextHash', 'mergeRemarkHash', 'candidateClassGroupIds', 'classGroupNames', 'suggestedAction', 'suggestedClassGroupId', 'confidenceBand', 'reasonCode', 'action', 'selectedExistingId', 'editedValue', 'note']
  mapSheet.columns = mapCols.map(c => ({ header: c, key: c, width: 25 }))
  ambMapDecisions.forEach(r => mapSheet.addRow({
    rowDecisionId: r.rowDecisionId,
    category: r.category,
    sourceRowHash: r.sourceRowHash,
    classTextHash: r.classTextHash,
    mergeRemarkHash: r.mergeRemarkHash,
    candidateClassGroupIds: r.candidateClassGroupIds.join('|'),
    classGroupNames: r.classGroupNames.join('|'),
    suggestedAction: r.suggestedAction,
    suggestedClassGroupId: r.suggestedClassGroupId,
    confidenceBand: r.confidenceBand,
    reasonCode: r.reasonCode,
    action: '', selectedExistingId: null, editedValue: '', note: '',
  }))

  // Teacher_Candidates
  const tCandSheet = wb.addWorksheet('Teacher_Candidates')
  tCandSheet.columns = ['teacherId', 'teacherName', 'department', 'normalizedName', 'matchCount'].map(c => ({ header: c, key: c, width: 20 }))
  // Deduplicate teachers
  const seenTeacherIds = new Set<number>()
  for (const t of teachers) {
    if (seenTeacherIds.has(t.id)) continue
    seenTeacherIds.add(t.id)
    const norm = normTeacher(t.name)
    let matchCount = 0
    for (const r of ambTeacherDecisions) {
      if (r.suggestedTeacherId === t.id) matchCount++
    }
    tCandSheet.addRow({ teacherId: t.id, teacherName: t.name, department: t.department ?? '', normalizedName: norm, matchCount })
  }

  // ClassGroup_Candidates
  const cgCandSheet = wb.addWorksheet('ClassGroup_Candidates')
  cgCandSheet.columns = ['classGroupId', 'classGroupName', 'semesterId', 'matchCount'].map(c => ({ header: c, key: c, width: 20 }))
  const seenCGIds = new Set<number>()
  for (const cg of classGroups) {
    if (seenCGIds.has(cg.id)) continue
    seenCGIds.add(cg.id)
    let matchCount = 0
    for (const r of ambMapDecisions) {
      if (r.candidateClassGroupIds.includes(cg.id)) matchCount++
    }
    cgCandSheet.addRow({ classGroupId: cg.id, classGroupName: cg.name, semesterId: cg.semesterId, matchCount })
  }

  // Export_Check
  const exportSheet = wb.addWorksheet('Export_Check')
  exportSheet.columns = [{ header: 'metric', key: 'metric', width: 40 }, { header: 'value', key: 'value', width: 40 }]
  ;[
    ['rowsWithAction', '(filled by import script)'],
    ['rowsMissingRequiredSelectedExistingId', '(filled by import script)'],
    ['rowsMissingRequiredEditedValue', '(filled by import script)'],
    ['invalidActions', '(filled by import script)'],
    ['duplicateRowDecisionIds', '(filled by import script)'],
    ['readyToImportWorkbook', '(filled by import script)'],
  ].forEach(row => exportSheet.addRow({ metric: row[0], value: row[1] }))

  // Write workbook
  const laDir = join(resolve(__dirname, '..'), 'temp', 'local-artifacts', 'l7-f6g2d3')
  if (!existsSync(laDir)) mkdirSync(laDir, { recursive: true })
  const workbookPath = join(laDir, 'remaining-row-level-decisions.local.xlsx')
  await wb.xlsx.writeFile(workbookPath)
  console.log(`\nWorkbook: ${workbookPath}`)

  // Write aggregate
  const aggregate = {
    stage: STAGE,
    status: 'WORKBOOK_GENERATED_WAITING_FOR_USER_EDIT',
    dbWrite: false,
    ambiguousTeacherExpandedCount: ambTeacherDecisions.length,
    ambiguousMappingExpandedCount: ambMapDecisions.length,
    totalRowDecisions: ambTeacherDecisions.length + ambMapDecisions.length,
    ambiguousTeacherHighConfidence: ambTeacherDecisions.filter(d => d.confidenceBand === 'EXACT_SINGLE').length,
    ambiguousTeacherNeedsReview: ambTeacherDecisions.filter(d => d.suggestedAction === 'needsReview').length,
    ambiguousMappingWithCandidates: ambMapDecisions.filter(d => d.candidateClassGroupIds.length > 0).length,
    ambiguousMappingNoCandidates: ambMapDecisions.filter(d => d.candidateClassGroupIds.length === 0).length,
    readyForControlledWrite: false,
    workbookPath: 'temp/local-artifacts/l7-f6g2d3/remaining-row-level-decisions.local.xlsx',
  }
  writeFileSync(join(laDir, 'remaining-row-level-decisions.aggregate.json'), JSON.stringify(aggregate, null, 2) + '\n', 'utf-8')

  // Write raw local (no raw teacher/class names, only hash + summary)
  writeFileSync(join(laDir, 'remaining-row-level-decisions.raw.local.json'), JSON.stringify({
    stage: STAGE,
    ambTeacherDecisions: ambTeacherDecisions.map(d => ({
      rowDecisionId: d.rowDecisionId,
      category: d.category,
      teacherTextHash: d.teacherTextHash,
      classTextHash: d.classTextHash,
      suggestedAction: d.suggestedAction,
      suggestedTeacherId: d.suggestedTeacherId,
      confidenceBand: d.confidenceBand,
      reasonCode: d.reasonCode,
    })),
    ambMapDecisions: ambMapDecisions.map(d => ({
      rowDecisionId: d.rowDecisionId,
      category: d.category,
      sourceRowHash: d.sourceRowHash,
      classTextHash: d.classTextHash,
      mergeRemarkHash: d.mergeRemarkHash,
      candidateClassGroupCount: d.candidateClassGroupIds.length,
      suggestedAction: d.suggestedAction,
      suggestedClassGroupId: d.suggestedClassGroupId,
      confidenceBand: d.confidenceBand,
      reasonCode: d.reasonCode,
    })),
  }, null, 2) + '\n', 'utf-8')

  console.log(`Aggregate: ${join(laDir, 'remaining-row-level-decisions.aggregate.json')}`)
  console.log('\n--- Summary ---')
  console.log(`  ambiguousTeacher expanded:    ${ambTeacherDecisions.length} rows`)
  console.log(`  ambiguousMapping expanded:   ${ambMapDecisions.length} rows`)
  console.log(`  total row decisions:         ${ambTeacherDecisions.length + ambMapDecisions.length}`)
  console.log(`  readyForControlledWrite:     false (user must edit workbook)`)

  await prisma.$disconnect()
}

main().catch(async (e) => { console.error('FATAL:', e); try { await new PrismaClient().$disconnect() } catch {}; process.exit(1) })
