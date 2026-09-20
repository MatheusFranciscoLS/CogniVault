import { Response } from 'express';
import { AuthenticatedRequest } from '../middleware/auth.middleware';
import { OfficialPartIndexService } from '../services/official-part-index.service';

/**
 * "O cliente chegou com este código — o que é e de que motor?"
 *
 * Responde com o que já foi lido do catálogo oficial de Briggs e Kawasaki em
 * atendimentos anteriores. É o caminho inverso do resto do produto, que só
 * sabia ir de máquina para peça.
 *
 * **Não consulta o fabricante.** É leitura do índice local: sem custo externo,
 * sem espera, e por isso pode entrar na busca do balcão sem nenhum gatilho.
 */
export class OfficialPartIndexController {
  async byCode(req: AuthenticatedRequest, res: Response): Promise<void> {
    if (!req.user) return;

    const code = String(req.query.code || '').trim().slice(0, 40);
    try {
      const hits = await OfficialPartIndexService.byCode(code);
      // Sempre 200, inclusive vazio: "não achei" é resposta legítima aqui e a
      // tela simplesmente não mostra a seção.
      res.set('Cache-Control', 'private, max-age=120');
      res.json({ officialParts: hits });
    } catch (error) {
      // `byCode` já engole erro de banco, mas a garantia da rota não pode
      // depender do serviço: é ela que o Express deixa rejeitar.
      console.error('❌ Erro ao consultar o índice oficial:', error);
      res.set('Cache-Control', 'private, no-store');
      res.json({ officialParts: [] });
    }
  }
}

export const officialPartIndexController = new OfficialPartIndexController();
