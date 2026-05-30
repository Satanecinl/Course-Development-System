import { PrismaClient } from "@prisma/client";
import * as fs from "fs";
import * as path from "path";

const prisma = new PrismaClient();

// ========== 类型定义 ==========

interface ClassInfo {
  class_name: string;
  advisor_name: string | null;
  advisor_phone: string | null;
}

interface JsonRecord {
  class_info: ClassInfo;
  teacher: string | null;
  course: string | null;
  room: string | null;
  day_of_week: number;
  time_slot: string;
  period_start: number;
  period_end: number;
  week_constraints: string | null;
  week_start: number;
  week_end: number;
  week_type: string;
  remark: string | null;
}

// ========== 时间槽映射 ==========

function mapTimeSlotToIndex(timeSlot: string): number {
  const normalized = timeSlot.trim();

  if (normalized === "1,2" || normalized === "1.2") return 1;
  if (normalized === "3,4" || normalized === "3.4") return 2;
  if (normalized === "5,6" || normalized === "5.6") return 3;
  if (normalized === "7,8" || normalized === "7.8") return 4;
  if (normalized === "9,10" || normalized === "9.10") return 5;
  if (normalized === "11,12" || normalized === "11.12") return 6;
  // 处理 "11,50" 等被错误编码的11-12节数据
  if (normalized.startsWith("11,") || normalized.startsWith("11.")) return 6;
  if (normalized.includes("中午")) return 7;
  if (normalized.includes("12")) return 6;

  // fallback: 解析数字
  const nums = normalized.split(/[,，.]/).map(Number);
  if (nums.length >= 2 && !isNaN(nums[0])) {
    const first = nums[0];
    if (first === 1) return 1;
    if (first === 3) return 2;
    if (first === 5) return 3;
    if (first === 7) return 4;
    if (first === 9) return 5;
  }

  console.warn(`[Warn] 无法映射时间槽: "${timeSlot}"，默认返回 1`);
  return 1;
}

// ========== 教室楼栋解析 ==========

function parseBuilding(roomName: string): string | null {
  // "11-322" → "11"
  const numMatch = roomName.match(/^(\d+)-/);
  if (numMatch) return numMatch[1];

  // "林校305" → "林校"
  const cnMatch = roomName.match(/^([一-龥]+)\d/);
  if (cnMatch) return cnMatch[1];

  // "1号楼虚拟仿真实训室" → "1号楼"
  const bldMatch = roomName.match(/^(\d+号楼)/);
  if (bldMatch) return bldMatch[1];

  // "12楼机房" → "12楼"
  const louMatch = roomName.match(/^(\d+楼)/);
  if (louMatch) return louMatch[1];

  // "线上" → null
  return null;
}

// ========== 合班解析 ==========

function isMeaningfulRemarkKeyword(keyword: string): boolean {
  const trimmed = keyword.trim();
  if (trimmed.length === 0) return false;
  return /[\p{Letter}\p{Number}]/u.test(trimmed);
}

function parseRemarkKeywords(remark: string | null): string[] {
  if (!remark) return [];

  // "与森防合班" → 提取 "森防"
  // "与检测技术机电34合班" → 提取多粒度关键词
  const core = remark
    .replace(/^与/, "")
    .replace(/合班$/, "")
    .trim();

  if (!core || !isMeaningfulRemarkKeyword(core)) return [];

  const keywords: string[] = [core];

  // 如果有数字末尾，提取不同粒度的子串
  const numMatch = core.match(/([一-龥]+?)(\d+)$/);
  if (numMatch) {
    const prefix = numMatch[1];   // "检测技术机电"
    const num = numMatch[2];      // "34"

    // 取末尾 2-4 个汉字 + 数字
    for (let len = 2; len <= Math.min(4, prefix.length); len++) {
      const kw = prefix.slice(-len) + num;
      if (isMeaningfulRemarkKeyword(kw)) keywords.push(kw);
    }

    // 取末尾 2 个汉字 + 数字的第 1 位
    if (num.length >= 2 && prefix.length >= 2) {
      const kw = prefix.slice(-2) + num[0];
      if (isMeaningfulRemarkKeyword(kw)) keywords.push(kw);
    }
  }

  return keywords;
}

const KNOWN_TRACKS = ['高本贯通', '现场工程师'];

function extractYear(name: string): string | null {
  const m = name.match(/^(\d{4})级/);
  return m ? m[1] : null;
}

function extractTrack(name: string): string | null {
  for (const t of KNOWN_TRACKS) {
    if (name.includes(t)) return t;
  }
  return null;
}

function hasExplicitYear(text: string): boolean {
  return /\d{4}级/.test(text);
}

function hasExplicitTrack(text: string): boolean {
  for (const t of KNOWN_TRACKS) {
    if (text.includes(t)) return true;
  }
  return false;
}

function filterCandidatesByYearAndTrack(
  baseClassName: string,
  keyword: string,
  candidates: { id: number; name: string }[],
): { id: number; name: string }[] {
  const baseYear = extractYear(baseClassName);
  const baseTrack = extractTrack(baseClassName);
  const keywordHasYear = hasExplicitYear(keyword);
  const keywordHasTrack = hasExplicitTrack(keyword);

  return candidates.filter((c) => {
    if (!keywordHasYear && baseYear) {
      const cy = extractYear(c.name);
      if (cy && cy !== baseYear) return false;
    }
    if (!keywordHasTrack && baseTrack) {
      const ct = extractTrack(c.name);
      if (ct && ct !== baseTrack) return false;
    }
    return true;
  });
}

async function findMergedClassIds(
  keywords: string[],
  baseClassName: string,
): Promise<{ id: number; name: string }[]> {
  const results: { id: number; name: string }[] = [];
  const seen = new Set<number>();

  const allClasses = await prisma.classGroup.findMany({
    select: { id: true, name: true },
  });

  for (const kw of keywords) {
    if (kw.length < 2) continue;

    const filtered = filterCandidatesByYearAndTrack(baseClassName, kw, allClasses);

    // 第一轮：精确 contains 匹配（过滤后候选集）
    const includesMatches: { id: number; name: string }[] = [];
    for (const c of filtered) {
      if (c.name === baseClassName || seen.has(c.id)) continue;
      if (c.name.includes(kw)) {
        includesMatches.push(c);
      }
    }

    if (includesMatches.length === 1) {
      seen.add(includesMatches[0].id);
      results.push(includesMatches[0]);
    } else if (includesMatches.length > 1) {
      console.warn(`AMBIGUOUS_MATCH: keyword "${kw}" matches ${includesMatches.length} classes: ${includesMatches.map(c => c.name).join(', ')}`);
      continue;
    }

    // 第二轮：子序列匹配（过滤后候选集）
    if (includesMatches.length === 0) {
      const subseqMatches: { id: number; name: string }[] = [];
      const chars = [...kw];
      for (const c of filtered) {
        if (c.name === baseClassName || seen.has(c.id)) continue;
        let pos = 0;
        let matched = true;
        for (const ch of chars) {
          pos = c.name.indexOf(ch, pos);
          if (pos === -1) { matched = false; break; }
          pos++;
        }
        if (matched) {
          subseqMatches.push(c);
        }
      }

      if (subseqMatches.length === 1) {
        seen.add(subseqMatches[0].id);
        results.push(subseqMatches[0]);
      } else if (subseqMatches.length > 1) {
        console.warn(`AMBIGUOUS_SUBSEQ_MATCH: keyword "${kw}" matches ${subseqMatches.length} classes: ${subseqMatches.map(c => c.name).join(', ')}`);
      }
    }
  }
  return results;
}

// ========== 主流程 ==========

async function main() {
  console.log("========== 开始数据入库 ==========\n");

  const jsonPath = path.resolve(__dirname, "..", "output.json");
  if (!fs.existsSync(jsonPath)) {
    console.error(`错误: 找不到 ${jsonPath}`);
    process.exit(1);
  }

  const raw = fs.readFileSync(jsonPath, "utf-8");
  const records: JsonRecord[] = JSON.parse(raw);
  console.log(`读取到 ${records.length} 条 JSON 记录\n`);

  // ======== 第一步：实体去重 (Upsert) ========
  console.log("--- 第一步：实体去重 ---");

  // ClassGroup
  const classGroupMap = new Map<string, number>();
  for (const r of records) {
    const name = r.class_info.class_name;
    if (!name || classGroupMap.has(name)) continue;
    const cg = await prisma.classGroup.upsert({
      where: { name },
      update: {
        advisorName: r.class_info.advisor_name ?? undefined,
        advisorPhone: r.class_info.advisor_phone ?? undefined,
      },
      create: {
        name,
        advisorName: r.class_info.advisor_name ?? null,
        advisorPhone: r.class_info.advisor_phone ?? null,
      },
    });
    classGroupMap.set(name, cg.id);
  }
  console.log(`  ClassGroup: ${classGroupMap.size} 条`);

  // Teacher
  const teacherMap = new Map<string, number>();
  for (const r of records) {
    const name = r.teacher;
    if (!name || teacherMap.has(name)) continue;
    const t = await prisma.teacher.upsert({
      where: { name },
      update: {},
      create: { name },
    });
    teacherMap.set(name, t.id);
  }
  console.log(`  Teacher:    ${teacherMap.size} 条`);

  // Course
  const courseMap = new Map<string, number>();
  for (const r of records) {
    const name = r.course;
    if (!name || courseMap.has(name)) continue;
    const c = await prisma.course.upsert({
      where: { name },
      update: {},
      create: { name },
    });
    courseMap.set(name, c.id);
  }
  console.log(`  Course:     ${courseMap.size} 条`);

  // Room
  const roomMap = new Map<string, number>();
  for (const r of records) {
    const name = r.room;
    if (!name || roomMap.has(name)) continue;
    const building = parseBuilding(name);
    const room = await prisma.room.upsert({
      where: { name },
      update: { building: building ?? undefined },
      create: {
        name,
        building: building ?? null,
        capacity: 50,
        type: "NORMAL",
      },
    });
    roomMap.set(name, room.id);
  }
  console.log(`  Room:       ${roomMap.size} 条`);

  // ======== 第二步：创建 TeachingTask / ScheduleSlot / TeachingTaskClass ========
  console.log("\n--- 第二步：创建 TeachingTask / ScheduleSlot ---");

  let taskCount = 0;
  let slotCount = 0;
  let autoMergeCount = 0;
  let mergeWarnCount = 0;
  const warnedRemarks = new Set<string>();

  // TeachingTask 去重缓存：key = course|teacher|week|remark|classSignature
  // 与 importer.ts 保持一致，不应包含 day/slot/room
  const taskCache = new Map<string, number>();
  // ScheduleSlot 去重缓存：key = teachingTaskId|day|slot|room
  const slotCache = new Map<string, number>();

  for (let i = 0; i < records.length; i++) {
    const r = records[i];
    const courseId = courseMap.get(r.course || "");
    const teacherId = teacherMap.get(r.teacher || "") ?? null;
    const roomId = roomMap.get(r.room || "") ?? null;
    const classGroupId = classGroupMap.get(r.class_info.class_name);

    if (!courseId || !classGroupId) {
      console.warn(
        `[Warn] 跳过记录: 缺少课程或班级 (course=${r.course}, class=${r.class_info.class_name})`
      );
      continue;
    }

    const slotIndex = mapTimeSlotToIndex(r.time_slot);

    // 班级签名：主班级名 + remark（用于合班识别）
    const classSignature = r.remark
      ? `${r.class_info.class_name}|${r.remark}`
      : r.class_info.class_name;

    // 统一 TeachingTask 去重键：course|teacher|week|classSignature
    // 与 importer.ts 的 taskKey 逻辑保持一致（remark 不在 key 中，避免合班备注差异导致重复）
    const taskKey = [
      courseId,
      teacherId ?? '**NULL_TEACHER**',
      r.week_type,
      r.week_start,
      r.week_end,
      classSignature,
    ].join("|");

    let teachingTaskId: number;

    if (taskCache.has(taskKey)) {
      teachingTaskId = taskCache.get(taskKey)!;
    } else {
      const task = await prisma.teachingTask.create({
        data: {
          courseId,
          teacherId,
          weekType: r.week_type,
          startWeek: r.week_start,
          endWeek: r.week_end,
          remark: r.remark ?? null,
        },
      });
      teachingTaskId = task.id;
      taskCache.set(taskKey, teachingTaskId);
      taskCount++;
    }

    // ScheduleSlot 去重保护：同一个 TeachingTask 在同一 day/slot/room 不重复创建
    const slotKey = `${teachingTaskId}|${r.day_of_week}|${slotIndex}|${roomId ?? 'NULL'}`;
    if (!slotCache.has(slotKey)) {
      await prisma.scheduleSlot.create({
        data: {
          teachingTaskId,
          roomId,
          dayOfWeek: r.day_of_week,
          slotIndex,
        },
      });
      slotCache.set(slotKey, 1);
      slotCount++;
    }

    // 关联主班级 (TeachingTaskClass)
    await prisma.teachingTaskClass.upsert({
      where: {
        teachingTaskId_classGroupId: {
          teachingTaskId,
          classGroupId,
        },
      },
      update: {},
      create: { teachingTaskId, classGroupId },
    });

    // 处理合班关系
    if (r.remark) {
      const keywords = parseRemarkKeywords(r.remark);
      if (keywords.length > 0) {
        const merged = await findMergedClassIds(keywords, r.class_info.class_name);
        if (merged.length > 0) {
          for (const mg of merged) {
            await prisma.teachingTaskClass.upsert({
              where: {
                teachingTaskId_classGroupId: {
                  teachingTaskId,
                  classGroupId: mg.id,
                },
              },
              update: {},
              create: { teachingTaskId, classGroupId: mg.id },
            });
            autoMergeCount++;
          }
        } else {
          mergeWarnCount++;
          warnedRemarks.add(r.remark);
        }
      }
    }

    if ((i + 1) % 100 === 0) {
      console.log(`  已处理 ${i + 1}/${records.length} 条...`);
    }
  }

  // ======== 最终统计 ========
  const stats = {
    classGroup: await prisma.classGroup.count(),
    teacher: await prisma.teacher.count(),
    course: await prisma.course.count(),
    room: await prisma.room.count(),
    teachingTask: await prisma.teachingTask.count(),
    scheduleSlot: await prisma.scheduleSlot.count(),
    teachingTaskClass: await prisma.teachingTaskClass.count(),
  };

  console.log("\n========== 入库完成 ==========");
  console.log(`ClassGroup:        ${stats.classGroup} 条`);
  console.log(`Teacher:           ${stats.teacher} 条`);
  console.log(`Course:            ${stats.course} 条`);
  console.log(`Room:              ${stats.room} 条`);
  console.log(`TeachingTask:      ${stats.teachingTask} 条`);
  console.log(`ScheduleSlot:      ${stats.scheduleSlot} 条`);
  console.log(`TeachingTaskClass: ${stats.teachingTaskClass} 条 (关联记录)`);
  console.log(`\n自动合班关联成功: ${autoMergeCount} 条`);
  console.log(`合班解析失败:     ${mergeWarnCount} 条`);

  if (warnedRemarks.size > 0) {
    console.log("\n[Warn] 无法自动解析的合班备注:");
    for (const rm of warnedRemarks) {
      console.log(`  - ${rm}`);
    }
  }
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
