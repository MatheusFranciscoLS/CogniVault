const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function run() {
  const count = await prisma.part.count();
  console.log(`Parts count: ${count}`);
}

run()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
