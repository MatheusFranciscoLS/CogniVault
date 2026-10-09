import { OfficialSourceCacheService, buildOfficialSourceCacheKey } from './official-source-cache.service';
import type { PublicMachineUse } from '../utils/husqvarna-public-specs';
import { fetchPublicMachineUse, publicSpecsArticleId } from './husqvarna-public-specs-source';

export { publicSpecsArticleId };

const FRESH_MS = 7 * 24 * 3600 * 1000;
const STALE_MS = 30 * 24 * 3600 * 1000;

/**
 * Uso recomendado da máquina segundo o SITE PÚBLICO da Husqvarna (mesma API do vista explodida, loja `hbd-br-pt-br`, sem login; o robots.txt
 * libera `/`). Alimenta o orçamento de máquina. Preço nunca vem daqui. Ver `utils/husqvarna-public-specs.ts` para o que se aceita.
 */
export class HusqvarnaPublicSpecsService {
  /** `null` quando o site não tem a máquina ou está fora do ar. Nunca lança: o orçamento sai completo sem isto. */
  static async useForPnc(pncInput: string | null | undefined): Promise<PublicMachineUse | null> {
    const articleId = publicSpecsArticleId(pncInput);
    if (!articleId) return null;
    const key = buildOfficialSourceCacheKey('HUSQVARNA_PUBLIC', 'MACHINE_USE', articleId);
    try {
      const hit = await OfficialSourceCacheService.get<PublicMachineUse | { absent: true }>(
        key,
        { source: 'HUSQVARNA_PUBLIC', resourceType: 'MACHINE_USE', resourceId: articleId, freshMs: FRESH_MS, staleMs: STALE_MS },
        async () => (await fetchPublicMachineUse(articleId)) ?? { absent: true },
      );
      const value = hit.value;
      return value && !('absent' in value) ? value : null;
    } catch (error) {
      console.warn(`[Husqvarna site público] uso da máquina ${articleId} indisponível: ${error instanceof Error ? error.message : String(error)}`);
      return null;
    }
  }
}
