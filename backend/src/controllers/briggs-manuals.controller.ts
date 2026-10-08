import { Response } from 'express';
import { AuthenticatedRequest } from '../middleware/auth.middleware';
import { BriggsManualsService } from '../services/briggs-manuals.service';
import { isBriggsIplUrl } from '../utils/briggs-manuals';
import { BriggsIplService } from '../services/briggs-ipl.service';
import { briggsManualsSearchUrl } from '../utils/engine-model';

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
   * Peças lidas do PDF, quando o parser tem CERTEZA.
   *
   * Sempre 200: a recusa é resposta legítima e vem com o motivo, porque o
   * balcão precisa saber se vale insistir ou abrir o PDF à mão. Ver
   * `utils/briggs-ipl-text.ts` para os motivos e por que cada um existe.
   */
  async iplParts(req: AuthenticatedRequest, res: Response): Promise<void> {
    if (!req.user) return;

    const model = String(req.query.model || '').trim();
    const outcome = await BriggsIplService.forModel(model);

    res.set('Cache-Control', 'private, max-age=600');
    res.json({ briggsIpl: outcome });
  }

  /**
   * Abre o PDF da lista de peças, preferindo inglês.
   *
   * O servidor ENTREGA o PDF (inline, pela origem do app) em vez de redirecionar para o visualizador da Briggs: para o dono, o redirect
   * caía no site da Briggs e não no arquivo. Continua sendo um `<a target="_blank">` puro na tela, então a aba abre no clique.
   *
   * Se o visualizador não devolve um PDF, o balcão não fica sem saída: vai para a página "Todos os manuais" do motor, que funciona.
   */
  async openPartsManual(req: AuthenticatedRequest, res: Response): Promise<void> {
    if (!req.user) return;

    const model = String(req.query.model || '').trim();
    const result = await BriggsManualsService.forModel(model);
    // `partsManuals` já vem com o inglês na frente.
    const target = result.partsManuals[0]?.url;
    const manualsPage = briggsManualsSearchUrl(model);

    // A URL nasce de uma constante do próprio módulo, mas a checagem fica aqui de propósito: é o último ponto antes de o servidor buscar
    // (ou de o navegador seguir um redirect), e seguir o que vier é open redirect.
    if (!target || !isBriggsIplUrl(target)) {
      if (manualsPage) {
        res.redirect(302, manualsPage);
        return;
      }
      res.status(404).json({ error: 'A Briggs não publica lista de peças para este modelo de motor.' });
      return;
    }

    const pdf = await BriggsIplService.pdfFor(target).catch(() => null);
    if (!pdf) {
      if (manualsPage) {
        res.redirect(302, manualsPage);
        return;
      }
      res.status(502).json({ error: 'A Briggs não devolveu o PDF agora. Tente de novo em instantes.' });
      return;
    }

    const safeName = model.replace(/[^A-Za-z0-9._-]+/g, '_').slice(0, 40) || 'motor';
    res.set({
      'Content-Type': 'application/pdf',
      'Content-Length': String(pdf.length),
      'Content-Disposition': `inline; filename="Lista-de-pecas-${safeName}.pdf"`,
      'Cache-Control': 'private, max-age=3600',
    });
    res.send(pdf);
  }
}

export const briggsManualsController = new BriggsManualsController();
