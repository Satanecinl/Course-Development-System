/**
 * K22-F7 Classroom Stability Constraint Audit
 *
 * Read-only design audit. Evaluates whether the "classroom stability" soft
 * constraint (NEW-SC-03 from K22-E roadmap) can be cleanly modeled on top of
 * the current data structures (ScheduleSlot / TeachingTask / Course / Room),
 * compares 4 candidate definitions, and produces a recommended full + delta
 * scoring design for downstream implementation in K22-F8.
 *
 * Strong constraints:
 *   - NO Prisma writes.
 *   - NO score.ts modifications.
 *   - NO solver modifications.
 *   - NO schema / migration / API / frontend / importer / parser / RBAC changes.
 *
 * Output:
 *   - Terminal summary
 *   - docs/k22-classroom-stability-constraint-audit.json
 */

import * as fs from 'node:fs'
import * as path from 'node:path'

const projectRoot = path.resolve(__dirname, '..')

// Use a dedicated client for read-only inspection. We do not perform any writes.
import { PrismaClient } from '@prisma/client'
const prisma = new PrismaClient()

// ── Types ────────────────────────────────────────────────────────────

type Severity = 'HIGH' | 'MEDIUM' | 'LOW' | 'INFO' | 'NONE'

interface DataFieldAudit {
  field: string
  type: string
  nullable: boolean
  purpose: string
  reliable: boolean
  evidence: string[]
}

interface DataStructureAudit {
  roomIdentification: DataFieldAudit
  teachingTaskIdentification: DataFieldAudit
  courseIdentification: DataFieldAudit
  classGroupIdentification: DataFieldAudit
  roomZeroHandling: DataFieldAudit
  weekendHandling: DataFieldAudit
  mergedClassHandling: DataFieldAudit
  specialtyRoomHandling: DataFieldAudit
  scoreContextSufficient: DataFieldAudit
}

interface DefinitionCandidate {
  id: 'CANDIDATE_A' | 'CANDIDATE_B' | 'CANDIDATE_C' | 'CANDIDATE_D'
  name: string
  description: string
  formula: string
  pros: string[]
  cons: string[]
  dataFeasible: boolean
  schemaChangeNeeded: boolean
  recommended: boolean
  rejectionReason?: string
}

interface FullScoreStep {
  step: number
  description: string
  pseudocode?: string
  notes: string
}

interface DeltaScoreStep {
  step: number
  description: string
  affectedKeys: string[]
  pseudocode?: string
  notes: string
}

interface HarnessCase {
  id: string
  category: 'full' | 'delta' | 'edge' | 'merged-class'
  title: string
  fixtureDescription: string
  expectedHard: number
  expectedSoft: number
  expectedDeltaHard?: number
  expectedDeltaSoft?: number
  note: string
}

interface Finding {
  id: string
  severity: Severity
  category: string
  title: string
  currentStatus: string
  evidence: string[]
  risk: string
  recommendation: string
  suggestedNextStage?: string
}

// ── 1. Data structure audit ──────────────────────────────────────────

function buildDataStructureAudit(): DataStructureAudit {
  return {
    roomIdentification: {
      field: 'Room (id, name, building, capacity, type)',
      type: 'Room model in prisma/schema.prisma',
      nullable: false,
      purpose: 'Identify rooms for stability aggregation. Score context already loads Room via SchedulingContext.rooms.',
      reliable: true,
      evidence: [
        'prisma/schema.prisma: model Room { id Int @id; name String @unique; building String?; capacity Int @default(50); type String @default("NORMAL") }',
        'src/lib/scheduler/types.ts: RoomWithAvailability includes id, name, building, capacity, type, availabilities',
        'src/lib/scheduler/data-loader.ts: prisma.room.findMany loads all rooms',
        'roomKey(roomId, day, slot) and slotsByRoom already populated by data-loader',
      ],
    },
    teachingTaskIdentification: {
      field: 'TeachingTask (id, courseId, teacherId, taskClasses[])',
      type: 'TeachingTask model',
      nullable: false,
      purpose: 'Recommended primary key for classroom stability: same teachingTask should reuse same room across multiple slots.',
      reliable: true,
      evidence: [
        'prisma/schema.prisma: TeachingTask { id, courseId, teacherId, weekType, startWeek, endWeek, taskClasses[], scheduleSlots[] }',
        'A TeachingTask typically has multiple ScheduleSlot records (one per weekly occurrence)',
        'ctx.slotsByTask: Map<taskId, SlotWithRelations[]> already populated by data-loader',
        'slot.teachingTask.id accessible via ctx.slots[i].teachingTask.id',
      ],
    },
    courseIdentification: {
      field: 'Course (id, name, isPractice)',
      type: 'Course model',
      nullable: false,
      purpose: 'Course-level aggregation: same course used by multiple TeachingTasks. Risk: same course can be split into multiple TeachingTasks (e.g. theory + practice), inflating room diversity.',
      reliable: true,
      evidence: [
        'prisma/schema.prisma: Course { id, name, isPractice }',
        'ctx.slots[i].teachingTask.course.id accessible',
        'Project does NOT model course.type (theory / practice / lab) — K22-G roadmap concern',
        'K22-E audit: 104 courses, all with free-text name; no type field in seed',
      ],
    },
    classGroupIdentification: {
      field: 'ClassGroup (id, name, studentCount)',
      type: 'ClassGroup model',
      nullable: false,
      purpose: 'ClassGroup-level aggregation: same classGroup across all its slots. Risk: a classGroup attends many courses on different days; cross-course room diversity is a weak signal.',
      reliable: true,
      evidence: [
        'prisma/schema.prisma: ClassGroup { id, name, studentCount, taskClasses[] }',
        'slot.teachingTask.taskClasses[].classGroupId accessible (already used by SC8)',
        'Project does NOT have ClassGroup.homeRoomId — schema change needed for explicit home room',
      ],
    },
    roomZeroHandling: {
      field: 'ScheduleSlot.roomId (0 = unscheduled)',
      type: 'Int?',
      nullable: true,
      purpose: 'Skip room=0 in stability aggregation. room=0 means unscheduled/placeholder; counting it as "another distinct room" would falsely inflate diversity.',
      reliable: true,
      evidence: [
        'prisma/schema.prisma: ScheduleSlot.roomId Int? (nullable)',
        'score.ts: getPos() returns room: slot.roomId ?? 0',
        'SC5 (K22-F4), SC6 (K22-F3), SC8 (K22-F6) all skip room=0 — same convention should apply',
      ],
    },
    weekendHandling: {
      field: 'dayOfWeek in [6, 7]',
      type: 'Int',
      nullable: false,
      purpose: 'Decide whether weekend slots participate in classroom stability aggregation.',
      reliable: true,
      evidence: [
        'SC7 (K22-F3) treats day >= 6 as weekend and penalizes -15 per slot',
        'If a teachingTask has a weekend slot, SC7 already penalizes it. Stability could either (a) skip weekend to avoid double-counting penalty, or (b) include weekend — solver may move a task from weekday to weekend to reduce room diversity but worsen SC7.',
        'Recommended: skip weekend [6, 7] to keep stability focused on room diversity within the 5-day teaching week. SC7 already handles weekend penalty.',
      ],
    },
    mergedClassHandling: {
      field: 'TeachingTask.taskClasses[]',
      type: 'TeachingTaskClass[]',
      nullable: false,
      purpose: 'A teachingTask may have N classGroups (合班). For TeachingTask-level stability, no special handling needed — the task is the primary key, regardless of how many classGroups it serves.',
      reliable: true,
      evidence: [
        'data-loader.ts:99-104 already iterates taskClasses to populate slotsByClass',
        'For TeachingTask-level: no expansion needed. distinctRooms is computed across the task\'s own slots.',
        'For ClassGroup-level: would need to expand to each classGroup (like SC8).',
      ],
    },
    specialtyRoomHandling: {
      field: 'Room.type (NORMAL/LAB/STUDIO/...), Course.type (N/A)',
      type: 'String defaults',
      nullable: false,
      purpose: 'Specialty classroom constraint (K22-G concern). Currently all rooms are NORMAL; no specialty classroom matching. Stability should not need to be aware of specialty room types.',
      reliable: false,
      evidence: [
        'K22-E audit: 53 rooms, all NORMAL (no specialty classification)',
        'K22-G roadmap concerns: Course.type (Theory/Practice/Lab) not modeled',
        'Stability is orthogonal to specialty: stability wants "same room for same task"; specialty wants "specific room type for specific course".',
        'For F7 (TeachingTask-level stability), specialty data is not required.',
      ],
    },
    scoreContextSufficient: {
      field: 'SchedulingContext (read-only in-memory)',
      type: 'TS interface',
      nullable: false,
      purpose: 'Verify all data needed by SC9 is available without Prisma calls during scoring.',
      reliable: true,
      evidence: [
        'SchedulingContext.slots: SlotWithRelations[] — each slot has teachingTaskId, roomId, dayOfWeek, slotIndex',
        'slotsByTask: Map<taskId, SlotWithRelations[]> — already populated; iterate to find task\'s slots',
        'roomById: Map<roomId, RoomWithAvailability> — already populated; for diagnostics only (not needed for SC9 v1)',
        'No additional loading required for TeachingTask-level stability v1',
      ],
    },
  }
}

// ── 2. Definition candidates ─────────────────────────────────────────

function buildDefinitionCandidates(): DefinitionCandidate[] {
  return [
    {
      id: 'CANDIDATE_A',
      name: 'TeachingTask room stability',
      description:
        'For each TeachingTask, collect distinct non-zero roomIds across scheduled slots (weekday [1..5]). ' +
        'If distinctRooms <= 1, penalty = 0; else penalty = -X * (distinctRooms - 1).',
      formula:
        'for each teachingTask in ctx.tasks:\n' +
        '  rooms = distinct non-zero roomIds of task\'s slots where day in [1..5] and pos.room !== 0\n' +
        '  if rooms.size <= 1: continue\n' +
        '  penalty = -2 * (rooms.size - 1)\n' +
        '  softScore += penalty',
      pros: [
        'Simple, key-stable: taskId is the natural primary key from SchedulingContext.slotsByTask',
        'Aligned with business intent: "同一门课多次上课尽量固定教室"',
        'Delta-friendly: only 1 key (moved slot\'s teachingTaskId); O(task slots) per delta',
        'No schema change required',
        'No new index needed in SchedulingContext (slotsByTask already populated)',
        'Room diversity is per-task, not per-classGroup: no merge expansion needed',
        'Independent of SC1/SC4/SC8 keys: orthogonal',
      ],
      cons: [
        'If same course is split into multiple TeachingTasks (e.g. theory + practice), per-task stability won\'t penalize cross-task room switches',
        'Does not enforce "hard" room stability (still soft)',
        'Task may have only 1 slot → 0 penalty regardless of room',
      ],
      dataFeasible: true,
      schemaChangeNeeded: false,
      recommended: true,
    },
    {
      id: 'CANDIDATE_B',
      name: 'ClassGroup room stability',
      description:
        'For each classGroup, collect distinct non-zero roomIds across scheduled slots (weekday [1..5] OR per-day). ' +
        'Penalize based on (distinctRooms - allowedRoomCount).',
      formula:
        'Option 1: per classGroup across all weekday slots\n' +
        '  rooms = distinct non-zero roomIds of classGroup\'s slots where day in [1..5]\n' +
        '  penalty = -X * max(0, rooms.size - allowedRoomCount)\n' +
        'Option 2: per classGroup + day\n' +
        '  for (cg, day): rooms = distinct roomIds that day\n' +
        '  penalty = -X * max(0, rooms.size - 1)',
      pros: [
        'Student experience: same classGroup少换教室',
        'Same aggregation pattern as SC8 (classGroup + day)',
      ],
      cons: [
        'ClassGroup attends many different courses; cross-course room diversity is weak signal',
        'Per-day aggregation may unfairly penalize classGroups with 3+ courses in one day (each course has different room)',
        'Over-penalization may force solver into infeasible scheduling',
        'Conflicting dimension with SC8: both key on classGroup, may double-penalize',
        'Harder to justify semantically: classes in different subjects SHOULD be in different rooms',
      ],
      dataFeasible: true,
      schemaChangeNeeded: false,
      recommended: false,
      rejectionReason:
        'ClassGroup attends many courses on different days; cross-course room diversity is a weak signal. ' +
        'Over-penalization would conflict with legitimate room diversity (lab rooms, specialty rooms). ' +
        'SC8 already keys on classGroup+day for time gaps; adding room diversity on the same key risks double-counting.',
    },
    {
      id: 'CANDIDATE_C',
      name: 'Course room stability',
      description:
        'For each courseId, collect distinct non-zero roomIds across all tasks teaching this course. ' +
        'Penalize if distinctRooms > 1.',
      formula:
        'for each courseId:\n' +
        '  rooms = distinct non-zero roomIds of all slots where slot.teachingTask.courseId === courseId and day in [1..5]\n' +
        '  if rooms.size <= 1: continue\n' +
        '  penalty = -X * (rooms.size - 1)',
      pros: [
        'Cross-task aggregation: if same course is split into multiple TeachingTasks, all share one room',
        'Aligns with "专业课程尽量固定教室" business intent',
      ],
      cons: [
        'Course can be split into theory + practice + lab tasks with different room requirements (theory in classroom, practice in lab)',
        'Different classGroups on same course may have different capacity needs (room must fit all)',
        'Course.name is free-text; "汽车检测" vs "汽车检测1" could be split if name normalization is imperfect',
        'Cross-task room diversity is often LEGITIMATE (e.g. theory in A101, practice in lab)',
      ],
      dataFeasible: true,
      schemaChangeNeeded: false,
      recommended: false,
      rejectionReason:
        'Cross-task room diversity is often legitimate (theory vs practice vs lab). ' +
        'Course-level aggregation would penalize legitimate room switches. ' +
        'Specialty classroom matching (K22-G roadmap) is the better lever for course-room coupling.',
    },
    {
      id: 'CANDIDATE_D',
      name: 'Preferred room / home room schema',
      description:
        'Add Course.preferredRoomId, ClassGroup.homeRoomId, Teacher.preferredRoomIds, TeachingTask.preferredRoomId. ' +
        'SC9 then penalizes slots that don\'t use the preferred room.',
      formula:
        'Schema:\n' +
        '  Course.preferredRoomId Int?\n' +
        '  ClassGroup.homeRoomId Int?\n' +
        '  Teacher.preferredRoomIds String (JSON array of Int)\n' +
        '  TeachingTask.preferredRoomId Int?\n' +
        'SC9: if slot.roomId !== teachingTask.preferredRoomId → -X',
      pros: [
        'Business expression most explicit: "固定教室"明确',
        'Supports professional classrooms, class home rooms, teacher preferences',
      ],
      cons: [
        'CRITICAL: requires schema migration, admin UI, seed update, importer changes',
        'Data quality risk: preferredRoomId may be null for most records (no historical data)',
        'Schema changes are OUT OF SCOPE for K22-F7 (read-only audit)',
        'Better fit for K22-H schema planning or K23 roadmap',
      ],
      dataFeasible: false,
      schemaChangeNeeded: true,
      recommended: false,
      rejectionReason:
        'Schema change out of scope for K22-F7. K22-F7 is read-only audit. ' +
        'Schema-based preferred room should be a separate K22-H/K23 stage. ' +
        'Short-term stability must use existing data only.',
    },
  ]
}

// ── 3. Penalty scale design ─────────────────────────────────────────

function buildPenaltyDesign(): {
  defaultPenalty: number
  minRoomsBeforePenalty: number
  penaltyPerExtraRoom: number
  weekend: 'skip' | 'include'
  skipRules: string[]
} {
  return {
    defaultPenalty: -2,
    minRoomsBeforePenalty: 1,
    penaltyPerExtraRoom: -2,
    weekend: 'skip',
    skipRules: [
      'room === 0 (unscheduled)',
      'dayOfWeek in [6, 7] (weekend — SC7 owns)',
      'task has only 1 slot in [1..5] (no diversity possible)',
      'task has 0 non-weekend slots (e.g. all slots on weekend)',
    ],
  }
}

// ── 4. Aggregation strategy ─────────────────────────────────────────

function buildAggregationStrategy(): {
  recommended: string
  strategy: { id: string; description: string; reason: string }[]
} {
  return {
    recommended: 'TeachingTask-level, weekday-only, no merged-class expansion',
    strategy: [
      {
        id: 'STRATEGY-1',
        description: 'For each teachingTask, iterate task\'s slots where room !== 0 and day in [1..5].',
        reason: 'TeachingTask is the natural unit for "this course/teacher/class combination should reuse the same room".',
      },
      {
        id: 'STRATEGY-2',
        description: 'Build a Set<roomId> of distinct rooms. Compute size.',
        reason: 'Set deduplicates same-room repeated slots; size is the diversity count.',
      },
      {
        id: 'STRATEGY-3',
        description: 'If size <= 1, skip (no diversity penalty).',
        reason: 'A task with 1 distinct room is perfectly stable.',
      },
      {
        id: 'STRATEGY-4',
        description: 'If size > 1, penalty = -2 * (size - 1).',
        reason: 'Penalty scales linearly with diversity. Each extra room costs 2.',
      },
      {
        id: 'STRATEGY-5',
        description: 'Skip room=0 and weekend (day >= 6) per slot.',
        reason: 'Same convention as SC5/SC6/SC7/SC8.',
      },
      {
        id: 'STRATEGY-6',
        description: 'No merged-class expansion: stability is per-task, not per-classGroup.',
        reason: 'A task serving 5 classGroups (merged) should still have 1 room; that\'s the natural intent.',
      },
    ],
  }
}

// ── 5. Full score design ────────────────────────────────────────────

function buildFullScoreDesign(): { algorithm: string; steps: FullScoreStep[] } {
  return {
    algorithm:
      'Aggregate per TeachingTask the Set<roomId> from slots where room != 0 and day in [1..5]. ' +
      'For each task with size > 1, add -2 * (size - 1) to softScore. Emit SC9 detail.',
    steps: [
      {
        step: 1,
        description: 'Build a map: teachingTaskId → Set<roomId> (filtered)',
        pseudocode:
          'const taskRooms = new Map<number, Set<number>>()\n' +
          'for (const slot of positions) {\n' +
          '  if (slot.room === 0) continue\n' +
          '  if (slot.day < 1 || slot.day > 5) continue\n' +
          '  const taskId = slot.teachingTaskId\n' +
          '  let set = taskRooms.get(taskId)\n' +
          '  if (!set) { set = new Set<number>(); taskRooms.set(taskId, set) }\n' +
          '  set.add(slot.room)\n' +
          '}',
        notes: 'O(ctx.slots) aggregation. Uses roomId as int (no need for Room objects).',
      },
      {
        step: 2,
        description: 'For each task, compute penalty from distinct room count',
        pseudocode:
          'for (const [taskId, roomSet] of taskRooms) {\n' +
          '  if (roomSet.size <= 1) continue\n' +
          '  const penalty = SOFT_SC9_TEACHING_TASK_ROOM_STABILITY * (roomSet.size - 1)\n' +
          '  softScore += penalty\n' +
          '  details.push({ type: "SC9_TEACHING_TASK_ROOM_STABILITY", level: "SOFT", penalty, message: `task ${taskId}: ${roomSet.size} distinct rooms` })\n' +
          '}',
        notes: 'Emit detail per task. Sample 1-2 room ids in message for debuggability.',
      },
    ],
  }
}

// ── 6. Delta score design ───────────────────────────────────────────

function buildDeltaScoreDesign(): {
  algorithm: string
  affectedKeys: string[]
  steps: DeltaScoreStep[]
  minPertIsolation: string
} {
  return {
    algorithm:
      'Find moved slot\'s teachingTaskId. For that task, compute distinct-room-count penalty ' +
      'before and after the move (using exclude-and-override pattern). deltaSoft = after - before.',
    affectedKeys: [
      'Single key: teachingTaskId of moved slot (always 1, not 2*keys like SC8)',
    ],
    steps: [
      {
        step: 1,
        description: 'Identify the moved slot\'s teachingTaskId',
        pseudocode:
          'const taskId = slot.teachingTaskId\n' +
          'const beforeRoomSet = buildTaskRoomSet(taskId, ctx, state, slot.id, oldDay, oldRoomId)\n' +
          'const afterRoomSet = buildTaskRoomSet(taskId, ctx, state, slot.id, move.newDay, move.newRoomId)\n' +
          'const beforePenalty = computeTaskRoomStabilityPenalty(beforeRoomSet)\n' +
          'const afterPenalty = computeTaskRoomStabilityPenalty(afterRoomSet)\n' +
          'deltaSoft += afterPenalty - beforePenalty',
        notes:
          'Affected key is exactly 1 (the moved task). Much smaller than SC8 (up to 2 * classGroups.length keys).',
      },
      {
        step: 2,
        description: 'Helper: buildTaskRoomSet(taskId, ctx, state, excludeSlotId, overrideDay, overrideRoomId)',
        pseudocode:
          'function buildTaskRoomSet(taskId, ctx, state, excludeSlotId, overrideDay, overrideRoomId): Set<number> {\n' +
          '  const set = new Set<number>()\n' +
          '  for (const slot of ctx.slots) {\n' +
          '    if (slot.id === excludeSlotId) continue\n' +
          '    if (slot.teachingTaskId !== taskId) continue\n' +
          '    const pos = getPos(slot, state)\n' +
          '    if (pos.room === 0) continue\n' +
          '    if (pos.day < 1 || pos.day > 5) continue\n' +
          '    set.add(pos.room)\n' +
          '  }\n' +
          '  if (overrideDay >= 1 && overrideDay <= 5 && overrideRoomId !== 0) {\n' +
          '    set.add(overrideRoomId)\n' +
          '  }\n' +
          '  return set\n' +
          '}',
        notes:
          'Same exclude-and-override pattern as F4 (SC5) and F6 (SC8). ' +
          'OverrideRoomId=0 means unscheduled — skip (matches full-score behavior).',
      },
      {
        step: 3,
        description: 'Local computation: only 1 task to evaluate',
        affectedKeys: ['teachingTaskId (1 key)'],
        notes:
          'O(ctx.slots) per delta. No need to iterate all tasks. ' +
          'For typical ctx.slots ~600 and a single-task filter, delta is O(600) vs full O(600) but with a much smaller constant (1 task\'s slots).',
      },
    ],
    minPertIsolation:
      'F3/F4/F6 pattern: set originalAssignments of the moved slot to a 3rd position (day=9, slotIndex=1, roomId=999) ' +
      'so MIN_PERT fires at both old and new positions, netting zero. The harness then isolates SC9 delta from MIN_PERT ' +
      'by comparing deltaSoft to the expected SC9 contribution only.',
  }
}

// ── 7. Constraint interaction analysis ──────────────────────────────

function buildInteractionAnalysis(): {
  hcRoomConflict: { overlap: string; direction: string; recommendation: string }
  hc4Capacity: { overlap: string; direction: string; recommendation: string }
  hc6Sc6: { overlap: string; direction: string; recommendation: string }
  sc8: { overlap: string; direction: string; recommendation: string }
  sc1Sc4: { overlap: string; direction: string; recommendation: string }
  minPert: { overlap: string; direction: string; recommendation: string }
} {
  return {
    hcRoomConflict: {
      overlap:
        'HC1 detects two slots in same room at same time (week overlap). SC9 wants one task in one room.',
      direction:
        'HC1 is hard; cannot be overridden. SC9 is soft; can suggest but cannot force a room. ' +
        'If solver moves a task\'s slot to a room that is already taken by another task at the same time, ' +
        'HC1 fires -1000. SC9 +2 stability benefit is dwarfed by HC1. So HC1 naturally dominates.',
      recommendation:
        'No code change. SC9 will never introduce an HC1 violation. Solver may move a task to its preferred room only if that room is free.',
    },
    hc4Capacity: {
      overlap:
        'HC4 requires room.capacity >= task.studentCount. SC9 does not check capacity.',
      direction:
        'SC9 may suggest a small room for a task that needs a large one. HC4 will block this. ' +
        'SC9 +2 vs HC4 -1000: HC4 wins.',
      recommendation:
        'No code change. SC9 is "soft room preference"; HC4 is hard feasibility. Solver will only use the preferred room if it fits.',
    },
    hc6Sc6: {
      overlap:
        'HC6: non-automotive tasks cannot be in Linxiao room (-1000). ' +
        'SC6: automotive tasks preferred in Linxiao (-20 if not).',
      direction:
        'If a non-automotive task is currently in Linxiao (HC6 fires -1000), and SC9 wants it to stay in Linxiao, ' +
        'the two constraints conflict. SC9 would reward staying; HC6 punishes it. ' +
        'However, SC9 just says "use the same room" — it doesn\'t say WHICH room. So SC9 + HC6/SC6 are independent keys.',
      recommendation:
        'No code change. SC9 keys by task; HC6/SC6 keys by task-classification. They compose: HC6 forces non-auto OUT of Linxiao; SC9 then says "stay in whatever room you end up in".',
    },
    sc8: {
      overlap:
        'SC8 keys by (classGroup, day). SC9 keys by (teachingTask). Different dimensions.',
      direction:
        'No conflict. A classGroup with 3 classes on the same day may have 3 different tasks in 3 different rooms (SC8 not affected, SC9 fires -2 per extra room per task with same task in multiple rooms). ' +
        'SC8 cares about time gaps; SC9 cares about room diversity within a task. They are complementary.',
      recommendation:
        'No code change. SC8 and SC9 are independent. K22-G roadmap can tune weights if needed.',
    },
    sc1Sc4: {
      overlap:
        'SC1: cross-building back-to-back for same teacher or shared class. ' +
        'SC4: cross-campus back-to-back for same task. ' +
        'SC9: same task in same room.',
      direction:
        'SC1/SC4 already encourage "same teacher in same building/campus" for adjacent periods. ' +
        'SC9 encourages "same task in same room". These are different concerns. ' +
        'However, if a task has multiple slots on the same day, SC9 will encourage same room; SC4 will encourage same campus. They may align.',
      recommendation:
        'No code change. SC1/SC4 keys by teacher/class or same task consecutive; SC9 keys by task room diversity. Orthogonal.',
    },
    minPert: {
      overlap:
        'MIN_PERT penalizes any moved slot (-2 per moved slot). SC9 penalizes room diversity.',
      direction:
        'Independent. A slot can be moved without changing room diversity (e.g. day change with same room) — MIN_PERT fires, SC9 unchanged. ' +
        'A slot can change room without moving (e.g. from same day+period) — MIN_PERT might or might not fire; SC9 changes.',
      recommendation:
        'Use 3rd-position originalAssignments to isolate SC9 delta from MIN_PERT in harness. Same pattern as F3/F4/F6.',
    },
  }
}

// ── 8. Harness design ───────────────────────────────────────────────

function buildHarnessPlan(): HarnessCase[] {
  return [
    {
      id: 'SC9-TASK-ROOM-STABILITY-SAME-ROOM',
      category: 'full',
      title: 'Same room (1 distinct): task with 2 slots in same room → SC9 0',
      fixtureDescription: '1 task with 2 slots both in room 100',
      expectedHard: 0,
      expectedSoft: 0,
      note: 'distinctRooms = 1, no penalty. Baseline.',
    },
    {
      id: 'SC9-TASK-ROOM-STABILITY-TWO-ROOMS',
      category: 'full',
      title: 'Two rooms (2 distinct): task with 2 slots in different rooms → SC9 -2',
      fixtureDescription: '1 task with 2 slots in room 100 and 200',
      expectedHard: 0,
      expectedSoft: -2,
      note: 'distinctRooms = 2, penalty = -2 * (2-1) = -2.',
    },
    {
      id: 'SC9-TASK-ROOM-STABILITY-THREE-ROOMS',
      category: 'full',
      title: 'Three rooms (3 distinct): task with 3 slots in 3 different rooms → SC9 -4',
      fixtureDescription: '1 task with 3 slots in rooms 100, 200, 300',
      expectedHard: 0,
      expectedSoft: -4,
      note: 'distinctRooms = 3, penalty = -2 * (3-1) = -4.',
    },
    {
      id: 'SC9-TASK-ROOM-STABILITY-SINGLE-SLOT',
      category: 'full',
      title: 'Single slot: task with 1 slot → SC9 0',
      fixtureDescription: '1 task with 1 slot',
      expectedHard: 0,
      expectedSoft: 0,
      note: 'distinctRooms = 1, no diversity possible. Skip.',
    },
    {
      id: 'SC9-TASK-ROOM-STABILITY-ROOM_ZERO-SKIP',
      category: 'edge',
      title: 'Room=0 skip: task with 1 scheduled + 1 room=0 → SC9 0',
      fixtureDescription: '1 task with 2 slots: 1 in room 100, 1 in room 0',
      expectedHard: 0,
      expectedSoft: 0,
      note: 'room=0 skipped; only room 100 counted; distinctRooms = 1. SC9 0.',
    },
    {
      id: 'SC9-TASK-ROOM-STABILITY-WEEKEND-SKIP',
      category: 'edge',
      title: 'Weekend skip: task with 1 weekday + 1 weekend → SC9 0',
      fixtureDescription: '1 task with 2 slots: 1 on day 1, 1 on day 6',
      expectedHard: 0,
      expectedSoft: 0,
      note: 'weekend [6,7] skipped; only day 1 counted; distinctRooms = 1. SC9 0. (SC7 fires for day 6 but SC9 0.)',
    },
    {
      id: 'SC9-TASK-ROOM-STABILITY-MULTI-CLASSGROUP',
      category: 'merged-class',
      title: 'Multi-classGroup: merged task (cg{1,2}) with 2 slots in different rooms → SC9 -2 (no double count)',
      fixtureDescription: '1 task with classGroups [1, 2] and 2 slots in rooms 100 and 200',
      expectedHard: 0,
      expectedSoft: -2,
      note: 'TeachingTask-level: no expansion. distinctRooms = 2, penalty = -2. No double-counting across classGroups.',
    },
    {
      id: 'SC9-DELTA-IMPROVE-TWO-ROOMS-TO-ONE',
      category: 'delta',
      title: 'Improve: 2 rooms → 1 room → deltaSoft=+2',
      fixtureDescription: '1 task with 2 slots in rooms 100 and 200. Move slot 2 from 200 to 100.',
      expectedHard: 0,
      expectedSoft: 0,
      expectedDeltaHard: 0,
      expectedDeltaSoft: 2,
      note: 'Before: 2 distinct rooms, -2. After: 1 room, 0. Delta = +2. Isolated via 3rd-position originalAssignments.',
    },
    {
      id: 'SC9-DELTA-WORSEN-ONE-ROOM-TO-TWO',
      category: 'delta',
      title: 'Worsen: 1 room → 2 rooms → deltaSoft=-2',
      fixtureDescription: '1 task with 2 slots both in room 100. Move slot 2 to room 200.',
      expectedHard: 0,
      expectedSoft: 0,
      expectedDeltaHard: 0,
      expectedDeltaSoft: -2,
      note: 'Before: 1 room, 0. After: 2 distinct rooms, -2. Delta = -2.',
    },
    {
      id: 'SC9-DELTA-ROOM_ZERO-TO-REAL',
      category: 'delta',
      title: 'room=0 → real: 1 room → 2 rooms → deltaSoft=-2',
      fixtureDescription: '1 task with 2 slots: 1 in room 100, 1 in room 0. Move slot 2 from room 0 to room 200.',
      expectedHard: 0,
      expectedSoft: 0,
      expectedDeltaHard: 0,
      expectedDeltaSoft: -2,
      note: 'Before: 1 distinct room (100), 0. After: 2 distinct rooms (100, 200), -2. Delta = -2. room=0 is excluded from distinctRooms.',
    },
    {
      id: 'SC9-DELTA-REAL-TO-ROOM_ZERO',
      category: 'delta',
      title: 'real → room=0: 2 rooms → 1 room → deltaSoft=+2',
      fixtureDescription: '1 task with 2 slots in rooms 100 and 200. Move slot 2 from room 200 to room 0.',
      expectedHard: 0,
      expectedSoft: 0,
      expectedDeltaHard: 0,
      expectedDeltaSoft: 2,
      note: 'Before: 2 distinct rooms, -2. After: 1 room (100, since 200→0 is excluded), 0. Delta = +2. room=0 excluded.',
    },
  ]
}

// ── 9. Findings ──────────────────────────────────────────────────────

function buildFindings(): Finding[] {
  const findings: Finding[] = []

  findings.push({
    id: 'K22-F7-A-1',
    severity: 'INFO',
    category: 'A. Data structure feasibility',
    title: 'TeachingTask + room + day全部在 SchedulingContext 中可用',
    currentStatus:
      'TeachingTask-level room stability is fully supported by existing data: ' +
      'slot.teachingTaskId, slot.roomId, slot.dayOfWeek all in ctx.slots; ' +
      'ctx.slotsByTask is already populated; no Prisma calls needed during scoring.',
    evidence: [
      'audit.teachingTaskIdentification.reliable = true',
      'audit.roomIdentification.reliable = true',
      'audit.scoreContextSufficient.reliable = true',
      'data-loader.ts:68-80 already builds slotsByTask Map<taskId, SlotWithRelations[]>',
    ],
    risk: 'INFO: 没有任何数据缺失风险。',
    recommendation: 'K22-F8 实施阶段直接复用现有 SchedulingContext。',
    suggestedNextStage: 'K22-F8-CLASSROOM-STABILITY-IMPL',
  })

  findings.push({
    id: 'K22-F7-B-1',
    severity: 'NONE',
    category: 'B. Definition choice',
    title: 'Candidate A (TeachingTask-level) 是推荐方案',
    currentStatus:
      '比较 4 个候选定义：' +
      'A: TeachingTask-level (推荐) — 1 个 task 多个 slot 尽量同 room; ' +
      'B: ClassGroup-level — 跨 course room diversity 弱信号, 与 SC8 维度重叠; ' +
      'C: Course-level — 跨 task room diversity 在 lab/practice 场景不合法; ' +
      'D: Preferred room schema — 需要 schema change, 不在 K22-F 范围.',
    evidence: [
      'Candidate A: data feasible, schema not needed, recommended=true',
      'Candidate B: rejected — conflicts with SC8 dimension, weak signal',
      'Candidate C: rejected — cross-task room diversity often legitimate (theory vs lab)',
      'Candidate D: rejected — schema change out of scope',
    ],
    risk: 'NONE: 候选 A 简单且数据完全支持。',
    recommendation:
      'K22-F8 实施 Candidate A: TeachingTask-level, penalty = -2 per extra room. ' +
      '与 SC8 (-2 per empty period) 同量级. Skip weekend [6,7], room=0, task with only 1 slot.',
    suggestedNextStage: 'K22-F8-CLASSROOM-STABILITY-IMPL',
  })

  findings.push({
    id: 'K22-F7-C-1',
    severity: 'MEDIUM',
    category: 'C. Penalty scale calibration',
    title: '推荐 -2 per extra room, 与 SC8 / SC5 同量级',
    currentStatus:
      '现有 penalty scale: SC1 -5, SC2 -10, SC3 -1, SC4 -5, SC5 -3, SC6 -20, SC7 -15, SC8 -2. ' +
      'SC9 -2 与 SC8 同量级, 不压过 SC1/SC4 (跨楼栋/校区), 也不弱于 SC8 (班级空洞). ' +
      'Linear: 2 distinct rooms = -2, 3 distinct rooms = -4, 4 distinct rooms = -6.',
    evidence: [
      'SC8 penalty: -2 per empty period (K22-F6)',
      'SC5 penalty: -3 per excess day (K22-F4)',
      'SC1 penalty: -5 per cross-building pair (K22-D)',
      'SC6 penalty: -20 per non-Linxiao auto task (K22-F3)',
    ],
    risk:
      'MEDIUM: -2 是初始值. K22-weights-roadmap 阶段可调. ' +
      '如果实际数据中 task 的 distinct room 普遍 = 1, SC9 不触发, 影响小. ' +
      '如果 solver 把 task 拆到 3+ 教室, SC9 -4 起作用.',
    recommendation:
      'K22-F8 实施 SOFT_SC9_TEACHING_TASK_ROOM_STABILITY = -2 per extra room. ' +
      '在 K22-weights-roadmap 阶段可调整. 不需要 hardWeights/softWeights schema 改造.',
    suggestedNextStage: 'K22-F8-CLASSROOM-STABILITY-IMPL',
  })

  findings.push({
    id: 'K22-F7-D-1',
    severity: 'LOW',
    category: 'D. Skip rules',
    title: 'room=0, weekend, task 1 slot, 0 weekday slots 全部应 skip',
    currentStatus:
      '4 个 skip rule 与现有约束一致：' +
      '1) room === 0 (unscheduled) → skip; ' +
      '2) dayOfWeek in [6, 7] (weekend) → skip, SC7 owns; ' +
      '3) task with only 1 weekday slot → distinctRooms = 1, no diversity, skip; ' +
      '4) task with 0 weekday slots (all weekend) → empty set, no penalty.',
    evidence: [
      'SC5 buildTeacherDailyCounts: pos.room === 0 → continue',
      'SC7 day >= 6 → soft -15',
      'SC8 size<2 → skip',
    ],
    risk: 'LOW: 4 个 skip rule 都是成熟做法, 实现无难点。',
    recommendation:
      'K22-F8 实施时严格按 4 条 skip rule 写代码, ' +
      '并在 harness 显式覆盖 (SC9-TASK-ROOM-STABILITY-SINGLE-SLOT, SC9-TASK-ROOM-STABILITY-ROOM_ZERO-SKIP, SC9-TASK-ROOM-STABILITY-WEEKEND-SKIP)。',
    suggestedNextStage: 'K22-F8-CLASSROOM-STABILITY-IMPL',
  })

  findings.push({
    id: 'K22-F7-E-1',
    severity: 'LOW',
    category: 'E. Interaction with existing constraints',
    title: 'SC9 与 HC1/HC4/HC6/SC1/SC4/SC8/MIN_PERT 全部独立',
    currentStatus:
      'SC9 key = teachingTaskId. 其他约束 keys 不同：' +
      'HC1: room-day-slot (pair); ' +
      'HC4: room.capacity; ' +
      'HC6: task.classification; ' +
      'SC1: pair (same teacher / shared class); ' +
      'SC4: pair (same task consecutive, different building); ' +
      'SC8: (classGroup, day); ' +
      'MIN_PERT: state original != current. ' +
      '所有 keys 不同, 无冲突. 0 code change 需求.',
    evidence: [
      'HC1: pair detection in score.ts:212-258',
      'SC1: pair detection in score.ts:304-344',
      'SC4: pair detection in score.ts:377-396',
      'SC8: (classGroup, day) per F6',
      'SC9: (teachingTask) per F7',
    ],
    risk: 'LOW: 没有 key conflict. K22-F8 实施不需要修改任何现有约束。',
    recommendation:
      'K22-F8 实施时不需要修改 HC1/HC2/HC3/HC4/HC5/HC6/SC1/SC2/SC3/SC4/SC5/SC6/SC7/SC8/MIN_PERT 任何代码.',
    suggestedNextStage: 'K22-F8-CLASSROOM-STABILITY-IMPL',
  })

  findings.push({
    id: 'K22-F7-F-1',
    severity: 'LOW',
    category: 'F. Delta score complexity',
    title: 'Delta 设计 = single-task before/after, 与 F4/F6 模式一致',
    currentStatus:
      'Affected key = 1 (moved slot 的 teachingTaskId). ' +
      '比 SC8 (up to 2 * taskClasses.length keys) 更小. ' +
      'Helper function buildTaskRoomSet(taskId, ctx, state, excludeSlotId, overrideDay, overrideRoomId) 是局部计算的核心. ' +
      'MIN_PERT 隔离沿用 3rd-position originalAssignments 模式 (F3/F4/F6).',
    evidence: [
      'K22-F4 buildTeacherDailyCounts(teacherId, slots, state, excludeSlotId?) — same exclude-and-override pattern',
      'K22-F6 buildClassDayPeriods(classGroupId, day, ctx, state, excludeSlotId, overrideDay, overrideIdx) — same pattern',
      'F3 buildStateForDeltaTarget uses day=9, slotIndex=1, roomId=999 for isolation',
    ],
    risk:
      'LOW: delta score 的 O(ctx.slots) 与 F4/F6 模式一致. ' +
      '需要小心 helper 函数的 override 语义, 但模式已经被 F4/F6 验证.',
    recommendation:
      'K22-F8 实施时直接复用 K22-F4/F6 buildTeacherDailyCounts / buildClassDayPeriods 的 exclude-and-override 模式, ' +
      '只需把 aggregation key 改为 (teachingTaskId) 而非 (teacherId, day) 或 (classGroupId, day).',
    suggestedNextStage: 'K22-F8-CLASSROOM-STABILITY-IMPL',
  })

  findings.push({
    id: 'K22-F7-G-1',
    severity: 'INFO',
    category: 'G. Schema extension concern',
    title: 'Specialty classroom (K22-G) 和 preferred room (Candidate D) 不在 F7 范围',
    currentStatus:
      'Room.type 字段存在 schema 但所有 53 个 room 都是 NORMAL. ' +
      'Course.type / ClassGroup.homeRoomId 不存在 schema. ' +
      'Candidate D (preferred room schema) 需要 migration + admin UI + seed + importer 改造, ' +
      '超出 K22-F 范围. ' +
      'K22-F7 (audit) + K22-F8 (impl TeachingTask-level) 不需要这些 schema 改造.',
    evidence: [
      'K22-E audit: 53 rooms, all NORMAL (no specialty classification)',
      'K22-E audit: Course has no type field; Room.type defaults to NORMAL',
      'prisma/schema.prisma: ClassGroup has no homeRoomId; TeachingTask has no preferredRoomId',
    ],
    risk: 'INFO: schema 扩展是 K22-H/K23 roadmap 范围, 不阻塞 F7/F8. ' +
          '短期用 TeachingTask-level stability 即可, K22-G/K22-H/K23 阶段可基于 F8 经验设计 preferred room schema.',
    recommendation:
      'K22-F8 仅实施 Candidate A (TeachingTask-level). ' +
      'Specialty classroom 匹配 (K22-G) 和 preferred room schema (Candidate D) 是后续阶段.',
    suggestedNextStage: 'K22-F8-CLASSROOM-STABILITY-IMPL',
  })

  findings.push({
    id: 'K22-F7-H-1',
    severity: 'NONE',
    category: 'H. K22-F scope',
    title: 'K22-F7 audit 满足 spec 范围, 不修改 score.ts / schema / DB',
    currentStatus:
      '本阶段只读审计, 不实施 SC9. ' +
      '所有修改限制在 audit 脚本 + audit 文档 + audit JSON. ' +
      'score.ts / solver / schema / DB / API / frontend / importer / parser / RBAC / seed / 业务数据 全部不动.',
    evidence: [
      'scripts/audit-classroom-stability-constraint-k22-f7.ts (新增, 只读)',
      'docs/k22-classroom-stability-constraint-audit.md (新增, 文档)',
      'docs/k22-classroom-stability-constraint-audit.json (新增, 报告)',
      '无 prisma write / no score.ts edit / no schema change',
    ],
    risk: 'NONE: 严格遵守 K22-F7 spec 限制.',
    recommendation: 'K22-F7 可关闭。推荐进入 K22-F8 实施阶段。',
    suggestedNextStage: 'K22-F8-CLASSROOM-STABILITY-IMPL',
  })

  return findings
}

// ── 10. Data availability DB read-only summary ──────────────────────

async function readOnlyDbSummary(): Promise<{
  tasks: number
  tasksWithMultipleSlots: number
  courses: number
  classGroups: number
  rooms: number
  roomTypeDistribution: Record<string, number>
  buildingDistribution: Record<string, number>
}> {
  const [tasks, courses, classGroups, rooms, slots] = await Promise.all([
    prisma.teachingTask.count(),
    prisma.course.count(),
    prisma.classGroup.count(),
    prisma.room.count(),
    prisma.scheduleSlot.count(),
  ])
  void slots // referenced for DB summary completeness

  // Tasks with multiple slots
  const allTasks = await prisma.teachingTask.findMany({ select: { id: true, _count: { select: { scheduleSlots: true } } } })
  const tasksWithMultipleSlots = allTasks.filter(t => t._count.scheduleSlots > 1).length

  // Room type distribution
  const roomRecords = await prisma.room.findMany({ select: { type: true, building: true } })
  const roomTypeDistribution: Record<string, number> = {}
  const buildingDistribution: Record<string, number> = {}
  for (const r of roomRecords) {
    roomTypeDistribution[r.type] = (roomTypeDistribution[r.type] ?? 0) + 1
    if (r.building) buildingDistribution[r.building] = (buildingDistribution[r.building] ?? 0) + 1
    else buildingDistribution['(null)'] = (buildingDistribution['(null)'] ?? 0) + 1
  }

  return {
    tasks,
    tasksWithMultipleSlots,
    courses,
    classGroups,
    rooms,
    roomTypeDistribution,
    buildingDistribution,
  }
}

// ── Main ────────────────────────────────────────────────────────────

async function main() {
  console.log('K22-F7 Classroom Stability Constraint Audit')
  console.log('============================================\n')

  // Read-only DB summary
  console.log('DB summary (read-only):')
  let dbSummary: Awaited<ReturnType<typeof readOnlyDbSummary>> | null = null
  try {
    dbSummary = await readOnlyDbSummary()
    console.log(`  TeachingTask:    ${dbSummary.tasks}`)
    console.log(`  Tasks with >1 ScheduleSlot: ${dbSummary.tasksWithMultipleSlots} (${(100 * dbSummary.tasksWithMultipleSlots / dbSummary.tasks).toFixed(1)}%)`)
    console.log(`  Course:          ${dbSummary.courses}`)
    console.log(`  ClassGroup:      ${dbSummary.classGroups}`)
    console.log(`  Room:            ${dbSummary.rooms}`)
    console.log(`  Room.type distribution: ${JSON.stringify(dbSummary.roomTypeDistribution)}`)
    console.log(`  Room.building distribution: ${JSON.stringify(dbSummary.buildingDistribution)}`)
    console.log('')
  } catch (e) {
    console.log(`  (DB query failed: ${(e as Error).message})`)
    console.log('')
  }

  const audit = buildDataStructureAudit()
  const candidates = buildDefinitionCandidates()
  const penalty = buildPenaltyDesign()
  const aggregation = buildAggregationStrategy()
  const fullScore = buildFullScoreDesign()
  const deltaScore = buildDeltaScoreDesign()
  const interactions = buildInteractionAnalysis()
  const harness = buildHarnessPlan()
  const findings = buildFindings()

  // Summary
  const summary: Record<Severity, number> = { HIGH: 0, MEDIUM: 0, LOW: 0, INFO: 0, NONE: 0 }
  for (const f of findings) summary[f.severity]++
  const blocking = summary.HIGH > 0

  // Terminal output
  console.log('Summary:')
  console.log(`HIGH:      ${summary.HIGH}`)
  console.log(`MEDIUM:    ${summary.MEDIUM}`)
  console.log(`LOW:       ${summary.LOW}`)
  console.log(`INFO:      ${summary.INFO}`)
  console.log(`NONE:      ${summary.NONE}`)
  console.log(`BLOCKING:  ${blocking ? 'YES' : 'NO'}`)
  console.log('')

  console.log('Data structure audit:')
  console.log(`  Room:        reliable=${audit.roomIdentification.reliable}`)
  console.log(`  TeachingTask: reliable=${audit.teachingTaskIdentification.reliable}`)
  console.log(`  Course:       reliable=${audit.courseIdentification.reliable}`)
  console.log(`  ClassGroup:   reliable=${audit.classGroupIdentification.reliable}`)
  console.log(`  room=0:       handled (skip)`)
  console.log(`  weekend:      handled (skip, SC7 owns)`)
  console.log(`  merged-class: handled (no expansion at task level)`)
  console.log(`  specialty:    not modeled (K22-G concern)`)
  console.log(`  score context sufficient: ${audit.scoreContextSufficient.reliable}`)
  console.log('')

  console.log('Definition candidates:')
  for (const c of candidates) {
    const tag = c.recommended ? '★ RECOMMENDED' : c.rejectionReason ? '✗ REJECTED' : '○ OK'
    console.log(`  [${c.id}] ${c.name} (${tag})`)
    if (c.rejectionReason) console.log(`      reason: ${c.rejectionReason}`)
    console.log(`      dataFeasible: ${c.dataFeasible}, schemaChangeNeeded: ${c.schemaChangeNeeded}`)
  }
  console.log('')

  console.log('Penalty design:')
  console.log(`  defaultPenalty: -${Math.abs(penalty.defaultPenalty)} per extra room`)
  console.log(`  weekend: ${penalty.weekend}`)
  console.log(`  skip rules: ${penalty.skipRules.length} rules`)
  console.log('')

  console.log('classGroup aggregation strategy:')
  console.log(`  recommended: ${aggregation.recommended}`)
  for (const s of aggregation.strategy) {
    console.log(`  [${s.id}] ${s.description}`)
  }
  console.log('')

  console.log('Full score design:')
  for (const s of fullScore.steps) {
    console.log(`  step ${s.step}: ${s.description}`)
  }
  console.log('')

  console.log('Delta score design:')
  console.log(`  affected keys: ${JSON.stringify(deltaScore.affectedKeys)}`)
  for (const s of deltaScore.steps) {
    console.log(`  step ${s.step}: ${s.description}`)
  }
  console.log('')

  console.log('Constraint interactions:')
  console.log(`  HC1:  ${interactions.hcRoomConflict.direction}`)
  console.log(`  HC4:  ${interactions.hc4Capacity.direction}`)
  console.log(`  HC6:  ${interactions.hc6Sc6.direction}`)
  console.log(`  SC8:  ${interactions.sc8.direction}`)
  console.log(`  SC1/SC4: ${interactions.sc1Sc4.direction}`)
  console.log(`  MIN_PERT: ${interactions.minPert.direction}`)
  console.log('')

  console.log('Harness plan (11 cases):')
  for (const c of harness) {
    console.log(`  [${c.id}] ${c.category}: ${c.title}`)
  }
  console.log('')

  console.log('Findings:')
  for (const f of findings) {
    console.log(`  [${f.severity}] ${f.id} ${f.title}`)
  }
  console.log('')

  console.log(`Recommended next stage: K22-F8-CLASSROOM-STABILITY-IMPL`)
  console.log('  (implement SC9_TEACHING_TASK_ROOM_STABILITY full + delta in score.ts,')
  console.log('   extend K22-C regression harness with 11 SC9 cases,')
  console.log('   reuse K22-F4/F6 fixture builder pattern)')
  console.log('')

  // Write JSON
  const outDir = path.join(projectRoot, 'docs')
  if (!fs.existsSync(outDir)) fs.mkdirSync(outDir, { recursive: true })
  const outPath = path.join(outDir, 'k22-classroom-stability-constraint-audit.json')

  const report = {
    generatedAt: new Date().toISOString(),
    phase: 'K22-F7-CLASSROOM-STABILITY-AUDIT',
    mode: 'read-only design audit',
    summary: {
      totalFindings: findings.length,
      severity: summary,
      blocking,
      recommendedConstraintId: 'SC9_TEACHING_TASK_ROOM_STABILITY',
      recommendedPrimaryKey: 'TeachingTask.id',
      recommendedPenalty: -2,
      recommendedStage: 'K22-F8-CLASSROOM-STABILITY-IMPL',
    },
    dbSummary,
    dataStructureAudit: audit,
    definitionCandidates: candidates,
    penaltyDesign: penalty,
    aggregationStrategy: aggregation,
    fullScoreDesign: fullScore,
    deltaScoreDesign: deltaScore,
    interactionAnalysis: interactions,
    harnessPlan: harness,
    findings,
    recommendedNextStage: 'K22-F8-CLASSROOM-STABILITY-IMPL',
    reasonsForRecommendation: [
      'TeachingTask is a natural, stable primary key (1 task = 1 course/teacher/combination over weekly slots)',
      'ctx.slotsByTask already populated; no new index needed',
      'No schema change required (Candidate A)',
      'Skip rules align with existing constraints (room=0, weekend, size<2)',
      'Delta is local: 1 key (teachingTaskId) — much smaller than SC8 (up to 2 * classGroups.length keys)',
      'Independent of SC1/SC2/SC3/SC4/SC5/SC6/SC7/SC8/MIN_PERT keys — 0 conflict',
      'Penalty -2 per extra room aligns with SC8 scale; not strong enough to override hard constraints',
      'Classroom-level (B) and course-level (C) variants have weak signal and may over-penalize legitimate room diversity',
      'Schema-based preferred room (D) is out of scope; better fit for K22-H/K23 roadmap',
    ],
    notes: [
      'K22-F7 is a read-only design audit. No Prisma writes, no score.ts changes, no schema changes.',
      'Recommended: keep SC9 at TeachingTask-level, weekday-only, with skip rules. Defer schema-based preferred room to K22-H/K23.',
      'A teaching task with multiple slots across multiple weeks but the same room is the most common case; SC9 fires 0 for that.',
      'Cross-task room diversity (e.g. theory + practice of same course) is NOT penalized by SC9; this is intentional and aligned with legitimate room diversity.',
    ],
  }
  fs.writeFileSync(outPath, JSON.stringify(report, null, 2), 'utf-8')
  console.log(`Report written: ${outPath}`)

  await prisma.$disconnect()
}

main().catch(async (e) => {
  console.error(e)
  await prisma.$disconnect()
  process.exit(1)
})
