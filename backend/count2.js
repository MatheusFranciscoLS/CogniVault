const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function run() {
  const count = await prisma.masterPart.count();
  console.log(`MasterParts count: ${count}`);
}

run()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
