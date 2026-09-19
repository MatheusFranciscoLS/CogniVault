import {
  briggsManualSearchEndpoint,
  parseBriggsManuals,
  type BriggsManualsResult,
} from '../utils/briggs-manuals';
import { formatBriggsModelForSearch } from '../utils/engine-model';
import { OfficialSourceCacheService, buildOfficialSourceCacheKey } from './official-source-cache.service';

const TIMEOUT_MS = 8_000;

/**
 * Catálogo de peças do motor Briggs, direto do índice de manuais deles.
 *
 * O botão antigo levava o atendente à página de busca e o soltava numa lista de
 * 16 itens quase idênticos, com os dois `PARTS MANUAL` no fim. Aqui a resposta
 * já vem resolvida: o link do PDF da lista de peças, inglês primeiro.
 *
 * **Custo zero, e não é scraping.** `/_hcms/api/manual-search` é o mesmo
 * endpoint JSON que a página da Briggs consome, sem chave e sem login — mesmo
 * padrão do GraphQL público do Portal Husqvarna. Ver `utils/briggs-manuals.ts`
 * para o formato e para por que o idioma não é deduzido.
 */

/**
 * Cache longo de propósito: a lista de manuais de um motor não muda em semanas.
 * Persistente (Postgres) em vez de LRU em memória porque o Render free reinicia
 * com frequência, e este dado é justamente o que não vale reconsultar a cada
 * restart. `stale` de 30 dias mantém o botão funcionando no balcão mesmo se a
 * Briggs estiver fora do ar.
 */
const FRESH_MS = 24 * 60 * 60 * 1000;
const STALE_MS = 30 * 24 * 60 * 60 * 1000;

const EMPTY = (model: string): BriggsManualsResult => ({ model, partsManuals: [], hasEnglish: false });

/** A consulta em si, sem cache. */
async function fetchFromBriggs(model: string): Promise<BriggsManualsResult | null> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    const response = await fetch(briggsManualSearchEndpoint(model), {
      signal: controller.signal,
      headers: {
        Accept: 'application/json',
        'Accept-Language': 'pt-BR,pt;q=0.9,en;q=0.7',
      },
    });
    if (!response.ok) return null;
    return parseBriggsManuals(model, await response.json());
  } finally {
    clearTimeout(timeout);
  }
}

export class BriggsManualsService {
  /**
   * Resolve as listas de peças de um modelo de motor Briggs.
   *
   * Aceita o modelo como o catálogo guarda (`Motor Briggs 104M02-0002-F1`,
   * às vezes com sufixo entre parênteses): `formatBriggsModelForSearch` já
   * normaliza para o formato que a Briggs exige, inclusive o zero à esquerda
   * dos modelos de 5 dígitos.
   *
   * Nunca lança: sem catálogo é um botão que não aparece, não uma tela de erro
   * no meio do atendimento.
   */
  static async forModel(rawModel: string | null | undefined): Promise<BriggsManualsResult> {
    const model = formatBriggsModelForSearch(rawModel);
    if (!model) return EMPTY(String(rawModel ?? ''));

    const key = buildOfficialSourceCacheKey('BRIGGS', 'PARTS_MANUALS', model);

    try {
      const cached = await OfficialSourceCacheService.get<BriggsManualsResult>(
        key,
        {
          source: 'BRIGGS',
          resourceType: 'PARTS_MANUALS',
          resourceId: model,
          freshMs: FRESH_MS,
          staleMs: STALE_MS,
        },
        () => fetchFromBriggs(model),
      );

      if (cached.value) return cached.value;
    } catch (cacheError) {
      // O cache mora no Postgres, e no plano free ele pausa e o Render
      // reinicia. Cache indisponível não pode fazer o botão desaparecer do
      // balcão: ele é otimização, não requisito. Segue sem cache.
      console.warn(
        `[Briggs] Cache indisponível para "${model}"; consultando direto.`,
        cacheError instanceof Error ? cacheError.message : cacheError,
      );
    }

    try {
      return (await fetchFromBriggs(model)) ?? EMPTY(model);
    } catch (error) {
      console.warn(
        `[Briggs] Não foi possível resolver a lista de peças de "${model}":`,
        error instanceof Error ? error.message : error,
      );
      return EMPTY(model);
    }
  }
}
