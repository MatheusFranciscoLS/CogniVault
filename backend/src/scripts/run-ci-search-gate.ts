import 'dotenv/config';
import { prisma } from '../config/prisma';
import { PartSearchService } from '../services/part-search.service';
import { buildFallbackIntent } from '../services/chat-reliability';
import { normalizeIdentifier } from '../utils/normalize';

interface Fixture {
  family: string;
  model: string;
  name: string;
  partNumber: string;
  pnc?: string;
}

// Amostra fixa baseada em evidências reais da biblioteca da Vardão. O objetivo
// deste conjunto não é substituir o benchmark de portfólio, e sim detectar no
// PR regressões determinísticas da recuperação sem acessar produção nem Gemini.
const FIXTURES: Fixture[] = [
  { family: 'Aparadores de cerca-viva', model: '122 HD60', name: 'CONTACT SPRING', partNumber: '501485601' },
  { family: 'Cortadores de grama', model: 'GX 560', name: 'CAPA HOOD HVT', partNumber: '510620620', pnc: '970617501' },
  { family: 'Cortadores de grama', model: 'HU725AWD', name: 'WASHER FLAT', partNumber: '532067725', pnc: '96145001703' },
  { family: 'Cortadores de grama', model: 'J55 SL', name: 'PIN', partNumber: '532051793', pnc: '96121001801' },
  { family: 'Cortadores de grama', model: 'LB 256SP', name: 'INSTALLATION KIT BOLTS AND NUTS', partNumber: '529594801' },
  { family: 'Cortadores de grama', model: 'LC 121P', name: 'PINO HAIRPIN COTTER', partNumber: '532051793', pnc: '96133002700' },
  { family: 'Cortadores de grama', model: 'LC 151', name: 'SUPORTE DA LÂMINA BLADE ADAPTER', partNumber: '529595001', pnc: '970488301' },
  { family: 'Cortadores de grama', model: 'LC 151S', name: 'SUPORTE DA LÂMINA BLADE ADAPTER', partNumber: '529595001', pnc: '970488401' },
  { family: 'Cortadores de grama', model: 'LC 353AWD', name: 'GANCHO PAWL DRIVE', partNumber: '532404845' },
  { family: 'Giro zero', model: 'MZ54 ROPS', name: 'ASSENTO', partNumber: '501580402', pnc: '96769600100' },
  { family: 'Giro zero', model: 'Z248F', name: 'WASHER WINGED', partNumber: '501051801' },
  { family: 'Giro zero', model: 'Z460', name: 'ROLAMENTO FLANGED PLASTIC', partNumber: '501603701' },
  { family: 'Giro zero', model: 'Z560X', name: 'SCREW SHOULDER', partNumber: '501064101' },
  { family: 'Motores', model: '104M02-0002-F1', name: 'SEALANT LIQUID', partNumber: '100106' },
  { family: 'Motores', model: '12J902-0118-01', name: 'MANUAL REPAIR', partNumber: '270962' },
  { family: 'Motores', model: 'FR691V-AS29', name: 'JUNTA GASKET CARBURETOR PIPE', partNumber: '110607016' },
  { family: 'Motores', model: 'FX921V-ES06', name: 'JUNTA GASKET', partNumber: '110092056' },
  { family: 'Motores', model: 'HS166', name: 'FREIO ENGINE BRAKE KIT', partNumber: '529352801' },
  { family: 'Motores', model: 'HS452', name: 'PLACA PUSH ROD GUIDE PLATE', partNumber: '529458701' },
  { family: 'Motores', model: 'HS608', name: 'SOLENÓIDE SOLENOID VALVE', partNumber: '529458201' },
  { family: 'Motores', model: 'HV586AE', name: 'PARAFUSO BOLT', partNumber: '531146988' },
  { family: 'Motores', model: 'HV764', name: 'PLACA PUSH ROD GUIDE PLATE', partNumber: '529458901' },
  { family: 'Motosserras', model: '125', name: 'ROLAMENTO', partNumber: '514183301' },
  { family: 'Motosserras', model: '135 Mark II', name: 'CONJ SILENCIADOR', partNumber: '501266203' },
  { family: 'Motosserras', model: '272 XP', name: 'CORDA DE PARTIDA', partNumber: '501201502' },
  { family: 'Motosserras', model: '281 XP', name: 'CORDA DE PARTIDA', partNumber: '501201502' },
  { family: 'Motosserras', model: '288 XP', name: 'CORDA DE PARTIDA', partNumber: '501201502' },
  { family: 'Motosserras', model: '353', name: 'CONJ DA VENTILAÇÃO DO DEPÓSITO', partNumber: '501152901' },
  { family: 'Motosserras', model: '365 Special', name: 'CONJ DA VENTILAÇÃO DO DEPÓSITO', partNumber: '501152901' },
  { family: 'Motosserras', model: '372 XP', name: 'CONJ DA VENTILAÇÃO DO DEPÓSITO', partNumber: '501152901' },
  { family: 'Multifuncionais', model: '525LK', name: 'APARAFUSADORA CARBURETTOR', partNumber: '501600203' },
  { family: 'Outros / Não identificado', model: 'K46 BT', name: 'MOTOR SHAFT', partNumber: '502451701' },
  { family: 'Podadores', model: '525P5S', name: 'CHAVE COMBINADA COMBINATION WRENCH', partNumber: '501691701' },
  { family: 'Pulverizadores', model: '320SM 20L', name: 'ACCIONADOR', partNumber: '531147811' },
  { family: 'Pulverizadores', model: '321S25', name: 'LOCK NUT STOVER M6', partNumber: '503222007' },
  { family: 'Roçadeiras', model: '128R', name: 'CHAVE COMBI WRENCH BLADE', partNumber: '502114602', pnc: '952711949' },
  { family: 'Roçadeiras', model: '131R', name: 'TAMPA CRANKCASE COVER', partNumber: '536029401', pnc: '967843001' },
  { family: 'Roçadeiras', model: '142R', name: 'SPANNER OPEN ENDED', partNumber: '501314001' },
  { family: 'Roçadeiras', model: '143RII', name: 'CARBURADOR CARBURETTOR', partNumber: '587106701', pnc: '967332904' },
  { family: 'Roçadeiras', model: '143RS', name: 'FERRAMENTA', partNumber: '501192201' },
  { family: 'Roçadeiras', model: '226R', name: 'FERRAMENTA', partNumber: '501192201' },
  { family: 'Roçadeiras', model: '321R', name: 'ROLAMENTO DE ESFERAS 6001 C3', partNumber: '503251701' },
  { family: 'Roçadeiras', model: '545RX', name: 'PLACA DE DESGASTE', partNumber: '501015501' },
  { family: 'Sopradores', model: '125B', name: 'WAVE WASHER ANILHA', partNumber: '530015147' },
  { family: 'Sopradores', model: '345BT', name: 'PUNHO DE ARRANQUE', partNumber: '501929201' },
  { family: 'Sopradores', model: '578BTF', name: 'METADE DE PEGA LEFT', partNumber: '502244801' },
  { family: 'Tratores', model: 'R 316TX', name: 'ANILHA', partNumber: '295700601' },
  { family: 'Tratores', model: 'TS 114', name: 'PARAFUSO TORX PAN HEAD', partNumber: '503206420', pnc: '970622502' },
  { family: 'Tratores', model: 'TS 217Tm', name: 'PEDAL DE BORRACHA', partNumber: '531147581' },
  { family: 'Tratores', model: 'TS 254G', name: 'CORREIA DE SUPORTE HARNESS DASH', partNumber: '501132901' },
];

function normalizedName(value: string): string {
  return normalizeIdentifier(value);
}

async function seed() {
  const tenant = await prisma.tenant.create({ data: { name: 'CI Search Gate' } });
  const categories = new Map<string, string>();
  const documents = new Map<string, string>();

  for (const fixture of FIXTURES) {
    let categoryId = categories.get(fixture.family);
    if (!categoryId) {
      const category = await prisma.category.create({ data: { name: fixture.family, tenantId: tenant.id } });
      categoryId = category.id;
      categories.set(fixture.family, categoryId);
    }

    const docKey = `${fixture.family}|${fixture.model}|${fixture.pnc || ''}`;
    let documentId = documents.get(docKey);
    if (!documentId) {
      const document = await prisma.document.create({
        data: {
          filename: `CI ${fixture.model}.pdf`,
          url: `ci://${normalizeIdentifier(fixture.model)}`,
          status: 'COMPLETED',
          processingStage: 'READY_WITHOUT_EMBEDDINGS',
          manufacturer: 'Husqvarna',
          model: fixture.model,
          pnc: fixture.pnc || null,
          tenantId: tenant.id,
          categoryId,
          reviewStatus: 'READY',
        },
      });
      documentId = document.id;
      documents.set(docKey, documentId);
    }

    await prisma.part.create({
      data: {
        documentId,
        manufacturer: 'Husqvarna',
        normalizedManufacturer: 'HUSQVARNA',
        model: fixture.model,
        normalizedModel: normalizeIdentifier(fixture.model),
        pnc: fixture.pnc || null,
        normalizedPnc: fixture.pnc ? normalizeIdentifier(fixture.pnc) : null,
        universalAcrossPnc: false,
        section: 'CI GOLDEN',
        position: '1',
        name: fixture.name,
        normalizedName: normalizedName(fixture.name),
        alternativeNames: [],
        partNumber: fixture.partNumber,
        normalizedPartNumber: normalizeIdentifier(fixture.partNumber),
        page: 1,
        searchText: `${fixture.name} ${fixture.model} ${fixture.pnc || ''} ${fixture.partNumber}`,
        active: true,
      },
    });
  }

  return tenant.id;
}

async function main() {
  if (FIXTURES.length !== 50) throw new Error(`Gate CI deve ter exatamente 50 casos; recebeu ${FIXTURES.length}.`);
  const tenantId = await seed();
  let top1 = 0;
  let recall5 = 0;
  const failures: string[] = [];

  for (const fixture of FIXTURES) {
    const query = `${fixture.name} ${fixture.model}`;
    const fallback = buildFallbackIntent(query);
    const intent = { ...fallback, model: fixture.model, pnc: fixture.pnc || fallback.pnc, partDescription: fixture.name };
    const candidates = await PartSearchService.semantic(tenantId, query, intent);
    const expected = normalizeIdentifier(fixture.partNumber);
    const returned = candidates.slice(0, 5).map(candidate => normalizeIdentifier(candidate.partNumber));
    if (returned[0] === expected) top1 += 1;
    if (returned.includes(expected)) recall5 += 1;
    else failures.push(`${fixture.family} / ${fixture.model} / ${fixture.name} -> ${fixture.partNumber}; retornou ${returned.join(', ') || 'nada'}`);
  }

  const top1Rate = top1 / FIXTURES.length;
  const recall5Rate = recall5 / FIXTURES.length;
  console.log(`CI search gate · casos=${FIXTURES.length} · Top-1=${(top1Rate * 100).toFixed(1)}% · Recall@5=${(recall5Rate * 100).toFixed(1)}%`);
  for (const failure of failures) console.error(`MISS: ${failure}`);

  if (top1Rate < 0.90 || recall5Rate < 0.98) {
    throw new Error('Regression gate de busca falhou: mínimo Top-1 90% e Recall@5 98%.');
  }
}

main()
  .catch(error => {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 2;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
