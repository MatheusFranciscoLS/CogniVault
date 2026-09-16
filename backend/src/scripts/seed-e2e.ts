import 'dotenv/config';
import bcrypt from 'bcryptjs';
import { prisma } from '../config/prisma';

const TENANT_NAME = 'CogniVault E2E';
const ADMIN_EMAIL = 'admin.e2e@cognivault.local';
const MECHANIC_EMAIL = 'mecanico.e2e@cognivault.local';
const PASSWORD = process.env.E2E_PASSWORD || 'CogniVault-E2E-2026!';

async function main() {
  if (process.env.E2E_SEED_ALLOWED !== 'true') {
    throw new Error('Seed E2E bloqueado. Defina E2E_SEED_ALLOWED=true apenas em banco descartável de teste.');
  }

  const tenant = await prisma.tenant.create({ data: { name: TENANT_NAME } });
  const password = await bcrypt.hash(PASSWORD, 10);

  await prisma.user.createMany({
    data: [
      { email: ADMIN_EMAIL, password, role: 'ADMIN', status: 'APPROVED', tenantId: tenant.id },
      { email: MECHANIC_EMAIL, password, role: 'MECHANIC', status: 'APPROVED', tenantId: tenant.id },
    ],
  });

  const category = await prisma.category.create({
    data: { name: 'Roçadeiras', tenantId: tenant.id },
  });

  const document = await prisma.document.create({
    data: {
      filename: 'E2E 143RII.pdf',
      url: 'e2e://143rii',
      status: 'COMPLETED',
      processingStage: 'READY_WITHOUT_EMBEDDINGS',
      manufacturer: 'Husqvarna',
      model: '143RII',
      pnc: '967332904',
      tenantId: tenant.id,
      categoryId: category.id,
      reviewStatus: 'READY',
    },
  });

  await prisma.part.createMany({
    data: [
      {
        documentId: document.id,
        manufacturer: 'Husqvarna',
        normalizedManufacturer: 'HUSQVARNA',
        model: '143RII',
        normalizedModel: '143RII',
        pnc: '967332904',
        normalizedPnc: '967332904',
        universalAcrossPnc: false,
        section: 'CARBURETTOR & AIR FILTER',
        position: '15',
        name: 'CARBURADOR',
        normalizedName: 'CARBURADOR',
        alternativeNames: ['CARBURETTOR'],
        partNumber: '587106701',
        normalizedPartNumber: '587106701',
        page: 29,
        searchText: 'carburador carburettor 143rii 967332904 587106701 filtro ar',
        active: true,
      },
      {
        documentId: document.id,
        manufacturer: 'Husqvarna',
        normalizedManufacturer: 'HUSQVARNA',
        model: '143RII',
        normalizedModel: '143RII',
        pnc: '967332904',
        normalizedPnc: '967332904',
        universalAcrossPnc: false,
        section: 'TANK',
        position: '5',
        name: 'FILTRO DE COMBUSTÍVEL',
        normalizedName: 'FILTRODECOMBUSTIVEL',
        alternativeNames: ['FUEL FILTER'],
        partNumber: '503443201',
        normalizedPartNumber: '503443201',
        page: 25,
        searchText: 'filtro combustivel fuel filter 143rii 967332904 503443201 tanque',
        active: true,
      },
    ],
  });

  console.log(JSON.stringify({
    tenantId: tenant.id,
    adminEmail: ADMIN_EMAIL,
    mechanicEmail: MECHANIC_EMAIL,
    password: PASSWORD,
  }));
}

main()
  .catch(error => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
