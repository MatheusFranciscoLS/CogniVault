import { prisma } from '../config/prisma';
import { normalizeIdentifier } from '../utils/normalize';
import { discoverOfficialModelPncs } from './husqvarna-variant-compatibility.service';

export type PortfolioCoverageSource = 'LOCAL_IPL' | 'OFFICIAL_CACHE' | 'UNVERIFIED';

export type PortfolioCoverageItem = {
  model: string;
  normalizedModel: string;
  sources: string[];
  coverage: PortfolioCoverageSource;
  officialPncs?: string[];
};

export type PortfolioCoverageSnapshot = {
  totalKnownModels: number;
  localIplModels: number;
  officialCachedModels: number;
  uncoveredModels: number;
  coveragePercent: number;
  items: PortfolioCoverageItem[];
};

const PREFIXES = /^(?:ROC(?:ADEIRA)?|MS|MOTOSSERRA|SOPRADOR|TRATOR|CORTADOR|CORTADORA|POD(?:ADOR)?|ATOM(?:IZADOR)?|PULVERIZADOR|AM|AUTOMOWER|HUSQVARNA|MOTOR)\.?\s*/i;
const TRAILING_YEAR = /(?:\s+|-)(?:19|20)\d{2}$/;

export function normalizePortfolioModel(value: string): string {
  return normalizeIdentifier(value)
    .replace(/^HUSQVARNA/, '')
    .replace(/^MOTOR/, '');
}

export function extractCommercialApplicationModels(application: string): string[] {
  if (!application.trim()) return [];
  const found = new Map<string, string>();
  for (const raw of application.split(/[\/,;|+]+/)) {
    let value = raw
      .replace(/[()]/g, ' ')
      .replace(/\s+/g, ' ')
      .trim()
      .replace(PREFIXES, '')
      .replace(TRAILING_YEAR, '')
      .trim();
    value = value.replace(/^(?:ROC|MS|POD|ATOM)\.\s*/i, '').trim();
    if (value.length < 3 || value.length > 48 || !/\d/.test(value)) continue;
    if (/^(?:19|20)\d{2}$/.test(value)) continue;
    const normalized = normalizePortfolioModel(value);
    if (normalized.length < 3) continue;
    if (!found.has(normalized)) found.set(normalized, value);
  }
  return [...found.values()];
}

function preferredDisplay(current: string | undefined, candidate: string): string {
  if (!current) return candidate;
  if (candidate.length < current.length && candidate.length >= 3) return candidate;
  return current;
}

export class PortfolioCoverageService {
  static async snapshot(tenantId: string): Promise<PortfolioCoverageSnapshot> {
    const [localRows, applicationRows, officialRows] = await Promise.all([
      prisma.part.findMany({
        where: { active: true, document: { tenantId, archivedAt: null, status: 'COMPLETED' } },
        select: { model: true, normalizedModel: true },
        distinct: ['normalizedModel'],
        take: 5_000,
      }),
      prisma.masterPartSection.findMany({
        where: { tenantId, application: { not: null } },
        select: { application: true },
        distinct: ['application'],
        take: 20_000,
      }),
      prisma.officialSourceCache.findMany({
        where: {
          source: 'HUSQVARNA',
          resourceType: 'MODEL_VARIANTS',
          staleUntil: { gt: new Date() },
        },
        select: { resourceId: true, payload: true },
        take: 10_000,
      }),
    ]);

    const models = new Map<string, { display: string; sources: Set<string>; local: boolean }>();
    for (const row of localRows) {
      const normalized = normalizePortfolioModel(row.normalizedModel || row.model);
      if (!normalized) continue;
      const current = models.get(normalized) || { display: row.model, sources: new Set<string>(), local: false };
      current.display = preferredDisplay(current.display, row.model);
      current.sources.add('IPL local');
      current.local = true;
      models.set(normalized, current);
    }

    for (const row of applicationRows) {
      for (const display of extractCommercialApplicationModels(row.application || '')) {
        const normalized = normalizePortfolioModel(display);
        if (!normalized) continue;
        const current = models.get(normalized) || { display, sources: new Set<string>(), local: false };
        current.display = preferredDisplay(current.display, display);
        current.sources.add('Cadastro comercial');
        models.set(normalized, current);
      }
    }

    const official = new Map<string, string[]>();
    for (const row of officialRows) {
      const normalized = normalizePortfolioModel(row.resourceId);
      if (!normalized) continue;
      let pncs: string[] = [];
      const payload = row.payload;
      if (payload && typeof payload === 'object' && !Array.isArray(payload)) {
        const raw = (payload as Record<string, unknown>).value;
        if (Array.isArray(raw)) pncs = raw.map(value => normalizeIdentifier(String(value || ''))).filter(value => /^\d{8,14}$/.test(value));
      }
      if (pncs.length) official.set(normalized, [...new Set(pncs)]);
    }

    const items: PortfolioCoverageItem[] = [...models.entries()]
      .map(([normalizedModel, entry]) => {
        const officialPncs = official.get(normalizedModel) || [];
        const coverage: PortfolioCoverageSource = entry.local
          ? 'LOCAL_IPL'
          : officialPncs.length
            ? 'OFFICIAL_CACHE'
            : 'UNVERIFIED';
        return {
          model: entry.display,
          normalizedModel,
          sources: [...entry.sources],
          coverage,
          ...(officialPncs.length ? { officialPncs } : {}),
        };
      })
      .sort((a, b) => {
        const priority = (value: PortfolioCoverageSource) => value === 'UNVERIFIED' ? 0 : value === 'OFFICIAL_CACHE' ? 1 : 2;
        return priority(a.coverage) - priority(b.coverage) || a.model.localeCompare(b.model, 'pt-BR');
      });

    const localIplModels = items.filter(item => item.coverage === 'LOCAL_IPL').length;
    const officialCachedModels = items.filter(item => item.coverage === 'OFFICIAL_CACHE').length;
    const uncoveredModels = items.filter(item => item.coverage === 'UNVERIFIED').length;
    const covered = localIplModels + officialCachedModels;
    return {
      totalKnownModels: items.length,
      localIplModels,
      officialCachedModels,
      uncoveredModels,
      coveragePercent: items.length ? covered / items.length : 0,
      items,
    };
  }

  static async refreshOfficialGaps(tenantId: string, maxModels = 500): Promise<PortfolioCoverageSnapshot> {
    const before = await this.snapshot(tenantId);
    const gaps = before.items.filter(item => item.coverage === 'UNVERIFIED').slice(0, Math.max(1, Math.min(2_000, maxModels)));
    for (let index = 0; index < gaps.length; index += 3) {
      const batch = gaps.slice(index, index + 3);
      await Promise.all(batch.map(item => discoverOfficialModelPncs(item.model).catch(() => [])));
    }
    return this.snapshot(tenantId);
  }
}
