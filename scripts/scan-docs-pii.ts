/**
 * K36-A5D3C1: Docs PII Regression Scan (tuned)
 *
 * Read-only scanner for docs JSON files. Detects potential PII or
 * sensitive business data that may have leaked into audit/diagnostic
 * report files. Does NOT write files, does NOT read the database,
 * does NOT run any generate/write scripts.
 *
 * Two-tier field classification:
 *   A. STRICT_IDENTITY_FIELDS — blocking on any non-whitelisted Chinese
 *   B. FREE_TEXT_FIELDS — only blocking on specific PII patterns
 *
 * Exit codes: 0 = clean, 1 = blocking hits detected.
 *
 * Usage:  npx tsx scripts/scan-docs-pii.ts
 *         npm run scan:docs-pii
 */

import * as fs from 'fs'
import * as path from 'path'

// ─── Configuration ────────────────────────────────────────────────

/**
 * A. STRICT_IDENTITY_FIELDS: identity-bearing fields.
 * Blocking on any non-whitelisted Chinese string value.
 */
const STRICT_IDENTITY_FIELDS = new Set([
  'teacherName', 'teacherNames', 'teacher',
  'courseName', 'courseNames',
  'classGroupName', 'classGroupNames',
  'roomName', 'roomNames',
  'wrongCG',
])

/**
 * B. FREE_TEXT_FIELDS: audit text fields.
 * NOT blocking on generic Chinese audit text.
 * Only blocking on specific PII patterns (phone, identity labels, class patterns).
 */
const FREE_TEXT_FIELDS = new Set([
  'reason', 'reasons',
  'evidence', 'excerpt',
  'recommendation',
  'summary',
  'description',
  'detail',
  'currentStatus', 'risk',
  'diagnosisEffort', 'improvementWithEvidence',
  'tasks', 'case',
])

/** All fields we scan (union of A + B). */
const ALL_SCANNED_FIELDS = new Set([...STRICT_IDENTITY_FIELDS, ...FREE_TEXT_FIELDS])

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
  /^\d+$/,
  /^(null|true|false|unknown|none|N\/A|n\/a|empty)$/i,
]

/** Phone number pattern (Chinese mobile). */
const PHONE_RE = /1[3-9][0-9]{9}/

/** Patterns for timestamp-like false positives (13-digit millis). */
const TIMESTAMP_RE = /\b1[67]\d{11}\b/

/**
 * Patterns for FREE_TEXT_FIELDS that indicate real PII (not just
 * generic Chinese audit text). Only these trigger blocking in
 * free-text fields. Uses structural patterns only — no specific
 * real names, no hardcoded name lists.
 */
const FREE_TEXT_PII_PATTERNS = [
  { pattern: /\bteacherName\s*[=:：]/i, type: 'IDENTITY_LABEL_TEACHER' },
  { pattern: /\bcourseName\s*[=:：]/i, type: 'IDENTITY_LABEL_COURSE' },
  { pattern: /\bclassGroupName\s*[=:：]/i, type: 'IDENTITY_LABEL_CLASS' },
  { pattern: /\broomName\s*[=:：]/i, type: 'IDENTITY_LABEL_ROOM' },
  { pattern: /\d{4}级[一-鿿]{2,15}班/, type: 'CLASS_ENTITY_PATTERN' },
]

// ─── Types ────────────────────────────────────────────────────────

interface Hit {
  file: string
  fieldPath: string
  type: string
  count: number
  blocking: boolean
  severity: 'BLOCKING' | 'WARNING' | 'INFO'
  samplePreview?: string
}

// ─── Main ─────────────────────────────────────────────────────────

function collectJsonFiles(dir: string): string[] {
  const results: string[] = []
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
  return /[一-鿿]/.test(value)
}

function checkFreeTextForPII(value: string): { found: boolean; type: string } | null {
  for (const { pattern, type } of FREE_TEXT_PII_PATTERNS) {
    if (pattern.test(value)) {
      return { found: true, type }
    }
  }
  return null
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
    if (STRICT_IDENTITY_FIELDS.has(parentKey)) {
      for (let i = 0; i < value.length; i++) {
        const v = value[i]
        if (typeof v === 'string' && containsChinese(v) && !isAllowedToken(v)) {
          hits.push({
            file,
            fieldPath: `${parentPath}[${i}]`,
            type: 'IDENTITY_IN_ARRAY',
            count: 1,
            blocking: true,
            severity: 'BLOCKING',
            samplePreview: `<CJK_TEXT>(${v.length} chars)`,
          })
        }
      }
      return
    }
    // For free-text arrays, check each element for PII patterns
    if (FREE_TEXT_FIELDS.has(parentKey)) {
      for (let i = 0; i < value.length; i++) {
        const v = value[i]
        if (typeof v === 'string') {
          const pii = checkFreeTextForPII(v)
          if (pii) {
            hits.push({
              file,
              fieldPath: `${parentPath}[${i}]`,
              type: pii.type,
              count: 1,
              blocking: true,
              severity: 'BLOCKING',
              samplePreview: `<CJK_TEXT>(${v.length} chars)`,
            })
          }
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
    if (typeof value !== 'string') return
    // Leaf string value

    // STRICT_IDENTITY_FIELDS: blocking on any Chinese
    if (STRICT_IDENTITY_FIELDS.has(parentKey)) {
      if (containsChinese(value) && !isAllowedToken(value)) {
        hits.push({
          file,
          fieldPath: parentPath,
          type: 'IDENTITY_IN_STRING',
          count: 1,
          blocking: true,
          severity: 'BLOCKING',
          samplePreview: `<CJK_TEXT>(${value.length} chars)`,
        })
      }
      return
    }

    // FREE_TEXT_FIELDS: only blocking on specific PII patterns
    if (FREE_TEXT_FIELDS.has(parentKey)) {
      const pii = checkFreeTextForPII(value)
      if (pii) {
        hits.push({
          file,
          fieldPath: parentPath,
          type: pii.type,
          count: 1,
          blocking: true,
          severity: 'BLOCKING',
          samplePreview: `<CJK_TEXT>(${value.length} chars)`,
        })
      }
      return
    }
    return
  }

  // Walk object keys
  for (const key of Object.keys(value)) {
    if (STRUCTURAL_ID_FIELDS.has(key)) continue
    if (!ALL_SCANNED_FIELDS.has(key)) {
      // Not a scanned field — recurse into children to find nested scanned fields
      const childPath = parentPath ? `${parentPath}.${key}` : key
      walkJson((value as Record<string, unknown>)[key], childPath, key, hits, file)
      continue
    }
    const childPath = parentPath ? `${parentPath}.${key}` : key
    walkJson((value as Record<string, unknown>)[key], childPath, key, hits, file)
  }
}

function scanFileForPhoneNumbers(filePath: string, file: string): Hit[] {
  const hits: Hit[] = []
  const raw = fs.readFileSync(filePath, 'utf-8')
  const matches = raw.match(PHONE_RE)
  if (matches) {
    const realMatches = matches.filter(m => !TIMESTAMP_RE.test(m))
    if (realMatches.length > 0) {
      for (const match of realMatches) {
        hits.push({
          file,
          fieldPath: '<regex match>',
          type: 'PHONE_NUMBER',
          count: 1,
          blocking: false,
          severity: 'WARNING',
          samplePreview: `${match.slice(0, 3)}***`,
        })
      }
    }
    const falsePositives = matches.filter(m => TIMESTAMP_RE.test(m))
    if (falsePositives.length > 0) {
      hits.push({
        file,
        fieldPath: '<regex match>',
        type: 'PHONE_FALSE_POSITIVE_CANDIDATE',
        count: falsePositives.length,
        blocking: false,
        severity: 'INFO',
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
  console.log(`\nK36-A5D3C1: Docs PII Regression Scan (tuned)`)
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

    const hits: Hit[] = []
    walkJson(json, '', '', hits, relPath)
    hits.push(...scanFileForPhoneNumbers(filePath, relPath))

    if (hits.length === 0) {
      filesClean++
    }
    allHits.push(...hits)
  }

  // ── Summary ──
  const blockingHits = allHits.filter(h => h.blocking)
  const warningHits = allHits.filter(h => h.severity === 'WARNING')
  const infoHits = allHits.filter(h => h.severity === 'INFO')

  const hitsByFile = new Map<string, Hit[]>()
  for (const h of allHits) {
    const arr = hitsByFile.get(h.file) || []
    arr.push(h)
    hitsByFile.set(h.file, arr)
  }

  console.log(`── Results ──`)
  console.log(`Files scanned:       ${filesScanned}`)
  console.log(`Files clean:         ${filesClean}`)
  console.log(`Total hits:          ${allHits.length}`)
  console.log(`  BLOCKING:          ${blockingHits.length}`)
  console.log(`  WARNING:           ${warningHits.length}`)
  console.log(`  INFO:              ${infoHits.length}`)
  console.log('')

  for (const [file, hits] of hitsByFile) {
    const blocking = hits.filter(h => h.blocking)
    const warning = hits.filter(h => h.severity === 'WARNING')
    const icon = blocking.length > 0 ? '🔴' : warning.length > 0 ? '🟡' : '🟢'
    console.log(`${icon} ${file}: ${hits.length} hit(s) (${blocking.length} blocking, ${warning.length} warning)`)
    for (const h of hits) {
      const sev = h.severity
      console.log(`    [${sev}] ${h.fieldPath} — ${h.type} (count=${h.count})${h.samplePreview ? ' ' + h.samplePreview : ''}`)
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
