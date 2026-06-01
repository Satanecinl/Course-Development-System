import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

const TARGET_MODELS = [
  "classGroup",
  "teachingTask",
  "scheduleSlot",
  "scheduleAdjustment",
  "schedulingRun",
  "schedulingConfig",
] as const;

type TargetModel = (typeof TARGET_MODELS)[number];

const DEFAULT_SEMESTER = {
  code: "LEGACY-DEFAULT",
  name: "既有数据默认学期",
  academicYear: null,
  term: null,
  startsAt: null,
  endsAt: null,
  isActive: true,
};

async function getModelStats(model: TargetModel): Promise<{ total: number; nullCount: number }> {
  const total = await (prisma[model] as any).count();
  const nullCount = await (prisma[model] as any).count({
    where: { semesterId: null },
  });
  return { total, nullCount };
}

async function dryRun() {
  console.log("=== DRY RUN ===\n");

  const semesterCount = await prisma.semester.count();
  console.log(`Current Semester count: ${semesterCount}`);

  const existing = await prisma.semester.findFirst({
    where: { code: DEFAULT_SEMESTER.code },
  });
  console.log(
    `Default Semester (${DEFAULT_SEMESTER.code}) exists: ${existing ? `Yes (id=${existing.id})` : "No"}`
  );

  console.log("\nModel Stats:");
  console.log("─".repeat(50));
  console.log("Model".padEnd(25), "Total".padStart(8), "NULL".padStart(8), "Backfill".padStart(10));
  console.log("─".repeat(50));

  let totalBackfill = 0;
  for (const model of TARGET_MODELS) {
    const stats = await getModelStats(model);
    console.log(
      model.padEnd(25),
      String(stats.total).padStart(8),
      String(stats.nullCount).padStart(8),
      String(stats.nullCount).padStart(10)
    );
    totalBackfill += stats.nullCount;
  }

  console.log("─".repeat(50));
  console.log("TOTAL".padEnd(25), "".padStart(8), "".padStart(8), String(totalBackfill).padStart(10));
  console.log("\n✓ No database writes performed");
}

async function apply() {
  console.log("=== APPLY ===\n");

  const existing = await prisma.semester.findFirst({
    where: { code: DEFAULT_SEMESTER.code },
  });

  let semesterId: number;
  let isNew = false;

  if (existing) {
    semesterId = existing.id;
    console.log(`Reusing existing Semester: id=${semesterId}, code=${existing.code}`);
  } else {
    const created = await prisma.semester.create({
      data: DEFAULT_SEMESTER,
    });
    semesterId = created.id;
    isNew = true;
    console.log(`Created new Semester: id=${semesterId}, code=${created.code}`);
  }

  console.log(`\nDefault Semester ID: ${semesterId}\n`);

  const results: { model: string; updated: number }[] = [];

  for (const model of TARGET_MODELS) {
    const beforeStats = await getModelStats(model);
    const result = await (prisma[model] as any).updateMany({
      where: { semesterId: null },
      data: { semesterId },
    });
    results.push({ model, updated: result.count });
    console.log(`${model}: updated ${result.count} records`);
  }

  console.log("\nSummary:");
  console.log("─".repeat(40));
  console.log("Model".padEnd(25), "Updated".padStart(10));
  console.log("─".repeat(40));
  let totalUpdated = 0;
  for (const r of results) {
    console.log(r.model.padEnd(25), String(r.updated).padStart(10));
    totalUpdated += r.updated;
  }
  console.log("─".repeat(40));
  console.log("TOTAL".padEnd(25), String(totalUpdated).padStart(10));

  if (isNew) {
    console.log(`\n✓ Created new default Semester (id=${semesterId})`);
  } else {
    console.log(`\n✓ Reused existing default Semester (id=${semesterId})`);
  }
  console.log(`✓ Updated ${totalUpdated} records`);
}

async function rollback() {
  console.log("=== ROLLBACK ===\n");

  const existing = await prisma.semester.findFirst({
    where: { code: DEFAULT_SEMESTER.code },
  });

  if (!existing) {
    console.log(`Default Semester (${DEFAULT_SEMESTER.code}) not found. Nothing to rollback.`);
    return;
  }

  const semesterId = existing.id;
  console.log(`Found default Semester: id=${semesterId}, code=${existing.code}\n`);

  const results: { model: string; updated: number }[] = [];

  for (const model of TARGET_MODELS) {
    const result = await (prisma[model] as any).updateMany({
      where: { semesterId },
      data: { semesterId: null },
    });
    results.push({ model, updated: result.count });
    console.log(`${model}: restored ${result.count} records to NULL`);
  }

  let totalRestored = 0;
  for (const r of results) {
    totalRestored += r.updated;
  }

  // Check if semester is still referenced
  let stillReferenced = false;
  for (const model of TARGET_MODELS) {
    const count = await (prisma[model] as any).count({
      where: { semesterId },
    });
    if (count > 0) {
      stillReferenced = true;
      break;
    }
  }

  if (!stillReferenced) {
    await prisma.semester.delete({ where: { id: semesterId } });
    console.log(`\n✓ Deleted default Semester (id=${semesterId}) as it has no remaining references`);
  } else {
    console.log(`\n⚠ Default Semester (id=${semesterId}) still has references. Not deleted.`);
  }

  console.log(`✓ Rolled back ${totalRestored} records`);
}

async function main() {
  const args = process.argv.slice(2);

  try {
    if (args.includes("--dry-run")) {
      await dryRun();
    } else if (args.includes("--apply")) {
      await apply();
    } else if (args.includes("--rollback")) {
      await rollback();
    } else {
      console.error("Usage: npx tsx scripts/backfill-default-semester.ts [--dry-run|--apply|--rollback]");
      process.exit(1);
    }
  } catch (error) {
    console.error("Error:", error);
    process.exit(1);
  } finally {
    await prisma.$disconnect();
  }
}

main();
