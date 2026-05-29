import { PrismaClient } from '@prisma/client'
const prisma = new PrismaClient()
async function main() {
  const classes = await prisma.classGroup.findMany({
    where: { name: { contains: '汽车制造' } },
  })
  console.log(classes.map(c => c.name))
  await prisma.$disconnect()
}
main()
