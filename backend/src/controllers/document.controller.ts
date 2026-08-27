import { Response } from 'express';
import { DocumentService } from '../services/document.service';
import { AuthenticatedRequest } from '../middleware/auth.middleware';

const documentService = new DocumentService();

export class DocumentController {

    async upload(
        req: AuthenticatedRequest,
        res: Response
    ): Promise<void> {

        try {

            // =========================================================
            // 1. AUTENTICAÇÃO
            // =========================================================

            if (!req.user) {
                res.status(401).json({
                    error: 'Usuário não autenticado.'
                });

                return;
            }

            const tenantId = req.user.tenantId;

            // =========================================================
            // 2. VERIFICA O ARQUIVO
            // =========================================================

            const file = req.file;

            if (!file) {
                res.status(400).json({
                    error: 'Nenhum arquivo enviado.'
                });

                return;
            }

            // =========================================================
            // 3. VALIDA SE É PDF
            // =========================================================

            if (file.mimetype !== 'application/pdf') {

                res.status(400).json({
                    error: 'Somente arquivos PDF são permitidos.'
                });

                return;
            }

            console.log(
                `📄 Novo catálogo recebido pelo tenant ${tenantId}: ${file.originalname}`
            );

            console.log(
                `📁 Arquivo temporário criado pelo Multer: ${file.path}`
            );

            // =========================================================
            // 4. CRIA O DOCUMENTO
            // =========================================================

            const document =
                await documentService.handleNewUpload(
                    tenantId,

                    // Nome original do catálogo
                    file.originalname,

                    // Caminho REAL criado pelo Multer
                    file.path
                );

            // =========================================================
            // 5. RESPOSTA
            // =========================================================

            res.status(201).json({

                message:
                    'Catálogo recebido com sucesso e enviado para processamento.',

                document: {
                    id: document.id,
                    filename: document.filename,
                    status: document.status,
                    tenantId: document.tenantId
                }

            });

        } catch (error) {

            console.error(
                '❌ Erro no upload do catálogo:',
                error
            );

            res.status(500).json({
                error:
                    'Erro interno ao processar upload.'
            });
        }
    }
}
