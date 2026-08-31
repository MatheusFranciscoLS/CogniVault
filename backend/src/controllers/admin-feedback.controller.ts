import { Response } from 'express';
import { prisma } from '../config/prisma';
import { AuthenticatedRequest } from '../middleware/auth.middleware';

export class AdminFeedbackController {
    async list(req: AuthenticatedRequest, res: Response): Promise<void> {
        if (!req.user) return;

        const feedback = await prisma.searchFeedback.findMany({
            where: { tenantId: req.user.tenantId },
            orderBy: { createdAt: 'desc' },
            take: 200,
            select: {
                id: true,
                query: true,
                normalizedQuery: true,
                correct: true,
                reason: true,
                pnc: true,
                resultPartId: true,
                correctedPartId: true,
                createdAt: true,
                user: { select: { id: true, email: true } },
                resultPart: { select: { name: true, partNumber: true, model: true } },
                correctedPart: { select: { name: true, partNumber: true, model: true } },
            },
        });

        const total = feedback.length;
        const correct = feedback.filter((item) => item.correct).length;
        const corrected = feedback.filter((item) => !item.correct && item.correctedPartId).length;
        const uniqueSignals = new Set(feedback.map((item) => [
            item.user?.id || `legacy:${item.id}`,
            item.normalizedQuery,
            item.resultPartId,
            item.correctedPartId || '',
            item.correct ? '1' : '0',
        ].join('|'))).size;
        const learningLevel = uniqueSignals >= 20 ? 'ESTABLISHED' : uniqueSignals >= 5 ? 'LEARNING' : 'COLD_START';
        const reasons = feedback.reduce<Record<string, number>>((acc, item) => {
            if (item.reason) acc[item.reason] = (acc[item.reason] || 0) + 1;
            return acc;
        }, {});

        res.json({
            summary: {
                total,
                uniqueSignals,
                positive: correct,
                corrected,
                negativeWithoutCorrection: total - correct - corrected,
                accuracy: total ? correct / total : null,
                reasons,
                learningLevel,
                nextMilestone: learningLevel === 'COLD_START' ? 5 : learningLevel === 'LEARNING' ? 20 : null,
            },
            feedback,
        });
    }
}
