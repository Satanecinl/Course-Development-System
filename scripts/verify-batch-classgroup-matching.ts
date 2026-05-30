import { readFileSync } from 'fs'
import { join } from 'path'
import { PrismaClient } from '@prisma/client'
import { parseRemarkKeywords, findMergedClassNames } from '../src/lib/import/importer'
import type { ImportScheduleRecord } from '../src/types/import'

const prisma = new PrismaClient()

async function main() {
  const batchId = parseInt(process.env.BATCH_ID || '1', 10)
  const targetClassName = '2024级钢铁智能冶金技术1班（高本贯通）'
  const targetCourses = [
    '机械制图',
    '金属材料与热处理',
    '传感器与检测技术',
    '电子技术',
    '林草环境',
    '无人机应用技术',
    '高等数学',
    '中华优秀传统文化',
  ]

  // ── 1. 查询 batch ──
  const batch = await prisma.importBatch.findUnique({
    where: { id: batchId },
    select: { id: true, filename: true, parsedJsonPath: true, recordCount: true },
  })
  if (!batch || !batch.parsedJsonPath) {
    console.error(`ImportBatch ${batchId} not found or has no parsedJsonPath`)
    await prisma.$disconnect()
    process.exit(1)
  }

  // ── 2. 读取 JSON ──
  const jsonPath = join(process.cwd(), batch.parsedJsonPath)
  const records: ImportScheduleRecord[] = JSON.parse(readFileSync(jsonPath, 'utf-8'))

  // ── 3. 构建所有班级列表 ──
  const allClassNames = new Set<string>()
  for (const r of records) {
    const cn = r.class_info?.class_name
    if (cn) allClassNames.add(cn)
  }
  const allClasses = [...allClassNames].map((n) => ({ name: n }))

  // ── 4. 目标班级自身记录 ──
  const targetRecords = records.filter(
    (r) => r.class_info?.class_name === targetClassName,
  )

  // ── 5. 对目标班级自身执行合班匹配 ──
  const selfWarnings: string[] = []
  const selfMatchResults: Array<{
    course: string | null
    teacher: string | null
    remark: string | null
    keywords: string[]
    merged: string[]
  }> = []

  for (const r of targetRecords) {
    if (!r.remark) continue
    const keywords = parseRemarkKeywords(r.remark)
    if (keywords.length === 0) continue

    const merged = await findMergedClassNames(
      keywords,
      targetClassName,
      allClasses,
      selfWarnings,
    )

    selfMatchResults.push({
      course: r.course,
      teacher: r.teacher,
      remark: r.remark,
      keywords,
      merged,
    })
  }

  // ── 6. 检查其他班级的 remark 是否匹配到目标班级 ──
  const otherWarnings: string[] = []
  const otherMatchResults: Array<{
    baseClass: string
    course: string | null
    remark: string | null
    keywords: string[]
    merged: string[]
  }> = []

  for (const r of records) {
    if (!r.remark || !r.class_info?.class_name) continue
    if (r.class_info.class_name === targetClassName) continue

    const keywords = parseRemarkKeywords(r.remark)
    if (keywords.length === 0) continue

    const merged = await findMergedClassNames(
      keywords,
      r.class_info.class_name,
      allClasses,
      otherWarnings,
    )

    if (merged.includes(targetClassName)) {
      otherMatchResults.push({
        baseClass: r.class_info.class_name,
        course: r.course,
        remark: r.remark,
        keywords,
        merged,
      })
    }
  }

  // ── 7. 跨年级 / 跨方向检查 ──
  let has2025 = false
  let hasTrack = false

  for (const res of selfMatchResults) {
    for (const m of res.merged) {
      if (m.startsWith('2025级')) has2025 = true
      if (m.includes('现场工程师')) hasTrack = true
    }
  }
  for (const res of otherMatchResults) {
    for (const m of res.merged) {
      if (m.startsWith('2025级')) has2025 = true
      if (m.includes('现场工程师')) hasTrack = true
    }
  }

  // ── 8. Warning 统计 ──
  const allWarnings = [...selfWarnings, ...otherWarnings]
  const ambiguousMatchCount = allWarnings.filter(
    (w) => w.includes('AMBIGUOUS_MATCH') && !w.includes('AMBIGUOUS_SUBSEQ'),
  ).length
  const ambiguousSubseqCount = allWarnings.filter((w) =>
    w.includes('AMBIGUOUS_SUBSEQ_MATCH'),
  ).length

  // ── 9. 输出 ──
  console.log('========== Batch Info ==========')
  console.log(`batchId:         ${batch.id}`)
  console.log(`filename:        ${batch.filename}`)
  console.log(`parsedJsonPath:  ${batch.parsedJsonPath}`)
  console.log(`parsed record count: ${records.length}`)
  console.log(`target class record count: ${targetRecords.length}`)
  console.log()

  // 目标班级自身合班
  console.log(`========== Target Class Self Merge: ${targetClassName} ==========`)
  console.log(`Records with remark: ${selfMatchResults.length}`)
  if (selfMatchResults.length > 0) {
    for (const res of selfMatchResults) {
      const marker = res.course && targetCourses.includes(res.course) ? ' [重点课程]' : ''
      console.log(`  ${res.course || '(无)'}${marker} | remark: "${res.remark}"`)
      console.log(`    keywords: ${JSON.stringify(res.keywords)}`)
      console.log(`    merged: ${res.merged.length > 0 ? res.merged.join(', ') : '(无)'}`)
    }
  } else {
    console.log('  (目标班级所有记录的 remark 均为空，无自聚合合班)')
  }
  console.log()

  // 其他班级匹配到目标班级
  console.log(`========== Other Classes Matching Target: ${targetClassName} ==========`)
  console.log(`Matching records: ${otherMatchResults.length}`)
  if (otherMatchResults.length > 0) {
    for (const res of otherMatchResults) {
      const marker = res.course && targetCourses.includes(res.course) ? ' [重点课程]' : ''
      console.log(`  baseClass: ${res.baseClass} | ${res.course || '(无)'}${marker}`)
      console.log(`    remark: "${res.remark}"`)
      console.log(`    keywords: ${JSON.stringify(res.keywords)}`)
      console.log(`    merged: ${res.merged.join(', ')}`)
    }
  } else {
    console.log('  (没有其它班级的 remark 通过合班匹配到目标班级)')
  }
  console.log()

  // 重点课程检查
  console.log('========== Target Courses Check ==========')
  for (const course of targetCourses) {
    const self = selfMatchResults.filter((r) => r.course === course)
    const other = otherMatchResults.filter((r) => r.course === course)
    const selfMerged = self.flatMap((r) => r.merged)
    const otherMerged = other.flatMap((r) => r.merged)
    const crossYear = [...selfMerged, ...otherMerged].some((m) => m.startsWith('2025级'))
    const crossTrack = [...selfMerged, ...otherMerged].some((m) => m.includes('现场工程师'))

    if (self.length === 0 && other.length === 0) {
      console.log(`  ${course}: N/A (目标班级无此课程记录，且无其它班级匹配)`)
    } else {
      const status = crossYear || crossTrack ? 'CROSS_YEAR_OR_TRACK' : 'OK'
      console.log(`  ${course}: ${status}`)
      if (self.length > 0) {
        console.log(`    self merged: ${selfMerged.join(', ') || '(无)'}`)
      }
      if (other.length > 0) {
        console.log(`    other merged: ${otherMerged.join(', ') || '(无)'}`)
      }
    }
  }
  console.log()

  // Cross-Year / Cross-Track 汇总
  console.log('========== Cross-Year / Cross-Track Summary ==========')
  console.log(`Has 2025级 in merged results: ${has2025}`)
  console.log(`Has 现场工程师 in merged results: ${hasTrack}`)
  console.log()

  // Warning 统计
  console.log('========== Warning Stats ==========')
  console.log(`AMBIGUOUS_MATCH count: ${ambiguousMatchCount}`)
  console.log(`AMBIGUOUS_SUBSEQ_MATCH count: ${ambiguousSubseqCount}`)
  if (allWarnings.length > 0) {
    console.log('Representative warnings:')
    const uniqueWarnings = [...new Set(allWarnings)].slice(0, 5)
    for (const w of uniqueWarnings) {
      console.log(`  - ${w}`)
    }
  }
  console.log()

  // 最终判断
  console.log('========== Verdict ==========')
  if (has2025 || hasTrack) {
    console.log('FAILED_TARGET_STILL_CROSS_YEAR_OR_TRACK')
  } else {
    console.log('PASSED_TARGET_CROSS_YEAR_TRACK_FIXED')
  }

  await prisma.$disconnect()
}

main().catch((e) => {
  console.error(e)
  prisma.$disconnect().then(() => process.exit(1))
})
