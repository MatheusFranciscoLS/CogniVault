import { Response } from 'express';
import { Prisma } from '@prisma/client';
import { prisma } from '../config/prisma';
import { AuthenticatedRequest } from '../middleware/auth.middleware';
import { normalizeIdentifier, normalizeText } from '../utils/normalize';
import { AuditService } from '../services/audit.service';
import { HusqvarnaScraperService } from '../services/husqvarna-scraper.service';

const HUSQVARNA_SPARE_PARTS_URL = 'https://www.husqvarna.com/br/pecas-sobressalentes/';
const ONE_YEAR_MS = 365 * 24 * 60 * 60 * 1000;
const SEARCH_DEDUP_MS = 2 * 60 * 1000;

function cleanCode(value: unknown): string {
  return String(value || '').replace(/[^A-Za-z0-9]/g, '').toUpperCase();
}

function scoreCommercialPart(
  query: string,
  item: {
    normalizedNumber: string;
    name: string;
    description: string | null;
    brand: string | null;
    sections: Array<{
      application: string | null;
      reference: string | null;
      productCategory: string | null;
      section: string;
    }>;
  },
): number {
  const normalizedCode = normalizeIdentifier(query);
  const normalizedQuery = normalizeText(query);
  const tokens = normalizedQuery.split(/\s+/).filter(token => token.length >= 2);

  let score = 0;
  if (normalizedCode && item.normalizedNumber === normalizedCode) score += 2000;
  else if (normalizedCode && item.normalizedNumber.startsWith(normalizedCode)) score += 900;
  else if (normalizedCode && item.normalizedNumber.includes(normalizedCode)) score += 500;

  const name = normalizeText(item.name);
  const description = normalizeText(item.description || '');
  const sectionText = normalizeText(item.sections.map(section => [
    section.application,
    section.reference,
    section.productCategory,
    section.section,
  ].filter(Boolean).join(' ')).join(' '));
  const haystack = `${name} ${description} ${sectionText}`;

  if (normalizedQuery && name === normalizedQuery) score += 800;
  else if (normalizedQuery && name.includes(normalizedQuery)) score += 500;
  if (normalizedQuery && sectionText.includes(normalizedQuery)) score += 450;
  if (tokens.length && tokens.every(token => haystack.includes(token))) score += 350;
  score += tokens.filter(token => haystack.includes(token)).length * 35;

  return score;
}

export class WorkIntelligenceController {
  async masterSearch(req: AuthenticatedRequest, res: Response): Promise<void> {
    if (!req.user) return;

    const query = String(req.query.q || '').trim();
    const selectedSection = String(req.query.section || '').trim();

    if (query.length < 2) {
      res.json({ parts: [], sections: [] });
      return;
    }

    const normalizedCode = normalizeIdentifier(query);
    const orFilters: Prisma.MasterPartWhereInput[] = [
      { name: { contains: query, mode: 'insensitive' } },
      { description: { contains: query, mode: 'insensitive' } },
      { brand: { contains: query, mode: 'insensitive' } },
      {
        sections: {
          some: {
            OR: [
              { application: { contains: query, mode: 'insensitive' } },
              { reference: { contains: query, mode: 'insensitive' } },
              { productCategory: { contains: query, mode: 'insensitive' } },
            ],
          },
        },
      },
    ];

    if (normalizedCode.length >= 2) {
      orFilters.unshift({ normalizedNumber: { contains: normalizedCode } });
    }

    try {
      const candidates = await prisma.masterPart.findMany({
        where: {
          tenantId: req.user.tenantId,
          ...(selectedSection ? { sections: { some: { section: selectedSection } } } : {}),
          OR: orFilters,
        },
        include: { sections: { orderBy: { section: 'asc' } } },
        take: 180,
      });

      const ranked = candidates
        .map(item => ({ item, score: scoreCommercialPart(query, item) }))
        .sort((a, b) => b.score - a.score || a.item.name.localeCompare(b.item.name, 'pt-BR'))
        .slice(0, 50)
        .map(({ item, score }) => ({
          id: item.id,
          partNumber: item.partNumber,
          normalizedNumber: item.normalizedNumber,
          name: item.name,
          application: item.description || item.brand,
          price: item.price,
          ean: item.ean,
          ncm: item.ncm,
          classCode: item.category,
          priceSections: [...new Set(item.sections.map(section => section.section))],
          references: [...new Set(item.sections.map(section => section.reference).filter((value): value is string => Boolean(value)))],
          productCategories: [...new Set(item.sections.map(section => section.productCategory).filter((value): value is string => Boolean(value)))],
          score,
          source: 'PRICE_LIST' as const,
        }));

      const availableSections = await prisma.masterPartSection.groupBy({
        by: ['section'],
        where: { tenantId: req.user.tenantId },
        _count: { _all: true },
        orderBy: { section: 'asc' },
      });

      res.json({
        parts: ranked,
        sections: availableSections.map(section => ({ name: section.section, count: section._count._all })),
      });
    } catch (error) {
      console.error('❌ Erro ao pesquisar lista de preços:', error);
      res.status(500).json({ error: 'Não foi possível pesquisar a lista de preços.', parts: [], sections: [] });
    }
  }

  async recordSearchUsage(req: AuthenticatedRequest, res: Response): Promise<void> {
    if (!req.user) return;

    const query = String(req.body?.query || '').trim().slice(0, 500);
    const partId = typeof req.body?.partId === 'string' ? req.body.partId.trim() : '';
    const resultCode = cleanCode(req.body?.partNumber);
    const resultLabel = String(req.body?.name || '').trim().slice(0, 500) || resultCode;
    const resultModel = String(req.body?.model || '').trim().slice(0, 200) || null;
    const resultPnc = String(req.body?.pnc || '').trim().slice(0, 200) || null;
    const sourceFilename = String(req.body?.sourceFilename || '').trim().slice(0, 500) || null;

    if (!query || !resultCode) {
      res.status(400).json({ error: 'Consulta e código são obrigatórios.' });
      return;
    }

    try {
      const recent = await prisma.searchHistory.findFirst({
        where: {
          tenantId: req.user.tenantId,
          userId: req.user.id,
          resultCode,
          query,
          createdAt: { gte: new Date(Date.now() - SEARCH_DEDUP_MS) },
        },
        select: { id: true },
      });

      if (!recent) {
        let validPartId: string | undefined;
        if (partId) {
          const part = await prisma.part.findFirst({
            where: {
              id: partId,
              active: true,
              document: { tenantId: req.user.tenantId, archivedAt: null },
            },
            select: { id: true },
          });
          validPartId = part?.id;
        }

        await prisma.searchHistory.create({
          data: {
            tenantId: req.user.tenantId,
            userId: req.user.id,
            query,
            status: 'FOUND',
            resultPartId: validPartId,
            resultLabel,
            resultCode,
            resultModel,
            resultPnc,
            sourceFilename,
          },
        });
      }

      res.status(204).end();
    } catch (error) {
      console.error('❌ Erro ao registrar consulta operacional:', error);
      res.status(204).end();
    }
  }

  async workContext(req: AuthenticatedRequest, res: Response): Promise<void> {
    if (!req.user) return;

    const partNumber = cleanCode(req.params.code);
    const normalizedPartNumber = normalizeIdentifier(partNumber);
    const model = String(req.query.model || '').trim();

    if (!normalizedPartNumber) {
      res.status(400).json({ error: 'Código da peça inválido.' });
      return;
    }

    try {
      const [location, masterPart, technicalPart, approvedVerification] = await Promise.all([
        prisma.partLocation.findUnique({
          where: { tenantId_normalizedPartNumber: { tenantId: req.user.tenantId, normalizedPartNumber } },
          select: { location: true, note: true, updatedAt: true, updatedBy: { select: { email: true } } },
        }),
        prisma.masterPart.findUnique({
          where: { tenantId_normalizedNumber: { tenantId: req.user.tenantId, normalizedNumber: normalizedPartNumber } },
          include: { sections: true },
        }),
        prisma.part.findFirst({
          where: {
            normalizedPartNumber,
            active: true,
            document: { tenantId: req.user.tenantId, archivedAt: null, status: 'COMPLETED' },
            ...(model ? { model: { contains: model, mode: 'insensitive' } } : {}),
          },
          select: { id: true, name: true, partNumber: true, model: true, pnc: true, document: { select: { filename: true } } },
        }),
        prisma.officialPartVerification.findFirst({
          where: {
            tenantId: req.user.tenantId,
            approvalStatus: 'APPROVED',
            OR: [
              { normalizedQueriedNumber: normalizedPartNumber },
              { normalizedCurrentNumber: normalizedPartNumber },
            ],
          },
          orderBy: { reviewedAt: 'desc' },
          select: { id: true, officialUrl: true, status: true, reviewedAt: true },
        }),
      ]);

      if (technicalPart) {
        const recent = await prisma.searchHistory.findFirst({
          where: {
            tenantId: req.user.tenantId,
            userId: req.user.id,
            resultCode: cleanCode(technicalPart.partNumber),
            createdAt: { gte: new Date(Date.now() - SEARCH_DEDUP_MS) },
          },
          select: { id: true },
        });
        if (!recent) {
          await prisma.searchHistory.create({
            data: {
              tenantId: req.user.tenantId,
              userId: req.user.id,
              query: model || cleanCode(technicalPart.partNumber),
              status: 'FOUND',
              resultPartId: technicalPart.id,
              resultLabel: technicalPart.name,
              resultCode: cleanCode(technicalPart.partNumber),
              resultModel: technicalPart.model,
              resultPnc: technicalPart.pnc,
              sourceFilename: technicalPart.document.filename,
            },
          });
        }
      }

      const history = model
        ? await prisma.searchHistory.findMany({
          where: {
            tenantId: req.user.tenantId,
            resultModel: { contains: model, mode: 'insensitive' },
            resultCode: { not: null },
          },
          orderBy: { createdAt: 'desc' },
          take: 1200,
          select: { resultCode: true, resultLabel: true, resultModel: true },
        })
        : [];

      const popularMap = new Map<string, { partNumber: string; name: string; model: string | null; count: number }>();
      for (const item of history) {
        const code = cleanCode(item.resultCode);
        if (!code || normalizeIdentifier(code) === normalizedPartNumber) continue;
        const key = normalizeIdentifier(code);
        const current = popularMap.get(key);
        if (current) current.count += 1;
        else popularMap.set(key, { partNumber: code, name: item.resultLabel || code, model: item.resultModel, count: 1 });
      }

      const popularParts = [...popularMap.values()].sort((a, b) => b.count - a.count).slice(0, 8);

      const currentUsages = await prisma.quoteUsage.findMany({
        where: {
          tenantId: req.user.tenantId,
          normalizedPartNumber,
          createdAt: { gte: new Date(Date.now() - ONE_YEAR_MS) },
        },
        distinct: ['sessionId'],
        take: 500,
        select: { sessionId: true },
      });

      const sessionIds = currentUsages.map(item => item.sessionId);
      const coUsage = sessionIds.length
        ? await prisma.quoteUsage.findMany({
          where: {
            tenantId: req.user.tenantId,
            sessionId: { in: sessionIds },
            normalizedPartNumber: { not: normalizedPartNumber },
          },
          select: { sessionId: true, normalizedPartNumber: true, partNumber: true, model: true },
        })
        : [];

      const togetherMap = new Map<string, { partNumber: string; model: string | null; sessions: Set<string> }>();
      for (const item of coUsage) {
        const current = togetherMap.get(item.normalizedPartNumber);
        if (current) current.sessions.add(item.sessionId);
        else togetherMap.set(item.normalizedPartNumber, {
          partNumber: cleanCode(item.partNumber),
          model: item.model,
          sessions: new Set([item.sessionId]),
        });
      }

      const togetherCodes = [...togetherMap.entries()]
        .sort((a, b) => b[1].sessions.size - a[1].sessions.size)
        .slice(0, 8);

      const togetherMasters = togetherCodes.length
        ? await prisma.masterPart.findMany({
          where: { tenantId: req.user.tenantId, normalizedNumber: { in: togetherCodes.map(([code]) => code) } },
          select: { normalizedNumber: true, name: true },
        })
        : [];
      const togetherNames = new Map(togetherMasters.map(item => [item.normalizedNumber, item.name]));

      const frequentlyTogether = togetherCodes.map(([code, item]) => ({
        partNumber: item.partNumber,
        name: togetherNames.get(code) || item.partNumber,
        model: item.model,
        count: item.sessions.size,
        percentage: sessionIds.length ? Math.round((item.sessions.size / sessionIds.length) * 100) : 0,
      }));

      const sources = [
        ...(technicalPart ? [{ type: 'CATALOG', label: 'CATÁLOGO', detail: technicalPart.document.filename }] : []),
        ...(masterPart ? [{ type: 'PRICE_LIST', label: 'LISTA DE PREÇOS', detail: masterPart.sections.map(section => section.section).join(' · ') }] : []),
        ...(approvedVerification ? [{ type: 'OFFICIAL', label: 'OFICIAL', detail: 'Conferido e aprovado' }] : []),
      ];

      res.json({
        context: {
          location: location ? {
            value: location.location,
            note: location.note,
            updatedAt: location.updatedAt,
            updatedBy: location.updatedBy?.email || null,
          } : null,
          popularParts,
          frequentlyTogether,
          togetherSampleSize: sessionIds.length,
          togetherReady: sessionIds.length >= 3,
          priceSections: masterPart?.sections.map(section => section.section) || [],
          application: masterPart?.description || masterPart?.brand || null,
          sources,
          officialFallback: {
            url: approvedVerification?.officialUrl || HUSQVARNA_SPARE_PARTS_URL,
            automatic: Boolean(approvedVerification),
          },
        },
      });
    } catch (error) {
      console.error('❌ Erro ao carregar inteligência da peça:', error);
      res.status(500).json({ error: 'Não foi possível carregar o contexto operacional da peça.' });
    }
  }

  async setLocation(req: AuthenticatedRequest, res: Response): Promise<void> {
    if (!req.user) return;

    const partNumber = cleanCode(req.params.code);
    const normalizedPartNumber = normalizeIdentifier(partNumber);
    const location = String(req.body?.location || '').trim();
    const note = String(req.body?.note || '').trim();

    if (!normalizedPartNumber || !partNumber) {
      res.status(400).json({ error: 'Código da peça inválido.' });
      return;
    }
    if (!location || location.length > 160 || note.length > 500) {
      res.status(400).json({ error: 'Informe uma localização de até 160 caracteres e observação de até 500.' });
      return;
    }

    try {
      const saved = await prisma.partLocation.upsert({
        where: { tenantId_normalizedPartNumber: { tenantId: req.user.tenantId, normalizedPartNumber } },
        update: { partNumber, location, note: note || null, updatedById: req.user.id },
        create: { tenantId: req.user.tenantId, normalizedPartNumber, partNumber, location, note: note || null, updatedById: req.user.id },
        select: { location: true, note: true, updatedAt: true },
      });

      AuditService.record({
        tenantId: req.user.tenantId,
        userId: req.user.id,
        action: 'PART_LOCATION_UPDATED',
        targetType: 'PART_NUMBER',
        targetId: partNumber,
        metadata: { location, note: note || null },
      });

      res.json({ location: saved });
    } catch (error) {
      console.error('❌ Erro ao salvar localização física:', error);
      res.status(500).json({ error: 'Não foi possível salvar a localização física.' });
    }
  }

  async recordQuoteUsage(req: AuthenticatedRequest, res: Response): Promise<void> {
    if (!req.user) return;

    const sessionId = String(req.body?.sessionId || '').trim().slice(0, 120);
    const rawItems = Array.isArray(req.body?.items) ? req.body.items.slice(0, 60) : [];
    const items = rawItems
      .map((raw: unknown) => {
        const item = raw as { partNumber?: unknown; model?: unknown };
        const partNumber = cleanCode(item.partNumber);
        const normalizedPartNumber = normalizeIdentifier(partNumber);
        if (!normalizedPartNumber) return null;
        return {
          partNumber,
          normalizedPartNumber,
          model: item.model ? String(item.model).trim().slice(0, 160) : null,
        };
      })
      .filter((item): item is { partNumber: string; normalizedPartNumber: string; model: string | null } => Boolean(item));

    if (!sessionId || !items.length) {
      res.status(400).json({ error: 'Sessão e itens são obrigatórios.' });
      return;
    }

    try {
      await prisma.$transaction(items.map(item => prisma.quoteUsage.upsert({
        where: {
          tenantId_sessionId_normalizedPartNumber: {
            tenantId: req.user!.tenantId,
            sessionId,
            normalizedPartNumber: item.normalizedPartNumber,
          },
        },
        update: { partNumber: item.partNumber, model: item.model, userId: req.user!.id },
        create: {
          tenantId: req.user!.tenantId,
          userId: req.user!.id,
          sessionId,
          normalizedPartNumber: item.normalizedPartNumber,
          partNumber: item.partNumber,
          model: item.model,
        },
      })));

      res.status(204).end();
    } catch (error) {
      console.error('❌ Erro ao registrar sinal de orçamento:', error);
      res.status(500).json({ error: 'Não foi possível registrar o uso do orçamento.' });
    }
  }

  async officialFallback(req: AuthenticatedRequest, res: Response): Promise<void> {
    if (!req.user) return;

    const query = String(req.query.q || '').trim();
    const clean = cleanCode(query);
    const looksLikeCode = clean.length >= 6 && clean.replace(/\D/g, '').length >= 5;

    if (!query) {
      res.status(400).json({ error: 'Informe o que deseja consultar.' });
      return;
    }

    try {
      if (looksLikeCode) {
        const livePart = await HusqvarnaScraperService.fetchLiveData(clean);
        if (livePart) {
          res.json({
            result: {
              status: 'FOUND',
              source: 'OFFICIAL',
              query,
              partNumber: clean,
              name: livePart.name,
              imageUrl: livePart.imageUrl || null,
              replacedBy: livePart.replacedBy ? cleanCode(livePart.replacedBy) : null,
              fitsTo: livePart.fitsTo || [],
              specifications: livePart.specifications || null,
              url: livePart.originalPartUrl || HUSQVARNA_SPARE_PARTS_URL,
            },
          });
          return;
        }
      }

      res.json({
        result: {
          status: 'REVIEW',
          source: 'ONLINE',
          query,
          url: HUSQVARNA_SPARE_PARTS_URL,
          message: looksLikeCode
            ? 'O código não pôde ser confirmado automaticamente. Abra o localizador oficial para conferir.'
            : 'O CogniVault não tem catálogo técnico suficiente para confirmar essa máquina. Continue no localizador oficial da Husqvarna usando o modelo/SKU informado.',
        },
      });
    } catch (error) {
      console.error('❌ Erro no fallback oficial:', error);
      res.json({
        result: {
          status: 'REVIEW',
          source: 'ONLINE',
          query,
          url: HUSQVARNA_SPARE_PARTS_URL,
          message: 'A consulta automática não respondeu. Use o localizador oficial da Husqvarna para continuar.',
        },
      });
    }
  }
}
