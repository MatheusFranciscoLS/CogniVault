import {
  kohlerEngineUrl,
  parseKohlerDrawing,
  parseKohlerEngineHeader,
  parseKohlerGroups,
  parseKohlerHotspots,
  parseKohlerParts,
} from '../utils/kohler-catalog';
import { briggsManualSearchEndpoint, parseBriggsManuals } from '../utils/briggs-manuals';
import {
  kawasakiAssembliesUrl,
  kawasakiAutocompleteUrl,
  kawasakiSearchUrl,
  parseKawasakiAssemblies,
  parseKawasakiAutocomplete,
  parseKawasakiModelIds,
  resolveKawasakiModel,
} from '../utils/kawasaki-partstream';
import { fetchPublicSupportArticle } from '../services/husqvarna-public-site.service';

/**
 * Vigia dos fornecedores.
 *
 * A leitura do catálogo da Kohler é por HTML (regex), a da Kawasaki e da Briggs depende do desenho de uma API que não é nossa, e o site
 * público da Husqvarna é a segunda fonte da vista explodida. Qualquer um deles pode mudar sem aviso, e o sintoma seria o pior possível:
 * o balcão passaria a ver "sem catálogo" ou, pior, uma lista lida pela metade. Este vigia abre UM motor conhecido de cada fornecedor e confere
 * que a leitura ainda devolve o que sempre devolveu.
 *
 * NÃO usa banco nem segredo (só funções puras de leitura e a rede), por isso roda no GitHub Actions sem nenhuma configuração.
 *
 * Saída: 0 = tudo certo; 1 = ALGUM FORMATO MUDOU (abrir issue: o leitor precisa de ajuste); 2 = só indisponibilidade de rede/servidor
 * (aviso; não é defeito nosso e não abre issue).
 */

class FormatChanged extends Error {}

export type Check = { name: string; run: () => Promise<string> };
export type Outcome = { name: string; state: 'OK' | 'MUDOU' | 'FORA_DO_AR'; detail: string };

const TIMEOUT_MS = 20_000;
const UA = 'Mozilla/5.0 (compatible; CogniVault-canary/1.0)';

async function get(url: string, init: RequestInit = {}): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    const response = await fetch(url, { ...init, signal: controller.signal, headers: { 'User-Agent': UA, 'Accept-Language': 'en-US,en;q=0.9', ...(init.headers ?? {}) } });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    return response;
  } finally {
    clearTimeout(timer);
  }
}

/** Confere uma condição sobre o que foi LIDO: falhar aqui é "o formato mudou", não "caiu a rede". */
function expect(condition: unknown, message: string): asserts condition {
  if (!condition) throw new FormatChanged(message);
}

export const CHECKS: Check[] = [
  {
    name: 'Kohler · SV540-3212 (HTML do catálogo)',
    run: async () => {
      const html = await (await get(kohlerEngineUrl('SV540-3212', '101', '01'))).text();
      const header = parseKohlerEngineHeader(html);
      expect(header?.spec === 'SV540-3212', 'cabeçalho do motor (Spec/Description) não foi lido');
      const groups = parseKohlerGroups(html);
      expect(groups.length >= 10, `só ${groups.length} grupos lidos (esperado 10 ou mais)`);
      const parts = parseKohlerParts(html);
      expect(parts.length >= 3 && parts.every(part => part.partNumber), `só ${parts.length} peças lidas no grupo 01`);
      const drawing = parseKohlerDrawing(html);
      expect(drawing.imageUrl, 'a imagem do desenho do grupo não foi encontrada');
      const svg = await (await get(drawing.imageUrl, { headers: { Accept: 'image/svg+xml,*/*' } })).text();
      const read = parseKohlerHotspots(svg);
      expect(read.width && read.height, 'o SVG perdeu o viewBox (sem ele as posições não podem ser marcadas)');
      const inTable = new Set(parts.map(part => part.position));
      expect(read.hotspots.filter(spot => inTable.has(spot.position)).length >= 3, 'os números do desenho não casam mais com a tabela');
      return `${groups.length} grupos · ${parts.length} peças · ${read.hotspots.length} posições no desenho`;
    },
  },
  {
    name: 'Briggs · 104M02-0002-F1 (API de manuais + PDF)',
    run: async () => {
      const payload = await (await get(briggsManualSearchEndpoint('104M02-0002-F1'), { headers: { Accept: 'application/json' } })).json();
      const result = parseBriggsManuals('104M02-0002-F1', payload);
      expect(result.partsManuals.length > 0, 'a API não devolveu lista de peças (Illustrated Parts List)');
      expect(result.hasEnglish, 'a lista em inglês sumiu');
      const pdf = await get(result.partsManuals[0].url, { headers: { Range: 'bytes=0-7' } });
      const head = Buffer.from(await pdf.arrayBuffer()).subarray(0, 5).toString();
      expect(head === '%PDF-', `o visualizador não devolveu um PDF (veio "${head}")`);
      return `${result.partsManuals.map(item => item.languageLabel).join(' + ')} · PDF ok`;
    },
  },
  {
    name: 'Kawasaki · FS481V-CS55 (ARI PartStream)',
    run: async () => {
      const candidates = parseKawasakiAutocomplete(await (await get(kawasakiAutocompleteUrl('FS481V-CS55'))).json());
      const choice = resolveKawasakiModel('FS481V-CS55', candidates);
      expect(choice.kind === 'RESOLVED', `o modelo não resolveu (${choice.kind})`);
      const ids = parseKawasakiModelIds(await (await get(kawasakiSearchUrl(choice.fullName))).json());
      expect(ids, 'a busca do modelo não devolveu os identificadores');
      const assemblies = parseKawasakiAssemblies(await (await get(kawasakiAssembliesUrl(ids.modelId, ids.fullName, ids.modelGuid))).json());
      expect(assemblies.length >= 10, `só ${assemblies.length} conjuntos lidos (esperado 10 ou mais)`);
      expect(assemblies.some(item => /maintenance/i.test(item.name)), 'o conjunto de peças de manutenção sumiu (o atalho do balcão depende dele)');
      return `${assemblies.length} conjuntos`;
    },
  },
  {
    name: 'Husqvarna · site público (vista explodida do 345BT)',
    run: async () => {
      const article = await fetchPublicSupportArticle('970466903');
      expect(article, 'o site público não devolveu o artigo');
      expect(article.sections.length >= 1 && article.sections.every(section => section.articles?.length > 0), 'as seções da vista explodida vieram vazias');
      return `${article.sections.length} seções`;
    },
  },
];

export async function runWithRetry(check: Check, retryDelayMs = 4_000): Promise<Outcome> {
  let last = '';
  for (let attempt = 1; attempt <= 3; attempt += 1) {
    try {
      return { name: check.name, state: 'OK', detail: await check.run() };
    } catch (error) {
      // Mudança de formato não melhora tentando de novo: falha na hora.
      if (error instanceof FormatChanged) return { name: check.name, state: 'MUDOU', detail: error.message };
      last = error instanceof Error ? error.message : String(error);
      if (attempt < 3) await new Promise(resolve => setTimeout(resolve, retryDelayMs * attempt));
    }
  }
  return { name: check.name, state: 'FORA_DO_AR', detail: last || 'sem resposta' };
}

async function main() {
  const outcomes: Outcome[] = [];
  for (const check of CHECKS) {
    const outcome = await runWithRetry(check);
    outcomes.push(outcome);
    console.log(`${outcome.state === 'OK' ? 'OK        ' : outcome.state === 'MUDOU' ? 'MUDOU     ' : 'FORA DO AR '} ${outcome.name} — ${outcome.detail}`);
  }
  const changed = outcomes.filter(item => item.state === 'MUDOU');
  const down = outcomes.filter(item => item.state === 'FORA_DO_AR');
  console.log(`\n${outcomes.length - changed.length - down.length} ok · ${changed.length} mudaram · ${down.length} fora do ar`);
  if (changed.length) process.exitCode = 1;
  else if (down.length) process.exitCode = 2;
}

// Só roda como script: o teste importa `CHECKS` e `runWithRetry` sem disparar a rede.
if (require.main === module) {
  main().catch(error => {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  });
}
