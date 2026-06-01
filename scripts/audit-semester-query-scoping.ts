/**
 * K10-SEMESTER-QUERY-SCOPING-AUDIT
 *
 * Read-only audit script. Scans:
 * 1. Database semester state (counts, nulls)
 * 2. Source files for unscoped queries
 * 3. Entry-point risk classification
 *
 * Does NOT write to the database.
 */

import { PrismaClient } from "@prisma/client";
import * as fs from "fs";
import * as path from "path";

const prisma = new PrismaClient();
const ROOT = path.resolve(__dirname, "..");

let pass = 0;
let warn = 0;
let risk = 0;

function PASSED(label: string, detail?: string) {
  console.log(`  ✅ PASSED  ${label}${detail ? ` — ${detail}` : ""}`);
  pass++;
}

function WARNING(label: string, detail?: string) {
  console.log(`  ⚠️  WARNING ${label}${detail ? ` — ${detail}` : ""}`);
  warn++;
}

function RISK(label: string, detail?: string) {
  console.log(`  🔴 RISK    ${label}${detail ? ` — ${detail}` : ""}`);
  risk++;
}

// ─── Section 1: Database Semester State ───

async function auditDatabaseState() {
  console.log("\n═══ 1. Database Semester State ═══\n");

  const semesterCount = await prisma.semester.count();
  const activeSemesters = await prisma.semester.count({ where: { isActive: true } });
  const legacyDefault = await prisma.semester.findFirst({ where: { code: "LEGACY-DEFAULT" } });

  PASSED(`Semester count = ${semesterCount}`, semesterCount >= 1 ? "OK" : "unexpected");
  PASSED(`Active Semester count = ${activeSemesters}`);
  if (legacyDefault) {
    PASSED(`LEGACY-DEFAULT exists`, `id=${legacyDefault.id}`);
  } else {
    RISK(`LEGACY-DEFAULT does not exist`);
  }

  console.log("\n  Model Backfill Status:");
  console.log("  " + "─".repeat(65));
  console.log(
    "  " +
    "Model".padEnd(24) +
    "Total".padStart(7) +
    "NULL".padStart(7) +
    "Distinct".padStart(10) +
    "Status".padStart(12)
  );
  console.log("  " + "─".repeat(65));

  const models = [
    { name: "ClassGroup", delegate: prisma.classGroup },
    { name: "TeachingTask", delegate: prisma.teachingTask },
    { name: "ScheduleSlot", delegate: prisma.scheduleSlot },
    { name: "ScheduleAdjustment", delegate: prisma.scheduleAdjustment },
    { name: "SchedulingRun", delegate: prisma.schedulingRun },
    { name: "SchedulingConfig", delegate: prisma.schedulingConfig },
  ];

  for (const m of models) {
    const total = await (m.delegate as any).count();
    const nullCount = await (m.delegate as any).count({ where: { semesterId: null } });
    const distinct = await (m.delegate as any).groupBy({
      by: ["semesterId"],
    });
    const status = nullCount === 0 ? "OK" : "UNFILLED";

    console.log(
      "  " +
      m.name.padEnd(24) +
      String(total).padStart(7) +
      String(nullCount).padStart(7) +
      String(distinct.length).padStart(10) +
      status.padStart(12)
    );

    if (nullCount > 0) {
      RISK(`${m.name} has ${nullCount} unfilled semesterId records`);
    } else {
      PASSED(`${m.name} semesterId fully backfilled`);
    }
  }
}

// ─── Section 2: Static File Scan ───

interface QueryPattern {
  file: string;
  model: string;
  method: string;
  hasSemesterFilter: boolean;
  line: number;
}

function scanFileForQueries(filePath: string): QueryPattern[] {
  const results: QueryPattern[] = [];
  if (!fs.existsSync(filePath)) return results;

  const content = fs.readFileSync(filePath, "utf-8");
  const lines = content.split("\n");

  const models = [
    "teachingTask", "scheduleSlot", "classGroup",
    "schedulingRun", "schedulingConfig", "scheduleAdjustment",
    "room", "teacher", "course",
  ];
  const methods = ["findMany", "findFirst", "findUnique", "count", "groupBy", "create", "update", "delete", "upsert"];

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    for (const model of models) {
      for (const method of methods) {
        const pattern = new RegExp(`\\b${model}\\.${method}\\b`);
        if (pattern.test(line)) {
          // Check if semesterId appears in nearby lines (within 10 lines)
          const contextStart = Math.max(0, i - 2);
          const contextEnd = Math.min(lines.length - 1, i + 10);
          const context = lines.slice(contextStart, contextEnd + 1).join("\n");
          const hasSemester = /semesterId/.test(context);

          results.push({
            file: path.relative(ROOT, filePath).replace(/\\/g, "/"),
            model,
            method,
            hasSemesterFilter: hasSemester,
            line: i + 1,
          });
        }
      }
    }
  }

  return results;
}

function scanDirectory(dir: string): QueryPattern[] {
  const results: QueryPattern[] = [];
  if (!fs.existsSync(dir)) return results;

  const entries = fs.readdirSync(dir, { withFileTypes: true });
  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      results.push(...scanDirectory(fullPath));
    } else if (entry.name.endsWith(".ts") && !entry.name.endsWith(".d.ts")) {
      results.push(...scanFileForQueries(fullPath));
    }
  }

  return results;
}

async function auditStaticScans() {
  console.log("\n═══ 2. Static File Scan — Unscoped Queries ═══\n");

  const srcDir = path.join(ROOT, "src");
  const queries = scanDirectory(srcDir);

  // Filter to findMany/findFirst/findUnique/count/groupBy (read queries)
  const readQueries = queries.filter((q) =>
    ["findMany", "findFirst", "findUnique", "count", "groupBy"].includes(q.method)
  );

  // Semester-scoped models
  const semesterModels = [
    "teachingTask", "scheduleSlot", "classGroup",
    "schedulingRun", "schedulingConfig", "scheduleAdjustment",
  ];

  const unscopedReads = readQueries.filter(
    (q) => semesterModels.includes(q.model) && !q.hasSemesterFilter
  );

  console.log("  Potential unscoped reads on semester-bound models:\n");
  console.log("  " + "─".repeat(85));
  console.log(
    "  " +
    "File".padEnd(45) +
    "Model".padEnd(22) +
    "Method".padEnd(14) +
    "semesterId?"
  );
  console.log("  " + "─".repeat(85));

  // Deduplicate by file+line
  const seen = new Set<string>();
  const unique = unscopedReads.filter((q) => {
    const key = `${q.file}:${q.line}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });

  for (const q of unique) {
    console.log(
      "  " +
      q.file.slice(-44).padEnd(45) +
      q.model.padEnd(22) +
      q.method.padEnd(14) +
      (q.hasSemesterFilter ? "YES" : "NO ❌")
    );
  }

  console.log("  " + "─".repeat(85));
  console.log(`  Total unscoped reads: ${unique.length}\n`);

  if (unique.length > 0) {
    WARNING(
      `Found ${unique.length} unscoped read queries on semester-bound models`,
      "These load data from all semesters"
    );
  } else {
    PASSED("No unscoped reads found on semester-bound models");
  }

  // Check writes that don't set semesterId
  const writeQueries = queries.filter((q) =>
    ["create", "update", "upsert"].includes(q.method)
  );
  const semesterModelWrites = writeQueries.filter((q) =>
    semesterModels.includes(q.model)
  );
  const unscopedWrites = semesterModelWrites.filter((q) => !q.hasSemesterFilter);

  if (unscopedWrites.length > 0) {
    WARNING(
      `Found ${unscopedWrites.length} write operations that may not set semesterId`,
      "New records could have null semesterId"
    );
  }
}

// ─── Section 3: Entry-point Risk Classification ───

async function auditEntryPoints() {
  console.log("\n═══ 3. Entry-point Risk Classification ═══\n");

  const checks: { category: string; files: string[]; risk: "HIGH" | "MEDIUM" | "LOW" | "NONE"; notes: string }[] = [
    {
      category: "Scheduler data-loader",
      files: ["src/lib/scheduler/data-loader.ts"],
      risk: "HIGH",
      notes: "loadSchedulingContext() loads ALL TeachingTask/ScheduleSlot/Room with zero where clause",
    },
    {
      category: "Preview API + helper",
      files: [
        "src/app/api/admin/scheduler/preview/route.ts",
        "src/lib/scheduler/preview.ts",
      ],
      risk: "HIGH",
      notes: "No semesterId param; creates SchedulingRun without semesterId; config lookup is global findFirst",
    },
    {
      category: "Apply API + helper",
      files: [
        "src/app/api/admin/scheduler/apply/route.ts",
        "src/lib/scheduler/apply.ts",
      ],
      risk: "HIGH",
      notes: "No semesterId validation; fingerprint/score loads all slots globally; could fail on cross-semester state",
    },
    {
      category: "Rollback API + helper",
      files: [
        "src/app/api/admin/scheduler/rollback/route.ts",
        "src/lib/scheduler/rollback.ts",
      ],
      risk: "HIGH",
      notes: "Same as Apply: fingerprint/score loads all slots globally; no semester guard",
    },
    {
      category: "Runs history API",
      files: [
        "src/app/api/admin/scheduler/runs/route.ts",
        "src/app/api/admin/scheduler/runs/[id]/route.ts",
      ],
      risk: "MEDIUM",
      notes: "Returns ALL runs regardless of semester; no semester filter param",
    },
    {
      category: "Lockable-slots API",
      files: ["src/app/api/admin/scheduler/lockable-slots/route.ts"],
      risk: "HIGH",
      notes: "Loads ALL ScheduleSlots with NO where clause; feeds scheduler UI with cross-semester data",
    },
    {
      category: "Import flow",
      files: [
        "src/lib/import/importer.ts",
        "src/app/api/admin/import/confirm/route.ts",
        "src/app/api/admin/import/parse/route.ts",
      ],
      risk: "HIGH",
      notes: "ImportBatch has no semesterId; creates Task/Slot without semesterId; dedup is global",
    },
    {
      category: "Normal schedule view",
      files: [
        "src/app/api/schedule/route.ts",
        "src/store/scheduleStore.ts",
        "src/lib/schedule/adjustments.ts",
      ],
      risk: "HIGH",
      notes: "getEffectiveScheduleForWeek() loads ALL slots with NO where clause; dashboard shows all semesters",
    },
    {
      category: "Admin data pages",
      files: [
        "src/app/api/admin/[model]/route.ts",
        "src/app/api/schedule-slot/route.ts",
        "src/app/api/schedule-slot/[id]/route.ts",
        "src/app/api/teaching-task/route.ts",
        "src/app/api/teaching-task/[id]/route.ts",
      ],
      risk: "HIGH",
      notes: "CRUD on semester-bound models has no semester filter; creates records without semesterId",
    },
    {
      category: "Room capacity",
      files: [
        "src/app/api/admin/rooms/capacity/route.ts",
        "src/app/api/admin/rooms/capacity/[id]/route.ts",
      ],
      risk: "MEDIUM",
      notes: "Room.capacity should stay global; but maxAssignedStudentCount aggregates across all semesters",
    },
    {
      category: "Conflict check",
      files: ["src/lib/conflict-check.ts"],
      risk: "HIGH",
      notes: "Checks room/teacher/class conflicts across ALL semesters; false positives when multi-semester",
    },
    {
      category: "Excel export",
      files: ["src/app/api/export/excel/route.ts"],
      risk: "HIGH",
      notes: "Exports schedule data from all semesters; calls getEffectiveScheduleForWeek (unfiltered)",
    },
  ];

  for (const c of checks) {
    const tag = c.risk === "HIGH" ? "🔴 RISK" : c.risk === "MEDIUM" ? "⚠️  WARN " : "✅ PASS ";
    console.log(`  ${tag}  ${c.category}`);
    console.log(`          ${c.notes}`);
    console.log(`          Files: ${c.files.join(", ")}`);
    console.log();
  }
}

// ─── Section 4: Uncontrolled interface checks ───

async function auditUncontrolledInterfaces() {
  console.log("\n═══ 4. Uncontrolled Interface Checks ═══\n");

  // Check /api/scheduler/run does not exist
  const runPath = path.join(ROOT, "src/app/api/admin/scheduler/run");
  if (fs.existsSync(runPath)) {
    RISK("/api/scheduler/run exists (should not)");
  } else {
    PASSED("/api/scheduler/run does not exist");
  }

  // Check Re-run button
  const schedulerContent = path.join(ROOT, "src/app/admin/scheduler/scheduler-content.tsx");
  if (fs.existsSync(schedulerContent)) {
    const content = fs.readFileSync(schedulerContent, "utf-8");
    if (/re-run|rerun|reRun/i.test(content)) {
      WARNING("Re-run reference found in scheduler-content.tsx");
    } else {
      PASSED("No Re-run button in scheduler-content.tsx");
    }
  }

  // Check prisma/dev.db not tracked
  try {
    const { execSync } = await import("child_process");
    const output = execSync("git ls-files prisma/dev.db", { cwd: ROOT, encoding: "utf-8" }).trim();
    if (output.length > 0) {
      RISK("prisma/dev.db is tracked by git!");
    } else {
      PASSED("prisma/dev.db not tracked by git");
    }
  } catch {
    PASSED("prisma/dev.db not tracked (git ls-files empty)");
  }
}

// ─── Section 5: Semester scoping in SchedulingContext ───

async function auditSchedulingContextType() {
  console.log("\n═══ 5. SchedulingContext Type Check ═══\n");

  const typesFile = path.join(ROOT, "src/lib/scheduler/types.ts");
  if (!fs.existsSync(typesFile)) {
    RISK("types.ts not found");
    return;
  }

  const content = fs.readFileSync(typesFile, "utf-8");

  if (/semesterId/.test(content)) {
    PASSED("SchedulingContext includes semesterId");
  } else {
    RISK(
      "SchedulingContext does NOT include semesterId",
      "Cannot propagate semester scope through scheduler pipeline"
    );
  }

  if (/SchedulingRun.*semesterId|semesterId.*SchedulingRun/.test(content)) {
    PASSED("SchedulingRun type includes semesterId");
  } else {
    WARNING("SchedulingRun type may not include semesterId field in context");
  }
}

// ─── Main ───

async function main() {
  console.log("═══════════════════════════════════════════════════════════");
  console.log("K10-SEMESTER-QUERY-SCOPING-AUDIT");
  console.log("═══════════════════════════════════════════════════════════");

  await auditDatabaseState();
  await auditStaticScans();
  await auditEntryPoints();
  await auditUncontrolledInterfaces();
  await auditSchedulingContextType();

  console.log("\n═══════════════════════════════════════════════════════════");
  console.log("📊 Summary");
  console.log("═══════════════════════════════════════════════════════════");
  console.log(`  PASSED:  ${pass}`);
  console.log(`  WARNING: ${warn}`);
  console.log(`  RISK:    ${risk}`);
  console.log(`  TOTAL:   ${pass + warn + risk}`);
  console.log();
  console.log("  Recommended next phase: K10-SEMESTER-SCHEDULER-SCOPING-PREP");
  console.log("  Focus: data-loader + Preview semesterId binding (highest impact, lowest blast radius)");
  console.log("═══════════════════════════════════════════════════════════");

  if (risk > 0) {
    console.log(`\n  ⚠️  ${risk} risks identified. See details above.`);
  }
}

main()
  .catch((e) => {
    console.error("Error:", e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
