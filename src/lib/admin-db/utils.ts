export function fieldToChinese(field: string): string {
  const map: Record<string, string> = {
    id: 'ID',
    name: '名称',
    employeeNo: '工号',
    department: '部门',
    position: '职务',
    rank: '职称',
    phone: '手机',
    officePhone: '办公电话',
    remark: '备注',
    teacherId: '教师ID',
    courseId: '课程ID',
    roomId: '教室ID',
    dayOfWeek: '星期',
    slotIndex: '节次',
    weekType: '周次类型',
    startWeek: '开始周',
    endWeek: '结束周',
    capacity: '容量',
    building: '楼栋',
    type: '类型',
    advisorName: '辅导员',
    advisorPhone: '联系电话',
    teachingTaskId: '教学任务ID',
    classGroupId: '班级组ID',
    courseName: '课程',
    teacherName: '教师',
    roomName: '教室',
    classNames: '合班班级',
  }
  return map[field] || field
}

export function formatValue(value: unknown): string {
  if (value === null || value === undefined) return '-'
  if (typeof value === 'boolean') return value ? '是' : '否'
  if (typeof value === 'object') {
    if (value instanceof Date) return value.toLocaleString('zh-CN')
    return JSON.stringify(value).slice(0, 50)
  }
  return String(value).slice(0, 100)
}
