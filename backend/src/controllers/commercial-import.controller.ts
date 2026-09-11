import { Response } from 'express';
import { prisma } from '../config/prisma';
import { AuthenticatedRequest } from '../middleware/auth.middleware';

export class CommercialImportController {
  async list(req: AuthenticatedRequest, res: Response): Promise<void> {
    if (!req.user) return;

    try {
      const [runs, masterCount, sectionCount] = await Promise.all([
        prisma.commercialImportRun.findMany({
          where: { tenantId: req.user.tenantId },
          orderBy: { startedAt: 'desc' },
          take: 30,
          select: {
            id: true,
            sourceFilename: true,
            sourceHash: true,
            priceDivisor: true,
            occurrenceCount: true,
            masterCount: true,
            sectionCount: true,
            status: true,
            error: true,
            startedAt: true,
            completedAt: true,
          },
        }),
        prisma.masterPart.count({ where: { tenantId: req.user.tenantId } }),
        prisma.masterPartSection.count({ where: { tenantId: req.user.tenantId } }),
      ]);

      res.status(200).json({
        commercialImports: {
          current: {
            masterCount,
            sectionCount,
          },
          runs,
        },
      });
    } catch (error) {
      console.error('❌ Erro ao carregar histórico de importações comerciais:', error);
      res.status(500).json({ error: 'Não foi possível carregar o histórico de importações comerciais.' });
    }
  }
}
