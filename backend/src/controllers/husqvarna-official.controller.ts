import { Response } from 'express';
import { AuthenticatedRequest } from '../middleware/auth.middleware';
import { prisma } from '../config/prisma';
import { normalizeIdentifier } from '../utils/normalize';
import { HusqvarnaOfficialDetailService } from '../services/husqvarna-official-detail.service';
import { HusqvarnaPortalGraphqlService } from '../services/husqvarna-portal-graphql.service';
import { HusqvarnaPublicSupportService } from '../services/husqvarna-public-support.service';
import { HusqvarnaScraperService } from '../services/husqvarna-scraper.service';

function cleanNumericIdentifier(value: unknown): string {
  return normalizeIdentifier(String(value || ''));
}

function extractModel(productName: string): string {
  return productName.replace(/^HUSQVARNA\s+/i, '').trim();
}

export class HusqvarnaOfficialController {
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

      // Se a busca de produto confirmou o PNC mas a consulta técnica detalhada não
      // estiver disponível, ainda devolvemos uma ficha mínima e tentamos validar a
      // página pública de suporte. Não inventamos IPL, especificação ou documento.
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
            portalUrl: productMatch.portalUrl,
            publicSupportUrl: publicSupport?.url || null,
            publicSupportVerifiedBy: publicSupport?.verifiedBy || null,
            documents: [],
            specifications: [],
            variants: [],
            accessories: [],
            alsoUsedIn: [],
            iplSections: [],
          },
        });
        return;
      }

      const partNumbers = [...new Set(details.iplSections
        .flatMap(section => section.parts)
        .map(part => normalizeIdentifier(part.partNumber || ''))
        .filter(value => /^\d{6,14}$/.test(value)))]
        .slice(0, 1500);

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
      const iplSections = details.iplSections.map(section => ({
        ...section,
        parts: section.parts.map(part => {
          const commercial = part.partNumber ? commercialByNumber.get(normalizeIdentifier(part.partNumber)) : undefined;
          return {
            ...part,
            // A API chama este campo de replacedIds, mas a direção da relação não
            // está documentada. Mantemos fail-closed: ele não pode trocar o código
            // do orçamento. Supersession só é afirmada quando a consulta específica
            // da peça retorna replacedBy.
            replacementPartNumbers: [],
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
                  applications: commercial.sections.map(sectionItem => sectionItem.application).filter(Boolean),
                  references: commercial.sections.map(sectionItem => sectionItem.reference).filter(Boolean),
                }
              : null,
          };
        }),
      }));

      res.json({
        product: {
          ...details,
          model: extractModel(details.productName),
          portalUrl: productMatch?.portalUrl || null,
          publicSupportUrl: publicSupport?.url || null,
          publicSupportVerifiedBy: publicSupport?.verifiedBy || null,
          iplSections,
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
      const [graphqlPart, livePart, commercial] = await Promise.all([
        HusqvarnaOfficialDetailService.searchSparePart(code),
        HusqvarnaScraperService.fetchLiveData(code).catch(() => null),
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

      if (!graphqlPart && !livePart && !commercial) {
        res.status(404).json({ error: 'Peça não localizada nas fontes disponíveis.' });
        return;
      }

      const applications = [
        ...(livePart?.fitsTo || []),
        ...(commercial?.sections.map(section => section.application).filter((value): value is string => Boolean(value)) || []),
      ];

      res.json({
        part: {
          partNumber: code,
          name: graphqlPart?.name || livePart?.name || commercial?.name || code,
          description: graphqlPart?.description || commercial?.description || null,
          imageUrl: graphqlPart?.imageUrl || livePart?.imageUrl || null,
          officialUrl: graphqlPart?.url || livePart?.originalPartUrl || null,
          replacedBy: livePart?.replacedBy ? normalizeIdentifier(livePart.replacedBy) : null,
          fitsTo: [...new Set(applications)].slice(0, 100),
          specifications: livePart?.specifications || null,
          commercial: commercial
            ? {
                partNumber: commercial.partNumber,
                name: commercial.name,
                price: commercial.price,
                ean: commercial.ean,
                ncm: commercial.ncm,
                category: commercial.category,
                brand: commercial.brand,
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
