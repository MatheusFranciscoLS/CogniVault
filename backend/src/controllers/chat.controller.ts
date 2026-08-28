import { Response } from 'express';
import { prisma } from '../config/prisma';
import { AuthenticatedRequest } from '../middleware/auth.middleware';
import { ChatService } from '../services/chat.service';

export class ChatController {
    async ask(req: AuthenticatedRequest, res: Response): Promise<void> {
        try {
            if (!req.user) {
                res.status(401).json({ error: 'Usuário não autenticado.' });
                return;
            }

            const { question, pnc, selectedPartId } = req.body;

            if (typeof question !== 'string' || !question.trim()) {
                res.status(400).json({ error: 'A pergunta não pode estar vazia.' });
                return;
            }

            if (pnc !== undefined && typeof pnc !== 'string') {
                res.status(400).json({ error: 'PNC inválido.' });
                return;
            }

            if (selectedPartId !== undefined && (typeof selectedPartId !== 'string' || !selectedPartId.trim() || selectedPartId.length > 100)) {
                res.status(400).json({ error: 'Seleção de peça inválida.' });
                return;
            }

            const cleanQuestion = question.trim();
            const cleanPnc = typeof pnc === 'string' ? pnc.trim() : undefined;
            const cleanSelectedPartId = typeof selectedPartId === 'string' ? selectedPartId.trim() : undefined;
            const result = await ChatService.askQuestion(req.user.tenantId, cleanQuestion, cleanPnc, cleanSelectedPartId);

            await prisma.searchHistory.create({
                data: {
                    tenantId: req.user.tenantId,
                    userId: req.user.id,
                    query: cleanQuestion,
                    pnc: cleanPnc || undefined,
                    status: result.status,
                    resultPartId: result.part?.id,
                    resultLabel: result.part?.name,
                    resultCode: result.part?.partNumber,
                    resultModel: result.part?.model,
                    resultPnc: result.part?.pnc,
                    sourceFilename: result.part?.filename,
                },
            });

            res.status(200).json(result);
        } catch (error) {
            console.error('❌ Erro no Chat:', error);
            res.status(500).json({ error: 'Erro interno ao processar a pergunta.' });
        }
    }
}
