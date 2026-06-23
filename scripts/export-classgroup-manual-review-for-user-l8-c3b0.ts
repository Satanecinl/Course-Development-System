import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join, resolve } from 'node:path'

const ROOT = resolve(__dirname, '..')
const DIR_C3 = join(ROOT, 'temp', 'local-artifacts', 'l8-c3')
const DIR_OUT = join(ROOT, 'temp', 'local-artifacts', 'l8-c3b0')

function loadJson<T>(p: string): T { return JSON.parse(readFileSync(p, 'utf8')) as T }

const ttcPlan = loadJson<any>(join(DIR_C3, 'teaching-task-classgroup-migration-plan.local.json'))
const refClasses = loadJson<any[]>(join(DIR_C3, 'reference-canonical-classgroups.raw.local.json'))
const dbPlans = loadJson<any[]>(join(DIR_C3, 'db-classgroup-to-canonical-plan.local.json'))

const unmatched = ttcPlan.migrations.filter((m: any) => m.toClassGroupId === null)
const byCg: Record<number, { ttcIds: number[]; reason: string }> = {}
for (const m of unmatched) {
  if (!byCg[m.fromClassGroupId]) byCg[m.fromClassGroupId] = { ttcIds: [], reason: m.reason }
  byCg[m.fromClassGroupId].ttcIds.push(m.ttcId)
}
const cgMap: Record<number, any> = {}
for (const p of dbPlans) cgMap[p.dbClassGroupId] = p

function findCandidates(cg: any): any[] {
  if (!cg) return []
  const grade = cg.grade || '', major = cg.majorName || '', num = cg.classNumber || ''

  // 1: exact grade+major+classNumber
  let cands = refClasses.filter((r: any) => r.grade === grade && r.majorName === major && r.classNumber === num)
    .map((r: any) => ({ ...r, matchType: 'EXACT', confidence: 'HIGH' }))
  if (cands.length > 0) return cands.slice(0, 5)

  // 2: name variant (森林草原 ↔ 森林和草原)
  const variants = [major, major.replace('森林草原', '森林和草原'), major.replace('森林和草原', '森林草原')]
  cands = refClasses.filter((r: any) => r.grade === grade && variants.includes(r.majorName) && r.classNumber === num)
    .map((r: any) => ({ ...r, matchType: 'NAME_VARIANT', confidence: 'MEDIUM' }))
  if (cands.length > 0) return cands.slice(0, 5)

  // 3: partial major match
  cands = refClasses.filter((r: any) => r.grade === grade && r.classNumber === num && (r.majorName.includes(major) || major.includes(r.majorName)))
    .map((r: any) => ({ ...r, matchType: 'PARTIAL', confidence: 'LOW' }))
  if (cands.length > 0) return cands.slice(0, 5)

  // 4: composite split
  if (major.includes('+') || major.includes('、')) {
    const parts = major.split(/[+、]/).map((s: string) => s.trim())
    for (const part of parts) {
      const clean = part.replace(/[（(][^）)]*[）)]/, '').trim()
      for (const r of refClasses) {
        if (r.grade === grade && r.majorName === clean) {
          cands.push({ ...r, matchType: 'COMPOSITE_SPLIT', confidence: 'MEDIUM', note: 'from: ' + clean })
        }
      }
    }
    if (cands.length > 0) return cands.slice(0, 5)
  }

  // 5: embedded 五年制
  if (major.includes('五年制')) {
    const clean = major.replace('五年制', '').replace(/^\d+/, '').trim()
    cands = refClasses.filter((r: any) => r.grade === grade && r.majorName === clean && r.schoolLength === '五年制')
      .map((r: any) => ({ ...r, matchType: 'EMBEDDED_SUFFIX', confidence: 'HIGH' }))
    if (cands.length > 0) return cands.slice(0, 5)
  }

  // 6: composite split with partial/keyword matching
  if (major.includes('+') || major.includes('、')) {
    const parts = major.split(/[+、]/).map((s: string) => s.trim())
    for (const part of parts) {
      const clean = part.replace(/[（(][^）)]*[）)]/, '').replace(/班$/, '').trim()
      for (const r of refClasses) {
        if (r.grade !== grade) continue
        // keyword match: ref major contains part keywords or vice versa
        const partChars = clean.replace(/现场工程师|技术|管理/g, '')
        const refChars = r.majorName.replace(/技术|管理/g, '')
        if (partChars.length >= 2 && refChars.includes(partChars)) {
          cands.push({ ...r, matchType: 'COMPOSITE_KEYWORD', confidence: 'MEDIUM', note: 'keyword match: ' + clean + ' → ' + r.majorName })
        }
      }
    }
    if (cands.length > 0) return cands.slice(0, 5)
  }

  return []
}

if (!existsSync(DIR_OUT)) mkdirSync(DIR_OUT, { recursive: true })

const output: any[] = []
let idx = 0
for (const [cgId, info] of Object.entries(byCg)) {
  idx++
  const cg = cgMap[Number(cgId)]
  const cands = findCandidates(cg)
  const top = cands[0]
  const suggested = top && (top.confidence === 'HIGH' || ['NAME_VARIANT', 'COMPOSITE_SPLIT', 'EMBEDDED_SUFFIX'].includes(top.matchType))
    ? 'manualSelect' : 'needsReview'

  output.push({
    index: idx,
    sourceClassGroupId: Number(cgId),
    sourceClassGroupName: cg?.name || 'UNKNOWN',
    sourceSemesterId: cg?.semesterId || 0,
    affectedTtcCount: info.ttcIds.length,
    reason: info.reason,
    candidates: cands.map((c: any, i: number) => ({
      index: i + 1, canonicalKey: c.canonicalKey, plannedName: c.plannedName,
      grade: c.grade, majorName: c.majorName, classNumber: c.classNumber,
      educationLevel: c.educationLevel, schoolLength: c.schoolLength,
      matchType: c.matchType, confidence: c.confidence, note: c.note || '',
    })),
    suggestedAction: suggested,
    suggestedCanonicalKey: top?.canonicalKey || '',
  })
}

writeFileSync(join(DIR_OUT, 'classgroup-8-review-for-user.local.json'), JSON.stringify(output, null, 2))

// Markdown
let md = '# 8 Unmatched ClassGroup Manual Review\n\n'
md += 'Generated by L8-C3B0. These 8 CGs need your selection.\n\n'
md += '## Reply Format\n\n'
md += 'Copy the template below and replace with your choices:\n\n'
md += '```\n'
for (const item of output) {
  md += item.index + ' = ' + (item.suggestedAction === 'manualSelect' ? 'candidate 1' : 'needsReview') + '\n'
}
md += '```\n\n'
md += 'Options: `candidate N` | `needsReview` | `manualEdit: <canonicalKey>`\n\n---\n\n'

for (const item of output) {
  md += `## #${item.index} — CG#${item.sourceClassGroupId} (sem${item.sourceSemesterId}, ${item.affectedTtcCount} TTCs)\n\n`
  md += `- **Name**: ${item.sourceClassGroupName}\n`
  md += `- **Reason**: ${item.reason}\n`
  md += `- **Suggested**: ${item.suggestedAction}${item.suggestedCanonicalKey ? ' → ' + item.suggestedCanonicalKey : ''}\n\n`
  if (item.candidates.length === 0) {
    md += '**No candidates found.** User must write `manualEdit: <canonicalKey>` or `needsReview`.\n\n'
  } else {
    md += '| # | canonicalKey | confidence | matchType | note |\n'
    md += '|---|---|---|---|---|\n'
    for (const c of item.candidates) {
      md += `| ${c.index} | ${c.canonicalKey} | ${c.confidence} | ${c.matchType} | ${c.note || ''} |\n`
    }
    md += '\n'
  }
}

writeFileSync(join(DIR_OUT, 'classgroup-8-review-for-user.local.md'), md)

console.log('Files written:')
console.log('  temp/local-artifacts/l8-c3b0/classgroup-8-review-for-user.local.json')
console.log('  temp/local-artifacts/l8-c3b0/classgroup-8-review-for-user.local.md')
console.log('')
for (const item of output) {
  console.log(`#${item.index} | CG#${item.sourceClassGroupId} | ${item.affectedTtcCount} TTCs`)
  console.log(`  ${item.sourceClassGroupName}`)
  console.log(`  → suggested: ${item.suggestedAction}${item.suggestedCanonicalKey ? ' → ' + item.suggestedCanonicalKey : ''}`)
  if (item.candidates.length > 0) {
    for (const c of item.candidates) {
      console.log(`  [${c.index}] ${c.canonicalKey} (${c.confidence}, ${c.matchType})${c.note ? ' — ' + c.note : ''}`)
    }
  } else {
    console.log('  NO CANDIDATES')
  }
  console.log('')
}
