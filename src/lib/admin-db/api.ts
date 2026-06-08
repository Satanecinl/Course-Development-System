import type { DbRecord } from '@/lib/admin-db/types'
import type { EntityOption } from '@/components/combobox'
import { TABLES } from '@/lib/admin-db/config'
import { withSemesterQuery, useSemesterStore } from '@/store/semesterStore'

export async function fetchAdminTableRecords(table: string, semesterId?: number | null): Promise<DbRecord[]> {
  const url = withSemesterQuery(`/api/admin/${table}`, semesterId ?? null)
  const res = await fetch(url)
  const data = await res.json()
  if (!Array.isArray(data)) {
    throw new Error(data.error || '获取数据失败')
  }
  return data
}

export async function fetchAdminTableCounts(): Promise<Record<string, number>> {
  const semesterId = useSemesterStore.getState().currentSemesterId
  const result: Record<string, number> = {}
  for (const t of TABLES) {
    try {
      const url = withSemesterQuery(`/api/admin/${t.key}`, semesterId)
      const res = await fetch(url)
      const data = await res.json()
      result[t.key] = Array.isArray(data) ? data.length : 0
    } catch {
      result[t.key] = 0
    }
  }
  return result
}

export async function fetchEntityOptions(semesterId?: number | null): Promise<{
  courses: EntityOption[]
  teachers: EntityOption[]
  rooms: (EntityOption & { building: string | null })[]
  classGroups: EntityOption[]
}> {
  const sid = semesterId ?? null
  const [coursesRes, teachersRes, roomsRes, classGroupsRes] = await Promise.all([
    fetch('/api/entity-list?type=course'),
    fetch('/api/entity-list?type=teacher'),
    fetch('/api/entity-list?type=room'),
    fetch(withSemesterQuery('/api/entity-list?type=classgroup', sid)),
  ])
  const [coursesData, teachersData, roomsData, classGroupsData] = await Promise.all([
    coursesRes.json(),
    teachersRes.json(),
    roomsRes.json(),
    classGroupsRes.json(),
  ])
  return {
    courses: Array.isArray(coursesData) ? coursesData : [],
    teachers: Array.isArray(teachersData) ? teachersData : [],
    rooms: Array.isArray(roomsData) ? roomsData : [],
    classGroups: Array.isArray(classGroupsData) ? classGroupsData : [],
  }
}

export async function fetchTaskOptions(semesterId?: number | null): Promise<EntityOption[]> {
  const url = withSemesterQuery('/api/admin/teachingtask', semesterId ?? null)
  const res = await fetch(url)
  const data = await res.json()
  if (!Array.isArray(data)) return []
  return data.map((t: DbRecord) => {
    const r = t as Record<string, unknown>
    const course = r.course as { name?: string } | undefined
    const teacher = r.teacher as { name?: string } | undefined
    return {
      id: t.id,
      name: `${course?.name ?? '未知课程'} - ${teacher?.name ?? '未知教师'}`,
    }
  })
}

export async function createNamedEntity(endpoint: string, name: string): Promise<number | void> {
  const res = await fetch(endpoint, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name }),
  })
  const data = await res.json()
  return data.record?.id ?? data.id
}
