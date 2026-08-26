import { Request, Response } from 'express';
import { DocumentService } from '../services/document.service';

const documentService = new DocumentService();

export class DocumentController {
    async upload(req: Request, res: Response): Promise<void> {
        try {
            const { tenantId, filename, url } = req.body;
            const doc = await documentService.handleNewUpload(tenantId, filename, url);

            res.status(201).json({
                message: 'Upload recebido e em processamento!',
                document: doc
            });
        } catch (error) {
            console.error(error);
            res.status(500).json({ error: 'Erro interno ao processar upload' });
        }
    }
}