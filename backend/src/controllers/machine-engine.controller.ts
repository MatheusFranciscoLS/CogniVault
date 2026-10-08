import { Response } from 'express';
import { AuthenticatedRequest } from '../middleware/auth.middleware';
import { baseEnginesForMachine, enginesCitedByPortal, enginesFromListingSpec, mergeEngineHints } from '../services/machine-base-engine';
import { prisma } from '../config/prisma';
import { normalizeIdentifier } from '../utils/normalize';
import { HusqvarnaOfficialDetailService } from '../services/husqvarna-official-detail.service';
import { husqvarnaArticleIdCandidates } from '../utils/husqvarna-article-id';

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
    const pnc = String(req.query.pnc || '').trim().slice(0, 20);

    // O Portal cita o motor no IPL da máquina, por PNC. Sem PNC (ou com o Portal fora do ar) fica só o vínculo da loja.
    let cited: ReturnType<typeof enginesCitedByPortal> = [];
    for (const candidate of husqvarnaArticleIdCandidates(pnc)) {
      const details = await HusqvarnaOfficialDetailService.getProductDetails(candidate).catch(() => null);
      if (details) {
        cited = enginesCitedByPortal(details, pnc || null);
        break;
      }
    }

    // A ficha da lista vigente (campo "Motor"): linha atual da Husqvarna. Casa pelo PNC de 9 dígitos e, sem ele, pelo modelo.
    let fromList: ReturnType<typeof enginesFromListingSpec> = [];
    try {
      const listed = await prisma.machineListing.findMany({ where: { tenantId: req.user.tenantId }, select: { model: true, normalizedPnc: true, specs: true } });
      const key = normalizeIdentifier(pnc).slice(0, 9);
      const modelKey = normalizeIdentifier(model);
      const hit = (key.length === 9 ? listed.find(item => item.normalizedPnc.startsWith(key)) : undefined)
        ?? listed.find(item => modelKey.includes(normalizeIdentifier(item.model)) && normalizeIdentifier(item.model).length >= 4);
      const motor = Array.isArray(hit?.specs) ? (hit?.specs as Array<{ label?: string; value?: string }>).find(spec => spec.label === 'Motor')?.value : null;
      fromList = enginesFromListingSpec(motor);
    } catch (error) {
      // Lista fora do ar não derruba o painel da máquina: sobram o Portal e o vínculo da loja.
      console.warn('[MachineEngine] Ficha da lista indisponível:', error instanceof Error ? error.message : error);
    }

    res.set('Cache-Control', 'private, max-age=600');
    res.json({ engines: mergeEngineHints(cited, fromList, baseEnginesForMachine(model)) });
  }
}

export const machineEngineController = new MachineEngineController();
