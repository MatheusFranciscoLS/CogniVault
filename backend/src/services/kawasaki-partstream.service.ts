import {
  KAWASAKI_ORIGIN,
  kawasakiAssembliesUrl,
  kawasakiAutocompleteUrl,
  kawasakiPartsUrl,
  kawasakiSearchUrl,
  parseKawasakiAssemblies,
  parseKawasakiAutocomplete,
  parseKawasakiModelIds,
  parseKawasakiParts,
  resolveKawasakiModel,
  type KawasakiAssembly,
  type KawasakiPart,
} from '../utils/kawasaki-partstream';
import { formatKawasakiModelForSearch } from '../utils/engine-model';
import { OfficialSourceCacheService, buildOfficialSourceCacheKey } from './official-source-cache.service';

const TIMEOUT_MS = 10_000;

/**
 * Catálogo de peças Kawasaki, do ARI PartStream.
 *
 * Ver `docs/KAWASAKI_ARI_PARTSTREAM.md` para o mapa da API e para a nota de
 * decisão sobre a app key. O desenho segue a regra que o dono deu para os três
 * fabricantes: *"se você não deu um retorno com o código, pelo menos dê um
 * retorno com a vista explodida para que o atendente verifique manualmente"*.
 *
 * Por isso `forModel` devolve **sempre** os conjuntos com `viewerUrl`, mesmo
 * quando não consegue ler as peças: a vista explodida é a saída, não o prêmio
 * de consolação.
 */

/**
 * Cache longo: o catálogo de um motor não muda em semanas, e é persistente
 * (Postgres) porque o Render free reinicia com frequência. Cada conjunto tem
 * cache próprio — o balcão abre um conjunto por atendimento, não os 17.
 */
const FRESH_MS = 7 * 24 * 60 * 60 * 1000;
const STALE_MS = 60 * 24 * 60 * 60 * 1000;

export type KawasakiModelCatalog = {
  /** Modelo como o balcão digitou, já normalizado (`FX921V-ES06`). */
  model: string;
  /** Nome completo que a Kawasaki usa (`FX921V-ES06 4 Stroke Engine FX921V`). */
  fullName: string | null;
  /** Conjuntos do motor, cada um com o link da vista explodida. */
  assemblies: KawasakiAssembly[];
  /** Busca da Kawasaki, para o atendente conferir à mão quando nada resolve. */
  lookupUrl: string;
  /**
   * Specs daquela série, quando o atendente digitou só a série.
   *
   * Não é erro: é a pergunta certa. `FR691V` tem 10 specs e cada um é um
   * catálogo de peças diferente — escolher por ele seria entregar código de
   * outro motor. O spec está na plaqueta, ao lado da série.
   */
  needsSpec: string[];
};

const EMPTY = (model: string): KawasakiModelCatalog => ({
  model,
  fullName: null,
  assemblies: [],
  lookupUrl: KAWASAKI_ORIGIN,
  needsSpec: [],
});

async function getJson(url: string): Promise<unknown> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    // Sem o parâmetro `cb`, o ARI responde JSON puro em vez de JSONP. É o que
    // torna a leitura do servidor trivial — a página deles usa JSONP só porque
    // chama de outro domínio.
    const response = await fetch(url, {
      signal: controller.signal,
      headers: {
        Accept: 'application/json',
        'Accept-Language': 'en-US,en;q=0.9',
        Referer: KAWASAKI_ORIGIN,
      },
    });
    if (!response.ok) return null;
    return await response.json();
  } finally {
    clearTimeout(timeout);
  }
}

export class KawasakiPartStreamService {
  /**
   * Conjuntos de um motor Kawasaki.
   *
   * Nunca lança: sem catálogo é um botão que não aparece, não uma tela de erro
   * no meio do atendimento.
   */
  static async forModel(rawModel: string | null | undefined): Promise<KawasakiModelCatalog> {
    const model = formatKawasakiModelForSearch(rawModel);
    if (!model) return EMPTY(String(rawModel ?? ''));

    const key = buildOfficialSourceCacheKey('KAWASAKI', 'MODEL_ASSEMBLIES', model);

    const loader = async (): Promise<KawasakiModelCatalog | null> => {
      const candidatos = parseKawasakiAutocomplete(await getJson(kawasakiAutocompleteUrl(model)));
      const escolha = resolveKawasakiModel(model, candidatos);

      // Série sem spec: devolve as opções em vez de escolher uma. Cai no cache
      // como resposta legítima — a pergunta é a mesma na próxima consulta.
      if (escolha.kind === 'NEEDS_SPEC') {
        return { ...EMPTY(model), needsSpec: escolha.options };
      }
      if (escolha.kind === 'NOT_FOUND') return null;

      const ids = parseKawasakiModelIds(await getJson(kawasakiSearchUrl(escolha.fullName)));
      if (!ids) return null;

      const assemblies = parseKawasakiAssemblies(
        await getJson(kawasakiAssembliesUrl(ids.modelId, ids.fullName, ids.modelGuid)),
      );

      return { model, fullName: ids.fullName, assemblies, lookupUrl: KAWASAKI_ORIGIN, needsSpec: [] };
    };

    try {
      const cached = await OfficialSourceCacheService.get<KawasakiModelCatalog>(
        key,
        { source: 'KAWASAKI', resourceType: 'MODEL_ASSEMBLIES', resourceId: model, freshMs: FRESH_MS, staleMs: STALE_MS },
        loader,
      );
      if (cached.value) return cached.value;
    } catch (cacheError) {
      // Cache no Postgres, que no plano free pausa. Ele é otimização, não
      // requisito: sem ele a consulta segue direto.
      console.warn(
        `[Kawasaki] Cache indisponível para "${model}"; consultando direto.`,
        cacheError instanceof Error ? cacheError.message : cacheError,
      );
    }

    try {
      return (await loader()) ?? EMPTY(model);
    } catch (error) {
      console.warn(
        `[Kawasaki] Não foi possível resolver o catálogo de "${model}":`,
        error instanceof Error ? error.message : error,
      );
      return EMPTY(model);
    }
  }

  /**
   * Peças de um conjunto.
   *
   * O `slug` vem da resposta de `forModel`, nunca montado à mão: ele carrega os
   * GUIDs do modelo e do conjunto, e inventá-los abriria outro motor.
   */
  static async partsForAssembly(slug: string): Promise<KawasakiPart[]> {
    const clean = String(slug || '').trim();
    // Guarda de forma antes de a chave entrar no cache ou na URL: só caminho de
    // motor Kawasaki, nada de `..` nem de outro host.
    if (!clean.startsWith('/Kawasaki_Engine/') || clean.includes('..') || /[<>"'\s]/.test(clean)) return [];

    const key = buildOfficialSourceCacheKey('KAWASAKI', 'ASSEMBLY_PARTS', clean);

    const loader = async (): Promise<KawasakiPart[] | null> => {
      const payload = await getJson(kawasakiPartsUrl(clean)) as { html?: unknown; model?: { error?: unknown } } | null;
      if (!payload || payload.model?.error) return null;
      const parts = parseKawasakiParts(String(payload.html ?? ''));
      return parts.length ? parts : null;
    };

    try {
      const cached = await OfficialSourceCacheService.get<KawasakiPart[]>(
        key,
        { source: 'KAWASAKI', resourceType: 'ASSEMBLY_PARTS', resourceId: clean.slice(-80), freshMs: FRESH_MS, staleMs: STALE_MS },
        loader,
      );
      if (cached.value?.length) return cached.value;
    } catch (cacheError) {
      console.warn(
        '[Kawasaki] Cache de peças indisponível; consultando direto.',
        cacheError instanceof Error ? cacheError.message : cacheError,
      );
    }

    try {
      return (await loader()) ?? [];
    } catch (error) {
      console.warn(
        '[Kawasaki] Não foi possível ler as peças do conjunto:',
        error instanceof Error ? error.message : error,
      );
      return [];
    }
  }
}
