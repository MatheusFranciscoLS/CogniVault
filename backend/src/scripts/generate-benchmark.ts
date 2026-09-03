import { PrismaClient } from '@prisma/client';
import fs from 'fs';
import path from 'path';

const prisma = new PrismaClient();

async function run() {
  console.log('Pesquisando as peças mais buscadas no seu Banco de Dados...');
  
  const topSearches = await prisma.searchHistory.groupBy({
    by: ['query', 'resultCode', 'resultModel', 'resultPnc'],
    _count: { query: true },
    where: { status: 'FOUND', resultCode: { not: null } },
    orderBy: { _count: { query: 'desc' } },
    take: 50
  });

  if (topSearches.length === 0) {
    console.log('Não há histórico suficiente no banco de dados para gerar a lista. Continue usando o sistema para acumular dados.');
    process.exit(0);
  }

  let fileContent = 'import type { PartBenchmarkCase } from "../services/part-benchmark";\n\nexport const TOP_50_BALCAO_HUSQVARNA: Omit<PartBenchmarkCase, "source">[] = [\n';

  topSearches.forEach((search, index) => {
    if (!search.resultCode) return;
    const cleanQuery = search.query.replace(/'/g, "\\'");
    fileContent += `  { id: 'top-item-${index}', query: '${cleanQuery}', model: '${search.resultModel || ''}', pnc: '${search.resultPnc || ''}', expectedPartNumbers: ['${search.resultCode}'] },\n`;
  });

  fileContent += '];\n';

  const filePath = path.join(__dirname, '../services/part-benchmark-top50.ts');
  fs.writeFileSync(filePath, fileContent, 'utf-8');
  console.log('✅ Arquivo gerado com sucesso em backend/src/services/part-benchmark-top50.ts');
}

run().catch(console.error).finally(() => prisma.$disconnect());
