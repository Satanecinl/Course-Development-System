import { execFileSync } from 'child_process'
import { readFileSync, existsSync, mkdtempSync, rmSync } from 'fs'
import { join } from 'path'
import { tmpdir } from 'os'
import { computeImportParseQuality } from '../src/lib/import/parse-utils'
import { classifyImportRecords, classifyMissingTeacher, classifyMissingRoom } from '../src/lib/import/quality-classifier'
import type { ImportScheduleRecord } from '../src/types/import'

const SCRIPT_PATH = join(__dirname, 'parse_schedule.py')
const MOCK_SCRIPT_PATH = join(__dirname, 'create_mock_data.py')
const TEACHERS_PATH = process.env.TEACHER_WHITELIST_PATH ?? join(__dirname, 'fixtures', 'teachers.synthetic.txt')

const DAY_MAP: Record<number, string> = { 1: '周一', 2: '周二', 3: '周三', 4: '周四', 5: '周五', 6: '周六', 7: '周日' }

function printRecord(idx: number, r: ImportScheduleRecord, cls?: { category: string; reason: string }) {
  const ci = r.class_info ?? {}
  const day = DAY_MAP[r.day_of_week] ?? String(r.day_of_week)
  const period = r.period_start && r.period_end ? `${r.period_start}-${r.period_end}` : '-'
  const week = r.week_type === 'ALL' ? '全周' : (r.week_constraints ?? `${r.week_start}-${r.week_end}周`)
  const clsStr = cls ? ` [${cls.category}] ${cls.reason}` : ''
  console.log(
    `  #${idx} | ${ci.class_name ?? '-'} | 人数:${ci.student_count ?? '-'} | ` +
    `课程:${r.course ?? '-'} | 教师:${r.teacher ?? '-'} | 教室:${r.room ?? '-'} | ` +
    `${day} ${period}节 | ${week} | 备注:${r.remark ?? '-'}${clsStr}`
  )
}

function main() {
  const tmpDir = mkdtempSync(join(tmpdir(), 'import-quality-'))
  const docxPath = join(tmpDir, 'schedule.synthetic.docx')
  const tmpJson = join(tmpDir, 'output.json')

  try {
    execFileSync('python', [MOCK_SCRIPT_PATH, docxPath], {
      cwd: join(__dirname, '..'),
      stdio: 'pipe',
      timeout: 60000,
    })

    const parserArgs = [SCRIPT_PATH, docxPath, '-o', tmpJson]
    if (existsSync(TEACHERS_PATH)) {
      parserArgs.push('--teachers', TEACHERS_PATH)
    }
    console.log('运行解析器（实时解析）...')
    execFileSync('python', parserArgs, {
      cwd: join(__dirname, '..'),
      stdio: 'pipe',
      timeout: 60000,
    })

    if (!existsSync(tmpJson)) {
      console.error('错误：解析器未生成输出文件')
      process.exit(1)
    }

    const records: ImportScheduleRecord[] = JSON.parse(readFileSync(tmpJson, 'utf-8'))
    console.log(`使用实时解析结果，共 ${records.length} 条记录\n`)

    const quality = computeImportParseQuality(records)
    const classification = classifyImportRecords(records)

    // ── 质量摘要 ──
    console.log('========== 解析质量摘要 ==========')
    console.log(`总记录数:             ${quality.totalRecords}`)
    console.log(`有人数记录:           ${quality.recordsWithStudentCount}`)
    console.log(`缺少人数记录:         ${quality.recordsMissingStudentCount}`)
    console.log(`缺少教师记录:         ${quality.recordsMissingTeacher}`)
    console.log(`缺少教室记录:         ${quality.recordsMissingRoom}`)
    console.log(`缺少课程记录:         ${quality.recordsMissingCourse}`)
    console.log(`有周次约束记录:       ${quality.recordsWithWeekConstraints}`)
    console.log(`单双周记录:           ${quality.recordsWithOddEvenWeek}`)
    console.log(`前/后八周记录:        ${quality.recordsWithHalfSemester}`)
    console.log(`合班备注记录:         ${quality.recordsWithMergedClassRemark}`)
    console.log(`疑似重复记录:         ${quality.duplicateCandidateCount}`)
    console.log('==================================')

    // ── 分类摘要 ──
    console.log('\n========== 分类摘要 ==========')
    console.log(`recordsMissingTeacher:       ${classification.recordsMissingTeacher}`)
    console.log(`recordsMissingRoom:          ${classification.recordsMissingRoom}`)
    console.log(`missingTeacherBusinessEmpty: ${classification.missingTeacherBusinessEmpty}`)
    console.log(`missingTeacherParseBug:      ${classification.missingTeacherParseBug}`)
    console.log(`missingTeacherManualReview:  ${classification.missingTeacherManualReview}`)
    console.log(`missingRoomBusinessEmpty:    ${classification.missingRoomBusinessEmpty}`)
    console.log(`missingRoomParseBug:         ${classification.missingRoomParseBug}`)
    console.log(`missingRoomManualReview:     ${classification.missingRoomManualReview}`)
    console.log(`teacherNameSuffixCandidates: ${classification.teacherNameSuffixCandidates.length}`)
    console.log(`weekMarkerInCourseCount:     ${classification.weekMarkerInCourse.length}`)
    console.log(`canImport:                   ${classification.canImport}`)
    console.log(`blockingReasons:             ${classification.blockingReasons.length > 0 ? classification.blockingReasons.join('; ') : '(无)'}`)
    console.log(`warnings:                    ${classification.warnings.length > 0 ? classification.warnings.join('; ') : '(无)'}`)
    console.log('==============================')

    // ── 缺少教师归因明细 ──
    const missingTeacherItems = records.map((r, i) => ({ r, i })).filter(({ r }) => !r.teacher)
    console.log(`\n========== 缺少教师归因 (${missingTeacherItems.length} 条) ==========`)
    for (const { r, i } of missingTeacherItems) {
      printRecord(i, r, classifyMissingTeacher(r))
    }

    // ── 缺少教室归因明细 ──
    const missingRoomItems = records.map((r, i) => ({ r, i })).filter(({ r }) => !r.room)
    console.log(`\n========== 缺少教室归因 (${missingRoomItems.length} 条) ==========`)
    for (const { r, i } of missingRoomItems) {
      printRecord(i, r, classifyMissingRoom(r))
    }

    // ── teacherNameSuffixCandidates 明细 ──
    if (classification.teacherNameSuffixCandidates.length > 0) {
      console.log('\n========== 疑似教师粘连明细 ==========')
      for (const item of classification.teacherNameSuffixCandidates) {
        printRecord(item.recordIndex, item.record, { category: item.classification, reason: item.reason })
      }
    }

    // ── weekMarkerInCourse 明细 ──
    if (classification.weekMarkerInCourse.length > 0) {
      console.log('\n========== course含周次标记明细 ==========')
      for (const item of classification.weekMarkerInCourse) {
        printRecord(item.recordIndex, item.record, { category: item.classification, reason: item.reason })
      }
    }

    // ── 样本检查 ──
    console.log('\n========== 样本检查 ==========')
    const headerRecords = records.filter((r) => r.class_info?.class_name === '专业年级班')
    console.log(`class_name="专业年级班": ${headerRecords.length} 条 (应为 0)`)

    const oddEven = records.filter((r) => r.week_type === 'ODD' || r.week_type === 'EVEN')
    console.log(`week_type=ODD/EVEN:     ${oddEven.length} 条 (应 > 0)`)

    const courseWithWeek = records.filter((r) => r.course && (r.course.includes('单周') || r.course.includes('双周')))
    console.log(`course含"单周/双周":   ${courseWithWeek.length} 条 (应为 0)`)

    // ── 通过/失败判断 ──
    const pass =
      headerRecords.length === 0 &&
      oddEven.length > 0 &&
      courseWithWeek.length === 0 &&
      quality.recordsMissingStudentCount === 0

    console.log(`\n${pass ? 'PASS' : 'FAIL'}`)
    process.exit(pass ? 0 : 1)
  } finally {
    rmSync(tmpDir, { recursive: true, force: true })
  }
}

main()
