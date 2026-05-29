export interface TableConfig {
  key: string
  label: string
  color: string
}

export const TABLES: TableConfig[] = [
  { key: 'classgroup', label: '班级组表', color: 'bg-blue-100 text-blue-700' },
  { key: 'teacher', label: '教师表', color: 'bg-green-100 text-green-700' },
  { key: 'course', label: '课程表', color: 'bg-orange-100 text-orange-700' },
  { key: 'room', label: '教室表', color: 'bg-pink-100 text-pink-700' },
  { key: 'scheduleslot', label: '排课时段表', color: 'bg-indigo-100 text-indigo-700' },
  { key: 'teachingtask', label: '教学任务表', color: 'bg-purple-100 text-purple-700' },
]

/** 需要全局穿透警告的主数据表 */
export const MASTER_TABLES = new Set(['classgroup', 'teacher', 'course', 'room'])

/** 需要专用编辑弹窗的表 */
export const DEDICATED_TABLES = new Set(['teachingtask', 'scheduleslot'])

export interface FormField {
  key: string
  label: string
  type: 'text' | 'number'
  required?: boolean
}

export function getFormFields(tableKey: string): FormField[] {
  switch (tableKey) {
    case 'teacher':
      return [{ key: 'name', label: '教师姓名', type: 'text', required: true }]
    case 'course':
      return [{ key: 'name', label: '课程名称', type: 'text', required: true }]
    case 'room':
      return [
        { key: 'name', label: '教室名称', type: 'text', required: true },
        { key: 'building', label: '楼栋', type: 'text' },
        { key: 'capacity', label: '容量', type: 'number' },
      ]
    case 'classgroup':
      return [
        { key: 'name', label: '班级名称', type: 'text', required: true },
        { key: 'advisorName', label: '辅导员姓名', type: 'text' },
        { key: 'advisorPhone', label: '联系电话', type: 'text' },
      ]
    default:
      return []
  }
}

export function getDefaultFormData(tableKey: string): Record<string, unknown> {
  const fields = getFormFields(tableKey)
  const data: Record<string, unknown> = {}
  for (const f of fields) {
    data[f.key] = f.type === 'number' ? 50 : ''
  }
  return data
}

export const WEEK_TYPES = [
  { value: 'ALL', label: '全部周' },
  { value: 'ODD', label: '单周' },
  { value: 'EVEN', label: '双周' },
  { value: 'FIRST_HALF', label: '前半学期' },
  { value: 'SECOND_HALF', label: '后半学期' },
]
