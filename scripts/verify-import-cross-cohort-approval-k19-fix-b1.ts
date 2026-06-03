/**
 * K19-FIX-B1-SCHEMA-AND-API-CROSS-COHORT-APPROVAL
 * 回归验证脚本 — 测试 cross-cohort approval persistence 的核心逻辑
 *
 * 使用 validateCrossCohortApprovals / buildApprovalTaskKey 纯函数 + DB 只读查询。
 * 不写 DB，不修改任何业务数据。
 */

import { validateCrossCohortApprovals, buildApprovalTaskKey } from '@/lib/import/importer'
import type { CrossCohortApproval } from '@/lib/import/importer'
import { PrismaClient } from '@prisma/client'

const prisma = new PrismaClient()

interface TestResult {
  name: string
  pass: boolean
  detail?: string
}

const results: TestResult[] = []

function pass(name: string) {
  results.push({ name, pass: true })
  console.log(`  PASS: ${name}`)
}

function fail(name: string, detail: string) {
  results.push({ name, pass: false, detail })
  console.log(`  FAIL: ${name} — ${detail}`)
}

// ── 公共 warning 构造 ──

function likelyErrorWarning(taskKey: string): string {
  return `LIKELY_ERROR_CROSS_COHORT: course="机械制图" links 2 cohorts (2024,2025) — not a known public course; review manually (taskKey=${taskKey})`
}

function legalPublicWarning(taskKey: string): string {
  return `LEGAL_PUBLIC_CROSS_COHORT: course="习近平新时代中国特色社会主义思想概论" links 2 cohorts (2024,2025) — allowed as public-course 合班 (taskKey=${taskKey})`
}

function ambiguousWarning(): string {
  return 'AMBIGUOUS_CLASSGROUP_MATCH: keyword "森防" weak-matches 2 classes: 2024级森林草原防火技术1班, 2025级森林草原防火技术1班 — not auto-linked'
}

function weakMatchWarning(): string {
  return 'COHORT_WEAK_MATCH_KEPT (weak-match, kept): keyword "森防" weak-matched 1 candidate "2025级森林草原防火技术1班" after cohort filter'
}

function businessWarning(): string {
  return '业务空值(缺教师): 17 条'
}

async function main() {
  console.log('K19-FIX-B1 Cross-Cohort Approval Verification')
  console.log('='.repeat(60))

  // ── T1: no approval + LIKELY_ERROR → blocked ──
  {
    const tk = buildApprovalTaskKey('机械制图', '赵春超', 'ALL', 1, 16)
    const r = validateCrossCohortApprovals([likelyErrorWarning(tk)], undefined)
    if (!r.ok && r.errors.length > 0) {
      pass('T1: no approval + LIKELY_ERROR → blocked')
    } else {
      fail('T1', `expected blocked, got ok=${r.ok} errors=${r.errors.length}`)
    }
  }

  // ── T2: approval true + LIKELY_ERROR + reason >= 5 → allowed ──
  {
    const tk = buildApprovalTaskKey('机械制图', '赵春超', 'ALL', 1, 16)
    const approvals: CrossCohortApproval[] = [{ taskKey: tk, approved: true, reason: '跨年级合班已确认' }]
    const r = validateCrossCohortApprovals([likelyErrorWarning(tk)], approvals)
    if (r.ok) {
      pass('T2: approval true + LIKELY_ERROR + reason >= 5 → allowed')
    } else {
      fail('T2', `expected allowed, got errors=${JSON.stringify(r.errors)}`)
    }
  }

  // ── T3: approval true + LIKELY_ERROR + reason < 5 → blocked ──
  {
    const tk = buildApprovalTaskKey('机械制图', '赵春超', 'ALL', 1, 16)
    const approvals: CrossCohortApproval[] = [{ taskKey: tk, approved: true, reason: 'ok' }]
    const r = validateCrossCohortApprovals([likelyErrorWarning(tk)], approvals)
    if (!r.ok && r.errors.some((e) => e.includes('reason required'))) {
      pass('T3: approval true + LIKELY_ERROR + reason < 5 → blocked')
    } else {
      fail('T3', `expected blocked (reason), got ok=${r.ok} errors=${JSON.stringify(r.errors)}`)
    }
  }

  // ── T4: approval false + LIKELY_ERROR → blocked ──
  {
    const tk = buildApprovalTaskKey('机械制图', '赵春超', 'ALL', 1, 16)
    const approvals: CrossCohortApproval[] = [{ taskKey: tk, approved: false }]
    const r = validateCrossCohortApprovals([likelyErrorWarning(tk)], approvals)
    if (!r.ok && r.errors.some((e) => e.includes('not granted'))) {
      pass('T4: approval false + LIKELY_ERROR → blocked')
    } else {
      fail('T4', `expected blocked (false), got ok=${r.ok} errors=${JSON.stringify(r.errors)}`)
    }
  }

  // ── T5: LEGAL_PUBLIC_CROSS_COHORT no approval → allowed (no errors) ──
  {
    const tk = buildApprovalTaskKey('习近平新时代中国特色社会主义思想概论', '房忠敏', 'ALL', 1, 16)
    const r = validateCrossCohortApprovals([legalPublicWarning(tk)], undefined)
    if (r.ok) {
      pass('T5: LEGAL_PUBLIC no approval → allowed')
    } else {
      fail('T5', `expected allowed, got errors=${JSON.stringify(r.errors)}`)
    }
  }

  // ── T6: LEGAL_PUBLIC with approval + reason → allowed + in map ──
  {
    const tk = buildApprovalTaskKey('习近平新时代中国特色社会主义思想概论', '房忠敏', 'ALL', 1, 16)
    const approvals: CrossCohortApproval[] = [{ taskKey: tk, approved: true, reason: '公共课跨年级合班' }]
    const r = validateCrossCohortApprovals([legalPublicWarning(tk)], approvals)
    if (r.ok && r.approvalsMap.has(tk)) {
      pass('T6: LEGAL_PUBLIC with approval + reason → allowed + in map')
    } else {
      fail('T6', `expected allowed+map, got ok=${r.ok} mapSize=${r.approvalsMap.size}`)
    }
  }

  // ── T7: COHORT_WEAK_MATCH_KEPT → no approval required ──
  {
    const r = validateCrossCohortApprovals([weakMatchWarning()], undefined)
    if (r.ok) {
      pass('T7: COHORT_WEAK_MATCH_KEPT → no approval required')
    } else {
      fail('T7', `expected ok, got errors=${JSON.stringify(r.errors)}`)
    }
  }

  // ── T8: AMBIGUOUS_CLASSGROUP_MATCH → no approval required ──
  {
    const r = validateCrossCohortApprovals([ambiguousWarning()], undefined)
    if (r.ok) {
      pass('T8: AMBIGUOUS_CLASSGROUP_MATCH → no approval required')
    } else {
      fail('T8', `expected ok, got errors=${JSON.stringify(r.errors)}`)
    }
  }

  // ── T9: same-cohort import (no cross-cohort warnings) → unaffected ──
  {
    const r = validateCrossCohortApprovals([businessWarning()], undefined)
    if (r.ok) {
      pass('T9: same-cohort import → unaffected')
    } else {
      fail('T9', `expected ok, got errors=${JSON.stringify(r.errors)}`)
    }
  }

  // ── T10: unknown taskKey approval → ignored (no crash) ──
  {
    const tk = buildApprovalTaskKey('机械制图', '赵春超', 'ALL', 1, 16)
    const approvals: CrossCohortApproval[] = [
      { taskKey: 'unknown|key|ALL|1|16', approved: true, reason: '某个不在 warnings 中的 taskKey' },
    ]
    const r = validateCrossCohortApprovals([likelyErrorWarning(tk)], approvals)
    if (!r.ok && r.errors.some((e) => e.includes('Missing'))) {
      pass('T10: unknown taskKey approval → still blocked for LIKELY_ERROR')
    } else {
      fail('T10', `expected blocked, got ok=${r.ok} errors=${JSON.stringify(r.errors)}`)
    }
  }

  // ── T11: warningsJson version=2 structure is correct ──
  {
    // 验证 confirmImportBatch 会写 version=2 结构 (read-only: 检查 importBatch.warningsJson shape)
    const batch = await prisma.importBatch.findFirst({
      where: { status: 'confirmed' },
      select: { id: true, warningsJson: true },
      orderBy: { id: 'asc' },
    })
    if (batch?.warningsJson) {
      try {
        const parsed = JSON.parse(batch.warningsJson)
        // B1 前的 confirmed batch 是 legacy string[]，不检查 version
        if (Array.isArray(parsed)) {
          pass('T11: warningsJson legacy shape (pre-B1 confirmed batch) — array format preserved')
        } else if (parsed.version === 2 && Array.isArray(parsed.warnings)) {
          pass('T11: warningsJson version=2 structure correct')
        } else {
          fail('T11', `unexpected shape: version=${parsed.version} hasWarnings=${Array.isArray(parsed.warnings)}`)
        }
      } catch {
        fail('T11', 'warningsJson is not valid JSON')
      }
    } else {
      fail('T11', 'no confirmed batch with warningsJson')
    }
  }

  // ── T12: buildApprovalTaskKey deterministic ──
  {
    const k1 = buildApprovalTaskKey('机械制图', '赵春超', 'ALL', 1, 16)
    const k2 = buildApprovalTaskKey('机械制图', '赵春超', 'ALL', 1, 16)
    const k3 = buildApprovalTaskKey('机械制图', '张红梅', 'ALL', 1, 16)
    if (k1 === k2 && k1 !== k3) {
      pass('T12: buildApprovalTaskKey deterministic')
    } else {
      fail('T12', `k1=${k1} k2=${k2} k3=${k3}`)
    }
  }

  // ── T13: buildApprovalTaskKey with null teacher ──
  {
    const k = buildApprovalTaskKey('体育', null, 'ALL', 1, 16)
    if (k === '体育|**NULL_TEACHER**|ALL|1|16') {
      pass('T13: buildApprovalTaskKey with null teacher')
    } else {
      fail('T13', `expected "体育|**NULL_TEACHER**|ALL|1|16", got "${k}"`)
    }
  }

  // ── T14: DB schema — TeachingTask has crossCohortApproved field ──
  {
    const t = await prisma.teachingTask.findFirst({
      select: { crossCohortApproved: true, crossCohortApprovalReason: true },
    })
    if (t && typeof t.crossCohortApproved === 'boolean' && t.crossCohortApproved === false) {
      pass('T14: DB schema has crossCohortApproved (default false)')
    } else {
      fail('T14', `expected crossCohortApproved=false, got=${JSON.stringify(t)}`)
    }
  }

  // ── T15: all 308 tasks still have crossCohortApproved=false ──
  {
    const count = await prisma.teachingTask.count({ where: { crossCohortApproved: false } })
    const total = await prisma.teachingTask.count()
    if (count === total && total === 308) {
      pass('T15: all 308 tasks have crossCohortApproved=false (no backfill needed)')
    } else {
      fail('T15', `expected 308, got approved=false:${count} total:${total}`)
    }
  }

  // ── T16: K18 5 historical tasks — still clean ──
  {
    const taskIds = [168, 174, 176, 181, 37]
    const tasks = await prisma.teachingTask.findMany({
      where: { id: { in: taskIds } },
      select: { id: true, crossCohortApproved: true, crossCohortApprovalReason: true },
    })
    const allClean = tasks.every((t) => !t.crossCohortApproved && t.crossCohortApprovalReason === null)
    if (tasks.length === 5 && allClean) {
      pass('T16: K18 5 historical tasks (168/174/176/181/37) still crossCohortApproved=false')
    } else {
      fail('T16', `found ${tasks.length} tasks, allClean=${allClean}: ${JSON.stringify(tasks)}`)
    }
  }

  // ── T17: multiple LIKELY_ERROR + partial approval → blocked ──
  {
    const tk1 = buildApprovalTaskKey('机械制图', '赵春超', 'ALL', 1, 16)
    const tk2 = buildApprovalTaskKey('电子技术', '许进', 'ALL', 1, 16)
    const approvals: CrossCohortApproval[] = [
      { taskKey: tk1, approved: true, reason: '已确认跨年级合班' },
      // tk2 missing
    ]
    const warnings = [likelyErrorWarning(tk1), likelyErrorWarning(tk2)]
    const r = validateCrossCohortApprovals(warnings, approvals)
    if (!r.ok && r.errors.length >= 1) {
      pass('T17: multiple LIKELY_ERROR + partial approval → blocked')
    } else {
      fail('T17', `expected blocked, got ok=${r.ok} errors=${JSON.stringify(r.errors)}`)
    }
  }

  // ── Summary ──
  console.log('')
  console.log('='.repeat(60))
  const passed = results.filter((r) => r.pass).length
  const failed = results.filter((r) => !r.pass).length
  console.log(`Summary: ${passed} PASS / ${failed} FAIL`)
  if (failed > 0) {
    console.log('')
    console.log('Failed tests:')
    for (const r of results.filter((r) => !r.pass)) {
      console.log(`  ${r.name}: ${r.detail}`)
    }
  }
  console.log('='.repeat(60))
}

main()
  .catch((e) => {
    console.error('Verification failed:', e)
    process.exit(1)
  })
  .finally(() => prisma.$disconnect())
