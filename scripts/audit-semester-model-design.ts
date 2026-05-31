/**
 * K10-SEMESTER-MODEL-DESIGN 审计脚本
 *
 * 只读扫描 schema、src、scripts，输出 semester 模型设计所需信息。
 */

import * as fs from 'fs'
import * as path from 'path'

const ROOT = path.resolve(__dirname, '..')

// ── Helpers ──

function readFileSync(relPath: string): string {
  const abs = path.join(ROOT, relPath)
  return fs.readFileSync(abs, 'utf-8')
}

function fileExists(relPath: string): boolean {
  return fs.existsSync(path.join(ROOT, relPath))
}

function fileContains(relPath: string, pattern: string | RegExp): boolean {
  try {
    const content = readFileSync(relPath)
    return typeof pattern === 'string'
      ? content.includes(pattern)
      : pattern.test(content)
  } catch {
    return false
  }
}

// ── Audit ──

console.log('════════════════════════════════════════════════════════════')
console.log('K10-SEMESTER-MODEL-DESIGN 审计')
console.log('════════════════════════════════════════════════════════════\n')

// 1. Schema 存在性检查
console.log('─── 1. Schema 存在性检查 ───\n')

const schema = readFileSync('prisma/schema.prisma')

console.log('  📋 Semester 模型:')
console.log(`    - model Semester 存在: ${schema.includes('model Semester') ? '是' : '否'}`)
console.log(`    - model AcademicTerm 存在: ${schema.includes('model AcademicTerm') ? '是' : '否'}`)

console.log('\n  📋 semesterId 字段:')
const semesterIdMatches = schema.match(/semesterId/g)
console.log(`    - 出现次数: ${semesterIdMatches?.length ?? 0}`)

// 检查哪些模型有 semesterId
const modelsWithSemesterId: string[] = []
const modelRegex = /model\s+(\w+)\s*\{([^}]+)\}/g
let match
while ((match = modelRegex.exec(schema)) !== null) {
  const modelName = match[1]
  const modelBody = match[2]
  if (modelBody.includes('semesterId')) {
    modelsWithSemesterId.push(modelName)
  }
}
console.log(`    - 包含 semesterId 的模型: ${modelsWithSemesterId.length > 0 ? modelsWithSemesterId.join(', ') : '无'}`)

console.log('\n  📋 近似字段:')
console.log(`    - academicYear 存在: ${schema.includes('academicYear') ? '是' : '否'}`)
console.log(`    - schoolYear 存在: ${schema.includes('schoolYear') ? '是' : '否'}`)
console.log(`    - year 存在: ${/year\s/i.test(schema) ? '是' : '否'}`)
console.log(`    - term 存在: ${schema.includes('term') ? '是' : '否'}`)

// 2. 核心模型清单
console.log('\n─── 2. 核心模型清单 ───\n')

const coreModels = [
  'Room', 'Teacher', 'Course', 'ClassGroup',
  'TeachingTask', 'TeachingTaskClass', 'ScheduleSlot',
  'ScheduleAdjustment', 'SchedulingRun', 'SchedulerRunChange',
  'SchedulingConfig', 'ImportBatch'
]

console.log('  模型                         | 存在 | 有 importBatchId | 有 semesterId')
console.log('  ─────────────────────────────|──────|──────────────────|─────────────')
for (const model of coreModels) {
  const exists = schema.includes(`model ${model}`)
  const hasImportBatch = schema.includes(`model ${model}`) &&
    new RegExp(`model\\s+${model}\\s*\\{[^}]*importBatchId`).test(schema)
  const hasSemesterId = schema.includes(`model ${model}`) &&
    new RegExp(`model\\s+${model}\\s*\\{[^}]*semesterId`).test(schema)
  console.log(`  ${model.padEnd(28)} | ${exists ? '✅' : '❌'}   | ${hasImportBatch ? '✅' : '❌'}              | ${hasSemesterId ? '✅' : '❌'}`)
}

// 3. 导入流程检查
console.log('\n─── 3. 导入流程检查 ───\n')

const importFiles = [
  'src/lib/import/importer.ts',
  'src/lib/import/parse-utils.ts',
  'src/lib/import/quality-classifier.ts',
  'src/lib/import/rollback.ts',
  'src/app/api/admin/import/parse/route.ts',
  'src/app/api/admin/import/confirm/route.ts',
]

console.log('  📋 导入相关文件:')
for (const file of importFiles) {
  const exists = fileExists(file)
  console.log(`    - ${file}: ${exists ? '存在' : '不存在'}`)
}

console.log('\n  📋 ImportBatch 使用:')
console.log(`    - ImportBatch 有 semesterId: ${/model\s+ImportBatch\s*\{[^}]*semesterId/.test(schema) ? '是' : '否'}`)

// 4. Scheduler 流程检查
console.log('\n─── 4. Scheduler 流程检查 ───\n')

console.log('  📋 data-loader 是否按 semester 过滤:')
const dataLoaderPath = 'src/lib/scheduler/data-loader.ts'
if (fileExists(dataLoaderPath)) {
  const content = readFileSync(dataLoaderPath)
  console.log(`    - 使用 semesterId 过滤: ${content.includes('semesterId') ? '是' : '否'}`)
  console.log(`    - 使用 importBatchId 过滤: ${content.includes('importBatchId') ? '是' : '否'}`)
  console.log(`    - 全库加载: ${content.includes('findMany') ? '是' : '否'}`)
} else {
  console.log('    - 文件不存在')
}

console.log('\n  📋 Preview / Apply / Rollback:')
const previewPath = 'src/lib/scheduler/preview.ts'
const applyPath = 'src/lib/scheduler/apply.ts'
const rollbackPath = 'src/lib/scheduler/rollback.ts'

for (const [name, filePath] of [['Preview', previewPath], ['Apply', applyPath], ['Rollback', rollbackPath]]) {
  if (fileExists(filePath)) {
    const content = readFileSync(filePath)
    console.log(`    - ${name} 使用 semesterId: ${content.includes('semesterId') ? '是' : '否'}`)
  }
}

console.log('\n  📋 SchedulingRun:')
const schedulingRunModel = schema.match(/model\s+SchedulingRun\s*\{([^}]+)\}/)?.[1] ?? ''
console.log(`    - 有 semesterId: ${schedulingRunModel.includes('semesterId') ? '是' : '否'}`)
console.log(`    - 有 configId: ${schedulingRunModel.includes('configId') ? '是' : '否'}`)

// 5. 建议
console.log('\n─── 5. 设计建议 ───\n')

console.log('  📋 全局共享模型（不应加 semesterId）:')
console.log('    - Room: 教室是物理存在，全局共享')
console.log('    - Teacher: 教师是人员字典，全局共享')
console.log('    - Course: 课程是字典，全局共享')
console.log('    - User/Role/Permission: RBAC 模型，全局共享')
console.log('    - RoomAvailability: 教室可用性，全局共享')

console.log('\n  📋 按学期隔离模型（应加 semesterId）:')
console.log('    - ClassGroup: 班级可能按学期变化（如新生入学）')
console.log('    - TeachingTask: 教学任务是学期级概念')
console.log('    - TeachingTaskClass: 教学任务-班级关联，随 TeachingTask')
console.log('    - ScheduleSlot: 排课槽位，核心学期数据')
console.log('    - ScheduleAdjustment: 调课记录，随 ScheduleSlot')
console.log('    - SchedulingRun: 排课运行记录，应归属学期')
console.log('    - SchedulerRunChange: 排课变更明细，随 SchedulingRun')
console.log('    - ImportBatch: 导入批次，应归属学期')
console.log('    - SchedulingConfig: 排课配置，可按学期定制')

console.log('\n  📋 需要特别判断:')
console.log('    - ClassGroup: 当前是长期班级还是学期教学班？')
console.log('    - Course: 当前是课程字典还是导入课程实例？')
console.log('    - SchedulingConfig.semesterId: 已存在但未使用，需确认语义')

// ── Summary ──

console.log('\n════════════════════════════════════════════════════════════')
console.log('📊 审计完成')
console.log('════════════════════════════════════════════════════════════')
