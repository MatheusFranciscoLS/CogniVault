import { Response } from 'express';
import { prisma } from '../config/prisma';
import { AuthenticatedRequest } from '../middleware/auth.middleware';
import { AuditService } from '../services/audit.service';
import { CSV_BOM, csvFilename, csvMoney, csvRow } from '../services/csv-export';
import { endOfStoreDay, startOfStoreDay } from '../utils/store-day';

// A lista de preços da Vardão tem dezenas de milhares de linhas. Render free tem
// pouca memória, então a exportação vai em página por cursor e escrita em
// stream: nada de montar o CSV inteiro em memória antes de responder.
const PAGE_SIZE = 1_000;
const MAX_QUOTE_EXPORT_ROWS = 50_000;

function prepareCsvResponse(res: Response, prefix: string): void {
  res.setHeader('Content-Type', 'text/csv; charset=utf-8');
  res.setHeader('Content-Disposition', `attachment; filename="${csvFilename(prefix)}"`);
  res.setHeader('Cache-Control', 'private, no-store');
  // Sem Content-Length: a resposta é streaming e o tamanho só se conhece no fim.
  res.write(CSV_BOM);
}

// Dias comerciais da loja, não do fuso do servidor. Ver utils/store-day.ts.

export class ExportController {
  /**
   * Lista de preços comercial. O preço exportado é o mesmo que o balcão vê:
   * já veio dividido por COMMERCIAL_PRICE_DIVISOR na importação
   * (ver scripts/price-list-rules.ts). Não há recálculo aqui.
   */
  async priceList(req: AuthenticatedRequest, res: Response): Promise<void> {
    if (!req.user) return;
    const tenantId = req.user.tenantId;
    const onlyWithoutPrice = req.query.onlyWithoutPrice === 'true';

    try {
      prepareCsvResponse(res, onlyWithoutPrice ? 'lista_precos_sem_preco' : 'lista_precos');
      res.write(csvRow([
        'Código',
        'Descrição',
        'Preço de venda (R$)',
        'Tem preço',
        'NCM',
        'EAN',
        'Categoria',
        'Marca',
        'Seções / aplicações',
        'Atualizado em',
      ]));

      let cursor: string | undefined;
      let exported = 0;

      for (;;) {
        const page = await prisma.masterPart.findMany({
          where: {
            tenantId,
            ...(onlyWithoutPrice ? { OR: [{ price: null }, { price: 0 }] } : {}),
          },
          select: {
            id: true,
            partNumber: true,
            name: true,
            description: true,
            price: true,
            ncm: true,
            ean: true,
            category: true,
            brand: true,
            updatedAt: true,
            sections: { select: { section: true, application: true }, take: 12 },
          },
          orderBy: { id: 'asc' },
          take: PAGE_SIZE,
          ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
        });

        if (!page.length) break;

        for (const part of page) {
          const sections = part.sections
            .map(row => (row.application ? `${row.section} (${row.application})` : row.section))
            .join(' | ');
          res.write(csvRow([
            part.partNumber,
            part.description || part.name,
            csvMoney(part.price),
            part.price !== null && part.price > 0,
            part.ncm,
            part.ean,
            part.category,
            part.brand,
            sections,
            part.updatedAt,
          ]));
        }

        exported += page.length;
        cursor = page[page.length - 1].id;
        if (page.length < PAGE_SIZE) break;
      }

      res.end();

      void AuditService.record({
        tenantId,
        userId: req.user.id,
        action: 'EXPORT_PRICE_LIST',
        targetType: 'MasterPart',
        metadata: { rows: exported, onlyWithoutPrice },
      });
    } catch (error) {
      console.error('❌ Erro ao exportar lista de preços:', error);
      // O cabeçalho já foi enviado, então não dá para trocar para JSON de erro:
      // marca a falha no próprio corpo para o dono não achar que o arquivo está
      // completo, e encerra.
      if (res.headersSent) {
        res.write(csvRow(['ERRO: exportação interrompida antes do fim. Tente novamente.']));
        res.end();
        return;
      }
      res.status(500).json({ error: 'Não foi possível exportar a lista de preços.' });
    }
  }

  /**
   * Orçamentos salvos, uma linha por item. Linha por item (e não por orçamento)
   * porque é assim que o dono consegue montar tabela dinâmica no Excel — somar
   * por peça, por atendente ou por cliente sem precisar desmembrar nada.
   */
  async quotes(req: AuthenticatedRequest, res: Response): Promise<void> {
    if (!req.user) return;
    const tenantId = req.user.tenantId;
    const from = startOfStoreDay(req.query.from);
    const to = endOfStoreDay(req.query.to);

    try {
      prepareCsvResponse(res, 'orcamentos');
      res.write(csvRow([
        'Orçamento',
        'Data',
        'Atendente',
        'Cliente',
        'WhatsApp',
        'Condição de pagamento',
        'Máquina / aplicação',
        'Desconto (%)',
        'Total bruto do orçamento (R$)',
        'Total líquido do orçamento (R$)',
        'Código da peça',
        'Descrição do item',
        'Modelo do item',
        'PNC',
        'Posição',
        'Quantidade',
        'Preço unitário (R$)',
        'Subtotal do item (R$)',
        'Serviço / avulso',
        'Substituição oficial',
      ]));

      let cursor: string | undefined;
      let rows = 0;

      for (;;) {
        const page = await prisma.quote.findMany({
          where: {
            tenantId,
            status: 'SAVED',
            ...(from || to
              ? { savedAt: { ...(from ? { gte: from } : {}), ...(to ? { lte: to } : {}) } }
              : {}),
          },
          include: {
            items: { orderBy: { sortOrder: 'asc' } },
            user: { select: { email: true } },
          },
          orderBy: { id: 'asc' },
          take: 200,
          ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
        });

        if (!page.length) break;

        for (const quote of page) {
          const attendant = quote.user?.email || 'Atendente removido';
          const reference = quote.savedAt ?? quote.createdAt;

          if (!quote.items.length) {
            res.write(csvRow([
              quote.id, reference, attendant, quote.customerName, quote.customerPhone,
              quote.paymentMethod, quote.machineModel, quote.discountPercentage,
              csvMoney(quote.grossTotal), csvMoney(quote.netTotal),
              '', '(orçamento sem itens)', '', '', '', 0, '', '', false, false,
            ]));
            rows += 1;
            continue;
          }

          for (const item of quote.items) {
            res.write(csvRow([
              quote.id,
              reference,
              attendant,
              quote.customerName,
              quote.customerPhone,
              quote.paymentMethod,
              quote.machineModel,
              quote.discountPercentage,
              csvMoney(quote.grossTotal),
              csvMoney(quote.netTotal),
              item.effectiveCode || item.partNumber,
              item.name,
              item.model,
              item.pnc,
              item.position,
              item.quantity,
              csvMoney(item.unitPrice),
              csvMoney(item.unitPrice === null ? null : item.quantity * item.unitPrice),
              item.isService,
              item.isSuperseded,
            ]));
            rows += 1;
          }
        }

        cursor = page[page.length - 1].id;
        if (rows >= MAX_QUOTE_EXPORT_ROWS) {
          res.write(csvRow([
            `AVISO: exportação limitada a ${MAX_QUOTE_EXPORT_ROWS} linhas. Reduza o período para exportar o restante.`,
          ]));
          break;
        }
        if (page.length < 200) break;
      }

      res.end();

      void AuditService.record({
        tenantId,
        userId: req.user.id,
        action: 'EXPORT_QUOTES',
        targetType: 'Quote',
        metadata: {
          rows,
          from: from ? from.toISOString() : null,
          to: to ? to.toISOString() : null,
        },
      });
    } catch (error) {
      console.error('❌ Erro ao exportar orçamentos:', error);
      if (res.headersSent) {
        res.write(csvRow(['ERRO: exportação interrompida antes do fim. Tente novamente.']));
        res.end();
        return;
      }
      res.status(500).json({ error: 'Não foi possível exportar os orçamentos.' });
    }
  }
}
