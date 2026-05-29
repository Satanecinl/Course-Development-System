import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { requirePermission } from '@/lib/auth/require-permission'

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
  teacher: ['name'],
  course: ['name'],
  room: ['name', 'building', 'capacity', 'type'],
  teachingtask: ['courseId', 'teacherId', 'weekType', 'startWeek', 'endWeek', 'remark'],
  scheduleslot: ['teachingTaskId', 'roomId', 'dayOfWeek', 'slotIndex'],
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
    default:
      return null
  }
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
    const include = INCLUDE_MAP[model.toLowerCase()]
    const data = await delegate.findMany({ take: 500, ...(include ? { include } : {}) })
    return NextResponse.json(data)
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 })
  }
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ model: string }> }
) {
  const auth = await requirePermission('data:write', req)
  if ('error' in auth) return auth.error

  const { model } = await params
  const delegate = getDelegate(model)
  if (!delegate) {
    return NextResponse.json({ error: '未知数据表' }, { status: 400 })
  }

  try {
    const body = await req.json()
    const data = filterAllowedFields(model, body)
    const record = await delegate.create({ data })
    return NextResponse.json({ success: true, record })
  } catch (e: unknown) {
    return handlePrismaError(e)
  }
}

export async function PUT(
  req: NextRequest,
  { params }: { params: Promise<{ model: string }> }
) {
  const auth = await requirePermission('data:write', req)
  if ('error' in auth) return auth.error

  const { model } = await params
  const delegate = getDelegate(model)
  if (!delegate) {
    return NextResponse.json({ error: '未知数据表' }, { status: 400 })
  }

  try {
    const { id, ...body } = await req.json()
    if (!id) {
      return NextResponse.json({ error: '缺少 id 参数' }, { status: 400 })
    }

    const data = filterAllowedFields(model, body)
    const record = await delegate.update({ where: { id }, data })
    return NextResponse.json({ success: true, record })
  } catch (e: unknown) {
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
    const { id } = await req.json()
    if (!id) {
      return NextResponse.json({ error: '缺少 id 参数' }, { status: 400 })
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
    return NextResponse.json({ error: String(e) }, { status: 500 })
  }
}
