import { prisma } from '../config/prisma';
import { SearchRadarItem, SearchRadarStatus } from './search-quality-radar';
import { buildFallbackIntent } from './chat-reliability';

export class SearchIntelligenceService {
  /**
   * Identifica lacunas no catálogo baseado em buscas que frequentemente
   * resultam em NOT_FOUND, AMBIGUOUS ou outras pendências nos últimos 30 dias.
   *
   * @param tenantId ID do tenant
   * @param limit Limite de resultados
   * @returns Lista de lacunas ordenadas por volume de buscas
   */
  static async identifyCatalogGaps(tenantId: string, limit: number = 20): Promise<SearchRadarItem[]> {
    const gaps = await prisma.searchHistory.groupBy({
      by: ['query', 'pnc', 'status'],
      where: {
        tenantId,
        status: { in: ['NOT_FOUND', 'AMBIGUOUS', 'PNC_REQUIRED', 'MODEL_REQUIRED', 'PART_REQUIRED'] },
        createdAt: { gte: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000) },
      },
      _count: {
        id: true,
      },
      _max: {
        createdAt: true,
      },
      orderBy: {
        _count: {
          id: 'desc',
        },
      },
      take: limit,
    });

    return gaps.map(gap => {
      const intent = buildFallbackIntent(gap.query);
      return {
        query: gap.query,
        pnc: gap.pnc || intent.pnc || null,
        model: intent.model || null,
        partDescription: intent.partDescription || null,
        status: gap.status as SearchRadarStatus,
        count: gap._count.id,
        lastSeen: (gap._max.createdAt || new Date()).toISOString(),
      };
    });
  }
}
