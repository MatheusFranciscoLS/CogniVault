import { Response } from 'express';
import { prisma } from '../config/prisma';
import { AuthenticatedRequest } from '../middleware/auth.middleware';
import { feedbackLearningStage, feedbackReasonCounts } from '../services/admin-feedback-summary';

export class AdminFeedbackSummaryController {
  async list(req: AuthenticatedRequest, res: Response): Promise<void> {
    try {
      if (!req.user) return;
      const tenantId = req.user.tenantId;

      const [
        feedback,
        total,
        positive,
        corrected,
        reasonGroups,
        uniqueSignalRows,
      ] = await Promise.all([
        prisma.searchFeedback.findMany({
          where: { tenantId },
          orderBy: { createdAt: 'desc' },
          take: 1000,
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
        }),
        prisma.searchFeedback.count({ where: { tenantId } }),
        prisma.searchFeedback.count({ where: { tenantId, correct: true } }),
        prisma.searchFeedback.count({
          where: { tenantId, correct: false, correctedPartId: { not: null } },
        }),
        prisma.searchFeedback.groupBy({
          by: ['reason'],
          where: { tenantId, reason: { not: null } },
          _count: { _all: true },
        }),
        prisma.$queryRaw<Array<{ count: number }>>`
          SELECT COUNT(*)::int AS "count"
          FROM (
            SELECT DISTINCT
              COALESCE("userId", 'legacy:' || "id") AS "actorKey",
              "normalizedQuery",
              "resultPartId",
              COALESCE("correctedPartId", '') AS "correctedPartId",
              "correct"
            FROM "SearchFeedback"
            WHERE "tenantId" = ${tenantId}
          ) AS "signals"
        `,
      ]);

      const uniqueSignals = Number(uniqueSignalRows[0]?.count || 0);
      const reasons = feedbackReasonCounts(reasonGroups.map((row) => ({
        reason: row.reason,
        count: row._count._all,
      })));
      const learning = feedbackLearningStage(uniqueSignals);

      res.json({
        summary: {
          total,
          uniqueSignals,
          positive,
          corrected,
          negativeWithoutCorrection: total - positive - corrected,
          accuracy: total ? positive / total : null,
          reasons,
          learningLevel: learning.learningLevel,
          nextMilestone: learning.nextMilestone,
        },
        feedback,
      });
    } catch (error) {
      console.error('❌ Erro ao listar histórico de feedback:', error);
      res.status(500).json({ error: 'Não foi possível carregar a lista de feedbacks.' });
    }
  }
}
