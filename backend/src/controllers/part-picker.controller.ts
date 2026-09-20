import { Response } from 'express';
import { AuthenticatedRequest } from '../middleware/auth.middleware';
import { PartPickerService } from '../services/part-picker.service';

/**
 * Palpite de peça a partir da descrição do cliente, dentro de UMA máquina.
 *
 * Rota separada da busca de propósito. A busca tem teto de 8s e precisa
 * responder rápido com o que é certo; isto é o último recurso, só depois de o
 * caminho determinístico não achar nada, e o atendente já está vendo a vista
 * explodida enquanto chega.
 *
 * Sempre 200, inclusive vazio: "não sei" é resposta legítima aqui e a tela
 * simplesmente não mostra a faixa. Ver services/part-picker.service.ts.
 */
export class PartPickerController {
  async guess(req: AuthenticatedRequest, res: Response): Promise<void> {
    if (!req.user) return;

    const model = String(req.query.model || '').trim().slice(0, 60);
    const query = String(req.query.q || '').trim().slice(0, 160);

    try {
      const guesses = await PartPickerService.guess(req.user.tenantId, model, query);
      res.set('Cache-Control', 'private, no-store');
      res.json({ guesses });
    } catch (error) {
      // "Não sei" é resposta legítima aqui, e a tela cai na vista explodida.
      // Derrubar o processo por causa do último recurso da busca seria trocar
      // um "não achei" por um servidor reiniciando.
      console.error('❌ Erro no palpite de peça:', error);
      res.set('Cache-Control', 'private, no-store');
      res.json({ guesses: [] });
    }
  }
}

export const partPickerController = new PartPickerController();
