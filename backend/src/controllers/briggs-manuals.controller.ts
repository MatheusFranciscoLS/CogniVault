import { Response } from 'express';
import { AuthenticatedRequest } from '../middleware/auth.middleware';
import { BriggsManualsService } from '../services/briggs-manuals.service';
import { isBriggsIplUrl } from '../utils/briggs-manuals';

/**
 * Lista de peças do motor Briggs.
 *
 * Rota própria em vez de campo na listagem de catálogos: aquela listagem monta
 * dezenas de itens de uma vez, e resolver isto ali custaria uma chamada externa
 * por item. Aqui a chamada acontece quando o atendente abre o motor, que é
 * quando ela vale.
 */
export class BriggsManualsController {
  async partsManuals(req: AuthenticatedRequest, res: Response): Promise<void> {
    if (!req.user) return;

    const model = String(req.query.model || '').trim();
    const result = await BriggsManualsService.forModel(model);

    // Sempre 200, inclusive sem catálogo. O balcão não tem o que fazer com um
    // erro aqui: ou existe lista de peças e aparece o botão, ou não existe e a
    // tela diz isso. `BriggsManualsService` nunca lança pelo mesmo motivo.
    res.set('Cache-Control', 'private, max-age=300');
    res.json({ briggs: result });
  }

  /**
   * Abre o PDF da lista de peças, preferindo inglês.
   *
   * Redirect do servidor em vez de `fetch` + `window.open` na tela: assim o
   * botão do balcão é um `<a target="_blank">` puro. Com JS, a aba abriria
   * depois do `await` e o navegador trataria como pop-up não solicitado.
   */
  async openPartsManual(req: AuthenticatedRequest, res: Response): Promise<void> {
    if (!req.user) return;

    const model = String(req.query.model || '').trim();
    const result = await BriggsManualsService.forModel(model);
    // `partsManuals` já vem com o inglês na frente.
    const target = result.partsManuals[0]?.url;

    // A URL nasce de uma constante do próprio módulo, mas a checagem fica aqui
    // de propósito: é o último ponto antes de o navegador seguir o redirect, e
    // redirecionar para o que vier é open redirect.
    if (!target || !isBriggsIplUrl(target)) {
      res.status(404).json({
        error: 'A Briggs não publica lista de peças para este modelo de motor.',
      });
      return;
    }

    res.redirect(302, target);
  }
}

export const briggsManualsController = new BriggsManualsController();
