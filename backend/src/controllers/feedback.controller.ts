import { Response } from 'express';
import { AuthenticatedRequest } from '../middleware/auth.middleware';
import { FeedbackService } from '../services/feedback.service';

const ALLOWED_REASONS = ['WRONG_CODE', 'WRONG_PNC', 'WRONG_MODEL', 'WRONG_PART', 'OTHER'];

export class FeedbackController {
    async create(req: AuthenticatedRequest, res: Response): Promise<void> {
        try {
            if (!req.user) {
                res.status(401).json({ error: 'Usuário não autenticado.' });
                return;
            }

            const { query, partId, correct, correctedPartId, pnc, reason } = req.body;

            if (typeof query !== 'string' || !query.trim()) {
                res.status(400).json({ error: 'Consulta original inválida.' });
                return;
            }
            if (typeof partId !== 'string' || !partId.trim()) {
                res.status(400).json({ error: 'Peça avaliada inválida.' });
                return;
            }
            if (typeof correct !== 'boolean') {
                res.status(400).json({ error: 'O campo correct deve ser true ou false.' });
                return;
            }
            if (correctedPartId !== undefined && typeof correctedPartId !== 'string') {
                res.status(400).json({ error: 'Peça corrigida inválida.' });
                return;
            }
            if (reason !== undefined && (typeof reason !== 'string' || !ALLOWED_REASONS.includes(reason))) {
                res.status(400).json({ error: 'Motivo do feedback inválido.' });
                return;
            }

            const result = await FeedbackService.register({
                tenantId: req.user.tenantId,
                userId: req.user.id,
                query: query.trim(),
                resultPartId: partId.trim(),
                correct,
                correctedPartId: typeof correctedPartId === 'string' && correctedPartId.trim() ? correctedPartId.trim() : undefined,
                pnc: typeof pnc === 'string' ? pnc.trim() : undefined,
                reason: !correct && typeof reason === 'string' ? reason : undefined,
            });

            res.status(201).json({
                message: correct ? 'Feedback positivo salvo.' : 'Feedback negativo salvo. A informação será considerada no ranking de buscas semelhantes.',
                ...result,
            });
        } catch (error) {
            console.error('❌ Erro ao salvar feedback:', error);
            res.status(500).json({ error: error instanceof Error ? error.message : 'Erro ao salvar feedback.' });
        }
    }
}
