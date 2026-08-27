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
                correct: true,
                reason: true,
                pnc: true,
                createdAt: true,
                user: { select: { email: true } },
                resultPart: { select: { name: true, partNumber: true, model: true } },
                correctedPart: { select: { name: true, partNumber: true, model: true } },
            },
        });

        const total = feedback.length;
        const correct = feedback.filter((item) => item.correct).length;
        const reasons = feedback.reduce<Record<string, number>>((acc, item) => {
            if (item.reason) acc[item.reason] = (acc[item.reason] || 0) + 1;
            return acc;
        }, {});

        res.json({
            summary: { total, accuracy: total ? correct / total : null, reasons },
            feedback,
        });
    }
}
