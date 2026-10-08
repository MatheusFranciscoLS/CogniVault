import { Response } from 'express';
import { AuthenticatedRequest } from '../middleware/auth.middleware';
import { baseEnginesForMachine } from '../services/machine-base-engine';

/**
 * Motores de uma máquina (modelo -> motor de base), para o painel da máquina mostrar o motor com a vista explodida.
 * Sempre responde 200 com lista, vazia quando não há vínculo: a tela fica em silêncio.
 */
export class MachineEngineController {
  async list(req: AuthenticatedRequest, res: Response): Promise<void> {
    if (!req.user) return;
    const model = String(req.query.model || '').trim();
    if (!model || model.length > 160) {
      res.status(400).json({ error: 'Modelo de máquina inválido.' });
      return;
    }
    res.set('Cache-Control', 'private, max-age=600');
    res.json({ engines: baseEnginesForMachine(model) });
  }
}

export const machineEngineController = new MachineEngineController();
