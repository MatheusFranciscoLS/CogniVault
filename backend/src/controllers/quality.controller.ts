import { Response } from 'express';
import { prisma } from '../config/prisma';
import { AuthenticatedRequest } from '../middleware/auth.middleware';
import { AiQualityService } from '../services/ai-quality.service';
import { AuditService } from '../services/audit.service';
import { DocumentService } from '../services/document.service';
import { refreshCatalogHealth } from '../services/catalog-health';
import { isPlausibleCatalogModel, normalizeHusqvarnaPnc } from '../services/catalog-extractor';
import { rebuildTenantTechnicalKnowledge } from '../services/knowledge-maintenance.service';

const documentService = new DocumentService();

function metadataValue(value: unknown, field: string): string | null | undefined {
  if (value === undefined) return undefined;
  if (value === null) return null;
  if (typeof value !== 'string') throw new Error(`${field}_INVALID`);
  const clean = value.trim();
  if (clean.length > 120) throw new Error(`${field}_INVALID`);
  return clean || null;
}

export class QualityController {
  async overview(req: AuthenticatedRequest, res: Response): Promise<void> {
    try {
      if (!req.user) return;
      res.json({ quality: await AiQualityService.overview(req.user.tenantId) });
    } catch (error) {
      console.error('❌ Erro ao carregar qualidade da IA:', error);
      res.status(500).json({ error: 'Não foi possível carregar o painel de qualidade.' });
    }
  }

  async benchmark(req: AuthenticatedRequest, res: Response): Promise<void> {
    try {
      if (!req.user) return;
      const run = await AiQualityService.runBenchmark(req.user.tenantId, req.user.id);
      await AuditService.record({
        tenantId: req.user.tenantId,
        userId: req.user.id,
        action: 'AI_BENCHMARK_RUN',
        targetType: 'AI_BENCHMARK',
        targetId: run.id,
        metadata: { caseCount: run.caseCount, metrics: run.metrics },
      });
      res.status(201).json({ run });
    } catch (error) {
      console.error('❌ Erro no benchmark de produção:', error);
      res.status(500).json({ error: 'Não foi possível executar o benchmark agora.' });
    }
  }

  async rebuildKnowledge(req: AuthenticatedRequest, res: Response): Promise<void> {
    try {
      if (!req.user) return;
      const requested = Number(req.body?.limit ?? 250);
      const limit = Number.isFinite(requested) ? Math.max(1, Math.min(500, Math.trunc(requested))) : 250;
      const result = await rebuildTenantTechnicalKnowledge(req.user.tenantId, limit);
      await AuditService.record({
        tenantId: req.user.tenantId,
        userId: req.user.id,
        action: 'AI_TECHNICAL_KNOWLEDGE_REBUILT',
        targetType: 'TENANT',
        targetId: req.user.tenantId,
        metadata: result,
      });
      res.json({
        message: result.failed
          ? `Memória técnica atualizada em ${result.processed} catálogo(s), com ${result.failed} falha(s) isolada(s).`
          : `Memória técnica atualizada em ${result.processed} catálogo(s).`,
        result,
      });
    } catch (error) {
      console.error('❌ Erro ao atualizar memória técnica existente:', error);
      res.status(500).json({ error: 'Não foi possível atualizar a memória técnica agora.' });
    }
  }

  async reviewDocument(req: AuthenticatedRequest, res: Response): Promise<void> {
    try {
      if (!req.user) return;
      const documentId = String(req.params.id);
      const document = await prisma.document.findFirst({
        where: { id: documentId, tenantId: req.user.tenantId, processingStage: { not: 'REMOVED' } },
        select: { id: true, filename: true, manufacturer: true, model: true, pnc: true, processingJobId: true },
      });
      if (!document) { res.status(404).json({ error: 'Catálogo não encontrado.' }); return; }
      if (document.processingJobId) { res.status(409).json({ error: 'Aguarde o processamento atual terminar antes de revisar metadados.' }); return; }

      const manufacturer = metadataValue(req.body?.manufacturer, 'MANUFACTURER');
      const model = metadataValue(req.body?.model, 'MODEL');
      const rawPnc = metadataValue(req.body?.pnc, 'PNC');
      const pnc = rawPnc ? normalizeHusqvarnaPnc(rawPnc) : rawPnc;
      if (model && !isPlausibleCatalogModel(model)) { res.status(400).json({ error: 'Informe um modelo válido do equipamento, como 143RII ou TS138.' }); return; }
      if (rawPnc && !pnc) { res.status(400).json({ error: 'O PNC deve ter 9 ou 11 dígitos e começar por 9. Não use número de série neste campo.' }); return; }
      const changed = manufacturer !== undefined || model !== undefined || pnc !== undefined;
      const confirm = req.body?.confirm === true;
      if (!changed && !confirm) { res.status(400).json({ error: 'Informe um metadado para corrigir ou confirme a revisão.' }); return; }

      if (changed) {
        await prisma.document.update({
          where: { id: document.id },
          data: {
            manufacturer: manufacturer === undefined ? undefined : manufacturer,
            model: model === undefined ? undefined : model,
            pnc: pnc === undefined ? undefined : pnc,
            metadataReviewedAt: new Date(),
            metadataReviewedById: req.user.id,
            reviewStatus: 'PENDING',
            qualityCheckedAt: null,
          },
        });
        const queued = await documentService.reprocess(req.user.tenantId, document.id);
        await AuditService.record({
          tenantId: req.user.tenantId,
          userId: req.user.id,
          action: 'DOCUMENT_METADATA_REVIEWED',
          targetType: 'DOCUMENT',
          targetId: document.id,
          metadata: {
            filename: document.filename,
            before: { manufacturer: document.manufacturer, model: document.model, pnc: document.pnc },
            after: {
              manufacturer: manufacturer === undefined ? document.manufacturer : manufacturer,
              model: model === undefined ? document.model : model,
              pnc: pnc === undefined ? document.pnc : pnc,
            },
            reprocessQueued: true,
          },
        });
        res.json({ message: 'Metadados salvos. O catálogo foi enviado para reprocessamento antes de liberar a revisão.', document: { id: queued.id, status: queued.status } });
        return;
      }

      const health = await refreshCatalogHealth(document.id, req.user.tenantId);
      if (!health) { res.status(404).json({ error: 'Catálogo não encontrado.' }); return; }
      const critical = health.reasons.some(reason => /modelo|nenhuma peça|somente \d+ peças|menos da metade/i.test(reason));
      if (critical) {
        res.status(409).json({ error: 'Ainda existem problemas estruturais que precisam ser corrigidos antes de marcar este catálogo como revisado.', reasons: health.reasons });
        return;
      }
      await prisma.document.update({
        where: { id: document.id },
        data: { reviewStatus: 'REVIEWED', metadataReviewedAt: new Date(), metadataReviewedById: req.user.id },
      });
      await AuditService.record({
        tenantId: req.user.tenantId,
        userId: req.user.id,
        action: 'DOCUMENT_QUALITY_CONFIRMED',
        targetType: 'DOCUMENT',
        targetId: document.id,
        metadata: { filename: document.filename, healthScore: health.score, warnings: health.warnings },
      });
      res.json({ message: 'Catálogo marcado como revisado.', health: { ...health, reviewStatus: 'REVIEWED' } });
    } catch (error) {
      const message = error instanceof Error ? error.message : '';
      if (message.endsWith('_INVALID')) { res.status(400).json({ error: 'Metadado inválido.' }); return; }
      if (message === 'DOCUMENT_ALREADY_PROCESSING') { res.status(409).json({ error: 'Este catálogo já está em processamento.' }); return; }
      console.error('❌ Erro ao revisar catálogo:', error);
      res.status(500).json({ error: 'Não foi possível concluir a revisão do catálogo.' });
    }
  }
}
