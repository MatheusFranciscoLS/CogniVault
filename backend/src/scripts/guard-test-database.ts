import dotenv from 'dotenv';
import { judgeTestDatabase } from '../utils/test-database-guard';

// O Prisma carrega o `.env` sozinho quando o cliente nasce; a guarda precisa ver
// a mesma URL que ele veria, senão checaria o ambiente e deixaria o arquivo passar.
dotenv.config({ quiet: true });

const verdict = judgeTestDatabase(
  process.env.DATABASE_URL,
  process.env.ALLOW_PRODUCTION_DB_TESTS === '1',
);

if (!verdict.allowed) {
  console.error(`❌ Suíte de testes recusada: ${verdict.reason}`);
  process.exit(1);
}

console.log(`✅ Guarda do banco de testes: ${verdict.reason}`);
