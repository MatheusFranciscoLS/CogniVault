import { Response } from 'express';
import { AuthenticatedRequest } from '../middleware/auth.middleware';
import { prisma } from '../config/prisma';
import { normalizeIdentifier } from '../utils/normalize';
import { HusqvarnaOfficialDetailService } from '../services/husqvarna-official-detail.service';
import { HusqvarnaPortalGraphqlService } from '../services/husqvarna-portal-graphql.service';
import { HusqvarnaProductSearchService } from '../services/husqvarna-product-search.service';
import { HusqvarnaPublicSupportService } from '../services/husqvarna-public-support.service';
import { HusqvarnaReplacementHistoryService } from '../services/husqvarna-replacement-history.service';
import { HusqvarnaScraperService } from '../services/husqvarna-scraper.service';

function cleanNumericIdentifier(value: unknown): string {
  return normalizeIdentifier(String(value || ''));
}

function extractModel(productName: string): string {
  return productName.replace(/^HUSQVARNA\s+/i, '').trim();
}

async function buildScraperReplacementChain(code: string, firstReplacement?: string): Promise<Array<{ from: string; to: string }>> {
  const chain: Array<{ from: string; to: string }> = [];
  const seen = new Set<string>([code]);
  let from = code;
  let to = normalizeIdentifier(firstReplacement || '');

  for (let depth = 0; depth < 4; depth += 1) {
    if (!/^\d{6,14}$/.test(to) || seen.has(to)) break;
    chain.push({ from, to });
    seen.add(to);
    from = to;

    const nextLive = await Promise.race([
      HusqvarnaScraperService.fetchLiveData(to, 0).catch(() => null),
      new Promise<null>(resolve => setTimeout(() => resolve(null), 2500)),
    ]);
    to = normalizeIdentifier(nextLive?.replacedBy || '');
  }

  return chain;
}

export class HusqvarnaOfficialController {
  async productSearch(req: AuthenticatedRequest, res: Response): Promise<void> {
    if (!req.user) return;
    const query = String(req.query.q || '').trim().replace(/\s+/g, ' ').slice(0, 80);
    if (query.length < 2) {
      res.status(400).json({ error: 'Informe pelo menos 2 caracteres para pesquisar.' });
      return;
    }

    try {
      const results = await HusqvarnaProductSearchService.search(query);
      res.json({ results });
    } catch (error) {
      console.error(`❌ Erro na busca oficial Husqvarna por "${query}":`, error);
      res.status(502).json({ error: 'Não foi possível pesquisar na Husqvarna.' });
    }
  }

  async productDetails(req: AuthenticatedRequest, res: Response): Promise<void> {
    if (!req.user) return;
    const pnc = cleanNumericIdentifier(req.params.pnc);
    if (!/^\d{8,14}$/.test(pnc)) {
      res.status(400).json({ error: 'PNC inválido.' });
      return;
    }

    try {
      const [details, productMatch] = await Promise.all([
        HusqvarnaOfficialDetailService.getProductDetails(pnc),
        HusqvarnaPortalGraphqlService.searchProductByPnc(pnc),
      ]);

      if (!details) {
        if (!productMatch) {
          res.status(404).json({ error: 'A Husqvarna não confirmou detalhes oficiais para este PNC.' });
          return;
        }

        const publicSupport = await HusqvarnaPublicSupportService.verifyProduct(pnc, productMatch.productName);
        res.json({
          product: {
            pnc,
            productName: productMatch.productName,
            model: extractModel(productMatch.productName),
            categoryName: productMatch.category?.name || null,
            articleDescription: null,
            discontinued: productMatch.discontinued,
            equipment: null,
            portalUrl: productMatch.portalUrl,
            publicSupportUrl: publicSupport?.url || null,
            publicSupportVerifiedBy: publicSupport?.verifiedBy || null,
            documents: [],
            specifications: [],
            variants: [],
            features: [],
            accessories: [],
            alsoUsedIn: [],
            spareParts: [],
            iplSections: [],
          },
        });
        return;
      }

      const partNumbers = [...new Set([
        ...details.iplSections.flatMap(section => section.parts).map(part => normalizeIdentifier(part.partNumber || '')),
        ...details.spareParts.map(part => normalizeIdentifier(part.partNumber || '')),
      ].filter(value => /^\d{6,14}$/.test(value)))].slice(0, 1800);

      const [masterParts, publicSupport] = await Promise.all([
        partNumbers.length
          ? prisma.masterPart.findMany({
              where: { tenantId: req.user.tenantId, normalizedNumber: { in: partNumbers } },
              select: {
                normalizedNumber: true,
                partNumber: true,
                name: true,
                description: true,
                price: true,
                ean: true,
                ncm: true,
                category: true,
                brand: true,
                sections: {
                  select: { section: true, application: true, reference: true },
                  take: 8,
                },
              },
            })
          : Promise.resolve([]),
        HusqvarnaPublicSupportService.verifyProduct(pnc, details.productName),
      ]);

      const commercialByNumber = new Map(masterParts.map(part => [part.normalizedNumber, part]));
      const commercialPayload = (normalizedNumber: string) => {
        const commercial = commercialByNumber.get(normalizedNumber);
        return commercial
          ? {
              partNumber: commercial.partNumber,
              name: commercial.name,
              description: commercial.description,
              price: commercial.price,
              ean: commercial.ean,
              ncm: commercial.ncm,
              category: commercial.category,
              brand: commercial.brand,
              applications: commercial.sections.map(sectionItem => sectionItem.application).filter(Boolean),
              references: commercial.sections.map(sectionItem => sectionItem.reference).filter(Boolean),
            }
          : null;
      };

      const iplSections = details.iplSections.map(section => ({
        ...section,
        parts: section.parts.map(part => ({
          ...part,
          // replacedIds é mantido fail-closed. A direção dessa relação não está
          // documentada; supersession só é afirmada pela consulta específica da peça.
          replacementPartNumbers: [],
          commercial: part.partNumber ? commercialPayload(normalizeIdentifier(part.partNumber)) : null,
        })),
      }));

      const spareParts = details.spareParts.map(part => ({
        ...part,
        commercial: commercialPayload(normalizeIdentifier(part.partNumber)),
      }));

      res.json({
        product: {
          ...details,
          model: extractModel(details.productName),
          portalUrl: productMatch?.portalUrl || null,
          publicSupportUrl: publicSupport?.url || null,
          publicSupportVerifiedBy: publicSupport?.verifiedBy || null,
          iplSections,
          spareParts,
        },
      });
    } catch (error) {
      console.error(`❌ Erro ao carregar detalhes oficiais Husqvarna para ${pnc}:`, error);
      res.status(502).json({ error: 'Não foi possível carregar os detalhes oficiais da Husqvarna.' });
    }
  }

  async partDetails(req: AuthenticatedRequest, res: Response): Promise<void> {
    if (!req.user) return;
    const code = cleanNumericIdentifier(req.params.code);
    if (!/^\d{6,14}$/.test(code)) {
      res.status(400).json({ error: 'Código de peça inválido.' });
      return;
    }

    try {
      const [officialPart, replacementHistory, commercial] = await Promise.all([
        HusqvarnaOfficialDetailService.getSparePartDetails(code),
        HusqvarnaReplacementHistoryService.getReplacementHistory(code).catch(() => null),
        prisma.masterPart.findUnique({
          where: { tenantId_normalizedNumber: { tenantId: req.user.tenantId, normalizedNumber: code } },
          select: {
            partNumber: true,
            name: true,
            description: true,
            price: true,
            ean: true,
            ncm: true,
            category: true,
            brand: true,
            sections: { select: { application: true, reference: true, section: true }, take: 20 },
          },
        }),
      ]);

      const officialReplacementHistoryAvailable = Boolean(replacementHistory?.history.length);
      // The structured detail query supplies images, specifications and model
      // applications. Fetch HTML only when official detail/history is unavailable.
      const [graphqlPart, livePart] = await Promise.all([
        officialPart || HusqvarnaOfficialDetailService.searchSparePart(code),
        !officialPart || !officialReplacementHistoryAvailable
          ? HusqvarnaScraperService.fetchLiveData(code).catch(() => null)
          : null,
      ]);
      if (!graphqlPart && !livePart && !commercial && !officialReplacementHistoryAvailable) {
        res.status(404).json({ error: 'Peça não localizada nas fontes disponíveis.' });
        return;
      }

      const commercialApplications = commercial?.sections
        .map(section => section.application)
        .filter((value): value is string => Boolean(value)) || [];
      const applications = [
        ...(officialPart?.fitsTo || []),
        ...(livePart?.fitsTo || []),
        ...commercialApplications,
      ];

      let replacementChain: Array<{ from: string; to: string }> = [];
      let replacedBy: string | null = null;
      let replacementSource: 'HUSQVARNA_GRAPHQL' | 'PORTAL_SCRAPER' | null = null;

      if (officialReplacementHistoryAvailable && replacementHistory) {
        replacementChain = replacementHistory.chain;
        replacedBy = replacementHistory.replacedBy;
        replacementSource = 'HUSQVARNA_GRAPHQL';
      } else if (livePart?.replacedBy) {
        replacementChain = await buildScraperReplacementChain(code, livePart.replacedBy);
        replacedBy = replacementChain[0]?.to || normalizeIdentifier(livePart.replacedBy) || null;
        replacementSource = replacementChain.length || replacedBy ? 'PORTAL_SCRAPER' : null;
      }

      res.json({
        part: {
          partNumber: code,
          name: graphqlPart?.name || livePart?.name || commercial?.name || code,
          description: graphqlPart?.description || commercial?.description || null,
          imageUrl: graphqlPart?.imageUrl || livePart?.imageUrl || null,
          officialUrl: graphqlPart?.url || livePart?.originalPartUrl || null,
          replacedBy,
          replacementChain,
          latestReplacementPartNumber: officialReplacementHistoryAvailable ? replacementHistory?.latestPartNumber || null : replacementChain.at(-1)?.to || replacedBy,
          replacementHistory: officialReplacementHistoryAvailable ? replacementHistory?.history || [] : [],
          replacementHistoryComplete: officialReplacementHistoryAvailable ? Boolean(replacementHistory?.completeChain) : false,
          replacementSource,
          fitsTo: [...new Set(applications)].slice(0, 100),
          specifications: officialPart?.specifications || livePart?.specifications || null,
          commercial: commercial
            ? {
                partNumber: commercial.partNumber,
                name: commercial.name,
                description: commercial.description,
                price: commercial.price,
                ean: commercial.ean,
                ncm: commercial.ncm,
                category: commercial.category,
                brand: commercial.brand,
                applications: commercialApplications,
                references: commercial.sections.map(section => section.reference).filter(Boolean),
              }
            : null,
          sources: {
            graphql: Boolean(graphqlPart),
            portalScraper: Boolean(livePart),
            commercial: Boolean(commercial),
          },
        },
      });
    } catch (error) {
      console.error(`❌ Erro ao carregar peça oficial Husqvarna ${code}:`, error);
      res.status(502).json({ error: 'Não foi possível consultar a peça na Husqvarna.' });
    }
  }
}
