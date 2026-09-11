import { Response } from 'express';
import { unlink } from 'node:fs/promises';
import { DocumentService } from '../services/document.service';
import { AuthenticatedRequest } from '../middleware/auth.middleware';
import { AuditService } from '../services/audit.service';
import { invalidateHomeCountsCache } from './operational.controller';
import { invalidateCatalogListCache } from './catalog-list.controller';
import { invalidateFastSearchCaches } from './fast-search.controller';
import { refreshCatalogHealth } from '../services/catalog-health';

const documentService = new DocumentService();

function optionalString(value: unknown): string | undefined {
    return typeof value === 'string' && value.trim() ? value.trim() : undefined;
}

function invalidateDocumentCaches(tenantId: string): void {
    invalidateHomeCountsCache(tenantId);
    invalidateFastSearchCaches(tenantId);
    invalidateCatalogListCache(tenantId);
}

export class DocumentController {
    async upload(req: AuthenticatedRequest, res: Response): Promise<void> {
        try {
            if (!req.user) {
                res.status(401).json({ error: 'Usuário não autenticado.' });
                return;
            }

            const file = req.file;
            if (!file) {
                res.status(400).json({ error: 'Nenhum arquivo enviado.' });
                return;
            }

            if (file.mimetype !== 'application/pdf' && !file.originalname.toLowerCase().endsWith('.pdf')) {
                try { await unlink(file.path); } catch { /* arquivo temporário já removido */ }
                res.status(400).json({ error: 'Somente arquivos PDF são permitidos.' });
                return;
            }

            const document = await documentService.handleNewUpload(
                req.user.tenantId,
                file.originalname,
                file.path,
                {
                    manufacturer: optionalString(req.body.manufacturer),
                    model: optionalString(req.body.model),
                    pnc: optionalString(req.body.pnc),
                },
            );

            await AuditService.record({
                tenantId: req.user.tenantId,
                userId: req.user.id,
                action: 'DOCUMENT_UPLOADED',
                targetType: 'DOCUMENT',
                targetId: document.id,
                metadata: {
                    filename: document.filename,
                    manufacturer: document.manufacturer,
                    model: document.model,
                    pnc: document.pnc,
                },
            });

            invalidateDocumentCaches(req.user.tenantId);

            res.status(201).json({
                message: 'Catálogo recebido e enviado para processamento.',
                document: {
                    id: document.id,
                    filename: document.filename,
                    status: document.status,
                    manufacturer: document.manufacturer,
                    model: document.model,
                    pnc: document.pnc,
                },
            });
        } catch (error) {
            if (error instanceof Error && error.message.startsWith('DOCUMENT_DUPLICATE:')) {
                res.status(409).json({
                    error: 'Este mesmo PDF já está cadastrado.',
                    existingDocumentId: error.message.split(':')[1],
                });
                return;
            }
            if (error instanceof Error && error.message === 'DOCUMENT_INVALID_PDF') {
                res.status(400).json({ error: 'O arquivo enviado não é um PDF válido.' });
                return;
            }
            if (error instanceof Error && error.message.startsWith('DOCUMENT_STORAGE_UPLOAD_FAILED:')) {
                res.status(502).json({ error: 'Não foi possível salvar o PDF no armazenamento. Tente novamente.' });
                return;
            }
            console.error('❌ Erro no upload do catálogo:', error);
            res.status(500).json({ error: 'Erro interno ao processar upload.' });
        }
    }

    async setCategory(req: AuthenticatedRequest, res: Response): Promise<void> {
        try {
            if (!req.user) return;
            const document = await documentService.setCategory(
                req.user.tenantId,
                String(req.params.id),
                req.body?.category,
            );
            await AuditService.record({
                tenantId: req.user.tenantId,
                userId: req.user.id,
                action: 'DOCUMENT_CATEGORY_CHANGED',
                targetType: 'DOCUMENT',
                targetId: document.id,
                metadata: { filename: document.filename, category: document.category },
            });
            invalidateDocumentCaches(req.user.tenantId);
            res.status(200).json({ document });
        } catch (error) {
            if (error instanceof Error && error.message === 'DOCUMENT_NOT_FOUND') {
                res.status(404).json({ error: 'Catálogo não encontrado.' });
                return;
            }
            if (error instanceof Error && error.message === 'DOCUMENT_CATEGORY_INVALID') {
                res.status(400).json({ error: 'Seção de catálogo inválida.' });
                return;
            }
            console.error('❌ Erro ao alterar seção do catálogo:', error);
            res.status(500).json({ error: 'Não foi possível alterar a seção do catálogo.' });
        }
    }

    async archive(req: AuthenticatedRequest, res: Response): Promise<void> {
        try {
            if (!req.user) return;
            const document = await documentService.archive(req.user.tenantId, String(req.params.id), req.user.id);
            await AuditService.record({
                tenantId: req.user.tenantId,
                userId: req.user.id,
                action: 'DOCUMENT_ARCHIVED',
                targetType: 'DOCUMENT',
                targetId: document.id,
                metadata: { filename: document.filename },
            });
            invalidateDocumentCaches(req.user.tenantId);
            res.json({ message: 'Catálogo arquivado com segurança.' });
        } catch (error) {
            if (error instanceof Error && error.message === 'DOCUMENT_NOT_FOUND') {
                res.status(404).json({ error: 'Catálogo não encontrado.' });
                return;
            }
            console.error('❌ Erro ao arquivar catálogo:', error);
            res.status(500).json({ error: 'Não foi possível arquivar o catálogo.' });
        }
    }

    async restore(req: AuthenticatedRequest, res: Response): Promise<void> {
        try {
            if (!req.user) return;
            const document = await documentService.restore(req.user.tenantId, String(req.params.id));
            await AuditService.record({
                tenantId: req.user.tenantId,
                userId: req.user.id,
                action: 'DOCUMENT_RESTORED',
                targetType: 'DOCUMENT',
                targetId: document.id,
                metadata: { filename: document.filename },
            });
            invalidateDocumentCaches(req.user.tenantId);
            res.json({ message: 'Catálogo restaurado.' });
        } catch (error) {
            if (error instanceof Error && error.message === 'DOCUMENT_NOT_FOUND') {
                res.status(404).json({ error: 'Catálogo arquivado não encontrado.' });
                return;
            }
            if (error instanceof Error && error.message.startsWith('DOCUMENT_DUPLICATE:')) {
                res.status(409).json({
                    error: 'Não é possível restaurar este catálogo porque o mesmo PDF já está ativo.',
                    existingDocumentId: error.message.split(':')[1],
                });
                return;
            }
            console.error('❌ Erro ao restaurar catálogo:', error);
            res.status(500).json({ error: 'Não foi possível restaurar o catálogo.' });
        }
    }

    async reprocess(req: AuthenticatedRequest, res: Response): Promise<void> {
        try {
            if (!req.user) return;
            const document = await documentService.reprocess(req.user.tenantId, String(req.params.id));
            await AuditService.record({
                tenantId: req.user.tenantId,
                userId: req.user.id,
                action: 'DOCUMENT_REPROCESSED',
                targetType: 'DOCUMENT',
                targetId: document.id,
                metadata: { filename: document.filename },
            });
            invalidateDocumentCaches(req.user.tenantId);
            res.json({ message: 'Catálogo enviado novamente para processamento.' });
        } catch (error) {
            if (error instanceof Error && error.message === 'DOCUMENT_NOT_FOUND') {
                res.status(404).json({ error: 'Catálogo não encontrado.' });
                return;
            }
            if (error instanceof Error && error.message === 'DOCUMENT_ALREADY_PROCESSING') {
                res.status(409).json({ error: 'Este catálogo já está na fila ou em processamento.' });
                return;
            }
            console.error('❌ Erro ao reprocessar catálogo:', error);
            res.status(500).json({ error: 'Não foi possível reprocessar o catálogo.' });
        }
    }

    async remove(req: AuthenticatedRequest, res: Response): Promise<void> {
        try {
            if (!req.user) return;
            const document = await documentService.removePdf(
                req.user.tenantId,
                String(req.params.id),
                req.user.id,
            );
            await AuditService.record({
                tenantId: req.user.tenantId,
                userId: req.user.id,
                action: 'DOCUMENT_PDF_REMOVED',
                targetType: 'DOCUMENT',
                targetId: document.id,
                metadata: { filename: document.filename },
            });
            invalidateDocumentCaches(req.user.tenantId);
            res.json({ message: 'PDF excluído. O registro de auditoria foi preservado.' });
        } catch (error) {
            if (error instanceof Error && error.message === 'DOCUMENT_NOT_FOUND') {
                res.status(404).json({ error: 'Catálogo não encontrado.' });
                return;
            }
            if (error instanceof Error && error.message === 'DOCUMENT_ALREADY_PROCESSING') {
                res.status(409).json({ error: 'Aguarde o processamento terminar antes de excluir o PDF.' });
                return;
            }
            if (error instanceof Error && error.message.startsWith('DOCUMENT_STORAGE_DELETE_FAILED:')) {
                res.status(502).json({ error: 'Não foi possível excluir o PDF do armazenamento. Tente novamente.' });
                return;
            }
            console.error('❌ Erro ao excluir PDF do catálogo:', error);
            res.status(500).json({ error: 'Não foi possível excluir o PDF.' });
        }
    }

    async refreshHealth(req: AuthenticatedRequest, res: Response): Promise<void> {
        try {
            if (!req.user) return;
            if (req.user.role !== 'ADMIN') {
                res.status(403).json({ error: 'Apenas administradores podem recalcular a saúde do catálogo.' });
                return;
            }

            const health = await refreshCatalogHealth(String(req.params.id), req.user.tenantId);
            if (!health) {
                res.status(404).json({ error: 'Catálogo não encontrado.' });
                return;
            }
            invalidateCatalogListCache(req.user.tenantId);
            res.json({ message: `Saúde recalculada: nota ${health.score}/100 (${health.reviewStatus}).`, health });
        } catch (error) {
            console.error('❌ Erro ao recalcular saúde do catálogo:', error);
            res.status(500).json({ error: 'Não foi possível recalcular a saúde do catálogo.' });
        }
    }
}
