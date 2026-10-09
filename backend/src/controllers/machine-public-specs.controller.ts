import { Response } from 'express';
import { AuthenticatedRequest } from '../middleware/auth.middleware';
import { HusqvarnaPublicSpecsService } from '../services/husqvarna-public-specs.service';

/** Uso recomendado da máquina da lista segundo o site público da Husqvarna, para o orçamento. Qualquer usuário logado lê; sem dado, responde `{ use: null }`. */
export class MachinePublicSpecsController {
  async get(req: AuthenticatedRequest, res: Response): Promise<void> {
    if (!req.user) return;
    const use = await HusqvarnaPublicSpecsService.useForPnc(String(req.params.pnc));
    res.set('Cache-Control', 'private, max-age=3600').json({ use });
  }
}

export const machinePublicSpecsController = new MachinePublicSpecsController();
