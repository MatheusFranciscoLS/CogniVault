import { Response } from 'express';
import { AuthenticatedRequest } from '../middleware/auth.middleware';
import { MachineServicePartsService } from '../services/machine-service-parts.service';

/** Peças de revisão da máquina aberta no balcão. Qualquer usuário logado lê; quem grava é a atualização da lista (administrador). */
export class MachineServicePartsController {
  async list(req: AuthenticatedRequest, res: Response): Promise<void> {
    if (!req.user) return;
    const parts = await MachineServicePartsService.forPnc(req.user.tenantId, req.params.pnc);
    res.set('Cache-Control', 'private, no-cache').json({ parts });
  }
}

export const machineServicePartsController = new MachineServicePartsController();
