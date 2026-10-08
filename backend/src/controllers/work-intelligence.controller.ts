import { Response } from 'express';
import { HusqvarnaOfficialDetailService } from '../services/husqvarna-official-detail.service';
import { prisma } from '../config/prisma';
import { AuthenticatedRequest } from '../middleware/auth.middleware';
import { normalizeIdentifier } from '../utils/normalize';
import { AuditService } from '../services/audit.service';
import { HusqvarnaLivePartService } from '../services/husqvarna-live-part.service';
import { HusqvarnaPortalGraphqlService } from '../services/husqvarna-portal-graphql.service';
import { parseQuoteUsageItems } from '../services/operational-input-validation';

const HUSQVARNA_SPARE_PARTS_URL = 'https://www.husqvarna.com/br/pecas-sobressalentes/';
const HUSQVARNA_PORTAL_URL = 'https://portal.husqvarnagroup.com/br/';

function cleanCode(value: unknown): string {
  return String(value || '').replace(/[^A-Za-z0-9]/g, '').toUpperCase();
}

/**
 * Mantém apenas as ações ainda roteadas para este controller.
 * Busca comercial e work-context possuem controllers dedicados e otimizados.
 */
export class WorkIntelligenceController {

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
    const items = parseQuoteUsageItems(req.body?.items);

    if (items === null) {
      res.status(400).json({ error: 'Os itens do orçamento possuem código de peça inválido.' });
      return;
    }
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
        if (looksLikePnc) {
          const [productSearchResult, detailsResult] = await Promise.allSettled([
            HusqvarnaPortalGraphqlService.searchProductByPnc(clean),
            HusqvarnaPortalGraphqlService.getProductDetailsByPnc(clean),
          ]);
          let productMatch = productSearchResult.status === 'fulfilled' ? productSearchResult.value : null;
          const productDetails = detailsResult.status === 'fulfilled' ? detailsResult.value : null;

          // Alguns artigos antigos são confirmados por ID nos detalhes, mas a busca de produto
          // não repete o PNC nos campos selecionados. Nesse caso, usamos a identidade já
          // confirmada (produto + categoria) apenas para recuperar a rota canônica do mesmo resultado.
          if (!productMatch && productDetails) {
            productMatch = await HusqvarnaPortalGraphqlService.searchProductByPnc(clean, {
              productName: productDetails.productName,
              categoryName: productDetails.categoryName,
            });
          }

          // Só tentamos interpretar o mesmo número como peça quando as consultas oficiais
          // de produto não confirmaram o PNC. Isso evita scraper e GraphQL de peça desnecessários
          // para máquinas já identificadas com segurança pelo portal.
          if (productMatch || productDetails) {
            const confirmedPnc = productMatch?.pnc || productDetails!.pnc;
            const sameDetails = productDetails?.pnc === confirmedPnc ? productDetails : null;
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
                // Manual do operador e vista explodida em PDF, já presentes na
                // carga em cache do Portal. Antes isto ia vazio e obrigava o
                // balcão a abrir o painel oficial só para chegar no manual.
                documents: sameDetails?.documents || [],
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

          // O Portal não conhece o artigo (o 345BT, por exemplo). O site público da Husqvarna, que é a mesma fonte oficial por
          // outra porta, entra só quando traz a vista explodida: sem ela, o PNC continua sem confirmação.
          const publicDetails = await HusqvarnaOfficialDetailService.getProductDetails(clean);
          if (publicDetails && publicDetails.iplSections.length > 0) {
            res.json({
              result: {
                status: 'FOUND',
                source: 'OFFICIAL',
                kind: 'PRODUCT_CATALOG',
                query,
                pnc: publicDetails.pnc,
                name: publicDetails.productName,
                discontinued: publicDetails.discontinued,
                categoryName: publicDetails.categoryName,
                articleDescription: publicDetails.articleDescription,
                iplSections: publicDetails.iplSections,
                documents: publicDetails.documents,
                portalUrl: null,
                url: `/husqvarna?pnc=${encodeURIComponent(publicDetails.pnc)}`,
                directProductUrl: false,
                message: `${publicDetails.iplSections.length} vista(s) explodida(s) oficial(is) confirmada(s).`,
              },
            });
            return;
          }
        }

        const livePart = await HusqvarnaLivePartService.getPart(clean);
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
              replacementChain: livePart.replacementChain ?? [],
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
