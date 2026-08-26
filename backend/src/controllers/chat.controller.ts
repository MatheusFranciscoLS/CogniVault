import { Request, Response } from 'express';
import { ChatService } from '../services/chat.service';

export class ChatController {
    async ask(req: Request, res: Response): Promise<void> {
        try {
            const { tenantId, question } = req.body;

            if (!tenantId || !question) {
                res.status(400).json({ error: 'tenantId e question são obrigatórios.' });
                return;
            }

            const answer = await ChatService.askQuestion(tenantId, question);

            res.status(200).json({
                question,
                answer
            });
        } catch (error: any) {
            console.error(error);
            res.status(500).json({
                error: 'Erro interno ao processar a pergunta',
                motivo_real: error.message || String(error) // Adicionamos o dedo-duro aqui!
            });
        }
    }
}