import { loadSchedulingContext } from '../src/lib/scheduler/data-loader'
import { buildInitialState } from '../src/lib/scheduler/solver'
import {
  diagnoseCapacityConflicts,
  summarizeCapacityDiagnostics,
  printCapacityDiagnostics,
} from '../src/lib/scheduler/capacity-diagnostics'
import {
  getTaskStudentCount,
  getEligibleRoomsByCapacity,
} from '../src/lib/scheduler/capacity'

async function main() {
  console.time('Data Loading')
  const ctx = await loadSchedulingContext()
  console.timeEnd('Data Loading')

  console.log(`Tasks: ${ctx.tasks.length}, Rooms: ${ctx.rooms.length}, Slots: ${ctx.slots.length}`)

  // 1. Room 容量分布
  console.log('\n=== Room Capacity Distribution ===')
  const roomCapDist: Record<string, number> = {}
  for (const room of ctx.rooms) {
    const range = room.capacity <= 50 ? '≤50'
      : room.capacity <= 60 ? '51-60'
      : room.capacity <= 80 ? '61-80'
      : room.capacity <= 100 ? '81-100'
      : '>100'
    roomCapDist[range] = (roomCapDist[range] || 0) + 1
  }
  for (const [range, count] of Object.entries(roomCapDist)) {
    console.log(`  ${range}: ${count} rooms`)
  }

  // 2. Task 学生数分布
  console.log('\n=== Task Student Count Distribution ===')
  const taskStudentDist: Record<string, number> = {}
  for (const task of ctx.tasks) {
    const info = getTaskStudentCount(task, ctx)
    const range = info.studentCount <= 50 ? '≤50'
      : info.studentCount <= 100 ? '51-100'
      : info.studentCount <= 150 ? '101-150'
      : '>150'
    taskStudentDist[range] = (taskStudentDist[range] || 0) + 1
  }
  for (const [range, count] of Object.entries(taskStudentDist)) {
    console.log(`  ${range}: ${count} tasks`)
  }

  // 3. 人数来源统计
  console.log('\n=== Count Source Distribution ===')
  const sourceDist: Record<string, number> = {}
  for (const task of ctx.tasks) {
    const info = getTaskStudentCount(task, ctx)
    sourceDist[info.countSource] = (sourceDist[info.countSource] || 0) + 1
  }
  for (const [source, count] of Object.entries(sourceDist)) {
    console.log(`  ${source}: ${count}`)
  }

  // 4. 容量诊断
  const state = buildInitialState(ctx)
  const conflicts = diagnoseCapacityConflicts(state, ctx)
  const result = summarizeCapacityDiagnostics(conflicts, ctx)
  printCapacityDiagnostics(result)

  // 5. 最大教室容量
  const maxRoomCap = Math.max(...ctx.rooms.map((r) => r.capacity))
  console.log(`\nMax room.capacity in database: ${maxRoomCap}`)

  // 6. 最大 task 学生数
  const maxStudents = Math.max(...ctx.tasks.map((t) => getTaskStudentCount(t, ctx).studentCount))
  console.log(`Max task studentCount: ${maxStudents}`)

  // 7. 对最大 task 检查 eligible rooms
  const biggestTask = ctx.tasks.find((t) => getTaskStudentCount(t, ctx).studentCount === maxStudents)
  if (biggestTask) {
    const info = getTaskStudentCount(biggestTask, ctx)
    const eligible = getEligibleRoomsByCapacity(info.studentCount, ctx)
    console.log(`\nBiggest task: ${biggestTask.course?.name} (${info.studentCount} students)`)
    console.log(`Eligible rooms: ${eligible.length}`)
    for (const r of eligible.slice(0, 5)) {
      console.log(`  ${r.roomName} cap=${r.capacity} building=${r.building}`)
    }
  }
}

main().catch(console.error)
