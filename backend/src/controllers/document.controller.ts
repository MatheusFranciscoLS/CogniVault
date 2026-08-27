import { Request, Response } from 'express';
import { DocumentService } from '../services/document.service';

const documentService = new DocumentService();

export class DocumentController {
    async upload(req: Request, res: Response): Promise<void> {
        try {
            const { tenantId } = req.body;
            const file = req.file; // 👈 O Multer injeta o arquivo físico aqui!

            if (!file) {
                res.status(400).json({ error: 'Nenhum arquivo enviado.' });
                return;
            }

            // Agora enviamos o caminho local do arquivo (file.path) no lugar da URL da internet
            const doc = await documentService.handleNewUpload(tenantId, file.originalname, file.path);

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