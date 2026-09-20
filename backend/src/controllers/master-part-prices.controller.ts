import { Response } from 'express';
import { prisma } from '../config/prisma';
import { AuthenticatedRequest } from '../middleware/auth.middleware';
import { normalizeIdentifier } from '../utils/normalize';
import { priceFreshness, type PriceFreshness } from '../utils/price-freshness';

/**
 * Preço da lista comercial para VÁRIOS códigos de uma vez.
 *
 * Existe porque o catálogo do fabricante e o preço da loja moram em lados
 * diferentes: a Kawasaki e a Briggs devolvem a lista de peças com código,
 * posição e descrição, mas **preço nenhuma das duas dá** — ele vem do Portal
 * Parceiro ou da planilha importada (`master_parts`). Até aqui o atendente
 * achava `592358 GASKET, Cylinder Head` e precisava começar outra busca só para
 * saber quanto custa, com o cliente esperando.
 *
 * Em lote, e não uma consulta por peça, porque um catálogo de motor Briggs traz
 * 150–280 linhas. Uma chamada por linha seriam 280 idas ao Render free; aqui é
 * **um** `SELECT` que cai inteiro no índice `(tenantId, normalizedNumber)` que
 * já existe.
 *
 * `POST` por causa do tamanho: 280 códigos numa query string passam de 3 KB e
 * esbarram em limite de URL de proxy. Continua sendo leitura — não grava nada.
 */

/**
 * Teto de códigos por chamada. O maior catálogo medido tem 283 linhas
 * (`09P702-0212-F1`); 400 dá folga sem abrir espaço para alguém varrer a lista
 * de preços inteira num pedido só.
 */
const MAX_CODES = 400;

export class MasterPartPricesController {
  async byCodes(req: AuthenticatedRequest, res: Response): Promise<void> {
    if (!req.user) return;

    const body = req.body as { codes?: unknown };
    if (!Array.isArray(body?.codes)) {
      res.status(400).json({ error: 'Envie a lista de códigos em "codes".' });
      return;
    }

    // Normaliza do mesmo jeito que a gravação da peça e a busca por código:
    // maiúscula, sem traço e sem espaço. É o que faz `587 10 67-01` da etiqueta
    // e `587106701` da lista comercial serem a mesma chave.
    const normalized = [...new Set(
      body.codes
        .filter((code): code is string => typeof code === 'string')
        .map(code => normalizeIdentifier(code))
        .filter(code => code.length >= 4),
    )];

    if (!normalized.length) {
      res.json({ prices: {} });
      return;
    }
    if (normalized.length > MAX_CODES) {
      res.status(400).json({ error: `Máximo de ${MAX_CODES} códigos por consulta.` });
      return;
    }

    try {
    const rows = await prisma.masterPart.findMany({
      where: { tenantId: req.user.tenantId, normalizedNumber: { in: normalized } },
      select: {
        normalizedNumber: true,
        partNumber: true,
        name: true,
        price: true,
        stock: true,
        location: true,
        lastPurchaseAt: true,
      },
    });

    type PriceHit = {
      partNumber: string;
      name: string;
      price: number | null;
      stock: number | null;
      location: string | null;
      freshness: PriceFreshness;
    };

    const prices: Record<string, PriceHit> = {};
    for (const row of rows) {
      prices[row.normalizedNumber] = {
        partNumber: row.partNumber,
        name: row.name,
        price: row.price,
        stock: row.stock,
        location: row.location,
        // A classificação sai do servidor, não da tela: é a data da compra
        // comparada ao mês da LOJA, e o navegador do atendente está no fuso
        // dele, não no da loja. Ver utils/price-freshness.ts.
        freshness: priceFreshness(row.lastPurchaseAt),
      };
    }

    // A peça que existe no cadastro **sem** preço é resposta diferente da peça
    // que não está cadastrada, e a tela mostra as duas coisas de formas
    // diferentes: "sem preço" é falha de cadastro que o dono pode corrigir;
    // ausência é peça que a loja não vende. Por isso o registro entra no mapa
    // mesmo com `price: null`.
    res.set('Cache-Control', 'private, no-store');
    res.json({ prices });
    } catch (error) {
      // Sem isto, banco fora virava `unhandledRejection` e o `server.ts`
      // desligava o processo — o atendente veria "Preparando o servidor" por
      // causa de uma consulta de preço. Mapa vazio degrada certo: a lista de
      // peças continua na tela, só sem o preço ao lado.
      console.error('❌ Erro ao buscar preço em lote:', error);
      res.set('Cache-Control', 'private, no-store');
      res.json({ prices: {} });
    }
  }
}

export const masterPartPricesController = new MasterPartPricesController();
