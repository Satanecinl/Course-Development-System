/**
 * K22-F5 Class Gap Reduction Constraint Audit
 *
 * Read-only audit. Evaluates whether the "class gap reduction" soft constraint
 * (NEW-SC-02 from K22-E roadmap) can be cleanly modeled on top of the current
 * data structures (ScheduleSlot / TeachingTask / TeachingTaskClass / ClassGroup),
 * compares 3 candidate definitions, and produces a recommended full + delta
 * scoring design for downstream implementation in K22-F6.
 *
 * Strong constraints:
 *   - NO Prisma writes.
 *   - NO score.ts modifications.
 *   - NO solver modifications.
 *   - NO schema / migration / API / frontend / importer / parser / RBAC changes.
 *
 * Output:
 *   - Terminal summary
 *   - docs/k22-class-gap-reduction-constraint-audit.json
 */

import * as fs from 'node:fs'
import * as path from 'node:path'

const projectRoot = path.resolve(__dirname, '..')

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
  classGroupIdentification: DataFieldAudit
  dayIdentification: DataFieldAudit
  periodSlotOrder: DataFieldAudit
  roomZeroHandling: DataFieldAudit
  weekendHandling: DataFieldAudit
  mergedClassHandling: DataFieldAudit
  scoreContextSufficient: DataFieldAudit
}

interface DefinitionCandidate {
  id: 'CANDIDATE_A' | 'CANDIDATE_B' | 'CANDIDATE_C'
  name: string
  description: string
  formula: string
  pros: string[]
  cons: string[]
  dataFeasible: boolean
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
    classGroupIdentification: {
      field: 'TeachingTaskClass.classGroupId (→ ClassGroup.id)',
      type: 'Int',
      nullable: false,
      purpose: 'Identify which classGroup(s) a TeachingTask is assigned to. Required for SC8 keying (classGroupId, day).',
      reliable: true,
      evidence: [
        'prisma/schema.prisma: model TeachingTaskClass { teachingTaskId Int; classGroupId Int; ... } (composite unique)',
        'src/lib/scheduler/types.ts: TaskWithRelations.taskClasses includes { classGroup: true }',
        'data-loader.ts:99-104 expands slotsByClass with classKey(classGroupId, dayOfWeek, slotIndex) — already populated',
        'Prisma relation: TeachingTaskClass.classGroupId FK to ClassGroup.id (not nullable in model)',
        'Many-to-many: a single TeachingTask can have N taskClasses; one classGroup can be in M tasks',
      ],
    },
    dayIdentification: {
      field: 'ScheduleSlot.dayOfWeek',
      type: 'Int',
      nullable: false,
      purpose: 'Identify which day of the week a slot is scheduled for. Domain is [1, 7] (Mon-Sun) per CLAUDE.md.',
      reliable: true,
      evidence: [
        'prisma/schema.prisma: ScheduleSlot.dayOfWeek Int (1=Mon ... 7=Sun per project convention)',
        'score.ts:444 SC7 treats day >= 6 as weekend',
        'score.ts:156 TEACHING_DAYS = [1, 2, 3, 4, 5] — same convention as existing constraints',
        'State assignment also stores dayOfWeek, so day identification works for both DB state and solver state',
      ],
    },
    periodSlotOrder: {
      field: 'ScheduleSlot.slotIndex (1..6)',
      type: 'Int',
      nullable: false,
      purpose: 'Identify which period within a day a slot is scheduled for. 1=1-2节, 2=3-4节, 3=5-6节, 4=7-8节, 5=9-10节, 6=11-12节 per CLAUDE.md mapping.',
      reliable: true,
      evidence: [
        'prisma/schema.prisma: ScheduleSlot.slotIndex Int (range 1..6 per project convention)',
        'CLAUDE.md "TimeSlot mapping": "1,2"→1, "3,4"→2, "5,6"→3, "7,8"→4, "9,10"→5, "11,12"→6',
        'score.ts:366 SC3 uses p.idx >= 5 (period 5-6) as extreme time indicator — same semantics',
        'State assignment also stores slotIndex, so period identification works for both DB state and solver state',
        'slotIndex is 1-based contiguous 1..6 — no gaps, no 0-value noise. Suitable for "gap = nextIdx - prevIdx - 1" arithmetic.',
      ],
    },
    roomZeroHandling: {
      field: 'ScheduleSlot.roomId (0 = unscheduled)',
      type: 'Int?',
      nullable: true,
      purpose: 'Identify whether a slot is actually placed in a room. roomId == 0 or null = unscheduled/placeholder.',
      reliable: true,
      evidence: [
        'prisma/schema.prisma: ScheduleSlot.roomId Int? (nullable)',
        'score.ts: getPos() returns room: slot.roomId ?? 0 — null normalized to 0',
        'score.ts: all constraints treat room === 0 as "not scheduled" and skip',
        'SC5 (K22-F4) explicitly skips pos.room === 0 in buildTeacherDailyCounts — same convention should apply to SC8',
        'For SC8: an unscheduled slot has no day contribution; if we naively counted it, we would inflate the classGroup day plan. Skip is mandatory.',
      ],
    },
    weekendHandling: {
      field: 'ScheduleSlot.dayOfWeek (6=Sat, 7=Sun)',
      type: 'Int',
      nullable: false,
      purpose: 'Decide whether weekend slots participate in SC8 scoring.',
      reliable: true,
      evidence: [
        'SC7 (K22-F3) treats day >= 6 as weekend and penalizes -15 per slot',
        'TEACHING_DAYS = [1, 2, 3, 4, 5] convention is used by SC5 and should be reused by SC8',
        'K22-E NEW-SC-02 did not specify weekend treatment — recommend excluding weekends to avoid double-counting with SC7',
        'If a classGroup has a weekend slot (rare), SC7 will penalize it; SC8 should not also penalize the "day distribution" of that weekend day',
      ],
    },
    mergedClassHandling: {
      field: 'TeachingTask.taskClasses[] (1-to-many)',
      type: 'TeachingTaskClass[]',
      nullable: false,
      purpose: 'Identify all classGroups that participate in a merged-class (合班) teaching task.',
      reliable: true,
      evidence: [
        'prisma/schema.prisma: model TeachingTaskClass — explicit many-to-many table between TeachingTask and ClassGroup',
        'A single TeachingTask can have N taskClasses (1 row per classGroup). E.g. task with remark "与森防合班" creates 2 rows.',
        'data-loader.ts:99-104 already iterates taskClasses and adds the slot to slotsByClass for EACH classGroupId',
        'For SC8: a merged-class slot must be counted ONCE per participating classGroup (i.e. each classGroup gets a "this day has class" entry from this slot)',
        'If we naively count the slot once globally, we would miss the per-classGroup effect',
        'Implementation must iterate slot.teachingTask.taskClasses when computing (classGroupId, day, slotIndex) triplets',
      ],
    },
    scoreContextSufficient: {
      field: 'SchedulingContext (read-only data in memory)',
      type: 'TS interface',
      nullable: false,
      purpose: 'Verify all data needed by SC8 is available in SchedulingContext (no Prisma calls during scoring).',
      reliable: true,
      evidence: [
        'src/lib/scheduler/types.ts: SchedulingContext includes tasks, rooms, slots, taskById, roomById, slotsByTask, slotsByRoom, slotsByTeacher, slotsByClass',
        'For SC8 we need: slots (for day + slotIndex + roomId + classGroup list) — all already loaded',
        'slotsByClass is already populated by data-loader.ts and provides O(1) lookup of slots for a given (classGroupId, day, slotIndex)',
        'No additional data loading is required — SC8 can be computed purely from ctx.slots + state.assignments',
        'SC8 will not require any new index in SchedulingContext (no need to add slotsByClassDay)',
      ],
    },
  }
}

// ── 2. Definition candidates ─────────────────────────────────────────

function buildDefinitionCandidates(): DefinitionCandidate[] {
  return [
    {
      id: 'CANDIDATE_A',
      name: '简单 period gap (simple period gap)',
      description:
        'For each (classGroup, day) pair, sort the occupied period list. For each adjacent pair, compute ' +
        'gap = nextPeriod - prevPeriod - 1. If gap > 0, penalty = -X * gap. Sum over all classGroup-day pairs.',
      formula:
        'for (cg, day):\n' +
        '  periods = sorted unique slotIndex where slot.room != 0 and slot.task.taskClasses includes cg and slot.day = day\n' +
        '  for i in 1..periods.length-1:\n' +
        '    gap = periods[i] - periods[i-1] - 1\n' +
        '    if gap > 0: penalty += -X * gap',
      pros: [
        'Simple, easy to reason about',
        'Pure integer arithmetic on slotIndex (1..6 contiguous)',
        'No need to model morning/afternoon boundaries explicitly',
        'Maps cleanly to delta: change in (cg, day) period set is local',
        'Same shape as SC5 (per-entity-per-day aggregation)',
      ],
      cons: [
        'Treats the lunch break (period 3 → period 4) the same as a long free period (period 1 → period 6)',
        'No semantic distinction between "lunch break" and "morning-then-evening"',
        'Tunable: if X is too aggressive, may push solver into lunch-period double-ups',
      ],
      dataFeasible: true,
      recommended: true,
    },
    {
      id: 'CANDIDATE_B',
      name: '跳过半天边界 (skip half-day boundary)',
      description:
        'Same as Candidate A, but exclude gaps that span the lunch break (e.g. period 3 → period 4 is allowed; ' +
        'period 3 → period 5 is the same as period 3 → period 4 + 0 penalty for the afternoon break).',
      formula:
        'for (cg, day):\n' +
        '  periods = sorted unique slotIndex ...\n' +
        '  for i in 1..periods.length-1:\n' +
        '    if periods[i-1] == 3 and periods[i] == 4: continue  # lunch break OK\n' +
        '    gap = periods[i] - periods[i-1] - 1\n' +
        '    if gap > 0: penalty += -X * gap',
      pros: [
        'Reflects real student experience: lunch break is expected',
        'Lower risk of over-pushing solver into back-to-back periods',
      ],
      cons: [
        'Adds a magic rule (lunch = period 3 → period 4). Project does not model actual times, only periods.',
        'Hard-coded half-day boundary. If the project later changes the period mapping, this needs to be revisited.',
        'Does not penalize e.g. "class in period 1 and period 5" which is a 2-period gap across morning + lunch + afternoon — this is arguably bad',
        'More complex than Candidate A but only marginally more correct',
      ],
      dataFeasible: true,
      recommended: false,
      rejectionReason:
        'Adds complexity (lunch exception) for marginal benefit. Project does not model actual times, so the ' +
        '"lunch" concept is fragile. Candidate A is simpler and the regression harness can use conservative weights.',
    },
    {
      id: 'CANDIDATE_C',
      name: '基于 start/end time (start/end time based)',
      description:
        'Compute penalty based on actual start_time / end_time of each period and the real duration of the gap. ' +
        'For example, gap of 30 minutes = no penalty; gap of 90 minutes = small penalty; gap of 4 hours = large penalty.',
      formula:
        'for (cg, day):\n' +
        '  for each adjacent pair:\n' +
        '    actualGapMinutes = (start[next] - end[prev]) / 60000\n' +
        '    if actualGapMinutes > 30:\n' +
        '      penalty += -Y * floor(actualGapMinutes / 60)',
      pros: [
        'Most semantically accurate (uses real time)',
        'Can distinguish "10 minute break" from "4 hour gap"',
      ],
      cons: [
        'CRITICAL: project does not store start_time / end_time on ScheduleSlot',
        'Period 1 = "1,2"节, period 6 = "11,12"节. There is no separate time field.',
        'Cannot infer exact minute durations without the period → time mapping table (out of score.ts scope)',
        'Would require either schema change (start/end time) OR a hardcoded period-to-time map in score.ts',
        'Schema change is OUT OF SCOPE for K22-F (no schema change allowed)',
        'Hardcoded map in score.ts is fragile and not project policy',
      ],
      dataFeasible: false,
      recommended: false,
      rejectionReason:
        'Project does not model start/end time on ScheduleSlot. Schema change is out of scope. Candidate A achieves ' +
        '80% of the value (penalize large gaps) at 0% of the implementation cost.',
    },
  ]
}

// ── 3. classGroup aggregation strategy ──────────────────────────────

function buildClassGroupAggregationStrategy(): {
  recommended: string
  strategy: { id: string; description: string; reason: string }[]
} {
  return {
    recommended: 'Per-classGroup aggregation, expanded for merged classes',
    strategy: [
      {
        id: 'STRATEGY-1',
        description:
          'For each slot, iterate slot.teachingTask.taskClasses and add (classGroupId, day, slotIndex) to the per-classGroup day plan.',
        reason:
          'Merged-class task (合班) should affect every participating classGroup independently. ' +
          'A 森防合班 task with 2 classes should add a period to both 森林草原防火技术1班 and the other class.',
      },
      {
        id: 'STRATEGY-2',
        description: 'Skip slots with no taskClasses (TeachingTask with empty taskClasses).',
        reason:
          'Such tasks are orphan (not assigned to any class). Counting them has no business meaning. ' +
          'Defensive: matches SC2/HC3 behavior which also iterates taskClasses.',
      },
      {
        id: 'STRATEGY-3',
        description: 'For each classGroup, build a Set<slotIndex> per day, then sort and compute gaps.',
        reason:
          'Set deduplicates any potential duplicate period counts (defensive). ' +
          'Sorted array is the simplest basis for adjacent gap calculation.',
      },
      {
        id: 'STRATEGY-4',
        description: 'Skip classGroup-day pairs with fewer than 2 occupied periods (no gap possible).',
        reason:
          'If a classGroup has 0 or 1 periods on a day, gap = 0 by definition. Skip early to save work.',
      },
      {
        id: 'STRATEGY-5',
        description: 'Sum the period-gap penalty across all (classGroup, day) pairs.',
        reason: 'Total SC8 penalty is the sum of per-pair gaps. Same shape as SC5 (sum per teacher-day).',
      },
    ],
  }
}

// ── 4. Full score design ─────────────────────────────────────────────

function buildFullScoreDesign(): { algorithm: string; steps: FullScoreStep[] } {
  return {
    algorithm:
      'Aggregate per (classGroupId, day) the set of slotIndex from slots where room != 0 and day in [1..5]. ' +
      'For each (cg, day) with at least 2 periods, compute gap = next - prev - 1 for each adjacent pair. ' +
      'Sum -X * gap across all pairs and all (cg, day) keys.',
    steps: [
      {
        step: 1,
        description: 'Skip non-teaching-day slots and unscheduled slots',
        pseudocode: 'for p in positions: if p.day < 1 || p.day > 5: continue; if p.room === 0: continue;',
        notes: 'Same skip rules as SC5 (K22-F4). No double-count with SC7 because SC8 skips day >= 6.',
      },
      {
        step: 2,
        description: 'Build per-(classGroupId, day) period set',
        pseudocode:
          'const classDayPeriods = new Map<string, Set<number>>()\n' +
          'for p in positions:\n' +
          '  if p.room === 0 || p.day < 1 || p.day > 5: continue\n' +
          '  for tc in p.slot.teachingTask.taskClasses:\n' +
          '    const key = `${tc.classGroupId}-${p.day}`\n' +
          '    let set = classDayPeriods.get(key)\n' +
          '    if (!set) { set = new Set(); classDayPeriods.set(key, set) }\n' +
          '    set.add(p.idx)',
        notes:
          'Keying by (classGroupId, day) is the SC8 equivalent of SC5\'s (teacherId, day). ' +
          'Iterating taskClasses inside the loop correctly handles merged-class tasks (each classGroup gets the period).',
      },
      {
        step: 3,
        description: 'For each (classGroupId, day) with >= 2 periods, compute gaps',
        pseudocode:
          'for [key, periodSet] of classDayPeriods:\n' +
          '  if periodSet.size < 2: continue\n' +
          '  const periods = [...periodSet].sort((a, b) => a - b)\n' +
          '  for i in 1..periods.length-1:\n' +
          '    const gap = periods[i] - periods[i-1] - 1\n' +
          '    if gap > 0: penalty += SOFT_SC8_PER_EMPTY_PERIOD * gap',
        notes:
          'Sorted iteration is deterministic. gap can be at most 4 (e.g. period 1 → period 6, gap=4). ' +
          'No double-count because Set deduplicates same-period slots from the same classGroup (defensive).',
      },
      {
        step: 4,
        description: 'Emit SC8 detail entries (one per classGroup-day pair that has gaps)',
        pseudocode:
          'details.push({ type: "SC8_CLASS_GAP", level: "SOFT", penalty, message: `classGroup ${cg} day ${day}: ${gapCount} empty periods` })',
        notes:
          'Detail format mirrors SC5/SC7. Use type "SC8_CLASS_GAP" (string code in details[i].type). ' +
          'Harness will check details.some(d => d.type === "SC8_CLASS_GAP") for full-score cases.',
      },
    ],
  }
}

// ── 5. Delta score design ────────────────────────────────────────────

function buildDeltaScoreDesign(): {
  algorithm: string
  affectedKeys: string[]
  steps: DeltaScoreStep[]
  minPertIsolation: string
} {
  return {
    algorithm:
      'Find moved slot\'s classGroups. For each affected (classGroupId, day), compute before/after gap penalty by ' +
      'temporarily inserting the moved slot at old or new position. deltaSoft = sum(after - before) across affected keys.',
    affectedKeys: [
      'For each classGroupId in slot.teachingTask.taskClasses:',
      '  - (classGroupId, oldDay)',
      '  - (classGroupId, newDay) — only if newDay in [1..5]',
    ],
    steps: [
      {
        step: 1,
        description: 'Identify the moved slot and its classGroups',
        pseudocode:
          'const task = slot.teachingTask\n' +
          'const classGroupIds = task.taskClasses.map(tc => tc.classGroupId)  // may be empty',
        notes:
          'If task has no classGroups, SC8 does not fire. deltaSoft += 0. ' +
          'This matches the full-score skip rule (Step 2 of full score).',
      },
      {
        step: 2,
        description: 'Determine affected (classGroupId, day) keys',
        affectedKeys: ['(cgId, oldDay)', '(cgId, newDay) — only if newDay in [1..5]'],
        pseudocode:
          'const affectedKeys = new Set<string>()\n' +
          'for cgId of classGroupIds:\n' +
          '  affectedKeys.add(`${cgId}-${old.dayOfWeek}`)\n' +
          '  if (move.newDay >= 1 && move.newDay <= 5): affectedKeys.add(`${cgId}-${move.newDay}`)',
        notes:
          'Skip newDay < 1 or > 5 (weekend → SC7 handles, not SC8). ' +
          'Each classGroup contributes 2 keys max (old day + new day).',
      },
      {
        step: 3,
        description:
          'For each affected (cgId, day) key, compute the gap penalty BEFORE the move (slot at old) and AFTER the move (slot at new). ' +
          'Use a helper buildClassGroupDayPeriods(cgId, day, ctx, state, slotExcluded, overrideDay, overrideIdx) that: ' +
          '  1. starts from ctx.slots where room != 0 and day == day and slot.id != slotExcluded, ' +
          '  2. for each such slot, iterate taskClasses and add (overrideIdx if task includes cgId and slot.id === movedSlotId, else p.idx) to the set.',
        affectedKeys: ['(cgId, day) — both old-day and new-day for each cgId'],
        pseudocode:
          'function gapPenaltyForKey(cgId, day, excludeSlotId, overrideDay, overrideIdx):\n' +
          '  if (overrideDay < 1 || overrideDay > 5): return 0\n' +
          '  const periods = new Set<number>()\n' +
          '  for slot in ctx.slots:\n' +
          '    if slot.id === excludeSlotId: continue\n' +
          '    const pos = getPos(slot, state)\n' +
          '    if pos.day !== day || pos.room === 0: continue\n' +
          '    const includesCg = slot.teachingTask.taskClasses.some(tc => tc.classGroupId === cgId)\n' +
          '    if (!includesCg): continue\n' +
          '    periods.add(pos.idx)\n' +
          '  if (overrideDay === day): periods.add(overrideIdx)  // add the moved slot at the override position\n' +
          '  // now sort and compute gaps\n' +
          '  const sorted = [...periods].sort((a,b) => a-b)\n' +
          '  let p = 0\n' +
          '  for i in 1..sorted.length-1:\n' +
          '    p += SOFT_SC8_PER_EMPTY_PERIOD * (sorted[i] - sorted[i-1] - 1)\n' +
          '  return p',
        notes:
          'Helper takes an override (day, idx) and only adds the override if day matches. This is the "what if the moved slot were at X" test. ' +
          'Used to compute beforePenalty (override = old position) and afterPenalty (override = new position).',
      },
      {
        step: 4,
        description: 'Sum deltaSoft across all affected keys',
        pseudocode:
          'for cgId of classGroupIds:\n' +
          '  const beforePenalty = gapPenaltyForKey(cgId, old.dayOfWeek, slot.id, old.dayOfWeek, old.slotIndex)\n' +
          '                      + (move.newDay === old.dayOfWeek ? 0 : gapPenaltyForKey(cgId, move.newDay, slot.id, move.newDay, move.newSlotIndex))\n' +
          '  // wait — re-derive. Cleaner: just call the helper for each (cg, day) with the override',
        affectedKeys: ['(cg, oldDay)', '(cg, newDay)'],
        notes:
          'Simplification: compute full before (moved slot at old) and full after (moved slot at new) and subtract. ' +
          'deltaSoft = after - before. ' +
          'Because other classGroup-days are unchanged, the difference is local to the affected keys.',
      },
      {
        step: 5,
        description: 'Handle weekend safely',
        pseudocode:
          'if (oldDay < 1 || oldDay > 5) { /* old not in SC8 domain — beforePenalty for this day = 0 */ }\n' +
          'if (newDay < 1 || newDay > 5) { /* new not in SC8 domain — afterPenalty for this day = 0 */ }',
        notes:
          'If old is a weekend, SC8 ignores the old day. SC7 may still fire on weekend days. ' +
          'Same for new.',
      },
    ],
    minPertIsolation:
      'F3 / F4 / F5 pattern: set originalAssignments of the moved slot to a 3rd position (day=9, slotIndex=1, roomId=999) ' +
      'so MIN_PERT fires at both old and new positions, netting zero. The harness then isolates SC8 delta from MIN_PERT ' +
      'by comparing deltaSoft to the expected SC8 contribution only. This is the same isolation pattern used in ' +
      'verify-specialty-campus-weekend-constraints-k22-f3.ts and verify-teacher-day-balance-constraint-k22-f4.ts.',
  }
}

// ── 6. Constraint interaction analysis ──────────────────────────────

function buildInteractionAnalysis(): {
  sc2: { overlap: string; direction: string; recommendation: string }
  sc3: { overlap: string; direction: string; recommendation: string }
  sc7: { overlap: string; direction: string; recommendation: string }
  minPert: { overlap: string; direction: string; recommendation: string }
  sc1: { overlap: string; direction: string; recommendation: string }
} {
  return {
    sc2: {
      overlap:
        'Both SC2 and SC8 look at the same classGroup\'s day plan. SC2 fires on "same task, >1 slot on same day" ' +
        '(-10 per extra slot). SC8 fires on "two occupied periods on same day with a gap in between".',
      direction:
        'SC2 discourages any task having >1 slot on the same day, regardless of whether they are back-to-back. ' +
        'SC8 discourages a classGroup having periods on the same day with empty periods between. ' +
        'If a classGroup has periods 1 and 3 on a day (gap=1), SC8 fires (-X). If those two periods are from the same task, ' +
        'SC2 also fires (-10).',
      recommendation:
        'No code change to SC2 in K22-F6. SC2 and SC8 are independent keys (per task-day vs per classGroup-day). ' +
        'Sum of penalties reflects the total badness. If solver over-prioritizes SC8 in later tuning, ' +
        'consider lowering SC8 weight in K22-weights-roadmap (out of scope for K22-F6).',
    },
    sc3: {
      overlap:
        'SC3 penalizes "extreme time" (slotIndex >= 5). SC8 does not look at the slotIndex value directly, ' +
        'only the gap between consecutive periods.',
      direction:
        'SC8 could theoretically push solver to put both periods at high indices (5 and 6) to avoid the gap, ' +
        'which would actually increase SC3 penalty. This is acceptable — SC3 still acts as a counterweight.',
      recommendation:
        'No code change. SC3 is the natural brake. Monitor in K22-G tuning phase.',
    },
    sc7: {
      overlap:
        'SC7 penalizes weekend slots (-15 per slot). SC8 will not count weekend slots (day >= 6 skip).',
      direction:
        'No overlap in the day domain. SC7 owns weekend penalty; SC8 owns weekday gap penalty.',
      recommendation:
        'Keep the day >= 6 skip rule. Document in SC8 design that weekend handling is SC7\'s responsibility.',
    },
    minPert: {
      overlap:
        'MIN_PERT penalizes any moved slot (-2). SC8 delta only looks at the moved slot\'s classGroup + day plan.',
      direction:
        'Both can fire on the same move. They are independent. MIN_PERT handles "did the slot move"; SC8 handles "does the new classGroup-day plan have gaps".',
      recommendation:
        'Use the 3rd-position originalAssignments trick in delta harness cases to isolate SC8. This is the F3 / F4 pattern. ' +
        'K22-F6 implementation must mirror this isolation in its verify wrapper.',
    },
    sc1: {
      overlap:
        'SC1 fires on "cross-building back-to-back pair" (-5). SC8 looks at gaps, not adjacency. They are ' +
        'almost orthogonal, but a move that creates a back-to-back pair can also remove a gap.',
      direction:
        'If a move consolidates a classGroup\'s periods from (1, 3) to (1, 2), SC8 improves (gap removed, penalty decreases). ' +
        'If those two slots are in different buildings, SC1 may fire after the move.',
      recommendation:
        'No code change. The two constraints express different goals (gap avoidance vs. building-change avoidance). ' +
        'Solver will balance them via the softScore ranking.',
    },
  }
}

// ── 7. Harness design ────────────────────────────────────────────────

function buildHarnessPlan(): HarnessCase[] {
  return [
    {
      id: 'SC8-FULL-1',
      category: 'full',
      title: 'No gap: periods 1, 2, 3 on a classGroup day',
      fixtureDescription: 'One classGroup, day 1, 3 slots at periods 1, 2, 3 (back-to-back)',
      expectedHard: 0,
      expectedSoft: 0,
      note: 'Set {1,2,3}, no gaps, penalty=0. Verifies baseline (no false positive).',
    },
    {
      id: 'SC8-FULL-2',
      category: 'full',
      title: 'Single gap: periods 1, 3 on a classGroup day',
      fixtureDescription: 'One classGroup, day 1, 2 slots at periods 1, 3 (gap=1, period 2 empty)',
      expectedHard: 0,
      expectedSoft: -2,
      note: 'Set {1,3}, gap=3-1-1=1, penalty=-2*1=-2. Verifies single-gap detection.',
    },
    {
      id: 'SC8-FULL-3',
      category: 'full',
      title: 'Multi gap: periods 1, 4 on a classGroup day',
      fixtureDescription: 'One classGroup, day 1, 2 slots at periods 1, 4 (gap=2, periods 2,3 empty)',
      expectedHard: 0,
      expectedSoft: -4,
      note: 'Set {1,4}, gap=4-1-1=2, penalty=-2*2=-4. Verifies multi-period gap detection.',
    },
    {
      id: 'SC8-FULL-4',
      category: 'full',
      title: 'Multi-segment: periods 1, 3, 5 on a classGroup day',
      fixtureDescription: 'One classGroup, day 1, 3 slots at periods 1, 3, 5 (gaps=1+1=2)',
      expectedHard: 0,
      expectedSoft: -4,
      note: 'Set {1,3,5}, gaps (3-1-1)=1 + (5-3-1)=1 = 2, penalty=-2*2=-4. Verifies multiple segments.',
    },
    {
      id: 'SC8-FULL-5',
      category: 'edge',
      title: 'Single lesson: only 1 period on a classGroup day',
      fixtureDescription: 'One classGroup, day 1, 1 slot at period 1',
      expectedHard: 0,
      expectedSoft: 0,
      note: 'Set {1}, size=1 < 2, skip. Verifies no false positive on single-period days.',
    },
    {
      id: 'SC8-FULL-6',
      category: 'edge',
      title: 'Weekend skip: periods on day 6 (Sat) and day 7 (Sun)',
      fixtureDescription: 'One classGroup, day 6 period 1, day 7 period 1 — both should be skipped',
      expectedHard: 0,
      expectedSoft: 0,
      note: 'SC7 may fire on day >= 6, but SC8 does not. Verifies day filter.',
    },
    {
      id: 'SC8-FULL-7',
      category: 'edge',
      title: 'Room=0 (unscheduled): slot at room 0 should not count',
      fixtureDescription: 'One classGroup, day 1 period 1 (scheduled) + period 3 (unscheduled room=0)',
      expectedHard: 0,
      expectedSoft: 0,
      note: 'Set {1} (room=0 skipped), size<2, penalty=0. Verifies room=0 filter.',
    },
    {
      id: 'SC8-FULL-8',
      category: 'merged-class',
      title: 'Merged-class: 1 task with 2 classGroups, period 1, then second task with 1 classGroup at period 3',
      fixtureDescription:
        'Task A (merged): classGroups {1, 2}, day 1 period 1. Task B: classGroup {1}, day 1 period 3.',
      expectedHard: 0,
      expectedSoft: -4,
      note:
        'For classGroup 1: periods {1, 3}, gap=1, penalty=-2. ' +
        'For classGroup 2: periods {1}, size<2, skip. ' +
        'Total SC8=-2. ' +
        'If we also add a second period for classGroup 2 (e.g. task C: classGroup {2}, day 1 period 5), then classGroup 2 has {1, 5} gap=3, penalty=-6. Total SC8=-2 + -6 = -8.',
    },
    {
      id: 'SC8-DELTA-1',
      category: 'delta',
      title: 'Reduce gap: move from period 3 to period 2 (gap 1→0)',
      fixtureDescription: 'Before: day 1 periods {1, 3}. Move the period-3 slot to period 2. After: day 1 periods {1, 2}.',
      expectedHard: 0,
      expectedSoft: 0,
      expectedDeltaHard: 0,
      expectedDeltaSoft: 2,
      note: 'Before: -2. After: 0. deltaSoft = +2. Isolated via 3rd-position originalAssignments.',
    },
    {
      id: 'SC8-DELTA-2',
      category: 'delta',
      title: 'Introduce gap: move from period 2 to period 3 (gap 0→1)',
      fixtureDescription: 'Before: day 1 periods {1, 2}. Move the period-2 slot to period 3. After: day 1 periods {1, 3}.',
      expectedHard: 0,
      expectedSoft: 0,
      expectedDeltaHard: 0,
      expectedDeltaSoft: -2,
      note: 'Before: 0. After: -2. deltaSoft = -2.',
    },
    {
      id: 'SC8-DELTA-3',
      category: 'delta',
      title: 'Move to weekend: weekday gap improvement should not count',
      fixtureDescription:
        'Before: day 1 periods {1, 3}. Move the period-3 slot to day 6 period 3. ' +
        'After: day 1 has {1}, day 6 has {3} (skipped by SC8).',
      expectedHard: 0,
      expectedSoft: 0,
      expectedDeltaHard: 0,
      expectedDeltaSoft: 2,
      note:
        'Before (cg, day=1): gap=1, penalty=-2. ' +
        'After (cg, day=1): {1}, size<2, penalty=0. delta for (cg, day=1) = +2. ' +
        '(cg, day=6) was not counted in before (SC8 skips weekend) and is not counted in after. ' +
        'deltaSoft = +2. Note: SC7 may fire separately for day 6 — that\'s a different constraint.',
    },
    {
      id: 'SC8-DELTA-4',
      category: 'delta',
      title: 'Merged-class: move affects 2 classGroups',
      fixtureDescription:
        'Task A (merged): classGroups {1, 2}, day 1 period 1. ' +
        'Task B: classGroup {1}, day 1 period 3. ' +
        'Move task A from day 1 period 1 to day 1 period 2.',
      expectedHard: 0,
      expectedSoft: 0,
      expectedDeltaHard: 0,
      expectedDeltaSoft: 2,
      note:
        'Before: classGroup 1 has {1, 3} gap=1 penalty=-2; classGroup 2 has {1} skip. ' +
        'After: classGroup 1 has {2, 3} no gap penalty=0; classGroup 2 has {2} skip. ' +
        'delta for classGroup 1 = +2. delta for classGroup 2 = 0. ' +
        'deltaSoft = +2 (verifies merged-class expansion).',
    },
  ]
}

// ── 8. Findings ──────────────────────────────────────────────────────

function buildFindings(): Finding[] {
  const findings: Finding[] = []

  findings.push({
    id: 'K22-F5-A-1',
    severity: 'INFO',
    category: 'A. Data structure feasibility',
    title: 'classGroup + day + period (slotIndex) 全部在 SchedulingContext 中可用',
    currentStatus:
      'classGroupId 通过 TeachingTask.taskClasses.classGroupId 访问。' +
      'dayOfWeek 和 slotIndex 在 ScheduleSlot 上直接存储。' +
      'slotsByClass 在 data-loader 中已经按 (classGroupId, day, slotIndex) 索引。',
    evidence: [
      'audit.classGroupIdentification.reliable = true',
      'audit.dayIdentification.reliable = true',
      'audit.periodSlotOrder.reliable = true',
      'data-loader.ts:99-104 slotsByClass populated with classKey(classGroupId, day, slot)',
      'SC5 (K22-F4) uses identical ctx.slots + state.assignments pattern, confirming the score context is sufficient',
    ],
    risk: 'INFO: 没有任何数据缺失风险。SC8 可以 100% 基于现有数据实现。',
    recommendation: 'K22-F6 实施阶段直接复用现有 SchedulingContext。',
    suggestedNextStage: 'K22-F6-CLASS-GAP-REDUCTION-IMPL',
  })

  findings.push({
    id: 'K22-F5-B-1',
    severity: 'NONE',
    category: 'B. Definition choice',
    title: 'Candidate A (简单 period gap) 是推荐方案',
    currentStatus:
      '比较 3 种候选定义：' +
      'A: 简单 period gap (推荐) — gap = next - prev - 1, penalty = -X * gap, 无午饭例外; ' +
      'B: 跳过半天边界 — 排除 period 3→4 的午饭间隔; ' +
      'C: 基于 start/end time — 项目没有 start/end time 字段.',
    evidence: [
      'Candidate A: data feasible, recommended=true',
      'Candidate B: data feasible but rejected (adds complexity for marginal gain, lunch boundary is fragile without actual times)',
      'Candidate C: NOT data feasible (ScheduleSlot has no startTime/endTime; schema change is out of scope for K22-F)',
    ],
    risk: 'NONE: Candidate A 在数据可用性、简单性、可调参性上最优。',
    recommendation:
      'K22-F6 实施 Candidate A，初始 penalty = SOFT_SC8_PER_EMPTY_PERIOD = -2。' +
      'X = -2 与 SC5 (per-day imbalance = -3 per unit) 的数量级一致，且 gap 通常是 1-2，penalty 不会压过其他 SC。',
    suggestedNextStage: 'K22-F6-CLASS-GAP-REDUCTION-IMPL',
  })

  findings.push({
    id: 'K22-F5-C-1',
    severity: 'MEDIUM',
    category: 'C. classGroup 聚合',
    title: '合班任务必须展开到每个参与 classGroup',
    currentStatus:
      'TeachingTaskClass 是 explicit many-to-many，data-loader 已经为每个 classGroupId 维护一个 slotsByClass 索引。' +
      'SC8 的 per-classGroup-day 聚合需要遍历 slot.teachingTask.taskClasses (与 HC3 一样)。',
    evidence: [
      'data-loader.ts:99-104 iterates taskClasses to populate slotsByClass',
      'score.ts:244-256 HC3 iterates a/b taskClasses in nested loop — same pattern',
      'verify-teacher-day-balance-constraint-k22-f4.ts uses FixtureTaskInput with classGroupId — same fixture shape supports SC8',
    ],
    risk:
      'MEDIUM: 如果实现错误地将 merged-class slot 只计一次（而不是按 classGroup 展开），SC8 会低估 penalty，' +
      'solver 决策偏 sub-optimal。这是 K22-F6 实施的最高风险点。',
    recommendation:
      'K22-F6 实施时，full score 内层循环必须遍历 taskClasses，delta score 必须为每个 classGroupId 单独计算 affectedKeys。' +
      'F5 harness SC8-FULL-8 (merged-class) 和 SC8-DELTA-4 (delta on merged-class) 是关键 regression case。',
    suggestedNextStage: 'K22-F6-CLASS-GAP-REDUCTION-IMPL',
  })

  findings.push({
    id: 'K22-F5-D-1',
    severity: 'LOW',
    category: 'D. Skip rules',
    title: 'room=0, weekend, < 2 periods, no classGroup 全部应 skip',
    currentStatus:
      '4 个 skip rule 与现有约束一致：' +
      '1) room === 0 (unscheduled) → skip, 与 SC5 / HC1-5 一致; ' +
      '2) dayOfWeek in [1..5] only → 与 SC5 / SC7 一致; ' +
      '3) periodSet.size < 2 → skip (gap 不可能为正); ' +
      '4) taskClasses.length === 0 → skip (orphan task).',
    evidence: [
      'score.ts: TEACHING_DAYS = [1, 2, 3, 4, 5] reused',
      'SC5 buildTeacherDailyCounts: pos.room === 0 → continue (same skip)',
      'SC7 day >= 6 → soft -15 (SC8 will not also penalize this; SC8 will skip weekend entirely)',
      'K22-F4 verification: buildSC5Context uses taskClasses with classGroupId — same pattern, no orphan',
    ],
    risk: 'LOW: skip rules 都是成熟做法, 不存在实现难点。',
    recommendation:
      'K22-F6 实施时严格按 4 条 skip rule 写代码，并在 harness 显式覆盖 (SC8-FULL-5 single lesson, ' +
      'SC8-FULL-6 weekend skip, SC8-FULL-7 room=0 skip)。',
    suggestedNextStage: 'K22-F6-CLASS-GAP-REDUCTION-IMPL',
  })

  findings.push({
    id: 'K22-F5-E-1',
    severity: 'LOW',
    category: 'E. Interaction with existing constraints',
    title: 'SC2 / SC3 / SC7 / MIN_PERT 与 SC8 独立',
    currentStatus:
      'SC2 (per task-day) vs SC8 (per classGroup-day) — 不同 key，不重复计算。' +
      'SC3 (extreme time, slotIndex >= 5) — SC8 不会把课推向极端时间因为那会增加 SC3 penalty。' +
      'SC7 (weekend) — SC8 跳过 day >= 6，无重叠。' +
      'MIN_PERT — 用 3rd-position originalAssignments 隔离。' +
      'SC1 (cross-building back-to-back) — 不同关注点，无冲突。',
    evidence: [
      'K22-F1 analysis of SC2 vs SC5 — same pattern: different keys, independent triggers',
      'SC3 only fires on slotIndex >= 5, SC8 does not push toward extreme times',
      'K22-F3 SC7 weekend logic: day >= 6 → soft -15; SC8 will not count day >= 6',
      'K22-F3 / F4 delta isolation pattern: originalAssignments set to (day=9, slotIndex=1, roomId=999)',
    ],
    risk:
      'LOW: 没有 hard conflict。但 SC2 + SC8 可能在 "merged task on same day with gap" 场景下同时触发，' +
      '这是正确的（两个不同维度的负向指标都该被 penalize）。',
    recommendation:
      'K22-F6 实施时不需要修改 SC2 / SC3 / SC7 / SC1 / MIN_PERT 任何代码。' +
      'K22-weights-roadmap 阶段（不在 K22-F 范围）可以决定如何平衡各 soft penalty。',
    suggestedNextStage: 'K22-F6-CLASS-GAP-REDUCTION-IMPL',
  })

  findings.push({
    id: 'K22-F5-F-1',
    severity: 'LOW',
    category: 'F. Delta score complexity',
    title: 'Delta 设计 = before/after per (classGroupId, day) key, 与 F4 模式一致',
    currentStatus:
      'Affected keys: 每个 classGroupId 最多 2 个 key (old day + new day if in [1..5])。' +
      'Helper function gapPenaltyForKey(cgId, day, excludeSlotId, overrideDay, overrideIdx) 是局部计算的核心。' +
      'MIN_PERT 隔离沿用 3rd-position originalAssignments 模式。',
    evidence: [
      'K22-F4 buildTeacherDailyCounts(teacherId, slots, state, excludeSlotId?) — same exclude-and-override pattern',
      'F3 buildStateForDeltaTarget uses day=9, slotIndex=1, roomId=999 for isolation',
      'SC8-DELTA-1 / 2 / 3 / 4 cases designed to verify isolation',
    ],
    risk:
      'LOW: delta score 的 O(affected_keys * ctx.slots) 与 F4 SC5 模式一致。' +
      '需要小心 helper 函数的 override 语义，但模式已经被 F4 验证。',
    recommendation:
      'K22-F6 实施时直接复用 K22-F4 buildTeacherDailyCounts 的 exclude-and-override 模式，' +
      '只需把 "teacherId + day" 改为 "classGroupId + day"。',
    suggestedNextStage: 'K22-F6-CLASS-GAP-REDUCTION-IMPL',
  })

  findings.push({
    id: 'K22-F5-G-1',
    severity: 'INFO',
    category: 'G. Penalty scale',
    title: '推荐 SOFT_SC8_PER_EMPTY_PERIOD = -2',
    currentStatus:
      'Penalty scale 校准：' +
      'SC5 (teacher day imbalance): -3 per unit. ' +
      'SC1 (cross-building back-to-back): -5 per pair. ' +
      'SC2 (same task same day): -10 per extra slot. ' +
      'SC8 (per empty period per classGroup-day): 建议 -2 per empty period. ' +
      '理由：gap 通常是 1-2 个 period，-2 与 SC5 同量级不会压过其他 SC；-5+ 会过强导致 solver 强行压缩。',
    evidence: [
      'K22-F1 SC5_PENALTY_PER_EXCESS = -3 (K22-F1A corrected)',
      'K22-D SC1 = -5',
      'SC2 = -10',
      'SC8 candidate penalty -2 is conservative; K22-weights-roadmap can tune later',
    ],
    risk: 'INFO: 初始 -2 偏保守。Solver 在生产数据上的实际行为需要 K22-F6 实施后观察。',
    recommendation:
      'K22-F6 实施 SOFT_SC8_PER_EMPTY_PERIOD = -2。' +
      'K22-weights-roadmap 阶段可以调整，但不阻塞 K22-F6。',
    suggestedNextStage: 'K22-F6-CLASS-GAP-REDUCTION-IMPL',
  })

  findings.push({
    id: 'K22-F5-H-1',
    severity: 'NONE',
    category: 'H. K22-F scope',
    title: 'K22-F5 audit 满足 spec 范围，不修改 score.ts / schema / DB',
    currentStatus:
      '本阶段只读审计，不实施 SC8。' +
      '所有修改限制在 audit 脚本 + audit 文档 + audit JSON。' +
      'score.ts / solver / schema / DB / API / frontend / importer / parser / RBAC / seed / 业务数据 全部不动。',
    evidence: [
      'scripts/audit-class-gap-reduction-constraint-k22-f5.ts (新增, 只读)',
      'docs/k22-class-gap-reduction-constraint-audit.md (新增, 文档)',
      'docs/k22-class-gap-reduction-constraint-audit.json (新增, 报告)',
      '无 prisma write / no score.ts edit / no schema change',
    ],
    risk: 'NONE: 严格遵守 K22-F5 spec 限制。',
    recommendation: 'K22-F5 可关闭。推荐进入 K22-F6 实施阶段。',
    suggestedNextStage: 'K22-F6-CLASS-GAP-REDUCTION-IMPL',
  })

  return findings
}

// ── Main ────────────────────────────────────────────────────────────

function main() {
  console.log('K22-F5 Class Gap Reduction Constraint Audit')
  console.log('============================================\n')

  const audit = buildDataStructureAudit()
  const candidates = buildDefinitionCandidates()
  const aggregation = buildClassGroupAggregationStrategy()
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
  console.log(`  classGroup: reliable=${audit.classGroupIdentification.reliable}`)
  console.log(`  day: reliable=${audit.dayIdentification.reliable}`)
  console.log(`  period/slotIndex: reliable=${audit.periodSlotOrder.reliable}`)
  console.log(`  room=0: handled (skip)`)
  console.log(`  weekend: handled (skip, SC7 owns)`)
  console.log(`  merged-class: handled (expand to each classGroup)`)
  console.log(`  score context sufficient: ${audit.scoreContextSufficient.reliable}`)
  console.log('')

  console.log('Definition candidates:')
  for (const c of candidates) {
    const tag = c.recommended ? '★ RECOMMENDED' : c.rejectionReason ? '✗ REJECTED' : '○ OK'
    console.log(`  [${c.id}] ${c.name} (${tag})`)
    if (c.rejectionReason) console.log(`      reason: ${c.rejectionReason}`)
    console.log(`      dataFeasible: ${c.dataFeasible}`)
  }
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
  console.log(`  SC2: ${interactions.sc2.direction}`)
  console.log(`  SC3: ${interactions.sc3.direction}`)
  console.log(`  SC7: ${interactions.sc7.direction}`)
  console.log(`  MIN_PERT: ${interactions.minPert.direction}`)
  console.log(`  SC1: ${interactions.sc1.direction}`)
  console.log('')

  console.log('Harness plan (12 cases):')
  for (const c of harness) {
    console.log(`  [${c.id}] ${c.category}: ${c.title}`)
  }
  console.log('')

  console.log('Findings:')
  for (const f of findings) {
    console.log(`  [${f.severity}] ${f.id} ${f.title}`)
  }
  console.log('')

  console.log(`Recommended next stage: K22-F6-CLASS-GAP-REDUCTION-IMPL`)
  console.log('  (implement SC8_CLASS_GAP full + delta in score.ts,')
  console.log('   extend K22-C regression harness with 12 SC8 cases,')
  console.log('   reuse K22-F4 fixture builder pattern)')
  console.log('')

  // Write JSON
  const outDir = path.join(projectRoot, 'docs')
  if (!fs.existsSync(outDir)) fs.mkdirSync(outDir, { recursive: true })
  const outPath = path.join(outDir, 'k22-class-gap-reduction-constraint-audit.json')

  const report = {
    generatedAt: new Date().toISOString(),
    phase: 'K22-F5-CLASS-GAP-REDUCTION-AUDIT',
    mode: 'read-only design audit',
    summary: {
      totalFindings: findings.length,
      severity: summary,
      blocking,
      recommendedConstraintId: 'SC8_CLASS_GAP_REDUCTION',
      recommendedStage: 'K22-F6-CLASS-GAP-REDUCTION-IMPL',
    },
    dataStructureAudit: audit,
    definitionCandidates: candidates,
    classGroupAggregation: aggregation,
    fullScoreDesign: fullScore,
    deltaScoreDesign: deltaScore,
    interactionAnalysis: interactions,
    harnessPlan: harness,
    findings,
    recommendedNextStage: 'K22-F6-CLASS-GAP-REDUCTION-IMPL',
    reasonsForRecommendation: [
      'Data is fully available: classGroupId via taskClasses, dayOfWeek, slotIndex on ScheduleSlot — no schema change needed',
      'Candidate A (simple period gap) is the cleanest definition: integer arithmetic, no lunch-boundary exception, no time model needed',
      'Candidate B rejected: adds complexity for marginal benefit; project does not model actual times',
      'Candidate C rejected: not data feasible (no startTime/endTime on ScheduleSlot; schema change is out of scope)',
      'Skip rules (room=0, weekend, < 2 periods, no classGroup) are consistent with existing constraints (SC5 / SC7 / HC3)',
      'Merged-class expansion is well-established: data-loader already iterates taskClasses for slotsByClass',
      'Delta design mirrors K22-F4 SC5 pattern: exclude-and-override helper, 3rd-position originalAssignments for MIN_PERT isolation',
      'SC8 is independent of SC1 / SC2 / SC3 / SC7 / MIN_PERT — no double-counting, no conflicting key',
      'Penalty -2 per empty period is conservative (matches SC5 scale) and tunable in K22-weights-roadmap',
      '12 harness cases designed: 8 full + 4 delta, covering no-gap / single-gap / multi-gap / multi-segment / single-lesson / weekend / room=0 / merged-class / delta-reduce / delta-introduce / delta-to-weekend / delta-merged-class',
    ],
    notes: [
      'K22-F5 is a read-only design audit. No Prisma writes, no score.ts changes, no schema changes.',
      'NEW-SC-02 is the canonical name from K22-E audit. SC8_CLASS_GAP_REDUCTION is the proposed score.ts id (following SC5/SC6/SC7).',
      'Period semantics: slotIndex is 1-based contiguous 1..6 (period 1=1-2节, ..., period 6=11-12节). No gaps in the index domain.',
      'The audit script does NOT execute any new logic — it only emits findings and design recommendations.',
    ],
  }
  fs.writeFileSync(outPath, JSON.stringify(report, null, 2), 'utf-8')
  console.log(`Report written: ${outPath}`)
}

main()
