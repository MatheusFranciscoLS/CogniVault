import { Response } from 'express';
import { AuthenticatedRequest } from '../middleware/auth.middleware';
import { normalizeIdentifier } from '../utils/normalize';
import { OfficialPartVerificationService, type VerificationDecision } from '../services/official-part-verification.service';

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

  async pending(req: AuthenticatedRequest, res: Response): Promise<void> {
    if (!req.user) return;
    try {
      const submissions = await OfficialPartVerificationService.pending(req.user.tenantId);
      res.json({ submissions });
    } catch (error) {
      console.error('❌ Erro ao listar verificações pendentes:', error);
      res.status(500).json({ error: 'Não foi possível carregar as verificações pendentes.' });
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
      const queriedPartNumber = String(req.body.queriedPartNumber || '').trim();
      const currentPartNumber = String(req.body.currentPartNumber || '').trim();
      const description = typeof req.body.description === 'string' ? req.body.description : null;
      const note = typeof req.body.note === 'string' ? req.body.note : null;

      if (!queriedPartNumber || !currentPartNumber) {
        res.status(400).json({ error: 'Código consultado e código atual são obrigatórios.' });
        return;
      }

      const submission = await OfficialPartVerificationService.submit({
        tenantId: req.user.tenantId,
        userId: req.user.id,
        queriedPartNumber,
        currentPartNumber,
        description,
        note,
      });
      res.status(201).json({
        message: 'Conferência registrada e enviada para aprovação do Administrador.',
        submission,
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : '';
      if (message === 'VERIFICATION_ALREADY_PENDING') {
        res.status(409).json({ error: 'Já existe uma conferência igual aguardando aprovação.' });
        return;
      }
      if (message === 'VERIFICATION_ALREADY_FRESH') {
        res.status(409).json({ error: 'Esta relação já foi aprovada recentemente e está válida no cache oficial. Uma nova conferência será aceita quando a revisão vencer.' });
        return;
      }
      res.status(400).json({ error: message || 'Não foi possível enviar a conferência para aprovação.' });
    }
  }

  async decision(req: AuthenticatedRequest, res: Response): Promise<void> {
    if (!req.user) return;
    try {
      const decision = String(req.body.decision || '') as VerificationDecision;
      if (decision !== 'APPROVE' && decision !== 'REJECT') {
        res.status(400).json({ error: 'Decisão inválida.' });
        return;
      }
      const reviewNote = typeof req.body.note === 'string' ? req.body.note : null;
      const submission = await OfficialPartVerificationService.decide({
        tenantId: req.user.tenantId,
        userId: req.user.id,
        verificationId: String(req.params.id || ''),
        decision,
        reviewNote,
      });
      res.json({
        message: decision === 'APPROVE'
          ? 'Conferência aprovada. A regra oficial já pode ser usada nas buscas.'
          : 'Conferência rejeitada. Nenhuma regra oficial foi alterada.',
        submission,
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : '';
      if (message === 'VERIFICATION_NOT_FOUND') {
        res.status(404).json({ error: 'Conferência não encontrada.' });
        return;
      }
      if (message === 'VERIFICATION_ALREADY_REVIEWED') {
        res.status(409).json({ error: 'Esta conferência já foi revisada.' });
        return;
      }
      res.status(400).json({ error: message || 'Não foi possível revisar a conferência.' });
    }
  }
}
