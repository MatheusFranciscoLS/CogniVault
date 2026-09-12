import { Response } from 'express';
import { prisma } from '../config/prisma';
import { AuthenticatedRequest } from '../middleware/auth.middleware';
import { normalizeIdentifier } from '../utils/normalize';
import { AuditService } from '../services/audit.service';
import { HusqvarnaLivePartService } from '../services/husqvarna-live-part.service';
import { HusqvarnaPortalCatalogService } from '../services/husqvarna-portal-catalog.service';
import { HusqvarnaPortalGraphqlService } from '../services/husqvarna-portal-graphql.service';

const HUSQVARNA_SPARE_PARTS_URL = 'https://www.husqvarna.com/br/pecas-sobressalentes/';
const HUSQVARNA_PORTAL_URL = 'https://portal.husqvarnagroup.com/br/';
const SEARCH_DEDUP_MS = 2 * 60 * 1000;

type QuoteUsageInput = {
  partNumber: string;
  normalizedPartNumber: string;
  model: string | null;
};

function cleanCode(value: unknown): string {
  return String(value || '').replace(/[^A-Za-z0-9]/g, '').toUpperCase();
}

/**
 * Mantém apenas as ações ainda roteadas para este controller.
 * Busca comercial e work-context possuem controllers dedicados e otimizados.
 */
export class WorkIntelligenceController {
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

      void AuditService.record({
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
    const rawItems: unknown[] = Array.isArray(req.body?.items) ? (req.body.items as unknown[]).slice(0, 60) : [];
    const items: QuoteUsageInput[] = rawItems
      .map((raw): QuoteUsageInput | null => {
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
      .filter((item): item is QuoteUsageInput => item !== null);

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
    const looksLikePnc = /^\d{8,14}$/.test(clean);

    if (!query) {
      res.status(400).json({ error: 'Informe o que deseja consultar.' });
      return;
    }

    try {
      if (looksLikeCode) {
        const [liveResult, catalogResult, productSearchResult, detailsResult] = await Promise.allSettled([
          HusqvarnaLivePartService.getPart(clean),
          looksLikePnc ? HusqvarnaPortalCatalogService.searchByPnc(clean) : Promise.resolve(null),
          looksLikePnc ? HusqvarnaPortalGraphqlService.searchProductByPnc(clean) : Promise.resolve(null),
          looksLikePnc ? HusqvarnaPortalGraphqlService.getProductDetailsByPnc(clean) : Promise.resolve(null),
        ]);
        const livePart = liveResult.status === 'fulfilled' ? liveResult.value : null;
        const portalCatalog = catalogResult.status === 'fulfilled' ? catalogResult.value : null;
        let productMatch = productSearchResult.status === 'fulfilled' ? productSearchResult.value : null;
        const productDetails = detailsResult.status === 'fulfilled' ? detailsResult.value : null;

        // Alguns artigos antigos são confirmados por ID nos detalhes, mas a busca de produto
        // não repete o PNC nos campos selecionados. Nesse caso, usamos a identidade já
        // confirmada (produto + categoria) apenas para recuperar a rota canônica do mesmo resultado.
        if (!productMatch && productDetails && looksLikePnc) {
          productMatch = await HusqvarnaPortalGraphqlService.searchProductByPnc(clean, {
            productName: productDetails.productName,
            categoryName: productDetails.categoryName,
          });
        }

        // Uma máquina só vira resultado oficial quando uma das consultas GraphQL da Husqvarna
        // confirma exatamente o PNC. O parser HTML antigo pode apenas enriquecer esse resultado.
        if (productMatch || productDetails) {
          const confirmedPnc = productMatch?.pnc || productDetails!.pnc;
          const sameDetails = productDetails?.pnc === confirmedPnc ? productDetails : null;
          const sameCatalog = portalCatalog?.pnc === confirmedPnc ? portalCatalog : null;
          const directUrl = productMatch?.portalUrl || null;
          const iplSections = sameDetails?.iplSections || [];
          const workspaceUrl = `/husqvarna?pnc=${encodeURIComponent(confirmedPnc)}`;

          res.json({
            result: {
              status: 'FOUND',
              source: 'OFFICIAL',
              kind: 'PRODUCT_CATALOG',
              query,
              pnc: confirmedPnc,
              name: sameDetails?.productName || productMatch?.productName || `Produto Husqvarna ${confirmedPnc}`,
              discontinued: sameDetails?.discontinued ?? productMatch?.discontinued ?? false,
              categoryName: sameDetails?.categoryName || productMatch?.category?.name || null,
              articleDescription: sameDetails?.articleDescription || null,
              iplSections,
              documents: sameCatalog?.documents || [],
              portalUrl: directUrl,
              url: workspaceUrl,
              directProductUrl: Boolean(directUrl),
              message: iplSections.length
                ? `${iplSections.length} vista(s) explodida(s) oficial(is) confirmada(s). Abra os dados oficiais para consultar posições, peças, preço e aplicações.`
                : 'PNC e produto confirmados diretamente pela Husqvarna. Abra os dados oficiais para consultar documentos, especificações, variantes e acessórios disponíveis.',
            },
          });
          return;
        }

        if (livePart) {
          res.json({
            result: {
              status: 'FOUND',
              source: 'OFFICIAL',
              kind: 'PART',
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
          url: looksLikePnc ? HUSQVARNA_PORTAL_URL : HUSQVARNA_SPARE_PARTS_URL,
          message: looksLikePnc
            ? `O Portal Husqvarna não confirmou automaticamente o PNC ${clean}. Abra o portal e confira manualmente antes de usar qualquer catálogo.`
            : looksLikeCode
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
          url: looksLikePnc ? HUSQVARNA_PORTAL_URL : HUSQVARNA_SPARE_PARTS_URL,
          message: looksLikePnc
            ? `A consulta automática não respondeu. Abra o Portal Husqvarna e pesquise manualmente o PNC ${clean}.`
            : 'A consulta automática não respondeu. Use o localizador oficial da Husqvarna para continuar.',
        },
      });
    }
  }
}
