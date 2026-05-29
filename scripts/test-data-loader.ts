import { loadSchedulingContext } from '../src/lib/scheduler/data-loader'

async function main() {
  console.time('Data Loading')
  const ctx = await loadSchedulingContext()
  console.timeEnd('Data Loading')

  console.log('--- Context Statistics ---')
  console.log(`Tasks: ${ctx.tasks.length}`)
  console.log(`Rooms: ${ctx.rooms.length}`)
  console.log(`Slots: ${ctx.slots.length}`)
  console.log(`TaskById Map size: ${ctx.taskById.size}`)
  console.log(`RoomById Map size: ${ctx.roomById.size}`)
  console.log(`SlotsByTask Map size: ${ctx.slotsByTask.size}`)
  console.log(`SlotsByRoom Map size: ${ctx.slotsByRoom.size}`)
  console.log(`SlotsByTeacher Map size: ${ctx.slotsByTeacher.size}`)
  console.log(`SlotsByClass Map size: ${ctx.slotsByClass.size}`)

  // 抽样验证
  const firstTask = ctx.tasks[0]
  if (firstTask) {
    console.log(`\nSample Task ID ${firstTask.id} (${firstTask.course?.name}):`)
    console.log(`- Has ${ctx.slotsByTask.get(firstTask.id)?.length || 0} slots.`)
    console.log(`- Associated Classes: ${firstTask.taskClasses?.length || 0}`)
  }

  // 验证复合键索引
  const firstSlot = ctx.slots[0]
  if (firstSlot) {
    const { roomId, teachingTask, dayOfWeek, slotIndex } = firstSlot
    console.log(`\nSample Slot ID ${firstSlot.id}:`)
    console.log(`- Room: ${firstSlot.room?.name}, Day: ${dayOfWeek}, Slot: ${slotIndex}`)
    if (roomId != null) {
      const rk = `${roomId}-${dayOfWeek}-${slotIndex}`
      console.log(`- SlotsByRoom[${rk}]: ${ctx.slotsByRoom.get(rk)?.length || 0} entries`)
    }
    if (teachingTask.teacherId != null) {
      const tk = `${teachingTask.teacherId}-${dayOfWeek}-${slotIndex}`
      console.log(`- SlotsByTeacher[${tk}]: ${ctx.slotsByTeacher.get(tk)?.length || 0} entries`)
    }
    for (const tc of teachingTask.taskClasses) {
      const ck = `${tc.classGroupId}-${dayOfWeek}-${slotIndex}`
      console.log(`- SlotsByClass[${ck}]: ${ctx.slotsByClass.get(ck)?.length || 0} entries`)
    }
  }
}

main().catch(console.error)
