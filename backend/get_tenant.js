const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();
prisma.tenant.findFirst().then(t => console.log(t?.id)).finally(() => prisma.$disconnect());
