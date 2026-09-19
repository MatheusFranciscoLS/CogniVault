import { Response } from 'express';
import { AuthenticatedRequest } from '../middleware/auth.middleware';
import { KawasakiPartStreamService } from '../services/kawasaki-partstream.service';

/**
 * Catálogo de peças Kawasaki para o balcão.
 *
 * Duas rotas em vez de uma: os conjuntos de um motor (17 no FX921V-ES06) são
 * baratos e vêm de uma vez; as peças de cada conjunto são 30+ linhas e o
 * atendente abre **um** conjunto por atendimento. Resolver os 17 de uma vez
 * seriam 17 chamadas externas para jogar 16 fora.
 *
 * Nenhuma das duas responde erro por falta de catálogo: sem catálogo, a tela
 * mostra o link da busca oficial. É a regra que o dono deu — *"se não deu um
 * retorno com o código, pelo menos dê um retorno com a vista explodida"*.
 */
export class KawasakiController {
  /** Conjuntos do motor, cada um com o link da vista explodida. */
  async engine(req: AuthenticatedRequest, res: Response): Promise<void> {
    if (!req.user) return;

    const model = String(req.query.model || '').trim();
    const catalog = await KawasakiPartStreamService.forModel(model);

    res.set('Cache-Control', 'private, max-age=600');
    res.json({ kawasaki: catalog });
  }

  /**
   * Um conjunto aberto: a tabela de peças E o desenho com as posições.
   *
   * O `slug` vem da resposta de `engine`, nunca montado pela tela.
   */
  async assembly(req: AuthenticatedRequest, res: Response): Promise<void> {
    if (!req.user) return;

    const slug = String(req.query.slug || '').trim();
    // Rótulos para o índice de busca. Limitados no tamanho porque viram linha
    // no banco; vazios, a leitura funciona e nada é indexado.
    const model = String(req.query.model || '').trim().slice(0, 60);
    const assembly = String(req.query.assembly || '').trim().slice(0, 120);
    const detail = await KawasakiPartStreamService.assemblyDetail(slug, model, assembly);

    res.set('Cache-Control', 'private, max-age=600');
    res.json({ assembly: detail });
  }
}

export const kawasakiController = new KawasakiController();
