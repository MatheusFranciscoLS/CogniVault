import { Response } from 'express';
import { AuthenticatedRequest } from '../middleware/auth.middleware';
import { EnginePartsWithoutPriceService } from '../services/engine-parts-without-price.service';

/** Painel do dono (Negócio): peças de motor lidas dos catálogos que a loja não tem com preço. Só administrador. */
export class EnginePartsWithoutPriceController {
  async list(req: AuthenticatedRequest, res: Response): Promise<void> {
    if (!req.user) return;
    const limit = Number(req.query.limit);
    const result = await EnginePartsWithoutPriceService.list(req.user.tenantId, Number.isFinite(limit) ? limit : 100);
    res.set('Cache-Control', 'private, max-age=60');
    res.json(result);
  }
}

export const enginePartsWithoutPriceController = new EnginePartsWithoutPriceController();
