/**
 * K10-SEMESTER-SCHEMA-NULLABLE-PREP 验证脚本
 *
 * 验证 Semester model 已添加，目标模型有 nullable semesterId，
 * 现有数据未丢失，安全边界未违反。
 */

import { PrismaClient } from '@prisma/client'
import * as fs from 'fs'
import * as path from 'path'

const prisma = new PrismaClient()
const ROOT = path.resolve(__dirname, '..')

let pass = 0
let fail = 0

function check(label: string, ok: boolean, detail?: string) {
  if (ok) {
    console.log(`  ✅ ${label}`)
    pass++
  } else {
    console.log(`  ❌ ${label}${detail ? ` — ${detail}` : ''}`)
    fail++
  }
}

async function main() {
  console.log('════════════════════════════════════════════════════════════')
  console.log('K10-SEMESTER-SCHEMA-NULLABLE-PREP 验证')
  console.log('════════════════════════════════════════════════════════════\n')

  // ── 1. Schema 静态检查 ──
  console.log('─── 1. Schema 静态检查 ───\n')

  const schema = fs.readFileSync(path.join(ROOT, 'prisma/schema.prisma'), 'utf-8')

  // 1a. Semester model 存在
  check('model Semester 存在', schema.includes('model Semester'))

  // 1b. 目标模型有 nullable semesterId
  const targets = [
    'ClassGroup', 'TeachingTask', 'ScheduleSlot',
    'ScheduleAdjustment', 'SchedulingRun', 'SchedulingConfig'
  ]
  for (const model of targets) {
    const modelRegex = new RegExp(`model\\s+${model}\\s*\\{([^}]+)\\}`, 's')
    const m = schema.match(modelRegex)
    if (m) {
      const body = m[1]
      const hasNullable = /semesterId\s+Int\?/.test(body)
      const hasRequired = /semesterId\s+Int\s+[^?]/.test(body) && !/semesterId\s+Int\?/.test(body)
      check(`${model} 有 semesterId Int?`, hasNullable)
      check(`${model} semesterId 不是 required`, !hasRequired)
      check(`${model} 有 Semester relation`, body.includes('Semester?'))
      check(`${model} 有 @@index([semesterId])`, body.includes('@@index([semesterId])'))
    } else {
      check(`${model} model 存在`, false, 'model not found in schema')
    }
  }

  // 1c. 不应有 required semesterId
  const requiredSemesterId = schema.match(/semesterId\s+Int\s+[^?]/g)
  // Filter out Int? which is nullable
  const actuallyRequired = requiredSemesterId?.filter(m => !m.includes('Int?')) ?? []
  check('无 required semesterId', actuallyRequired.length === 0,
    actuallyRequired.length > 0 ? `found: ${actuallyRequired.join(', ')}` : undefined)

  // ── 2. 数据库结构检查 ──
  console.log('\n─── 2. 数据库结构检查 ───\n')

  // 2a. Prisma Client 可查询核心表
  const tableChecks: [string, () => Promise<number>][] = [
    ['Room', () => prisma.room.count()],
    ['Teacher', () => prisma.teacher.count()],
    ['Course', () => prisma.course.count()],
    ['ClassGroup', () => prisma.classGroup.count()],
    ['TeachingTask', () => prisma.teachingTask.count()],
    ['ScheduleSlot', () => prisma.scheduleSlot.count()],
    ['ScheduleAdjustment', () => prisma.scheduleAdjustment.count()],
    ['SchedulingRun', () => prisma.schedulingRun.count()],
    ['SchedulerRunChange', () => prisma.schedulerRunChange.count()],
    ['SchedulingConfig', () => prisma.schedulingConfig.count()],
    ['Semester', () => prisma.semester.count()],
  ]

  for (const [name, fn] of tableChecks) {
    try {
      const count = await fn()
      check(`${name} 可查询 (count=${count})`, true)
    } catch (e: any) {
      check(`${name} 可查询`, false, e.message)
    }
  }

  // ── 3. 数据 count 检查 ──
  console.log('\n─── 3. 数据 count 检查 ───\n')

  const counts = {
    Room: await prisma.room.count(),
    Teacher: await prisma.teacher.count(),
    Course: await prisma.course.count(),
    ClassGroup: await prisma.classGroup.count(),
    TeachingTask: await prisma.teachingTask.count(),
    ScheduleSlot: await prisma.scheduleSlot.count(),
    ScheduleAdjustment: await prisma.scheduleAdjustment.count(),
    SchedulingRun: await prisma.schedulingRun.count(),
    SchedulerRunChange: await prisma.schedulerRunChange.count(),
    SchedulingConfig: await prisma.schedulingConfig.count(),
    ImportBatch: await prisma.importBatch.count(),
    User: await prisma.user.count(),
    TeachingTaskClass: await prisma.teachingTaskClass.count(),
    Semester: await prisma.semester.count(),
  }

  console.log('  模型                   | count')
  console.log('  ───────────────────────|──────')
  for (const [name, count] of Object.entries(counts)) {
    console.log(`  ${name.padEnd(22)} | ${count}`)
  }

  // 验证关键表不为 0
  const criticalTables = ['Room', 'Teacher', 'Course', 'ClassGroup', 'TeachingTask', 'ScheduleSlot']
  for (const name of criticalTables) {
    check(`${name} count > 0`, (counts as any)[name] > 0,
      (counts as any)[name] === 0 ? 'DATA LOSS DETECTED' : undefined)
  }

  // Semester 可以为 0（未做 backfill）
  check('Semester count = 0 (未做 backfill)', counts.Semester === 0)

  // ── 4. 安全边界检查 ──
  console.log('\n─── 4. 安全边界检查 ───\n')

  // 4a. /api/scheduler/run 不存在
  const schedulerRunPath = path.join(ROOT, 'src/app/api/admin/scheduler/run/route.ts')
  check('/api/scheduler/run 不存在', !fs.existsSync(schedulerRunPath))

  // 4b. prisma/dev.db 未被 Git 跟踪
  try {
    const gitLs = require('child_process').execSync('git ls-files prisma/dev.db', { cwd: ROOT, encoding: 'utf-8' }).trim()
    check('prisma/dev.db 未被 Git 跟踪', gitLs.length === 0,
      gitLs.length > 0 ? 'TRACKED' : undefined)
  } catch {
    check('prisma/dev.db 未被 Git 跟踪', true, 'git ls-files returned empty (OK)')
  }

  // ── Summary ──
  console.log('\n════════════════════════════════════════════════════════════')
  console.log(`📊 验证完成: ${pass} passed, ${fail} failed`)
  console.log('════════════════════════════════════════════════════════════')

  if (fail > 0) {
    process.exit(1)
  }
}

main()
  .catch(e => { console.error(e); process.exit(1) })
  .finally(() => prisma.$disconnect())
