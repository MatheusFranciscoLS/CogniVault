import { NextFunction, Response } from 'express';
import { prisma } from '../config/prisma';
import { AuthenticatedRequest } from './auth.middleware';
import { buildFallbackIntent } from '../services/chat-reliability';
import { normalizeIdentifier } from '../utils/normalize';

/**
 * Follow-ups curtos como "e o filtro?" podem reutilizar o PNC de uma resposta
 * técnica recente do MESMO usuário. Nunca deriva PNC apenas pelo modelo e nunca
 * sobrescreve um PNC explicitamente informado na pergunta/body.
 */
export async function chatSessionContextMiddleware(req: AuthenticatedRequest, _res: Response, next: NextFunction) {
  if (!req.user || typeof req.body?.question !== 'string') {
    next();
    return;
  }

  const suppliedPnc = typeof req.body?.pnc === 'string' ? req.body.pnc.trim() : '';
  const intent = buildFallbackIntent(req.body.question);
  if (suppliedPnc || intent.pnc || req.body?.selectedPartId) {
    next();
    return;
  }

  try {
    const recent = await prisma.searchHistory.findFirst({
      where: {
        tenantId: req.user.tenantId,
        userId: req.user.id,
        resultPnc: { not: null },
        createdAt: { gte: new Date(Date.now() - 15 * 60 * 1000) },
      },
      orderBy: { createdAt: 'desc' },
      select: { resultPnc: true },
    });

    const recentPnc = recent?.resultPnc?.trim() || '';
    const normalized = normalizeIdentifier(recentPnc);
    if (normalized && normalized !== 'QUALQUERUM' && normalized !== 'NAOINFORMADO' && normalized !== 'VARIASAPLICACOES') {
      req.body.pnc = recentPnc;
    }
  } catch {
    // Contexto recente é conveniência; indisponibilidade nunca bloqueia a consulta.
  }

  next();
}
