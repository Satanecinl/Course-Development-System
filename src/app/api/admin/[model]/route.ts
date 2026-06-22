import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { requirePermission } from '@/lib/auth/require-permission'
import type { PermissionKey } from '@/lib/auth/types'
import { resolveSchedulerSemester } from '@/lib/semester'
import { guardAdminSlotUpdate, guardAdminSlotCreate } from '@/lib/schedule/slot-mutation-guard'
import { guardAdminTaskUpdate } from '@/lib/schedule/teaching-task-mutation-guard'

const MODEL_MAP: Record<string, keyof typeof prisma> = {
  classgroup: 'classGroup',
  teacher: 'teacher',
  course: 'course',
  room: 'room',
  scheduleslot: 'scheduleSlot',
  teachingtask: 'teachingTask',
}

const FIELD_WHITELIST: Record<string, string[]> = {
  classgroup: ['name', 'advisorName', 'advisorPhone'],
  teacher: ['name', 'employeeNo', 'department', 'position', 'rank', 'phone', 'officePhone'],
  course: ['name'],
  room: ['name', 'building', 'capacity', 'type'],
  teachingtask: ['courseId', 'teacherId', 'weekType', 'startWeek', 'endWeek', 'remark'],
  scheduleslot: ['teachingTaskId', 'roomId', 'dayOfWeek', 'slotIndex'],
}

// K15-FIX-D: Model-specific write permission matrix.
// Schedule-sensitive models use granular permissions aligned with dedicated routes.
// Ordinary models continue to use data:write.
function getAdminWritePermission(model: string): PermissionKey {
  const m = model.toLowerCase()
  if (m === 'scheduleslot') return 'schedule:write'
  if (m === 'teachingtask') return 'teaching-task:write'
  return 'data:write'
}

const INCLUDE_MAP: Record<string, object> = {
  teachingtask: {
    course: true,
    teacher: true,
    taskClasses: { include: { classGroup: true } },
  },
  scheduleslot: {
    teachingTask: { include: { course: true, teacher: true } },
    room: true,
  },
}

// Models that are bound to a semester (require semester scoping)
const SEMESTER_SCOPED_MODELS = new Set(['classgroup', 'teachingtask', 'scheduleslot'])

type PrismaDelegate = {
  findMany: (args?: { take?: number; include?: object }) => Promise<unknown[]>
  create: (args: { data: Record<string, unknown> }) => Promise<unknown>
  update: (args: { where: { id: number }; data: Record<string, unknown> }) => Promise<unknown>
  delete: (args: { where: { id: number } }) => Promise<unknown>
}

function getDelegate(model: string): PrismaDelegate | null {
  const prismaModel = MODEL_MAP[model.toLowerCase()]
  if (!prismaModel) return null
  return prisma[prismaModel] as unknown as PrismaDelegate
}

function filterAllowedFields(model: string, body: Record<string, unknown>): Record<string, unknown> {
  const allowedFields = FIELD_WHITELIST[model.toLowerCase()] || ['name']
  const data: Record<string, unknown> = {}
  for (const key of allowedFields) {
    if (body[key] !== undefined) {
      data[key] = body[key]
    }
  }
  return data
}

function handlePrismaError(e: unknown): NextResponse {
  const err = e as { code?: string; message?: string }
  if (err.code === 'P2002') {
    return NextResponse.json({ error: '名称已存在，请使用其他名称' }, { status: 409 })
  }
  return NextResponse.json({ error: err.message || String(e) }, { status: 500 })
}

async function countReferences(model: string, id: number): Promise<{ count: number; type: string } | null> {
  switch (model.toLowerCase()) {
    case 'teacher': {
      const count = await prisma.teachingTask.count({ where: { teacherId: id } })
      return count > 0 ? { count, type: '教学任务' } : null
    }
    case 'course': {
      const count = await prisma.teachingTask.count({ where: { courseId: id } })
      return count > 0 ? { count, type: '教学任务' } : null
    }
    case 'room': {
      const count = await prisma.scheduleSlot.count({ where: { roomId: id } })
      return count > 0 ? { count, type: '排课时段' } : null
    }
    case 'classgroup': {
      const count = await prisma.teachingTaskClass.count({ where: { classGroupId: id } })
      return count > 0 ? { count, type: '教学任务班级关联' } : null
    }
    case 'teachingtask': {
      const count = await prisma.scheduleSlot.count({ where: { teachingTaskId: id } })
      return count > 0 ? { count, type: '排课时段' } : null
    }
    case 'scheduleslot': {
      const count = await prisma.scheduleAdjustment.count({ where: { originalSlotId: id } })
      return count > 0 ? { count, type: '调课记录' } : null
    }
    default:
      return null
  }
}

/**
 * Resolve semester for the request. Returns null for non-scoped models.
 * For scoped models, throws NextResponse on error.
 */
async function resolveSemesterIfNeeded(
  model: string,
  searchParams: URLSearchParams,
  body?: Record<string, unknown>,
): Promise<{ id: number; code: string; name: string } | null> {
  if (!SEMESTER_SCOPED_MODELS.has(model.toLowerCase())) return null

  try {
    // Prefer explicit semesterId from query, then body
    const explicitId = searchParams.get('semesterId')
      ?? (body?.semesterId != null ? Number(body.semesterId) : null)
    const semester = await resolveSchedulerSemester({
      semesterId: explicitId != null ? Number(explicitId) : undefined,
    })
    return semester
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    if (msg.includes('NO_ACTIVE_SEMESTER') || msg.includes('MULTIPLE_ACTIVE_SEMESTERS') || msg.includes('SEMESTER_NOT_FOUND')) {
      throw NextResponse.json({ error: msg }, { status: 400 })
    }
    throw NextResponse.json({ error: msg }, { status: 500 })
  }
}

/**
 * Build a where clause with optional semesterId filter.
 */
function scopedWhere(model: string, semesterId: number | null): Record<string, unknown> {
  const where: Record<string, unknown> = {}
  if (SEMESTER_SCOPED_MODELS.has(model.toLowerCase()) && semesterId != null) {
    where.semesterId = semesterId
  }
  return where
}

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ model: string }> }
) {
  const auth = await requirePermission('data:read', req)
  if ('error' in auth) return auth.error

  const { model } = await params
  const delegate = getDelegate(model)
  if (!delegate) {
    return NextResponse.json({ error: '未知数据表' }, { status: 400 })
  }

  try {
    const { searchParams } = new URL(req.url)
    const semester = await resolveSemesterIfNeeded(model, searchParams)

    const include = INCLUDE_MAP[model.toLowerCase()]
    const findArgs: Record<string, unknown> = { take: 500 }
    if (semester) {
      findArgs.where = scopedWhere(model, semester.id)
    }
    if (include) {
      findArgs.include = include
    }
    const data = await delegate.findMany(findArgs as Parameters<PrismaDelegate['findMany']>[0])
    return NextResponse.json(data)
  } catch (e) {
    // resolveSemesterIfNeeded may throw NextResponse
    if (e instanceof NextResponse) return e
    return NextResponse.json({ error: String(e) }, { status: 500 })
  }
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ model: string }> }
) {
  const { model } = await params
  const auth = await requirePermission(getAdminWritePermission(model), req)
  if ('error' in auth) return auth.error

  const delegate = getDelegate(model)
  if (!delegate) {
    return NextResponse.json({ error: '未知数据表' }, { status: 400 })
  }

  try {
    const { searchParams } = new URL(req.url)
    const body = await req.json()
    const semester = await resolveSemesterIfNeeded(model, searchParams, body)

    const data = filterAllowedFields(model, body)

    if (semester) {
      // Ensure semesterId is set for semester-scoped models
      if (data.semesterId != null && data.semesterId !== semester.id) {
        return NextResponse.json(
          { error: `semesterId 不匹配当前学期，期望 ${semester.id}，收到 ${data.semesterId}` },
          { status: 400 }
        )
      }
      data.semesterId = semester.id
    }

    // Conflict check for scheduleslot create
    if (model.toLowerCase() === 'scheduleslot' && data.teachingTaskId) {
      const guardResult = await guardAdminSlotCreate(data.teachingTaskId as number, data)
      if (!guardResult.ok) {
        return NextResponse.json(
          { error: guardResult.error, conflicts: guardResult.conflicts, conflictDetails: guardResult.conflictDetails },
          { status: guardResult.status ?? 400 },
        )
      }
      if (guardResult.semesterId && !data.semesterId) {
        data.semesterId = guardResult.semesterId
      }
    }

    const record = await delegate.create({ data })
    return NextResponse.json({ success: true, record })
  } catch (e: unknown) {
    if (e instanceof NextResponse) return e
    return handlePrismaError(e)
  }
}

export async function PUT(
  req: NextRequest,
  { params }: { params: Promise<{ model: string }> }
) {
  const { model } = await params
  const auth = await requirePermission(getAdminWritePermission(model), req)
  if ('error' in auth) return auth.error

  const delegate = getDelegate(model)
  if (!delegate) {
    return NextResponse.json({ error: '未知数据表' }, { status: 400 })
  }

  try {
    const { searchParams } = new URL(req.url)
    const { id, ...body } = await req.json()
    if (!id) {
      return NextResponse.json({ error: '缺少 id 参数' }, { status: 400 })
    }

    const semester = await resolveSemesterIfNeeded(model, searchParams, body)
    const data = filterAllowedFields(model, body)

    if (semester) {
      // Same-semester guard: verify record belongs to resolved semester
      const existing = await delegate.findMany({ take: 1, ...(semester ? { where: { id } } : {}) }) as Array<{ id: number; semesterId?: number | null }>
      if (!existing.length || (existing[0] as Record<string, unknown>).semesterId !== semester.id) {
        return NextResponse.json(
          { error: '记录不属于当前学期，无法修改' },
          { status: 403 }
        )
      }
      // Prevent changing semesterId
      if (data.semesterId != null && data.semesterId !== semester.id) {
        return NextResponse.json(
          { error: '不允许将记录移到其他学期' },
          { status: 400 }
        )
      }
      data.semesterId = semester.id
    }

    // Conflict check for scheduleslot update
    if (model.toLowerCase() === 'scheduleslot') {
      const guardResult = await guardAdminSlotUpdate(id, data)
      if (!guardResult.ok) {
        return NextResponse.json(
          { error: guardResult.error, conflicts: guardResult.conflicts, conflictDetails: guardResult.conflictDetails },
          { status: guardResult.status ?? 400 },
        )
      }
      // K14-FIX-A: defensive semesterId stability for scheduleslot PUT.
      // Even if `data.semesterId` was set above from `resolveSemesterIfNeeded`,
      // re-assert it from the guard's resolved semesterId so the update
      // cannot accidentally move a slot across semesters (POST path already
      // does this in lines below). Server guard is the final security boundary.
      if (guardResult.semesterId && !data.semesterId) {
        data.semesterId = guardResult.semesterId
      }
    }

    // K14-FIX-B: conflict guard for teachingtask PUT.
    // When teacherId changes on a task with existing ScheduleSlots, check
    // each slot for teacher conflicts with the new teacher. Uses the same
    // checkScheduleConflicts engine as slot-mutation-guard and /api/conflict-check.
    if (model.toLowerCase() === 'teachingtask') {
      const guardResult = await guardAdminTaskUpdate(id, data)
      if (!guardResult.ok) {
        return NextResponse.json(
          { error: guardResult.error, conflicts: guardResult.conflicts, conflictDetails: guardResult.conflictDetails },
          { status: guardResult.status ?? 400 },
        )
      }
    }

    const record = await delegate.update({ where: { id }, data })
    return NextResponse.json({ success: true, record })
  } catch (e: unknown) {
    if (e instanceof NextResponse) return e
    return handlePrismaError(e)
  }
}

export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ model: string }> }
) {
  const auth = await requirePermission('data:delete', req)
  if ('error' in auth) return auth.error

  const { model } = await params
  const delegate = getDelegate(model)
  if (!delegate) {
    return NextResponse.json({ error: '未知数据表' }, { status: 400 })
  }

  try {
    const { searchParams } = new URL(req.url)
    const { id } = await req.json()
    if (!id) {
      return NextResponse.json({ error: '缺少 id 参数' }, { status: 400 })
    }

    const semester = await resolveSemesterIfNeeded(model, searchParams)

    if (semester) {
      // Same-semester guard
      const existing = await delegate.findMany({ take: 1, ...(semester ? { where: { id } } : {}) }) as Array<{ id: number; semesterId?: number | null }>
      if (!existing.length || (existing[0] as Record<string, unknown>).semesterId !== semester.id) {
        return NextResponse.json(
          { error: '记录不属于当前学期，无法删除' },
          { status: 403 }
        )
      }
    }

    const ref = await countReferences(model, id)
    if (ref) {
      return NextResponse.json(
        {
          error: `该${model === 'classgroup' ? '班级' : model === 'teacher' ? '教师' : model === 'course' ? '课程' : model === 'room' ? '教室' : '实体'}已被 ${ref.count} 条${ref.type}记录引用，请先在 Dashboard 中解除排课。`,
          refCount: ref.count,
          refType: ref.type,
        },
        { status: 409 }
      )
    }

    await delegate.delete({ where: { id } })
    return NextResponse.json({ success: true })
  } catch (e) {
    if (e instanceof NextResponse) return e
    return NextResponse.json({ error: String(e) }, { status: 500 })
  }
}
