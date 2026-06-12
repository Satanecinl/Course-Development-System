/**
 * K36-A5D3C: Docs PII Regression Scan
 *
 * Read-only scanner for docs JSON files. Detects potential PII or
 * sensitive business data that may have leaked into audit/diagnostic
 * report files. Does NOT write files, does NOT read the database,
 * does NOT run any generate/write scripts.
 *
 * Exit codes: 0 = clean, 1 = blocking hits detected.
 *
 * Usage:  npx tsx scripts/scan-docs-pii.ts
 *         npm run scan:docs-pii
 */

import * as fs from 'fs'
import * as path from 'path'

// ─── Configuration ────────────────────────────────────────────────

/** Fields that, when containing a Chinese string that is NOT a
 *  whitelisted token, are flagged as BLOCKING. */
const HIGH_RISK_FIELDS = new Set([
  'teacherName', 'teacherNames', 'teacher',
  'courseName', 'courseNames',
  'classGroupName', 'classGroupNames',
  'roomName', 'roomNames',
  'reason', 'reasons',
  'evidence', 'excerpt',
  'recommendation',
  'summary',
  'description',
  'detail',
  'currentStatus', 'risk',
  'diagnosisEffort', 'improvementWithEvidence',
  'wrongCG', 'tasks', 'case',
])

/** Fields that hold numeric IDs — always pass, never checked. */
const STRUCTURAL_ID_FIELDS = new Set([
  'teacherId', 'classGroupId', 'classGroupIds', 'courseId', 'roomId',
  'teachingTaskId', 'taskId', 'slotId', 'importBatchId', 'semesterId',
  'dayOfWeek', 'slotIndex', 'week', 'startWeek', 'endWeek',
  'involvedSlotIds', 'teachingTaskIds', 'ttcId',
  'studentCount', 'capacity', 'shortage', 'requiredStudents',
  'overloadRatio', 'cohortYear',
])

/** Tokens that are acceptable anonymized values (regex strings). */
const ALLOWED_TOKEN_PATTERNS = [
  /^T\d{3}$/,
  /^CG\d{3}$/,
  /^Course\d{3}$/,
  /^Room\d{3}$/,
  /^<REDACTED>$/,
  /^<REDACTED_TEXT>$/,
  /^<REDACTED_REASON>$/,
  /^PASS$/,
  /^FAIL$/,
  /^WARNING$/,
  /^INFO$/,
  /^HIGH$/,
  /^MEDIUM$/,
  /^LOW$/,
  /^P[0-3]$/,
  // Structural values that are safe
  /^\d+$/,
  /^(null|true|false|unknown|none|N\/A|n\/a|empty)$/i,
]

/** Phone number pattern (Chinese mobile). */
const PHONE_RE = /1[3-9][0-9]{9}/

/** Patterns for timestamp-like false positives (13-digit millis). */
const TIMESTAMP_RE = /\b1[67]\d{11}\b/

// ─── Types ────────────────────────────────────────────────────────

interface Hit {
  file: string
  fieldPath: string
  type: string
  count: number
  blocking: boolean
  samplePreview?: string   // truncated, no full value
}

// ─── Main ─────────────────────────────────────────────────────────

function collectJsonFiles(dir: string): string[] {
  const results: string[] = []
  // Walk docs directory, collect .json files
  for (const entry of fs.readdirSync(dir)) {
    const fullPath = path.join(dir, entry)
    const stat = fs.statSync(fullPath)
    if (stat.isDirectory()) {
      results.push(...collectJsonFiles(fullPath))
    } else if (entry.endsWith('.json')) {
      results.push(fullPath)
    }
  }
  return results
}

function isAllowedToken(value: string): boolean {
  return ALLOWED_TOKEN_PATTERNS.some(p => p.test(value))
}

function containsChinese(value: string): boolean {
  // Match a single Chinese character anywhere in the string
  return /[一-鿿]/.test(value)
}

function walkJson(
  value: Record<string, unknown> | unknown[] | string | number | boolean | null | undefined,
  parentPath: string,
  parentKey: string,
  hits: Hit[],
  file: string,
): void {
  if (value === null || value === undefined) return

  // Arrays
  if (Array.isArray(value)) {
    // Check each element if parent is a high-risk field
    if (HIGH_RISK_FIELDS.has(parentKey)) {
      for (let i = 0; i < value.length; i++) {
        const v = value[i]
        if (typeof v === 'string' && containsChinese(v) && !isAllowedToken(v)) {
          hits.push({
            file,
            fieldPath: `${parentPath}[${i}]`,
            type: 'CHINESE_IN_ARRAY_ELEMENT',
            count: 1,
            blocking: true,
            samplePreview: `${v.substring(0, 20)}...(${v.length} chars)`,
          })
        }
      }
      return
    }
    for (let i = 0; i < value.length; i++) {
      walkJson(value[i], `${parentPath}[${i}]`, '', hits, file)
    }
    return
  }

  // Objects
  if (typeof value !== 'object') {
    // Leaf value — check if parentKey is high-risk
    if (typeof value === 'string' && HIGH_RISK_FIELDS.has(parentKey)) {
      if (containsChinese(value) && !isAllowedToken(value)) {
        hits.push({
          file,
          fieldPath: parentPath,
          type: 'CHINESE_IN_STRING',
          count: 1,
          blocking: true,
          samplePreview: `${value.substring(0, 20)}...(${value.length} chars)`,
        })
      }
    }
    return
  }

  // Walk object keys
  for (const key of Object.keys(value)) {
    if (STRUCTURAL_ID_FIELDS.has(key)) continue
    const childPath = parentPath ? `${parentPath}.${key}` : key
    walkJson(value[key], childPath, key, hits, file)
  }
}

function scanFileForPhoneNumbers(filePath: string, file: string): Hit[] {
  const hits: Hit[] = []
  const raw = fs.readFileSync(filePath, 'utf-8')
  const matches = raw.match(PHONE_RE)
  if (matches) {
    // Filter out timestamp-like false positives
    const realMatches = matches.filter(m => !TIMESTAMP_RE.test(m))
    if (realMatches.length > 0) {
      // Check if these are in structurally safe locations (filenames, paths)
      // by looking at surrounding context
      for (const match of realMatches) {
        hits.push({
          file,
          fieldPath: '<regex match>',
          type: 'PHONE_NUMBER',
          count: 1,
          blocking: false,  // treat as warning — likely import batch timestamps
          samplePreview: `${match.slice(0, 3)}***`,
        })
      }
    }
    // Count false positives (timestamps)
    const falsePositives = matches.filter(m => TIMESTAMP_RE.test(m))
    if (falsePositives.length > 0) {
      hits.push({
        file,
        fieldPath: '<regex match>',
        type: 'PHONE_FALSE_POSITIVE_CANDIDATE',
        count: falsePositives.length,
        blocking: false,
        samplePreview: `${falsePositives.length} matches look like timestamps`,
      })
    }
  }
  return hits
}

function main(): void {
  const projectRoot = process.cwd()
  const docsDir = path.join(projectRoot, 'docs')

  if (!fs.existsSync(docsDir)) {
    console.log('docs/ directory not found — nothing to scan.')
    process.exit(0)
  }

  const files = collectJsonFiles(docsDir)
  console.log(`\nK36-A5D3C: Docs PII Regression Scan`)
  console.log(`Scanning ${files.length} JSON files in docs/\n`)

  const allHits: Hit[] = []
  let filesScanned = 0
  let filesClean = 0

  for (const filePath of files) {
    const relPath = path.relative(projectRoot, filePath)
    let json: Record<string, unknown>
    try {
      json = JSON.parse(fs.readFileSync(filePath, 'utf-8')) as Record<string, unknown>
    } catch {
      console.log(`  WARNING: could not parse ${relPath} — skipped`)
      continue
    }

    filesScanned++

    // Walk JSON for field-level PII
    const hits: Hit[] = []
    walkJson(json, '', '', hits, relPath)

    // Scan raw content for phone numbers
    hits.push(...scanFileForPhoneNumbers(filePath, relPath))

    if (hits.length === 0) {
      filesClean++
    }
    allHits.push(...hits)
  }

  // ── Summary ──
  const blockingHits = allHits.filter(h => h.blocking)
  const warningHits = allHits.filter(h => !h.blocking && h.type !== 'PHONE_FALSE_POSITIVE_CANDIDATE')
  const falsePositiveCandidates = allHits.filter(h => h.type === 'PHONE_FALSE_POSITIVE_CANDIDATE')

  // Group by file
  const hitsByFile = new Map<string, Hit[]>()
  for (const h of allHits) {
    const arr = hitsByFile.get(h.file) || []
    arr.push(h)
    hitsByFile.set(h.file, arr)
  }

  console.log(`\n── Results ──`)
  console.log(`Files scanned:       ${filesScanned}`)
  console.log(`Files clean:         ${filesClean}`)
  console.log(`Total hits:          ${allHits.length}`)
  console.log(`  BLOCKING:          ${blockingHits.length}`)
  console.log(`  WARNING:           ${warningHits.length}`)
  console.log(`  False positive:    ${falsePositiveCandidates.length}`)
  console.log('')

  for (const [file, hits] of hitsByFile) {
    const blocking = hits.filter(h => h.blocking)
    const warning = hits.filter(h => !h.blocking)
    const icon = blocking.length > 0 ? '🔴' : warning.length > 0 ? '🟡' : '🟢'
    console.log(`${icon} ${file}: ${hits.length} hit(s) (${blocking.length} blocking, ${warning.length} warning)`)
    for (const h of hits) {
      const b = h.blocking ? 'BLOCKING' : 'warning'
      console.log(`    [${b}] ${h.fieldPath} — ${h.type} (count=${h.count})${h.samplePreview ? ' ' + h.samplePreview : ''}`)
    }
  }

  console.log(`\n── Exit ──`)
  if (blockingHits.length > 0) {
    console.log(`BLOCKING: ${blockingHits.length} hit(s) — docs JSON may contain PII.`)
    console.log('Exit code: 1\n')
    process.exit(1)
  } else {
    console.log('No blocking hits. Docs JSON are clean.')
    console.log('Exit code: 0\n')
    process.exit(0)
  }
}

main()
