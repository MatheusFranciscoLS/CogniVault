import { normalizeIdentifier } from '../utils/normalize';
import { HusqvarnaOfficialDetailService } from './husqvarna-official-detail.service';
import { HusqvarnaReplacementHistoryService } from './husqvarna-replacement-history.service';
import { HusqvarnaScraperService, type HusqvarnaLivePart } from './husqvarna-scraper.service';
import { buildOfficialSourceCacheKey, OfficialSourceCacheService } from './official-source-cache.service';

// Preserve the existing live-data response used by global search and the drawer.
export class HusqvarnaLivePartService {
  static async getPart(partNumberInput: string): Promise<HusqvarnaLivePart | null> {
    const code = normalizeIdentifier(partNumberInput);
    if (!/^\d{6,14}$/.test(code)) return null;

    const key = buildOfficialSourceCacheKey('HUSQVARNA', 'LIVE_PART', code);
    const cached = await OfficialSourceCacheService.get<HusqvarnaLivePart>(
      key,
      {
        source: 'HUSQVARNA',
        resourceType: 'LIVE_PART',
        resourceId: code,
        // Substituições e disponibilidade de dados oficiais merecem revalidação
        // mais frequente que detalhes de produto estáticos.
        freshMs: 60 * 60 * 1000,
      },
      async () => {
        const [detail, history] = await Promise.all([
          HusqvarnaOfficialDetailService.getSparePartDetails(code),
          HusqvarnaReplacementHistoryService.getReplacementHistory(code).catch(() => null),
        ]);
        const hasHistory = Boolean(history?.history.length);
        const fallback = !detail || !hasHistory
          ? await HusqvarnaScraperService.fetchLiveData(code).catch(() => null)
          : null;
        if (!detail && !fallback) return null;

        return {
          name: detail?.name || fallback!.name,
          shortName: detail?.name || fallback?.shortName,
          articleNumberFormatted: detail?.partNumber || fallback?.articleNumberFormatted,
          imageUrl: detail?.imageUrl || fallback?.imageUrl,
          specifications: detail?.specifications || fallback?.specifications,
          originalPartUrl: detail?.url || fallback?.originalPartUrl
            || `https://portal.husqvarnagroup.com/br/spare-parts/?part=${code}`,
          // An official "latest" result must also suppress a stale HTML replacement.
          replacedBy: hasHistory ? history?.replacedBy || undefined : fallback?.replacedBy,
          fitsTo: detail?.fitsTo || fallback?.fitsTo || [],
        };
      },
    );

    return cached.value;
  }
}
