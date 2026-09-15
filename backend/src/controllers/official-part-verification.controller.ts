import { Response } from 'express';
import { AuthenticatedRequest } from '../middleware/auth.middleware';
import { normalizeIdentifier } from '../utils/normalize';
import { OfficialPartVerificationService, type VerificationDecision } from '../services/official-part-verification.service';
import {
  parseOptionalVerificationText,
  parseRequiredVerificationCode,
  parseVerificationCodesQuery,
} from '../services/verification-input-validation';

export class OfficialPartVerificationController {
  async list(req: AuthenticatedRequest, res: Response): Promise<void> {
    if (!req.user) return;
    try {
      const codes = parseVerificationCodesQuery(req.query.codes);
      if (codes === null) {
        res.status(400).json({ error: 'Lista de códigos inválida ou muito longa.' });
        return;
      }

      const verifications = await OfficialPartVerificationService.latestForCodes(req.user.tenantId, codes);
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
    try {
      const code = String(req.params.code || '').trim();
      if (!normalizeIdentifier(code)) {
        res.status(400).json({ error: 'Código da peça inválido.' });
        return;
      }
      const history = await OfficialPartVerificationService.history(req.user.tenantId, code);
      res.json({ history });
    } catch (error) {
      console.error('❌ Erro ao consultar histórico de conferência:', error);
      res.status(500).json({ error: 'Não foi possível carregar o histórico de conferência.' });
    }
  }

  async create(req: AuthenticatedRequest, res: Response): Promise<void> {
    if (!req.user) return;
    try {
      const queriedPartNumber = parseRequiredVerificationCode(req.body?.queriedPartNumber);
      const currentPartNumber = parseRequiredVerificationCode(req.body?.currentPartNumber);
      const description = parseOptionalVerificationText(req.body?.description, 500);
      const note = parseOptionalVerificationText(req.body?.note, 2000);

      if (!queriedPartNumber || !currentPartNumber) {
        res.status(400).json({ error: 'Código consultado e código atual devem ser textos válidos.' });
        return;
      }
      if (!description.valid || !note.valid) {
        res.status(400).json({ error: 'Descrição ou observação inválida ou muito longa.' });
        return;
      }

      const submission = await OfficialPartVerificationService.submit({
        tenantId: req.user.tenantId,
        userId: req.user.id,
        queriedPartNumber,
        currentPartNumber,
        description: description.value,
        note: note.value,
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
      const decision = typeof req.body?.decision === 'string' ? req.body.decision : '';
      if (decision !== 'APPROVE' && decision !== 'REJECT') {
        res.status(400).json({ error: 'Decisão inválida.' });
        return;
      }
      const reviewNote = parseOptionalVerificationText(req.body?.note, 1000);
      if (!reviewNote.valid) {
        res.status(400).json({ error: 'Observação de revisão inválida ou muito longa.' });
        return;
      }
      const submission = await OfficialPartVerificationService.decide({
        tenantId: req.user.tenantId,
        userId: req.user.id,
        verificationId: String(req.params.id || ''),
        decision: decision as VerificationDecision,
        reviewNote: reviewNote.value,
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
