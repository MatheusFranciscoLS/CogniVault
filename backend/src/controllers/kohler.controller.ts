import { Response } from 'express';
import { AuthenticatedRequest } from '../middleware/auth.middleware';
import { KohlerCatalogService } from '../services/kohler-catalog.service';
import { normalizeKohlerSpec } from '../utils/kohler-catalog';

/**
 * Catálogo de peças Kohler para o balcão, no mesmo desenho da Kawasaki: os grupos do motor vêm de uma vez e as peças de cada grupo
 * só quando o atendente abre um. Nenhuma das duas rotas responde erro por falta de catálogo: sem catálogo, a tela mostra o link da
 * busca oficial (regra do dono: "se não deu um retorno com o código, pelo menos dê a vista explodida").
 */
export class KohlerController {
  async engine(req: AuthenticatedRequest, res: Response): Promise<void> {
    if (!req.user) return;
    const spec = normalizeKohlerSpec(String(req.query.model || ''));
    if (!spec) {
      res.status(400).json({ error: 'Spec Kohler inválido. Use o formato da plaqueta, por exemplo SV540-3212.' });
      return;
    }
    const catalog = await KohlerCatalogService.forSpec(spec);
    res.set('Cache-Control', 'private, max-age=600');
    res.json({ kohler: catalog });
  }

  async group(req: AuthenticatedRequest, res: Response): Promise<void> {
    if (!req.user) return;
    const spec = normalizeKohlerSpec(String(req.query.model || ''));
    const section = String(req.query.section || '').trim();
    if (!spec || !/^\d{2,4}$/.test(section)) {
      res.status(400).json({ error: 'Spec ou grupo Kohler inválido.' });
      return;
    }
    const group = await KohlerCatalogService.group(spec, section);
    res.set('Cache-Control', 'private, max-age=600');
    res.json({ group });
  }
}

export const kohlerController = new KohlerController();
