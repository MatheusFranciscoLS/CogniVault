import { Response } from 'express';
import { AuthenticatedRequest } from '../middleware/auth.middleware';
import { ChatService } from '../services/chat.service';

export class ChatController {
    async ask(req: AuthenticatedRequest, res: Response): Promise<void> {
        try {
            if (!req.user) {
                res.status(401).json({ error: 'Usuário não autenticado.' });
                return;
            }

            const { question, pnc } = req.body;

            if (typeof question !== 'string' || !question.trim()) {
                res.status(400).json({ error: 'A pergunta não pode estar vazia.' });
                return;
            }

            if (pnc !== undefined && typeof pnc !== 'string') {
                res.status(400).json({ error: 'PNC inválido.' });
                return;
            }

            const result = await ChatService.askQuestion(
                req.user.tenantId,
                question.trim(),
                typeof pnc === 'string' ? pnc.trim() : undefined,
            );

            res.status(200).json(result);
        } catch (error) {
            console.error('❌ Erro no Chat:', error);
            res.status(500).json({
                error: 'Erro interno ao processar a pergunta.',
            });
        }
    }
}
