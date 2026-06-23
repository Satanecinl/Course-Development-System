import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join, resolve } from 'node:path'

const ROOT = resolve(__dirname, '..')
const DIR_OUT = join(ROOT, 'temp', 'local-artifacts', 'l8-c3c')

const ttcData = JSON.parse(readFileSync(join(DIR_OUT, 'composite-ttc-split-review.local.json'), 'utf8')) as any[]

function classifyTTC(item: any): { target: string; targetKey: string; confidence: string; reason: string } {
  const course = item.courseName

  if (item.sourceClassGroupId === 19) {
    // #3: 智能轧钢 vs 机电一体化
    const isSteel = /轧钢|冶金|钢铁/.test(course)
    const isMech = /机电|电机|电子|PLC|传感器|机械/.test(course)
    if (isSteel && !isMech) return { target: 'A', targetKey: '2025级|智能轧钢技术|1|现场工程师|高职|三年制', confidence: 'HIGH', reason: 'course matches 轧钢 domain' }
    if (isMech && !isSteel) return { target: 'B', targetKey: '2025级|机电一体化技术|1|现场工程师|高职|三年制', confidence: 'HIGH', reason: 'course matches 机电 domain' }
    return { target: 'needsReview', targetKey: '', confidence: 'LOW', reason: 'course does not clearly match either domain' }
  }

  if (item.sourceClassGroupId === 36) {
    // #8: 钢铁智能冶金 vs 机电一体化
    const isSteel = /冶金|高炉|连铸|喷煤|热风|炼铁|炼钢/.test(course)
    const isMech = /机电|电机|电子|PLC|传感器|机械|流体/.test(course)
    if (isSteel && !isMech) return { target: 'A', targetKey: '2024级|钢铁智能冶金技术|1|现场工程师|高职|三年制', confidence: 'HIGH', reason: 'course matches 冶金 domain' }
    if (isMech && !isSteel) return { target: 'B', targetKey: '2024级|机电一体化技术|1|现场工程师|高职|三年制', confidence: 'HIGH', reason: 'course matches 机电 domain' }
    return { target: 'needsReview', targetKey: '', confidence: 'LOW', reason: 'course does not clearly match either domain' }
  }

  return { target: 'needsReview', targetKey: '', confidence: 'LOW', reason: 'unknown source CG' }
}

const enriched = ttcData.map((item: any) => {
  const c = classifyTTC(item)
  return { ...item, targetCanonicalOption: c.target, targetCanonicalKey: c.targetKey, classificationConfidence: c.confidence, classificationReason: c.reason, needsUserDecision: c.confidence !== 'HIGH' }
})

const resolved = enriched.filter((e: any) => e.classificationConfidence === 'HIGH')
const needsReview = enriched.filter((e: any) => e.classificationConfidence !== 'HIGH')

console.log('Auto-classified (HIGH):', resolved.length)
console.log('Needs user decision:', needsReview.length)
console.log('')

for (const item of enriched) {
  const group = item.sourceClassGroupId === 19 ? '#3' : '#8'
  console.log(group + ' | TTC#' + item.teachingTaskClassId + ' | ' + item.courseName + ' | ' + item.teacherName)
  console.log('  -> ' + item.targetCanonicalOption + ' (' + item.classificationConfidence + ') -- ' + item.classificationReason)
}

// Write enriched JSON
writeFileSync(join(DIR_OUT, 'composite-ttc-split-review.local.json'), JSON.stringify(enriched, null, 2))

// Write Markdown
const mdLines: string[] = []
mdLines.push('# Composite ClassGroup TTC Split Review (L8-C3C)')
mdLines.push('')
mdLines.push('## Summary')
mdLines.push('')
mdLines.push('- Composite source ClassGroups: 2')
mdLines.push('- Total affected TTCs: 18')
mdLines.push('- #3 (CG#19) TTCs: 14')
mdLines.push('- #8 (CG#36) TTCs: 4')
mdLines.push('- Auto-classified (HIGH): ' + resolved.length)
mdLines.push('- Needs user decision: ' + needsReview.length)
mdLines.push('')
mdLines.push('## Target Canonical Options')
mdLines.push('')
mdLines.push('### #3 (CG#19)')
mdLines.push('- A = `2025级|智能轧钢技术|1|现场工程师|高职|三年制`')
mdLines.push('- B = `2025级|机电一体化技术|1|现场工程师|高职|三年制`')
mdLines.push('')
mdLines.push('### #8 (CG#36)')
mdLines.push('- A = `2024级|钢铁智能冶金技术|1|现场工程师|高职|三年制`')
mdLines.push('- B = `2024级|机电一体化技术|1|现场工程师|高职|三年制`')
mdLines.push('')
mdLines.push('---')
mdLines.push('')
mdLines.push('## TTC Details')
mdLines.push('')

for (const item of enriched) {
  const group = item.sourceClassGroupId === 19 ? '#3' : '#8'
  mdLines.push('### ' + group + ' | TTC#' + item.teachingTaskClassId + ' -> TT#' + item.teachingTaskId)
  mdLines.push('')
  mdLines.push('- **Course**: ' + item.courseName)
  mdLines.push('- **Teacher**: ' + item.teacherName)
  mdLines.push('- **ClassGroup**: ' + item.sourceClassGroupName)
  if (item.remark) mdLines.push('- **Remark**: ' + item.remark)
  mdLines.push('- **Target**: ' + item.targetCanonicalOption + ' (' + item.classificationConfidence + ')')
  mdLines.push('- **Reason**: ' + item.classificationReason)
  mdLines.push('- **Needs user decision**: ' + (item.needsUserDecision ? 'YES' : 'NO'))
  mdLines.push('')
}

mdLines.push('---')
mdLines.push('')
mdLines.push('## Reply Template')
mdLines.push('')
mdLines.push('If all auto-classifications are acceptable, reply: `ALL_OK`')
mdLines.push('')
mdLines.push('Otherwise, reply per TTC:')
mdLines.push('')
mdLines.push('```')
mdLines.push('TTC#ID = A or B or needsReview')
mdLines.push('```')

writeFileSync(join(DIR_OUT, 'composite-ttc-split-review.local.md'), mdLines.join('\n'))

console.log('')
console.log('Files written:')
console.log('  temp/local-artifacts/l8-c3c/composite-ttc-split-review.local.json')
console.log('  temp/local-artifacts/l8-c3c/composite-ttc-split-review.local.md')
