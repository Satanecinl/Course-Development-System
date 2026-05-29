import { PrismaClient } from '@prisma/client'

const prisma = new PrismaClient()

const SUSPICIOUS_KEYWORDS = [
  '班', '合班', '机电', '等', '学时',
  '实训', '楼', '室', '或', '与',
]

// 周次约束模式：前面带数字或单/双/前/后 的 "周"
const WEEK_CONSTRAINT_RE = /(?:\d+|[单双前后一二三四五六七八九十]+)周/

function isBadTeacherName(name: string | null): boolean {
  if (!name || name.trim().length === 0) return true
  const trimmed = name.trim()
  if (trimmed.length < 2) return true
  if (/[a-zA-Z0-9]/.test(trimmed)) return true

  for (const kw of SUSPICIOUS_KEYWORDS) {
    if (trimmed.includes(kw)) return true
  }

  // "周" 单独处理：仅当周次约束模式匹配时才视为异常
  if (trimmed.includes('周') && WEEK_CONSTRAINT_RE.test(trimmed)) return true
  // "前"、"后"、"单"、"双" 单独处理：仅当作为独立词或周次前缀时才视为异常
  if (/^(前|后|单|双)$/.test(trimmed)) return true

  return false
}

async function main() {
  const teachers = await prisma.teacher.findMany({
    include: {
      tasks: {
        include: { course: true },
      },
    },
    orderBy: { id: 'asc' },
  })

  const results: { bad_teacher_name: string; course_names: string[] }[] = []

  for (const t of teachers) {
    if (isBadTeacherName(t.name)) {
      const courseNames = [...new Set(
        t.tasks
          .map((task) => task.course?.name)
          .filter((n): n is string => !!n)
      )]
      results.push({
        bad_teacher_name: t.name ?? '(null)',
        course_names: courseNames,
      })
    }
  }

  console.log(JSON.stringify(results, null, 2))
}

main()
  .catch((e) => {
    console.error(e)
    process.exit(1)
  })
  .finally(async () => {
    await prisma.$disconnect()
  })
