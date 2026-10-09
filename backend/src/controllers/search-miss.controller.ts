import { Response } from 'express';
import { AuthenticatedRequest } from '../middleware/auth.middleware';
import { SearchMissService, recordableMissQuery } from '../services/search-miss.service';

/** Registro das buscas sem resultado: qualquer usuário logado registra (o balcão), só o administrador lê e dispensa. */
export class SearchMissController {
  async record(req: AuthenticatedRequest, res: Response): Promise<void> {
    if (!req.user) return;
    if (!recordableMissQuery(req.body?.query)) {
      res.status(400).json({ error: 'Texto da busca inválido.' });
      return;
    }
    // Não espera o banco: o balcão não precisa esperar um registro estatístico.
    void SearchMissService.record(req.user.tenantId, req.body.query);
    res.status(202).json({ ok: true });
  }

  async list(req: AuthenticatedRequest, res: Response): Promise<void> {
    if (!req.user) return;
    const result = await SearchMissService.top(req.user.tenantId, Number(req.query.days), Number(req.query.limit));
    res.set('Cache-Control', 'private, no-store').json(result);
  }

  async dismiss(req: AuthenticatedRequest, res: Response): Promise<void> {
    if (!req.user) return;
    const removed = await SearchMissService.dismiss(req.user.tenantId, String(req.params.id));
    if (!removed) {
      res.status(404).json({ error: 'Busca não encontrada.' });
      return;
    }
    res.json({ ok: true });
  }
}

export const searchMissController = new SearchMissController();
