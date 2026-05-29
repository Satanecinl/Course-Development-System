import { PrismaClient } from '@prisma/client'
const prisma = new PrismaClient()
async function main() {
  const types = await prisma.teachingTask.groupBy({ by: ['weekType'], _count: true })
  console.log(types)
  await prisma.$disconnect()
}
main()
