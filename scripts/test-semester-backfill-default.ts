import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

interface TestResult {
  name: string;
  passed: boolean;
  detail: string;
}

const results: TestResult[] = [];

function addResult(name: string, passed: boolean, detail: string) {
  results.push({ name, passed, detail });
  const status = passed ? "✓" : "✗";
  console.log(`${status} ${name}: ${detail}`);
}

async function testDefaultSemesterExists() {
  const semesters = await prisma.semester.findMany({
    where: { code: "LEGACY-DEFAULT" },
  });

  if (semesters.length === 0) {
    addResult("Default Semester exists", false, "Not found");
    return;
  }

  if (semesters.length > 1) {
    addResult("Default Semester unique", false, `Found ${semesters.length} duplicates`);
    return;
  }

  const s = semesters[0];
  addResult("Default Semester exists", true, `id=${s.id}, code=${s.code}`);
  addResult("Default Semester code", s.code === "LEGACY-DEFAULT", `code=${s.code}`);
  addResult("Default Semester name", s.name === "既有数据默认学期", `name=${s.name}`);
  addResult("Default Semester isActive", s.isActive === true, `isActive=${s.isActive}`);
  addResult(
    "Default Semester optional fields null",
    s.academicYear === null && s.term === null && s.startsAt === null && s.endsAt === null,
    `academicYear=${s.academicYear}, term=${s.term}, startsAt=${s.startsAt}, endsAt=${s.endsAt}`
  );
}

async function testModelCounts() {
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
    const nullCount = await (m.delegate as any).count({
      where: { semesterId: null },
    });

    addResult(`${m.name} count`, total > 0, `total=${total}`);
    addResult(`${m.name} semesterId null = 0`, nullCount === 0, `nullCount=${nullCount}`);
  }
}

async function testNoUnnecessarySemesterBinding() {
  // Room should NOT have semesterId
  const roomColumns = await prisma.$queryRaw`
    SELECT name FROM pragma_table_info('Room') WHERE name = 'semesterId'
  `;
  addResult(
    "Room has no semesterId",
    (roomColumns as any[]).length === 0,
    (roomColumns as any[]).length === 0 ? "No semesterId column" : "Has semesterId column"
  );

  // Teacher should NOT have semesterId
  const teacherColumns = await prisma.$queryRaw`
    SELECT name FROM pragma_table_info('Teacher') WHERE name = 'semesterId'
  `;
  addResult(
    "Teacher has no semesterId",
    (teacherColumns as any[]).length === 0,
    (teacherColumns as any[]).length === 0 ? "No semesterId column" : "Has semesterId column"
  );

  // Course should NOT have semesterId
  const courseColumns = await prisma.$queryRaw`
    SELECT name FROM pragma_table_info('Course') WHERE name = 'semesterId'
  `;
  addResult(
    "Course has no semesterId",
    (courseColumns as any[]).length === 0,
    (courseColumns as any[]).length === 0 ? "No semesterId column" : "Has semesterId column"
  );

  // SchedulerRunChange should NOT have semesterId (it gets semester via run)
  const srcColumns = await prisma.$queryRaw`
    SELECT name FROM pragma_table_info('SchedulerRunChange') WHERE name = 'semesterId'
  `;
  addResult(
    "SchedulerRunChange has no semesterId",
    (srcColumns as any[]).length === 0,
    (srcColumns as any[]).length === 0 ? "No semesterId column (inherits via run)" : "Has semesterId column"
  );
}

async function testNoSchedulerRunApi() {
  // Check that /api/scheduler/run does not exist by looking for the route file
  const fs = await import("fs");
  const path = await import("path");

  const apiPath = path.join(process.cwd(), "src", "app", "api", "scheduler", "run");
  const exists = fs.existsSync(apiPath);
  addResult(
    "/api/scheduler/run does not exist",
    !exists,
    exists ? "Route exists (unexpected)" : "Route does not exist (correct)"
  );
}

async function testDbNotTracked() {
  const { execSync } = await import("child_process");
  const output = execSync("git ls-files prisma/dev.db", { encoding: "utf-8" }).trim();
  addResult(
    "prisma/dev.db not tracked by git",
    output === "",
    output === "" ? "Not tracked" : `Tracked: ${output}`
  );
}

async function testAllSemesterIdsValid() {
  const models = [
    { name: "ClassGroup", delegate: prisma.classGroup },
    { name: "TeachingTask", delegate: prisma.teachingTask },
    { name: "ScheduleSlot", delegate: prisma.scheduleSlot },
    { name: "ScheduleAdjustment", delegate: prisma.scheduleAdjustment },
    { name: "SchedulingRun", delegate: prisma.schedulingRun },
    { name: "SchedulingConfig", delegate: prisma.schedulingConfig },
  ];

  const validSemesterIds = new Set(
    (await prisma.semester.findMany({ select: { id: true } })).map((s) => s.id)
  );

  for (const m of models) {
    const records = await (m.delegate as any).findMany({
      where: { semesterId: { not: null } },
      select: { id: true, semesterId: true },
    });

    const invalid = records.filter(
      (r: any) => r.semesterId !== null && !validSemesterIds.has(r.semesterId)
    );

    addResult(
      `${m.name} semesterIds all valid`,
      invalid.length === 0,
      invalid.length === 0
        ? `All ${records.length} non-null semesterIds point to valid Semester`
        : `${invalid.length} invalid references found`
    );
  }
}

async function main() {
  console.log("=== Semester Backfill Default Verification ===\n");

  await testDefaultSemesterExists();
  console.log();
  await testModelCounts();
  console.log();
  await testNoUnnecessarySemesterBinding();
  console.log();
  await testNoSchedulerRunApi();
  console.log();
  await testDbNotTracked();
  console.log();
  await testAllSemesterIdsValid();

  console.log("\n" + "=".repeat(50));
  const passed = results.filter((r) => r.passed).length;
  const failed = results.filter((r) => !r.passed).length;
  console.log(`Results: ${passed} passed, ${failed} failed`);

  if (failed > 0) {
    console.log("\nFailed tests:");
    for (const r of results.filter((r) => !r.passed)) {
      console.log(`  ✗ ${r.name}: ${r.detail}`);
    }
    process.exit(1);
  }

  console.log("\n✓ All verification tests passed");
}

main()
  .catch((e) => {
    console.error("Error:", e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
