import { Response } from 'express';
import { prisma } from '../config/prisma';
import { AuthenticatedRequest } from '../middleware/auth.middleware';
import { parsePriceListCatalog, type HtmlPriceList } from '../scripts/price-list-html';
import { parseServicePartRows, type ServicePartLink } from '../scripts/service-parts';
import { AuditService } from '../services/audit.service';
import { PriceListApprovalError, applyPriceList, buildPriceListReport } from '../services/price-list-update.service';
import { GzipJsonError, decodeGzipJson } from '../utils/gzip-json-body';

/** Descomprimido, o JSON das quatro listas fica em poucos MB; 40 MB é folga larga e ainda protege a memória do Render free. */
export const PRICE_LIST_MAX_JSON_BYTES = 40 * 1024 * 1024;

function nonNegativeInteger(value: unknown): number | null {
  const number = Number(value);
  return typeof value === 'string' && value.trim() !== '' && Number.isInteger(number) && number >= 0 ? number : null;
}

async function readList(req: AuthenticatedRequest): Promise<{ list: HtmlPriceList; service: ServicePartLink[]; hash: string }> {
  const { value, hash } = await decodeGzipJson(req.body, PRICE_LIST_MAX_JSON_BYTES);
  // Só as quatro listas e as peças de revisão entram: qualquer outra chave do arquivo (as imagens em base64) é ignorada.
  return { list: parsePriceListCatalog(value), service: parseServicePartRows(value.revisao).links, hash };
}

/**
 * Atualização da lista de preços pela tela do administrador (Negócio). Duas chamadas, e a segunda só grava o que a primeira mostrou:
 * `preview` só LÊ; `apply` recalcula e recusa se os números mudaram desde o relatório. Só administrador.
 */
export class PriceListUpdateController {
  async preview(req: AuthenticatedRequest, res: Response): Promise<void> {
    if (!req.user) return;
    try {
      const { list, service, hash } = await readList(req);
      const report = await buildPriceListReport(prisma, req.user.tenantId, list, service);
      res.set('Cache-Control', 'no-store').json({ fileHash: hash, report });
    } catch (error) {
      this.fail(res, error);
    }
  }

  async apply(req: AuthenticatedRequest, res: Response): Promise<void> {
    if (!req.user) return;
    const changed = nonNegativeInteger(req.query.changed);
    const added = nonNegativeInteger(req.query.added);
    const serviceAdded = req.query.serviceAdded === undefined ? 0 : nonNegativeInteger(req.query.serviceAdded);
    const serviceRemoved = req.query.serviceRemoved === undefined ? 0 : nonNegativeInteger(req.query.serviceRemoved);
    const approvedHash = typeof req.query.hash === 'string' ? req.query.hash : '';
    const filename = typeof req.query.filename === 'string' ? req.query.filename.slice(0, 160) : 'lista.html';
    if (changed === null || added === null || serviceAdded === null || serviceRemoved === null || !/^[0-9a-f]{64}$/.test(approvedHash)) {
      res.status(400).json({ error: 'Informe os números e o código do arquivo que foram aprovados no relatório.' });
      return;
    }
    try {
      const { list, service, hash } = await readList(req);
      if (hash !== approvedHash) {
        res.status(409).json({ error: 'O arquivo enviado não é o mesmo do relatório aprovado. Nada foi gravado.' });
        return;
      }
      const result = await applyPriceList(prisma, req.user.tenantId, list, { changed, added, serviceAdded, serviceRemoved }, { filename, hash }, service);
      void AuditService.record({
        tenantId: req.user.tenantId,
        userId: req.user.id,
        action: 'PRICE_LIST_UPDATE',
        targetType: 'MasterPart',
        metadata: { filename, updated: result.updated, added: result.added, serviceAdded: result.serviceAdded, serviceRemoved: result.serviceRemoved },
      });
      res.set('Cache-Control', 'no-store').json(result);
    } catch (error) {
      this.fail(res, error);
    }
  }

  private fail(res: Response, error: unknown): void {
    if (error instanceof GzipJsonError) {
      res.status(400).json({ error: error.message });
      return;
    }
    if (error instanceof PriceListApprovalError) {
      res.status(409).json({ error: error.message });
      return;
    }
    // Erro do leitor ("Lista pecas não encontrada no arquivo") é do arquivo, não do servidor.
    if (error instanceof Error && /Lista ".+" não encontrada|catalogData/.test(error.message)) {
      res.status(400).json({ error: error.message });
      return;
    }
    console.error('❌ Erro na atualização da lista de preços:', error);
    res.status(500).json({ error: 'Não foi possível atualizar a lista de preços. Nada foi gravado.' });
  }
}

export const priceListUpdateController = new PriceListUpdateController();
