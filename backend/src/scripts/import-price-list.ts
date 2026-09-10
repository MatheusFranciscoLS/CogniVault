import { PrismaClient } from '@prisma/client';
import * as xlsx from 'xlsx';
import path from 'path';

const prisma = new PrismaClient();

async function main() {
  console.log('Starting price list import...');
  
  // Resolving the excel file relative to backend/src/scripts
  const excelPath = path.resolve(__dirname, '../../../Lista de Preços_Julho_2026_V2.xlsm');
  
  console.log(`Reading Excel file from: ${excelPath}`);
  const workbook = xlsx.readFile(excelPath, { cellDates: true });
  
  const sheetName = 'BASE_DADOS CADASTRAIS';
  const worksheet = workbook.Sheets[sheetName];
  
  if (!worksheet) {
    throw new Error(`Sheet "${sheetName}" not found in the workbook.`);
  }

  // Convert the sheet to JSON
  const data = xlsx.utils.sheet_to_json<any>(worksheet, { range: 2 });
  console.log(`Found ${data.length} rows in "${sheetName}".`);

  const tenant = await prisma.tenant.findFirst();
  if (!tenant) {
    throw new Error('No tenant found in the database. Cannot import MasterParts without a tenant.');
  }

  let count = 0;
  const batchSize = 1000;
  let batch = [];

  for (const row of data) {
    const rawPartNumber = String(row['Código'] || '').trim();
    if (!rawPartNumber || rawPartNumber === 'undefined') continue;

    const normalizedNumber = rawPartNumber.replace(/[^a-zA-Z0-9]/g, '').toUpperCase();
    
    const partData = {
      tenantId: tenant.id,
      partNumber: rawPartNumber,
      normalizedNumber,
      name: String(row['Descrição'] || '').trim(),
      description: row['Descrição'] ? String(row['Descrição']).trim() : null,
      price: parseFloat(row['Preço']) || null,
      ncm: row['Classific. Fiscal'] ? String(row['Classific. Fiscal']).trim() : null,
      ean: row['EAN'] ? String(row['EAN']).trim() : null,
      category: row['Class'] ? String(row['Class']).trim() : null,
      brand: row['Descrição Linha 2'] ? String(row['Descrição Linha 2']).trim() : null,
    };

    batch.push(partData);

    if (batch.length >= batchSize) {
      await processBatch(batch);
      count += batch.length;
      console.log(`Imported ${count} parts...`);
      batch = [];
    }
  }

  if (batch.length > 0) {
    await processBatch(batch);
    count += batch.length;
  }

  console.log(`Import complete! Total parts imported: ${count}`);
}

async function processBatch(batch: any[]) {
  await prisma.$transaction(
    batch.map((item) =>
      prisma.masterPart.upsert({
        where: {
          tenantId_normalizedNumber: {
            tenantId: item.tenantId,
            normalizedNumber: item.normalizedNumber,
          },
        },
        update: {
          partNumber: item.partNumber,
          name: item.name,
          description: item.description,
          price: item.price,
          ncm: item.ncm,
          ean: item.ean,
          category: item.category,
          brand: item.brand,
          updatedAt: new Date(),
        },
        create: item,
      })
    )
  );
}

main()
  .catch((e) => {
    console.error('Error during import:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
