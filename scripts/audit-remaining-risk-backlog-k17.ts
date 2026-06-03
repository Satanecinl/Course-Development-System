/**
 * K17 Remaining Risk Backlog Audit — read-only static audit script.
 * Enumerates all open risk items from K9–K16 that have not been resolved.
 * Does NOT write to the database, does NOT modify any source files.
 */

interface BacklogItem {
  id: string;
  sourceStage: string;
  category: string;
  severity: "HIGH" | "MEDIUM" | "LOW" | "INFO" | "ACCEPTED";
  title: string;
  evidence: string;
  recommendation: string;
  suggestedNextStage: string;
  blockCurrentMainline: boolean;
}

const backlog: BacklogItem[] = [
  // ── K16 residual ──────────────────────────────────────────────────
  {
    id: "K16-LOW-01",
    sourceStage: "K16",
    category: "RBAC permission granularity",
    severity: "LOW",
    title: "POST /api/teaching-task 仍用 data:write 未拆分为 task:create",
    evidence:
      "src/app/api/teaching-task/route.ts POST handler uses data:write guard; K14 audit flagged it as needing finer-grained permission but deferred.",
    recommendation:
      "引入 task:create 或 teachingtask:write 权限，从 data:write 分离。需同步 RBAC seed 和 frontend gating。",
    suggestedNextStage: "K17 or later",
    blockCurrentMainline: false,
  },
  {
    id: "K16-LOW-02",
    sourceStage: "K16",
    category: "RBAC guard semantics",
    severity: "LOW",
    title: "guardAdminTaskUpdate roomId no-op / whitelist 设计未落地",
    evidence:
      "K16 Fix-B (8b7fe08) added guardAdminTaskUpdate with teacher conflict guard; roomId change guard is still a no-op or uses whitelist approach that was never finalized.",
    recommendation:
      "决定 roomId guard 策略（no-op 允许 vs whitelist 限制），并在 guardAdminTaskUpdate 中实现。",
    suggestedNextStage: "K17 or later",
    blockCurrentMainline: false,
  },

  // ── K15 residual ──────────────────────────────────────────────────
  {
    id: "K15-MED-01",
    sourceStage: "K15",
    category: "RBAC scope definition",
    severity: "MEDIUM",
    title: "import:manage scope 未明确",
    evidence:
      "K15 RBAC scoping listed import:manage as a potential new scope but never defined boundaries; parse/confirm routes still use data:write.",
    recommendation:
      "定义 import:manage scope 含义（parse + confirm + audit），然后从 data:write 切换。",
    suggestedNextStage: "K17",
    blockCurrentMainline: false,
  },
  {
    id: "K15-MED-02",
    sourceStage: "K15",
    category: "RBAC page access",
    severity: "MEDIUM",
    title: "/admin/db page access 仍依赖 data:write",
    evidence:
      "Admin data pages (K15 scoping fix 8c6d20b) added semester scoping to queries but page-level access still checks data:write, not admin:read or a dedicated scope.",
    recommendation:
      "为 /admin/db 页面引入 admin:read 或 db:admin 权限 scope，与 API guard 对齐。",
    suggestedNextStage: "K17",
    blockCurrentMainline: false,
  },
  {
    id: "K15-LOW-01",
    sourceStage: "K15",
    category: "RBAC permission granularity",
    severity: "LOW",
    title: "data:delete 统一覆盖多个模型",
    evidence:
      "Single data:delete permission gates delete operations for TeachingTask, ScheduleSlot, ClassGroup, Teacher, Course, Room — no per-model delete granularity.",
    recommendation:
      "评估是否需要 per-model delete 权限（e.g., task:delete, room:delete）；如当前规模可接受则记录为 ACCEPTED。",
    suggestedNextStage: "K17 or later",
    blockCurrentMainline: false,
  },

  // ── K14 residual ──────────────────────────────────────────────────
  {
    id: "K14-MED-01",
    sourceStage: "K14",
    category: "RBAC route guard",
    severity: "MEDIUM",
    title: "audit-rbac-schedule-write-hardening 剩余 MEDIUM: admin PUT scheduleslot 无 session.user 权限校验",
    evidence:
      "K14 audit (9af89da) listed 6 MEDIUM items; Fix-A addressed frontend gating + semesterId injection; Fix-B addressed teacher conflict guard. Remaining MEDIUM items include PUT /api/data/scheduleslot missing explicit permission check beyond role.",
    recommendation:
      "在 PUT /api/data/scheduleslot route handler 中添加显式 permission 校验（非仅 role check）。",
    suggestedNextStage: "K17",
    blockCurrentMainline: false,
  },
  {
    id: "K14-LOW-01",
    sourceStage: "K14",
    category: "RBAC route guard",
    severity: "LOW",
    title: "audit-rbac-schedule-write-hardening 剩余 LOW: DELETE routes 权限粒度不足",
    evidence:
      "K14 audit listed 3 LOW items for DELETE routes using coarse data:delete without model-specific guards.",
    recommendation:
      "与 K15-LOW-01 合并处理；决定 per-model vs coarse delete 策略。",
    suggestedNextStage: "K17 or later",
    blockCurrentMainline: false,
  },

  // ── K11/K13 residual ──────────────────────────────────────────────
  {
    id: "K13-LOW-01",
    sourceStage: "K13",
    category: "Schedule mutation guard",
    severity: "LOW",
    title: "schedule mutation server guard 剩余: moveItem 不校验 weekType/startWeek/endWeek 一致性",
    evidence:
      "K13 audit (dd5cd21) found schedule mutation guards cover room/teacher/class conflicts; week constraint consistency on move is not enforced server-side (relies on client-side conflict-check).",
    recommendation:
      "在 /api/schedule moveItem handler 中增加 week constraint 校验，与 conflict-check 对齐。",
    suggestedNextStage: "K17 or later",
    blockCurrentMainline: false,
  },
  {
    id: "K13-LOW-02",
    sourceStage: "K13",
    category: "Conflict response shape",
    severity: "LOW",
    title: "conflict response shape / adjustment conflict check / conflict check unification 剩余项",
    evidence:
      "K13 Fix-D (3698485) added typed ScheduleConflictDetail fields; some call sites still consume only string[] messages, and adjustment dry-run vs real conflict-check response shapes are not fully unified.",
    recommendation:
      "将 adjustment dry-run response 与 conflict-check response 统一为同一类型；更新消费方使用 typed fields。",
    suggestedNextStage: "K17 or later",
    blockCurrentMainline: false,
  },

  // ── Test baseline ─────────────────────────────────────────────────
  {
    id: "TEST-BASELINE-01",
    sourceStage: "K16",
    category: "Test baseline drift",
    severity: "INFO",
    title: "ScheduleAdjustment ACTIVE count mismatch in test baseline",
    evidence:
      "K16 audit alignment (6343126) updated audit script baselines but ScheduleAdjustment ACTIVE count was noted as potentially stale; needs re-verification against current DB state.",
    recommendation:
      "运行 audit script 并比对 ACTIVE count 与实际 DB 记录；如有 drift 则更新基线。",
    suggestedNextStage: "K17",
    blockCurrentMainline: false,
  },

  // ── Lint baseline ─────────────────────────────────────────────────
  {
    id: "LINT-BASELINE-01",
    sourceStage: "K16",
    category: "Lint baseline",
    severity: "INFO",
    title: "pre-existing lint errors/warnings (~308 after K16 cleanup)",
    evidence:
      "K16 audit alignment reduced lint warnings from 350 to 308; remaining are pre-existing and not introduced by K13-K16 changes.",
    recommendation:
      "评估是否在后续阶段批量清理 lint warnings；当前不影响功能正确性。",
    suggestedNextStage: "Backlog (non-blocking)",
    blockCurrentMainline: false,
  },

  // ── K9 DQ residual ───────────────────────────────────────────────
  {
    id: "K9-DQ-01",
    sourceStage: "K9",
    category: "Data quality",
    severity: "MEDIUM",
    title: "合班班级匹配 / 年份归属错误",
    evidence:
      "K9 data quality review found 合班 auto-merge (character-subsequence matching) can produce false positives when class names share characters across years (e.g., 森林草原防火技术1班 matching both 2024 and 2025 year groups).",
    recommendation:
      "增强合班匹配逻辑，添加年份/年级约束；或在 import 后手动审核合班结果。",
    suggestedNextStage: "K17 or later",
    blockCurrentMainline: false,
  },

  // ── Room capacity / solver ────────────────────────────────────────
  {
    id: "CAPACITY-01",
    sourceStage: "K10",
    category: "Room capacity / solver precondition",
    severity: "MEDIUM",
    title: "Room.capacity 默认值 50 作为 placeholder，来源不可靠",
    evidence:
      "Room model default capacity=50; actual room capacities are not imported from source data. getTaskStudentCount() falls back to 50 per class group when studentCount is null. Solver uses these values for HC4/HC5 capacity checks.",
    recommendation:
      "1) 导入真实教室容量数据覆盖 placeholder; 2) 对 studentCount=null 的 ClassGroup 用实际数据回填; 3) capacity source-of-truth 应为 Room table 而非硬编码默认值。",
    suggestedNextStage: "K17 or later",
    blockCurrentMainline: false,
  },
];

// ── Output ──────────────────────────────────────────────────────────

function severityRank(s: BacklogItem["severity"]): number {
  return { HIGH: 0, MEDIUM: 1, LOW: 2, INFO: 3, ACCEPTED: 4 }[s];
}

const sorted = [...backlog].sort(
  (a, b) => severityRank(a.severity) - severityRank(b.severity)
);

console.log("═══════════════════════════════════════════════════════════");
console.log("  K17 Remaining Risk Backlog Audit");
console.log("  Generated: " + new Date().toISOString());
console.log("  Base commit: 6343126");
console.log("═══════════════════════════════════════════════════════════\n");

const counts: Record<string, number> = {};
for (const item of sorted) {
  counts[item.severity] = (counts[item.severity] ?? 0) + 1;
}
console.log("Severity summary:");
for (const sev of ["HIGH", "MEDIUM", "LOW", "INFO", "ACCEPTED"] as const) {
  if (counts[sev]) console.log(`  ${sev}: ${counts[sev]}`);
}
console.log(`  TOTAL: ${sorted.length}`);
console.log();

for (const item of sorted) {
  const blocking = item.blockCurrentMainline ? " [BLOCKING]" : "";
  console.log(`─── ${item.id} (${item.severity}${blocking}) ───`);
  console.log(`  Stage:    ${item.sourceStage}`);
  console.log(`  Category: ${item.category}`);
  console.log(`  Title:    ${item.title}`);
  console.log(`  Evidence: ${item.evidence}`);
  console.log(`  Fix:      ${item.recommendation}`);
  console.log(`  Next:     ${item.suggestedNextStage}`);
  console.log();
}

const blockingItems = sorted.filter((i) => i.blockCurrentMainline);
if (blockingItems.length > 0) {
  console.log("⚠ BLOCKING items:");
  for (const item of blockingItems) {
    console.log(`  - ${item.id}: ${item.title}`);
  }
  console.log();
} else {
  console.log("✓ No BLOCKING items found. Mainline is clear to proceed.\n");
}
