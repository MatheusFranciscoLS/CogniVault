import { Response } from 'express';
import { DocumentService } from '../services/document.service';
import { AuthenticatedRequest } from '../middleware/auth.middleware';
import { AuditService } from '../services/audit.service';

const documentService = new DocumentService();

function optionalString(value: unknown): string | undefined {
    return typeof value === 'string' && value.trim() ? value.trim() : undefined;
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

            if (file.mimetype !== 'application/pdf') {
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
            console.error('❌ Erro no upload do catálogo:', error);
            res.status(500).json({ error: 'Erro interno ao processar upload.' });
        }
    }

    async list(req: AuthenticatedRequest, res: Response): Promise<void> {
        try {
            if (!req.user) {
                res.status(401).json({ error: 'Usuário não autenticado.' });
                return;
            }

            const documents = req.user.role === 'ADMIN' && req.query.includeArchived === 'true'
                ? await documentService.listAdmin(req.user.tenantId)
                : await documentService.list(req.user.tenantId);

            res.status(200).json({ documents });
        } catch (error) {
            console.error('❌ Erro ao listar catálogos:', error);
            res.status(500).json({ error: 'Erro ao listar catálogos.' });
        }
    }

    async access(req: AuthenticatedRequest, res: Response): Promise<void> {
        try {
            if (!req.user) {
                res.status(401).json({ error: 'Usuário não autenticado.' });
                return;
            }

            const mode = req.query.mode === 'download' ? 'download' : 'view';
            const url = await documentService.createAccessUrl(
                req.user.tenantId,
                String(req.params.id),
                mode === 'download',
            );

            res.status(200).json({ url, mode });
        } catch (error) {
            const message = error instanceof Error ? error.message : '';

            if (message === 'DOCUMENT_NOT_FOUND') {
                res.status(404).json({ error: 'Catálogo não encontrado.' });
                return;
            }

            if (message === 'DOCUMENT_NOT_READY') {
                res.status(409).json({ error: 'O catálogo ainda está sendo processado.' });
                return;
            }

            console.error('❌ Erro ao gerar acesso ao catálogo:', error);
            res.status(500).json({ error: 'Não foi possível acessar o catálogo.' });
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
            res.json({ message: 'Catálogo restaurado.' });
        } catch (error) {
            if (error instanceof Error && error.message === 'DOCUMENT_NOT_FOUND') {
                res.status(404).json({ error: 'Catálogo arquivado não encontrado.' });
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
            console.error('❌ Erro ao excluir PDF do catálogo:', error);
            res.status(500).json({ error: 'Não foi possível excluir o PDF.' });
        }
    }
}
