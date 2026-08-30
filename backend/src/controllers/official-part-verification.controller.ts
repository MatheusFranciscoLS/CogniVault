import { Response } from 'express';
import { OfficialVerificationStatus } from '@prisma/client';
import { AuthenticatedRequest } from '../middleware/auth.middleware';
import { normalizeIdentifier } from '../utils/normalize';
import { HusqvarnaPortalService, normalizeHusqvarnaPartNumber } from '../services/husqvarna-portal.service';
import { OfficialPartVerificationService } from '../services/official-part-verification.service';

const ALLOWED_STATUSES = new Set<OfficialVerificationStatus>(['VERIFIED', 'SUPERSEDED', 'REVIEW']);

export class OfficialPartVerificationController {
  async list(req: AuthenticatedRequest, res: Response): Promise<void> {
    if (!req.user) return;
    try {
      const codes = String(req.query.codes || '')
        .split(',')
        .map(code => code.trim())
        .filter(code => Boolean(normalizeIdentifier(code)))
        .slice(0, 80);

      const uniqueCodes = [...new Set(codes)];
      const verifications = await OfficialPartVerificationService.latestForCodes(req.user.tenantId, uniqueCodes);
      res.json({ verifications });
    } catch (error) {
      res.status(400).json({ error: error instanceof Error ? error.message : 'Não foi possível consultar as verificações.' });
    }
  }

  async portalLookup(req: AuthenticatedRequest, res: Response): Promise<void> {
    if (!req.user) return;
    const code = String(req.params.code || '').trim();
    if (!normalizeHusqvarnaPartNumber(code)) {
      res.status(400).json({ error: 'Código da peça inválido.' });
      return;
    }

    try {
      const lookup = await HusqvarnaPortalService.lookup(code);
      res.json({ lookup });
    } catch (error) {
      res.status(502).json({
        error: error instanceof Error
          ? error.message
          : 'Não foi possível consultar a página pública do Portal Husqvarna.',
      });
    }
  }

  async history(req: AuthenticatedRequest, res: Response): Promise<void> {
    if (!req.user) return;
    const code = String(req.params.code || '').trim();
    if (!normalizeIdentifier(code)) {
      res.status(400).json({ error: 'Código da peça inválido.' });
      return;
    }
    const history = await OfficialPartVerificationService.history(req.user.tenantId, code);
    res.json({ history });
  }

  async create(req: AuthenticatedRequest, res: Response): Promise<void> {
    if (!req.user) return;
    try {
      const status = String(req.body.status || '') as OfficialVerificationStatus;
      if (!ALLOWED_STATUSES.has(status)) {
        res.status(400).json({ error: 'Estado de verificação inválido.' });
        return;
      }

      const queriedPartNumber = String(req.body.queriedPartNumber || '').trim();
      const currentPartNumber = String(req.body.currentPartNumber || '').trim();
      const officialUrl = String(req.body.officialUrl || '').trim();
      const description = typeof req.body.description === 'string' ? req.body.description : null;
      const note = typeof req.body.note === 'string' ? req.body.note : null;
      const verifiedAt = new Date(String(req.body.verifiedAt || ''));

      if (!queriedPartNumber || !currentPartNumber || !officialUrl) {
        res.status(400).json({ error: 'Código consultado, código atual e URL oficial são obrigatórios.' });
        return;
      }

      const verification = await OfficialPartVerificationService.register({
        tenantId: req.user.tenantId,
        userId: req.user.id,
        status,
        queriedPartNumber,
        currentPartNumber,
        description,
        officialUrl,
        note,
        verifiedAt,
      });
      res.status(201).json({ verification });
    } catch (error) {
      res.status(400).json({ error: error instanceof Error ? error.message : 'Não foi possível registrar a verificação.' });
    }
  }
}
